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
  let RATIO = typeof GAME !== 'undefined' && GAME === 'ygo' ? 86 / 59 : 88 / 63; // format de la carte (hauteur / largeur)
  window.addEventListener('callit:jeu', () => { RATIO = GAME === 'ygo' ? 86 / 59 : 88 / 63; }); // changement de jeu sans recharger
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

  /* ---------- Recherche de la carte dans toute la photo, par ses 4 bords droits ----------
     Sert quand le repérage par la couleur se trompe (fond à motif, tissu, capture d'écran) et pour « Coller aux bords »
     quand le cadre est loin de la carte ou penché autrement. On repère les longues droites de la photo (transformée de
     Hough sur les contours), puis on essaie les rectangles qu'elles forment : on garde celui au format carte dont les
     4 côtés suivent vraiment un contour sur toute leur longueur. Renvoie { q, score } ou null. */
  let EDGES = null;
  function edgeMap(img) {
    if (EDGES && EDGES.img === img) return EDGES;
    const k = Math.min(1, 480 / Math.max(img.naturalWidth, img.naturalHeight)), W = Math.max(8, Math.round(img.naturalWidth * k)), H = Math.max(8, Math.round(img.naturalHeight * k));
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, W, H);
    const d = g.getImageData(0, 0, W, H).data, N = W * H, mag = new Float32Array(N), gxA = new Float32Array(N), gyA = new Float32Array(N);
    // Gradient couleur (Sobel) : pour chaque point, la couche (rouge, vert, bleu) qui change le plus. Jaune sur blanc ne se voit qu'en bleu.
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      let bm = 0, bx = 0, by = 0;
      for (let c = 0; c < 3; c++) {
        const p = (yy, xx) => d[((y + yy) * W + x + xx) * 4 + c];
        const gx = p(-1, 1) + 2 * p(0, 1) + p(1, 1) - p(-1, -1) - 2 * p(0, -1) - p(1, -1), gy = p(1, -1) + 2 * p(1, 0) + p(1, 1) - p(-1, -1) - 2 * p(-1, 0) - p(-1, 1);
        const m = gx * gx + gy * gy; if (m > bm) { bm = m; bx = gx; by = gy; }
      }
      const i = y * W + x; mag[i] = Math.sqrt(bm); gxA[i] = bx; gyA[i] = by;
    }
    const s = Array.from(mag.filter((v, i) => i % 7 === 0)).sort((a, b) => a - b), thr = Math.max(60, s[Math.floor(s.length * 0.85)]);
    EDGES = { img, k, W, H, mag, gx: gxA, gy: gyA, thr };
    return EDGES;
  }
  // Part d'un côté (de a à b, en px réduits) qui suit un contour orienté comme lui
  function sideCover(E, a, b) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, tx = (b[0] - a[0]) / L, ty = (b[1] - a[1]) / L, nx = -ty, ny = tx, n = 40;
    let hit = 0;
    for (let j = 0; j < n; j++) {
      const u = 0.1 + 0.8 * j / (n - 1), px = a[0] + (b[0] - a[0]) * u, py = a[1] + (b[1] - a[1]) * u; let ok = false;
      for (let r = -2; r <= 2 && !ok; r++) {
        const x = Math.round(px + nx * r), y = Math.round(py + ny * r); if (x < 1 || y < 1 || x >= E.W - 1 || y >= E.H - 1) continue;
        const i = y * E.W + x, m = E.mag[i]; if (m < E.thr * 0.6) continue;
        if (Math.abs(E.gx[i] * nx + E.gy[i] * ny) / m > 0.85) ok = true; // le contour est bien parallèle au côté
      }
      if (ok) hit++;
    }
    return hit / n;
  }
  function quadCover(E, P) { const c = [0, 1, 2, 3].map(i => sideCover(E, P[i], P[(i + 1) % 4])); return { min: Math.min(...c), mean: c.reduce((a, b) => a + b, 0) / 4 }; }
  // Note d'un cadre (coins en fractions de la photo) : 0 = ne suit aucun bord, 1 = suit les 4 bords
  function frameCover(img, q) { const E = edgeMap(img); const c = quadCover(E, q.map(([x, y]) => [x * E.W, y * E.H])); return c.min * 0.6 + c.mean * 0.4; }
  function sideStrength(E, a, b, nx, ny, o) {
    let t = 0; const n = 40;
    for (let j = 0; j < n; j++) {
      const u = 0.1 + 0.8 * j / (n - 1), px = a[0] + (b[0] - a[0]) * u + nx * o, py = a[1] + (b[1] - a[1]) * u + ny * o; let m = 0;
      for (let r = -1; r <= 1; r += 0.5) { const x = Math.round(px + nx * r), y = Math.round(py + ny * r); if (x < 1 || y < 1 || x >= E.W - 1 || y >= E.H - 1) continue; const i = y * E.W + x; m = Math.max(m, Math.abs(E.gx[i] * nx + E.gy[i] * ny)); }
      t += m;
    }
    return t / n;
  }
  function expandOut(E, P) {
    const cx = P.reduce((t, p) => t + p[0], 0) / 4, cy = P.reduce((t, p) => t + p[1], 0) / 4;
    const short = Math.min(Math.hypot(P[1][0] - P[0][0], P[1][1] - P[0][1]), Math.hypot(P[2][0] - P[1][0], P[2][1] - P[1][1])), dmax = Math.max(3, short * 0.09);
    const L = [0, 1, 2, 3].map(i => {
      const a = P[i], b = P[(i + 1) % 4], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; let nx = -(b[1] - a[1]) / l, ny = (b[0] - a[0]) / l;
      if (nx * ((a[0] + b[0]) / 2 - cx) + ny * ((a[1] + b[1]) / 2 - cy) < 0) { nx = -nx; ny = -ny; }
      // force moyenne du contour le long du côté décalé de o ; on garde le décalage le plus fort s'il vaut presque le côté actuel
      let off = 0, bestS = 0; const s0 = sideStrength(E, a, b, nx, ny, 0);
      for (let o = 2; o <= dmax; o += 0.5) { const st = sideStrength(E, a, b, nx, ny, o); if (st > bestS) { bestS = st; off = o; } }
      if (bestS < s0 * 0.75 || sideCover(E, [a[0] + nx * off, a[1] + ny * off], [b[0] + nx * off, b[1] + ny * off]) < 0.55) off = 0;
      return { p: [a[0] + nx * off, a[1] + ny * off], d: [b[0] - a[0], b[1] - a[1]] };
    });
    const X = (u, v) => { const den = u.d[0] * v.d[1] - u.d[1] * v.d[0]; if (Math.abs(den) < 1e-9) return null; const t = ((v.p[0] - u.p[0]) * v.d[1] - (v.p[1] - u.p[1]) * v.d[0]) / den; return [u.p[0] + u.d[0] * t, u.p[1] + u.d[1] * t]; };
    const Q = [0, 1, 2, 3].map(i => X(L[(i + 3) % 4], L[i]));
    return Q.some(q => !q) ? P : Q;
  }
  function findCard(img) {
    const E = edgeMap(img), { W, H, mag, gx, gy, thr } = E, NT = 180, diag = Math.ceil(Math.hypot(W, H)), NR = 2 * diag + 1;
    const acc = new Float32Array(NT * NR), cs = [], sn = [];
    for (let t = 0; t < NT; t++) { cs.push(Math.cos(t * Math.PI / NT)); sn.push(Math.sin(t * Math.PI / NT)); }
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x, m = mag[i]; if (m < thr) continue;
      let th = Math.atan2(gy[i], gx[i]); if (th < 0) th += Math.PI; if (th >= Math.PI) th -= Math.PI;
      const t0 = Math.round(th * NT / Math.PI);
      for (let dt = -3; dt <= 3; dt++) { const t = (t0 + dt + NT) % NT, r = Math.round(x * cs[t] + y * sn[t]) + diag; acc[t * NR + r] += 1; }
    }
    // Les droites les plus marquées (maximum local), 40 au plus
    const peaks = [], minV = Math.max(15, Math.min(W, H) * 0.12);
    for (let t = 0; t < NT; t++) for (let r = 2; r < NR - 2; r++) {
      const v = acc[t * NR + r]; if (v < minV) continue; let mx = true;
      for (let dt = -3; dt <= 3 && mx; dt++) for (let dr = -4; dr <= 4; dr++) { if (!dt && !dr) continue; const tt = t + dt, rr = r + dr; if (tt < 0 || tt >= NT || rr < 0 || rr >= NR) continue; const w = acc[tt * NR + rr]; if (w > v || (w === v && (dt < 0 || (!dt && dr < 0)))) { mx = false; break; } }
      if (mx) peaks.push({ t, r: r - diag, v });
    }
    peaks.sort((a, b) => b.v - a.v); const Lp = peaks.slice(0, 40).map(p => ({ ...p, th: p.t * Math.PI / NT }));
    const cross = (a, b) => { const c1 = Math.cos(a.th), s1 = Math.sin(a.th), c2 = Math.cos(b.th), s2 = Math.sin(b.th), den = c1 * s2 - s1 * c2; if (Math.abs(den) < 1e-3) return null; return [(a.r * s2 - b.r * s1) / den, (c1 * b.r - c2 * a.r) / den]; };
    const angD = (a, b) => { let d = Math.abs(a - b) % Math.PI; return Math.min(d, Math.PI - d); };
    // Paires de droites presque parallèles et assez écartées
    const pairs = []; for (let i = 0; i < Lp.length; i++) for (let j = i + 1; j < Lp.length; j++) {
      const a = Lp[i], b = Lp[j]; if (angD(a.th, b.th) > 6 * Math.PI / 180) continue;
      const rb = Math.abs(a.th - b.th) > Math.PI / 2 ? -b.r : b.r; if (Math.abs(a.r - rb) < Math.min(W, H) * 0.12) continue;
      pairs.push([a, b]);
    }
    let best = null; const len = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]), cands = [];
    for (let i = 0; i < pairs.length; i++) for (let j = i + 1; j < pairs.length; j++) {
      const [a1, a2] = pairs[i], [b1, b2] = pairs[j]; if (Math.abs(angD(a1.th, b1.th) - Math.PI / 2) > 10 * Math.PI / 180) continue;
      const P0 = [cross(a1, b1), cross(b1, a2), cross(a2, b2), cross(b2, a1)]; if (P0.some(p => !p)) continue;
      if (!P0.every(([x, y]) => x > -W * 0.03 && y > -H * 0.03 && x < W * 1.03 && y < H * 1.03)) continue;
      // Coins dans l'ordre des aiguilles d'une montre, autour du centre
      const cx = P0.reduce((s, p) => s + p[0], 0) / 4, cy = P0.reduce((s, p) => s + p[1], 0) / 4;
      const P = P0.slice().sort((p, q) => Math.atan2(p[1] - cy, p[0] - cx) - Math.atan2(q[1] - cy, q[0] - cx));
      const s0 = (len(P[0], P[1]) + len(P[2], P[3])) / 2, s1 = (len(P[1], P[2]) + len(P[3], P[0])) / 2, ratio = Math.max(s0, s1) / Math.min(s0, s1);
      if (ratio < RATIO * 0.82 || ratio > RATIO * 1.22 || s0 * s1 < W * H * 0.04) continue;
      const c = quadCover(E, P); if (c.min < 0.45) continue;
      const score = c.min * 0.6 + c.mean * 0.4; const la = len(P0[3], P0[0]) + len(P0[1], P0[2]), lb = len(P0[0], P0[1]) + len(P0[2], P0[3]);
      cands.push({ P, score, area: s0 * s1, sh: la < lb ? pairs[i] : pairs[j], lg: la < lb ? pairs[j] : pairs[i] });
      if (!best || score > best.score) best = cands[cands.length - 1];
    }
    if (!best) return null;
    // Une demi-carte (coupée au niveau du texte) a aussi le format carte, et le bord jaune intérieur aussi : tant qu'un
    // rectangle plus grand garde deux côtés opposés du rectangle retenu (mêmes droites) et suit aussi bien ses bords, on l'agrandit.
    const same = (l, m) => angD(l.th, m.th) < 2.5 * Math.PI / 180 && Math.abs(l.r - (Math.abs(l.th - m.th) > Math.PI / 2 ? -m.r : m.r)) < 5;
    // B prolonge A en carte entière : les petits côtés de A (deux bords longs de la carte) sont les grands côtés de B
    const share = (A, B) => { const [l1, l2] = A.sh, [m1, m2] = B.lg; return (same(l1, m1) && same(l2, m2)) || (same(l1, m2) && same(l2, m1)); };
    const top = cands.filter(c => c.score >= best.score - 0.02).sort((a, b) => b.area - a.area); let pick = top[0];
    for (const c of cands) if (c.area > pick.area * 1.5 && c.area < pick.area * 2.6 && c.score >= best.score * 0.85 && share(pick, c)) pick = c;
    // Le bord intérieur du cadre jaune (jaune → illustration) est souvent plus net que le bord de la carte sur un fond clair :
    // un rectangle un peu plus grand, centré pareil et de même angle, qui suit lui aussi ses bords, est le vrai bord de la carte.
    const ctr = c => [c.P.reduce((t, p) => t + p[0], 0) / 4, c.P.reduce((t, p) => t + p[1], 0) / 4], ang = c => Math.atan2(c.P[1][1] - c.P[0][1], c.P[1][0] - c.P[0][0]);
    const encl = cands.filter(c => { const a = ctr(c), b = ctr(pick); let da = Math.abs(ang(c) - ang(pick)) % (Math.PI / 2); da = Math.min(da, Math.PI / 2 - da);
      return c.area > pick.area * 1.08 && c.area < pick.area * 1.5 && c.score >= best.score * 0.75 && da < 3 * Math.PI / 180 && Math.hypot(a[0] - b[0], a[1] - b[1]) < Math.sqrt(pick.area) * 0.06; });
    if (encl.length) pick = encl.sort((a, b) => b.score - a.score || b.area - a.area)[0];
    // Chaque côté est poussé vers l'extérieur tant qu'un bord parallèle bien suivi s'y trouve (jusqu'à 9 % de la largeur) :
    // sur fond clair, le bord jaune → illustration ressort mieux que le bord de la carte, juste à côté.
    let P = expandOut(E, pick.P);
    // Premier coin = en haut à gauche de la carte debout : le côté du haut est un petit côté
 if (len(P[0], P[1]) > len(P[1], P[2])) P = [P[1], P[2], P[3], P[0]];
    // des deux petits côtés, celui du haut est le plus haut sur la photo
    if ((P[0][1] + P[1][1]) > (P[2][1] + P[3][1])) P = [P[2], P[3], P[0], P[1]];
    return { q: P.map(([x, y]) => [x / W, y / H]), score: pick.score };
  }

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
    // Taille de sortie : largeur de la carte ≈ largeur mesurée sur la photo (au plus maxW : 900 px par défaut, 1 600 px pour le centrage
    // et le scan, qui relit le numéro en 1 600 px). Jamais agrandie : une petite photo reste à sa taille.
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
  window.CallItRedresse = { detectCorners, warp, findCard, frameCover };

  /* ---------- Chargement de la photo : on passe d'abord par les coins ---------- */
  // Photo illisible (format HEIC sur ordinateur, fichier abîmé…) : on le dit au lieu de ne rien faire
  const loadFail = () => { if (typeof toast === 'function') toast(T('Cette photo ne s’ouvre pas. Reprends-la, ou choisis une photo JPEG ou PNG.')); };
  // Très grandes photos (24 ou 48 Mpx) : l'iPhone refuse les images de plus de 16 Mpx dans un canvas. On les réduit
  // à 12 Mpx au chargement (la carte garde bien plus que les 2 576 px envoyés à l'analyse complète).
  const MAX_PX = 12e6;
  function shrink(img, src, done) {
    const W = img.naturalWidth, H = img.naturalHeight;
    if (W * H <= MAX_PX) { done(img, src); return; }
    try {
      const k = Math.sqrt(MAX_PX / (W * H)), c = document.createElement('canvas'); c.width = Math.round(W * k); c.height = Math.round(H * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const url = c.toDataURL('image/jpeg', 0.92), im2 = new Image();
      im2.onload = () => done(im2, url); im2.onerror = () => done(img, src); im2.src = url;
    } catch (e) { done(img, src); }
  }
  ctrLoad = function (file) {
    const r = new FileReader();
    r.onerror = loadFail;
    r.onload = () => { const img0 = new Image(); img0.onerror = loadFail; img0.onload = () => shrink(img0, r.result, (img, src) => { try { UNDO.m = []; UNDO.c = []; RD.back = false; CTR.img = null; CTR.L = null; const det = detectCorners(img); RD.src = src; RD.img = img; RD.q = det.q; RD.auto = det.ok; frameFrom(det.q, det.ok); RD.h0 = FR.h; CTR.zoom = 1; CTR.sx = CTR.sy = 0; CTR.ia = null; RD.open = true; render(); window.scrollTo(0, 0); } catch (e) { loadFail(); } }); img0.src = r.result; };
    r.readAsDataURL(file);
  };
  // Centrage : la carte redressée garde jusqu'à 1 600 px de large (900 avant le 28/11/2026). L'Analyse complète lit alors
  // les coins, les bords et la surface dans une photo de téléphone presque deux fois plus fine (l'IA lit jusqu'à 3,75 Mpx).
  const CTR_W = 1600;
  function apply(straighten) {
    const url = straighten ? warp(RD.img, RD.q, MARGIN, CTR_W) : RD.src;
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
  // Pose le cadre sur la carte repérée. Si le repérage par la couleur ne suit pas les bords (fond à motif, capture d'écran…),
  // on cherche la carte par ses 4 bords droits. Renvoie true si la carte est vraiment repérée.
  function frameFrom(q, ok) {
    const W = RD.img.naturalWidth, H = RD.img.naturalHeight;
    FR.t = 0; FR.s = 0; FR.q = 1; FR.w = 1; FR.d = null;
    const cov = ok ? frameCover(RD.img, q) : 0;
    if (cov < 0.6) { const f = findCard(RD.img); if (f && f.score > cov) { q = f.q; ok = true; } }
    RD.auto = ok;
    if (!ok) { FR.c = [W / 2, H / 2]; FR.h = Math.min(H * 0.75, W * 0.75 * RATIO); FR.a = 0; return false; }
    frameFromQuad(q); refineSnap(q);
    return true;
  }
  // Recalage fin sur le bord exact ; il ne doit qu'affiner : s'il déplace un coin de plus de 3 % de la hauteur, on garde le repérage
  function refineSnap(q) {
    const W = RD.img.naturalWidth, H = RD.img.naturalHeight, s2 = snapEdges();
    if (s2 && s2.every((p, i) => Math.hypot((p[0] - q[i][0]) * W, (p[1] - q[i][1]) * H) < FR.h * 0.03)) frameFromQuad(s2);
  }
  // « Coller aux bords » : d'abord autour du cadre posé à la main ; si rien de convaincant là, dans toute la photo
  function snapAnywhere() {
    const q = snapEdges(); if (q && frameCover(RD.img, q) >= 0.55) { frameFromQuad(q); return true; }
    const f = findCard(RD.img); if (!f) return false;
    frameFromQuad(f.q); refineSnap(f.q); return true;
  }
  /* Le cadre au format carte reste fixe à l'écran ; c'est la photo qui bouge, grandit et tourne dessous
     (comme le recadrage d'une photo de profil). FR décrit où tombe le cadre sur la photo d'origine. */
  const LZ = 4; // grossissement des loupes
  // Petit picto d'une carte avec le coin montré par la loupe en vert
  const cornerIcon = i => { const c = [['M1.5 8V4Q1.5 1.5 4 1.5H8'], ['M10 1.5H14Q16.5 1.5 16.5 4V8'], ['M16.5 16V20Q16.5 22.5 14 22.5H10'], ['M8 22.5H4Q1.5 22.5 1.5 20V16']][i][0];
    return `<svg width="16" height="22" viewBox="0 0 18 24" aria-hidden="true"><rect x="1.5" y="1.5" width="15" height="21" rx="2.5" fill="none" stroke="currentColor" stroke-opacity=".35" stroke-width="1.6"/><path d="${c}" fill="none" stroke="var(--gain)" stroke-width="3" stroke-linecap="round"/></svg>`; };
  function view() { return pmSliders(view0()); }
  // Chaque curseur a un − à gauche et un + à droite pour avancer d'un cran
  const pmSliders = h => h.replace(/(<input type="range" id="(\w+)"[^>]*>)/g, (m, inp, id) => `<button type="button" class="rs-pm" data-rs="${id}" data-d="-1" aria-label="−">−</button>${inp}<button type="button" class="rs-pm" data-rs="${id}" data-d="1" aria-label="+">+</button>`);
  function view0() {
    const deg = Math.round(-FR.a * 1800 / Math.PI) / 10;
    return `<div class="top top-start">${backBtn()}<h1 class="title">${T('Caler la carte')}</h1></div>
    <div class="pad stack" style="gap:12px">
      <div class="rd-step"><span class="rd-dot on">1</span><b>${T('Caler la carte')}</b><span class="rd-sep"></span><span class="rd-dot">2</span><span>${T('Mesurer')}</span></div>
      <div class="row" style="gap:8px;flex-wrap:wrap;align-items:center;justify-content:space-between"><div class="rd-state${RD.auto ? ' ok' : ''}">${RD.auto ? '✓ ' + T('Carte trouvée') : T('Carte pas trouvée')}</div><button class="btn small" data-rd="snap">⌖ ${T('Recaler tout seul')}</button></div>
      <div class="rd-view" id="rdview"><canvas id="rdcv"></canvas><svg class="rd-frame" id="rdframe"><path class="rd-dim" fill-rule="evenodd"/><path class="rd-fr"/></svg></div>
      <div class="small" style="text-align:center">${T('1 doigt : déplacer · 2 doigts : agrandir, tourner')}</div>
      <div class="rd-loupes rd-loupes4">${[0, 1, 3, 2].map(i => `<div class="rd-lp"><canvas class="rd-loupe" data-i="${i}"></canvas><span class="rd-lb rd-lb${i}" aria-label="${T(['Coin en haut à gauche', 'Coin en haut à droite', 'Coin en bas à droite', 'Coin en bas à gauche'][i])}">${cornerIcon(i)}</span></div>`).join('')}</div>
      <div class="row" style="gap:8px;justify-content:center"><label class="btn small">${T('Changer la photo')}<input type="file" accept="image/*" class="sr" id="ctrfile2"></label><button class="btn primary" data-rd="ok">${T('Valider')}</button></div>
      ${CTR.img ? `<button class="linkbtn" data-rd="back" style="align-self:center">${T('Revenir à la mesure')}</button>` : ''}
      <details class="rd-fin"${RD.fin ? ' open' : ''}><summary>${T('Réglages fins')}</summary><div class="stack" style="gap:12px;margin-top:10px">
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
      ${CTR.img ? '' : `<button class="btn small" data-rd="skip" style="align-self:flex-start">${T('Garder la photo telle quelle')}</button>`}
      </div></details>
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
  const PTS = new Map(); let g0 = null, CD = null;
  // Coin déplacé seul : l'écart du coin (FR.d) est compté dans le repère du cadre, en hauteurs de cadre ;
  // à l'écran il vaut écart × FR.h × échelle, et la loupe grossit LZ fois : le coin suit le doigt dans la loupe.
  document.addEventListener('pointermove', e => {
    if (!CD || e.pointerId !== CD.id) return; const G = geo(); if (!G) return;
    const dx = e.clientX - CD.xy[0], dy = e.clientY - CD.xy[1]; CD.xy = [e.clientX, e.clientY];
    const D = (FR.d || [[0, 0], [0, 0], [0, 0], [0, 0]]).map(p => p.slice()), f = 1 / (LZ * G.k * FR.h);
    D[CD.i] = [D[CD.i][0] + dx * f, D[CD.i][1] + dy * f]; FR.d = D; refresh();
  });
  const cdUp = e => { if (CD && e.pointerId === CD.id) { CD = null; saveSoon(); } };
  document.addEventListener('pointerup', cdUp); document.addEventListener('pointercancel', cdUp);
  const gesture = () => {
    const v = [...PTS.values()].map(p => p.xy);
    if (v.length >= 2) { const [p, q] = v; return { two: true, d: Math.hypot(q[0] - p[0], q[1] - p[1]) || 1, ang: Math.atan2(q[1] - p[1], q[0] - p[0]), m: [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2] }; }
    return { two: false, m: v[0] };
  };
  document.addEventListener('pointerdown', e => {
    if (!RD.open || !e.target.closest) return;
    const onView = e.target.closest('#rdview'), lp = e.target.closest('canvas.rd-loupe'); if (!onView && !lp) return;
    e.preventDefault();
    // Dans une loupe, le doigt déplace seulement CE coin du cadre (les trois autres restent en place)
    if (lp) { CD = { id: e.pointerId, i: +lp.dataset.i, xy: [e.clientX, e.clientY] }; try { lp.setPointerCapture(e.pointerId); } catch (er) {} return; }
    PTS.set(e.pointerId, { xy: [e.clientX, e.clientY], gain: 1 }); g0 = gesture();
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
  document.addEventListener('toggle', e => { if (e.target.classList && e.target.classList.contains('rd-fin')) RD.fin = e.target.open; }, true);
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
    else if (a === 'snap') {
      // « Recaler tout seul » : les bords dans toute la photo ; si rien, l'IA quand elle est disponible
      push('c');
      if (snapAnywhere()) { RD.auto = true; render(); saveSoon(); toast(T('Cadre collé aux bords de la carte')); }
      else if (window.CallItIA && CallItIA.ready() && !RD.iaWait) {
        const src = RD.src; RD.iaWait = true; toast(T('Recherche de la carte…'));
        CallItIA.coins(src).then(r => { RD.iaWait = false; if (RD.src !== src) return; if (r.err || !r.q) { RD.auto = false; toast(T('Carte pas trouvée : cale le cadre avec les doigts')); } else { frameFromQuad(r.q); RD.auto = true; } render(); saveSoon(); });
      } else { RD.auto = false; render(); toast(T('Carte pas trouvée : cale le cadre avec les doigts')); }
    }
  });

  /* ---------- Branchement dans le rendu de #/centrage ---------- */
  // #/analyse et #/analysis sont l'écran du centrage (app.js réécrit l'adresse, mais on ne dépend pas de l'ordre)
  const route = () => { const r = location.hash.replace(/^#\/?/, '').split(/[/?]/)[0]; return r === 'analyse' || r === 'analysis' ? 'centrage' : r; };
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
  // Une analyse en échec ou en cours ne se garde pas : revenue d'une sauvegarde, elle bloquait la face sur « L'IA n'a pas pu
  // lire cette image » ou « L'IA examine la carte… », sans bouton pour relancer (vu le 28/11/2026 sur le Gengar).
  const sansEchec = f => { if (f && f.ia && (f.ia.err || f.ia.wait)) { f = { ...f }; delete f.ia; } return f; };
  function save() {
    if (!CTR.img && !RD.src) return;
    const faces = {}; for (const k of ['recto', 'verso']) faces[k] = k === CTR.side ? null : { ...sansEchec(CTR.faces[k] || {}), rd: RDF[k] || null };
    const w = { at: Date.now(), side: CTR.side, key: CTR.key, img: CTR.img, L: CTR.L, sel: CTR.sel, rd: rdSnap(), open: RD.open, faces };
    try { idbDo('readwrite', st => st.put(JSON.parse(JSON.stringify(w)), 'work')).catch(() => {}); } catch (e) { /* stockage indisponible */ }
  }
  function restore() {
    try {
      idbDo('readonly', st => st.get('work')).then(w => {
        if (!w || CTR.img || RD.src || route() !== 'centrage') return;
        CTR.side = w.side || 'recto'; if (w.key && !CTR.key) CTR.key = w.key; CTR.img = w.img || null; CTR.L = w.L || null; CTR.sel = w.sel || 0;
        for (const k of ['recto', 'verso']) { const f = w.faces && w.faces[k]; if (f) { RDF[k] = f.rd || null; delete f.rd; CTR.faces[k] = sansEchec(f); } }
        rdPut(w.rd, () => { RD.open = false; render(); // on revient sur l'écran avec « Prendre une photo » et « Reprendre ma photo », jamais bloqué dans le calage
           if (typeof toast === 'function') toast(T('Ton centrage en cours est revenu')); });
      }).catch(() => {});
    } catch (e) { /* stockage indisponible */ }
  }
  window.addEventListener('pagehide', () => { if (route() === 'centrage') save(); });
})();
