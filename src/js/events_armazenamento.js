// src/js/events_armazenamento.js — aba Cadastros → Armazenamento (só administrador)
import { app } from './state.js';
import * as db from './db.js';
import { render } from './app.js';
import { showToast } from './toast.js';
import { renomearAnexosPadraoAntigo } from './renomear_anexos.js';

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

  const br = document.getElementById('btn-renomear-anexos');
  if (br) br.onclick = async () => {
    if (!confirm('Renomear os arquivos para o padrão novo (pagador antes de BSB)? Cada arquivo é copiado para o nome novo antes de o antigo ser apagado.')) return;
    app.state.renomearAnexos = { rodando: true, feitos: 0 };
    render();
    const relatorio = await renomearAnexosPadraoAntigo(app.notas, (feitos) => {
      app.state.renomearAnexos.feitos = feitos;
      const b = document.getElementById('btn-renomear-anexos');
      if (b) b.textContent = `Renomeando... ${feitos}`;
    });
    app.state.renomearAnexos = { rodando: false, relatorio };
    showToast(`${relatorio.renomeados} arquivo(s) renomeado(s).`);
    render();
  };
}
