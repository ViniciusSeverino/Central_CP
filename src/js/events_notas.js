// src/js/events_notas.js — lista de notas, modais de ação e formulário de nota
import { app, LIMITE_APROVACAO_GESTOR, fmtMoney, fmtDate, ehSuperUsuario, contratoVencido, STATUS_LABEL, uid, escapeHtml } from './state.js';
import * as db from './db.js';
import { render, closeModal, closeModalMaybeConfirm, closeModalWithFlash, restoreFocus, bind, recarregarCadastros } from './app.js';
import { bindClassificacaoArea, refreshClassificacaoArea, refreshContaBancariaArea, refreshRateioArea, refreshImpostoArea, bindImpostoArea, refreshParcelamentoArea, bindFornecedorCombo, renderAnexosArea, renderPainelAprendizado, renderPreviewAnexosConteudo, renderTabelaChamado, renderFornecedorPreCadastroArea, renderPreCadastroArquivosLista, zoomControlesHtml, urlPreviewDoArquivo, tipoPreviewDoArquivoNovo } from './ui_nota.js';
import { notasFiltradasTodas } from './ui.js';
import { showToast } from './toast.js';
import { auditarAnexos } from './documentos_obrigatorios.js';
import { TIPO_DOCUMENTO_LABEL } from './leitor_documentos.js';
import { TIPO_DESPESA_LABEL } from './prazo_despesa.js';
import { perguntasPendentes, derivarAncora } from './aprendizado_extracao.js';
import { encontrarTextoNaRegiao, extrairValorDaRegiao, derivarPosicao } from './extracao_posicional.js';

// ---- Pré-visualização de anexos: zoom inline no card e janela externa
// (segundo monitor) ----
//
// Tudo isso vive em nível de módulo (não dentro de attachNotaModalHandlers)
// de propósito: nenhuma dessas funções depende de estado local do
// formulário (só de document/db/showToast, já importados aqui), e
// renderizarConteudoJanelaExterna() precisa poder ser chamada tanto de
// dentro do formulário (refreshPainelAprendizado) quanto de fora dele
// (attachNotaListHandlers, ao abrir um formulário novo -- ver
// fecharPreviewExterno). Os cards só existem dentro da janela externa
// agora (o formulário mostra só o botão "Abrir pré-visualização", ver
// renderPreviewAnexos em ui_nota.js) -- por isso "root" abaixo é sempre o
// document da janela externa na prática, mas o parâmetro continua
// existindo pra não prender essas funções a uma janela específica.
//
// Zoom da imagem direto no card -- por card (não um único estado global),
// porque pode haver vários anexos de imagem ao mesmo tempo.
function bindZoomInlinePreview(root = document) {
  root.querySelectorAll('.preview-card').forEach(card => {
    const wrap = card.querySelector('.preview-imagem-wrap');
    const img = card.querySelector('.preview-imagem');
    const controles = card.querySelector('[data-zoom-controles]');
    if (!wrap || !img || !controles) return;
    let zoom = 1;
    const valor = controles.querySelector('[data-zoom-valor]');
    const atualizar = () => {
      img.style.transform = `scale(${zoom})`;
      if (valor) valor.textContent = Math.round(zoom * 100) + '%';
    };
    const btnMais = controles.querySelector('[data-zoom-mais]');
    if (btnMais) btnMais.onclick = () => { zoom = Math.min(4, zoom + 0.25); atualizar(); };
    const btnMenos = controles.querySelector('[data-zoom-menos]');
    if (btnMenos) btnMenos.onclick = () => { zoom = Math.max(0.5, zoom - 0.25); atualizar(); };
    const btnReset = controles.querySelector('[data-zoom-reset]');
    if (btnReset) btnReset.onclick = () => { zoom = 1; atualizar(); };
    wrap.onwheel = (e) => {
      e.preventDefault();
      zoom = Math.min(4, Math.max(0.5, zoom + (e.deltaY < 0 ? 0.15 : -0.15)));
      atualizar();
    };
  });
}
// Pré-visualização de um anexo já salvo (ver renderPreviewAnexosConteudo em
// ui_nota.js) -- carrega sob demanda (não pré-busca todas de uma vez, já
// que a URL assinada expira e cada uma é uma chamada ao Storage).
function bindCarregarPreviewExistente(root = document) {
  root.querySelectorAll('[data-carregar-preview]').forEach(b => {
    b.onclick = async () => {
      const path = b.dataset.carregarPreview;
      const card = b.closest('.preview-card');
      const tituloTexto = card.querySelector('.preview-titulo').textContent;
      const original = b.textContent;
      b.disabled = true; b.textContent = 'Carregando...';
      try {
        const url = await db.urlAssinadaAnexo(path);
        const ext = (path.split('.').pop() || '').toLowerCase();
        const tipo = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext) ? 'imagem' : (ext === 'pdf' ? 'pdf' : null);
        const corpo = tipo === 'imagem'
          ? `${zoomControlesHtml()}<div class="preview-imagem-wrap"><img src="${url}" class="preview-imagem" data-preview-tipo="imagem"></div>`
          : (tipo === 'pdf' ? `<iframe src="${url}" class="preview-pdf" data-preview-tipo="pdf"></iframe>` : `<div class="preview-indisponivel">Pré-visualização não disponível para este arquivo.</div>`);
        card.innerHTML = `<div class="preview-titulo"><span>${escapeHtml(tituloTexto)}</span></div>${corpo}`;
        bindZoomInlinePreview(root);
      } catch (err) {
        showToast(err.message);
        b.disabled = false; b.textContent = original;
      }
    };
  });
}

// ---- Pré-visualização numa janela à parte (pedido do dono do produto:
// quem usa notebook + monitor externo quer deixar o documento aberto num
// monitor separado do formulário) ----
//
// A "Window Management API" (getScreenDetails) só existe em navegadores
// baseados em Chromium (Chrome/Edge, instalado como app ou não) -- Firefox
// e Safari não implementam. Quando não dá pra detectar o segundo monitor,
// a janela ainda abre (só não sabe posicionar sozinha; o usuário arrasta).
let janelaPreviewExterna = null;
let intervalPreviewExterna = null;

// "Selecionar no documento" (ferramenta de captura, ver
// extracao_posicional.js): { indice, campo } enquanto a pessoa está
// desenhando o retângulo na janela externa pra responder uma pergunta do
// painel de aprendizado, null no estado normal (pré-visualização comum).
// aoConfirmarSelecaoRetangulo é setado por bindPainelAprendizado() (dentro
// de attachNotaModalHandlers, onde responderPergunta vive) a cada render
// -- as funções deste bloco são todas de nível de módulo (mesmo motivo já
// explicado acima pra renderizarConteudoJanelaExterna) e não têm acesso
// direto a responderPergunta, então disparam através desse hook em vez de
// chamá-la diretamente.
let selecaoAtiva = null;
let aoConfirmarSelecaoRetangulo = null;

// abrirPreviewExterno/fecharPreviewExterno só precisam atualizar o painel
// de aprendizado (botão "Abrir pré-visualização" <-> aviso "Aberta em
// outra janela", ver renderPreviewAnexos em ui_nota.js) -- NÃO o
// formulário inteiro. Chamar o render() global reconstruiria o modal do
// zero a partir de `n = {}` (nota nova), apagando fornecedor/valor/datas
// já preenchidos no DOM (esses campos não vivem em app.state, só no
// próprio input) -- por isso o gancho: bindPainelAprendizado() (dentro de
// attachNotaModalHandlers, que tem refreshPainelAprendizado) o mantém
// atualizado a cada render; module-level só dispara.
let aoMudarPreviewExterno = null;

const ROTULO_CAMPO_SELECAO = { numeroNota: 'o número da nota', valor: 'o valor', cnpj: 'o CNPJ', cpf: 'o CPF', data: 'a data' };

// Com mais de 1 anexo, a pré-visualização mescla tudo num PDF só (mesma
// função usada de verdade ao Salvar, ver anexos_pdf.js) -- só pra
// VISUALIZAÇÃO: não mexe em app.anexosNovos/anexosRemovidos, então o
// usuário continua livre pra reordenar/remover normalmente depois de ver
// o resultado combinado (pedido do dono do produto). Cache evita remesclar
// à toa -- refreshPainelAprendizado() roda a cada edição de QUALQUER campo
// do formulário (não só quando o anexo muda), então sem cache a mesclagem
// (baixa cada anexo existente + CDN do pdf-lib) rodaria a cada tecla
// digitada. "geração" evita que um resultado antigo (mesclagem lenta,
// anexo trocado enquanto isso) sobrescreva um mais novo já montado.
let previewMescladoCache = { assinatura: null, url: null };
let geracaoPreviewMesclado = 0;

function fecharPreviewExterno() {
  if (intervalPreviewExterna) { clearInterval(intervalPreviewExterna); intervalPreviewExterna = null; }
  if (janelaPreviewExterna && !janelaPreviewExterna.closed) janelaPreviewExterna.close();
  janelaPreviewExterna = null;
  if (previewMescladoCache.url) { URL.revokeObjectURL(previewMescladoCache.url); previewMescladoCache = { assinatura: null, url: null }; }
  if (app.state.previewExternoAberto) {
    app.state.previewExternoAberto = false;
    if (aoMudarPreviewExterno) aoMudarPreviewExterno(); else render();
  }
}

function focarPreviewExterno() {
  if (janelaPreviewExterna && !janelaPreviewExterna.closed) janelaPreviewExterna.focus();
}

function assinaturaAnexos(existentes) {
  return existentes.join('|') + '::' + app.anexosNovos.map(f => `${f.name}:${f.size}:${f.lastModified}`).join('|');
}

function montarCardMesclado(el, url, quantidade) {
  el.innerHTML = `<div class="preview-card">
    <div class="preview-titulo"><span>Pré-visualização combinada (${quantidade} arquivos)</span></div>
    <iframe src="${url}" class="preview-pdf" title="Pré-visualização combinada"></iframe>
    <div class="field-hint" style="margin-top:4px;">Ao salvar, estes arquivos viram este único PDF, na ordem mostrada no formulário.</div>
  </div>`;
}

async function renderizarPreviewMesclado(el, existentes) {
  const assinatura = assinaturaAnexos(existentes);
  const total = existentes.length + app.anexosNovos.length;
  if (previewMescladoCache.assinatura === assinatura && previewMescladoCache.url) {
    montarCardMesclado(el, previewMescladoCache.url, total);
    return;
  }
  const minhaGeracao = ++geracaoPreviewMesclado;
  el.innerHTML = '<div class="preview-indisponivel">Gerando pré-visualização combinada...</div>';
  try {
    const { mesclarAnexosEmPdfUnico } = await import('./anexos_pdf.js');
    const arquivos = [];
    for (const caminho of existentes) {
      const blob = await db.baixarAnexo(caminho);
      arquivos.push({ name: caminho.split('/').pop(), blob });
    }
    for (const file of app.anexosNovos) arquivos.push({ name: file.name, blob: file });
    const pdfMesclado = await mesclarAnexosEmPdfUnico(arquivos);
    if (minhaGeracao !== geracaoPreviewMesclado) return; // ficou obsoleto (anexos mudaram de novo enquanto mesclava)
    if (previewMescladoCache.url) URL.revokeObjectURL(previewMescladoCache.url);
    const url = URL.createObjectURL(pdfMesclado);
    previewMescladoCache = { assinatura, url };
    if (!janelaPreviewExterna || janelaPreviewExterna.closed) return;
    montarCardMesclado(el, url, arquivos.length);
  } catch (err) {
    if (minhaGeracao !== geracaoPreviewMesclado) return;
    el.innerHTML = `<div class="preview-indisponivel">Não deu pra gerar a pré-visualização combinada: ${escapeHtml(err.message)}</div>`;
  }
}

