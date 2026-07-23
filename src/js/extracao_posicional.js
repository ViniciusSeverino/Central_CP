// src/js/extracao_posicional.js
//
// "Ferramenta de captura": em vez de só digitar o valor, a pessoa desenha
// um retângulo sobre a pré-visualização do documento (imagem ou página de
// PDF) marcando ONDE aquele campo fica. Isso complementa a âncora de texto
// (aprendizado_extracao.js) -- é uma segunda forma de ensinar o leitor,
// guardada em paralelo por fornecedor (ver migration
// 0037_fornecedor_extracao_hints_posicao.sql).
//
// Tudo aqui é puro (sem I/O, sem DOM): trabalha só com listas de
// "palavras posicionadas" -- { texto, x0, y0, x1, y1 }, coordenadas em
// FRAÇÕES da página/imagem (0 a 1), não pixels absolutos, pra tolerar
// pequenas diferenças de escala/resolução entre documentos do mesmo
// fornecedor. Essas palavras vêm de duas fontes tratadas de forma
// idêntica a partir daqui: do Tesseract (ocr_imagem.js, pra imagens e
// páginas de PDF escaneado) ou do pdf.js (pdf_render.js, pra PDFs com
// texto vetorial). Quem desenha o retângulo na tela e quem lê pixels de
// verdade fica em outros módulos.
import { REGEX_POR_CAMPO } from './aprendizado_extracao.js';

// Concatena o texto das palavras cujo CENTRO cai dentro do retângulo
// (frações 0..1), em ordem de leitura (linha por linha de cima pra baixo;
// dentro de cada linha, da esquerda pra direita). Usar o centro -- não
// interseção de área -- evita que uma palavra cortada na borda do
// retângulo entre ou saia de forma imprevisível.
export function encontrarTextoNaRegiao(palavras, retangulo) {
  if (!palavras || !palavras.length || !retangulo) return '';
  const { x, y, largura, altura } = retangulo;
  const x1 = x + largura;
  const y1 = y + altura;
  const dentro = palavras.filter((p) => {
    const cx = (p.x0 + p.x1) / 2;
    const cy = (p.y0 + p.y1) / 2;
    return cx >= x && cx <= x1 && cy >= y && cy <= y1;
  });
  if (!dentro.length) return '';

  // Agrupa em linhas por proximidade vertical (metade da altura média das
  // palavras encontradas) -- sem isso, um retângulo cobrindo duas linhas
  // (ex: "CNPJ:" numa linha e o número na debaixo) pode sair fora de
  // ordem ao ordenar só por x.
  const alturaMedia = dentro.reduce((s, p) => s + (p.y1 - p.y0), 0) / dentro.length;
  const tolerancia = alturaMedia / 2 || 0.01;
  const ordenadas = [...dentro].sort((a, b) => a.y0 - b.y0);
  const linhas = [];
  for (const p of ordenadas) {
    let linha = linhas.find((l) => Math.abs(l.y0 - p.y0) <= tolerancia);
    if (!linha) { linha = { y0: p.y0, palavras: [] }; linhas.push(linha); }
    linha.palavras.push(p);
  }
  return linhas
    .sort((a, b) => a.y0 - b.y0)
    .map((l) => l.palavras.sort((a, b) => a.x0 - b.x0).map((p) => p.texto).join(' '))
    .join(' ')
    .trim();
}

function paraNumeroBr(strBr) {
  const limpo = strBr.includes(',') ? strBr.replace(/\./g, '').replace(',', '.') : strBr;
  const n = parseFloat(limpo);
  return Number.isNaN(n) ? null : n;
}

// A partir do texto encontrado dentro do retângulo, extrai o valor no
// formato esperado pro campo -- mesmos formatos usados pela âncora de
// texto (REGEX_POR_CAMPO, de aprendizado_extracao.js), aplicados aqui
// sobre o texto inteiro da seleção (não numa janela depois de uma âncora,
// já que a pessoa escolheu a região exata).
export function extrairValorDaRegiao(campo, texto) {
  if (!texto) return null;
  if (campo === 'tipo') return texto.trim() || null;
  const regex = REGEX_POR_CAMPO[campo];
  if (!regex) return null;
  const m = texto.match(regex);
  if (!m) return null;
  if (campo === 'valor') return paraNumeroBr(m[1]);
  if (campo === 'numeroNota') return m[1].replace(/[.\-\/]/g, '');
  return m[1];
}

// Empacota o retângulo desenhado (frações 0..1) + página, no formato que
// db.salvarExtracaoHint espera gravar em fornecedor_extracao_hints.
export function derivarPosicao(pagina, retangulo) {
  return {
    pagina: pagina || 1,
    pos_x: retangulo.x,
    pos_y: retangulo.y,
    pos_largura: retangulo.largura,
    pos_altura: retangulo.altura,
  };
}

// hints: hints já filtrados pro fornecedor da nota atual (mesmo array que
// aprendizado_extracao.js/aplicarHints recebe) -- só os que têm posição
// gravada (pos_x etc. não nulos) são considerados aqui; hints só-âncora
// são ignorados (ver aplicarHints). palavrasPorPagina: { [pagina]:
// palavras[] } do documento ATUAL -- só existe quando o leitor conseguiu
// gerar palavras posicionadas pra esse arquivo (ver ocr_imagem.js/
// pdf_render.js); undefined/vazio faz esta função devolver {} sem erro,
// pra documentos ainda sem esse suporte.
//
// Devolve só os campos que uma posição aprendida conseguiu resolver de
// verdade NESSE documento (região vazia, ou com texto que não bate no
// formato esperado, não entra no resultado) -- quem chama decide o que
// fazer com o resto (cair pra âncora de texto, ou perguntar de novo).
export function aplicarHintsDePosicao(hints, palavrasPorPagina) {
  const resultado = {};
  if (!hints || !hints.length || !palavrasPorPagina) return resultado;
  for (const hint of hints) {
    if (hint.pos_x == null || hint.pos_y == null || hint.pos_largura == null || hint.pos_altura == null) continue;
    const palavras = palavrasPorPagina[hint.pagina || 1];
    if (!palavras || !palavras.length) continue;
    const texto = encontrarTextoNaRegiao(palavras, {
      x: hint.pos_x, y: hint.pos_y, largura: hint.pos_largura, altura: hint.pos_altura,
    });
    if (!texto) continue;
    const valor = extrairValorDaRegiao(hint.campo, texto);
    if (valor !== null && valor !== undefined) resultado[hint.campo] = valor;
  }
  return resultado;
}
