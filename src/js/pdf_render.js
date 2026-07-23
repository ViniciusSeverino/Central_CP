// src/js/pdf_render.js
//
// Renderiza uma página de PDF num <canvas> (via pdf.js, carregado por CDN
// -- mesmo padrão de pdf-lib/tesseract.js já usados no app, ver
// anexos_pdf.js/ocr_imagem.js) e extrai as palavras posicionadas daquela
// página -- do texto vetorial via getTextContent() quando existe, ou via
// OCR (reaproveitando ocr_imagem.js) quando a página não tem camada de
// texto (documento escaneado). É o que faz a "ferramenta de captura" (ver
// extracao_posicional.js) funcionar em PDF, não só em imagem (Fase 2).
//
// Só roda SOB DEMANDA -- quando a pessoa ativa "Selecionar no documento"
// pra um anexo em PDF (ver events_notas.js) -- nunca no fluxo normal de
// anexar/analisar: o custo de carregar o pdf.js e renderizar página por
// página não vale a pena se ninguém for usar a seleção visual (o leitor
// de texto de sempre, pdf_texto.js, continua sendo o caminho padrão).
let pdfjsPromise = null;
function obterPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs = await import('https://esm.sh/pdfjs-dist@4.0.379/build/pdf.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc = 'https://esm.sh/pdfjs-dist@4.0.379/build/pdf.worker.mjs';
      return pdfjs;
    })();
  }
  return pdfjsPromise;
}

// Cacheia o documento aberto pelo próprio File/Blob (não pelos bytes --
// cada leitura de arrayBuffer() geraria um Uint8Array novo, invalidando
// um cache por bytes a cada navegação de página) -- evita reabrir/re-
// parsear o PDF inteiro toda vez que a pessoa troca de página na
// ferramenta de seleção.
const _cacheDocumentos = new WeakMap();
async function abrirDocumento(arquivo) {
  let doc = _cacheDocumentos.get(arquivo);
  if (doc) return doc;
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  const pdfjs = await obterPdfjs();
  doc = await pdfjs.getDocument({ data: bytes }).promise;
  _cacheDocumentos.set(arquivo, doc);
  return doc;
}

export async function numeroDePaginas(arquivo) {
  const doc = await abrirDocumento(arquivo);
  return doc.numPages;
}

// Devolve { canvas, palavras } -- canvas já desenhado (pronto pra ir na
// tela), palavras no mesmo formato { texto, x0, y0, x1, y1 } (frações
// 0..1 da página) que ocr_imagem.js produz, tratadas de forma idêntica
// por extracao_posicional.js dali em diante.
export async function renderizarPaginaPdfEmCanvas(arquivo, numeroPagina, escala = 1.5) {
  const doc = await abrirDocumento(arquivo);
  const pagina = await doc.getPage(numeroPagina);
  const viewport = pagina.getViewport({ scale: escala });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');
  await pagina.render({ canvasContext: ctx, viewport }).promise;

  const pdfjs = await obterPdfjs();
  const conteudoTexto = await pagina.getTextContent();
  // item.width/item.height já vêm em unidades de página (pontos do PDF,
  // não "espaço do texto" escalado pela fonte) -- por isso escalamos só
  // pelo fator do VIEWPORT (viewport.transform[0]/[3]), não pela matriz
  // combinada com item.transform (que já embute o tamanho da fonte e
  // duplicaria a escala, gerando caixas absurdamente grandes). O ponto de
  // origem (base/esquerda do texto) já sai certo combinando as duas
  // matrizes -- é só a translação (tx[4]/tx[5]) que interessa ali.
  const escalaX = viewport.transform[0];
  const escalaY = Math.abs(viewport.transform[3]);
  let palavras = conteudoTexto.items
    .filter((item) => item.str && item.str.trim() && item.width > 0)
    .map((item) => {
      const tx = pdfjs.Util.transform(viewport.transform, item.transform);
      const larguraPx = item.width * escalaX;
      const alturaPx = (item.height || 0) * escalaY;
      const x0px = tx[4];
      const y0px = tx[5] - alturaPx; // tx[4]/tx[5] é o ponto base (esquerda/base do texto) -- sobe pela altura pra achar o topo
      return {
        texto: item.str,
        x0: x0px / canvas.width, y0: y0px / canvas.height,
        x1: (x0px + larguraPx) / canvas.width, y1: (y0px + alturaPx) / canvas.height,
      };
    });

  // Página sem texto vetorial (documento escaneado, sem camada de texto)
  // -- roda OCR de verdade sobre o canvas já renderizado, reaproveitando
  // ocr_imagem.js (mesmo caminho já usado pra imagem, ver Fase 2).
  if (!palavras.length) {
    const { extrairTextoDeImagem } = await import('./ocr_imagem.js');
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    const resultado = await extrairTextoDeImagem(blob);
    palavras = resultado.palavras;
  }

  return { canvas, palavras };
}
