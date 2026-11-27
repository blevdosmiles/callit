/* Guides CallIt! : les liens Amazon mènent à l'Amazon du pays du lecteur (pas seulement de la langue de la page).
   Pays : celui choisi dans l'appli s'il existe, sinon le fuseau horaire, sinon la langue du navigateur.
   Chaque lien porte data-q (recherche dans chaque langue) ; on garde l'identifiant partenaire du pays. */
(function () {
  var TAG = { fr: 'callitcards0b-21', it: 'callitcards-21', de: 'callitcards04-21', es: 'callitcards06-21', 'co.uk': 'callitcards0c-21',
    nl: 'callitcards0f-21', pl: 'callitcards03-21', se: 'callitcard076-21' };
  var DOM = { FR: 'fr', MC: 'fr', LU: 'fr', BE: 'fr', IT: 'it', SM: 'it', VA: 'it', DE: 'de', AT: 'de', CH: 'de', LI: 'de', ES: 'es', AD: 'es', PT: 'es',
    GB: 'co.uk', IE: 'co.uk', MT: 'co.uk', CY: 'co.uk', IS: 'co.uk', NL: 'nl', PL: 'pl', SE: 'se' };
  var TZ = { 'Europe/Paris': 'FR', 'Europe/Monaco': 'FR', 'Europe/Luxembourg': 'LU', 'Europe/Brussels': 'BE', 'Europe/Rome': 'IT', 'Europe/San_Marino': 'IT',
    'Europe/Vatican': 'IT', 'Europe/Berlin': 'DE', 'Europe/Busingen': 'DE', 'Europe/Vienna': 'AT', 'Europe/Zurich': 'CH', 'Europe/Vaduz': 'LI',
    'Europe/Madrid': 'ES', 'Atlantic/Canary': 'ES', 'Africa/Ceuta': 'ES', 'Europe/Andorra': 'AD', 'Europe/Lisbon': 'PT', 'Atlantic/Madeira': 'PT',
    'Atlantic/Azores': 'PT', 'Europe/London': 'GB', 'Europe/Dublin': 'IE', 'Europe/Malta': 'MT', 'Asia/Nicosia': 'CY', 'Atlantic/Reykjavik': 'IS',
    'Europe/Amsterdam': 'NL', 'Europe/Warsaw': 'PL', 'Europe/Stockholm': 'SE' };
  // Langue des recherches pour chaque Amazon (nl, pl, se : recherche en anglais)
  var QL = { fr: 'fr', it: 'it', de: 'de', es: 'es', 'co.uk': 'en', nl: 'en', pl: 'en', se: 'en' };
  function pays() {
    try { var s = JSON.parse(localStorage.getItem('callit.v1.settings') || '{}'); if (s && s.country) return s.country; } catch (e) { /* rien */ }
    try { var z = Intl.DateTimeFormat().resolvedOptions().timeZone; if (TZ[z]) return TZ[z]; } catch (e) { /* rien */ }
    var t = navigator.languages || [navigator.language || ''];
    for (var i = 0; i < t.length; i++) { var m = /-([A-Za-z]{2})\b/.exec(t[i] || ''); if (m && DOM[m[1].toUpperCase()]) return m[1].toUpperCase(); }
    return null;
  }
  var d = DOM[pays()];
  if (!d) return;
  var liens = document.querySelectorAll('a[data-q][href*="amazon."]');
  for (var i = 0; i < liens.length; i++) {
    var a = liens[i], q;
    try { q = JSON.parse(a.getAttribute('data-q')); } catch (e) { continue; }
    var k = q[QL[d]] || q.en || q[document.documentElement.lang];
    if (k) a.href = 'https://www.amazon.' + d + '/s?k=' + encodeURIComponent(k).replace(/%20/g, '+') + '&tag=' + TAG[d];
  }
})();
