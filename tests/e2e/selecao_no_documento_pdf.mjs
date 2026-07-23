// tests/e2e/selecao_no_documento_pdf.mjs
//
// Fase 3 da "ferramenta de captura" (ver Fase 1 em aprendizado_extracao.js/
// extracao_posicional.js, Fase 2 em ocr_imagem.js): "Selecionar no
// documento" agora também funciona em PDF, não só imagem -- a página é
// renderizada num <canvas> sob demanda (pdf.js via CDN, ver
// pdf_render.js), com navegação entre páginas quando o PDF tem mais de
// uma. Como o texto aqui é VETORIAL (embutido de verdade no PDF, não
// escaneado), a extração via getTextContent() é exata -- ao contrário do
// teste de imagem (selecao_no_documento_imagem.mjs), que depende de OCR
// probabilístico, aqui dá pra afirmar o valor reconhecido exatamente.
import { chromium } from 'playwright';
import { PDFDocument } from 'pdf-lib';
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
// Ponte de rede real pro CDN do pdf.js (renderização) -- qualquer host
// https, mesmo padrão já usado nos outros testes e2e desta funcionalidade.
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

console.log('\n### 1. anexar um PDF de 2 páginas com o número só na PÁGINA 2 -> pergunta pendente ###');
await page.click('#btn-nova-nota');
await page.waitForSelector('#nf-numero');

await page.fill('#nf-fornecedor-busca', 'Fornecedor E2E');
await page.waitForSelector('#nf-fornecedor-list .combo-item');
await page.click('#nf-fornecedor-list .combo-item');

// Sem "Nº"/"nota fiscal" perto do número: a regex genérica não acha nada
// (mesmo raciocínio do teste de imagem), forçando a pergunta -- e o
// número só existe na SEGUNDA página, pra testar a navegação de verdade.
const pdfBytesArray = await (async () => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont('Helvetica');
  const pagina1 = doc.addPage([400, 500]);
  pagina1.drawText('CAPA DO DOCUMENTO', { x: 20, y: 430, size: 20, font });
  const pagina2 = doc.addPage([400, 500]);
  pagina2.drawText('PROTOCOLO', { x: 20, y: 430, size: 20, font });
  pagina2.drawText('78329', { x: 20, y: 60, size: 36, font });
  return Array.from(await doc.save());
})();
await page.setInputFiles('#nf-anexos-input', [
  { name: 'documento.pdf', mimeType: 'application/pdf', buffer: Buffer.from(pdfBytesArray) },
]);

const btnSelecionar = page.locator('[data-selecionar-no-documento="0:numeroNota"]');
await btnSelecionar.waitFor({ timeout: 20000 });
checar(true, 'painel de aprendizado oferece "Selecionar no documento" pro número da nota, mesmo sendo PDF');

// Palavras posicionadas de verdade (mesmo código de produto, ver
// pdf_render.js) -- usado só pra saber ONDE está "78329" na página 2 e
// montar um retângulo generoso ao redor, sem chutar coordenadas na mão.
const palavrasPagina2 = await page.evaluate(async () => {
  const { app } = await import('/src/js/state.js');
  const { renderizarPaginaPdfEmCanvas } = await import('/src/js/pdf_render.js');
  const arquivo = app.anexosNovos[0];
  const resultado = await renderizarPaginaPdfEmCanvas(arquivo, 2);
  return resultado.palavras;
});
const palavraAlvo = palavrasPagina2.find(p => p.texto.includes('78329'));
checar(!!palavraAlvo, `pdf.js extraiu "78329" da página 2 com posição de verdade (texto vetorial, sem OCR) -- veio ${JSON.stringify(palavrasPagina2)}`);
const folga = 0.04;
const regiaoAlvo = {
  x: Math.max(0, palavraAlvo.x0 - folga), y: Math.max(0, palavraAlvo.y0 - folga),
  x1: Math.min(1, palavraAlvo.x1 + folga), y1: Math.min(1, palavraAlvo.y1 + folga),
};

console.log('\n### 2. abrir a janela externa -> mostra a PÁGINA 1 (com navegação, pois tem 2) ###');
const [popup] = await Promise.all([
  context.waitForEvent('page', { timeout: 5000 }).catch(() => null),
  btnSelecionar.click(),
]);
checar(!!popup, 'clicar em "Selecionar no documento" abre a janela externa de verdade');
await popup.waitForLoadState('domcontentloaded').catch(() => {});
await popup.waitForSelector('[data-selecao-img]', { timeout: 15000 });
checar((await popup.locator('.selecao-instrucao').innerText()).includes('página 1 de 2'), 'instrução indica que está na página 1 de 2');
checar(await popup.locator('[data-pagina-seguinte]').isEnabled(), '"Próxima página" está habilitado (tem mais páginas depois)');
checar(!(await popup.locator('[data-pagina-anterior]').isEnabled()), '"Página anterior" está desabilitado (já é a primeira)');

