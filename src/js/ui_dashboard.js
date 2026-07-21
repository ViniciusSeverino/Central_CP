// src/js/ui_dashboard.js
//
// Aba "Visão geral": indicadores rápidos da esteira do contas a pagar --
// só a parte de exibição, a lógica de cálculo é toda em dashboard.js
// (pura, testável sem DOM). Todos os perfis têm acesso (inclusive
// departamento, ver navItemsFor em ui.js) -- desde a decisão de abrir os
// números da esteira inteira pra todo mundo, não só quem opera ela.
import { app, escapeHtml, fmtMoney, STATUS_COLOR } from './state.js';
import { valorPorEtapa, alertasDePrazo, volumePorSetorPagadorNoMes, tempoMedioAtePagamento, impostosAProvisionarNoMes } from './dashboard.js';

// Lista de barras horizontais ranqueada por magnitude -- uma só cor por
// linha (ou a cor da etapa, quando informada), rótulo à esquerda, valor a
// direita (formato "valor no fim da barra" do mark spec).
function barrasRanking(itens, corPadrao) {
  if (!itens.length) return `<div class="empty-hint">Nada com vencimento nesse mês ainda.</div>`;
  const max = Math.max(...itens.map(i => i.valor), 1);
  return itens.map(i => `
    <div class="dash-bar-row">
      <div class="dash-bar-label" title="${escapeHtml(i.label)}">${escapeHtml(i.label)}</div>
      <div class="dash-bar-track"><div class="dash-bar-fill" style="width:${Math.max(2, Math.round((i.valor / max) * 100))}%; background:${i.cor || corPadrao};"></div></div>
      <div class="dash-bar-value">${fmtMoney(i.valor)}</div>
    </div>`).join('');
}

export function renderDashboard() {
  const notas = app.notas;
  const etapas = valorPorEtapa(notas);
  const totalNaEsteira = etapas.reduce((s, e) => s + e.valor, 0);
  const alertas = alertasDePrazo(notas);
  const mes = app.state.dashboardMes;
  const mesLabel = mes.split('-').reverse().join('/');
  const volume = volumePorSetorPagadorNoMes(notas, mes, app.cadastros.pagadores);
  const tempoMedio = tempoMedioAtePagamento(notas);
  const totalAlertas = alertas.vencimentoAtrasado + alertas.prazoCscAtrasado;
  const impostos = impostosAProvisionarNoMes(notas, mes);
  const mesReferenciaLabel = impostos.mesReferencia.split('-').reverse().join('/');

  return `
  <div>
    <div class="topbar">
      <div><h2>Visão geral</h2><p class="sub">Indicadores rápidos da esteira do contas a pagar.</p></div>
      <div class="field" style="margin:0;">
        <label for="dash-mes">Mês de vencimento</label>
        <input type="month" id="dash-mes" value="${mes}">
      </div>
    </div>

    <div class="dash-tiles">
      <div class="dash-tile">
        <div class="dash-tile-label">Valor parado na esteira</div>
        <div class="dash-tile-value">${fmtMoney(totalNaEsteira)}</div>
        <div class="dash-tile-sub">${etapas.reduce((s, e) => s + e.quantidade, 0)} nota(s), ainda não pagas</div>
      </div>
      <div class="dash-tile">
        <div class="dash-tile-label">Atrasadas</div>
        <div class="dash-tile-value ${totalAlertas > 0 ? 'alert' : ''}">${totalAlertas}</div>
        <div class="dash-tile-sub">vencimento ou prazo do CSC já estourado</div>
      </div>
      <div class="dash-tile">
        <div class="dash-tile-label">Vence em ${mesLabel}</div>
        <div class="dash-tile-value">${fmtMoney(volume.total)}</div>
        <div class="dash-tile-sub">${volume.quantidade} nota(s) com vencimento nesse mês</div>
      </div>
      <div class="dash-tile">
        <div class="dash-tile-label">Tempo médio até pagamento</div>
        <div class="dash-tile-value">${tempoMedio ? `${tempoMedio.media}d` : '—'}</div>
        <div class="dash-tile-sub">${tempoMedio ? `com base em ${tempoMedio.quantidade} nota(s) paga(s)` : 'nenhuma nota paga ainda'}</div>
      </div>
      <div class="dash-tile">
        <div class="dash-tile-label">Impostos a provisionar em ${mesLabel}</div>
        <div class="dash-tile-value">${fmtMoney(impostos.total)}</div>
        <div class="dash-tile-sub">${impostos.quantidade} nota(s) com vencimento em ${mesReferenciaLabel} (imposto de nota que vence num mês é provisionado pro mês seguinte)</div>
      </div>
    </div>

    <div class="dash-cols">
      <div>
        <div class="dash-card">
          <h3>Valor por etapa da esteira</h3>
          ${etapas.every(e => e.quantidade === 0) ? '<div class="empty-hint">Nada na esteira no momento.</div>' : barrasRanking(
            etapas.filter(e => e.quantidade > 0).map(e => ({ label: `${e.label} (${e.quantidade})`, valor: e.valor, cor: STATUS_COLOR[e.status] })),
            'var(--brand)',
          )}
        </div>
        <div class="dash-card">
          <h3>Volume por setor -- vencimento em ${mesLabel}</h3>
          ${barrasRanking(volume.porSetor, 'var(--brand)')}
        </div>
        <div class="dash-card">
          <h3>Volume por pagador -- vencimento em ${mesLabel}</h3>
          ${barrasRanking(volume.porPagador, 'var(--brand-light)')}
        </div>
      </div>
      <div>
        <div class="dash-card">
          <h3>Alertas de prazo</h3>
          <div class="dash-alertas">
            <div class="dash-alerta-tile ${alertas.vencimentoAtrasado > 0 ? 'tem-alerta' : ''}">
              <div class="n">${alertas.vencimentoAtrasado}</div>
              <div class="l">Vencimento atrasado</div>
            </div>
            <div class="dash-alerta-tile ${alertas.vencimentoProximo > 0 ? 'tem-proximo' : ''}">
              <div class="n">${alertas.vencimentoProximo}</div>
              <div class="l">Vence nos próx. 3 dias</div>
            </div>
            <div class="dash-alerta-tile ${alertas.prazoCscAtrasado > 0 ? 'tem-alerta' : ''}">
              <div class="n">${alertas.prazoCscAtrasado}</div>
              <div class="l">Prazo do CSC estourado</div>
            </div>
            <div class="dash-alerta-tile ${alertas.prazoCscProximo > 0 ? 'tem-proximo' : ''}">
              <div class="n">${alertas.prazoCscProximo}</div>
              <div class="l">CSC nos próx. 3 dias</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}
