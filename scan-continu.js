/* CallIt! · Scanner mon album (scan en continu) : la caméra reste ouverte, on passe ses cartes l'une après l'autre.
   Le bouton de scan propose d'abord « Une carte » (photo, puis fiche et centrage) ou « Mon album » (cet écran).
   Avant de commencer : langue et état par défaut, et si l'appli doit les demander à chaque carte.
   Chaque carte reconnue avec certitude (numéro ET nom lus, voir matchScan dans app.js) s'ajoute à la session :
   sa cote s'affiche en grand et le total de la session monte. À la fin, on relit la liste, on retire ce qui ne va pas,
   puis on ajoute tout à sa collection en un geste. Rien n'est ajouté à la collection sans ce dernier geste.
   La lecture se fait dans le téléphone (même lecteur de texte que le scan d'une photo) : aucune image n'est envoyée.
   Sans caméra (ordinateur, autorisation refusée), on peut choisir plusieurs photos d'un coup : même session, même total.
   Fichier séparé de app.js : il réutilise ses fonctions (getOcr, matchScan, ownValue, cimg, collection…) et s'ajoute au routeur. */
(function () {
  'use strict';
  if (typeof render !== 'function' || typeof matchScan !== 'function') return;

  const route = () => location.hash.replace(/^#\/?/, '').split(/[/?]/)[0];
  const isScan = () => route() === 'scan';

  /* ---------- La session, gardée sur l'appareil (rien n'est perdu si la page se recharge) ---------- */
  // « Me demander l'état des cartes à 5 € ou plus » est coché d'office (modèle d'écran du 27/11/2026)
  const SS = Object.assign({ items: [], cond: 'NM', lang: '', askLang: false, askCond: true }, load('scanSession', {}));
  if (!Array.isArray(SS.items)) SS.items = [];
  const saveS = () => save('scanSession', { items: SS.items, cond: SS.cond, lang: SS.lang, askLang: SS.askLang, askCond: SS.askCond });
  let seq = 0;
  const newId = () => Date.now().toString(36) + (seq++ % 46656).toString(36).padStart(3, '0') + Math.random().toString(36).slice(2, 4);
  const live = () => SS.items.filter(it => BYKEY.has(it.key));
  // Valeur d'un exemplaire de la session : la même règle que la collection (cote, état, langue), dans la devise affichée
  const valOf = it => { const c = BYKEY.get(it.key), e = c && ownValue({ lang: it.lang, cond: it.cond || SS.cond, rev: false, grader: '' }, c); return e ? e.u : null; };
  const total = () => live().reduce((s, it) => s + (valOf(it) || 0), 0);
  const nCards = n => (n > 1 ? n + ' cartes' : n + ' carte'); // traduit à l'affichage (i18n.js)
  const langName = l => tr(LANG[l] ? LANG[l].name : l);

  /* ---------- État de l'écran ---------- */
  const ASK_MIN = 5; // euros
  const V = { askC: false, ask: null, gone: 0, view: 'setup', stream: null, err: '', busy: false, on: false, hint: '', again: null, photos: 0, pop: null, popT: 0 };
  let root = null;

  /* ---------- Caméra ---------- */
  async function startCam() {
    if (V.stream || V.view !== 'cam') return;
    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) { V.err = 'nocam'; drawCam(); return; }
    try {
      V.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
    } catch (e) { V.err = e && e.name === 'NotAllowedError' ? 'refus' : 'nocam'; drawCam(); return; }
    if (!isScan() || V.view !== 'cam') { stopCam(); return; }
    V.err = '';
    const vid = root && root.querySelector('#sc-video');
    if (vid) { vid.srcObject = V.stream; vid.play().catch(() => {}); }
    drawCam();
    if (!V.on) { V.on = true; loop(); }
    getOcr().catch(() => {}); // le lecteur se charge pendant qu'on cadre la première carte
  }
  function stopCam() {
    V.on = false;
    if (V.stream) { V.stream.getTracks().forEach(t => t.stop()); V.stream = null; }
  }

  // Image du cadre (la carte), agrandie et en niveaux de gris, prête à être lue
  function grabFrame(color) {
    const vid = root && root.querySelector('#sc-video'), fr = root && root.querySelector('.sc-frame');
    if (!vid || !fr || !vid.videoWidth) return null;
    const vb = vid.getBoundingClientRect(), fb = fr.getBoundingClientRect();
    const s = Math.max(vb.width / vid.videoWidth, vb.height / vid.videoHeight); // la vidéo remplit son cadre (object-fit: cover)
    const ox = (vb.width - vid.videoWidth * s) / 2, oy = (vb.height - vid.videoHeight * s) / 2;
    const m = 0.06 * fb.width; // un peu de marge autour du cadre : la carte n'y est jamais pile
    let sx = (fb.left - vb.left - m - ox) / s, sy = (fb.top - vb.top - m - oy) / s, sw = (fb.width + 2 * m) / s, sh = (fb.height + 2 * m) / s;
    sx = Math.max(0, sx); sy = Math.max(0, sy); sw = Math.min(vid.videoWidth - sx, sw); sh = Math.min(vid.videoHeight - sy, sh);
    if (sw < 20 || sh < 20) return null;
    const k = Math.min(2.2, 1400 / sh), cv = document.createElement('canvas');
    cv.width = Math.round(sw * k); cv.height = Math.round(sh * k);
    const g = cv.getContext('2d'); if (!color) g.filter = 'grayscale(1) contrast(1.4)'; g.drawImage(vid, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
    return cv;
  }

  // Lit le cadre, encore et encore, tant que l'écran est ouvert
  async function loop() {
    while (V.on && isScan() && V.view === 'cam') {
      if (document.hidden || V.ask) { await wait(300); continue; }
      const cv = grabFrame();
      if (!cv) { await wait(300); continue; }
      try {
        V.busy = true;
        // D'abord le dessin de la carte (empreinte.js, une fraction de seconde) : s'il désigne une seule carte sans hésiter,
        // pas besoin de lire le texte (plusieurs secondes). Sinon on lit le texte, et les deux se combinent (fuseScan).
        const im = await drawing(grabFrame(true));
        if (!V.on || !isScan()) break;
        if (im && im.sure && im.group.length === 1 && im.best <= 36 && im.gap >= 20) onText('', false, im); // dessin très net (sur nos photos, les bonnes cartes sont à ≤ 18)
        else {
          const w = await getOcr();
          const { data } = await w.recognize(cv);
          if (V.on && isScan()) onText(data.text || '', false, im);
        }
      } catch (e) { V.hint = 'Lecture impossible pour l’instant. Réessaie dans un instant.'; drawHint(); await wait(1200); }
      V.busy = false;
      await wait(150);
    }
  }
  const wait = ms => new Promise(r => setTimeout(r, ms));

  /* ---------- Une lecture → une carte ajoutée (ou un conseil) ---------- */
  // Mots imprimés sur toutes les cartes d'une langue (faiblesse, retraite…) : ils trahissent la langue même quand le nom
  // du Pokémon est identique (« Charmander » en anglais et en italien). Le texte est lu sans accents.
  const MARKS = { en: /\b(weakness|retreat)\b/, fr: /\b(faiblesse|retraite)\b/, de: /(schwache|ruckzug|riickzug)/, it: /\b(debolezza|ritirata)\b/, es: /\b(debilidad|retirada)\b/, pt: /\b(fraqueza|recuo)\b/ };
  function langFor(c, m, text) {
    const langs = c.langs.length ? c.langs : [c.set.reg === 'en' ? 'en' : 'ja'];
    if (SS.lang && langs.includes(SS.lang)) return SS.lang; // la langue choisie en haut de l'écran
    const t = norm(text || ''), seen = langs.filter(l => MARKS[l] && MARKS[l].test(t));
    if (seen.length === 1) return seen[0];
    const read = (m.langs || []).filter(l => langs.includes(l)), pref = prefLang(c);
    return !read.length || read.includes(pref) ? pref : read[0];
  }
  // Reconnaissance par le dessin (empreinte.js) : null si elle n'est pas là ou coupée
  const drawing = src => src && window.CallItEmpreinte && CallItEmpreinte.on() ? CallItEmpreinte.match(src).catch(() => null) : Promise.resolve(null);
  // Cartes possibles quand on n'est pas sûr : celles au même dessin (réimpressions : même carte dans un autre set ou une autre
  // langue), sinon les plus proches, puis celles du texte. Seulement dans les langues que je collectionne (Réglages) ; les cartes
  // de la région de la carte d'abord (texte occidental lu : « Weakness », « Faiblesse »… sinon carte asiatique).
  function candidates(m, im, text) {
    let xs = [];
    if (im && im.how === 'carte' && im.best <= CallItEmpreinte.SURE_MAX) xs = im.sure ? im.group.slice() : im.list.filter(x => x.d <= im.best + 4).map(x => x.c);
    xs = [...new Set([...xs, ...m.results.slice(0, 4)])].filter(c => !c.x && (!c.langs.length || visibleLangs(c).length));
    const west = WEST_WORDS.test(norm(text || '')), reg = SS.lang ? (ASIA.has(SS.lang) ? 'ja' : 'en') : west ? 'en' : (String(text || '').trim() ? 'ja' : '');
    if (reg) xs.sort((a, b) => (b.set.reg === reg) - (a.set.reg === reg));
    return xs.slice(0, 4);
  }
  function onText(text, fromPhoto, im) {
    const mt = matchScan(text), m = typeof fuseScan === 'function' ? fuseScan(mt, im) : mt;
    const c = m.sure && m.results[0];
    // Carte reconnue par le dessin seul : il faut la voir deux fois de suite avant de l'ajouter (un reflet ou un bougé
    // peut ressembler une fois à une autre carte). Lue par le texte (numéro + nom) : ajoutée tout de suite, comme avant.
    if (c && !c.x && !fromPhoto && !mt.sure) {
      const k = c.key; V.seen = V.seen && V.seen.key === k ? { key: k, n: V.seen.n + 1 } : { key: k, n: 1 };
      if (V.seen.n < 2) { V.hint = 'Ne bouge pas…'; drawHint(); return false; }
    }
    if (!c || c.x) {
      if (fromPhoto) return false;
      const near = !!(im && im.how === 'carte' && im.best <= CallItEmpreinte.SURE_MAX + 10);
      // rien de lisible ni de dessin proche : la carte a sans doute été retirée
      if (!mt.results.length && !mt.nums.length && !near) { V.gone++; V.unsure = 0; }
      // Une carte est bien là, mais on hésite deux fois de suite : on demande laquelle c'est (ou son code et son numéro)
      if (near || mt.results.length) V.unsure = (V.unsure || 0) + 1;
      if (V.unsure >= 2) {
        V.unsure = 0; V.seen = null;
        V.ask = { step: 'pick', cands: candidates(m, im, text).map(x => x.key), text }; V.hint = ''; drawCam(); return false;
      }
      V.hint = near || mt.results.length ? 'Je regarde encore… garde la carte bien à plat.' : 'Place une carte dans le cadre, bien à plat.';
      drawHint(); return false;
    }
    V.unsure = 0; V.seen = null;
    const lastIt = SS.items[SS.items.length - 1];
    // La même carte reste devant la caméra : on ne la compte pas deux fois. Un bouton permet d'en ajouter un autre exemplaire.
    // Après deux lectures vides de suite (carte retirée, puis une autre posée), le même nom compte comme un nouvel exemplaire.
    if (!fromPhoto && lastIt && lastIt.key === c.key && V.gone < 2) {
      V.gone = 0; if (!V.again) V.again = { key: c.key, lang: lastIt.lang };
      V.hint = 'Carte suivante !'; drawHint(); return false;
    }
    add(c, langFor(c, m, text));
    return true;
  }
  // Combien d'exemplaires de cette carte j'ai déjà : dans ma collection, et en comptant cette session
  const inCol = c => collection.reduce((n, x) => n + (x.key === c.key ? (+x.qty || 1) : 0), 0);
  const owned = c => inCol(c) + SS.items.filter(x => x.key === c.key).length;
  function add(c, lang, ok) {
    // Déjà là : on demande si c'est bien un exemplaire de plus (scan caméra ; avec des photos, la liste de fin le signale)
    if (!ok && !V.photos && owned(c)) { V.ask = { step: 'dup', key: c.key, lang }; V.hint = ''; drawCam(); return; }
    const it = { id: newId(), key: c.key, lang, cond: SS.cond, at: Date.now() };
    SS.items.push(it); saveS();
    // Réglage « me demander » : la langue puis l'état de cette carte, avant de passer à la suivante (scan caméra seulement)
    // L'état n'est demandé que pour les cartes à 5 € ou plus (cote Near Mint) : en dessous, il ne change presque rien au total
    const askC = SS.askCond && (valOf(it) || 0) / (rate(userCur()) || 1) >= ASK_MIN;
    V.askC = askC;
    if (!V.photos && (SS.askLang || askC)) V.ask = { id: it.id, step: SS.askLang && (c.langs.length > 1) ? 'lang' : askC ? 'cond' : null };
    if (V.ask && !V.ask.step) V.ask = null;
    V.again = null; V.gone = 0; V.hint = V.ask ? '' : 'Carte suivante !';
    const v = valOf(it);
    V.pop = { name: cardName(c), v }; V.popT = Date.now();
    try { navigator.vibrate && navigator.vibrate(30); } catch (e) {}
    drawCam();
  }
  function answer(field, value) {
    const it = V.ask && SS.items.find(x => x.id === V.ask.id); if (!it) { V.ask = null; drawCam(); return; }
    if (field) { it[field] = value; saveS(); }
    V.ask = V.ask.step === 'lang' && V.askC ? { id: it.id, step: 'cond' } : null;
    if (!V.ask) { V.again = null; V.gone = 0; V.hint = 'Carte suivante !'; }
    drawCam();
  }

  // Sans caméra, ou en plus : plusieurs photos d'un coup, lues l'une après l'autre
  async function fromPhotos(files) {
    files = [...files].filter(f => /^image\//.test(f.type || 'image/'));
    if (!files.length) return;
    let ok = 0, ko = 0; V.photos = files.length; drawHint();
    for (const f of files) {
      try {
        const imP = drawing(f);
        const [cv, w] = await Promise.all([prepImage(f), getOcr()]);
        const { data } = await w.recognize(cv);
        if (onText(data.text || '', true, await imP)) ok++; else ko++;
      } catch (e) { ko++; }
      V.photos--; drawHint();
    }
    V.photos = 0;
    V.hint = ko ? (ok ? F('{0} reconnues, {1} à chercher à la main (photo floue ou numéro caché).', ok, ko) : 'Aucune carte reconnue : cadre la carte bien à plat, avec le numéro en bas net et lisible.') : '';
    if (V.view === 'cam') drawCam(); else draw();
  }


  /* ---------- L'état d'une carte : définitions, comment vérifier, exemples (page #/etats) ---------- */
  // Pour chaque état : la carte décrite point par point, et ce que ça change pour une gradation (ordres de grandeur, pas une promesse).
  // Le résumé (sum) reprend les définitions de l'outil de vente (vendre.js). Part de la cote Near Mint : OWN_COND_K (app.js).
  const COND_GUIDE = {
    MT: { sum: 'Parfaite, comme sortie du booster : aucun défaut, même de près.',
      pts: [['Coins', 'Parfaitement pointus, les quatre.'], ['Bords', 'Aucun point blanc, ni au recto ni au verso.'], ['Surface', 'Aucune rayure, même en inclinant la carte sous la lampe.'], ['Plis', 'Aucun.']],
      grade: 'Candidate à un 10 si le centrage est bon aussi. À faire grader seulement si la carte vaut cher ou est très rare.' },
    NM: { sum: 'Presque parfaite : au plus un ou deux défauts minuscules, comme un petit point blanc sur un bord.',
      pts: [['Coins', 'Pointus. Au plus un coin à peine touché.'], ['Bords', 'Un ou deux points blancs minuscules au maximum, souvent au dos.'], ['Surface', 'Rien à l’œil nu. Au plus une rayure très fine en inclinant.'], ['Plis', 'Aucun, rien de froissé.']],
      grade: 'Plutôt un 8 ou un 9 : dès qu’il y a un point blanc, le 10 devient rare. À faire grader seulement si la carte vaut cher ou est très rare.' },
    EX: { sum: 'Petits défauts visibles : bords ou coins un peu blanchis, légères rayures. Aucun pli.',
      pts: [['Coins', 'Un ou plusieurs coins un peu blanchis ou émoussés.'], ['Bords', 'Plusieurs points blancs, visibles sans chercher.'], ['Surface', 'Quelques rayures légères qui se voient en inclinant.'], ['Plis', 'Aucun.']],
      grade: 'Plutôt un 6 ou un 7. Grader coûte au moins 35 à 40 € : seulement pour une carte très chère ou très rare.' },
    GD: { sum: 'Usure nette : coins et bords blanchis, rayures sur la surface. Aucun pli.',
      pts: [['Coins', 'Blanchis et un peu arrondis.'], ['Bords', 'Des points blancs sur presque tout le tour.'], ['Surface', 'Rayures visibles à l’œil nu, la carte brille moins.'], ['Plis', 'Aucun.']],
      grade: 'Autour de 4 ou 5. Pas rentable, sauf pour une carte très chère ou très rare.' },
    LP: { sum: 'Bien jouée : forte usure, petit pli ou marque possibles.',
      pts: [['Coins', 'Usés, parfois un peu abîmés.'], ['Bords', 'Usure tout le tour, petites éraflures.'], ['Surface', 'Rayures et petites marques.'], ['Plis', 'Un petit pli ou une petite marque possible.']],
      grade: 'Autour de 2 à 4. À ne pas faire grader, sauf pour une carte très chère ou très rare, comme une ancienne carte recherchée.' },
    PL: { sum: 'Très jouée : plis, marques, salissures. La carte reste entière.',
      pts: [['Coins', 'Très usés.'], ['Bords', 'Très usés, parfois abîmés.'], ['Surface', 'Salissures, traces de doigts, rayures marquées.'], ['Plis', 'Un ou plusieurs plis bien visibles.']],
      grade: 'À ne pas faire grader.' },
    PO: { sum: 'Abîmée : gros pli, déchirure, trace d’eau ou écriture.',
      pts: [['Coins', 'Abîmés ou arrachés.'], ['Bords', 'Abîmés, parfois déchirés.'], ['Surface', 'Tache d’eau, écriture, autocollant ou carte gondolée.'], ['Plis', 'Gros pli ou carte pliée en deux.']],
      grade: 'À ne pas faire grader.' }
  };
  const condName = k => (CONDS.find(x => x[0] === k) || ['', k])[1];
  const pctNM = k => Math.round((OWN_COND_K[k] || 1) * 100);
  let GSEL = 'NM';
  // Petits dessins des quatre points à regarder
  const PT_ICON = {
    Coins: '<path d="M5 19V9a4 4 0 0 1 4-4h10"/><circle cx="9" cy="9" r="1.6" fill="currentColor" stroke="none"/>',
    Bords: '<rect x="5" y="3.5" width="14" height="17" rx="2.5"/><path d="M8.5 3.5v17" stroke-dasharray="1.5 2.5"/>',
    Surface: '<rect x="5" y="3.5" width="14" height="17" rx="2.5"/><path d="M8 15l4-6M11 16l3-4.5"/>',
    Plis: '<path d="M5 4h14v16H5z"/><path d="M5 13l14-5"/>'
  };
  const ptIcon = k => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PT_ICON[k] || ''}</svg>`;
  // Verdict de gradation en deux mots, et sa couleur (ok : vert, bof : ambre, non : gris)
  // Dégradé du meilleur état (vert) au pire (rouge)
  const COND_COL = { MT: '#0a7a44', NM: '#368439', EX: '#8aa833', GD: '#c99a12', LP: '#d9761f', PL: '#cc4b2e', PO: '#a8261d' };
  // Texte posé sur la couleur de l'état : blanc sur les teintes foncées, noir sur les claires (contraste 4,5:1 au moins)
  const COND_TXT = { EX: '#16161a', GD: '#16161a', LP: '#16161a' };
  const VERDICT = { MT: ['Vise le 10', 'ok'], NM: ['Plutôt 8 ou 9', 'ok'], EX: ['Rarement rentable', 'bof'], GD: ['Pas rentable', 'bof'], LP: ['À ne pas grader', 'non'], PL: ['À ne pas grader', 'non'], PO: ['À ne pas grader', 'non'] };
  function guideHtml() {
    const g = COND_GUIDE[GSEL], pct = pctNM(GSEL), [vt, vc] = VERDICT[GSEL];
    return `<div class="sc-gbar" role="tablist">${CONDS.map(([k, n]) => `<button class="sc-gtab ${k === GSEL ? 'on' : ''}" style="--c:${COND_COL[k]};--t:${COND_TXT[k] || '#fff'}" role="tab" aria-selected="${k === GSEL}" aria-label="${esc(n)}" title="${esc(n)}" data-sc="gsel" data-v="${k}">${k}</button>`).join('')}</div>
    <div class="sc-gcard">
      <div class="sc-ghead"><div class="sc-gname"><i style="--c:${COND_COL[GSEL]};--t:${COND_TXT[GSEL] || '#fff'}">${GSEL}</i><b>${esc(condName(GSEL))}</b></div><span>${esc(tr(g.sum))}</span></div>
      <div class="sc-gval"><div class="between small"><span>${esc(tr('Valeur'))}</span><b>${esc(pct >= 100 ? tr('La cote de référence') : F('≈ {0} % de la cote Near Mint', pct))}</b></div><div class="sc-meter"><span style="width:${pct}%;background:${COND_COL[GSEL]}"></span></div></div>
      <div class="sc-gpts">${g.pts.map(([t, d]) => `<div class="sc-gpt"><div class="sc-gpt-h">${ptIcon(t)}<b>${esc(tr(t))}</b></div><span>${esc(tr(d))}</span></div>`).join('')}</div>
      <div class="sc-gverdict ${vc}"><div class="sc-gverdict-h"><span class="small">${esc(tr('Gradation'))}</span><b>${esc(tr(vt))}</b></div><span>${esc(tr(g.grade))}</span></div>
    </div>
    <div class="sc-ghow"><b>${esc(tr('Pour vérifier'))}</b><span>${esc(tr('Pose la carte sous une lampe, recto puis verso, et incline-la doucement : les rayures et les plis apparaissent dans le reflet.'))}</span><span>${esc(tr('En cas de doute entre deux états, choisis le moins bon.'))}</span><span>${esc(tr('Le centrage ne compte pas dans l’état sur Cardmarket, mais il compte beaucoup pour une gradation.'))} <a href="#/centrage">${esc(tr('Mesurer le centrage'))}</a></span></div>`;
  }
  function viewEtats() {
    return `<div class="sc"><div class="top">${backBtn()}<h1 class="title sc-gtitle">${esc(tr('L’état d’une carte'))}</h1></div><div class="pad stack" style="gap:6px"><div class="sc-guidebox stack"
 style="gap:12px">${guideHtml()}</div></div></div>`;
  }
  function openGuide() {
    const d = document.createElement('dialog'); d.className = 'sheet sc-guide';
    d.innerHTML = `<div class="sheet-in"><div class="between"><b style="font-size:var(--t-l)">${esc(tr('L’état d’une carte'))}</b><button class="iconbtn" data-close aria-label="${esc(tr('Fermer'))}">${X}</button></div><div class="sc-guidebox stack" style="gap:12px">${guideHtml()}</div></div>`;
    d.addEventListener('click', e => { if (e.target === d || e.target.closest('[data-close]') || e.target.closest('a')) d.close(); });
    d.addEventListener('close', () => d.remove());
    document.body.appendChild(d); d.showModal();
  }
  window.CallItEtats = { guide: openGuide };

  /* ---------- Affichage ---------- */
  const CAM = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>';
  const ALBUM = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M9 4v16M15 4v16M3 12h18"/></svg>';
  const X = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  const fmt = v => (v == null ? tr('cote indisponible') : ownMoney(v));
  const photoInput = (label, cls = 'btn small') => `<label class="${cls}">${esc(tr(label))}<input type="file" accept="image/*" multiple class="sr" id="sc-photos"></label>`;
  const langSel = () => `<label class="field">${esc(tr('Langue des cartes'))}<select id="sc-lang">${[['', tr('Automatique')], ...LANGS.map(x => [x[0], tr(x[1])])].map(([k, n]) => `<option value="${k}" ${k === (SS.lang || '') ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>`;
  const condSel = () => `<label class="field">${esc(tr('État de toutes les cartes'))}<select id="sc-cond">${CONDS.map(([k, n]) => `<option value="${k}" ${k === SS.cond ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>`;
  const guideLink = () => `<button class="linkbtn small" data-sc="guide">${esc(tr('Comment estimer l’état ?'))}</button>`;

  function totalHtml() {
    const n = live().length;
    return `<span class="small">${esc(tr('Total de la session'))}</span><b class="num sc-sum">${ownMoney(total())}</b><span class="small">${esc(nCards(n))}</span>`;
  }
  const meta = it => `${langName(it.lang)} · ${condName(it.cond || SS.cond)}`;
  function stripHtml() {
    const xs = live().slice(-6).reverse();
    if (!xs.length) return `<div class="small sc-empty">${esc(tr('Les cartes reconnues s’afficheront ici.'))}</div>`;
    return xs.map(it => { const c = BYKEY.get(it.key), v = valOf(it); return `<div class="sc-mini"><span class="thumb">${cimg(c, { lang: it.lang })}</span><span class="mid"><b>${esc(cardName(c))}</b><span>${esc(setName(c.set))} · ${esc(numLabel(c))} · ${esc(meta(it))}</span></span><b class="num">${fmt(v)}</b></div>`; }).join('');
  }
  function hintHtml() {
    if (V.photos) return `<span>${esc(F('Lecture des photos… encore {0}', V.photos))}</span>`;
    const again = V.gone < 2 && V.again && BYKEY.get(V.again.key);
    return `${V.hint ? `<span>${esc(tr(V.hint))}</span>` : ''}${again ? `<button class="btn small" data-sc="again">${esc(F('+1 {0} (un autre exemplaire)', cardName(again)))}</button>` : ''}`;
  }
  // La question posée sur la caméra : la langue, puis l'état, de la carte qui vient d'être reconnue
  function askHtml() {
    if (V.ask && V.ask.step === 'dup') {
      const c = BYKEY.get(V.ask.key); if (!c) return '';
      const n = owned(c);
      return `<div class="between"><b>${esc(cardName(c))}</b><span class="small">${esc(setName(c.set))} · ${esc(numLabel(c))}</span></div><div class="small">${esc(n > 1 ? F('Tu as déjà {0} exemplaires de cette carte.', n) : tr('Tu as déjà cette carte.'))} ${esc(tr('C’est un exemplaire de plus ?'))}</div><div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn small primary" data-sc="dupyes">${esc(tr('Oui, l’ajouter'))}</button><button class="btn small" data-sc="dupno">${esc(tr('Non, carte suivante'))}</button></div>`;
    }
    if (V.ask && V.ask.step === 'pick') {
      const cs = V.ask.cands.map(k => BYKEY.get(k)).filter(Boolean);
      const list = cs.map(c => `<button class="sc-cand" data-sc="pickc" data-v="${esc(c.key)}"><span class="thumb">${cimg(c)}</span><span class="mid"><b>${esc(cardName(c))}</b><span>${esc(setName(c.set))}</span><span>${esc(c.set.id)} · ${esc(numLabel(c))}</span></span></button>`).join('');
      return `<div class="small"><b>${esc(tr(cs.length ? 'Je ne suis pas sûr. Laquelle est-ce ?' : 'Je ne reconnais pas cette carte.'))}</b></div>${list ? `<div class="sc-cands">${list}</div>` : ''}<form class="sc-code" data-sc-form="code"><label class="small" for="sc-code">${esc(tr('Ou tape le code du set et le numéro, imprimés en bas de la carte'))}</label><div class="row" style="gap:8px"><input id="sc-code" class="input" placeholder="${esc(tr('ex. M2a 070'))}" autocomplete="off" autocapitalize="characters"><button class="btn small primary" type="submit">OK</button></div>${V.ask.err ? `<div class="small sc-err">${esc(tr(V.ask.err))}</div>` : ''}</form><div class="row"><button class="linkbtn small" data-sc="pickno">${esc(tr('Passer cette carte'))}</button></div>`;
    }
    const it = V.ask && SS.items.find(x => x.id === V.ask.id), c = it && BYKEY.get(it.key);
    if (!c) return '';
    const v = valOf(it);
    const head = `<div class="between"><b>${esc(cardName(c))}</b><b class="num">${fmt(v)}</b></div>`;
    if (V.ask.step === 'lang') return `${head}<div class="small">${esc(tr('Quelle langue ?'))}</div><div class="sc-chips">${c.langs.map(l => `<button class="chip ${l === it.lang ? 'on' : ''}" data-sc="setlang" data-v="${l}">${esc(langName(l))}</button>`).join('')}</div><div class="row" style="gap:10px"><button class="linkbtn small" data-sc="skip">${esc(F('Garder : {0}', langName(it.lang)))}</button></div>`;
    const cur = it.cond || SS.cond;
    return `${head}<div class="small">${esc(tr('Quel état ?'))}</div><div class="sc-chips">${CONDS.map(([k, n]) => `<button class="chip ${k === cur ? 'on' : ''}" data-sc="setcond" data-v="${k}">${esc(n)}</button>`).join('')}</div><div class="small sc-def">${esc(tr(COND_GUIDE[cur].sum))}</div><div class="row" style="gap:10px;flex-wrap:wrap"><button class="linkbtn small" data-sc="skip">${esc(F('Garder : {0}', condName(cur)))}</button>${guideLink()}</div>`;
  }
  function camBody() {
    if (V.err) {
      const msg = V.err === 'refus' ? 'La caméra est bloquée pour CallIt!. Autorise-la dans les réglages du navigateur, ou scanne tes cartes avec des photos.' : 'Pas de caméra disponible ici. Tu peux scanner tes cartes avec des photos : choisis-en plusieurs d’un coup.';
      return `<div class="panel stack sc-nocam" style="gap:10px"><div>${esc(tr(msg))}</div><div class="row" style="gap:8px;flex-wrap:wrap">${photoInput('Choisir des photos', 'btn primary')}${V.err === 'refus' ? `<button class="btn small" data-sc="retry">${esc(tr('Réessayer la caméra'))}</button>` : ''}</div></div>`;
    }
    return `<div class="sc-cam"><video id="sc-video" playsinline muted autoplay></video><div class="sc-frame" aria-hidden="true"></div><div class="sc-pop" id="sc-pop" aria-live="polite"></div><div class="sc-ask" id="sc-ask" role="dialog" aria-live="polite"></div></div>`;
  }
  // En-tête commun : flèche retour à gauche, titre juste à droite (modèle d'écran du 27/11/2026)
  const topBar = title => `<div class="top"><button class="iconbtn" data-sc="close" data-back aria-label="${esc(tr('Retour'))}">${icon('back')}</button><h1 class="title">${esc(tr(title))}</h1></div>`;
  function viewSetup() {
    const n = live().length;
    const tog = (id, on, label) => `<label class="sc-tog"><input type="checkbox" id="${id}" ${on ? 'checked' : ''}><span><b>${esc(tr(label))}</b></span></label>`;
    return `<div class="sc">
      ${topBar('Scanner mon album')}
      <div class="pad stack" style="gap:12px">
        <div class="panel stack" style="gap:12px">
          <h2 class="h2" style="margin:0">${esc(tr('Réglages du scan'))}</h2>
          <div class="row sc-defs">${langSel()}${condSel()}</div>
          ${tog('sc-asklang', SS.askLang, 'Me demander la langue de chaque carte')}
          ${tog('sc-askcond', SS.askCond, 'Me demander l’état des cartes à 5 € ou plus')}
          <button class="btn small soft" data-sc="guide" style="align-self:flex-start">${esc(tr('Comment estimer l’état ?'))}</button>
        </div>
        <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn primary big" data-sc="start">
${esc(tr(n ? 'Continuer le scan' : 'Commencer le scan'))}</button>${n ? `<button class="btn small" data-sc="fin">${esc(F('Voir la liste ({0})', n))}</button>` : ''}</div>
      </div>
    </div>`;
  }
  function viewCam() {
    return `<div class="sc">
      ${topBar('Scanner mon album')}
      <div class="pad"><div class="sc-total" id="sc-total">${totalHtml()}</div></div>
      <div class="pad small sc-sets"><span>${esc(SS.lang ? langName(SS.lang) : tr('Langue automatique'))} · ${esc(condName(SS.cond))}${SS.askLang || SS.askCond ? ' · ' + esc(tr('je te demande à chaque carte')) : ''}</span><button class="linkbtn small" data-sc="setup">${esc(tr('Modifier'))}</button></div>
      <div class="pad" id="sc-cambox">${camBody()}</div>
      <div class="pad sc-hint" id="sc-hint" aria-live="polite">${hintHtml()}</div>
      <div class="pad sc-actions"><button class="btn primary" data-sc="fin" ${live().length ? '' : 'disabled'}>${esc(tr('Terminer la session'))}</button>${V.err ? '' : photoInput('Ajouter des photos')}</div>
      <div class="pad"><div class="sc-strip" id="sc-strip">${stripHtml()}</div></div>
    </div>`;
  }
  // Fin de session : les cartes rangées par valeur, et le conseil de mesurer le centrage de celles qui valent le coup
  const TIERS = [[20, 'Plus de 20 €', 'Une gradation ne vaut le coup que pour une carte chère ou très rare, en bon état et bien centrée : mesure son centrage, puis l’écran « À grader ? » compare la cote aux frais.'], [5, 'De 5 à 20 €', 'À faire grader seulement si la carte est très rare et en très bon état.'], [0, 'Moins de 5 €', ''], [-1, 'Sans cote', '']];
  function viewFin() {
    const xs = live(), n = xs.length, k = xs.filter(it => !it.off).length;
    const r = rate(userCur()) || 1;
    const tierOf = it => { const v = valOf(it); if (v == null) return -1; const e = v / r; return e >= 20 ? 20 : e >= 5 ? 5 : 0; }; // seuils en euros
    const row = it => {
      const c = BYKEY.get(it.key), v = valOf(it), t = tierOf(it), cond = it.cond || SS.cond;
      return `<div class="line sc-row${it.off ? ' off' : ''}"><input type="checkbox" class="sc-pick" data-id="${esc(it.id)}" ${it.off ? '' : 'checked'} aria-label="${esc(F('Ajouter {0}', cardName(c)))}"><a class="thumb" href="#/carte/${encodeURIComponent(c.key)}">${cimg(c, { lang: it.lang })}</a><span class="mid"><b>${esc(cardName(c))}</b><span>${esc(setName(c.set))} · ${esc(numLabel(c))}</span>${inCol(c) ? `<span class="small sc-owned">${esc(inCol(c) > 1 ? F('Déjà {0} dans ta collection', inCol(c)) : tr('Déjà dans ta collection'))}</span>` : ''}
        <span class="sc-sels"><select class="sc-ilang" data-id="${esc(it.id)}" aria-label="${esc(tr('Langue'))}">${(c.langs.length ? c.langs : [it.lang]).map(l => `<option value="${l}" ${l === it.lang ? 'selected' : ''}>${esc(langName(l))}</option>`).join('')}</select><select class="sc-icond" data-id="${esc(it.id)}" aria-label="${esc(tr('État'))}">${CONDS.map(([ck, cn]) => `<option value="${ck}" ${ck === cond ? 'selected' : ''}>${esc(cn)}</option>`).join('')}</select></span>
        ${t >= 5 ? `<a class="sc-measure ${t >= 20 ? 'hot' : ''}" href="#/centrage?carte=${encodeURIComponent(c.key)}">${icon('ruler', 14)} ${esc(tr('Mesurer le centrage'))}</a>` : ''}</span>
        <span class="px"><b class="num">${fmt(v)}</b><button class="linkbtn small" data-sc="del" data-id="${esc(it.id)}">${esc(tr('Retirer'))}</button></span></div>`;
    };
    const groups = TIERS.map(([t, label, tip]) => {
      const g = xs.filter(it => tierOf(it) === t).sort((a, b) => (valOf(b) || 0) - (valOf(a) || 0)); if (!g.length) return '';
      const sum = g.reduce((s, it) => s + (valOf(it) || 0), 0);
      return `<div class="sect between sc-tier"><b>${esc(tr(label))}</b><span class="small">${esc(nCards(g.length))}${t >= 0 ? ' · ' + ownMoney(sum) : ''}</span></div>${tip ? `<div class="pad small sc-tip">${esc(tr(tip))}</div>` : ''}<div class="list">${g.map(row).join('')}</div>`;
    }).join('');
    return `<div class="sc">
      <div class="top"><button class="iconbtn" data-sc="back" data-back aria-label="${esc(tr('Reprendre le scan'))}">${icon('back')}</button><h1 class="title">${esc(tr('Fin de la session'))}</h1></div>
      <div class="pad"><div class="sc-total">${totalHtml()}</div></div>
      ${n ? `<div class="pad sc-actions">${n > 1 ? `<button class="linkbtn small" data-sc="pickall">${esc(tr(k === n ? 'Tout décocher' : 'Tout cocher'))}</button>` : ''}${guideLink()}</div>${groups}
      <div class="pad sc-actions"><button class="btn primary" data-sc="addall" ${k ? '' : 'disabled'}>${esc(k === n ? (n > 1 ? F('Ajouter les {0} cartes à ma collection', n) : tr('Ajouter la carte à ma collection')) : k > 1 ? F('Ajouter les {0} cartes cochées', k) : F('Ajouter la carte cochée'))}</button><button class="btn small" data-sc="back">${esc(tr('Reprendre le scan'))}</button><button class="linkbtn small" data-sc="clear">${esc(tr('Vider la session'))}</button></div>
      <p class="pad small sc-note">${esc(tr('Les cotes sont celles du guide de prix Cardmarket, ajustées selon l’état et la langue. Tu pourras modifier chaque carte dans ta collection.'))}</p>`
      : `<div class="pad"><div class="panel">${esc(tr('La session est vide.'))} <button class="linkbtn" data-sc="back">${esc(tr('Reprendre le scan'))}</button></div></div>`}
    </div>`;
  }

  function mount() {
    root = document.createElement('div');
    app.innerHTML = ''; app.appendChild(root);
    draw();
  }
  function draw() {
    if (!root || !app.contains(root)) return;
    root.innerHTML = V.view === 'fin' ? viewFin() : V.view === 'setup' ? viewSetup() : viewCam();
    if (V.view === 'cam') {
      const vid = root.querySelector('#sc-video');
      if (vid && V.stream) { vid.srcObject = V.stream; vid.play().catch(() => {}); }
      if (!V.stream && !V.err) startCam();
      drawAsk();
    }
  }
  // Mise à jour sans refaire la vidéo (sinon l'image se coupe à chaque carte)
  function drawCam() {
    if (!root || V.view !== 'cam') return;
    const box = root.querySelector('#sc-cambox');
    if (box && !!V.err !== !!box.querySelector('.sc-nocam')) { draw(); return; }
    const set = (id, h) => { const el = root.querySelector(id); if (el) el.innerHTML = h; };
    set('#sc-total', totalHtml()); set('#sc-strip', stripHtml()); drawHint(); drawAsk();
    const fin = root.querySelector('[data-sc="fin"]'); if (fin) fin.disabled = !live().length;
    const pop = root.querySelector('#sc-pop');
    if (pop && V.pop && Date.now() - V.popT < 1500) {
      pop.innerHTML = `<b class="num">${V.pop.v == null ? esc(tr('cote indisponible')) : '+' + ownMoney(V.pop.v)}</b><span>${esc(V.pop.name)}</span>`;
      pop.classList.remove('on'); void pop.offsetWidth; pop.classList.add('on');
      const t = root.querySelector('.sc-sum'); if (t) { t.classList.remove('bump'); void t.offsetWidth; t.classList.add('bump'); }
      V.pop = null;
    }
  }
  function drawHint() { const el = root && root.querySelector('#sc-hint'); if (el) el.innerHTML = hintHtml(); }
  function drawAsk() { const el = root && root.querySelector('#sc-ask'); if (el) { const h = askHtml(); el.innerHTML = h; el.classList.toggle('on', !!h); } }

  /* ---------- Actions ---------- */
  // Ajoute les cartes cochées ; celles qu'on a décochées restent dans la session (on peut la vider ensuite)
  function addAll() {
    const xs = live().filter(it => !it.off); if (!xs.length) return;
    const today = new Date().toISOString().slice(0, 10);
    for (const it of xs) collection.push({ id: newId(), key: it.key, lang: it.lang, cond: it.cond || SS.cond, rev: false, grader: '', grade: '', val: null, qty: 1, paid: null, cur: userCur(), date: today, note: '' });
    saveCol(); recordHistory();
    const n = xs.length, done = new Set(xs.map(it => it.id)); SS.items = SS.items.filter(it => !done.has(it.id)); saveS(); V.view = 'setup'; V.again = null; V.hint = '';
    stopCam(); location.hash = '#/collection';
    setTimeout(() => toast(n > 1 ? tr(n + ' cartes ajoutées à ta collection') : tr('Carte ajoutée à ta collection')), 50);
  }
  document.addEventListener('click', e => {
    const el = e.target.closest && e.target.closest('[data-sc]'); if (!el) return;
    const a = el.dataset.sc;
    if (a === 'guide') { e.preventDefault(); openGuide(); return; }
    if (a === 'gsel') { GSEL = el.dataset.v; const box = el.closest('.sc-guidebox'); if (box) { box.innerHTML = guideHtml(); const on = box.querySelector('.sc-gtab.on'); } return; }
    if (!isScan()) return;
    if (a === 'close') { stopCam(); V.view = 'setup'; history.length > 1 ? history.back() : (location.hash = '#/'); }
    else if (a === 'start') { V.view = 'cam'; draw(); }
    else if (a === 'setup') { stopCam(); V.ask = null; V.view = 'setup'; draw(); }
    else if (a === 'fin') { stopCam(); V.ask = null; V.view = 'fin'; draw(); window.scrollTo(0, 0); }
    else if (a === 'back') { V.view = 'cam'; draw(); }
    else if (a === 'again') { const c = V.again && BYKEY.get(V.again.key); if (c) add(c, V.again.lang, true); }
    else if (a === 'dupyes') { const c = V.ask && BYKEY.get(V.ask.key), l = V.ask && V.ask.lang; V.ask = null; if (c) add(c, l, true); else drawCam(); }
    else if (a === 'dupno') { V.ask = null; V.hint = 'Carte suivante !'; V.gone = 0; drawCam(); }
    else if (a === 'pickc') { const c = BYKEY.get(el.dataset.v), t = V.ask && V.ask.text; V.ask = null; if (c) add(c, langFor(c, { langs: [] }, t)); else drawCam(); }
    else if (a === 'pickno') { V.ask = null; V.hint = 'Carte suivante !'; drawCam(); }
    else if (a === 'setlang') answer('lang', el.dataset.v);
    else if (a === 'setcond') answer('cond', el.dataset.v);
    else if (a === 'skip') answer();
    else if (a === 'retry') { V.err = ''; draw(); }
    else if (a === 'del') { SS.items = SS.items.filter(it => it.id !== el.dataset.id); saveS(); draw(); }
    else if (a === 'clear') { SS.items = []; saveS(); V.view = 'setup'; draw(); }
    else if (a === 'addall') addAll();
    else if (a === 'pickall') { const xs = live(), on = xs.every(it => !it.off); xs.forEach(it => { it.off = on; }); saveS(); draw(); }
  });
  // Code du set et numéro tapés (« M2a 070 », « sv2a-25 », « base1 4/102 ») : la carte de ce set à ce numéro
  function byCode(q) {
    const t = String(q || '').trim().toLowerCase().replace(/\s*\/\s*\d+/g, '').replace(/[\s_-]+/g, ' ').trim();
    const parts = t.split(' ').filter(Boolean);
    const tries = [];
    if (parts.length >= 2) { tries.push([parts.slice(0, -1).join(''), parts[parts.length - 1]]); tries.push([parts.slice(1).join(''), parts[0]]); }
    const norm0 = n => n.replace(/^0+(?=\w)/, '');
    for (const [code, num] of tries) {
      const hits = CARDS.filter(c => !c.x && c.set.id.toLowerCase().replace(/[\s_-]+/g, '') === code && norm0(String(c.num).toLowerCase()) === norm0(num));
      if (hits.length) return hits[0];
    }
    return null;
  }
  document.addEventListener('submit', e => {
    const f = e.target.closest && e.target.closest('[data-sc-form="code"]'); if (!f || !isScan()) return;
    e.preventDefault();
    const q = (f.querySelector('#sc-code') || {}).value || '', c = byCode(q);
    if (!c) {
      if (V.ask) V.ask.err = 'Carte introuvable : vérifie le code (ex. M2a) et le numéro (ex. 070).';
      drawAsk(); const i = root && root.querySelector('#sc-code'); if (i) { i.value = q; i.focus(); } return;
    }
    const t = V.ask && V.ask.text; V.ask = null; add(c, langFor(c, { langs: [] }, t));
  });
  document.addEventListener('change', e => {
    if (!isScan()) return;
    const t = e.target, it = t.dataset && t.dataset.id && SS.items.find(x => x.id === t.dataset.id);
    if (t.id === 'sc-photos' && t.files && t.files.length) { const fs = [...t.files]; t.value = ''; fromPhotos(fs); }
    else if (t.id === 'sc-lang') { SS.lang = t.value; saveS(); }
    else if (t.id === 'sc-cond') { SS.cond = t.value; saveS(); }
    else if (t.id === 'sc-asklang') { SS.askLang = t.checked; saveS(); }
    else if (t.id === 'sc-askcond') { SS.askCond = t.checked; saveS(); }
    else if (it && t.classList.contains('sc-pick')) { it.off = !t.checked; saveS(); draw(); }
    else if (it && t.classList.contains('sc-ilang')) { it.lang = t.value; saveS(); draw(); }
    else if (it && t.classList.contains('sc-icond')) { it.cond = t.value; saveS(); draw(); }
  });
  // Téléphone en veille ou autre onglet : on coupe la caméra, et on la rallume au retour
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopCam();
    else if (isScan() && V.view === 'cam' && root && app.contains(root)) startCam();
  });

  /* ---------- Le bouton de scan : « Une carte » ou « Mon album » ---------- */
  // Sur ordinateur : fenêtre centrée, une photo déjà prise (ou glissée dans la fenêtre).
  // Sur téléphone : feuille en bas, « Prendre une photo » ou une photo déjà prise dans la galerie.
  const CHEV = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
  const pickInput = (id, multi) => { let i = document.getElementById(id); if (!i) { i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.id = id; i.hidden = true; if (multi) i.multiple = true; document.body.appendChild(i); } return i; };
  function openChoice() {
    const tel = matchMedia('(pointer: coarse)').matches;
    const d = document.createElement('dialog'); d.className = 'sheet sc-choice' + (tel ? '' : ' sc-choice-pc');
    const n = live().length;
    pickInput('sc-pick1', false); pickInput('sc-pick2', true);
    const albumTxt = n ? F('En continu : les cartes s’ajoutent une à une, avec le total. Session en cours : {0}.', nCards(n)) : tr('En continu : les cartes s’ajoutent une à une, avec le total.');
    d.innerHTML = `<div class="sheet-in"><div class="between"><b style="font-size:var(--t-l)">${esc(tr('Que veux-tu scanner ?'))}</b><button class="iconbtn" data-close aria-label="${esc(tr('Fermer'))}">${X}</button></div>
      <div class="sc-opt"><span class="sc-ic">${CAM}</span><span class="sc-txt"><b>${esc(tr('Une carte'))}</b><span class="small">${esc(tr('Sa cote tout de suite, puis sa fiche ou la mesure du centrage avec la même photo.'))}</span></span>
        <span class="sc-acts">${tel ? `<label class="btn small primary" for="scanfile" data-close>${esc(tr('Prendre une photo'))}</label><label class="btn small" for="sc-pick1" data-close>${esc(tr('Choisir une photo'))}</label>`
          : `<label class="btn small primary" for="sc-pick1" data-close>${esc(tr('Choisir une photo'))}</label><span class="small sc-drop">${esc(tr('ou glisse-la ici'))}</span>`}</span></div>
      <div class="sc-opt"><span class="sc-ic">${ALBUM}</span><span class="sc-txt"><b>${esc(tr('Mon album'))}</b><span class="small">${esc(albumTxt)}</span></span>
        <span class="sc-acts">${tel ? `<a class="btn small" href="#/scan" data-close>${esc(tr('Scanner en continu'))}</a>` : ''}<label class="btn small" for="sc-pick2" data-close>${esc(tr('Choisir des photos'))}</label>${tel ? '' : `<a class="btn small" href="#/scan" data-close>${esc(tr('Avec la caméra'))}</a>`}</span></div></div>`;
    d.addEventListener('click', e => { if (e.target === d || e.target.closest('[data-close]')) setTimeout(() => d.close(), 0); });
    d.addEventListener('close', () => d.remove());
    // Ordinateur : on peut lâcher une photo de carte directement dans la fenêtre
    d.addEventListener('dragover', e => { e.preventDefault(); d.classList.add('sc-over'); });
    d.addEventListener('dragleave', e => { if (e.target === d) d.classList.remove('sc-over'); });
    d.addEventListener('drop', e => {
      e.preventDefault(); d.classList.remove('sc-over');
      const fs = [...(e.dataTransfer && e.dataTransfer.files || [])].filter(f => /^image\//.test(f.type));
      if (!fs.length) return; d.close();
      if (fs.length === 1) runScan(fs[0]); else albumPhotos(fs);
    });
    d.tabIndex = -1; document.body.appendChild(d); d.showModal(); d.focus();
  }
  // Photos d'album déjà prises : on ouvre l'écran du scan puis on lit les photos une à une
  function albumPhotos(fs) {
    if (!isScan()) location.hash = '#/scan';
    const go = (k) => (root && app.contains(root)) ? fromPhotos(fs) : (k < 40 && setTimeout(() => go(k + 1), 50));
    go(0);
  }
  document.addEventListener('change', e => {
    const t = e.target; if (!t.files || !t.files.length) return;
    if (t.id === 'sc-pick1') { const f = t.files[0]; t.value = ''; runScan(f); }
    else if (t.id === 'sc-pick2') { const fs = [...t.files]; t.value = ''; albumPhotos(fs); }
  });
  // Les boutons appareil photo de l'accueil et de la recherche ouvrent d'abord ce choix
  document.addEventListener('click', e => {
    const l = e.target.closest && e.target.closest('label.iconbtn[for="scanfile"]');
    if (!l || !PKM || e.target.closest('dialog')) return;
    e.preventDefault(); openChoice();
  }, true);

  /* ---------- Branchement dans l'appli ---------- */
  const baseRender = render;
  render = function (keepFocus) {
    const r = route();
    if (DB && S.face && r === 'etats') { document.body.dataset.face = G() ? 'galerie' : 'marche'; document.title = tr('Comment estimer l’état d’une carte') + ' · CallIt!'; if (root) { stopCam(); root = null; } app.innerHTML = viewEtats(); return; }
    if (DB && S.face && isScan()) {
      document.body.dataset.face = G() ? 'galerie' : 'marche';
      document.title = tr('Scanner mon album') + ' · CallIt!';
      if (!PKM) { location.hash = '#/'; return; }
      if (root && app.contains(root)) { if (V.view === 'cam') drawCam(); else draw(); return; }
      if (V.view === 'cam') V.view = 'setup'; // en revenant sur l'écran : d'abord les réglages (la liste « fin » reste ouverte)
      mount();
      return;
    }
    if (root) { stopCam(); root = null; }
    baseRender(keepFocus);
  };
  if (DB && S.face && (isScan() || route() === 'etats')) render();
})();
