// Envoie vers les conditions de vente dans la langue du navigateur (français par défaut)
(function () {
  var l = (navigator.language || 'fr').slice(0, 2).toLowerCase();
  if (['fr', 'it', 'en', 'de', 'es'].indexOf(l) < 0) l = 'fr';
  location.replace(l + '.html');
})();
