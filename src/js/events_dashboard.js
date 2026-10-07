// src/js/events_dashboard.js — aba "Visão geral": seletor de mês, recorte
// do departamento e a aba "Resultado (DRE)" (ver ui_dre.js).
import { app } from './state.js';
import { render } from './app.js';
import { showToast } from './toast.js';

// Amarrado a cada render() (ver app.js), sem checar a view atual --
// os elementos só existem no DOM quando "Visão geral" está aberta, então
// o querySelector não acha nada e o handler simplesmente não é ligado.
export function attachDashboardHandlers() {
  const mesEl = document.getElementById('dash-mes');
  if (mesEl) mesEl.onchange = () => { if (mesEl.value) { app.state.dashboardMes = mesEl.value; app.state.dre.codigoAberto = null; render(); } };
  // Departamento: "Meu setor" x "Geral" (ver renderDashboard).
  document.querySelectorAll('[data-dash-escopo]').forEach(b => {
    b.onclick = () => { app.state.dashboardEscopo = b.dataset.dashEscopo; render(); };
  });

  /* ---- DRE ---- */
  const dre = app.state.dre;
  const aplicar = (fn) => () => { fn(); render(); };
  document.querySelectorAll('[data-dash-aba]').forEach(b => { b.onclick = aplicar(() => { app.state.dashboardAba = b.dataset.dashAba; }); });
  document.querySelectorAll('[data-dre-pagador]').forEach(b => {
    b.onclick = aplicar(() => { dre.pagadorId = b.dataset.drePagador; dre.abertos = new Set(); dre.codigoAberto = null; });
  });
  document.querySelectorAll('[data-dre-regime]').forEach(b => { b.onclick = aplicar(() => { dre.regime = b.dataset.dreRegime; dre.codigoAberto = null; }); });
  document.querySelectorAll('[data-dre-acumulado]').forEach(b => { b.onclick = aplicar(() => { dre.acumulado = b.dataset.dreAcumulado === 'sim'; dre.codigoAberto = null; }); });
  document.querySelectorAll('[data-dre-mes]').forEach(b => { b.onclick = aplicar(() => { app.state.dashboardMes = b.dataset.dreMes; dre.codigoAberto = null; }); });
  document.querySelectorAll('[data-dre-toggle]').forEach(b => {
    b.onclick = aplicar(() => { const k = b.dataset.dreToggle; if (dre.abertos.has(k)) dre.abertos.delete(k); else dre.abertos.add(k); });
  });
  document.querySelectorAll('[data-dre-codigo]').forEach(b => {
    b.onclick = aplicar(() => { const id = b.dataset.dreCodigo; dre.codigoAberto = dre.codigoAberto === id ? null : id; });
  });
  const fechar = document.querySelector('[data-dre-fechar-detalhe]');
  if (fechar) fechar.onclick = aplicar(() => { dre.codigoAberto = null; });

  const exp = document.getElementById('btn-exportar-dre');
  if (exp) exp.onclick = async () => {
    const original = exp.textContent;
    exp.disabled = true; exp.textContent = 'Gerando...';
    try {
      const { dadosDre } = await import('./ui_dre.js');
      const { exportarDreExcel } = await import('./export_excel.js');
      const d = dadosDre();
      const pagador = app.cadastros.pagadores.find(p => p.id === d.s.pagadorId);
      await exportarDreExcel(d.dre, { pagador: pagador ? pagador.nome : '', mes: d.mes, regime: d.s.regime, acumulado: d.s.acumulado });
    } catch (e) {
      showToast('Erro ao gerar o Excel: ' + e.message);
    } finally {
      exp.disabled = false; exp.textContent = original;
    }
  };
}
