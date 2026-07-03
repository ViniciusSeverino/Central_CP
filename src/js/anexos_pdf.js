// src/js/anexos_pdf.js
//
// Padroniza os anexos de um lançamento: não importa quantos arquivos (PDF
// ou imagem) o departamento anexou, o resultado salvo é sempre UM PDF só,
// com nome no padrão da empresa — pra abrir chamado/exportar zip (ver
// zip_anexos.js) sempre lidar com um arquivo previsível por nota.
//
// Padrão de nome: BSB_{SIGLA PAGADOR}_{DD-MM VENCIMENTO}_{FORNECEDOR}_NF{Nº}_{FORMA PAGAMENTO}.pdf
// Exemplo: BSB_COND_29-07_FAZENDA_DO_BOLO_NF1080_BOLETO.pdf

const SIGLA_FORMA_PAGAMENTO = {
  'boleto bancário': 'BOLETO',
  'ted': 'TED',
  'pix': 'PIX',
};

// Maiúsculas, sem acento, só [A-Z0-9_] — mesma ideia de sanitização que
// db.js já usa pro nome do arquivo no Storage, só que também remove
// acentuação (o padrão da empresa não usa acento no nome do arquivo).
export function normalizarTexto(s) {
  return (s == null ? '' : String(s))
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function siglaFormaPagamento(forma) {
  const chave = (forma == null ? '' : String(forma)).trim().toLowerCase();
  return SIGLA_FORMA_PAGAMENTO[chave] || normalizarTexto(forma) || 'PAGTO';
}

// Aceita tanto "1080" quanto "NF-1080"/"NF 1080" já digitado pelo usuário —
// tira o "NF" duplicado antes de recolocar na frente.
export function numeroNotaLimpo(numero) {
  const limpo = normalizarTexto(numero).replace(/^NF_?/, '');
  return limpo || 'SEMNF';
}

function dataDdMm(vencimento) {
  if (!vencimento) return 'SEMDATA';
  const texto = String(vencimento);
  const mm = texto.slice(5, 7), dd = texto.slice(8, 10);
  return (dd && mm) ? `${dd}-${mm}` : 'SEMDATA';
}

export function nomeArquivoFinal({ pagadorSigla, vencimento, fornecedorNome, numeroNota, formaPagamento }) {
  const partes = [
    'BSB',
    normalizarTexto(pagadorSigla) || 'SEMPAG',
    dataDdMm(vencimento),
    normalizarTexto(fornecedorNome) || 'FORNECEDOR',
    `NF${numeroNotaLimpo(numeroNota)}`,
    siglaFormaPagamento(formaPagamento),
  ];
  return partes.join('_') + '.pdf';
}

// arquivos: [{ name, blob }] — blob pode ser um File (input de upload) ou
// um Blob baixado do Storage (anexo que já existia antes desta edição).
// Página de PDF existente é copiada como está; imagem vira uma página do
// tamanho dela mesma (sem redimensionar pra caber num papel específico).
export async function mesclarAnexosEmPdfUnico(arquivos) {
  const { PDFDocument } = await import('https://esm.sh/pdf-lib@1.17.1');
  const pdfFinal = await PDFDocument.create();
  for (const arq of arquivos) {
    const bytes = new Uint8Array(await arq.blob.arrayBuffer());
    const tipo = (arq.blob.type || '').toLowerCase();
    const nome = (arq.name || '').toLowerCase();
    const ehPdf = tipo === 'application/pdf' || nome.endsWith('.pdf');
    if (ehPdf) {
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const paginas = await pdfFinal.copyPages(doc, doc.getPageIndices());
      paginas.forEach(p => pdfFinal.addPage(p));
      continue;
    }
    const ehPng = tipo === 'image/png' || nome.endsWith('.png');
    const imagem = ehPng ? await pdfFinal.embedPng(bytes) : await pdfFinal.embedJpg(bytes);
    const pagina = pdfFinal.addPage([imagem.width, imagem.height]);
    pagina.drawImage(imagem, { x: 0, y: 0, width: imagem.width, height: imagem.height });
  }
  const bytesFinal = await pdfFinal.save();
  return new Blob([bytesFinal], { type: 'application/pdf' });
}
