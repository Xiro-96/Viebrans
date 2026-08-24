/*
 * Offline-Zwischenspeicher.
 *
 * Wichtig: die index.html wird IMMER zuerst aus dem Netz geholt. Wird sie
 * stattdessen aus dem Cache bedient, bekommt der Spieler nach einer neuen
 * Veröffentlichung ewig die alte Fassung — genau das ist hier einmal passiert.
 * Nur die Dateien unter /assets/ tragen einen Inhaltsstempel im Namen und
 * dürfen deshalb bedenkenlos aus dem Cache kommen.
 */
const VERSION = 'v3';
const CACHE = `viebrans-${VERSION}`;
const SHELL = ['./', './index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  // Nicht auf das Schließen aller Tabs warten.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

/** Erst das Netz, bei Ausfall der Zwischenspeicher. */
async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request, { cache: 'no-store' });
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    return (await cache.match(request)) || (await cache.match('./index.html')) || Response.error();
  }
}

/** Erst der Zwischenspeicher — nur für Dateien mit Inhaltsstempel im Namen. */
async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res && res.ok) cache.put(request, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const isDocument = req.mode === 'navigate' || url.pathname.endsWith('.html')
    || url.pathname.endsWith('/');
  if (isDocument) {
    event.respondWith(networkFirst(req));
    return;
  }
  if (url.pathname.includes('/assets/')) {
    event.respondWith(cacheFirst(req));
    return;
  }
  // Alles Übrige (Manifest, Symbol) darf veralten, aber nicht einfrieren.
  event.respondWith(networkFirst(req));
});