// Reconstrói o conteúdo da janela externa a partir do MESMO estado usado
// no painel inline (n.anexos + app.anexosNovos) -- chamada toda vez que o
// painel principal é re-renderizado (refreshPainelAprendizado), então os
// dois nunca ficam dessincronizados.
function renderizarConteudoJanelaExterna(n) {
  if (!janelaPreviewExterna || janelaPreviewExterna.closed) return;
  const el = janelaPreviewExterna.document.getElementById('preview-externo-conteudo');
  if (!el) return;
  if (selecaoAtiva) { renderizarModoSelecao(el); return; }
  const existentes = ((n && n.anexos) || []).filter(p => !app.anexosRemovidos.includes(p));
  if (existentes.length + app.anexosNovos.length > 1) {
    renderizarPreviewMesclado(el, existentes);
    return;
  }
  el.innerHTML = renderPreviewAnexosConteudo(n) || '<div class="preview-indisponivel">Nenhum anexo ainda.</div>';
  bindCarregarPreviewExistente(janelaPreviewExterna.document);
  bindZoomInlinePreview(janelaPreviewExterna.document);
}

function notaAtualParaSelecao() {
  return app.notas.find(x => x.id === app.state.modalData) || {};
}

function cancelarSelecao() {
  selecaoAtiva = null;
  renderizarConteudoJanelaExterna(notaAtualParaSelecao());
}

// Troca o conteúdo da janela externa por um retângulo desenhável sobre o
// anexo perguntado -- em vez do card normal (com zoom) ou do preview
// mesclado. Imagem (Fase 2): reaproveita as palavras já posicionadas pelo
// OCR (ver ocr_imagem.js), sem nenhum trabalho extra. PDF (Fase 3):
// renderiza a página atual num canvas sob demanda (ver pdf_render.js) --
// com navegação simples de página quando o PDF tem mais de uma.
async function renderizarModoSelecao(el) {
  const { indice, campo, pagina } = selecaoAtiva;
  const arquivo = app.anexosNovos[indice];
  if (!arquivo) { cancelarSelecao(); return; }
  const rotulo = ROTULO_CAMPO_SELECAO[campo] || campo;
  const tipo = tipoPreviewDoArquivoNovo(arquivo);

  if (tipo === 'imagem') {
    const analise = app.anexosAnalises[indice];
    const palavras = analise && analise.resultado && analise.resultado.palavrasPorPagina && analise.resultado.palavrasPorPagina[1];
    if (!palavras) { cancelarSelecao(); return; }
    const url = urlPreviewDoArquivo(arquivo);
    el.innerHTML = `
      <div class="selecao-instrucao">
        <p>Desenhe um retângulo sobre <b>${escapeHtml(rotulo)}</b> em "${escapeHtml(arquivo.name)}".</p>
        <button type="button" class="btn btn-ghost btn-sm" data-cancelar-selecao>Cancelar</button>
      </div>
      <div class="selecao-imagem-wrap" data-selecao-wrap>
        <img src="${url}" class="selecao-imagem" data-selecao-img alt="${escapeHtml(arquivo.name)}">
        <div class="selecao-retangulo" data-selecao-retangulo hidden></div>
      </div>`;
    const btnCancelar = el.querySelector('[data-cancelar-selecao]');
    if (btnCancelar) btnCancelar.onclick = cancelarSelecao;
    bindSelecaoRetangulo(el, indice, campo, palavras, 1);
    return;
  }

  if (tipo === 'pdf') {
    el.innerHTML = '<div class="preview-indisponivel">Carregando página do PDF...</div>';
    try {
      const { renderizarPaginaPdfEmCanvas, numeroDePaginas } = await import('./pdf_render.js');
      const totalPaginas = await numeroDePaginas(arquivo);
      const paginaAtual = Math.min(Math.max(1, pagina || 1), totalPaginas);
      const { canvas, palavras } = await renderizarPaginaPdfEmCanvas(arquivo, paginaAtual);
      // Enquanto renderizava, a pessoa pode ter cancelado ou trocado de
      // campo/anexo -- não pisa em cima do que já está na tela nesse caso.
      if (!selecaoAtiva || selecaoAtiva.indice !== indice || selecaoAtiva.campo !== campo) return;
      selecaoAtiva.pagina = paginaAtual;
      el.innerHTML = `
        <div class="selecao-instrucao">
          <p>Desenhe um retângulo sobre <b>${escapeHtml(rotulo)}</b> em "${escapeHtml(arquivo.name)}"${totalPaginas > 1 ? ` (página ${paginaAtual} de ${totalPaginas})` : ''}.</p>
          <button type="button" class="btn btn-ghost btn-sm" data-cancelar-selecao>Cancelar</button>
        </div>
        <div class="selecao-imagem-wrap" data-selecao-wrap></div>
        ${totalPaginas > 1 ? `<div class="selecao-pagina-nav">
          <button type="button" class="btn btn-ghost btn-sm" data-pagina-anterior ${paginaAtual <= 1 ? 'disabled' : ''}>‹ Página anterior</button>
          <span>Página ${paginaAtual} de ${totalPaginas}</span>
          <button type="button" class="btn btn-ghost btn-sm" data-pagina-seguinte ${paginaAtual >= totalPaginas ? 'disabled' : ''}>Próxima página ›</button>
        </div>` : ''}`;
      const wrap = el.querySelector('[data-selecao-wrap]');
      canvas.className = 'selecao-imagem';
      canvas.setAttribute('data-selecao-img', '');
      wrap.appendChild(canvas);
      const retangulo = document.createElement('div');
      retangulo.className = 'selecao-retangulo';
      retangulo.setAttribute('data-selecao-retangulo', '');
      retangulo.hidden = true;
      wrap.appendChild(retangulo);
      const btnCancelar = el.querySelector('[data-cancelar-selecao]');
      if (btnCancelar) btnCancelar.onclick = cancelarSelecao;
      const btnAnterior = el.querySelector('[data-pagina-anterior]');
      if (btnAnterior) btnAnterior.onclick = () => { selecaoAtiva.pagina = paginaAtual - 1; renderizarModoSelecao(el); };
      const btnSeguinte = el.querySelector('[data-pagina-seguinte]');
      if (btnSeguinte) btnSeguinte.onclick = () => { selecaoAtiva.pagina = paginaAtual + 1; renderizarModoSelecao(el); };
      bindSelecaoRetangulo(el, indice, campo, palavras, paginaAtual);
    } catch (err) {
      if (!selecaoAtiva || selecaoAtiva.indice !== indice || selecaoAtiva.campo !== campo) return;
      el.innerHTML = `<div class="preview-indisponivel">Não deu pra abrir o PDF pra seleção: ${escapeHtml(err.message)}</div><button type="button" class="btn btn-ghost btn-sm" data-cancelar-selecao>Cancelar</button>`;
      const btnCancelar = el.querySelector('[data-cancelar-selecao]');
      if (btnCancelar) btnCancelar.onclick = cancelarSelecao;
    }
    return;
  }

  // Tipo de arquivo sem suporte à seleção visual -- não deveria chegar
  // aqui (o botão só aparece pra imagem/PDF, ver renderPainelAprendizado
  // em ui_nota.js), mas sai do modo de seleção de qualquer forma.
  cancelarSelecao();
}

// Arrastar do mousedown até o mouseup desenha o retângulo (frações 0..1
// relativas ao próprio elemento visual -- por isso o wrap é inline-block
// ao redor do <img>/<canvas>, sem padding/centralização: a caixa do wrap
// bate exatamente com a caixa do conteúdo, então não precisa desfazer
// nenhum letterboxing/zoom na conta). Ao soltar, cruza a região com as
// palavras posicionadas daquela página (ver extracao_posicional.js) e
// propõe o valor -- se der certo, confirma a pergunta como se a pessoa
// tivesse digitado/escolhido (mesmo caminho de responderPergunta, ver
// aoConfirmarSelecaoRetangulo). numeroPagina: o que fica gravado no hint
// (1 pra imagem; a página de verdade do PDF, pra reaplicar na região
// certa numa próxima nota do mesmo fornecedor).
function bindSelecaoRetangulo(el, indice, campo, palavras, numeroPagina) {
  const wrap = el.querySelector('[data-selecao-wrap]');
  const retangulo = el.querySelector('[data-selecao-retangulo]');
  if (!wrap || !retangulo) return;
  let inicio = null;

  const posicaoRelativa = (e) => {
    const rect = wrap.getBoundingClientRect();
    if (!rect.width || !rect.height) return { x: 0, y: 0 };
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
  };
  const aplicarEstilo = (a, b) => {
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
    const largura = Math.abs(b.x - a.x), altura = Math.abs(b.y - a.y);
    retangulo.style.left = (x * 100) + '%';
    retangulo.style.top = (y * 100) + '%';
    retangulo.style.width = (largura * 100) + '%';
    retangulo.style.height = (altura * 100) + '%';
    retangulo.hidden = false;
    return { x, y, largura, altura };
  };

  wrap.onmousedown = (e) => { e.preventDefault(); inicio = posicaoRelativa(e); retangulo.hidden = true; };
  wrap.onmousemove = (e) => { if (inicio) aplicarEstilo(inicio, posicaoRelativa(e)); };
  wrap.onmouseleave = () => { inicio = null; };
  wrap.onmouseup = (e) => {
    if (!inicio) return;
    const retanguloFinal = aplicarEstilo(inicio, posicaoRelativa(e));
    inicio = null;
    // Retângulo minúsculo (clique sem arrastar de verdade) -- ignora, deixa
    // a pessoa tentar de novo em vez de propor algo de uma região quase
    // vazia.
    if (retanguloFinal.largura < 0.01 || retanguloFinal.altura < 0.01) { retangulo.hidden = true; return; }
    const texto = encontrarTextoNaRegiao(palavras, retanguloFinal);
    const valor = extrairValorDaRegiao(campo, texto);
    if (valor === null || valor === undefined) {
      showToast('Não consegui reconhecer um valor válido nessa região -- tente selecionar de novo, um pouco mais justo.');
      return;
    }
    const posicao = derivarPosicao(numeroPagina, retanguloFinal);
    selecaoAtiva = null;
    if (aoConfirmarSelecaoRetangulo) aoConfirmarSelecaoRetangulo(indice, campo, valor, posicao);
  };
}

// Ativa o modo de seleção pro campo perguntado -- abre a janela externa se
// ainda não estiver aberta (mesmo botão de sempre reaproveitado), ou só
// troca o conteúdo dela se já estiver.
async function ativarSelecaoRetangulo(indice, campo, n) {
  selecaoAtiva = { indice, campo, pagina: 1 };
  if (!janelaPreviewExterna || janelaPreviewExterna.closed) await abrirPreviewExterno(n);
  else renderizarConteudoJanelaExterna(n);
}

