// src/js/ocr_imagem.js
//
// OCR de imagem (foto/scan de papel, sem texto embutido) via tesseract.js
// -- biblioteca de código aberto, carregada por CDN (mesmo padrão de
// pdf-lib/jszip/exceljs já usados no app, ver anexos_pdf.js/zip_anexos.js/
// export_excel.js), rodando inteiramente no navegador via WebAssembly.
// Não é um serviço pago nem uma API de terceiro: nenhum dado da nota sai
// do navegador, o reconhecimento roda local.
//
// Um único worker é reaproveitado entre chamadas (inicializar o motor de
// OCR é caro -- baixa o modelo de português uma vez só por sessão).
let workerPromise = null;

function obterWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import('https://esm.sh/tesseract.js@5.1.1');
      return createWorker('por');
    })();
  }
  return workerPromise;
}

// origem: File/Blob (anexo escolhido pelo usuário) ou { bytes, mime }
// (imagem de página de PDF extraída em pdf_texto.js).
function paraBlob(origem) {
  if (origem instanceof Blob) return origem;
  return new Blob([origem.bytes], { type: origem.mime || 'image/jpeg' });
}

// Devolve as palavras reconhecidas com a posição de cada uma NA IMAGEM,
// em FRAÇÕES (0..1) -- não pixels absolutos -- pro mesmo motivo da
// posição gravada em fornecedor_extracao_hints (ver extracao_
// posicional.js): tolerar pequenas diferenças de resolução entre
// documentos do mesmo fornecedor. O Tesseract já calcula essas caixas em
// pixels durante o reconhecimento (data.words[].bbox) -- só descartava
// esse dado antes; aqui normalizamos pelas dimensões reais da imagem
// processada (createImageBitmap, sem custo de rede: o mesmo blob já está
// em memória). Se por algum motivo não der pra ler as dimensões, devolve
// lista vazia -- quem usa isso (seleção por retângulo na pré-
// visualização) simplesmente não tem hint de posição pra essa imagem.
async function extrairPalavrasPosicionadas(data, blob) {
  const bruto = (data && data.words) || [];
  if (!bruto.length) return [];
  let largura, altura;
  try {
    const bitmap = await createImageBitmap(blob);
    largura = bitmap.width; altura = bitmap.height;
    bitmap.close();
  } catch {
    return [];
  }
  if (!largura || !altura) return [];
  return bruto
    .filter(p => p.bbox && p.text && p.text.trim())
    .map(p => ({
      texto: p.text,
      x0: p.bbox.x0 / largura, y0: p.bbox.y0 / altura,
      x1: p.bbox.x1 / largura, y1: p.bbox.y1 / altura,
      conf: p.confidence,
    }));
}

// Palavras da imagem PRÉ-PROCESSADA (ver ocr_preprocesso.js) de volta em
// frações da imagem ORIGINAL -- desfaz escala e rotação, pra que hints de
// posição e a seleção na pré-visualização (que mostra a original)
// continuem batendo.
function palavrasDaImagemProcessada(data, geometria, mapear) {
  return ((data && data.words) || [])
    .filter(p => p.bbox && p.text && p.text.trim())
    .map(p => ({ texto: p.text, ...mapear(p.bbox, geometria), conf: p.confidence }));
}

// Abaixo desta confiança média (0-100, a do próprio Tesseract) a leitura
// da imagem pré-processada é conferida contra a leitura da original, e
// fica a de maior confiança -- o pré-processamento ajuda muito em foto
// ruim, mas pode atrapalhar alguma imagem que já vinha boa.
const CONFIANCA_SEM_CONFERIR = 75;

// Devolve { texto, palavras } -- texto pode vir vazio/ruim (é OCR, não é
// exato; quem usa isso trata como sugestão a conferir, nunca como verdade
// absoluta). palavras: ver extrairPalavrasPosicionadas acima -- cada uma
// com `conf` (0-100, confiança do Tesseract naquela palavra), usada pra
// marcar campos duvidosos (ver confiancaDosCampos em leitor_documentos.js). Também vem
// `confianca` (média do Tesseract, 0-100) e `preprocessada` (se a leitura
// que ficou foi a da imagem pré-processada) -- campos extras, quem não
// usa ignora.
//
// opcoes.preprocessar: true (padrão) | false | { binarizar, deskew,
// contraste } (repassado a preprocessarImagem -- usado pelo harness de
// avaliação pra comparar variações).
export async function extrairTextoDeImagem(origem, opcoes = {}) {
  const worker = await obterWorker();
  const blob = paraBlob(origem);
  const preprocessar = opcoes.preprocessar === undefined ? true : opcoes.preprocessar;

  let processada = null;
  if (preprocessar) {
    try {
      const { preprocessarImagem, mapearCaixaParaOriginal } = await import('./ocr_preprocesso.js');
      const pre = await preprocessarImagem(blob, typeof preprocessar === 'object' ? preprocessar : {});
      if (pre) {
        const { data } = await worker.recognize(pre.blob);
        processada = {
          texto: (data && data.text || '').trim(),
          palavras: palavrasDaImagemProcessada(data, pre.geometria, mapearCaixaParaOriginal),
          confianca: (data && data.confidence) || 0,
          preprocessada: true,
        };
      }
    } catch { processada = null; /* sem canvas/formato sem suporte: segue com a original */ }
  }
  if (processada && processada.confianca >= CONFIANCA_SEM_CONFERIR) return processada;

  const { data } = await worker.recognize(blob);
  const original = {
    texto: (data && data.text || '').trim(),
    palavras: await extrairPalavrasPosicionadas(data, blob),
    confianca: (data && data.confidence) || 0,
    preprocessada: false,
  };
  return processada && processada.confianca > original.confianca ? processada : original;
}

// Chamado quando não há mais nenhuma análise pendente (ex: fechando o
// modal) -- libera o worker/WASM. Não é obrigatório chamar (o worker
// também pode ficar vivo pro resto da sessão, reaproveitado em anexos
// seguintes), só evita segurar memória à toa por muito tempo.
export async function encerrarOcr() {
  if (!workerPromise) return;
  const worker = await workerPromise;
  workerPromise = null;
  await worker.terminate();
}
