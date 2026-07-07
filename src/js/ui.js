// src/js/ui.js
import {
  app, SETORES, LIMITE_APROVACAO_GESTOR, ROLE_LABEL, STATUS_LABEL, STATUS_COLOR, STATUS_SOFT, STEPS,
  REGISTRY_DEFS, escapeHtml, fmtMoney, fmtDate, fmtDateTime, fmtCompetencia, labelOf, selectOptions,
  centrosParaPagador, classesParaCentro, codigosParaClasse, resolverLabelsNota, resolverLabelsRateio, nomeUsuario,
  ehSuperUsuario, podeAgirComo, podeOperarCadastro,
} from './state.js';
import { renderModal, renderModalPagina, FULL_PAGE_MODALS } from './ui_modal.js';
import { renderCadastros } from './ui_cadastros.js';
import { renderDashboard } from './ui_dashboard.js';
import { ICON_MARK_SVG, ICON_MARK_SVG_TRANSPARENT } from './brand.js';
import { statusPrazo } from './prazo_despesa.js';

// Badge de prazo do chamado (D+X a partir de data_chamado, ver
// prazo_despesa.js) -- só aparece enquanto o CSC ainda não pagou/cancelou,
// e só depois que o chamado foi de fato aberto (antes disso não há prazo).
function prazoBadgeCard(n) {
  if (!n.data_chamado || n.status === 'pago' || n.status === 'cancelada') return '';
  const st = statusPrazo(n.tipo_despesa_prazo, n.data_chamado);
  if (!st) return '';
  return st.atrasado
    ? `<div class="pend-badge" style="background:var(--alert-soft); color:var(--alert);">⚠ Atrasado ${Math.abs(st.diasRestantes)}d</div>`
    : `<div class="pend-badge" style="background:var(--gray-soft); color:var(--ink-soft);">Prazo: ${st.diasRestantes}d</div>`;
}

/* ================= AUTH SCREEN ================= */
// Cadastro fechado: não existe mais aba "Cadastrar" — só um administrador
// cria conta (Cadastros → Usuários). O que sobra aqui é login e
// recuperação de senha (usada também pelo convidado, na primeira vez).
export let authTab = 'login';
export let authError = '';
export let authInfo = '';
export function setAuthTab(t) { authTab = t; }
export function setAuthError(e) { authError = e; authInfo = ''; }
export function setAuthInfo(i) { authInfo = i; authError = ''; }

export function renderAuth() {
  return `
  <div class="auth-wrap">
    <div class="auth-card">
      <div class="auth-logo"><span class="mark">${ICON_MARK_SVG}</span><h1>Central <span class="brand-cp">CP</span></h1></div>
      <p class="auth-sub">Controle de contas a pagar entre setores</p>
      ${authError ? `<div class="err-msg">${escapeHtml(authError)}</div>` : ''}
      ${authInfo ? `<div class="flash">${escapeHtml(authInfo)}</div>` : ''}
      ${authTab === 'login' ? `
        <div id="box-login">
          <div class="field"><label>E-mail</label><input id="login-email" type="email" required></div>
          <div class="field"><label>Senha</label><input type="password" id="login-password" required></div>
          <button class="btn btn-brand btn-block" type="button" id="btn-do-login">Entrar</button>
          <p style="text-align:center; margin-top:14px;"><a href="#" data-tab="recuperar" style="font-size:13px;">Esqueci minha senha / primeiro acesso</a></p>
        </div>
      ` : `
        <div id="box-recuperar">
          <p class="field-hint" style="margin-bottom:14px;">Informe o e-mail cadastrado — vamos mandar um link pra você definir a senha.</p>
          <div class="field"><label>E-mail</label><input id="recuperar-email" type="email" required></div>
          <button class="btn btn-brand btn-block" type="button" id="btn-do-recuperar">Enviar link</button>
          <p style="text-align:center; margin-top:14px;"><a href="#" data-tab="login" style="font-size:13px;">Voltar para o login</a></p>
        </div>
      `}
    </div>
  </div>`;
}

