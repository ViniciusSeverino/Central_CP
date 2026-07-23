// src/js/ui_nota.js
import {
  app, escapeHtml, fmtMoney, fmtDate, fmtDateTime, labelOf, selectOptions,
  centrosParaPagador, classesParaCentro, codigosParaClasse, resolverLabelsNota, resolverLabelsRateio,
  nomeUsuario, STATUS_LABEL, STATUS_COLOR, STATUS_SOFT, uid, ehSuperUsuario, ehAdministrador, podeAgirComo, fmtCompetencia,
  SETORES, contratoVencido, TIPO_IMPOSTO_LABEL, ehRecebedor,
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
export function nomeExibicaoAnexo(caminho) {
  const arquivo = caminho.split('/').pop() || caminho;
  return arquivo.replace(/^\d+-/, '');
}

// Pré-visualização de anexos (pedido do dono do produto): o documento em
// si (imagem/PDF de verdade) só é mostrado numa janela externa, num
// monitor separado do formulário -- dá mais espaço pra ler o documento
// enquanto preenche os campos do que um card espremido ao lado do
// formulário conseguiria (ver abrirPreviewExterno em events_notas.js). O
// formulário em si só mostra um botão "Abrir pré-visualização" no lugar.
//

// Cache por File (não por índice/nome) -- o array de anexos novos é
// re-renderizado a cada tecla digitada no formulário; sem cachear, cada
// render criaria um object URL novo pro MESMO arquivo (vazamento de
// memória). URL.createObjectURL não existe no jsdom (suíte de regressão)
// -- por isso o guard typeof; sem preview nesse ambiente, sem erro.
const _cacheUrlPreview = new WeakMap();
export function urlPreviewDoArquivo(file) {
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return null;
  let url = _cacheUrlPreview.get(file);
  if (!url) {
    try { url = URL.createObjectURL(file); _cacheUrlPreview.set(file, url); }
    catch { return null; }
  }
  return url;
}

function tipoPreviewPorNome(nome) {
  const ext = (nome.split('.').pop() || '').toLowerCase();
  if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) return 'imagem';
  if (ext === 'pdf') return 'pdf';
  return null;
}

export function tipoPreviewDoArquivoNovo(file) {
  if (file.type === 'application/pdf') return 'pdf';
  if (file.type.startsWith('image/')) return 'imagem';
  return tipoPreviewPorNome(file.name);
}

// Mesma barra de zoom da tela cheia (ver bindZoomInlinePreview em
// events_notas.js), só que junto do card -- pedido do dono do produto pra
// não precisar abrir a tela cheia só pra ampliar. PDF usa o visualizador
// nativo (sem essa barra), igual já acontecia na tela cheia.
export function zoomControlesHtml() {
  return `<div class="preview-zoom-controles" data-zoom-controles>
    <button type="button" data-zoom-menos aria-label="Diminuir zoom">−</button>
    <span data-zoom-valor>100%</span>
    <button type="button" data-zoom-mais aria-label="Aumentar zoom">+</button>
    <button type="button" data-zoom-reset>Ajustar</button>
  </div>`;
}

function cardPreview(titulo, tipo, url, rodape) {
  let corpo;
  if (!url || !tipo) {
    corpo = `<div class="preview-indisponivel">Pré-visualização não disponível para este arquivo.</div>`;
  } else if (tipo === 'imagem') {
    corpo = `${zoomControlesHtml()}<div class="preview-imagem-wrap"><img src="${url}" alt="${escapeHtml(titulo)}" class="preview-imagem" data-preview-tipo="imagem"></div>`;
  } else {
    corpo = `<iframe src="${url}" class="preview-pdf" title="${escapeHtml(titulo)}" data-preview-tipo="pdf"></iframe>`;
  }
  return `<div class="preview-card">
    <div class="preview-titulo"><span>${escapeHtml(titulo)}</span></div>
    ${corpo}
    ${rodape || ''}
  </div>`;
}

// n pode ser {} (nota nova, ainda sem anexos salvos) -- só os novos
// aparecem nesse caso. Separado de renderPreviewAnexos() pra poder ser
// reaproveitado tal e qual dentro da janela externa (ver
// renderizarConteudoJanelaExterna em events_notas.js) -- mesmos cards,
// sem o cabeçalho/botão que só fazem sentido no painel principal.
export function renderPreviewAnexosConteudo(n) {
  const existentes = ((n && n.anexos) || []).filter(p => !app.anexosRemovidos.includes(p));
  const novos = app.anexosNovos;
  if (existentes.length === 0 && novos.length === 0) return '';
  let cards = '';
  novos.forEach(file => {
    cards += cardPreview(file.name, tipoPreviewDoArquivoNovo(file), urlPreviewDoArquivo(file), `<div class="field-hint" style="margin-top:4px;">novo, ainda não enviado</div>`);
  });
  existentes.forEach(p => {
    const nome = nomeExibicaoAnexo(p);
    cards += `<div class="preview-card" data-preview-existente="${p}">
      <div class="preview-titulo">${escapeHtml(nome)}</div>
      <button type="button" class="btn btn-ghost btn-sm" data-carregar-preview="${p}">Visualizar</button>
    </div>`;
  });
  return cards;
}

