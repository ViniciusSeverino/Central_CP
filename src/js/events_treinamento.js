// src/js/events_treinamento.js
//
// Eventos da aba Treinamento do OCR (ver ui_treinamento.js e
// treinamento_ocr.js). O estado da nota aberta (arquivo, leitura, página,
// indicação em andamento) fica em `ctx`, fora do app.state: é pesado
// (arquivo, palavras) e muda a cada clique -- os pedaços da tela são
// atualizados direto (refreshCampos / mostrarPagina), sem re-renderizar a
// tela toda (que apagaria o documento já desenhado). Se a tela for
// re-renderizada por fora (ex: "Atualizar dados"), attachTreinamentoHandlers
// redesenha a partir do ctx, sem baixar/ler o documento de novo.
import { app } from './state.js';
import * as db from './db.js';
import { render, bind } from './app.js';
import { showToast } from './toast.js';
import { ativarDesenhoRetangulo, mostrarRetangulo } from './captura_documento.js';
import { encontrarTextoNaRegiao, extrairValorDaRegiao } from './extracao_posicional.js';
import { montarDica, notasParaTreino } from './treinamento_ocr.js';
import { gabaritoDaNota, pontuarCaso, duvidososDoLeitor, agregar } from './ocr_acerto.js';
import { renderGruposTreino, renderCabecalhoDocumento, renderCartoesCampos, renderPainelAcerto } from './ui_treinamento.js';

let ctx = null;          // nota aberta (ver abrirNota)
let medicao = null;      // medição de acerto em andamento: { alvo, cancelar }

const fornecedorPorId = (id) => (app.cadastros.fornecedores || []).find(f => f.id === id) || null;
const dicasDoFornecedor = (fornecedorId) => (app.extracaoHints || []).filter(h => h.fornecedor_id === fornecedorId);

export function attachTreinamentoHandlers() {
  if (app.state.view !== 'treinamento') return;
  if (!app.treinamentoNotas) {
    db.carregarTreinamentoNotas()
      .then(lista => { app.treinamentoNotas = lista; render(); })
      .catch(e => { app.treinamentoNotas = []; showToast(e.message); render(); });
    return;
  }
  const t = app.state.treinamento;
  if (t.notaId) { attachNota(t.notaId); return; }

  const busca = document.getElementById('treino-busca');
  const lista = document.getElementById('treino-lista');
  const atualizarLista = () => { if (lista) { lista.innerHTML = renderGruposTreino(); bindAbrir(); } };
  if (busca) busca.oninput = () => { t.busca = busca.value; atualizarLista(); };
  const soPendentes = document.getElementById('treino-so-pendentes');
  if (soPendentes) soPendentes.onchange = () => { t.soPendentes = soPendentes.checked; atualizarLista(); };
  bindAbrir();
  bind('btn-treino-medir-geral', () => {
    const recentes = [...notasParaTreino(app.notas)]
      .sort((a, b) => String(b.data_pagamento || b.data_emissao || '').localeCompare(String(a.data_pagamento || a.data_emissao || '')))
      .slice(0, 30);
    medirAcerto(recentes, 'treino-painel-geral');
  });
}

function bindAbrir() {
  document.querySelectorAll('[data-treino-abrir]').forEach(b => {
    b.onclick = () => { app.state.treinamento.notaId = b.dataset.treinoAbrir; ctx = null; render(); };
  });
}

/* ---------------- nota aberta ---------------- */

function attachNota(notaId) {
  const n = app.notas.find(x => x.id === notaId);
  bind('btn-treino-voltar', () => { app.state.treinamento.notaId = null; ctx = null; cancelarMedicao(); render(); });
  if (!n) return;
  bind('btn-treino-concluir', () => concluirNota(n));
  bind('btn-treino-conferir-fornecedor', () => {
    const doFornecedor = notasParaTreino(app.notas).filter(x => x.fornecedor_id === n.fornecedor_id).slice(0, 20);
    medirAcerto(doFornecedor, 'treino-painel-fornecedor');
  });
  if (ctx && ctx.notaId === notaId) { refreshCampos(); mostrarPagina(); return; }
  abrirNota(n);
}

async function abrirNota(n) {
  ctx = { notaId: n.id, nota: n, arquivo: null, totalPaginas: 0, pagina: 1, palavras: [], leitura: null, tiposPagina: {}, ativo: null, captura: null, salvando: false };
  const meu = ctx;
  try {
    const blob = await db.baixarAnexo(n.anexos[0]);
    if (ctx !== meu) return;
    meu.arquivo = new File([blob], (n.anexos[0].split('/').pop() || 'anexo.pdf'), { type: blob.type || 'application/pdf' });
    const { numeroDePaginas } = await import('./pdf_render.js');
    meu.totalPaginas = await numeroDePaginas(meu.arquivo);
    const salvo = (app.treinamentoNotas || []).find(x => x.nota_id === n.id);
    if (salvo && salvo.tipos_pagina) Object.assign(meu.tiposPagina, salvo.tipos_pagina);
    if (ctx !== meu) return;
    await mostrarPagina();
    await lerDocumento(meu);
  } catch (e) {
    if (ctx !== meu) return;
    const el = document.getElementById('treino-doc');
    if (el) el.innerHTML = `<div class="preview-indisponivel">Não deu pra abrir o anexo desta nota: ${e.message}</div>`;
  }
}

