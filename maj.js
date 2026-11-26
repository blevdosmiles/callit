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
  // Version du code qui tourne : celle lue à l'ouverture sur le site, ou la copie livrée avec l'appli
  let actuelle = null, dernierCoup = 0, montre = '';

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
    // Laisse 10 minutes au site pour publier partout la nouvelle version (copies en cache)
    if (v.date && Date.now() - Date.parse(v.date) < 10 * 60e3) { dernierCoup = 0; setTimeout(verifier, 10 * 60e3); return; }
    if (memo().siteFermee === v.site) return;
    bandeau('site', 'Nouvelle version de CallIt! disponible.', 'Mettre à jour', () => location.reload(), () => garder({ siteFermee: v.site }));
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
  window.CallItMaj = { montrer: t => t === 'appli' ? bandeau('appli', 'Nouvelle version de l’appli disponible.', 'Mettre à jour', 'https://play.google.com/store/apps/details?id=com.callitcards.app', () => {}) : bandeau('site', 'Nouvelle version de CallIt! disponible.', 'Mettre à jour', () => location.reload(), () => {}) };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(demarrer, 3000)); else setTimeout(demarrer, 3000);
})();
