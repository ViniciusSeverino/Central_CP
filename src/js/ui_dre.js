// src/js/ui_dre.js
//
// Aba "Resultado (DRE)" da Visão geral -- só a exibição; o cálculo é todo
// em dre.js. Visão ANUAL: uma coluna por mês, realizado x orçado. Por
// enquanto só o administrador vê (ver podeVerDre em state.js): o dono do
// produto confere os números com os controles externos antes de liberar.
//
// Realizado e orçado ao mesmo tempo, sem dobrar a tabela: em "Realizado x
// orçado" (padrão) cada célula mostra o realizado e, logo abaixo, uma
// régua fina com o quanto do orçado do mês ele consumiu -- a régua passa
// pra cor de alerta quando estoura. O orçado e o desvio exatos ficam no
// title (hover) e no seletor "Exibir" (só orçado / desvio).
import { app, escapeHtml, fmtMoney, fmtDate, fmtCompetencia, statusLabel, resolverLabelsNota } from './state.js';
import { linhasDespesa, dreAnual, maioresEstouros, notasDoCodigo, pagadoresDoDre } from './dre.js';
import { icon } from './icons.js';

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const fmtInt = (v) => Math.round(Number(v) || 0).toLocaleString('pt-BR');
const fmtPct = (v) => `${(v * 100).toFixed(0)}%`;

export function estadoDre() {
  const s = app.state.dre;
  const pagadores = pagadoresDoDre(app.cadastros);
  if (!s.pagadorId || !pagadores.some(p => p.id === s.pagadorId)) s.pagadorId = pagadores[0] ? pagadores[0].id : null;
  return s;
}

// "Acumulado até" do ano escolhido: no ano corrente, até o mês atual; ano
// passado, o ano inteiro; ano futuro, nada ainda.
export function ateMesDoAno(ano, hoje = new Date()) {
  const atual = hoje.getFullYear();
  if (ano < atual) return 12;
  if (ano > atual) return 0;
  return hoje.getMonth() + 1;
}

export function anosDisponiveis() {
  const anos = new Set([new Date().getFullYear()]);
  (app.notas || []).forEach(n => { if (n.competencia) anos.add(Number(String(n.competencia).slice(0, 4))); });
  (app.orcamento || []).forEach(o => anos.add(o.ano));
  return Array.from(anos).filter(Boolean).sort();
}

// Tudo que a tela (e a exportação) precisa, calculado uma vez por render.
export function dadosDre() {
  const s = estadoDre();
  const ateMes = ateMesDoAno(s.ano);
  const linhas = linhasDespesa(app.notas, { pagadorId: s.pagadorId, regime: s.regime });
  const dre = dreAnual(linhas, app.orcamento, app.cadastros, { ano: s.ano, pagadorId: s.pagadorId, ateMes });
  return { s, linhas, dre, ateMes };
}

// Célula de um mês. `alvo` = o que o seletor "Exibir" pede.
function celula(real, orc, alvo, futuro, detalhe) {
  const desvio = real - orc;
  const estourou = orc > 0 && real > orc;
  const titulo = `Realizado ${fmtMoney(real)} · Orçado ${orc ? fmtMoney(orc) : '—'}${orc ? ` · Desvio ${desvio >= 0 ? '+' : ''}${fmtMoney(desvio)} (${fmtPct(desvio / orc)})` : ''}`;
  let numero;
  if (alvo === 'orcado') numero = orc ? fmtInt(orc) : '';
  // Desvio só existe com orçado; e mês que ainda não chegou sem nada
  // lançado não tem desvio (seria só o orçado com sinal trocado).
  else if (alvo === 'desvio') numero = orc && (real || !futuro) ? `${desvio > 0 ? '+' : ''}${fmtInt(desvio)}` : '';
  else numero = real ? fmtInt(real) : '';
  const regua = alvo === 'realizado_orcado' && orc > 0
    ? `<span class="dre-regua ${estourou ? 'estourou' : ''}"><span style="width:${Math.min(100, Math.round((real / orc) * 100))}%"></span></span>`
    : '';
  const classes = ['num-col', 'dre-mes', futuro ? 'futuro' : '', alvo === 'desvio' && desvio > 0 && orc ? 'dre-acima' : '', detalhe ? 'dre-cel-clicavel' : ''].filter(Boolean).join(' ');
  return `<td class="${classes}" title="${titulo}" ${detalhe || ''}>${numero || '<span class="dre-vazio">·</span>'}${regua}</td>`;
}

