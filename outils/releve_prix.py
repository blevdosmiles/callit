"""Relevé quotidien des prix.

Chaque jour, GitHub télécharge le guide de prix public de Cardmarket (fichier mis à disposition
par Cardmarket pour le téléchargement) et lance ce script, qui :

  1. vérifie le guide : complet, daté, cohérent avec le relevé précédent ;
  2. écrit les prix du jour lus par l'appli :
       data/prix.json       les cartes de data/cards.json
       data/prix_plus.json  les cartes de data/cm_extra.json et les produits scellés de data/sealed.json
  3. ajoute la cote CallIt! du jour à l'historique des cartes et des scellés (historique/NN.json) ;
  4. prépare l'archive complète du jour (tous les produits du guide, toutes les mesures). Elle est rangée
     hors du site, dans les « releases » GitHub du dépôt (prix-AAAA-MM), par .github/workflows/prix.yml.

Si une vérification échoue, rien n'est écrit et le script s'arrête en erreur : la tâche GitHub passe au rouge.
Le script indique aussi à la tâche (GITHUB_OUTPUT) le jour relevé, s'il y a du nouveau, et le retard du guide en jours.

Prix du jour : {"jour": "AAAA-MM-JJ", "guide": date du guide, "produits": lignes du guide,
                "champs": [...], "ids": [numéros Cardmarket triés], "v": {champ: [centimes ou null, ...]}}
  Les colonnes de "v" sont alignées sur "ids". 0 = Cardmarket n'a pas de valeur, null = champ absent.

Historique : historique/NN.json, où NN = numéro Cardmarket modulo 100 (la fiche d'une carte ne télécharge
qu'un petit fichier). {"start": "AAAA-MM-JJ", "p": {"<id>": [centimes du jour 0, du jour 1, ...]}}
Une case vaut null quand il n'y avait pas de cote ce jour-là (ou pas de relevé).

Cote CallIt! (cote_mesures) : la plus basse des moyennes de vente sur 7 et 30 jours, jamais sous l'offre la moins
chère. Mesurée le 25/11/2026 sur 4 369 cartes vendues entre le 23 et le 25/11 : elle tombe plus près de la vente
suivante que la « tendance » de Cardmarket ou que la moyenne 30 jours, parce qu'une vente isolée très chère ne la
fait pas monter. La même règle est écrite dans app.js (entre les marques <cote> et </cote>) ; outils/test_cote.py
vérifie que les deux donnent les mêmes résultats, et mesure la règle entre deux archives.

Usage : python3 outils/releve_prix.py guide.json [--essai] [--forcer] [--archive DOSSIER] [--maintenant DATE]
        python3 outils/releve_prix.py --refaire DOSSIER [--essai] [--forcer]
  --essai       vérifie et affiche le bilan, sans rien écrire
  --forcer      écrit même si une vérification de cohérence échoue (après contrôle par une personne)
  --archive     dossier où déposer releve-AAAA-MM-JJ.json.gz
  --maintenant  « maintenant » imposé, par exemple 2026-11-26T08:00:00+0000 (essais, reprise d'anciens guides)
  --refaire     refait tout l'historique à partir des archives releve-*.json.gz du dossier (après un changement
                de règle, ou si l'historique est abîmé)
"""
import argparse, datetime, glob, gzip, io, json, os, statistics, sys

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Champ lu par l'appli → nom dans le guide Cardmarket. Les six premiers suivent l'ordre de priceFields dans
# data/cards.json ; les suivants sont les mesures des versions holo ou reverse (certaines cartes n'ont qu'elles).
CHAMPS = [('low', 'low'), ('trend', 'trend'), ('avg30', 'avg30'), ('trendHolo', 'trend-holo'), ('avg1', 'avg1'), ('avg7', 'avg7'),
          ('lowHolo', 'low-holo'), ('avg1Holo', 'avg1-holo'), ('avg7Holo', 'avg7-holo'), ('avg30Holo', 'avg30-holo')]
