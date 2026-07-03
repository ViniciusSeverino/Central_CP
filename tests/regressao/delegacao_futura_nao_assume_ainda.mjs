// Delegação FUTURA (data_inicio ainda não chegou): não deve valer ainda
// -- 'u-delegado-futura' continua só contas_a_pagar (não vira super_usuario)
// até a data começar.
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, checarSemErrosNaoTratados, relatorioFinal } from './lib/assert.mjs';

const { document, erros } = await bootApp(PERFIS.delegadoFutura);

const nav = Array.from(document.querySelectorAll('.sb-nav [data-view]')).map(b => b.dataset.view);
checar(!nav.includes('aprovacao'), 'delegação FUTURA ainda NÃO dá acesso a "aprovacao" (data_inicio no futuro)');
checar(nav.includes('lancar_group'), 'continua com a fila normal de contas_a_pagar (papel próprio)');
checar(!nav.includes('rascunhos'), 'não vira super_usuario ainda');

checarSemErrosNaoTratados(erros, 'delegacao_futura_nao_assume_ainda');
relatorioFinal('delegacao_futura_nao_assume_ainda');
