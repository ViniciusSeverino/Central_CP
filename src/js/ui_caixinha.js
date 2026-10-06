// src/js/ui_caixinha.js
//
// Aba "Caixinha" (fundo fixo): saldo de cada entidade (sem teto/limite
// configurado -- só o que já foi adicionado, ver caixinha.js), registrar
// saída/adição de saldo, aprovar/rejeitar pendências. O cálculo de saldo é lógica
// pura (ver caixinha.js) -- aqui só a exibição; wiring em events_caixinha.js.
//
// Cada caixinha pertence a um setor -- departamento só vê/movimenta a do
// PRÓPRIO setor (RLS já filtra app.cadastros.caixinhas na origem, não tem
// filtro client-side aqui); contas_a_pagar/gerente_financeiro/
// administrador continuam vendo todas (ver 0027_caixinha_por_setor.sql).
import {
  app, escapeHtml, fmtMoney, fmtDate, nomeUsuario, ehSuperUsuario, ehAdministrador, SETORES,
  CAIXINHA_TIPO_LABEL, CAIXINHA_STATUS_LABEL, CAIXINHA_STATUS_TOM, temPermissaoExtra,
} from './state.js';
import { icon } from './icons.js';
import { saldoCaixinha, extratoCaixinha, saidasAprovadasSemComprovante } from './caixinha.js';

function cardCaixinha(c) {
  const saldo = saldoCaixinha(c, app.caixinhaMovimentacoes);
  const pendentes = (app.caixinhaMovimentacoes || []).filter(m => m.caixinha_id === c.id && m.status === 'pendente_aprovacao').length;
  // Sem teto (removido -- ver caixinha.js): não tem contra o que medir uma
  // barra de % nem um limiar de "saldo baixo" -- só o saldo, em destaque.
  // Uma ação principal (Registrar saída, o uso do dia a dia); o resto em
  // "Mais ações" com os MESMOS data-* de antes (events_caixinha.js).
  return `
    <div class="dash-card cx-card">
      <div class="cx-card-topo">
        <div class="cx-card-nome">
          <h3 class="trunc" title="${escapeHtml(c.nome)}">${escapeHtml(c.nome)}</h3>
          <div class="dash-tile-sub">setor ${escapeHtml(c.setor)}</div>
        </div>
        ${pendentes ? `<span class="pend-badge amber" title="Movimentações aguardando aprovação">${pendentes} aguardando</span>` : ''}
      </div>
      <div class="dash-tile-value">${fmtMoney(saldo)}</div>
      <div class="cx-card-acoes">
        <button class="btn btn-brand btn-sm" type="button" data-registrar-caixinha="${c.id}" data-tipo="saida">Registrar saída</button>
        <details class="menu-acoes">
          <summary class="btn btn-ghost btn-sm">Mais ações ${icon('chevronBaixo')}</summary>
          <div class="menu-acoes-lista">
            <button class="menu-item" type="button" data-registrar-caixinha="${c.id}" data-tipo="reforco">Adicionar saldo</button>
            <button class="menu-item" type="button" data-extrato-caixinha="${c.id}">Ver extrato</button>
            ${/* Editar (nome/setor) é restrito a quem tem autoridade de
                 aprovação (administrador/gerente_financeiro), diferente do
                 resto dos cadastros (ver 0026_caixinha_teto_so_super_usuario.sql). */
              ehSuperUsuario() ? `<button class="menu-item" type="button" data-editar-caixinha="${c.id}">Editar caixinha</button>` : ''}
          </div>
        </details>
      </div>
    </div>`;
}

function acoesMovimentacao(m) {
  const podeAprovar = m.status === 'pendente_aprovacao' && (ehSuperUsuario() || temPermissaoExtra('aprovar_caixinha'));
  const podeExcluir = (m.status === 'pendente_aprovacao' && m.criado_por === app.usuario.id) || ehAdministrador();
  return `<td class="nowrap col-acoes">
    ${podeAprovar ? `<button class="btn btn-brand btn-sm" type="button" data-aprovar-caixinha="${m.id}">Aprovar</button> <button class="btn btn-ghost btn-sm" type="button" data-rejeitar-caixinha="${m.id}">Rejeitar</button>` : ''}
    ${podeExcluir ? `<button class="btn btn-ghost btn-sm" type="button" data-excluir-caixinha="${m.id}" title="Excluir movimentação">Excluir</button>` : ''}
  </td>`;
}

