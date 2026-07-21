// Aba "Visão geral" (dashboard.js + ui_dashboard.js): renderiza os 5
// indicadores escolhidos -- valor por etapa da esteira, alertas de prazo,
// volume por setor/pagador no mês, tempo médio até pagamento, e impostos
// a provisionar no mês seguinte. A
// visibilidade por perfil (só quem opera a esteira inteira) é coberta em
// permissoes_departamento.mjs/permissoes_contas_a_pagar.mjs -- um boot por
// arquivo é a regra da suíte (reimportar módulos ES com estado global no
// mesmo processo vaza uma sessão na outra, ver lib/boot.mjs).
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { dom, document, erros } = await bootApp(PERFIS.administrador);

const nav = document.querySelector('[data-view="dashboard"]');
checar(!!nav, 'administrador vê a aba "Visão geral"');
nav.click();
await new Promise(r => setTimeout(r, 100));

const texto = document.body.textContent;
checar(texto.includes('Visão geral'), 'a tela mostra o título "Visão geral"');
checar(texto.includes('Valor parado na esteira'), 'mostra o indicador de valor parado na esteira');
checar(texto.includes('Atrasadas'), 'mostra o indicador de notas atrasadas');
checar(texto.includes('Tempo médio até pagamento'), 'mostra o indicador de tempo médio até pagamento');
checar(texto.includes('Valor por etapa da esteira'), 'mostra o detalhamento por etapa');
checar(texto.includes('Alertas de prazo'), 'mostra o card de alertas de prazo');
checar(texto.includes('Volume por setor'), 'mostra o detalhamento de volume por setor');
checar(texto.includes('Volume por pagador'), 'mostra o detalhamento de volume por pagador');
checar(texto.includes('Impostos a provisionar'), 'mostra o indicador de impostos a provisionar (calculado a partir do mês anterior)');

// Filtro de mês (por vencimento) -- começa no mês atual, dá pra trocar.
const { app } = await import('./app/src/js/state.js');
const mesEl = document.getElementById('dash-mes');
checar(!!mesEl, 'tem o seletor de mês de vencimento');
checar(mesEl.value === app.state.dashboardMes, 'seletor começa no mês atual (app.state.dashboardMes)');
mesEl.value = '2026-01';
mesEl.dispatchEvent(new dom.window.Event('change'));
await new Promise(r => setTimeout(r, 50));
checar(app.state.dashboardMes === '2026-01', 'trocar o mês no seletor atualiza app.state.dashboardMes');
checar(document.body.textContent.includes('01/2026'), 'a tela passa a mostrar os indicadores do mês escolhido');

checarSemErrosNaoTratados(erros, 'dashboard_visao_geral_visibilidade_e_ui');
relatorioFinal('dashboard_visao_geral_visibilidade_e_ui');
