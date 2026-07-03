// tests/e2e/pdf_zip_excel.mjs
//
// A suíte jsdom (tests/regressao) estruturalmente não consegue provar que
// merge de PDF, geração de .zip e exportação de Excel funcionam de
// verdade -- as três dependem de import de CDN (bloqueado pelo
// carregador de módulos do Node fora de um navegador) e/ou de
// feature-detection de Blob que só existe num navegador real. Este
// arquivo roda num Chromium de verdade (Playwright) e prova as três coisas.
import { chromium } from 'playwright';
import { PDFDocument } from 'pdf-lib';
import JSZip from 'jszip';
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
  console.log('\n### app carregou, administrador logado (mock) ###');

  console.log('\n### 1. anexar 2 PDFs reais numa nota nova -> merge de verdade (pdf-lib via CDN, no navegador) ###');
  await page.click('#btn-nova-nota');
  await page.waitForSelector('#nf-numero');
  await page.fill('#nf-emissao', '2026-06-01');
  await page.fill('#nf-vencimento', '2026-07-20');
  await page.fill('#nf-competencia', '2026-06');
  await page.fill('#nf-numero', 'NF-E2E-1');
  await page.fill('#nf-valor', '250');
  await page.selectOption('#nf-setor', 'Financeiro');
  await page.selectOption('#nf-pagador', 'pag-1');
  await page.fill('#nf-fornecedor-busca', 'Fornecedor E2E');
  await page.waitForSelector('#nf-fornecedor-list .combo-item');
  await page.click('#nf-fornecedor-list .combo-item');
  await page.selectOption('#nf-forma-pagamento', 'Boleto bancário');
  await page.selectOption('#nf-classificacao', 'Compras');
  await page.selectOption('#nf-centro-custo', 'cc-1');
  await page.selectOption('#nf-classe-conta', 'cl-1');

  const pdf1 = await pdfDeTeste('Boleto');
  const pdf2 = await pdfDeTeste('Nota Fiscal');
  await page.setInputFiles('#nf-anexos-input', [
    { name: 'boleto.pdf', mimeType: 'application/pdf', buffer: pdf1 },
    { name: 'nota-fiscal.pdf', mimeType: 'application/pdf', buffer: pdf2 },
  ]);
  await page.waitForTimeout(200);
  checar((await page.locator('#anexos-area em').count()) === 2, 'os 2 PDFs anexados aparecem na lista antes de salvar');

  await page.click('#btn-salvar-nota');
  // A mesclagem de verdade (busca os 2 PDFs no Storage mock, funde com
  // pdf-lib de verdade via CDN, reenvia o resultado) demora mais que um
  // timeout fixo curto -- espera até a nota existir com o merge concluído.
  await esperarAte(page, async () => {
    const mod = await import('./src/js/supabaseClient.js');
    const n = mod.__fixtures().notas.find(x => x.numero_nota === 'NF-E2E-1');
    return !!(n && n.anexos && n.anexos.length > 0);
  });

  const nota = await page.evaluate(async () => {
    const mod = await import('./src/js/supabaseClient.js');
    return mod.__fixtures().notas.find(n => n.numero_nota === 'NF-E2E-1');
  });
  checar(!!nota, 'a nota foi criada de verdade');
  checar(nota && nota.status === 'aprovado', 'aprovou automaticamente (administrador tem autoridade)');
  checar(nota && nota.anexos && nota.anexos.length === 1, 'os 2 PDFs viraram exatamente 1 anexo (merge aconteceu)');

  const bytesMergeB64 = await page.evaluate(async (path) => {
    const mod = await import('./src/js/supabaseClient.js');
    const obj = mod.supabase.storage._objetos.find(o => o.path === path);
    const buf = await obj.file.arrayBuffer();
    return btoa(String.fromCharCode(...new Uint8Array(buf)));
  }, nota.anexos[0]);
  const bytesMerge = Buffer.from(bytesMergeB64, 'base64');
  const pdfFinal = await PDFDocument.load(bytesMerge);
  checar(pdfFinal.getPageCount() === 2, `o PDF mesclado de verdade tem 2 páginas (1 de cada anexo original) -- veio ${pdfFinal.getPageCount()}`);

  console.log('\n### 2. levar a nota até "Abrir chamado" e baixar o .zip de verdade (JSZip via CDN, no navegador) ###');
  await page.click('[data-view="lancar_group"]');
  await page.waitForSelector('.grupo-card [data-lote-action]');
  await page.click('.grupo-card [data-lote-action]');
  await page.waitForSelector('#input-lancamento-group');
  await page.fill('#input-lancamento-group', 'GRP-E2E-1');
  await page.click('#confirmar-lote-lancar-group');
  await page.waitForTimeout(300);

  await page.click('[data-view="abrir_chamado"]');
  await page.waitForSelector('.grupo-card [data-lote-action]');
  await page.click('.grupo-card [data-lote-action]');
  await page.waitForSelector('#btn-baixar-zip-chamado');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#btn-baixar-zip-chamado'),
  ]);
  const zipPath = join(dirTemporario, 'download-teste.zip');
  await download.saveAs(zipPath);
  const { readFileSync } = await import('fs');
  const zipBytes = readFileSync(zipPath);
  checar(zipBytes.slice(0, 2).toString('latin1') === 'PK', 'o arquivo baixado começa com a assinatura real de um .zip (PK)');
  const zip = await JSZip.loadAsync(zipBytes);
  const nomes = Object.keys(zip.files);
  checar(nomes.length === 1, `o zip contém exatamente 1 arquivo -- veio ${nomes.length}: ${nomes.join(', ')}`);
  const conteudoNoZip = await zip.files[nomes[0]].async('nodebuffer');
  const pdfDoZip = await PDFDocument.load(conteudoNoZip);
  checar(pdfDoZip.getPageCount() === 2, 'o PDF dentro do zip é o mesmo mesclado (2 páginas), não corrompido');

  console.log('\n### 3. abrir chamado de verdade e exportar Excel de "Todas as notas" (exceljs via CDN, no navegador) ###');
  await page.fill('#input-chamado', 'CH-E2E-1');
  await page.click('#confirmar-lote-abrir-chamado');
  await page.waitForTimeout(300);

  await page.click('[data-view="todas"]');
  await page.waitForSelector('#btn-exportar-excel:not([disabled])');
  const [downloadXlsx] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#btn-exportar-excel'),
  ]);
  const xlsxPath = join(dirTemporario, 'download-teste.xlsx');
  await downloadXlsx.saveAs(xlsxPath);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(xlsxPath);
  checar(wb.worksheets.length > 0, 'o arquivo baixado é um .xlsx de verdade, abre sem erro (mesmo workbook do exceljs)');
  const linhas = wb.worksheets[0].rowCount;
  checar(linhas > 1, `a planilha exportada tem linhas de dado (não só cabeçalho) -- ${linhas} linha(s)`);
  const textoPlanilha = JSON.stringify(wb.worksheets.map(w => w.getSheetValues()));
  checar(textoPlanilha.includes('NF-E2E-1'), 'a nota criada neste teste aparece na planilha exportada');

  checar(consoleErros.length === 0, `nenhum erro não tratado no console do navegador (${consoleErros.length} encontrado(s))`);
  if (consoleErros.length > 0) consoleErros.forEach(e => console.error('  erro:', e));
} finally {
  await browser.close();
  server.close();
  rmSync(dirTemporario, { recursive: true, force: true });
}

console.log(`\n=== resumo: ${falhas === 0 ? 'tudo passou' : falhas + ' falha(s)'} ===`);
if (falhas > 0) process.exitCode = 1;
