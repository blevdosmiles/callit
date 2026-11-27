// Lien court d'une analyse partagée (27/11/2026) : callitcards.com/zu42g, valable 48 h.
// L'appli envoie les mesures (POST /api/analyse), reçoit le code, dessine l'image avec le lien en haut à droite,
// puis envoie l'image (PUT /api/analyse/<code>/image). La page du lien montre l'image, le résumé, le choix de la
// langue et l'invitation à analyser sa carte. Lien expiré ou inconnu : retour à l'accueil (« Analyse ta carte
// gratuitement »), car l'image reste sur Facebook bien après 48 h.
// Rangement : R2 (bucket callit-site), dossier analyses/. Rien de personnel : la photo de la carte et ses mesures.
// Effacement : chaque heure (scheduled, wrangler.jsonc), tout ce qui a passé 48 h.

const DUREE = 48 * 3600 * 1000;
const DOSSIER = 'analyses/';
// Sans 0/o, 1/l/i : un code se recopie sans erreur. Toujours au moins un chiffre : jamais un mot comme « icons ».
const LETTRES = 'abcdefghjkmnpqrstuvwxyz', CHIFFRES = '23456789', TOUT = LETTRES + CHIFFRES;
export const CODE = /^\/((?=[a-z]*[2-9])[a-hj-km-np-z2-9]{5})\/?$/;
const IMAGE_MAX = 1500 * 1024;
const LANGUES = ['fr', 'en', 'it', 'es', 'de'];

const T = {
  fr: { titre: 'Analyse du centrage', recto: 'Recto', verso: 'Verso', auMieux: 'au mieux', cta: 'Analyse ta carte gratuitement', scan: 'Scanner ma collection', compte: 'Créer mon compte gratuit', expire: 'Lien valable jusqu’au {0}', note: 'Avis sur photo, à 1 ou 2 points près.', desc: 'Centrage mesuré avec CallIt! : recto, verso et note estimée.', colT: 'Toute ta collection', colS: 'Scanne tes cartes une par une ou tout un classeur : CallIt! les reconnaît et suit leur cote.', barS: 'Une photo suffit.', langue: 'Langue' },
  en: { titre: 'Centering analysis', recto: 'Front', verso: 'Back', auMieux: 'at best', cta: 'Analyze your card for free', scan: 'Scan my collection', compte: 'Create my free account', expire: 'Link valid until {0}', note: 'Opinion based on a photo, within 1 or 2 points.', desc: 'Centering measured with CallIt!: front, back and estimated grade.', colT: 'Your whole collection', colS: 'Scan your cards one by one or a whole binder: CallIt! recognizes them and tracks their value.', barS: 'One photo is enough.', langue: 'Language' },
  it: { titre: 'Analisi della centratura', recto: 'Fronte', verso: 'Retro', auMieux: 'al massimo', cta: 'Analizza la tua carta gratis', scan: 'Scansiona la mia collezione', compte: 'Crea il mio account gratuito', expire: 'Link valido fino al {0}', note: 'Parere su foto, con 1 o 2 punti di margine.', desc: 'Centratura misurata con CallIt!: fronte, retro e voto stimato.', colT: 'Tutta la tua collezione', colS: 'Scansiona le tue carte una per una o un intero raccoglitore: CallIt! le riconosce e ne segue il valore.', barS: 'Basta una foto.', langue: 'Lingua' },
  es: { titre: 'Análisis del centrado', recto: 'Anverso', verso: 'Reverso', auMieux: 'como máximo', cta: 'Analiza tu carta gratis', scan: 'Escanear mi colección', compte: 'Crear mi cuenta gratuita', expire: 'Enlace válido hasta el {0}', note: 'Opinión sobre foto, con 1 o 2 puntos de margen.', desc: 'Centrado medido con CallIt!: anverso, reverso y nota estimada.', colT: 'Toda tu colección', colS: 'Escanea tus cartas una a una o un archivador entero: CallIt! las reconoce y sigue su valor.', barS: 'Basta una foto.', langue: 'Idioma' },
  de: { titre: 'Zentrierungsanalyse', recto: 'Vorderseite', verso: 'Rückseite', auMieux: 'höchstens', cta: 'Analysiere deine Karte kostenlos', scan: 'Meine Sammlung scannen', compte: 'Kostenloses Konto erstellen', expire: 'Link gültig bis {0}', note: 'Einschätzung anhand eines Fotos, auf 1 bis 2 Punkte genau.', desc: 'Zentrierung gemessen mit CallIt!: Vorder- und Rückseite und geschätzte Note.', colT: 'Deine ganze Sammlung', colS: 'Scanne deine Karten einzeln oder einen ganzen Ordner: CallIt! erkennt sie und verfolgt ihren Wert.', barS: 'Ein Foto genügt.', langue: 'Sprache' },
};
const LOCALE = { fr: 'fr-FR', en: 'en-GB', it: 'it-IT', es: 'es-ES', de: 'de-DE' };

