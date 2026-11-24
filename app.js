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
  for (const k of ['paid', 'max']) if (k in r) r[k] = r[k] == null || r[k] === '' ? null : NUMV(r[k], null);
  if ('pid' in r && typeof r.pid !== 'number') r.pid = SAFE_ID(r.pid);
  for (const k of ['key', 'grader', 'grade', 'date', 'note', 'name', 'added', 'created']) if (k in r && r[k] != null && typeof r[k] !== 'string') r[k] = String(r[k]);
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
  minCond: 'EX',              // état minimum (liens Cardmarket et filtre de la collection)
  sort: 'pert',
  theme: 'auto'              // 'auto' | 'clair' | 'sombre'
}, load('settings', {}));
const saveS = () => save('settings', S);
let collection = cleanList(load('collection', []), 'card');   // [{id, key, lang, cond, grader, grade, qty, paid, cur, date, note}]
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
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function loadData() {
  const [db, rates] = await Promise.all([
    fetch(GI.file).then(r => { if (!r.ok) throw new Error('cards ' + r.status); return r.json(); }),
    fetch('data/rates.json').then(r => r.json()).catch(() => null)
  ]);
  if (rates) RATES = rates;
  DB = db;
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
  if (PKM) loadCmExtra();
  // Si les taux livrés sont approximatifs, on essaie ceux du jour (BCE via frankfurter.app)
  if (RATES.approx) {
    fetch('https://api.frankfurter.app/latest?from=EUR').then(r => r.json()).then(j => {
      if (j && j.rates) { RATES = { date: j.date, approx: false, source: 'Banque centrale européenne (via frankfurter.app)', rates: Object.assign({ EUR: 1 }, j.rates) }; render(); }
    }).catch(() => {});
  }
}

/* Cartes vendues sur Cardmarket mais absentes de TCGdex (data/cm_extra.json) : nom, cote et lien direct, sans image */
let cmExtraN = 0;
function loadCmExtra() {
  fetch('data/cm_extra.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).then(j => {
    if (!j || !j.items || !DB) return;
    const sets = new Map();
    const setOf = e => { if (!sets.has(e)) { const st = { id: 'cm' + e, reg: 'en', x: true, name: { en: (j.exps && j.exps[e]) || 'Promos et autres (Cardmarket)' }, date: '', count: 0 }; DB.sets.push(st); sets.set(e, st); } return sets.get(e); };
    for (const [id, name, att, e, low, trend, avg30, avg7, avg1] of j.items) {
      const set = setOf(e); const vals = { low, trend, avg30, avg7, avg1, trendHolo: 0 };
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
function money(v, cur) {
  cur = cur || userCur();
  if (v == null || isNaN(v)) return '—';
  const k = cur + (Math.abs(v) < 10 ? 's' : 'b');
  if (!fmtCache[k]) {
    const dec = cur === 'JPY' || cur === 'HUF' || cur === 'ISK' ? 0 : (Math.abs(v) >= 1000 ? 0 : 2);
    fmtCache[k] = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: cur, minimumFractionDigits: dec, maximumFractionDigits: dec, currencyDisplay: 'narrowSymbol' });
  }
  return fmtCache[k].format(v);
}
const rate = cur => (RATES.rates || {})[cur];
// Convertit des euros (cote Cardmarket) dans la devise de l'utilisateur
function eur(v) { const cur = userCur(); const r = rate(cur); if (v == null) return '—'; return r ? money(v * r, cur) : money(v, 'EUR'); }
const toUser = v => { const r = rate(userCur()); return v == null ? null : (r ? v * r : v); };
const fromUserToEur = v => { const r = rate(userCur()); return r ? v / r : v; };
const eurNote = v => userCur() === 'EUR' || !rate(userCur()) ? '' : money(v, 'EUR') + ' sur Cardmarket';
const price = c => (c.p ? (c.p[1] != null ? c.p[1] : c.p[0]) : null); // tendance, sinon prix bas
const pf = (c, f) => (c.p ? c.p[DB.priceFields.indexOf(f)] : null);

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
// Sets d'Énergies absents de TCGdex : images de pokemontcg.io, même numérotation
const PTCG_SETS = { sve: 'sve', mee: 'mee' };
const ptcgPath = c => (IMGS && IMGS.ptcg && IMGS.ptcg[c.idx]) || (PTCG_SETS[c.set.id] ? PTCG_SETS[c.set.id] + '/' + parseInt(c.num, 10) : null);
const imgMask = c => { if (!PKM || !IMGS || !IMGS.mask || IMGS.cards !== DB.generated) return null; const D = '0123456789abcdefghijklmnopqrstuvwxyz'; return D.indexOf(IMGS.mask[c.idx * 2]) * 36 + D.indexOf(IMGS.mask[c.idx * 2 + 1]); };
const hasImg = c => { if (c.x) return false; if (!PKM) return !!c.im; const m = imgMask(c); return m == null || m > 0 || !!ptcgPath(c); };
function imgOrder(c, want, force) {
  if (c.x) return [];
  if (!PKM) return c.im ? ['x', ...(DB.fullImage ? ['t'] : [])].filter(l => !imgBad.has(c.key + '|' + l)) : [];
  const base = c.set.reg === 'en' ? ['en', 'fr', 'es', 'it', 'pt', 'de'] : ['ja', 'zh-tw', 'th', 'id', 'ko', 'zh-cn'];
  const m = imgMask(c);
  const okL = m == null ? base : base.filter((l, i) => m & (1 << i));
  const pref = force ? [force] : isVintage(c) ? ['en'] : [want, S.nameLang, ...visibleLangs(c)];
  const order = [...new Set([...pref.filter(l => okL.includes(l)), ...okL])];
  if (PTCG_SETS[c.set.id]) return ['ptcg'].filter(l => !imgBad.has(c.key + '|' + l));
  if (m != null && IMGS.ptcg && IMGS.ptcg[c.idx]) order.push('ptcg');
  return order.filter(l => !imgBad.has(c.key + '|' + l));
}
const imgUrl = (c, l, q) => !PKM ? (q === 'high' && l === 'x' && DB.fullImage ? DB.fullImage : DB.imageBase).replace('{im}', c.im).replace('{size}', q === 'high' ? 'large' : 'normal') : l === 'ptcg' ? 'https://images.pokemontcg.io/' + ptcgPath(c) + (q === 'high' ? '_hires' : '') + '.png' : DB.imageBase.replace('{lang}', l).replace('{serie}', encodeURIComponent(c.set.serie)).replace('{set}', encodeURIComponent(c.set.id)).replace('{num}', encodeURIComponent(c.num)).replace('high.webp', q + '.webp');

const COUNTRY_LANG = { FR: 'fr', BE: 'fr', LU: 'fr', MC: 'fr', IT: 'it', DE: 'de', AT: 'de', CH: 'de', ES: 'es', PT: 'pt', JP: 'ja' };
function prefLang(c) {
  const vis = visibleLangs(c);
  for (const l of [S.nameLang, COUNTRY_LANG[S.country], 'en']) if (l && vis.includes(l)) return l;
  return vis[0] || c.langs[0] || (c.set.reg === 'en' ? 'en' : 'ja');
}
function cimg(c, opts = {}) {
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
  box.classList.toggle('fb', want !== got);
  const fb = box.querySelector('.fallback');
  if (fb) fb.textContent = got === 'ptcg' ? (want === 'en' ? '' : 'image de la version anglaise') : want !== got ? 'image de la version ' + (LANG_OF[got] || got) : '';
  if (got === 'ptcg') box.classList.toggle('fb', want !== 'en');
}
document.addEventListener('load', e => {
  const img = e.target; if (!(img instanceof HTMLImageElement) || !img.dataset.key) return;
  imgOk.set(img.dataset.key, img.dataset.lang); markFallback(img);
}, true);
document.addEventListener('error', e => {
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
  ruler: '<path d="M3 17L17 3l4 4L7 21z"/><path d="M7.5 12.5l2 2M10.5 9.5l1.5 1.5M13.5 6.5l2 2"/>',
  deck: '<rect x="3" y="6" width="12" height="15" rx="2"/><path d="M8 3h10a2 2 0 0 1 2 2v13"/>',
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
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>'
};
const icon = (n, w = 20) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n]}</svg>`;
/* Logo : le toploader « C! » et « Call » + « It! » en vert gain */
function logo(size = 24) {
  const h = Math.round(size * 1.25);
  return `<span class="logo" style="font-size:${size}px"><svg width="${Math.round(h * 94 / 128)}" height="${h}" viewBox="0 0 94 128" aria-hidden="true"><rect x="3" y="3" width="88" height="122" rx="10" fill="none" stroke="var(--ink)" stroke-width="7"/><rect x="15" y="15" width="64" height="98" rx="5" fill="var(--logo-card)"/><text x="40" y="80" font-family="Fraunces, Georgia, serif" font-weight="700" font-size="42" fill="var(--ink)" text-anchor="middle">C</text><text x="62" y="80" font-family="Fraunces, Georgia, serif" font-weight="700" font-size="42" fill="var(--gain)" text-anchor="middle">!</text></svg><span>Call<span class="it">It!</span></span></span>`;
}
const G = () => S.face !== 'marche' && S.face !== 'joueur';
const J = () => S.face === 'joueur';

function faceSwitch() {
  return `<div class="face" role="group" aria-label="Visage de l'appli"><button data-act="face" data-v="galerie" aria-pressed="${G()}">Galerie</button><button data-act="face" data-v="marche" aria-pressed="${S.face === 'marche'}">Marché</button><button data-act="face" data-v="joueur" aria-pressed="${J()}">Joueur</button></div>`;
}
function tabs(cur) {
  const t = G()
    ? [['', 'Galerie', 'home'], ['recherche', 'Recherche', 'search'], ['collection', 'Ma collection', 'coll'], ['reglages', 'Réglages', 'set']]
    : J() ? [['', 'Joueur', 'deck'], ['recherche', 'Recherche', 'search'], ['collection', 'Ma collection', 'coll'], ['reglages', 'Réglages', 'set']]
    : [['', 'Marché', 'chart'], ['recherche', 'Recherche', 'search'], ['collection', 'Portefeuille', 'coll'], ['reglages', 'Réglages', 'set']];
  return `<div class="tabs"><nav aria-label="Navigation"><a class="brand" href="#/" aria-label="CallIt!, accueil">${logo(26)}</a>${t.map(([h, l, i]) => `<a href="#/${h}" ${cur === h ? 'aria-current="page"' : ''}>${icon(i, 22)}<span>${l}</span></a>`).join('')}</nav></div>`;
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
  return `<a class="line ${muted ? 'muted' : ''}" href="#/carte/${encodeURIComponent(c.key)}"><span class="thumb">${cimg(c)}</span><span class="mid"><b>${esc(cardName(c))}</b><span>${esc(setName(c.set))} · ${esc(numLabel(c))} · ${esc(year(c.set))}${muted ? ' · langue exclue' : ''}</span>${langChips(c)}</span><span class="px"><b class="num">${p != null ? eur(p) : '—'}</b><span>${p != null ? (pf(c, 'low') > 0 ? 'dès ' + eur(pf(c, 'low')) : 'cote Cardmarket') : 'pas de cote'}</span></span></a>`;
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
const CTR = { img: null, side: 'recto', sel: 0, L: null, key: '' };
// Seuils PSA (côté le plus large toléré) : recto puis verso
const PSA_CTR = [[10, 55, 75], [9, 60, 90], [8, 65, 90], [7, 70, 90], [6, 80, 90], [5, 85, 90], [4, 85, 90], [3, 90, 90], [2, 90, 90], [1, 100, 100]];
const CTR_NAMES = ['Bord gauche', 'Cadre gauche', 'Cadre droit', 'Bord droit', 'Bord haut', 'Cadre haut', 'Cadre bas', 'Bord bas'];
function ctrDetect(img) {
  // Profils de contraste par colonne et par ligne, sur une image réduite : bord extérieur = saut le plus fort près du bord,
  // cadre = saut suivant vers l'intérieur. Simple point de départ, à ajuster à la main.
  const W = Math.min(1200, img.naturalWidth), H = Math.round(img.naturalHeight * W / img.naturalWidth), cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d'); g.drawImage(img, 0, 0, W, H); const d = g.getImageData(0, 0, W, H).data;
  const lum = (x, y) => { const i = (y * W + x) * 4; return d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11; };
  const col = new Float32Array(W), row = new Float32Array(H);
  for (let y = Math.round(H * 0.25); y < H * 0.75; y += 2) for (let x = 1; x < W; x++) col[x] += Math.abs(lum(x, y) - lum(x - 1, y));
  for (let x = Math.round(W * 0.25); x < W * 0.75; x += 2) for (let y = 1; y < H; y++) row[y] += Math.abs(lum(x, y) - lum(x, y - 1));
  const peak = (p, a, b) => { a = Math.round(a); b = Math.round(b); let best = a, v = -1; for (let i = Math.max(1, a); i < Math.min(p.length, b); i++) if (p[i] > v) { v = p[i]; best = i; } return best; };
  // premier saut net en partant du bord (le cadre), pas forcément le plus fort (l'illustration peut contraster davantage)
  const first = (p, a, b, dir) => { a = Math.round(a); b = Math.round(b); let mx = 0; for (let i = a; i <= b; i++) mx = Math.max(mx, p[i] || 0); const srt = [...p.slice(a, b + 1)].sort((x, y) => x - y); const th = Math.max(mx * 0.12, (srt[srt.length >> 1] || 0) * 4); const idx = dir > 0 ? [...Array(b - a + 1).keys()].map(k => a + k) : [...Array(b - a + 1).keys()].map(k => b - k); for (const i of idx) if ((p[i] || 0) >= th) { let best = i; for (let j = i; Math.abs(j - i) <= 3; j += dir) if ((p[j] || 0) > (p[best] || 0)) best = j; return best; } return dir > 0 ? a : b; };
  const pair = (p, n) => { const o1 = peak(p, 1, n * 0.2), o2 = peak(p, n * 0.8, n - 1); const span = o2 - o1; const i1 = first(p, o1 + span * 0.02, o1 + span * 0.14, 1), i2 = first(p, o2 - span * 0.14, o2 - span * 0.02, -1); return [o1, i1, i2, o2].map(v => v / n * 100); };
  return [...pair(col, W), ...pair(row, H)];
}
function ctrResult() {
  const L = CTR.L; if (!L) return null;
  const l = L[1] - L[0], r = L[3] - L[2], t = L[5] - L[4], b = L[7] - L[6];
  if (l <= 0 || r <= 0 || t <= 0 || b <= 0) return { bad: true };
  const lr = Math.round(l / (l + r) * 100), tb = Math.round(t / (t + b) * 100);
  const worst = Math.max(lr, 100 - lr, tb, 100 - tb), back = CTR.side === 'verso';
  const psa = (PSA_CTR.find(([, f, v]) => worst <= (back ? v : f)) || [1])[0];
  return { lr, tb, worst, psa };
}
function viewCentrage(params) {
  const key = params.get('carte') || ''; if (key) CTR.key = key;
  const c = CTR.key && BYKEY.get(CTR.key);
  const res = ctrResult();
  const lines = CTR.L ? CTR.L.map((v, i) => `<div class="ctr-line ${i < 4 ? 'v' : 'h'} ${i % 4 === 0 || i % 4 === 3 ? 'out' : 'in'}${CTR.sel === i ? ' sel' : ''}" style="${i < 4 ? 'left' : 'top'}:${v}%" data-i="${i}"></div>`).join('') : '';
  return `<div class="top">${backBtn()}<span class="sub" style="font-weight:600">${F('Centrage')}</span><span style="width:44px"></span></div>
  <div class="pad stack" style="gap:12px">
    <h1 class="h1">${F('Mesurer le centrage')}</h1>
    ${c ? `<div class="small">${esc(cardName(c))} · ${esc(setName(c.set))}</div>` : ''}
    <div class="small">${F('Prends la carte en photo bien à plat, de face, sur un fond uni. Ajuste ensuite les traits : en bleu les bords de la carte, en vert le cadre de l’illustration. La photo reste sur ton appareil.')}</div>
    <div class="row" style="gap:8px;flex-wrap:wrap"><label class="btn primary">${icon('camera', 18)} ${F(CTR.img ? 'Autre photo' : 'Prendre ou choisir une photo')}<input type="file" accept="image/*" class="sr" id="ctrfile"></label>
    <div class="face" role="group" aria-label="${F('Face de la carte')}">${[['recto', 'Recto'], ['verso', 'Verso']].map(([k, l]) => `<button data-act="ctrside" data-v="${k}" aria-pressed="${CTR.side === k}">${F(l)}</button>`).join('')}</div></div>
    ${CTR.img ? `<div class="ctr-wrap" id="ctrwrap"><img src="${CTR.img}" alt="" draggable="false">${lines}</div>
    <div class="ctr-loupe" id="ctrloupe" aria-hidden="true"><i></i></div>
    <div class="row" style="gap:8px;align-items:center;justify-content:space-between"><button class="btn small" data-act="ctrnudge" data-v="-1" aria-label="${F('Déplacer')} −">◀</button><b style="font-size:14px;text-align:center;flex:1">${F(CTR_NAMES[CTR.sel])}</b><button class="btn small" data-act="ctrnudge" data-v="1" aria-label="${F('Déplacer')} +">▶</button></div>
    <div class="row" style="gap:6px;flex-wrap:wrap;justify-content:center">${CTR_NAMES.map((n, i) => `<button class="chip${CTR.sel === i ? ' on' : ''}" data-act="ctrsel" data-v="${i}" style="font-size:12px">${F(n)}</button>`).join('')}</div>
    ${res && !res.bad ? `<div class="panel stack" style="gap:6px"><div class="row" style="justify-content:space-around;text-align:center"><div><div class="small">${F('Gauche / droite')}</div><b class="num" style="font-size:26px">${res.lr}/${100 - res.lr}</b></div><div><div class="small">${F('Haut / bas')}</div><b class="num" style="font-size:26px">${res.tb}/${100 - res.tb}</b></div></div>
      <div style="text-align:center;font-size:15px">${F(CTR.side === 'verso' ? 'Verso compatible avec un {0} au mieux.' : 'Recto compatible avec un {0} au mieux.', `<b class="${res.psa >= 9 ? 'gain' : res.psa <= 7 ? 'loss' : ''}">PSA ${res.psa}</b>`)}</div>
      <div class="small">${F('Seuils PSA : 55/45 au recto et 75/25 au verso pour un 10, 60/40 au recto pour un 9. Le centrage n’est qu’un critère : les coins, les bords et la surface comptent aussi. Mesure à la main, à titre indicatif.')}</div></div>` : res && res.bad ? `<div class="panel small">${F('Les traits se croisent : remets chaque trait bleu à l’extérieur de son trait vert.')}</div>` : ''}` : ''}
  </div>${tabs('')}`;
}
// Loupe : agrandit la photo d'origine (pleine résolution) autour du trait choisi, pour le placer au pixel près
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
  r.onload = () => { const img = new Image(); img.onload = () => { CTR.img = r.result; try { CTR.L = ctrDetect(img); } catch (e) { CTR.L = [3, 8, 92, 97, 3, 8, 92, 97]; } CTR.sel = 0; render(); }; img.src = r.result; };
  r.readAsDataURL(file);
}
// Glisser un trait : on prend le trait le plus proche du doigt, dans le bon sens
document.addEventListener('pointerdown', e => {
  const wrap = e.target.closest && e.target.closest('#ctrwrap'); if (!wrap || !CTR.L) return;
  const rc = wrap.getBoundingClientRect(), px = (e.clientX - rc.left) / rc.width * 100, py = (e.clientY - rc.top) / rc.height * 100;
  let best = CTR.sel, dist = 1e9;
  CTR.L.forEach((v, i) => { const dd = i < 4 ? Math.abs(v - px) * rc.width : Math.abs(v - py) * rc.height; if (dd < dist) { dist = dd; best = i; } });
  CTR.sel = best; e.preventDefault(); wrap.setPointerCapture(e.pointerId);
  const move = ev => { const x = (ev.clientX - rc.left) / rc.width * 100, y = (ev.clientY - rc.top) / rc.height * 100; CTR.L[best] = Math.max(0, Math.min(100, best < 4 ? x : y)); const el = wrap.querySelector(`[data-i="${best}"]`); if (el) el.style[best < 4 ? 'left' : 'top'] = CTR.L[best] + '%'; ctrLoupe(); };
  const up = () => { wrap.removeEventListener('pointermove', move); wrap.removeEventListener('pointerup', up); wrap.removeEventListener('pointercancel', up); render(); };
  wrap.addEventListener('pointermove', move); wrap.addEventListener('pointerup', up); wrap.addEventListener('pointercancel', up);
  move(e);
});
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
function pitchList() {
  return `<div class="pitch">${PITCH.map(([ic, t, d]) => `<div class="pitch-i"><span class="pitch-ic">${icon(ic, 18)}</span><div><b>${t}</b><div class="small">${d}</div></div></div>`).join('')}</div>`;
}
/* Premier lancement, étape 2 : pays (devise) et langues collectionnées */
const uiLangSel = () => `<select data-act="uilang" aria-label="Langue de l'appli" data-noi18n>${Object.entries(UI_LANGS).map(([c, n]) => `<option value="${c}" ${UI === c ? 'selected' : ''}>${n}</option>`).join('')}</select>`;
function viewWelcomePrefs() {
  const ex = excluded();
  const main = ['fr', 'en', 'ja', 'de', 'it', 'es', 'pt', 'ko', 'zh-tw', 'zh-cn'];
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
    <div class="chips wrap">${main.map(c => `<button class="chip${ex.has(c) ? '' : ' on'}" data-act="lang" data-v="${c}" aria-pressed="${!ex.has(c)}">${esc(LANG[c].name)}</button>`).join('')}</div>
  </div>
  <button class="btn primary full" style="margin-top:22px" data-act="wdone">C'est parti</button>
  <button class="btn full" style="margin-top:8px;background:none" data-act="wback">Retour</button>
  </div>`;
}
function viewWelcome() {
  if (welcomeFace) return viewWelcomePrefs();
  const W = welcomeArt();
  return `<div class="pad welcome" style="padding-top:60px;min-height:100vh">
  <div class="title">${logo(30)}</div>
  <h1 style="font-family:var(--serif);font-weight:500;font-size:34px;line-height:1.1;margin:32px 0 0">Bienvenue sur Call<span class="it">It!</span></h1>
  <p class="sub" style="font-size:15px;margin:10px 0 0">L'outil gratuit pour connaître la valeur de tes cartes, faire les bons achats et suivre ta collection.</p>
  ${pitchList()}
  <h2 style="font-family:var(--serif);font-weight:500;font-size:26px;line-height:1.1;margin:32px 0 0">Tu collectionnes pour quoi ?</h2>
  <p class="sub" style="font-size:15px;margin:8px 0 0">On adapte l'appli. Tu pourras changer à tout moment.</p>
  <div class="small" style="font-weight:600;margin-top:24px">Ton jeu</div>${gameChips()}
  <div class="stack" style="margin-top:32px">
    <button class="choice" data-act="welcome" data-v="galerie">${art(W[0], 52, 72, 0)}<span><b>Pour la beauté des cartes</b><span>Illustrations, artistes, ma collection</span></span></button>
    <button class="choice" data-act="welcome" data-v="marche">${art(W[1], 52, 72, 0)}<span><b>Pour investir et revendre</b><span>Cotes, marges, portefeuille</span></span></button>
    <button class="choice" data-act="welcome" data-v="galerie"><span style="width:52px;height:72px;flex:none;position:relative">${art(W[2], 38, 53, -8, 'left:0;top:6px')}${art(W[3], 38, 53, 6, 'right:0;top:12px')}</span><span><b>Un peu des deux</b><span>Galerie par défaut, Marché à un geste</span></span></button>
    <button class="choice" data-act="welcome" data-v="joueur">${art(W[4] || W[1], 52, 72, 0)}<span><b>Pour jouer en tournoi</b><span>Decks du moment, prix d'un deck${PKM ? '' : ' (Pokémon d’abord)'}</span></span></button>
  </div>
  <p class="sub" style="text-align:center;margin-top:40px">Les prix restent visibles partout, juste plus discrets en Galerie.</p><p class="small" style="text-align:center">${PKM ? 'Illustrations : Soporifik par Tomokazu Komiya (Écarlate et Violet), Gromago-ex par Shigenori Negishi (Évolutions Prismatiques), Nymphali-ex par Cona Nitanda, Mentali-ex par sui et Lanssorien-ex par Jerky (Évolutions Prismatiques).' : 'Illustrations : ' + esc(joinFr(W.map(k => BYKEY.get(k)).filter(Boolean).map(c => cardName(c) + (ill(c) ? ' par ' + ill(c) : '') + ' (' + setName(c.set) + ')')))+ '.'}</p></div>`;
}