MIN_LIGNES = 10000        # un guide plus court est forcément tronqué
MIN_COUVERTURE = 0.95     # part des produits cotés hier qui doivent l'être encore aujourd'hui
MAX_GRANDS_ECARTS = 0.03  # part maximale des cartes à 1 € et plus dont la cote a doublé ou été divisée par deux
MEDIANE = (0.95, 1.05)    # la variation médiane d'un jour à l'autre reste autour de 1
JOURS_RETARD = 2          # à partir de là, la tâche GitHub signale que le guide n'est plus publié (voir prix.yml)
# Moyennes des ventes (1, 7 et 30 jours) : la cote repose sur elles. Un guide neuf peut ne renouveler que les offres :
# celui du 26/11/2026 (créé à 9 h 08, au lieu de 2 h 45 les jours précédents) avait les mêmes moyennes de vente que
# celui du 25/11, pour les 64 656 produits qui en ont (du 23 au 25/11, elles avaient changé pour un tiers des cartes).
# Quand moins de 1 % des cartes voient l'une d'elles changer, les ventes sont tenues pour figées ; à partir de
# JOURS_RETARD jours sans changement, la tâche GitHub le signale.
VENTES = ('avg1', 'avg7', 'avg30', 'avg1Holo', 'avg7Holo', 'avg30Holo')
MIN_VENTES = 0.01


def lire(chemin, defaut=None):
    try:
        with open(chemin, encoding='utf-8') as f:
            return json.load(f)
    except (OSError, ValueError):
        return defaut


def ecrire(chemin, objet):
    """Écriture en deux temps : un fichier n'est jamais laissé à moitié écrit."""
    tmp = chemin + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(objet, f, separators=(',', ':'))
    os.replace(tmp, chemin)


def centimes(v):
    return None if not isinstance(v, (int, float)) or isinstance(v, bool) else int(round(v * 100))


# ---------- Cote CallIt! : la même règle que coteDe() dans app.js ----------
# Réglée le 25/11/2026 sur 4 369 cartes à 1 € et plus vendues entre le 23 et le 25/11 (mesures du 23 comparées à la
# vente suivante). Erreur médiane : 21 %, contre 25 % pour la « tendance » de Cardmarket. Par niveau de confiance :
# bonne (48 % des cartes) 14 %, et une cote sur 30 se trompe de plus du double ; moyenne (24 %) 23 %, une sur 9 ;
# faible (28 %) 53 %, une sur 3. À refaire quand l'archive couvrira un mois : outils/test_cote.py --mesure.
ARTEFACT = 0.02      # « tendance » que Cardmarket affiche quand il n'en calcule pas : jamais prise comme prix
ACCORD, ECART = 1.25, 2.0          # écart entre moyennes : en dessous de 1,25 confiance bonne, de 2 moyenne, sinon faible
TOLERANCE = 0.5                    # un écart de moins de 50 centimes ne compte pas (cartes à quelques centimes)
# Offres en dessous de la cote (cartes abîmées, autres langues) : à partir de combien de fois moins cher la confiance
# passe à moyenne, puis à faible. Plus strict à 10 € et plus, où l'état de la carte pèse davantage.
BAS, BAS_10 = (5, 10), (3, 5)
# Fourchette autour de la cote selon la confiance (faible, moyenne, bonne) : la vente suivante y tombe 3 fois sur 4
FOURCHETTE = ((0.5, 1.75), (0.65, 1.4), (0.75, 1.25))
RANG = {'moy': 3, 'tendance': 2, 'bas': 1}
REGLE = 2            # numéro de la règle (1 = « tendance » brute). L'historique note celle qui l'a rempli.


def _pos(v):
    return v if isinstance(v, (int, float)) and not isinstance(v, bool) and v > 0 else None