// Pedido do dono do produto: a pré-visualização sai do formulário e vira
// só um botão -- o documento em si só é mostrado na janela externa (num
// monitor separado), que aproveita bem mais espaço do que o vão ao lado
// do formulário conseguiria (ver abrirPreviewExterno/renderizarConteudo-
// JanelaExterna em events_notas.js e a classe .preview-externo-pagina em
// styles.css). Enquanto a janela está aberta, vira um aviso com
// "Focar"/"Trazer de volta" em vez do botão de abrir de novo.
export function renderPreviewAnexos(n) {
  const conteudo = renderPreviewAnexosConteudo(n);
  if (!conteudo) return '';
  if (app.state.previewExternoAberto) {
    return `<div class="preview-anexos">
      <h4>Pré-visualização</h4>
      <div class="preview-externo-aviso">
        <p>Aberta em outra janela.</p>
        <div class="preview-externo-aviso-acoes">
          <button type="button" class="btn btn-ghost btn-sm" data-focar-preview-externo">Focar janela</button>
          <button type="button" class="btn btn-ghost btn-sm" data-fechar-preview-externo">Trazer de volta</button>
        </div>
      </div>
    </div>`;
  }
  return `<div class="preview-anexos">
    <h4>Pré-visualização</h4>
    <p class="field-hint" style="margin:0 0 10px;">Veja o documento anexado numa janela separada, sem sair deste formulário.</p>
    <button type="button" class="btn btn-brand btn-block" data-abrir-preview-externo>⇱ Abrir pré-visualização</button>
  </div>`;
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
      ${app.anexosNovos.map((f, i) => `<li>
        <span>${escapeHtml(f.name)} <em>(novo, envia ao salvar)</em></span>
        <span class="anexos-lista-acoes">
          ${app.anexosNovos.length > 1 ? `${i > 0 ? `<a href="#" data-mover-anexo-novo="${i}" data-direcao="cima" title="Mover para cima">▲</a>` : ''}${i < app.anexosNovos.length - 1 ? `<a href="#" data-mover-anexo-novo="${i}" data-direcao="baixo" title="Mover para baixo">▼</a>` : ''}` : ''}
          <a href="#" data-remover-anexo-novo="${i}">remover</a>
        </span>
      </li>`).join('')}
    </ul>` : ''}
    <input type="file" id="nf-anexos-input" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*">
    <div class="field-hint">PDF ou imagem, até 15MB por arquivo. ${app.anexosNovos.length > 1 ? 'Use ▲/▼ pra organizar a ordem -- ' : ''}Ao salvar, todos os arquivos viram um PDF único, na ordem mostrada acima, renomeado no padrão da empresa.</div>
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
export function renderPainelAprendizado(n, payloadParcial, opcoes) {
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
    // "Selecionar no documento" (ferramenta de captura, ver
    // extracao_posicional.js/bindSelecaoRetangulo em events_notas.js): só
    // faz sentido pra campos com um lugar pontual no documento (não
    // "tipo", que é uma classificação do documento inteiro). Pra IMAGEM,
    // só quando o leitor já conseguiu gerar palavras posicionadas (OCR já
    // rodou, ver ocr_imagem.js). Pra PDF, sempre que houver anexo em PDF
    // -- a renderização em canvas (pdf_render.js) roda sob demanda, só
    // quando o botão é clicado (ver Fase 3), não precisa de nada pronto
    // de antemão.
    const tipoArquivo = tipoPreviewDoArquivoNovo(f);
    perguntasPendentes(r).forEach(p => {
      const candidatos = p.campo === 'tipo'
        ? Object.entries(TIPO_DOCUMENTO_LABEL).filter(([k]) => k !== 'nao_identificado').map(([k, label]) => ({ valor: k, label }))
        : (p.candidatos || []).map(c => ({ valor: c, label: c }));
      const podeSelecionarNoDocumento = p.campo !== 'tipo' && (tipoArquivo === 'imagem' ? !!r.palavrasPorPagina : tipoArquivo === 'pdf');
      bolhas += `<div class="chat-bubble pergunta">
        ${p.pergunta}
        ${candidatos.length > 0 ? `<div class="chat-candidatos">${candidatos.map(c => `<button type="button" class="chat-chip" data-chat-resposta="${i}:${p.campo}:${encodeURIComponent(c.valor)}">${escapeHtml(c.label)}</button>`).join('')}</div>` : ''}
        <div class="chat-form-manual">
          <input type="text" placeholder="ou digite aqui" data-chat-manual-input="${i}:${p.campo}">
          <button type="button" class="btn btn-ghost btn-sm" data-chat-manual-confirmar="${i}:${p.campo}">OK</button>
        </div>
        ${podeSelecionarNoDocumento ? `<div style="margin-top:6px;"><button type="button" class="btn btn-ghost btn-sm" data-selecionar-no-documento="${i}:${p.campo}">🔲 Selecionar no documento</button></div>` : ''}
      </div>`;
    });
    threads += `<div class="chat-thread"><div class="chat-arquivo">${escapeHtml(f.name)}</div>${bolhas}</div>`;
  });

  return `${renderPreviewAnexos(n)}<div class="chat-painel">
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
  // Parcelamento só existe em nota nova -- nunca em correção/reenvio/
  // completar recebimento (editing sempre truthy nesses casos), por isso
  // sempre reseta pra desligado, sem olhar pra `n`.
  app.temParcelamento = false;
  app.parcelasTemp = [];
  app.state.preCadastroFornecedorAberto = false;
  app.preCadastroFornecedorArquivos = [];
  // 'recebido' (perfil recebedor só anexou + classificou, ver
  // ui_recebimento.js) é a primeira vez que esses dados existem de
  // verdade -- não é um "reenvio", é o lançamento em si.
  const salvarLabel = isCorrecao ? 'Corrigir e devolver'
    : (editing && editing.status === 'recebido') ? 'Completar e lançar'
    : (editing && editing.status !== 'rascunho') ? 'Reenviar para aprovação' : 'Lançar nota no Central CP';
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
      ${!editing ? `
      <div class="field">
        <label>Pagamento parcelado?</label>
        <select id="nf-tem-parcelamento">
          <option value="nao" ${!app.temParcelamento ? 'selected' : ''}>Não — uma nota só</option>
          <option value="sim" ${app.temParcelamento ? 'selected' : ''}>Sim — dividir em parcelas</option>
        </select>
        <div class="field-hint">Mesma NF em todas as parcelas -- só o vencimento (e o valor, se você ajustar) muda de uma linha pra outra. Cada parcela vira uma nota própria e segue o fluxo inteiro (aprovação, Group, chamado, CSC, pagamento) de forma independente -- uma pode já estar paga enquanto outra ainda está em aprovação.</div>
      </div>
      <div id="parcelamento-area">${renderParcelamentoArea()}</div>` : ''}
      <div class="field">
        <label><input type="checkbox" id="nf-tem-imposto" ${app.temImposto ? 'checked' : ''}> Tem retenção de imposto</label>
        <div class="field-hint">Separa o valor líquido (o que de fato é pago ao fornecedor) do bruto -- os impostos retidos viram uma guia à parte.</div>
      </div>
      <div class="field" id="imposto-area">${renderImpostoArea()}</div>
    </div>

    <div class="form-section">
      <h3 class="form-section-title">Pagamento</h3>
      ${!app.usuario.setor ? (app.usuario.role === 'contas_a_pagar' ? `
      <div class="field">
        <label>Setor</label>
        <input id="nf-setor" type="hidden" value="Financeiro">
        <div class="field-hint">Lançamento do contas a pagar -- sempre no setor Financeiro.</div>
      </div>` : `
      <div class="field">
        <label>Setor</label>
        <select id="nf-setor" required>
          <option value="">Selecione...</option>
          ${SETORES.map(s => `<option value="${s}" ${n.setor === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
        <div class="field-hint">Você não tem um setor fixo — escolha de qual setor é essa nota.</div>
      </div>`) : ''}
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
        ${(app.usuario.role === 'departamento' && !ehRecebedor()) ? `<div id="fornecedor-pre-cadastro-area">${renderFornecedorPreCadastroArea()}</div>` : ''}
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
      ${(isCorrecao || (editing && editing.status === 'recebido')) ? '' : `<button class="btn btn-ghost" type="button" id="btn-salvar-rascunho">Salvar como rascunho</button>`}
      <button class="btn btn-ghost" type="button" id="modal-cancel">Cancelar</button>
    </div>
  </div>
  </div>
  <div class="nota-chat-col" id="nota-chat-col">${renderPainelAprendizado(n, payloadParcialAtual, { permitePreencher: true })}</div>
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

// Pré-cadastro de fornecedor inline no formulário de nota (só perfil
// "completo" do departamento, ver migration 0030) -- quando não acha o
// fornecedor no combo, dá pra criar ali mesmo com só o essencial (nome +
// CNPJ + documento pro Group revisar depois). O CP completa o resto
// (contas bancárias, contrato) e ativa de verdade na aba "Cadastrar
// fornecedor" -- até lá, notas desse fornecedor ficam fora da fila
// "Lançar no Group" (ver queueData em ui.js).
export function renderFornecedorPreCadastroArea() {
  if (!app.state.preCadastroFornecedorAberto) {
    return `<div class="field-hint"><a href="#" id="link-abrir-pre-cadastro-fornecedor">Não encontrou o fornecedor? Pré-cadastrar agora</a></div>`;
  }
  return `
    <div class="pre-cadastro-fornecedor-box">
      <div class="field"><label>Nome do fornecedor</label><input id="pcf-nome"></div>
      <div class="field"><label>CNPJ (opcional)</label><input id="pcf-cnpj"></div>
      <div class="field">
        <label>Documento (contrato social, cartão CNPJ etc.)</label>
        <input type="file" id="pcf-anexos-input" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*">
        <div id="pcf-arquivos-lista">${renderPreCadastroArquivosLista()}</div>
        <div class="field-hint">Necessário pro CP cadastrar o fornecedor no Group.</div>
      </div>
      <button type="button" class="btn btn-amber btn-sm" id="btn-pre-cadastrar-fornecedor">Pré-cadastrar e selecionar</button>
      <button type="button" class="btn btn-ghost btn-sm" id="btn-cancelar-pre-cadastro-fornecedor">Cancelar</button>
      <div class="field-hint">O fornecedor entra como pendente de revisão -- o CP completa os dados e cadastra no Group antes de "Lançar no Group".</div>
    </div>`;
}

// Lista de arquivos escolhidos tem refresh PRÓPRIO (ver
// refreshPreCadastroArquivosLista em events_notas.js) -- reconstruir a
// área inteira (renderFornecedorPreCadastroArea) a cada arquivo anexado
// apagaria o nome/CNPJ que a pessoa já tivesse digitado (os inputs não
// guardam valor nenhum entre renders, diferente de rateioTemp/impostoTemp
// que são estado à parte -- mesma classe de bug já vista no imposto).
export function renderPreCadastroArquivosLista() {
  const arquivos = app.preCadastroFornecedorArquivos;
  if (arquivos.length === 0) return '';
  return `<ul class="anexos-lista">${arquivos.map((f, i) => `<li><span>${escapeHtml(f.name)}</span> <a href="#" data-remover-pre-cadastro-arquivo="${i}">remover</a></li>`).join('')}</ul>`;
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
    // "Completar lançamento" (nota que chegou como 'recebido', ver
    // ui_recebimento.js/migration 0029) já tem centro de custo escolhido
    // pelo recebedor, mas ainda não tem pagador -- sem isso o select
    // ficaria travado mostrando "Selecione o pagador primeiro" por cima
    // do valor que já existe. Habilita também quando já existe um centro
    // de custo pré-selecionado, mesmo sem pagador (mostra o cadastro
    // inteiro nesse caso, já que não dá pra filtrar por origem ainda).
    const centroHabilitado = !!n.pagador_id || !!n.centro_custo_id;
    const clOptions = n.centro_custo_id ? classesParaCentro(n.centro_custo_id) : [];
    const codOptions = n.classe_conta_id ? codigosParaClasse(n.classe_conta_id) : [];
    return `
    <div class="field">
      <label>Centro de custo</label>
      <select id="nf-centro-custo" required ${!centroHabilitado ? 'disabled' : ''}>${centroHabilitado ? selectOptions(ccOptions, n.centro_custo_id) : `<option value="">Selecione o pagador primeiro</option>`}</select>
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
  const pagadorId = pagadorEl ? pagadorEl.value : '';
  // Preserva a classificação já escolhida (centro de custo/classe/código)
  // se ela continuar válida pro pagador novo -- só reseta quando o centro
  // atual não pertence ao recorte desse pagador (ver centrosParaPagador em
  // state.js), que é quando a escolha anterior realmente deixou de fazer
  // sentido. Sem isso, TROCAR o pagador sempre apagava tudo, mesmo quando
  // o centro continuava válido -- bug real: no "Completar lançamento" de
  // uma nota 'recebido' (ver ui_recebimento.js), o recebedor já escolhe
  // centro/classe, e o "completo" só confirma/ajusta o pagador depois --
  // cada vez que ele tocava o campo pagador, a classificação inteira do
  // recebedor sumia, forçando reclassificar do zero.
  const centroAtualEl = document.getElementById('nf-centro-custo');
  const classeAtualEl = document.getElementById('nf-classe-conta');
  const codigoAtualEl = document.getElementById('nf-codigo-classificacao');
  let centroId = centroAtualEl ? centroAtualEl.value : '';
  let classeId = classeAtualEl ? classeAtualEl.value : '';
  let codigoId = codigoAtualEl ? codigoAtualEl.value : '';
  if (centroId && pagadorId && !centrosParaPagador(pagadorId).some(c => c.id === centroId)) {
    centroId = ''; classeId = ''; codigoId = '';
  }
  area.innerHTML = renderClassificacaoArea({ pagador_id: pagadorId, centro_custo_id: centroId, classe_conta_id: classeId, codigo_classificacao_id: codigoId });
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
    html += `<div class="tbl-wrap"><table class="data-tbl" style="margin-bottom:10px;"><thead><tr><th>Valor</th><th>Centro de custo</th><th>Classe da conta</th><th>Código</th><th>Descrição</th><th></th></tr></thead><tbody>`;
    app.rateioTemp.forEach((r, i) => {
      const lbl = resolverLabelsRateio(r);
      html += `<tr><td class="mono">${fmtMoney(r.valor)}</td><td>${escapeHtml(lbl.centro_label)}</td><td>${escapeHtml(lbl.classe_label)}</td><td>${escapeHtml(lbl.codigo_label || '—')}</td><td>${escapeHtml(r.descricao || '')}</td><td><button type="button" class="btn btn-ghost btn-sm" data-rateio-remove="${i}">Remover</button></td></tr>`;
    });
    html += `</tbody></table></div>`;
  }
  html += `<div class="field-hint" style="margin-bottom:8px;">Valor bruto: <b class="mono">${fmtMoney(bruto)}</b> · Já rateado: <b class="mono">${fmtMoney(alocado)}</b> · Saldo a ratear: <b class="mono">${fmtMoney(saldo)}</b></div>`;
  if (saldo > 0.004) {
    const pagadorId = document.getElementById('nf-pagador') ? document.getElementById('nf-pagador').value : '';
    const centrosDisponiveis = pagadorId ? centrosParaPagador(pagadorId) : [];
    html += `
      <div class="grid2">
        <div class="field">
          <label>Valor do rateio</label>
          <div style="display:flex; gap:6px;">
            <select id="rt-modo" style="flex:0 0 78px;">
              <option value="valor">R$</option>
              <option value="percentual">%</option>
            </select>
            <input type="number" step="0.01" min="0" id="rt-valor" style="flex:1;">
          </div>
          <div class="field-hint" id="rt-valor-hint"></div>
        </div>
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

// Hint ao vivo mostrando a equivalência R$<->% enquanto o usuário digita --
// mesmo padrão do atualizarHintImposto (imposto), mas sem estado próprio: só
// lê os campos e reescreve o hint.
function atualizarHintRateio() {
  const modo = document.getElementById('rt-modo');
  const valorInput = document.getElementById('rt-valor');
  const hint = document.getElementById('rt-valor-hint');
  if (!modo || !valorInput || !hint) return;
  const bruto = parseFloat(document.getElementById('nf-valor').value) || 0;
  const quantidade = parseFloat(valorInput.value);
  if (!quantidade || quantidade <= 0 || !bruto) { hint.textContent = ''; return; }
  if (modo.value === 'percentual') {
    const valorEmReais = +(bruto * quantidade / 100).toFixed(2);
    hint.innerHTML = `${quantidade}% de ${fmtMoney(bruto)} = <b class="mono">${fmtMoney(valorEmReais)}</b>`;
  } else {
    const percentual = +(quantidade / bruto * 100).toFixed(1);
    hint.innerHTML = `${fmtMoney(quantidade)} = <b class="mono">${percentual}%</b> do valor bruto`;
  }
}

export function bindRateioArea() {
  const rtModo = document.getElementById('rt-modo');
  const rtValor = document.getElementById('rt-valor');
  if (rtModo) rtModo.onchange = atualizarHintRateio;
  if (rtValor) rtValor.oninput = atualizarHintRateio;
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
    const modo = document.getElementById('rt-modo').value;
    const quantidade = parseFloat(document.getElementById('rt-valor').value);
    const classeId = document.getElementById('rt-classe').value;
    const centroId = document.getElementById('rt-centro').value;
    const codigoId = document.getElementById('rt-codigo').value;
    const descricao = document.getElementById('rt-descricao').value.trim();
    const bruto = parseFloat(document.getElementById('nf-valor').value) || 0;
    const alocado = app.rateioTemp.reduce((s, r) => s + r.valor, 0);
    const saldo = bruto - alocado;
    if (!quantidade || quantidade <= 0) { showToast('Informe um valor de rateio maior que zero.'); return; }
    const valor = modo === 'percentual' ? +(bruto * quantidade / 100).toFixed(2) : quantidade;
    if (!classeId || !centroId) { showToast('Selecione a classe da conta e o centro de custo do rateio.'); return; }
    if (valor > saldo + 0.001) { showToast('O valor do rateio não pode ser maior que o saldo disponível.'); return; }
    app.rateioTemp.push({ id: uid(), valor, descricao, classe_conta_id: classeId, centro_custo_id: centroId, codigo_classificacao_id: codigoId || null });
    refreshRateioArea();
  };
  document.querySelectorAll('[data-rateio-remove]').forEach(b => {
    b.onclick = () => { app.rateioTemp.splice(parseInt(b.dataset.rateioRemove), 1); refreshRateioArea(); };
  });
}

/* ---- Parcelamento ----
 * Diferente do rateio: rateio divide o VALOR de uma nota entre
 * classificações, mas a nota continua sendo uma coisa só (um vencimento,
 * uma aprovação, um lançamento no Group, um pagamento). Parcelamento
 * divide o VENCIMENTO -- cada parcela é uma NOTA própria (mesmo número de
 * NF, fornecedor e classificação em todas -- só vencimento e,
 * opcionalmente, valor mudam de uma linha pra outra, ver decisão do dono
 * do produto), porque cada uma pode estar numa etapa diferente do fluxo
 * ao mesmo tempo (parcela 1/3 já paga, 2/3 ainda em aprovação). Por isso as linhas
 * daqui não viram uma tabela auxiliar salva junto da nota (como
 * nota_rateios) -- na hora de salvar (events_notas.js), cada linha vira
 * uma chamada própria a db.criarNota, todas ligadas por um
 * parcelamento_id em comum (só pra rastreio/relatório).
 * Só existe em nota NOVA (formNovaNota com editing=null) -- não faz
 * sentido "parcelar" uma correção/reenvio de uma nota que já existe.
 */
export function renderParcelamentoArea() {
  if (!app.temParcelamento) return '';
  const brutoEl = document.getElementById('nf-valor');
  const bruto = brutoEl ? (parseFloat(brutoEl.value) || 0) : 0;
  const alocado = +app.parcelasTemp.reduce((s, p) => s + p.valor, 0).toFixed(2);
  const saldo = +(bruto - alocado).toFixed(2);
  let html = `<div class="parcelamento-box">`;
  if (app.parcelasTemp.length > 0) {
    html += `<div class="tbl-wrap"><table class="data-tbl" style="margin-bottom:10px;"><thead><tr><th>Parcela</th><th>Valor (R$)</th><th>Vencimento</th><th></th></tr></thead><tbody>`;
    app.parcelasTemp.forEach((p, i) => {
      html += `<tr>
        <td class="mono">${p.numero}/${app.parcelasTemp.length}</td>
        <td><input type="number" step="0.01" min="0" data-parcela-valor="${i}" value="${p.valor}" style="width:110px;"></td>
        <td><input type="date" data-parcela-vencimento="${i}" value="${p.vencimento || ''}"></td>
        <td><button type="button" class="btn btn-ghost btn-sm" data-parcela-remove="${i}">Remover</button></td>
      </tr>`;
    });
    html += `</tbody></table></div>`;
    html += `<div class="field-hint" style="margin-bottom:10px;">Valor bruto: <b class="mono">${fmtMoney(bruto)}</b> · Já dividido entre as parcelas: <b class="mono">${fmtMoney(alocado)}</b> · Saldo: <b class="mono">${fmtMoney(saldo)}</b>${Math.abs(saldo) > 0.004 ? ' <span style="color:var(--alert);">— precisa fechar em zero antes de salvar</span>' : ''}</div>`;
  }
  html += `
    <div class="grid2">
      <div class="field"><label>Número de parcelas</label><input type="number" min="2" step="1" id="pc-num-parcelas" value="${Math.max(app.parcelasTemp.length, 2)}"></div>
      <div class="field">
        <label>Intervalo entre parcelas</label>
        <select id="pc-intervalo">
          <option value="30">Mensal (30 dias)</option>
          <option value="15">Quinzenal (15 dias)</option>
          <option value="7">Semanal (7 dias)</option>
        </select>
      </div>
    </div>
    <button type="button" class="btn btn-amber btn-sm" id="btn-parcelas-gerar">${app.parcelasTemp.length > 0 ? 'Gerar de novo (substitui as linhas acima)' : 'Gerar parcelas iguais'}</button>
    <div class="field-hint" style="margin-top:6px;">Divide o valor bruto em partes iguais (a última absorve o arredondamento) e espaça os vencimentos a partir da data de vencimento acima -- ajuste valor/vencimento linha a linha depois, se precisar.</div>
  `;
  html += `</div>`;
  return html;
}

export function refreshParcelamentoArea() {
  const area = document.getElementById('parcelamento-area');
  if (!area) return;
  area.innerHTML = renderParcelamentoArea();
  bindParcelamentoArea();
}

export function bindParcelamentoArea() {
  const btnGerar = document.getElementById('btn-parcelas-gerar');
  if (btnGerar) btnGerar.onclick = () => {
    const bruto = parseFloat(document.getElementById('nf-valor').value) || 0;
    const n = parseInt(document.getElementById('pc-num-parcelas').value, 10) || 0;
    const intervalo = parseInt(document.getElementById('pc-intervalo').value, 10) || 30;
    const vencimentoBase = document.getElementById('nf-vencimento').value;
    if (n < 2) { showToast('Informe ao menos 2 parcelas.'); return; }
    if (!bruto) { showToast('Informe o valor bruto antes de gerar as parcelas.'); return; }
    if (!vencimentoBase) { showToast('Informe a data de vencimento antes de gerar as parcelas.'); return; }
    const valorParcela = Math.floor((bruto / n) * 100) / 100;
    const parcelas = [];
    let acumulado = 0;
    for (let i = 0; i < n; i++) {
      const ultima = i === n - 1;
      const valor = ultima ? +(bruto - acumulado).toFixed(2) : valorParcela;
      acumulado = +(acumulado + valor).toFixed(2);
      const data = new Date(vencimentoBase + 'T00:00:00');
      data.setDate(data.getDate() + intervalo * i);
      parcelas.push({ id: uid(), numero: i + 1, valor, vencimento: data.toISOString().slice(0, 10) });
    }
    app.parcelasTemp = parcelas;
    refreshParcelamentoArea();
  };
  document.querySelectorAll('[data-parcela-valor]').forEach(inp => {
    inp.onchange = () => {
      const i = parseInt(inp.dataset.parcelaValor, 10);
      const v = parseFloat(inp.value);
      app.parcelasTemp[i].valor = isNaN(v) ? 0 : v;
      refreshParcelamentoArea();
    };
  });
  document.querySelectorAll('[data-parcela-vencimento]').forEach(inp => {
    inp.onchange = () => { app.parcelasTemp[parseInt(inp.dataset.parcelaVencimento, 10)].vencimento = inp.value; };
  });
  document.querySelectorAll('[data-parcela-remove]').forEach(b => {
    b.onclick = () => {
      app.parcelasTemp.splice(parseInt(b.dataset.parcelaRemove, 10), 1);
      app.parcelasTemp.forEach((p, i) => { p.numero = i + 1; });
      refreshParcelamentoArea();
    };
  });
}

/* ---- Impostos retidos: mesmo padrão do rateio, líquido sempre calculado ---- */
// Imposto retido: só o "Valor líquido" é digitado -- o valor do imposto
// é sempre a diferença (bruto - líquido), sem precisar detalhar o tipo
// (decisão do dono do produto: o que importa aqui é o total pra
// provisionar, não o detalhamento por tipo de imposto). Internamente
// continua guardado como um único item em app.impostoTemp (mesmo
// "formato de linha" de nota_impostos, só que sempre no máximo 1 linha,
// tipo 'outro') -- assim o resto do código (payload, salvarImpostos,
// trigger de valor_liquido no banco) não precisa saber que mudou nada.
// Notas antigas com várias linhas itemizadas continuam existindo e
// aparecem certinho no detalhe da nota (ver TIPO_IMPOSTO_LABEL mais
// abaixo) -- só o formulário de lançar/editar fica mais simples daqui pra frente.
export function renderImpostoArea() {
  if (!app.temImposto) return '';
  const brutoEl = document.getElementById('nf-valor');
  const bruto = brutoEl ? (parseFloat(brutoEl.value) || 0) : 0;
  const impostoAtual = app.impostoTemp.reduce((s, i) => s + i.valor, 0);
  const liquidoInicial = app.impostoTemp.length > 0 ? +(bruto - impostoAtual).toFixed(2) : '';
  return `<div class="imposto-box">
    <div class="field"><label>Valor líquido (R$)</label><input type="number" step="0.01" min="0" id="imp-liquido" value="${liquidoInicial}"></div>
    <div class="field-hint" id="imposto-hint">Valor bruto: <b class="mono">${fmtMoney(bruto)}</b> · Imposto retido (calculado automaticamente): <b class="mono">${fmtMoney(impostoAtual)}</b></div>
  </div>`;
}

export function refreshImpostoArea() {
  const area = document.getElementById('imposto-area');
  if (!area) return;
  area.innerHTML = renderImpostoArea();
  bindImpostoArea();
}

function atualizarHintImposto(bruto, imposto) {
  const hint = document.getElementById('imposto-hint');
  if (hint) hint.innerHTML = `Valor bruto: <b class="mono">${fmtMoney(bruto)}</b> · Imposto retido (calculado automaticamente): <b class="mono">${fmtMoney(imposto)}</b>`;
}

export function bindImpostoArea() {
  const liq = document.getElementById('imp-liquido');
  if (!liq) return;
  liq.oninput = () => {
    const bruto = parseFloat(document.getElementById('nf-valor').value) || 0;
    if (liq.value === '') { app.impostoTemp = []; atualizarHintImposto(bruto, 0); return; }
    const liquido = parseFloat(liq.value);
    if (isNaN(liquido) || liquido < 0) return;
    if (liquido > bruto + 0.001) {
      showToast('O valor líquido não pode ser maior que o valor bruto.');
      app.impostoTemp = [];
      atualizarHintImposto(bruto, 0);
      return;
    }
    const imposto = +(bruto - liquido).toFixed(2);
    app.impostoTemp = imposto > 0 ? [{ id: uid(), tipo: 'outro', valor: imposto, descricao: null }] : [];
    atualizarHintImposto(bruto, imposto);
  };
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
  <div class="tbl-wrap">
  <table class="data-tbl" style="margin-bottom:14px;">
    <thead><tr><th>Fornecedor</th><th>NF</th><th>Valor</th></tr></thead>
    <tbody>
      ${notas.map(n => { const lbl = resolverLabelsNota(n); return `<tr><td>${escapeHtml(lbl.fornecedor_label)}</td><td class="mono">${escapeHtml(n.numero_nota || '—')}</td><td class="mono">${fmtMoney(n.valor_bruto)}</td></tr>`; }).join('')}
    </tbody>
  </table>
  </div>
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

// Aprovação em lote (gerente_financeiro/administrador, ver
// renderQueueAprovacao em ui.js) -- sem campo extra pra preencher (ao
// contrário dos 4 lotes do contas a pagar acima), só confirma; reprovar
// continua individual (formReprovar), sempre com motivo próprio.
export function formLoteAprovar(ids) {
  return `
  ${renderListaNotasLote(ids)}
  <div class="modal-actions">
    <button class="btn btn-brand" id="confirmar-lote-aprovar">Aprovar ${ids.length} nota(s)</button>
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
    <div><div class="k">Fornecedor</div><div class="v">${escapeHtml(lbl.fornecedor_label)}${contratoDoFornecedorVencido ? ` <span class="field-hint" style="display:inline; color:var(--alert);">(⚠ contrato vencido em ${fmtDate(fornDaNota.contrato_vigencia_fim)})</span>` : ''}${fornDaNota && fornDaNota.status === 'pre_cadastro' ? ` <span class="field-hint" style="display:inline; color:var(--alert);">(⚠ fornecedor em pré-cadastro -- precisa ser validado e cadastrado no Group antes de "Lançar no Group")</span>` : ''}</div></div>
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
  <div class="tbl-wrap">
  <table class="data-tbl" style="margin-bottom:8px;">
    <thead><tr><th>Valor</th><th>Centro de custo</th><th>Classe da conta</th><th>Código</th><th>Descrição</th></tr></thead>
    <tbody>
      ${n.rateios.map(r => { const rl = resolverLabelsRateio(r); return `<tr><td class="mono">${fmtMoney(r.valor)}</td><td>${escapeHtml(rl.centro_label)}</td><td>${escapeHtml(rl.classe_label)}</td><td>${escapeHtml(rl.codigo_label || '—')}</td><td>${escapeHtml(r.descricao || '—')}</td></tr>`; }).join('')}
    </tbody>
  </table>
  </div>
  ` : ''}
  ${(n.tem_retencao_imposto && n.impostos && n.impostos.length > 0) ? `
  <hr class="divider">
  <h3 style="font-size:14px;">Impostos retidos</h3>
  <div class="tbl-wrap">
  <table class="data-tbl" style="margin-bottom:8px;">
    <thead><tr><th>Tipo</th><th>Valor</th><th>Descrição</th></tr></thead>
    <tbody>
      ${n.impostos.map(i => `<tr><td>${TIPO_IMPOSTO_LABEL[i.tipo] || i.tipo}</td><td class="mono">${fmtMoney(i.valor)}</td><td>${escapeHtml(i.descricao || '—')}</td></tr>`).join('')}
    </tbody>
  </table>
  </div>
  ` : ''}
  ${n.parcelamento_id ? `
  <hr class="divider">
  <h3 style="font-size:14px;">Parcelamento (parcela ${n.parcela_numero}/${n.parcela_total})</h3>
  <div class="tbl-wrap">
  <table class="data-tbl" style="margin-bottom:8px;">
    <thead><tr><th>Parcela</th><th>Vencimento</th><th>Valor</th><th>Status</th><th></th></tr></thead>
    <tbody>
      ${app.notas.filter(x => x.parcelamento_id === n.parcelamento_id).sort((a, b) => a.parcela_numero - b.parcela_numero).map(x => `
      <tr ${x.id === n.id ? 'style="font-weight:700;"' : ''}>
        <td class="mono">${x.parcela_numero}/${x.parcela_total}</td>
        <td class="mono">${fmtDate(x.vencimento)}</td>
        <td class="mono">${fmtMoney(x.valor_bruto)}</td>
        <td><span class="status-chip" style="background:${STATUS_SOFT[x.status] || 'var(--gray-soft)'}; color:${STATUS_COLOR[x.status] || 'var(--ink-soft)'};">${STATUS_LABEL[x.status] || x.status}</span></td>
        <td>${x.id === n.id ? '' : `<a href="#" data-open="${x.id}">Abrir</a>`}</td>
      </tr>`).join('')}
    </tbody>
  </table>
  </div>
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
  // de volta que o departamento sempre teve) OU contas_a_pagar quando é
  // quem lançou (agora também lança, só pro setor Financeiro, seguindo a
  // mesma alçada do departamento -- por isso trata o próprio lançamento
  // exatamente igual).
  const ehDonoPossivel = r === 'departamento' || r === 'contas_a_pagar';
  const donoDoLancamento = (ehDonoPossivel || ehSuperUsuario()) && podeAgir;
  if (donoDoLancamento && n.status === 'rascunho') {
    actions.push(`<button class="btn btn-amber" data-action="editar_reenviar" data-id="${n.id}">Continuar editando</button>`);
  }
  // Rascunho do formulário simplificado do recebedor (ver ui_recebimento.js)
  // -- mesmo espírito do rascunho acima, só que reabre o formulário
  // simplificado (formRecebimento), não o completo.
  if (donoDoLancamento && n.status === 'rascunho_recebimento') {
    actions.push(`<button class="btn btn-amber" data-action="continuar_recebimento" data-id="${n.id}">Continuar rascunho</button>`);
  }
  if (ehDonoPossivel && podeAgir && n.status === 'lancado' && n.pendente) {
    actions.push(`<button class="btn btn-amber" data-action="editar_reenviar" data-id="${n.id}">Editar e reenviar</button>`);
  }
  // Pendência marcada em qualquer etapa depois de aprovada (pelo contas a
  // pagar, ou pelo CSC via recusa do chamado): quem lançou corrige os
  // dados e devolve, sem voltar pra fila de aprovação de novo. 'recebido'
  // fica de fora -- esse status tem seu próprio bloco logo abaixo, e as
  // duas condições bateriam juntas (mesmo status, mesmo pendente=true),
  // duplicando o botão "Corrigir e devolver" (um abrindo o formulário
  // completo, outro o simples -- bug apontado pelo dono do produto).
  if (donoDoLancamento && n.pendente && n.status !== 'rascunho' && n.status !== 'lancado' && n.status !== 'recebido') {
    actions.push(`<button class="btn btn-amber" data-action="corrigir_pendencia" data-id="${n.id}">Corrigir e devolver</button>`);
  }
  // Nota 'recebido' (perfil recebedor: só anexo + classificação, ver
  // ui_recebimento.js/migration 0029) -- fila é do SETOR, não de quem
  // criou (decisão do dono do produto: "qualquer recebedor pode
  // resolver"), por isso não usa podeAgir/donoDoLancamento aqui.
  if (n.status === 'recebido' && (ehSuperUsuario() || (r === 'departamento' && u.setor === n.setor))) {
    if (n.pendente) {
      // Corrigir a própria devolução (reanexar/reclassificar) continua
      // aberto pra qualquer perfil do setor, recebedor incluído -- é
      // exatamente o que o formulário simplificado dele já sabe fazer.
      actions.push(`<button class="btn btn-amber" data-action="corrigir_recebimento" data-id="${n.id}">Corrigir e devolver</button>`);
      // No lugar do antigo botão duplicado que reabria o formulário
      // completo: excluir de vez. É lançamento simples que nunca saiu do
      // "recebido" -- nada fora do Central CP referencia ainda, então não
      // tem o risco de perder rastro que excluir uma nota já em andamento
      // teria. Só o perfil "completo" (não o recebedor) vê essa opção --
      // ver policy "notas: delete" (migration 0036).
      if (r === 'departamento' && !ehRecebedor()) {
        actions.push(`<button class="btn btn-alert" data-excluir-nota="${n.id}">Excluir</button>`);
      }
    } else if (!ehRecebedor()) {
      // "Completar lançamento" e "Devolver pedindo documento" exigem
      // preencher o resto da nota (valor, vencimento, pagador, forma de
      // pagamento...) -- só o perfil "completo" faz isso; sem esta
      // checagem, qualquer recebedor do mesmo setor via esses botões
      // também (bug apontado pelo dono do produto).
      actions.push(`<button class="btn btn-amber" data-action="completar_recebimento" data-id="${n.id}">Completar lançamento</button>`);
      actions.push(`<button class="btn btn-alert" data-action="marcar_pendencia" data-id="${n.id}">Devolver pedindo documento</button>`);
      // Mesmo raciocínio do caso pendente acima: nota "recebido" ainda sem
      // pendência também nunca saiu do "recebido" -- excluir de vez
      // continua seguro (pedido do dono do produto: o botão só aparecia
      // quando a nota já estava pendente, e ele queria em qualquer
      // "recebido").
      actions.push(`<button class="btn btn-alert" data-excluir-nota="${n.id}">Excluir</button>`);
    }
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
  // Excluir de vez — em geral só antes do Group (rascunho/aguardando
  // aprovação/aprovada), onde nada fora do Central CP referencia a nota
  // ainda: departamento só o próprio rascunho (nunca chegou a ser
  // enviado), gerente_financeiro nessas mesmas 3 etapas. Administrador é
  // exceção deliberada: pode excluir em QUALQUER etapa, inclusive já paga
  // ou cancelada (decisão do dono do produto — às vezes precisa sumir de
  // vez mesmo depois do ciclo inteiro, sem o rastro que "cancelar"
  // deixaria; ver policy "notas: delete" em 0023_admin_exclui_qualquer_etapa.sql).
  const PRE_GROUP = ['rascunho', 'rascunho_recebimento', 'lancado', 'aprovado'];
  if (ehAdministrador() || (PRE_GROUP.includes(n.status) && ((ehDonoPossivel && podeAgir && (n.status === 'rascunho' || n.status === 'rascunho_recebimento')) || ehSuperUsuario()))) {
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
