// src/js/ui_nota.js
import {
  app, escapeHtml, fmtMoney, fmtDate, fmtDateTime, labelOf, selectOptions,
  centrosParaPagador, classesParaCentro, codigosParaClasse, resolverLabelsNota, resolverLabelsRateio,
  nomeUsuario, STATUS_LABEL, STATUS_COLOR, STATUS_SOFT, uid,
} from './state.js';
import { pipeline } from './ui.js';

export function formNovaNota(editing) {
  const n = editing || {};
  const pag = app.cadastros.pagadores, forn = app.cadastros.fornecedores;
  const hint = (key, label) => (app.cadastros[key].length === 0 ? `<div class="field-hint">Nenhum ${label} cadastrado ainda. <a href="#" data-goto-cadastros="${key}">Cadastrar agora</a></div>` : '');
  app.temRateio = editing ? !!n.tem_rateio : false;
  return `
  <div id="box-nota">
    <div class="grid2">
      <div class="field"><label>Data de emissão</label><input id="nf-emissao" type="date" required value="${n.data_emissao ? n.data_emissao.slice(0, 10) : ''}"></div>
      <div class="field"><label>Data de vencimento</label><input id="nf-vencimento" type="date" required value="${n.vencimento ? n.vencimento.slice(0, 10) : ''}"></div>
    </div>
    <div class="grid2">
      <div class="field"><label>N° da NF</label><input id="nf-numero" required value="${escapeHtml(n.numero_nota || '')}"></div>
      <div class="field"><label>Valor bruto (R$)</label><input id="nf-valor" type="number" step="0.01" min="0" required value="${n.valor_bruto || ''}"></div>
    </div>
    <div class="field">
      <label>Pagador</label>
      <select id="nf-pagador" required>${selectOptions(pag, n.pagador_id)}</select>
      ${hint('pagadores', 'pagador')}
    </div>
    <div class="field">
      <label>Fornecedor</label>
      <select id="nf-fornecedor" required>${selectOptions(forn, n.fornecedor_id)}</select>
      ${hint('fornecedores', 'fornecedor')}
    </div>
    <div class="field">
      <label>Forma de pagamento</label>
      <select id="nf-forma-pagamento" required>
        <option value="">Selecione...</option>
        <option value="Boleto bancário" ${n.forma_pagamento === 'Boleto bancário' ? 'selected' : ''}>Boleto bancário</option>
        <option value="TED" ${n.forma_pagamento === 'TED' ? 'selected' : ''}>TED</option>
        <option value="Pix" ${n.forma_pagamento === 'Pix' ? 'selected' : ''}>Pix</option>
      </select>
    </div>
    <div class="field" id="conta-bancaria-area">${renderContaBancariaArea(n.fornecedor_id, n.forma_pagamento, n.conta_bancaria_id)}</div>
    <div class="field">
      <label>Classificação</label>
      <select id="nf-classificacao" required>
        <option value="">Selecione...</option>
        <option value="Compras" ${n.classificacao === 'Compras' ? 'selected' : ''}>Compras</option>
        <option value="Serviço" ${n.classificacao === 'Serviço' ? 'selected' : ''}>Serviço</option>
        <option value="Outros" ${n.classificacao === 'Outros' ? 'selected' : ''}>Outros</option>
      </select>
    </div>
    <div class="field">
      <label>Ratear entre centros de custo?</label>
      <select id="nf-tem-rateio">
        <option value="nao" ${!app.temRateio ? 'selected' : ''}>Não — uma classificação para a nota toda</option>
        <option value="sim" ${app.temRateio ? 'selected' : ''}>Sim — dividir entre centros de custo</option>
      </select>
    </div>
    <div id="classificacao-area">${renderClassificacaoArea(n)}</div>
    <div class="field"><label>Descrição geral</label><textarea id="nf-descricao" rows="2">${escapeHtml(n.descricao || '')}</textarea></div>
    <div class="field">
      <label>Arquivos anexos (referência)</label>
      <input id="nf-anexos" placeholder="ex: NF-4521.pdf, boleto-4521.pdf" value="${escapeHtml((n.anexos || []).join(', '))}">
      <div class="field-hint">Sem upload real de arquivo ainda — registre aqui só o nome, e continue enviando o PDF como hoje até existir upload (ex: Supabase Storage).</div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-brand" type="button" id="btn-salvar-nota">${editing && editing.status !== 'rascunho' ? 'Reenviar para aprovação' : 'Lançar nota no Central CP'}</button>
      <button class="btn btn-ghost" type="button" id="btn-salvar-rascunho">Salvar como rascunho</button>
      <button class="btn btn-ghost" type="button" id="modal-cancel">Cancelar</button>
    </div>
  </div>`;
}

