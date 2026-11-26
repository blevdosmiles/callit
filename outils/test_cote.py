"""Vérifie la cote CallIt!, et la mesure sur les archives.

La règle de cote est écrite deux fois : dans outils/releve_prix.py (historique des prix) et dans app.js, entre les
marques <cote> et </cote> (prix affichés). Ce script s'assure que les deux donnent exactement les mêmes résultats,
sur les prix du jour (data/prix.json, data/prix_plus.json) ou sur une archive, et sur quelques cas limites.
Il vérifie aussi que le relevé reconnaît un guide dont les moyennes de vente n'ont pas bougé (ventes figées).

Usage : python3 outils/test_cote.py [archive.json.gz]
        python3 outils/test_cote.py --mesure AVANT.json.gz APRES.json.gz

  --mesure  mesure la règle entre deux archives quotidiennes (releases prix-AAAA-MM du dépôt) : pour chaque carte
            vendue entre les deux dates, la cote calculée sur AVANT est comparée au prix de la vente suivante.
            Une vente se reconnaît à la moyenne sur 1 jour, qui ne change que les jours où la carte se vend.
            Sert à régler les seuils de confiance et la largeur de la fourchette (constantes de releve_prix.py).

Il faut Node.js pour la vérification (il lit la règle d'app.js telle qu'elle est).
"""
import gzip, json, math, os, statistics, subprocess, sys, tempfile

sys.dont_write_bytecode = True
RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RACINE, 'outils'))
import releve_prix as R  # noqa: E402

NORMAL = ('low', 'trend', 'avg1', 'avg7', 'avg30')
HOLO = ('low-holo', 'trend-holo', 'avg1-holo', 'avg7-holo', 'avg30-holo')
CAS_LIMITES = [  # (mesures normales, mesures holo) : bas, tendance, hier, 7 jours, 30 jours
    ([None] * 5, [None] * 5), ([0] * 5, [0] * 5), ([5, None, None, None, None], [None] * 5),
    ([None, 0.02, None, None, None], [None] * 5), ([3, 0.02, None, None, None], [None] * 5), ([None, 0.03, None, None, None], [None] * 5),
    ([14, 0, None, None, None], [14, 14.99, 14.99, 14.99, 14.99]), ([14, 20, None, None, None], [None, 30, None, None, None]),
    ([None, None, 7, None, None], [None] * 5), ([None, None, None, 7, None], [None] * 5), ([None, None, None, None, 7], [None] * 5),
    ([49.99, 400.74, 161.92, 539.96, 395.01], [None] * 5), ([180, 0.02, 750, 502.99, 1262], [None] * 5),
    ([380, 669.75, 360, 601.43, 308], [None] * 5), ([40000, 400, 400, 400, 400], [None] * 5), ([0.02, 0.05, 0.04, 0.1, 0.06], [None] * 5),
    ([0.5, 13.1, 10.48, 10.59, 12.04], [None] * 5), ([2, 9, 9.4, 9.9, 9.5], [None] * 5), ([4.9, 10, 10, 10, 10], [None] * 5),
    ([1, 1, 1.2, 1.49, 1], [None] * 5), ([10, 10, 10, 12.49, 10], [None] * 5), ([10, 10, 10, 12.5, 10], [None] * 5),
    ([10, 10, 10, 19.99, 10], [None] * 5), ([10, 10, 10, 20, 10], [None] * 5), ([12.5, 10, 10, 10, 10], [None] * 5),
    ([20, 10, 10, 10, 10], [None] * 5), ([True, 'x', -1, 4, 5], [None] * 5),
]


def lire_archive(chemin):
    with gzip.open(chemin, 'rt', encoding='utf-8') as z:
        d = json.load(z)
    return {l[0]: dict(zip(d['champs'], l[1:])) for l in d['lignes']}, str(d.get('guide'))


def lignes_du_jour():
    """Les produits de data/prix.json et data/prix_plus.json, sous la forme (normal, holo), en euros."""
    noms = {'low': 'low', 'trend': 'trend', 'avg1': 'avg1', 'avg7': 'avg7', 'avg30': 'avg30', 'low-holo': 'lowHolo',
            'trend-holo': 'trendHolo', 'avg1-holo': 'avg1Holo', 'avg7-holo': 'avg7Holo', 'avg30-holo': 'avg30Holo'}
    out = []
    for f in ('data/prix.json', 'data/prix_plus.json'):
        d = R.lire(os.path.join(RACINE, f))
        if not d or not isinstance(d.get('ids'), list):
            continue
        v = d.get('v') or {}
        e = lambda c, k: None if not isinstance(v.get(noms[c]), list) or v[noms[c]][k] is None else v[noms[c]][k] / 100
        out += [([e(c, k) for c in NORMAL], [e(c, k) for c in HOLO]) for k in range(len(d['ids']))]
    return out


