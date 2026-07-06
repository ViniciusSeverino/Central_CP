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

// Devolve o texto reconhecido (pode vir vazio/ruim -- é OCR, não é exato;
// quem usa isso trata como sugestão a conferir, nunca como verdade absoluta).
export async function extrairTextoDeImagem(origem) {
  const worker = await obterWorker();
  const { data } = await worker.recognize(paraBlob(origem));
  return (data && data.text || '').trim();
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
