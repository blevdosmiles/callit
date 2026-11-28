/* CallIt! · Reconnaissance gratuite d'une carte par son image, sur l'appareil (sans IA, sans envoi de la photo).
   La lecture du texte (Tesseract) rate souvent : texte trop petit, reflets, carte penchée, police stylisée. Ici on compare
   le DESSIN : la carte est repérée sur la photo et remise droite (redresse.js, le même outil que le scan IA), puis on calcule
   son « empreinte » (192 bits) et on la compare à celles des images officielles de toutes les cartes (data/empreintes.json,
   refait chaque semaine par outils/empreintes.mjs avec ce même fichier).
   Empreinte = 3 parties de 64 bits :
   - le dessin (cadre de l'illustration) : basses fréquences de l'image en gris (« pHash », DCT 32 × 32, 63 coefficients
     comparés à leur médiane). Insensible à la luminosité, au contraste, au flou léger, à un décalage de quelques %.
   - la carte entière, de la même façon (couleur du cadre, place du texte, carte pleine illustration…).
   - les couleurs : 4 × 4 cases du dessin et 4 × 4 cases de la carte, deux teintes par case (rouge-vert, jaune-bleu)
     comparées à leur médiane (une lumière jaune ou bleue décale toutes les cases pareil : ça s'annule).
   Distance = nombre de bits différents (0 = même image ; deux cartes au hasard : environ 96 sur 192).
   Ce fichier marche dans le navigateur (window.CallItEmpreinte) et dans Node (outils/empreintes.mjs). */
