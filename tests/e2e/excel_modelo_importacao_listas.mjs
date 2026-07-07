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
  // os valores reais dos cadastros chegaram na aba de listas.
  const colunaListas = {};
  listas.getRow(1).eachCell((cell, colNumber) => { colunaListas[cell.value] = colNumber; });
  checar(listas.getCell(2, colunaListas.fornecedores).value === 'Fornecedor E2E', 'a lista de fornecedores tem o fornecedor real do cadastro');
  checar(listas.getCell(2, colunaListas.pagadores).value === 'Condomínio', 'a lista de pagadores tem o pagador real do cadastro');
  checar(listas.getCell(2, colunaListas.centros_custo).value === '2.01 – ADMINISTRATIVO', 'a lista de centros de custo usa o formato "código – nome"');
  checar(listas.getCell(2, colunaListas.classes_conta).value === '2.01.01 – SALARIOS', 'a lista de classes de conta usa o formato "código – nome"');
  checar(listas.getCell(2, colunaListas.usuarios).value === 'Admin E2E', 'a lista de usuários (Aprovado/Validado por) tem o usuário real do cadastro');
  checar(listas.getCell(2, colunaListas.setores).value != null, 'a lista de setores está preenchida');
  checar(listas.getCell(2, colunaListas.formas_pagamento).value === 'Boleto bancário', 'a lista de formas de pagamento está preenchida');

  // Colunas da aba "Notas" que devem ter dropdown apontando pra "Listas".
  const colunaNotas = {};
  notas.getRow(1).eachCell((cell, colNumber) => { colunaNotas[cell.value] = colNumber; });
  const comDropdown = {
    'Fornecedor': 'fornecedores', 'Pagador': 'pagadores', 'Setor solicitante': 'setores',
    'Forma de pagamento': 'formas_pagamento', 'Classificação': 'classificacoes',
    'Centro de custo': 'centros_custo', 'Classe da conta': 'classes_conta',
    'Código classificação': 'codigos_classificacao', 'Status': 'status', 'Pendente': 'sim_nao',
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

  checar(consoleErros.length === 0, `nenhum erro não tratado no console do navegador (${consoleErros.length} encontrado(s))`);
  if (consoleErros.length > 0) consoleErros.forEach(e => console.error('  erro:', e));
} finally {
  await browser.close();
  server.close();
  rmSync(dirTemporario, { recursive: true, force: true });
}

console.log(`\n=== resumo: ${falhas === 0 ? 'tudo passou' : falhas + ' falha(s)'} ===`);
if (falhas > 0) process.exitCode = 1;
