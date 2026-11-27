/* CallIt! · pont vers le téléphone (iPhone et Android).
   Ce fichier n'est chargé que dans les applis des stores (ajouté par scripts/copier-web.mjs),
   jamais sur le site. Il complète l'appli web sans toucher à app.js :
   - données (cartes, prix, taux, historique) lues en ligne sur le site, avec la copie de l'appli en secours ;
   - liens externes (eBay, Cardmarket…) ouverts dans un navigateur, l'appli reste ouverte ;
   - partage natif (navigator.share) ;
   - barre d'état aux couleurs du thème ;
   - notifications push, prêtes mais éteintes tant que Firebase et Apple ne sont pas configurés ;
   - liens « callit://… » (retour de connexion par e-mail, plus tard). */
(function () {
  'use strict';
  var Cap = window.Capacitor;
  if (!Cap || !Cap.isNativePlatform || !Cap.isNativePlatform()) return;
  var P = Cap.Plugins || {};
  var plateforme = Cap.getPlatform();
  document.documentElement.classList.add('natif', 'natif-' + plateforme);

  /* 1. Données à jour : le site est mis à jour chaque jour (prix, taux), l'appli des stores non.
        On lit donc les données sur le site ; sans réseau, on prend la copie livrée avec l'appli. */
  var SITE = 'https://callitcards.com/';
  // i18n/ aussi quand le code vient du site (chargeur.js), pour que les textes suivent le code
  var EN_LIGNE = /^(data|historique)\//, TEXTES = /^i18n\//;
  var fetchOrig = window.fetch.bind(window);
  window.fetch = function (entree, options) {
    if (typeof entree !== 'string' || !(EN_LIGNE.test(entree) || (TEXTES.test(entree) && window.CALLIT_CODE === 'en-ligne'))) return fetchOrig(entree, options);
    var ctl = new AbortController();
    var delai = setTimeout(function () { ctl.abort(); }, /cards\.json/.test(entree) ? 12000 : 6000);
    var opts = Object.assign({}, options || {}, { signal: ctl.signal });
    return fetchOrig(SITE + entree, opts).then(function (r) {
      clearTimeout(delai);
      if (!r.ok && r.status !== 404) throw new Error('site ' + r.status);
      return r;
    }).catch(function () { clearTimeout(delai); return fetchOrig(entree, options); }).then(function (r) {
      return /^data\/jeux\//.test(entree) && r.ok ? imagesEnLigne(r) : r;
    });
  };
  // Les images des autres jeux (img/, plus de 200 Mo) ne sont pas dans l'appli :
  // on fait pointer « imageBase » des fichiers data/jeux/*.json vers le site.
  function imagesEnLigne(r) {
    return r.clone().json().then(function (j) {
      if (j && typeof j.imageBase === 'string' && !/^https?:/.test(j.imageBase)) j.imageBase = SITE + j.imageBase;
      return new Response(JSON.stringify(j), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }).catch(function () { return r; });
  }

  /* 2. Pas de service worker dans l'appli : les fichiers sont déjà sur le téléphone. */
  if (navigator.serviceWorker) {
    try { navigator.serviceWorker.register = function () { return Promise.reject(new Error('appli native')); }; } catch (e) {}
  }

  /* 3. Liens externes : navigateur intégré (Safari / Chrome), l'utilisateur revient dans CallIt! d'un geste.
        Les liens partenaires restent signalés dans l'appli web elle-même, rien ne change ici. */
  function ouvrir(url) {
    if (P.Browser) return P.Browser.open({ url: url, presentationStyle: 'popover' });
    window.location.href = url;
  }
  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button > 0) return;
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    var url;
    try { url = new URL(a.getAttribute('href'), location.href); } catch (err) { return; }
    if ((url.protocol === 'http:' || url.protocol === 'https:') && url.origin !== location.origin) {
      e.preventDefault();
      ouvrir(url.href);
    }
  }, true);
  var openOrig = window.open;
  window.open = function (url) {
    try {
      var u = new URL(url, location.href);
      if (u.origin !== location.origin && /^https?:$/.test(u.protocol)) { ouvrir(u.href); return null; }
    } catch (e) {}
    return openOrig.apply(window, arguments);
  };

  /* 4. Partage : la feuille de partage du téléphone (WhatsApp, Messages…). */
  if (P.Share) {
    navigator.share = function (d) {
      d = d || {};
      return P.Share.share({ title: d.title, text: d.text, url: d.url, dialogTitle: d.title || 'Partager' }).then(function () {});
    };
    navigator.canShare = function (d) { return !d || !d.files; };
  }

  /* 5. Barre d'état : suit la couleur de fond choisie par app.js (balise theme-color). */
  function barre() {
    if (!P.StatusBar) return;
    var sombre = document.documentElement.dataset.theme === 'dark';
    P.StatusBar.setStyle({ style: sombre ? 'DARK' : 'LIGHT' }).catch(function () {});
    var m = document.querySelector('meta[name="theme-color"]');
    if (plateforme === 'android' && m) P.StatusBar.setBackgroundColor({ color: m.content }).catch(function () {});
  }
  new MutationObserver(barre).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  document.addEventListener('DOMContentLoaded', function () {
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) new MutationObserver(barre).observe(m, { attributes: true, attributeFilter: ['content'] });
    barre();
    if (P.SplashScreen) setTimeout(function () { P.SplashScreen.hide().catch(function () {}); }, 300);
  });

  /* 6. Notifications push (alertes prix, sorties, illustrateurs suivis).
        Éteintes tant que PUSH_PRET vaut false : il faut d'abord un projet Firebase (gratuit)
        et, pour l'iPhone, le compte Apple Developer. Voir mobile/LISEZMOI.md. */
  var PUSH_PRET = false;
  var notifications = {
    pret: PUSH_PRET,
    activer: function () {
      if (!PUSH_PRET || !P.PushNotifications) return Promise.resolve({ ok: false, raison: 'pas encore disponible' });
      var PN = P.PushNotifications;
      return PN.requestPermissions().then(function (p) {
        if (p.receive !== 'granted') return { ok: false, raison: 'refusé' };
        return new Promise(function (resolve) {
          PN.addListener('registration', function (t) {
            try { localStorage.setItem('callit.push', t.value); } catch (e) {}
            window.dispatchEvent(new CustomEvent('callit:push', { detail: { jeton: t.value, plateforme: plateforme } }));
            resolve({ ok: true, jeton: t.value });
          });
          PN.addListener('registrationError', function () { resolve({ ok: false, raison: 'erreur' }); });
          PN.register();
        });
      });
    }
  };
  if (PUSH_PRET && P.PushNotifications) {
    // Toucher une notification ouvre l'écran prévu (ex. data.lien = "#/carte/…").
    P.PushNotifications.addListener('pushNotificationActionPerformed', function (a) {
      var lien = a && a.notification && a.notification.data && a.notification.data.lien;
      if (lien && lien.charAt(0) === '#') location.hash = lien;
    });
  }

  /* 7. Liens callit://… (ex. callit://auth?code=… après la connexion par e-mail). */
  if (P.App) {
    P.App.addListener('appUrlOpen', function (ev) {
      try {
        var u = new URL(ev.url);
        var code = u.searchParams.get('code');
        if (code) location.href = location.origin + location.pathname + '?code=' + encodeURIComponent(code) + '#/';
        else if (u.hash) location.hash = u.hash;
      } catch (e) {}
    });
  }

  /* 8. Photo partagée depuis la Galerie (« Partager » > Centrage CallIt!) : ouverte dans le centrage.
        Si l'appli web propose window.CallItCentrage(file) (même chose que pour le site installé),
        on la lui passe ; sinon on ouvre le centrage et on charge la photo nous-mêmes. */
  function photoPartagee() {
    if (!P.Partage) return;
    P.Partage.prendre().then(function (r) {
      if (r && r.texte) return lienPartage(r);
      if (!r || !r.chemin) return;
      return fetchOrig(Cap.convertFileSrc('file://' + r.chemin)).then(function (rep) { return rep.blob(); }).then(function (b) {
        var file = new File([b], r.chemin.split('/').pop(), { type: b.type || 'image/jpeg' });
        var essais = 0;
        (function remettre() {
          if (typeof window.CallItCentrage === 'function') return window.CallItCentrage(file);
          if (typeof window.ctrLoad === 'function' && typeof window.render === 'function') {
            if (!/^#\/centrage/.test(location.hash)) location.hash = '#/centrage';
            return setTimeout(function () { window.ctrLoad(file); }, 150);
          }
          if (++essais < 100) setTimeout(remettre, 100); // le code de l'appli est encore en chargement
        })();
      });
    }).catch(function () {});
  }
  /* 9. Lien partagé depuis l'appli eBay (« Partager » > Enchères CallIt!) : il s'ouvre dans « Mes enchères ».
        r.lien = lien court ebay.us déjà déplié par l'appli Android (l'annonce elle-même n'est pas lue). */
  function lienPartage(r) {
    var texte = (r.lien ? r.lien + ' ' : '') + r.texte;
    location.hash = '#/encheres?texte=' + encodeURIComponent(texte) + (r.sujet ? '&titre=' + encodeURIComponent(r.sujet) : '');
  }
  if (P.Partage) { P.Partage.addListener('photo', photoPartagee); P.Partage.addListener('texte', photoPartagee); photoPartagee(); }

  window.CallItNatif = { plateforme: plateforme, notifications: notifications, ouvrir: ouvrir };
})();