async function abrirPreviewExterno(n) {
  // Tamanho padrão (sem segundo monitor detectado) já usa a maior parte da
  // TELA ATUAL -- window.screen.availWidth/Height não precisa de
  // permissão nenhuma, diferente de getScreenDetails() (só entra em uso
  // quando dá pra confirmar que existe mesmo uma segunda tela). Antes essa
  // janela abria pequena (480x860) mesmo em telas grandes -- pedido do
  // dono do produto pra aproveitar melhor o espaço.
  let left, top, width = Math.round(window.screen.availWidth * 0.7), height = Math.round(window.screen.availHeight * 0.85), semSegundaTela = false;
  if (typeof window.getScreenDetails === 'function') {
    try {
      const detalhes = await window.getScreenDetails();
      const outra = detalhes.screens.find(s => s !== detalhes.currentScreen);
      if (outra) {
        left = outra.availLeft + 20;
        top = outra.availTop + 20;
        width = outra.availWidth - 40;
        height = outra.availHeight - 40;
      } else {
        semSegundaTela = true;
      }
    } catch {
      semSegundaTela = true; // permissão negada -- abre a janela mesmo assim, sem posicionar
    }
  } else {
    semSegundaTela = true; // navegador sem suporte (Firefox/Safari)
  }
  const feats = `popup=yes,width=${Math.round(width)},height=${Math.round(height)}` + (left !== undefined ? `,left=${Math.round(left)},top=${Math.round(top)}` : '');
  const janela = window.open('', 'cp_preview_externo', feats);
  if (!janela) { showToast('O navegador bloqueou a nova janela -- permita pop-ups para este site e tente de novo.'); return; }
  janelaPreviewExterna = janela;
  const linkEstilo = document.querySelector('link[rel="stylesheet"][href*="styles.css"]');
  janela.document.title = 'Pré-visualização — Central CP';
  janela.document.head.innerHTML = `<meta charset="UTF-8">${linkEstilo ? `<link rel="stylesheet" href="${linkEstilo.href}">` : ''}`;
  janela.document.body.innerHTML = '<div id="preview-externo-conteudo"></div>';
  janela.document.body.className = 'preview-externo-pagina';
  app.state.previewExternoAberto = true;
  if (aoMudarPreviewExterno) aoMudarPreviewExterno(); else render();
  renderizarConteudoJanelaExterna(n);
  if (semSegundaTela) showToast('Não encontrei uma segunda tela conectada -- a pré-visualização abriu do lado, mas dá pra arrastar pra outro monitor se conectar um depois.');
  if (intervalPreviewExterna) clearInterval(intervalPreviewExterna);
  intervalPreviewExterna = setInterval(() => {
    if (janelaPreviewExterna && janelaPreviewExterna.closed) fecharPreviewExterno();
  }, 1000);
}

/* ---- lista de notas: sempre amarrado, com ou sem modal aberto ---- */
export function attachNotaListHandlers() {
  const bn = document.getElementById('btn-nova-nota');
  if (bn) bn.onclick = () => { fecharPreviewExterno(); app.rateioTemp = []; app.temRateio = false; app.impostoTemp = []; app.temImposto = false; app.anexosNovos = []; app.anexosRemovidos = []; app.anexosAnalises = []; app.state.modal = 'nova_nota'; app.state.modalData = null; render(); };

  // Perfil "recebedor" (ver migration 0029/ui_recebimento.js): formulário
  // simplificado, só anexo + classificação -- botão próprio porque
  // "+ Nova nota" (acima) não aparece pra esse perfil (ver renderShell).
  const bnr = document.getElementById('btn-novo-recebimento');
  if (bnr) bnr.onclick = () => { fecharPreviewExterno(); app.temRateio = false; app.anexosNovos = []; app.anexosRemovidos = []; app.anexosAnalises = []; app.state.modal = 'novo_recebimento'; app.state.modalData = null; render(); };

  document.querySelectorAll('[data-open]').forEach(el => {
    el.onclick = () => { app.state.modal = 'detalhe'; app.state.modalData = el.dataset.open; render(); };
  });

  // Aba "Cadastrar fornecedor" (ver renderQueueCadastrarFornecedor em
  // ui.js/migration 0030): "Validar e ativar" reaproveita o mesmo modal
  // 'editar_fornecedor' de sempre (Cadastros → Fornecedores) -- editar já
  // promove o fornecedor pra status='ativo' (ver db.atualizarFornecedor),
  // então não precisa de um modal/fluxo à parte.
  document.querySelectorAll('[data-validar-fornecedor]').forEach(b => {
    b.onclick = () => {
      const forn = app.cadastros.fornecedores.find(f => f.id === b.dataset.validarFornecedor);
      app.fornecedorContasTemp = (forn && forn.contas) ? forn.contas.map(c => ({ ...c })) : [];
      app.state.modal = 'editar_fornecedor'; app.state.modalData = b.dataset.validarFornecedor; render();
    };
  });
  document.querySelectorAll('[data-baixar-documento-fornecedor]').forEach(a => {
    a.onclick = async (e) => {
      e.preventDefault();
      const original = a.textContent;
      a.textContent = 'Abrindo...';
      try {
        const url = await db.urlAssinadaDocumentoFornecedor(a.dataset.baixarDocumentoFornecedor);
        window.open(url, '_blank', 'noopener');
      } catch (err) {
        showToast(err.message);
      } finally {
        a.textContent = original;
      }
    };
  });

  // "Rateado (n)" em Todas as notas: expande/recolhe as linhas do rateio
  // dessa nota, sem abrir o detalhe (o link fica dentro da linha clicável).
  document.querySelectorAll('[data-toggle-rateio]').forEach(el => {
    el.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = el.dataset.toggleRateio;
      if (app.state.rateiosExpandidos.has(id)) app.state.rateiosExpandidos.delete(id);
      else app.state.rateiosExpandidos.add(id);
      render();
    };
  });

  // Ação em lote do contas a pagar: o botão do cabeçalho de um grupo
  // (pagador+vencimento, na fila) lê os checkboxes marcados NA HORA do
  // clique (data-lote-group) — o usuário pode desmarcar notas do grupo que
  // não devem entrar nesse lançamento específico. O botão individual no
  // detalhe da nota (data-lote-ids com um único id, sem checkbox) cai no
  // mesmo mecanismo — o lote de 1 nota é só um caso particular.
  document.querySelectorAll('[data-lote-action]').forEach(el => {
    el.onclick = () => {
      let ids;
      if (el.dataset.loteGroup) {
        ids = Array.from(document.querySelectorAll(`.grupo-check[data-grupo-key="${el.dataset.loteGroup}"]:checked`)).map(c => c.dataset.notaId);
        if (ids.length === 0) { showToast('Selecione ao menos uma nota do grupo.'); return; }
      } else {
        ids = el.dataset.loteIds.split(',').filter(Boolean);
      }
      app.state.modal = el.dataset.loteAction;
      app.state.modalData = ids;
      render();
    };
  });

  // Checkbox de cada nota dentro do grupo: mantém o contador do botão e o
  // próprio botão (desabilitado se ninguém estiver selecionado) em dia.
  function atualizarContagemGrupo(key) {
    const marcadas = document.querySelectorAll(`.grupo-check[data-grupo-key="${key}"]:checked`).length;
    const countEl = document.querySelector(`[data-grupo-count="${key}"]`);
    if (countEl) countEl.textContent = marcadas;
    const btn = document.querySelector(`[data-lote-action][data-lote-group="${key}"]`);
    if (btn) btn.disabled = marcadas === 0;
  }
  document.querySelectorAll('.grupo-check').forEach(cb => {
    cb.onchange = () => atualizarContagemGrupo(cb.dataset.grupoKey);
  });
  document.querySelectorAll('[data-grupo-select-all]').forEach(a => {
    a.onclick = (e) => {
      e.preventDefault();
      const key = a.dataset.grupoSelectAll;
      document.querySelectorAll(`.grupo-check[data-grupo-key="${key}"]`).forEach(cb => { cb.checked = true; });
      atualizarContagemGrupo(key);
    };
  });
  document.querySelectorAll('[data-grupo-select-none]').forEach(a => {
    a.onclick = (e) => {
      e.preventDefault();
      const key = a.dataset.grupoSelectNone;
      document.querySelectorAll(`.grupo-check[data-grupo-key="${key}"]`).forEach(cb => { cb.checked = false; });
      atualizarContagemGrupo(key);
    };
  });

  const fb = document.getElementById('f-busca');
  if (fb) fb.oninput = () => { app.state.filters.busca = fb.value; render(); restoreFocus('f-busca'); };
  const fs = document.getElementById('f-status');
  if (fs) fs.onchange = () => { app.state.filters.status = fs.value; render(); };
  const fpend = document.getElementById('f-pendente');
  if (fpend) fpend.onchange = () => { app.state.filters.pendente = fpend.value; render(); };
  const fpag = document.getElementById('f-pagador');
  if (fpag) fpag.onchange = () => { app.state.filters.pagadorId = fpag.value; render(); };
  const fsetor = document.getElementById('f-setor');
  if (fsetor) fsetor.onchange = () => { app.state.filters.setor = fsetor.value; render(); };
  const fcc = document.getElementById('f-centro-custo');
  if (fcc) fcc.onchange = () => { app.state.filters.centroCustoId = fcc.value; render(); };
  const fdc = document.getElementById('f-data-campo');
  if (fdc) fdc.onchange = () => { app.state.filters.dataCampo = fdc.value; render(); };
  const fdd = document.getElementById('f-data-de');
  if (fdd) fdd.onchange = () => { app.state.filters.dataDe = fdd.value; render(); };
  const fda = document.getElementById('f-data-ate');
  if (fda) fda.onchange = () => { app.state.filters.dataAte = fda.value; render(); };
  const fcd = document.getElementById('f-competencia-de');
  if (fcd) fcd.onchange = () => { app.state.filters.competenciaDe = fcd.value; render(); };
  const fca = document.getElementById('f-competencia-ate');
  if (fca) fca.onchange = () => { app.state.filters.competenciaAte = fca.value; render(); };
  const blimpar = document.getElementById('btn-limpar-filtros');
  if (blimpar) blimpar.onclick = () => {
    app.state.filters = {
      status: '', busca: '', pendente: '', pagadorId: '', setor: '', centroCustoId: '',
      dataCampo: 'vencimento', dataDe: '', dataAte: '', competenciaDe: '', competenciaAte: '',
    };
    render();
  };

  const btnExportar = document.getElementById('btn-exportar-excel');
  if (btnExportar) btnExportar.onclick = async () => {
    const original = btnExportar.textContent;
    btnExportar.disabled = true; btnExportar.textContent = 'Gerando...';
    try {
      const { exportarNotasExcel } = await import('./export_excel.js');
      await exportarNotasExcel(notasFiltradasTodas());
    } catch (e) {
      showToast('Erro ao gerar o Excel: ' + e.message);
    } finally {
      btnExportar.disabled = false; btnExportar.textContent = original;
    }
  };
}