// Leitura do documento com as dicas atuais do fornecedor -- o "Leitor" de
// cada cartão. Preenche o tipo de cada página que ainda não foi marcado.
async function lerDocumento(meu) {
  const { analisarAnexo, tiposDasPaginas } = await import('./leitor_documentos.js');
  const leitura = await analisarAnexo(meu.arquivo, dicasDoFornecedor(meu.nota.fornecedor_id));
  if (ctx !== meu) return;
  meu.leitura = leitura;
  const tipos = tiposDasPaginas(leitura.palavrasPorPagina) || {};
  for (let p = 1; p <= meu.totalPaginas; p++) if (!meu.tiposPagina[p]) meu.tiposPagina[p] = tipos[p] || 'nao_identificado';
  refreshCampos();
  refreshCabecalho();
}

// Relê com as dicas novas sem reprocessar o arquivo (texto e palavras já
// estão na leitura).
async function reaplicarDicas() {
  const { reclassificarComHints } = await import('./leitor_documentos.js');
  const l = ctx.leitura;
  Object.assign(l, reclassificarComHints(l.texto, dicasDoFornecedor(ctx.nota.fornecedor_id), l.palavrasPorPagina, l.fonte));
}

async function mostrarPagina() {
  const el = document.getElementById('treino-doc');
  if (!el || !ctx || !ctx.arquivo) return;
  const meu = ctx;
  const pagina = meu.pagina;
  el.innerHTML = `<div id="treino-doc-topo">${renderCabecalhoDocumento(meu)}</div><div class="preview-indisponivel">Desenhando a página...</div>`;
  bindCabecalho();
  try {
    const { renderizarPaginaPdfEmCanvas } = await import('./pdf_render.js');
    const { canvas, palavras } = await renderizarPaginaPdfEmCanvas(meu.arquivo, pagina);
    if (ctx !== meu || meu.pagina !== pagina) return;
    meu.palavras = palavras;
    const area = el.querySelector('.preview-indisponivel');
    const wrap = document.createElement('div');
    wrap.className = 'selecao-imagem-wrap treino-wrap';
    canvas.className = 'selecao-imagem';
    wrap.appendChild(canvas);
    const retangulo = document.createElement('div');
    retangulo.className = 'selecao-retangulo';
    retangulo.hidden = true;
    wrap.appendChild(retangulo);
    area.replaceWith(wrap);
    prepararDesenho(wrap, retangulo);
  } catch (e) {
    if (ctx !== meu) return;
    const area = el.querySelector('.preview-indisponivel');
    if (area) area.textContent = `Não deu pra desenhar a página: ${e.message}`;
  }
}

// Com um campo ativo, o retângulo desenhado vira uma indicação; sem campo
// ativo, mostra onde está a dica salva do campo que acabou de ser
// indicado/salvo (só pra conferência visual).
function prepararDesenho(wrap, retangulo) {
  wrap.classList.toggle('desenhando', !!ctx.ativo);
  if (ctx.captura && ctx.captura.pagina === ctx.pagina) mostrarRetangulo(retangulo, ctx.captura.regiao);
  if (!ctx.ativo) { wrap.onmousedown = wrap.onmousemove = wrap.onmouseup = wrap.onmouseleave = null; return; }
  ativarDesenhoRetangulo(wrap, retangulo, (regiao) => {
    const texto = encontrarTextoNaRegiao(ctx.palavras, regiao);
    const valor = extrairValorDaRegiao(ctx.ativo, texto);
    ctx.captura = { campo: ctx.ativo, valor: valor === undefined ? null : valor, regiao, pagina: ctx.pagina, texto };
    refreshCampos();
  });
}

function refreshCabecalho() {
  const topo = document.getElementById('treino-doc-topo');
  if (!topo || !ctx) return;
  topo.innerHTML = renderCabecalhoDocumento(ctx);
  bindCabecalho();
  const wrap = document.querySelector('#treino-doc .treino-wrap');
  if (wrap) prepararDesenho(wrap, wrap.querySelector('.selecao-retangulo'));
}

