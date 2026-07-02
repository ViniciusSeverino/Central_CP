// supabase/functions/notificar-movimentacao/index.ts
//
// Disparada por um trigger de banco (AFTER INSERT em nota_historico, via
// pg_net — ver supabase/schema.sql) a cada movimentação de qualquer nota.
// Decide quem é o responsável pela etapa ATUAL da nota (depois da
// movimentação) e manda um e-mail via Resend.
//
// Precisa do secret RESEND_API_KEY configurado no projeto (Project
// Settings → Edge Functions → Secrets). Sem ele, a função responde 200
// sem mandar e-mail — não quebra o fluxo de notas, só fica "desligada"
// até a chave existir.

import { createClient } from 'jsr:@supabase/supabase-js@2';

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

  let destinatarios: string[] = [];
  if (alvo.usuarioAlvoId) {
    const { data: u } = await admin.from('usuarios').select('email, ativo').eq('id', alvo.usuarioAlvoId).single();
    if (u && u.ativo && u.email) destinatarios = [u.email];
  } else if (alvo.roles) {
    const { data: lista } = await admin.from('usuarios').select('email, ativo').in('role', alvo.roles);
    destinatarios = (lista || []).filter((u: any) => u.ativo && u.email).map((u: any) => u.email);
  }

  if (destinatarios.length === 0) return json({ ok: true, skip: 'sem destinatário com e-mail cadastrado' });
  if (!resendKey) return json({ ok: false, skip: 'RESEND_API_KEY não configurada — notificação desligada por enquanto' });

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
      to: destinatarios,
      subject: assunto,
      html,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    console.error('Resend falhou:', resp.status, errText);
    // 200 de propósito — não queremos que o pg_net fique re-tentando
    // indefinidamente por um problema no provedor de e-mail.
    return json({ ok: false, error: errText });
  }

  return json({ ok: true, destinatarios: destinatarios.length });
});
