// tests/e2e/selecao_no_documento_imagem.mjs
//
// Fase 2 da "ferramenta de captura" (ver plano em aprendizado_extracao.js/
// extracao_posicional.js): quando o leitor não acha um campo (número da
// nota, valor) numa IMAGEM anexada, o painel de aprendizado agora também
// oferece "Selecionar no documento" -- a pessoa desenha um retângulo sobre
// a pré-visualização (janela externa) marcando onde o campo fica, em vez
// de só digitar/escolher um chip. Isso roda inteiramente em cima de
// palavras posicionadas de verdade (bounding boxes do Tesseract, ver
// ocr_imagem.js) e persiste um hint de POSIÇÃO por fornecedor (migration
// 0037_fornecedor_extracao_hints_posicao.sql) -- jsdom não abre popup de
// verdade (ver preview_anexos.mjs), então só dá pra confirmar isso num
// navegador real, com OCR de verdade rodando.
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
// Ponte de rede real (não mock) pro CDN do tesseract.js (OCR de verdade) --
// qualquer host https, já que o worker/modelo de idioma vem de um CDN
// diferente do esm.sh (ver leitor_documentos_pdf_e_ocr.mjs).
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

console.log('\n### 1. anexar imagem com um número que a regex genérica não acha -> pergunta pendente ###');
await page.click('#btn-nova-nota');
await page.waitForSelector('#nf-numero');

// Fornecedor primeiro (ordem não importa pro leitor, só pra hint virar
// hint "de verdade" direto, sem passar pela fila de hintsPendentes).
await page.fill('#nf-fornecedor-busca', 'Fornecedor E2E');
await page.waitForSelector('#nf-fornecedor-list .combo-item');
await page.click('#nf-fornecedor-list .combo-item');

// Canvas com "PROTOCOLO" (linha de cima, ignorada) e "48213" (linha de
// baixo, bem separada verticalmente -- é o que o retângulo vai selecionar).
// Sem "Nº"/"nota fiscal" por perto do número: a regex genérica de
// numeroNota não acha nada aqui de propósito, forçando a pergunta.
const pngBase64 = await page.evaluate(() => {
  const canvas = document.createElement('canvas');
  canvas.width = 500; canvas.height = 300;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 500, 300);
  ctx.fillStyle = '#000';
  ctx.font = 'bold 36px sans-serif';
  ctx.fillText('PROTOCOLO', 20, 60);
  ctx.font = 'bold 70px sans-serif';
  ctx.fillText('48213', 20, 220);
  return canvas.toDataURL('image/png').split(',')[1];
});
await page.setInputFiles('#nf-anexos-input', [
  { name: 'documento.png', mimeType: 'image/png', buffer: Buffer.from(pngBase64, 'base64') },
]);

const btnSelecionar = page.locator('[data-selecionar-no-documento="0:numeroNota"]');
await btnSelecionar.waitFor({ timeout: 20000 });
checar(true, 'painel de aprendizado oferece "Selecionar no documento" pro número da nota (não achou pela regex genérica)');

console.log('\n### 2. abrir a janela externa em modo de seleção ###');
const [popup] = await Promise.all([
  context.waitForEvent('page', { timeout: 5000 }).catch(() => null),
  btnSelecionar.click(),
]);
checar(!!popup, 'clicar em "Selecionar no documento" abre a janela externa de verdade');
await popup.waitForLoadState('domcontentloaded').catch(() => {});
await popup.waitForSelector('[data-selecao-img]', { timeout: 15000 });
checar(await popup.locator('.selecao-instrucao').isVisible(), 'janela externa mostra a instrução de arrastar o retângulo');

