// Copie l'appli web (dossier parent) dans mobile/www, puis ajoute natif.js et chargeur.js (code à jour depuis le site).
// Aucun fichier de l'appli web n'est modifié : la même base de code sert le site et les applis.
import { cpSync, rmSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ici = dirname(fileURLToPath(import.meta.url));
const racine = join(ici, '..', '..');
const www = join(ici, '..', 'www');

const fichiers = ['index.html', 'app.js', 'i18n.js', 'styles.css', 'manifest.webmanifest', 'version.json'];
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
const SITE = 'https://callitcards.com';

const page = join(www, 'index.html');
let html = readFileSync(page, 'utf8');
if (!html.includes('<script src="app.js"></script>')) throw new Error('index.html : balise app.js introuvable');
// Code à jour : les scripts de l'appli (hors vendor/) sont chargés par chargeur.js, depuis le site
// si possible, sinon depuis la copie ci-dessus. La liste de secours est écrite en tête de chargeur.js.
const scripts = [], styles = [];
for (const [, ref] of html.matchAll(/<link rel="stylesheet" href="(?!https?:)([^"?]+\.css)">/g)) styles.push(ref);
html = html.replace(/<script src="(?!https?:|vendor\/)([^"?]+\.js)"[^>]*><\/script>\n?/g, (_, ref) => { scripts.push(ref); return ''; });
if (!scripts.includes('app.js')) throw new Error('index.html : app.js introuvable');
html = html.replace('</body>', '<script src="natif.js"></script>\n<script src="chargeur.js"></script>\n</body>');
writeFileSync(join(www, 'chargeur.js'), 'window.CALLIT_LOCAL = ' + JSON.stringify({ scripts, styles }) + ';\n' + readFileSync(join(ici, '..', 'natif', 'chargeur.js'), 'utf8'));
// Autoriser le code du site dans la politique de sécurité de la page
const csp = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/);
if (!csp) throw new Error('index.html : politique de sécurité introuvable');
const nouvelle = csp[1].replace("script-src 'self'", "script-src 'self' " + SITE).replace("style-src 'self'", "style-src 'self' " + SITE)
  .replace(/connect-src 'self'/, m => csp[1].includes('connect-src') && !/connect-src[^;]*https:\/\/callitcards\.com/.test(csp[1]) ? m + ' ' + SITE : m);
if (!nouvelle.includes("script-src 'self' " + SITE)) throw new Error('CSP : script-src introuvable');
html = html.replace(csp[1], nouvelle);
// Sécurité : chaque fichier local appelé par index.html doit être dans l'appli
for (const [, ref] of html.matchAll(/(?:src|href)="(?!https?:|#|data:)([^"?]+)"/g))
  if (!existsSync(join(www, ref))) throw new Error('Fichier manquant dans l\'appli : ' + ref + ' (à ajouter dans copier-web.mjs)');
writeFileSync(page, html);
console.log('Appli web copiée dans mobile/www');
