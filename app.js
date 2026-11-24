/* CallIt! · appli web (PWA), sans dépendance.
   Données : data/cards.json (TCGdex + guide de prix public Cardmarket), data/rates.json (taux BCE).
   Tout ce que l'utilisateur saisit reste sur son appareil (localStorage). */
'use strict';

/* ---------- Réglages et stockage local ---------- */
const STORE = 'callit.v1.';
const load = (k, d) => { try { const v = localStorage.getItem(STORE + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
const save = (k, v) => { try { localStorage.setItem(STORE + k, JSON.stringify(v)); } catch (e) { toast("Impossible d'enregistrer sur cet appareil"); } };

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
  const tags = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'fr-FR']);
  for (const t of tags) { const m = /-([A-Za-z]{2})\b/.exec(t); if (m && COUNTRY[m[1].toUpperCase()]) return m[1].toUpperCase(); }
  const l = (tags[0] || 'fr').slice(0, 2).toLowerCase();
  return { it: 'IT', de: 'DE', es: 'ES', pt: 'PT', nl: 'NL', en: 'GB', pl: 'PL', sv: 'SE', da: 'DK' }[l] || 'FR';
}

const S = Object.assign({
  face: null,                 // 'galerie' | 'marche' (choisi au premier lancement)
  country: guessCountry(),
  currency: 'auto',           // 'auto' = devise du pays
  nameLang: 'fr',             // langue des noms de cartes
  excluded: [],               // langues exclues
  exclSearch: true,           // appliquer l'exclusion à la recherche et à la Galerie
  minCond: 'EX',              // état minimum (liens Cardmarket et filtre de la collection)
  sort: 'pert',
  theme: 'auto'              // 'auto' | 'clair' | 'sombre'
}, load('settings', {}));
const saveS = () => save('settings', S);
let collection = load('collection', []);   // [{id, key, lang, cond, grader, grade, qty, paid, cur, date, note}]
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
let DB = null, CARDS = [], BYKEY = new Map(), RATES = { rates: { EUR: 1 }, approx: true, date: '' };

