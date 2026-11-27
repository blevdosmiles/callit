/* CallIt! · Écran « Ma collection » (et « Portefeuille » dans le visage Marché), refait après la revue du 27/11/2026.
   En haut : la valeur de la collection, son mouvement sur 30 jours et la plus-value. Puis : les jeux où j'ai des cartes,
   mes cartes / mes envies, chercher, trier, filtrer, ajouter (une carte, un album scanné, un set), ranger (sets, illustrateurs,
   Pokémon, langues). Rangé par sets : l'avancement du set et du master set, et ce que coûtent les cartes qui manquent.
   Les cartes s'affichent par paquets de 48 : la suite arrive quand on descend (2 000 cartes ne bloquent plus l'écran).
   Fichier séparé de app.js : chargé après collection.js, il fournit l'écran par window.CallItColScreen.
   Sans ce fichier, app.js garde son ancien écran. */
(function () {
  'use strict';
  if (typeof render !== 'function') return;

  const PAGE = 48;
  const SVG = (d, s = 18, w = 2) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const I = {
    plus: SVG('<path d="M12 5v14M5 12h14"/>', 16, 2.4),
    cam: SVG('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>', 16),
    grid: SVG('<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>', 18),
    list: SVG('<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>', 18),
    more: SVG('<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>', 20, 2.2),
    filt: SVG('<path d="M4 6h16M7 12h10M10 18h4"/>', 16, 2.2),
    sort: SVG('<path d="M7 5v14M4 16l3 3 3-3M17 19V5M14 8l3-3 3 3"/>', 16, 2),
    search: SVG('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4-4"/>', 18),
    x: SVG('<path d="M6 6l12 12M18 6L6 18"/>', 16, 2.2),
    chev: SVG('<path d="M9 6l6 6-6 6"/>', 16, 2.2)
  };

  /* ---------- Réglages de l'écran (gardés sur l'appareil) ---------- */
  const SORTS = [['valeur', 'Valeur'], ['recent', 'Ajout récent'], ['nom', 'Nom'], ['numero', 'Numéro']];
  const kept = load('colScreen', {}) || {};
  const V = {
    q: '',
    sort: SORTS.some(s => s[0] === kept.sort) ? kept.sort : 'valeur',
    group: ['set', 'ill', 'poke', 'lang', 'none'].includes(kept.group) ? kept.group : 'set', // rangé par sets au départ (revue du 27/11)
    view: kept.view === 'grille' || kept.view === 'liste' ? kept.view : '',               // '' : grille en Galerie, liste en Marché
    f: { lang: '', cond: '', grade: '', rev: false, sell: false },
    shown: 0, rows: null, sig: ''
  };
  const keep = () => save('colScreen', { sort: V.sort, group: V.group, view: V.view });
  const viewMode = () => V.view || (G() ? 'grille' : 'liste');

  /* ---------- Jeux : une même collection peut mélanger Pokémon, Magic, Yu-Gi-Oh!, One Piece et sport ---------- */
  const gameOf = k => { const m = /^(mtg|ygo|op|sport):/.exec(k || ''); return m ? m[1] : 'pkm'; };
  function gameCounts() {
    const m = new Map(Object.keys(GAMES).map(g => [g, 0]));
    for (const it of collection) { const g = gameOf(it.key); m.set(g, (m.get(g) || 0) + (it.qty || 1)); }
    return m;
  }
  function gamesRow() {
    const m = gameCounts(), cur = GAME;
    const used = [...m].filter(([g, n]) => n > 0 || g === cur);
    if (used.length < 2) return '';
    return `<div class="pad ce-games" role="group" aria-label="${esc(F('Jeu de cartes'))}">${used.map(([g, n]) => `<button class="ce-game${g === cur ? ' on' : ''}" data-ce="game" data-v="${g}" aria-pressed="${g === cur}"><b>${esc(GAMES[g].name)}</b><span class="num">${n.toLocaleString(LOCALE)}</span></button>`).join('')}</div>`;
  }
  // Changer de jeu en restant sur Ma collection. Avec le changement sans rechargement (switchGame), on revient ici après.
  async function goGame(g) {
    if (!GAMES[g] || g === GAME) return;
    if (typeof switchGame === 'function') { await switchGame(g); if (S.game === g && !/^#\/collection/.test(location.hash)) location.hash = '#/collection'; return; }
    S.game = g; saveS(); location.hash = '#/collection'; location.reload();
  }

  /* ---------- Les cartes, prêtes à trier et filtrer ---------- */
  const stateOf = it => [it.grader ? (it.grader + ' ' + (it.grade || '')).trim() : it.cond, it.rev ? 'reverse' : ''].filter(Boolean).join(' · ');
  const langShort = l => (LANG[l] ? LANG[l].short : l);
  const langName = l => (LANG[l] ? LANG[l].name : l);
  function allRows() {
    const sig = collection.length + '|' + (collection.length ? collection[0].id + collection[collection.length - 1].id : '') + '|' + CARDS.length + '|' + userCur() + '|' + priceDate();
    if (V.rows && V.sig === sig && V.rowsOf === collection) return V.rows;
    const rows = [];
    collection.forEach((it, i) => {
      const c = BYKEY.get(it.key); if (!c) return;
      const e = ownValue(it, c), n = it.qty || 1;
      const names = Object.values(c.n || {}).join(' ');
      rows.push({ it, c, i, n, e, tot: e ? e.u * n : 0, hay: norm([names, cardName(c), setName(c.set), c.set.id, c.num, numLabel(c), ill(c), speciesFr(c)].join(' | ')) });
    });
    V.rows = rows; V.sig = sig; V.rowsOf = collection; return rows;
  }

  // Recherche tolérante : chaque mot doit se trouver dans la carte, à une faute près pour les mots de 4 lettres et plus
  // Même son, même écriture : « dracofeu » et « dracaufeu », « pikatchu » et « pikachu »
  const sound = w => w.replace(/eau|au/g, 'o').replace(/ph/g, 'f').replace(/qu|k|ck/g, 'c').replace(/tch/g, 'ch').replace(/y/g, 'i').replace(/(.)\1+/g, '$1');
  function dist(a, b, max) { // distance d'édition, arrêtée au-delà de max
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i]; let low = i;
      for (let j = 1; j <= b.length; j++) { cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); if (cur[j] < low) low = cur[j]; }
      if (low > max) return max + 1; prev = cur;
    }
    return prev[b.length];
  }
  // Une faute permise à partir de 4 lettres, deux à partir de 8 ; on compare aussi le début d'un mot plus long (frappe en cours)
  function near(w, x) {
    const a = sound(w), b = sound(x), max = a.length >= 7 ? 2 : a.length >= 4 ? 1 : 0;
    return a === b || dist(a, b, max) <= max || (b.length > a.length && dist(a, b.slice(0, a.length), max) <= max);
  }
  function matcher(q) {
    const ws = norm(q).split(/[\s,]+/).filter(Boolean); if (!ws.length) return null;
    return r => ws.every(w => {
      if (r.hay.includes(w)) return true;
      if (w.length < 4) return false;
      if (!r.words) r.words = r.hay.split(/[^a-z0-9]+/).filter(x => x.length >= 3);
      return r.words.some(x => near(w, x));
    });
  }
  const filtCount = () => (V.f.lang ? 1 : 0) + (V.f.cond ? 1 : 0) + (V.f.grade ? 1 : 0) + (V.f.rev ? 1 : 0) + (V.f.sell ? 1 : 0);
  function filtered() {
    const m = matcher(V.q), f = V.f;
    return allRows().filter(r => (!m || m(r))
      && (!f.lang || r.it.lang === f.lang)
      && (!f.cond || (!r.it.grader && r.it.cond === f.cond))
      && (!f.grade || (f.grade === 'gradee' ? !!r.it.grader : !r.it.grader))
      && (!f.rev || r.it.rev)
      && (!f.sell || r.it.sell));
  }
  const byNum = (a, b) => (a.c.set.date || '').localeCompare(b.c.set.date || '') || a.c.s - b.c.s || String(a.c.num).localeCompare(String(b.c.num), undefined, { numeric: true });
  const SORTF = {
    valeur: (a, b) => b.tot - a.tot || byNum(a, b),
    recent: (a, b) => (b.it.date || '').localeCompare(a.it.date || '') || b.i - a.i,
    nom: (a, b) => cardName(a.c).localeCompare(cardName(b.c), LOCALE) || byNum(a, b),
    numero: byNum
  };

  /* ---------- Sets : avancement du set et du master set (avec les reverses) ---------- */
  let setIdx = null;
  function setCards(si) {
    if (!setIdx || setIdx.n !== CARDS.length) { setIdx = { n: CARDS.length, m: new Map() }; for (const c of CARDS) { if (c.x) continue; if (!setIdx.m.has(c.s)) setIdx.m.set(c.s, []); setIdx.m.get(c.s).push(c); } }
    return setIdx.m.get(si) || [];
  }
  function setProgress(si) {
    // Les cartes hors de la liste officielle (Mew R, G et B du 30ᵉ) ne comptent ni dans le total ni dans ce qui manque
    const hors = (window.CallItCollection && window.CallItCollection.horsSet) || (() => false);
    const all = setCards(si).filter(c => !hors(c)), have = new Set(), haveM = new Set();
    for (const it of collection) { const c = BYKEY.get(it.key); if (!c || c.s !== si || c.x || hors(c)) continue; have.add(c.num); haveM.add(c.num + (it.rev && quoteHolo(c) ? '|r' : '|n')); }
    const total = Math.max(all.length, (DB.sets[si] && DB.sets[si].count) || 0);
    const missing = all.filter(c => !have.has(c.num));
    const cost = missing.reduce((s, c) => s + (price(c) || 0), 0), unpriced = missing.filter(c => price(c) == null).length;
    let master = null;
    if (PKM) { const rev = all.filter(c => quoteHolo(c)); if (rev.length) master = { have: haveM.size, total: all.length + rev.length }; }
    return { have: have.size, total, missing: missing.length, cost, unpriced, master };
  }
  const pct = (a, b) => Math.max(a ? 3 : 0, Math.min(100, Math.round(a / Math.max(1, b) * 100)));

  /* ---------- Regroupements ---------- */
  function groupKey(r) {
    const { it, c } = r;
    if (V.group === 'ill') return ill(c) || F('Illustrateur inconnu');
    if (V.group === 'poke') return speciesFr(c) || cardName(c);
    if (V.group === 'lang') return langName(it.lang);
    return 's' + c.s;
  }
  function groups(rows) {
    if (V.group === 'none') return [{ k: '', rows, tot: rows.reduce((s, r) => s + r.tot, 0) }];
    const m = new Map();
    for (const r of rows) { const k = groupKey(r); if (!m.has(k)) m.set(k, { k, rows: [], tot: 0, n: 0 }); const g = m.get(k); g.rows.push(r); g.tot += r.tot; g.n += r.n; }
    const gs = [...m.values()];
    const name = g => (V.group === 'set' ? setName(DB.sets[+g.k.slice(1)]) : g.k);
    if (V.sort === 'nom') gs.sort((a, b) => name(a).localeCompare(name(b), LOCALE));
    else if (V.sort === 'numero' && V.group === 'set') gs.sort((a, b) => (DB.sets[+b.k.slice(1)].date || '').localeCompare(DB.sets[+a.k.slice(1)].date || ''));
    else if (V.sort === 'recent') gs.sort((a, b) => Math.max(...b.rows.map(r => r.i)) - Math.max(...a.rows.map(r => r.i)));
    else gs.sort((a, b) => b.tot - a.tot || b.n - a.n);
    return gs;
  }
  function groupHead(g) {
    const nb = g.rows.reduce((s, r) => s + r.n, 0);
    const right = `<span class="ce-gv"><b class="num">${ownMoney(g.tot)}</b><span>${esc(F(nb > 1 ? '{0} cartes' : '{0} carte', nb.toLocaleString(LOCALE)))}</span></span>`;
    if (V.group !== 'set') return `<div class="ce-g"><div class="ce-gh"><h2 class="h2">${esc(g.k)}</h2>${right}</div></div>`;
    const si = +g.k.slice(1), st = DB.sets[si], p = setProgress(si);
    const rest = p.have >= p.total ? `<b class="gain">${esc(F('Set complet !'))}</b>` : p.missing ? `<span>${esc(F('il manque {0}', eur(p.cost)))}${p.unpriced ? ' *' : ''}</span>` : '';
    return `<div class="ce-g"><div class="ce-gh"><h2 class="h2"><a href="#/recherche?set=${si}">${esc(setName(st))}</a></h2>${right}</div>
      <div class="ce-bar" role="img" aria-label="${esc(F('Set : {0} sur {1}', p.have, p.total))}"><i style="width:${pct(p.have, p.total)}%"></i></div>
      <div class="ce-bl"><span>${esc(F('Set : {0} sur {1}', p.have, p.total))}</span>${rest}</div>
      ${p.master ? `<div class="ce-bar m" role="img" aria-label="${esc(F('Master set : {0} sur {1}', p.master.have, p.master.total))}"><i style="width:${pct(p.master.have, p.master.total)}%"></i></div>
      <div class="ce-bl"><span>${esc(F('Master set : {0} sur {1}', p.master.have, p.master.total))}</span><span>${esc(F('reverses comprises'))}</span></div>` : ''}
      ${st && !st.x && p.have < p.total ? `<a class="ce-link" href="#/set/${si}">${esc(F('Cocher les cartes que j’ai'))}${I.chev}</a>` : ''}
      ${p.unpriced && p.missing ? `<div class="ce-foot">* ${esc(p.unpriced > 1 ? F('{0} cartes manquantes n’ont pas de cote.', p.unpriced) : F('Une carte manquante n’a pas de cote.'))}</div>` : ''}</div>`;
  }

  /* ---------- Une carte : tuile (grille) ou ligne (liste) ---------- */
  function cardHtml(r) {
    const { it, c, e, n } = r, href = `#/carte/${encodeURIComponent(c.key)}?lang=${encodeURIComponent(it.lang)}`;
    const val = e ? ownMoney(e.u * n) : '—';
    if (viewMode() === 'grille') {
      const meta = [numLabel(c), stateOf(it)].filter(Boolean).join(' · ');
      return `<a class="tile ce-t" href="${href}">${cimg(c, { lang: it.lang, it, badge: langShort(it.lang) })}${n > 1 ? `<span class="ce-qty num">×${n}</span>` : ''}<span class="nm">${esc(cardName(c))}</span><span class="mt">${esc(meta)}</span><span class="ce-v num">${val}</span></a>`;
    }
    const pd = ownPaid(it), g = e && pd != null && e.how !== 'paye' ? (e.u - toUser(pd)) * n : null;
    const under = e && e.how === 'paye' ? F('au prix payé') : g != null ? (g >= 0 ? '+' : '') + ownMoney(g) : !e ? (it.grader ? F('à estimer') : F('pas de cote')) : F('payé ?');
    return `<a class="line" href="${href}"><span class="thumb">${cimg(c, { lang: it.lang, it })}</span><span class="mid"><b>${esc(cardName(c))}</b><span>${esc([langShort(it.lang), stateOf(it), setName(c.set) + ' ' + numLabel(c), n > 1 ? n + ' ×' : ''].filter(Boolean).join(' · '))}</span></span><span class="px"><b class="num">${val}</b>${under ? `<span class="${g == null ? '' : g >= 0 ? 'gain' : 'loss'}" style="font-weight:600">${esc(under)}</span>` : ''}</span></a>`;
  }

  /* ---------- Affichage par paquets ---------- */
  // La liste à plat : un en-tête de groupe, puis ses cartes. On en dessine PAGE cartes à la fois.
  function plan() {
    const rows = filtered(), sf = SORTF[V.sort] || SORTF.valeur, out = [];
    for (const g of groups(rows)) { g.rows.sort(sf); out.push({ g }); for (const r of g.rows) out.push({ r }); }
    return { rows, out };
  }
  function chunk(out, from) {
    let i = from, n = 0, html = '', open = false;
    const close = () => { if (open) { html += '</div>'; open = false; } };
    const wrap = viewMode() === 'grille' ? '<div class="grid ce-grid">' : '<div class="list ce-list">';
    while (i < out.length && (n < PAGE || !out[i].r)) {
      const x = out[i];
      if (x.g) { if (n >= PAGE) break; close(); if (V.group !== 'none') html += groupHead(x.g); }
      else { if (!open) { html += wrap; open = true; } html += cardHtml(x.r); n++; }
      i++;
    }
    close();
    return { html, next: i };
  }
  let PLAN = null, io = null;
  function moreBox(next) {
    if (!PLAN || next >= PLAN.out.length) return '';
    const left = PLAN.out.slice(next).filter(x => x.r).length;
    return `<div class="ce-more" id="ce-more" data-next="${next}"><button class="btn small" data-ce="more">${esc(F(left > 1 ? 'Voir les {0} cartes suivantes' : 'Voir la carte suivante', left.toLocaleString(LOCALE)))}</button></div>`;
  }
  function listHtml() {
    PLAN = plan();
    if (!PLAN.rows.length) {
      const any = V.q || filtCount();
      return `<div class="pad" style="margin-top:16px"><div class="panel stack ce-empty"><b>${esc(any ? F('Aucune carte ne correspond') : F('Aucune carte de ce jeu'))}</b>${V.q ? `<div class="sub">${esc(F('Rien pour « {0} » dans ta collection.', V.q))}</div>` : ''}<div class="row" style="gap:8px;flex-wrap:wrap">${V.q ? `<a class="btn small" href="#/recherche?q=${encodeURIComponent(V.q)}">${esc(F('Chercher « {0} » dans toutes les cartes', V.q))}</a>` : ''}${any ? `<button class="btn small" data-ce="reset">${esc(F('Tout afficher'))}</button>` : ''}</div></div></div>`;
    }
    const c = chunk(PLAN.out, 0);
    return c.html + moreBox(c.next);
  }
  function showMore() {
    const box = document.getElementById('ce-more'); if (!box || !PLAN) return;
    const c = chunk(PLAN.out, +box.dataset.next);
    box.insertAdjacentHTML('beforebegin', c.html);
    const nb = moreBox(c.next); box.outerHTML = nb; watchMore();
  }
  function watchMore() {
    if (io) io.disconnect();
    const box = document.getElementById('ce-more'); if (!box || !('IntersectionObserver' in window)) return;
    io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) showMore(); }, { rootMargin: '900px 0px' });
    io.observe(box);
  }
  function countTxt(rows) {
    const n = rows.reduce((s, r) => s + r.n, 0), all = allRows().reduce((s, r) => s + r.n, 0);
    return n === all ? F(n > 1 ? '{0} cartes' : '{0} carte', n.toLocaleString(LOCALE)) : F('{0} sur {1} cartes', n.toLocaleString(LOCALE), all.toLocaleString(LOCALE));
  }
  // Refaire seulement la liste (recherche, tri, filtres) : le champ de recherche garde le clavier
  function redrawList() {
    const box = document.getElementById('ce-body'); if (!box) return render();
    box.innerHTML = listHtml();
    const cnt = document.getElementById('ce-count'); if (cnt && PLAN) cnt.textContent = countTxt(PLAN.rows);
    const fb = document.querySelector('[data-ce="filters"]'); if (fb) fb.outerHTML = filterBtn();
    const sb = document.getElementById('ce-sort'); if (sb) sb.value = V.sort;
    const x = document.querySelector('[data-ce="clear"]'); if (x) x.hidden = !V.q;
    watchMore();
  }

  /* ---------- En-tête : valeur, mouvement, plus-value ---------- */
  function chgTxt(c) {
    const abs = Math.abs(c.abs) < 0.005 ? 0 : c.abs, p = abs === 0 ? 0 : c.pct * 100, r = (Math.abs(p) < 10 ? Math.round(p * 10) / 10 : Math.round(p)) || 0;
    return abs === 0 || (r === 0 && Math.abs(abs) < 1) ? `${ownMoney(abs)} (${F('stable')})` : `${abs >= 0 ? '+' : ''}${ownMoney(abs)} (${r >= 0 ? '+' : ''}${r.toLocaleString(LOCALE)} %)`;
  }
  function moveBox() {
    const d = window.CallItCollection && window.CallItCollection.change ? window.CallItCollection.change() : null;
    if (!d) return `<div><span>${esc(F('Sur 30 jours'))}</span><b class="ce-wait">${esc(F('suivi en cours'))}</b></div>`;
    return `<div><span>${esc(d.label)}</span><b class="num ${d.c.abs > -0.005 ? 'gain' : 'loss'}">${chgTxt(d.c)}</b></div>`;
  }
  function valueBlock() {
    const p = portfolio();
    const gain = p.base ? `<b class="num ${p.gain >= 0 ? 'gain' : 'loss'}">${esc(gainTxt(p))}</b>` : `<b class="ce-wait">${esc(F('indique tes prix payés'))}</b>`;
    return `<div class="ce-val"><div class="ce-lab">${esc(F('Valeur de ta collection'))}</div><div class="ce-big num">${money(p.value)}</div>
      <div class="ce-two"><div id="ce-chg">${moveBox()}</div><div><span>${esc(F('Plus-value'))}</span>${gain}${p.paid ? `<span>${esc(F('pour {0} payés', money(p.paid)))}</span>` : ''}</div></div></div>`;
  }
  const seg = () => `<div class="pad"><div class="ce-seg" role="tablist" aria-label="${esc(F('Collection ou envies'))}"><a role="tab" aria-selected="true" class="on" href="#/collection">${esc(F('Mes cartes'))} <span class="num">(${allRows().reduce((s, r) => s + r.n, 0).toLocaleString(LOCALE)})</span></a><a role="tab" aria-selected="false" href="#/envies">${esc(F('Mes envies'))}${wish.items.length ? ` <span class="num">(${wish.items.length})</span>` : ''}</a></div></div>`;
  const filterBtn = () => { const n = filtCount(); return `<button class="btn small ce-fbtn${n ? ' on' : ''}" data-ce="filters" aria-haspopup="dialog">${I.filt}<span>${esc(F('Filtres'))}</span>${n ? `<span class="num">(${n})</span>` : ''}</button>`; };
  function toolsRow() {
    return `<div class="pad ce-tools"><label class="ce-q"><span class="sr">${esc(F('Chercher dans ma collection'))}</span>${I.search}<input id="ce-q" type="search" enterkeyhint="search" autocomplete="off" placeholder="${esc(F('Chercher…'))}" value="${esc(V.q)}"><button class="ce-clear" data-ce="clear" aria-label="${esc(F('Effacer'))}"${V.q ? '' : ' hidden'}>${I.x}</button></label>
      <label class="btn small ce-sort">${I.sort}<span class="sr">${esc(F('Trier'))}</span><select id="ce-sort" data-ce="sort" aria-label="${esc(F('Trier'))}">${SORTS.map(([k, l]) => `<option value="${k}"${V.sort === k ? ' selected' : ''}>${esc(F(l))}</option>`).join('')}</select></label>${filterBtn()}</div>`;
  }
  function addRow() {
    const sellN = collection.filter(it => it.sell && BYKEY.has(it.key)).length;
    // Trois mots courts pour tenir sur une ligne : « + Une carte », « + Un set », « + Album » ; le nom complet reste pour les lecteurs d'écran
    const b = (href, cls, label, full, extra = '') => `<a class="btn small${cls}" href="${href}" aria-label="${esc(F(full))}"${extra}>${I.plus}<span>${esc(F(label))}</span></a>`;
    return `<div class="pad ce-add col-tools">${b('#/recherche', ' primary', 'Une carte', 'Ajouter une carte', ' data-col="addcard"')}${GAME !== 'sport' ? b('#/set', '', 'Un set', 'Ajouter un set') : ''}${PKM ? b('#/scan', '', 'Album', 'Scanner mon album') : ''}${sellN ? `<a class="btn small" href="#/revente">${SVG('<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.6" cy="8.6" r="1.2"/>', 16)}<span>${esc(F('À revendre'))}</span><span class="num">(${sellN})</span></a>` : ''}</div>`;
  }
  function groupRow() {
    const opts = [['set', 'Sets'], ...(DB.ills && DB.ills.length ? [['ill', 'Illustrateurs']] : []), ...(PKM ? [['poke', 'Pokémon']] : []), ['lang', 'Langues'], ['none', 'Tout']];
    return `<div class="pad ce-grp"><div class="chips scroll" role="tablist" aria-label="${esc(F('Ranger par'))}">${opts.map(([k, l]) => `<button class="chip${V.group === k ? ' on' : ''}" role="tab" aria-selected="${V.group === k}" data-ce="group" data-v="${k}">${esc(F(l))}</button>`).join('')}</div>
      <button class="iconbtn ce-view" data-ce="view" aria-label="${esc(viewMode() === 'grille' ? F('Afficher en liste') : F('Afficher en grille'))}">${viewMode() === 'grille' ? I.list : I.grid}</button></div>`;
  }

  /* ---------- L'écran ---------- */
  function screen() {
    if (!DB) return '';
    const title = G() || J() ? F('Ma collection') : F('Portefeuille');
    // Modèle d'écran commun : menu ☰ à gauche (posé par voyage.js), titre collé à droite, une seule action à droite (« ⋯ »)
    const head = `<div class="top top-start"><h1 class="title">${esc(title)}</h1><button class="iconbtn" data-ce="menu" aria-haspopup="dialog" aria-label="${esc(F('Plus d’options'))}">${I.more}</button></div>`;
    const rows = allRows();
    if (!rows.length && !sealedCol.length) {
      return head + gamesRow() + seg() + `<div class="pad" style="margin-top:14px"><div class="panel stack ce-empty"><b>${esc(collection.length ? F('Aucune carte de {0} dans ta collection', GI.name) : F('Ta collection est vide'))}</b><div class="sub">${esc(F('Cherche une carte et touche « Ajouter à ma collection », scanne ton album page par page, ou coche les cartes d’un set.'))}</div></div></div>${addRow()}<div class="pad">${typeof importBox === 'function' ? importBox() : ''}</div>${tabs('collection')}`;
    }
    const al = colExtra('alert');
    return head + `<div class="pad">${valueBlock()}</div>${gamesRow()}${seg()}${toolsRow()}${addRow()}${al ? `<div class="pad">${al}</div>` : ''}${groupRow()}
      <div class="pad ce-count sub" id="ce-count">${esc(countTxt(filtered()))}</div>
      <div id="ce-body">${listHtml()}</div>
      ${mySealedBlock()}
      ${!G() ? colExtra('curve') : ''}
      <div class="pad ce-src">${esc(F('Estimation : cote {0} du jour, selon l’état et la langue de chaque carte.', SRC()))}</div>${tabs('collection')}`;
  }

  /* ---------- Fenêtres : filtres et « plus d'options » ---------- */
  function sheet(html, onClose) {
    const d = document.createElement('dialog'); d.className = 'sheet';
    d.innerHTML = `<form class="sheet-in ce-sheet" method="dialog">${html}</form>`;
    document.body.appendChild(d);
    d.addEventListener('close', () => { const v = d.returnValue, f = d.querySelector('form'); if (onClose) onClose(v, f); d.remove(); });
    d.addEventListener('click', e => { if (e.target === d) d.close(); });
    d.showModal(); return d;
  }
  function openFilters() {
    const rows = allRows(), langs = [...new Set(rows.map(r => r.it.lang))], conds = CONDS.filter(([k]) => rows.some(r => !r.it.grader && r.it.cond === k));
    const hasG = rows.some(r => r.it.grader), hasRev = rows.some(r => r.it.rev), hasSell = rows.some(r => r.it.sell);
    const sel = (name, label, opts, cur) => `<label class="field">${esc(F(label))}<select name="${name}"><option value="">${esc(F('Toutes'))}</option>${opts.map(([k, l]) => `<option value="${esc(k)}"${cur === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
    const ck = (name, label, on) => `<label class="rs-chk"><input type="checkbox" name="${name}"${on ? ' checked' : ''}>${esc(F(label))}</label>`;
    sheet(`<b style="font-size:17px">${esc(F('Filtres'))}</b>
      ${langs.length > 1 ? sel('lang', 'Langue', langs.map(l => [l, langName(l)]), V.f.lang) : ''}
      ${conds.length > 1 ? sel('cond', 'État', conds.map(([k, n]) => [k, n]), V.f.cond) : ''}
      ${hasG ? sel('grade', 'Gradées', [['gradee', F('Seulement les gradées')], ['brute', F('Sans les gradées')]], V.f.grade) : ''}
      ${hasRev ? ck('rev', 'Seulement les reverses', V.f.rev) : ''}
      ${hasSell ? ck('sell', 'Seulement les cartes à revendre', V.f.sell) : ''}
      ${langs.length < 2 && conds.length < 2 && !hasG && !hasRev && !hasSell ? `<div class="sub">${esc(F('Toutes tes cartes ont la même langue et le même état : rien à filtrer pour l’instant.'))}</div>` : ''}
      <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:4px"><button class="btn small primary" value="ok">${esc(F('Appliquer'))}</button><button class="btn small" value="reset">${esc(F('Tout effacer'))}</button></div>`,
    (v, f) => {
      if (v === 'reset') V.f = { lang: '', cond: '', grade: '', rev: false, sell: false };
      else if (v === 'ok') V.f = { lang: f.lang ? f.lang.value : '', cond: f.cond ? f.cond.value : '', grade: f.grade ? f.grade.value : '', rev: !!(f.rev && f.rev.checked), sell: !!(f.sell && f.sell.checked) };
      else return;
      redrawList();
    });
  }
  function openMenu() {
    const sellN = collection.filter(it => it.sell && BYKEY.has(it.key)).length;
    const care = typeof revExtra === 'function' ? revExtra('careBtn') : '';
    const d = sheet(`<b style="font-size:17px">${esc(F('Plus d’options'))}</b>
      <div class="stack" style="gap:8px">
        <a class="extlink" href="#/revente">${esc(F('Mes cartes à revendre'))}${sellN ? ` <span class="num">(${sellN})</span>` : ''}${I.chev}</a>
        ${care ? `<div class="ce-care">${care}</div>` : ''}
        <a class="extlink" href="#/envies">${esc(F('Mes envies'))}${I.chev}</a>
        ${typeof openFaceSheet === 'function' ? `<button type="button" class="extlink ce-face" data-ce="face">${esc(F('Affichage'))} : ${esc(F((FACES.find(x => x[0] === curFace()) || ['', ''])[1]))}${I.chev}</button>` : ''}
      </div>
      ${typeof importBox === 'function' ? importBox() : ''}`);
    d.addEventListener('click', e => { if (e.target.closest('a[href^="#/"]')) d.close(); });
  }

  /* ---------- Actions ---------- */
  document.addEventListener('click', e => {
    const el = e.target.closest && e.target.closest('[data-ce]'); if (!el || el.tagName === 'SELECT') return;
    const a = el.dataset.ce;
    if (a === 'game') goGame(el.dataset.v);
    else if (a === 'group') { V.group = el.dataset.v; keep(); render(); }
    else if (a === 'view') { V.view = viewMode() === 'grille' ? 'liste' : 'grille'; keep(); render(); }
    else if (a === 'filters') openFilters();
    else if (a === 'menu') openMenu();
    else if (a === 'face') { const d = el.closest('dialog'); if (d) d.close(); openFaceSheet(); }
    else if (a === 'more') showMore();
    else if (a === 'clear') { e.preventDefault(); V.q = ''; const q = document.getElementById('ce-q'); if (q) { q.value = ''; q.focus(); } redrawList(); }
    else if (a === 'reset') { V.q = ''; V.f = { lang: '', cond: '', grade: '', rev: false, sell: false }; const q = document.getElementById('ce-q'); if (q) q.value = ''; redrawList(); }
  });
  document.addEventListener('change', e => { if (e.target.id === 'ce-sort') { V.sort = e.target.value; keep(); redrawList(); } });
  let typing = 0;
  document.addEventListener('input', e => {
    if (e.target.id !== 'ce-q') return;
    V.q = e.target.value; clearTimeout(typing); typing = setTimeout(redrawList, 120);
  });
  document.addEventListener('keydown', e => { if (e.target.id === 'ce-q' && e.key === 'Enter') e.target.blur(); });
  // Le mouvement sur 30 jours arrive après coup (courbe calculée à partir des relevés) : on le pose quand il est prêt
  document.addEventListener('callit:curve', () => { const b = document.getElementById('ce-chg'); if (b) b.innerHTML = moveBox(); });

  window.CallItColScreen = {
    view: () => { const h = screen(); setTimeout(watchMore, 0); return h; },
    reset: () => { V.rows = null; V.q = ''; V.f = { lang: '', cond: '', grade: '', rev: false, sell: false }; }
  };
  // Les cartes ont pu finir de charger avant ce fichier : on refait alors l'affichage
  if (DB && S.face && /^#\/collection/.test(location.hash)) render();
})();
