// src/js/ui_modal.js
import { app } from './state.js';
import { formNovaNota, formAprovar, formReprovar, formLancarGroup, formConfirmarPagamento, formPendencia, formResolverPendencia, renderDetalhe } from './ui_nota.js';
import { renderCadastros } from './ui_cadastros.js';

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
  if (t === 'lancar_group') return modalShell('Lançar no Group e abrir chamado', 'Informe o número do chamado aberto no Acelerato', formLancarGroup());
  if (t === 'confirmar_pagamento') return modalShell('Confirmar pagamento', 'O CSC retornou o chamado confirmando o pagamento', formConfirmarPagamento());
  if (t === 'marcar_pendencia') return modalShell('Marcar pendência', 'Descreva a divergência encontrada', formPendencia());
  if (t === 'resolver_pendencia') return modalShell('Resolver pendência', 'Descreva como a divergência foi resolvida', formResolverPendencia());
  if (t === 'editar_reenviar') {
    const n = app.notas.find(x => x.id === app.state.modalData);
    const titulo = n && n.status === 'rascunho' ? 'Continuar rascunho' : 'Ajustar e reenviar';
    const sub = n && n.status === 'rascunho' ? 'Continue de onde parou' : 'Corrija os dados apontados pelo gestor e reenvie para aprovação';
    return modalShell(titulo, sub, formNovaNota(n), true);
  }
  return '';
}
