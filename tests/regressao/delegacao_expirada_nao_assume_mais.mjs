// Delegação EXPIRADA (data_fim já passou): não vale mais -- 'u-delegado-expirada'
// volta a ser só contas_a_pagar depois que o período termina.
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, checarSemErrosNaoTratados, relatorioFinal } from './lib/assert.mjs';

const { document, erros } = await bootApp(PERFIS.delegadoExpirada);

const nav = Array.from(document.querySelectorAll('.sb-nav [data-view]')).map(b => b.dataset.view);
checar(!nav.includes('aprovacao'), 'delegação EXPIRADA não dá mais acesso a "aprovacao"');
checar(nav.includes('lancar_group'), 'volta a ver só a fila normal de contas_a_pagar');

checarSemErrosNaoTratados(erros, 'delegacao_expirada_nao_assume_mais');
relatorioFinal('delegacao_expirada_nao_assume_mais');
