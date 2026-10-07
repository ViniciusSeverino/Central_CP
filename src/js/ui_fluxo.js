// src/js/ui_fluxo.js
//
// Visão geral › Fluxo de caixa (só quem podeVerDre): saldo em conta,
// entradas e saídas mês a mês -- realizado até hoje, projetado daqui pra
// frente -- e o quadro de inadimplência. Lógica em fluxo_caixa.js; pagador
// e ano compartilhados com as abas Resultado e DRE (app.state.dre).
import { app, escapeHtml, fmtMoney, fmtDate } from './state.js';
import { fluxoDeCaixa, devedoresEAcordos, DIAS_COBRAVEL } from './fluxo_caixa.js';
import { inadimplencia } from './receitas.js';
import { criarCasador } from './group_importacao.js';
import { estadoDre, filtrosDre } from './ui_dre.js';
import { icon } from './icons.js';

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const fmtInt = (v) => Math.round(Number(v) || 0).toLocaleString('pt-BR');
const fmtCurto = (v) => {
  const a = Math.abs(v), sinal = v < 0 ? '−' : '';
  if (a >= 1e6) return `${sinal}R$ ${(a / 1e6).toFixed(2).replace('.', ',')} mi`;
  if (a >= 1e3) return `${sinal}R$ ${Math.round(a / 1e3).toLocaleString('pt-BR')} mil`;
  return `${sinal}R$ ${Math.round(a).toLocaleString('pt-BR')}`;
};

export function dadosFluxo() {
  const s = estadoDre();
  const saldo = (app.saldosIniciais || []).find(x => x.pagador_id === s.pagadorId) || null;
  const fluxo = fluxoDeCaixa({
    receitas: app.groupReceitas, lancamentos: app.groupLancamentos, notas: app.notas,
    casar: criarCasador(app.cadastros, app.groupMapeamento), cadastros: app.cadastros,
    pagadorId: s.pagadorId, ano: s.ano, saldo,
  });
  const receitasPag = (app.groupReceitas || []).filter(r => r.pagador_id === s.pagadorId);
  const inad = inadimplencia(receitasPag, {});
  const detalhe = devedoresEAcordos(receitasPag, {});
  return { s, saldo, fluxo, inad, detalhe };
}

function tile(rotulo, valor, sub, frase, tom = '') {
  return `<div class="dash-tile dre-kpi ${tom ? `tom-${tom}` : ''}">
    <div class="dash-tile-label">${rotulo}</div>
    <div class="dash-tile-value">${valor}</div>
    ${sub ? `<div class="dash-tile-sub">${sub}</div>` : ''}
    ${frase ? `<div class="dre-kpi-frase">${frase}</div>` : ''}
  </div>`;
}

function cartaoSaldo(s, saldo) {
  const f = app.state.fluxo;
  if (f.editandoSaldo || !saldo) {
    const mes = saldo ? String(saldo.data).slice(0, 7) : `${s.ano}-01`;
    return `<div class="dash-tile dre-kpi fluxo-saldo-edit">
      <div class="dash-tile-label">Saldo em conta no início do mês</div>
      <div class="fluxo-saldo-form">
        <input type="month" id="fluxo-saldo-mes" value="${mes}" aria-label="Mês do saldo">
        <input type="number" id="fluxo-saldo-valor" step="0.01" value="${saldo ? saldo.valor : ''}" placeholder="R$ 0,00" aria-label="Saldo em conta">
        <button type="button" class="btn btn-brand btn-sm" id="btn-salvar-saldo">Salvar</button>
        ${saldo ? '<button type="button" class="btn btn-ghost btn-sm" id="btn-cancelar-saldo">Cancelar</button>' : ''}
      </div>
      <div class="dre-kpi-frase">${saldo ? 'O saldo é encadeado a partir daqui com as entradas e saídas de cada mês.' : 'Informe o saldo do extrato no 1º dia de um mês para ver o saldo em conta mês a mês.'}</div>
    </div>`;
  }
  const [a, m] = String(saldo.data).split('-');
  return tile(`Saldo informado · início de ${MESES[Number(m) - 1].toLowerCase()}/${a}`, fmtMoney(saldo.valor),
    `atualizado em ${fmtDate(saldo.atualizado_em)}`,
    `<button type="button" class="dre-link" id="btn-editar-saldo">${icon('rascunho')} Alterar saldo</button>`);
}

