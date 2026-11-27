// CallIt! · Essai de la reconnaissance par le dessin (empreinte.js) sur des photos simulées.
// 1) On prend N cartes au hasard dans l'index (graine fixe : les mêmes à chaque essai) et on lit leur GRANDE image officielle
//    (« high », 600 px : pas celle de l'index, en 245 px).
// 2) On en fait une photo de téléphone : fond (table, tapis, bois), carte penchée et en perspective, éclairage inégal,
//    teinte de la lampe, reflet blanc (une fois sur deux), pochette (une fois sur trois), flou, bruit, JPEG.
// 3) Les photos sont écrites dans un dossier (pour l'essai dans le navigateur, outils/essai_scan_navigateur.mjs) avec la
//    bonne réponse, et on mesure ici l'empreinte seule : coins de la carte connus à ±2,5 % près (le repérage n'est jamais parfait).
// Usage : node outils/essai_empreintes.mjs [--n 300] [--dossier essai-photos] [--index data/empreintes.json]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const E = require('../empreinte.js');
const sharp = (await import('sharp')).default;
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const NB = +arg('--n', 300), DIR = arg('--dossier', 'essai-photos'), IDX = JSON.parse(fs.readFileSync(arg('--index', 'data/empreintes.json'), 'utf8'));
const db = JSON.parse(fs.readFileSync('data/cards.json', 'utf8'));
const byKey = new Map(db.cards.map(c => { c.set = db.sets[c.s]; return [c.set.reg + ':' + c.set.id + ':' + c.num, c]; }));
const H = E.decode(IDX.h), n = IDX.k.length;
let seed = 20261127; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const U = (a, b) => a + (b - a) * rnd();

// Homographie (la même que redresse.js)
function homography(a, b) {
  const M = [], v = [];
  for (let i = 0; i < 4; i++) { const [x, y] = a[i], [u, w] = b[i]; M.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); v.push(u); M.push([0, 0, 0, x, y, 1, -w * x, -w * y]); v.push(w); }
  for (let c = 0; c < 8; c++) { let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r; [M[c], M[p]] = [M[p], M[c]]; [v[c], v[p]] = [v[p], v[c]]; for (let r = 0; r < 8; r++) { if (r === c) continue; const f = M[r][c] / M[c][c]; for (let k = c; k < 8; k++) M[r][k] -= f * M[c][k]; v[r] -= f * v[c]; } }
  const h = v.map((x, i) => x / M[i][i]); h.push(1); return h;
}
const bil = (s, sw, sh, ch, X, Y, k) => { const x0 = Math.max(0, Math.min(sw - 2, X | 0)), y0 = Math.max(0, Math.min(sh - 2, Y | 0)), fx = Math.min(1, Math.max(0, X - x0)), fy = Math.min(1, Math.max(0, Y - y0)), i0 = (y0 * sw + x0) * ch, i1 = i0 + sw * ch; return (s[i0 + k] * (1 - fx) + s[i0 + ch + k] * fx) * (1 - fy) + (s[i1 + k] * (1 - fx) + s[i1 + ch + k] * fx) * fy; };

