// Reimportar os relatórios do Group (ver db.js / migration 0059): a
// importação anterior é apagada pelo RPC limpar_relatorio_group (TRUNCATE
// no servidor -- o DELETE pela API estourava o tempo limite com ~28 mil
// receitas) e gravar duas vezes substitui, sem duplicar.
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checarIgual, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { erros, supabaseClientMod } = await bootApp(PERFIS.administrador);
const db = await import('./app/src/js/db.js');
const fx = () => supabaseClientMod.__fixtures();

const rec = (id) => ({ id_group: id, pagador_id: 'pag-1', classe: 'ALUGUEL MÍNIMO', faturado: 10, valor_liquido: 10 });
await db.substituirGroupReceitas([rec(1), rec(2), rec(3)]);
checarIgual(fx().group_receitas.length, 3, 'primeira importação de receitas');
await db.substituirGroupReceitas([rec(4), rec(5)]);
checarIgual(fx().group_receitas.map(r => r.id_group), [4, 5], 'reimportar substitui (sem duplicar)');

const lanc = (id) => ({ id_group: id, pagador_id: 'pag-1', valor: 1 });
await db.substituirGroupLancamentos([lanc(1), lanc(2)]);
await db.substituirGroupLancamentos([lanc(7)]);
checarIgual(fx().group_lancamentos.map(r => r.id_group), [7], 'despesas: mesma coisa');
checarIgual(fx().group_receitas.length, 2, 'limpar as despesas não mexe nas receitas');

checarSemErrosNaoTratados(erros, 'group_gravar');
relatorioFinal('group_gravar');
