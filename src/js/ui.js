// src/js/ui.js
import {
  app, SETORES, LIMITE_APROVACAO_GESTOR, ROLE_LABEL, STATUS_LABEL, STATUS_COLOR, STATUS_SOFT, STEPS,
  REGISTRY_DEFS, escapeHtml, fmtMoney, fmtDate, fmtDateTime, labelOf, selectOptions,
  centrosParaPagador, classesParaCentro, codigosParaClasse, resolverLabelsNota, resolverLabelsRateio, nomeUsuario,
} from './state.js';

/* ================= AUTH SCREEN ================= */
export let authTab = 'login';
export let authError = '';
export function setAuthTab(t) { authTab = t; }
export function setAuthError(e) { authError = e; }

export function renderAuth() {
  return `
  <div class="auth-wrap">
    <div class="auth-card">
      <div class="auth-logo"><span class="mark">CP</span><h1>Central CP</h1></div>
      <p class="auth-sub">Controle de contas a pagar entre setores</p>
      <div class="tabset">
        <button data-tab="login" class="${authTab === 'login' ? 'active' : ''}">Entrar</button>
        <button data-tab="cadastro" class="${authTab === 'cadastro' ? 'active' : ''}">Cadastrar</button>
      </div>
      ${authError ? `<div class="err-msg">${escapeHtml(authError)}</div>` : ''}
      ${authTab === 'login' ? `
        <div id="box-login">
          <div class="field"><label>E-mail</label><input id="login-email" type="email" required></div>
          <div class="field"><label>Senha</label><input type="password" id="login-password" required></div>
          <button class="btn btn-brand btn-block" type="button" id="btn-do-login">Entrar</button>
        </div>
      ` : `
        <div id="box-cadastro">
          <div class="field"><label>Nome completo</label><input id="cad-name" required></div>
          <div class="field"><label>E-mail</label><input id="cad-email" type="email" required></div>
          <div class="field"><label>Senha (mínimo 6 caracteres)</label><input type="password" id="cad-password" required></div>
          <div class="field">
            <label>Perfil</label>
            <select id="cad-role" required>
              <option value="departamento">Departamento (solicitante)</option>
              <option value="gestor">Gestor / Aprovador</option>
              <option value="contas_a_pagar">Contas a pagar</option>
            </select>
          </div>
          <div class="field" id="box-cad-setor">
            <label>Setor</label>
            <select id="cad-setor" required>
              <option value="">Selecione...</option>
              ${SETORES.map(s => `<option value="${s}">${s}</option>`).join('')}
            </select>
          </div>
          <button class="btn btn-brand btn-block" type="button" id="btn-do-cadastro">Criar conta e entrar</button>
        </div>
      `}
    </div>
  </div>`;
}

/* ================= SHELL / NAV ================= */
function navItemsFor(usuario) {
  let base;
  if (usuario.role === 'departamento') base = [
    { key: 'minhas', label: 'Minhas notas', count: app.notas.filter(n => n.criado_por === usuario.id && n.status !== 'rascunho').length },
    { key: 'rascunhos', label: 'Rascunhos', count: app.notas.filter(n => n.criado_por === usuario.id && n.status === 'rascunho').length },
    { key: 'todas', label: 'Todas as notas', count: null },
  ];
  else if (usuario.role === 'gestor') base = [
    { key: 'aprovacao', label: 'Aguardando aprovação', count: app.notas.filter(n => n.status === 'lancado' && !n.pendente && n.setor === usuario.setor).length },
    { key: 'todas', label: 'Todas as notas do setor', count: null },
  ];
  else base = [
    { key: 'fila_lancar', label: 'Para lançar no Group', count: app.notas.filter(n => n.status === 'aprovado' && !n.pendente).length },
    { key: 'fila_pagamento', label: 'Em pagamento (CSC)', count: app.notas.filter(n => n.status === 'em_pagamento' && !n.pendente).length },
    { key: 'pendencias', label: 'Pendências', count: app.notas.filter(n => n.pendente).length },
    { key: 'todas', label: 'Todas as notas', count: null },
  ];
  base.push({ key: 'cadastros', label: 'Cadastros', count: null });
  return base;
}

