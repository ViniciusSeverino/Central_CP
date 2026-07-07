// sw.js — Service worker do Central CP (só pra habilitar "instalar como
// app"/tela cheia; não é uma estratégia de app offline).
//
// Contas a pagar é dado que precisa estar sempre atualizado — status de
// aprovação, pendências etc. mudam o tempo todo. Por isso a estratégia é
// deliberadamente conservadora:
//   - só intercepta GET do PRÓPRIO site (mesma origem) — html/css/js/ícones;
//   - Supabase (API/Storage) e os CDNs externos (exceljs/jszip/pdf-lib) NUNCA
//     passam por aqui, sempre direto na rede, então nunca servimos dado ou
//     código de terceiro desatualizado;
//   - "network first": tenta a rede sempre primeiro (pega a versão mais
//     nova do app); o cache só entra se a rede falhar (o app ainda abre
//     numa conexão ruim/momentaneamente offline).
const CACHE_NAME = 'central-cp-shell-v1';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './src/css/styles.css',
  './src/css/mobile.css',
  './src/icons/icon-192.png',
  './src/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch(() => {}) // não trava a instalação se algum item falhar (ex: 1a carga offline)
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((nomes) => Promise.all(nomes.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        const copia = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copia));
        return res;
      })
      .catch(() => caches.match(req))
  );
});

// Web Push (ver src/js/push.js e supabase/functions/_shared/push.ts) --
// o payload chega como JSON simples ({ title, body, url }), sem depender
// de nenhum outro módulo do app (o service worker roda isolado, sem
// import dos outros arquivos de src/js/).
self.addEventListener('push', (event) => {
  let dados = { title: 'Central CP', body: 'Você tem uma atualização.', url: './' };
  try { dados = { ...dados, ...event.data.json() }; } catch { /* payload vazio/ilegível -- usa o texto padrão acima */ }

  event.waitUntil(
    self.registration.showNotification(dados.title, {
      body: dados.body,
      icon: './src/icons/icon-192.png',
      badge: './src/icons/icon-192.png',
      data: { url: dados.url || './' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || './';
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
