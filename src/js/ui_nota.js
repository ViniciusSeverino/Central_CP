// src/js/ui_nota.js
import {
  app, escapeHtml, fmtMoney, fmtDate, fmtDateTime, labelOf, selectOptions,
  centrosParaPagador, classesParaCentro, codigosParaClasse, resolverLabelsNota, resolverLabelsRateio,
  nomeUsuario, STATUS_LABEL, STATUS_COLOR, STATUS_SOFT, uid, ehSuperUsuario, podeAgirComo, fmtCompetencia,
  SETORES, contratoVencido,
} from './state.js';
import { pipeline } from './ui.js';
import { showToast } from './toast.js';
import { calcularVencimentoComum } from './vencimento_comum.js';
import { TIPO_DESPESA_LABEL, statusPrazo } from './prazo_despesa.js';
import { tituloChamado, linhasChamado, totalChamado } from './chamado_texto.js';

// Path salvo é "{notaId}/{timestamp}-{nome}" — pra exibição, mostra só o
// nome original do arquivo.
function nomeExibicaoAnexo(caminho) {
  const arquivo = caminho.split('/').pop() || caminho;
  return arquivo.replace(/^\d+-/, '');
}

// Área de anexos tem seu próprio container (#anexos-area) pra poder ser
// re-renderizada sozinha a cada arquivo escolhido/removido, sem perder o
// que já foi preenchido no resto do formulário — mesmo padrão de
// renderClassificacaoArea/renderContaBancariaArea.
export function renderAnexosArea(n) {
  const existentes = (n.anexos || []).filter(p => !app.anexosRemovidos.includes(p));
  // p (o path do Storage) vai direto no atributo sem escapeHtml — é um
  // identificador interno montado só com [a-zA-Z0-9._-] (ver sanitização
  // em db.js uploadAnexo), não texto de exibição livre de usuário; mesmo
  // caso do g.key em ui.js.
  return `
    ${existentes.length > 0 ? `
    <ul class="anexos-lista">
      ${existentes.map(p => `<li><span>${escapeHtml(nomeExibicaoAnexo(p))}</span> <a href="#" data-remover-anexo="${p}">remover</a></li>`).join('')}
    </ul>` : ''}
    ${app.anexosNovos.length > 0 ? `
    <ul class="anexos-lista">
      ${app.anexosNovos.map((f, i) => `<li><span>${escapeHtml(f.name)} <em>(novo, envia ao salvar)</em></span> <a href="#" data-remover-anexo-novo="${i}">remover</a></li>`).join('')}
    </ul>` : ''}
    <input type="file" id="nf-anexos-input" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*">
    <div class="field-hint">PDF ou imagem, até 15MB por arquivo. Ao salvar, todos os arquivos viram um PDF único, renomeado no padrão da empresa.</div>
  `;
}

