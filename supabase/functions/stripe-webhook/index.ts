// Messages de Stripe vers CallIt! (Supabase Edge Function « stripe-webhook »)
//
// Stripe appelle cette adresse à chaque changement d'abonnement (payé, renouvelé, en retard, résilié).
// La fonction vérifie la signature de Stripe, puis met à jour la table « abonnements » : c'est la SEULE
// chose qui peut rendre un compte Pro. L'appli ne peut jamais s'y écrire elle-même.
//
// Réglages Supabase :
//   - « Verify JWT » DÉCOCHÉ pour cette fonction (Stripe n'a pas de session Supabase ; la signature Stripe la remplace).
//   - Secret STRIPE_WEBHOOK_SECRET (whsec_…), donné par Stripe à la création du point de terminaison.
// Événements à cocher chez Stripe : checkout.session.completed, customer.subscription.created,
//   customer.subscription.updated, customer.subscription.deleted.

const TOLERANCE = 300; // secondes : un message plus vieux est refusé (rejeu)

async function signatureOk(brut: string, entete: string | null, secret: string): Promise<boolean> {
  if (!entete) return false;
  const parts = Object.fromEntries(entete.split(",").map((x) => x.split("=", 2)).filter((x) => x.length === 2).map(([k, v]) => [k.trim(), v]));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > TOLERANCE) return false;
  const sigs = entete.split(",").filter((x) => x.trim().startsWith("v1=")).map((x) => x.trim().slice(3));
  const cle = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", cle, new TextEncoder().encode(`${t}.${brut}`)));
  const attendu = Array.from(mac).map((b) => b.toString(16).padStart(2, "0")).join("");
  // comparaison à temps constant
  return sigs.some((s) => {
    if (s.length !== attendu.length) return false;
    let diff = 0;
    for (let i = 0; i < s.length; i++) diff |= s.charCodeAt(i) ^ attendu.charCodeAt(i);
    return diff === 0;
  });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function enregistrer(ligne: Record<string, unknown>): Promise<boolean> {
  const url = Deno.env.get("SUPABASE_URL")!, cle = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const r = await fetch(`${url}/rest/v1/abonnements?on_conflict=user_id`, {
    method: "POST",
    headers: {
      apikey: cle, Authorization: "Bearer " + cle, "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({ ...ligne, maj_le: new Date().toISOString() }),
  });
  return r.ok;
}

// Fin de la période payée : selon la version de l'API Stripe, elle est sur l'abonnement ou sur sa ligne
function finPeriode(sub: any): string | null {
  const s = sub?.current_period_end ?? sub?.items?.data?.[0]?.current_period_end;
  return s ? new Date(s * 1000).toISOString() : null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("methode", { status: 405 });
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!secret) return new Response("reglage", { status: 503 });
  const brut = await req.text();
  if (!(await signatureOk(brut, req.headers.get("Stripe-Signature"), secret))) return new Response("signature", { status: 400 });

  let ev: any;
  try { ev = JSON.parse(brut); } catch { return new Response("json", { status: 400 }); }
  const o = ev?.data?.object;
  let ok = true;

  if (ev.type === "checkout.session.completed" && o?.mode === "subscription") {
    const uid = o.client_reference_id || o.metadata?.user_id;
    if (UUID.test(uid || "")) ok = await enregistrer({ user_id: uid, stripe_client: o.customer, stripe_abonnement: o.subscription });
  } else if (ev.type?.startsWith("customer.subscription.")) {
    const uid = o?.metadata?.user_id;
    if (UUID.test(uid || "")) {
      ok = await enregistrer({
        user_id: uid,
        stripe_client: o.customer,
        stripe_abonnement: o.id,
        statut: ev.type === "customer.subscription.deleted" ? "canceled" : String(o.status || "aucun"),
        fin_periode: finPeriode(o),
        annule_fin_periode: !!o.cancel_at_period_end,
      });
    }
  }
  // 500 si la base n'a pas pu écrire : Stripe renverra le message plus tard
  return new Response(ok ? "ok" : "base", { status: ok ? 200 : 500 });
});
