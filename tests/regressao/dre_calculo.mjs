// DRE de despesas (ver dre.js): competência x caixa, rateio proporcional
// ao bruto, o que fica fora (rascunho/recebido/cancelada), acumulado no
// ano, comparação com o período anterior e o bloco fora do operacional.
import { checar, checarIgual, relatorioFinal } from './lib/assert.mjs';
const { linhasDespesa, dreDoPeriodo, serie12Meses, notasDoCodigo, grupoDoCentro } = await import('./app/src/js/dre.js');

const cadastros = {
  pagadores: [{ id: 'P1', nome: 'Condomínio' }, { id: 'P2', nome: 'FPP' }],
  centros_custo: [
    { id: 'C1', codigo: '2.01', nome: 'ADMINISTRATIVO' },
    { id: 'C2', codigo: '2.03', nome: 'MANUTENÇÃO' },
    { id: 'C9', codigo: '2.12', nome: 'DISTRIBUIÇÃO DE RESULTADOS' },
  ],
  classes_conta: [
    { id: 'K1', codigo: '2.01.01.01', nome: 'SALARIOS', centro_custo_id: 'C1' },
    { id: 'K2', codigo: '2.03.01.01', nome: 'MANUTENÇÃO PREDIAL', centro_custo_id: 'C2' },
    { id: 'K9', codigo: '2.12.01.01', nome: 'DISTRIBUIÇÃO', centro_custo_id: 'C9' },
  ],
  codigos_classificacao: [
    { id: 'X1', codigo: '2.01.01.01.0011', nome: 'Salários', classe_conta_id: 'K1' },
    { id: 'X2', codigo: '2.03.01.01.0001', nome: 'Elétrica', classe_conta_id: 'K2' },
    { id: 'X9', codigo: '2.12.01.01.0001', nome: 'Distribuição', classe_conta_id: 'K9' },
  ],
};
const nota = (id, extra) => ({ id, status: 'aprovado', pagador_id: 'P1', valor_bruto: 0, competencia: '2026-09-01', data_pagamento: null, tem_rateio: false, rateios: [], centro_custo_id: 'C1', classe_conta_id: 'K1', codigo_classificacao_id: 'X1', ...extra });
const notas = [
  nota('a', { valor_bruto: 1000 }),
  nota('b', { valor_bruto: 500, competencia: '2026-08-01' }),
  // rateio que soma o LÍQUIDO (900 de 1000 bruto): 1/3 e 2/3 do bruto
  nota('c', { valor_bruto: 1000, tem_rateio: true, rateios: [
    { valor: 300, centro_custo_id: 'C1', classe_conta_id: 'K1', codigo_classificacao_id: 'X1' },
    { valor: 600, centro_custo_id: 'C2', classe_conta_id: 'K2', codigo_classificacao_id: 'X2' },
  ] }),
  nota('d', { valor_bruto: 999, status: 'cancelada' }),
  nota('e', { valor_bruto: 999, status: 'rascunho' }),
  nota('f', { valor_bruto: 999, status: 'recebido' }),
  nota('g', { valor_bruto: 777, pagador_id: 'P2' }),
  nota('h', { valor_bruto: 2000, centro_custo_id: 'C9', classe_conta_id: 'K9', codigo_classificacao_id: 'X9' }),
  nota('i', { valor_bruto: 400, status: 'pago', competencia: '2026-07-01', data_pagamento: '2026-09-15' }),
];

console.log('### Competência ###');
const linhas = linhasDespesa(notas, { pagadorId: 'P1', regime: 'competencia' });
checar(!linhas.some(l => ['d', 'e', 'f', 'g'].includes(l.notaId)), 'fora: cancelada, rascunho, recebido e outro pagador');
const set = dreDoPeriodo(linhas, cadastros, { mes: '2026-09' });
const c1 = set.operacional.centros.find(c => c.id === 'C1');
const c2 = set.operacional.centros.find(c => c.id === 'C2');
checarIgual(Math.round(c1.realizado * 100) / 100, 1333.33, 'ADMINISTRATIVO em set = 1000 (nota a) + 1/3 do bruto da nota c');
checarIgual(Math.round(c2.realizado * 100) / 100, 666.67, 'MANUTENÇÃO em set = 2/3 do bruto da nota c (rateio proporcional ao bruto)');
checarIgual(Math.round(set.operacional.realizado), 2000, 'total operacional = 2000 (soma bate com o bruto das notas)');
checarIgual(c1.anterior, 500, 'mês anterior (ago) do ADMINISTRATIVO = 500');
checarIgual(set.grupos.map(g => g.chave), ['operacional', 'distribuicao'], 'distribuição de resultados fica num bloco à parte');
checarIgual(set.total.realizado, 4000, 'total geral inclui o bloco fora do operacional');
checarIgual(c1.filhos[0].filhos[0].codigo, '2.01.01.01.0011', 'árvore centro › classe › código');
checarIgual(c1.qtdNotas, 2, 'quantas notas compõem o centro no período');

console.log('### Acumulado ###');
const acum = dreDoPeriodo(linhas, cadastros, { mes: '2026-09', acumulado: true });
checarIgual(Math.round(acum.operacional.realizado), 2900, 'acumulado jan–set inclui agosto e julho');

console.log('### Caixa ###');
const caixa = dreDoPeriodo(linhasDespesa(notas, { pagadorId: 'P1', regime: 'caixa' }), cadastros, { mes: '2026-09' });
checarIgual(caixa.operacional.realizado, 400, 'caixa: só a nota paga em setembro (competência de julho)');

console.log('### Gráfico e detalhamento ###');
const serie = serie12Meses(linhas, cadastros, '2026-09');
checarIgual(serie.length, 12, '12 meses');
checarIgual(Math.round(serie[11].valor), 2000, 'último mês = despesas operacionais de setembro (sem a distribuição)');
const det = notasDoCodigo(linhas, 'X1', { de: '2026-09', ate: '2026-09' });
checarIgual(det.map(d => d.notaId), ['a', 'c'], 'detalhamento do código: notas a e c, maior valor primeiro');
checarIgual(grupoDoCentro({ nome: 'VALORES A RECUPERAR' }), 'a_recuperar', 'valores a recuperar fora do operacional');

relatorioFinal('dre_calculo');
