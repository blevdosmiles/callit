// Paiement de CallIt! Pro (Supabase Edge Function « pro-paiement »)
//
// PAS ENCORE ACTIVÉ : tant que le secret PAIEMENTS_ACTIFS ne vaut pas « oui », cette fonction répond
// « fermé » et ne contacte jamais Stripe. On attend le code ATECO confirmé par le comptable (27/11/2026).
//
// Ce que fait la fonction, pour le compte connecté (sa session Supabase) :
//   { "action": "payer", "langue": "fr", "formule": "mois" | "an" } → adresse d'une page de paiement Stripe (Checkout)
//   { "action": "gerer" }                  → adresse du portail client Stripe (carte, factures, résiliation)
// L'appli ouvre ensuite cette adresse. La carte bancaire est saisie chez Stripe, jamais chez CallIt!.
//
// Secrets Supabase (Edge Functions → Secrets), jamais dans le code :
//   STRIPE_SECRET_KEY   clé secrète Stripe (sk_test_… pour les essais, sk_live_… le jour J)
//   STRIPE_PRIX         identifiant du prix « CallIt! Pro, 5 € par mois » (price_…)
//   STRIPE_PRIX_AN      identifiant du prix « CallIt! Pro, 50 € par an » (price_…), le prix de 10 mois
//   PAIEMENTS_ACTIFS    « oui » pour ouvrir les paiements, n'importe quoi d'autre pour les fermer
// SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournis par Supabase.

const ORIGINES = ["https://callitcards.com", "https://www.callitcards.com"];
const SITE = "https://callitcards.com";
const LANGUES = ["fr", "en", "de", "es", "it"];
// Phrase affichée à côté de la case à cocher de Stripe (consentement aux conditions + début immédiat,
// qui permet de démarrer Pro tout de suite pendant le délai de rétractation : voir conditions/).
const CONSENTEMENT: Record<string, string> = {
  fr: "J'accepte les [conditions de vente]({u}) et je demande que Pro démarre tout de suite.",
  en: "I accept the [terms of sale]({u}) and ask for Pro to start right away.",
  de: "Ich akzeptiere die [Verkaufsbedingungen]({u}) und möchte, dass Pro sofort beginnt.",
  es: "Acepto las [condiciones de venta]({u}) y pido que Pro empiece de inmediato.",
  it: "Accetto le [condizioni di vendita]({u}) e chiedo che Pro inizi subito.",
};

function entetes(origine: string | null): Record<string, string> {
  const ok = !!origine && ORIGINES.includes(origine);
  return {
    "Access-Control-Allow-Origin": ok ? origine! : ORIGINES[0],
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    "Content-Type": "application/json",
  };
}
const reponse = (h: Record<string, string>, statut: number, corps: unknown) =>
  new Response(JSON.stringify(corps), { status: statut, headers: h });

// Appel de l'API Stripe (formulaire encodé, sans bibliothèque)
async function stripe(chemin: string, params: Record<string, string>): Promise<any> {
  const r = await fetch("https://api.stripe.com/v1/" + chemin, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + Deno.env.get("STRIPE_SECRET_KEY"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params).toString(),
  });
  const j = await r.json();
  if (!r.ok) throw new Error("stripe " + r.status + " " + (j?.error?.code || ""));
  return j;
}

// Le compte connecté, d'après sa session (e-mail confirmé obligatoire)
async function compte(jeton: string): Promise<{ id: string; email: string } | null> {
  const url = Deno.env.get("SUPABASE_URL")!;
  const r = await fetch(url + "/auth/v1/user", {
    headers: { apikey: Deno.env.get("SUPABASE_ANON_KEY") || "", Authorization: "Bearer " + jeton },
  });
  if (!r.ok) return null;
  const u = await r.json();
  if (!u?.id || !u?.email || !u?.email_confirmed_at) return null;
  return { id: u.id, email: u.email };
}

// Client Stripe déjà connu pour ce compte (table abonnements, lue avec la clé de service)
async function clientConnu(uid: string): Promise<string | null> {
  const url = Deno.env.get("SUPABASE_URL")!, cle = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const r = await fetch(`${url}/rest/v1/abonnements?user_id=eq.${encodeURIComponent(uid)}&select=stripe_client,statut`, {
    headers: { apikey: cle, Authorization: "Bearer " + cle },
  });
  if (!r.ok) return null;
  const l = await r.json();
  return (l && l[0] && l[0].stripe_client) || null;
}

Deno.serve(async (req) => {
  const h = entetes(req.headers.get("Origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: h });
  if (req.method !== "POST") return reponse(h, 405, { erreur: "methode" });
  const origine = req.headers.get("Origin");
  if (origine && !ORIGINES.includes(origine)) return reponse(h, 403, { erreur: "origine" });

  // Interrupteur général : fermé tant que Jérémie n'a pas dit « on ouvre »
  if (Deno.env.get("PAIEMENTS_ACTIFS") !== "oui") return reponse(h, 503, { erreur: "ferme" });
  if (!Deno.env.get("STRIPE_SECRET_KEY") || !Deno.env.get("STRIPE_PRIX")) return reponse(h, 503, { erreur: "reglage" });

  const jeton = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jeton) return reponse(h, 401, { erreur: "connexion" });
  const u = await compte(jeton);
  if (!u) return reponse(h, 401, { erreur: "connexion" });

  let d: any;
  try { d = JSON.parse(await req.text()); } catch { return reponse(h, 400, { erreur: "json" }); }
  const langue = LANGUES.includes(d?.langue) ? d.langue : "fr";
  const prix = d?.formule === "an" ? Deno.env.get("STRIPE_PRIX_AN") : Deno.env.get("STRIPE_PRIX");

  try {
    const client = await clientConnu(u.id);

    if (d?.action === "gerer") {
      if (!client) return reponse(h, 404, { erreur: "pas_client" });
      const s = await stripe("billing_portal/sessions", { customer: client, return_url: SITE + "/#/pro", locale: "auto" });
      return reponse(h, 200, { url: s.url });
    }

    if (d?.action === "payer") {
      if (!prix) return reponse(h, 503, { erreur: "reglage" });
      const conditions = `${SITE}/conditions/${langue}.html`;
      const p: Record<string, string> = {
        mode: "subscription",
        "line_items[0][price]": prix,
        "line_items[0][quantity]": "1",
        client_reference_id: u.id,
        "subscription_data[metadata][user_id]": u.id,
        "metadata[user_id]": u.id,
        success_url: SITE + "/#/pro?merci=1",
        cancel_url: SITE + "/#/pro",
        locale: langue,
        "consent_collection[terms_of_service]": "required",
        "custom_text[terms_of_service_acceptance][message]": CONSENTEMENT[langue].replace("{u}", conditions),
        allow_promotion_codes: "false",
        billing_address_collection: "auto",
      };
      if (client) p.customer = client; else p.customer_email = u.email;
      const s = await stripe("checkout/sessions", p);
      return reponse(h, 200, { url: s.url });
    }
    return reponse(h, 400, { erreur: "action" });
  } catch (_e) {
    // Rien de détaillé vers l'appli (ni clé, ni message de Stripe)
    return reponse(h, 502, { erreur: "stripe" });
  }
});
