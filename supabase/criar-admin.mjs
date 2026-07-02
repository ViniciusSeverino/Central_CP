// supabase/criar-admin.mjs
//
// Cria a PRIMEIRA conta de administrador (bootstrap). Depois disso, todo
// resto de convite de usuário passa a ser feito pela Edge Function
// "convidar-usuario" direto na tela de Usuários do app — este script só
// existe pra resolver o problema de "ovo e galinha" (cadastro fechado,
// então ninguém consegue criar a primeira conta pelo app).
//
// Uso:
//   1. npm install
//   2. copie .env.example para .env e preencha SUPABASE_URL e
//      SUPABASE_SERVICE_ROLE_KEY (Project Settings → API → service_role —
//      NUNCA use essa chave no frontend, só aqui, local, uma vez)
//   3. node supabase/criar-admin.mjs "Seu Nome" seu@email.com "SenhaTemporaria123"
//   4. Troque a senha no primeiro login (ainda não existe tela de troca de
//      senha no app — pode fazer via supabase.auth.updateUser no console,
//      ou eu adiciono essa tela se você quiser).

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Faltam SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY no .env');
  process.exit(1);
}

const [, , nome, email, senha] = process.argv;
if (!nome || !email || !senha) {
  console.error('Uso: node supabase/criar-admin.mjs "Nome Completo" email@dominio.com "SenhaTemporaria"');
  process.exit(1);
}
if (senha.length < 6) {
  console.error('A senha precisa ter pelo menos 6 caracteres.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

async function main() {
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email, password: senha, email_confirm: true,
  });
  if (authError) throw new Error('Erro criando usuário no Auth: ' + authError.message);

  const { data: usuario, error: perfilError } = await supabase.from('usuarios').insert({
    auth_user_id: authData.user.id, nome, role: 'administrador', setor: null, email, ativo: true,
  }).select().single();
  if (perfilError) throw new Error('Erro criando perfil em usuarios: ' + perfilError.message);

  console.log('Administrador criado com sucesso:');
  console.log('  nome:', usuario.nome);
  console.log('  email:', email);
  console.log('  id:', usuario.id);
  console.log('\nJá pode entrar no app com esse e-mail e senha.');
}

main().catch(err => {
  console.error('\nFALHOU:', err.message);
  process.exit(1);
});
