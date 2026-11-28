/* CallIt! · « Analyse poussée » (bêta, maquette validée par Jérémie le 28/11/2026 : apercus/analyse-poussee) : recto et
   verso obligatoires (l'Analyse complète), puis jusqu'à 8 photos en plus pour la carte : les deux photos sous la lampe de
   chaque face (maquette apercus/lumiere/ecrans-cote) et des gros plans (un coin, un bord, un défaut). Photos sous la lampe :
   Après une Analyse complète, deux photos de la même face sous une lampe posée à gauche de la carte, la tête presque au ras
   de la table (lumière rasante), le téléphone bien au-dessus : photo 1 telle quelle, photo 2 la carte tournée d'un quart de
   tour. Les plis, les bosses et les rayures ressortent ; un relief reste en place d'une photo à l'autre, un reflet bouge.
   Sur l'appareil : la carte est retrouvée et remise droite (redresse.js), dans le bon sens (comparée à la photo à plat), puis
   posée exactement à la place de la carte de la photo à plat. L'analyse de cette face est refaite avec les deux photos en
   plus (CallItIA.bords, option lum, live.js). En touchant un défaut : la zone « À plat » et « Lampe sur le côté » côte à
   côte. Bêta : on demande l'avis de ceux qui l'utilisent (table « retours », page « #/lumiere avis »).
   L'image partagée et la page du lien court ne changent pas (présentation v25 verrouillée).
   Fichier séparé de app.js : il ajoute #/lumiere au routeur, une ligne sous le bloc Analyse complète, et reprend ctrZoomView. */
