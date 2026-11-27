# Paiements CallIt! Pro (Stripe) : ce qui est prêt et comment l'ouvrir

État au 27/11/2026 : **tout est fermé**. Aucun paiement réel n'est possible tant que les 3 verrous ci-dessous ne sont pas levés.
On attend la confirmation du code ATECO par le comptable.

## La règle

- Avec un compte gratuit : 5 analyses d'état par semaine (le compteur repart le lundi). Réglable sans toucher au code : table `pro_reglages`.
- CallIt! Pro, 5 € par mois ou 50 € par an (le prix de 10 mois, choix de Jérémie du 27/11), TVA comprise : illimité. Sans engagement, résiliable dans l'appli (portail Stripe).

## Les morceaux

| Fichier | Rôle |
|---|---|
| `outils/supabase/abonnements.sql` | Tables `abonnements`, `analyses_usage`, `pro_reglages` et fonctions `pro_statut()`, `analyse_consommer()` |
| `supabase/functions/pro-paiement` | Crée la page de paiement Stripe (Checkout) ou ouvre le portail client, pour le compte connecté |
| `supabase/functions/stripe-webhook` | Reçoit les messages signés de Stripe et met à jour `abonnements` (seule porte pour devenir Pro) |
| `pro.js` | Côté appli : `pro.statut()`, `pro.consommer()`, `pro.payer()`, `pro.gerer()` |
| `outils/conditions_vente.py` → `conditions/` | Conditions de vente en fr, it, en, de, es |

## Les 3 verrous

1. `PRO_ACTIF = false` dans `pro.js` (et `pro.js` n'est chargé par aucune page).
2. Secret Supabase `PAIEMENTS_ACTIFS` absent : la fonction `pro-paiement` répond « fermé » sans appeler Stripe.
3. Compte Stripe en mode test : le mode production demande l'identité de Jérémie, son IBAN et sa partita IVA.

## Pour ouvrir (le jour où Jérémie dit oui)

1. Comptable : code ATECO confirmé, régime de TVA pour les ventes aux particuliers des autres pays de l'UE (guichet OSS) vérifié.
2. Conditions : confirmer l'adresse à afficher (`VENDEUR['adresse']`), passer `BROUILLON = False`, relancer `python3 outils/conditions_vente.py`.
3. Stripe (mode production, fait par Jérémie) : identité, IBAN, partita IVA. Puis créer le produit « CallIt! Pro » avec ses 2 prix (5 €/mois, 50 €/an), et dans
   Paramètres → Billing → E-mails clients : activer le rappel avant renouvellement des abonnements annuels (promis dans les conditions). Et dans
   Paramètres → Informations publiques, mettre l'adresse des conditions : `https://callitcards.com/conditions/` (obligatoire pour la case de consentement).
   Paramètres → Portail client : autoriser la résiliation (à la fin de la période) et la mise à jour de la carte.
4. Supabase : lancer `abonnements.sql` ; déployer `pro-paiement` (Verify JWT coché) et `stripe-webhook` (Verify JWT **décoché**) ;
   secrets `STRIPE_SECRET_KEY`, `STRIPE_PRIX`, `STRIPE_PRIX_AN`, `STRIPE_WEBHOOK_SECRET` (collés par Jérémie, jamais dans le code).
5. Stripe → Développeurs → Webhooks : adresse `https://gumeodpxjyjtkihynnsu.supabase.co/functions/v1/stripe-webhook`, événements
   `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`.
6. Essai complet en mode test (carte 4242 4242 4242 4242) : payer, devenir Pro, résilier, revenir en gratuit.
7. Seulement après : secret `PAIEMENTS_ACTIFS=oui`, `PRO_ACTIF = true`, brancher `pro.consommer()` avant chaque analyse et les boutons « Passer à Pro » / « Gérer mon abonnement ».
8. Appli Android : Google impose son propre système de paiement (Google Play Billing) pour un abonnement acheté dans l'appli. À traiter à part avant d'y montrer le bouton.

## Compte Stripe

- Compte : `acct_1UgQJbAQqnWhRxhy` (request@callitcards.com, pays Italie, nom « CallIt! »).
- Environnement de test : `acct_1UdGNfAAsK1jGTmr`, produit `prod_VhqBgI7ok6VK4l`, prix test `price_1UgQVcAAsK1jGTmrDSUZMzqJ` (5 €/mois), prix annuel test : `price_1UgW7hAAsK1jGTmrAH4SJMdd` (50 €/an).
- Options payantes refusées à la création : Managed Payments (+3,5 % par paiement), Stripe Tax.

## Lien avec l'IA du Mode Live (PR #109)

Tout compte connecté a 30 lectures IA Rapide offertes par mois (`ia_droits(uid)` dans `outils/supabase/ia_gratuit.sql`).
En ouvrant Pro : ajouter dans `ia_droits` une branche « pro » (avec `public.pro_actif(uid)`) avant l'offre gratuite,
par exemple gros quota Rapide et Précis plafonné. Le relais `ia-relais` et le Live suivent l'offre renvoyée.