// Une photo simulée de la carte (pixels RGBA cw × chh) : { buf (JPEG), q (coins en parts de la photo) }
async function simulate(card, cw, chh) {
  const portrait = rnd() < 0.75, PW = portrait ? 1200 : 1600, PH = portrait ? 1600 : 1200;
  const out = new Uint8ClampedArray(PW * PH * 3);
  // Fond : couleur de table ou de tapis, dégradé, grain ; parfois des lattes de bois
  const bg = [[U(20, 90), U(20, 90), U(20, 90)], [U(120, 200), U(90, 160), U(50, 110)], [U(170, 240), U(170, 240), U(170, 240)], [U(10, 60), U(40, 110), U(20, 90)]][(rnd() * 4) | 0];
  const wood = rnd() < 0.3, gx = U(-0.4, 0.4), gy = U(-0.4, 0.4);
  // La carte : 30 à 60 % de la largeur, penchée, en perspective
  const W0 = Math.min(PW, PH) * U(0.3, 0.62), H0 = W0 * 88 / 63, cx = PW / 2 + U(-0.12, 0.12) * PW, cy = PH / 2 + U(-0.1, 0.1) * PH, ang = U(-12, 12) * Math.PI / 180;
  const base = [[-W0 / 2, -H0 / 2], [W0 / 2, -H0 / 2], [W0 / 2, H0 / 2], [-W0 / 2, H0 / 2]];
  const flip = rnd() < 0.1; // carte tête en bas
  const P = base.map(([x, y]) => { x += U(-0.06, 0.06) * W0; y += U(-0.05, 0.05) * H0; return [cx + x * Math.cos(ang) - y * Math.sin(ang), cy + x * Math.sin(ang) + y * Math.cos(ang)]; });
  const src = flip ? [[cw, chh], [0, chh], [0, 0], [cw, 0]] : [[0, 0], [cw, 0], [cw, chh], [0, chh]];
  const h = homography(P, src); // de la photo vers l'image de la carte
  const light = [U(0.85, 1.15), U(0.85, 1.15), U(0.8, 1.15)], lg = [U(-0.35, 0.35), U(-0.35, 0.35)], bright = U(0.7, 1.1);
  const glare = rnd() < 0.5 ? { x: U(0.15, 0.85), y: U(0.15, 0.85), r: U(0.08, 0.25), a: U(0.35, 0.85) } : null;
  const sleeve = rnd() < 0.33 ? U(0.04, 0.12) : 0, rad = 0.045 * cw;
  for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
    const o = (y * PW + x) * 3, nx = x / PW - 0.5, ny = y / PH - 0.5;
    let r = bg[0], g = bg[1], b = bg[2];
    const shade = 1 + gx * nx + gy * ny + (wood ? 0.12 * Math.sin((portrait ? x : y) / 23 + Math.sin(y / 90) * 2) : 0) + (rnd() - 0.5) * 0.06;
    r *= shade; g *= shade; b *= shade;
    const z = h[6] * x + h[7] * y + 1, X = (h[0] * x + h[1] * y + h[2]) / z, Y = (h[3] * x + h[4] * y + h[5]) / z;
    if (X >= 0 && Y >= 0 && X < cw && Y < chh) {
      const dx = Math.max(0, rad - X, X - (cw - rad)), dy = Math.max(0, rad - Y, Y - (chh - rad)); // coins arrondis
      const a = dx && dy ? (Math.hypot(dx, dy) <= rad ? 1 : 0) : 1;
      if (a) {
        const u = X / cw, v = Y / chh, al = bil(card, cw, chh, 4, X, Y, 3) / 255;
        let cr = bil(card, cw, chh, 4, X, Y, 0), cg = bil(card, cw, chh, 4, X, Y, 1), cb = bil(card, cw, chh, 4, X, Y, 2);
        cr = cr * al + 128 * (1 - al); cg = cg * al + 128 * (1 - al); cb = cb * al + 128 * (1 - al);
        const L = bright * (1 + lg[0] * (u - 0.5) + lg[1] * (v - 0.5));
        r = cr * L; g = cg * L; b = cb * L;
        if (sleeve) { r = r * (1 - sleeve) + 235 * sleeve; g = g * (1 - sleeve) + 235 * sleeve; b = b * (1 - sleeve) + 240 * sleeve; }
        if (glare) { const d = Math.hypot((u - glare.x) * 0.72, v - glare.y) / glare.r, k = glare.a * Math.exp(-d * d * 2); r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k; }
      }
    }
    out[o] = r * light[0]; out[o + 1] = g * light[1]; out[o + 2] = b * light[2];
  }
  const blur = U(0.3, 1.8), q = Math.round(U(70, 90));
  const buf = await sharp(Buffer.from(out.buffer), { raw: { width: PW, height: PH, channels: 3 } }).blur(blur).jpeg({ quality: q }).toBuffer();
  return { buf, q: P.map(([x, y]) => [x / PW, y / PH]), flip, glare: !!glare, sleeve: !!sleeve, blur };
}
// La carte remise droite à partir de coins (comme redresse.js warp), en 240 px de large
function unwarp(px, W, Hh, q) {
  const cw = 240, chh = Math.round(240 * 88 / 63), P = q.map(([x, y]) => [x * W, y * Hh]);
  const h = homography([[0, 0], [cw, 0], [cw, chh], [0, chh]], P), o = new Uint8ClampedArray(cw * chh * 3);
  for (let y = 0; y < chh; y++) for (let x = 0; x < cw; x++) { const z = h[6] * x + h[7] * y + 1, X = (h[0] * x + h[1] * y + h[2]) / z, Y = (h[3] * x + h[4] * y + h[5]) / z; for (let k = 0; k < 3; k++) o[(y * cw + x) * 3 + k] = bil(px, W, Hh, 3, X, Y, k); }
  return { px: o, W: cw, H: chh };
}
const bigUrl = key => {
  const c = byKey.get(key); if (!c) return [];
  const L = c.set.reg === 'en' ? ['en', 'fr', 'es', 'it', 'pt', 'de'] : ['ja', 'zh-tw', 'th', 'id', 'ko', 'zh-cn'];
  return L.map(l => db.imageBase.replace('{lang}', l).replace('{serie}', encodeURIComponent(c.set.serie)).replace('{set}', encodeURIComponent(c.set.id)).replace('{num}', encodeURIComponent(c.num)));
};

