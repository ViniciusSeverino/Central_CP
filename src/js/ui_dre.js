// src/js/ui_dre.js
//
// Aba "Resultado (DRE)" da Visão geral -- só a exibição; o cálculo é todo
// em dre.js (DRE) e dre_painel.js (mês em foco, leitura automática). Por
// enquanto só o administrador vê (ver podeVerDre em state.js): o dono do
// produto confere os números com os controles externos antes de liberar.
//
// De cima pra baixo, do mais estratégico pro mais detalhado:
// 1. painel didático -- receita, despesa, resultado, orçado consumido e
//    inadimplência, cada um com uma frase do que significa;
// 2. leitura automática -- frases curtas sobre o mês em foco;
// 3. gráfico de colunas -- Group | Central CP | Orçado mês a mês, de
//    despesas, receitas ou resultado;
// 4. mês em foco -- o mês contra orçado, mês anterior e o mesmo mês do ano
//    passado, e as contas que mais mudaram;
// 5. tabela anual -- receitas, despesas e resultado, uma coluna por mês.
//    Em "Realizado x orçado" cada célula mostra o realizado e uma régua
//    fina com o quanto do orçado do mês ele consumiu.
import { app, escapeHtml, fmtMoney, fmtDate, fmtCompetencia, statusLabel, resolverLabelsNota } from './state.js';
import { linhasDespesa, linhasGroup, dreAnual, notasDoCodigo, lancamentosDoCodigo, pagadoresDoDre } from './dre.js';
import { comparativoMes, maioresVariacoes, leituraAutomatica, ultimoMesComDados, nomeMes } from './dre_painel.js';
import { linhasReceita, inadimplencia, mesDoMesRef, recebida } from './receitas.js';
import { criarCasador } from './group_importacao.js';
import { icon } from './icons.js';

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const fmtInt = (v) => Math.round(Number(v) || 0).toLocaleString('pt-BR');
const fmtPct = (v) => `${(v * 100).toFixed(0)}%`;
const fmtCurto = (v) => {
  const a = Math.abs(v), sinal = v < 0 ? '−' : '';
  if (a >= 1e6) return `${sinal}R$ ${(a / 1e6).toFixed(2).replace('.', ',')} mi`;
  if (a >= 1e3) return `${sinal}R$ ${Math.round(a / 1e3).toLocaleString('pt-BR')} mil`;
  return `${sinal}R$ ${Math.round(a).toLocaleString('pt-BR')}`;
};

export function estadoDre() {
  const s = app.state.dre;
  const pagadores = pagadoresDoDre(app.cadastros);
  if (!s.pagadorId || !pagadores.some(p => p.id === s.pagadorId)) s.pagadorId = pagadores[0] ? pagadores[0].id : null;
  // Só dois regimes (decisão do dono do produto): o "vencimento" de antes
  // vira competência.
  if (s.regime !== 'caixa') s.regime = 'competencia';
  if (!['despesas', 'receitas', 'resultado'].includes(s.serie)) s.serie = 'despesas';
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
  (app.groupLancamentos || []).forEach(l => { const m = mesDoMesRef(l.mes_ref); if (m) anos.add(Number(m.slice(0, 4))); });
  return Array.from(anos).filter(a => a && a >= 2000).sort();
}

// Tudo que a tela (e a exportação) precisa, calculado uma vez por render.
// Com as despesas do Group importadas, o Group é o realizado oficial e o
// Central CP a conferência (decisão do dono do produto). dreAnt = mesmo
// DRE do ano anterior (pro "mesmo mês do ano passado").
export function dadosDre() {
  const s = estadoDre();
  const ateMes = ateMesDoAno(s.ano);
  const linhas = linhasDespesa(app.notas, { pagadorId: s.pagadorId, regime: s.regime });
  const temGroup = (app.groupLancamentos || []).length > 0;
  const linhasGrp = temGroup
    ? linhasGroup(app.groupLancamentos, criarCasador(app.cadastros, app.groupMapeamento), { pagadorId: s.pagadorId, regime: s.regime })
    : null;
  const linhasRec = (app.groupReceitas || []).length ? linhasReceita(app.groupReceitas, { pagadorId: s.pagadorId, regime: s.regime }) : null;
  const opts = { pagadorId: s.pagadorId, linhasGrp, linhasRec };
  const dre = dreAnual(linhas, app.orcamento, app.cadastros, { ...opts, ano: s.ano, ateMes });
  const dreAnt = dreAnual(linhas, app.orcamento, app.cadastros, { ...opts, ano: s.ano - 1, ateMes: 12 });
  return { s, linhas, linhasGrp, linhasRec, dre, dreAnt, ateMes, temGroup: dre.fonte === 'group' };
}

