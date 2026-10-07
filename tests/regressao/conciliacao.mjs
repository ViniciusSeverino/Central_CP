// Conciliação Group x Central CP (ver conciliacao.js): por movimento e
// pagador -- valor diferente, só no CP, só no Group, sem nº e bate.
import { checar, checarIgual, relatorioFinal } from './lib/assert.mjs';
const { conciliar, filtrarConciliacao } = await import('./app/src/js/conciliacao.js');

const lanc = [
  { id_group: 1, movimento: '2546', pagador_id: 'P1', valor: 164840.48, vencimento: '2026-10-14', fornecedor: 'Limpa', descricao: 'M.O. LIMPEZA', classe_base: 'Limpeza' },
  { id_group: 2, movimento: '2546', pagador_id: 'P1', valor: 37790.71, vencimento: '2026-10-20', fornecedor: 'Ministerio da Prev.', descricao: 'INSS 11%', classe_base: 'Limpeza', eh_retencao: true },
  { id_group: 3, movimento: '2820', pagador_id: 'P2', valor: 1862, vencimento: '2026-11-04' },
  { id_group: 4, movimento: '1897', pagador_id: 'P1', valor: 14814.53, vencimento: '2026-07-30', pagamento: '2026-07-30', situacao: '2 - Baixada', fornecedor: 'FOPAG', favorecido: 'FOPAG - SALÁRIO', descricao: 'Salários julho', nota_fiscal: '00123' },
  { id_group: 5, movimento: '2809', pagador_id: 'P1', valor: 36000, vencimento: '2026-11-04' },
];
const notas = [
  { id: 'a', status: 'chamado_aberto', pagador_id: 'P1', numero_lancamento_group: '2546', valor_bruto: 202631.19, vencimento: '2026-10-14' },
  { id: 'b', status: 'chamado_aberto', pagador_id: 'P2', numero_lancamento_group: '2820', valor_bruto: 1862, vencimento: '2026-11-04' },
  { id: 'c', status: 'chamado_aberto', pagador_id: 'P3', numero_lancamento_group: '2820', valor_bruto: 2250, vencimento: '2026-11-04' },
  { id: 'd', status: 'pago', pagador_id: 'P1', numero_lancamento_group: '17082', valor_bruto: 290.7, vencimento: '2026-08-10' },
  { id: 'e', status: 'aprovado', pagador_id: 'P1', numero_lancamento_group: null, valor_bruto: 100, vencimento: '2026-10-01' },
  { id: 'f', status: 'cancelada', pagador_id: 'P1', numero_lancamento_group: '9999', valor_bruto: 5, vencimento: '2026-10-01' },
  { id: 'g', status: 'pago', pagador_id: 'P1', numero_lancamento_group: '2809', valor_bruto: 24000, vencimento: '2026-11-04' },
  { id: 'h', status: 'pago', pagador_id: 'P1', numero_lancamento_group: '2809', valor_bruto: 12000.5, vencimento: '2026-11-04' },
];
const lista = conciliar(lanc.slice().reverse(), notas);
const por = (mov, pag) => lista.find(i => i.movimento === mov && i.pagadorId === pag);
checarIgual(por('2546', 'P1').grupo, 'bate', 'movimento com retenções: soma das linhas do Group = bruto do CP');
checarIgual(por('2820', 'P2').grupo, 'bate', 'mesmo movimento, pagador FPP: bate');
checarIgual(por('2820', 'P3').grupo, 'so_cp', 'mesmo movimento, outro pagador sem linha no Group: só no CP');
checarIgual(por('17082', 'P1').grupo, 'so_cp', 'nº de movimento inexistente no Group (digitação?): só no CP');
checarIgual(por('1897', 'P1').grupo, 'so_group', 'folha só no Group');
checarIgual(por('2809', 'P1').grupo, 'diferente', 'duas notas no mesmo movimento somando diferente do Group');
checarIgual(Math.round(por('2809', 'P1').diferenca * 100) / 100, -0.5, 'diferença Group − CP');
checar(lista.some(i => i.grupo === 'sem_numero' && i.notas[0] === 'e'), 'nota sem nº do Group');
checar(!lista.some(i => i.notas.includes('f')), 'cancelada fica fora');
const { resumo, recorte } = filtrarConciliacao(lista, { pagadorId: 'P1', mes: '2026-11' });
checarIgual(recorte.length, 1, 'filtro por pagador e mês de vencimento');
checarIgual(resumo.diferente.qtd, 1, 'resumo por situação');


console.log('### Detalhes e busca ###');
const folha = por('1897', 'P1');
checar(folha.lancs[0] && folha.lancs[0].id_group === 4, 'item guarda os lançamentos completos (pro detalhe)');
checarIgual([folha.descricoes, folha.nfs, folha.pagamento, folha.situacoes], [['Salários julho'], ['123'], '2026-07-30', ['2 - Baixada']], 'resumo: descrição, NF, pagamento e situação');
checarIgual([por('2546', 'P1').fornecedores[0], por('2546', 'P1').descricoes[0]], ['Limpa', 'M.O. LIMPEZA'], 'fornecedor e descrição da linha principal vêm antes dos da retenção');
checarIgual(folha.fornecedores, ['FOPAG', 'FOPAG - SALÁRIO'], 'favorecido diferente do fornecedor também entra');
const busca = (t) => filtrarConciliacao(lista, { busca: t }, { notas, nomeFornecedor: (id) => (id === 'F1' ? 'Limpa Bem' : '') }).recorte.map(i => i.movimento || i.notas[0]);
checarIgual(busca('salarios'), ['1897'], 'busca pela descrição, sem acento');
checarIgual(busca('123'), ['1897'], 'busca pela NF (zeros à esquerda ignorados)');
checarIgual(busca('2546'), ['2546'], 'busca pelo movimento');
notas.find(n => n.id === 'd').fornecedor_id = 'F1';
checarIgual(busca('limpa bem'), ['17082'], 'busca pelo fornecedor da nota do CP (todas as palavras)');

relatorioFinal('conciliacao');
