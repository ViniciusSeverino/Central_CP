// src/js/ocr_preprocesso.js
//
// Pré-processamento da imagem ANTES do OCR (ver ocr_imagem.js): o
// Tesseract lê muito melhor texto escuro e nítido sobre fundo claro e
// uniforme, na horizontal, com letras de tamanho razoável -- e foto de
// celular/scan ruim raramente chega assim. Aqui:
//   1. escala: amplia imagem pequena (letra miúda) e reduz foto enorme;
//   2. escala de cinza;
//   3. estiramento de contraste (fundo cinza/tinta desbotada viram
//      branco/preto de verdade);
//   4. binarização adaptativa: o limiar de cada pixel vem da vizinhança
//      dele (média e desvio local, calculados com imagem integral), não de
//      um limiar único pra página inteira -- é o que resolve sombra e
//      iluminação desigual de foto;
//   5. correção de inclinação: estima o ângulo pela projeção horizontal
//      dos pixels escuros (linhas de texto alinhadas geram picos bem
//      marcados) e gira a imagem de volta.
//
// As funções de pixel são puras (trabalham com Uint8Array/Uint8ClampedArray
// + largura/altura) e rodam em Node sem canvas -- testadas em
// tests/regressao/ocr_preprocesso.mjs. Só preprocessarImagem() (no fim)
// usa canvas/createImageBitmap, porque precisa decodificar e desenhar.
//
// Tudo roda local, no navegador: nenhuma imagem sai daqui.

// Lado menor alvo (≈ 200-300 dpi pra um A4/boleto) e teto do lado maior
// (memória: a binarização guarda duas imagens integrais do tamanho da
// imagem -- ver binarizarAdaptativo).
export const LADO_MENOR_ALVO = 1600;
export const LADO_MAIOR_MAXIMO = 3000;
const AMPLIACAO_MAXIMA = 2.5;

// Fator de escala pra levar a imagem ao tamanho bom pro OCR.
export function escalaIdeal(largura, altura) {
  const menor = Math.min(largura, altura), maior = Math.max(largura, altura);
  if (!menor || !maior) return 1;
  let escala = 1;
  if (menor < LADO_MENOR_ALVO) escala = Math.min(AMPLIACAO_MAXIMA, LADO_MENOR_ALVO / menor);
  if (maior * escala > LADO_MAIOR_MAXIMO) escala = LADO_MAIOR_MAXIMO / maior;
  return Math.abs(escala - 1) < 0.05 ? 1 : escala;
}

// RGBA (ImageData.data) -> cinza (luminância, pesos BT.601).
export function paraCinza(rgba, largura, altura) {
  const n = largura * altura;
  const cinza = new Uint8Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    cinza[i] = (rgba[j] * 299 + rgba[j + 1] * 587 + rgba[j + 2] * 114) / 1000;
  }
  return cinza;
}

// Estica o histograma: o percentil `corte` vira 0 e o (1 - corte) vira 255.
// Usar percentis (e não mínimo/máximo) ignora os poucos pixels de ruído
// que, sozinhos, impediriam qualquer ganho.
export function estirarContraste(cinza, corte = 0.01) {
  const hist = new Uint32Array(256);
  for (let i = 0; i < cinza.length; i++) hist[cinza[i]]++;
  const alvo = cinza.length * corte;
  let baixo = 0, acc = 0;
  while (baixo < 255 && acc + hist[baixo] <= alvo) acc += hist[baixo++];
  let alto = 255; acc = 0;
  while (alto > 0 && acc + hist[alto] <= alvo) acc += hist[alto--];
  const out = new Uint8Array(cinza.length);
  if (alto - baixo < 8) { out.set(cinza); return out; } // imagem chapada: não há o que esticar
  const fator = 255 / (alto - baixo);
  for (let i = 0; i < cinza.length; i++) {
    const v = (cinza[i] - baixo) * fator;
    out[i] = v < 0 ? 0 : v > 255 ? 255 : v;
  }
  return out;
}

