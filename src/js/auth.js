// src/js/auth.js
import { supabase } from './supabaseClient.js';

// Cria a conta no Supabase Auth e o perfil correspondente em `usuarios`.
// Retorna { usuario, error }.
export async function cadastrar({ nome, email, password, role, setor }) {
  const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });
  if (authError) return { usuario: null, error: authError.message };
  if (!authData.user) {
    return { usuario: null, error: 'Conta criada, mas é preciso confirmar o e-mail antes de continuar (verifique sua caixa de entrada).' };
  }

  const { data: usuario, error: perfilError } = await supabase
    .from('usuarios')
    .insert({ auth_user_id: authData.user.id, nome, role, setor: role === 'contas_a_pagar' ? null : setor })
    .select()
    .single();

  if (perfilError) return { usuario: null, error: perfilError.message };
  return { usuario, error: null };
}

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
