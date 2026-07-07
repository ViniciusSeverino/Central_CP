// supabase/functions/notificar-movimentacao/index.ts
//
// Disparada por um trigger de banco (AFTER INSERT em nota_historico, via
// pg_net — ver supabase/schema.sql) a cada movimentação de qualquer nota.
// Decide quem é o responsável pela etapa ATUAL da nota (depois da
// movimentação) e avisa por push (Web Push) e por e-mail via Resend.
//
// Push funciona pra qualquer destinatário assim que os secrets
// VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY existirem (ver _shared/push.ts) --
// não depende de DNS nem de provedor de e-mail. RESEND_API_KEY continua
// em paralelo (Project Settings → Edge Functions → Secrets), mas sem
// domínio verificado só entrega pro próprio endereço da conta Resend, não
// pra lista nenhuma de destinatários -- por isso o push é quem cobre todo
// mundo de verdade. Sem nenhum dos dois secrets configurado, a função
// responde 200 sem mandar nada — não quebra o fluxo de notas, só fica
// "desligada" até os secrets existirem.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { enviarPushParaUsuarios } from '../_shared/push.ts';

const APROVADOR_ROLES = ['administrador', 'gerente_financeiro'];
const CP_ROLES = ['administrador', 'gerente_financeiro', 'contas_a_pagar'];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function contextoPorEstado(nota: Record<string, any>): { roles?: string[]; usuarioAlvoId?: string; contexto: string } | null {
  if (nota.pendente) return { usuarioAlvoId: nota.criado_por, contexto: 'tem uma pendência para você corrigir' };
  switch (nota.status) {
    case 'lancado': return { roles: APROVADOR_ROLES, contexto: 'está aguardando aprovação' };
    case 'aprovado': return { roles: CP_ROLES, contexto: 'está pronta para lançar no Group' };
    case 'lancado_no_group': return { roles: CP_ROLES, contexto: 'está pronta para abrir o chamado no Acelerato' };
    case 'chamado_aberto': return { roles: CP_ROLES, contexto: 'está aguardando validação do CSC' };
    case 'validado_csc': return { roles: CP_ROLES, contexto: 'está pronta para confirmar o pagamento' };
    case 'pago': return { usuarioAlvoId: nota.criado_por, contexto: 'foi paga' };
    default: return null; // rascunho — ninguém precisa ser notificado ainda
  }
}

Deno.serve(async (req) => {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Corpo da requisição inválido.' }, 400);
  }
  const historicoId = String(body.historico_id || '');
  if (!historicoId) return json({ error: 'historico_id é obrigatório.' }, 400);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const resendKey = Deno.env.get('RESEND_API_KEY');
  const appUrl = Deno.env.get('APP_URL') || '';
  const admin = createClient(supabaseUrl, serviceKey);

  const { data: historico } = await admin.from('nota_historico').select('*').eq('id', historicoId).single();
  if (!historico) return json({ ok: false, skip: 'histórico não encontrado' });

  const { data: nota } = await admin.from('notas').select('*').eq('id', historico.nota_id).single();
  if (!nota) return json({ ok: false, skip: 'nota não encontrada' });

  const alvo = contextoPorEstado(nota);
  if (!alvo) return json({ ok: true, skip: 'sem destinatário para este estado (ex: rascunho)' });

  let destinatariosUsuarios: { id: string; email: string | null }[] = [];
  if (alvo.usuarioAlvoId) {
    const { data: u } = await admin.from('usuarios').select('id, email, ativo').eq('id', alvo.usuarioAlvoId).single();
    if (u && u.ativo) destinatariosUsuarios = [u];
  } else if (alvo.roles) {
    const { data: lista } = await admin.from('usuarios').select('id, email, ativo').in('role', alvo.roles);
    destinatariosUsuarios = (lista || []).filter((u: any) => u.ativo);
  }

  const usuarioIds = destinatariosUsuarios.map((u) => u.id);
  const destinatariosEmail = destinatariosUsuarios.filter((u) => u.email).map((u) => u.email as string);

  const enviadosPush = await enviarPushParaUsuarios(admin, usuarioIds, {
    titulo: `NF ${nota.numero_nota || '—'} ${alvo.contexto}`,
    corpo: `${historico.acao}${historico.detalhe ? ' — ' + historico.detalhe : ''}`,
    url: appUrl,
  });

  if (destinatariosEmail.length === 0) return json({ ok: true, skip: 'sem destinatário com e-mail cadastrado', push: enviadosPush });
  if (!resendKey) return json({ ok: enviadosPush > 0, skip: 'RESEND_API_KEY não configurada — e-mail desligado por enquanto', push: enviadosPush });

  const valorFmt = (Number(nota.valor_bruto) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const assunto = `Central CP — NF ${nota.numero_nota || '—'} ${alvo.contexto}`;
  const html = `
    <p><strong>${historico.acao}</strong>${historico.detalhe ? ' — ' + historico.detalhe : ''}</p>
    <p>Nota nº <strong>${nota.numero_nota || '—'}</strong> · Valor ${valorFmt}</p>
    <p>Esta nota ${alvo.contexto}.</p>
    ${appUrl ? `<p><a href="${appUrl}">Abrir no Central CP</a></p>` : ''}
  `;

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: Deno.env.get('RESEND_FROM') || 'Central CP <onboarding@resend.dev>',
      to: destinatariosEmail,
      subject: assunto,
      html,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    console.error('Resend falhou:', resp.status, errText);
    // 200 de propósito — não queremos que o pg_net fique re-tentando
    // indefinidamente por um problema no provedor de e-mail (o push, se
    // configurado, já foi entregue de qualquer forma).
    return json({ ok: enviadosPush > 0, error: errText, push: enviadosPush });
  }

  return json({ ok: true, destinatarios: destinatariosEmail.length, push: enviadosPush });
});