function bindCabecalho() {
  document.querySelectorAll('[data-treino-pagina]').forEach(b => {
    b.onclick = () => {
      const p = Number(b.dataset.treinoPagina);
      if (p < 1 || p > ctx.totalPaginas) return;
      ctx.pagina = p;
      mostrarPagina();
    };
  });
  const tipo = document.getElementById('treino-tipo-pagina');
  if (tipo) tipo.onchange = () => { ctx.tiposPagina[ctx.pagina] = tipo.value; };
  const cancelar = document.querySelector('[data-treino-cancelar]');
  if (cancelar) cancelar.onclick = () => { ctx.ativo = null; ctx.captura = null; refreshCabecalho(); refreshCampos(); };
}

function refreshCampos() {
  const el = document.getElementById('treino-campos');
  if (!el || !ctx) return;
  el.innerHTML = renderCartoesCampos(ctx.nota, ctx);
  el.querySelectorAll('[data-treino-indicar]').forEach(b => {
    b.onclick = () => { ctx.ativo = b.dataset.treinoIndicar; ctx.captura = null; refreshCampos(); refreshCabecalho(); };
  });
  el.querySelectorAll('[data-treino-salvar]').forEach(b => { b.onclick = () => salvarIndicacao(); });
}

async function salvarIndicacao() {
  const cap = ctx && ctx.captura;
  if (!cap || cap.valor === null || ctx.salvando) return;
  const n = ctx.nota;
  if (!n.fornecedor_id) { showToast('Esta nota não tem fornecedor — a dica é sempre por fornecedor.'); return; }
  ctx.salvando = true;
  refreshCampos();
  try {
    const dica = montarDica({
      fornecedorId: n.fornecedor_id, campo: cap.campo, valor: cap.valor, textoRegiao: cap.texto,
      textoDocumento: ctx.leitura ? ctx.leitura.texto : '', pagina: cap.pagina, regiao: cap.regiao,
      tipoPagina: ctx.tiposPagina[cap.pagina] || null,
    });
    await db.salvarExtracaoHint(dica, app.usuario.id);
    const resto = (app.extracaoHints || []).filter(h => !(h.fornecedor_id === dica.fornecedor_id && h.campo === dica.campo));
    app.extracaoHints = [...resto, { ...dica, criado_por: app.usuario.id }];
    ctx.ativo = null;
    if (ctx.leitura) await reaplicarDicas();
    showToast('Indicação salva — vale pras próximas notas deste fornecedor.', 'success');
  } catch (e) {
    showToast(e.message);
  } finally {
    ctx.salvando = false;
    ctx.captura = null;
    refreshCampos();
    refreshCabecalho();
  }
}

async function concluirNota(n) {
  try {
    await db.marcarNotaTreinada(n.id, ctx ? ctx.tiposPagina : {}, app.usuario.id);
    const resto = (app.treinamentoNotas || []).filter(x => x.nota_id !== n.id);
    app.treinamentoNotas = [...resto, { nota_id: n.id, tipos_pagina: ctx ? { ...ctx.tiposPagina } : {}, treinado_em: new Date().toISOString() }];
    showToast('Nota marcada como treinada.', 'success');
    app.state.treinamento.notaId = null;
    ctx = null;
    render();
  } catch (e) {
    showToast(e.message);
  }
}

/* ---------------- painel de acerto ---------------- */

function cancelarMedicao() { if (medicao) medicao.cancelar = true; medicao = null; }

// Relê cada nota (anexo do Storage + dicas do fornecedor dela) e compara
// com o que foi lançado -- a mesma régua do harness de avaliação
// (ocr_acerto.js). Uma nota por vez, mostrando o progresso; dá pra parar.
async function medirAcerto(notas, alvoId) {
  cancelarMedicao();
  const minha = { alvo: alvoId, cancelar: false };
  medicao = minha;
  const estado = { feitas: 0, total: notas.length, agregado: null, cancelado: false };
  const casos = [];
  const desenhar = () => {
    const el = document.getElementById(alvoId);
    if (!el) return;
    el.innerHTML = renderPainelAcerto(estado);
    const parar = el.querySelector('[data-treino-cancelar-medicao]');
    if (parar) parar.onclick = () => { minha.cancelar = true; estado.cancelado = true; desenhar(); };
  };
  desenhar();
  const { analisarAnexo } = await import('./leitor_documentos.js');
  for (const n of notas) {
    if (minha.cancelar) break;
    try {
      const blob = await db.baixarAnexo(n.anexos[0]);
      const arquivo = new File([blob], 'anexo.pdf', { type: blob.type || 'application/pdf' });
      const leitura = await analisarAnexo(arquivo, dicasDoFornecedor(n.fornecedor_id));
      casos.push({
        id: n.id,
        pontos: pontuarCaso(gabaritoDaNota(n, fornecedorPorId(n.fornecedor_id)), leitura.campos),
        duvidosos: duvidososDoLeitor(leitura.camposDuvidosos),
      });
    } catch { /* anexo que não abre não entra na conta */ }
    if (minha.cancelar) break;
    estado.feitas++;
    estado.agregado = agregar(casos);
    desenhar();
  }
  if (medicao === minha) medicao = null;
}
