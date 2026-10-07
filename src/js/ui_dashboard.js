// src/js/ui_dashboard.js
//
// Aba "Visão geral": indicadores da esteira do contas a pagar -- só a parte
// de exibição, a lógica de cálculo é toda em dashboard.js (pura, testável
// sem DOM). Todos os perfis têm acesso (inclusive departamento, ver
// navItemsFor em ui.js).
//
// Organização: dois blocos com títulos que dizem a que período cada número
// se refere -- "Agora" (a esteira inteira, independente de mês) e "Mês de
// vencimento" (com o seletor de mês ao lado do título, então fica claro
// quais números ele muda; antes o seletor ficava no topo da página e só
// mexia em parte dos indicadores). Todo valor é líquido (o que de fato
// sai do caixa), dito na legenda do topo.
import { app, escapeHtml, fmtMoney, STATUS_COLOR, ehSuperUsuario, podeVerDre } from './state.js';
import { renderDre, renderResultado } from './ui_dre.js';
import { renderFluxo } from './ui_fluxo.js';
import { renderConciliacao } from './ui_conciliacao.js';
import { valorPorEtapa, alertasDePrazo, volumePorSetorPagadorNoMes, tempoMedioAtePagamento, impostosAProvisionarNoMes, mesAnterior, serieMensal, notasDoEscopo } from './dashboard.js';

const fmtMes = (mesIso) => mesIso.split('-').reverse().join('/');

// Barras horizontais ranqueadas por magnitude (uma medida só, então uma cor
// só; a cor da etapa quando informada). Rótulo à esquerda (uma linha, com
// reticências), valor à direita; quantidade de notas e o valor no title
// (hover) e no texto ao lado do valor.
function barrasRanking(itens, corPadrao, vazio = 'Nada com vencimento nesse mês ainda.') {
  if (!itens.length) return `<div class="empty-hint">${vazio}</div>`;
  const max = Math.max(...itens.map(i => i.valor), 1);
  return itens.map(i => `
    <div class="dash-bar-row" title="${escapeHtml(i.label)}: ${fmtMoney(i.valor)}${i.quantidade !== undefined ? ` · ${i.quantidade} nota${i.quantidade === 1 ? '' : 's'}` : ''}">
      <div class="dash-bar-label">${escapeHtml(i.label)}</div>
      <div class="dash-bar-track"><div class="dash-bar-fill" style="width:${Math.max(2, Math.round((i.valor / max) * 100))}%; background:${i.cor || corPadrao};"></div></div>
      <div class="dash-bar-value">${fmtMoney(i.valor)}${i.quantidade !== undefined ? `<span class="dash-bar-qtd">${i.quantidade} nota${i.quantidade === 1 ? '' : 's'}</span>` : ''}</div>
    </div>`).join('');
}

// Variação contra o mês anterior. Cor neutra: mais valor vencendo não é
// "bom" nem "ruim" por si só -- a seta e o sinal dizem a direção.
function delta(atual, anterior, mesAnteriorIso) {
  if (!anterior && !atual) return '';
  if (!anterior) return `<div class="dash-delta">sem valores em ${fmtMes(mesAnteriorIso)}</div>`;
  const pct = ((atual - anterior) / anterior) * 100;
  const seta = pct > 0.5 ? '▲' : pct < -0.5 ? '▼' : '■';
  return `<div class="dash-delta" title="${fmtMes(mesAnteriorIso)}: ${fmtMoney(anterior)}">${seta} ${Math.abs(pct).toFixed(0)}% vs ${fmtMes(mesAnteriorIso)}</div>`;
}

// Mini-gráfico de tendência (12 meses terminando no mês escolhido): linha
// na cor discreta, ponto do mês atual em destaque. Decorativo pro leitor de
// tela -- o valor e a variação já estão em texto no próprio indicador.
function sparkline(valores) {
  const w = 180, h = 44, pad = 4;
  const max = Math.max(...valores, 1);
  const pts = valores.map((v, i) => [pad + (i * (w - 2 * pad)) / Math.max(1, valores.length - 1), h - pad - (v / max) * (h - 2 * pad)]);
  const [ux, uy] = pts[pts.length - 1];
  return `<svg class="dash-spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">
    <polyline points="${pts.map(p => p.map(n => n.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="var(--line)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${ux.toFixed(1)}" cy="${uy.toFixed(1)}" r="3" fill="var(--brand-light)"/>
  </svg>`;
}

