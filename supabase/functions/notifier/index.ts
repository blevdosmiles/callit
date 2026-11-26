// CallIt! · Fonction Supabase « notifier » : envoie une notification sur les téléphones d'un ou plusieurs comptes.
// Appelée par les autres fonctions du serveur (alertes « J'ai trouvé ton Bulbizarre ! », prix visé atteint…),
// jamais par l'appli : il faut la clé de service de Supabase.
//
// Corps : { "comptes": ["uuid", …], "titre": "J'ai trouvé ton Bulbizarre !", "texte": "42 € · cote 55 € · ⏱ 4 min", "lien": "#/carte/…" }
// Secret à mettre dans Supabase (Edge Functions → Secrets) : FIREBASE_COMPTE_SERVICE = le fichier JSON du compte de
// service Firebase (Paramètres du projet → Comptes de service → Générer une clé). Il ne va jamais dans le dépôt.
// Déploiement : supabase functions deploy notifier
import { createClient } from 'npm:@supabase/supabase-js@2';

const URL_SB = Deno.env.get('SUPABASE_URL')!;
const CLE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const sb = createClient(URL_SB, CLE_SERVICE);

// Jeton d'accès Google (valable 1 h) signé avec la clé du compte de service
let acces: { jeton: string; fin: number } | null = null;
const b64 = (b: ArrayBuffer | Uint8Array | string) => {
  const u = typeof b === 'string' ? new TextEncoder().encode(b) : new Uint8Array(b);
  return btoa(String.fromCharCode(...u)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
};
async function jetonGoogle(sa: { client_email: string; private_key: string }) {
  if (acces && acces.fin > Date.now() + 60_000) return acces.jeton;
  const now = Math.floor(Date.now() / 1000);
  const tete = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const corps = b64(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const pem = sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
  const cle = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(pem), c => c.charCodeAt(0)), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cle, new TextEncoder().encode(tete + '.' + corps));
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${tete}.${corps}.${b64(sig)}` }) });
  const j = await r.json(); if (!j.access_token) throw new Error('Google refuse la clé du compte de service');
  acces = { jeton: j.access_token, fin: Date.now() + (j.expires_in || 3600) * 1000 };
  return acces.jeton;
}

Deno.serve(async req => {
  if (req.method !== 'POST') return new Response('POST seulement', { status: 405 });
  if ((req.headers.get('Authorization') || '') !== `Bearer ${CLE_SERVICE}`) return new Response('Réservé au serveur', { status: 401 });
  const brut = Deno.env.get('FIREBASE_COMPTE_SERVICE');
  if (!brut) return new Response('Firebase pas encore configuré', { status: 503 });
  const sa = JSON.parse(brut);
  const { comptes, titre, texte, lien } = await req.json();
  if (!Array.isArray(comptes) || !comptes.length || !titre) return new Response('comptes et titre obligatoires', { status: 400 });

  const { data: apps, error } = await sb.from('appareils').select('user_id, jeton').in('user_id', comptes);
  if (error) return new Response(error.message, { status: 500 });
  const jeton = await jetonGoogle(sa);
  let envoyees = 0; const perimes: string[] = [];
  for (const a of apps || []) {
    const r = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
      method: 'POST', headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: { token: a.jeton, notification: { title: titre, body: texte || '' }, data: lien ? { lien } : {}, android: { priority: 'high' } } })
    });
    if (r.ok) envoyees++;
    else if (r.status === 404 || r.status === 400) perimes.push(a.jeton); // téléphone désinstallé ou jeton changé
  }
  if (perimes.length) await sb.from('appareils').delete().in('jeton', perimes);
  return Response.json({ envoyees, retirees: perimes.length });
});
