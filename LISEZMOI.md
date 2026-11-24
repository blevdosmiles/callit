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

## Mettre en ligne (dépôt privé)
Hébergement : Cloudflare Pages (gratuit, accepte un dépôt GitHub privé).
1. Cloudflare → Workers & Pages → Create → Pages → « Connect to Git » → dépôt `callit`.
2. Réglages de build : aucun framework, commande de build vide, dossier de sortie `/`.
3. Pour que l'appli ne soit visible que par toi : Cloudflare Zero Trust → Access → protéger l'adresse `*.pages.dev` avec ton e-mail (gratuit jusqu'à 50 personnes).
Chaque envoi sur `main` remet l'appli à jour toute seule.

## Essayer sur son ordinateur
    python3 -m http.server 8000   puis ouvrir http://localhost:8000

CallIt! n'est pas affilié à Nintendo, The Pokémon Company ni Cardmarket.
