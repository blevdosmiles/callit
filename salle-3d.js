/* CallIt! · « Ma salle 3D » (bêta, 28/11/2026 : « pour que les gens testent et donnent leur avis »).
   La salle de collection en 3D, ouverte depuis le menu (Mes cartes → Ma salle 3D), à l'adresse #/salle.
   - La salle est dans salle3d/ (sa page et son script d'environ 1 Mo, faits depuis la démo par faire-appli.py, voir
     apercus/galerie-3d/source) : elle tourne dans un cadre et ne se charge qu'à l'ouverture de l'écran. En quittant
     l'écran, le cadre est retiré : la 3D ne tourne pas en arrière-plan.
   - L'appli lui envoie la collection (postMessage, rien ne quitte l'appareil) : dans les cadres, les 3 cartes de la
     vitrine de l'accueil ; ses 30 cartes les plus chères à choisir pour les cadres ; ses 3 cartes gradées les plus chères ;
     un classeur par set commencé (jusqu'à 21, les plus remplis d'abord) ; ses produits de « Mes scellés ».
     Collection vide : la salle d'exemple.
   - « Donner mon avis » : table « retours » (type « idee », texte « Avis salle 3D : … »), avec l'image de la salle si on
     la joint, la taille de l'écran et le temps que la salle a mis à se construire sur cet appareil.
   - Appli téléphone : la page de la salle vient du site (callitcards.com/salle3d), dans un cadre que la politique de
     sécurité de l'appli doit accepter (frame-src, depuis le 28/11/2026). Dans les versions d'avant, l'entrée du menu
     n'apparaît pas et l'écran dit que la salle arrive avec la prochaine version.
   - Pokémon seulement pour l'instant : les classeurs, les scellés et les images sont faits pour Pokémon. */