// Tela que abre quando o usuário clica no link do e-mail de definir/
// redefinir senha (evento PASSWORD_RECOVERY do Supabase Auth).
export function renderDefinirSenha() {
  return `
  <div class="auth-wrap">
    <div class="auth-card">
      <div class="auth-logo"><span class="mark">${ICON_MARK_SVG}</span><h1>Central <span class="brand-cp">CP</span></h1></div>
      <p class="auth-sub">Defina sua senha de acesso</p>
      ${authError ? `<div class="err-msg">${escapeHtml(authError)}</div>` : ''}
      <div class="field"><label>Nova senha (mínimo 6 caracteres)</label><input type="password" id="nova-senha" required></div>
      <div class="field"><label>Confirme a nova senha</label><input type="password" id="nova-senha-confirma" required></div>
      <button class="btn btn-brand btn-block" type="button" id="btn-definir-senha">Salvar senha e entrar</button>
    </div>
  </div>`;
}

/* ================= SHELL / NAV ================= */
// As 4 etapas do contas a pagar — cada uma vira uma aba própria (item #6 do
// pedido do usuário), com as notas agrupadas por pagador + vencimento porque
// é assim que os chamados são abertos no Acelerato (um chamado por
// pagador+data de vencimento, podendo juntar várias notas).
export const CP_STAGE_META = {
  lancar_group: {
    statusFiltro: 'aprovado', titulo: 'Lançar no Group',
    sub: 'Notas aprovadas, prontas para o lançamento no Group.',
    modal: 'lote_lancar_group', acaoLabel: 'Lançar no Group',
  },
  abrir_chamado: {
    statusFiltro: 'lancado_no_group', titulo: 'Abrir chamado',
    sub: 'Já lançadas no Group — falta abrir o chamado no Acelerato.',
    modal: 'lote_abrir_chamado', acaoLabel: 'Abrir chamado',
  },
  validar_csc: {
    statusFiltro: 'chamado_aberto', titulo: 'Validar CSC',
    sub: 'Chamados abertos no Acelerato, aguardando validação do CSC.',
    modal: 'lote_validar_csc', acaoLabel: 'Validar CSC',
  },
  confirmar_pagamento: {
    statusFiltro: 'validado_csc', titulo: 'Confirmar pagamento',
    sub: 'Validadas pelo CSC, aguardando a confirmação do pagamento.',
    modal: 'lote_confirmar_pagamento', acaoLabel: 'Confirmar pagamento',
  },
};

export function navItemsFor(usuario) {
  let base;
  // administrador/gerente_financeiro (ou quem estiver cobrindo um deles por
  // delegação) têm acesso total: aprovam E também executam as 4 etapas do
  // contas a pagar, vendo tudo (sem recorte de setor).
  if (ehSuperUsuario()) base = [
    { key: 'dashboard', label: 'Visão geral', count: null },
    // "Rascunhos" próprio — só assim dá pra achar de volta um rascunho
    // salvo, já que ele não aparece em nenhuma outra fila (nem em "Todas
    // as notas", que já era assim antes de administrador/gerente_financeiro
    // poderem lançar nota).
    { key: 'rascunhos', label: 'Meus rascunhos', count: app.notas.filter(n => podeAgirComo(n.criado_por) && n.status === 'rascunho').length },
    { key: 'aprovacao', label: 'Aguardando aprovação', count: app.notas.filter(n => n.status === 'lancado' && !n.pendente).length },
    { key: 'lancar_group', label: 'Lançar no Group', count: app.notas.filter(n => n.status === 'aprovado' && !n.pendente).length },
    { key: 'abrir_chamado', label: 'Abrir chamado', count: app.notas.filter(n => n.status === 'lancado_no_group' && !n.pendente).length },
    { key: 'validar_csc', label: 'Validar CSC', count: app.notas.filter(n => n.status === 'chamado_aberto' && !n.pendente).length },
    { key: 'confirmar_pagamento', label: 'Confirmar pagamento', count: app.notas.filter(n => n.status === 'validado_csc' && !n.pendente).length },
    { key: 'pendencias', label: 'Pendências', count: app.notas.filter(n => n.pendente).length },
    { key: 'todas', label: 'Todas as notas', count: null },
  ];
  else if (usuario.role === 'departamento') base = [
    { key: 'minhas', label: 'Minhas notas', count: app.notas.filter(n => podeAgirComo(n.criado_por) && n.status !== 'rascunho').length },
    { key: 'rascunhos', label: 'Rascunhos', count: app.notas.filter(n => podeAgirComo(n.criado_por) && n.status === 'rascunho').length },
    { key: 'pendencias', label: 'Pendências', count: app.notas.filter(n => podeAgirComo(n.criado_por) && n.pendente).length },
    { key: 'todas', label: 'Todas as notas', count: null },
  ];
  else base = [
    { key: 'dashboard', label: 'Visão geral', count: null },
    { key: 'lancar_group', label: 'Lançar no Group', count: app.notas.filter(n => n.status === 'aprovado' && !n.pendente).length },
    { key: 'abrir_chamado', label: 'Abrir chamado', count: app.notas.filter(n => n.status === 'lancado_no_group' && !n.pendente).length },
    { key: 'validar_csc', label: 'Validar CSC', count: app.notas.filter(n => n.status === 'chamado_aberto' && !n.pendente).length },
    { key: 'confirmar_pagamento', label: 'Confirmar pagamento', count: app.notas.filter(n => n.status === 'validado_csc' && !n.pendente).length },
    { key: 'pendencias', label: 'Pendências', count: app.notas.filter(n => n.pendente).length },
    { key: 'todas', label: 'Todas as notas', count: null },
  ];
  base.push({ key: 'cadastros', label: 'Cadastros', count: null });
  return base;
}

