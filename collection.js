/* CallIt! · Compléments de la collection :
   1. Ajouter un set entier : on coche ses cartes rareté par rareté (« master set »), puis on décoche celles qu'on n'a pas.
   2. Ajout rapide : après un scan sûr, un seul geste crée l'exemplaire, avec les réglages habituels.
   3. Courbe de valeur : la valeur de la collection jour après jour, refaite à partir des relevés quotidiens
      (historique/NN.json), chaque carte comptée à partir de sa date d'achat. Rien n'est stocké en plus dans le compte :
      la courbe se recalcule sur chaque appareil à partir de la collection synchronisée et des relevés publics.
   4. Cartes à revendre : une case et un prix visé sur chaque exemplaire, une page qui les réunit (payé, estimation du jour,
      ce qu'il reste après les frais de vente) et une alerte dans l'appli quand l'estimation atteint le prix visé.
   5. Photographier ma carte : la photo de mon exemplaire à la place de l'image officielle, gardée sur l'appareil.
   Fichier séparé de app.js : chargé juste après lui, il réutilise ses fonctions et lui fournit des morceaux de page
   par window.CallItCollection. Sans ce fichier, l'appli marche comme avant : ces morceaux ne s'affichent pas. */
(function () {
  'use strict';
  if (typeof render !== 'function') return;

  const CHECK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  const PLUS = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
  const CAM = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>';
  const TAG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.6" cy="8.6" r="1.2"/></svg>';
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
    <div class="pad between" style="padding-top:16px;align-items:center"><b style="font-size:var(--t-m)">Coche les cartes que tu as</b>${free ? `<button class="linkbtn small" data-col="tickall" data-g="-1">${allLabel(m, own)}</button>` : ''}</div>
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
    const p = parseHash().parts;
    if (p[0] === 'revente') {
      app.innerHTML = viewSell(); document.title = tr('À revendre') + ' · CallIt!';
      const t = document.querySelector('.toast[data-sell]'); if (t) t.remove(); // on y est : le message d'alerte n'a plus lieu d'être
      return;
    }
    const si = p[1] != null && /^\d+$/.test(p[1]) ? +p[1] : null, m = si != null ? model(si) : null;
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
      return `<div class="pad col-quick"><b style="font-size:var(--t-m)">Dans ta collection</b><div class="small"><span>${esc(langName(it.lang))}</span> · ${esc(it.grader ? (it.grader + ' ' + (it.grade || '')).trim() : condName(it.cond))} · <button class="linkbtn" data-col="edit" data-id="${esc(it.id)}">Modifier</button></div></div>`;
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
    return `<b style="font-size:var(--t-m)">Valeur jour après jour</b>
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

  /* ---------- 4. Cartes à revendre ---------- */
  // Sur un exemplaire : sell (à revendre) et goal (prix visé pour une carte, dans la devise de saisie it.cur, comme le prix payé).
  // Frais de vente : un pourcentage du prix de vente, réglable (S.sellFee). 5 % au départ : la commission de Cardmarket.
  const fee = () => { const k = +S.sellFee; return S.sellFee != null && S.sellFee !== '' && k >= 0 && k <= 50 ? k : 5; };
  const net = x => x * (1 - fee() / 100);
  const feeTxt = () => fee().toLocaleString(LOCALE) + ' %';
  const goalOf = it => (it.sell && it.goal > 0 ? toUser(curToEur(it.goal, it.cur)) : null); // dans la devise affichée
  const paidOf = it => (it.paid != null ? toUser(ownPaid(it)) : null);
  const stateOf = it => [it.grader ? (it.grader + ' ' + (it.grade || '')).trim() : it.cond, it.rev ? 'reverse' : ''].filter(Boolean).join(' · ');
  const metaOf = (it, c) => [LANG[it.lang] ? LANG[it.lang].short : it.lang, stateOf(it), setName(c.set), (it.qty || 1) > 1 ? it.qty + ' ×' : ''].filter(Boolean).join(' · ');
  const signed = x => { const y = Math.abs(x) < 0.005 ? 0 : x; return (y >= 0 ? '+' : '') + ownMoney(y); };
  // Mes cartes à revendre. est : estimation d'un exemplaire ; gain : ce qu'il resterait de plus que le prix payé, frais déduits ;
  // hit : l'estimation a atteint le prix visé. Celles qui l'ont atteint viennent en premier.
  function sellRows() {
    const out = [];
    for (const it of collection) {
      if (!it.sell) continue; const c = BYKEY.get(it.key); if (!c) continue;
      const e = ownValue(it, c), est = e ? e.u : null, goal = goalOf(it), paid = paidOf(it);
      out.push({ it, c, n: it.qty || 1, est, goal, paid, gain: est != null && paid != null ? net(est) - paid : null, hit: est != null && goal != null && est >= goal - 0.004 });
    }
    return out.sort((a, b) => b.hit - a.hit || (b.est || 0) * b.n - (a.est || 0) * a.n);
  }
  // Alerte : un prix visé atteint se signale jusqu'à ce que la page « À revendre » ait été ouverte (noté sur l'appareil).
  // Si l'estimation repasse sous le prix visé, ou si le prix visé change, la prochaine fois sera signalée de nouveau.
  const fresh = rows => { const seen = load('sellSeen', {}); return rows.filter(r => r.hit && seen[r.it.id] !== r.it.goal); };
  function keepSeen(rows, all) {
    const seen = load('sellSeen', {}), next = {};
    for (const r of rows) if (r.hit && (all || seen[r.it.id] === r.it.goal)) next[r.it.id] = r.it.goal;
    if (JSON.stringify(seen) !== JSON.stringify(next)) save('sellSeen', next);
  }
  const hitTxt = f => (f.length > 1 ? esc(f.length + ' cartes ont atteint ton prix visé') : F('{0} a atteint ton prix visé', esc(cardName(f[0].c))));
  function alertHtml(rows) {
    const f = fresh(rows || sellRows()); if (!f.length) return '';
    return `<a class="col-alert" href="#/revente"><span class="col-dot" aria-hidden="true"></span><b>${hitTxt(f)}</b><span class="col-go">Voir</span></a>`;
  }
  // Une fois par ouverture de l'appli : le message qui prévient
  let warned = false;
  function warn() {
    if (warned) return; warned = true;
    const rows = sellRows(); keepSeen(rows, false);
    const f = fresh(rows); if (!f.length || parseHash().parts[0] === 'revente') return;
    setTimeout(() => {
      if (parseHash().parts[0] === 'revente' || document.querySelector('.col-alert')) return; // la page le dit déjà
      const d = document.createElement('div'); d.innerHTML = hitTxt(f);
      toastAction(d.textContent, 'Voir', () => { location.hash = '#/revente'; });
      const t = document.querySelector('.toast'); if (t) { t.dataset.sell = '1'; clearTimeout(toastT); toastT = setTimeout(() => t.remove(), 8000); } // le temps de le lire
    }, 1200);
  }

  const SELL = { all: false, pre: null };
  function sellLine(r) {
    const { it, c, n, est, goal, paid, gain, hit } = r;
    const sums = [paid != null ? `<span>payé</span> <span class="num">${ownMoney(paid)}</span>` : '<span>prix payé à indiquer</span>', goal != null ? `<span>visé</span> <span class="num">${ownMoney(goal)}</span>` : '<span>pas de prix visé</span>', n > 1 && (paid != null || goal != null) ? '<span>par carte</span>' : ''].filter(Boolean).join(' · ');
    // Mouvement de la cote, le même que sur la fiche de la carte (rien si la cote est peu sûre ou si la carte est gradée)
    const q = PKM && !it.grader ? quote(c) : null, d = q && q.v >= 1 && q.conf > 0 && q.d != null ? q.d : null;
    const more = [hit ? '<span class="rs-hit">Prix visé atteint</span>' : '', d != null ? `<span>${pct(d)} <span>sur 30 j</span></span>` : ''].filter(Boolean).join(' · ');
    return `<button type="button" class="line rs-line" data-col="sellrow" data-id="${esc(it.id)}"><span class="thumb">${cimg(c, { lang: it.lang, it })}</span><span class="mid"><b>${esc(cardName(c))}</b><span>${esc(metaOf(it, c))}</span><span class="rs-m">${sums}</span>${more ? `<span class="rs-m">${more}</span>` : ''}</span><span class="px"><b class="num">${est != null ? ownMoney(est * n) : '—'}</b>${gain != null ? `<span class="${gain > -0.005 ? 'gain' : 'loss'}" style="font-weight:600"><span class="num">${signed(gain * n)}</span> <span>net</span></span>` : ''}</span></button>`;
  }
  function pickLine({ it, c, e }) {
    const paid = paidOf(it);
    return `<button type="button" class="line rs-line" data-col="sellpick" data-id="${esc(it.id)}"><span class="thumb">${cimg(c, { lang: it.lang, it })}</span><span class="mid"><b>${esc(cardName(c))}</b><span>${esc(metaOf(it, c))}</span></span><span class="px"><b class="num">${e ? ownMoney(e.u) : '—'}</b>${paid != null ? `<span><span>payé</span> <span class="num">${ownMoney(paid)}</span></span>` : ''}</span></button>`;
  }
  function viewSell() {
    const rows = sellRows(), top = `<div class="top">${backBtn()}<span class="sub" style="font-weight:600">${G() ? 'Ma collection' : 'Portefeuille'}</span><span style="width:44px"></span></div>
    <div class="pad"><h1 class="title">À revendre</h1><div class="sub" style="margin-top:4px">Tes cartes à vendre : ce qu’elles valent aujourd’hui et ce qu’il t’en resterait.</div></div>`;
    keepSeen(rows, true); // la page est ouverte : les prix visés atteints sont vus
    let value = 0, paid = 0, gain = 0, base = 0, noPaid = 0, cards = 0;
    for (const r of rows) { cards += r.n; if (r.est != null) value += r.est * r.n; if (r.paid == null) noPaid += r.n; else { paid += r.paid * r.n; if (r.est != null) { gain += r.gain * r.n; base += r.paid * r.n; } } }
    const sum = rows.length ? `<div class="pad" style="padding-top:14px"><div class="sub"><span>${nCards(cards)}</span> · <span>estimation du jour</span></div><div class="num" style="font-weight:700;font-size:var(--t-prix);letter-spacing:-.03em">${ownMoney(value)}</div>
    <div class="row" style="gap:18px;margin-top:4px;flex-wrap:wrap;align-items:flex-start">${fee() > 0 ? `<div><div class="small">Après frais de vente</div><b class="num">${ownMoney(net(value))}</b></div>` : ''}<div><div class="small">Payé</div><b class="num">${ownMoney(paid)}</b></div>${base > 0 ? `<div><div class="small">Bénéfice net estimé</div><b class="num ${gain > -0.005 ? 'gain' : 'loss'}">${signed(gain)} · ${gain > -0.005 ? '+' : ''}${Math.round(gain / base * 100) || 0} %</b></div>` : ''}</div>
    ${noPaid ? `<div class="small" style="margin-top:6px">${noPaid > 1 ? noPaid + ' cartes sans prix payé : elles ne comptent pas dans le bénéfice.' : '1 carte sans prix payé : elle ne compte pas dans le bénéfice.'}</div>` : ''}</div>
    <div class="list" style="margin-top:14px">${rows.map(sellLine).join('')}</div>`
      : `<div class="pad" style="margin-top:16px"><div class="panel stack"><b>Aucune carte à revendre pour l’instant</b><div class="sub">Choisis une carte ci-dessous, coche « À revendre » et donne ton prix visé.</div></div></div>`;
    const feeBox = `<div class="pad" style="margin-top:16px"><div class="panel stack" style="gap:8px"><label class="field rs-fee">Frais de vente (%)<input data-col="fee" inputmode="decimal" maxlength="5" autocomplete="off" value="${esc(fee().toLocaleString(LOCALE))}"></label>
    <div class="small" style="line-height:1.45">Compte environ 5 % sur Cardmarket. Sur eBay, un particulier ne paie souvent pas de frais de vente : vérifie pour ton pays. Les frais d’envoi ne sont pas comptés.</div></div></div>`;
    const others = collection.filter(it => !it.sell && BYKEY.has(it.key)).map(it => { const c = BYKEY.get(it.key); return { it, c, e: ownValue(it, c) }; }).sort((a, b) => (b.e ? b.e.u : 0) - (a.e ? a.e.u : 0));
    const shown = SELL.all ? others : others.slice(0, 8);
    const pick = others.length ? `<div class="sect"><h2 class="h2">Ajouter une carte à revendre</h2></div><div class="list">${shown.map(pickLine).join('')}</div>
    ${others.length > shown.length ? `<div class="pad" style="margin-top:14px"><button class="btn" data-col="sellall">Voir toutes mes cartes (${others.length})</button></div>` : ''}`
      : !rows.length ? `<div class="pad" style="margin-top:14px"><a class="btn primary" href="#/recherche">Chercher une carte</a></div>` : '';
    const note = `<div class="pad" style="margin-top:16px"><div class="note">${F('Estimation : cote {0} du jour, ajustée selon l’état et la langue de chaque carte. Tu es prévenu dans l’appli quand elle atteint ton prix visé.', esc(SRC()))}</div></div>`;
    return top + sum + (rows.length ? feeBox : '') + pick + (rows.length ? '' : feeBox) + note + tabs('collection');
  }
  // Fiche d'un exemplaire (app.js) : la case « À revendre », le prix visé et ce qu'il en resterait
  function sellFields(it) {
    const on = !!(it && (it.sell || SELL.pre === it.id)); SELL.pre = null;
    const g = it && it.goal != null ? String(it.cur && it.cur !== userCur() ? Math.round(toUser(curToEur(it.goal, it.cur)) * 100) / 100 : it.goal).replace('.', ',') : '';
    return `<label class="rs-chk"><input type="checkbox" name="sell" ${on ? 'checked' : ''}><span>À revendre</span></label>
  <label class="field" data-show="sell">${esc(F('Prix visé ({0}, facultatif)', userCur()))}<input name="goal" inputmode="decimal" placeholder="ex. 60" value="${esc(g)}"></label>
  <div class="small" data-show="sell" data-sellnote style="line-height:1.45"></div>`;
  }
  // x : l'exemplaire tel que la fiche le décrit (montants dans la devise affichée)
  function sellSync(f, x, c) {
    const on = !!(f.sell && f.sell.checked);
    f.querySelectorAll('[data-show="sell"]').forEach(el => { el.style.display = on ? '' : 'none'; });
    const box = f.querySelector('[data-sellnote]'); if (!box || !on) return;
    const e = ownValue(x, c), est = e ? e.u : null, bits = [];
    if (x.goal > 0) {
      const keep = net(x.goal);
      if (fee() > 0) bits.push(F('Il te resterait {0} après {1} de frais de vente.', `<b class="num">${ownMoney(keep)}</b>`, esc(feeTxt())));
      if (x.paid != null) bits.push(F('Bénéfice : {0} par rapport à ton prix d’achat.', `<b class="num ${keep - x.paid > -0.005 ? 'gain' : 'loss'}">${signed(keep - x.paid)}</b>`));
      if (x.grader) bits.push(esc(F('Carte gradée : l’alerte suit ta propre estimation.')));
      else if (est != null) bits.push(est >= x.goal - 0.004 ? F('L’estimation du jour ({0}) atteint déjà ce prix.', `<span class="num">${ownMoney(est)}</span>`) : F('Estimation du jour : {0}. Tu seras prévenu dans l’appli quand elle atteindra ce prix.', `<span class="num">${ownMoney(est)}</span>`));
    } else bits.push(esc(F('Donne un prix visé pour être prévenu dans l’appli quand l’estimation de ta carte l’atteint.')));
    box.innerHTML = bits.map(b => `<div>${b}</div>`).join('');
  }

  /* ---------- 5. Photographier ma carte ----------
     La photo de MON exemplaire remplace l'image officielle : dans ma collection, sur la page « À revendre » et sur sa fiche.
     Elle reste sur l'appareil (base locale du navigateur) : elle n'est envoyée nulle part, pas même au compte.
     Deux tailles par photo : une petite pour les listes, une grande pour la regarder de près.
     Quand les bords de la carte se voient bien, la photo est remise à plat et recadrée sur la carte (les outils du
     centrage, redresse.js) ; sinon elle est gardée entière. */
  const PH = { ok: typeof indexedDB !== 'undefined', db: null, urls: new Map(), live: new Set(), sheet: null }; // live : photos dont l'exemplaire a été vu dans la collection depuis l'ouverture
  const CARD_R = GAME === 'ygo' ? 86 / 59 : 88 / 63; // hauteur / largeur d'une carte
  // Base locale « callit-photos » : t = petites images, f = grandes ; la clé est l'identifiant de l'exemplaire
  const phOpen = () => PH.db || (PH.db = new Promise((ok, ko) => {
    const r = indexedDB.open('callit-photos', 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('t'); r.result.createObjectStore('f'); };
    r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); r.onblocked = () => ko(new Error('blocked'));
  }));
  const phTx = (mode, fn) => phOpen().then(db => new Promise((ok, ko) => {
    const t = db.transaction(['t', 'f'], mode); t.oncomplete = () => ok(); t.onerror = t.onabort = () => ko(t.error || new Error('idb'));
    fn(t.objectStore('t'), t.objectStore('f'));
  }));
  const phCount = () => save('photos', PH.urls.size); // noté avec les réglages : « Tout effacer » l'enlève, et les photos partent alors aussi
  const phFree = id => { const u = PH.urls.get(id); if (u) URL.revokeObjectURL(u); PH.urls.delete(id); PH.live.delete(id); };
  async function phPut(id, made) {
    await phTx('readwrite', (t, f) => { t.put(made.thumb, id); f.put(made.full, id); });
    phFree(id); PH.urls.set(id, URL.createObjectURL(made.thumb)); PH.live.add(id); phCount();
    // Demande au navigateur de ne pas effacer ces photos s'il manque de place
    if (!PH.asked) { PH.asked = true; try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) {} }
  }
  async function phDel(ids) {
    await phTx('readwrite', (t, f) => { for (const id of ids) { t.delete(id); f.delete(id); } });
    ids.forEach(phFree); phCount();
  }
  const phFull = id => phOpen().then(db => new Promise((ok, ko) => { const r = db.transaction('f').objectStore('f').get(id); r.onsuccess = () => ok(r.result || null); r.onerror = () => ko(r.error); }));
  // À l'ouverture : les petites images sont prêtes pour les listes. Les photos d'exemplaires retirés depuis partent.
  function phStart() {
    if (!PH.ok) return;
    phOpen().then(db => new Promise((ok, ko) => { const t = db.transaction('t'), st = t.objectStore('t'), k = st.getAllKeys(), v = st.getAll(); t.oncomplete = () => ok([k.result, v.result]); t.onerror = t.onabort = () => ko(t.error); }))
      .then(([keys, vals]) => {
        if (!keys.length) return;
        const have = new Set(collection.map(it => it.id)), wiped = load('photos', null) == null, gone = [];
        // Collection vide au démarrage : on ne retire rien (sauf après « Tout effacer »), au cas où elle n'aurait pas pu être lue.
        keys.forEach((id, i) => { if (wiped || (collection.length && !have.has(id))) gone.push(id); else { PH.urls.set(id, URL.createObjectURL(vals[i])); if (have.has(id)) PH.live.add(id); } });
        if (gone.length) phTx('readwrite', (t, f) => { for (const id of gone) { t.delete(id); f.delete(id); } }).catch(() => {});
        phCount();
        if (PH.urls.size && DB && S.face) render(true);
      }).catch(() => { PH.ok = false; });
  }
  // Pendant l'utilisation : un exemplaire retiré (fiche, autre appareil, sauvegarde importée) emporte sa photo.
  // Seulement s'il a été vu dans la collection depuis l'ouverture : une photo gardée par précaution au démarrage n'est pas touchée.
  function phSweep() {
    if (!PH.live.size) return;
    const have = new Set(collection.map(it => it.id)), gone = [...PH.live].filter(id => !have.has(id));
    if (gone.length) phDel(gone).catch(() => {});
  }

  const loadImg = src => new Promise((ok, ko) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => ko(new Error('image')); im.src = src; });
  const toBlob = (cv, q) => new Promise((ok, ko) => cv.toBlob(b => (b ? ok(b) : ko(new Error('image'))), 'image/jpeg', q));
  // Une zone de src (image ou dessin), ramenée à w × h
  function piece(src, w, h, sx, sy, sw, sh) {
    const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(w)); cv.height = Math.max(1, Math.round(h));
    const g = cv.getContext('2d'); g.imageSmoothingQuality = 'high';
    if (sw) g.drawImage(src, sx, sy, sw, sh, 0, 0, cv.width, cv.height); else g.drawImage(src, 0, 0, cv.width, cv.height);
    return cv;
  }
  // La photo choisie, ramenée à 1 600 px au plus (les téléphones en donnent 4 000)
  async function phWork(file) {
    const u = URL.createObjectURL(file);
    try { const im = await loadImg(u), w = im.naturalWidth, h = im.naturalHeight; if (!w || !h) throw new Error('image'); const k = Math.min(1, 1600 / Math.max(w, h)); return piece(im, w * k, h * k); }
    finally { URL.revokeObjectURL(u); }
  }
  // La forme trouvée a-t-elle bien les proportions d'une carte (à 12 % près, pour une photo prise un peu de biais) ?
  // Sinon c'est autre chose (un boîtier de carte gradée, un classeur…) et la remettre à plat la déformerait.
  function cardLike(q, w, h) {
    const P = q.map(([x, y]) => [x * w, y * h]), len = (a, b2) => Math.hypot(a[0] - b2[0], a[1] - b2[1]);
    const k = ((len(P[0], P[3]) + len(P[1], P[2])) / (len(P[0], P[1]) + len(P[3], P[2]))) / CARD_R;
    return k > 0.88 && k < 1.12;
  }
  // Rend la grande et la petite image. cropped : la carte a été trouvée, remise à plat et recadrée.
  async function phMake(work, whole) {
    const R = window.CallItRedresse; let card = null;
    if (!whole && R) {
      try { const im = await loadImg(work.toDataURL('image/jpeg', 0.92)), det = R.detectCorners(im); if (det && det.ok && cardLike(det.q, work.width, work.height)) card = await loadImg(R.warp(im, det.q, 0)); } catch (e) { card = null; }
    }
    let full, thumb;
    if (card) {
      const w = Math.min(800, card.naturalWidth), h = w * card.naturalHeight / card.naturalWidth;
      full = piece(card, w, h); thumb = piece(card, 360, 360 * h / w);
    } else {
      const k = Math.min(1, 1200 / Math.max(work.width, work.height)); full = piece(work, work.width * k, work.height * k);
      const cw = Math.min(work.width, work.height / CARD_R), ch = cw * CARD_R; // la petite : le milieu de la photo, au format d'une carte
      thumb = piece(work, 360, 360 * CARD_R, (work.width - cw) / 2, (work.height - ch) / 2, cw, ch);
    }
    return { full: await toBlob(full, 0.85), thumb: await toBlob(thumb, 0.8), cropped: !!card };
  }

  // Le bloc photo de la fiche d'un exemplaire (app.js). Pour un nouvel exemplaire, la photo attend que la fiche soit validée.
  const PH_KEPT = 'Ta photo remplace l’image officielle dans ta collection. Elle reste sur cet appareil.';
  function photoField(it, c) {
    if (!PH.ok) return '';
    if (PH.sheet && PH.sheet.url) URL.revokeObjectURL(PH.sheet.url);
    PH.sheet = { id: it ? it.id : null, c, lang: it ? it.lang : null, before: new Set(collection.map(x => x.id)), made: null, url: null, work: null, busy: false, changed: false, hooked: false, closed: false, to: null, msg: '', err: false };
    return `<div class="ph-box" data-ph>${phInner()}</div>`;
  }
  function phInner() {
    const s = PH.sheet, u = s.url || (s.id && PH.urls.get(s.id)) || '';
    const pick = (label, cam) => `<label class="btn small">${cam ? icon('camera', 16) : ''}<span>${label}</span><input type="file" accept="image/*"${cam ? ' capture="environment"' : ''} class="sr" data-col="photo"></label>`;
    const left = u ? `<button type="button" class="ph-thumb" data-col="phzoom" aria-label="Agrandir la photo"><span class="cimg own"><img src="${esc(u)}" alt=""></span></button>` : `<span class="ph-thumb">${cimg(s.c, s.lang ? { lang: s.lang } : {})}</span>`;
    const msg = `<div class="small${s.err ? ' ph-err' : ''}" role="status">${esc(s.msg || PH_KEPT)}</div>`;
    if (s.busy) return `${left}<div class="ph-side"><div class="small" role="status">Préparation de la photo…</div></div>`;
    if (!u) return `${left}<div class="ph-side"><div class="row ph-btns">${pick('Photographier ma carte', true)}${pick('Choisir dans la galerie', false)}</div>${msg}</div>`;
    return `${left}<div class="ph-side"><b>Ma photo</b>${msg}<div class="row ph-btns">${pick('Changer la photo', false)}<button type="button" class="btn small" data-col="phdel">Retirer la photo</button></div>${s.work ? '<button type="button" class="ph-link" data-col="phwhole">Garder la photo entière</button>' : ''}</div>`;
  }
  const phBox = () => document.querySelector('dialog.sheet [data-ph]');
  const phPaint = () => { const box = phBox(); if (box) box.innerHTML = phInner(); };
  // Quand la fiche se ferme : la photo d'un nouvel exemplaire le rejoint s'il a été ajouté ; l'écran derrière se met à jour.
  function phHook() {
    const s = PH.sheet, box = phBox(), d = box && box.closest('dialog'); if (!d || s.hooked) return; s.hooked = true;
    d.addEventListener('close', () => {
      const nu = d.returnValue === 'ok' && !s.id ? collection.find(x => x.key === s.c.key && !s.before.has(x.id)) : null, made = s.made;
      s.closed = true; s.to = d.returnValue === 'delete' ? null : s.id || (nu && nu.id) || null; // l'exemplaire qui garde la photo, s'il existe
      if (s.url) { URL.revokeObjectURL(s.url); s.url = null; }
      s.made = s.work = null;
      if (nu && made) phPut(nu.id, made).then(() => render(true), () => toast('La photo n’a pas pu être gardée sur cet appareil'));
      else if (s.changed && s.to && d.returnValue !== 'ok') render(true); // fiche validée : app.js vient déjà de refaire l'écran
    });
  }
  // Garde la photo préparée : tout de suite pour un exemplaire qui existe, en attente pour un nouveau.
  // Si la fiche s'est refermée pendant la préparation, la photo rejoint quand même son exemplaire.
  async function phKeep(s, made, work) {
    if (s.closed) { if (s.to) { await phPut(s.to, made); render(true); } return; }
    if (s.id) await phPut(s.id, made);
    else { if (s.url) URL.revokeObjectURL(s.url); s.made = made; s.url = URL.createObjectURL(made.thumb); }
    s.work = made.cropped ? work : null; s.changed = true; s.err = false;
    s.msg = made.cropped ? 'Photo remise à plat et recadrée sur la carte.' : work && window.CallItRedresse ? 'Bords de la carte pas trouvés : la photo est gardée entière. Sur un fond uni, elle se recadre toute seule.' : '';
  }
  // job(s, saving) prépare puis garde la photo ; saving() est appelé quand l'image est lue et qu'il ne reste qu'à la garder
  async function phRun(job) {
    const s = PH.sheet; if (!s || s.busy) return;
    phHook(); s.busy = true; phPaint();
    let read = false;
    try { await job(s, () => { read = true; }); }
    catch (e) { s.err = true; s.msg = read ? 'La photo n’a pas pu être gardée sur cet appareil.' : 'Cette image n’a pas pu être lue.'; if (s.closed) toast(read ? 'La photo n’a pas pu être gardée sur cet appareil' : 'Cette image n’a pas pu être lue'); }
    s.busy = false; if (PH.sheet === s && !s.closed) phPaint();
  }
  // Une carte gradée est dans un boîtier, plus haut qu'une carte : sa photo est gardée entière.
  const phGraded = () => { const box = phBox(), f = box && box.closest('form'); return !!(f && f.grader && f.grader.value); };
  const phPick = file => phRun(async (s, saving) => { const whole = phGraded(), work = await phWork(file), made = await phMake(work, whole); saving(); await phKeep(s, made, whole ? null : work); });
  const phWhole = () => { const work = PH.sheet && PH.sheet.work; if (work) phRun(async (s, saving) => { const made = await phMake(work, true); saving(); await phKeep(s, made, null); }); };
  function phRemove() {
    const s = PH.sheet; if (!s || s.busy) return;
    phHook(); s.changed = true; s.work = null; s.msg = ''; s.err = false;
    if (s.url) { URL.revokeObjectURL(s.url); s.url = null; } s.made = null;
    if (s.id && PH.urls.has(s.id)) phDel([s.id]).then(phPaint, phPaint); else phPaint();
  }
  // La photo en grand, par-dessus la fiche ; un appui la referme
  async function phZoom() {
    const s = PH.sheet; if (!s) return;
    let blob = s.made ? s.made.full : null;
    if (!blob && s.id) { try { blob = await phFull(s.id); } catch (e) { blob = null; } }
    if (!blob) return;
    const u = URL.createObjectURL(blob), d = document.createElement('dialog'); d.className = 'ph-view';
    d.innerHTML = `<form method="dialog"><button class="ph-view-in" aria-label="Fermer"><img src="${esc(u)}" alt=""></button></form>`;
    document.body.appendChild(d); d.addEventListener('close', () => { URL.revokeObjectURL(u); d.remove(); }); d.showModal();
  }
  // Une image de carte (cimg, app.js) : la photo de cet exemplaire, s'il en a une
  const photo = (it, c, o) => { const u = it && PH.urls.get(it.id); return u ? `<div class="cimg own"><img loading="${o && o.eager ? 'eager' : 'lazy'}" decoding="async" alt="${esc(cardName(c))}" src="${esc(u)}">${o && o.badge ? `<span class="badge">${esc(o.badge)}</span>` : ''}</div>` : ''; };

  /* ---------- Morceaux de page demandés par app.js ---------- */
  window.CallItCollection = {
    // Portefeuille et Ma collection : ajouter une carte (recherche), scanner son album à la suite (Pokémon), ajouter un set
    tools: () => {
      const rows = hasCards() ? sellRows() : null, al = rows ? alertHtml(rows) : '';
      return `<div class="pad col-tools"><a class="btn small" href="#/recherche" data-col="addcard">${PLUS}<span>Ajouter une carte</span></a>${PKM ? `<a class="btn small" href="#/scan">${CAM}<span>${esc(F('Scanner mon album'))}</span></a>` : ''}<a class="btn small" href="#/set">${PLUS}<span>Ajouter un set</span></a>${typeof revExtra === 'function' ? revExtra('careBtn') : ''}${rows ? `<a class="btn small" href="#/revente">${TAG}<span>À revendre</span>${rows.length ? `<span class="num">(${rows.length})</span>` : ''}</a>` : ''}</div>${al ? `<div class="pad" style="padding-top:10px">${al}</div>` : ''}`;
    },
    // Accueil Marché : un prix visé vient d'être atteint
    alert: () => { const al = hasCards() ? alertHtml() : ''; return al ? `<div style="margin:10px 0 2px">${al}</div>` : ''; },
    // Fiche d'un exemplaire : « À revendre » et prix visé
    sellFields, sellSync,
    // Fiche d'un exemplaire : sa photo ; et partout où une image de carte est dessinée pour un exemplaire
    photoField, photo,
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
    else if (a === 'addcard') setTimeout(() => { const q = document.getElementById('q'); if (q) q.focus(); }, 120); // la recherche s'ouvre prête à taper le nom
    else if (a === 'edit' || a === 'sellrow') { const it = collection.find(x => x.id === el.dataset.id); if (it) openItemSheet(it.key, it.id); }
    else if (a === 'sellpick') { const it = collection.find(x => x.id === el.dataset.id); if (it) { SELL.pre = it.id; openItemSheet(it.key, it.id); } } // la fiche s'ouvre avec « À revendre » coché
    else if (a === 'sellall') { SELL.all = true; redraw('[data-col="sellall"]'); }
    else if (a === 'phdel') phRemove();
    else if (a === 'phwhole') phWhole();
    else if (a === 'phzoom') phZoom();
  });
  document.addEventListener('change', e => {
    const a = e.target.dataset && e.target.dataset.col;
    if (a === 'lang') { SET.lang = e.target.value; draw(); }           // les images passent dans la langue choisie
    else if (a === 'cond') { SET.cond = e.target.value; refresh(); }   // seule la valeur estimée change
    else if (a === 'photo') { const file = e.target.files && e.target.files[0]; e.target.value = ''; if (file) phPick(file); }
    else if (a === 'fee') { // frais de vente : un pourcentage entre 0 et 50
      const k = parseFloat(String(e.target.value).replace(/\s/g, '').replace(',', '.'));
      if (k >= 0 && k <= 50) { S.sellFee = Math.round(k * 10) / 10; saveS(); }
      redraw('[data-col="fee"]');
    }
  });
  document.addEventListener('input', e => {
    if (e.target.id !== 'colq') return;
    SET.q = e.target.value; const box = document.getElementById('col-sets'); if (box) box.innerHTML = setsBody();
  });

  /* ---------- Branchement dans l'appli ---------- */
  const mine = () => { const r = parseHash().parts[0]; return r === 'set' || r === 'revente'; };
  const baseRender = render;
  render = function (keepFocus) {
    if (DB && S.face) warn();
    phSweep();
    if (DB && S.face && mine()) { document.body.dataset.face = G() ? 'galerie' : 'marche'; draw(); return; }
    baseRender(keepFocus);
  };
  // Les cartes ont pu finir de charger avant ce fichier : on refait alors l'affichage
  if (DB && S.face) render();
  phStart();
})();
