// src/js/ui_conciliacao.js
//
// Visão geral › Conciliação (só quem podeVerDre): Group x Central CP por
// nº de movimento -- o que não bate, o que só está de um lado e as notas
// ainda sem nº do Group. Lógica em conciliacao.js.
//
// Cada linha abre (chevron ou clique na linha) um detalhe com as linhas do
// Group (descrição, NF, datas, conta corrente...) e as notas do Central CP
// uma embaixo da outra, pra identificar o lançamento sem abrir o Group.
import { app, escapeHtml, fmtMoney, fmtDate, fmtCompetencia, statusLabel, resolverLabelsNota } from './state.js';
import { conciliar, filtrarConciliacao, GRUPOS_CONCILIACAO } from './conciliacao.js';
import { icon } from './icons.js';

const nomeFornecedor = (id) => (app.cadastros.fornecedores.find(f => f.id === id) || {}).nome || '';

export function dadosConciliacao() {
  const f = app.state.conciliacao;
  const lista = conciliar(app.groupLancamentos, app.notas);
  return { f, lista, ...filtrarConciliacao(lista, f, { notas: app.notas, nomeFornecedor }) };
}

const NCOLS = 11;

function pagamentoDoItem(it, notas) {
  if (it.lancs.length) {
    if (it.pagamento) return fmtDate(it.pagamento);
    return `<span class="texto-suave">em aberto${it.situacoes.length ? ` · ${escapeHtml(it.situacoes.join(', '))}` : ''}</span>`;
  }
  const pago = notas.map(n => n.data_pagamento).filter(Boolean).sort().pop();
  return pago ? fmtDate(pago) : '<span class="texto-suave">—</span>';
}

function nfsDoItem(it, notas) {
  const g = it.nfs;
  const c = [...new Set(notas.map(n => String(n.numero_nota || '').trim().replace(/^0+(?=\d)/, '')).filter(Boolean))];
  const iguais = g.length && c.length && g.length === c.length && g.every(x => c.includes(x));
  if (iguais || !c.length) return escapeHtml(g.join(', ') || '—');
  if (!g.length) return escapeHtml(c.join(', '));
  return `${escapeHtml(g.join(', '))}<div class="texto-suave" title="NF no Central CP">CP: ${escapeHtml(c.join(', '))}</div>`;
}

function linha(it, nomePag, aberto) {
  const notas = it.notas.map(id => app.notas.find(n => n.id === id)).filter(Boolean);
  const fornecedor = it.fornecedores[0] || (notas[0] && nomeFornecedor(notas[0].fornecedor_id)) || '—';
  const desc = it.descricoes.length ? it.descricoes : notas.map(n => n.descricao).filter(Boolean);
  const sub = [desc.slice(0, 2).join(' · ') + (desc.length > 2 ? '…' : ''), it.classes.slice(0, 2).join(', ')].filter(Boolean).join(' — ');
  const dif = it.diferenca;
  return `<tr class="row-click conc-linha${aberto ? ' aberta' : ''}" data-conc-toggle="${encodeURIComponent(it.chave)}">
    <td class="conc-tg"><button type="button" class="dre-toggle" aria-expanded="${aberto}" aria-label="${aberto ? 'Recolher' : 'Ver detalhes'}">${icon(aberto ? 'chevronBaixo' : 'chevronDireita')}</button></td>
    <td class="mono">${escapeHtml(it.movimento || '—')}</td>
    <td>${escapeHtml(nomePag(it.pagadorId))}</td>
    <td class="trunc" title="${escapeHtml([fornecedor, sub].filter(Boolean).join(' — '))}">${escapeHtml(fornecedor)}${sub ? `<div class="texto-suave trunc">${escapeHtml(sub)}</div>` : ''}</td>
    <td class="mono">${nfsDoItem(it, notas)}</td>
    <td>${fmtDate(it.vencimento)}</td>
    <td>${pagamentoDoItem(it, notas)}</td>
    <td class="num-col">${it.lancs.length ? fmtMoney(it.valorGroup) : '—'}</td>
    <td class="num-col">${it.notas.length ? fmtMoney(it.valorCp) : '—'}</td>
    <td class="num-col ${Math.abs(dif) >= 0.05 ? 'dre-acima' : 'texto-suave'}">${Math.abs(dif) >= 0.05 ? `${dif > 0 ? '+' : ''}${fmtMoney(dif)}` : '—'}</td>
    <td>${notas.map(n => `<button type="button" class="dre-link" data-open="${n.id}" title="Abrir a nota">NF ${escapeHtml(n.numero_nota || '—')}</button>`).join(' ') || '<span class="texto-suave">—</span>'}</td>
  </tr>${aberto ? `<tr class="conc-detalhe-linha"><td colspan="${NCOLS}">${detalhe(it, notas)}</td></tr>` : ''}`;
}

