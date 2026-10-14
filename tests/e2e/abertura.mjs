// tests/e2e/abertura.mjs
//
// Abertura animada (index.html #abertura + src/js/abertura_animacao.js),
// num Chromium de verdade:
//   1. ao abrir, a camada da abertura aparece com a flecha correndo no ∞;
//   2. quando o app termina de carregar, a flecha desenha a logo, as faces
//      acendem, aparece "Central CP" e a camada some -- o sistema fica
//      utilizável por baixo;
//   3. com "reduzir movimento", a logo aparece parada (sem flecha) e a
//      camada também some.
// Prints opcionais: PRINTS=<pasta> node abertura.mjs
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

try {
  console.log('\n### 1. carregando: flecha no infinito ###');
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  const errosConsole = [];
  page.on('pageerror', e => errosConsole.push(e.message));
  // Segura o app.js um pouco, pra ver a fase "carregando" com calma.
  await page.route('**/src/js/app.js', async (route) => { await new Promise(r => setTimeout(r, 1500)); await route.continue(); });
  await page.goto(url, { waitUntil: 'commit' });
  await page.waitForSelector('#abertura .abertura-flecha[transform]', { timeout: 5000 });
  const t1 = await page.getAttribute('#abertura .abertura-flecha', 'transform');
  await page.waitForTimeout(300);
  const t2 = await page.getAttribute('#abertura .abertura-flecha', 'transform');
  checar(t1 !== t2, 'a flecha está se movendo enquanto o app carrega');
  checar(await page.isVisible('#abertura .abertura-trilho'), 'o caminho do infinito aparece');
  if (PRINTS) await page.screenshot({ path: join(PRINTS, 'abertura_1_carregando.png') });

  console.log('\n### 2. carregou: forma a logo e abre o sistema ###');
  await page.waitForFunction(() => {
    const n = document.querySelector('#abertura .abertura-nome');
    return n && n.classList.contains('visivel');
  }, null, { timeout: 15000 });
  const preenchidas = await page.$$eval('#abertura .abertura-face', fs => fs.every(f => (f.getAttribute('fill') || '').startsWith('url(')));
  checar(preenchidas, 'as três faces do cubo acendem com as cores da marca');
  checar(await page.isVisible('#abertura .abertura-nome'), '"Central CP" aparece embaixo da logo');
  if (PRINTS) await page.screenshot({ path: join(PRINTS, 'abertura_2_logo.png') });
  checar(await page.locator('#abertura').count() === 1, 'a logo fica na tela antes de abrir o sistema');
  await page.waitForSelector('#abertura', { state: 'detached', timeout: 5000 });
  checar(true, 'a abertura some sozinha');
  checar(await page.isVisible('.sidebar'), 'o sistema aparece e fica utilizável');
  if (PRINTS) await page.screenshot({ path: join(PRINTS, 'abertura_3_sistema.png') });
  checar(errosConsole.length === 0, `nenhum erro não tratado no navegador (${errosConsole.length})`);
  if (errosConsole.length) console.log(errosConsole);
  await context.close();

  console.log('\n### 3. "reduzir movimento": logo parada ###');
  const ctx2 = await browser.newContext({ viewport: { width: 1400, height: 900 }, reducedMotion: 'reduce' });
  const p2 = await ctx2.newPage();
  await p2.goto(url, { waitUntil: 'commit' });
  const pronta = await p2.waitForFunction(() => [...document.querySelectorAll('#abertura .abertura-face')].every(f => (f.getAttribute('fill') || '').startsWith('url(')), null, { timeout: 5000 }).then(() => true, () => false);
  checar(pronta, 'a logo já aparece pronta');
  const semFlecha = await p2.$eval('#abertura .abertura-flecha', f => f.getAttribute('opacity') === '0' && !f.getAttribute('transform'));
  checar(semFlecha, 'sem flecha correndo');
  await p2.waitForSelector('#abertura', { state: 'detached', timeout: 8000 });
  checar(await p2.isVisible('.sidebar'), 'e o sistema abre normalmente');
  await ctx2.close();
} finally {
  await browser.close();
  server.close();
}

console.log(`\n=== resumo: ${falhas === 0 ? 'tudo passou' : falhas + ' falha(s)'} ===`);
process.exit(falhas === 0 ? 0 : 1);
