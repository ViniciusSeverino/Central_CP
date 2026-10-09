// src/js/layout_ocr.js
//
// Organização das palavras posicionadas do OCR em LINHAS (ver ocr_imagem.js
// e extracao_posicional.js: { texto, x0, y0, x1, y1 } em frações 0..1 da
// página). Serve pra entender o layout de formulário -- rótulo numa linha,
// valor na linha de baixo, na mesma coluna (boleto: "Vencimento" em cima,
// a data embaixo) -- que o texto corrido do OCR nem sempre deixa colado.
//
// Tudo puro (sem DOM). Testado em tests/regressao/ocr_orientacao_e_layout.mjs.

// Agrupa palavras em linhas por proximidade vertical (metade da altura
// média das palavras): cada linha sai ordenada da esquerda pra direita, e
// as linhas de cima pra baixo. Cada linha: { palavras, y0, y1, texto }.
export function agruparEmLinhas(palavras) {
  if (!palavras || !palavras.length) return [];
  const alturaMedia = palavras.reduce((s, p) => s + (p.y1 - p.y0), 0) / palavras.length;
  const tolerancia = alturaMedia / 2 || 0.01;
  const linhas = [];
  for (const p of [...palavras].sort((a, b) => a.y0 - b.y0)) {
    let linha = linhas.find((l) => Math.abs(l.y0 - p.y0) <= tolerancia);
    if (!linha) { linha = { y0: p.y0, palavras: [] }; linhas.push(linha); }
    linha.palavras.push(p);
  }
  return linhas
    .sort((a, b) => a.y0 - b.y0)
    .map((l) => {
      const ordenadas = l.palavras.sort((a, b) => a.x0 - b.x0);
      return {
        palavras: ordenadas,
        y0: Math.min(...ordenadas.map(p => p.y0)),
        y1: Math.max(...ordenadas.map(p => p.y1)),
        texto: ordenadas.map(p => p.texto).join(' '),
      };
    });
}

// Faixa horizontal (x0..x1) das palavras de uma linha que formam o trecho
// casado por `re` (pode ser mais de uma palavra, ex: "Valor do documento").
function faixaDoRotulo(linha, re) {
  let pos = 0;
  const inicios = linha.palavras.map((p) => { const i = pos; pos += p.texto.length + 1; return i; });
  const m = linha.texto.match(re);
  if (!m) return null;
  const ini = m.index, fim = m.index + m[0].length;
  const cobertas = linha.palavras.filter((p, i) => inicios[i] < fim && inicios[i] + p.texto.length > ini);
  if (!cobertas.length) return null;
  return { x0: Math.min(...cobertas.map(p => p.x0)), x1: Math.max(...cobertas.map(p => p.x1)) };
}

// Valor logo ABAIXO de um rótulo, na mesma coluna: acha a linha com o
// rótulo (rotuloRe), olha as próximas linhas (até ~3 alturas de linha
// abaixo) e junta as palavras que começam na faixa da coluna do rótulo;
// devolve o primeiro trecho que casa com formatoRe (grupo 1, se houver)
// ou null.
export function valorAbaixoDoRotulo(linhas, rotuloRe, formatoRe) {
  for (let i = 0; i < linhas.length; i++) {
    const faixa = faixaDoRotulo(linhas[i], rotuloRe);
    if (!faixa) continue;
    const altura = linhas[i].y1 - linhas[i].y0 || 0.01;
    const coluna = { x0: faixa.x0 - altura, x1: Math.max(faixa.x1, faixa.x0 + 0.25) };
    for (let j = i + 1; j < linhas.length && linhas[j].y0 - linhas[i].y1 <= altura * 3; j++) {
      const naColuna = linhas[j].palavras.filter(p => p.x0 >= coluna.x0 && p.x0 <= coluna.x1);
      const m = naColuna.map(p => p.texto).join(' ').match(formatoRe);
      if (m) return m[1] ?? m[0];
    }
  }
  return null;
}