// Indicador: rótulo, valor, legenda; `extra` (variação) logo abaixo do
// valor e, quando há, a tendência à direita (ver .dash-tile-tendencia).
function tile(label, valor, sub, extra = '', classeValor = '', tendencia = '') {
  return `<div class="dash-tile ${tendencia ? 'dash-tile-tendencia' : ''}">
    <div>
      <div class="dash-tile-label">${label}</div>
      <div class="dash-tile-value ${classeValor}">${valor}</div>
      ${extra}
      <div class="dash-tile-sub">${sub}</div>
    </div>
    ${tendencia ? `<div class="dash-tendencia">${tendencia}<div class="dash-tendencia-legenda">últimos 12 meses</div></div>` : ''}
  </div>`;
}

// Abas pra quem podeVerDre(): "Resultado" e "DRE" (ui_dre.js),
// "Conciliação" (ui_conciliacao.js) e "Esteira" (o painel do processo de
// pagamento, abaixo). Os demais perfis
// veem só a Esteira, sem aba nenhuma -- igual a antes.
export function renderDashboard() {
  if (!podeVerDre()) return renderEsteira();
  const aba = ['dre', 'fluxo', 'esteira', 'conciliacao'].includes(app.state.dashboardAba) ? app.state.dashboardAba : 'resultado';
  const subtitulo = { resultado: 'O resultado por pagador em poucos números -- o que entrou, o que saiu e o que mudou.', dre: 'Receitas, despesas e resultado por conta, mês a mês.', fluxo: 'O que entrou, o que saiu e o que vem pela frente -- com o saldo em conta.', conciliacao: 'Group x Central CP, lançamento a lançamento.', esteira: 'Indicadores da esteira do contas a pagar · valores líquidos (descontada a retenção de impostos).' }[aba];
  return `
  <div>
    <div class="topbar">
      <div><h2>Visão geral</h2><p class="sub">${subtitulo}</p></div>
      <div class="segmentado" role="tablist" aria-label="Visão">
        <button type="button" role="tab" data-dash-aba="resultado" aria-selected="${aba === 'resultado'}" class="${aba === 'resultado' ? 'active' : ''}">Resultado</button>
        <button type="button" role="tab" data-dash-aba="dre" aria-selected="${aba === 'dre'}" class="${aba === 'dre' ? 'active' : ''}">DRE</button>
        <button type="button" role="tab" data-dash-aba="fluxo" aria-selected="${aba === 'fluxo'}" class="${aba === 'fluxo' ? 'active' : ''}">Fluxo de caixa</button>
        <button type="button" role="tab" data-dash-aba="conciliacao" aria-selected="${aba === 'conciliacao'}" class="${aba === 'conciliacao' ? 'active' : ''}">Conciliação</button>
        <button type="button" role="tab" data-dash-aba="esteira" aria-selected="${aba === 'esteira'}" class="${aba === 'esteira' ? 'active' : ''}">Esteira</button>
      </div>
    </div>
    ${aba === 'resultado' ? renderResultado() : aba === 'dre' ? renderDre() : aba === 'fluxo' ? renderFluxo() : aba === 'conciliacao' ? renderConciliacao() : renderEsteira({ semTopo: true })}
  </div>`;
}

