// tests/e2e/excel_modelo_importacao_listas.mjs
//
// O modelo de "Importar histórico" (Configurações → Cadastros → Importar,
// ver events_importar.js) ganhou dropdowns (data validation) nas colunas
// cadastrais, apontando pra uma aba oculta "Listas" -- pra provar que o
// arquivo baixado de verdade tem isso (não só que o botão não quebra),
// precisa abrir o .xlsx real gerado no navegador com exceljs de novo, no
// lado do Node. A suíte jsdom (tests/regressao) não consegue: exceljs vem
// de import de CDN, que o Node não resolve fora de um navegador (mesma
// limitação documentada em pdf_zip_excel.mjs).
import { chromium } from 'playwright';
import ExcelJS from 'exceljs';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dirTemporario = mkdtempSync(join(tmpdir(), 'central-cp-e2e-'));
let falhas = 0;
function checar(condicao, mensagem) {
  if (condicao) console.log(`  ✓ ${mensagem}`);
  else { falhas++; console.error(`  ✗ FALHOU: ${mensagem}`); }
}

console.log('=== sincronizando app/ a partir do código real ===');
execFileSync('node', ['sync.mjs'], { cwd: __dirname, stdio: 'inherit' });

const { startServer } = await import('./serve.mjs');
const { server, url } = await startServer();

// Mesma ponte de rede que pdf_zip_excel.mjs usa: tira o proxy do processo
// do Chromium (só aceita CONNECT/HTTPS, quebra a navegação HTTP local) e
// intercepta as requisições ao CDN (esm.sh) buscando o conteúdo real pelo
// lado do Node.
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

