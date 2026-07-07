// supabase/functions/_shared/push.ts
//
// Envio de Web Push (VAPID), compartilhado entre notificar-movimentacao e
// alerta-armazenamento -- mesma lógica de buscar assinaturas por usuário e
// mandar o push, usada pelas duas. Ver migration 0022 pro porquê disso
// existir: e-mail via Resend sem domínio verificado só entrega pro próprio
// endereço da conta, então o push é quem realmente cobre todo mundo.
//
// Precisa dos secrets VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY (gerados uma vez
// com `npx web-push generate-vapid-keys`, configurados no projeto). Sem
// eles, enviarPushParaUsuarios() simplesmente não manda nada (mesma
// filosofia do RESEND_API_KEY ausente: "desligado", não erro).
import webpush from 'npm:web-push@3.6.7';

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY');
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY');
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:suporte@boulevardshoppingbauru.com.br';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

export function pushConfigurado(): boolean {
  return !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
}

interface PayloadPush {
  titulo: string;
  corpo: string;
  url?: string;
}

// admin: client Supabase com service_role (ignora RLS -- precisa ler
// assinatura de qualquer usuário, não só a própria). usuarioIds: quem deve
// receber, já filtrado por role/alvo (mesmo critério do e-mail). Devolve
// quantas assinaturas realmente receberam o push (0 se push não
// configurado, sem usuário alvo, ou ninguém com assinatura ainda).
export async function enviarPushParaUsuarios(
  admin: any,
  usuarioIds: string[],
  payload: PayloadPush,
): Promise<number> {
  if (!pushConfigurado() || usuarioIds.length === 0) return 0;

  const { data: subs } = await admin
    .from('push_subscricoes')
    .select('id, endpoint, p256dh, auth')
    .in('usuario_id', usuarioIds);
  if (!subs || subs.length === 0) return 0;

  const corpoJson = JSON.stringify({ title: payload.titulo, body: payload.corpo, url: payload.url || '' });
  let enviados = 0;
  await Promise.all(subs.map(async (s: any) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, corpoJson);
      enviados++;
    } catch (err: any) {
      // 404/410 = o navegador cancelou a assinatura (desinstalou o app,
      // limpou dados, etc.) -- remove daqui pra não tentar de novo pra
      // sempre num endpoint morto.
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await admin.from('push_subscricoes').delete().eq('id', s.id);
      } else {
        console.error('Push falhou:', s.id, err?.message || err);
      }
    }
  }));
  return enviados;
}
