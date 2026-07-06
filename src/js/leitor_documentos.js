// src/js/leitor_documentos.js
//
// Orquestra a leitura de um anexo (documento WE9 -- "auditoria do que a
// pessoa preencheu e quais documentos anexou"): extrai o texto (PDF
// digital via pdf_texto.js, ou OCR via ocr_imagem.js pra imagem/scan),
// classifica que TIPO de documento parece ser (nota fiscal, boleto,
// comprovante de pagamento, contrato, guia de imposto) e tenta puxar os
// campos que a gente compara com o formulário (número da NF, valor,
// CNPJ/CPF, data). Tudo heurística de palavra-chave/regex -- avisa,
// nunca decide sozinho: quem confirma ou descarta é sempre a pessoa.
//
// hints (opcional, em analisarAnexo/extrairCampos/reclassificarComHints):
// dicas aprendidas por fornecedor (painel "ensinar o leitor", ver
// aprendizado_extracao.js) -- têm prioridade sobre a regex genérica,
// porque foram confirmadas por alguém pra ESSE fornecedor especificamente.
import { aplicarHints } from './aprendizado_extracao.js';
const PALAVRAS_CHAVE_POR_TIPO = {
  nota_fiscal: ['nota fiscal', 'nf-e', 'nfe', 'danfe', 'cupom fiscal', 'nfse', 'nfs-e', 'documento auxiliar'],
  boleto: ['boleto', 'ficha de compensação', 'linha digitável', 'cedente', 'sacado', 'código de barras'],
  comprovante_pagamento: ['comprovante de pagamento', 'comprovante de transferência', 'ted realizada', 'pix realizado', 'comprovante ted', 'comprovante pix'],
  contrato: ['contrato', 'cláusula', 'contratante', 'contratada', 'vigência do contrato'],
  guia_imposto: ['darf', 'gps', 'guia de recolhimento', 'darj', 'gare', 'documento de arrecadação'],
};

export const TIPO_DOCUMENTO_LABEL = {
  nota_fiscal: 'Nota fiscal', boleto: 'Boleto', comprovante_pagamento: 'Comprovante de pagamento',
  contrato: 'Contrato', guia_imposto: 'Guia de imposto', nao_identificado: 'Não identificado',
};

// Conta ocorrências de cada grupo de palavras-chave no texto (já em
// minúsculo) e escolhe o tipo com mais acertos -- empate ou zero acertos
// vira "não identificado" (não força um chute).
export function classificarTipoDocumento(texto) {
  const alvo = (texto || '').toLowerCase();
  if (!alvo.trim()) return 'nao_identificado';
  let melhorTipo = 'nao_identificado', melhorPontuacao = 0;
  for (const [tipo, palavras] of Object.entries(PALAVRAS_CHAVE_POR_TIPO)) {
    const pontuacao = palavras.reduce((s, p) => s + (alvo.includes(p) ? 1 : 0), 0);
    if (pontuacao > melhorPontuacao) { melhorPontuacao = pontuacao; melhorTipo = tipo; }
  }
  return melhorTipo;
}

function paraNumeroBr(strBr) {
  const limpo = strBr.includes(',') ? strBr.replace(/\./g, '').replace(',', '.') : strBr;
  const n = parseFloat(limpo);
  return Number.isNaN(n) ? null : n;
}

