/* CallIt! · En voyage : les boutiques de cartes autour d'une ville, avec leur profil CallIt!.
   Sources : OpenStreetMap (carte libre et gratuite). La ville tapée est cherchée avec Nominatim, les boutiques avec Overpass,
   dans le respect de leurs règles d'usage : une requête par action de l'utilisateur, résultats gardés en cache sur l'appareil.
   On n'enregistre que des commerces (nom, adresse de la boutique, horaires publics), jamais d'adresse de particulier.
   « Autour de moi » : la position est arrondie (~1 km) avant d'être envoyée, et n'est pas gardée.
   Les étiquettes (profil) et le passeport restent sur l'appareil.
   Fichier séparé de app.js : il réutilise ses fonctions (load, save, esc, norm, money, rate, userCur, F, tr…) et s'ajoute au routeur. */
(function () {
  'use strict';
  if (typeof render !== 'function') return;

  const NOMINATIM = 'https://nominatim.openstreetmap.org';
  const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
  // Commerces où l'on trouve des cartes ; les catégories larges (librairie, kiosque…) ne sont gardées que si le nom parle de cartes
  const SHOP_TYPES = 'games|collector|comics|anime|hobby|trade|toys|video_games|books|gift|newsagent|kiosk|stationery';
  const BROAD = new Set(['books', 'gift', 'newsagent', 'kiosk', 'stationery']);
  const CACHE_DAYS = 14;

  /* ---------- Étiquettes du profil d'une boutique ---------- */
  // alert : « alerte fiabilité » (encadré rouge) ; 'warn' : étiquette en rouge seulement ; user:false : déduite des données (pas proposée à l'utilisateur)
  const TAGS = [
    ['vraie', 'Vraie boutique de cartes'], ['unite', 'Cartes à l’unité'], ['scelle', 'Produits scellés'],
    ['vintage', 'Cartes anciennes (vintage)'], ['gradees', 'Cartes gradées'], ['japonais', 'Cartes japonaises'],
    ['rachat', 'Rachète des cartes'], ['echange', 'Échanges sur place'], ['tournois', 'Tournois'],
    ['prixok', 'Prix justes'], ['prixhaut', 'Prix au-dessus du marché', 'warn'], ['horaires', 'Horaires pas toujours respectés', true],
    ['dimanche', 'Ouvert le dimanche', false, false]
  ].map(([id, label, alert, user]) => ({ id, label, alert: alert === true, warn: !!alert, user: user !== false }));
  const TAG = Object.fromEntries(TAGS.map(t => [t.id, t]));

  const KINDS = { games: ['Jeux et cartes', 2], collector: ['Objets de collection', 2], anime: ['Manga et anime', 2], comics: ['BD et mangas', 1], hobby: ['Loisirs', 1], trade: ['Achat-vente', 1], toys: ['Jouets', 0], video_games: ['Jeux vidéo', 1] };
  const NAME_RE = /(^|[^a-z])(cards?|cartes?|carta|karten?|tcg|pokemon|magic|yu-?gi|trading)([^a-z]|$)/i;

  // Pays → devise, pour le petit convertisseur (pays de CallIt! + destinations fréquentes)
  const CUR_OF = Object.assign({ KR: 'KRW', TH: 'THB', CN: 'CNY', HK: 'HKD', SG: 'SGD', TR: 'TRY', BR: 'BRL', IL: 'ILS', IN: 'INR', MX: 'MXN', MY: 'MYR', NZ: 'NZD', PH: 'PHP', ZA: 'ZAR', ID: 'IDR', ME: 'EUR', XK: 'EUR', SM: 'EUR', VA: 'EUR', AD: 'EUR' },
    Object.fromEntries(COUNTRIES.map(c => [c[0], c[2]])));

  /* ---------- Données gardées sur l'appareil ---------- */
  const V = Object.assign({ trip: null, radius: 5, all: false }, load('voyage', {}));
  const saveV = () => save('voyage', V);
  let marks = load('boutiques', {});         // { id: { tags: [], visited: 'AAAA-MM-JJ', snap: {…} } }
  if (!marks || typeof marks !== 'object' || Array.isArray(marks)) marks = {};
  const saveMarks = () => save('boutiques', marks);
  let cache = load('voyageCache', {});       // { clé: { at, list } }
  if (!cache || typeof cache !== 'object' || Array.isArray(cache)) cache = {};

  const st = { loading: false, err: '', places: null, shops: null, amount: '', last: 0 };
  let CURATED = null;
  function loadCurated() {
    if (CURATED) return Promise.resolve(CURATED);
    return fetch('data/boutiques.json').then(r => r.ok ? r.json() : { shops: [] }).catch(() => ({ shops: [] })).then(d => { CURATED = d; return d; });
  }

  /* ---------- Outils ---------- */
  const R2 = v => Math.round(v * 100) / 100; // arrondi à ~1 km
  function dist(a, b, c, d) {
    const r = Math.PI / 180, x = Math.sin((c - a) * r / 2), y = Math.sin((d - b) * r / 2);
    return 12742 * Math.asin(Math.sqrt(x * x + Math.cos(a * r) * Math.cos(c * r) * y * y));
  }
  const km = v => v < 1 ? Math.max(50, Math.round(v * 20) * 50).toLocaleString(LOCALE) + ' m' : (Math.round(v * 10) / 10).toLocaleString(LOCALE) + ' km';
  const safeUrl = u => { if (!u) return ''; u = String(u).trim().split(/\s*;\s*/)[0]; if (!/^https?:\/\//i.test(u)) u = 'https://' + u; try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : ''; } catch (e) { return ''; } };
  const today = () => new Date().toISOString().slice(0, 10);
  const fdateShort = s => { const d = new Date(s + 'T12:00:00'); return isNaN(d) ? s : d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' }); };

  // Horaires OpenStreetMap (« Mo-Fr 10:00-19:00; Sa 10:00-13:00,15:00-19:00; Su off ») → 7 lignes, lundi d'abord. null si format inconnu.
  const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
  function parseHours(s) {
    if (!s) return null;
    s = String(s).trim();
    if (s === '24/7') return DAYS.map(() => '24 h/24');
    const out = DAYS.map(() => null); let any = false;
    for (let part of s.split(';')) {
      part = part.trim(); if (!part) continue;
      const m = /^((?:Mo|Tu|We|Th|Fr|Sa|Su)(?:\s*-\s*(?:Mo|Tu|We|Th|Fr|Sa|Su))?(?:\s*,\s*(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:\s*-\s*(?:Mo|Tu|We|Th|Fr|Sa|Su))?)*)\s+(off|closed|(?:\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}(?:\s*,\s*\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2})*))$/.exec(part);
      if (!m) { if (/^PH\b/.test(part)) continue; return null; }
      const times = /off|closed/.test(m[2]) ? '' : m[2].replace(/\s+/g, '').replace(/-/g, '–').replace(/,/g, ', ');
      for (const rg of m[1].split(',')) {
        const [a, b] = rg.split('-').map(x => DAYS.indexOf(x.trim()));
        for (let i = a; ; i = (i + 1) % 7) { out[i] = times; if (b < 0 || b === undefined || i === b) break; }
      }
      any = true;
    }
    return any ? out : null;
  }
  const dayName = i => new Date(2024, 0, 1 + i).toLocaleDateString(LOCALE, { weekday: 'long' }); // 1er janvier 2024 = lundi
  const openSunday = h => !!(h && h[6]);

  /* ---------- Recherche ---------- */
  async function getJSON(url, opts) {
    const r = await fetch(url, Object.assign({ headers: { Accept: 'application/json' } }, opts || {}));
    if (!r.ok) throw new Error('http ' + r.status);
    return r.json();
  }
  async function geocode(q) {
    const u = NOMINATIM + '/search?format=jsonv2&limit=5&addressdetails=1&accept-language=' + encodeURIComponent(UI) + '&q=' + encodeURIComponent(q);
    const rows = await getJSON(u);
    return (rows || []).map(p => ({
      name: p.name || String(p.display_name || '').split(',')[0],
      label: String(p.display_name || '').split(',').slice(0, 3).map(x => x.trim()).filter(Boolean).join(', '),
      lat: +p.lat, lon: +p.lon, cc: ((p.address && p.address.country_code) || '').toUpperCase()
    })).filter(p => isFinite(p.lat) && isFinite(p.lon));
  }
  async function reverse(lat, lon) {
    try {
      const p = await getJSON(NOMINATIM + '/reverse?format=jsonv2&zoom=10&addressdetails=1&accept-language=' + encodeURIComponent(UI) + '&lat=' + lat + '&lon=' + lon);
      const a = p.address || {};
      return { name: a.city || a.town || a.village || a.municipality || '', cc: (a.country_code || '').toUpperCase() };
    } catch (e) { return { name: '', cc: '' }; }
  }
  function shopFrom(el, lat0, lon0) {
    const t = el.tags || {}; const lat = el.lat != null ? el.lat : el.center && el.center.lat, lon = el.lon != null ? el.lon : el.center && el.center.lon;
    if (!t.name || lat == null) return null;
    const kind = KINDS[t.shop] ? t.shop : 'other', nameHit = NAME_RE.test(norm(t.name));
    if (BROAD.has(t.shop) && !nameHit) return null;
    const addr = [[t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' '), t['addr:city']].filter(Boolean).join(', ');
    return {
      id: el.type[0] + el.id, name: String(t.name).slice(0, 80), lat, lon, kind,
      score: (nameHit ? 3 : 0) + (KINDS[kind] ? KINDS[kind][1] : 0),
      addr: addr.slice(0, 120), hours: (t.opening_hours || '').slice(0, 200), web: safeUrl(t.website || t['contact:website']),
      d: dist(lat0, lon0, lat, lon)
    };
  }
  async function findShops(lat, lon, radius) {
    const key = R2(lat) + ',' + R2(lon) + ',' + radius;
    const hit = cache[key];
    if (hit && Date.now() - hit.at < CACHE_DAYS * 864e5) return hit.list;
    const R = radius * 1000;
    // Une seule requête légère (filtre par type de commerce) : le tri par nom se fait ensuite sur l'appareil
    const q = `[out:json][timeout:25];nwr["shop"~"^(${SHOP_TYPES})$"](around:${R},${lat},${lon});out center tags 500;`;
    let data = null, lastErr = null;
    for (const ep of OVERPASS) {
      const ctl = window.AbortController ? new AbortController() : null, tm = ctl && setTimeout(() => ctl.abort(), 30000);
      try { data = await getJSON(ep, { signal: ctl ? ctl.signal : undefined, method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' } }); clearTimeout(tm); break; } catch (e) { clearTimeout(tm); lastErr = e; }
    }
    if (!data) throw lastErr || new Error('overpass');
    const seen = new Set(), list = [];
    for (const el of data.elements || []) { const s = shopFrom(el, lat, lon); if (s && !seen.has(s.id)) { seen.add(s.id); list.push(s); } }
    list.sort((a, b) => b.score - a.score || a.d - b.d);
    // Cache : 6 recherches au plus, les plus récentes
    cache[key] = { at: Date.now(), list };
    const keys = Object.keys(cache).sort((a, b) => cache[b].at - cache[a].at);
    for (const k of keys.slice(6)) delete cache[k];
    save('voyageCache', cache);
    return list;
  }
  async function loadTrip() {
    if (!V.trip) return;
    st.loading = true; st.err = ''; draw();
    try { st.shops = await findShops(V.trip.lat, V.trip.lon, V.radius); await loadCurated(); }
    catch (e) { st.err = navigator.onLine === false ? 'Pas de connexion. Les boutiques déjà cherchées restent visibles hors connexion.' : 'OpenStreetMap ne répond pas pour l’instant. Réessaie dans une minute.'; }
    st.loading = false; draw();
  }
  async function searchCity(q) {
    q = (q || '').trim(); if (!q) return;
    if (Date.now() - st.last < 1500) return; // règle Nominatim : pas plus d'une requête par seconde
    st.last = Date.now(); st.loading = true; st.err = ''; st.places = null; draw();
    try {
      const places = await geocode(q);
      if (!places.length) { st.loading = false; st.err = 'Ville introuvable. Essaie avec le nom du pays, par exemple « Rome, Italie ».'; draw(); return; }
      st.places = places.length > 1 ? places : null;
      pickPlace(places[0]);
    } catch (e) { st.loading = false; st.err = 'La recherche de ville ne répond pas pour l’instant. Réessaie dans une minute.'; draw(); }
  }
  function pickPlace(p) {
    V.trip = { name: p.name, label: p.label || p.name, lat: p.lat, lon: p.lon, cc: p.cc, mine: !!p.mine, at: today() };
    saveV(); st.shops = null; loadTrip();
  }
  function aroundMe() {
    if (!navigator.geolocation) { st.err = 'Ton appareil ne donne pas sa position.'; draw(); return; }
    st.loading = true; st.err = ''; st.places = null; draw();
    navigator.geolocation.getCurrentPosition(async pos => {
      const lat = R2(pos.coords.latitude), lon = R2(pos.coords.longitude);
      const r = await reverse(lat, lon);
      pickPlace({ name: r.name || 'Autour de moi', label: r.name ? F('Autour de moi ({0})', r.name) : 'Autour de moi', lat, lon, cc: r.cc, mine: true });
    }, () => { st.loading = false; st.err = 'Position refusée ou indisponible. Tape plutôt le nom de la ville.'; draw(); }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 });
  }

  /* ---------- Profil : fiches CallIt! + étiquettes de l'utilisateur ---------- */
  function curatedHere() {
    if (!CURATED || !V.trip) return [];
    const n = norm(V.trip.name + ' ' + V.trip.label);
    return (CURATED.shops || []).filter(c => (c.cities || []).some(k => new RegExp('(^|[^a-z])' + k + '([^a-z]|$)').test(n)));
  }
  // Fiche CallIt! d'une boutique OpenStreetMap : même nom, dans la même ville (la ville cherchée ou celle de la boutique)
  function curatedFor(s) {
    if (!s || !CURATED) return null;
    const where = norm([V.trip && V.trip.name, V.trip && V.trip.label, s.city, s.addr].filter(Boolean).join(' '));
    return (CURATED.shops || []).find(c => (c.match || []).some(m => norm(s.name).includes(m)) && (c.cities || []).some(k => new RegExp('(^|[^a-z])' + k + '([^a-z]|$)').test(where))) || null;
  }
  function tagsOf(s, cur) {
    const set = new Set([...(cur ? cur.tags : []), ...((marks[s.id] && marks[s.id].tags) || [])]);
    if (openSunday(parseHours(s.hours))) set.add('dimanche');
    return TAGS.filter(t => set.has(t.id));
  }
  const isCardShop = s => s.score >= 2 || !!curatedFor(s) || !!(marks[s.id] && (marks[s.id].tags || []).includes('vraie'));
  function findShop(id) {
    if (st.shops) { const s = st.shops.find(x => x.id === id); if (s) return s; }
    for (const k in cache) { const s = (cache[k].list || []).find(x => x.id === id); if (s) return s; }
    if (marks[id] && marks[id].snap) return marks[id].snap;
    const c = CURATED && (CURATED.shops || []).find(x => x.id === id);
    return c ? { id, name: c.name, city: c.city, kind: 'other', score: 3, hours: '', web: '', addr: '', curatedOnly: true } : null;
  }
  function mark(s) {
    const m = marks[s.id] || (marks[s.id] = { tags: [] });
    m.snap = { id: s.id, name: s.name, lat: s.lat, lon: s.lon, kind: s.kind, score: s.score, addr: s.addr, hours: s.hours, web: s.web, city: s.city || (V.trip && V.trip.name) || '', cur: s.cur || '' };
    return m;
  }
  function cleanMark(id) { const m = marks[id]; if (m && !m.visited && !(m.tags || []).length) delete marks[id]; }

  /* ---------- Affichage ---------- */
  let root = null;
  const draw = () => { if (isVoyage()) render(); };
  const PIN = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>';
  const STAMP = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9.5"/></svg>';
  const kindLabel = s => KINDS[s.kind] ? KINDS[s.kind][0] : 'Boutique';
  const badge = t => `<span class="vy-tag ${t.warn ? 'alert' : ''}">${esc(t.label)}</span>`;

  function shopRow(s) {
    const cur = curatedFor(s), tg = tagsOf(s, cur), m = marks[s.id];
    const sub = tr(kindLabel(s)) + (s.d != null ? ' · ' + km(s.d) + ' ' + tr(V.trip && V.trip.mine ? 'de toi' : 'du centre') : '');
    return `<a class="line vy-shop" href="#/boutique/${encodeURIComponent(s.id)}"><span class="vy-pin">${PIN}</span><span class="mid"><b data-noi18n>${esc(s.name)}</b><span data-noi18n>${esc(sub)}${s.addr ? ' · ' + esc(s.addr) : ''}</span>${tg.length || cur ? `<span class="vy-tags">${cur ? '<span class="vy-tag callit">Repérée par CallIt!</span>' : ''}${tg.slice(0, 4).map(badge).join('')}</span>` : ''}</span>${m && m.visited ? `<span class="vy-stamped" title="Tamponnée">${STAMP}</span>` : ''}</a>`;
  }
  function curatedRow(c) {
    return `<a class="line vy-shop" href="#/boutique/${encodeURIComponent(c.id)}"><span class="vy-pin">${PIN}</span><span class="mid"><b data-noi18n>${esc(c.name)}</b><span data-noi18n>${esc(c.city)}</span><span class="vy-tags"><span class="vy-tag callit">Repérée par CallIt!</span>${c.tags.map(id => TAG[id]).filter(Boolean).slice(0, 3).map(badge).join('')}</span></span></a>`;
  }
  function currencyBox() {
    const cc = V.trip && V.trip.cc, local = cc && CUR_OF[cc], mine = userCur();
    if (!local || local === mine || !rate(local) || !rate(mine)) return '';
    const ref = rate(local) / rate(mine) > 20 ? 1000 : 10;
    const conv = v => v / rate(local) * rate(mine);
    const amt = NUMV(st.amount, null);
    return `<div class="pad" style="margin-top:14px"><div class="panel stack" style="gap:8px"><b style="font-size:15px">${esc(F('Là-bas, on paie en {0}', local))}</b>
      <div class="small">${esc(money(ref, local))} ≈ <b>${esc(money(conv(ref), mine))}</b> · ${RATES.approx ? esc(tr('taux approximatif')) : esc(F('taux BCE du {0}', fdateShort(RATES.date)))}</div>
      <label class="vy-conv"><span class="sr">Prix affiché en boutique</span><input id="vyamt" inputmode="decimal" autocomplete="off" placeholder="${esc(tr('Prix en boutique'))} (${esc(local)})" value="${esc(st.amount)}"><span id="vyconv" class="num">${amt != null ? '≈ ' + esc(money(conv(amt), mine)) : ''}</span></label>
      <div class="small">Ta banque ajoute souvent des frais de change : regarde-les avant de payer.</div></div></div>`;
  }
  function passport() {
    const stamps = Object.entries(marks).filter(([, m]) => m.visited && m.snap).sort((a, b) => b[1].visited.localeCompare(a[1].visited));
    if (!stamps.length) return `<div class="sect"><h2 class="h2">Mon passeport</h2></div><p class="pad small" style="margin:0">Touche « Tamponner mon passeport » sur la fiche d’une boutique quand tu y passes. Ton passeport reste sur ton appareil.</p>`;
    const cities = new Set(stamps.map(([, m]) => norm(m.snap.city || '')).filter(Boolean));
    return `<div class="sect between"><h2 class="h2">Mon passeport</h2><span class="sub">${esc(F(stamps.length > 1 ? '{0} boutiques' : '{0} boutique', stamps.length))}${cities.size ? ' · ' + esc(F(cities.size > 1 ? '{0} villes' : '{0} ville', cities.size)) : ''}</span></div>
      <div class="vy-pass">${stamps.slice(0, 24).map(([id, m]) => `<a class="vy-stamp" href="#/boutique/${encodeURIComponent(id)}"><b data-noi18n>${esc(m.snap.name)}</b><span>${esc(m.snap.city || '')}</span><span>${esc(fdateShort(m.visited))}</span></a>`).join('')}</div>`;
  }
  function viewVoyage() {
    const t = V.trip, list = st.shops || [];
    const shown = V.all ? list : list.filter(isCardShop);
    const cur = curatedHere(), unmatched = cur.filter(c => !list.some(s => (c.match || []).some(m => norm(s.name).includes(m))));
    const others = list.length - list.filter(isCardShop).length;
    let body = '';
    if (st.loading) body = `<p class="pad sub" role="status">Recherche des boutiques…</p>`;
    else if (t && st.shops) {
      body = `<div class="sect between"><h2 class="h2">${esc(t.mine ? tr('Boutiques autour de moi') : F('Boutiques à {0}', t.name))}</h2><span class="sub">${esc(F(shown.length > 1 ? '{0} trouvées' : '{0} trouvée', shown.length))}</span></div>
      <div class="pad chips scroll" style="padding-bottom:10px">${[2, 5, 15].map(r => `<button class="chip ${V.radius === r ? 'on' : ''}" data-act="vyradius" data-v="${r}">${r} km</button>`).join('')}<button class="chip ${V.all ? 'on' : ''}" data-act="vyall" aria-pressed="${V.all}">Aussi jouets et loisirs${others && !V.all ? ' (' + others + ')' : ''}</button></div>
      <div class="list">${shown.map(shopRow).join('') || `<div class="note">${esc(tr(list.length ? 'Aucune boutique de cartes repérée ici. Touche « Aussi jouets et loisirs » pour voir les autres magasins.' : 'Aucune boutique trouvée dans ce rayon. Essaie un rayon plus large.'))}</div>`}</div>
      ${unmatched.length ? `<div class="sect"><h2 class="h2">Repérées par CallIt!</h2></div><p class="pad small" style="margin:0 0 8px">Pas encore placées sur la carte : la fiche ouvre leur recherche dans Google Maps.</p><div class="list">${unmatched.map(curatedRow).join('')}</div>` : ''}
      <p class="pad small" style="margin-top:12px">Une boutique manque ? Tout le monde peut l’ajouter sur <a href="https://www.openstreetmap.org/" target="_blank" rel="noopener">OpenStreetMap</a>, elle apparaîtra ici.</p>`;
    } else if (t && !st.err) { if (!st.pending) { st.pending = true; setTimeout(() => { st.pending = false; loadTrip(); }, 0); } body = `<p class="pad sub" role="status">Recherche des boutiques…</p>`; }
    return `<div class="top">${backBtn()}<span class="sub" style="font-weight:600">En voyage</span><span style="width:44px"></span></div>
    <div class="pad"><h1 class="h1">En voyage</h1><p class="sub">Les boutiques de cartes autour d’une ville, avec leur profil CallIt!.</p></div>
    <form class="pad vy-form" id="vyform" role="search" style="padding-top:10px"><label for="vyq" class="sr">Ville</label><div class="searchrow"><input id="vyq" class="search" type="search" enterkeyhint="search" autocomplete="off" placeholder="${esc(tr('Où pars-tu ? Rome, Tokyo, Lyon…'))}" value="${t && !t.mine ? esc(t.name) : ''}"><button class="btn small primary" type="submit">Chercher</button></div>
    <button type="button" class="btn small vy-me" data-act="vyme">${PIN} Autour de moi</button></form>
    ${st.places && !st.loading ? `<div class="pad small" style="margin-top:8px">Pas cette ville ? <span class="chips wrap" style="margin-top:6px">${st.places.slice(1).map((p, i) => `<button class="chip" data-act="vyplace" data-v="${i + 1}" data-noi18n>${esc(p.label)}</button>`).join('')}</span></div>` : ''}
    ${st.err ? `<div class="pad" style="margin-top:10px"><div class="note" role="alert">${esc(tr(st.err))}${t ? ' <button class="btn small" data-act="vyretry" style="margin-top:8px">Réessayer</button>' : ''}</div></div>` : ''}
    ${t ? `<p class="pad small" style="margin:10px 0 0" data-noi18n>${PIN} ${esc(t.label)}</p>` : ''}
    ${body}${currencyBox()}${passport()}
    <p class="pad small" style="margin-top:18px">Données des boutiques : © les contributeurs d’<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> (licence ODbL). CallIt! n’a aucun lien commercial avec ces boutiques.</p>
    <p class="pad small">Tu tiens une boutique de cartes ? Écris-nous à <a href="mailto:request@callitcards.com">request@callitcards.com</a> pour compléter ta fiche.</p>${tabs('')}`;
  }

  function viewShop(id) {
    const cur0 = CURATED && (CURATED.shops || []).find(c => c.id === id);
    const s = findShop(id);
    if (!s) {
      if (!CURATED) loadCurated().then(draw);
      return `<div class="top">${backBtn()}<span></span><span style="width:44px"></span></div><div class="pad"><div class="note">${esc(tr(CURATED ? 'Cette boutique n’est plus dans les recherches gardées sur l’appareil. Cherche à nouveau la ville.' : 'Chargement…'))}</div><a class="btn small" style="margin-top:12px" href="#/voyage">En voyage</a></div>${tabs('')}`;
    }
    const cur = cur0 || curatedFor(s), tg = tagsOf(s, cur), m = marks[s.id] || { tags: [] }, h = parseHours(s.hours);
    const alerts = tg.filter(t => t.alert);
    const today0 = (new Date().getDay() + 6) % 7;
    const hours = h ? `<table class="vy-hours">${h.map((x, i) => `<tr class="${i === today0 ? 'today' : ''}"><th>${esc(dayName(i))}</th><td>${x == null ? '—' : x ? esc(x) : esc(tr('fermé'))}</td></tr>`).join('')}</table>`
      : s.hours ? `<div class="small" data-noi18n>${esc(s.hours)}</div>` : `<div class="small">Horaires non indiqués sur OpenStreetMap.</div>`;
    return `<div class="top">${backBtn()}<span class="sub" style="font-weight:600">En voyage</span><span style="width:44px"></span></div>
    <div class="pad"><h1 class="h1" data-noi18n>${esc(s.name)}</h1><p class="sub">${esc(tr(kindLabel(s)))}${s.d != null && !s.curatedOnly ? ' · ' + esc(km(s.d)) + ' ' + esc(tr(V.trip && V.trip.mine ? 'de toi' : 'du centre')) : ''}${s.city && s.curatedOnly ? ' · ' + esc(s.city) : ''}</p>${s.addr ? `<button class="vy-addr small" data-act="vygo" data-id="${esc(s.id)}" data-noi18n>${PIN}<span>${esc(s.addr)}</span></button>` : ''}</div>
    ${alerts.length ? `<div class="pad" style="margin-top:10px"><div class="vy-alert" role="note"><b>Alerte fiabilité</b> · ${alerts.map(t => esc(tr(t.label))).join(' · ')}</div></div>` : ''}
    <div class="pad row" style="flex-wrap:wrap;gap:8px;margin-top:12px"><button class="btn small primary" data-act="vygo" data-id="${esc(s.id)}">Itinéraire</button>${s.web ? `<a class="btn small" href="${esc(s.web)}" target="_blank" rel="noopener nofollow">Site de la boutique</a>` : ''}${!s.curatedOnly ? `<a class="btn small" href="https://www.openstreetmap.org/${{ n: 'node', w: 'way', r: 'relation' }[s.id[0]]}/${esc(s.id.slice(1))}" target="_blank" rel="noopener">Voir sur OpenStreetMap</a>` : ''}</div>
    <div class="sect"><h2 class="h2">Profil CallIt!</h2></div>
    <div class="pad stack" style="gap:8px">${tg.length ? `<div class="vy-tags big">${tg.map(badge).join('')}</div>` : '<p class="small" style="margin:0">Pas encore de profil. Ajoute tes étiquettes ci-dessous après ta visite.</p>'}
    ${cur ? `<div class="note"><b>Repérée par CallIt!</b> · ${esc(tr(cur.text))}<div class="small" style="margin-top:4px">${esc(F('Relevé du {0} à partir d’avis publics. À confirmer sur place.', fdateShort(CURATED.date)))}</div></div>` : ''}</div>
    <div class="sect"><h2 class="h2">Horaires</h2></div><div class="pad">${hours}${h ? '<div class="small" style="margin-top:6px">D’après OpenStreetMap. Vérifie sur le site de la boutique avant de faire le trajet.</div>' : ''}</div>
    <div class="sect"><h2 class="h2">Mon avis</h2></div>
    <div class="pad"><div class="chips wrap">${TAGS.filter(t => t.user).map(t => `<button class="chip ${(m.tags || []).includes(t.id) ? 'on' : ''}" data-act="vytag" data-id="${esc(s.id)}" data-v="${t.id}" aria-pressed="${(m.tags || []).includes(t.id)}">${esc(t.label)}</button>`).join('')}</div>
    <p class="small">Tes étiquettes restent sur ton appareil. Plus tard, elles pourront aider les autres collectionneurs, sans ton nom.</p>
    <button class="btn ${m.visited ? '' : 'primary'}" data-act="vystamp" data-id="${esc(s.id)}" style="margin-top:6px">${STAMP}&nbsp; ${m.visited ? esc(F('Tamponnée le {0} (retirer)', fdateShort(m.visited))) : esc(tr('Tamponner mon passeport'))}</button></div>
    <p class="pad small" style="margin-top:18px">Tu tiens cette boutique ? Écris-nous à <a href="mailto:request@callitcards.com">request@callitcards.com</a> pour compléter sa fiche.</p>
    ${!s.curatedOnly ? '<p class="pad small">Données : © les contributeurs d’<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> (licence ODbL).</p>' : ''}${tabs('')}`;
  }

  /* ---------- Itinéraire : l'utilisateur choisit son appli (Google Maps, Waze, Plans…) ---------- */
  // Liens web « universels » : sur téléphone, ils ouvrent l'appli si elle est installée, sinon le site.
  const APPLE = /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);
  function routeApps(s) {
    const ll = s.curatedOnly ? null : s.lat + ',' + s.lon, q = encodeURIComponent(s.name + (s.city ? ', ' + s.city : ''));
    const apps = [
      ['google', 'Google Maps', ll ? 'https://www.google.com/maps/dir/?api=1&destination=' + ll : 'https://www.google.com/maps/search/?api=1&query=' + q],
      ['waze', 'Waze', ll ? 'https://waze.com/ul?ll=' + ll + '&navigate=yes' : 'https://waze.com/ul?q=' + q + '&navigate=yes'],
      ['apple', 'Plans (Apple)', ll ? 'https://maps.apple.com/?daddr=' + ll + '&q=' + encodeURIComponent(s.name) : 'https://maps.apple.com/?q=' + q],
      ['osm', 'OpenStreetMap', ll ? 'https://www.openstreetmap.org/directions?to=' + ll : 'https://www.openstreetmap.org/search?query=' + q]
    ].filter(a => a[0] !== 'apple' || APPLE);
    const last = V.mapApp; apps.sort((a, b) => (b[0] === last) - (a[0] === last));
    return apps;
  }
  function openRoute(s) {
    const d = document.createElement('dialog'); d.className = 'sheet';
    d.innerHTML = `<form class="sheet-in" method="dialog"><b style="font-size:17px">Y aller avec…</b>${routeApps(s).map(([k, n, u]) => `<a class="btn ${k === V.mapApp ? 'primary' : ''}" href="${esc(u)}" target="_blank" rel="noopener" data-app="${k}">${esc(n)}</a>`).join('')}<button class="btn" value="">Annuler</button><div class="note">L’appli s’ouvre si elle est installée sur ton téléphone, sinon son site. CallIt! retient ton choix pour la prochaine fois.</div></form>`;
    document.body.appendChild(d);
    d.addEventListener('click', e => { const a = e.target.closest('a[data-app]'); if (a) { V.mapApp = a.dataset.app; saveV(); setTimeout(() => d.close(), 0); } });
    d.addEventListener('close', () => d.remove());
    d.showModal();
  }

  /* ---------- Actions ---------- */
  document.addEventListener('submit', e => {
    if (e.target && e.target.id === 'vyform') { e.preventDefault(); const i = document.getElementById('vyq'); if (i) { i.blur(); searchCity(i.value); } }
  });
  document.addEventListener('input', e => {
    if (e.target && e.target.id === 'vyamt') {
      st.amount = e.target.value; const out = document.getElementById('vyconv');
      const local = V.trip && CUR_OF[V.trip.cc], amt = NUMV(st.amount, null);
      if (out && local) out.textContent = amt != null ? '≈ ' + money(amt / rate(local) * rate(userCur()), userCur()) : '';
    }
  });
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act^="vy"]'); if (!el) return;
    const a = el.dataset.act;
    if (a === 'vyme') aroundMe();
    else if (a === 'vygo') { const s = findShop(el.dataset.id); if (s) openRoute(s); }
    else if (a === 'vyretry') { st.err = ''; loadTrip(); }
    else if (a === 'vyradius') { V.radius = +el.dataset.v; saveV(); st.shops = null; loadTrip(); }
    else if (a === 'vyall') { V.all = !V.all; saveV(); draw(); }
    else if (a === 'vyplace') { const p = st.places && st.places[+el.dataset.v]; if (p) { st.places = null; pickPlace(p); } }
    else if (a === 'vytag') {
      const s = findShop(el.dataset.id); if (!s) return;
      const m = mark(s), v = el.dataset.v; m.tags = (m.tags || []).includes(v) ? m.tags.filter(x => x !== v) : [...(m.tags || []), v];
      cleanMark(s.id); saveMarks(); draw();
    } else if (a === 'vystamp') {
      const s = findShop(el.dataset.id); if (!s) return;
      const m = mark(s); if (m.visited) delete m.visited; else { m.visited = today(); toast(tr('Boutique tamponnée dans ton passeport')); }
      cleanMark(s.id); saveMarks(); draw();
    }
  });

  /* ---------- Branchement dans l'appli ---------- */
  const route = () => location.hash.replace(/^#\/?/, '').split(/[/?]/)[0];
  const isVoyage = () => DB && S.face && (route() === 'voyage' || route() === 'boutique');
  const baseRender = render;
  render = function (keepFocus) {
    if (isVoyage()) {
      document.body.dataset.face = G() ? 'galerie' : 'marche';
      const r = route();
      if (r === 'boutique') { const id = decodeURIComponent(location.hash.split('/')[2] || '').split('?')[0]; if (!CURATED) loadCurated().then(draw); app.innerHTML = viewShop(id); document.title = tr('Boutique') + ' · CallIt!'; }
      else { if (!CURATED && V.trip) loadCurated().then(draw); app.innerHTML = viewVoyage(); document.title = tr('En voyage') + ' · CallIt!'; }
      root = app;
      return;
    }
    root = null;
    baseRender(keepFocus);
    // Accès : un lien « En voyage » sous la recherche de l'accueil (à côté du Mode Live)
    if (DB && S.face && route() === '') {
      const anchor = app.querySelector('.lv-homelink') || app.querySelector('.home-head .searchrow');
      const cb = app.querySelector('.home-head .ctr-homelink b'); if (cb) cb.textContent = tr('Centrage'); // libellé court pour tenir sur une ligne
      if (anchor && !app.querySelector('.vy-homelink')) anchor.insertAdjacentHTML('afterend', `<a class="lv-homelink vy-homelink" href="#/voyage">${PIN}<b>En voyage</b><span>${esc(V.trip && !V.trip.mine ? F('les boutiques de cartes à {0}', V.trip.name) : tr('les boutiques de cartes autour d’une ville'))}</span></a>`);
    }
  };
  // Les cartes ont pu finir de charger avant ce fichier : on refait l'affichage pour ajouter le lien ou la page
  if (DB && S.face) render();
})();