function renderEsteira({ semTopo = false } = {}) {
  const u = app.usuario;
  // Departamento vê o próprio setor por padrão (é o que ele acompanha no
  // dia a dia), com opção de "Geral"; demais perfis veem tudo.
  const podeRecortar = !ehSuperUsuario() && u.role === 'departamento' && !!u.setor;
  const escopoSetor = podeRecortar && app.state.dashboardEscopo !== 'geral';
  const notas = notasDoEscopo(app.notas, escopoSetor ? u.setor : null);

  const etapas = valorPorEtapa(notas);
  const totalNaEsteira = etapas.reduce((s, e) => s + e.valor, 0);
  const qtdNaEsteira = etapas.reduce((s, e) => s + e.quantidade, 0);
  const alertas = alertasDePrazo(notas);
  const tempoMedio = tempoMedioAtePagamento(notas);

  const mes = app.state.dashboardMes;
  const mesAnt = mesAnterior(mes);
  const volume = volumePorSetorPagadorNoMes(notas, mes, app.cadastros.pagadores);
  const volumeAnt = volumePorSetorPagadorNoMes(notas, mesAnt, app.cadastros.pagadores);
  const impostos = impostosAProvisionarNoMes(notas, mes);
  const impostosAnt = impostosAProvisionarNoMes(notas, mesAnt);
  const serie = serieMensal(notas, mes, app.cadastros.pagadores);

  // Dentro da aba "Esteira" (administrador), o título já está no topo das
  // abas -- aqui não repete (o departamento, que recorta por setor, nunca
  // está nesse caso).
  return `
  <div>
    ${semTopo ? '' : `<div class="topbar">
      <div><h2>Visão geral</h2><p class="sub">Indicadores da esteira do contas a pagar${escopoSetor ? ` · setor ${escapeHtml(u.setor)}` : ''} · valores líquidos (descontada a retenção de impostos).</p></div>
      ${podeRecortar ? `<div class="segmentado" role="group" aria-label="Recorte">
        <button type="button" data-dash-escopo="setor" class="${escopoSetor ? 'active' : ''}">Meu setor</button>
        <button type="button" data-dash-escopo="geral" class="${escopoSetor ? '' : 'active'}">Geral</button>
      </div>` : ''}
    </div>`}

    <h3 class="dash-secao">Agora <span>toda a esteira, sem recorte de mês</span></h3>
    <div class="dash-tiles">
      ${tile('Valor parado na esteira', fmtMoney(totalNaEsteira), `${qtdNaEsteira} nota${qtdNaEsteira === 1 ? '' : 's'} ainda não paga${qtdNaEsteira === 1 ? '' : 's'}`)}
      ${tile('Atrasadas', String(alertas.atrasadasDistintas), 'vencimento ou prazo do CSC já estourado', '', alertas.atrasadasDistintas > 0 ? 'alert' : '')}
      ${tile('Tempo médio até pagamento', tempoMedio ? `${String(tempoMedio.media).replace('.', ',')} dias` : '—', tempoMedio ? `do lançamento ao pagamento, ${tempoMedio.quantidade} nota${tempoMedio.quantidade === 1 ? '' : 's'} paga${tempoMedio.quantidade === 1 ? '' : 's'}` : 'nenhuma nota paga ainda')}
    </div>
    <div class="dash-cols">
      <div class="dash-card">
        <h3>Valor por etapa da esteira</h3>
        ${etapas.every(e => e.quantidade === 0) ? '<div class="empty-hint">Nada na esteira no momento.</div>' : barrasRanking(
          etapas.filter(e => e.quantidade > 0).map(e => ({ label: e.label, valor: e.valor, quantidade: e.quantidade, cor: STATUS_COLOR[e.status] })),
          'var(--brand)',
        )}
      </div>
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

    <div class="dash-secao-linha">
      <h3 class="dash-secao">Mês de vencimento</h3>
      <input type="month" id="dash-mes" value="${mes}" aria-label="Mês de vencimento">
    </div>
    <div class="dash-tiles">
      ${tile(`Vence em ${fmtMes(mes)}`, fmtMoney(volume.total), `${volume.quantidade} nota${volume.quantidade === 1 ? '' : 's'} com vencimento no mês`,
        delta(volume.total, volumeAnt.total, mesAnt), '', sparkline(serie.map(p => p.vence)))}
      ${tile(`Impostos a provisionar em ${fmtMes(mes)}`, fmtMoney(impostos.total), `retidos de ${impostos.quantidade} nota${impostos.quantidade === 1 ? '' : 's'} que venceram em ${fmtMes(impostos.mesReferencia)}`,
        delta(impostos.total, impostosAnt.total, mesAnt), '', sparkline(serie.map(p => p.impostos)))}
    </div>
    <div class="dash-cols">
      ${escopoSetor ? '' : `<div class="dash-card">
        <h3>Volume por setor</h3>
        ${barrasRanking(volume.porSetor, 'var(--brand)')}
      </div>`}
      <div class="dash-card">
        <h3>Volume por pagador</h3>
        ${barrasRanking(volume.porPagador, 'var(--brand-light)')}
      </div>
    </div>
  </div>`;
}
