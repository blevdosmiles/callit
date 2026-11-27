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
  // Visiteurs envoyés vers le site ou les réseaux d'un illustrateur : un compteur par artiste et par réseau, rien d'autre
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a.netchip'); if (!a || !window.goatcounter || !window.goatcounter.count) return;
    const who = (location.hash.split('/')[2] || '').split('?')[0];
    window.goatcounter.count({ path: 'sortie-artiste/' + who + '/' + (a.dataset.net || 'lien'), title: '', event: true });
  });
  // Clics vers un site partenaire (liens « sponsored » : eBay, Amazon, Etsy…) : un compteur par site et par écran, rien d'autre
  function siteOf(href) {
    try { const h = new URL(href, location.href).hostname.replace(/^www\./, ''); const m = h.match(/(ebay|amazon|etsy|cardmarket|awin|rakuten|wise)/); return m ? m[1] : h.split('.').slice(-2, -1)[0] || 'autre'; } catch (e) { return 'autre'; }
  }
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[href]'); if (!a || !window.goatcounter || !window.goatcounter.count) return;
    if (!/\bsponsored\b/.test(a.getAttribute('rel') || '')) return;
    window.goatcounter.count({ path: 'sortie-partenaire/' + siteOf(a.href) + screenPath().replace(/^\/app/, ''), title: '', event: true });
  });
  // Partages (menu de partage du téléphone) : un compteur par écran, seulement quand le partage est fait
  if (navigator.share && !navigator.share.__callit) {
    const share = navigator.share.bind(navigator);
    const wrapped = async function (data) {
      const r = await share(data);
      try { if (window.goatcounter && window.goatcounter.count) window.goatcounter.count({ path: 'partage' + screenPath().replace(/^\/app/, '').replace(/^\/carte\/.*/, '/carte'), title: '', event: true }); } catch (e) { /* rien */ }
      return r;
    };
    wrapped.__callit = true;
    try { navigator.share = wrapped; } catch (e) { /* navigateur qui refuse : on ne compte pas */ }
  }
  // Premier écran : un peu après le chargement, une fois le lien de connexion éventuel effacé de l'adresse
  window.addEventListener('load', () => setTimeout(count, 1500));
})();
