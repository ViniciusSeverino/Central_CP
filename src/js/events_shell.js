// src/js/events_shell.js — chrome do shell: navegação, atualizar dados, sair
import { app } from './state.js';
import { sair } from './auth.js';
import { render, carregarTudo } from './app.js';
import { showToast } from './toast.js';
import * as db from './db.js';
import { inscreverPush, cancelarPush } from './push.js';

export function attachShellHandlers() {
  document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => {
    // Navegar pela sidebar/gaveta enquanto um formulário de página inteira
    // está aberto (ex: Nova nota) só trocava app.state.view por baixo dos
    // panos -- o modal continuava cobrindo a tela (modalEhPagina não olha
    // pra view), então o clique parecia "não funcionar". Fecha o modal
    // primeiro (com a mesma confirmação de sempre se tiver dado digitado
    // não salvo) e só então navega.
    if (app.state.modal) {
      const protect = document.getElementById('modal-bg')?.dataset.protect === '1' || document.querySelector('.page-form')?.dataset.protect === '1';
      if (protect && !confirm('Tem certeza que deseja sair? Os dados preenchidos neste formulário serão perdidos (a menos que você salve como rascunho).')) return;
      app.state.modal = null; app.state.modalData = null;
    }
    app.state.view = b.dataset.view; app.state.flash = null; app.state.menuMobileAberto = false; render();
  });

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
    app.state = { view: 'minhas', modal: null, modalData: null, flash: null, filters: { status: '', busca: '' }, cadastroTab: 'fornecedores', cadFornecedorBusca: '', menuMobileAberto: false };
    render();
  };

  // Gaveta lateral do menu mobile (ver ui_mobile.js) — o botão hambúrguer
  // só existe na UI mobile, então isso é um no-op seguro no desktop.
  const bm = document.getElementById('btn-menu-mobile');
  if (bm) bm.onclick = () => { app.state.menuMobileAberto = !app.state.menuMobileAberto; render(); };

  const bd = document.getElementById('m-drawer-backdrop');
  if (bd) bd.onclick = () => { app.state.menuMobileAberto = false; render(); };

  const bp = document.getElementById('btn-push-toggle');
  if (bp) bp.onclick = async () => {
    bp.disabled = true;
    try {
      if (app.state.pushInscrito) {
        const sub = await cancelarPush();
        if (sub) await db.removerPushSubscricao(sub.endpoint);
        app.state.pushInscrito = false;
        showToast('Notificações desativadas.');
      } else {
        const sub = await inscreverPush();
        await db.salvarPushSubscricao(sub, app.usuario.id);
        app.state.pushInscrito = true;
        showToast('Notificações ativadas.');
      }
    } catch (e) {
      showToast('Erro: ' + e.message);
    }
    render();
  };
}
