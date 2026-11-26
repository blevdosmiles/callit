/* CallIt! · Scan en continu : la caméra reste ouverte, on passe ses cartes l'une après l'autre.
   Chaque carte reconnue avec certitude (numéro ET nom lus, voir matchScan dans app.js) s'ajoute à la session :
   sa cote s'affiche en grand et le total de la session monte. À la fin, on relit la liste, on retire ce qui ne va pas,
   puis on ajoute tout à sa collection en un geste. Rien n'est ajouté à la collection sans ce dernier geste.
   La lecture se fait dans le téléphone (même lecteur de texte que le scan d'une photo) : aucune image n'est envoyée.
   Sans caméra (ordinateur, autorisation refusée), on peut choisir plusieurs photos d'un coup : même session, même total.
   Fichier séparé de app.js : il réutilise ses fonctions (getOcr, matchScan, ownValue, cimg, collection…) et s'ajoute au routeur. */
(function () {
  'use strict';
  if (typeof render !== 'function' || typeof matchScan !== 'function') return;

  const route = () => location.hash.replace(/^#\/?/, '').split(/[/?]/)[0];
  const isScan = () => route() === 'scan';

  /* ---------- La session, gardée sur l'appareil (rien n'est perdu si la page se recharge) ---------- */
  const SS = Object.assign({ items: [], cond: 'NM', lang: '' }, load('scanSession', {}));
  if (!Array.isArray(SS.items)) SS.items = [];
  const saveS = () => save('scanSession', { items: SS.items, cond: SS.cond, lang: SS.lang });
  let seq = 0;
  const newId = () => Date.now().toString(36) + (seq++ % 46656).toString(36).padStart(3, '0') + Math.random().toString(36).slice(2, 4);
  const live = () => SS.items.filter(it => BYKEY.has(it.key));
  // Valeur d'un exemplaire de la session : la même règle que la collection (cote, état, langue), dans la devise affichée
  const valOf = it => { const c = BYKEY.get(it.key), e = c && ownValue({ lang: it.lang, cond: SS.cond, rev: false, grader: '' }, c); return e ? e.u : null; };
  const total = () => live().reduce((s, it) => s + (valOf(it) || 0), 0);
  const nCards = n => (n > 1 ? n + ' cartes' : n + ' carte'); // traduit à l'affichage (i18n.js)
  const langName = l => tr(LANG[l] ? LANG[l].name : l);

  /* ---------- État de l'écran ---------- */
  const V = { gone: 0, view: 'cam', stream: null, err: '', busy: false, on: false, hint: '', again: null, photos: 0, pop: null, popT: 0 };
  let root = null;

  /* ---------- Caméra ---------- */
  async function startCam() {
    if (V.stream || V.view !== 'cam') return;
    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) { V.err = 'nocam'; drawCam(); return; }
    try {
      V.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
    } catch (e) { V.err = e && e.name === 'NotAllowedError' ? 'refus' : 'nocam'; drawCam(); return; }
    if (!isScan() || V.view !== 'cam') { stopCam(); return; }
    V.err = '';
    const vid = root && root.querySelector('#sc-video');
    if (vid) { vid.srcObject = V.stream; vid.play().catch(() => {}); }
    drawCam();
    if (!V.on) { V.on = true; loop(); }
    getOcr().catch(() => {}); // le lecteur se charge pendant qu'on cadre la première carte
  }
  function stopCam() {
    V.on = false;
    if (V.stream) { V.stream.getTracks().forEach(t => t.stop()); V.stream = null; }
  }

  // Image du cadre (la carte), agrandie et en niveaux de gris, prête à être lue
  function grabFrame() {
    const vid = root && root.querySelector('#sc-video'), fr = root && root.querySelector('.sc-frame');
    if (!vid || !fr || !vid.videoWidth) return null;
    const vb = vid.getBoundingClientRect(), fb = fr.getBoundingClientRect();
    const s = Math.max(vb.width / vid.videoWidth, vb.height / vid.videoHeight); // la vidéo remplit son cadre (object-fit: cover)
    const ox = (vb.width - vid.videoWidth * s) / 2, oy = (vb.height - vid.videoHeight * s) / 2;
    const m = 0.06 * fb.width; // un peu de marge autour du cadre : la carte n'y est jamais pile
    let sx = (fb.left - vb.left - m - ox) / s, sy = (fb.top - vb.top - m - oy) / s, sw = (fb.width + 2 * m) / s, sh = (fb.height + 2 * m) / s;
    sx = Math.max(0, sx); sy = Math.max(0, sy); sw = Math.min(vid.videoWidth - sx, sw); sh = Math.min(vid.videoHeight - sy, sh);
    if (sw < 20 || sh < 20) return null;
    const k = Math.min(2.2, 1400 / sh), cv = document.createElement('canvas');
    cv.width = Math.round(sw * k); cv.height = Math.round(sh * k);
    const g = cv.getContext('2d'); g.filter = 'grayscale(1) contrast(1.4)'; g.drawImage(vid, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
    return cv;
  }

  // Lit le cadre, encore et encore, tant que l'écran est ouvert
  async function loop() {
    while (V.on && isScan() && V.view === 'cam') {
      if (document.hidden) { await wait(400); continue; }
      const cv = grabFrame();
      if (!cv) { await wait(300); continue; }
      try {
        V.busy = true;
        const w = await getOcr();
        const { data } = await w.recognize(cv);
        if (V.on && isScan()) onText(data.text || '');
      } catch (e) { V.hint = 'Lecture impossible pour l’instant. Réessaie dans un instant.'; drawHint(); await wait(1200); }
      V.busy = false;
      await wait(150);
    }
  }
  const wait = ms => new Promise(r => setTimeout(r, ms));

  /* ---------- Une lecture → une carte ajoutée (ou un conseil) ---------- */
  // Mots imprimés sur toutes les cartes d'une langue (faiblesse, retraite…) : ils trahissent la langue même quand le nom
  // du Pokémon est identique (« Charmander » en anglais et en italien). Le texte est lu sans accents.
  const MARKS = { en: /\b(weakness|retreat)\b/, fr: /\b(faiblesse|retraite)\b/, de: /(schwache|ruckzug|riickzug)/, it: /\b(debolezza|ritirata)\b/, es: /\b(debilidad|retirada)\b/, pt: /\b(fraqueza|recuo)\b/ };
  function langFor(c, m, text) {
    const langs = c.langs.length ? c.langs : [c.set.reg === 'en' ? 'en' : 'ja'];
    if (SS.lang && langs.includes(SS.lang)) return SS.lang; // la langue choisie en haut de l'écran
    const t = norm(text || ''), seen = langs.filter(l => MARKS[l] && MARKS[l].test(t));
    if (seen.length === 1) return seen[0];
    const read = (m.langs || []).filter(l => langs.includes(l)), pref = prefLang(c);
    return !read.length || read.includes(pref) ? pref : read[0];
  }
  function onText(text, fromPhoto) {
    const m = matchScan(text);
    const c = m.sure && m.results[0];
    if (!c || c.x) {
      if (fromPhoto) return false;
      if (!m.results.length && !m.nums.length) V.gone++; // rien de lisible : la carte a sans doute été retirée
      V.hint = m.results.length ? 'Approche un peu la carte : le nom et le numéro en bas doivent être nets.' : 'Place une carte dans le cadre, bien à plat.';
      drawHint(); return false;
    }
    const lastIt = SS.items[SS.items.length - 1];
    // La même carte reste devant la caméra : on ne la compte pas deux fois. Un bouton permet d'en ajouter un autre exemplaire.
    // Après deux lectures vides de suite (carte retirée, puis une autre posée), le même nom compte comme un nouvel exemplaire.
    if (!fromPhoto && lastIt && lastIt.key === c.key && V.gone < 2) {
      V.gone = 0; if (!V.again) V.again = { key: c.key, lang: lastIt.lang };
      V.hint = 'Carte suivante !'; drawHint(); return false;
    }
    add(c, langFor(c, m, text));
    return true;
  }
  function add(c, lang) {
    const it = { id: newId(), key: c.key, lang, at: Date.now() };
    SS.items.push(it); saveS();
    V.again = null; V.gone = 0; V.hint = 'Carte suivante !';
    const v = valOf(it);
    V.pop = { name: cardName(c), v }; V.popT = Date.now();
    try { navigator.vibrate && navigator.vibrate(30); } catch (e) {}
    drawCam();
  }

  // Sans caméra, ou en plus : plusieurs photos d'un coup, lues l'une après l'autre
  async function fromPhotos(files) {
    files = [...files].filter(f => /^image\//.test(f.type || 'image/'));
    if (!files.length) return;
    let ok = 0, ko = 0; V.photos = files.length; drawHint();
    for (const f of files) {
      try {
        const [cv, w] = await Promise.all([prepImage(f), getOcr()]);
        const { data } = await w.recognize(cv);
        if (onText(data.text || '', true)) ok++; else ko++;
      } catch (e) { ko++; }
      V.photos--; drawHint();
    }
    V.photos = 0;
    V.hint = ko ? (ok ? F('{0} reconnues, {1} à chercher à la main (photo floue ou numéro caché).', ok, ko) : 'Aucune carte reconnue : cadre la carte bien à plat, avec le numéro en bas net et lisible.') : '';
    if (V.view === 'cam') drawCam(); else draw();
  }

  /* ---------- Affichage ---------- */
  const CAM = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>';
  const X = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  const fmt = v => (v == null ? tr('cote indisponible') : ownMoney(v));
  const photoInput = (label, cls = 'btn small') => `<label class="${cls}">${esc(tr(label))}<input type="file" accept="image/*" multiple class="sr" id="sc-photos"></label>`;
  const langSel = () => `<label class="sc-cond small">${esc(tr('Langue des cartes'))} <select id="sc-lang">${[['', tr('Automatique')], ...LANGS.filter(x => x[0] !== 'ptcg').map(x => [x[0], tr(x[1])])].map(([k, n]) => `<option value="${k}" ${k === (SS.lang || '') ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>`;
  const condSel = () => `<label class="sc-cond small">${esc(tr('État des cartes'))} <select id="sc-cond">${CONDS.map(([k, n]) => `<option value="${k}" ${k === SS.cond ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>`;

  function totalHtml() {
    const n = live().length;
    return `<span class="small">${esc(tr('Total de la session'))}</span><b class="num sc-sum">${ownMoney(total())}</b><span class="small">${esc(nCards(n))}</span>`;
  }
  function stripHtml() {
    const xs = live().slice(-6).reverse();
    if (!xs.length) return `<div class="small sc-empty">${esc(tr('Les cartes reconnues s’afficheront ici.'))}</div>`;
    return xs.map(it => { const c = BYKEY.get(it.key), v = valOf(it); return `<div class="sc-mini"><span class="thumb">${cimg(c, { lang: it.lang })}</span><span class="mid"><b>${esc(cardName(c))}</b><span>${esc(setName(c.set))} · ${esc(numLabel(c))} · ${esc(langName(it.lang))}</span></span><b class="num">${fmt(v)}</b></div>`; }).join('');
  }
  function hintHtml() {
    if (V.photos) return `<span>${esc(F('Lecture des photos… encore {0}', V.photos))}</span>`;
    const again = V.gone < 2 && V.again && BYKEY.get(V.again.key);
    return `${V.hint ? `<span>${esc(tr(V.hint))}</span>` : ''}${again ? `<button class="btn small" data-sc="again">${esc(F('+1 {0} (un autre exemplaire)', cardName(again)))}</button>` : ''}`;
  }
  function camBody() {
    if (V.err) {
      const msg = V.err === 'refus' ? 'La caméra est bloquée pour CallIt!. Autorise-la dans les réglages du navigateur, ou scanne tes cartes avec des photos.' : 'Pas de caméra disponible ici. Tu peux scanner tes cartes avec des photos : choisis-en plusieurs d’un coup.';
      return `<div class="panel stack sc-nocam" style="gap:10px"><div>${esc(tr(msg))}</div><div class="row" style="gap:8px;flex-wrap:wrap">${photoInput('Choisir des photos', 'btn primary')}${V.err === 'refus' ? `<button class="btn small" data-sc="retry">${esc(tr('Réessayer la caméra'))}</button>` : ''}</div></div>`;
    }
    return `<div class="sc-cam"><video id="sc-video" playsinline muted autoplay></video><div class="sc-frame" aria-hidden="true"></div><div class="sc-pop" id="sc-pop" aria-live="polite"></div></div>`;
  }
  function viewCam() {
    return `<div class="sc">
      <div class="top"><h1 class="title">${CAM} ${esc(tr('Scan en continu'))}</h1><button class="iconbtn" data-sc="close" aria-label="${esc(tr('Fermer'))}">${X}</button></div>
      <div class="pad"><div class="sc-total" id="sc-total">${totalHtml()}</div></div>
      <div class="pad sc-actions sc-set">${langSel()}${condSel()}</div>
      <div class="pad" id="sc-cambox">${camBody()}</div>
      <div class="pad sc-hint" id="sc-hint" aria-live="polite">${hintHtml()}</div>
      <div class="pad sc-actions"><button class="btn primary" data-sc="fin" ${live().length ? '' : 'disabled'}>${esc(tr('Terminer la session'))}</button>${V.err ? '' : photoInput('Ajouter des photos')}</div>
      <div class="pad"><div class="sc-strip" id="sc-strip">${stripHtml()}</div></div>
      <p class="pad small sc-note">${esc(tr('Passe tes cartes l’une après l’autre devant la caméra. Une carte n’est ajoutée que si son nom et son numéro sont bien lus. Rien n’entre dans ta collection avant que tu valides la liste.'))}</p>
    </div>`;
  }
  function viewFin() {
    const xs = live(), n = xs.length, k = xs.filter(it => !it.off).length;
    const rows = xs.map(it => { const c = BYKEY.get(it.key), v = valOf(it); return `<div class="line sc-row${it.off ? ' off' : ''}"><input type="checkbox" class="sc-pick" data-id="${esc(it.id)}" ${it.off ? '' : 'checked'} aria-label="${esc(F('Ajouter {0}', cardName(c)))}"><a class="thumb" href="#/carte/${encodeURIComponent(c.key)}">${cimg(c, { lang: it.lang })}</a><span class="mid"><b>${esc(cardName(c))}</b><span>${esc(setName(c.set))} · ${esc(numLabel(c))}</span><select class="sc-lang" data-id="${esc(it.id)}" aria-label="${esc(tr('Langue'))}">${(c.langs.length ? c.langs : [it.lang]).map(l => `<option value="${l}" ${l === it.lang ? 'selected' : ''}>${esc(langName(l))}</option>`).join('')}</select></span><span class="px"><b class="num">${fmt(v)}</b><button class="linkbtn small" data-sc="del" data-id="${esc(it.id)}">${esc(tr('Retirer'))}</button></span></div>`; }).join('');
    return `<div class="sc">
      <div class="top"><button class="iconbtn" data-sc="back" aria-label="${esc(tr('Reprendre le scan'))}">${icon('back')}</button><h1 class="title">${esc(tr('Fin de la session'))}</h1></div>
      <div class="pad"><div class="sc-total">${totalHtml()}</div></div>
      ${n ? `<div class="pad sc-actions">${condSel()}${n > 1 ? `<button class="linkbtn small" data-sc="pickall">${esc(tr(k === n ? 'Tout décocher' : 'Tout cocher'))}</button>` : ''}</div><div class="list" style="margin-top:8px">${rows}</div>
      <div class="pad sc-actions"><button class="btn primary" data-sc="addall" ${k ? '' : 'disabled'}>${esc(k === n ? (n > 1 ? F('Ajouter les {0} cartes à ma collection', n) : tr('Ajouter la carte à ma collection')) : k > 1 ? F('Ajouter les {0} cartes cochées', k) : F('Ajouter la carte cochée'))}</button><button class="btn small" data-sc="back">${esc(tr('Reprendre le scan'))}</button><button class="linkbtn small" data-sc="clear">${esc(tr('Vider la session'))}</button></div>
      <p class="pad small sc-note">${esc(tr('Les cotes sont celles du guide de prix Cardmarket, ajustées selon l’état et la langue. Tu pourras modifier chaque carte dans ta collection.'))}</p>`
      : `<div class="pad"><div class="panel">${esc(tr('La session est vide.'))} <button class="linkbtn" data-sc="back">${esc(tr('Reprendre le scan'))}</button></div></div>`}
    </div>`;
  }

  function mount() {
    root = document.createElement('div');
    app.innerHTML = ''; app.appendChild(root);
    draw();
  }
  function draw() {
    if (!root || !app.contains(root)) return;
    root.innerHTML = V.view === 'fin' ? viewFin() : viewCam();
    if (V.view === 'cam') {
      const vid = root.querySelector('#sc-video');
      if (vid && V.stream) { vid.srcObject = V.stream; vid.play().catch(() => {}); }
      if (!V.stream && !V.err) startCam();
    }
  }
  // Mise à jour sans refaire la vidéo (sinon l'image se coupe à chaque carte)
  function drawCam() {
    if (!root || V.view !== 'cam') return;
    const box = root.querySelector('#sc-cambox');
    if (box && !!V.err !== !!box.querySelector('.sc-nocam')) { draw(); return; }
    const set = (id, h) => { const el = root.querySelector(id); if (el) el.innerHTML = h; };
    set('#sc-total', totalHtml()); set('#sc-strip', stripHtml()); drawHint();
    const fin = root.querySelector('[data-sc="fin"]'); if (fin) fin.disabled = !live().length;
    const pop = root.querySelector('#sc-pop');
    if (pop && V.pop && Date.now() - V.popT < 1500) {
      pop.innerHTML = `<b class="num">${V.pop.v == null ? esc(tr('cote indisponible')) : '+' + ownMoney(V.pop.v)}</b><span>${esc(V.pop.name)}</span>`;
      pop.classList.remove('on'); void pop.offsetWidth; pop.classList.add('on');
      const t = root.querySelector('.sc-sum'); if (t) { t.classList.remove('bump'); void t.offsetWidth; t.classList.add('bump'); }
    }
  }
  function drawHint() { const el = root && root.querySelector('#sc-hint'); if (el) el.innerHTML = hintHtml(); }

  /* ---------- Actions ---------- */
  // Ajoute les cartes cochées ; celles qu'on a décochées restent dans la session (on peut la vider ensuite)
  function addAll() {
    const xs = live().filter(it => !it.off); if (!xs.length) return;
    const today = new Date().toISOString().slice(0, 10);
    for (const it of xs) collection.push({ id: newId(), key: it.key, lang: it.lang, cond: SS.cond, rev: false, grader: '', grade: '', val: null, qty: 1, paid: null, cur: userCur(), date: today, note: '' });
    saveCol(); recordHistory();
    const n = xs.length, done = new Set(xs.map(it => it.id)); SS.items = SS.items.filter(it => !done.has(it.id)); saveS(); V.view = 'cam'; V.again = null; V.hint = '';
    stopCam(); location.hash = '#/collection';
    setTimeout(() => toast(n > 1 ? tr(n + ' cartes ajoutées à ta collection') : tr('Carte ajoutée à ta collection')), 50);
  }
  document.addEventListener('click', e => {
    const el = e.target.closest && e.target.closest('[data-sc]'); if (!el || !isScan()) return;
    const a = el.dataset.sc;
    if (a === 'close') { stopCam(); history.length > 1 ? history.back() : (location.hash = '#/'); }
    else if (a === 'fin') { stopCam(); V.view = 'fin'; draw(); window.scrollTo(0, 0); }
    else if (a === 'back') { V.view = 'cam'; draw(); }
    else if (a === 'again') { const c = V.again && BYKEY.get(V.again.key); if (c) add(c, V.again.lang); }
    else if (a === 'retry') { V.err = ''; draw(); }
    else if (a === 'del') { SS.items = SS.items.filter(it => it.id !== el.dataset.id); saveS(); draw(); }
    else if (a === 'clear') { SS.items = []; saveS(); V.view = 'cam'; draw(); }
    else if (a === 'addall') addAll();
    else if (a === 'pickall') { const xs = live(), on = xs.every(it => !it.off); xs.forEach(it => { it.off = on; }); saveS(); draw(); }
  });
  document.addEventListener('change', e => {
    if (!isScan()) return;
    const t = e.target;
    if (t.id === 'sc-photos' && t.files && t.files.length) { const fs = [...t.files]; t.value = ''; fromPhotos(fs); }
    else if (t.id === 'sc-lang') { SS.lang = t.value; saveS(); }
    else if (t.id === 'sc-cond') { SS.cond = t.value; saveS(); V.view === 'cam' ? drawCam() : draw(); }
    else if (t.classList.contains('sc-pick')) { const it = SS.items.find(x => x.id === t.dataset.id); if (it) { it.off = !t.checked; saveS(); draw(); } }
    else if (t.classList.contains('sc-lang')) { const it = SS.items.find(x => x.id === t.dataset.id); if (it) { it.lang = t.value; saveS(); draw(); } }
  });
  // Téléphone en veille ou autre onglet : on coupe la caméra, et on la rallume au retour
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopCam();
    else if (isScan() && V.view === 'cam' && root && app.contains(root)) startCam();
  });

  /* ---------- Branchement dans l'appli ---------- */
  const baseRender = render;
  render = function (keepFocus) {
    if (DB && S.face && isScan()) {
      document.body.dataset.face = G() ? 'galerie' : 'marche';
      document.title = tr('Scan en continu') + ' · CallIt!';
      if (!PKM) { location.hash = '#/'; return; }
      if (root && app.contains(root)) { if (V.view === 'cam') drawCam(); else draw(); return; }
      mount();
      return;
    }
    if (root) { stopCam(); root = null; V.view = 'cam'; }
    baseRender(keepFocus);
  };
  if (DB && S.face && isScan()) render();
})();
