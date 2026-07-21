// Rascunho pro perfil "recebedor" (pedido do dono do produto, ponto 4):
// mesma ideia do rascunho do formulário completo, só que reabre o
// formulário simplificado (formRecebimento). Novo status
// 'rascunho_recebimento' (migration 0031/0032) -- sem nenhum campo
// obrigatório pra salvar (esse é o propósito de um rascunho: guardar
// progresso incompleto). Só testa com ZERO anexos em todo o percurso via
// UI -- com anexo presente, finalizarAnexos() tentaria mesclar em PDF de
// verdade (pdf-lib via esm.sh), que só roda num navegador real (mesma
// limitação documentada em outros testes desta suíte); a persistência com
// anexo é testada direto no db.js no fim deste arquivo.
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, checarIgual, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { dom, document, erros, supabaseClientMod } = await bootApp(PERFIS.departamentoRecebedor);

const rascunhosAntes = document.querySelector('[data-view="rascunhos"] .count').textContent;

document.getElementById('btn-novo-recebimento').click();
await new Promise(r => setTimeout(r, 100));

checarIgual(document.getElementById('nf-pagador').value, 'pag-2', 'pagador vem pré-preenchido (Marketing -> FPP)');
document.getElementById('nf-centro-custo').value = 'cc-2';
document.getElementById('nf-centro-custo').dispatchEvent(new dom.window.Event('change'));
await new Promise(r => setTimeout(r, 50));
document.getElementById('nf-classe-conta').value = 'cl-2';

// Salva como rascunho SEM anexo -- ao contrário de "Enviar para
// complementação", isso não é bloqueado (rascunho aceita incompleto).
document.getElementById('btn-salvar-recebimento-rascunho').click();
await new Promise(r => setTimeout(r, 150));
checar(!!document.querySelector('.flash'), 'flash de confirmação aparece depois de salvar o rascunho');

let fixtures = supabaseClientMod.__fixtures().notas;
const rascunho = fixtures.find(n => n.status === 'rascunho_recebimento' && n.criado_por === PERFIS.departamentoRecebedor.usuarioId);
checar(!!rascunho, 'rascunho foi criado com status rascunho_recebimento');
checarIgual(rascunho.pagador_id, 'pag-2', 'rascunho guarda o pagador escolhido');
checarIgual(rascunho.centro_custo_id, 'cc-2', 'rascunho guarda o centro de custo escolhido');
checarIgual(rascunho.setor, 'Marketing', 'rascunho guarda o setor do recebedor');

const contadorRascunhos = document.querySelector('[data-view="rascunhos"] .count').textContent;
checar(parseInt(contadorRascunhos, 10) === parseInt(rascunhosAntes, 10) + 1, 'contador de "Rascunhos" soma o novo rascunho de recebimento');

// Reabre pelo detalhe: mostra "Continuar rascunho" (não "Continuar
// editando", que é do rascunho do formulário completo).
document.querySelector('[data-view="rascunhos"]').click();
await new Promise(r => setTimeout(r, 100));
checar(document.querySelector(`.nota-card[data-open="${rascunho.id}"] .pend-badge`).textContent.includes('Rascunho (recebimento)'), 'card mostra o badge "Rascunho (recebimento)"');
document.querySelector(`[data-open="${rascunho.id}"]`).click();
await new Promise(r => setTimeout(r, 100));
checar(!!document.querySelector(`[data-action="continuar_recebimento"][data-id="${rascunho.id}"]`), 'detalhe mostra a ação "Continuar rascunho"');
checar(!document.querySelector(`[data-action="editar_reenviar"][data-id="${rascunho.id}"]`), 'NÃO mostra "Continuar editando" (isso é do rascunho do formulário completo)');

document.querySelector(`[data-action="continuar_recebimento"][data-id="${rascunho.id}"]`).click();
await new Promise(r => setTimeout(r, 100));
checarIgual(document.getElementById('nf-pagador').value, 'pag-2', 'reabre com o pagador já salvo');
checarIgual(document.getElementById('nf-centro-custo').value, 'cc-2', 'reabre com o centro de custo já salvo');
checarIgual(document.getElementById('btn-salvar-recebimento').textContent, 'Enviar para complementação', 'botão principal continua sendo o de enviar (ainda não foi submetido)');
checar(!!document.getElementById('btn-salvar-recebimento-rascunho'), 'continua podendo salvar como rascunho de novo');

// Salva de novo como rascunho (ainda sem anexo) -- idempotente, continua
// rascunho_recebimento.
document.getElementById('btn-salvar-recebimento-rascunho').click();
await new Promise(r => setTimeout(r, 150));
fixtures = supabaseClientMod.__fixtures().notas;
checarIgual(fixtures.find(n => n.id === rascunho.id).status, 'rascunho_recebimento', 'continua rascunho depois de salvar de novo');

// Persistência do envio de verdade (com anexo) -- direto no db.js, sem
// passar pela mescla de PDF (ver nota no topo do arquivo).
const db = await import('./app/src/js/db.js');
const { app } = await import('./app/src/js/state.js');
await db.atualizarNota(
  rascunho.id,
  { pagador_id: 'pag-2', centro_custo_id: 'cc-2', classe_conta_id: 'cl-2', codigo_classificacao_id: null, fornecedor_id: null, descricao: null, anexos: [`${rascunho.id}/doc-final.pdf`], setor: 'Marketing' },
  app.usuario, 'recebido', [{ acao: 'Rascunho enviado para complementação' }],
);
const enviado = supabaseClientMod.__fixtures().notas.find(n => n.id === rascunho.id);
checarIgual(enviado.status, 'recebido', 'ao enviar de verdade, o status vira "recebido"');
checarIgual(enviado.anexos, [`${rascunho.id}/doc-final.pdf`], 'anexo final fica salvo na nota');

checarSemErrosNaoTratados(erros, 'recebimento_rascunho');
relatorioFinal('recebimento_rascunho');