// Binarização adaptativa (critério de Sauvola): pixel vira tinta quando
// fica abaixo de  média_local * (1 + k * (desvio_local / 128 - 1)).
// Fundo uniforme (desvio baixo) puxa o limiar pra baixo da média -- ruído
// leve não vira tinta; perto de texto (desvio alto) o limiar sobe até a
// média. Média e desvio de cada janela saem de duas imagens integrais
// (soma e soma dos quadrados), em O(1) por pixel, independente do tamanho
// da janela. Devolve 0 (tinta) / 255 (fundo).
export function binarizarAdaptativo(cinza, largura, altura, { janela, k = 0.25 } = {}) {
  const w = largura, h = altura;
  // A janela precisa ser bem maior que a espessura do traço das letras:
  // se a janela inteira cair dentro de um traço grosso (título em negrito,
  // imagem ampliada), o desvio local some e o miolo da letra vira fundo
  // (um "8" vazado vira "6"). 1/12 do lado menor cobre títulos grandes e
  // ainda acompanha sombra/iluminação de foto, que variam devagar.
  const lado = janela || Math.max(15, (Math.round(Math.min(w, h) / 12) | 1));
  const raio = lado >> 1;
  const W = w + 1;
  const soma = new Float64Array(W * (h + 1));
  const somaQ = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let linha = 0, linhaQ = 0;
    for (let x = 0; x < w; x++) {
      const v = cinza[y * w + x];
      linha += v; linhaQ += v * v;
      const idx = (y + 1) * W + (x + 1);
      soma[idx] = soma[idx - W] + linha;
      somaQ[idx] = somaQ[idx - W] + linhaQ;
    }
  }
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - raio), y1 = Math.min(h, y + raio + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - raio), x1 = Math.min(w, x + raio + 1);
      const area = (x1 - x0) * (y1 - y0);
      const a = y0 * W + x0, b = y0 * W + x1, c = y1 * W + x0, d = y1 * W + x1;
      const s = soma[d] - soma[b] - soma[c] + soma[a];
      const sq = somaQ[d] - somaQ[b] - somaQ[c] + somaQ[a];
      const media = s / area;
      const desvio = Math.sqrt(Math.max(0, sq / area - media * media));
      const limiar = media * (1 + k * (desvio / 128 - 1));
      out[y * w + x] = cinza[y * w + x] < limiar ? 0 : 255;
    }
  }
  return out;
}

// Ângulo de inclinação do texto, em graus (positivo = texto descendo pra
// direita, no sentido horário). Trabalha numa amostra dos pixels escuros
// (binário 0/255 ou cinza com limiar): pra cada ângulo candidato, projeta
// os pontos na vertical "desentortada" (y - x·tan θ) e mede o quanto o
// histograma das linhas fica concentrado (soma dos quadrados) -- no ângulo
// certo, cada linha de texto cai num feixe estreito de linhas do
// histograma, gerando picos altos. Busca grossa (passo 0,25°) e depois
// fina (0,05°) em volta do melhor.
export function estimarInclinacao(img, largura, altura, { maxGraus = 10, limiar = 128 } = {}) {
  // amostra no máximo ~60 mil pontos escuros (grade regular)
  let escuros = 0;
  for (let i = 0; i < img.length; i++) if (img[i] < limiar) escuros++;
  if (escuros < 50) return 0;
  const passo = Math.max(1, Math.round(Math.sqrt(escuros / 60000)));
  const xs = [], ys = [];
  for (let y = 0; y < altura; y += passo) {
    for (let x = 0; x < largura; x += passo) {
      if (img[y * largura + x] < limiar) { xs.push(x); ys.push(y); }
    }
  }
  const diag = Math.ceil(Math.hypot(largura, altura));
  const hist = new Float64Array(2 * diag + 1);
  const pontuar = (graus) => {
    const t = Math.tan((graus * Math.PI) / 180);
    hist.fill(0);
    for (let i = 0; i < xs.length; i++) hist[Math.round(ys[i] - xs[i] * t) + diag]++;
    let s = 0;
    for (let i = 0; i < hist.length; i++) s += hist[i] * hist[i];
    return s;
  };
  let melhor = 0, melhorPontos = pontuar(0);
  for (let g = -maxGraus; g <= maxGraus + 1e-9; g += 0.25) {
    const p = pontuar(g);
    if (p > melhorPontos) { melhorPontos = p; melhor = g; }
  }
  const grosso = melhor;
  for (let g = grosso - 0.25; g <= grosso + 0.25 + 1e-9; g += 0.05) {
    const p = pontuar(g);
    if (p > melhorPontos) { melhorPontos = p; melhor = g; }
  }
  return Math.round(melhor * 100) / 100;
}