export function renderShell() {
  const usuario = app.usuario;
  const nav = navItemsFor(usuario);
  // Formulário de nota e detalhe (ver FULL_PAGE_MODALS) ocupam a área
  // principal inteira, como qualquer outra tela — só as ações rápidas
  // (aprovar, marcar pendência, ações em lote, cadastros) continuam como
  // uma janela pequena por cima do que já estava na tela.
  const modalEhPagina = app.state.modal && FULL_PAGE_MODALS.has(app.state.modal);
  return `
  <div class="shell">
    <div class="sidebar">
      <div class="sb-logo"><span class="mark">${ICON_MARK_SVG_TRANSPARENT}</span><span>Central <span class="brand-cp">CP</span></span></div>
      <div class="sb-user">
        <div class="name">${escapeHtml(usuario.nome)}</div>
        <span class="role-pill">${ROLE_LABEL[usuario.role]}${usuario.setor ? ' · ' + escapeHtml(usuario.setor) : ''}</span>
      </div>
      <div class="sb-nav">
        ${nav.map(it => `
          <button data-view="${it.key}" class="${app.state.view === it.key ? 'active' : ''}">
            <span>${it.label}</span>${it.count !== null ? `<span class="count">${it.count}</span>` : ''}
          </button>`).join('')}
      </div>
      <div class="sb-bottom">
        ${(usuario.role === 'departamento' || ehSuperUsuario()) ? `<button class="btn btn-amber btn-block" id="btn-nova-nota" style="border:none;">+ Nova nota</button>` : ''}
        ${(usuario.role === 'departamento' || ehSuperUsuario()) ? `<button class="btn btn-ghost btn-block" id="btn-lote-nota" style="margin-top:6px;">Lançar em lote</button>` : ''}
        ${app.state.pushSuportado ? `<button class="btn btn-ghost btn-block" id="btn-push-toggle" style="margin-top:6px;">${app.state.pushInscrito ? 'Notificações ativadas' : 'Ativar notificações'}</button>` : ''}
        <button id="btn-refresh">Atualizar dados</button>
        <button id="btn-logout">Sair</button>
      </div>
    </div>
    <div class="main">
      ${app.state.flash ? `<div class="flash">${escapeHtml(app.state.flash)}</div>` : ''}
      ${modalEhPagina ? renderModalPagina() : renderMain()}
    </div>
  </div>
  ${(app.state.modal && !modalEhPagina) ? renderModal() : ''}
  `;
}

export function renderMain() {
  if (app.state.view === 'dashboard' && podeOperarCadastro()) return renderDashboard();
  if (app.state.view === 'cadastros') return renderCadastros();
  if (app.state.view === 'todas') return renderTodas();
  if ((app.usuario.role === 'contas_a_pagar' || ehSuperUsuario()) && CP_STAGE_META[app.state.view]) return renderQueueGrouped(app.state.view);
  if (VIEW_META[app.state.view]) return renderQueue(app.state.view);
  return renderQueue(app.usuario.role === 'departamento' ? 'minhas' : 'pendencias');
}

