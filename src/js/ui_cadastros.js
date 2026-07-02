// src/js/ui_cadastros.js
import { app, REGISTRY_DEFS, escapeHtml, labelOf, selectOptions, uid } from './state.js';

export function renderCadField(f) {
  if (f.type === 'origens') {
    return `<div class="field"><label>${f.label}</label>
      <div style="display:flex; gap:12px; padding:10px 0;">
        ${(app.cadastros.pagadores || []).map(p => `<label style="display:flex; align-items:center; gap:5px; font-weight:500; font-size:13px;"><input type="checkbox" class="cadnew-origem" value="${p.sigla}"> ${escapeHtml(p.nome)}</label>`).join('') || '<span class="field-hint">Cadastre os pagadores primeiro.</span>'}
      </div>
    </div>`;
  }
  if (f.type === 'select-centro') {
    return `<div class="field"><label>${f.label}</label><select id="cadnew-${f.key}">${selectOptions(app.cadastros.centros_custo)}</select></div>`;
  }
  if (f.type === 'select-classe') {
    return `<div class="field"><label>${f.label}</label><select id="cadnew-${f.key}">${selectOptions(app.cadastros.classes_conta)}</select></div>`;
  }
  return `<div class="field"><label>${f.label}</label><input id="cadnew-${f.key}"></div>`;
}

export function cadCellValue(it, f) {
  if (f.type === 'origens') return (it.origem_siglas || []).join(', ');
  if (f.type === 'select-centro') { const c = app.cadastros.centros_custo.find(x => x.id === it.centro_custo_id); return c ? labelOf(c) : '—'; }
  if (f.type === 'select-classe') { const c = app.cadastros.classes_conta.find(x => x.id === it.classe_conta_id); return c ? labelOf(c) : '—'; }
  return it[f.key] || '';
}

/* ---- Fornecedor: registro especial com múltiplas contas bancárias ---- */
export function renderFornecedorContasArea() {
  let html = '';
  if (app.fornecedorContasTemp.length > 0) {
    html += `<table class="data-tbl" style="margin-bottom:10px;"><thead><tr><th>Cód. Banco</th><th>Agência</th><th>Conta</th><th></th></tr></thead><tbody>`;
    app.fornecedorContasTemp.forEach((c, i) => {
      html += `<tr><td class="mono">${escapeHtml(c.cod_banco)}</td><td class="mono">${escapeHtml(c.agencia)}</td><td class="mono">${escapeHtml(c.conta)}</td><td><button type="button" class="btn btn-ghost btn-sm" data-conta-remove="${i}">Remover</button></td></tr>`;
    });
    html += `</tbody></table>`;
  }
  html += `
    <div class="grid2">
      <div class="field"><label>Cód. Banco</label><input id="cb-cod-banco"></div>
      <div class="field"><label>Agência</label><input id="cb-agencia"></div>
    </div>
    <div class="field"><label>Conta</label><input id="cb-conta"></div>
    <button type="button" class="btn btn-amber btn-sm" id="btn-conta-incluir">+ Incluir conta bancária</button>
  `;
  return html;
}

export function renderFornecedorForm() {
  return `
    <div class="grid2">
      <div class="field"><label>Nome do fornecedor</label><input id="cadnew-nome"></div>
      <div class="field"><label>CPF/CNPJ</label><input id="cadnew-cnpj"></div>
    </div>
    <div class="grid2">
      <div class="field"><label>Município</label><input id="cadnew-municipio"></div>
      <div class="field"><label>Cód. Group</label><input id="cadnew-cod_group"></div>
    </div>
    <div class="field">
      <label>Contas bancárias</label>
      <div id="fornecedor-contas-area">${renderFornecedorContasArea()}</div>
    </div>
  `;
}

