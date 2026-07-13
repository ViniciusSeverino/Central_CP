// src/js/events_cadastros.js — tela de Cadastros (fornecedores, plano de contas, usuários, delegações)
import { app, REGISTRY_DEFS, ehAdministrador } from './state.js';
import * as db from './db.js';
import { render, restoreFocus, closeModalWithFlash } from './app.js';
import { renderFornecedorContasArea, podeEditarCadastros } from './ui_cadastros.js';
import { pessoaTipo } from './chamado_texto.js';
import { attachImportarHandlers } from './events_importar.js';
import { attachArmazenamentoHandlers } from './events_armazenamento.js';
import { attachArquivosHandlers } from './events_arquivos.js';
import { showToast } from './toast.js';

const ROLES_SEM_SETOR = ['contas_a_pagar', 'gerente_financeiro', 'administrador'];

function bindFornecedorContasArea() {
  const bi = document.getElementById('btn-conta-incluir');
  if (bi) bi.onclick = () => {
    const cod_banco = document.getElementById('cb-cod-banco').value.trim();
    const agencia = document.getElementById('cb-agencia').value.trim();
    const conta = document.getElementById('cb-conta').value.trim();
    if (!cod_banco && !agencia && !conta) { showToast('Preencha ao menos um dado bancário.'); return; }
    app.fornecedorContasTemp.push({ cod_banco, agencia, conta });
    refreshFornecedorContasArea();
  };
  document.querySelectorAll('[data-conta-remove]').forEach(b => {
    b.onclick = () => { app.fornecedorContasTemp.splice(parseInt(b.dataset.contaRemove), 1); refreshFornecedorContasArea(); };
  });
}
function refreshFornecedorContasArea() {
  const area = document.getElementById('fornecedor-contas-area');
  if (!area) return;
  area.innerHTML = renderFornecedorContasArea();
  bindFornecedorContasArea();
}