const celulaValor = (m) => `<td class="num-col ${m.tipo === 'saida' ? 'cx-saida' : 'cx-entrada'}">${m.tipo === 'saida' ? '−' : '+'} ${fmtMoney(m.valor)}</td>`;
const celulaComprovante = (m) => `<td>${m.comprovante ? `<a href="#" data-baixar-comprovante-caixinha="${m.id}">Ver</a>` : '<span class="texto-suave">—</span>'}</td>`;
const celulaCaixinha = (c) => `<td class="trunc" title="${escapeHtml(c ? c.nome : '')}">${escapeHtml(c ? c.nome : '—')}</td>`;

// Histórico = tudo que já foi decidido (aprovado/rejeitado), com o recorte
// de período (pela data da movimentação) e o de "saídas aprovadas sem
// comprovante" (relatório de compliance, ver saidasAprovadasSemComprovante
// em caixinha.js). Exportado: o botão "Exportar Excel" exporta exatamente
// o que está na tela.
export function movimentacoesHistorico() {
  const todas = app.caixinhaMovimentacoes || [];
  const { dataDe, dataAte } = app.state.caixinhaHistoricoFiltro;
  const base = app.state.caixinhaFiltroSemComprovante ? saidasAprovadasSemComprovante(todas) : todas.filter(m => m.status !== 'pendente_aprovacao');
  return base.filter(m => (!dataDe || m.data >= dataDe) && (!dataAte || m.data <= dataAte));
}