export function renderFornecedoresTable(podeEditar) {
  const busca = app.state.cadFornecedorBusca || '';
  if (busca.trim().length < 2) {
    return `<div class="empty-state">Digite ao menos 2 letras para buscar entre os ${app.cadastros.fornecedores.length} fornecedores cadastrados.</div>`;
  }
  const q = busca.toLowerCase();
  const list = app.cadastros.fornecedores.filter(f =>
    f.nome.toLowerCase().includes(q) || (f.cnpj || '').includes(busca) || (f.cod_group || '').includes(busca)
  ).slice(0, 150);
  if (list.length === 0) return `<div class="empty-state">Nenhum fornecedor encontrado para "${escapeHtml(busca)}".</div>`;
  return `
    <table class="data-tbl">
      <thead><tr><th>Nome</th><th>CPF/CNPJ</th><th>Município</th><th>Cód. Group</th><th>Contas bancárias</th>${podeEditar ? '<th></th>' : ''}</tr></thead>
      <tbody>
        ${list.map(f => `<tr>
          <td>${escapeHtml(f.nome)}</td>
          <td class="mono">${escapeHtml(f.cnpj || '—')}</td>
          <td>${escapeHtml(f.municipio || '—')}</td>
          <td class="mono">${escapeHtml(f.cod_group || '—')}</td>
          <td>${(f.contas && f.contas.length) ? f.contas.map(c => `Banco ${escapeHtml(c.cod_banco || '—')}/Ag ${escapeHtml(c.agencia || '—')}/CC ${escapeHtml(c.conta || '—')}`).join('; ') : '—'}</td>
          ${podeEditar ? `<td><button type="button" class="btn btn-ghost btn-sm" data-cad-remove="${f.id}">Remover</button></td>` : ''}
        </tr>`).join('')}
      </tbody>
    </table>
    ${list.length === 150 ? `<div class="field-hint" style="margin-top:8px;">Mostrando os primeiros 150 resultados — refine a busca para ver outros.</div>` : ''}
  `;
}

// Só o contas a pagar cria/edita/exclui cadastros — os demais perfis só
// consultam (a RLS já bloqueia no banco; aqui é só não oferecer o botão).
export function podeEditarCadastros() {
  return app.usuario && app.usuario.role === 'contas_a_pagar';
}

export function renderCadastros() {
  const tabs = Object.keys(REGISTRY_DEFS);
  const active = app.state.cadastroTab && REGISTRY_DEFS[app.state.cadastroTab] ? app.state.cadastroTab : tabs[0];
  const def = REGISTRY_DEFS[active];
  const podeEditar = podeEditarCadastros();
  const topbar = `
    <div class="topbar"><div><h2>Cadastros</h2><p class="sub">Listas usadas no lançamento das notas — fornecedores, pagadores, centros de custo, classe da conta e código da classificação${podeEditar ? '' : ' (somente consulta — apenas o contas a pagar pode alterar)'}</p></div></div>
    <div class="tabset" style="max-width:fit-content; padding:3px; margin-bottom:18px; flex-wrap:wrap;">
      ${tabs.map(t => `<button data-cad-tab="${t}" class="${active === t ? 'active' : ''}" style="padding:8px 14px; flex:none;">${REGISTRY_DEFS[t].label}</button>`).join('')}
    </div>`;

  if (active === 'fornecedores') {
    return `
      ${topbar}
      ${podeEditar ? `
      <div style="background:var(--surface); border:1px solid var(--line); border-radius:12px; padding:18px; margin-bottom:16px;">
        ${renderFornecedorForm()}
        <button class="btn btn-brand btn-sm" type="button" id="btn-add-cadastro">Adicionar fornecedor</button>
      </div>` : ''}
      <div class="filters"><input id="f-busca-fornecedor" placeholder="Buscar por nome, CNPJ ou cód. Group (min. 2 letras)" value="${escapeHtml(app.state.cadFornecedorBusca || '')}" style="min-width:320px;"></div>
      ${renderFornecedoresTable(podeEditar)}
    `;
  }

  const list = app.cadastros[active] || [];
  return `
    ${topbar}
    ${podeEditar ? `
    <div style="background:var(--surface); border:1px solid var(--line); border-radius:12px; padding:18px; margin-bottom:16px;">
      <div class="grid2">${def.fields.map(f => renderCadField(f)).join('')}</div>
      <button class="btn btn-brand btn-sm" type="button" id="btn-add-cadastro">Adicionar</button>
    </div>` : ''}
    ${list.length === 0 ? `<div class="empty-state">Nenhum item cadastrado ainda em "${def.label}".</div>` : `
    <table class="data-tbl">
      <thead><tr>${def.fields.map(f => `<th>${f.label}</th>`).join('')}${podeEditar ? '<th></th>' : ''}</tr></thead>
      <tbody>
        ${list.map(it => `<tr>${def.fields.map(f => `<td>${escapeHtml(cadCellValue(it, f))}</td>`).join('')}${podeEditar ? `<td><button type="button" class="btn btn-ghost btn-sm" data-cad-remove="${it.id}">Remover</button></td>` : ''}</tr>`).join('')}
      </tbody>
    </table>`}
  `;
}
