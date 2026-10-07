// src/js/ui_orcamento.js
//
// Configurações › Orçamento (só quem podeVerDre -- hoje, só o
// administrador): baixar o modelo do ano (já com o que estiver gravado),
// importar a planilha preenchida, conferir a prévia e gravar. Lógica em
// orcamento.js; planilha em export_excel.js; wiring em events_orcamento.js.
import { app, escapeHtml, fmtMoney, fmtDate, saibaMais } from './state.js';
import { planoDoPagador } from './orcamento.js';
import { resumoImportacao } from './group_importacao.js';
import { linhasReceita, inadimplencia } from './receitas.js';

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
        <thead><tr><th>Pagador</th><th class="num-col">Contas</th>${MESES.map(m => `<th class="num-col">${m}</th>`).join('')}<th class="num-col">Total despesas</th><th class="num-col">Total receitas</th></tr></thead>
        <tbody>${previa.pagadores.map(p => `<tr>
          <td>${escapeHtml(p.nome)}</td><td class="num-col">${p.resultado.contas + (p.resultado.contasReceita || 0)}</td>
          ${p.resultado.totaisMes.map(v => `<td class="num-col">${v ? Math.round(v).toLocaleString('pt-BR') : '·'}</td>`).join('')}
          <td class="num-col"><b>${fmtMoney(p.resultado.total)}</b></td>
          <td class="num-col">${p.resultado.totalReceitas ? fmtMoney(p.resultado.totalReceitas) : '<span class="texto-suave">—</span>'}</td>
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
    ${app.state.orcamentoPrevia ? renderPrevia(app.state.orcamentoPrevia) : ''}
    ${renderGroup()}`;
}

// Opções de conta do Central CP pro de-para: se o centro do Group já casou,
// só as contas daquele centro; senão o plano inteiro do pagador.
function opcoesConta(pagadorId, centroId) {
  const pagador = (app.cadastros.pagadores || []).find(p => p.id === pagadorId);
  if (!pagador) return '';
  return planoDoPagador(app.cadastros, pagador)
    .filter(p => !centroId || p.centro.id === centroId)
    .map(p => `<optgroup label="${escapeHtml(`${p.centro.codigo} ${p.centro.nome}`)}">${p.classes.map(c =>
      `<option value="cl:${c.classe.id}">${escapeHtml(`${c.classe.codigo} ${c.classe.nome} (classe inteira)`)}</option>${c.codigos.map(co =>
        `<option value="co:${co.id}">${escapeHtml(`   ${co.codigo} ${co.nome}`)}</option>`).join('')}`).join('')}</optgroup>`).join('');
}

// Prévia do relatório de receitas: por pagador, faturado e recebido no ano
// corrente e o em aberto vencido.
function previaReceitas(previa) {
  const ano = String(new Date().getFullYear());
  const nomePag = (id) => { const p = (app.cadastros.pagadores || []).find(x => x.id === id); return p ? p.nome : '—'; };
  const pagadores = [...new Set(previa.receitas.map(r => r.pagador_id))];
  const soma = (ls) => ls.filter(l => l.mes.startsWith(ano)).reduce((t, l) => t + l.valor, 0);
  return `
      <div class="panel mt-4" id="painel-receitas-previa">
        <h3 class="m-0 mb-2">Prévia das receitas · ${escapeHtml(previa.arquivo)}</h3>
        <div class="tbl-wrap" data-tbl-livre="prévia curta, uma linha por pagador">
        <table class="data-tbl"><thead><tr><th>Pagador</th><th class="num-col">Lançamentos</th><th class="num-col">Faturado ${ano}</th><th class="num-col">Recebido ${ano}</th><th class="num-col">Em aberto vencido</th></tr></thead>
          <tbody>${pagadores.map(id => {
            const daqui = previa.receitas.filter(r => r.pagador_id === id);
            return `<tr><td>${escapeHtml(nomePag(id))}</td><td class="num-col">${daqui.length.toLocaleString('pt-BR')}</td>
              <td class="num-col">${fmtMoney(soma(linhasReceita(daqui, { regime: 'competencia' })))}</td>
              <td class="num-col">${fmtMoney(soma(linhasReceita(daqui, { regime: 'caixa' })))}</td>
              <td class="num-col">${fmtMoney(inadimplencia(daqui, {}).total)}</td></tr>`;
          }).join('')}</tbody>
        </table></div>
        ${previa.categoriasSemPagador.length ? `<div class="field-hint text-alert mt-2">Categorias sem pagador correspondente (ignoradas): ${escapeHtml(previa.categoriasSemPagador.join(', '))}</div>` : ''}
        <div class="modal-actions">
          <button type="button" class="btn btn-brand" id="btn-gravar-receitas">Gravar ${previa.receitas.length.toLocaleString('pt-BR')} receitas do Group</button>
          <button type="button" class="btn btn-ghost" id="btn-descartar-receitas">Descartar</button>
        </div>
        <div class="field-hint">Gravar substitui a importação anterior de receitas inteira (o relatório do Group traz sempre tudo).</div>
      </div>`;
}

// Relatórios do Group (CSV): "Pesquisa de Despesas" -- o realizado oficial
// das despesas no DRE (ver group_importacao.js) -- e "Pesquisa de Receitas
// - Por Conta" (ver receitas.js). Um campo só: o tipo sai do cabeçalho.
function renderGroup() {
  const lanc = app.groupLancamentos || [];
  const ultima = lanc.reduce((m, l) => (l.importado_em > m ? l.importado_em : m), '');
  const rec = app.groupReceitas || [];
  const ultimaRec = rec.reduce((m, l) => (l.importado_em > m ? l.importado_em : m), '');
  const previa = app.state.groupPrevia;
  const nomePag = (id) => { const p = (app.cadastros.pagadores || []).find(x => x.id === id); return p ? p.nome : '—'; };
  let corpoPrevia = '';
  if (previa) {
    const r = resumoImportacao(previa.lancamentos, app.cadastros, app.groupMapeamento);
    const pct = r.valorTotal ? r.valorCasado / r.valorTotal : 0;
    corpoPrevia = `
      <div class="panel mt-4" id="painel-group-previa">
        <h3 class="m-0 mb-2">Prévia · ${escapeHtml(previa.arquivo)}</h3>
        <div class="tbl-wrap" data-tbl-livre="prévia curta, uma linha por pagador">
        <table class="data-tbl"><thead><tr><th>Pagador</th><th class="num-col">Lançamentos</th><th class="num-col">Total</th></tr></thead>
          <tbody>${r.porPagador.map(p => `<tr><td>${escapeHtml(nomePag(p.pagadorId))}</td><td class="num-col">${p.linhas.toLocaleString('pt-BR')}</td><td class="num-col">${fmtMoney(p.total)}</td></tr>`).join('')}</tbody>
        </table></div>
        ${previa.categoriasSemPagador.length ? `<div class="field-hint text-alert mt-2">Categorias sem pagador correspondente (ignoradas): ${escapeHtml(previa.categoriasSemPagador.join(', '))}</div>` : ''}
        <p class="mt-2 mb-2"><b>${(pct * 100).toFixed(1).replace('.', ',')}%</b> do valor casou com uma conta do Central CP. ${r.semCasamento.length ? `${r.semCasamento.length} par(es) centro + classe do Group ainda sem conta -- escolha abaixo (fica gravado para as próximas importações). O que ficar sem conta aparece no DRE com o nome do Group.` : 'Tudo casado.'}</p>
        ${r.semCasamento.length ? `<div data-tbl-fixa="group-de-para" data-tbl-fixa-max="420" class="tbl-wrap tbl-fixa">
          <table class="data-tbl"><thead><tr><th>Pagador</th><th>Centro (Group)</th><th>Classe (Group)</th><th class="num-col">Valor</th><th>Conta no Central CP</th></tr></thead>
          <tbody>${r.semCasamento.map(x => `<tr>
            <td>${escapeHtml(nomePag(x.pagadorId))}</td><td>${escapeHtml(x.centro_nome)}</td><td>${escapeHtml(x.classe_base)}</td>
            <td class="num-col">${fmtMoney(x.valor)}</td>
            <td><select class="group-de-para" data-pagador="${x.pagadorId}" data-centro="${escapeHtml(x.centro_nome)}" data-classe="${escapeHtml(x.classe_base)}"><option value="">Escolher...</option>${opcoesConta(x.pagadorId, x.centroId)}</select></td>
          </tr>`).join('')}</tbody></table></div>` : ''}
        <div class="modal-actions">
          <button type="button" class="btn btn-brand" id="btn-gravar-group">Gravar ${previa.lancamentos.length.toLocaleString('pt-BR')} lançamentos do Group</button>
          <button type="button" class="btn btn-ghost" id="btn-descartar-group">Descartar</button>
        </div>
        <div class="field-hint">Gravar substitui a importação anterior inteira (o relatório do Group traz sempre tudo).</div>
      </div>`;
  }
  return `
    <h3 class="config-titulo mt-4">Relatórios do Group</h3>
    <div class="panel">
      ${saibaMais('Relatórios "Pesquisa de Despesas" e "Pesquisa de Receitas - Por Conta" do Group (CSV) -- o realizado oficial do DRE, a base da conciliação e do fluxo de caixa.',
        'Exporte no Group com tudo e importe aqui sempre que quiser atualizar; o sistema reconhece qual relatório é pelo cabeçalho. Despesas: cada linha cai na conta do Central CP pelo nome (centro + classe); o que não casar você escolhe uma vez e fica gravado. Retenções (IRRF, INSS, ISS, PIS/COFINS/CSLL) entram na mesma conta da despesa -- somadas dão o bruto. Receitas: entram no DRE por grupo (aluguéis, encargos, fundo de promoção...) e classe.')}
      <div class="field-hint mt-2">Despesas: ${lanc.length ? `importadas em ${fmtDate(ultima)} · ${lanc.length.toLocaleString('pt-BR')} lançamentos.` : 'nenhuma importação ainda.'}</div>
      <div class="field-hint">Receitas: ${rec.length ? `importadas em ${fmtDate(ultimaRec)} · ${rec.length.toLocaleString('pt-BR')} lançamentos.` : 'nenhuma importação ainda.'}</div>
      <div class="filters mt-2">
        <input type="file" id="group-arquivo" accept=".csv,text/csv">
        <button type="button" class="btn btn-brand btn-sm" id="btn-ler-group">Ler relatório</button>
      </div>
    </div>
    ${corpoPrevia}
    ${app.state.groupReceitasPrevia ? previaReceitas(app.state.groupReceitasPrevia) : ''}`;
}
