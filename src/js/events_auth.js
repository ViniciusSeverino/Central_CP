// src/js/events_auth.js — eventos da tela de login/cadastro
import { app } from './state.js';
import { entrar, cadastrar } from './auth.js';
import { setAuthTab, setAuthError } from './ui.js';
import { render, carregarTudo } from './app.js';

export function defaultViewForRole(role) {
  if (role === 'departamento') return 'minhas';
  if (role === 'gestor') return 'aprovacao';
  return 'fila_lancar';
}

function enterTriggers(containerId, fn) {
  const box = document.getElementById(containerId);
  if (!box) return;
  box.querySelectorAll('input').forEach(inp => {
    inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); fn(); } };
  });
}

export function attachAuthHandlers() {
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
    const btn = document.getElementById('btn-do-login');
    if (btn) { btn.disabled = true; btn.textContent = 'Entrando...'; }
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
    const btn = document.getElementById('btn-do-cadastro');
    if (btn) { btn.disabled = true; btn.textContent = 'Criando conta...'; }
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
