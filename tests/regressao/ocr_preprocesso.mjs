// ocr_preprocesso.js: pré-processamento da imagem antes do OCR. Testa as
// funções puras de pixel (sem canvas): escala ideal, cinza, contraste,
// binarização adaptativa (sombra não vira tinta), estimativa de
// inclinação e o mapeamento das caixas de volta pra imagem original (que
// mantém os hints de posição valendo).
import { checar, checarIgual, relatorioFinal } from './lib/assert.mjs';
const P = await import('./app/src/js/ocr_preprocesso.js');

console.log('### escala ideal ###');
checarIgual(P.escalaIdeal(800, 1100), 2, 'imagem pequena é ampliada até o lado menor alvo (1600)');
checarIgual(P.escalaIdeal(400, 600), 2.5, 'ampliação tem teto de 2,5x');
checarIgual(P.escalaIdeal(1700, 2400), 1, 'imagem já no tamanho bom fica como está');
checarIgual(Math.round(P.escalaIdeal(3000, 4000) * 1000) / 1000, 0.75, 'foto enorme é reduzida até o teto do lado maior (3000)');

console.log('\n### cinza e contraste ###');
const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 200, 200, 200, 255]);
checarIgual(Array.from(P.paraCinza(rgba, 4, 1)), [76, 149, 29, 200], 'luminância BT.601 por pixel');
const desbotada = new Uint8Array(1000).map((_, i) => (i % 2 ? 110 : 170)); // tinta cinza sobre fundo cinza
const esticada = P.estirarContraste(desbotada);
checar(esticada.includes(0) && esticada.includes(255), 'contraste esticado: tinta desbotada vira preto, fundo cinza vira branco');
const chapada = new Uint8Array(100).fill(128);
checarIgual(Array.from(P.estirarContraste(chapada)).every(v => v === 128), true, 'imagem chapada não é distorcida');

console.log('\n### binarização adaptativa ###');
// 200x100: fundo com sombra forte na metade direita (gradiente 230 -> 90),
// e um "traço de texto" escuro em cada metade.
const W = 200, H = 100;
const img = new Uint8Array(W * H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) img[y * W + x] = Math.round(230 - (x / W) * 140);
for (let y = 45; y < 52; y++) for (let x = 20; x < 80; x++) img[y * W + x] = 40;
for (let y = 45; y < 52; y++) for (let x = 120; x < 180; x++) img[y * W + x] = 20;
const bin = P.binarizarAdaptativo(img, W, H, { janela: 31 });
checarIgual(bin[48 * W + 50], 0, 'traço na parte clara vira tinta');
checarIgual(bin[48 * W + 150], 0, 'traço na parte sombreada também vira tinta');
checarIgual(bin[10 * W + 170], 255, 'fundo sombreado (cinza 100) NÃO vira tinta -- um limiar único (128) erraria aqui');
checar(img[10 * W + 170] < 128, 'confirma que esse fundo é mais escuro que o limiar global 128');

// Letra grossa (traço de 40 px numa imagem de 750 px, como um título em
// negrito depois da ampliação): com janela pequena o miolo do traço virava
// fundo e o OCR lia "8" como "6". Com a janela padrão o traço sai cheio.
const G = 750, grossa = new Uint8Array(G * G).fill(255);
for (let y = 300; y < 340; y++) for (let x = 100; x < 600; x++) grossa[y * G + x] = 0;
const binG = P.binarizarAdaptativo(grossa, G, G);
checarIgual(binG[320 * G + 350], 0, 'miolo de um traço grosso (40 px) continua tinta com a janela padrão');

console.log('\n### inclinação ###');
// linhas de "texto" (traços horizontais grossos) inclinadas em +4 graus
function linhasInclinadas(graus) {
  const w = 600, h = 400, a = new Uint8Array(w * h).fill(255);
  const t = Math.tan((graus * Math.PI) / 180);
  for (let base = 60; base < 360; base += 40) {
    for (let x = 40; x < 560; x++) {
      if (x % 9 === 0) continue; // espaços entre "letras"
      for (let e = 0; e < 6; e++) {
        const y = Math.round(base + x * t) + e;
        if (y >= 0 && y < h) a[y * w + x] = 0;
      }
    }
  }
  return { a, w, h };
}
for (const g of [4, -6, 0, 1.5]) {
  const { a, w, h } = linhasInclinadas(g);
  const est = P.estimarInclinacao(a, w, h);
  checar(Math.abs(est - g) <= 0.15, `estima ${g}° de inclinação (veio ${est}°)`);
}
checarIgual(P.estimarInclinacao(new Uint8Array(100).fill(255), 10, 10), 0, 'página em branco: inclinação 0');

console.log('\n### caixas de volta pra imagem original ###');
const g0 = P.geometria(1000, 500, 2, 0);
const cx = P.mapearCaixaParaOriginal({ x0: 200, y0: 100, x1: 400, y1: 200 }, g0);
checarIgual([cx.x0, cx.y0, cx.x1, cx.y1], [0.1, 0.1, 0.2, 0.2], 'só escala: caixa em frações da original');
// com rotação: um ponto da original, levado pra processada e trazido de volta
const g1 = P.geometria(1000, 500, 1.5, 5);
const rad = (-5 * Math.PI) / 180;
const ox = 700 * 1.5 - 750, oy = 120 * 1.5 - 375; // relativo ao centro da original escalada
const px = ox * Math.cos(rad) - oy * Math.sin(rad) + g1.largura / 2;
const py = ox * Math.sin(rad) + oy * Math.cos(rad) + g1.altura / 2;
const volta = P.mapearCaixaParaOriginal({ x0: px, y0: py, x1: px, y1: py }, g1);
checar(Math.abs(volta.x0 - 0.7) < 0.002 && Math.abs(volta.y0 - 0.24) < 0.002, `com rotação de 5°: ponto volta pro lugar certo da original (veio ${volta.x0.toFixed(3)}, ${volta.y0.toFixed(3)})`);
checar(g1.largura > 1500 && g1.altura > 750, 'canvas girado é ampliado pra caber a imagem inteira');

relatorioFinal('ocr_preprocesso');
