// tests/e2e/apresentacao_fluxo.mjs
//
// Aba "Apresentação do fluxo" (só administrador), num Chromium de verdade:
// a aba abre a apresentação animada num iframe, a cena 1 (abertura) roda,
// o botão "▶" avança para a cena 2 e nada quebra no console (nem do app,
// nem de dentro do iframe).
// Prints opcionais: PRINTS=<pasta> node apresentacao_fluxo.mjs
import { chromium } from 'playwright';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PRINTS = process.env.PRINTS || null;
let falhas = 0;
function checar(condicao, mensagem) {
  if (condicao) console.log(`  ✓ ${mensagem}`);
  else { falhas++; console.error(`  ✗ FALHOU: ${mensagem}`); }
}

console.log('=== sincronizando app/ a partir do código real ===');
execFileSync('node', ['sync.mjs'], { cwd: __dirname, stdio: 'inherit' });
const { startServer } = await import('./serve.mjs');
const { server, url } = await startServer();
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errosConsole = [];
page.on('pageerror', e => errosConsole.push(e.message));

try {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('.sidebar', { timeout: 15000 });

  console.log('\n### 1. aba no menu do administrador ###');
  const item = page.locator('[data-view="apresentacao"]');
  checar(await item.count() === 1, 'administrador vê "Apresentação do fluxo" no menu');
  await item.click();
  await page.waitForSelector('iframe.apresentacao-quadro', { timeout: 5000 });

  console.log('\n### 2. a apresentação roda dentro da aba ###');
  const quadro = page.frameLocator('iframe.apresentacao-quadro');
  await quadro.locator('#palco .cena').waitFor({ timeout: 10000 });
  await quadro.locator('#ab-tit.on').waitFor({ timeout: 12000 });
  checar(true, 'cena 1: a logo se forma e o título aparece');
  if (PRINTS) await page.screenshot({ path: join(PRINTS, 'apresentacao_aba.png') });
  await quadro.locator('#btn-proxima').click();
  await quadro.locator('#capitulos button.atual', { hasText: 'Quem participa' }).waitFor({ timeout: 3000 });
  checar(true, 'o botão "▶" avança para a cena 2 (Quem participa)');
  await quadro.locator('.papel.on').first().waitFor({ timeout: 5000 });
  checar(await quadro.locator('.papel').count() === 4, 'os quatro papéis aparecem');
  checar(errosConsole.length === 0, `nenhum erro não tratado no navegador (${errosConsole.length})`);
  if (errosConsole.length) console.log(errosConsole);
} finally {
  await browser.close();
  server.close();
}

console.log(`\n=== resumo: ${falhas === 0 ? 'tudo passou' : falhas + ' falha(s)'} ===`);
process.exit(falhas === 0 ? 0 : 1);
