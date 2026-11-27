# CallIt! · appli web

Appli web (PWA) pour collectionneurs de cartes Pokémon, pensée pour l'Europe.
Aucune installation : ce sont des fichiers statiques, hébergés sur Cloudflare (Worker + R2, voir `wrangler.jsonc`).

## Ce qu'il y a dedans
- `index.html`, `styles.css`, `app.js` : l'appli (sans bibliothèque externe).
- `sw.js`, `manifest.webmanifest`, `icons/` : installation sur le téléphone et mode hors connexion.
- `demarrage.js` : premier script de la page ; lance tout de suite le téléchargement des cartes, met le thème et remet
  l'accueil de la dernière visite le temps que les cartes soient prêtes (voir « Ouverture rapide »).
- `polices/` : les polices Fraunces et Geist (licence SIL OFL), servies par le site lui-même (`outils/polices.py`).
- `data/cards.json` : 40 201 cartes (TCGdex + guide de prix public Cardmarket). Ses prix datent du jour où la base a été faite.
- `data/prix.json`, `data/prix_plus.json` : les prix du jour, lus par l'appli par-dessus ceux de la base (voir « Relevé quotidien des prix »).
- `historique/` : la cote de chaque carte, jour après jour (voir « Cote CallIt! »).
- `data/rates.json` : taux de change, mis à jour chaque jour ouvré par `.github/workflows/taux.yml` (taux BCE).
- `outils/` : scripts pour régénérer les données et les icônes.

## Ouverture rapide
L'appli s'ouvre depuis la copie gardée sur l'appareil, sans attendre le réseau :
- `sw.js` garde une copie complète du code (tout ce que charge `index.html`, la liste est lue dans ce fichier : rien à
  ajouter à la main). À chaque mise en ligne, `.github/workflows/version.yml` écrit le numéro de version dans `sw.js` et
  `demarrage.js` : le navigateur installe la nouvelle copie en arrière-plan, puis le bandeau « Nouvelle version de
  CallIt! disponible » propose de recharger (`maj.js`). Sans clic, la nouvelle version sert à l'ouverture suivante.
