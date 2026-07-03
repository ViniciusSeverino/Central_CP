// src/js/ui_mobile.js
//
// Shell mobile (header + tabs horizontais + botão flutuante), no lugar da
// sidebar fixa do desktop (ver ui.js renderShell()). O CONTEÚDO é
// reaproveitado de ui.js/ui_nota.js sem nenhuma cópia (renderMain,
// renderModalPagina, renderModal) — só o entorno muda, porque o
// card-list/modal/formulário de nota já são fluidos o bastante pra caber
// numa tela estreita (ver mobile.css).
//
// Os elementos reaproveitam os MESMOS ids/atributos do desktop
// (data-view, #btn-logout, #btn-nova-nota) de propósito: attachShellHandlers()
// e attachNotaListHandlers() (events_shell.js/events_notas.js) já sabem
// amarrar isso, sem precisar de um events_mobile.js à parte.
//
// v1: só as telas do ciclo de vida da nota. Cadastros/Todas as notas (telas
// de administração/relatório, mais tabela que precisa de tela larga)
// continuam só na versão desktop por enquanto — ver seção 11 de
// docs/fluxo-processo.md.
import { app, escapeHtml, ehSuperUsuario } from './state.js';
import { navItemsFor, renderMain } from './ui.js';
import { renderModal, renderModalPagina, FULL_PAGE_MODALS } from './ui_modal.js';

const TABS_FORA_DO_MOBILE_V1 = new Set(['cadastros', 'todas']);

function tabsMobile(usuario) {
  return navItemsFor(usuario).filter(it => !TABS_FORA_DO_MOBILE_V1.has(it.key));
}

export function renderShellMobile() {
  const usuario = app.usuario;
  const tabs = tabsMobile(usuario);
  // Se a view atual não é uma tab mobile (sobrou de uma sessão desktop
  // anterior, ex: "Todas as notas"), cai pra primeira tab disponível em
  // vez de tentar renderizar uma tela que não existe aqui.
  if (!tabs.some(t => t.key === app.state.view)) app.state.view = tabs[0] ? tabs[0].key : app.state.view;

  const modalEhPagina = app.state.modal && FULL_PAGE_MODALS.has(app.state.modal);
  const podeCriar = usuario.role === 'departamento' || ehSuperUsuario();

  return `
  <div class="m-app">
    <header class="m-header">
      <div class="m-logo"><span class="mark">CP</span><span>Central CP</span></div>
      <div class="m-user">
        ${escapeHtml(usuario.nome)}<br>
        <button id="btn-logout">Sair</button>
      </div>
    </header>
    ${!modalEhPagina ? `
    <div class="m-tabs">
      ${tabs.map(it => `
        <button data-view="${it.key}" class="${app.state.view === it.key ? 'active' : ''}">
          <span>${it.label}</span>${it.count !== null ? `<span class="count">${it.count}</span>` : ''}
        </button>`).join('')}
    </div>` : ''}
    <main class="m-main">
      ${app.state.flash ? `<div class="flash">${escapeHtml(app.state.flash)}</div>` : ''}
      ${modalEhPagina ? renderModalPagina() : renderMain()}
    </main>
    ${(!modalEhPagina && podeCriar) ? `<button type="button" class="m-fab" id="btn-nova-nota" aria-label="Nova nota">+</button>` : ''}
  </div>
  ${(app.state.modal && !modalEhPagina) ? renderModal() : ''}
  `;
}
