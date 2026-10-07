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
import { linhasDespesa, linhasGroup, dreAnual, maioresEstouros, notasDoCodigo, lancamentosDoCodigo, pagadoresDoDre } from './dre.js';
import { criarCasador } from './group_importacao.js';
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
// Com as despesas do Group importadas, o Group é o realizado oficial e o
// Central CP a conferência (decisão do dono do produto).
export function dadosDre() {
  const s = estadoDre();
  const ateMes = ateMesDoAno(s.ano);
  const linhas = linhasDespesa(app.notas, { pagadorId: s.pagadorId, regime: s.regime });
  const temGroup = (app.groupLancamentos || []).length > 0;
  const linhasGrp = temGroup
    ? linhasGroup(app.groupLancamentos, criarCasador(app.cadastros, app.groupMapeamento), { pagadorId: s.pagadorId, regime: s.regime === 'caixa' ? 'caixa' : 'vencimento' })
    : null;
  const dre = dreAnual(linhas, app.orcamento, app.cadastros, { ano: s.ano, pagadorId: s.pagadorId, ateMes, linhasGrp });
  return { s, linhas, linhasGrp, dre, ateMes, temGroup: dre.fonte === 'group' };
}

const ROTULO_EXIBIR = {
  realizado_orcado: 'Realizado x orçado', group: 'Só Group', cp: 'Só Central CP', orcado: 'Só orçado',
  desvio: 'Realizado − orçado', grp_cp: 'Group − Central CP',
};

// Célula de um mês. `alvo` = o que o seletor "Exibir" pede. rea = realizado
// oficial (Group quando importado, senão CP); cp = Central CP; grp = Group.
function celula(v, alvo, futuro, detalhe, temGroup) {
  const { rea, orc, cp, grp } = v;
  const desvio = rea - orc;
  const estourou = orc > 0 && rea > orc;
  const difCp = temGroup && Math.abs(grp - cp) > 1;
  const titulo = [
    temGroup ? `Group ${fmtMoney(grp)} · Central CP ${fmtMoney(cp)}${difCp ? ` (diferença ${fmtMoney(grp - cp)})` : ''}` : `Realizado ${fmtMoney(rea)}`,
    `Orçado ${orc ? fmtMoney(orc) : '—'}${orc ? ` · desvio ${desvio >= 0 ? '+' : ''}${fmtMoney(desvio)} (${fmtPct(desvio / orc)})` : ''}`,
  ].join(' · ');
  let numero;
  if (alvo === 'orcado') numero = orc ? fmtInt(orc) : '';
  else if (alvo === 'cp') numero = cp ? fmtInt(cp) : '';
  else if (alvo === 'group') numero = grp ? fmtInt(grp) : '';
  // Desvio só existe com orçado; mês que ainda não chegou sem nada lançado
  // não tem desvio (seria só o orçado com sinal trocado).
  else if (alvo === 'desvio') numero = orc && (rea || !futuro) ? `${desvio > 0 ? '+' : ''}${fmtInt(desvio)}` : '';
  else if (alvo === 'grp_cp') numero = difCp ? `${grp - cp > 0 ? '+' : ''}${fmtInt(grp - cp)}` : '';
  else numero = rea ? fmtInt(rea) : '';
  const regua = alvo === 'realizado_orcado' && orc > 0
    ? `<span class="dre-regua ${estourou ? 'estourou' : ''}"><span style="width:${Math.min(100, Math.round((rea / orc) * 100))}%"></span></span>`
    : '';
  // Ponto discreto: Group e Central CP não batem neste mês (detalhe no title).
  const marca = difCp && alvo === 'realizado_orcado' ? '<span class="dre-dif" aria-hidden="true"></span>' : '';
  const acima = (alvo === 'desvio' && desvio > 0 && orc) || (alvo === 'grp_cp' && difCp);
  const classes = ['num-col', 'dre-mes', futuro ? 'futuro' : '', acima ? 'dre-acima' : '', detalhe ? 'dre-cel-clicavel' : ''].filter(Boolean).join(' ');
  return `<td class="${classes}" title="${titulo}" ${detalhe || ''}>${marca}${numero || '<span class="dre-vazio">·</span>'}${regua}</td>`;
}
const valoresMes = (n, i) => ({ rea: n.rea[i], orc: n.orc[i], cp: n.real[i], grp: n.grp[i] });