const ROTULO_EXIBIR = {
  realizado_orcado: 'Realizado x orçado', group: 'Só Group', cp: 'Só Central CP', orcado: 'Só orçado',
  desvio: 'Realizado − orçado', grp_cp: 'Group − Central CP', variacao: 'Variação sobre o mês anterior',
};

// Célula de um mês. `alvo` = o que o seletor "Exibir" pede. rea = realizado
// oficial (Group quando importado, senão CP); cp = Central CP; grp = Group;
// ant = realizado do mês anterior. inverso = receita/resultado (maior é
// melhor -- o alerta é ficar abaixo do orçado).
function celula(v, alvo, futuro, detalhe, temGroup, inverso = false) {
  const { rea, orc, cp, grp, ant } = v;
  const desvio = rea - orc;
  const ruim = (d) => (inverso ? d < 0 : d > 0);
  const estourou = orc > 0 && ruim(desvio);
  const difCp = temGroup && Math.abs(grp - cp) > 1;
  const varPct = ant ? (rea - ant) / Math.abs(ant) : null;
  const titulo = [
    temGroup ? `Group ${fmtMoney(grp)} · Central CP ${fmtMoney(cp)}${difCp ? ` (diferença ${fmtMoney(grp - cp)})` : ''}` : `Realizado ${fmtMoney(rea)}`,
    `Orçado ${orc ? fmtMoney(orc) : '—'}${orc ? ` · desvio ${desvio >= 0 ? '+' : ''}${fmtMoney(desvio)} (${fmtPct(desvio / Math.abs(orc))})` : ''}`,
    varPct !== null ? `vs mês anterior ${varPct >= 0 ? '+' : ''}${fmtPct(varPct)}` : '',
  ].filter(Boolean).join(' · ');
  let numero;
  if (alvo === 'orcado') numero = orc ? fmtInt(orc) : '';
  else if (alvo === 'cp') numero = cp ? fmtInt(cp) : '';
  else if (alvo === 'group') numero = grp ? fmtInt(grp) : '';
  // Desvio só existe com orçado; mês que ainda não chegou sem nada lançado
  // não tem desvio (seria só o orçado com sinal trocado).
  else if (alvo === 'desvio') numero = orc && (rea || !futuro) ? `${desvio > 0 ? '+' : ''}${fmtInt(desvio)}` : '';
  else if (alvo === 'grp_cp') numero = difCp ? `${grp - cp > 0 ? '+' : ''}${fmtInt(grp - cp)}` : '';
  else if (alvo === 'variacao') numero = varPct !== null && rea ? `${varPct > 0 ? '+' : ''}${fmtPct(varPct)}` : '';
  else numero = rea ? fmtInt(rea) : '';
  const regua = alvo === 'realizado_orcado' && orc > 0 && !inverso
    ? `<span class="dre-regua ${estourou ? 'estourou' : ''}"><span style="width:${Math.min(100, Math.round((rea / orc) * 100))}%"></span></span>`
    : alvo === 'realizado_orcado' && orc > 0 && inverso
      ? `<span class="dre-regua dre-regua-rec ${estourou ? 'estourou' : ''}"><span style="width:${Math.max(0, Math.min(100, Math.round((rea / orc) * 100)))}%"></span></span>`
      : '';
  // Ponto discreto: Group e Central CP não batem neste mês (detalhe no title).
  const marca = difCp && alvo === 'realizado_orcado' ? '<span class="dre-dif" aria-hidden="true"></span>' : '';
  const acima = (alvo === 'desvio' && orc && ruim(desvio)) || (alvo === 'grp_cp' && difCp) || (alvo === 'variacao' && varPct !== null && rea && ruim(varPct) && Math.abs(varPct) >= 0.1);
  const classes = ['num-col', 'dre-mes', futuro ? 'futuro' : '', acima ? 'dre-acima' : '', detalhe ? 'dre-cel-clicavel' : ''].filter(Boolean).join(' ');
  return `<td class="${classes}" title="${titulo}" ${detalhe || ''}>${marca}${numero || '<span class="dre-vazio">·</span>'}${regua}</td>`;
}
const valoresMes = (n, i) => ({ rea: n.rea[i], orc: n.orc[i], cp: n.real[i], grp: n.grp[i], ant: i > 0 ? n.rea[i - 1] : null });