(function (root) {
  'use strict';
  const ART = [0.12, 0.13, 0.88, 0.47];  // dans le cadre de l'illustration, sur les cartes classiques comme anciennes
  const FULL = [0.04, 0.03, 0.96, 0.97]; // la carte sans ses coins arrondis (le fond de la photo s'y voit)
  const N = 32, K = 8;
  const COS = new Float64Array(K * N);
  for (let u = 0; u < K; u++) for (let x = 0; x < N; x++) COS[u * N + x] = Math.cos(Math.PI * (2 * x + 1) * u / (2 * N));

  // Moyenne des pixels de la zone rect (parts de la largeur et de la hauteur) en n × m cases : gris, ou les 3 couleurs
  function cells(px, W, H, ch, rect, n, m, rot) {
    const g = new Float64Array(n * m), r = new Float64Array(n * m), v = new Float64Array(n * m), b = new Float64Array(n * m);
    const x0 = rect[0] * W, y0 = rect[1] * H, cw = (rect[2] - rect[0]) * W / n, chh = (rect[3] - rect[1]) * H / m;
    const cx = x => Math.max(0, Math.min(W - 1, x)), cy = y => Math.max(0, Math.min(H - 1, y));
    for (let j = 0; j < m; j++) for (let i = 0; i < n; i++) {
      const xa = cx(Math.floor(x0 + i * cw)), xb = Math.max(xa + 1, cx(Math.floor(x0 + (i + 1) * cw))), ya = cy(Math.floor(y0 + j * chh)), yb = Math.max(ya + 1, cy(Math.floor(y0 + (j + 1) * chh)));
      let sr = 0, sg = 0, sb = 0, c = 0;
      for (let y = ya; y < yb && y < H; y++) for (let x = xa; x < xb && x < W; x++) {
        // rot : la carte est à l'envers sur la photo (tête en bas) : on lit le pixel symétrique
        const X = rot ? W - 1 - x : x, Y = rot ? H - 1 - y : y, k = (Y * W + X) * ch;
        sr += px[k]; sg += px[k + 1]; sb += px[k + 2]; c++;
      }
      const o = j * n + i; c = c || 1; r[o] = sr / c; v[o] = sg / c; b[o] = sb / c; g[o] = 0.299 * r[o] + 0.587 * v[o] + 0.114 * b[o];
    }
    return { g, r, v, b };
  }
  const median = a => { const s = Array.from(a).sort((x, y) => x - y); return (s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2; };
  // 64 valeurs → 2 mots de 32 bits (bit à 1 : au-dessus de la médiane)
  function bits(vals, out, at) {
    const md = median(vals); let a = 0, b = 0;
    for (let i = 0; i < vals.length && i < 64; i++) if (vals[i] > md) { if (i < 32) a |= 1 << i; else b |= 1 << (i - 32); }
    out[at] = a >>> 0; out[at + 1] = b >>> 0;
  }
  function phash(px, W, H, ch, rect, rot, out, at) {
    const g = cells(px, W, H, ch, rect, N, N, rot).g, t = new Float64Array(N * K), c = [];
    for (let y = 0; y < N; y++) for (let u = 0; u < K; u++) { let s = 0; for (let x = 0; x < N; x++) s += g[y * N + x] * COS[u * N + x]; t[y * K + u] = s; }
    for (let v = 0; v < K; v++) for (let u = 0; u < K; u++) { if (!u && !v) continue; let s = 0; for (let y = 0; y < N; y++) s += t[y * K + u] * COS[v * N + y]; c.push(s); }
    bits(c, out, at); // 63 coefficients (sans la luminosité moyenne) : le 64e bit reste à 0
  }
  function hues(px, W, H, ch, rect, rot) {
    const { r, v, b } = cells(px, W, H, ch, rect, 4, 4, rot), rg = [], yb = [];
    for (let i = 0; i < 16; i++) { const s = r[i] + v[i] + b[i] + 30; rg.push((r[i] - v[i]) / s); yb.push(((r[i] + v[i]) / 2 - b[i]) / s); }
    return [rg, yb];
  }
  // Zone r (parts de la carte) dans l'image, quand la carte n'occupe que la boîte box de l'image (marge, cadrage un peu faux)
  const inBox = (r, box) => !box ? r : [box[0] + r[0] * (box[2] - box[0]), box[1] + r[1] * (box[3] - box[1]), box[0] + r[2] * (box[2] - box[0]), box[1] + r[3] * (box[3] - box[1])];
  // Empreinte d'une image de carte droite (pixels RGB ou RGBA, ch = 3 ou 4). rot : la lire tête en bas. box : où est la carte dans l'image.
  function describe(px, W, H, ch, rot, box) {
    const out = new Uint32Array(6), A = inBox(ART, box), Fu = inBox(FULL, box);
    phash(px, W, H, ch, A, rot, out, 0);
    phash(px, W, H, ch, Fu, rot, out, 2);
    const [a1, a2] = hues(px, W, H, ch, A, rot), [f1, f2] = hues(px, W, H, ch, Fu, rot);
    const col = A => { let w = 0; const m = median(A); for (let i = 0; i < 16; i++) if (A[i] > m) w |= 1 << i; return w; };
    out[4] = (col(a1) | (col(a2) << 16)) >>> 0;
    out[5] = (col(f1) | (col(f2) << 16)) >>> 0;
    return out;
  }
  const pop = x => { x -= (x >>> 1) & 0x55555555; x = (x & 0x33333333) + ((x >>> 2) & 0x33333333); return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24; };
  // Distances séparées (dessin, carte, couleurs) entre l'empreinte q et la carte i de l'index H (6 mots par carte)
  function parts(q, H, i) {
    const o = i * 6;
    return [pop(q[0] ^ H[o]) + pop(q[1] ^ H[o + 1]), pop(q[2] ^ H[o + 2]) + pop(q[3] ^ H[o + 3]), pop(q[4] ^ H[o + 4]) + pop(q[5] ^ H[o + 5])];
  }
  const W_COL = 1; // mesuré : les couleurs départagent bien les dessins proches, même sous une lampe colorée
  const dist = (q, H, i) => { const p = parts(q, H, i); return p[0] + p[1] + W_COL * p[2]; };
  // Les cartes de l'index les plus proches d'une ou plusieurs empreintes (la carte à l'endroit et tête en bas) : [[rang, distance]]
  function nearest(qs, H, n, top) {
    const best = []; let worst = Infinity;
    for (let i = 0; i < n; i++) {
      let d = Infinity; for (const q of qs) { const x = dist(q, H, i); if (x < d) d = x; }
      if (best.length < top || d < worst) {
        best.push([i, d]); best.sort((a, b) => a[1] - b[1]); if (best.length > top) best.pop(); worst = best.length < top ? Infinity : best[best.length - 1][1];
      }
    }
    return best;
  }
  // Index : base64 de 6 mots de 32 bits par carte (petit-boutiste)
  function decode(b64) {
    const bin = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
    const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return new Uint32Array(u8.buffer, 0, u8.length >> 2);
  }
  function encode(words) {
    const u8 = new Uint8Array(words.buffer, words.byteOffset, words.length * 4);
    if (typeof Buffer !== 'undefined') return Buffer.from(u8).toString('base64');
    let s = ''; for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return btoa(s);
  }
  /* Le repérage des coins de la carte n'est jamais exact (pochette, ombre, coin caché) : on calcule aussi l'empreinte de la
     carte un peu plus grande et un peu plus petite (±3 %), à l'endroit et tête en bas, et chaque carte de l'index garde
     la plus petite distance. box : la carte dans l'image (sans box : toute l'image). */
  function describeAll(px, W, H, ch, box) {
    const b = box || [0, 0, 1, 1], out = [];
    for (const k of [0, -0.03, 0.03]) {
      const dx = (b[2] - b[0]) * k / 2, dy = (b[3] - b[1]) * k / 2, bb = [b[0] - dx, b[1] - dy, b[2] + dx, b[3] + dy];
      out.push(describe(px, W, H, ch, false, bb), describe(px, W, H, ch, true, bb));
    }
    return out;
  }
  const CORE = { describe, describeAll, parts, dist, nearest, decode, encode, pop, ART, FULL, W_COL };
  if (typeof module !== 'undefined' && module.exports) { module.exports = CORE; return; }

  /* ---------- Dans l'appli ---------- */
  let IDX = null, idxP = null;
  // L'index n'est chargé qu'au premier scan (environ 1 Mo), puis gardé (service worker)
  function load() {
    if (IDX) return Promise.resolve(IDX);
    return idxP || (idxP = fetch('data/empreintes.json').then(r => { if (!r.ok) throw new Error('empreintes ' + r.status); return r.json(); }).then(j => {
      const H = decode(j.h), keys = j.k;
      IDX = { H, keys, n: Math.min(keys.length, H.length / 6 | 0), v: j.v };
      return IDX;
    }).catch(e => { idxP = null; throw e; }));
  }
  const ld = src => new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = src; });
  // La carte sur la photo, remise droite : { px, W, H } ; null si on ne la trouve pas.
  // Même repérage que le zoom du scan IA (cardZoom dans live.js) : CallItRedresse.detectCorners puis warp.
  async function cardPixels(src) {
    let img = src;
    if (typeof src === 'string') img = await ld(src);
    else if (typeof Blob !== 'undefined' && src instanceof Blob) { const u = URL.createObjectURL(src); try { img = await ld(u); } finally { URL.revokeObjectURL(u); } }
    let W0 = img.naturalWidth || img.videoWidth || img.width, H0 = img.naturalHeight || img.videoHeight || img.height; if (!W0 || !H0) return null;
    // Image réduite à 1 200 px : le repérage travaille en 400 px, et le dessin n'a pas besoin de plus
    const k = Math.min(1, 1200 / Math.max(W0, H0)), cv = document.createElement('canvas'); cv.width = Math.round(W0 * k); cv.height = Math.round(H0 * k);
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    const im = await ld(cv.toDataURL('image/jpeg', 0.92)), R = window.CallItRedresse;
    let card = null, how = 'photo';
    const d = R && R.detectCorners(im);
    if (d && d.ok && d.q) {
      const P = d.q.map(([x, y]) => [x * cv.width, y * cv.height]), len = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
      const w = (len(P[0], P[1]) + len(P[3], P[2])) / 2, h = (len(P[0], P[3]) + len(P[1], P[2])) / 2, ar = w / h, area = w * h / (cv.width * cv.height);
      // Carte remise droite avec 5 % de fond autour : de quoi essayer un cadrage un peu plus grand (describeAll)
      if (ar > 0.6 && ar < 0.8 && area > 0.03 && Math.min(w, h) >= 80) { card = await ld(R.warp(im, d.q, MARGE, 300)); how = 'carte'; }
    }
    if (!card) {
      /* Carte pas repérée (fond chargé, carte tenue en main, dans un toploader ou un boîtier gradé…) : on essaie des cadres de
         la forme d'une carte, de plusieurs tailles et à plusieurs places, sur la photo réduite (400 px) ; match() garde le cadre
         dont le dessin ressemble le plus à une carte de l'index, avec des seuils plus stricts. La photo entière en fait partie. */
      const s = Math.min(1, 400 / Math.max(cv.width, cv.height)), W = Math.round(cv.width * s), H = Math.round(cv.height * s);
      const c3 = document.createElement('canvas'); c3.width = W; c3.height = H; const g3 = c3.getContext('2d', { willReadFrequently: true }); g3.drawImage(cv, 0, 0, W, H);
      return { px: g3.getImageData(0, 0, W, H).data, W, H, how: 'grille', boxes: gridBoxes(W, H) };
    }
    const W = 264, H = Math.round(W * (card.naturalHeight / card.naturalWidth)), c2 = document.createElement('canvas'); c2.width = W; c2.height = H;
    const g = c2.getContext('2d', { willReadFrequently: true }); g.drawImage(card, 0, 0, W, H);
    // Où est la carte dans l'image : warp ajoute la même marge (en pixels) de chaque côté
    const mx = MARGE / (1 + 2 * MARGE), my = MARGE * card.naturalWidth / (1 + 2 * MARGE) / card.naturalHeight;
    return { px: g.getImageData(0, 0, W, H).data, W, H, how, box: [mx, my, 1 - mx, 1 - my] };
  }
  // Cadres de la forme d'une carte (63 × 88) dans une image W × H, en parts de l'image : la photo entière (si elle a la forme
  // d'une carte), puis 6 tailles, chacune à plusieurs places (au plus 5 × 5)
  function gridBoxes(W, H) {
    const out = [], a = 63 / 88, ar = W / H;
    if (ar > 0.62 && ar < 0.82) out.push([0, 0, 1, 1]);
    for (const hf of [0.97, 0.85, 0.72, 0.6, 0.5, 0.4]) {
      let ch = hf * H, cw = ch * a; if (cw > W * 0.97) { cw = W * 0.97; ch = cw / a; }
      if (ch < 60) continue;
      const nx = Math.min(5, 1 + Math.floor((W - cw) / (cw * 0.18))), ny = Math.min(5, 1 + Math.floor((H - ch) / (ch * 0.18)));
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const x = nx > 1 ? (W - cw) * i / (nx - 1) : (W - cw) / 2, y = ny > 1 ? (H - ch) * j / (ny - 1) : (H - ch) / 2;
        out.push([x / W, y / H, (x + cw) / W, (y + ch) / H]);
      }
    }
    return out;
  }
  /* Les cartes dont le dessin ressemble le plus à la photo. Renvoie { list: [{ c, d }], sure, how } ou null (pas de carte vue, ou index absent).
     sure : la 1re est nettement plus proche que toute carte au dessin différent. Les réimpressions (même dessin dans un autre set,
     même carte dans une autre langue) ont presque la même empreinte : elles restent groupées en tête (group), et c'est le texte lu
     (numéro, nom) qui choisit entre elles. Seuils mesurés sur des photos (outils/essai_empreintes.mjs). */
  const SURE_MAX = 64, SURE_GAP = 12, SAME = 14, MARGE = 0.05;
  const GRID_MAX = 40, GRID_GAP = 16; // carte trouvée par les cadres essayés (pas par le repérage) : plus strict
  async function match(src, opts = {}) {
    if (typeof CARDS === 'undefined' || typeof BYKEY === 'undefined' || (typeof PKM !== 'undefined' && !PKM)) return null;
    const [ix, cp] = await Promise.all([load(), cardPixels(src)]);
    if (!cp) return null;
    let box = cp.box;
    if (cp.how === 'grille') {
      // Le cadre dont le dessin est le plus proche d'une carte de l'index
      let bd = Infinity;
      for (const b of cp.boxes) {
        const r = nearest([describe(cp.px, cp.W, cp.H, 4, false, b), describe(cp.px, cp.W, cp.H, 4, true, b)], ix.H, ix.n, 1)[0];
        if (r && r[1] < bd) { bd = r[1]; box = b; }
      }
      if (!box) return null;
    }
    const qs = describeAll(cp.px, cp.W, cp.H, 4, box);
    const near = nearest(qs, ix.H, ix.n, opts.top || 40);
    const list = []; for (const [i, d] of near) { const c = BYKEY.get(ix.keys[i]); if (c) list.push({ c, d, i }); }
    if (!list.length) return null;
    // Même dessin que la 1re (réimpression, autre langue) : distance entre leurs empreintes officielles
    const ref = Uint32Array.from(ix.H.subarray(list[0].i * 6, list[0].i * 6 + 6));
    const group = list.filter(x => dist(ref, ix.H, x.i) <= SAME);
    const other = list.find(x => dist(ref, ix.H, x.i) > SAME);
    const gap = other ? other.d - list[0].d : 99, grid = cp.how === 'grille';
    const sure = list[0].d <= (grid ? GRID_MAX : SURE_MAX) && gap >= (grid ? GRID_GAP : SURE_GAP);
    // Dessin vraiment loin de tout (rien de net, pas une carte) : il ne sert qu'à départager ce que le texte a trouvé
    const weak = !sure && list[0].d > (grid ? GRID_MAX : SURE_MAX);
    return { list, group: group.map(x => x.c), sure, weak, best: list[0].d, gap, how: cp.how };
  }
  window.CallItEmpreinte = Object.assign({}, CORE, { load, match, cardPixels, SURE_MAX, SURE_GAP, SAME, on: () => { try { return localStorage.getItem('scanEmpreinte') !== 'non'; } catch (e) { return true; } } });
})(typeof self !== 'undefined' ? self : this);
