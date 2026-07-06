// src/js/ui_lote_nota.js
//
// Lançamento em lote: uma tabela onde o departamento preenche várias notas
// de uma vez (ex: o pacote semanal de contas comuns) em vez de abrir o
// formulário uma por uma — mas o resultado ao salvar é sempre uma nota
// individual por linha, exatamente como se tivessem sido lançadas no
// formulário de sempre uma de cada vez (mesma validação, mesma alçada,
// mesmo histórico). A tabela cobre os campos que se preenche toda hora
// (fornecedor, valor, datas, pagador, classificação); os campos menos
// comuns ou que são listas por natureza (rateio, imposto, anexos, tipo de
// despesa/contratação, conta bancária) ficam no popup "Detalhes" de cada
// linha — mesmos componentes já usados no formulário individual (ver
// renderRateioArea/renderImpostoArea/renderContaBancariaArea/renderAnexosArea
// em ui_nota.js), só reaproveitados aqui.
import {
  app, escapeHtml, fmtMoney, labelOf, selectOptions,
  centrosParaPagador, classesParaCentro, SETORES,
} from './state.js';
import { TIPO_DESPESA_LABEL } from './prazo_despesa.js';
import { calcularVencimentoComum } from './vencimento_comum.js';
import { renderRateioArea, renderImpostoArea, renderContaBancariaArea, renderAnexosArea } from './ui_nota.js';

// Linha em branco -- nasce com o vencimento comum sugerido (mesma regra de
// "padrão trava na quarta" do formulário individual, só que aqui é só um
// valor inicial editável, não travado por linha: cada linha pode ser um
// tipo de despesa diferente, e isso vive no popup de Detalhes).
export function novaLinhaLoteVazia() {
  return {
    numero_nota: '', fornecedor_id: '', data_emissao: '', vencimento: calcularVencimentoComum(),
    competencia: '', valor_bruto: '', pagador_id: '', forma_pagamento: '', classificacao: '',
    centro_custo_id: '', classe_conta_id: '', setor: app.usuario.setor || '',
    // Campos que só existem no popup de Detalhes:
    tipo_despesa_prazo: 'padrao', tipo_contratacao: '', codigo_classificacao_id: '', conta_bancaria_id: '',
    tem_rateio: false, rateios: [], tem_retencao_imposto: false, impostos: [],
    descricao: '', anexosNovos: [], anexosAnalises: [],
    erro: null,
  };
}

function detalhesResumo(row) {
  const partes = [];
  if (row.tem_rateio) partes.push(`Rateio (${row.rateios.length})`);
  if (row.tem_retencao_imposto) partes.push(`Imposto (${row.impostos.length})`);
  if (row.anexosNovos.length > 0) partes.push(`${row.anexosNovos.length} anexo(s)`);
  if (row.tipo_despesa_prazo && row.tipo_despesa_prazo !== 'padrao') partes.push('Prazo especial');
  return partes.length > 0 ? partes.join(' · ') : 'Detalhes';
}

function celulaCentroClasse(row, i) {
  if (row.tem_rateio) {
    return `<td colspan="2"><span class="lote-badge">Rateado entre centros de custo</span></td>`;
  }
  const centros = row.pagador_id ? centrosParaPagador(row.pagador_id) : [];
  const classes = row.centro_custo_id ? classesParaCentro(row.centro_custo_id) : [];
  return `
    <td><select id="lote-centro-custo-${i}" ${!row.pagador_id ? 'disabled' : ''}>${row.pagador_id ? selectOptions(centros, row.centro_custo_id) : `<option value="">Pagador primeiro</option>`}</select></td>
    <td><select id="lote-classe-conta-${i}" ${!row.centro_custo_id ? 'disabled' : ''}>${row.centro_custo_id ? selectOptions(classes, row.classe_conta_id) : `<option value="">Centro primeiro</option>`}</select></td>
  `;
}

