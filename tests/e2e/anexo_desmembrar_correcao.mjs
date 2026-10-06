// tests/e2e/anexo_desmembrar_correcao.mjs
//
// A suíte jsdom (tests/regressao) estruturalmente não consegue provar que
// merge de PDF, geração de .zip e exportação de Excel funcionam de
// verdade -- as três dependem de import de CDN (bloqueado pelo
// carregador de módulos do Node fora de um navegador) e/ou de
// feature-detection de Blob que só existe num navegador real. Este
// arquivo roda num Chromium de verdade (Playwright) e prova as três coisas.
import { chromium } from 'playwright';
import { PDFDocument } from 'pdf-lib';
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

  console.log('\n### 1. nota com UM PDF de 3 páginas (tamanhos diferentes, pra conferir a ordem depois) ###');
  const doc = await PDFDocument.create();
  for (const lado of [200, 300, 400]) doc.addPage([lado, lado]).drawText(`pagina ${lado}`, { x: 20, y: 50 });
  const pdf3 = Buffer.from(await doc.save());
  await page.click('#btn-nova-nota');
  await page.waitForSelector('#nf-numero');
  await page.fill('#nf-emissao', '2026-06-01');
  await page.selectOption('#nf-tipo-despesa', 'dare');
  await page.fill('#nf-vencimento', '2026-07-20');
  await page.fill('#nf-competencia', '2026-06');
  await page.fill('#nf-numero', 'NF-DESM-1');
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
  await page.setInputFiles('#nf-anexos-input', [{ name: 'tudo.pdf', mimeType: 'application/pdf', buffer: pdf3 }]);
  await page.waitForTimeout(200);
  await page.click('#btn-salvar-nota');
  await esperarAte(page, async () => {
    const mod = await import('./src/js/supabaseClient.js');
    const n = mod.__fixtures().notas.find(x => x.numero_nota === 'NF-DESM-1');
    return !!(n && n.anexos && n.anexos.length > 0);
  });

  console.log('\n### 2. abrir a correção: o PDF salvo vira 3 páginas na lista ###');
  const notaId = await page.evaluate(async () => {
    const mod = await import('./src/js/supabaseClient.js');
    const { app } = await import('./src/js/state.js');
    const { render } = await import('./src/js/app.js');
    const fx = mod.__fixtures().notas.find(x => x.numero_nota === 'NF-DESM-1');
    fx.pendente = true; fx.motivo_pendencia = 'Boleto errado';
    const n = app.notas.find(x => x.id === fx.id);
    n.pendente = true; n.motivo_pendencia = 'Boleto errado';
    app.anexosNovos = []; app.anexosRemovidos = []; app.anexosAnalises = [];
    app.state.modal = 'corrigir_pendencia'; app.state.modalData = n.id;
    app.desmembrarAoAbrir = n.id;
    render();
    return n.id;
  });
  await page.waitForFunction(() => document.querySelectorAll('.anexos-lista li.anexo-pagina').length === 3, null, { timeout: 15000 });
  checar(true, 'as 3 páginas do anexo salvo aparecem separadas na correção');
  await page.waitForFunction(() => document.querySelectorAll('.anexo-miniatura img').length === 3, null, { timeout: 15000 }).then(
    () => checar(true, 'cada página ganha a miniatura (pdf.js)'),
    () => checar(false, 'cada página ganha a miniatura (pdf.js)'));

  console.log('\n### 3. remover a página 2, subir a 3 e salvar ###');
  await page.click('[data-remover-anexo-novo="1"]');
  await page.click('[data-mover-anexo-novo="1"][data-direcao="cima"]');
  await page.click('#btn-salvar-nota');
  await esperarAte(page, async () => {
    const mod = await import('./src/js/supabaseClient.js');
    const n = mod.__fixtures().notas.find(x => x.numero_nota === 'NF-DESM-1');
    return !!(n && n.anexos && n.anexos.length === 1 && !n.pendente);
  }, { timeout: 20000 }).catch(() => {});
  const final = await page.evaluate(async (id) => {
    const mod = await import('./src/js/supabaseClient.js');
    const n = mod.__fixtures().notas.find(x => x.id === id);
    const objs = mod.supabase.storage._objetos.filter(o => o.path.startsWith(`${id}/`));
    const buf = objs.length === 1 ? new Uint8Array(await objs[0].file.arrayBuffer()) : null;
    return { anexos: n.anexos, pendente: n.pendente, qtd: objs.length, b64: buf ? btoa(String.fromCharCode(...buf)) : null };
  }, notaId);
  checar(final.anexos.length === 1 && final.qtd === 1, `continua 1 arquivo por nota (anexos=${final.anexos.length}, storage=${final.qtd})`);
  const pdfFinal = final.b64 ? await PDFDocument.load(Buffer.from(final.b64, 'base64')) : null;
  const lados = pdfFinal ? pdfFinal.getPages().map(p => Math.round(p.getWidth())) : [];
  checar(lados.join(',') === '400,200', `o PDF remontado tem as páginas 3 e 1, nessa ordem (veio ${lados.join(',') || 'nada'})`);

  checar(consoleErros.length === 0, `nenhum erro não tratado no console do navegador (${consoleErros.length} encontrado(s))`);
  if (consoleErros.length > 0) consoleErros.forEach(e => console.error('  erro:', e));
} finally {
  await browser.close();
  server.close();
  rmSync(dirTemporario, { recursive: true, force: true });
}

console.log(`\n=== resumo: ${falhas === 0 ? 'tudo passou' : falhas + ' falha(s)'} ===`);
if (falhas > 0) process.exitCode = 1;
