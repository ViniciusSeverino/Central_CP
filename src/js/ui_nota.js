// src/js/ui_nota.js
import {
  app, escapeHtml, fmtMoney, fmtDate, fmtDateTime, labelOf, selectOptions,
  centrosParaPagador, classesParaCentro, codigosParaClasse, resolverLabelsNota, resolverLabelsRateio,
  nomeUsuario, STATUS_LABEL, STATUS_COLOR, STATUS_SOFT, uid, ehSuperUsuario, podeAgirComo, fmtCompetencia,
  SETORES, contratoVencido, TIPO_IMPOSTO_LABEL,
} from './state.js';
import { pipeline } from './ui.js';
import { showToast } from './toast.js';
import { calcularVencimentoComum } from './vencimento_comum.js';
import { TIPO_DESPESA_LABEL, TIPO_DESPESA_LABEL_CURTO, statusPrazo } from './prazo_despesa.js';
import { tituloChamado, linhasChamado, totalChamado } from './chamado_texto.js';
import { TIPO_DOCUMENTO_LABEL } from './leitor_documentos.js';
import { auditarAnexos } from './documentos_obrigatorios.js';
import { perguntasPendentes } from './aprendizado_extracao.js';

// Path salvo é "{notaId}/{timestamp}-{nome}" — pra exibição, mostra só o
// nome original do arquivo.
function nomeExibicaoAnexo(caminho) {
  const arquivo = caminho.split('/').pop() || caminho;
  return arquivo.replace(/^\d+-/, '');
}

