// src/js/ui_dre.js
//
// Aba "Resultado (DRE)" da Visão geral -- só a exibição; o cálculo é todo
// em dre.js. Por enquanto só o administrador vê (ver podeVerDre em
// state.js): o dono do produto vai conferir os números com os controles
// externos antes de liberar pros outros perfis.
import { app, escapeHtml, fmtMoney, fmtDate, fmtCompetencia, nomeUsuario, statusLabel, resolverLabelsNota } from './state.js';
import { linhasDespesa, dreDoPeriodo, serie12Meses, notasDoCodigo, pagadoresDoDre } from './dre.js';
import { icon } from './icons.js';

const fmtMes = (m) => m.split('-').reverse().join('/');
const NOMES_MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function estadoDre() {
  const s = app.state.dre;
  const pagadores = pagadoresDoDre(app.cadastros);
  if (!s.pagadorId || !pagadores.some(p => p.id === s.pagadorId)) s.pagadorId = pagadores[0] ? pagadores[0].id : null;
  return s;
}

// Tudo que a tela (e a exportação) precisa, calculado uma vez por render.
export function dadosDre() {
  const s = estadoDre();
  const mes = app.state.dashboardMes;
  const linhas = linhasDespesa(app.notas, { pagadorId: s.pagadorId, regime: s.regime });
  return { s, mes, linhas, dre: dreDoPeriodo(linhas, app.cadastros, { mes, acumulado: s.acumulado }), serie: serie12Meses(linhas, app.cadastros, mes) };
}

function variacao(atual, anterior) {
  if (!anterior) return '<span class="texto-suave">—</span>';
  const pct = ((atual - anterior) / anterior) * 100;
  const seta = pct > 0.5 ? '▲' : pct < -0.5 ? '▼' : '■';
  return `${seta} ${Math.abs(pct).toFixed(0)}%`;
}

function pctDoTotal(v, total) {
  return total ? `${((v / total) * 100).toFixed(1).replace('.', ',')}%` : '—';
}

// Barras dos 12 meses: uma série só (despesas operacionais), barra na cor
// discreta e o mês escolhido em destaque; valor no title (hover) e clicar
// num mês leva o DRE pra ele.
function graficoMeses(serie, mesAtual) {
  const max = Math.max(...serie.map(p => p.valor), 1);
  return `<div class="dre-grafico" role="img" aria-label="Despesas operacionais nos últimos 12 meses">
    ${serie.map(p => `<button type="button" class="dre-barra ${p.mes === mesAtual ? 'atual' : ''}" data-dre-mes="${p.mes}" title="${fmtMes(p.mes)}: ${fmtMoney(p.valor)}">
      <span class="dre-barra-fill" style="height:${p.valor ? Math.max(2, Math.round((p.valor / max) * 100)) : 0}%"></span>
      <span class="dre-barra-mes">${NOMES_MES[Number(p.mes.slice(5)) - 1]}</span>
    </button>`).join('')}
  </div>`;
}

function linhaArvore(nivel, chave, n, total, temFilhos, aberto) {
  const toggle = temFilhos ? `<button type="button" class="dre-toggle" data-dre-toggle="${chave}" aria-expanded="${aberto}" aria-label="${aberto ? 'Recolher' : 'Expandir'}">${icon(aberto ? 'chevronBaixo' : 'chevronDireita')}</button>` : '<span class="dre-toggle-vazio"></span>';
  const nome = `${n.codigo ? `<span class="dre-codigo">${escapeHtml(n.codigo)}</span> ` : ''}${escapeHtml(n.nome)}`;
  const conteudo = nivel === 3
    ? `<button type="button" class="dre-link" data-dre-codigo="${n.id || ''}" title="Ver as notas deste código">${nome}</button>`
    : nome;
  const ativo = nivel === 3 && app.state.dre.codigoAberto === (n.id || '');
  return `<tr class="dre-n${nivel} ${ativo ? 'ativo' : ''}">
    <td class="dre-conta"><div class="dre-conta-in" style="--nivel:${nivel - 1}">${toggle}${conteudo}</div></td>
    <td class="num-col">${fmtMoney(n.realizado)}</td>
    <td class="num-col texto-suave">${pctDoTotal(n.realizado, total)}</td>
    <td class="num-col texto-suave">${n.anterior ? fmtMoney(n.anterior) : '—'}</td>
    <td class="num-col texto-suave">${variacao(n.realizado, n.anterior)}</td>
    <td class="num-col texto-suave">${n.qtdNotas || ''}</td>
  </tr>`;
}

