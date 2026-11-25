# CallIt! · applis iPhone et Android

Les applis des stores **réutilisent l'appli web** du dossier parent (Capacitor) :
une seule base de code pour le site, l'iPhone et Android. Rien n'est réécrit.

## Comment ça marche
- `scripts/copier-web.mjs` copie `index.html`, `app.js`, `styles.css`, `data/`, `historique/`, `vendor/`… dans `www/`,
  et ajoute `natif/natif.js` juste avant `app.js`.
- `natif/natif.js` (chargé seulement dans les applis, jamais sur le site) ajoute ce qui est propre au téléphone :
  - **données à jour** : cartes, prix, taux et historique sont lus sur le site (mis à jour chaque jour),
    avec la copie livrée dans l'appli en secours hors connexion ;
  - **liens externes** (eBay, Cardmarket) ouverts dans le navigateur intégré, CallIt! reste ouverte ;
  - **partage** natif (`navigator.share`) ;
  - **barre d'état** aux couleurs du thème clair ou sombre ;
  - **notifications push** prêtes mais éteintes (`PUSH_PRET = false`) ;
  - **liens `callit://`** (retour de connexion par e-mail, plus tard).
- **Appareil photo** : le scan d'une carte utilise déjà la photo de l'appli web ; les autorisations
  (Android `CAMERA`, iPhone `NSCameraUsageDescription`) sont déclarées.
- `android/` et `ios/` : projets natifs générés par Capacitor (identifiant `com.callitcards.app`).

## Construire
Automatique : `.github/workflows/mobile.yml` tourne à chaque changement de `mobile/`.
- Android : un fichier `.apk` de test à télécharger dans GitHub → Actions → dernière exécution → « Artifacts ».
- iPhone : vérification que le projet compile (simulateur), à lancer à la main (`ios.yml`, onglet Actions → « Run workflow »).

Sur un ordinateur (Android Studio / Xcode installés) :

    cd mobile
    npm install
    npm run android     # ou : npm run ios (Mac seulement)

Icônes et écran de démarrage : `node outils/images-natives.js && npm run icones`.

## Ce qui demandera des comptes (au nom de Jérémie)
| Étape | Compte | Coût |
|---|---|---|
| Installer l'APK de test sur un Android | aucun | 0 € |
| Notifications push Android et iPhone | projet Firebase (compte Google) | 0 € |
| Installer sur un vrai iPhone, TestFlight, App Store | Apple Developer | 99 $/an ≈ 92 € |
| Publier sur Google Play | Google Play Console | 25 $ une fois ≈ 23 € |

## Règles des stores à garder en tête
- Les annonces eBay sont des **achats de biens physiques** : un lien partenaire vers eBay est permis
  (pas d'achat intégré Apple/Google exigé), à condition d'être **signalé** comme lien partenaire.
- Pas de logo Pokémon ni Pokéball dans l'icône, les captures ou la fiche store.
- L'appli doit apporter plus qu'un site emballé (Apple, règle 4.2) : scan, partage, notifications et
  mode hors connexion vont dans ce sens.
- Les données lues en ligne doivent rester compatibles avec les anciennes versions de l'appli
  (une mise à jour sur les stores prend plusieurs jours).