const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’`]/g, "'").toLowerCase();
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function loadData() {
  const [db, rates] = await Promise.all([
    fetch('data/cards.json').then(r => { if (!r.ok) throw new Error('cards ' + r.status); return r.json(); }),
    fetch('data/rates.json').then(r => r.json()).catch(() => null)
  ]);
  if (rates) RATES = rates;
  DB = db;
  const regLangs = { en: ['en', 'fr', 'de', 'es', 'it', 'pt'], ja: ['ja', 'ko', 'zh-tw', 'zh-cn', 'th', 'id'] };
  CARDS = db.cards.map((c, i) => {
    const set = db.sets[c.s];
    const langs = regLangs[set.reg].filter(l => c.n[l]);
    const hay = norm([...Object.values(c.n), ...Object.values(set.name), set.id, c.i != null ? db.ills[c.i] : '', c.dex ? db.species[c.dex] : ''].join(' | '));
    const card = Object.assign({}, c, { idx: i, set, langs, hay, key: set.reg + ':' + set.id + ':' + c.num, numN: String(c.num).replace(/^0+(?=\d)/, '').toLowerCase() });
    BYKEY.set(card.key, card);
    return card;
  });
  // Si les taux livrés sont approximatifs, on essaie ceux du jour (BCE via frankfurter.app)
  if (RATES.approx) {
    fetch('https://api.frankfurter.app/latest?from=EUR').then(r => r.json()).then(j => {
      if (j && j.rates) { RATES = { date: j.date, approx: false, source: 'Banque centrale européenne (via frankfurter.app)', rates: Object.assign({ EUR: 1 }, j.rates) }; render(); }
    }).catch(() => {});
  }
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
    fmtCache[k] = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: cur, minimumFractionDigits: dec, maximumFractionDigits: dec, currencyDisplay: 'narrowSymbol' });
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
  const order = [lang || S.nameLang, 'fr', 'en', 'ja', ...Object.keys(n)];
  for (const l of order) if (n[l]) return n[l];
  return '?';
}
const speciesFr = c => (c.dex && DB.species[c.dex]) || '';
const latin = t => t && !/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af\u0e00-\u0e7f]/.test(t);
function setName(s) { const n = s.name; return n[S.nameLang] || n.fr || n.en || (latin(n.ja) ? n.ja : '') || n.id || n.ja || Object.values(n)[0] || s.id; }
const year = s => (s.date || '').slice(0, 4);
const numLabel = c => c.num + (c.set.count ? '/' + c.set.count : '');
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
const isVintage = c => c.set.reg === 'en' && (c.set.date || '9') < '2003-07';
// Images réellement disponibles (data/images.json, vérifié chaque semaine) : on évite les essais inutiles
let IMGS = null;
fetch('data/images.json').then(r => r.ok ? r.json() : null).then(j => { if (j && DB && j.cards === DB.generated) { IMGS = j; render(); } else if (j) IMGS = j; }).catch(() => {});
const imgMask = c => { if (!IMGS || !IMGS.mask || IMGS.cards !== DB.generated) return null; const D = '0123456789abcdefghijklmnopqrstuvwxyz'; return D.indexOf(IMGS.mask[c.idx * 2]) * 36 + D.indexOf(IMGS.mask[c.idx * 2 + 1]); };
const hasImg = c => { const m = imgMask(c); return m == null || m > 0 || !!(IMGS.ptcg && IMGS.ptcg[c.idx]); };
function imgOrder(c, want, force) {
  const base = c.set.reg === 'en' ? ['en', 'fr', 'es', 'it', 'pt', 'de'] : ['ja', 'zh-tw', 'th', 'id', 'ko', 'zh-cn'];
  const m = imgMask(c);
  const okL = m == null ? base : base.filter((l, i) => m & (1 << i));
  const pref = force ? [force] : isVintage(c) ? ['en'] : [want, S.nameLang, ...visibleLangs(c)];
  const order = [...new Set([...pref.filter(l => okL.includes(l)), ...okL])];
  if (m != null && IMGS.ptcg && IMGS.ptcg[c.idx]) order.push('ptcg');
  return order.filter(l => !imgBad.has(c.key + '|' + l));
}
const imgUrl = (c, l, q) => l === 'ptcg' ? 'https://images.pokemontcg.io/' + IMGS.ptcg[c.idx] + (q === 'high' ? '_hires' : '') + '.png' : DB.imageBase.replace('{lang}', l).replace('{serie}', encodeURIComponent(c.set.serie)).replace('{set}', encodeURIComponent(c.set.id)).replace('{num}', encodeURIComponent(c.num)).replace('high.webp', q + '.webp');

const COUNTRY_LANG = { FR: 'fr', BE: 'fr', LU: 'fr', MC: 'fr', IT: 'it', DE: 'de', AT: 'de', CH: 'de', ES: 'es', PT: 'pt', JP: 'ja' };
function prefLang(c) {
  const vis = visibleLangs(c);
  for (const l of [S.nameLang, COUNTRY_LANG[S.country], 'en']) if (l && vis.includes(l)) return l;
  return vis[0] || c.langs[0] || (c.set.reg === 'en' ? 'en' : 'ja');
}
function cimg(c, opts = {}) {
  const want = opts.lang || prefLang(c);
  const q = opts.big ? 'high' : 'low';
  const order = imgOrder(c, want, opts.force);
  const first = order[0];
  const badge = opts.badge ? `<span class="badge">${esc(opts.badge)}</span>` : '';
  const label = esc(cardName(c));
  if (!first) return `<div class="cimg noimg">${badge}<div class="ph">${label}<br>image indisponible</div></div>`;
  return `<div class="cimg" data-want="${want}"><img loading="${opts.eager ? 'eager' : 'lazy'}" decoding="async" alt="${label}" src="${imgUrl(c, first, q)}" data-key="${esc(c.key)}" data-q="${q}" data-lang="${first}" data-order="${order.join(',')}">${badge}<div class="ph">${label}</div><span class="fallback"></span></div>`;
}
function markFallback(img) {
  const box = img.parentElement, want = box.dataset.want, got = img.dataset.lang;
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
  home: '<path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  coll: '<rect x="4" y="3" width="11" height="15" rx="2"/><path d="M9 21h9a2 2 0 0 0 2-2V7"/>',
  set: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  chart: '<path d="M3 19l6-6 4 3 8-9"/>',
  back: '<path d="M15 18l-6-6 6-6"/>',
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
const G = () => S.face !== 'marche';

function faceSwitch() {
  return `<div class="face" role="group" aria-label="Visage de l'appli"><button data-act="face" data-v="galerie" aria-pressed="${G()}">Galerie</button><button data-act="face" data-v="marche" aria-pressed="${!G()}">Marché</button></div>`;
}
function tabs(cur) {
  const t = G()
    ? [['', 'Galerie', 'home'], ['recherche', 'Recherche', 'search'], ['collection', 'Ma collection', 'coll'], ['reglages', 'Réglages', 'set']]
    : [['', 'Marché', 'chart'], ['recherche', 'Recherche', 'search'], ['collection', 'Portefeuille', 'coll'], ['reglages', 'Réglages', 'set']];
  return `<div class="tabs"><nav aria-label="Navigation"><a class="brand" href="#/" aria-label="CallIt!, accueil">${logo(22)}</a>${t.map(([h, l, i]) => `<a href="#/${h}" ${cur === h ? 'aria-current="page"' : ''}>${icon(i, 22)}<span>${l}</span></a>`).join('')}</nav></div>`;
}
function backBtn() { return `<button class="iconbtn" data-act="back" aria-label="Retour">${icon('back')}</button>`; }

// « dès X € » : prix bas Cardmarket (l'offre la moins chère, tous états), sinon la cote
function fromPrice(c) { const lo = pf(c, 'low'), p = lo > 0 ? lo : price(c); return p > 0 ? 'dès <b>' + eur(p) + '</b>' : 'pas encore de prix'; }
function tile(c, opts = {}) {
  const meta = (c.set.reg === 'ja' ? 'JP · ' : '') + (opts.meta != null ? opts.meta : `${setName(c.set)} · ${year(c.set)}`);
  return `<a class="tile" href="#/carte/${encodeURIComponent(c.key)}${opts.lang ? '?lang=' + opts.lang : ''}">${cimg(c, opts)}${heartBtn(c.key)}<span class="nm">${esc(cardName(c))}</span><span class="mt">${esc(meta)}</span>${opts.from ? `<span class="from">${fromPrice(c)}</span>` : ''}</a>`;
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
  const order = imgOrder(c, prefLang(c));
  return `<span style="${box}"><img src="${imgUrl(c, order[0], 'high')}" alt="" data-key="${esc(c.key)}" data-q="high" data-lang="${order[0]}" data-order="${order.join(',')}" style="width:100%;height:100%;object-fit:cover"></span>`;
}
/* Premier lancement */
function viewWelcome() {
  return `<div class="pad" style="padding-top:70px;min-height:100vh">
  <div class="title">${logo(30)}</div>
  <h1 style="font-family:var(--serif);font-weight:500;font-size:36px;line-height:1.1;margin:40px 0 0">Tu collectionnes pour quoi ?</h1>
  <p class="sub" style="font-size:15px;margin:10px 0 0">On adapte l'appli. Tu pourras changer à tout moment.</p>
  <div class="stack" style="margin-top:32px">
    <button class="choice" data-act="welcome" data-v="galerie">${art('en:sv01:210', 52, 72, 0)}<span><b>Pour la beauté des cartes</b><span>Illustrations, artistes, ma collection</span></span></button>
    <button class="choice" data-act="welcome" data-v="marche">${art('en:sv08.5:164', 52, 72, 0)}<span><b>Pour investir et revendre</b><span>Cotes, marges, portefeuille</span></span></button>
    <button class="choice" data-act="welcome" data-v="galerie"><span style="width:52px;height:72px;flex:none;position:relative">${art('en:sv08.5:156', 38, 53, -8, 'left:0;top:6px')}${art('en:sv08.5:155', 38, 53, 6, 'right:0;top:12px')}</span><span><b>Un peu des deux</b><span>Galerie par défaut, Marché à un geste</span></span></button>
  </div>
  <p class="sub" style="text-align:center;margin-top:40px">Les prix restent visibles partout, juste plus discrets en Galerie.</p><p class="small" style="text-align:center">Illustrations : Soporifik par Tomokazu Komiya (Écarlate et Violet), Gromago-ex par Shigenori Negishi (Évolutions Prismatiques), Nymphali-ex par Cona Nitanda et Mentali-ex par sui (Évolutions Prismatiques).</p></div>`;
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
function homeTop() {
  return `<div class="home-head"><div class="top home-top"><a class="title" href="#/" style="text-decoration:none;color:inherit" aria-label="CallIt!, accueil">${logo(24)}</a><div class="row" style="gap:8px">${faceSwitch()}<a class="iconbtn" href="#/reglages" aria-label="Mon profil et réglages">${icon('user')}</a></div></div>
  <div class="pad" style="padding-top:10px"><label for="homeq" class="sr">Chercher une carte</label><div class="searchrow"><input id="homeq" class="search" type="search" enterkeyhint="search" autocomplete="off" placeholder="Chercher une carte, un set, un artiste…">${scanBtn('iconbtn scanbig')}</div></div></div>`;
}
function startCta() {
  return `<a class="panel cta" href="#/recherche" data-act="gosearch"><div style="flex:1"><b style="font-size:16px">Ajoute ta première carte</b><div class="small" style="margin-top:3px">Cherche-la, puis « Ajouter à ma collection ». Tout reste sur ton appareil.</div></div><span class="cta-plus">+</span></a>`;
}
function viewGalerieHome() {
  const arts = topArtists(); const a = arts[weekNo() % arts.length];
  const cards = CARDS.filter(c => c.i === a.i && c.set.reg === 'en' && c.dex && !isHidden(c)).sort((x, y) => (price(y) || 0) - (price(x) || 0)).slice(0, 8);
  const explore = [['Illustrateurs', '#/illustrateurs'], ...Object.entries(PRESETS).map(([k, p]) => [p.label, '#/recherche?preset=' + k])];
  const cheap = CARDS.filter(c => PRESETS.petitprix.test(c) && !isHidden(c)).sort((x, y) => (y.set.date || '').localeCompare(x.set.date || '')).slice(0, 12);
  const mine = collection.slice(-8).reverse().map(it => BYKEY.get(it.key)).filter(Boolean);
  const pf_ = portfolio();
  const myBlock = mine.length
    ? `<div class="sect between"><h2 class="h2">Ma collection</h2><a class="sub" href="#/collection">tout voir</a></div><p class="pad small" style="margin:0 0 8px">${pf_.n} carte${pf_.n > 1 ? 's' : ''} · environ ${money(pf_.value)}</p><div class="hrow">${mine.map(c => tile(c)).join('')}</div>`
    : `<div class="sect"><h2 class="h2">Ma collection</h2></div><div class="pad">${startCta()}</div>`;
  return `${homeTop()}
  ${acctBanner()}
  <div class="home-cols"><div class="col-a">${myBlock}
  <div class="pad stack" style="gap:8px;margin-top:18px"><div class="small" style="font-weight:600">Explorer par</div>
  <div class="chips wrap">${explore.map(([l, h]) => `<a class="chip" href="${h}">${esc(l)}</a>`).join('')}</div></div></div>
  <div class="col-b">
  <div class="sect"><div class="small" style="font-weight:600">L'artiste de la semaine</div>
  <h2 style="font-family:var(--serif);font-weight:500;font-size:28px;line-height:1.05;margin:4px 0 0">${esc(a.name)}</h2>
  <div class="sub" style="margin-top:4px">${a.n} cartes · <a href="#/recherche?ill=${encodeURIComponent(a.name)}">tout voir</a></div></div>
  <div class="hrow hero" style="padding-top:14px;padding-bottom:18px">${cards.map(c => tile(c, { big: true, eager: true })).join('')}</div>
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
  const h = load('history', {}); const pts = Object.entries(h).sort((a, b) => a[0].localeCompare(b[0]));
  if (pts.length < 2) return `<div class="small" style="padding:6px 0 0">L'historique de la valeur se construit à partir d'aujourd'hui, à chaque mise à jour des cotes.</div>`;
  const vs = pts.map(p => p[1]); const mn = Math.min(...vs), mx = Math.max(...vs), w = 350, hh = 56;
  const d = vs.map((v, i) => `${(i / (vs.length - 1) * w).toFixed(1)} ${(hh - 4 - (mx === mn ? 0.5 : (v - mn) / (mx - mn)) * (hh - 8)).toFixed(1)}`).join(' L');
  return `<svg class="spark" viewBox="0 0 ${w} ${hh}" preserveAspectRatio="none" role="img" aria-label="Évolution de la valeur"><path d="M${d}" fill="none" stroke="var(--gain)" stroke-width="2.5" stroke-linejoin="round"/></svg>`;
}
function recordHistory() {
  if (!DB || !collection.length) return;
  const h = load('history', {}); const day = (DB.generated || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
  const r = rate(userCur()) || 1; let v = 0;
  for (const it of collection) { const c = BYKEY.get(it.key); if (c && !it.grader) v += (price(c) || 0) * (it.qty || 1); }
  h[day] = Math.round(v * 100) / 100; save('history', h); void r;
}
let moversCache = null, moversAll = { up: false, top: false };
function movers() {
  if (moversCache) return moversCache;
  // Hausse fiable : cote ≥ 5 €, ventes récentes cohérentes (tendance proche de la moyenne 7 j), pas d'offre isolée
  const list = CARDS.filter(c => c.set.reg === 'en' && c.p && c.p[1] >= 5 && c.p[2] >= 5 && c.p[0] >= 1 && pf(c, 'avg7') > 0 && Math.abs(c.p[1] / pf(c, 'avg7') - 1) < 0.35).map(c => [c, (c.p[1] - c.p[2]) / c.p[2]]);
  moversCache = { up: list.filter(x => x[1] > 0.05).sort((a, b) => b[1] - a[1]).slice(0, 20), top: CARDS.filter(c => c.set.reg === 'en' && c.p && c.p[1]).sort((a, b) => b.p[1] - a.p[1]).slice(0, 20).map(c => [c, (c.p[1] - (c.p[2] || c.p[1])) / (c.p[2] || c.p[1])]) };
  return moversCache;
}
function moverRow([c, d]) {
  return `<a class="line" href="#/carte/${encodeURIComponent(c.key)}"><span class="thumb">${cimg(c)}</span><span class="mid"><b>${esc(cardName(c))}</b><span>${esc(setName(c.set))} · ${esc(numLabel(c))}</span></span><span class="px"><b class="num">${eur(c.p[1])}</b><span class="${d >= 0 ? 'gain' : 'loss'}" style="font-weight:700">${d >= 0 ? '+' : ''}${Math.round(d * 100)} % vs 30 j</span></span></a>`;
}
function moverList(k, title, sub) {
  const m = movers()[k], all = moversAll[k];
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
  ${acctBanner()}
  <div class="home-cols"><div class="col-a">${myBlock}
  <div class="pad" style="margin-top:16px"><a class="panel row" href="#/indices" style="text-decoration:none"><div style="flex:1"><div class="small" style="font-weight:600">Indice Vintage 100</div><div class="num" style="font-weight:700;font-size:22px">${eur(I.vint.v)} ${pct(I.vint.ch)}</div><div class="small">Les 100 cartes vintage de référence · aussi par set et par Pokémon</div></div><span style="transform:scaleX(-1);display:flex">${icon('back')}</span></a></div>
  <div class="pad" style="margin-top:14px"><div class="note">Cotes : guide de prix public Cardmarket du ${esc(fmtDate(DB.generated))}, toutes langues et tous états confondus. Les bonnes affaires eBay arriveront avec l'accès à l'API eBay.</div></div></div>
  <div class="col-b">
  ${moverList('up', 'En hausse', 'sur 30 jours, cartes assez vendues')}
  ${moverList('top', 'Les plus chères', 'cote Cardmarket')}
  </div></div>
  ${tabs('')}`;
}
function fmtDate(s) { if (!s) return '—'; const d = new Date(s.slice(0, 10) + 'T12:00:00'); return isNaN(d) ? s : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }); }

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
    <div class="note">Cherche par nom (dans n'importe quelle langue), set, numéro (« 65/82 ») ou illustrateur. ${CARDS.length.toLocaleString('fr-FR')} cartes, en 12 langues.</div></div>`;
  } else {
    const vis = [], hid = [];
    for (const c of res) (isHidden(c) ? hid : vis).push(c);
    if (S.sort === 'pert' && IMGS) { const a = vis.filter(hasImg), b = vis.filter(c => !hasImg(c)); vis.length = 0; vis.push(...a, ...b); } // cartes avec image d'abord
    const all = showHidden ? res : vis;
    const page = all.slice(0, shown);
    const hidLangs = [...new Set(hid.flatMap(c => c.langs))];
    body = `<div class="sect between" style="padding-top:16px"><b style="font-size:17px">${all.length.toLocaleString('fr-FR')} résultat${all.length > 1 ? 's' : ''}</b><label class="sub">tri : <select data-act="sort" style="border:0;background:transparent;font-weight:600">${Object.entries(sortL).map(([k, l]) => `<option value="${k}" ${S.sort === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
    ${hid.length ? `<div class="hidden-bar"><span>${showHidden ? `Les ${hid.length} résultats en ${joinFr(langList(hidLangs))} sont affichés pour cette recherche.` : `${hid.length} résultat${hid.length > 1 ? 's' : ''} masqué${hid.length > 1 ? 's' : ''} (${joinFr(langList(hidLangs))}).`}</span><button class="btn small" data-act="showhidden">${showHidden ? 'Masquer' : 'Voir'}</button></div>` : ''}
    ${G() ? `<div class="grid">${page.map(c => tile(c, { badge: isHidden(c) ? 'exclue' : '', from: true })).join('')}</div>` : `<div class="list">${page.map(c => lineRow(c, isHidden(c))).join('')}</div>`}
    ${all.length > shown ? `<div class="pad" style="margin-top:14px"><button class="btn full" data-act="more">Voir plus (${(all.length - shown).toLocaleString('fr-FR')} restants)</button></div>` : ''}
    ${!all.length && !hid.length ? `<div class="pad"><div class="note">Aucune carte trouvée. Vérifie l'orthographe ou essaie le nom anglais.</div></div>` : ''}`;
  }
  const typeTabs = `<div class="pad" style="padding-top:12px"><div class="face" role="tablist" aria-label="Type">${[['', 'Cartes'], ['scelles', 'Scellés']].map(([k, l]) => { const q = new URLSearchParams(params); k ? q.set('t', k) : q.delete('t'); q.delete('cat'); return `<a role="tab" aria-selected="${(params.get('t') || '') === k}" class="${(params.get('t') || '') === k ? 'on' : ''}" href="#/recherche?${q}">${l}</a>`; }).join('')}</div></div>`;
  if (params.get('t') === 'scelles') return `<div class="top"><h1 class="title">Recherche</h1><div class="row" style="gap:8px"><a class="iconbtn" href="#/langues" aria-label="Réglages des langues">${icon('globe')}</a></div></div>
  ${typeTabs}<form class="pad" style="padding-top:12px" data-act="search"><label for="q" class="sr">Chercher un produit scellé</label><input id="q" class="search" type="search" enterkeyhint="search" autocomplete="off" placeholder="Display, ETB, booster, nom du set…" value="${esc(params.get('q') || '')}"></form>
  ${sealedResults(params)}${tabs('recherche')}`;
  return `<div class="top"><h1 class="title">Recherche</h1><div class="row" style="gap:8px">${scanBtn()}<a class="iconbtn" href="#/langues" aria-label="Réglages des langues">${icon('globe')}</a></div></div>
  ${typeTabs}<form class="pad" style="padding-top:12px" data-act="search"><label for="q" class="sr">Chercher une carte</label><input id="q" class="search" type="search" enterkeyhint="search" autocomplete="off" placeholder="Nom, set, numéro, illustrateur…" value="${esc(params.get('q') || '')}"></form>
  <div class="pad chips" style="padding-top:12px"><a class="chip ${S.excluded.length ? 'on' : ''}" href="#/langues">${esc(langLabel)}</a><button class="chip on" data-act="cond">${esc(condLabel)}</button>${filt.map(([l, k]) => `<button class="chip on" data-act="unfilter" data-k="${k}" aria-label="Retirer le filtre ${esc(l)}">${esc(l)} ✕</button>`).join('')}</div>
  ${scanPanel()}
  ${params.get('set') && DB.sets[+params.get('set')] ? setIndexPanel(+params.get('set')) : ''}
  ${body}${tabs('recherche')}`;
}

/* ---------- Scanner une carte : photo → lecture du texte (OCR, dans le téléphone) → cartes candidates ---------- */
let scanState = null; // { status: 'lecture'|'fini'|'erreur', progress, text, results }
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
let sealedCol = load('sealed', []); // [{id, pid, lang, qty, paid, cur, date, note}]
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
  <div class="sect between" style="padding-top:14px"><b style="font-size:17px">${res.length.toLocaleString('fr-FR')} produit${res.length > 1 ? 's' : ''}</b><label class="sub">tri : <select data-act="sort" style="border:0;background:transparent;font-weight:600">${[['pert', 'plus récents'], ['prix-', 'prix décroissant'], ['prix+', 'prix croissant'], ['ancien', 'plus anciens']].map(([k, l]) => `<option value="${k}" ${S.sort === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
  ${hid.length ? `<div class="hidden-bar"><span>${showHidden ? 'Produits de langues exclues affichés.' : `${hid.length} produit${hid.length > 1 ? 's' : ''} masqué${hid.length > 1 ? 's' : ''} (langues exclues).`}</span><button class="btn small" data-act="showhidden">${showHidden ? 'Masquer' : 'Voir'}</button></div>` : ''}
  <div class="list">${res.slice(0, sealedShown).map(x => sealedRow(x)).join('')}</div>
  ${res.length > sealedShown ? `<div class="pad" style="margin-top:14px"><button class="btn full" data-act="smore">Voir plus (${(res.length - sealedShown).toLocaleString('fr-FR')} restants)</button></div>` : ''}
  <div class="pad" style="margin-top:12px"><div class="note">Cotes Cardmarket du ${esc(fmtDate(SEALED.generated))} : un prix par produit, toutes langues européennes confondues (les produits asiatiques ont leur propre fiche).</div></div>`;
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
  const cmUrl = `https://www.cardmarket.com/fr/Pokemon/Products/Search?searchString=${encodeURIComponent(x.name)}${CM_LANG[lang] ? '&language=' + CM_LANG[lang] : ''}`;
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
    const rows = [...collection.map(it => ({ id: it.id, kind: 'card', data: it, deleted: false })), ...sealedCol.map(it => ({ id: it.id, kind: 'sealed', data: it, deleted: false })), ...wish.items.map(it => ({ id: it.id, kind: 'wish', data: it, deleted: false })), ...wish.folders.map(f => ({ id: f.id, kind: 'folder', data: f, deleted: false })), ...deletedIds.map(d => ({ id: d.id, kind: d.kind, data: {}, deleted: true }))]
      .map(r => Object.assign(r, { user_id: me.id, updated_at: new Date().toISOString() }));
    if (full) {
      // À la connexion : on récupère le compte et on fusionne (rien n'est perdu d'un côté ni de l'autre)
      const { data, error } = await sb.from('collection_items').select('id,kind,data,deleted'); if (error) throw error;
      const gone = new Set(data.filter(r => r.deleted).map(r => r.id)), haveC = new Set(collection.map(x => x.id)), haveS = new Set(sealedCol.map(x => x.id));
      let added = 0;
      for (const r of data) { if (r.deleted) continue; if (r.kind === 'card' && !haveC.has(r.id) && BYKEY.has(r.data.key)) { collection.push(r.data); added++; } if (r.kind === 'sealed' && !haveS.has(r.id)) { sealedCol.push(r.data); added++; } if (r.kind === 'folder' && !wish.folders.some(f => f.id === r.id)) wish.folders.push(r.data); if (r.kind === 'wish' && !wish.items.some(x => x.id === r.id && x.key)) { if (!wish.items.some(x => x.key === r.data.key)) { wish.items.push(r.data); added++; } } }
      wish.items = wish.items.filter(x => !gone.has(x.id)); wish.folders = wish.folders.filter(f => f.id === 'f0' || !gone.has(f.id)); save('wish', wish);
      collection = collection.filter(x => !gone.has(x.id)); sealedCol = sealedCol.filter(x => !gone.has(x.id));
      save('collection', collection); save('sealed', sealedCol);
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
  const { error } = await c.auth.signInWithOtp({ email, options: { emailRedirectTo: window.CallItNatif ? 'callit://auth' : location.origin + location.pathname } });
  toast(error ? 'Envoi impossible : vérifie l’adresse' : 'Lien envoyé ! Ouvre ton e-mail sur cet appareil');
  if (!error) { acctSent = email; render(); }
}
let acctSent = '';
function accountPanel() {
  if (!acctReady()) return `<div class="pad"><div class="note">Les comptes gratuits arrivent très bientôt : ta collection sera sauvegardée et retrouvée sur tous tes appareils.</div></div>`;
  if (me) return `<div class="pad"><div class="panel stack" style="gap:10px"><div class="between"><b style="font-size:15px">Mon compte</b><span class="lg" style="font-size:11px;padding:2px 8px">gratuit</span></div>
    <div class="sub">Connecté : <b>${esc(me.email || '')}</b></div>
    <div class="small">${syncing ? 'Synchronisation…' : lastSync ? 'Collection sauvegardée · ' + new Date(lastSync).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : 'Pas encore synchronisée'}</div>
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
  if (!n || (closedAt && (closedAt >= 5 || n < 5))) return '';
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
  <h2 class="h2">Responsable</h2><p>L’éditeur de CallIt!. Contact : à compléter (adresse e-mail de contact du projet).</p>
  <p class="small">Mise à jour : ${new Date('2026-11-24').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</p></div>${tabs('')}`;
}

/* ---------- Liste d'envies : un cœur sur les cartes et les scellés, rangée en dossiers ---------- */
// wish = { folders: [{id, name}], items: [{id, key, folder, max, lang, added}] } ; key = clé de carte ou « sealed:<id> »
let wish = load('wish', { folders: [{ id: 'f0', name: 'Mes envies' }], items: [] });
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
    return head + `<a class="line artist" href="#/recherche?ill=${encodeURIComponent(a.name)}"><span class="thumb">${cimg(c)}</span><span class="mid"><b>${artistSort === 'pop' && !q ? (i + 1) + '. ' : ''}${esc(a.name)}</b><span>${a.n} carte${a.n > 1 ? 's' : ''} · la plus chère : ${esc(cardName(c))}</span></span><span class="px"><b class="num" style="font-size:14px">${price(c) != null ? eur(price(c)) : '—'}</b><span>sa carte max</span></span></a>`;
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
  if (!c.p) return `<div class="sect"><h2 class="h2">Prix</h2></div><div class="pad"><div class="note">Pas encore de cote Cardmarket pour cette carte${c.set.reg === 'ja' ? ' (les cartes asiatiques sont moins suivies)' : ''}.</div></div>`;
  const low = pf(c, 'low'), tr = pf(c, 'trend'), a30 = pf(c, 'avg30'), a7 = pf(c, 'avg7'), a1 = pf(c, 'avg1'), holo = pf(c, 'trendHolo');
  const main = tr != null ? tr : low;
  const steps = [['Moy. 30 j', a30], ['Moy. 7 j', a7], ['Hier', a1], ['Aujourd’hui', tr]].filter(x => x[1] != null && x[1] > 0);
  const chart = steps.length >= 2 ? `<div class="steps">${steps.map(([l, v]) => `<div><div class="lab">${l}</div><div class="num">${eur(v)}</div></div>`).join('')}</div>` : '';
  const delta = a30 ? (main - a30) / a30 : null;
  return `<div class="sect between"><h2 class="h2">Prix</h2><span class="sub">Cardmarket, toutes langues</span></div>
  <div class="pad stack">
    <div class="prices"><div><div class="lab">Tendance</div><div class="val num">${eur(main)}</div></div><div><div class="lab">Prix bas</div><div class="val num">${eur(low)}</div></div><div><div class="lab">Sur 30 jours</div><div class="val num ${delta == null ? '' : delta >= 0 ? 'gain' : 'loss'}">${delta == null ? '—' : (delta >= 0 ? '+' : '') + Math.round(delta * 100) + ' %'}</div></div></div>
    <div class="panel">${chart || '<div class="small">Pas assez de ventes récentes pour comparer.</div>'}
      ${holo ? `<div class="small" style="margin-top:6px">Version reverse / holo : ${eur(holo)}</div>` : ''}
      ${eurNote(main) ? `<div class="small" style="margin-top:4px">${eurNote(main)} · taux ${RATES.approx ? 'approximatif' : 'BCE du ' + esc(fmtDate(RATES.date))}</div>` : ''}
      ${(() => { const r = setRank(c); return r && r.of >= 5 ? `<div class="small" style="margin-top:6px">Rang dans le set : ${r.rank}<sup>${r.rank === 1 ? 're' : 'e'}</sup> sur ${r.of} cartes cotées · cote médiane du set ${eur(r.median)}</div>` : ''; })()}
      <div class="small" style="margin-top:6px">Guide de prix Cardmarket du ${esc(fmtDate(DB.generated))} : une seule cote, toutes langues et tous états confondus.</div></div>
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
    since: start.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }), intro, box };
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
  if (HPTS.pts.length < 2) { box.innerHTML = `<div class="sub" style="line-height:1.45">${intro}</div><div class="small">Relevé commencé le ${since} · ${HPTS.pts.length} jour enregistré. La vraie courbe apparaît dès le deuxième jour.</div>${cmCurve(box)}`; return; }
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
  const data = esc(JSON.stringify(pts.map(x => [x[2] || x[0].toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }), eur(x[1]), X(pts.indexOf(x)), Y(x[1])])));
  const fd = x => x.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
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
  if (!(pr > 0)) return `<p class="summary">Pas encore de cote pour cette carte${c.set.reg === 'ja' ? ' : les cartes asiatiques sont peu vendues en Europe' : ''}.</p>`;
  const a30 = pf(c, 'avg30'), d = a30 ? (pr - a30) / a30 : null, r = setRank(c);
  let t = `Vaut environ <b>${eur(pr)}</b> aujourd'hui`;
  if (d != null && Math.abs(d) >= 0.03) t += `, <span class="${d >= 0 ? 'gain' : 'loss'}">${d >= 0 ? 'en hausse de ' : 'en baisse de '}${Math.abs(Math.round(d * 100))} %</span> sur 30 jours`;
  else if (d != null) t += ', stable sur 30 jours';
  t += '.';
  if (r && r.of >= 5) {
    t += ` C'est ${r.rank <= 3 ? '<b>' : ''}la ${ord(r.rank).replace(/^la /, '')}${r.rank <= 3 ? '</b>' : ''} de ${esc(setName(c.set))} (sur ${r.of} cartes cotées)`;
    if (r.ratio && r.ratio >= 2) t += `, ${r.ratio >= 10 ? Math.round(r.ratio) : r.ratio.toFixed(1).replace('.', ',')} fois la cote médiane du set`;
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
  if (c.i != null) { const n = (artistIndex().list.find(a => a.idx.has(c.i)) || {}).n; if (n > 1) items.push(`${esc(ill(c))} a signé ${n} cartes dans CallIt!. <a href="#/recherche?ill=${encodeURIComponent(ill(c))}">Voir son style</a>.`); }
  if (c.set.date) items.push(`Sortie le ${esc(fmtDate(c.set.date))} dans ${esc(setName(c.set))}${c.set.count ? ', un set de ' + c.set.count + ' cartes officielles' : ''}.`);
  if (c.langs.length > 1) items.push(`Imprimée en ${c.langs.length} langues : ${esc(joinFr(langList(c.langs)))}.`);
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
const pct = ch => ch == null ? '—' : `<span class="${ch >= 0 ? 'gain' : 'loss'}" style="font-weight:700">${ch >= 0 ? '+' : ''}${(Math.round(ch * 1000) / 10).toString().replace('.', ',')} %</span>`;
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
  <div class="pad" style="margin-top:14px"><div class="note">Calculé sur le guide de prix Cardmarket du ${esc(fmtDate(DB.generated))} (cote tendance comparée à la moyenne sur 30 jours). Avec le relevé quotidien, chaque indice aura bientôt sa propre courbe.</div></div>
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
  const names = c.langs.map(l => `<div class="setrow" style="min-height:40px"><span class="${ex.has(l) ? 'sub' : ''}" style="font-weight:600;font-size:14px">${esc(LANG[l].name)}${(c.inf || []).includes(l) ? ' <span class="small">(nom déduit)</span>' : ''}</span><span style="font-size:14px">${esc(c.n[l])}</span></div>`).join('');
  const sameIll = c.i != null ? CARDS.filter(x => x.i === c.i && x !== c && !isHidden(x)).slice(-12).reverse() : [];
  const VS = { 'prix-': (a, b) => (price(b) || 0) - (price(a) || 0), 'prix+': (a, b) => (price(a) || 1e9) - (price(b) || 1e9), recent: (a, b) => (b.set.date || '').localeCompare(a.set.date || ''), ancien: (a, b) => (a.set.date || '9').localeCompare(b.set.date || '9') };
  const samePoke = c.dex ? CARDS.filter(x => x.dex === c.dex && x !== c && !isHidden(x) && hasImg(x)).sort(VS[verSort]).slice(0, 16) : [];
  const priceBlock = (G() ? aSavoir(c) : '') + priceSection(c) + upcomingSections(c);
  const langsSel = visibleLangs(c).length ? visibleLangs(c) : c.langs;
  const cmLang = { en: 1, fr: 2, de: 3, es: 4, it: 5, 'zh-cn': 6, ja: 7, pt: 8, ko: 10, 'zh-tw': 11 };
  const cmIds = langsSel.map(l => cmLang[l]).filter(Boolean);
  const cmUrl = `https://www.cardmarket.com/fr/Pokemon/Products/Search?searchString=${encodeURIComponent((c.n.en || cardName(c)) + ' ' + (c.set.name.en || ''))}${cmIds.length ? '&language=' + cmIds.join(',') : ''}&minCondition=${COND_RANK[S.minCond] + 1}`;
  const ebayDom = (COUNTRY[S.country] || COUNTRY.FR).ebay;
  const ebayUrl = `https://www.ebay.${ebayDom}/sch/i.html?_nkw=${encodeURIComponent(cardName(c, langsSel[0]) + ' ' + numLabel(c))}`;
  const ownedHtml = owned.length ? `<div class="sect between"><h2 class="h2">Dans ma collection</h2><span class="sub">${owned.reduce((s, it) => s + (it.qty || 1), 0)} exemplaire(s)</span></div><div class="list">${owned.map(it => `<div class="line"><span class="mid"><b>${esc(LANG[it.lang] ? LANG[it.lang].name : it.lang)} · ${it.grader ? esc(it.grader + ' ' + (it.grade || '')) : 'Brute · ' + esc((CONDS.find(x => x[0] === it.cond) || ['', '—'])[1])}</b><span>${it.qty > 1 ? it.qty + ' × · ' : ''}payée ${it.paid != null ? money(it.paid, it.cur) : '—'}${it.date ? ' · ' + esc(it.date) : ''}${it.note ? ' · ' + esc(it.note) : ''}</span></span><button class="btn small" data-act="edit" data-id="${it.id}">Modifier</button></div>`).join('')}</div>` : '';
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
  ${neighbours(c)}
  ${priceBlock}
  ${ownedHtml}
  <div class="pad stack" style="margin-top:16px">
    <label class="panel setrow" style="border-bottom:0"><span style="font-size:14px;font-weight:600">N'importe quelle langue me va pour cette carte</span><input type="checkbox" data-act="anylang" data-key="${esc(c.key)}" ${anyLang.has(c.key) ? 'checked' : ''}></label>
    <a class="extlink" href="${cmUrl}" target="_blank" rel="noopener"><b>Voir les offres Cardmarket</b><span class="small">${esc(langsSel.map(l => LANG[l].short).join(', '))} · ${S.minCond}+ · lien externe, sans commission</span></a>
    <a class="extlink" href="${ebayUrl}" target="_blank" rel="noopener"><b>Chercher sur eBay.${esc(ebayDom)}</b><span class="small">lien externe, sans commission</span></a>
  </div>
  <div class="sect"><h2 class="h2">Noms selon la langue</h2></div><div class="pad"><div class="panel" style="padding-top:4px;padding-bottom:4px">${names || '<div class="sub">—</div>'}</div></div>
  ${samePoke.length ? `<div class="sect between"><h2 class="h2">Autres versions de ${esc(speciesFr(c) || cardName(c))}</h2><a class="sub" href="#/recherche?dex=${c.dex}">tout voir</a></div><div class="pad chips scroll" style="padding-bottom:10px">${[['prix-', 'Prix ↓'], ['prix+', 'Prix ↑'], ['recent', 'Plus récentes'], ['ancien', 'Plus anciennes']].map(([k, l]) => `<button class="chip${verSort === k ? ' on' : ''}" data-act="vsort" data-v="${k}">${l}</button>`).join('')}</div><div class="hrow versions">${samePoke.map(x => tile(x, { meta: (verSort.startsWith('prix') ? (price(x) ? eur(price(x)) : 'sans cote') : year(x.set)) + ' · ' + setName(x.set) })).join('')}</div>` : ''}
  ${sameIll.length ? `<div class="sect between"><h2 class="h2">Du même illustrateur</h2><a class="sub" href="#/recherche?ill=${encodeURIComponent(ill(c))}">tout voir</a></div><div class="hrow">${sameIll.map(x => tile(x)).join('')}</div>` : ''}
  <div style="height:20px"></div>${tabs('')}`;
}

let verSort = 'prix-';
/* Collection (Galerie) et Portefeuille (Marché) */
let groupBy = 'ill';
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
    <div class="list" style="margin-top:12px">${rows.map(({ it, c, v, g }) => `<a class="line" href="#/carte/${encodeURIComponent(c.key)}?lang=${it.lang}"><span class="thumb">${cimg(c, { lang: it.lang })}</span><span class="mid"><b>${esc(cardName(c))}</b><span>${esc(LANG[it.lang] ? LANG[it.lang].short : it.lang)} · ${it.grader ? esc(it.grader + ' ' + (it.grade || '')) : esc(it.cond)} · ${esc(setName(c.set))}${(it.qty || 1) > 1 ? ' · ' + it.qty + ' ×' : ''}</span></span><span class="px"><b class="num">${v != null ? money(v * (it.qty || 1)) : '—'}</b><span class="${g == null ? '' : g >= 0 ? 'gain' : 'loss'}" style="font-weight:600">${g == null ? (it.grader ? 'cote gradée à venir' : 'payé ?') : (g >= 0 ? '+' : '') + money(g)}</span></span></a>`).join('')}</div>
    ${mySealedBlock()}
    <div class="pad" style="margin-top:14px"><div class="note">Valeur brute = cote Cardmarket (toutes langues et états confondus), convertie en ${esc(userCur())}.</div></div>${tabs('collection')}`;
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
  const tabsG = [['ill', 'Illustrateurs'], ['poke', 'Pokémon'], ['set', 'Sets'], ['lang', 'Langues']];
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
  <div class="sect"><div class="small" style="font-weight:600">Affichage</div></div>
  <div class="pad"><div class="panel" style="padding-top:2px;padding-bottom:2px"><div class="setrow"><span style="font-weight:600;font-size:14px">Mode d'affichage</span><div class="face" role="group" aria-label="Mode d'affichage">${[['auto', 'Auto'], ['clair', 'Clair'], ['sombre', 'Sombre']].map(([k, l]) => `<button data-act="theme" data-v="${k}" aria-pressed="${S.theme === k}">${l}</button>`).join('')}</div></div><div class="setrow small">« Auto » suit le réglage de ton téléphone ou de ton ordinateur.</div></div></div>
  <div class="sect"><div class="small" style="font-weight:600">Pays et devise</div></div>
  <div class="pad"><div class="panel" style="padding-top:2px;padding-bottom:2px">
   <label class="setrow"><span style="font-weight:600;font-size:14px">Pays</span><select data-act="set" data-k="country">${COUNTRIES.slice().sort((a, b) => a[1].localeCompare(b[1], 'fr')).map(([c, n]) => `<option value="${c}" ${S.country === c ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
   <label class="setrow"><span style="font-weight:600;font-size:14px">Devise des prix</span><select data-act="set" data-k="currency"><option value="auto" ${S.currency === 'auto' ? 'selected' : ''}>Selon le pays (${(COUNTRY[S.country] || COUNTRY.FR).cur})</option>${curs.map(c => `<option value="${c}" ${S.currency === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
   <div class="setrow small">${cur === 'EUR' ? 'Les cotes Cardmarket sont en euros.' : `1 € = ${rate(cur) ? rate(cur).toLocaleString('fr-FR', { maximumFractionDigits: 4 }) + ' ' + cur : '?'} · ${RATES.approx ? 'taux approximatif (mise à jour BCE à la prochaine connexion)' : 'taux BCE du ' + esc(fmtDate(RATES.date))}`}</div>
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
   <div class="small" style="margin-top:10px">Données des cartes : TCGdex (fiches et images) et guide de prix public Cardmarket du ${esc(fmtDate(DB.generated))}. ${CARDS.length.toLocaleString('fr-FR')} cartes. CallIt! n'est pas affilié à Nintendo, The Pokémon Company ni Cardmarket.</div>
  </div>${tabs('reglages')}`;
}
function viewLangs() {
  const ex = excluded();
  const counts = {}; for (const c of CARDS) for (const l of c.langs) counts[l] = (counts[l] || 0) + 1;
  return `<div class="top">${backBtn()}<span class="sub" style="font-weight:600">Réglages</span><span style="width:44px"></span></div>
  <div class="pad"><h1 class="h1">Langues des cartes</h1><p class="sub" style="font-size:14px;margin:8px 0 0">Les langues exclues sont masquées des résultats. Elles restent consultables à tout moment avec « voir ».</p></div>
  <div class="sect small" style="font-weight:600;padding-top:16px">${ex.size ? ex.size + ' langue' + (ex.size > 1 ? 's' : '') + ' exclue' + (ex.size > 1 ? 's' : '') : 'Toutes les langues sont affichées'}</div>
  <div class="pad"><div class="panel" style="padding-top:0;padding-bottom:0">${LANGS.map(([c, n]) => { const off = ex.has(c); const note = c === S.nameLang ? 'Langue des noms' : c === 'it' && S.country === 'IT' ? 'Ton pays' : ASIA.has(c) ? ASIA_NOTE : ''; return `<div class="setrow"><div><div style="font-weight:600;font-size:15px;${off ? 'color:var(--muted2)' : ''}">${n}</div><div class="small">${note ? note + ' · ' : ''}${(counts[c] || 0).toLocaleString('fr-FR')} cartes</div></div><button class="toggle ${off ? 'off' : ''}" data-act="lang" data-v="${c}" aria-label="${off ? 'Afficher' : 'Exclure'} ${n}">${off ? 'Exclue' : 'Affichée'}</button></div>`; }).join('')}
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
  if (a === 'face' || a === 'welcome') { S.face = el.dataset.v; saveS(); applyTheme(); if (a === 'welcome') location.hash = '#/'; render(); }
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
  else if (a === 'vsort') { const y = window.scrollY; verSort = el.dataset.v; render(); window.scrollTo(0, y); }
  else if (a === 'idx') { idxTab = el.dataset.v; render(); }
  else if (a === 'hp') { histPeriod = +el.dataset.v; drawHist(); }
  else if (a === 'amore') { artistShown += 30; render(); }
  else if (a === 'lang') { const v = el.dataset.v; S.excluded = S.excluded.includes(v) ? S.excluded.filter(x => x !== v) : [...S.excluded, v]; saveS(); render(); }
  else if (a === 'unfilter') { const { q } = parseHash(); q.delete(el.dataset.k); location.hash = '#/recherche' + (q.toString() ? '?' + q : ''); }
  else if (a === 'export') exportCol();
  else if (a === 'wipe') ask('Effacer ta collection et tes réglages sur cet appareil ?', 'Tout effacer', () => { try { Object.keys(localStorage).filter(k => k.startsWith(STORE)).forEach(k => localStorage.removeItem(k)); } catch (e) {} location.hash = '#/'; location.reload(); });
});
document.addEventListener('change', e => {
  if (e.target.id === 'scanfile' && e.target.files[0]) { const f = e.target.files[0]; e.target.value = ''; runScan(f); return; }
  const el = e.target; const a = el.dataset && el.dataset.act; if (!a) return;
  if (a === 'sort') { S.sort = el.value; saveS(); shown = 60; render(); }
  else if (a === 'set') { S[el.dataset.k] = el.value; saveS(); render(); }
  else if (a === 'exclsearch') { S.exclSearch = el.checked; saveS(); }
  else if (a === 'anylang') { el.checked ? anyLang.add(el.dataset.key) : anyLang.delete(el.dataset.key); save('anyLang', [...anyLang]); toast(el.checked ? 'Cette carte s\'affichera dans toutes les langues' : 'Exception retirée'); }
  else if (a === 'import') importCol(el.files[0]);
  else if (a === 'hclean') { histClean = el.checked; drawHist(); }
});
let searchT;
document.addEventListener('input', e => {
  if (e.target.id === 'aq') { clearTimeout(searchT); searchT = setTimeout(() => { artistQ = e.target.value; artistShown = 30; const pos = e.target.selectionStart; render(); const i = document.getElementById('aq'); if (i) { i.focus(); i.setSelectionRange(pos, pos); } }, 150); return; }
  if (e.target.id === 'homeq') { const v = e.target.value; if (v.trim()) { focusSearch = true; location.hash = '#/recherche?q=' + encodeURIComponent(v); } return; }
  if (e.target.id !== 'q') return;
  clearTimeout(searchT);
  searchT = setTimeout(() => { const { q } = parseHash(); const v = e.target.value.trim(); v ? q.set('q', v) : q.delete('q'); history.replaceState(null, '', '#/recherche' + (q.toString() ? '?' + q : '')); render(true); }, 180);
});
document.addEventListener('submit', e => {
  if (e.target.dataset.act === 'magic') { e.preventDefault(); const v = e.target.email.value.trim(); if (v) sendMagicLink(v); return; }
  if (e.target.dataset.act !== 'search') return; e.preventDefault(); const i = e.target.querySelector('input'); i.blur();
});

function exportCol() {
  const blob = new Blob([JSON.stringify({ app: 'CallIt!', version: 1, exported: new Date().toISOString(), settings: S, collection, sealed: sealedCol, wish, anyLang: [...anyLang] }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'callit-collection-' + new Date().toISOString().slice(0, 10) + '.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function importCol(file) {
  if (!file) return;
  file.text().then(t => {
    const j = JSON.parse(t); if (!j || !Array.isArray(j.collection)) throw new Error('format');
    const known = j.collection.filter(it => it && BYKEY.has(it.key)); const ids = new Set(collection.map(x => x.id));
    const add = known.filter(it => !ids.has(it.id));
    ask(`Ajouter ${add.length} carte(s) à ta collection ?` + (j.collection.length - known.length ? ` (${j.collection.length - known.length} non reconnue(s) ignorée(s))` : ''), 'Ajouter', () => {
    collection.push(...add); saveCol(); if (Array.isArray(j.sealed)) { const sid = new Set(sealedCol.map(x => x.id)); sealedCol.push(...j.sealed.filter(x => x && x.pid && !sid.has(x.id))); saveSealed(); } (j.anyLang || []).forEach(k => anyLang.add(k)); save('anyLang', [...anyLang]); toast(add.length + ' carte(s) importée(s)'); render(); });
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
  else if (r === 'indices') { html = viewIndices(); title = 'Indices de prix · CallIt!'; }
  else html = G() ? viewGalerieHome() : viewMarcheHome();
  const active = document.activeElement, pos = active && active.id === 'q' ? active.selectionStart : null;
  app.innerHTML = html; document.title = title;
  if (r === 'carte') loadHist();
  if (focusSearch) { focusSearch = false; const i = document.getElementById('q'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
  if (keepFocus && pos != null) { const i = document.getElementById('q'); if (i) { i.focus(); i.setSelectionRange(pos, pos); } }
}
let focusSearch = false;
let lastRoute = '', navDepth = 0, goingBack = false; // pages visitées dans l'appli : « Retour » ne sort jamais du site
window.addEventListener('hashchange', () => { const r = location.hash.split('?')[0]; navDepth = r === '#/' || r === '' || r === '#' ? 0 : Math.max(0, navDepth + (goingBack ? -1 : 1)); goingBack = false; render(); if (r !== lastRoute) { window.scrollTo(0, 0); lastRoute = r; } });

(async function start() {
  document.body.dataset.face = G() ? 'galerie' : 'marche';
  app.innerHTML = `<div class="loading"><div class="title">${logo(30)}</div><div class="sub">Chargement des cartes…</div></div>`;
  try { await loadData(); } catch (e) {
    app.innerHTML = `<div class="loading"><div class="title">${logo(30)}</div><div class="sub">Impossible de charger les cartes. Vérifie ta connexion puis recharge la page.</div><button class="btn" onclick="location.reload()">Recharger</button></div>`; return;
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
