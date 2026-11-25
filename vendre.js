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
  const COND_DEF = {
    MT: 'Parfaite, comme sortie du booster : aucun défaut, même de près.',
    NM: 'Presque parfaite : au plus un ou deux défauts minuscules, comme un petit point blanc sur un bord.',
    EX: 'Petits défauts visibles : bords ou coins un peu blanchis, légères rayures. Aucun pli.',
    GD: 'Usure nette : coins et bords blanchis, rayures sur la surface. Aucun pli.',
    LP: 'Bien jouée : forte usure, petit pli ou marque possibles.',
    PL: 'Très jouée : plis, marques, salissures. La carte reste entière.',
    PO: 'Abîmée : gros pli, déchirure, trace d’eau ou écriture.'
  };
  const COND_K = { MT: 1, NM: 1, EX: 0.85, GD: 0.72, LP: 0.6, PL: 0.45, PO: 0.3 };
  const LANG_TAG = { en: 'ENG', fr: 'FRA', it: 'ITA', de: 'GER', es: 'ESP', pt: 'POR', ja: 'JPN', ko: 'KOR', 'zh-tw': 'CHN', 'zh-cn': 'CHN', th: 'THA', id: 'IND' };
  // Frais eBay : particuliers sans frais de vente dans plusieurs pays européens (France, Italie, Allemagne, Royaume-Uni…),
  // professionnels environ 13 % + 0,35 €. Ordres de grandeur, à vérifier sur la page des frais d'eBay du pays.
  const FEES = { part: { k: 0, fix: 0, label: 'Particulier' }, pro: { k: 0.13, fix: 0.35, label: 'Professionnel' } };
  const V = Object.assign({ cond: 'NM', lang: null, seller: 'part', ship: 2, where: 'ebay', fmt: 'fixe', post: true, hand: false, cities: '', mention: false }, load('vendre', {}));
  let step = 1, lastKey = null, anim = false; // anim : l'étape vient de s'ouvrir (l'animation ne rejoue pas à chaque choix) // étape ouverte (1 la carte, 2 livraison, 3 prix, 4 annonce) ; les autres sont repliées
  const ASK = new Map(); // prix choisi par l'utilisateur, par carte : { fixe, start }. CallIt! conseille, il décide.
  const marked = new Map(); // images Facebook avec mesures et petite mention CallIt!, créées sur l'appareil
  const saveV = () => save('vendre', { cond: V.cond, seller: V.seller, ship: V.ship, where: V.where, fmt: V.fmt, post: V.post, hand: V.hand, cities: V.cities, mention: V.mention });

  // Vinted : un site par pays (pas de site pour la Suisse ni la Norvège : on propose la France par défaut)
  const VINTED = { FR: 'fr', BE: 'be', LU: 'lu', MC: 'fr', IT: 'it', DE: 'de', AT: 'at', ES: 'es', PT: 'pt', NL: 'nl', IE: 'ie', GB: 'co.uk', PL: 'pl', CZ: 'cz', SK: 'sk',
    LT: 'lt', LV: 'lv', EE: 'ee', FI: 'fi', SE: 'se', DK: 'dk', HU: 'hu', RO: 'ro', HR: 'hr', GR: 'gr', SI: 'si', US: 'com' };
  const vintedDom = () => VINTED[S.country] || 'fr';
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
  // Repères de prix : la cote (toutes langues, surtout des cartes NM) et des conseils. Le prix final, c'est le vendeur qui le choisit.
  // Écart moyen selon la langue, par rapport à la cote toutes langues : ESTIMATION générale, en attendant un calcul
  // sur les annonces eBay de chaque langue et de chaque pays (API Browse, dès que les clés eBay sont actives).
  const LANG_K = { en: 1, fr: 0.9, ja: 0.9, de: 0.8, it: 0.8, es: 0.8, pt: 0.75, ko: 0.65, 'zh-tw': 0.65, 'zh-cn': 0.6, th: 0.55, id: 0.55 };
  function suggest(c, r) {
    if (!r) return null;
    const lang = V.lang || (c.langs && c.langs[0]), kc = COND_K[V.cond] || 1, kl = LANG_K[lang] || 1;
    return { v: +roundP(r.v * kc * kl).toFixed(2), kc, kl };
  }
  function refOf(c) {
    const v = price(c); if (!v) return null;
    const q = PKM && typeof quote === 'function' ? quote(c) : null;
    return { v, lo: q ? q.lo : null, hi: q ? q.hi : null };
  }
  function advice(c) {
    const out = [], lang = V.lang || (c.langs && c.langs[0]);
    const lname = lang && typeof LANG_OF !== 'undefined' && LANG_OF[lang] ? LANG_OF[lang] : null;
    if (COND_K[V.cond] < 1) out.push(F('État {0} : environ −{1} %, une carte moins belle part en général sous la cote.', V.cond, Math.round((1 - COND_K[V.cond]) * 100)));
    const kl = LANG_K[lang] || 1;
    if (kl < 1 && lname) out.push(F('Version {0} : environ −{1} %, elle se vend souvent moins cher que la cote, qui mélange toutes les langues.', lname, Math.round((1 - kl) * 100)));
    else if (lang === 'en') out.push(F('Version anglaise : la plus recherchée, en général au niveau de la cote.'));
    return out;
  }
  const ask = c => ASK.get(c.key) || {};
  const askNum = (c, k) => { const v = parseFloat(String(ask(c)[k] || '').replace(',', '.')); return v > 0 ? v : null; };
  const net = v => { const f = FEES[V.seller]; return v - (v + (+V.ship || 0)) * f.k - f.fix; };

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
  function fbText(c, m) {
    const v = askNum(c, 'fixe');
    return [titleOf(c), ...(v ? [F('Prix : {0}', money(v, userCur()))] : []), '', descOf(c, m), ...(V.mention ? ['', F('Mesuré avec CallIt!')] : [])].join('\n');
  }
  const noMeasure = () => `<div class="small">${F('Mesure le centrage de ta carte : tu pourras joindre la photo avec les mesures, un vrai plus pour les acheteurs.')}</div><a class="btn small" href="#/centrage" data-vd="ctr" style="align-self:flex-start">${F('Mesurer le centrage')}</a>`;
  function fbBlock(c, m) {
    if (m && ['recto', 'verso'].some(sd => m[sd === 'recto' ? 'rr' : 'rv'] && !marked.has(c.key + sd))) setTimeout(() => makeMarked(c, m));
    const pics = ['recto', 'verso'].map(sd => marked.get(c.key + sd) ? `<a class="vd-shot" href="${marked.get(c.key + sd)}" download="${esc(c.key)}-${sd}-centrage.jpg"><img src="${marked.get(c.key + sd)}" alt="${F(sd === 'recto' ? 'Recto' : 'Verso')}"><span class="small">${F('Enregistrer')}</span></a>` : '').join('');
    return `<div class="vd-part stack" style="gap:8px"><b>${F('Texte à coller')}</b><div class="vd-copy" id="vd-fb" style="white-space:pre-wrap">${esc(fbText(c, m))}</div><label class="row small" style="gap:8px"><input type="checkbox" data-vd-chk="mention" ${V.mention ? 'checked' : ''}>${F('Ajouter « Mesuré avec CallIt! » à la fin du texte (la mention est déjà sur la photo)')}</label><button class="btn small" type="button" data-vd="copy" data-v="vd-fb" style="align-self:flex-start">${F('Copier le texte')}</button></div>
      <div class="vd-part stack" style="gap:8px"><b>${F('Photos')}</b>
        ${m ? (pics ? `<div class="small">${F('Photos avec les mesures et une petite mention CallIt! : enregistre-les, puis ajoute-les avec des photos nettes des coins et du dos.')}</div><div class="row vd-shots">${pics}</div>` : `<div class="small">${F('Préparation des photos avec les mesures…')}</div>`) : noMeasure()}</div>
      ${navigator.share ? `<button class="btn go" type="button" data-vd="share">${F('Partager vers Facebook')}</button><div class="small">${F('Le texte est copié, puis le menu de partage s’ouvre avec les photos : choisis Facebook (ou Messenger, WhatsApp…) et colle le texte dans ta publication. Facebook ne laisse pas une appli remplir le texte à ta place.')}</div>` : ''}
      <a class="btn${navigator.share ? '' : ' go'}" href="https://www.facebook.com/marketplace/create/item" target="_blank" rel="noopener">${F('Ouvrir Facebook Marketplace')}</a>
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
    return `<div class="vd-part stack" style="gap:8px"><b>${F('Titre')}</b><div class="vd-copy" id="vd-t">${esc(t)}</div><button class="btn small" type="button" data-vd="copy" data-v="vd-t" style="align-self:flex-start">${F('Copier le titre')}</button></div>
      <div class="vd-part stack" style="gap:8px"><b>${F('Description')}</b><div class="vd-copy" id="vd-d" style="white-space:pre-wrap">${esc(d)}</div><button class="btn small" type="button" data-vd="copy" data-v="vd-d" style="align-self:flex-start">${F('Copier la description')}</button></div>
      <div class="vd-part stack" style="gap:8px"><b>${F('Photos')}</b>
        ${m ? `<div class="small">${F('Tes photos telles quelles, sans ajout : enregistre-les et ajoute-les avec des photos nettes des coins et du dos. Les mesures sont dans la description.')}</div><div class="row vd-shots">${pics}</div>` : noMeasure()}</div>
      <a class="btn go" href="https://www.vinted.${dom}/items/new" target="_blank" rel="noopener">${F('Ouvrir Vinted pour vendre')}</a>
      <div class="small">${F('Sur Vinted, choisis la catégorie des cartes à collectionner, colle le titre et la description, ajoute tes photos et ton prix. Les frais d’envoi se règlent dans Vinted ; la remise en main propre n’existe pas dans tous les pays. C’est toi qui publies : CallIt! ne se connecte jamais à ton compte Vinted.')}</div>
`;
  }
  function ebayBlock(c, t, d, m, pics, dom) {
    return `<div class="vd-part stack" style="gap:8px"><div class="between"><b>${F('Titre')}</b><span class="small">${t.length}/80</span></div><div class="vd-copy" id="vd-t">${esc(t)}</div><button class="btn small" type="button" data-vd="copy" data-v="vd-t" style="align-self:flex-start">${F('Copier le titre')}</button></div>
      <div class="vd-part stack" style="gap:8px"><b>${F('Description')}</b><div class="vd-copy" id="vd-d" style="white-space:pre-wrap">${esc(d)}</div><button class="btn small" type="button" data-vd="copy" data-v="vd-d" style="align-self:flex-start">${F('Copier la description')}</button></div>
      <div class="vd-part stack" style="gap:8px"><b>${F('Photos')}</b>
        ${m ? `<div class="small">${F('Tes photos de la mesure du centrage : enregistre-les et ajoute-les à l’annonce, avec des photos nettes des coins et du dos. Les mesures sont dans la description : eBay interdit d’ajouter du texte, un cadre ou un logo sur les photos.')}</div><div class="row vd-shots">${pics}</div>`
          : noMeasure()}</div>
      <a class="btn go" href="https://www.ebay.${dom}/sl/sell" target="_blank" rel="noopener">${F('Ouvrir le formulaire de vente eBay')}</a>
      <div class="small">${F('Colle le titre et la description, ajoute tes photos et ton prix. C’est toi qui publies l’annonce : CallIt! ne se connecte jamais à ton compte eBay.')}</div>
`;
  }
  // Une étape repliable : numéro vert, titre, résumé du choix quand elle est fermée
  function stepBox(n, title, summary, body, next) {
    const open = step === n;
    return `<section class="vd-step${open ? ' open' : ''}${step > n ? ' done' : ''}">
      <button type="button" class="vd-head" data-vd="step" data-v="${n}" aria-expanded="${open}"><span class="vd-n">${step > n ? '✓' : n}</span><span class="stack" style="gap:2px;flex:1;min-width:0"><b>${title}</b>${!open && summary ? `<span class="small vd-sum">${summary}</span>` : ''}</span><span class="vd-chev" aria-hidden="true"></span></button>
      ${open ? `<div class="vd-body stack${anim ? ' anim' : ''}">${body}${next ? `<button type="button" class="btn go" data-vd="step" data-v="${n + 1}" style="align-self:flex-end">${F('Continuer')}</button>` : ''}</div>` : ''}
    </section>`;
  }
  function view(c) {
    const top = `<div class="top">${backBtn()}<span class="sub" style="font-weight:600">${F('Vendre ma carte')}</span><span style="width:44px"></span></div>`;
    if (!c) return `${top}<div class="pad note">${F('Carte introuvable.')}</div>`;
    if (!V.lang || !(c.langs || []).includes(V.lang)) V.lang = (c.langs && c.langs[0]) || null;
    if (V.where !== 'ebay') V.fmt = 'fixe';
    const m = measures(c), r = refOf(c), t = titleOf(c), d = descOf(c, m), dom = ebayDom(), cur = userCur();
    const pics = m ? ['recto', 'verso'].map(s => photoOf(s) ? `<a class="vd-shot" href="${photoOf(s)}" download="${esc(c.key)}-${s}.jpg"><img src="${photoOf(s)}" alt="${F(s === 'recto' ? 'Recto' : 'Verso')}"><span class="small">${F('Enregistrer')}</span></a>` : '').join('') : '';
    const site = { ebay: 'eBay', fb: 'Facebook', vinted: 'Vinted' }[V.where];
    const lab = txt => `<span class="small" style="font-weight:600;align-self:center">${txt}</span>`;
    const auction = V.where === 'ebay' && V.fmt === 'enchere', k = auction ? 'start' : 'fixe', mine = askNum(c, k);

    const s1 = `<div class="chips">${lab(F('État'))}${CONDS.map(([k2]) => B(V.cond === k2, 'cond', k2, k2)).join('')}</div>
        <div class="vd-def"><b>${esc((CONDS.find(x => x[0] === V.cond) || ['', V.cond])[1])}</b> · ${F(COND_DEF[V.cond] || '')}</div>
        ${c.langs && c.langs.length > 1 ? `<div class="chips">${lab(F('Langue'))}${c.langs.map(l => B(V.lang === l, 'lang', l, esc((LANG[l] || { short: l }).short))).join('')}</div>` : ''}
        <div class="chips">${lab(F('Sur'))}${B(V.where === 'ebay', 'where', 'ebay', 'eBay')}${B(V.where === 'fb', 'where', 'fb', 'Facebook')}${B(V.where === 'vinted', 'where', 'vinted', 'Vinted')}</div>
        ${V.where === 'ebay' ? `<div class="chips">${lab(F('Je vends en'))}${Object.entries(FEES).map(([k2, f]) => B(V.seller === k2, 'seller', k2, F(f.label))).join('')}</div>` : ''}`;
    const sum1 = [V.cond, V.lang ? (LANG[V.lang] || { name: V.lang }).name : '', site].filter(Boolean).join(' · ');

    const s2 = `<label class="row" style="gap:8px;align-items:center"><input type="checkbox" data-vd-chk="post" ${V.post ? 'checked' : ''}><span>${F('Envoi par la poste')}</span>${V.post ? `<input class="fld" data-vd-in="ship" inputmode="decimal" value="${esc(String(V.ship).replace('.', ','))}" style="width:90px;margin-left:auto" aria-label="${F('Frais de port')}"><span class="small">${esc(cur)}</span>` : ''}</label>
        <label class="row" style="gap:8px;align-items:center"><input type="checkbox" data-vd-chk="hand" ${V.hand ? 'checked' : ''}><span>${F('Remise en main propre')}</span></label>
        ${V.hand ? `<input class="fld" data-vd-in="cities" placeholder="${F('Villes ou lieux, ex. Rome, Bracciano, salon de Milan')}" value="${esc(V.cities)}">` : ''}
        <div class="small">${F('Ces informations sont ajoutées à la description.')}</div>`;
    const sum2 = [V.post ? F('Envoi {0}', +V.ship > 0 ? money(+V.ship, cur) : F('offert')) : '', V.hand ? (V.cities.trim() ? F('Main propre : {0}', V.cities.trim()) : F('Main propre')) : ''].filter(Boolean).join(' · ') || F('À choisir');

    const tips = advice(c), sg = suggest(c, r);
    const fees = V.where === 'vinted' ? F('Sur Vinted, le vendeur ne paie pas de frais de vente : c’est l’acheteur qui paie la protection acheteurs et le port.')
      : V.where === 'fb' ? F('Sur Facebook, pas de commission en remise en main propre ; une vente avec envoi via Marketplace peut avoir des frais : vérifie au moment de publier.')
      : V.seller === 'part' ? F('En particulier, eBay ne prend pas de frais de vente dans plusieurs pays d’Europe (France, Italie, Allemagne, Royaume-Uni…) : vérifie pour ton pays.')
      : mine ? F('En professionnel, compte environ 13 % + 0,35 € de frais eBay : à ce prix, il te resterait environ {0}.', money(net(mine), cur)) : F('En professionnel, compte environ 13 % + 0,35 € de frais eBay.');
    const s3 = `${r ? `<div class="vd-ref"><span class="small">${F('Cote de référence · toutes langues')}</span><b class="num">${typeof eurC === 'function' ? eurC(r.v) : eur(r.v)}</b>${r.lo && r.hi ? `<span class="small">${F('La plupart des ventes : {0} à {1}', eurC(r.lo), eurC(r.hi))}</span>` : ''}</div>`
          : `<div class="note">${F('Pas encore de cote pour cette carte : regarde les ventes terminées avant de fixer ton prix.')}</div>`}
        ${sg && (sg.kc < 1 || sg.kl < 1) ? `<div class="vd-sug between"><span class="stack" style="gap:2px"><span style="font-weight:600">${F('Prix suggéré')}</span><span class="small">${F('Estimation : cote, puis état et langue')}</span></span><span class="row" style="gap:10px;align-items:center"><b class="num">${eurC(sg.v)}</b><button type="button" class="btn small go" data-vd="usesug" data-v="${sg.v}" data-k="${k}">${F('Utiliser')}</button></span></div>` : ''}
        ${tips.length ? `<ul class="vd-tips">${tips.map(x => `<li>${x}</li>`).join('')}</ul>` : ''}
        ${V.where === 'ebay' ? `<div class="chips">${lab(F('Format'))}${B(V.fmt === 'fixe', 'fmt', 'fixe', F('Prix fixe'))}${B(V.fmt === 'enchere', 'fmt', 'enchere', F('Enchères'))}</div>` : ''}
        <label class="stack" style="gap:6px"><span style="font-weight:600">${auction ? F('Ton prix de départ') : F('Ton prix')}</span>
          <span class="row" style="gap:8px;align-items:center"><input class="fld" data-vd-in="ask" data-k="${k}" inputmode="decimal" placeholder="${sg ? esc(String(sg.v).replace('.', ',')) : ''}" value="${esc(ask(c)[k] || '')}" style="width:130px"><span class="small">${esc(cur)}</span></span></label>
        <div class="small">${auction ? F('Un prix de départ bas attire plus d’enchérisseurs, mais la carte peut partir sous la cote. C’est toi qui choisis.') : F('C’est toi qui fixes ton prix : la cote est un repère.')}</div>
        <div class="small">${fees}</div>
        <a class="small" href="https://www.ebay.${dom}/sch/i.html?_nkw=${encodeURIComponent(t.split(' ').slice(0, 3).join(' '))}&LH_Sold=1&LH_Complete=1" target="_blank" rel="noopener">${F('Voir les ventes terminées sur eBay')}</a>`;
    const sum3 = mine ? (auction ? F('Enchères dès {0}', money(mine, cur)) : money(mine, cur)) : r ? F('Cote {0}', eurC(r.v)) : F('À fixer');

    const s4 = V.where === 'fb' ? fbBlock(c, m) : V.where === 'vinted' ? vintedBlock(c, t, d, m, pics) : ebayBlock(c, t, d, m, pics, dom);
    return `${top}<div class="pad stack" style="gap:12px">
      <div class="panel row vd-card" style="gap:14px;align-items:center"><span class="ag-thumb">${cimg(c, { lang: V.lang || undefined })}</span><span class="stack" style="gap:4px"><b style="font-size:18px">${esc(cardName(c, V.lang || undefined) || cardName(c))}</b><span class="small">${esc(setName(c.set))} · ${esc(numLabel(c))}</span>${r ? `<span class="vd-pill">${F('Cote')} ${eurC(r.v)}</span>` : ''}</span></div>
      ${stepBox(1, F('La carte'), sum1, s1, true)}
      ${stepBox(2, F('Livraison'), sum2, s2, true)}
      ${stepBox(3, F('Ton prix'), sum3, s3, true)}
      ${stepBox(4, F('Ton annonce {0}', site), F('Titre, description, photos'), s4, false)}
    </div>`;
  }

  document.addEventListener('change', ev => {
    const t = ev.target; if (!isHere() || !t.dataset) return;
    if (t.dataset.vdChk) { V[t.dataset.vdChk] = t.checked; saveV(); render(); }
    else if (t.dataset.vdIn === 'ship') { const v = parseFloat(String(t.value).replace(',', '.')); V.ship = isNaN(v) || v < 0 ? 0 : v; saveV(); render(); }
    else if (t.dataset.vdIn === 'ask') { const c = BYKEY.get(keyOf()); if (c) { ASK.set(c.key, Object.assign({}, ask(c), { [t.dataset.k]: t.value.replace(/[^0-9.,]/g, '').slice(0, 10) })); render(); } }
    else if (t.dataset.vdIn === 'cities') { V.cities = t.value.slice(0, 120); saveV(); render(); }
  });
  document.addEventListener('click', ev => {
    const b = ev.target.closest && ev.target.closest('[data-vd]'); if (!b || !isHere()) return;
    const k = b.dataset.vd, v = b.dataset.v;
    if (k === 'cond') { V.cond = v; saveV(); render(); }
    else if (k === 'where') { V.where = v; saveV(); render(); }
    else if (k === 'lang') { V.lang = v; render(); }
    else if (k === 'seller') { V.seller = v; saveV(); render(); }
    else if (k === 'usesug') { const c = BYKEY.get(keyOf()); if (c) { ASK.set(c.key, Object.assign({}, ask(c), { [b.dataset.k]: String(v).replace('.', ',') })); render(); } }
    else if (k === 'fmt') { V.fmt = v; saveV(); render(); }
    else if (k === 'step') { const n = +v; step = step === n ? 0 : n; anim = true; render(); anim = false; const el = app.querySelector('.vd-step.open'); if (el && el.scrollIntoView) el.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
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
      if (c && c.key !== lastKey) { lastKey = c.key; step = 1; }
      app.innerHTML = view(c); document.title = tr('Vendre ma carte') + ' · CallIt!';
      return;
    }
    baseRender(keepFocus);
    const r = route();
    // Fiche carte : un bouton « Vendre sur eBay » sous « Ajouter à ma collection »
    if (DB && S.face && r === 'carte') {
      const key = decodeURIComponent((location.hash.split('/')[2] || '').split('?')[0]), btns = app.querySelector('.pad.btns');
      if (BYKEY.get(key) && btns && !app.querySelector('.vd-entry')) btns.insertAdjacentHTML('afterend', `<div class="pad vd-entry" style="margin-top:8px"><a class="linkbtn" href="#/vendre/${encodeURIComponent(key)}">${F('Vendre cette carte (eBay, Facebook, Vinted)')}</a></div>`);
    }
    // « À grader ? » : créer l'annonce avec les mesures
    if (DB && S.face && r === 'a-grader' && typeof CTR !== 'undefined' && CTR.key && BYKEY.get(CTR.key)) {
      const v = app.querySelector('.ag-verdict');
      if (v && !app.querySelector('.vd-entry')) v.insertAdjacentHTML('afterend', `<a class="btn vd-entry" href="#/vendre/${encodeURIComponent(CTR.key)}" style="align-self:center">${F('Créer une annonce avec ces mesures')}</a>`);
    }
  };
  if (isHere()) render();
})();