function linhasDoGrupo(g, total) {
  const abertos = app.state.dre.abertos;
  let html = '';
  for (const c of g.centros) {
    const kc = `c:${c.id}`;
    const ac = abertos.has(kc);
    html += linhaArvore(1, kc, c, total, c.filhos.length > 0, ac);
    if (!ac) continue;
    for (const cl of c.filhos) {
      const kcl = `cl:${c.id}:${cl.id}`;
      const acl = abertos.has(kcl);
      html += linhaArvore(2, kcl, cl, total, cl.filhos.length > 0, acl);
      if (acl) for (const co of cl.filhos) html += linhaArvore(3, '', co, total, false, false);
    }
  }
  return html;
}

function subtotal(rotulo, v, total, classe = '') {
  return `<tr class="dre-subtotal ${classe}">
    <td>${rotulo}</td><td class="num-col">${fmtMoney(v.realizado)}</td>
    <td class="num-col texto-suave">${pctDoTotal(v.realizado, total)}</td>
    <td class="num-col texto-suave">${v.anterior ? fmtMoney(v.anterior) : '—'}</td>
    <td class="num-col texto-suave">${variacao(v.realizado, v.anterior)}</td><td></td>
  </tr>`;
}

function painelDetalhe(linhas, dre) {
  const id = app.state.dre.codigoAberto;
  if (id === null || id === undefined) return '';
  const cod = app.cadastros.codigos_classificacao.find(c => c.id === id);
  const itens = notasDoCodigo(linhas, id || null, { de: dre.periodo.de, ate: dre.periodo.ate });
  const total = itens.reduce((s, i) => s + i.valor, 0);
  return `<div class="dash-card dre-detalhe">
    <div class="dre-detalhe-topo">
      <h3>${cod ? `${escapeHtml(cod.codigo)} · ${escapeHtml(cod.nome)}` : 'Sem código'}</h3>
      <button type="button" class="btn btn-ghost btn-sm" data-dre-fechar-detalhe>${icon('fechar')} Fechar</button>
    </div>
    <div data-tbl-fixa="dre-detalhe" data-tbl-fixa-max="360" class="tbl-wrap tbl-fixa">
    <table class="data-tbl">
      <thead><tr><th>Fornecedor</th><th>NF</th><th>${app.state.dre.regime === 'caixa' ? 'Pago em' : 'Competência'}</th><th>Status</th><th class="num-col">Valor no código</th></tr></thead>
      <tbody>${itens.map(i => {
        const n = app.notas.find(x => x.id === i.notaId);
        if (!n) return '';
        const lbl = resolverLabelsNota(n);
        return `<tr class="row-click" data-open="${n.id}">
          <td class="trunc" title="${escapeHtml(lbl.fornecedor_label)}">${escapeHtml(lbl.fornecedor_label)}</td>
          <td class="mono">${escapeHtml(n.numero_nota || '—')}</td>
          <td>${app.state.dre.regime === 'caixa' ? fmtDate(n.data_pagamento) : fmtCompetencia(n.competencia)}</td>
          <td><span class="status-chip st-${n.status}">${statusLabel(n.status)}</span></td>
          <td class="num-col">${fmtMoney(i.valor)}${n.tem_rateio ? ' <span class="texto-suave" title="Parte do rateio desta nota">(rateio)</span>' : ''}</td>
        </tr>`;
      }).join('')}</tbody>
      <tfoot><tr><td colspan="4">${itens.length} nota${itens.length === 1 ? '' : 's'}</td><td class="num-col">${fmtMoney(total)}</td></tr></tfoot>
    </table>
    </div>
  </div>`;
}

