'use strict';
/* Traduction de l'interface.
   Le texte de l'appli est écrit en français dans app.js. Ce fichier le traduit à l'affichage, avec les
   dictionnaires i18n/<langue>.json (clé = texte français, valeur = traduction).
   Les nombres et les prix sont remplacés par {#} dans les clés, puis remis à leur place dans la traduction. */
const UI_LANGS = { en: 'English', fr: 'Français', de: 'Deutsch', es: 'Español', it: 'Italiano' };
const LOCALES = { fr: 'fr-FR', en: 'en-GB', de: 'de-DE', es: 'es-ES', it: 'it-IT' };
function pickUiLang() {
  try { const s = JSON.parse(localStorage.getItem('callit.v1.settings') || '{}'); if (s.ui && UI_LANGS[s.ui]) return s.ui; } catch (e) { /* stockage indisponible */ }
  const pref = (navigator.languages || [navigator.language || 'en']).map(x => String(x).slice(0, 2).toLowerCase()).find(x => UI_LANGS[x]);
  return pref || 'en';
}
const UI = pickUiLang();
const LOCALE = LOCALES[UI];
document.documentElement.lang = UI;
let I18N = null, I18N_SUB = [];
const i18nCache = new Map();
const NUM_RE = /[-+−]?(?:[€$£¥]\s?)?\d(?:[\d   .,']*\d)?(?:\s?[€$£¥%])?/g;
const i18nKey = t => t.replace(NUM_RE, '{#}');

const i18nReady = UI === 'fr' ? Promise.resolve() : fetch('i18n/' + UI + '.json').then(r => r.ok ? r.json() : {}).then(d => {
  I18N = d;
  // Remplacement de morceaux de phrase (pour les textes qui contiennent un nom de carte ou de set)
  I18N_SUB = Object.keys(d).filter(k => k.length >= 8 && / /.test(k) && !k.includes('{#}')).sort((a, b) => b.length - a.length);
  i18nCache.clear();
}).catch(() => { I18N = {}; });

function tr(text) {
  if (!I18N || !text) return text;
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(text); const core = m[2];
  if (!core || !/[A-Za-zÀ-ÿ]/.test(core)) return text;
  if (i18nCache.has(core)) return m[1] + i18nCache.get(core) + m[3];
  let out = I18N[core];
  if (out == null) {
    const nums = core.match(NUM_RE);
    if (nums) { const v = I18N[i18nKey(core)]; if (v != null) { let k = 0; out = v.replace(/\{#\}/g, () => nums[k++] || ''); } }
  }
  if (out == null) {
    let s = core, hit = false;
    for (const k of I18N_SUB) if (s.includes(k)) { s = s.split(k).join(I18N[k]); hit = true; }
    out = hit ? s : core;
  }
  if (i18nCache.size > 5000) i18nCache.clear();
  i18nCache.set(core, out);
  return m[1] + out + m[3];
}

// Phrase avec des morceaux variables : F('Sortie le {0} dans {1}.', date, set). La clé du dictionnaire garde les {0}, {1}…
function F(key, ...args) {
  const v = (I18N && I18N[key]) || key;
  return v.replace(/\{(\d)\}/g, (m, i) => args[+i] == null ? '' : args[+i]);
}
// Liste lisible dans la langue de l'appli : « a, b et c » / « a, b and c »
function andList(xs) {
  try { return new Intl.ListFormat(LOCALE, { style: 'long', type: 'conjunction' }).format(xs.map(String)); } catch (e) { return xs.join(', '); }
}

const I18N_ATTRS = ['placeholder', 'aria-label', 'title'];
function i18nApply(root) {
  if (!I18N || !root) return;
  if (root.nodeType === 3) { const v = tr(root.nodeValue); if (v !== root.nodeValue) root.nodeValue = v; return; }
  if (root.nodeType !== 1) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => { const p = n.parentNode; return p && (p.closest('script,style,textarea,[data-noi18n]')) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT; } });
  const nodes = []; while (w.nextNode()) nodes.push(w.currentNode);
  for (const n of nodes) { const v = tr(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v; }
  const els = root.querySelectorAll ? [root, ...root.querySelectorAll('[placeholder],[aria-label],[title]')] : [];
  for (const el of els) for (const a of I18N_ATTRS) { const v0 = el.getAttribute && el.getAttribute(a); if (v0) { const v = tr(v0); if (v !== v0) el.setAttribute(a, v); } }
}
i18nReady.then(() => {
  if (UI === 'fr') return;
  const go = () => { i18nApply(document.body); new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) i18nApply(n); }).observe(document.body, { childList: true, subtree: true }); };
  if (document.body) go(); else document.addEventListener('DOMContentLoaded', go);
});
