// Delegação FUTURA (data_inicio ainda não chegou): não deve valer ainda
// -- 'u-delegado-futura' continua só contas_a_pagar (não vira super_usuario)
// até a data começar. ("rascunhos" não serve mais de sinal disso sozinho:
// contas_a_pagar agora tem "Meus rascunhos" por conta própria, já que
// também lança nota pro setor Financeiro -- ver
// 0024_cp_lanca_para_financeiro_e_todas_notas_geral.sql -- então o sinal
// de super_usuario é mesmo só "aprovacao".)
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, checarSemErrosNaoTratados, relatorioFinal } from './lib/assert.mjs';

const { document, erros } = await bootApp(PERFIS.delegadoFutura);

const nav = Array.from(document.querySelectorAll('.sb-nav [data-view]')).map(b => b.dataset.view);
checar(!nav.includes('aprovacao'), 'delegação FUTURA ainda NÃO dá acesso a "aprovacao" (data_inicio no futuro)');
checar(nav.includes('lancar_group'), 'continua com a fila normal de contas_a_pagar (papel próprio)');
checar(nav.includes('rascunhos'), '"Meus rascunhos" continua visível -- é do próprio papel contas_a_pagar, não da delegação');

checarSemErrosNaoTratados(erros, 'delegacao_futura_nao_assume_ainda');
relatorioFinal('delegacao_futura_nao_assume_ainda');
