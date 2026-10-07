// Painel do DRE (ver dre_painel.js): mês em foco contra orçado, mês
// anterior e mesmo mês do ano passado; contas que mais mudaram; leitura
// automática.
import { checar, checarIgual, relatorioFinal } from './lib/assert.mjs';
const { dreAnual } = await import('./app/src/js/dre.js');
const P = await import('./app/src/js/dre_painel.js');

const cadastros = {
  centros_custo: [{ id: 'C1', codigo: '2.01', nome: 'ADMINISTRATIVO' }],
  classes_conta: [{ id: 'K1', codigo: '2.01.01', nome: 'PESSOAL', centro_custo_id: 'C1' }],
  codigos_classificacao: [{ id: 'X1', codigo: '2.01.01.1', nome: 'Salários', classe_conta_id: 'K1' }, { id: 'X2', codigo: '2.01.01.2', nome: 'Energia', classe_conta_id: 'K1' }],
};
const l = (mes, valor, codigoId) => ({ notaId: `${mes}${codigoId}`, mes, valor, centroId: 'C1', classeId: 'K1', codigoId });
const linhas = [l('2026-08', 1000, 'X1'), l('2026-08', 200, 'X2'), l('2026-09', 1000, 'X1'), l('2026-09', 500, 'X2'), l('2025-09', 1100, 'X1')];
const rec = (mes, valor, classe = 'ALUGUEL MÍNIMO') => ({ id: mes + classe, mes, valor, classe, grupo: 'alugueis' });
const linhasRec = [rec('2026-08', 3000), rec('2026-09', 2500), rec('2025-09', 2000)];
const orc = [{ pagador_id: 'P', ano: 2026, mes: 9, codigo_classificacao_id: 'X2', valor: 250 }, { pagador_id: 'P', ano: 2026, mes: 9, receita_classe: 'ALUGUEL MÍNIMO', valor: 2400 }];
const dre = dreAnual(linhas, orc, cadastros, { ano: 2026, pagadorId: 'P', ateMes: 9, linhasRec });
const dreAnt = dreAnual(linhas, orc, cadastros, { ano: 2025, pagadorId: 'P', ateMes: 12, linhasRec });

console.log('### Mês em foco ###');
const c = P.comparativoMes(dre, dreAnt, 9);
checarIgual([c.despesa.valor, c.despesa.orc, c.despesa.vsOrc], [1500, 250, 1250], 'despesa de set x orçado');
checarIgual([c.despesa.mesAnt, c.despesa.vsMesAnt], [1200, 300], 'despesa de set x ago');
checarIgual([c.despesa.anoAnt, c.despesa.vsAnoAnt], [1100, 400], 'despesa de set x set do ano passado');
checarIgual([c.receita.valor, c.receita.vsOrc, c.receita.vsAnoAnt], [2500, 100, 500], 'receita x orçado e x ano passado');
checarIgual(c.resultado.valor, 1000, 'resultado do mês');
checarIgual(P.ultimoMesComDados(dre, 12), 9, 'mês em foco abre no último mês com dado');

console.log('### O que mais mudou ###');
const v = P.maioresVariacoes(dre, 9);
checarIgual(v.vsMesAnt.map(x => [x.nome, x.delta, x.bom]), [['ALUGUEL MÍNIMO', -500, false], ['Energia', 300, false]], 'vs mês anterior: maior variação primeiro; receita caindo e despesa subindo são ruins');
checarIgual(v.vsOrc.map(x => [x.nome, x.delta, x.bom]), [['Energia', 250, false], ['ALUGUEL MÍNIMO', 100, true]], 'vs orçado: só contas com orçado no mês');

console.log('### Leitura automática ###');
const f = P.leituraAutomatica(dre, 9, c, v, { recebidoFaturado: 0.8, inadRecente: 5000, difCp: 0 });
checar(f.length >= 3 && f.length <= 5, `3 a 5 frases (${f.length})`);
checar(/sobraram/.test(f[0].texto) && f[0].tom === 'bom', 'primeiro o resultado do mês');
checar(f.some(x => /acima do orçado/.test(x.texto) && /Energia/.test(x.texto) && x.tom === 'alerta'), 'despesa acima do orçado, com a conta que puxou');
checar(f.some(x => /80%/.test(x.texto)), 'quanto do faturado já entrou no caixa');

relatorioFinal('dre_painel');