def cotes_js(cas):
    """Les mêmes cas passés à la règle d'app.js, par Node.js."""
    with open(os.path.join(RACINE, 'app.js'), encoding='utf-8') as f:
        code = f.read()
    a, b = code.find('/* <cote>'), code.find('/* </cote> */')
    if a < 0 or b < a:
        sys.exit('ERREUR : marques <cote> et </cote> introuvables dans app.js.')
    with tempfile.TemporaryDirectory() as dossier:
        entree = os.path.join(dossier, 'cas.json')
        with open(entree, 'w', encoding='utf-8') as f:
            json.dump(cas, f)
        script = os.path.join(dossier, 'cote.js')
        with open(script, 'w', encoding='utf-8') as f:
            f.write(code[a:b] + '\nconst fs = require("fs"); const cas = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));\n'
                    'process.stdout.write(JSON.stringify(cas.map(([n, h]) => coteProduit(n, h))));\n')
        try:
            r = subprocess.run(['node', script, entree], capture_output=True, text=True, timeout=120)
        except FileNotFoundError:
            sys.exit('ERREUR : Node.js est introuvable, la règle d\'app.js n\'a pas pu être lue.')
        if r.returncode:
            sys.exit('ERREUR : la règle d\'app.js ne s\'exécute pas.\n' + r.stderr[-800:])
        return json.loads(r.stdout)


def pareil(a, b):
    if a is None or b is None:
        return a is None and b is None
    return (a['src'] == b['src'] and a['conf'] == b['conf'] and bool(a.get('holo')) == bool(b.get('holo'))
            and all(math.isclose(a[k], b[k], rel_tol=1e-9, abs_tol=1e-9) for k in ('v', 'lo', 'hi')))


def releve(jour, ids, ventes, autres=None, note=None):
    """Prix du jour réduits à l'essentiel : ventes = {id: (moyenne 1 jour, 7 jours, 30 jours)}, holo vides."""
    v = {c: [None] * len(ids) for c, _ in R.CHAMPS}
    for k, i in enumerate(ids):
        v['avg1'][k], v['avg7'][k], v['avg30'][k] = ventes.get(i, (None, None, None))
    for c in autres or ():
        del v[c]
    r = {'jour': jour, 'guide': jour + 'T02:45:00+0100', 'ids': ids, 'v': v}
    if note:
        r['ventes'] = note
    return r


def verifier_ventes():
    """Ventes figées : un guide neuf dont les moyennes de vente n'ont pas bougé depuis le relevé précédent."""
    cent = list(range(1, 201))
    tout = {i: (i, i, i) for i in cent}
    une = {**tout, 1: (2, 1, 1)}
    moitie = {**tout, **{i: (0, i, i) for i in range(1, 101)}}
    cas = [  # (relevé précédent, relevé du jour, attendu : part des cartes dont une vente a bougé, jour des ventes)
        (None, releve('2026-11-26', cent, tout), (None, '2026-11-26')),
        (releve('2026-11-25', cent, tout), releve('2026-11-26', cent, tout), (0.0, '2026-11-25')),
        (releve('2026-11-25', cent, tout, note='2026-11-24'), releve('2026-11-26', cent, tout), (0.0, '2026-11-24')),
        (releve('2026-11-25', cent, tout, note='hier'), releve('2026-11-26', cent, tout), (0.0, '2026-11-25')),
        (releve('2026-11-25', cent, tout), releve('2026-11-26', cent, une), (0.005, '2026-11-25')),   # 1 sur 200 : figées
        (releve('2026-11-25', cent, tout), releve('2026-11-26', cent, moitie), (0.5, '2026-11-26')),
        (releve('2026-11-26', cent, tout, note='2026-11-25'), releve('2026-11-26', cent, moitie), (0.5, '2026-11-26')),
        (releve('2026-11-25', cent, tout, autres=['avg1Holo']), releve('2026-11-26', cent, tout), (None, '2026-11-26')),
        (releve('2026-11-25', cent, {}), releve('2026-11-26', cent, {}), (None, '2026-11-26')),        # jamais vendues
        (releve('2026-11-25', [300, 301], {300: (1, 1, 1)}), releve('2026-11-26', cent, tout), (None, '2026-11-26')),
        (releve('2026-11-25', cent + [500], {**tout, 500: (9, 9, 9)}),
         releve('2026-11-26', cent + [501], {**tout, 501: (5, 5, 5)}), (0.0, '2026-11-25')),  # cartes nouvelles ignorées
    ]
    erreurs = 0
    for n, (avant, prix, attendu) in enumerate(cas, 1):
        obtenu = R.jour_des_ventes(avant, prix, prix['jour'])
        if obtenu != attendu:
            erreurs += 1
            print(f'  ventes, cas {n} : attendu {attendu}, obtenu {obtenu}')
    print(f'Ventes figées : {len(cas)} cas vérifiés, ' + ('tous justes.' if not erreurs else f'{erreurs} faux.'))
    return erreurs


