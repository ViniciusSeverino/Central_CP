// src/js/ui_cadastros.js
import {
  app, REGISTRY_DEFS, escapeHtml, labelOf, selectOptions, uid, SETORES, ROLE_LABEL, PERFIL_DEPARTAMENTO_LABEL,
  fmtDate, nomeUsuario, podeOperarCadastro, ehAdministrador, ehSuperUsuario, contratoVencido,
} from './state.js';
import { renderImportarTab } from './ui_importar.js';
import { pessoaTipo } from './chamado_texto.js';

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
    html += `<div class="tbl-wrap"><table class="data-tbl" style="margin-bottom:10px;"><thead><tr><th>Cód. Banco</th><th>Agência</th><th>Conta</th><th></th></tr></thead><tbody>`;
    app.fornecedorContasTemp.forEach((c, i) => {
      html += `<tr><td class="mono">${escapeHtml(c.cod_banco)}</td><td class="mono">${escapeHtml(c.agencia)}</td><td class="mono">${escapeHtml(c.conta)}</td><td><button type="button" class="btn btn-ghost btn-sm" data-conta-remove="${i}">Remover</button></td></tr>`;
    });
    html += `</tbody></table></div>`;
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

// editing: fornecedor existente (edição) ou null/undefined (cadastro novo).
export function formFornecedor(editing) {
  const f = editing || {};
  const sugestaoPessoa = pessoaTipo(f.cnpj);
  return `
    <div class="grid2">
      <div class="field"><label>Nome do fornecedor</label><input id="cadnew-nome" value="${escapeHtml(f.nome || '')}"></div>
      <div class="field"><label>CPF/CNPJ</label><input id="cadnew-cnpj" value="${escapeHtml(f.cnpj || '')}"></div>
    </div>
    <div class="grid2">
      <div class="field"><label>Município</label><input id="cadnew-municipio" value="${escapeHtml(f.municipio || '')}"></div>
      <div class="field"><label>Cód. Group</label><input id="cadnew-cod_group" value="${escapeHtml(f.cod_group || '')}"></div>
    </div>
    <div class="grid2">
      <div class="field">
        <label>Pessoa</label>
        <select id="cadnew-pessoa-tipo">
          <option value="">Não informado</option>
          <option value="PF" ${(f.pessoa_tipo || sugestaoPessoa) === 'PF' ? 'selected' : ''}>Pessoa física (PF)</option>
          <option value="PJ" ${(f.pessoa_tipo || sugestaoPessoa) === 'PJ' ? 'selected' : ''}>Pessoa jurídica (PJ)</option>
        </select>
        <div class="field-hint">Sugerido automaticamente pelo CPF/CNPJ (11 dígitos = PF, 14 = PJ) — pode corrigir à mão.</div>
      </div>
      <div class="field">
        <label>Tipo de contratação padrão</label>
        <select id="cadnew-tipo-contratacao-padrao">
          <option value="">Não informado</option>
          <option value="sob_demanda" ${f.tipo_contratacao_padrao === 'sob_demanda' ? 'selected' : ''}>Sob demanda</option>
          <option value="mensal" ${f.tipo_contratacao_padrao === 'mensal' ? 'selected' : ''}>Mensal</option>
        </select>
        <div class="field-hint">Sugestão pré-preenchida no lançamento de uma nota nova pra este fornecedor.</div>
      </div>
    </div>
    <div class="grid2">
      <div class="field"><label>Vigência do contrato — início</label><input id="cadnew-vigencia-inicio" type="date" value="${f.contrato_vigencia_inicio ? f.contrato_vigencia_inicio.slice(0, 10) : ''}"></div>
      <div class="field"><label>Vigência do contrato — fim</label><input id="cadnew-vigencia-fim" type="date" value="${f.contrato_vigencia_fim ? f.contrato_vigencia_fim.slice(0, 10) : ''}"></div>
    </div>
    <div class="field"><label>Observações do contrato</label><textarea id="cadnew-contrato-obs" rows="2">${escapeHtml(f.contrato_observacoes || '')}</textarea></div>
    <div class="field">
      <label>Contas bancárias</label>
      <div id="fornecedor-contas-area">${renderFornecedorContasArea()}</div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-brand" id="confirmar-fornecedor">${editing ? 'Salvar' : 'Cadastrar fornecedor'}</button>
      <button class="btn btn-ghost" id="modal-cancel">Cancelar</button>
    </div>
  `;
}

