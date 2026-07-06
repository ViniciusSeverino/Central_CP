// src/js/inflate.js
//
// Descompressor DEFLATE (RFC 1951) + wrapper zlib (RFC 1950), escrito do
// zero -- sem nenhuma biblioteca externa. É o que faz o leitor de
// documentos (pdf_texto.js) funcionar sem depender de nada além do que já
// está no repositório: todo PDF salva o texto de cada página comprimido
// com /FlateDecode (zlib), então pra ler esse texto precisamos
// descomprimir esses bytes -- e não tem por que trazer uma lib de
// compressão inteira só pra isso.
//
// Implementação padrão de "tiny inflate": leitura de bits LSB-first,
// blocos stored/fixed Huffman/dynamic Huffman, árvore de Huffman via
// tabela de códigos por comprimento (algoritmo canônico do RFC 1951 §3.2.2).

class LeitorDeBits {
  constructor(bytes) {
    this.bytes = bytes;
    this.bytePos = 0;
    this.bitBuf = 0;
    this.bitCount = 0;
  }
  bit() {
    if (this.bitCount === 0) {
      this.bitBuf = this.bytes[this.bytePos++];
      this.bitCount = 8;
    }
    const b = this.bitBuf & 1;
    this.bitBuf >>= 1;
    this.bitCount--;
    return b;
  }
  bits(n) {
    let v = 0;
    for (let i = 0; i < n; i++) v |= this.bit() << i;
    return v;
  }
  alinharByte() {
    this.bitCount = 0;
  }
}

// Árvore de Huffman canônica a partir de um array de comprimentos de
// código (index = símbolo, valor = comprimento em bits; 0 = símbolo não
// usado) -- RFC 1951 §3.2.2. Representada como um Map de "comprimento
// consumido até agora, valor lido" -> símbolo, resolvida bit a bit (mais
// simples de implementar corretamente que uma árvore binária real, ao
// custo de um pouco mais de memória).
function construirHuffman(comprimentos) {
  const maxLen = Math.max(0, ...comprimentos);
  const contagemPorComprimento = new Array(maxLen + 1).fill(0);
  for (const l of comprimentos) if (l > 0) contagemPorComprimento[l]++;
  const proximoCodigo = new Array(maxLen + 1).fill(0);
  let codigo = 0;
  for (let bitlen = 1; bitlen <= maxLen; bitlen++) {
    codigo = (codigo + contagemPorComprimento[bitlen - 1]) << 1;
    proximoCodigo[bitlen] = codigo;
  }
  const mapa = new Map();
  for (let simbolo = 0; simbolo < comprimentos.length; simbolo++) {
    const len = comprimentos[simbolo];
    if (len === 0) continue;
    const c = proximoCodigo[len]++;
    mapa.set(`${len}:${c}`, simbolo);
  }
  return { mapa, maxLen };
}

function lerSimbolo(leitor, arvore) {
  let codigo = 0;
  for (let len = 1; len <= arvore.maxLen; len++) {
    codigo = (codigo << 1) | leitor.bit();
    const simbolo = arvore.mapa.get(`${len}:${codigo}`);
    if (simbolo !== undefined) return simbolo;
  }
  throw new Error('inflate: código Huffman inválido (stream corrompido ou não suportado)');
}

const ORDEM_COMPRIMENTO_CODIGOS = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
// RFC 1951 §3.2.5: código de comprimento (257-285) -> bits extras e base.
const BASE_COMPRIMENTO = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const EXTRA_COMPRIMENTO = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const BASE_DISTANCIA = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const EXTRA_DISTANCIA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];

function arvoreFixaLiteral() {
  const comprimentos = new Array(288);
  for (let i = 0; i <= 143; i++) comprimentos[i] = 8;
  for (let i = 144; i <= 255; i++) comprimentos[i] = 9;
  for (let i = 256; i <= 279; i++) comprimentos[i] = 7;
  for (let i = 280; i <= 287; i++) comprimentos[i] = 8;
  return construirHuffman(comprimentos);
}
function arvoreFixaDistancia() {
  return construirHuffman(new Array(30).fill(5));
}