export function renderCaixinha() {
  const caixinhas = app.cadastros.caixinhas || [];
  const caixinhaDe = (m) => caixinhas.find(c => c.id === m.caixinha_id);
  const pendentes = (app.caixinhaMovimentacoes || []).filter(m => m.status === 'pendente_aprovacao');
  const historico = movimentacoesHistorico();
  const semComprovante = app.state.caixinhaFiltroSemComprovante;
  const f = app.state.caixinhaHistoricoFiltro;
  const aprovadas = historico.filter(m => m.status === 'aprovado');
  const totalSaidas = aprovadas.filter(m => m.tipo === 'saida').reduce((s, m) => s + Number(m.valor || 0), 0);
  const totalEntradas = aprovadas.filter(m => m.tipo !== 'saida').reduce((s, m) => s + Number(m.valor || 0), 0);
  const filtrado = semComprovante || f.dataDe || f.dataAte;
  return `
    <div class="topbar">
      <div><h2>Caixinha</h2><p class="sub">Fundo fixo por setor · toda saída ou adição de saldo passa por aprovação.</p></div>
      ${ehSuperUsuario() ? `<button class="btn btn-ghost btn-sm" type="button" id="btn-nova-caixinha">+ Nova caixinha</button>` : ''}
    </div>
    <div class="dash-tiles cx-cards">
      ${caixinhas.length ? caixinhas.map(cardCaixinha).join('') : '<div class="empty-state">Nenhuma caixinha cadastrada ainda.</div>'}
    </div>

    ${pendentes.length ? `
    <div class="dash-card">
      <h3 class="cx-secao-titulo">Aguardando aprovação <span class="pend-badge amber">${pendentes.length}</span></h3>
      <div data-tbl-fixa="caixinha-pendentes" data-tbl-fixa-max="320" class="tbl-wrap tbl-fixa">
      <table class="data-tbl">
        <thead><tr><th>Caixinha</th><th>Tipo</th><th class="num-col">Valor</th><th>Data</th><th>Motivo</th><th>Comprovante</th><th>Registrado por</th><th></th></tr></thead>
        <tbody>${pendentes.map(m => `<tr>
          ${celulaCaixinha(caixinhaDe(m))}
          <td>${CAIXINHA_TIPO_LABEL[m.tipo]}</td>
          ${celulaValor(m)}
          <td>${fmtDate(m.data)}</td>
          <td class="trunc" title="${escapeHtml(m.motivo)}">${escapeHtml(m.motivo)}</td>
          ${celulaComprovante(m)}
          <td>${escapeHtml(nomeUsuario(m.criado_por))}</td>
          ${acoesMovimentacao(m)}
        </tr>`).join('')}</tbody>
      </table>
      </div>
    </div>` : ''}

    <div class="dash-card">
      <h3 class="cx-secao-titulo">Histórico</h3>
      <div class="filters">
        <input id="cx-hist-de" type="date" value="${f.dataDe}" title="De" aria-label="Data de">
        <input id="cx-hist-ate" type="date" value="${f.dataAte}" title="Até" aria-label="Data até">
        <label class="filtro-check">
          <input type="checkbox" id="cx-filtro-sem-comprovante" ${semComprovante ? 'checked' : ''}>
          Só saídas aprovadas sem comprovante
        </label>
        ${filtrado ? `<button type="button" class="btn btn-ghost btn-sm" id="btn-limpar-filtro-cx">Limpar filtros</button>` : ''}
        <button class="btn btn-ghost btn-sm empurra" type="button" id="btn-exportar-sem-comprovante-caixinha" ${historico.length === 0 || !semComprovante ? 'disabled' : ''} title="${semComprovante ? 'Exporta as saídas listadas' : 'Marque “Só saídas aprovadas sem comprovante” para exportar o relatório'}">Exportar Excel</button>
      </div>
      ${historico.length === 0 ? `<div class="empty-hint">${semComprovante ? 'Nenhuma saída aprovada sem comprovante -- tudo certo.' : filtrado ? 'Nenhuma movimentação nesse período.' : 'Nenhuma movimentação registrada ainda.'}</div>` : `
      <div data-tbl-fixa="caixinha-movimentacoes" class="tbl-wrap tbl-fixa">
      <table class="data-tbl">
        <thead><tr><th>Caixinha</th><th>Tipo</th><th class="num-col">Valor</th><th>Data</th><th>Motivo</th><th>Comprovante</th><th>Status</th><th>Registrado por</th><th></th></tr></thead>
        <tbody>${historico.map(m => `<tr>
          ${celulaCaixinha(caixinhaDe(m))}
          <td>${CAIXINHA_TIPO_LABEL[m.tipo]}</td>
          ${celulaValor(m)}
          <td>${fmtDate(m.data)}</td>
          <td class="trunc" title="${escapeHtml(m.motivo)}">${escapeHtml(m.motivo)}</td>
          ${celulaComprovante(m)}
          <td><span class="status-chip ${CAIXINHA_STATUS_TOM[m.status]}" ${m.status === 'rejeitado' && m.motivo_rejeicao ? `title="${escapeHtml(m.motivo_rejeicao)}"` : ''}>${CAIXINHA_STATUS_LABEL[m.status]}</span></td>
          <td>${escapeHtml(nomeUsuario(m.criado_por))}</td>
          ${acoesMovimentacao(m)}
        </tr>`).join('')}</tbody>
        <tfoot><tr>
          <td colspan="2">${historico.length} movimentaç${historico.length === 1 ? 'ão' : 'ões'}</td>
          <td class="num-col" colspan="2">${semComprovante ? fmtMoney(totalSaidas) : `− ${fmtMoney(totalSaidas)} · + ${fmtMoney(totalEntradas)}`}</td>
          <td colspan="5" class="texto-suave">${semComprovante ? 'em saídas sem comprovante' : 'saídas e entradas aprovadas no período'}</td>
        </tr></tfoot>
      </table>
      </div>`}
    </div>`;
}

