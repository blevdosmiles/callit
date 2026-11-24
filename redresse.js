/* CallIt! · Redressement de la photo avant de mesurer le centrage.
   Une carte prise de biais forme un trapèze : la mesure gauche/droite serait faussée. On repère les 4 coins
   (automatiquement, puis ajustables au doigt), on remet la carte à plat en rectangle (perspective), et seulement
   ensuite l'outil de centrage (ctrDetect, traits) travaille sur l'image redressée. Tout se fait sur l'appareil.
   Fichier séparé de app.js : il remplace ctrLoad() et s'ajoute au rendu de #/centrage. */
(function () {
  'use strict';
  if (typeof ctrLoad !== 'function' || typeof render !== 'function') return;
  const T = (s, ...a) => (typeof F === 'function' ? F(s, ...a) : s);
  const RD = { open: false, src: null, img: null, q: null, drag: -1 };
  const RATIO = typeof GAME !== 'undefined' && GAME === 'ygo' ? 86 / 59 : 88 / 63; // format de la carte (hauteur / largeur)
  const MARGIN = 0.06;     // fond gardé autour de la carte redressée, pour que l'outil voie les bords

  /* ---------- Détection automatique des 4 coins (proposition de départ, ajustable au doigt) ----------
     On estime la couleur du fond, on sépare carte / fond par un seuil automatique (Otsu), puis on garde
     la PLUS GRANDE zone d'un seul tenant : les bandes noires, la barre du téléphone ou le texte d'une capture
     d'écran sont écartés. Les points extrêmes (x+y, x−y) de cette zone donnent les 4 coins.
     Renvoie { q, ok } : ok = la forme ressemble vraiment à une carte. */
  function detectCorners(img) {
    const W = 200, H = Math.max(2, Math.round(img.naturalHeight * W / img.naturalWidth));
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d'); g.drawImage(img, 0, 0, W, H);
    const d = g.getImageData(0, 0, W, H).data, N = W * H;
    // Fond : la couleur la plus fréquente sur le pourtour (le noir des bandes, le tapis…)
    const border = []; for (let x = 0; x < W; x++) border.push(x, (H - 1) * W + x); for (let y = 0; y < H; y++) border.push(y * W, y * W + W - 1);
    const med = k => { const v = border.map(i => d[i * 4 + k]).sort((a, b) => a - b); return v[v.length >> 1]; };
    const bg = [med(0), med(1), med(2)];
    const dist = new Float32Array(N); for (let i = 0; i < N; i++) dist[i] = Math.abs(d[i * 4] - bg[0]) + Math.abs(d[i * 4 + 1] - bg[1]) + Math.abs(d[i * 4 + 2] - bg[2]);
    // Seuil d'Otsu sur la distance au fond
    const hist = new Float64Array(256); for (let i = 0; i < N; i++) hist[Math.min(255, dist[i] / 3 | 0)]++;
    let sum = 0; for (let t = 0; t < 256; t++) sum += t * hist[t];
    let wB = 0, sB = 0, best = 0, th = 20;
    for (let t = 0; t < 256; t++) { wB += hist[t]; if (!wB || wB === N) continue; sB += t * hist[t]; const mB = sB / wB, mF = (sum - sB) / (N - wB), v = wB * (N - wB) * (mB - mF) ** 2; if (v > best) { best = v; th = t; } }
    th = Math.max(20, th) * 3;
    const m = new Uint8Array(N); for (let i = 0; i < N; i++) m[i] = dist[i] > th ? 1 : 0;
    // Plus grande zone d'un seul tenant
    const lab = new Int32Array(N), stack = new Int32Array(N); let bestLab = 0, bestN = 0, cur = 0;
    for (let i = 0; i < N; i++) {
      if (!m[i] || lab[i]) continue; cur++; let n = 0, sp = 0; stack[sp++] = i; lab[i] = cur;
      while (sp) { const j = stack[--sp]; n++; const x = j % W, y = (j / W) | 0;
        if (x > 0 && m[j - 1] && !lab[j - 1]) { lab[j - 1] = cur; stack[sp++] = j - 1; }
        if (x < W - 1 && m[j + 1] && !lab[j + 1]) { lab[j + 1] = cur; stack[sp++] = j + 1; }
        if (y > 0 && m[j - W] && !lab[j - W]) { lab[j - W] = cur; stack[sp++] = j - W; }
        if (y < H - 1 && m[j + W] && !lab[j + W]) { lab[j + W] = cur; stack[sp++] = j + W; } }
      if (n > bestN) { bestN = n; bestLab = cur; }
    }
    if (!bestLab || bestN < N * 0.05) return { q: defaultCorners(), ok: false };
    let tl, tr, br, bl, edge = 0;
    for (let i = 0; i < N; i++) {
      if (lab[i] !== bestLab) continue; const x = i % W, y = (i / W) | 0, s2 = x + y, t2 = x - y;
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) edge++;
      if (!tl || s2 < tl[2]) tl = [x, y, s2]; if (!br || s2 > br[2]) br = [x, y, s2];
      if (!tr || t2 > tr[2]) tr = [x, y, t2]; if (!bl || t2 < bl[2]) bl = [x, y, t2];
    }
    const P = [tl, tr, br, bl], len = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const top = len(tl, tr), bot = len(bl, br), lef = len(tl, bl), rig = len(tr, br);
    const area = Math.abs(P.reduce((s3, p, k) => { const q2 = P[(k + 1) % 4]; return s3 + p[0] * q2[1] - q2[0] * p[1]; }, 0)) / 2;
    const ratio = ((lef + rig) / 2) / ((top + bot) / 2);
    const ok = area > N * 0.08 && bestN / area > 0.8 && Math.min(top, bot) / Math.max(top, bot) > 0.75 && Math.min(lef, rig) / Math.max(lef, rig) > 0.75
      && ratio > RATIO * 0.8 && ratio < RATIO * 1.25 && edge < (W + H) * 0.1;
    return { q: P.map(p => [(p[0] + 0.5) / W, (p[1] + 0.5) / H]), ok };
  }
  const defaultCorners = () => [[0.1, 0.08], [0.9, 0.08], [0.9, 0.92], [0.1, 0.92]];

  /* ---------- Perspective : homographie et rééchantillonnage ---------- */
  // Matrice qui envoie les 4 points a[i] sur b[i] (résolution d'un système 8×8)
  function homography(a, b) {
    const M = [], v = [];
    for (let i = 0; i < 4; i++) {
      const [x, y] = a[i], [u, w] = b[i];
      M.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); v.push(u);
      M.push([0, 0, 0, x, y, 1, -w * x, -w * y]); v.push(w);
    }
    for (let c = 0; c < 8; c++) {
      let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      [M[c], M[p]] = [M[p], M[c]]; [v[c], v[p]] = [v[p], v[c]];
      for (let r = 0; r < 8; r++) { if (r === c) continue; const f = M[r][c] / M[c][c]; for (let k = c; k < 8; k++) M[r][k] -= f * M[c][k]; v[r] -= f * v[c]; }
    }
    const h = v.map((x, i) => x / M[i][i]); h.push(1); return h;
  }
  function warp(img, q) {
    const sw = img.naturalWidth, sh = img.naturalHeight;
    const s = document.createElement('canvas'); s.width = sw; s.height = sh; const sg = s.getContext('2d'); sg.drawImage(img, 0, 0);
    const sd = sg.getImageData(0, 0, sw, sh).data;
    // Taille de sortie : largeur de la carte ≈ largeur mesurée sur la photo (au plus 900 px)
    const P = q.map(([x, y]) => [x * sw, y * sh]);
    const len = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const cw = Math.min(900, Math.max(300, Math.round((len(P[0], P[1]) + len(P[3], P[2])) / 2)));
    const ch = Math.round(cw * RATIO), mx = Math.round(cw * MARGIN), W = cw + 2 * mx, H = ch + 2 * mx;
    const dst = [[mx, mx], [mx + cw, mx], [mx + cw, mx + ch], [mx, mx + ch]];
    const h = homography(dst, P); // de l'image redressée vers la photo
    const out = new ImageData(W, H), o = out.data;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const z = h[6] * x + h[7] * y + 1, X = (h[0] * x + h[1] * y + h[2]) / z, Y = (h[3] * x + h[4] * y + h[5]) / z;
      const j = (y * W + x) * 4;
      if (X < 0 || Y < 0 || X >= sw - 1 || Y >= sh - 1) { o[j] = o[j + 1] = o[j + 2] = 0; o[j + 3] = 255; continue; }
      const x0 = X | 0, y0 = Y | 0, fx = X - x0, fy = Y - y0, i0 = (y0 * sw + x0) * 4, i1 = i0 + sw * 4;
      for (let k = 0; k < 3; k++) o[j + k] = (sd[i0 + k] * (1 - fx) + sd[i0 + 4 + k] * fx) * (1 - fy) + (sd[i1 + k] * (1 - fx) + sd[i1 + 4 + k] * fx) * fy;
      o[j + 3] = 255;
    }
    const c = document.createElement('canvas'); c.width = W; c.height = H; c.getContext('2d').putImageData(out, 0, 0);
    return c.toDataURL('image/jpeg', 0.92);
  }

  /* ---------- Chargement de la photo : on passe d'abord par les coins ---------- */
  ctrLoad = function (file) {
    const r = new FileReader();
    r.onload = () => { const img = new Image(); img.onload = () => { UNDO.m = []; UNDO.c = []; RD.back = false; CTR.img = null; CTR.L = null; const det = detectCorners(img); RD.src = r.result; RD.img = img; RD.q = det.q; RD.auto = det.ok; frameFrom(det.q, det.ok); RD.h0 = FR.h; CTR.zoom = 1; CTR.sx = CTR.sy = 0; CTR.ia = null; RD.open = true; render(); }; img.src = r.result; };
    r.readAsDataURL(file);
  };
  function apply(straighten) {
    const url = straighten ? warp(RD.img, RD.q) : RD.src;
    const img = new Image();
    const keep = RD.back && CTR.L ? CTR.L.slice() : null; RD.back = false;
    img.onload = () => { CTR.img = url; if (keep) CTR.L = keep; else { try { CTR.L = ctrDetect(img); } catch (e) { CTR.L = [3, 8, 92, 97, 3, 8, 92, 97]; } CTR.sel = 0; } RD.open = false; render(); saveSoon(); };
    img.src = url;
  }

  /* ---------- Vue « Caler le cadre » ----------
     Une carte est toujours un rectangle aux mêmes proportions : on propose un cadre à ce format, calé
     automatiquement si possible, que l'on fait glisser (un doigt), agrandir et tourner (deux doigts) pour le
     poser sur la carte. Les 4 loupes montrent les coins de près ; boutons pour les derniers réglages fins. */
  const FR = { c: [0, 0], h: 0, a: 0, t: 0, s: 0, q: 1 }; // centre (px de la photo), hauteur (px), angle (radians), inclinaison, hauteur relative
  // Coins du cadre sur la photo. t (inclinaison) et q (hauteur) servent quand la photo est prise de biais.
  const frameCorners = () => {
    const hw = FR.h / RATIO / 2, hh = FR.h * FR.q / 2, ca = Math.cos(FR.a), sa = Math.sin(FR.a), [cx, cy] = FR.c;
    const s = FR.s || 0;
    return [[-hw * (1 - FR.t), -hh * (1 + s)], [hw * (1 - FR.t), -hh * (1 - s)], [hw * (1 + FR.t), hh * (1 - s)], [-hw * (1 + FR.t), hh * (1 + s)]].map(([x, y]) => [cx + ca * x - sa * y, cy + sa * x + ca * y]);
  };
  function frameFrom(q, ok) {
    const W = RD.img.naturalWidth, H = RD.img.naturalHeight;
    FR.t = 0; FR.s = 0; FR.q = 1;
    if (!ok) { FR.c = [W / 2, H / 2]; FR.h = Math.min(H * 0.75, W * 0.75 * RATIO); FR.a = 0; return; }
    const P = q.map(([x, y]) => [x * W, y * H]), len = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    FR.c = [P.reduce((t, p) => t + p[0], 0) / 4, P.reduce((t, p) => t + p[1], 0) / 4];
    FR.a = (Math.atan2(P[1][1] - P[0][1], P[1][0] - P[0][0]) + Math.atan2(P[2][1] - P[3][1], P[2][0] - P[3][0])) / 2;
    const hh = (len(P[0], P[3]) + len(P[1], P[2])) / 2, ww = (len(P[0], P[1]) + len(P[3], P[2])) / 2;
    FR.h = (hh + ww * RATIO) / 2;
  }
  /* Le cadre au format carte reste fixe à l'écran ; c'est la photo qui bouge, grandit et tourne dessous
     (comme le recadrage d'une photo de profil). FR décrit où tombe le cadre sur la photo d'origine. */
  const LZ = 4; // grossissement des loupes
  function view() {
    const deg = Math.round(-FR.a * 1800 / Math.PI) / 10;
    return `<div class="top">${backBtn()}<span class="sub" style="font-weight:600">${T('Centrage')}</span><span style="width:44px"></span></div>
    <div class="pad stack" style="gap:12px">
      <div class="rd-step"><span class="rd-dot on">1</span><b>${T('Caler la carte')}</b><span class="rd-sep"></span><span class="rd-dot">2</span><span>${T('Mesurer')}</span></div>
      <h1 class="h1">${T('Caler la carte')}</h1>
      <div class="rd-tips">
        <p>${T('Fais rentrer la carte pile dans le cadre.')}</p>
        <div class="rd-tip"><span class="rd-ic">☝</span><span><b>${T('1 doigt')}</b><br>${T('déplacer la photo')}</span></div>
        <div class="rd-tip"><span class="rd-ic">✌</span><span><b>${T('2 doigts')}</b><br>${T('agrandir et tourner')}</span></div>
        <div class="rd-tip"><span class="rd-ic"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/></svg></span><span><b>${T('Loupes')}</b><br>${T('régler les coins au plus près')}</span></div>
      </div>
      <div class="rd-state${RD.auto ? ' ok' : ''}">${RD.auto ? '✓ ' + T('Carte repérée, vérifie les coins') : T('Place la carte dans le cadre à la main')}</div>
      <div class="rd-view" id="rdview"><canvas id="rdcv"></canvas><svg class="rd-frame" id="rdframe"><path class="rd-dim" fill-rule="evenodd"/><path class="rd-fr"/></svg></div>
      <label class="rd-slider"><span>${T('Échelle')}</span><input type="range" id="rdscale" min="-100" max="100" step="1" value="0"><b class="num" id="rdzoom">×1</b></label>
      <label class="rd-slider"><span>${T('Angle')}</span><input type="range" id="rdangle" min="-300" max="300" step="1" value="${Math.round(deg * 10)}"><b class="num" id="rddeg">${deg}°</b></label>
      <div class="rd-nudge"><div class="row" style="justify-content:space-between;align-items:center"><span class="small">${T('Ajuster doucement')}</span>${undoBtn('c')}</div>
        <div class="rd-nb">${[[['l', '←'], ['r', '→'], ['u', '↑'], ['d', '↓']], [['ccw', '↺'], ['cw', '↻']], [['out', '−'], ['in', '+']]].map(g => `<span class="rd-grp">${g.map(([k, s]) => `<button class="btn small" data-rn="${k}" aria-label="${k}">${s}</button>`).join('')}</span>`).join('')}</div></div>
      <div class="rd-incl">
        <div class="row" style="justify-content:space-between;align-items:center"><b class="small">${T('Inclinaison')}</b>${FR.t || FR.s || FR.q !== 1 ? `<button class="btn small" data-rd="flat">${T('Remettre à plat')}</button>` : ''}</div>
        <div class="small rd-incl-help">${T('Photo prise de biais : la carte paraît plus large d’un côté. Rends le cadre pareil.')}</div>
        <label class="rd-slider"><span>${T('Haut / bas')}</span><input type="range" id="rdtilt" min="-40" max="40" step="1" value="${Math.round(FR.t * 100)}"><b class="num" id="rdtiltv">${Math.round(FR.t * 100)}</b></label>
        <label class="rd-slider"><span>${T('Gauche / droite')}</span><input type="range" id="rdside" min="-40" max="40" step="1" value="${Math.round((FR.s || 0) * 100)}"><b class="num" id="rdsidev">${Math.round((FR.s || 0) * 100)}</b></label>
        <label class="rd-slider"><span>${T('Hauteur')}</span><input type="range" id="rdq" min="-50" max="50" step="1" value="${Math.round((FR.q - 1) * 100)}"><b class="num" id="rdqv">${Math.round((FR.q - 1) * 100)}</b></label>
      </div>
      <div class="rd-loupes">${[0, 1, 3, 2].map(i => `<div class="rd-lp"><canvas class="rd-loupe" data-i="${i}"></canvas><span class="rd-lb">${'↖↗↘↙'[i]}</span></div>`).join('')}</div>
      <div class="row" style="gap:8px;flex-wrap:wrap;justify-content:center">${CTR.img ? `<button class="btn small" data-rd="back">${T('Revenir à la mesure')}</button>` : `<button class="btn small" data-rd="skip">${T('Garder telle quelle')}</button>`}<button class="btn small primary" data-rd="ok">${T('Valider')}</button></div>
    </div>`;
  }
  // Géométrie de l'écran : taille de la vue, cadre fixe au centre, échelle photo → écran
  function geo() {
    const v = document.getElementById('rdview'); if (!v) return null;
    const vw = v.clientWidth, vh = v.clientHeight, fh = vh * 0.84, fw = fh / RATIO;
    return { v, vw, vh, fw, fh, F: [vw / 2, vh / 2], k: fh / FR.h };
  }
  // Dessine la photo telle qu'elle tombe sous le cadre (ctx déjà placé dans le repère de l'écran)
  function paint(ctx, G) {
    ctx.translate(G.F[0], G.F[1]); ctx.rotate(-FR.a); ctx.scale(G.k, G.k); ctx.translate(-FR.c[0], -FR.c[1]);
    ctx.drawImage(RD.img, 0, 0);
  }
  // Contour du cadre aux coins arrondis, comme une vraie carte (rayon ≈ 5 % de la largeur)
  function roundPath(C, r) {
    const at = (a, b, d) => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, t = Math.min(d / l, .5); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; };
    let d = '';
    C.forEach((p, i) => { const a = at(p, C[(i + 3) % 4], r), b = at(p, C[(i + 1) % 4], r); d += `${i ? 'L' : 'M'}${a[0]} ${a[1]}Q${p[0]} ${p[1]} ${b[0]} ${b[1]}`; });
    return d + 'Z';
  }
  function fit(cv) { const r = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight; if (cv.width !== Math.round(w * r)) { cv.width = Math.round(w * r); cv.height = Math.round(h * r); } return r; }
  function refresh() {
    const G = geo(); if (!G || !RD.img) return;
    const cv = document.getElementById('rdcv'), r = fit(cv), ctx = cv.getContext('2d');
    ctx.setTransform(r, 0, 0, r, 0, 0); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, G.vw, G.vh); ctx.save(); paint(ctx, G); ctx.restore();
    const ca = Math.cos(FR.a), sa = Math.sin(FR.a), toS = ([x, y]) => { const dx = x - FR.c[0], dy = y - FR.c[1]; return [G.F[0] + (ca * dx + sa * dy) * G.k, G.F[1] + (-sa * dx + ca * dy) * G.k]; };
    const C = frameCorners().map(toS), fr = document.getElementById('rdframe'), pts = C.map(p => p.join(',')).join(' ');
    fr.setAttribute('viewBox', `0 0 ${G.vw} ${G.vh}`); const rp = roundPath(C, G.fw * 0.05); fr.querySelector('.rd-fr').setAttribute('d', rp);
    fr.querySelector('.rd-dim').setAttribute('d', `M0 0H${G.vw}V${G.vh}H0Z ${rp}`);
    document.querySelectorAll('canvas.rd-loupe').forEach(el => {
      const i = +el.dataset.i, rr = fit(el), lw = el.clientWidth, lh = el.clientHeight, c = el.getContext('2d');
      c.setTransform(rr, 0, 0, rr, 0, 0); c.fillStyle = '#000'; c.fillRect(0, 0, lw, lh);
      c.save(); c.translate(lw / 2, lh / 2); c.scale(LZ, LZ); c.translate(-C[i][0], -C[i][1]); paint(c, G); c.restore();
      const P = C[(i + 3) % 4], N2 = C[(i + 1) % 4], L = p => [lw / 2 + (p[0] - C[i][0]) * LZ, lh / 2 + (p[1] - C[i][1]) * LZ]; // l'angle du cadre
      c.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--gain').trim() || '#0a7a44'; c.lineWidth = 2.5; c.lineCap = 'round'; c.beginPath(); c.moveTo(...L(P)); c.arcTo(lw / 2, lh / 2, ...L(N2), G.fw * 0.05 * LZ); c.lineTo(...L(N2)); c.stroke();
    });
    const sl = document.getElementById('rdangle'), deg = -FR.a * 180 / Math.PI; if (sl && document.activeElement !== sl) sl.value = Math.round(deg * 10);
    const dg = document.getElementById('rddeg'); if (dg) dg.textContent = (Math.round(deg * 10) / 10) + '°';
    const sc = document.getElementById('rdscale'); if (sc && document.activeElement !== sc && RD.h0) sc.value = Math.round(Math.log2(RD.h0 / FR.h) * 100);
    const zm = document.getElementById('rdzoom'); if (zm && RD.h0) zm.textContent = '×' + (Math.round(RD.h0 / FR.h * 10) / 10);
  }
  // Déplacer la photo de (dx, dy) pixels d'écran ; tourner/agrandir la photo autour du centre du cadre
  const movePhoto = (dx, dy, k) => { const ca = Math.cos(FR.a), sa = Math.sin(FR.a); FR.c = [FR.c[0] - (ca * dx - sa * dy) / k, FR.c[1] - (sa * dx + ca * dy) / k]; };
  const PTS = new Map(); let g0 = null;
  const gesture = () => {
    const v = [...PTS.values()].map(p => p.xy);
    if (v.length >= 2) { const [p, q] = v; return { two: true, d: Math.hypot(q[0] - p[0], q[1] - p[1]) || 1, ang: Math.atan2(q[1] - p[1], q[0] - p[0]), m: [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2] }; }
    return { two: false, m: v[0] };
  };
  document.addEventListener('pointerdown', e => {
    if (!RD.open || !e.target.closest) return;
    const onView = e.target.closest('#rdview'), lp = e.target.closest('canvas.rd-loupe'); if (!onView && !lp) return;
    e.preventDefault(); PTS.set(e.pointerId, { xy: [e.clientX, e.clientY], gain: lp ? 1 / LZ : 1 }); g0 = gesture();
  });
  document.addEventListener('pointermove', e => {
    const pt = PTS.get(e.pointerId); if (!pt || !g0) return; pt.xy = [e.clientX, e.clientY];
    const G = geo(); if (!G) return; const g = gesture();
    movePhoto((g.m[0] - g0.m[0]) * pt.gain, (g.m[1] - g0.m[1]) * pt.gain, G.k);
    if (g0.two && g.two) { FR.h = Math.max(10, FR.h * g0.d / g.d); FR.a -= g.ang - g0.ang; }
    g0 = g; refresh();
  });
  const up = e => { if (!PTS.has(e.pointerId)) return; PTS.delete(e.pointerId); g0 = PTS.size ? gesture() : null; };
  document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
  document.addEventListener('input', e => {
    if (!RD.open) return;
    if (e.target.id === 'rdangle') { FR.a = -(+e.target.value / 10) * Math.PI / 180; refresh(); }
    else if (e.target.id === 'rdtilt') { FR.t = +e.target.value / 100; document.getElementById('rdtiltv').textContent = e.target.value; refresh(); }
    else if (e.target.id === 'rdside') { FR.s = +e.target.value / 100; document.getElementById('rdsidev').textContent = e.target.value; refresh(); }
    else if (e.target.id === 'rdq') { FR.q = 1 + +e.target.value / 100; document.getElementById('rdqv').textContent = e.target.value; refresh(); }
    else if (e.target.id === 'rdscale' && RD.h0) { FR.h = RD.h0 / Math.pow(2, +e.target.value / 100); refresh(); }
  });
  // Ordinateur : molette = échelle, Maj + molette = angle
  document.addEventListener('wheel', e => {
    if (!RD.open || !(e.target.closest && e.target.closest('#rdview'))) return; e.preventDefault();
    if (e.shiftKey) FR.a += (e.deltaY > 0 ? 1 : -1) * Math.PI / 1800; else FR.h *= e.deltaY > 0 ? 1.01 : 0.99; refresh();
  }, { passive: false });
  window.addEventListener('resize', () => { if (RD.open) refresh(); });
  // Petits boutons : ajuster tout doucement (appui long = répète)
  const nudge = k => {
    const G = geo(); if (!G) return; const s = 0.5;
    if (k === 'l') movePhoto(-s, 0, G.k); else if (k === 'r') movePhoto(s, 0, G.k); else if (k === 'u') movePhoto(0, -s, G.k); else if (k === 'd') movePhoto(0, s, G.k);
    else if (k === 'ccw') FR.a += Math.PI / 1800; else if (k === 'cw') FR.a -= Math.PI / 1800;
    else if (k === 'in') FR.h /= 1.004; else if (k === 'out') FR.h *= 1.004;
    refresh();
  };
  let rnT = null; const rnStop = () => { clearTimeout(rnT); clearInterval(rnT); rnT = null; };
  document.addEventListener('pointerdown', e => {
    const b = RD.open && e.target.closest && e.target.closest('[data-rn]'); if (!b) return; e.preventDefault();
    rnStop(); nudge(b.dataset.rn); rnT = setTimeout(() => { rnT = setInterval(() => nudge(b.dataset.rn), 50); }, 350);
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => document.addEventListener(t, rnStop));
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-rd]'); if (!b) return;
    const a = b.dataset.rd;
    if (a === 'ok') { const W = RD.img.naturalWidth, H = RD.img.naturalHeight; RD.q = frameCorners().map(([x, y]) => [x / W, y / H]); apply(true); }
    else if (a === 'skip') apply(false);
    else if (a === 'back') { RD.open = false; RD.back = false; render(); window.scrollTo(0, 0); }
    else if (a === 'again' && RD.src) { RD.back = !!CTR.img; RD.open = true; render(); window.scrollTo(0, 0); }
    else if (a === 'undo') undo();
    else if (a === 'flat') { push('c'); FR.t = 0; FR.s = 0; FR.q = 1; render(); saveSoon(); }
  });

  /* ---------- Branchement dans le rendu de #/centrage ---------- */
  const route = () => location.hash.replace(/^#\/?/, '').split(/[/?]/)[0];
  const baseRender = render;
  render = function (keepFocus) {
    if (DB && route() === 'centrage' && RD.open && RD.src) {
      app.innerHTML = view(); document.title = 'Centrage · CallIt!';
      refresh(); return;
    }
    if (route() !== 'centrage') RD.open = false;
    baseRender(keepFocus);
    if (route() !== 'centrage') return;
    if (!restored) { restored = true; if (!CTR.img && !RD.src) restore(); }
    // Après la mesure : annuler, ou revenir au calage sans perdre les traits
    if (RD.src && CTR.img) {
      const w = app.querySelector('#ctrscroll');
      if (w && !app.querySelector('[data-rd="again"]')) w.insertAdjacentHTML('afterend', `<div class="row" style="gap:8px;flex-wrap:wrap">${undoBtn('m')}<button class="btn small" data-rd="again">${T('Revenir au calage')}</button></div>`);
    } else if (CTR.img) {
      const w = app.querySelector('#ctrscroll');
      if (w && !app.querySelector('[data-rd="undo"]')) w.insertAdjacentHTML('afterend', `<div class="row">${undoBtn('m')}</div>`);
    } else if (RD.src && !RD.open) {
      // Photo chargée mais calage quitté : on la reprend là où on en était
      const t = app.querySelector('.face');
      if (t && !app.querySelector('[data-rd="again"]')) t.insertAdjacentHTML('afterend', `<button class="btn small primary" data-rd="again" style="align-self:flex-start">${T('Reprendre ma photo')}</button>`);
    }
  };

  /* ---------- Annuler (retour en arrière) et sauvegarde automatique du travail en cours ----------
     Chaque geste (trait déplacé, cadre bougé, petit bouton, curseur) garde d'abord l'état d'avant :
     « Annuler » y revient, une étape à la fois. Le travail (photos, calage, traits, recto et verso) est
     gardé sur l'appareil (IndexedDB) : fermer l'appli ou revenir en arrière ne fait rien perdre. */
  const UNDO = { m: [], c: [] };
  function undoBtn(k) { return `<button class="btn small" data-rd="undo" data-k="${k}"${UNDO[k].length ? '' : ' disabled'}>↶ ${T('Annuler')}</button>`; }
  const snapM = () => JSON.stringify({ L: CTR.L, sel: CTR.sel });
  const snapC = () => JSON.stringify(FR);
  function push(k) {
    const st = k === 'm' ? snapM() : snapC(), u = UNDO[k];
    if (u[u.length - 1] !== st) { u.push(st); if (u.length > 80) u.shift(); }
  }
  function undo() {
    const k = RD.open ? 'c' : 'm', u = UNDO[k]; if (!u.length) return;
    const cur = k === 'm' ? snapM() : snapC(); let st = u.pop();
    while (st === cur && u.length) st = u.pop(); // un geste sans effet ne compte pas
    if (st === cur) return;
    const o = JSON.parse(st);
    if (k === 'm') { CTR.L = o.L; CTR.sel = o.sel; } else Object.assign(FR, o);
    render(); saveSoon();
  }
  // Avant chaque geste, on garde l'état (phase de capture : avant que le geste ne change quoi que ce soit)
  document.addEventListener('pointerdown', e => {
    if (route() !== 'centrage' || !e.target.closest) return;
    if (RD.open) { if (e.target.closest('#rdview, canvas.rd-loupe, [data-rn], .rd-slider input, [data-rd="flat"]')) push('c'); }
    else if (CTR.L && e.target.closest('#ctrwrap, #ctrloupe, [data-act="ctrnudge"]')) push('m');
  }, true);
  document.addEventListener('keydown', e => { if (RD.open && e.target.closest && e.target.closest('.rd-slider input')) push('c'); }, true);
  const refreshUndo = () => document.querySelectorAll('[data-rd="undo"]').forEach(b => { b.disabled = !UNDO[b.dataset.k].length; });
  ['pointerup', 'change'].forEach(t => document.addEventListener(t, () => { if (route() === 'centrage') { setTimeout(refreshUndo, 0); saveSoon(); } }));

  // Recto / verso : chaque face garde aussi sa photo d'origine et son calage
  const RDF = {};
  const rdSnap = () => RD.src ? { src: RD.src, fr: { ...FR }, auto: RD.auto, h0: RD.h0, q: RD.q } : null;
  function rdPut(o, done) {
    if (!o) { RD.src = null; RD.img = null; if (done) done(); return; }
    const img = new Image(); img.onload = () => { RD.img = img; RD.src = o.src; Object.assign(FR, o.fr); RD.auto = o.auto; RD.h0 = o.h0; RD.q = o.q; if (done) done(); }; img.src = o.src;
  }
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-act="ctrside"]'); if (!b || b.dataset.v === CTR.side) return;
    RDF[CTR.side] = rdSnap(); const to = b.dataset.v; UNDO.m = []; UNDO.c = [];
    RD.src = null; RD.img = null; rdPut(RDF[to], () => { render(); saveSoon(); });
  }, true);

  // Sauvegarde sur l'appareil
  let restored = false, saveT = null;
  const idb = () => new Promise((ok, ko) => { const r = indexedDB.open('callit-centrage', 1); r.onupgradeneeded = () => r.result.createObjectStore('w'); r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); });
  const idbDo = (mode, f) => idb().then(db => new Promise((ok, ko) => { const t = db.transaction('w', mode), st = t.objectStore('w'), r = f(st); t.oncomplete = () => ok(r && r.result); t.onerror = () => ko(t.error); }));
  function saveSoon() { clearTimeout(saveT); saveT = setTimeout(save, 600); }
  function save() {
    if (!CTR.img && !RD.src) return;
    const faces = {}; for (const k of ['recto', 'verso']) faces[k] = k === CTR.side ? null : { ...(CTR.faces[k] || {}), rd: RDF[k] || null };
    const w = { at: Date.now(), side: CTR.side, key: CTR.key, img: CTR.img, L: CTR.L, sel: CTR.sel, rd: rdSnap(), open: RD.open, faces };
    try { idbDo('readwrite', st => st.put(JSON.parse(JSON.stringify(w)), 'work')).catch(() => {}); } catch (e) { /* stockage indisponible */ }
  }
  function restore() {
    try {
      idbDo('readonly', st => st.get('work')).then(w => {
        if (!w || CTR.img || RD.src || route() !== 'centrage') return;
        CTR.side = w.side || 'recto'; if (w.key && !CTR.key) CTR.key = w.key; CTR.img = w.img || null; CTR.L = w.L || null; CTR.sel = w.sel || 0;
        for (const k of ['recto', 'verso']) { const f = w.faces && w.faces[k]; if (f) { RDF[k] = f.rd || null; delete f.rd; CTR.faces[k] = f; } }
        rdPut(w.rd, () => { RD.open = !!w.open && !!RD.src; render(); if (typeof toast === 'function') toast(T('Ton centrage en cours est revenu')); });
      }).catch(() => {});
    } catch (e) { /* stockage indisponible */ }
  }
  window.addEventListener('pagehide', () => { if (route() === 'centrage') save(); });
})();
