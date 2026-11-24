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
  const L = Object.assign({ cond: 'NM', graded: false, grader: 'PSA', grade: '10', reverse: false, zone: null, compact: false,
    blocks: BLOCKS.map(([id]) => [id, true]) }, load('live', {}));
  for (const [id] of BLOCKS) if (!L.blocks.some(b => b[0] === id)) L.blocks.push([id, true]);
  L.blocks = L.blocks.filter(b => BLOCKS.some(x => x[0] === b[0]));
  const saveL = () => save('live', L);
  let recent = load('liveRecent', []); // [{key, lang}]
  const st = { alts: [], key: null, lang: null, q: '', results: [], scan: null, livePrice: '', custom: false, picking: null };

  /* ---------- Estimation du prix ---------- */
  // Cardmarket donne une cote unique, surtout faite de ventes en très bon état (NM).
  // La décote par état est une RÈGLE GÉNÉRALE du marché, pas des ventes réelles : affichée comme « estimation ».
  const COND_K = { MT: 1, NM: 1, EX: 0.85, GD: 0.72, LP: 0.6, PL: 0.45, PO: 0.3 };
  // Gradées : aucune vente gradée dans nos données pour l'instant. Fourchette large, présentée comme un ordre de grandeur.
  const GRADES = ['10', '9.5', '9', '8', '7', '6'];
  const GRADE_K = { '10': [2.5, 6], '9.5': [1.8, 3.5], '9': [1.3, 2.2], '8': [1, 1.5], '7': [0.8, 1.2], '6': [0.55, 1] };
  const GRADER_K = { PSA: 1, BGS: 1, CGC: 0.85, PCA: 0.6, 'AP Grading': 0.6, Autre: 0.6 };
  // Langue : la cote Cardmarket mélange toutes les langues. Écart habituel du marché européen par rapport à ce mélange :
  // l'anglais se vend plus cher, les langues moins demandées moins cher (écart plus fort sur les cartes anciennes).
  // RÈGLE APPROXIMATIVE, affichée comme estimation, en attendant les vrais prix par langue tirés des ventes eBay.
  const LANG_K = { en: 1.15, de: 0.95, fr: 0.85, it: 0.8, es: 0.8, pt: 0.75, ja: 1, ko: 0.7, 'zh-tw': 0.7, 'zh-cn': 0.6, th: 0.5, id: 0.5 };
  const LANG_K_OLD = { en: 1.25, de: 0.75, fr: 0.7, it: 0.6, es: 0.6, pt: 0.5 };
  const langK = (c, l) => (!l ? 1 : (isVintage(c) && LANG_K_OLD[l]) || LANG_K[l] || 1);
  const pos = v => (v != null && v > 0 ? v : null);

  // Prix de référence : la MOYENNE SUR 30 JOURS (résiste à un prix gonflé sur une journée), sinon tendance, sinon prix bas.
  function basePrice(c) {
    if (!c.p) return null;
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
    if (lk !== 1) b = { v: b.v * lk, src: b.src, lang: true, raw: b.v };
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
    const a30 = pos(pf(c, 'avg30')), tr = pos(pf(c, 'trend')), a7 = pos(pf(c, 'avg7'));
    if (!a30) return '';
    const d = Math.max(tr ? tr / a30 - 1 : 0, a7 ? a7 / a30 - 1 : 0), m = Math.min(tr ? tr / a30 - 1 : 0, a7 ? a7 / a30 - 1 : 0);
    if (d >= 0.3) return `Prudence : le prix a monté de ${Math.round(d * 100)} % par rapport à la moyenne 30 jours (emballement ou prix gonflé ?). La moyenne sert de référence.`;
    if (m <= -0.3) return `Le prix a baissé de ${Math.round(-m * 100)} % par rapport à la moyenne 30 jours.`;
    return '';
  }

  /* ---------- Petites fonctions ---------- */
  const card = () => (st.key ? BYKEY.get(st.key) : null);
  const condName = k => (CONDS.find(x => x[0] === k) || ['', k])[1];
  const parseNum = s => { const v = parseFloat(String(s).replace(/\s/g, '').replace(',', '.')); return isNaN(v) ? null : v; };
  function pick(key, lang) {
    st.key = key; st.lang = lang || null; st.livePrice = ''; st.results = []; st.picking = null; st.alts = (st.alts || []).filter(k => k !== key);
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
    if (h && h.length >= 5) return { pts: h, label: h.length + ' derniers jours relevés par CallIt!' };
    const now = Date.now();
    const pts = [[30, 'moy. 30 j', pf(c, 'avg30')], [7, 'moy. 7 j', pf(c, 'avg7')], [1, 'hier', pf(c, 'avg1')], [0, 'auj.', pf(c, 'trend')]]
      .filter(x => x[2] > 0).map(x => [new Date(now - x[0] * 864e5), x[2], x[1]]);
    return { pts, label: 'Moyennes ' + SRC() + ' sur 30 jours' };
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
      <form class="lv-search" data-lv-form="1" autocomplete="off"><input id="lvq" type="search" enterkeyhint="search" placeholder="Nom ou numéro (ex. Dracaufeu 4/102)" aria-label="Chercher la carte montrée dans le live" value="${esc(st.q)}"></form>
      <div class="lv-scan" id="lv-scan"></div>
      <div id="lv-body"></div>
    </div>`;
  }
  function scanBar() {
    const s = st.scan;
    const btns = `<div class="lv-btns">
      ${canScreen() ? (scr ? `<button type="button" class="btn small primary" data-lv="grab" title="Raccourci : touche Espace">${icon('camera', 16)} Lire l'écran</button><button type="button" class="btn small" data-lv="zone">${L.zone ? 'Changer la zone' : 'Choisir la zone'}</button><button type="button" class="btn small" data-lv="stop">Arrêter</button>`
        : `<button type="button" class="btn small primary" data-lv="share" title="Tu choisis l'onglet du live ; rien n'est lu tant que tu ne cliques pas">${icon('camera', 16)} Connecter l'écran du live</button>`) : ''}
      <label class="btn small${canScreen() ? '' : ' primary'}" for="lvcam" role="button">${icon('camera', 16)} Photo</label><input type="file" accept="image/*" capture="environment" id="lvcam" hidden>
      <label class="btn small" for="lvshot" role="button">Capture d'écran</label><input type="file" accept="image/*" id="lvshot" hidden></div>`;
    let msg = '';
    if (s && s.status === 'lecture') msg = `<div class="small">Lecture de la carte… ${s.first ? '(la première fois, l’outil se télécharge : quelques secondes)' : ''}</div>`;
    else if (s && s.status === 'erreur') msg = `<div class="small">${esc(s.text)}</div>`;
    else if (s && s.status === 'rien') msg = `<div class="small">Aucune carte reconnue. ${scr ? 'Tape le nom juste au-dessus (le curseur y est déjà), ou resserre la zone autour de la carte.' : 'Tape le nom juste au-dessus (le curseur y est déjà), ou reprends la photo avec le numéro bien lisible.'}</div>`;
    else if (scr && !L.zone) msg = `<div class="small">Astuce : « Choisir la zone » une fois, autour de l’endroit où le vendeur montre la carte. Ensuite, un clic suffit.</div>`;
    else if (!scr && canScreen() && !st.key) msg = `<div class="small">Partage l’onglet du live une fois : CallIt! ne lit l’écran que quand tu cliques sur « Lire l’écran ». Rien n’est envoyé, rien ne se connecte à eBay.</div>`;
    return btns + msg + (st.picking ? zonePicker() : '') + (s && s.preview && !st.picking ? `<img class="lv-prev" src="${s.preview}" alt="Zone lue">` : '');
  }
  function body() {
    if (st.custom) return customPanel();
    const q = st.q.trim();
    let out = '';
    const list = st.results.length ? st.results : (q.length >= 2 && !st.key ? find(q) : []);
    if (list.length) out += `<div class="lv-list">${list.map(c => `<button type="button" class="line lv-res" data-lv="pick" data-v="${esc(c.key)}"><span class="thumb">${cimg(c)}</span><span class="mid"><b>${esc(cardName(c))}</b><span>${esc(setName(c.set))} · ${esc(numLabel(c))}${year(c.set) ? ' · ' + year(c.set) : ''}</span></span><span class="px"><b class="num">${basePrice(c) ? eur(basePrice(c).v) : '—'}</b></span></button>`).join('')}</div>`;
    else if (q.length >= 2 && !st.key) out += `<div class="note">Aucune carte trouvée pour « ${esc(q)} ».</div>`;
    const c = card();
    if (c && !list.length && st.alts && st.alts.length) out += `<div class="lv-alts"><span class="small">Pas celle-ci ?</span>${st.alts.map(k => { const x = BYKEY.get(k); return x ? `<button type="button" class="chip" data-lv="pick" data-v="${esc(k)}">${esc(cardName(x))} · ${esc(setName(x.set))} ${esc(numLabel(x))}</button>` : ''; }).join('')}</div>`;
    if (c && !list.length) out += L.blocks.filter(b => b[1]).map(([id]) => blockHtml(id, c)).join('');
    if (!c && !list.length && !q) out += recent.length ? `<div class="small" style="margin:10px 2px 6px;font-weight:600">Vues récemment</div><div class="chips">${recent.map(r => { const x = BYKEY.get(r.key); return x ? `<button type="button" class="chip" data-lv="pick" data-v="${esc(r.key)}">${esc(cardName(x))} · ${esc(numLabel(x))}</button>` : ''; }).join('')}</div>`
      : `<div class="note">Tape le nom de la carte montrée, prends-la en photo ou lis l’écran du live : sa cote s’affiche tout de suite, selon l’état ou la gradation que tu choisis.</div>`;
    return out;
  }
  function blockHtml(id, c) {
    const e = estimate(c);
    if (id === 'carte') return `<div class="lv-card"><div class="lv-img">${cimg(c, { lang: st.lang || undefined })}</div><div style="min-width:0;flex:1"><b class="lv-name">${esc(cardName(c, st.lang || undefined))}</b><div class="small">${esc(setName(c.set))} · ${esc(numLabel(c))}${year(c.set) ? ' · ' + year(c.set) : ''}${rarFr(c) ? ' · ' + esc(rarFr(c)) : ''}</div>
      <div class="row" style="gap:10px;margin-top:6px;flex-wrap:wrap"><button type="button" class="linkbtn" data-lv="fiche">Fiche complète</button><button type="button" class="linkbtn" data-lv="wish">${wished(c.key) ? 'Dans mes envies ✓' : '+ Mes envies'}</button><button type="button" class="linkbtn" data-lv="clear">Autre carte</button></div></div></div>`;
    if (id === 'prix') {
      // Deux choix indépendants : la VERSION (normale ou reverse/holo, si elle existe) et la CONSERVATION (brute ou gradée)
      const hasRev = pos(pf(c, 'trendHolo'));
      const condChips = `${hasRev ? `<div class="chips lv-chips"><span class="small lv-lab">Version</span>${B(!L.reverse, 'norm', '', 'Normale')}${B(L.reverse, 'rev', '', 'Reverse / holo')}</div>` : ''}
        <div class="chips lv-chips"><span class="small lv-lab">Carte</span>${B(!L.graded, 'raw', '', 'Brute')}${B(L.graded, 'gradee', '', 'Gradée')}</div>
        ${L.graded ? `<div class="chips lv-chips">${GRADERS.filter(g => g !== 'Autre').map(g => B(L.grader === g, 'grader', g, esc(g))).join('')}</div><div class="chips lv-chips">${GRADES.map(g => B(L.grade === g, 'grade', g, g === '6' ? '6 et moins' : g.replace('.', ','))).join('')}</div>`
        : `<div class="chips lv-chips">${CONDS.map(([k, n]) => B(L.cond === k, 'cond', k, k, `title="${esc(n)}"`)).join('')}</div>`}
        ${c.langs && c.langs.length > 1 ? `<div class="chips lv-chips lv-langs"><span class="small lv-lab">Langue</span>${B(!st.lang, 'lang', '', 'Toutes')}${c.langs.map(l => B(st.lang === l, 'lang', l, (LANG[l] || { short: l }).short, `title="${esc((LANG[l] || { name: l }).name)}"`)).join('')}</div>` : ''}`;
      if (!e) return `<div class="lv-block">${condChips}<div class="note" style="margin-top:8px">Pas encore de cote ${esc(SRC())} pour cette carte${c.cml ? ` (la version la moins chère de cette carte est à ${eur(c.cml)})` : ''}.</div></div>`;
      const what = [L.cond !== 'NM' && L.cond !== 'MT' ? 'état ' + condName(L.cond) : '', st.lang ? 'version ' + (LANG_OF[st.lang] || st.lang) : ''].filter(Boolean).join(', ');
      const tag = e.kind === 'cote' ? `Cote ${esc(SRC())}, ${esc(e.base.src)}, toutes langues` : e.kind === 'estim' ? `Estimation : ${esc(what)} (règles générales du marché)` : `Ordre de grandeur ${esc(L.grader)} ${esc(L.grade.replace('.', ','))}, pas encore de ventes gradées dans CallIt!`;
      const big = e.kind === "ordre" ? `<span class="lv-range">${eur(e.lo)} – ${eur(e.hi)}</span>` : eur(e.mid);
      const al = alertOf(c);
      const ebay = `https://www.ebay.${(COUNTRY[S.country] || COUNTRY.FR).ebay}/sch/i.html?_nkw=${encodeURIComponent((PKM ? cardName(c, st.lang || undefined) + ' ' + numLabel(c) : (c.n.en || cardName(c)) + ' ' + c.num) + (L.graded ? ' ' + L.grader + ' ' + L.grade : ''))}&LH_Sold=1&LH_Complete=1`;
      return `<div class="lv-block">${condChips}
        <div class="lv-price"><div class="lv-big num">${big}</div><div class="small">${tag}</div></div>
        <div class="lv-mini"><span>Moy. 30 j <b class="num">${eur(pos(pf(c, 'avg30')))}</b></span><span>Moy. 7 j <b class="num">${eur(pos(pf(c, 'avg7')))}</b></span><span>Auj. <b class="num">${eur(pos(pf(c, 'trend')))}</b></span><span>Bas <b class="num">${eur(pos(pf(c, 'low')))}</b></span></div>
        ${al ? `<div class="lv-alert">${esc(al)}</div>` : ''}
        ${e.kind !== 'cote' ? `<div class="small" style="margin-top:6px">${e.kind === 'ordre' ? (e.base.v < 10 ? 'Carte à petit prix : gradée, elle vaut surtout le coût de la gradation, la fourchette est peu fiable. ' : '') + 'Les vraies ventes gradées arriveront avec l’accès eBay. ' : 'Base : ' + esc(e.base.src) + ' ' + eur(e.base.lang ? e.base.raw : e.base.v) + ', toutes langues' + (e.base.lang ? ' ; écart de langue approximatif, les vrais prix par langue viendront des ventes eBay' : '') + '. '}<a href="${ebay}" target="_blank" rel="noopener">Ventes terminées sur eBay</a> (lien externe, sans commission).</div>` : `<div class="small" style="margin-top:6px">${esc(SRC())}, toutes langues · <a href="${ebay}" target="_blank" rel="noopener">ventes terminées sur eBay</a> (lien externe, sans commission)</div>`}
      </div>`;
    }
    if (id === 'live') {
      const v = parseNum(st.livePrice); let verdict = '';
      if (v != null && e) {
        const ref = toUser(e.mid), d = v / ref - 1;
        const [txt, cls] = d <= -0.2 ? ['Bonne affaire', 'gain'] : d <= 0.02 ? ['Prix correct', 'gain'] : d <= 0.15 ? ['Un peu cher', ''] : ['Cher', 'loss'];
        verdict = `<div class="lv-verdict ${cls}"><b>${txt}</b> · ${d >= 0 ? '+' : ''}${Math.round(d * 100)} % par rapport à ${e.kind === 'ordre' ? 'la fourchette (milieu)' : 'la cote'}</div>`;
      }
      return `<div class="lv-block"><label class="field">Enchère ou prix du live (${esc(userCur())})<input id="lvlp" inputmode="decimal" placeholder="tape le prix annoncé" value="${esc(st.livePrice)}"></label><div id="lv-verdict">${verdict}</div></div>`;
    }
    if (id === 'courbe') {
      const { pts, label } = curvePts(c);
      if (pts.length < 2) return '';
      return `<div class="lv-block lv-curve"><div class="small">${esc(label)}</div>${lineChart(pts, 'Courbe des prix')}</div>`;
    }
    if (id === 'collection') {
      const own = collection.filter(it => it.key === c.key);
      const n = own.reduce((s, it) => s + (it.qty || 1), 0);
      return `<div class="lv-block"><div class="between"><b style="font-size:14px">Dans ma collection</b><button type="button" class="linkbtn" data-lv="add">+ Ajouter</button></div><div class="small" style="margin-top:2px">${n ? n + ' exemplaire' + (n > 1 ? 's' : '') + ' : ' + esc(own.map(it => ((LANG[it.lang] || {}).short || it.lang || '') + ' ' + (it.grader ? it.grader + ' ' + (it.grade || '') : it.cond)).join(', ')) : 'Tu ne l’as pas encore.'}${wished(c.key) && wished(c.key).max != null ? ' · prix max de ton envie : ' + money(wished(c.key).max) : ''}</div></div>`;
    }
    return '';
  }
  function customPanel() {
    return `<div class="lv-block"><div class="between"><b>Ce que la fenêtre affiche</b><button type="button" class="btn small primary" data-lv="custom">OK</button></div>
      <div class="lv-list" style="margin-top:8px">${L.blocks.map(([id, on], i) => `<div class="line"><label class="mid row" style="gap:8px"><input type="checkbox" data-lv-block="${id}" ${on ? 'checked' : ''}> ${esc(BLOCKS.find(b => b[0] === id)[1])}</label><button type="button" class="iconbtn sm" data-lv="up" data-v="${i}" aria-label="Monter" ${i ? '' : 'disabled'}>↑</button><button type="button" class="iconbtn sm" data-lv="down" data-v="${i}" aria-label="Descendre" ${i < L.blocks.length - 1 ? '' : 'disabled'}>↓</button></div>`).join('')}</div>
      <label class="row small" style="gap:8px;margin-top:10px"><input type="checkbox" data-lv-compact="1" ${L.compact ? 'checked' : ''}> Affichage serré (petite fenêtre)</label></div>`;
  }

  /* ---------- Dessin (sans toucher au champ de recherche, pour ne pas perdre la saisie) ---------- */
  let root = null;
  function draw() {
    if (!root) return;
    root.classList.toggle('compact', !!L.compact);
    const sc = root.querySelector('#lv-scan'), bd = root.querySelector('#lv-body');
    if (sc) sc.innerHTML = scanBar();
    if (bd) bd.innerHTML = body();
    if (st.picking) setupPicker();
  }
  function mount(target) {
    target.innerHTML = shell(); root = target.querySelector('#live-root'); bind(root); draw();
  }

  /* ---------- Écran partagé : on ne prend une image QUE sur clic ---------- */
  let scr = null, scrVideo = null;
  async function share() {
    try {
      scr = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 5 }, audio: false, selfBrowserSurface: 'exclude', surfaceSwitching: 'include' });
      const tr = scr.getVideoTracks()[0];
      tr.addEventListener('ended', () => { scr = null; scrVideo = null; draw(); });
      scrVideo = document.createElement('video'); scrVideo.muted = true; scrVideo.playsInline = true; scrVideo.srcObject = scr; await scrVideo.play().catch(() => {});
      toast('Écran connecté. Clique sur « Lire l’écran » quand la carte est montrée.');
    } catch (e) { scr = null; }
    draw();
  }
  function stopShare() { if (scr) scr.getTracks().forEach(t => t.stop()); scr = null; scrVideo = null; draw(); }
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
  async function readImage(src, zone) {
    st.scan = { status: 'lecture', first: !ocrReady }; st.results = []; draw();
    try {
      const cv = prep(src, zone);
      const prev = document.createElement('canvas'); const pk = Math.min(1, 360 / cv.width); prev.width = Math.round(cv.width * pk); prev.height = Math.round(cv.height * pk); prev.getContext('2d').drawImage(cv, 0, 0, prev.width, prev.height);
      const w = await getOcr(); ocrReady = true;
      const { data } = await w.recognize(cv);
      const m = matchScan(data.text || '');
      if (!m.results.length) {
        // Rien trouvé : on bascule tout de suite sur la recherche, avec le numéro lu s'il y en a un (le plus fiable)
        st.scan = { status: 'rien', preview: prev.toDataURL('image/jpeg', 0.7) }; st.key = null;
        st.q = m.nums && m.nums[0] ? m.nums[0][0] + '/' + m.nums[0][1] + ' ' : '';
        draw(); const qi = root && root.querySelector('#lvq'); if (qi) { qi.value = st.q; qi.focus(); qi.setSelectionRange(qi.value.length, qi.value.length); }
        return;
      }
      st.scan = { status: 'fini', preview: prev.toDataURL('image/jpeg', 0.7) };
      st.q = ''; const qi = root && root.querySelector('#lvq'); if (qi) qi.value = '';
      // La plus probable s'affiche tout de suite ; les autres restent à un clic (« Pas celle-ci ? »)
      pick(m.results[0].key); st.alts = m.results.slice(1, 6).map(c => c.key); draw();
    } catch (e) { st.scan = { status: 'erreur', text: 'La lecture n’a pas marché. Réessaie, ou tape le nom.' }; draw(); }
  }
  async function grab() {
    const f = await frame(); if (!f) { toast('Écran non disponible : reconnecte-le'); return; }
    readImage(f, L.zone);
  }
  function fileToImage(file) {
    return new Promise((ok, ko) => { const img = new Image(); img.onload = () => { ok(img); setTimeout(() => URL.revokeObjectURL(img.src), 1000); }; img.onerror = ko; img.src = URL.createObjectURL(file); });
  }

  /* ---------- Choix de la zone : on trace un rectangle sur une image de l'écran ---------- */
  function zonePicker() {
    return `<div class="lv-zone"><div class="small" style="font-weight:600">Trace un rectangle autour de l’endroit où la carte apparaît, puis valide.</div>
      <div class="lv-zwrap"><canvas id="lvzc"></canvas><div class="lv-zrect" hidden></div></div>
      <div class="row" style="gap:8px"><button type="button" class="btn small primary" data-lv="zoneok">Valider</button><button type="button" class="btn small" data-lv="zoneall">Tout l’écran</button><button type="button" class="btn small" data-lv="zonecancel">Annuler</button></div></div>`;
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
      else if (a === 'pick') { const x = BYKEY.get(v); if (x) pick(v); }
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
      else if (a === 'zoneok') { const z = st.picking && st.picking.zone; if (z && z.w > 0.02 && z.h > 0.02) { L.zone = z; saveL(); } st.picking = null; draw(); toast('Zone enregistrée'); }
      else if (a === 'zoneall') { L.zone = null; saveL(); st.picking = null; draw(); }
      else if (a === 'zonecancel') { st.picking = null; draw(); }
    });
    el.addEventListener('input', ev => {
      const t = ev.target;
      if (t.id === 'lvq') { st.q = t.value; st.key = null; st.results = []; st.scan = null; st.alts = []; clearTimeout(tq); tq = setTimeout(draw, 120); }
      else if (t.id === 'lvlp') { st.livePrice = t.value; const c = card(); const box = el.querySelector('#lv-verdict'); if (c && box) { const tmp = document.createElement('div'); tmp.innerHTML = blockHtml('live', c); const nv = tmp.querySelector('#lv-verdict'); box.innerHTML = nv ? nv.innerHTML : ''; } }
    });
    el.addEventListener('change', ev => {
      const t = ev.target;
      if ((t.id === 'lvcam' || t.id === 'lvshot') && t.files[0]) { const f = t.files[0]; t.value = ''; fileToImage(f).then(img => readImage(img, null)).catch(() => toast('Image illisible')); }
      else if (t.dataset.lvBlock) { const b = L.blocks.find(x => x[0] === t.dataset.lvBlock); if (b) { b[1] = t.checked; saveL(); } }
      else if (t.dataset.lvCompact) { L.compact = t.checked; saveL(); draw(); }
    });
    el.addEventListener('submit', ev => {
      if (!ev.target.dataset.lvForm) return; ev.preventDefault();
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

  /* ---------- Branchement dans l'appli ---------- */
  const isLive = () => (location.hash.replace(/^#\/?/, '').split(/[/?]/)[0] === 'live');
  const LIVE_ICON = '<span class="lv-dot"></span>';
  const baseRender = render;
  render = function (keepFocus) {
    if (DB && isLive()) {
      document.body.dataset.face = G() ? 'galerie' : 'marche';
      document.title = 'Live · CallIt!';
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
