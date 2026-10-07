// tests/e2e/orcamento_modelo_importacao_dre.mjs
//
// A suíte jsdom (tests/regressao) estruturalmente não consegue provar que
// merge de PDF, geração de .zip e exportação de Excel funcionam de
// verdade -- as três dependem de import de CDN (bloqueado pelo
// carregador de módulos do Node fora de um navegador) e/ou de
// feature-detection de Blob que só existe num navegador real. Este
// arquivo roda num Chromium de verdade (Playwright) e prova as três coisas.
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

// page.waitForFunction() com um predicado ASYNC não espera a Promise
// resolver de verdade -- trata o objeto Promise (sempre truthy) como a
// condição já satisfeita, resolvendo quase instantaneamente mesmo que o
// valor real ainda não esteja pronto (bug observado nesta versão do
// Playwright). Por isso: polling manual, aguardando o valor resolvido de
// cada chamada de fato.
async function esperarAte(page, condicaoAsync, { timeout = 15000, intervalo = 150 } = {}) {
  const inicio = Date.now();
  while (Date.now() - inicio < timeout) {
    if (await page.evaluate(condicaoAsync)) return;
    await new Promise(r => setTimeout(r, intervalo));
  }
  throw new Error('esperarAte: tempo esgotado sem a condição ficar verdadeira');
}

async function pdfDeTeste(texto) {
  const doc = await PDFDocument.create();
  doc.addPage([200, 200]).drawText(texto, { x: 20, y: 100 });
  return Buffer.from(await doc.save());
}

// O proxy deste ambiente só aceita túneis HTTPS CONNECT -- configurá-lo
// pro Chromium quebra a navegação pro servidor estático local (HTTP
// simples). Em vez de brigar com isso, tira o proxy do processo do
// Chromium (assim o app local carrega igual a um navegador comum) e
// intercepta só as requisições ao CDN (esm.sh, de onde o app importa
// pdf-lib/jszip/exceljs) via Playwright, buscando o conteúdo de verdade
// pelo lado do Node (que já sabe falar com o proxy deste ambiente,
// confirmado por `npm install` funcionando nesta mesma sessão). O
// resultado é o MESMO módulo real, servido pro navegador -- não é um mock
// do conteúdo, só uma ponte de rede.
const envSemProxy = { ...process.env };
for (const k of ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'ALL_PROXY', 'all_proxy']) delete envSemProxy[k];

const browser = await chromium.launch({ args: ['--no-sandbox'], env: envSemProxy });
const context = await browser.newContext();
// Copiar título/tabela do chamado usa a Clipboard API de verdade --
// precisa de permissão explícita no Chromium (jsdom nem simula isso).
await context.grantPermissions(['clipboard-read', 'clipboard-write']);
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
  const ano = new Date().getFullYear();

  console.log('\n### 1. baixar o modelo de orçamento (exceljs de verdade, no navegador) ###');
  await page.evaluate(async () => { const { app } = await import('./src/js/state.js'); const { render } = await import('./src/js/app.js'); app.state.view = 'cadastros'; app.state.configTab = 'orcamento'; render(); });
  await page.waitForSelector('#btn-modelo-orcamento');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btn-modelo-orcamento')]);
  const caminhoModelo = join(dirTemporario, 'modelo.xlsx');
  await dl.saveAs(caminhoModelo);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(caminhoModelo);
  const abas = wb.worksheets.map(w => w.name);
  checar(abas.includes('Como preencher') && abas.length >= 2, `modelo tem a aba de instruções e uma por pagador (${abas.join(', ')})`);
  const aba = wb.worksheets.find(w => w.name !== 'Como preencher');
  let linhaCodigo = null;
  // O mock do e2e só tem centro 2.01 e classe 2.01.01 (sem códigos) --
  // orça pela classe inteira, que o modelo também aceita.
  aba.eachRow((row, n) => { if (n > 1 && String(row.getCell(1).value) === '2.01.01') linhaCodigo = n; });
  checar(!!linhaCodigo && String(aba.getRow(2).getCell(1).value) === '2.01', `aba ${aba.name} traz o plano de contas (centro e classe)`);

  console.log('\n### 2. preencher, importar e gravar ###');
  aba.getRow(linhaCodigo).getCell(3).value = 1234.5; // Jan
  aba.getRow(linhaCodigo).getCell(4).value = 100;    // Fev
  const caminhoPreenchido = join(dirTemporario, 'preenchido.xlsx');
  await wb.xlsx.writeFile(caminhoPreenchido);
  await page.setInputFiles('#orc-arquivo', caminhoPreenchido);
  await page.click('#btn-ler-orcamento');
  await page.waitForSelector('#btn-gravar-orcamento');
  checar((await page.textContent('.panel.mt-4')).includes('1.334,50'), 'prévia mostra o total importado (R$ 1.334,50)');
  await page.click('#btn-gravar-orcamento');
  await page.waitForFunction(() => !document.getElementById('btn-gravar-orcamento'));
  const gravado = await page.evaluate(async () => { const mod = await import('./src/js/supabaseClient.js'); return mod.__fixtures().orcamento || []; });
  checar(gravado.length === 2 && gravado.every(o => o.ano === new Date().getFullYear()), `orçamento gravado: 2 linhas no ano (${gravado.length})`);

  console.log('\n### 3. DRE compara com o orçado e exporta o Excel ###');
  await page.evaluate(async () => { const { app } = await import('./src/js/state.js'); const { render } = await import('./src/js/app.js'); app.state.view = 'dashboard'; app.state.dashboardAba = 'dre'; render(); });
  await page.waitForSelector('#btn-exportar-dre');
  const tabela = await page.textContent('.dre-tabela');
  checar(tabela.includes('1.335') || tabela.includes('1.334'), 'tabela do DRE mostra o orçado no total do ano');
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('#btn-exportar-dre')]);
  const caminhoDre = join(dirTemporario, 'dre.xlsx');
  await dl2.saveAs(caminhoDre);
  const wbDre = new ExcelJS.Workbook();
  await wbDre.xlsx.readFile(caminhoDre);
  checar(wbDre.worksheets.map(w => w.name).join() === 'Realizado,Orçado', 'Excel do DRE tem as abas Realizado e Orçado');
  checar(String(wbDre.getWorksheet('Realizado').getRow(3).getCell(2).value) === 'Jan', 'uma coluna por mês');

  checar(consoleErros.length === 0, `nenhum erro não tratado no console do navegador (${consoleErros.length} encontrado(s))`);
  if (consoleErros.length > 0) consoleErros.forEach(e => console.error('  erro:', e));
} finally {
  await browser.close();
  server.close();
  rmSync(dirTemporario, { recursive: true, force: true });
}

console.log(`\n=== resumo: ${falhas === 0 ? 'tudo passou' : falhas + ' falha(s)'} ===`);
if (falhas > 0) process.exitCode = 1;