export function renderContaBancariaArea(fornecedorId, formaPagamento, contaSelecionadaId) {
  if (formaPagamento !== 'TED' && formaPagamento !== 'Pix') {
    return `<label>Dados bancários</label><div class="field-hint">Não se aplica para Boleto bancário.</div>`;
  }
  if (!fornecedorId) return `<label>Dados bancários</label><div class="field-hint">Selecione o fornecedor para ver os dados bancários.</div>`;
  const forn = app.cadastros.fornecedores.find(f => f.id === fornecedorId);
  const contas = (forn && forn.contas) || [];
  if (contas.length === 0) {
    return `<label>Dados bancários</label><div class="field-hint" style="color:var(--alert);">Este fornecedor não tem conta bancária cadastrada. Cadastre em <a href="#" data-goto-cadastros="fornecedores">Cadastros → Fornecedores</a> ou escolha Boleto bancário.</div>`;
  }
  if (contas.length === 1) {
    const c = contas[0];
    return `<label>Dados bancários</label><div class="field-hint">Banco ${escapeHtml(c.cod_banco || '—')} · Agência ${escapeHtml(c.agencia || '—')} · Conta ${escapeHtml(c.conta || '—')}</div><input type="hidden" id="nf-conta-bancaria" value="${c.id}">`;
  }
  return `<label>Conta bancária (fornecedor possui mais de uma)</label>
    <select id="nf-conta-bancaria" required>
      <option value="">Selecione...</option>
      ${contas.map(c => `<option value="${c.id}" ${c.id === contaSelecionadaId ? 'selected' : ''}>Banco ${escapeHtml(c.cod_banco || '—')} · Ag ${escapeHtml(c.agencia || '—')} · CC ${escapeHtml(c.conta || '—')}</option>`).join('')}
    </select>`;
}

export function refreshContaBancariaArea() {
  const area = document.getElementById('conta-bancaria-area');
  if (!area) return;
  const fornecedorId = document.getElementById('nf-fornecedor').value;
  const formaPagamento = document.getElementById('nf-forma-pagamento').value;
  area.innerHTML = renderContaBancariaArea(fornecedorId, formaPagamento, null);
}

export function renderClassificacaoArea(n) {
  if (!app.temRateio) {
    const ccOptions = n.pagador_id ? centrosParaPagador(n.pagador_id) : app.cadastros.centros_custo;
    const clOptions = n.centro_custo_id ? classesParaCentro(n.centro_custo_id) : [];
    const codOptions = n.classe_conta_id ? codigosParaClasse(n.classe_conta_id) : [];
    return `
    <div class="field">
      <label>Centro de custo</label>
      <select id="nf-centro-custo" required ${!n.pagador_id ? 'disabled' : ''}>${n.pagador_id ? selectOptions(ccOptions, n.centro_custo_id) : `<option value="">Selecione o pagador primeiro</option>`}</select>
    </div>
    <div class="grid2">
      <div class="field">
        <label>Classe da conta</label>
        <select id="nf-classe-conta" required ${!n.centro_custo_id ? 'disabled' : ''}>${n.centro_custo_id ? selectOptions(clOptions, n.classe_conta_id) : `<option value="">Selecione o centro de custo primeiro</option>`}</select>
      </div>
      <div class="field">
        <label>Código da classificação</label>
        <select id="nf-codigo-classificacao" ${!n.classe_conta_id ? 'disabled' : ''}>${n.classe_conta_id ? (codOptions.length ? selectOptions(codOptions, n.codigo_classificacao_id) : `<option value="">Sem subdivisão para esta classe</option>`) : `<option value="">Selecione a classe da conta primeiro</option>`}</select>
      </div>
    </div>`;
  }
  return `<div class="field"><label>Rateio entre centros de custo</label><div id="rateio-area">${renderRateioArea()}</div></div>`;
}

