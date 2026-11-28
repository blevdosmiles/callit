/* CallIt! · service worker : l'appli s'ouvre tout de suite, même sans réseau (salons, boutiques).
   - Code de l'appli (index.html, scripts, styles, polices, dictionnaires) : la copie de la version installée sert
     tout de suite, sans attendre le réseau. La liste des fichiers est lue dans index.html (rien à tenir à jour ici).
     Chaque mise en ligne change SITE ci-dessous (écrit par .github/workflows/version.yml) : le navigateur installe
     alors la nouvelle copie en arrière-plan, et l'appli propose « Mettre à jour » (maj.js).
   - Cartes, prix du jour et taux : la copie gardée sert tout de suite et la dernière version est relue en arrière-plan ;
     si les prix ou les taux ont changé, l'appli les met à jour sans recharger. Autres données : réseau d'abord.
   - Images des cartes : gardées une fois pour toutes. */

const SITE = '9aba7decd'; // numéro de version du site, écrit automatiquement à chaque mise en ligne

const CODE = 'callit-code-' + SITE, DONNEES = 'callit-donnees', IMG = 'callit-img', PARTAGE = 'callit-partage', EXT = 'callit-ext';
const RACINE = new URL('./', self.location).href;
const FIXES = ['./', 'index.html', 'version.json', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png'];
// Données du premier écran : copie gardée d'abord, relue ensuite. PREVENIR : l'appli les applique sans recharger.
// data/appli/ : les bases au format de l'appli (outils/donnees_appli.py) ; IMMUABLE : les images de Magic (deux fichiers,
// les cartes les plus chères puis les autres), dont le nom change avec le contenu (jamais relues ; les copies d'une version
// précédente sont effacées quand la nouvelle arrive).
const VITE = /^data\/(cards|prix|rates)\.json$|^data\/jeux\/[a-z]+\.json$|^data\/appli\/[\w-]+\.json$/;
const PREVENIR = /^data\/(prix|rates)\.json$/;
const IMMUABLE = /^data\/appli\/([a-z]+)-images-([0-9a-f]+)(?:-[a-z]+)?\.json$/;
const CODE_EXT = /\.(js|css|woff2|json|svg|png|webmanifest|wasm|traineddata|gz)$/;
const IMG_HOTES = new Set(['assets.tcgdex.net', 'images.pokemontcg.io', 'cards.scryfall.io', 'en.onepiece-cardgame.com']);
const chemin = url => url.href.startsWith(RACINE) ? url.href.slice(RACINE.length).split(/[?#]/)[0] : null;

// Copie complète du code de cette version : les fichiers fixes, tout ce que charge index.html, et les dictionnaires
// et autres fichiers de code que cet appareil avait déjà (copie de la version précédente)
async function copierCode() {
  const liste = new Set(FIXES);
  const page = await fetch('index.html', { cache: 'no-cache' });
  if (!page.ok) throw new Error('index.html ' + page.status);
  const html = await page.text();
  for (const m of html.matchAll(/<(?:script|link)\b[^>]*?\s(?:src|href)="([^"]+)"/g)) {
    const u = new URL(m[1], RACINE), p = chemin(u);
    if (p && !u.search && CODE_EXT.test(p) && !/^(data|vendor)\//.test(p)) liste.add(p); // vendor/ : copie à part (EXT), gardée d'une version à l'autre
  }
  for (const k of await caches.keys()) {
    if (!k.startsWith('callit-code-') || k === CODE) continue;
    for (const r of await (await caches.open(k)).keys()) { const p = chemin(new URL(r.url)); if (p && !p.startsWith('vendor/') && (p.startsWith('i18n/') || /\.(js|css|woff2)$/.test(p))) liste.add(p); }
  }
  const c = await caches.open(CODE);
  await Promise.all([...liste].map(async p => {
    const r = await fetch(p, { cache: 'no-cache' });
    if (!r.ok) { if (FIXES.includes(p) || html.includes('"' + p + '"')) throw new Error(p + ' ' + r.status); return; } // fichier disparu de l'ancienne copie : tant pis
    await c.put(new URL(p, RACINE).href, r);
  }));
}

self.addEventListener('install', e => { e.waitUntil(copierCode().then(() => self.skipWaiting())); });

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) {
      if (k.startsWith('callit-code-') && k !== CODE) await caches.delete(k);
      else if (/^callit-v\d+$/.test(k)) {
        // Ancien service worker (avant le 27/11/2026) : on reprend ses copies des données avant d'effacer le reste
        const old = await caches.open(k), d = await caches.open(DONNEES);
        for (const r of await old.keys()) { const p = chemin(new URL(r.url)); if (p && /^(data|historique)\//.test(p) && !(await d.match(r.url))) { const hit = await old.match(r); if (hit) await d.put(r.url, hit); } }
        await caches.delete(k);
      }
    }
    await self.clients.claim();
  })());
});