function colunasTotal(n, temGroup, inverso = false) {
  const desvio = n.totalRea - n.totalOrc;
  const pct = n.totalOrc ? desvio / Math.abs(n.totalOrc) : null;
  const ruim = pct !== null && (inverso ? pct < 0 : pct > 0);
  const difCp = temGroup && !n.semCp && Math.abs(n.totalGrp - n.totalReal) > 1;
  const cp = !temGroup ? '' : n.semCp
    ? '<td class="num-col dre-tot dre-tot-cp texto-suave" title="Não passa pelo Central CP">—</td>'
    : `<td class="num-col dre-tot dre-tot-cp ${difCp ? 'dre-tot-dif' : ''}" title="${difCp ? `Group − Central CP: ${fmtMoney(n.totalGrp - n.totalReal)}` : 'Bate com o Group'}">${fmtInt(n.totalReal)}</td>`;
  return `<td class="num-col dre-tot dre-tot-1">${n.totalOrc ? fmtInt(n.totalOrc) : '—'}</td>
    <td class="num-col dre-tot">${fmtInt(n.totalRea)}</td>
    ${cp}
    <td class="num-col dre-tot ${ruim ? 'dre-acima' : ''}" title="${pct === null ? 'Sem orçado' : `${desvio >= 0 ? '+' : ''}${fmtMoney(desvio)}`}">${pct === null ? '—' : `${pct > 0 ? '+' : ''}${fmtPct(pct)}`}</td>`;
}

