// src/js/push.js
//
// Web Push: alternativa ao alerta por e-mail que não depende de DNS nem
// do provedor de e-mail (Resend, sem domínio verificado, só entrega pro
// próprio endereço da conta -- não pra uma lista de destinatários, ver
// migration 0022). Cada navegador assina por conta própria (endpoint +
// chaves); a Edge Function manda o push direto pro serviço do navegador.
//
// 'serviceWorker'/'PushManager'/'Notification' não existem em jsdom (ver
// pushSuportado() abaixo) -- todo o resto deste módulo vira um no-op
// seguro em teste, sem precisar de mock nenhum.
import { VAPID_PUBLIC_KEY } from './config.js';

export function pushSuportado() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

// Não usa `serviceWorker.ready` de propósito -- ready espera até um
// service worker ficar ativo, e ISSO pode nunca acontecer (registro
// falhou, navegador bloqueou, etc.), travando quem só quer *consultar* o
// status atual. getRegistration() resolve na hora, com ou sem registro.
export async function assinaturaPushAtual() {
  if (!pushSuportado()) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return null;
  return registration.pushManager.getSubscription();
}

// Aqui sim vale esperar o service worker ficar pronto (`ready`) -- isso só
// roda a partir de um clique explícito da pessoa, então um instante de
// espera na primeira vez (enquanto o SW ainda está registrando) é aceitável.
export async function inscreverPush() {
  if (!pushSuportado()) throw new Error('Este navegador não suporta notificações push.');
  if (Notification.permission === 'denied') throw new Error('Notificações bloqueadas nas configurações do navegador.');

  const registration = await navigator.serviceWorker.ready;
  const existente = await registration.pushManager.getSubscription();
  if (existente) return existente;

  const permissao = await Notification.requestPermission();
  if (permissao !== 'granted') throw new Error('Permissão de notificação não concedida.');

  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  });
}

// Devolve a assinatura que acabou de cancelar (o endpoint dela ainda é
// legível depois do unsubscribe() -- é isso que db.js usa pra remover a
// linha correspondente em push_subscricoes).
export async function cancelarPush() {
  const sub = await assinaturaPushAtual();
  if (sub) await sub.unsubscribe();
  return sub;
}
