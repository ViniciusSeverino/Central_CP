// Fluxo completo do contas_a_pagar: agrupar por pagador+vencimento,
// preencher o código do Group, confirmar em lote, e ver as notas migrarem
// pra "Abrir chamado" -- e a fila de Pendências mostrando quem já foi
// devolvido pelo CSC.
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { document, erros, supabaseClientMod } = await bootApp(PERFIS.contasAPagar);
const totalPendentesFixture = supabaseClientMod.__fixtures().notas.filter(n => n.pendente && n.status !== 'cancelada').length;

document.querySelector('[data-view="lancar_group"]').click();
await new Promise(r => setTimeout(r, 100));
const grupo = document.querySelector('.grupo-card');
const qtdNoGrupo = grupo.querySelectorAll('.nota-card, .grupo-check').length ? grupo.querySelectorAll('.grupo-check').length : 1;

grupo.querySelector('[data-lote-action]').click();
await new Promise(r => setTimeout(r, 100));
checar(document.querySelectorAll('.modal .data-tbl tbody tr').length === qtdNoGrupo, 'modal de lote lista exatamente as notas do grupo');

document.getElementById('input-lancamento-group').value = 'GRP-555';
document.getElementById('confirmar-lote-lancar-group').click();
await new Promise(r => setTimeout(r, 150));
checar(!!document.querySelector('.flash'), 'flash de confirmação aparece depois de lançar no Group');

document.querySelector('[data-view="lancar_group"]').click();
await new Promise(r => setTimeout(r, 100));
checar(document.querySelectorAll('.grupo-card').length === 0, 'o grupo processado some da fila "Lançar no Group"');

document.querySelector('[data-view="abrir_chamado"]').click();
await new Promise(r => setTimeout(r, 100));
checar(document.querySelectorAll('.grupo-card').length >= 1, 'as mesmas notas aparecem agora em "Abrir chamado"');

document.querySelector('[data-view="pendencias"]').click();
await new Promise(r => setTimeout(r, 100));
checar(document.querySelectorAll('.nota-card').length === totalPendentesFixture, `fila de Pendências mostra exatamente as ${totalPendentesFixture} nota(s) pendente(s) do fixture`);

checarSemErrosNaoTratados(erros, 'ciclo_lote_lancar_group_ate_pendencia');
relatorioFinal('ciclo_lote_lancar_group_ate_pendencia');
