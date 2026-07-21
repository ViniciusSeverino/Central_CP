// dashboard.js: indicadores da aba "Visão geral" -- lógica pura computada
// a partir de app.notas (sem DOM). Cobre os 5 indicadores escolhidos:
// valor parado por etapa da esteira, alertas de prazo (vencimento e
// prazo do CSC), volume por setor/pagador no mês, tempo médio até
// pagamento, e impostos a provisionar no mês seguinte.
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checarIgual, checarSemErrosNaoTratados, relatorioFinal } from './lib/assert.mjs';

const { erros } = await bootApp(PERFIS.administrador);
const { valorPorEtapa, alertasDePrazo, volumePorSetorPagadorNoMes, tempoMedioAtePagamento, impostosAProvisionarNoMes } = await import('./app/src/js/dashboard.js');

// 1) valorPorEtapa: soma por status, ignora "pago" (já saiu da esteira) e
// usa valor líquido quando há retenção de imposto.
const notasEtapas = [
  { status: 'lancado', valor_bruto: 100, tem_retencao_imposto: false },
  { status: 'lancado', valor_bruto: 50, tem_retencao_imposto: false },
  { status: 'aprovado', valor_bruto: 200, valor_liquido: 180, tem_retencao_imposto: true },
  { status: 'pago', valor_bruto: 999, tem_retencao_imposto: false },
];
const etapas = valorPorEtapa(notasEtapas);
checarIgual(etapas.find(e => e.status === 'lancado').valor, 150, 'valorPorEtapa soma o valor bruto das notas "lancado"');
checarIgual(etapas.find(e => e.status === 'lancado').quantidade, 2, 'valorPorEtapa conta a quantidade certa por etapa');
checarIgual(etapas.find(e => e.status === 'aprovado').valor, 180, 'valorPorEtapa usa o valor líquido quando tem retenção de imposto');
checarIgual(etapas.some(e => e.status === 'pago'), false, '"pago" não entra na lista de etapas ativas (já saiu da esteira)');

// 2) alertasDePrazo: vencimento atrasado/próximo e prazo do CSC
// atrasado/próximo -- duas leituras separadas, não somadas.
const hoje = new Date('2026-07-06T12:00:00');
const notasAlerta = [
  { status: 'lancado', vencimento: '2026-07-01' }, // vencimento já passou
  { status: 'lancado', vencimento: '2026-07-08' }, // vence em 2 dias (dentro do alerta de 3)
  { status: 'lancado', vencimento: '2026-08-01' }, // longe, não conta
  { status: 'pago', vencimento: '2026-07-01' }, // já paga -- não conta mesmo atrasada
];
const alertasVencimento = alertasDePrazo(notasAlerta, hoje, 3);
checarIgual(alertasVencimento.vencimentoAtrasado, 1, 'conta 1 nota com vencimento atrasado (a paga não entra)');
checarIgual(alertasVencimento.vencimentoProximo, 1, 'conta 1 nota com vencimento nos próximos 3 dias');

const notasPrazoCsc = [
  { status: 'chamado_aberto', tipo_despesa_prazo: 'd3_util', data_chamado: '2026-06-20' }, // D+3 útil, bem atrasado
  { status: 'chamado_aberto', tipo_despesa_prazo: 'padrao', data_chamado: '2026-07-05' }, // D+30, recente -- não atrasado nem próximo
  { status: 'lancado', tipo_despesa_prazo: 'padrao' }, // sem data_chamado (chamado nem aberto) -- não entra
];
const alertasCsc = alertasDePrazo(notasPrazoCsc, hoje, 3);
checarIgual(alertasCsc.prazoCscAtrasado, 1, 'conta 1 nota com prazo do CSC estourado');
checarIgual(alertasCsc.prazoCscProximo, 0, 'nota recente (D+30, chamado há 1 dia) não conta como atrasada nem próxima');