/* Carte « Mon profil » en haut de l'accueil : visage, collection, devise, langues */
function profileCard() {
  const p = portfolio();
  const faces = [['galerie', 'Galerie', 'Illustrations en grand, artistes, prix discrets'], ['marche', 'Marché', 'Cotes, plus-values, portefeuille']];
  return `<div class="pad" style="padding-top:12px"><div class="panel stack" style="gap:12px">
    <b style="font-size:15px">Mon profil</b>
    <div class="profile-faces" role="group" aria-label="Visage de l'appli">${faces.map(([k, l, d]) => `<button data-act="face" data-v="${k}" aria-pressed="${(k === 'galerie') === G()}"><b>${l}</b><span>${d}</span></button>`).join('')}</div>
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
    return `<div class="sect"><div class="small" style="font-weight:600">Nouveauté · ${fdate(st.date)}</div><h2 style="font-family:var(--serif);font-weight:500;font-size:28px;line-height:1.05;margin:4px 0 0">${esc(setName(st))}</h2><div class="sub" style="margin-top:4px">les cartes phares · <a href="#/recherche?set=${i}">tout le set</a></div></div>
  <div class="hrow hero" style="padding-top:14px;padding-bottom:18px">${cs.map(c => tile(c, { big: true, eager: true, meta: eur(price(c)) })).join('')}</div>`;
  }
  return '';
}
function topCardsBlock() {
  const top = CARDS.filter(c => c.p && price(c) > 0 && hasImg(c)).sort((x, y) => price(y) - price(x)).slice(0, 10);
  return `<div class="sect"><div class="small" style="font-weight:600">${esc(GI.name)}</div><h2 style="font-family:var(--serif);font-weight:500;font-size:28px;line-height:1.05;margin:4px 0 0">Les cartes les plus chères</h2><div class="sub" style="margin-top:4px">cote ${esc(SRC())}</div></div>
  <div class="hrow hero" style="padding-top:14px;padding-bottom:18px">${top.map(c => tile(c, { big: true, eager: true, meta: setName(c.set) + ' · ' + eur(price(c)) })).join('')}</div>`;
}
function homeTop() {
  return `<div class="home-head"><div class="top home-top"><a class="title" href="#/" style="text-decoration:none;color:inherit" aria-label="CallIt!, accueil">${logo(32)}</a><div class="row" style="gap:8px">${faceSwitch()}<a class="iconbtn" href="#/reglages" aria-label="Mon profil et réglages">${icon('user')}</a></div></div>
  <div class="pad" style="padding-top:10px"><label for="homeq" class="sr">Chercher une carte</label><div class="searchrow"><input id="homeq" class="search" type="search" enterkeyhint="search" autocomplete="off" placeholder="Chercher une carte ${esc(GI.name)}, un set${PKM || GAME === 'mtg' ? ', un artiste' : ''}…">${PKM ? scanBtn('iconbtn scanbig') : ''}</div>${PKM ? `<a class="ctr-homelink" href="#/centrage">${icon('ruler', 16)}<b>${F('Mesurer le centrage')}</b><span>${F('photo ou capture d’écran')}</span></a>` : ''}${gameChips()}</div></div>`;
}
function newcomerBlock() {
  if (collection.length || sealedCol.length || me) return '';
  return `<div class="pad" style="padding-top:14px"><div class="panel stack" style="gap:10px"><b style="font-size:17px">C'est quoi, Call<span class="it">It!</span> ?</b><div class="small" style="font-size:14px">Un outil gratuit pour savoir ce que valent tes cartes, repérer les bonnes affaires et suivre ta collection. On ne vend rien et on n'achète rien à ta place.</div>${pitchList()}</div></div>`;
}
function startCta() {
  return `<a class="panel cta" href="#/recherche" data-act="gosearch"><div style="flex:1"><b style="font-size:16px">Ajoute ta première carte</b><div class="small" style="margin-top:3px">Cherche-la, puis « Ajouter à ma collection ». Elle reste sur ton appareil, rien n'est envoyé.</div></div><span class="cta-plus">+</span></a>`;
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
  <div class="pad stack" style="gap:8px;margin-top:18px"><div class="small" style="font-weight:600">${PKM ? 'Explorer par' : 'Explorer'}</div>
  <div class="chips wrap">${explore.map(([l, h]) => `<a class="chip" href="${h}">${esc(l)}</a>`).join('')}</div></div></div>
  <div class="col-b">${PKM ? '' : newestSetBlock()}${a.n ? '' : topCardsBlock()}${!a.n ? '<!--' : ''}
  <div class="sect"><div class="small" style="font-weight:600">L'artiste de la semaine</div>
  <h2 style="font-family:var(--serif);font-weight:500;font-size:28px;line-height:1.05;margin:4px 0 0">${esc(a.name)}</h2>
  <div class="sub" style="margin-top:4px">${a.n} cartes · <a href="#/recherche?ill=${encodeURIComponent(a.name)}">tout voir</a></div></div>
  <div class="hrow hero" style="padding-top:14px;padding-bottom:18px">${cards.map(c => tile(c, { big: true, eager: true })).join('')}</div>${!a.n ? '-->' : ''}
  ${cheap.length ? `<div class="sect between" style="padding-top:4px"><h2 class="h2">Petits prix, belles illustrations</h2><a class="sub" href="#/recherche?preset=petitprix">tout voir</a></div><p class="pad small" style="margin:0 0 8px">Illustrations rares (AR) et spéciales (SIR) à moins de ${money(5).replace(/[,.]00/, '')}.</p><div class="hrow" style="padding-bottom:18px">${cheap.map(c => tile(c, { meta: setName(c.set) + ' · ' + eur(price(c)) })).join('')}</div>` : ''}
  </div></div>
  ${tabs('')}`;
}

/* Accueil Marché : valeur de la collection et mouvements réels du guide Cardmarket */
function portfolio() {
  let value = 0, paid = 0, graded = 0, n = 0;
  for (const it of collection) {
    const c = BYKEY.get(it.key); if (!c) continue;
    const q = it.qty || 1; n += q;
    if (it.grader) { graded += q; value += (it.paid || 0) * q; } else value += (toUser(price(c)) || 0) * q;
    paid += (it.paid || 0) * q;
  }
  for (const it of sealedCol) paid += (it.paid || 0) * (it.qty || 1);
  value += sealedValue();
  return { value, paid, graded, n };
}
function spark() {
  const h = load(PKM ? 'history' : 'history.' + GAME, {}); const pts = Object.entries(h).sort((a, b) => a[0].localeCompare(b[0]));
  if (pts.length < 2) return `<div class="small" style="padding:6px 0 0">L'historique de la valeur se construit à partir d'aujourd'hui, à chaque mise à jour des cotes.</div>`;
  const vs = pts.map(p => p[1]); const mn = Math.min(...vs), mx = Math.max(...vs), w = 350, hh = 56;
  const d = vs.map((v, i) => `${(i / (vs.length - 1) * w).toFixed(1)} ${(hh - 4 - (mx === mn ? 0.5 : (v - mn) / (mx - mn)) * (hh - 8)).toFixed(1)}`).join(' L');
  return `<svg class="spark" viewBox="0 0 ${w} ${hh}" preserveAspectRatio="none" role="img" aria-label="Évolution de la valeur"><path d="M${d}" fill="none" stroke="var(--gain)" stroke-width="2.5" stroke-linejoin="round"/></svg>`;
}
function recordHistory() {
  if (!DB || !collection.length) return;
  const HK = PKM ? 'history' : 'history.' + GAME; const h = load(HK, {}); const day = (DB.generated || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
  const r = rate(userCur()) || 1; let v = 0;
  for (const it of collection) { const c = BYKEY.get(it.key); if (c && !it.grader) v += (price(c) || 0) * (it.qty || 1); }
  h[day] = Math.round(v * 100) / 100; save(HK, h); void r;
}
let moversCache = null, moversAll = { up: false, down: false, top: false };
function movers() {
  if (moversCache) return moversCache;
  // Hausse fiable : cote ≥ 5 €, ventes récentes cohérentes (tendance proche de la moyenne 7 j), pas d'offre isolée
  const list = CARDS.filter(c => c.set.reg === 'en' && hasImg(c) && c.p && c.p[1] >= 5 && c.p[2] >= 5 && c.p[0] >= 1 && pf(c, 'avg7') > 0 && Math.abs(c.p[1] / pf(c, 'avg7') - 1) < 0.35).map(c => [c, (c.p[1] - c.p[2]) / c.p[2]]);
  moversCache = { up: list.filter(x => x[1] > 0.05).sort((a, b) => b[1] - a[1]).slice(0, 20), down: list.filter(x => x[1] < -0.05 && x[1] > -0.6).sort((a, b) => a[1] - b[1]).slice(0, 20), top: CARDS.filter(c => c.set.reg === 'en' && hasImg(c) && c.p && c.p[1]).sort((a, b) => b.p[1] - a.p[1]).slice(0, 20).map(c => [c, (c.p[1] - (c.p[2] || c.p[1])) / (c.p[2] || c.p[1])]) };
  return moversCache;
}
function moverRow([c, d]) {
  return `<a class="line" href="#/carte/${encodeURIComponent(c.key)}"><span class="thumb">${cimg(c)}</span><span class="mid"><b>${esc(cardName(c))}</b><span>${esc(setName(c.set))} · ${esc(numLabel(c))}</span></span><span class="px"><b class="num">${eur(c.p[1])}</b><span class="${d >= 0 ? 'gain' : 'loss'}" style="font-weight:700">${d >= 0 ? '+' : ''}${Math.round(d * 100)} % vs 30 j</span></span></a>`;
}
function moverList(k, title, sub) {
  const m = movers()[k], all = moversAll[k];
  if (!m.length) return '';
  return `<div class="sect between"><h2 class="h2" style="font-family:var(--sans)">${title}</h2><span class="sub">${sub}</span></div>
  <div class="list">${m.slice(0, all ? 20 : 5).map(moverRow).join('')}</div>
  <div class="pad" style="margin-top:8px"><button class="btn small" data-act="mall" data-v="${k}">${all ? 'Voir moins' : 'Voir les 20'}</button></div>`;
}
function viewMarcheHome() {
  const p = portfolio(); const diff = p.value - p.paid; const I = indices();
  const myBlock = p.n ? `<div class="pad" style="padding-top:18px"><a class="sub" href="#/collection" style="text-decoration:none">Valeur de ma collection ›</a>
  <div class="num" style="font-weight:700;font-size:40px;letter-spacing:-.03em;line-height:1.05">${money(p.value)}</div>
  <div style="font-size:14px;font-weight:600" class="${diff >= 0 ? 'gain' : 'loss'}">${diff >= 0 ? '+' : ''}${money(diff)} ${p.paid ? '· ' + (diff >= 0 ? '+' : '') + Math.round(diff / p.paid * 100) + ' %' : ''} par rapport au prix payé</div>
  ${spark()}</div>` : `<div class="sect"><h2 class="h2" style="font-family:var(--sans)">Mon portefeuille</h2></div><div class="pad">${startCta()}</div>`;
  return `${homeTop()}
  ${acctBanner()}${newcomerBlock()}
  <div class="home-cols"><div class="col-a">${myBlock}
  ${PKM ? `<div class="pad" style="margin-top:16px"><a class="panel row" href="#/indices" style="text-decoration:none"><div style="flex:1"><div class="small" style="font-weight:600">Indice Vintage 100</div><div class="num" style="font-weight:700;font-size:22px">${eur(I.vint.v)} ${pct(I.vint.ch)}</div><div class="small">Les 100 cartes vintage de référence · aussi par set et par Pokémon</div></div><span style="transform:scaleX(-1);display:flex">${icon('back')}</span></a></div>` : ''}
  <div class="pad" style="margin-top:14px"><div class="note">${SRC() === 'Cardmarket' ? F('Cotes : guide de prix public Cardmarket du {0}, toutes langues et tous états confondus.', fdate(DB.generated)) : F('Cotes : {0} (États-Unis), converties en euros puis dans ta devise.', esc(SRC()))}</div></div></div>
  <div class="col-b">
  ${PKM ? '' : newestSetBlock()}
  ${moverList('up', 'En hausse', 'sur 30 jours, cartes assez vendues')}
  ${moverList('down', 'En baisse', 'bonnes affaires possibles, sur 30 jours')}
  ${moverList('top', 'Les plus chères', 'cote ' + SRC())}
  </div></div>
  ${tabs('')}`;
}
/* Visage Joueur : decks du moment (data/meta/pkm.json, API Limitless TCG) */
let META = null, metaLoading = false;
function loadMeta() {
  if (META || metaLoading || !PKM) return; metaLoading = true;
  fetch('data/meta/pkm.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).then(j => { META = j || { decks: [] }; render(); }).catch(() => { META = { decks: [] }; render(); });
}
function deckCost(d) {
  let t = 0, miss = 0;
  for (const [n, , , , key] of d.list || []) { const c = key && BYKEY.get(key); const p = c && price(c); if (p) t += n * p; else miss += n; }
  return { t, miss };
}
function deckCard(d) {
  const ps = (d.list || []).filter(x => x[5] === 'p' && x[4] && BYKEY.get(x[4])).sort((a, b) => (/ ex$/i.test(b[1]) - / ex$/i.test(a[1])) || b[0] - a[0] || (price(BYKEY.get(b[4])) || 0) - (price(BYKEY.get(a[4])) || 0));
  return ps.length ? BYKEY.get(ps[0][4]) : null;
}
const metaCredit = () => `Données de tournois : <a href="https://play.limitlesstcg.com" target="_blank" rel="noopener">Limitless TCG</a>`;
/* ---------- Mes decks (mode Joueur) : gardés sur l'appareil, sauvegardés avec le compte ---------- */
let myDecks = cleanList(load('decks', []), 'deck');   // [{id, name, list: [[nb, nom, code set, numéro, clé, p|t|e]], created}]
const saveDecks = () => { save('decks', myDecks); syncSoon(); };
const PART_OF = { pokemon: 'p', 'pokémon': 'p', trainer: 't', trainers: 't', dresseur: 't', dresseurs: 't', energy: 'e', 'énergie': 'e', 'énergies': 'e', energie: 'e', energies: 'e' };
// Codes de sets (TWM, MEG…) appris des listes de tournoi : code + numéro → clé CallIt!
function setCodeMap() {
  const m = new Map();
  for (const d of (META && META.decks) || []) for (const [, , code, num, key] of d.list || []) if (code && key) { const sid = key.split(':')[1]; if (!m.has(code.toUpperCase())) m.set(code.toUpperCase(), sid); }
  return m;
}
let NAME_IDX = null;
function cardByName(name) {
  if (!NAME_IDX) { NAME_IDX = new Map(); for (const c of CARDS) { if (c.x) continue; for (const v of Object.values(c.n)) { const k = v.toLowerCase(); const cur = NAME_IDX.get(k); if (!cur || ((price(c) || 1e9) < (price(cur) || 1e9) && hasImg(c))) NAME_IDX.set(k, c); } } }
  const k = String(name || '').toLowerCase().replace(/\s+/g, ' ').trim();
  return NAME_IDX.get(k) || NAME_IDX.get(k.replace(/^basic /, '')) || NAME_IDX.get(k.replace(/ energy$/, ' energy').replace(/^/, 'basic ')) || null;
}
function parseDeckText(txt) {
  const codes = setCodeMap(), out = []; let part = 'p';
  for (let line of String(txt).split(/\r?\n/)) {
    line = line.trim(); if (!line) continue;
    const h = /^([A-Za-zÀ-ÿ ]+?)\s*:?\s*\(?\d*\)?\s*$/.exec(line); if (h && PART_OF[h[1].trim().toLowerCase()]) { part = PART_OF[h[1].trim().toLowerCase()]; continue; }
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
const deckText = d => [['p', 'Pokémon'], ['t', 'Trainer'], ['e', 'Energy']].map(([t, l]) => { const xs = (d.list || []).filter(x => x[5] === t); return xs.length ? `${l}: ${xs.reduce((a, x) => a + x[0], 0)}\n` + xs.map(x => `${x[0]} ${x[1]}${x[2] ? ' ' + x[2] + ' ' + x[3] : ''}`).join('\n') : ''; }).filter(Boolean).join('\n\n');
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
function viewMyDeckNew() {
  return `<div class="top">${backBtn()}<span class="sub" style="font-weight:600">Nouveau deck</span><span style="width:44px"></span></div>
  <form class="pad stack" data-form="newdeck" style="gap:12px">
    <label class="stack" style="gap:6px"><b>Nom du deck</b><input class="fld" name="name" maxlength="60" required placeholder="ex. Dragapult de Léo"></label>
    <label class="stack" style="gap:6px"><b>Liste (facultatif)</b><textarea class="fld" name="list" rows="12" placeholder="Pokémon: 12&#10;4 Dreepy TWM 128&#10;4 Drakloak TWM 129&#10;&#10;Trainer: 36&#10;4 Professor's Research JTG 155&#10;&#10;Energy: 12&#10;12 Psychic Energy MEE 5"></textarea></label>
    <div class="small">Colle la liste exportée de Pokémon TCG Live, de Limitless ou d’un site de decks : une carte par ligne, avec le nombre devant. Tu peux aussi partir d’un deck du moment avec « Copier dans mes decks ».</div>
    <button class="btn primary full" type="submit">Créer le deck</button>
  </form>${tabs('')}`;
}
function viewMyDeck(id) {
  const d = myDecks.find(x => x.id === id);
  if (!d) return `<div class="top">${backBtn()}</div><div class="pad">Deck introuvable.</div>${tabs('')}`;
  const k = deckNeeds(d), parts = [['p', 'Pokémon'], ['t', 'Dresseurs'], ['e', 'Énergies']];
  const row = ({ x: [n, name, set, num, key], own, need, c, p }) => {
    const inner = `<span class="mid"><b>${n} × ${esc(c ? cardName(c) : name)}</b><span>${esc(set || '')} ${esc(num || '')} · ${need ? `<span class="loss">${F('il en manque {0}', need)}</span>` : `<span class="gain">${F('complet')}</span>`}${own ? ' · ' + F('tu en as {0}', own) : ''}${!c ? ' · ' + F('carte non reconnue') : ''}</span></span><span class="px"><b class="num">${need && p ? eur(need * p) : need ? '—' : ''}</b><span>${p ? F('{0} pièce', eur(p)) : F('pas de cote')}</span></span>`;
    return c ? `<a class="line" href="#/carte/${encodeURIComponent(key)}"><span class="thumb">${cimg(c)}</span>${inner}</a>` : `<div class="line"><span class="thumb"></span>${inner}</div>`; };
  const editing = deckEditId === d.id;
  return `<div class="top">${backBtn()}<span class="sub" style="font-weight:600">Mon deck</span><span style="width:44px"></span></div>
  <div class="pad"><h1 class="h1">${esc(d.name)}</h1><p class="sub" style="margin:6px 0 0">${F('{0} cartes · tu en as {1}', k.total, k.have)}</p>
  <div class="num" style="font-weight:700;font-size:32px;margin-top:12px">${k.miss ? eur(k.cost) : '✓'}</div><div class="small">${k.miss ? F(k.miss > 1 ? 'pour les {0} cartes qui te manquent' : 'pour la carte qui te manque', k.miss) + (k.noPrice ? ' · ' + F('{0} sans cote, non comptées', k.noPrice) : '') : F('Tu as toutes les cartes de ce deck.')}</div>
  ${k.total !== 60 && k.total ? `<p class="small" style="margin-top:8px">${F('Attention : la liste compte {0} cartes au lieu de 60.', k.total)}</p>` : ''}
  ${k.miss ? `<button class="btn primary full" style="margin-top:12px" data-act="mydeckwish" data-id="${esc(d.id)}">${icon('heart', 18)} ${F('Mettre les manquantes dans mes envies')}</button>` : ''}<div class="row" style="margin-top:10px;gap:8px;flex-wrap:wrap"><button class="btn small" data-act="mydeckedit" data-id="${esc(d.id)}">${F('Modifier la liste')}</button><button class="btn small" data-act="mydeckcopy" data-id="${esc(d.id)}">${F('Copier la liste')}</button><button class="btn small" data-act="mydeckdel" data-id="${esc(d.id)}">${F('Supprimer')}</button></div></div>
  ${editing ? `<form class="pad stack" data-form="editdeck" data-id="${esc(d.id)}" style="gap:10px;margin-top:8px"><label class="stack" style="gap:6px"><b>${F('Nom du deck')}</b><input class="fld" name="name" maxlength="60" required value="${esc(d.name)}"></label><label class="stack" style="gap:6px"><b>${F('Liste')}</b><textarea class="fld" name="list" rows="14" data-noi18n>${esc(deckText(d))}</textarea></label><div class="btns"><button class="btn" type="button" data-act="mydeckedit" data-id="">${F('Annuler')}</button><button class="btn primary" type="submit">${F('Enregistrer')}</button></div></form>` : ''}
  ${(d.list || []).length ? parts.map(([t, l]) => { const xs = k.rows.filter(r => r.x[5] === t); return xs.length ? `<div class="sect"><h2 class="h2" style="font-family:var(--sans)">${l} (${xs.reduce((a, r) => a + r.x[0], 0)})</h2></div><div class="list">${xs.map(row).join('')}</div>` : ''; }).join('') : `<p class="pad small">${F('Ce deck est vide. Touche « Modifier la liste » pour coller ta liste.')}</p>`}
  <p class="pad small" style="margin-top:12px">${F('Ton deck est gardé sur cet appareil, et sauvegardé avec ton compte si tu en as un. « Tu en as » compte toutes les versions de la carte dans ta collection.')}</p>${tabs('')}`;
}
let deckEditId = '';
function myDecksBlock() {
  const items = myDecks.map(d => { const k = deckNeeds(d); const c = deckCard(d); return `<a class="line" href="#/mondeck/${encodeURIComponent(d.id)}"><span class="thumb">${c ? cimg(c) : ''}</span><span class="mid"><b>${esc(d.name)}</b><span>${k.total ? (k.miss ? F('il te manque {0} cartes', k.miss) : F('complet')) : F('liste vide')}</span></span><span class="px"><b class="num">${k.miss ? eur(k.cost) : ''}</b><span>${k.miss ? F('à acheter') : ''}</span></span></a>`; }).join('');
  return `<div class="sect between"><h2 class="h2" style="font-family:var(--sans)">${F('Mes decks')}</h2><a class="sub" href="#/mondeck/nouveau">${F('+ Nouveau deck')}</a></div>
  ${items ? `<div class="list">${items}</div>` : `<div class="pad"><div class="panel small">${F('Enregistre tes decks : colle une liste ou copie un deck du moment. CallIt! te dit quelles cartes te manquent et combien elles coûtent.')}</div></div>`}`;
}
function copyMetaDeck(id) {
  const d = META && META.decks.find(x => x.id === id); if (!d) return;
  const nd = { id: 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name: d.name, list: (d.list || []).map(x => x.slice(0, 6)), created: new Date().toISOString().slice(0, 10), from: d.id };
  myDecks.unshift(nd); saveDecks(); toast(F('Deck copié dans « Mes decks »')); location.hash = '#/mondeck/' + nd.id;
}
function viewJoueurHome() {
  let body;
  if (!PKM) body = `<div class="pad" style="margin-top:16px"><div class="panel stack"><b>Bientôt pour ${esc(GI.name)}</b><div class="small">Les decks du moment arrivent d’abord pour Pokémon. Les autres jeux suivront.</div></div></div>`;
  else if (!META) { loadMeta(); body = `<div class="pad small" style="margin-top:16px">Chargement des decks du moment…</div>`; }
  else if (!META.decks || !META.decks.length) body = `<div class="pad" style="margin-top:16px"><div class="panel small">Les decks du moment ne sont pas encore disponibles. Ils se mettent à jour chaque matin.</div></div>`;
  else body = `<div class="sect"><h2 class="h2" style="font-family:var(--sans)">Les decks du moment</h2></div>
  <p class="pad small" style="margin:0 0 10px">Format Standard · ${META.tournaments} tournois en ligne et ${META.players.toLocaleString(LOCALE)} joueurs, du ${fdate(META.from)} au ${fdate(META.to)}. Classés par nombre de places dans le top 8.</p>
  <div class="list">${META.decks.slice(0, 10).map((d, i) => { const c = deckCard(d), k = deckCost(d); return `<a class="line" href="#/deck/${encodeURIComponent(d.id)}"><span class="thumb">${c ? cimg(c) : ''}</span><span class="mid"><b>${i + 1}. ${esc(d.name)}</b><span>${(Math.round(d.share * 1000) / 10).toLocaleString(LOCALE)} % des joueurs · ${d.top8} top 8</span></span><span class="px"><b class="num">${k.t ? eur(k.t) : '—'}</b><span>le deck${k.miss ? ' (≈)' : ''}</span></span></a>`; }).join('')}</div>
  <p class="pad small" style="margin-top:10px">Prix d’un deck : les 60 cartes de la meilleure liste, à la cote ${esc(SRC())} du jour. ${metaCredit()}.</p>`;
  return `${homeTop()}${PKM && META ? myDecksBlock() : ''}${body}${tabs('')}`;
}
function viewDeck(id) {
  if (!META) { loadMeta(); return `<div class="top">${backBtn()}</div><div class="pad small">Chargement…</div>${tabs('')}`; }
  const d = (META.decks || []).find(x => x.id === id);
  if (!d) return `<div class="top">${backBtn()}</div><div class="pad">Deck introuvable.</div>${tabs('')}`;
  const k = deckCost(d), parts = [['p', 'Pokémon'], ['t', 'Dresseurs'], ['e', 'Énergies']];
  const row = ([n, name, set, num, key]) => { const c = key && BYKEY.get(key); const p = c && price(c); const own = c && collection.filter(it => it.key === key).reduce((a, it) => a + (it.qty || 1), 0);
    const inner = `<span class="mid"><b>${n} × ${esc(c ? cardName(c) : name)}</b><span>${esc(set || '')} ${esc(num || '')}${own ? ' · tu en as ' + own : ''}</span></span><span class="px"><b class="num">${p ? eur(n * p) : '—'}</b><span>${p ? eur(p) + ' pièce' : 'pas de cote'}</span></span>`;
    return c ? `<a class="line" href="#/carte/${encodeURIComponent(key)}"><span class="thumb">${cimg(c)}</span>${inner}</a>` : `<div class="line"><span class="thumb"></span>${inner}</div>`; };
  return `<div class="top">${backBtn()}<span class="sub" style="font-weight:600">Deck du moment</span><span style="width:44px"></span></div>
  <div class="pad"><h1 class="h1">${esc(d.name)}</h1><p class="sub" style="margin:6px 0 0">${(Math.round(d.share * 1000) / 10).toLocaleString(LOCALE)} % des joueurs · ${d.top8} fois dans un top 8 sur 30 jours</p>
  <div class="num" style="font-weight:700;font-size:32px;margin-top:12px">${eur(k.t)}</div><div class="small">pour les 60 cartes${k.miss ? ` (${k.miss} carte${k.miss > 1 ? 's' : ''} sans cote, non comptée${k.miss > 1 ? 's' : ''})` : ''}</div>
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
  const main = cards[0], all = META.decks || [];
  const strong = [], weak = [], strat = [];
  // Stratégie
  if (main) {
    const evo = cards.find(c => c.stage === 'Stage2') || cards.find(c => c.stage === 'Stage1');
    const att = cards.find(c => T(c).at.some(a => a[1])) || main;
    const bestAt = T(att).at.filter(a => a[1]).sort((a, b) => (parseInt(b[1]) || 0) - (parseInt(a[1]) || 0))[0];
    if (evo && evo.stage === 'Stage2') strat.push(F('Deck à évolution : les premiers tours servent à poser les Pokémon de base et à piocher, pour installer {0} (niveau 2) au plus vite.', esc(T(evo).name)));
    else if (evo) strat.push(F('{0} évolue une seule fois : le deck s’installe en un ou deux tours.', esc(T(evo).name)));
    else strat.push(F('Ses Pokémon principaux sont des Pokémon de base : il peut attaquer dès les premiers tours.'));
    if (bestAt) strat.push(F(bestAt[3] > 1 ? 'L’attaque principale est {0} de {1} ({2} dégâts, {3} Énergies).' : bestAt[3] ? 'L’attaque principale est {0} de {1} ({2} dégâts, 1 Énergie).' : 'L’attaque principale est {0} de {1} ({2} dégâts).', esc(bestAt[0]), esc(T(att).name), esc(String(bestAt[1])), bestAt[3]));
    const abil = cards.filter(c => T(c).ab.length);
    if (abil.length) strat.push(F('Il s’appuie aussi sur {0}.', andList(abil.map(c => F('le talent {0} de {1}', esc(T(c).ab[0][0]), esc(T(c).name))))));
  }
  const en = (d.list || []).filter(x => x[5] === 'e').reduce((a, x) => a + x[0], 0);
  if (en && en <= 7) strat.push(F('Seulement {0} Énergies : le deck compte sur ses Dresseurs et ses talents plutôt que sur l’Énergie attachée à chaque tour.', en));
  // Points forts et faibles tirés des matchs
  const rate = d.rec && wr(d.rec);
  if (rate != null && d.rec[0] + d.rec[1] + d.rec[2] >= 30) {
    if (rate >= 0.5) strong.push(F('{0} de victoires sur {1} matchs contre les autres decks.', pctTxt(rate), (d.rec[0] + d.rec[1] + d.rec[2]).toLocaleString(LOCALE)));
    else weak.push(F('Seulement {0} de victoires sur {1} matchs contre les autres decks : souvent joué, mais pas le plus solide.', pctTxt(rate), (d.rec[0] + d.rec[1] + d.rec[2]).toLocaleString(LOCALE)));
  }
  const avgTop = all.reduce((a, x) => a + x.top8, 0) / Math.max(1, all.reduce((a, x) => a + x.n, 0));
  if (d.n >= 20 && d.top8 / d.n >= avgTop * 1.25) strong.push(F('Va souvent loin : {0} tops 8 pour {1} joueurs, plus que la moyenne des decks.', d.top8, d.n));
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
    if (main.stage === 'Stage2') weak.push(F('Lent au départ : si l’adversaire met KO les petits Pokémon avant leur évolution, le deck peut caler.'));
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
  return `<div class="sect"><h2 class="h2" style="font-family:var(--sans)">Comment il joue</h2></div><div class="pad stack" style="gap:12px">
    ${strat.length ? `<div><b>Stratégie</b>${li(strat)}</div>` : ''}
    ${strong.length ? `<div><b class="gain">Points forts</b>${li(strong)}</div>` : ''}
    ${weak.length ? `<div><b class="loss">Points faibles</b>${li(weak)}</div>` : ''}
    ${cards.length ? `<details><summary><b>Les cartes clés et leurs attaques</b></summary><div class="stack" style="gap:10px;margin-top:8px">${cards.map(fiche).join('')}</div></details>` : ''}
    <div class="small">${F('Calculé par CallIt! à partir de {0} matchs de tournois en ligne sur 30 jours (Limitless TCG) et des textes des cartes (TCGdex). Les pourcentages changent chaque jour.', (META.matches || 0).toLocaleString(LOCALE))}</div></div>`;
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
  const langLabel = S.excluded.length ? 'Langues : ' + LANGS.filter(([c]) => !ex.has(c)).map(l => l[2]).slice(0, 6).join(', ') + (LANGS.length - ex.size > 6 ? '…' : '') : 'Toutes les langues';
  const condLabel = 'État : ' + CONDS.find(c => c[0] === S.minCond)[1] + (S.minCond === 'PO' ? '' : ' et mieux');
  const filt = [];
  if (params.get('ill')) filt.push(['Illustrateur : ' + params.get('ill'), 'ill']);
  if (params.get('dex')) filt.push(['Pokémon n° ' + params.get('dex') + (DB.species[params.get('dex')] ? ' · ' + DB.species[params.get('dex')] : ''), 'dex']);
  if (params.get('set')) { const s = DB.sets[+params.get('set')]; if (s) filt.push(['Set : ' + setName(s), 'set']); }
  if (PRESETS[params.get('preset')]) filt.push([PRESETS[params.get('preset')].label, 'preset']);
  let body = '';
  if (!res) {
    const ideas = ['Dracaufeu', 'Pikachu', 'Psykokwak Team Rocket 65/82', 'Ectoplasma', 'Mew', 'Évoli', 'Lugia Neo', 'ピカチュウ'];
    body = `<div class="pad stack" style="margin-top:18px"><div class="small" style="font-weight:600">Essaie par exemple</div><div class="chips">${ideas.map(i => `<a class="chip" href="#/recherche?q=${encodeURIComponent(i)}">${esc(i)}</a>`).join('')}</div>
    <div class="note">Cherche par nom (dans n'importe quelle langue), set, numéro (« 65/82 ») ou illustrateur. ${CARDS.length.toLocaleString(LOCALE)} cartes, en 12 langues.</div></div>`;
  } else {
    const vis = [], hid = [];
    const qn = norm((params.get('q') || '').trim()), named = c => qn && c.langs.length === 1 && (norm(cardName(c)) === qn || norm(c.n.en || '') === qn || norm(NAME_ALIAS[c.n.en] || '') === qn);
    for (const c of res) (isHidden(c) && !named(c) ? hid : vis).push(c);
    if (S.sort === 'pert' && IMGS) { const a = vis.filter(hasImg), b = vis.filter(c => !hasImg(c)); vis.length = 0; vis.push(...a, ...b); } // cartes avec image d'abord
    const all = showHidden ? res : vis;
    const page = all.slice(0, shown);
    const hidLangs = [...new Set(hid.flatMap(c => c.langs))];
    body = `<div class="sect between" style="padding-top:16px"><b style="font-size:17px">${all.length.toLocaleString(LOCALE)} résultat${all.length > 1 ? 's' : ''}</b><label class="sub">tri : <select data-act="sort" style="border:0;background:transparent;font-weight:600">${Object.entries(sortL).map(([k, l]) => `<option value="${k}" ${S.sort === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
    ${hid.length ? `<div class="hidden-bar"><span>${showHidden ? `Les ${hid.length} résultats en ${joinFr(langList(hidLangs))} sont affichés pour cette recherche.` : `${hid.length} résultat${hid.length > 1 ? 's' : ''} masqué${hid.length > 1 ? 's' : ''} (${joinFr(langList(hidLangs))}).`}</span><button class="btn small" data-act="showhidden">${showHidden ? 'Masquer' : 'Voir'}</button></div>` : ''}
    ${G() ? `<div class="grid">${page.map(c => tile(c, { badge: isHidden(c) ? 'exclue' : '', from: true })).join('')}</div>` : `<div class="list">${page.map(c => lineRow(c, isHidden(c))).join('')}</div>`}
    ${all.length > shown ? `<div class="pad" style="margin-top:14px"><button class="btn full" data-act="more">Voir plus (${(all.length - shown).toLocaleString(LOCALE)} restants)</button></div>` : ''}
    ${!all.length && !hid.length ? `<div class="pad"><div class="note">Aucune carte trouvée. Vérifie l'orthographe ou essaie le nom anglais.</div></div>` : ''}`;
  }
  const typeTabs = !PKM ? '' : `<div class="pad" style="padding-top:12px"><div class="face" role="tablist" aria-label="Type">${[['', 'Cartes'], ['scelles', 'Scellés']].map(([k, l]) => { const q = new URLSearchParams(params); k ? q.set('t', k) : q.delete('t'); q.delete('cat'); return `<a role="tab" aria-selected="${(params.get('t') || '') === k}" class="${(params.get('t') || '') === k ? 'on' : ''}" href="#/recherche?${q}">${l}</a>`; }).join('')}</div></div>`;
  if (params.get('t') === 'scelles') return `<div class="top"><h1 class="title">Recherche</h1><div class="row" style="gap:8px"><a class="iconbtn" href="#/langues" aria-label="Réglages des langues">${icon('globe')}</a></div></div>
  ${typeTabs}<form class="pad" style="padding-top:12px" data-act="search"><label for="q" class="sr">Chercher un produit scellé</label><input id="q" class="search" type="search" enterkeyhint="search" autocomplete="off" placeholder="Display, ETB, booster, nom du set…" value="${esc(params.get('q') || '')}"></form>
  ${sealedResults(params)}${tabs('recherche')}`;
  return `<div class="top"><h1 class="title">Recherche${PKM ? '' : ' · ' + esc(GI.name)}</h1><div class="row" style="gap:8px">${PKM ? scanBtn() : gameSwitch()}<a class="iconbtn" href="#/langues" aria-label="Réglages des langues">${icon('globe')}</a></div></div>
  ${typeTabs}<form class="pad" style="padding-top:12px" data-act="search"><label for="q" class="sr">Chercher une carte</label><input id="q" class="search" type="search" enterkeyhint="search" autocomplete="off" placeholder="Nom, set, numéro, illustrateur…" value="${esc(params.get('q') || '')}"></form>
  <div class="pad chips" style="padding-top:12px"><a class="chip ${S.excluded.length ? 'on' : ''}" href="#/langues">${esc(langLabel)}</a><button class="chip on" data-act="cond">${esc(condLabel)}</button>${filt.map(([l, k]) => `<button class="chip on" data-act="unfilter" data-k="${k}" aria-label="Retirer le filtre ${esc(l)}">${esc(l)} ✕</button>`).join('')}</div>
  ${scanPanel()}
  ${params.get('set') && DB.sets[+params.get('set')] ? setIndexPanel(+params.get('set')) : ''}
  ${body}${tabs('recherche')}`;
}

/* ---------- Scanner une carte : photo → lecture du texte (OCR, dans le téléphone) → cartes candidates ---------- */
let scanState = null; // { status: 'lecture'|'fini'|'erreur', progress, text, results }
const scanInput = () => `<input type="file" accept="image/*" id="scanfile" hidden>`;
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
  return { nums, results: scored.filter(x => x[1] >= Math.max(3, top * 0.6)).slice(0, 30).map(x => x[0]) };
}
async function runScan(file) {
  scanState = { status: 'lecture', progress: 0, text: '', results: [] };
  if (!location.hash.startsWith('#/recherche')) location.hash = '#/recherche?scan=1'; else render();
  try {
    const [cv, w] = await Promise.all([prepImage(file), getOcr()]);
    const { data } = await w.recognize(cv);
    const m = matchScan(data.text || '');
    scanState = { status: 'fini', text: (data.text || '').replace(/\s+/g, ' ').trim().slice(0, 160), results: m.results, nums: m.nums };
  } catch (e) { scanState = { status: 'erreur', text: String(e && e.message || e) }; }
  render();
}
function scanPanel() {
  if (!scanState) return '';
  const st = scanState;
  let body;
  if (st.status === 'lecture') body = `<div class="sub">Lecture de la carte… (la première fois, l’outil de lecture se télécharge : quelques secondes)</div><div class="scan-bar"><span style="width:${Math.round((st.progress || 0) * 100)}%"></span></div>`;
  else if (st.status === 'erreur') body = `<div class="sub">La lecture n’a pas marché. Réessaie avec une photo plus nette, ou tape le nom.</div>`;
  else body = st.results.length
    ? `<div class="sub">${st.results.length > 1 ? 'Laquelle est-ce ? Les plus probables d’abord, juste en dessous.' : 'Carte reconnue, juste en dessous :'}</div>`
    : `<div class="sub">Aucune carte reconnue. Astuce : cadre la carte bien à plat, avec le numéro en bas (par exemple 65/82) net et lisible.</div>`;
  return `<div class="pad" style="margin-top:12px"><div class="panel stack" style="gap:8px"><div class="between"><b style="font-size:15px">${icon('camera', 18)} Scan de carte</b><button class="btn small" data-act="scanclose">Fermer</button></div>${body}
  ${st.text ? `<details class="small"><summary>Texte lu</summary>${esc(st.text)}</details>` : ''}
  ${st.status !== 'lecture' ? `<label class="btn small" for="scanfile" role="button" style="align-self:flex-start">Scanner une autre carte</label>` : ''}</div></div>
  ${st.status === 'fini' && st.results.length ? `<div class="list" style="margin-top:10px">${st.results.slice(0, 12).map(c => lineRow(c, false)).join('')}</div>` : ''}`;
}

/* ---------- Produits scellés (catalogue et cotes Cardmarket, data/sealed.json mis à jour chaque lundi) ---------- */
let SEALED = null, sealedLoading = null;
let sealedCol = cleanList(load('sealed', []), 'sealed'); // [{id, pid, lang, qty, paid, cur, date, note}]
const saveSealed = () => { save('sealed', sealedCol); syncSoon(); };
const CAT_FR = { 'Pokémon Booster': 'Boosters', 'Pokémon Display': 'Displays', 'Pokémon Elite Trainer Boxes': 'ETB', 'Pokémon Box Set': 'Coffrets', 'Pokémon Tins': 'Tins', 'Pokémon Blisters': 'Blisters', 'Pokémon Theme Decks': 'Decks', 'Pokémon Trainer Kits': 'Kits dresseur', 'Pokémon Lot': 'Lots', 'PCG Set': 'Sets PCG' };
const SEAL_ASIA = /\b(japanese|jp|chinese|korean|thai|indonesian|simplified|traditional)\b|^(cs|csv|cbb)\d/i;
function loadSealed() {
  if (SEALED || sealedLoading) return sealedLoading;
  sealedLoading = fetch('data/sealed.json').then(r => r.json()).then(j => {
    const items = j.items.map(([id, name, ci, added, low, trend]) => {
      const cat = j.cats[ci]; const asia = cat === 'PCG Set' || SEAL_ASIA.test(name);
      return { id, name, cat, catFr: CAT_FR[cat] || cat.replace(/^Pokémon /, ''), added, low, trend, asia, hay: norm(name + ' ' + (CAT_FR[cat] || '')) };
    });
    SEALED = { generated: j.generated, items, byId: new Map(items.map(x => [x.id, x])) }; render();
  }).catch(() => { sealedLoading = null; toast('Impossible de charger les produits scellés'); });
  return sealedLoading;
}
const sPrice = x => x.trend || x.low || null;
const sealedLangs = x => LANGS.map(l => l[0]).filter(l => x.asia ? ASIA.has(l) : !ASIA.has(l) && l !== 'es-mx' && l !== 'pt-br' && LANG[l]);
const SEAL_ICON = cat => ({ Boosters: '▭', Displays: '▦', ETB: '▣', Coffrets: '▣', Tins: '◍', Blisters: '▯', Decks: '▤' }[cat] || '▢');
function sealedRow(x, extra) {
  const p = sPrice(x);
  return `<a class="line" href="#/scelle/${x.id}"><span class="thumb seal">${SEAL_ICON(x.catFr)}</span><span class="mid"><b>${esc(x.name)}</b><span>${esc(x.catFr)}${x.asia ? ' · Asie' : ''}${x.added && x.added > '2008' ? ' · ' + x.added.slice(0, 4) : ''}${extra ? ' · ' + extra : ''}</span></span><span class="px"><b class="num">${p ? eur(p) : '—'}</b><span>${x.low ? 'dès ' + eur(x.low) : p ? 'cote' : 'pas de cote'}</span></span></a>`;
}
let sealedShown = 40;
function sealedResults(params) {
  if (!SEALED) { loadSealed(); return `<div class="pad"><div class="note">Chargement des produits scellés…</div></div>`; }
  const tokens = norm(params.get('q') || '').split(/\s+/).filter(Boolean), cat = params.get('cat');
  const ex = excluded(), asiaHidden = [...ASIA].every(l => ex.has(l)), euroHidden = LANGS.map(l => l[0]).filter(l => !ASIA.has(l)).every(l => ex.has(l));
  let res = SEALED.items.filter(x => (!cat || x.catFr === cat) && tokens.every(t => x.hay.includes(t)));
  const hid = res.filter(x => x.asia ? asiaHidden : euroHidden);
  if (!showHidden) res = res.filter(x => !(x.asia ? asiaHidden : euroHidden));
  const sorts = { pert: (a, b) => (b.added || '').localeCompare(a.added || ''), 'prix-': (a, b) => (sPrice(b) || 0) - (sPrice(a) || 0), 'prix+': (a, b) => (sPrice(a) || 1e9) - (sPrice(b) || 1e9), recent: (a, b) => (b.added || '').localeCompare(a.added || ''), ancien: (a, b) => (a.added || '9').localeCompare(b.added || '9') };
  res.sort(sorts[S.sort] || sorts.pert);
  const cats = [...new Set(Object.values(CAT_FR))];
  const qs = k => { const q = new URLSearchParams(params); k ? q.set('cat', k) : q.delete('cat'); return '#/recherche?' + q; };
  return `<div class="pad chips scroll" style="padding-top:10px"><a class="chip ${!cat ? 'on' : ''}" href="${qs('')}">Tout</a>${cats.map(k => `<a class="chip ${cat === k ? 'on' : ''}" href="${qs(k)}">${k}</a>`).join('')}</div>
  <div class="sect between" style="padding-top:14px"><b style="font-size:17px">${res.length.toLocaleString(LOCALE)} produit${res.length > 1 ? 's' : ''}</b><label class="sub">tri : <select data-act="sort" style="border:0;background:transparent;font-weight:600">${[['pert', 'plus récents'], ['prix-', 'prix décroissant'], ['prix+', 'prix croissant'], ['ancien', 'plus anciens']].map(([k, l]) => `<option value="${k}" ${S.sort === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
  ${hid.length ? `<div class="hidden-bar"><span>${showHidden ? 'Produits de langues exclues affichés.' : `${hid.length} produit${hid.length > 1 ? 's' : ''} masqué${hid.length > 1 ? 's' : ''} (langues exclues).`}</span><button class="btn small" data-act="showhidden">${showHidden ? 'Masquer' : 'Voir'}</button></div>` : ''}
  <div class="list">${res.slice(0, sealedShown).map(x => sealedRow(x)).join('')}</div>
  ${res.length > sealedShown ? `<div class="pad" style="margin-top:14px"><button class="btn full" data-act="smore">Voir plus (${(res.length - sealedShown).toLocaleString(LOCALE)} restants)</button></div>` : ''}
  <div class="pad" style="margin-top:12px"><div class="note">Cotes Cardmarket du ${fdate(SEALED.generated)} : un prix par produit, toutes langues européennes confondues (les produits asiatiques ont leur propre fiche).</div></div>`;
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
  <div class="pad"><div class="seal-hero">${SEAL_ICON(x.catFr)}<span>${esc(x.catFr)}</span></div>
  <h1 class="h1" style="margin-top:14px">${esc(x.name)}</h1>
  <div class="sub" style="margin-top:4px">${esc(x.catFr)}${x.asia ? ' · produit asiatique' : ' · édition européenne'}${x.added && x.added > '2008' ? ' · au catalogue depuis ' + x.added.slice(0, 4) : ''}</div>
  ${p ? `<p class="summary">Vaut environ <b>${eur(p)}</b>${x.low ? ` ; l’offre la moins chère sur Cardmarket est à <b>${eur(x.low)}</b>` : ''}.</p>` : '<p class="summary">Pas encore de cote pour ce produit.</p>'}</div>
  <div class="sect"><div class="small" style="font-weight:600">Langue</div></div>
  <div class="pad chips scroll">${langs.map(l => `<button class="chip ${l === lang ? 'on' : ''}" data-act="slang" data-v="${l}">${LANG[l].name}</button>`).join('')}</div>
  <div class="pad btns" style="margin-top:14px"><button class="btn primary" data-act="sadd" data-id="${x.id}" data-lang="${lang}">Ajouter à ma collection (${esc(LANG[lang].name.toLowerCase())})</button><button class="btn wishbtn${wished('sealed:' + x.id) ? ' on' : ''}" data-act="heart" data-key="sealed:${x.id}">${icon('heart', 18)} ${wished('sealed:' + x.id) ? 'Dans mes envies' : 'Envie'}</button></div>
  <div class="sect between"><h2 class="h2">Prix</h2><span class="sub">Cardmarket</span></div>
  <div class="pad stack"><div class="prices"><div><div class="lab">Cote</div><div class="val num">${eur(x.trend)}</div></div><div><div class="lab">Moins chère</div><div class="val num">${eur(x.low)}</div></div><div><div class="lab">Langue</div><div class="val" style="font-size:15px">${esc(LANG[lang].short)}</div></div></div>
  <div class="note">${x.asia ? 'Prix de ce produit asiatique sur Cardmarket.' : 'Cardmarket donne un seul prix pour toutes les langues européennes. Un produit scellé français ou allemand peut valoir plus ou moins que l’anglais.'} Pour le prix réel en ${esc(LANG[lang].name.toLowerCase())}, ouvre les offres filtrées ci-dessous. Le prix par langue calculé automatiquement arrivera avec eBay.</div></div>
  <div class="sect between"><h2 class="h2">Historique des prix</h2><span class="sub">relevé chaque matin</span></div>
  <div class="pad"><div class="panel stack" style="gap:6px" id="hist" data-cm="${x.id}" data-key=""><div class="small">Chargement de l’historique…</div></div></div>
  <div class="pad stack" style="margin-top:16px">
    <a class="btn full between" href="${cmUrl}" target="_blank" rel="noopener"><span>Offres Cardmarket en ${esc(LANG[lang].name.toLowerCase())}</span><span class="small">lien externe, sans commission</span></a>
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
    if (me && !was) { syncNow(true); }
    if (ev === 'SIGNED_OUT') me = null;
    render();
  });
  const { data } = await sb.auth.getSession(); me = data.session ? data.session.user : null;
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
      if (added) toast(added + ' élément(s) récupéré(s) depuis ton compte');
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
  if (me) return `<div class="pad"><div class="panel stack" style="gap:10px"><div class="between"><b style="font-size:15px">Mon compte</b><span class="lg" style="font-size:11px;padding:2px 8px">gratuit</span></div>
    <div class="sub">Connecté : <b>${esc(me.email || '')}</b></div>
    <div class="small">${syncing ? 'Synchronisation…' : lastSync ? 'Collection sauvegardée · ' + new Date(lastSync).toLocaleString(LOCALE, { dateStyle: 'short', timeStyle: 'short' }) : 'Pas encore synchronisée'}</div>
    <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn small" data-act="syncnow">Synchroniser</button><button class="btn small" data-act="logout">Se déconnecter</button></div>
    <div class="small"><a href="#/confidentialite">Données personnelles</a> · <a href="#" data-act="delacct">Supprimer mon compte</a></div></div></div>`;
  return `<div class="pad"><div class="panel stack" style="gap:10px"><b style="font-size:15px">Créer mon compte gratuit</b>
    <div class="sub" style="line-height:1.45">Ta collection sauvegardée et retrouvée sur ton téléphone et ton ordinateur. Pas de mot de passe : tu reçois un lien par e-mail.</div>
    ${acctSent ? `<div class="note">Lien envoyé à <b>${esc(acctSent)}</b>. Ouvre l’e-mail et touche le lien : tu reviens ici, connecté. Pense à regarder dans les indésirables.</div>` : ''}
    <form class="row" style="gap:8px" data-act="magic"><input class="search" style="flex:1;height:44px" type="email" name="email" required autocomplete="email" placeholder="ton@email.fr"><button class="btn primary" style="height:44px">Recevoir le lien</button></form>
    <div class="small">Tes cartes déjà ajoutées sont reprises dans le compte. <a href="#/confidentialite">Données personnelles</a></div></div></div>`;
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
  <h2 class="h2">Services tiers</h2><p>Images des cartes : TCGdex et pokemontcg.io (ton navigateur les charge directement). Prix : fichiers publics de Cardmarket. Taux de change : Banque centrale européenne. Les liens vers Cardmarket ou eBay ouvrent leur site, avec leurs propres règles. Tout lien partenaire est signalé.</p>
  <h2 class="h2">Responsable</h2><p>L’éditeur de CallIt!. Contact : <a href="mailto:request@callitcards.com">request@callitcards.com</a>.</p>
  <p class="small">Mise à jour : ${new Date('2026-11-24').toLocaleDateString(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' })}</p></div>${tabs('')}`;
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
  toastAction(`Ajoutée à « ${f.name} »`, 'Ranger', () => openWishSheet(key));
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
  <div class="small">Le prix max servira aux alertes (« Je cherche ») quand eBay sera branché.</div>
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
  if (!wish.items.length) return head + `<div class="pad" style="margin-top:16px"><div class="panel stack"><b>Ta liste d’envies est vide</b><div class="sub">Touche le cœur ${icon('heart', 14)} sur une carte ou un produit scellé pour l’ajouter ici. Tu pourras ensuite la ranger en dossiers et fixer un prix maximum.</div><a class="btn primary" href="#/recherche">Chercher une carte</a></div></div>${tabs('collection')}`;
  if ([...new Set(list.filter(x => x.key.startsWith('sealed:')))].length && !SEALED) loadSealed();
  const cards = list.map(x => [x, BYKEY.get(x.key)]).filter(r => r[1]), seals = list.filter(x => x.key.startsWith('sealed:'));
  const total = cards.reduce((s, [, c]) => s + (price(c) || 0), 0) + (SEALED ? seals.reduce((s, x) => { const y = SEALED.byId.get(+x.key.slice(7)); return s + (y ? sPrice(y) || 0 : 0); }, 0) : 0);
  return head + `<div class="pad chips scroll" style="margin-top:12px"><button class="chip ${!cur ? 'on' : ''}" data-act="wf" data-v="">Tout (${wish.items.length})</button>${folders.map(([f, xs]) => `<button class="chip ${cur && cur[0].id === f.id ? 'on' : ''}" data-act="wf" data-v="${f.id}">${esc(f.name)} (${xs.length})</button>`).join('')}<button class="chip" data-act="wfnew">+ Dossier</button></div>
  <div class="pad between" style="margin-top:10px"><span class="sub">${list.length} envie${list.length > 1 ? 's' : ''} · environ ${eur(total)} au total</span>${cur && cur[0].id !== 'f0' ? `<span class="row" style="gap:6px"><button class="btn small" data-act="wfren" data-v="${cur[0].id}">Renommer</button><button class="btn small" data-act="wfdel" data-v="${cur[0].id}">Supprimer</button></span>` : ''}</div>
  ${cards.length ? `<div class="grid" style="margin-top:10px">${cards.map(([x, c]) => tile(c, { meta: (price(c) ? eur(price(c)) : 'sans cote') + (x.max != null ? ' · max ' + money(x.max) : '') })).join('')}</div>` : ''}
  ${seals.length && SEALED ? `<div class="sect"><h2 class="h2">Scellés</h2></div><div class="list">${seals.map(x => { const y = SEALED.byId.get(+x.key.slice(7)); return y ? sealedRow(y, x.max != null ? 'max ' + money(x.max) : '') : ''; }).join('')}</div>` : ''}
  <div class="pad" style="margin-top:14px"><div class="note">Touche le cœur pour retirer une envie. Sur la fiche d’une carte, « Ranger » permet de choisir le dossier et un prix maximum. Bientôt : une alerte quand une annonce eBay passe sous ton prix.</div></div>${tabs('collection')}`;
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
    return head + `<a class="line artist" href="#/recherche?ill=${encodeURIComponent(a.name)}"><span class="thumb">${cimg(c)}</span><span class="mid"><b>${artistSort === 'pop' && !q ? (i + 1) + '. ' : ''}${esc(a.name)}</b><span>${F(a.n > 1 ? '{0} cartes · la plus chère : {1}' : '{0} carte · la plus chère : {1}', a.n, esc(cardName(c)))}</span></span><span class="px"><b class="num" style="font-size:14px">${price(c) != null ? eur(price(c)) : '—'}</b><span>sa carte max</span></span></a>`;
  }).join('');
  return `<div class="top">${backBtn()}<span class="sub" style="font-weight:600">Galerie</span><span style="width:44px"></span></div>
  <div class="pad"><h1 class="h1">Illustrateurs</h1><p class="sub">${list.length} artistes. Les fiches détaillées (parcours, comptes officiels vérifiés) arriveront ensuite.</p></div>
  <div class="pad" style="padding-top:10px"><label for="aq" class="sr">Chercher un illustrateur</label><input id="aq" class="search" type="search" autocomplete="off" placeholder="Chercher un illustrateur…" value="${esc(artistQ)}"></div>
  <div class="pad chips scroll" style="padding-top:12px;padding-bottom:4px">${sorts.map(([k, l]) => `<button class="chip ${artistSort === k ? 'on' : ''}" data-act="asort" data-v="${k}">${l}</button>`).join('')}</div>
  ${artistSort === 'pop' ? '<p class="pad small" style="margin:4px 0 10px">Classés selon la cote totale de leurs cartes sur Cardmarket : plus elle est haute, plus leurs cartes sont recherchées.</p>' : '<div style="height:8px"></div>'}
  <div class="list artists">${html || '<div class="note">Aucun illustrateur trouvé.</div>'}</div>
  ${total > artistShown ? `<div class="pad" style="margin-top:14px"><button class="btn full" data-act="amore">Voir plus (${total - artistShown} restants)</button></div>` : ''}${tabs('')}`;
}

/* Prix sur la fiche : cote du jour + mini-courbe des moyennes (30 j, 7 j, hier, aujourd'hui) */
function priceSection(c) {
  if (!c.p) return `<div class="sect"><h2 class="h2">Prix</h2></div><div class="pad"><div class="note">Pas encore de cote ${esc(SRC())} pour cette ${PKM ? 'carte' : 'impression'}${c.cml ? `. Sur Cardmarket, la version la moins chère de cette carte est à ${eur(c.cml)}` : ''}${c.set.reg === 'ja' ? ' (les cartes asiatiques sont moins suivies)' : ''}.</div></div>`;
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
      ${(() => { const r = setRank(c); return r && r.of >= 5 ? `<div class="small" style="margin-top:6px">Rang dans le set : ${r.rank}<sup>${r.rank === 1 ? 're' : 'e'}</sup> sur ${r.of} cartes cotées · cote médiane du set ${eur(r.median)}</div>` : ''; })()}
      <div class="small" style="margin-top:6px">${SRC() === 'Cardmarket' ? `Guide de prix Cardmarket du ${fdate(DB.generated)} : une seule cote, toutes langues et tous états confondus.` : `Prix de cette impression sur ${esc(SRC())} (marché américain), converti depuis le dollar.${c.cml ? ` Sur Cardmarket, la version la moins chère de cette carte (toutes impressions) est à ${eur(c.cml)}.` : ''}`}</div></div>
  </div>`;
}
/* Ce qui arrive : emplacements clairs, avec la source prévue */
function soon(title, text, source) {
  return `<div class="panel stack" style="gap:6px"><div class="between"><b style="font-size:15px">${title}</b><span class="lg" style="font-size:11px;padding:2px 8px">bientôt</span></div><div class="sub" style="line-height:1.45">${text}</div><div class="small">Source prévue : ${source}</div></div>`;
}
function upcomingSections(c) {
  return `<div class="sect between"><h2 class="h2">Historique des prix</h2><span class="sub">relevé chaque matin</span></div>
  <div class="pad"><div class="panel stack" style="gap:6px" id="hist" data-cm="${c.cm || ''}" data-key="${esc(c.key)}">${c.cm ? '<div class="small">Chargement de l’historique…</div>' : '<div class="small">Cette carte n’a pas de fiche Cardmarket : pas d’historique possible pour l’instant.</div>'}</div></div>
  <div class="sect"><h2 class="h2">Bientôt sur cette fiche</h2></div><div class="pad stack">
  ${soon('Dernières ventes', 'Les dernières ventes réelles, avec le prix, la langue, l’état et la date.', 'eBay (compte développeur et accès aux ventes terminées à demander)')}
  <div class="panel stack" style="gap:6px"><div class="between"><b style="font-size:15px">Prix par état et par note</b><span class="lg" style="font-size:11px;padding:2px 8px">bientôt</span></div>
    <div class="sub" style="line-height:1.45">Un prix pour chaque état et chaque note, avec un niveau de confiance : le nombre de ventes, ou « estimation » quand il y en a trop peu. Avec la population (exemplaires notés) et les chances d’obtenir un 10.</div>
    <table class="soon-t"><tr><th>État ou note</th><th>Prix</th><th>Confiance</th></tr>${['Near Mint', 'Excellent', 'Light Played', 'PSA 10', 'PSA 9', 'CGC 10'].map(x => `<tr><td>${x}</td><td>—</td><td>bientôt</td></tr>`).join('')}</table>
    <div class="small">Sources prévues : ventes eBay, PriceCharting (abonnement) et rapports de population PSA, CGC et GemRate.</div></div>
  </div>`;
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
  if (!h) { box.innerHTML = `<div class="sub" style="line-height:1.45">${intro}</div><div class="small">Premier relevé en cours de préparation : la courbe apparaîtra dans les prochains jours.</div>${cmCurve(box)}`; return; }
  const start = new Date(h.start + 'T12:00:00'), arr = h.p[cm] || [];
  HPTS = { pts: arr.map((v, i) => v == null ? null : [new Date(start.getTime() + i * 864e5), v / 100]).filter(Boolean),
    since: start.toLocaleDateString(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' }), intro, box };
  drawHist();
}
let HPTS = null, histPeriod = 30, histClean = true;
// Valeurs aberrantes : un point qui s'écarte de plus de 50 % de la médiane de ses 7 voisins (vente isolée, erreur de saisie)
function cleanSeries(pts) {
  if (pts.length < 5) return { pts, out: 0 };
  const keep = pts.filter((p, i) => { const w = pts.slice(Math.max(0, i - 3), i + 4).map(x => x[1]).sort((a, b) => a - b); const m = w[w.length >> 1]; return Math.abs(p[1] - m) <= 0.5 * m; });
  return { pts: keep, out: pts.length - keep.length };
}
function drawHist() {
  if (!HPTS || !document.body.contains(HPTS.box)) return;
  const { since, intro, box } = HPTS;
  if (HPTS.pts.length < 2) { box.innerHTML = `<div class="sub" style="line-height:1.45">${intro}</div><div class="small">${F('Relevé commencé le {0} · {1} jour enregistré. La vraie courbe apparaît dès le deuxième jour.', since, HPTS.pts.length)}</div>${cmCurve(box)}`; return; }
  const lastT = HPTS.pts[HPTS.pts.length - 1][0].getTime();
  const span = (lastT - HPTS.pts[0][0].getTime()) / 864e5;
  const periods = [[30, '1 mois'], [91, '3 mois'], [182, '6 mois'], [365, '1 an']];
  let raw = HPTS.pts.filter(p => p[0].getTime() >= lastT - histPeriod * 864e5);
  const cl = histClean ? cleanSeries(raw) : { pts: raw, out: 0 }; const pts = cl.pts.length >= 2 ? cl.pts : raw;
  const vs = pts.map(x => x[1]), up = vs[vs.length - 1] >= vs[0];
  const ch = (vs[vs.length - 1] - vs[0]) / vs[0];
  box.innerHTML = `<div class="hp">${periods.map(([n, l], i) => `<button class="chip${histPeriod === n ? ' on' : ''}" data-act="hp" data-v="${n}" ${i && span < periods[i - 1][0] ? 'disabled title="Pas encore assez de jours relevés"' : ''}>${l}</button>`).join('')}</div>
  <div class="between"><span class="sub">${pts.length} jours relevés</span><b class="num ${up ? 'gain' : 'loss'}">${(ch >= 0 ? '+' : '') + Math.round(ch * 100)} %</b></div>
  ${lineChart(pts, 'Historique de la cote')}
  <label class="small row" style="gap:8px"><input type="checkbox" data-act="hclean" ${histClean ? 'checked' : ''}> Retirer les valeurs aberrantes${histClean && cl.out ? ` (${cl.out} retirée${cl.out > 1 ? 's' : ''})` : ''}</label>
  <div class="small">Cote « tendance » Cardmarket relevée chaque matin depuis le ${since}.</div>`;
}

function cmCurve(box) {
  const c = BYKEY.get(box.dataset.key); if (!c) return '';
  const now = Date.now(), pts = [[30, 'moy. 30 j', pf(c, 'avg30')], [7, 'moy. 7 j', pf(c, 'avg7')], [1, 'hier', pf(c, 'avg1')], [0, 'auj.', pf(c, 'trend')]]
    .filter(x => x[2] > 0).map(x => [new Date(now - x[0] * 864e5), x[2], x[1]]);
  if (pts.length < 2) return '';
  return `<div class="small" style="margin-top:4px">En attendant, la tendance des 30 derniers jours selon les moyennes Cardmarket :</div>${lineChart(pts, 'Tendance sur 30 jours')}`;
}
/* Courbe sobre : hauteur fixe, trait fin, axe qui part de 0, valeur au survol */
function lineChart(pts, label) {
  const vs = pts.map(x => x[1]), mx = Math.max(...vs) * 1.08 || 1, n = pts.length;
  const X = i => n === 1 ? 50 : i / (n - 1) * 100, Y = v => 100 - v / mx * 100;
  const d = pts.map((x, i) => `${i ? 'L' : 'M'}${(X(i) * 10).toFixed(1)} ${Y(x[1]).toFixed(2)}`).join(' ');
  const up = vs[n - 1] >= vs[0], col = up ? 'var(--gain)' : 'var(--loss)';
  const data = esc(JSON.stringify(pts.map(x => [x[2] || x[0].toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' }), eur(x[1]), X(pts.indexOf(x)), Y(x[1])])));
  const fd = x => x.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' });
  return `<div class="lc" data-pts="${data}" role="img" aria-label="${esc(label)}">
    <div class="lc-max" style="top:calc(${Y(mx / 1.08).toFixed(2)}% - 16px)">${eur(mx / 1.08)}</div><div class="lc-zero">0</div>
    <svg viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true"><line x1="0" x2="1000" y1="${Y(mx / 1.08).toFixed(2)}" y2="${Y(mx / 1.08).toFixed(2)}" class="lc-grid"/><line x1="0" x2="1000" y1="100" y2="100" class="lc-base"/>
      <path d="${d} L1000 100 L0 100 Z" fill="${col}" opacity=".08"/><path d="${d}" fill="none" stroke="${col}" stroke-width="1.75" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>
    <span class="lc-dot" style="left:${X(n - 1)}%;top:${Y(vs[n - 1])}%;background:${col}"></span>
    <span class="lc-cur" hidden></span><span class="lc-tip" hidden></span>
  </div><div class="lc-x">${pts[0][2] ? pts.map(x => `<span>${x[2]}</span>`).join('') : `<span>${fd(pts[0][0])}</span><span>${fd(pts[n - 1][0])}</span>`}</div>`;
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
  const a30 = pf(c, 'avg30'), d = a30 ? (pr - a30) / a30 : null, r = setRank(c);
  let t = F('Vaut environ {0} aujourd’hui', `<b>${eur(pr)}</b>`);
  const pc = `<span class="${d >= 0 ? 'gain' : 'loss'}">${Math.abs(Math.round(d * 100))} %</span>`;
  if (d != null && Math.abs(d) >= 0.03) t += F(d >= 0 ? ', en hausse de {0} sur 30 jours' : ', en baisse de {0} sur 30 jours', pc);
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
  if (c.i != null) { const n = (artistIndex().list.find(a => a.idx.has(c.i)) || {}).n; if (n > 1) items.push(F('{0} a signé {1} cartes dans CallIt!.', esc(ill(c)), n) + ` <a href="#/recherche?ill=${encodeURIComponent(ill(c))}">${F('Voir son style')}</a>.`); }
  if (c.set.date) items.push(c.set.count ? F('Sortie le {0} dans {1}, un set de {2} cartes officielles.', fdate(c.set.date), esc(setName(c.set)), c.set.count) : F('Sortie le {0} dans {1}.', fdate(c.set.date), esc(setName(c.set))));
  if (c.langs.length > 1) items.push(F('Imprimée en {0} langues : {1}.', c.langs.length, esc(I18N ? andList(langList(c.langs).map(x => tr(x[0].toUpperCase() + x.slice(1)))) : joinFr(langList(c.langs)))));
  if (!items.length) return '';
  return `<div class="sect"><h2 class="h2">À savoir</h2></div><div class="pad"><div class="panel"><ul class="asavoir">${items.map(t => `<li>${t}</li>`).join('')}</ul></div></div>`;
}

/* ---------- Indices de prix (Cardmarket) : valeur cumulée et variation sur 30 jours ---------- */
const agg = (cards) => { let v = 0, v30 = 0, n = 0; for (const c of cards) { const t = pf(c, 'trend'), a = pf(c, 'avg30'); if (t > 0 && a > 0) { v += t; v30 += a; n++; } } return { v, ch: v30 ? v / v30 - 1 : null, n }; };
const SIDX = new Map();
function setIndex(sIdx) {
  if (SIDX.has(sIdx)) return SIDX.get(sIdx);
  const cs = CARDS.filter(c => c.s === sIdx && pf(c, 'trend') > 0 && pf(c, 'avg30') > 0);
  const top = cs.slice().sort((a, b) => pf(b, 'trend') - pf(a, 'trend')).slice(0, 3);
  const r = { full: agg(cs), top: Object.assign(agg(top), { cards: top }), set: DB.sets[sIdx], s: sIdx };
  SIDX.set(sIdx, r); return r;
}
function setIndexPanel(sIdx) {
  const x = setIndex(sIdx); if (x.full.n < 3) return '';
  return `<div class="pad" style="margin-top:12px"><div class="panel stack" style="gap:10px">
    <div class="between"><b style="font-size:15px">Indices de ce set</b><a class="small" href="#/indices">tous les indices</a></div>
    <div class="idx2"><div><div class="small">Set complet · ${x.full.n} cartes</div><div class="num" style="font-weight:700;font-size:20px">${eur(x.full.v)}</div><div class="small">${pct(x.full.ch)} sur 30 j</div></div>
    <div><div class="small">Top 3 · cartes phares</div><div class="num" style="font-weight:700;font-size:20px">${eur(x.top.v)}</div><div class="small">${pct(x.top.ch)} sur 30 j</div></div></div>
    <div class="idx3">${x.top.cards.map(c => `<a href="#/carte/${encodeURIComponent(c.key)}">${cimg(c)}<span class="small">${esc(cardName(c))} · ${eur(pf(c, 'trend'))}</span></a>`).join('')}</div>
    <div class="small" style="line-height:1.45">Le set complet additionne une carte de chaque : c’est l’indice le plus stable. Le top 3 suit les 3 cartes les plus chères : il réagit plus vite.</div>
  </div></div>`;
}
let IDX = null;
function indices() {
  if (IDX) return IDX;
  const vint = CARDS.filter(c => isVintage(c) && pf(c, 'avg30') > 0 && pf(c, 'trend') > 0).sort((a, b) => pf(b, 'avg30') - pf(a, 'avg30')).slice(0, 100);
  const bySet = new Map(), byDex = new Map();
  for (const c of CARDS) { if (c.set.reg !== 'en') continue; (bySet.get(c.s) || bySet.set(c.s, []).get(c.s)).push(c); if (c.dex) (byDex.get(c.dex) || byDex.set(c.dex, []).get(c.dex)).push(c); }
  const sets = [...bySet.values()].map(cs => Object.assign(agg(cs), { set: cs[0].set, s: cs[0].s, top: setIndex(cs[0].s).top })).filter(x => x.n >= 15);
  const pokes = [...byDex.entries()].map(([dex, cs]) => Object.assign(agg(cs), { dex, name: DB.species[dex] || cardName(cs[0]), top: cs.slice().sort((a, b) => (price(b) || 0) - (price(a) || 0))[0] })).filter(x => x.n >= 15);
  IDX = { vint: Object.assign(agg(vint), { cards: vint }), sets, pokes };
  return IDX;
}
const pct = ch => ch == null ? '—' : `<span class="${ch >= 0 ? 'gain' : 'loss'}" style="font-weight:700">${ch >= 0 ? '+' : ''}${(Math.round(ch * 1000) / 10).toLocaleString(LOCALE)} %</span>`;
let idxTab = 'vintage';
function viewIndices() {
  const I = indices();
  const tabsH = [['vintage', 'Vintage 100'], ['sets', 'Par set'], ['pokemon', 'Par Pokémon']].map(([k, l]) => `<button class="chip${idxTab === k ? ' on' : ''}" data-act="idx" data-v="${k}">${l}</button>`).join('');
  const row = (href, thumb, title, sub, v, ch) => `<a class="line" href="${href}">${thumb ? `<span class="thumb">${cimg(thumb)}</span>` : ''}<span class="mid"><b>${esc(title)}</b><span>${sub}</span></span><span class="px"><b class="num">${eur(v)}</b>${pct(ch)}</span></a>`;
  let body = '';
  if (idxTab === 'vintage') {
    body = `<div class="pad"><div class="panel stack" style="gap:6px"><div class="sub">Vintage 100</div><div class="num" style="font-weight:700;font-size:34px;letter-spacing:-.03em">${eur(I.vint.v)}</div><div>${pct(I.vint.ch)} <span class="sub">sur 30 jours</span></div>
    <div class="small" style="line-height:1.45">Les 100 cartes vintage (époque Wizards, 1999 à 2003) les plus chères sur Cardmarket, le grand marché européen. On additionne leurs cotes : si l’indice monte, le vintage monte dans son ensemble, comme un CAC 40 de la carte Pokémon.</div></div></div>
    <div class="sect"><h2 class="h2" style="font-family:var(--sans)">Les 100 cartes de l’indice</h2></div>
    <div class="list">${I.vint.cards.map(c => row('#/carte/' + encodeURIComponent(c.key), c, cardName(c), esc(setName(c.set)) + ' · ' + esc(numLabel(c)), pf(c, 'trend'), pf(c, 'trend') / pf(c, 'avg30') - 1)).join('')}</div>`;
  } else if (idxTab === 'sets') {
    const l = I.sets.slice().sort((a, b) => b.ch - a.ch);
    body = `<p class="pad small" style="margin:8px 0 0;line-height:1.45">Deux indices par set : le set complet (une carte de chaque, version anglaise) et le top 3 (ses trois cartes les plus chères), avec leur variation sur 30 jours. Touche un set pour voir ses cartes. Sets d’au moins 15 cartes cotées.</p>
    <div class="sect"><h2 class="h2" style="font-family:var(--sans)">En hausse</h2></div><div class="list">${l.slice(0, 10).map(x => row('#/recherche?set=' + x.s, x.top.cards[0], setName(x.set), year(x.set) + ' · ' + x.n + ' cartes · top 3 : ' + eur(x.top.v) + ' ' + pct(x.top.ch), x.v, x.ch)).join('')}</div>
    <div class="sect"><h2 class="h2" style="font-family:var(--sans)">En baisse</h2></div><div class="list">${l.slice(-10).reverse().map(x => row('#/recherche?set=' + x.s, x.top.cards[0], setName(x.set), year(x.set) + ' · ' + x.n + ' cartes · top 3 : ' + eur(x.top.v) + ' ' + pct(x.top.ch), x.v, x.ch)).join('')}</div>
    <div class="sect"><h2 class="h2" style="font-family:var(--sans)">Les sets les plus chers</h2></div><div class="list">${I.sets.slice().sort((a, b) => b.v - a.v).slice(0, 10).map(x => row('#/recherche?set=' + x.s, x.top.cards[0], setName(x.set), year(x.set) + ' · ' + x.n + ' cartes · top 3 : ' + eur(x.top.v) + ' ' + pct(x.top.ch), x.v, x.ch)).join('')}</div>`;
  } else {
    const l = I.pokes.slice().sort((a, b) => b.ch - a.ch);
    const pr = x => row('#/recherche?dex=' + x.dex, x.top, x.name, x.n + ' cartes cotées', x.v, x.ch);
    body = `<p class="pad small" style="margin:8px 0 0;line-height:1.45">Toutes les cartes d’un Pokémon (versions anglaises) additionnées, et leur variation sur 30 jours. Pokémon ayant au moins 15 cartes cotées.</p>
    <div class="sect"><h2 class="h2" style="font-family:var(--sans)">En hausse</h2></div><div class="list">${l.slice(0, 10).map(pr).join('')}</div>
    <div class="sect"><h2 class="h2" style="font-family:var(--sans)">En baisse</h2></div><div class="list">${l.slice(-10).reverse().map(pr).join('')}</div>
    <div class="sect"><h2 class="h2" style="font-family:var(--sans)">Les plus cotés</h2></div><div class="list">${I.pokes.slice().sort((a, b) => b.v - a.v).slice(0, 10).map(pr).join('')}</div>`;
  }
  return `<div class="top">${backBtn()}<span class="title" style="font-size:20px">Indices de prix</span><span></span></div>
  <div class="pad"><div class="chips scroll">${tabsH}</div></div>${body}
  <div class="pad" style="margin-top:14px"><div class="note">Calculé sur le guide de prix Cardmarket du ${fdate(DB.generated)} (cote tendance comparée à la moyenne sur 30 jours). Avec le relevé quotidien, chaque indice aura bientôt sa propre courbe.</div></div>
  ${tabs('')}`;
}

/* Fiche carte */
function viewCard(key, params) {
  const c = BYKEY.get(key);
  if (!c) return `<div class="top">${backBtn()}</div><div class="pad"><div class="note">Cette carte n'existe plus dans la base. Elle a peut-être changé de numéro.</div></div>${tabs('')}`;
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
  const ownedHtml = owned.length ? `<div class="sect between"><h2 class="h2">Dans ma collection</h2><span class="sub">${owned.reduce((s, it) => s + (it.qty || 1), 0)} exemplaire(s)</span></div><div class="list">${owned.map(it => `<div class="line"><span class="mid"><b>${esc(tr(LANG[it.lang] ? LANG[it.lang].name : it.lang))} · ${it.grader ? esc(it.grader + ' ' + (it.grade || '')) : esc(tr('Brute')) + ' · ' + esc((CONDS.find(x => x[0] === it.cond) || ['', '—'])[1])}</b><span>${it.qty > 1 ? it.qty + ' × · ' : ''}${F('payée {0}', it.paid != null ? money(it.paid, it.cur) : '—')}${it.date ? ' · ' + esc(it.date) : ''}${it.note ? ' · ' + esc(it.note) : ''}</span></span><button class="btn small" data-act="edit" data-id="${it.id}">Modifier</button></div>`).join('')}</div>` : '';
  return `<div class="top">${backBtn()}${faceSwitch()}</div>
  <div class="pad"><div class="fiche-img">${cimg(c, { big: true, eager: true, lang: wantLang, force: params.get('img') || undefined })}</div>
  ${isVintage(c) && c.langs.length > 1 ? `<div class="small" style="text-align:center;margin-top:8px">${params.get('img') ? `<a href="#/carte/${encodeURIComponent(c.key)}">Revenir à l'image nette (anglaise)</a>` : `Image anglaise, plus nette. Voir l'image ${c.langs.filter(l => l !== 'en').slice(0, 3).map(l => `<a href="#/carte/${encodeURIComponent(c.key)}?img=${l}">${LANG[l].short}</a>`).join(' · ')} (souvent une photo)`}</div>` : ''}
  <div style="margin-top:16px"><h1 class="h1">${esc(cardName(c))}</h1>
  <div class="sub" style="margin-top:4px">${c.set.reg === 'ja' && c.n.ja && c.n.ja !== cardName(c) ? esc(c.n.ja) + ' · ' : ''}<a href="#/recherche?set=${c.s}">${esc(setName(c.set))}</a> · ${esc(numLabel(c))}${year(c.set) ? ' · ' + year(c.set) : ''}${rarFr(c) ? ' · ' + esc(rarFr(c)) : ''}${c.f & 2 ? ' · existe aussi en 1re édition' : ''}</div>
  ${ill(c) ? `<div class="sub">illus. <a href="#/recherche?ill=${encodeURIComponent(ill(c))}">${esc(ill(c))}</a></div>` : ''}
  ${summary(c)}
  ${langChips(c)}</div></div>
  <div class="pad btns" style="margin-top:16px"><button class="btn primary" data-act="add" data-key="${esc(c.key)}">Ajouter à ma collection</button><button class="btn wishbtn${wished(c.key) ? ' on' : ''}" data-act="heart" data-key="${esc(c.key)}" aria-pressed="${!!wished(c.key)}">${icon('heart', 18)} ${wished(c.key) ? 'Dans mes envies' : 'Envie'}</button></div>
  ${wished(c.key) ? `<div class="pad small" style="margin-top:6px">Dans « ${esc((wish.folders.find(f => f.id === wished(c.key).folder) || {}).name || '')} »${wished(c.key).max != null ? ' · max ' + money(wished(c.key).max) : ''} · <a href="#" data-act="wishsheet" data-key="${esc(c.key)}">Ranger / prix max</a></div>` : ''}
  <div class="pad" style="margin-top:12px"><a class="btn full" href="#/centrage?carte=${encodeURIComponent(c.key)}">${icon('ruler', 18)} ${F('Mesurer le centrage')}</a></div>
  ${authGuide(c)}
  ${c.x ? `<div class="pad" style="margin-top:12px"><div class="note">Carte reprise du catalogue Cardmarket : nom, cote et lien direct. L'image et les détails arriveront quand une autre source les aura.</div></div>` : neighbours(c)}
  ${priceBlock}
  ${cmOffers(c, langsSel)}
  ${ownedHtml}
  <div class="pad stack" style="margin-top:16px">
    <label class="panel setrow" style="border-bottom:0"><span style="font-size:14px;font-weight:600">N'importe quelle langue me va pour cette carte</span><input type="checkbox" data-act="anylang" data-key="${esc(c.key)}" ${anyLang.has(c.key) ? 'checked' : ''}></label>
    <a class="extlink" href="${ebayUrl}" target="_blank" rel="noopener"><b>Chercher sur eBay.${esc(ebayDom)}</b><span class="small">lien externe, sans commission</span></a>
  </div>
  ${c.x ? '' : `<div class="sect"><h2 class="h2">Noms selon la langue</h2></div><div class="pad"><div class="panel" style="padding-top:4px;padding-bottom:4px">${names || '<div class="sub">—</div>'}</div></div>`}
  ${samePoke.length ? `<div class="sect between"><h2 class="h2">${F('Autres versions de {0}', esc(speciesFr(c) || cardName(c)))}</h2><a class="sub" href="#/recherche?dex=${c.dex}">tout voir</a></div><div class="pad chips scroll" style="padding-bottom:10px">${[['prix-', 'Prix ↓'], ['prix+', 'Prix ↑'], ['recent', 'Plus récentes'], ['ancien', 'Plus anciennes']].map(([k, l]) => `<button class="chip${verSort === k ? ' on' : ''}" data-act="vsort" data-v="${k}">${l}</button>`).join('')}</div><div class="hrow versions">${samePoke.map(x => tile(x, { meta: (verSort.startsWith('prix') ? (price(x) ? eur(price(x)) : 'sans cote') : year(x.set)) + ' · ' + setName(x.set) })).join('')}</div>` : ''}
  ${sameIll.length ? `<div class="sect between"><h2 class="h2">Du même illustrateur</h2><a class="sub" href="#/recherche?ill=${encodeURIComponent(ill(c))}">tout voir</a></div><div class="hrow">${sameIll.map(x => tile(x)).join('')}</div>` : ''}
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
/* Collection (Galerie) et Portefeuille (Marché) */
let groupBy = GAME === 'pkm' || GAME === 'mtg' ? 'ill' : 'set';
function viewCollection(params) {
  const minR = COND_RANK[S.minCond];
  const condFilter = params.get('etat') === 'tous' ? null : S.minCond;
  const items = collection.map(it => ({ it, c: BYKEY.get(it.key) })).filter(x => x.c && (!condFilter || x.it.grader || COND_RANK[x.it.cond] <= minR));
  const hiddenByCond = collection.length - items.length;
  const head = `<div class="top"><h1 class="title">${G() ? 'Ma collection' : 'Portefeuille'}</h1>${faceSwitch()}</div>${colTabs('col')}`;
  if (!collection.length && sealedCol.length) return head + mySealedBlock() + `<div class="pad">${importBox()}</div>${tabs('collection')}`;
  if (!collection.length) {
    return head + `<div class="pad" style="margin-top:16px"><div class="panel stack"><b>Ta collection est vide</b><div class="sub">Cherche une carte, ouvre sa fiche, puis « Ajouter à ma collection ». Tes cartes restent sur cet appareil ; pense à les exporter de temps en temps (Réglages).</div><a class="btn primary" href="#/recherche">Chercher une carte</a></div>${importBox()}</div>${tabs('collection')}`;
  }
  const qty = items.reduce((s, x) => s + (x.it.qty || 1), 0);
  const nIll = new Set(items.map(x => x.c.i)).size, nLang = new Set(items.map(x => x.it.lang)).size;
  const condChip = `<a class="chip ${condFilter ? 'on' : ''}" href="#/collection${condFilter ? '?etat=tous' : ''}">${condFilter ? 'État : ' + CONDS[minR][1] + ' et mieux' : 'Tous les états'}</a>`;
  const condNote = hiddenByCond && condFilter ? `<div class="pad small" style="margin-top:6px">${hiddenByCond} carte(s) en dessous de cet état masquée(s) · <a href="#/collection?etat=tous">voir tout</a></div>` : '';
  if (!G()) {
    const p = portfolio(); const diff = p.value - p.paid;
    const rows = items.map(({ it, c }) => { const v = it.grader ? null : toUser(price(c)); return { it, c, v, g: v != null && it.paid != null ? (v - it.paid) * (it.qty || 1) : null }; }).sort((a, b) => (b.v || 0) * (b.it.qty || 1) - (a.v || 0) * (a.it.qty || 1));
    return head + `<div class="pad" style="padding-top:12px"><div class="sub">${p.n} cartes · valeur estimée</div><div class="num" style="font-weight:700;font-size:36px;letter-spacing:-.03em">${money(p.value)}</div>
    <div class="row" style="gap:18px;margin-top:4px"><div><div class="small">Payé</div><b class="num">${money(p.paid)}</b></div><div><div class="small">Plus-value</div><b class="num ${diff >= 0 ? 'gain' : 'loss'}">${diff >= 0 ? '+' : ''}${money(diff)}</b></div></div>
    ${p.graded ? `<div class="small" style="margin-top:6px">${p.graded} carte(s) gradée(s) comptée(s) à leur prix payé : les cotes des gradées arriveront avec PriceCharting.</div>` : ''}</div>
    <div class="pad chips" style="margin-top:14px">${condChip}</div>${condNote}
    <div class="list" style="margin-top:12px">${rows.map(({ it, c, v, g }) => `<a class="line" href="#/carte/${encodeURIComponent(c.key)}?lang=${encodeURIComponent(it.lang)}"><span class="thumb">${cimg(c, { lang: it.lang })}</span><span class="mid"><b>${esc(cardName(c))}</b><span>${esc(LANG[it.lang] ? LANG[it.lang].short : it.lang)} · ${it.grader ? esc(it.grader + ' ' + (it.grade || '')) : esc(it.cond)} · ${esc(setName(c.set))}${(it.qty || 1) > 1 ? ' · ' + it.qty + ' ×' : ''}</span></span><span class="px"><b class="num">${v != null ? money(v * (it.qty || 1)) : '—'}</b><span class="${g == null ? '' : g >= 0 ? 'gain' : 'loss'}" style="font-weight:600">${g == null ? (it.grader ? 'cote gradée à venir' : 'payé ?') : (g >= 0 ? '+' : '') + money(g)}</span></span></a>`).join('')}</div>
    ${mySealedBlock()}
    <div class="pad" style="margin-top:14px"><div class="note">Valeur brute = cote ${esc(SRC())}${SRC() === 'Cardmarket' ? ' (toutes langues et états confondus)' : ''}, convertie en ${esc(userCur())}.</div></div>${tabs('collection')}`;
  }
  // Galerie : regroupements
  const groups = new Map();
  const gk = ({ it, c }) => groupBy === 'ill' ? (ill(c) || 'Illustrateur inconnu') : groupBy === 'poke' ? (speciesFr(c) || cardName(c)) : groupBy === 'set' ? setName(c.set) : (LANG[it.lang] ? LANG[it.lang].name : it.lang);
  for (const x of items) { const k = gk(x); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(x); }
  const sorted = [...groups].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  // Avancement par set (sets les plus remplis)
  const bySet = new Map(); for (const { c } of items) { if (!bySet.has(c.s)) bySet.set(c.s, new Set()); bySet.get(c.s).add(c.num); }
  const prog = [...bySet].map(([s, nums]) => ({ s: DB.sets[s], si: s, have: nums.size })).filter(x => x.s.count).sort((a, b) => b.have / b.s.count - a.have / a.s.count).slice(0, 2).map(x => {
    const missing = CARDS.filter(c => c.s === x.si && !bySet.get(x.si).has(c.num));
    const cost = missing.reduce((s, c) => s + (price(c) || 0), 0), priced = missing.filter(c => price(c) != null).length;
    return `<a class="panel stack" style="gap:8px;text-decoration:none;margin-top:12px" href="#/recherche?set=${x.si}"><div class="between"><b style="font-size:14px">${esc(setName(x.s))}</b><span class="sub">${x.have} sur ${x.s.count}</span></div><span class="bar"><span style="width:${Math.min(100, Math.round(x.have / x.s.count * 100))}%"></span></span>${missing.length ? `<span class="sub">Les ${missing.length} manquantes coûtent ~${eur(cost)} à la cote Cardmarket${priced < missing.length ? ` (${missing.length - priced} sans cote)` : ''}.</span>` : '<span class="sub">Set complet !</span>'}</a>`;
  }).join('');
  const tabsG = [...(DB.ills.length ? [['ill', 'Illustrateurs']] : []), ...(PKM ? [['poke', 'Pokémon']] : []), ['set', 'Sets'], ['lang', 'Langues']];
  return head + `<div class="pad sub" style="margin-top:2px">${qty} carte${qty > 1 ? 's' : ''} · ${nIll} illustrateur${nIll > 1 ? 's' : ''} · ${nLang} langue${nLang > 1 ? 's' : ''}</div>
  <div class="pad chips scroll" style="margin-top:14px" role="tablist" aria-label="Ranger par">${tabsG.map(([k, l]) => `<button class="chip ${groupBy === k ? 'on' : ''}" role="tab" aria-selected="${groupBy === k}" data-act="group" data-v="${k}">${l}</button>`).join('')}${condChip}</div>${condNote}
  ${sorted.map(([k, xs]) => `<div class="sect between"><h2 class="h2">${esc(k)}</h2><span class="sub">${xs.length} carte${xs.length > 1 ? 's' : ''}</span></div><div class="grid">${xs.map(({ it, c }) => tile(c, { lang: it.lang, badge: LANG[it.lang] ? LANG[it.lang].short : it.lang, meta: `${setName(c.set)} · ${it.grader ? it.grader + ' ' + (it.grade || '') : it.cond}` })).join('')}</div>`).join('')}
  ${mySealedBlock()}
  <div class="pad">${prog}${importBox()}</div>${tabs('collection')}`;
}
function importBox() {
  return `<div style="margin-top:12px;border:1.5px dashed var(--field-line);border-radius:16px;padding:12px 14px" class="stack"><b style="font-size:14px">Sauvegarder ou importer</b><div class="sub">Export et import d'une sauvegarde CallIt! (fichier). L'import depuis Collectr ou PriceCharting viendra ensuite : tu confirmeras les cartes douteuses avant l'ajout.</div><div class="row" style="flex-wrap:wrap"><button class="btn small" data-act="export">Exporter ma collection</button><label class="btn small">Importer une sauvegarde<input type="file" accept="application/json,.json" data-act="import" class="sr"></label></div></div>`;
}

/* Réglages */
function viewSettings() {
  const cur = userCur();
  const curs = [...new Set(COUNTRIES.map(c => c[2]))];
  return `<div class="top"><h1 class="title">Profil et réglages</h1>${faceSwitch()}</div>
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
   <label class="setrow"><span style="font-weight:600;font-size:14px">Devise des prix</span><select data-act="set" data-k="currency"><option value="auto" ${S.currency === 'auto' ? 'selected' : ''}>Selon le pays (${(COUNTRY[S.country] || COUNTRY.FR).cur})</option>${curs.map(c => `<option value="${c}" ${S.currency === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
   <div class="setrow small">${cur === 'EUR' ? 'Les cotes Cardmarket sont en euros.' : `1 € = ${rate(cur) ? rate(cur).toLocaleString(LOCALE, { maximumFractionDigits: 4 }) + ' ' + cur : '?'} · ${RATES.approx ? 'taux approximatif (mise à jour BCE à la prochaine connexion)' : 'taux BCE du ' + fdate(RATES.date)}`}</div>
  </div></div>
  <div class="sect"><div class="small" style="font-weight:600">Cartes</div></div>
  <div class="pad"><div class="panel" style="padding-top:2px;padding-bottom:2px">
   <a class="setrow" href="#/langues" style="text-decoration:none"><span><b style="font-size:14px">Langues des cartes</b><div class="small">${S.excluded.length ? S.excluded.length + ' exclue(s) : ' + esc(joinFr(langList(S.excluded))) : 'Toutes affichées'}</div></span>${icon('globe')}</a>
   <label class="setrow"><span style="font-weight:600;font-size:14px">Noms des cartes en</span><select data-act="set" data-k="nameLang">${LANGS.map(([c, n]) => `<option value="${c}" ${S.nameLang === c ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
   <label class="setrow"><span style="font-weight:600;font-size:14px">État minimum</span><select data-act="set" data-k="minCond">${CONDS.map(([c, n]) => `<option value="${c}" ${S.minCond === c ? 'selected' : ''}>${n}${c === 'PO' ? '' : ' et mieux'}</option>`).join('')}</select></label>
  </div></div>
  <div class="sect"><div class="small" style="font-weight:600">Mes données</div></div>
  <div class="pad stack"><div class="note">Ta collection est enregistrée sur cet appareil uniquement (pas encore de compte ni de cloud). Exporte-la pour la garder en lieu sûr ou la passer sur un autre appareil.</div>
   <div class="row" style="flex-wrap:wrap"><button class="btn small" data-act="export">Exporter ma collection</button><label class="btn small">Importer une sauvegarde<input type="file" accept="application/json,.json" data-act="import" class="sr"></label><button class="btn small" data-act="wipe">Tout effacer</button></div>
   <div class="small" style="margin-top:10px">${PKM ? `Données des cartes : TCGdex (fiches et images) et guide de prix public Cardmarket du ${fdate(DB.generated)}. ${CARDS.length.toLocaleString(LOCALE)} cartes. CallIt! n'est pas affilié à Nintendo, The Pokémon Company ni Cardmarket.` : `${esc(DB.credits || '')} ${DB.priceSource === 'Cardmarket' ? 'Prix : guide de prix public Cardmarket du ' + fdate(DB.generated) + '.' : ''} ${CARDS.length.toLocaleString(LOCALE)} cartes. CallIt! n'est affilié à aucun éditeur de jeu ni à Cardmarket.`}</div>
  </div>${tabs('reglages')}`;
}
function viewLangs() {
  const ex = excluded();
  const counts = {}; for (const c of CARDS) for (const l of c.langs) counts[l] = (counts[l] || 0) + 1;
  return `<div class="top">${backBtn()}<span class="sub" style="font-weight:600">Réglages</span><span style="width:44px"></span></div>
  <div class="pad"><h1 class="h1">Langues des cartes</h1><p class="sub" style="font-size:14px;margin:8px 0 0">Les langues exclues sont masquées des résultats. Elles restent consultables à tout moment avec « voir ».</p></div>
  <div class="sect small" style="font-weight:600;padding-top:16px">${ex.size ? ex.size + ' langue' + (ex.size > 1 ? 's' : '') + ' exclue' + (ex.size > 1 ? 's' : '') : 'Toutes les langues sont affichées'}</div>
  <div class="pad"><div class="panel" style="padding-top:0;padding-bottom:0">${LANGS.map(([c, n]) => { const off = ex.has(c); const note = c === S.nameLang ? 'Langue des noms' : c === 'it' && S.country === 'IT' ? 'Ton pays' : ASIA.has(c) ? ASIA_NOTE : ''; return `<div class="setrow"><div><div style="font-weight:600;font-size:15px;${off ? 'color:var(--muted2)' : ''}">${n}</div><div class="small">${note ? note + ' · ' : ''}${(counts[c] || 0).toLocaleString(LOCALE)} cartes</div></div><button class="toggle ${off ? 'off' : ''}" data-act="lang" data-v="${c}" aria-label="${off ? 'Afficher' : 'Exclure'} ${n}">${off ? 'Exclue' : 'Affichée'}</button></div>`; }).join('')}
  <div class="setrow"><div><div style="font-weight:600;font-size:15px;color:var(--muted2)">Néerlandais, polonais</div><div class="small">Pas encore de fiches de cartes dans ces langues (à compléter)</div></div></div></div></div>
  <div class="sect small" style="font-weight:600">Où appliquer l'exclusion</div>
  <div class="pad"><div class="panel" style="padding-top:0;padding-bottom:0">
   <label class="setrow"><span style="font-size:14px;font-weight:600">Recherche et Galerie</span><input type="checkbox" data-act="exclsearch" ${S.exclSearch ? 'checked' : ''}></label>
   <div class="setrow"><span style="font-size:14px;font-weight:600;color:var(--muted2)">Veille eBay et notifications</span><span class="small">avec l'API eBay</span></div></div>
  <div class="note" style="margin-top:14px">Une exception pour une carte précise se fait depuis sa fiche : « N'importe quelle langue me va pour cette carte ». Une carte n'est masquée que si toutes ses langues sont exclues.</div></div>${tabs('reglages')}`;
}

/* ---------- Formulaire d'ajout / modification ---------- */
function openItemSheet(key, id) {
  const c = BYKEY.get(key); const it = id ? collection.find(x => x.id === id) : null; if (!c) return;
  const langs = c.langs.length ? c.langs : [c.set.reg === 'en' ? 'en' : 'ja'];
  const others = LANGS.map(l => l[0]).filter(l => !langs.includes(l) && (c.set.reg === 'en' ? !ASIA.has(l) : ASIA.has(l)));
  const defLang = it ? it.lang : prefLang(c);
  const d = document.createElement('dialog'); d.className = 'sheet';
  d.innerHTML = `<form class="sheet-in" method="dialog"><div class="between"><b style="font-size:17px">${esc(cardName(c))}</b><span class="sub">${esc(setName(c.set))} · ${esc(numLabel(c))}</span></div>
  <label class="field">Langue de mon exemplaire<select name="lang">${langs.map(l => `<option value="${l}" ${l === defLang ? 'selected' : ''}>${LANG[l].name}</option>`).join('')}${others.length ? `<optgroup label="Autres langues">${others.map(l => `<option value="${l}" ${l === defLang ? 'selected' : ''}>${LANG[l].name}</option>`).join('')}</optgroup>` : ''}</select></label>
  <div class="row"><label class="field" style="flex:1">Brute ou gradée<select name="grader"><option value="">Brute</option>${GRADERS.map(g => `<option ${it && it.grader === g ? 'selected' : ''}>${g}</option>`).join('')}</select></label><label class="field" style="flex:1" data-show="graded">Note<input name="grade" inputmode="decimal" placeholder="ex. 9" value="${esc(it ? it.grade || '' : '')}"></label></div>
  <label class="field" data-show="raw">État<select name="cond">${CONDS.map(([k, n]) => `<option value="${k}" ${(it ? it.cond : 'NM') === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
  <div class="row"><label class="field" style="flex:1">Prix payé (${esc(userCur())})<input name="paid" inputmode="decimal" placeholder="ex. 3,40" value="${it && it.paid != null ? String(it.paid).replace('.', ',') : ''}"></label><label class="field" style="width:96px">Quantité<input name="qty" type="number" min="1" max="999" value="${it ? it.qty || 1 : 1}"></label></div>
  <label class="field">Date d'achat<input name="date" type="date" value="${esc(it ? it.date || '' : new Date().toISOString().slice(0, 10))}"></label>
  <label class="field">Note (facultatif)<input name="note" maxlength="140" value="${esc(it ? it.note || '' : '')}" placeholder="ex. achetée à Rome, Sccards"></label>
  <div class="btns">${it ? '<button class="btn" value="delete">Retirer</button>' : '<button class="btn" value="cancel">Annuler</button>'}<button class="btn primary" value="ok">${it ? 'Enregistrer' : 'Ajouter'}</button></div></form>`;
  document.body.appendChild(d);
  const f = d.querySelector('form');
  const sync = () => { const g = !!f.grader.value; f.querySelector('[data-show="graded"]').style.display = g ? '' : 'none'; f.querySelector('[data-show="raw"]').style.display = g ? 'none' : ''; };
  f.grader.addEventListener('change', sync); sync();
  d.addEventListener('close', () => {
    const v = d.returnValue;
    if (v === 'ok') {
      const paid = parseFloat(String(f.paid.value).replace(/\s/g, '').replace(',', '.'));
      const rec = { id: it ? it.id : Date.now().toString(36) + Math.random().toString(36).slice(2, 6), key, lang: f.lang.value, cond: f.cond.value, grader: f.grader.value || '', grade: f.grader.value ? f.grade.value.trim() : '', qty: Math.max(1, parseInt(f.qty.value, 10) || 1), paid: isNaN(paid) ? null : paid, cur: userCur(), date: f.date.value, note: f.note.value.trim() };
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
  <div class="note">Les prix par état arriveront avec les annonces eBay (l'état est un champ de l'annonce). Pour l'instant, l'état choisi filtre ta collection et les liens Cardmarket.</div></form>`;
  document.body.appendChild(d);
  d.addEventListener('close', () => { if (COND_RANK[d.returnValue] != null) { S.minCond = d.returnValue; saveS(); render(); } d.remove(); });
  d.showModal();
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
  d.innerHTML = `<form class="sheet-in" method="dialog"><b style="font-size:17px">${esc(question)}</b><div class="btns"><button class="btn" value="cancel">Annuler</button><button class="btn primary" value="ok">${esc(okLabel)}</button></div></form>`;
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
  if (a === 'welcome') { welcomeFace = el.dataset.v; window.scrollTo(0, 0); render(); }
  else if (a === 'wback') { welcomeFace = null; render(); }
  else if (a === 'wdone') { S.face = welcomeFace || 'galerie'; welcomeFace = null; saveS(); applyTheme(); location.hash = '#/'; render(); window.scrollTo(0, 0); }
  else if (a === 'face') { S.face = el.dataset.v; saveS(); applyTheme(); render(); }
  else if (a === 'theme') { S.theme = el.dataset.v; saveS(); applyTheme(); render(); }
  else if (a === 'back') { if (navDepth > 0) { goingBack = true; history.back(); } else location.hash = '#/'; }
  else if (a === 'more') { shown += 60; render(); }
  else if (a === 'showhidden') { showHidden = !showHidden; render(); }
  else if (a === 'cond') openCondSheet();
  else if (a === 'add') openItemSheet(el.dataset.key);
  else if (a === 'edit') { const it = collection.find(x => x.id === el.dataset.id); if (it) openItemSheet(it.key, it.id); }
  else if (a === 'group') { groupBy = el.dataset.v; render(); }
  else if (a === 'asort') { artistSort = el.dataset.v; artistShown = 30; render(); }
  else if (a === 'scanclose') { scanState = null; const { q } = parseHash(); if (q.get('scan')) { q.delete('scan'); location.hash = '#/recherche' + (q.toString() ? '?' + q : ''); } else render(); }
  else if (a === 'heart') { e.preventDefault(); e.stopPropagation(); toggleWish(el.dataset.key); }
  else if (a === 'deckwish') { e.preventDefault(); deckWish(el.dataset.id); }
  else if (a === 'ctrside') { CTR.side = el.dataset.v; render(); }
  else if (a === 'ctrsel') { CTR.sel = +el.dataset.v; render(); }
  else if (a === 'ctrnudge') { if (CTR.L) { CTR.L[CTR.sel] = Math.max(0, Math.min(100, CTR.L[CTR.sel] + (+el.dataset.v) * 0.05)); render(); } }
  else if (a === 'deckcopy') { e.preventDefault(); copyMetaDeck(el.dataset.id); }
  else if (a === 'mydeckedit') { e.preventDefault(); deckEditId = el.dataset.id; render(); }
  else if (a === 'mydeckcopy') { e.preventDefault(); const d = myDecks.find(x => x.id === el.dataset.id); if (d) navigator.clipboard.writeText(deckText(d)).then(() => toast(F('Liste copiée')), () => toast(F('Copie impossible'))); }
  else if (a === 'mydeckdel') { e.preventDefault(); const d = myDecks.find(x => x.id === el.dataset.id); if (d) ask(F('Supprimer le deck « {0} » ?', d.name), F('Supprimer'), () => { myDecks = myDecks.filter(x => x !== d); markDeleted(d.id, 'deck'); saveDecks(); location.hash = '#/'; }); }
  else if (a === 'mydeckwish') { e.preventDefault(); myDeckWish(el.dataset.id); }
  else if (a === 'wishsheet') { e.preventDefault(); openWishSheet(el.dataset.key); }
  else if (a === 'wf') { wishFolder = el.dataset.v; render(); }
  else if (a === 'wfnew') { const n = prompt0('Nom du dossier', '', v => { const id = 'f' + Date.now().toString(36); wish.folders.push({ id, name: v }); wishFolder = id; saveWish(); render(); }); void n; }
  else if (a === 'wfren') { const f = wish.folders.find(x => x.id === el.dataset.v); if (f) prompt0('Nouveau nom', f.name, v => { f.name = v; saveWish(); render(); }); }
  else if (a === 'wfdel') { const f = wish.folders.find(x => x.id === el.dataset.v); if (f) ask(`Supprimer le dossier « ${f.name} » ? Ses envies vont dans « Mes envies ».`, 'Supprimer', () => { wish.items.forEach(x => { if (x.folder === f.id) x.folder = 'f0'; }); wish.folders = wish.folders.filter(x => x !== f); markDeleted(f.id, 'folder'); wishFolder = ''; saveWish(); render(); }); }
  else if (a === 'bannerclose') { save('bannerClosedAt', collection.length + sealedCol.length); render(); }
  else if (a === 'syncnow') syncNow(true);
  else if (a === 'logout') { if (sb) sb.auth.signOut().then(() => { me = null; toast('Déconnecté. Ta collection reste sur cet appareil.'); render(); }); }
  else if (a === 'delacct') { e.preventDefault(); ask('Supprimer ton compte et ta collection en ligne ? La collection reste sur cet appareil.', 'Supprimer', async () => { const { error } = await sb.rpc('supprimer_mon_compte'); if (error) { toast('Suppression impossible, réessaie'); return; } await sb.auth.signOut(); me = null; lastSync = null; save('lastSync', null); toast('Compte supprimé'); render(); }); }
  else if (a === 'slang') { sealedLang = el.dataset.v; render(); }
  else if (a === 'sadd') openSealedSheet(el.dataset.id, el.dataset.lang);
  else if (a === 'sdel') ask('Retirer ce produit de ta collection ?', 'Retirer', () => { sealedCol = sealedCol.filter(x => x.id !== el.dataset.id); markDeleted(el.dataset.id, 'sealed'); saveSealed(); render(); });
  else if (a === 'smore') { sealedShown += 40; render(); }
  else if (a === 'mall') { const y = window.scrollY; moversAll[el.dataset.v] = !moversAll[el.dataset.v]; render(); window.scrollTo(0, y); }
  else if (a === 'gosearch') { focusSearch = true; }
  else if (a === 'cmcond') { const y = window.scrollY; cmCond = el.dataset.v; render(); window.scrollTo(0, y); }
  else if (a === 'vsort') { const y = window.scrollY; verSort = el.dataset.v; render(); window.scrollTo(0, y); }
  else if (a === 'idx') { idxTab = el.dataset.v; render(); }
  else if (a === 'hp') { histPeriod = +el.dataset.v; drawHist(); }
  else if (a === 'amore') { artistShown += 30; render(); }
  else if (a === 'lang') { const v = el.dataset.v; S.excluded = S.excluded.includes(v) ? S.excluded.filter(x => x !== v) : [...S.excluded, v]; saveS(); render(); }
  else if (a === 'unfilter') { const { q } = parseHash(); q.delete(el.dataset.k); location.hash = '#/recherche' + (q.toString() ? '?' + q : ''); }
  else if (a === 'export') exportCol();
  else if (a === 'wipe') ask('Effacer ta collection et tes réglages sur cet appareil ?', 'Tout effacer', () => { try { Object.keys(localStorage).filter(k => k.startsWith(STORE) || k === 'callit.anthropicKey' || k === 'callit.liveIA').forEach(k => localStorage.removeItem(k)); } catch (e) {} location.hash = '#/'; location.reload(); });
});
document.addEventListener('change', e => {
  if (e.target.id === 'ctrfile' && e.target.files[0]) { const f = e.target.files[0]; e.target.value = ''; ctrLoad(f); return; }
  if (e.target.id === 'scanfile' && e.target.files[0]) { const f = e.target.files[0]; e.target.value = ''; runScan(f); return; }
  const el = e.target; const a = el.dataset && el.dataset.act; if (!a) return;
  if (a === 'game') { S.game = el.value; saveS(); location.hash = '#/'; location.reload(); }
  else if (a === 'sort') { S.sort = el.value; saveS(); shown = 60; render(); }
  else if (a === 'uilang') { S.ui = el.value; S.nameLang = el.value; saveS(); location.reload(); }
  else if (a === 'set') { S[el.dataset.k] = el.value; saveS(); render(); }
  else if (a === 'exclsearch') { S.exclSearch = el.checked; saveS(); }
  else if (a === 'anylang') { el.checked ? anyLang.add(el.dataset.key) : anyLang.delete(el.dataset.key); save('anyLang', [...anyLang]); toast(el.checked ? 'Cette carte s\'affichera dans toutes les langues' : 'Exception retirée'); }
  else if (a === 'import') importCol(el.files[0]);
  else if (a === 'hclean') { histClean = el.checked; drawHist(); }
});
let searchT;
document.addEventListener('input', e => {
  if (e.target.id === 'aq') { clearTimeout(searchT); searchT = setTimeout(() => { artistQ = e.target.value; artistShown = 30; render(true); }, 150); return; }
  if (e.target.id === 'homeq') { const v = e.target.value; if (v.trim()) { focusSearch = true; location.hash = '#/recherche?q=' + encodeURIComponent(v); } return; }
  if (e.target.id !== 'q') return;
  clearTimeout(searchT);
  searchT = setTimeout(() => { const { q } = parseHash(); const raw = e.target.value; raw.trim() ? q.set('q', raw) : q.delete('q'); history.replaceState(null, '', '#/recherche' + (q.toString() ? '?' + q : '')); render(true); }, 180);
});
document.addEventListener('submit', e => {
  const fm = e.target.dataset.form;
  if (fm === 'newdeck' || fm === 'editdeck') {
    e.preventDefault(); const f = e.target, name = f.name.value.trim().slice(0, 60) || F('Mon deck'), list = parseDeckText(f.list.value);
    if (fm === 'newdeck') { const nd = { id: 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name, list, created: new Date().toISOString().slice(0, 10) }; myDecks.unshift(nd); saveDecks(); location.hash = '#/mondeck/' + nd.id; }
    else { const d = myDecks.find(x => x.id === f.dataset.id); if (d) { d.name = name; d.list = list; d.updated = new Date().toISOString().slice(0, 10); saveDecks(); } deckEditId = ''; render(); }
    const bad = list.filter(x => !x[4]).length; toast(bad ? F('{0} ligne(s) non reconnue(s) : vérifie le nom', bad) : F('Deck enregistré')); return;
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
    ask(`Ajouter ${add.length} carte(s) à ta collection ?` + (j.collection.length - known.length ? ` (${j.collection.length - known.length} non reconnue(s) ignorée(s))` : ''), 'Ajouter', () => {
    collection.push(...add); saveCol(); if (Array.isArray(j.sealed)) { const sid = new Set(sealedCol.map(x => x.id)); sealedCol.push(...j.sealed.filter(x => x && x.pid && !sid.has(x.id))); saveSealed(); } if (Array.isArray(j.decks)) { const dd = new Set(myDecks.map(x => x.id)); myDecks.push(...j.decks.filter(x => x && x.id && !dd.has(x.id))); saveDecks(); } (j.anyLang || []).forEach(k => anyLang.add(k)); save('anyLang', [...anyLang]); toast(add.length + ' carte(s) importée(s)'); render(); });
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
  else if (r === 'langues') { html = viewLangs(); title = 'Langues · CallIt!'; }
  else if (r === 'illustrateurs') html = viewArtists();
  else if (r === 'envies') { html = viewWish(); title = 'Mes envies · CallIt!'; }
  else if (r === 'confidentialite') { html = viewPrivacy(); title = 'Données personnelles · CallIt!'; }
  else if (r === 'scelle') { html = viewSealed(parts[1]); title = 'Produit scellé · CallIt!'; }
  else if (r === 'centrage') { html = viewCentrage(q); title = 'Centrage · CallIt!'; }
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
  if (!kept) app.innerHTML = html;
  document.title = tr(title);
  if (r === 'carte') loadHist();
  if (r === 'centrage') { const im = document.querySelector('#ctrwrap img'); if (im) { if (im.complete) ctrLoupe(); else im.addEventListener('load', ctrLoupe); } }
  if (focusSearch) { focusSearch = false; const i = document.getElementById('q'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
  if (keepFocus && pos != null && !kept) { const i = document.getElementById('q'); if (i) { i.focus(); i.setSelectionRange(pos, pos); } }
}
let focusSearch = false;
let lastRoute = '', navDepth = 0, goingBack = false; // pages visitées dans l'appli : « Retour » ne sort jamais du site
window.addEventListener('hashchange', () => { const r = location.hash.split('?')[0]; navDepth = r === '#/' || r === '' || r === '#' ? 0 : Math.max(0, navDepth + (goingBack ? -1 : 1)); goingBack = false; render(); if (r !== lastRoute) { window.scrollTo(0, 0); lastRoute = r; } });

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
