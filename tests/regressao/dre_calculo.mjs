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

console.log('### Group como realizado ###');
const { linhasGroup, lancamentosDoCodigo } = await import('./app/src/js/dre.js');
const casarFake = (l) => l.conta;
const lancG = [
  { id_group: 1, pagador_id: 'P1', vencimento: '2026-09-10', pagamento: null, situacao: ' 0 - Criada', valor: 1200, conta: { centroId: 'C1', classeId: 'K1', codigoId: 'X1' }, centro_nome: 'ADMINISTRATIVO', classe_base: 'Salários' },
  { id_group: 2, pagador_id: 'P1', vencimento: '2026-09-10', pagamento: '2026-09-12', situacao: ' 2 - Baixada', valor: 300, conta: { centroId: 'C1', classeId: 'K1', codigoId: 'X1' }, centro_nome: 'ADMINISTRATIVO', classe_base: 'Salários - IRRF 1%' },
  { id_group: 3, pagador_id: 'P1', vencimento: '2026-09-15', pagamento: null, situacao: ' 0 - Criada', valor: 77, conta: null, centro_nome: 'PESSOAL', classe_base: 'Rescisões' },
  { id_group: 4, pagador_id: 'P2', vencimento: '2026-09-15', pagamento: null, situacao: ' 0 - Criada', valor: 999, conta: null, centro_nome: 'X', classe_base: 'Y' },
];
const lg = linhasGroup(lancG, casarFake, { pagadorId: 'P1', regime: 'vencimento' });
checarIgual(lg.length, 3, 'Group: só o pagador escolhido');
const dg = dreAnual(linhas, orcamento, cadastros, { ano: 2026, pagadorId: 'P1', ateMes: 9, linhasGrp: lg });
checarIgual(dg.fonte, 'group', 'com o Group importado, ele é o realizado');
const c1g = dg.operacional.centros.find(c => c.id === 'C1');
checarIgual(c1g.rea[8], 1500, 'realizado (Group) em set = despesa + retenção');
checarIgual(Math.round(c1g.real[8] * 100) / 100, 1333.33, 'Central CP continua como conferência no mesmo nó');
const semConta = dg.operacional.centros.find(c => c.soGroup);
checar(semConta && semConta.nome.includes('PESSOAL') && semConta.rea[8] === 77, 'lançamento sem conta no CP aparece com o nome do Group');
checarIgual(dg.operacional.ytdRea, 1577, 'acumulado do realizado usa o Group');
checarIgual(linhasGroup(lancG, casarFake, { pagadorId: 'P1', regime: 'caixa' }).length, 1, 'caixa: só o baixado, pela data de pagamento');
checarIgual(lancamentosDoCodigo(lg, 'X1', { ano: 2026, mes: 9 }).map(l => l.lancId), [1, 2], 'lançamentos do Group de um código no mês');
const semGrp = dreAnual(linhasDespesa(notas, { pagadorId: 'P1', regime: 'competencia' }), [], cadastros, { ano: 2026, pagadorId: 'P1' });
checar(semGrp.fonte === 'cp', 'sem Group, realizado = Central CP');

console.log('### Regimes: competência = emissão (CP) / Mes Ref (Group) ###');
const nEm = [nota('em', { valor_bruto: 10, competencia: '2026-09-01', data_emissao: '2026-07-20' })];
checarIgual(linhasDespesa(nEm, { regime: 'competencia' })[0].mes, '2026-07', 'CP: competência pela data de emissão da nota');
checarIgual(linhasDespesa([nota('sem', { valor_bruto: 10, competencia: '2026-09-01' })], { regime: 'competencia' })[0].mes, '2026-09', 'CP: sem emissão, usa o campo competência');
const lgMr = linhasGroup([{ ...lancG[0], mes_ref: '08/2026' }], casarFake, { pagadorId: 'P1', regime: 'competencia' });
checarIgual(lgMr[0].mes, '2026-08', 'Group: competência pelo Mes Ref (não pelo vencimento)');

console.log('### Receitas e resultado ###');
const { linhasReceita } = await import('./app/src/js/receitas.js');
const rec = [
  { id_group: 1, pagador_id: 'P1', classe: 'ALUGUEL MÍNIMO', mes_ref: '09/2026', emissao: '2026-09-01', recebimento: '2026-10-02', situacao: 'Baixada', faturado: 5000, valor_liquido: 5100 },
  { id_group: 2, pagador_id: 'P1', classe: 'ENCARGO COMUM', mes_ref: '09/2026', emissao: '2026-09-01', recebimento: null, situacao: 'Emitida', faturado: 2000, valor_liquido: 0 },
  { id_group: 3, pagador_id: 'P1', classe: 'CONDOMINIO CONFISSÃO', mes_ref: '10/2025', emissao: '2026-09-01', recebimento: '2026-09-20', situacao: 'Baixada', faturado: 300, valor_liquido: 300 },
  { id_group: 4, pagador_id: 'P2', classe: 'FUNDO DE PROMOÇÃO', mes_ref: '09/2026', situacao: 'Emitida', faturado: 999, valor_liquido: 0 },
];
const lr = linhasReceita(rec, { pagadorId: 'P1', regime: 'competencia' });
const orcRec = [{ pagador_id: 'P1', ano: 2026, mes: 9, receita_classe: 'ALUGUEL MÍNIMO', valor: 4000 }, { pagador_id: 'P1', ano: 2026, mes: 9, classe_conta_id: 'K1', valor: 1000 }];
const dr = dreAnual(linhas, orcRec, cadastros, { ano: 2026, pagadorId: 'P1', ateMes: 9, linhasRec: lr });
checar(dr.temReceitas, 'com receitas, o DRE tem o bloco de receitas');
checarIgual(dr.receitas.total.rea[8], 7000, 'receita de set (competência = Mes Ref): faturado');
checarIgual(dr.receitas.grupos.map(g => g.chave), ['acordos', 'alugueis', 'encargos'].filter(k => dr.receitas.grupos.some(g => g.chave === k)), 'grupos de receita na ordem fixa');
checarIgual(dr.receitas.grupos.find(g => g.chave === 'alugueis').orc[8], 4000, 'orçado de receita pela classe');
checarIgual(Math.round(dr.resultado.rea[8] * 100) / 100, 7000 - Math.round(dr.operacional.rea[8] * 100) / 100, 'resultado = receitas − despesas operacionais');
checarIgual(dr.resultado.orc[8], 4000 - 1000, 'resultado orçado = receita orçada − despesa orçada');
const lrCx = linhasReceita(rec, { pagadorId: 'P1', regime: 'caixa' });
checarIgual(lrCx.map(l => [l.mes, l.valor]), [['2026-10', 5100], ['2026-09', 300]], 'caixa: só o recebido, pelo recebimento, valor líquido (com juros)');
checar(!dreAnual(linhas, [], cadastros, { ano: 2026, pagadorId: 'P1' }).temReceitas, 'sem receitas importadas, o DRE continua só de despesas');

console.log('### Detalhamento ###');
checarIgual(notasDoCodigo(linhas, 'X1', { ano: 2026, mes: 9 }).map(d => d.notaId), ['a', 'c'], 'notas do código no mês, maior valor primeiro');
checarIgual(notasDoCodigo(linhas, 'X1', { ano: 2026 }).map(d => d.notaId), ['a', 'b', 'i', 'c'], 'notas do código no ano');
checarIgual(grupoDoCentro({ nome: 'VALORES A RECUPERAR' }), 'a_recuperar', 'valores a recuperar fora do operacional');

relatorioFinal('dre_calculo');
