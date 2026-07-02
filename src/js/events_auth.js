// src/js/events_auth.js — eventos da tela de login/recuperação de senha
import { app } from './state.js';
import { entrar, recuperarSenha, definirNovaSenha } from './auth.js';
import { setAuthTab, setAuthError, setAuthInfo } from './ui.js';
import { render, carregarTudo } from './app.js';

export function defaultViewForRole(role) {
  if (role === 'departamento') return 'minhas';
  if (role === 'gerente_financeiro' || role === 'administrador') return 'aprovacao';
  return 'lancar_group';
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
    b.onclick = (e) => { e.preventDefault(); setAuthTab(b.dataset.tab); setAuthError(''); render(); };
  });

  const doLogin = async () => {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    if (!email || !password) { setAuthError('Preencha e-mail e senha.'); render(); return; }
    const btn = document.getElementById('btn-do-login');
    if (btn) { btn.disabled = true; btn.textContent = 'Entrando...'; }
    const { usuario, error } = await entrar({ email, password });
    if (error) { setAuthError(error); render(); return; }
    if (!usuario.ativo) { setAuthError('Sua conta está desativada. Fale com um administrador.'); render(); return; }
    app.usuario = usuario;
    await carregarTudo();
    app.state.view = defaultViewForRole(usuario.role);
    app.state.flash = `Bem-vindo(a), ${usuario.nome.split(' ')[0]}.`;
    render();
  };

  const doRecuperar = async () => {
    const email = document.getElementById('recuperar-email').value.trim();
    if (!email) { setAuthError('Informe o e-mail.'); render(); return; }
    const btn = document.getElementById('btn-do-recuperar');
    if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }
    const { error } = await recuperarSenha(email);
    if (error) { setAuthError(error); render(); return; }
    setAuthTab('login');
    setAuthInfo('Se esse e-mail estiver cadastrado, um link pra definir a senha foi enviado. Confira sua caixa de entrada.');
    render();
  };

  const bl = document.getElementById('btn-do-login');
  if (bl) bl.onclick = doLogin;
  const br = document.getElementById('btn-do-recuperar');
  if (br) br.onclick = doRecuperar;
  enterTriggers('box-login', doLogin);
  enterTriggers('box-recuperar', doRecuperar);
}

// Tela que abre depois do link do e-mail (PASSWORD_RECOVERY) — define a
// senha e, se já tiver uma sessão válida (o Supabase já loga automático
// nesse fluxo), segue direto pro app.
export function attachDefinirSenhaHandlers() {
  const doDefinir = async () => {
    const senha = document.getElementById('nova-senha').value;
    const confirma = document.getElementById('nova-senha-confirma').value;
    if (!senha || senha.length < 6) { setAuthError('A senha precisa ter pelo menos 6 caracteres.'); render(); return; }
    if (senha !== confirma) { setAuthError('As senhas não coincidem.'); render(); return; }
    const btn = document.getElementById('btn-definir-senha');
    if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }
    const { error } = await definirNovaSenha(senha);
    if (error) { setAuthError(error); render(); return; }
    app.state.recuperandoSenha = false;
    window.location.hash = '';
    render();
  };
  const btn = document.getElementById('btn-definir-senha');
  if (btn) btn.onclick = doDefinir;
  enterTriggers('box-login', doDefinir); // no-op se não existir, mantém padrão
  const confirma = document.getElementById('nova-senha-confirma');
  if (confirma) confirma.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); doDefinir(); } };
}