// Regras de validação/nomeação/anexo compartilhadas entre o lançamento
// individual (abaixo) e o lançamento em lote (events_lote_notas.js) — uma
// nota em lote não deixa de ser uma nota, tem que passar pelas mesmas
// checagens.
export function validarPayload(p) {
  if (!p.data_emissao || !p.vencimento || !p.competencia || !p.numero_nota || !p.valor_bruto || !p.pagador_id || !p.fornecedor_id || !p.forma_pagamento || !p.classificacao) {
    return 'Preencha todos os campos obrigatórios: emissão, vencimento, competência, NF, valor bruto, pagador, fornecedor, forma de pagamento e classificação.';
  }
  if (!p.setor) return 'Selecione o setor dessa nota.';
  if (p.forma_pagamento === 'TED' || p.forma_pagamento === 'Pix') {
    const forn = app.cadastros.fornecedores.find(f => f.id === p.fornecedor_id);
    if (forn && forn.contas && forn.contas.length > 0 && !p.conta_bancaria_id) {
      return 'Selecione a conta bancária do fornecedor para pagamento via TED/Pix.';
    }
  }
  if (p.tem_rateio) {
    if (p.rateios.length === 0) return 'Inclua ao menos uma linha de rateio, ou selecione "Não" para classificar a nota toda de uma vez.';
    const soma = p.rateios.reduce((s, r) => s + r.valor, 0);
    if (Math.abs(soma - p.valor_bruto) > 0.01) return `A soma do rateio (${fmtMoney(soma)}) precisa ser igual ao valor bruto da nota (${fmtMoney(p.valor_bruto)}).`;
  } else {
    if (!p.classe_conta_id || !p.centro_custo_id) return 'Selecione o centro de custo e a classe da conta.';
  }
  if (p.tem_retencao_imposto && p.impostos.length === 0) {
    return 'Inclua ao menos um imposto retido, ou desmarque "Tem retenção de imposto".';
  }
  if (p.tem_parcelamento) {
    if (p.parcelas.length < 2) return 'Informe ao menos 2 parcelas, ou selecione "Não" para lançar uma nota só.';
    if (p.parcelas.some(pc => !pc.vencimento)) return 'Preencha o vencimento de todas as parcelas.';
    const somaParcelas = p.parcelas.reduce((s, pc) => s + pc.valor, 0);
    if (Math.abs(somaParcelas - p.valor_bruto) > 0.01) return `A soma das parcelas (${fmtMoney(somaParcelas)}) precisa ser igual ao valor bruto da nota (${fmtMoney(p.valor_bruto)}).`;
  }
  return null;
}

// Aviso (não bloqueio) de possível NF duplicada — mesmo fornecedor + mesmo
// número já lançado antes. Olha só dentro do que o usuário atual já
// enxerga (respeitando o RLS de `notas`), não é uma checagem global.
export function notaDuplicadaExistente(fornecedorId, numeroNota) {
  const alvo = (numeroNota || '').trim().toLowerCase();
  if (!alvo) return null;
  return app.notas.find(n =>
    n.fornecedor_id === fornecedorId
    && (n.numero_nota || '').trim().toLowerCase() === alvo
  ) || null;
}

// Resolve os dados que o nome padrão do arquivo final precisa (ver
// nomeArquivoFinal em anexos_pdf.js) a partir do payload já coletado do
// formulário — mesmos ids que coletarPayload() usa pra montar a nota.
export function dadosParaNomeArquivo(p) {
  const pagador = app.cadastros.pagadores.find(x => x.id === p.pagador_id);
  const fornecedor = app.cadastros.fornecedores.find(x => x.id === p.fornecedor_id);
  return {
    pagadorSigla: pagador ? pagador.sigla : null,
    vencimento: p.vencimento,
    fornecedorNome: fornecedor ? fornecedor.nome : null,
    numeroNota: p.numero_nota,
    formaPagamento: p.forma_pagamento,
  };
}

// Aplica os anexos de verdade: apaga do Storage o que foi marcado pra
// remover, baixa o que ficou de fora dessa lista (já existia antes desta
// edição) e junta com os arquivos novos escolhidos agora (lidos de
// app.anexosNovos/app.anexosRemovidos) — tudo vira UM PDF só, com o nome
// padrão da empresa (ver anexos_pdf.js), não importa se veio de 1 arquivo
// ou de vários. Só chamado no momento do Salvar (cancelar o modal
// simplesmente descarta as duas listas sem tocar em nada no Storage).
export async function finalizarAnexos(notaId, existentes, dadosNota) {
  const mantidos = (existentes || []).filter(p => !app.anexosRemovidos.includes(p));
  if (mantidos.length === 0 && app.anexosNovos.length === 0) {
    // Nada sobrou: limpa tudo que existia (removidos, e qualquer sobra
    // de uma mesclagem anterior) e volta vazio — sem isso ficaria lixo
    // órfão no Storage.
    for (const caminho of existentes || []) await db.removerAnexo(caminho);
    return [];
  }
  const { mesclarAnexosEmPdfUnico, nomeArquivoFinal } = await import('./anexos_pdf.js');
  const arquivos = [];
  for (const caminho of mantidos) {
    const blob = await db.baixarAnexo(caminho);
    arquivos.push({ name: caminho.split('/').pop(), blob });
  }
  for (const file of app.anexosNovos) arquivos.push({ name: file.name, blob: file });
  const pdfFinal = await mesclarAnexosEmPdfUnico(arquivos);
  const nomeFinal = nomeArquivoFinal(dadosNota);
  const caminhoFinal = await db.substituirAnexosFinal(notaId, pdfFinal, nomeFinal);
  return [caminhoFinal];
}

// Resumo da auditoria de anexos (leitor de documentos, documento WE9)
// pra registrar no histórico da nota — só existe registro quando algo foi
// de fato analisado nesta sessão (rascunho reaberto sem mexer nos anexos
// não gera uma entrada nova toda vez que é salvo de novo). Compartilhado
// com o lançamento em lote (events_lote_notas.js).
export function resumoAuditoriaParaHistorico(payload, anexosAnalises) {
  const analises = (anexosAnalises || app.anexosAnalises).filter(a => a && a.status === 'pronto' && a.resultado).map(a => a.resultado);
  if (analises.length === 0) return null;
  const auditoria = auditarAnexos(payload, analises);
  const partes = [`Documentos identificados: ${analises.map(a => `${TIPO_DOCUMENTO_LABEL[a.tipoDetectado] || a.tipoDetectado} (${a.fonte === 'ocr' ? 'OCR' : 'texto do PDF'})`).join(', ')}.`];
  if (auditoria.faltando.length > 0) partes.push(`Documentos não identificados: ${auditoria.faltando.map(f => f.label).join(', ')}.`);
  if (auditoria.divergencias.length > 0) partes.push(`Divergências: ${auditoria.divergencias.join(' ')}`);
  return partes.join(' ');
}

// Decide o status inicial de uma nota nova a partir de quem lança e do
// valor — mesma regra pro lançamento individual e em lote: quem já tem
// autoridade total de aprovação (administrador/gerente_financeiro) sai
// direto aprovada, independente do valor; departamento fica sujeito ao
// limite de alçada normal.
export function statusInicialParaValor(valorBruto) {
  const lancadoPorSuper = ehSuperUsuario();
  const novoStatus = lancadoPorSuper ? 'aprovado' : (valorBruto > LIMITE_APROVACAO_GESTOR ? 'lancado' : 'aprovado');
  const autoAprovada = novoStatus === 'aprovado';
  const motivoAutoAprovacao = lancadoPorSuper
    ? 'Lançada por um perfil com autoridade de aprovação — segue direto para o contas a pagar.'
    : `Valor de ${fmtMoney(valorBruto)} está dentro da alçada (até ${fmtMoney(LIMITE_APROVACAO_GESTOR)}) — segue direto para o contas a pagar.`;
  const msgFlashAutoAprovada = lancadoPorSuper
    ? 'já liberada direto para o contas a pagar.'
    : 'dentro da alçada, já liberada direto para o contas a pagar.';
  return { novoStatus, autoAprovada, motivoAutoAprovacao, msgFlashAutoAprovada };
}