export function refreshClassificacaoArea() {
  const area = document.getElementById('classificacao-area');
  if (!area) return;
  area.innerHTML = renderClassificacaoArea({});
  bindClassificacaoArea();
}

export function bindClassificacaoArea() {
  if (!app.temRateio) bindClassificacaoSelectsCascade();
  else bindRateioArea();
}

export function bindClassificacaoSelectsCascade() {
  const selCentro = document.getElementById('nf-centro-custo');
  const selClasse = document.getElementById('nf-classe-conta');
  const selCodigo = document.getElementById('nf-codigo-classificacao');
  if (!selCentro) return;
  selCentro.onchange = () => {
    if (selCentro.value) { selClasse.disabled = false; selClasse.innerHTML = selectOptions(classesParaCentro(selCentro.value)); }
    else { selClasse.disabled = true; selClasse.innerHTML = `<option value="">Selecione o centro de custo primeiro</option>`; }
    selCodigo.disabled = true; selCodigo.innerHTML = `<option value="">Selecione a classe da conta primeiro</option>`;
  };
  selClasse.onchange = () => {
    if (selClasse.value) {
      const opts = codigosParaClasse(selClasse.value);
      selCodigo.disabled = false;
      selCodigo.innerHTML = opts.length ? selectOptions(opts) : `<option value="">Sem subdivisão para esta classe</option>`;
    } else { selCodigo.disabled = true; selCodigo.innerHTML = `<option value="">Selecione a classe da conta primeiro</option>`; }
  };
}

/* ---- Rateio ---- */
export function renderRateioArea() {
  const brutoEl = document.getElementById('nf-valor');
  const bruto = brutoEl ? (parseFloat(brutoEl.value) || 0) : 0;
  const alocado = app.rateioTemp.reduce((s, r) => s + r.valor, 0);
  const saldo = +(bruto - alocado).toFixed(2);
  let html = `<div class="rateio-box">`;
  if (app.rateioTemp.length > 0) {
    html += `<table class="data-tbl" style="margin-bottom:10px;"><thead><tr><th>Valor</th><th>Centro de custo</th><th>Classe da conta</th><th>Código</th><th>Descrição</th><th></th></tr></thead><tbody>`;
    app.rateioTemp.forEach((r, i) => {
      const lbl = resolverLabelsRateio(r);
      html += `<tr><td class="mono">${fmtMoney(r.valor)}</td><td>${escapeHtml(lbl.centro_label)}</td><td>${escapeHtml(lbl.classe_label)}</td><td>${escapeHtml(lbl.codigo_label || '—')}</td><td>${escapeHtml(r.descricao || '')}</td><td><button type="button" class="btn btn-ghost btn-sm" data-rateio-remove="${i}">Remover</button></td></tr>`;
    });
    html += `</tbody></table>`;
  }
  html += `<div class="field-hint" style="margin-bottom:8px;">Valor bruto: <b class="mono">${fmtMoney(bruto)}</b> · Já rateado: <b class="mono">${fmtMoney(alocado)}</b> · Saldo a ratear: <b class="mono">${fmtMoney(saldo)}</b></div>`;
  if (saldo > 0.004) {
    const pagadorId = document.getElementById('nf-pagador') ? document.getElementById('nf-pagador').value : '';
    const centrosDisponiveis = pagadorId ? centrosParaPagador(pagadorId) : [];
    html += `
      <div class="grid2">
        <div class="field"><label>Valor do rateio</label><input type="number" step="0.01" min="0" max="${saldo}" id="rt-valor"></div>
        <div class="field"><label>Centro de custo</label><select id="rt-centro" ${!pagadorId ? 'disabled' : ''}>${pagadorId ? selectOptions(centrosDisponiveis) : `<option value="">Selecione o pagador da nota primeiro</option>`}</select></div>
      </div>
      <div class="grid2">
        <div class="field"><label>Classe da conta</label><select id="rt-classe" disabled><option value="">Selecione o centro de custo do rateio primeiro</option></select></div>
        <div class="field"><label>Código da classificação</label><select id="rt-codigo" disabled><option value="">Selecione a classe da conta primeiro</option></select></div>
      </div>
      <div class="field"><label>Descrição desta linha</label><input id="rt-descricao" placeholder="ex: parte referente à loja X"></div>
      <button type="button" class="btn btn-amber btn-sm" id="btn-rateio-incluir">Incluir rateio</button>
    `;
  } else {
    html += `<div class="field-hint">Valor totalmente rateado — soma das linhas igual ao valor bruto.</div>`;
  }
  html += `</div>`;
  return html;
}