export function renderDre() {
  const { s, mes, linhas, dre, serie } = dadosDre();
  const pagadores = pagadoresDoDre(app.cadastros);
  const op = dre.operacional;
  const fora = dre.grupos.filter(g => g.chave !== 'operacional');
  const totalFora = fora.reduce((a, g) => a + g.realizado, 0);
  const qtdNotas = new Set(linhas.filter(l => l.mes >= dre.periodo.de && l.mes <= dre.periodo.ate).map(l => l.notaId)).size;
  const maiorCentro = op.centros.slice().sort((a, b) => b.realizado - a.realizado)[0];
  const rotuloPeriodo = s.acumulado ? `jan a ${fmtMes(mes)}` : fmtMes(mes);
  const rotuloAnterior = s.acumulado ? `mesmo período de ${Number(mes.slice(0, 4)) - 1}` : fmtMes(dre.periodo.antAte);
  return `
    <div class="dre-controles">
      <div class="segmentado" role="group" aria-label="Pagador">
        ${pagadores.map(p => `<button type="button" data-dre-pagador="${p.id}" class="${s.pagadorId === p.id ? 'active' : ''}">${escapeHtml(p.nome)}</button>`).join('')}
      </div>
      <input type="month" id="dash-mes" value="${mes}" aria-label="Mês">
      <div class="segmentado" role="group" aria-label="Período">
        <button type="button" data-dre-acumulado="nao" class="${s.acumulado ? '' : 'active'}">Mês</button>
        <button type="button" data-dre-acumulado="sim" class="${s.acumulado ? 'active' : ''}">Acumulado no ano</button>
      </div>
      <div class="segmentado" role="group" aria-label="Regime">
        <button type="button" data-dre-regime="competencia" class="${s.regime === 'competencia' ? 'active' : ''}" title="Pela competência da nota (DRE contábil)">Competência</button>
        <button type="button" data-dre-regime="caixa" class="${s.regime === 'caixa' ? 'active' : ''}" title="Pela data de pagamento (o que saiu do caixa)">Caixa</button>
      </div>
      <button type="button" class="btn btn-ghost btn-sm empurra" id="btn-exportar-dre">Exportar Excel</button>
    </div>
    <p class="sub dre-legenda">Despesas lançadas no Central CP · valor bruto · ${s.regime === 'caixa' ? 'regime de caixa (data de pagamento, só o que já foi pago)' : 'regime de competência'} · ${rotuloPeriodo}. Rateios divididos proporcionalmente entre os centros.</p>

    <div class="dash-tiles">
      <div class="dash-tile dash-tile-tendencia">
        <div>
          <div class="dash-tile-label">Despesas operacionais</div>
          <div class="dash-tile-value">${fmtMoney(op.realizado)}</div>
          <div class="dash-delta" title="${rotuloAnterior}: ${fmtMoney(op.anterior)}">${op.anterior ? `${variacao(op.realizado, op.anterior)} vs ${rotuloAnterior}` : `sem valores em ${rotuloAnterior}`}</div>
          <div class="dash-tile-sub">${qtdNotas} nota${qtdNotas === 1 ? '' : 's'} no período</div>
        </div>
        <div class="dash-tendencia">${graficoMeses(serie, mes)}<div class="dash-tendencia-legenda">últimos 12 meses · clique num mês</div></div>
      </div>
      <div class="dash-tile">
        <div class="dash-tile-label">Maior centro de custo</div>
        <div class="dash-tile-value dre-tile-texto">${maiorCentro ? escapeHtml(maiorCentro.nome) : '—'}</div>
        <div class="dash-tile-sub">${maiorCentro ? `${fmtMoney(maiorCentro.realizado)} · ${pctDoTotal(maiorCentro.realizado, op.realizado)} das despesas operacionais` : 'nada no período'}</div>
      </div>
      <div class="dash-tile">
        <div class="dash-tile-label">Fora do operacional</div>
        <div class="dash-tile-value">${fmtMoney(totalFora)}</div>
        <div class="dash-tile-sub">${fora.length ? fora.map(g => `${g.label}: ${fmtMoney(g.realizado)}`).join(' · ') : 'distribuição de resultados, valores a recuperar e não operacionais'}</div>
      </div>
    </div>

    <div data-tbl-fixa="dre" class="tbl-wrap tbl-fixa dre-tabela">
    <table class="data-tbl">
      <thead><tr><th>Conta</th><th class="num-col">Realizado</th><th class="num-col" title="Participação nas despesas operacionais">% operacional</th><th class="num-col">${s.acumulado ? 'Ano anterior' : 'Mês anterior'}</th><th class="num-col">Variação</th><th class="num-col">Notas</th></tr></thead>
      <tbody>
        ${op.centros.length ? linhasDoGrupo(op, op.realizado) : `<tr><td colspan="6" class="texto-suave">Nenhuma despesa operacional no período.</td></tr>`}
        ${subtotal('Total de despesas operacionais', op, op.realizado, 'forte')}
        ${fora.map(g => `<tr class="dre-grupo"><td colspan="6">${g.label}</td></tr>${linhasDoGrupo(g, op.realizado)}`).join('')}
      </tbody>
      <tfoot>${subtotal(`Total geral${fora.length ? ' (com o que está fora do operacional)' : ''}`, dre.total, op.realizado)}</tfoot>
    </table>
    </div>
    ${painelDetalhe(linhas, dre)}`;
}
