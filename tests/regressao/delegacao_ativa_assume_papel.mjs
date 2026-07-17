// Delegação ATIVA (hoje dentro do período, ativo=true) -- mesmo exemplo
// da seção 1.2 de docs/fluxo-processo.md: 'u-delegado-ativa' é
// contas_a_pagar, mas está cobrindo 'u-titular-gerente' (gerente_financeiro).
// Enquanto a delegação vale, ele deve virar super_usuario de fato (ver
// papeis_efetivos()/eh_super_usuario()) e ganhar a fila de aprovação.
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, checarSemErrosNaoTratados, relatorioFinal } from './lib/assert.mjs';

const { document, erros } = await bootApp(PERFIS.delegadoAtiva);

const nav = Array.from(document.querySelectorAll('.sb-nav [data-view]')).map(b => b.dataset.view);
checar(nav.includes('aprovacao'), 'contas_a_pagar com delegação ATIVA de gerente_financeiro passa a ver "aprovacao"');
checar(nav.includes('rascunhos'), 'contas_a_pagar com delegação ATIVA continua vendo "Meus rascunhos" (já tinha por conta própria, ver 0024_cp_lanca_para_financeiro_e_todas_notas_geral.sql)');

checarSemErrosNaoTratados(erros, 'delegacao_ativa_assume_papel');
relatorioFinal('delegacao_ativa_assume_papel');
