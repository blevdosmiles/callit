// Copie l'appli web (dossier parent) dans mobile/www, puis ajoute natif.js avant app.js.
// Aucun fichier de l'appli web n'est modifié : la même base de code sert le site et les applis.
import { cpSync, rmSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ici = dirname(fileURLToPath(import.meta.url));
const racine = join(ici, '..', '..');
const www = join(ici, '..', 'www');

const fichiers = ['index.html', 'app.js', 'i18n.js', 'styles.css', 'manifest.webmanifest'];
const dossiers = ['icons', 'data', 'historique', 'vendor', 'i18n']; // img/ (images des autres jeux, > 200 Mo) reste en ligne : voir natif.js

rmSync(www, { recursive: true, force: true });
mkdirSync(www, { recursive: true });
// Plus tous les fichiers locaux appelés par index.html (live.js, live.css…), pour suivre l'appli web sans retouche
const source = readFileSync(join(racine, 'index.html'), 'utf8');
for (const [, ref] of source.matchAll(/(?:src|href)="(?!https?:|#|data:)([^"?]+)"/g))
  if (!fichiers.includes(ref) && existsSync(join(racine, ref))) fichiers.push(ref);
for (const f of fichiers) { mkdirSync(dirname(join(www, f)), { recursive: true }); cpSync(join(racine, f), join(www, f)); }
for (const d of dossiers) if (existsSync(join(racine, d))) cpSync(join(racine, d), join(www, d), { recursive: true });
cpSync(join(ici, '..', 'natif', 'natif.js'), join(www, 'natif.js'));

const page = join(www, 'index.html');
let html = readFileSync(page, 'utf8');
if (!html.includes('<script src="app.js"></script>')) throw new Error('index.html : balise app.js introuvable');
html = html.replace('<script src="app.js"></script>', '<script src="natif.js"></script>\n<script src="app.js"></script>');
// Sécurité : chaque fichier local appelé par index.html doit être dans l'appli
for (const [, ref] of html.matchAll(/(?:src|href)="(?!https?:|#|data:)([^"?]+)"/g))
  if (!existsSync(join(www, ref))) throw new Error('Fichier manquant dans l\'appli : ' + ref + ' (à ajouter dans copier-web.mjs)');
writeFileSync(page, html);
console.log('Appli web copiée dans mobile/www');