// Relit un fichier en arrière-plan. Avec une copie, la demande est conditionnelle (rien n'est téléchargé s'il n'a pas changé).
const relu = new Map();
async function relire(cache, url, copie, prevenir) {
  if (copie && (Date.now() - (relu.get(url) || 0) < 30e3 || IMMUABLE.test(chemin(new URL(url)) || ''))) return null;
  relu.set(url, Date.now());
  const h = {}, etag = copie && copie.headers.get('etag'), lm = copie && copie.headers.get('last-modified');
  if (etag) h['If-None-Match'] = etag; else if (lm) h['If-Modified-Since'] = lm;
  const r = await fetch(url, copie ? { headers: h, cache: 'no-store' } : {});
  // Base au format de l'appli qui n'est plus sur le site : copie effacée, l'appli reprendra le fichier d'origine
  if (copie && r.status === 404 && /^data\/appli\//.test(chemin(new URL(url)) || '')) { await cache.delete(url); return null; }
  if (r.status === 304 || (copie && !r.ok)) return null;
  if (r.ok) { await cache.put(url, r.clone()); await ranger(cache, url); }
  if (copie && r.ok && prevenir) {
    const fichier = chemin(new URL(url));
    for (const cl of await self.clients.matchAll({ type: 'window' })) cl.postMessage({ type: 'callit-donnees', fichier });
  }
  return r;
}

// Copies devenues inutiles, effacées dès que la nouvelle est gardée : les images de Magic d'une version précédente de la
// base, et le fichier d'origine d'un jeu quand sa base au format de l'appli est là (l'appli lit celle-ci en premier)
async function ranger(cache, url) {
  const p = chemin(new URL(url)) || '', m = IMMUABLE.exec(p), b = /^data\/appli\/([a-z]+)\.json$/.exec(p);
  if (b) { await cache.delete(new URL(b[1] === 'pkm' ? 'data/cards.json' : 'data/jeux/' + b[1] + '.json', RACINE).href); return; }
  if (!m) return;
  for (const r of await cache.keys()) { const x = IMMUABLE.exec(chemin(new URL(r.url)) || ''); if (x && x[1] === m[1] && x[2] !== m[2]) await cache.delete(r); }
}

async function copieDabord(e, nom, prevenir) {
  const cache = await caches.open(nom), url = e.request.url, copie = await cache.match(url);
  const suite = relire(cache, url, copie, prevenir);
  if (copie) { e.waitUntil(suite.catch(() => {})); return copie; }
  return (await suite) || fetch(e.request);
}

async function reseauDabord(req, nom) {
  const cache = await caches.open(nom);
  try { const r = await fetch(req); if (r.ok) await cache.put(req.url, r.clone()); return r; }
  catch (err) { const hit = await cache.match(req.url); if (hit) return hit; throw err; }
}

async function code(req) {
  const cache = await caches.open(CODE), hit = await cache.match(req.url);
  if (hit) return hit;
  try { const r = await fetch(req); if (r.ok) await cache.put(req.url, r.clone()); return r; }
  catch (err) { const old = await caches.match(req.url); if (old) return old; throw err; }
}

async function pageAppli(req) {
  const cache = await caches.open(CODE), hit = await cache.match(RACINE);
  if (hit) return hit;
  try { return await fetch(req); }
  catch (err) { const old = await caches.match(RACINE) || await caches.match(RACINE + 'index.html'); if (old) return old; throw err; }
}

async function image(req) {
  const cache = await caches.open(IMG), hit = await cache.match(req);
  if (hit) return hit;
  const r = await fetch(req); if (r.ok) cache.put(req, r.clone()); return r;
}

// L'appli demande de garder ce qui sert à l'ouvrir (cartes du jeu choisi, prix, taux, dictionnaire), déjà téléchargé :
// la prochaine ouverture n'attend plus le réseau
self.addEventListener('message', e => {
  const d = e.data || {};
  if (d.type !== 'callit-garder' || !Array.isArray(d.fichiers)) return;
  e.waitUntil(Promise.all(d.fichiers.filter(p => typeof p === 'string' && /^(data|i18n)\/[\w\/.-]+\.json$/.test(p)).map(async p => {
    const nom = p.startsWith('i18n/') ? CODE : DONNEES, cache = await caches.open(nom), url = new URL(p, RACINE).href;
    if (await cache.match(url)) return;
    const r = await fetch(url).catch(() => null); if (r && r.ok) { await cache.put(url, r); await ranger(cache, url); }
  })));
});

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  // « Partager → CallIt! » : une photo (Galerie) est gardée un instant puis ouverte dans le centrage ; un lien va dans « Vérifier une annonce »
  if (req.method === 'POST' && url.pathname.endsWith('/partage')) {
    e.respondWith((async () => {
      let txt = '', titre = '';
      try {
        const fd = await req.formData(), f = fd.get('photo');
        if (f && f.size) await (await caches.open(PARTAGE)).put('photo', new Response(f, { headers: { 'Content-Type': f.type || 'image/jpeg' } }));
        else { txt = [fd.get('url'), fd.get('text')].filter(Boolean).join(' '); titre = fd.get('title') || ''; }
      } catch (err) {}
      // Lien partagé (annonce eBay) : on l'ouvre dans « Vérifier une annonce »
      if (txt) return Response.redirect('./#/annonce?texte=' + encodeURIComponent(txt) + (titre ? '&titre=' + encodeURIComponent(titre) : ''), 303);
      return Response.redirect('./#/centrage?partage=1', 303);
    })());
    return;
  }
  if (req.method !== 'GET') return;
  const p = chemin(url);
  if (IMG_HOTES.has(url.hostname) || (p != null && p.startsWith('img/'))) { e.respondWith(image(req)); return; }
  if (p == null) {
    // Polices d'autres serveurs (anciennes pages) : elles ne changent jamais pour une même adresse
    if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') e.respondWith(copieDabord(e, EXT, false));
    return; // compte, IA, cartes, statistiques… : le réseau, sans copie
  }
  if (req.mode === 'navigate') { if (p === '' || p === 'index.html') e.respondWith(pageAppli(req)); return; } // autres pages : le réseau
  if (url.search) return; // version.json?t=… et autres demandes datées : toujours le réseau
  if (VITE.test(p)) { e.respondWith(copieDabord(e, DONNEES, PREVENIR.test(p))); return; }
  if (/^(data|historique)\//.test(p)) { e.respondWith(reseauDabord(req, DONNEES)); return; }
  if (p.startsWith('vendor/')) { e.respondWith(copieDabord(e, EXT, false)); return; }
  if (CODE_EXT.test(p)) e.respondWith(code(req));
});
