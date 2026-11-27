'use strict';
/* CallIt! · bandeau « mise à jour disponible ».
   - Site (et appli des stores, qui charge le code du site) : quand une nouvelle version est en ligne
     alors que la page ouverte a encore l'ancienne, un bandeau propose de la charger.
   - Appli des stores trop ancienne (version.json → android.conseille / ios.conseille) : le bandeau
     renvoie vers la fiche du store.
   version.json est réécrit automatiquement à chaque changement du code (workflow version.yml). */
(function () {
  const SITE = 'https://callitcards.com/';
  const natif = !!window.CallItNatif;
  const plateforme = natif ? window.CallItNatif.plateforme : 'web';
  const enLigne = !natif || window.CALLIT_CODE === 'en-ligne';
  const KEY = 'callit.v1.maj';
  const memo = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } };
  const garder = o => { try { localStorage.setItem(KEY, JSON.stringify(Object.assign(memo(), o))); } catch (e) { /* stockage indisponible */ } };
  // Version du code qui tourne : écrite dans demarrage.js à chaque mise en ligne (version.yml) ; à défaut, celle lue
  // à l'ouverture sur le site, ou celle de la copie livrée avec l'appli
  const pre = window.CALLIT_PRE && window.CALLIT_PRE.site && window.CALLIT_PRE.site !== 'dev' ? window.CALLIT_PRE.site : null;
  let actuelle = natif && !enLigne ? null : pre, dernierCoup = 0, montre = '';
  // L'appli s'ouvre depuis sa copie gardée par le service worker (sw.js) : un rechargement ouvre cette copie,
  // pas forcément la version en ligne. Sa version est dans son version.json (sans « ?t= », servi par la copie).
  const parCopie = () => !!(navigator.serviceWorker && navigator.serviceWorker.controller);
  const versionCopie = () => fetch('version.json').then(r => r.ok ? r.json() : null).then(v => (v && v.site) || null).catch(() => null);

  const lire = url => fetch(url + '?t=' + Date.now(), { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null);
  const enLigneV = () => lire(natif ? SITE + 'version.json' : 'version.json');

  function bandeau(id, texte, bouton, action, fermer) {
    if (montre === id) return;
    const ancien = document.getElementById('maj'); if (ancien) ancien.remove();
    const b = document.createElement('div');
    b.id = 'maj'; b.className = 'maj'; b.setAttribute('role', 'status');
    b.innerHTML = `<span class="maj-txt"></span><span class="maj-act"><a class="btn small primary" href="#"></a><button class="iconbtn" aria-label="Fermer">✕</button></span>`;
    b.querySelector('.maj-txt').textContent = typeof tr === 'function' ? tr(texte) : texte;
    const a = b.querySelector('a');
    a.textContent = typeof tr === 'function' ? tr(bouton) : bouton;
    if (typeof action === 'string') { a.href = action; a.target = '_blank'; a.rel = 'noopener'; } else a.onclick = e => { e.preventDefault(); action(); };
    b.querySelector('button').onclick = () => { b.remove(); montre = ''; fermer(); };
    document.body.appendChild(b); montre = id;
  }

  // Appli des stores trop ancienne : renvoi vers le store (prioritaire)
  async function verifierAppli(v) {
    if (!natif || !v || !v[plateforme]) return false;
    const st = v[plateforme], min = +st.conseille || 0;
    if (!min || !st.lien) return false;
    let build = 0;
    try { const App = window.Capacitor.Plugins.App; build = +(await App.getInfo()).build || 0; } catch (e) { return false; }
    if (!build || build >= min) return false;
    if (memo().appliFermee > Date.now() - 3 * 864e5) return true; // refermé il y a moins de 3 jours
    bandeau('appli', 'Nouvelle version de l’appli disponible.', 'Mettre à jour', st.lien, () => garder({ appliFermee: Date.now() }));
    return true;
  }

  // Pendant un live (fenêtre flottante, écran partagé, scan), pas de bandeau : recharger couperait tout.
  // On revérifie quand l'utilisateur change d'écran.
  const occupe = () => typeof window.callitBusy === 'function' && window.callitBusy();

  async function verifier() {
    if (occupe()) { const b = document.getElementById('maj'); if (b) { b.remove(); montre = ''; } dernierCoup = 0; return; }
    if (document.hidden || Date.now() - dernierCoup < 10 * 60e3) return;
    dernierCoup = Date.now();
    const v = await enLigneV(); if (!v || !v.site) return;
    if (await verifierAppli(v)) return;
    if (actuelle == null) { actuelle = v.site; if (enLigne) return; }
    if (v.site === actuelle) return;
    if (enLigne && parCopie()) {
      // La nouvelle copie s'installe en arrière-plan ; le bandeau n'apparaît que lorsqu'elle est prête,
      // pour que « Mettre à jour » ouvre bien la nouvelle version (nouvelleCopie, appelé aussi par app.js)
      if ((await versionCopie()) === v.site) { proposerSite(v.site); return; }
      navigator.serviceWorker.getRegistration().then(r => r && r.update()).catch(() => {});
      dernierCoup = 0; setTimeout(verifier, 2 * 60e3);
      return;
    }
    // Laisse 10 minutes au site pour publier partout la nouvelle version (copies en cache)
    if (v.date && Date.now() - Date.parse(v.date) < 10 * 60e3) { dernierCoup = 0; setTimeout(verifier, 10 * 60e3); return; }
    proposerSite(v.site);
  }
  function proposerSite(site) {
    if (memo().siteFermee === site || occupe()) return;
    bandeau('site', 'Nouvelle version de CallIt! disponible.', 'Mettre à jour', () => location.reload(), () => garder({ siteFermee: site }));
  }
  // Nouvelle copie de l'appli installée par le service worker pendant que la page est ouverte
  async function nouvelleCopie() {
    const site = await versionCopie();
    if (site && actuelle && site !== actuelle) proposerSite(site);
  }

  async function demarrer() {
    // Appli qui tourne sur sa copie intégrée : sa version est celle livrée avec l'appli
    if (natif && !enLigne) { const loc = await lire('version.json'); actuelle = loc && loc.site ? loc.site : ''; }
    verifier();
    document.addEventListener('visibilitychange', verifier);
    window.addEventListener('hashchange', verifier);
    setInterval(verifier, 30 * 60e3);
  }
  // Pour voir le bandeau tout de suite (essais) : CallItMaj.montrer("site") ou CallItMaj.montrer("appli")
  window.CallItMaj = { nouvelleCopie, montrer: t => t === 'appli' ? bandeau('appli', 'Nouvelle version de l’appli disponible.', 'Mettre à jour', 'https://play.google.com/apps/internaltest/4699287945396749951', () => {}) : bandeau('site', 'Nouvelle version de CallIt! disponible.', 'Mettre à jour', () => location.reload(), () => {}) };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(demarrer, 3000)); else setTimeout(demarrer, 3000);
})();
