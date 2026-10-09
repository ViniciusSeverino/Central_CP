// Fluxo de caixa (ver fluxo_caixa.js): realizado x projetado, corte de 90
// dias na inadimplência, notas do Central CP sem contar duas vezes, saldo
// encadeado a partir do informado e o quadro de devedores/acordos.
import { checar, checarIgual, relatorioFinal } from './lib/assert.mjs';
const F = await import('./app/src/js/fluxo_caixa.js');

const hoje = new Date(2026, 9, 7); // 07/10/2026
const P = 'P1';
const rec = (id, extra) => ({ id_group: id, pagador_id: P, classe: 'ALUGUEL MÍNIMO', situacao: 'Emitida', faturado: 0, valor_liquido: 0, ...extra });
const receitas = [
  rec(1, { situacao: 'Baixada', recebimento: '2026-09-10', valor_liquido: 1000, faturado: 990 }),   // set realizado
  rec(2, { situacao: 'Baixada', recebimento: '2026-10-02', valor_liquido: 300, faturado: 300 }),    // out realizado
  rec(3, { vencimento: '2026-10-20', faturado: 500 }),                                              // out a receber
  rec(4, { vencimento: '2026-09-15', faturado: 200 }),                                              // vencido 22 dias -> out
  rec(5, { vencimento: '2026-05-01', faturado: 999 }),                                              // vencido >90 -> fora
  rec(6, { vencimento: '2026-12-10', faturado: 400, classe: 'CONDOMINIO CONFISSÃO', num_acordo: '7' }), // dez
  rec(7, { pagador_id: 'P2', vencimento: '2026-10-20', faturado: 5000 }),                           // outro pagador
];
const lanc = (id, extra) => ({ id_group: id, pagador_id: P, movimento: String(id), centro_nome: 'ADMINISTRATIVO', classe_base: 'X', situacao: '0 - Criada', valor: 0, ...extra });
const lancamentos = [
  lanc(10, { situacao: '2 - Baixada', pagamento: '2026-09-05', valor: 400 }),  // set pago
  lanc(11, { vencimento: '2026-10-25', valor: 150 }),                         // out a pagar
  lanc(12, { vencimento: '2026-08-01', valor: 50 }),                          // vencida em aberto -> out
];
const notas = [
  { id: 'n1', status: 'aprovado', pagador_id: P, valor_bruto: 70, vencimento: '2026-11-10', numero_lancamento_group: null },   // CP sem Group -> nov
  { id: 'n2', status: 'lancado_no_group', pagador_id: P, valor_bruto: 150, vencimento: '2026-10-25', numero_lancamento_group: '011' }, // já no Group (mov 11)
  { id: 'n3', status: 'pago', pagador_id: P, valor_bruto: 999, vencimento: '2026-10-01' },                                      // pago: fora
];
const base = { receitas, lancamentos, notas, casar: null, cadastros: {}, pagadorId: P, ano: 2026, hoje };

console.log('### Realizado x projetado ###');
const f = F.fluxoDeCaixa(base);
const m = (n) => f.meses[n - 1];
checarIgual([m(9).entradas, m(9).saidas, m(9).projetado], [1000, 400, false], 'setembro: realizado (valor líquido recebido, pagamento baixado)');
checarIgual(m(10).entradas, 300 + 500 + 200, 'outubro: recebido + a receber + vencido há até 90 dias');
checarIgual(m(10).entradasProj, 700, 'parte projetada das entradas de outubro');
checarIgual(m(10).saidas, 150 + 50, 'outubro: a pagar do Group (a vencida em aberto cai no mês atual)');
checar(m(10).projetado && m(10).atual, 'outubro é o mês atual (projetado)');
checarIgual(m(11).saidas, 70, 'nota do CP sem lançamento no Group entra pelo vencimento');
checarIgual(f.saidas.find(l => l.chave === 'cp_sem_group').total, 70, 'nota já lançada no Group (mesmo movimento) não conta duas vezes; nota paga fica fora');
checarIgual(m(12).entradas, 400, 'parcela de acordo a vencer entra no mês do vencimento');
checarIgual(f.totalEntradas, 1000 + 1000 + 400, 'o vencido há mais de 90 dias e o outro pagador ficam fora');

console.log('### Saldo ###');
checar(!f.temSaldo && m(9).saldoFinal === null && f.saldoHoje === null, 'sem saldo informado: só a geração, sem saldo');
const fs = F.fluxoDeCaixa({ ...base, saldo: { data: '2026-09-01', valor: 10000 } });
checarIgual(fs.meses[7].saldoFinal, null, 'antes do mês do saldo: sem saldo');
checarIgual([fs.meses[8].saldoInicial, fs.meses[8].saldoFinal], [10000, 10600], 'setembro: saldo informado + geração');
checarIgual(fs.meses[9].saldoInicial, 10600, 'encadeia no mês seguinte');
checarIgual(fs.saldoHoje, 10600 + 300, 'saldo hoje = início do mês + o já realizado no mês');
const fAnt = F.fluxoDeCaixa({ ...base, saldo: { data: '2026-08-01', valor: 100 }, ano: 2026 });
checarIgual(fAnt.meses[8].saldoInicial, 100, 'saldo de um mês sem movimento passa igual');
const fJan = F.fluxoDeCaixa({ ...base, saldo: { data: '2025-12-01', valor: 50 } });
checarIgual(fJan.meses[0].saldoInicial, 50, 'saldo de antes do ano encadeia até janeiro');
checarIgual([fs.menorProximo.mes, fs.menorProximo.saldoFinal], [11, 11330], 'menor saldo dos próximos 3 meses (nov: a nota do CP sai)');

console.log('### Saldo antes dos dados do Group ###');
checarIgual(fs.primeiroMesDados, '2026-09', 'primeiro mês com pagamento baixado no Group');
checar(!fs.saldoAntesDosDados, 'saldo no mês do primeiro pagamento: sem alerta');
checar(F.fluxoDeCaixa({ ...base, saldo: { data: '2026-08-01', valor: 1 } }).saldoAntesDosDados, 'saldo de antes do primeiro pagamento: alerta');
checar(!F.fluxoDeCaixa({ ...base, saldo: { data: '2026-10-01', valor: 1 } }).saldoAntesDosDados, 'saldo de depois: sem alerta');

console.log('### Devedores e acordos ###');
const d = F.devedoresEAcordos(receitas, { pagadorId: P, hoje });
checarIgual(d.devedores.map(x => x.valor), [999 + 200], 'devedores: vencido em aberto (todas as faixas), por lojista');
checarIgual(d.acordos.map(a => [a.ano, a.valor]), [[2026, 400]], 'acordos a receber por ano');

relatorioFinal('fluxo_caixa');
