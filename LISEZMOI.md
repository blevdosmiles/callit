# CallIt! · appli web

Appli web (PWA) pour collectionneurs de cartes Pokémon, pensée pour l'Europe.
Aucune installation : ce sont des fichiers statiques, hébergés sur GitHub Pages.

## Ce qu'il y a dedans
- `index.html`, `styles.css`, `app.js` : l'appli (sans bibliothèque externe).
- `sw.js`, `manifest.webmanifest`, `icons/` : installation sur le téléphone et mode hors connexion.
- `data/cards.json` : 40 201 cartes (TCGdex + guide de prix public Cardmarket). Ses prix datent du jour où la base a été faite.
- `data/prix.json`, `data/prix_plus.json` : les prix du jour, lus par l'appli par-dessus ceux de la base (voir « Relevé quotidien des prix »).
- `historique/` : la cote de chaque carte, jour après jour (voir « Cote CallIt! »).
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

## Cote CallIt!
Pour Pokémon, l'appli n'affiche pas la « tendance » de Cardmarket telle quelle. Elle calcule une cote à partir des
mesures du guide : la plus basse des moyennes de vente sur 7 et 30 jours, jamais sous l'offre la moins chère.
Sans vente récente, elle prend la tendance (sauf 0,02 €, que Cardmarket affiche quand il n'en calcule pas), sinon
l'offre la moins chère. Chaque cote a une confiance (faible, moyenne, bonne) et une fourchette ; elle s'affiche arrondie.

La règle est écrite deux fois, à l'identique : `cote_mesures()` dans `outils/releve_prix.py` (historique) et
`coteDe()` dans `app.js`, entre les marques `<cote>` et `</cote>` (prix affichés). Après toute retouche :

    python3 outils/test_cote.py                                   les deux donnent-ils les mêmes cotes ?
    python3 outils/test_cote.py --mesure AVANT.json.gz APRES.json.gz   erreur et fourchette, entre deux archives

La première vérification tourne toute seule sur chaque pull request qui touche à la règle (`.github/workflows/tests.yml`).
Les seuils ont été réglés le 25/11/2026 sur deux jours d'archives : à remesurer quand il y en aura un mois.
Quand la règle change, augmenter `REGLE` dans `outils/releve_prix.py` : au passage suivant, l'historique est refait
tout seul à partir des archives (ou à la demande : Run workflow → cocher « Refaire »).

## Liens avec Cardmarket
Chaque carte de la base pointe vers un produit Cardmarket (`cm`) : c'est de lui que viennent ses prix. Ces liens
viennent de TCGdex, qui se trompe parfois : deux cartes sur le même produit, ou une carte sur le produit d'une autre
version (carte géante, version brillante, carte du même nom dans la série).

`outils/liens_cardmarket.py` les vérifie avec la liste publique des produits de Cardmarket (nom, attaques, ordre et
jour d'ajout des produits) et corrige `data/cards.json`. Il ne touche qu'aux cartes dont le lien change, et retire un
lien plutôt que de laisser un prix faux. Les fichiers dont il a besoin sont rangés dans les « releases » du dépôt :
`catalogue` (refaite chaque lundi par `.github/workflows/sources.yml`) et `prix-AAAA-MM` (archive du jour).

    python3 outils/liens_cardmarket.py tcgdex-extrait.json.gz catalogue-cardmarket.json.gz \
        --prix releve-AAAA-MM-JJ.json.gz --rapport rapport.json            bilan seulement, rien n'est écrit
    ... --ecrire                                                           enregistre data/cards.json

Le rapport donne chaque lien changé avec sa raison, les cartes restées sans lien, et les liens « à vérifier » (deux
produits du même nom à des prix très différents). Quand rien ne départage deux cartes, l'outil ne tranche pas : elles
restent sans lien, donc sans prix. Ces cas se règlent à la main dans `outils/liens_manuels.json`.
Après une écriture, relancer dans l'onglet Actions « Cartes Cardmarket absentes de la base », puis « Relevé quotidien
des prix » en cochant « Refaire » : les prix du jour et l'historique suivent les nouveaux liens.

Corrigé le 25/11/2026 : 737 produits servaient à plusieurs cartes occidentales (1 511 cartes), plus aucun depuis ;
1 846 liens changés (1 063 remplacés, 779 ajoutés, 4 retirés). Mesure du même jour : sur 2 367 liens justes abîmés
exprès (doublés, effacés ou échangés entre cartes du même nom), l'outil en a retrouvé 2 334, en a laissé 31 sans
réponse et s'est trompé sur 2. Relancé sur la base corrigée, il ne change plus rien.
Les cartes asiatiques ne sont pas traitées (leurs produits portent d'autres noms) : 2 produits y servent encore à
deux cartes, et l'appli y affiche « Prix à confirmer ».

## Mettre à jour la base de cartes
    python3 outils/preparer_donnees.py chemin/vers/donnees/cards.json data/cards.json
Puis vérifier les liens (ci-dessus) : une base refaite reprend les liens de TCGdex.

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