function linhaLoteHtml(row, i) {
  const forn = row.fornecedor_id ? app.cadastros.fornecedores.find(f => f.id === row.fornecedor_id) : null;
  return `
  <tr class="${row.erro ? 'lote-erro' : ''}" data-lote-row="${i}">
    <td><input id="lote-numero-${i}" value="${escapeHtml(row.numero_nota || '')}" placeholder="NF"></td>
    <td>
      <div class="combo">
        <input class="combo-input" id="lote-forn-busca-${i}" autocomplete="off" placeholder="Buscar..." value="${forn ? escapeHtml(labelOf(forn)) : ''}">
        <input type="hidden" id="lote-forn-${i}" value="${row.fornecedor_id || ''}">
        <div class="combo-list" id="lote-forn-list-${i}" style="display:none;"></div>
      </div>
    </td>
    <td><input type="date" id="lote-emissao-${i}" value="${row.data_emissao || ''}"></td>
    <td><input type="date" id="lote-vencimento-${i}" value="${row.vencimento || ''}"></td>
    <td><input type="month" id="lote-competencia-${i}" value="${row.competencia || ''}"></td>
    <td><input type="number" step="0.01" min="0" id="lote-valor-${i}" value="${row.valor_bruto || ''}" style="min-width:100px;"></td>
    <td><select id="lote-pagador-${i}">${selectOptions(app.cadastros.pagadores, row.pagador_id)}</select></td>
    <td>
      <select id="lote-forma-pagamento-${i}">
        <option value="">Selecione...</option>
        <option value="Boleto bancário" ${row.forma_pagamento === 'Boleto bancário' ? 'selected' : ''}>Boleto</option>
        <option value="TED" ${row.forma_pagamento === 'TED' ? 'selected' : ''}>TED</option>
        <option value="Pix" ${row.forma_pagamento === 'Pix' ? 'selected' : ''}>Pix</option>
      </select>
    </td>
    <td>
      <select id="lote-classificacao-${i}">
        <option value="">Selecione...</option>
        <option value="Compras" ${row.classificacao === 'Compras' ? 'selected' : ''}>Compras</option>
        <option value="Serviço" ${row.classificacao === 'Serviço' ? 'selected' : ''}>Serviço</option>
        <option value="Outros" ${row.classificacao === 'Outros' ? 'selected' : ''}>Outros</option>
      </select>
    </td>
    ${celulaCentroClasse(row, i)}
    ${!app.usuario.setor ? `
    <td><select id="lote-setor-${i}">
      <option value="">Selecione...</option>
      ${SETORES.map(s => `<option value="${s}" ${row.setor === s ? 'selected' : ''}>${s}</option>`).join('')}
    </select></td>` : ''}
    <td><button type="button" class="btn btn-ghost btn-sm" data-lote-detalhes="${i}">${detalhesResumo(row)}</button></td>
    <td><button type="button" class="btn btn-ghost btn-sm" data-lote-remover="${i}">Remover</button></td>
  </tr>
  ${row.erro ? `<tr><td colspan="14"><div class="lote-linha-erro">${escapeHtml(row.erro)}</div></td></tr>` : ''}
  `;
}

export function renderLoteNotaForm() {
  const rows = app.loteRows;
  return `
  <div id="box-lote-nota">
    <div class="field-hint" style="margin-bottom:14px;">
      Preencha os dados de cada nota nas linhas abaixo. Rateio, imposto retido, anexos e outros campos menos comuns
      ficam no botão "Detalhes" de cada linha. Ao salvar, cada linha vira uma nota individual — não existe nota "em grupo".
    </div>
    <div class="tbl-wrap">
      <table class="data-tbl lote-tbl">
        <thead>
          <tr>
            <th>Nº NF</th><th>Fornecedor</th><th>Emissão</th><th>Vencimento</th><th>Competência</th>
            <th>Valor bruto</th><th>Pagador</th><th>Forma pgto</th><th>Classificação</th>
            <th>Centro de custo</th><th>Classe da conta</th>
            ${!app.usuario.setor ? '<th>Setor</th>' : ''}
            <th>Detalhes</th><th></th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((r, i) => linhaLoteHtml(r, i)).join('')}
        </tbody>
      </table>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost btn-sm" type="button" id="btn-lote-adicionar-linha">+ Adicionar linha</button>
    </div>
    <div class="modal-actions">
      <button class="btn btn-brand" type="button" id="btn-lote-salvar">Lançar ${rows.length} nota(s)</button>
      <button class="btn btn-ghost" type="button" id="modal-cancel">Cancelar</button>
    </div>
  </div>`;
}

