// src/js/documentos_obrigatorios.js
//
// Regras de "quais documentos essa nota deveria ter anexado", derivadas
// do que já está modelado no formulário (forma de pagamento, tipo de
// contratação, retenção de imposto) -- ponto de partida alinhado com o
// documento WE9, mas é uma REGRA DE NEGÓCIO que pode precisar de ajuste
// depois de conferir com o Contas a Pagar/CSC. Só aponta o que falta,
// nunca bloqueia o lançamento (mesma filosofia dos outros avisos do app:
// contrato vencido, NF duplicada, soma de rateio).
export function documentosObrigatoriosPara(payload) {
  const lista = [{ tipo: 'nota_fiscal', label: 'Nota fiscal (ou documento fiscal equivalente)' }];
  if (payload.forma_pagamento === 'Boleto bancário') {
    lista.push({ tipo: 'boleto', label: 'Boleto bancário' });
  }
  if (payload.forma_pagamento === 'TED' || payload.forma_pagamento === 'Pix') {
    lista.push({ tipo: 'comprovante_pagamento', label: 'Comprovante de pagamento (TED/Pix)' });
  }
  if (payload.tipo_contratacao === 'mensal') {
    lista.push({ tipo: 'contrato', label: 'Contrato vigente' });
  }
  if (payload.tem_retencao_imposto) {
    lista.push({ tipo: 'guia_imposto', label: 'Guia de recolhimento do imposto retido' });
  }
  return lista;
}

function normalizarNumero(s) {
  return String(s == null ? '' : s).replace(/\D/g, '').replace(/^0+/, '');
}

// analises: lista de resultados de leitor_documentos.analisarAnexo(), um
// por arquivo anexado (antes da mesclagem em PDF único, ver
// anexos_pdf.js -- é só nesse momento que ainda dá pra falar de "cada
// documento" em vez de "o anexo final").
export function auditarAnexos(payload, analises) {
  const obrigatorios = documentosObrigatoriosPara(payload);
  const tiposPresentes = new Set((analises || []).map(a => a.tipoDetectado));
  const faltando = obrigatorios.filter(o => !tiposPresentes.has(o.tipo));

  const divergencias = [];
  for (const a of analises || []) {
    if (a.tipoDetectado !== 'nota_fiscal') continue;
    const c = a.campos || {};
    if (c.numeroNota && payload.numero_nota && normalizarNumero(c.numeroNota) !== normalizarNumero(payload.numero_nota)) {
      divergencias.push(`O número da NF no documento "${a.nomeArquivo}" (${c.numeroNota}) não bate com o número digitado no formulário (${payload.numero_nota}).`);
    }
    if (c.valor != null && payload.valor_bruto && Math.abs(c.valor - Number(payload.valor_bruto)) > 0.01) {
      divergencias.push(`O valor no documento "${a.nomeArquivo}" (R$ ${c.valor.toFixed(2)}) não bate com o valor bruto digitado (R$ ${Number(payload.valor_bruto).toFixed(2)}).`);
    }
  }
  return { obrigatorios, faltando, divergencias };
}
