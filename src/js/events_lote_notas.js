// src/js/events_lote_notas.js
//
// Lançamento em lote: uma tabela pra preencher várias notas de uma vez,
// mas cada linha vira uma nota individual ao salvar (mesma validação,
// mesma alçada, mesmo histórico do formulário de sempre) -- ver
// ui_lote_nota.js pro porquê da divisão "campos comuns na tabela / campos
// menos comuns no popup de Detalhes".
//
// Diferença deliberada em relação ao formulário individual: os avisos (não
// bloqueio) de NF possivelmente duplicada e de contrato de fornecedor
// vencido usam confirm() lá -- aqui, com várias linhas de uma vez, um
// confirm() por linha interromperia o salvamento em lote sem necessidade.
// Por simplicidade, a v1 do lote não repete esses dois avisos por linha
// (a validação "de verdade", que bloqueia, continua idêntica).
import { app, centrosParaPagador, classesParaCentro, selectOptions } from './state.js';
import * as db from './db.js';
import { render, closeModalWithFlash } from './app.js';
import { showToast } from './toast.js';
import { bindFornecedorCombo, bindRateioArea, bindImpostoArea, refreshImpostoArea, renderRateioArea, renderAnexosArea } from './ui_nota.js';
import { novaLinhaLoteVazia } from './ui_lote_nota.js';
import { validarPayload, dadosParaNomeArquivo, finalizarAnexos, statusInicialParaValor, resumoAuditoriaParaHistorico } from './events_notas.js';
import { TIPO_DESPESA_LABEL } from './prazo_despesa.js';

function formVal(id) { const el = document.getElementById(id); return el ? el.value : undefined; }

// Lê os campos "comuns" (os que ficam direto na tabela) de volta pro
// objeto da linha -- precisa ser chamado antes de qualquer ação que
// reconstrua a tabela inteira (adicionar/remover linha, abrir Detalhes),
// senão o que já foi digitado nas OUTRAS linhas se perderia no re-render.
function coletarLinhaDoDom(i) {
  const row = app.loteRows[i];
  if (!row) return row;
  const campos = {
    numero_nota: `lote-numero-${i}`, fornecedor_id: `lote-forn-${i}`, data_emissao: `lote-emissao-${i}`,
    vencimento: `lote-vencimento-${i}`, competencia: `lote-competencia-${i}`, valor_bruto: `lote-valor-${i}`,
    pagador_id: `lote-pagador-${i}`, forma_pagamento: `lote-forma-pagamento-${i}`, classificacao: `lote-classificacao-${i}`,
    centro_custo_id: `lote-centro-custo-${i}`, classe_conta_id: `lote-classe-conta-${i}`, setor: `lote-setor-${i}`,
  };
  Object.entries(campos).forEach(([field, id]) => {
    const v = formVal(id);
    if (v !== undefined) row[field] = v;
  });
  return row;
}

function sincronizarTodasLinhas() {
  app.loteRows.forEach((_, i) => coletarLinhaDoDom(i));
}

// Mesmo formato que coletarPayload() produz no formulário individual --
// assim validarPayload/dadosParaNomeArquivo/db.criarNota (importados de
// events_notas.js) funcionam sem nenhuma adaptação.
function montarPayloadDaLinha(row) {
  const competenciaMes = row.competencia || '';
  return {
    data_emissao: row.data_emissao || null,
    vencimento: row.vencimento || null,
    competencia: competenciaMes ? `${competenciaMes}-01` : null,
    numero_nota: (row.numero_nota || '').trim(),
    valor_bruto: parseFloat(row.valor_bruto) || 0,
    pagador_id: row.pagador_id || null,
    fornecedor_id: row.fornecedor_id || null,
    forma_pagamento: row.forma_pagamento || null,
    conta_bancaria_id: row.conta_bancaria_id || null,
    classificacao: row.classificacao || null,
    tipo_contratacao: row.tipo_contratacao || null,
    descricao: (row.descricao || '').trim(),
    anexos: [],
    setor: row.setor || null,
    classe_conta_id: row.tem_rateio ? null : (row.classe_conta_id || null),
    centro_custo_id: row.tem_rateio ? null : (row.centro_custo_id || null),
    codigo_classificacao_id: row.tem_rateio ? null : (row.codigo_classificacao_id || null),
    rateios: row.tem_rateio ? row.rateios.map(r => ({ ...r })) : [],
    tem_rateio: !!row.tem_rateio,
    tem_retencao_imposto: !!row.tem_retencao_imposto,
    impostos: row.tem_retencao_imposto ? row.impostos.map(imp => ({ ...imp })) : [],
    tipo_despesa_prazo: row.tipo_despesa_prazo || 'padrao',
    pagamento_excecao: (row.tipo_despesa_prazo || 'padrao') !== 'padrao',
  };
}

