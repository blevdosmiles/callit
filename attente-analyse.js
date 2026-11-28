/* CallIt! · écran d'attente de l'Analyse complète : la table lumineuse du gradeur.
   Pendant que l'IA regarde les photos, la carte (les vraies photos, recadrées sur ses bords) descend en tournant
   devant une lumière aux couleurs de la carte : lumière rasante, règles qui mesurent les marges du centrage déjà mesuré, loupe
   qui grossit la vraie photo sur chaque coin et chaque bord. L'animation dure le temps de la réponse et ne montre
   jamais de défaut inventé : à la fin, seuls les défauts renvoyés par l'analyse (zones) sont pointés.
   CallItAttente.ouvrir({ faces: { recto: { img, L }, verso: { img, L } }, devant: 'recto' })
   CallItAttente.fin(img, réponse)  · quand toutes les faces ont répondu, les défauts s'affichent
   CallItAttente.fermer() */
(() => {
  const tx = (s, ...a) => (typeof F === 'function' ? F(s, ...a) : s.replace(/\{(\d)\}/g, (m, i) => a[+i]));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const calm = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  let S = null; // la séance en cours

  // Photo recadrée sur les 4 traits bleus (bords de la carte), assez grande pour la loupe
  function crop(img, L) {
    return new Promise(ok => {
      const im = new Image();
      im.onload = () => {
        try {
          const x0 = L[0] / 100 * im.width, x1 = L[3] / 100 * im.width, y0 = L[4] / 100 * im.height, y1 = L[7] / 100 * im.height;
          const w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0), k = Math.min(1, 1100 / Math.max(w, h));
          const cv = document.createElement('canvas'); cv.width = Math.round(w * k); cv.height = Math.round(h * k);
          // Coins arrondis comme une vraie carte (rayon ≈ 3 mm sur 63), un rien en retrait pour ne rien garder du fond de la photo
          const g = cv.getContext('2d'), e = cv.width * .004, r = cv.width * .05, W = cv.width - 2 * e, H = cv.height - 2 * e;
          g.beginPath(); g.moveTo(e + r, e); g.arcTo(e + W, e, e + W, e + H, r); g.arcTo(e + W, e + H, e, e + H, r); g.arcTo(e, e + H, e, e, r); g.arcTo(e, e, e + W, e, r); g.closePath(); g.clip();
          g.drawImage(im, x0, y0, w, h, 0, 0, cv.width, cv.height);
          const u = cv.toDataURL('image/webp', 0.9); ok(u.startsWith('data:image/webp') ? u : cv.toDataURL('image/png'));
        } catch (e) { ok(img); }
      };
      im.onerror = () => ok(null); im.src = img;
    });
  }
  // Les couleurs principales de la photo (3 teintes vives), pour la lumière du fond
  function palette(src) {
    return new Promise(ok => {
      const im = new Image(); im.onload = () => {
        try {
          const cv = document.createElement('canvas'); cv.width = 24; cv.height = 34; const g = cv.getContext('2d'); const mx = im.width * .14, my = im.height * .12; g.drawImage(im, mx, my, im.width - 2 * mx, im.height - 2 * my, 0, 0, 24, 34); // sans la bordure, pour garder les couleurs de l'illustration
          const px = g.getImageData(0, 0, 24, 34).data, box = {};
          for (let i = 0; i < px.length; i += 4) {
            const r = px[i], gg = px[i + 1], b = px[i + 2], mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), sat = mx ? (mx - mn) / mx : 0; if (mx < 50 || sat < .15) continue;
            const k = (r >> 5) + '-' + (gg >> 5) + '-' + (b >> 5), e = box[k] || (box[k] = { n: 0, r: 0, g: 0, b: 0, w: 0 }); e.n++; e.r += r; e.g += gg; e.b += b; e.w += sat;
          }
          const hue = e => { const r = e.r / e.n, gg = e.g / e.n, b = e.b / e.n, mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), d = mx - mn || 1; return (mx === r ? (gg - b) / d : mx === gg ? 2 + (b - r) / d : 4 + (r - gg) / d) * 60; };
          const out = []; for (const e of Object.values(box).sort((a, b) => b.n - a.n)) { const h = hue(e); if (out.every(o => Math.min(Math.abs(o.h - h), 360 - Math.abs(o.h - h)) > 35)) out.push({ h: (h + 360) % 360 | 0, c: `hsl(${(h + 360) % 360 | 0} 85% 62%)` }); if (out.length === 3) break; }
          ok(out);
        } catch (e) { ok([]); }
      }; im.onerror = () => ok([]); im.src = src;
    });
  }
  // Traits du centrage rapportés à la carte recadrée (0 à 100 sur la carte)
  const onCard = L => { const X = v => (v - L[0]) / (L[3] - L[0]) * 100, Y = v => (v - L[4]) / (L[7] - L[4]) * 100; return [X(L[0]), X(L[1]), X(L[2]), X(L[3]), Y(L[4]), Y(L[5]), Y(L[6]), Y(L[7])]; };
  const ratio = (a, b) => { const s = a + b; return s > 0 ? Math.round(a / s * 100) : null; };
  const lrOf = L => ratio(L[1] - L[0], L[3] - L[2]), tbOf = L => ratio(L[5] - L[4], L[7] - L[6]);
  const okL = L => Array.isArray(L) && L.length === 8 && L[3] > L[0] && L[7] > L[4];

  async function ouvrir(o) {
    fermer();
    const faces = {}; for (const k of ['recto', 'verso']) { const d = (o.faces || {})[k]; if (d && d.img) faces[k] = { img: d.img, L: okL(d.L) ? d.L : null }; }
    const devant = faces[o.devant] ? o.devant : Object.keys(faces)[0]; if (!devant) return;
    const autre = devant === 'recto' ? 'verso' : 'recto';
    const me = S = { faces, devant, res: {}, done: false, t0: performance.now(), ang: devant === 'recto' ? 0 : 180, spin: 0, anim: null, sway: 0 };
    const L0 = faces[devant].L, ctr = L0 ? lrOf(L0) : null;
    const el = document.createElement('div'); el.className = 'aa'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', tx('Analyse complète'));
    el.innerHTML = `<div class="aa-in">
      <div class="aa-head"><button type="button" class="iconbtn" data-aa="close" aria-label="${esc(tx('Retour'))}">${typeof icon === 'function' ? icon('back') : '←'}</button><h2>${esc(tx('Analyse complète'))}</h2></div>
      <div class="aa-stage"><div class="aa-bg" aria-hidden="true"></div><div class="aa-status"><span class="aa-tt">${esc(tx('Analyse en cours'))}</span><b class="aa-time">0:00</b></div>
        <div class="aa-shadow"></div>
        <div class="aa-cw"><div class="aa-card">
          <div class="aa-face" data-f="recto"></div><i class="aa-edge l"></i><i class="aa-edge r"></i><i class="aa-edge t"></i><i class="aa-edge b"></i><div class="aa-face v" data-f="verso"></div>
        </div></div><div class="aa-mes"></div></div>
      <div class="aa-what" aria-live="polite">${esc(tx('La carte arrive'))}</div>
      <div class="aa-steps">
        <div class="aa-st" data-s="centrage"><i class="ic"></i>${esc(tx('Centrage'))}${ctr != null ? `<span class="v">${ctr}/${100 - ctr}</span>` : ''}</div>
        <div class="aa-st" data-s="coins"><i class="ic"></i>${esc(tx('Coins'))}</div>
        <div class="aa-st" data-s="bords"><i class="ic"></i>${esc(tx('Bords'))}</div>
        <div class="aa-st" data-s="surface"><i class="ic"></i>${esc(tx('Surface'))}</div>
      </div>
      <button type="button" class="btn primary aa-go" data-aa="close">${esc(tx('Voir le résultat'))}</button>
    </div>`;
    document.body.appendChild(el); me.el = el;
    el.addEventListener('click', e => { if (e.target.closest('[data-aa="close"]')) fermer(true); });
    me.key = e => { if (e.key === 'Escape') fermer(true); }; document.addEventListener('keydown', me.key);
    // Les deux faces de la carte 3D : la photo recadrée, sinon un dos uni
    for (const f of [devant, autre]) {
      const d = faces[f], box = el.querySelector(`.aa-face[data-f="${f}"]`); if (!d) continue;
      const src = d.L ? await crop(d.img, d.L) : d.img; if (S !== me) return;
      if (src && f === devant) palette(src).then(c => { if (S !== me || !c.length) return; const st = el.querySelector('.aa-stage'); c.forEach((v, i) => { st.style.setProperty('--aa-c' + (i + 1), v.c); st.style.setProperty('--aa-h' + (i + 1), v.h); }); if (c.length < 3) for (let i = c.length; i < 3; i++) st.style.setProperty('--aa-h' + (i + 1), (c[0].h + 40 * i) % 360);  });
      if (src) { d.src = src; box.innerHTML = `<img src="${src}" alt="" draggable="false"><div class="aa-spec"></div><div class="aa-rake"></div>`; }
    }
    glFond(me); run(me);
  }

  const $$ = (me, s) => [...me.el.querySelectorAll(s)];
  const say = (me, t) => { const s = me.el.querySelector('.aa-what'); if (s) s.textContent = t; };
  const step = (me, k) => $$(me, '.aa-st').forEach(e => e.classList.toggle('now', e.dataset.s === k));
  const live = me => S === me && !me.done;

  // Se tourner face à une face (en faisant un tour en route), en douceur
  const goTo = (me, f, turns, ms) => new Promise(r => { const base = f === 'recto' ? 0 : 180, to = base + Math.ceil((me.ang - base) / 360 + turns) * 360; me.anim = { from: me.ang, to, t: performance.now(), ms: calm() ? 1 : ms, r }; me.spin = 0; });
  function rect(me) { const r = me.el.querySelector('.aa-cw').getBoundingClientRect(), s = me.el.querySelector('.aa-stage').getBoundingClientRect(); return { x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height }; }
  function mk(me, cls, css) { const e = document.createElement('div'); e.className = cls; Object.assign(e.style, css); me.el.querySelector('.aa-mes').appendChild(e); return e; }

  async function rake(me, f) { const r = me.el.querySelector(`.aa-face[data-f="${f}"] .aa-rake`); if (!r) return; r.classList.remove('go'); void r.offsetWidth; r.classList.add('go'); await wait(1900); }
  // Taille réelle de la carte du jeu choisi (63 × 88 mm par défaut), pour donner chaque marge en millimètres
  const cardMM = () => { const m = String((typeof GI === 'object' && GI && GI.size) || '').match(/([\d,.]+)\s*×\s*([\d,.]+)/); return m ? [parseFloat(m[1].replace(',', '.')), parseFloat(m[2].replace(',', '.'))] : [63, 88]; };
  const mm = v => (Math.round(v * 10) / 10).toLocaleString(typeof UI === 'string' ? UI : 'fr', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' mm';
  async function measure(me, f) {
    const d = me.faces[f]; if (!d.L) return;
    step(me, 'centrage'); const R = rect(me), L = onCard(d.L), X = v => R.x + R.w * v / 100, Y = v => R.y + R.h * v / 100, px = n => n + 'px';
    const lr = lrOf(d.L), tb = tbOf(d.L), [W, H] = cardMM();
    // Le cadre intérieur, tracé sur la carte
    const frame = mk(me, 'aa-frame', { left: px(X(L[1])), top: px(Y(L[5])), width: px(X(L[2]) - X(L[1])), height: px(Y(L[6]) - Y(L[5])) });
    const all = [frame];
    await wait(60); frame.classList.add('on'); say(me, tx(f === 'verso' ? 'Cadre du verso repéré' : 'Cadre du recto repéré')); await wait(650);
    // Puis chaque marge : la bande, la cote d'un bord à l'autre et sa mesure
    const cy = R.y + R.h * .5, cx = R.x + R.w * .5, side = [
      ['Marge gauche', W * (L[1] - L[0]) / 100, 'h', X(L[0]), X(L[1]), cy - R.h * .18, { left: px(R.x - 12), top: px(cy - R.h * .18), transform: 'translate(-100%,-50%)' }],
      ['Marge droite', W * (L[3] - L[2]) / 100, 'h', X(L[2]), X(L[3]), cy - R.h * .18, { left: px(R.x + R.w + 12), top: px(cy - R.h * .18), transform: 'translateY(-50%)' }],
      ['Marge du haut', H * (L[5] - L[4]) / 100, 'v', Y(L[4]), Y(L[5]), cx + R.w * .22, { left: px(cx + R.w * .22), top: px(R.y - 12), transform: 'translate(-50%,-100%)' }],
      ['Marge du bas', H * (L[7] - L[6]) / 100, 'v', Y(L[6]), Y(L[7]), cx + R.w * .22, { left: px(cx + R.w * .22), top: px(R.y + R.h + 12), transform: 'translateX(-50%)' }]];
    for (const [t, v, o, a0, a1, at, tag] of side) {
      if (!live(me)) break;
      const band = o === 'h' ? mk(me, 'aa-band', { left: px(a0), width: px(a1 - a0), top: px(R.y), height: px(R.h) }) : mk(me, 'aa-band', { top: px(a0), height: px(a1 - a0), left: px(R.x), width: px(R.w) });
      const dim = o === 'h' ? mk(me, 'aa-dim h', { left: px(a0), width: px(Math.max(2, a1 - a0)), top: px(at) }) : mk(me, 'aa-dim v', { top: px(a0), height: px(Math.max(2, a1 - a0)), left: px(at) });
      const lead = o === 'h' ? mk(me, 'aa-lead h', a0 < cx ? { left: px(R.x - 12), width: px(a0 - R.x + 12), top: px(at) } : { left: px(a1), width: px(R.x + R.w + 12 - a1), top: px(at) })
        : mk(me, 'aa-lead v', a0 < cy ? { top: px(R.y - 12), height: px(a0 - R.y + 12), left: px(at) } : { top: px(a1), height: px(R.y + R.h + 12 - a1), left: px(at) });
      const chip = mk(me, 'aa-tag', tag); chip.innerHTML = `<b>${mm(v)}</b>`;
      all.push(band, dim, lead, chip); await wait(40);
      [band, dim, lead, chip].forEach(e => e.classList.add('on')); say(me, tx(t) + ' : ' + mm(v)); await wait(620);
      band.classList.remove('on');
    }
    if (!live(me)) { all.forEach(p => p.remove()); return; }
    say(me, tx(f === 'verso' ? 'Centrage du verso : {0} et {1}' : 'Centrage du recto : {0} et {1}', `${lr}/${100 - lr}`, `${tb}/${100 - tb}`));
    await wait(1300); all.forEach(p => p.classList.remove('on')); await wait(350); all.forEach(p => p.remove());
  }
  // La loupe grossit la vraie photo à l'endroit regardé
  const COINS = [[5, 4, 'Coin haut gauche'], [95, 4, 'Coin haut droit'], [95, 96, 'Coin bas droit'], [5, 96, 'Coin bas gauche']];
  const BORDS = [[50, 3, 'Bord du haut'], [97, 50, 'Bord droit'], [50, 97, 'Bord du bas'], [3, 50, 'Bord gauche']];
  async function loupe(me, f, spots, k) {
    const d = me.faces[f]; if (!d.src) return;
    step(me, k); const R = rect(me), Z = 3.2, pos = (x, y) => ({ left: R.x + R.w * x / 100 + 'px', top: R.y + R.h * y / 100 + 'px', backgroundPosition: `${-(R.w * Z * x / 100 - 46)}px ${-(R.h * Z * y / 100 - 46)}px` });
    const lp = mk(me, 'aa-loupe', { backgroundImage: `url("${d.src}")`, backgroundSize: `${R.w * Z}px ${R.h * Z}px`, ...pos(spots[0][0], spots[0][1]) }); void lp.offsetWidth;
    for (const [x, y, t] of spots) { if (!live(me)) break; Object.assign(lp.style, pos(x, y)); lp.classList.add('on'); say(me, tx(t)); await wait(950); }
    lp.classList.remove('on'); await wait(300); lp.remove();
  }
  async function inspect(me, f) {
    await goTo(me, f, 1, 1700); if (!live(me)) return; me.sway = 3;
    step(me, 'surface'); say(me, tx(f === 'verso' ? 'Lumière rasante sur le verso' : 'Lumière rasante sur le recto')); await rake(me, f); if (!live(me)) return;
    await measure(me, f); if (!live(me)) return;
    await loupe(me, f, COINS, 'coins'); if (!live(me)) return;
    await loupe(me, f, BORDS, 'bords'); if (!live(me)) return;
    step(me, 'surface'); say(me, tx(f === 'verso' ? 'Surface du verso, sous un autre angle' : 'Surface du recto, sous un autre angle')); await rake(me, f);
  }

  async function run(me) {
    const el = me.el, cw = el.querySelector('.aa-cw'), card = el.querySelector('.aa-card'), time = el.querySelector('.aa-time'), shadow = el.querySelector('.aa-shadow');
    let last = performance.now();
    const loop = now => {
      if (S !== me) return; const dt = Math.min(.1, (now - last) / 1000); last = now;
      if (me.anim) { const a = me.anim, p = Math.min(1, (now - a.t) / a.ms), e = p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; me.ang = a.from + (a.to - a.from) * e; if (p >= 1) { me.anim = null; a.r(); } }
      else me.ang += dt * me.spin;
      const sw = me.sway && !calm() ? Math.sin(now / 900) * me.sway : 0, A = me.ang + sw, rad = A * Math.PI / 180;
      card.style.transform = `rotateY(${A}deg)`;
      el.querySelectorAll('.aa-spec').forEach(s => { s.style.backgroundPosition = `${50 + Math.sin(rad) * 60}% 0`; });
      shadow.style.transform = `scaleX(${.35 + .65 * Math.abs(Math.cos(rad))})`;
      if (!me.done) { const s = Math.floor((now - me.t0) / 1000); time.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    // Arrivée : debout, d'en haut, en tournant
    cw.style.transform = 'translateY(-360px)'; cw.style.opacity = 0; me.spin = calm() ? 0 : 300; await wait(60);
    cw.style.transition = 'transform 1.2s cubic-bezier(.2,.8,.3,1.06), opacity .3s'; cw.style.opacity = 1; cw.style.transform = '';
    await wait(1300); me.spin = calm() ? 0 : 120; await wait(500);
    const order = [me.devant, me.devant === 'recto' ? 'verso' : 'recto'].filter(f => me.faces[f]);
    while (live(me)) for (const f of order) { if (!live(me)) break; await inspect(me, f); }
  }

  // Défauts à pointer : zones renvoyées par l'IA (en % de la photo), rapportées à la carte recadrée
  const CRIT = { coins: 'Coins', bords: 'Bords', surface: 'Surface' };
  function pins(face, r) {
    const j = r && r.j; if (!j || j.visible === false || !Array.isArray(j.zones)) return [];
    const L = face.L, lang = typeof UI === 'string' ? UI : 'fr', court = ((j.courts || {})[lang]) || {};
    return j.zones.slice(0, 4).map(z => {
      let x = +z.x, y = +z.y; if (!z || !isFinite(x) || !isFinite(y)) return null;
      if (L) { x = (x - L[0]) / (L[3] - L[0]) * 100; y = (y - L[4]) / (L[7] - L[4]) * 100; }
      if (x < -3 || x > 103 || y < -3 || y > 103) return null;
      const k = String(z.critere || '').toLowerCase();
      return { x: Math.max(2, Math.min(98, x)), y: Math.max(2, Math.min(98, y)), t: tx(CRIT[k] || 'Défaut'), c: typeof court[k] === 'string' ? court[k] : '' };
    }).filter(Boolean);
  }

  async function fin(img, r) {
    const me = S; if (!me || me.done) return;
    const f = Object.keys(me.faces).find(k => me.faces[k].img === img); if (!f) return;
    me.res[f] = r; if (Object.keys(me.res).length < Object.keys(me.faces).length) return;
    // Une face sans réponse utilisable (erreur, photo floue) : on referme, le message s'affiche sur la page
    if (Object.values(me.res).some(x => !x || x.err || !x.j || x.j.visible === false)) { fermer(true); return; }
    me.done = true; me.sway = 0; step(me, null); $$(me, '.aa-mes > *').forEach(e => e.remove());
    await goTo(me, me.devant, 1, 1500); if (S !== me) return;
    const el = me.el; el.classList.add('fin'); el.querySelector('.aa-tt').textContent = tx('Analyse terminée');
    $$(me, '.aa-st').forEach(e => { e.classList.add('ok'); e.querySelector('.ic').textContent = '✓'; });
    const n = Object.keys(me.res).reduce((s, k) => s + pins(me.faces[k], me.res[k]).length, 0);
    say(me, n === 0 ? tx('Rien de visible sur ces photos') : n === 1 ? tx('{0} point à regarder de près', 1) : tx('{0} points à regarder de près', n));
    const R = rect(me), stage = el.querySelector('.aa-stage');
    for (const z of pins(me.faces[me.devant], me.res[me.devant])) {
      if (S !== me) return;
      const px = R.x + R.w * z.x / 100, py = R.y + R.h * z.y / 100, p = mk(me, 'aa-pin', { left: px + 'px', top: py + 'px' }); await wait(40); p.classList.add('on');
      const c = mk(me, 'aa-call', { top: Math.max(8, py - 20) + 'px' }); c.innerHTML = esc(z.t) + (z.c ? `<small>${esc(z.c)}</small>` : '');
      if (z.x > 50) c.style.right = (stage.clientWidth - px + 16) + 'px'; else c.style.left = (px + 16) + 'px';
      await wait(30); c.classList.add('on'); await wait(550);
    }
    const go = el.querySelector('.aa-go'); if (go) go.focus({ preventScroll: true });
  }

  // Fond « nébuleuse » dessiné par la carte graphique, aux teintes de l'illustration (--aa-h1..3). Sans WebGL, le dégradé CSS reste.
  const FRAG = `precision mediump float;
uniform vec2 R; uniform float T; uniform vec3 C1, C2, C3;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p){ float v = 0., a = .5; for (int i = 0; i < 5; i++) { v += a * n(p); p = p * 2.03 + 3.1; a *= .5; } return v; }
// étoiles : au plus une par case, à un endroit et d'une taille au hasard ; dens règle combien de cases en ont (amas et vides)
vec3 star(vec2 uv, float sc, float sz, float dens){
  vec2 g = uv * sc, id = floor(g), f = fract(g) - .5; float r = h(id), r2 = h(id + 7.3), r3 = h(id + 3.9);
  if (r3 > dens) return vec3(0.);
  vec2 d = f - (vec2(r, r2) - .5) * .9; float rad = (.015 + .09 * pow(h(id + 1.7), 6.)) * sz;
  float tw = .75 + .25 * sin(T * (.3 + r * 1.7) + r2 * 40.) * sin(T * (.17 + r2) + r * 9.);
  float core = smoothstep(rad, 0., length(d)), halo = exp(-dot(d, d) / (rad * rad * 12.)) * .3;
  vec3 tint = mix(vec3(.72, .82, 1.), vec3(1., .86, .68), h(id + 5.5));
  return tint * (core + halo) * tw * (.35 + .65 * h(id + 2.2));
}
void main(){
  vec2 uv = gl_FragCoord.xy / R.y, q = gl_FragCoord.xy / R; vec2 c = uv - vec2(R.x / R.y * .5, .55);
  // Nébuleuse : nuages de couleur irréguliers qui se tordent lentement, bandes de poussière sombre, étoiles en amas
  vec2 p = uv * 1.6 + vec2(.3, -.2); vec2 w = vec2(fbm(p + T * .035), fbm(p * 1.3 + 5.2 - T * .025));
  float f = fbm(p + 2.8 * w + fbm(p * .5 - T * .01)); float big = fbm(uv * .7 + 11.); float lane = smoothstep(.5, .75, fbm(p * 2.2 + w * 1.5 + 21.));
  vec3 col = vec3(.015, .015, .03) + (C1 * pow(f, 2.) * 1.25 + C2 * pow(w.x, 2.6) * .7 * big + C3 * pow(w.y * big, 3.) * .6) * (.55 + .9 * big);
  col *= 1. - lane * .65; col *= smoothstep(1.3, .15, length(c - vec2(.08 * sin(T * .05), 0.)));
  float dens = .18 + .6 * smoothstep(.25, .75, f + big * .3);
  col += star(uv, 48., .6, dens) * 1.1 + star(uv + 3.1, 90., .45, dens * .8) * .8 + star(uv + 7.7, 17., 1., .22) * 1.3 + star(uv + 1.9, 8., 1.3, .07) * 1.2;
  gl_FragColor = vec4(col, 1.);
}`;
  function hsl2rgb(hh, s, l) { const k = n => (n + hh / 30) % 12, a = s * Math.min(l, 1 - l), f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); return [f(0), f(8), f(4)]; }
  function glFond(me) {
    const st = me.el.querySelector('.aa-stage'), bg = me.el.querySelector('.aa-bg'); let gl = null, cv = null, u = null, t0 = performance.now();
    const tick = () => {
      if (S !== me) return;
      if (!gl && cv !== false) {
        cv = document.createElement('canvas'); cv.className = 'aa-gl'; gl = cv.getContext('webgl', { antialias: false, alpha: false });
        if (!gl) { cv = false; } else {
          const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); return s; };
          const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}')); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FRAG)); gl.linkProgram(pr);
          if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) { gl = null; cv = false; } else {
            gl.useProgram(pr); gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
            const a = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
            u = Object.fromEntries(['R', 'T', 'C1', 'C2', 'C3'].map(k => [k, gl.getUniformLocation(pr, k)])); bg.appendChild(cv);
          }
        }
      }
      if (gl) {
        const r = st.getBoundingClientRect(), k = Math.min(1.5, window.devicePixelRatio || 1), w = Math.round(r.width * k), hh = Math.round(r.height * k);
        if (cv.width !== w || cv.height !== hh) { cv.width = w; cv.height = hh; gl.viewport(0, 0, w, hh); }
        const cs = getComputedStyle(st), hu = i => parseFloat(cs.getPropertyValue('--aa-h' + i)) || [270, 30, 190][i - 1];
        gl.uniform2f(u.R, w, hh); gl.uniform1f(u.T, calm() ? 4 : (performance.now() - t0) / 1000);
        [1, 2, 3].forEach(i => gl.uniform3fv(u['C' + i], hsl2rgb(hu(i), .8, .55)));
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function fermer(montrer) {
    const me = S; if (!me) return; S = null;
    document.removeEventListener('keydown', me.key); if (me.el) me.el.remove();
    if (montrer) { const b = document.querySelector('.ctr-full'); if (b) b.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  }

  window.CallItAttente = { ouvrir, fin, fermer, ouvert: () => !!S };
})();
