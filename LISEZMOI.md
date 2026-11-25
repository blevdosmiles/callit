# CallIt! · appli web

Appli web (PWA) pour collectionneurs de cartes Pokémon, pensée pour l'Europe.
Aucune installation : ce sont des fichiers statiques, hébergés sur GitHub Pages.

## Ce qu'il y a dedans
- `index.html`, `styles.css`, `app.js` : l'appli (sans bibliothèque externe).
- `sw.js`, `manifest.webmanifest`, `icons/` : installation sur le téléphone et mode hors connexion.
- `data/cards.json` : 40 201 cartes (TCGdex + guide de prix public Cardmarket). Ses prix datent du jour où la base a été faite.
- `data/prix.json`, `data/prix_plus.json` : les prix du jour, lus par l'appli par-dessus ceux de la base (voir « Relevé quotidien des prix »).
- `historique/` : la cote de chaque carte, jour après jour.
- `data/rates.json` : taux de change, mis à jour chaque jour ouvré par `.github/workflows/taux.yml` (taux BCE).
- `outils/` : scripts pour régénérer les données et les icônes.

## Relevé quotidien des prix
`.github/workflows/prix.yml` passe trois fois par jour (6 h 20, 10 h 20 et 16 h 20 UTC). Il télécharge le guide de prix
public de Cardmarket et lance `outils/releve_prix.py`, qui :
- vérifie le guide (complet, daté, cohérent avec la veille) et n'écrit rien s'il a un doute ;
- écrit `data/prix.json` (cartes de la base) et `data/prix_plus.json` (cartes hors base, produits scellés) ;
- ajoute la cote du jour dans `historique/NN.json` (NN = numéro Cardmarket modulo 100).

L'archive complète du jour (tous les produits, toutes les mesures) est rangée hors du site, dans les « releases »
du dépôt : `prix-AAAA-MM`, un fichier `releve-AAAA-MM-JJ.json.gz` par jour. Elle permet de refaire l'historique.

Un passage sans nouveauté ne change rien. Si un passage échoue, un ticket « Relevé des prix en échec » s'ouvre
dans le dépôt et se ferme tout seul au relevé réussi suivant. Pour un essai sans rien enregistrer :
onglet Actions → « Relevé quotidien des prix » → Run workflow → cocher « Essai ».

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
