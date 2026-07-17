// src/js/ui_caixinha.js
//
// Aba "Caixinha" (fundo fixo): saldo/teto de cada entidade, registrar
// saída/reforço, aprovar/rejeitar pendências. O cálculo de saldo é lógica
// pura (ver caixinha.js) -- aqui só a exibição; wiring em events_caixinha.js.
import {
  app, escapeHtml, fmtMoney, fmtDate, nomeUsuario, ehSuperUsuario, ehAdministrador, podeOperarCadastro,
  CAIXINHA_TIPO_LABEL, CAIXINHA_STATUS_LABEL, CAIXINHA_STATUS_COLOR, CAIXINHA_STATUS_SOFT,
} from './state.js';
import { saldoCaixinha } from './caixinha.js';

function cardCaixinha(c) {
  const saldo = saldoCaixinha(c, app.caixinhaMovimentacoes);
  const pct = c.valor_teto > 0 ? Math.max(0, Math.min(100, Math.round((saldo / c.valor_teto) * 100))) : 0;
  // Abaixo de 30% do teto chama atenção -- sinal de que está na hora de
  // um reforço, antes que falte dinheiro pra próxima compra emergencial.
  const baixo = saldo < c.valor_teto * 0.3;
  return `
    <div class="dash-card" style="min-width:230px; flex:1;">
      <h3>${escapeHtml(c.nome)}</h3>
      <div class="dash-tile-value${baixo ? ' alert' : ''}">${fmtMoney(saldo)}</div>
      <div class="dash-tile-sub">teto de ${fmtMoney(c.valor_teto)}</div>
      <div class="dash-bar-track" style="margin:8px 0;"><div class="dash-bar-fill" style="width:${pct}%; background:${baixo ? 'var(--alert)' : 'var(--brand)'};"></div></div>
      <div style="display:flex; gap:8px; margin-top:10px; flex-wrap:wrap;">
        <button class="btn btn-amber btn-sm" type="button" data-registrar-caixinha="${c.id}" data-tipo="saida">Registrar saída</button>
        <button class="btn btn-ghost btn-sm" type="button" data-registrar-caixinha="${c.id}" data-tipo="reforco">Registrar reforço</button>
        ${podeOperarCadastro() ? `<button class="btn btn-ghost btn-sm" type="button" data-editar-caixinha="${c.id}">Editar teto</button>` : ''}
      </div>
    </div>`;
}

function linhaMovimentacao(m, c) {
  const podeAprovar = m.status === 'pendente_aprovacao' && ehSuperUsuario();
  const podeExcluir = (m.status === 'pendente_aprovacao' && m.criado_por === app.usuario.id) || ehAdministrador();
  return `
    <tr>
      <td>${escapeHtml(c ? c.nome : '—')}</td>
      <td>${CAIXINHA_TIPO_LABEL[m.tipo]}</td>
      <td class="mono">${fmtMoney(m.valor)}</td>
      <td>${fmtDate(m.data)}</td>
      <td>${escapeHtml(m.motivo)}</td>
      <td>${m.comprovante ? `<a href="#" data-baixar-comprovante-caixinha="${m.id}">Ver</a>` : '—'}</td>
      <td><span class="status-chip" style="background:${CAIXINHA_STATUS_SOFT[m.status]}; color:${CAIXINHA_STATUS_COLOR[m.status]};">${CAIXINHA_STATUS_LABEL[m.status]}</span>${m.status === 'rejeitado' && m.motivo_rejeicao ? `<div class="field-hint">${escapeHtml(m.motivo_rejeicao)}</div>` : ''}</td>
      <td>${escapeHtml(nomeUsuario(m.criado_por))}</td>
      <td style="white-space:nowrap;">
        ${podeAprovar ? `<button class="btn btn-brand btn-sm" type="button" data-aprovar-caixinha="${m.id}">Aprovar</button> <button class="btn btn-alert btn-sm" type="button" data-rejeitar-caixinha="${m.id}">Rejeitar</button>` : ''}
        ${podeExcluir ? `<button class="btn btn-ghost btn-sm" type="button" data-excluir-caixinha="${m.id}">Excluir</button>` : ''}
      </td>
    </tr>`;
}