// Regex heurísticas -- documentos reais variam muito de layout, então
// isso acerta o caso comum (padrão brasileiro de NF/boleto/CNPJ/data),
// não é um parser garantido pra qualquer formato. hints (dicas aprendidas
// pro fornecedor dessa nota) têm prioridade sobre o resultado da regex
// genérica quando conseguem resolver o campo (ver aprendizado_extracao.js).
export function extrairCampos(texto, hints) {
  const campos = {};
  if (!texto) return campos;
  const mNumero = texto.match(/(?:nota fiscal|nf-?e|danfe)\D{0,20}?(\d[\d.]{2,})/i)
    || texto.match(/N[º°o]\.{0,2}\s*[:\-]?\s*(\d[\d.\-\/]{2,})/);
  if (mNumero) {
    const limpo = mNumero[1].replace(/[.\-\/]/g, '');
    if (limpo) campos.numeroNota = limpo;
  }
  const mValor = texto.match(/R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+[.,]\d{2})/);
  if (mValor) {
    const v = paraNumeroBr(mValor[1]);
    if (v !== null) campos.valor = v;
  }
  const mCnpj = texto.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/);
  if (mCnpj) campos.cnpj = mCnpj[0];
  else {
    const mCpf = texto.match(/\d{3}\.\d{3}\.\d{3}-\d{2}/);
    if (mCpf) campos.cpf = mCpf[0];
  }
  const mData = texto.match(/\d{2}\/\d{2}\/\d{4}/);
  if (mData) campos.data = mData[0];
  if (hints && hints.length) Object.assign(campos, aplicarHints(texto, hints.filter(h => h.campo !== 'tipo')));
  return campos;
}

// Reclassifica um texto já extraído (sem reprocessar PDF/OCR -- caro e
// desnecessário) com as dicas do fornecedor selecionado. Usado quando a
// pessoa escolhe o fornecedor DEPOIS de já ter anexado os documentos (a
// ordem normal do formulário), pra reaplicar o que já foi aprendido pra
// esse fornecedor especificamente.
export function reclassificarComHints(texto, hints) {
  let tipoDetectado = classificarTipoDocumento(texto);
  if (tipoDetectado === 'nao_identificado' && hints && hints.length) {
    const hintTipo = hints.find(h => h.campo === 'tipo' && h.valor_exemplo);
    if (hintTipo) tipoDetectado = hintTipo.valor_exemplo;
  }
  return { tipoDetectado, campos: extrairCampos(texto, hints) };
}

// file: File/Blob escolhido pelo usuário (ver bindAnexosArea). Devolve
// { nomeArquivo, fonte, tipoDetectado, texto, campos } -- fonte é
// 'pdf_texto' | 'ocr' | 'nao_lido' (formato não suportado, ou nada
// reconhecível: aparece assim na UI, nunca trava o anexo em si). hints:
// dicas do fornecedor já selecionado no formulário (vazio/undefined se
// ainda não escolhido -- nesse caso dá pra reaplicar depois via
// reclassificarComHints(), sem reprocessar o arquivo).
export async function analisarAnexo(file, hints) {
  const nome = file.name || '';
  const tipoMime = (file.type || '').toLowerCase();
  const ehPdf = tipoMime === 'application/pdf' || /\.pdf$/i.test(nome);
  const ehImagem = tipoMime.startsWith('image/') || /\.(jpe?g|png|webp)$/i.test(nome);

  let texto = '';
  let fonte = 'nao_lido';

  if (ehPdf) {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { extrairConteudoPdf } = await import('./pdf_texto.js');
      const resultado = await extrairConteudoPdf(bytes);
      texto = resultado.texto;
      if (texto) fonte = 'pdf_texto';
      else if (resultado.imagensSemTexto.length > 0) {
        const { extrairTextoDeImagem } = await import('./ocr_imagem.js');
        const textos = [];
        for (const img of resultado.imagensSemTexto) {
          try { textos.push(await extrairTextoDeImagem(img)); } catch { /* imagem em formato sem suporte de OCR direto */ }
        }
        texto = textos.join('\n').trim();
        if (texto) fonte = 'ocr';
      }
    } catch { /* PDF corrompido/criptografado -- fica como não lido */ }
  } else if (ehImagem) {
    try {
      const { extrairTextoDeImagem } = await import('./ocr_imagem.js');
      texto = await extrairTextoDeImagem(file);
      if (texto) fonte = 'ocr';
    } catch { /* motor de OCR indisponível (ex: sem rede pro CDN) */ }
  }

  const { tipoDetectado, campos } = texto ? reclassificarComHints(texto, hints) : { tipoDetectado: 'nao_identificado', campos: {} };
  return { nomeArquivo: nome, fonte, tipoDetectado, texto, campos };
}