export function refreshRateioArea() {
  const area = document.getElementById('rateio-area');
  if (!area) return;
  area.innerHTML = renderRateioArea();
  bindRateioArea();
}

export function bindRateioArea() {
  const rtCentro = document.getElementById('rt-centro');
  if (rtCentro) rtCentro.onchange = () => {
    const rtClasse = document.getElementById('rt-classe');
    const rtCodigo = document.getElementById('rt-codigo');
    if (!rtCentro.value) { rtClasse.disabled = true; rtClasse.innerHTML = `<option value="">Selecione o centro de custo do rateio primeiro</option>`; }
    else { rtClasse.disabled = false; rtClasse.innerHTML = selectOptions(classesParaCentro(rtCentro.value)); }
    rtCodigo.disabled = true; rtCodigo.innerHTML = `<option value="">Selecione a classe da conta primeiro</option>`;
  };
  const rtClasse = document.getElementById('rt-classe');
  if (rtClasse) rtClasse.onchange = () => {
    const rtCodigo = document.getElementById('rt-codigo');
    if (!rtClasse.value) { rtCodigo.disabled = true; rtCodigo.innerHTML = `<option value="">Selecione a classe da conta primeiro</option>`; return; }
    const opts = codigosParaClasse(rtClasse.value);
    rtCodigo.disabled = false;
    rtCodigo.innerHTML = opts.length ? selectOptions(opts) : `<option value="">Sem subdivisão para esta classe</option>`;
  };
  const bi = document.getElementById('btn-rateio-incluir');
  if (bi) bi.onclick = () => {
    const valor = parseFloat(document.getElementById('rt-valor').value);
    const classeId = document.getElementById('rt-classe').value;
    const centroId = document.getElementById('rt-centro').value;
    const codigoId = document.getElementById('rt-codigo').value;
    const descricao = document.getElementById('rt-descricao').value.trim();
    const bruto = parseFloat(document.getElementById('nf-valor').value) || 0;
    const alocado = app.rateioTemp.reduce((s, r) => s + r.valor, 0);
    const saldo = bruto - alocado;
    if (!valor || valor <= 0) { alert('Informe um valor de rateio maior que zero.'); return; }
    if (!classeId || !centroId) { alert('Selecione a classe da conta e o centro de custo do rateio.'); return; }
    if (valor > saldo + 0.001) { alert('O valor do rateio não pode ser maior que o saldo disponível.'); return; }
    app.rateioTemp.push({ id: uid(), valor, descricao, classe_conta_id: classeId, centro_custo_id: centroId, codigo_classificacao_id: codigoId || null });
    refreshRateioArea();
  };
  document.querySelectorAll('[data-rateio-remove]').forEach(b => {
    b.onclick = () => { app.rateioTemp.splice(parseInt(b.dataset.rateioRemove), 1); refreshRateioArea(); };
  });
}