try {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('.sidebar', { timeout: 5000 });

  console.log('\n### baixar o modelo de importação (exceljs via CDN, no navegador) ###');
  await page.click('[data-view="cadastros"]');
  await page.waitForSelector('[data-config-tab="cadastros"]');
  await page.click('[data-cad-tab="importar"]');
  await page.waitForSelector('#btn-baixar-modelo-importacao');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#btn-baixar-modelo-importacao'),
  ]);
  const xlsxPath = join(dirTemporario, 'modelo-teste.xlsx');
  await download.saveAs(xlsxPath);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(xlsxPath);

  const notas = wb.getWorksheet('Notas');
  const listas = wb.getWorksheet('Listas');
  checar(!!notas, 'a aba "Notas" existe no modelo');
  checar(!!listas, 'a aba "Listas" existe no modelo');
  checar(listas && listas.state === 'veryHidden', 'a aba "Listas" fica oculta ("veryHidden"), não atrapalha quem for preencher');

  // Mock de e2e (tests/e2e/mocks/supabaseClient.js) tem exatamente 1
  // fornecedor/pagador/centro/classe/usuário cadastrado -- confirma que
  // os valores reais dos cadastros chegaram na aba de listas. As 8
  // primeiras colunas (A-H) são as listas independentes (colunaListas
  // mapeia o texto do cabeçalho -- linha 1 -- pro número da coluna).
  const colunaListas = {};
  ['fornecedores', 'pagadores', 'setores', 'formas_pagamento', 'classificacoes', 'status', 'sim_nao', 'usuarios']
    .forEach((chave, i) => { colunaListas[chave] = i + 1; });
  checar(listas.getCell(1, colunaListas.fornecedores).value === 'fornecedores', 'coluna A da aba "Listas" é a lista de fornecedores');
  checar(listas.getCell(2, colunaListas.fornecedores).value === 'Fornecedor E2E', 'a lista de fornecedores tem o fornecedor real do cadastro');
  checar(listas.getCell(2, colunaListas.pagadores).value === 'Condomínio', 'a lista de pagadores tem o pagador real do cadastro');
  checar(listas.getCell(2, colunaListas.usuarios).value === 'Admin E2E', 'a lista de usuários (Aprovado/Validado por) tem o usuário real do cadastro');
  checar(listas.getCell(2, colunaListas.setores).value != null, 'a lista de setores está preenchida');
  checar(listas.getCell(2, colunaListas.formas_pagamento).value === 'Boleto bancário', 'a lista de formas de pagamento está preenchida');

  // Colunas da aba "Notas" que devem ter dropdown apontando pra uma lista
  // independente (não hierárquica) da "Listas".
  const colunaNotas = {};
  notas.getRow(1).eachCell((cell, colNumber) => { colunaNotas[cell.value] = colNumber; });
  const comDropdown = {
    'Fornecedor': 'fornecedores', 'Pagador': 'pagadores', 'Setor solicitante': 'setores',
    'Forma de pagamento': 'formas_pagamento', 'Classificação': 'classificacoes',
    'Status': 'status', 'Pendente': 'sim_nao',
    'Aprovado por': 'usuarios', 'Validado por': 'usuarios',
  };
  Object.entries(comDropdown).forEach(([header, chaveLista]) => {
    const col = colunaNotas[header];
    const dv = notas.getCell(2, col).dataValidation;
    checar(!!dv && dv.type === 'list', `coluna "${header}" tem dropdown na linha 2`);
    const letraEsperada = String.fromCharCode(65 + colunaListas[chaveLista] - 1);
    checar(!!dv && dv.formulae[0].startsWith(`Listas!$${letraEsperada}$`), `coluna "${header}" aponta pra a lista certa ("${chaveLista}") -- veio "${dv && dv.formulae[0]}"`);
    checar(!!dv && dv.errorStyle === 'warning', `coluna "${header}" avisa mas não bloqueia digitar fora da lista (errorStyle "warning")`);
  });

  const colSolicitadoPor = colunaNotas['Solicitado por'];
  checar(!notas.getCell(2, colSolicitadoPor).dataValidation, '"Solicitado por" NÃO tem dropdown (é texto livre de propósito, ver import_historico.js)');

  console.log('\n### 2. Centro de custo/Classe da conta/Código de classificação seguem a mesma regra em cascata do formulário (pagador -> centro -> classe -> código) ###');
  // Mock e2e: pagador "Condomínio" (sigla COND) só pode usar o centro
  // "2.01 – ADMINISTRATIVO" (origem_siglas inclui COND) -- ver
  // centrosParaPagador em state.js e a fixture em mocks/supabaseClient.js.
  const faixaCentrosDoPagador = wb.definedNames.model.find(d => d.name === 'CCPAG1');
  checar(!!faixaCentrosDoPagador, 'existe uma faixa nomeada pro 1º pagador (centros de custo válidos pra ele)');
  const [refSheetCC, refAddrCC] = faixaCentrosDoPagador.ranges[0].split('!');
  checar(refSheetCC === 'Listas', 'a faixa do pagador aponta pra dentro da aba "Listas"');
  const enderecoCC = refAddrCC.split(':')[0].replace(/\$/g, '');
  checar(listas.getCell(enderecoCC).value === '2.01 – ADMINISTRATIVO', 'a faixa nomeada do pagador contém o centro de custo certo (formato "código – nome")');

  const colPagador = colunaNotas['Pagador'];
  const colCentro = colunaNotas['Centro de custo'];
  const colClasse = colunaNotas['Classe da conta'];
  const colCodigo = colunaNotas['Código classificação'];
  const letraPagador = String.fromCharCode(64 + colPagador);
  const letraCentro = String.fromCharCode(64 + colCentro);
  const letraClasse = String.fromCharCode(64 + colClasse);

  const dvCentro = notas.getCell(2, colCentro).dataValidation;
  checar(!!dvCentro && dvCentro.type === 'list', 'coluna "Centro de custo" tem dropdown na linha 2');
  checar(!!dvCentro && dvCentro.formulae[0].startsWith('INDIRECT(VLOOKUP('), `"Centro de custo" usa INDIRECT(VLOOKUP(...)) -- dropdown dependente do Pagador (veio "${dvCentro && dvCentro.formulae[0]}")`);
  checar(!!dvCentro && dvCentro.formulae[0].includes(`$${letraPagador}2`), '"Centro de custo" referencia a célula de Pagador da MESMA linha (linha 2)');
  checar(!!dvCentro && dvCentro.errorStyle === 'warning', '"Centro de custo" avisa mas não bloqueia (errorStyle "warning")');

  const dvClasse = notas.getCell(2, colClasse).dataValidation;
  checar(!!dvClasse && dvClasse.formulae[0].startsWith('INDIRECT(VLOOKUP(') && dvClasse.formulae[0].includes(`$${letraCentro}2`), '"Classe da conta" usa INDIRECT(VLOOKUP(Centro de custo da mesma linha, tabela, 2, 0))');

  const dvCodigo = notas.getCell(2, colCodigo).dataValidation;
  checar(!!dvCodigo && dvCodigo.formulae[0].startsWith('INDIRECT(VLOOKUP(') && dvCodigo.formulae[0].includes(`$${letraClasse}2`), '"Código classificação" usa INDIRECT(VLOOKUP(Classe da conta da mesma linha, tabela, 2, 0)) mesmo sem nenhum código cadastrado na fixture (fica sem restrição nesse caso, igual ao formulário -- "Sem subdivisão para esta classe")');

  checar(consoleErros.length === 0, `nenhum erro não tratado no console do navegador (${consoleErros.length} encontrado(s))`);
  if (consoleErros.length > 0) consoleErros.forEach(e => console.error('  erro:', e));
} finally {
  await browser.close();
  server.close();
  rmSync(dirTemporario, { recursive: true, force: true });
}

console.log(`\n=== resumo: ${falhas === 0 ? 'tudo passou' : falhas + ' falha(s)'} ===`);
if (falhas > 0) process.exitCode = 1;