// Área de anexos tem seu próprio container (#anexos-area) pra poder ser
// re-renderizada sozinha a cada arquivo escolhido/removido, sem perder o
// que já foi preenchido no resto do formulário — mesmo padrão de
// renderClassificacaoArea/renderContaBancariaArea. payloadParcial (campos
// já preenchidos no formulário) é opcional -- quando informado, mostra
// também a auditoria de anexos (documento WE9) logo abaixo da lista. No
// formulário individual essa auditoria vira o painel lateral (ver
// renderPainelAprendizado) em vez de aparecer aqui -- opcoes.painelLateral
// (default true) desliga o inline nesse caso.
export function renderAnexosArea(n, payloadParcial, opcoes) {
  const existentes = (n.anexos || []).filter(p => !app.anexosRemovidos.includes(p));
  const mostraInline = payloadParcial && !(opcoes && opcoes.painelLateral);
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
    ${mostraInline ? renderAuditoriaAnexos(payloadParcial, opcoes) : ''}
  `;
}

// Leitor de documentos (documento WE9 -- "auditoria do que a pessoa
// preencheu e quais documentos anexou"): só analisa os anexos NOVOS desta
// sessão (app.anexosNovos/app.anexosAnalises) -- um anexo já salvo antes
// precisaria ser baixado do Storage de novo pra reanalisar, o que não
// vale o custo aqui; a auditoria é sobre o que está sendo incluído agora.
export function renderAuditoriaAnexos(payloadParcial, opcoes) {
  const permitePreencher = !opcoes || opcoes.permitePreencher !== false;
  const analisesProntas = app.anexosAnalises
    .filter(a => a && a.status === 'pronto' && a.resultado)
    .map(a => a.resultado);
  const auditoria = auditarAnexos(payloadParcial, analisesProntas);

  let linhas = '';
  app.anexosNovos.forEach((f, i) => {
    const a = app.anexosAnalises[i];
    if (!a || a.status === 'analisando') {
      linhas += `<div class="auditoria-linha">${escapeHtml(f.name)}: <span class="field-hint" style="margin:0;">analisando…</span></div>`;
    } else if (a.status === 'erro' || !a.resultado || !a.resultado.texto) {
      linhas += `<div class="auditoria-linha">${escapeHtml(f.name)}: não foi possível ler automaticamente — confira manualmente.</div>`;
    } else {
      const r = a.resultado;
      const tipoLabel = TIPO_DOCUMENTO_LABEL[r.tipoDetectado] || r.tipoDetectado;
      const fonteLabel = r.fonte === 'ocr' ? 'lido por OCR' : 'texto do PDF';
      const podePreencher = permitePreencher && (r.campos.numeroNota || r.campos.valor);
      // tipoLabel vem de um dicionário fixo interno (TIPO_DOCUMENTO_LABEL),
      // não de texto digitado por alguém -- não precisa (nem deve) passar
      // por escapeHtml(); f.name é o nome do arquivo escolhido pelo
      // usuário, esse sim precisa ser escapado.
      linhas += `<div class="auditoria-linha"><span class="lote-badge">${tipoLabel}</span> ${escapeHtml(f.name)} <span class="field-hint" style="margin:0;">(${fonteLabel})</span>${podePreencher ? ` <button type="button" class="btn btn-ghost btn-sm" data-preencher-com-documento="${i}">Preencher com estes dados</button>` : ''}</div>`;
    }
  });

  // obrigatorios[].label e faltando[].label também vêm de listas fixas
  // internas (documentos_obrigatorios.js) -- mesmo raciocínio acima.
  let resumo = '';
  if (auditoria.obrigatorios.length > 0) {
    resumo += `<div class="field-hint" style="margin-top:6px;">Documentos esperados pra essa nota: ${auditoria.obrigatorios.map(o => o.label).join(', ')}.</div>`;
  }
  if (auditoria.faltando.length > 0) {
    resumo += `<div class="err-msg" style="margin-top:6px;">Ainda não identificamos: ${auditoria.faltando.map(f => f.label).join(', ')}. Confira se os anexos certos foram incluídos.</div>`;
  }
  auditoria.divergencias.forEach(d => { resumo += `<div class="err-msg" style="margin-top:6px;">${escapeHtml(d)}</div>`; });

  return `<div class="auditoria-anexos">
    <div class="field-hint" style="margin:0 0 4px;"><b>Auditoria de anexos</b> (documento WE9) — verificação automática, feita no seu navegador, nunca bloqueia o lançamento.</div>
    ${linhas}${resumo}
  </div>`;
}

// Painel lateral "ensinar o leitor" (formulário individual): mesma
// auditoria de renderAuditoriaAnexos, só que em formato de chat -- pra
// cada campo que faltou (número da nota, valor) ou tipo não identificado,
// pergunta e oferece os candidatos achados no texto como resposta rápida
// (chip) + um campo livre. A resposta vira uma dica aprendida por
// fornecedor (ver aprendizado_extracao.js/bindPainelAprendizado em
// events_notas.js) -- reaplicada automaticamente nas próximas notas do
// mesmo fornecedor.
export function renderPainelAprendizado(payloadParcial, opcoes) {
  const permitePreencher = !opcoes || opcoes.permitePreencher !== false;
  const analisesProntas = app.anexosAnalises
    .filter(a => a && a.status === 'pronto' && a.resultado)
    .map(a => a.resultado);
  const auditoria = auditarAnexos(payloadParcial, analisesProntas);

  let resumo = '';
  if (auditoria.obrigatorios.length > 0) {
    resumo += `<div class="chat-bubble sistema">Documentos esperados pra essa nota: ${auditoria.obrigatorios.map(o => o.label).join(', ')}.</div>`;
  }
  if (auditoria.faltando.length > 0) {
    resumo += `<div class="chat-bubble sistema">Ainda não identificamos: ${auditoria.faltando.map(f => f.label).join(', ')}. Confira se os anexos certos foram incluídos.</div>`;
  }
  auditoria.divergencias.forEach(d => { resumo += `<div class="chat-bubble sistema">${escapeHtml(d)}</div>`; });

  let threads = '';
  app.anexosNovos.forEach((f, i) => {
    const a = app.anexosAnalises[i];
    if (!a || a.status === 'analisando') {
      threads += `<div class="chat-thread"><div class="chat-arquivo">${escapeHtml(f.name)}</div><div class="chat-bubble sistema">analisando…</div></div>`;
      return;
    }
    if (a.status === 'erro' || !a.resultado || !a.resultado.texto) {
      threads += `<div class="chat-thread"><div class="chat-arquivo">${escapeHtml(f.name)}</div><div class="chat-bubble sistema">não foi possível ler automaticamente — confira manualmente.</div></div>`;
      return;
    }
    const r = a.resultado;
    const tipoLabel = TIPO_DOCUMENTO_LABEL[r.tipoDetectado] || r.tipoDetectado;
    const fonteLabel = r.fonte === 'ocr' ? 'lido por OCR' : 'texto do PDF';
    const podePreencher = permitePreencher && (r.campos.numeroNota || r.campos.valor);
    let bolhas = `<div class="chat-bubble sistema">Identifiquei como <b>${tipoLabel}</b> (${fonteLabel}).${podePreencher ? ` <button type="button" class="btn btn-ghost btn-sm" data-preencher-com-documento="${i}">Preencher com estes dados</button>` : ''}</div>`;
    (a.respondido || []).forEach(rp => {
      bolhas += `<div class="chat-bubble resposta">${rp.pergunta}<br>${escapeHtml(String(rp.valor))}</div>`;
    });
    perguntasPendentes(r).forEach(p => {
      const candidatos = p.campo === 'tipo'
        ? Object.entries(TIPO_DOCUMENTO_LABEL).filter(([k]) => k !== 'nao_identificado').map(([k, label]) => ({ valor: k, label }))
        : (p.candidatos || []).map(c => ({ valor: c, label: c }));
      bolhas += `<div class="chat-bubble pergunta">
        ${p.pergunta}
        ${candidatos.length > 0 ? `<div class="chat-candidatos">${candidatos.map(c => `<button type="button" class="chat-chip" data-chat-resposta="${i}:${p.campo}:${encodeURIComponent(c.valor)}">${escapeHtml(c.label)}</button>`).join('')}</div>` : ''}
        <div class="chat-form-manual">
          <input type="text" placeholder="ou digite aqui" data-chat-manual-input="${i}:${p.campo}">
          <button type="button" class="btn btn-ghost btn-sm" data-chat-manual-confirmar="${i}:${p.campo}">OK</button>
        </div>
      </div>`;
    });
    threads += `<div class="chat-thread"><div class="chat-arquivo">${escapeHtml(f.name)}</div>${bolhas}</div>`;
  });

  return `<div class="chat-painel">
    <h4>Ensinar o leitor</h4>
    ${resumo}
    ${threads || '<div class="chat-vazio">Anexe um documento pra começar.</div>'}
  </div>`;
}

export function formNovaNota(editing, isCorrecao) {
  const n = editing || {};
  const pag = app.cadastros.pagadores, forn = app.cadastros.fornecedores;
  const hint = (key, label) => (app.cadastros[key].length === 0 ? `<div class="field-hint">Nenhum ${label} cadastrado ainda. <a href="#" data-goto-cadastros="${key}">Cadastrar agora</a></div>` : '');
  app.temRateio = editing ? !!n.tem_rateio : false;
  app.temImposto = editing ? !!n.tem_retencao_imposto : false;
  const salvarLabel = isCorrecao ? 'Corrigir e devolver' : (editing && editing.status !== 'rascunho' ? 'Reenviar para aprovação' : 'Lançar nota no Central CP');
  // Vencimento de pagamento comum sugere a quarta-feira do lote semanal
  // (ver vencimento_comum.js) só como PONTO DE PARTIDA de uma nota nova
  // com tipo de despesa "padrão" -- o campo nunca fica travado (sempre dá
  // pra editar livremente, não importa o tipo de despesa).
  const tipoDespesaAtual = n.tipo_despesa_prazo || 'padrao';
  const vencimentoInicial = n.vencimento ? n.vencimento.slice(0, 10) : (!editing && tipoDespesaAtual === 'padrao' ? calcularVencimentoComum() : '');
  const payloadParcialAtual = {
    forma_pagamento: n.forma_pagamento || '', tipo_contratacao: n.tipo_contratacao || null,
    tem_retencao_imposto: app.temImposto, numero_nota: n.numero_nota || '', valor_bruto: n.valor_bruto || 0,
  };
  return `
  <div class="nota-form-layout">
  <div class="nota-form-col">
  <div id="box-nota">
    <div class="form-section">
      <h3 class="form-section-title">Documento</h3>
      ${!editing ? `
      <div class="field">
        <label>Tipo de despesa</label>
        <select id="nf-tipo-despesa">
          ${Object.entries(TIPO_DESPESA_LABEL_CURTO).map(([valor, label]) => `<option value="${valor}" ${tipoDespesaAtual === valor ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}
        </select>
        <div class="field-hint" id="tipo-despesa-legenda">${escapeHtml(TIPO_DESPESA_LABEL[tipoDespesaAtual] || TIPO_DESPESA_LABEL.padrao)}</div>
      </div>` : ''}
      <div class="field">
        <label>Arquivos anexos</label>
        <div class="field-hint">Anexe primeiro os documentos (nota fiscal, boleto, comprovante etc.) -- o leitor tenta identificar o tipo e os dados automaticamente, e avisa se faltar algum documento exigido.</div>
        <div id="anexos-area">${renderAnexosArea(n, payloadParcialAtual, { painelLateral: true })}</div>
      </div>
    </div>

    <div class="form-section">
      <h3 class="form-section-title">Datas e valor</h3>
      <div class="grid2">
        <div class="field"><label>Data de emissão</label><input id="nf-emissao" type="date" required value="${n.data_emissao ? n.data_emissao.slice(0, 10) : ''}"></div>
        <div class="field"><label>Data de vencimento</label><input id="nf-vencimento" type="date" required value="${vencimentoInicial}"></div>
      </div>
      <div class="grid2">
        <div class="field"><label>Competência</label><input id="nf-competencia" type="month" required value="${n.competencia ? n.competencia.slice(0, 7) : ''}"></div>
        <div class="field"><label>N° da NF</label><input id="nf-numero" required value="${escapeHtml(n.numero_nota || '')}"></div>
      </div>
      <div class="field"><label>Valor bruto (R$)</label><input id="nf-valor" type="number" step="0.01" min="0" required value="${n.valor_bruto || ''}"></div>
      <div class="field">
        <label><input type="checkbox" id="nf-tem-imposto" ${app.temImposto ? 'checked' : ''}> Tem retenção de imposto</label>
        <div class="field-hint">Separa o valor líquido (o que de fato é pago ao fornecedor) do bruto -- os impostos retidos viram uma guia à parte.</div>
      </div>
      <div class="field" id="imposto-area">${renderImpostoArea()}</div>
    </div>

    <div class="form-section">
      <h3 class="form-section-title">Pagamento</h3>
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
    </div>

    <div class="form-section">
      <h3 class="form-section-title">Classificação contábil</h3>
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
    </div>

    <div class="form-section">
      <h3 class="form-section-title">Descrição</h3>
      <div class="field"><label>Descrição geral</label><textarea id="nf-descricao" rows="2">${escapeHtml(n.descricao || '')}</textarea></div>
    </div>

    <div class="modal-actions">
      <button class="btn btn-brand" type="button" id="btn-salvar-nota">${salvarLabel}</button>
      ${isCorrecao ? '' : `<button class="btn btn-ghost" type="button" id="btn-salvar-rascunho">Salvar como rascunho</button>`}
      <button class="btn btn-ghost" type="button" id="modal-cancel">Cancelar</button>
    </div>
  </div>
  </div>
  <div class="nota-chat-col" id="nota-chat-col">${renderPainelAprendizado(payloadParcialAtual, { permitePreencher: true })}</div>
  </div>`;
}

// Combobox de busca do fornecedor: input de texto + lista filtrada, com um
// input escondido (#nf-fornecedor) guardando o id selecionado — mantém a
// mesma interface que o resto do código já espera (coletarPayload,
// refreshContaBancariaArea etc. leem #nf-fornecedor normalmente). `ids`
// permite reaproveitar a mesma lógica com ids diferentes (ex: uma combo
// por linha no lançamento em lote, ver events_lote_notas.js).
export function bindFornecedorCombo(onSelect, ids) {
  const { buscaId = 'nf-fornecedor-busca', hiddenId = 'nf-fornecedor', listId = 'nf-fornecedor-list' } = ids || {};
  const input = document.getElementById(buscaId);
  const hidden = document.getElementById(hiddenId);
  const list = document.getElementById(listId);
  if (!input || !hidden || !list) return;

  function renderList(query) {
    const q = query.trim().toLowerCase();
    if (q.length < 2) { list.style.display = 'none'; list.innerHTML = ''; return; }
    const matches = app.cadastros.fornecedores.filter(f => f.nome.toLowerCase().includes(q)).slice(0, 30);
    // Dois fornecedores cadastrados com o mesmo nome mas CNPJ diferente
    // (empresas do mesmo grupo, ou coincidência) ficariam indistinguíveis
    // na lista -- mostra o CNPJ como desempate só quando o nome se repete
    // entre os resultados (não polui o caso comum, sem duplicidade).
    const nomesDuplicados = new Set();
    const vistos = new Set();
    matches.forEach(f => {
      const chave = f.nome.trim().toLowerCase();
      if (vistos.has(chave)) nomesDuplicados.add(chave);
      vistos.add(chave);
    });
    list.innerHTML = matches.length
      ? matches.map(f => {
          const duplicado = nomesDuplicados.has(f.nome.trim().toLowerCase());
          const sufixo = duplicado && f.cnpj ? ` <span class="combo-item-sub">CNPJ ${escapeHtml(f.cnpj)}</span>` : '';
          return `<div class="combo-item" data-id="${f.id}">${escapeHtml(f.nome)}${sufixo}</div>`;
        }).join('')
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

/* ---- Impostos retidos: mesmo padrão do rateio, líquido sempre calculado ---- */
export function renderImpostoArea() {
  if (!app.temImposto) return '';
  const brutoEl = document.getElementById('nf-valor');
  const bruto = brutoEl ? (parseFloat(brutoEl.value) || 0) : 0;
  const somaImpostos = app.impostoTemp.reduce((s, i) => s + i.valor, 0);
  const liquido = +(bruto - somaImpostos).toFixed(2);
  let html = `<div class="imposto-box">`;
  if (app.impostoTemp.length > 0) {
    html += `<table class="data-tbl" style="margin-bottom:10px;"><thead><tr><th>Tipo</th><th>Valor</th><th>Descrição</th><th></th></tr></thead><tbody>`;
    app.impostoTemp.forEach((imp, i) => {
      html += `<tr><td>${TIPO_IMPOSTO_LABEL[imp.tipo] || imp.tipo}</td><td class="mono">${fmtMoney(imp.valor)}</td><td>${escapeHtml(imp.descricao || '')}</td><td><button type="button" class="btn btn-ghost btn-sm" data-imposto-remove="${i}">Remover</button></td></tr>`;
    });
    html += `</tbody></table>`;
  }
  html += `<div class="field-hint" style="margin-bottom:8px;">Valor bruto: <b class="mono">${fmtMoney(bruto)}</b> · Impostos retidos: <b class="mono">${fmtMoney(somaImpostos)}</b> · Valor líquido: <b class="mono">${fmtMoney(liquido)}</b></div>`;
  html += `
    <div class="grid2">
      <div class="field">
        <label>Tipo de imposto</label>
        <select id="imp-tipo">
          ${Object.entries(TIPO_IMPOSTO_LABEL).map(([valor, label]) => `<option value="${valor}">${escapeHtml(label)}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>Valor retido (R$)</label><input type="number" step="0.01" min="0" id="imp-valor"></div>
    </div>
    <div class="field"><label>Descrição (opcional)</label><input id="imp-descricao" placeholder="ex: alíquota 1,5%"></div>
    <button type="button" class="btn btn-amber btn-sm" id="btn-imposto-incluir">Incluir imposto</button>
  `;
  html += `</div>`;
  return html;
}

export function refreshImpostoArea() {
  const area = document.getElementById('imposto-area');
  if (!area) return;
  area.innerHTML = renderImpostoArea();
  bindImpostoArea();
}

export function bindImpostoArea() {
  const bi = document.getElementById('btn-imposto-incluir');
  if (bi) bi.onclick = () => {
    const tipo = document.getElementById('imp-tipo').value;
    const valor = parseFloat(document.getElementById('imp-valor').value);
    const descricao = document.getElementById('imp-descricao').value.trim();
    const bruto = parseFloat(document.getElementById('nf-valor').value) || 0;
    const somaAtual = app.impostoTemp.reduce((s, i) => s + i.valor, 0);
    if (!valor || valor <= 0) { showToast('Informe um valor de imposto maior que zero.'); return; }
    if (valor > (bruto - somaAtual) + 0.001) { showToast('O valor retido não pode deixar o líquido negativo (soma dos impostos não pode passar do valor bruto).'); return; }
    app.impostoTemp.push({ id: uid(), tipo, valor, descricao });
    refreshImpostoArea();
  };
  document.querySelectorAll('[data-imposto-remove]').forEach(b => {
    b.onclick = () => { app.impostoTemp.splice(parseInt(b.dataset.impostoRemove), 1); refreshImpostoArea(); };
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
    ${n.tem_retencao_imposto ? `<div><div class="k">Valor líquido</div><div class="v mono">${fmtMoney(n.valor_liquido)}</div></div>` : ''}
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
  ${(n.tem_retencao_imposto && n.impostos && n.impostos.length > 0) ? `
  <hr class="divider">
  <h3 style="font-size:14px;">Impostos retidos</h3>
  <table class="data-tbl" style="margin-bottom:8px;">
    <thead><tr><th>Tipo</th><th>Valor</th><th>Descrição</th></tr></thead>
    <tbody>
      ${n.impostos.map(i => `<tr><td>${TIPO_IMPOSTO_LABEL[i.tipo] || i.tipo}</td><td class="mono">${fmtMoney(i.valor)}</td><td>${escapeHtml(i.descricao || '—')}</td></tr>`).join('')}
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