export function formNovaNota(editing, isCorrecao) {
  const n = editing || {};
  const pag = app.cadastros.pagadores, forn = app.cadastros.fornecedores;
  const hint = (key, label) => (app.cadastros[key].length === 0 ? `<div class="field-hint">Nenhum ${label} cadastrado ainda. <a href="#" data-goto-cadastros="${key}">Cadastrar agora</a></div>` : '');
  app.temRateio = editing ? !!n.tem_rateio : false;
  const salvarLabel = isCorrecao ? 'Corrigir e devolver' : (editing && editing.status !== 'rascunho' ? 'Reenviar para aprovação' : 'Lançar nota no Central CP');
  // Vencimento de pagamento comum é travado numa quarta-feira fixa por
  // semana de lançamento (ver vencimento_comum.js) -- só nota nova (não
  // edição/correção) recebe o valor calculado, e só enquanto o tipo de
  // despesa for "padrão". Escolher qualquer outro tipo (mesma
  // classificação que já determina o prazo D+X do chamado, ver
  // prazo_despesa.js) libera o vencimento pra data livre. Correção de
  // pendência mantém o vencimento e o tipo que a nota já tinha.
  const tipoDespesaAtual = n.tipo_despesa_prazo || 'padrao';
  const vencimentoTravado = !editing && tipoDespesaAtual === 'padrao';
  const vencimentoInicial = n.vencimento ? n.vencimento.slice(0, 10) : (vencimentoTravado ? calcularVencimentoComum() : '');
  return `
  <div id="box-nota">
    ${!editing ? `
    <div class="field">
      <label>Tipo de despesa</label>
      <select id="nf-tipo-despesa">
        ${Object.entries(TIPO_DESPESA_LABEL).map(([valor, label]) => `<option value="${valor}" ${tipoDespesaAtual === valor ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}
      </select>
      <div class="field-hint">Define o prazo de pagamento do chamado (D+30 padrão, D+10, D+7, D+3 útil ou D+1 útil, regra do CSC). "Padrão" também trava o vencimento na quarta-feira do lote semanal; qualquer outro tipo libera a data.</div>
    </div>` : ''}
    <div class="grid2">
      <div class="field"><label>Data de emissão</label><input id="nf-emissao" type="date" required value="${n.data_emissao ? n.data_emissao.slice(0, 10) : ''}"></div>
      <div class="field"><label>Data de vencimento</label><input id="nf-vencimento" type="date" required value="${vencimentoInicial}" ${vencimentoTravado ? 'readonly' : ''}></div>
    </div>
    <div class="grid2">
      <div class="field"><label>Competência</label><input id="nf-competencia" type="month" required value="${n.competencia ? n.competencia.slice(0, 7) : ''}"></div>
      <div class="field"><label>N° da NF</label><input id="nf-numero" required value="${escapeHtml(n.numero_nota || '')}"></div>
    </div>
    <div class="field"><label>Valor bruto (R$)</label><input id="nf-valor" type="number" step="0.01" min="0" required value="${n.valor_bruto || ''}"></div>
    ${!app.usuario.setor ? `
    <div class="field">
      <label>Setor</label>
      <select id="nf-setor" required>
        <option value="">Selecione...</option>
        ${SETORES.map(s => `<option value="${s}" ${n.setor === s ? 'selected' : ''}>${s}</option>`).join('')}
      </select>
      <div class="field-hint">Você não tem um setor fixo — escolha de qual setor é essa nota.</div>
    </div>` : ''}
    <div class="field">
      <label>Pagador</label>
      <select id="nf-pagador" required>${selectOptions(pag, n.pagador_id)}</select>
      ${hint('pagadores', 'pagador')}
    </div>
    <div class="field">
      <label>Fornecedor</label>
      <div class="combo">
        <input class="combo-input" id="nf-fornecedor-busca" autocomplete="off" placeholder="Digite ao menos 2 letras para buscar entre ${forn.length} fornecedores..." value="${n.fornecedor_id ? escapeHtml(labelOf(forn.find(f => f.id === n.fornecedor_id))) : ''}">
        <input type="hidden" id="nf-fornecedor" value="${n.fornecedor_id || ''}">
        <div class="combo-list" id="nf-fornecedor-list" style="display:none;"></div>
      </div>
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
      <label>Tipo de contratação</label>
      <select id="nf-tipo-contratacao">
        <option value="">Não informado</option>
        <option value="sob_demanda" ${n.tipo_contratacao === 'sob_demanda' ? 'selected' : ''}>Sob demanda</option>
        <option value="mensal" ${n.tipo_contratacao === 'mensal' ? 'selected' : ''}>Mensal</option>
      </select>
      <div class="field-hint">Preenche a coluna "Contrato" da tabela de abertura de chamado pro CSC.</div>
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
      <label>Arquivos anexos</label>
      <div id="anexos-area">${renderAnexosArea(n)}</div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-brand" type="button" id="btn-salvar-nota">${salvarLabel}</button>
      ${isCorrecao ? '' : `<button class="btn btn-ghost" type="button" id="btn-salvar-rascunho">Salvar como rascunho</button>`}
      <button class="btn btn-ghost" type="button" id="modal-cancel">Cancelar</button>
    </div>
  </div>`;
}

// Combobox de busca do fornecedor: input de texto + lista filtrada, com um
// input escondido (#nf-fornecedor) guardando o id selecionado — mantém a
// mesma interface que o resto do código já espera (coletarPayload,
// refreshContaBancariaArea etc. leem #nf-fornecedor normalmente).
export function bindFornecedorCombo(onSelect) {
  const input = document.getElementById('nf-fornecedor-busca');
  const hidden = document.getElementById('nf-fornecedor');
  const list = document.getElementById('nf-fornecedor-list');
  if (!input || !hidden || !list) return;

  function renderList(query) {
    const q = query.trim().toLowerCase();
    if (q.length < 2) { list.style.display = 'none'; list.innerHTML = ''; return; }
    const matches = app.cadastros.fornecedores.filter(f => f.nome.toLowerCase().includes(q)).slice(0, 30);
    list.innerHTML = matches.length
      ? matches.map(f => `<div class="combo-item" data-id="${f.id}">${escapeHtml(f.nome)}</div>`).join('')
      : `<div class="combo-empty">Nenhum fornecedor encontrado.</div>`;
    list.style.display = 'block';
  }

  input.oninput = () => { hidden.value = ''; renderList(input.value); };
  input.onfocus = () => { if (input.value.trim().length >= 2) renderList(input.value); };
  input.onblur = () => setTimeout(() => { list.style.display = 'none'; }, 150);
  // mousedown (não click) para disparar antes do blur do input esconder a lista
  list.onmousedown = (e) => {
    const item = e.target.closest('.combo-item');
    if (!item) return;
    const forn = app.cadastros.fornecedores.find(f => f.id === item.dataset.id);
    if (!forn) return;
    hidden.value = forn.id;
    input.value = labelOf(forn);
    list.style.display = 'none';
    if (onSelect) onSelect();
  };
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
  const pagadorEl = document.getElementById('nf-pagador');
  area.innerHTML = renderClassificacaoArea({ pagador_id: pagadorEl ? pagadorEl.value : '' });
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
    if (!valor || valor <= 0) { showToast('Informe um valor de rateio maior que zero.'); return; }
    if (!classeId || !centroId) { showToast('Selecione a classe da conta e o centro de custo do rateio.'); return; }
    if (valor > saldo + 0.001) { showToast('O valor do rateio não pode ser maior que o saldo disponível.'); return; }
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
export function formPendencia() {
  return `
  <div class="field"><label>Motivo da pendência</label><textarea id="input-motivo-pend" rows="3" required placeholder="Ex: boleto vencido, dados bancários incorretos, nota duplicada, chamado recusado pelo CSC..."></textarea></div>
  <div class="modal-actions">
    <button class="btn btn-alert" id="confirmar-pendencia">Marcar como pendência</button>
    <button class="btn btn-ghost" id="modal-cancel">Cancelar</button>
  </div>`;
}

// ---- Ações em lote do contas a pagar: cada modal opera sobre a lista de
// ids do grupo (pagador + vencimento) inteiro, mas sempre mostra as notas
// individualmente para conferência antes de confirmar.
function renderListaNotasLote(ids) {
  const notas = ids.map(id => app.notas.find(n => n.id === id)).filter(Boolean);
  const total = notas.reduce((s, n) => s + (Number(n.valor_bruto) || 0), 0);
  return `
  <table class="data-tbl" style="margin-bottom:14px;">
    <thead><tr><th>Fornecedor</th><th>NF</th><th>Valor</th></tr></thead>
    <tbody>
      ${notas.map(n => { const lbl = resolverLabelsNota(n); return `<tr><td>${escapeHtml(lbl.fornecedor_label)}</td><td class="mono">${escapeHtml(n.numero_nota || '—')}</td><td class="mono">${fmtMoney(n.valor_bruto)}</td></tr>`; }).join('')}
    </tbody>
  </table>
  <div class="field-hint" style="margin-bottom:14px;">${notas.length} nota(s) · Total ${fmtMoney(total)}</div>
  `;
}

export function formLoteLancarGroup(ids) {
  return `
  ${renderListaNotasLote(ids)}
  <div class="field"><label>Código do lançamento no Group</label><input id="input-lancamento-group" required></div>
  <div class="modal-actions">
    <button class="btn btn-brand" id="confirmar-lote-lancar-group">Confirmar lançamento no Group</button>
    <button class="btn btn-ghost" id="modal-cancel">Cancelar</button>
  </div>`;
}

export function formLoteAbrirChamado(ids) {
  return `
  ${renderListaNotasLote(ids)}
  <button type="button" class="btn btn-ghost btn-sm" id="btn-baixar-zip-chamado" style="margin-bottom:14px;">Baixar anexos (.zip)</button>
  <button type="button" class="btn btn-ghost btn-sm" id="btn-gerar-tabela-chamado" style="margin-bottom:14px;">Gerar título e tabela do chamado</button>
  <div id="tabela-chamado-area" style="display:none; margin-bottom:14px;"></div>
  <div class="field"><label>Número do chamado (Acelerato)</label><input id="input-chamado" required></div>
  <div class="modal-actions">
    <button class="btn btn-brand" id="confirmar-lote-abrir-chamado">Confirmar abertura do chamado</button>
    <button class="btn btn-ghost" id="modal-cancel">Cancelar</button>
  </div>`;
}

// Título (campo copiável) + tabela padrão do CSC (documento WE9), prontos
// pra copiar e colar na descrição do chamado no Freshdesk -- ver
// chamado_texto.js pras regras de cada coluna.
export function renderTabelaChamado(ids) {
  const titulo = tituloChamado(ids);
  const linhas = linhasChamado(ids);
  const total = totalChamado(linhas);
  return `
  <div class="field">
    <label>Título do chamado</label>
    <div style="display:flex; gap:8px;">
      <input id="chamado-titulo-texto" readonly value="${escapeHtml(titulo)}" style="flex:1;">
      <button type="button" class="btn btn-ghost btn-sm" id="btn-copiar-titulo-chamado">Copiar título</button>
    </div>
  </div>
  <div class="tbl-wrap">
    <table class="data-tbl" id="tabela-chamado-conteudo">
      <thead><tr>
        <th>Vencimento Net Empresa</th><th>Vencimento Original</th><th>Data de Emissão (NF)</th><th>Nº (NF)</th>
        <th>PF/PJ</th><th>Contrato</th><th>Fornecedor/Razão Social</th><th>Descrição</th><th>Canal de Pagamento</th><th>Débito</th>
      </tr></thead>
      <tbody>
        ${linhas.map(l => `<tr>
          <td class="mono">${l.vencimentoNetEmpresa}</td><td class="mono">${l.vencimentoOriginal}</td><td class="mono">${l.dataEmissao}</td>
          <td class="mono">${escapeHtml(l.numeroNf)}</td><td class="mono">${l.pfPj}</td><td class="mono">${l.contrato}</td>
          <td>${escapeHtml(l.fornecedor)}</td><td>${escapeHtml(l.descricao)}</td><td class="mono">${l.canalPagamento}</td>
          <td class="mono">${fmtMoney(l.debito)}</td>
        </tr>`).join('')}
        <tr><td colspan="9" style="text-align:right; font-weight:700;">TOTAL</td><td class="mono" style="font-weight:700;">${fmtMoney(total)}</td></tr>
      </tbody>
    </table>
  </div>
  <button type="button" class="btn btn-ghost btn-sm" id="btn-copiar-tabela-chamado" style="margin-top:8px;">Copiar tabela</button>
  `;
}

export function formLoteValidarCsc(ids) {
  return `
  ${renderListaNotasLote(ids)}
  <div class="field-hint" style="margin-bottom:14px;">Confirma que o CSC validou o pagamento destas notas. Se o CSC recusar alguma, use "Marcar pendência" na nota específica em vez de validar o grupo todo.</div>
  <div class="modal-actions">
    <button class="btn btn-brand" id="confirmar-lote-validar-csc">Confirmar validação do CSC</button>
    <button class="btn btn-ghost" id="modal-cancel">Cancelar</button>
  </div>`;
}

export function formLoteConfirmarPagamento(ids) {
  const today = new Date().toISOString().slice(0, 10);
  return `
  ${renderListaNotasLote(ids)}
  <div class="field"><label>Data do pagamento</label><input id="input-data-pgto" type="date" value="${today}" required></div>
  <div class="modal-actions">
    <button class="btn btn-good" id="confirmar-lote-confirmar-pagamento">Confirmar pagamento</button>
    <button class="btn btn-ghost" id="modal-cancel">Cancelar</button>
  </div>`;
}

// Indicador de prazo/atraso do chamado (D+X a partir de data_chamado,
// ver prazo_despesa.js) -- só faz sentido enquanto o CSC ainda não pagou;
// depois de pago ou cancelada, o prazo não importa mais.
function prazoIndicador(n) {
  if (!n.data_chamado || n.status === 'pago' || n.status === 'cancelada') return '';
  const st = statusPrazo(n.tipo_despesa_prazo, n.data_chamado);
  if (!st) return '';
  const texto = st.atrasado
    ? `atrasado há ${Math.abs(st.diasRestantes)} dia(s), prazo era ${fmtDate(st.limite)}`
    : `faltam ${st.diasRestantes} dia(s), prazo ${fmtDate(st.limite)}`;
  const cor = st.atrasado ? 'var(--alert)' : 'var(--ink-soft)';
  return ` <span class="field-hint" style="display:inline; color:${cor};">(${texto})</span>`;
}

/* ---- Detalhe da nota ---- */
export function renderDetalhe(id) {
  const n = app.notas.find(x => x.id === id);
  if (!n) return '<p>Nota não encontrada.</p>';
  const lbl = resolverLabelsNota(n);
  const fornDaNota = app.cadastros.fornecedores.find(x => x.id === n.fornecedor_id);
  const contratoDoFornecedorVencido = contratoVencido(fornDaNota, n.data_emissao);
  return `
  <div class="status-chip" style="background:${STATUS_SOFT[n.status] || 'var(--gray-soft)'}; color:${STATUS_COLOR[n.status] || 'var(--ink-soft)'}; margin-bottom:10px; display:inline-block;">${n.status === 'rascunho' ? 'Rascunho' : STATUS_LABEL[n.status]}</div>
  ${n.pendente ? `<span class="pend-badge">⚠ Pendência: ${escapeHtml(n.motivo_pendencia || '')}</span>` : ''}
  ${n.status === 'cancelada' ? `<p style="color:var(--alert); font-size:13px;"><strong>Cancelada</strong> por ${escapeHtml(nomeUsuario(n.cancelado_por))} em ${fmtDateTime(n.data_cancelamento)} — ${escapeHtml(n.motivo_cancelamento || '')}</p>` : ''}
  ${(n.status === 'rascunho' || n.status === 'cancelada') ? '' : pipeline(n.status)}
  <hr class="divider">
  <div class="detail-grid">
    <div><div class="k">Data de emissão</div><div class="v">${fmtDate(n.data_emissao)}</div></div>
    <div><div class="k">Data de vencimento</div><div class="v">${fmtDate(n.vencimento)} <span class="field-hint" style="display:inline;">(${n.pagamento_excecao ? 'exceção, data livre' : 'comum, quarta-feira travada'})</span></div></div>
    <div><div class="k">Tipo de despesa</div><div class="v">${escapeHtml(TIPO_DESPESA_LABEL[n.tipo_despesa_prazo] || TIPO_DESPESA_LABEL.padrao)}</div></div>
    <div><div class="k">Competência</div><div class="v">${fmtCompetencia(n.competencia)}</div></div>
    <div><div class="k">Pagador</div><div class="v">${escapeHtml(lbl.pagador_label)}</div></div>
    <div><div class="k">Número da NF</div><div class="v mono">${escapeHtml(n.numero_nota || '—')}</div></div>
    <div><div class="k">Valor bruto</div><div class="v mono">${fmtMoney(n.valor_bruto)}</div></div>
    <div><div class="k">Fornecedor</div><div class="v">${escapeHtml(lbl.fornecedor_label)}${contratoDoFornecedorVencido ? ` <span class="field-hint" style="display:inline; color:var(--alert);">(⚠ contrato vencido em ${fmtDate(fornDaNota.contrato_vigencia_fim)})</span>` : ''}</div></div>
    <div><div class="k">Forma de pagamento</div><div class="v">${escapeHtml(n.forma_pagamento || '—')}</div></div>
    <div><div class="k">Conta bancária</div><div class="v">${escapeHtml(lbl.conta_bancaria_label || '—')}</div></div>
    <div><div class="k">Classificação</div><div class="v">${escapeHtml(n.classificacao || '—')}</div></div>
    <div><div class="k">Tipo de contratação</div><div class="v">${n.tipo_contratacao === 'mensal' ? 'Mensal' : (n.tipo_contratacao === 'sob_demanda' ? 'Sob demanda' : '—')}</div></div>
    <div><div class="k">Setor solicitante</div><div class="v">${escapeHtml(n.setor || '—')}</div></div>
    ${!n.tem_rateio ? `
    <div><div class="k">Código da classificação</div><div class="v">${escapeHtml(lbl.codigo_classificacao_label || '—')}</div></div>
    <div><div class="k">Classe da conta</div><div class="v">${escapeHtml(lbl.classe_conta_label || '—')}</div></div>
    <div><div class="k">Centro de custo</div><div class="v">${escapeHtml(lbl.centro_custo_label || '—')}</div></div>
    ` : ''}
    <div><div class="k">Solicitado por</div><div class="v">${escapeHtml(nomeUsuario(n.criado_por))}</div></div>
    <div><div class="k">Anexos</div><div class="v">${n.anexo_arquivado_em
      ? `Arquivado localmente em ${fmtDate(n.anexo_arquivado_em)}`
      : ((n.anexos && n.anexos.length) ? n.anexos.map(p => `<a href="#" data-baixar-anexo="${p}">${escapeHtml(nomeExibicaoAnexo(p))}</a>`).join('<br>') : '—')
    }</div></div>
    <div><div class="k">Código lançamento Group</div><div class="v mono">${n.numero_lancamento_group ? escapeHtml(n.numero_lancamento_group) : '—'}</div></div>
    <div><div class="k">Data lançamento Group</div><div class="v">${fmtDate(n.data_lancamento_group)}</div></div>
    <div><div class="k">Nº chamado Acelerato</div><div class="v mono">${n.numero_chamado ? escapeHtml(n.numero_chamado) : '—'}</div></div>
    <div><div class="k">Data do chamado</div><div class="v">${fmtDate(n.data_chamado)}${prazoIndicador(n)}</div></div>
    <div><div class="k">Validado pelo CSC em</div><div class="v">${fmtDate(n.data_validacao_csc)}</div></div>
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

// Etapa atual -> ação do contas a pagar que a leva para a próxima etapa.
// Usado tanto pelos botões em lote (cabeçalho dos grupos, em ui.js) quanto
// pelo botão individual daqui do detalhe da nota (ids = [n.id] nesse caso).
const STAGE_ACTION_BY_STATUS = {
  aprovado:          { modal: 'lote_lancar_group',        label: 'Lançar no Group' },
  lancado_no_group:  { modal: 'lote_abrir_chamado',        label: 'Abrir chamado' },
  chamado_aberto:    { modal: 'lote_validar_csc',          label: 'Validar CSC' },
  validado_csc:      { modal: 'lote_confirmar_pagamento',  label: 'Confirmar pagamento' },
};

export function renderDetailActions(n) {
  const u = app.usuario;
  const r = u.role;
  const podeAgir = podeAgirComo(n.criado_por); // dono direto, ou delegado dele
  let actions = [];
  // "Dono" da nota pra fins de continuar/corrigir o próprio lançamento:
  // departamento (direto ou por delegação) OU administrador/
  // gerente_financeiro quando é quem lançou (agora que também lançam nota
  // do início ao fim, o rascunho/pendência deles precisa do mesmo caminho
  // de volta que o departamento sempre teve).
  const donoDoLancamento = (r === 'departamento' || ehSuperUsuario()) && podeAgir;
  if (donoDoLancamento && n.status === 'rascunho') {
    actions.push(`<button class="btn btn-amber" data-action="editar_reenviar" data-id="${n.id}">Continuar editando</button>`);
  }
  if (r === 'departamento' && podeAgir && n.status === 'lancado' && n.pendente) {
    actions.push(`<button class="btn btn-amber" data-action="editar_reenviar" data-id="${n.id}">Editar e reenviar</button>`);
  }
  // Pendência marcada em qualquer etapa depois de aprovada (pelo contas a
  // pagar, ou pelo CSC via recusa do chamado): quem lançou corrige os
  // dados e devolve, sem voltar pra fila de aprovação de novo.
  if (donoDoLancamento && n.pendente && n.status !== 'rascunho' && n.status !== 'lancado') {
    actions.push(`<button class="btn btn-amber" data-action="corrigir_pendencia" data-id="${n.id}">Corrigir e devolver</button>`);
  }
  // Aprovar/reprovar e as 4 ações do contas a pagar: contas_a_pagar sempre,
  // e administrador/gerente_financeiro (ou quem estiver cobrindo um deles
  // por delegação) têm acesso total — aprovam E executam.
  if (ehSuperUsuario() && n.status === 'lancado' && !n.pendente) {
    actions.push(`<button class="btn btn-brand" data-action="aprovar" data-id="${n.id}">Aprovar</button>`);
    actions.push(`<button class="btn btn-alert" data-action="reprovar" data-id="${n.id}">Reprovar</button>`);
  }
  if ((r === 'contas_a_pagar' || ehSuperUsuario()) && !n.pendente && STAGE_ACTION_BY_STATUS[n.status]) {
    const st = STAGE_ACTION_BY_STATUS[n.status];
    actions.push(`<button class="btn btn-brand" data-lote-action="${st.modal}" data-lote-ids="${n.id}">${st.label}</button>`);
    actions.push(`<button class="btn btn-alert" data-action="marcar_pendencia" data-id="${n.id}">Marcar pendência</button>`);
  }
  // Excluir de vez — só antes do Group (rascunho/aguardando aprovação/
  // aprovada), onde nada fora do Central CP referencia a nota ainda.
  // Departamento só o próprio rascunho (nunca chegou a ser enviado);
  // administrador/gerente_financeiro em qualquer uma das 3 etapas.
  const PRE_GROUP = ['rascunho', 'lancado', 'aprovado'];
  if (PRE_GROUP.includes(n.status) && ((r === 'departamento' && podeAgir && n.status === 'rascunho') || ehSuperUsuario())) {
    actions.push(`<button class="btn btn-alert" data-excluir-nota="${n.id}">Excluir</button>`);
  }
  // Cancelar — a partir de "lançado no Group", já existe um registro fora
  // do Central CP; em vez de apagar, marca como cancelada e mantém tudo
  // pra auditoria. Só administrador/gerente_financeiro, e nunca numa nota
  // já paga (o banco também barra isso, ver bloquear_cancelamento_de_paga).
  if (ehSuperUsuario() && ['lancado_no_group', 'chamado_aberto', 'validado_csc'].includes(n.status)) {
    actions.push(`<button class="btn btn-alert" data-action="cancelar_lancamento" data-id="${n.id}">Cancelar lançamento</button>`);
  }
  if (actions.length === 0) return `<p style="color:var(--ink-soft); font-size:13px;">Nenhuma ação disponível para o seu perfil nesta etapa.</p>`;
  return `<div class="modal-actions">${actions.join('')}</div>`;
}

export function formCancelarLancamento() {
  return `
  <div class="field"><label>Motivo do cancelamento</label><textarea id="input-motivo-cancelamento" rows="3" required placeholder="Ex: nota emitida por engano, fornecedor errado, duplicidade..."></textarea></div>
  <div class="field-hint" style="margin-bottom:14px;">A nota sai das filas ativas, mas continua visível em "Todas as notas" pra auditoria — não é possível reverter o cancelamento.</div>
  <div class="modal-actions">
    <button class="btn btn-alert" id="confirmar-cancelar-lancamento">Cancelar lançamento</button>
    <button class="btn btn-ghost" id="modal-cancel">Voltar</button>
  </div>`;
}
