// src/js/app.js
import { supabase } from './supabaseClient.js';
import { entrar, cadastrar, sair, sessaoAtual } from './auth.js';
import * as db from './db.js';
import { app, SETORES, LIMITE_APROVACAO_GESTOR, REGISTRY_DEFS, uid, fmtMoney, labelOf, centrosParaPagador, classesParaCentro, codigosParaClasse, selectOptions } from './state.js';
import { renderAuth, renderShell, authTab, setAuthTab, authError, setAuthError } from './ui.js';
import { renderModal } from './ui_modal.js';
import { bindClassificacaoArea, refreshClassificacaoArea, refreshContaBancariaArea, refreshRateioArea, bindRateioArea } from './ui_nota.js';
import { renderFornecedorContasArea } from './ui_cadastros.js';

const appEl = document.getElementById('app');

function render() {
  appEl.innerHTML = app.usuario ? renderShell() : renderAuth();
  if (app.usuario) {
    attachShellHandlers();
    if (app.state.modal) attachModalHandlers();
  } else {
    attachAuthHandlers();
  }
}
window.__render = render; // útil para debug no console

/* ====================== CARREGAMENTO DE DADOS ====================== */
async function carregarTudo() {
  app.cadastros = await db.carregarCadastros();
  app.notas = await db.carregarNotas();
  app.usuarios = await db.carregarUsuarios();
}

/* ============================ AUTH ============================ */
function attachAuthHandlers() {
  document.querySelectorAll('[data-tab]').forEach(b => {
    b.onclick = () => { setAuthTab(b.dataset.tab); setAuthError(''); render(); };
  });
  const roleSel = document.getElementById('cad-role');
  if (roleSel) roleSel.onchange = () => {
    const box = document.getElementById('box-cad-setor');
    if (box) box.style.display = (roleSel.value === 'contas_a_pagar') ? 'none' : '';
  };

  const doLogin = async () => {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    if (!email || !password) { setAuthError('Preencha e-mail e senha.'); render(); return; }
    const { usuario, error } = await entrar({ email, password });
    if (error) { setAuthError(error); render(); return; }
    app.usuario = usuario;
    await carregarTudo();
    app.state.view = defaultViewForRole(usuario.role);
    app.state.flash = `Bem-vindo(a), ${usuario.nome.split(' ')[0]}.`;
    render();
  };

  const doCadastro = async () => {
    const nome = document.getElementById('cad-name').value.trim();
    const email = document.getElementById('cad-email').value.trim();
    const password = document.getElementById('cad-password').value;
    const role = document.getElementById('cad-role').value;
    const setor = role === 'contas_a_pagar' ? null : document.getElementById('cad-setor').value;
    if (!nome || !email || !password) { setAuthError('Preencha todos os campos.'); render(); return; }
    if (password.length < 6) { setAuthError('A senha precisa ter pelo menos 6 caracteres.'); render(); return; }
    if (role !== 'contas_a_pagar' && !setor) { setAuthError('Selecione o setor.'); render(); return; }
    const { usuario, error } = await cadastrar({ nome, email, password, role, setor });
    if (error) { setAuthError(error); render(); return; }
    app.usuario = usuario;
    await carregarTudo();
    app.state.view = defaultViewForRole(usuario.role);
    app.state.flash = `Conta criada. Bem-vindo(a), ${usuario.nome.split(' ')[0]}.`;
    render();
  };

  const bl = document.getElementById('btn-do-login');
  if (bl) bl.onclick = doLogin;
  const bc = document.getElementById('btn-do-cadastro');
  if (bc) bc.onclick = doCadastro;
  enterTriggers('box-login', doLogin);
  enterTriggers('box-cadastro', doCadastro);
}

function enterTriggers(containerId, fn) {
  const box = document.getElementById(containerId);
  if (!box) return;
  box.querySelectorAll('input').forEach(inp => {
    inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); fn(); } };
  });
}

function defaultViewForRole(role) {
  if (role === 'departamento') return 'minhas';
  if (role === 'gestor') return 'aprovacao';
  return 'fila_lancar';
}

