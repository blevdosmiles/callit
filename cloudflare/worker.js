// Worker de callitcards.com.
// Pages des langues (/fr/, /en/, /de/, /es/, /it/) et images (/img/) : lues dans R2.
// Liens courts des analyses partagées (callitcards.com/zu42g, 48 h) : cloudflare/analyse.js.
// Tout le reste : fichiers du site (env.ASSETS), comme sur GitHub Pages.

import { analyse, nettoyer } from './analyse.js';

const TYPES = {
  html: 'text/html; charset=utf-8', xml: 'application/xml; charset=utf-8',
  json: 'application/json; charset=utf-8', css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8', webp: 'image/webp', png: 'image/png',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml', txt: 'text/plain; charset=utf-8',
};
const R2_DOSSIERS = /^\/(img|fr|en|de|es|it)(\/|$)/;

// Fichiers de l'appli : mêmes adresses que GitHub Pages (« /x.html » reste « /x.html »,
// « /dossier/ » sert index.html, « /x » essaie x.html puis x/).
async function servirFichier(request, env, url) {
  const r = await env.ASSETS.fetch(request);
  if (r.status !== 404) return r;
  const p = url.pathname;
  const essai = (chemin) => env.ASSETS.fetch(new Request(new URL(chemin + url.search, url), request));
  if (p.endsWith('/')) {
    const i = await essai(p + 'index.html');
    if (i.status !== 404) return i;
  } else if (!/\.[a-z0-9]+$/i.test(p)) {
    const h = await essai(p + '.html');
    if (h.status !== 404) return h;
    const d = await essai(p + '/index.html');
    if (d.status !== 404) return Response.redirect(url.origin + p + '/' + url.search, 301);
  }
  return r;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Ancienne adresse www → adresse principale (comme le faisait GitHub Pages).
    if (url.hostname === 'www.callitcards.com') {
      url.hostname = 'callitcards.com';
      return Response.redirect(url.toString(), 301);
    }

    // Adresse courte à partager : callitcards.com/testeur → écran « Devenir testeur » de l'appli.
    if (/^\/(testeur|tester|testers?)\/?$/i.test(url.pathname)) {
      return Response.redirect(url.origin + '/#/testeur', 302);
    }

    const a = await analyse(request, env, url);
    if (a) return a;

    if (!R2_DOSSIERS.test(url.pathname)) return servirFichier(request, env, url);
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Méthode non autorisée', { status: 405 });
    }

    // Petit cache Cloudflare devant R2 : moins de lectures, pages plus rapides.
    const cache = caches.default;
    const enCache = await cache.match(request);
    if (enCache) return enCache;

    let chemin = decodeURIComponent(url.pathname.slice(1));
    // /fr → /fr/ (même comportement que GitHub Pages)
    if (/^(fr|en|de|es|it)$/.test(chemin)) {
      return Response.redirect(url.origin + '/' + chemin + '/' + url.search, 301);
    }
    const essais = chemin.endsWith('/')
      ? [chemin + 'index.html']
      : [chemin, chemin + '.html'];
    let objet = null, cle = null;
    for (const c of essais) {
      objet = await env.R2.get(c);
      if (objet) { cle = c; break; }
    }
    if (!objet && !chemin.endsWith('/') && !/\.[a-z0-9]+$/i.test(chemin)) {
      const dossier = await env.R2.head(chemin + '/index.html');
      if (dossier) return Response.redirect(url.origin + '/' + chemin + '/' + url.search, 301);
    }
    if (!objet) return new Response('Page introuvable', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });

    const ext = cle.split('.').pop().toLowerCase();
    const entetes = new Headers();
    entetes.set('content-type', TYPES[ext] || 'application/octet-stream');
    entetes.set('etag', objet.httpEtag);
    // Images : elles ne changent pas. Pages : 10 minutes, comme GitHub Pages.
    entetes.set('cache-control', ext === 'html' ? 'public, max-age=600' : 'public, max-age=86400');
    const reponse = new Response(request.method === 'HEAD' ? null : objet.body, { headers: entetes });
    if (request.method === 'GET') ctx.waitUntil(cache.put(request, reponse.clone()));
    return reponse;
  },

  // Chaque heure (wrangler.jsonc, « triggers ») : efface les analyses partagées de plus de 48 h
  async scheduled(event, env, ctx) {
    ctx.waitUntil(nettoyer(env));
  },
};
