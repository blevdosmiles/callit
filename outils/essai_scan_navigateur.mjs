// CallIt! · Essai du scan photo de l'appli, de bout en bout, dans un vrai navigateur (Playwright, Chromium).
// Chaque photo du dossier passe par runScan() (app.js), exactement comme un fichier choisi par l'utilisateur :
// - « avant » : lecture du texte seule (empreinte coupée : localStorage scanEmpreinte = non) ;
// - « après » : lecture du texte + reconnaissance par le dessin (empreinte.js).
// Le dossier contient reponses.json : [{ file, key }] (clé de la bonne carte, ex. « en:base1:4 »).
// Une réponse compte juste si la 1re carte proposée est la bonne, ou une réimpression au même dessin
// (même empreinte officielle à ≤ 14 près, ex. la même carte dans une autre langue) : la cote de la fiche est alors à vérifier.
// Usage : node outils/essai_scan_navigateur.mjs --dossier essai-photos --site http://localhost:8000/ [--max 120] [--modes avant,apres]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const E = require('../empreinte.js');
const { chromium } = require('playwright');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const DIR = arg('--dossier', 'essai-photos'), SITE = arg('--site', 'http://localhost:8000/'), MAX = +arg('--max', 120);
const MODES = arg('--modes', 'avant,apres').split(','), OUT = arg('--sortie', '');
const rep = JSON.parse(fs.readFileSync(path.join(DIR, 'reponses.json'), 'utf8')).slice(0, MAX);
let IDX = null; try { IDX = JSON.parse(fs.readFileSync(arg('--index', 'data/empreintes.json'), 'utf8')); } catch (e) {}
const H = IDX ? E.decode(IDX.h) : null, pos = IDX ? new Map(IDX.k.map((k, i) => [k, i])) : new Map();
const sameArt = (a, b) => { if (a === b) return true; const i = pos.get(a), j = pos.get(b); if (i == null || j == null) return false; return E.dist(Uint32Array.from(H.subarray(i * 6, i * 6 + 6)), H, j) <= 14; };

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const all = {};
for (const mode of MODES) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('  erreur de la page :', e.message));
  await page.addInitScript(m => { try { localStorage.setItem('scanEmpreinte', m === 'avant' ? 'non' : 'oui'); localStorage.setItem('onboarded', '1'); } catch (e) {} }, mode);
  await page.goto(SITE + '#/recherche', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof CARDS !== 'undefined' && CARDS.length > 1000, null, { timeout: 120000 });
  const rows = []; const t0 = Date.now();
  for (const r of rep) {
    const b64 = fs.readFileSync(path.join(DIR, r.file)).toString('base64');
    const t = Date.now();
    const out = await page.evaluate(async ({ b64, name }) => {
      const bin = atob(b64), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const file = new File([u8], name, { type: /\.png$/i.test(name) ? 'image/png' : 'image/jpeg' });
      const p = runScan(file);
      await p;
      const s = scanState || {};
      // Ce que le dessin seul a vu (pour comprendre les ratés) : cadrage, distance de la 1re, écart, rang de la bonne carte
      let im = null; try { if (window.CallItEmpreinte && CallItEmpreinte.on()) { const r = await CallItEmpreinte.match(file); im = r ? { how: r.how, best: r.best, gap: r.gap, sure: r.sure, keys: r.list.slice(0, 40).map(x => x.c.key) } : { how: 'aucune carte vue' }; } } catch (e) { im = { how: 'erreur ' + e.message }; }
      return { status: s.status, keys: (s.results || []).slice(0, 10).map(c => c.key), sure: !!s.sure, via: s.via || '', text: (s.text || '').slice(0, 120), im };
    }, { b64, name: r.file });
    out.ms = Date.now() - t; out.file = r.file; out.key = r.key;
    out.ok1 = !!out.keys[0] && (out.keys[0] === r.key || sameArt(out.keys[0], r.key));
    out.exact = out.keys[0] === r.key;
    out.in5 = out.keys.slice(0, 5).some(k => k === r.key || sameArt(k, r.key));
    rows.push(out);
    const im = out.im, dbg = im ? ` [dessin : ${im.how}${im.best != null ? `, distance ${im.best}, écart ${im.gap}, bonne carte au rang ${im.keys.findIndex(k => k === r.key || sameArt(k, r.key)) + 1 || '>40'}` : ''}]` : '';
    console.log(`${mode} ${r.file} ${r.key} → ${out.keys[0] || '(rien)'}${out.sure ? ' (sûre)' : ''} ${out.ok1 ? 'JUSTE' : out.in5 ? 'dans les 5' : 'raté'} ${(out.ms / 1000).toFixed(1)} s${out.ok1 && out.sure ? '' : dbg}`);
  }
  const N = rows.length, pc = x => `${x}/${N} (${Math.round(100 * x / N)} %)`;
  const sum = {
    photos: N,
    juste_et_sure: rows.filter(r => r.ok1 && r.sure).length,
    juste_en_premier: rows.filter(r => r.ok1).length,
    exacte_en_premier: rows.filter(r => r.exact).length,
    dans_les_5: rows.filter(r => r.in5).length,
    sure_mais_fausse: rows.filter(r => r.sure && !r.ok1).length,
    rien: rows.filter(r => !r.keys.length).length,
    secondes_par_photo: +((Date.now() - t0) / 1000 / N).toFixed(1),
  };
  all[mode] = { sum, rows };
  console.log(`\n=== ${mode.toUpperCase()} : ${N} photos ===`);
  console.log(`  reconnue et sûre (ajout direct)   ${pc(sum.juste_et_sure)}`);
  console.log(`  bonne carte en 1re proposition    ${pc(sum.juste_en_premier)}  (exactement la même fiche : ${pc(sum.exacte_en_premier)})`);
  console.log(`  bonne carte dans les 5 premières  ${pc(sum.dans_les_5)}`);
  console.log(`  « sûre » mais fausse              ${pc(sum.sure_mais_fausse)}`);
  console.log(`  rien trouvé                       ${pc(sum.rien)}`);
  console.log(`  temps moyen                       ${sum.secondes_par_photo} s par photo\n`);
  await ctx.close();
}
await browser.close();
if (OUT) fs.writeFileSync(OUT, JSON.stringify(all, null, 1));
