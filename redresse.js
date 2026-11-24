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

  /* ---------- Détection automatique des 4 coins ----------
     On estime la couleur du fond sur le pourtour de la photo, on garde les pixels qui s'en écartent nettement,
     puis les points extrêmes (x+y et x−y) donnent les 4 coins, même si la carte est tournée ou de biais. */
  function detectCorners(img) {
    const W = 240, H = Math.max(2, Math.round(img.naturalHeight * W / img.naturalWidth));
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d'); g.drawImage(img, 0, 0, W, H);
    const d = g.getImageData(0, 0, W, H).data, px = (x, y) => { const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
    const border = []; for (let x = 0; x < W; x += 2) { border.push(px(x, 0), px(x, H - 1)); } for (let y = 0; y < H; y += 2) { border.push(px(0, y), px(W - 1, y)); }
    const med = k => { const v = border.map(p => p[k]).sort((a, b) => a - b); return v[v.length >> 1]; };
    const bg = [med(0), med(1), med(2)];
    const dist = p => Math.abs(p[0] - bg[0]) + Math.abs(p[1] - bg[1]) + Math.abs(p[2] - bg[2]);
    const bd = border.map(dist).sort((a, b) => a - b), th = Math.max(60, bd[Math.floor(bd.length * 0.9)] * 1.5);
    let tl = null, tr = null, br = null, bl = null, n = 0;
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      if (dist(px(x, y)) < th) continue;
      n++;
      const s = x + y, t = x - y;
      if (!tl || s < tl[2]) tl = [x, y, s]; if (!br || s > br[2]) br = [x, y, s];
      if (!tr || t > tr[2]) tr = [x, y, t]; if (!bl || t < bl[2]) bl = [x, y, t];
    }
    const area = n / (W * H);
    if (!tl || area < 0.08 || area > 0.97) return null; // fond pas assez uni : on laisse l'utilisateur placer les coins
    return [tl, tr, br, bl].map(p => [p[0] / W, p[1] / H]);
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
    r.onload = () => { const img = new Image(); img.onload = () => { RD.src = r.result; RD.img = img; RD.q = detectCorners(img) || defaultCorners(); RD.auto = !!detectCorners(img); RD.open = true; render(); }; img.src = r.result; };
    r.readAsDataURL(file);
  };
  function apply(straighten) {
    const url = straighten ? warp(RD.img, RD.q) : RD.src;
    const img = new Image();
    img.onload = () => { CTR.img = url; try { CTR.L = ctrDetect(img); } catch (e) { CTR.L = [3, 8, 92, 97, 3, 8, 92, 97]; } CTR.sel = 0; RD.open = false; render(); };
    img.src = url;
  }

  /* ---------- Vue « Ajuster les coins » ---------- */
  const NAMES = ['Haut gauche', 'Haut droit', 'Bas droit', 'Bas gauche'];
  function view() {
    const pts = RD.q.map(([x, y]) => `${x * 100},${y * 100}`).join(' ');
    return `<div class="top">${backBtn()}<span class="sub" style="font-weight:600">${T('Centrage')}</span><span style="width:44px"></span></div>
    <div class="pad stack" style="gap:12px">
      <h1 class="h1">${T('Redresser la photo')}</h1>
      <div class="small">${T(RD.auto ? 'Les 4 coins de la carte ont été repérés. Fais glisser un point s’il n’est pas pile sur un coin, puis redresse : la carte sera remise bien à plat avant la mesure.' : 'Place les 4 points sur les coins de la carte (fais-les glisser), puis redresse : la carte sera remise bien à plat avant la mesure.')}</div>
      <div class="rd-wrap" id="rdwrap"><img src="${RD.src}" alt="" draggable="false">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polygon points="${pts}"/></svg>
        ${RD.q.map(([x, y], i) => `<span class="rd-pt${RD.drag === i ? ' on' : ''}" style="left:${x * 100}%;top:${y * 100}%" data-i="${i}" title="${esc(T(NAMES[i]))}"></span>`).join('')}</div>
      <div class="btns"><button class="btn" data-rd="skip">${T('Garder telle quelle')}</button><button class="btn primary" data-rd="ok">${T('Redresser et mesurer')}</button></div>
      <div class="small">${T('La photo reste sur ton appareil.')}</div>
    </div>`;
  }
  function refresh(wrap) {
    const pts = RD.q.map(([x, y]) => `${x * 100},${y * 100}`).join(' ');
    wrap.querySelector('polygon').setAttribute('points', pts);
    wrap.querySelectorAll('.rd-pt').forEach((el, i) => { el.style.left = RD.q[i][0] * 100 + '%'; el.style.top = RD.q[i][1] * 100 + '%'; el.classList.toggle('on', RD.drag === i); });
  }
  document.addEventListener('pointerdown', e => {
    const wrap = e.target.closest && e.target.closest('#rdwrap'); if (!wrap || !RD.open) return;
    const rc = wrap.getBoundingClientRect(), x = (e.clientX - rc.left) / rc.width, y = (e.clientY - rc.top) / rc.height;
    let best = 0, dd = 1e9; RD.q.forEach(([a, b], i) => { const v = Math.hypot((a - x) * rc.width, (b - y) * rc.height); if (v < dd) { dd = v; best = i; } });
    RD.drag = best; e.preventDefault(); wrap.setPointerCapture(e.pointerId);
    const move = ev => { RD.q[best] = [Math.max(0, Math.min(1, (ev.clientX - rc.left) / rc.width)), Math.max(0, Math.min(1, (ev.clientY - rc.top) / rc.height))]; refresh(wrap); };
    const up = () => { RD.drag = -1; refresh(wrap); wrap.removeEventListener('pointermove', move); wrap.removeEventListener('pointerup', up); wrap.removeEventListener('pointercancel', up); };
    move(e); wrap.addEventListener('pointermove', move); wrap.addEventListener('pointerup', up); wrap.addEventListener('pointercancel', up);
  });
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-rd]'); if (!b) return;
    const a = b.dataset.rd;
    if (a === 'ok') apply(true);
    else if (a === 'skip') apply(false);
    else if (a === 'again' && RD.src) { RD.open = true; render(); }
  });

  /* ---------- Branchement dans le rendu de #/centrage ---------- */
  const route = () => location.hash.replace(/^#\/?/, '').split(/[/?]/)[0];
  const baseRender = render;
  render = function (keepFocus) {
    if (DB && route() === 'centrage' && RD.open && RD.src) {
      app.innerHTML = view(); document.title = 'Centrage · CallIt!'; return;
    }
    if (route() !== 'centrage') RD.open = false;
    baseRender(keepFocus);
    // Après la mesure : revenir aux coins si le redressement n'est pas bon
    if (route() === 'centrage' && RD.src && CTR.img) {
      const w = app.querySelector('#ctrwrap');
      if (w && !app.querySelector('[data-rd="again"]')) w.insertAdjacentHTML('afterend', `<button class="btn small" data-rd="again" style="align-self:flex-start">${T('Ajuster les coins')}</button>`);
    }
  };
})();
