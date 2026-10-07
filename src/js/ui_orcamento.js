// src/js/ui_orcamento.js
//
// Configurações › Orçamento (só quem podeVerDre -- hoje, só o
// administrador): baixar o modelo do ano (já com o que estiver gravado),
// importar a planilha preenchida, conferir a prévia e gravar. Lógica em
// orcamento.js; planilha em export_excel.js; wiring em events_orcamento.js.
import { app, escapeHtml, fmtMoney, saibaMais } from './state.js';

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function resumoGravado(ano) {
  const doAno = (app.orcamento || []).filter(o => o.ano === ano);
  return (app.cadastros.pagadores || []).map(p => {
    const total = doAno.filter(o => o.pagador_id === p.id).reduce((s, o) => s + (Number(o.valor) || 0), 0);
    return `<tr><td>${escapeHtml(p.nome)}</td><td class="num-col">${total ? fmtMoney(total) : '<span class="texto-suave">sem orçamento</span>'}</td></tr>`;
  }).join('');
}

function renderPrevia(previa) {
  return `
    <div class="panel mt-4">
      <h3 class="m-0 mb-2">Prévia da importação · ${previa.ano}</h3>
      <div class="tbl-wrap" data-tbl-livre="prévia curta, uma linha por pagador">
      <table class="data-tbl">
        <thead><tr><th>Pagador</th><th class="num-col">Contas</th>${MESES.map(m => `<th class="num-col">${m}</th>`).join('')}<th class="num-col">Total</th></tr></thead>
        <tbody>${previa.pagadores.map(p => `<tr>
          <td>${escapeHtml(p.nome)}</td><td class="num-col">${p.resultado.contas}</td>
          ${p.resultado.totaisMes.map(v => `<td class="num-col">${v ? Math.round(v).toLocaleString('pt-BR') : '·'}</td>`).join('')}
          <td class="num-col"><b>${fmtMoney(p.resultado.total)}</b></td>
        </tr>`).join('')}</tbody>
      </table>
      </div>
      ${previa.pagadores.map(p => {
        const r = p.resultado;
        const avisos = [
          r.naoReconhecidos.length ? `${r.naoReconhecidos.length} código(s) não existem no plano de contas do ${escapeHtml(p.nome)} e foram ignorados: ${escapeHtml(r.naoReconhecidos.slice(0, 10).join(', '))}${r.naoReconhecidos.length > 10 ? '…' : ''}` : '',
          r.invalidos.length ? `${r.invalidos.length} linha(s) com valor que não é número foram ignoradas: ${escapeHtml(r.invalidos.slice(0, 10).join(', '))}` : '',
          r.classesIgnoradas.length ? `Classe(s) orçadas também por código -- valeram os códigos: ${escapeHtml(r.classesIgnoradas.join(', '))}` : '',
        ].filter(Boolean);
        return avisos.map(a => `<div class="field-hint text-alert mt-2">${a}</div>`).join('');
      }).join('')}
      ${previa.abasIgnoradas.length ? `<div class="field-hint mt-2">Abas ignoradas (não são de nenhum pagador): ${escapeHtml(previa.abasIgnoradas.join(', '))}</div>` : ''}
      <div class="field-hint mt-2">Gravar substitui o orçamento de ${previa.ano} dos pagadores acima (os demais anos e pagadores não mudam).</div>
      <div class="modal-actions">
        <button type="button" class="btn btn-brand" id="btn-gravar-orcamento" ${previa.pagadores.some(p => p.resultado.registros.length) ? '' : 'disabled'}>Gravar orçamento</button>
        <button type="button" class="btn btn-ghost" id="btn-descartar-orcamento">Descartar</button>
      </div>
    </div>`;
}

export function renderOrcamentoTab() {
  const ano = app.state.orcamentoAno || new Date().getFullYear();
  const anos = [ano - 1, ano, ano + 1].filter((v, i, a) => a.indexOf(v) === i);
  return `
    <h3 class="config-titulo">Orçamento</h3>
    <div class="panel">
      ${saibaMais('Orçado por conta e mês, por pagador -- é o que o DRE da Visão geral compara com o realizado.',
        'Baixe o modelo (uma aba por pagador, com o plano de contas dele e o que já estiver gravado), preencha os valores de Jan a Dez por código ou pela classe inteira e importe. Importar de novo substitui o orçamento daquele ano e pagador.')}
      <div class="filters mt-2">
        <label class="filtro-check">Ano
          <select id="orc-ano">${anos.map(a => `<option value="${a}" ${a === ano ? 'selected' : ''}>${a}</option>`).join('')}</select>
        </label>
        <button type="button" class="btn btn-ghost btn-sm" id="btn-modelo-orcamento">Baixar modelo ${ano}</button>
        <input type="file" id="orc-arquivo" accept=".xlsx">
        <button type="button" class="btn btn-brand btn-sm" id="btn-ler-orcamento">Ler planilha</button>
      </div>
      <div class="tbl-wrap mt-2" data-tbl-livre="resumo curto, uma linha por pagador">
        <table class="data-tbl"><thead><tr><th>Pagador</th><th class="num-col">Orçado gravado em ${ano}</th></tr></thead><tbody>${resumoGravado(ano)}</tbody></table>
      </div>
    </div>
    ${app.state.orcamentoPrevia ? renderPrevia(app.state.orcamentoPrevia) : ''}`;
}