/* ---- campos simples de cada linha: só grava no objeto da linha, nunca
   chama render() (uma linha em lote pode ter dezenas de campos sendo
   digitados -- re-renderizar a tabela inteira a cada tecla perderia o
   foco do campo, mesmo problema que a "atualização local" do formulário
   individual já resolve pros próprios campos dele) ---- */
function bindLinhaCamposSimples(i) {
  const row = app.loteRows[i];
  const liga = (id, field) => {
    const el = document.getElementById(id);
    if (el) { el.oninput = () => { row[field] = el.value; }; el.onchange = () => { row[field] = el.value; }; }
  };
  liga(`lote-numero-${i}`, 'numero_nota');
  liga(`lote-emissao-${i}`, 'data_emissao');
  liga(`lote-vencimento-${i}`, 'vencimento');
  liga(`lote-competencia-${i}`, 'competencia');
  liga(`lote-valor-${i}`, 'valor_bruto');
  liga(`lote-forma-pagamento-${i}`, 'forma_pagamento');
  liga(`lote-classificacao-${i}`, 'classificacao');
  liga(`lote-setor-${i}`, 'setor');
}

// Cascata pagador -> centro de custo -> classe da conta, igual à do
// formulário individual (bindClassificacaoSelectsCascade em ui_nota.js),
// só que reaproveitando os <select> já existentes por índice de linha em
// vez de reconstruir HTML -- assim não precisa de um render() completo.
function bindLinhaCascade(i) {
  const row = app.loteRows[i];
  const selPagador = document.getElementById(`lote-pagador-${i}`);
  const selCentro = document.getElementById(`lote-centro-custo-${i}`);
  const selClasse = document.getElementById(`lote-classe-conta-${i}`);
  if (selPagador) selPagador.onchange = () => {
    row.pagador_id = selPagador.value;
    row.centro_custo_id = ''; row.classe_conta_id = '';
    if (selCentro) {
      const centros = selPagador.value ? centrosParaPagador(selPagador.value) : [];
      selCentro.disabled = !selPagador.value;
      selCentro.innerHTML = selPagador.value ? selectOptions(centros) : `<option value="">Pagador primeiro</option>`;
    }
    if (selClasse) { selClasse.disabled = true; selClasse.innerHTML = `<option value="">Centro primeiro</option>`; }
  };
  if (selCentro) selCentro.onchange = () => {
    row.centro_custo_id = selCentro.value;
    row.classe_conta_id = '';
    if (selClasse) {
      const classes = selCentro.value ? classesParaCentro(selCentro.value) : [];
      selClasse.disabled = !selCentro.value;
      selClasse.innerHTML = selCentro.value ? selectOptions(classes) : `<option value="">Centro primeiro</option>`;
    }
  };
  if (selClasse) selClasse.onchange = () => { row.classe_conta_id = selClasse.value; };
}

function bindLinhaFornecedor(i) {
  bindFornecedorCombo(null, { buscaId: `lote-forn-busca-${i}`, hiddenId: `lote-forn-${i}`, listId: `lote-forn-list-${i}` });
}

/* ---- popup de Detalhes de uma linha (rateio/imposto/anexos/tipo de
   despesa/tipo de contratação/conta bancária/descrição) ---- */