export function attachCadastroHandlers() {
  document.querySelectorAll('[data-cad-tab]').forEach(b => {
    b.onclick = async () => {
      app.state.cadastroTab = b.dataset.cadTab; app.fornecedorContasTemp = [];
      if (b.dataset.cadTab === 'usuarios' && ehAdministrador()) {
        render(); // mostra "Carregando..." primeiro, lista grande pode demorar um pouco
        try { app.usuariosCompletos = await db.carregarUsuariosCompletos(); } catch (e) { showToast('Erro ao carregar usuários: ' + e.message); }
      }
      if (b.dataset.cadTab === 'armazenamento' && ehAdministrador()) {
        render();
        try { app.armazenamentoStats = await db.obterEstatisticasArmazenamento(); } catch (e) { showToast('Erro ao carregar estatísticas: ' + e.message); }
      }
      render();
    };
  });
  if (app.state.modal === 'novo_fornecedor' || app.state.modal === 'editar_fornecedor') {
    bindFornecedorContasArea();
  }
  const fbf = document.getElementById('f-busca-fornecedor');
  if (fbf) fbf.oninput = () => { app.state.cadFornecedorBusca = fbf.value; render(); restoreFocus('f-busca-fornecedor'); };

  attachUsuariosHandlers();
  attachDelegacoesHandlers();
  attachImportarHandlers();
  attachArmazenamentoHandlers();
  attachArquivosHandlers();

  // Somente o contas a pagar (ou super_usuario) tem os botões de adicionar/
  // remover renderizados (ver ui_cadastros.js) — a checagem aqui é só uma
  // segunda barreira, quem decide de verdade é a RLS no banco.
  if (!podeEditarCadastros()) return;

  // Fornecedor: modal próprio (novo/editar), separado do fluxo genérico
  // de "adicionar" inline usado pelos outros cadastros -- ver
  // formFornecedor() em ui_cadastros.js.
  const btnNovoFornecedor = document.getElementById('btn-novo-fornecedor');
  if (btnNovoFornecedor) btnNovoFornecedor.onclick = () => {
    app.fornecedorContasTemp = [];
    app.state.modal = 'novo_fornecedor'; app.state.modalData = null; render();
  };

  document.querySelectorAll('[data-editar-fornecedor]').forEach(tr => {
    tr.onclick = () => {
      const forn = app.cadastros.fornecedores.find(f => f.id === tr.dataset.editarFornecedor);
      app.fornecedorContasTemp = (forn && forn.contas) ? forn.contas.map(c => ({ ...c })) : [];
      app.state.modal = 'editar_fornecedor'; app.state.modalData = tr.dataset.editarFornecedor; render();
    };
  });

  // Sugere PF/PJ pela contagem de dígitos do CPF/CNPJ ao sair do campo --
  // só se o seletor ainda estiver em branco, pra não sobrescrever uma
  // correção manual que a pessoa já tenha feito.
  const cnpjInput = document.getElementById('cadnew-cnpj');
  const pessoaSelect = document.getElementById('cadnew-pessoa-tipo');
  if (cnpjInput && pessoaSelect) {
    cnpjInput.onblur = () => {
      if (pessoaSelect.value) return;
      const sugestao = pessoaTipo(cnpjInput.value);
      if (sugestao === 'PF' || sugestao === 'PJ') pessoaSelect.value = sugestao;
    };
  }

  const confirmarFornecedor = document.getElementById('confirmar-fornecedor');
  if (confirmarFornecedor) confirmarFornecedor.onclick = async () => {
    const nome = document.getElementById('cadnew-nome').value.trim();
    const cnpj = document.getElementById('cadnew-cnpj').value.trim();
    const municipio = document.getElementById('cadnew-municipio').value.trim();
    const cod_group = document.getElementById('cadnew-cod_group').value.trim();
    const pessoa_tipo = document.getElementById('cadnew-pessoa-tipo').value || null;
    const tipo_contratacao_padrao = document.getElementById('cadnew-tipo-contratacao-padrao').value || null;
    const contrato_vigencia_inicio = document.getElementById('cadnew-vigencia-inicio').value || null;
    const contrato_vigencia_fim = document.getElementById('cadnew-vigencia-fim').value || null;
    const contrato_observacoes = document.getElementById('cadnew-contrato-obs').value.trim() || null;
    if (!nome) { showToast('Informe o nome do fornecedor.'); return; }
    if (contrato_vigencia_inicio && contrato_vigencia_fim && contrato_vigencia_fim < contrato_vigencia_inicio) {
      showToast('A vigência final do contrato não pode ser antes da inicial.'); return;
    }
    const dados = { nome, cnpj, municipio, cod_group, pessoa_tipo, tipo_contratacao_padrao, contrato_vigencia_inicio, contrato_vigencia_fim, contrato_observacoes, contas: app.fornecedorContasTemp };
    const editando = app.state.modal === 'editar_fornecedor';
    const original = confirmarFornecedor.textContent;
    confirmarFornecedor.disabled = true; confirmarFornecedor.textContent = 'Salvando...';
    try {
      if (editando) await db.atualizarFornecedor(app.state.modalData, dados);
      else await db.adicionarFornecedor(dados);
      app.fornecedorContasTemp = [];
      app.cadastros = await db.carregarCadastros();
      closeModalWithFlash(editando ? 'Fornecedor atualizado.' : 'Fornecedor cadastrado com sucesso.');
    } catch (e) {
      showToast('Erro ao salvar: ' + e.message);
      confirmarFornecedor.disabled = false; confirmarFornecedor.textContent = original;
    }
  };

  document.querySelectorAll('[data-cad-remove-fornecedor]').forEach(b => {
    b.onclick = async (e) => {
      e.stopPropagation();
      if (!confirm('Remover este fornecedor da lista? Notas que já usam esse fornecedor continuam funcionando normalmente.')) return;
      const original = b.textContent;
      b.disabled = true; b.textContent = 'Removendo...';
      try {
        await db.removerItemCadastro('fornecedores', b.dataset.cadRemoveFornecedor);
        app.cadastros = await db.carregarCadastros();
        render();
      } catch (e2) {
        showToast('Erro ao remover: ' + e2.message);
        b.disabled = false; b.textContent = original;
      }
    };
  });

  const badd = document.getElementById('btn-add-cadastro');
  if (badd) badd.onclick = async () => {
    const active = (app.state.cadastroTab && REGISTRY_DEFS[app.state.cadastroTab]) ? app.state.cadastroTab : Object.keys(REGISTRY_DEFS)[0];
    const originalLabel = badd.textContent;
    try {
      const def = REGISTRY_DEFS[active];
      const item = {};
      let valid = true;
      def.fields.forEach(f => {
        if (f.type === 'origens') { item.origem_siglas = Array.from(document.querySelectorAll('.cadnew-origem:checked')).map(c => c.value); return; }
        const el = document.getElementById('cadnew-' + f.key);
        const v = el ? el.value.trim() : '';
        if (f.required && !v) valid = false;
        item[f.key] = v;
      });
      if (!valid) { showToast('Preencha os campos obrigatórios.'); return; }
      badd.disabled = true; badd.textContent = 'Salvando...';
      if (active === 'pagadores') await db.adicionarPagador(item);
      if (active === 'centros_custo') await db.adicionarCentroCusto(item);
      if (active === 'classes_conta') await db.adicionarClasseConta(item);
      if (active === 'codigos_classificacao') await db.adicionarCodigoClassificacao(item);
      app.cadastros = await db.carregarCadastros();
      app.state.flash = 'Item cadastrado com sucesso.';
      render();
    } catch (e) {
      showToast('Erro ao cadastrar: ' + e.message);
      badd.disabled = false; badd.textContent = originalLabel;
    }
  };

  document.querySelectorAll('[data-cad-remove]').forEach(b => {
    b.onclick = async () => {
      if (!confirm('Remover este item da lista? Notas que já usam esse item continuam funcionando normalmente.')) return;
      const active = (app.state.cadastroTab && REGISTRY_DEFS[app.state.cadastroTab]) ? app.state.cadastroTab : Object.keys(REGISTRY_DEFS)[0];
      const originalLabel = b.textContent;
      b.disabled = true; b.textContent = 'Removendo...';
      try {
        await db.removerItemCadastro(active, b.dataset.cadRemove);
        app.cadastros = await db.carregarCadastros();
        render();
      } catch (e) {
        showToast('Erro ao remover: ' + e.message);
        b.disabled = false; b.textContent = originalLabel;
      }
    };
  });
}

