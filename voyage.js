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
  const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
  // Commerces où l'on trouve des cartes ; les catégories larges (librairie, kiosque, dépôt-vente…) ne sont gardées que si le nom parle de cartes.
  // Pas de shop=trade : dans OpenStreetMap, c'est un fournisseur pour artisans (plomberie, bois, matériaux), pas un « achat-vente ».
  const SHOP_TYPES = 'games|collector|comics|anime|hobby|toys|video_games|books|gift|newsagent|kiosk|stationery|second_hand';
  const BROAD = new Set(['books', 'gift', 'newsagent', 'kiosk', 'stationery', 'second_hand']);
  const CACHE_DAYS = 14;
  const SUPA_RPC = (typeof SUPA === 'object' && SUPA.url) ? SUPA.url + '/rest/v1/rpc/' : '';

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

  const KINDS = { games: ['Jeux et cartes', 2], collector: ['Objets de collection', 2], anime: ['Manga et anime', 2], comics: ['BD et mangas', 1], hobby: ['Loisirs', 1], toys: ['Jouets', 1], video_games: ['Jeux vidéo', 1], second_hand: ['Occasion', 0], books: ['Librairie', 0], gift: ['Cadeaux', 0], newsagent: ['Presse', 0], kiosk: ['Kiosque', 0], stationery: ['Papeterie', 0] };
  const NAME_RE = /(^|[^a-z])(cards?|cartes?|carte da gioco|carta|karten?|tcg|ccg|pokemon|magic|yu-?gi(-?oh)?|one piece|lorcana|trading|collezionabili|coleccionables|sammelkarten)([^a-z]|$)/i;

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
    const kind = KINDS[t.shop] ? t.shop : 'other', nameHit = NAME_RE.test(norm(t.name)) || NAME_RE.test(norm([t.description, t.games, t.collector, t.trade].filter(Boolean).join(' ')));
    if (BROAD.has(t.shop) && !nameHit) return null;
    const addr = [[t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' '), t['addr:city']].filter(Boolean).join(', ');
    return {
      id: el.type[0] + el.id, name: String(t.name).slice(0, 80), lat, lon, kind, sure: nameHit || undefined,
      score: (nameHit ? 3 : 0) + (KINDS[kind] ? KINDS[kind][1] : 0),
      addr: addr.slice(0, 120), hours: (t.opening_hours || '').slice(0, 200), web: safeUrl(t.website || t['contact:website']),
      d: dist(lat0, lon0, lat, lon)
    };
  }
  // Une recherche déjà faite plus large autour du même point suffit : on trie sur l'appareil, sans attendre le réseau
  function fromCache(lat, lon, radius, stale) {
    let best = null;
    for (const r of [radius, 5, 15]) {
      if (r < radius) continue;
      const hit = cache[R2(lat) + ',' + R2(lon) + ',' + r];
      if (hit && hit.v === 2 && (stale || Date.now() - hit.at < CACHE_DAYS * 864e5)) { best = hit.list; break; }
    }
    return best && best.filter(s => s.d <= radius + 0.05);
  }
  // Les serveurs publics d'OpenStreetMap sont parfois lents : on interroge le premier, puis un deuxième s'il n'a pas répondu
  // au bout de 2,5 s, puis un troisième à 6 s ; la première bonne réponse gagne et on coupe les autres.
  // Une requête courte (timeout 12 s, taille limitée) passe aussi plus vite dans leur file d'attente.
  function overpass(q) {
    return new Promise((ok, ko) => {
      const ctls = [], timers = []; let done = false, failed = 0, started = 0;
      const eps = OVERPASS.slice(0, 3);
      const finish = (data, err) => {
        if (done) return;
        if (data) { done = true; timers.forEach(clearTimeout); ctls.forEach(c => c && c.abort()); ok(data); return; }
        failed++; if (failed >= eps.length) { done = true; ko(err || new Error('overpass')); }
        else if (started <= failed) launch(); // un serveur a refusé tout de suite : on passe au suivant sans attendre
      };
      const launch = () => {
        if (done || started >= eps.length) return;
        const ep = eps[started++], ctl = window.AbortController ? new AbortController() : null; ctls.push(ctl);
        const tm = setTimeout(() => ctl && ctl.abort(), 15000); timers.push(tm);
        getJSON(ep, { signal: ctl ? ctl.signal : undefined, method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' } })
          .then(d => { clearTimeout(tm); if (d && d.elements) finish(d); else finish(null); }, e => { clearTimeout(tm); finish(null, e); });
      };
      launch();
      timers.push(setTimeout(launch, 2500), setTimeout(launch, 6000));
    });
  }
  async function findShops(lat, lon, radius) {
    const key = R2(lat) + ',' + R2(lon) + ',' + radius;
    const hit = fromCache(lat, lon, radius);
    if (hit) return hit;
    const R = radius * 1000;
    // Une seule requête légère (filtre par type de commerce, seulement les étiquettes) : le tri se fait ensuite sur l'appareil
    const q = `[out:json][timeout:12][maxsize:8000000];nwr["shop"~"^(${SHOP_TYPES})$"](around:${R},${lat},${lon});out tags center qt 400;`;
    let data;
    try { data = await overpass(q); }
    catch (e) { const old = fromCache(lat, lon, radius, true); if (old) return old; throw e; }
    const seen = new Set(), list = [];
    for (const el of data.elements || []) { const s = shopFrom(el, lat, lon); if (s && !seen.has(s.id)) { seen.add(s.id); list.push(s); } }
    list.sort((a, b) => b.score - a.score || a.d - b.d);
    // Cache : 6 recherches au plus, les plus récentes
    cache[key] = { at: Date.now(), v: 2, list };
    const keys = Object.keys(cache).sort((a, b) => cache[b].at - cache[a].at);
    for (const k of keys.slice(6)) delete cache[k];
    save('voyageCache', cache);
    return list;
  }
  async function loadTrip() {
    if (!V.trip) return;
    const quick = fromCache(V.trip.lat, V.trip.lon, V.radius);
    if (!quick) { startLoading(); st.err = ''; draw(); }
    try { st.shops = quick || await findShops(V.trip.lat, V.trip.lon, V.radius); await loadCurated(); loadVotes(st.shops); }
    catch (e) { await loadCurated(); st.err = navigator.onLine === false ? 'Pas de connexion. Les boutiques déjà cherchées restent visibles hors connexion.' : 'OpenStreetMap ne répond pas pour l’instant. Réessaie dans une minute.'; }
    st.loading = false; draw();
  }
  async function searchCity(q) {
    q = (q || '').trim(); if (!q) return;
    if (Date.now() - st.last < 1500) return; // règle Nominatim : pas plus d'une requête par seconde
    st.last = Date.now(); startLoading(); st.err = ''; st.places = null; draw();
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
    startLoading(); st.err = ''; st.places = null; draw();
    navigator.geolocation.getCurrentPosition(pos => {
      const lat = R2(pos.coords.latitude), lon = R2(pos.coords.longitude);
      // Les boutiques sont cherchées tout de suite ; le nom de la ville arrive en même temps et s'ajoute ensuite
      pickPlace({ name: tr('Autour de moi'), label: tr('Autour de moi'), lat, lon, cc: '', mine: true });
      reverse(lat, lon).then(r => {
        if (!V.trip || !V.trip.mine || V.trip.lat !== lat || V.trip.lon !== lon || !r.name) return;
        V.trip.name = r.name; V.trip.label = F('Autour de moi ({0})', r.name); V.trip.cc = r.cc; saveV();
        if (!st.loading) draw(); else { const w = document.getElementById('vywhere'); if (w) w.textContent = V.trip.label; }
      });
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
  /* ---------- Y a-t-il des cartes ? Vert = sûr, orange = à vérifier, gris = pas de cartes selon les visiteurs ---------- */
  // Avis partagés : un avis par appareil et par boutique (identifiant au hasard, sans nom), envoyé à CallIt! et compté pour tous.
  let votes = {}; const askedVotes = new Set();                            // { id: { oui, non } } : avis de tous les visiteurs
  const deviceId = () => {
    let d = load('appareil', '');
    if (!/^[0-9a-f-]{36}$/.test(d)) { d = crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => (Math.random() * 16 | 0).toString(16)); save('appareil', d); }
    return d;
  };
  const rpc = (fn, body) => SUPA_RPC ? fetch(SUPA_RPC + fn, { method: 'POST', headers: { apikey: SUPA.key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.ok ? r.json() : null).catch(() => null) : Promise.resolve(null);
  function loadVotes(list) {
    const ids = (list || []).map(s => s.id).filter(id => /^[nwr]\d+$/.test(id)).slice(0, 300);
    if (!ids.length) return;
    rpc('boutiques_avis_lire', { p_ids: ids }).then(rows => {
      if (!Array.isArray(rows)) return;
      for (const r of rows) votes[r.shop_id] = { oui: +r.oui || 0, non: +r.non || 0 };
      draw();
    });
  }
  // Ce que disent les visiteurs, en comptant mon avis (gardé aussi sur l'appareil) s'il n'est pas encore remonté
  function tally(s) {
    const v = Object.assign({ oui: 0, non: 0 }, votes[s.id]), mine = marks[s.id] && marks[s.id].cartes;
    if (mine != null && !(marks[s.id].sent && votes[s.id])) { if (mine) v.oui++; else v.non++; }
    return v;
  }
  function certainty(s) {
    const v = tally(s), mine = marks[s.id] && marks[s.id].cartes;
    if (mine === false || (v.non >= 2 && v.non > v.oui)) return 'non';
    if (mine === true || (v.oui >= 1 && v.oui >= v.non)) return 'oui';
    const tg = (marks[s.id] && marks[s.id].tags) || [];
    if (s.sure || curatedFor(s) || ['vraie', 'unite', 'scelle'].some(t => tg.includes(t))) return 'oui';
    return 'peut';
  }
  const RANK = { oui: 0, peut: 1, non: 2 };
  function sendVote(s, val) {
    const m = mark(s), before = m.cartes;
    if (before === val) delete m.cartes; else m.cartes = val;
    m.sent = false; cleanMark(s.id); saveMarks(); draw();
    rpc('boutique_avis_donner', { p_shop: s.id, p_appareil: deviceId(), p_cartes: m.cartes == null ? null : m.cartes }).then(r => {
      if (r === null) return; // pas encore de partage possible : l'avis reste sur l'appareil
      if (marks[s.id]) { marks[s.id].sent = true; saveMarks(); }
      votes[s.id] = { oui: +r.oui || 0, non: +r.non || 0 }; draw();
    });
    toast(tr(m.cartes == null ? 'Avis retiré' : 'Merci, ton avis aide les autres collectionneurs'));
  }
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
  function cleanMark(id) { const m = marks[id]; if (m && !m.visited && !(m.tags || []).length && m.cartes == null) delete marks[id]; }

  /* ---------- Affichage ---------- */
  let root = null;
  const draw = () => { if (isVoyage()) render(); };
  const PIN = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>';
  const STAMP = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9.5"/></svg>';
  const kindLabel = s => KINDS[s.kind] ? KINDS[s.kind][0] : 'Boutique';
  const badge = t => `<span class="vy-tag ${t.warn ? 'alert' : ''}">${esc(t.label)}</span>`;

  /* ---------- Chargement : un petit voyageur (une fois un homme, une fois une femme) marche sur la carte du monde vers un coffre de cartes ---------- */
  // Continents très simplifiés (longitude, latitude), dessinés en points : c'est un décor, pas une vraie carte
  const LAND = [
    [-168,66,-160,70,-140,70,-125,72,-95,72,-80,74,-65,62,-55,52,-66,45,-75,38,-81,31,-80,25,-90,29,-97,26,-97,19,-88,15,-83,9,-78,8,-90,15,-105,20,-110,24,-117,32,-124,40,-124,48,-135,58,-150,60,-165,60],
    [-55,60,-45,60,-20,70,-18,80,-40,83,-60,80,-70,77],
    [-78,8,-60,10,-50,0,-35,-6,-40,-22,-48,-28,-58,-38,-65,-42,-68,-55,-75,-50,-72,-30,-70,-18,-81,-5,-80,2],
    [-10,36,-9,43,-2,44,-5,48,0,50,5,53,8,57,5,62,15,69,28,71,40,67,45,68,60,70,60,55,50,45,40,45,30,41,26,40,22,37,16,38,18,40,12,44,8,44,3,42,-1,37],
    [60,70,80,73,100,77,120,73,140,72,170,70,180,66,165,60,155,58,142,53,140,45,130,42,127,35,122,30,120,22,108,20,106,10,100,13,98,8,103,1,98,16,92,21,80,15,77,8,72,20,66,25,57,25,52,28,48,30,56,24,59,22,52,16,43,12,35,28,35,35,30,41,40,45,50,45,60,55],
    [-17,21,-10,30,-5,36,10,37,20,32,32,31,35,28,43,12,51,11,40,-2,40,-15,35,-25,28,-33,18,-34,12,-17,13,-5,9,4,-8,4,-17,14],
    [114,-22,122,-18,130,-12,137,-12,142,-11,146,-19,153,-26,150,-37,140,-38,132,-32,115,-34],
    [-6,50,2,51,0,54,-3,58,-6,57,-5,54], [130,31,141,36,142,43,140,41,135,34], [109,1,118,7,119,0,115,-4,110,-2], [95,5,105,-6,102,-4],
    [172,-35,178,-38,170,-46,167,-45], [44,-13,50,-15,47,-25,43,-22]
  ];
  let landPath = '';
  function landDots() {
    if (landPath) return landPath;
    const inside = (x, y, p) => { let c = false; for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) { const xi = p[i], yi = p[i + 1], xj = p[j], yj = p[j + 1]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
    let d = '';
    for (let lat = 78; lat >= -52; lat -= 4) for (let lon = -176; lon <= 180; lon += 4) if (LAND.some(p => inside(lon, lat, p))) d += 'M' + (lon + 180) + ' ' + (90 - lat) + 'h0';
    return (landPath = d);
  }
  const still = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function walker(woman, anim) {
    const sw = (vals, dur) => anim ? `<animateTransform attributeName="transform" type="rotate" values="${vals}" dur="${dur}" repeatCount="indefinite"/>` : '';
    // Silhouette de 22 × 34, pieds en (0, 0) ; jambes et bras se balancent
    return `<g class="vy-walker-in">${anim ? '<animateTransform attributeName="transform" type="translate" values="0 0;0 -1.2;0 0" dur=".45s" repeatCount="indefinite"/>' : ''}
      <g stroke="currentColor" stroke-width="3" stroke-linecap="round" fill="none">
        <g transform="translate(0 -14)"><g>${sw('-28;28;-28', '.9s')}<line x1="0" y1="0" x2="0" y2="14"/></g><g>${sw('28;-28;28', '.9s')}<line x1="0" y1="0" x2="0" y2="14"/></g></g>
        <g transform="translate(0 -25)"><g>${sw('30;-30;30', '.9s')}<line x1="0" y1="0" x2="0" y2="9"/></g></g>
        ${woman ? '<path d="M-5 -14 L0 -27 L5 -14 Z" fill="currentColor" stroke-width="1.5" stroke-linejoin="round"/>' : '<line x1="0" y1="-27" x2="0" y2="-14"/>'}
      </g>
      <rect x="-7.5" y="-27" width="5" height="9" rx="2" fill="var(--gain)"/>
      <circle cx="0" cy="-31.5" r="4.2" fill="currentColor"/>
      ${woman ? '<path d="M2.5 -34.5 q6 1 5 7.5" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round"/>' : '<path d="M-4.6 -32.5 a4.6 4.6 0 0 1 9.2 0 h2.6" stroke="var(--gain)" stroke-width="2.4" fill="none" stroke-linecap="round"/>'}
      <g transform="translate(0 -25)"><g>${sw('-30;30;-30', '.9s')}<line x1="0" y1="0" x2="0" y2="9" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></g></g></g>`;
  }
  function loader(t) {
    const anim = !still(), woman = !!V.wk;
    // Arrivée : la ville cherchée ; départ : un peu plus loin sur la carte, pour que le voyageur ait de la route
    const dx = t ? Math.min(345, Math.max(15, t.lon + 180)) : 190, dy = t ? Math.min(132, Math.max(22, 90 - t.lat)) : 48;
    const sx = dx > 120 ? dx - 105 : dx + 105, sy = Math.min(132, Math.max(22, dy + 22));
    const cy = Math.max(44, Math.min(sy, dy) - 26), path = `M${sx} ${sy} Q${(sx + dx) / 2} ${cy} ${dx} ${dy}`;
    const flip = sx > dx ? ' scale(-1 1)' : '';
    return `<div class="pad"><div class="vy-load" role="status" aria-live="polite">
      <svg viewBox="0 6 360 134" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
        <path class="vy-land" d="${landDots()}"/>
        <path class="vy-route" d="${path}"/>
        <g transform="translate(${dx} ${dy})" class="vy-chest"><path d="M0 0 v-14" class="vy-flag"/><path d="M0 -14 l9 3.5 l-9 3.5 z" class="vy-flagc"/>
          <rect x="-11" y="-2" width="22" height="13" rx="2.5" class="vy-box"/><path d="M-11 2 h22" class="vy-boxl"/>
          ${anim ? '<g class="vy-spark"><path d="M-14 -10 l2 -4 M14 -10 l-2 -4 M0 -22 v-4"/><animate attributeName="opacity" values="0;0;1;0" dur="3.6s" repeatCount="indefinite"/></g>' : ''}</g>
        <g class="vy-walker">${anim ? `<animateMotion dur="3.6s" repeatCount="indefinite" keyPoints="0;1;1" keyTimes="0;.8;1" calcMode="linear" path="${path}"/>` : ''}<g transform="${anim ? '' : `translate(${(sx + dx) / 2} ${(cy + Math.min(sy, dy)) / 2})`}${flip} scale(.85)">${walker(woman, anim)}</g></g>
      </svg>
      <p class="vy-load-txt" id="vyloadtxt">${esc(t && !t.mine ? F('En route pour {0}…', t.name) : tr('Je cherche les boutiques autour de toi…'))}</p></div></div>`;
  }
  // Messages qui changent pendant l'attente (sans tout redessiner, pour ne pas couper l'animation)
  let loadTimers = [];
  // Début d'une attente : une recherche sur deux, c'est une voyageuse
  function startLoading() { if (!st.loading) { V.wk = !V.wk; saveV(); loadMessages(); } st.loading = true; }
  function loadMessages() {
    loadTimers.forEach(clearTimeout); loadTimers = [];
    [[4000, 'Je fouille les rues à la recherche de cartes…'], [9000, 'Encore un peu de route…'], [16000, 'La carte du monde est très demandée en ce moment, on insiste…']].forEach(([ms, txt]) => loadTimers.push(setTimeout(() => {
      const el = document.getElementById('vyloadtxt'); if (el && st.loading) el.textContent = tr(txt);
    }, ms)));
  }

  const LEVEL = { oui: 'Cartes sûres', peut: 'Cartes à vérifier', non: 'Pas de cartes selon les visiteurs' };
  function shopRow(s) {
    const cur = curatedFor(s), tg = tagsOf(s, cur), m = marks[s.id], lv = certainty(s);
    const sub = tr(kindLabel(s)) + (s.d != null ? ' · ' + km(s.d) + ' ' + tr(V.trip && V.trip.mine ? 'de toi' : 'du centre') : '');
    return `<a class="line vy-shop vy-${lv}" href="#/boutique/${encodeURIComponent(s.id)}"><span class="vy-pin" title="${esc(tr(LEVEL[lv]))}"><span class="sr">${esc(tr(LEVEL[lv]))}</span>${PIN}</span><span class="mid"><b data-noi18n>${esc(s.name)}</b><span data-noi18n>${esc(sub)}${s.addr ? ' · ' + esc(s.addr) : ''}</span>${tg.length || cur ? `<span class="vy-tags">${cur ? '<span class="vy-tag callit">Repérée par CallIt!</span>' : ''}${tg.slice(0, 4).map(badge).join('')}</span>` : ''}</span>${m && m.visited ? `<span class="vy-stamped" title="Tamponnée">${STAMP}</span>` : ''}</a>`;
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
    return `<div class="pad" style="margin-top:14px"><div class="panel stack" style="gap:8px"><b style="font-size:var(--t-m)">${esc(F('Là-bas, on paie en {0}', local))}</b>
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
    // Toutes les boutiques utiles, les plus sûres d'abord, puis les plus proches ; « pas de cartes » à la fin
    const lv = new Map(list.map(s => [s.id, certainty(s)]));
    const shown = list.slice().sort((a, b) => RANK[lv.get(a.id)] - RANK[lv.get(b.id)] || a.d - b.d);
    const cur = curatedHere(), unmatched = cur.filter(c => !list.some(s => (c.match || []).some(m => norm(s.name).includes(m))));
    let body = '';
    if (st.loading) body = loader(t);
    else if (t && st.shops) {
      body = `<div class="sect between"><h2 class="h2">${esc(t.mine ? tr('Boutiques autour de moi') : F('Boutiques à {0}', t.name))}</h2><span class="sub">${esc(F(shown.length > 1 ? '{0} trouvées' : '{0} trouvée', shown.length))}</span></div>
      <div class="pad vy-bar"><div class="chips">${[2, 5, 15].map(r => `<button class="chip ${V.radius === r ? 'on' : ''}" data-act="vyradius" data-v="${r}">${r} km</button>`).join('')}</div><div class="vy-legend"><span class="vy-oui"><i></i>Sûr</span><span class="vy-peut"><i></i>À vérifier</span></div></div>
      <div class="list">${shown.map(shopRow).join('') || `<div class="note">${esc(tr('Aucune boutique trouvée dans ce rayon. Essaie un rayon plus large.'))}</div>`}</div>
      ${unmatched.length ? `<div class="sect"><h2 class="h2">Repérées par CallIt!</h2></div><p class="pad small" style="margin:0 0 8px">Pas encore placées sur la carte : la fiche ouvre leur recherche dans Google Maps.</p><div class="list">${unmatched.map(curatedRow).join('')}</div>` : ''}
      <p class="pad small" style="margin-top:12px">Une boutique manque ? Tout le monde peut l’ajouter sur <a href="https://www.openstreetmap.org/" target="_blank" rel="noopener">OpenStreetMap</a>, elle apparaîtra ici.</p>`;
    } else if (t && !st.err) { if (!st.pending) { st.pending = true; setTimeout(() => { st.pending = false; loadTrip(); }, 0); } body = loader(t); }
    return `<div class="top top-start">${backBtn()}<h1 class="title">En voyage</h1></div>
    <form class="pad vy-form" id="vyform" role="search" style="padding-top:4px"><label for="vyq" class="sr">Ville</label><div class="searchrow"><input id="vyq" class="search" type="search" enterkeyhint="search" autocomplete="off" placeholder="${esc(tr('Où pars-tu ? Rome, Tokyo, Lyon…'))}" value="${t && !t.mine ? esc(t.name) : ''}"><button class="btn small primary" type="submit">Chercher</button></div>
    <button type="button" class="btn small vy-me" data-act="vyme">${PIN} Autour de moi</button></form>
    ${st.places && !st.loading ? `<div class="pad small" style="margin-top:8px">Pas cette ville ? <span class="chips wrap" style="margin-top:6px">${st.places.slice(1).map((p, i) => `<button class="chip" data-act="vyplace" data-v="${i + 1}" data-noi18n>${esc(p.label)}</button>`).join('')}</span></div>` : ''}
    ${st.err ? `<div class="pad" style="margin-top:10px"><div class="note" role="alert">${esc(tr(st.err))}${t ? ' <button class="btn small" data-act="vyretry" style="margin-top:8px">Réessayer</button>' : ''}</div></div>` : ''}
    ${st.err && t && !st.shops && cur.length ? `<div class="sect"><h2 class="h2">Repérées par CallIt!</h2></div><div class="list">${cur.map(curatedRow).join('')}</div>` : ''}
    ${t ? `<p class="pad small" style="margin:10px 0 0" data-noi18n>${PIN} <span id="vywhere">${esc(t.label)}</span></p>` : '<div class="pad" style="margin-top:12px"><div class="note">Les boutiques de cartes autour d’une ville, avec leur profil CallIt!.</div></div>'}
    ${body}${currencyBox()}${passport()}
    <p class="pad small" style="margin-top:18px">Données des boutiques : © les contributeurs d’<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> (licence ODbL). CallIt! n’a aucun lien commercial avec ces boutiques.</p>
    <p class="pad small">Tu tiens une boutique de cartes ? Écris-nous à <a href="mailto:request@callitcards.com">request@callitcards.com</a> pour compléter ta fiche.</p>${tabs('')}`;
  }

  // « Il y a des cartes ? » : la couleur de la boutique suit l'avis des visiteurs
  function voteBlock(s) {
    if (s.curatedOnly) return '';
    const v = tally(s), mine = marks[s.id] && marks[s.id].cartes, lv = certainty(s);
    const said = v.oui + v.non ? (v.oui ? F(v.oui > 1 ? '{0} visiteurs ont trouvé des cartes' : '{0} visiteur a trouvé des cartes', v.oui) : '') + (v.oui && v.non ? ' · ' : '') + (v.non ? F(v.non > 1 ? '{0} n’en ont pas trouvé' : '{0} n’en a pas trouvé', v.non) : '') : tr('Pas encore d’avis');
    return `<div class="pad" style="margin-top:14px"><div class="vy-vote vy-${lv}"><div class="vy-vote-head"><span class="vy-dot"></span><b>${esc(tr(LEVEL[lv]))}</b><span class="small">${esc(said)}</span></div>
      <div class="vy-vote-row"><span>Il y a des cartes ?</span><span class="row" style="gap:8px"><button class="chip ${mine === true ? 'on' : ''}" data-act="vycartes" data-id="${esc(s.id)}" data-v="1" aria-pressed="${mine === true}">Oui</button><button class="chip ${mine === false ? 'on' : ''}" data-act="vycartes" data-id="${esc(s.id)}" data-v="0" aria-pressed="${mine === false}">Non</button></span></div></div></div>`;
  }
  function viewShop(id) {
    const cur0 = CURATED && (CURATED.shops || []).find(c => c.id === id);
    const s = findShop(id);
    if (!s) {
      if (!CURATED) loadCurated().then(draw);
      return `<div class="top">${backBtn()}</div><div class="pad"><div class="note">${esc(tr(CURATED ? 'Cette boutique n’est plus dans les recherches gardées sur l’appareil. Cherche à nouveau la ville.' : 'Chargement…'))}</div><a class="btn small" style="margin-top:12px" href="#/voyage">En voyage</a></div>${tabs('')}`;
    }
    const cur = cur0 || curatedFor(s), tg = tagsOf(s, cur), m = marks[s.id] || { tags: [] }, h = parseHours(s.hours);
    const alerts = tg.filter(t => t.alert);
    const today0 = (new Date().getDay() + 6) % 7;
    const hours = h ? `<table class="vy-hours">${h.map((x, i) => `<tr class="${i === today0 ? 'today' : ''}"><th>${esc(dayName(i))}</th><td>${x == null ? '—' : x ? esc(x) : esc(tr('fermé'))}</td></tr>`).join('')}</table>`
      : s.hours ? `<div class="small" data-noi18n>${esc(s.hours)}</div>` : `<div class="small">Horaires non indiqués sur OpenStreetMap.</div>`;
    return `<div class="top">${backBtn()}<h1 class="title" data-noi18n>${esc(s.name)}</h1></div>
    <div class="pad"><p class="sub" style="margin-top:0">
${esc(tr(kindLabel(s)))}${s.d != null && !s.curatedOnly ? ' · ' + esc(km(s.d)) + ' ' + esc(tr(V.trip && V.trip.mine ? 'de toi' : 'du centre')) : ''}${s.city && s.curatedOnly ? ' · ' + esc(s.city) : ''}</p>${s.addr ? `<button class="vy-addr small" data-act="vygo" data-id="${esc(s.id)}" data-noi18n>${PIN}<span>${esc(s.addr)}</span></button>` : ''}</div>
    ${alerts.length ? `<div class="pad" style="margin-top:10px"><div class="vy-alert" role="note"><b>Alerte fiabilité</b> · ${alerts.map(t => esc(tr(t.label))).join(' · ')}</div></div>` : ''}
    <div class="pad row" style="flex-wrap:wrap;gap:8px;margin-top:12px"><button class="btn small primary" data-act="vygo" data-id="${esc(s.id)}">Itinéraire</button>${s.web ? `<a class="btn small" href="${esc(s.web)}" target="_blank" rel="noopener nofollow">Site de la boutique</a>` : ''}${!s.curatedOnly ? `<a class="btn small" href="https://www.openstreetmap.org/${{ n: 'node', w: 'way', r: 'relation' }[s.id[0]]}/${esc(s.id.slice(1))}" target="_blank" rel="noopener">Voir sur OpenStreetMap</a>` : ''}</div>
    ${voteBlock(s)}
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
    d.innerHTML = `<form class="sheet-in" method="dialog"><b style="font-size:var(--t-l)">Y aller avec…</b>${routeApps(s).map(([k, n, u]) => `<a class="btn ${k === V.mapApp ? 'primary' : ''}" href="${esc(u)}" target="_blank" rel="noopener" data-app="${k}">${esc(n)}</a>`).join('')}<button class="btn" value="">Annuler</button><div class="note">L’appli s’ouvre si elle est installée sur ton téléphone, sinon son site. CallIt! retient ton choix pour la prochaine fois.</div></form>`;
    document.body.appendChild(d);
    d.addEventListener('click', e => { const a = e.target.closest('a[data-app]'); if (a) { V.mapApp = a.dataset.app; saveV(); setTimeout(() => d.close(), 0); } });
    d.addEventListener('close', () => d.remove());
    d.showModal();
  }

  /* ---------- Menu latéral : les outils et « mon espace », ouvert par ☰ ou en glissant depuis le bord gauche ---------- */
  const LIVE_DOT = '<span class="lv-dot"></span>';
  const GAVEL = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4l6 6M11 7l6 6M12.5 5.5l-5 5 6 6 5-5M10.5 13.5L4 20"/><path d="M13 21h8"/></svg>';
  // Mes envies : cœur rouge plein, contour blanc ; Illustrateurs : un petit tableau fait de blocs aux couleurs de CallIt!
  const HEART_RED = '<svg class="nofix" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-7.5-10.6A4.3 4.3 0 0 1 12 7.1a4.3 4.3 0 0 1 7.5 2.8c0 6-7.5 10.6-7.5 10.6z" fill="#b4232a" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/></svg>';
  const PAINTING = '<svg class="nofix" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="3.5" width="19" height="17" rx="3" fill="#fff" stroke="#16161a" stroke-width="1.6"/><rect x="5" y="6" width="7.5" height="6.5" rx="1.2" fill="#0a7a44"/><rect x="13.5" y="6" width="5.5" height="4" rx="1.2" fill="#d9a23a"/><rect x="13.5" y="11" width="5.5" height="7" rx="1.2" fill="#b4232a"/><rect x="5" y="13.5" width="7.5" height="4.5" rx="1.2" fill="#3b6fb6"/></svg>';
  function menuItems() {
    const tools = [
      ['#/live', 'Mode Live', LIVE_DOT, null],
      ['#/voyage', 'En voyage', PIN, '#0a7a44'],
      // « Mes enchères » cachée en attendant l'accès eBay (27/11/2026) : la page reste à #/encheres
      ['#/annonce', 'Vérifier une annonce eBay', GAVEL, '#b4232a'],
      ...(PKM ? [['#/scan', 'Scanner mon album', icon('camera', 18), '#0a7a44'], ['#/centrage', 'Centrage', icon('ruler', 18), '#16161a'], ['#/indices', 'Indices de prix', icon('chart', 18), 'green']] : []),
      ['#/illustrateurs', 'Illustrateurs', PAINTING, 'paint']
    ];
    const mine = [
      ['#/reglages', 'Réglages', icon('user', 18), '#16161a'],
      ['#/envies', 'Mes envies', HEART_RED, 'soft'],
      ['#/collection', G() ? 'Ma collection' : 'Portefeuille', icon('coll', 18), '#0a7a44'],
      ['#/confidentialite', 'Données personnelles', icon('shield', 18), '#5c5c56'],
      ['#/signaler', 'Signaler un bug', '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20V5h11l-1.5 3.5L15 12H4"/></svg>', '#8a6a12'],
      ['#/testeur', 'Devenir testeur', '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/></svg>', '#0a7a44']
    ];
    const row = ([h, n, ic, c]) => `<a class="dw-item" href="${h}">${!c ? `<span class="dw-live">${ic}</span>` : c === 'soft' || c === 'paint' || c === 'green' ? `<span class="hl-sw sw-${c}">${ic}</span>` : `<span class="hl-sw" style="background:${c}">${ic}</span>`}<b>${esc(n)}</b></a>`;
    return `<div class="dw-head">${logo(26)}<button class="iconbtn" data-act="vymenuclose" aria-label="Fermer le menu"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
      <div class="dw-sec">Outils</div>${tools.map(row).join('')}
      <div class="dw-sec">Mon espace</div>${mine.map(row).join('')}
      <div class="dw-sec">Préférences</div>
      <button class="dw-item dw-toggle" data-act="facemenu" aria-haspopup="dialog"><span class="hl-sw sw-green">${faceIcon(curFace(), 18)}</span><b>Affichage</b><span class="dw-val">${esc((FACES.find(f => f[0] === curFace()) || [])[1] || '')}</span></button>
      <div class="dw-item dw-siderow"><b>Mode</b><div class="dw-mode" role="group" aria-label="Mode clair ou sombre"><button class="m-sun${isDark() ? '' : ' on'}" data-act="vydark" data-v="clair" aria-pressed="${!isDark()}" aria-label="Mode clair">${SUN}</button><button class="m-moon${isDark() ? ' on' : ''}" data-act="vydark" data-v="sombre" aria-pressed="${isDark()}" aria-label="Mode sombre">${MOON}</button></div></div>
      <div class="dw-item dw-siderow"><b>Menu</b><div class="dw-side" role="group" aria-label="Côté du menu"><button data-act="vymenuside" data-side="g" class="${menuRight() ? '' : 'on'}" aria-pressed="${!menuRight()}">Gauche</button><button data-act="vymenuside" data-side="d" class="${menuRight() ? 'on' : ''}" aria-pressed="${menuRight()}">Droite</button></div></div>`;
  }
  let drawer = null;
  const isDark = () => document.documentElement.dataset.theme === 'dark';
  const SUN = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2" fill="currentColor"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/></svg>';
  const MOON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" fill="currentColor"/></svg>';
  const SIDE_ICON = '<svg class="nofix" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3.5" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="5" y="6" width="5" height="12" rx="1.5" fill="#0a7a44"/></svg>';
  // Côté du menu (gauche par défaut), gardé sur l'appareil
  const menuRight = () => { try { return localStorage.getItem('callit-menu-cote') === 'd'; } catch (e) { return false; } };
  const applySide = () => document.body.classList.toggle('dw-right', menuRight());
  applySide();
  function openMenu() {
    if (!drawer) {
      drawer = document.createElement('div'); drawer.className = 'dw-wrap';
      drawer.innerHTML = '<div class="dw-ov" data-act="vymenuclose"></div><nav class="dw" aria-label="Menu"></nav>';
      document.body.appendChild(drawer);
    }
    drawer.querySelector('.dw').innerHTML = menuItems();
    if (typeof i18nApply === 'function') i18nApply(drawer);
    requestAnimationFrame(() => drawer.classList.add('open'));
    document.body.classList.add('dw-lock');
  }
  function closeMenu() { if (drawer) drawer.classList.remove('open'); document.body.classList.remove('dw-lock'); }
  const MENU_BTN = '<button class="iconbtn dw-btn" data-act="vymenu" aria-label="Menu"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>';
  // Glisser depuis le bord du côté choisi ouvre le menu ; glisser dans l'autre sens le ferme
  let sx = null, sy = 0, fromEdge = false;
  document.addEventListener('touchstart', e => { const t = e.touches[0]; sx = t.clientX; sy = t.clientY; fromEdge = menuRight() ? sx > window.innerWidth - 24 : sx < 24; }, { passive: true });
  document.addEventListener('touchend', e => {
    if (sx == null) return; const t = e.changedTouches[0], dy = Math.abs(t.clientY - sy);
    const dx = (t.clientX - sx) * (menuRight() ? -1 : 1);
    const isOpen = drawer && drawer.classList.contains('open');
    if (!isOpen && fromEdge && dx > 60 && dy < 50 && S.face && DB) openMenu();
    else if (isOpen && dx < -60 && dy < 50) closeMenu();
    sx = null;
  }, { passive: true });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
  window.addEventListener('hashchange', closeMenu);

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
    // « Affichage » du menu ouvre le choix Galerie, Marché, Joueur (géré par app.js) : on referme le menu
    if (e.target.closest('.dw [data-act="facemenu"]')) { closeMenu(); return; }
    const el = e.target.closest('[data-act^="vy"]'); if (!el) return;

    const a = el.dataset.act;
    if (a === 'vymenu') openMenu();
    else if (a === 'vydark') {
      S.theme = el.dataset.v; saveS(); applyTheme();
      if (drawer) drawer.querySelector('.dw').innerHTML = menuItems();
    }
    else if (a === 'vymenuside') {
      try { localStorage.setItem('callit-menu-cote', el.dataset.side); } catch (e) {}
      applySide(); if (drawer) drawer.querySelector('.dw').innerHTML = menuItems();
      app.querySelectorAll('.dw-btn').forEach(b => b.remove()); addMenuBtn();
    }
    else if (a === 'vymenuclose') closeMenu();
    else if (a === 'vyme') aroundMe();
    else if (a === 'vygo') { const s = findShop(el.dataset.id); if (s) openRoute(s); }
    else if (a === 'vyretry') { st.err = ''; loadTrip(); }
    else if (a === 'vyradius') { V.radius = +el.dataset.v; saveV(); st.shops = null; loadTrip(); }
    else if (a === 'vycartes') { const s = findShop(el.dataset.id); if (s) sendVote(s, el.dataset.v === '1'); }
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
  // Bouton ☰ en haut à gauche des pages principales (pas sur celles qui ont un bouton Retour)
  function addMenuBtn() {
    if (!DB || !S.face) return;
    const top = app.querySelector('.home-top') || app.querySelector('.top');
    if (!top || top.querySelector('.dw-btn') || top.querySelector('[data-act="back"], [data-back]')) return;

    top.insertAdjacentHTML(menuRight() ? 'beforeend' : 'afterbegin', MENU_BTN);
  }
  const baseRender = render;
  render = function (keepFocus) {
    if (isVoyage()) {
      document.body.dataset.face = G() ? 'galerie' : 'marche';
      const r = route();
      if (r === 'boutique') { const id = decodeURIComponent(location.hash.split('/')[2] || '').split('?')[0]; if (!CURATED) loadCurated().then(draw);
        if (!votes[id] && !askedVotes.has(id)) { askedVotes.add(id); loadVotes([{ id }]); } app.innerHTML = viewShop(id); document.title = tr('Boutique') + ' · CallIt!'; }
      else { if (!CURATED && V.trip) loadCurated().then(draw); app.innerHTML = viewVoyage(); document.title = tr('En voyage') + ' · CallIt!'; }
      root = app; addMenuBtn();
      return;
    }
    root = null;
    baseRender(keepFocus);
    addMenuBtn();
    // Les outils (En voyage, Centrage…) sont dans le menu latéral : on les retire de l'accueil.
    // Restent : le raccourci « Mode Live » (demande de Jérémie du 26/11) et « Installer l'appli » (téléphone seulement).
    if (DB && S.face && route() === '') app.querySelectorAll('.home-head .ctr-homelink:not([data-act="install"])').forEach(x => x.remove());
  };
  // Les cartes ont pu finir de charger avant ce fichier : on refait l'affichage pour ajouter le lien ou la page
  if (DB && S.face) render();
})();
