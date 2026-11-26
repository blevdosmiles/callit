/* CallIt! · appli web (PWA), sans dépendance.
   Données : data/cards.json (TCGdex + guide de prix public Cardmarket), data/rates.json (taux BCE).
   Tout ce que l'utilisateur saisit reste sur son appareil (localStorage). */
'use strict';

/* ---------- Réglages et stockage local ---------- */
const STORE = 'callit.v1.';
const load = (k, d) => { try { const v = localStorage.getItem(STORE + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
const save = (k, v) => { try { localStorage.setItem(STORE + k, JSON.stringify(v)); } catch (e) { toast("Impossible d'enregistrer sur cet appareil"); } };
// Sécurité : les éléments de la collection peuvent venir d'un fichier importé ou du compte. On remet chaque champ
// au bon type (nombres pour les quantités et prix, identifiants simples) avant de les afficher.
const SAFE_ID = v => String(v == null ? '' : v).replace(/[^\w.:-]/g, '').slice(0, 80);
const NUMV = (v, d) => { const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : d; };
function cleanRow(o, kind) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  const r = Object.assign({}, o); r.id = SAFE_ID(o.id); if (!r.id) return null;
  for (const k of ['folder', 'from']) if (k in r) r[k] = SAFE_ID(r[k]);
  for (const k of ['lang', 'cond', 'cur']) if (k in r && r[k] != null) r[k] = String(r[k]).replace(/[^\w-]/g, '').slice(0, 12);
  if ('qty' in r) r.qty = Math.max(1, Math.round(NUMV(r.qty, 1)));
  for (const k of ['paid', 'max', 'val', 'goal']) if (k in r) r[k] = r[k] == null || r[k] === '' ? null : NUMV(r[k], null);
  for (const k of ['rev', 'sell']) if (k in r) r[k] = r[k] === true;
  if ('pid' in r && typeof r.pid !== 'number') r.pid = SAFE_ID(r.pid);
  for (const k of ['key', 'was', 'grader', 'grade', 'date', 'note', 'name', 'added', 'created', 'game']) if (k in r && r[k] != null && typeof r[k] !== 'string') r[k] = String(r[k]);
  if (kind === 'deck') r.list = Array.isArray(o.list) ? o.list.filter(Array.isArray).map(x => [Math.max(0, Math.round(NUMV(x[0], 1))), ...x.slice(1, 6).map(v => v == null ? v : String(v))]) : [];
  return r;
}
const cleanList = (a, kind) => Array.isArray(a) ? a.map(x => cleanRow(x, kind)).filter(Boolean) : [];

const LANGS = [
  ['fr', 'Français', 'FR'], ['it', 'Italien', 'IT'], ['en', 'Anglais', 'EN'], ['es', 'Espagnol', 'ES'],
  ['de', 'Allemand', 'DE'], ['pt', 'Portugais', 'PT'], ['ja', 'Japonais', 'JA'], ['ko', 'Coréen', 'KO'],
  ['zh-tw', 'Chinois traditionnel', 'ZH-T'], ['zh-cn', 'Chinois simplifié', 'ZH-S'], ['th', 'Thaï', 'TH'], ['id', 'Indonésien', 'ID']
];
const LANG = Object.fromEntries(LANGS.map(([c, n, s]) => [c, { name: n, short: s }]));
const LANG_OF = { en: 'anglaise', fr: 'française', de: 'allemande', es: 'espagnole', it: 'italienne', pt: 'portugaise', ja: 'japonaise', ko: 'coréenne', 'zh-tw': 'chinoise (trad.)', 'zh-cn': 'chinoise (simpl.)', th: 'thaïe', id: 'indonésienne' };
const ASIA = new Set(['ja', 'ko', 'zh-tw', 'zh-cn', 'th', 'id']);
const ASIA_NOTE = 'Vendue surtout hors Europe : port et douane en plus';

const CONDS = [['MT', 'Mint'], ['NM', 'Near Mint'], ['EX', 'Excellent'], ['GD', 'Good'], ['LP', 'Light Played'], ['PL', 'Played'], ['PO', 'Poor']];
const COND_RANK = Object.fromEntries(CONDS.map(([c], i) => [c, i]));
const GRADERS = ['PSA', 'CGC', 'BGS', 'PCA', 'AP Grading', 'Autre'];

// Pays → devise (la Bulgarie est passée à l'euro le 1er janvier 2026)
const COUNTRIES = [
  ['FR', 'France', 'EUR', 'fr'], ['IT', 'Italie', 'EUR', 'it'], ['BE', 'Belgique', 'EUR', 'befr'], ['LU', 'Luxembourg', 'EUR', 'fr'],
  ['DE', 'Allemagne', 'EUR', 'de'], ['AT', 'Autriche', 'EUR', 'at'], ['ES', 'Espagne', 'EUR', 'es'], ['PT', 'Portugal', 'EUR', 'es'],
  ['NL', 'Pays-Bas', 'EUR', 'nl'], ['IE', 'Irlande', 'EUR', 'ie'], ['FI', 'Finlande', 'EUR', 'de'], ['GR', 'Grèce', 'EUR', 'de'],
  ['HR', 'Croatie', 'EUR', 'de'], ['SI', 'Slovénie', 'EUR', 'de'], ['SK', 'Slovaquie', 'EUR', 'de'], ['EE', 'Estonie', 'EUR', 'de'],
  ['LV', 'Lettonie', 'EUR', 'de'], ['LT', 'Lituanie', 'EUR', 'de'], ['MT', 'Malte', 'EUR', 'co.uk'], ['CY', 'Chypre', 'EUR', 'co.uk'],
  ['BG', 'Bulgarie', 'EUR', 'de'], ['MC', 'Monaco', 'EUR', 'fr'],
  ['GB', 'Royaume-Uni', 'GBP', 'co.uk'], ['CH', 'Suisse', 'CHF', 'ch'], ['SE', 'Suède', 'SEK', 'de'], ['DK', 'Danemark', 'DKK', 'de'],
  ['NO', 'Norvège', 'NOK', 'de'], ['PL', 'Pologne', 'PLN', 'pl'], ['CZ', 'Tchéquie', 'CZK', 'de'], ['HU', 'Hongrie', 'HUF', 'de'],
  ['RO', 'Roumanie', 'RON', 'de'], ['IS', 'Islande', 'ISK', 'co.uk'], ['US', 'États-Unis', 'USD', 'com'], ['CA', 'Canada', 'CAD', 'ca'],
  ['JP', 'Japon', 'JPY', 'com'], ['AU', 'Australie', 'AUD', 'com.au']
];
const COUNTRY = Object.fromEntries(COUNTRIES.map(([c, n, cur, eb]) => [c, { name: n, cur, ebay: eb }]));

function guessCountry() {
  const tags = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || LOCALE]);
  for (const t of tags) { const m = /-([A-Za-z]{2})\b/.exec(t); if (m && COUNTRY[m[1].toUpperCase()]) return m[1].toUpperCase(); }
  const l = (tags[0] || 'fr').slice(0, 2).toLowerCase();
  return { it: 'IT', de: 'DE', es: 'ES', pt: 'PT', nl: 'NL', en: 'GB', pl: 'PL', sv: 'SE', da: 'DK' }[l] || 'FR';
}

const S = Object.assign({
  game: 'pkm',                // jeu affiché : 'pkm' | 'mtg' | 'ygo' | 'op'
  face: null,                 // 'galerie' | 'marche' (choisi au premier lancement)
  country: guessCountry(),
  currency: 'auto',           // 'auto' = devise du pays
  nameLang: ['fr', 'de', 'es', 'it'].includes(UI) ? UI : 'en', // langue des noms de cartes (suit la langue de l'appli au départ)
  excluded: [],               // langues exclues
  exclSearch: true,           // appliquer l'exclusion à la recherche et à la Galerie
  minCond: 'EX',              // état minimum pour acheter (liens Cardmarket) ; la collection montre toujours tout
  sort: 'pert',
  theme: 'auto'              // 'auto' | 'clair' | 'sombre'
}, load('settings', {}));
const saveS = () => save('settings', S);
// Langues de départ : la sienne + anglais + japonais ; le reste s'ajoute avec « + »
const defaultLangs = () => [...new Set([S.nameLang, 'en', 'ja'])].filter(l => LANG[l]);
const presetLangs = () => { if (!S.langsSet && !S.face) S.excluded = LANGS.map(l => l[0]).filter(c => !defaultLangs().includes(c)); };
let collection = cleanList(load('collection', []), 'card');   // [{id, key, lang, cond, rev, grader, grade, val, qty, paid, cur, date, note}]
let anyLang = new Set(load('anyLang', [])); // cartes « n'importe quelle langue me va »
const saveCol = () => { save('collection', collection); syncSoon(); };

/* ---------- Thème clair / sombre ---------- */
const darkMQ = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
function applyTheme() {
  const dark = S.theme === 'sombre' || (S.theme === 'auto' && darkMQ && darkMQ.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = dark ? '#18181b' : (S.face === 'marche' ? '#ffffff' : '#ebebe8');
}
applyTheme();
if (darkMQ) (darkMQ.addEventListener ? darkMQ.addEventListener('change', applyTheme) : darkMQ.addListener(applyTheme));

/* ---------- Données ---------- */
/* ---------- Jeux de cartes ---------- */
// Pokémon : data/cards.json (TCGdex). Autres jeux : data/jeux/<code>.json (même format), préparés chaque semaine
// par .github/workflows/jeux.yml. cm = chemin du jeu sur Cardmarket.
const GAMES = {
  pkm: { name: 'Pokémon', file: 'data/cards.json', cm: 'Pokemon', ebay: 'pokemon', size: '63 × 88 mm' },
  mtg: { name: 'Magic', long: 'Magic: The Gathering', file: 'data/jeux/mtg.json', cm: 'Magic', ebay: 'mtg', size: '63 × 88 mm' },
  ygo: { name: 'Yu-Gi-Oh!', file: 'data/jeux/ygo.json', cm: 'YuGiOh', ebay: 'yugioh', size: '59 × 86 mm' },
  op: { name: 'One Piece', long: 'One Piece Card Game', file: 'data/jeux/op.json', cm: 'OnePiece', ebay: 'one piece', size: '63 × 88 mm' }
};
if (!GAMES[S.game]) S.game = 'pkm';
const GAME = S.game, PKM = GAME === 'pkm', GI = GAMES[GAME];
// Clé d'une carte d'un autre jeu que celui chargé (« mtg:… », « en:… » pour Pokémon) : on la garde telle quelle
const otherGameKey = k => !!k && (PKM ? /^(mtg|ygo|op):/.test(k) : /^(en|ja|mtg|ygo|op):/.test(k) && !k.startsWith(GAME + ':'));
const knownKey = k => BYKEY.has(k) || otherGameKey(k);
const SRC = () => (DB && DB.priceSource) || 'Cardmarket';
function gameChips() {
  return `<div class="chips scroll gamechips" role="group" aria-label="Jeu de cartes">${Object.entries(GAMES).map(([k, g]) => `<button class="chip${k === GAME ? ' on' : ''}" data-act="gamechip" data-v="${k}" aria-pressed="${k === GAME}">${esc(g.name)}</button>`).join('')}</div>`;
}
function gameSwitch(cls = '') {
  return `<label class="gamesel ${cls}"><span class="sr">Jeu de cartes</span><select data-act="game" aria-label="Jeu de cartes">${Object.entries(GAMES).map(([k, g]) => `<option value="${k}" ${k === GAME ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select></label>`;
}
let DB = null, CARDS = [], BYKEY = new Map(), RATES = { rates: { EUR: 1 }, approx: true, date: '' };

const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’`]/g, "'").toLowerCase();
const pl = (n, one, many) => n + ' ' + (n > 1 ? many : one); // « 1 carte », « 2 cartes »
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* Prix du jour : data/prix.json (cartes de la base) et data/prix_plus.json (cartes hors base, produits scellés),
   refaits chaque matin à partir du guide de prix Cardmarket (outils/releve_prix.py).
   Les prix écrits dans data/cards.json datent du jour où la base a été faite : ils ne servent plus que de secours. */
let PRIX = null, PRIX_PLUS = null, prixPlusLoading = null;
function readPrices(j) {
  if (!j || !Array.isArray(j.ids) || !j.v || !j.guide) return null;
  const pos = new Map(); j.ids.forEach((id, k) => pos.set(id, k));
  const val = (f, k) => { const col = j.v[f], x = col ? col[k] : null; return x == null ? null : x / 100; }; // centimes → euros
  return { jour: j.jour, guide: j.guide, has: id => pos.has(id), get: (id, f) => (pos.has(id) ? val(f, pos.get(id)) : null), row: (id, fields) => (pos.has(id) ? fields.map(f => val(f, pos.get(id))) : null) };
}
const loadPricesPlus = () => prixPlusLoading || (prixPlusLoading = fetch('data/prix_plus.json').then(r => r.ok ? r.json() : null).then(readPrices).then(pp => (PRIX_PLUS = pp)).catch(() => null));
// Date des prix affichés : celle du relevé du jour, sinon celle de la base
const priceDate = () => (PRIX && PRIX.guide) || (DB && DB.generated) || '';

async function loadData() {
  const [db, rates, prix] = await Promise.all([
    fetch(GI.file).then(r => { if (!r.ok) throw new Error('cards ' + r.status); return r.json(); }),
    fetch('data/rates.json').then(r => r.json()).catch(() => null),
    PKM ? fetch('data/prix.json').then(r => r.ok ? r.json() : null).catch(() => null) : null
  ]);
  if (rates) RATES = rates;
  DB = db;
  const pj = PKM ? readPrices(prix) : null;
  if (pj && pj.guide.slice(0, 19) >= String(db.generated || '').slice(0, 19)) { // jamais un relevé plus vieux que la base
    PRIX = pj;
    for (const c of db.cards) { const p = c.cm ? pj.row(c.cm, db.priceFields) : null; if (p) c.p = p; }
  }
  if (!PKM) { // autres jeux : traités comme des cartes « occidentales », clé préfixée par le jeu
    db.species = {}; db.priceFields = db.priceFields.map(f => f === 'trendFoil' ? 'trendHolo' : f);
    for (const s of db.sets) { s.game = s.reg; s.reg = 'en'; }
  }
  const regLangs = { en: ['en', 'fr', 'de', 'es', 'it', 'pt'], ja: ['ja', 'ko', 'zh-tw', 'zh-cn', 'th', 'id'] };
  CARDS = db.cards.map((c, i) => {
    const set = db.sets[c.s];
    const langs = PKM ? regLangs[set.reg].filter(l => c.n[l]) : (c.lg ? [c.lg] : Object.keys(c.n).filter(l => LANG[l]));
    const hay = norm([...Object.values(c.n), NAME_ALIAS[c.n.en] || '', ...Object.values(set.name), set.id, c.i != null ? db.ills[c.i] : '', c.dex ? db.species[c.dex] : ''].join(' | '));
    const card = Object.assign({}, c, { idx: i, set, langs, hay, key: (PKM ? set.reg : GAME) + ':' + set.id + ':' + c.num, numN: String(c.num).replace(/^0+(?=\d)/, '').toLowerCase() });
    BYKEY.set(card.key, card);
    return card;
  });
  if (PKM) { const vus = new Set(); DUP_CM = new Set(); for (const c of db.cards) if (c.cm) { if (vus.has(c.cm)) DUP_CM.add(c.cm); else vus.add(c.cm); } }
  // Une carte « hors base » (clé cm:numéro) a pu entrer dans la base depuis : collections et envies la retrouvent sous son ancienne clé
  if (PKM) for (const c of CARDS) if (c.cm && !BYKEY.has('cm:' + c.cm)) BYKEY.set('cm:' + c.cm, c);
  if (PKM) { migrateKeys(); loadCmExtra(); }
  // Si les taux livrés sont approximatifs, on essaie ceux du jour (BCE via frankfurter.app)
  if (RATES.approx) {
    fetch('https://api.frankfurter.app/latest?from=EUR').then(r => r.json()).then(j => {
      if (j && j.rates) { RATES = { date: j.date, approx: false, source: 'Banque centrale européenne', rates: Object.assign({ EUR: 1 }, j.rates) }; render(); }
    }).catch(() => {});
  }
}

// Un exemplaire ou une envie notés quand la carte était « hors base » (clé cm:numéro) : dès que la carte est dans la base,
// on leur donne sa vraie clé. Sans cela, la carte ne s'affiche pas comme possédée sur sa fiche.
// L'ancienne clé reste notée (was) : si le lien entre la carte et son produit Cardmarket est corrigé un jour, on saura d'où elle venait.
function migrateKeys() {
  const fix = list => { let n = 0; for (const it of list) { const c = it && /^cm:/.test(it.key || '') ? BYKEY.get(it.key) : null; if (c && c.key !== it.key) { it.was = it.key; it.key = c.key; n++; } } return n; };
  if (fix(collection)) saveCol();
  if (fix(wish.items)) saveWish();
}

/* Cartes vendues sur Cardmarket mais absentes de TCGdex (data/cm_extra.json) : nom, cote et lien direct, sans image */
let cmExtraN = 0;
function loadCmExtra() {
  Promise.all([fetch('data/cm_extra.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null), loadPricesPlus()]).then(([j, pp]) => {
    if (!j || !j.items || !DB) return;
    const sets = new Map();
    const setOf = e => { if (!sets.has(e)) { const st = { id: 'cm' + e, reg: 'en', x: true, name: { en: (j.exps && j.exps[e]) || 'Promos et autres (Cardmarket)' }, date: '', count: 0 }; DB.sets.push(st); sets.set(e, st); } return sets.get(e); };
    for (const [id, name, att, e, low, trend, avg30, avg7, avg1] of j.items) {
      if (BYKEY.has('cm:' + id)) continue; // déjà dans la base : pas de doublon tant que la liste hors base n'est pas refaite
      const set = setOf(e); const vals = { low, trend, avg30, avg7, avg1, trendHolo: 0 };
      if (pp && pp.has(id)) for (const f of ['low', 'trend', 'avg30', 'avg7', 'avg1', 'trendHolo']) vals[f] = pp.get(id, f); // prix du jour
      const c = { n: { en: name }, att, num: '', s: DB.sets.indexOf(set), cm: id, x: true, p: DB.priceFields.map(f => vals[f] || 0), idx: -1, set, langs: [],
        hay: norm(name + ' | ' + (NAME_ALIAS[name] || '') + ' | ' + set.name.en + ' | ' + att), key: 'cm:' + id, numN: '' };
      CARDS.push(c); BYKEY.set(c.key, c); cmExtraN++;
    }
    render();
  }).catch(() => {});
}

/* ---------- Prix et devise ---------- */
const userCur = () => S.currency !== 'auto' ? S.currency : (COUNTRY[S.country] || COUNTRY.FR).cur;
const fmtCache = {};
function money(v, cur, dec) {
  cur = cur || userCur();
  if (v == null || isNaN(v)) return '—';
  if (cur === 'JPY' || cur === 'HUF' || cur === 'ISK') dec = 0;
  else if (dec == null) dec = Math.abs(v) >= 1000 ? 0 : 2;
  const k = cur + dec;
  if (!fmtCache[k]) fmtCache[k] = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: cur, minimumFractionDigits: dec, maximumFractionDigits: dec, currencyDisplay: 'narrowSymbol' });
  return fmtCache[k].format(v);
}
const rate = cur => (RATES.rates || {})[cur];
// Convertit des euros (cote Cardmarket) dans la devise de l'utilisateur
function eur(v) { const cur = userCur(); const r = rate(cur); if (v == null) return '—'; return r ? money(v * r, cur) : money(v, 'EUR'); }
const toUser = v => { const r = rate(userCur()); return v == null ? null : (r ? v * r : v); };
const fromUserToEur = v => { const r = rate(userCur()); return r ? v / r : v; };
const eurNote = v => userCur() === 'EUR' || !rate(userCur()) ? '' : money(v, 'EUR') + ' sur Cardmarket';
const pf = (c, f) => (c.p ? c.p[DB.priceFields.indexOf(f)] : null);

/* <cote> Cote CallIt! : une seule règle pour toute l'appli, la même que cote_mesures() dans outils/releve_prix.py
   (outils/test_cote.py vérifie que les deux donnent les mêmes résultats, et mesure la règle sur les archives).
   Prix retenu : la plus basse des moyennes de vente sur 7 et 30 jours, jamais sous l'offre la moins chère.
   Mesuré le 25/11/2026 sur 4 369 cartes vendues entre le 23 et le 25/11 : elle tombe plus près de la vente suivante
   que la « tendance » de Cardmarket (erreur médiane 21 % contre 25 %), parce qu'une vente isolée très chère ne la fait pas monter. */
const COTE = { ARTEFACT: 0.02, ACCORD: 1.25, ECART: 2, TOLERANCE: 0.5, BAS: [5, 10], BAS_10: [3, 5], FOURCHETTE: [[0.5, 1.75], [0.65, 1.4], [0.75, 1.25]], RANG: { moy: 3, tendance: 2, bas: 1 } };
// Cote d'un jeu de mesures : { v, lo, hi, conf (0 faible, 1 moyenne, 2 bonne), src } ou null
function coteDe(low, trend, a1, a7, a30) {
  const P = v => (typeof v === 'number' && v > 0 ? v : null);
  low = P(low); trend = P(trend); a1 = P(a1); a7 = P(a7); a30 = P(a30);
  const moy = [a1, a7, a30].filter(x => x);
  let v, src;
  if (a7 && a30) { v = Math.min(a7, a30); src = 'moy'; if (low && low > v) v = Math.min(low, Math.max(a7, a30)); } // jamais sous l'offre la moins chère, tant que les ventes récentes vont jusque-là
  else if (a7 || a30) { v = a7 || a30; src = 'moy'; }
  else if (a1) { v = a1; src = 'moy'; }
  else if (trend && trend > COTE.ARTEFACT) { v = trend; src = 'tendance'; } // 0,02 : ce que Cardmarket affiche quand il ne calcule pas de tendance
  else if (low) { v = low; src = 'bas'; }
  else return null;
  // Trois doutes, notés 0 (aucun), 1 ou 2 : la confiance suit le plus fort
  let ventes = 2, offres = 0, cher = 0;
  if (moy.length >= 2) { const mx = Math.max(...moy), mn = Math.min(...moy), e = mx / mn; ventes = e < COTE.ACCORD || mx - mn < COTE.TOLERANCE ? 0 : e < COTE.ECART ? 1 : 2; } // les dernières ventes ne sont pas au même prix
  if (low && v >= 1) { // des offres nettement en dessous de la cote (cartes abîmées, autres langues)
    const r = v / low, [moyen, faible] = v >= 10 ? COTE.BAS_10 : COTE.BAS;
    offres = r < moyen ? 0 : r < faible ? 1 : 2;
    if (ventes === 1 && r < COTE.ECART) ventes = 0; // ventes un peu dispersées, mais rien en vente à moitié prix : la cote tient
  }
  if (low && low - v >= COTE.TOLERANCE) { const r = low / v; cher = r < COTE.ACCORD ? 0 : r < COTE.ECART ? 1 : 2; } // plus rien en vente à ce prix : les offres commencent au-dessus
  const conf = 2 - Math.max(ventes, offres, cher), [bas, haut] = COTE.FOURCHETTE[conf]; // fourchette : la vente suivante y tombe 3 fois sur 4
  return { v, lo: Math.min(v * bas, ...moy), hi: Math.max(v * haut, ...moy), conf, src };
}
// Cote d'un produit : ses mesures normales, sauf si seules les mesures holo ou reverse disent mieux
function coteProduit(normal, holo) {
  const n = coteDe(...normal), h = coteDe(...holo);
  if (n && (!h || COTE.RANG[n.src] >= COTE.RANG[h.src])) return n;
  if (h) { h.holo = true; return h; }
  return n;
}
/* </cote> */
// Mesures holo ou reverse d'une carte : elles sont dans le relevé du jour (la base ne garde que la tendance)
function holoM(c) {
  const src = c.x ? PRIX_PLUS : PRIX, g = f => (src && c.cm ? src.get(c.cm, f) : null);
  return [g('lowHolo'), pf(c, 'trendHolo'), g('avg1Holo'), g('avg7Holo'), g('avg30Holo')];
}
let DUP_CM = new Set(); // liens Cardmarket qui servent à plusieurs cartes : leur prix est à confirmer
// Cote d'une carte Pokémon : { v, lo, hi, conf, src, holo, m (mesures retenues : bas, tendance, hier, 7 j, 30 j),
// d (moyenne 7 j contre moyenne 30 j), dup } ou null
function quoteFill(q, m, c) {
  q.m = m; q.d = m[3] > 0 && m[4] > 0 ? m[3] / m[4] - 1 : null;
  if (c.cm && DUP_CM.has(c.cm)) { q.dup = true; q.conf = 0; q.lo = Math.min(q.lo, q.v * COTE.FOURCHETTE[0][0]); q.hi = Math.max(q.hi, q.v * COTE.FOURCHETTE[0][1]); }
  return q;
}
function quote(c) {
  if (c._q !== undefined) return c._q;
  let q = null;
  if (c.p && PKM) {
    const n = [pf(c, 'low'), pf(c, 'trend'), pf(c, 'avg1'), pf(c, 'avg7'), pf(c, 'avg30')], h = holoM(c);
    q = coteProduit(n, h);
    if (q) quoteFill(q, q.holo ? h : n, c);
  }
  return (c._q = q);
}
// Cote de la version holo ou reverse, quand la carte a aussi une version normale
function quoteHolo(c) {
  if (c._qh !== undefined) return c._qh;
  const q = PKM && c.p ? quote(c) : null, h = q && !q.holo ? holoM(c) : null, x = h ? coteDe(...h) : null;
  if (x) x.holo = true;
  return (c._qh = x ? quoteFill(x, h, c) : null);
}
// Pourquoi la confiance n'est pas bonne (clé de COTE_POURQUOI), '' si elle l'est : le doute le plus fort de coteDe()
function coteWhy(q) {
  if (q.dup) return 'dup';
  if (q.src !== 'moy') return q.src;
  if (q.conf === 2) return '';
  const [low, , a1, a7, a30] = q.m, moy = [a1, a7, a30].filter(x => x > 0), doute = 2 - q.conf;
  if (moy.length < 2) return 'peu';
  if (low > 0 && low - q.v >= COTE.TOLERANCE && low / q.v >= (doute === 2 ? COTE.ECART : COTE.ACCORD)) return 'cher';
  const mx = Math.max(...moy), mn = Math.min(...moy), e = mx - mn < COTE.TOLERANCE ? 1 : mx / mn;
  let ventes = e < COTE.ACCORD ? 0 : e < COTE.ECART ? 1 : 2;
  if (ventes === 1 && low > 0 && q.v >= 1 && q.v / low < COTE.ECART) ventes = 0;
  return ventes === doute ? (doute === 2 ? 'ecart' : 'varie') : 'offres';
}
const COTE_POURQUOI = {
  dup: 'Prix à confirmer : cette cote est peut-être celle d’une autre version de la carte.',
  bas: 'Pas de vente récente : c’est le prix de l’offre la moins chère.',
  tendance: 'Pas de vente récente : c’est la tendance donnée par Cardmarket.',
  peu: 'Très peu de ventes récentes.',
  ecart: 'Les dernières ventes vont du simple au double, ou plus : l’état et la langue comptent beaucoup.',
  varie: 'Les dernières ventes ne sont pas toutes au même prix : l’état et la langue comptent.',
  offres: 'Des cartes sont en vente bien moins cher, souvent abîmées ou dans une autre langue.',
  cher: 'Les cartes en vente sont plus chères que les dernières ventes.'
};
// Toutes les raisons d'une confiance moyenne ou faible, avec les chiffres (fiche carte) : les mêmes doutes que coteDe(),
// du plus fort au plus faible. Chaque phrase dit ce qui a été comparé.
function coteWhyAll(q) {
  const one = coteWhy(q); if (!one) return [];
  if (q.dup || q.src !== 'moy') return [COTE_POURQUOI[one]];
  const [low, , a1, a7, a30] = q.m, moy = [['hier', a1], ['moyenne 7 jours', a7], ['moyenne 30 jours', a30]].filter(x => x[1] > 0);
  if (moy.length < 2) return [COTE_POURQUOI.peu];
  const out = [], mx = moy.reduce((a, b) => (b[1] > a[1] ? b : a)), mn = moy.reduce((a, b) => (b[1] < a[1] ? b : a));
  const e = mx[1] - mn[1] < COTE.TOLERANCE ? 1 : mx[1] / mn[1];
  let ventes = e < COTE.ACCORD ? 0 : e < COTE.ECART ? 1 : 2, offres = 0, cher = 0;
  if (low > 0 && q.v >= 1) { const r = q.v / low, [moyen, faible] = q.v >= 10 ? COTE.BAS_10 : COTE.BAS; offres = r < moyen ? 0 : r < faible ? 1 : 2; if (ventes === 1 && r < COTE.ECART) ventes = 0; }
  if (low > 0 && low - q.v >= COTE.TOLERANCE) { const r = low / q.v; cher = r < COTE.ACCORD ? 0 : r < COTE.ECART ? 1 : 2; }
  if (cher) out.push([cher, F('Les vendeurs demandent au moins {0}, soit {1} fois ce que les acheteurs ont payé ces derniers jours : la cote suit les ventes, pas les prix demandés.', eur(low), (Math.floor(low / q.v * 10) / 10).toLocaleString(LOCALE))]);
  if (ventes) out.push([ventes, F('Les ventes récentes vont de {0} ({1}) à {2} ({3}){4}', eur(mn[1]), tr(mn[0]), eur(mx[1]), tr(mx[0]), ventes === 2 ? tr(' : du simple au double ou plus, l’état et la langue comptent beaucoup.') : tr(' : l’état et la langue comptent.'))]);
  if (offres) out.push([offres, F('Des cartes sont en vente dès {0}, bien sous la cote : souvent abîmées ou dans une autre langue.', eur(low))]);
  return out.sort((a, b) => b[0] - a[0]).map(x => x[1]);
}
// Prix d'une carte : la cote CallIt! pour Pokémon ; pour les autres jeux, la tendance, sinon le prix bas
const price = c => (!c.p ? null : PKM ? (quote(c) ? quote(c).v : null) : (c.p[1] != null ? c.p[1] : c.p[0]));
// Une cote s'affiche arrondie : 395 €, 48 €, 3,30 € (les centimes d'une cote n'ont pas de sens)
const roundP = v => { const a = Math.abs(v), st = a < 1 ? 0.01 : a < 10 ? 0.1 : a < 100 ? 1 : a < 1000 ? 5 : a < 10000 ? 50 : 500; return Math.round(v / st) * st; };
function eurR(v) { if (v == null) return '—'; const cur = userCur(), r = rate(cur), x = roundP(r ? v * r : v); return money(x, r ? cur : 'EUR', Math.abs(x) >= 10 ? 0 : 2); }
// Cote d'une carte, arrondie pour Pokémon (les autres jeux gardent le prix exact de leur source)
const eurC = v => (PKM ? eurR(v) : eur(v));
const CONF_MOT = ['Faible', 'Moyenne', 'Bonne'];
// 1re, 2e… / 1st, 2nd… / 1., 2. / 1.º : suffixe de rang dans la langue de l'appli
const ordSuffix = n => UI === 'fr' ? (n === 1 ? 're' : 'e') : UI === 'en' ? ([, 'st', 'nd', 'rd'][(n % 100 >= 11 && n % 100 <= 13) ? 0 : n % 10] || 'th') : UI === 'de' ? '.' : 'º';
const confDot = q => `<i class="cdot c${q.conf}"></i>`;
/* Prix sur la fiche d'une carte Pokémon : cote arrondie, fourchette, confiance, puis les mesures du guide Cardmarket */
function coteSection(c) {
  const q = quote(c), [low, trend, a1, a7, a30] = q.m, why = coteWhy(q), qh = quoteHolo(c), r = setRank(c);
  const ventes = q.src === 'moy', gros = ventes && q.v >= 1; // sans vente récente, ou en dessous d'un euro (on parle de centimes) : ni fourchette ni évolution
  const d = gros && q.d != null ? Math.round(q.d * 100) : null; // même chiffre que la courbe « 1 mois » (moy. 7 j contre moy. 30 j)
  const steps = [['Moy. 30 j', a30], ['Moy. 7 j', a7], ['Hier', a1], ['Tendance', trend > COTE.ARTEFACT ? trend : 0]].filter(x => x[1] > 0);
  const pick = steps.findIndex(x => x[1] === q.v);
  const line = (lab, val) => `<div class="cs-line"><span>${lab}</span><b class="num">${val}</b></div>`;
  const etats = [['MT · NM', 'NM'], ['EX', 'EX'], ['GD', 'GD'], ['LP', 'LP'], ['PL', 'PL'], ['PO', 'PO']];
  return `<div class="sect between"><h2 class="h2">Prix</h2><span class="sub">Cardmarket, toutes langues</span></div>
  <div class="pad stack">
    <div class="cs-top">
      <div class="cs-cote"><div class="lab">Cote</div><div class="cs-v num">${eurR(q.v)}</div>${gros ? `<div class="cs-rg num">${F('La plupart des ventes : {0} à {1}', `<b>${eurR(q.lo)}</b>`, `<b>${eurR(q.hi)}</b>`)}</div>` : ''}</div>
      <div class="cs-side">
        <div><div class="lab">Confiance</div><span class="cs-pill c${q.conf}">${confDot(q)}${CONF_MOT[q.conf]}</span></div>
        <div><div class="lab">Sur 30 jours</div><b class="num cs-d ${!d ? '' : d > 0 ? 'gain' : 'loss'}">${d == null ? '—' : (d > 0 ? '▲ +' : d < 0 ? '▼ ' : '') + d + ' %'}</b>${d != null && q.conf === 0 ? `<div class="small">${tr('à confirmer')}</div>` : ''}</div>
      </div>
    </div>
    ${why ? (w => `<div class="cs-why c${q.conf}"><b>${F('Pourquoi une confiance {0} :', tr(CONF_MOT[q.conf]).toLowerCase())}</b>${w.length > 1 ? `<ul>${w.map(x => `<li>${x}</li>`).join('')}</ul>` : ' ' + w[0]}</div>`)(coteWhyAll(q)) : ''}
    ${q.v >= 1 ? `<div class="panel stack" style="gap:8px"><div class="between"><b>Selon l’état</b><span class="small">estimation</span></div>
      <div class="cs-etats">${etats.map(([l, k]) => `<div${k === 'NM' ? ' class="on"' : ''}><span class="lab">${l}</span><b class="num">${eurR(q.v * OWN_COND_K[k])}</b></div>`).join('')}</div></div>` : ''}
    <div class="panel stack" style="gap:10px">
      <b>Ventes récentes</b>
      ${steps.length >= 2 ? `<div class="steps pick cs-steps">${steps.map(([l, v], i) => `<div${i === pick ? ' class="on"' : ''}><div class="lab">${l}</div><div class="num">${eur(v)}</div></div>`).join('')}</div>${pick >= 0 ? '<div class="small">En vert : la valeur retenue pour la cote.</div>' : ''}` : '<div class="small">Pas assez de ventes récentes pour comparer.</div>'}
      <div class="cs-lines">
        ${low > 0 ? line('Offre la moins chère', eur(low)) : ''}
        ${q.holo ? '' : qh ? line('Version reverse / holo', eurR(qh.v)) : ''}
        ${r && r.of >= 5 ? line(`${tr('Rang dans le set')} <span class="small">${F('par prix, sur {0} cartes', r.of)}</span>`, `${r.rank}<sup>${ordSuffix(r.rank)}</sup>`) : ''}
      </div>
      ${q.holo ? '<div class="small">Cote de la version holo ou reverse, la seule vendue.</div>' : ''}
      ${eurNote(q.v) ? `<div class="small">${eurNote(q.v)} · ${RATES.approx ? tr('taux approximatif') : F('taux BCE du {0}', fdate(RATES.date))}</div>` : ''}
      <div class="small">${ventes ? tr('Cote calculée sur les ventes des 7 et 30 derniers jours, toutes langues et tous états.') + ' ' : ''}${F('Guide de prix Cardmarket du {0}.', fdate(priceDate()))}</div></div>
  </div>`;
}

/* ---------- Noms et libellés ---------- */
function cardName(c, lang) {
  const n = c.n;
  // Carte asiatique sans nom dans ta langue : nom français de l'espèce + suffixe (ex, V, VMAX, GX…)
  if (!lang && c.set.reg === 'ja' && !n[S.nameLang] && !n.fr && !n.en && c.dex && DB.species[c.dex]) {
    const m = (n.ja || Object.values(n)[0] || '').match(/[A-Za-z][A-Za-z0-9.\-]*$/);
    return DB.species[c.dex] + (m ? (m[0] === 'ex' ? '-ex' : ' ' + m[0]) : '');
  }
  const order = [lang || S.nameLang, ...(UI === 'fr' ? ['fr', 'en'] : ['en', 'fr']), 'ja', ...Object.keys(n)];
  for (const l of order) if (n[l]) return n[l];
  return '?';
}
const speciesFr = c => (c.dex && DB.species[c.dex]) || '';
const latin = t => t && !/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af\u0e00-\u0e7f]/.test(t);
function setName(s) { const n = s.name; return n[S.nameLang] || (UI === 'fr' ? n.fr || n.en : n.en || n.fr) || (latin(n.ja) ? n.ja : '') || n.id || n.ja || Object.values(n)[0] || s.id; }
const year = s => (s.date || '').slice(0, 4);
const numLabel = c => c.x ? (c.att || '').slice(0, 28) : c.num + (PKM && c.set.count ? '/' + c.set.count : '');
const ill = c => (c.i != null ? DB.ills[c.i] : '');
const RAR_FR = { Common: 'Commune', Uncommon: 'Peu commune', Rare: 'Rare', 'Rare Holo': 'Rare holo', 'Holo Rare': 'Rare holo', 'Secret Rare': 'Rare secrète', 'Ultra Rare': 'Ultra rare', 'Double rare': 'Double rare', 'Illustration rare': 'Illustration rare', 'Special illustration rare': 'Illustration spéciale rare', 'Hyper rare': 'Hyper rare', 'Shiny rare': 'Rare chromatique', 'Shiny Ultra Rare': 'Ultra rare chromatique', 'Full Art Trainer': 'Dresseur pleine illustration', 'Amazing Rare': 'Magnifique rare', 'Radiant Rare': 'Radieuse', None: '' };
const rar = c => (c.r != null ? DB.rars[c.r] : '');
const rarFr = c => { const r = rar(c); return r in RAR_FR ? RAR_FR[r] : r; };
const excluded = () => new Set(S.excluded);
function visibleLangs(c) { const ex = excluded(); return c.langs.filter(l => !ex.has(l)); }
function isHidden(c) { if (!S.exclSearch || anyLang.has(c.key) || !S.excluded.length) return false; return c.langs.length > 0 && visibleLangs(c).length === 0; }
function langList(codes) { return codes.map(l => (LANG[l] || { name: l }).name.toLowerCase()); }
// Noms de langues dans la langue de l'appli (minuscules en français, espagnol, italien ; majuscule en anglais et allemand)
function langNames(codes) { return codes.map(l => { const t = tr((LANG[l] || { name: l }).name); return /^(fr|es|it)$/.test(UI) ? t.toLowerCase() : t; }); }
function joinFr(a) { return a.length <= 1 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' et ' + a[a.length - 1]; }

/* ---------- Images TCGdex, avec repli sur une autre langue ---------- */
const imgOk = new Map();   // clé carte → langue qui a marché
const imgBad = new Set();  // "clé|langue" en échec
// Cartes anciennes (avant 2003-07, époque Wizards) : hors anglais, TCGdex n'a souvent que des photos d'amateurs
// (floues, de travers). On montre l'image anglaise, scannée proprement, avec la mention « image de la version anglaise ».
const isVintage = c => PKM && c.set.reg === 'en' && (c.set.date || '9') < '2003-07';
// Images réellement disponibles (data/images.json, vérifié chaque semaine) : on évite les essais inutiles
let IMGS = null;
fetch('data/images.json').then(r => r.ok ? r.json() : null).then(j => { if (j && DB && j.cards === DB.generated) { IMGS = j; render(); } else if (j) IMGS = j; }).catch(() => {});
const imgMask = c => { if (!PKM || !IMGS || !IMGS.mask || IMGS.cards !== DB.generated) return null; const D = '0123456789abcdefghijklmnopqrstuvwxyz'; return D.indexOf(IMGS.mask[c.idx * 2]) * 36 + D.indexOf(IMGS.mask[c.idx * 2 + 1]); };
// 2e source (pokemontcg.io) : seulement les images relevées dans data/images.json, où chaque carte a été vérifiée
const ptcgPath = c => (imgMask(c) != null && IMGS.ptcg && IMGS.ptcg[c.idx]) || null;
// Image d'un autre set : la même carte, avec le même dessin, imprimée ailleurs. Seulement pour une carte qui n'a aucune
// image à elle, et seulement les cas relevés dans data/images.json (alt : rang de la carte → rang de celle qui prête son image).
const altCard = c => { const j = imgMask(c) != null && IMGS.alt ? IMGS.alt[c.idx] : null; const o = j == null ? null : CARDS[j]; return o && o !== c && o.idx === j && (imgMask(o) > 0 || ptcgPath(o)) ? o : null; };
const hasImg = c => { if (c.x) return false; if (!PKM) return !!c.im; const m = imgMask(c); return m == null || m > 0 || !!ptcgPath(c) || !!altCard(c); };
function imgOrder(c, want, force) {
  if (c.x) return [];
  if (!PKM) return c.im ? ['x', ...(DB.fullImage ? ['t'] : [])].filter(l => !imgBad.has(c.key + '|' + l)) : [];
  const base = c.set.reg === 'en' ? ['en', 'fr', 'es', 'it', 'pt', 'de'] : ['ja', 'zh-tw', 'th', 'id', 'ko', 'zh-cn'];
  const m = imgMask(c);
  const okL = m == null ? base : base.filter((l, i) => m & (1 << i));
  const pref = force ? [force] : isVintage(c) ? ['en'] : [want, S.nameLang, ...visibleLangs(c)];
  const order = [...new Set([...pref.filter(l => okL.includes(l)), ...okL])];
  if (ptcgPath(c)) order.push('ptcg');
  if (!order.length && altCard(c)) order.push(...imgOrder(altCard(c), want).filter(l => l[0] !== '@').map(l => '@' + l)); // « @en » : l'image anglaise de l'autre carte
  return order.filter(l => !imgBad.has(c.key + '|' + l));
}
const imgUrl = (c, l, q) => l && l[0] === '@' ? imgUrl(altCard(c) || c, l.slice(1), q) : !PKM ? (q === 'high' && l === 'x' && DB.fullImage ? DB.fullImage : DB.imageBase).replace('{im}', c.im).replace('{size}', q === 'high' ? 'large' : 'normal') : l === 'ptcg' ? 'https://images.pokemontcg.io/' + ptcgPath(c) + (q === 'high' ? '_hires' : '') + '.png' : DB.imageBase.replace('{lang}', l).replace('{serie}', encodeURIComponent(c.set.serie)).replace('{set}', encodeURIComponent(c.set.id)).replace('{num}', encodeURIComponent(c.num)).replace('high.webp', q + '.webp');

const COUNTRY_LANG = { FR: 'fr', BE: 'fr', LU: 'fr', MC: 'fr', IT: 'it', DE: 'de', AT: 'de', CH: 'de', ES: 'es', PT: 'pt', JP: 'ja' };
function prefLang(c) {
  const vis = visibleLangs(c);
  for (const l of [S.nameLang, COUNTRY_LANG[S.country], 'en']) if (l && vis.includes(l)) return l;
  return vis[0] || c.langs[0] || (c.set.reg === 'en' ? 'en' : 'ja');
}
function cimg(c, opts = {}) {
  const own = opts.it ? colExtra('photo', opts.it, c, opts) : ''; if (own) return own; // la photo de mon exemplaire, si j'en ai pris une (collection.js)
  const want = PKM ? opts.lang || prefLang(c) : 'x';
  const q = opts.big ? 'high' : 'low';
  const order = imgOrder(c, want, opts.force);
  const first = order[0];
  const badge = opts.badge ? `<span class="badge">${esc(opts.badge)}</span>` : '';
  const label = esc(cardName(c));
  if (!first) return `<div class="cimg noimg">${badge}<div class="ph">${label}<br>image indisponible</div></div>`;
  return `<div class="cimg" data-want="${esc(want)}"><img loading="${opts.eager ? 'eager' : 'lazy'}" decoding="async" alt="${label}" src="${imgUrl(c, first, q)}" data-key="${esc(c.key)}" data-q="${q}" data-lang="${esc(first)}" data-order="${esc(order.join(','))}">${badge}<div class="ph">${label}</div><span class="fallback"></span></div>`;
}
function markFallback(img) {
  const box = img.parentElement, want = box.dataset.want, got = img.dataset.lang;
  if (got === 'x' || got === 't') return;
  const fb = box.querySelector('.fallback');
  if (got[0] === '@') { // image prêtée par la même carte d'un autre set : on le dit toujours
    const c = BYKEY.get(img.dataset.key), o = c && altCard(c), l = got === '@ptcg' ? 'en' : got.slice(1);
    box.classList.add('fb');
    if (fb) fb.textContent = o && o.set.reg !== c.set.reg ? 'image de la version ' + (LANG_OF[l] || l) : 'image d’un autre set';
    return;
  }
  box.classList.toggle('fb', want !== got);
  if (fb) fb.textContent = got === 'ptcg' ? (want === 'en' ? '' : 'image de la version anglaise') : want !== got ? 'image de la version ' + (LANG_OF[got] || got) : '';
  if (got === 'ptcg') box.classList.toggle('fb', want !== 'en');
}
document.addEventListener('load', e => {
  if (e.target.classList && e.target.classList.contains('seal-logo')) { e.target.parentNode.classList.add('has-logo'); return; }
  const img = e.target; if (!(img instanceof HTMLImageElement) || !img.dataset.key) return;
  imgOk.set(img.dataset.key, img.dataset.lang); markFallback(img);
}, true);
document.addEventListener('error', e => {
  if (e.target.classList && e.target.classList.contains('seal-logo')) { const a = e.target.dataset.alt; if (a) { delete e.target.dataset.alt; e.target.src = a; } else { const box = e.target.parentNode; e.target.remove(); if (box && box.classList.contains('seal-sect-logo')) box.remove(); } return; }
  const img = e.target; if (!(img instanceof HTMLImageElement) || !img.dataset.key) return;
  imgBad.add(img.dataset.key + '|' + img.dataset.lang);
  const order = img.dataset.order.split(','); const next = order[order.indexOf(img.dataset.lang) + 1];
  const c = BYKEY.get(img.dataset.key);
  if (next && c) { img.dataset.lang = next; img.src = imgUrl(c, next, img.dataset.q); }
  else { const box = img.parentElement; box.classList.add('noimg'); box.classList.remove('fb'); img.remove(); const ph = box.querySelector('.ph'); if (ph) ph.innerHTML += '<br>image indisponible'; }
}, true);

/* ---------- Recherche ---------- */
function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, qs] = h.split('?');
  return { parts: path.split('/').filter(Boolean).map(decodeURIComponent), q: new URLSearchParams(qs || '') };
}
const FULLART = new Set(['Illustration rare', 'Special illustration rare', 'Full Art Trainer', 'Character Rare', 'Character Super Rare', 'Shiny Ultra Rare', 'Ultra Rare', 'Hyper rare', 'Secret Rare', 'Mega Hyper Rare'].map(r => r));
const AR_SIR = new Set(['Illustration rare', 'Special illustration rare']);
const PRESETS = {
  illus: { label: 'Pleine illustration', test: c => FULLART.has(rar(c)) && c.set.date >= '2016' },
  holo: { label: 'Holo anciennes', test: c => (c.f & 1) && c.set.date && c.set.date < '2003-07' && c.set.reg === 'en' },
  japon: { label: 'Japonaises', test: c => c.set.reg === 'ja' && c.langs.includes('ja') },
  first: { label: 'Éditions 1', test: c => c.f & 2 },
  petitprix: { get label() { return 'AR et SIR à moins de ' + money(5).replace(/[,.]00/, ''); }, test: c => AR_SIR.has(rar(c)) && price(c) != null && toUser(price(c)) < 5 }
};

// Noms français connus pour des cartes dont la base n'a que le nom anglais
const NAME_ALIAS = { 'Ancient Mew': 'Mew Antique' };
function searchCards(params) {
  const raw = (params.get('q') || '').trim();
  const tokens = norm(raw).split(/\s+/).filter(Boolean);
  const ill = params.get('ill'), dex = params.get('dex'), set = params.get('set'), preset = PRESETS[params.get('preset')];
  const illSet = ill != null ? ((artistIndex().byKey.get(illKey(ill)) || {}).idx || new Set([DB.ills.indexOf(ill)])) : null;
  if (!tokens.length && illSet == null && !dex && set == null && !preset) return null;
  const out = [];
  for (const c of CARDS) {
    if (illSet && !illSet.has(c.i)) continue;
    if (dex && String(c.dex) !== dex) continue;
    if (set != null && String(c.s) !== set) continue;
    if (preset && !preset.test(c)) continue;
    let ok = true, score = 0;
    for (const t of tokens) {
      const m = /^0*(\d+[a-z]?)\/(\d+)$/.exec(t);
      if (m) { if (c.numN === m[1] && (!c.set.count || String(c.set.count) === m[2])) { score += 3; continue; } ok = false; break; }
      if (/^\d+[a-z]?$/.test(t) && c.numN === t.replace(/^0+(?=\d)/, '')) { score += 2; continue; }
      const at = c.hay.indexOf(t);
      if (at < 0) { ok = false; break; }
      if (at === 0 || c.hay[at - 1] === ' ' || c.hay[at - 1] === '|') score += 1;
    }
    if (!ok) continue;
    if (tokens.length && norm(cardName(c)) === tokens.join(' ')) score += 5;
    out.push([c, score]);
  }
  const by = S.sort;
  const pr = c => price(c) == null ? -1 : price(c);
  out.sort((a, b) =>
    by === 'prix-' ? pr(b[0]) - pr(a[0]) :
    by === 'prix+' ? ((pr(a[0]) < 0) - (pr(b[0]) < 0)) || pr(a[0]) - pr(b[0]) :
    by === 'ancien' ? (a[0].set.date || '9').localeCompare(b[0].set.date || '9') :
    by === 'recent' ? (b[0].set.date || '').localeCompare(a[0].set.date || '') :
    (b[1] - a[1]) || (b[0].set.date || '').localeCompare(a[0].set.date || ''));
  return out.map(x => x[0]);
}

/* ---------- Vues ---------- */
const ICONS = {
  download: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 19h16"/>',
  ruler: '<path d="M3 17L17 3l4 4L7 21z"/><path d="M7.5 12.5l2 2M10.5 9.5l1.5 1.5M13.5 6.5l2 2"/>',
  deck: '<rect x="3" y="6" width="12" height="15" rx="2"/><path d="M8 3h10a2 2 0 0 1 2 2v13"/>',
  tools: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
  frame: '<path d="M9 4.5l3-2.5 3 2.5"/><rect x="4.5" y="4.5" width="15" height="17.5" rx="1.5"/><rect x="8" y="8" width="8" height="10.5" rx="1"/>',
  home: '<path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  coll: '<rect x="4" y="3" width="11" height="15" rx="2"/><path d="M9 21h9a2 2 0 0 0 2-2V7"/>',
  set: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  chart: '<path d="M3 19l6-6 4 3 8-9"/>',
  back: '<path d="M15 18l-6-6 6-6"/>',
  shield: '<path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/>',
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  share: '<path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'
};
const icon = (n, w = 20) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n]}</svg>`;
/* Logo : le toploader « C! » et « Call » + « It! » en vert gain */
function logo(size = 24) {
  const h = Math.round(size * 1.25);
  return `<span class="logo" style="font-size:${size}px"><svg width="${Math.round(h * 94 / 128)}" height="${h}" viewBox="0 0 94 128" aria-hidden="true"><rect x="3" y="3" width="88" height="122" rx="10" fill="none" stroke="var(--ink)" stroke-width="7"/><rect x="15" y="15" width="64" height="98" rx="5" fill="var(--logo-card)"/><text x="40" y="80" font-family="Fraunces, Georgia, serif" font-weight="700" font-size="42" fill="var(--ink)" text-anchor="middle">C</text><text x="62" y="80" font-family="Fraunces, Georgia, serif" font-weight="700" font-size="42" fill="var(--gain)" text-anchor="middle">!</text></svg><span>Call<span class="it">It!</span></span></span>`;
}
const G = () => S.face !== 'marche' && S.face !== 'joueur';
const J = () => S.face === 'joueur';

// Joueur : deux joueurs assis face à face, chacun sur sa chaise, la table et une carte au milieu (icône plus large que les autres)
const DUEL_ICON = '<svg width="25" height="17" viewBox="0 0 34 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="7" cy="5" r="2.2"/><circle cx="27" cy="5" r="2.2"/><path d="M2 9v13M2 15h5M7 7.5v7h4v6.5M7 10l5.5 2.5M32 9v13M32 15h-5M27 7.5v7h-4v6.5M27 10l-5.5 2.5"/><path d="M13.5 12.5h7M14.5 12.5V22M19.5 12.5V22"/><rect x="15.6" y="8.6" width="2.6" height="3.4" rx=".5"/></svg>';
// Vues de l'appli : un bouton « Affichage » montre la vue en cours et ouvre le choix des trois vues
const FACES = [['galerie', 'Galerie', 'La beauté des cartes'], ['marche', 'Marché', 'La valeur et les affaires'], ['joueur', 'Joueur', 'Decks et tournois']];
const faceIcon = (k, w = 17) => k === 'joueur' ? DUEL_ICON.replace('width="25" height="17"', `width="${Math.round(w * 34 / 24)}" height="${w}"`) : icon(k === 'marche' ? 'chart' : 'frame', w);
const curFace = () => (G() ? 'galerie' : J() ? 'joueur' : 'marche');
function faceSwitch() {
  const k = curFace(), f = FACES.find(x => x[0] === k);
  return `<button class="facebtn" data-act="facemenu" aria-haspopup="dialog" aria-label="${esc(F('Affichage : {0}. Changer de vue', tr(f[1])))}"><span class="fb-lab">Affichage</span><span class="fb-cur"><span class="fb-sw fc-${k}">${faceIcon(k, 14)}</span><b>${esc(f[1])}</b><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></span></button>`;
}
function openFaceSheet() {
  const d = document.createElement('dialog'); d.className = 'sheet';
  d.innerHTML = `<form class="sheet-in" method="dialog"><b style="font-size:17px">Affichage</b><div class="tript">${FACES.map(([k, n, t]) => `<button class="tcard fc-${k} ${k === curFace() ? 'on' : ''}" value="${k}" aria-pressed="${k === curFace()}">${faceIcon(k, 30)}<b>${n}</b><span>${t}</span></button>`).join('')}</div><div class="small">Tu peux changer à tout moment.</div></form>`;
  document.body.appendChild(d);
  d.addEventListener('close', () => { const v = d.returnValue; d.remove(); if (FACES.some(x => x[0] === v) && v !== curFace()) { S.face = v; saveS(); applyTheme(); render(); } });
  d.showModal();
}
function tabs(cur) {
  const t = G()
    ? [['', 'Galerie', 'home'], ['recherche', 'Recherche', 'search'], ['collection', 'Ma collection', 'coll'], ['reglages', 'Réglages', 'set']]
    : J() ? [['', 'Joueur', 'deck'], ['recherche', 'Recherche', 'search'], ['collection', 'Ma collection', 'coll'], ['reglages', 'Réglages', 'set']]
    : [['', 'Marché', 'chart'], ['recherche', 'Recherche', 'search'], ['collection', 'Portefeuille', 'coll'], ['reglages', 'Réglages', 'set']];
  return `<div class="tabs"><nav aria-label="Navigation"><a class="brand" href="#/" aria-label="CallIt!, accueil">${logo(26)}</a>${t.map(([h, l, i]) => `<a href="#/${h}" ${cur === h ? 'aria-current="page"' : ''}>${icon(i, 22)}<span>${l}</span></a>`).join('')}<span class="tabs-end">${faceSwitch()}<button class="iconbtn" data-act="vymenu" aria-label="Menu"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button></span></nav></div>`;
}
function backBtn() { return `<button class="iconbtn" data-act="back" aria-label="Retour">${icon('back')}</button>`; }

// « dès X € » : prix bas Cardmarket (l'offre la moins chère, tous états), sinon la cote
function fromPrice(c) { const lo = pf(c, 'low'), p = lo > 0 ? lo : price(c); return p > 0 ? 'dès <b>' + eur(p) + '</b>' : 'pas encore de prix'; }
function tile(c, opts = {}) {
  const meta = (c.set.reg === 'ja' ? 'JP · ' : '') + (opts.meta != null ? opts.meta : `${setName(c.set)} · ${year(c.set)}`);
  return `<a class="tile" href="#/carte/${encodeURIComponent(c.key)}${opts.lang ? '?lang=' + encodeURIComponent(opts.lang) : ''}">${cimg(c, opts)}${heartBtn(c.key)}<span class="nm">${esc(cardName(c))}</span><span class="mt">${esc(meta)}</span>${opts.from ? `<span class="from">${fromPrice(c)}</span>` : ''}</a>`;
}
function langChips(c) {
  const ex = excluded();
  return `<span class="langs">${c.langs.map(l => `<span class="lg ${ex.has(l) ? 'off' : ''}" title="${esc(LANG[l].name)}">${LANG[l].short}</span>`).join('')}</span>`;
}
function lineRow(c, muted) {
  const p = price(c);
  return `<a class="line ${muted ? 'muted' : ''}" href="#/carte/${encodeURIComponent(c.key)}"><span class="thumb">${cimg(c)}</span><span class="mid"><b>${esc(cardName(c))}</b><span>${esc(setName(c.set))} · ${esc(numLabel(c))} · ${esc(year(c.set))}${muted ? ' · langue exclue' : ''}</span>${langChips(c)}</span><span class="px"><b class="num">${p != null ? eurC(p) : '—'}</b><span>${p != null ? (pf(c, 'low') > 0 ? 'dès ' + eur(pf(c, 'low')) : 'cote Cardmarket') : 'pas de cote'}</span></span></a>`;
}

/* Petite illustration de carte (premier lancement), rayures si l'image ne charge pas */
function art(key, w, h, rot, pos) {
  const c = BYKEY.get(key);
  const box = `width:${w}px;height:${h}px;flex:none;border-radius:5px;overflow:hidden;background:repeating-linear-gradient(135deg,#d9cde8 0 8px,#e6dcf0 8px 16px);box-shadow:0 6px 14px -8px rgba(0,0,0,.45);${rot ? `transform:rotate(${rot}deg);` : ''}${pos ? 'position:absolute;' + pos : ''}`;
  if (!c) return `<span style="${box}"></span>`;
  // Autres jeux : la miniature hébergée chez nous d'abord (sûre et légère), l'image officielle en secours
  const order = PKM ? imgOrder(c, prefLang(c)) : (DB.fullImage ? ['t', 'x'] : ['x']);
  return `<span style="${box}"><img src="${imgUrl(c, order[0], 'high')}" alt="" data-key="${esc(c.key)}" data-q="high" data-lang="${order[0]}" data-order="${order.join(',')}" style="width:100%;height:100%;object-fit:cover"></span>`;
}
/* ---------- Vérifier l'authenticité : guide repliable sur chaque fiche carte (textes écrits par nous) ---------- */
const AUTH_TIPS = {
  common: [
    ['Le prix et le vendeur', 'Une carte chère vendue très en dessous de sa cote, des photos de catalogue au lieu de vraies photos, un vendeur sans historique : prudence. Demande une photo du recto, du verso et de la tranche.'],
    ['La taille', 'Mesure avec une règle : la carte doit faire {size}. Un écart d’un millimètre ou plus est un mauvais signe.'],
    ['Le test de la lumière', 'Place la lampe de ton téléphone derrière la carte, dans le noir. Une vraie carte laisse passer peu de lumière, de façon régulière. Beaucoup de contrefaçons laissent passer presque toute la lumière, ou pas du tout.'],
    ['L’impression à la loupe', 'Avec une loupe (×10) ou le zoom de l’appareil photo : sur une vraie carte, les couleurs sont faites de petits points nets en rosace et le texte est bien net. Texte baveux, pixels visibles ou couleurs en aplat flou : suspect.'],
    ['Le texte et les symboles', 'Compare avec l’image de cette fiche : police, place des symboles, fautes d’orthographe, numéro de carte. Les contrefaçons se trompent souvent sur ces détails.'],
    ['Le toucher', 'Une contrefaçon est souvent trop brillante, trop lisse, trop souple ou au contraire cartonnée. Compare avec une carte commune du même jeu que tu sais authentique.']
  ],
  pkm: [
    ['La tranche', 'Regarde la tranche de près : la plupart des vraies cartes Pokémon ont une fine couche sombre au milieu de l’épaisseur. Beaucoup de contrefaçons sont blanches de part en part.'],
    ['Le dos', 'Le bleu du dos est nuancé, avec une Poké Ball nette. Un dos trop violet, trop foncé, délavé ou flou est un signe classique de contrefaçon.'],
    ['Le holo', 'Sur une vraie holo, l’effet brillant suit un motif précis à un endroit précis de la carte. Un holo partout, sans relief ou d’un motif inhabituel est suspect.']
  ],
  mtg: [
    ['La loupe, test n° 1 de Magic', 'Les vraies cartes Magic sont imprimées en petits points formant des rosaces, très visibles à la loupe, en particulier sur le dos (le cercle de couleurs). La plupart des contrefaçons ont une impression différente.'],
    ['Le sceau holo', 'Depuis 2014 (Magic 2015), les rares et les mythiques ont un petit sceau holographique ovale en bas de la carte. Il doit être bien brillant et changer avec la lumière.'],
    ['La tranche', 'Une vraie carte Magic a une fine couche sombre au cœur de l’épaisseur, visible sur la tranche.'],
    ['Les cartes anciennes', 'Pour les cartes très chères (Alpha, Beta, Unlimited…) : achète-les de préférence gradées, ou fais-les authentifier par une société de gradation avant de payer le prix fort.']
  ],
  ygo: [
    ['L’œil d’Anubis', 'Les vraies cartes Yu-Gi-Oh! (édition TCG) ont un petit sceau holographique en bas à droite, l’« œil d’Anubis ». Il doit être net, brillant et changer avec la lumière. Absent, plat ou terne : suspect.'],
    ['Le code de set', 'Sous l’illustration, le code (ex. LOB-EN001) doit correspondre au set et à la langue de la carte. Une mention « 1st Edition » mal placée ou dans la mauvaise police est un signe classique.'],
    ['La rareté', 'Compare le nom et la bordure avec la rareté annoncée : une « Ultra Rare » a le nom en lettres dorées, une « Secret Rare » un nom et une illustration scintillants en diagonale.']
  ],
  op: [
    ['Le code de la carte', 'En bas à droite, le code (ex. OP01-001) et la rareté doivent correspondre à cette fiche. Vérifie aussi le nom du set.'],
    ['Les versions parallèles', 'Les versions « parallèles » et « manga » sont les plus contrefaites. Compare l’illustration, le cadre et les reliefs avec l’image officielle de cette fiche.'],
    ['La finition', 'Les cartes rares ont une finition brillante ou texturée précise. Une carte rare toute lisse, ou brillante là où l’originale ne l’est pas, est suspecte.']
  ],
  graded: ['Carte gradée ?', 'Vérifie le numéro du certificat sur le site de la société (PSA, CGC, BGS) : la note, la carte et la photo doivent correspondre. Regarde aussi le boîtier : étiquette nette, pas de traces d’ouverture.']
};
/* ---------- Centrage : photo de la carte, 8 traits (bords extérieurs et cadre intérieur), rapports et note PSA possible.
   La photo reste dans le navigateur : rien n'est envoyé. ---------- */
const CTR = { img: null, side: 'recto', sel: 0, L: null, key: '', faces: {}, type: 'cls', okd: new Set() }; // okd : photos dont les contours ont été validés // faces : la mesure de l'autre face, gardée pendant qu'on mesure celle-ci
// Seuils PSA (côté le plus large toléré) : recto puis verso
const PSA_CTR = [[10, 55, 75], [9, 60, 90], [8, 65, 90], [7, 70, 90], [6, 80, 90], [5, 85, 90], [4, 85, 90], [3, 90, 90], [2, 90, 90], [1, 100, 100]];
const CTR_NAMES = ['Bord gauche', 'Cadre gauche', 'Cadre droit', 'Bord droit', 'Bord haut', 'Cadre haut', 'Cadre bas', 'Bord bas'];
function ctrDetect(img, hint, type = CTR.type) {
  // Bords de la carte : saut le plus net près de chaque bord de la photo. Si la photo sort du calage (hint), on sait
  // à peu près où tombent les bords : on cherche seulement autour, pour ne pas se faire piéger par le fond.
  // Cadre : couleur de la bordure prise juste à l'intérieur du bord, puis on avance vers le centre jusqu'à ce que
  // la couleur change franchement (fin de la bordure jaune, argentée…). Point de départ, à ajuster à la main.
  const W = Math.min(1200, img.naturalWidth), H = Math.round(img.naturalHeight * W / img.naturalWidth), cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, W, H); const d = g.getImageData(0, 0, W, H).data;
  const lum = (x, y) => { const i = (y * W + x) * 4; return d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11; };
  const col = new Float32Array(W), row = new Float32Array(H);
  for (let y = Math.round(H * 0.25); y < H * 0.75; y += 2) for (let x = 1; x < W; x++) col[x] += Math.abs(lum(x, y) - lum(x - 1, y));
  for (let x = Math.round(W * 0.25); x < W * 0.75; x += 2) for (let y = 1; y < H; y++) row[y] += Math.abs(lum(x, y) - lum(x, y - 1));
  // Couleur moyenne de chaque colonne / ligne (bande du milieu)
  const prof = (n, m, idx) => { const P = new Float32Array(n * 3); for (let i = 0; i < n; i++) { let r = 0, gg = 0, bb = 0, k = 0; for (let j = Math.round(m * 0.3); j < m * 0.7; j += 2) { const o = idx(i, j) * 4; r += d[o]; gg += d[o + 1]; bb += d[o + 2]; k++; } P[i * 3] = r / k; P[i * 3 + 1] = gg / k; P[i * 3 + 2] = bb / k; } return P; };
  const colC = prof(W, H, (x, y) => y * W + x), rowC = prof(H, W, (y, x) => y * W + x);
  const peak = (p, a, b) => { a = Math.round(a); b = Math.round(b); let best = a, v = -1; for (let i = Math.max(1, a); i < Math.min(p.length, b); i++) if (p[i] > v) { v = p[i]; best = i; } return best; };
  // ancien repère du cadre (premier saut net), gardé en secours
  const first = (p, a, b, dir) => { a = Math.round(a); b = Math.round(b); let mx = 0; for (let i = a; i <= b; i++) mx = Math.max(mx, p[i] || 0); const srt = [...p.slice(a, b + 1)].sort((x, y) => x - y); const th = Math.max(mx * 0.12, (srt[srt.length >> 1] || 0) * 4); const idx = dir > 0 ? [...Array(b - a + 1).keys()].map(k => a + k) : [...Array(b - a + 1).keys()].map(k => b - k); for (const i of idx) if ((p[i] || 0) >= th) { let best = i; for (let j = i; Math.abs(j - i) <= 3; j += dir) if ((p[j] || 0) > (p[best] || 0)) best = j; return best; } return dir > 0 ? a : b; };
  const inner = (P, o, dir, span) => {
    const cd = (i, c) => Math.hypot(P[i * 3] - c[0], P[i * 3 + 1] - c[1], P[i * 3 + 2] - c[2]);
    const s0 = o + dir * Math.max(2, Math.round(span * 0.008)), s1 = o + dir * Math.round(span * 0.02); let c = [0, 0, 0], k = 0;
    for (let i = Math.min(s0, s1); i <= Math.max(s0, s1); i++) { c[0] += P[i * 3]; c[1] += P[i * 3 + 1]; c[2] += P[i * 3 + 2]; k++; }
    c = c.map(x => x / k); let sd = 0; for (let i = Math.min(s0, s1); i <= Math.max(s0, s1); i++) sd = Math.max(sd, cd(i, c));
    const th = Math.max(28, sd * 2.5);
    for (let i = s1; Math.abs(i - o) < span * 0.15; i += dir) if (cd(i, c) > th && cd(i + dir, c) > th && cd(i + 2 * dir, c) > th) return i;
    return null;
  };
  // Bordure holo / dorée : les paillettes brouillent la couleur de la bordure. On prend le changement de couleur
  // le plus franc (moyenné sur toute la bande) entre 2,5 % et 15 % : c'est le cadre de l'illustration et du texte.
  const holo = (P, o, dir, span) => {
    const avg = (a, b) => { let r = 0, g2 = 0, bb = 0, k = 0; for (let i = Math.min(a, b); i <= Math.max(a, b); i++) { r += P[i * 3]; g2 += P[i * 3 + 1]; bb += P[i * 3 + 2]; k++; } return [r / k, g2 / k, bb / k]; };
    const w = Math.max(2, Math.round(span * 0.006)), V = [];
    for (let i = o + dir * Math.round(span * 0.03); Math.abs(i - o) < span * 0.15; i += dir) { const a = avg(i - dir * w, i - dir), b = avg(i, i + dir * (w - 1)); V.push([i, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])]); }
    if (!V.length) return null; const mx = Math.max(...V.map(v => v[1]));
    // le premier saut franc en partant du bord (le cadre peut commencer par une barre de nom moins contrastée)
    for (let k = 0; k < V.length; k++) if (V[k][1] >= mx * 0.6) { while (k + 1 < V.length && V[k + 1][1] > V[k][1]) k++; return V[k][0]; }
    return null;
  };
  const pair = (p, P, n, h) => {
    const w = n * 0.025, o1 = h ? peak(p, h / 100 * n - w, h / 100 * n + w) : peak(p, 1, n * 0.2), o2 = h ? peak(p, (1 - h / 100) * n - w, (1 - h / 100) * n + w) : peak(p, n * 0.8, n - 1), span = o2 - o1;
    const i1 = (type === 'holo' || type === 'ecard' ? holo(P, o1, 1, span) : inner(P, o1, 1, span)) ?? first(p, o1 + span * 0.02, o1 + span * 0.14, 1), i2 = (type === 'holo' || type === 'ecard' ? holo(P, o2 - 1, -1, span) : inner(P, o2 - 1, -1, span)) ?? first(p, o2 - span * 0.14, o2 - span * 0.02, -1);
    return [o1, i1, i2 + 1, o2].map(v => v / n * 100);
  };
  return [...pair(col, colC, W, hint && hint.x), ...pair(row, rowC, H, hint && hint.y)];
}
// Parts gauche et haut (en %) d'une mesure
const ctrShares = L => { const l = L[1] - L[0], r = L[3] - L[2], t = L[5] - L[4], b = L[7] - L[6]; return l > 0 && r > 0 && t > 0 && b > 0 ? [l / (l + r) * 100, t / (t + b) * 100] : null; };
function ctrResult(L = CTR.L, side = CTR.side) {
  if (!L) return null;
  const sh = ctrShares(L); if (!sh) return { bad: true };
  // Cristal (e-card) : la gauche et le bas sont plus larges par design, le haut et la droite ont la même bordure.
  // On compare donc haut ↔ droite et gauche ↔ bas, en pixels (les deux sens n'ont pas la même échelle en %).
  if (side === 'recto' && CTR.type === 'ecard') {
    const asp = CTR.asp || 0.72, l = (L[1] - L[0]) * asp, r = (L[3] - L[2]) * asp, t = L[5] - L[4], b = L[7] - L[6];
    const lr = Math.round(t / (t + r) * 100), tb = Math.round(l / (l + b) * 100), worst = Math.max(lr, 100 - lr, tb, 100 - tb);
    return { lr, tb, worst, psa: (PSA_CTR.find(([, f]) => worst <= f) || [1])[0], ref: false, ecard: true, labs: ['Haut / Droite', 'Gauche / Bas'] };
  }
  let [lr, tb] = sh.map(Math.round);
  // Comparaison avec l'image officielle : on ne compte que l'écart avec une carte parfaitement centrée
  const ref = side === 'recto' && CTR.ref && CTR.ref.on && CTR.ref.key === CTR.key && CTR.ref.sh;
  if (ref) { lr = Math.round(Math.max(1, Math.min(99, 50 + sh[0] - ref[0]))); tb = Math.round(Math.max(1, Math.min(99, 50 + sh[1] - ref[1]))); }
  const worst = Math.max(lr, 100 - lr, tb, 100 - tb), back = side === 'verso';
  const psa = (PSA_CTR.find(([, f, v]) => worst <= (back ? v : f)) || [1])[0];
  return { lr, tb, worst, psa, ref: !!ref, labs: ['Gauche / Droite', 'Haut / Bas'] };
}
// Image officielle de la carte, mesurée exactement comme une photo redressée (même marge, même méthode)
async function ctrRefMeasure(c) {
  const order = PKM ? imgOrder(c, prefLang(c)).filter(l => l[0] !== '@') : ['x']; // jamais l'image d'un autre set : ses marges ne sont pas celles de cette carte
  for (const l of order) {
    try {
      const img = await new Promise((ok, ko) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => ok(i); i.onerror = ko; i.src = imgUrl(c, l, 'high'); });
      const W = img.naturalWidth, H = img.naturalHeight, m = 0.06, cw = Math.round(W * (1 + 2 * m)), ch = Math.round(H + 2 * m * W);
      const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch; const g = cv.getContext('2d');
      g.fillStyle = '#2a2b2a'; g.fillRect(0, 0, cw, ch); g.drawImage(img, m * W, m * W);
      const im2 = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = cv.toDataURL('image/jpeg', 0.92); });
      const L = ctrDetect(im2, { x: m / (1 + 2 * m) * 100, y: m * W / ch * 100 }), sh = ctrShares(L);
      if (sh) return sh;
    } catch (e) {}
  }
  return null;
}
function ctrRef() {
  const c = CTR.key && BYKEY.get(CTR.key); if (!c || CTR.side !== 'recto' || CTR.type === 'ecard') return '';
  const R = CTR.ref && CTR.ref.key === CTR.key ? CTR.ref : null;
  if (R && R.wait) return `<div class="small" style="text-align:center">${F('Mesure de l’image officielle…')}</div>`;
  if (R && R.on && R.sh) return `<div class="small" style="text-align:center">${F('Comparée à l’image officielle ({0} · {1}) : seul l’écart compte.', Math.round(R.sh[0]) + '/' + Math.round(100 - R.sh[0]), Math.round(R.sh[1]) + '/' + Math.round(100 - R.sh[1]))} <button class="linkbtn" data-act="ctrref" data-v="0">${F('Mesure brute')}</button></div>`;
  if (R && R.err) return `<div class="small" style="text-align:center">${F('Image officielle indisponible pour cette carte.')}</div>`;
  return `<button class="btn small" data-act="ctrref" data-v="1" style="align-self:center">${F('Comparer à l’image officielle')}</button>`;
}
function viewCentrage(params) {
  const key = params.get('carte') || ''; if (key) CTR.key = key;
  const c = CTR.key && BYKEY.get(CTR.key);
  const res = ctrResult(), okd = CTR.img && CTR.okd.has(CTR.img);
  const lines = CTR.L ? CTR.L.map((v, i) => `<div class="ctr-line ${i < 4 ? 'v' : 'h'} ${i % 4 === 0 || i % 4 === 3 ? 'out' : 'in'}${CTR.sel === i ? ' sel' : ''}" style="${i < 4 ? 'left' : 'top'}:${v}%" data-i="${i}"></div>`).join('') : '';
  return `<div class="top">${backBtn()}</div>
  <div class="pad stack" style="gap:12px">
    <h1 class="h1">${F('Mesurer le centrage')}</h1>
    ${c ? `<div class="small">${esc(cardName(c))} · ${esc(setName(c.set))}</div>` : ''}
    <div class="small">${F('Prends la carte en photo bien à plat, de face, sur un fond uni. Ajuste ensuite les traits : en bleu les bords de la carte, en vert le cadre de l’illustration. La photo reste sur ton appareil.')}</div>
    <div class="face" role="group" aria-label="${F('Face de la carte')}" style="align-self:flex-start">${[['recto', 'Recto'], ['verso', 'Verso']].map(([k, l]) => { const done = k === CTR.side ? CTR.L : (CTR.faces[k] || {}).L; return `<button data-act="ctrside" data-v="${k}" aria-pressed="${CTR.side === k}">${F(l)}${done ? ' ✓' : ''}</button>`; }).join('')}</div>
    ${ctrType()}
    <div class="row" style="gap:8px;flex-wrap:wrap"><label class="btn small primary">${icon('camera', 16)} ${F('Prendre une photo')}<input type="file" accept="image/*" capture="environment" class="sr" id="ctrfile"></label><label class="btn small">${F('Choisir dans la galerie')}<input type="file" accept="image/*" class="sr" id="ctrfile2"></label>
</div>
    ${CTR.img ? `${res && !res.bad && !okd ? `<div class="panel stack ctr-check" style="gap:8px"><b style="font-size:16px">${F('Vérifie les contours')}</b>
      <ol class="rd-steps"><li>${F('Les traits bleus suivent les bords de la carte.')}</li><li>${F('Les traits verts suivent le cadre de l’illustration.')}</li><li>${F('Un trait décalé ? Touche-le et fais-le glisser.')}</li></ol>
      <div class="small">${F('Mesure en cours : {0} · {1}', res.lr + '/' + (100 - res.lr), res.tb + '/' + (100 - res.tb))}</div>
      <button class="btn primary" data-act="ctrok" style="align-self:center">${F('Valider les contours')}</button></div>` : res && !res.bad ? `<div class="panel stack" data-reveal="ctr-${CTR.side}" style="gap:6px"><div class="row" style="justify-content:space-around;text-align:center"><div><div class="small">${F(res.labs[0])}</div><b class="num" style="font-size:26px">${res.lr}/${100 - res.lr}</b></div><div><div class="small">${F(res.labs[1])}</div><b class="num" style="font-size:26px">${res.tb}/${100 - res.tb}</b></div></div>
      <div style="text-align:center;font-size:15px">${F(CTR.type === 'full' && CTR.side === 'recto' ? 'Indication seulement : {0} au mieux.' : CTR.side === 'verso' ? 'Verso compatible avec un {0} au mieux.' : 'Recto compatible avec un {0} au mieux.', `<b class="${res.psa >= 9 ? 'gain' : res.psa <= 7 ? 'loss' : ''}">PSA ${res.psa}</b>`)}</div>
      ${ctrRef()}${ctrBoth()}<div class="row" style="justify-content:center;flex-wrap:wrap"><a class="btn primary" href="#/a-grader">${F('À grader ?')}</a><button class="btn" data-act="ctrshare">${icon('share', 16)} ${F('Partager ma mesure')}</button></div><button class="linkbtn" data-act="ctredit" style="align-self:center">${F('Modifier les contours')}</button>${ctrIa()}${ctrAsk()}<div class="small">${F('Seuils PSA : 55/45 au recto et 75/25 au verso pour un 10, 60/40 au recto pour un 9. Le centrage n’est qu’un critère : les coins, les bords et la surface comptent aussi.')}</div></div>` : res && res.bad ? `<div class="panel small">${F('Les traits se croisent : remets chaque trait bleu à l’extérieur de son trait vert.')}</div>` : ''}
    <div class="ctr-scroll" id="ctrscroll"${CTR.ar ? ` style="aspect-ratio:${CTR.ar}"` : ''}><div class="ctr-wrap" id="ctrwrap" style="width:${(CTR.zoom || 1) * 100}%"><img src="${CTR.img}" alt="" draggable="false">${lines}</div></div>
    <div class="row" style="gap:8px;align-items:center;justify-content:center"><button class="btn small" data-act="ctrzoom" data-v="-1" aria-label="${F('Dézoomer')}">−</button><span class="small">${F('Zoom')} ×${Math.round((CTR.zoom || 1) * 10) / 10}</span><button class="btn small" data-act="ctrzoom" data-v="1" aria-label="${F('Zoomer')}">+</button></div>
    <div class="ctr-loupe" id="ctrloupe" aria-hidden="true"><i></i></div>
    <div class="ctr-pick"><div class="ctr-pick-mid">${ctrCross(CTR.sel)}<b style="font-size:14px">${F(CTR_NAMES[CTR.sel])}</b>
      <div class="row" style="gap:10px;align-items:center"><button class="btn small" data-act="ctrnudge" data-v="-1" aria-label="${F('Déplacer')} −">${CTR.sel < 4 ? '◀' : '▲'}</button><span class="small">${F('Déplacer le trait')}</span><button class="btn small" data-act="ctrnudge" data-v="1" aria-label="${F('Déplacer')} +">${CTR.sel < 4 ? '▶' : '▼'}</button></div></div></div></div>
    ${res && !res.bad && !okd ? `<button class="btn primary" data-act="ctrok" style="align-self:center">${F('Valider les contours')}</button>` : ''}` : ''}
  </div>${tabs('')}`;
}
// Bords et surface par l'IA (test : visible seulement quand l'IA est activée sur l'appareil)
// Questions à l'IA sur la carte mesurée (abonnement plus tard ; aujourd'hui clé de test)
function ctrAsk() {
  if (!window.CallItIA || !CallItIA.ready() || !CTR.img) return '';
  const chat = CTR.chat && CTR.chat.img === CTR.img ? CTR.chat.msgs : [];
  return `<div class="stack small ctr-ask" style="gap:8px;border-top:1px solid var(--line);padding-top:10px"><b style="font-size:14px">✦ ${F('Une question sur ta carte ?')}</b>
  ${chat.map(m => `<div class="ctr-q">${esc(m.q)}</div><div class="ctr-a">${m.a ? esc(m.a) : m.err ? esc(m.err) : F('L’IA regarde…')}</div>`).join('')}
  ${chat.length ? '' : `<div class="chips wrap">${['Tu vois des défauts ?', 'Elle peut avoir 10 ?', 'Ça vaut le coup de la grader ?'].map(q => `<button class="chip" data-act="ctrask" data-q="${esc(F(q))}">${F(q)}</button>`).join('')}</div>`}
  <form class="row" style="gap:6px" data-form="ctrask" autocomplete="off"><input class="fld" id="ctrq" placeholder="${F('Ex. le coin en bas à droite est abîmé ?')}" maxlength="300" style="flex:1"><button class="btn small primary" type="submit">${F('Demander')}</button></form></div>`;
}
function ctrAskSend(q) {
  q = (q || '').trim(); if (!q || !window.CallItIA) return;
  const img = CTR.img; if (!CTR.chat || CTR.chat.img !== img) CTR.chat = { img, msgs: [] };
  const m = { q }; CTR.chat.msgs.push(m); render();
  const r0 = ctrResult(), ctx = r0 && !r0.bad ? `(${CTR.side === 'verso' ? 'Verso' : 'Recto'} de la carte. Centrage mesuré : gauche/droite ${r0.lr}/${100 - r0.lr}, haut/bas ${r0.tb}/${100 - r0.tb}, compatible PSA ${r0.psa} au mieux.)\n` : '';
  const sent = CTR.chat.msgs.filter(x => x.a || x === m).map((x, i) => i === 0 ? { ...x, q: ctx + x.q } : x);
  CallItIA.question(img, sent).then(r => { if (r.err) m.err = r.err; else m.a = r.a; if (CTR.img === img) render(); });
}
function ctrIa() {
  if (!window.CallItIA || !CallItIA.ready() || !CTR.img) return '';
  const r = CTR.ia && CTR.ia.img === CTR.img ? CTR.ia : null;
  if (!r) return `<button class="btn" data-act="ctria" style="align-self:center">✦ ${F('Vérifier les bords et la surface')}</button>`;
  if (r.wait) return `<div class="small" style="text-align:center">${F('L’IA examine la carte…')}</div>`;
  if (r.err) return `<div class="small">${esc(r.err)}</div>`;
  const j = r.j || {}, S2 = x => typeof x === 'string' ? x.trim() : '';
  if (j.visible === false) return `<div class="small">${F('La photo ne montre pas assez bien la carte : reprends-la de près, nette et bien éclairée.')}</div>`;
  const line = (t, v) => S2(v) ? `<div><b>${F(t)}</b> ${esc(S2(v))}</div>` : '';
  const def = Array.isArray(j.defauts) ? j.defauts.map(S2).filter(Boolean).slice(0, 8) : [];
  return `<div class="stack small" style="gap:4px;border-top:1px solid var(--line);padding-top:8px"><b style="font-size:14px">${F('Bords et surface (IA)')}</b>${line('Coins', j.coins)}${line('Bords', j.bords)}${line('Surface', j.surface)}${def.length ? `<div><b>${F('Défauts')}</b> ${esc(def.join(', '))}</div>` : ''}<div style="color:var(--muted)">${F('Estimation sur photo, fiabilité : {0}. Les tout petits défauts ne se voient qu’en vrai, sous la lumière.', esc(S2(j.fiabilite) || 'faible'))}</div></div>`;
}
// Petit schéma de carte : montre où placer le trait choisi (bleu = bord de la carte, vert = cadre de l'illustration)
// Choix du trait : interrupteur Bord / Cadre, puis le côté avec la croix de 4 boutons autour d'une mini-carte
const CTR_SIDE = { l: [0, 1], r: [3, 2], t: [4, 5], b: [7, 6] }; // [bord, cadre]
const ctrSideOf = i => Object.keys(CTR_SIDE).find(k => CTR_SIDE[k].includes(i));
function ctrCross(sel) {
  const cadre = sel % 4 === 1 || sel % 4 === 2, sd = ctrSideOf(sel);
  const b = (k, ar, lab) => `<button class="btn ctr-x-${k}${sd === k ? ' on' : ''}" data-act="ctrside2" data-v="${k}" aria-label="${F(lab)}">${ar}</button>`;
  return `<div class="face ctr-kind" role="group">${[['0', 'Bord'], ['1', 'Cadre']].map(([v, l]) => `<button data-act="ctrkind" data-v="${v}" aria-pressed="${(v === '1') === cadre}">${F(l)}</button>`).join('')}</div>
  <div class="ctr-cross">${b('t', '↑', 'Haut')}${b('l', '←', 'Gauche')}<div class="ctr-mini${cadre ? ' cadre' : ''}"><i></i></div>${b('r', '→', 'Droite')}${b('b', '↓', 'Bas')}</div>`;
}
function ctrPicto(i) {
  const V = [2, 7, 33, 38], H = [2, 8, 48, 54], v = i < 4, p = v ? V[i] : H[i - 4], out = i % 4 === 0 || i % 4 === 3;
  return `<svg class="ctr-picto" viewBox="0 0 40 56" width="40" height="56" aria-hidden="true"><rect x="2" y="2" width="36" height="52" rx="3" fill="none" stroke="#3b82f6" stroke-width="1.5"/><rect x="7" y="8" width="26" height="40" fill="none" stroke="#22c55e" stroke-width="1.5"/>${v ? `<line x1="${p}" y1="0" x2="${p}" y2="56"` : `<line x1="0" y1="${p}" x2="40" y2="${p}"`} stroke="#facc15" stroke-width="3"/><title>${out ? 'bord' : 'cadre'}</title></svg>`;
}
// Type de carte (recto) : la mesure se fait toujours entre le bord et le cadre imprimé ; seul le repère change
const CTR_TYPES = [['cls', 'Bordure'], ['holo', 'Holo'], ['full', 'Sans bordure'], ['ecard', 'e-Card / cristal']];
const CTR_TYPE_TIP = { ecard: 'Cartes de l’époque e-Card (Expedition, Aquapolis, Skyridge, cristal et leurs rééditions) : la gauche et le bas sont plus larges. On compare donc le haut à la droite, et la gauche au bas.', holo: 'Bordure holo ou dorée : place les traits verts sur le cadre de l’illustration et du texte, pas sur les reflets.', full: 'Sans bordure : les gradeurs jugent à l’œil. Place les traits verts sur la barre du nom et le bas du texte, le résultat reste une indication.' };
function ctrType() {
  if (CTR.side !== 'recto') return '';
  return `<div class="stack" style="gap:6px"><div class="small" style="font-weight:600">${F('Type de carte')}</div><div class="chips ctr-types" role="group" aria-label="${F('Type de carte')}">${CTR_TYPES.map(([k, l]) => `<button class="chip${CTR.type === k ? ' on' : ''}" data-act="ctrtype" data-v="${k}" aria-pressed="${CTR.type === k}">${F(l)}</button>`).join('')}</div>${CTR_TYPE_TIP[CTR.type] ? `<div class="small">${F(CTR_TYPE_TIP[CTR.type])}</div>` : ''}</div>`;
}
// Recto + verso : la note de centrage est la plus basse des deux faces
/* Partager ma mesure : une image (photo, traits, mesures) avec une petite signature CallIt! en bas, via le partage du téléphone */
async function ctrShare() {
  const res = ctrResult(); if (!CTR.img || !res || res.bad) return;
  const img = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = CTR.img; }).catch(() => null);
  if (!img) return toast(tr('Image illisible ou trop lourde'));
  const W = 1080, H = 1350, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d'), dark = document.documentElement.dataset.theme === 'dark';
  const ink = dark ? '#ececea' : '#16161a', bg = dark ? '#18181b' : '#ebebe8', green = dark ? '#4cc98a' : '#0a7a44';
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const boxH = 960, k = Math.min((W - 120) / img.naturalWidth, boxH / img.naturalHeight), w = img.naturalWidth * k, h = img.naturalHeight * k, x = (W - w) / 2, y = 60 + (boxH - h) / 2;
  g.drawImage(img, x, y, w, h);
  const L = CTR.L;
  if (L) {
    g.lineWidth = 3;
    L.forEach((v, i) => { const vert = i < 4, out = [0, 3, 4, 7].includes(i); g.strokeStyle = out ? '#3b82f6' : '#22c55e'; g.beginPath(); if (vert) { g.moveTo(x + v / 100 * w, y); g.lineTo(x + v / 100 * w, y + h); } else { g.moveTo(x, y + v / 100 * h); g.lineTo(x + w, y + v / 100 * h); } g.stroke(); });
  }
  const serif = 'Fraunces, Georgia, serif', sans = 'Geist, system-ui, sans-serif';
  g.fillStyle = ink; g.textAlign = 'center';
  g.font = `600 30px ${sans}`; g.globalAlpha = .65;
  g.fillText(tr(res.labs[0]), W / 2 - 220, 1090); g.fillText(tr(res.labs[1]), W / 2 + 220, 1090); g.globalAlpha = 1;
  g.font = `700 64px ${sans}`; g.fillText(`${res.lr}/${100 - res.lr}`, W / 2 - 220, 1165); g.fillText(`${res.tb}/${100 - res.tb}`, W / 2 + 220, 1165);
  g.font = `600 36px ${sans}`; g.fillStyle = res.psa >= 9 ? green : ink;
  g.fillText(F(CTR.side === 'verso' ? 'Verso compatible avec un {0} au mieux.' : 'Recto compatible avec un {0} au mieux.', 'PSA ' + res.psa), W / 2, 1230);
  // Signature discrète : CallIt! · callitcards.com
  g.textAlign = 'right'; g.font = `700 34px ${serif}`; g.fillStyle = ink; const site = '  ·  callitcards.com';
  g.font = `500 26px ${sans}`; const sw = g.measureText(site).width; g.globalAlpha = .7; g.fillText(site, W - 48, H - 40); g.globalAlpha = 1;
  g.font = `700 34px ${serif}`; g.fillStyle = green; g.fillText('It!', W - 48 - sw, H - 40); const itw = g.measureText('It!').width;
  g.fillStyle = ink; g.fillText('Call', W - 48 - sw - itw, H - 40);
  const blob = await new Promise(ok => cv.toBlob(ok, 'image/jpeg', .9)); if (!blob) return;
  const file = new File([blob], 'callit-centrage.jpg', { type: 'image/jpeg' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text: tr('Mon centrage mesuré avec CallIt!') + ' · https://callitcards.com' }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'callit-centrage.jpg'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function ctrBoth() {
  const other = CTR.side === 'recto' ? 'verso' : 'recto', o = CTR.faces[other], ro = o && o.L && CTR.okd.has(o.img) && ctrResult(o.L, other), rc = ctrResult();
  if (!ro || ro.bad) return `<button class="btn" data-act="ctrside" data-v="${other}" style="align-self:center">${F(other === 'verso' ? 'Mesurer le verso' : 'Mesurer le recto')}</button>`;
  const psa = Math.min(ro.psa, rc.psa), rr = CTR.side === 'recto' ? rc : ro, rv = CTR.side === 'recto' ? ro : rc;
  return `<div style="text-align:center;font-size:15px;border-top:1px solid var(--line);padding-top:8px">${F('Recto PSA {0} · Verso PSA {1}', rr.psa, rv.psa)}<br>${F('Centrage de la carte : {0} au mieux.', `<b class="${psa >= 9 ? 'gain' : psa <= 7 ? 'loss' : ''}">PSA ${psa}</b>`)}</div>`;
}
/* « À grader ? » : après les contours validés. Le centrage donne la note la plus haute possible ; on la met en face
   de la cote de la carte et du coût d'une note. Les prix des cartes notées et la population viendront plus tard :
   en attendant, liens vers les ventes terminées sur eBay et le rapport de population de PSA. */
/* Où faire grader : sociétés conseillées selon le pays (dossier, « Où faire grader, selon son pays » ; maquette Gradation).
   tiers : [prix d'une carte, valeur déclarée maximale ou null], dans la devise cur, TTC, sans l'envoi. Au-delà du dernier
   plafond, le prix n'a pas été relevé : l'appli renvoie au site. plus / minus : le point fort et le point faible.
   Relevé du 25/11/2026 sur les sites des sociétés (et guides récents pour PSA Europe, PCA et AP Grading).
   À revoir tous les trois mois. Aucun lien partenaire : si une société devient partenaire, le signaler ici (partner: true). */
const GRADE_CO = {
  psa: { cc: 'DE', name: 'PSA', where: 'Francfort, Allemagne', url: 'https://www.psacard.com/en-DE/services/tradingcardgrading', cur: 'EUR', tiers: [[49.99, 900], [69.99, 1300], [199, 2200], [349, 4500], [599, 9000]], days: '80 à 90 jours ouvrés', plus: 'Meilleure revente, pas de douane depuis l’Union européenne', minus: 'Lent, retour facturé en plus' },
  cgc: { cc: 'DE', name: 'CGC Cards', where: 'Munich, Allemagne', url: 'https://www.cgccards.com/', cur: 'EUR', tiers: [[22.61, 1000], [61.88, 3000], [113.05, 10000], [321.3, 100000]], days: 'environ 50 jours ouvrés', plus: 'Prix bas, bien acceptée à la revente', minus: 'Revente sous PSA, retour à partir de 33 €, adhésion annuelle' },
  beckett: { cc: 'DE', name: 'Beckett (BGS)', where: 'Lage, Allemagne', url: 'https://beckett.com/eu', cur: 'EUR', tiers: [[22.95, null]], days: '75 jours ouvrés et plus', plus: 'Sous-notes incluses, Black Label très recherché', minus: 'Pas forcément utile sans un centrage presque parfait' },
  aura: { cc: 'FR', name: 'Collect Aura', where: 'près de Paris, France', url: 'https://www.collectaura.com/pages/pricing-turnaround', cur: 'EUR', tiers: [[9.9, null]], days: '40 jours ouvrés', plus: 'La moins chère, même prix pour toutes les cartes', minus: 'Récente et moins connue, revente surtout en France' },
  pca: { cc: 'FR', name: 'PCA', where: 'Paris, France', url: 'https://pcagrade.com/fr/prices', cur: 'EUR', tiers: [[12.9, 249]], days: 'environ 6 mois', plus: 'Prix bas, la plus connue en France', minus: 'Très lent, revente surtout en France' },
  ccc: { cc: 'FR', name: 'CCC', where: 'près de Paris, France', url: 'https://www.cccgrading.com/en/prices', cur: 'EUR', tiers: [[25, 50], [28, 100], [32, 500], [36, null]], days: '10 jours ouvrés', plus: 'Rapide, bien notée par ses clients', minus: 'Plus chère que les autres sociétés françaises, revente surtout en France' },
  graad: { cc: 'IT', name: 'GRAAD', where: 'Milan, Italie', url: 'https://graad.eu/en/services-and-prices/graad-standard/', cur: 'EUR', tiers: [[24.4, 200]], days: '15 jours ouvrés', plus: 'En Italie, rapide', minus: 'Peu reconnue hors d’Italie, revente sous PSA' },
  ap: { cc: 'DE', name: 'AP Grading', where: 'Schüttorf, Allemagne', url: 'https://www.apgrading.net/', cur: 'EUR', tiers: [[19.9, null]], days: 'environ 20 jours ouvrés', plus: 'Même prix pour toutes les cartes, pas de douane dans l’Union européenne', minus: 'Peu connue, revente incertaine' },
  aog: { cc: 'DE', name: 'AOG', where: 'près de Nuremberg, Allemagne', url: 'https://ao-grading.com/', cur: 'EUR', tiers: [[23.9, 100], [26.9, 250], [36.9, 500]], days: 'environ 40 jours ouvrés', plus: 'Sous-notes incluses', minus: 'Revente sous PSA et CGC' },
  cgcuk: { cc: 'GB', name: 'CGC Cards', where: 'Londres, Royaume-Uni', url: 'https://www.cgccards.uk/submit/services-fees/cgc', cur: 'GBP', tiers: [[19, 800], [54, 2500], [96, 8000], [288, 80000]], days: 'environ 50 jours ouvrés', plus: 'Dépôt au Royaume-Uni, bien acceptée à la revente', minus: 'Revente sous PSA' },
  ace: { cc: 'GB', name: 'ACE Grading', where: 'Banbury, Royaume-Uni', url: 'https://acegrading.com/', cur: 'GBP', tiers: [[25, null]], days: '5 jours ouvrés', plus: 'Britannique, très rapide', minus: 'Formules à 12 £ et 15 £ réservées aux lots de 10 cartes' },
  psaus: { cc: 'US', name: 'PSA', where: 'États-Unis', url: 'https://www.psacard.com/services', cur: 'USD', tiers: [[59.99, 1000], [79.99, 1500], [199, 2500], [349, 5000], [599, 10000]], days: '90 à 100 jours ouvrés', plus: 'Meilleure revente', minus: 'Lent, cher pour une carte de faible valeur' },
  cgcus: { cc: 'US', name: 'CGC Cards', where: 'États-Unis', url: 'https://cgccards.com/fees', cur: 'USD', tiers: [[17, 1000], [45, 3000], [85, 10000]], days: '20 jours ouvrés et plus', plus: 'Prix bas, bien acceptée à la revente', minus: 'Revente sous PSA' },
  beckettus: { cc: 'US', name: 'Beckett (BGS)', where: 'Texas, États-Unis', url: 'https://www.beckett.com/grading', cur: 'USD', tiers: [], days: 'délai sur le site', plus: 'Sous-notes incluses, Black Label très recherché', minus: 'Pas forcément utile sans un centrage presque parfait' }
};
// Sociétés du pays d'abord, puis les références PSA, CGC et Beckett (dans tous les pays). Sans société locale : la liste GRADE_EU.
const GRADE_EU = ['psa', 'cgc', 'beckett', 'ap'];
const GRADE_FR = ['aura', 'pca', 'ccc', 'psa', 'cgc', 'beckett'], GRADE_DE = ['ap', 'aog', 'psa', 'cgc', 'beckett'], GRADE_US = ['psaus', 'cgcus', 'beckettus'];
const GRADE_BY_COUNTRY = { FR: GRADE_FR, MC: GRADE_FR, BE: GRADE_FR, LU: GRADE_FR, IT: ['graad', 'psa', 'cgc', 'beckett', 'ap'], DE: GRADE_DE, AT: GRADE_DE,
  GB: ['ace', 'cgcuk', 'beckettus'], US: GRADE_US, CA: GRADE_US, JP: GRADE_US, AU: GRADE_US };
// Pays sans société sur place : celles de l'Union européenne (ou des États-Unis) restent proposées, avec un rappel sur la douane
const GRADE_ABROAD = new Set(['CH', 'NO', 'IS', 'CA', 'JP', 'AU']);
const GRADE_SHIP = 12; // € : envoi aller et retour d'une carte en suivi, au moins
// Union européenne (et Monaco, dans son territoire douanier) : pas de douane entre ces pays
const GRADE_EU_CC = new Set(['AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MC', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK']);
const gradeCustoms = g => g.cc !== S.country && !(GRADE_EU_CC.has(g.cc) && GRADE_EU_CC.has(S.country));
// Formule la moins chère qui accepte une carte de cette valeur (valeur inconnue : la première). null : prix non relevé.
function gradeTier(g, val) {
  const r = g.cur === 'EUR' ? 1 : rate(g.cur); if (!r) return null;
  const t = val == null ? g.tiers[0] : g.tiers.find(([, cap]) => cap == null || val * r <= cap);
  return t ? t[0] / r : null;
}
// Prix d'une note dans la devise de l'utilisateur, au centime près : 9,90 €, 39,99 €, 32 € (un tarif ne s'arrondit pas comme une cote)
function gradeTxt(v) {
  const cur = rate(userCur()) ? userCur() : 'EUR', x = cur === 'EUR' ? v : v * rate(cur);
  return money(x, cur, Math.abs(x - Math.round(x)) < 0.005 ? 0 : 2);
}
const gradersFor = () => (GRADE_BY_COUNTRY[S.country] || GRADE_EU).map(id => ({ id, ...GRADE_CO[id] }));
// Note la moins chère parmi les sociétés conseillées pour le pays de l'utilisateur, sans l'envoi. null : aucun prix relevé pour cette valeur.
function gradeFee(val) { const xs = gradersFor().map(g => ({ g, fee: gradeTier(g, val) })).filter(x => x.fee != null).sort((a, b) => a.fee - b.fee); return xs[0] || null; }
function agWhere(p) {
  const list = gradersFor(), country = COUNTRY[S.country] || COUNTRY.FR;
  return `<div class="stack" style="gap:8px"><h2 class="h2">${F('Où faire grader')}</h2>
  <div class="small">${F('Ton pays : {0}.', `<b>${esc(tr(country.name))}</b>`)} <a href="#/reglages">${F('Changer')}</a><br>${p != null ? F('Prix pour une carte de cette valeur, sans l’envoi.') : F('Prix pour une carte, sans l’envoi.')}</div>
  ${list.map(g => { const fee = gradeTier(g, p); return `<a class="panel ag-co" href="${g.url}" target="_blank" rel="noopener">
    <span class="ag-co-top"><b>${esc(g.name)}</b><b class="num">${fee != null ? gradeTxt(fee) : F('voir le site')}</b></span>
    <span class="small">${esc(F(g.where))} · ${esc(F(g.days))}${gradeCustoms(g) ? ' · ' + F('douane à prévoir') : ''}</span>
    <span class="ag-plus">+ ${esc(F(g.plus))}</span><span class="ag-minus">− ${esc(F(g.minus))}</span>
    <span class="small"><u>${F('Voir le site')}</u> · ${F(g.partner ? 'lien partenaire' : 'lien externe, sans commission')}</span></a>`; }).join('')}
  ${p != null && p < 50 && list.some(g => g.id === 'psa') ? `<div class="note">${F('Sous {0} de valeur, PSA rapporte rarement plus qu’il ne coûte : regarde les sociétés moins chères, ou regroupe plusieurs cartes dans un envoi.', eurR(50))}</div>` : ''}
  ${GRADE_ABROAD.has(S.country) ? `<div class="note">${F('Ces sociétés sont dans un autre pays : vérifie qu’elles acceptent le tien, et compte la douane à l’aller et au retour.')}</div>` : ''}
  <div class="small">${F('Ce n’est qu’un repère : choisis la société que tu préfères. Tarifs relevés le 25/11/2026 : vérifie le prix sur le site avant d’envoyer tes cartes, et assure le colis.')}</div></div>`;
}
function agFace(side) {
  const f = side === CTR.side ? { img: CTR.img, L: CTR.L } : CTR.faces[side] || {};
  if (!f.img || !f.L || !CTR.okd.has(f.img)) return null;
  const r = ctrResult(f.L, side); return r && !r.bad ? r : null;
}
// Bordures pas symétriques par design (cartes cristal, certaines holo) : la comparaison avec l'image officielle corrige la mesure
function agRef(c) {
  if (!c) return '';
  const R = CTR.ref && CTR.ref.key === CTR.key ? CTR.ref : null;
  if (R && R.on && R.sh) return `<div class="small">${F('Recto comparé à l’image officielle de la carte.')}</div>`;
  if (R && R.wait) return `<div class="small">${F('Mesure de l’image officielle…')}</div>`;
  if (R && R.err) return `<div class="small">${F('Image officielle indisponible pour cette carte.')}</div>`;
  return `<div class="small">${F('Tu peux aussi comparer le recto à l’image officielle, si c’est bien la même impression.')}</div><button class="btn small" data-act="ctrref" data-v="1" style="align-self:center">${F('Comparer à l’image officielle')}</button>`;
}
// Choix de la carte sur « À grader ? » : nom (toutes langues) et numéro
function agSearch(v) {
  const box = document.getElementById('agres'); if (!box) return;
  const w = v.trim().toLowerCase().split(/\s+/).filter(Boolean); if (!w.length) { box.innerHTML = ''; return; }
  const hits = CARDS.filter(c => !isHidden(c) && w.every(x => Object.values(c.n).some(n => n && n.toLowerCase().includes(x)) || String(c.num).toLowerCase() === x || numLabel(c).toLowerCase().startsWith(x)))
    .sort((a, b) => (b.set.date || '').localeCompare(a.set.date || '')).slice(0, 12);
  box.innerHTML = hits.length ? hits.map(c => `<button class="line" data-act="agcard" data-key="${esc(c.key)}" style="width:100%;text-align:left;background:none;border:0;font:inherit;color:inherit"><span class="thumb">${cimg(c)}</span><span class="mid"><b>${esc(cardName(c))}</b><span>${esc(setName(c.set))} · ${esc(numLabel(c))}${year(c.set) ? ' · ' + year(c.set) : ''}</span></span></button>`).join('') : `<div class="small">${F('Aucune carte trouvée.')}</div>`;
}
function viewAGrader() {
  const c = CTR.key && BYKEY.get(CTR.key), rr = agFace('recto'), rv = agFace('verso');
  const top = `<div class="top">${backBtn()}</div>`;
  if (!rr && !rv) return `${top}<div class="pad stack" style="gap:12px"><h1 class="h1">${F('À grader ?')}</h1><div class="note">${F('Mesure d’abord le centrage de la carte et valide les contours.')}</div><a class="btn primary" href="#/centrage" style="align-self:flex-start">${F('Mesurer le centrage')}</a></div>${tabs('')}`;
  // Bordure holo ou sans bordure : recto pas symétrique par design. Sans comparaison à l'image officielle, sa mesure
  // n'est qu'une indication et ne limite pas la note ; le verso fait foi.
  const uneven = CTR.type === 'full', rrOk = rr && (!uneven || rr.ref) ? rr : null;
  const psa = Math.min(rrOk ? rrOk.psa : 10, rv ? rv.psa : 10), p = c ? price(c) : null;
  const fee = gradeFee(p);
  let verdict, why, cls;
  if (!rrOk && !rv) { verdict = 'À confirmer'; why = F('Les bordures du recto de cette carte ne sont pas égales : mesure le verso pour une note fiable.'); cls = 'mid'; }
  else if (psa <= 7) { verdict = 'Plutôt non'; why = F('Le centrage limite la note à PSA {0} au mieux.', psa); cls = 'no'; }
  else if (c && p != null && fee && p < fee.fee + GRADE_SHIP) { verdict = 'Plutôt non'; why = F('La carte vaut environ {0} : moins qu’une note et son envoi (environ {1}).', eurC(p), eurR(fee.fee + GRADE_SHIP)); cls = 'no'; }
  else if (psa >= 9) { verdict = 'Oui, ça peut valoir le coup'; why = F('Centrage compatible avec un PSA {0}. Vérifie aussi les coins, les bords et la surface.', psa); cls = 'yes'; }
  else { verdict = 'À voir'; why = F('Centrage compatible avec un PSA 8 au mieux : la note rapporte moins.'); cls = 'mid'; }
  const fr = r => r ? `${r.lr}/${100 - r.lr} · ${r.tb}/${100 - r.tb}` : '—', frLab = r => r && r.ecard ? ` <span class="ag-sub">${F('haut/droite · gauche/bas')}</span>` : '';
  const ebayDom = (COUNTRY[S.country] || COUNTRY.FR).ebay;
  const q = c ? (PKM ? cardName(c, 'en') || cardName(c) : c.n.en || cardName(c)) + ' ' + (PKM ? numLabel(c) : c.num) : '';
  const sold = g => `https://www.ebay.${ebayDom}/sch/i.html?_nkw=${encodeURIComponent(q + ' PSA ' + g)}&LH_Sold=1&LH_Complete=1`;
  const row = (lab, val, on) => `<div class="ag-row${on ? ' on' : ''}"><span>${lab}</span><b class="num">${val}</b></div>`;
  return `${top}<div class="pad stack" style="gap:14px">
  ${c && !CTR.pick ? `<div class="panel row ag-card" style="gap:14px;align-items:center"><span class="ag-thumb">${cimg(c)}</span><span class="stack" style="gap:4px;align-items:flex-start"><b style="font-size:20px">${esc(cardName(c))}</b><span class="small">${esc(setName(c.set))} · ${esc(numLabel(c))}</span><button class="linkbtn small" data-act="agpick">${F('Ce n’est pas la bonne carte ?')}</button></span></div>` : `<div class="panel stack" style="gap:8px"><b style="font-size:15px">${F('Quelle carte ?')}</b><input class="fld" id="agq" placeholder="${F('Nom ou numéro, ex. Lugia 149')}" autocomplete="off"><div class="list" id="agres"></div></div>`}
  <div class="ag-verdict ${cls}" data-reveal="ag"><div class="small">${F('À grader ?')}</div><b class="ag-big">${F(verdict)}</b>
    ${rrOk || rv ? `<span class="ag-pill">${F('Note visée : PSA {0} au mieux', psa)}</span>` : ''}
    <div class="ag-line"><span>${F('Recto')}${rr && !rrOk ? ' · ' + F('indication') : ''}${frLab(rr)}</span><b class="num">${fr(rr)}</b></div><div class="ag-line"><span>${F('Verso')}</span><b class="num">${fr(rv)}</b></div>
    <div class="ag-why">${why}</div></div>
  ${(uneven || CTR.type === 'ecard') && rr ? `<div class="panel stack" style="gap:8px"><b style="font-size:15px">${F('Le verso compte beaucoup ici')}</b><div class="small">${F('Sur ce type de carte, les bordures du recto ne sont pas égales par design. Le verso, avec sa bordure bleue identique sur toutes les cartes, donne la mesure la plus fiable du centrage.')}</div>${uneven ? agRef(c) : ''}</div>` : ''}
  ${!rr || !rv ? `<a class="btn${(uneven || CTR.type === 'ecard') && !rv ? ' primary' : ''}" href="#/centrage" data-act="ctrside" data-v="${rr ? 'verso' : 'recto'}" style="align-self:center">${F(rr ? 'Mesurer aussi le verso' : 'Mesurer aussi le recto')}</a>` : ''}
  ${c ? `<div class="panel stack" style="gap:2px"><h2 class="h2" style="margin-bottom:6px">${F('Prix selon la note')}</h2>
    ${row(F('Sans note (cote Cardmarket)'), eurC(p), false)}
    ${[8, 9, 10].map(g => row(`PSA ${g}${g === psa && (rrOk || rv) ? ' · ' + F('ta note visée') : ''}`, `<a href="${sold(g)}" target="_blank" rel="noopener">${F('Ventes eBay')}</a>`, g === psa && (rrOk || rv))).join('')}
    <div class="small" style="margin-top:8px">${fee ? F('Note la moins chère parmi les sociétés conseillées : {0} chez {1}, sans l’envoi.', gradeTxt(fee.fee), esc(fee.g.name)) + ' ' : ''}${F('Les liens ouvrent les ventes terminées sur eBay.')}</div></div>` : ''}
  ${agWhere(p)}
  ${c ? `<div class="stack" style="gap:8px"><h2 class="h2">${F('Tendance')}</h2><div class="panel stack" style="gap:6px" id="hist" data-cm="${c.cm || ''}" data-key="${esc(c.key)}">${c.cm ? `<div class="small">${F('Chargement de l’historique…')}</div>` : `<div class="small">${F('Pas d’historique : cette carte n’est pas sur Cardmarket.')}</div>`}</div></div>
  <div class="panel stack" style="gap:6px"><h2 class="h2">${F('Population PSA')}</h2><div class="small">${F('Combien d’exemplaires ont été notés, et combien en 10 : plus une note est rare, plus l’écart de prix est grand.')}</div><a class="extlink" href="https://www.psacard.com/pop" target="_blank" rel="noopener"><b>${F('Rapport de population PSA')}</b><span class="small">${F('lien externe')}</span></a></div>` : ''}
  <div class="small">${F('Le centrage n’est qu’un critère : les coins, les bords et la surface comptent aussi.')}</div>
  </div>${tabs('')}`;
}
// Loupe : agrandit la photo d'origine (pleine résolution) autour du trait choisi, pour le placer au pixel près
// Mise à jour sur place (sans recharger la page) : traits, résultat, croix et loupe
function ctrSoft() {
  if (!CTR.L || !document.getElementById('ctrwrap')) { render(); return; }
  document.querySelectorAll('#ctrwrap .ctr-line').forEach(el => { const i = +el.dataset.i; el.classList.toggle('sel', i === CTR.sel); el.style[i < 4 ? 'left' : 'top'] = CTR.L[i] + '%'; });
  const tmp = document.createElement('div'); tmp.innerHTML = viewCentrage(parseHash().q);
  for (const k of ['.ctr-pick', '.panel.stack']) { const n = tmp.querySelector(k), o = app.querySelector(k); if (n && o) { const v = o.querySelector('#ctrq'); const val = v && v.value; o.replaceWith(n); if (val) n.querySelector('#ctrq').value = val; } }
  ctrLoupe();
}
function ctrLoupe() {
  const wrap = document.getElementById('ctrwrap'), lp = document.getElementById('ctrloupe'); if (!wrap || !lp || !CTR.L) return;
  const i = CTR.sel, v = i < 4, Z = 6, ww = wrap.clientWidth, wh = wrap.clientHeight, lw = lp.clientWidth, lh = lp.clientHeight;
  const x = v ? CTR.L[i] : (CTR.L[1] + CTR.L[2]) / 2, y = v ? (CTR.L[5] + CTR.L[6]) / 2 : CTR.L[i];
  lp.style.backgroundImage = `url("${CTR.img}")`; lp.style.backgroundSize = `${ww * Z}px ${wh * Z}px`;
  lp.style.backgroundPosition = `${lw / 2 - x / 100 * ww * Z}px ${lh / 2 - y / 100 * wh * Z}px`;
  lp.className = 'ctr-loupe ' + (v ? 'v' : 'h') + (i % 4 === 0 || i % 4 === 3 ? ' out' : ' in');
}
function ctrLoad(file) {
  const r = new FileReader();
  r.onload = () => { const img = new Image(); img.onload = () => { CTR.img = r.result; CTR.asp = img.naturalWidth / img.naturalHeight; try { CTR.L = ctrDetect(img); } catch (e) { CTR.L = [3, 8, 92, 97, 3, 8, 92, 97]; } CTR.sel = 0; render(); }; img.src = r.result; };
  r.readAsDataURL(file);
}
// Glisser un trait : on prend le trait le plus proche du doigt, dans le bon sens
// Photo du centrage : un doigt déplace le trait le plus proche, deux doigts zooment et déplacent la photo
const CTRP = new Map(); let ctrDrag = null, ctrPinch = null;
const ctrZoomTo = (z, mx, my) => {
  const sc = document.getElementById('ctrscroll'), wrap = document.getElementById('ctrwrap'); if (!sc || !wrap) return;
  const oz = CTR.zoom || 1, nz = Math.max(1, Math.min(6, z)), r = sc.getBoundingClientRect();
  const ox = mx == null ? r.width / 2 : mx - r.left, oy = my == null ? r.height / 2 : my - r.top;
  const cx = (sc.scrollLeft + ox) / oz, cy = (sc.scrollTop + oy) / oz;
  CTR.zoom = nz; wrap.style.width = nz * 100 + '%';
  sc.scrollLeft = cx * nz - ox; sc.scrollTop = cy * nz - oy; CTR.sx = sc.scrollLeft; CTR.sy = sc.scrollTop;
  const z2 = document.querySelector('[data-act="ctrzoom"] + span'); if (z2) z2.textContent = F('Zoom') + ' ×' + Math.round(nz * 10) / 10;
};
document.addEventListener('pointerdown', e => {
  const wrap = e.target.closest && e.target.closest('#ctrwrap'); if (!wrap || !CTR.L) return;
  e.preventDefault(); CTRP.set(e.pointerId, [e.clientX, e.clientY]);
  if (CTRP.size === 2) {
    if (ctrDrag) { CTR.L[ctrDrag.i] = ctrDrag.v0; const el = wrap.querySelector(`[data-i="${ctrDrag.i}"]`); if (el) el.style[ctrDrag.i < 4 ? 'left' : 'top'] = ctrDrag.v0 + '%'; ctrDrag = null; }
    const [a, b] = [...CTRP.values()], sc = document.getElementById('ctrscroll');
    ctrPinch = { d0: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, z0: CTR.zoom || 1, m0: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], s0: [sc.scrollLeft, sc.scrollTop] };
    return;
  }
  if (CTRP.size > 2 || ctrPinch) return;
  const rc = wrap.getBoundingClientRect(), px = (e.clientX - rc.left) / rc.width * 100, py = (e.clientY - rc.top) / rc.height * 100;
  let best = CTR.sel, dist = 1e9;
  CTR.L.forEach((v, i) => { const dd = i < 4 ? Math.abs(v - px) * rc.width : Math.abs(v - py) * rc.height; if (dd < dist) { dist = dd; best = i; } });
  CTR.sel = best; ctrDrag = { id: e.pointerId, i: best, v0: CTR.L[best], moved: false, x0: e.clientX, y0: e.clientY };
  wrap.querySelectorAll('.ctr-line').forEach(el => el.classList.toggle('sel', +el.dataset.i === best)); ctrLoupe();
});
document.addEventListener('pointermove', e => {
  if (!CTRP.has(e.pointerId)) return;
  CTRP.set(e.pointerId, [e.clientX, e.clientY]);
  const wrap = document.getElementById('ctrwrap'); if (!wrap) return;
  if (ctrPinch && CTRP.size >= 2) {
    const [a, b] = [...CTRP.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]), m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], sc = document.getElementById('ctrscroll');
    sc.scrollLeft = ctrPinch.s0[0] - (m[0] - ctrPinch.m0[0]); sc.scrollTop = ctrPinch.s0[1] - (m[1] - ctrPinch.m0[1]);
    ctrZoomTo(ctrPinch.z0 * d / ctrPinch.d0, m[0], m[1]);
    const nz = CTR.zoom; ctrPinch.z0 = nz; ctrPinch.d0 = d; ctrPinch.m0 = m; ctrPinch.s0 = [sc.scrollLeft, sc.scrollTop];
    return;
  }
  if (!ctrDrag || ctrDrag.id !== e.pointerId) return;
  if (!ctrDrag.moved && Math.hypot(e.clientX - ctrDrag.x0, e.clientY - ctrDrag.y0) < 3) return;
  ctrDrag.moved = true;
  const rc = wrap.getBoundingClientRect(), i = ctrDrag.i, x = (e.clientX - rc.left) / rc.width * 100, y = (e.clientY - rc.top) / rc.height * 100;
  CTR.L[i] = Math.max(0, Math.min(100, i < 4 ? x : y));
  const el = wrap.querySelector(`[data-i="${i}"]`); if (el) el.style[i < 4 ? 'left' : 'top'] = CTR.L[i] + '%'; ctrLoupe();
});
// La petite vue zoomée se règle aussi au doigt : le trait choisi bouge finement (6 fois moins vite)
let ctrLp = null;
document.addEventListener('pointerdown', e => {
  const lp = e.target.closest && e.target.closest('#ctrloupe'); if (!lp || !CTR.L) return;
  e.preventDefault(); const wrap = document.getElementById('ctrwrap'); if (!wrap) return;
  ctrLp = { id: e.pointerId, x0: e.clientX, y0: e.clientY, v0: CTR.L[CTR.sel], w: wrap.clientWidth * 6, h: wrap.clientHeight * 6 };
});
document.addEventListener('pointermove', e => {
  if (!ctrLp || ctrLp.id !== e.pointerId) return; const i = CTR.sel, v = i < 4;
  CTR.L[i] = Math.max(0, Math.min(100, ctrLp.v0 + (v ? (e.clientX - ctrLp.x0) / ctrLp.w : (e.clientY - ctrLp.y0) / ctrLp.h) * 100));
  const el = document.querySelector(`#ctrwrap [data-i="${i}"]`); if (el) el.style[v ? 'left' : 'top'] = CTR.L[i] + '%'; ctrLoupe();
});
const ctrLpUp = e => { if (ctrLp && ctrLp.id === e.pointerId) { ctrLp = null; render(); } };
document.addEventListener('pointerup', ctrLpUp); document.addEventListener('pointercancel', ctrLpUp);
const ctrUp = e => {
  if (!CTRP.has(e.pointerId)) return; CTRP.delete(e.pointerId);
  if (ctrPinch) { if (CTRP.size === 0) ctrPinch = null; return; }
  if (ctrDrag && ctrDrag.id === e.pointerId) { ctrDrag = null; render(); }
};
document.addEventListener('pointerup', ctrUp); document.addEventListener('pointercancel', ctrUp);
document.addEventListener('scroll', e => { if (e.target && e.target.id === 'ctrscroll') { CTR.sx = e.target.scrollLeft; CTR.sy = e.target.scrollTop; } }, true);
function authGuide(c) {
  const tips = [...AUTH_TIPS.common, ...(AUTH_TIPS[GAME] || []), AUTH_TIPS.graded];
  const size = GI.size || '63 × 88 mm';
  return `<div class="pad" style="margin-top:12px"><details class="panel authguide"><summary>${icon('ruler', 20)}<span><b>Vérifier l’authenticité</b><span class="small">Les premiers contrôles à faire soi-même</span></span></summary>
  <ol>${tips.map(([t, d]) => `<li><b>${esc(t)}</b><span>${esc(d.replace('{size}', size))}</span></li>`).join('')}</ol>
  <div class="small">Ces contrôles éliminent la plupart des contrefaçons, mais aucun n’est une garantie. Pour une carte de valeur, la gradation par une société reconnue reste la meilleure preuve.</div></details></div>`;
}
/* Premier lancement : illustrations du jeu choisi. Pour les autres jeux : [nom anglais, numéro préféré] ;
   sans numéro (ou s'il manque), la version la plus chère qui a une image. */
const WELCOME_ART = {
  mtg: [['Serra Angel', '39'], ['Black Lotus', '232'], ['Shivan Dragon', '174'], ['Lightning Bolt', '161']],
  ygo: [['Dark Magician', 'LOB-005'], ['Blue-Eyes White Dragon', 'LOB-001'], ['Dark Magician Girl'], ['Exodia the Forbidden One', 'LOB-124']],
  op: [['Nami', 'EB05-055 p3'], ['Monkey.D.Luffy', 'P-001 p2'], ['Roronoa Zoro', 'OP09-076 p2'], ['Shanks', 'OP01-120 p2']]
};
function welcomeArt() {
  if (PKM) return ['en:sv01:210', 'en:sv08.5:164', 'en:sv08.5:156', 'en:sv08.5:155', 'en:sv08.5:165'];
  return (WELCOME_ART[GAME] || []).map(([name, num]) => {
    const cs = CARDS.filter(c => c.n.en === name && hasImg(c));
    const pick = (num && cs.find(c => c.num === num && (GAME !== 'mtg' || ['lea', 'leb'].includes(c.set.id)))) || cs.sort((x, y) => (price(y) || 0) - (price(x) || 0))[0];
    return pick ? pick.key : '';
  });
}
/* Premier lancement */
let welcomeFace = null;
const PITCH = [['search', 'La vraie cote de tes cartes', 'Prix Cardmarket du jour, historique et versions, dans ta devise.'],
  ['heart', 'Ta collection et tes envies', 'Ajoute une carte en deux gestes, suis sa valeur, note ce que tu cherches.'],
  ['shield', 'Rien n’est gardé chez nous', 'Ta collection reste sur ton appareil. Pas d’adresse, pas de téléphone, pas de carte bancaire. La sauvegarde en ligne est une option.']];
// Version courte (écran de bienvenue) : une ligne par point, pour voir le choix sans faire défiler
const PITCH_SHORT = ['Prix Cardmarket du jour, dans ta devise.', 'Ajoute une carte en deux gestes.', 'Pas d’adresse, pas de téléphone, pas de carte bancaire.'];
function pitchList(short) {
  return `<div class="pitch${short ? ' pitch-short' : ''}">${PITCH.map(([ic, t, d], i) => `<div class="pitch-i"><span class="pitch-ic">${icon(ic, short ? 16 : 18)}</span><div><b>${t}</b><div class="small">${short ? PITCH_SHORT[i] : d}</div></div></div>`).join('')}</div>`;
}
// Choix des langues : celles qu'on suit (avec −) et les autres à ajouter (avec +)
function langPicker() {
  const ex = excluded(), on = LANGS.filter(([c]) => !ex.has(c)), off = LANGS.filter(([c]) => ex.has(c));
  return `<div class="chips wrap">${on.map(([c, n]) => `<button class="chip on lp-chip" data-act="lang" data-v="${c}" aria-label="${esc(F('Retirer {0}', tr(n)))}">${esc(n)} <span class="lp-pm">−</span></button>`).join('')}</div>
  ${off.length ? `<div class="small" style="margin-top:2px">Ajouter une langue</div><div class="chips wrap">${off.map(([c, n]) => `<button class="chip lp-chip" data-act="lang" data-v="${c}" aria-label="${esc(F('Ajouter {0}', tr(n)))}"><span class="lp-pm">+</span> ${esc(n)}</button>`).join('')}</div>` : ''}`;
}
/* Premier lancement, étape 2 : pays (devise) et langues collectionnées */
const uiLangSel = () => `<select data-act="uilang" aria-label="Langue de l'appli" data-noi18n>${Object.entries(UI_LANGS).map(([c, n]) => `<option value="${c}" ${UI === c ? 'selected' : ''}>${n}</option>`).join('')}</select>`;
function viewWelcomePrefs() {
  const ex = excluded();
  return `<div class="pad welcome" style="padding-top:60px;min-height:100vh">
  <div class="title">${logo(30)}</div>
  <h1 style="font-family:var(--serif);font-weight:500;font-size:32px;line-height:1.1;margin:36px 0 0">Tes préférences</h1>
  <p class="sub" style="font-size:15px;margin:10px 0 0">Quelques réglages pour des prix et des résultats qui te parlent. Tout se change dans Réglages.</p>
  <div class="panel stack" style="margin-top:24px;gap:10px">
    <label class="setrow" style="padding:0"><span style="font-weight:600;font-size:15px">Langue de l'appli</span>${uiLangSel()}</label>
  </div>
  <div class="panel stack" style="margin-top:12px;gap:10px">
    <label class="setrow" style="padding:0"><span style="font-weight:600;font-size:15px">Ton pays</span><select data-act="set" data-k="country">${COUNTRIES.slice().sort((a, b) => tr(a[1]).localeCompare(tr(b[1]), UI)).map(([c, n]) => `<option value="${c}" ${S.country === c ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
    <div class="small">Les prix s’affichent en ${esc(userCur())}.</div>
  </div>
  <div class="panel stack" style="margin-top:12px;gap:10px">
    <b style="font-size:15px">Les langues que tu collectionnes</b>
    <div class="small">Les autres langues seront masquées des recherches (tu pourras toujours les voir).</div>
    ${langPicker()}
  </div>
  <button class="btn primary full" style="margin-top:22px" data-act="wdone">C'est parti</button>
  <button class="btn full" style="margin-top:8px;background:none" data-act="wback">Retour</button>
  </div>`;
}
function viewWelcome() {
  if (welcomeFace) return viewWelcomePrefs();
  const W = welcomeArt();
  return `<div class="pad welcome" style="padding-top:32px;min-height:100vh">
  <div class="title">${logo(30)}</div>
  <h1 style="font-family:var(--serif);font-weight:500;font-size:30px;line-height:1.1;margin:24px 0 0">Bienvenue sur Call<span class="it">It!</span></h1>
  <p class="sub" style="font-size:15px;margin:8px 0 0">L'outil gratuit pour connaître la valeur de tes cartes, faire les bons achats et suivre ta collection.</p>
  ${pitchList(true)}
  <h2 style="font-family:var(--serif);font-weight:500;font-size:24px;line-height:1.1;margin:26px 0 0">Tu collectionnes pour quoi ?</h2>
  <p class="sub" style="font-size:15px;margin:6px 0 0">On adapte l'appli. Tu pourras changer à tout moment.</p>
  <div class="small" style="font-weight:600;margin-top:16px">Ton jeu</div>${gameChips()}
  <div class="stack" style="margin-top:18px">
    <button class="choice" data-act="welcome" data-v="galerie">${art(W[0], 52, 72, 0)}<span><b>Pour la beauté des cartes</b><span>Illustrations, artistes, ma collection</span></span></button>
    <button class="choice" data-act="welcome" data-v="marche">${art(W[1], 52, 72, 0)}<span><b>Pour investir et revendre</b><span>Cotes, marges, portefeuille</span></span></button>
    <button class="choice" data-act="welcome" data-v="galerie"><span style="width:52px;height:72px;flex:none;position:relative">${art(W[2], 38, 53, -8, 'left:0;top:6px')}${art(W[3], 38, 53, 6, 'right:0;top:12px')}</span><span><b>Un peu des deux</b><span>Galerie par défaut, Marché à un geste</span></span></button>
    <button class="choice" data-act="welcome" data-v="joueur">${art(W[4] || W[1], 52, 72, 0)}<span><b>Pour jouer en tournoi</b><span>Decks du moment, prix d'un deck</span></span></button>
  </div>
  <p class="sub" style="text-align:center;margin-top:40px">Les prix restent visibles partout, juste plus discrets en Galerie.</p><p class="small" style="text-align:center">${PKM ? 'Illustrations : Soporifik par Tomokazu Komiya (Écarlate et Violet), Gromago-ex par Shigenori Negishi (Évolutions Prismatiques), Nymphali-ex par Cona Nitanda, Mentali-ex par sui et Lanssorien-ex par Jerky (Évolutions Prismatiques).' : 'Illustrations : ' + esc(joinFr(W.map(k => BYKEY.get(k)).filter(Boolean).map(c => cardName(c) + (ill(c) ? ' par ' + ill(c) : '') + ' (' + setName(c.set) + ')')))+ '.'}</p></div>`;
}

/* Carte « Mon profil » en haut de l'accueil : visage, collection, devise, langues */
function profileCard() {
  const p = portfolio();
  const faces = [['galerie', 'Galerie', 'Illustrations en grand, artistes, prix discrets'], ['marche', 'Marché', 'Cotes, plus-values, portefeuille'], ['joueur', 'Joueur', 'Decks du moment, cartes à réunir']];
  return `<div class="pad" style="padding-top:12px"><div class="panel stack" style="gap:12px">
    <b style="font-size:15px">Mon profil</b>
    <div class="profile-faces" role="group" aria-label="Visage de l'appli">${faces.map(([k, l, d]) => `<button data-act="face" data-v="${k}" aria-pressed="${k === curFace()}"><b>${l}</b><span>${d}</span></button>`).join('')}</div>
    <div class="profile-stats">
      <a href="#/collection"><b class="num">${p.n}</b><span>carte${p.n > 1 ? 's' : ''}</span></a>
      <a href="#/collection"><b class="num">${money(p.value)}</b><span>valeur</span></a>
      <a href="#/reglages"><b>${esc(userCur())}</b><span>${esc((COUNTRY[S.country] || COUNTRY.FR).name)}</span></a>
      <a href="#/langues"><b>${S.excluded.length ? LANGS.length - S.excluded.length : 'Toutes'}</b><span>langues</span></a>
    </div></div></div>`;
}
/* Accueil Galerie : l'artiste de la semaine, avec ses vraies cartes */
function weekNo() { const d = new Date(); const j = new Date(d.getFullYear(), 0, 1); return Math.floor((d - j) / 6048e5) + d.getFullYear() * 53; }
let artistsCache = null;
function topArtists() {
  if (artistsCache) return artistsCache;
  const cnt = new Map();
  for (const c of CARDS) if (c.i != null && c.set.reg === 'en') cnt.set(c.i, (cnt.get(c.i) || 0) + 1);
  artistsCache = [...cnt].filter(([i, n]) => n >= 60 && !/^(none|unknown|n\/a)$/i.test(DB.ills[i])).sort((a, b) => b[1] - a[1]).map(([i, n]) => ({ i, n, name: DB.ills[i] }));
  return artistsCache;
}
// Jeux sans illustrateurs connus : les cartes les plus chères à la place de l'artiste de la semaine
function newestSetBlock() {
  const ix = DB.sets.map((st, i) => [st, i]).filter(([st]) => st.date && st.date <= new Date().toISOString().slice(0, 10) && st.count >= 20)
    .sort((x, y) => y[0].date.localeCompare(x[0].date));
  for (const [st, i] of ix.slice(0, 5)) {
    const cs = CARDS.filter(c => c.s === i && hasImg(c) && !isHidden(c)).sort((x, y) => (price(y) || 0) - (price(x) || 0)).slice(0, 10);
    if (cs.length < 4) continue;
    return `<div class="sect"><div class="small eyebrow">Nouveauté · ${fdate(st.date)}</div><h2 style="font-family:var(--serif);font-weight:500;font-size:28px;line-height:1.05;margin:4px 0 0">${esc(setName(st))}</h2><div class="sub" style="margin-top:4px">les cartes phares · <a href="#/recherche?set=${i}">tout le set</a></div></div>
  <div class="hrow hero" style="padding-top:14px;padding-bottom:18px">${cs.map(c => tile(c, { big: true, eager: true, meta: eurC(price(c)) })).join('')}</div>`;
  }
  return '';
}
function topCardsBlock() {
  const top = CARDS.filter(c => c.p && price(c) > 0 && hasImg(c)).sort((x, y) => price(y) - price(x)).slice(0, 10);
  return `<div class="sect"><div class="small eyebrow">${esc(GI.name)}</div><h2 style="font-family:var(--serif);font-weight:500;font-size:28px;line-height:1.05;margin:4px 0 0">Les cartes les plus chères</h2><div class="sub" style="margin-top:4px">cote ${esc(SRC())}</div></div>
  <div class="hrow hero" style="padding-top:14px;padding-bottom:18px">${top.map(c => tile(c, { big: true, eager: true, meta: setName(c.set) + ' · ' + eurC(price(c)) })).join('')}</div>`;
}
// Installer CallIt! comme une appli (Android : bouton du navigateur ; iPhone : Partager → Sur l'écran d'accueil)
let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; if (!location.hash || location.hash === '#/') render(); });
window.addEventListener('appinstalled', () => { installEvt = null; render(); });
const isInstalled = () => window.CallItNatif || matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
function installLink() {
  if (isInstalled() || (!installEvt && !isIos())) return '';
  return `<button type="button" class="ctr-homelink" data-act="install">${icon('download', 16)}<b>${F('Installer l’appli')}</b><span>${F('sur ton écran d’accueil, gratuit')}</span></button>`;
}
function homeTop() {
  return `<div class="home-head"><div class="top home-top"><a class="title" href="#/" style="text-decoration:none;color:inherit" aria-label="CallIt!, accueil">${logo(32)}</a><div class="row" style="gap:8px">${faceSwitch()}<a class="iconbtn" href="#/reglages" aria-label="Mon profil et réglages">${icon('user')}</a></div></div>
  <div class="pad" style="padding-top:10px"><label for="homeq" class="sr">Chercher une carte</label><div class="searchrow"><input id="homeq" class="search" type="search" enterkeyhint="search" autocomplete="off" placeholder="${PKM || GAME === 'mtg' ? 'Carte, set ou artiste…' : 'Carte ou set…'}">${PKM ? scanBtn('iconbtn scanbig') : ''}</div>${PKM ? `<a class="ctr-homelink" href="#/centrage">${icon('ruler', 16)}<b>${F('Mesurer le centrage')}</b><span>${F('photo ou capture d’écran')}</span></a>` : ''}${installLink()}${gameChips()}</div></div>`;
}
function newcomerBlock() {
  if (collection.length || sealedCol.length || me) return '';
  // Déjà vu sur l'écran de bienvenue : ici, une seule ligne repliée qu'on ouvre si besoin
  return `<div class="pad" style="padding-top:14px"><details class="panel authguide newcomer"><summary>${icon('info', 20)}<span><b>C'est quoi, Call<span class="it">It!</span> ?</b></span></summary><div class="stack" style="gap:10px;margin-top:12px"><div class="small" style="font-size:14px">Un outil gratuit pour savoir ce que valent tes cartes, repérer les bonnes affaires et suivre ta collection. On ne vend rien et on n'achète rien à ta place.</div>${pitchList()}</div></details></div>`;
}
function startCta() {
  return `<a class="panel cta" href="#/recherche" data-act="gosearch"><div style="flex:1"><b style="font-size:16px">Ajoute ta première carte</b><div class="small" style="margin-top:3px">Cherche-la, puis « Ajouter à ma collection ».</div></div><span class="cta-plus">+</span></a>`;
}
function viewGalerieHome() {
  const arts = topArtists(); const a = arts[weekNo() % arts.length] || { i: -1, n: 0, name: '' };
  const cards = CARDS.filter(c => c.i === a.i && c.set.reg === 'en' && (c.dex || !PKM) && !isHidden(c)).sort((x, y) => (price(y) || 0) - (price(x) || 0)).slice(0, 8);
  const explore = [...(a.n ? [['Illustrateurs', '#/illustrateurs']] : []), ...Object.entries(PRESETS).filter(() => PKM).map(([k, p]) => [p.label, '#/recherche?preset=' + k])];
  if (!PKM) DB.sets.map((st, i) => [st, i]).filter(([st]) => st.count >= 20 && st.date).sort((x, y) => y[0].date.localeCompare(x[0].date)).slice(0, 6).forEach(([st, i]) => explore.push([setName(st), '#/recherche?set=' + i]));
  const cheap = CARDS.filter(c => PRESETS.petitprix.test(c) && !isHidden(c)).sort((x, y) => (y.set.date || '').localeCompare(x.set.date || '')).slice(0, 12);
  const mine = collection.slice(-8).reverse().map(it => BYKEY.get(it.key)).filter(Boolean);
  const pf_ = portfolio();
  const myBlock = mine.length
    ? `<div class="sect between"><h2 class="h2">Ma collection</h2><a class="sub" href="#/collection">tout voir</a></div><p class="pad small" style="margin:0 0 8px">${pf_.n} carte${pf_.n > 1 ? 's' : ''} · environ ${money(pf_.value)}</p><div class="hrow">${mine.map(c => tile(c)).join('')}</div>`
    : `<div class="sect"><h2 class="h2">Ma collection</h2></div><div class="pad">${startCta()}</div>`;
  return `${homeTop()}
  ${acctBanner()}${newcomerBlock()}
  <div class="home-cols"><div class="col-a">${myBlock}
  <div class="pad stack" style="gap:8px;margin-top:18px"><div class="small eyebrow">${PKM ? 'Explorer par' : 'Explorer'}</div>
  <div class="chips wrap">${explore.map(([l, h]) => `<a class="chip" href="${h}">${esc(l)}</a>`).join('')}</div></div></div>
  <div class="col-b">${followedBlock()}${PKM ? '' : newestSetBlock()}${a.n ? '' : topCardsBlock()}${!a.n ? '<!--' : ''}
  <div class="sect"><div class="small eyebrow">L'artiste de la semaine</div>
  <h2 style="font-family:var(--serif);font-weight:500;font-size:28px;line-height:1.05;margin:4px 0 0">${esc(a.name)}</h2>
  <div class="sub" style="margin-top:4px">${a.n} cartes · <a href="${artistHref(a.name)}">tout voir</a></div></div>
  <div class="hrow hero" style="padding-top:14px;padding-bottom:18px">${cards.map(c => tile(c, { big: true, eager: true })).join('')}</div>${!a.n ? '-->' : ''}
  ${cheap.length ? `<div class="sect between" style="padding-top:4px"><h2 class="h2">Petits prix</h2><a class="sub" href="#/recherche?preset=petitprix">tout voir</a></div><p class="pad small" style="margin:0 0 8px">Illustrations rares (AR) et spéciales (SIR) à moins de ${money(5).replace(/[,.]00/, '')}.</p><div class="hrow" style="padding-bottom:18px">${cheap.map(c => tile(c, { meta: setName(c.set) + ' · ' + eurC(price(c)) })).join('')}</div>` : ''}
  </div></div>
  ${tabs('')}`;
}

/* Valeur de MES exemplaires : la cote, ajustée selon l'état et la langue de chacun. Une seule règle, lue aussi par le Mode Live (live.js).
   Ce sont des règles générales du marché, pas des ventes mesurées : la valeur s'affiche comme une estimation.
   État : Cardmarket donne une cote unique, surtout faite de ventes en très bon état (NM). */
const OWN_COND_K = { MT: 1, NM: 1, EX: 0.85, GD: 0.72, LP: 0.6, PL: 0.45, PO: 0.3 };
// Langue : la cote Cardmarket mélange toutes les langues. Écart habituel du marché européen par rapport à ce mélange :
// l'anglais se vend plus cher, les langues moins demandées moins cher (écart plus fort sur les cartes anciennes).
const OWN_LANG_K = { en: 1.15, de: 0.95, fr: 0.85, it: 0.8, es: 0.8, pt: 0.75, ja: 1, ko: 0.7, 'zh-tw': 0.7, 'zh-cn': 0.6, th: 0.5, id: 0.5 };
const OWN_LANG_K_OLD = { en: 1.25, de: 0.75, fr: 0.7, it: 0.6, es: 0.6, pt: 0.5 };
// Pas d'écart quand la carte n'existe que dans cette langue (sa cote ne mélange rien), quand ses langues ne sont pas connues
// (cartes hors base) ni pour les autres jeux (la règle vient du marché Pokémon)
const ownLangK = (c, l) => (!l || !PKM || !c.langs.length || (c.langs.length === 1 && c.langs[0] === l) ? 1 : (isVintage(c) && OWN_LANG_K_OLD[l]) || OWN_LANG_K[l] || 1);
// Montant saisi par l'utilisateur dans une devise (prix payé, estimation) → euros
const curToEur = (v, cur) => { const r = cur && cur !== 'EUR' ? rate(cur) : null; return v == null ? null : r ? v / r : v; };
const ownPaid = it => (it.paid == null ? null : curToEur(it.paid, it.cur));
// Estimation d'UN exemplaire : { v (en euros), u (dans la devise affichée), how, base, ck, lk, holo } ou null si rien ne permet de l'estimer.
// how : 'moi' (ma propre estimation), 'paye' (gradée sans estimation : comptée au prix payé), 'cote' (la cote telle quelle), 'estim' (cote ajustée)
// u est arrondi comme une cote (395 €, 48 €, 3,30 €) : les totaux et les plus-values partent de ce montant, celui que l'on voit.
function ownValue(it, c) {
  if (it.grader) { const v = it.val > 0 ? curToEur(it.val, it.cur) : it.paid > 0 ? ownPaid(it) : null; return v == null ? null : { v, u: toUser(v), how: it.val > 0 ? 'moi' : 'paye' }; }
  const q = PKM ? (it.rev && quoteHolo(c)) || quote(c) : null, base = PKM ? (q ? q.v : null) : price(c);
  if (!(base > 0)) return null;
  const ck = OWN_COND_K[it.cond] || 1, lk = ownLangK(c, it.lang), v = base * ck * lk;
  return { v, u: PKM ? roundP(toUser(v)) : toUser(v), how: ck === 1 && lk === 1 ? 'cote' : 'estim', base, ck, lk, holo: !!(q && q.holo && it.rev) };
}
// Montant d'une ligne de la collection : sans centimes quand il tombe rond (305 €, 80 €), avec sinon (27,30 €, 1,50 €)
const ownMoney = x => { const y = Math.round(x * 100) / 100, a = Math.abs(y); return money(y, null, a >= 1000 || (a >= 10 && Number.isInteger(y)) ? 0 : 2); };

/* Accueil Marché : valeur de la collection et mouvements réels du guide Cardmarket */
// value : valeur estimée de tout ; paid : tout ce qui a été payé ; gain et base : plus-value et mise des seuls éléments dont on connaît
// le prix payé ET la valeur (sinon une carte sans prix payé compterait comme un gain entier) ; noPaid : exemplaires sans prix payé
function portfolio() {
  let value = 0, paid = 0, gain = 0, base = 0, graded = 0, n = 0, noPaid = 0;
  const add = (v, pd, q) => { if (v != null) value += v * q; if (pd != null) { paid += pd * q; if (v != null) { gain += (v - pd) * q; base += pd * q; } } };
  for (const it of collection) {
    const c = BYKEY.get(it.key); if (!c) continue;
    const q = it.qty || 1, e = ownValue(it, c); n += q;
    if (e && e.how === 'paye') graded += q;
    if (it.paid == null) noPaid += q;
    add(e ? e.u : null, toUser(ownPaid(it)), q);
  }
  for (const it of sealedCol) { const x = SEALED ? SEALED.byId.get(it.pid) : null; add(x ? toUser(sPrice(x)) : null, toUser(ownPaid(it)), it.qty || 1); }
  return { value, paid, gain, base, graded, n, noPaid };
}
// Plus-value en clair : « +120 € · +15 % »
const gainTxt = p => `${p.gain >= 0 ? '+' : ''}${money(p.gain)}${p.base ? ' · ' + (p.gain >= 0 ? '+' : '') + Math.round(p.gain / p.base * 100) + ' %' : ''}`;
function spark() {
  const h = load(PKM ? 'history' : 'history.' + GAME, {}); const pts = Object.entries(h).filter(p => /^\d{4}-\d\d-\d\d$/.test(p[0]) && isFinite(p[1])).sort((a, b) => a[0].localeCompare(b[0]));
  if (pts.length < 2) return `<div class="small" style="padding:6px 0 0">L'historique de la valeur se construit à partir d'aujourd'hui, à chaque mise à jour des cotes.</div>`;
  // Un point par jour noté, placé à sa date (deux relevés éloignés ne sont pas dessinés côte à côte)
  const ts = pts.map(p => Date.parse(p[0])), t0 = ts[0], dt = ts[ts.length - 1] - t0 || 1;
  const vs = pts.map(p => p[1]); const mn = Math.min(...vs), mx = Math.max(...vs), w = 350, hh = 56;
  const d = vs.map((v, i) => `${((ts[i] - t0) / dt * w).toFixed(1)} ${(hh - 4 - (mx === mn ? 0.5 : (v - mn) / (mx - mn)) * (hh - 8)).toFixed(1)}`).join(' L');
  return `<svg class="spark" viewBox="0 0 ${w} ${hh}" preserveAspectRatio="none" role="img" aria-label="Évolution de la valeur"><path d="M${d}" fill="none" stroke="var(--gain)" stroke-width="2.5" stroke-linejoin="round"/></svg>`;
}
function recordHistory() {
  if (!DB || !collection.length) return;
  const HK = PKM ? 'history' : 'history.' + GAME, RK = PKM ? 'histRule' : 'histRule.' + GAME; const h = load(HK, {}); const day = priceDate().slice(0, 10) || new Date().toISOString().slice(0, 10);
  let v = 0, cote = 0, avant = 0; // valeur du jour (en euros) avec la règle actuelle, puis avec les deux précédentes
  for (const it of collection) {
    const c = BYKEY.get(it.key); if (!c) continue;
    const n = it.qty || 1, e = ownValue(it, c); if (e) v += e.v * n;
    if (!it.grader) { cote += (price(c) || 0) * n; avant += ((c.p && (c.p[1] != null ? c.p[1] : c.p[0])) || 0) * n; }
  }
  // Quand la règle change, les jours déjà notés sont ramenés une fois à la nouvelle, sinon la courbe ferait une fausse marche.
  // Règle 2 (25/11/2026) : la cote CallIt! au lieu de la « tendance ». Règle 3 : la valeur de chaque exemplaire (état, langue, cartes gradées).
  const rule0 = load(RK, PKM ? 1 : 2); let rule = rule0;
  const scale = k => { if (k > 0 && isFinite(k)) for (const d of Object.keys(h)) if (d !== day) h[d] = Math.round(h[d] * k * 100) / 100; };
  if (rule < 2) { if (avant > 0) scale(cote / avant); rule = 2; }
  if (rule < 3) { if (cote > 0) scale(v / cote); rule = 3; }
  if (rule !== rule0) save(RK, rule);
  h[day] = Math.round(v * 100) / 100; save(HK, h);
}
let moversCache = null, moversAll = { up: false, down: false, top: false };
function movers() {
  if (moversCache) return moversCache;
  const en = CARDS.filter(c => c.set.reg === 'en' && hasImg(c) && price(c) > 0);
  let list;
  if (PKM) {
    // Mouvement fiable : cote à 5 € et plus, confiance bonne ou moyenne, et le dernier jour de ventes va dans le même sens que la semaine
    list = en.map(c => [c, quote(c)]).filter(([, q]) => q.v >= 5 && q.conf > 0 && q.src === 'moy' && q.d != null && q.m[2] > 0 && (q.d > 0 ? q.m[2] >= q.m[4] * 1.05 : q.m[2] <= q.m[4] * 0.95)).map(([c, q]) => [c, q.d]);
  } else {
    // Autres jeux : tendance proche de la moyenne 7 j, pas d'offre isolée
    list = en.filter(c => c.p[1] >= 5 && c.p[2] >= 5 && c.p[0] >= 1 && pf(c, 'avg7') > 0 && Math.abs(c.p[1] / pf(c, 'avg7') - 1) < 0.35).map(c => [c, (c.p[1] - c.p[2]) / c.p[2]]);
  }
  const evol = c => { if (PKM) { const q = quote(c); return q.conf > 0 ? q.d : null; } return c.p[2] ? (c.p[1] - c.p[2]) / c.p[2] : 0; };
  moversCache = { up: list.filter(x => x[1] > 0.05).sort((a, b) => b[1] - a[1]).slice(0, 20), down: list.filter(x => x[1] < -0.05 && x[1] > -0.6).sort((a, b) => a[1] - b[1]).slice(0, 20), top: en.slice().sort((a, b) => price(b) - price(a)).slice(0, 20).map(c => [c, evol(c)]) };
  return moversCache;
}
function moverRow([c, d]) {
  return `<a class="line" href="#/carte/${encodeURIComponent(c.key)}"><span class="thumb">${cimg(c)}</span><span class="mid"><b>${esc(cardName(c))}</b><span>${esc(setName(c.set))} · ${esc(numLabel(c))}</span></span><span class="px"><b class="num">${eurC(price(c))}</b>${d == null ? '' : `<span class="${d >= 0 ? 'gain' : 'loss'}" style="font-weight:700">${d >= 0 ? '+' : ''}${Math.round(d * 100)} % vs 30 j</span>`}</span></a>`;
}
function moverList(k, title, sub) {
  const m = movers()[k], all = moversAll[k];
  if (!m.length) return '';
  return `<div class="sect between"><h2 class="h2" style="font-family:var(--sans)">${title}</h2><span class="sub">${sub}</span></div>
  <div class="list">${m.slice(0, all ? 20 : 5).map(moverRow).join('')}</div>
  <div class="pad" style="margin-top:8px"><button class="btn small" data-act="mall" data-v="${k}">${all ? 'Voir moins' : 'Voir les 20'}</button></div>`;
}
function viewMarcheHome() {
  const p = portfolio(); const I = indices();
  const myBlock = p.n ? `<div class="pad" style="padding-top:18px"><a class="sub" href="#/collection" style="text-decoration:none">Valeur de ma collection ›</a>
  <div class="num" style="font-weight:700;font-size:40px;letter-spacing:-.03em;line-height:1.05">${money(p.value)}</div>
  ${p.base ? `<div style="font-size:14px;font-weight:600" class="${p.gain >= 0 ? 'gain' : 'loss'}">${gainTxt(p)} par rapport au prix payé</div>` : ''}
  ${colExtra('alert')}${colExtra('spark') || spark()}</div>` : `<div class="sect"><h2 class="h2" style="font-family:var(--sans)">Mon portefeuille</h2></div><div class="pad">${startCta()}</div>`;
  return `${homeTop()}
  ${acctBanner()}${newcomerBlock()}
  <div class="home-cols"><div class="col-a">${myBlock}
  ${PKM ? `<div class="pad" style="margin-top:16px"><a class="panel row" href="#/indices" style="text-decoration:none"><div style="flex:1"><div class="small" style="font-weight:600">Indice Vintage 100</div><div class="num" style="font-weight:700;font-size:22px">${eur(I.vint.v)} ${pct(I.vint.ch)}</div><div class="small">Les 100 cartes vintage de référence · aussi par set et par Pokémon</div></div><span style="transform:scaleX(-1);display:flex">${icon('back')}</span></a></div>` : ''}
  <div class="pad" style="margin-top:14px"><div class="note">${SRC() === 'Cardmarket' ? F('Cotes : guide de prix public Cardmarket du {0}, toutes langues et tous états confondus.', fdate(priceDate())) : F('Cotes : {0} (États-Unis), converties en euros puis dans ta devise.', esc(SRC()))}</div></div></div>
  <div class="col-b">
  ${PKM ? '' : newestSetBlock()}
  ${moverList('up', 'En hausse', 'sur 30 jours, cartes assez vendues')}
  ${moverList('down', 'En baisse', 'bonnes affaires possibles, sur 30 jours')}
  ${moverList('top', 'Les plus chères', 'cote ' + SRC())}
  </div></div>
  ${tabs('')}`;
}
/* Visage Joueur : decks du moment (data/meta/<jeu>.json : Limitless TCG pour Pokémon et One Piece, TopDeck.gg pour Magic et Yu-Gi-Oh!) */
let META = null, metaLoading = false;
function loadMeta() {
  if (META || metaLoading) return; metaLoading = true;
  fetch('data/meta/' + GAME + '.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).then(j => { META = j || { decks: [] }; render(); }).catch(() => { META = { decks: [] }; render(); });
}
function deckCost(d) {
  let t = 0, miss = 0;
  for (const [n, , , , key] of d.list || []) { const c = key && BYKEY.get(key); const p = c && price(c); if (p) t += n * p; else miss += n; }
  return { t, miss };
}
// Parties d'un deck selon le jeu : [code, titre affiché, titre dans une liste copiée]
const DECK_PARTS = {
  pkm: [['p', 'Pokémon', 'Pokémon'], ['t', 'Dresseurs', 'Trainer'], ['e', 'Énergies', 'Energy']],
  op: [['l', 'Leader', 'Leader'], ['c', 'Personnages', 'Character'], ['v', 'Événements', 'Event'], ['s', 'Lieux', 'Stage']],
  mtg: [['m', 'Deck principal', 'Deck'], ['r', 'Réserve', 'Sideboard']],
  ygo: [['m', 'Main Deck', 'Main'], ['x', 'Extra Deck', 'Extra'], ['r', 'Side Deck', 'Side']]
};
const deckParts = () => DECK_PARTS[GAME] || DECK_PARTS.pkm;
const deckSize = d => (d.list || []).reduce((a, x) => a + x[0], 0);
const gameDecks = () => myDecks.filter(d => (d.game || 'pkm') === GAME);
function deckCard(d) {
  if (!PKM) {
    const xs = (d.list || []).filter(x => x[4] && BYKEY.get(x[4]));
    const l = xs.find(x => x[5] === 'l'); if (l) return BYKEY.get(l[4]);
    const m = xs.filter(x => x[5] !== 'r' && x[5] !== 'x').sort((a, b) => (price(BYKEY.get(b[4])) || 0) - (price(BYKEY.get(a[4])) || 0));
    return m.length ? BYKEY.get(m[0][4]) : xs.length ? BYKEY.get(xs[0][4]) : null;
  }
  const ps = (d.list || []).filter(x => x[5] === 'p' && x[4] && BYKEY.get(x[4])).sort((a, b) => (/ ex$/i.test(b[1]) - / ex$/i.test(a[1])) || b[0] - a[0] || (price(BYKEY.get(b[4])) || 0) - (price(BYKEY.get(a[4])) || 0));
  return ps.length ? BYKEY.get(ps[0][4]) : null;
}
const metaSrc = () => (META && META.source) || 'Limitless TCG';
const metaCredit = () => `Données de tournois : <a href="${esc((META && META.sourceUrl) || 'https://play.limitlesstcg.com')}" target="_blank" rel="noopener">${esc(metaSrc())}</a>`;
/* ---------- Mes decks (mode Joueur) : gardés sur l'appareil, sauvegardés avec le compte ---------- */
let myDecks = cleanList(load('decks', []), 'deck');   // [{id, name, list: [[nb, nom, code set, numéro, clé, p|t|e]], created}]
const saveDecks = () => { save('decks', myDecks); syncSoon(); };
const PART_OF = { pokemon: 'p', 'pokémon': 'p', trainer: 't', trainers: 't', dresseur: 't', dresseurs: 't', energy: 'e', 'énergie': 'e', 'énergies': 'e', energie: 'e', energies: 'e',
  leader: 'l', character: 'c', characters: 'c', personnage: 'c', personnages: 'c', event: 'v', events: 'v', 'événement': 'v', 'événements': 'v', stage: 's', stages: 's', lieu: 's', lieux: 's',
  deck: 'm', main: 'm', mainboard: 'm', 'main deck': 'm', 'deck principal': 'm', sideboard: 'r', side: 'r', 'side deck': 'r', 'réserve': 'r', reserve: 'r', extra: 'x', 'extra deck': 'x',
  creature: 'm', creatures: 'm', sorcery: 'm', instant: 'm', land: 'm', lands: 'm', monster: 'm', monsters: 'm', spell: 'm', spells: 'm', trap: 'm', traps: 'm' };
// Codes de sets (TWM, MEG…) appris des listes de tournoi : code + numéro → clé CallIt!
function setCodeMap() {
  const m = new Map(); if (!PKM) return m;
  for (const d of (META && META.decks) || []) for (const [, , code, num, key] of d.list || []) if (code && key) { const sid = key.split(':')[1]; if (!m.has(code.toUpperCase())) m.set(code.toUpperCase(), sid); }
  return m;
}
let NAME_IDX = null;
function cardByName(name) {
  if (!NAME_IDX) { NAME_IDX = new Map(); for (const c of CARDS) { if (c.x) continue; for (const v0 of Object.values(c.n)) for (const v of v0.includes(' // ') ? [v0, v0.split(' // ')[0]] : [v0]) { const k = v.toLowerCase(); const cur = NAME_IDX.get(k); if (!cur || ((price(c) || 1e9) < (price(cur) || 1e9) && hasImg(c))) NAME_IDX.set(k, c); } } }
  const k = String(name || '').toLowerCase().replace(/\s+/g, ' ').trim();
  return NAME_IDX.get(k) || NAME_IDX.get(k.replace(/^basic /, '')) || NAME_IDX.get(k.replace(/ energy$/, ' energy').replace(/^/, 'basic ')) || null;
}
let NUM_IDX = null;
function cardByNum(num) {   // One Piece : « OP15-058 » → version de base de la carte
  if (!NUM_IDX) { NUM_IDX = new Map(); for (const c of CARDS) { const b = String(c.num).split(' ')[0].toUpperCase(); if (!NUM_IDX.has(b) || String(c.num).toUpperCase() === b) NUM_IDX.set(b, c); } }
  return NUM_IDX.get(String(num).toUpperCase()) || null;
}
function parseDeckText(txt) {
  const codes = setCodeMap(), out = [], okParts = deckParts().map(x => x[0]); let part = PKM ? 'p' : GAME === 'op' ? 'c' : 'm';
  for (let line of String(txt).split(/\r?\n/)) {
    line = line.trim().replace(/^~+\s*|\s*~+$/g, ''); if (!line) continue;
    const h = /^([A-Za-zÀ-ÿ ]+?)\s*:?\s*\(?\d*\)?\s*$/.exec(line), hp = h && PART_OF[h[1].trim().toLowerCase()]; if (hp) { if (okParts.includes(hp)) part = hp; continue; }
    if (!PKM) {
      const m2 = /^(\d+)\s*x?\s*(.+?)$/.exec(line); if (!m2) continue;
      let name = m2[2].trim().replace(/\s*\([A-Z0-9]{2,6}\)\s*[\w-]+$/, ''), code = '', c = null;   // Magic Arena : « (BLB) 123 »
      const num = /(?:^|\s)([A-Z]{1,4}\d{0,2}-\d{3})$/.exec(name);
      if (GAME === 'op' && num) { c = cardByNum(num[1]); code = num[1]; name = name.slice(0, num.index).trim() || (c ? c.n.en : num[1]); }
      if (!c) c = cardByName(name);
      const p = GAME === 'op' && c && DB.types && DB.types[c.t] === 'Leader' ? 'l' : part;
      out.push([+m2[1], c && !name ? c.n.en : name, code, '', c ? c.key : null, p]);
      continue;
    }
    const m = /^(\d+)\s*x?\s+(.+?)(?:\s+([A-Z][A-Z0-9-]{1,6})\s+([A-Za-z]{0,4}\d+[a-z]?))?$/.exec(line); if (!m) continue;
    const n = +m[1], name = m[2].trim().replace(/\{([GRWLPFDM])\}/g, (s, t) => ({ G: 'Grass', R: 'Fire', W: 'Water', L: 'Lightning', P: 'Psychic', F: 'Fighting', D: 'Darkness', M: 'Metal' })[t]), code = m[3] || '', num = m[4] || '';
    let key = null;
    const sid = code && codes.get(code.toUpperCase());
    if (sid) { const c = CARDS.find(c => c.key === 'en:' + sid + ':' + num || (c.set.id === sid && c.set.reg === 'en' && c.num.replace(/^0+(?=\d)/, '') === num.replace(/^0+(?=\d)/, ''))); if (c) key = c.key; }
    if (!key) { const c = cardByName(name); if (c) key = c.key; }
    const p = /energy|énergie/i.test(name) && part === 'p' ? 'e' : part;
    out.push([n, name, code, num, key, p]);
  }
  return out;
}
const deckText = d => deckParts().map(([t, , l]) => { const xs = (d.list || []).filter(x => x[5] === t); return xs.length ? `${l}: ${xs.reduce((a, x) => a + x[0], 0)}\n` + xs.map(x => `${x[0]} ${x[1]}${x[2] ? ' ' + x[2] + (x[3] ? (GAME === 'op' ? '-' : ' ') + x[3] : '') : ''}`).join('\n') : ''; }).filter(Boolean).join('\n\n');
// Exemplaires possédés d'une carte : toutes versions qui portent le même nom anglais
function ownedByName(key) {
  const c = BYKEY.get(key); if (!c) return 0; const en = (c.n.en || cardName(c)).toLowerCase();
  return collection.reduce((s, it) => { const x = BYKEY.get(it.key); return s + (x && (x.n.en || cardName(x)).toLowerCase() === en ? (it.qty || 1) : 0); }, 0);
}
function deckNeeds(d) {
  let miss = 0, cost = 0, have = 0, total = 0, noPrice = 0;
  const rows = (d.list || []).map(x => { const own = x[4] ? Math.min(x[0], ownedByName(x[4])) : 0; const need = x[0] - own; const c = x[4] && BYKEY.get(x[4]); const p = c && price(c); total += x[0]; have += own; miss += need; if (need) { if (p) cost += need * p; else noPrice += need; } return { x, own, need, c, p }; });
  return { rows, miss, cost, have, total, noPrice };
}
const DECK_EXAMPLE = {
  pkm: "Pokémon: 12&#10;4 Dreepy TWM 128&#10;4 Drakloak TWM 129&#10;&#10;Trainer: 36&#10;4 Professor's Research JTG 155&#10;&#10;Energy: 12&#10;12 Psychic Energy MEE 5",
  op: '1 Enel OP15-058&#10;4 Ohm OP15-061&#10;4 Satori OP15-066&#10;4 El Thor OP15-075',
  mtg: 'Deck&#10;4 Lightning Bolt&#10;4 Monastery Swiftspear&#10;20 Mountain&#10;&#10;Sideboard&#10;3 Duress',
  ygo: 'Main&#10;3 Ash Blossom &amp; Joyous Spring&#10;3 Maxx &quot;C&quot;&#10;&#10;Extra&#10;1 Accesscode Talker'
};
function viewMyDeckNew() {
  return `<div class="top">${backBtn()}<span class="sub" style="font-weight:600">Nouveau deck</span><span style="width:44px"></span></div>
  <form class="pad stack" data-form="newdeck" style="gap:12px">
    <label class="stack" style="gap:6px"><b>Nom du deck</b><input class="fld" name="name" maxlength="60" required placeholder="ex. Dragapult de Léo"></label>
    <label class="stack" style="gap:6px"><b>Liste (facultatif)</b><textarea class="fld" name="list" rows="12" placeholder="${DECK_EXAMPLE[GAME] || DECK_EXAMPLE.pkm}"></textarea></label>
    <div class="small">${F(PKM ? 'Colle ta liste (Pokémon TCG Live, Limitless…) : une carte par ligne, avec le nombre devant.' : 'Colle ta liste : une carte par ligne, avec le nombre devant.')}</div>
    <button class="btn primary full" type="submit">Créer le deck</button>
  </form>${tabs('')}`;
}
function viewMyDeck(id) {
  const d = myDecks.find(x => x.id === id);
  if (!d) return `<div class="top">${backBtn()}</div><div class="pad">Deck introuvable.</div>${tabs('')}`;
  const k = deckNeeds(d), parts = deckParts();
  const row = ({ x: [n, name, set, num, key], own, need, c, p }) => {
    const inner = `<span class="mid"><b>${n} × ${esc(c ? cardName(c) : name)}</b><span>${esc(set || '')} ${esc(num || '')} · ${need ? `<span class="loss">${F('il en manque {0}', need)}</span>` : `<span class="gain">${F('complet')}</span>`}${own ? ' · ' + F('tu en as {0}', own) : ''}${!c ? ' · ' + F('carte non reconnue') : ''}</span></span><span class="px"><b class="num">${need && p ? eur(need * p) : need ? '—' : ''}</b><span>${p ? F('{0} pièce', eur(p)) : F('pas de cote')}</span></span>`;
    return c ? `<a class="line" href="#/carte/${encodeURIComponent(key)}"><span class="thumb">${cimg(c)}</span>${inner}</a>` : `<div class="line"><span class="thumb"></span>${inner}</div>`; };
  const editing = deckEditId === d.id;
  return `<div class="top">${backBtn()}<span class="sub" style="font-weight:600">Mon deck</span><span style="width:44px"></span></div>
  <div class="pad"><h1 class="h1">${esc(d.name)}</h1><p class="sub" style="margin:6px 0 0">${F('{0} cartes · tu en as {1}', k.total, k.have)}</p>
  <div class="num" style="font-weight:700;font-size:32px;margin-top:12px">${k.miss ? eur(k.cost) : '✓'}</div><div class="small">${k.miss ? F(k.miss > 1 ? 'pour les {0} cartes qui te manquent' : 'pour la carte qui te manque', k.miss) + (k.noPrice ? ' · ' + F('{0} sans cote, non comptées', k.noPrice) : '') : F('Tu as toutes les cartes de ce deck.')}</div>
  ${PKM && k.total !== 60 && k.total ? `<p class="small" style="margin-top:8px">${F('Attention : la liste compte {0} cartes au lieu de 60.', k.total)}</p>` : ''}
  ${k.miss ? `<button class="btn primary full" style="margin-top:12px" data-act="mydeckwish" data-id="${esc(d.id)}">${icon('heart', 18)} ${F('Mettre les manquantes dans mes envies')}</button>` : ''}<div class="row" style="margin-top:10px;gap:8px;flex-wrap:wrap"><button class="btn small" data-act="mydeckedit" data-id="${esc(d.id)}">${F('Modifier la liste')}</button><button class="btn small" data-act="mydeckcopy" data-id="${esc(d.id)}">${F('Copier la liste')}</button><button class="btn small" data-act="mydeckdel" data-id="${esc(d.id)}">${F('Supprimer')}</button></div></div>
  ${editing ? `<form class="pad stack" data-form="editdeck" data-id="${esc(d.id)}" style="gap:10px;margin-top:8px"><label class="stack" style="gap:6px"><b>${F('Nom du deck')}</b><input class="fld" name="name" maxlength="60" required value="${esc(d.name)}"></label><label class="stack" style="gap:6px"><b>${F('Liste')}</b><textarea class="fld" name="list" rows="14" data-noi18n>${esc(deckText(d))}</textarea></label><div class="btns"><button class="btn" type="button" data-act="mydeckedit" data-id="">${F('Annuler')}</button><button class="btn primary" type="submit">${F('Enregistrer')}</button></div></form>` : ''}
  ${(d.list || []).length ? parts.map(([t, l]) => { const xs = k.rows.filter(r => r.x[5] === t); return xs.length ? `<div class="sect"><h2 class="h2" style="font-family:var(--sans)">${l} (${xs.reduce((a, r) => a + r.x[0], 0)})</h2></div><div class="list">${xs.map(row).join('')}</div>` : ''; }).join('') : `<p class="pad small">${F('Ce deck est vide. Touche « Modifier la liste » pour coller ta liste.')}</p>`}
  <p class="pad small" style="margin-top:12px">${F('« Tu en as » compte toutes les versions de la carte dans ta collection.')}</p>${tabs('')}`;
}
let deckEditId = '';
function myDecksBlock() {
  const items = gameDecks().map(d => { const k = deckNeeds(d); const c = deckCard(d); return `<a class="line" href="#/mondeck/${encodeURIComponent(d.id)}"><span class="thumb">${c ? cimg(c) : ''}</span><span class="mid"><b>${esc(d.name)}</b><span>${k.total ? (k.miss ? F('il te manque {0} cartes', k.miss) : F('complet')) : F('liste vide')}</span></span><span class="px"><b class="num">${k.miss ? eur(k.cost) : ''}</b><span>${k.miss ? F('à acheter') : ''}</span></span></a>`; }).join('');
  return `<div class="sect between"><h2 class="h2" style="font-family:var(--sans)">${F('Mes decks')}</h2><a class="sub" href="#/mondeck/nouveau">${F('+ Nouveau deck')}</a></div>
  ${items ? `<div class="list">${items}</div>` : `<div class="pad"><div class="panel small">${F('Colle une liste ou copie un deck du moment : CallIt! te dit ce qui te manque et combien ça coûte.')}</div></div>`}`;
}
function copyMetaDeck(id) {
  const d = META && META.decks.find(x => x.id === id); if (!d) return;
  const nd = { id: 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name: d.name, list: (d.list || []).map(x => x.slice(0, 6)), created: new Date().toISOString().slice(0, 10), from: d.id, game: GAME };
  myDecks.unshift(nd); saveDecks(); toast(F('Deck copié dans « Mes decks »')); location.hash = '#/mondeck/' + nd.id;
}
function viewJoueurHome() {
  let body;
  if (!META) { loadMeta(); body = `<div class="pad small" style="margin-top:16px">Chargement des decks du moment…</div>`; }
  else if (!META.decks || !META.decks.length) body = `<div class="pad" style="margin-top:16px"><div class="panel small">${F(PKM ? 'Pas de decks du moment pour l’instant. Reviens demain.' : 'Pas encore de decks du moment pour {0}.', esc(GI.name))}</div></div>`;
  else {
    const decks = META.decks.slice(0, 15);
    const hay = d => [d.name, ...(d.list || []).map(x => { const c = x[4] && BYKEY.get(x[4]); return (c ? cardName(c) + ' ' : '') + (x[1] || ''); })].join(' ').toLowerCase();
    body = `<div class="sect"><h2 class="h2" style="font-family:var(--sans)">Les decks les plus joués</h2></div>
  <p class="pad small" style="margin:0 0 10px">${F(META.online !== false ? 'Format {0} · {1} tournois en ligne et {2} joueurs, du {3} au {4}. Classés par nombre de places dans le top 8.' : 'Format {0} · {1} tournois et {2} joueurs, du {3} au {4}. Classés par nombre de places dans le top 8.', esc(tr(META.format === 'STANDARD' ? 'Standard' : META.format || 'Standard')), META.tournaments, (META.players || 0).toLocaleString(LOCALE), fdate(META.from), fdate(META.to))}</p>
  <div class="pad" style="padding-top:0;padding-bottom:10px"><label for="deckq" class="sr">${F('Chercher un deck ou une carte')}</label><input id="deckq" class="search" type="search" autocomplete="off" placeholder="${F('Chercher un deck ou une carte')}"></div>
  <div class="list" id="metadecks">${decks.map((d, i) => { const c = deckCard(d), k = deckCost(d); return `<a class="line" data-hay="${esc(hay(d))}" href="#/deck/${encodeURIComponent(d.id)}"><span class="thumb">${c ? cimg(c) : ''}</span><span class="mid"><b>${i + 1}. ${esc(d.name)}</b><span>${(Math.round(d.share * 1000) / 10).toLocaleString(LOCALE)} % des joueurs · ${d.top8} top 8</span></span><span class="px"><b class="num">${k.t ? eur(k.t) : '—'}</b><span>le deck${k.miss ? ' (≈)' : ''}</span></span></a>`; }).join('')}</div>
  <p class="pad small" id="deckq-none" style="display:none">${F('Aucun deck du moment ne correspond.')}</p>
  <p class="pad small" style="margin-top:10px">${F(PKM ? 'Prix : les 60 cartes de la meilleure liste, à la cote {0} du jour.' : 'Prix : toutes les cartes de la meilleure liste, à la cote {0} du jour.', esc(SRC()))} ${metaCredit()}.</p>`;
  }
  return `${homeTop()}${myDecksBlock()}${body}${tabs('')}`;
}
function viewDeck(id) {
  if (!META) { loadMeta(); return `<div class="top">${backBtn()}</div><div class="pad small">Chargement…</div>${tabs('')}`; }
  const d = (META.decks || []).find(x => x.id === id);
  if (!d) return `<div class="top">${backBtn()}</div><div class="pad">Deck introuvable.</div>${tabs('')}`;
  const k = deckCost(d), parts = deckParts();
  const row = ([n, name, set, num, key]) => { const c = key && BYKEY.get(key); const p = c && price(c); const own = c && collection.filter(it => it.key === key).reduce((a, it) => a + (it.qty || 1), 0);
    const inner = `<span class="mid"><b>${n} × ${esc(c ? cardName(c) : name)}</b><span>${esc(set || '')} ${esc(num || '')}${own ? ' · tu en as ' + own : ''}</span></span><span class="px"><b class="num">${p ? eur(n * p) : '—'}</b><span>${p ? eur(p) + ' pièce' : 'pas de cote'}</span></span>`;
    return c ? `<a class="line" href="#/carte/${encodeURIComponent(key)}"><span class="thumb">${cimg(c)}</span>${inner}</a>` : `<div class="line"><span class="thumb"></span>${inner}</div>`; };
  return `<div class="top">${backBtn()}<span class="sub" style="font-weight:600">Deck du moment</span><span style="width:44px"></span></div>
  <div class="pad"><h1 class="h1">${esc(d.name)}</h1><p class="sub" style="margin:6px 0 0">${(Math.round(d.share * 1000) / 10).toLocaleString(LOCALE)} % des joueurs · ${d.top8} fois dans un top 8 sur 30 jours</p>
  <div class="num" style="font-weight:700;font-size:32px;margin-top:12px">${eur(k.t)}</div><div class="small">${F('pour les {0} cartes', deckSize(d))}${k.miss ? ` (${k.miss} carte${k.miss > 1 ? 's' : ''} sans cote, non comptée${k.miss > 1 ? 's' : ''})` : ''}</div>
  ${d.best ? `<p class="small" style="margin-top:10px">${F(d.best.placing === 1 ? 'Liste : 1re place sur {1} joueurs, {2} ({3}).' : 'Liste : {0}e place sur {1} joueurs, {2} ({3}).', d.best.placing, d.best.players, esc(d.best.tournament || ''), fdate(d.best.date))}</p>` : ''}
  <div class="btns" style="margin-top:12px"><button class="btn primary" data-act="deckwish" data-id="${esc(d.id)}">${icon('heart', 18)} Mettre les cartes dans mes envies</button><button class="btn" data-act="deckcopy" data-id="${esc(d.id)}">Copier dans mes decks</button></div></div>
  ${deckHow(d)}
  ${parts.map(([t, l]) => { const xs = (d.list || []).filter(x => x[5] === t); return xs.length ? `<div class="sect"><h2 class="h2" style="font-family:var(--sans)">${l} (${xs.reduce((a, x) => a + x[0], 0)})</h2></div><div class="list">${xs.map(row).join('')}</div>` : ''; }).join('')}
  <p class="pad small" style="margin-top:12px">${metaCredit()}. Une même carte peut exister en plusieurs versions : le prix est celui de la version jouée dans la liste.</p>${tabs('')}`;
}
/* Comment joue un deck : calculé à partir des matchs de tournoi (Limitless) et des fiches des cartes (TCGdex) */
const PTYPE = { Grass: 'Plante', Fire: 'Feu', Water: 'Eau', Lightning: 'Électrique', Psychic: 'Psy', Fighting: 'Combat', Darkness: 'Obscurité', Metal: 'Métal', Dragon: 'Dragon', Colorless: 'Incolore', Fairy: 'Fée' };
const STAGE = { Basic: 'Pokémon de base', Stage1: 'Niveau 1', Stage2: 'Niveau 2', 'MEGA': 'Méga-Évolution' };
const pctTxt = x => Math.round(x * 100).toLocaleString(LOCALE) + ' %';
const wr = r => { const n = r[0] + r[1] + r[2]; return n ? r[0] / n : null; };
function deckHow(d) {
  const cards = d.cards || [];
  if (!cards.length && !d.rec) return '';
  const lg = (typeof UI !== 'undefined' && UI) || 'fr';
  const T = c => c.t[lg] || c.t.fr || c.t.en || Object.values(c.t)[0] || { name: '', ab: [], at: [] };
  const byId = Object.fromEntries((META.decks || []).map(x => [x.id, x]));
  const main = PKM ? cards[0] : null, all = META.decks || [];
  const strong = [], weak = [], strat = [];
  // Stratégie
  if (main) {
    const evo = cards.find(c => c.stage === 'Stage2') || cards.find(c => c.stage === 'Stage1');
    const att = cards.find(c => T(c).at.some(a => a[1])) || main;
    const bestAt = T(att).at.filter(a => a[1]).sort((a, b) => (parseInt(b[1]) || 0) - (parseInt(a[1]) || 0))[0];
    if (evo && evo.stage === 'Stage2') strat.push(F('Deck à évolution : il faut installer {0} (niveau 2) au plus vite.', esc(T(evo).name)));
    else if (evo) strat.push(F('{0} évolue une seule fois : le deck s’installe en un ou deux tours.', esc(T(evo).name)));
    else strat.push(F('Ses Pokémon principaux sont des Pokémon de base : il peut attaquer dès les premiers tours.'));
    if (bestAt) strat.push(F(bestAt[3] > 1 ? 'L’attaque principale est {0} de {1} ({2} dégâts, {3} Énergies).' : bestAt[3] ? 'L’attaque principale est {0} de {1} ({2} dégâts, 1 Énergie).' : 'L’attaque principale est {0} de {1} ({2} dégâts).', esc(bestAt[0]), esc(T(att).name), esc(String(bestAt[1])), bestAt[3]));
    const abil = cards.filter(c => T(c).ab.length);
    if (abil.length) strat.push(F('Il s’appuie aussi sur {0}.', andList(abil.map(c => F('le talent {0} de {1}', esc(T(c).ab[0][0]), esc(T(c).name))))));
  }
  const en = !PKM ? 0 : (d.list || []).filter(x => x[5] === 'e').reduce((a, x) => a + x[0], 0);
  if (en && en <= 7) strat.push(F('Seulement {0} Énergies : il mise sur ses Dresseurs et ses talents.', en));
  // Points forts et faibles tirés des matchs
  const rate = d.rec && wr(d.rec);
  if (rate != null && d.rec[0] + d.rec[1] + d.rec[2] >= 30) {
    if (rate >= 0.5) strong.push(F('{0} de victoires sur {1} matchs.', pctTxt(rate), (d.rec[0] + d.rec[1] + d.rec[2]).toLocaleString(LOCALE)));
    else weak.push(F('Seulement {0} de victoires sur {1} matchs : très joué, mais pas le plus solide.', pctTxt(rate), (d.rec[0] + d.rec[1] + d.rec[2]).toLocaleString(LOCALE)));
  }
  const avgTop = all.reduce((a, x) => a + x.top8, 0) / Math.max(1, all.reduce((a, x) => a + x.n, 0));
  if (d.n >= 20 && d.top8 / d.n >= avgTop * 1.25) strong.push(F('Va souvent loin : {0} tops 8 pour {1} joueurs.', d.top8, d.n));
  const mus = Object.entries(d.mu || {}).map(([o, r]) => [o, wr(r), r[0] + r[1] + r[2]]).filter(x => x[1] != null && byId[x[0]]);
  const good = mus.filter(x => x[1] >= 0.55).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const bad = mus.filter(x => x[1] <= 0.45).sort((a, b) => a[1] - b[1]).slice(0, 3);
  const muTxt = x => F('{0} ({1} de victoires sur {2} matchs)', `<a href="#/deck/${encodeURIComponent(x[0])}">${esc(byId[x[0]].name)}</a>`, pctTxt(x[1]), x[2]);
  if (good.length) strong.push(F('Bon contre {0}.', good.map(muTxt).join(', ')));
  if (bad.length) weak.push(F('Difficile contre {0}.', bad.map(muTxt).join(', ')));
  // Points tirés des cartes
  if (main) {
    if (main.hp >= 300) strong.push(F('{0} a {1} PV : dur à mettre KO en une attaque.', esc(T(main).name), main.hp));
    if (main.stage === 'Basic') strong.push(F('Rapide : {0} est un Pokémon de base, pas besoin d’évoluer.', esc(T(main).name)));
    if (main.stage === 'Stage2') weak.push(F('Lent au départ : il cale si ses petits Pokémon tombent avant d’évoluer.'));
    if (main.prizes === 3) weak.push(F('{0} est une Méga-Évolution ex : chaque KO donne 3 cartes Récompense à l’adversaire.', esc(T(main).name)));
    else if (main.prizes === 2) weak.push(F('{0} est un Pokémon ex : chaque KO donne 2 cartes Récompense à l’adversaire.', esc(T(main).name)));
    for (const w of main.weak || []) {
      const foes = all.filter(x => x.id !== d.id && (x.cards || [])[0] && x.cards[0].types.includes(w)).slice(0, 3);
      weak.push(F(foes.length ? 'Faiblesse {0} (dégâts doublés), un type joué par {1}.' : 'Faiblesse {0} (dégâts doublés).', tr(PTYPE[w] || w), foes.map(x => `<a href="#/deck/${encodeURIComponent(x.id)}">${esc(x.name)}</a>`).join(', ')));
    }
    if (main.retreat >= 3) weak.push(F('Retraite chère ({0} Énergies) : difficile de changer de Pokémon actif.', main.retreat));
  }
  const li = xs => `<ul class="how">${xs.map(x => `<li>${x}</li>`).join('')}</ul>`;
  const fiche = c => { const t = T(c); return `<div class="how-card"><b>${c.count} × ${esc(t.name)}</b> <span class="small">${esc(STAGE[c.stage] || c.stage || '')}${c.hp ? ' · ' + c.hp + ' PV' : ''}${c.types.length ? ' · ' + c.types.map(x => PTYPE[x] || x).join(', ') : ''}</span>
    ${t.ab.map(a => `<div class="small"><b>Talent · ${esc(a[0])}</b> : ${esc(a[1] || '')}</div>`).join('')}
    ${t.at.map(a => `<div class="small"><b>${esc(a[0])}${a[1] ? ' · ' + esc(String(a[1])) : ''}</b>${a[2] ? ' : ' + esc(a[2]) : ''}</div>`).join('')}</div>`; };
  if (!strat.length && !strong.length && !weak.length && !cards.length) return '';
  return `<div class="sect"><h2 class="h2" style="font-family:var(--sans)">${PKM ? 'Comment il joue' : F('Ses résultats')}</h2></div><div class="pad stack" style="gap:12px">
    ${strat.length ? `<div><b>Stratégie</b>${li(strat)}</div>` : ''}
    ${strong.length ? `<div><b class="gain">Points forts</b>${li(strong)}</div>` : ''}
    ${weak.length ? `<div><b class="loss">Points faibles</b>${li(weak)}</div>` : ''}
    ${cards.length ? `<details><summary><b>Les cartes clés et leurs attaques</b></summary><div class="stack" style="gap:10px;margin-top:8px">${cards.map(fiche).join('')}</div></details>` : ''}
    <div class="small">${F(META.online === false ? 'D’après {0} matchs de tournoi des 30 derniers jours ({1}), mis à jour chaque jour.' : 'D’après {0} matchs en ligne des 30 derniers jours ({1}), mis à jour chaque jour.', (META.matches || 0).toLocaleString(LOCALE), esc(metaSrc()))}</div></div>`;
}
function myDeckWish(id) {
  const d = myDecks.find(x => x.id === id); if (!d) return;
  let f = wish.folders.find(x => x.name === d.name); if (!f) { f = { id: 'f' + Date.now().toString(36), name: d.name }; wish.folders.push(f); }
  let n = 0;
  for (const r of deckNeeds(d).rows) if (r.need && r.c && !wished(r.c.key)) { wish.items.push({ id: 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), key: r.c.key, folder: f.id, max: null, lang: '', added: new Date().toISOString().slice(0, 10) }); n++; }
  saveWish(); toast(n ? F(n > 1 ? '{0} cartes ajoutées au dossier « {1} »' : '{0} carte ajoutée au dossier « {1} »', n, d.name) : 'Déjà dans tes envies');
}
function deckWish(id) {
  const d = META && META.decks.find(x => x.id === id); if (!d) return;
  let f = wish.folders.find(x => x.name === d.name); if (!f) { f = { id: 'f' + Date.now().toString(36), name: d.name }; wish.folders.push(f); }
  let n = 0;
  for (const [, , , , key] of d.list || []) if (key && BYKEY.get(key) && !wished(key)) { wish.items.push({ id: 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), key, folder: f.id, max: null, lang: '', added: new Date().toISOString().slice(0, 10) }); n++; }
  saveWish(); toast(n ? F(n > 1 ? '{0} cartes ajoutées au dossier « {1} »' : '{0} carte ajoutée au dossier « {1} »', n, d.name) : 'Déjà dans tes envies');
}
const fdate = s => `<time>${esc(fmtDate(s))}</time>`;
function fmtDate(s) { if (!s) return '—'; const d = new Date(s.slice(0, 10) + 'T12:00:00'); return isNaN(d) ? s : d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' }); }

/* Recherche */
let shown = 60, showHidden = false, lastQueryKey = '';
function viewSearch(params) {
  const qkey = params.toString();
  if (qkey !== lastQueryKey) { shown = 60; showHidden = false; lastQueryKey = qkey; }
  const res = searchCards(params);
  const ex = excluded();
  const sortL = { pert: 'pertinence', 'prix-': 'prix décroissant', 'prix+': 'prix croissant', recent: 'plus récentes', ancien: 'plus anciennes' };
  const langLabel = S.excluded.length ? tr('Langues :') + ' ' + LANGS.filter(([c]) => !ex.has(c)).map(l => l[2]).slice(0, 6).join(', ') + (LANGS.length - ex.size > 6 ? '…' : '') : 'Toutes les langues';
  const condLabel = 'État : ' + CONDS.find(c => c[0] === S.minCond)[1] + (S.minCond === 'PO' ? '' : ' et mieux');
  const filt = [];
  if (params.get('ill')) filt.push(['Illustrateur : ' + params.get('ill'), 'ill']);
  if (params.get('dex')) filt.push(['Pokémon n° ' + params.get('dex') + (DB.species[params.get('dex')] ? ' · ' + DB.species[params.get('dex')] : ''), 'dex']);
  if (params.get('set')) { const s = DB.sets[+params.get('set')]; if (s) filt.push(['Set : ' + setName(s), 'set']); }
  if (PRESETS[params.get('preset')]) filt.push([PRESETS[params.get('preset')].label, 'preset']);
  let body = '';
  if (!res) {
    const ideas = ['Dracaufeu', 'Pikachu', 'Psykokwak Team Rocket 65/82', 'Ectoplasma', 'Mew', 'Évoli', 'Lugia Neo', 'ピカチュウ'];
    body = `<div class="pad stack" style="margin-top:18px"><div class="small eyebrow">Essaie par exemple</div><div class="chips">${ideas.map(i => `<a class="chip" href="#/recherche?q=${encodeURIComponent(i)}">${esc(i)}</a>`).join('')}</div>
    <div class="note">Cherche par nom (dans n'importe quelle langue), set, numéro (« 65/82 ») ou illustrateur. ${CARDS.length.toLocaleString(LOCALE)} cartes, en 12 langues.</div></div>`
    + setBrowser(params);
  } else {
    const vis = [], hid = [];
    const qn = norm((params.get('q') || '').trim()), named = c => qn && c.langs.length === 1 && (norm(cardName(c)) === qn || norm(c.n.en || '') === qn || norm(NAME_ALIAS[c.n.en] || '') === qn);
    for (const c of res) (isHidden(c) && !named(c) ? hid : vis).push(c);
    if (S.sort === 'pert' && IMGS) { const a = vis.filter(hasImg), b = vis.filter(c => !hasImg(c)); vis.length = 0; vis.push(...a, ...b); } // cartes avec image d'abord
    const all = showHidden ? res : vis;
    const page = all.slice(0, shown);
    const hidLangs = [...new Set(hid.flatMap(c => c.langs))];
    body = `<div class="sect between" style="padding-top:16px"><b style="font-size:17px">${all.length.toLocaleString(LOCALE)} résultat${all.length > 1 ? 's' : ''}</b><label class="sub">tri : <select data-act="sort" style="border:0;background:transparent;font-weight:600">${Object.entries(sortL).map(([k, l]) => `<option value="${k}" ${S.sort === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
    ${hid.length ? `<div class="hidden-bar"><span>${esc(showHidden ? F('Les {0} résultats en {1} sont affichés pour cette recherche.', hid.length, andList(langNames(hidLangs))) : F(hid.length > 1 ? '{0} résultats masqués ({1}).' : '{0} résultat masqué ({1}).', hid.length, andList(langNames(hidLangs))))}</span><button class="btn small" data-act="showhidden">${showHidden ? 'Masquer' : 'Voir'}</button></div>` : ''}
    ${G() ? `<div class="grid">${page.map(c => tile(c, { badge: isHidden(c) ? 'exclue' : '', from: true })).join('')}</div>` : `<div class="list results">${page.map(c => lineRow(c, isHidden(c))).join('')}</div>`}
    ${all.length > shown ? `<div class="pad" style="margin-top:14px"><button class="btn full" data-act="more">Voir plus (${(all.length - shown).toLocaleString(LOCALE)} restants)</button></div>` : ''}
    ${!all.length && !hid.length ? `<div class="pad"><div class="note">Aucune carte trouvée. Vérifie l'orthographe ou essaie le nom anglais.</div></div>` : ''}`;
  }
  const typeTabs = !PKM ? '' : `<div class="pad" style="padding-top:12px"><div class="face" role="tablist" aria-label="Type">${[['', 'Cartes'], ['scelles', 'Scellés']].map(([k, l]) => { const q = new URLSearchParams(params); k ? q.set('t', k) : q.delete('t'); q.delete('cat'); return `<a role="tab" aria-selected="${(params.get('t') || '') === k}" class="${(params.get('t') || '') === k ? 'on' : ''}" href="#/recherche?${q}">${l}</a>`; }).join('')}</div></div>`;
  if (params.get('t') === 'scelles') return `<div class="top"><h1 class="title">Recherche</h1><div class="row" style="gap:8px"><a class="iconbtn" href="#/langues" aria-label="Réglages des langues">${icon('globe')}</a></div></div>
  ${typeTabs}<form class="pad" style="padding-top:12px" data-act="search"><label for="q" class="sr">Chercher un produit scellé</label><input id="q" class="search" type="search" enterkeyhint="search" autocomplete="off" placeholder="Display, ETB, booster, nom du set…" value="${esc(params.get('q') || '')}"></form>
  ${sealedResults(params)}${tabs('recherche')}`;
  return `<div class="top"><h1 class="title">Recherche${PKM ? '' : ' · ' + esc(GI.name)}</h1><div class="row" style="gap:8px">${PKM ? scanBtn() : gameSwitch()}<a class="iconbtn" href="#/langues" aria-label="Réglages des langues">${icon('globe')}</a></div></div>
  ${typeTabs}<form class="pad" style="padding-top:12px" data-act="search"><label for="q" class="sr">Chercher une carte</label><input id="q" class="search" type="search" enterkeyhint="search" autocomplete="off" placeholder="Nom, set, numéro, illustrateur…" value="${esc(params.get('q') || '')}"></form>
  <div class="pad chips" style="padding-top:12px"><a class="chip ${S.excluded.length ? 'on' : ''}" href="#/langues">${esc(langLabel)}</a><button class="chip on" data-act="cond">${esc(condLabel)}</button>${filt.map(([l, k]) => `<button class="chip on" data-act="unfilter" data-k="${k}" aria-label="${esc(F('Retirer le filtre {0}', tr(l)))}">${esc(l)} ✕</button>`).join('')}</div>
  ${scanPanel()}
  ${params.get('set') && DB.sets[+params.get('set')] ? colExtra('setLink', +params.get('set')) + setIndexPanel(+params.get('set')) : ''}
  ${body}${tabs('recherche')}`;
}

/* ---------- Parcourir les cartes par années puis collections (recherche vide) ---------- */
let SET_OPEN = null, SET_TOP = null;
// Carte la plus chère de chaque set, calculée une fois : sert d'aperçu et de repère de prix
function setTops() {
  if (SET_TOP) return SET_TOP;
  SET_TOP = new Map();
  for (const c of CARDS) { const p = price(c) || 0, t = SET_TOP.get(c.s); if (!t) SET_TOP.set(c.s, { n: 1, c, p, ci: c, cp: hasImg(c) ? p : -1 }); else { t.n++; if (p > t.p) { t.c = c; t.p = p; } if (hasImg(c) && p > t.cp) { t.ci = c; t.cp = p; } } }
  return SET_TOP;
}
function setBrowser(params) {
  const ja = params.get('zone') === 'japon', tops = setTops();
  const sets = DB.sets.map((st, i) => [st, i]).filter(([st, i]) => !st.x && st.date && tops.has(i) && (st.reg === 'ja') === ja)
    .sort((a, b) => b[0].date.localeCompare(a[0].date));
  if (!sets.length) return '';
  const nJa = DB.sets.filter((st, i) => !st.x && st.reg === 'ja' && tops.has(i)).length;
  const Y = new Map(); for (const x of sets) { const y = year(x[0]); if (!Y.has(y)) Y.set(y, []); Y.get(y).push(x); }
  const years = [...Y.keys()];
  const zk = ja ? 'j' : 'i'; if (!SET_OPEN) SET_OPEN = new Set(); if (!SET_OPEN.has(zk)) { SET_OPEN.add(zk); SET_OPEN.add(zk + 'y:' + years[0]); }
  const chev = o => `<svg class="seal-chev${o ? ' on' : ''}" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>`;
  const logo = st => PKM && st.reg === 'en' && st.serie ? `<span class="seal-sect-logo"><img class="seal-logo" src="https://assets.tcgdex.net/en/${encodeURIComponent(st.serie)}/${encodeURIComponent(st.id)}/logo.png" alt="" loading="lazy"></span>` : '';
  const row = ([st, i]) => { const t = tops.get(i), ix = setIndex(i);
    return `<a class="seal-coll" href="#/recherche?set=${i}"><span class="thumb set-chase">${cimg(t.ci)}</span><span class="mid">${logo(st)}<b>${esc(setName(st))}</b><span>${F('{0} cartes', t.n)}${t.p ? ' · ' + F('jusqu’à {0}', eur(t.p)) : ''}</span>${ix && ix.full.n >= 3 ? `<span>${F('Set complet ≈ {0}', eur(ix.full.v))} · ${pct(ix.full.ch)}</span><span>${F('Top 3 cartes')} · ${pct(ix.top.ch)} ${F('sur 30 j')}</span>` : ''}</span></a>`; };
  const q = v => { const u = new URLSearchParams(params); v ? u.set('zone', v) : u.delete('zone'); return '#/recherche?' + u; };
  return `<div class="sect between" style="padding-top:22px"><b style="font-size:17px">${F('Par collection')}</b></div>
  ${nJa ? `<div class="pad chips" style="padding-top:8px"><a class="chip ${!ja ? 'on' : ''}" href="${q('')}">${F('International')}</a><a class="chip ${ja ? 'on' : ''}" href="${q('japon')}">${F('Asie')}</a></div>` : ''}
  <div class="pad row" style="gap:8px;justify-content:flex-end;padding-top:4px"><button class="linkbtn small" data-act="setopenall" data-z="${zk}" data-v="1">${F('Tout déplier')}</button><button class="linkbtn small" data-act="setopenall" data-z="${zk}" data-v="0">${F('Tout replier')}</button></div>
  ${years.map(y => { const k = zk + 'y:' + y, o = SET_OPEN.has(k), xs = Y.get(y);
    return `<button class="seal-year" data-act="setopen" data-k="${esc(k)}" aria-expanded="${o}">${chev(o)}<b>${esc(y)}</b><span class="sub">${F(xs.length > 1 ? '{0} collections' : '{0} collection', xs.length)}</span></button>${o ? `<div class="seal-colls">${xs.map(row).join('')}</div>` : ''}`; }).join('')}`;
}

/* ---------- Scanner une carte : photo → lecture du texte (OCR, dans le téléphone) → cartes candidates ---------- */
let scanState = null; // { status: 'lecture'|'fini'|'erreur', progress, text, results, nums, sure, langs }
const scanInput = () => `<input type="file" accept="image/*" capture="environment" id="scanfile" hidden>`;
const scanBtn = (cls = 'iconbtn') => `<label class="${cls}" for="scanfile" role="button" aria-label="Scanner une carte avec l’appareil photo" title="Scanner une carte">${icon('camera')}</label>${scanInput()}`;
let ocrWorker = null;
function loadScript(src) { return new Promise((ok, ko) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = ko; document.head.appendChild(s); }); }
async function getOcr() {
  if (ocrWorker) return ocrWorker;
  if (!window.Tesseract) await loadScript('vendor/ocr/tesseract.min.js');
  const base = new URL('vendor/ocr/', location.href).href;
  ocrWorker = await Tesseract.createWorker('eng', 1, { workerPath: base + 'worker.min.js', corePath: base + 'core', langPath: base + 'lang', gzip: true,
    logger: m => { if (scanState && m.status === 'recognizing text') { scanState.progress = m.progress; const b = document.querySelector('.scan-bar > span'); if (b) b.style.width = Math.round(m.progress * 100) + '%'; } } });
  return ocrWorker;
}
function prepImage(file) {
  return new Promise((ok, ko) => {
    const img = new Image(); img.onload = () => {
      const k = Math.min(1, 1600 / Math.max(img.width, img.height)), w = Math.round(img.width * k), h = Math.round(img.height * k);
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d');
      g.filter = 'grayscale(1) contrast(1.4)'; g.drawImage(img, 0, 0, w, h); URL.revokeObjectURL(img.src); ok(cv);
    }; img.onerror = ko; img.src = URL.createObjectURL(file);
  });
}
// Associe le texte lu aux cartes : numéro « 65/82 » d'abord, puis le nom (toutes langues)
function matchScan(text) {
  const t = norm(text).replace(/[|]/g, '/');
  const nums = [...t.matchAll(/\b([a-z]{0,3}\d{1,3}[a-z]?)\s*\/\s*([a-z]{0,3}\d{1,3})\b/g)].map(m => [m[1].replace(/^0+(?=\d)/, ''), m[2].replace(/^0+(?=\d)/, '')]);
  const words = new Set(t.split(/[^a-z0-9éèêàâîïôûùç'-]+/).filter(w => w.length >= 3));
  const nameScore = c => { let best = 0; for (const n of Object.values(c.n)) { const nn = norm(n); if (nn.length >= 3 && t.includes(nn)) best = Math.max(best, 3 + nn.length / 10); else { const parts = nn.split(/[\s-]+/).filter(w => w.length >= 3); const hit = parts.filter(w => words.has(w)).length; if (hit) best = Math.max(best, hit / parts.length * 2); } } return best; };
  const scored = [];
  for (const c of CARDS) {
    let sc = 0;
    for (const [a, b] of nums) { if (c.numN === a) { sc += 3; if (String(c.set.count || '') === b.replace(/\D/g, '') || norm(String(c.set.count || '')) === b) sc += 3; } }
    if (sc || !nums.length) { const ns = nameScore(c); sc += ns; if (!nums.length && ns < 2) sc = 0; }
    if (sc >= 3) scored.push([c, sc]);
  }
  scored.sort((a, b) => b[1] - a[1] || (b[0].set.reg === 'en') - (a[0].set.reg === 'en'));
  const top = scored.length ? scored[0][1] : 0;
  // Carte sûre : une seule carte de la base a à la fois son numéro ET son nom entier lus sur la photo. Le nom se lit mot à mot
  // (« Mew » ne se reconnaît pas dans « Mewtwo ») et dans une langue où la carte est imprimée (pas sa traduction).
  // Si plusieurs cartes restent, on les départage dans cet ordre : le total du set lu sur la photo (« /82 »), puis les langues
  // que je suis (la carte indonésienne porte le même nom que l'anglaise), puis le nom le plus long (« Hitmonchan ex » se lit
  // aussi dans « Rocket's Hitmonchan ex »). Les autres candidates ne sont alors plus proposées. langs : les langues du nom lu.
  const plain = x => x.replace(/[^a-z0-9'-]+/g, ' ').trim(), tw = ' ' + plain(t) + ' ', ex = excluded();
  const names = c => (c.langs.length ? c.langs : Object.keys(c.n)).map(l => [l, c.n[l] ? plain(norm(c.n[l])) : '']).filter(x => x[1].length >= 3 && tw.includes(' ' + x[1] + ' '));
  const total = c => nums.some(([a, b]) => c.numN === a && (String(c.set.count || '') === b.replace(/\D/g, '') || norm(String(c.set.count || '')) === b));
  let both = scored.filter(([c]) => nums.some(([a]) => c.numN === a)).map(([c]) => [c, names(c)]).filter(x => x[1].length);
  if (both.length > 1) both = both.filter(([c]) => total(c));
  if (both.length > 1) both = both.map(([c, ns]) => [c, ns.filter(x => !ex.has(x[0]))]).filter(x => x[1].length);
  if (both.length > 1) { const len = x => Math.max(...x[1].map(y => y[1].length)), mx = Math.max(...both.map(len)); both = both.filter(x => len(x) === mx); }
  if (both.length === 1) return { nums, results: [both[0][0]], sure: true, langs: both[0][1].map(x => x[0]) };
  return { nums, results: scored.filter(x => x[1] >= Math.max(3, top * 0.6)).slice(0, 30).map(x => x[0]), sure: false, langs: [] };
}
async function runScan(file) {
  scanState = { status: 'lecture', progress: 0, text: '', results: [] };
  if (!location.hash.startsWith('#/recherche')) location.hash = '#/recherche?scan=1'; else render();
  try {
    const [cv, w] = await Promise.all([prepImage(file), getOcr()]);
    const { data } = await w.recognize(cv);
    const m = matchScan(data.text || '');
    scanState = { status: 'fini', text: (data.text || '').replace(/\s+/g, ' ').trim().slice(0, 160), results: m.results, nums: m.nums, sure: m.sure, langs: m.langs };
  } catch (e) { scanState = { status: 'erreur', text: String(e && e.message || e) }; }
  render();
}
function scanPanel() {
  if (!scanState) return '';
  const st = scanState;
  let body;
  if (st.status === 'lecture') body = `<div class="sub">Lecture de la carte… (quelques secondes la première fois)</div><div class="scan-bar"><span style="width:${Math.round((st.progress || 0) * 100)}%"></span></div>`;
  else if (st.status === 'erreur') body = `<div class="sub">La lecture n’a pas marché. Réessaie avec une photo plus nette, ou tape le nom.</div>`;
  else body = st.results.length
    ? `<div class="sub">${st.results.length > 1 ? 'Laquelle est-ce ? Les plus probables d’abord, juste en dessous.' : 'Carte reconnue, juste en dessous :'}</div>`
    : `<div class="sub">Aucune carte reconnue. Astuce : cadre la carte bien à plat, avec le numéro en bas (par exemple 65/82) net et lisible.</div>`;
  return `<div class="pad" style="margin-top:12px"><div class="panel stack" style="gap:8px"><div class="between"><b style="font-size:15px">${icon('camera', 18)} Scan de carte</b><button class="btn small" data-act="scanclose">Fermer</button></div>${body}
  ${st.text ? `<details class="small"><summary>Texte lu</summary>${esc(st.text)}</details>` : ''}
  ${st.status !== 'lecture' ? `<div class="row" style="gap:8px;flex-wrap:wrap"><label class="btn small" for="scanfile" role="button">Scanner une autre carte</label><label class="btn small">${F('Choisir dans la galerie')}<input type="file" accept="image/*" class="sr" id="scanfile2"></label></div>` : ''}</div></div>
  ${st.status === 'fini' && st.results.length ? `<div class="list" style="margin-top:10px">${st.results.slice(0, 12).map(c => lineRow(c, false)).join('')}</div>${st.sure ? colExtra('scanAdd', st) : ''}` : ''}`;
}

/* ---------- Produits scellés (catalogue et cotes Cardmarket, data/sealed.json mis à jour chaque lundi) ---------- */
let SEALED = null, sealedLoading = null;
let sealedCol = cleanList(load('sealed', []), 'sealed'); // [{id, pid, lang, qty, paid, cur, date, note}]
const saveSealed = () => { save('sealed', sealedCol); syncSoon(); };
const CAT_FR = { 'Pokémon Booster': 'Boosters', 'Pokémon Display': 'Displays', 'Pokémon Elite Trainer Boxes': 'ETB', 'Pokémon Box Set': 'Coffrets', 'Pokémon Tins': 'Tins', 'Pokémon Blisters': 'Blisters', 'Pokémon Theme Decks': 'Decks', 'Pokémon Trainer Kits': 'Kits dresseur', 'Pokémon Lot': 'Lots', 'PCG Set': 'Sets complets' };
const SEAL_ASIA = /\b(japanese|jp|chinese|korean|thai|indonesian|simplified|traditional)\b|^(cs|csv|cbb)\d/i;
function loadSealed() {
  if (SEALED || sealedLoading) return sealedLoading;
  sealedLoading = Promise.all([fetch('data/sealed.json').then(r => r.json()), loadPricesPlus()]).then(([j, pp]) => {
    const items = j.items.map(([id, name, ci, added, low, trend]) => {
      if (pp && pp.has(id)) { low = pp.get(id, 'low') || null; trend = pp.get(id, 'trend') || null; } // prix du jour
      const cat = j.cats[ci]; const asia = SEAL_ASIA.test(name);
      return { id, name, cat, catFr: CAT_FR[cat] || cat.replace(/^Pokémon /, ''), added, low, trend, asia, hay: norm(name + ' ' + (CAT_FR[cat] || '')) };
    });
    SEALED = { generated: (pp && pp.guide) || j.generated, items, byId: new Map(items.map(x => [x.id, x])) }; render();
  }).catch(() => { sealedLoading = null; toast('Impossible de charger les produits scellés'); });
  return sealedLoading;
}
const sPrice = x => (x.trend > COTE.ARTEFACT && x.trend) || x.low || null; // 0,02 : tendance que Cardmarket affiche quand il n'en calcule pas
const sealedLangs = x => LANGS.map(l => l[0]).filter(l => x.asia ? ASIA.has(l) : !ASIA.has(l) && l !== 'es-mx' && l !== 'pt-br' && LANG[l]);
// Petits dessins par type de produit (quand on n'a pas le logo de l'extension)
const SEAL_SVG = {
  Boosters: '<path d="M7 3h10l1 2-1 1v12l1 1-1 2H7l-1-2 1-1V6L6 5z"/><path d="M9 9h6M9 12h6"/>',
  Displays: '<rect x="3" y="7" width="18" height="12" rx="2"/><path d="M6 7V4h12v3M7 10v6M10 10v6M13 10v6M16 10v6"/>',
  ETB: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 9h16M10 9v4h4V9"/>',
  Coffrets: '<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18M9 6v14"/>',
  Tins: '<rect x="4" y="6" width="16" height="13" rx="3"/><path d="M4 10h16M9 3h6"/>',
  Blisters: '<rect x="5" y="3" width="14" height="18" rx="2"/><rect x="8" y="7" width="8" height="10" rx="1.5"/><circle cx="12" cy="5" r=".8"/>',
  Decks: '<rect x="6" y="4" width="12" height="16" rx="2"/><path d="M4 7v11M20 7v11"/>',
};
const SEAL_ICON = (cat, size = 24) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">${SEAL_SVG[cat] || SEAL_SVG.Coffrets}</svg>`;
// Logo de l'extension (images libres de TCGdex) : on reconnaît le nom de l'extension dans le nom du produit
let SEAL_SETS = null;
function sealSet(x) {
  if (x.set !== undefined) return x.set;
  if (!DB || !DB.sets || !PKM) return null;
  if (!SEAL_SETS) SEAL_SETS = DB.sets.filter(st => st.reg === 'en' && !st.x && st.name && st.name.en && st.name.en.length > 3 && !/promo/i.test(st.name.en))
    .map(st => [st.name.en.toLowerCase(), st]).sort((a, b) => b[0].length - a[0].length);
  const nm0 = ' ' + x.name.toLowerCase().replace(/[’']/g, "'") + ' ';
  // « EX Crystal Guardians Booster », « Pokémon Evolving Skies ETB » : le préfixe n'est pas dans le nom de l'extension
  const find = nm => SEAL_SETS.find(([n]) => { const i = nm.indexOf(n); return i === 1 && !/[a-z0-9]/.test(nm[i + n.length]); });
  const m = find(nm0) || find(nm0.replace(/^ (ex|pokémon tcg|pokémon|pokemon) /, ' '));
  return (x.set = m ? m[1] : null);
}
// Logos absents chez TCGdex : même logo chez pokemontcg.io (vérifié le 24/11/2026)
const SEAL_LOGO_ALT = { ecard1: 'ecard1', xy10: 'xy10', 'sm3.5': 'sm35', 'sm7.5': 'sm75', sv01: 'sv1', sv05: 'sv5' };
const sealLogo = x => { const st = sealSet(x); return st ? `https://assets.tcgdex.net/en/${encodeURIComponent(st.serie)}/${encodeURIComponent(st.id)}/logo.png` : null; };
// Image du produit : logo de l'extension si on le trouve, sinon le dessin du type (aussi si le logo ne charge pas)
const sealPic = (x, size) => { const u = sealLogo(x); return `<span class="seal-ic">${SEAL_ICON(x.catFr, size)}</span>${u ? `<img class="seal-logo" src="${u}"${SEAL_LOGO_ALT[x.set.id] ? ` data-alt="https://images.pokemontcg.io/${SEAL_LOGO_ALT[x.set.id]}/logo.png"` : ''} alt="" loading="lazy">` : ''}`; };
function sealedRow(x, extra) {
  const p = sPrice(x);
  return `<a class="line" href="#/scelle/${x.id}"><span class="thumb seal">${sealPic(x, 26)}</span><span class="mid"><b>${esc(x.name)}</b><span>${esc(x.catFr)}${x.asia ? ' · Asie' : ''}${x.added && x.added > '2008' ? ' · ' + x.added.slice(0, 4) : ''}${extra ? ' · ' + extra : ''}</span></span><span class="px"><b class="num">${p ? eur(p) : '—'}</b><span>${x.low ? 'dès ' + eur(x.low) : p ? 'cote' : 'pas de cote'}</span></span></a>`;
}
let sealedShown = 40;
// Tri « par collection » : un bloc par extension, des plus récentes aux plus anciennes (date de sortie de l'extension,
// pas la date d'ajout au catalogue). Les produits asiatiques sont à part : leurs noms ne disent pas l'extension anglaise.
const SEAL_CAT_ORDER = ['Displays', 'ETB', 'Boosters', 'Coffrets', 'Tins', 'Blisters', 'Decks', 'Kits dresseur', 'Sets complets', 'Lots'];
const SEAL_MORE = new Map(); let SEAL_OPEN = null; // années et collections dépliées (« y:2026 », « c:sv10 »)
function sealedResults(params) {
  if (!SEALED) { loadSealed(); return `<div class="pad"><div class="note">Chargement des produits scellés…</div></div>`; }
  const tokens = norm(params.get('q') || '').split(/\s+/).filter(Boolean), cat = params.get('cat'), asiaZone = params.get('zone') === 'asie';
  const ex = excluded(), asiaHidden = [...ASIA].every(l => ex.has(l)), euroHidden = LANGS.map(l => l[0]).filter(l => !ASIA.has(l)).every(l => ex.has(l));
  let res = SEALED.items.filter(x => !!x.asia === asiaZone && (!cat || x.catFr === cat) && tokens.every(t => x.hay.includes(t)));
  const nEu = SEALED.items.filter(x => !x.asia).length, nAs = SEALED.items.length - nEu;
  const hid = res.filter(x => x.asia ? asiaHidden : euroHidden);
  if (!showHidden) res = res.filter(x => !(x.asia ? asiaHidden : euroHidden));
  const sd = x => { const st = sealSet(x); return (st && st.date) || ''; };
  const ci = x => { const k = SEAL_CAT_ORDER.indexOf(x.catFr); return k < 0 ? 99 : k; };
  const byColl = (S.sort === 'pert' || S.sort === 'recent') && !asiaZone;
  const sorts = { pert: (a, b) => (b.added || '').localeCompare(a.added || ''), 'prix-': (a, b) => (sPrice(b) || 0) - (sPrice(a) || 0), 'prix+': (a, b) => (sPrice(a) || 1e9) - (sPrice(b) || 1e9), recent: (a, b) => (b.added || '').localeCompare(a.added || ''), ancien: (a, b) => (sd(a) || a.added || '9').localeCompare(sd(b) || b.added || '9') };
  res.sort(sorts[S.sort] || sorts.pert);
  const cats = [...new Set(Object.values(CAT_FR))].filter(k => SEALED.items.some(x => !!x.asia === asiaZone && x.catFr === k));
  const qs = (k, v) => { const q = new URLSearchParams(params); v ? q.set(k, v) : q.delete(k); if (k === 'zone') q.delete('cat'); return '#/recherche?' + q; };
  let list;
  if (byColl) {
    // Années → collections → types, chaque niveau se replie. Par défaut : l'année la plus récente ouverte,
    // ses collections repliées. Pendant une recherche ou un filtre de type, tout est déplié.
    const G = new Map(); for (const x of res) { const st = sealSet(x), k = st ? st.id : ''; if (!G.has(k)) G.set(k, { st, items: [] }); G.get(k).items.push(x); }
    const groups = [...G.values()].sort((a, b) => !a.st ? 1 : !b.st ? -1 : (b.st.date || '').localeCompare(a.st.date || ''));
    for (const g of groups) g.items.sort((a, b) => ci(a) - ci(b) || (sPrice(b) || 0) - (sPrice(a) || 0));
    // Produits sans extension reconnue (coffrets à thème, tins, decks…) : rangés par type, à la fin
    const other = groups.find(g => !g.st); if (other) { groups.splice(groups.indexOf(other), 1); const T = new Map(); for (const x of other.items) { if (!T.has(x.catFr)) T.set(x.catFr, { st: null, type: x.catFr, items: [] }); T.get(x.catFr).items.push(x); } groups.push(...[...T.values()].sort((a, b) => ci(a.items[0]) - ci(b.items[0]))); }
    const Y = new Map(); for (const g of groups) { const y = g.st ? year(g.st) || '—' : F('Hors collection'); if (!Y.has(y)) Y.set(y, []); Y.get(y).push(g); }
    const all = tokens.length > 0 || !!cat, years = [...Y.keys()];
    if (!SEAL_OPEN) SEAL_OPEN = new Set(['y:' + years[0]]);
    const open = k => all || SEAL_OPEN.has(k);
    const range = it => { const ps = it.map(sPrice).filter(Boolean); return ps.length ? (ps.length > 1 ? eur(Math.min(...ps)) + ' – ' + eur(Math.max(...ps)) : eur(ps[0])) : ''; };
    const chev = o => `<svg class="seal-chev${o ? ' on' : ''}" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>`;
    const coll = g => { const k = 'c:' + (g.st ? g.st.id : 't:' + g.type), o = open(k), types = SEAL_CAT_ORDER.filter(t => g.items.some(x => x.catFr === t)).concat([...new Set(g.items.map(x => x.catFr))].filter(t => !SEAL_CAT_ORDER.includes(t)));
      return `<button class="seal-coll" data-act="sopen" data-k="${esc(k)}" aria-expanded="${o}">${chev(o)}${g.st && sealLogo(g.items[0]) ? `<span class="seal-sect-logo"><img class="seal-logo" src="${sealLogo(g.items[0])}" alt="" loading="lazy"></span>` : ''}<span class="mid"><b>${g.st ? esc(setName(g.st)) : esc(g.type)}</b><span>${F('{0} produits', g.items.length)} · ${range(g.items)}</span></span></button>
      ${o ? (g.st ? types.map(t => { const its = g.items.filter(x => x.catFr === t); return `<div class="seal-type">${esc(t)} · ${its.length}</div><div class="list">${its.map(x => sealedRow(x)).join('')}</div>`; }).join('') : `<div class="list" style="margin-top:8px">${g.items.slice().sort((a, b) => (b.added || '').localeCompare(a.added || '')).slice(0, SEAL_MORE.get(k) || 30).map(x => sealedRow(x)).join('')}</div>${g.items.length > (SEAL_MORE.get(k) || 30) ? `<button class="btn small" data-act="smore2" data-k="${esc(k)}" style="margin:10px auto 0;display:block">${F('Voir plus ({0} restants)', g.items.length - (SEAL_MORE.get(k) || 30))}</button>` : ''}`) : ''}`; };
    list = `<div class="pad row" style="gap:8px;justify-content:flex-end;padding-top:4px"><button class="linkbtn small" data-act="sopenall" data-v="1">${F('Tout déplier')}</button><button class="linkbtn small" data-act="sopenall" data-v="0">${F('Tout replier')}</button></div>`
      + years.map(y => { const gs = Y.get(y), k = 'y:' + y, o = open(k), n = gs.reduce((t, g) => t + g.items.length, 0);
        return `<button class="seal-year" data-act="sopen" data-k="${esc(k)}" aria-expanded="${o}">${chev(o)}<b>${esc(y)}</b><span class="sub">${gs[0].st ? F('{0} collections · {1} produits', gs.length, n) : F('{0} types · {1} produits', gs.length, n)}</span></button>${o ? `<div class="seal-colls">${gs.map(coll).join('')}</div>` : ''}`; }).join('');
  } else {
    list = `<div class="list">${res.slice(0, sealedShown).map(x => sealedRow(x)).join('')}</div>
  ${res.length > sealedShown ? `<div class="pad" style="margin-top:14px"><button class="btn full" data-act="smore">Voir plus (${(res.length - sealedShown).toLocaleString(LOCALE)} restants)</button></div>` : ''}`;
  }
  return `<div class="pad chips" style="padding-top:10px"><a class="chip ${!asiaZone ? 'on' : ''}" href="${qs('zone', '')}">${F('Europe et US')} · ${nEu.toLocaleString(LOCALE)}</a><a class="chip ${asiaZone ? 'on' : ''}" href="${qs('zone', 'asie')}">${F('Japon, Chine, Corée')} · ${nAs.toLocaleString(LOCALE)}</a></div>
  <div class="pad chips scroll" style="padding-top:8px"><a class="chip ${!cat ? 'on' : ''}" href="${qs('cat', '')}">Tout</a>${cats.map(k => `<a class="chip ${cat === k ? 'on' : ''}" href="${qs('cat', k)}">${k}</a>`).join('')}</div>
  <div class="sect between" style="padding-top:14px"><b style="font-size:17px">${res.length.toLocaleString(LOCALE)} produit${res.length > 1 ? 's' : ''}</b><label class="sub">tri : <select data-act="sort" style="border:0;background:transparent;font-weight:600">${[['pert', asiaZone ? 'plus récents' : 'par collection'], ['prix-', 'prix décroissant'], ['prix+', 'prix croissant'], ['ancien', 'plus anciens']].map(([k, l]) => `<option value="${k}" ${S.sort === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
  ${hid.length ? `<div class="hidden-bar"><span>${showHidden ? 'Produits de langues exclues affichés.' : `${hid.length} produit${hid.length > 1 ? 's' : ''} masqué${hid.length > 1 ? 's' : ''} (langues exclues).`}</span><button class="btn small" data-act="showhidden">${showHidden ? 'Masquer' : 'Voir'}</button></div>` : ''}
  ${list}
  <div class="pad" style="margin-top:12px"><div class="note">Cotes Cardmarket du ${fdate(SEALED.generated)}, toutes langues européennes confondues.</div></div>`;
}
const CM_LANG = { en: 1, fr: 2, de: 3, es: 4, it: 5, 'zh-cn': 6, ja: 7, pt: 8, ko: 10, 'zh-tw': 11 };
const EBAY_WORD = { fr: 'français', de: 'deutsch', it: 'italiano', es: 'español', pt: 'português', en: 'english', ja: 'japanese', ko: 'korean', 'zh-tw': 'chinese', 'zh-cn': 'chinese', th: 'thai', id: 'indonesian' };
let sealedLang = null;
function viewSealed(id) {
  if (!SEALED) { loadSealed(); return `<div class="top">${backBtn()}</div><div class="pad"><div class="note">Chargement…</div></div>${tabs('')}`; }
  const x = SEALED.byId.get(+id);
  if (!x) return `<div class="top">${backBtn()}</div><div class="pad"><div class="note">Ce produit n'existe plus dans le catalogue.</div></div>${tabs('')}`;
  const langs = sealedLangs(x), mine = sealedCol.filter(it => it.pid === x.id);
  const vis = langs.filter(l => !excluded().has(l));
  const lang = sealedLang && langs.includes(sealedLang) ? sealedLang : (langs.includes(S.nameLang) ? S.nameLang : vis[0] || langs[0]);
  const p = sPrice(x);
  const cmUrl = `https://www.cardmarket.com/fr/Pokemon/Products?idProduct=${x.id}${CM_LANG[lang] ? '&language=' + CM_LANG[lang] : ''}`;
  const ebayUrl = `https://www.ebay.${(COUNTRY[S.country] || COUNTRY.FR).ebay}/sch/i.html?_nkw=${encodeURIComponent(x.name + ' ' + (EBAY_WORD[lang] || ''))}`;
  return `<div class="top">${backBtn()}${faceSwitch()}</div>
  <div class="pad"><div class="seal-hero"><div class="seal-pic">${sealPic(x, 56)}</div><span class="seal-cat">${SEAL_ICON(x.catFr, 16)} ${esc(x.catFr)}</span></div>
  <h1 class="h1" style="margin-top:14px">${esc(x.name)}</h1>
  <div class="sub" style="margin-top:4px">${esc(x.catFr)}${x.asia ? ' · produit asiatique' : ' · édition européenne'}${x.added && x.added > '2008' ? ' · au catalogue depuis ' + x.added.slice(0, 4) : ''}</div>
  ${p ? `<p class="summary">Vaut environ <b>${eur(p)}</b>${x.low ? ` ; l’offre la moins chère sur Cardmarket est à <b>${eur(x.low)}</b>` : ''}.</p>` : '<p class="summary">Pas encore de cote pour ce produit.</p>'}</div>
  <div class="sect"><div class="small" style="font-weight:600">Langue</div></div>
  <div class="pad chips scroll">${langs.map(l => `<button class="chip ${l === lang ? 'on' : ''}" data-act="slang" data-v="${l}">${LANG[l].name}</button>`).join('')}</div>
  <div class="pad btns" style="margin-top:14px"><button class="btn primary" data-act="sadd" data-id="${x.id}" data-lang="${lang}">Ajouter à ma collection (${esc(LANG[lang].name.toLowerCase())})</button><button class="btn wishbtn${wished('sealed:' + x.id) ? ' on' : ''}" data-act="heart" data-key="sealed:${x.id}">${icon('heart', 18)} ${wished('sealed:' + x.id) ? 'Dans mes envies' : 'Envie'}</button></div>
  <div class="sect between"><h2 class="h2">Prix</h2><span class="sub">Cardmarket</span></div>
  <div class="pad stack"><div class="prices"><div><div class="lab">Cote</div><div class="val num">${eur(x.trend)}</div></div><div><div class="lab">Moins chère</div><div class="val num">${eur(x.low)}</div></div><div><div class="lab">Langue</div><div class="val" style="font-size:15px">${esc(LANG[lang].short)}</div></div></div>
  <div class="note">${x.asia ? 'Prix de ce produit asiatique sur Cardmarket.' : 'Cardmarket donne un seul prix pour toutes les langues européennes. Un produit scellé français ou allemand peut valoir plus ou moins que l’anglais.'} ${esc(F('Pour le prix réel en {0}, ouvre les offres filtrées ci-dessous.', langNames([lang])[0]))}</div></div>
  <div class="sect between"><h2 class="h2">Historique des prix</h2><span class="sub">relevé chaque matin</span></div>
  <div class="pad"><div class="panel stack" style="gap:6px" id="hist" data-cm="${x.id}" data-key=""><div class="small">Chargement de l’historique…</div></div></div>
  <div class="pad stack" style="margin-top:16px">
    <a class="btn full between" href="${cmUrl}" target="_blank" rel="noopener"><span>${esc(F('Offres Cardmarket en {0}', langNames([lang])[0]))}</span><span class="small">lien externe, sans commission</span></a>
    <a class="btn full between" href="${ebayUrl}" target="_blank" rel="noopener"><span>Chercher sur eBay</span><span class="small">lien externe, sans commission</span></a>
  </div>
  ${mine.length ? `<div class="sect"><h2 class="h2">Dans ma collection</h2></div><div class="list">${mine.map(it => `<div class="line"><span class="mid"><b>${esc(LANG[it.lang] ? LANG[it.lang].name : it.lang)} · ${it.qty || 1} ×</b><span>payé ${it.paid != null ? money(it.paid, it.cur) : '—'}${it.date ? ' · ' + esc(it.date) : ''}</span></span><button class="btn small" data-act="sdel" data-id="${it.id}">Retirer</button></div>`).join('')}</div>` : ''}
  <div style="height:20px"></div>${tabs('')}`;
}
function openSealedSheet(pid, lang) {
  const x = SEALED && SEALED.byId.get(+pid); if (!x) return;
  const d = document.createElement('dialog'); d.className = 'sheet';
  d.innerHTML = `<form class="sheet-in" method="dialog"><b style="font-size:17px">${esc(x.name)}</b>
  <label class="field">Langue<select name="lang">${sealedLangs(x).map(l => `<option value="${l}" ${l === lang ? 'selected' : ''}>${LANG[l].name}</option>`).join('')}</select></label>
  <div class="row"><label class="field" style="flex:1">Prix payé (${esc(userCur())})<input name="paid" inputmode="decimal" placeholder="ex. 45"></label><label class="field" style="width:96px">Quantité<input name="qty" type="number" min="1" max="999" value="1"></label></div>
  <label class="field">Date d'achat<input name="date" type="date" value="${new Date().toISOString().slice(0, 10)}"></label>
  <div class="btns"><button class="btn" value="cancel">Annuler</button><button class="btn primary" value="ok">Ajouter</button></div></form>`;
  document.body.appendChild(d); const f = d.querySelector('form');
  d.addEventListener('close', () => {
    if (d.returnValue === 'ok') { const paid = parseFloat(String(f.paid.value).replace(/\s/g, '').replace(',', '.')); sealedCol.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), pid: x.id, lang: f.lang.value, qty: Math.max(1, parseInt(f.qty.value, 10) || 1), paid: isNaN(paid) ? null : paid, cur: userCur(), date: f.date.value }); saveSealed(); toast('Ajouté à ta collection'); render(); }
    d.remove();
  });
  d.showModal();
}
function sealedValue() { if (!SEALED) return 0; return sealedCol.reduce((s, it) => { const x = SEALED.byId.get(it.pid); return s + (x ? toUser(sPrice(x)) || 0 : 0) * (it.qty || 1); }, 0); }
function mySealedBlock() {
  if (!sealedCol.length) return '';
  if (!SEALED) { loadSealed(); return ''; }
  const rows = sealedCol.map(it => [it, SEALED.byId.get(it.pid)]).filter(r => r[1]);
  return `<div class="sect between"><h2 class="h2">Mes scellés</h2><span class="sub">${money(sealedValue())}</span></div><div class="list">${rows.map(([it, x]) => sealedRow(x, (LANG[it.lang] ? LANG[it.lang].short : it.lang) + ' · ' + (it.qty || 1) + ' ×')).join('')}</div>`;
}

/* ---------- Comptes (Supabase) : connexion par lien e-mail, collection synchronisée ---------- */
// Adresse et clé publique du projet Supabase (faites pour être dans l'appli ; la sécurité vient des règles RLS)
const SUPA = { url: 'https://gumeodpxjyjtkihynnsu.supabase.co', key: 'sb_publishable_y02CYGCGjZsO-PkMXFo5-w_ApGd1ilc' };
let sb = null, me = null, syncT = null, syncing = false, lastSync = load('lastSync', null);
let deletedIds = load('deletedIds', []);
const acctReady = () => !!(SUPA.url && SUPA.key);
async function supa() {
  if (sb || !acctReady()) return sb;
  if (!window.supabase) await loadScript('vendor/supabase/supabase.js');
  sb = window.supabase.createClient(SUPA.url, SUPA.key, { auth: { flowType: 'pkce', persistSession: true, detectSessionInUrl: true, autoRefreshToken: true } });
  sb.auth.onAuthStateChange((ev, session) => {
    const was = me; me = session ? session.user : null;
    if (me && !was) { syncNow(true); checkStatsAdmin(); }
    if (!me) { statsAdmin = false; STATS = null; }
    if (ev === 'SIGNED_OUT') me = null;
    render();
  });
  const { data } = await sb.auth.getSession(); me = data.session ? data.session.user : null;
  if (me) checkStatsAdmin();
  if (/[?&]code=/.test(location.search)) history.replaceState(null, '', location.pathname + location.hash);
  return sb;
}
const hadSession = () => { try { return Object.keys(localStorage).some(k => /^sb-.*-auth-token/.test(k)); } catch (e) { return false; } };
function syncSoon() { if (!me) return; clearTimeout(syncT); syncT = setTimeout(() => syncNow(false), 1500); }
async function syncNow(full) {
  if (!me || syncing) return; syncing = true;
  try {
    const rows = [...collection.map(it => ({ id: it.id, kind: 'card', data: it, deleted: false })), ...sealedCol.map(it => ({ id: it.id, kind: 'sealed', data: it, deleted: false })), ...wish.items.map(it => ({ id: it.id, kind: 'wish', data: it, deleted: false })), ...wish.folders.map(f => ({ id: f.id, kind: 'folder', data: f, deleted: false })), ...myDecks.map(d => ({ id: d.id, kind: 'deck', data: d, deleted: false })), ...deletedIds.map(d => ({ id: d.id, kind: d.kind, data: {}, deleted: true }))]
      .map(r => Object.assign(r, { user_id: me.id, updated_at: new Date().toISOString() }));
    if (full) {
      // À la connexion : on récupère le compte et on fusionne (rien n'est perdu d'un côté ni de l'autre)
      const { data, error } = await sb.from('collection_items').select('id,kind,data,deleted'); if (error) throw error;
      const gone = new Set(data.filter(r => r.deleted).map(r => r.id)), haveC = new Set(collection.map(x => x.id)), haveS = new Set(sealedCol.map(x => x.id));
      let added = 0;
      for (const r0 of data) { if (r0.deleted) continue; const r = Object.assign({}, r0, { data: cleanRow(r0.data, r0.kind) }); if (!r.data) continue; if (r.kind === 'card' && !haveC.has(r.id) && knownKey(r.data.key)) { collection.push(r.data); added++; } if (r.kind === 'sealed' && !haveS.has(r.id)) { sealedCol.push(r.data); added++; } if (r.kind === 'folder' && !wish.folders.some(f => f.id === r.id)) wish.folders.push(r.data); if (r.kind === 'deck' && !myDecks.some(d => d.id === r.id)) { myDecks.push(r.data); added++; } if (r.kind === 'wish' && !wish.items.some(x => x.id === r.id && x.key)) { if (!wish.items.some(x => x.key === r.data.key)) { wish.items.push(r.data); added++; } } }
      wish.items = wish.items.filter(x => !gone.has(x.id)); wish.folders = wish.folders.filter(f => f.id === 'f0' || !gone.has(f.id)); save('wish', wish);
      collection = collection.filter(x => !gone.has(x.id)); sealedCol = sealedCol.filter(x => !gone.has(x.id));
      myDecks = myDecks.filter(x => !gone.has(x.id)); save('decks', myDecks); save('collection', collection); save('sealed', sealedCol);
      if (added) toast(pl(added, 'élément récupéré', 'éléments récupérés') + ' depuis ton compte');
    }
    if (rows.length) { const { error } = await sb.from('collection_items').upsert(rows); if (error) throw error; }
    deletedIds = []; save('deletedIds', []); lastSync = new Date().toISOString(); save('lastSync', lastSync);
  } catch (e) { toast('Synchronisation impossible pour le moment'); }
  syncing = false; render();
}
const markDeleted = (id, kind) => { deletedIds.push({ id, kind }); save('deletedIds', deletedIds); };
async function sendMagicLink(email) {
  const c = await supa(); if (!c) return;
  const { error } = await c.auth.signInWithOtp({ email, options: { emailRedirectTo: window.CallItNatif ? 'callit://auth' : location.origin + location.pathname, data: { lang: UI } } });
  toast(error ? 'Envoi impossible : vérifie l’adresse' : 'Lien envoyé ! Ouvre ton e-mail sur cet appareil');
  if (!error) { acctSent = email; render(); }
}
let acctSent = '';
function accountPanel() {
  if (!acctReady()) return `<div class="pad"><div class="note">Les comptes gratuits arrivent très bientôt : ta collection sera sauvegardée et retrouvée sur tous tes appareils.</div></div>`;
  if (me) return `<div class="pad"><div class="panel stack" style="gap:10px"><div class="between"><b style="font-size:15px">Mon compte</b><span class="lg" style="font-size:12px;padding:2px 8px">gratuit</span></div>
    <div class="sub">Connecté : <b>${esc(me.email || '')}</b></div>
    <div class="small">${syncing ? 'Synchronisation…' : lastSync ? 'Collection sauvegardée · ' + new Date(lastSync).toLocaleString(LOCALE, { dateStyle: 'short', timeStyle: 'short' }) : 'Pas encore synchronisée'}</div>
    <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn small" data-act="syncnow">Synchroniser</button><button class="btn small" data-act="logout">Se déconnecter</button></div>
    <div class="small"><a href="#/confidentialite">Données personnelles</a> · <a href="#" data-act="delacct">Supprimer mon compte</a></div>
    ${statsAdmin ? `<a class="btn small" href="#/stats" style="align-self:flex-start">${icon('chart', 14)} Statistiques de CallIt!</a>` : ''}</div></div>`;
  return `<div class="pad"><div class="panel stack" style="gap:10px"><b style="font-size:15px">Créer mon compte gratuit</b>
    <div class="sub" style="line-height:1.45">Ta collection sauvegardée et retrouvée sur ton téléphone et ton ordinateur. Pas de mot de passe : tu reçois un lien par e-mail.</div>
    ${acctSent ? `<div class="note">Lien envoyé à <b>${esc(acctSent)}</b>. Ouvre l’e-mail et touche le lien : tu reviens ici, connecté. Pense à regarder dans les indésirables.</div>` : ''}
    <form class="row" style="gap:8px" data-act="magic"><input class="search" style="flex:1;height:44px" type="email" name="email" required autocomplete="email" placeholder="ton@email.fr"><button class="btn primary" style="height:44px">Recevoir le lien</button></form>
    <div class="small">Tes cartes déjà ajoutées sont reprises dans le compte. <a href="#/confidentialite">Données personnelles</a></div></div></div>`;
}
/* ---------- Statistiques (réservées au propriétaire) ----------
   Le serveur vérifie lui-même que le compte connecté a le droit (fonction stats_globales, voir outils/supabase/schema.sql).
   Seuls des totaux anonymes arrivent ici : jamais d'e-mail ni « qui possède quoi ». */
let statsAdmin = false, STATS = null, statsLoading = false, statsErr = '';
async function checkStatsAdmin() {
  try { const { data, error } = await sb.rpc('stats_suis_je_admin'); statsAdmin = !error && data === true; } catch (e) { statsAdmin = false; }
  if (statsAdmin && /^#\/(reglages|stats)/.test(location.hash)) render();
}
async function loadStats() {
  if (statsLoading) return; statsLoading = true; statsErr = '';
  try { const { data, error } = await sb.rpc('stats_globales'); if (error) throw error; STATS = data; }
  catch (e) { statsErr = e && e.code === '42501' ? 'refus' : 'reseau'; }
  statsLoading = false; render();
}
function viewStats() {
  const head = `<div class="top">${backBtn()}<span class="title" style="font-size:20px">Statistiques</span><span></span></div>`;
  const msg = t => head + `<div class="pad" style="margin-top:8px"><div class="note">${t}</div></div>`;
  if (!acctReady()) return msg('Les comptes ne sont pas encore ouverts.');
  if (!sb) { supa().then(render); return msg('Chargement…'); }
  if (!me) return msg(F('Connecte-toi d’abord dans les {0}.', `<a href="#/reglages">${tr('réglages')}</a>`));
  if (statsErr === 'refus') return msg('Cette page est réservée.');
  if (statsErr) return msg('Chiffres indisponibles pour le moment. <a href="#" data-act="statsreload">Réessayer</a>');
  if (!STATS) { loadStats(); return msg('Chargement des chiffres…'); }
  const X = STATS, n = v => Number(v || 0).toLocaleString(LOCALE);
  const tile = (v, l, sub) => `<div class="panel statt"><div class="num">${n(v)}</div><div class="sub">${l}</div>${sub ? `<div class="small">${sub}</div>` : ''}</div>`;
  const pctOf = (a, b) => b ? Math.round(100 * a / b) + ' % des comptes' : '';
  const cardLine = (r, i) => {
    const c = BYKEY.get(r.key), g = /^(mtg|ygo|op):/.exec(r.key || ''), lab = c ? cardName(c) : (r.key || '');
    const sub = c ? esc(setName(c.set)) + ' · ' + esc(numLabel(c)) : g ? esc(GAMES[g[1]].name) : '';
    const inner = `<span class="statrank">${i + 1}</span>${c ? `<span class="thumb">${cimg(c)}</span>` : ''}<span class="mid"><b>${esc(lab)}</b><span>${sub}</span></span><span class="px"><b class="num">${n(r.n)}</b><span class="small">${r.n > 1 ? 'personnes' : 'personne'}</span></span>`;
    return c ? `<a class="line" href="#/carte/${encodeURIComponent(r.key)}">${inner}</a>` : `<div class="line">${inner}</div>`;
  };
  const weeks = X.semaines || [];
  const bars = (k, label) => {
    const max = Math.max(1, ...weeks.map(w => w[k] || 0)), tot = weeks.reduce((a, w) => a + (w[k] || 0), 0);
    const last = weeks.length ? weeks[weeks.length - 1][k] || 0 : 0;
    return `<div class="panel stack" style="gap:8px"><div><b>${label}</b><div class="small">${F('{0} en 12 semaines, dont {1} cette semaine', n(tot), n(last))}</div></div>
      <div class="statbars" role="img" aria-label="${esc(label)} par semaine">${weeks.map(w => { const v = w[k] || 0; return `<span class="statbar" title="Semaine du ${esc(fmtDate(w.s))} : ${n(v)}"><i style="height:${v ? Math.max(4, Math.round(100 * v / max)) : 0}%"></i></span>`; }).join('')}</div>
      <div class="between small"><span>${weeks.length ? fdate(weeks[0].s) : ''}</span><span>cette semaine</span></div></div>`;
  };
  const top = X.top_envies || [], topc = X.top_collection || [];
  return head + `<div class="pad stack" style="gap:6px;margin-top:4px"><div class="small">Chiffres globaux et anonymes, mis à jour à l’ouverture de la page (${esc(new Date(X.maj).toLocaleString(LOCALE, { dateStyle: 'short', timeStyle: 'short' }))}). <a href="#" data-act="statsreload">Actualiser</a></div></div>
  <div class="sect"><h2 class="h2">Comptes</h2></div>
  <div class="pad statgrid">${tile(X.utilisateurs, 'comptes créés')}${tile(X.actifs_30j, 'connectés ces 30 jours', pctOf(X.actifs_30j, X.utilisateurs))}</div>
  <div class="sect"><h2 class="h2">Envies</h2></div>
  <div class="pad statgrid">${tile(X.envies, 'cartes en envie')}${tile(X.avec_envies, 'comptes avec des envies', pctOf(X.avec_envies, X.utilisateurs))}${tile(X.dossiers, 'dossiers d’envies')}</div>
  <div class="sect"><h2 class="h2">Collections et decks</h2></div>
  <div class="pad statgrid">${tile(X.cartes_total, 'cartes en collection', n(X.cartes_lignes) + ' lignes')}${tile(X.avec_collection, 'collections', pctOf(X.avec_collection, X.utilisateurs))}${tile(X.scelles, 'produits scellés')}${tile(X.decks, 'decks', n(X.avec_decks) + ' comptes')}</div>
  <div class="sect"><h2 class="h2">Dans le temps</h2></div>
  <div class="pad stack" style="gap:10px">${bars('inscrits', 'Nouveaux comptes')}${bars('envies', 'Cartes ajoutées aux envies')}${bars('decks', 'Decks créés')}</div>
  <div class="sect"><h2 class="h2">Cartes les plus demandées</h2><div class="small" style="margin-top:4px">Nombre de comptes qui ont la carte dans leurs envies.</div></div>
  ${top.length ? `<div class="list">${top.map(cardLine).join('')}</div>` : '<div class="pad small">Aucune envie pour le moment.</div>'}
  <div class="sect"><h2 class="h2">Cartes les plus collectionnées</h2></div>
  ${topc.length ? `<div class="list">${topc.map(cardLine).join('')}</div>` : '<div class="pad small">Aucune carte pour le moment.</div>'}`;
}
// Bandeau : après la 1re carte, puis de nouveau à partir de 5 si on l'a fermé
function acctBanner() {
  if (!acctReady() || me) return '';
  const n = collection.length + sealedCol.length, closedAt = load('bannerClosedAt', 0);
  if (n < 5 || (closedAt && closedAt >= 5 && n < 20)) return '';
  return `<div class="pad" style="margin-top:12px"><div class="banner"><div style="flex:1"><b>Garde ta collection en sécurité</b><div class="small">Crée ton compte gratuit en 10 secondes pour la retrouver sur tous tes appareils.</div></div><a class="btn small primary" href="#/reglages">Créer</a><button class="iconbtn" data-act="bannerclose" aria-label="Fermer" style="width:32px;height:32px">✕</button></div></div>`;
}
function viewPrivacy() {
  return `<div class="top">${backBtn()}<span class="title" style="font-size:20px">Données personnelles</span><span></span></div>
  <div class="pad stack legal" style="gap:12px;margin-top:8px">
  <p><b>En bref :</b> sans compte, tout reste sur ton appareil. Avec un compte, on garde ton e-mail et ta collection, uniquement pour te les rendre sur tes appareils. On ne les vend pas et on ne fait pas de publicité ciblée.</p>
  <h2 class="h2">Sans compte</h2><p>Ta collection, tes réglages et tes langues sont enregistrés dans ton navigateur (stockage local). Rien n’est envoyé à CallIt!. Effacer les données du site les supprime.</p>
  <h2 class="h2">Avec un compte gratuit</h2><p>Données gardées : ton adresse e-mail (pour te connecter par lien), et ta collection (cartes, scellés, langue, état, prix payé, date, note). Elles servent seulement à synchroniser ta collection entre tes appareils.</p>
  <p>Hébergement : Supabase, sur des serveurs situés dans l’Union européenne. Chaque compte ne peut lire que ses propres données (règles de sécurité de la base).</p>
  <p>Durée : tant que ton compte existe. Le bouton « Supprimer mon compte » efface immédiatement ton compte et toute ta collection en ligne.</p>
  <h2 class="h2">Tes droits (RGPD)</h2><p>Tu peux consulter, corriger, exporter (bouton « Exporter ma collection ») ou supprimer tes données à tout moment, et t’opposer à leur traitement. Tu peux aussi saisir la CNIL (cnil.fr) ou l’autorité de ton pays.</p>
  <h2 class="h2">En voyage (boutiques de cartes)</h2><p>Pour trouver les boutiques autour d’une ville, le nom de la ville que tu tapes est envoyé à OpenStreetMap (services Nominatim et Overpass). Si tu choisis « Autour de moi », ta position est d’abord arrondie à environ 1 km, envoyée seulement pour cette recherche et jamais conservée. Tes étiquettes et ton passeport restent sur ton appareil. CallIt! n’enregistre que des commerces, jamais l’adresse d’un particulier.</p>
  <h2 class="h2">Signaler un bug ou une idée</h2><p>Si tu nous écris depuis l’appli, on reçoit ton texte, ta capture d’écran si tu en ajoutes une, la page ouverte, la langue de l’appli et le type d’appareil (et ton compte si tu es connecté). Ces messages servent seulement à corriger et améliorer CallIt!. Ils sont effacés après traitement, au plus tard au bout d’un an.</p>
  <h2 class="h2">Services tiers</h2><p>Images des cartes : TCGdex et pokemontcg.io (ton navigateur les charge directement). Prix : fichiers publics de Cardmarket. Taux de change : Banque centrale européenne. Les liens vers Cardmarket ou eBay ouvrent leur site, avec leurs propres règles. Tout lien partenaire est signalé.</p>
  <h2 class="h2">Responsable</h2><p>L’éditeur de CallIt!. Contact : <a href="mailto:request@callitcards.com">request@callitcards.com</a>.</p>
  <p class="small">Mise à jour : ${new Date('2026-11-25').toLocaleDateString(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' })}</p></div>${tabs('')}`;
}

/* ---------- Liste d'envies : un cœur sur les cartes et les scellés, rangée en dossiers ---------- */
// wish = { folders: [{id, name}], items: [{id, key, folder, max, lang, added}] } ; key = clé de carte ou « sealed:<id> »
let wish = load('wish', { folders: [{ id: 'f0', name: 'Mes envies' }], items: [] });
wish = { folders: cleanList(wish && wish.folders, 'folder'), items: cleanList(wish && wish.items, 'wish') };
if (!wish.folders.length) wish.folders.push({ id: 'f0', name: 'Mes envies' });
const saveWish = () => { save('wish', wish); syncSoon(); };
const wished = key => wish.items.find(x => x.key === key);
let lastFolder = load('lastFolder', 'f0');
function heartBtn(key, big) {
  const on = !!wished(key);
  return `<span class="heart${on ? ' on' : ''}${big ? ' big' : ''}" role="button" tabindex="0" data-act="heart" data-key="${esc(key)}" aria-pressed="${on}" aria-label="${on ? 'Retirer de' : 'Ajouter à'} ma liste d'envies">${icon('heart', big ? 22 : 16)}</span>`;
}
function toggleWish(key) {
  const it = wished(key);
  if (it) { wish.items = wish.items.filter(x => x !== it); markDeleted(it.id, 'wish'); saveWish(); toast('Retirée de ta liste d’envies'); render(); return; }
  const f = wish.folders.find(x => x.id === lastFolder) || wish.folders[0];
  wish.items.push({ id: 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), key, folder: f.id, max: null, lang: '', added: new Date().toISOString().slice(0, 10) });
  saveWish(); render();
  toastAction(F('Ajoutée à « {0} »', f.name), 'Ranger', () => openWishSheet(key));
}
function toastAction(msg, label, fn) {
  toast(msg); const t = document.querySelector('.toast'); if (!t) return;
  const b = document.createElement('button'); b.className = 'toast-btn'; b.textContent = label; b.onclick = () => { t.remove(); fn(); }; t.appendChild(b);
}
function wishLabel(key) {
  if (key.startsWith('sealed:')) { const x = SEALED && SEALED.byId.get(+key.slice(7)); return x ? x.name : 'Produit scellé'; }
  const c = BYKEY.get(key); return c ? cardName(c) + ' · ' + setName(c.set) : key;
}
function openWishSheet(key) {
  const it = wished(key); if (!it) return;
  const d = document.createElement('dialog'); d.className = 'sheet';
  d.innerHTML = `<form class="sheet-in" method="dialog"><b style="font-size:17px">${esc(wishLabel(key))}</b>
  <label class="field">Dossier<select name="folder">${wish.folders.map(f => `<option value="${f.id}" ${f.id === it.folder ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}<option value="__new">+ Nouveau dossier…</option></select></label>
  <label class="field" data-new style="display:none">Nom du nouveau dossier<input name="fname" maxlength="40" placeholder="ex. Évoli, Dracaufeu, Cadeaux"></label>
  <label class="field">Prix maximum (${esc(userCur())}, facultatif)<input name="max" inputmode="decimal" placeholder="ex. 40" value="${it.max != null ? String(it.max).replace('.', ',') : ''}"></label>
  <div class="btns"><button class="btn" value="delete">Retirer</button><button class="btn primary" value="ok">Enregistrer</button></div></form>`;
  document.body.appendChild(d); const f = d.querySelector('form');
  f.folder.addEventListener('change', () => { f.querySelector('[data-new]').style.display = f.folder.value === '__new' ? '' : 'none'; });
  d.addEventListener('close', () => {
    if (d.returnValue === 'ok') {
      let fid = f.folder.value;
      if (fid === '__new') { const name = f.fname.value.trim() || 'Nouveau dossier'; fid = 'f' + Date.now().toString(36); wish.folders.push({ id: fid, name }); }
      const m = parseFloat(String(f.max.value).replace(/\s/g, '').replace(',', '.'));
      it.folder = fid; it.max = isNaN(m) ? null : m; lastFolder = fid; save('lastFolder', fid); saveWish(); toast('Enregistré'); render();
    } else if (d.returnValue === 'delete') { wish.items = wish.items.filter(x => x !== it); markDeleted(it.id, 'wish'); saveWish(); render(); }
    d.remove();
  });
  d.showModal();
}
let wishFolder = '';
function viewWish() {
  const folders = wish.folders.map(f => [f, wish.items.filter(x => x.folder === f.id)]);
  const cur = folders.find(([f]) => f.id === wishFolder) || null;
  const list = cur ? cur[1] : wish.items;
  const head = `<div class="top"><h1 class="title">Mes envies</h1>${faceSwitch()}</div>${colTabs('envies')}`;
  if (!wish.items.length) return head + `<div class="pad" style="margin-top:16px"><div class="panel stack"><b>Ta liste d’envies est vide</b><div class="sub">${tr('Touche le cœur')} ${icon('heart', 14)} ${tr('sur une carte ou un produit scellé pour l’ajouter ici. Tu pourras ensuite la ranger en dossiers et fixer un prix maximum.')}</div><a class="btn primary" href="#/recherche">Chercher une carte</a></div></div>${tabs('collection')}`;
  if ([...new Set(list.filter(x => x.key.startsWith('sealed:')))].length && !SEALED) loadSealed();
  const cards = list.map(x => [x, BYKEY.get(x.key)]).filter(r => r[1]), seals = list.filter(x => x.key.startsWith('sealed:'));
  const total = cards.reduce((s, [, c]) => s + (price(c) || 0), 0) + (SEALED ? seals.reduce((s, x) => { const y = SEALED.byId.get(+x.key.slice(7)); return s + (y ? sPrice(y) || 0 : 0); }, 0) : 0);
  return head + `<div class="pad chips scroll" style="margin-top:12px"><button class="chip ${!cur ? 'on' : ''}" data-act="wf" data-v="">Tout (${wish.items.length})</button>${folders.map(([f, xs]) => `<button class="chip ${cur && cur[0].id === f.id ? 'on' : ''}" data-act="wf" data-v="${f.id}">${esc(f.name)} (${xs.length})</button>`).join('')}<button class="chip" data-act="wfnew">+ Dossier</button></div>
  <div class="pad between" style="margin-top:10px"><span class="sub">${list.length} envie${list.length > 1 ? 's' : ''} · environ ${eur(total)} au total</span>${cur && cur[0].id !== 'f0' ? `<span class="row" style="gap:6px"><button class="btn small" data-act="wfren" data-v="${cur[0].id}">Renommer</button><button class="btn small" data-act="wfdel" data-v="${cur[0].id}">Supprimer</button></span>` : ''}</div>
  ${cards.length ? `<div class="grid" style="margin-top:10px">${cards.map(([x, c]) => tile(c, { meta: (price(c) ? eurC(price(c)) : 'sans cote') + (x.max != null ? ' · max ' + money(x.max) : '') })).join('')}</div>` : ''}
  ${seals.length && SEALED ? `<div class="sect"><h2 class="h2">Scellés</h2></div><div class="list">${seals.map(x => { const y = SEALED.byId.get(+x.key.slice(7)); return y ? sealedRow(y, x.max != null ? 'max ' + money(x.max) : '') : ''; }).join('')}</div>` : ''}
  <div class="pad" style="margin-top:14px"><div class="note">Touche le cœur pour retirer une envie. Sur la fiche d’une carte, « Ranger » choisit le dossier et le prix max.</div></div>${tabs('collection')}`;
}
const colTabs = cur => `<div class="pad" style="padding-top:10px"><div class="face" role="tablist" aria-label="Collection ou envies"><a role="tab" class="${cur === 'col' ? 'on' : ''}" href="#/collection">${G() ? 'Ma collection' : 'Portefeuille'}</a><a role="tab" class="${cur === 'envies' ? 'on' : ''}" href="#/envies">${icon('heart', 14)} Mes envies${wish.items.length ? ' (' + wish.items.length + ')' : ''}</a></div></div>`;

/* Liste des illustrateurs */
let artistsIdx = null, artistSort = 'pop', artistQ = '', artistShown = 30;
const illClean = n => n.replace(/\\/g, '').replace(/"([^"]*)"/g, '« $1 »').replace(/"/g, '').replace(/\s+/g, ' ').trim();
const illKey = n => norm(illClean(n)).replace(/[.«»]/g, '').replace(/\s+/g, ' ').trim();
// Regroupe les illustrateurs (variantes de casse fusionnées) avec leur carte la plus chère
function artistIndex() {
  if (artistsIdx) return artistsIdx;
  const m = new Map();
  DB.ills.forEach((name, i) => {
    if (!name || /^(n\/a|none|unknown)$/i.test(name.trim())) return;
    const k = illKey(name); if (!m.has(k)) m.set(k, { key: k, name: illClean(name), idx: new Set(), n: 0, value: 0, top: null, topAny: null });
    m.get(k).idx.add(i);
  });
  const byIdx = new Map(); for (const a of m.values()) for (const i of a.idx) byIdx.set(i, a);
  for (const c of CARDS) {
    const a = byIdx.get(c.i); if (!a) continue;
    a.n++; const p = price(c) || 0; a.value += p;
    if (c.set.reg === 'en' && (!a.top || p > (price(a.top) || 0))) a.top = c;
    if (!a.topAny || p > (price(a.topAny) || 0)) a.topAny = c;
  }
  artistsIdx = { list: [...m.values()].filter(a => a.n), byKey: m };
  return artistsIdx;
}
function viewArtists() {
  const { list } = artistIndex();
  const q = illKey(artistQ);
  let rows = q ? list.filter(a => a.key.includes(q)) : list.slice();
  if (artistSort === 'az') rows.sort((a, b) => a.key.localeCompare(b.key, 'fr', { sensitivity: 'base' }));
  else if (artistSort === 'nb') rows.sort((a, b) => b.n - a.n);
  else rows.sort((a, b) => b.value - a.value);
  const sorts = [['pop', 'Les plus populaires'], ['az', 'A à Z'], ['nb', 'Nombre de cartes']];
  let letter = '';
  const total = rows.length; rows = rows.slice(0, artistShown);
  const html = rows.map((a, i) => {
    const c = a.top || a.topAny; const L = /[a-z]/.test(a.key[0]) ? a.key[0].toUpperCase() : '#';
    const head = artistSort === 'az' && L !== letter ? (letter = L, `<div class="small letter" style="font-weight:700;padding:10px 4px 0">${esc(L)}</div>`) : '';
    return head + `<a class="line artist" href="${artistHref(a.name)}"><span class="thumb">${cimg(c)}</span><span class="mid"><b>${artistSort === 'pop' && !q ? (i + 1) + '. ' : ''}${esc(a.name)}</b><span>${F(a.n > 1 ? '{0} cartes · la plus chère : {1}' : '{0} carte · la plus chère : {1}', a.n, esc(cardName(c)))}</span></span><span class="px"><b class="num" style="font-size:14px">${price(c) != null ? eurC(price(c)) : '—'}</b><span>sa carte max</span></span></a>`;
  }).join('');
  return `<div class="top">${backBtn()}<span class="sub" style="font-weight:600">Galerie</span><span style="width:44px"></span></div>
  <div class="pad"><h1 class="h1">Illustrateurs</h1><p class="sub">${list.length} artistes.</p></div>
  <div class="pad" style="padding-top:10px"><label for="aq" class="sr">Chercher un illustrateur</label><input id="aq" class="search" type="search" autocomplete="off" placeholder="Chercher un illustrateur…" value="${esc(artistQ)}"></div>
  <div class="pad chips scroll" style="padding-top:12px;padding-bottom:4px">${sorts.map(([k, l]) => `<button class="chip ${artistSort === k ? 'on' : ''}" data-act="asort" data-v="${k}">${l}</button>`).join('')}</div>
  ${follows.length && !q ? `<div class="pad stack" style="gap:8px;margin-top:6px"><div class="small" style="font-weight:600">${tr('Mes artistes')}</div><div class="chips wrap">${follows.map(f => `<a class="chip" href="${artistHref(f)}">${esc(f)}</a>`).join('')}</div></div>` : ''}
  ${artistSort === 'pop' ? '<p class="pad small" style="margin:4px 0 10px">Classés par cote totale de leurs cartes sur Cardmarket.</p>' : '<div style="height:8px"></div>'}
  <div class="list artists">${html || '<div class="note">Aucun illustrateur trouvé.</div>'}</div>
  ${total > artistShown ? `<div class="pad" style="margin-top:14px"><button class="btn full" data-act="amore">Voir plus (${total - artistShown} restants)</button></div>` : ''}${tabs('')}`;
}

/* Fiche d'un illustrateur : ses cartes, ses plus belles, celles qui me manquent ; « Suivre » (gardé sur l'appareil) */
let follows = load('follows', []).filter(x => typeof x === 'string').slice(0, 200);
const isFollowed = name => follows.some(f => illKey(f) === illKey(name));
function toggleFollow(name) {
  if (isFollowed(name)) follows = follows.filter(f => illKey(f) !== illKey(name));
  else { follows.push(name); toast(F('Tu suis {0}', name)); }
  save('follows', follows); render();
}
const artistHref = name => '#/illustrateur/' + encodeURIComponent(name);
function followBtn(name, small) {
  const on = isFollowed(name);
  return `<button class="btn${small ? ' small' : ''}${on ? '' : small ? ' primary ink' : ' primary'} followbtn" data-act="follow" data-v="${esc(name)}" aria-pressed="${on}">${on ? icon('check', 16) + ' ' + tr('Suivi') : '+ ' + tr('Suivre')}</button>`;
}
// Liens officiels des artistes (data/artistes.json, vérifiés à la main) : chargés à la première fiche ouverte
let ARTLINKS = null;
function loadArtLinks() {
  if (ARTLINKS) return; ARTLINKS = {};
  fetch('data/artistes.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : {}).then(d => { ARTLINKS = {}; for (const [k, v] of Object.entries(d)) if (k[0] !== '_') ARTLINKS[illKey(k)] = v; if (location.hash.startsWith('#/illustrateur/')) render(); }).catch(() => {});
}
const ARTNET = [['instagram', 'Instagram'], ['x', 'X'], ['bluesky', 'Bluesky'], ['pixiv', 'pixiv'], ['site', 'Site officiel']];
// Petits logos d'une seule couleur (celle du texte), à côté du nom du réseau
const NET_ICON = {
  instagram: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r=".6" fill="currentColor"/>',
  x: '<path d="M4.5 4h4.2l10.8 16h-4.2zM19.5 4l-6.2 7M10.7 13l-6.2 7"/>',
  bluesky: '<path d="M12 11.2C10.4 8 7 4.6 4.6 4.6c-1.8 0-1.6 2.6-1 5 .6 2.3 2.8 3.2 5.3 2.8-3.6.8-4.2 3.2-2 5.2 3 2.6 4.4-.8 5.1-3 .7 2.2 2.1 5.6 5.1 3 2.2-2 1.6-4.4-2-5.2 2.5.4 4.7-.5 5.3-2.8.6-2.4.8-5-1-5C17 4.6 13.6 8 12 11.2z"/>',
  pixiv: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M9.5 17V8h3.2a2.8 2.8 0 0 1 0 5.6H9.5"/>',
  site: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.6 2.6 2.6 14.4 0 17M12 3.5c-2.6 2.6-2.6 14.4 0 17"/>'
};
const netIcon = k => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${NET_ICON[k] || NET_ICON.site}</svg>`;
function artistLinks(a) {
  const l = ARTLINKS && ARTLINKS[a.key]; if (!l) return '';
  const items = ARTNET.filter(([k]) => /^https:\/\//.test(l[k] || ''));
  return items.length ? `<div class="pad artist-links"><div class="chips wrap">${items.map(([k, n]) => `<a class="chip netchip" data-net="${k}" href="${esc(l[k])}" target="_blank" rel="noopener">${netIcon(k)}${n}</a>`).join('')}</div><div class="small" style="margin-top:6px">${tr('Comptes officiels de l’artiste · liens externes')}</div></div>` : '';
}
let artSort = 'prix', artMissing = false, artShown = 48;
function viewArtist(name) {
  const a = artistIndex().byKey.get(illKey(name || ''));
  if (!a) return `<div class="top">${backBtn()}</div><div class="pad"><div class="note">Illustrateur introuvable.</div></div>${tabs('')}`;
  loadArtLinks();
  const all = CARDS.filter(c => a.idx.has(c.i) && !isHidden(c));
  const mine = new Set(collection.map(it => it.key));
  const owned = all.filter(c => mine.has(c.key)).length;
  const years = all.map(c => year(c.set)).filter(Boolean).sort();
  const best = all.filter(hasImg).sort((x, y) => (price(y) || 0) - (price(x) || 0)).slice(0, 6);
  const sorts = [['prix', 'Plus chères'], ['recent', 'Plus récentes'], ['ancien', 'Plus anciennes']];
  const SORT = { prix: (x, y) => (price(y) || 0) - (price(x) || 0), recent: (x, y) => (y.set.date || '').localeCompare(x.set.date || ''), ancien: (x, y) => (x.set.date || '9').localeCompare(y.set.date || '9') };
  const list = (artMissing ? all.filter(c => !mine.has(c.key)) : all).slice().sort(SORT[artSort]);
  const shownList = list.slice(0, artShown);
  return `<div class="top">${backBtn()}<a class="sub" href="#/illustrateurs" style="font-weight:600;text-decoration:none">${tr('Illustrateurs')}</a><span style="width:44px"></span></div>
  <div class="artist-head pad">
    <div class="artist-id"><div class="small eyebrow">${tr('Illustrateur')}</div><h1 class="h1">${esc(a.name)}</h1>
      <p class="sub artist-facts">${F(a.n > 1 ? '{0} cartes' : '{0} carte', a.n)}${years.length ? ' · ' + (years[0] === years[years.length - 1] ? years[0] : years[0] + '–' + years[years.length - 1]) : ''}${owned ? ' · ' + F(owned > 1 ? '{0} dans ma collection' : '{0} dans ma collection', owned) : ''}</p></div>
    ${followBtn(a.name)}
  </div>
  ${artistLinks(a)}
  ${best.length >= 3 ? `<div class="sect"><h2 class="h2">${tr('Ses cartes les plus cotées')}</h2></div><div class="hrow hero artist-best" style="padding-bottom:18px">${best.map(c => tile(c, { big: true, eager: true, meta: setName(c.set) + (price(c) ? ' · ' + eurC(price(c)) : '') })).join('')}</div>` : ''}
  <div class="sect between"><h2 class="h2">${tr('Toutes ses cartes')}</h2><span class="sub">${list.length.toLocaleString(LOCALE)}</span></div>
  <div class="pad chips scroll" style="padding-bottom:12px">${sorts.map(([k, l]) => `<button class="chip${artSort === k ? ' on' : ''}" data-act="artsort" data-v="${k}">${tr(l)}</button>`).join('')}<button class="chip${artMissing ? ' on' : ''}" data-act="artmissing" aria-pressed="${artMissing}">${tr('Celles que je n’ai pas')}</button></div>
  ${shownList.length ? `<div class="grid">${shownList.map(c => tile(c, { meta: setName(c.set) + ' · ' + (price(c) ? eurC(price(c)) : year(c.set)) })).join('')}</div>` : `<div class="pad"><div class="note">${tr('Tu as toutes ses cartes.')}</div></div>`}
  ${list.length > artShown ? `<div class="pad" style="margin-top:14px"><button class="btn" data-act="artmore">${F('Voir plus ({0})', list.length - artShown)}</button></div>` : ''}
  <div style="height:20px"></div>${tabs('')}`;
}
/* Accueil Galerie : les cartes récentes des artistes suivis, celles que je n'ai pas */
function followedBlock() {
  if (!follows.length) return '';
  const idx = artistIndex(), mine = new Set(collection.map(it => it.key)), set = new Set();
  for (const f of follows) { const a = idx.byKey.get(illKey(f)); if (a) a.idx.forEach(i => set.add(i)); }
  const cs = CARDS.filter(c => set.has(c.i) && !mine.has(c.key) && hasImg(c) && !isHidden(c)).sort((x, y) => (y.set.date || '').localeCompare(x.set.date || '')).slice(0, 12);
  if (!cs.length) return '';
  return `<div class="sect between"><h2 class="h2">${tr('Mes artistes')}</h2><a class="sub" href="#/illustrateurs">${follows.length > 1 ? F('{0} suivis', follows.length) : F('{0} suivi', follows.length)}</a></div><p class="pad small" style="margin:0 0 8px">${tr('Leurs cartes récentes que tu n’as pas.')}</p><div class="hrow" style="padding-bottom:18px">${cs.map(c => tile(c, { meta: ill(c) })).join('')}</div>`;
}

/* Prix sur la fiche : cote du jour + mini-courbe des moyennes (30 j, 7 j, hier, aujourd'hui) */
function priceSection(c) {
  if (!c.p || (PKM && !quote(c))) return `<div class="sect"><h2 class="h2">Prix</h2></div><div class="pad"><div class="note">Pas encore de cote ${esc(SRC())} pour cette ${PKM ? 'carte' : 'impression'}${c.cml ? `. Sur Cardmarket, la version la moins chère de cette carte est à ${eur(c.cml)}` : ''}${c.set.reg === 'ja' ? ' (les cartes asiatiques sont moins suivies)' : ''}.</div></div>`;
  if (PKM) return coteSection(c);
  const low = pf(c, 'low'), tr = pf(c, 'trend'), a30 = pf(c, 'avg30'), a7 = pf(c, 'avg7'), a1 = pf(c, 'avg1'), holo = pf(c, 'trendHolo');
  const main = tr != null ? tr : low;
  const steps = [['Moy. 30 j', a30], ['Moy. 7 j', a7], ['Hier', a1], ['Aujourd’hui', tr]].filter(x => x[1] != null && x[1] > 0);
  const chart = steps.length >= 2 ? `<div class="steps">${steps.map(([l, v]) => `<div><div class="lab">${l}</div><div class="num">${eur(v)}</div></div>`).join('')}</div>` : '';
  const delta = a30 ? (main - a30) / a30 : null;
  return `<div class="sect between"><h2 class="h2">Prix</h2><span class="sub">${esc(SRC())}${SRC() === 'Cardmarket' ? ', toutes langues' : ' (États-Unis)'}</span></div>
  <div class="pad stack">
    <div class="prices"><div><div class="lab">Tendance</div><div class="val num">${eur(main)}</div></div><div><div class="lab">Prix bas</div><div class="val num">${eur(low)}</div></div><div><div class="lab">Sur 30 jours</div><div class="val num ${delta == null ? '' : delta >= 0 ? 'gain' : 'loss'}">${delta == null ? '—' : (delta >= 0 ? '+' : '') + Math.round(delta * 100) + ' %'}</div></div></div>
    <div class="panel">${chart || '<div class="small">Pas assez de ventes récentes pour comparer.</div>'}
      ${holo ? `<div class="small" style="margin-top:6px">Version reverse / holo : ${eur(holo)}</div>` : ''}
      ${eurNote(main) ? `<div class="small" style="margin-top:4px">${eurNote(main)} · taux ${RATES.approx ? 'approximatif' : 'BCE du ' + fdate(RATES.date)}</div>` : ''}
      ${(() => { const r = setRank(c); return r && r.of >= 5 ? `<div class="small" style="margin-top:6px">${F('Rang dans le set : {0} sur {1} cartes cotées · cote médiane du set {2}', `${r.rank}<sup>${ordSuffix(r.rank)}</sup>`, r.of, eur(r.median))}</div>` : ''; })()}
      <div class="small" style="margin-top:6px">${SRC() === 'Cardmarket' ? `Guide de prix Cardmarket du ${fdate(priceDate())} : une seule cote, toutes langues et tous états confondus.` : `Prix de cette impression sur ${esc(SRC())} (marché américain), converti depuis le dollar.${c.cml ? ` Sur Cardmarket, la version la moins chère de cette carte (toutes impressions) est à ${eur(c.cml)}.` : ''}`}</div></div>
  </div>`;
}
function upcomingSections(c) {
  return `<div class="sect between"><h2 class="h2">Historique des prix</h2><span class="sub">relevé chaque matin</span></div>
  <div class="pad"><div class="panel stack" style="gap:6px" id="hist" data-cm="${c.cm || ''}" data-key="${esc(c.key)}">${c.cm ? '<div class="small">Chargement de l’historique…</div>' : '<div class="small">Pas d’historique : cette carte n’est pas sur Cardmarket.</div>'}</div></div>
`;
}

/* Historique : relevé quotidien (historique/NN.json, rempli chaque matin par GitHub) */
const HIST = new Map();
async function loadHist() {
  const box = document.getElementById('hist'); if (!box || !box.dataset.cm) return;
  const cm = +box.dataset.cm, n = String(cm % 100).padStart(2, '0');
  let h = HIST.get(n);
  if (!h) { try { const r = await fetch('historique/' + n + '.json', { cache: 'no-cache' }); h = r.ok ? await r.json() : null; } catch (e) { h = null; } if (h) HIST.set(n, h); }
  if (!document.body.contains(box)) return;
  const intro = 'CallIt! enregistre la cote Cardmarket de chaque carte tous les matins. La courbe s’allonge jour après jour, jusqu’à 3, 6 et 12 mois.';
  if (!h) { box.innerHTML = `<div class="sub" style="line-height:1.45">${intro}</div><div class="small">La courbe apparaîtra dans quelques jours.</div>${cmCurve(box)}`; return; }
  const start = new Date(h.start + 'T12:00:00'), arr = h.p[cm] || [];
  HPTS = { pts: arr.map((v, i) => v == null ? null : [new Date(start.getTime() + i * 864e5), v / 100]).filter(Boolean),
    since: start.toLocaleDateString(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' }), intro, box };
  drawHist();
}
let HPTS = null, histPeriod = 30, histClean = true; // 1 mois par défaut : la même période que « Sur 30 jours » du bloc Prix
// Valeurs aberrantes : un point qui s'écarte de plus de 50 % de la médiane de ses 7 voisins (vente isolée, erreur de saisie)
function cleanSeries(pts) {
  if (pts.length < 5) return { pts, out: 0 };
  const keep = pts.filter((p, i) => { const w = pts.slice(Math.max(0, i - 3), i + 4).map(x => x[1]).sort((a, b) => a - b); const m = w[w.length >> 1]; return Math.abs(p[1] - m) <= 0.5 * m; });
  return { pts: keep, out: pts.length - keep.length };
}
/* Sources de la courbe. Aujourd'hui une seule (Cardmarket) ; une autre (eBay…) s'ajoutera ici avec ses propres repères,
   puis un choix de source au-dessus de la courbe. Repères : les moyennes de vente du guide du jour, placées 30 et 7 jours
   avant la date du guide, en attendant que nos relevés couvrent la période. */
const HIST_SOURCES = [{
  id: 'cm', nom: () => SRC(),
  reperes: c => {
    const m = PKM ? (quote(c) || {}).m : null, a30 = m ? m[4] : pf(c, 'avg30'), a7 = m ? m[3] : pf(c, 'avg7');
    const g = new Date((priceDate() || new Date().toISOString()).slice(0, 10) + 'T12:00:00');
    return [[30, a30, 'Moy. 30 j'], [7, a7, 'Moy. 7 j']].filter(x => x[1] > 0).map(([j, v, l]) => [new Date(g.getTime() - j * 864e5), v, `${tr(l)} ${SRC()}`, 'moy']);
  }
}];
// Série affichée : repères de la source (seulement avant notre premier relevé), puis nos relevés du matin
function histSerie(box, rel, src = HIST_SOURCES[0]) { return histSerieCarte(BYKEY.get(box.dataset.key), rel, src); }
function histSerieCarte(c, rel, src = HIST_SOURCES[0]) {
  const t0 = rel.length ? rel[0][0].getTime() : Infinity;
  const rep = c ? src.reperes(c).filter(p => p[0].getTime() < t0 - 36e5) : [];
  return { rep, pts: [...rep, ...rel] };
}
// Courbe des 30 derniers jours (Mode Live, fenêtre flottante) : la même que « 1 mois » sur la fiche, sans valeurs aberrantes
function hist30(c, rel) {
  const all = histSerieCarte(c, rel || []).pts; if (all.length < 2) return null;
  const from = all[all.length - 1][0].getTime() - 30 * 864e5 - 36e5, pts = all.filter(p => p[0].getTime() >= from);
  const r = pts.filter(p => !p[3]), cl = r.length >= 5 ? cleanSeries(r).pts : r, out = [...pts.filter(p => p[3]), ...cl];
  if (out.length < 2) return null;
  return { pts: out, pc: Math.round((out[out.length - 1][1] / out[0][1] - 1) * 100), rel: cl.length, rep: out.length > cl.length };
}
function drawHist() {
  if (!HPTS || !document.body.contains(HPTS.box)) return;
  const { since, intro, box } = HPTS, src = HIST_SOURCES[0];
  const all = histSerie(box, HPTS.pts, src);
  if (all.pts.length < 2) { box.innerHTML = `<div class="sub" style="line-height:1.45">${intro}</div><div class="small">${F('Relevé commencé le {0} · {1} jour enregistré. La vraie courbe apparaît dès le deuxième jour.', since, HPTS.pts.length)}</div>${cmCurve(box)}`; return; }
  const lastT = all.pts[all.pts.length - 1][0].getTime();
  const span = Math.round((lastT - all.pts[0][0].getTime()) / 864e5);
  const periods = [[7, '7 j'], [14, '14 j'], [30, '1 mois'], [91, '3 mois'], [182, '6 mois'], [365, '1 an']];
  const avail = periods.filter(([n], i) => !i || span > periods[i - 1][0]);
  const per = avail.some(([n]) => n === histPeriod) ? histPeriod : avail[avail.length - 1][0];
  const from = lastT - per * 864e5 - 36e5;
  const rel = HPTS.pts.filter(p => p[0].getTime() >= from), rep = all.rep.filter(p => p[0].getTime() >= from);
  const cl = histClean ? cleanSeries(rel) : { pts: rel, out: 0 };
  let pts = [...rep, ...(cl.pts.length >= 2 || rep.length ? cl.pts : rel)];
  if (pts.length < 2) pts = all.pts.slice(-2);
  const vs = pts.map(x => x[1]), ch = (vs[vs.length - 1] - vs[0]) / vs[0], pc = Math.round(ch * 100);
  const nRel = pts.filter(p => !p[3]).length, withRep = pts.some(p => p[3]);
  box.innerHTML = `<div class="hp">${periods.map(([n, l]) => `<button class="chip${per === n ? ' on' : ''}" data-act="hp" data-v="${n}" ${avail.some(a => a[0] === n) ? '' : `disabled title="${tr('Pas encore assez de jours relevés')}"`}>${tr(l)}</button>`).join('')}</div>
  <div class="between"><span class="sub">${withRep ? F(nRel > 1 ? 'Moyennes {0}, puis {1} jours relevés' : 'Moyennes {0}, puis {1} jour relevé', esc(src.nom()), nRel) : F('{0} jours relevés', nRel)}</span><b class="num ${!pc ? '' : pc > 0 ? 'gain' : 'loss'}">${pc > 0 ? '▲ +' : pc < 0 ? '▼ ' : ''}${pc} %</b></div>
  ${lineChart(pts, tr('Historique de la cote'))}
  ${rel.length >= 5 ? `<label class="small row" style="gap:8px"><input type="checkbox" data-act="hclean" ${histClean ? 'checked' : ''}> ${tr('Retirer les valeurs aberrantes')}${histClean && cl.out ? ` (${cl.out > 1 ? F('{0} retirées', cl.out) : F('{0} retirée', cl.out)})` : ''}</label>` : ''}
  ${withRep ? `<div class="lc-leg small"><span><i class="lc-k moy"></i>${esc(F('Moyennes des ventes {0} (30 et 7 derniers jours)', src.nom()))}</span><span><i class="lc-k rel"></i>${esc(F(PKM ? 'Cote relevée chaque matin par CallIt! depuis le {0}' : 'Tendance {1} relevée chaque matin depuis le {0}', since, src.nom()))}</span></div>`
    : `<div class="small">${PKM ? F('Cote relevée chaque matin depuis le {0}.', since) : F('Cote « tendance » Cardmarket relevée chaque matin depuis le {0}.', since)}</div>`}`;
}

function cmCurve(box) {
  const c = BYKEY.get(box.dataset.key); if (!c) return '';
  const now = Date.now(), pts = [[30, 'moy. 30 j', pf(c, 'avg30')], [7, 'moy. 7 j', pf(c, 'avg7')], [1, 'hier', pf(c, 'avg1')], [0, 'auj.', pf(c, 'trend')]]
    .filter(x => x[2] > (x[0] ? 0 : COTE.ARTEFACT)).map(x => [new Date(now - x[0] * 864e5), x[2], x[1]]);
  if (pts.length < 2) return '';
  return `<div class="small" style="margin-top:4px">En attendant, la tendance des 30 derniers jours selon les moyennes Cardmarket :</div>${lineChart(pts, 'Tendance sur 30 jours')}`;
}
/* Courbe sobre : hauteur fixe, trait fin, axe qui part de 0, valeur au survol.
   Points : [date, valeur, libellé ?, 'moy' ?]. L'axe des dates suit le temps réel (un repère à 30 jours est loin à gauche).
   Les points 'moy' (moyennes de vente d'une source, pas un relevé du jour) sont reliés en pointillés. */
function lineChart(pts, label) {
  const vs = pts.map(x => x[1]), mx = Math.max(...vs) * 1.08 || 1, n = pts.length;
  const ts = pts.map(x => x[0] instanceof Date ? x[0].getTime() : NaN), t0 = ts[0], tn = ts[n - 1], timed = n > 1 && ts.every(t => !isNaN(t)) && tn > t0;
  const X = i => n === 1 ? 50 : timed ? (ts[i] - t0) / (tn - t0) * 100 : i / (n - 1) * 100, Y = v => 100 - v / mx * 100;
  const P = i => `${(X(i) * 10).toFixed(1)} ${Y(vs[i]).toFixed(2)}`;
  const k = pts.reduce((m, x, i) => (x[3] === 'moy' ? i : m), -1), cut = k < 0 ? 0 : Math.min(k + 1, n - 1); // fin des pointillés : le premier vrai relevé
  const solid = pts.slice(cut).map((x, j) => `${j ? 'L' : 'M'}${P(cut + j)}`).join(' ');
  const dashed = cut ? pts.slice(0, cut + 1).map((x, i) => `${i ? 'L' : 'M'}${P(i)}`).join(' ') : '';
  const d = pts.map((x, i) => `${i ? 'L' : 'M'}${P(i)}`).join(' ');
  const up = vs[n - 1] >= vs[0], col = up ? 'var(--gain)' : 'var(--loss)';
  const fd = x => x.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' });
  const data = esc(JSON.stringify(pts.map((x, i) => [x[2] || fd(x[0]), eur(x[1]), X(i), Y(x[1])])));
  // Dates sous la courbe : à leur place dans le temps, sans se chevaucher
  let ticks = pts.some(x => x[2] && x[3] !== 'moy') ? pts.map((x, i) => [X(i), x[2]]) : [[0, fd(pts[0][0])], ...(k >= 0 && cut < n - 1 ? [[X(cut), fd(pts[cut][0])]] : []), [100, fd(pts[n - 1][0])]];
  ticks = ticks.filter((t, i) => i === ticks.length - 1 ? true : ticks[ticks.length - 1][0] - t[0] >= 16).filter((t, i, a) => !i || t[0] - a[i - 1][0] >= 16 || i === a.length - 1);
  const tick = ([x, l], i, a) => `<span style="left:${x.toFixed(1)}%;transform:translateX(${i === 0 && x < 8 ? '0' : i === a.length - 1 && x > 92 ? '-100%' : '-50%'})">${esc(String(l))}</span>`;
  return `<div class="lc" data-pts="${data}" role="img" aria-label="${esc(label)}">
    <div class="lc-max" style="top:calc(${Y(mx / 1.08).toFixed(2)}% - 16px)">${eur(mx / 1.08)}</div><div class="lc-zero">0</div>
    <svg viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true"><line x1="0" x2="1000" y1="${Y(mx / 1.08).toFixed(2)}" y2="${Y(mx / 1.08).toFixed(2)}" class="lc-grid"/><line x1="0" x2="1000" y1="100" y2="100" class="lc-base"/>
      <path d="${d} L${(X(n - 1) * 10).toFixed(1)} 100 L${(X(0) * 10).toFixed(1)} 100 Z" fill="${col}" opacity=".08"/>${dashed ? `<path d="${dashed}" fill="none" stroke="${col}" stroke-width="1.75" stroke-dasharray="5 5" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>` : ''}<path d="${solid}" fill="none" stroke="${col}" stroke-width="1.75" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>
    ${pts.map((x, i) => x[3] === 'moy' ? `<span class="lc-dot lc-moy" style="left:${X(i)}%;top:${Y(vs[i])}%;border-color:${col}"></span>` : '').join('')}
    <span class="lc-dot" style="left:${X(n - 1)}%;top:${Y(vs[n - 1])}%;background:${col}"></span>
    <span class="lc-cur" hidden></span><span class="lc-tip" hidden></span>
  </div><div class="lc-x">${ticks.map(tick).join('')}</div>`;
}
document.addEventListener('pointermove', e => {
  const lc = e.target.closest && e.target.closest('.lc'); document.querySelectorAll('.lc-tip:not([hidden]),.lc-cur:not([hidden])').forEach(el => { if (!lc || !lc.contains(el)) el.hidden = true; });
  if (!lc) return;
  const pts = JSON.parse(lc.dataset.pts), r = lc.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * 100;
  let best = pts[0]; for (const p of pts) if (Math.abs(p[2] - x) < Math.abs(best[2] - x)) best = p;
  const tip = lc.querySelector('.lc-tip'), cur = lc.querySelector('.lc-cur');
  tip.hidden = cur.hidden = false; tip.textContent = best[0] + ' · ' + best[1];
  cur.style.left = best[2] + '%'; cur.style.top = best[3] + '%';
  tip.style.left = Math.min(Math.max(best[2], 15), 85) + '%';
});

/* ---------- Rang dans le set, voisines, phrase-résumé, « À savoir » ---------- */
const numKey = c => { const m = String(c.num).match(/^(\D*)(\d+)(.*)$/); return m ? [m[1], +m[2], m[3]] : [String(c.num), 0, '']; };
const cmpNum = (a, b) => { const x = numKey(a), y = numKey(b); return x[0].localeCompare(y[0]) || x[1] - y[1] || x[2].localeCompare(y[2]); };
const SETC = new Map();
function setCards(c) {
  let v = SETC.get(c.s); if (v) return v;
  const all = CARDS.filter(x => x.s === c.s).sort(cmpNum);
  const priced = all.filter(x => price(x) > 0).sort((a, b) => price(b) - price(a));
  const mid = priced.length ? price(priced[Math.floor(priced.length / 2)]) : null;
  v = { all, priced, median: mid }; SETC.set(c.s, v); return v;
}
function setRank(c) {
  const sc = setCards(c), pr = price(c); if (!(pr > 0)) return null;
  return { rank: sc.priced.indexOf(c) + 1, of: sc.priced.length, median: sc.median, ratio: sc.median ? pr / sc.median : null };
}
const ord = n => n === 1 ? 'la plus chère' : n + 'e plus chère';
function summary(c) {
  const pr = price(c);
  if (!(pr > 0) && c.cml) return `<p class="summary">Pas de prix pour cette impression. La version la moins chère de cette carte (toutes impressions) est à <b>${eur(c.cml)}</b> sur Cardmarket.</p>`;
  if (!(pr > 0)) return `<p class="summary">Pas encore de cote pour cette carte${c.set.reg === 'ja' ? ' : les cartes asiatiques sont peu vendues en Europe' : ''}.</p>`;
  // Pokémon : l'évolution compare les ventes des 7 derniers jours à celles des 30 derniers, et ne se dit que si la cote est assez sûre
  const q = PKM ? quote(c) : null, a30 = pf(c, 'avg30'), d = q ? (q.v >= 1 && q.conf > 0 ? q.d : null) : (a30 ? (pr - a30) / a30 : null), r = setRank(c);
  let t = q && q.src === 'bas' ? F('Pas de vente récente : l’offre la moins chère est à {0}', `<b>${eurC(pr)}</b>`) : F('Vaut environ {0} aujourd’hui', `<b>${eurC(pr)}</b>`);
  const pc = `<span class="${d >= 0 ? 'gain' : 'loss'}">${Math.abs(Math.round(d * 100))} %</span>`;
  if (q && d >= 0.03) t += '. ' + F('Les ventes des 7 derniers jours sont {0} plus hautes : hausse à confirmer', pc); // la cote ne suit pas une hausse tant qu'elle n'est pas installée
  else if (d != null && Math.abs(d) >= 0.03) t += F(d >= 0 ? ', en hausse de {0} sur 30 jours' : ', en baisse de {0} sur 30 jours', pc);
  else if (d != null) t += F(', stable sur 30 jours');
  t += '.';
  if (r && r.of >= 5) {
    const b0 = r.rank <= 3 ? '<b>' : '', b1 = r.rank <= 3 ? '</b>' : '';
    t += ' ' + F(r.rank === 1 ? 'C’est {0}la plus chère{1} de {2} (sur {3} cartes cotées)' : 'C’est {0}la {4}e plus chère{1} de {2} (sur {3} cartes cotées)', b0, b1, esc(setName(c.set)), r.of, r.rank);
    if (r.ratio && r.ratio >= 2) t += F(', {0} fois la cote médiane du set', r.ratio >= 10 ? Math.round(r.ratio) : r.ratio.toLocaleString(LOCALE, { maximumFractionDigits: 1 }));
    t += '.';
  }
  return `<p class="summary">${t}</p>`;
}
function neighbours(c) {
  const all = setCards(c).all, i = all.indexOf(c), prev = all[i - 1], next = all[i + 1];
  if (!prev && !next) return '';
  const b = (x, dir) => x ? `<a class="nb ${dir}" href="#/carte/${encodeURIComponent(x.key)}">${dir === 'prev' ? icon('back', 16) : ''}<span><span class="small">${dir === 'prev' ? 'Précédente' : 'Suivante'} · n° ${esc(x.num)}</span><b>${esc(cardName(x))}</b></span>${dir === 'next' ? `<span style="transform:scaleX(-1);display:flex">${icon('back', 16)}</span>` : ''}</a>` : '<span></span>';
  return `<div class="pad nbs">${b(prev, 'prev')}${b(next, 'next')}</div>`;
}
const RAR_INFO = {
  'Common': 'Carte commune, repérable au rond noir en bas de la carte.',
  'Uncommon': 'Carte peu commune, repérable au losange noir en bas de la carte.',
  'Rare': 'Carte rare, repérable à l’étoile noire en bas de la carte.',
  'Holo Rare': 'Rare holo : seule l’illustration brille (effet holographique), le reste de la carte est normal.',
  'Rare Holo': 'Rare holo : seule l’illustration brille (effet holographique), le reste de la carte est normal.',
  'Double rare': 'Double rare : une carte ex à l’illustration classique, avec deux étoiles noires. Facile à trouver dans les boosters.',
  'Ultra Rare': 'Ultra rare : une des raretés hautes du set, en général une carte pleine illustration à la surface texturée.',
  'Illustration rare': 'Illustration rare (AR) : le dessin occupe toute la carte, sans cadre, et montre souvent le Pokémon dans son milieu. Rareté créée avec Écarlate et Violet (2023).',
  'Special illustration rare': 'Illustration spéciale rare (SIR) : la version la plus travaillée d’une carte ex ou Dresseur, avec une scène pleine carte et une surface en relief. C’est la rareté la plus recherchée des sets récents.',
  'Hyper rare': 'Hyper rare : la version dorée de la carte, la plus difficile à tirer du set.',
  'Mega Hyper Rare': 'Méga hyper rare : la rareté la plus haute des sets Méga Évolution.',
  'Secret Rare': 'Rare secrète : son numéro dépasse le nombre officiel de cartes du set (par exemple 105/102).',
  'Shiny rare': 'Rare chromatique : le Pokémon a ses couleurs « shiny », plus rares que ses couleurs habituelles.',
  'Shiny Ultra Rare': 'Ultra rare chromatique : une carte pleine illustration d’un Pokémon aux couleurs « shiny ».',
  'Character Rare': 'Character rare : le Pokémon est mis en scène avec son Dresseur ou dans un décor, en pleine carte.',
  'Character Super Rare': 'Character super rare : une carte V ou VMAX mise en scène avec son Dresseur, en pleine carte.',
  'Radiant Rare': 'Radieuse : un Pokémon chromatique au dessin stylisé, une seule carte Radieuse autorisée par deck.',
  'Amazing Rare': 'Magnifique rare : le Pokémon sort d’un fond arc-en-ciel scintillant.',
  'Promo': 'Carte promo : distribuée hors des boosters (coffrets, événements, magazines).',
  'Classic Collection': 'Classic Collection : réédition d’une carte célèbre pour les 25 ans de Pokémon (Célébrations, 2021).',
  'ACE SPEC Rare': 'ACE SPEC : une carte Dresseur très puissante, limitée à un exemplaire par deck.'
};
function aSavoir(c) {
  const items = [];
  const r = rar(c); if (RAR_INFO[r]) items.push(RAR_INFO[r]);
  if (isVintage(c)) items.push('Carte de l’époque Wizards of the Coast (1999 à 2003), les premières années du jeu en Occident. L’état compte énormément : les bords blanchis font vite baisser le prix.');
  if (c.f & 2) items.push('Existe aussi en 1re édition, avec le tampon « Edition 1 » à gauche sous l’illustration. Ces exemplaires sont nettement plus recherchés.');
  if (c.set.reg === 'ja') items.push('Version asiatique : souvent sortie avant la version anglaise, avec une impression et des couleurs légèrement différentes.');
  if (c.i != null) { const n = (artistIndex().list.find(a => a.idx.has(c.i)) || {}).n; if (n > 1) items.push(F('{0} a signé {1} cartes dans CallIt!.', esc(ill(c)), n) + ` <a href="${artistHref(ill(c))}">${F('Voir son style')}</a>.`); }
  if (c.set.date) items.push(c.set.count ? F('Sortie le {0} dans {1}, un set de {2} cartes officielles.', fdate(c.set.date), esc(setName(c.set)), c.set.count) : F('Sortie le {0} dans {1}.', fdate(c.set.date), esc(setName(c.set))));
  if (c.langs.length > 1) items.push(F('Imprimée en {0} langues : {1}.', c.langs.length, esc(I18N ? andList(langList(c.langs).map(x => tr(x[0].toUpperCase() + x.slice(1)))) : joinFr(langList(c.langs)))));
  if (!items.length) return '';
  return `<div class="sect"><h2 class="h2">À savoir</h2></div><div class="pad"><div class="panel"><ul class="asavoir">${items.map(t => `<li>${t}</li>`).join('')}</ul></div></div>`;
}

/* ---------- Indices de prix (Cardmarket) : valeur cumulée et variation sur 30 jours ---------- */
// Ce qu'une carte apporte à un indice : [sa cote, ses ventes sur 7 jours, ses ventes sur 30 jours, compte ou non dans la variation],
// ou null si elle n'a pas les deux moyennes. Pokémon : la cote CallIt!, comme partout ; une carte dont les ventes de la semaine
// vont du simple au double par rapport au mois (vente isolée, autre état) ne compte pas dans la variation, un lien en double non plus.
// Autres jeux : la tendance comparée à la moyenne sur 30 jours.
function idxM(c) {
  if (c._ix !== undefined) return c._ix;
  let m = null;
  if (PKM) { const q = quote(c); if (q && q.src === 'moy' && q.m[3] > 0 && q.m[4] > 0) m = [q.v, q.m[3], q.m[4], !q.dup && Math.max(q.m[3], q.m[4]) / Math.min(q.m[3], q.m[4]) < COTE.ECART]; }
  else { const t = pf(c, 'trend'), a = pf(c, 'avg30'); if (t > 0 && a > 0) m = [t, t, a, true]; }
  return (c._ix = m);
}
// Évolution d'une carte dans la liste d'un indice : la même que sur sa fiche (rien si la confiance est faible)
const idxCardCh = c => { const m = idxM(c); if (!PKM) return m[1] / m[2] - 1; const q = quote(c); return q.conf > 0 ? q.d : null; };
// Un lien Cardmarket partagé par plusieurs cartes ne compte qu'une fois
const idxUniq = cards => { const vu = new Set(); return cards.filter(c => idxM(c) && !(c.cm && vu.has(c.cm)) && (!c.cm || vu.add(c.cm))); };
// v : cotes additionnées (n cartes) ; ch : variation, donnée seulement si les cartes qui comptent pèsent au moins la moitié de l'indice
const agg = (cards) => { let v = 0, vk = 0, v7 = 0, v30 = 0, n = 0; for (const c of idxUniq(cards)) { const m = idxM(c); v += m[0]; n++; if (m[3]) { vk += m[0]; v7 += m[1]; v30 += m[2]; } } return { v, ch: v30 && vk >= v / 2 ? v7 / v30 - 1 : null, n }; };
const SIDX = new Map();
function setIndex(sIdx) {
  if (SIDX.has(sIdx)) return SIDX.get(sIdx);
  const cs = idxUniq(CARDS.filter(c => c.s === sIdx));
  const top = cs.slice().sort((a, b) => idxM(b)[0] - idxM(a)[0]).slice(0, 3);
  const r = { full: agg(cs), top: Object.assign(agg(top), { cards: top }), set: DB.sets[sIdx], s: sIdx };
  SIDX.set(sIdx, r); return r;
}
function setIndexPanel(sIdx) {
  const x = setIndex(sIdx); if (x.full.n < 3) return '';
  return `<div class="pad" style="margin-top:12px"><div class="panel stack" style="gap:10px">
    <div class="between"><b style="font-size:15px">Indices de ce set</b><a class="small" href="#/indices">tous les indices</a></div>
    <div class="idx2"><div><div class="small">Set complet · ${x.full.n} cartes</div><div class="num" style="font-weight:700;font-size:20px">${eur(x.full.v)}</div><div class="small">${pct(x.full.ch)} sur 30 j</div></div>
    <div><div class="small">Top 3 · cartes phares</div><div class="num" style="font-weight:700;font-size:20px">${eur(x.top.v)}</div><div class="small">${pct(x.top.ch)} sur 30 j</div></div></div>
    <div class="idx3">${x.top.cards.map(c => `<a href="#/carte/${encodeURIComponent(c.key)}">${cimg(c)}<span class="small">${esc(cardName(c))} · ${eurC(idxM(c)[0])}</span></a>`).join('')}</div>
    <div class="small" style="line-height:1.45">Le set complet additionne une carte de chaque : c’est l’indice le plus stable. Le top 3 suit les 3 cartes les plus chères : il réagit plus vite.</div>
  </div></div>`;
}
let IDX = null;
function indices() {
  if (IDX) return IDX;
  const vint = idxUniq(CARDS.filter(c => isVintage(c) && idxM(c)).sort((a, b) => idxM(b)[0] - idxM(a)[0])).slice(0, 100);
  const bySet = new Map(), byDex = new Map();
  for (const c of CARDS) { if (c.x || c.set.reg !== 'en') continue; (bySet.get(c.s) || bySet.set(c.s, []).get(c.s)).push(c); if (c.dex) (byDex.get(c.dex) || byDex.set(c.dex, []).get(c.dex)).push(c); }
  const sets = [...bySet.values()].map(cs => Object.assign(agg(cs), { set: cs[0].set, s: cs[0].s, top: setIndex(cs[0].s).top })).filter(x => x.n >= 15);
  const pokes = [...byDex.entries()].map(([dex, cs]) => Object.assign(agg(cs), { dex, name: DB.species[dex] || cardName(cs[0]), top: cs.slice().sort((a, b) => (price(b) || 0) - (price(a) || 0))[0] })).filter(x => x.n >= 15);
  IDX = { vint: Object.assign(agg(vint), { cards: vint }), sets, pokes };
  return IDX;
}
const pct = ch => { if (ch == null) return '—'; const r = Math.round(ch * 1000) / 10; return r === 0 ? `<span style="font-weight:700">0 %</span>` : `<span class="${r > 0 ? 'gain' : 'loss'}" style="font-weight:700">${r > 0 ? '+' : ''}${r.toLocaleString(LOCALE)} %</span>`; };
let idxTab = 'vintage';
function viewIndices() {
  const I = indices();
  const tabsH = [['vintage', 'Vintage 100'], ['sets', 'Par set'], ['pokemon', 'Par Pokémon']].map(([k, l]) => `<button class="chip${idxTab === k ? ' on' : ''}" data-act="idx" data-v="${k}">${l}</button>`).join('');
  const row = (href, thumb, title, sub, v, ch, card) => `<a class="line" href="${href}">${thumb ? `<span class="thumb">${cimg(thumb)}</span>` : ''}<span class="mid"><b>${esc(title)}</b><span>${sub}</span></span><span class="px"><b class="num">${card ? eurC(v) : eur(v)}</b>${pct(ch)}</span></a>`;
  let body = '';
  if (idxTab === 'vintage') {
    body = `<div class="pad"><div class="panel stack" style="gap:6px"><div class="sub">Vintage 100</div><div class="num" style="font-weight:700;font-size:34px;letter-spacing:-.03em">${eur(I.vint.v)}</div><div>${pct(I.vint.ch)} <span class="sub">sur 30 jours</span></div>
    <div class="small" style="line-height:1.45">Les 100 cartes vintage (époque Wizards, 1999 à 2003) les plus chères sur Cardmarket, additionnées. Si l’indice monte, le vintage monte.</div></div></div>
    <div class="sect"><h2 class="h2" style="font-family:var(--sans)">Les 100 cartes de l’indice</h2></div>
    <div class="list">${I.vint.cards.map(c => row('#/carte/' + encodeURIComponent(c.key), c, cardName(c), esc(setName(c.set)) + ' · ' + esc(numLabel(c)), idxM(c)[0], idxCardCh(c), true)).join('')}</div>`;
  } else if (idxTab === 'sets') {
    const l = I.sets.filter(x => x.ch != null).sort((a, b) => b.ch - a.ch);
    body = `<p class="pad small" style="margin:8px 0 0;line-height:1.45">Deux indices par set : le set complet (une carte de chaque, version anglaise) et le top 3 (ses trois cartes les plus chères), avec leur variation sur 30 jours.</p>
    <div class="sect"><h2 class="h2" style="font-family:var(--sans)">En hausse</h2></div><div class="list">${l.slice(0, 10).map(x => row('#/recherche?set=' + x.s, x.top.cards[0], setName(x.set), year(x.set) + ' · ' + x.n + ' cartes · top 3 : ' + eur(x.top.v) + ' ' + pct(x.top.ch), x.v, x.ch)).join('')}</div>
    <div class="sect"><h2 class="h2" style="font-family:var(--sans)">En baisse</h2></div><div class="list">${l.slice(-10).reverse().map(x => row('#/recherche?set=' + x.s, x.top.cards[0], setName(x.set), year(x.set) + ' · ' + x.n + ' cartes · top 3 : ' + eur(x.top.v) + ' ' + pct(x.top.ch), x.v, x.ch)).join('')}</div>
    <div class="sect"><h2 class="h2" style="font-family:var(--sans)">Les sets les plus chers</h2></div><div class="list">${I.sets.slice().sort((a, b) => b.v - a.v).slice(0, 10).map(x => row('#/recherche?set=' + x.s, x.top.cards[0], setName(x.set), year(x.set) + ' · ' + x.n + ' cartes · top 3 : ' + eur(x.top.v) + ' ' + pct(x.top.ch), x.v, x.ch)).join('')}</div>`;
  } else {
    const l = I.pokes.filter(x => x.ch != null).sort((a, b) => b.ch - a.ch);
    const pr = x => row('#/recherche?dex=' + x.dex, x.top, x.name, x.n + ' cartes cotées', x.v, x.ch);
    body = `<p class="pad small" style="margin:8px 0 0;line-height:1.45">Toutes les cartes d’un Pokémon (versions anglaises) additionnées, et leur variation sur 30 jours.</p>
    <div class="sect"><h2 class="h2" style="font-family:var(--sans)">En hausse</h2></div><div class="list">${l.slice(0, 10).map(pr).join('')}</div>
    <div class="sect"><h2 class="h2" style="font-family:var(--sans)">En baisse</h2></div><div class="list">${l.slice(-10).reverse().map(pr).join('')}</div>
    <div class="sect"><h2 class="h2" style="font-family:var(--sans)">Les plus cotés</h2></div><div class="list">${I.pokes.slice().sort((a, b) => b.v - a.v).slice(0, 10).map(pr).join('')}</div>`;
  }
  return `<div class="top">${backBtn()}<span class="title" style="font-size:20px">Indices de prix</span><span></span></div>
  <div class="pad"><div class="chips scroll">${tabsH}</div></div>${body}
  <div class="pad" style="margin-top:14px"><div class="note">Calculé sur le guide de prix Cardmarket du ${fdate(priceDate())} ${PKM ? '(ventes des 7 derniers jours comparées à celles des 30 derniers jours).' : '(cote tendance comparée à la moyenne sur 30 jours).'}</div></div>
  ${tabs('')}`;
}

/* Fiche carte */
function viewCard(key, params) {
  const c = BYKEY.get(key);
  if (!c) return `<div class="top">${backBtn()}</div><div class="pad"><div class="note">Carte introuvable. Elle a peut-être changé de numéro.</div></div>${tabs('')}`;
  const owned = collection.filter(it => it.key === key);
  const wantLang = params.get('lang') || (owned[0] && owned[0].lang) || undefined;
  const p = c.p || [];
  const ex = excluded();
  const names = c.langs.filter(l => !(c.inf || []).includes(l)).map(l => `<div class="setrow" style="min-height:40px"><span class="${ex.has(l) ? 'sub' : ''}" style="font-weight:600;font-size:14px">${esc(LANG[l].name)}</span><span style="font-size:14px">${esc(c.n[l])}</span></div>`).join('');
  const sameIll = c.i != null ? CARDS.filter(x => x.i === c.i && x !== c && !isHidden(x)).slice(-12).reverse() : [];
  const VS = { 'prix-': (a, b) => (price(b) || 0) - (price(a) || 0), 'prix+': (a, b) => (price(a) || 1e9) - (price(b) || 1e9), recent: (a, b) => (b.set.date || '').localeCompare(a.set.date || ''), ancien: (a, b) => (a.set.date || '9').localeCompare(b.set.date || '9') };
  const samePoke = c.dex ? CARDS.filter(x => x.dex === c.dex && x !== c && !isHidden(x) && hasImg(x)).sort(VS[verSort]).slice(0, 16) : [];
  const priceBlock = (G() ? aSavoir(c) : '') + priceSection(c) + upcomingSections(c);
  const langsSel = visibleLangs(c).length ? visibleLangs(c) : c.langs;
  const ebayDom = (COUNTRY[S.country] || COUNTRY.FR).ebay;
  const ebayUrl = `https://www.ebay.${ebayDom}/sch/i.html?_nkw=${encodeURIComponent(PKM ? cardName(c, langsSel[0]) + ' ' + numLabel(c) : (c.n.en || cardName(c)) + ' ' + c.num + (GAME === 'mtg' ? ' ' + c.set.name.en : ''))}`;
  const ownedHtml = owned.length ? `<div class="sect between"><h2 class="h2">Dans ma collection</h2><span class="sub">${pl(owned.reduce((s, it) => s + (it.qty || 1), 0), 'exemplaire', 'exemplaires')}</span></div><div class="list">${owned.map(it => `<div class="line"><span class="mid"><b>${esc(tr(LANG[it.lang] ? LANG[it.lang].name : it.lang))} · ${it.grader ? esc(it.grader + ' ' + (it.grade || '')) : esc(tr('Brute')) + ' · ' + esc((CONDS.find(x => x[0] === it.cond) || ['', '—'])[1])}</b><span>${it.qty > 1 ? it.qty + ' × · ' : ''}${F('payée {0}', it.paid != null ? money(it.paid, it.cur) : '—')}${it.date ? ' · ' + esc(it.date) : ''}${it.note ? ' · ' + esc(it.note) : ''}</span></span><button class="btn small" data-act="edit" data-id="${it.id}">Modifier</button></div>`).join('')}</div>` : '';
  return `<div class="top">${backBtn()}${faceSwitch()}</div>
  <div class="fiche"><div class="fiche-a pad"><div class="fiche-img">${cimg(c, { big: true, eager: true, lang: wantLang, force: params.get('img') || undefined })}</div>
  ${isVintage(c) && c.langs.length > 1 ? `<div class="small" style="text-align:center;margin-top:8px">${params.get('img') ? `<a href="#/carte/${encodeURIComponent(c.key)}">Revenir à l'image nette (anglaise)</a>` : `Image anglaise, plus nette. Voir l'image ${c.langs.filter(l => l !== 'en').slice(0, 3).map(l => `<a href="#/carte/${encodeURIComponent(c.key)}?img=${l}">${LANG[l].short}</a>`).join(' · ')} (souvent une photo)`}</div>` : ''}</div>
  <div class="fiche-b"><div class="pad"><div class="fiche-title"><h1 class="h1">${esc(cardName(c))}</h1>
  <div class="sub" style="margin-top:4px">${c.set.reg === 'ja' && c.n.ja && c.n.ja !== cardName(c) ? esc(c.n.ja) + ' · ' : ''}<a href="#/recherche?set=${c.s}">${esc(setName(c.set))}</a> · ${esc(numLabel(c))}${year(c.set) ? ' · ' + year(c.set) : ''}${rarFr(c) ? ' · ' + esc(rarFr(c)) : ''}${c.f & 2 ? ' · existe aussi en 1re édition' : ''}</div>
  ${ill(c) ? `<div class="sub ill-line">illus. <a href="${artistHref(ill(c))}">${esc(ill(c))}</a>${followBtn(ill(c), true)}</div>` : ''}
  ${summary(c)}
  ${langChips(c)}</div></div>
  <div class="pad btns" style="margin-top:16px"><button class="btn primary" data-act="add" data-key="${esc(c.key)}">Ajouter à ma collection</button><button class="btn wishbtn${wished(c.key) ? ' on' : ''}" data-act="heart" data-key="${esc(c.key)}" aria-pressed="${!!wished(c.key)}">${icon('heart', 18)} ${wished(c.key) ? 'Dans mes envies' : 'Envie'}</button></div>
  ${wished(c.key) ? `<div class="pad small" style="margin-top:6px">Dans « ${esc((wish.folders.find(f => f.id === wished(c.key).folder) || {}).name || '')} »${wished(c.key).max != null ? ' · max ' + money(wished(c.key).max) : ''} · <a href="#" data-act="wishsheet" data-key="${esc(c.key)}">Ranger / prix max</a></div>` : ''}
  <div class="pad" style="margin-top:12px"><a class="btn full" href="#/centrage?carte=${encodeURIComponent(c.key)}">${icon('ruler', 18)} ${F('Mesurer le centrage')}</a></div>
  ${authGuide(c)}
  ${c.x ? `<div class="pad" style="margin-top:12px"><div class="note">Pas encore d’image ni de détails pour cette carte.</div></div>` : neighbours(c)}
  ${priceBlock}
  ${cmOffers(c, langsSel)}
  ${ownedHtml}
  <div class="pad stack" style="margin-top:16px">
    <label class="panel setrow" style="border-bottom:0"><span style="font-size:14px;font-weight:600">N'importe quelle langue me va pour cette carte</span><input type="checkbox" data-act="anylang" data-key="${esc(c.key)}" ${anyLang.has(c.key) ? 'checked' : ''}></label>
    <a class="extlink" href="${ebayUrl}" target="_blank" rel="noopener"><b>Chercher sur eBay.${esc(ebayDom)}</b><span class="small">lien externe, sans commission</span></a>
  </div>
  ${c.x ? '' : `<div class="sect"><h2 class="h2">Noms selon la langue</h2></div><div class="pad"><div class="panel" style="padding-top:4px;padding-bottom:4px">${names || '<div class="sub">—</div>'}</div></div>`}
  </div></div>
  ${samePoke.length ? `<div class="sect between"><h2 class="h2">${F('Autres versions de {0}', esc(speciesFr(c) || cardName(c)))}</h2><a class="sub" href="#/recherche?dex=${c.dex}">tout voir</a></div><div class="pad chips scroll" style="padding-bottom:10px">${[['prix-', 'Prix ↓'], ['prix+', 'Prix ↑'], ['recent', 'Plus récentes'], ['ancien', 'Plus anciennes']].map(([k, l]) => `<button class="chip${verSort === k ? ' on' : ''}" data-act="vsort" data-v="${k}">${l}</button>`).join('')}</div><div class="hrow versions">${samePoke.map(x => tile(x, { meta: (verSort.startsWith('prix') ? (price(x) ? eurC(price(x)) : 'sans cote') : year(x.set)) + ' · ' + setName(x.set) })).join('')}</div>` : ''}
  ${sameIll.length ? `<div class="sect between"><h2 class="h2">Du même illustrateur</h2><a class="sub" href="${artistHref(ill(c))}">tout voir</a></div><div class="hrow">${sameIll.map(x => tile(x)).join('')}</div>` : ''}
  <div style="height:20px"></div>${tabs('')}`;
}

let verSort = 'prix-';

/* Offres Cardmarket filtrées par langue et par état. CallIt! ne lit pas les offres : le lien ouvre la page
   produit de Cardmarket avec ses propres filtres (language = numéro de langue Cardmarket,
   minCondition = 1 Mint … 7 Poor) ; les offres y sont classées de la moins chère à la plus chère. */
let cmCond = null; // état choisi sur la fiche (sinon l'état minimum des réglages)
const cmProductUrl = (c, langs, cond) => {
  const ids = langs.map(l => CM_LANG[l]).filter(Boolean);
  return `https://www.cardmarket.com/fr/${GI.cm}/Products?idProduct=${c.cm}${ids.length ? '&language=' + ids.join(',') : ''}&minCondition=${COND_RANK[cond] + 1}`;
};
function cmOffers(c, langsSel) {
  if (!c.cm) return `<div class="pad stack" style="margin-top:16px"><a class="extlink" href="https://www.cardmarket.com/fr/${GI.cm}/Products/Search?searchString=${encodeURIComponent(c.n.en || cardName(c))}" target="_blank" rel="noopener"><b>Chercher sur Cardmarket</b><span class="small">lien externe, sans commission</span></a></div>`;
  const cond = COND_RANK[cmCond] != null ? cmCond : S.minCond;
  const langs = langsSel.filter(l => CM_LANG[l]);
  const condLabel = cond === 'MT' ? 'Mint' : F('{0} ou mieux', cond);
  const row = (label, ls) => `<a class="extlink" href="${cmProductUrl(c, ls, cond)}" target="_blank" rel="noopener"><b>${label}</b><span class="small">${esc(condLabel)}</span></a>`;
  return `<div class="sect between"><h2 class="h2">Premier prix par langue</h2><span class="sub">Cardmarket</span></div>
  <div class="pad"><div class="small" style="line-height:1.45;margin-bottom:10px">La cote ci-dessus mélange toutes les langues et tous les états. Ces liens ouvrent les offres Cardmarket de cette carte, déjà filtrées : la première offre affichée est le premier prix.</div></div>
  <div class="pad"><div class="small" style="font-weight:600;margin-bottom:6px">État minimum</div></div>
  <div class="pad chips scroll">${CONDS.slice(0, 6).map(([k]) => `<button class="chip${k === cond ? ' on' : ''}" data-act="cmcond" data-v="${k}" aria-pressed="${k === cond}">${k}</button>`).join('')}</div>
  <div class="pad stack" style="margin-top:10px">
    ${langs.map(l => row(esc(LANG[l].name), [l])).join('')}
    ${langs.length > 1 ? row(esc(F('Toutes mes langues ({0})', langs.map(l => LANG[l].short).join(', '))), langs) : ''}
    ${langs.length ? '' : row('Toutes les langues', [])}
    <div class="small">Liens externes, sans commission. CallIt! ne lit pas les offres à ta place.</div>
  </div>`;
}
/* Collection (Galerie) et Portefeuille (Marché) : toutes mes cartes s'y voient, quel que soit leur état
   (le réglage « État minimum » ne sert qu'aux achats) */
let groupBy = GAME === 'pkm' || GAME === 'mtg' ? 'ill' : 'set';
// Compléments de collection.js (ajouter un set, ajout rapide après un scan, courbe de valeur). Sans ce fichier, rien ne s'affiche à leur place.
const colExtra = (k, ...a) => { try { return window.CallItCollection && window.CallItCollection[k] ? window.CallItCollection[k](...a) : ''; } catch (e) { return ''; } };
// Nombre de cartes d'un set : celles de la base, qui compte aussi les cartes secrètes, numérotées au-delà du total officiel
let setSizes = null;
function setSize(si) {
  if (!setSizes || setSizes.n !== CARDS.length) { setSizes = { n: CARDS.length, m: new Map() }; for (const c of CARDS) setSizes.m.set(c.s, (setSizes.m.get(c.s) || 0) + 1); }
  return Math.max(setSizes.m.get(si) || 0, DB.sets[si].count || 0);
}
function viewCollection() {
  const items = collection.map(it => ({ it, c: BYKEY.get(it.key) })).filter(x => x.c);
  const head = `<div class="top"><h1 class="title">${G() ? 'Ma collection' : 'Portefeuille'}</h1>${faceSwitch()}</div>${colTabs('col')}${colExtra('tools')}`;
  if (!collection.length && sealedCol.length) return head + mySealedBlock() + `<div class="pad">${importBox()}</div>${tabs('collection')}`;
  if (!collection.length) {
    return head + `<div class="pad" style="margin-top:16px"><div class="panel stack"><b>Ta collection est vide</b><div class="sub">Cherche une carte, ouvre sa fiche, puis « Ajouter à ma collection ».</div><a class="btn primary" href="#/recherche">Chercher une carte</a></div>${importBox()}</div>${tabs('collection')}`;
  }
  const qty = items.reduce((s, x) => s + (x.it.qty || 1), 0);
  const nIll = new Set(items.map(x => x.c.i)).size, nLang = new Set(items.map(x => x.it.lang)).size;
  const state = it => [it.grader ? (it.grader + ' ' + (it.grade || '')).trim() : it.cond, it.rev ? 'reverse' : ''].filter(Boolean).join(' · ');
  if (!G()) {
    const p = portfolio();
    const rows = items.map(({ it, c }) => { const e = ownValue(it, c), n = it.qty || 1, pd = ownPaid(it); return { it, c, e, n, tot: e ? e.u * n : 0, g: e && pd != null ? (e.u - toUser(pd)) * n : null }; }).sort((a, b) => b.tot - a.tot);
    const under = r => (r.e && r.e.how === 'paye' ? 'au prix payé' : r.g != null ? (r.g >= 0 ? '+' : '') + ownMoney(r.g) : !r.e ? (r.it.grader ? 'à estimer' : 'pas de cote') : 'payé ?');
    return head + `<div class="pad" style="padding-top:12px"><div class="sub">${p.n} carte${p.n > 1 ? 's' : ''} · valeur estimée</div><div class="num" style="font-weight:700;font-size:36px;letter-spacing:-.03em">${money(p.value)}</div>
    <div class="row" style="gap:18px;margin-top:4px"><div><div class="small">Payé</div><b class="num">${money(p.paid)}</b></div>${p.base ? `<div><div class="small">Plus-value</div><b class="num ${p.gain >= 0 ? 'gain' : 'loss'}">${gainTxt(p)}</b></div>` : ''}</div>
    ${p.noPaid ? `<div class="small" style="margin-top:6px">${p.noPaid > 1 ? p.noPaid + ' cartes sans prix payé : elles ne comptent pas dans la plus-value.' : '1 carte sans prix payé : elle ne compte pas dans la plus-value.'}</div>` : ''}
    ${p.graded ? `<div class="small" style="margin-top:6px">${p.graded > 1 ? p.graded + ' cartes gradées comptées au prix payé. Indique ton estimation sur leur fiche.' : '1 carte gradée comptée au prix payé. Indique ton estimation sur sa fiche.'}</div>` : ''}</div>
    ${colExtra('curve')}
    <div class="list" style="margin-top:14px">${rows.map(r => { const { it, c, e, n } = r; return `<a class="line" href="#/carte/${encodeURIComponent(c.key)}?lang=${encodeURIComponent(it.lang)}"><span class="thumb">${cimg(c, { lang: it.lang, it })}</span><span class="mid"><b>${esc(cardName(c))}</b><span>${esc([LANG[it.lang] ? LANG[it.lang].short : it.lang, state(it), setName(c.set), n > 1 ? n + ' ×' : ''].filter(Boolean).join(' · '))}</span></span><span class="px"><b class="num">${e ? ownMoney(e.u * n) : '—'}</b><span class="${r.g == null || e.how === 'paye' ? '' : r.g >= 0 ? 'gain' : 'loss'}" style="font-weight:600">${under(r)}</span></span></a>`; }).join('')}</div>
    ${mySealedBlock()}
    <div class="pad" style="margin-top:14px"><div class="note">${PKM
      ? F('Valeur estimée en {0} : cote {1} du jour, ajustée selon l’état et la langue de chaque carte. Ce sont des règles générales du marché, pas des ventes mesurées.', esc(userCur()), esc(SRC()))
      : F('Valeur estimée en {0} : cote {1}, ajustée selon l’état de chaque carte. C’est une règle générale du marché, pas des ventes mesurées.', esc(userCur()), esc(SRC()))}</div></div>${tabs('collection')}`;
  }
  // Galerie : regroupements
  const groups = new Map();
  const gk = ({ it, c }) => groupBy === 'ill' ? (ill(c) || 'Illustrateur inconnu') : groupBy === 'poke' ? (speciesFr(c) || cardName(c)) : groupBy === 'set' ? setName(c.set) : (LANG[it.lang] ? LANG[it.lang].name : it.lang);
  for (const x of items) { const k = gk(x); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(x); }
  const sorted = [...groups].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  // Avancement par set (les deux plus remplis). « 3 sur 237 » et « Les 234 manquantes » comptent les mêmes cartes : celles de la base.
  const bySet = new Map(); for (const { c } of items) { if (c.x) continue; if (!bySet.has(c.s)) bySet.set(c.s, new Set()); bySet.get(c.s).add(c.num); }
  const prog = [...bySet].map(([si, nums]) => ({ s: DB.sets[si], si, have: nums.size, total: setSize(si) })).sort((a, b) => b.have / b.total - a.have / a.total).slice(0, 2).map(x => {
    const missing = CARDS.filter(c => c.s === x.si && !bySet.get(x.si).has(c.num));
    const cost = missing.reduce((s, c) => s + (price(c) || 0), 0), unpriced = missing.filter(c => price(c) == null).length;
    const rest = x.have >= x.total ? 'Set complet !' : !missing.length ? '' : (missing.length > 1 ? F('Les {0} manquantes coûtent environ {1} à la cote {2}.', missing.length, eur(cost), esc(SRC())) : F('La carte manquante coûte environ {0} à la cote {1}.', eur(cost), esc(SRC()))) + (unpriced ? ' ' + (unpriced > 1 ? F('{0} n’ont pas de cote.', unpriced) : F('Une n’a pas de cote.')) : '');
    return `<a class="panel stack" style="gap:8px;text-decoration:none;margin-top:12px" href="#/recherche?set=${x.si}"><div class="between"><b style="font-size:14px">${esc(setName(x.s))}</b><span class="sub">${x.have} sur ${x.total}</span></div><span class="bar"><span style="width:${Math.min(100, Math.round(x.have / x.total * 100))}%"></span></span>${rest ? `<span class="sub">${rest}</span>` : ''}</a>`;
  }).join('');
  const tabsG = [...(DB.ills.length ? [['ill', 'Illustrateurs']] : []), ...(PKM ? [['poke', 'Pokémon']] : []), ['set', 'Sets'], ['lang', 'Langues']];
  return head + `<div class="pad sub" style="margin-top:2px">${qty} carte${qty > 1 ? 's' : ''} · ${nIll} illustrateur${nIll > 1 ? 's' : ''} · ${nLang} langue${nLang > 1 ? 's' : ''}</div>
  <div class="pad chips scroll" style="margin-top:14px" role="tablist" aria-label="Ranger par">${tabsG.map(([k, l]) => `<button class="chip ${groupBy === k ? 'on' : ''}" role="tab" aria-selected="${groupBy === k}" data-act="group" data-v="${k}">${l}</button>`).join('')}</div>
  ${sorted.map(([k, xs]) => `<div class="sect between"><h2 class="h2">${esc(k)}</h2><span class="sub">${xs.length} carte${xs.length > 1 ? 's' : ''}</span></div><div class="grid">${xs.map(({ it, c }) => tile(c, { it, lang: it.lang, badge: LANG[it.lang] ? LANG[it.lang].short : it.lang, meta: [setName(c.set), state(it)].filter(Boolean).join(' · ') })).join('')}</div>`).join('')}
  ${mySealedBlock()}
  <div class="pad">${prog}${importBox()}</div>${tabs('collection')}`;
}
function importBox() {
  return `<div style="margin-top:12px;border:1.5px dashed var(--field-line);border-radius:16px;padding:12px 14px" class="stack"><b style="font-size:14px">Sauvegarder ou importer</b><div class="sub">Garde une copie de ta collection dans un fichier, ou importe une sauvegarde CallIt!.</div><div class="row" style="flex-wrap:wrap"><button class="btn small" data-act="export">Exporter ma collection</button><label class="btn small">Importer une sauvegarde<input type="file" accept="application/json,.json" data-act="import" class="sr"></label></div></div>`;
}

/* Réglages */
function viewSettings() {
  const cur = userCur();
  const curs = [...new Set(COUNTRIES.map(c => c[2]))];
  return `<div class="top top-start"><h1 class="title">Profil et réglages</h1></div>
  ${profileCard()}
  <div class="sect"><div class="small" style="font-weight:600">Compte</div></div>
  ${accountPanel()}
  <div class="sect"><div class="small" style="font-weight:600">Jeu de cartes</div></div>
  <div class="pad"><div class="panel" style="padding-top:2px;padding-bottom:2px"><div class="setrow"><span><b style="font-size:14px">Jeu affiché</b><div class="small">Ta collection garde les cartes de tous les jeux.</div></span>${gameSwitch()}</div></div></div>
  <div class="sect"><div class="small" style="font-weight:600">Affichage</div></div>
  <div class="pad"><div class="panel" style="padding-top:2px;padding-bottom:2px"><div class="setrow"><span style="font-weight:600;font-size:14px">Mode d'affichage</span><div class="face" role="group" aria-label="Mode d'affichage">${[['auto', 'Auto'], ['clair', 'Clair'], ['sombre', 'Sombre']].map(([k, l]) => `<button data-act="theme" data-v="${k}" aria-pressed="${S.theme === k}">${l}</button>`).join('')}</div></div><div class="setrow small">« Auto » suit le réglage de ton téléphone ou de ton ordinateur.</div><div class="setrow"><span style="font-weight:600;font-size:14px">Langue de l'appli</span>${uiLangSel()}</div></div></div>
  <div class="sect"><div class="small" style="font-weight:600">Pays et devise</div></div>
  <div class="pad"><div class="panel" style="padding-top:2px;padding-bottom:2px">
   <label class="setrow"><span style="font-weight:600;font-size:14px">Pays</span><select data-act="set" data-k="country">${COUNTRIES.slice().sort((a, b) => tr(a[1]).localeCompare(tr(b[1]), UI)).map(([c, n]) => `<option value="${c}" ${S.country === c ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
   <label class="setrow"><span style="font-weight:600;font-size:14px">Devise des prix</span><select data-act="set" data-k="currency"><option value="auto" ${S.currency === 'auto' ? 'selected' : ''}>${F('Selon le pays ({0})', (COUNTRY[S.country] || COUNTRY.FR).cur)}</option>${curs.map(c => `<option value="${c}" ${S.currency === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
   <div class="setrow small">${cur === 'EUR' ? 'Les cotes Cardmarket sont en euros.' : `1 € = ${rate(cur) ? rate(cur).toLocaleString(LOCALE, { maximumFractionDigits: 4 }) + ' ' + cur : '?'} · ${RATES.approx ? 'taux approximatif' : 'taux BCE du ' + fdate(RATES.date)}`}</div>
  </div></div>
  <div class="sect"><div class="small" style="font-weight:600">Cartes</div></div>
  <div class="pad"><div class="panel" style="padding-top:2px;padding-bottom:2px">
   <a class="setrow" href="#/langues" style="text-decoration:none"><span><b style="font-size:14px">Langues des cartes</b><div class="small">${S.excluded.length ? esc(joinFr(langList(LANGS.map(l => l[0]).filter(c => !S.excluded.includes(c))))) : 'Toutes affichées'}</div></span>${icon('globe')}</a>
   <label class="setrow"><span style="font-weight:600;font-size:14px">Noms des cartes en</span><select data-act="set" data-k="nameLang">${LANGS.map(([c, n]) => `<option value="${c}" ${S.nameLang === c ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
   <label class="setrow"><span style="font-weight:600;font-size:14px">État minimum</span><select data-act="set" data-k="minCond">${CONDS.map(([c, n]) => `<option value="${c}" ${S.minCond === c ? 'selected' : ''}>${n}${c === 'PO' ? '' : ' et mieux'}</option>`).join('')}</select></label>
  </div></div>
  <div class="sect"><div class="small" style="font-weight:600">Aide</div></div>
  <div class="pad"><div class="panel" style="padding-top:2px;padding-bottom:2px"><button class="setrow linkrow" data-act="feedback"><span><b style="font-size:14px">Signaler un bug ou proposer une idée</b><div class="small">Un texte et, si tu veux, une capture d’écran.</div></span>${icon('back', 18).replace('<svg', '<svg style="transform:rotate(180deg)"')}</button></div></div>
  <div class="sect"><div class="small" style="font-weight:600">Mes données</div></div>
  <div class="pad stack"><div class="note">Exporte ta collection pour en garder une copie ou la passer sur un autre appareil.</div>
   <div class="row" style="flex-wrap:wrap"><button class="btn small" data-act="export">Exporter ma collection</button><label class="btn small">Importer une sauvegarde<input type="file" accept="application/json,.json" data-act="import" class="sr"></label><button class="btn small" data-act="wipe">Tout effacer</button></div>
   <div class="small" style="margin-top:10px">${PKM ? `Données des cartes : TCGdex (fiches et images) et guide de prix public Cardmarket du ${fdate(priceDate())}. ${CARDS.length.toLocaleString(LOCALE)} cartes. CallIt! n'est pas affilié à Nintendo, The Pokémon Company ni Cardmarket.` : `${esc(DB.credits || '')} ${DB.priceSource === 'Cardmarket' ? 'Prix : guide de prix public Cardmarket du ' + fdate(priceDate()) + '.' : ''} ${CARDS.length.toLocaleString(LOCALE)} cartes. CallIt! n'est affilié à aucun éditeur de jeu ni à Cardmarket.`}</div>
  </div>${tabs('reglages')}`;
}
function viewLangs() {
  const ex = excluded();
  const counts = {}; for (const c of CARDS) for (const l of c.langs) counts[l] = (counts[l] || 0) + 1;
  const langRow = ([c, n]) => { const off = ex.has(c); const note = c === S.nameLang ? 'Langue des noms' : c === 'it' && S.country === 'IT' ? 'Ton pays' : ASIA.has(c) ? ASIA_NOTE : ''; return `<div class="setrow"><div><div style="font-weight:600;font-size:15px">${n}</div><div class="small">${note ? note + ' · ' : ''}${(counts[c] || 0).toLocaleString(LOCALE)} cartes</div></div><button class="pmbtn${off ? ' add' : ''}" data-act="lang" data-v="${c}" aria-label="${esc(F(off ? 'Ajouter {0}' : 'Retirer {0}', tr(n)))}">${off ? '+' : '−'}</button></div>`; };
  return `<div class="top">${backBtn()}<span class="sub" style="font-weight:600">Réglages</span><span style="width:44px"></span></div>
  <div class="pad"><h1 class="h1">Langues des cartes</h1><p class="sub" style="font-size:14px;margin:8px 0 0">Les autres langues sont masquées des résultats. Elles restent consultables à tout moment avec « voir ».</p></div>
  <div class="sect small" style="font-weight:600;padding-top:16px">${F('Mes langues ({0})', LANGS.length - ex.size)}</div>
  <div class="pad"><div class="panel" style="padding-top:0;padding-bottom:0">${LANGS.filter(([c]) => !ex.has(c)).map(langRow).join('')}</div></div>
  ${ex.size ? `<div class="sect small" style="font-weight:600">Ajouter une langue</div>
  <div class="pad"><div class="panel" style="padding-top:0;padding-bottom:0">${LANGS.filter(([c]) => ex.has(c)).map(langRow).join('')}
  <div class="setrow"><div><div style="font-weight:600;font-size:15px;color:var(--muted2)">Néerlandais, polonais</div><div class="small">Pas encore de cartes dans ces langues</div></div></div></div></div>` : ''}
  <div class="sect small" style="font-weight:600">Où appliquer l'exclusion</div>
  <div class="pad"><div class="panel" style="padding-top:0;padding-bottom:0">
   <label class="setrow"><span style="font-size:14px;font-weight:600">Recherche et Galerie</span><input type="checkbox" data-act="exclsearch" ${S.exclSearch ? 'checked' : ''}></label></div>
  <div class="note" style="margin-top:14px">Pour une exception, ouvre la fiche de la carte : « N'importe quelle langue me va pour cette carte ».</div></div>${tabs('reglages')}`;
}

/* ---------- Formulaire d'ajout / modification ---------- */
function openItemSheet(key, id) {
  const c = BYKEY.get(key); const it = id ? collection.find(x => x.id === id) : null; if (!c) return;
  const langs = c.langs.length ? c.langs : [c.set.reg === 'en' ? 'en' : 'ja'];
  const others = LANGS.map(l => l[0]).filter(l => !langs.includes(l) && (c.set.reg === 'en' ? !ASIA.has(l) : ASIA.has(l)));
  const defLang = it ? it.lang : prefLang(c);
  const hasRev = PKM && !!quoteHolo(c); // la carte existe aussi en reverse ou en holo, avec sa propre cote
  // Un montant déjà saisi (dans la devise du moment) est montré dans la devise affichée aujourd'hui
  const shown = v => (v == null ? '' : String(it.cur && it.cur !== userCur() ? Math.round(toUser(curToEur(v, it.cur)) * 100) / 100 : v).replace('.', ','));
  const d = document.createElement('dialog'); d.className = 'sheet';
  d.innerHTML = `<form class="sheet-in" method="dialog"><div class="between"><b style="font-size:17px">${esc(cardName(c))}</b><span class="sub">${esc(setName(c.set))} · ${esc(numLabel(c))}</span></div>
  ${colExtra('photoField', it, c)}
  <label class="field">Langue de mon exemplaire<select name="lang">${langs.map(l => `<option value="${l}" ${l === defLang ? 'selected' : ''}>${LANG[l].name}</option>`).join('')}${others.length ? `<optgroup label="Autres langues">${others.map(l => `<option value="${l}" ${l === defLang ? 'selected' : ''}>${LANG[l].name}</option>`).join('')}</optgroup>` : ''}</select></label>
  <div class="row"><label class="field" style="flex:1">Brute ou gradée<select name="grader"><option value="">Brute</option>${GRADERS.map(g => `<option ${it && it.grader === g ? 'selected' : ''}>${g}</option>`).join('')}</select></label><label class="field" style="flex:1" data-show="graded">Note<input name="grade" inputmode="decimal" placeholder="ex. 9" value="${esc(it ? it.grade || '' : '')}"></label></div>
  <div class="row" data-show="raw"><label class="field" style="flex:1">État<select name="cond">${CONDS.map(([k, n]) => `<option value="${k}" ${(it ? it.cond : 'NM') === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>${hasRev ? `<label class="field" style="flex:1">Version<select name="rev"><option value="">Normale</option><option value="1" ${it && it.rev ? 'selected' : ''}>Reverse ou holo</option></select></label>` : ''}</div>
  <label class="field" data-show="graded">${esc(F('Mon estimation ({0}, facultatif)', userCur()))}<input name="val" inputmode="decimal" placeholder="ex. 250" value="${it ? shown(it.val) : ''}"></label>
  <div class="row"><label class="field" style="flex:1">Prix payé (${esc(userCur())})<input name="paid" inputmode="decimal" placeholder="ex. 3,40" value="${it ? shown(it.paid) : ''}"></label><label class="field" style="width:96px">Quantité<input name="qty" type="number" min="1" max="999" value="${it ? it.qty || 1 : 1}"></label></div>
  <label class="field">Date d'achat<input name="date" type="date" value="${esc(it ? it.date || '' : new Date().toISOString().slice(0, 10))}"></label>
  <label class="field">Note (facultatif)<input name="note" maxlength="140" value="${esc(it ? it.note || '' : '')}" placeholder="ex. achetée à Rome, Sccards"></label>
  ${colExtra('sellFields', it)}
  <div class="note" data-est></div>
  <div class="btns">${it ? '<button class="btn" value="delete">Retirer</button>' : '<button class="btn" value="cancel">Annuler</button>'}<button class="btn primary" value="ok">${it ? 'Enregistrer' : 'Ajouter'}</button></div></form>`;
  document.body.appendChild(d);
  const f = d.querySelector('form'), est = f.querySelector('[data-est]');
  const num = el => { const x = parseFloat(String(el.value).replace(/\s/g, '').replace(',', '.')); return isNaN(x) ? null : x; };
  // L'exemplaire tel que le formulaire le décrit en ce moment
  const draft = () => Object.assign({ lang: f.lang.value, cond: f.cond.value, rev: hasRev ? f.rev.value === '1' : !!(it && it.rev), grader: f.grader.value || '', grade: f.grader.value ? f.grade.value.trim() : '', val: f.grader.value ? num(f.val) : null, paid: num(f.paid), cur: userCur() }, f.sell ? { sell: f.sell.checked, goal: f.sell.checked ? num(f.goal) : null } : {});
  const pctK = k => '\u00a0' + (k > 1 ? '+' : '−') + Math.round(Math.abs(k - 1) * 100) + '\u00a0%'; // espaces insécables : « Excellent −15 % » ne se coupe pas
  // Ce que vaut CET exemplaire, avec le détail du calcul : la cote, puis l'écart dû à l'état et à la langue
  function sync() {
    const x = draft(), g = !!x.grader, e = ownValue(x, c);
    f.querySelectorAll('[data-show="graded"]').forEach(el => { el.style.display = g ? '' : 'none'; });
    f.querySelectorAll('[data-show="raw"]').forEach(el => { el.style.display = g ? 'none' : ''; });
    let html;
    if (g) {
      const q = ((PKM ? cardName(c, 'en') || cardName(c) : c.n.en || cardName(c)) + ' ' + (PKM ? numLabel(c) : c.num) + ' ' + (x.grader === 'Autre' ? '' : x.grader) + ' ' + x.grade).replace(/\s+/g, ' ').trim();
      html = (x.val > 0 ? '' : esc(F('Sans estimation de ta part, une carte gradée compte au prix payé.')) + ' ') + `<a href="https://www.ebay.${(COUNTRY[S.country] || COUNTRY.FR).ebay}/sch/i.html?_nkw=${encodeURIComponent(q)}&LH_Sold=1&LH_Complete=1" target="_blank" rel="noopener">${esc(F('Voir les ventes terminées sur eBay'))}</a> <span class="small">${esc(F('(lien externe, sans commission)'))}</span>`;
    } else if (!e) html = esc(F('Pas de cote pour cette carte : elle ne compte pas dans la valeur de ta collection.'));
    else if (e.how === 'cote') html = F('Valeur de mon exemplaire : {0}, la cote {1}.', `<b class="num">${ownMoney(e.u)}</b>`, esc(SRC()));
    else html = F('Estimation de mon exemplaire : {0}', `<b class="num">${ownMoney(e.u)}</b>`) + `<div class="small" style="margin-top:4px">${[F('Cote {0}', eurC(e.base)) + (e.holo ? ' (' + esc(F('reverse ou holo')) + ')' : ''), e.ck !== 1 ? esc((CONDS.find(k => k[0] === x.cond) || ['', x.cond])[1]) + pctK(e.ck) : '', e.lk !== 1 ? esc(tr(LANG[x.lang] ? LANG[x.lang].name : x.lang)) + pctK(e.lk) : ''].filter(Boolean).join(' · ')}</div>`;
    est.innerHTML = html;
    colExtra('sellSync', f, x, c); // « À revendre » : ce qu'il resterait au prix visé
  }
  f.addEventListener('change', sync); [f.val, f.paid, f.goal].forEach(el => el && el.addEventListener('input', sync)); sync();
  d.addEventListener('close', () => {
    const v = d.returnValue;
    if (v === 'ok') {
      const rec = Object.assign({ id: it ? it.id : Date.now().toString(36) + Math.random().toString(36).slice(2, 6), key }, draft(), { qty: Math.max(1, parseInt(f.qty.value, 10) || 1), date: f.date.value, note: f.note.value.trim() });
      if (it) Object.assign(it, rec); else collection.push(rec);
      saveCol(); recordHistory(); toast(it ? 'Modifié' : 'Ajoutée à ta collection'); render();
    } else if (v === 'delete' && it) {
      collection = collection.filter(x => x !== it); markDeleted(it.id, 'card'); saveCol(); toast('Retirée de ta collection'); render();
    }
    d.remove();
  });
  d.showModal();
}
function openCondSheet() {
  const d = document.createElement('dialog'); d.className = 'sheet';
  d.innerHTML = `<form class="sheet-in" method="dialog"><b style="font-size:17px">État minimum</b>${CONDS.map(([k, n]) => `<button class="btn ${S.minCond === k ? 'primary' : ''}" value="${k}">${n}${k === 'PO' ? '' : ' et mieux'}</button>`).join('')}
  <div class="note">L'état choisi sert aux liens Cardmarket. Ta collection, elle, montre toutes tes cartes.</div></form>`;
  document.body.appendChild(d);
  d.addEventListener('close', () => { if (COND_RANK[d.returnValue] != null) { S.minCond = d.returnValue; saveS(); render(); } d.remove(); });
  d.showModal();
}

/* Signaler un bug ou proposer une amélioration : un texte et une capture, envoyés à l'équipe (table « retours » en écriture seule) */
function shrinkShot(file) {
  return new Promise((ok, ko) => {
    const im = new Image(), u = URL.createObjectURL(file);
    im.onload = () => {
      URL.revokeObjectURL(u);
      let out = '';
      for (const [max, q] of [[1400, .75], [1000, .65], [700, .6]]) {
        const k = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight));
        const cv = document.createElement('canvas'); cv.width = Math.round(im.naturalWidth * k); cv.height = Math.round(im.naturalHeight * k);
        cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
        out = cv.toDataURL('image/jpeg', q); if (out.length < 450000) break;
      }
      ok(out.length < 580000 ? out : '');
    };
    im.onerror = () => { URL.revokeObjectURL(u); ko(new Error('image')); };
    im.src = u;
  });
}
function openFeedback() {
  const d = document.createElement('dialog'); d.className = 'sheet';
  let kind = 'bug', shot = '';
  const draw = () => {
    d.innerHTML = `<form class="sheet-in" method="dialog"><b style="font-size:17px">${tr('Signaler un bug ou proposer une idée')}</b>
    <div class="face" role="group" style="align-self:flex-start">${[['bug', 'Un bug'], ['idee', 'Une idée']].map(([k, l]) => `<button type="button" data-fk="${k}" aria-pressed="${kind === k}">${tr(l)}</button>`).join('')}</div>
    <label class="stack" style="gap:6px"><b style="font-size:14px">${tr(kind === 'bug' ? 'Que s’est-il passé ?' : 'Ton idée')}</b><textarea name="t" class="fld" rows="5" maxlength="3000" required placeholder="${esc(tr(kind === 'bug' ? 'Ce que tu faisais, ce qui ne marche pas…' : 'Ce que tu aimerais trouver dans CallIt!…'))}"></textarea></label>
    <div class="row" style="flex-wrap:wrap">${shot ? `<img src="${shot}" alt="" class="fb-shot"><button type="button" class="btn small" data-fk="noshot">${tr('Retirer la capture')}</button>` : `<label class="btn small">${icon('camera', 16)} ${tr('Ajouter une capture d’écran')}<input type="file" accept="image/*" class="sr" data-fk="shot"></label>`}</div>
    <div class="small">${tr('Ne mets pas d’informations personnelles. Ta collection n’est pas envoyée.')}</div>
    <div class="btns"><button class="btn" value="cancel" formnovalidate>${tr('Annuler')}</button><button class="btn primary" value="ok">${tr('Envoyer')}</button></div></form>`;
  };
  draw(); document.body.appendChild(d);
  let text = '';
  d.addEventListener('input', e => { if (e.target.name === 't') text = e.target.value; });
  d.addEventListener('click', e => {
    const b = e.target.closest('button[data-fk]'); if (!b) return;
    if (b.dataset.fk === 'noshot') shot = ''; else kind = b.dataset.fk;
    draw(); d.querySelector('textarea').value = text;
  });
  d.addEventListener('change', async e => {
    if (e.target.dataset.fk !== 'shot' || !e.target.files[0]) return;
    try { shot = await shrinkShot(e.target.files[0]); } catch (er) { shot = ''; }
    if (!shot) toast(tr('Image illisible ou trop lourde'));
    draw(); d.querySelector('textarea').value = text;
  });
  d.addEventListener('close', async () => {
    const t = text.trim(); d.remove();
    if (d.returnValue !== 'ok' || !t) return;
    try {
      const c = await supa(); if (!c) throw new Error('hors ligne');
      const { error } = await c.from('retours').insert({ kind, texte: t.slice(0, 3000), capture: shot || null, page: location.hash.slice(0, 200), langue: UI, appareil: navigator.userAgent.slice(0, 300) });
      if (error) throw error;
      toast(tr('Merci, c’est bien reçu !'));
    } catch (er) { toast(tr('Envoi impossible. Réessaie plus tard ou écris à request@callitcards.com')); }
  });
  d.showModal(); d.querySelector('textarea').focus();
}
function prompt0(label, value, onOk) {
  const d = document.createElement('dialog'); d.className = 'sheet';
  d.innerHTML = `<form class="sheet-in" method="dialog"><label class="field">${esc(label)}<input name="v" maxlength="40" value="${esc(value)}" required></label><div class="btns"><button class="btn" value="cancel" formnovalidate>Annuler</button><button class="btn primary" value="ok">OK</button></div></form>`;
  document.body.appendChild(d); const f = d.querySelector('form');
  d.addEventListener('close', () => { const v = f.v.value.trim(); if (d.returnValue === 'ok' && v) onOk(v); d.remove(); });
  d.showModal(); f.v.focus();
}
function ask(question, okLabel, onOk) {
  const d = document.createElement('dialog'); d.className = 'sheet';
  d.innerHTML = `<form class="sheet-in" method="dialog"><b style="font-size:17px">${esc(question)}</b><div class="btns"><button class="btn" value="cancel">Annuler</button><button class="btn primary ink" value="ok">${esc(okLabel)}</button></div></form>`;
  document.body.appendChild(d);
  d.addEventListener('close', () => { const ok = d.returnValue === 'ok'; d.remove(); if (ok) onOk(); });
  d.showModal();
}
let toastT;
function toast(msg) { let t = document.querySelector('.toast'); if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); } t.textContent = msg; clearTimeout(toastT); toastT = setTimeout(() => t.remove(), 2200); }

/* ---------- Actions ---------- */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el || el.tagName === 'SELECT' || el.tagName === 'INPUT' || el.tagName === 'FORM') return;
  const a = el.dataset.act;
  if (a === 'reload') { location.reload(); return; }
  if (a === 'gamechip') { if (el.dataset.v !== GAME) { S.game = el.dataset.v; saveS(); location.hash = '#/'; location.reload(); } return; }
  if (a === 'welcome') { welcomeFace = el.dataset.v; presetLangs(); saveS(); window.scrollTo(0, 0); render(); }
  else if (a === 'wback') { welcomeFace = null; render(); }
  else if (a === 'wdone') { S.face = welcomeFace || 'galerie'; S.langsSet = true; welcomeFace = null; saveS(); applyTheme(); location.hash = '#/'; render(); window.scrollTo(0, 0); }
  else if (a === 'facemenu') openFaceSheet();
  else if (a === 'face') { S.face = el.dataset.v; saveS(); applyTheme(); render(); }
  else if (a === 'theme') { S.theme = el.dataset.v; saveS(); applyTheme(); render(); }
  else if (a === 'back') { if (navDepth > 0) { goingBack = true; history.back(); } else location.hash = '#/'; }
  else if (a === 'more') { shown += 60; render(); }
  else if (a === 'showhidden') { showHidden = !showHidden; render(); }
  else if (a === 'cond') openCondSheet();
  else if (a === 'add') openItemSheet(el.dataset.key);
  else if (a === 'edit') { const it = collection.find(x => x.id === el.dataset.id); if (it) openItemSheet(it.key, it.id); }
  else if (a === 'group') { groupBy = el.dataset.v; render(); }
  else if (a === 'follow') toggleFollow(el.dataset.v);
  else if (a === 'feedback') openFeedback();
  else if (a === 'ctrshare') ctrShare();
  else if (a === 'artsort') { artSort = el.dataset.v; render(); }
  else if (a === 'artmissing') { artMissing = !artMissing; artShown = 48; render(); }
  else if (a === 'artmore') { artShown += 48; render(); }
  else if (a === 'asort') { artistSort = el.dataset.v; artistShown = 30; render(); }
  else if (a === 'scanclose') { scanState = null; const { q } = parseHash(); if (q.get('scan')) { q.delete('scan'); location.hash = '#/recherche' + (q.toString() ? '?' + q : ''); } else render(); }
  else if (a === 'heart') { e.preventDefault(); e.stopPropagation(); toggleWish(el.dataset.key); }
  else if (a === 'deckwish') { e.preventDefault(); deckWish(el.dataset.id); }
  else if (a === 'ctrside') { if (el.dataset.v !== CTR.side) { CTR.faces[CTR.side] = { img: CTR.img, L: CTR.L, sel: CTR.sel, ia: CTR.ia }; CTR.side = el.dataset.v; const f = CTR.faces[CTR.side] || {}; CTR.img = f.img || null; CTR.L = f.L || null; CTR.sel = f.sel || 0; CTR.ia = f.ia || null; CTR.zoom = 1; CTR.sx = CTR.sy = 0; if (typeof RD !== 'undefined') RD.open = false; } render(); window.scrollTo(0, 0); }
  else if (a === 'ctria') { if (window.CallItIA && CTR.img) { const img = CTR.img; CTR.ia = { img, wait: true }; render(); CallItIA.bords(img).then(r => { if (CTR.img === img) { CTR.ia = { img, ...r }; render(); } }); } }
  else if (a === 'ctrask') ctrAskSend(el.dataset.q);
  else if (a === 'agpick') { CTR.pick = true; render(); const i = document.getElementById('agq'); if (i) i.focus(); }
  else if (a === 'agcard') { CTR.key = el.dataset.key; CTR.ref = null; CTR.pick = false; render(); window.scrollTo(0, 0); }
  else if (a === 'ctrok') { if (CTR.img) CTR.okd.add(CTR.img); render(); window.scrollTo(0, 0); }
  else if (a === 'ctredit') { CTR.okd.delete(CTR.img); render(); }
  else if (a === 'ctrzoom') { ctrZoomTo((CTR.zoom || 1) * (+el.dataset.v > 0 ? 1.5 : 1 / 1.5)); }
  else if (a === 'install') { if (installEvt) { installEvt.prompt(); installEvt.userChoice.finally(() => { installEvt = null; render(); }); } else toast(F('Sur iPhone : touche « Partager » puis « Sur l’écran d’accueil »')); }
  else if (a === 'ctrsel') { CTR.sel = +el.dataset.v; ctrSoft(); }
  else if (a === 'ctrside2') { const cadre = CTR.sel % 4 === 1 || CTR.sel % 4 === 2; CTR.sel = CTR_SIDE[el.dataset.v][cadre ? 1 : 0]; ctrSoft(); }
  else if (a === 'ctrref') {
    const c = BYKEY.get(CTR.key); if (!c) return;
    if (el.dataset.v === '0') { if (CTR.ref) CTR.ref.on = false; ctrSoft(); }
    else if (CTR.ref && CTR.ref.key === CTR.key && CTR.ref.sh) { CTR.ref.on = true; ctrSoft(); }
    else { const key = CTR.key; CTR.ref = { key, wait: true }; ctrSoft(); ctrRefMeasure(c).then(sh => { if (CTR.key !== key) return; CTR.ref = sh ? { key, sh, on: true } : { key, err: true }; ctrSoft(); }); }
  }
  else if (a === 'ctrtype') { CTR.type = el.dataset.v; const y = window.scrollY; CTR.okd.delete(CTR.img);
    // photo déjà mesurée : on replace seulement les traits verts selon le nouveau type
    if (CTR.img && CTR.L) { const img = new Image(); img.onload = () => { try { const o = CTR.L, L = ctrDetect(img, { x: o[0], y: o[4] }); CTR.L = o.map((v, i) => [1, 2, 5, 6].includes(i) ? L[i] : v); } catch (e) {} render(); window.scrollTo(0, y); }; img.src = CTR.img; }
    else { render(); window.scrollTo(0, y); } }
  else if (a === 'ctrkind') { CTR.sel = CTR_SIDE[ctrSideOf(CTR.sel)][+el.dataset.v]; ctrSoft(); }
  else if (a === 'ctrnudge') { if (CTR.L) { CTR.L[CTR.sel] = Math.max(0, Math.min(100, CTR.L[CTR.sel] + (+el.dataset.v) * 0.05)); ctrSoft(); } }
  else if (a === 'deckcopy') { e.preventDefault(); copyMetaDeck(el.dataset.id); }
  else if (a === 'mydeckedit') { e.preventDefault(); deckEditId = el.dataset.id; render(); }
  else if (a === 'mydeckcopy') { e.preventDefault(); const d = myDecks.find(x => x.id === el.dataset.id); if (d) navigator.clipboard.writeText(deckText(d)).then(() => toast(F('Liste copiée')), () => toast(F('Copie impossible'))); }
  else if (a === 'mydeckdel') { e.preventDefault(); const d = myDecks.find(x => x.id === el.dataset.id); if (d) ask(F('Supprimer le deck « {0} » ?', d.name), F('Supprimer'), () => { myDecks = myDecks.filter(x => x !== d); markDeleted(d.id, 'deck'); saveDecks(); location.hash = '#/'; }); }
  else if (a === 'mydeckwish') { e.preventDefault(); myDeckWish(el.dataset.id); }
  else if (a === 'wishsheet') { e.preventDefault(); openWishSheet(el.dataset.key); }
  else if (a === 'wf') { wishFolder = el.dataset.v; render(); }
  else if (a === 'wfnew') { const n = prompt0('Nom du dossier', '', v => { const id = 'f' + Date.now().toString(36); wish.folders.push({ id, name: v }); wishFolder = id; saveWish(); render(); }); void n; }
  else if (a === 'wfren') { const f = wish.folders.find(x => x.id === el.dataset.v); if (f) prompt0('Nouveau nom', f.name, v => { f.name = v; saveWish(); render(); }); }
  else if (a === 'wfdel') { const f = wish.folders.find(x => x.id === el.dataset.v); if (f) ask(F('Supprimer le dossier « {0} » ? Ses envies vont dans « Mes envies ».', f.name), 'Supprimer', () => { wish.items.forEach(x => { if (x.folder === f.id) x.folder = 'f0'; }); wish.folders = wish.folders.filter(x => x !== f); markDeleted(f.id, 'folder'); wishFolder = ''; saveWish(); render(); }); }
  else if (a === 'bannerclose') { save('bannerClosedAt', collection.length + sealedCol.length); render(); }
  else if (a === 'syncnow') syncNow(true);
  else if (a === 'logout') { if (sb) sb.auth.signOut().then(() => { me = null; toast('Déconnecté. Ta collection reste sur cet appareil.'); render(); }); }
  else if (a === 'statsreload') { e.preventDefault(); STATS = null; statsErr = ''; loadStats(); }
  else if (a === 'delacct') { e.preventDefault(); ask('Supprimer ton compte et ta collection en ligne ? La collection reste sur cet appareil.', 'Supprimer', async () => { const { error } = await sb.rpc('supprimer_mon_compte'); if (error) { toast('Suppression impossible, réessaie'); return; } await sb.auth.signOut(); me = null; lastSync = null; save('lastSync', null); toast('Compte supprimé'); render(); }); }
  else if (a === 'slang') { sealedLang = el.dataset.v; render(); }
  else if (a === 'sadd') openSealedSheet(el.dataset.id, el.dataset.lang);
  else if (a === 'sdel') ask('Retirer ce produit de ta collection ?', 'Retirer', () => { sealedCol = sealedCol.filter(x => x.id !== el.dataset.id); markDeleted(el.dataset.id, 'sealed'); saveSealed(); render(); });
  else if (a === 'smore') { sealedShown += 40; render(); }
  else if (a === 'sopen') { const k = el.dataset.k; SEAL_OPEN.has(k) ? SEAL_OPEN.delete(k) : SEAL_OPEN.add(k); const y = el.getBoundingClientRect().top; render(); const n = document.querySelector(`[data-act="sopen"][data-k="${CSS.escape(k)}"]`); if (n) window.scrollBy(0, n.getBoundingClientRect().top - y); }
  else if (a === 'smore2') { SEAL_MORE.set(el.dataset.k, (SEAL_MORE.get(el.dataset.k) || 30) + 30); render(); }
  else if (a === 'setopen') { const k = el.dataset.k; SET_OPEN.has(k) ? SET_OPEN.delete(k) : SET_OPEN.add(k); const y = el.getBoundingClientRect().top; render(); const n = document.querySelector(`[data-act="setopen"][data-k="${CSS.escape(k)}"]`); if (n) window.scrollBy(0, n.getBoundingClientRect().top - y); }
  else if (a === 'setopenall') { const z = el.dataset.z; SET_OPEN = new Set([...SET_OPEN].filter(k => k[0] !== z)); SET_OPEN.add(z); if (el.dataset.v === '1') DB.sets.forEach(st => SET_OPEN.add(z + 'y:' + year(st))); render(); }
  else if (a === 'sopenall') { if (el.dataset.v === '1') { SEAL_OPEN = new Set(); for (const x of SEALED.items) { const st = sealSet(x); SEAL_OPEN.add('c:' + (st ? st.id : 't:' + x.catFr)); SEAL_OPEN.add('y:' + (st ? year(st) || '—' : F('Hors collection'))); } } else SEAL_OPEN = new Set(); render(); }
  else if (a === 'mall') { const y = window.scrollY; moversAll[el.dataset.v] = !moversAll[el.dataset.v]; render(); window.scrollTo(0, y); }
  else if (a === 'gosearch') { focusSearch = true; }
  else if (a === 'cmcond') { const y = window.scrollY; cmCond = el.dataset.v; render(); window.scrollTo(0, y); }
  else if (a === 'vsort') { const y = window.scrollY; verSort = el.dataset.v; render(); window.scrollTo(0, y); }
  else if (a === 'idx') { idxTab = el.dataset.v; render(); }
  else if (a === 'hp') { if (el.disabled) return; histPeriod = +el.dataset.v; drawHist(); }
  else if (a === 'amore') { artistShown += 30; render(); }
  else if (a === 'lang') { const v = el.dataset.v; if (!S.excluded.includes(v) && S.excluded.length >= LANGS.length - 1) { toast('Garde au moins une langue'); return; } S.excluded = S.excluded.includes(v) ? S.excluded.filter(x => x !== v) : [...S.excluded, v]; S.langsSet = true; saveS(); render(); }
  else if (a === 'unfilter') { const { q } = parseHash(); q.delete(el.dataset.k); location.hash = '#/recherche' + (q.toString() ? '?' + q : ''); }
  else if (a === 'export') exportCol();
  else if (a === 'wipe') ask('Effacer ta collection et tes réglages sur cet appareil ?', 'Tout effacer', () => { try { Object.keys(localStorage).filter(k => k.startsWith(STORE) || k === 'callit.anthropicKey' || k === 'callit.liveIA').forEach(k => localStorage.removeItem(k)); } catch (e) {} location.hash = '#/'; location.reload(); });
});
document.addEventListener('change', e => {
  if ((e.target.id === 'ctrfile' || e.target.id === 'ctrfile2') && e.target.files[0]) { const f = e.target.files[0]; e.target.value = ''; ctrLoad(f); return; }
  if ((e.target.id === 'scanfile' || e.target.id === 'scanfile2') && e.target.files[0]) { const f = e.target.files[0]; e.target.value = ''; runScan(f); return; }
  const el = e.target; const a = el.dataset && el.dataset.act; if (!a) return;
  if (a === 'game') { S.game = el.value; saveS(); location.hash = '#/'; location.reload(); }
  else if (a === 'sort') { S.sort = el.value; saveS(); shown = 60; render(); }
  else if (a === 'uilang') { S.ui = el.value; S.nameLang = el.value; presetLangs(); saveS(); location.reload(); }
  else if (a === 'set') { S[el.dataset.k] = el.value; saveS(); render(); }
  else if (a === 'exclsearch') { S.exclSearch = el.checked; saveS(); }
  else if (a === 'anylang') { el.checked ? anyLang.add(el.dataset.key) : anyLang.delete(el.dataset.key); save('anyLang', [...anyLang]); toast(el.checked ? 'Cette carte s\'affichera dans toutes les langues' : 'Exception retirée'); }
  else if (a === 'import') importCol(el.files[0]);
  else if (a === 'hclean') { histClean = el.checked; drawHist(); }
});
let searchT;
document.addEventListener('input', e => {
  if (e.target.id === 'deckq') { const v = e.target.value.trim().toLowerCase(); let n = 0; document.querySelectorAll('#metadecks > .line').forEach(el => { const ok = !v || el.dataset.hay.includes(v); el.style.display = ok ? '' : 'none'; n += ok; }); const none = document.getElementById('deckq-none'); if (none) none.style.display = n ? 'none' : ''; return; }
  if (e.target.id === 'agq') { agSearch(e.target.value); return; }
  if (e.target.id === 'aq') { clearTimeout(searchT); searchT = setTimeout(() => { artistQ = e.target.value; artistShown = 30; render(true); }, 150); return; }
  if (e.target.id === 'homeq') { const v = e.target.value; if (v.trim()) { focusSearch = true; location.hash = '#/recherche?q=' + encodeURIComponent(v); } return; }
  if (e.target.id !== 'q') return;
  clearTimeout(searchT);
  searchT = setTimeout(() => { const { q } = parseHash(); const raw = e.target.value; raw.trim() ? q.set('q', raw) : q.delete('q'); history.replaceState(null, '', '#/recherche' + (q.toString() ? '?' + q : '')); render(true); }, 180);
});
document.addEventListener('submit', e => {
  const fm = e.target.dataset.form;
  if (fm === 'ctrask') { e.preventDefault(); const i = e.target.querySelector('#ctrq'); ctrAskSend(i.value); return; }
  if (fm === 'newdeck' || fm === 'editdeck') {
    e.preventDefault(); const f = e.target, name = f.name.value.trim().slice(0, 60) || F('Mon deck'), list = parseDeckText(f.list.value);
    if (fm === 'newdeck') { const nd = { id: 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name, list, created: new Date().toISOString().slice(0, 10), game: GAME }; myDecks.unshift(nd); saveDecks(); location.hash = '#/mondeck/' + nd.id; }
    else { const d = myDecks.find(x => x.id === f.dataset.id); if (d) { d.name = name; d.list = list; d.updated = new Date().toISOString().slice(0, 10); saveDecks(); } deckEditId = ''; render(); }
    const bad = list.filter(x => !x[4]).length; toast(bad ? F(bad > 1 ? '{0} lignes non reconnues : vérifie le nom' : '{0} ligne non reconnue : vérifie le nom', bad) : F('Deck enregistré')); return;
  }
  if (e.target.dataset.act === 'magic') { e.preventDefault(); const v = e.target.email.value.trim(); if (v) sendMagicLink(v); return; }
  if (e.target.dataset.act !== 'search') return; e.preventDefault(); const i = e.target.querySelector('input'); i.blur();
});

function exportCol() {
  const blob = new Blob([JSON.stringify({ app: 'CallIt!', version: 1, exported: new Date().toISOString(), settings: S, collection, sealed: sealedCol, wish, decks: myDecks, anyLang: [...anyLang] }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'callit-collection-' + new Date().toISOString().slice(0, 10) + '.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function importCol(file) {
  if (!file) return;
  file.text().then(t => {
    const j = JSON.parse(t); if (!j || !Array.isArray(j.collection)) throw new Error('format');
    j.collection = cleanList(j.collection, 'card'); j.sealed = cleanList(j.sealed, 'sealed'); j.decks = cleanList(j.decks, 'deck');
    const known = j.collection.filter(it => it && knownKey(it.key)); const ids = new Set(collection.map(x => x.id));
    const add = known.filter(it => !ids.has(it.id));
    ask(`Ajouter ${pl(add.length, 'carte', 'cartes')} à ta collection ?` + (j.collection.length - known.length ? ` (${pl(j.collection.length - known.length, 'non reconnue ignorée', 'non reconnues ignorées')})` : ''), 'Ajouter', () => {
    collection.push(...add); saveCol(); if (Array.isArray(j.sealed)) { const sid = new Set(sealedCol.map(x => x.id)); sealedCol.push(...j.sealed.filter(x => x && x.pid && !sid.has(x.id))); saveSealed(); } if (Array.isArray(j.decks)) { const dd = new Set(myDecks.map(x => x.id)); myDecks.push(...j.decks.filter(x => x && x.id && !dd.has(x.id))); saveDecks(); } (j.anyLang || []).forEach(k => anyLang.add(k)); save('anyLang', [...anyLang]); toast(pl(add.length, 'carte importée', 'cartes importées')); render(); });
  }).catch(() => toast("Ce fichier n'est pas une sauvegarde CallIt!"));
}

/* ---------- Rendu ---------- */
const app = document.getElementById('app');
function render(keepFocus) {
  if (!DB) return;
  document.body.dataset.face = G() ? 'galerie' : 'marche';
  const { parts, q } = parseHash();
  if (!S.face && parts[0] !== 'carte') { app.innerHTML = viewWelcome(); document.title = 'CallIt!'; return; }
  const r = parts[0] || '';
  let html, title = 'CallIt!';
  if (r === 'recherche') { html = viewSearch(q); title = 'Recherche · CallIt!'; }
  else if (r === 'carte') { html = viewCard(parts[1], q); const c = BYKEY.get(parts[1]); if (c) title = cardName(c) + ' · CallIt!'; }
  else if (r === 'collection') { html = viewCollection(q); title = (G() ? 'Ma collection' : 'Portefeuille') + ' · CallIt!'; }
  else if (r === 'reglages') { html = viewSettings(); title = 'Réglages · CallIt!'; }
  else if (r === 'signaler') { history.replaceState(null, '', '#/reglages'); html = viewSettings(); title = 'Réglages · CallIt!'; setTimeout(openFeedback, 60); }
  else if (r === 'langues') { html = viewLangs(); title = 'Langues · CallIt!'; }
  else if (r === 'illustrateurs') { html = viewArtists(); title = 'Illustrateurs · CallIt!'; }
  else if (r === 'illustrateur') { const nm = decodeURIComponent(parts[1] || ''); html = viewArtist(nm); title = nm + ' · CallIt!'; }
  else if (r === 'envies') { html = viewWish(); title = 'Mes envies · CallIt!'; }
  else if (r === 'stats') { html = viewStats(); title = 'Statistiques · CallIt!'; }
  else if (r === 'confidentialite') { html = viewPrivacy(); title = 'Données personnelles · CallIt!'; }
  else if (r === 'scelle') { html = viewSealed(parts[1]); title = 'Produit scellé · CallIt!'; }
  else if (r === 'centrage') {
    if (q.get('partage') && 'caches' in window) { // photo reçue par « Partager → CallIt! »
      history.replaceState(null, '', '#/centrage');
      caches.open('callit-partage').then(c => c.match('photo').then(res => res && res.blob().then(b => { c.delete('photo'); ctrLoad(new File([b], 'photo.jpg', { type: b.type || 'image/jpeg' })); }))).catch(() => {});
    }
    html = viewCentrage(q); title = 'Centrage · CallIt!';
  }
  else if (r === 'a-grader') { html = viewAGrader(); title = 'À grader ? · CallIt!'; }
  else if (r === 'indices') { html = viewIndices(); title = 'Indices de prix · CallIt!'; }
  else if (r === 'mondeck') { if (!META) loadMeta(); html = parts[1] === 'nouveau' ? viewMyDeckNew() : viewMyDeck(decodeURIComponent(parts[1] || '')); title = 'Mes decks · CallIt!'; }
  else if (r === 'deck') { html = viewDeck(decodeURIComponent(parts[1] || '')); title = 'Deck · CallIt!'; }
  else html = G() ? viewGalerieHome() : J() ? viewJoueurHome() : viewMarcheHome();
  const active = document.activeElement, typing = keepFocus && active && (active.id === 'q' || active.id === 'aq') ? active.id : null;
  const pos = active && active.id === 'q' ? active.selectionStart : null;
  // Pendant la frappe dans une recherche (cartes ou illustrateurs), on garde le même champ (seul le reste de la page est refait) :
  // le remplacer coupait la saisie du clavier des téléphones (espace ou lettres perdus).
  const topOf = (el, root) => { while (el && el.parentNode !== root) el = el.parentNode; return el; };
  const oldBox = typing && topOf(active, app);
  let kept = false;
  if (oldBox) {
    const tmp = document.createElement('div'); tmp.innerHTML = html;
    const nq = tmp.querySelector('#' + typing), nb = nq && topOf(nq, tmp);
    if (nb) {
      const kids = [...tmp.childNodes], i = kids.indexOf(nb);
      [...app.childNodes].forEach(n => { if (n !== oldBox) n.remove(); });
      oldBox.before(...kids.slice(0, i)); oldBox.after(...kids.slice(i + 1));
      kept = true;
    }
  }
  const hadRev = new Set([...app.querySelectorAll('[data-reveal]')].map(x => x.dataset.reveal));
  if (!kept) app.innerHTML = html;
  // Petites animations : un résultat qui apparaît (centrage, verdict « À grader ? ») se dévoile une seule fois
  app.querySelectorAll('[data-reveal]').forEach(x => { if (!hadRev.has(x.dataset.reveal)) x.classList.add('reveal'); });
  document.title = tr(title);
  if (r === 'carte' || r === 'a-grader') loadHist();
  if (r === 'centrage') { const sc = document.getElementById('ctrscroll'), im = sc && sc.querySelector('img'); if (sc) { const fit = () => { CTR.ar = im.naturalWidth + ' / ' + im.naturalHeight; const a0 = CTR.asp; CTR.asp = im.naturalWidth / im.naturalHeight; if (CTR.type === 'ecard' && a0 !== CTR.asp) setTimeout(ctrSoft); sc.style.aspectRatio = CTR.ar; sc.scrollLeft = CTR.sx || 0; sc.scrollTop = CTR.sy || 0; }; if (im.complete && im.naturalWidth) fit(); else im.addEventListener('load', fit); } }
  if (r === 'centrage') { const im = document.querySelector('#ctrwrap img'); if (im) { if (im.complete) ctrLoupe(); else im.addEventListener('load', ctrLoupe); } }
  if (focusSearch) { focusSearch = false; const i = document.getElementById('q'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
  if (keepFocus && pos != null && !kept) { const i = document.getElementById('q'); if (i) { i.focus(); i.setSelectionRange(pos, pos); } }
}
let focusSearch = false;
let lastRoute = '', navDepth = 0, goingBack = false; // pages visitées dans l'appli : « Retour » ne sort jamais du site
/* Animations de page : la carte touchée s'agrandit vers sa fiche (View Transitions, si le navigateur sait faire),
   sinon un léger fondu à chaque changement de page. Rien si l'appareil demande moins d'animations. */
const calmMotion = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
let vtFrom = null;
document.addEventListener('click', e => { const t = e.target.closest && e.target.closest('a.tile'); vtFrom = t && !e.target.closest('.heart') ? t.querySelector('.cimg') : null; }, true);
function pageEnter() { if (calmMotion()) return; app.classList.remove('enter'); void app.offsetWidth; app.classList.add('enter'); }
window.addEventListener('hashchange', () => {
  const r = location.hash.split('?')[0]; navDepth = r === '#/' || r === '' || r === '#' ? 0 : Math.max(0, navDepth + (goingBack ? -1 : 1)); goingBack = false;
  const changed = r !== lastRoute;
  const go = () => { render(); if (r !== lastRoute) { window.scrollTo(0, 0); lastRoute = r; } };
  const from = vtFrom; vtFrom = null;
  if (from && document.body.contains(from) && document.startViewTransition && !calmMotion() && r.startsWith('#/carte/')) {
    from.style.viewTransitionName = 'carte';
    const vt = document.startViewTransition(() => { from.style.viewTransitionName = ''; go(); const f = document.querySelector('.fiche-img .cimg'); if (f) f.style.viewTransitionName = 'carte'; });
    vt.finished.finally(() => { const f = document.querySelector('.fiche-img .cimg'); if (f) f.style.viewTransitionName = ''; });
  } else { go(); if (changed && r !== '#/signaler') pageEnter(); }
});

(async function start() {
  document.body.dataset.face = G() ? 'galerie' : 'marche';
  app.innerHTML = `<div class="loading"><div class="title">${logo(30)}</div><div class="sub">Chargement des cartes ${esc(GI.name)}…</div></div>`;
  await i18nReady;
  try { await loadData(); } catch (e) {
    app.innerHTML = `<div class="loading"><div class="title">${logo(30)}</div><div class="sub">Impossible de charger les cartes. Vérifie ta connexion puis recharge la page.</div><button class="btn" data-act="reload">Recharger</button></div>`; return;
  }
  lastRoute = location.hash.split('?')[0];
  recordHistory(); render(); if (sealedCol.length) loadSealed();
  if (acctReady() && (hadSession() || /[?&]code=/.test(location.search))) supa();
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    const hadSW = !!navigator.serviceWorker.controller; let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadSW && !reloaded) { reloaded = true; location.reload(); } });
    navigator.serviceWorker.register('sw.js').then(r => r.update()).catch(() => {});
  }
})();
// Pour l'appli mobile : ouvrir le centrage avec une image reçue (« Partager → CallIt! » côté Android/iOS)
window.CallItCentrage = blob => { if (!blob) return; if (location.hash.split('?')[0] !== '#/centrage') location.hash = '#/centrage'; setTimeout(() => ctrLoad(blob instanceof File ? blob : new File([blob], 'photo.jpg', { type: blob.type || 'image/jpeg' })), 50); };