function refreshLoteDetalheAnexos() {
  const el = document.getElementById('anexos-area');
  if (!el) return;
  const row = app.loteRows[app.loteEditingIndex] || {};
  el.innerHTML = renderAnexosArea({}, {
    forma_pagamento: row.forma_pagamento || '', tipo_contratacao: row.tipo_contratacao || null,
    tem_retencao_imposto: app.temImposto, numero_nota: row.numero_nota || '', valor_bruto: row.valor_bruto || 0,
  }, { permitePreencher: false });
  bindLoteDetalheAnexos();
}
// Dispara o leitor de documentos pra um anexo recém-adicionado no popup
// de Detalhes -- mesma lógica de analisarNovoAnexo() em events_notas.js,
// só que "preencher com estes dados" não existe aqui (ver
// permitePreencher: false acima): os campos que dariam pra preencher
// (Nº NF, valor) ficam na tabela principal, não neste popup.
async function analisarNovoAnexoLote(indice) {
  const arquivo = app.anexosNovos[indice];
  if (!arquivo) return;
  app.anexosAnalises[indice] = { status: 'analisando', resultado: null };
  try {
    const { analisarAnexo } = await import('./leitor_documentos.js');
    const resultado = await analisarAnexo(arquivo);
    if (app.anexosNovos[indice] !== arquivo) return;
    app.anexosAnalises[indice] = { status: 'pronto', resultado };
  } catch {
    if (app.anexosNovos[indice] !== arquivo) return;
    app.anexosAnalises[indice] = { status: 'erro', resultado: null };
  }
  refreshLoteDetalheAnexos();
}
function bindLoteDetalheAnexos() {
  const input = document.getElementById('nf-anexos-input');
  if (input) input.onchange = () => {
    const novos = Array.from(input.files);
    const indiceInicial = app.anexosNovos.length;
    app.anexosNovos.push(...novos);
    refreshLoteDetalheAnexos();
    novos.forEach((_, i) => analisarNovoAnexoLote(indiceInicial + i));
  };
  document.querySelectorAll('[data-remover-anexo-novo]').forEach(a => {
    a.onclick = (e) => {
      e.preventDefault();
      const i = Number(a.dataset.removerAnexoNovo);
      app.anexosNovos.splice(i, 1);
      app.anexosAnalises.splice(i, 1);
      refreshLoteDetalheAnexos();
    };
  });
}

function bindLoteLinhaDetalhes() {
  const selTemRateio = document.getElementById('nf-tem-rateio');
  if (selTemRateio) selTemRateio.onchange = () => {
    app.temRateio = selTemRateio.value === 'sim';
    const area = document.getElementById('rateio-area');
    if (area) area.innerHTML = app.temRateio ? renderRateioArea() : '';
    if (app.temRateio) bindRateioArea();
  };
  if (app.temRateio) bindRateioArea();

  const chkTemImposto = document.getElementById('nf-tem-imposto');
  if (chkTemImposto) chkTemImposto.onchange = () => { app.temImposto = chkTemImposto.checked; refreshImpostoArea(); refreshLoteDetalheAnexos(); };
  bindImpostoArea();
  bindLoteDetalheAnexos();
  const selTipoContratacao = document.getElementById('lote-detalhe-tipo-contratacao');
  if (selTipoContratacao) selTipoContratacao.onchange = () => {
    app.loteRows[app.loteEditingIndex].tipo_contratacao = selTipoContratacao.value || null;
    refreshLoteDetalheAnexos();
  };
  const selTipoDespesa = document.getElementById('lote-detalhe-tipo-despesa');
  const legendaTipoDespesa = document.getElementById('lote-detalhe-tipo-despesa-legenda');
  if (selTipoDespesa && legendaTipoDespesa) {
    selTipoDespesa.onchange = () => {
      legendaTipoDespesa.textContent = TIPO_DESPESA_LABEL[selTipoDespesa.value] || TIPO_DESPESA_LABEL.padrao;
    };
  }

  const btnSalvar = document.getElementById('btn-lote-detalhe-salvar');
  if (btnSalvar) btnSalvar.onclick = () => {
    const row = app.loteRows[app.loteEditingIndex];
    row.tipo_despesa_prazo = document.getElementById('lote-detalhe-tipo-despesa').value;
    row.tipo_contratacao = document.getElementById('lote-detalhe-tipo-contratacao').value || null;
    const contaEl = document.getElementById('nf-conta-bancaria');
    row.conta_bancaria_id = contaEl ? (contaEl.value || null) : null;
    row.tem_rateio = app.temRateio;
    row.rateios = app.rateioTemp.map(r => ({ ...r }));
    row.tem_retencao_imposto = app.temImposto;
    row.impostos = app.impostoTemp.map(imp => ({ ...imp }));
    row.descricao = document.getElementById('lote-detalhe-descricao').value.trim();
    row.anexosNovos = app.anexosNovos.slice();
    row.anexosAnalises = app.anexosAnalises.slice();
    app.loteEditingIndex = null;
    app.state.modal = 'lote_nota';
    render();
  };
  const btnCancelar = document.getElementById('btn-lote-detalhe-cancelar');
  if (btnCancelar) btnCancelar.onclick = () => {
    app.loteEditingIndex = null;
    app.state.modal = 'lote_nota';
    render();
  };
}

