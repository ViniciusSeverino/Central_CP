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
// Abaixo desta (ou com pouquíssimas palavras) a página pode estar de
// lado/de cabeça pra baixo: tenta as outras orientações possíveis.
const CONFIANCA_TENTAR_ORIENTACAO = 60;
const PALAVRAS_MINIMAS = 5;

async function lerPreprocessada(worker, blob, opcoesPre, rotacao) {
  const { preprocessarImagem, mapearCaixaParaOriginal } = await import('./ocr_preprocesso.js');
  const pre = await preprocessarImagem(blob, { ...opcoesPre, rotacao });
  if (!pre) return null;
  const { data } = await worker.recognize(pre.blob);
  return {
    texto: (data && data.text || '').trim(),
    palavras: palavrasDaImagemProcessada(data, pre.geometria, mapearCaixaParaOriginal),
    confianca: (data && data.confidence) || 0,
    preprocessada: true,
    rotacao,
  };
}
const fraca = (r) => !r || r.confianca < CONFIANCA_TENTAR_ORIENTACAO || r.palavras.length < PALAVRAS_MINIMAS;

// Qual orientação (90/180/270) lê melhor, pela confiança do Tesseract numa
// MINIATURA da imagem (leitura rápida). null se nenhuma ganha da atual
// (confiancaAtual) com folga -- girar à toa custa uma leitura inteira.
const FOLGA_ORIENTACAO = 10;
async function melhorOrientacao(worker, blob, opcoesPre, confiancaAtual) {
  const { preprocessarImagem } = await import('./ocr_preprocesso.js');
  let melhor = null;
  for (const rotacao of [90, 180, 270]) {
    const pre = await preprocessarImagem(blob, { ...opcoesPre, rotacao, miniatura: true });
    if (!pre) return null;
    const { data } = await worker.recognize(pre.blob);
    const conf = (data && data.confidence) || 0;
    if (!melhor || conf > melhor.conf) melhor = { rotacao, conf };
  }
  return melhor && melhor.conf > confiancaAtual + FOLGA_ORIENTACAO ? melhor.rotacao : null;
}

// Devolve { texto, palavras } -- texto pode vir vazio/ruim (é OCR, não é
// exato; quem usa isso trata como sugestão a conferir, nunca como verdade
// absoluta). palavras: ver extrairPalavrasPosicionadas acima -- cada uma
// com `conf` (0-100, confiança do Tesseract naquela palavra), usada pra
// marcar campos duvidosos (ver confiancaDosCampos em leitor_documentos.js).
// Também vem `confianca` (média do Tesseract, 0-100), `preprocessada` (se
// a leitura que ficou foi a da imagem pré-processada) e `rotacao` (0/90/
// 180/270: quanto a página estava girada) -- campos extras, quem não usa
// ignora. As caixas das palavras são sempre da imagem ORIGINAL, girada ou
// não.
//
// Orientação: quando a leitura sai fraca, a página pode estar de lado ou
// de cabeça pra baixo. Compara a confiança de uma leitura rápida (em
// miniatura) girando 90/180/270 e, se alguma ganhar com folga, relê a
// imagem inteira nessa orientação. Só custa leituras extras em imagem
// ruim ou girada -- documento normal sai na primeira leitura.
//
// opcoes.preprocessar: true (padrão) | false | { binarizar, deskew,
// contraste, k } (repassado a preprocessarImagem -- usado pelo harness de
// avaliação pra comparar variações).
export async function extrairTextoDeImagem(origem, opcoes = {}) {
  const worker = await obterWorker();
  const blob = paraBlob(origem);
  const preprocessar = opcoes.preprocessar === undefined ? true : opcoes.preprocessar;
  const opcoesPre = typeof preprocessar === 'object' ? preprocessar : {};

  let processada = null;
  if (preprocessar) {
    try {
      processada = await lerPreprocessada(worker, blob, opcoesPre, 0);
      if (processada && fraca(processada)) {
        const rotacao = await melhorOrientacao(worker, blob, opcoesPre, processada.confianca);
        if (rotacao) {
          const girada = await lerPreprocessada(worker, blob, opcoesPre, rotacao);
          if (girada && girada.confianca > processada.confianca) processada = girada;
        }
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
    rotacao: 0,
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
