// tests/e2e/group_importacao_dre_conciliacao.mjs
//
// Relatório "Pesquisa de Despesas" do Group num Chromium de verdade: o CSV
// vem em latin1 (TextDecoder do navegador), a prévia mostra o que casou e
// o de-para do que não casou, gravar leva o Group pro DRE (coluna Group +
// Central CP no total do ano e no Excel) e a aba Conciliação aparece.
import { chromium } from 'playwright';
import ExcelJS from 'exceljs';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dirTemporario = mkdtempSync(join(tmpdir(), 'central-cp-e2e-'));
let falhas = 0;
function checar(condicao, mensagem) {
  if (condicao) console.log(`  ✓ ${mensagem}`);
  else { falhas++; console.error(`  ✗ FALHOU: ${mensagem}`); }
}
const checarIgual = (v, esperado, mensagem) => checar(v === esperado, `${mensagem} (esperado ${esperado}, veio ${v})`);

console.log('=== sincronizando app/ a partir do código real ===');
execFileSync('node', ['sync.mjs'], { cwd: __dirname, stdio: 'inherit' });

const { startServer } = await import('./serve.mjs');
const { server, url } = await startServer();

// Ver orcamento_modelo_importacao_dre.mjs: tira o proxy do Chromium e
// serve o CDN (exceljs) pelo lado do Node.
const envSemProxy = { ...process.env };
for (const k of ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'ALL_PROXY', 'all_proxy']) delete envSemProxy[k];

const browser = await chromium.launch({ args: ['--no-sandbox'], env: envSemProxy });
const context = await browser.newContext();
await context.route('https://esm.sh/**', async (route) => {
  try {
    const upstream = await fetch(route.request().url());
    const body = Buffer.from(await upstream.arrayBuffer());
    const headers = {};
    upstream.headers.forEach((v, k) => { headers[k] = v; });
    delete headers['content-encoding']; delete headers['content-length'];
    await route.fulfill({ status: upstream.status, headers, body });
  } catch {
    await route.abort();
  }
});
const page = await context.newPage();
const consoleErros = [];
page.on('pageerror', e => consoleErros.push(e.message));

// CSV no formato do export real (cabeçalho completo, ";", aspas, latin1).
const ano = new Date().getFullYear();
const CAB = ['ID', 'Filial', 'Mes Ref.', 'Empenho', 'Cod. Classe', 'Classe de Conta', 'Cod. CC', 'Centro de Custo', 'Empreendedor', 'Fornecedor', 'Favorecido', 'Valor', 'Vencimento', 'Criação', 'Pagamento', 'Liquidação', 'Juros', 'Multa', 'Correções', 'Taxas', 'Desconto', 'Valor Pago', 'Nº Cont. Corr.', 'Conta Corrente', 'Referencia', 'Conta Débito', 'Tipo Doc Pgto', 'Cheque', 'Talão', 'Nota Fiscal', 'Parcela', 'Situacao', 'Reembolso', 'Movimento', 'Tipo Despesa', 'Descrição', 'Borderô', 'Documento', 'Borderô Elet.', 'Nº Est. Ger.', 'Nº Estorno', 'Linha Digitável', 'Conta Orig.', 'Sistema Origem', 'Compr/Serv', 'Código', 'Categoria'];
const linha = (v) => CAB.map(c => `"${String(v[c] ?? '').replace(/"/g, '""')}"`).join(';');
const base = { Filial: 'BSB', 'Mes Ref.': `03/${ano}`, Vencimento: `15/03/${ano}`, 'Criação': `02/03/${ano}`, Situacao: 'Criada', Categoria: 'Condomínio', 'Descrição': 'Folha de março', Referencia: 'CONDOMÍNIO 01490-2' };
const csv = [CAB.map(c => `"${c}"`).join(';'),
  linha({ ...base, ID: 101, 'Classe de Conta': 'SALARIOS', 'Centro de Custo': 'ADMINISTRATIVO', Fornecedor: 'FOLHA MARÇO', Valor: '1.000,00', Movimento: '500' }),
  linha({ ...base, ID: 102, 'Classe de Conta': 'SALARIOS - INSS 11%', 'Centro de Custo': 'ADMINISTRATIVO', Fornecedor: 'FOLHA MARÇO', Valor: '110,00', Movimento: '500' }),
  linha({ ...base, ID: 103, 'Classe de Conta': 'Pintura Fachada', 'Centro de Custo': 'MANUTENÇÃO PREDIAL', Fornecedor: 'TINTAS SÃO JOSÉ', Valor: '250,50', Movimento: '501' }),
].join('\r\n');
const caminhoCsv = join(dirTemporario, 'Pesquisa_de_Despesas.csv');
writeFileSync(caminhoCsv, Buffer.from(csv, 'latin1'));
// Relatório de receitas (mesmo formato, outro cabeçalho).
const CAB_R = ['ID', 'Mes Ref', 'Classe da Conta', 'Faturado', 'Valor Liquido', 'LUC', 'Sacado', 'Emissão', 'Vencimento', 'Recebimento', 'Situação', 'Conta', 'Categoria'];
const linhaR = (v) => CAB_R.map(c => `"${String(v[c] ?? '').replace(/"/g, '""')}"`).join(';');
const csvR = [CAB_R.map(c => `"${c}"`).join(';'),
  linhaR({ ID: 900, 'Mes Ref': `03/${ano}`, 'Classe da Conta': '*ENCARGO COMUM', Faturado: '5.000,00', 'Valor Liquido': '5.000,00', Sacado: 'LOJA ÁGUIA', 'Emissão': `01/03/${ano} 00:00:00`, Vencimento: `10/03/${ano}`, Recebimento: `10/03/${ano}`, 'Situação': 'Baixada', Categoria: '1 - Condomínio' }),
  linhaR({ ID: 901, 'Mes Ref': `03/${ano}`, 'Classe da Conta': 'ENERGIA', Faturado: '700,00', 'Valor Liquido': '0,00', Sacado: 'LOJA B', 'Emissão': `01/03/${ano} 00:00:00`, Vencimento: `10/03/${ano}`, 'Situação': 'Emitida', Categoria: '1 - Condomínio' }),
].join('\r\n');
const caminhoCsvR = join(dirTemporario, 'Pesquisa_de_Receitas.csv');
writeFileSync(caminhoCsvR, Buffer.from(csvR, 'latin1'));