export function renderFornecedoresTable(podeEditar) {
  const buscaBruta = app.state.cadFornecedorBusca || '';
  const busca = buscaBruta.trim().toLowerCase();
  const hoje = new Date().toISOString().slice(0, 10);
  const list = app.cadastros.fornecedores.filter(f =>
    !busca || f.nome.toLowerCase().includes(busca) || (f.cnpj || '').includes(buscaBruta) || (f.cod_group || '').includes(buscaBruta)
  );
  if (list.length === 0) return `<div class="empty-state">Nenhum fornecedor encontrado${busca ? ` para "${escapeHtml(buscaBruta)}"` : ''}.</div>`;
  return `
    <div class="tbl-wrap">
    <table class="data-tbl">
      <thead><tr><th>Nome</th><th>CPF/CNPJ</th><th>Pessoa</th><th>Tipo de contratação</th><th>Vigência do contrato</th><th>Município</th><th>Cód. Group</th>${podeEditar ? '<th></th>' : ''}</tr></thead>
      <tbody>
        ${list.map(f => {
          const vencido = contratoVencido(f, hoje);
          const vigencia = f.contrato_vigencia_fim
            ? `${fmtDate(f.contrato_vigencia_inicio)} – ${fmtDate(f.contrato_vigencia_fim)}${vencido ? ' ⚠ vencido' : ''}`
            : '—';
          return `<tr class="${podeEditar ? 'row-click' : ''}"${podeEditar ? ` data-editar-fornecedor="${f.id}"` : ''}>
          <td>${escapeHtml(f.nome)}${f.status === 'pre_cadastro' ? ` <span class="pend-badge" style="background:var(--amber-soft); color:var(--amber);">Pré-cadastro</span>` : ''}</td>
          <td class="mono">${escapeHtml(f.cnpj || '—')}</td>
          <td>${f.pessoa_tipo || '—'}</td>
          <td>${f.tipo_contratacao_padrao === 'mensal' ? 'Mensal' : (f.tipo_contratacao_padrao === 'sob_demanda' ? 'Sob demanda' : '—')}</td>
          <td class="mono"${vencido ? ' style="color:var(--alert); font-weight:600;"' : ''}>${vigencia}</td>
          <td>${escapeHtml(f.municipio || '—')}</td>
          <td class="mono">${escapeHtml(f.cod_group || '—')}</td>
          ${podeEditar ? `<td><button type="button" class="btn btn-ghost btn-sm" data-cad-remove-fornecedor="${f.id}">Remover</button></td>` : ''}
        </tr>`;
        }).join('')}
      </tbody>
    </table>
    </div>
    <div class="field-hint" style="margin-top:8px;">${list.length} fornecedor(es)${busca ? ' encontrado(s)' : ' cadastrado(s)'}${podeEditar ? ' — clique numa linha pra editar.' : ''}</div>
  `;
}

// Contas a pagar, gerente_financeiro e administrador criam/editam/excluem
// cadastros — os demais perfis só consultam (a RLS já bloqueia no banco;
// aqui é só não oferecer o botão).
export function podeEditarCadastros() {
  return podeOperarCadastro();
}

function tabsVisiveis() {
  return Object.keys(REGISTRY_DEFS).filter(t => {
    const restrito = REGISTRY_DEFS[t].restritoA;
    if (!restrito) return true;
    if (restrito === 'administrador') return ehAdministrador();
    if (restrito === 'super') return ehSuperUsuario();
    if (restrito === 'operador_cadastro') return podeOperarCadastro();
    return true;
  });
}