/* ====================== USUÁRIOS (só administrador) ====================== */
function toggleSetorArea(roleSelId, areaId) {
  const sel = document.getElementById(roleSelId);
  const area = document.getElementById(areaId);
  if (!sel || !area) return;
  const atualizar = () => { area.style.display = ROLES_SEM_SETOR.includes(sel.value) ? 'none' : ''; };
  sel.onchange = atualizar;
  atualizar();
}

function attachUsuariosHandlers() {
  const bc = document.getElementById('btn-convidar-usuario');
  if (bc) bc.onclick = () => { app.state.modal = 'convidar_usuario'; app.state.modalData = null; render(); };

  toggleSetorArea('cv-role', 'cv-setor-area');
  toggleSetorArea('ed-role', 'ed-setor-area');

  const confirmarConvidar = document.getElementById('confirmar-convidar');
  if (confirmarConvidar) confirmarConvidar.onclick = async () => {
    const nome = document.getElementById('cv-nome').value.trim();
    const email = document.getElementById('cv-email').value.trim();
    const role = document.getElementById('cv-role').value;
    const setor = document.getElementById('cv-setor').value;
    if (!nome || !email) { showToast('Preencha nome e e-mail.'); return; }
    if (!ROLES_SEM_SETOR.includes(role) && !setor) { showToast('Selecione o setor.'); return; }
    const original = confirmarConvidar.textContent;
    confirmarConvidar.disabled = true; confirmarConvidar.textContent = 'Enviando...';
    try {
      await db.convidarUsuario({ nome, email, role, setor: ROLES_SEM_SETOR.includes(role) ? null : setor });
      app.usuariosCompletos = await db.carregarUsuariosCompletos();
      app.usuarios = await db.carregarUsuarios();
      closeModalWithFlash(`Convite enviado para ${email}.`);
    } catch (e) {
      showToast('Erro ao convidar: ' + e.message);
      confirmarConvidar.disabled = false; confirmarConvidar.textContent = original;
    }
  };

  document.querySelectorAll('[data-editar-usuario]').forEach(b => {
    b.onclick = () => { app.state.modal = 'editar_usuario'; app.state.modalData = b.dataset.editarUsuario; render(); };
  });

  const confirmarEditar = document.getElementById('confirmar-editar-usuario');
  if (confirmarEditar) confirmarEditar.onclick = async () => {
    const role = document.getElementById('ed-role').value;
    const setor = document.getElementById('ed-setor').value;
    if (!ROLES_SEM_SETOR.includes(role) && !setor) { showToast('Selecione o setor.'); return; }
    const original = confirmarEditar.textContent;
    confirmarEditar.disabled = true; confirmarEditar.textContent = 'Salvando...';
    try {
      await db.atualizarPapelUsuario(app.state.modalData, { role, setor: ROLES_SEM_SETOR.includes(role) ? null : setor });
      app.usuariosCompletos = await db.carregarUsuariosCompletos();
      app.usuarios = await db.carregarUsuarios();
      closeModalWithFlash('Usuário atualizado.');
    } catch (e) {
      showToast('Erro ao salvar: ' + e.message);
      confirmarEditar.disabled = false; confirmarEditar.textContent = original;
    }
  };

  const confirmarRedefinirSenha = document.getElementById('confirmar-redefinir-senha');
  if (confirmarRedefinirSenha) confirmarRedefinirSenha.onclick = async () => {
    const nova = document.getElementById('rs-senha-nova').value;
    const confirma = document.getElementById('rs-senha-confirma').value;
    if (!nova || nova.length < 6) { showToast('A nova senha precisa ter pelo menos 6 caracteres.'); return; }
    if (nova !== confirma) { showToast('As senhas não coincidem.'); return; }
    const original = confirmarRedefinirSenha.textContent;
    confirmarRedefinirSenha.disabled = true; confirmarRedefinirSenha.textContent = 'Redefinindo...';
    try {
      await db.redefinirSenhaUsuario(app.state.modalData, nova);
      closeModalWithFlash('Senha redefinida.');
    } catch (e) {
      showToast('Erro ao redefinir senha: ' + e.message);
      confirmarRedefinirSenha.disabled = false; confirmarRedefinirSenha.textContent = original;
    }
  };

  document.querySelectorAll('[data-desativar-usuario]').forEach(b => {
    b.onclick = async () => {
      if (!confirm('Desativar este usuário? Ele perde o acesso imediatamente.')) return;
      const original = b.textContent;
      b.disabled = true; b.textContent = 'Desativando...';
      try {
        await db.desativarUsuario(b.dataset.desativarUsuario);
        app.usuariosCompletos = await db.carregarUsuariosCompletos();
        render();
      } catch (e) {
        showToast('Erro ao desativar: ' + e.message);
        b.disabled = false; b.textContent = original;
      }
    };
  });

  document.querySelectorAll('[data-reativar-usuario]').forEach(b => {
    b.onclick = async () => {
      const original = b.textContent;
      b.disabled = true; b.textContent = 'Reativando...';
      try {
        await db.reativarUsuario(b.dataset.reativarUsuario);
        app.usuariosCompletos = await db.carregarUsuariosCompletos();
        render();
      } catch (e) {
        showToast('Erro ao reativar: ' + e.message);
        b.disabled = false; b.textContent = original;
      }
    };
  });
}