const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'access-control-allow-origin': '*' } });
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const texte = (s, n) => typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n) : '';
const pct = x => Number.isFinite(+x) && +x >= 0 && +x <= 100 ? Math.round(+x * 10) / 10 : null;
const note = x => Number.isFinite(+x) && +x >= 0 && +x <= 10 ? +x : null;
const hasard = (n, jeu) => { const a = crypto.getRandomValues(new Uint8Array(n)); return Array.from(a, b => jeu[b % jeu.length]).join(''); };
function nouveauCode() {
  const c = hasard(4, TOUT).split(''); c.splice(hasard(1, '01234')[0] | 0, 0, hasard(1, CHIFFRES)); return c.join('');
}
async function empreinte(s) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(h), b => b.toString(16).padStart(2, '0')).join('');
}
const face = f => f && typeof f === 'object' && pct(f.lr) != null && pct(f.tb) != null ? { lr: pct(f.lr), tb: pct(f.tb) } : null;

async function lire(env, code) {
  const o = await env.R2.get(DOSSIER + code + '.json');
  if (!o) return null;
  const a = await o.json().catch(() => null);
  if (!a || !a.exp || a.exp < Date.now()) return null;
  return a;
}

// Trop d'envois depuis la même adresse : refusé (règle Cloudflare « ratelimits », wrangler.jsonc)
async function tropDEnvois(env, request) {
  if (!env.LIMITE) return false;
  const ip = request.headers.get('cf-connecting-ip') || 'inconnu';
  try { const { success } = await env.LIMITE.limit({ key: ip }); return !success; } catch (e) { return false; }
}

async function creer(request, env) {
  if (await tropDEnvois(env, request)) return json({ erreur: 'trop' }, 429);
  const brut = await request.text();
  if (brut.length > 8000) return json({ erreur: 'trop gros' }, 413);
  let d; try { d = JSON.parse(brut); } catch (e) { return json({ erreur: 'illisible' }, 400); }
  const recto = face(d.recto), verso = face(d.verso);
  if (!recto && !verso) return json({ erreur: 'aucune mesure' }, 400);
  const a = {
    v: 1, cree: Date.now(), exp: Date.now() + DUREE,
    lang: LANGUES.includes(d.lang) ? d.lang : 'fr',
    nom: texte(d.nom, 80), info: texte(d.info, 120), recto, verso,
    psa: note(d.psa), bgs: d.bgs === 0 ? 0 : note(d.bgs), cgc: d.cgc === 0 ? 0 : note(d.cgc),
    image: false,
  };
  const cle = hasard(24, TOUT);
  a.cle = await empreinte(cle);
  let code = '';
  for (let n = 0; n < 6 && !code; n++) { const c = nouveauCode(); if (!(await env.R2.head(DOSSIER + c + '.json'))) code = c; }
  if (!code) return json({ erreur: 'réessaie' }, 503);
  await env.R2.put(DOSSIER + code + '.json', JSON.stringify(a), { httpMetadata: { contentType: 'application/json' }, customMetadata: { exp: String(a.exp) } });
  return json({ code, url: 'https://callitcards.com/' + code, cle, exp: a.exp });
}

async function mettreImage(request, env, code) {
  if (await tropDEnvois(env, request)) return json({ erreur: 'trop' }, 429);
  const a = await lire(env, code);
  const url = new URL(request.url);
  if (!a || a.cle !== await empreinte(url.searchParams.get('cle') || '')) return json({ erreur: 'introuvable' }, 404);
  const buf = await request.arrayBuffer();
  const b = new Uint8Array(buf, 0, Math.min(3, buf.byteLength));
  if (buf.byteLength > IMAGE_MAX || buf.byteLength < 1000 || b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) return json({ erreur: 'image refusée' }, 400);
  const lang = url.searchParams.get('lang');
  await env.R2.put(DOSSIER + code + '.jpg', buf, { httpMetadata: { contentType: 'image/jpeg' }, customMetadata: { exp: String(a.exp) } });
  a.image = Date.now(); if (LANGUES.includes(lang)) a.lang = lang;
  await env.R2.put(DOSSIER + code + '.json', JSON.stringify(a), { httpMetadata: { contentType: 'application/json' }, customMetadata: { exp: String(a.exp) } });
  return json({ ok: true });
}

