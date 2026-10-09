// tests/e2e/avaliacao_ocr/navegador.mjs
//
// Sobe o app (código real de src/, via ../sync.mjs + ../serve.mjs) num
// Chromium do Playwright, com a mesma ponte de rede de
// ../leitor_documentos_pdf_e_ocr.mjs: o navegador busca o motor e o
// modelo de idioma do tesseract.js / pdf.js nos CDNs (só DOWNLOAD de
// código e modelo -- nenhum documento sai daqui).
import { chromium } from 'playwright';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const raizE2e = join(__dirname, '..');

// rotasLocais: { '/__docs/': async (caminho) => Buffer } -- serve arquivos
// do disco pro navegador sem passar bytes por page.evaluate.
export async function abrirApp({ rotasLocais = {} } = {}) {
  execFileSync('node', ['sync.mjs'], { cwd: raizE2e, stdio: 'ignore' });
  const { startServer } = await import('../serve.mjs');
  const { server, url } = await startServer();

  const envSemProxy = { ...process.env };
  for (const k of ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'ALL_PROXY', 'all_proxy']) delete envSemProxy[k];
  const browser = await chromium.launch({ args: ['--no-sandbox'], env: envSemProxy });
  const context = await browser.newContext();
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
  for (const [prefixo, ler] of Object.entries(rotasLocais)) {
    await context.route(`${url}${prefixo}**`, async (route) => {
      try {
        const caminho = decodeURIComponent(new URL(route.request().url()).pathname.slice(prefixo.length));
        await route.fulfill({ status: 200, body: await ler(caminho), headers: { 'content-type': 'application/octet-stream' } });
      } catch {
        await route.fulfill({ status: 404, body: '' });
      }
    });
  }
  const page = await context.newPage();
  const erros = [];
  page.on('pageerror', (e) => erros.push(e.message));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('.sidebar', { timeout: 10000 });
  return {
    page, url, erros,
    async fechar() { await browser.close(); server.close(); },
  };
}

// --nome=valor / --flag  ->  { nome: 'valor', flag: true }
export function argumentos(argv = process.argv.slice(2)) {
  const out = {};
  for (const a of argv) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (m) out[m[1]] = m[2] === undefined ? true : m[2];
  }
  return out;
}
