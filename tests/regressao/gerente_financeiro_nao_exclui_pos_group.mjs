// gerente_financeiro continua restrito ao pré-Group pra excluir de vez --
// só administrador ganhou a exceção de excluir em qualquer etapa (ver
// ciclo_excluir_rascunho_e_lancado.mjs e 0023_admin_exclui_qualquer_etapa.sql).
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { document, erros } = await bootApp(PERFIS.gerenteFinanceiro);

const app = (await import('./app/src/js/state.js')).app;
const { render } = await import('./app/src/js/app.js');

app.state.modal = 'detalhe';
app.state.modalData = 'nota-1'; // status: lancado (pré-Group)
render();
await new Promise(r => setTimeout(r, 50));
checar(!!document.querySelector('[data-excluir-nota]'), 'gerente_financeiro vê botão Excluir numa nota pré-Group ("lancado")');

app.state.modal = 'detalhe';
app.state.modalData = 'nota-4'; // status: chamado_aberto (pós-Group)
render();
await new Promise(r => setTimeout(r, 50));
checar(!document.querySelector('[data-excluir-nota]'), 'gerente_financeiro NÃO vê botão Excluir numa nota pós-Group (chamado_aberto) -- só administrador ganhou essa exceção');
checar(!!Array.from(document.querySelectorAll('[data-action]')).find(b => b.dataset.action === 'cancelar_lancamento'), 'botão de Cancelar lançamento aparece no lugar do Excluir pra gerente_financeiro');

app.state.modal = 'detalhe';
app.state.modalData = 'nota-9'; // status: pago
render();
await new Promise(r => setTimeout(r, 50));
checar(!document.querySelector('[data-excluir-nota]'), 'gerente_financeiro NÃO vê botão Excluir numa nota já paga');

app.state.modal = null; app.state.modalData = null;
checarSemErrosNaoTratados(erros, 'gerente_financeiro_nao_exclui_pos_group');
relatorioFinal('gerente_financeiro_nao_exclui_pos_group');