function detalhe(it, notas) {
  const lancs = it.lancs.slice().sort((a, b) => (a.eh_retencao - b.eh_retencao) || (b.valor - a.valor));
  const grp = lancs.length ? `<table class="data-tbl conc-mini">
      <thead><tr><th>ID</th><th>Classe · descrição</th><th>NF</th><th>Criação</th><th>Vencimento</th><th>Pagamento</th><th>Situação</th><th>Conta corrente</th><th class="num-col">Valor</th><th class="num-col">Pago</th></tr></thead>
      <tbody>${lancs.map(l => `<tr>
        <td class="mono">${escapeHtml(l.id_group)}</td>
        <td>${escapeHtml(l.classe_nome || l.classe_base || '—')}${l.descricao ? `<div class="texto-suave">${escapeHtml(l.descricao)}</div>` : ''}${l.favorecido && l.favorecido !== l.fornecedor ? `<div class="texto-suave">Favorecido: ${escapeHtml(l.favorecido)}</div>` : ''}</td>
        <td class="mono">${escapeHtml(l.nota_fiscal || '—')}${l.parcela ? `<div class="texto-suave">parc. ${escapeHtml(l.parcela)}</div>` : ''}</td>
        <td>${fmtDate(l.criacao)}</td>
        <td>${fmtDate(l.vencimento)}</td>
        <td>${fmtDate(l.pagamento || l.liquidacao)}</td>
        <td>${escapeHtml(l.situacao || '—')}</td>
        <td>${escapeHtml(l.referencia || '—')}${l.documento ? `<div class="texto-suave">doc. ${escapeHtml(l.documento)}</div>` : ''}</td>
        <td class="num-col">${fmtMoney(l.valor)}</td>
        <td class="num-col">${l.valor_pago ? fmtMoney(l.valor_pago) : '—'}</td>
      </tr>`).join('')}</tbody>
    </table>` : '<p class="texto-suave">Nenhum lançamento no Group com este movimento.</p>';
  const cp = notas.length ? `<table class="data-tbl conc-mini">
      <thead><tr><th>NF</th><th>Fornecedor · descrição</th><th>Emissão</th><th>Competência</th><th>Vencimento</th><th>Pagamento</th><th>Status</th><th>Conta</th><th class="num-col">Bruto</th><th></th></tr></thead>
      <tbody>${notas.map(n => {
        const lbl = resolverLabelsNota(n);
        const conta = n.tem_rateio ? 'rateio' : [lbl.centro_custo_label, lbl.codigo_classificacao_label || lbl.classe_conta_label].filter(x => x && x !== '—').join(' › ');
        return `<tr>
          <td class="mono">${escapeHtml(n.numero_nota || '—')}</td>
          <td>${escapeHtml(lbl.fornecedor_label)}${n.descricao ? `<div class="texto-suave">${escapeHtml(n.descricao)}</div>` : ''}</td>
          <td>${fmtDate(n.data_emissao)}</td>
          <td>${fmtCompetencia(n.competencia)}</td>
          <td>${fmtDate(n.vencimento)}</td>
          <td>${fmtDate(n.data_pagamento)}</td>
          <td><span class="status-chip st-${n.status}">${statusLabel(n.status)}</span></td>
          <td>${escapeHtml(conta || '—')}</td>
          <td class="num-col">${fmtMoney(n.valor_bruto)}</td>
          <td><button type="button" class="btn btn-ghost btn-sm" data-open="${n.id}">Abrir nota</button></td>
        </tr>`;
      }).join('')}</tbody>
    </table>` : '<p class="texto-suave">Nenhuma nota do Central CP com este movimento.</p>';
  return `<div class="conc-detalhe">
    <section><h4>Group <span class="texto-suave">· ${lancs.length} linha(s) · ${fmtMoney(it.valorGroup)}</span></h4>${grp}</section>
    <section><h4>Central CP <span class="texto-suave">· ${notas.length} nota(s) · ${fmtMoney(it.valorCp)}</span></h4>${cp}</section>
  </div>`;
}