export function renderShell() {
  const usuario = app.usuario;
  const nav = navItemsFor(usuario);
  return `
  <div class="shell">
    <div class="sidebar">
      <div class="sb-logo"><span class="mark">CP</span><span>Central CP</span></div>
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
        ${usuario.role === 'departamento' ? `<button class="btn btn-amber btn-block" id="btn-nova-nota" style="border:none;">+ Nova nota</button>` : ''}
        <button id="btn-refresh">Atualizar dados</button>
        <button id="btn-logout">Sair</button>
      </div>
    </div>
    <div class="main">
      ${app.state.flash ? `<div class="flash">${escapeHtml(app.state.flash)}</div>` : ''}
      ${renderMain()}
    </div>
  </div>
  ${app.state.modal ? renderModal() : ''}
  `;
}

function renderMain() {
  if (app.state.view === 'cadastros') return renderCadastros();
  if (app.state.view === 'todas') return renderTodas();
  if (app.usuario.role === 'gestor' && app.state.view === 'aprovacao') return renderQueue('aprovacao');
  if (app.usuario.role === 'contas_a_pagar' && app.state.view === 'fila_lancar') return renderQueue('fila_lancar');
  if (app.usuario.role === 'contas_a_pagar' && app.state.view === 'fila_pagamento') return renderQueue('fila_pagamento');
  if (app.usuario.role === 'contas_a_pagar' && app.state.view === 'pendencias') return renderQueue('pendencias');
  if (app.usuario.role === 'departamento' && app.state.view === 'rascunhos') return renderQueue('rascunhos');
  if (app.usuario.role === 'departamento' && app.state.view === 'minhas') return renderQueue('minhas');
  return renderQueue('minhas');
}

const VIEW_META = {
  minhas:         { title: 'Minhas notas', sub: 'Notas que você lançou no Central CP' },
  rascunhos:      { title: 'Rascunhos', sub: 'Notas salvas como rascunho, ainda não enviadas para aprovação' },
  aprovacao:      { title: 'Aguardando aprovação', sub: 'Notas do seu setor, esperando sua aprovação' },
  fila_lancar:    { title: 'Para lançar no Group', sub: 'Notas aprovadas (ou abaixo do limite de alçada), prontas para lançamento' },
  fila_pagamento: { title: 'Em pagamento', sub: 'Chamados abertos no Acelerato, aguardando pagamento do CSC' },
  pendencias:     { title: 'Pendências', sub: 'Notas com alguma divergência aberta' },
  todas:          { title: 'Todas as notas', sub: 'Visão geral de todo o fluxo' },
};

function queueData(key) {
  const u = app.usuario;
  if (key === 'minhas') return app.notas.filter(n => n.criado_por === u.id && n.status !== 'rascunho');
  if (key === 'rascunhos') return app.notas.filter(n => n.criado_por === u.id && n.status === 'rascunho');
  if (key === 'aprovacao') return app.notas.filter(n => n.status === 'lancado' && !n.pendente && n.setor === u.setor);
  if (key === 'fila_lancar') return app.notas.filter(n => n.status === 'aprovado' && !n.pendente);
  if (key === 'fila_pagamento') return app.notas.filter(n => n.status === 'em_pagamento' && !n.pendente);
  if (key === 'pendencias') return app.notas.filter(n => n.pendente);
  return app.notas.filter(n => n.status !== 'rascunho');
}

function renderQueue(key) {
  const meta = VIEW_META[key];
  const list = queueData(key).sort((a, b) => new Date(a.criado_em) - new Date(b.criado_em));
  return `
    <div class="topbar"><div><h2>${meta.title}</h2><p class="sub">${meta.sub}</p></div></div>
    ${statRow()}
    ${list.length === 0 ? `<div class="empty-state">Nenhuma nota aqui no momento.</div>` : `<div class="card-list">${list.map(renderCard).join('')}</div>`}
  `;
}

