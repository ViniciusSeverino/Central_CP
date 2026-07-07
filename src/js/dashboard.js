// src/js/dashboard.js
//
// Indicadores da aba "Visão geral" -- lógica pura (sem DOM), computada a
// partir de app.notas + app.cadastros.pagadores. Usa o mesmo "valor
// líquido quando há retenção, bruto senão" que o resto do app já usa pra
// saber quanto de fato sai do caixa (ver chamado_texto.js).
import { STEPS, STATUS_LABEL } from './state.js';
import { statusPrazo } from './prazo_despesa.js';

function valorEfetivo(n) {
  return Number(n.tem_retencao_imposto ? n.valor_liquido : n.valor_bruto) || 0;
}

const ETAPAS_ATIVAS = STEPS.filter(s => s !== 'pago');

// 1) Valor parado em cada etapa ativa da esteira (exclui pago -- já saiu
// da esteira) -- uma nota pendente continua contada na etapa em que
// travou (pendente não é status, é uma flag à parte).
export function valorPorEtapa(notas) {
  return ETAPAS_ATIVAS.map(status => {
    const doStatus = notas.filter(n => n.status === status);
    return { status, label: STATUS_LABEL[status], quantidade: doStatus.length, valor: doStatus.reduce((s, n) => s + valorEfetivo(n), 0) };
  });
}

function isoData(v) { return v ? String(v).slice(0, 10) : null; }

// 2) Duas leituras de "atrasada/perto do prazo" -- vencimento (existe
// desde o lançamento, é o que o departamento acompanha no dia a dia) e
// prazo do CSC (só existe depois que o chamado foi aberto, ver
// prazo_despesa.js) -- são coisas diferentes, por isso vêm separadas, não
// somadas num número só.
export function alertasDePrazo(notas, hoje = new Date(), diasAlerta = 3) {
  const hojeIso = isoData(hoje.toISOString());
  const limiteIso = isoData(new Date(hoje.getTime() + diasAlerta * 86400000).toISOString());
  const ativas = notas.filter(n => n.status !== 'pago' && n.status !== 'cancelada');

  const vencimentoAtrasado = ativas.filter(n => isoData(n.vencimento) && isoData(n.vencimento) < hojeIso).length;
  const vencimentoProximo = ativas.filter(n => isoData(n.vencimento) && isoData(n.vencimento) >= hojeIso && isoData(n.vencimento) <= limiteIso).length;

  let prazoCscAtrasado = 0, prazoCscProximo = 0;
  ativas.filter(n => n.data_chamado).forEach(n => {
    const st = statusPrazo(n.tipo_despesa_prazo, n.data_chamado, hoje);
    if (!st) return;
    if (st.atrasado) prazoCscAtrasado++;
    else if (st.diasRestantes <= diasAlerta) prazoCscProximo++;
  });

  return { vencimentoAtrasado, vencimentoProximo, prazoCscAtrasado, prazoCscProximo };
}

// 3) Volume por setor/pagador na competência informada (AAAA-MM) -- só
// notas ainda válidas (exclui cancelada, essa não representa gasto real).
export function volumePorSetorPagadorNoMes(notas, competenciaIso, pagadores) {
  const doMes = notas.filter(n => n.status !== 'cancelada' && isoData(n.competencia) && isoData(n.competencia).slice(0, 7) === competenciaIso);
  const porSetor = {};
  const porPagador = {};
  doMes.forEach(n => {
    const setor = n.setor || '(sem setor)';
    porSetor[setor] = (porSetor[setor] || 0) + valorEfetivo(n);
    const pagador = (pagadores.find(p => p.id === n.pagador_id) || {}).nome || '(sem pagador)';
    porPagador[pagador] = (porPagador[pagador] || 0) + valorEfetivo(n);
  });
  const paraLista = (obj) => Object.entries(obj).map(([label, valor]) => ({ label, valor })).sort((a, b) => b.valor - a.valor);
  return { porSetor: paraLista(porSetor), porPagador: paraLista(porPagador), total: doMes.reduce((s, n) => s + valorEfetivo(n), 0), quantidade: doMes.length };
}

function diasEntreIso(isoA, isoB) {
  const a = new Date(isoData(isoA) + 'T00:00:00Z').getTime();
  const b = new Date(isoData(isoB) + 'T00:00:00Z').getTime();
  return Math.round((b - a) / 86400000);
}

// 4) Tempo médio (dias corridos) entre o lançamento e o pagamento
// confirmado -- só notas já pagas (null se nenhuma nota paga ainda, não
// tem o que medir).
export function tempoMedioAtePagamento(notas) {
  const pagas = notas.filter(n => n.status === 'pago' && n.data_pagamento && n.criado_em);
  if (!pagas.length) return null;
  const dias = pagas.map(n => diasEntreIso(n.criado_em, n.data_pagamento));
  const media = dias.reduce((s, d) => s + d, 0) / dias.length;
  return { media: Math.round(media * 10) / 10, quantidade: pagas.length };
}