def cote_mesures(low, trend, a1, a7, a30):
    """Cote d'un jeu de mesures (en euros) : {'v', 'lo', 'hi', 'conf' (0 faible, 1 moyenne, 2 bonne), 'src'} ou None."""
    low, trend, a1, a7, a30 = _pos(low), _pos(trend), _pos(a1), _pos(a7), _pos(a30)
    moy = [x for x in (a1, a7, a30) if x]
    if a7 and a30:
        v, src = min(a7, a30), 'moy'
        if low and low > v:   # jamais sous l'offre la moins chère, tant que les ventes récentes vont jusque-là
            v = min(low, max(a7, a30))
    elif a7 or a30:
        v, src = a7 or a30, 'moy'
    elif a1:
        v, src = a1, 'moy'
    elif trend and trend > ARTEFACT:
        v, src = trend, 'tendance'
    elif low:
        v, src = low, 'bas'
    else:
        return None
    # Trois doutes, notés 0 (aucun), 1 ou 2 : la confiance suit le plus fort
    ventes = offres = cher = 0
    if len(moy) >= 2:                  # les dernières ventes ne sont pas au même prix
        e = max(moy) / min(moy)
        ventes = 0 if e < ACCORD or max(moy) - min(moy) < TOLERANCE else 1 if e < ECART else 2
    else:
        ventes = 2
    if low and v >= 1:                 # des offres nettement en dessous de la cote
        r = v / low
        moyen, faible = BAS_10 if v >= 10 else BAS
        offres = 0 if r < moyen else 1 if r < faible else 2
        if ventes == 1 and r < ECART:  # ventes un peu dispersées, mais rien en vente à moitié prix : la cote tient
            ventes = 0
    if low and low - v >= TOLERANCE:   # plus rien en vente à ce prix : les offres commencent au-dessus
        r = low / v
        cher = 0 if r < ACCORD else 1 if r < ECART else 2
    conf = 2 - max(ventes, offres, cher)
    bas, haut = FOURCHETTE[conf]
    return {'v': v, 'lo': min(moy + [v * bas]), 'hi': max(moy + [v * haut]), 'conf': conf, 'src': src}


def cote_produit(normal, holo):
    """Cote d'un produit : ses mesures normales, sauf si seules les mesures holo ou reverse disent mieux."""
    n, h = cote_mesures(*normal), cote_mesures(*holo)
    if n and (not h or RANG[n['src']] >= RANG[h['src']]):
        return n
    if h:
        return dict(h, holo=True)
    return n


def cote_ligne(ligne):
    """Cote d'une ligne du guide Cardmarket, en centimes (ou None)."""
    g = ligne.get
    c = cote_produit((g('low'), g('trend'), g('avg1'), g('avg7'), g('avg30')),
                     (g('low-holo'), g('trend-holo'), g('avg1-holo'), g('avg7-holo'), g('avg30-holo')))
    return int(round(c['v'] * 100)) if c else None


def instantane(ids, guide_par_id, jour, cree, nb_lignes):
    ids = sorted(i for i in ids if i in guide_par_id)
    return {'jour': jour, 'guide': cree, 'produits': nb_lignes, 'champs': [c for c, _ in CHAMPS], 'ids': ids,
            'v': {c: [centimes(guide_par_id[i].get(src)) for i in ids] for c, src in CHAMPS}}


def cotes_de(inst):
    """{id: cote en centimes} d'un fichier de prix du jour."""
    if not inst or not isinstance(inst.get('ids'), list):
        return {}
    v = inst.get('v') or {}
    vide = [None] * len(inst['ids'])
    col = {c: (v.get(c) if isinstance(v.get(c), list) and len(v.get(c)) == len(inst['ids']) else vide) for c, _ in CHAMPS}
    e = lambda c, k: None if col[c][k] is None else col[c][k] / 100
    out = {}
    for k, i in enumerate(inst['ids']):
        c = cote_produit((e('low', k), e('trend', k), e('avg1', k), e('avg7', k), e('avg30', k)),
                         (e('lowHolo', k), e('trendHolo', k), e('avg1Holo', k), e('avg7Holo', k), e('avg30Holo', k)))
        if c:
            out[i] = int(round(c['v'] * 100))
    return out


