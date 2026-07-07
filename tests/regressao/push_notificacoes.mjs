// Web Push (push.js): status de suporte, e o botão "Ativar notificações"
// na sidebar -- só aparece quando o navegador suporta (serviceWorker +
// PushManager + Notification); em jsdom (sem nenhum dos três) o botão nem
// deve existir, o que garante que o resto do app continua funcionando em
// navegadores sem suporte (ver comentário em push.js). Depois disso,
// simula um navegador que SUPORTA (fakes de serviceWorker/PushManager/
// Notification) pra exercitar o fluxo real de assinar/salvar/cancelar/
// remover, incluindo o toggle do botão e a gravação em push_subscricoes
// (ver migration 0022).
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, checarIgual, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { dom, document, erros, supabaseClientMod } = await bootApp(PERFIS.administrador);
const { app } = await import('./app/src/js/state.js');
const push = await import('./app/src/js/push.js');

checar(push.pushSuportado() === false, 'pushSuportado() é false em jsdom (sem serviceWorker/PushManager/Notification)');
checar(!document.getElementById('btn-push-toggle'), 'botão de notificações não aparece quando o navegador não suporta push');

const semSuporte = await push.assinaturaPushAtual();
checar(semSuporte === null, 'assinaturaPushAtual() devolve null sem suporte, sem lançar erro');

let erroInscricao = null;
try { await push.inscreverPush(); } catch (e) { erroInscricao = e; }
checar(!!erroInscricao && /não suporta/.test(erroInscricao.message), 'inscreverPush() recusa com mensagem clara sem suporte');

// A partir daqui, simula um navegador que suporta -- fakes mínimos de
// service worker/push manager/Notification pra exercitar o fluxo real.
let assinaturaAtual = null;
const fakeSubscription = {
  endpoint: 'https://fcm.googleapis.com/fake/endpoint-1',
  toJSON() { return { endpoint: this.endpoint, keys: { p256dh: 'p256dh-fake', auth: 'auth-fake' } }; },
  async unsubscribe() { assinaturaAtual = null; return true; },
};
const fakeRegistration = {
  pushManager: {
    async getSubscription() { return assinaturaAtual; },
    async subscribe() { assinaturaAtual = fakeSubscription; return fakeSubscription; },
  },
};
global.window.PushManager = function FakePushManager() {};
global.Notification = { permission: 'default', async requestPermission() { global.Notification.permission = 'granted'; return 'granted'; } };
global.window.Notification = global.Notification;
dom.window.navigator.serviceWorker = {
  async getRegistration() { return fakeRegistration; },
  ready: Promise.resolve(fakeRegistration),
};

checar(push.pushSuportado() === true, 'pushSuportado() passa a ser true depois de simular o navegador suportando');

app.state.pushSuportado = true;
app.state.pushInscrito = !!(await push.assinaturaPushAtual());
window.__render();
await new Promise(r => setTimeout(r, 20));

checar(!!document.getElementById('btn-push-toggle'), 'botão aparece assim que o navegador passa a suportar push');
checarIgual(document.getElementById('btn-push-toggle').textContent, 'Ativar notificações', 'botão começa mostrando "Ativar notificações" (ainda não inscrito)');

document.getElementById('btn-push-toggle').click();
await new Promise(r => setTimeout(r, 50));

checar(!!assinaturaAtual, 'clicar assina de verdade (subscribe() foi chamado)');
checar(app.state.pushInscrito === true, 'app.state.pushInscrito vira true depois de assinar');
checarIgual(document.getElementById('btn-push-toggle').textContent, 'Notificações ativadas', 'o rótulo do botão troca pra "ativadas"');

const salvos = await supabaseClientMod.supabase.from('push_subscricoes').select('*');
checar(salvos.data.some(s => s.endpoint === fakeSubscription.endpoint), 'a assinatura foi salva em push_subscricoes com o endpoint certo');
checar(salvos.data.find(s => s.endpoint === fakeSubscription.endpoint).usuario_id === PERFIS.administrador.usuarioId, 'a assinatura salva aponta pro usuário logado');

document.getElementById('btn-push-toggle').click();
await new Promise(r => setTimeout(r, 50));

checar(app.state.pushInscrito === false, 'clicar de novo cancela a inscrição (toggle)');
checarIgual(document.getElementById('btn-push-toggle').textContent, 'Ativar notificações', 'o rótulo volta pra "Ativar notificações" depois de cancelar');

const depoisDeCancelar = await supabaseClientMod.supabase.from('push_subscricoes').select('*');
checar(!depoisDeCancelar.data.some(s => s.endpoint === fakeSubscription.endpoint), 'a assinatura foi removida do banco (mock) ao cancelar');

checarSemErrosNaoTratados(erros, 'push_notificacoes');
relatorioFinal('push_notificacoes');
