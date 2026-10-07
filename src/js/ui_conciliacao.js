// src/js/ui_conciliacao.js
//
// Visão geral › Conciliação (só quem podeVerDre): Group x Central CP por
// nº de movimento -- o que não bate, o que só está de um lado e as notas
// ainda sem nº do Group. Lógica em conciliacao.js.
import { app, escapeHtml, fmtMoney, fmtDate } from './state.js';
import { conciliar, filtrarConciliacao, GRUPOS_CONCILIACAO } from './conciliacao.js';

export function dadosConciliacao() {
  const f = app.state.conciliacao;
  const lista = conciliar(app.groupLancamentos, app.notas);
  return { f, lista, ...filtrarConciliacao(lista, f) };
}

function linha(it, nomePag) {
  const notas = it.notas.map(id => app.notas.find(n => n.id === id)).filter(Boolean);
  const fornecedor = it.fornecedores[0] || (notas[0] && (app.cadastros.fornecedores.find(x => x.id === notas[0].fornecedor_id) || {}).nome) || '—';
  const dif = it.diferenca;
  return `<tr>
    <td class="mono">${escapeHtml(it.movimento || '—')}</td>
    <td>${escapeHtml(nomePag(it.pagadorId))}</td>
    <td class="trunc" title="${escapeHtml(fornecedor)}${it.classes.length ? ` · ${escapeHtml(it.classes.join(', '))}` : ''}">${escapeHtml(fornecedor)}${it.classes.length ? `<div class="texto-suave">${escapeHtml(it.classes.slice(0, 2).join(', '))}${it.classes.length > 2 ? '…' : ''}</div>` : ''}</td>
    <td>${fmtDate(it.vencimento)}</td>
    <td class="num-col">${it.lancs.length ? fmtMoney(it.valorGroup) : '—'}</td>
    <td class="num-col">${it.notas.length ? fmtMoney(it.valorCp) : '—'}</td>
    <td class="num-col ${Math.abs(dif) >= 0.05 ? 'dre-acima' : 'texto-suave'}">${Math.abs(dif) >= 0.05 ? `${dif > 0 ? '+' : ''}${fmtMoney(dif)}` : '—'}</td>
    <td>${notas.map(n => `<button type="button" class="dre-link" data-open="${n.id}" title="Abrir a nota">NF ${escapeHtml(n.numero_nota || '—')}</button>`).join(' ') || '<span class="texto-suave">—</span>'}</td>
  </tr>`;
}

export function renderConciliacao() {
  if (!(app.groupLancamentos || []).length) {
    return `<div class="empty-state">Importe as despesas do Group em Configurações › Orçamento para conciliar com o Central CP.</div>`;
  }
  const { f, recorte, resumo } = dadosConciliacao();
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
      <button type="button" class="btn btn-ghost btn-sm empurra" id="btn-exportar-conciliacao">Exportar Excel</button>
    </div>
    <p class="sub dre-legenda">Casa cada lançamento do Group com as notas do Central CP pelo nº do movimento (Nº lançamento Group na nota), por pagador. Valor do Group = soma das linhas do movimento, com as retenções; do Central CP = valor bruto das notas.</p>
    <div class="segmentado conc-grupos" role="tablist" aria-label="Situação">
      ${GRUPOS_CONCILIACAO.map(g => `<button type="button" role="tab" data-conc-grupo="${g.chave}" class="${grupo === g.chave ? 'active' : ''}" aria-selected="${grupo === g.chave}">${g.label} <span class="conc-qtd">${resumo[g.chave].qtd}</span></button>`).join('')}
    </div>
    <div data-tbl-fixa="conciliacao" class="tbl-wrap tbl-fixa mt-2">
    <table class="data-tbl">
      <thead><tr><th>Movimento</th><th>Pagador</th><th>Fornecedor · classe</th><th>Vencimento</th><th class="num-col">Group</th><th class="num-col">Central CP</th><th class="num-col">Diferença</th><th>Notas no Central CP</th></tr></thead>
      <tbody>${linhas.length ? linhas.map(it => linha(it, nomePag)).join('') : '<tr><td colspan="8" class="texto-suave">Nada nesta situação.</td></tr>'}</tbody>
      <tfoot><tr><td colspan="4">${linhas.length} item(ns)</td><td class="num-col">${fmtMoney(totG)}</td><td class="num-col">${fmtMoney(totC)}</td><td class="num-col">${fmtMoney(totG - totC)}</td><td></td></tr></tfoot>
    </table>
    </div>`;
}