async function servirImage(request, env, code) {
  const o = await env.R2.get(DOSSIER + code + '.jpg');
  if (!o || +(o.customMetadata || {}).exp < Date.now()) return new Response('Lien expiré', { status: 404 });
  return new Response(request.method === 'HEAD' ? null : o.body, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=3600', etag: o.httpEtag } });
}

function langueDe(request, url, a) {
  const q = url.searchParams.get('l');
  if (LANGUES.includes(q)) return q;
  if (a && a.lang) return a.lang;
  const al = (request.headers.get('accept-language') || '').toLowerCase().slice(0, 2);
  return LANGUES.includes(al) ? al : 'fr';
}


function page(a, code, lang) {
  const t = T[lang], fmt = (n, ...v) => n.replace(/\{(\d)\}/g, (m, i) => v[+i]);
  const nb = x => lang === 'en' ? String(x) : String(x).replace('.', ',');
  const mes = f => `${nb(f.lr)}/${nb(Math.round((100 - f.lr) * 10) / 10)} · ${nb(f.tb)}/${nb(Math.round((100 - f.tb) * 10) / 10)}`;
  const fin = new Intl.DateTimeFormat(LOCALE[lang], { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }).format(new Date(a.exp));
  const titre = a.nom ? `${a.nom} · ${t.titre}` : t.titre;
  const img = a.image ? `/a/${code}.jpg?v=${a.image}` : '';
  const notes = [a.psa != null ? `<span><b>PSA ${nb(a.psa)}</b> ${esc(t.auMieux)}</span>` : '', a.bgs ? `<span><b>BGS ${nb(a.bgs)}</b></span>` : '', a.cgc ? `<span><b>CGC ${nb(a.cgc)}</b></span>` : ''].filter(Boolean).join('');
  const langues = LANGUES.map(l => `<a href="?l=${l}" class="chip${l === lang ? ' on' : ''}" hreflang="${l}" lang="${l}"${l === lang ? ' aria-current="true"' : ''}>${l.toUpperCase()}</a>`).join('');
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(titre)} · CallIt!</title><meta name="description" content="${esc(t.desc)}"><meta name="robots" content="noindex">
<meta property="og:type" content="website"><meta property="og:site_name" content="CallIt!"><meta property="og:title" content="${esc(titre)}"><meta property="og:description" content="${esc(t.desc)}"><meta property="og:url" content="https://callitcards.com/${code}">
${img ? `<meta property="og:image" content="https://callitcards.com${img}"><meta property="og:image:width" content="1080"><meta property="og:image:height" content="1350"><meta name="twitter:card" content="summary_large_image">` : ''}
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
<div><h1>${esc(a.nom || t.titre)}</h1><div class="sub">${esc([a.nom ? t.titre : '', a.info].filter(Boolean).join(' · '))}</div></div>
${img ? `<div class="shot"><img src="${img}" width="1080" height="1350" alt="${esc(titre)}"></div>` : ''}
<div class="res">${a.recto ? `<span><span class="m">${esc(t.recto)}</span> <b>${mes(a.recto)}</b></span>` : ''}${a.verso ? `<span><span class="m">${esc(t.verso)}</span> <b>${mes(a.verso)}</b></span>` : ''}${notes}</div>
<div class="cta"><b>${esc(t.colT)}</b><p>${esc(t.colS)}</p><div class="btns"><a class="btn" href="/#/scan">${esc(t.scan)}</a><a class="small" href="/#/reglages">${esc(t.compte)}</a></div></div>
<div class="foot small"><span>${esc(t.note)}</span><span>${esc(fmt(t.expire, fin))}</span></div>
<div class="bar"><a class="btn p" href="/#/centrage">${esc(t.cta)}</a><span class="small">${esc(t.barS)}</span></div>
</main></body></html>`;
}

// Renvoie une réponse si la requête concerne une analyse, sinon null.
export async function analyse(request, env, url) {
  const p = url.pathname, m = request.method;
  if (p === '/api/analyse' || p.startsWith('/api/analyse/')) {
    if (m === 'OPTIONS') return new Response(null, { headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, PUT', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400' } });
    if (p === '/api/analyse' && m === 'POST') return creer(request, env);
    const i = p.match(/^\/api\/analyse\/([a-z2-9]{5})\/image$/);
    if (i && m === 'PUT') return mettreImage(request, env, i[1]);
    return json({ erreur: 'inconnu' }, 404);
  }
  const im = p.match(/^\/a\/([a-z2-9]{5})\.jpg$/);
  if (im && (m === 'GET' || m === 'HEAD')) return servirImage(request, env, im[1]);
  const c = p.match(CODE);
  if (c && (m === 'GET' || m === 'HEAD')) {
    const a = await lire(env, c[1]);
    // Expiré ou inconnu : l'accueil, avec l'invitation à analyser sa carte (pas de page d'erreur)
    if (!a) return Response.redirect(url.origin + '/?lien=expire', 302);
    const lang = langueDe(request, url, a);
    return new Response(request.method === 'HEAD' ? null : page(a, c[1], lang), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=60', 'content-language': lang, vary: 'accept-language' } });
  }
  return null;
}

// Chaque heure : efface les analyses de plus de 48 h
export async function nettoyer(env) {
  let cursor, n = 0;
  do {
    const l = await env.R2.list({ prefix: DOSSIER, cursor, include: ['customMetadata'], limit: 1000 });
    const vieux = l.objects.filter(o => { const e = +(o.customMetadata || {}).exp; return (e || o.uploaded.getTime() + DUREE) < Date.now(); }).map(o => o.key);
    if (vieux.length) { await env.R2.delete(vieux); n += vieux.length; }
    cursor = l.truncated ? l.cursor : undefined;
  } while (cursor);
  return n;
}