// 3) volumePorSetorPagadorNoMes: agrupa por setor e por pagador, só no mês
// de VENCIMENTO pedido, ignora cancelada.
const pagadores = [{ id: 'pag-1', nome: 'Condomínio' }, { id: 'pag-2', nome: 'FPP' }];
const notasMes = [
  { status: 'lancado', vencimento: '2026-07-10', setor: 'Marketing', pagador_id: 'pag-1', valor_bruto: 100, tem_retencao_imposto: false },
  { status: 'aprovado', vencimento: '2026-07-15', setor: 'Marketing', pagador_id: 'pag-2', valor_bruto: 50, tem_retencao_imposto: false },
  { status: 'lancado', vencimento: '2026-07-20', setor: 'Operações', pagador_id: 'pag-1', valor_bruto: 30, tem_retencao_imposto: false },
  { status: 'cancelada', vencimento: '2026-07-05', setor: 'Marketing', pagador_id: 'pag-1', valor_bruto: 999, tem_retencao_imposto: false },
  { status: 'lancado', vencimento: '2026-06-15', setor: 'Marketing', pagador_id: 'pag-1', valor_bruto: 500, tem_retencao_imposto: false },
];
const volume = volumePorSetorPagadorNoMes(notasMes, '2026-07', pagadores);
checarIgual(volume.total, 180, 'volume do mês soma só as notas com vencimento no mês pedido (ignora cancelada e outro mês)');
checarIgual(volume.porSetor[0].label, 'Marketing', 'setor com mais volume aparece primeiro (ordenado desc)');
checarIgual(volume.porSetor[0].valor, 150, 'soma certa por setor (100 + 50, ignora a cancelada e a de outro mês)');
checarIgual(volume.porPagador.find(p => p.label === 'Condomínio').valor, 130, 'soma certa por pagador (100 + 30, ignora a cancelada)');

// 4) tempoMedioAtePagamento: média de dias corridos entre lançamento e
// pagamento, só notas pagas.
const notasPagas = [
  { status: 'pago', criado_em: '2026-06-01T10:00:00Z', data_pagamento: '2026-06-11' }, // 10 dias
  { status: 'pago', criado_em: '2026-06-01T10:00:00Z', data_pagamento: '2026-06-21' }, // 20 dias
  { status: 'lancado', criado_em: '2026-06-01T10:00:00Z' }, // não paga -- não conta
];
const tempoMedio = tempoMedioAtePagamento(notasPagas);
checarIgual(tempoMedio.media, 15, 'tempo médio até pagamento é a média em dias corridos (10 e 20 -> 15)');
checarIgual(tempoMedio.quantidade, 2, 'conta só as notas já pagas');
checarIgual(tempoMedioAtePagamento([{ status: 'lancado' }]), null, 'sem nenhuma nota paga ainda, devolve null (não tem o que medir)');

// 5) impostosAProvisionarNoMes: soma o imposto (bruto - líquido) das
// notas com VENCIMENTO no mês ANTERIOR ao informado -- imposto de nota
// que vence em julho é provisionado pra pagamento em agosto.
const notasImposto = [
  { status: 'lancado', vencimento: '2026-07-10', tem_retencao_imposto: true, valor_bruto: 1000, valor_liquido: 850 }, // vence em julho, imposto 150 -- entra na provisão de agosto
  { status: 'aprovado', vencimento: '2026-07-20', tem_retencao_imposto: true, valor_bruto: 500, valor_liquido: 470 }, // vence em julho, imposto 30 -- entra também
  { status: 'lancado', vencimento: '2026-07-15', tem_retencao_imposto: false, valor_bruto: 300, valor_liquido: 300 }, // vence em julho, mas sem retenção -- não conta
  { status: 'lancado', vencimento: '2026-08-05', tem_retencao_imposto: true, valor_bruto: 1000, valor_liquido: 900 }, // vence em agosto -- não entra na provisão de agosto (seria a de setembro)
  { status: 'cancelada', vencimento: '2026-07-12', tem_retencao_imposto: true, valor_bruto: 1000, valor_liquido: 800 }, // cancelada -- não conta
];
const impostosAgosto = impostosAProvisionarNoMes(notasImposto, '2026-08');
checarIgual(impostosAgosto.mesReferencia, '2026-07', 'a provisão de agosto olha pro mês anterior (julho)');
checarIgual(impostosAgosto.total, 180, 'soma só o imposto das notas com retenção que venceram em julho (150 + 30), ignora sem retenção e cancelada');
checarIgual(impostosAgosto.quantidade, 2, 'conta 2 notas (as duas com retenção que venceram em julho)');

const impostosJaneiro = impostosAProvisionarNoMes(notasImposto, '2026-01');
checarIgual(impostosJaneiro.mesReferencia, '2025-12', 'vira o ano corretamente ao calcular o mês anterior a janeiro');
checarIgual(impostosJaneiro.total, 0, 'mês sem nenhuma nota no mês de referência devolve total zero');

checarSemErrosNaoTratados(erros, 'dashboard_indicadores');
relatorioFinal('dashboard_indicadores');
