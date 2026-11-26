/* CallIt! · Compléments de la collection :
   1. Ajouter un set entier : on coche ses cartes rareté par rareté (« master set »), puis on décoche celles qu'on n'a pas.
   2. Ajout rapide : après un scan sûr, un seul geste crée l'exemplaire, avec les réglages habituels.
   3. Courbe de valeur : la valeur de la collection jour après jour, refaite à partir des relevés quotidiens
      (historique/NN.json), chaque carte comptée à partir de sa date d'achat. Rien n'est stocké en plus dans le compte :
      la courbe se recalcule sur chaque appareil à partir de la collection synchronisée et des relevés publics.
   Fichier séparé de app.js : chargé juste après lui, il réutilise ses fonctions et lui fournit des morceaux de page
   par window.CallItCollection. Sans ce fichier, l'appli marche comme avant : ces morceaux ne s'affichent pas. */
(function () {
  'use strict';
  if (typeof render !== 'function') return;

  const CHECK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  const PLUS = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
  const CHEV = o => `<svg class="seal-chev${o ? ' on' : ''}" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>`;

  /* ---------- Créer un exemplaire sans formulaire ---------- */
  let seq = 0;
  // Identifiant unique même quand on crée 300 exemplaires dans la même milliseconde
  const newId = () => Date.now().toString(36) + (seq++ % 46656).toString(36).padStart(3, '0') + Math.random().toString(36).slice(2, 4);
  const blank = (key, lang, cond, date) => ({ id: newId(), key, lang, cond, rev: false, grader: '', grade: '', val: null, qty: 1, paid: null, cur: userCur(), date: date || '', note: '' });
  const langName = l => (LANG[l] ? LANG[l].name : l);
  const condName = k => (CONDS.find(x => x[0] === k) || ['', k])[1];
  const nCards = n => (n > 1 ? n + ' cartes' : n + ' carte');
  const ownKeys = () => new Set(collection.map(it => it.key));
  // Réglages habituels : la langue et l'état qui reviennent le plus dans ma collection (langs : les langues possibles ici)
  function usual(langs) {
    const top = (val, ok) => {
      const m = new Map(); let best = '', n = 0;
      for (const it of collection) { if (!BYKEY.has(it.key)) continue; const v = val(it); if (!v || !ok(v)) continue; const x = (m.get(v) || 0) + (it.qty || 1); m.set(v, x); if (x > n) { best = v; n = x; } }
      return best;
    };
    return { lang: top(it => it.lang, v => !langs || langs.includes(v)), cond: top(it => (it.grader ? '' : it.cond), v => COND_RANK[v] != null) || 'NM' };
  }

  /* ---------- 1. Ajouter un set ---------- */
  const SET = { si: -1, sel: new Set(), open: new Set(), lang: '', cond: 'NM', last: null, q: '', zone: '', all: false };
  let setIdx = null, MODEL = null;
  // Les sets qui ont des cartes dans la base, du plus récent au plus ancien
  function setList() {
    if (setIdx && setIdx.n === CARDS.length) return setIdx.list;
    const seen = new Set(); for (const c of CARDS) if (!c.x) seen.add(c.s);
    const list = [...seen].filter(si => DB.sets[si] && !DB.sets[si].x).sort((a, b) => (DB.sets[b].date || '').localeCompare(DB.sets[a].date || ''));
    setIdx = { n: CARDS.length, list }; return list;
  }
  function haveBySet() {
    const m = new Map();
    for (const it of collection) { const c = BYKEY.get(it.key); if (!c || c.x) continue; if (!m.has(c.s)) m.set(c.s, new Set()); m.get(c.s).add(c.num); }
    return m;
  }
  function setsBody() {
    const have = haveBySet(), all = setList(), q = norm(SET.q.trim());
    const row = si => {
      const st = DB.sets[si], h = have.has(si) ? have.get(si).size : 0, tot = setSize(si);
      return `<a class="line" href="#/set/${si}"><span class="mid"><b>${esc(setName(st))}</b><span>${esc(year(st))}</span></span><span class="px">${h ? `<b class="num">${h} sur ${tot}</b>` : `<span>${nCards(tot)}</span>`}</span></a>`;
    };
    if (q) {
      const xs = all.filter(si => { const st = DB.sets[si]; return norm(Object.values(st.name).join(' | ') + ' | ' + st.id).includes(q); }).slice(0, 60);
      return xs.length ? `<div class="list" style="margin-top:14px">${xs.map(row).join('')}</div>` : `<div class="pad" style="margin-top:14px"><div class="note">Aucun set trouvé. Essaie un autre nom.</div></div>`;
    }
    const zone = all.filter(si => (DB.sets[si].reg === 'ja') === (SET.zone === 'ja'));
    const mine = zone.filter(si => have.has(si)).sort((a, b) => have.get(b).size / setSize(b) - have.get(a).size / setSize(a));
    const shown = SET.all ? zone : zone.slice(0, 12);
    return `${mine.length ? `<div class="sect"><h2 class="h2">Mes sets en cours</h2></div><div class="list">${mine.map(row).join('')}</div>` : ''}
    <div class="sect"><h2 class="h2">${SET.all ? 'Tous les sets' : 'Sets récents'}</h2></div><div class="list">${shown.map(row).join('')}</div>
    ${zone.length > shown.length ? `<div class="pad" style="margin-top:14px"><button class="btn" data-col="allsets">Voir tous les sets (${zone.length})</button></div>` : ''}`;
  }
  function viewSets() {
    const hasJa = PKM && setList().some(si => DB.sets[si].reg === 'ja');
    return `<div class="top">${backBtn()}<span class="sub" style="font-weight:600">${G() ? 'Ma collection' : 'Portefeuille'}</span><span style="width:44px"></span></div>
    <div class="pad"><h1 class="title">Ajouter un set</h1><div class="sub" style="margin-top:4px">Choisis un set, puis coche les cartes que tu as.</div></div>
    <div class="pad" style="padding-top:12px"><label for="colq" class="sr">Chercher un set</label><input id="colq" class="search" type="search" enterkeyhint="search" autocomplete="off" placeholder="Nom du set…" value="${esc(SET.q)}"></div>
    ${hasJa ? `<div class="pad chips" style="padding-top:10px"><button class="chip ${SET.zone ? '' : 'on'}" data-col="zone" data-v="">International</button><button class="chip ${SET.zone ? 'on' : ''}" data-col="zone" data-v="ja">Asie</button></div>` : ''}
    <div id="col-sets">${setsBody()}</div>${tabs('collection')}`;
  }

  // Les cartes d'un set, rangées par rareté : communes, peu communes et rares d'abord, puis les autres dans l'ordre des numéros
  function model(si) {
    if (MODEL && MODEL.si === si && MODEL.n === CARDS.length) return MODEL;
    const st = DB.sets[si]; if (!st || st.x) return null;
    const cards = CARDS.filter(c => c.s === si && !c.x).sort(cmpNum); if (!cards.length) return null;
    const by = new Map();
    cards.forEach((c, i) => { const r = rar(c) || '', k = r === 'None' ? '' : r; if (!by.has(k)) by.set(k, { k, cards: [], pos: 0 }); const g = by.get(k); g.cards.push(c); g.pos += i; });
    const FIRST = { Common: 0, Uncommon: 1, Rare: 2, 'Rare Holo': 3, 'Holo Rare': 3 };
    const rank = g => (g.k === '' ? 1e9 : g.k in FIRST ? FIRST[g.k] : 10 + g.pos / g.cards.length);
    const groups = [...by.values()].sort((a, b) => rank(a) - rank(b));
    let langs = LANGS.map(l => l[0]).filter(l => cards.some(c => c.langs.includes(l)));
    if (!langs.length) langs = [...new Set(cards.flatMap(c => c.langs))];
    if (!langs.length) langs = [st.reg === 'en' ? 'en' : 'ja'];
    return (MODEL = { si, n: CARDS.length, st, cards, groups, langs });
  }
  const rarName = k => (k === '' ? 'Autres' : k in RAR_FR ? RAR_FR[k] || 'Autres' : k);
  const isOpen = (m, g) => m.groups.length === 1 || SET.open.has(g.k);
  function groupHead(m, g, gi, own) {
    const n = g.cards.length, nOwn = g.cards.filter(c => own.has(c.key)).length, free = n - nOwn, nSel = g.cards.filter(c => SET.sel.has(c.key) && !own.has(c.key)).length, open = isOpen(m, g);
    const bits = [`<span>${nCards(n)}</span>`, nOwn === n ? '<span>tu les as toutes</span>' : nOwn ? `<span>tu en as ${nOwn}</span>` : '', nSel ? `<span>${nSel > 1 ? nSel + ' cochées' : nSel + ' cochée'}</span>` : ''].filter(Boolean).join(' · ');
    const name = `<span class="ms-gn"><b>${esc(rarName(g.k))}</b><span class="sub">${bits}</span></span>`;
    return `<div class="ms-g" data-g="${gi}">${m.groups.length === 1 ? `<span class="ms-gh">${name}</span>` : `<button class="ms-gh" data-col="open" data-g="${gi}" aria-expanded="${open}">${CHEV(open)}${name}</button>`}${free ? `<button class="btn small" data-col="tickall" data-g="${gi}">${nSel >= free ? 'Tout décocher' : 'Tout cocher'}</button>` : ''}</div>`;
  }
  function cardTile(c, own) {
    const mine = own.has(c.key), on = !mine && SET.sel.has(c.key), p = price(c);
    return `<button type="button" class="tile ms-c${on ? ' on' : ''}${mine ? ' own' : ''}" ${mine ? 'disabled' : `data-col="tick" data-key="${esc(c.key)}" aria-pressed="${on}"`}>${cimg(c, { lang: SET.lang })}<span class="ms-ck">${CHECK}</span>${mine ? '<span class="sr">Déjà dans ma collection</span>' : ''}<span class="nm">${esc(cardName(c))}</span><span class="mt">${esc(c.num)}${p > 0 ? ' · ' + eurC(p) : ''}</span></button>`;
  }
  const picked = (m, own) => m.cards.filter(c => SET.sel.has(c.key) && !own.has(c.key));
  function bar(m, own) {
    const sel = picked(m, own), n = sel.length;
    if (!n && SET.last && SET.last.length) {
      const k = SET.last.length;
      return `<div class="ms-bar" id="ms-bar"><div class="ms-bar-t"><b>${k > 1 ? k + ' cartes ajoutées' : k + ' carte ajoutée'}</b><a class="small" href="#/collection">Voir ma collection</a></div><button class="btn small" data-col="undo">Annuler l’ajout</button></div>`;
    }
    let v = 0; for (const c of sel) { const e = ownValue({ lang: SET.lang, cond: SET.cond, rev: false, grader: '' }, c); if (e) v += e.u; }
    return `<div class="ms-bar" id="ms-bar"><div class="ms-bar-t">${n ? `<b>${n > 1 ? n + ' cartes cochées' : n + ' carte cochée'}</b>${v > 0 ? `<span class="small"><span>valeur estimée</span> <b class="num">${ownMoney(v)}</b></span>` : ''}` : '<span class="sub">Aucune carte cochée</span>'}</div><button class="btn primary" data-col="addsel" ${n ? '' : 'disabled'}>Ajouter</button></div>`;
  }
  const allLabel = (m, own) => { const free = m.cards.filter(c => !own.has(c.key)).length; return free && picked(m, own).length >= free ? 'Tout décocher' : 'Tout cocher'; };
  function viewSet(si) {
    const m = model(si);
    if (!m) return `<div class="top">${backBtn()}</div><div class="pad"><div class="note">Set introuvable.</div></div>${tabs('collection')}`;
    if (SET.si !== si) { // nouveau set : rien de coché, réglages de la dernière fois (sinon les plus habituels)
      const saved = load('colAdd', {}), u = usual(m.langs);
      Object.assign(SET, { si, sel: new Set(), open: new Set(), last: null,
        lang: m.langs.includes(saved.lang) ? saved.lang : u.lang || (m.langs.includes(prefLang(m.cards[0])) ? prefLang(m.cards[0]) : m.langs[0]),
        cond: COND_RANK[saved.cond] != null ? saved.cond : u.cond });
    }
    const own = ownKeys(), nOwn = m.cards.filter(c => own.has(c.key)).length, free = m.cards.length - nOwn;
    const body = m.groups.map((g, gi) => groupHead(m, g, gi, own) + (isOpen(m, g) ? `<div class="grid ms-grid">${g.cards.map(c => cardTile(c, own)).join('')}</div>` : '')).join('');
    const sub = [`<span>${nCards(m.cards.length)}</span>`, nOwn ? (nOwn === m.cards.length ? '<span>tu les as toutes</span>' : `<span>tu en as ${nOwn}</span>`) : '', esc(year(m.st))].filter(Boolean).join(' · ');
    return `<div class="top">${backBtn()}<span class="sub" style="font-weight:600">Ajouter un set</span><span style="width:44px"></span></div>
    <div class="pad"><h1 class="title">${esc(setName(m.st))}</h1><div class="sub" style="margin-top:4px">${sub}</div></div>
    <div class="pad" style="padding-top:12px"><div class="panel stack"><div class="row" style="align-items:flex-end">
      <label class="field" style="flex:1">Langue<select data-col="lang">${m.langs.map(l => `<option value="${esc(l)}" ${l === SET.lang ? 'selected' : ''}>${esc(langName(l))}</option>`).join('')}</select></label>
      <label class="field" style="flex:1">État<select data-col="cond">${CONDS.map(([k, n]) => `<option value="${k}" ${k === SET.cond ? 'selected' : ''}>${n}</option>`).join('')}</select></label></div>
      <div class="small">Pour les cartes ajoutées ici. Chaque carte reste modifiable ensuite.</div></div></div>
    <div class="pad between" style="padding-top:16px;align-items:center"><b style="font-size:15px">Coche les cartes que tu as</b>${free ? `<button class="linkbtn small" data-col="tickall" data-g="-1">${allLabel(m, own)}</button>` : ''}</div>
    ${body}
    ${bar(m, own)}${tabs('collection')}`;
  }
  // Après une coche : seuls les compteurs et la barre du bas changent (les images restent en place)
  function refresh() {
    const m = model(SET.si); if (!m) return; const own = ownKeys();
    m.groups.forEach((g, gi) => { const el = app.querySelector(`.ms-g[data-g="${gi}"]`); if (el) el.outerHTML = groupHead(m, g, gi, own); });
    const b = document.getElementById('ms-bar'); if (b) b.outerHTML = bar(m, own);
    const all = app.querySelector('[data-col="tickall"][data-g="-1"]'); if (all) all.textContent = allLabel(m, own);
  }
  function draw() {
    const p = parseHash().parts, si = p[1] != null && /^\d+$/.test(p[1]) ? +p[1] : null, m = si != null ? model(si) : null;
    app.innerHTML = si == null ? viewSets() : viewSet(si);
    document.title = (m ? setName(m.st) : tr('Ajouter un set')) + ' · CallIt!';
  }
  // Refait la page en gardant sous le doigt l'élément qu'on vient de toucher
  function redraw(sel) {
    const a = sel && app.querySelector(sel), y = a ? a.getBoundingClientRect().top : null;
    draw();
    const b = y != null && app.querySelector(sel); if (b) window.scrollBy(0, b.getBoundingClientRect().top - y);
  }
  function tick(el) {
    const k = el.dataset.key; if (!BYKEY.has(k)) return;
    const on = !SET.sel.has(k); on ? SET.sel.add(k) : SET.sel.delete(k); SET.last = null;
    el.classList.toggle('on', on); el.setAttribute('aria-pressed', on);
    refresh();
  }
  function tickAll(gi) {
    const m = model(SET.si); if (!m) return; const own = ownKeys(), g = gi >= 0 ? m.groups[gi] : null;
    const free = (g ? g.cards : m.cards).filter(c => !own.has(c.key)); if (!free.length) return;
    const all = free.every(c => SET.sel.has(c.key));
    for (const c of free) all ? SET.sel.delete(c.key) : SET.sel.add(c.key);
    SET.last = null;
    if (g && !all) SET.open.add(g.k); // on montre ce qui vient d'être coché, pour décocher les cartes qu'on n'a pas
    redraw(g ? `.ms-g[data-g="${gi}"]` : '[data-col="tickall"][data-g="-1"]');
  }
  function addSel() {
    const m = model(SET.si); if (!m) return; const cards = picked(m, ownKeys()); if (!cards.length) return;
    const recs = cards.map(c => blank(c.key, SET.lang, SET.cond, '')); // date d'achat inconnue : ces cartes comptent depuis le début de la courbe
    collection.push(...recs); saveCol(); recordHistory();
    save('colAdd', { lang: SET.lang, cond: SET.cond });
    SET.last = recs.map(r => r.id); SET.sel.clear();
    redraw('#ms-bar');
    toast(recs.length > 1 ? recs.length + ' cartes ajoutées à ta collection' : 'Ajoutée à ta collection');
  }
  function undo() {
    const ids = new Set(SET.last || []); if (!ids.size) return;
    const back = collection.filter(it => ids.has(it.id));
    collection = collection.filter(it => !ids.has(it.id));
    for (const it of back) { markDeleted(it.id, 'card'); SET.sel.add(it.key); }
    saveCol(); recordHistory(); SET.last = null;
    redraw('#ms-bar'); toast('Ajout annulé');
  }

  /* ---------- 2. Ajout rapide après un scan sûr ---------- */
  // st : l'état du scan (app.js). « sûr » = une seule carte possible, dont le numéro et le nom ont été lus sur la photo.
  function scanAdd(st) {
    const c = st && st.sure && st.results && st.results[0]; if (!c || c.x) return '';
    const mine = collection.filter(it => it.key === c.key);
    if (mine.length) {
      const it = mine[mine.length - 1];
      return `<div class="pad col-quick"><b style="font-size:14px">Dans ta collection</b><div class="small"><span>${esc(langName(it.lang))}</span> · ${esc(it.grader ? (it.grader + ' ' + (it.grade || '')).trim() : condName(it.cond))} · <button class="linkbtn" data-col="edit" data-id="${esc(it.id)}">Modifier</button></div></div>`;
    }
    // La langue : celle du nom lu sur la carte quand elle se reconnaît, sinon la langue habituelle
    const langs = c.langs.length ? c.langs : [c.set.reg === 'en' ? 'en' : 'ja'], read = (st.langs || []).filter(l => langs.includes(l)), u = usual(langs);
    const pref = u.lang || prefLang(c), lang = !read.length || read.includes(pref) ? pref : read[0];
    return `<div class="pad col-quick"><button class="btn primary" data-col="quick" data-key="${esc(c.key)}" data-lang="${esc(lang)}" data-cond="${esc(u.cond)}">${PLUS}<span>Ajouter à ma collection</span></button><div class="small"><span>${esc(langName(lang))}</span> · ${esc(condName(u.cond))} · <span>modifiable ensuite</span></div></div>`;
  }
  function quickAdd(key, lang, cond) {
    const c = BYKEY.get(key); if (!c) return;
    const rec = blank(key, lang, COND_RANK[cond] != null ? cond : 'NM', new Date().toISOString().slice(0, 10));
    collection.push(rec); saveCol(); recordHistory(); render();
    toastAction('Ajoutée à ta collection', 'Modifier', () => openItemSheet(key, rec.id));
  }

  /* ---------- 3. Courbe de valeur ---------- */
  const CUR = { sig: '', data: null, wait: '', info: null, failAt: 0 };
  const dayN = s => Math.round(Date.parse(String(s).slice(0, 10) + 'T00:00:00Z') / 864e5);
  const dayS = n => new Date(n * 864e5).toISOString().slice(0, 10);
  const isDay = s => /^\d{4}-\d\d-\d\d/.test(s || '');
  const bucket = cm => String(cm % 100).padStart(2, '0');
  const hash = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
  // Ce dont dépend la courbe : mes cartes, mes scellés, le jour des prix et la devise
  const curSig = () => hash(JSON.stringify([collection.filter(it => BYKEY.has(it.key)).map(it => [it.key, it.lang, it.cond, it.rev ? 1 : 0, it.grader || '', it.val, it.qty, it.cur, it.paid, it.date || '']),
    SEALED ? sealedCol.map(it => [it.pid, it.qty, it.date || '']) : 0, priceDate(), userCur(), rate(userCur()) || 1]));
  async function getJson(u) { try { const r = await fetch(u, { cache: 'no-cache' }); return r.ok ? await r.json() : null; } catch (e) { return null; } }

  // Valeur de ce que j'ai aujourd'hui, jour par jour : chaque exemplaire vaut sa valeur du jour × (cote de ce jour-là ÷ cote du jour),
  // et ne compte qu'à partir de sa date d'achat. Rend null si les relevés ne sont pas joignables.
  async function buildCurve() {
    if (!CUR.info) CUR.info = await getJson('historique/info.json');
    const info = CUR.info; if (!info || !isDay(info.start) || !isDay(info.last)) { CUR.info = null; return null; }
    const today = isDay(priceDate()) ? dayN(priceDate()) : dayN(info.last);
    const d0 = dayN(info.start), d1 = Math.max(dayN(info.last), today), n = d1 - d0 + 1;
    if (!(n >= 1) || n > 4000) return null;
    const rows = [], from = it => Math.max(0, Math.min(n - 1, isDay(it.date) ? dayN(it.date) - d0 : 0));
    for (const it of collection) {
      const c = BYKEY.get(it.key); if (!c) continue; const e = ownValue(it, c); if (!e) continue;
      const q = !it.grader && c.cm ? quote(c) : null; // les cartes gradées gardent l'estimation de leur propriétaire
      rows.push({ tot: e.u * (it.qty || 1), i0: from(it), cm: q && q.v > 0 ? c.cm : 0, ref: q && q.v > 0 ? q.v * 100 : 0 });
    }
    if (SEALED) for (const it of sealedCol) { const x = SEALED.byId.get(it.pid), v = x ? toUser(sPrice(x)) : null; if (v != null) rows.push({ tot: v * (it.qty || 1), i0: from(it), cm: 0, ref: 0 }); }
    if (!rows.length) return { none: true };
    // Les relevés sont rangés en 100 fichiers. On lit ceux qui pèsent le plus dans la collection, dans la limite d'un
    // téléchargement raisonnable (il grossit avec le nombre de jours) ; les cartes des autres fichiers restent à leur valeur du jour.
    const K = Math.max(6, Math.min(100, Math.floor(1200 / (3 + 2 * n))));
    const byB = new Map(); for (const r of rows) if (r.cm) byB.set(bucket(r.cm), (byB.get(bucket(r.cm)) || 0) + r.tot);
    const picks = new Set([...byB].sort((a, b) => b[1] - a[1]).slice(0, K).map(x => x[0]));
    await Promise.all([...picks].map(async b => { if (!HIST.has(b)) { const h = await getJson('historique/' + b + '.json'); if (h && h.p && isDay(h.start)) HIST.set(b, h); } }));
    if (picks.size && ![...picks].some(b => HIST.has(b))) return null; // aucun relevé joignable : on réessaiera
    const v = new Array(n).fill(0), ti = today - d0; let flat = 0;
    for (const r of rows) {
      const h = r.cm && picks.has(bucket(r.cm)) ? HIST.get(bucket(r.cm)) : null, s = h && h.p[r.cm];
      if (s && r.ref > 0) {
        const off = dayN(h.start) - d0, k = new Array(n); let last = null, first = null;
        for (let i = 0; i < n; i++) { const x = s[i - off]; if (x > 0) { last = x; if (first == null) first = x; } k[i] = last; } // un jour sans relevé garde la cote de la veille
        if (first != null) { for (let i = 0; i < n; i++) k[i] = (k[i] == null ? first : k[i]) / r.ref; if (ti >= 0 && ti < n) k[ti] = 1; r.k = k; }
      }
      if (!r.k && r.cm) flat++;
      for (let i = r.i0; i < n; i++) v[i] += r.tot * (r.k ? r.k[i] : 1);
    }
    let f = 0; while (f < n - 1 && !(v[f] > 0)) f++;
    // Écart sur p jours, à cartes égales : seul le mouvement des cotes compte, pas les achats faits entre-temps
    const change = p => {
      const a0 = Math.max(f, n - 1 - p); if (a0 >= n - 1) return null;
      let abs = 0, base = 0;
      for (const r of rows) { const i = Math.max(a0, r.i0), a = r.tot * (r.k ? r.k[i] : 1); abs += r.tot * (r.k ? r.k[n - 1] : 1) - a; base += a; }
      return base > 0 ? { abs, pct: abs / base } : null;
    };
    const span = n - 1 - f;
    return { start: dayS(d0 + f), v: v.slice(f).map(x => Math.round(fromUserToEur(x) * 100) / 100), all: change(span), c7: span >= 7 ? change(7) : null, c30: span >= 30 ? change(30) : null, flat, last: info.last };
  }
  async function loadCurve(sig) {
    if (CUR.failAt && Date.now() - CUR.failAt < 60000) return;
    CUR.wait = sig;
    let data = null; try { data = await buildCurve(); } catch (e) { data = null; }
    if (CUR.wait !== sig) return;
    CUR.wait = '';
    if (data) { CUR.failAt = 0; CUR.sig = sig; CUR.data = data; if (!data.none) save('colCurve', { sig, data }); }
    else { CUR.failAt = Date.now(); if (!CUR.data) CUR.data = { none: true, fail: true }; }
    const box = document.getElementById('col-curve'), sp = document.getElementById('col-spark');
    if (box) box.innerHTML = curveHtml(CUR.data);
    if (sp) sp.innerHTML = sparkHtml(CUR.data) || spark();
  }
  // Demande la courbe si mes cartes, les prix ou la devise ont changé, et rend tout de suite la dernière connue
  function curveNow() {
    const sig = curSig(), fresh = CUR.sig === sig || CUR.wait === sig;
    if (fresh && CUR.data) return CUR.data;
    const c = load('colCurve', null), kept = c ? cleanCurve(c.data) : null;
    if (!fresh) { if (kept && c.sig === sig) { CUR.sig = sig; CUR.data = kept; } else loadCurve(sig); } // déjà calculée aujourd'hui pour ces cartes : rien à retélécharger
    return CUR.data || kept;
  }
  // Une courbe relue sur l'appareil n'est gardée que si elle a la forme attendue (des nombres, une date)
  function cleanCurve(d) {
    if (!d || typeof d !== 'object' || !isDay(d.start) || !Array.isArray(d.v) || !d.v.length || d.v.length > 4000 || !d.v.every(x => typeof x === 'number' && isFinite(x))) return null;
    const ch = c => (c && typeof c.abs === 'number' && typeof c.pct === 'number' && isFinite(c.abs) && isFinite(c.pct) ? { abs: c.abs, pct: c.pct } : null);
    return { start: d.start.slice(0, 10), v: d.v, all: ch(d.all), c7: ch(d.c7), c30: ch(d.c30), flat: Math.max(0, Math.round(+d.flat || 0)), last: String(d.last || '').slice(0, 10) };
  }
  const fmtDay = (s, long) => new Date(s + 'T12:00:00').toLocaleDateString(LOCALE, long ? { day: 'numeric', month: 'long', year: 'numeric' } : { day: 'numeric', month: 'short' });
  // « +12 € · +1,4 % » (un écart de moins d'un centime s'écrit zéro, sans signe moins)
  function chgTxt(c) {
    const abs = Math.abs(c.abs) < 0.005 ? 0 : c.abs, p = abs === 0 ? 0 : c.pct * 100, r = (Math.abs(p) < 10 ? Math.round(p * 10) / 10 : Math.round(p)) || 0;
    return `${abs >= 0 ? '+' : ''}${ownMoney(abs)} · ${r >= 0 ? '+' : ''}${r.toLocaleString(LOCALE)} %`;
  }
  function curveHtml(d) {
    if (!d) return '';
    if (d.none) return d.fail ? spark() : '';
    if (d.v.length < 2) return `<div class="small" style="line-height:1.45">${F('Courbe de valeur : les cotes sont relevées chaque matin depuis le {0}. Elle apparaît dès le deuxième jour.', esc(fmtDay(d.start, true)))}</div>`;
    const t0 = Date.parse(d.start + 'T12:00:00Z'), pts = d.v.map((x, i) => [new Date(t0 + i * 864e5), x]);
    const figs = [d.c7 ? ['Sur 7 jours', d.c7] : null, d.c30 ? ['Sur 30 jours', d.c30] : null].filter(Boolean);
    if (!figs.length && d.all) figs.push([F('Depuis le {0}', esc(fmtDay(d.start))), d.all]);
    return `<b style="font-size:15px">Valeur jour après jour</b>
    ${figs.length ? `<div class="row" style="gap:18px;margin-top:4px;flex-wrap:wrap">${figs.map(([l, c]) => `<div><div class="small">${l}</div><b class="num ${c.abs > -0.005 ? 'gain' : 'loss'}">${chgTxt(c)}</b></div>`).join('')}</div>` : ''}
    ${lineChart(pts, 'Valeur de ma collection jour après jour')}
    <div class="small" style="margin-top:6px;line-height:1.45">${F('Tes cartes d’aujourd’hui, chacune comptée à partir de sa date d’achat. Les écarts ne comptent que le mouvement des cotes, pas tes achats.')}${d.flat ? ' ' + (d.flat > 1 ? F('{0} cartes ne sont pas encore suivies jour par jour : elles restent à leur valeur du jour.', d.flat) : F('Une carte n’est pas encore suivie jour par jour : elle reste à sa valeur du jour.')) : ''}</div>`;
  }
  function sparkHtml(d) {
    if (!d || d.none || !d.v || d.v.length < 2) return '';
    const v = d.v, mn = Math.min(...v), mx = Math.max(...v), w = 350, hh = 56, n = v.length;
    const path = v.map((x, i) => `${(i / (n - 1) * w).toFixed(1)} ${(hh - 4 - (mx === mn ? 0.5 : (x - mn) / (mx - mn)) * (hh - 8)).toFixed(1)}`).join(' L');
    return `<svg class="spark" viewBox="0 0 ${w} ${hh}" preserveAspectRatio="none" role="img" aria-label="Évolution de la valeur"><path d="M${path}" fill="none" stroke="var(--gain)" stroke-width="2.5" stroke-linejoin="round"/></svg>`;
  }
  const hasCards = () => collection.some(it => BYKEY.has(it.key));

  /* ---------- Morceaux de page demandés par app.js ---------- */
  window.CallItCollection = {
    // Portefeuille et Ma collection : accès à « Ajouter un set »
    tools: () => `<div class="pad col-tools"><a class="btn small" href="#/set">${PLUS}<span>Ajouter un set</span></a></div>`,
    // Page d'un set (recherche filtrée) : cocher mes cartes de ce set
    setLink: si => (DB.sets[si] && !DB.sets[si].x ? `<div class="pad col-tools"><a class="btn small" href="#/set/${si}">${CHECK}<span>Cocher les cartes que j’ai</span></a></div>` : ''),
    scanAdd,
    // Portefeuille : la courbe complète (pour les autres jeux, sans relevé quotidien : celle que l'appareil a notée)
    curve: () => (!hasCards() ? '' : !PKM ? `<div class="pad" style="margin-top:6px">${spark()}</div>` : `<div class="pad" id="col-curve" style="margin-top:16px">${curveHtml(curveNow())}</div>`),
    // Accueil Marché : la même courbe, en petit
    spark: () => (!PKM || !hasCards() ? '' : `<div id="col-spark">${sparkHtml(curveNow()) || spark()}</div>`)
  };

  /* ---------- Actions ---------- */
  document.addEventListener('click', e => {
    const el = e.target.closest && e.target.closest('[data-col]'); if (!el || el.tagName === 'SELECT' || el.tagName === 'INPUT') return;
    const a = el.dataset.col;
    if (a === 'tick') tick(el);
    else if (a === 'open') { const m = model(SET.si), g = m && m.groups[+el.dataset.g]; if (g) { SET.open.has(g.k) ? SET.open.delete(g.k) : SET.open.add(g.k); redraw(`.ms-g[data-g="${+el.dataset.g}"]`); } }
    else if (a === 'tickall') tickAll(+el.dataset.g);
    else if (a === 'addsel') addSel();
    else if (a === 'undo') undo();
    else if (a === 'allsets') { SET.all = true; const box = document.getElementById('col-sets'); if (box) box.innerHTML = setsBody(); }
    else if (a === 'zone') { SET.zone = el.dataset.v; SET.all = false; draw(); }
    else if (a === 'quick') quickAdd(el.dataset.key, el.dataset.lang, el.dataset.cond);
    else if (a === 'edit') { const it = collection.find(x => x.id === el.dataset.id); if (it) openItemSheet(it.key, it.id); }
  });
  document.addEventListener('change', e => {
    const a = e.target.dataset && e.target.dataset.col;
    if (a === 'lang') { SET.lang = e.target.value; draw(); }           // les images passent dans la langue choisie
    else if (a === 'cond') { SET.cond = e.target.value; refresh(); }   // seule la valeur estimée change
  });
  document.addEventListener('input', e => {
    if (e.target.id !== 'colq') return;
    SET.q = e.target.value; const box = document.getElementById('col-sets'); if (box) box.innerHTML = setsBody();
  });

  /* ---------- Branchement dans l'appli ---------- */
  const isSet = () => parseHash().parts[0] === 'set';
  const baseRender = render;
  render = function (keepFocus) {
    if (DB && S.face && isSet()) { document.body.dataset.face = G() ? 'galerie' : 'marche'; draw(); return; }
    baseRender(keepFocus);
  };
  // Les cartes ont pu finir de charger avant ce fichier : on refait alors l'affichage
  if (DB && S.face) render();
})();