const VIEW_META = {
  minhas:     { title: 'Minhas notas', sub: 'Notas que você lançou no Central CP' },
  rascunhos:  { title: 'Rascunhos', sub: 'Notas salvas como rascunho, ainda não enviadas para aprovação' },
  aprovacao:  { title: 'Aguardando aprovação', sub: 'Notas de todos os setores, esperando aprovação' },
  pendencias: { title: 'Pendências', sub: 'Notas com alguma divergência aberta, aguardando ajuste do departamento responsável' },
};

// Escopo "base" de cada perfil para os cards de contagem (statRow) — antes o
// funil somava TODAS as notas do sistema em qualquer tela, então "Minhas
// notas" do departamento mostrava números de todo mundo. Agora cada perfil
// só conta o que enxerga: departamento conta as próprias notas; contas a
// pagar e super_usuario (administrador/gerente_financeiro, ou quem estiver
// cobrindo um deles por delegação) veem tudo.
function statsScope() {
  const u = app.usuario;
  if (!ehSuperUsuario() && u.role === 'departamento') return app.notas.filter(n => podeAgirComo(n.criado_por) && n.status !== 'rascunho');
  return app.notas.filter(n => n.status !== 'rascunho');
}

function queueData(key) {
  const u = app.usuario;
  if (key === 'minhas') return app.notas.filter(n => podeAgirComo(n.criado_por) && n.status !== 'rascunho');
  if (key === 'rascunhos') return app.notas.filter(n => podeAgirComo(n.criado_por) && n.status === 'rascunho');
  if (key === 'aprovacao') return app.notas.filter(n => n.status === 'lancado' && !n.pendente);
  if (key === 'pendencias') return (!ehSuperUsuario() && u.role === 'departamento')
    ? app.notas.filter(n => podeAgirComo(n.criado_por) && n.pendente)
    : app.notas.filter(n => n.pendente);
  if (CP_STAGE_META[key]) return app.notas.filter(n => n.status === CP_STAGE_META[key].statusFiltro && !n.pendente);
  return app.notas.filter(n => n.status !== 'rascunho');
}

function renderQueue(key) {
  const meta = VIEW_META[key];
  const list = queueData(key).sort((a, b) => new Date(a.criado_em) - new Date(b.criado_em));
  return `
    <div class="topbar"><div><h2>${meta.title}</h2><p class="sub">${meta.sub}</p></div></div>
    ${statRow(statsScope())}
    ${list.length === 0 ? `<div class="empty-state">Nenhuma nota aqui no momento.</div>` : `<div class="card-list">${list.map(renderCard).join('')}</div>`}
  `;
}

// Agrupa por pagador + data de vencimento — é assim que o contas a pagar
// abre os chamados no Acelerato (um chamado por pagador+vencimento, podendo
// juntar várias notas de uma vez), então a UI reflete esse agrupamento e
// oferece uma ação em lote por grupo em vez de nota por nota.
function groupByPagadorVencimento(list) {
  const map = new Map();
  list.forEach(n => {
    const key = (n.pagador_id || '—') + '|' + (n.vencimento || '—');
    if (!map.has(key)) map.set(key, { key, pagador_id: n.pagador_id, vencimento: n.vencimento, notas: [] });
    map.get(key).notas.push(n);
  });
  return Array.from(map.values()).sort((a, b) => new Date(a.vencimento || 0) - new Date(b.vencimento || 0));
}

