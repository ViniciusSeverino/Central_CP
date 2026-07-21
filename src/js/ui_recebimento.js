// src/js/ui_recebimento.js
//
// Formulário simplificado do perfil "recebedor" (ver migration 0029) --
// quem recebe o documento do fornecedor na prática, mas não lança a nota
// inteira. Só 3 coisas: anexo(s), classificação (centro de custo/classe/
// código, obrigatório) e fornecedor (opcional, ajuda a evitar duplicidade
// mas nem sempre dá tempo/tem como buscar na hora do recebimento). Tudo o
// mais (valor, vencimento, pagador, forma de pagamento...) fica pro
// "completo" preencher depois em "Completar lançamento" (ver
// renderDetailActions em ui_nota.js) -- por isso o centro de custo AQUI
// não é filtrado por pagador (renderClassificacaoArea em ui_nota.js faz
// isso, mas exige pagador escolhido primeiro; aqui ainda não existe
// pagador nenhum) -- mostra o cadastro inteiro.
import { app, escapeHtml, selectOptions, labelOf, classesParaCentro, codigosParaClasse } from './state.js';
import { renderAnexosArea } from './ui_nota.js';

export function formRecebimento(n) {
  n = n || {};
  const corrigindo = !!n.id;
  const centroOptions = selectOptions(app.cadastros.centros_custo, n.centro_custo_id);
  const classeOptions = n.centro_custo_id ? selectOptions(classesParaCentro(n.centro_custo_id), n.classe_conta_id) : '';
  const codOptions = n.classe_conta_id ? codigosParaClasse(n.classe_conta_id) : [];
  const fornecedorAtual = n.fornecedor_id ? app.cadastros.fornecedores.find(f => f.id === n.fornecedor_id) : null;
  return `
  <div id="box-recebimento">
    ${corrigindo && n.motivo_pendencia ? `<div class="err-msg" style="margin-bottom:14px;">Motivo da devolução: ${escapeHtml(n.motivo_pendencia)}</div>` : ''}
    <div class="field">
      <label>Fornecedor (opcional)</label>
      <div class="combo">
        <input class="combo-input" id="nf-fornecedor-busca" autocomplete="off" placeholder="Digite ao menos 2 letras para buscar..." value="${fornecedorAtual ? escapeHtml(labelOf(fornecedorAtual)) : ''}">
        <input type="hidden" id="nf-fornecedor" value="${n.fornecedor_id || ''}">
        <div class="combo-list" id="nf-fornecedor-list" style="display:none;"></div>
      </div>
      <div class="field-hint">Se você não souber ou não tiver tempo de buscar agora, pode deixar em branco -- quem completar o lançamento preenche depois.</div>
    </div>
    <div class="grid2">
      <div class="field">
        <label>Centro de custo</label>
        <select id="nf-centro-custo" required>${centroOptions}</select>
      </div>
      <div class="field">
        <label>Classe da conta</label>
        <select id="nf-classe-conta" required ${!n.centro_custo_id ? 'disabled' : ''}>${n.centro_custo_id ? classeOptions : `<option value="">Selecione o centro de custo primeiro</option>`}</select>
      </div>
    </div>
    <div class="field">
      <label>Código da classificação</label>
      <select id="nf-codigo-classificacao" ${!n.classe_conta_id ? 'disabled' : ''}>${n.classe_conta_id ? (codOptions.length ? selectOptions(codOptions, n.codigo_classificacao_id) : `<option value="">Sem subdivisão para esta classe</option>`) : `<option value="">Selecione a classe da conta primeiro</option>`}</select>
    </div>
    <div class="field">
      <label>Descrição (opcional)</label>
      <input id="nf-descricao" value="${escapeHtml(n.descricao || '')}" placeholder="alguma observação sobre este documento">
    </div>
    <div class="field">
      <label>Documento(s) do fornecedor</label>
      <div id="anexos-area">${renderAnexosArea(n, null, { painelLateral: false })}</div>
    </div>
    <div class="modal-actions">
      <button type="button" class="btn btn-brand" id="btn-salvar-recebimento">${corrigindo ? 'Corrigir e devolver' : 'Enviar para complementação'}</button>
      <button type="button" class="btn btn-ghost" id="modal-cancel">Cancelar</button>
    </div>
  </div>`;
}