def part_ventes_changees(avant, prix):
    """Part des cartes suivies dont une moyenne de vente (1, 7 ou 30 jours, normale ou holo) n'est plus celle du
    relevé précédent. None quand on ne peut pas comparer (pas de relevé précédent, ou sans ces mesures)."""
    ids, v = (avant or {}).get('ids'), (avant or {}).get('v')
    if not isinstance(ids, list) or not isinstance(v, dict):
        return None
    if any(not isinstance(v.get(c), list) or len(v[c]) != len(ids) for c in VENTES):
        return None
    pos = {i: k for k, i in enumerate(ids)}
    suivies = changees = 0
    for k, i in enumerate(prix['ids']):
        j = pos.get(i)
        if j is None:
            continue
        hier, auj = [v[c][j] for c in VENTES], [prix['v'][c][k] for c in VENTES]
        if all(x is None for x in hier + auj):  # jamais vendue : rien à comparer
            continue
        suivies += 1
        changees += hier != auj
    return changees / suivies if suivies else None


def jour_des_ventes(avant, prix, jour):
    """(part, ventes) : la part des cartes dont une moyenne de vente a changé (voir part_ventes_changees), et le jour
    du dernier guide où les moyennes de vente ont bougé. Ventes figées : on garde le jour noté au relevé précédent."""
    part = part_ventes_changees(avant, prix)
    if part is not None and part < MIN_VENTES:
        return part, _jour(avant.get('ventes')) or _jour(avant.get('jour')) or jour
    return part, jour


def _jour(x):
    """x s'il s'écrit AAAA-MM-JJ, sinon None."""
    try:
        return x if isinstance(x, str) and len(x) == 10 and datetime.date.fromisoformat(x) else None
    except ValueError:
        return None


def sortie_github(**valeurs):
    chemin = os.environ.get('GITHUB_OUTPUT')
    if chemin:
        with open(chemin, 'a', encoding='utf-8') as f:
            for k, v in valeurs.items():
                f.write(f'{k}={v}\n')


def resume(texte):
    print(texte)
    chemin = os.environ.get('GITHUB_STEP_SUMMARY')
    if chemin:
        with open(chemin, 'a', encoding='utf-8') as f:
            f.write(texte + '\n\n')


def archiver(dossier, guide, par_id, cles, cree, jour):
    """Archive complète du jour : tous les produits du guide, toutes ses mesures, dans un fichier compressé."""
    os.makedirs(dossier, exist_ok=True)
    champs = sorted(k for k in cles if k != 'idProduct')
    contenu = {'guide': cree, 'version': guide.get('version'), 'champs': champs,
               'lignes': [[i] + [par_id[i].get(k) for k in champs] for i in sorted(par_id)]}
    brut = json.dumps(contenu, separators=(',', ':')).encode('utf-8')
    tampon = io.BytesIO()
    with gzip.GzipFile(fileobj=tampon, mode='wb', compresslevel=9, mtime=0) as z:  # mtime=0 : même guide, même fichier
        z.write(brut)
    with open(os.path.join(dossier, f'releve-{jour}.json.gz'), 'wb') as f:
        f.write(tampon.getvalue())
    print(f'Archive : releve-{jour}.json.gz, {len(tampon.getvalue()) // 1024} Ko ({len(par_id)} produits, {len(champs)} mesures)')