def verifier(archive):
    erreurs_ventes = verifier_ventes()
    if archive:
        par_id, guide = lire_archive(archive)
        cas = [([r.get(c) for c in NORMAL], [r.get(c) for c in HOLO]) for r in par_id.values()]
        source = f'archive du {guide[:10]}'
    else:
        cas, source = lignes_du_jour(), 'prix du jour'
    if not cas:
        sys.exit('ERREUR : aucun prix à vérifier (data/prix.json illisible ?).')
    cas = CAS_LIMITES + cas
    py = [R.cote_produit(tuple(n), tuple(h)) for n, h in cas]
    js = cotes_js(cas)
    ecarts = [(c, p, j) for c, p, j in zip(cas, py, js) if not pareil(p, j)]
    cotes = sum(1 for p in py if p)
    print(f'{len(cas)} produits ({source} et {len(CAS_LIMITES)} cas limites), {cotes} cotes : '
          + ('l\'appli et le relevé donnent les mêmes résultats.' if not ecarts else f'{len(ecarts)} différences.'))
    for c, p, j in ecarts[:10]:
        print('  mesures', c, '\n    relevé', p, '\n    appli ', j)
    sys.exit(1 if ecarts or erreurs_ventes else 0)


def mesurer(avant, apres):
    A, ga = lire_archive(avant)
    B, gb = lire_archive(apres)
    suivies = {c['cm'] for c in (R.lire(os.path.join(RACINE, 'data/cards.json')) or {}).get('cards', []) if c.get('cm')}
    pos = lambda v: v if isinstance(v, (int, float)) and v > 0 else None
    lignes = []  # (cote, tendance, moyenne 30 jours, vente suivante)
    for i, a in A.items():
        b = B.get(i)
        if not b or (suivies and i not in suivies):
            continue
        a1, vente = pos(a.get('avg1')), pos(b.get('avg1'))
        if not a1 or not vente or abs(a1 - vente) <= 0.001 or not (pos(a.get('avg7')) and pos(a.get('avg30'))):
            continue
        q = R.cote_mesures(*[a.get(c) for c in NORMAL])
        if q and q['v'] >= 1:
            lignes.append((q, pos(a.get('trend')), pos(a.get('avg30')), vente))
    if len(lignes) < 100:
        sys.exit(f'Pas assez de cartes vendues entre les deux archives ({len(lignes)}).')
    err = lambda v, t: abs(math.log(v / t))
    def bilan(es):
        es = sorted(es)
        return f'erreur médiane {math.exp(es[len(es) // 2]) - 1:5.1%}, plus du double {sum(e > math.log(2) for e in es) / len(es):5.1%}'
    print(f'Du {ga[:10]} au {gb[:10]} : {len(lignes)} cartes à 1 € et plus vendues entre les deux dates.')
    print('  Cote CallIt!        ', bilan([err(q['v'], t) for q, _, _, t in lignes]))
    print('  Tendance Cardmarket ', bilan([err(tr, t) for _, tr, _, t in lignes if tr]))
    print('  Moyenne 30 jours    ', bilan([err(m, t) for _, _, m, t in lignes if m]))
    for k, nom in ((2, 'bonne'), (1, 'moyenne'), (0, 'faible')):
        sous = [(q, t) for q, _, _, t in lignes if q['conf'] == k]
        if not sous:
            continue
        dedans = sum(q['lo'] <= t <= q['hi'] for q, t in sous) / len(sous)
        large = statistics.median(q['hi'] / q['lo'] for q, _ in sous)
        print(f'  Confiance {nom:8s} {len(sous) / len(lignes):4.0%} des cartes, {bilan([err(q["v"], t) for q, t in sous])}, '
              f'vente dans la fourchette {dedans:4.0%} (fourchette de 1 à {large:.1f})')


if __name__ == '__main__':
    args = sys.argv[1:]
    if args[:1] == ['--mesure']:
        if len(args) != 3:
            sys.exit('Usage : python3 outils/test_cote.py --mesure AVANT.json.gz APRES.json.gz')
        mesurer(args[1], args[2])
    elif len(args) > 1 or (args and args[0].startswith('-')):
        sys.exit(__doc__)
    else:
        verifier(args[0] if args else None)
