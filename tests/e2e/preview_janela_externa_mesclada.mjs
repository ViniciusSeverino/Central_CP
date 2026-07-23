// tests/e2e/preview_janela_externa_mesclada.mjs
//
// Com mais de 1 anexo, a pré-visualização (janela externa, ver
// events_notas.js) deve mesclar tudo num PDF único -- mesma lógica usada
// de verdade ao Salvar (ver anexos_pdf.js/mesclarAnexosEmPdfUnico), só que
// sem mexer em app.anexosNovos/anexosRemovidos: é só pra visualização, o
// usuário continua livre pra reordenar/remover os anexos depois de ver o
// resultado combinado. jsdom não roda isso (a mesclagem só acontece dentro
// de uma janela externa de verdade, que jsdom não consegue abrir), então
// só dá pra confirmar num navegador real.
import { chromium } from 'playwright';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
let falhas = 0;
function checar(condicao, mensagem) {
  if (condicao) console.log(`  ✓ ${mensagem}`);
  else { falhas++; console.error(`  ✗ FALHOU: ${mensagem}`); }
}

console.log('=== sincronizando app/ a partir do código real ===');
execFileSync('node', ['sync.mjs'], { cwd: __dirname, stdio: 'inherit' });

const { startServer } = await import('./serve.mjs');
const { server, url } = await startServer();

const envSemProxy = { ...process.env };
for (const k of ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'ALL_PROXY', 'all_proxy']) delete envSemProxy[k];
const browser = await chromium.launch({ args: ['--no-sandbox'], env: envSemProxy });
const context = await browser.newContext();
// A mesclagem usa pdf-lib via CDN (mesmo import de anexos_pdf.js) -- ponte
// de rede real (não um mock), igual pdf_zip_excel.mjs já faz. Qualquer
// host https (não só esm.sh) porque anexar a imagem também dispara o
// leitor de documentos em segundo plano (tesseract.js, CDN diferente) --
// mesma generalização que leitor_documentos_pdf_e_ocr.mjs já usa.
await context.route('https://*/**', async (route) => {
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
page.on('pageerror', (e) => consoleErros.push(e.message));

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForSelector('.sidebar', { timeout: 5000 });
console.log('\n### app carregou ###');

console.log('\n### 1. anexar 2 imagens novas -> pré-visualização mescla num PDF único ###');
await page.click('#btn-nova-nota');
await page.waitForSelector('#nf-numero');
const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
await page.setInputFiles('#nf-anexos-input', [
  { name: 'a.png', mimeType: 'image/png', buffer: Buffer.from(pngBase64, 'base64') },
  { name: 'b.png', mimeType: 'image/png', buffer: Buffer.from(pngBase64, 'base64') },
]);
await page.waitForTimeout(300);

const btnAbrir = page.locator('[data-abrir-preview-externo]');
const [popup] = await Promise.all([
  context.waitForEvent('page', { timeout: 3000 }).catch(() => null),
  btnAbrir.click(),
]);
checar(!!popup, 'clicar em "Abrir pré-visualização" abre uma janela de verdade');
await popup.waitForLoadState('domcontentloaded').catch(() => {});
await popup.waitForSelector('.preview-card', { timeout: 15000 }).catch(() => {});
await popup.waitForFunction(() => {
  const t = document.querySelector('.preview-titulo span');
  return t && t.textContent.includes('combinada');
}, { timeout: 15000 }).catch(() => {});

const numCards = await popup.locator('#preview-externo-conteudo .preview-card').count();
checar(numCards === 1, 'com 2 anexos, a janela mostra só 1 card (mesclado) -- veio ' + numCards);
const titulo = await popup.locator('.preview-titulo span').innerText().catch(() => '');
checar(titulo.includes('combinada') && titulo.includes('2'), 'título indica pré-visualização combinada de 2 arquivos -- veio "' + titulo + '"');
const iframeSrc = await popup.locator('.preview-pdf').getAttribute('src').catch(() => null);
checar(!!iframeSrc && iframeSrc.startsWith('blob:'), 'o card mesclado mostra um PDF de verdade (blob: URL) -- veio ' + iframeSrc);

console.log('\n### 2. o anexo original continua editável depois de ver a pré-visualização ###');
await popup.close().catch(() => {});
checar((await page.locator('[data-remover-anexo-novo]').count()) === 2, 'os 2 anexos originais continuam lá, ainda removíveis/reordenáveis (a mesclagem foi só pra pré-visualização)');

checar(consoleErros.length === 0, 'nenhum erro não tratado no console do navegador (' + consoleErros.length + ' encontrado(s))');

console.log(falhas === 0 ? '\n=== resumo: tudo passou ===' : `\n=== resumo: ${falhas} falha(s) ===`);
await browser.close();
server.close();
process.exit(falhas === 0 ? 0 : 1);
