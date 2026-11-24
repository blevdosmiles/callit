/* CallIt! · fonctionne hors connexion (salons, boutiques).
   Coquille de l'appli : en cache. Données : réseau d'abord, sinon cache. Images des cartes : cache d'abord. */
const V = 'callit-v1';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'data/cards.json', 'data/rates.json'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V && k !== 'callit-img').map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname === 'assets.tcgdex.net') {
    e.respondWith(caches.open('callit-img').then(async c => { const hit = await c.match(req); if (hit) return hit; const r = await fetch(req); if (r.ok) c.put(req, r.clone()); return r; }));
  } else if (url.origin === location.origin || url.hostname.endsWith('gstatic.com') || url.hostname === 'fonts.googleapis.com') {
    // On sert la version en cache tout de suite et on la met à jour en arrière-plan
    e.respondWith(caches.open(V).then(async c => {
      const hit = await c.match(req, { ignoreSearch: url.origin === location.origin });
      const net = fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => hit || c.match('index.html'));
      return hit || net;
    }));
  }
});