function colunasTotal(n, temGroup) {
  const desvio = n.totalRea - n.totalOrc;
  const pct = n.totalOrc ? desvio / n.totalOrc : null;
  const difCp = temGroup && Math.abs(n.totalGrp - n.totalReal) > 1;
  return `<td class="num-col dre-tot dre-tot-1">${n.totalOrc ? fmtInt(n.totalOrc) : '—'}</td>
    <td class="num-col dre-tot">${fmtInt(n.totalRea)}</td>
    ${temGroup ? `<td class="num-col dre-tot dre-tot-cp ${difCp ? 'dre-tot-dif' : ''}" title="${difCp ? `Group − Central CP: ${fmtMoney(n.totalGrp - n.totalReal)}` : 'Bate com o Group'}">${fmtInt(n.totalReal)}</td>` : ''}
    <td class="num-col dre-tot ${pct !== null && pct > 0 ? 'dre-acima' : ''}" title="${pct === null ? 'Sem orçado' : `${desvio >= 0 ? '+' : ''}${fmtMoney(desvio)}`}">${pct === null ? '—' : `${pct > 0 ? '+' : ''}${fmtPct(pct)}`}</td>`;
}

function linhaArvore(nivel, chave, n, s, ateMes, temFilhos, aberto, temGroup) {
  const toggle = temFilhos ? `<button type="button" class="dre-toggle" data-dre-toggle="${chave}" aria-expanded="${aberto}" aria-label="${aberto ? 'Recolher' : 'Expandir'}">${icon(aberto ? 'chevronBaixo' : 'chevronDireita')}</button>` : '<span class="dre-toggle-vazio"></span>';
  const nome = `${n.codigo ? `<span class="dre-codigo">${escapeHtml(n.codigo)}</span> ` : ''}${escapeHtml(n.nome)}`;
  const idCod = n.id || '';
  const clicavel = nivel === 3 && !n.soGroup;
  const conteudo = clicavel
    ? `<button type="button" class="dre-link" data-dre-codigo="${idCod}" title="Ver os lançamentos deste código no ano">${nome}</button>`
    : `<span class="${n.soGroup ? 'dre-so-group' : ''}" title="${escapeHtml(n.nome)}">${nome}</span>`;
  const det = app.state.dre.detalhe;
  const ativo = nivel === 3 && det && det.codigoId === idCod;
  const meses = n.rea.map((r, i) => celula(valoresMes(n, i), s.exibir, i + 1 > ateMes, clicavel && (r || n.real[i]) ? `data-dre-codigo="${idCod}" data-dre-det-mes="${i + 1}"` : '', temGroup)).join('');
  return `<tr class="dre-n${nivel} ${ativo ? 'ativo' : ''}">
    <td class="dre-conta"><div class="dre-conta-in" style="--nivel:${nivel - 1}">${toggle}${conteudo}</div></td>
    ${meses}${colunasTotal(n, temGroup)}
  </tr>`;
}

function linhasDoGrupo(g, s, ateMes, temGroup) {
  const abertos = s.abertos;
  let html = '';
  for (const c of g.centros) {
    const kc = `c:${c.id || c.nome}`;
    const ac = abertos.has(kc);
    html += linhaArvore(1, kc, c, s, ateMes, c.filhos.length > 0, ac, temGroup);
    if (!ac) continue;
    for (const cl of c.filhos) {
      const kcl = `cl:${c.id || c.nome}:${cl.id || cl.nome}`;
      const acl = abertos.has(kcl);
      html += linhaArvore(2, kcl, cl, s, ateMes, cl.filhos.length > 0, acl, temGroup);
      if (acl) for (const co of cl.filhos) html += linhaArvore(3, '', co, s, ateMes, false, false, temGroup);
    }
  }
  return html;
}