/* ========================= SHELL / NAV ========================= */
function closeModal() { app.state.modal = null; app.state.modalData = null; render(); }
function closeModalMaybeConfirm(protect) {
  if (protect) {
    if (confirm('Tem certeza que deseja cancelar? Os dados preenchidos neste formulário serão perdidos (a menos que você salve como rascunho).')) closeModal();
  } else closeModal();
}
function closeModalWithFlash(msg) { app.state.modal = null; app.state.modalData = null; app.state.flash = msg; render(); }

function restoreFocus(id) {
  const el = document.getElementById(id);
  if (el) { el.focus(); el.selectionStart = el.selectionEnd = el.value.length; }
}

function attachShellHandlers() {
  document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => { app.state.view = b.dataset.view; app.state.flash = null; render(); });

  const bn = document.getElementById('btn-nova-nota');
  if (bn) bn.onclick = () => { app.rateioTemp = []; app.temRateio = false; app.state.modal = 'nova_nota'; app.state.modalData = null; render(); };

  const br = document.getElementById('btn-refresh');
  if (br) br.onclick = async () => {
    br.disabled = true; br.textContent = 'Atualizando...';
    try { await carregarTudo(); app.state.flash = 'Dados atualizados.'; }
    catch (e) { alert('Erro ao atualizar: ' + e.message); }
    render();
  };

  const bo = document.getElementById('btn-logout');
  if (bo) bo.onclick = async () => {
    await sair();
    app.usuario = null;
    app.state = { view: 'minhas', modal: null, modalData: null, flash: null, filters: { status: '', busca: '' }, cadastroTab: 'fornecedores', cadFornecedorBusca: '' };
    render();
  };

  document.querySelectorAll('[data-open]').forEach(el => {
    el.onclick = () => { app.state.modal = 'detalhe'; app.state.modalData = el.dataset.open; render(); };
  });

  const fb = document.getElementById('f-busca');
  if (fb) fb.oninput = () => { app.state.filters.busca = fb.value; render(); restoreFocus('f-busca'); };
  const fs = document.getElementById('f-status');
  if (fs) fs.onchange = () => { app.state.filters.status = fs.value; render(); };

  /* ---- Cadastros ---- */
  document.querySelectorAll('[data-cad-tab]').forEach(b => {
    b.onclick = () => { app.state.cadastroTab = b.dataset.cadTab; app.fornecedorContasTemp = []; render(); };
  });
  if (app.state.cadastroTab === 'fornecedores' || !app.state.cadastroTab) {
    bindFornecedorContasArea();
  }
  const fbf = document.getElementById('f-busca-fornecedor');
  if (fbf) fbf.oninput = () => { app.state.cadFornecedorBusca = fbf.value; render(); restoreFocus('f-busca-fornecedor'); };

  const badd = document.getElementById('btn-add-cadastro');
  if (badd) badd.onclick = async () => {
    const active = (app.state.cadastroTab && REGISTRY_DEFS[app.state.cadastroTab]) ? app.state.cadastroTab : Object.keys(REGISTRY_DEFS)[0];
    try {
      if (active === 'fornecedores') {
        const nome = document.getElementById('cadnew-nome').value.trim();
        const cnpj = document.getElementById('cadnew-cnpj').value.trim();
        const municipio = document.getElementById('cadnew-municipio').value.trim();
        const cod_group = document.getElementById('cadnew-cod_group').value.trim();
        if (!nome) { alert('Informe o nome do fornecedor.'); return; }
        await db.adicionarFornecedor({ nome, cnpj, municipio, cod_group, contas: app.fornecedorContasTemp });
        app.fornecedorContasTemp = [];
        app.cadastros = await db.carregarCadastros();
        app.state.flash = 'Fornecedor cadastrado com sucesso.';
        render();
        return;
      }
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
      if (!valid) { alert('Preencha os campos obrigatórios.'); return; }
      if (active === 'pagadores') await db.adicionarPagador(item);
      if (active === 'centros_custo') await db.adicionarCentroCusto(item);
      if (active === 'classes_conta') await db.adicionarClasseConta(item);
      if (active === 'codigos_classificacao') await db.adicionarCodigoClassificacao(item);
      app.cadastros = await db.carregarCadastros();
      app.state.flash = 'Item cadastrado com sucesso.';
      render();
    } catch (e) {
      alert('Erro ao cadastrar: ' + e.message);
    }
  };

  document.querySelectorAll('[data-cad-remove]').forEach(b => {
    b.onclick = async () => {
      if (!confirm('Remover este item da lista? Notas que já usam esse item continuam funcionando normalmente.')) return;
      const active = (app.state.cadastroTab && REGISTRY_DEFS[app.state.cadastroTab]) ? app.state.cadastroTab : Object.keys(REGISTRY_DEFS)[0];
      try {
        await db.removerItemCadastro(active, b.dataset.cadRemove);
        app.cadastros = await db.carregarCadastros();
        render();
      } catch (e) {
        alert('Erro ao remover: ' + e.message);
      }
    };
  });

  if (app.state.modal) return; // o resto é tratado em attachModalHandlers
}

