// Relais IA de CallIt! (Supabase Edge Function « ia-relais »)
//
// Les testeurs lisent leurs cartes avec l'IA sans avoir de clé à eux : l'appli envoie l'image ici,
// avec la session du compte connecté, et ce relais la transmet à Anthropic avec la clé de CallIt!.
// - La clé Anthropic est un secret Supabase (ANTHROPIC_API_KEY) : jamais dans ce code ni dans l'appli.
// - Réservé aux comptes de la liste ia_testeurs (voir outils/supabase/ia_testeurs.sql),
//   avec un quota total et un plafond par jour comptés par la base (ia_consommer).
// - Seuls les modèles Rapide (Haiku) et Précis (Sonnet) passent, avec une taille de réponse bornée.
//
// Demandes acceptées (POST, JSON) :
//   { "statut": true }                        → { testeur, reste, quota, reste_jour }
//   { model, max_tokens, messages, system?, output_config? } → la réponse d'Anthropic, telle quelle

const ORIGINES = [
  "https://callitcards.com",
  "https://www.callitcards.com",
  "https://blevdosmiles.github.io",
  "capacitor://localhost",
  "https://localhost",
  "http://localhost",
];
const MODELES = ["claude-haiku-5-5", "claude-sonnet-5-5"];
const MAX_OCTETS = 6_000_000; // une capture d'écran en JPEG fait bien moins

// Clé publique de l'appli (déjà dans app.js), au cas où Supabase ne fournirait pas SUPABASE_ANON_KEY
const CLE_PUBLIQUE = "sb_publishable_y02CYGCGjZsO-PkMXFo5-w_ApGd1ilc";

function entetes(origine: string | null): Record<string, string> {
  const ok = origine && (ORIGINES.includes(origine) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origine));
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

// Appel d'une fonction de la base AU NOM du compte connecté (son jeton), comme le ferait l'appli
async function rpc(nom: string, jeton: string): Promise<any> {
  const url = Deno.env.get("SUPABASE_URL")!;
  const cle = Deno.env.get("SUPABASE_ANON_KEY") || CLE_PUBLIQUE;
  const r = await fetch(`${url}/rest/v1/rpc/${nom}`, {
    method: "POST",
    headers: { apikey: cle, Authorization: `Bearer ${jeton}`, "Content-Type": "application/json" },
    body: "{}",
  });
  if (!r.ok) return null;
  return await r.json();
}

// Ne garde que ce dont l'appli a besoin : pas d'outils, pas d'autre modèle, réponse de taille bornée
function nettoyer(d: any): any | null {
  if (!d || typeof d !== "object") return null;
  if (!MODELES.includes(d.model)) return null;
  if (!Array.isArray(d.messages) || d.messages.length < 1 || d.messages.length > 12) return null;
  const max = Math.min(Math.max(1, Number(d.max_tokens) || 0), 16384);
  const out: any = { model: d.model, max_tokens: max, messages: d.messages };
  if (typeof d.system === "string" && d.system.length <= 4000) out.system = d.system;
  const eff = d.output_config && d.output_config.effort;
  if (["low", "medium", "high"].includes(eff)) out.output_config = { effort: eff };
  return out;
}

Deno.serve(async (req) => {
  const h = entetes(req.headers.get("Origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: h });
  if (req.method !== "POST") return reponse(h, 405, { erreur: "methode" });

  const jeton = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jeton) return reponse(h, 401, { erreur: "connexion" });

  const brut = await req.text();
  if (brut.length > MAX_OCTETS) return reponse(h, 413, { erreur: "trop_gros" });
  let d: any;
  try { d = JSON.parse(brut); } catch { return reponse(h, 400, { erreur: "json" }); }

  if (d && d.statut === true) {
    const s = await rpc("ia_statut", jeton);
    return reponse(h, s ? 200 : 401, s || { testeur: false });
  }

  const corps = nettoyer(d);
  if (!corps) return reponse(h, 400, { erreur: "demande" });

  const cleIA = Deno.env.get("ANTHROPIC_API_KEY");
  if (!cleIA) return reponse(h, 503, { erreur: "pas_de_cle" });

  // Compte la lecture d'abord : si le quota est atteint, rien ne part chez Anthropic
  const c = await rpc("ia_consommer", jeton);
  if (!c) return reponse(h, 401, { erreur: "connexion" });
  if (!c.ok) return reponse(h, c.raison === "pas_testeur" ? 403 : 429, { erreur: c.raison, reste: c.reste ?? 0 });

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": cleIA, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify(corps),
  });
  const texte = await r.text();
  // On renvoie la réponse d'Anthropic, avec le nombre de lectures restantes
  const hh = { ...h, "X-CallIt-Reste": String(c.reste), "Access-Control-Expose-Headers": "X-CallIt-Reste" };
  return new Response(texte, { status: r.ok ? 200 : 502, headers: hh });
});