try {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('.sidebar', { timeout: 5000 });

  console.log('\n### 1. ler o CSV do Group (latin1) e conferir a prévia ###');
  await page.evaluate(async () => { const { app } = await import('./src/js/state.js'); const { render } = await import('./src/js/app.js'); app.state.view = 'cadastros'; app.state.configTab = 'orcamento'; render(); });
  await page.waitForSelector('#group-arquivo');
  await page.setInputFiles('#group-arquivo', caminhoCsv);
  await page.click('#btn-ler-group');
  await page.waitForSelector('#btn-gravar-group');
  const previa = await page.textContent('#painel-group-previa');
  checar(previa.includes('1.360,50'), 'prévia soma as 3 linhas do Condomínio (R$ 1.360,50)');
  checar(previa.includes('MANUTENÇÃO PREDIAL') && previa.includes('Pintura Fachada'), 'acentos do latin1 lidos certo e o par sem casamento listado no de-para');
  checar((await page.$$('select.group-de-para')).length === 1, 'só o par que não casou pede de-para (SALARIOS e a retenção casaram sozinhos)');

  console.log('\n### 2. de-para manual e gravar ###');
  await page.selectOption('select.group-de-para', 'cl:cl-1');
  await page.waitForFunction(() => !document.querySelector('select.group-de-para'));
  const mapa = await page.evaluate(async () => { const mod = await import('./src/js/supabaseClient.js'); return mod.__fixtures().group_mapeamento || []; });
  checar(mapa.length === 1 && mapa[0].classe_conta_id === 'cl-1' && mapa[0].classe_base === 'Pintura Fachada', 'de-para gravado (Pintura Fachada -> 2.01.01)');
  await page.click('#btn-gravar-group');
  await page.waitForFunction(() => !document.getElementById('btn-gravar-group'));
  const gravado = await page.evaluate(async () => { const mod = await import('./src/js/supabaseClient.js'); return mod.__fixtures().group_lancamentos || []; });
  checar(gravado.length === 3 && gravado.every(l => l.pagador_id === 'pag-1' && l.importado_em), `3 lançamentos gravados no Condomínio (${gravado.length})`);

  console.log('\n### 2b. relatório de receitas (mesmo campo, reconhecido pelo cabeçalho) ###');
  await page.setInputFiles('#group-arquivo', caminhoCsvR);
  await page.click('#btn-ler-group');
  await page.waitForSelector('#btn-gravar-receitas');
  checar((await page.textContent('#painel-receitas-previa')).includes('5.700,00'), 'prévia das receitas: faturado do ano (R$ 5.700,00)');
  await page.click('#btn-gravar-receitas');
  await page.waitForFunction(() => !document.getElementById('btn-gravar-receitas'));
  const recGravadas = await page.evaluate(async () => { const mod = await import('./src/js/supabaseClient.js'); return mod.__fixtures().group_receitas || []; });
  checar(recGravadas.length === 2 && recGravadas[0].classe === 'ENCARGO COMUM', `2 receitas gravadas, classe sem o "*" (${recGravadas.length})`);

  console.log('\n### 3. DRE com o Group como realizado ###');
  await page.evaluate(async () => { const { app } = await import('./src/js/state.js'); const { render } = await import('./src/js/app.js'); app.state.view = 'dashboard'; app.state.dashboardAba = 'dre'; render(); });
  await page.waitForSelector('#btn-exportar-dre');
  const tabela = await page.textContent('.dre-tabela');
  checar(tabela.includes('Central CP') && tabela.includes('Group'), 'total do ano tem as colunas Group e Central CP');
  checar(tabela.includes('1.360') || tabela.includes('1.361'), 'Group de março (com a retenção e o de-para) cai no 2.01.01');
  checar(tabela.includes('Total de receitas') && tabela.includes('5.700') && tabela.includes('Resultado operacional'), 'DRE com receitas (R$ 5.700 em março) e resultado');
  checar(tabela.includes('4.339') || tabela.includes('4.340'), 'resultado de março = 5.700 − 1.360,50');
  checarIgual(await page.$$eval('.dre-cg-mes:nth-child(3) .dre-cg-barra', b => b.length), 3, 'gráfico: 3 colunas por mês (Group, Central CP, Orçado)');
  checar((await page.textContent('.dre-leitura')).includes('março'), 'leitura do mês em foco (março)');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btn-exportar-dre')]);
  const caminhoDre = join(dirTemporario, 'dre.xlsx');
  await dl.saveAs(caminhoDre);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(caminhoDre);
  checar(wb.worksheets.map(w => w.name).join() === 'Realizado (Group),Central CP,Orçado', `Excel do DRE com Group, Central CP e Orçado (${wb.worksheets.map(w => w.name).join(', ')})`);
  const colA = []; wb.getWorksheet('Realizado (Group)').getColumn(1).eachCell(c => colA.push(String(c.value)));
  checar(colA.includes('Total de receitas') && colA.some(v => v.startsWith('Resultado operacional')), 'Excel do DRE traz receitas e resultado');

  console.log('\n### 4. aba Conciliação ###');
  await page.click('[data-dash-aba="conciliacao"]');
  await page.waitForSelector('.conc-grupos');
  await page.click('[data-conc-grupo="so_group"]');
  const conc = await page.textContent('[data-tbl-fixa="conciliacao"]');
  checar(conc.includes('500') && conc.includes('501'), 'movimentos 500 e 501 aparecem em "Só no Group"');
  checar(conc.includes('Folha de março'), 'linha mostra a descrição do Group');
  await page.click('tr[data-conc-toggle="500%7Cpag-1"]');
  await page.waitForSelector('.conc-detalhe');
  const det = await page.textContent('.conc-detalhe');
  checar(det.includes(`02/03/${ano}`) && det.includes('CONDOMÍNIO 01490-2') && det.includes('SALARIOS - INSS 11%'), 'detalhe mostra criação, conta corrente e a linha da retenção');
  checarIgual(await page.$$eval('.conc-detalhe section:first-child tbody tr', trs => trs.length), 2, 'detalhe: as 2 linhas do Group do movimento');
  await page.fill('#conc-busca', 'tintas');
  await page.waitForFunction(() => document.querySelectorAll('tr[data-conc-toggle]').length === 1);
  checar((await page.textContent('[data-tbl-fixa="conciliacao"]')).includes('501'), 'busca pelo fornecedor deixa só o movimento 501');
  const [dlc] = await Promise.all([page.waitForEvent('download'), page.click('#btn-exportar-conciliacao')]);
  const caminhoConc = join(dirTemporario, 'conc.xlsx');
  await dlc.saveAs(caminhoConc);
  const wbc = new ExcelJS.Workbook();
  await wbc.xlsx.readFile(caminhoConc);
  checar(wbc.worksheets.map(w => w.name).join() === 'Conciliação,Linhas do Group' && wbc.getWorksheet('Linhas do Group').rowCount === 2, 'Excel da conciliação com a aba "Linhas do Group" (só o recorte da busca)');

  checar(consoleErros.length === 0, `nenhum erro não tratado no console do navegador (${consoleErros.length} encontrado(s))`);
  if (consoleErros.length > 0) consoleErros.forEach(e => console.error('  erro:', e));
} finally {
  await browser.close();
  server.close();
  rmSync(dirTemporario, { recursive: true, force: true });
}

console.log(`\n=== resumo: ${falhas === 0 ? 'tudo passou' : falhas + ' falha(s)'} ===`);
if (falhas > 0) process.exitCode = 1;
