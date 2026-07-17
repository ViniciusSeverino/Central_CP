// src/js/events_caixinha.js — aba "Caixinha" (fundo fixo): wiring
import { app, ehSuperUsuario } from './state.js';
import * as db from './db.js';
import { render, closeModalWithFlash, bind } from './app.js';
import { showToast } from './toast.js';

async function recarregarCaixinha() {
  app.cadastros = await db.carregarCadastros();
  app.caixinhaMovimentacoes = await db.carregarCaixinhaMovimentacoes();
}

// Mesma lógica de statusInicialParaValor() (events_notas.js), sem alçada
// por valor -- aqui é só "quem registra já tem autoridade de aprovação?".
function statusInicialMovimentacaoCaixinha() {
  return ehSuperUsuario() ? 'aprovado' : 'pendente_aprovacao';
}

/* ---- lista/cards da Caixinha: sempre amarrado, com ou sem modal aberto ---- */
export function attachCaixinhaListHandlers() {
  document.querySelectorAll('[data-registrar-caixinha]').forEach(b => {
    b.onclick = () => {
      app.state.modal = 'caixinha_movimentacao';
      app.state.modalData = { caixinhaId: b.dataset.registrarCaixinha, tipo: b.dataset.tipo };
      render();
    };
  });

  const bnova = document.getElementById('btn-nova-caixinha');
  if (bnova) bnova.onclick = () => { app.state.modal = 'caixinha_nova'; app.state.modalData = null; render(); };

  document.querySelectorAll('[data-editar-caixinha]').forEach(b => {
    b.onclick = () => { app.state.modal = 'caixinha_editar'; app.state.modalData = b.dataset.editarCaixinha; render(); };
  });

  document.querySelectorAll('[data-aprovar-caixinha]').forEach(b => {
    b.onclick = async () => {
      if (!confirm('Aprovar esta movimentação? Ela passa a valer no saldo da caixinha.')) return;
      const original = b.textContent;
      b.disabled = true; b.textContent = 'Aprovando...';
      try {
        await db.aprovarMovimentacaoCaixinha(b.dataset.aprovarCaixinha, app.usuario);
        await recarregarCaixinha();
        app.state.flash = 'Movimentação aprovada.';
        render();
      } catch (e) {
        showToast('Erro ao aprovar: ' + e.message);
        b.disabled = false; b.textContent = original;
      }
    };
  });

  document.querySelectorAll('[data-rejeitar-caixinha]').forEach(b => {
    b.onclick = () => { app.state.modal = 'caixinha_rejeitar'; app.state.modalData = b.dataset.rejeitarCaixinha; render(); };
  });

  document.querySelectorAll('[data-excluir-caixinha]').forEach(b => {
    b.onclick = async () => {
      if (!confirm('Excluir esta movimentação definitivamente? Essa ação não pode ser desfeita.')) return;
      const original = b.textContent;
      b.disabled = true; b.textContent = 'Excluindo...';
      try {
        await db.excluirMovimentacaoCaixinha(b.dataset.excluirCaixinha);
        await recarregarCaixinha();
        app.state.flash = 'Movimentação excluída.';
        render();
      } catch (e) {
        showToast('Erro ao excluir: ' + e.message);
        b.disabled = false; b.textContent = original;
      }
    };
  });

  document.querySelectorAll('[data-baixar-comprovante-caixinha]').forEach(a => {
    a.onclick = async (e) => {
      e.preventDefault();
      const m = app.caixinhaMovimentacoes.find(x => x.id === a.dataset.baixarComprovanteCaixinha);
      if (!m || !m.comprovante) return;
      try {
        const url = await db.urlAssinadaComprovanteCaixinha(m.comprovante);
        window.open(url, '_blank');
      } catch (err) {
        showToast('Erro ao abrir comprovante: ' + err.message);
      }
    };
  });
}

/* ---- modais da Caixinha: só amarrado quando app.state.modal está setado ---- */
export function attachCaixinhaModalHandlers() {
  bind('confirmar-registrar-caixinha', async () => {
    const btn = document.getElementById('confirmar-registrar-caixinha');
    const valor = parseFloat(document.getElementById('cx-valor').value);
    const data = document.getElementById('cx-data').value;
    const motivo = document.getElementById('cx-motivo').value.trim();
    const arquivo = document.getElementById('cx-comprovante').files[0];
    if (!valor || valor <= 0 || !data || !motivo) { showToast('Preencha valor, data e motivo.'); return; }
    const { caixinhaId, tipo } = app.state.modalData;
    const original = btn.textContent;
    btn.disabled = true; btn.textContent = 'Salvando...';
    try {
      const status = statusInicialMovimentacaoCaixinha();
      const mov = await db.registrarMovimentacaoCaixinha({ caixinha_id: caixinhaId, tipo, valor, data, motivo, status }, app.usuario);
      if (arquivo) await db.uploadComprovanteCaixinha(mov.id, arquivo);
      await recarregarCaixinha();
      closeModalWithFlash(status === 'aprovado' ? 'Movimentação registrada e já aprovada (autoridade de aprovação).' : 'Movimentação registrada. Aguardando aprovação do gerente financeiro.');
    } catch (e) {
      showToast('Erro ao registrar: ' + e.message);
      btn.disabled = false; btn.textContent = original;
    }
  });

  bind('confirmar-caixinha-cadastro', async () => {
    const btn = document.getElementById('confirmar-caixinha-cadastro');
    const nome = document.getElementById('cx-nome').value.trim();
    const valor_teto = parseFloat(document.getElementById('cx-teto').value);
    const setor = document.getElementById('cx-setor').value;
    if (!nome || !valor_teto || valor_teto <= 0) { showToast('Preencha nome e um valor-teto maior que zero.'); return; }
    const original = btn.textContent;
    btn.disabled = true; btn.textContent = 'Salvando...';
    try {
      if (app.state.modalData) await db.atualizarCaixinha(app.state.modalData, { nome, valor_teto, setor });
      else await db.adicionarCaixinha({ nome, valor_teto, setor });
      await recarregarCaixinha();
      closeModalWithFlash(app.state.modalData ? 'Caixinha atualizada.' : 'Caixinha cadastrada.');
    } catch (e) {
      showToast('Erro ao salvar: ' + e.message);
      btn.disabled = false; btn.textContent = original;
    }
  });

  bind('confirmar-rejeitar-caixinha', async () => {
    const btn = document.getElementById('confirmar-rejeitar-caixinha');
    const motivo = document.getElementById('cx-motivo-rejeicao').value.trim();
    if (!motivo) return;
    const original = btn.textContent;
    btn.disabled = true; btn.textContent = 'Rejeitando...';
    try {
      await db.rejeitarMovimentacaoCaixinha(app.state.modalData, app.usuario, motivo);
      await recarregarCaixinha();
      closeModalWithFlash('Movimentação rejeitada.');
    } catch (e) {
      showToast('Erro: ' + e.message);
      btn.disabled = false; btn.textContent = original;
    }
  });
}
