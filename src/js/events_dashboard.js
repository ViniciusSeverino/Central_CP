// src/js/events_dashboard.js — aba "Visão geral": seletor de mês, recorte
// do departamento e a aba "Resultado (DRE)" (ver ui_dre.js).
import { app } from './state.js';
import { render, restoreFocus } from './app.js';
import { showToast } from './toast.js';
import * as db from './db.js';

// Amarrado a cada render() (ver app.js), sem checar a view atual --
// os elementos só existem no DOM quando "Visão geral" está aberta, então
// o querySelector não acha nada e o handler simplesmente não é ligado.
let debounceBuscaConc = null;

export function attachDashboardHandlers() {
  const mesEl = document.getElementById('dash-mes');
  if (mesEl) mesEl.onchange = () => { if (mesEl.value) { app.state.dashboardMes = mesEl.value; render(); } };
  // Departamento: "Meu setor" x "Geral" (ver renderDashboard).
  document.querySelectorAll('[data-dash-escopo]').forEach(b => {
    b.onclick = () => { app.state.dashboardEscopo = b.dataset.dashEscopo; render(); };
  });

  /* ---- DRE ---- */
  const dre = app.state.dre;
  const aplicar = (fn) => () => { fn(); render(); };
  document.querySelectorAll('[data-dash-aba]').forEach(b => { b.onclick = aplicar(() => { app.state.dashboardAba = b.dataset.dashAba; }); });
  document.querySelectorAll('[data-dre-pagador]').forEach(b => {
    b.onclick = aplicar(() => { dre.pagadorId = b.dataset.drePagador; dre.abertos = new Set(); dre.detalhe = null; });
  });
  document.querySelectorAll('[data-dre-regime]').forEach(b => { b.onclick = aplicar(() => { dre.regime = b.dataset.dreRegime; dre.detalhe = null; }); });
  const ano = document.getElementById('dre-ano');
  if (ano) ano.onchange = aplicar(() => { dre.ano = Number(ano.value); dre.detalhe = null; dre.mesFoco = null; });
  // Atalho do painel (contas que mais mudaram): abre a aba DRE com a linha
  // da conta à mostra e o mês destacado.
  document.querySelectorAll('[data-dre-ir]').forEach(el => {
    el.onclick = aplicar(() => {
      let chaves = [];
      try { chaves = JSON.parse(decodeURIComponent(el.dataset.dreIr)); } catch { chaves = []; }
      chaves.forEach(k => dre.abertos.add(k));
      if (el.dataset.dreIrMes) dre.mesFoco = Number(el.dataset.dreIrMes);
      app.state.dashboardAba = 'dre';
    });
  });
  document.querySelectorAll('[data-dre-serie]').forEach(b => { b.onclick = aplicar(() => { dre.serie = b.dataset.dreSerie; }); });
  // Mês em foco: pelo seletor ou clicando no mês do gráfico.
  document.querySelectorAll('[data-dre-mes-foco]').forEach(b => { b.onclick = aplicar(() => { dre.mesFoco = Number(b.dataset.dreMesFoco); }); });
  const mesFoco = document.getElementById('dre-mes-foco');
  if (mesFoco) mesFoco.onchange = aplicar(() => { dre.mesFoco = Number(mesFoco.value); });
  const exibir = document.getElementById('dre-exibir');
  if (exibir) exibir.onchange = aplicar(() => { dre.exibir = exibir.value; });
  document.querySelectorAll('[data-dre-toggle]').forEach(b => {
    b.onclick = aplicar(() => { const k = b.dataset.dreToggle; if (dre.abertos.has(k)) dre.abertos.delete(k); else dre.abertos.add(k); });
  });
  // Nome do código = notas do ano; célula de um mês = notas daquele mês.
  // Clicar de novo no mesmo fecha.
  document.querySelectorAll('[data-dre-codigo]').forEach(b => {
    b.onclick = aplicar(() => {
      const codigoId = b.dataset.dreCodigo;
      const mes = b.dataset.dreDetMes ? Number(b.dataset.dreDetMes) : null;
      const igual = dre.detalhe && dre.detalhe.codigoId === codigoId && dre.detalhe.mes === mes;
      dre.detalhe = igual ? null : { codigoId, mes, aba: dre.detalhe && dre.detalhe.aba };
    });
  });
  document.querySelectorAll('[data-dre-det-aba]').forEach(b => {
    b.onclick = aplicar(() => { if (dre.detalhe) dre.detalhe = { ...dre.detalhe, aba: b.dataset.dreDetAba }; });
  });
  const fechar = document.querySelector('[data-dre-fechar-detalhe]');
  if (fechar) fechar.onclick = aplicar(() => { dre.detalhe = null; });

  /* ---- Fluxo de caixa ---- */
  const fl = app.state.fluxo;
  document.querySelectorAll('[data-fluxo-toggle]').forEach(b => {
    b.onclick = aplicar(() => { const k = b.dataset.fluxoToggle; if (fl.abertos.has(k)) fl.abertos.delete(k); else fl.abertos.add(k); });
  });
  const editarSaldo = document.getElementById('btn-editar-saldo');
  if (editarSaldo) editarSaldo.onclick = aplicar(() => { fl.editandoSaldo = true; });
  const cancelarSaldo = document.getElementById('btn-cancelar-saldo');
  if (cancelarSaldo) cancelarSaldo.onclick = aplicar(() => { fl.editandoSaldo = false; });
  const salvarSaldo = document.getElementById('btn-salvar-saldo');
  if (salvarSaldo) salvarSaldo.onclick = async () => {
    const mes = document.getElementById('fluxo-saldo-mes').value;
    const valorTxt = document.getElementById('fluxo-saldo-valor').value;
    const valor = Number(valorTxt);
    if (!/^\d{4}-\d{2}$/.test(mes) || valorTxt === '' || !Number.isFinite(valor)) { showToast('Informe o mês e o saldo em conta.'); return; }
    salvarSaldo.disabled = true;
    try {
      await db.salvarSaldoInicial({ pagador_id: dre.pagadorId, data: `${mes}-01`, valor }, app.usuario);
      app.saldosIniciais = await db.carregarSaldosIniciais();
      fl.editandoSaldo = false;
      showToast('Saldo salvo.', 'success');
      render();
    } catch (e) {
      showToast(e.message);
      salvarSaldo.disabled = false;
    }
  };
  const expFluxo = document.getElementById('btn-exportar-fluxo');
  if (expFluxo) expFluxo.onclick = async () => {
    expFluxo.disabled = true;
    try {
      const { dadosFluxo } = await import('./ui_fluxo.js');
      const { exportarFluxoExcel } = await import('./export_excel.js');
      const d = dadosFluxo();
      const pagador = app.cadastros.pagadores.find(p => p.id === d.s.pagadorId);
      await exportarFluxoExcel(d, { pagador: pagador ? pagador.nome : '', ano: d.s.ano });
    } catch (e) {
      showToast('Erro ao gerar o Excel: ' + e.message);
    } finally {
      expFluxo.disabled = false;
    }
  };

  /* ---- Conciliação ---- */
  const conc = app.state.conciliacao;
  const concPag = document.getElementById('conc-pagador');
  if (concPag) concPag.onchange = aplicar(() => { conc.pagadorId = concPag.value; });
  const concMes = document.getElementById('conc-mes');
  if (concMes) concMes.onchange = aplicar(() => { conc.mes = concMes.value; });
  const concLimpar = document.getElementById('conc-limpar-mes');
  if (concLimpar) concLimpar.onclick = aplicar(() => { conc.mes = ''; });
  document.querySelectorAll('[data-conc-grupo]').forEach(b => { b.onclick = aplicar(() => { conc.grupo = b.dataset.concGrupo; }); });
  // Linha abre/fecha o detalhe; clicar em "NF ..."/"Abrir nota" abre a nota.
  document.querySelectorAll('tr[data-conc-toggle]').forEach(tr => {
    tr.onclick = (e) => {
      if (e.target.closest('[data-open], a, input, select')) return;
      const k = decodeURIComponent(tr.dataset.concToggle);
      if (!(conc.abertos instanceof Set)) conc.abertos = new Set();
      if (conc.abertos.has(k)) conc.abertos.delete(k); else conc.abertos.add(k);
      render();
    };
  });
  // Mesmo debounce da busca de "Todas as notas": sem isso cada tecla
  // refazia a tela inteira.
  const concBusca = document.getElementById('conc-busca');
  if (concBusca) concBusca.oninput = () => {
    clearTimeout(debounceBuscaConc);
    debounceBuscaConc = setTimeout(() => { conc.busca = concBusca.value; render(); restoreFocus('conc-busca'); }, 220);
  };
  const expConc = document.getElementById('btn-exportar-conciliacao');
  if (expConc) expConc.onclick = async () => {
    expConc.disabled = true;
    try {
      const { dadosConciliacao } = await import('./ui_conciliacao.js');
      const { exportarConciliacaoExcel } = await import('./export_excel.js');
      await exportarConciliacaoExcel(dadosConciliacao().recorte, app);
    } catch (e) {
      showToast('Erro ao gerar o Excel: ' + e.message);
    } finally {
      expConc.disabled = false;
    }
  };

  const exp = document.getElementById('btn-exportar-dre');
  if (exp) exp.onclick = async () => {
    const original = exp.textContent;
    exp.disabled = true; exp.textContent = 'Gerando...';
    try {
      const { dadosDre } = await import('./ui_dre.js');
      const { exportarDreExcel } = await import('./export_excel.js');
      const d = dadosDre();
      const pagador = app.cadastros.pagadores.find(p => p.id === d.s.pagadorId);
      await exportarDreExcel(d.dre, { pagador: pagador ? pagador.nome : '', ano: d.s.ano, regime: d.s.regime, temGroup: d.temGroup });
    } catch (e) {
      showToast('Erro ao gerar o Excel: ' + e.message);
    } finally {
      exp.disabled = false; exp.textContent = original;
    }
  };
}