/* ---- modais de nota: só amarrado quando app.state.modal está setado ---- */
export function attachNotaModalHandlers() {
  const bg = document.getElementById('modal-bg'); // só existe no modo janela pequena
  const pageRoot = document.querySelector('.page-form'); // só existe no modo página inteira
  const protect = (bg && bg.dataset.protect === '1') || (pageRoot && pageRoot.dataset.protect === '1');
  if (bg) bg.onclick = (e) => { if (e.target.id === 'modal-bg' && !protect) { fecharPreviewExterno(); closeModal(); } };
  const mc = document.getElementById('modal-close'); if (mc) mc.onclick = () => { fecharPreviewExterno(); closeModalMaybeConfirm(protect); };
  const cancel = document.getElementById('modal-cancel'); if (cancel) cancel.onclick = () => { fecharPreviewExterno(); closeModalMaybeConfirm(protect); };

  document.querySelectorAll('[data-action]').forEach(b => {
    b.onclick = () => {
      app.state.modal = b.dataset.action; app.state.modalData = b.dataset.id;
      // 'completar_recebimento' reaproveita o formulário inteiro
      // (formNovaNota) igual editar_reenviar/corrigir_pendencia --
      // 'corrigir_recebimento' entra aqui só pelo reset de anexos (o
      // formulário simplificado não tem rateio/imposto, mas resetar os
      // dois é inofensivo).
      if (['editar_reenviar', 'corrigir_pendencia', 'completar_recebimento', 'corrigir_recebimento', 'continuar_recebimento'].includes(app.state.modal)) {
        fecharPreviewExterno();
        const n = app.notas.find(x => x.id === app.state.modalData);
        app.rateioTemp = (n.rateios || []).map(r => ({ ...r }));
        app.temRateio = !!n.tem_rateio;
        app.impostoTemp = (n.impostos || []).map(i => ({ ...i }));
        app.temImposto = !!n.tem_retencao_imposto;
        app.anexosNovos = [];
        app.anexosRemovidos = [];
        app.anexosAnalises = [];
      }
      render();
    };
  });

  if (app.state.modal === 'nova_nota' || app.state.modal === 'editar_reenviar' || app.state.modal === 'corrigir_pendencia' || app.state.modal === 'completar_recebimento') {
    bindClassificacaoArea();
    bindFornecedorCombo(() => { refreshContaBancariaArea(); aoSelecionarFornecedor(); });
    const valorInput = document.getElementById('nf-valor');
    if (valorInput) valorInput.oninput = () => { if (app.temRateio) refreshRateioArea(); if (app.temImposto) refreshImpostoArea(); if (app.temParcelamento) refreshParcelamentoArea(); refreshAnexosArea(); };
    const numeroInput = document.getElementById('nf-numero');
    if (numeroInput) numeroInput.oninput = () => refreshAnexosArea();
    const selPagador = document.getElementById('nf-pagador');
    if (selPagador) selPagador.onchange = () => { refreshClassificacaoArea(); };
    const selForma = document.getElementById('nf-forma-pagamento');
    if (selForma) selForma.onchange = () => { refreshContaBancariaArea(); refreshAnexosArea(); };
    const selTipoContratacao = document.getElementById('nf-tipo-contratacao');
    if (selTipoContratacao) selTipoContratacao.onchange = () => refreshAnexosArea();
    const selTipoDespesa = document.getElementById('nf-tipo-despesa');
    const legendaTipoDespesa = document.getElementById('tipo-despesa-legenda');
    if (selTipoDespesa && legendaTipoDespesa) {
      selTipoDespesa.onchange = () => {
        legendaTipoDespesa.textContent = TIPO_DESPESA_LABEL[selTipoDespesa.value] || TIPO_DESPESA_LABEL.padrao;
      };
    }
    const selTemRateio = document.getElementById('nf-tem-rateio');
    if (selTemRateio) selTemRateio.onchange = () => { app.temRateio = selTemRateio.value === 'sim'; refreshClassificacaoArea(); };
    const chkTemImposto = document.getElementById('nf-tem-imposto');
    if (chkTemImposto) chkTemImposto.onchange = () => { app.temImposto = chkTemImposto.checked; refreshImpostoArea(); refreshAnexosArea(); };
    const selTemParcelamento = document.getElementById('nf-tem-parcelamento');
    if (selTemParcelamento) selTemParcelamento.onchange = () => { app.temParcelamento = selTemParcelamento.value === 'sim'; app.parcelasTemp = []; refreshParcelamentoArea(); };
    // refreshImpostoArea() (não só bindImpostoArea()) -- nesse ponto o DOM
    // real do modal já existe (attachNotaModalHandlers roda depois do
    // appEl.innerHTML ser atribuído, ver render() em app.js), então agora
    // sim dá pra ler o valor bruto de verdade. Sem isso, o "Valor líquido"
    // inicial de uma nota já existente com retenção vinha calculado com
    // bruto=0 (documento ainda não montado no momento em que
    // renderImpostoArea() roda dentro de formNovaNota()), mostrando um
    // valor errado até a pessoa mexer em outro campo.
    refreshImpostoArea();
    bindAnexosArea();
    bindPainelAprendizado();
    bindFornecedorPreCadastroArea();
  }

  document.querySelectorAll('[data-goto-cadastros]').forEach(a => {
    a.onclick = (e) => {
      e.preventDefault();
      app.state.modal = null; app.state.modalData = null;
      app.state.view = 'cadastros'; app.state.configTab = 'cadastros'; app.state.cadastroTab = a.dataset.gotoCadastros;
      render();
    };
  });

  // Excluir de vez: ação instantânea com confirm(), sem passar pelo fluxo
  // de modal (não tem formulário — só uma pergunta de sim/não). Fora do
  // pré-Group só administrador vê esse botão (ver ui_nota.js) — reforça o
  // aviso nesse caso porque a nota pode já ter referência fora do Central
  // CP (Group/Acelerato/CSC) ou já estar paga, e excluir aqui não desfaz
  // nem apaga esses registros externos.
  document.querySelectorAll('[data-excluir-nota]').forEach(b => {
    b.onclick = async () => {
      const nota = app.notas.find(n => n.id === b.dataset.excluirNota);
      const foraDoPreGroup = nota && !['rascunho', 'lancado', 'aprovado'].includes(nota.status);
      const aviso = foraDoPreGroup
        ? `Excluir esta nota definitivamente? Ela já está em "${STATUS_LABEL[nota.status] || nota.status}" — se já tiver lançamento no Group, chamado no Acelerato ou já estiver paga, esses registros externos NÃO são apagados, só some o registro aqui no Central CP. Essa ação não pode ser desfeita.`
        : 'Excluir esta nota definitivamente? Essa ação não pode ser desfeita — o lançamento, os anexos e o histórico serão apagados de vez.';
      if (!confirm(aviso)) return;
      const original = b.textContent;
      b.disabled = true; b.textContent = 'Excluindo...';
      try {
        await db.excluirNota(b.dataset.excluirNota);
        app.notas = await db.carregarNotas();
        closeModalWithFlash('Nota excluída.');
      } catch (e) {
        showToast('Erro ao excluir: ' + e.message);
        b.disabled = false; b.textContent = original;
      }
    };
  });

  // Detalhe da nota: link de cada anexo já salvo gera um link assinado
  // (o bucket é privado) e abre numa aba nova.
  document.querySelectorAll('[data-baixar-anexo]').forEach(a => {
    a.onclick = async (e) => {
      e.preventDefault();
      const original = a.textContent;
      a.textContent = 'Abrindo...';
      try {
        const url = await db.urlAssinadaAnexo(a.dataset.baixarAnexo);
        window.open(url, '_blank', 'noopener');
      } catch (err) {
        showToast(err.message);
      } finally {
        a.textContent = original;
      }
    };
  });

  // Área de anexos do formulário: reaproveita a nota que está sendo
  // editada (se houver) pra saber quais anexos já existem, pra poder
  // re-renderizar só essa área sem perder o resto do formulário.
  function notaDoFormularioAtual() {
    return app.state.modalData ? (app.notas.find(x => x.id === app.state.modalData) || {}) : {};
  }
  // Pré-cadastro de fornecedor inline (ver renderFornecedorPreCadastroArea
  // em ui_nota.js/migration 0030) -- área com refresh próprio, mesmo
  // padrão das outras (anexos/rateio/imposto): não mexe no resto do
  // formulário quando expande/recolhe ou troca o arquivo escolhido.
  function refreshFornecedorPreCadastroArea() {
    const el = document.getElementById('fornecedor-pre-cadastro-area');
    if (el) el.innerHTML = renderFornecedorPreCadastroArea();
    bindFornecedorPreCadastroArea();
  }
  // Só a lista de arquivos tem refresh isolado -- reconstruir a área
  // inteira apagaria o nome/CNPJ já digitados (ver comentário em
  // renderPreCadastroArquivosLista, ui_nota.js).
  function refreshPreCadastroArquivosLista() {
    const el = document.getElementById('pcf-arquivos-lista');
    if (el) el.innerHTML = renderPreCadastroArquivosLista();
    document.querySelectorAll('[data-remover-pre-cadastro-arquivo]').forEach(a => {
      a.onclick = (e) => { e.preventDefault(); app.preCadastroFornecedorArquivos.splice(parseInt(a.dataset.removerPreCadastroArquivo), 1); refreshPreCadastroArquivosLista(); };
    });
  }
  function bindFornecedorPreCadastroArea() {
    const link = document.getElementById('link-abrir-pre-cadastro-fornecedor');
    if (link) link.onclick = (e) => { e.preventDefault(); app.state.preCadastroFornecedorAberto = true; refreshFornecedorPreCadastroArea(); };
    const cancelar = document.getElementById('btn-cancelar-pre-cadastro-fornecedor');
    if (cancelar) cancelar.onclick = () => { app.state.preCadastroFornecedorAberto = false; app.preCadastroFornecedorArquivos = []; refreshFornecedorPreCadastroArea(); };
    const input = document.getElementById('pcf-anexos-input');
    if (input) input.onchange = () => { app.preCadastroFornecedorArquivos.push(...Array.from(input.files)); refreshPreCadastroArquivosLista(); };
    refreshPreCadastroArquivosLista();
    const btnSalvar = document.getElementById('btn-pre-cadastrar-fornecedor');
    if (btnSalvar) btnSalvar.onclick = async () => {
      const nome = formVal('pcf-nome').trim();
      const cnpj = formVal('pcf-cnpj').trim();
      if (!nome) { showToast('Informe o nome do fornecedor.'); return; }
      if (app.preCadastroFornecedorArquivos.length === 0) { showToast('Anexe ao menos um documento.'); return; }
      const original = btnSalvar.textContent;
      btnSalvar.disabled = true; btnSalvar.textContent = 'Salvando...';
      try {
        const forn = await db.preCadastrarFornecedor({ nome, cnpj }, app.preCadastroFornecedorArquivos, app.usuario);
        await recarregarCadastros();
        app.state.preCadastroFornecedorAberto = false;
        app.preCadastroFornecedorArquivos = [];
        const fornecedorHidden = document.getElementById('nf-fornecedor');
        const fornecedorBusca = document.getElementById('nf-fornecedor-busca');
        if (fornecedorHidden) fornecedorHidden.value = forn.id;
        if (fornecedorBusca) fornecedorBusca.value = forn.nome;
        refreshFornecedorPreCadastroArea();
        refreshContaBancariaArea();
        showToast('Fornecedor pré-cadastrado e selecionado nesta nota — o CP vai revisar antes de cadastrar no Group.');
      } catch (e) {
        showToast('Erro ao pré-cadastrar: ' + e.message);
        btnSalvar.disabled = false; btnSalvar.textContent = original;
      }
    };
  }
  // Campos que a auditoria de anexos (leitor de documentos) precisa —
  // lidos direto do DOM porque ela reage ao formulário em tempo real,
  // antes de qualquer salvar.
  function payloadParcialAuditoria() {
    return {
      forma_pagamento: formVal('nf-forma-pagamento'), tipo_contratacao: formVal('nf-tipo-contratacao') || null,
      tem_retencao_imposto: app.temImposto, numero_nota: formVal('nf-numero'), valor_bruto: parseFloat(formVal('nf-valor')) || 0,
    };
  }
  function refreshAnexosArea() {
    const el = document.getElementById('anexos-area');
    if (el) el.innerHTML = renderAnexosArea(notaDoFormularioAtual(), payloadParcialAuditoria(), { painelLateral: true });
    refreshPainelAprendizado();
    bindAnexosArea();
  }
  function refreshPainelAprendizado() {
    const chatEl = document.getElementById('nota-chat-col');
    if (!chatEl) return;
    const n = notaDoFormularioAtual();
    chatEl.innerHTML = renderPainelAprendizado(n, payloadParcialAuditoria(), { permitePreencher: true });
    bindPainelAprendizado();
    renderizarConteudoJanelaExterna(n);
  }
  // Dicas já aprendidas (ver aprendizado_extracao.js) pro fornecedor
  // atualmente selecionado -- vazio se ainda não escolheu (a ordem do
  // formulário é anexar os documentos primeiro).
  function hintsParaFornecedor(fornecedorId) {
    if (!fornecedorId) return [];
    return app.extracaoHints.filter(h => h.fornecedor_id === fornecedorId);
  }
  // Dispara o leitor de documentos pra um anexo recém-adicionado (índice
  // em app.anexosNovos) — assíncrono, não trava a UI; atualiza a linha
  // dele na auditoria assim que terminar (ou marca erro, sem travar o
  // anexo em si: a leitura é só um apoio, nunca uma obrigação).
  async function analisarNovoAnexo(indice) {
    const arquivo = app.anexosNovos[indice];
    if (!arquivo) return;
    app.anexosAnalises[indice] = { status: 'analisando', resultado: null, respondido: [] };
    try {
      const { analisarAnexo } = await import('./leitor_documentos.js');
      const hints = hintsParaFornecedor(formVal('nf-fornecedor'));
      const resultado = await analisarAnexo(arquivo, hints);
      if (app.anexosNovos[indice] !== arquivo) return; // removido antes de terminar
      app.anexosAnalises[indice] = { status: 'pronto', resultado, respondido: [] };
    } catch {
      if (app.anexosNovos[indice] !== arquivo) return;
      app.anexosAnalises[indice] = { status: 'erro', resultado: null, respondido: [] };
    }
    refreshAnexosArea();
  }
  function paraNumeroBrLocal(strBr) {
    const s = String(strBr);
    const limpo = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
    const n = parseFloat(limpo);
    return Number.isNaN(n) ? null : n;
  }
  // Salva (ou atualiza) a dica de extração do fornecedor -- por âncora de
  // texto (só quando dá pra derivar uma âncora confiável: o valor
  // escolhido aparece de verdade no texto do documento) e/ou por posição
  // (retângulo desenhado na pré-visualização, ver extracao_posicional.js/
  // bindSelecaoRetangulo). Sem nenhum dos dois, a correção vale só pra
  // essa nota, não vira aprendizado.
  async function persistirHint(fornecedorId, campo, valorEscolhido, texto, posicao) {
    const ancora = campo === 'tipo' ? '' : derivarAncora(texto, String(valorEscolhido));
    if (campo !== 'tipo' && !ancora && !posicao) return;
    const payload = { fornecedor_id: fornecedorId, campo, valor_exemplo: String(valorEscolhido) };
    if (ancora) payload.ancora = ancora;
    if (posicao) Object.assign(payload, posicao);
    try {
      await db.salvarExtracaoHint(payload, app.usuario.id);
      const existente = app.extracaoHints.find(h => h.fornecedor_id === fornecedorId && h.campo === campo);
      if (existente) Object.assign(existente, payload);
      else app.extracaoHints.push(payload);
    } catch (e) { showToast(e.message); }
  }
  // Resposta a uma pergunta do painel "ensinar o leitor" -- corrige a
  // nota atual na hora e, se o fornecedor já foi escolhido, salva como
  // dica pras próximas notas do mesmo fornecedor; senão fica em fila (ver
  // aoSelecionarFornecedor) até a pessoa escolher. posicao (opcional): só
  // quando a resposta veio da ferramenta de seleção por retângulo (ver
  // bindSelecaoRetangulo), não da digitação/chip de sempre.
  async function responderPergunta(indice, campo, valor, posicao) {
    const analise = app.anexosAnalises[indice];
    if (!analise || !analise.resultado) return;
    const perguntaObj = perguntasPendentes(analise.resultado).find(p => p.campo === campo);
    if (!analise.respondido) analise.respondido = [];
    analise.respondido.push({ pergunta: perguntaObj ? perguntaObj.pergunta : '', valor });
    if (campo === 'tipo') {
      analise.resultado.tipoDetectado = valor;
    } else if (campo === 'valor') {
      const v = paraNumeroBrLocal(valor);
      analise.resultado.campos.valor = v !== null ? v : valor;
    } else {
      analise.resultado.campos[campo] = valor;
    }
    const fornecedorId = formVal('nf-fornecedor');
    if (fornecedorId) {
      await persistirHint(fornecedorId, campo, valor, analise.resultado.texto, posicao);
    } else {
      app.hintsPendentes = app.hintsPendentes.filter(h => h.campo !== campo);
      app.hintsPendentes.push({ campo, valor, texto: analise.resultado.texto, posicao });
    }
    refreshAnexosArea();
  }
  // Ao escolher (ou trocar) o fornecedor: descarrega as respostas dadas
  // antes de escolher (fila em app.hintsPendentes) como dicas de verdade,
  // e reaplica TODAS as dicas já conhecidas desse fornecedor nos anexos já
  // analisados -- sem precisar reler o arquivo, só reprocessa o texto que
  // já foi extraído (ver reclassificarComHints em leitor_documentos.js).
  async function aoSelecionarFornecedor() {
    const fornecedorId = formVal('nf-fornecedor');
    if (!fornecedorId) return;
    for (const pendente of app.hintsPendentes) {
      await persistirHint(fornecedorId, pendente.campo, pendente.valor, pendente.texto, pendente.posicao);
    }
    app.hintsPendentes = [];
    const hints = hintsParaFornecedor(fornecedorId);
    const { reclassificarComHints } = await import('./leitor_documentos.js');
    app.anexosAnalises.forEach(a => {
      if (a && a.status === 'pronto' && a.resultado && a.resultado.texto) {
        const { tipoDetectado, campos } = reclassificarComHints(a.resultado.texto, hints);
        a.resultado.tipoDetectado = tipoDetectado;
        a.resultado.campos = campos;
      }
    });
    refreshAnexosArea();
  }
  function bindPainelAprendizado() {
    document.querySelectorAll('[data-chat-resposta]').forEach(b => {
      b.onclick = () => {
        const [i, campo, valorEncoded] = b.dataset.chatResposta.split(':');
        responderPergunta(Number(i), campo, decodeURIComponent(valorEncoded));
      };
    });
    document.querySelectorAll('[data-chat-manual-confirmar]').forEach(b => {
      b.onclick = () => {
        const [i, campo] = b.dataset.chatManualConfirmar.split(':');
        const input = document.querySelector(`[data-chat-manual-input="${i}:${campo}"]`);
        const valor = input ? input.value.trim() : '';
        if (valor) responderPergunta(Number(i), campo, valor);
      };
    });
    // Pré-visualização: só existe dentro da janela externa agora (ver
    // renderPreviewAnexos em ui_nota.js) -- o formulário em si só tem o
    // botão que abre/foca/traz ela de volta. aoMudarPreviewExterno:
    // refresca só o painel de aprendizado quando a janela abre/fecha (ver
    // abrirPreviewExterno/fecharPreviewExterno, nível de módulo) -- evita
    // que essas funções chamem o render() global, que reconstruiria o
    // formulário inteiro e apagaria fornecedor/valor/datas já preenchidos.
    aoMudarPreviewExterno = refreshPainelAprendizado;
    const btnAbrirExterno = document.querySelector('[data-abrir-preview-externo]');
    if (btnAbrirExterno) btnAbrirExterno.onclick = () => abrirPreviewExterno(notaDoFormularioAtual());
    const btnFocarExterno = document.querySelector('[data-focar-preview-externo]');
    if (btnFocarExterno) btnFocarExterno.onclick = () => focarPreviewExterno();
    const btnFecharExterno = document.querySelector('[data-fechar-preview-externo]');
    if (btnFecharExterno) btnFecharExterno.onclick = () => fecharPreviewExterno();

    // "Selecionar no documento" (ver renderizarModoSelecao/
    // bindSelecaoRetangulo, nível de módulo): abre/troca a janela externa
    // pro modo de seleção; ao confirmar um retângulo, o hook chama
    // responderPergunta() com o mesmo efeito de digitar/escolher a
    // resposta manualmente.
    aoConfirmarSelecaoRetangulo = (indice, campo, valor, posicao) => responderPergunta(indice, campo, valor, posicao);
    document.querySelectorAll('[data-selecionar-no-documento]').forEach(b => {
      b.onclick = () => {
        const [i, campo] = b.dataset.selecionarNoDocumento.split(':');
        ativarSelecaoRetangulo(Number(i), campo, notaDoFormularioAtual());
      };
    });
  }

  function bindAnexosArea() {
    const input = document.getElementById('nf-anexos-input');
    if (input) input.onchange = () => {
      const novos = Array.from(input.files);
      const indiceInicial = app.anexosNovos.length;
      app.anexosNovos.push(...novos);
      refreshAnexosArea();
      novos.forEach((_, i) => analisarNovoAnexo(indiceInicial + i));
    };
    document.querySelectorAll('[data-remover-anexo]').forEach(a => {
      a.onclick = (e) => { e.preventDefault(); app.anexosRemovidos.push(a.dataset.removerAnexo); refreshAnexosArea(); };
    });
    document.querySelectorAll('[data-remover-anexo-novo]').forEach(a => {
      a.onclick = (e) => {
        e.preventDefault();
        const i = Number(a.dataset.removerAnexoNovo);
        app.anexosNovos.splice(i, 1);
        app.anexosAnalises.splice(i, 1);
        refreshAnexosArea();
      };
    });
    // Organizar a ordem dos anexos (quando mais de um) -- a ordem da
    // lista é a ordem final das páginas no PDF único mesclado (ver
    // finalizarAnexos, que percorre app.anexosNovos nessa mesma sequência).
    // anexosAnalises é um array paralelo (mesmo índice) -- precisa mover
    // junto, senão a análise do leitor de documentos ficaria grudada no
    // arquivo errado depois de reordenar.
    document.querySelectorAll('[data-mover-anexo-novo]').forEach(a => {
      a.onclick = (e) => {
        e.preventDefault();
        const i = Number(a.dataset.moverAnexoNovo);
        const alvo = a.dataset.direcao === 'cima' ? i - 1 : i + 1;
        if (alvo < 0 || alvo >= app.anexosNovos.length) return;
        [app.anexosNovos[i], app.anexosNovos[alvo]] = [app.anexosNovos[alvo], app.anexosNovos[i]];
        [app.anexosAnalises[i], app.anexosAnalises[alvo]] = [app.anexosAnalises[alvo], app.anexosAnalises[i]];
        refreshAnexosArea();
        refreshPainelAprendizado();
      };
    });
    document.querySelectorAll('[data-preencher-com-documento]').forEach(b => {
      b.onclick = () => {
        const analise = app.anexosAnalises[Number(b.dataset.preencherComDocumento)];
        const campos = analise && analise.resultado && analise.resultado.campos;
        if (!campos) return;
        const numeroEl = document.getElementById('nf-numero');
        if (numeroEl && campos.numeroNota) numeroEl.value = campos.numeroNota;
        const valorEl = document.getElementById('nf-valor');
        if (valorEl && campos.valor != null) valorEl.value = campos.valor;
        showToast('Campos preenchidos com os dados lidos do documento — confira antes de salvar.');
        refreshAnexosArea();
        if (app.temRateio) refreshRateioArea();
        if (app.temImposto) refreshImpostoArea();
      };
    });
  }

  function formVal(id) { const el = document.getElementById(id); return el ? el.value : ''; }

  function coletarPayload() {
    const contaBancariaEl = document.getElementById('nf-conta-bancaria');
    let classe_conta_id = null, centro_custo_id = null, codigo_classificacao_id = null, rateios = [];
    if (app.temRateio) rateios = app.rateioTemp.map(r => ({ ...r }));
    else {
      classe_conta_id = formVal('nf-classe-conta') || null;
      centro_custo_id = formVal('nf-centro-custo') || null;
      codigo_classificacao_id = formVal('nf-codigo-classificacao') || null;
    }
    const competenciaMes = formVal('nf-competencia'); // <input type="month"> => "AAAA-MM"
    return {
      data_emissao: formVal('nf-emissao') || null,
      vencimento: formVal('nf-vencimento') || null,
      competencia: competenciaMes ? `${competenciaMes}-01` : null,
      numero_nota: formVal('nf-numero').trim(),
      valor_bruto: parseFloat(formVal('nf-valor')) || 0,
      pagador_id: formVal('nf-pagador') || null,
      fornecedor_id: formVal('nf-fornecedor') || null,
      forma_pagamento: formVal('nf-forma-pagamento') || null,
      conta_bancaria_id: contaBancariaEl ? (contaBancariaEl.value || null) : null,
      classificacao: formVal('nf-classificacao') || null,
      tipo_contratacao: formVal('nf-tipo-contratacao') || null,
      descricao: formVal('nf-descricao').trim(),
      anexos: [], // resolvido de verdade em finalizarAnexos(), depois que o id da nota existe
      // Setor: departamento tem setor fixo no próprio perfil; quem lança
      // sem setor fixo (administrador/gerente_financeiro) escolhe na hora,
      // no campo "nf-setor" (só existe no form pra quem não tem setor).
      setor: app.usuario.setor || formVal('nf-setor') || null,
      classe_conta_id, centro_custo_id, codigo_classificacao_id, rateios,
      tem_rateio: app.temRateio,
      tem_retencao_imposto: app.temImposto,
      impostos: app.temImposto ? app.impostoTemp.map(i => ({ ...i })) : [],
      // Parcelamento (só existe em nota nova, ver renderParcelamentoArea em
      // ui_nota.js): nunca vai pro banco como campo da própria nota -- é só
      // ida-e-volta entre coletarPayload/validarPayload e o loop de
      // db.criarNota que explode em N notas (ver btn-salvar-nota abaixo).
      tem_parcelamento: app.temParcelamento,
      parcelas: app.temParcelamento ? app.parcelasTemp.map(p => ({ ...p })) : [],
      // Correção de pendência não mostra o seletor (form já vem de uma
      // nota existente) -- mantém o tipo que a nota já tinha. "Padrão" é
      // a mesma noção de "não exceção" que já travava o vencimento, por
      // isso pagamento_excecao é só derivado daqui, não um campo à parte.
      ...(() => {
        const selTipoDespesa = document.getElementById('nf-tipo-despesa');
        const tipo_despesa_prazo = selTipoDespesa ? selTipoDespesa.value : (notaDoFormularioAtual().tipo_despesa_prazo || 'padrao');
        return { tipo_despesa_prazo, pagamento_excecao: tipo_despesa_prazo !== 'padrao' };
      })(),
    };
  }

  const btnSalvarNota = document.getElementById('btn-salvar-nota');
  if (btnSalvarNota) btnSalvarNota.onclick = async () => {
    const p = coletarPayload();
    const erro = validarPayload(p);
    if (erro) { showToast(erro); return; }
    const ehNotaNova = !(app.state.modal === 'corrigir_pendencia' || app.state.modal === 'editar_reenviar');
    if (ehNotaNova) {
      const duplicada = notaDuplicadaExistente(p.fornecedor_id, p.numero_nota);
      if (duplicada) {
        const confirmou = confirm(`Esse fornecedor já tem uma NF ${duplicada.numero_nota} lançada em ${fmtDate(duplicada.data_emissao)}. Confirma que essa não é uma nota duplicada?`);
        if (!confirmou) return;
      }
    }
    // Aviso (não bloqueio) de contrato vencido -- regra de conferência do
    // CSC ("devolver NF se vencido"). Confere contra a data de emissão da
    // nota (não "hoje"), pra continuar consistente mesmo em lançamentos
    // retroativos.
    const fornDaNota = app.cadastros.fornecedores.find(f => f.id === p.fornecedor_id);
    if (contratoVencido(fornDaNota, p.data_emissao)) {
      const confirmou = confirm(`O contrato deste fornecedor está vencido desde ${fmtDate(fornDaNota.contrato_vigencia_fim)}. Confirma que quer lançar mesmo assim?`);
      if (!confirmou) return;
    }
    const { novoStatus, autoAprovada, motivoAutoAprovacao, msgFlashAutoAprovada } = statusInicialParaValor(p.valor_bruto);
    const originalLabel = btnSalvarNota.textContent;
    btnSalvarNota.disabled = true; btnSalvarNota.textContent = 'Salvando...';
    try {
      const resumoAuditoria = resumoAuditoriaParaHistorico(p);
      if (app.state.modal === 'corrigir_pendencia' && app.state.modalData) {
        const n = app.notas.find(x => x.id === app.state.modalData);
        p.anexos = await finalizarAnexos(n.id, n.anexos, dadosParaNomeArquivo(p));
        await db.corrigirPendencia(n.id, p, app.usuario, null, resumoAuditoria ? [{ acao: 'Auditoria de anexos (leitor de documentos)', detalhe: resumoAuditoria }] : []);
        app.notas = await db.carregarNotas();
        closeModalWithFlash('Pendência corrigida — nota devolvida ao fluxo.');
        return;
      }
      if (app.state.modal === 'editar_reenviar' && app.state.modalData) {
        const n = app.notas.find(x => x.id === app.state.modalData);
        const eraRascunho = n.status === 'rascunho';
        const entradas = [{ acao: eraRascunho ? 'Rascunho enviado para aprovação' : 'Ajustado e reenviado para aprovação' }];
        if (autoAprovada) entradas.push({ acao: 'Aprovação automática', detalhe: motivoAutoAprovacao });
        if (resumoAuditoria) entradas.push({ acao: 'Auditoria de anexos (leitor de documentos)', detalhe: resumoAuditoria });
        p.anexos = await finalizarAnexos(n.id, n.anexos, dadosParaNomeArquivo(p));
        await db.atualizarNota(n.id, p, app.usuario, novoStatus, entradas);
        app.notas = await db.carregarNotas();
        closeModalWithFlash(autoAprovada ? `Nota enviada — ${msgFlashAutoAprovada}` : 'Nota enviada para aprovação do gerente financeiro.');
        return;
      }
      // Nota que chegou como 'recebido' (perfil recebedor: só anexo +
      // classificação, ver ui_recebimento.js) -- o "completo" preenche o
      // resto e lança de verdade. db.completarRecebimento() também
      // reatribui criado_por pra quem completou -- daqui pra frente essa
      // nota se comporta como uma nota comum lançada por essa pessoa
      // (pendência futura do contas a pagar etc. cai na fila dela, não
      // na de quem só recebeu o documento).
      if (app.state.modal === 'completar_recebimento' && app.state.modalData) {
        const n = app.notas.find(x => x.id === app.state.modalData);
        const entradas = [{ acao: 'Recebimento complementado e lançado' }];
        if (autoAprovada) entradas.push({ acao: 'Aprovação automática', detalhe: motivoAutoAprovacao });
        if (resumoAuditoria) entradas.push({ acao: 'Auditoria de anexos (leitor de documentos)', detalhe: resumoAuditoria });
        p.anexos = await finalizarAnexos(n.id, n.anexos, dadosParaNomeArquivo(p));
        await db.completarRecebimento(n.id, p, app.usuario, novoStatus, entradas);
        app.notas = await db.carregarNotas();
        closeModalWithFlash(autoAprovada ? `Nota lançada — ${msgFlashAutoAprovada}` : 'Nota lançada. Aguardando aprovação do gerente financeiro.');
        return;
      }
      // Parcelamento: cada linha da tabela (ver renderParcelamentoArea em
      // ui_nota.js) vira uma NOTA própria, não uma linha auxiliar dentro da
      // mesma nota (diferente do rateio) -- cada parcela tem seu próprio
      // vencimento/valor e precisa seguir o fluxo de aprovação inteiro de
      // forma independente (uma pode já estar paga enquanto outra ainda
      // está esperando aprovação). Por isso a alçada (statusInicialParaValor)
      // é recalculada PARA CADA parcela, com o valor dela, não do total --
      // é o valor da parcela que representa o compromisso financeiro
      // daquele lançamento específico. Todas compartilham um
      // parcelamento_id só pra rastreio (relatório/auditoria), sem nenhum
      // efeito no fluxo em si. anexos: finalizarAnexos() só lê
      // app.anexosNovos (não consome), então dá pra chamar uma vez por
      // parcela com o mesmo arquivo -- cada parcela fica com sua própria
      // cópia do documento, auditável de forma independente.
      if (p.tem_parcelamento) {
        const parcelamentoId = uid();
        const totalParcelas = p.parcelas.length;
        for (const parcela of p.parcelas) {
          // Mesmo número de NF em todas as parcelas (pedido do dono do
          // produto): é a mesma nota fiscal, só com vencimentos (e,
          // opcionalmente, valores) diferentes por linha -- não é uma NF
          // por parcela. parcela_numero/parcela_total (ver detalhe da
          // nota, tabela de parcelamento) já identificam qual é qual, sem
          // precisar sufixar o número.
          const payloadParcela = {
            ...p,
            valor_bruto: parcela.valor,
            vencimento: parcela.vencimento,
            parcelamento_id: parcelamentoId,
            parcela_numero: parcela.numero,
            parcela_total: totalParcelas,
          };
          const statusParcela = statusInicialParaValor(payloadParcela.valor_bruto);
          const historicoParcela = [{ acao: 'Nota lançada no Central CP (parcelamento)', detalhe: `NF ${payloadParcela.numero_nota} — parcela ${parcela.numero}/${totalParcelas}` }];
          if (resumoAuditoria) historicoParcela.push({ acao: 'Auditoria de anexos (leitor de documentos)', detalhe: resumoAuditoria });
          const novaNotaParcela = await db.criarNota(payloadParcela, app.usuario, 'rascunho', historicoParcela);
          if (app.anexosNovos.length > 0) {
            const anexosFinal = await finalizarAnexos(novaNotaParcela.id, [], dadosParaNomeArquivo(payloadParcela));
            await db.atualizarAnexosNota(novaNotaParcela.id, anexosFinal);
          }
          const historicoPromocaoParcela = statusParcela.autoAprovada ? [{ acao: 'Aprovação automática', detalhe: statusParcela.motivoAutoAprovacao }] : [];
          await db.promoverStatusNota(novaNotaParcela.id, statusParcela.novoStatus, app.usuario, historicoPromocaoParcela);
        }
        app.notas = await db.carregarNotas();
        closeModalWithFlash(`NF ${p.numero_nota} lançada em ${totalParcelas} parcelas (mesma NF, uma nota por vencimento) — cada parcela segue o fluxo de aprovação, Group, chamado e pagamento de forma independente a partir daqui. Veja todas juntas no detalhe de qualquer uma delas.`);
        return;
      }
      const historicoInicial = [{ acao: 'Nota lançada no Central CP', detalhe: `NF ${p.numero_nota}` }];
      if (resumoAuditoria) historicoInicial.push({ acao: 'Auditoria de anexos (leitor de documentos)', detalhe: resumoAuditoria });
      // Cria sempre como 'rascunho' primeiro (nunca já no status final) --
      // anexa os arquivos ENQUANTO ainda está rascunho, e só promove pro
      // status de verdade depois. Ver comentário em promoverStatusNota()
      // (db.js): pular direto pra 'aprovado' na criação faz o UPDATE de
      // anexar arquivo (uma chamada separada) esbarrar na RLS -- o anexo
      // "sumia" silenciosamente sempre que a nota nascia já aprovada
      // (dentro da alçada).
      const novaNota = await db.criarNota(p, app.usuario, 'rascunho', historicoInicial);
      if (app.anexosNovos.length > 0) {
        const anexosFinal = await finalizarAnexos(novaNota.id, [], dadosParaNomeArquivo(p));
        await db.atualizarAnexosNota(novaNota.id, anexosFinal);
      }
      const historicoPromocao = autoAprovada ? [{ acao: 'Aprovação automática', detalhe: motivoAutoAprovacao }] : [];
      await db.promoverStatusNota(novaNota.id, novoStatus, app.usuario, historicoPromocao);
      app.notas = await db.carregarNotas();
      closeModalWithFlash(autoAprovada ? `Nota lançada — ${msgFlashAutoAprovada}` : 'Nota lançada. Aguardando aprovação do gerente financeiro.');
    } catch (e) {
      showToast('Erro ao salvar: ' + e.message);
      btnSalvarNota.disabled = false; btnSalvarNota.textContent = originalLabel;
    }
  };

  const btnSalvarRascunho = document.getElementById('btn-salvar-rascunho');
  if (btnSalvarRascunho) btnSalvarRascunho.onclick = async () => {
    const p = coletarPayload();
    const originalLabel = btnSalvarRascunho.textContent;
    btnSalvarRascunho.disabled = true; btnSalvarRascunho.textContent = 'Salvando...';
    try {
      if (app.state.modal === 'editar_reenviar' && app.state.modalData) {
        const n = app.notas.find(x => x.id === app.state.modalData);
        p.anexos = await finalizarAnexos(app.state.modalData, n ? n.anexos : [], dadosParaNomeArquivo(p));
        await db.atualizarNota(app.state.modalData, p, app.usuario, 'rascunho', { acao: 'Rascunho atualizado' });
        app.notas = await db.carregarNotas();
        closeModalWithFlash('Rascunho atualizado.');
        return;
      }
      const novoRascunho = await db.criarNota(p, app.usuario, 'rascunho', [{ acao: 'Rascunho criado' }]);
      if (app.anexosNovos.length > 0) {
        const anexosFinal = await finalizarAnexos(novoRascunho.id, [], dadosParaNomeArquivo(p));
        await db.atualizarAnexosNota(novoRascunho.id, anexosFinal);
      }
      app.notas = await db.carregarNotas();
      closeModalWithFlash('Rascunho salvo. Você pode continuar de onde parou em "Rascunhos".');
    } catch (e) {
      showToast('Erro ao salvar rascunho: ' + e.message);
      btnSalvarRascunho.disabled = false; btnSalvarRascunho.textContent = originalLabel;
    }
  };

  // Ações de fluxo (aprovar/reprovar/lançar/pagar/pendência): todas seguem o
  // mesmo padrão — desabilita + rótulo de progresso, chama o db.js, recarrega
  // notas e fecha o modal com uma mensagem de sucesso; erro vira toast e
  // reabilita o botão (sem isso, o clique parecia "não fazer nada" numa rede
  // lenta, exatamente o tipo de sintoma que gerou o bug dos botões).
  function bindAcao(id, label, executar, msgSucesso) {
    bind(id, async () => {
      const btn = document.getElementById(id);
      const original = btn ? btn.textContent : null;
      if (btn) { btn.disabled = true; btn.textContent = label; }
      try {
        await executar();
        app.notas = await db.carregarNotas();
        closeModalWithFlash(msgSucesso);
      } catch (e) {
        showToast('Erro: ' + e.message);
        if (btn) { btn.disabled = false; btn.textContent = original; }
      }
    });
  }

  bindAcao('confirmar-aprovar', 'Aprovando...',
    () => db.aprovarNota(app.state.modalData, app.usuario, document.getElementById('input-comentario').value),
    'Nota aprovada e liberada para o contas a pagar.');

  const btnReprovar = document.getElementById('confirmar-reprovar');
  if (btnReprovar) btnReprovar.onclick = async () => {
    const motivo = document.getElementById('input-motivo').value.trim();
    if (!motivo) return;
    const original = btnReprovar.textContent;
    btnReprovar.disabled = true; btnReprovar.textContent = 'Reprovando...';
    try {
      await db.reprovarNota(app.state.modalData, app.usuario, motivo);
      app.notas = await db.carregarNotas();
      closeModalWithFlash('Nota devolvida ao departamento com o motivo.');
    } catch (e) {
      showToast('Erro: ' + e.message);
      btnReprovar.disabled = false; btnReprovar.textContent = original;
    }
  };

  const btnLoteLancarGroup = document.getElementById('confirmar-lote-lancar-group');
  if (btnLoteLancarGroup) btnLoteLancarGroup.onclick = async () => {
    const codigo = document.getElementById('input-lancamento-group').value.trim();
    if (!codigo) { showToast('Informe o código do lançamento no Group.'); return; }
    const original = btnLoteLancarGroup.textContent;
    btnLoteLancarGroup.disabled = true; btnLoteLancarGroup.textContent = 'Lançando...';
    try {
      await db.lancarNoGroupLote(app.state.modalData, app.usuario, codigo);
      app.notas = await db.carregarNotas();
      closeModalWithFlash('Lançamento no Group registrado.');
    } catch (e) {
      showToast('Erro: ' + e.message);
      btnLoteLancarGroup.disabled = false; btnLoteLancarGroup.textContent = original;
    }
  };

  const btnZipChamado = document.getElementById('btn-baixar-zip-chamado');
  if (btnZipChamado) btnZipChamado.onclick = async () => {
    const notas = (app.state.modalData || []).map(id => app.notas.find(n => n.id === id)).filter(Boolean);
    const original = btnZipChamado.textContent;
    btnZipChamado.disabled = true; btnZipChamado.textContent = 'Gerando zip...';
    try {
      const { baixarZipAnexosLote } = await import('./zip_anexos.js');
      const qtd = await baixarZipAnexosLote(notas);
      if (qtd === 0) showToast('Nenhuma dessas notas tem anexo salvo.');
    } catch (e) {
      showToast('Erro ao gerar o zip: ' + e.message);
    } finally {
      btnZipChamado.disabled = false; btnZipChamado.textContent = original;
    }
  };

  // Título + tabela do chamado (documento WE9): gerado sob demanda pra
  // não pesar o modal com uma tabela grande sempre visível -- o botão
  // alterna mostrar/esconder, re-renderizando o conteúdo cada vez que
  // abre (o lote não muda dentro do mesmo modal, então não precisa mais
  // que isso).
  function bindTabelaChamadoArea() {
    const btnCopiarTitulo = document.getElementById('btn-copiar-titulo-chamado');
    if (btnCopiarTitulo) btnCopiarTitulo.onclick = async () => {
      const texto = document.getElementById('chamado-titulo-texto').value;
      try {
        await navigator.clipboard.writeText(texto);
        showToast('Título copiado.');
      } catch {
        showToast('Não foi possível copiar automaticamente -- selecione o texto e copie manualmente.');
      }
    };
    const btnCopiarTabela = document.getElementById('btn-copiar-tabela-chamado');
    if (btnCopiarTabela) btnCopiarTabela.onclick = () => {
      try {
        const tabela = document.getElementById('tabela-chamado-conteudo');
        const range = document.createRange();
        range.selectNode(tabela);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        const copiou = document.execCommand('copy');
        selection.removeAllRanges();
        showToast(copiou ? 'Tabela copiada -- cole direto na descrição do chamado no Freshdesk.' : 'Não foi possível copiar automaticamente -- selecione a tabela e copie manualmente.');
      } catch {
        showToast('Não foi possível copiar automaticamente -- selecione a tabela e copie manualmente.');
      }
    };
  }
  const btnGerarTabelaChamado = document.getElementById('btn-gerar-tabela-chamado');
  const tabelaChamadoArea = document.getElementById('tabela-chamado-area');
  if (btnGerarTabelaChamado && tabelaChamadoArea) btnGerarTabelaChamado.onclick = () => {
    const escondido = tabelaChamadoArea.style.display === 'none';
    if (escondido) {
      tabelaChamadoArea.innerHTML = renderTabelaChamado(app.state.modalData || []);
      tabelaChamadoArea.style.display = '';
      bindTabelaChamadoArea();
      btnGerarTabelaChamado.textContent = 'Ocultar título e tabela do chamado';
    } else {
      tabelaChamadoArea.style.display = 'none';
      btnGerarTabelaChamado.textContent = 'Gerar título e tabela do chamado';
    }
  };

  const btnLoteAbrirChamado = document.getElementById('confirmar-lote-abrir-chamado');
  if (btnLoteAbrirChamado) btnLoteAbrirChamado.onclick = async () => {
    const chamado = document.getElementById('input-chamado').value.trim();
    if (!chamado) { showToast('Informe o número do chamado.'); return; }
    const original = btnLoteAbrirChamado.textContent;
    btnLoteAbrirChamado.disabled = true; btnLoteAbrirChamado.textContent = 'Abrindo...';
    try {
      await db.abrirChamadoLote(app.state.modalData, app.usuario, chamado);
      app.notas = await db.carregarNotas();
      closeModalWithFlash('Chamado aberto no Acelerato.');
    } catch (e) {
      showToast('Erro: ' + e.message);
      btnLoteAbrirChamado.disabled = false; btnLoteAbrirChamado.textContent = original;
    }
  };

  bindAcao('confirmar-lote-validar-csc', 'Validando...',
    () => db.validarCscLote(app.state.modalData, app.usuario),
    'Notas validadas pelo CSC.');

  bindAcao('confirmar-lote-confirmar-pagamento', 'Confirmando...',
    () => db.confirmarPagamentoLote(app.state.modalData, app.usuario, document.getElementById('input-data-pgto').value),
    'Pagamento confirmado.');

  bindAcao('confirmar-lote-aprovar', 'Aprovando...',
    () => db.aprovarNotaLote(app.state.modalData, app.usuario),
    'Notas aprovadas e liberadas para o contas a pagar.');

  const btnPendencia = document.getElementById('confirmar-pendencia');
  if (btnPendencia) btnPendencia.onclick = async () => {
    const motivo = document.getElementById('input-motivo-pend').value.trim();
    if (!motivo) return;
    const original = btnPendencia.textContent;
    btnPendencia.disabled = true; btnPendencia.textContent = 'Registrando...';
    try {
      await db.marcarPendencia(app.state.modalData, app.usuario, motivo);
      app.notas = await db.carregarNotas();
      closeModalWithFlash('Pendência registrada.');
    } catch (e) {
      showToast('Erro: ' + e.message);
      btnPendencia.disabled = false; btnPendencia.textContent = original;
    }
  };

  const btnCancelarLancamento = document.getElementById('confirmar-cancelar-lancamento');
  if (btnCancelarLancamento) btnCancelarLancamento.onclick = async () => {
    const motivo = document.getElementById('input-motivo-cancelamento').value.trim();
    if (!motivo) return;
    const original = btnCancelarLancamento.textContent;
    btnCancelarLancamento.disabled = true; btnCancelarLancamento.textContent = 'Cancelando...';
    try {
      await db.cancelarNota(app.state.modalData, app.usuario, motivo);
      app.notas = await db.carregarNotas();
      closeModalWithFlash('Lançamento cancelado.');
    } catch (e) {
      showToast('Erro: ' + e.message);
      btnCancelarLancamento.disabled = false; btnCancelarLancamento.textContent = original;
    }
  };

}
