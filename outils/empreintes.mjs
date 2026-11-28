// CallIt! · Index des empreintes d'images des cartes Pokémon (data/empreintes.json), pour le scan gratuit (empreinte.js).
// Pour chaque carte qui a une image, on lit l'image officielle en petit (TCGdex « low », 245 px de large ; sinon pokemontcg.io,
// sinon l'image d'un autre set relevée dans data/images.json) et on calcule son empreinte avec empreinte.js, le même code que l'appli.
// Les empreintes déjà calculées sont gardées dans un cache (adresse de l'image → empreinte) : chaque semaine, seules les images
// nouvelles sont lues.
// Usage : node outils/empreintes.mjs [--cache dossier] [--limite N] [--sortie data/empreintes.json]
// Il faut sharp (npm install sharp) pour lire les images.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const E = require('../empreinte.js');
const sharp = (await import('sharp')).default;

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const CACHE_DIR = arg('--cache', 'cache-empreintes'), LIMIT = +arg('--limite', 0) || Infinity, OUT = arg('--sortie', 'data/empreintes.json');
const db = JSON.parse(fs.readFileSync('data/cards.json', 'utf8'));
const IM = JSON.parse(fs.readFileSync('data/images.json', 'utf8'));
const okMask = IM.cards === db.generated;
if (!okMask) console.log('Attention : data/images.json ne correspond pas à data/cards.json, toutes les langues sont essayées.');

// Même choix d'image que l'appli (imgOrder dans app.js), dans la langue de référence de la région (anglais, japonais)
const B36 = '0123456789abcdefghijklmnopqrstuvwxyz';
const mask = i => okMask ? B36.indexOf(IM.mask[i * 2]) * 36 + B36.indexOf(IM.mask[i * 2 + 1]) : null;
const BASE = { en: ['en', 'fr', 'es', 'it', 'pt', 'de'], ja: ['ja', 'zh-tw', 'th', 'id', 'ko', 'zh-cn'] };
const base = c => db.imageBase.replace('{serie}', encodeURIComponent(c.set.serie)).replace('{set}', encodeURIComponent(c.set.id)).replace('{num}', encodeURIComponent(c.num)).replace('high.webp', 'low.webp');
function urls(i, depth = 0) {
  const c = db.cards[i], m = mask(i), L = BASE[c.set.reg] || BASE.en;
  const ok = m == null ? L.slice(0, 2) : L.filter((l, k) => m & (1 << k));
  const out = ok.map(l => base(c).replace('{lang}', l));
  if (okMask && IM.ptcg[i]) out.push('https://images.pokemontcg.io/' + IM.ptcg[i] + '.png');
  if (!out.length && okMask && IM.alt[i] != null && !depth) out.push(...urls(IM.alt[i], 1));
  return out;
}
db.cards.forEach(c => { c.set = db.sets[c.s]; });

fs.mkdirSync(CACHE_DIR, { recursive: true });
const CF = path.join(CACHE_DIR, 'empreintes.json');
const cache = fs.existsSync(CF) ? JSON.parse(fs.readFileSync(CF, 'utf8')) : {};
const ver = 'v1'; // à changer si empreinte.js change de calcul : tout le cache est refait

async function hashOf(url) {
  const k = ver + ' ' + url;
  if (cache[k] !== undefined) return cache[k];
  for (let t = 0; t < 3; t++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (r.status === 404) { cache[k] = null; return null; }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const buf = Buffer.from(await r.arrayBuffer());
      const { data, info } = await sharp(buf).flatten({ background: '#808080' }).resize({ width: 240 }).raw().toBuffer({ resolveWithObject: true });
      const h = E.describe(data, info.width, info.height, info.channels, false);
      cache[k] = Array.from(h, x => x.toString(16).padStart(8, '0')).join('');
      return cache[k];
    } catch (e) { if (t === 2) { console.log('échec', url, e.message); return undefined; } await new Promise(s => setTimeout(s, 2000 * (t + 1))); }
  }
}

const todo = []; for (let i = 0; i < db.cards.length && todo.length < LIMIT; i++) { const u = urls(i); if (u.length) todo.push([i, u]); }
console.log(todo.length, 'cartes avec une image sur', db.cards.length);
const res = new Map(); let done = 0, fails = 0; const t0 = Date.now();
let next = 0;
async function worker() {
  while (next < todo.length) {
    const [i, u] = todo[next++];
    let h = null; for (const url of u) { h = await hashOf(url); if (h) break; if (h === undefined) fails++; }
    if (h) res.set(i, h);
    if (++done % 1000 === 0) { console.log(done, '/', todo.length, Math.round((Date.now() - t0) / 1000) + ' s'); fs.writeFileSync(CF, JSON.stringify(cache)); }
  }
}
await Promise.all(Array.from({ length: 24 }, worker));
fs.writeFileSync(CF, JSON.stringify(cache));

const ids = [...res.keys()].sort((a, b) => a - b);
const words = new Uint32Array(ids.length * 6);
ids.forEach((i, n) => { const h = res.get(i); for (let w = 0; w < 6; w++) words[n * 6 + w] = parseInt(h.slice(w * 8, w * 8 + 8), 16); });
const keys = ids.map(i => { const c = db.cards[i]; return c.set.reg + ':' + c.set.id + ':' + c.num; });
fs.writeFileSync(OUT, JSON.stringify({ v: 1, cards: db.generated, n: ids.length, k: keys, h: E.encode(words) }));
console.log('Index :', ids.length, 'cartes,', (fs.statSync(OUT).size / 1e6).toFixed(2), 'Mo ; images en échec :', fails);
if (ids.length < todo.length * 0.9 && LIMIT === Infinity) { console.log('ERREUR : trop d’images manquantes'); process.exit(1); }
