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
          cv.getContext('2d').drawImage(im, x0, y0, w, h, 0, 0, cv.width, cv.height); ok(cv.toDataURL('image/jpeg', 0.88));
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
          const cv = document.createElement('canvas'); cv.width = 24; cv.height = 34; const g = cv.getContext('2d'); g.drawImage(im, 0, 0, 24, 34);
          const px = g.getImageData(0, 0, 24, 34).data, box = {};
          for (let i = 0; i < px.length; i += 4) {
            const r = px[i], gg = px[i + 1], b = px[i + 2], mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), sat = mx ? (mx - mn) / mx : 0; if (mx < 50 || sat < .25) continue;
            const k = (r >> 5) + '-' + (gg >> 5) + '-' + (b >> 5), e = box[k] || (box[k] = { n: 0, r: 0, g: 0, b: 0, w: 0 }); e.n++; e.r += r; e.g += gg; e.b += b; e.w += sat;
          }
          const hue = e => { const r = e.r / e.n, gg = e.g / e.n, b = e.b / e.n, mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), d = mx - mn || 1; return (mx === r ? (gg - b) / d : mx === gg ? 2 + (b - r) / d : 4 + (r - gg) / d) * 60; };
          const out = []; for (const e of Object.values(box).sort((a, b) => b.w - a.w)) { const h = hue(e); if (out.every(o => Math.min(Math.abs(o.h - h), 360 - Math.abs(o.h - h)) > 35)) out.push({ h: (h + 360) % 360 | 0, c: `hsl(${(h + 360) % 360 | 0} 85% 62%)` }); if (out.length === 3) break; }
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
      <div class="aa-stage"><div class="aa-bg" aria-hidden="true"></div><div class="aa-aura" aria-hidden="true"><i></i><i></i><i></i></div><div class="aa-status"><span class="aa-tt">${esc(tx('Analyse en cours'))}</span><b class="aa-time">0:00</b></div>
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
      if (src && f === devant) palette(src).then(c => { if (S !== me || !c.length) return; const st = el.querySelector('.aa-stage'); c.forEach((v, i) => { st.style.setProperty('--aa-c' + (i + 1), v.c); st.style.setProperty('--aa-h' + (i + 1), v.h); }); if (c.length < 3) for (let i = c.length; i < 3; i++) st.style.setProperty('--aa-h' + (i + 1), (c[0].h + 40 * i) % 360); st.classList.add('teint'); });
      if (src) { d.src = src; box.innerHTML = `<img src="${src}" alt="" draggable="false"><div class="aa-spec"></div><div class="aa-rake"></div>`; }
    }
    run(me);
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

  function fermer(montrer) {
    const me = S; if (!me) return; S = null;
    document.removeEventListener('keydown', me.key); if (me.el) me.el.remove();
    if (montrer) { const b = document.querySelector('.ctr-full'); if (b) b.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  }

  window.CallItAttente = { ouvrir, fin, fermer, ouvert: () => !!S };
})();