function painel(s, saldo, fluxo, inad) {
  const tiles = [cartaoSaldo(s, saldo)];
  const proj = fluxo.totalEntradasProj || fluxo.totalSaidasProj;
  tiles.push(tile(`Saldo hoje (estimado)`, fluxo.saldoHoje === null ? '—' : fmtMoney(fluxo.saldoHoje),
    fluxo.saldoHoje === null ? 'informe o saldo inicial' : '',
    'Saldo informado + tudo que entrou e saiu até hoje.', fluxo.saldoHoje === null ? '' : fluxo.saldoHoje >= 0 ? 'bom' : 'alerta'));
  tiles.push(tile(`Geração de caixa · ${s.ano}`, fmtMoney(fluxo.totalGeracao),
    `entradas ${fmtCurto(fluxo.totalEntradas)} · saídas ${fmtCurto(fluxo.totalSaidas)}${proj ? ` (inclui projeção de ${fmtCurto(fluxo.totalEntradasProj)} a receber e ${fmtCurto(fluxo.totalSaidasProj)} a pagar)` : ''}`,
    'Quanto o caixa cresceu (ou encolheu) no ano: entradas menos saídas.', fluxo.totalGeracao >= 0 ? 'bom' : 'alerta'));
  const menor = fluxo.menorProximo;
  tiles.push(tile('Menor saldo nos próximos 3 meses', menor ? fmtMoney(menor.saldoFinal) : '—',
    menor ? `no fim de ${MESES[menor.mes - 1].toLowerCase()}/${s.ano}` : 'precisa do saldo inicial',
    menor ? (menor.saldoFinal < 0 ? 'Atenção: pela projeção, falta caixa -- antecipe recebimentos ou adie pagamentos.' : 'Pela projeção, o caixa se mantém positivo.') : 'Com o saldo informado, aparece aqui o ponto mais baixo da projeção.',
    menor ? (menor.saldoFinal < 0 ? 'alerta' : 'bom') : ''));
  tiles.push(tile('Inadimplência (vencido em aberto)', fmtMoney(inad.total),
    `até ${DIAS_COBRAVEL} dias: ${fmtMoney(inad.recente)} (entra na projeção)`,
    `O vencido há mais de ${DIAS_COBRAVEL} dias (${fmtCurto(inad.total - inad.recente)}) fica fora da projeção -- veja o quadro abaixo.`, inad.recente > 0 ? 'alerta' : ''));
  return `<div class="dash-tiles dre-kpis">${tiles.join('')}</div>`;
}

// Colunas de entradas e saídas por mês + linha do saldo final, um eixo só
// (R$). Meses projetados hachurados.
function grafico(fluxo, s) {
  const ms = fluxo.meses;
  const saldos = ms.map(m => m.saldoFinal).filter(v => v !== null);
  const todos = [...ms.map(m => m.entradas), ...ms.map(m => m.saidas), ...saldos];
  const max = Math.max(0, ...todos), min = Math.min(0, ...todos);
  const faixa = (max - min) || 1;
  const y = (v) => ((v - min) / faixa) * 100;
  const zero = y(0);
  const barra = (v, cls) => `<span class="dre-cg-barra ${cls}" style="bottom:${zero}%;height:${v ? Math.max(0.6, (v / faixa) * 100) : 0}%"></span>`;
  const pontos = ms.map((m, i) => (m.saldoFinal === null ? null : `${(i + 0.5) * (100 / 12)},${100 - y(m.saldoFinal)}`));
  // Polilinhas contínuas (só os meses com saldo).
  const trechos = [];
  let atual = [];
  pontos.forEach(p => { if (p) atual.push(p); else if (atual.length) { trechos.push(atual); atual = []; } });
  if (atual.length) trechos.push(atual);
  return `<div class="dash-card dre-grafico-card fluxo-grafico">
    <div class="dre-grafico-topo">
      <h3>Entradas, saídas e saldo · ${s.ano}</h3>
      <div class="dre-legenda-grafico"><span class="dre-cg-sw s-cp"></span>Entradas<span class="dre-cg-sw s-grp"></span>Saídas${saldos.length ? '<span class="fluxo-sw-saldo"></span>Saldo no fim do mês' : ''}<span class="dre-cg-sw fluxo-sw-proj"></span>Projetado</div>
    </div>
    <div class="dre-cg fluxo-cg">
      ${ms.map((m, i) => `<div class="dre-cg-mes ${m.projetado ? 'fluxo-proj' : ''} ${m.atual ? 'foco' : ''}" title="${MESES[i]}/${s.ano}${m.projetado ? ' (projetado)' : ''} · entradas ${fmtMoney(m.entradas)} · saídas ${fmtMoney(m.saidas)} · geração ${fmtMoney(m.geracao)}${m.saldoFinal !== null ? ` · saldo ${fmtMoney(m.saldoFinal)}` : ''}">
        <div class="dre-cg-area">${min < 0 ? `<span class="dre-cg-zero" style="bottom:${zero}%"></span>` : ''}<div class="dre-cg-barras"><div class="dre-cg-col">${barra(m.entradas, 's-cp')}</div><div class="dre-cg-col">${barra(m.saidas, 's-grp')}</div></div></div>
        <span class="dre-cg-rot">${MESES[i]}${m.atual ? ' · hoje' : ''}</span>
      </div>`).join('')}
      ${trechos.length ? `<svg class="fluxo-linha" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${trechos.map(t => `<polyline points="${t.join(' ')}" />`).join('')}</svg>` : ''}
    </div>
  </div>`;
}

