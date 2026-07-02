// src/js/auth.js
import { supabase } from './supabaseClient.js';

// Não existe mais cadastro público — cadastro fechado, só um administrador
// cria conta (tela Cadastros → Usuários, que chama a Edge Function
// "convidar-usuario"). Ver src/js/db.js#convidarUsuario.

// Faz login e carrega o perfil de `usuarios`. Retorna { usuario, error }.
export async function entrar({ email, password }) {
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
  if (authError) return { usuario: null, error: 'E-mail ou senha incorretos.' };

  const { data: usuario, error: perfilError } = await supabase
    .from('usuarios')
    .select('*')
    .eq('auth_user_id', authData.user.id)
    .single();

  if (perfilError) return { usuario: null, error: 'Login funcionou, mas não encontramos o perfil deste usuário na tabela "usuarios".' };
  return { usuario, error: null };
}

export async function sair() {
  await supabase.auth.signOut();
}

// Manda o e-mail de "definir/redefinir senha" — usado tanto por quem
// esqueceu a senha quanto, na prática, pela primeira vez que um usuário
// convidado pelo administrador entra (a conta nasce sem senha conhecida).
export async function recuperarSenha(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
  if (error) return { error: error.message };
  return { error: null };
}

// Chamado na tela que abre depois do link do e-mail (evento PASSWORD_RECOVERY).
export async function definirNovaSenha(password) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };
  return { error: null };
}

// O Supabase processa o link de recuperação de senha (fragmento da URL) no
// carregamento da página e dispara esse evento — é assim que a tela de
// "defina sua senha" sabe quando aparecer, em vez de tentar parsear a URL.
export function aoRecuperarSenha(callback) {
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') callback();
  });
}

// Usado no carregamento da página: se já existe uma sessão válida, recupera o perfil.
export async function sessaoAtual() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('*')
    .eq('auth_user_id', session.user.id)
    .single();
  return usuario || null;
}
