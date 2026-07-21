// src/js/ui_recebimento.js
//
// Formulário simplificado do perfil "recebedor" (ver migration 0029) --
// quem recebe o documento do fornecedor na prática, mas não lança a nota
// inteira. Só 4 coisas: anexo(s), pagador, classificação (centro de custo/
// classe/código, obrigatório) e fornecedor (opcional, ajuda a evitar
// duplicidade mas nem sempre dá tempo/tem como buscar na hora do
// recebimento). Tudo o mais (valor, vencimento, forma de pagamento...)
// fica pro "completo" preencher depois em "Completar lançamento" (ver
// renderDetailActions em ui_nota.js).
//
// Pagador entrou aqui (pedido do dono do produto) porque cada pagador só
// aceita um recorte de centros de custo (origem_siglas) -- sem o campo, o
// recebedor via o cadastro de classificação inteiro, incluindo opções que
// não fazem sentido pro pagador real do documento. Reaproveita
// renderClassificacaoArea/bindClassificacaoSelectsCascade de ui_nota.js
// (mesmo componente do formulário completo) em vez de duplicar a lógica de
// cascata aqui.
import { app, escapeHtml, selectOptions, labelOf, pagadorPadraoParaSetor } from './state.js';
import { renderAnexosArea, renderClassificacaoArea } from './ui_nota.js';

export function formRecebimento(n) {
  n = n || {};
  const corrigindo = !!n.id;
  // Devolução por pendência (perfil recebedor corrigindo o que o CP/"completo"
  // marcou como incompleto) -- só nesse caso não existe opção de rascunho,
  // já que a nota já foi enviada pra fila do setor. Um rascunho (novo ou
  // reaberto via "Continuar rascunho") continua com as duas opções.
  const ehDevolucao = corrigindo && n.status === 'recebido';
  // Sugere pelo setor só quando ainda não existe NADA de classificação
  // escolhido (nem pagador, nem centro de custo) -- é o caso de um
  // lançamento genuinamente novo. Uma nota antiga (antes deste campo
  // existir) que já tem centro_custo_id mas não tem pagador_id (ex:
  // corrigindo uma devolução) NÃO entra nesse default: o centro já salvo
  // pode não pertencer ao pagador sugerido (cada pagador só aceita um
  // recorte de centros, ver centrosParaPagador em state.js) -- aplicar o
  // default aqui apagaria a seleção do centro de custo já existente. Não
  // muta `n` (pode ser o objeto de verdade em app.notas, ver
  // conteudoDoModal em ui_modal.js) -- só um valor derivado pra exibir,
  // que só vira permanente se a pessoa realmente salvar.
  const pagadorParaExibir = n.pagador_id || (!n.centro_custo_id ? pagadorPadraoParaSetor(app.usuario.setor) : null) || '';
  const pagOptions = selectOptions(app.cadastros.pagadores, pagadorParaExibir);
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
    <div class="field">
      <label>Pagador</label>
      <select id="nf-pagador" required>${pagOptions}</select>
      <div class="field-hint">Já vem sugerido pelo seu setor -- troque se o documento for de outro pagador. Define quais centros de custo aparecem a seguir.</div>
    </div>
    <div id="classificacao-area">${renderClassificacaoArea({ ...n, pagador_id: pagadorParaExibir })}</div>
    <div class="field">
      <label>Descrição (opcional)</label>
      <input id="nf-descricao" value="${escapeHtml(n.descricao || '')}" placeholder="alguma observação sobre este documento">
    </div>
    <div class="field">
      <label>Documento(s) do fornecedor</label>
      <div id="anexos-area">${renderAnexosArea(n, null, { painelLateral: false })}</div>
    </div>
    <div class="modal-actions">
      <button type="button" class="btn btn-brand" id="btn-salvar-recebimento">${ehDevolucao ? 'Corrigir e devolver' : 'Enviar para complementação'}</button>
      ${!ehDevolucao ? `<button type="button" class="btn btn-ghost" id="btn-salvar-recebimento-rascunho">Salvar como rascunho</button>` : ''}
      <button type="button" class="btn btn-ghost" id="modal-cancel">Cancelar</button>
    </div>
  </div>`;
}
