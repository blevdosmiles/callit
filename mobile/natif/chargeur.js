/* CallIt! · chargement du code de l'appli (applis des stores uniquement).
   À chaque ouverture, l'appli prend le code à jour sur le site (callitcards.com) : les corrections
   arrivent sans nouvelle version sur les stores. Sans réseau (ou si le site est trop lent),
   elle utilise la copie livrée avec l'appli.
   Règles des stores : Google Play autorise le code qui tourne dans la page web de l'appli
   (JavaScript dans une WebView) ; Apple aussi, tant que l'appli garde le même rôle.
   La liste LOCAL est ajoutée devant ce fichier par scripts/copier-web.mjs.
   Le site peut exiger un pont plus récent : <meta name="callit-natif-min" content="N"> dans index.html. */
(function () {
  'use strict';
  var SITE = 'https://callitcards.com/';
  var NATIF = 1; // à augmenter quand natif.js gagne une fonction dont le site aura besoin
  var LOCAL = window.CALLIT_LOCAL || { scripts: [], styles: [] };
  var Cap = window.Capacitor;
  var natif = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());

  function ajouterScripts(liste, base, suffixe) {
    liste.forEach(function (s) {
      var e = document.createElement('script');
      e.async = false; // garde l'ordre d'exécution
      e.src = base ? base + s + suffixe : s;
      if (base && LOCAL.scripts.indexOf(s) >= 0) e.onerror = function () { var l = document.createElement('script'); l.async = false; l.src = s; document.body.appendChild(l); };
      document.body.appendChild(e);
    });
  }
  function local() { window.CALLIT_CODE = 'integre'; ajouterScripts(LOCAL.scripts, '', ''); }

  if (!natif) { local(); return; }

  var ctl = new AbortController();
  var delai = setTimeout(function () { ctl.abort(); }, 3500);
  fetch(SITE + 'index.html?t=' + Date.now(), { signal: ctl.signal, cache: 'no-store' }).then(function (r) {
    if (!r.ok) throw new Error('site ' + r.status);
    return r.text();
  }).then(function (html) {
    clearTimeout(delai);
    var min = /<meta name="callit-natif-min" content="(\d+)"/.exec(html);
    if (min && +min[1] > NATIF) throw new Error('pont trop ancien');
    var scripts = [], styles = [], m;
    var reS = /<script src="(?!https?:|vendor\/)([^"?]+\.js)"/g, reC = /<link rel="stylesheet" href="(?!https?:)([^"?]+\.css)"/g;
    while ((m = reS.exec(html))) scripts.push(m[1]);
    while ((m = reC.exec(html))) styles.push(m[1]);
    if (scripts.indexOf('app.js') < 0) throw new Error('index.html du site inattendu');
    var suffixe = '?v=' + Math.floor(Date.now() / 300000); // nouvelle copie au plus toutes les 5 minutes
    window.CALLIT_CODE = 'en-ligne';
    styles.forEach(function (h) {
      var l = document.createElement('link');
      l.rel = 'stylesheet'; l.href = SITE + h + suffixe;
      l.onload = function () { var v = document.querySelector('link[rel="stylesheet"][href="' + h + '"]'); if (v) v.remove(); };
      document.head.appendChild(l);
    });
    ajouterScripts(scripts, SITE, suffixe);
  }).catch(function () { clearTimeout(delai); local(); });
})();
