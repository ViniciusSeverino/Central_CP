// tests/regressao/lib/boot.mjs
//
// Sobe uma instância isolada do app (jsdom + mock do Supabase) num
// processo Node -- um processo por "sessão" (um perfil logado), porque
// reimportar módulos ES com estado global dentro do MESMO processo faz o
// Node cachear os singletons e as sessões vazam uma na outra (já
// descoberto e documentado durante o desenvolvimento). Cada arquivo de
// teste chama bootApp() uma única vez.
import { JSDOM } from 'jsdom';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appDir = join(__dirname, '..', 'app');

const UA_MOBILE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

export async function bootApp({ authUserId, email, mobile = false } = {}) {
  const html = readFileSync(join(appDir, 'index.html'), 'utf8');
  const dom = new JSDOM(html, {
    url: 'http://local.test/index.html',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    resources: mobile ? { userAgent: UA_MOBILE } : 'usable',
  });

  global.window = dom.window;
  global.document = dom.window.document;
  global.HTMLElement = dom.window.HTMLElement;
  global.Blob = dom.window.Blob;
  global.URL = dom.window.URL;
  global.requestAnimationFrame = dom.window.requestAnimationFrame || ((cb) => setTimeout(cb, 0));
  // jsdom não implementa confirm()/alert() de verdade ("Not implemented",
  // devolve undefined) -- default é aceitar, cada teste que precisa
  // simular "cancelar" reatribui dom.window.confirm = () => false antes.
  dom.window.confirm = () => true;
  global.confirm = (...args) => dom.window.confirm(...args);
  // app.js checa "'serviceWorker' in navigator" -- sempre precisa de um
  // navigator de verdade (o de jsdom), não só no boot mobile. Em algumas
  // versões do Node (21+) existe um global.navigator embutido que mascara
  // a ausência disso localmente, mas trava em Node 20 (usado no CI) com
  // "navigator is not defined" -- por isso sempre sobrescreve, nunca só
  // condicional a `mobile`.
  Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true });

  const erros = [];
  dom.window.addEventListener('error', (e) => erros.push(e.error ? (e.error.stack || e.error.message) : e.message));

  const mod = await import(join(appDir, 'src', 'js', 'supabaseClient.js'));
  if (authUserId) mod.__setCurrentUser({ id: authUserId, email });

  await import(join(appDir, 'src', 'js', 'app.js'));
  await esperar(300);

  return { dom, document: dom.window.document, erros, supabaseClientMod: mod };
}

export function esperar(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Ids/e-mails fixos dos usuários de teste (ver mocks/supabaseClient.js) --
// centralizado aqui pra não espalhar strings mágicas pelos 40+ arquivos.
export const PERFIS = {
  departamento: { authUserId: 'auth-1', email: 'dept@central-cp.local', usuarioId: 'u-dept-1' },
  departamentoOperacoes: { authUserId: 'auth-dept-2', email: 'dept2@central-cp.local', usuarioId: 'u-dept-2' },
  departamentoRecebedor: { authUserId: 'auth-dept-recebedor-1', email: 'recebedor@central-cp.local', usuarioId: 'u-dept-recebedor-1' },
  contasAPagar: { authUserId: 'auth-cp-1', email: 'cp@central-cp.local', usuarioId: 'u-cp-1' },
  gerenteFinanceiro: { authUserId: 'auth-gerente-1', email: 'gerente@central-cp.local', usuarioId: 'u-gerente-1' },
  administrador: { authUserId: 'auth-admin-1', email: 'admin@central-cp.local', usuarioId: 'u-admin-1' },
  departamentoFerias: { authUserId: 'auth-dept-ferias-1', email: 'ferias@central-cp.local', usuarioId: 'u-dept-ferias-1' },
  delegadoAtiva: { authUserId: 'auth-delegado-ativa', email: 'delegado-ativa@central-cp.local', usuarioId: 'u-delegado-ativa' },
  delegadoFutura: { authUserId: 'auth-delegado-futura', email: 'delegado-futura@central-cp.local', usuarioId: 'u-delegado-futura' },
  delegadoExpirada: { authUserId: 'auth-delegado-expirada', email: 'delegado-expirada@central-cp.local', usuarioId: 'u-delegado-expirada' },
  delegadoRevogada: { authUserId: 'auth-delegado-revogada', email: 'delegado-revogada@central-cp.local', usuarioId: 'u-delegado-revogada' },
};
