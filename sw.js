'use strict';
// Keep this name in sync with the offline indicator in index.html.
const CACHE = 'andalucia-2026-09-23-v1';
const BASE = new URL(self.registration.scope);
const INDEX = new URL('index.html', BASE).href;
const ASSETS = ['manifest.webmanifest', 'apple-touch-icon.PNG'].map(p => new URL(p, BASE).href);

async function savePage(response) {
  if (!response.ok || response.redirected || !response.headers.get('content-type')?.includes('text/html')) return;
  const text = await response.clone().text();
  // Never replace the plan with a hosting error or authentication page.
  if (!text.includes('andalucia-progress-v1') || !text.includes('id="app-scroll"')) return;
  const cache = await caches.open(CACHE);
  await cache.put(INDEX, response.clone());
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const response = await fetch(INDEX, {cache: 'no-cache'});
    await savePage(response);
    if (!await (await caches.open(CACHE)).match(INDEX)) throw new Error('Plan was not saved');
    // Later worker versions wait for the existing "Wczytaj nową wersję" button.
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE') event.waitUntil(self.skipWaiting());
});

async function navigate(request) {
  const cache = await caches.open(CACHE);
  const saved = await cache.match(INDEX);
  const network = fetch(request, {cache: 'no-cache'}).then(async response => {
    if (response.ok) {
      // Cache write failure must not make a working online page inaccessible.
      await savePage(response).catch(() => {});
      return response;
    }
    if (response.status === 401 || response.status === 403 || response.redirected) return response;
    if (saved) return saved;
    return response;
  }).catch(error => {
    if (saved) return saved;
    throw error;
  });
  return network;
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== BASE.origin) return;
  if (request.mode === 'navigate' && (url.pathname === BASE.pathname || url.pathname === new URL(INDEX).pathname)) {
    const response = navigate(request);
    event.respondWith(response);
    event.waitUntil(response.then(() => {}).catch(() => {}));
    return;
  }
  // Weather, booking sites and Maps are intentionally not intercepted.
  if (ASSETS.includes(url.origin + url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const response = await fetch(request, {cache: 'no-cache'});
        if (response.ok && !response.redirected) await cache.put(url.origin + url.pathname, response.clone()).catch(() => {});
        return response;
      } catch (error) {
        const saved = await cache.match(url.origin + url.pathname);
        if (saved) return saved;
        throw error;
      }
    })());
  }
});
