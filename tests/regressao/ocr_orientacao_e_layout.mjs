// Etapa 4 da melhoria do OCR: orientação (página girada 90/180/270°) e
// layout. Testa a parte pura: girar a matriz de pixels (usada pra medir a
// inclinação já na orientação corrigida) e levar as caixas das palavras
// de uma leitura girada de volta pra imagem ORIGINAL -- é isso que mantém
// os hints de posição e a seleção na pré-visualização certos mesmo quando
// a página foi lida girada.
import { checar, checarIgual, relatorioFinal } from './lib/assert.mjs';
const P = await import('./app/src/js/ocr_preprocesso.js');
const L = await import('./app/src/js/layout_ocr.js');
const { extrairCamposDetalhado, reclassificarComHints, regioesParaReler, aplicarReleituras, MAX_REGIOES_RELEITURA } = await import('./app/src/js/leitor_documentos.js');
const G = await import('../e2e/avaliacao_ocr/casos_sinteticos.mjs');

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

console.log('\n### layout: linhas e rótulo acima do valor ###');
// Boleto de verdade costuma ter "Vencimento" no topo da coluna da direita
// e a data embaixo -- e a linha da esquerda com dígitos no meio ("ATÉ 30
// DIAS"), o que impede a regex do texto corrido de juntar rótulo e data.
const w = (texto, x0, y0, largura = 0.08) => ({ texto, x0, y0, x1: x0 + largura, y1: y0 + 0.015 });
const palavras = [
  w('Local', 0.05, 0.10), w('de', 0.11, 0.10, 0.02), w('pagamento', 0.14, 0.10), w('Vencimento', 0.75, 0.10, 0.1),
  w('PAGÁVEL', 0.05, 0.13), w('ATÉ', 0.14, 0.13, 0.03), w('30', 0.18, 0.13, 0.02), w('DIAS', 0.21, 0.13, 0.04), w('06/03/2026', 0.75, 0.131, 0.1),
  w('(=)', 0.70, 0.20, 0.03), w('Valor', 0.74, 0.20, 0.05), w('do', 0.80, 0.20, 0.02), w('documento', 0.83, 0.20, 0.1),
  w('Instruções', 0.05, 0.23, 0.1), w('multa', 0.16, 0.23, 0.05), w('2%', 0.22, 0.23, 0.02), w('R$', 0.74, 0.231, 0.03), w('1.234,56', 0.78, 0.231, 0.08),
];
const linhas = L.agruparEmLinhas(palavras);
checarIgual(linhas.length, 4, 'agrupa as palavras em 4 linhas');
checarIgual(linhas[1].texto, 'PAGÁVEL ATÉ 30 DIAS 06/03/2026', 'cada linha sai em ordem da esquerda pra direita');
checarIgual(L.valorAbaixoDoRotulo(linhas, /vencimento/i, /(\d{2}\/\d{2}\/\d{4})/), '06/03/2026', 'acha a data embaixo do rótulo "Vencimento", na mesma coluna');
checarIgual(L.valorAbaixoDoRotulo(linhas, /valor\s+do\s+documento/i, /R\$\s*([\d.,]+)/), '1.234,56', 'rótulo de várias palavras ("Valor do documento") também funciona');
checarIgual(L.valorAbaixoDoRotulo(linhas, /desconto/i, /\d+/), null, 'rótulo que não existe: null');
const texto = linhas.map(l => l.texto).join('\n');
checarIgual(extrairCamposDetalhado(texto).campos.vencimento, undefined, 'só pelo texto corrido, o vencimento não sai (tem "30" entre o rótulo e a data)');
checarIgual(extrairCamposDetalhado(texto, [], { 1: palavras }).campos.vencimento, '06/03/2026', 'com as palavras posicionadas, sai pelo layout');

console.log('\n### segunda leitura dirigida ###');
// Boleto lido com um dígito trocado na linha digitável (não passa no DV)
// e um valor de baixa confiança.
const linhaOk = G.gerarLinhaDigitavel(G.prng(11), { vencimentoIso: '2026-05-04', valor: 432.1 });
const linhaRuim = linhaOk.formatado.replace(/^(\d{4})\d/, (m, a) => a + ((Number(m[4]) + 1) % 10));
const palavrasB = [
  ...linhaRuim.split(' ').map((t, i) => w(t, 0.30 + i * 0.12, 0.05, 0.11)),
  w('Valor', 0.70, 0.30, 0.05), w('R$', 0.76, 0.30, 0.03), { ...w('433,10', 0.80, 0.30, 0.08), conf: 55 },
].map(p => ({ conf: 95, ...p }));
const textoB = `${linhaRuim}\nValor R$ 433,10`;
const leituraB = reclassificarComHints(textoB, [], { 1: palavrasB }, 'ocr');
checarIgual(leituraB.campos.linhaDigitavel, undefined, 'linha com dígito trocado não passa no DV (não é preenchida)');
checar(leituraB.camposDuvidosos.includes('valor'), 'valor lido com confiança 55 é duvidoso');
const regioes = regioesParaReler(leituraB, { 1: palavrasB });
checarIgual(regioes.map(r => r.campo).sort(), ['sequencia', 'valor'], 'pede pra reler a linha da sequência longa e o valor duvidoso');
checar(regioes.every(r => r.retangulo.largura > 0 && r.retangulo.altura > 0 && r.caracteres.startsWith('0123456789')), 'regiões com retângulo e só caracteres numéricos');
const opc = { texto: textoB, hints: [], palavrasPorPagina: { 1: palavrasB }, fonte: 'ocr' };
const releituras = regioes.map(r => r.campo === 'sequencia' ? { ...r, texto: linhaOk.formatado, confianca: 90 } : { ...r, texto: 'R$ 432,10', confianca: 92 });
const corrigida = aplicarReleituras(leituraB, releituras, opc);
checarIgual(corrigida.campos.linhaDigitavel, linhaOk.digitos, 'linha relida que passa no DV entra');
checarIgual(corrigida.campos.valor, 432.1, 'valor certo (vindo da linha validada)');
checar(!corrigida.camposDuvidosos.includes('valor'), 'valor deixa de ser duvidoso');
const semGanho = aplicarReleituras(leituraB, regioes.map(r => ({ ...r, texto: r.campo === 'sequencia' ? linhaRuim : 'R$ 999,99', confianca: 40 })), opc);
checarIgual([semGanho.campos.linhaDigitavel, semGanho.campos.valor], [undefined, 433.1], 'releitura pior (DV não passa, confiança menor) não troca nada');
checar(semGanho.camposDuvidosos.includes('valor'), '...e o valor continua marcado pra conferir');
checar(regioesParaReler({ campos: {}, camposDuvidosos: [] }, undefined).length === 0, 'sem palavras posicionadas (PDF digital), não relê nada');
checar(MAX_REGIOES_RELEITURA <= 4, 'no máximo 4 regiões por documento (custo)');

relatorioFinal('ocr_orientacao_e_layout');
