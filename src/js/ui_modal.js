// src/js/ui_modal.js
import { app, escapeHtml } from './state.js';
import {
  formNovaNota, formAprovar, formReprovar, formPendencia, renderDetalhe,
  formLoteLancarGroup, formLoteAbrirChamado, formLoteValidarCsc, formLoteConfirmarPagamento,
  formCancelarLancamento,
} from './ui_nota.js';
import { renderCadastros, formConvidarUsuario, formEditarUsuario, formNovaDelegacao, formFornecedor } from './ui_cadastros.js';

// Formulário de nota e detalhe são grandes o bastante pra merecer a área
// principal inteira em vez de uma janela pequena por cima — ver
// renderShell() em ui.js, que decide com base nesse set se o "main" mostra
// a fila normal ou o conteúdo desses 4 tipos de modal.
export const FULL_PAGE_MODALS = new Set(['nova_nota', 'editar_reenviar', 'corrigir_pendencia', 'detalhe']);

export function modalShell(title, sub, bodyHtml, protect) {
  return `
  <div class="modal-bg" id="modal-bg" ${protect ? 'data-protect="1"' : ''}>
    <div class="modal">
      <button class="modal-close" id="modal-close">✕</button>
      <h3>${title}</h3>
      ${sub ? `<p class="modal-sub">${sub}</p>` : ''}
      ${bodyHtml}
    </div>
  </div>`;
}

// Mesmo conteúdo do modal pequeno, só que ocupando a área principal como
// as outras telas (sidebar continua navegável do lado). O id "modal-close"
// se repete de propósito — é o mesmo elemento que o resto do código já
// sabe amarrar (attachNotaModalHandlers), só que estilizado como
// "← Voltar" em vez do "✕" circular do modal pequeno.
export function pageShell(title, sub, bodyHtml, protect) {
  return `
  <div class="page-form" ${protect ? 'data-protect="1"' : ''}>
    <div class="topbar">
      <div><h2>${title}</h2>${sub ? `<p class="sub">${sub}</p>` : ''}</div>
      <button class="btn btn-ghost btn-sm" id="modal-close">← Voltar</button>
    </div>
    ${bodyHtml}
  </div>`;
}

function conteudoDoModal(t, shell) {
  if (t === 'nova_nota') return shell('Nova nota', 'O departamento registra aqui a nota recebida do fornecedor', formNovaNota(), true);
  if (t === 'detalhe') return shell('Detalhes da nota', '', renderDetalhe(app.state.modalData));
  if (t === 'aprovar') return shell('Aprovar nota', 'Confirma a aprovação para seguir ao contas a pagar', formAprovar());
  if (t === 'reprovar') return shell('Reprovar / pedir ajuste', 'A nota volta para o departamento com o motivo', formReprovar());
  if (t === 'marcar_pendencia') return shell('Marcar pendência', 'Descreva a divergência encontrada — o departamento responsável vai corrigir e devolver', formPendencia());
  if (t === 'cancelar_lancamento') return shell('Cancelar lançamento', 'A nota já foi lançada no Group — cancelar mantém o registro, só sai das filas ativas', formCancelarLancamento());
  if (t === 'lote_lancar_group') return shell('Lançar no Group', `Lançamento único aplicado às ${app.state.modalData.length} nota(s) selecionada(s)`, formLoteLancarGroup(app.state.modalData));
  if (t === 'lote_abrir_chamado') return shell('Abrir chamado', `Chamado único aplicado às ${app.state.modalData.length} nota(s) selecionada(s)`, formLoteAbrirChamado(app.state.modalData));
  if (t === 'lote_validar_csc') return shell('Validar CSC', `Confirma a validação do CSC para ${app.state.modalData.length} nota(s)`, formLoteValidarCsc(app.state.modalData));
  if (t === 'lote_confirmar_pagamento') return shell('Confirmar pagamento', `Pagamento confirmado para ${app.state.modalData.length} nota(s)`, formLoteConfirmarPagamento(app.state.modalData));
  if (t === 'editar_reenviar') {
    const n = app.notas.find(x => x.id === app.state.modalData);
    const titulo = n && n.status === 'rascunho' ? 'Continuar rascunho' : 'Ajustar e reenviar';
    const sub = n && n.status === 'rascunho' ? 'Continue de onde parou' : 'Corrija os dados apontados na reprovação e reenvie para aprovação';
    return shell(titulo, sub, formNovaNota(n), true);
  }
  if (t === 'corrigir_pendencia') {
    const n = app.notas.find(x => x.id === app.state.modalData);
    return shell('Corrigir pendência', `Motivo: ${escapeHtml(n && n.motivo_pendencia ? n.motivo_pendencia : '—')}`, formNovaNota(n, true), true);
  }
  if (t === 'convidar_usuario') return shell('Convidar usuário', 'Cria a conta e envia um e-mail pra pessoa definir a senha', formConvidarUsuario());
  if (t === 'editar_usuario') {
    const u = (app.usuariosCompletos || []).find(x => x.id === app.state.modalData);
    return shell('Editar usuário', '', formEditarUsuario(u || {}));
  }
  if (t === 'nova_delegacao') return shell('Nova delegação', 'Enquanto ativa, o delegado assume as permissões do titular', formNovaDelegacao());
  if (t === 'novo_fornecedor') return shell('Adicionar fornecedor', '', formFornecedor());
  if (t === 'editar_fornecedor') {
    const f = app.cadastros.fornecedores.find(x => x.id === app.state.modalData);
    return shell('Editar fornecedor', '', formFornecedor(f || {}));
  }
  return '';
}

export function renderModal() {
  return conteudoDoModal(app.state.modal, modalShell);
}

export function renderModalPagina() {
  return conteudoDoModal(app.state.modal, pageShell);
}
