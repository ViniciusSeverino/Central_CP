// supabase/functions/convidar-usuario/index.ts
//
// Único jeito de criar/desativar/reativar um usuário no Central CP —
// cadastro público fechado de propósito. Só quem já é 'administrador'
// consegue chamar isso com sucesso (checado aqui dentro, não só no RLS,
// porque criar linha em auth.users precisa da service_role key, que
// ignora RLS por definição).
//
// Deploy: feito via MCP/CLI do Supabase, não precisa rodar nada manual
// além de configurar os secrets do projeto (Project Settings → Edge
// Functions → Secrets): SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já vêm
// automáticos em todo projeto Supabase, não precisa configurar.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const ROLES_SEM_SETOR = ['contas_a_pagar', 'gerente_financeiro', 'administrador'];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Não autenticado.' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  const admin = createClient(supabaseUrl, serviceKey);
  const chamadorClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: userErr } = await chamadorClient.auth.getUser();
  if (userErr || !user) return json({ error: 'Sessão inválida.' }, 401);

  const { data: chamador, error: chamadorErr } = await admin
    .from('usuarios').select('*').eq('auth_user_id', user.id).single();
  if (chamadorErr || !chamador || chamador.role !== 'administrador' || !chamador.ativo) {
    return json({ error: 'Só administradores podem gerenciar usuários.' }, 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Corpo da requisição inválido.' }, 400);
  }

  if (body.action === 'convidar') {
    const nome = String(body.nome || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const role = String(body.role || '');
    const setor = body.setor ? String(body.setor) : null;

    if (!nome || !email || !role) {
      return json({ error: 'Preencha nome, e-mail e perfil.' }, 400);
    }
    if (!ROLES_SEM_SETOR.includes(role) && !setor) {
      return json({ error: 'Setor é obrigatório para esse perfil.' }, 400);
    }

    const senhaTemporaria = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email, password: senhaTemporaria, email_confirm: true,
    });
    if (authError) return json({ error: authError.message }, 400);

    const { data: usuario, error: perfilError } = await admin.from('usuarios').insert({
      auth_user_id: authData.user.id, nome, role,
      setor: ROLES_SEM_SETOR.includes(role) ? null : setor,
      email, ativo: true,
    }).select().single();

    if (perfilError) {
      // desfaz a conta de Auth criada — não deixa órfão sem perfil
      await admin.auth.admin.deleteUser(authData.user.id);
      return json({ error: perfilError.message }, 400);
    }

    // Manda link de "defina sua senha" — o convidado nunca fica sabendo da
    // senha temporária aleatória, só usa esse link.
    const { error: resetErr } = await admin.auth.resetPasswordForEmail(email);

    return json({ usuario, avisoEmail: resetErr ? resetErr.message : null });
  }

  if (body.action === 'desativar' || body.action === 'reativar') {
    const usuarioId = String(body.usuarioId || '');
    if (!usuarioId) return json({ error: 'Informe o usuário.' }, 400);
    if (usuarioId === chamador.id) return json({ error: 'Você não pode desativar a própria conta.' }, 400);

    const ativo = body.action === 'reativar';
    const { data: alvo, error: alvoErr } = await admin.from('usuarios').select('*').eq('id', usuarioId).single();
    if (alvoErr || !alvo) return json({ error: 'Usuário não encontrado.' }, 404);

    const { error: updErr } = await admin.from('usuarios').update({ ativo }).eq('id', usuarioId);
    if (updErr) return json({ error: updErr.message }, 400);

    // Bane (ou desbane) a sessão de Auth de verdade — sem isso, um token já
    // emitido continuaria válido até expirar mesmo com ativo=false.
    await admin.auth.admin.updateUserById(alvo.auth_user_id, {
      ban_duration: ativo ? 'none' : '876000h',
    });

    return json({ ok: true });
  }

  return json({ error: 'Ação desconhecida.' }, 400);
});