function colunasTotal(n) {
  const desvio = n.totalReal - n.totalOrc;
  const pct = n.totalOrc ? desvio / n.totalOrc : null;
  return `<td class="num-col dre-tot dre-tot-1">${n.totalOrc ? fmtInt(n.totalOrc) : '—'}</td>
    <td class="num-col dre-tot">${fmtInt(n.totalReal)}</td>
    <td class="num-col dre-tot ${pct !== null && pct > 0 ? 'dre-acima' : ''}" title="${pct === null ? 'Sem orçado' : `${desvio >= 0 ? '+' : ''}${fmtMoney(desvio)}`}">${pct === null ? '—' : `${pct > 0 ? '+' : ''}${fmtPct(pct)}`}</td>`;
}

function linhaArvore(nivel, chave, n, s, ateMes, temFilhos, aberto) {
  const toggle = temFilhos ? `<button type="button" class="dre-toggle" data-dre-toggle="${chave}" aria-expanded="${aberto}" aria-label="${aberto ? 'Recolher' : 'Expandir'}">${icon(aberto ? 'chevronBaixo' : 'chevronDireita')}</button>` : '<span class="dre-toggle-vazio"></span>';
  const nome = `${n.codigo ? `<span class="dre-codigo">${escapeHtml(n.codigo)}</span> ` : ''}${escapeHtml(n.nome)}`;
  const idCod = n.id || '';
  const conteudo = nivel === 3
    ? `<button type="button" class="dre-link" data-dre-codigo="${idCod}" title="Ver as notas deste código no ano">${nome}</button>`
    : `<span title="${escapeHtml(n.nome)}">${nome}</span>`;
  const det = app.state.dre.detalhe;
  const ativo = nivel === 3 && det && det.codigoId === idCod;
  const meses = n.real.map((r, i) => celula(r, n.orc[i], s.exibir, i + 1 > ateMes, nivel === 3 && r ? `data-dre-codigo="${idCod}" data-dre-det-mes="${i + 1}"` : '')).join('');
  return `<tr class="dre-n${nivel} ${ativo ? 'ativo' : ''}">
    <td class="dre-conta"><div class="dre-conta-in" style="--nivel:${nivel - 1}">${toggle}${conteudo}</div></td>
    ${meses}${colunasTotal(n)}
  </tr>`;
}

function linhasDoGrupo(g, s, ateMes) {
  const abertos = s.abertos;
  let html = '';
  for (const c of g.centros) {
    const kc = `c:${c.id}`;
    const ac = abertos.has(kc);
    html += linhaArvore(1, kc, c, s, ateMes, c.filhos.length > 0, ac);
    if (!ac) continue;
    for (const cl of c.filhos) {
      const kcl = `cl:${c.id}:${cl.id}`;
      const acl = abertos.has(kcl);
      html += linhaArvore(2, kcl, cl, s, ateMes, cl.filhos.length > 0, acl);
      if (acl) for (const co of cl.filhos) html += linhaArvore(3, '', co, s, ateMes, false, false);
    }
  }
  return html;
}

function linhaTotal(rotulo, v, s, ateMes, classe = '') {
  return `<tr class="dre-subtotal ${classe}">
    <td class="dre-conta">${rotulo}</td>
    ${v.real.map((r, i) => celula(r, v.orc[i], s.exibir, i + 1 > ateMes, '')).join('')}
    ${colunasTotal(v)}
  </tr>`;
}

