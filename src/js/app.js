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
import { attachRecebimentoModalHandlers } from './events_recebimento.js';
import { attachLoteNotaListHandlers, attachLoteNotaModalHandlers } from './events_lote_notas.js';
import { attachConfiguracoesHandlers } from './events_configuracoes.js';
import { attachDashboardHandlers } from './events_dashboard.js';
import { attachCaixinhaListHandlers, attachCaixinhaModalHandlers } from './events_caixinha.js';
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
    attachConfiguracoesHandlers();
    attachDashboardHandlers();
    attachNotaListHandlers();
    attachLoteNotaListHandlers();
    attachCaixinhaListHandlers();
    if (app.state.modal) { attachNotaModalHandlers(); attachCaixinhaModalHandlers(); }
    if (app.state.modal === 'lote_nota' || app.state.modal === 'lote_linha_detalhes') attachLoteNotaModalHandlers();
    if (app.state.modal === 'novo_recebimento' || app.state.modal === 'corrigir_recebimento' || app.state.modal === 'continuar_recebimento') attachRecebimentoModalHandlers();
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
  app.caixinhaMovimentacoes = await db.carregarCaixinhaMovimentacoes();
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
  window.addEventListener('load', async () => {
    const registration = await navigator.serviceWorker.register('./sw.js').catch(() => null);
    if (!registration) return;

    // O navegador só checa se sw.js mudou em navegações novas (e no máximo
    // 1x/24h por padrão) -- quem deixa uma aba/PWA aberta por dias fica
    // rodando o app.js/ui.js antigos indefinidamente, mesmo já tendo saído
    // uma versão nova, e só nota algo "quebrado" (uma correção já publicada
    // que ainda não chegou nessa aba) até fechar e abrir de novo. Força uma
    // checagem toda vez que a aba volta a ficar visível, sem esperar o navegador
    // decidir sozinho quando checar.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') registration.update().catch(() => {});
    });

    // Quando uma versão nova assume o controle (service worker novo já
    // instalado e ativo, ver skipWaiting()/clients.claim() em sw.js),
    // recarrega a página sozinha uma vez -- assim quem já estava com o app
    // aberto entra na versão nova sem precisar adivinhar que precisa
    // atualizar manualmente. Se tiver um formulário com dado não salvo
    // aberto no exato momento (mesmo data-protect="1" do aviso de "sair
    // sem salvar", ver events_shell.js), não interrompe -- só recarrega na
    // próxima vez que a aba ficar visível sem um formulário desses aberto.
    let atualizacaoPendente = false;
    const recarregarSeSeguro = () => {
      const protegido = document.getElementById('modal-bg')?.dataset.protect === '1' || document.querySelector('.page-form')?.dataset.protect === '1';
      if (protegido) { atualizacaoPendente = true; return; }
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', recarregarSeSeguro);
    document.addEventListener('visibilitychange', () => {
      if (atualizacaoPendente && document.visibilityState === 'visible') recarregarSeSeguro();
    });
  });
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
