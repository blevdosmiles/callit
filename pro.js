/* CallIt! Pro : abonnement (Stripe) et compteur des analyses gratuites.
   PAS ENCORE BRANCHÉ : ce fichier n'est chargé par aucune page tant que PRO_ACTIF vaut false
   (en attente du code ATECO confirmé par le comptable, 27/11/2026).

   Règle : 3 analyses d'état gratuites par jour avec un compte, 100 par jour avec Pro (5 € par mois ou 50 € par an).
   - pro.statut()     → { connecte, pro, par_jour, reste_jour, fin_periode, annule_fin_periode }
   - pro.consommer()  → { ok, pro, reste } ; à appeler AVANT de lancer une analyse (ok=false : proposer Pro)
   - pro.payer('mois'|'an') → ouvre la page de paiement Stripe (5 €/mois ou 50 €/an) (la carte est saisie chez Stripe, jamais ici)
   - pro.gerer()      → ouvre le portail Stripe (changer de carte, factures, résilier)
   Le serveur décide seul (fonctions SQL pro_statut / analyse_consommer, fonction pro-paiement) :
   rien ici ne peut rendre un compte Pro. Utilise sb (client Supabase) et SUPA définis dans app.js. */
const PRO_ACTIF = false;
const pro = (() => {
  const LANGUES = ['fr', 'en', 'de', 'es', 'it'];
  const langue = () => { const l = (typeof LOCALE === 'string' ? LOCALE : navigator.language || 'fr').slice(0, 2); return LANGUES.includes(l) ? l : 'fr'; };
  let cache = null, cacheT = 0;

  async function client() { return typeof supa === 'function' ? await supa() : null; }

  async function statut(force) {
    if (!PRO_ACTIF) return { connecte: !!(typeof me !== 'undefined' && me), pro: false, ferme: true };
    if (!force && cache && Date.now() - cacheT < 60_000) return cache;
    const s = await client(); if (!s) return { connecte: false, pro: false };
    const { data, error } = await s.rpc('pro_statut');
    if (error || !data) return { connecte: false, pro: false };
    cache = data; cacheT = Date.now();
    return data;
  }

  async function consommer() {
    if (!PRO_ACTIF) return { ok: true, ferme: true }; // tant que c'est fermé, rien n'est limité
    const s = await client(); if (!s) return { ok: false, raison: 'connexion' };
    const { data, error } = await s.rpc('analyse_consommer');
    cache = null;
    if (error || !data) return { ok: false, raison: 'reseau' };
    return data;
  }

  // Demande une adresse Stripe à la fonction pro-paiement, puis l'ouvre
  async function ouvrir(action, formule) {
    if (!PRO_ACTIF) return { ok: false, raison: 'ferme' };
    const s = await client(); if (!s) return { ok: false, raison: 'connexion' };
    const { data } = await s.auth.getSession();
    const jeton = data && data.session && data.session.access_token;
    if (!jeton) return { ok: false, raison: 'connexion' };
    let r;
    try {
      r = await fetch(SUPA.url + '/functions/v1/pro-paiement', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + jeton, apikey: SUPA.key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, langue: langue(), formule: formule === 'an' ? 'an' : 'mois' }),
      });
    } catch (e) { return { ok: false, raison: 'reseau' }; }
    const j = await r.json().catch(() => ({}));
    // Seules des adresses Stripe sont ouvertes (jamais une adresse venue d'ailleurs)
    if (!r.ok || typeof j.url !== 'string' || !/^https:\/\/(checkout|billing)\.stripe\.com\//.test(j.url)) return { ok: false, raison: j.erreur || 'stripe' };
    location.href = j.url;
    return { ok: true };
  }

  return { actif: () => PRO_ACTIF, statut, consommer, payer: (formule) => ouvrir('payer', formule), gerer: () => ouvrir('gerer') };
})();