// Contorno específico deste teste (não é bug do produto): registrar
// context.route() faz a janela popup carregar 0 stylesheets em Playwright
// (mesma peculiaridade já documentada em preview_janela_externa_mesclada.mjs
// -- confirmado via document.styleSheets.length === 0 aqui também). Sem a
// folha de estilo, o wrap da imagem não fica com display:inline-block nem
// position:relative (viraria um <div> genérico do tamanho da janela
// inteira), o que quebraria a conta de fração usada pra cruzar o
// retângulo com as palavras posicionadas -- forçamos aqui só o suficiente
// pro layout ficar como um usuário real veria (que carrega a folha de
// estilo normalmente).
await popup.evaluate(() => {
  const wrap = document.querySelector('[data-selecao-wrap]');
  const retangulo = document.querySelector('[data-selecao-retangulo]');
  if (wrap) { wrap.style.position = 'relative'; wrap.style.display = 'inline-block'; }
  if (retangulo) { retangulo.style.position = 'absolute'; }
});

console.log('\n### 3. arrasto minúsculo (clique sem arrastar de verdade) é ignorado ###');
const imgLocator = popup.locator('[data-selecao-img]');
await imgLocator.waitFor();
let box = await imgLocator.boundingBox();
await popup.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.1);
await popup.mouse.down();
await popup.mouse.move(box.x + box.width * 0.101, box.y + box.height * 0.101);
await popup.mouse.up();
await popup.waitForTimeout(200);
checar(await popup.locator('.selecao-instrucao').isVisible(), 'depois de um arrasto minúsculo, a janela continua em modo de seleção (nada foi confirmado à toa)');

console.log('\n### 4. arrastar um retângulo de verdade sobre "48213" -> confirma o valor ###');
box = await imgLocator.boundingBox(); // relê -- o layout pode ter mudado após o passo anterior
const x0 = box.x + box.width * 0.02, y0 = box.y + box.height * 0.42;
const x1 = box.x + box.width * 0.62, y1 = box.y + box.height * 0.82;
await popup.mouse.move(x0, y0);
await popup.mouse.down();
await popup.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, { steps: 4 });
await popup.mouse.move(x1, y1, { steps: 4 });
await popup.mouse.up();

await page.waitForFunction(() => {
  const bolhas = document.querySelectorAll('.chat-bubble.resposta');
  return Array.from(bolhas).some(b => /\d{4,}/.test(b.textContent));
}, { timeout: 10000 });
const respostaTexto = await page.locator('.chat-bubble.resposta').last().innerText();
checar(respostaTexto.includes('48213'), `a resposta confirmada contém o número reconhecido na região selecionada -- veio "${respostaTexto.trim()}"`);
checar(!(await page.locator('[data-selecionar-no-documento="0:numeroNota"]').count()), 'a pergunta sobre o número da nota não aparece mais (já foi respondida)');

console.log('\n### 5. o hint aprendido tem POSIÇÃO (não só âncora de texto), pro fornecedor certo ###');
const hint = await page.evaluate(async () => {
  const { app } = await import('/src/js/state.js');
  return app.extracaoHints.find(h => h.fornecedor_id === 'forn-1' && h.campo === 'numeroNota');
});
checar(!!hint, 'existe um hint salvo pra (Fornecedor E2E, numeroNota)');
checar(hint && hint.pagina === 1, `hint tem página 1 (imagem de página única) -- veio ${hint && hint.pagina}`);
checar(hint && ['pos_x', 'pos_y', 'pos_largura', 'pos_altura'].every(k => typeof hint[k] === 'number' && hint[k] >= 0 && hint[k] <= 1), `hint tem retângulo em frações válidas (0..1) -- veio ${JSON.stringify(hint)}`);

console.log('\n### 6. a janela externa voltou ao modo normal de pré-visualização depois de confirmar ###');
checar(!(await popup.locator('.selecao-instrucao').count().catch(() => 0)), 'depois de confirmar, a janela externa sai do modo de seleção (mostra a pré-visualização normal)');

checar(consoleErros.length === 0, `nenhum erro não tratado no console do navegador (${consoleErros.length} encontrado(s))`);
if (consoleErros.length > 0) console.log(consoleErros);

console.log(falhas === 0 ? '\n=== resumo: tudo passou ===' : `\n=== resumo: ${falhas} falha(s) ===`);
await browser.close();
server.close();
process.exit(falhas === 0 ? 0 : 1);