function statRow() {
  const counts = { lancado: 0, aprovado: 0, em_pagamento: 0, pago: 0, pendente: 0 };
  app.notas.filter(n => n.status !== 'rascunho').forEach(n => { counts[n.status]++; if (n.pendente) counts.pendente++; });
  return `<div class="stat-row">
    ${STEPS.map(s => `<div class="stat-chip"><div class="n" style="color:${STATUS_COLOR[s]}">${counts[s]}</div><div class="l">${STATUS_LABEL[s]}</div></div>`).join('')}
    <div class="stat-chip"><div class="n" style="color:var(--alert)">${counts.pendente}</div><div class="l">Pendência</div></div>
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
      </div>
    </div>
    <div class="nc-meta">
      <span>${n.tem_rateio ? 'Rateado entre centros de custo' : 'Centro de custo: ' + escapeHtml(lbl.centro_custo_label || '—')}</span>
      <span>Vencimento: ${fmtDate(n.vencimento)}</span>
      <span>Pagador: ${escapeHtml(lbl.pagador_label)}</span>
      ${n.forma_pagamento ? `<span>Pagamento: ${escapeHtml(n.forma_pagamento)}</span>` : ''}
      <span>Solicitado por: ${escapeHtml(nomeUsuario(n.criado_por))}${n.setor ? ' · ' + escapeHtml(n.setor) : ''}</span>
    </div>
    ${n.status === 'rascunho' ? '' : pipeline(n.status)}
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

function renderTodas() {
  let list = app.notas.filter(n => n.status !== 'rascunho');
  if (app.usuario.role === 'gestor') list = list.filter(n => n.setor === app.usuario.setor);
  const f = app.state.filters;
  if (f.status) list = list.filter(n => n.status === f.status);
  if (f.busca) {
    const q = f.busca.toLowerCase();
    list = list.filter(n => {
      const lbl = resolverLabelsNota(n);
      return lbl.fornecedor_label.toLowerCase().includes(q) || (n.numero_nota || '').toLowerCase().includes(q) || (lbl.centro_custo_label || '').toLowerCase().includes(q);
    });
  }
  list.sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em));
  return `
    <div class="topbar"><div><h2>Todas as notas</h2><p class="sub">${list.length} nota(s)${app.usuario.role === 'gestor' ? ' no seu setor' : ' no Central CP'}</p></div></div>
    ${statRow()}
    <div class="filters">
      <input id="f-busca" placeholder="Buscar fornecedor, NF ou centro de custo" value="${escapeHtml(f.busca)}" style="min-width:240px;">
      <select id="f-status">
        <option value="">Todos os status</option>
        ${STEPS.map(s => `<option value="${s}" ${f.status === s ? 'selected' : ''}>${STATUS_LABEL[s]}</option>`).join('')}
      </select>
    </div>
    ${list.length === 0 ? `<div class="empty-state">Nenhuma nota encontrada.</div>` : `
    <table class="data-tbl">
      <thead><tr><th>Fornecedor</th><th>NF</th><th>Valor bruto</th><th>Centro de custo</th><th>Status</th><th>Solicitante</th></tr></thead>
      <tbody>
        ${list.map(n => {
          const lbl = resolverLabelsNota(n);
          return `<tr class="row-click" data-open="${n.id}">
          <td>${escapeHtml(lbl.fornecedor_label)}</td>
          <td class="mono">${escapeHtml(n.numero_nota || '—')}</td>
          <td class="mono">${fmtMoney(n.valor_bruto)}</td>
          <td>${escapeHtml(n.tem_rateio ? 'Rateado' : (lbl.centro_custo_label || '—'))}</td>
          <td><span class="status-chip" style="background:${STATUS_SOFT[n.status]}; color:${STATUS_COLOR[n.status]}">${STATUS_LABEL[n.status]}</span> ${n.pendente ? `<span class="pend-badge">⚠</span>` : ''}</td>
          <td>${escapeHtml(nomeUsuario(n.criado_por))}</td>
        </tr>`;
        }).join('')}
      </tbody>
    </table>`}
  `;
}