/* ---- Modais de ação (aprovar/reprovar/lançar/pagar/pendência) ---- */
export function formAprovar() {
  return `
  <div class="field"><label>Comentário (opcional)</label><textarea id="input-comentario" rows="2"></textarea></div>
  <div class="modal-actions">
    <button class="btn btn-brand" id="confirmar-aprovar">Aprovar nota</button>
    <button class="btn btn-ghost" id="modal-cancel">Cancelar</button>
  </div>`;
}
export function formReprovar() {
  return `
  <div class="field"><label>Motivo</label><textarea id="input-motivo" rows="3" required placeholder="Ex: faltou o boleto, valor diverge do contrato..."></textarea></div>
  <div class="modal-actions">
    <button class="btn btn-alert" id="confirmar-reprovar">Reprovar e devolver ao departamento</button>
    <button class="btn btn-ghost" id="modal-cancel">Cancelar</button>
  </div>`;
}
export function formLancarGroup() {
  return `
  <div class="field"><label>Número do chamado (Acelerato)</label><input id="input-chamado" required></div>
  <div class="modal-actions">
    <button class="btn btn-brand" id="confirmar-lancar">Confirmar lançamento e abertura de chamado</button>
    <button class="btn btn-ghost" id="modal-cancel">Cancelar</button>
  </div>`;
}
export function formConfirmarPagamento() {
  const today = new Date().toISOString().slice(0, 10);
  return `
  <div class="field"><label>Data do pagamento</label><input id="input-data-pgto" type="date" value="${today}" required></div>
  <div class="modal-actions">
    <button class="btn btn-good" id="confirmar-pagamento">Confirmar pagamento</button>
    <button class="btn btn-ghost" id="modal-cancel">Cancelar</button>
  </div>`;
}
export function formPendencia() {
  return `
  <div class="field"><label>Motivo da pendência</label><textarea id="input-motivo-pend" rows="3" required placeholder="Ex: boleto vencido, dados bancários incorretos, nota duplicada..."></textarea></div>
  <div class="modal-actions">
    <button class="btn btn-alert" id="confirmar-pendencia">Marcar como pendência</button>
    <button class="btn btn-ghost" id="modal-cancel">Cancelar</button>
  </div>`;
}
export function formResolverPendencia() {
  return `
  <div class="field"><label>Como foi resolvido</label><textarea id="input-resolucao" rows="3" required></textarea></div>
  <div class="modal-actions">
    <button class="btn btn-good" id="confirmar-resolver">Resolver pendência</button>
    <button class="btn btn-ghost" id="modal-cancel">Cancelar</button>
  </div>`;
}

/* ---- Detalhe da nota ---- */
export function renderDetalhe(id) {
  const n = app.notas.find(x => x.id === id);
  if (!n) return '<p>Nota não encontrada.</p>';
  const lbl = resolverLabelsNota(n);
  return `
  <div class="status-chip" style="background:${STATUS_SOFT[n.status] || 'var(--gray-soft)'}; color:${STATUS_COLOR[n.status] || 'var(--ink-soft)'}; margin-bottom:10px; display:inline-block;">${n.status === 'rascunho' ? 'Rascunho' : STATUS_LABEL[n.status]}</div>
  ${n.pendente ? `<span class="pend-badge">⚠ Pendência: ${escapeHtml(n.motivo_pendencia || '')}</span>` : ''}
  ${n.status === 'rascunho' ? '' : pipeline(n.status)}
  <hr class="divider">
  <div class="detail-grid">
    <div><div class="k">Data de emissão</div><div class="v">${fmtDate(n.data_emissao)}</div></div>
    <div><div class="k">Data de vencimento</div><div class="v">${fmtDate(n.vencimento)}</div></div>
    <div><div class="k">Pagador</div><div class="v">${escapeHtml(lbl.pagador_label)}</div></div>
    <div><div class="k">Número da NF</div><div class="v mono">${escapeHtml(n.numero_nota || '—')}</div></div>
    <div><div class="k">Valor bruto</div><div class="v mono">${fmtMoney(n.valor_bruto)}</div></div>
    <div><div class="k">Fornecedor</div><div class="v">${escapeHtml(lbl.fornecedor_label)}</div></div>
    <div><div class="k">Forma de pagamento</div><div class="v">${escapeHtml(n.forma_pagamento || '—')}</div></div>
    <div><div class="k">Conta bancária</div><div class="v">${escapeHtml(lbl.conta_bancaria_label || '—')}</div></div>
    <div><div class="k">Classificação</div><div class="v">${escapeHtml(n.classificacao || '—')}</div></div>
    <div><div class="k">Setor solicitante</div><div class="v">${escapeHtml(n.setor || '—')}</div></div>
    ${!n.tem_rateio ? `
    <div><div class="k">Código da classificação</div><div class="v">${escapeHtml(lbl.codigo_classificacao_label || '—')}</div></div>
    <div><div class="k">Classe da conta</div><div class="v">${escapeHtml(lbl.classe_conta_label || '—')}</div></div>
    <div><div class="k">Centro de custo</div><div class="v">${escapeHtml(lbl.centro_custo_label || '—')}</div></div>
    ` : ''}
    <div><div class="k">Solicitado por</div><div class="v">${escapeHtml(nomeUsuario(n.criado_por))}</div></div>
    <div><div class="k">Anexos (ref.)</div><div class="v">${(n.anexos && n.anexos.length) ? escapeHtml(n.anexos.join(', ')) : '—'}</div></div>
    <div><div class="k">Nº chamado Acelerato</div><div class="v mono">${n.numero_chamado ? escapeHtml(n.numero_chamado) : '—'}</div></div>
    <div><div class="k">Data do pagamento</div><div class="v">${fmtDate(n.data_pagamento)}</div></div>
  </div>
  ${n.descricao ? `<div class="field"><div class="k">Descrição geral</div><div class="v">${escapeHtml(n.descricao)}</div></div>` : ''}
  ${(n.tem_rateio && n.rateios && n.rateios.length > 0) ? `
  <hr class="divider">
  <h3 style="font-size:14px;">Rateio entre centros de custo</h3>
  <table class="data-tbl" style="margin-bottom:8px;">
    <thead><tr><th>Valor</th><th>Centro de custo</th><th>Classe da conta</th><th>Código</th><th>Descrição</th></tr></thead>
    <tbody>
      ${n.rateios.map(r => { const rl = resolverLabelsRateio(r); return `<tr><td class="mono">${fmtMoney(r.valor)}</td><td>${escapeHtml(rl.centro_label)}</td><td>${escapeHtml(rl.classe_label)}</td><td>${escapeHtml(rl.codigo_label || '—')}</td><td>${escapeHtml(r.descricao || '—')}</td></tr>`; }).join('')}
    </tbody>
  </table>
  ` : ''}
  <hr class="divider">
  <h3 style="font-size:14px;">Histórico</h3>
  <div class="timeline">
    ${n.historico.slice().reverse().map(h => `
      <div class="tl-item">
        <div class="tl-act">${escapeHtml(h.acao)}</div>
        <div class="tl-meta">${escapeHtml(nomeUsuario(h.usuario_id))} · ${fmtDateTime(h.criado_em)}</div>
        ${h.detalhe ? `<div class="tl-detail">${escapeHtml(h.detalhe)}</div>` : ''}
      </div>`).join('')}
  </div>
  <hr class="divider">
  ${renderDetailActions(n)}
  `;
}