async function salvarLote() {
  if (app.loteRows.length === 0) { showToast('Adicione ao menos uma linha.'); return; }
  sincronizarTodasLinhas();
  const btn = document.getElementById('btn-lote-salvar');
  const original = btn.textContent;
  btn.disabled = true; btn.textContent = 'Salvando...';
  try {
    let salvas = 0;
    const linhasRestantes = [];
    for (const row of app.loteRows) {
      const p = montarPayloadDaLinha(row);
      const erro = validarPayload(p);
      if (erro) { row.erro = erro; linhasRestantes.push(row); continue; }
      try {
        const { novoStatus, autoAprovada, motivoAutoAprovacao } = statusInicialParaValor(p.valor_bruto);
        const historicoInicial = [{ acao: 'Nota lançada no Central CP (lançamento em lote)', detalhe: `NF ${p.numero_nota}` }];
        if (autoAprovada) historicoInicial.push({ acao: 'Aprovação automática', detalhe: motivoAutoAprovacao });
        const resumoAuditoria = resumoAuditoriaParaHistorico(p, row.anexosAnalises);
        if (resumoAuditoria) historicoInicial.push({ acao: 'Auditoria de anexos (leitor de documentos)', detalhe: resumoAuditoria });
        const novaNota = await db.criarNota(p, app.usuario, novoStatus, historicoInicial);
        if (row.anexosNovos.length > 0) {
          app.anexosNovos = row.anexosNovos;
          app.anexosRemovidos = [];
          const anexosFinal = await finalizarAnexos(novaNota.id, [], dadosParaNomeArquivo(p));
          await db.atualizarAnexosNota(novaNota.id, anexosFinal);
        }
        row.erro = null;
        salvas++;
      } catch (e) {
        row.erro = 'Erro ao salvar: ' + e.message;
        linhasRestantes.push(row);
      }
    }
    app.loteRows = linhasRestantes;
    app.notas = await db.carregarNotas();
    if (linhasRestantes.length === 0) {
      closeModalWithFlash(`${salvas} nota(s) lançada(s) em lote.`);
    } else {
      showToast(`${salvas} nota(s) lançada(s). ${linhasRestantes.length} ficaram com erro -- corrija e tente de novo.`);
      btn.disabled = false; btn.textContent = original;
      render();
    }
  } catch (e) {
    showToast('Erro ao lançar o lote: ' + e.message);
    btn.disabled = false; btn.textContent = original;
  }
}

export function attachLoteNotaModalHandlers() {
  if (app.state.modal === 'lote_linha_detalhes') { bindLoteLinhaDetalhes(); return; }
  if (app.state.modal !== 'lote_nota') return;

  app.loteRows.forEach((row, i) => {
    bindLinhaCamposSimples(i);
    bindLinhaCascade(i);
    bindLinhaFornecedor(i);
  });

  document.querySelectorAll('[data-lote-detalhes]').forEach(b => {
    b.onclick = () => {
      sincronizarTodasLinhas();
      const i = parseInt(b.dataset.loteDetalhes, 10);
      const row = app.loteRows[i];
      app.loteEditingIndex = i;
      app.temRateio = !!row.tem_rateio;
      app.rateioTemp = row.rateios.map(r => ({ ...r }));
      app.temImposto = !!row.tem_retencao_imposto;
      app.impostoTemp = row.impostos.map(imp => ({ ...imp }));
      app.anexosNovos = row.anexosNovos.slice();
      app.anexosAnalises = row.anexosAnalises.slice();
      app.state.modal = 'lote_linha_detalhes';
      render();
    };
  });

  document.querySelectorAll('[data-lote-remover]').forEach(b => {
    b.onclick = () => {
      sincronizarTodasLinhas();
      const i = parseInt(b.dataset.loteRemover, 10);
      app.loteRows.splice(i, 1);
      render();
    };
  });

  const btnAdd = document.getElementById('btn-lote-adicionar-linha');
  if (btnAdd) btnAdd.onclick = () => {
    sincronizarTodasLinhas();
    app.loteRows.push(novaLinhaLoteVazia());
    render();
  };

  const btnSalvarLote = document.getElementById('btn-lote-salvar');
  if (btnSalvarLote) btnSalvarLote.onclick = salvarLote;
}

// Botão "Lançar em lote" da barra lateral: mesma permissão de "+ Nova
// nota" (departamento lança pro próprio setor; contas a pagar/gerente/
// administrador lançam de qualquer setor) -- ver ui.js.
export function attachLoteNotaListHandlers() {
  const btn = document.getElementById('btn-lote-nota');
  if (btn) btn.onclick = () => {
    app.loteRows = [novaLinhaLoteVazia(), novaLinhaLoteVazia(), novaLinhaLoteVazia()];
    app.loteEditingIndex = null;
    app.state.modal = 'lote_nota';
    app.state.modalData = null;
    render();
  };
}