// A ação em lote parte com todas as notas do grupo marcadas, mas cada uma
// tem um checkbox — dá pra desmarcar as que não devem entrar nesse
// lançamento/chamado específico (ex: uma nota do grupo ainda não tem o
// boleto em mãos). O clique no botão lê os checkboxes marcados na hora,
// não a lista fixa do grupo inteiro.
function renderGrupoCard(g, stageKey) {
  const meta = CP_STAGE_META[stageKey];
  const pagador = app.cadastros.pagadores.find(p => p.id === g.pagador_id);
  const total = g.notas.reduce((s, n) => s + (Number(n.valor_bruto) || 0), 0);
  // g.key é montado só a partir de pagador_id (uuid) + vencimento (data
  // iso) — dado interno, não texto livre de usuário, por isso vai direto
  // no atributo sem passar por escapeHtml (que é pra texto de exibição).
  const keyAttr = g.key;
  return `
  <div class="grupo-card">
    <div class="grupo-header">
      <div>
        <div class="grupo-title">${escapeHtml(pagador ? labelOf(pagador) : '—')}</div>
        <div class="grupo-sub">Vencimento ${fmtDate(g.vencimento)} · ${g.notas.length} nota(s) · Total ${fmtMoney(total)}</div>
        <div class="grupo-select-links">
          <a href="#" data-grupo-select-all="${keyAttr}">Selecionar todas</a> · <a href="#" data-grupo-select-none="${keyAttr}">Nenhuma</a>
        </div>
      </div>
      <button class="btn btn-brand btn-sm" data-lote-action="${meta.modal}" data-lote-group="${keyAttr}">${meta.acaoLabel} (<span data-grupo-count="${keyAttr}">${g.notas.length}</span>)</button>
    </div>
    <div class="card-list">
      ${g.notas.map(n => `
      <div class="grupo-nota-row">
        <input type="checkbox" class="grupo-check" data-grupo-key="${keyAttr}" data-nota-id="${n.id}" checked>
        <div class="grupo-nota-card-wrap">${renderCard(n)}</div>
      </div>`).join('')}
    </div>
  </div>`;
}

function renderQueueGrouped(key) {
  const meta = CP_STAGE_META[key];
  const groups = groupByPagadorVencimento(queueData(key));
  return `
    <div class="topbar"><div><h2>${meta.titulo}</h2><p class="sub">${meta.sub}</p></div></div>
    ${statRow(statsScope())}
    ${groups.length === 0 ? `<div class="empty-state">Nenhuma nota aqui no momento.</div>` : groups.map(g => renderGrupoCard(g, key)).join('')}
  `;
}

function statRow(list) {
  const counts = {}; STEPS.forEach(s => { counts[s] = 0; });
  let pendente = 0;
  list.forEach(n => { if (counts[n.status] !== undefined) counts[n.status]++; if (n.pendente) pendente++; });
  return `<div class="stat-row">
    ${STEPS.map(s => `<div class="stat-chip"><div class="n" style="color:${STATUS_COLOR[s]}">${counts[s]}</div><div class="l">${STATUS_LABEL[s]}</div></div>`).join('')}
    <div class="stat-chip"><div class="n" style="color:var(--alert)">${pendente}</div><div class="l">Pendência</div></div>
  </div>`;
}

function renderCard(n) {
  const lbl = resolverLabelsNota(n);
  return `
  <div class="nota-card" data-open="${n.id}">
    <div class="nc-top">
      <div>
        <div class="nc-fornecedor">${escapeHtml(lbl.fornecedor_label)}</div>
        <div class="nc-num mono">NF ${escapeHtml(n.numero_nota || '—')}</div>
      </div>
      <div style="text-align:right;">
        <div class="nc-valor">${fmtMoney(n.valor_bruto)}</div>
        ${n.pendente ? `<div class="pend-badge">⚠ Pendência</div>` : ''}
        ${n.status === 'rascunho' ? `<div class="pend-badge" style="background:var(--gray-soft); color:var(--ink-soft);">Rascunho</div>` : ''}
        ${n.status === 'cancelada' ? `<div class="pend-badge" style="background:${STATUS_SOFT.cancelada}; color:${STATUS_COLOR.cancelada};">Cancelada</div>` : ''}
        ${prazoBadgeCard(n)}
      </div>
    </div>
    <div class="nc-meta">
      <span>${n.tem_rateio ? 'Rateado entre centros de custo' : 'Centro de custo: ' + escapeHtml(lbl.centro_custo_label || '—')}</span>
      <span>Vencimento: ${fmtDate(n.vencimento)}</span>
      <span>Pagador: ${escapeHtml(lbl.pagador_label)}</span>
      ${n.forma_pagamento ? `<span>Pagamento: ${escapeHtml(n.forma_pagamento)}</span>` : ''}
      <span>Solicitado por: ${escapeHtml(nomeUsuario(n.criado_por))}${n.setor ? ' · ' + escapeHtml(n.setor) : ''}</span>
    </div>
    ${(n.status === 'rascunho' || n.status === 'cancelada') ? '' : pipeline(n.status)}
  </div>`;
}

