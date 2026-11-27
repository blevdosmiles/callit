/* CallIt! · Mes enchères : préparer un « Call it jusqu'à X » sur une enchère eBay.
   Étape 1 (disponible) : l'utilisateur colle le lien d'une enchère, note sa fin et VALIDE lui-même un montant maximum.
   CallIt! le prévient avant la fin (notification tant que CallIt! est ouvert, ou rappel dans son agenda) et ouvre l'annonce.
   Étape 2 (préparée) : placer l'enchère de dernière seconde via l'API officielle d'eBay (Buy Offer, accès sur dossier).
   Règles : jamais d'enchère sans validation de l'utilisateur, une validation PAR annonce, montant validé figé ;
   rien ne se connecte au compte eBay de l'utilisateur, aucun mot de passe. Tout reste sur l'appareil.
   Fichier séparé de app.js : il réutilise ses fonctions (load, save, esc, money, userCur, backBtn, toast, F…) et s'ajoute au routeur. */
(function () {
  'use strict';
  if (typeof render !== 'function') return;

  /* ---------- Liens partenaires eBay (eBay Partner Network) ----------
     Si CAMPID est vide, les liens restent des liens eBay normaux, sans commission, et ne sont pas marqués.
     Une fois le numéro de campagne EPN obtenu (public, il apparaît dans chaque lien), on le met ici :
     les liens d'annonces deviennent des liens partenaires, toujours signalés « lien partenaire ». */
  const CAMPID = '5339262505'; // campagne EPN « CallIt app », créée le 26/11/2026
  const ROTATION = { com: '711-53200-19255-0', 'co.uk': '710-53481-19255-0', de: '707-53477-19255-0', fr: '709-53476-19255-0', it: '724-53478-19255-0',
    es: '1185-53479-19255-0', at: '5221-53469-19255-0', ch: '5222-53480-19255-0', nl: '1346-53482-19255-0', be: '1553-53471-19255-0',
    ie: '5282-53468-19255-0', pl: '4908-226936-19255-0', ca: '706-53473-19255-0', 'com.au': '705-53470-19255-0' };
  const ebayDomOf = u => { const m = /^https?:\/\/(?:[a-z0-9-]+\.)*ebay\.([a-z.]+?)(?:\/|$)/i.exec(u || ''); return m ? m[1].toLowerCase() : null; };
  function partnerLink(url) {
    const dom = ebayDomOf(url);
    if (!CAMPID || !dom || !ROTATION[dom]) return { url, partner: false };
    try {
      const u = new URL(url);
      Object.entries({ mkcid: '1', mkrid: ROTATION[dom], campid: CAMPID, toolid: '10001', mkevt: '1' }).forEach(([k, v]) => u.searchParams.set(k, v));
      return { url: u.toString(), partner: true };
    } catch (e) { return { url, partner: false }; }
  }
  window.callitPartnerLink = partnerLink;

  /* ---------- Données (sur l'appareil) ---------- */
  const REMINDS = [[60, '1 h avant'], [10, '10 min avant'], [2, '2 min avant']];
  let items = load('encheres', []); // [{id, url, title, end, max, cur, okAt, remind:[min], done:{min:true}}]
  const saveItems = () => save('encheres', items);
  const st = { form: !items.length, err: '', edit: null };
  const route = () => location.hash.replace(/^#\/?/, '').split(/[/?]/)[0];
  const isHere = () => DB && S.face && route() === 'encheres';
  const itemId = u => { const m = /\/itm\/(?:[^/?#]*\/)?(\d{9,15})/.exec(u || ''); return m ? m[1] : null; };
  /* Lien reçu par « Partager » (appli eBay, navigateur) : #/encheres?lien=…&titre=…
     Le texte partagé ressemble à « Regarde cet objet sur eBay : Titre https://ebay.us/m/… » : on garde le lien eBay et le titre. */
  const SHORT = /^https?:\/\/(?:www\.)?ebay\.(?:us|to)\//i;
  function fromShare(text, subject) {
    const urls = String(text || '').match(/https?:\/\/[^\s<>"']+/gi) || [];
    let url = urls.find(u => ebayDomOf(u) && !SHORT.test(u)) || urls.find(u => SHORT.test(u)) || '';
    url = url.replace(/[).,;!]+$/, '');
    const id = itemId(url), dom = ebayDomOf(url);
    if (id && dom && !SHORT.test(url)) url = 'https://www.ebay.' + dom + '/itm/' + id; // lien propre, sans les marqueurs de partage d'eBay
    const clean = t => String(t || '').replace(/https?:\/\/\S+/gi, ' ').replace(/\s+/g, ' ').trim()
      .replace(/^[^:]{0,60}\bebay\b[^:]{0,40}:\s*/i, '').replace(/\s*[|·-]\s*eBay\s*$/i, '').replace(/^["«“]+|["»”]+$/g, '').trim();
    let title = clean(subject);
    if (!title || /^ebay$/i.test(title)) title = clean(text);
    return { url, title: title.slice(0, 120) };
  }
  // « 2 j 4 h 15 min », « 2d 4h », « 45 min », « 1g 3o » : durée restante affichée par eBay → date de fin
  function parseLeft(s) {
    s = String(s || '').toLowerCase().replace(',', '.');
    let ms = 0, ok = false; const re = /(\d+(?:\.\d+)?)\s*(j|d|g|t|h|o|std|st|m|min|mn|s|sec)?(?![a-z])/g; let m;
    while ((m = re.exec(s))) {
      const v = parseFloat(m[1]), u = m[2] || (ok ? 'm' : 'h');
      ms += v * ({ j: 864e5, d: 864e5, g: 864e5, t: 864e5, h: 36e5, o: 36e5, std: 36e5, st: 36e5, s: 1e3, sec: 1e3 }[u] || 6e4); ok = true;
    }
    return ok && ms > 0 ? Date.now() + ms : null;
  }
  function takeShare() {
    const h = location.hash, i = h.indexOf('?'); if (i < 0) return;
    const q = new URLSearchParams(h.slice(i + 1)); if (!q.has('lien') && !q.has('texte')) return;
    history.replaceState(null, '', location.pathname + location.search + '#/encheres');
    const got = fromShare([q.get('lien'), q.get('texte')].filter(Boolean).join(' '), q.get('titre'));
    st.err = ''; st.edit = null;
    if (!got.url) { st.form = true; st.draft = null; st.err = F('Le lien partagé n’est pas une annonce eBay.'); return; }
    const id = itemId(got.url), old = id && items.find(x => itemId(x.url) === id);
    if (old) { st.form = false; st.draft = null; st.edit = old.id; toast(F('Cette enchère est déjà dans ta liste')); return; }
    st.form = true; st.shared = true; st.cardRef = null;
    st.draft = { url: got.url, title: got.title, end: null, max: null, remind: [10, 2] };
  }
  window.CallItEnchereLien = (lien, titre) => { location.hash = '#/encheres?lien=' + encodeURIComponent(lien || '') + (titre ? '&titre=' + encodeURIComponent(titre) : ''); };
  const parseNum = s => { const v = parseFloat(String(s).replace(/\s/g, '').replace(',', '.')); return isNaN(v) ? null : v; };
  const pad2 = n => String(n).padStart(2, '0');
  const localInput = t => { const d = new Date(t); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
  function left(ms) {
    if (ms <= 0) return F('Terminée');
    const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
    if (d) return F('{0} j {1} h', d, h);
    if (h) return F('{0} h {1} min', h, pad2(m));
    return F('{0} min {1} s', m, pad2(sec));
  }
  const fmtEnd = t => { try { return new Date(t).toLocaleString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { return new Date(t).toLocaleString(); } };

  /* ---------- Rappels ---------- */
  const canNotify = () => 'Notification' in window;
  async function notify(title, body) {
    toast(title);
    if (!canNotify() || Notification.permission !== 'granted') return;
    try {
      const reg = 'serviceWorker' in navigator && await navigator.serviceWorker.getRegistration();
      if (reg) { await reg.showNotification(title, { body, icon: 'icons/icon-192.png', tag: 'callit-' + title }); return; }
    } catch (e) {}
    try { new Notification(title, { body, icon: 'icons/icon-192.png' }); } catch (e) {}
  }
  function tick() {
    const now = Date.now(); let changed = false;
    for (const it of items) {
      if (!it.end || it.end < now - 6e4) continue;
      for (const min of it.remind || []) {
        if (it.done && it.done[min]) continue;
        const at = it.end - min * 6e4;
        if (now >= at && now < it.end) {
          it.done = Object.assign({}, it.done, { [min]: true }); changed = true;
          notify(F('Enchère : fin dans {0} min', Math.max(1, Math.round((it.end - now) / 6e4))),
            F('{0} · ton maximum validé : {1}', it.title, it.max != null ? money(it.max, it.cur) : F('aucun')));
        }
      }
    }
    if (changed) saveItems();
    if (isHere()) { const box = document.querySelectorAll('[data-en-left]'); box.forEach(el => { const it = items.find(x => x.id === el.dataset.enLeft); if (it) el.textContent = left(it.end - now); }); }
  }
  setInterval(tick, 1000);

  // Rappel dans l'agenda (fonctionne même CallIt! fermé) : un fichier .ics avec une alarme par rappel choisi
  function icsFor(it) {
    const z = t => new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const txt = s => String(s || '').replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
    const desc = (it.max != null ? F('Maximum validé : {0}', money(it.max, it.cur)) + '\\n' : '') + txt(it.url);
    return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CallIt!//Encheres//FR', 'BEGIN:VEVENT', 'UID:' + it.id + '@callitcards.com', 'DTSTAMP:' + z(Date.now()),
      'DTSTART:' + z(it.end - 5 * 6e4), 'DTEND:' + z(it.end), 'SUMMARY:' + txt(F('Fin d’enchère : {0}', it.title)), 'DESCRIPTION:' + desc, 'URL:' + txt(it.url),
      ...(it.remind || []).flatMap(m => ['BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + txt(F('Enchère : fin dans {0} min', m)), 'TRIGGER;RELATED=END:-PT' + m + 'M', 'END:VALARM']),
      'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  }
  function downloadIcs(it) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([icsFor(it)], { type: 'text/calendar' }));
    a.download = 'enchere-' + (itemId(it.url) || it.id) + '.ics';
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  /* ---------- La carte de l'annonce : cote CallIt!, maximum conseillé, lien Cardmarket ----------
     Retrouvée à partir du titre (même recherche que le Mode Live), sur l'appareil. On ne lit rien sur eBay. */
  const API = () => window.CallItLiveAPI;
  let byKey = null;
  const cardOf = k => { if (!k || typeof CARDS === 'undefined') return null; if (!byKey || byKey.n !== CARDS.length) { byKey = new Map(CARDS.map(c => [c.key, c])); byKey.n = CARDS.length; } return byKey.get(k) || null; };
  const LANG_RE = [['ja', /\b(japanese|japonaise?|japan|jap|jpn|jp|giapponese|japanisch|japones[a]?)\b/], ['ko', /\b(korean|coreenne?|coreana?|koreanisch|kor)\b/],
    ['fr', /\b(francaise?|french|vf|francese|franzosisch|frances[a]?)\b/], ['it', /\b(italiano|italiana|italienne?|italian|italienisch|ita)\b/],
    ['de', /\b(deutsch|allemande?|german|tedesco|tedesca|aleman[a]?|ger)\b/], ['es', /\b(espanol|espanola|espagnole?|spanish|spagnolo|spanisch|esp)\b/],
    ['pt', /\b(portugues|portuguese|portugaise?|portoghese)\b/], ['en', /\b(english|anglaise?|inglese|englisch|ingles[a]?|eng)\b/]];
  const COND_RE = [['NM', /near ?mint|\bnm\b/], ['MT', /\bmint\b|\bmt\b/], ['LP', /light(ly)? played|\blp\b/], ['PL', /\bplayed\b|\bpl\b/], ['GD', /\bgood\b|\bgd\b/], ['PO', /\bpoor\b/]];
  const GRADED_RE = /\b(psa|bgs|cgc|beckett|pca|sgc|ace)\s*(gem\s*(mint|mt)\s*)?\d/;
  const pctMax = () => { const v = +(load('live', {}).maxPct); return Math.min(200, Math.max(5, v || 70)); };
  function matchCard(ref, title) {
    if (ref.card !== undefined) return;
    const t = norm(title || ''); ref.card = ''; ref.alts = [];
    if (!t || !API() || !API().liveMatch) return;
    const m = API().liveMatch(title);
    ref.alts = m.results.slice(0, 6).map(c => c.key); ref.card = ref.alts[0] || '';
    const c = cardOf(ref.card);
    ref.cl = (LANG_RE.find(([, re]) => re.test(t)) || [])[0] || (c && c.set.reg === 'ja' ? 'ja' : '');
    ref.cc = (COND_RE.find(([, re]) => re.test(t)) || [])[0] || 'NM';
    ref.gr = GRADED_RE.test(t);
  }
  function cardBlock(ref, id, inForm) {
    const c = cardOf(ref.card);
    const alts = (ref.alts || []).map(cardOf).filter(Boolean);
    const pickSel = alts.length > 1 || (!c && alts.length) ? `<label class="small en-pick">${F('Autre carte ?')} <select data-en-sel="card" data-v="${esc(id)}"><option value="">${F('Aucune de ces cartes')}</option>${alts.map(a => `<option value="${esc(a.key)}" ${a === c ? 'selected' : ''}>${esc(cardName(a))} · ${esc(setName(a.set))} · ${esc(numLabel(a))}</option>`).join('')}</select></label>` : '';
    if (!c) return `<div class="en-card" data-en-card="${esc(id)}"><span class="small">${alts.length ? F('Carte non choisie.') : F('Carte pas reconnue dans le titre : ajoute son nom et son numéro (ex. Dracaufeu 4/102) pour voir sa cote.')}</span>${pickSel}</div>`;
    const API_ = API(), est = API_ && API_.estimer ? API_.estimer(c, { cond: ref.cc || 'NM', lang: ref.cl || null }) : null;
    const cote = est && est.mid ? est.mid : null;
    const langOpts = ['', ...LANGS.map(l => l[0]).filter(l => !c.langs || c.langs.includes(l) || l === ref.cl)];
    const lg = ref.cl && CM_LANG[ref.cl] ? ref.cl : null;
    const cm = c.cm && typeof cmProductUrl === 'function' ? cmProductUrl(c, lg ? [lg] : [], ref.cc || 'NM') : null;
    const sugg = cote && !ref.gr ? toUser(cote) * pctMax() / 100 : null;
    const suggV = sugg == null ? null : sugg >= 10 ? Math.round(sugg) : Math.round(sugg * 10) / 10;
    return `<div class="en-card" data-en-card="${esc(id)}">
      <a class="en-thumb" href="#/carte/${encodeURIComponent(c.key)}" aria-label="${esc(cardName(c))}">${cimg(c, { lang: ref.cl || undefined })}</a>
      <div class="stack" style="gap:6px;min-width:0">
        <div><b>${esc(cardName(c))}</b> <span class="small">${esc(setName(c.set))} · ${esc(numLabel(c))}</span></div>
        <div class="row en-sels"><select data-en-sel="cl" data-v="${esc(id)}" aria-label="${F('Langue')}">${langOpts.map(l => `<option value="${l}" ${l === (ref.cl || '') ? 'selected' : ''}>${l ? esc(tr((LANG[l] || { name: l }).name)) : F('Toutes langues')}</option>`).join('')}</select>
          <select data-en-sel="cc" data-v="${esc(id)}" aria-label="${F('État')}">${CONDS.map(([k, n]) => `<option value="${k}" ${k === (ref.cc || 'NM') ? 'selected' : ''}>${k} · ${esc(n)}</option>`).join('')}</select></div>
        <div>${F('Cote CallIt!')} <b class="num">${cote ? eurC(cote) : '—'}</b>${est && est.kind === 'estim' ? ` <span class="small">${F('estimation')}</span>` : ''}</div>
        ${ref.gr ? `<div class="small">${F('Carte gradée : la cote est celle de la carte non gradée, une carte gradée se vend souvent plus cher.')}</div>` : ''}
        ${inForm && suggV ? `<div class="row" style="gap:8px;flex-wrap:wrap;align-items:center"><span>${F('Maximum conseillé ({0} % de la cote)', pctMax())} <b class="num">${money(suggV, userCur(), suggV >= 10 ? 0 : 2)}</b></span><button class="btn small" type="button" data-en="usemax" data-v="${suggV}">${F('Utiliser')}</button></div>` : ''}
        ${cm ? `<div class="stack" style="gap:4px;align-items:flex-start"><a class="btn small" href="${esc(cm)}" target="_blank" rel="noopener">${F('Comparer sur Cardmarket')}</a><span class="small">${esc([lg ? LANG[lg].short : tr('Toutes langues'), F('{0} ou mieux', ref.cc || 'NM')].join(' · '))} · ${F('lien externe, sans commission')}</span></div>` : ''}
        ${pickSel}
      </div></div>`;
  }
  // Référence de la carte : l'enchère enregistrée, ou celle du formulaire ouvert
  const refOf = id => id === 'form' ? st.cardRef : items.find(x => x.id === id);
  function redrawCard(id) {
    const ref = refOf(id), el = ref && app.querySelector(`[data-en-card="${CSS.escape(id)}"]`);
    if (el) el.outerHTML = cardBlock(ref, id, id === 'form');
  }

  /* ---------- Vue ---------- */
  const GAVEL = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4l6 6M11 7l6 6M12.5 5.5l-5 5 6 6 5-5M10.5 13.5L4 20"/><path d="M13 21h8"/></svg>';
  function formHtml(it) {
    const x = st.draft || it || { url: '', title: '', end: null, max: null, remind: [10, 2] };
    return `<form class="panel stack" style="gap:12px" data-en-form="1" autocomplete="off">
      <b style="font-size:16px">${it ? F('Modifier l’enchère') : F('Ajouter une enchère')}</b>
      <label class="field">${F('Lien de l’annonce eBay')}<input name="url" type="url" inputmode="url" required placeholder="https://www.ebay.fr/itm/…" value="${esc(x.url)}"></label>
      <label class="field">${F('Nom (pour toi)')}<input name="title" placeholder="${F('ex. Dracaufeu 4/102 PSA 9')}" value="${esc(x.title)}"></label>
      ${(() => { if (!st.cardRef) { const src = it || x; st.cardRef = { card: src.card, alts: src.alts, cl: src.cl, cc: src.cc, gr: src.gr }; } matchCard(st.cardRef, x.title); return cardBlock(st.cardRef, 'form', true); })()}
      ${st.shared && !it ? `<div class="note">${F('Lien reçu depuis eBay. eBay ne partage pas l’heure de fin : recopie le temps restant affiché sur l’annonce.')}</div>` : ''}
      <label class="field">${F('Se termine dans (comme sur eBay)')}<input name="left" inputmode="text" placeholder="${F('ex. 2 j 4 h 15 min')}" value=""></label>
      <label class="field">${F('ou fin de l’enchère (heure de ton appareil)')}<input name="end" type="datetime-local" value="${x.end ? localInput(x.end) : ''}"></label>
      <label class="field">${F('Call it jusqu’à ({0}, frais de port compris)', userCur())}<input name="max" inputmode="decimal" placeholder="${F('ton prix maximum')}" value="${x.max != null ? esc(String(x.max).replace('.', ',')) : ''}"></label>
      <label class="row small" style="gap:8px;align-items:flex-start"><input type="checkbox" name="ok" style="margin-top:2px"><span>${F('Je valide ce montant maximum pour cette annonce. CallIt! ne dépassera jamais ce montant et ne fera rien sans mon accord.')}</span></label>
      <div class="stack" style="gap:6px"><span class="small" style="font-weight:600">${F('Me prévenir')}</span><div class="chips">${REMINDS.map(([m, l]) => `<label class="chip"><input type="checkbox" name="r${m}" ${x.remind.includes(m) ? 'checked' : ''} style="margin-right:6px">${F(l)}</label>`).join('')}</div></div>
      ${st.err ? `<div class="note" role="alert">${esc(st.err)}</div>` : ''}
      <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn primary" type="submit">${it ? F('Enregistrer') : F('Ajouter')}</button>${items.length ? `<button class="btn" type="button" data-en="cancel">${F('Annuler')}</button>` : ''}</div>
    </form>`;
  }
  function itemHtml(it, now) {
    const ms = it.end - now, over = ms <= 0, soon = !over && ms < 15 * 6e4;
    const link = partnerLink(it.url);
    return `<div class="panel stack en-item${soon ? ' soon' : ''}${over ? ' over' : ''}" style="gap:8px">
      <div class="between" style="gap:10px;align-items:flex-start"><b style="font-size:15px;min-width:0;overflow-wrap:anywhere">${esc(it.title)}</b><b class="num en-left" data-en-left="${esc(it.id)}">${left(ms)}</b></div>
      <div class="small">${F('Fin : {0}', esc(fmtEnd(it.end)))}${ebayDomOf(it.url) ? ' · eBay.' + esc(ebayDomOf(it.url)) : ''}</div>
      ${(matchCard(it, it.title), it.card ? cardBlock(it, it.id, false) : '')}
      <div class="en-max">${it.max != null ? `${F('Call it jusqu’à')} <b class="num">${money(it.max, it.cur)}</b> <span class="small">${F('validé le {0}', esc(new Date(it.okAt).toLocaleDateString(LOCALE)))}</span>` : `<span class="small">${F('Pas encore de montant validé.')}</span>`}</div>
      <div class="small">${(it.remind || []).length ? F('Rappels : {0}', (it.remind || []).map(m => REMINDS.find(r => r[0] === m)).filter(Boolean).map(r => F(r[1])).join(', ')) : F('Aucun rappel')}</div>
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <a class="btn small primary" href="${esc(link.url)}" target="_blank" rel="noopener" data-en="open" data-v="${esc(it.id)}">${F('Ouvrir l’annonce')}</a>
        ${!over ? `<button class="btn small" type="button" data-en="ics" data-v="${esc(it.id)}">${F('Ajouter à mon agenda')}</button>` : ''}
        <button class="linkbtn small" type="button" data-en="edit" data-v="${esc(it.id)}">${F('Modifier')}</button>
        <button class="linkbtn small" type="button" data-en="del" data-v="${esc(it.id)}">${F('Retirer')}</button></div>
      <div class="small">${link.partner ? F('Lien partenaire : CallIt! touche une petite commission d’eBay si tu achètes, sans frais pour toi.') : F('Lien eBay direct, sans commission.')}${it.max != null ? ' ' + F('Le montant est copié pour que tu le colles dans « Enchérir ».') : ''}</div>
    </div>`;
  }
  function view() {
    const now = Date.now();
    const list = items.slice().sort((a, b) => (a.end < now) - (b.end < now) || (a.end < now ? b.end - a.end : a.end - b.end));
    const perm = canNotify() ? Notification.permission : 'absent';
    const editing = st.edit && items.find(x => x.id === st.edit);
    return `<div class="top">${backBtn()}<span class="sub" style="font-weight:600">${F('Mes enchères')}</span><span style="width:44px"></span></div>
    <div class="pad stack" style="gap:14px">
      <div class="small">${F('Colle le lien d’une enchère eBay et valide ton prix maximum : CallIt! te prévient avant la fin et ouvre l’annonce. C’est toi qui enchéris, CallIt! ne se connecte jamais à ton compte eBay.')}</div>
      ${perm === 'default' ? `<div class="panel row" style="gap:10px;align-items:center;justify-content:space-between"><span class="small">${F('Autorise les notifications pour être prévenu quand CallIt! est ouvert.')}</span><button class="btn small" type="button" data-en="perm">${F('Activer')}</button></div>` : ''}
      ${perm === 'denied' ? `<div class="small">${F('Notifications bloquées dans ce navigateur : utilise « Ajouter à mon agenda ».')}</div>` : ''}
      ${st.form || editing ? formHtml(editing) : `<button class="btn" type="button" data-en="new" style="align-self:flex-start">${GAVEL} ${F('Ajouter une enchère')}</button>`}
      ${list.map(it => itemHtml(it, now)).join('')}
      ${items.length ? `<div class="small">${F('Les notifications marchent tant que CallIt! est ouvert (onglet ou appli). Pour être prévenu à coup sûr, ajoute l’enchère à ton agenda.')}</div>` : ''}
      <div class="panel stack" style="gap:6px"><b style="font-size:15px">${F('Enchère de dernière seconde')} <span class="small">· ${F('bientôt')}</span></b>
        <div class="small">${F('Bientôt, CallIt! pourra placer lui-même ton enchère quelques secondes avant la fin, grâce à l’accès officiel d’eBay (demande en cours). Ce sera toujours le montant que tu as validé pour cette annonce, jamais plus, et jamais sans ta validation.')}</div></div>
    </div>`;
  }
  const draw = () => { if (isHere()) render(); };

  /* ---------- Actions ---------- */
  function submit(form) {
    const fd = new FormData(form), url = String(fd.get('url') || '').trim(), endS = String(fd.get('end') || ''), maxS = String(fd.get('max') || '').trim();
    const leftS = String(fd.get('left') || '').trim(), byLeft = leftS ? parseLeft(leftS) : null;
    const end = byLeft || (endS ? new Date(endS).getTime() : NaN), max = maxS ? parseNum(maxS) : null;
    st.err = '';
    if (!ebayDomOf(url)) st.err = F('Colle le lien d’une annonce eBay (il commence par https://www.ebay.).');
    else if (leftS && !byLeft) st.err = F('Écris le temps restant comme sur eBay, par exemple 2 j 4 h 15 min.');
    else if (isNaN(end)) st.err = F('Indique le temps restant ou l’heure de fin de l’enchère.');
    else if (maxS && (max == null || max <= 0)) st.err = F('Le montant maximum doit être un nombre, par exemple 42,50.');
    else if (max != null && !fd.get('ok')) st.err = F('Coche la case pour valider ton montant maximum.');
    if (st.err) { st.draft = { url, title: String(fd.get('title') || ''), end: isNaN(end) ? null : end, max: max != null ? max : (maxS || null), remind: REMINDS.map(r => r[0]).filter(m => fd.get('r' + m)) }; draw(); return; }
    st.draft = null;
    const old = st.edit && items.find(x => x.id === st.edit);
    const remind = REMINDS.map(r => r[0]).filter(m => fd.get('r' + m));
    const title = String(fd.get('title') || '').trim() || (itemId(url) ? F('Annonce eBay {0}', itemId(url)) : F('Annonce eBay'));
    const cr = st.cardRef || {};
    const it = { id: old ? old.id : Date.now().toString(36), url, title, end, max, cur: userCur(), okAt: max != null ? Date.now() : null, remind, done: {},
      card: cr.card, alts: cr.alts, cl: cr.cl, cc: cr.cc, gr: cr.gr };
    if (old && old.end === end) Object.keys(old.done || {}).forEach(m => { if (remind.includes(+m)) it.done[m] = true; });
    items = old ? items.map(x => (x.id === old.id ? it : x)) : [it, ...items];
    saveItems(); st.form = false; st.edit = null; st.shared = false; st.cardRef = null;
    toast(old ? F('Enchère enregistrée') : F('Enchère ajoutée'));
    draw();
  }
  document.addEventListener('click', ev => {
    const b = ev.target.closest && ev.target.closest('[data-en]'); if (!b || !isHere()) return;
    const a = b.dataset.en, it = items.find(x => x.id === b.dataset.v);
    if (a === 'new') { st.cardRef = null; st.shared = false; st.draft = null; st.form = true; st.edit = null; st.err = ''; draw(); }
    else if (a === 'cancel') { st.cardRef = null; st.shared = false; st.draft = null; st.form = false; st.edit = null; st.err = ''; draw(); }
    else if (a === 'usemax') { const f = app.querySelector('[data-en-form] input[name="max"]'); if (f) { f.value = String(b.dataset.v).replace('.', ','); f.focus(); } }
    else if (a === 'edit' && it) { st.cardRef = null; st.draft = null; st.edit = it.id; st.form = false; st.err = ''; draw(); window.scrollTo(0, 0); }
    else if (a === 'del' && it) { items = items.filter(x => x !== it); saveItems(); toast(F('Enchère retirée')); draw(); }
    else if (a === 'ics' && it) downloadIcs(it);
    else if (a === 'open' && it && it.max != null && navigator.clipboard) navigator.clipboard.writeText(String(it.max).replace('.', ',')).catch(() => {});
    else if (a === 'perm' && canNotify()) Notification.requestPermission().then(draw);
  });
  // Langue, état ou autre carte choisis ; titre modifié dans le formulaire : on recherche la carte à nouveau
  document.addEventListener('change', ev => {
    const el = ev.target; if (!isHere() || !el) return;
    if (el.dataset && el.dataset.enSel) {
      const id = el.dataset.v, ref = refOf(id); if (!ref) return;
      ref[el.dataset.enSel] = el.value;
      if (el.dataset.enSel === 'card') { const c = cardOf(el.value); if (c && !ref.cl && c.set.reg === 'ja') ref.cl = 'ja'; }
      if (id !== 'form') saveItems();
      redrawCard(id);
    } else if (el.name === 'title' && el.form && el.form.dataset.enForm && st.cardRef) {
      st.cardRef = { card: undefined }; matchCard(st.cardRef, el.value); redrawCard('form');
    }
  });
  document.addEventListener('submit', ev => { if (ev.target.dataset && ev.target.dataset.enForm && isHere()) { ev.preventDefault(); submit(ev.target); } });

  /* ---------- Branchement dans l'appli ---------- */
  const baseRender = render;
  render = function (keepFocus) {
    if (isHere()) {
      const shared = /[?&](lien|texte)=/.test(location.hash); if (shared) takeShare();
      document.body.dataset.face = G() ? 'galerie' : 'marche';
      app.innerHTML = view(); document.title = tr('Mes enchères') + ' · CallIt!';
      if (shared) { window.scrollTo(0, 0); const f = app.querySelector('[data-en-form] input[name="left"]'); if (f && st.draft) f.focus(); }
      return;
    }
    baseRender(keepFocus);
  };
  if (isHere()) render();
})();