function linhaValores(rotulo, vals, ms, { cls = '', toggle = '', aberto = false, nivel = 0, total = true } = {}) {
  const tg = toggle ? `<button type="button" class="dre-toggle" data-fluxo-toggle="${toggle}" aria-expanded="${aberto}" aria-label="${aberto ? 'Recolher' : 'Expandir'}">${icon(aberto ? 'chevronBaixo' : 'chevronDireita')}</button>` : '<span class="dre-toggle-vazio"></span>';
  const soma = vals.reduce((t, v) => t + (v || 0), 0);
  return `<tr class="${cls}">
    <td class="dre-conta"><div class="dre-conta-in" style="--nivel:${nivel}">${tg}<span title="${escapeHtml(rotulo)}">${escapeHtml(rotulo)}</span></div></td>
    ${vals.map((v, i) => `<td class="num-col dre-mes ${ms[i].projetado ? 'fluxo-proj' : ''} ${v < 0 ? 'dre-acima' : ''}">${v === null ? '<span class="dre-vazio">·</span>' : v ? fmtInt(v) : '<span class="dre-vazio">·</span>'}</td>`).join('')}
    <td class="num-col dre-tot dre-tot-1">${total ? fmtInt(soma) : ''}</td>
  </tr>`;
}

function tabela(fluxo, s) {
  const ms = fluxo.meses;
  const ab = app.state.fluxo.abertos;
  const temSaldo = fluxo.temSaldo;
  const ent = ms.map(m => m.entradas), sai = ms.map(m => -m.saidas);
  let html = '';
  if (temSaldo) html += linhaValores('Saldo no início do mês', ms.map(m => m.saldoInicial), ms, { cls: 'dre-subtotal', total: false });
  html += linhaValores('Entradas', ent, ms, { cls: 'dre-n1 fluxo-entradas', toggle: 'entradas', aberto: ab.has('entradas') });
  if (ab.has('entradas')) fluxo.entradas.forEach(l => { html += linhaValores(l.label, l.vals, ms, { nivel: 1, cls: 'dre-n2' }); });
  html += linhaValores('Saídas', sai, ms, { cls: 'dre-n1 fluxo-saidas', toggle: 'saidas', aberto: ab.has('saidas') });
  if (ab.has('saidas')) fluxo.saidas.forEach(l => { html += linhaValores(l.label, l.vals.map(v => -v), ms, { nivel: 1, cls: 'dre-n2' }); });
  html += linhaValores('Geração de caixa (entradas − saídas)', ms.map(m => m.geracao), ms, { cls: 'dre-subtotal forte' });
  if (temSaldo) html += linhaValores('Saldo no fim do mês', ms.map(m => m.saldoFinal), ms, { cls: 'dre-subtotal forte dre-resultado', total: false });
  return `<div data-tbl-fixa="fluxo" class="tbl-wrap tbl-fixa dre-tabela fluxo-tabela">
    <table class="data-tbl">
      <thead><tr><th class="dre-conta">Fluxo de caixa · ${s.ano}</th>${ms.map((m, i) => `<th class="num-col dre-mes ${m.projetado ? 'fluxo-proj' : ''} ${m.atual ? 'foco' : ''}">${MESES[i]}${m.projetado ? '<span class="fluxo-proj-tag">proj.</span>' : ''}</th>`).join('')}<th class="num-col dre-tot dre-tot-1">Ano</th></tr></thead>
      <tbody>${html}</tbody>
    </table></div>`;
}