export function renderCaixinha() {
  const caixinhas = app.cadastros.caixinhas || [];
  const movimentacoes = app.caixinhaMovimentacoes || [];
  return `
    <div class="topbar">
      <div><h2>Caixinha</h2><p class="sub">Fundo fixo por entidade -- toda saída ou reforço passa por aprovação.</p></div>
      ${podeOperarCadastro() ? `<button class="btn btn-ghost btn-sm" type="button" id="btn-nova-caixinha">+ Nova caixinha</button>` : ''}
    </div>
    <div class="dash-tiles" style="align-items:stretch;">
      ${caixinhas.length ? caixinhas.map(cardCaixinha).join('') : '<div class="empty-state">Nenhuma caixinha cadastrada ainda.</div>'}
    </div>
    <div class="dash-card" style="margin-top:18px;">
      <h3>Movimentações</h3>
      ${movimentacoes.length === 0 ? '<div class="empty-hint">Nenhuma movimentação registrada ainda.</div>' : `
      <div class="tbl-wrap">
      <table class="data-tbl">
        <thead><tr><th>Caixinha</th><th>Tipo</th><th>Valor</th><th>Data</th><th>Motivo</th><th>Comprovante</th><th>Status</th><th>Registrado por</th><th></th></tr></thead>
        <tbody>${movimentacoes.map(m => linhaMovimentacao(m, caixinhas.find(c => c.id === m.caixinha_id))).join('')}</tbody>
      </table>
      </div>`}
    </div>`;
}

export function formRegistrarMovimentacaoCaixinha(caixinha, tipo) {
  const hoje = new Date().toISOString().slice(0, 10);
  return `
    <div class="field"><label>Valor (R$)</label><input id="cx-valor" type="number" step="0.01" min="0.01" required></div>
    <div class="field"><label>Data</label><input id="cx-data" type="date" value="${hoje}" required></div>
    <div class="field"><label>Motivo</label><textarea id="cx-motivo" rows="2" required placeholder="${tipo === 'saida' ? 'Ex: compra emergencial de material de limpeza' : 'Ex: reposição via retirada do banco'}"></textarea></div>
    <div class="field"><label>Comprovante (opcional)</label><input id="cx-comprovante" type="file" accept="application/pdf,image/jpeg,image/png,image/webp"></div>
    <div class="modal-actions">
      <button class="btn btn-brand" id="confirmar-registrar-caixinha">${tipo === 'saida' ? 'Registrar saída' : 'Registrar reforço'}</button>
      <button class="btn btn-ghost" id="modal-cancel">Cancelar</button>
    </div>`;
}

export function formCaixinhaCadastro(editing) {
  const c = editing || {};
  return `
    <div class="field"><label>Nome</label><input id="cx-nome" value="${escapeHtml(c.nome || '')}"></div>
    <div class="field"><label>Valor-teto (R$)</label><input id="cx-teto" type="number" step="0.01" min="0.01" value="${c.valor_teto || ''}"></div>
    <div class="modal-actions">
      <button class="btn btn-brand" id="confirmar-caixinha-cadastro">${editing ? 'Salvar' : 'Cadastrar caixinha'}</button>
      <button class="btn btn-ghost" id="modal-cancel">Cancelar</button>
    </div>`;
}

export function formRejeitarCaixinha() {
  return `
    <div class="field"><label>Motivo</label><textarea id="cx-motivo-rejeicao" rows="3" required placeholder="Ex: faltou o comprovante, valor não confere..."></textarea></div>
    <div class="modal-actions">
      <button class="btn btn-alert" id="confirmar-rejeitar-caixinha">Rejeitar</button>
      <button class="btn btn-ghost" id="modal-cancel">Cancelar</button>
    </div>`;
}
