// src/js/events_notas.js — lista de notas, modais de ação e formulário de nota
import { app, LIMITE_APROVACAO_GESTOR, fmtMoney, fmtDate } from './state.js';
import * as db from './db.js';
import { render, closeModal, closeModalMaybeConfirm, closeModalWithFlash, restoreFocus, bind } from './app.js';
import { bindClassificacaoArea, refreshClassificacaoArea, refreshContaBancariaArea, refreshRateioArea, bindFornecedorCombo, renderAnexosArea } from './ui_nota.js';
import { notasFiltradasTodas } from './ui.js';
import { showToast } from './toast.js';

/* ---- lista de notas: sempre amarrado, com ou sem modal aberto ---- */
export function attachNotaListHandlers() {
  const bn = document.getElementById('btn-nova-nota');
  if (bn) bn.onclick = () => { app.rateioTemp = []; app.temRateio = false; app.anexosNovos = []; app.anexosRemovidos = []; app.state.modal = 'nova_nota'; app.state.modalData = null; render(); };

  document.querySelectorAll('[data-open]').forEach(el => {
    el.onclick = () => { app.state.modal = 'detalhe'; app.state.modalData = el.dataset.open; render(); };
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

/* ---- modais de nota: só amarrado quando app.state.modal está setado ---- */
export function attachNotaModalHandlers() {
  const bg = document.getElementById('modal-bg');
  const protect = bg && bg.dataset.protect === '1';
  if (bg) bg.onclick = (e) => { if (e.target.id === 'modal-bg' && !protect) closeModal(); };
  const mc = document.getElementById('modal-close'); if (mc) mc.onclick = () => closeModalMaybeConfirm(protect);
  const cancel = document.getElementById('modal-cancel'); if (cancel) cancel.onclick = () => closeModalMaybeConfirm(protect);

  document.querySelectorAll('[data-action]').forEach(b => {
    b.onclick = () => {
      app.state.modal = b.dataset.action; app.state.modalData = b.dataset.id;
      if (app.state.modal === 'editar_reenviar' || app.state.modal === 'corrigir_pendencia') {
        const n = app.notas.find(x => x.id === app.state.modalData);
        app.rateioTemp = (n.rateios || []).map(r => ({ ...r }));
        app.temRateio = !!n.tem_rateio;
        app.anexosNovos = [];
        app.anexosRemovidos = [];
      }
      render();
    };
  });

  if (app.state.modal === 'nova_nota' || app.state.modal === 'editar_reenviar' || app.state.modal === 'corrigir_pendencia') {
    bindClassificacaoArea();
    bindFornecedorCombo(refreshContaBancariaArea);
    const valorInput = document.getElementById('nf-valor');
    if (valorInput) valorInput.oninput = () => { if (app.temRateio) refreshRateioArea(); };
    const selPagador = document.getElementById('nf-pagador');
    if (selPagador) selPagador.onchange = () => { refreshClassificacaoArea(); };
    const selForma = document.getElementById('nf-forma-pagamento');
    if (selForma) selForma.onchange = refreshContaBancariaArea;
    const selTemRateio = document.getElementById('nf-tem-rateio');
    if (selTemRateio) selTemRateio.onchange = () => { app.temRateio = selTemRateio.value === 'sim'; refreshClassificacaoArea(); };
    bindAnexosArea();
  }

  document.querySelectorAll('[data-goto-cadastros]').forEach(a => {
    a.onclick = (e) => { e.preventDefault(); app.state.modal = null; app.state.modalData = null; app.state.view = 'cadastros'; app.state.cadastroTab = a.dataset.gotoCadastros; render(); };
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
  function refreshAnexosArea() {
    const el = document.getElementById('anexos-area');
    if (!el) return;
    el.innerHTML = renderAnexosArea(notaDoFormularioAtual());
    bindAnexosArea();
  }
  function bindAnexosArea() {
    const input = document.getElementById('nf-anexos-input');
    if (input) input.onchange = () => {
      app.anexosNovos.push(...Array.from(input.files));
      refreshAnexosArea();
    };
    document.querySelectorAll('[data-remover-anexo]').forEach(a => {
      a.onclick = (e) => { e.preventDefault(); app.anexosRemovidos.push(a.dataset.removerAnexo); refreshAnexosArea(); };
    });
    document.querySelectorAll('[data-remover-anexo-novo]').forEach(a => {
      a.onclick = (e) => { e.preventDefault(); app.anexosNovos.splice(Number(a.dataset.removerAnexoNovo), 1); refreshAnexosArea(); };
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
      descricao: formVal('nf-descricao').trim(),
      anexos: [], // resolvido de verdade em finalizarAnexos(), depois que o id da nota existe
      classe_conta_id, centro_custo_id, codigo_classificacao_id, rateios,
      tem_rateio: app.temRateio,
    };
  }

  function validarPayload(p) {
    if (!p.data_emissao || !p.vencimento || !p.competencia || !p.numero_nota || !p.valor_bruto || !p.pagador_id || !p.fornecedor_id || !p.forma_pagamento || !p.classificacao) {
      return 'Preencha todos os campos obrigatórios: emissão, vencimento, competência, NF, valor bruto, pagador, fornecedor, forma de pagamento e classificação.';
    }
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
    return null;
  }

  // Aviso (não bloqueio) de possível NF duplicada — mesmo fornecedor +
  // mesmo número já lançado antes. Olha só dentro do que o usuário atual
  // já enxerga (respeitando o RLS de `notas`), não é uma checagem global.
  function notaDuplicadaExistente(fornecedorId, numeroNota) {
    const alvo = (numeroNota || '').trim().toLowerCase();
    if (!alvo) return null;
    return app.notas.find(n =>
      n.fornecedor_id === fornecedorId
      && (n.numero_nota || '').trim().toLowerCase() === alvo
    ) || null;
  }

  // Aplica os anexos de verdade: apaga do Storage o que foi marcado pra
  // remover e envia os arquivos novos escolhidos — só chamado aqui, no
  // momento do Salvar (cancelar o modal simplesmente descarta as duas
  // listas sem tocar em nada no Storage).
  async function finalizarAnexos(notaId, existentes) {
    const mantidos = (existentes || []).filter(p => !app.anexosRemovidos.includes(p));
    for (const caminho of app.anexosRemovidos) {
      if ((existentes || []).includes(caminho)) await db.removerAnexo(caminho);
    }
    const novos = [];
    for (const file of app.anexosNovos) novos.push(await db.uploadAnexo(notaId, file));
    return [...mantidos, ...novos];
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
    const novoStatus = p.valor_bruto > LIMITE_APROVACAO_GESTOR ? 'lancado' : 'aprovado';
    const autoAprovada = novoStatus === 'aprovado';
    const originalLabel = btnSalvarNota.textContent;
    btnSalvarNota.disabled = true; btnSalvarNota.textContent = 'Salvando...';
    try {
      if (app.state.modal === 'corrigir_pendencia' && app.state.modalData) {
        const n = app.notas.find(x => x.id === app.state.modalData);
        p.anexos = await finalizarAnexos(n.id, n.anexos);
        await db.corrigirPendencia(n.id, p, app.usuario);
        app.notas = await db.carregarNotas();
        closeModalWithFlash('Pendência corrigida — nota devolvida ao fluxo.');
        return;
      }
      if (app.state.modal === 'editar_reenviar' && app.state.modalData) {
        const n = app.notas.find(x => x.id === app.state.modalData);
        const eraRascunho = n.status === 'rascunho';
        const entradas = [{ acao: eraRascunho ? 'Rascunho enviado para aprovação' : 'Ajustado e reenviado para aprovação' }];
        if (autoAprovada) entradas.push({ acao: 'Aprovação automática', detalhe: `Valor de ${fmtMoney(p.valor_bruto)} está dentro da alçada (até ${fmtMoney(LIMITE_APROVACAO_GESTOR)}) — segue direto para o contas a pagar.` });
        p.anexos = await finalizarAnexos(n.id, n.anexos);
        await db.atualizarNota(n.id, p, app.usuario, novoStatus, entradas);
        app.notas = await db.carregarNotas();
        closeModalWithFlash(autoAprovada ? 'Nota enviada — dentro da alçada, já liberada direto para o contas a pagar.' : 'Nota enviada para aprovação do gerente financeiro.');
        return;
      }
      const historicoInicial = [{ acao: 'Nota lançada no Central CP', detalhe: `NF ${p.numero_nota}` }];
      if (autoAprovada) historicoInicial.push({ acao: 'Aprovação automática', detalhe: `Valor de ${fmtMoney(p.valor_bruto)} está dentro da alçada (até ${fmtMoney(LIMITE_APROVACAO_GESTOR)}) — segue direto para o contas a pagar.` });
      const novaNota = await db.criarNota(p, app.usuario, novoStatus, historicoInicial);
      if (app.anexosNovos.length > 0) {
        const anexosFinal = await finalizarAnexos(novaNota.id, []);
        await db.atualizarAnexosNota(novaNota.id, anexosFinal);
      }
      app.notas = await db.carregarNotas();
      closeModalWithFlash(autoAprovada ? 'Nota lançada — dentro da alçada, já liberada direto para o contas a pagar.' : 'Nota lançada. Aguardando aprovação do gerente financeiro.');
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
        p.anexos = await finalizarAnexos(app.state.modalData, n ? n.anexos : []);
        await db.atualizarNota(app.state.modalData, p, app.usuario, 'rascunho', { acao: 'Rascunho atualizado' });
        app.notas = await db.carregarNotas();
        closeModalWithFlash('Rascunho atualizado.');
        return;
      }
      const novoRascunho = await db.criarNota(p, app.usuario, 'rascunho', [{ acao: 'Rascunho criado' }]);
      if (app.anexosNovos.length > 0) {
        const anexosFinal = await finalizarAnexos(novoRascunho.id, []);
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

}
