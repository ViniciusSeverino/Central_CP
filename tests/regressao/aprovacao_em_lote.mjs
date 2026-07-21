// Aprovação em lote (pedido do dono do produto, perfil gerente_financeiro/
// administrador): a fila "Aguardando aprovação" reaproveita o mesmo
// mecanismo de checkbox + [data-lote-action]/[data-lote-group] já usado
// pelas 4 filas do contas a pagar (ver renderQueueAprovacao em ui.js) --
// um grupo único (não por pagador+vencimento, já que aprovar é um
// julgamento por nota, não um evento externo que naturalmente junta
// várias). O fixture já tem 3 notas 'lancado'/!pendente (nota-1, nota-7,
// nota-8) -- nenhuma nova precisou ser criada.
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, checarIgual, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { dom, document, erros, supabaseClientMod } = await bootApp(PERFIS.gerenteFinanceiro);

document.querySelector('[data-view="aprovacao"]').click();
await new Promise(r => setTimeout(r, 100));

const grupo = document.querySelector('.grupo-card');
checar(!!grupo, 'fila "Aguardando aprovação" mostra um grupo único (não agrupado por pagador+vencimento)');
const checks = grupo.querySelectorAll('.grupo-check');
checarIgual(checks.length, 3, 'as 3 notas lancado/!pendente do fixture aparecem na fila (nota-1, nota-7, nota-8)');
checar(Array.from(checks).every(c => c.checked), 'todas vêm marcadas por padrão');
checarIgual(grupo.querySelector('[data-grupo-count]').textContent.trim(), '3', 'contador do botão de lote começa em 3');

// Desmarcar 1: contador do botão acompanha, igual nos outros lotes do
// contas a pagar (mesmo wiring genérico, sem nada novo pra "aprovação").
checks[0].checked = false;
checks[0].dispatchEvent(new dom.window.Event('change'));
await new Promise(r => setTimeout(r, 30));
checarIgual(grupo.querySelector('[data-grupo-count]').textContent.trim(), '2', 'desmarcar 1 nota atualiza o contador pra 2');

grupo.querySelector('[data-grupo-select-all]').click();
await new Promise(r => setTimeout(r, 30));
checar(Array.from(document.querySelectorAll('.grupo-check')).every(c => c.checked), '"Selecionar todas" volta a marcar as 3');

const btnLote = document.querySelector('[data-lote-action="lote_aprovar"]');
btnLote.click();
await new Promise(r => setTimeout(r, 100));
checar(document.querySelectorAll('.modal .data-tbl tbody tr').length === 3, 'modal de aprovação em lote lista as 3 notas selecionadas');
checar(document.getElementById('confirmar-lote-aprovar').textContent.includes('3'), 'botão de confirmação mostra a quantidade de notas');

document.getElementById('confirmar-lote-aprovar').click();
await new Promise(r => setTimeout(r, 150));
checar(!!document.querySelector('.flash'), 'flash de confirmação aparece depois de aprovar em lote');

const fixtures = supabaseClientMod.__fixtures().notas;
['nota-1', 'nota-7', 'nota-8'].forEach(id => {
  const n = fixtures.find(x => x.id === id);
  checarIgual(n.status, 'aprovado', `${id} foi aprovada`);
  checarIgual(n.aprovado_por, PERFIS.gerenteFinanceiro.usuarioId, `${id} registra quem aprovou em lote`);
});

document.querySelector('[data-view="aprovacao"]').click();
await new Promise(r => setTimeout(r, 100));
checar(!document.querySelector('.grupo-card'), 'fila "Aguardando aprovação" fica vazia depois de aprovar tudo');

checarSemErrosNaoTratados(erros, 'aprovacao_em_lote');
relatorioFinal('aprovacao_em_lote');