function linhaTotal(rotulo, v, s, ateMes, temGroup, classe = '') {
  return `<tr class="dre-subtotal ${classe}">
    <td class="dre-conta">${rotulo}</td>
    ${v.rea.map((_, i) => celula(valoresMes(v, i), s.exibir, i + 1 > ateMes, '', temGroup)).join('')}
    ${colunasTotal(v, temGroup)}
  </tr>`;
}

// Gráfico do ano: realizado em barras (uma série, cor de destaque), orçado
// como traço contínuo e -- com o Group importado -- o Central CP como traço
// pontilhado, na mesma escala (um eixo só). Valores no title de cada mês.
function graficoAno(op, ateMes, temGroup) {
  const max = Math.max(...op.rea, ...op.orc, ...(temGroup ? op.real : []), 1);
  const temOrc = op.orc.some(v => v > 0);
  return `<div class="dash-card dre-grafico-card">
    <div class="dre-grafico-topo">
      <h3>Despesas operacionais por mês</h3>
      <div class="dre-legenda-grafico"><span class="dre-sw-real"></span>${temGroup ? 'Realizado (Group)' : 'Realizado'}${temOrc ? '<span class="dre-sw-acima"></span>Acima do orçado<span class="dre-sw-orc"></span>Orçado' : ''}${temGroup ? '<span class="dre-sw-cp"></span>Central CP' : ''}</div>
    </div>
    <div class="dre-grafico-ano">
      ${op.rea.map((r, i) => {
        const o = op.orc[i];
        const cp = op.real[i];
        return `<div class="dre-gm ${i + 1 > ateMes ? 'futuro' : ''}" title="${MESES[i]}: ${temGroup ? `Group ${fmtMoney(r)} · Central CP ${fmtMoney(cp)}` : `realizado ${fmtMoney(r)}`}${o ? ` · orçado ${fmtMoney(o)}` : ''}">
          <div class="dre-gm-area">
            <span class="dre-gm-barra ${o && r > o ? 'estourou' : ''}" style="height:${r ? Math.max(1, (r / max) * 100) : 0}%"></span>
            ${o ? `<span class="dre-gm-orc" style="bottom:${(o / max) * 100}%"></span>` : ''}
            ${temGroup && cp ? `<span class="dre-gm-cp" style="bottom:${(cp / max) * 100}%"></span>` : ''}
          </div>
          <span class="dre-gm-mes">${MESES[i]}</span>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

function tabelaNotasCp(linhas, s, det) {
  const itens = notasDoCodigo(linhas, det.codigoId || null, { ano: s.ano, mes: det.mes });
  const total = itens.reduce((a, i) => a + i.valor, 0);
  const rotuloData = s.regime === 'caixa' ? 'Pago em' : s.regime === 'vencimento' ? 'Vencimento' : 'Competência';
  return `<div data-tbl-fixa="dre-detalhe-cp" data-tbl-fixa-max="320" class="tbl-wrap tbl-fixa">
    <table class="data-tbl">
      <thead><tr><th>Fornecedor</th><th>NF</th><th>${rotuloData}</th><th>Nº Group</th><th>Status</th><th class="num-col">Valor no código</th></tr></thead>
      <tbody>${itens.map(i => {
        const n = app.notas.find(x => x.id === i.notaId);
        if (!n) return '';
        const lbl = resolverLabelsNota(n);
        return `<tr class="row-click" data-open="${n.id}">
          <td class="trunc" title="${escapeHtml(lbl.fornecedor_label)}">${escapeHtml(lbl.fornecedor_label)}</td>
          <td class="mono">${escapeHtml(n.numero_nota || '—')}</td>
          <td>${s.regime === 'caixa' ? fmtDate(n.data_pagamento) : s.regime === 'vencimento' ? fmtDate(n.vencimento) : fmtCompetencia(n.competencia)}</td>
          <td class="mono">${escapeHtml(n.numero_lancamento_group || '—')}</td>
          <td><span class="status-chip st-${n.status}">${statusLabel(n.status)}</span></td>
          <td class="num-col">${fmtMoney(i.valor)}${n.tem_rateio ? ' <span class="texto-suave" title="Parte do rateio desta nota">(rateio)</span>' : ''}</td>
        </tr>`;
      }).join('') || '<tr><td colspan="6" class="texto-suave">Nenhuma nota do Central CP.</td></tr>'}</tbody>
      <tfoot><tr><td colspan="5">${itens.length} nota${itens.length === 1 ? '' : 's'}</td><td class="num-col">${fmtMoney(total)}</td></tr></tfoot>
    </table></div>`;
}

function tabelaGroup(linhasGrp, s, det) {
  const itens = lancamentosDoCodigo(linhasGrp, det.codigoId || null, { ano: s.ano, mes: det.mes });
  const porId = new Map((app.groupLancamentos || []).map(l => [l.id_group, l]));
  const total = itens.reduce((a, i) => a + i.valor, 0);
  return `<div data-tbl-fixa="dre-detalhe-group" data-tbl-fixa-max="320" class="tbl-wrap tbl-fixa">
    <table class="data-tbl">
      <thead><tr><th>Fornecedor</th><th>Classe no Group</th><th>NF</th><th>Vencimento</th><th>Movimento</th><th>Situação</th><th class="num-col">Valor</th></tr></thead>
      <tbody>${itens.map(i => {
        const l = porId.get(i.lancId) || {};
        return `<tr>
          <td class="trunc" title="${escapeHtml(l.fornecedor || '')}">${escapeHtml(l.fornecedor || '—')}</td>
          <td class="trunc" title="${escapeHtml(l.classe_nome || '')}">${escapeHtml(l.classe_nome || '—')}</td>
          <td class="mono">${escapeHtml(l.nota_fiscal || '—')}</td>
          <td>${fmtDate(l.vencimento)}</td>
          <td class="mono">${escapeHtml(l.movimento || '—')}</td>
          <td>${escapeHtml(String(l.situacao || '').replace(/^\s*\d+\s*-\s*/, '') || '—')}</td>
          <td class="num-col">${fmtMoney(i.valor)}</td>
        </tr>`;
      }).join('') || '<tr><td colspan="7" class="texto-suave">Nenhum lançamento no Group.</td></tr>'}</tbody>
      <tfoot><tr><td colspan="6">${itens.length} lançamento${itens.length === 1 ? '' : 's'}</td><td class="num-col">${fmtMoney(total)}</td></tr></tfoot>
    </table></div>`;
}

function painelDetalhe(linhas, linhasGrp, s, temGroup) {
  const det = s.detalhe;
  if (!det) return '';
  const cod = app.cadastros.codigos_classificacao.find(c => c.id === det.codigoId);
  const aba = temGroup && det.aba === 'cp' ? 'cp' : temGroup ? 'group' : 'cp';
  return `<div class="dash-card dre-detalhe">
    <div class="dre-detalhe-topo">
      <h3>${cod ? `${escapeHtml(cod.codigo)} · ${escapeHtml(cod.nome)}` : 'Sem código'} <span class="texto-suave">· ${det.mes ? `${MESES[det.mes - 1]}/${s.ano}` : `ano de ${s.ano}`}</span></h3>
      <div class="dre-detalhe-acoes">
        ${temGroup ? `<div class="segmentado" role="tablist" aria-label="Origem">
          <button type="button" data-dre-det-aba="group" class="${aba === 'group' ? 'active' : ''}">Group</button>
          <button type="button" data-dre-det-aba="cp" class="${aba === 'cp' ? 'active' : ''}">Central CP</button>
        </div>` : ''}
        ${det.mes ? `<button type="button" class="btn btn-ghost btn-sm" data-dre-codigo="${det.codigoId || ''}">Ver o ano todo</button>` : ''}
        <button type="button" class="btn btn-ghost btn-sm" data-dre-fechar-detalhe>${icon('fechar')} Fechar</button>
      </div>
    </div>
    ${aba === 'group' ? tabelaGroup(linhasGrp, s, det) : tabelaNotasCp(linhas, s, det)}
  </div>`;
}

export function renderDre() {
  const { s, linhas, linhasGrp, dre, ateMes, temGroup } = dadosDre();
  if (!temGroup && (s.exibir === 'group' || s.exibir === 'grp_cp' || s.exibir === 'cp')) s.exibir = 'realizado_orcado';
  const pagadores = pagadoresDoDre(app.cadastros);
  const op = dre.operacional;
  const fora = dre.grupos.filter(g => g.chave !== 'operacional');
  const temOrcamento = op.totalOrc > 0;
  const execucao = op.ytdOrc ? op.ytdRea / op.ytdOrc : null;
  const desvioYtd = op.ytdRea - op.ytdOrc;
  const estouros = temOrcamento ? maioresEstouros(dre) : [];
  const rotuloAte = ateMes === 0 ? 'ano ainda não começou' : ateMes === 12 ? `ano de ${s.ano}` : `jan a ${MESES[ateMes - 1].toLowerCase()}/${s.ano}`;
  const cobertura = temGroup && op.ytdGrp ? op.ytdReal / op.ytdGrp : null;
  const ultimaImportacao = temGroup ? (app.groupLancamentos || []).reduce((m, l) => (l.importado_em > m ? l.importado_em : m), '') : '';
  const opcoesExibir = ['realizado_orcado', ...(temGroup ? ['group', 'cp'] : []), 'orcado', 'desvio', ...(temGroup ? ['grp_cp'] : [])];
  const colunas = temGroup ? 17 : 16;
  return `
    <div class="dre-controles">
      <div class="segmentado" role="group" aria-label="Pagador">
        ${pagadores.map(p => `<button type="button" data-dre-pagador="${p.id}" class="${s.pagadorId === p.id ? 'active' : ''}">${escapeHtml(p.nome)}</button>`).join('')}
      </div>
      <select id="dre-ano" aria-label="Ano">${anosDisponiveis().map(a => `<option value="${a}" ${a === s.ano ? 'selected' : ''}>${a}</option>`).join('')}</select>
      <div class="segmentado" role="group" aria-label="Regime">
        <button type="button" data-dre-regime="vencimento" class="${s.regime === 'vencimento' ? 'active' : ''}" title="Pelo vencimento (mesmo critério do Group)">Vencimento</button>
        <button type="button" data-dre-regime="competencia" class="${s.regime === 'competencia' ? 'active' : ''}" title="Pela competência da nota do Central CP (o Group continua pelo vencimento)">Competência</button>
        <button type="button" data-dre-regime="caixa" class="${s.regime === 'caixa' ? 'active' : ''}" title="Pela data de pagamento (só o que já foi pago/baixado)">Caixa</button>
      </div>
      <label class="dre-exibir">Exibir
        <select id="dre-exibir">${opcoesExibir.map(o => `<option value="${o}" ${s.exibir === o ? 'selected' : ''}>${ROTULO_EXIBIR[o]}</option>`).join('')}</select>
      </label>
      <button type="button" class="btn btn-ghost btn-sm empurra" id="btn-exportar-dre">Exportar Excel</button>
    </div>
    <p class="sub dre-legenda">${temGroup
      ? `Realizado = despesas do Group (importadas em ${fmtDate(ultimaImportacao)}), pelo ${s.regime === 'caixa' ? 'pagamento' : 'vencimento'}; Central CP como conferência${s.regime === 'competencia' ? ' (por competência)' : ''}. Ponto no canto da célula = Group e Central CP não batem no mês.`
      : 'Despesas lançadas no Central CP (importe as despesas do Group em Configurações › Orçamento para usá-las como realizado).'} Valor bruto · R$ sem centavos nos meses. ${temOrcamento ? 'Régua sob cada valor: quanto do orçado do mês já foi consumido (laranja = estourou).' : 'Sem orçamento carregado pra este pagador/ano.'}</p>

    <div class="dash-tiles">
      <div class="dash-tile">
        <div class="dash-tile-label">Realizado${temGroup ? ' (Group)' : ''} · ${rotuloAte}</div>
        <div class="dash-tile-value">${fmtMoney(op.ytdRea)}</div>
        <div class="dash-tile-sub">despesas operacionais · ano todo: ${fmtMoney(op.totalRea)}</div>
      </div>
      <div class="dash-tile">
        <div class="dash-tile-label">Orçado · ${rotuloAte}</div>
        <div class="dash-tile-value">${temOrcamento ? fmtMoney(op.ytdOrc) : '—'}</div>
        ${execucao !== null ? `<div class="dre-execucao"><span class="${execucao > 1 ? 'estourou' : ''}" style="width:${Math.min(100, Math.round(execucao * 100))}%"></span></div>` : ''}
        <div class="dash-tile-sub">${execucao !== null ? `${fmtPct(execucao)} executado · desvio ${desvioYtd >= 0 ? '+' : ''}${fmtMoney(desvioYtd)}` : 'sem orçamento carregado'}</div>
      </div>
      ${temGroup ? `<div class="dash-tile">
        <div class="dash-tile-label">Conferência com o Central CP · ${rotuloAte}</div>
        <div class="dash-tile-value">${cobertura === null ? '—' : fmtPct(cobertura)}</div>
        ${cobertura !== null ? `<div class="dre-execucao"><span style="width:${Math.min(100, Math.round(cobertura * 100))}%"></span></div>` : ''}
        <div class="dash-tile-sub">do valor do Group passou pelo Central CP · fora dele: ${fmtMoney(op.ytdGrp - op.ytdReal)} (folha, impostos e lançamentos diretos)</div>
      </div>` : ''}
      <div class="dash-tile">
        <div class="dash-tile-label">Maiores estouros · ${rotuloAte}</div>
        ${estouros.length ? `<ol class="dre-estouros">${estouros.map(e => `<li><button type="button" class="dre-link" ${e.id ? `data-dre-codigo="${e.id}"` : ''} title="${escapeHtml(e.codigo)} ${escapeHtml(e.nome)}">${escapeHtml(e.nome)}</button><span class="dre-acima">+${fmtMoney(e.desvio)} (${fmtPct(e.pct)})</span></li>`).join('')}</ol>`
          : `<div class="dash-tile-sub">${temOrcamento ? 'Nenhuma conta acima do orçado. ' : 'Aparece quando houver orçamento carregado.'}</div>`}
      </div>
    </div>

    ${graficoAno(op, ateMes, temGroup)}

    <div data-tbl-fixa="dre" class="tbl-wrap tbl-fixa dre-tabela">
    <table class="data-tbl">
      <thead><tr>
        <th class="dre-conta">Conta</th>
        ${MESES.map((m, i) => `<th class="num-col dre-mes ${i + 1 > ateMes ? 'futuro' : ''}">${m}</th>`).join('')}
        <th class="num-col dre-tot dre-tot-1">Orçado ${s.ano}</th><th class="num-col dre-tot">${temGroup ? 'Group' : 'Realizado'} ${s.ano}</th>${temGroup ? `<th class="num-col dre-tot">Central CP ${s.ano}</th>` : ''}<th class="num-col dre-tot">Desvio</th>
      </tr></thead>
      <tbody>
        ${op.centros.length ? linhasDoGrupo(op, s, ateMes, temGroup) : `<tr><td colspan="${colunas}" class="texto-suave">Nenhuma despesa operacional neste ano.</td></tr>`}
        ${linhaTotal('Total de despesas operacionais', op, s, ateMes, temGroup, 'forte')}
        ${fora.map(g => `<tr class="dre-grupo"><td class="dre-conta" colspan="${colunas}">${g.label}</td></tr>${linhasDoGrupo(g, s, ateMes, temGroup)}`).join('')}
      </tbody>
      <tfoot>${linhaTotal(`Total geral${fora.length ? ' (com o que está fora do operacional)' : ''}`, dre.total, s, ateMes, temGroup)}</tfoot>
    </table>
    </div>
    ${painelDetalhe(linhas, linhasGrp, s, temGroup)}`;
}
