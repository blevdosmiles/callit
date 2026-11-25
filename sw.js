/* CallIt! · fonctionne hors connexion (salons, boutiques).
   Coquille de l'appli : en cache. Données : réseau d'abord, sinon cache. Images des cartes : cache d'abord. */
const V = 'callit-v9';
const SHELL = ['./', 'index.html', 'styles.css', 'i18n.js', 'app.js', 'live.js', 'live.css', 'redresse.js', 'redresse.css', 'voyage.js', 'voyage.css', 'encheres.js', 'encheres.css', 'vendre.js', 'vendre.css', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'data/cards.json', 'data/rates.json'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V && k !== 'callit-img' && k !== 'callit-partage').map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request;
  // Photo partagée depuis la Galerie (« Partager → CallIt! ») : on la garde un instant, puis on ouvre le centrage
  if (req.method === 'POST' && new URL(req.url).pathname.endsWith('/partage')) {
    e.respondWith((async () => {
      try { const f = (await req.formData()).get('photo'); if (f) await (await caches.open('callit-partage')).put('photo', new Response(f, { headers: { 'Content-Type': f.type || 'image/jpeg' } })); } catch (err) {}
      return Response.redirect('./#/centrage?partage=1', 303);
    })());
    return;
  }
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname === 'assets.tcgdex.net' || url.hostname === 'images.pokemontcg.io' || url.hostname === 'cards.scryfall.io' || url.hostname === 'en.onepiece-cardgame.com' || (url.origin === location.origin && url.pathname.includes('/img/'))) {
    e.respondWith(caches.open('callit-img').then(async c => { const hit = await c.match(req); if (hit) return hit; const r = await fetch(req); if (r.ok) c.put(req, r.clone()); return r; }));
  } else if (url.origin === location.origin || url.hostname.endsWith('gstatic.com') || url.hostname === 'fonts.googleapis.com') {
    // Réseau d'abord, sans copie périmée du navigateur (toujours la dernière version), copie en cache pour le mode hors connexion
    e.respondWith(caches.open(V).then(c => (url.origin === location.origin && req.mode !== 'navigate' ? fetch(req.url, { cache: 'no-cache' }) : fetch(req)).then(r => { if (r.ok) c.put(req, r.clone()); return r; })
      .catch(() => c.match(req, { ignoreSearch: url.origin === location.origin }).then(hit => hit || c.match('index.html')))));
  }
});
