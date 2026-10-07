// DRE de despesas anual (ver dre.js): competência x caixa, rateio
// proporcional ao bruto, o que fica fora (rascunho/recebido/cancelada),
// orçado por código e por classe, acumulado até o mês, maiores estouros e
// o bloco fora do operacional.
import { checar, checarIgual, relatorioFinal } from './lib/assert.mjs';
const { linhasDespesa, dreAnual, maioresEstouros, notasDoCodigo, grupoDoCentro } = await import('./app/src/js/dre.js');

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
const orcamento = [
  { pagador_id: 'P1', ano: 2026, mes: 9, codigo_classificacao_id: 'X1', classe_conta_id: null, valor: 1000 },
  { pagador_id: 'P1', ano: 2026, mes: 8, codigo_classificacao_id: 'X1', classe_conta_id: null, valor: 600 },
  { pagador_id: 'P1', ano: 2026, mes: 9, codigo_classificacao_id: null, classe_conta_id: 'K2', valor: 500 },
  { pagador_id: 'P2', ano: 2026, mes: 9, codigo_classificacao_id: 'X1', classe_conta_id: null, valor: 99999 },
  { pagador_id: 'P1', ano: 2025, mes: 9, codigo_classificacao_id: 'X1', classe_conta_id: null, valor: 99999 },
];
const dre = dreAnual(linhas, orcamento, cadastros, { ano: 2026, pagadorId: 'P1', ateMes: 9 });
const c1 = dre.operacional.centros.find(c => c.id === 'C1');
const c2 = dre.operacional.centros.find(c => c.id === 'C2');
checarIgual(Math.round(c1.real[8] * 100) / 100, 1333.33, 'ADMINISTRATIVO em set = 1000 (nota a) + 1/3 do bruto da nota c');
checarIgual(Math.round(c2.real[8] * 100) / 100, 666.67, 'MANUTENÇÃO em set = 2/3 do bruto da nota c (rateio proporcional ao bruto)');
checarIgual(c1.real[7], 500, 'ADMINISTRATIVO em ago = 500 (coluna do mês certo)');
checarIgual(Math.round(dre.operacional.real[8]), 2000, 'total operacional de set = 2000 (soma bate com o bruto)');
checarIgual(dre.grupos.map(g => g.chave), ['operacional', 'distribuicao'], 'distribuição de resultados fica num bloco à parte');
checarIgual(dre.total.real[8], 4000, 'total geral inclui o bloco fora do operacional');
checarIgual(c1.filhos[0].filhos[0].codigo, '2.01.01.01.0011', 'árvore centro › classe › código');

console.log('### Orçado ###');
checarIgual(c1.orc[8], 1000, 'orçado do código soma no centro (set)');
checarIgual(c1.filhos[0].filhos[0].orc[7], 600, 'orçado do código no mês dele (ago)');
checarIgual(c2.orc[8], 500, 'orçado por CLASSE soma no centro');
checar(c2.filhos[0].orcNaClasse && c2.filhos[0].filhos[0].orc[8] === 0, 'orçado da classe fica na classe, não espalhado nos códigos');
checarIgual(dre.operacional.totalOrc, 2100, 'outro pagador e outro ano não entram (1000 + 600 + 500)');
checarIgual(Math.round(dre.operacional.ytdReal), 2900, 'realizado acumulado até set (jul + ago + set)');
const est = maioresEstouros(dre);
checarIgual(est.map(e => e.codigo), ['2.01.01.01.0011', '2.03.01.01'], 'maiores estouros: código e classe acima do orçado, maior primeiro');

console.log('### Caixa ###');
const caixa = dreAnual(linhasDespesa(notas, { pagadorId: 'P1', regime: 'caixa' }), [], cadastros, { ano: 2026, pagadorId: 'P1' });
checarIgual(caixa.operacional.totalReal, 400, 'caixa: só a nota paga (em set, competência de jul)');
checarIgual(caixa.operacional.real[8], 400, 'e ela cai no mês do pagamento');

console.log('### Detalhamento ###');
checarIgual(notasDoCodigo(linhas, 'X1', { ano: 2026, mes: 9 }).map(d => d.notaId), ['a', 'c'], 'notas do código no mês, maior valor primeiro');
checarIgual(notasDoCodigo(linhas, 'X1', { ano: 2026 }).map(d => d.notaId), ['a', 'b', 'i', 'c'], 'notas do código no ano');
checarIgual(grupoDoCentro({ nome: 'VALORES A RECUPERAR' }), 'a_recuperar', 'valores a recuperar fora do operacional');

relatorioFinal('dre_calculo');
