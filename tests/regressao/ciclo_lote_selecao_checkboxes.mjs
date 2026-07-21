// Seleção de notas dentro de um grupo (agrupado por pagador+vencimento):
// desmarcar individualmente atualiza o contador, "Nenhuma" desabilita o
// botão de lote, "Todas" reabilita. Usa "Abrir chamado" -- "Lançar no
// Group" não agrupa mais (cada nota tem código próprio no Group, ver
// ciclo_lote_lancar_group_ate_pendencia.mjs).
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { dom, document, erros } = await bootApp(PERFIS.contasAPagar);

document.querySelector('[data-view="abrir_chamado"]').click();
await new Promise(r => setTimeout(r, 100));

const grupo = document.querySelector('.grupo-card');
const checks = grupo.querySelectorAll('.grupo-check');
checar(checks.length >= 2, 'grupo agrupa mais de uma nota (mesmo pagador+vencimento)');
checar(Array.from(checks).every(c => c.checked), 'todas as notas do grupo vêm marcadas por padrão');

checks[0].checked = false;
checks[0].dispatchEvent(new dom.window.Event('change'));
await new Promise(r => setTimeout(r, 30));
checar(grupo.querySelector('[data-grupo-count]').textContent.trim() === String(checks.length - 1), 'desmarcar 1 nota atualiza o contador do botão de lote');

grupo.querySelector('[data-grupo-select-none]').click();
await new Promise(r => setTimeout(r, 30));
checar(Array.from(document.querySelectorAll('.grupo-check')).every(c => !c.checked), '"Nenhuma" desmarca todas as notas do grupo');
checar(grupo.querySelector('[data-lote-action]').disabled, 'botão de ação em lote fica desabilitado com 0 selecionadas');

grupo.querySelector('[data-grupo-select-all]').click();
await new Promise(r => setTimeout(r, 30));
checar(Array.from(document.querySelectorAll('.grupo-check')).every(c => c.checked), '"Todas" volta a marcar tudo');
checar(!grupo.querySelector('[data-lote-action]').disabled, 'botão de lote reabilita com >=1 selecionada');

checarSemErrosNaoTratados(erros, 'ciclo_lote_selecao_checkboxes');
relatorioFinal('ciclo_lote_selecao_checkboxes');