// Gráfico do ano: realizado em barras (cor de destaque, só uma série) e o
// orçado do mês como um traço de referência sobre cada barra -- um eixo só,
// mesma escala. Legenda sempre à vista; valores no title de cada mês.
function graficoAno(op, ateMes) {
  const max = Math.max(...op.real, ...op.orc, 1);
  const temOrc = op.orc.some(v => v > 0);
  return `<div class="dash-card dre-grafico-card">
    <div class="dre-grafico-topo">
      <h3>Despesas operacionais por mês</h3>
      <div class="dre-legenda-grafico"><span class="dre-sw-real"></span>Realizado${temOrc ? '<span class="dre-sw-acima"></span>Acima do orçado<span class="dre-sw-orc"></span>Orçado' : ''}</div>
    </div>
    <div class="dre-grafico-ano">
      ${op.real.map((r, i) => {
        const o = op.orc[i];
        return `<div class="dre-gm ${i + 1 > ateMes ? 'futuro' : ''}" title="${MESES[i]}: realizado ${fmtMoney(r)}${o ? ` · orçado ${fmtMoney(o)}` : ''}">
          <div class="dre-gm-area">
            <span class="dre-gm-barra ${o && r > o ? 'estourou' : ''}" style="height:${r ? Math.max(1, (r / max) * 100) : 0}%"></span>
            ${o ? `<span class="dre-gm-orc" style="bottom:${(o / max) * 100}%"></span>` : ''}
          </div>
          <span class="dre-gm-mes">${MESES[i]}</span>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

function painelDetalhe(linhas, s) {
  const det = s.detalhe;
  if (!det) return '';
  const cod = app.cadastros.codigos_classificacao.find(c => c.id === det.codigoId);
  const itens = notasDoCodigo(linhas, det.codigoId || null, { ano: s.ano, mes: det.mes });
  const total = itens.reduce((a, i) => a + i.valor, 0);
  return `<div class="dash-card dre-detalhe">
    <div class="dre-detalhe-topo">
      <h3>${cod ? `${escapeHtml(cod.codigo)} · ${escapeHtml(cod.nome)}` : 'Sem código'} <span class="texto-suave">· ${det.mes ? `${MESES[det.mes - 1]}/${s.ano}` : `ano de ${s.ano}`}</span></h3>
      <div>
        ${det.mes ? `<button type="button" class="btn btn-ghost btn-sm" data-dre-codigo="${det.codigoId || ''}">Ver o ano todo</button>` : ''}
        <button type="button" class="btn btn-ghost btn-sm" data-dre-fechar-detalhe>${icon('fechar')} Fechar</button>
      </div>
    </div>
    <div data-tbl-fixa="dre-detalhe" data-tbl-fixa-max="360" class="tbl-wrap tbl-fixa">
    <table class="data-tbl">
      <thead><tr><th>Fornecedor</th><th>NF</th><th>${s.regime === 'caixa' ? 'Pago em' : 'Competência'}</th><th>Status</th><th class="num-col">Valor no código</th></tr></thead>
      <tbody>${itens.map(i => {
        const n = app.notas.find(x => x.id === i.notaId);
        if (!n) return '';
        const lbl = resolverLabelsNota(n);
        return `<tr class="row-click" data-open="${n.id}">
          <td class="trunc" title="${escapeHtml(lbl.fornecedor_label)}">${escapeHtml(lbl.fornecedor_label)}</td>
          <td class="mono">${escapeHtml(n.numero_nota || '—')}</td>
          <td>${s.regime === 'caixa' ? fmtDate(n.data_pagamento) : fmtCompetencia(n.competencia)}</td>
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
  const { s, linhas, dre, ateMes } = dadosDre();
  const pagadores = pagadoresDoDre(app.cadastros);
  const op = dre.operacional;
  const fora = dre.grupos.filter(g => g.chave !== 'operacional');
  const temOrcamento = op.totalOrc > 0;
  const execucao = op.ytdOrc ? op.ytdReal / op.ytdOrc : null;
  const desvioYtd = op.ytdReal - op.ytdOrc;
  const estouros = temOrcamento ? maioresEstouros(dre) : [];
  const rotuloAte = ateMes === 0 ? 'ano ainda não começou' : ateMes === 12 ? `ano de ${s.ano}` : `jan a ${MESES[ateMes - 1].toLowerCase()}/${s.ano}`;
  return `
    <div class="dre-controles">
      <div class="segmentado" role="group" aria-label="Pagador">
        ${pagadores.map(p => `<button type="button" data-dre-pagador="${p.id}" class="${s.pagadorId === p.id ? 'active' : ''}">${escapeHtml(p.nome)}</button>`).join('')}
      </div>
      <select id="dre-ano" aria-label="Ano">${anosDisponiveis().map(a => `<option value="${a}" ${a === s.ano ? 'selected' : ''}>${a}</option>`).join('')}</select>
      <div class="segmentado" role="group" aria-label="Regime">
        <button type="button" data-dre-regime="competencia" class="${s.regime === 'competencia' ? 'active' : ''}" title="Pela competência da nota (DRE contábil)">Competência</button>
        <button type="button" data-dre-regime="caixa" class="${s.regime === 'caixa' ? 'active' : ''}" title="Pela data de pagamento (o que saiu do caixa)">Caixa</button>
      </div>
      <label class="dre-exibir">Exibir
        <select id="dre-exibir">
          <option value="realizado_orcado" ${s.exibir === 'realizado_orcado' ? 'selected' : ''}>Realizado x orçado</option>
          <option value="realizado" ${s.exibir === 'realizado' ? 'selected' : ''}>Só realizado</option>
          <option value="orcado" ${s.exibir === 'orcado' ? 'selected' : ''}>Só orçado</option>
          <option value="desvio" ${s.exibir === 'desvio' ? 'selected' : ''}>Desvio (realizado − orçado)</option>
        </select>
      </label>
      <button type="button" class="btn btn-ghost btn-sm empurra" id="btn-exportar-dre">Exportar Excel</button>
    </div>
    <p class="sub dre-legenda">Despesas lançadas no Central CP · valor bruto · ${s.regime === 'caixa' ? 'regime de caixa (data de pagamento, só o que já foi pago)' : 'regime de competência'} · valores em R$, sem centavos nas colunas dos meses. ${temOrcamento ? 'Régua sob cada valor: quanto do orçado do mês já foi consumido (laranja = estourou).' : 'Sem orçamento carregado pra este pagador/ano -- carregue em Configurações › Orçamento.'}</p>

    <div class="dash-tiles">
      <div class="dash-tile">
        <div class="dash-tile-label">Realizado · ${rotuloAte}</div>
        <div class="dash-tile-value">${fmtMoney(op.ytdReal)}</div>
        <div class="dash-tile-sub">despesas operacionais · ano todo: ${fmtMoney(op.totalReal)}</div>
      </div>
      <div class="dash-tile">
        <div class="dash-tile-label">Orçado · ${rotuloAte}</div>
        <div class="dash-tile-value">${temOrcamento ? fmtMoney(op.ytdOrc) : '—'}</div>
        ${execucao !== null ? `<div class="dre-execucao"><span class="${execucao > 1 ? 'estourou' : ''}" style="width:${Math.min(100, Math.round(execucao * 100))}%"></span></div>` : ''}
        <div class="dash-tile-sub">${execucao !== null ? `${fmtPct(execucao)} executado · desvio ${desvioYtd >= 0 ? '+' : ''}${fmtMoney(desvioYtd)}` : 'sem orçamento carregado'}</div>
      </div>
      <div class="dash-tile">
        <div class="dash-tile-label">Maiores estouros · ${rotuloAte}</div>
        ${estouros.length ? `<ol class="dre-estouros">${estouros.map(e => `<li><button type="button" class="dre-link" ${e.id ? `data-dre-codigo="${e.id}"` : ''} title="${escapeHtml(e.codigo)} ${escapeHtml(e.nome)}">${escapeHtml(e.nome)}</button><span class="dre-acima">+${fmtMoney(e.desvio)} (${fmtPct(e.pct)})</span></li>`).join('')}</ol>`
          : `<div class="dash-tile-sub">${temOrcamento ? 'Nenhuma conta acima do orçado. ' : 'Aparece quando houver orçamento carregado.'}</div>`}
      </div>
    </div>

    ${graficoAno(op, ateMes)}

    <div data-tbl-fixa="dre" class="tbl-wrap tbl-fixa dre-tabela">
    <table class="data-tbl">
      <thead><tr>
        <th class="dre-conta">Conta</th>
        ${MESES.map((m, i) => `<th class="num-col dre-mes ${i + 1 > ateMes ? 'futuro' : ''}">${m}</th>`).join('')}
        <th class="num-col dre-tot dre-tot-1">Orçado ${s.ano}</th><th class="num-col dre-tot">Realizado ${s.ano}</th><th class="num-col dre-tot">Desvio</th>
      </tr></thead>
      <tbody>
        ${op.centros.length ? linhasDoGrupo(op, s, ateMes) : `<tr><td colspan="16" class="texto-suave">Nenhuma despesa operacional neste ano.</td></tr>`}
        ${linhaTotal('Total de despesas operacionais', op, s, ateMes, 'forte')}
        ${fora.map(g => `<tr class="dre-grupo"><td class="dre-conta" colspan="16">${g.label}</td></tr>${linhasDoGrupo(g, s, ateMes)}`).join('')}
      </tbody>
      <tfoot>${linhaTotal(`Total geral${fora.length ? ' (com o que está fora do operacional)' : ''}`, dre.total, s, ateMes)}</tfoot>
    </table>
    </div>
    ${painelDetalhe(linhas, s)}`;
}