fs.mkdirSync(DIR, { recursive: true });
const picks = new Set(); while (picks.size < Math.min(NB, n)) picks.add((rnd() * n) | 0);
const rows = [], meta = [];
let k = 0;
for (const i of picks) {
  const key = IDX.k[i]; let img = null;
  for (const u of bigUrl(key)) { try { const r = await fetch(u, { signal: AbortSignal.timeout(30000) }); if (r.ok) { img = Buffer.from(await r.arrayBuffer()); break; } } catch (e) {} }
  if (!img) continue;
  const { data, info } = await sharp(img).ensureAlpha().resize({ width: 600 }).raw().toBuffer({ resolveWithObject: true });
  const ph = await simulate(data, info.width, info.height);
  const file = `p${String(k++).padStart(3, '0')}.jpg`; fs.writeFileSync(path.join(DIR, file), ph.buf);
  meta.push({ file, key, q: ph.q, flip: ph.flip, glare: ph.glare, sleeve: ph.sleeve });
  // Empreinte de la photo : coins un peu faux (±2,5 % de la carte), comme un repérage automatique imparfait
  const dec = await sharp(ph.buf).raw().toBuffer({ resolveWithObject: true });
  const jit = ph.q.map(([x, y]) => [x + U(-0.025, 0.025) * 0.4, y + U(-0.025, 0.025) * 0.4 * 0.75]);
  const w = unwarp(dec.data, dec.info.width, dec.info.height, jit);
  const qs = [E.describe(w.px, w.W, w.H, 3, false), E.describe(w.px, w.W, w.H, 3, true)];
  rows.push({ i, key, qs, glare: ph.glare, sleeve: ph.sleeve, flip: ph.flip });
}
fs.writeFileSync(path.join(DIR, 'reponses.json'), JSON.stringify(meta, null, 1));

// Mesure, pour plusieurs poids des couleurs. « Même dessin » : la 1re proposée a l'empreinte officielle de la bonne carte à ≤ 14
const ref = i => Uint32Array.from(H.subarray(i * 6, i * 6 + 6));
for (const wc of [0, 0.5, 1]) {
  const D = (q, j) => { const p = E.parts(q, H, j); return p[0] + p[1] + wc * p[2]; };
  let top1 = 0, same = 0, top5 = 0, top10 = 0; const good = [], bad = [], gaps = [];
  for (const r of rows) {
    const best = []; for (let j = 0; j < n; j++) { const d = Math.min(D(r.qs[0], j), D(r.qs[1], j)); best.push([j, d]); }
    best.sort((a, b) => a[1] - b[1]);
    const rank = best.findIndex(x => x[0] === r.i), R0 = ref(best[0][0]);
    const sameArt = j => { const p = E.parts(R0, H, j); return p[0] + p[1] + 0.5 * p[2] <= 14; };
    const isSame = (() => { const p = E.parts(ref(r.i), H, best[0][0]); return p[0] + p[1] + 0.5 * p[2] <= 14; })();
    if (rank === 0) top1++; if (rank === 0 || isSame) same++; if (rank >= 0 && rank < 5) top5++; if (rank >= 0 && rank < 10) top10++;
    const other = best.find(x => !sameArt(x[0])); const gap = other ? other[1] - best[0][1] : 99;
    (rank === 0 || isSame ? good : bad).push([best[0][1], gap]);
  }
  const N = rows.length, pc = x => (100 * x / N).toFixed(1) + ' %';
  console.log(`\nPoids des couleurs ${wc} — ${N} photos : 1re = la bonne carte ${pc(top1)} ; même dessin ${pc(same)} ; dans les 5 premières ${pc(top5)} ; dans les 10 ${pc(top10)}`);
  // Seuils « sûre » : part des bonnes réponses gardées, et des erreurs qui passeraient
  for (const [mx, gp] of [[50, 10], [58, 14], [64, 14], [70, 16], [70, 12], [80, 18], [999, 20], [999, 25]]) {
    const ok = good.filter(([d, g]) => d <= mx && g >= gp).length, ko = bad.filter(([d, g]) => d <= mx && g >= gp).length;
    console.log(`  sûre si distance ≤ ${mx} et écart ≥ ${gp} : ${pc(ok)} sûres et justes, ${ko} sûres et fausses`);
  }
  const q = a => { const s = a.slice().sort((x, y) => x - y); return [0.1, 0.5, 0.9].map(p => s[Math.floor(p * (s.length - 1))] ?? '-').join(' / '); };
  console.log('  distance de la 1re (10 %, médiane, 90 %) : justes', q(good.map(x => x[0])), '; fausses', q(bad.map(x => x[0])));
  console.log('  écart avec un autre dessin : justes', q(good.map(x => x[1])), '; fausses', q(bad.map(x => x[1])));
}
const sub = f => { const s = rows.filter(f); return s.length; };
console.log('\nPhotos avec reflet :', sub(r => r.glare), ', pochette :', sub(r => r.sleeve), ', tête en bas :', sub(r => r.flip));