function quadroInadimplencia(inad, detalhe) {
  const maxFaixa = Math.max(1, ...inad.faixas.map(f => f.valor));
  return `<div class="dash-card fluxo-inad">
    <div class="dre-grafico-topo"><h3>Inadimplência</h3><span class="texto-suave">vencido em aberto: ${fmtMoney(inad.total)}</span></div>
    <div class="fluxo-inad-grid">
      <section>
        <h4>Por tempo de atraso</h4>
        ${inad.faixas.map(f => `<div class="fluxo-faixa ${f.ate <= DIAS_COBRAVEL ? 'cobravel' : ''}">
          <span class="fluxo-faixa-rot">${f.label}</span>
          <span class="fluxo-faixa-barra"><span style="width:${Math.round((f.valor / maxFaixa) * 100)}%"></span></span>
          <span class="fluxo-faixa-val">${fmtCurto(f.valor)} <span class="texto-suave">· ${f.qtd}</span></span>
        </div>`).join('')}
        <p class="texto-suave fluxo-nota">Até ${DIAS_COBRAVEL} dias (destaque) entra na projeção de entradas; o resto não.</p>
      </section>
      <section>
        <h4>Maiores devedores</h4>
        ${detalhe.devedores.length ? `<table class="data-tbl conc-mini"><thead><tr><th>Lojista</th><th>Loja</th><th>Desde</th><th class="num-col">Em aberto</th></tr></thead>
          <tbody>${detalhe.devedores.map(d => `<tr><td class="trunc" title="${escapeHtml(d.sacado)}">${escapeHtml(d.sacado)}</td><td class="mono">${escapeHtml(d.luc)}</td><td>${fmtDate(d.maisAntigo)}</td><td class="num-col">${fmtMoney(d.valor)}</td></tr>`).join('')}</tbody></table>`
          : '<p class="texto-suave">Nenhum valor vencido em aberto.</p>'}
      </section>
      <section>
        <h4>Acordos a receber</h4>
        ${detalhe.acordos.length ? `<table class="data-tbl conc-mini"><thead><tr><th>Ano</th><th class="num-col">Parcelas</th><th class="num-col">Valor</th></tr></thead>
          <tbody>${detalhe.acordos.map(a => `<tr><td>${a.ano}</td><td class="num-col">${a.qtd}</td><td class="num-col">${fmtMoney(a.valor)}</td></tr>`).join('')}</tbody></table>`
          : '<p class="texto-suave">Nenhuma parcela de acordo a vencer.</p>'}
      </section>
    </div>
  </div>`;
}

export function renderFluxo() {
  if (!(app.groupReceitas || []).length && !(app.groupLancamentos || []).length) {
    return `<div class="empty-state">Importe os relatórios de receitas e despesas do Group em Configurações › Orçamento para ver o fluxo de caixa.</div>`;
  }
  const { s, saldo, fluxo, inad, detalhe } = dadosFluxo();
  return `
    ${filtrosDre(s, '<button type="button" class="btn btn-ghost btn-sm empurra" id="btn-exportar-fluxo">Exportar Excel</button>', { regime: false })}
    <p class="sub dre-legenda"><b>Fluxo de caixa</b>: o que entrou e saiu da conta (receitas recebidas, despesas pagas no Group) e, do mês atual em diante, o projetado -- a receber pelo vencimento (sem o vencido há mais de ${DIAS_COBRAVEL} dias) e a pagar (despesas do Group em aberto + notas do Central CP ainda sem lançamento no Group).</p>
    ${painel(s, saldo, fluxo, inad)}
    ${grafico(fluxo, s)}
    ${tabela(fluxo, s)}
    ${quadroInadimplencia(inad, detalhe)}`;
}