// Gira uma matriz de pixels (Uint8Array largura x altura) em 90/180/270°
// no sentido ANTI-horário -- o mesmo sentido da correção aplicada na
// imagem (rotacao = quanto a página está girada no sentido horário).
export function girarMatriz(img, largura, altura, rotacao) {
  const r = ((rotacao % 360) + 360) % 360;
  if (!r) return { img, largura, altura };
  const w2 = r === 180 ? largura : altura, h2 = r === 180 ? altura : largura;
  const out = new Uint8Array(img.length);
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      let nx, ny;
      if (r === 90) { nx = y; ny = largura - 1 - x; }
      else if (r === 180) { nx = largura - 1 - x; ny = altura - 1 - y; }
      else { nx = altura - 1 - y; ny = x; }
      out[ny * w2 + nx] = img[y * largura + x];
    }
  }
  return { img: out, largura: w2, altura: h2 };
}

// Geometria da imagem processada em relação à original: escala, depois
// rotação de -angulo em torno do centro, num canvas ampliado pra caber a
// imagem girada inteira. Devolve as dimensões finais e o que é preciso
// pra desfazer (mapearCaixaParaOriginal).
export function geometria(largura, altura, escala, angulo) {
  const rad = (-angulo * Math.PI) / 180;
  const w = largura * escala, h = altura * escala;
  const cos = Math.abs(Math.cos(rad)), sin = Math.abs(Math.sin(rad));
  return {
    escala, angulo, larguraOriginal: largura, alturaOriginal: altura,
    largura: Math.round(w * cos + h * sin), altura: Math.round(w * sin + h * cos),
  };
}

// Caixa (pixels da imagem PROCESSADA) -> caixa em FRAÇÕES (0..1) da imagem
// ORIGINAL -- mantém o contrato de `palavras` (ver ocr_imagem.js e
// extracao_posicional.js): os hints de posição gravados por fornecedor
// continuam valendo, com ou sem pré-processamento. Gira os 4 cantos de
// volta e pega o retângulo que os contém.
export function mapearCaixaParaOriginal(caixa, g) {
  const rad = (g.angulo * Math.PI) / 180; // desfaz a rotação de -angulo
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const cxP = g.largura / 2, cyP = g.altura / 2;
  const cxO = (g.larguraOriginal * g.escala) / 2, cyO = (g.alturaOriginal * g.escala) / 2;
  const cantos = [[caixa.x0, caixa.y0], [caixa.x1, caixa.y0], [caixa.x0, caixa.y1], [caixa.x1, caixa.y1]].map(([x, y]) => {
    const dx = x - cxP, dy = y - cyP;
    return [(dx * cos - dy * sin + cxO) / g.escala, (dx * sin + dy * cos + cyO) / g.escala];
  });
  const lim = (v, max) => Math.min(1, Math.max(0, v / max));
  return {
    x0: lim(Math.min(...cantos.map(c => c[0])), g.larguraOriginal),
    y0: lim(Math.min(...cantos.map(c => c[1])), g.alturaOriginal),
    x1: lim(Math.max(...cantos.map(c => c[0])), g.larguraOriginal),
    y1: lim(Math.max(...cantos.map(c => c[1])), g.alturaOriginal),
  };
}

// Inclinação mínima que vale corrigir (abaixo disso, girar só borra).
const INCLINACAO_MINIMA = 0.3;

