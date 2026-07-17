// src/js/events_dashboard.js — aba "Visão geral": seletor de mês (por vencimento)
import { app } from './state.js';
import { render } from './app.js';

// Amarrado a cada render() (ver app.js), sem checar a view atual --
// #dash-mes só existe no DOM quando "Visão geral" está aberta, então o
// getElementById dá null e o handler simplesmente não é ligado.
export function attachDashboardHandlers() {
  const mesEl = document.getElementById('dash-mes');
  if (mesEl) mesEl.onchange = () => { app.state.dashboardMes = mesEl.value; render(); };
}
