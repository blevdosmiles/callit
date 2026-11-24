// Copie l'appli web (dossier parent) dans mobile/www, puis ajoute natif.js avant app.js.
// Aucun fichier de l'appli web n'est modifié : la même base de code sert le site et les applis.
import { cpSync, rmSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ici = dirname(fileURLToPath(import.meta.url));
const racine = join(ici, '..', '..');
const www = join(ici, '..', 'www');

const fichiers = ['index.html', 'app.js', 'styles.css', 'manifest.webmanifest'];
const dossiers = ['icons', 'data', 'historique', 'vendor'];

rmSync(www, { recursive: true, force: true });
mkdirSync(www, { recursive: true });
for (const f of fichiers) cpSync(join(racine, f), join(www, f));
for (const d of dossiers) if (existsSync(join(racine, d))) cpSync(join(racine, d), join(www, d), { recursive: true });
cpSync(join(ici, '..', 'natif', 'natif.js'), join(www, 'natif.js'));

const page = join(www, 'index.html');
let html = readFileSync(page, 'utf8');
if (!html.includes('<script src="app.js"></script>')) throw new Error('index.html : balise app.js introuvable');
html = html.replace('<script src="app.js"></script>', '<script src="natif.js"></script>\n<script src="app.js"></script>');
writeFileSync(page, html);
console.log('Appli web copiée dans mobile/www');