// Popup de detalhes de uma linha -- reaproveita renderRateioArea()/
// renderImpostoArea() sem modificação nenhuma: elas leem #nf-valor e
// #nf-pagador por id fixo (mesmo id do formulário individual), então
// bastam dois campos escondidos espelhando o valor/pagador da linha
// sendo editada pra elas funcionarem sem saber que estão dentro do lote.
export function renderLoteLinhaDetalhes() {
  const i = app.loteEditingIndex;
  const row = app.loteRows[i];
  if (!row) return '';
  return `
  <div id="box-lote-detalhes">
    <input type="hidden" id="nf-valor" value="${row.valor_bruto || ''}">
    <input type="hidden" id="nf-pagador" value="${row.pagador_id || ''}">
    <div class="field-hint" style="margin-bottom:14px;">Nota ${escapeHtml(row.numero_nota || '(sem número ainda)')} — valor bruto ${fmtMoney(parseFloat(row.valor_bruto) || 0)}</div>

    <div class="field">
      <label>Tipo de despesa</label>
      <select id="lote-detalhe-tipo-despesa">
        ${Object.entries(TIPO_DESPESA_LABEL).map(([valor, label]) => `<option value="${valor}" ${row.tipo_despesa_prazo === valor ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}
      </select>
      <div class="field-hint">Define o prazo de pagamento do chamado. "Padrão" trava o vencimento na quarta-feira do lote semanal.</div>
    </div>
    <div class="field">
      <label>Tipo de contratação</label>
      <select id="lote-detalhe-tipo-contratacao">
        <option value="">Não informado</option>
        <option value="sob_demanda" ${row.tipo_contratacao === 'sob_demanda' ? 'selected' : ''}>Sob demanda</option>
        <option value="mensal" ${row.tipo_contratacao === 'mensal' ? 'selected' : ''}>Mensal</option>
      </select>
    </div>
    <div class="field" id="conta-bancaria-area">${renderContaBancariaArea(row.fornecedor_id, row.forma_pagamento, row.conta_bancaria_id)}</div>

    <div class="field">
      <label>Ratear entre centros de custo?</label>
      <select id="nf-tem-rateio">
        <option value="nao" ${!app.temRateio ? 'selected' : ''}>Não — usa o centro de custo/classe da linha</option>
        <option value="sim" ${app.temRateio ? 'selected' : ''}>Sim — dividir entre centros de custo</option>
      </select>
    </div>
    <div class="field" id="rateio-area">${app.temRateio ? renderRateioArea() : ''}</div>

    <div class="field">
      <label><input type="checkbox" id="nf-tem-imposto" ${app.temImposto ? 'checked' : ''}> Tem retenção de imposto</label>
    </div>
    <div class="field" id="imposto-area">${renderImpostoArea()}</div>

    <div class="field"><label>Descrição</label><textarea id="lote-detalhe-descricao" rows="2">${escapeHtml(row.descricao || '')}</textarea></div>
    <div class="field">
      <label>Arquivos anexos</label>
      <div id="anexos-area">${renderAnexosArea({}, {
        forma_pagamento: row.forma_pagamento || '', tipo_contratacao: row.tipo_contratacao || null,
        tem_retencao_imposto: app.temImposto, numero_nota: row.numero_nota || '', valor_bruto: row.valor_bruto || 0,
      }, { permitePreencher: false })}</div>
    </div>

    <div class="modal-actions">
      <button class="btn btn-brand" type="button" id="btn-lote-detalhe-salvar">Salvar detalhes desta linha</button>
      <button class="btn btn-ghost" type="button" id="btn-lote-detalhe-cancelar">Cancelar</button>
    </div>
  </div>`;
}