/* ====================== DELEGAÇÕES (administrador/gerente_financeiro) ====================== */
function attachDelegacoesHandlers() {
  const bn = document.getElementById('btn-nova-delegacao');
  if (bn) bn.onclick = () => { app.state.modal = 'nova_delegacao'; app.state.modalData = null; render(); };

  const confirmar = document.getElementById('confirmar-nova-delegacao');
  if (confirmar) confirmar.onclick = async () => {
    const titular_id = document.getElementById('dl-titular').value;
    const delegado_id = document.getElementById('dl-delegado').value;
    const data_inicio = document.getElementById('dl-inicio').value;
    const data_fim = document.getElementById('dl-fim').value;
    const motivo = document.getElementById('dl-motivo').value.trim();
    if (!titular_id || !delegado_id) { showToast('Selecione o titular e o delegado.'); return; }
    if (titular_id === delegado_id) { showToast('Titular e delegado precisam ser pessoas diferentes.'); return; }
    if (!data_inicio || !data_fim) { showToast('Preencha o período.'); return; }
    if (data_fim < data_inicio) { showToast('A data final não pode ser antes da inicial.'); return; }
    const original = confirmar.textContent;
    confirmar.disabled = true; confirmar.textContent = 'Criando...';
    try {
      await db.criarDelegacao({ titular_id, delegado_id, data_inicio, data_fim, motivo }, app.usuario);
      app.delegacoes = await db.carregarDelegacoes();
      closeModalWithFlash('Delegação criada.');
    } catch (e) {
      showToast('Erro ao criar delegação: ' + e.message);
      confirmar.disabled = false; confirmar.textContent = original;
    }
  };

  document.querySelectorAll('[data-revogar-delegacao]').forEach(b => {
    b.onclick = async () => {
      if (!confirm('Revogar esta delegação agora?')) return;
      const original = b.textContent;
      b.disabled = true; b.textContent = 'Revogando...';
      try {
        await db.revogarDelegacao(b.dataset.revogarDelegacao);
        app.delegacoes = await db.carregarDelegacoes();
        render();
      } catch (e) {
        showToast('Erro ao revogar: ' + e.message);
        b.disabled = false; b.textContent = original;
      }
    };
  });
}