// Mesmo contorno do teste de imagem (não é bug do produto): registrar
// context.route() zera document.styleSheets.length dentro do popup em
// Playwright -- sem a folha de estilo, o wrap não fica inline-block/
// position:relative, quebrando a conta de fração. Ver
// selecao_no_documento_imagem.mjs pro mesmo contorno, já confirmado via
// document.styleSheets.length === 0.
async function forcarLayoutDeSelecao() {
  await popup.evaluate(() => {
    const wrap = document.querySelector('[data-selecao-wrap]');
    const retangulo = document.querySelector('[data-selecao-retangulo]');
    if (wrap) { wrap.style.position = 'relative'; wrap.style.display = 'inline-block'; }
    if (retangulo) { retangulo.style.position = 'absolute'; }
  });
}
await forcarLayoutDeSelecao();

console.log('\n### 3. navegar pra página 2 ###');
await popup.click('[data-pagina-seguinte]');
await popup.waitForFunction(() => {
  const p = document.querySelector('.selecao-instrucao p');
  return p && p.textContent.includes('página 2 de 2');
}, { timeout: 15000 });
checar(true, 'depois de "Próxima página", a instrução mostra "página 2 de 2"');
checar(!(await popup.locator('[data-pagina-seguinte]').isEnabled()), '"Próxima página" desabilita na última página');
checar(await popup.locator('[data-pagina-anterior]').isEnabled(), '"Página anterior" habilita depois de navegar');
await forcarLayoutDeSelecao(); // a página trocou -> o canvas foi recriado, precisa forçar de novo

console.log('\n### 4. arrastar o retângulo sobre "78329" (só existe na página 2) -> confirma o valor exato ###');
// O canvas da página (renderizado em escala 1.5) costuma ser mais alto que
// a viewport da janela popup -- sem rolar até a região alvo primeiro, o
// arrasto cairia fora da área visível e nenhum evento de mouse chegaria
// no elemento (confirmado: sem isso, nem o listener bruto de mousedown
// disparava). Rola até o meio vertical da região que interessa antes de
// calcular as coordenadas de arrasto.
const fracaoYAlvo = (regiaoAlvo.y + regiaoAlvo.y1) / 2;
const scrollAntes = await popup.evaluate(() => window.scrollY);
const alturaViewport = await popup.evaluate(() => window.innerHeight);
let canvasBox = await popup.locator('[data-selecao-img]').boundingBox();
const yAlvoNoDocumento = scrollAntes + canvasBox.y + fracaoYAlvo * canvasBox.height;
await popup.evaluate((y) => window.scrollTo(0, Math.max(0, y)), yAlvoNoDocumento - alturaViewport / 2);
canvasBox = await popup.locator('[data-selecao-img]').boundingBox(); // relê já com o novo scroll
const x0 = canvasBox.x + canvasBox.width * regiaoAlvo.x, y0 = canvasBox.y + canvasBox.height * regiaoAlvo.y;
const x1 = canvasBox.x + canvasBox.width * regiaoAlvo.x1, y1 = canvasBox.y + canvasBox.height * regiaoAlvo.y1;
await popup.mouse.move(x0, y0);
await popup.mouse.down();
await popup.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, { steps: 4 });
await popup.mouse.move(x1, y1, { steps: 4 });
await popup.mouse.up();

await page.waitForFunction(() => {
  const bolhas = document.querySelectorAll('.chat-bubble.resposta');
  return Array.from(bolhas).some(b => /\d{4,}/.test(b.textContent));
}, { timeout: 15000 });
const respostaTexto = await page.locator('.chat-bubble.resposta').last().innerText();
// Texto vetorial extraído por pdf.js -- exato, sem ruído de OCR.
checar(respostaTexto.includes('78329'), `a resposta confirmada contém o número exato extraído do PDF -- veio "${respostaTexto.trim()}"`);
checar(!(await page.locator('[data-selecionar-no-documento="0:numeroNota"]').count()), 'a pergunta sobre o número da nota não aparece mais (já foi respondida)');

console.log('\n### 5. o hint aprendido guarda a PÁGINA certa (2), não só o retângulo ###');
const hint = await page.evaluate(async () => {
  const { app } = await import('/src/js/state.js');
  return app.extracaoHints.find(h => h.fornecedor_id === 'forn-1' && h.campo === 'numeroNota');
});
checar(!!hint, 'existe um hint salvo pra (Fornecedor E2E, numeroNota)');
checar(hint && hint.pagina === 2, `hint aponta pra página 2 (onde o número de verdade estava, não a 1) -- veio ${hint && hint.pagina}`);
checar(hint && ['pos_x', 'pos_y', 'pos_largura', 'pos_altura'].every(k => typeof hint[k] === 'number' && hint[k] >= 0 && hint[k] <= 1), `hint tem retângulo em frações válidas (0..1) -- veio ${JSON.stringify(hint)}`);

console.log('\n### 6. a janela externa voltou ao modo normal de pré-visualização depois de confirmar ###');
checar(!(await popup.locator('.selecao-instrucao').count().catch(() => 0)), 'depois de confirmar, a janela externa sai do modo de seleção (mostra a pré-visualização normal)');

checar(consoleErros.length === 0, `nenhum erro não tratado no console do navegador (${consoleErros.length} encontrado(s))`);
if (consoleErros.length > 0) console.log(consoleErros);

console.log(falhas === 0 ? '\n=== resumo: tudo passou ===' : `\n=== resumo: ${falhas} falha(s) ===`);
await browser.close();
server.close();
process.exit(falhas === 0 ? 0 : 1);