export function renderDetailActions(n) {
  const u = app.usuario;
  const r = u.role;
  const isOwner = n.criado_por === u.id;
  let actions = [];
  if (r === 'departamento' && isOwner && n.status === 'rascunho') {
    actions.push(`<button class="btn btn-amber" data-action="editar_reenviar" data-id="${n.id}">Continuar editando</button>`);
  }
  if (r === 'departamento' && isOwner && n.status === 'lancado' && n.pendente) {
    actions.push(`<button class="btn btn-amber" data-action="editar_reenviar" data-id="${n.id}">Editar e reenviar</button>`);
  }
  if (r === 'gestor' && n.status === 'lancado' && !n.pendente && n.setor === u.setor) {
    actions.push(`<button class="btn btn-brand" data-action="aprovar" data-id="${n.id}">Aprovar</button>`);
    actions.push(`<button class="btn btn-alert" data-action="reprovar" data-id="${n.id}">Reprovar</button>`);
  }
  if (r === 'contas_a_pagar' && n.status === 'aprovado' && !n.pendente) {
    actions.push(`<button class="btn btn-brand" data-action="lancar_group" data-id="${n.id}">Lançar no Group e abrir chamado</button>`);
    actions.push(`<button class="btn btn-alert" data-action="marcar_pendencia" data-id="${n.id}">Marcar pendência</button>`);
  }
  if (r === 'contas_a_pagar' && n.status === 'em_pagamento' && !n.pendente) {
    actions.push(`<button class="btn btn-good" data-action="confirmar_pagamento" data-id="${n.id}">Confirmar pagamento</button>`);
    actions.push(`<button class="btn btn-alert" data-action="marcar_pendencia" data-id="${n.id}">Marcar pendência</button>`);
  }
  if (r === 'contas_a_pagar' && n.pendente && (n.status === 'aprovado' || n.status === 'em_pagamento')) {
    actions.push(`<button class="btn btn-good" data-action="resolver_pendencia" data-id="${n.id}">Resolver pendência</button>`);
  }
  if (actions.length === 0) return `<p style="color:var(--ink-soft); font-size:13px;">Nenhuma ação disponível para o seu perfil nesta etapa.</p>`;
  return `<div class="modal-actions">${actions.join('')}</div>`;
}
