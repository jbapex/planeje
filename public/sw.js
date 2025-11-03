/* eslint-disable no-restricted-globals */

const CACHE_NAME = 'jb-apex-cache-v5';
const DYNAMIC_CACHE_NAME = 'jb-apex-dynamic-cache-v5';

// Adicionando a rota do chat-launcher e os assets principais
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/chat-launcher',
  '/icon-192x192.png',
  '/icon-512x512.png',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Cache estático aberto');
        // Usamos addAll que é atômico, se um falhar, todos falham.
        // O `catch` é para depuração, para saber qual recurso falhou ao ser cacheado.
        return cache.addAll(urlsToCache).catch(error => {
          console.error('Falha ao cachear urlsToCache:', error);
        });
      })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== DYNAMIC_CACHE_NAME) {
            console.log('Deletando cache antigo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Ignora completamente as requisições para APIs de terceiros para garantir dados sempre atualizados.
  if (url.hostname.includes('supabase.co') || url.hostname.includes('openai.com')) {
    event.respondWith(fetch(event.request));
    return;
  }
  
  // Para requisições de navegação (HTML), usa a estratégia Network falling back to Cache.
  // Isso garante que o usuário sempre veja a versão mais recente se estiver online.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(fetchRes => {
          // Clona a resposta para poder colocar no cache e retornar ao navegador
          const resClone = fetchRes.clone();
          caches.open(DYNAMIC_CACHE_NAME).then(cache => {
            cache.put(event.request.url, resClone);
          });
          return fetchRes;
        })
        .catch(() => {
            // Se a rede falhar, busca no cache.
            // Se a rota específica não estiver no cache, retorna o index.html principal como fallback.
            return caches.match(event.request).then(cacheRes => {
                return cacheRes || caches.match('/index.html');
            });
        })
    );
    return;
  }

  // Para outros recursos (CSS, JS, Imagens), usa a estratégia Cache falling back to Network (Cache-First).
  // É mais rápido, pois serve do cache primeiro.
  event.respondWith(
    caches.match(event.request)
      .then((cacheRes) => {
        return cacheRes || fetch(event.request).then((fetchRes) => {
          // Se não estiver no cache, busca na rede, armazena no cache dinâmico e retorna.
          return caches.open(DYNAMIC_CACHE_NAME).then((cache) => {
            cache.put(event.request.url, fetchRes.clone());
            return fetchRes;
          });
        });
      })
  );
});