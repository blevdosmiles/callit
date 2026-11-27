'use strict';
/* CallIt! · démarrage rapide (premier script de la page, dans <head>).
   1) Lance tout de suite le téléchargement de ce que demande le premier écran (cartes du jeu choisi, prix, taux,
      dictionnaire de la langue), pendant que le navigateur lit le reste de l'appli : i18n.js et app.js reprennent
      ces téléchargements (window.CALLIT_PRE) au lieu de les relancer.
   2) Met le thème clair ou sombre avant le premier affichage (pas d'éclair blanc en mode sombre).
   3) Accueil : remet tout de suite l'accueil de la dernière visite (gardé sur l'appareil par app.js), le temps que
      les cartes soient prêtes ; app.js le remplace par le vrai dès qu'elles le sont. Les liens marchent tout de suite,
      les boutons attendent ce moment (une seconde environ). */
(function () {
  const SITE = '70110f26a'; // numéro de version du site, écrit automatiquement à chaque mise en ligne (.github/workflows/version.yml)
  let s = {};
  try { s = JSON.parse(localStorage.getItem('callit.v1.settings') || '{}') || {}; } catch (e) { /* stockage indisponible */ }
  // Mêmes fichiers que GAMES dans app.js, même langue que pickUiLang dans i18n.js
  const FICHIERS = { pkm: 'data/cards.json', mtg: 'data/jeux/mtg.json', ygo: 'data/jeux/ygo.json', op: 'data/jeux/op.json', sport: 'data/jeux/sport.json' };
  const game = Object.prototype.hasOwnProperty.call(FICHIERS, s.game) ? s.game : 'pkm';
  const LANGUES = ['en', 'fr', 'de', 'es', 'it'];
  const pref = (navigator.languages || [navigator.language || 'en']).map(x => String(x).slice(0, 2).toLowerCase()).find(x => LANGUES.includes(x));
  const ui = LANGUES.includes(s.ui) ? s.ui : (pref || 'en');
  const json = u => fetch(u).then(r => { if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); });
  const P = window.CALLIT_PRE = { site: SITE, game, ui, file: FICHIERS[game] };
  // Cartes au format de l'appli (data/appli/, plus légères, faites à chaque mise en ligne), sinon le fichier
  // d'origine (copie de secours du site, essais en local). Applis des stores : seulement avec natif.js version 2.
  // Même règle que chargerBase() dans app.js ; P.lu = le fichier lu.
  const natif = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  const appli = game !== 'sport' && (!natif || !!(window.CallItNatif && window.CallItNatif.donnees >= 2)) ? 'data/appli/' + game + '.json' : null;
  const orig = () => json(P.file).then(d => { P.lu = P.file; return d; });
  P.cards = appli ? json(appli).then(d => { P.lu = appli; return d; }, orig) : orig();
  P.cards.catch(() => {}); // l'erreur est traitée par app.js (écran « Impossible de charger les cartes »)
  P.rates = json('data/rates.json').catch(() => null);
  if (game === 'pkm') P.prix = json('data/prix.json').catch(() => null);
  if (ui !== 'fr') P.i18n = json('i18n/' + ui + '.json').catch(() => null);

  // Thème (même règle que applyTheme dans app.js)
  try {
    const dark = s.theme === 'sombre' || ((s.theme || 'auto') === 'auto' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  } catch (e) { /* rien */ }

  // Accueil de la dernière visite : seulement s'il a été fait par cette version de l'appli, pour ce jeu, cette langue et ce visage
  try {
    const h = location.hash;
    if (!s.face || !(h === '' || h === '#' || h === '#/')) return;
    const a = JSON.parse(localStorage.getItem('callit.v1.apercu') || 'null');
    if (!a || !a.html || a.site !== SITE || a.game !== game || a.ui !== ui || a.sface !== s.face || !(Date.now() - a.t < 30 * 864e5)) return;
    // On attend que la page ait fini de lire <main id="app"> (l'élément qui le suit existe) avant de le remplir
    const poser = () => {
      const el = document.getElementById('app');
      if (!el || !el.nextSibling) return false;
      el.innerHTML = a.html; el.dataset.apercu = '1'; P.apercuT = performance.now(); // le néon de la vitrine s'allume à partir d'ici (app.js le reprend)
      if (document.body && a.corps) document.body.dataset.face = a.corps;
      return true;
    };
    if (!poser()) { const mo = new MutationObserver(() => { if (poser()) mo.disconnect(); }); mo.observe(document.documentElement, { childList: true, subtree: true }); }
    // Avant que les cartes soient prêtes, les boutons de l'accueil n'ont rien à faire : on les ignore
    document.addEventListener('click', e => {
      if (P.pret || !e.target.closest) return;
      if (e.target.closest('#app button, #app [data-act], #app select')) { e.preventDefault(); e.stopImmediatePropagation(); }
    }, true);
  } catch (e) { /* aperçu illisible : écran de chargement normal */ }
})();
