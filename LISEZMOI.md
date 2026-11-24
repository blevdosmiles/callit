# CallIt! · appli web

Appli web (PWA) pour collectionneurs de cartes Pokémon, pensée pour l'Europe.
Aucune installation : ce sont des fichiers statiques, hébergés sur GitHub Pages.

## Ce qu'il y a dedans
- `index.html`, `styles.css`, `app.js` : l'appli (sans bibliothèque externe).
- `sw.js`, `manifest.webmanifest`, `icons/` : installation sur le téléphone et mode hors connexion.
- `data/cards.json` : 40 201 cartes (TCGdex + guide de prix public Cardmarket).
- `data/rates.json` : taux de change, mis à jour chaque jour ouvré par `.github/workflows/taux.yml` (taux BCE).
- `outils/` : scripts pour régénérer les données et les icônes.

## Mettre à jour la base de cartes
    python3 outils/preparer_donnees.py chemin/vers/donnees/cards.json data/cards.json

## Mettre en ligne (une seule fois)
Sur GitHub : dépôt `callit` → Settings → Pages → « Deploy from a branch » → `main` / `(root)`.
L'adresse sera `https://blevdosmiles.github.io/callit/`. Chaque envoi sur `main` met l'appli à jour.

Code « tous droits réservés » : pas de licence libre dans ce dépôt.

## Essayer sur son ordinateur
    python3 -m http.server 8000   puis ouvrir http://localhost:8000

CallIt! n'est pas affilié à Nintendo, The Pokémon Company ni Cardmarket.
