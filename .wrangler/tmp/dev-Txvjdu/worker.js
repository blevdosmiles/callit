var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// cloudflare/analyse.js
var DUREE = 48 * 3600 * 1e3;
var DOSSIER = "analyses/";
var LETTRES = "abcdefghjkmnpqrstuvwxyz";
var CHIFFRES = "23456789";
var TOUT = LETTRES + CHIFFRES;
var CODE = /^\/((?=[a-z]*[2-9])[a-hj-km-np-z2-9]{5})\/?$/;
var IMAGE_MAX = 1500 * 1024;
var LANGUES = ["fr", "en", "it", "es", "de"];
var T = {
  fr: { titre: "Analyse du centrage", recto: "Recto", verso: "Verso", auMieux: "au mieux", cta: "Analyse ta carte gratuitement", scan: "Scanner ma collection", compte: "Cr\xE9er mon compte gratuit", expire: "Lien valable jusqu\u2019au {0}", note: "Avis sur photo, \xE0 1 ou 2 points pr\xE8s.", desc: "Centrage mesur\xE9 avec CallIt! : recto, verso et note estim\xE9e.", colT: "Toute ta collection", colS: "Scanne tes cartes une par une ou tout un classeur : CallIt! les reconna\xEEt et suit leur cote.", barS: "Une photo suffit.", langue: "Langue" },
  en: { titre: "Centering analysis", recto: "Front", verso: "Back", auMieux: "at best", cta: "Analyze your card for free", scan: "Scan my collection", compte: "Create my free account", expire: "Link valid until {0}", note: "Opinion based on a photo, within 1 or 2 points.", desc: "Centering measured with CallIt!: front, back and estimated grade.", colT: "Your whole collection", colS: "Scan your cards one by one or a whole binder: CallIt! recognizes them and tracks their value.", barS: "One photo is enough.", langue: "Language" },
  it: { titre: "Analisi della centratura", recto: "Fronte", verso: "Retro", auMieux: "al massimo", cta: "Analizza la tua carta gratis", scan: "Scansiona la mia collezione", compte: "Crea il mio account gratuito", expire: "Link valido fino al {0}", note: "Parere su foto, con 1 o 2 punti di margine.", desc: "Centratura misurata con CallIt!: fronte, retro e voto stimato.", colT: "Tutta la tua collezione", colS: "Scansiona le tue carte una per una o un intero raccoglitore: CallIt! le riconosce e ne segue il valore.", barS: "Basta una foto.", langue: "Lingua" },
  es: { titre: "An\xE1lisis del centrado", recto: "Anverso", verso: "Reverso", auMieux: "como m\xE1ximo", cta: "Analiza tu carta gratis", scan: "Escanear mi colecci\xF3n", compte: "Crear mi cuenta gratuita", expire: "Enlace v\xE1lido hasta el {0}", note: "Opini\xF3n sobre foto, con 1 o 2 puntos de margen.", desc: "Centrado medido con CallIt!: anverso, reverso y nota estimada.", colT: "Toda tu colecci\xF3n", colS: "Escanea tus cartas una a una o un archivador entero: CallIt! las reconoce y sigue su valor.", barS: "Basta una foto.", langue: "Idioma" },
  de: { titre: "Zentrierungsanalyse", recto: "Vorderseite", verso: "R\xFCckseite", auMieux: "h\xF6chstens", cta: "Analysiere deine Karte kostenlos", scan: "Meine Sammlung scannen", compte: "Kostenloses Konto erstellen", expire: "Link g\xFCltig bis {0}", note: "Einsch\xE4tzung anhand eines Fotos, auf 1 bis 2 Punkte genau.", desc: "Zentrierung gemessen mit CallIt!: Vorder- und R\xFCckseite und gesch\xE4tzte Note.", colT: "Deine ganze Sammlung", colS: "Scanne deine Karten einzeln oder einen ganzen Ordner: CallIt! erkennt sie und verfolgt ihren Wert.", barS: "Ein Foto gen\xFCgt.", langue: "Sprache" }
};
var LOCALE = { fr: "fr-FR", en: "en-GB", it: "it-IT", es: "es-ES", de: "de-DE" };
var json = /* @__PURE__ */ __name((o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" } }), "json");
var esc = /* @__PURE__ */ __name((s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]), "esc");
var texte = /* @__PURE__ */ __name((s, n) => typeof s === "string" ? s.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, n) : "", "texte");
var pct = /* @__PURE__ */ __name((x) => Number.isFinite(+x) && +x >= 0 && +x <= 100 ? Math.round(+x * 10) / 10 : null, "pct");
var note = /* @__PURE__ */ __name((x) => Number.isFinite(+x) && +x >= 0 && +x <= 10 ? +x : null, "note");
var hasard = /* @__PURE__ */ __name((n, jeu) => {
  const a = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(a, (b) => jeu[b % jeu.length]).join("");
}, "hasard");
function nouveauCode() {
  const c = hasard(4, TOUT).split("");
  c.splice(hasard(1, "01234")[0] | 0, 0, hasard(1, CHIFFRES));
  return c.join("");
}
__name(nouveauCode, "nouveauCode");
async function empreinte(s) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, "0")).join("");
}
__name(empreinte, "empreinte");
var face = /* @__PURE__ */ __name((f) => f && typeof f === "object" && pct(f.lr) != null && pct(f.tb) != null ? { lr: pct(f.lr), tb: pct(f.tb) } : null, "face");
async function lire(env, code) {
  const o = await env.R2.get(DOSSIER + code + ".json");
  if (!o) return null;
  const a = await o.json().catch(() => null);
  if (!a || !a.exp || a.exp < Date.now()) return null;
  return a;
}
__name(lire, "lire");
async function tropDEnvois(env, request) {
  if (!env.LIMITE) return false;
  const ip = request.headers.get("cf-connecting-ip") || "inconnu";
  try {
    const { success } = await env.LIMITE.limit({ key: ip });
    return !success;
  } catch (e) {
    return false;
  }
}
__name(tropDEnvois, "tropDEnvois");
async function creer(request, env) {
  if (await tropDEnvois(env, request)) return json({ erreur: "trop" }, 429);
  const brut = await request.text();
  if (brut.length > 8e3) return json({ erreur: "trop gros" }, 413);
  let d;
  try {
    d = JSON.parse(brut);
  } catch (e) {
    return json({ erreur: "illisible" }, 400);
  }
  const recto = face(d.recto), verso = face(d.verso);
  if (!recto && !verso) return json({ erreur: "aucune mesure" }, 400);
  const a = {
    v: 1,
    cree: Date.now(),
    exp: Date.now() + DUREE,
    lang: LANGUES.includes(d.lang) ? d.lang : "fr",
    nom: texte(d.nom, 80),
    info: texte(d.info, 120),
    recto,
    verso,
    psa: note(d.psa),
    bgs: d.bgs === 0 ? 0 : note(d.bgs),
    cgc: d.cgc === 0 ? 0 : note(d.cgc),
    image: false
  };
  const cle = hasard(24, TOUT);
  a.cle = await empreinte(cle);
  let code = "";
  for (let n = 0; n < 6 && !code; n++) {
    const c = nouveauCode();
    if (!await env.R2.head(DOSSIER + c + ".json")) code = c;
  }
  if (!code) return json({ erreur: "r\xE9essaie" }, 503);
  await env.R2.put(DOSSIER + code + ".json", JSON.stringify(a), { httpMetadata: { contentType: "application/json" }, customMetadata: { exp: String(a.exp) } });
  return json({ code, url: "https://callitcards.com/" + code, cle, exp: a.exp });
}
__name(creer, "creer");
async function mettreImage(request, env, code) {
  if (await tropDEnvois(env, request)) return json({ erreur: "trop" }, 429);
  const a = await lire(env, code);
  const url = new URL(request.url);
  if (!a || a.cle !== await empreinte(url.searchParams.get("cle") || "")) return json({ erreur: "introuvable" }, 404);
  const buf = await request.arrayBuffer();
  const b = new Uint8Array(buf, 0, Math.min(3, buf.byteLength));
  if (buf.byteLength > IMAGE_MAX || buf.byteLength < 1e3 || b[0] !== 255 || b[1] !== 216 || b[2] !== 255) return json({ erreur: "image refus\xE9e" }, 400);
  const lang = url.searchParams.get("lang");
  await env.R2.put(DOSSIER + code + ".jpg", buf, { httpMetadata: { contentType: "image/jpeg" }, customMetadata: { exp: String(a.exp) } });
  a.image = Date.now();
  if (LANGUES.includes(lang)) a.lang = lang;
  await env.R2.put(DOSSIER + code + ".json", JSON.stringify(a), { httpMetadata: { contentType: "application/json" }, customMetadata: { exp: String(a.exp) } });
  return json({ ok: true });
}
__name(mettreImage, "mettreImage");
async function servirImage(request, env, code) {
  const o = await env.R2.get(DOSSIER + code + ".jpg");
  if (!o || +(o.customMetadata || {}).exp < Date.now()) return new Response("Lien expir\xE9", { status: 404 });
  return new Response(request.method === "HEAD" ? null : o.body, { headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=3600", etag: o.httpEtag } });
}
__name(servirImage, "servirImage");
function langueDe(request, url, a) {
  const q = url.searchParams.get("l");
  if (LANGUES.includes(q)) return q;
  if (a && a.lang) return a.lang;
  const al = (request.headers.get("accept-language") || "").toLowerCase().slice(0, 2);
  return LANGUES.includes(al) ? al : "fr";
}
__name(langueDe, "langueDe");
function page(a, code, lang) {
  const t = T[lang], fmt = /* @__PURE__ */ __name((n, ...v) => n.replace(/\{(\d)\}/g, (m, i) => v[+i]), "fmt");
  const nb = /* @__PURE__ */ __name((x) => lang === "en" ? String(x) : String(x).replace(".", ","), "nb");
  const mes = /* @__PURE__ */ __name((f) => `${nb(f.lr)}/${nb(Math.round((100 - f.lr) * 10) / 10)} \xB7 ${nb(f.tb)}/${nb(Math.round((100 - f.tb) * 10) / 10)}`, "mes");
  const fin = new Intl.DateTimeFormat(LOCALE[lang], { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).format(new Date(a.exp));
  const titre = a.nom ? `${a.nom} \xB7 ${t.titre}` : t.titre;
  const img = a.image ? `/a/${code}.jpg?v=${a.image}` : "";
  const notes = [a.psa != null ? `<span><b>PSA ${nb(a.psa)}</b> ${esc(t.auMieux)}</span>` : "", a.bgs ? `<span><b>BGS ${nb(a.bgs)}</b></span>` : "", a.cgc ? `<span><b>CGC ${nb(a.cgc)}</b></span>` : ""].filter(Boolean).join("");
  const langues = LANGUES.map((l) => `<a href="?l=${l}" class="chip${l === lang ? " on" : ""}" hreflang="${l}" lang="${l}"${l === lang ? ' aria-current="true"' : ""}>${l.toUpperCase()}</a>`).join("");
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(titre)} \xB7 CallIt!</title><meta name="description" content="${esc(t.desc)}"><meta name="robots" content="noindex">
<meta property="og:type" content="website"><meta property="og:site_name" content="CallIt!"><meta property="og:title" content="${esc(titre)}"><meta property="og:description" content="${esc(t.desc)}"><meta property="og:url" content="https://callitcards.com/${code}">
${img ? `<meta property="og:image" content="https://callitcards.com${img}"><meta property="og:image:width" content="1080"><meta property="og:image:height" content="1350"><meta name="twitter:card" content="summary_large_image">` : ""}
<link rel="icon" href="/icons/icon-192.png"><link rel="preload" href="/polices/geist-latin.woff2" as="font" type="font/woff2" crossorigin>
<style>
@font-face{font-family:Fraunces;font-weight:500 700;font-display:swap;src:url(/polices/fraunces-latin.woff2) format("woff2")}
@font-face{font-family:Geist;font-weight:400 700;font-display:swap;src:url(/polices/geist-latin.woff2) format("woff2")}
:root{--bg:#ebebe8;--surface:#fff;--ink:#16161a;--muted:#5c5c56;--line:#e6e6e2;--chip:#dcdcd8;--gain:#0a7a44;--on:#fff;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#18181b;--surface:#232327;--ink:#ececea;--muted:#a3a39b;--line:#303035;--chip:#303035;--gain:#4cc98a;--on:#16161a;color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.4 Geist,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:inherit}main{max-width:560px;margin:0 auto;padding:max(14px,env(safe-area-inset-top)) 16px 32px;display:flex;flex-direction:column;gap:14px}
.top{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:44px}
.logo{display:flex;align-items:center;gap:8px;text-decoration:none;font:700 22px Fraunces,Georgia,serif}.logo span{width:28px;height:40px;background:url(/icons/icon-192.png) -10px -4px/48px 48px no-repeat}.logo i{font-style:normal;color:var(--gain)}
.chips{display:flex;gap:6px}.chip{min-width:38px;padding:7px 10px;border-radius:999px;background:var(--chip);text-decoration:none;font-weight:600;font-size:13px;text-align:center}.chip.on{background:var(--ink);color:var(--on)}
h1{font:700 24px/1.15 Fraunces,Georgia,serif;margin:0}.sub{color:var(--muted);font-size:14px;margin-top:2px}
.shot{background:var(--surface);border-radius:16px;overflow:hidden}.shot img{display:block;width:100%;height:auto;max-height:78vh;object-fit:contain}
.res{background:var(--surface);border-radius:16px;padding:12px 14px;display:flex;flex-wrap:wrap;gap:6px 16px;font-variant-numeric:tabular-nums}.res span{white-space:nowrap}.res .m{color:var(--muted)}
.cta{background:var(--surface);border-radius:16px;padding:14px;display:flex;flex-direction:column;gap:10px}
.cta b{font-size:17px}.cta p{margin:0;color:var(--muted);font-size:14px}.btns{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.btn{display:inline-flex;align-items:center;gap:6px;padding:11px 16px;border-radius:12px;background:var(--chip);text-decoration:none;font-weight:600;font-size:15px}.btn.p{background:var(--gain);color:#fff}
@media (prefers-color-scheme:dark){.btn.p{color:#0d1f15}}
.small{font-size:13px;color:var(--muted)}.bar{position:sticky;bottom:0;margin:0 -16px -32px;padding:12px 16px max(12px,env(safe-area-inset-bottom));background:var(--bg);border-top:1px solid var(--line);display:flex;align-items:center;gap:12px}.bar .btn{flex:none}.foot{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}
</style></head><body><main>
<div class="top"><a class="logo" href="/"><span aria-hidden="true"></span><b>Call<i>It!</i></b></a><nav class="chips" aria-label="${esc(t.langue)}">${langues}</nav></div>
<div><h1>${esc(a.nom || t.titre)}</h1><div class="sub">${esc([a.nom ? t.titre : "", a.info].filter(Boolean).join(" \xB7 "))}</div></div>
${img ? `<div class="shot"><img src="${img}" width="1080" height="1350" alt="${esc(titre)}"></div>` : ""}
<div class="res">${a.recto ? `<span><span class="m">${esc(t.recto)}</span> <b>${mes(a.recto)}</b></span>` : ""}${a.verso ? `<span><span class="m">${esc(t.verso)}</span> <b>${mes(a.verso)}</b></span>` : ""}${notes}</div>
<div class="cta"><b>${esc(t.colT)}</b><p>${esc(t.colS)}</p><div class="btns"><a class="btn" href="/#/scan">${esc(t.scan)}</a><a class="small" href="/#/reglages">${esc(t.compte)}</a></div></div>
<div class="foot small"><span>${esc(t.note)}</span><span>${esc(fmt(t.expire, fin))}</span></div>
<div class="bar"><a class="btn p" href="/#/centrage">${esc(t.cta)}</a><span class="small">${esc(t.barS)}</span></div>
</main></body></html>`;
}
__name(page, "page");
async function analyse(request, env, url) {
  const p = url.pathname, m = request.method;
  if (p === "/api/analyse" || p.startsWith("/api/analyse/")) {
    if (m === "OPTIONS") return new Response(null, { headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "POST, PUT", "access-control-allow-headers": "content-type", "access-control-max-age": "86400" } });
    if (p === "/api/analyse" && m === "POST") return creer(request, env);
    const i = p.match(/^\/api\/analyse\/([a-z2-9]{5})\/image$/);
    if (i && m === "PUT") return mettreImage(request, env, i[1]);
    return json({ erreur: "inconnu" }, 404);
  }
  const im = p.match(/^\/a\/([a-z2-9]{5})\.jpg$/);
  if (im && (m === "GET" || m === "HEAD")) return servirImage(request, env, im[1]);
  const c = p.match(CODE);
  if (c && (m === "GET" || m === "HEAD")) {
    const a = await lire(env, c[1]);
    if (!a) return Response.redirect(url.origin + "/?lien=expire", 302);
    const lang = langueDe(request, url, a);
    return new Response(request.method === "HEAD" ? null : page(a, c[1], lang), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60", "content-language": lang, vary: "accept-language" } });
  }
  return null;
}
__name(analyse, "analyse");
async function nettoyer(env) {
  let cursor, n = 0;
  do {
    const l = await env.R2.list({ prefix: DOSSIER, cursor, include: ["customMetadata"], limit: 1e3 });
    const vieux = l.objects.filter((o) => {
      const e = +(o.customMetadata || {}).exp;
      return (e || o.uploaded.getTime() + DUREE) < Date.now();
    }).map((o) => o.key);
    if (vieux.length) {
      await env.R2.delete(vieux);
      n += vieux.length;
    }
    cursor = l.truncated ? l.cursor : void 0;
  } while (cursor);
  return n;
}
__name(nettoyer, "nettoyer");

// cloudflare/worker.js
var TYPES = {
  html: "text/html; charset=utf-8",
  xml: "application/xml; charset=utf-8",
  json: "application/json; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  webp: "image/webp",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  svg: "image/svg+xml",
  txt: "text/plain; charset=utf-8"
};
var R2_DOSSIERS = /^\/(img|fr|en|de|es|it)(\/|$)/;
async function servirFichier(request, env, url) {
  const r = await env.ASSETS.fetch(request);
  if (r.status !== 404) return r;
  const p = url.pathname;
  const essai = /* @__PURE__ */ __name((chemin) => env.ASSETS.fetch(new Request(new URL(chemin + url.search, url), request)), "essai");
  if (p.endsWith("/")) {
    const i = await essai(p + "index.html");
    if (i.status !== 404) return i;
  } else if (!/\.[a-z0-9]+$/i.test(p)) {
    const h = await essai(p + ".html");
    if (h.status !== 404) return h;
    const d = await essai(p + "/index.html");
    if (d.status !== 404) return Response.redirect(url.origin + p + "/" + url.search, 301);
  }
  return r;
}
__name(servirFichier, "servirFichier");
var worker_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.hostname === "www.callitcards.com") {
      url.hostname = "callitcards.com";
      return Response.redirect(url.toString(), 301);
    }
    const a = await analyse(request, env, url);
    if (a) return a;
    if (!R2_DOSSIERS.test(url.pathname)) return servirFichier(request, env, url);
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("M\xE9thode non autoris\xE9e", { status: 405 });
    }
    const cache = caches.default;
    const enCache = await cache.match(request);
    if (enCache) return enCache;
    let chemin = decodeURIComponent(url.pathname.slice(1));
    if (/^(fr|en|de|es|it)$/.test(chemin)) {
      return Response.redirect(url.origin + "/" + chemin + "/" + url.search, 301);
    }
    const essais = chemin.endsWith("/") ? [chemin + "index.html"] : [chemin, chemin + ".html"];
    let objet = null, cle = null;
    for (const c of essais) {
      objet = await env.R2.get(c);
      if (objet) {
        cle = c;
        break;
      }
    }
    if (!objet && !chemin.endsWith("/") && !/\.[a-z0-9]+$/i.test(chemin)) {
      const dossier = await env.R2.head(chemin + "/index.html");
      if (dossier) return Response.redirect(url.origin + "/" + chemin + "/" + url.search, 301);
    }
    if (!objet) return new Response("Page introuvable", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
    const ext = cle.split(".").pop().toLowerCase();
    const entetes = new Headers();
    entetes.set("content-type", TYPES[ext] || "application/octet-stream");
    entetes.set("etag", objet.httpEtag);
    entetes.set("cache-control", ext === "html" ? "public, max-age=600" : "public, max-age=86400");
    const reponse = new Response(request.method === "HEAD" ? null : objet.body, { headers: entetes });
    if (request.method === "GET") ctx.waitUntil(cache.put(request, reponse.clone()));
    return reponse;
  },
  // Chaque heure (wrangler.jsonc, « triggers ») : efface les analyses partagées de plus de 48 h
  async scheduled(event, env, ctx) {
    ctx.waitUntil(nettoyer(env));
  }
};

// ../../../root/.npm/_npx/4fabc7ef1e21636f/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../../root/.npm/_npx/4fabc7ef1e21636f/node_modules/wrangler/templates/middleware/middleware-scheduled.ts
var scheduled = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  const url = new URL(request.url);
  if (url.pathname === "/__scheduled") {
    const cron = url.searchParams.get("cron") ?? "";
    await middlewareCtx.dispatch("scheduled", { cron });
    return new Response("Ran scheduled event");
  }
  const resp = await middlewareCtx.next(request, env);
  if (request.headers.get("referer")?.endsWith("/__scheduled") && url.pathname === "/favicon.ico" && resp.status === 500) {
    return new Response(null, { status: 404 });
  }
  return resp;
}, "scheduled");
var middleware_scheduled_default = scheduled;

// ../../../root/.npm/_npx/4fabc7ef1e21636f/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-yf2vYb/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_scheduled_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// ../../../root/.npm/_npx/4fabc7ef1e21636f/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-yf2vYb/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=worker.js.map