// aninhado: renderizado dentro da aba "Cadastros" de Configurações (ver
// ui_configuracoes.js) -- omite o próprio título/descrição (Configurações já
// mostra um título de página; repetir "Cadastros" logo abaixo seria
// redundante), mas mantém a barra de sub-abas (Fornecedores/Pagadores/etc),
// que é navegação de verdade, não só um rótulo.
export function renderCadastros({ aninhado } = {}) {
  const tabs = tabsVisiveis();
  const active = app.state.cadastroTab && tabs.includes(app.state.cadastroTab) ? app.state.cadastroTab : tabs[0];
  const def = REGISTRY_DEFS[active];
  const podeEditar = podeEditarCadastros();
  const tabset = `
    <div class="tabset" style="max-width:fit-content; padding:3px; margin-bottom:18px; flex-wrap:wrap;">
      ${tabs.map(t => `<button data-cad-tab="${t}" class="${active === t ? 'active' : ''}" style="padding:8px 14px; flex:none;">${REGISTRY_DEFS[t].label}</button>`).join('')}
    </div>`;
  const topbar = aninhado ? tabset : `
    <div class="topbar"><div><h2>Cadastros</h2><p class="sub">Listas usadas no lançamento das notas — fornecedores, pagadores, centros de custo, classe da conta e código da classificação${podeEditar ? '' : ' (somente consulta — apenas o contas a pagar pode alterar)'}</p></div></div>
    ${tabset}`;

  if (active === 'usuarios') return `${topbar}${renderUsuariosTab()}`;
  if (active === 'delegacoes') return `${topbar}${renderDelegacoesTab()}`;
  if (active === 'importar') return `${topbar}${renderImportarTab()}`;

  if (active === 'fornecedores') {
    return `
      ${topbar}
      <div class="topbar" style="margin-bottom:12px;">
        <div></div>
        ${podeEditar ? `<button class="btn btn-brand btn-sm" type="button" id="btn-novo-fornecedor">+ Adicionar fornecedor</button>` : ''}
      </div>
      <div class="filters"><input id="f-busca-fornecedor" placeholder="Buscar por nome, CNPJ ou cód. Group" value="${escapeHtml(app.state.cadFornecedorBusca || '')}" style="min-width:320px;"></div>
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
    <div class="tbl-wrap">
    <table class="data-tbl">
      <thead><tr>${def.fields.map(f => `<th>${f.label}</th>`).join('')}${podeEditar ? '<th></th>' : ''}</tr></thead>
      <tbody>
        ${list.map(it => `<tr>${def.fields.map(f => `<td>${escapeHtml(cadCellValue(it, f))}</td>`).join('')}${podeEditar ? `<td><button type="button" class="btn btn-ghost btn-sm" data-cad-remove="${it.id}">Remover</button></td>` : ''}</tr>`).join('')}
      </tbody>
    </table>
    </div>`}
  `;
}

/* =========================== USUÁRIOS (administrador) =========================== */
export function renderUsuariosTab() {
  const list = app.usuariosCompletos || [];
  return `
    <div style="background:var(--surface); border:1px solid var(--line); border-radius:12px; padding:18px; margin-bottom:16px;">
      <button class="btn btn-brand btn-sm" type="button" id="btn-convidar-usuario">+ Convidar usuário</button>
    </div>
    ${list.length === 0 ? `<div class="empty-state">Carregando usuários...</div>` : `
    <div class="tbl-wrap">
    <table class="data-tbl">
      <thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Setor</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${list.map(u => `<tr>
          <td>${escapeHtml(u.nome)}</td>
          <td class="mono">${escapeHtml(u.email || '—')}</td>
          <td>${escapeHtml(ROLE_LABEL[u.role] || u.role)}</td>
          <td>${escapeHtml(u.setor || '—')}</td>
          <td>${u.ativo
            ? `<span class="status-chip" style="background:var(--good-soft); color:var(--good);">Ativo</span>`
            : `<span class="status-chip" style="background:var(--alert-soft); color:var(--alert);">Inativo</span>`}</td>
          <td style="white-space:nowrap;">
            <button type="button" class="btn btn-ghost btn-sm" data-editar-usuario="${u.id}">Editar</button>
            ${u.id === app.usuario.id ? '' : (u.ativo
              ? `<button type="button" class="btn btn-ghost btn-sm" data-desativar-usuario="${u.id}">Desativar</button>`
              : `<button type="button" class="btn btn-ghost btn-sm" data-reativar-usuario="${u.id}">Reativar</button>`)}
          </td>
        </tr>`).join('')}
      </tbody>
    </table>
    </div>`}
  `;
}

export function formConvidarUsuario() {
  return `
  <div class="field"><label>Nome completo</label><input id="cv-nome" required></div>
  <div class="field"><label>E-mail</label><input id="cv-email" type="email" required></div>
  <div class="field">
    <label>Perfil</label>
    <select id="cv-role" required>
      <option value="departamento">Departamento</option>
      <option value="contas_a_pagar">Contas a pagar</option>
      <option value="gerente_financeiro">Gerente Financeiro</option>
      <option value="administrador">Administrador</option>
    </select>
  </div>
  <div class="field" id="cv-setor-area">
    <label>Setor</label>
    <select id="cv-setor" required>
      <option value="">Selecione...</option>
      ${SETORES.map(s => `<option value="${s}">${s}</option>`).join('')}
    </select>
  </div>
  <div class="field" id="cv-perfil-departamento-area" style="display:none;">
    <label>Nível dentro do departamento</label>
    <select id="cv-perfil-departamento">
      <option value="completo">${PERFIL_DEPARTAMENTO_LABEL.completo}</option>
      <option value="recebedor">${PERFIL_DEPARTAMENTO_LABEL.recebedor}</option>
    </select>
    <div class="field-hint">"Recebedor" é pra quem só recebe o documento do fornecedor na prática -- anexa e classifica, não lança a nota inteira.</div>
  </div>
  <div class="field-hint" style="margin-bottom:14px;">A pessoa recebe um e-mail com um link pra definir a própria senha — a conta já nasce ativa.</div>
  <div class="modal-actions">
    <button class="btn btn-brand" id="confirmar-convidar">Enviar convite</button>
    <button class="btn btn-ghost" id="modal-cancel">Cancelar</button>
  </div>`;
}

export function formEditarUsuario(u) {
  return `
  <div class="field"><label>Nome</label><div style="padding:8px 0; font-weight:600;">${escapeHtml(u.nome)}</div></div>
  <div class="field"><label>E-mail</label><div class="mono" style="padding:8px 0;">${escapeHtml(u.email || '—')}</div></div>
  <div class="field">
    <label>Perfil</label>
    <select id="ed-role" required>
      <option value="departamento" ${u.role === 'departamento' ? 'selected' : ''}>Departamento</option>
      <option value="contas_a_pagar" ${u.role === 'contas_a_pagar' ? 'selected' : ''}>Contas a pagar</option>
      <option value="gerente_financeiro" ${u.role === 'gerente_financeiro' ? 'selected' : ''}>Gerente Financeiro</option>
      <option value="administrador" ${u.role === 'administrador' ? 'selected' : ''}>Administrador</option>
    </select>
  </div>
  <div class="field" id="ed-setor-area">
    <label>Setor</label>
    <select id="ed-setor">
      <option value="">Selecione...</option>
      ${SETORES.map(s => `<option value="${s}" ${u.setor === s ? 'selected' : ''}>${s}</option>`).join('')}
    </select>
  </div>
  <div class="field" id="ed-perfil-departamento-area" style="display:${u.role === 'departamento' ? '' : 'none'};">
    <label>Nível dentro do departamento</label>
    <select id="ed-perfil-departamento">
      <option value="completo" ${(u.perfil_departamento || 'completo') === 'completo' ? 'selected' : ''}>${PERFIL_DEPARTAMENTO_LABEL.completo}</option>
      <option value="recebedor" ${u.perfil_departamento === 'recebedor' ? 'selected' : ''}>${PERFIL_DEPARTAMENTO_LABEL.recebedor}</option>
    </select>
    <div class="field-hint">"Recebedor" é pra quem só recebe o documento do fornecedor na prática -- anexa e classifica, não lança a nota inteira.</div>
  </div>
  <div class="modal-actions">
    <button class="btn btn-brand" id="confirmar-editar-usuario">Salvar</button>
    <button class="btn btn-ghost" id="modal-cancel">Cancelar</button>
  </div>
  <div class="form-section" style="margin-top:18px;">
    <h3 class="form-section-title">Redefinir senha</h3>
    <p class="field-hint" style="margin-bottom:14px;">
      Define uma senha nova na hora, sem precisar de e-mail -- útil quando a rede da empresa bloqueia o
      link de "definir senha" do convite. Avise a pessoa por fora (chat, verbal etc.); ela pode trocar de
      novo quando quiser em Configurações → Meus dados.
    </p>
    <div class="field"><label>Nova senha</label><input type="password" id="rs-senha-nova" autocomplete="new-password"></div>
    <div class="field"><label>Confirmar nova senha</label><input type="password" id="rs-senha-confirma" autocomplete="new-password"></div>
    <button class="btn btn-alert btn-sm" type="button" id="confirmar-redefinir-senha">Redefinir senha</button>
  </div>`;
}

/* =========================== DELEGAÇÕES (administrador/gerente) =========================== */
export function renderDelegacoesTab() {
  const list = app.delegacoes || [];
  const hoje = new Date().toISOString().slice(0, 10);
  return `
    <div style="background:var(--surface); border:1px solid var(--line); border-radius:12px; padding:18px; margin-bottom:16px;">
      <button class="btn btn-brand btn-sm" type="button" id="btn-nova-delegacao">+ Nova delegação</button>
    </div>
    ${list.length === 0 ? `<div class="empty-state">Nenhuma delegação cadastrada.</div>` : `
    <div class="tbl-wrap">
    <table class="data-tbl">
      <thead><tr><th>Titular</th><th>Delegado</th><th>Período</th><th>Motivo</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${list.map(d => {
          const statusLbl = !d.ativo ? 'Revogada' : (hoje < d.data_inicio ? 'Agendada' : (hoje > d.data_fim ? 'Expirada' : 'Ativa'));
          const statusColor = statusLbl === 'Ativa' ? 'var(--good)' : (statusLbl === 'Revogada' ? 'var(--alert)' : 'var(--ink-soft)');
          const podeRevogar = d.ativo && statusLbl !== 'Expirada';
          return `<tr>
          <td>${escapeHtml(nomeUsuario(d.titular_id))}</td>
          <td>${escapeHtml(nomeUsuario(d.delegado_id))}</td>
          <td class="mono">${fmtDate(d.data_inicio)} – ${fmtDate(d.data_fim)}</td>
          <td>${escapeHtml(d.motivo || '—')}</td>
          <td><span class="status-chip" style="background:var(--gray-soft); color:${statusColor}">${statusLbl}</span></td>
          <td>${podeRevogar ? `<button type="button" class="btn btn-ghost btn-sm" data-revogar-delegacao="${d.id}">Revogar</button>` : ''}</td>
        </tr>`;
        }).join('')}
      </tbody>
    </table>
    </div>`}
  `;
}

function selectOptionsUsuarios() {
  // app.usuariosCompletos começa como [] (não null) em state.js, então
  // "app.usuariosCompletos || app.usuarios" nunca cairia pro segundo --
  // array vazio é truthy. Só usa usuariosCompletos se ele já foi carregado
  // de verdade (aba Usuários visitada nesta sessão); senão cai pra lista
  // "leve" (app.usuarios, sempre carregada no boot).
  const list = (app.usuariosCompletos && app.usuariosCompletos.length > 0) ? app.usuariosCompletos : app.usuarios;
  return `<option value="">Selecione...</option>` + list.map(u => `<option value="${u.id}">${escapeHtml(u.nome)} (${escapeHtml(ROLE_LABEL[u.role] || u.role)})</option>`).join('');
}

export function formNovaDelegacao() {
  const today = new Date().toISOString().slice(0, 10);
  return `
  <div class="field"><label>Titular (quem está ausente)</label><select id="dl-titular" required>${selectOptionsUsuarios()}</select></div>
  <div class="field"><label>Delegado (quem assume)</label><select id="dl-delegado" required>${selectOptionsUsuarios()}</select></div>
  <div class="grid2">
    <div class="field"><label>Início</label><input id="dl-inicio" type="date" value="${today}" required></div>
    <div class="field"><label>Fim</label><input id="dl-fim" type="date" required></div>
  </div>
  <div class="field"><label>Motivo (opcional)</label><input id="dl-motivo" placeholder="Ex: férias"></div>
  <div class="field-hint" style="margin-bottom:14px;">Enquanto ativa e dentro do período, o delegado assume as notas e permissões do titular — o histórico continua registrando quem realmente clicou.</div>
  <div class="modal-actions">
    <button class="btn btn-brand" id="confirmar-nova-delegacao">Criar delegação</button>
    <button class="btn btn-ghost" id="modal-cancel">Cancelar</button>
  </div>`;
}
