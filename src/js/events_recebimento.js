// src/js/events_recebimento.js
//
// Wiring do formulário simplificado do perfil "recebedor" (ver
// ui_recebimento.js/migration 0029): duas ações -- criar um recebimento
// novo (anexo + classificação, vira nota status='recebido') ou corrigir um
// que voltou com pendência (mesmo formulário, populado com o que já
// existia) e devolver pro fluxo. Reaproveita finalizarAnexos()/
// dadosParaNomeArquivo() de events_notas.js -- o merge em PDF único e o
// nome padrão do arquivo já toleram os campos que ainda não existem nessa
// etapa (pagador, vencimento, número da NF -- ver fallback em
// anexos_pdf.js/nomeArquivoFinal).
import { app } from './state.js';
import * as db from './db.js';
import { render, closeModal, closeModalMaybeConfirm, closeModalWithFlash } from './app.js';
import { bindFornecedorCombo, bindClassificacaoSelectsCascade, renderAnexosArea } from './ui_nota.js';
import { dadosParaNomeArquivo, finalizarAnexos } from './events_notas.js';
import { showToast } from './toast.js';

function formVal(id) { const el = document.getElementById(id); return el ? el.value : ''; }

function notaDoFormularioAtual() {
  return app.state.modalData ? (app.notas.find(x => x.id === app.state.modalData) || {}) : {};
}

function refreshAnexosArea() {
  const el = document.getElementById('anexos-area');
  if (el) el.innerHTML = renderAnexosArea(notaDoFormularioAtual(), null, { painelLateral: false });
  bindAnexosSimples();
}

// Versão enxuta do bindAnexosArea de events_notas.js -- sem leitor de
// documentos/auditoria/aprendizado (isso é conferido pelo "completo" na
// hora de completar o lançamento; quem recebe só anexa).
function bindAnexosSimples() {
  const input = document.getElementById('nf-anexos-input');
  if (input) input.onchange = () => { app.anexosNovos.push(...Array.from(input.files)); refreshAnexosArea(); };
  document.querySelectorAll('[data-remover-anexo]').forEach(a => {
    a.onclick = (e) => { e.preventDefault(); app.anexosRemovidos.push(a.dataset.removerAnexo); refreshAnexosArea(); };
  });
  document.querySelectorAll('[data-remover-anexo-novo]').forEach(a => {
    a.onclick = (e) => { e.preventDefault(); app.anexosNovos.splice(parseInt(a.dataset.removerAnexoNovo), 1); refreshAnexosArea(); };
  });
  document.querySelectorAll('[data-mover-anexo-novo]').forEach(a => {
    a.onclick = (e) => {
      e.preventDefault();
      const i = parseInt(a.dataset.moverAnexoNovo);
      const alvo = a.dataset.direcao === 'cima' ? i - 1 : i + 1;
      if (alvo < 0 || alvo >= app.anexosNovos.length) return;
      [app.anexosNovos[i], app.anexosNovos[alvo]] = [app.anexosNovos[alvo], app.anexosNovos[i]];
      refreshAnexosArea();
    };
  });
}

export function attachRecebimentoModalHandlers() {
  const bg = document.getElementById('modal-bg');
  const pageRoot = document.querySelector('.page-form');
  const protect = (bg && bg.dataset.protect === '1') || (pageRoot && pageRoot.dataset.protect === '1');
  if (bg) bg.onclick = (e) => { if (e.target.id === 'modal-bg' && !protect) closeModal(); };
  const mc = document.getElementById('modal-close'); if (mc) mc.onclick = () => closeModalMaybeConfirm(protect);
  const cancel = document.getElementById('modal-cancel'); if (cancel) cancel.onclick = () => closeModalMaybeConfirm(protect);

  bindFornecedorCombo(() => {});
  bindClassificacaoSelectsCascade();
  bindAnexosSimples();

  const btnSalvar = document.getElementById('btn-salvar-recebimento');
  if (btnSalvar) btnSalvar.onclick = async () => {
    const centroId = formVal('nf-centro-custo');
    const classeId = formVal('nf-classe-conta');
    const codigoId = formVal('nf-codigo-classificacao');
    const fornecedorId = formVal('nf-fornecedor') || null;
    const descricao = formVal('nf-descricao').trim();
    if (!centroId || !classeId) { showToast('Selecione o centro de custo e a classe da conta.'); return; }
    const notaExistente = notaDoFormularioAtual();
    const existentesRestantes = (notaExistente.anexos || []).filter(p => !app.anexosRemovidos.includes(p));
    if (existentesRestantes.length === 0 && app.anexosNovos.length === 0) { showToast('Anexe ao menos um documento.'); return; }

    const original = btnSalvar.textContent;
    btnSalvar.disabled = true; btnSalvar.textContent = 'Enviando...';
    try {
      const dadosNota = dadosParaNomeArquivo({ fornecedor_id: fornecedorId });
      if (app.state.modal === 'corrigir_recebimento' && app.state.modalData) {
        const anexosFinal = await finalizarAnexos(notaExistente.id, notaExistente.anexos, dadosNota);
        const payload = { centro_custo_id: centroId, classe_conta_id: classeId, codigo_classificacao_id: codigoId || null, fornecedor_id: fornecedorId, descricao, anexos: anexosFinal };
        await db.corrigirPendencia(notaExistente.id, payload, app.usuario, null, [{ acao: 'Documento corrigido e devolvido pelo recebedor' }]);
        app.notas = await db.carregarNotas();
        closeModalWithFlash('Devolvido — já está de volta na fila para completar o lançamento.');
        return;
      }
      const payload = {
        centro_custo_id: centroId, classe_conta_id: classeId, codigo_classificacao_id: codigoId || null,
        fornecedor_id: fornecedorId, descricao, anexos: [], setor: app.usuario.setor,
      };
      const novaNota = await db.criarNota(payload, app.usuario, 'recebido', [{ acao: 'Documento recebido, enviado para complementação' }]);
      const anexosFinal = await finalizarAnexos(novaNota.id, [], dadosNota);
      await db.atualizarAnexosNota(novaNota.id, anexosFinal);
      app.notas = await db.carregarNotas();
      closeModalWithFlash('Documento enviado — já está na fila do setor para complementar o lançamento.');
    } catch (e) {
      showToast('Erro ao salvar: ' + e.message);
      btnSalvar.disabled = false; btnSalvar.textContent = original;
    }
  };
}
