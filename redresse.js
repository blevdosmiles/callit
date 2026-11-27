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
    // Précision : 400 px de large. Chaque côté est une droite ajustée sur le contour (les coins arrondis ne tirent plus le cadre vers l'intérieur).
    const W = 400, H = Math.max(2, Math.round(img.naturalHeight * W / img.naturalWidth));
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, W, H);
    const d = g.getImageData(0, 0, W, H).data, N = W * H;
    const border = []; for (let x = 0; x < W; x++) border.push(x, (H - 1) * W + x); for (let y = 0; y < H; y++) border.push(y * W, y * W + W - 1);
    const med = k => { const v = border.map(i => d[i * 4 + k]).sort((a, b) => a - b); return v[v.length >> 1]; };
    const bg = [med(0), med(1), med(2)];
    const dist = new Float32Array(N); for (let i = 0; i < N; i++) dist[i] = Math.abs(d[i * 4] - bg[0]) + Math.abs(d[i * 4 + 1] - bg[1]) + Math.abs(d[i * 4 + 2] - bg[2]);
    const hist = new Float64Array(256); for (let i = 0; i < N; i++) hist[Math.min(255, dist[i] / 3 | 0)]++;
    let sum = 0; for (let t = 0; t < 256; t++) sum += t * hist[t];
    let wB = 0, sB = 0, best = 0, th = 20;
    for (let t = 0; t < 256; t++) { wB += hist[t]; if (!wB || wB === N) continue; sB += t * hist[t]; const mB = sB / wB, mF = (sum - sB) / (N - wB), v = wB * (N - wB) * (mB - mF) ** 2; if (v > best) { best = v; th = t; } }
    th = Math.max(20, th) * 3;
    // Plusieurs façons de séparer la carte du fond, essayées dans l'ordre : la première qui donne une carte crédible gagne.
    const tryMask = m => {
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
      if (!bestLab || bestN < N * 0.05) return null;
      // Boîte de la zone, puis points du contour sur la partie centrale de chaque côté
      let x0 = W, x1 = 0, y0 = H, y1 = 0;
      for (let i = 0; i < N; i++) if (lab[i] === bestLab) { const x = i % W, y = (i / W) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      const L = [], R = [], T = [], B = [];
      for (let y = Math.round(y0 + (y1 - y0) * 0.15); y <= y0 + (y1 - y0) * 0.85; y++) { let a = -1, b = -1; for (let x = x0; x <= x1; x++) if (lab[y * W + x] === bestLab) { if (a < 0) a = x; b = x; } if (a >= 0) { L.push([y, a]); R.push([y, b + 1]); } }
      for (let x = Math.round(x0 + (x1 - x0) * 0.15); x <= x0 + (x1 - x0) * 0.85; x++) { let a = -1, b = -1; for (let y = y0; y <= y1; y++) if (lab[y * W + x] === bestLab) { if (a < 0) a = y; b = y; } if (a >= 0) { T.push([x, a]); B.push([x, b + 1]); } }
      // Droite v = p*u + c, ajustée deux fois en écartant les points éloignés (encoche, reflet, doigt…)
      const fit = pts => { let P = pts; let p = 0, c = 0; for (let k = 0; k < 3; k++) { const n = P.length; if (n < 5) break; let su = 0, sv = 0, suu = 0, suv = 0; for (const [u, v] of P) { su += u; sv += v; suu += u * u; suv += u * v; } p = (n * suv - su * sv) / (n * suu - su * su || 1); c = (sv - p * su) / n; const res = P.map(([u, v]) => Math.abs(v - (p * u + c))).sort((a, b) => a - b); const lim = Math.max(1.5, res[Math.floor(res.length * 0.6)] * 2.5); P = pts.filter(([u, v]) => Math.abs(v - (p * u + c)) <= lim); } return { p, c, n: P.length / Math.max(1, pts.length) }; };
      const fl = fit(L), fr = fit(R), ft = fit(T), fb = fit(B);
      // Intersection d'une droite verticale x = p*y + c et d'une horizontale y = q*x + e
      const cross = (v, h) => { const y = (h.p * v.c + h.c) / (1 - h.p * v.p); return [v.p * y + v.c, y]; };
      const P = [cross(fl, ft), cross(fr, ft), cross(fr, fb), cross(fl, fb)];
      const len = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
      const top = len(P[0], P[1]), bot = len(P[3], P[2]), lef = len(P[0], P[3]), rig = len(P[1], P[2]);
      const area = Math.abs(P.reduce((s3, p, k) => { const q2 = P[(k + 1) % 4]; return s3 + p[0] * q2[1] - q2[0] * p[1]; }, 0)) / 2;
      const ratio = ((lef + rig) / 2) / ((top + bot) / 2);
      const inside = P.every(([x, y]) => x > -W * 0.02 && y > -H * 0.02 && x < W * 1.02 && y < H * 1.02);
      // Côtés à peu près d'équerre : une forme penchée de travers vient d'une mauvaise séparation carte / fond.
    const square = Math.abs(fl.p + ft.p) < 0.12 && Math.abs(fr.p + fb.p) < 0.12 && Math.abs(fl.p - fr.p) < 0.12 && Math.abs(ft.p - fb.p) < 0.12;
    const fitsOk = square && [fl, fr, ft, fb].every(f => f.n > 0.5);
      let solid = 0; for (let y = y0; y <= y1; y++) { let a = -1, b = -1; for (let x = x0; x <= x1; x++) if (lab[y * W + x] === bestLab) { if (a < 0) a = x; b = x; } if (a >= 0) solid += b - a + 1; }
      const checks = { area: area > N * 0.08, fill: solid / area, sym: Math.min(top, bot) / Math.max(top, bot) > 0.75 && Math.min(lef, rig) / Math.max(lef, rig) > 0.75, ratio, inside, fitsOk };
      const ok = checks.area && checks.fill > 0.85 && checks.fill < 1.08 && checks.sym && ratio > RATIO * 0.8 && ratio < RATIO * 1.25 && inside && fitsOk;
      return { q: P.map(p => [p[0] / W, p[1] / H]), ok };
    };
    // Carte sombre (dos bleu) sur fond sombre : on remplit le fond depuis le pourtour de la photo tant que la couleur
    // reste grise (fond neutre) ou proche du fond ; tout ce que ce remplissage n'atteint pas fait partie de la carte.
    const chroma = new Float32Array(N); for (let i = 0; i < N; i++) chroma[i] = Math.max(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]) - Math.min(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]);
    const p90 = a => { const v = border.map(i => a[i]).sort((x, y) => x - y); return v[Math.floor(v.length * 0.9)]; };
    const flood = isBg => { const seen = new Uint8Array(N), st = new Int32Array(N); let sp = 0;
      for (const i of border) if (isBg(i) && !seen[i]) { seen[i] = 1; st[sp++] = i; }
      while (sp) { const j = st[--sp], x = j % W; for (const k of [x > 0 ? j - 1 : -1, x < W - 1 ? j + 1 : -1, j - W, j + W]) if (k >= 0 && k < N && !seen[k] && isBg(k)) { seen[k] = 1; st[sp++] = k; } }
      const m = new Uint8Array(N); for (let i = 0; i < N; i++) m[i] = seen[i] ? 0 : 1; return m; };
    const cb = p90(chroma), db = p90(dist); let r = null;
    // Fond neutre (gris, noir) : la couleur suffit à trouver la carte, et une pochette transparente reste grise,
    // donc on cadre la carte et pas la pochette.
    if (cb < 40) { const tc = Math.max(40, cb * 2.5); r = tryMask(flood(i => chroma[i] <= tc)); if (r && r.ok) return r; }
    const m1 = new Uint8Array(N); for (let i = 0; i < N; i++) m1[i] = dist[i] > th ? 1 : 0;
    r = tryMask(m1); if (r && r.ok) return r;
    const tl = Math.max(60, db * 1.3); if (tl < th) { r = tryMask(flood(i => dist[i] <= tl)); if (r && r.ok) return r; }
    return { q: defaultCorners(), ok: false };
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
  function warp(img, q, margin = MARGIN, maxW = 900) {
    const sw = img.naturalWidth, sh = img.naturalHeight;
    const s = document.createElement('canvas'); s.width = sw; s.height = sh; const sg = s.getContext('2d'); sg.drawImage(img, 0, 0);
    const sd = sg.getImageData(0, 0, sw, sh).data;
    // Taille de sortie : largeur de la carte ≈ largeur mesurée sur la photo (au plus 900 px ; le scan relit le numéro en 1 600 px)
    const P = q.map(([x, y]) => [x * sw, y * sh]);
    const len = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const cw = Math.min(maxW, Math.max(300, Math.round((len(P[0], P[1]) + len(P[3], P[2])) / 2)));
    const ch = Math.round(cw * RATIO), mx = Math.round(cw * margin), W = cw + 2 * mx, H = ch + 2 * mx;
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

  // La collection s'en sert pour la photo d'un exemplaire (collection.js) : mêmes coins, même remise à plat, sans fond autour.
  window.CallItRedresse = { detectCorners, warp };

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
    img.onload = () => { CTR.img = url; CTR.asp = img.naturalWidth / img.naturalHeight; if (keep) CTR.L = keep; else { try { CTR.L = ctrDetect(img, straighten ? { x: MARGIN / (1 + 2 * MARGIN) * 100, y: MARGIN / (RATIO + 2 * MARGIN) * 100 } : null); } catch (e) { CTR.L = [3, 8, 92, 97, 3, 8, 92, 97]; } CTR.sel = 0; } RD.open = false; render(); saveSoon(); };
    img.src = url;
  }

  /* ---------- Vue « Caler le cadre » ----------
     Une carte est toujours un rectangle aux mêmes proportions : on propose un cadre à ce format, calé
     automatiquement si possible, que l'on fait glisser (un doigt), agrandir et tourner (deux doigts) pour le
     poser sur la carte. Les 4 loupes montrent les coins de près ; boutons pour les derniers réglages fins. */
  const FR = { c: [0, 0], h: 0, a: 0, t: 0, s: 0, q: 1, w: 1 }; // centre (px de la photo), hauteur (px), angle (radians), inclinaison, hauteur relative
  // Coins du cadre sur la photo. t (inclinaison) et q (hauteur) servent quand la photo est prise de biais.
  const frameCorners = () => {
    const hw = FR.h / RATIO * (FR.w || 1) / 2, hh = FR.h * FR.q / 2, ca = Math.cos(FR.a), sa = Math.sin(FR.a), [cx, cy] = FR.c;
    const s = FR.s || 0;
    const D = FR.d || [[0, 0], [0, 0], [0, 0], [0, 0]]; // petits écarts propres à chaque coin (bords pas tout à fait parallèles)
    return [[-hw * (1 - FR.t), -hh * (1 + s)], [hw * (1 - FR.t), -hh * (1 - s)], [hw * (1 + FR.t), hh * (1 - s)], [-hw * (1 + FR.t), hh * (1 + s)]]
      .map(([x, y], i) => [x + D[i][0] * FR.h, y + D[i][1] * FR.h]).map(([x, y]) => [cx + ca * x - sa * y, cy + sa * x + ca * y]);
  };
  // Cadre posé sur 4 coins quelconques (photo penchée) : position, angle, taille et inclinaison dans les deux sens
  function frameFromQuad(q) {
    const W = RD.img.naturalWidth, H = RD.img.naturalHeight, P = q.map(([x, y]) => [x * W, y * H]), len = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    FR.c = [P.reduce((t, p) => t + p[0], 0) / 4, P.reduce((t, p) => t + p[1], 0) / 4];
    FR.a = (Math.atan2(P[1][1] - P[0][1], P[1][0] - P[0][0]) + Math.atan2(P[2][1] - P[3][1], P[2][0] - P[3][0])) / 2;
    const wt = len(P[0], P[1]), wb = len(P[3], P[2]), hl = len(P[0], P[3]), hr = len(P[1], P[2]);
    const cl = v => Math.max(-0.4, Math.min(0.4, v));
    FR.t = cl((wb - wt) / (wb + wt)); FR.s = cl((hl - hr) / (hl + hr));
    FR.h = (wt + wb) / 2 * RATIO; FR.q = Math.max(0.5, Math.min(1.5, (hl + hr) / 2 / FR.h)); FR.w = 1;
    // Ce qui reste (un côté plus penché que l'autre…) : écart de chaque coin, pour que le cadre colle exactement aux 4 bords
    FR.d = null; const M = frameCorners(), ca = Math.cos(FR.a), sa = Math.sin(FR.a);
    FR.d = P.map((p, i) => { const dx = p[0] - M[i][0], dy = p[1] - M[i][1]; return [(ca * dx + sa * dy) / FR.h, (-sa * dx + ca * dy) / FR.h]; });
  }
  // « Coller aux bords » : autour du cadre posé à la main, on cherche le vrai bord de la carte de chaque côté
  // (changement de couleur le plus net), on y ajuste une droite, et les 4 croisements deviennent le cadre.
  let SNAP = null;
  function snapEdges() {
    const img = RD.img; if (!img) return null;
    if (!SNAP || SNAP.img !== img) { const k = Math.min(1, 900 / Math.max(img.naturalWidth, img.naturalHeight)), w = Math.round(img.naturalWidth * k), h = Math.round(img.naturalHeight * k), c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, w, h); SNAP = { img, k, w, h, d: g.getImageData(0, 0, w, h).data }; }
    const { k, w, h, d } = SNAP, C = frameCorners().map(([x, y]) => [x * k, y * k]);
    const px = (x, y) => { x = Math.max(0, Math.min(w - 1, Math.round(x))); y = Math.max(0, Math.min(h - 1, Math.round(y))); const o = (y * w + x) * 4; return [d[o], d[o + 1], d[o + 2]]; };
    const lines = [];
    for (let s0 = 0; s0 < 4; s0++) {
      const A = C[s0], B = C[(s0 + 1) % 4], L = Math.hypot(B[0] - A[0], B[1] - A[1]), tx = (B[0] - A[0]) / L, ty = (B[1] - A[1]) / L, nx = ty, ny = -tx; // normale vers l'extérieur
      // Pour chaque point du côté : tous les sauts nets (le bord de la carte, mais aussi celui d'une pochette ou
      // le cadre imprimé). On garde ensuite la droite qui passe par le plus de points sur toute la longueur :
      // un mélange (pochette en haut, carte en bas) ne fait pas une droite et n'est donc jamais retenu.
      const R = Math.max(6, FR.h * k * 0.035), S = [];
      for (let u = 0.12; u <= 0.881; u += 0.02) {
        const bx = A[0] + (B[0] - A[0]) * u, by = A[1] + (B[1] - A[1]) * u; let best = 0; const G = [];
        for (let r = -R; r <= R; r += 0.5) { const a = px(bx + nx * (r - 1.5), by + ny * (r - 1.5)), b = px(bx + nx * (r + 1.5), by + ny * (r + 1.5)); const g2 = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]); G.push([r, g2]); if (g2 > best) best = g2; }
        const cand = []; if (best > 40) for (let j = 1; j < G.length - 1; j++) if (G[j][1] >= best * 0.4 && G[j][1] >= G[j - 1][1] && G[j][1] >= G[j + 1][1]) cand.push([G[j][0], G[j][1] / best]);
        S.push({ u: u * L, bx, by, cand });
      }
      const used = S.filter(x => x.cand.length); if (used.length < 8) return null;
      const tol = 1.5, fits = [];
      for (let i = 0; i < used.length; i++) for (let j = i + 4; j < used.length; j++) for (const [ri] of used[i].cand) for (const [rj] of used[j].cand) {
        const sl = (rj - ri) / (used[j].u - used[i].u); if (Math.abs(sl) > 0.08) continue;
        // score : force des sauts que la droite traverse ; d : distance moyenne au cadre repéré
        let n = 0, dsum = 0; for (const x of used) { const e = ri + sl * (x.u - used[i].u); let w = 0; for (const [r, g3] of x.cand) if (Math.abs(r - e) <= tol && g3 > w) w = g3; n += w; dsum += Math.abs(e); }
        fits.push({ ri, sl, u0: used[i].u, n, d: dsum / used.length });
      }
      if (!fits.length) return null;
      const nmax = fits.reduce((m, f) => Math.max(m, f.n), 0); if (nmax < Math.max(5, used.length * 0.3)) return null;
      // parmi les droites bien suivies (au moins la moitié du score de la meilleure), la plus proche du cadre repéré
      const fit = fits.filter(f => f.n >= nmax * 0.5).sort((a, b) => a.d - b.d)[0];
      const pts = []; for (const x of used) { const e = fit.ri + fit.sl * (x.u - fit.u0); let r0 = null; for (const [r] of x.cand) if (Math.abs(r - e) <= tol && (r0 == null || Math.abs(r - e) < Math.abs(r0 - e))) r0 = r; if (r0 != null) pts.push([x.bx + nx * r0, x.by + ny * r0]); }
      if (pts.length < 6) return null;
      let line; { const mx = pts.reduce((t, p) => t + p[0], 0) / pts.length, my = pts.reduce((t, p) => t + p[1], 0) / pts.length;
        let sxx = 0, sxy = 0, syy = 0; for (const [x, y] of pts) { sxx += (x - mx) ** 2; sxy += (x - mx) * (y - my); syy += (y - my) ** 2; }
        const th = 0.5 * Math.atan2(2 * sxy, sxx - syy); line = { mx, my, dx: Math.cos(th), dy: Math.sin(th) }; }
      lines.push(line);
    }
    const X = (a, b) => { const den = a.dx * b.dy - a.dy * b.dx; if (Math.abs(den) < 1e-6) return null; const t = ((b.mx - a.mx) * b.dy - (b.my - a.my) * b.dx) / den; return [a.mx + a.dx * t, a.my + a.dy * t]; };
    const Q = [X(lines[3], lines[0]), X(lines[0], lines[1]), X(lines[1], lines[2]), X(lines[2], lines[3])];
    if (Q.some(q => !q)) return null;
    return Q.map(([x, y]) => [x / k / img.naturalWidth, y / k / img.naturalHeight]);
  }
  function frameFrom(q, ok) {
    const W = RD.img.naturalWidth, H = RD.img.naturalHeight;
    FR.t = 0; FR.s = 0; FR.q = 1; FR.w = 1; FR.d = null;
    if (!ok) { FR.c = [W / 2, H / 2]; FR.h = Math.min(H * 0.75, W * 0.75 * RATIO); FR.a = 0; return; }
    frameFromQuad(q); const s2 = snapEdges();
    // le recalage ne doit qu'affiner : s'il déplace un coin de plus de 3 % de la hauteur, on garde le repérage
    if (s2 && s2.every((p, i) => Math.hypot((p[0] - q[i][0]) * W, (p[1] - q[i][1]) * H) < FR.h * 0.03)) frameFromQuad(s2);
  }
  /* Le cadre au format carte reste fixe à l'écran ; c'est la photo qui bouge, grandit et tourne dessous
     (comme le recadrage d'une photo de profil). FR décrit où tombe le cadre sur la photo d'origine. */
  const LZ = 4; // grossissement des loupes
  function view() { return pmSliders(view0()); }
  // Chaque curseur a un − à gauche et un + à droite pour avancer d'un cran
  const pmSliders = h => h.replace(/(<input type="range" id="(\w+)"[^>]*>)/g, (m, inp, id) => `<button type="button" class="rs-pm" data-rs="${id}" data-d="-1" aria-label="−">−</button>${inp}<button type="button" class="rs-pm" data-rs="${id}" data-d="1" aria-label="+">+</button>`);
  function view0() {
    const deg = Math.round(-FR.a * 1800 / Math.PI) / 10;
    return `<div class="top top-start">${backBtn()}<h1 class="title">${T('Caler la carte')}</h1></div>
    <div class="pad stack" style="gap:12px">
      <div class="rd-step"><span class="rd-dot on">1</span><b>${T('Caler la carte')}</b><span class="rd-sep"></span><span class="rd-dot">2</span><span>${T('Mesurer')}</span></div>
      <div class="rd-tips">
        <p>${T('Fais rentrer la carte pile dans le cadre.')}</p>
        <div class="rd-tip"><span class="rd-ic">☝</span><span><b>${T('1 doigt')}</b><br>${T('déplacer la photo')}</span></div>
        <div class="rd-tip"><span class="rd-ic">✌</span><span><b>${T('2 doigts')}</b><br>${T('agrandir et tourner')}</span></div>
        <div class="rd-tip"><span class="rd-ic"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/></svg></span><span><b>${T('Loupes')}</b><br>${T('régler les coins au plus près')}</span></div>
      </div>
      ${window.CallItIA && CallItIA.ready() ? `<button class="btn small primary" data-rd="ia" style="align-self:flex-start"${RD.iaWait ? ' disabled' : ''}>✦ ${RD.iaWait ? T('L’IA cale la carte…') : T('Caler avec l’IA')}</button>${RD.iaErr ? `<div class="small">${esc(RD.iaErr)}</div>` : ''}` : ''}
      <div class="row" style="gap:8px;flex-wrap:wrap;align-items:center"><button class="btn small" data-rd="snap">⌖ ${T('Coller aux bords')}</button>
      <div class="rd-state${RD.auto ? ' ok' : ''}">${RD.auto ? '✓ ' + T('Carte repérée, vérifie les coins') : T('Place la carte dans le cadre à la main')}</div></div>
      <div class="rd-view" id="rdview"><canvas id="rdcv"></canvas><svg class="rd-frame" id="rdframe"><path class="rd-dim" fill-rule="evenodd"/><path class="rd-fr"/></svg></div>
      <label class="rd-slider"><span>${T('Échelle')}</span><input type="range" id="rdscale" min="-100" max="100" step="1" value="0"><b class="num" id="rdzoom">×1</b></label>
      <label class="rd-slider"><span>${T('Angle')}</span><input type="range" id="rdangle" min="-300" max="300" step="1" value="${Math.round(deg * 10)}"><b class="num" id="rddeg">${deg}°</b></label>
      <div class="rd-nudge"><div class="row" style="justify-content:space-between;align-items:center"><span class="small">${T('Ajuster doucement')}</span>${undoBtn('c')}</div>
        <div class="rd-nb">${[[['l', '←'], ['r', '→'], ['u', '↑'], ['d', '↓']]].map(g => `<span class="rd-grp">${g.map(([k, s]) => `<button class="btn small" data-rn="${k}" aria-label="${k}">${s}</button>`).join('')}</span>`).join('')}</div></div>
      <div class="rd-incl">
        <div class="row" style="justify-content:space-between;align-items:center"><b class="small">${T('Inclinaison')}</b>${FR.t || FR.s || FR.q !== 1 || (FR.w || 1) !== 1 || FR.d ? `<button class="btn small" data-rd="flat">${T('Remettre à plat')}</button>` : ''}</div>
        <div class="small rd-incl-help"><b>${T('Photo prise de biais ?')}</b><ol class="rd-steps"><li>${T('Fais rouler la boule jusqu’à ce que le cadre colle à la carte.')}</li><li>${T('Affine avec les petites flèches.')}</li><li>${T('Ajuste la largeur ou la hauteur si besoin.')}</li></ol>${T('Double appui sur le pad : tout remettre à plat.')}</div>
        <div class="rd-padrow"><button type="button" class="rs-pm" data-rp="s" data-d="-1" aria-label="${T('Gauche')}"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" style="transform:rotate(0deg)"><path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
          <div class="rd-padcol"><button type="button" class="rs-pm" data-rp="t" data-d="-1" aria-label="${T('Haut')}"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" style="transform:rotate(90deg)"><path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
            <div class="rd-pad" id="rdpad" role="slider" aria-label="${T('Inclinaison')}"><i class="rd-pad-h"></i><i class="rd-pad-v"></i><span class="rd-ball" id="rdball"></span></div>
            <button type="button" class="rs-pm" data-rp="t" data-d="1" aria-label="${T('Bas')}"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" style="transform:rotate(-90deg)"><path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>
          <button type="button" class="rs-pm" data-rp="s" data-d="1" aria-label="${T('Droite')}"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" style="transform:rotate(180deg)"><path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>
        <div class="rd-padv"><span class="rd-pv">${T('Haut / Bas')} <b class="num" id="rdpvt">0</b></span><span class="rd-pv">${T('Gauche / Droite')} <b class="num" id="rdpvs">0</b></span></div>
        <label class="rd-slider"><span>${T('Largeur')}</span><input type="range" id="rdw" min="-50" max="50" step="1" value="${Math.round(((FR.w || 1) - 1) * 100)}"><b class="num" id="rdwv">${Math.round(((FR.w || 1) - 1) * 100)}</b></label>
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
    const G = geo(); if (!G || !RD.img) return; padShow();
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
    else if (e.target.id === 'rdw') { FR.w = 1 + +e.target.value / 100; document.getElementById('rdwv').textContent = e.target.value; refresh(); }
    else if (e.target.id === 'rdq') { FR.q = 1 + +e.target.value / 100; document.getElementById('rdqv').textContent = e.target.value; refresh(); }
    else if (e.target.id === 'rdscale' && RD.h0) { FR.h = RD.h0 / Math.pow(2, +e.target.value / 100); refresh(); }
  });
  // Pad d'inclinaison : on fait rouler la boule. Gauche / droite penche les côtés, haut / bas penche le haut et le bas.
  // Le doigt déplace la boule en relatif (pas de saut au toucher) ; double appui = remettre à plat.
  const PADMAX = 0.4; let pad0 = null, padTap = 0;
  const padShow = () => {
    const b = document.getElementById('rdball'), vt = document.getElementById('rdpvt'), vs = document.getElementById('rdpvs'); if (!b) return;
    b.style.left = (50 + (FR.s || 0) / PADMAX * 42) + '%'; b.style.top = (50 + (FR.t || 0) / PADMAX * 42) + '%';
    if (vt) vt.textContent = Math.round(FR.t * 100); if (vs) vs.textContent = Math.round((FR.s || 0) * 100);
  };
  const clampP = v => Math.max(-PADMAX, Math.min(PADMAX, Math.round(v * 1000) / 1000));
  document.addEventListener('pointerdown', e => {
    const pd = RD.open && e.target.closest && e.target.closest('#rdpad'); if (!pd) return;
    e.preventDefault(); const now = Date.now();
    if (now - padTap < 300) { FR.t = 0; FR.s = 0; padShow(); refresh(); saveSoon(); padTap = 0; return; }
    padTap = now; pad0 = { id: e.pointerId, x: e.clientX, y: e.clientY, s: FR.s || 0, t: FR.t || 0, w: pd.clientWidth };
    try { pd.setPointerCapture(e.pointerId); } catch (er) {}
  });
  document.addEventListener('pointermove', e => {
    if (!pad0 || e.pointerId !== pad0.id) return;
    const k = PADMAX / (pad0.w * 0.42) * 0.25; // sensibilité faible : il faut traverser le pad 4 fois pour aller au bout, on vise juste
    FR.s = clampP(pad0.s + (e.clientX - pad0.x) * k); FR.t = clampP(pad0.t + (e.clientY - pad0.y) * k); padShow(); refresh();
  });
  const padUp = e => { if (pad0 && e.pointerId === pad0.id) { pad0 = null; saveSoon(); } };
  document.addEventListener('pointerup', padUp); document.addEventListener('pointercancel', padUp);
  const rpStep = (k, d) => { FR[k] = clampP((FR[k] || 0) + d * 0.005); padShow(); refresh(); };
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
  document.addEventListener('pointerdown', e => {
    const b = RD.open && e.target.closest && e.target.closest('[data-rp]'); if (!b) return; e.preventDefault();
    const k = b.dataset.rp, d = +b.dataset.d; rnStop(); rpStep(k, d); rnT = setTimeout(() => { rnT = setInterval(() => rpStep(k, d), 60); }, 350);
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => document.addEventListener(t, rnStop));
  const rsStep = (id, d) => { const i = document.getElementById(id); if (!i) return; i.value = +i.value + d; i.dispatchEvent(new Event('input', { bubbles: true })); };
  document.addEventListener('pointerdown', e => {
    const b = RD.open && e.target.closest && e.target.closest('[data-rs]'); if (!b) return; e.preventDefault();
    push('c'); rnStop(); rsStep(b.dataset.rs, +b.dataset.d); rnT = setTimeout(() => { rnT = setInterval(() => rsStep(b.dataset.rs, +b.dataset.d), 60); }, 350);
  });
  document.addEventListener('click', e => { if (e.target.closest && e.target.closest('[data-rs]')) e.preventDefault(); }, true);
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-rd]'); if (!b) return;
    const a = b.dataset.rd;
    if (a === 'ok') { const W = RD.img.naturalWidth, H = RD.img.naturalHeight; RD.q = frameCorners().map(([x, y]) => [x / W, y / H]); apply(true); }
    else if (a === 'skip') apply(false);
    else if (a === 'back') { RD.open = false; RD.back = false; render(); window.scrollTo(0, 0); }
    else if (a === 'again' && RD.src) { RD.back = !!CTR.img; RD.open = true; render(); window.scrollTo(0, 0); }
    else if (a === 'undo') undo();
    else if (a === 'ia' && window.CallItIA && !RD.iaWait) {
      const src = RD.src; RD.iaWait = true; RD.iaErr = ''; render();
      CallItIA.coins(src).then(r => {
        RD.iaWait = false; if (RD.src !== src) return;
        if (r.err) RD.iaErr = r.err; else { push('c'); frameFromQuad(r.q); RD.auto = true; }
        render(); saveSoon();
      });
    }
    else if (a === 'flat') { push('c'); FR.t = 0; FR.s = 0; FR.q = 1; FR.w = 1; FR.d = null; render(); saveSoon(); }
    else if (a === 'snap') { const q = snapEdges(); if (q) { push('c'); frameFromQuad(q); RD.auto = true; render(); saveSoon(); toast(T('Cadre collé aux bords de la carte')); } else toast(T('Bords pas trouvés : approche le cadre de la carte puis réessaie')); }
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
    if (RD.open) { if (e.target.closest('#rdview, canvas.rd-loupe, [data-rn], [data-rp], #rdpad, .rd-slider input, [data-rd="flat"]')) push('c'); }
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