function linhaArvore(nivel, chave, n, s, ateMes, temFilhos, aberto, temGroup) {
  const toggle = temFilhos ? `<button type="button" class="dre-toggle" data-dre-toggle="${chave}" aria-expanded="${aberto}" aria-label="${aberto ? 'Recolher' : 'Expandir'}">${icon(aberto ? 'chevronBaixo' : 'chevronDireita')}</button>` : '<span class="dre-toggle-vazio"></span>';
  const nome = `${n.codigo ? `<span class="dre-codigo">${escapeHtml(n.codigo)}</span> ` : ''}${escapeHtml(n.nome)}`;
  const idCod = n.id || '';
  const clicavel = nivel === 3 && !n.soGroup && !n.receita;
  const conteudo = clicavel
    ? `<button type="button" class="dre-link" data-dre-codigo="${idCod}" title="Ver os lançamentos deste código no ano">${nome}</button>`
    : `<span class="${n.soGroup ? 'dre-so-group' : ''}" title="${escapeHtml(n.nome)}">${nome}</span>`;
  const det = app.state.dre.detalhe;
  const ativo = nivel === 3 && det && det.codigoId === idCod;
  const tg = temGroup && !n.semCp;
  const meses = n.rea.map((r, i) => celula(valoresMes(n, i), s.exibir, i + 1 > ateMes, clicavel && (r || n.real[i]) ? `data-dre-codigo="${idCod}" data-dre-det-mes="${i + 1}"` : '', tg, !!n.receita)).join('');
  return `<tr class="dre-n${nivel} ${ativo ? 'ativo' : ''}">
    <td class="dre-conta"><div class="dre-conta-in" style="--nivel:${nivel - 1}">${toggle}${conteudo}</div></td>
    ${meses}${colunasTotal(n, temGroup, !!n.receita)}
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

function linhasReceitas(rec, s, ateMes, temGroup) {
  let html = '';
  for (const g of rec.grupos) {
    const k = `r:${g.chave}`;
    const aberto = s.abertos.has(k);
    html += linhaArvore(1, k, g, s, ateMes, g.filhos.length > 0, aberto, temGroup);
    if (aberto) for (const c of g.filhos) html += linhaArvore(2, '', c, s, ateMes, false, false, temGroup);
  }
  return html;
}

function linhaTotal(rotulo, v, s, ateMes, temGroup, classe = '', inverso = false) {
  const tg = temGroup && !v.semCp;
  return `<tr class="dre-subtotal ${classe}">
    <td class="dre-conta">${rotulo}</td>
    ${v.rea.map((_, i) => celula(valoresMes(v, i), s.exibir, i + 1 > ateMes, '', tg, inverso)).join('')}
    ${colunasTotal(v, temGroup, inverso)}
  </tr>`;
}

/* ---------- Gráfico de colunas: Group | Central CP | Orçado ---------- */
// Colunas agrupadas por mês, um eixo só (o zero no lugar quando o
// resultado fica negativo). Cores fixas por série (validadas pra
// daltonismo): Group, Central CP, Orçado -- legenda sempre visível e os
// valores exatos no hover; a tabela abaixo é a visão em números.
function seriesDoGrafico(dre, serie, temGroup) {
  const op = dre.operacional;
  if (serie === 'receitas' && dre.temReceitas) return { titulo: 'Receitas por mês', series: [{ chave: 'grp', label: 'Group', vals: dre.receitas.total.rea }, { chave: 'orc', label: 'Orçado', vals: dre.receitas.total.orc }] };
  if (serie === 'resultado' && dre.temReceitas) return { titulo: 'Resultado por mês (receitas − despesas operacionais)', series: [{ chave: 'grp', label: 'Realizado', vals: dre.resultado.rea }, { chave: 'orc', label: 'Orçado', vals: dre.resultado.orc }] };
  return {
    titulo: 'Despesas operacionais por mês',
    series: [{ chave: 'grp', label: temGroup ? 'Group' : 'Realizado', vals: op.rea }, ...(temGroup ? [{ chave: 'cp', label: 'Central CP', vals: op.real }] : []), { chave: 'orc', label: 'Orçado', vals: op.orc }],
  };
}

function grafico(dre, s, ateMes, temGroup, mesFoco) {
  const { titulo, series } = seriesDoGrafico(dre, s.serie, temGroup);
  const todos = series.flatMap(x => x.vals);
  const max = Math.max(0, ...todos), min = Math.min(0, ...todos);
  const faixa = (max - min) || 1;
  const zero = (-min / faixa) * 100;
  const barra = (v, chave) => {
    const h = (Math.abs(v) / faixa) * 100;
    const base = v >= 0 ? zero : zero - h;
    return `<span class="dre-cg-barra s-${chave} ${v < 0 ? 'neg' : ''}" style="bottom:${base}%;height:${v ? Math.max(0.6, h) : 0}%"></span>`;
  };
  const opcoes = [['despesas', 'Despesas'], ...(dre.temReceitas ? [['receitas', 'Receitas'], ['resultado', 'Resultado']] : [])];
  return `<div class="dash-card dre-grafico-card">
    <div class="dre-grafico-topo">
      <h3>${titulo}</h3>
      ${opcoes.length > 1 ? `<div class="segmentado" role="group" aria-label="O que mostrar">${opcoes.map(([k, l]) => `<button type="button" data-dre-serie="${k}" class="${s.serie === k ? 'active' : ''}">${l}</button>`).join('')}</div>` : ''}
      <div class="dre-legenda-grafico">${series.map(x => `<span class="dre-cg-sw s-${x.chave}"></span>${x.label}`).join('')}</div>
    </div>
    <div class="dre-cg" style="--zero:${zero}%">
      ${MESES.map((m, i) => `<div class="dre-cg-mes ${i + 1 > ateMes ? 'futuro' : ''} ${mesFoco === i + 1 ? 'foco' : ''}" data-dre-mes-foco="${i + 1}" title="${m}/${s.ano} · ${series.map(x => `${x.label} ${fmtMoney(x.vals[i])}`).join(' · ')}">
        <div class="dre-cg-area">${min < 0 ? '<span class="dre-cg-zero"></span>' : ''}<div class="dre-cg-barras">${series.map(x => `<div class="dre-cg-col">${barra(x.vals[i], x.chave)}</div>`).join('')}</div></div>
        <span class="dre-cg-rot">${m}</span>
      </div>`).join('')}
    </div>
  </div>`;
}

/* ---------- Painel didático ---------- */
function tile(rotulo, valor, sub, frase, tom, extra = '') {
  return `<div class="dash-tile dre-kpi ${tom ? `tom-${tom}` : ''}">
    <div class="dash-tile-label">${rotulo}</div>
    <div class="dash-tile-value">${valor}</div>
    ${extra}
    ${sub ? `<div class="dash-tile-sub">${sub}</div>` : ''}
    ${frase ? `<div class="dre-kpi-frase">${frase}</div>` : ''}
  </div>`;
}

function painelKpis(dre, s, ateMes, rotuloAte, temGroup, inad) {
  const op = dre.operacional;
  const rec = dre.temReceitas ? dre.receitas.total : null;
  const res = dre.temReceitas ? dre.resultado : null;
  const execucao = op.ytdOrc ? op.ytdRea / op.ytdOrc : null;
  const margem = rec && rec.ytdRea ? res.ytdRea / rec.ytdRea : null;
  const tiles = [];
  tiles.push(rec
    ? tile(`Receita · ${rotuloAte}`, fmtMoney(rec.ytdRea),
      rec.ytdOrc ? `${fmtPct(rec.ytdRea / rec.ytdOrc)} do orçado (${fmtMoney(rec.ytdOrc)})` : 'sem orçado de receitas',
      s.regime === 'caixa' ? 'O que de fato entrou na conta no período.' : 'O que foi cobrado dos lojistas no período (pelo mês de referência).',
      rec.ytdOrc ? (rec.ytdRea >= rec.ytdOrc ? 'bom' : 'alerta') : '')
    : tile('Receita', '—', 'importe as receitas do Group em Configurações › Orçamento', 'Com as receitas, o painel mostra o resultado e a margem.', ''));
  tiles.push(tile(`Despesa operacional · ${rotuloAte}`, fmtMoney(op.ytdRea),
    execucao !== null ? `${fmtPct(execucao)} do orçado consumido · desvio ${op.ytdRea - op.ytdOrc >= 0 ? '+' : ''}${fmtMoney(op.ytdRea - op.ytdOrc)}` : 'sem orçamento carregado',
    s.regime === 'caixa' ? 'O que saiu da conta para manter a operação.' : 'O custo da operação no período, pela competência.',
    execucao === null ? '' : execucao > 1 ? 'alerta' : 'bom',
    execucao !== null ? `<div class="dre-execucao"><span class="${execucao > 1 ? 'estourou' : ''}" style="width:${Math.min(100, Math.round(execucao * 100))}%"></span></div>` : ''));
  if (res) {
    tiles.push(tile(`Resultado · ${rotuloAte}`, fmtMoney(res.ytdRea),
      `${margem !== null ? `margem ${fmtPct(margem)}` : ''}${res.ytdOrc ? ` · orçado ${fmtMoney(res.ytdOrc)}` : ''}`,
      margem !== null ? `De cada R$ 100 de receita, ${res.ytdRea >= 0 ? 'sobraram' : 'faltaram'} R$ ${Math.abs(Math.round(margem * 100))} depois da operação.` : '',
      res.ytdRea >= 0 ? 'bom' : 'alerta'));
  }
  if (inad) {
    tiles.push(tile('Inadimplência (vencido em aberto)', fmtMoney(inad.total),
      `até 90 dias: ${fmtMoney(inad.recente)} · mais antigo: ${fmtMoney(inad.total - inad.recente)}`,
      'O recente ainda é cobrável no dia a dia; o antigo depende de acordo ou cobrança judicial.',
      inad.recente > 0 ? 'alerta' : 'bom'));
  }
  if (temGroup) {
    const cobertura = op.ytdGrp ? op.ytdReal / op.ytdGrp : null;
    tiles.push(tile(`Conferência com o Central CP · ${rotuloAte}`, cobertura === null ? '—' : fmtPct(cobertura),
      `fora do Central CP: ${fmtMoney(op.ytdGrp - op.ytdReal)}`, 'Quanto das despesas do Group passou pelo fluxo de notas (o resto é folha, impostos e lançamentos diretos).', ''));
  }
  return `<div class="dash-tiles dre-kpis">${tiles.join('')}</div>`;
}

function leitura(frases) {
  if (!frases.length) return '';
  const ic = { bom: 'aprovar', alerta: 'alerta', neutro: 'troca' };
  return `<div class="dash-card dre-leitura">
    <h3>Leitura do mês</h3>
    <ul>${frases.map(f => `<li class="tom-${f.tom}"><span class="dre-leitura-ic" aria-hidden="true">${icon(ic[f.tom])}</span><span>${escapeHtml(f.texto)}</span></li>`).join('')}</ul>
  </div>`;
}

/* ---------- Mês em foco ---------- */
function delta(rotulo, d, pct, bomSeMaior) {
  if (d === null || d === undefined) return `<div class="dre-foco-delta"><span>${rotulo}</span><span class="texto-suave">—</span></div>`;
  const bom = bomSeMaior ? d >= 0 : d <= 0;
  return `<div class="dre-foco-delta"><span>${rotulo}</span><span class="${bom ? 'dre-bom' : 'dre-acima'}">${d >= 0 ? '▲' : '▼'} ${fmtCurto(Math.abs(d))}${pct !== null ? ` (${d >= 0 ? '+' : '−'}${fmtPct(Math.abs(pct))})` : ''}</span></div>`;
}

function cartaoFoco(titulo, c, bomSeMaior, mes, ano) {
  if (!c) return '';
  return `<div class="dre-foco-card">
    <div class="dash-tile-label">${titulo}</div>
    <div class="dre-foco-valor">${fmtMoney(c.valor)}</div>
    ${delta('vs orçado', c.vsOrc, c.vsOrcPct, bomSeMaior)}
    ${delta(`vs ${mes > 1 ? MESES[mes - 2].toLowerCase() : `dez/${ano - 1}`}`, c.vsMesAnt, c.vsMesAntPct, bomSeMaior)}
    ${delta(`vs ${MESES[mes - 1].toLowerCase()}/${ano - 1}`, c.vsAnoAnt, c.vsAnoAntPct, bomSeMaior)}
  </div>`;
}

function listaVariacoes(titulo, itens) {
  return `<div class="dre-foco-lista">
    <h4>${titulo}</h4>
    ${itens.length ? `<ol>${itens.map(v => `<li><span class="trunc" title="${escapeHtml(`${v.caminho ? `${v.caminho} › ` : ''}${v.nome}`)}">${v.tipo === 'receita' ? '<span class="dre-tag-rec">receita</span> ' : v.caminho ? `<span class="texto-suave">${escapeHtml(v.caminho)} › </span>` : ''}${escapeHtml(v.nome)}</span><span class="${v.bom ? 'dre-bom' : 'dre-acima'}">${v.delta > 0 ? '+' : '−'}${fmtCurto(Math.abs(v.delta))}</span></li>`).join('')}</ol>` : '<p class="texto-suave">Nada relevante.</p>'}
  </div>`;
}

function mesEmFoco(dre, cmp, variacoes, s, mes) {
  return `<div class="dash-card dre-foco">
    <div class="dre-grafico-topo">
      <h3>Mês em foco</h3>
      <select id="dre-mes-foco" aria-label="Mês em foco">${MESES.map((m, i) => `<option value="${i + 1}" ${mes === i + 1 ? 'selected' : ''}>${nomeMes(i + 1)}/${s.ano}</option>`).join('')}</select>
      <span class="texto-suave dre-foco-dica">Clique num mês do gráfico para trocar.</span>
    </div>
    <div class="dre-foco-cards">
      ${cartaoFoco('Receita', cmp.receita, true, mes, s.ano)}
      ${cartaoFoco('Despesa operacional', cmp.despesa, false, mes, s.ano)}
      ${cartaoFoco('Resultado', cmp.resultado, true, mes, s.ano)}
    </div>
    <div class="dre-foco-listas">
      ${listaVariacoes(`O que mais mudou vs ${mes > 1 ? nomeMes(mes - 1) : 'o mês anterior'}`, variacoes.vsMesAnt)}
      ${listaVariacoes('Maiores desvios vs orçado', variacoes.vsOrc)}
    </div>
  </div>`;
}

function tabelaNotasCp(linhas, s, det) {
  const itens = notasDoCodigo(linhas, det.codigoId || null, { ano: s.ano, mes: det.mes });
  const total = itens.reduce((a, i) => a + i.valor, 0);
  const rotuloData = s.regime === 'caixa' ? 'Pago em' : 'Emissão';
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
          <td>${s.regime === 'caixa' ? fmtDate(n.data_pagamento) : (n.data_emissao ? fmtDate(n.data_emissao) : fmtCompetencia(n.competencia))}</td>
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
      <thead><tr><th>Fornecedor</th><th>Classe no Group</th><th>NF</th><th>${s.regime === 'caixa' ? 'Pago em' : 'Mês ref.'}</th><th>Movimento</th><th>Situação</th><th class="num-col">Valor</th></tr></thead>
      <tbody>${itens.map(i => {
        const l = porId.get(i.lancId) || {};
        return `<tr>
          <td class="trunc" title="${escapeHtml(l.fornecedor || '')}">${escapeHtml(l.fornecedor || '—')}</td>
          <td class="trunc" title="${escapeHtml(l.classe_nome || '')}">${escapeHtml(l.classe_nome || '—')}</td>
          <td class="mono">${escapeHtml(l.nota_fiscal || '—')}</td>
          <td>${s.regime === 'caixa' ? fmtDate(l.pagamento) : escapeHtml(l.mes_ref || '—')}</td>
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
  const { s, linhas, linhasGrp, dre, dreAnt, ateMes, temGroup } = dadosDre();
  if (!temGroup && (s.exibir === 'group' || s.exibir === 'grp_cp' || s.exibir === 'cp')) s.exibir = 'realizado_orcado';
  if (!dre.temReceitas && s.serie !== 'despesas') s.serie = 'despesas';
  // Mês em foco: o escolhido; sem escolha, o último mês com dados (calculado
  // a cada render -- os dados podem chegar depois, ex.: importação).
  if (s.mesFoco && (s.mesFoco < 1 || s.mesFoco > 12)) s.mesFoco = null;
  // No ano corrente, o mês atual ainda está pela metade -- abre no último
  // mês fechado.
  const mes = s.mesFoco || ultimoMesComDados(dre, ateMes === 0 ? 12 : ateMes === 12 ? 12 : Math.max(1, ateMes - 1));
  const pagadores = pagadoresDoDre(app.cadastros);
  const op = dre.operacional;
  const fora = dre.grupos.filter(g => g.chave !== 'operacional');
  const temOrcamento = op.totalOrc > 0 || (dre.temReceitas && dre.receitas.total.totalOrc > 0);
  const rotuloAte = ateMes === 0 ? 'ano ainda não começou' : ateMes === 12 ? `ano de ${s.ano}` : `jan a ${MESES[ateMes - 1].toLowerCase()}/${s.ano}`;
  const ultimaImportacao = temGroup ? (app.groupLancamentos || []).reduce((m, l) => (l.importado_em > m ? l.importado_em : m), '') : '';
  const opcoesExibir = ['realizado_orcado', ...(temGroup ? ['group', 'cp'] : []), 'orcado', 'desvio', 'variacao', ...(temGroup ? ['grp_cp'] : [])];
  const colunas = temGroup ? 17 : 16;

  // Painel: mês em foco, contas que mais mudaram, inadimplência e a leitura.
  const cmp = comparativoMes(dre, dreAnt, mes);
  const variacoes = maioresVariacoes(dre, mes);
  const receitasPag = (app.groupReceitas || []).filter(r => r.pagador_id === s.pagadorId);
  const inad = receitasPag.length ? inadimplencia(receitasPag, {}) : null;
  const mesIso = `${s.ano}-${String(mes).padStart(2, '0')}`;
  const faturadasMes = receitasPag.filter(r => mesDoMesRef(r.mes_ref) === mesIso);
  const fatMes = faturadasMes.reduce((t, r) => t + (Number(r.faturado) || 0), 0);
  const recebidoFaturado = fatMes > 0 ? faturadasMes.filter(recebida).reduce((t, r) => t + (Number(r.faturado) || 0), 0) / fatMes : null;
  const frases = leituraAutomatica(dre, mes, cmp, variacoes, {
    recebidoFaturado, inadRecente: inad ? inad.recente : 0,
    difCp: temGroup ? op.grp[mes - 1] - op.real[mes - 1] : 0,
  });

  return `
    <div class="dre-controles">
      <div class="segmentado" role="group" aria-label="Pagador">
        ${pagadores.map(p => `<button type="button" data-dre-pagador="${p.id}" class="${s.pagadorId === p.id ? 'active' : ''}">${escapeHtml(p.nome)}</button>`).join('')}
      </div>
      <select id="dre-ano" aria-label="Ano">${anosDisponiveis().map(a => `<option value="${a}" ${a === s.ano ? 'selected' : ''}>${a}</option>`).join('')}</select>
      <div class="segmentado" role="group" aria-label="Regime">
        <button type="button" data-dre-regime="competencia" class="${s.regime === 'competencia' ? 'active' : ''}" title="Pela emissão da nota (Central CP) e pelo mês de referência (Group)">Competência</button>
        <button type="button" data-dre-regime="caixa" class="${s.regime === 'caixa' ? 'active' : ''}" title="Pela data de pagamento/recebimento -- só o que já foi pago ou baixado">Caixa</button>
      </div>
      <label class="dre-exibir">Exibir
        <select id="dre-exibir">${opcoesExibir.map(o => `<option value="${o}" ${s.exibir === o ? 'selected' : ''}>${ROTULO_EXIBIR[o]}</option>`).join('')}</select>
      </label>
      <button type="button" class="btn btn-ghost btn-sm empurra" id="btn-exportar-dre">Exportar Excel</button>
    </div>
    <p class="sub dre-legenda">${s.regime === 'caixa' ? '<b>Caixa</b>: o que entrou e saiu da conta, pela data de recebimento/pagamento.' : '<b>Competência</b>: a que mês cada valor pertence -- emissão da nota no Central CP, mês de referência no Group.'} ${temGroup
      ? `Realizado = Group (despesas importadas em ${fmtDate(ultimaImportacao)}); Central CP como conferência -- ponto no canto da célula = Group e Central CP não batem no mês.`
      : 'Despesas lançadas no Central CP (importe os relatórios do Group em Configurações › Orçamento para usá-los como realizado).'} Valor bruto · R$ sem centavos nos meses. ${temOrcamento ? 'Régua sob cada valor: quanto do orçado do mês foi realizado (laranja = pior que o orçado).' : 'Sem orçamento carregado pra este pagador/ano.'}</p>

    ${painelKpis(dre, s, ateMes, rotuloAte, temGroup, inad)}
    <div class="dre-painel-meio">
      ${leitura(frases)}
      ${grafico(dre, s, ateMes, temGroup, mes)}
    </div>
    ${mesEmFoco(dre, cmp, variacoes, s, mes)}

    <div data-tbl-fixa="dre" class="tbl-wrap tbl-fixa dre-tabela">
    <table class="data-tbl">
      <thead><tr>
        <th class="dre-conta">Conta</th>
        ${MESES.map((m, i) => `<th class="num-col dre-mes ${i + 1 > ateMes ? 'futuro' : ''} ${mes === i + 1 ? 'foco' : ''}">${m}</th>`).join('')}
        <th class="num-col dre-tot dre-tot-1">Orçado ${s.ano}</th><th class="num-col dre-tot">${temGroup ? 'Group' : 'Realizado'} ${s.ano}</th>${temGroup ? `<th class="num-col dre-tot">Central CP ${s.ano}</th>` : ''}<th class="num-col dre-tot">Desvio</th>
      </tr></thead>
      <tbody>
        ${dre.temReceitas ? `<tr class="dre-grupo"><td class="dre-conta" colspan="${colunas}">Receitas</td></tr>
        ${linhasReceitas(dre.receitas, s, ateMes, temGroup)}
        ${linhaTotal('Total de receitas', dre.receitas.total, s, ateMes, temGroup, 'forte', true)}
        <tr class="dre-grupo"><td class="dre-conta" colspan="${colunas}">Despesas</td></tr>` : ''}
        ${op.centros.length ? linhasDoGrupo(op, s, ateMes, temGroup) : `<tr><td colspan="${colunas}" class="texto-suave">Nenhuma despesa operacional neste ano.</td></tr>`}
        ${linhaTotal('Total de despesas operacionais', op, s, ateMes, temGroup, 'forte')}
        ${dre.temReceitas ? linhaTotal('Resultado operacional (receitas − despesas)', { ...dre.resultado, semCp: true }, s, ateMes, temGroup, 'forte dre-resultado', true) : ''}
        ${fora.map(g => `<tr class="dre-grupo"><td class="dre-conta" colspan="${colunas}">${g.label}</td></tr>${linhasDoGrupo(g, s, ateMes, temGroup)}`).join('')}
      </tbody>
      <tfoot>${linhaTotal(`Total geral de despesas${fora.length ? ' (com o que está fora do operacional)' : ''}`, dre.total, s, ateMes, temGroup)}</tfoot>
    </table>
    </div>
    ${painelDetalhe(linhas, linhasGrp, s, temGroup)}`;
}
