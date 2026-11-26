/* CallIt! · Mode Live : la cote en une seconde pendant un live (eBay Live, Whatnot…).
   On trouve la carte (nom tapé, photo, ou capture de l'écran partagé), on choisit l'état ou la gradation, la cote s'affiche.
   Règle : on ne lit JAMAIS le live automatiquement. Chaque lecture d'écran part d'un clic de l'utilisateur,
   l'image reste sur l'appareil (lecture du texte faite sur place, sans serveur) et rien ne se connecte à eBay.
   Fichier séparé de app.js : il réutilise ses fonctions (searchCards, matchScan, getOcr, eur, money…) et s'ajoute au routeur. */
(function () {
  'use strict';
  if (typeof render !== 'function') return;

  /* ---------- Réglages propres au Live (gardés sur l'appareil) ---------- */
  const BLOCKS = [
    ['carte', 'La carte'], ['prix', 'Le prix'], ['live', 'Prix du live (comparer une enchère)'],
    ['courbe', 'La petite courbe'], ['collection', 'Dans ma collection']
  ];
  const L = Object.assign({ cond: 'NM', graded: false, grader: 'PSA', grade: '10', reverse: false, zone: null, bidZone: null, maxPct: 70, compact: false,
    blocks: BLOCKS.map(([id]) => [id, true]) }, load('live', {}));
  for (const [id] of BLOCKS) if (!L.blocks.some(b => b[0] === id)) L.blocks.push([id, true]);
  L.blocks = L.blocks.filter(b => BLOCKS.some(x => x[0] === b[0]));
  const saveL = () => save('live', L);
  let recent = load('liveRecent', []); // [{key, lang}]
  const st = { alts: [], sid: null, key: null, lang: null, q: '', results: [], scan: null, livePrice: '', custom: false, picking: null };

  /* ---------- Estimation du prix ---------- */
  // Cardmarket donne une cote unique, surtout faite de ventes en très bon état (NM).
  // La décote par état est une RÈGLE GÉNÉRALE du marché, pas des ventes réelles : affichée comme « estimation ».
  // La table est dans app.js (OWN_COND_K) : la même sert à la valeur de la collection.
  const COND_K = OWN_COND_K;
  // Gradées : aucune vente gradée dans nos données pour l'instant. Fourchette large, présentée comme un ordre de grandeur.
  const GRADES = ['10', '9.5', '9', '8', '7', '6'];
  const GRADE_K = { '10': [2.5, 6], '9.5': [1.8, 3.5], '9': [1.3, 2.2], '8': [1, 1.5], '7': [0.8, 1.2], '6': [0.55, 1] };
  const GRADER_K = { PSA: 1, BGS: 1, CGC: 0.85, PCA: 0.6, 'AP Grading': 0.6, Autre: 0.6 };
  // Langue : la cote Cardmarket mélange toutes les langues. Écart habituel du marché européen par rapport à ce mélange :
  // l'anglais se vend plus cher, les langues moins demandées moins cher (écart plus fort sur les cartes anciennes).
  // RÈGLE APPROXIMATIVE, affichée comme estimation, en attendant les vrais prix par langue tirés des ventes eBay.
  // Tables et règle dans app.js (OWN_LANG_K, ownLangK) : les mêmes servent à la valeur de la collection.
  const langK = ownLangK;
  const pos = v => (v != null && v > 0 ? v : null);

  // Prix de référence. Pokémon : la cote CallIt! (quote() dans app.js), celle de la version reverse ou holo si elle est choisie.
  // Autres jeux : la MOYENNE SUR 30 JOURS (résiste à un prix gonflé sur une journée), sinon tendance, sinon prix bas.
  const QSRC = { moy: 'ventes des 7 et 30 derniers jours', tendance: 'tendance', bas: 'offre la moins chère' };
  function basePrice(c) {
    if (!c.p) return null;
    if (PKM) { const q = (L.reverse && quoteHolo(c)) || quote(c); return q ? { v: q.v, src: QSRC[q.src] + (q.holo ? ', version reverse ou holo' : ''), q } : null; }
    if (L.reverse && pos(pf(c, 'trendHolo'))) return { v: pf(c, 'trendHolo'), src: 'tendance reverse ou holo' };
    const a30 = pos(pf(c, 'avg30')), tr = pos(pf(c, 'trend')), lo = pos(pf(c, 'low'));
    if (a30) return { v: a30, src: 'moyenne 30 jours' };
    if (tr) return { v: tr, src: 'tendance' };
    if (lo) return { v: lo, src: 'prix bas' };
    return null;
  }
  function estimate(c) {
    let b = basePrice(c); if (!b) return null;
    const lk = langK(c, st.lang);
    if (lk !== 1) b = { v: b.v * lk, src: b.src, lang: true, raw: b.v, q: b.q };
    if (L.graded) {
      const [k1, k2] = GRADE_K[L.grade] || GRADE_K['9'], g = GRADER_K[L.grader] || 0.6;
      const adj = k => (k > 1 ? 1 + (k - 1) * g : k);
      const lo = b.v * adj(k1), hi = b.v * adj(k2); // b inclut déjà l'écart de langue
      return { lo, hi, mid: Math.sqrt(lo * hi), kind: 'ordre', base: b };
    }
    const k = COND_K[L.cond] || 1;
    return { mid: b.v * k, kind: k === 1 && !b.lang ? 'cote' : 'estim', base: b };
  }
  // Signal de manipulation ou d'emballement : tendance du jour ou moyenne 7 j loin de la moyenne 30 j
  function alertOf(c) {
    if (PKM) { // ventes des 7 derniers jours loin de celles du mois, sinon la raison d'une confiance faible
      const b = basePrice(c), q = b && b.q; if (!q) return '';
      if (q.d >= 0.3 && !q.dup) return F('Prudence : les ventes des 7 derniers jours sont {0} % plus hautes que celles du mois. Hausse à confirmer.', Math.round(q.d * 100));
      if (q.d <= -0.3 && !q.dup) return F('Les ventes des 7 derniers jours sont {0} % plus basses que celles du mois : la cote suit la baisse.', Math.round(-q.d * 100));
      return q.conf === 0 ? COTE_POURQUOI[coteWhy(q)] || '' : '';
    }
    const a30 = pos(pf(c, 'avg30')), tr = pos(pf(c, 'trend')), a7 = pos(pf(c, 'avg7'));
    if (!a30) return '';
    const d = Math.max(tr ? tr / a30 - 1 : 0, a7 ? a7 / a30 - 1 : 0), m = Math.min(tr ? tr / a30 - 1 : 0, a7 ? a7 / a30 - 1 : 0);
    if (d >= 0.3) return F('Prudence : le prix a pris {0} % sur la moyenne 30 jours. On garde la moyenne comme repère.', Math.round(d * 100));
    if (m <= -0.3) return F('Le prix a baissé de {0} % par rapport à la moyenne 30 jours.', Math.round(-m * 100));
    return '';
  }

  /* ---------- Petites fonctions ---------- */
  const card = () => (st.key ? BYKEY.get(st.key) : null);
  const condName = k => (CONDS.find(x => x[0] === k) || ['', k])[1];
  const parseNum = s => { const v = parseFloat(String(s).replace(/\s/g, '').replace(',', '.')); return isNaN(v) ? null : v; };
  function pick(key, lang) {
    stopFollow(); st.key = key; st.lang = lang || null; st.livePrice = ''; st.results = []; st.picking = null; st.alts = (st.alts || []).filter(k => k !== key);
    recent = [{ key, lang: st.lang }, ...recent.filter(r => r.key !== key)].slice(0, 8); save('liveRecent', recent);
    const c = BYKEY.get(key); if (c && c.cm && !c.x) loadHistFor(c);
    draw();
  }
  function find(q) {
    const keep = S.sort; S.sort = 'pert';
    const r = searchCards(new URLSearchParams({ q })) || []; S.sort = keep;
    return r.slice(0, 8);
  }

  /* ---------- Historique (même source que la fiche carte : relevé quotidien de la cote) ---------- */
  const HL = new Map();
  async function loadHistFor(c) {
    const n = String(c.cm % 100).padStart(2, '0');
    if (!HIST.has(n)) { try { const r = await fetch('historique/' + n + '.json', { cache: 'no-cache' }); if (r.ok) HIST.set(n, await r.json()); } catch (e) {} }
    const h = HIST.get(n); if (!h) return;
    const start = new Date(h.start + 'T12:00:00').getTime();
    HL.set(c.key, (h.p[c.cm] || []).map((v, i) => (v == null ? null : [new Date(start + i * 864e5), v / 100])).filter(Boolean).slice(-30));
    if (st.key === c.key) draw();
  }
  function curvePts(c) {
    const h = HL.get(c.key);
    if (h && h.length >= 5) return { pts: h, label: F('{0} derniers jours relevés par CallIt!', h.length) };
    const now = Date.now();
    const pts = [[30, 'moy. 30 j', pf(c, 'avg30')], [7, 'moy. 7 j', pf(c, 'avg7')], [1, 'hier', pf(c, 'avg1')], [0, 'auj.', pf(c, 'trend')]]
      .filter(x => x[2] > (x[0] ? 0 : COTE.ARTEFACT)).map(x => [new Date(now - x[0] * 864e5), x[2], x[1]]); // 0,02 : tendance que Cardmarket affiche quand il n'en calcule pas
    return { pts, label: F('Moyennes {0} sur 30 jours', SRC()) };
  }

  /* ---------- Vue ---------- */
  const B = (on, lv, v, label, extra = '') => `<button type="button" class="chip${on ? ' on' : ''}" data-lv="${lv}" data-v="${esc(v)}" aria-pressed="${!!on}" ${extra}>${label}</button>`;
  const canScreen = () => !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) && !/Android|iPhone|iPad/i.test(navigator.userAgent);
  const canPip = () => 'documentPictureInPicture' in window && !pipWin;

  function shell() {
    return `<div class="live${L.compact ? ' compact' : ''}" id="live-root">
      <div class="lv-top"><button type="button" class="iconbtn" data-lv="close" aria-label="Quitter le mode Live">${icon('back')}</button>
        <b class="lv-title"><span class="lv-dot"></span>Live</b>
        <div class="row" style="gap:6px">${canPip() ? `<button type="button" class="btn small" data-lv="pip" title="Une petite fenêtre qui reste au-dessus du live">Fenêtre flottante</button>` : ''}
        <button type="button" class="iconbtn" data-lv="custom" aria-label="Choisir les blocs affichés" title="Personnaliser">${icon('set')}</button></div></div>
      ${PKM ? `<div class="face lv-kind" role="group" aria-label="Type de produit">${[['cartes', 'Cartes'], ['scelles', 'Scellés']].map(([k, l]) => `<button type="button" data-lv="kind" data-v="${k}" aria-pressed="${sealedMode() === (k === 'scelles')}">${l}</button>`).join('')}</div>` : ''}
      <form class="lv-search" data-lv-form="1" autocomplete="off"><input id="lvq" type="search" enterkeyhint="search" placeholder="${sealedMode() ? 'Set et produit (ex. 151 display, ETB Évolutions Prismatiques)' : 'Nom ou numéro (ex. Dracaufeu 4/102)'}" aria-label="Chercher ce qui est montré dans le live" value="${esc(st.q)}"></form>
      <div class="lv-scan" id="lv-scan"></div>
      <div id="lv-body"></div>
    </div>`;
  }
  function scanBar() {
    const s = st.scan;
    const btns = `<div class="lv-btns">
      ${canScreen() ? (scr ? `<button type="button" class="btn small primary" data-lv="grab" title="Raccourci : touche Espace">${icon('camera', 16)} Lire l'écran</button><button type="button" class="btn small" data-lv="zone">${L.zone ? 'Changer la zone' : 'Choisir la zone'}</button><button type="button" class="btn small" data-lv="stop">Arrêter</button>`
        : `<button type="button" class="btn small primary" data-lv="share" title="Tu choisis l'onglet du live ; rien n'est lu tant que tu ne cliques pas">${icon('camera', 16)} Connecter l'écran du live</button>`) : ''}
      ${typeof window.CallItBulleBouton === 'function' ? window.CallItBulleBouton() : ''}<label class="btn small${canScreen() ? '' : ' primary'}" for="lvcam" role="button">${icon('camera', 16)} Photo</label><input type="file" accept="image/*" capture="environment" id="lvcam" hidden>
      <label class="btn small" for="lvshot" role="button">Capture d'écran</label><input type="file" accept="image/*" id="lvshot" hidden></div>`;
    let msg = '';
    if (s && s.status === 'lecture') msg = `<div class="small">${s.first ? 'Lecture de la carte… (quelques secondes la première fois)' : 'Lecture de la carte…'}</div>`;
    else if (s && s.status === 'erreur') msg = `<div class="small">${esc(s.text)}</div>`;
    else if (s && s.status === 'scelles') msg = `<div class="small">${st.sid ? 'Produit reconnu.' : 'Touche le bon produit ci-dessous.'}</div>`;
    else if (s && s.status === 'compare') msg = `<div class="small"><b>${esc(s.name)}</b> reconnu : l’IA compare avec les différentes versions…</div>`;
    else if (s && s.status === 'versions') msg = `<div class="small"><b>${esc(s.name)}</b> reconnu, mais pas son numéro : touche la bonne version ci-dessous (les plus chères d’abord), ou ajoute le numéro dans la recherche.</div>`;
    else if (s && s.status === 'rien' && sealedMode()) msg = `<div class="small">Aucun produit reconnu : les logos de set sont difficiles à lire. Tape le set et le type de produit juste au-dessus.</div>`;
    else if (s && s.status === 'rien') msg = `<div class="small">${scr ? 'Aucune carte reconnue. Tape le nom juste au-dessus (le curseur y est déjà), ou resserre la zone autour de la carte.' : 'Aucune carte reconnue. Tape le nom juste au-dessus (le curseur y est déjà), ou reprends la photo avec le numéro bien lisible.'}</div>`;
    else if (scr && !L.zone) msg = `<div class="small">Astuce : « Choisir la zone » une fois, autour de l’endroit où le vendeur montre la carte. Ensuite, un clic suffit.</div>`;
    else if (!canScreen() && !st.key && !st.lot && /Android/i.test(navigator.userAgent)) msg = `<div class="small lv-phone"><b>Live sur le même téléphone :</b> dans l’appli eBay, fais une capture d’écran quand la carte est montrée, puis touche « Partager » → <b>CallIt!</b>. Tu reviens ici et la carte est lue tout de suite. (Pour voir un live sur un autre écran, utilise « Photo ».)</div>`;
    else if (!scr && canScreen() && !st.key) msg = `<div class="small">Partage l’onglet du live une fois. CallIt! ne lit l’écran que quand tu cliques sur « Lire l’écran ».</div>`;
    if (s && s.status === 'lot') msg = `<div class="small">Lot lu par l’IA : vérifie chaque carte ci-dessous.</div>`;
    else if (s && s.via === 'ia' && s.status !== 'rien') msg = `<div class="small"><span>${s.unsure ? 'Trouvé avec l’IA, mais elle hésite : vérifie la version (« Pas celle-ci ? »).' : 'Trouvé avec l’IA.'}</span> ${msg.replace(/^<div class="small">|<\/div>$/g, '')}</div>`;
    if (s && s.status === 'ia') msg = `<div class="small">L’IA regarde l’image…</div>`;
    return btns + msg + iaRow() + pgHtml() + (st.picking ? zonePicker() : '') + (s && s.preview && !st.picking ? `<img class="lv-prev" src="${s.preview}" alt="Zone lue">` : '');
  }
  function body() {
    if (st.custom) return customPanel();
    if (sealedMode()) return sealedBody();
    const q = st.q.trim();
    let out = '';
    if (st.lot) return (q.length >= 2 ? `<div class="lv-list">${find(q).slice(0, 8).map(c => `<button type="button" class="line lv-res" data-lv="pick" data-v="${esc(c.key)}"><span class="thumb">${cimg(c)}</span><span class="mid"><b>+ ${esc(cardName(c))}</b><span>${esc(setName(c.set))} · ${esc(numLabel(c))}</span></span><span class="px"><b class="num">${basePrice(c) ? eurC(basePrice(c).v) : '—'}</b></span></button>`).join('')}</div>` : '') + lotBody();
    const list = st.results.length ? st.results : (q.length >= 2 && !st.key ? find(q) : []);
    if (list.length) out += `<div class="lv-list">${list.map(c => `<button type="button" class="line lv-res" data-lv="pick" data-v="${esc(c.key)}"><span class="thumb">${cimg(c)}</span><span class="mid"><b>${esc(cardName(c))}</b><span>${esc(setName(c.set))} · ${esc(numLabel(c))}${year(c.set) ? ' · ' + year(c.set) : ''}</span></span><span class="px"><b class="num">${basePrice(c) ? eurC(basePrice(c).v) : '—'}</b></span></button>`).join('')}</div>`;
    else if (q.length >= 2 && !st.key) out += `<div class="note">${esc(F('Aucune carte trouvée pour « {0} ».', q))}</div>`;
    const c = card();
    if (c && !list.length && st.alts && st.alts.length) out += `<div class="lv-alts"><span class="small">Pas celle-ci ?</span>${st.alts.map(k => { const x = BYKEY.get(k); return x ? `<button type="button" class="chip" data-lv="pick" data-v="${esc(k)}">${esc(cardName(x))} · ${esc(setName(x.set))} ${esc(numLabel(x))}</button>` : ''; }).join('')}</div>`;
    if (c && !list.length) out += L.blocks.filter(b => b[1]).map(([id]) => blockHtml(id, c)).join('');
    if (!c && !list.length && !q) out += recent.length ? `<div class="small" style="margin:10px 2px 6px;font-weight:600">Vues récemment</div><div class="chips">${recent.map(r => { const x = BYKEY.get(r.key); return x ? `<button type="button" class="chip" data-lv="pick" data-v="${esc(r.key)}">${esc(cardName(x))} · ${esc(numLabel(x))}</button>` : ''; }).join('')}</div>`
      : `<div class="note">Tape le nom de la carte, prends-la en photo ou lis l’écran du live pour voir sa cote.</div>`;
    if (!c && !list.length && !q) out += ebayLives();
    return out;
  }
  /* ---------- Les lives eBay de tous les pays ----------
     Chaque site eBay (fr, it, de…) a ses propres lives, mais on peut regarder et acheter dans tous.
     On propose donc tous les pays, celui de l'utilisateur en premier. Simples liens : rien n'est lu automatiquement. */
  const EBAY_LIVE = [['fr', 'France'], ['it', 'Italie'], ['de', 'Allemagne'], ['es', 'Espagne'], ['co.uk', 'Royaume-Uni'], ['com', 'États-Unis'], ['ca', 'Canada'], ['com.au', 'Australie']];
  /* Petits drapeaux dessinés (les drapeaux emoji ne s'affichent pas sous Windows) */
  const FL = b => `<svg class="lv-flag" viewBox="0 0 30 20" aria-hidden="true">${b}</svg>`;
  const UKJ = '<rect width="30" height="20" fill="#012169"/><path d="M0 0L30 20M30 0L0 20" stroke="#fff" stroke-width="4"/><path d="M0 0L30 20M30 0L0 20" stroke="#C8102E" stroke-width="1.6"/><path d="M15 0V20M0 10H30" stroke="#fff" stroke-width="6"/><path d="M15 0V20M0 10H30" stroke="#C8102E" stroke-width="3.4"/>';
  const FLAG = {
    fr: FL('<rect width="10" height="20" fill="#002654"/><rect x="10" width="10" height="20" fill="#fff"/><rect x="20" width="10" height="20" fill="#CE1126"/>'),
    it: FL('<rect width="10" height="20" fill="#009246"/><rect x="10" width="10" height="20" fill="#fff"/><rect x="20" width="10" height="20" fill="#CE2B37"/>'),
    de: FL('<rect width="30" height="7" fill="#000"/><rect y="6.6" width="30" height="6.8" fill="#DD0000"/><rect y="13.3" width="30" height="6.7" fill="#FFCE00"/>'),
    es: FL('<rect width="30" height="20" fill="#AA151B"/><rect y="5" width="30" height="10" fill="#F1BF00"/>'),
    'co.uk': FL(UKJ),
    com: FL('<rect width="30" height="20" fill="#fff"/>' + [0, 2, 4, 6, 8, 10, 12].map(i => `<rect y="${i * 20 / 13}" width="30" height="${20 / 13}" fill="#B22234"/>`).join('') + '<rect width="13" height="10.8" fill="#3C3B6E"/>'),
    ca: FL('<rect width="30" height="20" fill="#fff"/><rect width="7.5" height="20" fill="#D52B1E"/><rect x="22.5" width="7.5" height="20" fill="#D52B1E"/><path d="M15 4l1.2 2.4 1.8-.6-.6 3.4 2-1.6.6 1.4 1.8-.2-1 2.2 1 .6-4 3h-1.6v2.4h-.4V15H13.2l-4-3 1-.6-1-2.2 1.8.2.6-1.4 2 1.6-.6-3.4 1.8.6z" fill="#D52B1E"/>'),
    'com.au': FL('<rect width="30" height="20" fill="#012169"/><svg width="15" height="10" viewBox="0 0 30 20">' + UKJ + '</svg><g fill="#fff"><circle cx="7.5" cy="15" r="2"/><circle cx="23" cy="4" r="1"/><circle cx="20" cy="10" r="1"/><circle cx="26" cy="9" r="1"/><circle cx="23" cy="16.5" r="1.1"/></g>'),
  };
  function ebayLives() {
    const mine = (COUNTRY[S.country] || COUNTRY.FR).ebay;
    const list = EBAY_LIVE.slice().sort((a, b) => (b[0] === mine) - (a[0] === mine));
    const link = d => { const u = `https://www.ebay.${d}/live`; return window.callitPartnerLink ? window.callitPartnerLink(u) : { url: u, partner: false }; };
    const anyPartner = list.some(([d]) => link(d).partner);
    return `<div class="lv-ebaylive"><div class="small" style="margin:0 2px 6px;font-weight:600">Lives eBay de tous les pays</div>
      <div class="chips">${list.map(([d, n]) => `<a class="chip lv-flagchip${d === mine ? ' on' : ''}" href="${esc(link(d).url)}" target="_blank" rel="noopener" title="eBay.${esc(d)} · ${esc(tr(n))}" aria-label="Lives eBay ${esc(tr(n))}">${FLAG[d] || ''}eBay</a>`).join('')}</div>
      <div class="small" style="margin-top:6px"><span>Chaque pays a ses propres lives : regarde aussi ailleurs, les prix et la livraison changent.</span> <span>${anyPartner ? 'Liens partenaires : CallIt! touche une petite commission d’eBay si tu achètes, sans frais pour toi.' : 'Liens externes, sans commission.'}</span></div></div>`;
  }
  function blockHtml(id, c) {
    const e = estimate(c);
    if (id === 'carte') return `<div class="lv-card"><div class="lv-img">${cimg(c, { lang: st.lang || undefined })}</div><div style="min-width:0;flex:1"><b class="lv-name">${esc(cardName(c, st.lang || undefined))}</b><div class="small">${esc(setName(c.set))} · ${esc(numLabel(c))}${year(c.set) ? ' · ' + year(c.set) : ''}${rarFr(c) ? ' · ' + esc(rarFr(c)) : ''}</div>
      <div class="row" style="gap:10px;margin-top:6px;flex-wrap:wrap"><button type="button" class="linkbtn" data-lv="fiche">Fiche complète</button><button type="button" class="linkbtn" data-lv="wish">${wished(c.key) ? 'Dans mes envies ✓' : '+ Mes envies'}</button><button type="button" class="linkbtn" data-lv="clear">Autre carte</button></div></div></div>`;
    if (id === 'prix') {
      // Deux choix indépendants : la VERSION (normale ou reverse/holo, si elle existe) et la CONSERVATION (brute ou gradée)
      const hasRev = PKM ? quoteHolo(c) : pos(pf(c, 'trendHolo'));
      const condChips = `${hasRev ? `<div class="chips lv-chips"><span class="small lv-lab">Version</span>${B(!L.reverse, 'norm', '', 'Normale')}${B(L.reverse, 'rev', '', 'Reverse / holo')}</div>` : ''}
        <div class="chips lv-chips"><span class="small lv-lab">Carte</span>${B(!L.graded, 'raw', '', 'Brute')}${B(L.graded, 'gradee', '', 'Gradée')}</div>
        ${L.graded ? `<div class="chips lv-chips">${GRADERS.filter(g => g !== 'Autre').map(g => B(L.grader === g, 'grader', g, esc(g))).join('')}</div><div class="chips lv-chips">${GRADES.map(g => B(L.grade === g, 'grade', g, g === '6' ? '6 et moins' : g.replace('.', ','))).join('')}</div>`
        : `<div class="chips lv-chips">${CONDS.map(([k, n]) => B(L.cond === k, 'cond', k, k, `title="${esc(n)}"`)).join('')}</div>`}
        ${c.langs && c.langs.length > 1 ? `<div class="chips lv-chips lv-langs"><span class="small lv-lab">Langue</span>${B(!st.lang, 'lang', '', 'Toutes')}${c.langs.map(l => B(st.lang === l, 'lang', l, (LANG[l] || { short: l }).short, `title="${esc((LANG[l] || { name: l }).name)}"`)).join('')}</div>` : ''}`;
      if (!e) return `<div class="lv-block">${condChips}<div class="note" style="margin-top:8px">${esc(c.cml ? F('Pas encore de cote {0} pour cette carte (la version la moins chère de cette carte est à {1}).', SRC(), eur(c.cml)) : F('Pas encore de cote {0} pour cette carte.', SRC()))}</div></div>`;
      const what = [L.cond !== 'NM' && L.cond !== 'MT' ? F('état {0}', tr(condName(L.cond))) : '', st.lang ? (LANG_OF[st.lang] ? tr('version ' + LANG_OF[st.lang]) : F('version {0}', st.lang)) : ''].filter(Boolean).join(', ');
      const q = e.base.q, m = q ? q.m : null; // Pokémon : la cote, ses mesures (bas, tendance, hier, 7 j, 30 j), sa fourchette et sa confiance
      const k = q && e.kind !== 'ordre' && q.src === 'moy' && q.v >= 1 ? e.mid / q.v : 0; // la fourchette suit l'état et la langue choisis
      const conf = k ? `<div class="small" style="margin-top:3px">${confDot(q)}${F(['Confiance faible · de {0} à {1}', 'Confiance moyenne · de {0} à {1}', 'Confiance bonne · de {0} à {1}'][q.conf], eurR(q.lo * k), eurR(q.hi * k))}</div>` : '';
      const tag = esc(e.kind === 'cote' ? (q ? F(q.holo ? 'Cote {0}, version reverse ou holo, toutes langues' : 'Cote {0}, toutes langues', SRC()) : F('Cote {0}, {1}, toutes langues', SRC(), tr(e.base.src))) : e.kind === 'estim' ? (what ? F('Estimation · {0}', what) : tr('Estimation')) : F('Estimation {0}', tr(L.grader) + ' ' + L.grade.replace('.', ',')));
      const big = e.kind === "ordre" ? `<span class="lv-range">${eurC(e.lo)} – ${eurC(e.hi)}</span>` : eurC(e.mid);
      const al = alertOf(c);
      const ebay = `https://www.ebay.${(COUNTRY[S.country] || COUNTRY.FR).ebay}/sch/i.html?_nkw=${encodeURIComponent((PKM ? cardName(c, st.lang || undefined) + ' ' + numLabel(c) : (c.n.en || cardName(c)) + ' ' + c.num) + (L.graded ? ' ' + L.grader + ' ' + L.grade : ''))}&LH_Sold=1&LH_Complete=1`;
      return `<div class="lv-block">${condChips}
        <div class="lv-price"><div class="lv-big num">${big}</div><div class="small">${tag}</div>${conf}</div>
        <div class="lv-mini"><span>Moy. 30 j <b class="num">${eur(pos(m ? m[4] : pf(c, 'avg30')))}</b></span><span>Moy. 7 j <b class="num">${eur(pos(m ? m[3] : pf(c, 'avg7')))}</b></span><span>${m ? 'Hier' : 'Auj.'} <b class="num">${eur(pos(m ? m[2] : pf(c, 'trend')))}</b></span><span>Prix bas <b class="num">${eur(pos(m ? m[0] : pf(c, 'low')))}</b></span></div>
        ${al ? `<div class="lv-alert">${esc(al)}</div>` : ''}
        ${e.kind !== 'cote' ? `<div class="small" style="margin-top:6px">${e.kind === 'ordre' ? (e.base.v < 10 ? 'Carte à petit prix : gradée, elle vaut surtout le prix de la gradation. ' : '') : esc(F('D’après la cote toutes langues ({0}) : {1}.', tr(e.base.src), eur(e.base.lang ? e.base.raw : e.base.v))) + ' '}<a href="${ebay}" target="_blank" rel="noopener">Ventes terminées sur eBay</a> (lien externe, sans commission).</div>` : `<div class="small" style="margin-top:6px">${esc(F('{0}, toutes langues', SRC()))} · <a href="${ebay}" target="_blank" rel="noopener">ventes terminées sur eBay</a> (lien externe, sans commission)</div>`}
      </div>`;
    }
    if (id === 'live') {
      return liveBlock(e && e.mid, e && e.kind === 'ordre');
    }
    if (id === 'courbe') {
      const { pts, label } = curvePts(c);
      if (pts.length < 2) return '';
      return `<div class="lv-block lv-curve"><div class="small">${esc(label)}</div>${lineChart(pts, 'Courbe des prix')}</div>`;
    }
    if (id === 'collection') {
      const own = collection.filter(it => it.key === c.key);
      const n = own.reduce((s, it) => s + (it.qty || 1), 0);
      return `<div class="lv-block"><div class="between"><b style="font-size:14px">Dans ma collection</b><button type="button" class="linkbtn" data-lv="add">+ Ajouter</button></div><div class="small" style="margin-top:2px">${n ? esc(F(n > 1 ? '{0} exemplaires : {1}' : '{0} exemplaire : {1}', n, own.map(it => ((LANG[it.lang] || {}).short || it.lang || '') + ' ' + (it.grader ? tr(it.grader) + ' ' + (it.grade || '') : it.cond)).join(', '))) : tr('Tu ne l’as pas encore.')}${wished(c.key) && wished(c.key).max != null ? ' · ' + esc(F('prix max de ton envie : {0}', money(wished(c.key).max))) : ''}</div></div>`;
    }
    return '';
  }
  function customPanel() {
    return `<div class="lv-block"><div class="between"><b>Ce que la fenêtre affiche</b><button type="button" class="btn small primary" data-lv="custom">OK</button></div>
      <div class="lv-list" style="margin-top:8px">${L.blocks.map(([id, on], i) => `<div class="line"><label class="mid row" style="gap:8px"><input type="checkbox" data-lv-block="${id}" ${on ? 'checked' : ''}> ${esc(BLOCKS.find(b => b[0] === id)[1])}</label><button type="button" class="iconbtn sm" data-lv="up" data-v="${i}" aria-label="Monter" ${i ? '' : 'disabled'}>↑</button><button type="button" class="iconbtn sm" data-lv="down" data-v="${i}" aria-label="Descendre" ${i < L.blocks.length - 1 ? '' : 'disabled'}>↓</button></div>`).join('')}</div>
      <label class="row small" style="gap:8px;margin-top:10px"><input type="checkbox" data-lv-compact="1" ${L.compact ? 'checked' : ''}> Affichage serré (petite fenêtre)</label></div>`;
  }

  /* ---------- Produits scellés (boosters, displays, ETB…) : data/sealed.json, cotes Cardmarket ---------- */
  const sealedMode = () => PKM && L.kind === 'scelles';
  // Mots français → mots des noms Cardmarket (anglais)
  // (la catégorie française « Displays, ETB, Coffrets, Tins… » est déjà dans le texte de chaque produit)
  const SEAL_WORDS = { 'coffret dresseur d elite': 'etb', 'elite trainer box': 'etb', 'booster box': 'displays', 'boite de boosters': 'displays', pokebox: 'tins', 'mini tin': 'mini tin' };
  let SH = null;
  // Pour chaque produit : son nom, sa catégorie, et le nom de son set dans toutes les langues (« Évolutions Prismatiques » → « Prismatic Evolutions »)
  function sealedHay() {
    if (SH || !SEALED || !DB) return SH;
    const sets = DB.sets.filter(x => x.name && x.name.en && x.name.en.length >= 3 && x.reg === 'en').map(x => [norm(x.name.en), Object.values(x.name).filter(Boolean).map(norm).join(' ')]);
    SH = new Map(SEALED.items.map(x => { const n = norm(x.name); let extra = ''; for (const [en, all] of sets) if (n.includes(en)) extra += ' ' + all; return [x.id, ' ' + x.hay + ' ' + extra + ' ']; }));
    return SH;
  }
  function sealedFind(q) {
    const H = sealedHay(); if (!H) return [];
    let t = ' ' + norm(q).replace(/[^a-z0-9]+/g, ' ') + ' ';
    for (const [fr, en] of Object.entries(SEAL_WORDS)) t = t.replace(' ' + fr + ' ', ' ' + en + ' ');
    const toks = t.split(' ').filter(w => w.length >= 2); if (!toks.length) return [];
    // Chaque mot doit commencer un mot du produit ; le produit le plus simple (nom le plus court) d'abord
    return SEALED.items.filter(x => { const h = H.get(x.id); return toks.every(w => h.includes(' ' + w)); })
      .sort((a, b) => a.name.length - b.name.length || (b.added || '').localeCompare(a.added || '')).slice(0, 30);
  }
  // Lecture d'une boîte : on compte les mots lus présents dans chaque produit (nom du set, type de produit)
  const STOP = new Set(['pokemon', 'card', 'cards', 'game', 'trading', 'jeu', 'cartes', 'carte', 'collectionner', 'the', 'and', 'with', 'contains', 'contient', 'ages', 'nintendo', 'creatures', 'gamefreak']);
  function sealedMatch(text) {
    const H = sealedHay(); if (!H) return [];
    const words = [...new Set(norm(text).split(/[^a-z0-9]+/).filter(w => w.length >= 4 && !STOP.has(w)))];
    if (!words.length) return [];
    const sc = SEALED.items.map(x => { const h = H.get(x.id); return [x, words.filter(w => h.includes(' ' + w)).length]; }).filter(x => x[1] > 0);
    if (!sc.length) return [];
    const top = Math.max(...sc.map(x => x[1]));
    return sc.filter(x => x[1] === top).map(x => x[0]).sort((a, b) => a.name.length - b.name.length).slice(0, 20);
  }
  // Prix max d'achat : un pourcentage de la cote choisi par l'utilisateur (70 % par défaut), gardé d'une carte à l'autre
  const maxPct = () => Math.min(200, Math.max(5, +L.maxPct || 70));
  function verdictHtml(ref, range) {
    const v = parseNum(st.livePrice); if (v == null || !ref) return '';
    const R = toUser(ref), d = v / R - 1, mx = R * maxPct() / 100;
    const [txt, cls] = v <= mx ? ['Sous ton prix max', 'gain'] : d <= 0.02 ? ['Au-dessus de ton max', ''] : d <= 0.15 ? ['Un peu cher', 'loss'] : ['Cher', 'loss'];
    return `<div class="lv-verdict ${cls}"><b>${txt}</b> · ${esc(F(range ? '{0} % de la fourchette (milieu)' : '{0} % de la cote', Math.round(v / R * 100)))}${v <= mx ? ' · ' + esc(F('marge encore {0}', money(mx - v, userCur()))) : ''}</div>`;
  }
  function liveBlock(ref, range) {
    st.ref = [ref, range];
    const mx = ref ? eur(ref * maxPct() / 100) : '—';
    return `<div class="lv-block"><div class="lv-max"><span>Mon prix max</span><input id="lvpct" inputmode="numeric" aria-label="Pourcentage de la cote" value="${maxPct()}"><span>% de la cote =</span><b class="num" id="lv-maxv">${mx}</b></div>
      <label class="field">${esc(F('Enchère ou prix du live ({0})', userCur()))}<input id="lvlp" inputmode="decimal" placeholder="tape le prix annoncé" value="${esc(st.livePrice)}"></label>${bidCtl()}<div id="lv-verdict">${verdictHtml(ref, range)}</div></div>`;
  }
  const sRow = x => `<button type="button" class="line lv-res" data-lv="spick" data-v="${x.id}"><span class="thumb seal">${SEAL_ICON(x.catFr)}</span><span class="mid"><b>${esc(x.name)}</b><span>${esc(tr(x.catFr))}${x.asia ? ' · ' + tr('Asie') : ''}${x.added && x.added > '2008' ? ' · ' + x.added.slice(0, 4) : ''}</span></span><span class="px"><b class="num">${sPrice(x) ? eur(sPrice(x)) : '—'}</b></span></button>`;
  function sealedBody() {
    if (!SEALED) { loadSealed(); return `<div class="note">Chargement des produits scellés…</div>`; }
    const q = st.q.trim(), x = st.sid != null ? SEALED.byId.get(st.sid) : null;
    if (x) {
      const p = sPrice(x);
      return `<div class="lv-block" style="margin-top:10px"><div class="row" style="gap:12px;align-items:flex-start"><span class="lv-seal">${SEAL_ICON(x.catFr)}</span><div style="flex:1;min-width:0"><b class="lv-name">${esc(x.name)}</b><div class="small">${esc(tr(x.catFr))}${x.asia ? ' · ' + tr('version asiatique') : ''}${x.added && x.added > '2008' ? ' · ' + x.added.slice(0, 4) : ''}</div>
        <div class="row" style="gap:10px;margin-top:6px;flex-wrap:wrap"><button type="button" class="linkbtn" data-lv="sfiche">Fiche complète</button><button type="button" class="linkbtn" data-lv="sclear">Autre produit</button></div></div></div>
        <div class="lv-price" style="margin-top:8px"><div class="lv-big num">${p ? eur(p) : '—'}</div><div class="small">${p ? 'Cote Cardmarket (tendance), produit scellé, toutes langues' : 'Pas encore de cote Cardmarket pour ce produit'}</div></div>
        <div class="lv-mini"><span>Prix bas <b class="num">${eur(x.low)}</b></span></div>
        ${x.asia ? `<div class="small" style="margin-top:6px">${esc(tr(ASIA_NOTE))}.</div>` : ''}</div>
        ${liveBlock(p, false)}`;
    }
    const list = st.sres && st.sres.length ? st.sres : (q.length >= 2 ? sealedFind(q) : []);
    if (list.length) return `<div class="lv-list">${list.map(sRow).join('')}</div>`;
    if (q.length >= 2) return `<div class="note">${esc(F('Aucun produit trouvé pour « {0} ». Essaie le nom anglais du set ou un autre mot (booster, display, ETB, coffret, tin).', q))}</div>`;
    return `<div class="note">Tape le set et le type de produit (ex. « 151 display », « ETB Évolutions Prismatiques ») ou prends la boîte en photo : la cote Cardmarket du produit s’affiche tout de suite.</div>`;
  }

  /* ---------- Dessin (sans toucher au champ de recherche, pour ne pas perdre la saisie) ---------- */
  let root = null;
  function draw() {
    if (!root) return;
    root.classList.toggle('compact', !!L.compact);
    const sc = root.querySelector('#lv-scan'), bd = root.querySelector('#lv-body');
    if (sc) sc.innerHTML = scanBar();
    if (sealedMode() && SEALED && !SH) sealedHay();
    if (bd) bd.innerHTML = body();
    if (st.picking) setupPicker();
    if (pipWin && typeof i18nApply === 'function') i18nApply(root); // la fenêtre flottante n'est pas suivie par la traduction automatique
  }
  function mount(target) {
    try { localStorage.setItem('callit.liveAt', String(Date.now())); } catch (e) {}
    iaFlagFromUrl();
    target.innerHTML = shell(); root = target.querySelector('#live-root'); bind(root); draw();
  }

  /* ---------- Écran partagé : on ne prend une image QUE sur clic ---------- */
  let scr = null, scrVideo = null;
  async function share() {
    try {
      scr = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 5, width: { ideal: 3840 }, height: { ideal: 2160 } }, audio: false, selfBrowserSurface: 'exclude', surfaceSwitching: 'include' });
      const tr = scr.getVideoTracks()[0];
      tr.addEventListener('ended', () => { scr = null; scrVideo = null; draw(); });
      scrVideo = document.createElement('video'); scrVideo.muted = true; scrVideo.playsInline = true; scrVideo.srcObject = scr; await scrVideo.play().catch(() => {});
      toast('Écran connecté. Clique sur « Lire l’écran » quand la carte est montrée.');
    } catch (e) { scr = null; }
    draw();
  }
  function stopShare() { stopFollow(); if (scr) scr.getTracks().forEach(t => t.stop()); scr = null; scrVideo = null; draw(); }
  async function frame() {
    const tr = scr && scr.getVideoTracks()[0]; if (!tr) return null;
    if (window.ImageCapture) { try { return await new ImageCapture(tr).grabFrame(); } catch (e) {} }
    if (!scrVideo || !scrVideo.videoWidth) return null;
    const cv = document.createElement('canvas'); cv.width = scrVideo.videoWidth; cv.height = scrVideo.videoHeight; cv.getContext('2d').drawImage(scrVideo, 0, 0); return cv;
  }
  // Découpe la zone choisie, l'agrandit et la passe en gris contrasté pour la lecture
  function prep(src, zone) {
    const W = src.width, H = src.height;
    const z = zone || { x: 0, y: 0, w: 1, h: 1 };
    const sx = z.x * W, sy = z.y * H, sw = Math.max(8, z.w * W), sh = Math.max(8, z.h * H);
    const k = Math.min(3, 1600 / Math.max(sw, sh));
    const cv = document.createElement('canvas'); cv.width = Math.round(sw * k); cv.height = Math.round(sh * k);
    const g = cv.getContext('2d'); g.filter = 'grayscale(1) contrast(1.4)'; g.drawImage(src, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
    return cv;
  }
  let ocrReady = false;
  /* Croise tout ce qui a été lu : NUMÉRO (65/82), CODE DU SET (imprimé en lettres latines, ex. SV2a, S12a, même sur
     les cartes japonaises) et NOM (toutes langues). Le numéro + le code du set suffisent à trouver une carte japonaise
     sans lire le japonais. */
  function liveMatch(text) {
    const m = matchScan(text), t = norm(text), up = ' ' + text.toUpperCase().replace(/[^A-Z0-9]+/g, ' ') + ' ';
    const cand = new Map(m.results.map(c => [c.key, c]));
    // Ligne qui est exactement un nom de carte (ex. « Mew », donné par l'IA) : même un nom court compte
    const lines = new Set(text.split('\n').map(x => norm(x).trim()).filter(x => x.length >= 2 && x.length <= 40));
    const exactName = c => Object.values(c.n).some(n => lines.has(norm(n)));
    if (lines.size) for (const c of CARDS) { if (cand.size > 600) break; if (exactName(c)) cand.set(c.key, c); }
    if (m.nums.length) for (const c of CARDS) { if (cand.size > 400) break; if (m.nums.some(([a]) => a === c.numN)) cand.set(c.key, c); }
    // Cartes promo : pas de « 4/102 » mais un code (SWSH148, SM60, XY122, BW28, DP03, HGSS02, SVP 053, MEP 012)
    const pn = x => String(x).toLowerCase().replace(/^([a-z]*)0*(?=\d)/, '$1');
    const promos = [];
    // l'OCR confond souvent 0/O et 1/I : on corrige dans la partie chiffres
    const dg = x => String(+x.replace(/O/g, '0').replace(/[IL]/g, '1'));
    for (const r of up.matchAll(/ (SWSH|SM|XY|BW|HGSS|DP) ?([0-9OIL]{1,4}) /g)) if (/\d/.test(r[2])) promos.push([null, r[1].toLowerCase() + dg(r[2])]);
    for (const r of up.matchAll(/ (SVP|MEP)(?: [A-Z]{2})? ?([0-9OIL]{1,4}) /g)) if (/\d/.test(r[2])) promos.push([r[1].toLowerCase(), dg(r[2])]);
    const promoHit = c => promos.some(([set, n]) => (!set || c.set.id === set) && /promo/i.test(c.set.name.en || '') && pn(c.num) === n);
    if (promos.length) for (const c of CARDS) if (promoHit(c)) cand.set(c.key, c);
    const codeIn = id => id && id.length >= 3 && /\d/.test(id) && up.includes(' ' + id.toUpperCase().replace(/[^A-Z0-9]+/g, ' ') + ' ');
    const scored = [...cand.values()].map(c => {
      let sc = 0;
      for (const [a, b] of m.nums) if (c.numN === a) { sc = Math.max(sc, 3 + (String(c.set.count || '') === b.replace(/\D/g, '') ? 3 : 0)); }
      if (codeIn(c.set.id)) sc += 4;
      if (promos.length && promoHit(c)) sc += 6;
      // Nom du set lu (ou donné par l'IA, ex. « Gym Challenge ») ; les fiches Cardmarket seules (sans image) passent après
      const sn = c.set && c.set.name && c.set.name.en ? norm(c.set.name.en) : ''; if (sn.length >= 4 && t.includes(sn)) sc += 3;
      if (c.x) sc -= 1;
      let nm = 0; for (const n of Object.values(c.n)) { const k = norm(n); if ((k.length >= 4 && t.includes(k)) || lines.has(k)) nm = Math.max(nm, 3 + k.length / 20); }
      // Nom lu en lettres latines sans code de set japonais : c'est une carte internationale (EN, FR, DE…)
      if (nm && c.set.reg === 'en') nm += 1;
      return [c, sc + nm];
    }).filter(x => x[1] >= 3);
    scored.sort((a, b) => b[1] - a[1] || ((basePrice(b[0]) || {}).v || 0) - ((basePrice(a[0]) || {}).v || 0));
    const top = scored.length ? scored[0][1] : 0;
    return { nums: m.nums, promo: !!(scored[0] && promos.length && promoHit(scored[0][0])), results: scored.filter(x => x[1] >= top - 2).slice(0, 30).map(x => x[0]) };
  }
  // Le numéro lu correspond-il à la carte proposée en premier ?
  const numHit = m => !!(m.results[0] && (m.promo || m.nums && m.nums.some(([a]) => a === m.results[0].numN)));
  // Bande du bas (où est imprimé le numéro), agrandie et contrastée
  function bottomBand(cv) {
    const h = Math.round(cv.height * 0.22), y = cv.height - h, k = Math.min(3, 2400 / cv.width);
    const b = document.createElement('canvas'); b.width = Math.round(cv.width * k); b.height = Math.round(h * k);
    const g = b.getContext('2d'); g.filter = 'contrast(1.8)'; g.drawImage(cv, 0, y, cv.width, h, 0, 0, b.width, b.height); return b;
  }
  async function readImage(src, zone) {
    st.scan = { status: 'lecture', first: !ocrReady }; st.results = []; draw();
    await waitOcr(); ocrBusy = true;
    try {
      const cv = prep(src, zone); st.shot = { src, zone };
      const prev = document.createElement('canvas'); const pk = Math.min(1, 360 / cv.width); prev.width = Math.round(cv.width * pk); prev.height = Math.round(cv.height * pk); prev.getContext('2d').drawImage(cv, 0, 0, prev.width, prev.height);
      const w = await getOcr(); ocrReady = true;
      const { data } = await w.recognize(cv);
      let text = data.text || '';
      if (sealedMode()) { await showSealed(text, prev.toDataURL('image/jpeg', 0.7)); return; }
      let m = liveMatch(text);
      // Numéro pas lu (souvent : trop petit) : 2e lecture sur le bas de l'image, agrandi, en ne cherchant que des chiffres
      if (!numHit(m)) {
        try {
          const band = bottomBand(cv);
          await w.setParameters({ tessedit_char_whitelist: '0123456789/ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', tessedit_pageseg_mode: '11' });
          const r2 = await w.recognize(band);
          text += '\n' + (r2.data.text || '');
          m = liveMatch(text);
        } catch (e) { /* on garde la 1re lecture */ }
        finally { try { await w.setParameters({ tessedit_char_whitelist: '', tessedit_pageseg_mode: '3' }); } catch (e) {} }
      }
      showResult(m, prev.toDataURL('image/jpeg', 0.7));
    } catch (e) { st.scan = { status: 'erreur', text: 'La lecture n’a pas marché. Réessaie, ou tape le nom.' }; draw(); }
    finally { ocrBusy = false; }
  }
  async function showSealed(text, preview, via) {
    await loadSealed(); const r = sealedMatch(text), first = norm(text.split('\n')[0] || '');
    const exact = first && r.find(x => norm(x.name) === first); // l'IA donne souvent le nom exact du produit
    st.scan = { status: r.length ? 'scelles' : 'rien', preview, via }; st.sid = exact ? exact.id : r.length === 1 ? r[0].id : null; st.sres = r; st.q = '';
    const qi = root && root.querySelector('#lvq'); if (qi) { qi.value = ''; if (!r.length) qi.focus(); } draw();
  }
  function showResult(m, preview, via) {
    {
      if (!m.results.length) {
        // Rien trouvé : on bascule tout de suite sur la recherche, avec le numéro lu s'il y en a un (le plus fiable)
        st.scan = { status: 'rien', preview, via }; st.key = null;
        st.q = m.nums && m.nums[0] ? m.nums[0][0] + '/' + m.nums[0][1] + ' ' : '';
        draw(); const qi = root && root.querySelector('#lvq'); if (qi) { qi.value = st.q; qi.focus(); qi.setSelectionRange(qi.value.length, qi.value.length); }
        return;
      }
      st.scan = { status: 'fini', preview, via };
      st.q = ''; const qi = root && root.querySelector('#lvq'); if (qi) qi.value = '';
      if (numHit(m) || m.results.length === 1) {
        // Numéro lu : la plus probable s'affiche tout de suite ; les autres restent à un clic (« Pas celle-ci ? »)
        pick(m.results[0].key); st.alts = m.results.slice(1, 6).map(c => c.key); draw();
      } else {
        // Seul le nom est lu : beaucoup de versions possibles (ex. des dizaines de Mewtwo). On ne choisit pas au hasard :
        // on montre les versions avec leur image, les plus chères d'abord (les plus souvent montrées en live).
        const name = cardName(m.results[0]);
        const same = m.results.filter(c => norm(cardName(c)) === norm(name));
        const pool = (same.length ? find(name).filter(c => norm(cardName(c)) === norm(name)).concat(same) : m.results);
        const seen = new Set(); st.results = pool.filter(c => !seen.has(c.key) && seen.add(c.key)).sort((a, b) => ((basePrice(b) || {}).v || 0) - ((basePrice(a) || {}).v || 0)).slice(0, 24);
        st.key = null; st.scan.status = 'versions'; st.scan.name = name;
        draw();
        if (via === 'ia' && iaKey() && st.shot && st.results.length > 1) aiVersions(name);
      }
    }
  }
  async function grab() {
    const f = await frame(); if (!f) { toast('Écran non disponible : reconnecte-le'); return; }
    readImage(f, L.zone);
  }
  function fileToImage(file) {
    return new Promise((ok, ko) => { const img = new Image(); img.onload = () => { ok(img); setTimeout(() => URL.revokeObjectURL(img.src), 1000); }; img.onerror = ko; img.src = URL.createObjectURL(file); });
  }

  /* ---------- Scan IA (TEST PERSONNEL, caché) ----------
     Visible seulement après avoir ouvert #/live?ia=1 sur l'appareil (#/live?ia=0 pour le cacher),
     ou en tapant « ia on » / « ia off » dans la recherche du Mode Live (pratique dans l'appli).
     La clé API Anthropic de l'utilisateur reste dans CE navigateur (localStorage), n'est jamais dans le code,
     jamais synchronisée (Supabase) ni affichée, et n'est envoyée qu'à api.anthropic.com.
     La version publique (CallIt! Pro) passera par un relais Supabase, clé rangée côté serveur. */
  const IA_FLAG = 'callit.liveIA', IA_KEY = 'callit.anthropicKey';
  const ls = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } };
  const iaOn = () => ls(IA_FLAG) === '1';
  const iaKey = v => v === undefined ? ls(IA_KEY) : ls(IA_KEY, v);
  function iaFlagFromUrl() { const q = location.hash.split('?')[1] || ''; const v = new URLSearchParams(q).get('ia'); if (v === '1') ls(IA_FLAG, '1'); else if (v === '0') { ls(IA_FLAG, null); ls(IA_KEY, null); } }
  function iaRow() {
    if (!iaOn()) return '';
    if (!iaKey()) return `<form class="lv-ia" data-lv-form="ia" autocomplete="off"><input id="lviakey" type="password" autocomplete="off" placeholder="Ma clé API Anthropic (test)" aria-label="Clé API Anthropic, gardée sur cet appareil"><button type="button" class="btn small" data-lv="iasave">Garder</button></form>`;
    return `<div class="lv-ia">${st.shot || scr ? `<button type="button" class="btn small primary" data-lv="ia">✦ Essayer avec l’IA</button>${sealedMode() ? '' : `<button type="button" class="btn small" data-lv="ialot">${st.lot ? '✦ Ajouter au lot (IA)' : '✦ Lot avec l’IA'}</button>`}${st.key && !sealedMode() && !st.lot ? '<button type="button" class="btn small" data-lv="iapg">✦ Pré-gradation</button>' : ''}` : '<span class="small">Partage l’écran du live ou prends une photo, puis « Essayer avec l’IA ».</span>'}<button type="button" class="linkbtn" data-lv="iaclear">Effacer ma clé</button></div>`;
  }
  let sdkLoading = null;
  function loadSdk() {
    if (window.AnthropicSDK) return Promise.resolve(window.AnthropicSDK);
    return sdkLoading || (sdkLoading = new Promise((ok, ko) => { const sc = document.createElement('script'); sc.src = 'vendor/anthropic/anthropic.min.js'; sc.onload = () => ok(window.AnthropicSDK); sc.onerror = () => { sdkLoading = null; ko(new Error('sdk')); }; document.head.appendChild(sc); }));
  }
  // Image en couleur de la zone lue (l'IA voit mieux en couleur), au plus 1568 px de côté
  function colorShot() {
    const { src, zone } = st.shot, W = src.width, H = src.height, z = zone || { x: 0, y: 0, w: 1, h: 1 };
    const sw = Math.max(8, z.w * W), sh = Math.max(8, z.h * H), k = Math.min(2, 1568 / Math.max(sw, sh));
    const cv = document.createElement('canvas'); cv.width = Math.round(sw * k); cv.height = Math.round(sh * k);
    cv.getContext('2d').drawImage(src, z.x * W, z.y * H, sw, sh, 0, 0, cv.width, cv.height);
    return cv.toDataURL('image/jpeg', 0.85);
  }
  const IA_PROMPT = `Cette image est une capture d'un live de vente de cartes à collectionner (Pokémon, Magic, Yu-Gi-Oh!, One Piece) : elle montre une carte ou un produit scellé (booster, display, coffret, ETB, tin…). Identifie-le.
Réponds uniquement avec un objet JSON, sans texte autour :
{"type": "carte" | "scelle" | "rien", "nom": "nom imprimé sur la carte, dans sa langue", "nom_en": "nom anglais de la carte si tu le connais", "numero": "numéro imprimé tel quel, ex. 150/165 ou SWSH020", "code_set": "code du set imprimé s'il est visible, ex. SV2a", "langue": "code de langue de la carte : en, fr, de, it, es, pt, ja, ko, zh-tw…", "produit": "pour un produit scellé : nom anglais du set et type de produit, ex. Obsidian Flames Elite Trainer Box"}
Laisse une chaîne vide pour ce que tu ne lis pas avec certitude. N'invente pas de numéro.`;
  const S2 = x => typeof x === 'string' ? x.trim() : '';
  // Un appel à Claude avec l'image de la zone lue ; renvoie le JSON de la réponse
  async function askClaude(key, prompt, maxTokens, dataUrl, extra) {
    const Anthropic = await loadSdk();
    const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 1 });
    const data = (dataUrl || colorShot()).split(',')[1];
    const res = await client.messages.create({
      model: 'claude-haiku-5-5', max_tokens: maxTokens, output_config: { effort: 'low' },
      messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } }, ...(extra || []), { type: 'text', text: prompt }] }],
    });
    if (res.stop_reason === 'refusal') throw new Error('refus');
    const txt = res.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const mj = txt.match(/\{[\s\S]*\}/); return mj ? JSON.parse(mj[0]) : {};
  }
  function iaError(e) {
    const A = window.AnthropicSDK || {};
    return A.AuthenticationError && e instanceof A.AuthenticationError ? 'Clé refusée par Anthropic : vérifie-la, ou efface-la et recolle-la.'
      : A.PermissionDeniedError && e instanceof A.PermissionDeniedError ? 'Cette clé n’a pas accès à ce modèle.'
      : A.RateLimitError && e instanceof A.RateLimitError ? 'Trop de demandes ou limite de dépense atteinte : réessaie dans un moment.'
      : A.APIConnectionError && e instanceof A.APIConnectionError ? 'Pas de connexion avec Anthropic.'
      : e && e.message === 'refus' ? 'L’IA n’a pas voulu analyser cette image.'
      : e && e.message === 'sdk' ? 'Impossible de charger l’outil IA.'
      : 'L’IA n’a pas pu lire cette image.';
  }
  /* ---------- Lot : plusieurs cartes sur une même image (annonce, live, photo d'un tas) ---------- */
  const LOT_PROMPT = `Cette image montre une ou plusieurs cartes à collectionner (Pokémon, Magic, Yu-Gi-Oh!, One Piece), par exemple un lot vendu en live ou en annonce. Liste chaque carte visible, une entrée par carte (si la même carte apparaît 3 fois, mets 3 entrées).
Réponds uniquement avec un objet JSON, sans texte autour :
{"cartes": [{"nom": "nom imprimé, dans sa langue", "nom_en": "nom anglais si tu le connais", "numero": "numéro imprimé tel quel, ex. 18/132", "code_set": "code du set s'il est visible", "langue": "en, fr, de, it, es, pt, ja, ko…", "set": "nom anglais du set si tu le reconnais", "etat": "état apparent si on le voit assez bien : NM, EX, GD, LP, PL ou PO ; vide sinon"}]}
Laisse une chaîne vide pour ce que tu ne lis pas avec certitude. N'invente pas de numéro. 40 cartes au plus.`;
  let lotId = 0;
  function lotItem(m, lg, label) {
    const r = m.results || [], c = r[0];
    return { id: ++lotId, key: c ? c.key : null, alts: r.slice(0, 8).map(x => x.key), lang: c && lg && c.langs && c.langs.includes(lg) ? lg : null, cond: L.cond || 'NM', label };
  }
  // Pour l'IA : image FRAÎCHE de l'écran partagé à chaque clic (sinon l'IA relirait la capture précédente).
  // Sans écran partagé (photo, capture importée), on garde la dernière image.
  async function freshShot() {
    if (!scr) return !!st.shot;
    const f = await frame(); if (!f) return !!st.shot;
    st.shot = { src: f, zone: L.zone };
    try { const cv = prep(f, L.zone), pv = document.createElement('canvas'), pk = Math.min(1, 360 / cv.width); pv.width = Math.round(cv.width * pk); pv.height = Math.round(cv.height * pk); pv.getContext('2d').drawImage(cv, 0, 0, pv.width, pv.height); st.scan = Object.assign({}, st.scan, { preview: pv.toDataURL('image/jpeg', 0.7) }); } catch (e) {}
    return true;
  }
  async function aiLot() {
    const key = iaKey(); if (!key || !(await freshShot())) return;
    const preview = st.scan && st.scan.preview;
    st.scan = { status: 'ia', preview }; draw();
    try {
      const j = await askClaude(key, LOT_PROMPT, 4096);
      const list = Array.isArray(j.cartes) ? j.cartes.slice(0, 40) : [];
      if (!list.length) { st.scan = { status: 'rien', preview, via: 'ia' }; draw(); return; }
      const items = list.map(x => Object.assign(lotItem(liveMatch([S2(x.nom), S2(x.nom_en), S2(x.numero), S2(x.code_set), S2(x.set)].join('\n')), S2(x.langue).toLowerCase(), [S2(x.nom) || S2(x.nom_en), S2(x.numero)].filter(Boolean).join(' ')), CONDS.some(c => c[0] === S2(x.etat).toUpperCase()) ? { cond: S2(x.etat).toUpperCase(), iaCond: true } : {}));
      if (st.lot) {
        // Lot déjà ouvert : on n'ajoute que les cartes nouvelles (le vendeur ajoute ses cartes au fur et à mesure).
        // Même carte vue plusieurs fois : on n'en ajoute que ce qui dépasse ce que le lot contient déjà.
        const idOf = it => it.key || 'x:' + norm(it.label || ''), have = new Map();
        st.lot.items.forEach(it => have.set(idOf(it), (have.get(idOf(it)) || 0) + 1));
        const seen = new Map(), added = [];
        items.forEach(it => { const k = idOf(it), nb = (seen.get(k) || 0) + 1; seen.set(k, nb); if (nb > (have.get(k) || 0)) added.push(it); });
        st.lot.items.push(...added);
        toast(added.length ? F(added.length > 1 ? '{0} cartes ajoutées au lot' : '{0} carte ajoutée au lot', added.length) : tr('Rien de nouveau dans le lot'));
      } else st.lot = { items };
      st.key = null; st.results = []; st.livePrice = ''; st.q = '';
      st.scan = { status: 'lot', preview, via: 'ia' }; draw();
    } catch (e) { st.scan = { status: 'erreur', text: iaError(e), preview }; draw(); }
  }
  // Cote d'une carte du lot avec SON état et SA langue (non gradée)
  function estFor(c, it) {
    const sv = [L.cond, L.graded, L.reverse, st.lang];
    L.cond = it.cond; L.graded = false; L.reverse = false; st.lang = it.lang;
    try { return estimate(c); } finally { [L.cond, L.graded, L.reverse, st.lang] = sv; }
  }
  function lotBody() {
    const items = st.lot.items; let total = 0, n = 0;
    const rows = items.map((it, i) => {
      const c = it.key && BYKEY.get(it.key);
      if (!c) return `<div class="line lv-lotrow"><span class="thumb">?</span><span class="mid"><b>Non reconnue</b><span>${esc(it.label || '')}</span><span class="row" style="gap:10px;margin-top:4px"><button type="button" class="linkbtn" data-lv="lotfind" data-v="${i}">Chercher</button><button type="button" class="linkbtn" data-lv="lotdel" data-v="${i}">Retirer</button></span></span></div>`;
      const e = estFor(c, it); if (e) { total += e.mid; n++; }
      const vers = [...new Set([it.key, ...it.alts])].map(k => BYKEY.get(k)).filter(Boolean);
      const sel = (name, opts) => `<select data-lvsel="${name}" data-i="${i}" aria-label="${name === 'ver' ? 'Version' : name === 'cond' ? 'État' : 'Langue'}">${opts}</select>`;
      return `<div class="line lv-lotrow"><span class="thumb">${cimg(c)}</span><span class="mid"><b>${esc(cardName(c))}</b><span>${esc(setName(c.set))} · ${esc(numLabel(c))}</span>
        <span class="lv-lotsel">${vers.length > 1 ? sel('ver', vers.map(x => `<option value="${esc(x.key)}"${x.key === it.key ? ' selected' : ''}>${esc(cardName(x))} · ${esc(setName(x.set))} ${esc(numLabel(x))}</option>`).join('')) : ''}
        ${sel('cond', CONDS.map(([k]) => `<option value="${k}"${k === it.cond ? ' selected' : ''}>${k}${k === it.cond && it.iaCond ? ' ' + tr('(IA)') : ''}</option>`).join(''))}
        ${c.langs && c.langs.length > 1 ? sel('lang', `<option value="">Toutes langues</option>` + c.langs.map(l => `<option value="${l}"${l === it.lang ? ' selected' : ''}>${esc((LANG[l] || { short: l }).short)}</option>`).join('')) : ''}
        <button type="button" class="linkbtn" data-lv="lotdel" data-v="${i}">Retirer</button></span></span>
        <span class="px"><b class="num">${e ? eurC(e.mid) : '—'}</b></span></div>`;
    }).join('');
    return `<div class="lv-block" style="margin-top:10px"><div class="row" style="justify-content:space-between;align-items:center"><b>${esc(F(items.length > 1 ? 'Lot · {0} cartes' : 'Lot · {0} carte', items.length))}</b><button type="button" class="linkbtn" data-lv="lotclose">Fermer le lot</button></div>
      <div class="small" style="margin-top:4px">Corrige une carte (version, état, langue) ou retire-la. Un état marqué « (IA) » est deviné sur la photo : vérifie-le. Pour en ajouter une, tape son nom au-dessus, ou touche « Ajouter au lot (IA) » quand le vendeur montre de nouvelles cartes : seules les nouvelles s’ajoutent.</div></div>
      <div class="lv-list">${rows}</div>
      <div class="lv-block"><div class="lv-price"><div class="lv-big num">${n ? eur(total) : '—'}</div><div class="small">${esc(n < items.length ? F(items.length - n > 1 ? 'Total du lot ({0} cartes sans cote) · estimation selon l’état et la langue de chaque carte' : 'Total du lot ({0} carte sans cote) · estimation selon l’état et la langue de chaque carte', items.length - n) : tr('Total du lot · estimation selon l’état et la langue de chaque carte'))}</div></div></div>
      ${n ? liveBlock(total, false) : ''}`;
  }
  /* ---------- Pré-gradation (estimation, PAS une note officielle) ---------- */
  // Langue des constats écrits par l'IA : celle de l'appli (les mots-clés du JSON restent en français)
  const IA_LANG = { fr: 'français', en: 'anglais', de: 'allemand', es: 'espagnol', it: 'italien' }[UI] || 'français';
  const IA_WRITE = `Écris les constats et les défauts en ${IA_LANG}, mais garde "faible", "moyenne" ou "bonne" tels quels pour la fiabilité.`;
  const PG_PROMPT = `Cette image montre une carte à collectionner. Fais une PRÉ-ÉVALUATION de son état, comme un collectionneur expérimenté avant un envoi en gradation (PSA). Regarde le centrage (bordures gauche/droite et haut/bas), les coins, les bords et la surface (rayures, plis, taches, reflets anormaux).
Réponds uniquement avec un objet JSON, sans texte autour :
{"visible": true ou false (false si l'image est trop floue, trop petite ou ne montre pas la carte en entier), "centrage": "estimation gauche/droite, ex. 55/45", "centrage_hb": "estimation haut/bas", "coins": "court constat", "bords": "court constat", "surface": "court constat", "defauts": ["liste courte des défauts DE LA CARTE vus (pli, coin abîmé, rayure…), vide s'il n'y en a pas"], "psa_min": nombre, "psa_max": nombre, "fiabilite": "faible" | "moyenne" | "bonne"}
Sois prudent : une photo ou une capture de live cache beaucoup de défauts, donc reste large et mets "faible" si tu n'es pas sûr. La qualité de l'image (flou, reflets du plastique, compression, étui) n'est JAMAIS un défaut de la carte : n'en parle pas dans "defauts", elle se traduit seulement par la fiabilité. Constats en quelques mots (5 au plus).
${IA_WRITE}`;
  async function aiPregrade() {
    const key = iaKey(), c = card(); if (!key || !c || !(await freshShot())) return;
    st.pregrade = { key: c.key, wait: true }; draw();
    const url = colorShot();
    try {
      // En même temps : l'avis de l'IA, et les 4 coins pour redresser la carte et mesurer le centrage (même outil que le Centrage)
      const [j, m] = await Promise.all([askClaude(key, PG_PROMPT, 2048, url), straightMeasure(url)]);
      const n = x => { const v = parseFloat(x); return isNaN(v) ? null : Math.max(1, Math.min(10, v)); };
      st.pregrade = Object.assign({ key: c.key, j, lo: n(j.psa_min), hi: n(j.psa_max), url }, m || {});
    } catch (e) { st.pregrade = { key: c.key, err: iaError(e) }; }
    draw();
  }
  const loadImg = src => new Promise((ok, ko) => { const im = new Image(); im.onload = () => ok(im); im.onerror = ko; im.src = src; });
  // Redresse la carte (coins trouvés par l'IA, remise à plat de redresse.js) puis mesure les bordures (ctrDetect d'app.js).
  // Renvoie null si un des outils manque ou si la carte n'est pas trouvée : la pré-gradation s'affiche alors sans mesure.
  async function straightMeasure(url) {
    try {
      const R = window.CallItRedresse; if (!R || typeof ctrDetect !== 'function' || !window.CallItIA) return null;
      const co = await window.CallItIA.coins(url); if (!co || !co.q) return null;
      const MG = 0.06, RT = typeof GAME !== 'undefined' && GAME === 'ygo' ? 86 / 59 : 88 / 63;
      const straight = R.warp(await loadImg(url), co.q, MG);
      const L = ctrDetect(await loadImg(straight), { x: MG / (1 + 2 * MG) * 100, y: MG / (RT + 2 * MG) * 100 }, 'normal');
      const sh = ctrShares(L); if (!sh) return { straight };
      const lr = Math.round(sh[0]), tb = Math.round(sh[1]), worst = Math.max(lr, 100 - lr, tb, 100 - tb);
      return { straight, L, lr, tb, ctrPsa: (PSA_CTR.find(([, f]) => worst <= f) || [1])[0] };
    } catch (e) { return null; }
  }
  /* ---------- Bords et surface sur la page Centrage (même test IA, même clé) ---------- */
  const BORDS_PROMPT = `Cette photo montre une face d'une carte à collectionner, prise par son propriétaire avant un envoi en gradation. Examine uniquement l'état physique : les 4 coins (arrondis, écrasés, blanchis), les 4 bords (points blancs, blanchiment, éclats, encoches) et la surface (rayures, plis, bosses, taches, défauts d'impression). Ne juge pas le centrage.
Réponds uniquement avec un objet JSON, sans texte autour :
{"visible": true ou false (false si la photo est trop floue, trop sombre ou ne montre pas la carte en entier), "coins": "court constat, en précisant lesquels (haut gauche, bas droit…)", "bords": "court constat, en précisant où", "surface": "court constat", "defauts": ["liste courte des défauts vus, avec leur position"], "fiabilite": "faible" | "moyenne" | "bonne"}
Ne signale que ce que tu vois vraiment. Une photo cache les petits défauts : mets "faible" si l'image ne permet pas de bien voir.
${IA_WRITE}`;
  function smallJpeg(url) {
    return new Promise((ok, ko) => { const im = new Image(); im.onload = () => { const k = Math.min(1, 1568 / Math.max(im.width, im.height)); const cv = document.createElement('canvas'); cv.width = Math.round(im.width * k); cv.height = Math.round(im.height * k); cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height); ok(cv.toDataURL('image/jpeg', 0.9)); }; im.onerror = ko; im.src = url; });
  }
  const COINS_PROMPT = `Cette photo montre une carte à collectionner (format rectangle, coins arrondis), parfois prise un peu de biais ou penchée. Donne la position des 4 coins de la carte elle-même (le bord extérieur de la carte, pas le cadre de l'illustration ni un étui), en pourcentage de la largeur (x) et de la hauteur (y) de l'image, avec une décimale. Pour un coin arrondi, donne le point où les deux bords droits se croiseraient.
Réponds uniquement avec un objet JSON, sans texte autour :
{"visible": true ou false, "hg": [x, y], "hd": [x, y], "bd": [x, y], "bg": [x, y]}
(hg = haut gauche, hd = haut droit, bd = bas droit, bg = bas gauche de la carte, telle qu'on la lit).`;
  // Réponse libre (questions sur la carte), avec l'historique de la conversation
  async function askText(key, msgs, dataUrl) {
    const Anthropic = await loadSdk();
    const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 1 });
    const data = dataUrl.split(',')[1];
    const sys = `Tu aides un collectionneur de cartes (Pokémon, Magic, Yu-Gi-Oh!, One Piece) qui prépare un envoi en gradation. Tu vois une photo d'une face de sa carte. Réponds en ${IA_LANG}, simplement, en 2 à 5 phrases, sans titres ni listes longues. Sois honnête sur ce qu'une photo ne permet pas de voir. Ne donne pas de note officielle : parle d'estimation.`;
    const content = [];
    msgs.forEach((m, i) => content.push({ role: 'user', content: i === 0 ? [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } }, { type: 'text', text: m.q }] : m.q }, ...(m.a ? [{ role: 'assistant', content: m.a }] : [])));
    const res = await client.messages.create({ model: 'claude-haiku-5-5', max_tokens: 1024, output_config: { effort: 'low' }, system: sys, messages: content });
    return res.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
  }
  // Aujourd'hui : clé de test sur l'appareil. Plus tard : réservé à l'abonnement (même porte d'entrée, ready()).
  window.CallItIA = {
    ready: () => iaOn() && !!iaKey(),
    async coins(url) {
      try {
        const j = await askClaude(iaKey(), COINS_PROMPT, 1024, await smallJpeg(url));
        const pt = v => Array.isArray(v) && v.length === 2 && v.every(n => isFinite(+n)) ? [Math.max(0, Math.min(100, +v[0])) / 100, Math.max(0, Math.min(100, +v[1])) / 100] : null;
        const q = [pt(j.hg), pt(j.hd), pt(j.bd), pt(j.bg)];
        if (j.visible === false || q.some(x => !x)) return { err: 'L’IA ne voit pas bien la carte : reprends la photo plus nette, la carte en entier.' };
        return { q };
      } catch (e) { return { err: iaError(e) }; }
    },
    async question(url, msgs) {
      try { return { a: await askText(iaKey(), msgs, await smallJpeg(url)) }; }
      catch (e) { return { err: iaError(e) }; }
    },
    async bords(url) {
      try { const j = await askClaude(iaKey(), BORDS_PROMPT, 2048, await smallJpeg(url)); return { j }; }
      catch (e) { return { err: iaError(e) }; }
    },
  };
  const nearGrade = g => (g >= 9.75 ? '10' : g >= 9.25 ? '9.5' : g >= 8.5 ? '9' : g >= 7.5 ? '8' : g >= 6.5 ? '7' : '6');
  function pgHtml() {
    const p = st.pregrade; if (!p || p.key !== st.key) return '';
    if (p.wait) return `<div class="lv-block lv-pg"><div class="small">L’IA examine la carte…</div></div>`;
    if (p.err) return `<div class="lv-block lv-pg"><div class="small">${esc(p.err)}</div></div>`;
    const j = p.j || {};
    if (j.visible === false || p.lo == null) return `<div class="lv-block lv-pg"><b>Pré-gradation impossible</b><div class="small">L’image ne montre pas assez bien la carte. Demande au vendeur de la montrer de près, bien à plat, ou prends une photo nette.</div></div>`;
    const lo = Math.min(p.lo, p.hi || p.lo), hi = Math.max(p.lo, p.hi || p.lo), g = nearGrade((lo + hi) / 2);
    const def = Array.isArray(j.defauts) ? j.defauts.map(S2).filter(Boolean).slice(0, 6) : [];
    const fig = p.straight ? `<button type="button" class="lv-pgfig${st.pgBig ? ' big' : ''}" data-lv="pgzoom" aria-label="${esc(tr('Agrandir la carte redressée'))}"><img src="${p.straight}" alt="${esc(tr('Carte redressée'))}">${p.L ? `<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${[0, 1, 2, 3].map(i => `<line x1="${p.L[i]}" x2="${p.L[i]}" y1="0" y2="100" class="${i === 0 || i === 3 ? 'o' : 'i'}"/>`).join('')}${[4, 5, 6, 7].map(i => `<line y1="${p.L[i]}" y2="${p.L[i]}" x1="0" x2="100" class="${i === 4 || i === 7 ? 'o' : 'i'}"/>`).join('')}</svg>` : ''}</button>` : '';
    const meas = p.lr != null ? `<div class="lv-pgm">
        <div class="lv-pgtile"><span>${esc(tr('Gauche / Droite'))}</span><b class="num">${p.lr}/${100 - p.lr}</b></div>
        <div class="lv-pgtile"><span>${esc(tr('Haut / Bas'))}</span><b class="num">${p.tb}/${100 - p.tb}</b></div>
        <div class="lv-pgcap">${esc(F('Au mieux PSA {0} pour le centrage', p.ctrPsa))}</div></div>`
      : p.straight ? `<div class="lv-pgm"><div class="small">${esc(tr('Carte redressée, mais les bordures ne sont pas assez nettes pour être mesurées.'))}</div></div>` : '';
    const row = (t, v) => S2(v) ? `<div class="lv-pgc"><span>${esc(tr(t))}</span><b>${esc(S2(v))}</b></div>` : '';
    const imgBad = /flou|blur|sfoc|unscharf|borros|reflet|reflect|riflesso|compress|qualit|image|photo|capture|plastique|étui|sleeve|toploader/i;
    const defs = def.filter(d => !imgBad.test(d));
    return `<div class="lv-block lv-pg">
      <div class="lv-pghead"><div><span class="eyebrow">${esc(tr('Estimation'))}</span><b>${esc(tr('Pré-gradation'))}</b></div><span class="lv-pgnote num">${lo === hi ? 'PSA ' + lo : esc(F('PSA {0} à {1}', lo, hi))}</span></div>
      ${fig ? `<div class="lv-pgimg${st.pgBig ? ' big' : ''}">${fig}${meas}</div>` : ''}
      <div class="lv-pgd">${p.lr == null ? row('Centrage', [S2(j.centrage), S2(j.centrage_hb)].filter(Boolean).join(' · ')) : ''}${row('Coins', j.coins)}${row('Bords', j.bords)}${row('Surface', j.surface)}</div>
      ${defs.length ? `<div class="lv-pgtags"><span>${esc(tr('Défauts'))}</span>${defs.map(d => `<em>${esc(d)}</em>`).join('')}</div>` : ''}
      <div class="small lv-pgwarn">${esc(F('Estimation sur image, pas une note officielle. Fiabilité : {0}.', tr(S2(j.fiabilite) || 'faible')))}</div>
      <div class="lv-pgact"><button type="button" class="btn small" data-lv="pgapply" data-v="${g}">${esc(F('Voir la cote en PSA {0}', g))}</button><button type="button" class="linkbtn" data-lv="pgctr">${esc(tr('Mesurer le centrage précisément'))}</button></div></div>`;
  }
  /* L'IA a lu le nom mais pas le numéro (ex. un Mew parmi des dizaines de versions) : on lui montre l'image du live
     et les images officielles des versions possibles (les plus chères d'abord), et elle désigne celle qui correspond. */
  async function aiVersions(name) {
    const cands = st.results.slice(0, 16).map(c => { try { const l = PKM ? imgOrder(c, prefLang(c)).filter(x => x[0] !== '@')[0] : 'x'; return l ? { c, url: imgUrl(c, l, 'low') } : null; } catch (e) { return null; } }).filter(Boolean);
    if (cands.length < 2) return;
    const shot = st.shot; st.scan.status = 'compare'; draw();
    try {
      const extra = []; cands.forEach((x, i) => extra.push({ type: 'text', text: `Version ${i + 1} :` }, { type: 'image', source: { type: 'url', url: x.url } }));
      const j = await askClaude(iaKey(), `La première image est une capture de live montrant une carte « ${name} ». Les images suivantes sont les versions officielles possibles de cette carte, numérotées. Compare l'illustration, le cadre, la couleur, le symbole et le texte, et dis laquelle est montrée dans le live.
Réponds uniquement avec un objet JSON : {"version": numéro de la version (0 si aucune ne correspond ou si tu hésites vraiment), "sur": true ou false}`, 300, null, extra);
      if (st.shot !== shot || !st.scan || st.scan.status !== 'compare') return; // l'utilisateur est passé à autre chose
      const n = parseInt(j.version, 10), hit = n >= 1 && n <= cands.length ? cands[n - 1].c : null;
      if (!hit) { st.scan.status = 'versions'; draw(); return; }
      st.scan.status = 'fini'; st.scan.via = 'ia'; st.scan.unsure = j.sur === false;
      pick(hit.key); st.alts = cands.map(x => x.c.key).filter(k => k !== hit.key).slice(0, 6); draw();
    } catch (e) { if (st.scan && st.scan.status === 'compare') { st.scan.status = 'versions'; draw(); } }
  }
  async function aiScan() {
    const key = iaKey(); if (!key || !(await freshShot())) return;
    const preview = st.scan && st.scan.preview, wasSealed = sealedMode();
    st.scan = { status: 'ia', preview }; draw();
    try {
      const j = await askClaude(key, IA_PROMPT, 1024);
      if (j.type === 'rien' || (!S2(j.nom) && !S2(j.nom_en) && !S2(j.numero) && !S2(j.produit))) { st.scan = { status: 'rien', preview, via: 'ia' }; draw(); return; }
      if (wasSealed || j.type === 'scelle') {
        if (!wasSealed) { L.kind = 'scelles'; saveL(); const host = root.parentNode; mount(host); }
        await showSealed([S2(j.produit), S2(j.nom), S2(j.nom_en)].join('\n'), preview, 'ia'); return;
      }
      const m = liveMatch([S2(j.nom), S2(j.nom_en), S2(j.numero), S2(j.code_set)].join('\n'));
      showResult(m, preview, 'ia');
      const c = card(), lg = S2(j.langue).toLowerCase();
      if (c && lg && c.langs && c.langs.includes(lg)) { st.lang = lg; draw(); }
    } catch (e) { st.scan = { status: 'erreur', text: iaError(e), preview }; draw(); }
  }

  /* ---------- Suivi de l'enchère : lancé par l'utilisateur, il relit toutes les 2 s le petit cadre du montant
     sur SON écran partagé (rien n'est envoyé, rien ne se connecte à eBay). S'arrête sur Stop, en changeant de carte
     ou en coupant le partage. ---------- */
  let ocrBusy = false;
  const waitOcr = async () => { while (ocrBusy) await new Promise(r => setTimeout(r, 80)); };
  // « 1 234,50 € », « €12.50 », « $1,234 », « 45 » → nombre
  function parseBid(text) {
    const t = String(text).replace(/[Oo](?=[\d.,]*\d)/g, '0');
    const all = [...t.matchAll(/(\d[\d\s.,]*\d|\d)/g)].map(m => ({ s: m[1], i: m.index }));
    if (!all.length) return null;
    const cur = all.find(m => /[€$£¥]/.test(t.slice(Math.max(0, m.i - 2), m.i + m.s.length + 2))) || all[0];
    let x = cur.s.replace(/\s/g, '');
    const lc = x.lastIndexOf(','), ld = x.lastIndexOf('.');
    const dec = Math.max(lc, ld);
    if (dec >= 0 && x.length - dec - 1 <= 2 && x.length - dec - 1 > 0) x = x.slice(0, dec).replace(/[.,]/g, '') + '.' + x.slice(dec + 1);
    else x = x.replace(/[.,]/g, '');
    const v = parseFloat(x); return isNaN(v) || v <= 0 ? null : v;
  }
  function bidCtl() {
    if (!scr) return canScreen() ? `<div class="small lv-bidst">Connecte l’écran du live pour suivre l’enchère automatiquement.</div>` : '';
    const f = st.follow;
    if (f) return `<div class="row lv-bid"><button type="button" class="btn small" data-lv="unfollow"><span class="lv-dot"></span> Stop le suivi</button><span class="small lv-bidst" id="lv-bidst">${esc(f.msg || 'Suivi en cours…')}</span></div>`;
    return `<div class="row lv-bid"><button type="button" class="btn small primary" data-lv="follow">Suivre l’enchère</button>${L.bidZone ? '<button type="button" class="linkbtn" data-lv="follow" data-v="zone">Changer la zone du prix</button>' : ''}</div>`;
  }
  function stopFollow() { if (st.follow) { clearTimeout(st.follow.t); st.follow = null; } }
  function startFollow() {
    stopFollow(); if (!scr || !L.bidZone) { draw(); return; }
    const f = st.follow = { t: 0, msg: 'Suivi en cours…' }; draw();
    const tick = async () => {
      if (st.follow !== f) return;
      if (!ocrBusy && !(st.scan && st.scan.status === 'lecture')) {
        ocrBusy = true;
        try {
          const img = await frame();
          if (img) {
            const z = L.bidZone, W = img.width, H = img.height, sw = Math.max(4, z.w * W), sh = Math.max(4, z.h * H);
            const k = Math.max(1, Math.min(4, 120 / sh)); // un montant d'environ 120 px de haut se lit bien
            const cv = document.createElement('canvas'); cv.width = Math.round(sw * k); cv.height = Math.round(sh * k);
            const g = cv.getContext('2d'); g.filter = 'grayscale(1) contrast(1.6)'; g.drawImage(img, z.x * W, z.y * H, sw, sh, 0, 0, cv.width, cv.height);
            const w = await getOcr(); ocrReady = true;
            await w.setParameters({ tessedit_char_whitelist: '0123456789.,€$£ ', tessedit_pageseg_mode: '7' });
            let r; try { r = await w.recognize(cv); } finally { await w.setParameters({ tessedit_char_whitelist: '', tessedit_pageseg_mode: '3' }); }
            const v = parseBid(r.data.text || ''), now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            if (st.follow !== f) return;
            if (v != null) {
              const val = String(v).replace('.', ',');
              f.msg = F('Enchère lue à {0}', now);
              if (st.livePrice !== val) { const i = root && root.querySelector('#lvlp'); st.livePrice = val; if (i) { i.value = val; i.dispatchEvent(new Event('input', { bubbles: true })); } }
            } else f.msg = F('Montant illisible à {0} : resserre la zone du prix', now);
            const m = root && root.querySelector('#lv-bidst'); if (m) m.textContent = f.msg;
          }
        } catch (e) { f.msg = 'Lecture impossible pour l’instant'; }
        finally { ocrBusy = false; }
      }
      if (st.follow === f) f.t = setTimeout(tick, 2000);
    };
    tick();
  }

  /* ---------- Choix de la zone : on trace un rectangle sur une image de l'écran ---------- */
  function zonePicker() {
    const bid = st.picking && st.picking.kind === 'bid';
    return `<div class="lv-zone"><div class="small" style="font-weight:600">${bid ? 'Trace un rectangle serré autour du montant de l’enchère (seulement le prix), puis valide.' : 'Trace un rectangle autour de l’endroit où la carte apparaît, puis valide.'}</div>
      <div class="lv-zwrap"><canvas id="lvzc"></canvas><div class="lv-zrect" hidden></div></div>
      <div class="row" style="gap:8px"><button type="button" class="btn small primary" data-lv="zoneok">Valider</button>${bid ? '' : '<button type="button" class="btn small" data-lv="zoneall">Tout l’écran</button>'}<button type="button" class="btn small" data-lv="zonecancel">Annuler</button></div></div>`;
  }
  function setupPicker() {
    const p = st.picking, cv = root.querySelector('#lvzc'), rect = root.querySelector('.lv-zrect'); if (!cv || !p) return;
    const k = Math.min(1, 1200 / p.img.width); cv.width = Math.round(p.img.width * k); cv.height = Math.round(p.img.height * k);
    cv.getContext('2d').drawImage(p.img, 0, 0, cv.width, cv.height);
    const show = z => { if (!z) { rect.hidden = true; return; } rect.hidden = false; Object.assign(rect.style, { left: z.x * 100 + '%', top: z.y * 100 + '%', width: z.w * 100 + '%', height: z.h * 100 + '%' }); };
    show(p.zone);
    let a = null;
    const rel = ev => { const r = cv.getBoundingClientRect(); return [Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height))]; };
    cv.addEventListener('pointerdown', ev => { a = rel(ev); cv.setPointerCapture(ev.pointerId); ev.preventDefault(); });
    cv.addEventListener('pointermove', ev => { if (!a) return; const b = rel(ev); p.zone = { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(b[0] - a[0]), h: Math.abs(b[1] - a[1]) }; show(p.zone); });
    cv.addEventListener('pointerup', () => { a = null; });
  }

  /* ---------- Fenêtre flottante (Chrome / Edge sur ordinateur) : reste au-dessus du live ---------- */
  let pipWin = null;
  async function openPip() {
    try {
      const w = await documentPictureInPicture.requestWindow({ width: 380, height: 620 });
      pipWin = w;
      for (const ss of [...document.styleSheets]) {
        try { const s = w.document.createElement('style'); s.textContent = [...ss.cssRules].map(r => r.cssText).join('\n'); w.document.head.appendChild(s); }
        catch (e) { if (ss.href) { const l = w.document.createElement('link'); l.rel = 'stylesheet'; l.href = ss.href; w.document.head.appendChild(l); } }
      }
      w.document.title = 'CallIt! Live';
      w.document.documentElement.dataset.theme = document.documentElement.dataset.theme;
      w.document.body.dataset.face = document.body.dataset.face;
      w.document.body.className = 'lv-pipbody';
      w.document.body.appendChild(root);
      w.addEventListener('keydown', onKey);
      w.addEventListener('pagehide', () => { pipWin = null; root = null; if (isLive()) render(); });
      app.innerHTML = `<div class="live"><div class="lv-top"><a class="iconbtn" href="#/" aria-label="Accueil">${icon('back')}</a><b class="lv-title"><span class="lv-dot"></span>Live</b><span></span></div><div class="note">Le mode Live est ouvert dans la fenêtre flottante, au-dessus de tes autres fenêtres. Ferme-la pour le ramener ici.</div></div>`;
      draw();
    } catch (e) { pipWin = null; toast('Fenêtre flottante impossible dans ce navigateur'); }
  }

  /* ---------- Événements (posés sur la fenêtre Live elle-même, pour marcher aussi dans la fenêtre flottante) ---------- */
  function bind(el) {
    el.addEventListener('click', ev => {
      const b = ev.target.closest('[data-lv]'); if (!b || !el.contains(b)) return;
      const a = b.dataset.lv, v = b.dataset.v;
      if (a === 'close') { if (pipWin) pipWin.close(); stopShare(); location.hash = '#/'; }
      else if (a === 'kind') { L.kind = v; saveL(); st.q = ''; st.sid = null; st.sres = null; st.scan = null; st.key = null; if (v === 'scelles') loadSealed(); const host = root.parentNode; mount(host); return; }
      else if (a === 'spick') { stopFollow(); st.sid = +v; st.sres = null; st.livePrice = ''; draw(); }
      else if (a === 'sclear') { stopFollow(); st.sid = null; st.sres = null; st.scan = null; const qi = el.querySelector('#lvq'); st.q = ''; if (qi) { qi.value = ''; qi.focus(); } draw(); }
      else if (a === 'sfiche') { window.focus(); location.hash = '#/scelle/' + st.sid; }
      else if (a === 'pick' && st.lot) { const x = BYKEY.get(v); if (x) { const f = st.lot.fix; if (f != null && st.lot.items[f]) Object.assign(st.lot.items[f], { key: v, alts: [] }); else st.lot.items.push({ id: ++lotId, key: v, alts: [], lang: null, cond: L.cond || 'NM' }); st.lot.fix = null; st.q = ''; const qi = el.querySelector('#lvq'); if (qi) qi.value = ''; draw(); } }
      else if (a === 'pick') { const x = BYKEY.get(v); if (x) pick(v); }
      else if (a === 'ialot') aiLot();
      else if (a === 'iapg') aiPregrade();
      else if (a === 'pgzoom') { st.pgBig = !st.pgBig; draw(); }
      else if (a === 'pgctr') { const u = st.pregrade && st.pregrade.url; if (u && typeof baseShare === 'function') fetch(u).then(r => r.blob()).then(b => baseShare(b)); else location.hash = '#/centrage'; }
      else if (a === 'pgapply') { L.graded = true; L.grader = 'PSA'; L.grade = v; saveL(); draw(); }
      else if (a === 'lotdel') { st.lot.items.splice(+v, 1); draw(); }
      else if (a === 'lotclose') { st.lot = null; st.livePrice = ''; st.scan = null; draw(); }
      else if (a === 'lotfind') { const it = st.lot.items[+v]; st.lot.fix = +v; st.q = (it && it.label) || ''; const qi = el.querySelector('#lvq'); if (qi) { qi.value = st.q; qi.focus(); } draw(); }
      else if (a === 'clear') { st.key = null; st.scan = null; st.alts = []; const qi = el.querySelector('#lvq'); st.q = ''; if (qi) { qi.value = ''; qi.focus(); } draw(); }
      else if (a === 'raw') { L.graded = false; saveL(); draw(); }
      else if (a === 'gradee') { L.graded = true; saveL(); draw(); }
      else if (a === 'rev') { L.reverse = true; saveL(); draw(); }
      else if (a === 'norm') { L.reverse = false; saveL(); draw(); }
      else if (a === 'cond') { L.cond = v; saveL(); draw(); }
      else if (a === 'grader') { L.grader = v; saveL(); draw(); }
      else if (a === 'grade') { L.grade = v; saveL(); draw(); }
      else if (a === 'lang') { st.lang = v; draw(); }
      else if (a === 'custom') { st.custom = !st.custom; draw(); }
      else if (a === 'up' || a === 'down') { const i = +v, j = a === 'up' ? i - 1 : i + 1; if (L.blocks[j]) { [L.blocks[i], L.blocks[j]] = [L.blocks[j], L.blocks[i]]; saveL(); draw(); } }
      else if (a === 'wish') { const c = card(); if (c) { toggleWish(c.key); draw(); } }
      else if (a === 'add') { const c = card(); if (c) { if (pipWin) toast('Ajout depuis la fenêtre principale'); window.focus(); openItemSheet(c.key); } }
      else if (a === 'fiche') { const c = card(); if (c) { if (pipWin) { window.focus(); location.hash = '#/carte/' + encodeURIComponent(c.key); } else location.hash = '#/carte/' + encodeURIComponent(c.key); } }
      else if (a === 'pip') openPip();
      else if (a === 'share') share();
      else if (a === 'stop') stopShare();
      else if (a === 'grab') grab();
      else if (a === 'zone') { frame().then(f => { if (!f) { toast('Écran non disponible : reconnecte-le'); return; } st.picking = { img: f, zone: L.zone }; draw(); }); }
      else if (a === 'zoneok' && st.picking && st.picking.kind === 'bid') { const z = st.picking.zone; st.picking = null; if (z && z.w > 0.005 && z.h > 0.005) { L.bidZone = z; saveL(); startFollow(); } else draw(); }
      else if (a === 'zoneok') { const z = st.picking && st.picking.zone; if (z && z.w > 0.02 && z.h > 0.02) { L.zone = z; saveL(); } st.picking = null; draw(); toast('Zone enregistrée'); }
      else if (a === 'follow') { if (!L.bidZone || v === 'zone') { frame().then(f => { if (!f) { toast('Écran non disponible : reconnecte-le'); return; } stopFollow(); st.picking = { img: f, zone: L.bidZone, kind: 'bid' }; draw(); root.querySelector('.lv-zone') && root.querySelector('.lv-zone').scrollIntoView({ block: 'nearest' }); }); } else startFollow(); }
      else if (a === 'iasave') { const i = el.querySelector('#lviakey'); const k = i && i.value.trim(); if (k) { iaKey(k); toast('Clé gardée sur cet appareil seulement'); } draw(); }
      else if (a === 'iaclear') { iaKey(null); toast('Clé effacée de cet appareil'); draw(); }
      else if (a === 'ia') aiScan();
      else if (a === 'unfollow') { stopFollow(); draw(); }
      else if (a === 'zoneall') { L.zone = null; saveL(); st.picking = null; draw(); }
      else if (a === 'zonecancel') { st.picking = null; draw(); }
    });
    el.addEventListener('input', ev => {
      const t = ev.target;
      if (t.id === 'lvq' && /^(ia on|ia off)$/i.test(t.value.trim())) { /* même effet que #/live?ia=1 / ?ia=0, utile dans l'appli où on ne tape pas d'adresse */
        const on = /on$/i.test(t.value.trim()); if (on) ls(IA_FLAG, '1'); else { ls(IA_FLAG, null); ls(IA_KEY, null); }
        st.q = ''; toast(on ? 'Scan IA affiché sur cet appareil' : 'Scan IA caché et clé effacée'); draw(); return;
      }
      if (t.id === 'lvq') { st.q = t.value; st.key = null; st.sid = null; st.sres = null; st.results = []; st.scan = null; st.alts = []; clearTimeout(tq); tq = setTimeout(draw, 120); }
      else if (t.id === 'lvlp' || t.id === 'lvpct') {
        if (t.id === 'lvlp') st.livePrice = t.value; else { const n = parseInt(t.value, 10); if (n >= 5 && n <= 200) { L.maxPct = n; saveL(); } }
        const [ref, range] = st.ref || [], box = el.querySelector('#lv-verdict'), mv = el.querySelector('#lv-maxv');
        if (box) box.innerHTML = verdictHtml(ref, range); if (mv && ref) mv.textContent = eur(ref * maxPct() / 100);
      }
    });
    el.addEventListener('change', ev => {
      const t = ev.target;
      if ((t.id === 'lvcam' || t.id === 'lvshot') && t.files[0]) { const f = t.files[0]; t.value = ''; fileToImage(f).then(img => readImage(img, null)).catch(() => toast('Image illisible')); }
      else if (t.dataset.lvsel && st.lot) { const it = st.lot.items[+t.dataset.i]; if (it) { const k = t.dataset.lvsel; if (k === 'ver') { it.key = t.value; const c = BYKEY.get(t.value); if (it.lang && !(c && c.langs && c.langs.includes(it.lang))) it.lang = null; } else if (k === 'cond') { it.cond = t.value; it.iaCond = false; } else if (k === 'lang') it.lang = t.value || null; draw(); } }
      else if (t.dataset.lvBlock) { const b = L.blocks.find(x => x[0] === t.dataset.lvBlock); if (b) { b[1] = t.checked; saveL(); } }
      else if (t.dataset.lvCompact) { L.compact = t.checked; saveL(); draw(); }
    });
    el.addEventListener('submit', ev => {
      if (!ev.target.dataset.lvForm) return; ev.preventDefault();
      if (ev.target.dataset.lvForm === 'ia') { const k = ev.target.querySelector('input').value.trim(); if (k) { iaKey(k); toast('Clé gardée sur cet appareil seulement'); draw(); } return; }
      if (sealedMode()) { const r = sealedFind(st.q.trim()); if (r[0]) { st.sid = r[0].id; draw(); ev.target.querySelector('input').blur(); } return; }
      const r = find(st.q.trim()); if (r[0]) { pick(r[0].key); ev.target.querySelector('input').blur(); }
    });
    // Images : essaie la langue suivante si l'image manque (comme dans le reste de l'appli, aussi dans la fenêtre flottante)
    el.addEventListener('error', ev => {
      const img = ev.target; if (!(img instanceof (img.ownerDocument.defaultView || window).HTMLImageElement) || !img.dataset.key || !pipWin) return;
      const order = img.dataset.order.split(','), next = order[order.indexOf(img.dataset.lang) + 1], c = BYKEY.get(img.dataset.key);
      if (next && c) { img.dataset.lang = next; img.src = imgUrl(c, next, img.dataset.q); } else img.remove();
    }, true);
  }
  let tq;
  // Raccourcis clavier : Espace = lire l'écran, / = chercher, Échap = autre carte
  function onKey(ev) {
    if (!root || !isLive()) return;
    const t = ev.target, typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');
    if (ev.key === '/' && !typing) { ev.preventDefault(); const q = root.querySelector('#lvq'); if (q) q.focus(); }
    else if (ev.key === ' ' && !typing && scr) { ev.preventDefault(); grab(); }
    else if (ev.key === 'Escape' && st.key) { st.key = null; draw(); }
  }
  window.addEventListener('keydown', onKey);

  /* ---------- Pour la bulle Android (bulle.js) : recherche et cote, sans dupliquer le calcul ---------- */
  window.CallItLiveAPI = {
    find, liveMatch, alertOf, basePrice,
    // Cote avec un état, une langue et la version reverse donnés (carte non gradée)
    estimer(c, o) {
      const sv = [L.cond, L.graded, L.reverse, st.lang];
      L.cond = o.cond || 'NM'; L.graded = false; L.reverse = !!o.reverse; st.lang = o.lang || null;
      try { return estimate(c); } finally { [L.cond, L.graded, L.reverse, st.lang] = sv; }
    },
  };

  /* ---------- Capture partagée vers CallIt! (téléphone) ----------
     Sur téléphone, le live tourne dans l'appli eBay : l'appli ne peut pas lire cet écran. L'utilisateur fait une capture
     d'écran et la « partage » vers CallIt! ; si le Mode Live est ouvert, la capture est lue ici au lieu du centrage. */
  const baseShare = window.CallItCentrage;
  window.CallItCentrage = blob => {
    if (!blob) return;
    // Live ouvert, ou ouvert il y a moins de 15 min (Android a pu relancer l'appli entre-temps)
    let recent = false; try { recent = Date.now() - (+localStorage.getItem('callit.liveAt') || 0) < 15 * 60 * 1000; } catch (e) {}
    if (!isLive() && !recent) return baseShare && baseShare(blob);
    const f = blob instanceof File ? blob : new File([blob], 'capture.jpg', { type: blob.type || 'image/jpeg' });
    if (!isLive()) location.hash = '#/live';
    let n = 0;
    (function go() { if (!root) { if (++n < 50) setTimeout(go, 100); return; } fileToImage(f).then(img => readImage(img, null)).catch(() => toast('Image illisible')); })();
  };

  /* ---------- Branchement dans l'appli ---------- */
  const isLive = () => (location.hash.replace(/^#\/?/, '').split(/[/?]/)[0] === 'live');
  // Lu par app.js : pas de rechargement automatique (nouvelle version du site) pendant un live
  window.callitBusy = () => !!(pipWin || scr || isLive());
  const LIVE_ICON = '<span class="lv-dot"></span>';
  const baseRender = render;
  render = function (keepFocus) {
    if (DB && isLive()) {
      try { localStorage.setItem('callit.liveAt', String(Date.now())); } catch (e) {}
      document.body.dataset.face = G() ? 'galerie' : 'marche';
      document.title = tr('Live · CallIt!');
      if (pipWin) { draw(); return; }
      if (root && app.contains(root)) { draw(); return; }
      mount(app); setTimeout(() => { const q = root && root.querySelector('#lvq'); if (q && !st.key && matchMedia('(pointer:fine)').matches) q.focus(); }, 0);
      return;
    }
    if (root && !pipWin) root = null;
    baseRender(keepFocus);
    // Accès au mode Live : un bouton « Live » dans l'en-tête de l'accueil et de la recherche
    const r = location.hash.replace(/^#\/?/, '').split(/[/?]/)[0];
    if (DB && S.face && (r === '' || r === 'recherche')) {
      const home = app.querySelector('.home-head .searchrow');
      if (home && !app.querySelector('.lv-homelink')) home.insertAdjacentHTML('afterend', `<a class="lv-homelink" href="#/live">${LIVE_ICON}<b>Mode Live</b><span>la cote en une seconde pendant un live</span></a>`);
      const bar = r === 'recherche' && app.querySelector('.top .row'); if (bar && !bar.querySelector('.lv-entry')) bar.insertAdjacentHTML('afterbegin', `<a class="chip lv-entry" href="#/live" title="Mode Live : la cote en une seconde pendant un live">${LIVE_ICON}Live</a>`);
    }
  };
})();
