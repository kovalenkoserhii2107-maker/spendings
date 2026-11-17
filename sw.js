// Service worker: makes the site installable and keeps updates clean.
//
// Every deploy stamps a new BUILD below (tools/stamp.py), so the browser sees a
// changed worker, installs it next to the old one and the page offers "Update".
// The page shell is cached per build; old builds' caches are deleted on activation.
// Pages are fetched network-first (always the latest index when online), versioned
// assets cache-first, data network-first with the last copy kept for offline use.

const BUILD = '__BUILD__';
const SHELL_CACHE = 'shell-' + BUILD;
const DATA_CACHE = 'data-v1';
const SHELL = [
  './',
  'style.css?v=' + BUILD,
  'firebase-config.js?v=' + BUILD,
  'i18n.js?v=' + BUILD,
  'app.js?v=' + BUILD,
  'cloud.js?v=' + BUILD,
  'registry.js?v=' + BUILD,
  'manifest.webmanifest',
  'icon.svg',
  'icons/icon-192.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('shell-') && key !== SHELL_CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

// The page asks for this when the user presses "Update".
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Google, Firebase, the portal: straight to the network

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(url.pathname, { cache: 'no-cache', credentials: 'same-origin' });
        if (res.ok) (await caches.open(SHELL_CACHE)).put('./', res.clone());
        return res;
      } catch (e) {
        return (await caches.match('./', { cacheName: SHELL_CACHE })) || (await caches.match('./')) || Response.error();
      }
    })());
    return;
  }

  if (url.pathname.includes('/data/')) {
    event.respondWith((async () => {
      const key = url.origin + url.pathname; // one offline copy per file, whatever its ?v=
      try {
        const res = await fetch(req);
        if (res.ok) (await caches.open(DATA_CACHE)).put(key, res.clone());
        return res;
      } catch (e) {
        return (await caches.match(key, { cacheName: DATA_CACHE })) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const hit = await caches.match(req);
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok && url.searchParams.has('v')) (await caches.open(SHELL_CACHE)).put(req, res.clone());
    return res;
  })());
});