(function () {
  'use strict';
  if (typeof render !== 'function' || typeof CTR === 'undefined') return;
  const T = (s, ...a) => (typeof F === 'function' ? F(s, ...a) : s.replace(/\{(\d)\}/g, (m, i) => a[+i]));
  const route = () => location.hash.replace(/^#\/?/, '').split(/[/?]/)[0];
  const FACES = ['recto', 'verso'];
  const imgOf = f => f === CTR.side ? CTR.img : (CTR.faces[f] || {}).img;
  const LOf = f => f === CTR.side ? CTR.L : (CTR.faces[f] || {}).L;
  const okL = L => Array.isArray(L) && L.length === 8 && L.every(v => isFinite(v)) && L[3] - L[0] > 20 && L[7] - L[4] > 20;
  const iaOf = img => img && ((CTR.iaAll || {})[img] || (CTR.ia && CTR.ia.img === img ? CTR.ia : null));
  // Une face se vérifie sous la lumière quand son analyse est là (et ses contours, pour poser la carte au bon endroit)
  const lue = f => { const r = iaOf(imgOf(f)); return !!(r && r.j && r.j.visible !== false && okL(LOf(f))); };
  /* Par face : { img, p: { 1: photo, 2: photo }, sel, fait }. Une photo : { id, al (photo alignée, même taille que la photo à
     plat), th (vignette), axe et force (d'où vient la lumière), corr (ressemblance avec la photo à plat), msg (conseil) }.
     Les photos d'une face sont oubliées si sa photo à plat change. */
  const LUM = { face: 'recto', d: {}, busy: 0, run: '', retour: null, depuis: false };
  let NUM = 0;
  const etat = f => { const img = imgOf(f); let d = LUM.d[f]; if (!d || d.img !== img) d = LUM.d[f] = { img, p: {}, g: [], skip: false, sel: 0, fait: null }; return d; };
  // 8 photos en plus au plus pour la carte (recto et verso ensemble) : les photos sous la lampe comptent
  const MAXP = 8;
  const nb = f => { const d = etat(f); return (d.p[1] ? 1 : 0) + (d.p[2] ? 1 : 0) + d.g.length; };
  const total = () => FACES.reduce((s, k) => s + (lue(k) ? nb(k) : 0), 0);
  const idsOf = f => { const d = etat(f); return [d.p[1], d.p[2], ...d.g].filter(Boolean).map(x => x.id).join('-'); };
  const fait = f => { const d = etat(f), i = idsOf(f); return !!(d.fait && i && d.fait.ids === i); };
  const aFaire = () => FACES.filter(k => lue(k) && nb(k) && !fait(k));
  window.CallItLumiere = { LUM, etat };

  const LAMPE = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 21h8"/><path d="M8 21l2.6-7.2 4.4-3.3"/><path d="M13.2 6.4l3.6-2.9 3.9 4.9-3.6 2.9z"/><path d="M19.6 12.6l1.1 1.5M17.4 13.9l.5 1.8M21.7 10.4l1.7.5"/></svg>';
  const CHEV = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
  const beta = () => `<span class="lum-beta">${T('Bêta')}</span>`;

  /* ---------- Ligne sous le bloc Analyse complète (écran du résultat) ---------- */
  // « Conseillé » : un pli est soupçonné, ou la carte peut viser une belle note (un pli caché la ferait tomber à 4)
  function conseil() {
    try {
      const N = ctrNote(), js = ctrIaFaces().map(x => x.j);
      return js.some(j => { const p = String(j.plis || '').trim(); return !!p && p !== 'aucun'; }) || N.hi >= 8;
    } catch (e) { return false; }
  }
  function ligne() {
    const fs = FACES.filter(lue); if (!fs.length) return '';
    // Analyse en cours (écran d'attente refermé) : on le dit, le résultat se met à jour tout seul
    if (LUM.run) return `<div class="lum-bloc"><a class="lum-row" href="#/lumiere"><span class="lum-ic">${LAMPE}</span><b>${T('Analyse poussée en cours…')}</b>${beta()}<span class="lum-end"><span class="lum-spin" aria-hidden="true"></span></span></a></div>`;
    const ok = fs.filter(fait);
    if (!ok.length) return `<div class="lum-bloc"><a class="lum-row" href="#/lumiere"><span class="lum-ic">${LAMPE}</span><b>${T('Analyse poussée')}</b>${beta()}${conseil() ? `<span class="lum-tag">${T('Conseillé')}</span>` : ''}<span class="lum-end">${CHEV}</span></a></div>`;
    const np = ok.reduce((a, k) => a + nb(k), 0), quoi = np > 1 ? T('{0} photos', np) : T('1 photo');
    return `<div class="lum-bloc"><a class="lum-row fait" href="#/lumiere"><span class="lum-ic">${LAMPE}</span><b>${T('Analyse poussée faite')}</b>${beta()}<span class="lum-end">${quoi ? `<span>${esc(quoi)}</span>` : ''}${CHEV}</span></a>
      <button type="button" class="linkbtn lum-avis" data-lum="avis">${T('Donner mon avis sur cette bêta')}</button></div>`;
  }

  /* ---------- Écran « Analyse poussée » (#/lumiere) ---------- */
  const ILLU = { 1: ['img/lumiere/lampe-1.webp', [['Lampe', 16, 70], ['Téléphone', 74, 39], ['Carte', 84, 88]]], 2: ['img/lumiere/lampe-2.webp', [['Lampe', 16, 70], ['Téléphone', 74, 39], ['¼ de tour', 88, 88]]], 3: ['img/lumiere/gros-plan.webp', [['Lampe', 16, 70], ['Téléphone', 82, 50], ['Gros plan', 84, 88]]] };
  const ALT = { 1: 'Une lampe posée à gauche de la carte, le téléphone au-dessus', 2: 'La carte tournée d’un quart de tour, la lampe au même endroit', 3: 'Le téléphone tout près d’un coin de la carte' };
  const illu = n => { const [src, labs] = ILLU[n]; return `<div class="lum-illu"><img src="${src}" alt="${esc(T(ALT[n]))}" width="1074" height="1020">${labs.map(([t, x, y]) => `<span class="lum-lab" style="left:${x}%;top:${y}%" aria-hidden="true">${esc(T(t))}</span>`).join('')}</div>`; };
  const MSG = {
    cote: 'Photo {0} : la lumière ne vient pas assez du côté. Baisse la lampe au ras de la table, rapproche-la et éteins les autres lumières.',
    tour: 'Sur les deux photos, la lumière arrive du même côté de la carte. Pour la photo 2, tourne la carte d’un quart de tour sans bouger la lampe.',
    face: 'Photo {0} : on ne reconnaît pas bien la carte. Vérifie que c’est la bonne face, en entier et bien à plat.',
  };
  function slot(f, n, now) {
    const ph = etat(f).p[n], busy = LUM.busy === n;
    const mini = busy ? '<span class="lum-spin" aria-hidden="true"></span>' : ph ? `<img src="${ph.th}" alt=""><span class="ok">✓</span>` : `<i class="${n === 1 ? 'g' : 'b'}"></i>`;
    const sub = busy ? T('Préparation…') : T(n === 1 ? 'Lampe à gauche' : 'Carte tournée');
    return `<button type="button" class="lum-slot${now ? ' now' : ''}" data-lum="sel" data-n="${n}"${LUM.busy || LUM.run ? ' disabled' : ''}><span class="mini">${mini}</span><span class="lum-slot-t"><b>${T('Photo {0}', n)}</b><span${ph && !busy ? ` class="${ph.msg ? 'lum-ko' : 'lum-ok'}"` : ''}>${sub}</span></span></button>`;
  }
  // Les gros plans de la face : vignettes, puis « + » tant qu'il reste de la place (8 photos en plus pour la carte)
  function grosRow(f, now) {
    const d = etat(f), reste = MAXP - total(), busy = LUM.busy === 'g', off = LUM.busy || LUM.run;
    const ths = d.g.map((x, i) => `<button type="button" class="lum-th" data-lum="gvoir" data-i="${i}" aria-label="${esc(T('Gros plan {0}', i + 1))}"${off ? ' disabled' : ''}><img src="${x.th}" alt=""><span class="ok">✓</span></button>`).join('');
    const plus = busy ? '<span class="lum-th lum-plus"><span class="lum-spin" aria-hidden="true"></span></span>'
      : reste > 0 ? `<label class="lum-th lum-plus${now ? ' now' : ''}${off ? ' off' : ''}"><span aria-hidden="true">+</span><small>${T('Ajouter')}</small><input type="file" accept="image/*" multiple class="sr" id="lumgros"${off ? ' disabled' : ''}></label>` : '';
    return `<div class="lum-gros"><span class="lum-gros-t"><b>${T('Gros plans')}</b><span>${T('coin, bord, défaut')}</span></span><span class="lum-ths">${ths}${plus}</span></div>`;
  }
  function view() {
    const top = `<div class="top top-start">${backBtn()}<h1 class="title">${T('Analyse poussée')} ${beta()}</h1></div>`;
    const fs = FACES.filter(lue);
    if (!fs.length) return `${top}<div class="pad stack" style="gap:14px;max-width:560px"><div class="note">${T('L’analyse poussée se fait après l’analyse de la carte (recto et verso) : analyse-la d’abord.')}</div><a class="btn primary" href="#/analyse" style="align-self:flex-start">✦ ${T('Analyser la carte')}</a></div>${tabs('')}`;
    if (!fs.includes(LUM.face)) LUM.face = fs.includes(CTR.side) ? CTR.side : fs[0];
    const f = LUM.face, d = etat(f), p1 = d.p[1], p2 = d.p[2], busy = !!LUM.busy, run = !!LUM.run;
    const tot = total(), reste = MAXP - tot, n = d.sel || (!p1 && !d.skip ? 1 : !p2 && !d.skip ? 2 : 3);
    const sw = fs.length > 1 ? `<div class="face" role="group" aria-label="${T('Face de la carte')}">${fs.map(k => `<button type="button" data-lum="face" data-v="${k}" aria-pressed="${k === f}"${busy || run ? ' disabled' : ''}>${T(k === 'recto' ? 'Recto' : 'Verso')}${fait(k) ? ' ✓' : nb(k) ? ` <small>${nb(k)}</small>` : ''}</button>`).join('')}</div>` : '';
    const head = `<div class="lum-head">${sw}<span class="lum-cpt">${T('Photos en plus : {0} sur {1}', `<b>${tot}</b>`, MAXP)}</span></div>`;
    // Le bouton d'analyse : toutes les faces qui ont des photos nouvelles, en une fois
    const nouv = aFaire().reduce((a, k) => a + nb(k), 0);
    const go = nouv ? `<button type="button" class="btn primary lum-go" data-lum="go">✦ ${nouv > 1 ? T('Analyser avec {0} photos en plus', nouv) : T('Analyser avec 1 photo en plus')}</button>` : '';
    let side;
    if (run) side = `<div class="lum-step"><b>${T('Analyse en cours…')}</b></div><div class="lum-tip">${T('On regarde ta carte avec toutes ses photos. Le résultat se met à jour tout seul.')}</div><button type="button" class="btn" data-lum="voir" style="align-self:flex-start">${T('Voir le résultat')}</button>`;
    else if (n < 3) {
      const plein = reste <= 0 && !d.p[n];
      side = `<div class="lum-step"><b>${T('Photo {0} sur {1}', n, 2)}</b><span>${T(n === 1 ? 'La lampe à gauche de la carte' : 'La carte tournée d’un quart de tour')}</span></div>
      <div class="lum-tip">${T(n === 1 ? 'Pose la lampe à gauche, la tête le plus bas possible. Prends la photo bien au-dessus de la carte, sans flash. Éteins les autres lumières si tu peux.' : 'Tourne la carte d’un quart de tour, sans bouger la lampe. Les plis dans l’autre sens ressortent aussi.')}${n === 1 && !p1 && !p2 ? ` <button type="button" class="linkbtn lum-skip" data-lum="skip">${T('Pas de lampe ? Passe aux gros plans')}</button>` : ''}</div>
      ${plein ? `<div class="note">${T('Tu as déjà 8 photos en plus : c’est le maximum. Touche une photo pour la changer.')}</div>` : `<div class="row lum-btns"><label class="btn small primary${busy ? ' off' : ''}">${icon('camera', 16)} ${T('Prendre la photo')}<input type="file" accept="image/*" capture="environment" class="sr" id="lumfile"${busy ? ' disabled' : ''}></label><label class="btn small${busy ? ' off' : ''}">${T('Choisir dans la galerie')}<input type="file" accept="image/*" class="sr" id="lumfile2"${busy ? ' disabled' : ''}></label>${d.p[n] && !busy ? `<button type="button" class="linkbtn" data-lum="garder">${T('Garder cette photo')}</button>` : ''}</div>`}`;
    } else if (fait(f) && !aFaire().length) {
      const a = d.fait.avant, b = d.fait.apres;
      const note = a && b ? (b.hi !== a.hi ? T('Note maximale espérée : {0} (avant : {1})', b.hi, a.hi) : T('Note maximale espérée : {0}, comme avant', b.hi)) : '';
      side = `<div class="lum-step"><b class="lum-ok">✓ ${T('Analyse poussée faite')}</b>${note ? `<span>${esc(note)}</span>` : ''}</div>
      <div class="lum-tip">${T('Le résultat de ta carte est à jour. Touche un défaut pour le voir à plat et sur ta photo en plus.')}</div>
      <div class="row lum-btns"><button type="button" class="btn primary" data-lum="voir">${T('Voir le résultat')}</button><button type="button" class="linkbtn" data-lum="avis">${T('Donner mon avis sur cette bêta')}</button></div>`;
    } else side = `<div class="lum-step"><b>${T('Gros plans')}</b><span>${T('si tu veux')}</span></div>
      <div class="lum-tip">${T('Approche le téléphone à 10 cm d’un coin, d’un bord ou d’un défaut, sans flash. Touche + pour en ajouter.')}</div>${go}`;
    const msgs = [1, 2].map(k => d.p[k] && d.p[k].msg).map((m, i) => m ? T(MSG[m], i + 1) : '').filter((m, i, a) => m && a.indexOf(m) === i);
    return `${top}<div class="pad stack" style="gap:14px">${head}
      <div class="lum-grid">${illu(n === 1 ? 1 : n === 2 ? 2 : 3)}<div class="lum-side">${side}
      ${n === 3 ? grosRow(f, !run) : ''}
      <div class="lum-slots">${slot(f, 1, n === 1)}${slot(f, 2, n === 2)}</div>
      ${n === 3 ? '' : grosRow(f, false)}
      ${msgs.map(m => `<div class="note lum-warn">${esc(m)}</div>`).join('')}
      ${run || n === 3 ? '' : go}</div></div></div>${tabs('')}`;
  }

  /* ---------- Une photo sous la lampe : carte retrouvée, remise droite, dans le bon sens, à la place de la carte à plat ---------- */
  const charger = src => new Promise((ok, ko) => { const im = new Image(); im.onload = () => ok(im); im.onerror = ko; im.src = src; });
  const lire = file => new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = ko; r.readAsDataURL(file); });
  // Très grande photo (24 ou 48 Mpx) : 12 Mpx au plus, comme redresse.js (l'iPhone refuse les très grands canvas)
  async function reduire(im) {
    const W = im.naturalWidth, H = im.naturalHeight, MAX = 12e6; if (W * H <= MAX) return im;
    const k = Math.sqrt(MAX / (W * H)), c = document.createElement('canvas'); c.width = Math.round(W * k); c.height = Math.round(H * k);
    c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); return charger(c.toDataURL('image/jpeg', 0.92));
  }
  // Un quart de tour : la carte tournée (photo 2) est couchée sur la photo, et la recherche des coins attend une carte debout
  function tourner(im) {
    const c = document.createElement('canvas'); c.width = im.naturalHeight; c.height = im.naturalWidth;
    const g = c.getContext('2d'); g.translate(c.width, 0); g.rotate(Math.PI / 2); g.drawImage(im, 0, 0);
    return charger(c.toDataURL('image/jpeg', 0.92));
  }
  // La carte seule, debout (à l'endroit ou à l'envers : aligner() choisit), largeur au plus celle de la carte à plat
  async function carteDroite(im, larg) {
    const R = window.CallItRedresse; if (!R) return null;
    let d = R.detectCorners(im);
    if (d && d.ok) return charger(R.warp(im, d.q, 0, larg));
    const rot = await tourner(im); d = R.detectCorners(rot);
    if (d && d.ok) return charger(R.warp(rot, d.q, 0, larg));
    const fc = R.findCard(im);
    if (fc && fc.score >= 0.5) return charger(R.warp(im, fc.q, 0, larg));
    // Dernier recours : la lecture des coins de l'Analyse complète (une lecture de plus)
    if (window.CallItIA && CallItIA.ready()) { const c = await CallItIA.coins(im.src).catch(() => null); if (c && c.q) return charger(R.warp(im, c.q, 0, larg)); }
    return null;
  }
  /* Empreinte du dessin de la carte (36 × 50) : log de la luminosité moins sa moyenne locale. L'éclairage (dégradé de la
     lampe) disparaît, le dessin reste : on compare la photo sous la lampe à la photo à plat, à l'endroit et à l'envers. */
  function empreinte(src, x, y, w, h) {
    const W = 36, H = 50, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(src, x, y, w, h, 0, 0, W, H);
    const d = g.getImageData(0, 0, W, H).data, v = new Float32Array(W * H), o = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) v[i] = Math.log(1 + 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]);
    for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) {
      let s = 0, n = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const X = xx + dx, Y = yy + dy; if (X >= 0 && Y >= 0 && X < W && Y < H) { s += v[Y * W + X]; n++; } }
      o[yy * W + xx] = v[yy * W + xx] - s / n;
    }
    let m = 0; o.forEach(a => { m += a; }); m /= o.length;
    let q = 0; for (let i = 0; i < o.length; i++) { o[i] -= m; q += o[i] * o[i]; } q = Math.sqrt(q / o.length) || 1;
    for (let i = 0; i < o.length; i++) o[i] /= q;
    return o;
  }
  const corr = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s / a.length; };
  // D'où vient la lumière : luminosité des tiers gauche/droit et haut/bas, comparée à celle de la photo à plat (le dessin s'annule)
  function tiers(src, x, y, w, h) {
    const W = 30, H = 42, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(src, x, y, w, h, 0, 0, W, H);
    const d = g.getImageData(0, 0, W, H).data; let l = 0, r = 0, t = 0, b = 0;
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const k = (j * W + i) * 4, v = 4 + 0.299 * d[k] + 0.587 * d[k + 1] + 0.114 * d[k + 2];
      if (i < W / 3) l += v; else if (i >= W * 2 / 3) r += v;
      if (j < H / 3) t += v; else if (j >= H * 2 / 3) b += v;
    }
    return { lr: Math.log(l / r), tb: Math.log(t / b) };
  }
  const SEUIL_LUM = Math.log(1.15), SEUIL_FACE = 0.12;
  function aligner(carte, plat, L) {
    const W = plat.naturalWidth, H = plat.naturalHeight;
    const x = L[0] / 100 * W, y = L[4] / 100 * H, w = (L[3] - L[0]) / 100 * W, h = (L[7] - L[4]) / 100 * H;
    const ref = empreinte(plat, x, y, w, h), e = empreinte(carte, 0, 0, carte.naturalWidth, carte.naturalHeight);
    const c0 = corr(ref, e), c180 = corr(ref, e.slice().reverse()), envers = c180 > c0;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
    g.fillStyle = '#141416'; g.fillRect(0, 0, W, H);
    if (envers) { g.save(); g.translate(x + w, y + h); g.rotate(Math.PI); g.drawImage(carte, 0, 0, w, h); g.restore(); } else g.drawImage(carte, x, y, w, h);
    const A = tiers(cv, x, y, w, h), B = tiers(plat, x, y, w, h), glr = A.lr - B.lr, gtb = A.tb - B.tb;
    const th = document.createElement('canvas'); th.width = 84; th.height = 118; th.getContext('2d').drawImage(cv, x, y, w, h, 0, 0, 84, 118);
    return { al: cv.toDataURL('image/jpeg', 0.9), th: th.toDataURL('image/jpeg', 0.85), corr: Math.max(c0, c180), axe: Math.abs(glr) >= Math.abs(gtb) ? 'lr' : 'tb', force: Math.max(Math.abs(glr), Math.abs(gtb)) };
  }
  const PLAT = { src: '', im: null };
  async function plat(src) { if (PLAT.src !== src) { PLAT.im = await charger(src); PLAT.src = src; } return PLAT.im; }
  const souffle = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
  async function prendre(file, f, n) {
    const d = etat(f), L = LOf(f); if (!d.img || !okL(L) || LUM.busy) return;
    LUM.busy = n; render(); await souffle();
    try {
      const im = await reduire(await charger(await lire(file))), pl = await plat(d.img);
      const carte = await carteDroite(im, Math.round((L[3] - L[0]) / 100 * pl.naturalWidth));
      if (!carte) { LUM.busy = 0; render(); toast(T('On ne trouve pas la carte sur la photo : prends-la en entier, à plat, sur un fond uni.')); return; }
      if (etat(f) !== d) { LUM.busy = 0; render(); return; } // la photo à plat a changé entre-temps
      const a = aligner(carte, pl, L), o = d.p[n === 1 ? 2 : 1];
      a.id = ++NUM; a.msg = a.corr < SEUIL_FACE ? 'face' : a.force < SEUIL_LUM ? 'cote' : o && !o.msg && o.axe === a.axe ? 'tour' : '';
      d.p[n] = a; d.sel = 0;
      if (o && o.msg === 'tour' && a.axe !== o.axe) o.msg = '';
    } catch (e) { toast(T('Cette photo ne s’ouvre pas. Reprends-la, ou choisis une photo JPEG ou PNG.')); }
    LUM.busy = 0; render();
  }

  /* ---------- Gros plans : tels quels (pas de recadrage), 2 000 px au plus, une vignette ---------- */
  async function prendreGros(files, f) {
    const d = etat(f); if (!d.img || LUM.busy) return;
    const place = MAXP - total(); if (place <= 0) { toast(T('Tu as déjà 8 photos en plus : c’est le maximum.')); return; }
    const liste = [...files].slice(0, place);
    LUM.busy = 'g'; render(); await souffle();
    let rate = 0;
    for (const file of liste) {
      try {
        const im = await charger(await lire(file)), W = im.naturalWidth, H = im.naturalHeight, k = Math.min(1, 2000 / Math.max(W, H));
        const c = document.createElement('canvas'); c.width = Math.round(W * k); c.height = Math.round(H * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        const th = document.createElement('canvas'); th.width = 84; th.height = 118;
        const s2 = Math.max(84 / c.width, 118 / c.height); th.getContext('2d').drawImage(c, (84 - c.width * s2) / 2, (118 - c.height * s2) / 2, c.width * s2, c.height * s2);
        if (etat(f) !== d) break; // la photo à plat a changé entre-temps
        d.g.push({ id: ++NUM, url: c.toDataURL('image/jpeg', 0.9), th: th.toDataURL('image/jpeg', 0.85), ou: '' });
      } catch (e) { rate++; }
    }
    if (!d.p[1] && !d.p[2]) d.skip = true; d.sel = 0;
    LUM.busy = 0; render();
    if (rate) toast(T('Cette photo ne s’ouvre pas. Reprends-la, ou choisis une photo JPEG ou PNG.'));
    if (files.length > liste.length) toast(T('Tu as déjà 8 photos en plus : c’est le maximum.'));
  }

  /* ---------- Analyse de la face avec les deux photos ---------- */
  const resume = () => { try { const N = ctrNote(); return { lo: N.lo, hi: N.hi, cond: N.cond || '', rows: N.rows.map(r => `${r[1]} ${r[2] == null ? '-' : r[2]}`).join(', ') }; } catch (e) { return null; } };
  const put = (img, v) => { if (CTR.img === img) CTR.ia = v; else FACES.forEach(k => { if (CTR.faces[k] && CTR.faces[k].img === img) CTR.faces[k].ia = v; }); };
  // Retour au résultat : par l'historique si on vient de lui, en gardant le parcours « Analyser la carte »
  function retour() {
    LUM.retour = LUM.retour || 'analyser';
    if (LUM.depuis && typeof navDepth !== 'undefined' && navDepth > 0) { LUM.depuis = false; goingBack = true; history.back(); }
    else { LUM.depuis = false; location.hash = '#/centrage'; }
  }
  async function analyser() {
    const fs = aFaire(); if (!fs.length || LUM.run) return;
    if (!window.CallItIA || !CallItIA.ready()) { toast(T('L’analyse complète (coins, bords, surface) est réservée aux comptes. Le compte est gratuit.')); return; }
    const avant = resume();
    const jobs = fs.map(f => { const d = etat(f); return { f, d, img: d.img, L: LOf(f), ids: idsOf(f), lum: [d.p[1], d.p[2]].filter(Boolean).map(p => p.al), gros: d.g.map(x => x.url) }; });
    LUM.run = jobs.map(j => j.f).join(' '); retour();
    if (window.CallItAttente) {
      CallItAttente.ouvrir({ devant: jobs[0].f, faces: Object.fromEntries(FACES.filter(lue).map(k => [k, { img: imgOf(k), L: LOf(k) }])) });
      FACES.filter(k => lue(k) && !fs.includes(k)).forEach(k => CallItAttente.fin(imgOf(k), iaOf(imgOf(k)))); // face sans photo en plus : déjà lue
    }
    let rates = 0;
    await Promise.all(jobs.map(async J => {
      const r = await CallItIA.bords(J.img, J.f, J.L, { lum: J.lum.length ? J.lum : null, gros: J.gros.length ? J.gros : null });
      if (r && r.j && !r.err && r.j.visible !== false && imgOf(J.f) === J.img) {
        (CTR.iaAll = CTR.iaAll || {})[J.img] = { img: J.img, ...r }; put(J.img, { img: J.img, ...r });
        const gp = Array.isArray(r.j.gros_plans) ? r.j.gros_plans.filter(g => g && typeof g === 'object') : [];
        J.d.g.forEach((x, i) => { const g = gp.find(z => +z.n === i + 1); x.ou = g && g.ou ? String(g.ou).slice(0, 60) : ''; x.box = g && isFinite(g.x) && isFinite(g.y) && isFinite(g.l) ? { x: +g.x, y: +g.y, l: +g.l, h: isFinite(g.h) ? +g.h : +g.l * 88 / 63 } : null; });
        J.d.fait = { ids: J.ids, avant, apres: null, lum: r.lum || 0, gros: r.gros || 0, at: Date.now() };
        if (window.CallItAttente) CallItAttente.fin(J.img, r);
      } else rates++;
    }));
    LUM.run = '';
    const apres = resume(); jobs.forEach(J => { if (J.d.fait && J.d.fait.ids === J.ids) J.d.fait.apres = apres; });
    if (rates) { if (window.CallItAttente) CallItAttente.fermer(); toast(T('L’analyse poussée n’a pas marché. Ton résultat d’avant est gardé.')); }
    render();
  }

  /* ---------- Gros plan touché : « À plat » et « Lampe sur le côté » côte à côte ---------- */
  // Des deux photos sous la lampe, celle où la zone a le plus de relief (contours les plus marqués)
  function relief(src, sx, sy, sw, sh) {
    const n = 64, c = document.createElement('canvas'); c.width = n; c.height = n;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(src, sx, sy, sw, sh, 0, 0, n, n);
    const d = g.getImageData(0, 0, n, n).data, v = i => 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    let s = 0; for (let y = 1; y < n - 1; y++) for (let x = 1; x < n - 1; x++) { const i = y * n + x; s += Math.abs(4 * v(i) - v(i - 1) - v(i + 1) - v(i - n) - v(i + n)); }
    return s;
  }
  const baseZoom = ctrZoomView;
  ctrZoomView = async function (i) {
    let N, z, f, d;
    try { N = ctrNote(); z = N.zooms[i]; f = z && FACES.find(k => imgOf(k) === z.img); d = f && LUM.d[f]; } catch (e) { z = null; }
    const vu = !!(d && z && d.img === z.img && d.fait);
    // Un gros plan qui couvre la zone touchée (situé par l'analyse) passe avant les photos sous la lampe
    const gz = vu ? d.g.filter(x => x.box && Math.abs(z.x - x.box.x) <= x.box.l / 2 + 1 && Math.abs(z.y - x.box.y) <= x.box.h / 2 + 1).sort((a, b) => a.box.l * a.box.h - b.box.l * b.box.h)[0] : null;
    const ps = vu ? [d.p[1], d.p[2]].filter(Boolean) : [];
    if (!gz && !ps.length) return baseZoom(i);
    try {
      const [im, ...lums] = await Promise.all([charger(z.img), ...(gz ? [charger(gz.url)] : ps.map(p => charger(p.al)))]);
      const W = im.naturalWidth, H = im.naturalHeight, { hw, hh, cx, cy } = ctrZoomBox(z);
      const sx = (cx - hw) * W, sy = (cy - hh) * H, sw = 2 * hw * W, sh = 2 * hh * H;
      const k = Math.min(4, 1000 / Math.max(sw, sh)), cnv = src => { const cv = document.createElement('canvas'); cv.width = Math.round(sw * k); cv.height = Math.round(sh * k); const g = cv.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(src, sx, sy, sw, sh, 0, 0, cv.width, cv.height); return cv; };
      // Le gros plan entier, à la taille de la zone à plat (rempli, centré)
      const couvre = src => { const cv = document.createElement('canvas'); cv.width = Math.round(sw * k); cv.height = Math.round(sh * k); const g = cv.getContext('2d'); g.imageSmoothingQuality = 'high';
        const w = src.naturalWidth, h = src.naturalHeight, q = Math.max(cv.width / w, cv.height / h); g.drawImage(src, (cv.width - w * q) / 2, (cv.height - h * q) / 2, w * q, h * q); return cv; };
      const lum = gz ? null : lums.map(l => [l, relief(l, sx, sy, sw, sh)]).sort((a, b) => b[1] - a[1])[0][0];
      const row = N.rows.find(r => r[0] === z.k), dlg = document.createElement('dialog'); dlg.className = 'ph-view ctr-zv';
      dlg.innerHTML = `<form method="dialog"><button class="ph-view-in" aria-label="${T('Fermer')}"><span class="lum-pair"><figure data-k="plat"><figcaption>${T('À plat')}</figcaption></figure><figure data-k="lampe"><figcaption>${gz ? T('Gros plan') : T('Lampe sur le côté')}</figcaption></figure></span></button>${row ? `<div class="ctr-zv-cap"><b>${T(row[1])} · ${T(row[3])}</b>${row[4] ? `<span>${esc(row[4])}</span>` : ''}</div>` : ''}</form>`;
      dlg.querySelector('[data-k="plat"]').prepend(cnv(im)); dlg.querySelector('[data-k="lampe"]').prepend(gz ? couvre(lums[0]) : cnv(lum));
      document.body.appendChild(dlg); dlg.addEventListener('close', () => dlg.remove()); dlg.addEventListener('click', () => dlg.close()); dlg.showModal();
    } catch (e) { baseZoom(i); }
  };

  function voirGros(i) {
    const d = etat(LUM.face), x = d.g[i]; if (!x) return;
    const dlg = document.createElement('dialog'); dlg.className = 'ph-view ctr-zv';
    dlg.innerHTML = `<form method="dialog"><button class="ph-view-in" aria-label="${T('Fermer')}"><img class="lum-gros-img" src="${x.url}" alt=""></button><div class="ctr-zv-cap"><b>${T('Gros plan {0}', i + 1)}${x.ou ? ' · ' + esc(x.ou) : ''}</b><button type="button" class="linkbtn" data-retirer="1">${T('Retirer ce gros plan')}</button></div></form>`;
    document.body.appendChild(dlg); dlg.addEventListener('close', () => dlg.remove());
    dlg.addEventListener('click', e => { if (e.target.closest('[data-retirer]')) { e.preventDefault(); d.g.splice(i, 1); if (!d.g.length && !d.p[1] && !d.p[2]) d.skip = false; dlg.close(); render(); } else if (e.target.closest('.ph-view-in') || e.target === dlg) dlg.close(); });
    dlg.showModal();
  }

  /* ---------- Avis sur la bêta ---------- */
  function avis() {
    const dlg = document.createElement('dialog'); dlg.className = 'sheet';
    let juge = '', text = '';
    const draw = () => {
      dlg.innerHTML = `<form class="sheet-in" method="dialog"><b style="font-size:var(--t-l)">${T('Ton avis sur l’analyse poussée')} ${beta()}</b>
      <div class="row lum-juge" role="group">${[['utile', 'Ça m’a aidé'], ['pareil', 'Pas de différence'], ['dur', 'Trop compliqué']].map(([k, l]) => `<button type="button" class="btn small${juge === k ? ' primary' : ''}" data-lv="${k}" aria-pressed="${juge === k}">${T(l)}</button>`).join('')}</div>
      <label class="stack" style="gap:6px"><b style="font-size:var(--t-m)">${T('Un mot de plus ?')}</b><textarea name="t" class="fld" rows="4" maxlength="2000" placeholder="${esc(T('Ce que les photos en plus ont montré, ce qui était difficile…'))}"></textarea></label>
      <div class="btns"><button class="btn" value="cancel" formnovalidate>${T('Annuler')}</button><button class="btn primary" value="ok">${T('Envoyer')}</button></div></form>`;
      dlg.querySelector('textarea').value = text;
    };
    draw(); document.body.appendChild(dlg);
    dlg.addEventListener('input', e => { if (e.target.name === 't') text = e.target.value; });
    dlg.addEventListener('click', e => { const b = e.target.closest('button[data-lv]'); if (b) { juge = b.dataset.lv; draw(); } });
    dlg.addEventListener('close', async () => {
      const t = text.trim(); dlg.remove();
      if (dlg.returnValue !== 'ok' || (!t && !juge)) return;
      const c0 = CTR.key && typeof BYKEY !== 'undefined' && BYKEY.get(CTR.key);
      const faces = FACES.filter(k => fait(k)).map(k => { const x = etat(k).fait; return `${k} : avant PSA ${x.avant ? x.avant.lo + '-' + x.avant.hi + ' ' + x.avant.cond : '?'}, après PSA ${x.apres ? x.apres.lo + '-' + x.apres.hi + ' ' + x.apres.cond : '?'} (${x.lum} photo(s) sous la lampe, ${x.gros || 0} gros plan(s) lus)${x.apres ? ' · ' + x.apres.rows : ''}`; });
      const conseils = FACES.flatMap(k => [1, 2].map(n => { const p = etat(k).p[n]; return p ? `${k} photo ${n} : lumière ${p.axe} ${Math.exp(p.force).toFixed(2)}, ressemblance ${p.corr.toFixed(2)}${p.msg ? ', conseil ' + p.msg : ''}` : ''; })).filter(Boolean);
      const res = [`Avis bêta analyse poussée : ${{ utile: 'ça m’a aidé', pareil: 'pas de différence', dur: 'trop compliqué' }[juge] || '-'}`, t,
        `Carte : ${c0 ? `${cardName(c0, 'fr')} (${CTR.key})` : CTR.key || '?'}`, ...faces, ...conseils].filter(Boolean).join('\n');
      // La photo 1 sous la lampe de la face affichée : pour voir comment les gens s'y prennent
      let shot = '';
      try { const p = etat(LUM.face).p[1] || etat(FACES.find(k => etat(k).p[1]) || 'recto').p[1]; if (p) shot = await shrinkShot(await (await fetch(p.al)).blob()); } catch (er) { shot = ''; }
      try {
        const c = await supa(); if (!c) throw new Error('hors ligne');
        const { error } = await c.from('retours').insert({ kind: 'bug', texte: res.slice(0, 3000), capture: shot || null, page: '#/lumiere avis poussée', langue: UI, appareil: navigator.userAgent.slice(0, 300) });
        if (error) throw error;
        toast(T('Merci, c’est bien reçu !'));
      } catch (er) { toast(T('Envoi impossible. Réessaie plus tard ou écris à request@callitcards.com')); }
    });
    dlg.showModal();
  }

  /* ---------- Gestes ---------- */
  document.addEventListener('click', e => {
    const t = e.target.closest && e.target.closest('[data-lum], a.lum-row'); if (!t) return;
    if (t.matches('a.lum-row')) { const fs = FACES.filter(lue); LUM.face = fs.includes(CTR.side) ? CTR.side : fs[0] || 'recto'; LUM.retour = CTR.mode || 'analyser'; LUM.depuis = true; return; } // le lien ouvre #/lumiere
    const a = t.dataset.lum;
    if (a === 'face' && !LUM.busy && !LUM.run) { LUM.face = t.dataset.v; render(); window.scrollTo(0, 0); }
    else if (a === 'sel' && !LUM.busy && !LUM.run) { const d = etat(LUM.face), n = +t.dataset.n; d.sel = d.sel === n && d.p[n] ? 0 : n; render(); }
    else if (a === 'garder') { etat(LUM.face).sel = 0; render(); }
    else if (a === 'skip') { const d = etat(LUM.face); d.skip = true; d.sel = 0; render(); }
    else if (a === 'gvoir' && !LUM.busy && !LUM.run) voirGros(+t.dataset.i);
    else if (a === 'go') analyser();
    else if (a === 'voir') retour();
    else if (a === 'avis') avis();
  });
  document.addEventListener('change', e => {
    const i = e.target; if (!i || !['lumfile', 'lumfile2', 'lumgros'].includes(i.id) || !i.files || !i.files[0] || route() !== 'lumiere') return;
    if (i.id === 'lumgros') { const fl = [...i.files]; i.value = ''; prendreGros(fl, LUM.face); return; }
    const d = etat(LUM.face), n = d.sel || (!d.p[1] ? 1 : !d.p[2] ? 2 : 0), file = i.files[0]; i.value = '';
    if (n && !d.p[n] && total() >= MAXP) { toast(T('Tu as déjà 8 photos en plus : c’est le maximum.')); return; }
    if (n) prendre(file, LUM.face, n);
  });

  /* ---------- Branchement dans l'appli ---------- */
  const baseRender = render;
  render = function (keepFocus) {
    const r = route(), res = r === 'centrage' || r === 'analyse' || r === 'analysis';
    if (r !== 'lumiere' && !res) LUM.retour = null;
    // Retour sur le résultat : on reste dans « Analyser la carte » (app.js repasse en « Mesurer » en revenant sur #/centrage)
    if (r === 'centrage' && LUM.retour) { CTR.mode = LUM.retour; LUM.retour = null; }
    if (typeof DB !== 'undefined' && DB && r === 'lumiere') {
      document.body.dataset.face = G() ? 'galerie' : 'marche';
      app.innerHTML = view(); document.title = T('Analyse poussée') + ' · CallIt!';
      return;
    }
    baseRender(keepFocus);
    if (!res) return;
    const full = app.querySelector('.ctr-full');
    if (full && !app.querySelector('.lum-bloc')) full.insertAdjacentHTML('afterend', ligne());
  };
  if (route() === 'lumiere') render();
})();
