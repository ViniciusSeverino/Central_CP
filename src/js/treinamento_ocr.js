// src/js/treinamento_ocr.js
//
// Aba Treinamento do OCR (só administrador): o administrador abre uma nota
// que já passou pela esteira inteira (paga), vê o documento e indica, campo
// por campo, ONDE está o valor certo -- desenhando um retângulo (ver
// captura_documento.js). Cada indicação vira uma dica de extração do
// FORNECEDOR (fornecedor_extracao_hints: âncora de texto + posição + tipo
// da página), que o leitor (leitor_documentos.js) usa nas próximas notas
// dele. O valor lançado na nota é o gabarito: mostra se o leitor acerta
// hoje e se o que foi indicado confere.
//
// Este módulo é a parte pura (sem DOM, sem rede): quais notas entram, os
// campos de cada uma, como montar a dica. A tela é ui_treinamento.js; os
// eventos, events_treinamento.js.
import { REGEX_POR_CAMPO, derivarAncora } from './aprendizado_extracao.js';
import { derivarPosicao } from './extracao_posicional.js';
import { gabaritoDaNota, confere } from './ocr_acerto.js';

// Notas que já passaram pela esteira inteira e ainda têm o anexo (o
// arquivamento apaga o PDF do Storage -- ver arquivarAnexosNotas em db.js).
export function notasParaTreino(notas) {
  return (notas || []).filter(n => n.status === 'pago' && (n.anexos || []).length && !n.anexo_arquivado_em);
}

// Lista agrupada por fornecedor -- quem tem mais notas primeiro (treinar um
// fornecedor de muitas notas rende mais) e, dentro dele, as mais recentes.
// treinadas: Set de nota_id já treinadas; soPendentes: esconde as treinadas.
export function gruposParaTreino(notas, { fornecedores = [], treinadas = new Set(), busca = '', soPendentes = false } = {}) {
  const porId = new Map(fornecedores.map(f => [f.id, f]));
  const alvo = String(busca || '').trim().toLowerCase();
  const grupos = new Map();
  for (const n of notasParaTreino(notas)) {
    const f = porId.get(n.fornecedor_id);
    const nome = f ? f.nome : 'Sem fornecedor';
    if (alvo && !nome.toLowerCase().includes(alvo) && !String(n.numero_nota || '').toLowerCase().includes(alvo)) continue;
    if (!grupos.has(n.fornecedor_id || '')) grupos.set(n.fornecedor_id || '', { fornecedorId: n.fornecedor_id, nome, cnpj: f ? f.cnpj : null, notas: [] });
    grupos.get(n.fornecedor_id || '').notas.push(n);
  }
  const lista = [...grupos.values()].map(g => ({
    ...g,
    total: g.notas.length,
    treinadas: g.notas.filter(n => treinadas.has(n.id)).length,
    notas: g.notas
      .filter(n => !soPendentes || !treinadas.has(n.id))
      .sort((a, b) => String(b.data_emissao || '').localeCompare(String(a.data_emissao || ''))),
  }));
  return lista.filter(g => g.notas.length).sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome));
}

export const ROTULO_CAMPO_TREINO = {
  numeroNota: 'Nº da nota', valor: 'Valor', cnpj: 'CNPJ do fornecedor', cpf: 'CPF do fornecedor',
  dataEmissao: 'Data de emissão', vencimento: 'Vencimento do boleto',
};

// Campos a treinar numa nota, com o valor lançado (gabarito). Documento do
// fornecedor: CNPJ ou CPF, pelo tamanho do que está no cadastro. O
// vencimento do boleto não tem gabarito (o vencimento lançado é a data de
// pagamento) -- vale o que o administrador indicar, desde que o formato
// passe.
export function camposDoTreino(nota, fornecedor) {
  const g = gabaritoDaNota(nota, fornecedor);
  const doc = String(g.documento || '').replace(/\D/g, '');
  return [
    { campo: 'numeroNota', lancado: g.numeroNota },
    { campo: 'valor', lancado: g.valor.length ? g.valor : null },
    { campo: doc.length === 11 ? 'cpf' : 'cnpj', lancado: g.documento },
    { campo: 'dataEmissao', lancado: g.dataEmissao },
    { campo: 'vencimento', lancado: null },
  ].map(c => ({ ...c, rotulo: ROTULO_CAMPO_TREINO[c.campo] }));
}

// O leitor acerta esse campo hoje? true / false / null (sem gabarito ou
// sem valor lido).
export function situacaoDoCampo(campo, lancado, lido) {
  if (lancado === null || lancado === undefined || (Array.isArray(lancado) && !lancado.length)) return null;
  if (lido === null || lido === undefined || lido === '') return false;
  return confere(campo, lido, lancado);
}

// Dica a gravar (formato de db.salvarExtracaoHint) a partir da indicação:
// a região desenhada, o texto que caiu nela, a página e o tipo dela. A
// âncora de texto (trecho logo antes do valor no texto do documento) vai
// junto -- é o plano B quando a posição não bate numa nota futura.
export function montarDica({ fornecedorId, campo, valor, textoRegiao, textoDocumento, pagina, regiao, tipoPagina }) {
  const regex = REGEX_POR_CAMPO[campo];
  const literal = regex && textoRegiao ? (textoRegiao.match(regex) || [])[1] : null;
  const ancora = literal ? derivarAncora(textoDocumento || '', literal) : '';
  return {
    fornecedor_id: fornecedorId,
    campo,
    valor_exemplo: String(valor),
    ancora: ancora || '',
    ...derivarPosicao(pagina, regiao, tipoPagina),
  };
}

// Dicas do fornecedor por campo (pra mostrar "já tem dica" na lista/cartões).
export function dicasPorCampo(hints, fornecedorId) {
  const out = {};
  for (const h of hints || []) if (h.fornecedor_id === fornecedorId && h.campo !== 'tipo') out[h.campo] = h;
  return out;
}

export const TIPOS_PAGINA = [
  ['nota_fiscal', 'Nota fiscal'], ['boleto', 'Boleto'], ['comprovante_pagamento', 'Comprovante de pagamento'],
  ['contrato', 'Contrato'], ['guia_imposto', 'Guia de imposto'], ['nao_identificado', 'Outro'],
];
