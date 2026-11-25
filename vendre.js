/* CallIt! · Vendre sur eBay : une annonce prête à copier pour une carte.
   Titre (80 signes max, comme eBay), description, état, langue, prix conseillés d'après la cote et les frais,
   et, si la carte a été mesurée dans « Centrage », ses photos et les mesures (en texte dans la description).
   L'utilisateur colle lui-même le tout dans le formulaire de vente d'eBay : rien n'est publié par CallIt!.
   Plus tard (accès à l'API de vente d'eBay) : publication directe, toujours après validation de chaque annonce.
   Fichier séparé de app.js : il réutilise ses fonctions (BYKEY, cardName, numLabel, setName, price, eur, CTR, agFace…). */
(function () {
  'use strict';
  if (typeof render !== 'function') return;

  const route = () => location.hash.replace(/^#\/?/, '').split(/[/?]/)[0];
  const isHere = () => DB && S.face && route() === 'vendre';
  const keyOf = () => decodeURIComponent((location.hash.split('/')[2] || '').split('?')[0]);
  const ebayDom = () => (COUNTRY[S.country] || COUNTRY.FR).ebay;

  // Décote par état : règle générale du marché (la cote Cardmarket est surtout faite de cartes NM), affichée comme estimation
  const COND_K = { MT: 1, NM: 1, EX: 0.85, GD: 0.72, LP: 0.6, PL: 0.45, PO: 0.3 };
  const LANG_TAG = { en: 'ENG', fr: 'FRA', it: 'ITA', de: 'GER', es: 'ESP', pt: 'POR', ja: 'JPN', ko: 'KOR', 'zh-tw': 'CHN', 'zh-cn': 'CHN', th: 'THA', id: 'IND' };
  // Frais eBay : particuliers sans frais de vente dans plusieurs pays européens (France, Italie, Allemagne, Royaume-Uni…),
  // professionnels environ 13 % + 0,35 €. Ordres de grandeur, à vérifier sur la page des frais d'eBay du pays.
  const FEES = { part: { k: 0, fix: 0, label: 'Particulier' }, pro: { k: 0.13, fix: 0.35, label: 'Professionnel' } };
  const V = Object.assign({ cond: 'NM', lang: null, seller: 'part', ship: 2 }, load('vendre', {}));
  const saveV = () => save('vendre', { cond: V.cond, seller: V.seller, ship: V.ship });

  const round = v => (v >= 20 ? Math.round(v) : v >= 5 ? Math.round(v * 2) / 2 : Math.max(0.99, Math.round(v * 10) / 10 - 0.01));
  function measures(c) {
    if (typeof CTR === 'undefined' || CTR.key !== c.key || typeof agFace !== 'function') return null;
    const rr = agFace('recto'), rv = agFace('verso');
    return rr || rv ? { rr, rv } : null;
  }
  function titleOf(c) {
    const lang = V.lang || (c.langs && c.langs[0]) || 'en';
    const parts = [cardName(c, lang) || cardName(c), numLabel(c), setName(c.set), LANG_TAG[lang] || lang.toUpperCase(), V.cond, GI.name];
    let t = parts.filter(Boolean).join(' ');
    if (t.length > 80) t = parts.filter((p, i) => i !== 2).filter(Boolean).join(' ');
    return t.slice(0, 80);
  }
  function descOf(c, m) {
    const lang = V.lang || (c.langs && c.langs[0]);
    const cond = (CONDS.find(x => x[0] === V.cond) || ['', V.cond])[1];
    const lines = [
      `${cardName(c, lang || undefined) || cardName(c)} · ${numLabel(c)} · ${setName(c.set)}${year(c.set) ? ' (' + year(c.set) + ')' : ''}`,
      `${F('Langue')} : ${lang ? (LANG[lang] || { name: lang }).name : '—'}`,
      `${F('État')} : ${cond} (${V.cond})`
    ];
    if (m) {
      lines.push('', F('Centrage mesuré sur photo :'));
      if (m.rr) lines.push(`${F('Recto')} : ${m.rr.labs[0]} ${m.rr.lr}/${100 - m.rr.lr} · ${m.rr.labs[1]} ${m.rr.tb}/${100 - m.rr.tb}`);
      if (m.rv) lines.push(`${F('Verso')} : ${m.rv.labs[0]} ${m.rv.lr}/${100 - m.rv.lr} · ${m.rv.labs[1]} ${m.rv.tb}/${100 - m.rv.tb}`);
      lines.push(F('Mesure indicative, faite sur photo : la note finale dépend aussi des coins, des bords et de la surface.'));
    }
    lines.push('', F('Envoi soigné : sleeve, toploader et enveloppe à bulles.'), F('Photos de la carte réelle.'));
    return lines.join('\n');
  }
  function prices(c) {
    const p = price(c); if (!p) return null;
    const ref = p * (COND_K[V.cond] || 1), f = FEES[V.seller];
    const fixed = round(ref * 1.05), start = round(ref * 0.7), fast = round(ref * 0.95);
    const net = v => v - (v + (+V.ship || 0)) * f.k - f.fix;
    return { ref, fixed, start, fast, net };
  }

  /* ---------- Photos ----------
     Règlement photos d'eBay : pas de bordure, de texte ni de filigrane ajoutés. On propose donc les photos telles quelles
     (celles de la mesure du centrage, sur l'appareil) ; les mesures vont dans la description, en texte. */
  function photoOf(side) {
    const f = side === CTR.side ? { img: CTR.img } : CTR.faces[side] || {};
    return f.img || null;
  }

  /* ---------- Vue ---------- */
  const B = (on, k, v, label) => `<button type="button" class="chip${on ? ' on' : ''}" data-vd="${k}" data-v="${esc(v)}" aria-pressed="${!!on}">${label}</button>`;
  function view(c) {
    const top = `<div class="top">${backBtn()}<span class="sub" style="font-weight:600">${F('Vendre sur eBay')}</span><span style="width:44px"></span></div>`;
    if (!c) return `${top}<div class="pad note">${F('Carte introuvable.')}</div>`;
    if (!V.lang || !(c.langs || []).includes(V.lang)) V.lang = (c.langs && c.langs[0]) || null;
    const m = measures(c), p = prices(c), t = titleOf(c), d = descOf(c, m), dom = ebayDom();
    const pics = m ? ['recto', 'verso'].map(s => photoOf(s) ? `<a class="vd-shot" href="${photoOf(s)}" download="${esc(c.key)}-${s}.jpg"><img src="${photoOf(s)}" alt="${F(s === 'recto' ? 'Recto' : 'Verso')}"><span class="small">${F('Enregistrer')}</span></a>` : '').join('') : '';
    const row = (lab, v, sub) => `<div class="between vd-row"><span>${lab}${sub ? `<span class="small"> · ${sub}</span>` : ''}</span><b class="num">${v}</b></div>`;
    return `${top}<div class="pad stack" style="gap:14px">
      <div class="panel row" style="gap:14px;align-items:center"><span class="ag-thumb">${cimg(c, { lang: V.lang || undefined })}</span><span class="stack" style="gap:4px"><b style="font-size:18px">${esc(cardName(c, V.lang || undefined) || cardName(c))}</b><span class="small">${esc(setName(c.set))} · ${esc(numLabel(c))}</span></span></div>
      <div class="panel stack" style="gap:8px">
        <div class="chips"><span class="small" style="font-weight:600;align-self:center">${F('État')}</span>${CONDS.map(([k, n]) => B(V.cond === k, 'cond', k, k)).join('')}</div>
        ${c.langs && c.langs.length > 1 ? `<div class="chips"><span class="small" style="font-weight:600;align-self:center">${F('Langue')}</span>${c.langs.map(l => B(V.lang === l, 'lang', l, esc((LANG[l] || { short: l }).short))).join('')}</div>` : ''}
        <div class="chips"><span class="small" style="font-weight:600;align-self:center">${F('Je vends en')}</span>${Object.entries(FEES).map(([k, f]) => B(V.seller === k, 'seller', k, F(f.label))).join('')}</div>
      </div>
      <div class="panel stack" style="gap:2px"><h2 class="h2" style="margin-bottom:6px">${F('Prix conseillés')}</h2>
        ${p ? `${row(F('Cote de référence'), eur(p.ref), V.cond !== 'NM' && V.cond !== 'MT' ? F('estimation pour l’état {0}', V.cond) : F('toutes langues'))}
        ${row(F('Prix fixe'), eur(p.fixed), F('un peu au-dessus de la cote, laisse de la place aux offres'))}
        ${row(F('Vente rapide'), eur(p.fast))}
        ${row(F('Enchère : prix de départ'), eur(p.start), F('plus bas, plus d’enchérisseurs, mais plus de risque'))}
        <div class="small" style="margin-top:8px">${V.seller === 'part' ? F('En particulier, eBay ne prend pas de frais de vente dans plusieurs pays d’Europe (France, Italie, Allemagne, Royaume-Uni…) : vérifie pour ton pays.') : F('En professionnel, compte environ 13 % + 0,35 € de frais eBay : au prix fixe, il te resterait environ {0}.', eur(p.net(p.fixed)))}</div>`
        : `<div class="note">${F('Pas encore de cote pour cette carte : regarde les ventes terminées sur eBay avant de fixer ton prix.')}</div>`}
        <a class="small" href="https://www.ebay.${dom}/sch/i.html?_nkw=${encodeURIComponent(t.split(' ').slice(0, 3).join(' '))}&LH_Sold=1&LH_Complete=1" target="_blank" rel="noopener" style="margin-top:6px">${F('Voir les ventes terminées sur eBay')}</a></div>
      <div class="panel stack" style="gap:8px"><div class="between"><b>${F('Titre')}</b><span class="small">${t.length}/80</span></div><div class="vd-copy" id="vd-t">${esc(t)}</div><button class="btn small" type="button" data-vd="copy" data-v="vd-t" style="align-self:flex-start">${F('Copier le titre')}</button></div>
      <div class="panel stack" style="gap:8px"><b>${F('Description')}</b><div class="vd-copy" id="vd-d" style="white-space:pre-wrap">${esc(d)}</div><button class="btn small" type="button" data-vd="copy" data-v="vd-d" style="align-self:flex-start">${F('Copier la description')}</button></div>
      <div class="panel stack" style="gap:8px"><b>${F('Photos')}</b>
        ${m ? `<div class="small">${F('Tes photos de la mesure du centrage : enregistre-les et ajoute-les à l’annonce, avec des photos nettes des coins et du dos. Les mesures sont dans la description : eBay interdit d’ajouter du texte, un cadre ou un logo sur les photos.')}</div><div class="row vd-shots">${pics}</div>`
          : `<div class="small">${F('Mesure le centrage de ta carte : tu pourras joindre la photo avec les mesures, un vrai plus pour les acheteurs.')}</div><a class="btn small" href="#/centrage" data-vd="ctr" style="align-self:flex-start">${F('Mesurer le centrage')}</a>`}</div>
      <a class="btn primary" href="https://www.ebay.${dom}/sl/sell" target="_blank" rel="noopener">${F('Ouvrir le formulaire de vente eBay')}</a>
      <div class="small">${F('Colle le titre et la description, ajoute tes photos et ton prix. C’est toi qui publies l’annonce : CallIt! ne se connecte jamais à ton compte eBay.')}</div>
    </div>`;
  }

  document.addEventListener('click', ev => {
    const b = ev.target.closest && ev.target.closest('[data-vd]'); if (!b || !isHere()) return;
    const k = b.dataset.vd, v = b.dataset.v;
    if (k === 'cond') { V.cond = v; saveV(); render(); }
    else if (k === 'lang') { V.lang = v; render(); }
    else if (k === 'seller') { V.seller = v; saveV(); render(); }
    else if (k === 'copy') { const el = document.getElementById(v); if (el && navigator.clipboard) navigator.clipboard.writeText(el.textContent).then(() => toast(F('Copié')), () => toast(F('Copie impossible : sélectionne le texte'))); }
    else if (k === 'ctr') { const c = BYKEY.get(keyOf()); if (c && typeof CTR !== 'undefined') CTR.key = c.key; }
  });

  /* ---------- Branchement dans l'appli ---------- */
  const baseRender = render;
  render = function (keepFocus) {
    if (isHere()) {
      document.body.dataset.face = G() ? 'galerie' : 'marche';
      const c = BYKEY.get(keyOf());
      app.innerHTML = view(c); document.title = tr('Vendre sur eBay') + ' · CallIt!';
      return;
    }
    baseRender(keepFocus);
    const r = route();
    // Fiche carte : un bouton « Vendre sur eBay » sous « Ajouter à ma collection »
    if (DB && S.face && r === 'carte') {
      const key = decodeURIComponent((location.hash.split('/')[2] || '').split('?')[0]), btns = app.querySelector('.pad.btns');
      if (BYKEY.get(key) && btns && !app.querySelector('.vd-entry')) btns.insertAdjacentHTML('afterend', `<div class="pad vd-entry" style="margin-top:8px"><a class="linkbtn" href="#/vendre/${encodeURIComponent(key)}">${F('Vendre cette carte sur eBay')}</a></div>`);
    }
    // « À grader ? » : créer l'annonce avec les mesures
    if (DB && S.face && r === 'a-grader' && typeof CTR !== 'undefined' && CTR.key && BYKEY.get(CTR.key)) {
      const v = app.querySelector('.ag-verdict');
      if (v && !app.querySelector('.vd-entry')) v.insertAdjacentHTML('afterend', `<a class="btn vd-entry" href="#/vendre/${encodeURIComponent(CTR.key)}" style="align-self:center">${F('Créer une annonce eBay avec ces mesures')}</a>`);
    }
  };
  if (isHere()) render();
})();
