// src/js/events_cadastros.js — tela de Cadastros (fornecedores, plano de contas)
import { app, REGISTRY_DEFS } from './state.js';
import * as db from './db.js';
import { render, restoreFocus } from './app.js';
import { renderFornecedorContasArea } from './ui_cadastros.js';
import { showToast } from './toast.js';

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
    const originalLabel = badd.textContent;
    try {
      if (active === 'fornecedores') {
        const nome = document.getElementById('cadnew-nome').value.trim();
        const cnpj = document.getElementById('cadnew-cnpj').value.trim();
        const municipio = document.getElementById('cadnew-municipio').value.trim();
        const cod_group = document.getElementById('cadnew-cod_group').value.trim();
        if (!nome) { showToast('Informe o nome do fornecedor.'); return; }
        badd.disabled = true; badd.textContent = 'Salvando...';
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