function bindFornecedorContasArea() {
  const bi = document.getElementById('btn-conta-incluir');
  if (bi) bi.onclick = () => {
    const cod_banco = document.getElementById('cb-cod-banco').value.trim();
    const agencia = document.getElementById('cb-agencia').value.trim();
    const conta = document.getElementById('cb-conta').value.trim();
    if (!cod_banco && !agencia && !conta) { alert('Preencha ao menos um dado bancário.'); return; }
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

/* ============================ MODAIS ============================ */
function attachModalHandlers() {
  const bg = document.getElementById('modal-bg');
  const protect = bg && bg.dataset.protect === '1';
  if (bg) bg.onclick = (e) => { if (e.target.id === 'modal-bg' && !protect) closeModal(); };
  const mc = document.getElementById('modal-close'); if (mc) mc.onclick = () => closeModalMaybeConfirm(protect);
  const cancel = document.getElementById('modal-cancel'); if (cancel) cancel.onclick = () => closeModalMaybeConfirm(protect);

  document.querySelectorAll('[data-action]').forEach(b => {
    b.onclick = () => {
      app.state.modal = b.dataset.action; app.state.modalData = b.dataset.id;
      if (app.state.modal === 'editar_reenviar') {
        const n = app.notas.find(x => x.id === app.state.modalData);
        app.rateioTemp = (n.rateios || []).map(r => ({ ...r }));
        app.temRateio = !!n.tem_rateio;
      }
      render();
    };
  });

  if (app.state.modal === 'nova_nota' || app.state.modal === 'editar_reenviar') {
    bindClassificacaoArea();
    const valorInput = document.getElementById('nf-valor');
    if (valorInput) valorInput.oninput = () => { if (app.temRateio) refreshRateioArea(); };
    const selPagador = document.getElementById('nf-pagador');
    if (selPagador) selPagador.onchange = () => { refreshClassificacaoArea(); };
    const selFornecedor = document.getElementById('nf-fornecedor');
    if (selFornecedor) selFornecedor.onchange = refreshContaBancariaArea;
    const selForma = document.getElementById('nf-forma-pagamento');
    if (selForma) selForma.onchange = refreshContaBancariaArea;
    const selTemRateio = document.getElementById('nf-tem-rateio');
    if (selTemRateio) selTemRateio.onchange = () => { app.temRateio = selTemRateio.value === 'sim'; refreshClassificacaoArea(); };
  }

  document.querySelectorAll('[data-goto-cadastros]').forEach(a => {
    a.onclick = (e) => { e.preventDefault(); app.state.modal = null; app.state.modalData = null; app.state.view = 'cadastros'; app.state.cadastroTab = a.dataset.gotoCadastros; render(); };
  });

  function formVal(id) { const el = document.getElementById(id); return el ? el.value : ''; }

  function coletarPayload() {
    const contaBancariaEl = document.getElementById('nf-conta-bancaria');
    let classe_conta_id = null, centro_custo_id = null, codigo_classificacao_id = null, rateios = [];
    if (app.temRateio) rateios = app.rateioTemp.map(r => ({ ...r }));
    else {
      classe_conta_id = formVal('nf-classe-conta') || null;
      centro_custo_id = formVal('nf-centro-custo') || null;
      codigo_classificacao_id = formVal('nf-codigo-classificacao') || null;
    }
    return {
      data_emissao: formVal('nf-emissao') || null,
      vencimento: formVal('nf-vencimento') || null,
      numero_nota: formVal('nf-numero').trim(),
      valor_bruto: parseFloat(formVal('nf-valor')) || 0,
      pagador_id: formVal('nf-pagador') || null,
      fornecedor_id: formVal('nf-fornecedor') || null,
      forma_pagamento: formVal('nf-forma-pagamento') || null,
      conta_bancaria_id: contaBancariaEl ? (contaBancariaEl.value || null) : null,
      classificacao: formVal('nf-classificacao') || null,
      descricao: formVal('nf-descricao').trim(),
      anexos: formVal('nf-anexos').split(',').map(s => s.trim()).filter(Boolean),
      classe_conta_id, centro_custo_id, codigo_classificacao_id, rateios,
      tem_rateio: app.temRateio,
    };
  }

  function validarPayload(p) {
    if (!p.data_emissao || !p.vencimento || !p.numero_nota || !p.valor_bruto || !p.pagador_id || !p.fornecedor_id || !p.forma_pagamento || !p.classificacao) {
      return 'Preencha todos os campos obrigatórios: emissão, vencimento, NF, valor bruto, pagador, fornecedor, forma de pagamento e classificação.';
    }
    if (p.forma_pagamento === 'TED' || p.forma_pagamento === 'Pix') {
      const forn = app.cadastros.fornecedores.find(f => f.id === p.fornecedor_id);
      if (forn && forn.contas && forn.contas.length > 0 && !p.conta_bancaria_id) {
        return 'Selecione a conta bancária do fornecedor para pagamento via TED/Pix.';
      }
    }
    if (p.tem_rateio) {
      if (p.rateios.length === 0) return 'Inclua ao menos uma linha de rateio, ou selecione "Não" para classificar a nota toda de uma vez.';
      const soma = p.rateios.reduce((s, r) => s + r.valor, 0);
      if (Math.abs(soma - p.valor_bruto) > 0.01) return `A soma do rateio (${fmtMoney(soma)}) precisa ser igual ao valor bruto da nota (${fmtMoney(p.valor_bruto)}).`;
    } else {
      if (!p.classe_conta_id || !p.centro_custo_id) return 'Selecione o centro de custo e a classe da conta.';
    }
    return null;
  }

  const btnSalvarNota = document.getElementById('btn-salvar-nota');
  if (btnSalvarNota) btnSalvarNota.onclick = async () => {
    const p = coletarPayload();
    const erro = validarPayload(p);
    if (erro) { alert(erro); return; }
    const novoStatus = p.valor_bruto > LIMITE_APROVACAO_GESTOR ? 'lancado' : 'aprovado';
    const autoAprovada = novoStatus === 'aprovado';
    btnSalvarNota.disabled = true; btnSalvarNota.textContent = 'Salvando...';
    try {
      if (app.state.modal === 'editar_reenviar' && app.state.modalData) {
        const n = app.notas.find(x => x.id === app.state.modalData);
        const eraRascunho = n.status === 'rascunho';
        const entradas = [{ acao: eraRascunho ? 'Rascunho enviado para aprovação' : 'Ajustado e reenviado para aprovação' }];
        if (autoAprovada) entradas.push({ acao: 'Aprovação automática', detalhe: `Valor de ${fmtMoney(p.valor_bruto)} está dentro da alçada (até ${fmtMoney(LIMITE_APROVACAO_GESTOR)}) — segue direto para o contas a pagar.` });
        await db.atualizarNota(n.id, p, app.usuario, novoStatus, entradas);
        app.notas = await db.carregarNotas();
        closeModalWithFlash(autoAprovada ? 'Nota enviada — dentro da alçada, já liberada direto para o contas a pagar.' : 'Nota enviada para aprovação do gestor.');
        return;
      }
      const historicoInicial = [{ acao: 'Nota lançada no Central CP', detalhe: `NF ${p.numero_nota}` }];
      if (autoAprovada) historicoInicial.push({ acao: 'Aprovação automática', detalhe: `Valor de ${fmtMoney(p.valor_bruto)} está dentro da alçada (até ${fmtMoney(LIMITE_APROVACAO_GESTOR)}) — segue direto para o contas a pagar.` });
      await db.criarNota(p, app.usuario, novoStatus, historicoInicial);
      app.notas = await db.carregarNotas();
      closeModalWithFlash(autoAprovada ? 'Nota lançada — dentro da alçada, já liberada direto para o contas a pagar.' : 'Nota lançada. Aguardando aprovação do gestor.');
    } catch (e) {
      alert('Erro ao salvar: ' + e.message);
      btnSalvarNota.disabled = false; btnSalvarNota.textContent = 'Lançar nota no Central CP';
    }
  };

  const btnSalvarRascunho = document.getElementById('btn-salvar-rascunho');
  if (btnSalvarRascunho) btnSalvarRascunho.onclick = async () => {
    const p = coletarPayload();
    btnSalvarRascunho.disabled = true; btnSalvarRascunho.textContent = 'Salvando...';
    try {
      if (app.state.modal === 'editar_reenviar' && app.state.modalData) {
        await db.atualizarNota(app.state.modalData, p, app.usuario, 'rascunho', { acao: 'Rascunho atualizado' });
        app.notas = await db.carregarNotas();
        closeModalWithFlash('Rascunho atualizado.');
        return;
      }
      await db.criarNota(p, app.usuario, 'rascunho', [{ acao: 'Rascunho criado' }]);
      app.notas = await db.carregarNotas();
      closeModalWithFlash('Rascunho salvo. Você pode continuar de onde parou em "Rascunhos".');
    } catch (e) {
      alert('Erro ao salvar rascunho: ' + e.message);
      btnSalvarRascunho.disabled = false; btnSalvarRascunho.textContent = 'Salvar como rascunho';
    }
  };

  bind('confirmar-aprovar', async () => {
    try { await db.aprovarNota(app.state.modalData, app.usuario, document.getElementById('input-comentario').value); app.notas = await db.carregarNotas(); closeModalWithFlash('Nota aprovada e liberada para o contas a pagar.'); }
    catch (e) { alert('Erro: ' + e.message); }
  });
  bind('confirmar-reprovar', async () => {
    const motivo = document.getElementById('input-motivo').value.trim();
    if (!motivo) return;
    try { await db.reprovarNota(app.state.modalData, app.usuario, motivo); app.notas = await db.carregarNotas(); closeModalWithFlash('Nota devolvida ao departamento com o motivo.'); }
    catch (e) { alert('Erro: ' + e.message); }
  });
  bind('confirmar-lancar', async () => {
    const chamado = document.getElementById('input-chamado').value.trim();
    if (!chamado) return;
    try { await db.lancarNoGroup(app.state.modalData, app.usuario, chamado); app.notas = await db.carregarNotas(); closeModalWithFlash('Lançamento feito e chamado aberto no CSC.'); }
    catch (e) { alert('Erro: ' + e.message); }
  });
  bind('confirmar-pagamento', async () => {
    const data = document.getElementById('input-data-pgto').value;
    try { await db.confirmarPagamento(app.state.modalData, app.usuario, data); app.notas = await db.carregarNotas(); closeModalWithFlash('Pagamento confirmado.'); }
    catch (e) { alert('Erro: ' + e.message); }
  });
  bind('confirmar-pendencia', async () => {
    const motivo = document.getElementById('input-motivo-pend').value.trim();
    if (!motivo) return;
    try { await db.marcarPendencia(app.state.modalData, app.usuario, motivo); app.notas = await db.carregarNotas(); closeModalWithFlash('Pendência registrada.'); }
    catch (e) { alert('Erro: ' + e.message); }
  });
  bind('confirmar-resolver', async () => {
    const res = document.getElementById('input-resolucao').value.trim();
    if (!res) return;
    try { await db.resolverPendencia(app.state.modalData, app.usuario, res); app.notas = await db.carregarNotas(); closeModalWithFlash('Pendência resolvida.'); }
    catch (e) { alert('Erro: ' + e.message); }
  });
}

function bind(id, fn) { const el = document.getElementById(id); if (el) el.onclick = fn; }

/* ============================ INIT ============================ */
(async function init() {
  appEl.innerHTML = `<div class="auth-wrap"><p style="color:var(--ink-soft)">Carregando Central CP…</p></div>`;
  const usuario = await sessaoAtual();
  if (usuario) {
    app.usuario = usuario;
    try {
      await carregarTudo();
      app.state.view = defaultViewForRole(usuario.role);
    } catch (e) {
      app.state.flash = 'Erro ao carregar dados: ' + e.message;
    }
  }
  render();
})();
