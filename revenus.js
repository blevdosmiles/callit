/* CallIt! · Idées validées le 26/11/2026 pour que l'appli rapporte un peu, sans rien cacher à l'utilisateur :
   1. « Tes préférés » : l'utilisateur choisit ses Pokémon (ou couleurs, archétypes, personnages selon le jeu).
      L'appli lui montre d'abord leurs cartes, et les enchères eBay qui finissent bientôt pour eux (lien partenaire).
      Les préférés restent sur l'appareil. Ils ne sont jamais vendus.
   2. « Prendre soin de tes cartes » (Protéger, Classer, Embellir) : des accessoires adaptés à SA collection.
   3. La jauge d'assurance : à partir de 1 500 € de collection, « ta collection est couverte à X % ».
   Règles de Jérémie : tout montrer, partenaire ou non ; l'ordre ne dépend jamais de la commission ;
   chaque lien partenaire est signalé ; tout marche pour tous les jeux.
   Fichier séparé de app.js : il réutilise ses fonctions et lui fournit des morceaux de page par window.CallItRevenus. */
(function () {
  'use strict';
  if (typeof render !== 'function') return;

  /* ---------- Liens vers les boutiques ----------
     Les programmes partenaires (Amazon par pays, Etsy par Awin) ne sont pas encore ouverts : ces liens sont des liens
     normaux, signalés « lien externe, sans commission ». Le jour où un identifiant partenaire existe, on le met dans
     SHOP_TAG : le lien devient un lien partenaire et son étiquette change toute seule. */
  const AMAZON = { FR: 'fr', MC: 'fr', LU: 'fr', BE: 'com.be', IT: 'it', DE: 'de', AT: 'de', CH: 'de', ES: 'es', PT: 'es', NL: 'nl',
    GB: 'co.uk', IE: 'co.uk', MT: 'co.uk', CY: 'co.uk', IS: 'co.uk', PL: 'pl', SE: 'se', US: 'com', CA: 'ca', JP: 'co.jp', AU: 'com.au' };
  const SHOP_TAG = { amazon: { it: 'callitcards-21' }, etsy: null }; // amazon.it : compte créé le 26/11/2026 // amazon : { fr: 'callit-21', … } ; etsy : lien Awin
  function shopLink(store, q) {
    if (store === 'amazon') {
      const d = AMAZON[S.country] || 'de', tag = SHOP_TAG.amazon[d];
      return { url: `https://www.amazon.${d}/s?k=${encodeURIComponent(q)}${tag ? '&tag=' + encodeURIComponent(tag) : ''}`, partner: !!tag, name: 'Amazon' };
    }
    return { url: `https://www.etsy.com/search?q=${encodeURIComponent(q)}`, partner: false, name: 'Etsy' };
  }
  const tagOf = l => esc(linkTag(l));
  const out = (l, label, cls = 'btn small') => `<a class="${cls}" href="${esc(l.url)}" target="_blank" rel="noopener${l.partner ? ' sponsored' : ''}">${label}</a>`;

  /* ---------- 1. Tes préférés ---------- */
  // Un préféré : { t: 'dex' (Pokémon), 'type' (couleur Magic) ou 'q' (nom ou morceau de nom), v, l (nom affiché) }
  let favs = load('favs', {});
  const myFavs = () => (Array.isArray(favs[GAME]) ? favs[GAME] : []);
  const saveFavs = () => save('favs', favs);
  const favId = f => f.t + ':' + norm(String(f.v));
  const isFav = f => myFavs().some(x => favId(x) === favId(f));

  const POKE_TOP = [6, 94, 54, 25, 133, 150, 249, 384, 197, 151, 448, 149, 130, 143, 359, 196, 445, 1, 7, 4, 248];
  const COLORS_EN = { Rouge: 'red', Blanc: 'white', Bleu: 'blue', Vert: 'green', Noir: 'black', Multicolore: 'multicolor' };
  const SUGG = {
    mtg: ['Atraxa', 'The Ur-Dragon', 'Edgar Markov', 'Krenko', 'Yuriko', 'Sheoldred', 'Ragavan'],
    ygo: ['Blue-Eyes', 'Dark Magician', 'Red-Eyes', 'Elemental HERO', 'Exodia', 'Sky Striker', 'Snake-Eye', 'Branded', 'Kashtira'],
    op: ['Luffy', 'Zoro', 'Nami', 'Shanks', 'Ace', 'Law', 'Yamato', 'Sanji', 'Hancock', 'Kaido']
  };
  const ASK = {
    pkm: ['Tes Pokémon préférés ?', 'On te montrera d’abord leurs cartes et leurs enchères.'],
    mtg: ['Tes couleurs et tes commandants préférés ?', 'On te montrera d’abord leurs cartes et leurs enchères.'],
    ygo: ['Tes archétypes préférés ?', 'On te montrera d’abord leurs cartes et leurs enchères.'],
    op: ['Tes personnages préférés ?', 'On te montrera d’abord leurs cartes et leurs enchères.']
  };

  // Nom d'un Pokémon dans la langue des noms : le nom le plus fréquent parmi ses cartes (« Charizard » plutôt que « Charizard ex »)
  const pokeNames = new Map();
  function pokeName(dex) {
    if (S.nameLang === 'fr' && DB.species[dex]) return DB.species[dex];
    if (pokeNames.has(dex)) return pokeNames.get(dex);
    const n = new Map();
    for (const c of CARDS) if (String(c.dex) === String(dex)) { const x = c.n[S.nameLang] || c.n.en; if (x) n.set(x, (n.get(x) || 0) + 1); }
    const best = [...n].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0];
    const v = best ? best[0] : DB.species[dex] || '#' + dex;
    pokeNames.set(dex, v); return v;
  }
  // Début de mot seulement : « Ace » trouve « Portgas.D.Ace », pas « Space »
  const words = x => ' ' + norm(x).replace(/[^a-z0-9]+/g, ' ');
  const nameHas = (c, t) => Object.values(c.n).some(x => words(x).includes(t));
  function favTest(f) {
    if (f.t === 'dex') return c => String(c.dex) === String(f.v);
    if (f.t === 'type') { const i = DB.types.indexOf(f.v); return c => c.t === i; }
    const t = words(f.v).trimEnd(); return c => nameHas(c, t);
  }
  const favCount = f => { const ok = favTest(f); let n = 0; for (const c of CARDS) if (ok(c) && ++n > 2) break; return n; };
  // Ce que l'on cherche sur eBay pour un préféré
  const favQuery = f => f.t === 'type' ? `${GI.ebay} ${COLORS_EN[f.v] || f.v}` : `${f.t === 'dex' ? pokeName(f.v) : f.v} ${PKM ? '' : GI.ebay}`.trim();
  const favSearch = f => f.t === 'dex' ? `#/recherche?dex=${encodeURIComponent(f.v)}` : f.t === 'type' ? `#/preferes?voir=${encodeURIComponent(favId(f))}` : `#/recherche?q=${encodeURIComponent(f.v)}`;

  // Suggestions : d'abord ce qu'il y a dans sa collection et ses envies, puis les plus demandés
  function suggestions() {
    if (PKM) {
      const cnt = new Map();
      for (const it of collection) { const c = BYKEY.get(it.key); if (c && c.dex) cnt.set(c.dex, (cnt.get(c.dex) || 0) + (it.qty || 1)); }
      const mine = [...cnt].sort((a, b) => b[1] - a[1]).slice(0, 6).map(x => x[0]);
      return [...new Set([...mine, ...POKE_TOP])].slice(0, 14).map(d => ({ t: 'dex', v: String(d), l: pokeName(d) }));
    }
    const base = GAME === 'mtg' ? Object.keys(COLORS_EN).filter(x => DB.types.includes(x)).map(x => ({ t: 'type', v: x, l: x })) : [];
    return base.concat((SUGG[GAME] || []).map(x => ({ t: 'q', v: x, l: x })).filter(f => favCount(f) > 0));
  }

  const FAV = { add: false, err: '' };
  function favChips() {
    const list = suggestions(); for (const f of myFavs()) if (!list.some(x => favId(x) === favId(f))) list.unshift(f);
    return `<div class="chips wrap rv-favs">${list.map(f => { const on = isFav(f); return `<button class="chip${on ? ' on' : ''}" data-rev="fav" data-t="${f.t}" data-v="${esc(f.v)}" data-l="${esc(f.l)}" aria-pressed="${on}">${esc(f.t === 'type' ? tr(f.l) : f.l)}${on ? ' ' + icon('check', 14) : ''}</button>`; }).join('')}
    ${FAV.add ? '' : `<button class="chip" data-rev="favadd">+ ${esc(tr('Autre'))}</button>`}</div>
    ${FAV.add ? `<form class="row rv-add" data-rev="favform"><input id="rvq" type="search" autocomplete="off" placeholder="${esc(PKM ? tr('Nom du Pokémon') : tr('Nom ou morceau de nom'))}" aria-label="${esc(tr('Ajouter un préféré'))}"><button class="btn small" type="submit">${esc(tr('Ajouter'))}</button></form>${FAV.err ? `<div class="small" style="margin-top:6px">${esc(FAV.err)}</div>` : ''}` : ''}`;
  }

  // Les cartes de mes préférés que je n'ai pas encore : les plus récentes d'abord
  function favCards(fs, n) {
    const tests = fs.map(favTest), mine = new Set(collection.map(it => it.key));
    return CARDS.filter(c => tests.some(t => t(c)) && !mine.has(c.key) && hasImg(c) && !isHidden(c))
      .sort((x, y) => (y.set.date || '').localeCompare(x.set.date || '') || (price(y) || 0) - (price(x) || 0)).slice(0, n);
  }
  // Enchères eBay qui finissent bientôt (tri « fin la plus proche »), pour un préféré
  const favEbay = f => ebayLink(`${ebayHome()}/sch/i.html?_nkw=${encodeURIComponent(favQuery(f))}&LH_Auction=1&_sop=1`);
  function favEbayRows(fs) {
    const ls = fs.map(f => [f, favEbay(f)]), anyP = ls.some(x => x[1].partner);
    return `<div class="panel rv-list"><div class="between rv-head"><b>${esc(tr('Enchères qui finissent bientôt'))}</b><span class="rv-tag">${esc(anyP ? tr('Liens partenaires eBay') : tr('Liens externes'))}</span></div>
    ${ls.map(([f, l]) => `<a class="rv-row" href="${esc(l.url)}" target="_blank" rel="noopener${l.partner ? ' sponsored' : ''}"><span class="mid"><b>${esc(f.t === 'type' ? tr(f.l) : f.l)}</b><span class="small">${esc(F('Sur eBay.{0}, fin la plus proche d’abord', ebayDomain()))}</span></span><span class="btn small">${esc(tr('Voir'))}</span></a>`).join('')}</div>`;
  }

  function viewFavs(q) {
    const fs = myFavs(), [title, sub] = ASK[GAME] || ASK.pkm;
    const voir = q.get('voir'), one = voir && fs.find(f => favId(f) === voir);
    const cards = favCards(one ? [one] : fs, one ? 60 : 24);
    return `<div class="top">${backBtn()}${faceSwitch()}</div>
    <div class="pad"><div class="small eyebrow">${esc(tr('Pour toi'))}</div><h1 class="h1" style="margin-top:4px">${esc(tr(title))}</h1><p class="sub" style="margin:6px 0 14px">${esc(tr(sub))}</p>
    ${favChips()}</div>
    ${fs.length ? `<div class="pad" style="margin-top:18px">${favEbayRows(one ? [one] : fs)}</div>
    ${cards.length ? `<div class="sect between"><h2 class="h2">${esc(one ? (one.t === 'type' ? tr(one.l) : one.l) : tr('Leurs cartes'))}</h2><span class="sub">${esc(tr('que tu n’as pas encore'))}</span></div><div class="grid">${cards.map(c => tile(c, { meta: setName(c.set) + (price(c) ? ' · ' + eurC(price(c)) : '') })).join('')}</div>` : ''}
    <div class="pad small" style="margin-top:14px">${esc(tr('Tes préférés restent sur cet appareil. Ils ne sont jamais vendus.'))}</div>`
    : `<div class="pad small" style="margin-top:14px">${esc(tr('Touche un nom pour l’ajouter. Tu pourras changer quand tu veux.'))}</div>`}
    <div style="height:20px"></div>${tabs('')}`;
  }

  // Accueil : l'invitation (une fois, « Plus tard » la referme), puis le bloc « Pour toi »
  function homeFavs() {
    const fs = myFavs();
    if (!fs.length) {
      if (load('favs-later', {})[GAME]) return '';
      const [title, sub] = ASK[GAME] || ASK.pkm;
      return `<div class="pad" style="margin-top:16px"><div class="panel stack rv-ask"><b style="font-size:17px">${esc(tr(title))}</b><span class="sub">${esc(tr(sub))}</span>
      <div class="chips wrap">${suggestions().slice(0, 6).map(f => `<button class="chip" data-rev="fav" data-go="1" data-t="${f.t}" data-v="${esc(f.v)}" data-l="${esc(f.l)}">${esc(f.t === 'type' ? tr(f.l) : f.l)}</button>`).join('')}<a class="chip" href="#/preferes">+ ${esc(tr('Autre'))}</a></div>
      <div class="row" style="gap:8px"><a class="btn primary small" href="#/preferes">${esc(tr('Choisir'))}</a><button class="btn small" data-rev="later">${esc(tr('Plus tard'))}</button></div></div></div>`;
    }
    const cards = favCards(fs, 12);
    return `<div class="sect between"><h2 class="h2">${esc(tr('Pour toi'))}</h2><a class="sub" href="#/preferes">${esc(fs.map(f => f.t === 'type' ? tr(f.l) : f.l).slice(0, 3).join(', ') + (fs.length > 3 ? '…' : ''))}</a></div>
    ${cards.length ? `<div class="hrow">${cards.map(c => tile(c, { meta: setName(c.set) + (price(c) ? ' · ' + eurC(price(c)) : '') })).join('')}</div>` : ''}
    <div class="pad" style="margin-top:6px">${favEbayRows(fs.slice(0, 3))}</div>`;
  }

  /* ---------- 2. Prendre soin de tes cartes ---------- */
  const SOIN = { tab: 'proteger' };
  function myStats() {
    let n = 0, over20 = 0, over100 = 0, graded = 0;
    const t20 = toUser(20), t100 = toUser(100);
    for (const it of collection) {
      const c = BYKEY.get(it.key); const q = it.qty || 1; n += q;
      if (it.grader) { graded += q; continue; }
      const e = c ? ownValue(it, c) : null;
      if (e && e.u >= t20) over20 += q;
      if (e && e.u >= t100) over100 += q;
    }
    const sealed = sealedCol.reduce((s, it) => s + (it.qty || 1), 0);
    return { n, over20, over100, graded, sealed };
  }
  const GAME_EN = { pkm: 'pokemon', mtg: 'mtg', ygo: 'yugioh', op: 'one piece' };
  function favName() { const f = myFavs()[0]; return f ? (f.t === 'type' ? '' : f.t === 'dex' ? pokeName(f.v) : f.v) : ''; }
  function soinItems(tab, st) {
    const g = GAME_EN[GAME], small = GAME === 'ygo', fav = favName(), items = [];
    const add = (store, q, title, why) => items.push({ l: shopLink(store, q), title, why });
    if (tab === 'proteger') {
      add('amazon', small ? 'small size card sleeves yugioh' : 'card sleeves 66x91', tr('Pochettes souples × 100'), st.n ? F('Pour tes {0} cartes', st.n) : tr('Pour chaque carte, même les moins chères'));
      if (!small) add('amazon', 'toploader 35pt', tr('Toploaders × 25'), st.over20 ? F('Pour tes {0} cartes à plus de {1}', st.over20, money(toUser(20), null, 0)) : tr('Pour les cartes qui ont de la valeur'));
      add('amazon', small ? 'magnetic card holder 35pt yugioh' : 'magnetic card holder 35pt', tr('Étuis magnétiques'), st.over100 ? F('Pour tes {0} cartes à plus de {1}', st.over100, money(toUser(100), null, 0)) : tr('Pour tes plus belles cartes'));
      if (st.graded) add('amazon', 'graded card storage box', tr('Boîte pour cartes gradées'), F('Pour tes {0} cartes gradées', st.graded));
      if (st.sealed) add('amazon', g + ' booster box acrylic case', tr('Boîtier acrylique pour display'), F('Pour tes {0} produits scellés', st.sealed));
    } else if (tab === 'classer') {
      const binders = Math.max(1, Math.ceil(st.n / 360));
      add('amazon', small ? 'yugioh binder 9 pocket' : 'card binder 9 pocket 360', tr('Classeur 9 cases, 360 cartes'), st.n > 360 ? F('Pour tes {0} cartes : {1} classeurs', st.n, binders) : tr('Pour ranger ta collection par set'));
      add('amazon', 'card storage box 1000', tr('Boîte de rangement 1 000 cartes'), tr('Pour les doubles et les cartes communes'));
      if (fav) add('amazon', `${fav} ${g} binder`, F('Classeur {0}', fav), tr('Pour tes préférés'));
      if (!PKM || J()) {
        add('amazon', `deck box ${g}`, tr('Deck box'), tr('Pour emporter ton deck'));
        add('amazon', `playmat ${g}`, tr('Tapis de jeu'), tr('Pour jouer sans abîmer tes cartes'));
      }
    } else {
      add('etsy', 'card frame uv protection', tr('Cadre anti-UV'), fav ? F('Pour une carte de {0}', fav) : tr('Pour ta carte préférée'));
      if (st.graded) add('etsy', 'graded card wall display', tr('Support mural pour cartes gradées'), F('Pour tes {0} cartes gradées', st.graded));
      add('etsy', 'card display stand', tr('Présentoir de bureau'), tr('Pour la carte du moment'));
      if (st.sealed) add('etsy', 'booster box display case led', tr('Vitrine éclairée'), F('Pour tes {0} produits scellés', st.sealed));
    }
    return items;
  }
  function viewSoin() {
    const st = myStats(), tab = SOIN.tab, items = soinItems(tab, st);
    const tabs_ = [['proteger', 'Protéger', 'shield'], ['classer', 'Classer', 'coll'], ['embellir', 'Embellir', 'frame']];
    const anyP = items.some(x => x.l.partner), fav = favName();
    return `<div class="top">${backBtn()}${faceSwitch()}</div>
    <div class="pad"><div class="small eyebrow">${esc(tr(G() ? 'Ma collection' : 'Portefeuille'))}</div><h1 class="h1" style="margin-top:4px">${esc(tr('Prendre soin de tes cartes'))}</h1></div>
    <div class="pad rv-tabs" role="tablist">${tabs_.map(([k, l, ic]) => `<button class="rv-tab${tab === k ? ' on' : ''}" role="tab" aria-selected="${tab === k}" data-rev="soin" data-v="${k}"><span class="rv-ic">${icon(ic, 18)}</span>${esc(tr(l))}</button>`).join('')}</div>
    <div class="pad" style="margin-top:14px"><div class="panel rv-list"><div class="between rv-head"><b>${esc(st.n ? F('Pour tes {0} cartes', st.n) : tr('Pour tes cartes'))}</b><span class="rv-tag">${esc(anyP ? tr('Liens partenaires') : tr('Liens externes'))}</span></div>
    ${items.map(x => `<a class="rv-row" href="${esc(x.l.url)}" target="_blank" rel="noopener${x.l.partner ? ' sponsored' : ''}"><span class="mid"><b>${esc(x.title)}</b><span class="small">${esc(x.why)} · ${esc(x.l.name)}</span></span><span class="btn small">${esc(tr('Voir'))}</span></a>`).join('')}</div>
    <div class="small" style="margin-top:8px">${esc(anyP ? tr('Liens partenaires : CallIt! touche une petite commission si tu achètes, sans frais pour toi.') : tr('Liens externes, sans commission.'))}</div>
    ${items.some(x => x.l.partner && x.l.name === 'Amazon') ? `<div class="small" style="margin-top:6px">${esc(tr('En tant que Partenaire Amazon, CallIt! réalise un bénéfice sur les achats remplissant les conditions requises.'))}</div>` : ''}
    ${tab === 'embellir' ? `<div class="note" style="margin-top:12px">${esc(tr('Évite le soleil direct : les couleurs passent.'))}</div>` : ''}
    ${tab === 'embellir' && PKM && fav ? (l => `<div class="small" style="margin-top:12px">${esc(F('Autour de {0} :', fav))} ${out(l, esc(tr('figurines')), '')} <span>(${tagOf(l)})</span></div>`)(shopLink('amazon', 'funko pop ' + fav)) : ''}</div>
    <div style="height:20px"></div>${tabs('collection')}`;
  }
  const careBtn = () => (collection.length || sealedCol.length ? `<a class="btn small" href="#/soin">${icon('shield', 16)}<span>${esc(tr('Prendre soin'))}</span></a>` : '');

  /* ---------- 3. Jauge d'assurance ---------- */
  // À partir de 1 500 € de collection. Proposée une fois en grand, puis sur une ligne ; « Déjà bien assurée » la masque.
  const INS_ON = false; // 26/11/2026 : Jérémie ne veut pas encore proposer l'assurance. Mettre true pour l'afficher.
  const INS_MIN = 1500;
  let ins = load('assurance', {}); // { cap (dans la devise affichée), cur, done, later }
  const saveIns = () => save('assurance', ins);
  const INS_LINKS = { // contrats « collection » repérés le 26/11/2026 (aucun partenariat)
    FR: [['Hiscox', 'https://www.hiscox.fr/']], DE: [['Hiscox', 'https://www.hiscox.de/']], AT: [['Hiscox', 'https://www.hiscox.de/']],
    ES: [['Hiscox', 'https://www.hiscox.es/']], BE: [['Hiscox', 'https://www.hiscox.be/']], NL: [['Hiscox', 'https://www.hiscox.nl/']],
    GB: [['Assetsure', 'https://www.assetsure.co.uk/'], ['Hiscox', 'https://www.hiscox.co.uk/']]
  };
  function insurance(p) {
    if (!INS_ON || !p || ins.done || !(p.value >= toUser(INS_MIN))) return '';
    const cur = userCur(), cap = ins.cap > 0 && ins.cur === cur ? ins.cap : null;
    if (ins.later && !INS.open && cap == null) return `<div class="pad" style="margin-top:12px"><button class="linkbtn small" data-rev="insopen">${icon('shield', 14)} ${esc(tr('Ta collection est-elle bien assurée ?'))}</button></div>`;
    const pc = cap != null ? Math.min(100, Math.round(cap / p.value * 100)) : null, miss = cap != null ? p.value - cap : 0;
    const links = (INS_LINKS[S.country] || []);
    return `<div class="pad" style="margin-top:14px"><div class="panel stack rv-ins" style="gap:10px">
      <b style="font-size:16px">${esc(tr('Ta collection est-elle bien assurée ?'))}</b>
      <label class="between" style="gap:12px"><span class="sub">${esc(tr('Plafond « objets de valeur » de ton contrat'))}</span><span class="rv-cap"><input data-rev="cap" inputmode="decimal" value="${cap != null ? esc(String(cap)) : ''}" placeholder="${esc(money(toUser(INS_MIN), null, 0))}" aria-label="${esc(tr('Plafond de ton contrat'))}"></span></label>
      ${pc != null ? `<div class="between"><span class="sub">${esc(tr('Ta collection est couverte à'))}</span><b class="num rv-pc ${pc < 100 ? 'loss' : 'gain'}">${pc} %</b></div>
      <span class="bar rv-bar${pc < 100 ? ' low' : ''}"><span style="width:${pc}%"></span></span>
      <div class="small">${miss > 0 ? esc(F('Il manque {0}.', money(miss, null, 0))) + ' ' : esc(tr('Ton plafond couvre la valeur estimée.')) + ' '}${esc(tr('Le plafond est écrit dans tes conditions particulières, souvent sous « objets de valeur ».'))}</div>`
      : `<div class="small">${esc(F('Ta collection vaut environ {0}. Beaucoup de contrats habitation couvrent moins pour les objets de valeur.', money(p.value, null, 0)))}</div>`}
      ${links.length ? `<div class="small">${esc(tr('Contrats pour collections :'))} ${links.map(([n, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(n)}</a>`).join(' · ')} <span>(${esc(tr('liens externes, sans commission'))})</span></div>` : ''}
      <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn small" data-rev="insdone">${esc(tr('Déjà bien assurée'))}</button>${ins.later ? '' : `<button class="btn small" data-rev="inslater">${esc(tr('Plus tard'))}</button>`}</div>
    </div></div>`;
  }
  const INS = { open: false };

  window.CallItRevenus = { home: homeFavs, careBtn, insurance };

  /* ---------- Actions ---------- */
  function toggleFav(el) {
    const f = { t: el.dataset.t, v: el.dataset.v, l: el.dataset.l };
    const list = myFavs().slice(), i = list.findIndex(x => favId(x) === favId(f));
    if (i >= 0) list.splice(i, 1); else list.push(f);
    favs[GAME] = list; saveFavs();
    if (el.dataset.go) { location.hash = '#/preferes'; return; }
    render();
  }
  function addTyped(v) {
    v = (v || '').trim(); if (!v) return;
    let f = null;
    if (PKM) { // un nom de Pokémon → ce Pokémon (toutes ses cartes) ; sinon le nom tel quel
      const t = norm(v), dex = Object.keys(DB.species).find(d => norm(DB.species[d]) === t) || (CARDS.find(c => c.dex && Object.values(c.n).some(x => norm(x) === t)) || {}).dex;
      if (dex) f = { t: 'dex', v: String(dex), l: pokeName(dex) };
    }
    if (!f) f = { t: 'q', v, l: v };
    if (!favCount(f)) { FAV.err = tr('Aucune carte ne porte ce nom.'); render(); return; }
    FAV.add = false; FAV.err = '';
    if (!isFav(f)) { favs[GAME] = myFavs().concat(f); saveFavs(); }
    render();
  }
  document.addEventListener('click', e => {
    const el = e.target.closest && e.target.closest('[data-rev]'); if (!el || el.tagName === 'INPUT' || el.tagName === 'FORM') return;
    const a = el.dataset.rev;
    if (a === 'fav') toggleFav(el);
    else if (a === 'favadd') { FAV.add = true; FAV.err = ''; render(); const i = document.getElementById('rvq'); if (i) i.focus(); }
    else if (a === 'later') { const l = load('favs-later', {}); l[GAME] = 1; save('favs-later', l); render(); }
    else if (a === 'soin') { SOIN.tab = el.dataset.v; render(); }
    else if (a === 'insdone') { ins.done = true; saveIns(); render(); toast(tr('C’est noté')); }
    else if (a === 'inslater') { ins.later = true; INS.open = false; saveIns(); render(); }
    else if (a === 'insopen') { INS.open = true; render(); }
  });
  document.addEventListener('submit', e => {
    if (!e.target.matches || !e.target.matches('[data-rev="favform"]')) return;
    e.preventDefault(); addTyped((e.target.querySelector('input') || {}).value);
  });
  document.addEventListener('change', e => {
    if (!e.target.dataset || e.target.dataset.rev !== 'cap') return;
    const v = parseFloat(String(e.target.value).replace(/[\s  ]/g, '').replace(',', '.'));
    ins.cap = v > 0 ? Math.round(v) : null; ins.cur = userCur(); saveIns(); render();
  });

  /* ---------- Branchement dans l'appli ---------- */
  const route = () => parseHash().parts[0];
  const baseRender = render;
  render = function (keepFocus) {
    const r = DB && S.face ? route() : '';
    if (r === 'preferes' || r === 'soin') {
      document.body.dataset.face = G() ? 'galerie' : 'marche';
      app.innerHTML = r === 'preferes' ? viewFavs(parseHash().q) : viewSoin();
      document.title = tr(r === 'preferes' ? 'Tes préférés' : 'Prendre soin de tes cartes') + ' · CallIt!';
      return;
    }
    baseRender(keepFocus);
  };
  if (DB && S.face && /^(preferes|soin)$/.test(route())) render();
})();
