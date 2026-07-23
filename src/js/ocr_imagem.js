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
    }));
}

// Devolve { texto, palavras } -- texto pode vir vazio/ruim (é OCR, não é
// exato; quem usa isso trata como sugestão a conferir, nunca como verdade
// absoluta). palavras: ver extrairPalavrasPosicionadas acima.
export async function extrairTextoDeImagem(origem) {
  const worker = await obterWorker();
  const blob = paraBlob(origem);
  const { data } = await worker.recognize(blob);
  const texto = (data && data.text || '').trim();
  const palavras = await extrairPalavrasPosicionadas(data, blob);
  return { texto, palavras };
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
