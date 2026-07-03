// src/js/events_armazenamento.js — aba Cadastros → Armazenamento (só administrador)
import { app } from './state.js';
import * as db from './db.js';
import { render } from './app.js';
import { showToast } from './toast.js';

export function attachArmazenamentoHandlers() {
  const btn = document.getElementById('btn-atualizar-armazenamento');
  if (btn) btn.onclick = async () => {
    const original = btn.textContent;
    btn.disabled = true; btn.textContent = 'Atualizando...';
    try {
      app.armazenamentoStats = await db.obterEstatisticasArmazenamento();
      render();
    } catch (e) {
      showToast('Erro ao atualizar: ' + e.message);
      btn.disabled = false; btn.textContent = original;
    }
  };
}
