// Etapa 4 da melhoria do OCR: orientação (página girada 90/180/270°) e
// layout. Testa a parte pura: girar a matriz de pixels (usada pra medir a
// inclinação já na orientação corrigida) e levar as caixas das palavras
// de uma leitura girada de volta pra imagem ORIGINAL -- é isso que mantém
// os hints de posição e a seleção na pré-visualização certos mesmo quando
// a página foi lida girada.
import { checar, checarIgual, relatorioFinal } from './lib/assert.mjs';
const P = await import('./app/src/js/ocr_preprocesso.js');

console.log('### girar matriz ###');
// 3x2:  1 2 3
//       4 5 6
const m = new Uint8Array([1, 2, 3, 4, 5, 6]);
const g90 = P.girarMatriz(m, 3, 2, 90);
checarIgual([g90.largura, g90.altura, Array.from(g90.img)], [2, 3, [3, 6, 2, 5, 1, 4]], '90° (anti-horário): primeira coluna da direita vira a primeira linha');
const g180 = P.girarMatriz(m, 3, 2, 180);
checarIgual(Array.from(g180.img), [6, 5, 4, 3, 2, 1], '180°: de cabeça pra baixo');
const g270 = P.girarMatriz(m, 3, 2, 270);
checarIgual([g270.largura, g270.altura, Array.from(g270.img)], [2, 3, [4, 1, 5, 2, 6, 3]], '270°');
const ida = P.girarMatriz(g90.img, g90.largura, g90.altura, 270);
checarIgual(Array.from(ida.img), Array.from(m), '90° + 270° volta ao original');
checar(P.girarMatriz(m, 3, 2, 0).img === m, '0°: nada a fazer');

console.log('\n### caixas de uma leitura girada voltam pra imagem original ###');
// Página original 1000 x 500 girada 90° no sentido horário (fica 500 x
// 1000 na tela). A leitura corrige com rotacao=90 (imagem processada
// 1000 x 500 de novo, de pé) -- um ponto da leitura tem que voltar pro
// lugar certo na imagem original (a girada).
function pontoVolta(rotacao) {
  const W = 500, H = 1000; // imagem original (girada)
  const g = P.geometria(W, H, 1, rotacao);
  // ponto da original: (100, 800); leva pra processada aplicando a mesma
  // rotação de -rotacao em torno do centro (como o canvas faz)
  const rad = (-rotacao * Math.PI) / 180;
  const dx = 100 - W / 2, dy = 800 - H / 2;
  const px = dx * Math.cos(rad) - dy * Math.sin(rad) + g.largura / 2;
  const py = dx * Math.sin(rad) + dy * Math.cos(rad) + g.altura / 2;
  const c = P.mapearCaixaParaOriginal({ x0: px, y0: py, x1: px, y1: py }, g);
  return [Math.round(c.x0 * 1000) / 1000, Math.round(c.y0 * 1000) / 1000, g.largura, g.altura];
}
checarIgual(pontoVolta(90), [0.2, 0.8, 1000, 500], 'rotação 90: imagem processada fica deitada (1000x500) e o ponto volta pra (0,2; 0,8) da original');
checarIgual(pontoVolta(180).slice(0, 2), [0.2, 0.8], 'rotação 180: ponto volta pro lugar certo');
checarIgual(pontoVolta(270).slice(0, 2), [0.2, 0.8], 'rotação 270: ponto volta pro lugar certo');

relatorioFinal('ocr_orientacao_e_layout');
