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

## Référencement (Google, Bing…)
L'appli est une page unique : ses adresses `#/…` ne sont pas lues par les moteurs de recherche.
`outils/pages_seo.py` fabrique donc, à partir de `data/cards.json`, des pages HTML légères en 5 langues
(`fr/`, `en/`, `de/`, `es/`, `it/`) : une par carte (nom officiel dans la langue), par set, par Pokémon et par illustrateur,
avec titres, descriptions, liens entre langues (hreflang) et `sitemap.xml`. Elles renvoient vers l'appli pour la cote du jour.
Le workflow `.github/workflows/pages_seo.yml` les refait chaque lundi ; seules les pages modifiées changent.
Les prix n'y sont pas, pour que le dépôt ne grossisse pas chaque jour. Taille : environ 370 Mo (limite GitHub Pages : 1 Go pour tout le site).
