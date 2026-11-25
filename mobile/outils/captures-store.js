// Captures d'écran pour les fiches Google Play / App Store (1080 × 1920), prises sur la vraie appli.
// Lancé par .github/workflows/captures-store.yml (les images des cartes ne sont joignables que depuis GitHub).
// Usage local : (cd mobile/www && python3 -m http.server 8765) puis node mobile/outils/captures-store.js
const { chromium } = require('playwright'); const path = require('path'); const fs = require('fs');
const BASE = process.env.BASE || 'http://localhost:8765/';
// Une série par langue : LANGUE=fr (défaut) ou en, de, es, it → mobile/store/captures/<langue>/
const LANGUE = process.env.LANGUE || 'fr';
const T = {
  fr: { locale: 'fr-FR', pays: 'FR', q: 'Dracaufeu' },
  en: { locale: 'en-GB', pays: 'IE', q: 'Charizard' },
  de: { locale: 'de-DE', pays: 'DE', q: 'Glurak' },
  es: { locale: 'es-ES', pays: 'ES', q: 'Charizard' },
  it: { locale: 'it-IT', pays: 'IT', q: 'Charizard' },
}[LANGUE];
const OUT = path.join(__dirname, '..', 'store', 'captures', LANGUE);
fs.mkdirSync(OUT, { recursive: true });
const pause = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 3, locale: T.locale, colorScheme: 'light' });
  const p = await ctx.newPage();
  const go = async (hash, attente = 2500) => { await p.goto(BASE + hash); await p.reload(); await p.waitForLoadState('networkidle').catch(() => {}); await pause(attente); };
  const shot = async nom => { await p.screenshot({ path: path.join(OUT, nom) }); console.log('capture', nom); };
  const reglages = async (s, col) => p.evaluate(([s, col]) => {
    localStorage.setItem('callit.v1.settings', JSON.stringify(s));
    if (col) localStorage.setItem('callit.v1.collection', JSON.stringify(col));
    localStorage.setItem('callit.v1.bannerClosedAt', '5');
  }, [s, col]);

  await go('');
  await reglages({ face: 'galerie', country: T.pays, ui: LANGUE, nameLang: LANGUE, theme: 'clair' });

  // Clés de quelques cartes réelles, prises dans la recherche
  await go('#/recherche?q=' + T.q + '', 4000);
  const cles = await p.$$eval('a[href^="#/carte/"]', as => [...new Set(as.map(a => decodeURIComponent(a.getAttribute('href').slice(8))))].slice(0, 8));
  await go('#/recherche?preset=petitprix', 3000).catch(() => {});
  const autres = await p.$$eval('a[href^="#/carte/"]', as => [...new Set(as.map(a => decodeURIComponent(a.getAttribute('href').slice(8))))].slice(0, 6));
  const col = [...cles.slice(0, 3), ...autres.slice(0, 5)].map((key, i) => ({ id: 'c' + i, key, lang: LANGUE === 'fr' ? 'fr' : 'en', cond: 'NM', qty: 1, paid: [1, 3, 5, 0.5, 2, 8, 1, 4][i], cur: 'EUR', date: '2026-10-0' + (i + 1) }));
  await reglages({ face: 'galerie', country: T.pays, ui: LANGUE, nameLang: LANGUE, theme: 'clair' }, col);

  await go('', 4000); await shot('1-accueil-galerie.png');
  await go('#/recherche?q=' + T.q + '', 4000); await shot('2-recherche.png');
  if (cles[0]) { await go('#/carte/' + encodeURIComponent(cles[0]), 4500); await shot('3-fiche-carte.png'); }
  await go('#/collection', 4000); await shot('4-collection.png');
  await reglages({ face: 'marche', country: T.pays, ui: LANGUE, nameLang: LANGUE, theme: 'clair' });
  await go('', 4000);
  // Pas de mention technique (« API eBay ») sur les captures de la fiche
  await p.evaluate(() => document.querySelectorAll('.note').forEach(n => { n.textContent = n.textContent.replace(/\s*[^.]*\beBay\b[^.]*API[^.]*\./i, ''); }));
  await shot('5-accueil-marche.png');
  await reglages({ face: 'galerie', country: T.pays, ui: LANGUE, nameLang: LANGUE, theme: 'sombre' });
  await go('', 4000); await shot('6-galerie-sombre.png');
  await b.close();
})();