export function renderConciliacao() {
  if (!(app.groupLancamentos || []).length) {
    return `<div class="empty-state">Importe as despesas do Group em Configurações › Orçamento para conciliar com o Central CP.</div>`;
  }
  const { f, recorte, resumo } = dadosConciliacao();
  const abertos = f.abertos || new Set();
  const pagadores = app.cadastros.pagadores || [];
  const nomePag = (id) => { const p = pagadores.find(x => x.id === id); return p ? p.nome : '—'; };
  const grupo = GRUPOS_CONCILIACAO.some(g => g.chave === f.grupo) ? f.grupo : 'diferente';
  const linhas = recorte.filter(it => it.grupo === grupo).sort((a, b) => Math.abs(b.diferenca) - Math.abs(a.diferenca) || String(a.vencimento).localeCompare(String(b.vencimento)));
  const totG = linhas.reduce((s, it) => s + it.valorGroup, 0);
  const totC = linhas.reduce((s, it) => s + it.valorCp, 0);
  return `
    <div class="dre-controles">
      <select id="conc-pagador" aria-label="Pagador"><option value="">Todos os pagadores</option>${pagadores.map(p => `<option value="${p.id}" ${f.pagadorId === p.id ? 'selected' : ''}>${escapeHtml(p.nome)}</option>`).join('')}</select>
      <input type="month" id="conc-mes" value="${f.mes}" aria-label="Mês de vencimento" title="Mês de vencimento (vazio = todos)">
      ${f.mes ? '<button type="button" class="btn btn-ghost btn-sm" id="conc-limpar-mes">Todos os meses</button>' : ''}
      <input type="search" id="conc-busca" class="fila-busca conc-busca" placeholder="Buscar movimento, NF, fornecedor, descrição..." value="${escapeHtml(f.busca || '')}" aria-label="Buscar">
      <button type="button" class="btn btn-ghost btn-sm empurra" id="btn-exportar-conciliacao">Exportar Excel</button>
    </div>
    <p class="sub dre-legenda">Casa cada lançamento do Group com as notas do Central CP pelo nº do movimento (Nº lançamento Group na nota), por pagador. Valor do Group = soma das linhas do movimento, com as retenções; do Central CP = valor bruto das notas. Clique numa linha para ver as linhas do Group e as notas do Central CP.</p>
    <div class="segmentado conc-grupos" role="tablist" aria-label="Situação">
      ${GRUPOS_CONCILIACAO.map(g => `<button type="button" role="tab" data-conc-grupo="${g.chave}" class="${grupo === g.chave ? 'active' : ''}" aria-selected="${grupo === g.chave}">${g.label} <span class="conc-qtd">${resumo[g.chave].qtd}</span></button>`).join('')}
    </div>
    <div data-tbl-fixa="conciliacao" class="tbl-wrap tbl-fixa mt-2">
    <table class="data-tbl conc-tabela">
      <thead><tr><th class="conc-tg"></th><th>Movimento</th><th>Pagador</th><th>Fornecedor · descrição</th><th>NF</th><th>Vencimento</th><th>Pagamento</th><th class="num-col">Group</th><th class="num-col">Central CP</th><th class="num-col">Diferença</th><th>Notas no Central CP</th></tr></thead>
      <tbody>${linhas.length ? linhas.map(it => linha(it, nomePag, abertos.has(it.chave))).join('') : `<tr><td colspan="${NCOLS}" class="texto-suave">Nada nesta situação${f.busca ? ' para a busca' : ''}.</td></tr>`}</tbody>
      <tfoot><tr><td colspan="7">${linhas.length} item(ns)</td><td class="num-col">${fmtMoney(totG)}</td><td class="num-col">${fmtMoney(totC)}</td><td class="num-col">${fmtMoney(totG - totC)}</td><td></td></tr></tfoot>
    </table>
    </div>`;
}
