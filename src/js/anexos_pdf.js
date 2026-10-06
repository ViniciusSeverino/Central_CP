// src/js/anexos_pdf.js
//
// Padroniza os anexos de um lançamento: não importa quantos arquivos (PDF
// ou imagem) o departamento anexou, o resultado salvo é sempre UM PDF só,
// com nome no padrão da empresa — pra abrir chamado/exportar zip (ver
// zip_anexos.js) sempre lidar com um arquivo previsível por nota.
//
// Padrão de nome: {SIGLA PAGADOR}_BSB_{DD-MM VENCIMENTO}_{FORNECEDOR}_NF{Nº}_{FORMA PAGAMENTO}.pdf
// Exemplo: COND_BSB_29-07_FAZENDA_DO_BOLO_NF1080_BOLETO.pdf
// (até out/2026 era BSB_{PAGADOR}_...; os arquivos antigos são convertidos
// por nomeNovoPadrao, abaixo.)

const SIGLA_FORMA_PAGAMENTO = {
  'boleto bancário': 'BOLETO',
  'ted': 'TED',
  'pix': 'PIX',
  'débito automático': 'DDA',
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
    normalizarTexto(pagadorSigla) || 'SEMPAG',
    'BSB',
    dataDdMm(vencimento),
    normalizarTexto(fornecedorNome) || 'FORNECEDOR',
    `NF${numeroNotaLimpo(numeroNota)}`,
    siglaFormaPagamento(formaPagamento),
  ];
  return partes.join('_') + '.pdf';
}

// Caminho no padrão antigo (".../BSB_COND_29-07_...pdf") -> mesmo caminho
// no padrão novo (".../COND_BSB_29-07_...pdf"); null quando já está no
// padrão novo ou não segue padrão nenhum. Rodar de novo no resultado dá
// null -- é isso que deixa a conversão em massa (ver
// renomearAnexosPadraoAntigo em renomear_anexos.js) segura para repetir.
export function nomeNovoPadrao(caminho) {
  if (!caminho) return null;
  const barra = caminho.lastIndexOf('/');
  const pasta = caminho.slice(0, barra + 1);
  const arquivo = caminho.slice(barra + 1);
  const m = /^BSB_([A-Z0-9]+)_(.+)$/.exec(arquivo);
  if (!m || m[1] === 'BSB') return null;
  return `${pasta}${m[1]}_BSB_${m[2]}`;
}

// Desfaz a mesclagem: um File de UMA página por página do PDF salvo, na
// ordem. Usado na correção de um lançamento (ver anexos_desmembrar.js)
// pra quem corrige poder reordenar, trocar ou tirar uma página específica;
// ao salvar, mesclarAnexosEmPdfUnico junta tudo de novo, na nova ordem.
// Cada File leva _paginaOriginal (nº da página no PDF de origem) e
// _totalPaginas, só pra exibição.
export async function dividirPdfEmPaginas(blob) {
  const { PDFDocument } = await import('https://esm.sh/pdf-lib@1.17.1');
  const doc = await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()), { ignoreEncryption: true });
  const total = doc.getPageCount();
  const paginas = [];
  for (let i = 0; i < total; i++) {
    const unica = await PDFDocument.create();
    const [pagina] = await unica.copyPages(doc, [i]);
    unica.addPage(pagina);
    const arquivo = new File([await unica.save()], `Página ${i + 1} de ${total}.pdf`, { type: 'application/pdf' });
    arquivo._paginaOriginal = i + 1;
    arquivo._totalPaginas = total;
    paginas.push(arquivo);
  }
  return paginas;
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
