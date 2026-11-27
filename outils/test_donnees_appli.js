// Vérifie que l'appli refait exactement les cartes d'origine à partir des bases au format de l'appli (data/appli/).
// Le code testé est celui d'app.js lui-même (entre /* <colonnes> et </colonnes> */) : lireBase() et lireImages().
// Usage (depuis la racine du dépôt) : python3 outils/donnees_appli.py && node outils/test_donnees_appli.js
'use strict';
const fs = require('fs');
const path = require('path');

const racine = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(racine, 'app.js'), 'utf8');
const m = app.match(/\/\* <colonnes>[\s\S]*?\/\* <\/colonnes> \*\//);
if (!m) { console.error('app.js : bloc <colonnes> introuvable'); process.exit(1); }
const { lireBase, lireImages } = new Function(m[0] + '\nreturn { lireBase, lireImages };')();

const SOURCES = { pkm: 'data/cards.json', mtg: 'data/jeux/mtg.json', ygo: 'data/jeux/ygo.json', op: 'data/jeux/op.json' };
const lire = f => JSON.parse(fs.readFileSync(path.join(racine, f), 'utf8'));
let erreurs = 0;
const faute = msg => { erreurs++; if (erreurs <= 20) console.log('  ERREUR', msg); };

for (const [jeu, source] of Object.entries(SOURCES)) {
  const fichier = 'data/appli/' + jeu + '.json';
  if (!fs.existsSync(path.join(racine, fichier))) { faute(fichier + ' absent (lancer python3 outils/donnees_appli.py)'); continue; }
  const orig = lire(source);
  const t0 = process.hrtime.bigint();
  const db = lireBase(lire(fichier));
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  // En-tête : tout sauf les cartes, à l'identique (le nom du fichier des images en plus)
  for (const k of Object.keys(orig)) if (k !== 'cards' && JSON.stringify(orig[k]) !== JSON.stringify(db[k])) faute(jeu + ' : en-tête « ' + k + ' » différent');
  for (const k of Object.keys(db)) if (!(k in orig) && k !== 'images' && k !== 'imAttente') faute(jeu + ' : en-tête « ' + k + ' » en trop');
  if (db.cards.length !== orig.cards.length) { faute(jeu + ' : ' + db.cards.length + ' cartes au lieu de ' + orig.cards.length); continue; }
  let images = '';
  if (db.images) {
    if (!Array.isArray(db.images) || !db.images.length) faute(jeu + ' : liste des fichiers d’images illisible');
    else {
      if (!db.imAttente) faute(jeu + ' : images à part mais imAttente absent');
      for (let k = 0; k < orig.cards.length; k++) if (('im' in orig.cards[k]) !== (db.cards[k].im === 1)) { faute(jeu + ' : carte ' + k + ' : image annoncée à tort'); break; }
      const tailles = [];
      for (const f of db.images) {
        if (!fs.existsSync(path.join(racine, f))) { faute(jeu + ' : ' + f + ' absent'); continue; }
        const j = lire(f);
        // Les images d'une autre version de la base sont toujours refusées
        const autre = lireBase(lire(fichier)); autre.generated = 'autre';
        if (lireImages(autre, j)) faute(jeu + ' : images acceptées pour une autre base (' + f + ')');
        // Chaque partie seule ne remplit que ses cartes, sans toucher aux autres
        const seule = lireBase(lire(fichier));
        if (!lireImages(seule, j)) faute(jeu + ' : images refusées (' + f + ')');
        let n = 0; for (let k = 0; k < seule.cards.length; k++) { const im = seule.cards[k].im; if (im !== undefined && im !== 1) { n++; if (im !== orig.cards[k].im) { faute(jeu + ' : ' + f + ' : carte ' + k + ' : mauvaise image'); break; } } }
        if (n !== j.v.length) faute(jeu + ' : ' + f + ' : ' + n + ' cartes remplies au lieu de ' + j.v.length);
        if (!lireImages(db, j)) faute(jeu + ' : images refusées (' + f + ')');
        tailles.push(path.basename(f) + ' ' + j.v.length + ' cartes');
      }
      const reste = db.cards.filter(c => c.im === 1).length;
      if (reste) faute(jeu + ' : ' + reste + ' cartes encore sans image après tous les fichiers');
      images = ', images ' + tailles.join(' + ');
    }
  }
  delete db.imAttente;
  let diff = 0;
  for (let k = 0; k < orig.cards.length; k++) {
    if (JSON.stringify(orig.cards[k]) !== JSON.stringify(db.cards[k])) {
      if (++diff <= 3) faute(jeu + ' : carte ' + k + '\n      origine ' + JSON.stringify(orig.cards[k]).slice(0, 220) + '\n      appli   ' + JSON.stringify(db.cards[k]).slice(0, 220));
    }
  }
  if (diff > 3) faute(jeu + ' : ' + diff + ' cartes différentes en tout');
  console.log(jeu.padEnd(4), String(orig.cards.length).padStart(7), 'cartes', diff ? diff + ' différentes' : 'identiques', '(lecture ' + Math.round(ms) + ' ms' + images + ')');
}
// Un fichier d'origine passe tel quel
const o = { format: 1, cards: [] };
if (lireBase(o) !== o) faute('un fichier d’origine ne passe pas tel quel');
console.log(erreurs ? erreurs + ' erreur(s)' : 'Tout est identique.');
process.exit(erreurs ? 1 : 0);
