// caixinha.js: extratoCaixinha() -- ledger cronológico com saldo
// acumulado (relatório). Mesmo recorte de saldoCaixinha (só aprovado, só
// da caixinha pedida), mas em ordem de data com o saldo linha a linha, e
// o saldo acumulado precisa refletir o histórico INTEIRO mesmo quando um
// filtro de período corta as linhas exibidas.
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checarIgual, checar, checarSemErrosNaoTratados, relatorioFinal } from './lib/assert.mjs';

const { erros } = await bootApp(PERFIS.administrador);
const { extratoCaixinha } = await import('./app/src/js/caixinha.js');

const caixinha = { id: 'cx-1' };
const movimentacoes = [
  { id: 'm3', caixinha_id: 'cx-1', tipo: 'saida', valor: 200, status: 'aprovado', data: '2026-08-05', criado_em: '2026-08-05T10:00:00Z' },
  { id: 'm1', caixinha_id: 'cx-1', tipo: 'reforco', valor: 1000, status: 'aprovado', data: '2026-08-01', criado_em: '2026-08-01T10:00:00Z' },
  { id: 'm4', caixinha_id: 'cx-1', tipo: 'reforco', valor: 100, status: 'aprovado', data: '2026-08-10', criado_em: '2026-08-10T10:00:00Z' },
  { id: 'm-pend', caixinha_id: 'cx-1', tipo: 'saida', valor: 999, status: 'pendente_aprovacao', data: '2026-08-03', criado_em: '2026-08-03T10:00:00Z' },
  { id: 'm-rej', caixinha_id: 'cx-1', tipo: 'saida', valor: 999, status: 'rejeitado', data: '2026-08-04', criado_em: '2026-08-04T10:00:00Z' },
  { id: 'm-outra', caixinha_id: 'cx-2', tipo: 'saida', valor: 500, status: 'aprovado', data: '2026-08-02', criado_em: '2026-08-02T10:00:00Z' },
];

const extratoCompleto = extratoCaixinha(caixinha, movimentacoes, {});
checarIgual(extratoCompleto.length, 3, 'extrato sem filtro traz só as 3 movimentações aprovadas da própria caixinha (ignora pendente/rejeitado/outra caixinha)');
checarIgual(extratoCompleto.map(l => l.id).join(','), 'm1,m3,m4', 'linhas em ordem cronológica por data (reforço 01/08, saída 05/08, reforço 10/08)');
checarIgual(extratoCompleto[0].saldo_apos, 1000, 'saldo após o reforço de 1000 é 1000');
checarIgual(extratoCompleto[1].saldo_apos, 800, 'saldo após a saída de 200 é 800 (1000 - 200)');
checarIgual(extratoCompleto[2].saldo_apos, 900, 'saldo após o reforço de 100 é 900 (800 + 100) -- bate com saldoCaixinha()');

// Filtro de período: só mostra a saída do meio, mas o saldo dela continua
// refletindo o que já tinha acontecido ANTES do período filtrado (800),
// não recomeça do zero.
const extratoFiltrado = extratoCaixinha(caixinha, movimentacoes, { dataDe: '2026-08-04', dataAte: '2026-08-06' });
checarIgual(extratoFiltrado.length, 1, 'filtro de período restringe a listagem só à saída de 05/08');
checarIgual(extratoFiltrado[0].id, 'm3', 'a única linha do período filtrado é a saída de 05/08');
checarIgual(extratoFiltrado[0].saldo_apos, 800, 'saldo da linha filtrada continua sendo o acumulado real (800), não recomeça do zero por causa do filtro');

checar(extratoCaixinha({ id: 'cx-1' }, []).length === 0, 'sem nenhuma movimentação, extrato vem vazio');

checarSemErrosNaoTratados(erros, 'caixinha_extrato_saldo_acumulado');
relatorioFinal('caixinha_extrato_saldo_acumulado');
