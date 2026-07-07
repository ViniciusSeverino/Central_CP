// src/js/app.js
//
// Entrypoint: monta o DOM raiz, orquestra o ciclo render()/carregarTudo() e
// expõe os helpers compartilhados (render, closeModal*, carregarTudo) que os
// módulos de evento (events_auth/events_shell/events_cadastros/events_notas)
// chamam de volta. O detalhamento de cada tela vive nesses módulos, não aqui.
import { sessaoAtual, aoRecuperarSenha } from './auth.js';
import * as db from './db.js';
import { app } from './state.js';
import { renderAuth, renderShell, renderDefinirSenha } from './ui.js';
import { renderShellMobile } from './ui_mobile.js';
import { ehMobile } from './device.js';
import { attachAuthHandlers, attachDefinirSenhaHandlers, defaultViewForRole } from './events_auth.js';
import { attachShellHandlers } from './events_shell.js';
import { attachCadastroHandlers } from './events_cadastros.js';
import { attachNotaListHandlers, attachNotaModalHandlers } from './events_notas.js';
import { attachLoteNotaListHandlers, attachLoteNotaModalHandlers } from './events_lote_notas.js';
import { pushSuportado, assinaturaPushAtual } from './push.js';

const appEl = document.getElementById('app');

export function render() {
  if (app.state.recuperandoSenha) {
    appEl.innerHTML = renderDefinirSenha();
    attachDefinirSenhaHandlers();
    return;
  }
  appEl.innerHTML = app.usuario ? (ehMobile() ? renderShellMobile() : renderShell()) : renderAuth();
  if (app.usuario) {
    attachShellHandlers();
    attachCadastroHandlers();
    attachNotaListHandlers();
    attachLoteNotaListHandlers();
    if (app.state.modal) attachNotaModalHandlers();
    if (app.state.modal === 'lote_nota' || app.state.modal === 'lote_linha_detalhes') attachLoteNotaModalHandlers();
  } else {
    attachAuthHandlers();
  }
}
window.__render = render; // útil para debug no console

export async function carregarTudo() {
  app.cadastros = await db.carregarCadastros();
  app.notas = await db.carregarNotas();
  app.usuarios = await db.carregarUsuarios();
  app.papeisEfetivos = await db.carregarPapeisEfetivos();
  app.delegacoes = await db.carregarDelegacoes();
  app.extracaoHints = await db.carregarExtracaoHints();
  app.state.pushSuportado = pushSuportado();
  app.state.pushInscrito = app.state.pushSuportado ? !!(await assinaturaPushAtual()) : false;
}

export function closeModal() { app.state.modal = null; app.state.modalData = null; render(); }

export function closeModalMaybeConfirm(protect) {
  if (protect) {
    if (confirm('Tem certeza que deseja cancelar? Os dados preenchidos neste formulário serão perdidos (a menos que você salve como rascunho).')) closeModal();
  } else closeModal();
}

export function closeModalWithFlash(msg) { app.state.modal = null; app.state.modalData = null; app.state.flash = msg; render(); }

export function restoreFocus(id) {
  const el = document.getElementById(id);
  if (el) { el.focus(); el.selectionStart = el.selectionEnd = el.value.length; }
}

export function bind(id, fn) { const el = document.getElementById(id); if (el) el.onclick = fn; }

// PWA: só habilita "instalar como app"/tela cheia — não é estratégia de
// app offline (ver sw.js pro porquê do cache ser só do shell estático,
// nunca de dado do Supabase). 'serviceWorker' in navigator é false em
// ambiente de teste (jsdom), então isso vira um no-op seguro lá.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => {}); });
}

/* ============================ INIT ============================ */
aoRecuperarSenha(() => { app.state.recuperandoSenha = true; render(); });

(async function init() {
  appEl.innerHTML = `<div class="auth-wrap"><p style="color:var(--ink-soft)">Carregando Central CP…</p></div>`;
  const usuario = await sessaoAtual();
  if (usuario) {
    app.usuario = usuario;
    try {
      await carregarTudo();
      app.state.view = defaultViewForRole(usuario.role);
    } catch (e) {
      app.state.flash = 'Erro ao carregar dados: ' + e.message;
    }
  }
  render();
})();