// Extrato (relatório): movimentações aprovadas de UMA caixinha, em ordem
// cronológica, com saldo acumulado após cada uma -- pedido do dono do
// produto ("um tipo de relatório interessante pra caixinha"). Filtro de
// período opcional (ver app.state.caixinhaExtratoFiltro); o saldo mostrado
// já reflete o histórico inteiro antes do filtro (ver extratoCaixinha em
// caixinha.js), só a listagem é que fica mais curta.
export function renderExtratoCaixinha(caixinhaId) {
  const c = app.cadastros.caixinhas.find(x => x.id === caixinhaId);
  const f = app.state.caixinhaExtratoFiltro;
  const linhas = extratoCaixinha(c, app.caixinhaMovimentacoes || [], f);
  return `
    <div class="filters">
      <input id="cxe-data-de" type="date" value="${f.dataDe}" title="De">
      <input id="cxe-data-ate" type="date" value="${f.dataAte}" title="Até">
      <button type="button" class="btn btn-ghost btn-sm" id="btn-limpar-filtro-extrato">Ver histórico inteiro</button>
      <button type="button" class="btn btn-brand btn-sm" id="btn-exportar-extrato-caixinha" ${linhas.length === 0 ? 'disabled' : ''}>Exportar Excel</button>
    </div>
    ${linhas.length === 0 ? '<div class="empty-state">Nenhuma movimentação aprovada nesse período.</div>' : `
    <div data-tbl-fixa="caixinha-extrato" class="tbl-wrap tbl-fixa">
    <table class="data-tbl">
      <thead><tr><th>Data</th><th>Tipo</th><th>Motivo</th><th class="num-col">Valor</th><th class="num-col">Saldo após</th><th>Comprovante</th><th>Registrado por</th></tr></thead>
      <tbody>${linhas.map(l => `
        <tr>
          <td>${fmtDate(l.data)}</td>
          <td>${CAIXINHA_TIPO_LABEL[l.tipo]}</td>
          <td>${escapeHtml(l.motivo)}</td>
          ${celulaValor(l)}
          <td class="num-col">${fmtMoney(l.saldo_apos)}</td>
          <td>${l.comprovante ? `<a href="#" data-baixar-comprovante-caixinha="${l.id}">Ver</a>` : '—'}</td>
          <td>${escapeHtml(nomeUsuario(l.criado_por))}</td>
        </tr>`).join('')}</tbody>
    </table>
    </div>`}
  `;
}

export function formRegistrarMovimentacaoCaixinha(caixinha, tipo) {
  const hoje = new Date().toISOString().slice(0, 10);
  return `
    <div class="field"><label>Valor (R$)</label><input id="cx-valor" type="number" step="0.01" min="0.01" required></div>
    <div class="field"><label>Data</label><input id="cx-data" type="date" value="${hoje}" required></div>
    <div class="field"><label>Motivo</label><textarea id="cx-motivo" rows="2" required placeholder="${tipo === 'saida' ? 'Ex: compra emergencial de material de limpeza' : 'Ex: reposição via retirada do banco'}"></textarea></div>
    <div class="field"><label>Comprovante (opcional)</label><input id="cx-comprovante" type="file" accept="application/pdf,image/jpeg,image/png,image/webp"></div>
    <div class="modal-actions">
      <button class="btn btn-brand" id="confirmar-registrar-caixinha">${tipo === 'saida' ? 'Registrar saída' : 'Adicionar saldo'}</button>
      <button class="btn btn-ghost" id="modal-cancel">Cancelar</button>
    </div>`;
}

export function formCaixinhaCadastro(editing) {
  const c = editing || {};
  return `
    <div class="field"><label>Nome</label><input id="cx-nome" value="${escapeHtml(c.nome || '')}"></div>
    <div class="field">
      <label>Setor</label>
      <select id="cx-setor">
        ${SETORES.map(s => `<option value="${s}" ${c.setor === s ? 'selected' : ''}>${s}</option>`).join('')}
      </select>
      <div class="field-hint">Departamento desse setor só vê e movimenta essa caixinha -- contas a pagar/gerente financeiro/administrador continuam vendo todas.</div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-brand" id="confirmar-caixinha-cadastro">${editing ? 'Salvar' : 'Cadastrar caixinha'}</button>
      <button class="btn btn-ghost" id="modal-cancel">Cancelar</button>
    </div>`;
}

export function formRejeitarCaixinha() {
  return `
    <div class="field"><label>Motivo</label><textarea id="cx-motivo-rejeicao" rows="3" required placeholder="Ex: faltou o comprovante, valor não confere..."></textarea></div>
    <div class="modal-actions">
      <button class="btn btn-alert" id="confirmar-rejeitar-caixinha">Rejeitar</button>
      <button class="btn btn-ghost" id="modal-cancel">Cancelar</button>
    </div>`;
}
