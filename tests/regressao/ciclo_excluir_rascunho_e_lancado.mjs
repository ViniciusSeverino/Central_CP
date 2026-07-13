// Excluir (hard delete): departamento só o próprio rascunho;
// gerente_financeiro (super_usuario não-administrador) só rascunho/
// lançado/aprovado (pré-Group); administrador é a exceção -- pode excluir
// em QUALQUER etapa, inclusive já paga (ver 0023_admin_exclui_qualquer_etapa.sql).
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { document, erros, supabaseClientMod } = await bootApp(PERFIS.administrador);

const app = (await import('./app/src/js/state.js')).app;
const { render } = await import('./app/src/js/app.js');

app.state.modal = 'detalhe';
app.state.modalData = 'nota-1'; // status: lancado
render();
await new Promise(r => setTimeout(r, 50));
checar(!!document.querySelector('[data-excluir-nota]'), 'administrador vê botão Excluir numa nota "lancado" (pré-Group)');
document.querySelector('[data-excluir-nota]').click();
await new Promise(r => setTimeout(r, 150));
checar(!supabaseClientMod.__fixtures().notas.find(n => n.id === 'nota-1'), 'nota-1 realmente foi excluída (hard delete)');

app.state.modal = 'detalhe';
app.state.modalData = 'nota-2'; // status: aprovado, criado por outro usuário
render();
await new Promise(r => setTimeout(r, 50));
checar(!!document.querySelector('[data-excluir-nota]'), 'administrador (super_usuario) pode excluir uma nota "aprovado" mesmo não sendo o dono');

app.state.modal = 'detalhe';
app.state.modalData = 'nota-4'; // status: chamado_aberto (pós-Group)
render();
await new Promise(r => setTimeout(r, 50));
checar(!!document.querySelector('[data-excluir-nota]'), 'administrador vê botão Excluir mesmo numa nota pós-Group (chamado_aberto)');
checar(!!Array.from(document.querySelectorAll('[data-action]')).find(b => b.dataset.action === 'cancelar_lancamento'), 'botão de Cancelar lançamento continua aparecendo ao lado do Excluir (administrador tem as duas opções)');

app.state.modal = 'detalhe';
app.state.modalData = 'nota-9'; // status: pago
render();
await new Promise(r => setTimeout(r, 50));
checar(!!document.querySelector('[data-excluir-nota]'), 'administrador vê botão Excluir mesmo numa nota já paga');
document.querySelector('[data-excluir-nota]').click();
await new Promise(r => setTimeout(r, 150));
checar(!supabaseClientMod.__fixtures().notas.find(n => n.id === 'nota-9'), 'nota-9 (já paga) realmente foi excluída (hard delete)');

app.state.modal = null; app.state.modalData = null;
checarSemErrosNaoTratados(erros, 'ciclo_excluir_rascunho_e_lancado');
relatorioFinal('ciclo_excluir_rascunho_e_lancado');
