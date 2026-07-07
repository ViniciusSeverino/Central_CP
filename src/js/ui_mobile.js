// src/js/ui_mobile.js
//
// Shell mobile: header com hambúrguer + gaveta lateral retrátil (no lugar
// da sidebar fixa do desktop, ver ui.js renderShell() — mesma ideia, só
// que escondida por padrão pra não ocupar tela em celular). O CONTEÚDO é
// reaproveitado de ui.js/ui_nota.js/ui_cadastros.js sem nenhuma cópia
// (renderMain, renderModalPagina, renderModal) — só o entorno muda. Mesma
// paridade de telas do desktop, inclusive Cadastros e "Todas as notas"
// (tabelas largas viram scroll horizontal dentro de .tbl-wrap em vez de
// estourar a largura da tela — ver mobile.css e styles.css).
//
// Os elementos reaproveitam os MESMOS ids/atributos do desktop
// (data-view, #btn-logout, #btn-refresh, #btn-nova-nota) de propósito:
// attachShellHandlers() e attachNotaListHandlers()
// (events_shell.js/events_notas.js) já sabem amarrar isso, sem precisar de
// um events_mobile.js à parte — só o toggle da gaveta (#btn-menu-mobile,
// #m-drawer-backdrop) e o fechar-ao-navegar são tratados ali também.
//
// O hambúrguer fica visível mesmo com um formulário/detalhe de página
// inteira aberto — mesma ideia da sidebar do desktop, que nunca some
// (é assim que dá pra sair/atualizar dados no meio de um lançamento).
import { app, escapeHtml, ehSuperUsuario, ROLE_LABEL } from './state.js';
import { navItemsFor, renderMain } from './ui.js';
import { renderModal, renderModalPagina, FULL_PAGE_MODALS } from './ui_modal.js';
import { ICON_MARK_SVG_TRANSPARENT } from './brand.js';

export function renderShellMobile() {
  const usuario = app.usuario;
  const tabs = navItemsFor(usuario);
  // Se a view atual não é uma tab mobile (sobrou de uma sessão desktop
  // anterior, ex: "Todas as notas"), cai pra primeira tab disponível em
  // vez de tentar renderizar uma tela que não existe aqui.
  if (!tabs.some(t => t.key === app.state.view)) app.state.view = tabs[0] ? tabs[0].key : app.state.view;

  const modalEhPagina = app.state.modal && FULL_PAGE_MODALS.has(app.state.modal);
  const podeCriar = usuario.role === 'departamento' || ehSuperUsuario();
  const aberta = !!app.state.menuMobileAberto;

  return `
  <div class="m-app">
    <header class="m-header">
      <button type="button" class="m-menu-btn" id="btn-menu-mobile" aria-label="Abrir menu" aria-expanded="${aberta}">
        <span class="m-menu-icon"><span></span><span></span><span></span></span>
      </button>
      <div class="m-logo"><span class="mark">${ICON_MARK_SVG_TRANSPARENT}</span><span>Central <span class="brand-cp">CP</span></span></div>
      <span class="m-header-spacer"></span>
    </header>

    <div class="m-drawer-backdrop ${aberta ? 'show' : ''}" id="m-drawer-backdrop"></div>
    <nav class="m-drawer ${aberta ? 'open' : ''}" aria-hidden="${!aberta}">
      <div class="m-drawer-user">
        <div class="name">${escapeHtml(usuario.nome)}</div>
        <span class="role-pill">${ROLE_LABEL[usuario.role]}${usuario.setor ? ' · ' + escapeHtml(usuario.setor) : ''}</span>
      </div>
      <div class="m-drawer-nav">
        ${tabs.map(it => `
          <button data-view="${it.key}" class="${app.state.view === it.key ? 'active' : ''}">
            <span>${it.label}</span>${it.count !== null ? `<span class="count">${it.count}</span>` : ''}
          </button>`).join('')}
      </div>
      <div class="m-drawer-bottom">
        <button id="btn-logout">Sair</button>
      </div>
    </nav>

    <main class="m-main">
      ${app.state.flash ? `<div class="flash">${escapeHtml(app.state.flash)}</div>` : ''}
      ${modalEhPagina ? renderModalPagina() : renderMain()}
    </main>
    ${(!modalEhPagina && podeCriar) ? `<button type="button" class="m-fab" id="btn-nova-nota" aria-label="Nova nota">+</button>` : ''}
  </div>
  ${(app.state.modal && !modalEhPagina) ? renderModal() : ''}
  `;
}