- Cartes, prix du jour et taux (`data/cards.json`, `data/prix.json`, `data/rates.json`, `data/jeux/*.json`) : la copie
  gardée sert tout de suite, la dernière version est relue en arrière-plan (sans rien télécharger si rien n'a changé).
  Si les prix ou les taux ont changé, l'appli les applique sans recharger. Les autres données passent par le réseau d'abord.
- Le texte de recherche des cartes (`hay`) est préparé après le premier affichage, par petits morceaux (`ensureHay()`
  dans `app.js` le finit si une recherche arrive avant).
- L'accueil affiché est gardé sur l'appareil (`callit.v1.apercu`) ; à l'ouverture suivante, `demarrage.js` le remet
  aussitôt, puis `app.js` le remplace par le vrai dès que les cartes sont prêtes.
- Mesures et essais : voir la PR « Ouverture rapide » (téléphone simulé, 4G et 4G lente).

## Couleurs : la règle 60-30-10
Sur chaque écran, à peu près (les images des cartes ne comptent pas) :
- **60 % de fond neutre** : gris clair (Galerie), blanc (Marché), gris très foncé en mode sombre.
- **30 % de blocs et de texte** : cartes blanches, panneaux, barres, texte foncé, filtres choisis en noir.
- **10 % au plus de vert CallIt!** (`--gain`), réservé aux accents : la cote et les gains, le bouton principal
  de l'écran, les liens « tout voir », les petits titres (`.eyebrow`), l'onglet actif, les logos des réseaux.

En pratique :
- Un seul bouton vert plein par écran ou par bloc (`.btn.primary`). Les autres boutons restent à contour.
- Les confirmations « Supprimer », « Retirer », « Tout effacer » restent en noir (`.btn.primary.ink`), jamais en vert.
- Le rouge ne sert qu'aux pertes et au point « Live ». Pas d'autre couleur vive dans l'interface.
- Boutons de taille normale, jamais étirés sur toute la largeur ; angles arrondis partout.

Pour vérifier un écran : faire une capture, puis `python3 outils/mesure_couleurs.py capture.png`.
Le vert doit rester sous 10 % ; entre 1 et 5 %, il se voit sans prendre toute la place.

## Relevé quotidien des prix
`.github/workflows/prix.yml` passe trois fois par jour (6 h 20, 10 h 20 et 16 h 20 UTC). Il télécharge le guide de prix
public de Cardmarket et lance `outils/releve_prix.py`, qui :
- vérifie le guide (complet, daté, cohérent avec la veille) et n'écrit rien s'il a un doute ;
- écrit `data/prix.json` (cartes de la base) et `data/prix_plus.json` (cartes hors base, produits scellés) ;
- ajoute la cote du jour dans `historique/NN.json` (NN = numéro Cardmarket modulo 100).

L'archive complète du jour (tous les produits, toutes les mesures) est rangée hors du site, dans les « releases »
du dépôt : `prix-AAAA-MM`, un fichier `releve-AAAA-MM-JJ.json.gz` par jour. Elle permet de refaire l'historique.

Un passage sans nouveauté ne change rien. Si un passage échoue, un ticket « Relevé des prix en échec » s'ouvre
dans le dépôt et se ferme tout seul au relevé réussi suivant. Le ticket s'ouvre aussi quand Cardmarket ne publie plus
de guide depuis 2 jours, ou quand ses moyennes de vente n'ont pas bougé depuis 2 jours : un guide neuf peut ne
renouveler que les offres (celui du 26/11/2026 avait les moyennes de vente de la veille). `data/prix.json` note dans
`ventes` le jour du dernier guide où elles ont bougé. Pour un essai sans rien enregistrer :
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
Le 26/11/2026, 18 liens de plus ajoutés à la main : des cartes que Cardmarket nomme autrement (« Unit Energy [GRW] »,
« Fairy Charm [F] », « Rainbow Energy Delta », « Nidoran &female; ») et les n° 38 et 39 de la Collection McDonald's 2018.
Chacune est à sa place entre les produits des cartes voisines. Il reste 27 cartes occidentales sans lien.

## Illustrateurs et cartes mal renseignées
TCGdex écrit parfois le même illustrateur de plusieurs façons (« takuyoa » et « Takuyoa »), avec une faute
(« Rya Ueda »), ou met autre chose qu'un nom (« N/A »). Chaque écriture donnait sa propre fiche d'artiste dans
l'appli, et sa propre page pour les moteurs de recherche. Quelques cartes portent aussi le nom ou l'illustrateur
d'une autre.

    python3 outils/corriger_base.py            bilan seulement, rien n'est écrit
    python3 outils/corriger_base.py --ecrire   enregistre data/cards.json

L'outil réunit tout seul les écritures qui ne diffèrent que par les majuscules, les espaces ou les signes, sous
celle que portent le plus de cartes. Les fautes, les valeurs qui ne sont pas des noms et les cartes à corriger sont
dans `outils/corrections.json`, chacune avec sa preuve : n'y ajouter que ce qui a été vérifié sur une source
publique (une autre impression de la même carte dans la base, Bulbapedia, Poképédia, Serebii). Une correction de
carte ne s'applique que si la carte porte encore la valeur fausse notée ; sinon l'outil la signale « à revoir ».
Les cas non tranchés y sont notés aussi (« non_tranches »).

Corrigé le 26/11/2026 : 33 cartes, 426 noms ramenés à 410. La carte n° 38 de la Collection McDonald's 2018
s'appelait « Passerouge » comme la n° 39 : c'est Ponchiot.
Il reste 3 164 cartes sans illustrateur (2 444 asiatiques, surtout des séries de 1999 à 2006 ; 720 occidentales,
dont les énergies, qui n'en ont pas, et 133 promos Épée et Bouclier) : TCGdex ne le donne pas.

## Mettre à jour la base de cartes
    python3 outils/preparer_donnees.py chemin/vers/donnees/cards.json data/cards.json
Il applique les corrections ci-dessus. Puis vérifier les liens : une base refaite reprend les liens de TCGdex.

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
Deux écritures d'un illustrateur qui donnent la même adresse sont réunies sur une seule page.
Le workflow `.github/workflows/pages_seo.yml` les refait chaque lundi ; seules les pages modifiées changent.
Les prix n'y sont pas, pour que le dépôt ne grossisse pas chaque jour. Taille : environ 370 Mo (limite GitHub Pages : 1 Go pour tout le site).

## Revenus : préférés, soin des cartes, assurance (`revenus.js`)
- **Tes préférés** (`#/preferes`, bloc « Pour toi » sur l'accueil) : Pokémon, couleurs et commandants (Magic),
  archétypes (Yu-Gi-Oh!), personnages (One Piece). Leurs cartes, puis leurs enchères eBay qui finissent bientôt
  (lien partenaire). Gardés sur l'appareil (`callit.v1.favs`), jamais vendus.
- **Prendre soin de tes cartes** (`#/soin`, bouton dans Ma collection) : Protéger, Classer, Embellir, calculés
  sur la collection (nombre de cartes, cartes à plus de 20 € et 100 €, gradées, scellés). Liens Amazon et Etsy
  normaux pour l'instant : mettre l'identifiant partenaire dans `SHOP_TAG` et l'étiquette passe à « lien partenaire ».
- **Jauge d'assurance** (Portefeuille, dès 1 500 € de collection) : plafond « objets de valeur » saisi → % couvert.
- Règles : tout montrer, partenaire ou non ; l'ordre ne dépend jamais de la commission ; chaque lien partenaire est signalé.
- Liens eBay de l'appli : `ebayLink()` dans `app.js` (lien partenaire si possible), étiquette `linkTag()`.
- Textes : `python3 outils/textes_revenus.py && python3 outils/i18n_build.py`.
