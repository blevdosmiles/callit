/* CallIt! · Cartes de sport (foot, F1, basket, tennis…).
   Il n'existe pas de base de cartes de sport libre ni de cote Cardmarket : l'utilisateur ajoute ses cartes lui-même
   (à la main, ou en lisant le texte d'une photo), et note sa propre valeur en s'aidant des ventes réussies sur eBay.
   Centrage et « À grader ? » marchent comme pour les autres jeux. Les liens eBay sont des liens partenaires, toujours signalés.
   Les cartes vont dans la même collection que les autres jeux (clé « sport:<id> ») : elles sont sauvegardées et
   synchronisées avec le compte comme les autres. Les photos restent sur l'appareil (base locale « callit-sport »).
   Fichier séparé de app.js : il réutilise ses fonctions (load, save, esc, money, F, tr, tabs, CTR…) et s'ajoute au routeur. */
(function () {
  'use strict';
  if (typeof render !== 'function') return;
  const ON = GAME === 'sport';

  const SPORTS = [['foot', 'Foot'], ['f1', 'F1'], ['basket', 'Basket'], ['tennis', 'Tennis'], ['rugby', 'Rugby'], ['nfl', 'Football US'],
    ['hockey', 'Hockey'], ['baseball', 'Baseball'], ['moto', 'Moto'], ['cyclisme', 'Cyclisme'], ['autre', 'Autre sport']];
  const SPORT = Object.fromEntries(SPORTS);
  // Mot ajouté à la recherche eBay pour ne pas tomber sur un maillot ou une figurine
  const EBAY_SPORT = { f1: 'f1', nfl: 'football', hockey: 'hockey', baseball: 'baseball', basket: 'basketball', tennis: 'tennis', rugby: 'rugby', moto: 'motogp', cyclisme: 'cycling' };
  const BRANDS = ['Topps', 'Panini', 'Upper Deck', 'Futera', 'Leaf', 'Bowman', 'Donruss', 'Fleer', 'Score', 'Merlin', 'Fanatics', 'Parkside', 'Sage', 'Pro Set', 'Skybox'];
  const SETS = ['Chrome', 'Prizm', 'Select', 'Mosaic', 'Optic', 'Finest', 'Stadium Club', 'Sapphire', 'Match Attax', 'Adrenalyn XL', 'Obsidian', 'Immaculate', 'National Treasures', 'Dynasty', 'Turbo Attax', 'Museum Collection', 'Merlin Chrome', 'Topps Now', 'Donruss Elite', 'Contenders'];
  const GRADERS_SP = ['PSA', 'BGS', 'SGC', 'CGC', 'PCA', 'Autre'];
  const PFX = 'sport:';
  // Libellés selon le sport : saison pour les sports d'équipe à cheval sur deux années, pilote pour les sports mécaniques…
  const SEASON = new Set(['foot', 'basket', 'hockey', 'rugby']);
  const WHO = { f1: 'Pilote', moto: 'Pilote', cyclisme: 'Coureur', tennis: 'Joueur ou joueuse', autre: 'Joueur ou pilote' };
  const WHO_PH = { foot: 'Ex. Kylian Mbappé', f1: 'Ex. Lewis Hamilton', basket: 'Ex. Victor Wembanyama', tennis: 'Ex. Carlos Alcaraz', rugby: 'Ex. Antoine Dupont', nfl: 'Ex. Patrick Mahomes', hockey: 'Ex. Connor McDavid', baseball: 'Ex. Shohei Ohtani', moto: 'Ex. Marc Márquez', cyclisme: 'Ex. Tadej Pogačar' };
  const TEAM = { f1: 'Écurie', moto: 'Écurie', cyclisme: 'Équipe', tennis: 'Pays' };
  const TEAM_PH = { foot: 'Ex. PSG', f1: 'Ex. Ferrari', basket: 'Ex. Spurs', tennis: 'Ex. Espagne', rugby: 'Ex. Toulouse', nfl: 'Ex. Chiefs', hockey: 'Ex. Oilers', baseball: 'Ex. Dodgers', moto: 'Ex. Ducati', cyclisme: 'Ex. UAE' };
  const LAB = sp => ({
    name: F(WHO[sp] || 'Joueur'), year: F(SEASON.has(sp) ? 'Saison' : sp === 'autre' || !sp ? 'Année ou saison' : 'Année'), team: F(TEAM[sp] || 'Équipe'),
    namePh: F(WHO_PH[sp] || 'Ex. Kylian Mbappé'), yearPh: F(SEASON.has(sp) ? 'Ex. 2023-24' : 'Ex. 2024'), teamPh: F(TEAM_PH[sp] || 'Ex. PSG')
  });
  const formSport = () => { const f = document.querySelector('form[data-sp-form="card"]'), r = f && f.querySelector('input[name="sp"]:checked'); return r ? r.value : ''; };
  const s = (v, n = 80) => (v == null ? '' : String(v)).slice(0, n);
  const yes = v => v === true;
  const isSport = it => !!it && typeof it.key === 'string' && it.key.startsWith(PFX);
  const mine = () => collection.filter(isSport);
  const byId = id => collection.find(it => isSport(it) && it.id === id);
  const idOfKey = k => (typeof k === 'string' && k.startsWith(PFX) ? k.slice(PFX.length) : null);
  const route = () => parseHash();
  const st = { sport: '', q: '', side: 'r', sugg: null };

  /* ---------- Textes d'une carte ---------- */
  const title = it => s(it.name) || F('Carte sans nom');
  // « Topps Chrome · 2023-24 · #12 · Refractor · 12/99 »
  const line = it => [[s(it.brand), s(it.set)].filter(Boolean).join(' '), s(it.year), it.num ? '#' + s(it.num).replace(/^#/, '') : '', s(it.par), s(it.ser)].filter(Boolean).join(' · ');
  const tags = it => [yes(it.rc) ? 'RC' : '', yes(it.auto) ? 'Auto' : '', yes(it.patch) ? 'Patch' : ''].filter(Boolean);
  const stateTxt = it => it.grader ? (s(it.grader) + ' ' + s(it.grade)).trim() : it.cond ? (CONDS.find(x => x[0] === it.cond) || ['', it.cond])[1] : '';
  // Recherche eBay : joueur, année, marque, série, numéro, parallèle, tirage, RC, auto
  function ebayQuery(it, extra) {
    const ser = s(it.ser).match(/\/\s*(\d+)/);
    return [s(it.name), s(it.year), s(it.brand), s(it.set), it.num ? '#' + s(it.num).replace(/^#/, '') : '', s(it.par), ser ? '/' + ser[1] : '', yes(it.rc) ? 'RC' : '', yes(it.auto) ? 'auto' : '', yes(it.patch) ? 'patch' : '', !s(it.brand) && !s(it.set) ? EBAY_SPORT[it.sp] || '' : '', extra || '']
      .filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  }
  const ebayDom = () => (COUNTRY[S.country] || COUNTRY.FR).ebay;
  function ebayLink(q, sold) {
    const u = `${ebayHome()}/sch/i.html?_nkw=${encodeURIComponent(q)}${sold ? '&LH_Sold=1&LH_Complete=1' : ''}`;
    return window.callitPartnerLink ? window.callitPartnerLink(u) : { url: u, partner: false };
  }
  const linkNote = l => l.partner ? F('Lien partenaire : CallIt! touche une petite commission d’eBay si tu achètes, sans frais pour toi.') : F('Lien eBay direct, sans commission.');
  const extA = (l, label, sub) => `<a class="extlink" href="${esc(l.url)}" target="_blank" rel="${l.partner ? 'sponsored ' : ''}noopener"><b>${label}</b><span class="small">${esc(sub || (l.partner ? F('lien partenaire') : F('lien externe, sans commission')))}</span></a>`;

  /* ---------- Valeur ---------- */
  // Ma valeur (notée par moi), sinon le prix payé ; en euros
  function value(it) {
    if (it.val > 0) return { v: curToEur(it.val, it.cur), how: 'moi' };
    if (it.paid > 0) return { v: curToEur(it.paid, it.cur), how: 'paye' };
    return null;
  }
  function totals(list) {
    let v = 0, paid = 0, gain = 0, base = 0, n = 0, noVal = 0;
    for (const it of list) {
      const q = it.qty || 1, e = value(it), pd = it.paid > 0 ? curToEur(it.paid, it.cur) : null; n += q;
      if (e) v += toUser(e.v) * q; if (!e || e.how !== 'moi') noVal += q;
      if (pd != null) { paid += toUser(pd) * q; if (e && e.how === 'moi') { gain += (toUser(e.v) - toUser(pd)) * q; base += toUser(pd) * q; } }
    }
    return { v, paid, gain, base, n, noVal };
  }

  /* ---------- Photos (sur l'appareil) ---------- */
  // Base locale « callit-sport » : f = grandes photos, t = petites ; clé « <id>:r » (recto) ou « <id>:v » (verso)
  const PH = { ok: typeof indexedDB !== 'undefined', db: null, urls: new Map(), draft: { r: null, v: null }, busy: '' };
  const CARD_R = 88.9 / 63.5;
  const phOpen = () => PH.db || (PH.db = new Promise((ok, ko) => {
    const r = indexedDB.open('callit-sport', 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('t'); r.result.createObjectStore('f'); };
    r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); r.onblocked = () => ko(new Error('blocked'));
  }));
  const phTx = (mode, fn) => phOpen().then(db => new Promise((ok, ko) => { const t = db.transaction(['t', 'f'], mode); t.oncomplete = () => ok(); t.onerror = t.onabort = () => ko(t.error || new Error('idb')); fn(t.objectStore('t'), t.objectStore('f')); }));
  const phGet = (store, k) => phOpen().then(db => new Promise((ok, ko) => { const r = db.transaction(store).objectStore(store).get(k); r.onsuccess = () => ok(r.result || null); r.onerror = () => ko(r.error); }));
  async function phPut(id, side, made) {
    const k = id + ':' + side;
    await phTx('readwrite', (t, f) => { t.put(made.thumb, k); f.put(made.full, k); });
    const old = PH.urls.get(k); if (old) URL.revokeObjectURL(old); PH.urls.set(k, URL.createObjectURL(made.thumb));
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) {}
  }
  async function phDel(keys) {
    await phTx('readwrite', (t, f) => { for (const k of keys) { t.delete(k); f.delete(k); } });
    keys.forEach(k => { const u = PH.urls.get(k); if (u) URL.revokeObjectURL(u); PH.urls.delete(k); });
  }
  function phStart() {
    if (!PH.ok) return;
    phOpen().then(db => new Promise((ok, ko) => { const t = db.transaction('t'), o = t.objectStore('t'), k = o.getAllKeys(), v = o.getAll(); t.oncomplete = () => ok([k.result, v.result]); t.onerror = t.onabort = () => ko(t.error); }))
      .then(([keys, vals]) => {
        const have = new Set(mine().map(it => it.id)), gone = [];
        // Une carte retirée emporte ses photos (sauf si la collection n'a pas pu être lue : on ne touche à rien)
        keys.forEach((k, i) => { const id = String(k).split(':')[0]; if (collection.length && !have.has(id)) gone.push(k); else PH.urls.set(k, URL.createObjectURL(vals[i])); });
        if (gone.length) phDel(gone).catch(() => {});
        if (PH.urls.size && isHere()) render(true);
      }).catch(() => { PH.ok = false; });
  }
  const loadImg = src => new Promise((ok, ko) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => ko(new Error('image')); im.src = src; });
  const toBlob = (cv, q) => new Promise((ok, ko) => cv.toBlob(b => (b ? ok(b) : ko(new Error('image'))), 'image/jpeg', q));
  function piece(src, w, h, sx, sy, sw, sh) {
    const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(w)); cv.height = Math.max(1, Math.round(h));
    const g = cv.getContext('2d'); g.imageSmoothingQuality = 'high';
    if (sw) g.drawImage(src, sx, sy, sw, sh, 0, 0, cv.width, cv.height); else g.drawImage(src, 0, 0, cv.width, cv.height);
    return cv;
  }
  // La photo choisie : remise à plat et recadrée sur la carte quand ses bords se voient (redresse.js), sinon gardée entière
  async function phMake(file) {
    const u = URL.createObjectURL(file); let work;
    try { const im = await loadImg(u), w = im.naturalWidth, h = im.naturalHeight; if (!w || !h) throw new Error('image'); const k = Math.min(1, 1600 / Math.max(w, h)); work = piece(im, w * k, h * k); }
    finally { URL.revokeObjectURL(u); }
    const R = window.CallItRedresse; let card = null;
    if (R) {
      try {
        const im = await loadImg(work.toDataURL('image/jpeg', 0.92)), det = R.detectCorners(im);
        if (det && det.ok) {
          const P = det.q.map(([x, y]) => [x * work.width, y * work.height]), len = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
          const k = ((len(P[0], P[3]) + len(P[1], P[2])) / (len(P[0], P[1]) + len(P[3], P[2]))) / CARD_R;
          if (k > 0.88 && k < 1.12) card = await loadImg(R.warp(im, det.q, 0));
        }
      } catch (e) { card = null; }
    }
    let full, thumb;
    if (card) { const w = Math.min(1000, card.naturalWidth), h = w * card.naturalHeight / card.naturalWidth; full = piece(card, w, h); thumb = piece(card, 360, 360 * h / w); }
    else {
      const k = Math.min(1, 1400 / Math.max(work.width, work.height)); full = piece(work, work.width * k, work.height * k);
      const cw = Math.min(work.width, work.height / CARD_R), ch = cw * CARD_R;
      thumb = piece(work, 360, 360 * CARD_R, (work.width - cw) / 2, (work.height - ch) / 2, cw, ch);
    }
    return { full: await toBlob(full, 0.88), thumb: await toBlob(thumb, 0.8), cropped: !!card, work };
  }
  const blobUrl = b => new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = ko; r.readAsDataURL(b); });

  /* ---------- Morceaux d'écran ---------- */
  const SP_ICON = '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5l3.6 2.6-1.4 4.2H9.8l-1.4-4.2z"/><path d="M12 3.5v4M15.6 10.1l3.9-1.3M14.2 14.3l2.4 3.3M9.8 14.3l-2.4 3.3M8.4 10.1L4.5 8.8"/></svg>';
  function pic(it, side = 'r', big) {
    const u = PH.urls.get(it.id + ':' + side);
    if (u) return `<div class="cimg own sp-img"><img src="${esc(u)}" alt="${esc(title(it))}"${big ? ' data-sp="zoom"' : ''}></div>`;
    return `<div class="cimg noimg sp-img"><div class="ph sp-ph">${SP_ICON}<span>${esc(title(it))}</span></div></div>`;
  }
  const tileOf = it => `<a class="tile" href="#/sport/carte/${encodeURIComponent(it.id)}">${pic(it)}<span class="nm">${esc(title(it))}</span><span class="mt">${esc([s(it.year), s(it.brand), tags(it).join(' ')].filter(Boolean).join(' · ') || tr(SPORT[it.sp] || ''))}</span></a>`;
  function rowOf(it) {
    const e = value(it), q = it.qty || 1;
    return `<a class="line" href="#/sport/carte/${encodeURIComponent(it.id)}"><span class="thumb">${pic(it)}</span><span class="mid"><b>${esc(title(it))}</b><span>${esc([line(it), stateTxt(it), q > 1 ? q + ' ×' : ''].filter(Boolean).join(' · ') || tr(SPORT[it.sp] || ''))}</span></span><span class="px"><b class="num">${e ? ownMoney(toUser(e.v) * q) : '—'}</b><span>${e ? (e.how === 'moi' ? F('ma valeur') : F('au prix payé')) : F('à estimer')}</span></span></a>`;
  }
  const sportChips = list => {
    const have = SPORTS.filter(([k]) => list.some(it => it.sp === k));
    if (have.length < 2) return '';
    return `<div class="pad chips scroll" style="margin-top:12px" role="group" aria-label="${esc(F('Sport'))}"><button class="chip${!st.sport ? ' on' : ''}" data-sp="filt" data-v="" aria-pressed="${!st.sport}">${F('Tous')}</button>${have.map(([k, n]) => `<button class="chip${st.sport === k ? ' on' : ''}" data-sp="filt" data-v="${k}" aria-pressed="${st.sport === k}">${esc(tr(n))}</button>`).join('')}</div>`;
  };
  const sortCards = list => list.slice().sort((a, b) => (G() ? String(b.added || b.id).localeCompare(String(a.added || a.id)) : ((value(b) || { v: 0 }).v * (b.qty || 1)) - ((value(a) || { v: 0 }).v * (a.qty || 1))));
  function cardsBlock(list) {
    if (!list.length) return '';
    return G() ? `<div class="grid" style="margin-top:12px">${list.map(tileOf).join('')}</div>` : `<div class="list" style="margin-top:12px">${list.map(rowOf).join('')}</div>`;
  }
  function ebaySearchBox(v) {
    return `<form class="panel stack" style="gap:8px" data-sp-form="ebay" autocomplete="off"><b style="font-size:15px">${F('Chercher sur eBay')}</b>
      <div class="row" style="gap:8px"><input class="fld" name="q" value="${esc(v || '')}" placeholder="${esc(F('Ex. Mbappé Topps Chrome 2023 RC'))}" maxlength="120" style="flex:1"><button class="btn small primary" type="submit">${F('Chercher')}</button></div>
      <label class="row small" style="gap:8px;align-items:center"><input type="checkbox" name="sold" checked> ${F('Seulement les ventes réussies')}</label>
      <div class="small">${esc(linkNote(ebayLink('x')))}</div></form>`;
  }

  /* ---------- Accueil et collection ---------- */
  function viewHome(asCol) {
    const all = mine(), list = sortCards(all.filter(it => !st.sport || it.sp === st.sport)), t = totals(all);
    const head = asCol
      ? `<div class="top"><h1 class="title">${F(G() ? 'Ma collection' : 'Portefeuille')}</h1>${faceSwitch()}</div>`
      : `<div class="home-head"><div class="top home-top"><a class="title" href="#/" style="text-decoration:none;color:inherit" aria-label="CallIt!, accueil">${logo(32)}</a><div class="row" style="gap:8px">${faceSwitch()}<a class="iconbtn" href="#/reglages" aria-label="${esc(F('Mon profil et réglages'))}">${icon('user')}</a></div></div><div class="pad" style="padding-top:6px">${gameChips()}</div></div>`;
    const intro = asCol ? '' : `<div class="pad stack" style="gap:6px;margin-top:14px"><h1 class="h1">${F('Cartes de sport')}</h1><div class="sub">${F('Foot, F1, basket, tennis et les autres : ajoute tes cartes, mesure leur centrage et suis leur valeur.')}</div></div>`;
    const actions = `<div class="pad row sp-actions" style="gap:8px;flex-wrap:wrap;margin-top:14px"><a class="btn primary" href="#/sport/ajout">${F('Ajouter une carte')}</a><a class="btn" href="#/centrage">${icon('ruler', 18)} ${F('Mesurer le centrage')}</a></div>`;
    const money0 = `<div class="pad" style="margin-top:14px"><div class="panel stack" style="gap:4px"><div class="small">${esc(all.length ? F('{0} · ma valeur', pl(t.n, tr('carte'), tr('cartes'))) : F('Ma valeur'))}</div><div class="num" style="font-weight:700;font-size:32px;letter-spacing:-.02em">${money(t.v)}</div>
      <div class="row" style="gap:18px"><div><div class="small">${F('Payé')}</div><b class="num">${money(t.paid)}</b></div>${t.base ? `<div><div class="small">${F('Plus-value')}</div><b class="num ${t.gain >= 0 ? 'gain' : 'loss'}">${t.gain >= 0 ? '+' : ''}${money(t.gain)}</b></div>` : ''}</div>
      ${t.noVal ? `<div class="small">${esc(t.noVal > 1 ? F('{0} cartes sans valeur notée : elles comptent au prix payé.', t.noVal) : F('1 carte sans valeur notée : elle compte au prix payé.'))}</div>` : ''}</div></div>`;
    const empty = `<div class="pad" style="margin-top:14px"><div class="panel stack" style="gap:8px"><b>${F('Aucune carte de sport pour l’instant')}</b><div class="sub">${F('Photographie ta carte ou remplis sa fiche : joueur, année, marque, numéro. CallIt! s’occupe du reste.')}</div><a class="btn primary" href="#/sport/ajout" style="align-self:flex-start">${F('Ajouter ma première carte')}</a></div></div>`;
    const how = asCol ? '' : `<div class="sect"><h2 class="h2">${F('Le prix d’une carte de sport')}</h2></div><div class="pad"><div class="note">${F('Pas de cote officielle pour le sport : le meilleur repère, ce sont les ventes réussies sur eBay. Ouvre-les depuis la fiche de ta carte, puis note ta valeur.')}</div></div>`;
    return `${head}${intro}${actions}${asCol || typeof revExtra !== 'function' ? '' : revExtra('home')}${!G() || asCol ? (all.length ? money0 : '') : ''}${all.length ? `<div class="sect between"><h2 class="h2">${F(asCol ? 'Mes cartes' : 'Mes cartes de sport')}</h2><span class="sub">${esc(pl(t.n, tr('carte'), tr('cartes')))}</span></div>${sportChips(all)}${cardsBlock(list)}` : empty}
      <div class="pad" style="margin-top:18px">${ebaySearchBox()}</div>${how}<div style="height:20px"></div>${tabs(asCol ? 'collection' : '')}`;
  }
  function viewSearch() {
    const w = norm(st.q).split(/\s+/).filter(Boolean);
    const hay = it => norm([it.name, it.team, it.year, it.brand, it.set, it.num, it.par, it.ser, SPORT[it.sp], tags(it).join(' '), it.note].map(x => s(x)).join(' '));
    const hits = w.length ? mine().filter(it => { const h = hay(it); return w.every(x => h.includes(x)); }) : [];
    return `<div class="top"><h1 class="title">${F('Recherche')}</h1>${faceSwitch()}</div>
      <div class="pad stack" style="gap:10px"><input class="fld" id="spq" value="${esc(st.q)}" placeholder="${esc(F('Joueur, équipe, marque, année…'))}" autocomplete="off" aria-label="${esc(F('Chercher dans mes cartes'))}"></div>
      <div id="spres">${searchResults(hits, w.length)}</div>
      <div class="pad" style="margin-top:16px">${ebaySearchBox(st.q)}</div><div style="height:20px"></div>${tabs('recherche')}`;
  }
  function searchResults(hits, typed) {
    if (!typed) return `<div class="pad small" style="margin-top:8px">${F('Cherche dans tes cartes de sport, ou directement sur eBay juste en dessous.')}</div>`;
    if (!hits.length) return `<div class="pad small" style="margin-top:8px">${F('Aucune de tes cartes ne correspond.')}</div>`;
    return `<div class="list" style="margin-top:10px">${hits.map(rowOf).join('')}</div>`;
  }

  /* ---------- Fiche d'une carte ---------- */
  function viewCard(id) {
    const it = byId(id);
    if (!it) return `<div class="top">${backBtn()}</div><div class="pad"><div class="note">${F('Carte introuvable.')}</div></div>${tabs('')}`;
    const e = value(it), q = it.qty || 1, hasV = PH.urls.has(it.id + ':v'), side = st.side === 'v' && hasV ? 'v' : 'r';
    const sold = ebayLink(ebayQuery(it), true), live = ebayLink(ebayQuery(it), false);
    const facts = [[F('Sport'), tr(SPORT[it.sp] || '')], [LAB(it.sp).team, s(it.team)], [LAB(it.sp).year, s(it.year)], [F('Marque'), s(it.brand)], [F('Série'), s(it.set)], [F('Numéro'), s(it.num)], [F('Parallèle'), s(it.par)], [F('Numérotée'), s(it.ser)], [F('État'), stateTxt(it)], [F('Quantité'), q > 1 ? String(q) : ''], [F('Payée'), it.paid != null ? money(it.paid, it.cur) : ''], [F('Date'), s(it.date)], [F('Note'), s(it.note, 300)]].filter(x => x[1]);
    const measured = CTR.key === PFX + it.id && (agFace('recto') || agFace('verso'));
    return `<div class="top">${backBtn()}${faceSwitch()}</div>
    <div class="fiche"><div class="fiche-a pad"><div class="fiche-img">${pic(it, side, true)}</div>
      ${hasV ? `<div class="face" role="group" aria-label="${esc(F('Face de la carte'))}" style="margin:10px auto 0;width:max-content">${[['r', 'Recto'], ['v', 'Verso']].map(([k, l]) => `<button data-sp="side" data-v="${k}" aria-pressed="${side === k}">${F(l)}</button>`).join('')}</div>` : ''}</div>
    <div class="fiche-b"><div class="pad"><div class="fiche-title"><h1 class="h1">${esc(title(it))}</h1>
      <div class="sub" style="margin-top:4px">${esc(line(it) || tr(SPORT[it.sp] || ''))}</div>
      ${tags(it).length ? `<div class="chips wrap" style="margin-top:8px">${tags(it).map(t => `<span class="chip sp-tag">${esc(t)}</span>`).join('')}</div>` : ''}</div></div>
    <div class="pad" style="margin-top:14px"><div class="panel stack" style="gap:4px"><div class="small">${F(e && e.how === 'moi' ? 'Ma valeur' : e ? 'Pas encore de valeur notée : prix payé' : 'Pas encore de valeur notée')}</div>
      <div class="num" style="font-weight:700;font-size:30px">${e ? ownMoney(toUser(e.v) * q) : '—'}</div>
      ${e && e.how === 'moi' && it.paid > 0 ? (() => { const g = (toUser(e.v) - toUser(curToEur(it.paid, it.cur))) * q; return `<div class="small">${F('Plus-value')} <b class="num ${g >= 0 ? 'gain' : 'loss'}">${g >= 0 ? '+' : ''}${ownMoney(g)}</b></div>`; })() : ''}
      <div class="small">${F('Regarde les ventes réussies de la même carte, dans le même état, puis note ta valeur dans « Modifier ».')}</div></div></div>
    <div class="pad btns" style="margin-top:12px"><a class="btn primary" href="#/sport/modifier/${encodeURIComponent(it.id)}">${F('Modifier')}</a><button class="btn" data-sp="ctr" data-v="${esc(it.id)}">${icon('ruler', 18)} ${F('Mesurer le centrage')}</button></div>
    ${measured ? `<div class="pad" style="margin-top:8px"><a class="btn full" href="#/a-grader">${F('À grader ?')}</a></div>` : ''}
    <div class="sect"><h2 class="h2">${F('Prix sur eBay')}</h2></div>
    <div class="pad stack">${extA(sold, F('Ventes réussies'))}${extA(live, F('Annonces en cours'))}<div class="small">${esc(linkNote(sold))}</div></div>
    ${facts.length ? `<div class="sect"><h2 class="h2">${F('Détails')}</h2></div><div class="pad"><div class="panel" style="padding-top:4px;padding-bottom:4px">${facts.map(([k, v]) => `<div class="setrow" style="min-height:40px"><span style="font-weight:600;font-size:14px">${esc(k)}</span><span style="font-size:14px;text-align:right">${esc(v)}</span></div>`).join('')}</div></div>` : ''}
    </div></div><div style="height:20px"></div>${tabs('')}`;
  }

  /* ---------- Ajouter ou modifier une carte ---------- */
  const fld = (name, label, v, ph, extra = '') => `<label class="stack sp-f" style="gap:4px"><span class="small" style="font-weight:600" data-sp-lab="${name}">${label}</span><input class="fld" name="${name}" value="${esc(v || '')}"${ph ? ` placeholder="${esc(ph)}"` : ''} maxlength="80" ${extra}></label>`;
  const box = (name, label, on) => `<label class="chip sp-box"><input type="checkbox" name="${name}" ${on ? 'checked' : ''}> ${label}</label>`;
  function photoSlot(side) {
    const d = PH.draft[side], u = d ? d.url : PH.draft.id && PH.urls.get(PH.draft.id + ':' + side), lab = side === 'r' ? F('Recto') : F('Verso');
    const pick = (label, cam) => `<label class="btn small">${cam ? icon('camera', 16) + ' ' : ''}${label}<input type="file" accept="image/*"${cam ? ' capture="environment"' : ''} class="sr" data-sp-photo="${side}"></label>`;
    if (PH.busy === side) return `<div class="sp-slot"><span class="sp-thumb"><span class="cimg noimg"><span class="ph">…</span></span></span><div class="stack" style="gap:6px"><b>${lab}</b><div class="small" role="status">${F('Préparation de la photo…')}</div></div></div>`;
    return `<div class="sp-slot"><span class="sp-thumb">${u ? `<span class="cimg own"><img src="${esc(u)}" alt=""></span>` : `<span class="cimg noimg"><span class="ph sp-ph">${SP_ICON}</span></span>`}</span>
      <div class="stack" style="gap:6px;align-items:flex-start"><b>${lab}</b><div class="row" style="gap:6px;flex-wrap:wrap">${pick(u ? F('Changer') : F('Photographier'), !u)}${u ? '' : pick(F('Galerie'), false)}</div></div></div>`;
  }
  function viewForm(id) {
    const it = id ? byId(id) : null;
    if (id && !it) return `<div class="top">${backBtn()}</div><div class="pad"><div class="note">${F('Carte introuvable.')}</div></div>${tabs('')}`;
    const x = it || { sp: st.sport || load('sportLast', 'foot'), cond: 'NM', qty: 1, cur: userCur(), date: new Date().toISOString().slice(0, 10) };
    if (PH.draft.for !== (id || 'new')) PH.draft = { for: id || 'new', id: id || null, r: null, v: null };
    const g = !!x.grader, LB = LAB(x.sp);
    return `<div class="top">${backBtn()}</div>
    <form class="pad stack sp-form" style="gap:14px" data-sp-form="card" autocomplete="off">
      <h1 class="h1">${F(it ? 'Modifier la carte' : 'Ajouter une carte de sport')}</h1>
      <div class="panel stack" style="gap:10px"><b style="font-size:15px">${F('Photos')}</b>
        <div class="sp-slots" id="spslots">${photoSlot('r')}${photoSlot('v')}</div>
        <div class="small">${F('Les photos restent sur ton appareil. Le dos de la carte sert aussi à remplir la fiche.')}</div>
        <button type="button" class="btn small" data-sp="ocr" style="align-self:flex-start">${F('Remplir avec la photo')}</button>
        <div id="spsugg" aria-live="polite">${suggHtml()}</div></div>
      <div class="panel stack" style="gap:10px"><b style="font-size:15px">${F('Sport')}</b>
        <div class="chips wrap">${SPORTS.map(([k, n]) => `<label class="chip sp-box sp-radio"><input type="radio" name="sp" value="${k}" ${x.sp === k ? 'checked' : ''}> ${esc(tr(n))}</label>`).join('')}</div></div>
      <div class="panel stack" style="gap:10px"><b style="font-size:15px">${F('La carte')}</b>
        ${fld('name', LB.name, x.name, LB.namePh, 'required')}
        <div class="sp-two">${fld('year', LB.year, x.year, LB.yearPh, 'inputmode="text"')}${fld('team', LB.team, x.team, LB.teamPh)}</div>
        <div class="sp-two">${fld('brand', F('Marque'), x.brand, 'Topps, Panini…', 'list="spbrands"')}${fld('set', F('Série'), x.set, 'Chrome, Prizm…', 'list="spsets"')}</div>
        <div class="sp-two">${fld('num', F('Numéro'), x.num, F('Ex. 12'))}${fld('par', F('Parallèle'), x.par, F('Ex. Refractor, Silver'))}</div>
        ${fld('ser', F('Numérotée'), x.ser, F('Ex. 12/99'))}
        <div class="chips wrap">${box('rc', F('Rookie (RC)'), yes(x.rc))}${box('auto', F('Autographe'), yes(x.auto))}${box('patch', F('Patch ou maillot'), yes(x.patch))}</div>
        <datalist id="spbrands">${BRANDS.map(b => `<option value="${esc(b)}">`).join('')}</datalist><datalist id="spsets">${SETS.map(b => `<option value="${esc(b)}">`).join('')}</datalist></div>
      <div class="panel stack" style="gap:10px"><b style="font-size:15px">${F('Mon exemplaire')}</b>
        <label class="row small" style="gap:8px;align-items:center"><input type="checkbox" name="graded" ${g ? 'checked' : ''} data-sp="graded"> ${F('Carte gradée')}</label>
        <div class="sp-two" data-sp-show="graded" ${g ? '' : 'hidden'}><label class="stack sp-f" style="gap:4px"><span class="small" style="font-weight:600">${F('Société')}</span><select class="fld" name="grader">${GRADERS_SP.map(k => `<option value="${k}" ${x.grader === k ? 'selected' : ''}>${esc(F(k))}</option>`).join('')}</select></label>${fld('grade', F('Note'), x.grade, F('Ex. 10'), 'inputmode="decimal"')}</div>
        <label class="stack sp-f" data-sp-show="raw" ${g ? 'hidden' : ''} style="gap:4px"><span class="small" style="font-weight:600">${F('État')}</span><select class="fld" name="cond">${CONDS.map(([k, n]) => `<option value="${k}" ${x.cond === k ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
        <div class="sp-two">${fld('paid', F('Prix payé ({0})', esc(x.cur || userCur())), x.paid != null ? String(x.paid).replace('.', ',') : '', F('Ex. 25'), 'inputmode="decimal"')}${fld('val', F('Ma valeur ({0})', esc(x.cur || userCur())), x.val != null ? String(x.val).replace('.', ',') : '', F('Ex. 40'), 'inputmode="decimal"')}</div>
        <div id="spsold">${soldHint(x)}</div>
        <div class="sp-two">${fld('qty', F('Quantité'), String(x.qty || 1), '', 'inputmode="numeric"')}<label class="stack sp-f" style="gap:4px"><span class="small" style="font-weight:600">${F('Date')}</span><input class="fld" type="date" name="date" value="${esc(s(x.date))}"></label></div>
        ${fld('note', F('Note'), x.note, F('Ex. achetée en brocante'))}</div>
      <div class="small sp-err" id="sperr" role="alert"></div>
      <div class="btns"><button class="btn primary" type="submit">${F(it ? 'Enregistrer' : 'Ajouter à ma collection')}</button>${it ? `<button class="btn" type="button" data-sp="del" data-v="${esc(it.id)}">${F('Retirer')}</button>` : ''}</div>
    </form><div style="height:20px"></div>${tabs('')}`;
  }
  // Lien vers les ventes réussies, refait pendant qu'on remplit la fiche
  function soldHint(x) {
    const q = ebayQuery(x, x.grader ? (x.grader === 'Autre' ? '' : s(x.grader)) + ' ' + s(x.grade) : '');
    if (!s(x.name)) return `<div class="small">${F('Pour connaître la valeur, regarde les ventes réussies sur eBay.')}</div>`;
    const l = ebayLink(q, true);
    return `<div class="small"><a href="${esc(l.url)}" target="_blank" rel="${l.partner ? 'sponsored ' : ''}noopener">${F('Voir les ventes réussies sur eBay')}</a> · ${esc(l.partner ? F('lien partenaire') : F('lien externe, sans commission'))}</div>`;
  }
  const numIn = v => { const t = String(v || '').replace(/\s/g, '').replace(',', '.'); if (!t) return null; const n = parseFloat(t); return isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : NaN; };
  function readForm(f) {
    const fd = new FormData(f), g = fd.get('graded') === 'on';
    return { sp: SPORT[fd.get('sp')] ? fd.get('sp') : 'autre', name: s(fd.get('name')).trim(), team: s(fd.get('team')).trim(), year: s(fd.get('year'), 20).trim(), brand: s(fd.get('brand')).trim(), set: s(fd.get('set')).trim(),
      num: s(fd.get('num'), 20).trim().replace(/^#/, ''), par: s(fd.get('par')).trim(), ser: s(fd.get('ser'), 20).trim(), rc: fd.get('rc') === 'on', auto: fd.get('auto') === 'on', patch: fd.get('patch') === 'on',
      grader: g ? s(fd.get('grader'), 12) : '', grade: g ? s(fd.get('grade'), 6).trim() : '', cond: g ? '' : s(fd.get('cond'), 4), paid: numIn(fd.get('paid')), val: numIn(fd.get('val')),
      qty: Math.max(1, parseInt(fd.get('qty'), 10) || 1), date: s(fd.get('date'), 10), note: s(fd.get('note'), 300).trim() };
  }
  async function submit(f) {
    const r = readForm(f), err = document.getElementById('sperr'), id0 = PH.draft.id;
    const bad = !r.name ? F('Indique le nom du joueur ou du pilote.') : Number.isNaN(r.paid) ? F('Le prix payé doit être un nombre, par exemple 25 ou 12,50.') : Number.isNaN(r.val) ? F('Ta valeur doit être un nombre, par exemple 40.') : '';
    if (bad) { if (err) err.textContent = bad; return; }
    const old = id0 && byId(id0);
    const id = old ? old.id : Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const rec = Object.assign(old || { id, key: PFX + id, added: new Date().toISOString() }, r, { cur: (old && old.cur) || userCur() });
    if (!r.grader) { delete rec.grader; delete rec.grade; }
    if (!old) collection.push(rec);
    save('sportLast', r.sp); saveCol();
    const dr = PH.draft;
    for (const side of ['r', 'v']) if (dr[side] && dr[side].made) { try { await phPut(id, side, dr[side].made); } catch (e) { toast(F('La photo n’a pas pu être gardée sur cet appareil')); } }
    for (const side of ['r', 'v']) if (dr[side] && dr[side].url) URL.revokeObjectURL(dr[side].url);
    PH.draft = { for: null, id: null, r: null, v: null }; st.sugg = null;
    toast(F(old ? 'Modifié' : 'Ajoutée à ta collection'));
    location.hash = '#/sport/carte/' + encodeURIComponent(id);
    if (old) render();
  }
  async function takePhoto(side, file) {
    if (!file) return;
    PH.busy = side; paintSlots();
    try {
      const made = await phMake(file), old = PH.draft[side];
      if (old && old.url) URL.revokeObjectURL(old.url);
      PH.draft[side] = { made, url: URL.createObjectURL(made.thumb), work: made.work };
    } catch (e) { toast(F('Cette photo n’a pas pu être lue')); }
    PH.busy = ''; paintSlots();
  }
  const paintSlots = () => { const b = document.getElementById('spslots'); if (b) b.innerHTML = photoSlot('r') + photoSlot('v'); };

  /* ---------- Remplir avec la photo (texte lu sur la carte, sur l'appareil) ---------- */
  function suggHtml() {
    const g = st.sugg;
    if (!g) return '';
    if (g.wait) return `<div class="small">${F('Lecture de la carte… (quelques secondes la première fois)')}</div>`;
    if (g.err) return `<div class="small">${esc(g.err)}</div>`;
    const L = LAB(formSport());
    const parts = [[L.name, 'name', g.names], [L.year, 'year', g.years], [F('Marque'), 'brand', g.brands], [F('Numéro'), 'num', g.nums], [F('Numérotée'), 'ser', g.sers]].filter(x => x[2].length);
    if (!parts.length) return `<div class="small">${F('Rien de lisible sur cette photo. Essaie avec le dos de la carte, bien à plat et net.')}</div>`;
    // Une ligne par champ : son nom à gauche, ce qui a été lu à droite (le premier est proposé d'office)
    const pill = (f, v, i) => `<button type="button" class="sp-sug${i ? '' : ' first'}" data-sp="fill" data-f="${f}" data-v="${esc(v)}">${esc(v)}</button>`;
    return `<div class="sp-read"><div class="sp-read-h"><b>${F('Lu sur ta carte')}</b><button type="button" class="btn small primary" data-sp="fillall">${F('Tout remplir')}</button></div>
      ${parts.map(([lab, f, xs]) => `<div class="sp-read-r"><span class="sp-read-l">${lab}</span><span class="sp-read-v">${xs.slice(0, 3).map((v, i) => pill(f, v, i)).join('')}</span></div>`).join('')}
      <div class="small">${F('Touche une valeur pour la mettre dans la fiche.')}</div></div>`;
  }
  function parseText(text) {
    const t = String(text || '').replace(/[|]/g, '/'), uniq = a => [...new Set(a.filter(Boolean))];
    const years = uniq([...t.matchAll(/\b((?:19[5-9]\d|20[0-4]\d)(?:\s*[-/]\s*\d{2,4})?)\b/g)].map(m => m[1].replace(/\s+/g, '').replace('/', '-')));
    const brands = BRANDS.filter(b => new RegExp('\\b' + b.replace(' ', '\\s*') + '\\b', 'i').test(t));
    const sers = uniq([...t.matchAll(/\b(\d{1,4})\s*\/\s*(\d{1,4})\b/g)].filter(m => +m[1] <= +m[2] && +m[2] <= 999 && !/^(19|20)\d\d$/.test(m[1])).map(m => m[1] + '/' + m[2]));
    const nums = uniq([...t.matchAll(/(?:#|\bno\.?\s*|\bn[°º]\s*)([A-Z]{0,4}-?\d{1,4}[A-Z]?)\b/gi)].map(m => m[1].toUpperCase()));
    // Noms : deux ou trois mots qui commencent par une majuscule (« Kylian Mbappé », « LEWIS HAMILTON »), sans les mots des marques
    const stop = new Set(['topps', 'panini', 'chrome', 'prizm', 'select', 'card', 'cards', 'trading', 'official', 'licensed', 'product', 'rookie', 'formula', 'league', 'champions', 'uefa', 'fifa', 'nba', 'nfl', 'mlb', 'nhl', 'club', 'football', 'the', 'and', 'of', 'inc', 'ltd', 'printed', 'made', 'usa', 'all', 'rights', 'reserved', 'www', 'com', 'upper', 'deck', 'season', 'team', 'born', 'height', 'weight']);
    const cands = [];
    for (const ln of t.split(/\n+/)) {
      for (const m of ln.matchAll(/\b([A-ZÀ-Ý][A-Za-zÀ-ÿ'’.-]{1,20}(?:\s+[A-ZÀ-Ý][A-Za-zÀ-ÿ'’.-]{1,20}){1,2})\b/g)) {
        const ws = m[1].split(/\s+/); if (ws.some(w => stop.has(w.toLowerCase().replace(/[.'’]/g, '')))) continue;
        const nm = ws.map(w => (w === w.toUpperCase() && w.length > 2 ? w[0] + w.slice(1).toLowerCase() : w)).join(' ');
        if (nm.replace(/[^A-Za-zÀ-ÿ]/g, '').length >= 6) cands.push(nm);
      }
    }
    return { years: years.slice(0, 4), brands, sers, nums: nums.slice(0, 4), names: uniq(cands).slice(0, 6) };
  }
  async function readPhoto() {
    const d = PH.draft, src = (d.v && d.v.work) || (d.r && d.r.work);
    const box = document.getElementById('spsugg');
    const paint = () => { const b = document.getElementById('spsugg'); if (b) b.innerHTML = suggHtml(); };
    if (!src && box) {
      // Carte déjà enregistrée : on relit sa grande photo
      const k = d.id && (PH.urls.has(d.id + ':v') ? d.id + ':v' : PH.urls.has(d.id + ':r') ? d.id + ':r' : null);
      if (!k) { st.sugg = { err: F('Ajoute d’abord une photo de la carte (le dos se lit le mieux).') }; paint(); return; }
    }
    st.sugg = { wait: true }; paint();
    try {
      let cv = src;
      if (!cv) { const k = PH.urls.has(d.id + ':v') ? d.id + ':v' : d.id + ':r', b = await phGet('f', k); const im = await loadImg(await blobUrl(b)); cv = piece(im, im.naturalWidth, im.naturalHeight); }
      const g = document.createElement('canvas'); g.width = cv.width; g.height = cv.height; const x = g.getContext('2d'); x.filter = 'grayscale(1) contrast(1.4)'; x.drawImage(cv, 0, 0);
      const w = await getOcr(); const { data } = await w.recognize(g);
      st.sugg = parseText(data.text || '');
    } catch (e) { st.sugg = { err: F('La lecture n’a pas marché. Réessaie avec une photo plus nette, ou remplis la fiche à la main.') }; }
    paint();
  }

  /* ---------- Centrage et « À grader ? » ---------- */
  async function startCentrage(id) {
    const it = byId(id); if (!it) return;
    const faces = {};
    for (const side of ['r', 'v']) {
      if (!PH.urls.has(id + ':' + side)) continue;
      try { const b = await phGet('f', id + ':' + side), url = await blobUrl(b), im = await loadImg(url); let L; try { L = ctrDetect(im); } catch (e) { L = [3, 8, 92, 97, 3, 8, 92, 97]; } faces[side] = { img: url, L, sel: 0, asp: im.naturalWidth / im.naturalHeight }; } catch (e) {}
    }
    CTR.key = PFX + id; CTR.ref = null; CTR.pick = false; CTR.faces = {}; CTR.side = 'recto'; CTR.zoom = 1; CTR.sx = CTR.sy = 0; CTR.ia = null; CTR.type = 'cls';
    // Le recto d'abord ; sans recto, le verso
    if (faces.r) { CTR.img = faces.r.img; CTR.L = faces.r.L; CTR.asp = faces.r.asp; CTR.sel = 0; if (faces.v) CTR.faces.verso = { img: faces.v.img, L: faces.v.L, sel: 0 }; }
    else if (faces.v) { CTR.side = 'verso'; CTR.img = faces.v.img; CTR.L = faces.v.L; CTR.asp = faces.v.asp; CTR.sel = 0; }
    else { CTR.img = null; CTR.L = null; }
    location.hash = '#/centrage';
  }
  // Pour app.js : la carte de sport choisie pour le centrage et « À grader ? »
  function agInfo(key) {
    const id = idOfKey(key), it = id && byId(id); if (!it) return null;
    const e = value(it);
    return { name: title(it), sub: line(it) || tr(SPORT[it.sp] || ''), thumb: pic(it), p: e ? e.v : null, how: e ? e.how : null, q: ebayQuery(Object.assign({}, it, { rc: false, auto: yes(it.auto), patch: yes(it.patch) })), link: ebayLink, href: '#/sport/carte/' + encodeURIComponent(it.id) };
  }
  // « À grader ? » sans carte choisie : mes cartes de sport
  function agPick() {
    const list = mine();
    if (!list.length) return `<div class="panel stack" style="gap:8px"><b style="font-size:15px">${F('Quelle carte ?')}</b><div class="small">${F('Ajoute ta carte dans CallIt! pour voir sa valeur à côté du centrage.')}</div><a class="btn small" href="#/sport/ajout" style="align-self:flex-start">${F('Ajouter une carte')}</a></div>`;
    return `<div class="panel stack" style="gap:8px"><b style="font-size:15px">${F('Quelle carte ?')}</b><div class="list">${list.slice(0, 30).map(it => `<button class="line" data-act="agcard" data-key="${esc(PFX + it.id)}" style="width:100%;text-align:left;font:inherit;color:inherit"><span class="thumb">${pic(it)}</span><span class="mid"><b>${esc(title(it))}</b><span>${esc(line(it))}</span></span></button>`).join('')}</div></div>`;
  }
  window.CallItSport = { agInfo, agPick, on: ON };

  if (!ON) return;

  /* ---------- Événements ---------- */
  const isHere = () => { if (!DB || !S.face) return false; const r = route().parts[0] || ''; return r === '' || r === 'collection' || r === 'recherche' || r === 'sport'; };
  document.addEventListener('click', ev => {
    const b = ev.target.closest && ev.target.closest('[data-sp]'); if (!b) return;
    const a = b.dataset.sp;
    if (a === 'filt') { st.sport = b.dataset.v; render(); }
    else if (a === 'side') { st.side = b.dataset.v; render(); }
    else if (a === 'ctr') startCentrage(b.dataset.v);
    else if (a === 'ocr') readPhoto();
    else if (a === 'fill' || a === 'fillall') {
      const f = document.querySelector('form[data-sp-form="card"]'); if (!f) return;
      const put = x => { const el = f.elements[x.dataset.f]; if (!el) return; el.value = x.dataset.v; el.dispatchEvent(new Event('input', { bubbles: true })); x.closest('.sp-read-v').querySelectorAll('.sp-sug').forEach(y => y.classList.toggle('on', y === x)); };
      if (a === 'fill') put(b); else { document.querySelectorAll('#spsugg .sp-sug.first').forEach(put); toast(F('Fiche remplie : vérifie avant d’enregistrer')); }
    }
    else if (a === 'graded') { const f = b.form, g = b.checked; f.querySelectorAll('[data-sp-show="graded"]').forEach(el => { el.hidden = !g; }); f.querySelectorAll('[data-sp-show="raw"]').forEach(el => { el.hidden = g; }); }
    else if (a === 'del') {
      const it = byId(b.dataset.v); if (!it) return;
      ask(F('Retirer cette carte de ta collection ?'), F('Retirer'), () => {
        collection = collection.filter(x => x !== it); markDeleted(it.id, 'card'); saveCol(); phDel([it.id + ':r', it.id + ':v']).catch(() => {});
        toast(F('Retirée de ta collection')); location.hash = '#/collection';
      });
    }
    else if (a === 'zoom') { const u = b.getAttribute('src'); if (u) window.open(u, '_blank'); }
  });
  document.addEventListener('change', ev => {
    const el = ev.target; if (!el || !el.dataset) return;
    if (el.dataset.spPhoto) { takePhoto(el.dataset.spPhoto, el.files && el.files[0]); el.value = ''; }
  });
  document.addEventListener('input', ev => {
    const el = ev.target; if (!el) return;
    if (el.id === 'spq') { st.q = el.value; const w = norm(st.q).split(/\s+/).filter(Boolean); const hay = it => norm([it.name, it.team, it.year, it.brand, it.set, it.num, it.par, it.ser, SPORT[it.sp], tags(it).join(' '), it.note].map(x => s(x)).join(' ')); const box = document.getElementById('spres'); if (box) box.innerHTML = searchResults(w.length ? mine().filter(it => { const h = hay(it); return w.every(x => h.includes(x)); }) : [], w.length); const fq = document.querySelector('form[data-sp-form="ebay"] input[name="q"]'); if (fq) fq.value = st.q; return; }
    const f = el.form; if (f && f.dataset.spForm === 'card') { const b = document.getElementById('spsold'); if (b) b.innerHTML = soldHint(readForm(f)); }
  });
  document.addEventListener('change', ev => { const f = ev.target && ev.target.form; if (f && f.dataset.spForm === 'card' && ev.target.name === 'sp') {
    const L = LAB(ev.target.value);
    for (const k of ['name', 'year', 'team']) { const sp = f.querySelector(`[data-sp-lab="${k}"]`); if (sp) sp.textContent = L[k]; if (f.elements[k]) f.elements[k].placeholder = L[k + 'Ph']; }
    const sg = document.getElementById('spsugg'); if (sg && st.sugg && !st.sugg.wait) sg.innerHTML = suggHtml();
  } if (f && f.dataset.spForm === 'card') { const b = document.getElementById('spsold'); if (b) b.innerHTML = soldHint(readForm(f)); } });
  document.addEventListener('submit', ev => {
    const f = ev.target; if (!f.dataset || !f.dataset.spForm) return;
    ev.preventDefault();
    if (f.dataset.spForm === 'card') submit(f);
    else if (f.dataset.spForm === 'ebay') { const q = String(f.elements.q.value || '').trim(); if (!q) return; window.open(ebayLink(q, f.elements.sold.checked).url, '_blank', 'noopener'); }
  });

  /* ---------- Branchement dans l'appli ---------- */
  const baseRender = render;
  render = function (keepFocus) {
    if (isHere()) {
      document.body.dataset.face = G() ? 'galerie' : 'marche';
      const { parts } = route(), r = parts[0] || '';
      const typing = keepFocus && document.activeElement && document.activeElement.id === 'spq';
      if (typing) return; // la recherche se met à jour sur place
      let html, t = F('Cartes de sport');
      if (r === 'collection') { html = viewHome(true); t = F(G() ? 'Ma collection' : 'Portefeuille'); }
      else if (r === 'recherche') { html = viewSearch(); t = F('Recherche'); }
      else if (r === 'sport' && parts[1] === 'ajout') { html = viewForm(null); t = F('Ajouter une carte'); }
      else if (r === 'sport' && parts[1] === 'modifier') { html = viewForm(decodeURIComponent(parts[2] || '')); t = F('Modifier la carte'); }
      else if (r === 'sport' && parts[1] === 'carte') { const it = byId(decodeURIComponent(parts[2] || '')); html = viewCard(decodeURIComponent(parts[2] || '')); if (it) t = title(it); }
      else html = viewHome(false);
      app.innerHTML = html; document.title = t + ' · CallIt!';
      return;
    }
    baseRender(keepFocus);
  };
  // Une nouvelle fiche ou une autre carte : la face recto et les suggestions repartent de zéro
  window.addEventListener('hashchange', () => { const p = route().parts; if (p[0] !== 'sport' || p[1] === 'carte') st.sugg = null; if (p[1] !== 'carte') st.side = 'r'; });
  phStart();
  if (isHere()) render();
})();
