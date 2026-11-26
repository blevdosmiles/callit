/* CallIt! · Bulle (#/bulle) : la page affichée dans la bulle flottante de l'appli Android, par-dessus un live eBay.
   On tape un numéro (150/165, SWSH020, 4/102…) ou un nom, la cote s'affiche tout de suite.
   Tout se règle ici (taille, transparence, éléments affichés, état et langue par défaut, prix max) et s'améliore
   sans nouvelle version de l'appli. Dans l'appli, la fenêtre est pilotée par l'objet natif « CallItBulleNatif ».
   Ce fichier ajoute aussi le bouton « Bulle » du Mode Live (appli Android 0.5 et plus). */
(function () {
  'use strict';
  if (typeof render !== 'function') return;
  const N = window.CallItBulleNatif || null;
  const API = () => window.CallItLiveAPI;
  const SHOW = [['img', 'Image'], ['etat', 'État'], ['langue', 'Langue'], ['details', 'Moyennes et prix bas'], ['max', 'Mon prix max'], ['autres', 'Autres versions']];
  const B = Object.assign({ cond: 'NM', maxPct: 70, taille: 'm', alpha: 1, petite: false }, load('bulle', {}));
  B.show = Object.assign({ img: true, etat: true, langue: true, details: false, max: true, autres: true }, B.show || {});
  const saveB = () => save('bulle', B);
  const st = { q: '', key: null, lang: null, results: [], cfg: false };
  const isBulle = () => location.hash.replace(/^#\/?/, '').split(/[/?]/)[0] === 'bulle';
  const nat = (f, ...a) => { try { if (N && typeof N[f] === 'function') N[f](...a); } catch (e) {} };

  /* ---------- Recherche : numéro et code de set d'abord (comme le scan), puis le nom ---------- */
  function search(q) {
    const A = API(); if (!A || !q) return [];
    const seen = new Set(), out = [], add = c => { if (c && !seen.has(c.key)) { seen.add(c.key); out.push(c); } };
    if (/\d/.test(q)) A.liveMatch(q).results.forEach(add);
    if (q.length >= 2) A.find(q).forEach(add);
    return out.slice(0, 12);
  }
  const pos = v => (v > 0 ? v : null);

  /* ---------- Affichage ---------- */
  const chip = (on, act, v, label) => `<button type="button" class="chip${on ? ' on' : ''}" aria-pressed="${on}" data-b="${act}" data-v="${esc(v)}">${label}</button>`;
  function cardHtml(c) {
    const A = API(), e = A.estimer(c, { cond: B.cond, lang: st.lang });
    const al = A.alertOf(c);
    const others = B.show.autres ? st.results.filter(x => x.key !== c.key).slice(0, 4) : [];
    return `<div class="bl-card">${B.show.img ? `<span class="bl-img">${cimg(c)}</span>` : ''}<div class="bl-info"><b class="bl-name">${esc(cardName(c))}</b><div class="small">${esc(setName(c.set))} · ${esc(numLabel(c))}</div>
        <div class="bl-price num">${e ? eur(e.mid) : '—'}</div><div class="small">${e ? (e.kind === 'cote' ? 'Cote, moyenne 30 jours' : 'Estimation ' + esc(B.cond) + (st.lang ? ' · ' + esc((LANG[st.lang] || { short: st.lang }).short) : '')) : 'Pas de cote'}</div></div></div>
      ${B.show.max && e ? `<div class="bl-max">Mon max (${B.maxPct} %) : <b class="num">${eur(e.mid * B.maxPct / 100)}</b></div>` : ''}
      ${B.show.etat ? `<div class="chips bl-chips">${CONDS.map(([k]) => chip(B.cond === k, 'cond', k, k)).join('')}</div>` : ''}
      ${B.show.langue && c.langs && c.langs.length > 1 ? `<div class="chips bl-chips">${chip(!st.lang, 'lang', '', 'Toutes')}${c.langs.map(l => chip(st.lang === l, 'lang', l, esc((LANG[l] || { short: l }).short))).join('')}</div>` : ''}
      ${B.show.details ? `<div class="bl-det small">Moy. 30 j <b class="num">${eur(pos(pf(c, 'avg30')))}</b> · 7 j <b class="num">${eur(pos(pf(c, 'avg7')))}</b> · Bas <b class="num">${eur(pos(pf(c, 'low')))}</b></div>` : ''}
      ${al ? `<div class="bl-alert">${esc(al)}</div>` : ''}
      ${others.length ? `<div class="small bl-lab">Pas celle-ci ?</div><div class="bl-list">${others.map(row).join('')}</div>` : ''}
      <button type="button" class="linkbtn bl-fiche" data-b="fiche">Ouvrir la fiche</button>`;
  }
  const row = c => { const b = API().basePrice(c); return `<button type="button" class="bl-row" data-b="pick" data-v="${esc(c.key)}"><span><b>${esc(cardName(c))}</b><span class="small">${esc(setName(c.set))} · ${esc(numLabel(c))}</span></span><b class="num">${b ? eur(b.v) : '—'}</b></button>`; };
  function bodyHtml() {
    if (!DB || !API()) return `<div class="small bl-hint">Chargement des cartes…</div>`;
    if (st.cfg) return cfgHtml();
    const c = st.key && BYKEY.get(st.key);
    if (c) return cardHtml(c);
    if (st.results.length) return `<div class="bl-list">${st.results.map(row).join('')}</div>`;
    if (st.q.length >= 1) return `<div class="small bl-hint">Rien trouvé pour « ${esc(st.q)} ». Essaie le numéro complet (ex. 4/102) ou le nom.</div>`;
    return `<div class="small bl-hint">Tape le numéro de la carte montrée (ex. <b>150/165</b>, <b>SWSH020</b>) ou son nom : la cote s’affiche tout de suite.</div>`;
  }
  function cfgHtml() {
    const seg = (act, cur, opts) => `<div class="face bl-seg">${opts.map(([v, l]) => `<button type="button" data-b="${act}" data-v="${v}" aria-pressed="${String(cur) === String(v)}">${l}</button>`).join('')}</div>`;
    return `<div class="bl-cfg">
      ${N ? `<div class="bl-lab">Taille de la bulle</div>${seg('taille', B.taille, [['s', 'Petite'], ['m', 'Moyenne'], ['l', 'Grande']])}
      <div class="bl-lab">Transparence</div>${seg('alpha', B.alpha, [['1', 'Aucune'], ['0.9', 'Légère'], ['0.75', 'Forte']])}
      <div class="bl-lab">Pastille</div>${seg('petite', B.petite, [['false', 'Normale'], ['true', 'Petite']])}` : ''}
      <div class="bl-lab">Afficher</div>${SHOW.map(([k, l]) => `<label class="bl-check"><input type="checkbox" data-bshow="${k}"${B.show[k] ? ' checked' : ''}> ${l}</label>`).join('')}
      <div class="bl-lab">Mon prix max (% de la cote)</div><input id="blpct" inputmode="numeric" value="${B.maxPct}" aria-label="Pourcentage de la cote">
      <button type="button" class="btn small primary" data-b="cfg" style="margin-top:10px">Terminé</button></div>`;
  }
  function view() {
    return `<div class="bulle"><form class="bl-top" data-bform="1" autocomplete="off"><input id="bq" type="search" enterkeyhint="search" placeholder="Numéro ou nom" aria-label="Numéro ou nom de la carte" value="${esc(st.q)}">
      <button type="button" class="iconbtn sm" data-b="cfg" aria-label="Réglages de la bulle" aria-pressed="${st.cfg}">⚙</button></form>
      <div id="bbody">${bodyHtml()}</div></div>`;
  }
  const draw = () => { const b = app.querySelector('#bbody'); if (b) b.innerHTML = bodyHtml(); };

  /* ---------- Actions ---------- */
  let tmr = 0;
  app.addEventListener('input', ev => {
    if (!isBulle()) return;
    const t = ev.target;
    if (t.id === 'bq') { st.q = t.value.trim(); clearTimeout(tmr); tmr = setTimeout(() => { st.results = search(st.q); st.key = st.results.length === 1 ? st.results[0].key : null; st.lang = null; st.cfg = false; draw(); }, 120); }
    else if (t.id === 'blpct') { const n = parseInt(t.value, 10); if (n >= 5 && n <= 200) { B.maxPct = n; saveB(); } }
  });
  app.addEventListener('change', ev => {
    if (!isBulle()) return;
    const k = ev.target.dataset && ev.target.dataset.bshow; if (k) { B.show[k] = ev.target.checked; saveB(); }
  });
  app.addEventListener('submit', ev => {
    if (!isBulle() || !ev.target.dataset.bform) return; ev.preventDefault();
    clearTimeout(tmr); st.q = ev.target.querySelector('input').value.trim(); st.results = search(st.q);
    // Un numéro seul (ex. 150/165) existe dans plusieurs sets : on montre la liste plutôt que de choisir au hasard
    const numOnly = /^[\d\s/]+$/.test(st.q) && st.results.length > 1;
    st.key = st.results[0] && !numOnly ? st.results[0].key : null; st.lang = null; st.cfg = false; draw(); ev.target.querySelector('input').blur();
  });
  app.addEventListener('click', ev => {
    if (!isBulle()) return;
    const el = ev.target.closest('[data-b]'); if (!el) return;
    const a = el.dataset.b, v = el.dataset.v;
    if (a === 'pick') { st.key = v; st.lang = null; draw(); }
    else if (a === 'cond') { B.cond = v; saveB(); draw(); }
    else if (a === 'lang') { st.lang = v || null; draw(); }
    else if (a === 'cfg') { st.cfg = !st.cfg; const b = app.querySelector('[data-b="cfg"][aria-pressed]'); if (b) b.setAttribute('aria-pressed', st.cfg); draw(); }
    else if (a === 'taille') { B.taille = v; saveB(); nat('taille', v); draw(); }
    else if (a === 'alpha') { B.alpha = +v; saveB(); nat('transparence', +v); draw(); }
    else if (a === 'petite') { B.petite = v === 'true'; saveB(); nat('pastille', B.petite); draw(); }
    else if (a === 'fiche' && st.key) { const h = '#/carte/' + encodeURIComponent(st.key); if (N) nat('ouvrirAppli', h); else location.hash = h; }
  });
  // Appelé par l'appli quand on rouvre la bulle : le curseur revient dans la recherche, texte sélectionné
  window.CallItBulle = { ouverte() { const q = app.querySelector('#bq'); if (q) { q.focus(); q.select(); } } };

  /* ---------- Bouton « Bulle » dans le Mode Live (appli Android avec la bulle) ---------- */
  const plugin = () => window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Bulle;
  window.CallItBulleBouton = () => (plugin() ? `<button type="button" class="btn small primary" data-bulle-open="1">◉ Bulle par-dessus eBay</button>` : '');
  document.addEventListener('click', ev => {
    const b = ev.target.closest && ev.target.closest('[data-bulle-open]'); if (!b || !plugin()) return;
    plugin().ouvrir().then(r => {
      if (r && r.autorisee === false) toast('Autorise « Afficher par-dessus les autres applis » pour CallIt!, puis reviens et touche à nouveau « Bulle ».');
      else toast('Bulle ouverte : va dans l’appli eBay, la pastille CallIt! reste par-dessus.');
    }).catch(() => toast('Impossible d’ouvrir la bulle'));
  });

  /* ---------- Branchement ---------- */
  const baseRender = render;
  render = function (keepFocus) {
    if (isBulle()) {
      document.body.classList.add('bulle-mode'); document.title = 'Bulle · CallIt!';
      if (!app.querySelector('.bulle')) { app.innerHTML = view(); if (B.alpha !== 1) nat('transparence', B.alpha); }
      else draw();
      return;
    }
    document.body.classList.remove('bulle-mode');
    baseRender(keepFocus);
  };
  if (isBulle()) render();
})();