def refaire(dossier, essai=False, forcer=False):
    """Refait tout l'historique avec la règle actuelle, à partir des archives quotidiennes (releve-*.json.gz).
    Un jour sans archive garde sa valeur si elle vient de la même règle ; sinon il est retiré."""
    fichiers = sorted(glob.glob(os.path.join(dossier, 'releve-*.json.gz')))
    if not fichiers:
        sys.exit(f'ERREUR : aucune archive releve-*.json.gz dans {dossier}. Rien enregistré.')
    cartes = (lire('data/cards.json') or {}).get('cards') or []
    ids_histo = {c['cm'] for c in cartes if c.get('cm')}
    if len(ids_histo) < 1000:
        sys.exit('ERREUR : data/cards.json illisible ou vide. Rien enregistré.')
    ids_histo |= {x[0] for x in (lire('data/sealed.json') or {}).get('items', [])}
    jour_de = datetime.date.fromisoformat
    par_jour = {}
    for f in fichiers:
        nom = os.path.basename(f)
        try:
            with gzip.open(f, 'rt', encoding='utf-8') as z:
                d = json.load(z)
            jour, champs, lignes = str(d['guide'])[:10], d['champs'], d['lignes']
            jour_de(jour)
            if not isinstance(lignes, list) or len(lignes) < MIN_LIGNES or not isinstance(champs, list):
                raise ValueError(f'{len(lignes) if isinstance(lignes, list) else 0} lignes')
        except (OSError, EOFError, ValueError, KeyError, TypeError) as e:
            sys.exit(f'ERREUR : archive illisible ({nom} : {e}). Rien enregistré.')
        par_jour[jour] = {l[0]: cote_ligne(dict(zip(champs, l[1:]))) for l in lignes if l and l[0] in ids_histo}
    info = lire('historique/info.json') or {}
    regle_histo = info.get('regle', 1) if info else REGLE
    anciens = {}
    for n in range(100):
        h = lire(f'historique/{n:02d}.json')
        if not h:
            continue
        debut_h = jour_de(h['start'])
        for i, serie in h['p'].items():
            for k, v in enumerate(serie):
                if v is not None:
                    anciens.setdefault((debut_h + datetime.timedelta(days=k)).isoformat(), {})[int(i)] = v
    premier = min(par_jour)
    # Changement de règle : un jour déjà relevé, postérieur à la première archive mais sans archive, serait perdu
    manquants = sorted(j for j in anciens if j >= premier and j not in par_jour) if regle_histo != REGLE else []
    if manquants and not forcer:
        sys.exit(f'ERREUR : pas d\'archive pour {", ".join(manquants)}, déjà dans l\'historique. Rien enregistré.')
    jours = dict(par_jour)
    gardes, retires = [], []
    for j in sorted(anciens):
        if j not in jours:
            if regle_histo == REGLE:
                jours[j] = anciens[j]
                gardes.append(j)
            else:
                retires.append(j)
    debut, fin = min(jours), max(jours)
    nb = (jour_de(fin) - jour_de(debut)).days + 1
    sorties = {n: {'start': debut, 'p': {}} for n in range(100)}
    cotes = 0
    for j, vals in jours.items():
        k = (jour_de(j) - jour_de(debut)).days
        for i, v in vals.items():
            if v is not None:
                sorties[i % 100]['p'].setdefault(str(i), [None] * nb)[k] = v
                cotes += 1
    for h in sorties.values():
        for serie in h['p'].values():
            while serie and serie[-1] is None:
                serie.pop()
    bilan = (f'Historique refait avec la règle {REGLE} : du {debut} au {fin}, {len(par_jour)} jour(s) tiré(s) des archives, '
             f'{cotes} cotes pour {sum(len(h["p"]) for h in sorties.values())} produits.'
             + (f' Jours gardés tels quels, sans archive : {", ".join(gardes)}.' if gardes else '')
             + (f' Jours retirés, relevés avec la règle {regle_histo} et sans archive : {", ".join(retires)}.' if retires else ''))
    if essai:
        resume('ESSAI, rien n\'est écrit. ' + bilan)
        return
    os.makedirs('historique', exist_ok=True)
    for n, h in sorties.items():
        ecrire(f'historique/{n:02d}.json', h)
    ecrire('historique/info.json', {'start': debut, 'last': fin, 'regle': REGLE})
    resume(bilan)