function lerArvoresDinamicas(leitor) {
  const hlit = leitor.bits(5) + 257;
  const hdist = leitor.bits(5) + 1;
  const hclen = leitor.bits(4) + 4;
  const comprimentosCL = new Array(19).fill(0);
  for (let i = 0; i < hclen; i++) comprimentosCL[ORDEM_COMPRIMENTO_CODIGOS[i]] = leitor.bits(3);
  const arvoreCL = construirHuffman(comprimentosCL);

  const todosComprimentos = [];
  while (todosComprimentos.length < hlit + hdist) {
    const simbolo = lerSimbolo(leitor, arvoreCL);
    if (simbolo <= 15) {
      todosComprimentos.push(simbolo);
    } else if (simbolo === 16) {
      const repete = leitor.bits(2) + 3;
      const anterior = todosComprimentos[todosComprimentos.length - 1] || 0;
      for (let i = 0; i < repete; i++) todosComprimentos.push(anterior);
    } else if (simbolo === 17) {
      const repete = leitor.bits(3) + 3;
      for (let i = 0; i < repete; i++) todosComprimentos.push(0);
    } else {
      const repete = leitor.bits(7) + 11;
      for (let i = 0; i < repete; i++) todosComprimentos.push(0);
    }
  }
  const comprimentosLit = todosComprimentos.slice(0, hlit);
  const comprimentosDist = todosComprimentos.slice(hlit, hlit + hdist);
  return { arvoreLit: construirHuffman(comprimentosLit), arvoreDist: construirHuffman(comprimentosDist) };
}

// Descomprime um stream DEFLATE "cru" (sem cabeçalho zlib) -- RFC 1951.
export function inflateRaw(bytes) {
  const leitor = new LeitorDeBits(bytes);
  const saida = [];
  let final = false;
  while (!final) {
    final = leitor.bit() === 1;
    const tipo = leitor.bits(2);
    if (tipo === 0) {
      leitor.alinharByte();
      const len = leitor.bytes[leitor.bytePos] | (leitor.bytes[leitor.bytePos + 1] << 8);
      leitor.bytePos += 4; // pula LEN + NLEN
      for (let i = 0; i < len; i++) saida.push(leitor.bytes[leitor.bytePos++]);
      continue;
    }
    const { arvoreLit, arvoreDist } = tipo === 1
      ? { arvoreLit: arvoreFixaLiteral(), arvoreDist: arvoreFixaDistancia() }
      : lerArvoresDinamicas(leitor);
    for (;;) {
      const simbolo = lerSimbolo(leitor, arvoreLit);
      if (simbolo < 256) { saida.push(simbolo); continue; }
      if (simbolo === 256) break; // fim do bloco
      const idx = simbolo - 257;
      const comprimento = BASE_COMPRIMENTO[idx] + leitor.bits(EXTRA_COMPRIMENTO[idx]);
      const simboloDist = lerSimbolo(leitor, arvoreDist);
      const distancia = BASE_DISTANCIA[simboloDist] + leitor.bits(EXTRA_DISTANCIA[simboloDist]);
      const inicio = saida.length - distancia;
      for (let i = 0; i < comprimento; i++) saida.push(saida[inicio + i]);
    }
  }
  return Uint8Array.from(saida);
}

// zlib (RFC 1950) = 2 bytes de cabeçalho + stream deflate + 4 bytes de
// Adler-32 (não conferido aqui -- não é uma trava de segurança, só
// integridade; se o PDF estiver corrompido, o parser de texto que vem
// depois simplesmente não acha nada reconhecível).
export function inflateZlib(bytes) {
  return inflateRaw(bytes.subarray(2));
}
