// Cancelar um lançamento (pós-Group) exige motivo preenchido; depois de
// cancelada, some das filas ativas (pendências) mas continua visível em
// "Todas as notas" -- o registro nunca desaparece, só muda de status.
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { document, erros, supabaseClientMod } = await bootApp(PERFIS.administrador);
const { app } = await import('./app/src/js/state.js');
const { render } = await import('./app/src/js/app.js');

app.state.modal = 'detalhe';
app.state.modalData = 'nota-4'; // chamado_aberto, pendente=true
render();
await new Promise(r => setTimeout(r, 50));

const btnCancelar = Array.from(document.querySelectorAll('[data-action]')).find(b => b.dataset.action === 'cancelar_lancamento');
btnCancelar.click();
await new Promise(r => setTimeout(r, 50));

document.getElementById('confirmar-cancelar-lancamento').click();
await new Promise(r => setTimeout(r, 50));
checar(supabaseClientMod.__fixtures().notas.find(n => n.id === 'nota-4').status !== 'cancelada', 'confirmar SEM motivo preenchido não cancela nada');

document.getElementById('input-motivo-cancelamento').value = 'Fornecedor errado, nota duplicada por engano.';
document.getElementById('confirmar-cancelar-lancamento').click();
await new Promise(r => setTimeout(r, 150));

const nota4 = supabaseClientMod.__fixtures().notas.find(n => n.id === 'nota-4');
checar(nota4.status === 'cancelada', 'com motivo preenchido, o status vira "cancelada"');
checar(nota4.pendente === false, 'a flag de pendência é limpa ao cancelar');
checar(!!nota4.motivo_cancelamento, 'o motivo do cancelamento fica salvo na nota');
checar(nota4.cancelado_por === PERFIS.administrador.usuarioId, 'cancelado_por registra quem cancelou de fato');

app.state.modal = null; app.state.modalData = null;
document.querySelector('[data-view="pendencias"]').click();
await new Promise(r => setTimeout(r, 50));
checar(!document.querySelector('[data-open="nota-4"]'), 'nota cancelada some da fila de Pendências');

document.querySelector('[data-view="todas"]').click();
await new Promise(r => setTimeout(r, 50));
checar(!!document.querySelector('[data-open="nota-4"]'), 'mas continua aparecendo em "Todas as notas" (o registro nunca some)');

checarSemErrosNaoTratados(erros, 'ciclo_cancelar_lancamento_com_motivo');
relatorioFinal('ciclo_cancelar_lancamento_com_motivo');
