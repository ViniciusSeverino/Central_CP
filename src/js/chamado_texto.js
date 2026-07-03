// src/js/chamado_texto.js
//
// Título e tabela padrão de abertura de chamado pro CSC (documento WE9
// "Processos de Contas a Pagar" -- "Padrão de Abertura de Chamado"),
// gerados a partir dos dados que o lote (pagador + vencimento) já tem no
// Central CP, prontos pra copiar e colar na descrição do Freshdesk.
//
// Duas simplificações deliberadas em relação ao documento original:
// - "Vencimento Original" sai igual a "Vencimento Net Empresa" -- o
//   Central CP não guarda um vencimento "antes do ajuste bancário"
//   separado, e a própria regra do documento ("Ajuste de Vencimento":
//   o vencimento no sistema deve ser o mesmo em que o pagamento será
//   debitado no banco) diz que os dois devem coincidir de qualquer jeito.
// - PF/PJ é calculado na hora, contando os dígitos do CPF/CNPJ cadastrado
//   (11 = PF, 14 = PJ) -- não é um campo à parte, pra não duplicar um
//   dado que já existe no cadastro do fornecedor.
import { app, resolverLabelsNota, fmtDate, fmtMoney } from './state.js';
import { siglaFormaPagamento, normalizarTexto } from './anexos_pdf.js';

const SIGLA_SHOPPING = 'BSB';

const TIPO_CONTRATACAO_LABEL = { sob_demanda: 'SOB DEMANDA', mensal: 'MENSAL' };

export function pessoaTipo(cnpjOuCpf) {
  const digitos = (cnpjOuCpf || '').replace(/\D/g, '');
  if (digitos.length === 11) return 'PF';
  if (digitos.length === 14) return 'PJ';
  return '—';
}

function notasDoLote(ids) {
  return (ids || []).map(id => app.notas.find(n => n.id === id)).filter(Boolean);
}

// "SIGLA SHOPPING_DESPESA_{pagador}_{período de vencimentos}" -- ex.:
// BSB_DESPESA_COND_01.07 ATÉ 05.08.2026.
export function tituloChamado(ids) {
  const notas = notasDoLote(ids);
  if (notas.length === 0) return '';
  const pagador = app.cadastros.pagadores.find(p => p.id === notas[0].pagador_id);
  const pagadorSigla = pagador ? normalizarTexto(pagador.sigla || pagador.nome) : 'SEMPAG';
  const vencimentos = notas.map(n => n.vencimento).filter(Boolean).sort();
  if (vencimentos.length === 0) return `${SIGLA_SHOPPING}_DESPESA_${pagadorSigla}`;
  const de = vencimentos[0], ate = vencimentos[vencimentos.length - 1];
  const periodo = `${de.slice(8, 10)}.${de.slice(5, 7)} ATÉ ${ate.slice(8, 10)}.${ate.slice(5, 7)}.${ate.slice(0, 4)}`;
  return `${SIGLA_SHOPPING}_DESPESA_${pagadorSigla}_${periodo}`;
}

// Uma linha por nota do lote, na ordem exata de colunas que o CSC espera
// (Vencimento Net Empresa, Vencimento Original, Data de Emissão, Nº NF,
// PF/PJ, Contrato, Fornecedor, Descrição, Canal de Pagamento, Débito).
export function linhasChamado(ids) {
  return notasDoLote(ids).map(n => {
    const lbl = resolverLabelsNota(n);
    const forn = app.cadastros.fornecedores.find(f => f.id === n.fornecedor_id);
    return {
      vencimentoNetEmpresa: fmtDate(n.vencimento),
      vencimentoOriginal: fmtDate(n.vencimento),
      dataEmissao: fmtDate(n.data_emissao),
      numeroNf: n.numero_nota || '—',
      pfPj: pessoaTipo(forn && forn.cnpj),
      contrato: TIPO_CONTRATACAO_LABEL[n.tipo_contratacao] || '—',
      fornecedor: lbl.fornecedor_label,
      descricao: n.descricao || '—',
      canalPagamento: siglaFormaPagamento(n.forma_pagamento),
      debito: Number(n.valor_bruto) || 0,
    };
  });
}

export function totalChamado(linhas) {
  return linhas.reduce((s, l) => s + l.debito, 0);
}
