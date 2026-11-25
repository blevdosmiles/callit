/* CallIt! · Vendre sur eBay : une annonce prête à copier pour une carte.
   Titre (80 signes max, comme eBay), description, état, langue, prix conseillés d'après la cote et les frais,
   et, si la carte a été mesurée dans « Centrage », ses photos et les mesures (en texte dans la description).
   L'utilisateur colle lui-même le tout dans le formulaire de vente d'eBay : rien n'est publié par CallIt!.
   Plus tard (accès à l'API de vente d'eBay) : publication directe, toujours après validation de chaque annonce.
   Versions Facebook (groupes, Marketplace) et Vinted. Livraison : envoi et/ou remise en main propre (villes).
   Version Facebook (groupes, Marketplace) : texte à coller et photos avec les mesures et une petite mention CallIt!.
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
  const V = Object.assign({ cond: 'NM', lang: null, seller: 'part', ship: 2, where: 'ebay', post: true, hand: false, cities: '', mention: false }, load('vendre', {}));
  const marked = new Map(); // images Facebook avec mesures et petite mention CallIt!, créées sur l'appareil
  const saveV = () => save('vendre', { cond: V.cond, seller: V.seller, ship: V.ship, where: V.where, post: V.post, hand: V.hand, cities: V.cities, mention: V.mention });

  // Vinted : un site par pays (pas de site pour la Suisse ni la Norvège : on propose la France par défaut)
  const VINTED = { FR: 'fr', BE: 'be', LU: 'lu', MC: 'fr', IT: 'it', DE: 'de', AT: 'at', ES: 'es', PT: 'pt', NL: 'nl', IE: 'ie', GB: 'co.uk', PL: 'pl', CZ: 'cz', SK: 'sk',
    LT: 'lt', LV: 'lv', EE: 'ee', FI: 'fi', SE: 'se', DK: 'dk', HU: 'hu', RO: 'ro', HR: 'hr', GR: 'gr', SI: 'si', US: 'com' };
  const vintedDom = () => VINTED[S.country] || 'fr';
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
    lines.push('');
    if (V.post) lines.push(F('Envoi soigné (sleeve, toploader, enveloppe à bulles){0}.', +V.ship > 0 ? ' : ' + money(+V.ship, userCur()) : ''));
    if (V.hand) lines.push(V.cities.trim() ? F('Remise en main propre possible : {0}.', V.cities.trim()) : F('Remise en main propre possible.'));
    lines.push(F('Photos de la carte réelle.'));
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

  // Facebook (groupes, Marketplace) : on peut y ajouter les traits de mesure et une petite mention CallIt!.
  // Jamais pour eBay (règlement photos). Tout est dessiné sur l'appareil, rien n'est envoyé.
  function annotate(side, r) {
    const f = side === CTR.side ? { img: CTR.img, L: CTR.L } : CTR.faces[side] || {};
    if (!f.img || !f.L) return Promise.resolve(null);
    return new Promise(ok => {
      const im = new Image();
      im.onload = () => {
        const w = im.naturalWidth, h = im.naturalHeight, band = Math.round(Math.max(48, h * 0.07)), L = f.L;
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h + band;
        const g = cv.getContext('2d'); g.drawImage(im, 0, 0); g.lineWidth = Math.max(2, Math.round(w / 300));
        const line = (i, col, vert) => { g.strokeStyle = col; g.beginPath(); if (vert) { const x = L[i] / 100 * w; g.moveTo(x, 0); g.lineTo(x, h); } else { const y = L[i] / 100 * h; g.moveTo(0, y); g.lineTo(w, y); } g.stroke(); };
        [0, 3].forEach(i => line(i, '#0a7a44', true)); [1, 2].forEach(i => line(i, '#d9a23a', true));
        [4, 7].forEach(i => line(i, '#0a7a44', false)); [5, 6].forEach(i => line(i, '#d9a23a', false));
        g.fillStyle = '#16161a'; g.fillRect(0, h, w, band); g.textBaseline = 'middle';
        g.fillStyle = '#fff'; g.font = `600 ${Math.round(band * 0.36)}px system-ui, sans-serif`;
        g.fillText(`${side === 'recto' ? F('Recto') : F('Verso')} · ${r.labs[0]} ${r.lr}/${100 - r.lr} · ${r.labs[1]} ${r.tb}/${100 - r.tb}`, band * 0.3, h + band * 0.38);
        g.fillStyle = '#c9c9c2'; g.font = `${Math.round(band * 0.24)}px system-ui, sans-serif`;
        g.fillText(F('Centrage mesuré avec CallIt! · callitcards.com'), band * 0.3, h + band * 0.75);
        ok(cv.toDataURL('image/jpeg', 0.9));
      };
      im.onerror = () => ok(null); im.src = f.img;
    });
  }
  async function makeMarked(c, m) {
    for (const [side, r] of [['recto', m.rr], ['verso', m.rv]]) if (r && !marked.has(c.key + side)) marked.set(c.key + side, await annotate(side, r));
    if (isHere()) render();
  }
  function fbText(c, p, m) {
    return [titleOf(c), F('Prix : {0}', p ? eur(p.fixed) : F('à fixer')), '', descOf(c, m), ...(V.mention ? ['', F('Mesuré avec CallIt!')] : [])].join('\n');
  }
  const noMeasure = () => `<div class="small">${F('Mesure le centrage de ta carte : tu pourras joindre la photo avec les mesures, un vrai plus pour les acheteurs.')}</div><a class="btn small" href="#/centrage" data-vd="ctr" style="align-self:flex-start">${F('Mesurer le centrage')}</a>`;
  function fbBlock(c, p, m) {
    if (m && ['recto', 'verso'].some(sd => m[sd === 'recto' ? 'rr' : 'rv'] && !marked.has(c.key + sd))) setTimeout(() => makeMarked(c, m));
    const pics = ['recto', 'verso'].map(sd => marked.get(c.key + sd) ? `<a class="vd-shot" href="${marked.get(c.key + sd)}" download="${esc(c.key)}-${sd}-centrage.jpg"><img src="${marked.get(c.key + sd)}" alt="${F(sd === 'recto' ? 'Recto' : 'Verso')}"><span class="small">${F('Enregistrer')}</span></a>` : '').join('');
    return `<div class="panel stack" style="gap:8px"><b>${F('Texte à coller')}</b><div class="vd-copy" id="vd-fb" style="white-space:pre-wrap">${esc(fbText(c, p, m))}</div><label class="row small" style="gap:8px"><input type="checkbox" data-vd-chk="mention" ${V.mention ? 'checked' : ''}>${F('Ajouter « Mesuré avec CallIt! » à la fin du texte (la mention est déjà sur la photo)')}</label><button class="btn small" type="button" data-vd="copy" data-v="vd-fb" style="align-self:flex-start">${F('Copier le texte')}</button></div>
      <div class="panel stack" style="gap:8px"><b>${F('Photos')}</b>
        ${m ? (pics ? `<div class="small">${F('Photos avec les mesures et une petite mention CallIt! : enregistre-les, puis ajoute-les avec des photos nettes des coins et du dos.')}</div><div class="row vd-shots">${pics}</div>` : `<div class="small">${F('Préparation des photos avec les mesures…')}</div>`) : noMeasure()}</div>
      ${navigator.share ? `<button class="btn primary" type="button" data-vd="share">${F('Partager vers Facebook')}</button><div class="small">${F('Le texte est copié, puis le menu de partage s’ouvre avec les photos : choisis Facebook (ou Messenger, WhatsApp…) et colle le texte dans ta publication. Facebook ne laisse pas une appli remplir le texte à ta place.')}</div>` : ''}
      <a class="btn${navigator.share ? '' : ' primary'}" href="https://www.facebook.com/marketplace/create/item" target="_blank" rel="noopener">${F('Ouvrir Facebook Marketplace')}</a>
      <div class="small">${F('Tu peux aussi coller le texte dans un groupe de vente de cartes : chaque groupe a ses propres règles (format, prix obligatoire, mentions autorisées), lis-les avant de publier. Sur Marketplace, les photos doivent montrer la vraie carte que tu vends. C’est toi qui publies : CallIt! ne se connecte jamais à ton compte Facebook.')}</div>`;
  }

  // Partage (téléphone surtout) : copie le texte, puis ouvre le menu de partage du système avec les photos
  async function share(c) {
    if (!c || !navigator.share) return;
    const el = document.getElementById('vd-fb'), text = el ? el.textContent : titleOf(c);
    try { if (navigator.clipboard) await navigator.clipboard.writeText(text); } catch (e) {}
    const files = [];
    for (const sd of ['recto', 'verso']) {
      const u = marked.get(c.key + sd); if (!u) continue;
      try { const bin = atob(u.split(',')[1]), arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i); const b = new Blob([arr], { type: 'image/jpeg' }); files.push(new File([b], c.key.replace(/[^a-z0-9-]/gi, '_') + '-' + sd + '.jpg', { type: 'image/jpeg' })); } catch (e) {}
    }
    const data = files.length && navigator.canShare && navigator.canShare({ files }) ? { files, text } : { text, url: 'https://callitcards.com/' };
    try { await navigator.share(data); } catch (e) { if (e && e.name !== 'AbortError') toast(F('Partage impossible : enregistre les photos et colle le texte.')); }
  }

  /* ---------- Vue ---------- */
  const B = (on, k, v, label) => `<button type="button" class="chip${on ? ' on' : ''}" data-vd="${k}" data-v="${esc(v)}" aria-pressed="${!!on}">${label}</button>`;
  function vintedBlock(c, t, d, m, pics) {
    const dom = vintedDom();
    return `<div class="panel stack" style="gap:8px"><b>${F('Titre')}</b><div class="vd-copy" id="vd-t">${esc(t)}</div><button class="btn small" type="button" data-vd="copy" data-v="vd-t" style="align-self:flex-start">${F('Copier le titre')}</button></div>
      <div class="panel stack" style="gap:8px"><b>${F('Description')}</b><div class="vd-copy" id="vd-d" style="white-space:pre-wrap">${esc(d)}</div><button class="btn small" type="button" data-vd="copy" data-v="vd-d" style="align-self:flex-start">${F('Copier la description')}</button></div>
      <div class="panel stack" style="gap:8px"><b>${F('Photos')}</b>
        ${m ? `<div class="small">${F('Tes photos telles quelles, sans ajout : enregistre-les et ajoute-les avec des photos nettes des coins et du dos. Les mesures sont dans la description.')}</div><div class="row vd-shots">${pics}</div>` : noMeasure()}</div>
      <a class="btn primary" href="https://www.vinted.${dom}/items/new" target="_blank" rel="noopener">${F('Ouvrir Vinted pour vendre')}</a>
      <div class="small">${F('Sur Vinted, choisis la catégorie des cartes à collectionner, colle le titre et la description, ajoute tes photos et ton prix. Les frais d’envoi se règlent dans Vinted ; la remise en main propre n’existe pas dans tous les pays. C’est toi qui publies : CallIt! ne se connecte jamais à ton compte Vinted.')}</div>
`;
  }
  function ebayBlock(c, t, d, m, pics, dom) {
    return `<div class="panel stack" style="gap:8px"><div class="between"><b>${F('Titre')}</b><span class="small">${t.length}/80</span></div><div class="vd-copy" id="vd-t">${esc(t)}</div><button class="btn small" type="button" data-vd="copy" data-v="vd-t" style="align-self:flex-start">${F('Copier le titre')}</button></div>
      <div class="panel stack" style="gap:8px"><b>${F('Description')}</b><div class="vd-copy" id="vd-d" style="white-space:pre-wrap">${esc(d)}</div><button class="btn small" type="button" data-vd="copy" data-v="vd-d" style="align-self:flex-start">${F('Copier la description')}</button></div>
      <div class="panel stack" style="gap:8px"><b>${F('Photos')}</b>
        ${m ? `<div class="small">${F('Tes photos de la mesure du centrage : enregistre-les et ajoute-les à l’annonce, avec des photos nettes des coins et du dos. Les mesures sont dans la description : eBay interdit d’ajouter du texte, un cadre ou un logo sur les photos.')}</div><div class="row vd-shots">${pics}</div>`
          : noMeasure()}</div>
      <a class="btn primary" href="https://www.ebay.${dom}/sl/sell" target="_blank" rel="noopener">${F('Ouvrir le formulaire de vente eBay')}</a>
      <div class="small">${F('Colle le titre et la description, ajoute tes photos et ton prix. C’est toi qui publies l’annonce : CallIt! ne se connecte jamais à ton compte eBay.')}</div>
`;
  }
  function view(c) {
    const top = `<div class="top">${backBtn()}<span class="sub" style="font-weight:600">${F('Vendre ma carte')}</span><span style="width:44px"></span></div>`;
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
        <div class="chips"><span class="small" style="font-weight:600;align-self:center">${F('Sur')}</span>${B(V.where === 'ebay', 'where', 'ebay', 'eBay')}${B(V.where === 'fb', 'where', 'fb', 'Facebook')}${B(V.where === 'vinted', 'where', 'vinted', 'Vinted')}</div>
        ${V.where === 'ebay' ? `<div class="chips"><span class="small" style="font-weight:600;align-self:center">${F('Je vends en')}</span>${Object.entries(FEES).map(([k, f]) => B(V.seller === k, 'seller', k, F(f.label))).join('')}</div>` : ''}
      </div>
      <div class="panel stack" style="gap:10px"><b>${F('Livraison')}</b>
        <label class="row" style="gap:8px;align-items:center"><input type="checkbox" data-vd-chk="post" ${V.post ? 'checked' : ''}><span>${F('Envoi par la poste')}</span>${V.post ? `<input class="fld" data-vd-in="ship" inputmode="decimal" value="${esc(String(V.ship).replace('.', ','))}" style="width:90px;margin-left:auto" aria-label="${F('Frais de port')}"><span class="small">${esc(userCur())}</span>` : ''}</label>
        <label class="row" style="gap:8px;align-items:center"><input type="checkbox" data-vd-chk="hand" ${V.hand ? 'checked' : ''}><span>${F('Remise en main propre')}</span></label>
        ${V.hand ? `<input class="fld" data-vd-in="cities" placeholder="${F('Villes ou lieux, ex. Rome, Bracciano, salon de Milan')}" value="${esc(V.cities)}">` : ''}
        <div class="small">${F('Ces informations sont ajoutées à la description.')}</div></div>
      <div class="panel stack" style="gap:2px"><h2 class="h2" style="margin-bottom:6px">${F('Prix conseillés')}</h2>
        ${p ? `${row(F('Cote de référence'), eur(p.ref), V.cond !== 'NM' && V.cond !== 'MT' ? F('estimation pour l’état {0}', V.cond) : F('toutes langues'))}
        ${row(F('Prix fixe'), eur(p.fixed), F('un peu au-dessus de la cote, laisse de la place aux offres'))}
        ${row(F('Vente rapide'), eur(p.fast))}
        ${V.where === 'ebay' ? row(F('Enchère : prix de départ'), eur(p.start), F('plus bas, plus d’enchérisseurs, mais plus de risque')) : ''}
        <div class="small" style="margin-top:8px">${V.where === 'vinted' ? F('Sur Vinted, le vendeur ne paie pas de frais de vente : c’est l’acheteur qui paie la protection acheteurs et le port.') : V.where === 'fb' ? F('Sur Facebook, pas de commission en remise en main propre ; une vente avec envoi via Marketplace peut avoir des frais : vérifie au moment de publier.') : V.seller === 'part' ? F('En particulier, eBay ne prend pas de frais de vente dans plusieurs pays d’Europe (France, Italie, Allemagne, Royaume-Uni…) : vérifie pour ton pays.') : F('En professionnel, compte environ 13 % + 0,35 € de frais eBay : au prix fixe, il te resterait environ {0}.', eur(p.net(p.fixed)))}</div>`
        : `<div class="note">${F('Pas encore de cote pour cette carte : regarde les ventes terminées sur eBay avant de fixer ton prix.')}</div>`}
        <a class="small" href="https://www.ebay.${dom}/sch/i.html?_nkw=${encodeURIComponent(t.split(' ').slice(0, 3).join(' '))}&LH_Sold=1&LH_Complete=1" target="_blank" rel="noopener" style="margin-top:6px">${F('Voir les ventes terminées sur eBay')}</a></div>
      ${V.where === 'fb' ? fbBlock(c, p, m) : V.where === 'vinted' ? vintedBlock(c, t, d, m, pics) : ebayBlock(c, t, d, m, pics, dom)}
    </div>`;
  }

  document.addEventListener('change', ev => {
    const t = ev.target; if (!isHere() || !t.dataset) return;
    if (t.dataset.vdChk) { V[t.dataset.vdChk] = t.checked; saveV(); render(); }
    else if (t.dataset.vdIn === 'ship') { const v = parseFloat(String(t.value).replace(',', '.')); V.ship = isNaN(v) || v < 0 ? 0 : v; saveV(); render(); }
    else if (t.dataset.vdIn === 'cities') { V.cities = t.value.slice(0, 120); saveV(); render(); }
  });
  document.addEventListener('click', ev => {
    const b = ev.target.closest && ev.target.closest('[data-vd]'); if (!b || !isHere()) return;
    const k = b.dataset.vd, v = b.dataset.v;
    if (k === 'cond') { V.cond = v; saveV(); render(); }
    else if (k === 'where') { V.where = v; saveV(); render(); }
    else if (k === 'lang') { V.lang = v; render(); }
    else if (k === 'seller') { V.seller = v; saveV(); render(); }
    else if (k === 'share') share(BYKEY.get(keyOf()));
    else if (k === 'copy') { const el = document.getElementById(v); if (el && navigator.clipboard) navigator.clipboard.writeText(el.textContent).then(() => toast(F('Copié')), () => toast(F('Copie impossible : sélectionne le texte'))); }
    else if (k === 'ctr') { const c = BYKEY.get(keyOf()); if (c && typeof CTR !== 'undefined') CTR.key = c.key; }
  });

  /* ---------- Branchement dans l'appli ---------- */
  const baseRender = render;
  render = function (keepFocus) {
    if (isHere()) {
      document.body.dataset.face = G() ? 'galerie' : 'marche';
      const c = BYKEY.get(keyOf());
      app.innerHTML = view(c); document.title = tr('Vendre ma carte') + ' · CallIt!';
      return;
    }
    baseRender(keepFocus);
    const r = route();
    // Fiche carte : un bouton « Vendre sur eBay » sous « Ajouter à ma collection »
    if (DB && S.face && r === 'carte') {
      const key = decodeURIComponent((location.hash.split('/')[2] || '').split('?')[0]), btns = app.querySelector('.pad.btns');
      if (BYKEY.get(key) && btns && !app.querySelector('.vd-entry')) btns.insertAdjacentHTML('afterend', `<div class="pad vd-entry" style="margin-top:8px"><a class="linkbtn" href="#/vendre/${encodeURIComponent(key)}">${F('Vendre cette carte (eBay, Facebook)')}</a></div>`);
    }
    // « À grader ? » : créer l'annonce avec les mesures
    if (DB && S.face && r === 'a-grader' && typeof CTR !== 'undefined' && CTR.key && BYKEY.get(CTR.key)) {
      const v = app.querySelector('.ag-verdict');
      if (v && !app.querySelector('.vd-entry')) v.insertAdjacentHTML('afterend', `<a class="btn vd-entry" href="#/vendre/${encodeURIComponent(CTR.key)}" style="align-self:center">${F('Créer une annonce avec ces mesures')}</a>`);
    }
  };
  if (isHere()) render();
})();
