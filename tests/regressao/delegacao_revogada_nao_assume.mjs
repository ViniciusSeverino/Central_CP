// Delegação REVOGADA (ativo=false, mesmo estando dentro do período de
// datas): revogação manual sempre vence -- 'u-delegado-revogada' não deve
// assumir o papel do titular mesmo com data_inicio/data_fim válidos hoje.
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, checarSemErrosNaoTratados, relatorioFinal } from './lib/assert.mjs';

const { document, erros } = await bootApp(PERFIS.delegadoRevogada);

const nav = Array.from(document.querySelectorAll('.sb-nav [data-view]')).map(b => b.dataset.view);
checar(!nav.includes('aprovacao'), 'delegação REVOGADA (ativo=false) não dá acesso a "aprovacao" mesmo dentro do período de datas');
checar(nav.includes('lancar_group'), 'continua só com o papel próprio (contas_a_pagar)');

checarSemErrosNaoTratados(erros, 'delegacao_revogada_nao_assume');
relatorioFinal('delegacao_revogada_nao_assume');