def main():
    ap = argparse.ArgumentParser(description='Relevé quotidien des prix')
    ap.add_argument('guide', nargs='?')
    ap.add_argument('--essai', action='store_true')
    ap.add_argument('--forcer', action='store_true')
    ap.add_argument('--archive')
    ap.add_argument('--maintenant', help='date et heure à considérer comme « maintenant » (essais, reprise d\'anciens guides)')
    ap.add_argument('--refaire', metavar='DOSSIER', help='refaire l\'historique à partir des archives de ce dossier')
    a = ap.parse_args()
    if a.refaire:
        dossier = os.path.abspath(a.refaire)
        os.chdir(RACINE)
        return refaire(dossier, a.essai, a.forcer)
    if not a.guide:
        ap.error('il faut le fichier du guide, ou --refaire DOSSIER')
    guide_chemin = os.path.abspath(a.guide)
    archive_dir = os.path.abspath(a.archive) if a.archive else None
    os.chdir(RACINE)

    # ---------- 1. Le guide ----------
    try:
        with open(guide_chemin, encoding='utf-8') as f:
            guide = json.load(f)
    except (OSError, ValueError) as e:
        sys.exit(f'ERREUR : guide illisible ({e}). Rien enregistré.')
    lignes = guide.get('priceGuides') if isinstance(guide, dict) else None
    if not isinstance(lignes, list) or len(lignes) < MIN_LIGNES:
        sys.exit(f'ERREUR : guide vide ou tronqué ({len(lignes) if isinstance(lignes, list) else 0} lignes). Rien enregistré.')
    cree = guide.get('createdAt') or ''
    try:
        quand = datetime.datetime.strptime(cree, '%Y-%m-%dT%H:%M:%S%z')
    except ValueError:
        sys.exit(f'ERREUR : date du guide illisible ({cree!r}). Rien enregistré.')
    jour = cree[:10]
    maintenant = datetime.datetime.strptime(a.maintenant, '%Y-%m-%dT%H:%M:%S%z') if a.maintenant else datetime.datetime.now(datetime.timezone.utc)
    if quand > maintenant + datetime.timedelta(hours=6):
        sys.exit(f'ERREUR : le guide est daté du futur ({cree}). Rien enregistré.')
    retard = (maintenant.date() - datetime.date.fromisoformat(jour)).days
    par_id = {r['idProduct']: r for r in lignes if isinstance(r, dict) and isinstance(r.get('idProduct'), int)}
    cles = set()
    for r in par_id.values():
        cles.update(r)
    manquants = [src for _, src in CHAMPS if src not in cles]
    print(f'Guide du {cree} : {len(lignes)} produits, champs {sorted(cles)}')
    if manquants:
        sys.exit(f'ERREUR : le guide n\'a plus les champs {manquants}. Rien enregistré.')

    # ---------- 2. Ce qu'on suit ----------
    base = lire('data/cards.json') or {}
    cartes = base.get('cards') or []
    ids_base = {c['cm'] for c in cartes if c.get('cm')}
    if len(ids_base) < 1000:
        sys.exit('ERREUR : data/cards.json illisible ou vide. Rien enregistré.')
    ids_scelles = {x[0] for x in (lire('data/sealed.json') or {}).get('items', [])}
    ids_extra = {x[0] for x in (lire('data/cm_extra.json') or {}).get('items', [])}
    ids_plus = (ids_scelles | ids_extra) - ids_base

    # ---------- 3. Déjà fait ? ----------
    avant = lire('data/prix.json')
    avant_plus = lire('data/prix_plus.json')
    info = lire('historique/info.json') or {}
    regle_histo = info.get('regle', 1) if info else REGLE   # un historique sans numéro date de la règle 1
    a_refaire = 'oui' if regle_histo != REGLE else 'non'      # la tâche GitHub refait alors l'historique avec les archives
    # Complet : même guide, mêmes champs, et mêmes produits suivis. Quand la base de cartes ou la liste des cartes
    # hors base a changé depuis le dernier passage (liens Cardmarket corrigés), le relevé du jour est réécrit.
    complet = lambda inst, ids: (bool(inst) and inst.get('guide') == cree and inst.get('champs') == [c for c, _ in CHAMPS]
                                 and inst.get('ids') == sorted(i for i in ids if i in par_id))
    if complet(avant, ids_base) and complet(avant_plus, ids_plus) and info.get('last') == jour and not a.forcer:
        if archive_dir and not a.essai:  # si l'archive n'a pas pu être rangée au passage précédent, la tâche la range maintenant
            archiver(archive_dir, guide, par_id, cles, cree, jour)
        ventes = _jour(avant.get('ventes')) or jour
        retard_ventes = (maintenant.date() - datetime.date.fromisoformat(ventes)).days
        sortie_github(nouveau='non', jour=jour, retard=retard, retard_ventes=retard_ventes, refaire=a_refaire)
        resume(f'Relevé du {jour} déjà enregistré : rien à faire.')
        if retard >= JOURS_RETARD:
            resume(f'ATTENTION : Cardmarket n\'a pas publié de nouveau guide depuis {retard} jours (dernier : {cree}).')
        if retard_ventes >= JOURS_RETARD:
            resume(f'ATTENTION : les moyennes de vente du guide Cardmarket n\'ont pas changé depuis le guide du {ventes}.')
        return
    if avant and avant.get('guide', '') > cree and not a.forcer:
        sys.exit(f'ERREUR : ce guide ({cree}) est plus ancien que le dernier relevé ({avant.get("guide")}). Rien enregistré.')

    # ---------- 4. Cohérence avec le relevé précédent ----------
    prix = instantane(ids_base, par_id, jour, cree, len(lignes))
    plus = instantane(ids_plus, par_id, jour, cree, len(lignes))
    part, ventes = jour_des_ventes(avant, prix, jour)
    prix['ventes'] = ventes  # jour du dernier guide où les moyennes de vente ont bougé
    retard_ventes = (maintenant.date() - datetime.date.fromisoformat(ventes)).days
    auj = cotes_de(prix)
    if avant:
        hier, ref = cotes_de(avant), f'au relevé du {avant.get("jour")}'
    else:  # tout premier relevé : on compare à la base
        hier, ref = {}, 'à la base de cartes'
        pf = base.get('priceFields') or []
        for c in cartes:
            p = c.get('p')
            if c.get('cm') and p:
                m = dict(zip(pf, p)).get
                x = cote_produit((m('low'), m('trend'), m('avg1'), m('avg7'), m('avg30')), (None, m('trendHolo'), None, None, None))
                if x:
                    hier[c['cm']] = int(round(x['v'] * 100))
    soucis = []
    if avant and avant.get('produits') and len(lignes) < 0.9 * avant['produits']:
        soucis.append(f'le guide a {len(lignes)} produits contre {avant["produits"]} {ref}')
    communs = [i for i in hier if i in auj]
    couverture = len(communs) / len(hier) if hier else 1
    if couverture < MIN_COUVERTURE:
        soucis.append(f'seulement {couverture:.1%} des produits cotés {ref} le sont encore')
    rapports = [auj[i] / hier[i] for i in communs if hier[i] >= 100]
    mediane = statistics.median(rapports) if rapports else 1
    grands = sum(1 for r in rapports if r < 0.5 or r > 2) / len(rapports) if rapports else 0
    if not MEDIANE[0] <= mediane <= MEDIANE[1]:
        soucis.append(f'la variation médiane des cotes est de {mediane:.3f} (attendu : proche de 1)')
    if grands > MAX_GRANDS_ECARTS:
        soucis.append(f'{grands:.1%} des cartes à 1 € et plus ont doublé ou perdu la moitié de leur cote')
    changes = sum(1 for i in communs if auj[i] != hier[i])
    bilan = (f'Relevé du {jour} (guide du {cree}) : {len(auj)} cartes cotées sur {len(ids_base)} suivies, '
             f'{len(cotes_de(plus))} autres produits cotés sur {len(ids_plus)}. '
             f'Par rapport {ref} : {couverture:.2%} des cotes retrouvées, {changes} cotes changées, '
             f'variation médiane {mediane:.3f}, grands écarts {grands:.2%}.')
    if part is not None:
        bilan += (f' Moyennes de vente changées pour {part:.1%} des cartes.' if part >= MIN_VENTES else
                  f' Moyennes de vente figées : les mêmes qu\'{ref} pour {1 - part:.1%} des cartes, seules les offres ont'
                  f' bougé (dernier guide où les ventes ont bougé : {ventes}).')
    if soucis:
        print(bilan)
        msg = 'Vérification en échec : ' + ' ; '.join(soucis) + '.'
        if not a.forcer:
            sys.exit('ERREUR : ' + msg + ' Rien enregistré.')
        print('ATTENTION (forcé) :', msg)

    # ---------- 5. Historique (préparé en entier avant d'écrire quoi que ce soit) ----------
    ids_histo = ids_base | ids_scelles
    du_jour = {}
    for i in ids_histo:
        if i in par_id:
            du_jour.setdefault(i % 100, {})[i] = cote_ligne(par_id[i])
    fichiers, debut = {}, None
    for n in range(100):
        chemin = f'historique/{n:02d}.json'
        h = lire(chemin) or {'start': jour, 'p': {}}
        k = (datetime.date.fromisoformat(jour) - datetime.date.fromisoformat(h['start'])).days
        if k < 0:
            sys.exit(f'ERREUR : le guide du {jour} est antérieur au début de l\'historique ({h["start"]}). Rien enregistré.')
        vals = du_jour.get(n, {})
        for i in set(h['p']) | {str(x) for x in vals}:
            s = h['p'].setdefault(i, [])
            s.extend([None] * (k + 1 - len(s)))  # jours sans relevé = null
            s[k] = vals.get(int(i))
        fichiers[chemin] = h
        debut = h['start'] if debut is None else min(debut, h['start'])

    # ---------- 6. Écriture ----------
    if a.essai:
        resume('ESSAI, rien n\'est écrit. ' + bilan)
        t1, t2 = len(json.dumps(prix, separators=(',', ':'))), len(json.dumps(plus, separators=(',', ':')))
        print(f'data/prix.json ferait {t1 // 1024} Ko ({len(prix["ids"])} produits), data/prix_plus.json {t2 // 1024} Ko ({len(plus["ids"])} produits)')
        print('Exemple de ligne du guide :', json.dumps(lignes[0]))
        sortie_github(nouveau='non', jour=jour, retard=retard, retard_ventes=retard_ventes, refaire='non')
        return
    if archive_dir:
        archiver(archive_dir, guide, par_id, cles, cree, jour)
    os.makedirs('historique', exist_ok=True)
    for chemin, h in fichiers.items():
        ecrire(chemin, h)
    ecrire('historique/info.json', {'start': debut, 'last': jour, 'regle': regle_histo})
    ecrire('data/prix_plus.json', plus)
    ecrire('data/prix.json', prix)  # en dernier : c'est lui qui dit que le relevé du jour est complet
    sortie_github(nouveau='oui', jour=jour, retard=retard, retard_ventes=retard_ventes, refaire=a_refaire)
    resume(bilan)
    if a_refaire == 'oui':
        resume(f'L\'historique a été rempli avec la règle {regle_histo} : il est à refaire avec la règle {REGLE} (option « refaire »).')
    if retard >= JOURS_RETARD:
        resume(f'ATTENTION : le dernier guide de Cardmarket date de {retard} jours ({cree}).')
    if retard_ventes >= JOURS_RETARD:
        resume(f'ATTENTION : les moyennes de vente du guide Cardmarket n\'ont pas changé depuis le guide du {ventes}.')


if __name__ == '__main__':
    main()
