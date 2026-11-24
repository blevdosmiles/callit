'use strict';
/* Statistiques de visite (GoatCounter : sans cookie, sans donnée personnelle, voir confidentialite.html).
   L'appli change d'écran avec l'adresse #/… : on compte chaque écran, sans ce qui suit le « ? »
   (recherches, filtres) et sans les identifiants personnels (decks, dossiers). */
(function () {
  function screenPath() {
    const parts = location.hash.replace(/^#\/?/, '').split('?')[0].split('/').filter(Boolean);
    if (!parts.length) return '/app';
    // Les pages de cartes et d'illustrateurs sont publiques : on garde lesquelles sont vues
    if ((parts[0] === 'carte' || parts[0] === 'illustrateur') && parts[1]) return '/app/' + parts[0] + '/' + parts[1];
    return '/app/' + parts[0];
  }
  let last = null;
  function count() {
    if (!window.goatcounter || !window.goatcounter.count) return;
    if (/[?&]code=/.test(location.search)) return; // lien de connexion en cours : jamais envoyé
    const p = screenPath();
    if (p === last) return;
    last = p;
    window.goatcounter.count({ path: p, title: '' });
  }
  window.addEventListener('hashchange', count);
  // Premier écran : un peu après le chargement, une fois le lien de connexion éventuel effacé de l'adresse
  window.addEventListener('load', () => setTimeout(count, 1500));
})();
