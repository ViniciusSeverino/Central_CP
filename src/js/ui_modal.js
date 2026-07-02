// src/js/ui_modal.js
import { app, escapeHtml } from './state.js';
import {
  formNovaNota, formAprovar, formReprovar, formPendencia, renderDetalhe,
  formLoteLancarGroup, formLoteAbrirChamado, formLoteValidarCsc, formLoteConfirmarPagamento,
} from './ui_nota.js';
import { renderCadastros, formConvidarUsuario, formEditarUsuario, formNovaDelegacao } from './ui_cadastros.js';

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

export function renderModal() {
  const t = app.state.modal;
  if (t === 'nova_nota') return modalShell('Nova nota', 'O departamento registra aqui a nota recebida do fornecedor', formNovaNota(), true);
  if (t === 'detalhe') return modalShell('Detalhes da nota', '', renderDetalhe(app.state.modalData));
  if (t === 'aprovar') return modalShell('Aprovar nota', 'Confirma a aprovação para seguir ao contas a pagar', formAprovar());
  if (t === 'reprovar') return modalShell('Reprovar / pedir ajuste', 'A nota volta para o departamento com o motivo', formReprovar());
  if (t === 'marcar_pendencia') return modalShell('Marcar pendência', 'Descreva a divergência encontrada — o departamento responsável vai corrigir e devolver', formPendencia());
  if (t === 'lote_lancar_group') return modalShell('Lançar no Group', `Lançamento único aplicado às ${app.state.modalData.length} nota(s) selecionada(s)`, formLoteLancarGroup(app.state.modalData));
  if (t === 'lote_abrir_chamado') return modalShell('Abrir chamado', `Chamado único aplicado às ${app.state.modalData.length} nota(s) selecionada(s)`, formLoteAbrirChamado(app.state.modalData));
  if (t === 'lote_validar_csc') return modalShell('Validar CSC', `Confirma a validação do CSC para ${app.state.modalData.length} nota(s)`, formLoteValidarCsc(app.state.modalData));
  if (t === 'lote_confirmar_pagamento') return modalShell('Confirmar pagamento', `Pagamento confirmado para ${app.state.modalData.length} nota(s)`, formLoteConfirmarPagamento(app.state.modalData));
  if (t === 'editar_reenviar') {
    const n = app.notas.find(x => x.id === app.state.modalData);
    const titulo = n && n.status === 'rascunho' ? 'Continuar rascunho' : 'Ajustar e reenviar';
    const sub = n && n.status === 'rascunho' ? 'Continue de onde parou' : 'Corrija os dados apontados na reprovação e reenvie para aprovação';
    return modalShell(titulo, sub, formNovaNota(n), true);
  }
  if (t === 'corrigir_pendencia') {
    const n = app.notas.find(x => x.id === app.state.modalData);
    return modalShell('Corrigir pendência', `Motivo: ${escapeHtml(n && n.motivo_pendencia ? n.motivo_pendencia : '—')}`, formNovaNota(n, true), true);
  }
  if (t === 'convidar_usuario') return modalShell('Convidar usuário', 'Cria a conta e envia um e-mail pra pessoa definir a senha', formConvidarUsuario());
  if (t === 'editar_usuario') {
    const u = (app.usuariosCompletos || []).find(x => x.id === app.state.modalData);
    return modalShell('Editar usuário', '', formEditarUsuario(u || {}));
  }
  if (t === 'nova_delegacao') return modalShell('Nova delegação', 'Enquanto ativa, o delegado assume as permissões do titular', formNovaDelegacao());
  return '';
}