// Imagem (Blob) -> { blob (PNG processado), geometria } -- ou null se não
// der pra decodificar (formato sem suporte no navegador). opcoes:
// { binarizar (padrão true), deskew (padrão true), contraste (padrão true),
//   k (sensibilidade da binarização, padrão 0,25 -- o melhor no harness de
//   avaliação; 0,10-0,15 ajudou imagem desfocada mas derrubou foto),
//   rotacao (0/90/180/270: quanto a página está girada no sentido horário;
//   a correção desfaz isso junto com a inclinação), miniatura (true: reduz
//   pra no máximo 1000 px em vez de ampliar -- leitura rápida só pra
//   comparar orientações, ver ocr_imagem.js) }.
export async function preprocessarImagem(blob, opcoes = {}) {
  const { binarizar = true, deskew = true, contraste = true, k = 0.25, rotacao = 0, miniatura = false } = opcoes;
  let bitmap;
  try { bitmap = await createImageBitmap(blob); } catch { return null; }
  const largura = bitmap.width, altura = bitmap.height;
  if (!largura || !altura) { bitmap.close(); return null; }
  const escala = miniatura ? Math.min(1, 1000 / Math.max(largura, altura)) : escalaIdeal(largura, altura);
  const novoCanvas = (w, h) => {
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
    const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
  };

  // 1) escala + cinza + contraste, na orientação original
  const w = Math.round(largura * escala), h = Math.round(altura * escala);
  const c1 = novoCanvas(w, h);
  const ctx1 = c1.getContext('2d', { willReadFrequently: true });
  ctx1.imageSmoothingEnabled = true;
  ctx1.imageSmoothingQuality = 'high';
  ctx1.fillStyle = '#fff'; ctx1.fillRect(0, 0, w, h);
  ctx1.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  let cinza = paraCinza(ctx1.getImageData(0, 0, w, h).data, w, h);
  if (contraste) cinza = estirarContraste(cinza);

  // 2) inclinação: estimada numa versão reduzida e binarizada (rápido e
  // sem ser enganado por gradiente de fundo)
  let angulo = rotacao;
  {
    const fator = Math.min(1, 900 / Math.max(w, h));
    const wr = Math.max(1, Math.round(w * fator)), hr = Math.max(1, Math.round(h * fator));
    const reduzida = new Uint8Array(wr * hr);
    for (let y = 0; y < hr; y++) {
      const yo = Math.min(h - 1, Math.floor(y / fator));
      for (let x = 0; x < wr; x++) reduzida[y * wr + x] = cinza[yo * w + Math.min(w - 1, Math.floor(x / fator))];
    }
    const binReduzida = binarizarAdaptativo(reduzida, wr, hr);
    if (deskew) {
      const g0 = girarMatriz(binReduzida, wr, hr, rotacao);
      const a = estimarInclinacao(g0.img, g0.largura, g0.altura);
      if (Math.abs(a) >= INCLINACAO_MINIMA) angulo += a;
    }
  }

  // 3) devolve o cinza pro canvas, gira (se precisar) e binariza no fim
  const g = geometria(largura, altura, escala, angulo);
  const rgba = ctx1.createImageData(w, h);
  for (let i = 0, j = 0; i < cinza.length; i++, j += 4) { rgba.data[j] = rgba.data[j + 1] = rgba.data[j + 2] = cinza[i]; rgba.data[j + 3] = 255; }
  ctx1.putImageData(rgba, 0, 0);
  let canvasFinal = c1;
  if (angulo) {
    const c2 = novoCanvas(g.largura, g.altura);
    const ctx2 = c2.getContext('2d', { willReadFrequently: true });
    ctx2.fillStyle = '#fff'; ctx2.fillRect(0, 0, g.largura, g.altura);
    ctx2.translate(g.largura / 2, g.altura / 2);
    ctx2.rotate((-angulo * Math.PI) / 180);
    ctx2.imageSmoothingQuality = 'high';
    ctx2.drawImage(c1, -w / 2, -h / 2);
    canvasFinal = c2;
  }
  if (binarizar) {
    const ctx = canvasFinal.getContext('2d', { willReadFrequently: true });
    const dados = ctx.getImageData(0, 0, canvasFinal.width, canvasFinal.height);
    const bin = binarizarAdaptativo(paraCinza(dados.data, canvasFinal.width, canvasFinal.height), canvasFinal.width, canvasFinal.height, { k });
    for (let i = 0, j = 0; i < bin.length; i++, j += 4) { dados.data[j] = dados.data[j + 1] = dados.data[j + 2] = bin[i]; dados.data[j + 3] = 255; }
    ctx.putImageData(dados, 0, 0);
  }
  const saida = canvasFinal.convertToBlob
    ? await canvasFinal.convertToBlob({ type: 'image/png' })
    : await new Promise((ok) => canvasFinal.toBlob(ok, 'image/png'));
  return { blob: saida, geometria: g };
}
