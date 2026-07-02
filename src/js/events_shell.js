// src/js/events_shell.js — chrome do shell: navegação, atualizar dados, sair
import { app } from './state.js';
import { sair } from './auth.js';
import { render, carregarTudo } from './app.js';
import { showToast } from './toast.js';

export function attachShellHandlers() {
  document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => { app.state.view = b.dataset.view; app.state.flash = null; render(); });

  const br = document.getElementById('btn-refresh');
  if (br) br.onclick = async () => {
    br.disabled = true; br.textContent = 'Atualizando...';
    try { await carregarTudo(); app.state.flash = 'Dados atualizados.'; }
    catch (e) { showToast('Erro ao atualizar: ' + e.message); }
    render();
  };

  const bo = document.getElementById('btn-logout');
  if (bo) bo.onclick = async () => {
    bo.disabled = true; bo.textContent = 'Saindo...';
    await sair();
    app.usuario = null;
    app.state = { view: 'minhas', modal: null, modalData: null, flash: null, filters: { status: '', busca: '' }, cadastroTab: 'fornecedores', cadFornecedorBusca: '' };
    render();
  };
}