export function pipeline(status) {
  const idx = STEPS.indexOf(status);
  let html = '<div class="pipe">';
  STEPS.forEach((s, i) => {
    html += `<div class="pipe-seg ${i === idx ? 'current' : ''}">
      <span class="pipe-dot ${i <= idx ? 'filled' : ''}" style="${i <= idx ? `background:${STATUS_COLOR[s]};` : ''}"></span>
      <span class="pipe-label">${STATUS_LABEL[s]}</span>
    </div>`;
    if (i < STEPS.length - 1) html += `<span class="pipe-line ${i < idx ? 'done' : ''}"></span>`;
  });
  html += '</div>';
  return html;
}

// Compartilhada com o botão "Exportar Excel" (events_notas.js) — o arquivo
// exportado precisa ser exatamente a lista que está na tela, com os mesmos
// filtros aplicados. Período tem um padrão (ano corrente) de propósito —
// com anos de histórico acumulado, mostrar/exportar tudo de uma vez fica
// pesado; o usuário amplia o período se precisar de outro recorte.
export function notasFiltradasTodas() {
  let list = app.notas.filter(n => n.status !== 'rascunho');
  const f = app.state.filters;
  if (f.status) list = list.filter(n => n.status === f.status);
  if (f.pendente === 'sim') list = list.filter(n => n.pendente);
  if (f.pendente === 'nao') list = list.filter(n => !n.pendente);
  if (f.pagadorId) list = list.filter(n => n.pagador_id === f.pagadorId);
  if (f.setor) list = list.filter(n => n.setor === f.setor);
  if (f.centroCustoId) list = list.filter(n => n.centro_custo_id === f.centroCustoId || (n.rateios || []).some(r => r.centro_custo_id === f.centroCustoId));
  if (f.dataDe) list = list.filter(n => n[f.dataCampo] && n[f.dataCampo] >= f.dataDe);
  if (f.dataAte) list = list.filter(n => n[f.dataCampo] && n[f.dataCampo] <= f.dataAte);
  if (f.competenciaDe) list = list.filter(n => n.competencia && n.competencia.slice(0, 7) >= f.competenciaDe);
  if (f.competenciaAte) list = list.filter(n => n.competencia && n.competencia.slice(0, 7) <= f.competenciaAte);
  if (f.busca) {
    const q = f.busca.toLowerCase();
    list = list.filter(n => {
      const lbl = resolverLabelsNota(n);
      return lbl.fornecedor_label.toLowerCase().includes(q) || (n.numero_nota || '').toLowerCase().includes(q) || (lbl.centro_custo_label || '').toLowerCase().includes(q);
    });
  }
  list.sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em));
  return list;
}