(function () {
  'use strict';
  if (typeof render !== 'function') return;

  const SITE = 'https://callitcards.com';
  const route = () => location.hash.replace(/^#\/?/, '').split(/[/?]/)[0];
  const isHere = () => DB && S.face && route() === 'salle';
  const CSP = (document.querySelector('meta[http-equiv="Content-Security-Policy"]') || {}).content || '';
  const CADRE_OK = !NATIF || /frame-src[^;]*https:\/\/callitcards\.com/.test(CSP);
  const ORIGINE = NATIF ? SITE : location.origin;
  const SRC = NATIF ? SITE + '/salle3d/index.html' : 'salle3d/index.html';
  window.CallItSalle = { dispo: () => PKM && CADRE_OK };

  /* ---------- Ce que la salle reçoit de la collection ---------- */
  const CATS = ['Pokémon Booster', 'Pokémon Display', 'Pokémon Theme Decks', 'Pokémon Trainer Kits', 'Pokémon Tins', 'Pokémon Elite Trainer Boxes', 'Pokémon Box Set', 'Pokémon Lot', 'Pokémon Blisters', 'PCG Set'];
  const PAS_HOLO = new Set(['', 'Common', 'Uncommon', 'Rare', 'None', 'Promo']);
  const brille = (c, it) => !PAS_HOLO.has(rar(c)) || !!(it && it.rev); // holo, ou mon exemplaire en reverse
  const abs = u => { try { return new URL(u, location.href).href; } catch (e) { return ''; } };
  // les images de la carte, la meilleure d'abord (dans la langue de mon exemplaire), puis deux de secours
  const images = (c, lang, q) => imgOrder(c, lang || prefLang(c)).slice(0, 3).map(l => imgUrl(c, l, q)).filter(u => u && !/^data:/.test(u)).map(abs).filter(Boolean);
  let compte = null; // pour l'avis : combien de cartes, de sets, de gradées et de scellés

  function scelles() {
    if (!SEALED || !sealedCol.length) return [];
    return sealedCol.map(s => {
      const x = SEALED.byId.get(s.pid); if (!x) return null;
      const st = sealSet(x);
      return { id: String(s.id), nom: x.name, cat: CATS.indexOf(x.cat), ext: st ? String(st.id) : '', extNom: st ? setName(st) : '', serie: st ? st.serie || '' : '', qte: Math.max(1, +s.qty || 1) };
    }).filter(Boolean);
  }
  function donnees() {
    const cfg = vtCfg(), items = vtItems(), sc = scelles();
    const D = { neon: { texte: cfg.neon || '', couleur: cfg.couleur, police: cfg.ecriture }, mur: cfg.mur };
    compte = { cartes: items.length, sets: 0, gradees: 0, scelles: sc.length };
    if (!items.length && !sc.length) return Object.assign(D, { vide: true });
    const fiche = x => ({ id: x.it.id, nom: cardName(x.c), detail: setName(x.c.set) + ' · ' + numLabel(x.c), holo: brille(x.c, x.it), urls: images(x.c, x.it.lang, 'high'), petite: images(x.c, x.it.lang, 'low')[0] || '' });
    const mur = vtPicks(cfg, items), choix = items.slice(0, 30);
    for (const x of mur) if (!choix.includes(x)) choix.push(x);
    const grad = items.filter(x => x.it.grader);
    const gradees = grad.slice(0, 3).map(x => ({ id: x.it.id, nom: cardName(x.c), serie: setName(x.c.set), note: x.it.grade == null ? '' : String(x.it.grade), societe: x.it.grader === 'Autre' ? '' : x.it.grader, holo: brille(x.c, x.it), urls: images(x.c, x.it.lang, 'high') }));
    // un classeur par set commencé : chaque carte du set, possédée (avec son image) ou non (son numéro, son nom, sa cote)
    const sets = new Map();
    for (const x of items) {
      let g = sets.get(x.c.s); if (!g) sets.set(x.c.s, g = { c: x.c, a: new Map(), v: 0 });
      if (!g.a.has(x.c.key)) g.a.set(x.c.key, x.it);
      g.v += x.v;
    }
    const classeurs = [...sets.values()].sort((a, b) => b.a.size - a.a.size || b.v - a.v).slice(0, 21).map(g => {
      const st = g.c.set, all = setCards(g.c).all;
      return {
        cle: String(st.id), titre: setName(st), set: setName(st), total: st.count || all.length, possede: g.a.size,
        cartes: all.map(c => { const it = g.a.get(c.key), p = price(c) || 0; return [String(c.num), cardName(c), p, c.t == null ? -1 : c.t, brille(c, it) ? 1 : 0, it ? 1 : 0, it ? images(c, it.lang, 'low')[0] || '' : '', p ? eur(p) : '']; })
      };
    });
    Object.assign(compte, { sets: sets.size, gradees: grad.length });
    return Object.assign(D, { cartes: choix.map(fiche), murCartes: mur.map(x => x.it.id), gradees, classeurs, scelles: sc });
  }

  /* ---------- L'écran ---------- */
  let root = null, cadre = null, pret = false, D = null, attente = 0, photoCb = null;
  const entete = () => `<div class="top sl-top">${backBtn()}<h1 class="title">${esc(tr('Ma salle 3D'))}</h1><span class="sl-beta">${esc(tr('Bêta'))}</span>${CADRE_OK
    ? `<button class="btn small primary sl-avis" data-sl="avis"><span class="sl-long">${esc(tr('Donner mon avis'))}</span><span class="sl-court">${esc(UI === 'fr' ? 'Mon avis' : tr('Avis'))}</span></button>` : ''}</div>`;
  const message = k => k === 'appli'
    ? `<div class="sl-msg"><p>${esc(tr('La salle 3D arrive avec la prochaine version de l’appli. Tu peux déjà l’essayer sur callitcards.com.'))}</p><a class="btn" href="${SITE}/#/salle" target="_blank" rel="noopener">${esc(tr('Ouvrir callitcards.com'))}</a></div>`
    : `<div class="sl-msg"><p>${esc(tr('La salle ne s’est pas ouverte. Vérifie ta connexion, puis réessaie.'))}</p><button class="btn" data-sl="encore">${esc(tr('Réessayer'))}</button></div>`;

  function quitter() {
    clearTimeout(attente); attente = 0;
    if (root) root.remove();
    root = cadre = null; pret = false; D = null; photoCb = null;
    document.body.classList.remove('sl-on');
    if (typeof applyTheme === 'function') applyTheme(); // la barre du navigateur reprend la couleur du thème
  }
  function monter() {
    quitter();
    app.innerHTML = `<div class="sl">${entete()}<div class="sl-cadre">${CADRE_OK ? `<iframe src="${esc(SRC)}" title="${esc(tr('Ma salle 3D'))}" allow="fullscreen"></iframe>` : message('appli')}</div></div>`;
    root = app.querySelector('.sl'); cadre = root.querySelector('iframe');
    document.body.classList.add('sl-on');
    // pendant la visite, la barre du navigateur prend la couleur de la salle (comme l'en-tête)
    const tc = document.querySelector('meta[name="theme-color"]'); if (tc) tc.content = '#0e100f';
    if (!cadre) return;
    // la page de la salle dit « prête » dès qu'elle est lue (avant son gros script) : sans nouvelles, c'est le réseau
    attente = setTimeout(() => { if (!pret && root) { cadre = null; root.querySelector('.sl-cadre').innerHTML = message('reseau'); } }, 20000);
    preparer(cadre);
  }
  async function preparer(moi) {
    if (sealedCol.length && !SEALED) { try { await loadSealed(); } catch (e) { /* sans les scellés */ } }
    if (cadre !== moi) return; // écran quitté entre-temps
    try { D = donnees(); } catch (e) { console.error(e); D = { vide: true }; }
    envoyer();
  }
  // une fois par « prête » : si la page de la salle se recharge, elle reçoit de nouveau la collection
  function envoyer() {
    if (!pret || !D || !cadre || !cadre.contentWindow) return;
    pret = false;
    try { cadre.contentWindow.postMessage({ type: 'callit-salle-donnees', donnees: D }, ORIGINE); } catch (e) { console.error(e); }
  }
  addEventListener('message', e => {
    if (!cadre || e.source !== cadre.contentWindow || e.origin !== ORIGINE) return;
    const m = e.data || {};
    if (m.type === 'callit-salle-pret') { pret = true; clearTimeout(attente); envoyer(); }
    else if (m.type === 'callit-salle-photo' && photoCb) photoCb(m);
  });

  /* ---------- Donner mon avis ---------- */
  // l'image de ce que l'on voit dans la salle, et le temps qu'elle a mis à se construire
  function photoSalle() {
    return new Promise(ok => {
      if (!cadre || !cadre.contentWindow) return ok(null);
      const t = setTimeout(() => { photoCb = null; ok(null); }, 5000);
      photoCb = m => { clearTimeout(t); photoCb = null; ok(m); };
      try { cadre.contentWindow.postMessage({ type: 'callit-salle-photo' }, ORIGINE); } catch (e) { clearTimeout(t); photoCb = null; ok(null); }
    });
  }
  const dataBlob = u => { const [h, b] = u.split(','), bin = atob(b), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new Blob([a], { type: (/:(.*?);/.exec(h) || [])[1] || 'image/jpeg' }); };
  const NOTES = [['adore', 'J’adore', 'j’adore'], ['pasmal', 'Pas mal', 'pas mal'], ['bof', 'Bof', 'bof']];
  function avis() {
    const d = document.createElement('dialog'); d.className = 'sheet';
    let note = '', texte = '', joindre = true, photo = null;
    d.innerHTML = `<form class="sheet-in" method="dialog"><b style="font-size:var(--t-l)">${esc(tr('Ton avis sur la salle 3D'))}</b>
    <p class="small" style="margin:0">${esc(tr('Elle est encore en test : dis-nous ce qui te plaît, ce qui manque ou ce qui ne marche pas.'))}</p>
    <div class="face" role="group" style="align-self:flex-start;flex-wrap:wrap">${NOTES.map(([k, l]) => `<button type="button" data-sn="${k}" aria-pressed="false">${esc(tr(l))}</button>`).join('')}</div>
    <textarea name="t" class="fld" rows="4" maxlength="2500" aria-label="${esc(tr('Ton avis sur la salle 3D'))}" placeholder="${esc(tr('Ce qui te plaît, ce qui manque, ce qui ne marche pas…'))}"></textarea>
    <div class="sl-joindre-zone"></div>
    <div class="small">${esc(tr('Ne mets pas d’informations personnelles.'))}</div>
    <div class="btns"><button class="btn" value="cancel" formnovalidate>${esc(tr('Annuler'))}</button><button class="btn primary" value="ok">${esc(tr('Envoyer'))}</button></div></form>`;
    document.body.appendChild(d);
    d.addEventListener('input', e => { if (e.target.name === 't') texte = e.target.value; });
    d.addEventListener('change', e => { if (e.target.name === 'photo') joindre = e.target.checked; });
    d.addEventListener('click', e => {
      const b = e.target.closest('button[data-sn]'); if (!b) return;
      note = note === b.dataset.sn ? '' : b.dataset.sn;
      d.querySelectorAll('button[data-sn]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.sn === note)));
    });
    // rien d'écrit ni de choisi : on reste sur la feuille
    d.addEventListener('submit', e => { if (e.submitter && e.submitter.value === 'ok' && !texte.trim() && !note) { e.preventDefault(); d.querySelector('textarea').focus(); } });
    d.addEventListener('close', async () => {
      const t = texte.trim(); d.remove();
      if (d.returnValue !== 'ok' || (!t && !note)) return;
      const n = compte || {}, s = photo && photo.prete ? (photo.prete / 1000).toFixed(1).replace('.', ',') : '';
      const infos = [s ? `salle prête en ${s} s` : '', `écran ${innerWidth}×${innerHeight}`,
        n.cartes || n.scelles ? `${n.cartes} cartes, ${n.sets} sets, ${n.gradees} gradées, ${n.scelles} scellés` : 'collection vide (salle d’exemple)'].filter(Boolean).join(' · ');
      const res = [`Avis salle 3D : ${(NOTES.find(x => x[0] === note) || [])[2] || '-'}`, t, infos].filter(Boolean).join('\n');
      let shot = '';
      if (joindre && photo && photo.img) {
        shot = photo.img.length < 450000 ? photo.img : '';
        if (!shot) { try { shot = await shrinkShot(dataBlob(photo.img)); } catch (er) { shot = ''; } }
      }
      try {
        const c = await supa(); if (!c) throw new Error('hors ligne');
        const { error } = await c.from('retours').insert({ kind: 'idee', texte: res.slice(0, 3000), capture: shot || null, page: '#/salle avis', langue: UI, appareil: navigator.userAgent.slice(0, 300) });
        if (error) throw error;
        toast(tr('Merci, c’est bien reçu !'));
      } catch (er) { toast(tr('Envoi impossible. Réessaie plus tard ou écris à request@callitcards.com')); }
    });
    d.showModal();
    // l'image jointe s'affiche dans la feuille dès qu'elle arrive : on voit ce qui part
    photoSalle().then(m => {
      photo = m; const z = d.open && d.querySelector('.sl-joindre-zone');
      if (!z || !m || !m.img || !/^data:image\/jpeg;base64,/.test(m.img)) return;
      z.innerHTML = `<label class="row sl-joindre"><input type="checkbox" name="photo" checked><img src="${m.img}" alt="" class="sl-mini"><span>${esc(tr('Joindre cette image de la salle'))}</span></label>`;
    });
  }
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-sl]'); if (!b || !root || !root.contains(b)) return;
    if (b.dataset.sl === 'avis') avis();
    else if (b.dataset.sl === 'encore') monter();
  });

  /* ---------- Branchement dans l'appli ---------- */
  const baseRender = render;
  render = function (keepFocus) {
    if (isHere()) {
      document.body.dataset.face = G() ? 'galerie' : 'marche';
      document.title = tr('Ma salle 3D') + ' · CallIt!';
      if (!PKM) { quitter(); location.hash = '#/'; return; }
      if (root && app.contains(root)) return; // déjà ouverte (un autre écran a demandé à se redessiner)
      monter();
      return;
    }
    if (root) quitter();
    baseRender(keepFocus);
  };
  if (isHere()) render();
})();
