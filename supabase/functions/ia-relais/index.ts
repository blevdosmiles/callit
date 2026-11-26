// Relais IA de CallIt! (Supabase Edge Function « ia-relais »)
//
// Les testeurs lisent leurs cartes avec l'IA sans avoir de clé à eux : l'appli envoie l'image ici,
// avec la session du compte connecté, et ce relais la transmet à Anthropic avec la clé de CallIt!.
// - La clé Anthropic est un secret Supabase (ANTHROPIC_API_KEY) : jamais dans ce code ni dans l'appli.
// - Réservé aux comptes de la liste ia_testeurs (voir outils/supabase/ia_testeurs.sql),
//   avec un quota total et un plafond par jour comptés par la base (ia_consommer).
// - Seuls les modèles Rapide (Haiku) et Précis (Sonnet) passent, avec une taille de réponse bornée.
// - Seules des demandes « carte » passent : une capture en JPEG d'abord, du texte court, des images de
//   référence prises sur les sites d'images de cartes connus. Pas d'outils, pas de long texte libre.
// - Rien n'est écrit dans les journaux (ni la clé, ni les images, ni les réponses). La clé ne repart jamais
//   vers l'appli : en cas d'erreur d'Anthropic, l'appli reçoit seulement un code.
//
// Demandes acceptées (POST, JSON) :
//   { "statut": true }                        → { testeur, reste, quota, reste_jour }
//   { model, max_tokens, messages, system?, output_config? } → la réponse d'Anthropic, telle quelle

// Sites autorisés (l'appli Android charge callitcards.com, elle a donc la même origine)
const ORIGINES = [
  "https://callitcards.com",
  "https://www.callitcards.com",
  "https://blevdosmiles.github.io",
];
// Images de référence que l'IA peut aller chercher (versions officielles des cartes)
const HOTES_IMAGES = ["assets.tcgdex.net", "images.pokemontcg.io", "cards.scryfall.io", "callitcards.com", "www.callitcards.com"];
const MAX_TEXTE = 12_000;      // tout le texte d'une demande (les consignes de CallIt! font moins de 4 000 signes)
const MAX_IMAGES = 18;         // la capture + jusqu'à 16 versions à comparer
const MAX_REPONSE = 8192;      // jetons de réponse au plus
const MODELES = ["claude-haiku-5-5", "claude-sonnet-5-5"];
const MAX_OCTETS = 6_000_000; // une capture d'écran en JPEG fait bien moins

// Clé publique de l'appli (déjà dans app.js), au cas où Supabase ne fournirait pas SUPABASE_ANON_KEY
const CLE_PUBLIQUE = "sb_publishable_y02CYGCGjZsO-PkMXFo5-w_ApGd1ilc";

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

// Reconstruit la demande en ne gardant que ce dont l'appli a besoin (tout le reste est refusé) :
// pas d'outils, pas d'autre modèle, une capture JPEG au début, peu de texte, réponse de taille bornée.
function nettoyer(d: any): any | null {
  if (!d || typeof d !== "object") return null;
  if (!MODELES.includes(d.model)) return null;
  if (!Array.isArray(d.messages) || d.messages.length < 1 || d.messages.length > 12) return null;
  let texte = 0, images = 0;
  const bloc = (b: any): any | null => {
    if (!b || typeof b !== "object") return null;
    if (b.type === "text" && typeof b.text === "string") { texte += b.text.length; return { type: "text", text: b.text }; }
    if (b.type !== "image" || !b.source) return null;
    images++;
    const src = b.source;
    if (src.type === "base64" && src.media_type === "image/jpeg" && typeof src.data === "string" && /^[A-Za-z0-9+/=]+$/.test(src.data))
      return { type: "image", source: { type: "base64", media_type: "image/jpeg", data: src.data } };
    if (src.type === "url" && typeof src.url === "string") {
      let u: URL; try { u = new URL(src.url); } catch { return null; }
      if (u.protocol !== "https:" || !HOTES_IMAGES.includes(u.hostname)) return null;
      return { type: "image", source: { type: "url", url: u.href } };
    }
    return null;
  };
  const messages: any[] = [];
  for (let i = 0; i < d.messages.length; i++) {
    const m = d.messages[i];
    if (!m || (m.role !== "user" && m.role !== "assistant") || (i === 0 && m.role !== "user")) return null;
    if (typeof m.content === "string") { texte += m.content.length; messages.push({ role: m.role, content: m.content }); continue; }
    if (!Array.isArray(m.content) || !m.content.length || m.content.length > 40) return null;
    if (m.role === "assistant") return null; // les réponses précédentes reviennent toujours en texte simple
    const c = m.content.map(bloc);
    if (c.some((x: any) => !x)) return null;
    messages.push({ role: "user", content: c });
  }
  // La première demande doit commencer par la capture de la carte (en JPEG)
  const premier = messages[0].content;
  if (!Array.isArray(premier) || premier[0].type !== "image" || premier[0].source.type !== "base64") return null;
  if (texte > MAX_TEXTE || images > MAX_IMAGES) return null;
  const out: any = { model: d.model, max_tokens: Math.min(Math.max(1, Number(d.max_tokens) || 0), MAX_REPONSE), messages };
  if (typeof d.system === "string" && d.system.length <= 2000) out.system = d.system;
  const eff = d.output_config && d.output_config.effort;
  if (["low", "medium", "high"].includes(eff)) out.output_config = { effort: eff };
  return out;
}

Deno.serve(async (req) => {
  const h = entetes(req.headers.get("Origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: h });
  if (req.method !== "POST") return reponse(h, 405, { erreur: "methode" });
  // Un navigateur envoie toujours son origine : on refuse les autres sites (le vrai verrou reste le compte testeur + les quotas)
  const origine = req.headers.get("Origin");
  if (origine && !ORIGINES.includes(origine)) return reponse(h, 403, { erreur: "origine" });

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
  if (!c.ok) return reponse(h, c.raison === "pas_testeur" ? 403 : c.raison === "connexion" ? 401 : 429, { erreur: c.raison, reste: c.reste ?? 0 });

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": cleIA, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify(corps),
  });
  // Erreur chez Anthropic : seulement un code vers l'appli (jamais le détail, qui pourrait parler du compte)
  if (!r.ok) { await r.body?.cancel(); return reponse(h, 502, { erreur: "anthropic", statut: r.status }); }
  const j = await r.json();
  // On ne renvoie que la réponse de l'IA, avec le nombre de lectures restantes
  const hh = { ...h, "X-CallIt-Reste": String(c.reste), "Access-Control-Expose-Headers": "X-CallIt-Reste" };
  return new Response(JSON.stringify({ stop_reason: j.stop_reason, content: (j.content || []).filter((b: any) => b.type === "text").map((b: any) => ({ type: "text", text: b.text })) }), { status: 200, headers: hh });
});