function renderTodas() {
  const list = notasFiltradasTodas();
  const f = app.state.filters;
  return `
    <div class="topbar">
      <div><h2>Todas as notas</h2><p class="sub">${list.length} nota(s) no Central CP</p></div>
      <button class="btn btn-ghost btn-sm" type="button" id="btn-exportar-excel" ${list.length === 0 ? 'disabled' : ''}>Exportar Excel</button>
    </div>
    ${statRow(statsScope())}
    <div class="filters">
      <input id="f-busca" placeholder="Buscar fornecedor, NF ou centro de custo" value="${escapeHtml(f.busca)}" style="min-width:240px;">
      <select id="f-status">
        <option value="">Todos os status</option>
        ${STEPS.map(s => `<option value="${s}" ${f.status === s ? 'selected' : ''}>${STATUS_LABEL[s]}</option>`).join('')}
        <option value="cancelada" ${f.status === 'cancelada' ? 'selected' : ''}>Cancelada</option>
      </select>
      <select id="f-pendente">
        <option value="">Pendência: todas</option>
        <option value="sim" ${f.pendente === 'sim' ? 'selected' : ''}>Só com pendência</option>
        <option value="nao" ${f.pendente === 'nao' ? 'selected' : ''}>Só sem pendência</option>
      </select>
      <select id="f-pagador">
        <option value="">Todos os pagadores</option>
        ${app.cadastros.pagadores.map(p => `<option value="${p.id}" ${f.pagadorId === p.id ? 'selected' : ''}>${escapeHtml(labelOf(p))}</option>`).join('')}
      </select>
      <select id="f-setor">
        <option value="">Todos os setores</option>
        ${SETORES.map(s => `<option value="${s}" ${f.setor === s ? 'selected' : ''}>${s}</option>`).join('')}
      </select>
      <select id="f-centro-custo">
        <option value="">Todos os centros de custo</option>
        ${app.cadastros.centros_custo.map(c => `<option value="${c.id}" ${f.centroCustoId === c.id ? 'selected' : ''}>${escapeHtml(labelOf(c))}</option>`).join('')}
      </select>
      <button type="button" class="btn btn-ghost btn-sm" id="btn-limpar-filtros">Limpar filtros</button>
    </div>
    <div class="filters">
      <select id="f-data-campo">
        <option value="vencimento" ${f.dataCampo === 'vencimento' ? 'selected' : ''}>Período por vencimento</option>
        <option value="data_emissao" ${f.dataCampo === 'data_emissao' ? 'selected' : ''}>Período por emissão</option>
      </select>
      <input id="f-data-de" type="date" value="${f.dataDe}" title="De">
      <input id="f-data-ate" type="date" value="${f.dataAte}" title="Até">
      <input id="f-competencia-de" type="month" value="${f.competenciaDe}" title="Competência de" placeholder="Competência de">
      <input id="f-competencia-ate" type="month" value="${f.competenciaAte}" title="Competência até" placeholder="Competência até">
    </div>
    ${list.length === 0 ? `<div class="empty-state">Nenhuma nota encontrada com esses filtros.</div>` : `
    <div class="tbl-wrap">
    <table class="data-tbl">
      <thead><tr>
        <th>Fornecedor</th><th>NF</th><th>Emissão</th><th>Vencimento</th><th>Competência</th>
        <th>Valor bruto</th><th>Pagador</th><th>Centro de custo</th><th>Status</th><th>Setor</th><th>Solicitante</th>
      </tr></thead>
      <tbody>
        ${list.map(n => {
          const lbl = resolverLabelsNota(n);
          const expandido = app.state.rateiosExpandidos.has(n.id);
          const linhaPrincipal = `<tr class="row-click" data-open="${n.id}">
          <td>${escapeHtml(lbl.fornecedor_label)}</td>
          <td class="mono">${escapeHtml(n.numero_nota || '—')}</td>
          <td>${fmtDate(n.data_emissao)}</td>
          <td>${fmtDate(n.vencimento)}</td>
          <td>${fmtCompetencia(n.competencia)}</td>
          <td class="mono">${fmtMoney(n.valor_bruto)}</td>
          <td>${escapeHtml(lbl.pagador_label)}</td>
          <td>${n.tem_rateio
            ? `<a href="#" class="rateio-toggle" data-toggle-rateio="${n.id}" title="Mostrar/ocultar linhas do rateio">${expandido ? '▾' : '▸'} Rateado (${(n.rateios || []).length})</a>`
            : escapeHtml(lbl.centro_custo_label || '—')}</td>
          <td><span class="status-chip" style="background:${STATUS_SOFT[n.status]}; color:${STATUS_COLOR[n.status]}">${STATUS_LABEL[n.status]}</span> ${n.pendente ? `<span class="pend-badge">⚠</span>` : ''}</td>
          <td>${escapeHtml(n.setor || '—')}</td>
          <td>${escapeHtml(nomeUsuario(n.criado_por))}</td>
        </tr>`;
          const linhasRateio = (n.tem_rateio && expandido) ? (n.rateios || []).map(r => {
            const rl = resolverLabelsRateio(r);
            const partes = [rl.centro_label, rl.classe_label, rl.codigo_label].filter(Boolean).join(' · ');
            return `<tr class="rateio-subrow">
            <td colspan="5">↳ ${escapeHtml(partes)}${r.descricao ? ' — ' + escapeHtml(r.descricao) : ''}</td>
            <td class="mono">${fmtMoney(r.valor)}</td>
            <td colspan="5"></td>
          </tr>`;
          }).join('') : '';
          return linhaPrincipal + linhasRateio;
        }).join('')}
      </tbody>
      <tfoot><tr>
        <td colspan="5">Total (${list.length} nota${list.length === 1 ? '' : 's'})</td>
        <td class="mono">${fmtMoney(list.reduce((s, n) => s + (Number(n.valor_bruto) || 0), 0))}</td>
        <td colspan="5"></td>
      </tr></tfoot>
    </table>
    </div>`}
  `;
}
