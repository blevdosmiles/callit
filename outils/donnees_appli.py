"""Bases de cartes au format de l'appli (data/appli/), plus légères à télécharger et plus rapides à lire.

Même contenu que data/cards.json (Pokémon) et data/jeux/<jeu>.json, rangé en colonnes :
  - « noms » : chaque nom de carte une seule fois (le même nom revient dans plusieurs langues et plusieurs sets) ;
  - « cols » : une colonne par champ des cartes (n, num, s, i, r, t, cm, p, im…), dans l'ordre des champs d'origine.
    Une colonne est « pleine » (une valeur par carte, null = champ absent) ou « clairsemée » quand moins de la moitié
    des cartes ont ce champ : {"d": écarts entre les numéros de cartes, "v": valeurs} ;
  - prix (p) en centimes ;
  - images de Magic (im) : à part, lues par l'appli après le premier affichage, en deux fichiers : « tete » (les
    TETE cartes les plus chères et les hausses et baisses du Marché : toutes celles de l'accueil, petit fichier) puis
    « reste ». Dans la base, im
    vaut alors 1 (« cette carte a une image ») et « images » donne les deux noms de fichier,
    <jeu>-images-<empreinte>-tete.json et -reste.json. L'empreinte change avec le contenu : une base gardée sur un
    appareil ne peut jamais recevoir les images d'une autre version de la base (une image ne doit jamais être celle
    d'une autre carte).
app.js (lireBase) refait les cartes exactement comme dans le fichier d'origine (mêmes champs, même ordre),
vérifié carte par carte par outils/test_donnees_appli.js.
Si ces fichiers manquent (copie de secours sur GitHub Pages, essais en local), l'appli lit les fichiers d'origine.

Usage : python3 outils/donnees_appli.py   (depuis la racine du dépôt ; écrit data/appli/)
Lancé à chaque mise en ligne (.github/workflows/cloudflare.yml) : les fichiers ne sont pas gardés dans le dépôt.
"""
import glob, hashlib, json, os, sys

SOURCES = {'pkm': 'data/cards.json', 'mtg': 'data/jeux/mtg.json', 'ygo': 'data/jeux/ygo.json', 'op': 'data/jeux/op.json'}
IMAGES_A_PART = {'mtg'}  # identifiants d'image longs (Scryfall) : un tiers du fichier, inutiles avant le premier affichage
TETE = 8192  # cartes dont l'image arrive en premier : les plus chères (l'accueil en montre surtout parmi elles)
SORTIE = 'data/appli'


def mouvements(d, cards):
    """Cartes des hausses et baisses de l'accueil Marché : même règle que movers() dans app.js pour les autres jeux
    (si elle change là-bas, seule l'arrivée de quelques images est retardée, jamais une image fausse)."""
    i7 = (d.get('priceFields') or []).index('avg7') if 'avg7' in (d.get('priceFields') or []) else None
    liste = []
    for k, c in enumerate(cards):
        p = c.get('p') or []
        v = lambda i: p[i] if i is not None and len(p) > i and p[i] is not None else None
        bas, tendance, moy30, moy7 = v(0), v(1), v(2), v(i7)
        prix = tendance if tendance is not None else bas
        if 'im' not in c or not prix or prix <= 0:
            continue
        if tendance is None or moy30 is None or bas is None or moy7 is None:
            continue
        if tendance >= 5 and moy30 >= 5 and bas >= 1 and moy7 > 0 and abs(tendance / moy7 - 1) < 0.35:
            liste.append((k, (tendance - moy30) / moy30))
    hausses = sorted([x for x in liste if x[1] > 0.05], key=lambda x: -x[1])[:20]
    baisses = sorted([x for x in liste if -0.6 < x[1] < -0.05], key=lambda x: x[1])[:20]
    return {k for k, _ in hausses + baisses}


def ordre_des_langues(cards):
    """Ordre global des langues des noms, compatible avec l'ordre de chaque carte (vérifié : aucun conflit)."""
    avant = {}
    vues = []
    for c in cards:
        ks = list(c.get('n', {}))
        for k in ks:
            if k not in avant:
                avant[k] = set(); vues.append(k)
        for i, a in enumerate(ks):
            for b in ks[i + 1:]:
                avant[b].add(a)
    ordre, restantes = [], list(vues)
    while restantes:
        libres = [l for l in restantes if not (avant[l] & set(restantes))]
        if not libres:
            raise SystemExit('ordre des langues contradictoire')
        l = libres[0]; ordre.append(l); restantes.remove(l)
    for c in cards:  # vérification : l'ordre de chaque carte suit l'ordre global
        ks = list(c.get('n', {}))
        if ks != [l for l in ordre if l in c.get('n', {})]:
            raise SystemExit('ordre des noms inattendu : ' + json.dumps(c.get('n'), ensure_ascii=False))
    return ordre


def ordre_des_champs(cards):
    """Ordre des champs des cartes, le même pour toutes (chaque carte en a une partie, dans cet ordre)."""
    avant, vus = {}, []
    for c in cards:
        ks = list(c)
        for k in ks:
            if k not in avant:
                avant[k] = set(); vus.append(k)
        for i, a in enumerate(ks):
            for b in ks[i + 1:]:
                avant[b].add(a)
    ordre, restants = [], list(vus)
    while restants:
        libres = [k for k in restants if not (avant[k] & set(restants))]
        if not libres:
            raise SystemExit('ordre des champs contradictoire')
        k = libres[0]; ordre.append(k); restants.remove(k)
    return ordre


def colonne(valeurs):
    """Pleine (null = absent) ou clairsemée {d: écarts, v: valeurs} si moins de la moitié des cartes ont le champ."""
    presentes = [(k, v) for k, v in enumerate(valeurs) if v is not None]
    if len(presentes) * 2 >= len(valeurs):
        return valeurs
    d, v, prec = [], [], -1
    for k, x in presentes:
        d.append(k - prec); v.append(x); prec = k
    return {'d': d, 'v': v}


def centimes(p):
    out = []
    for x in p:
        if x is None:
            out.append(None); continue
        c = round(x * 100)
        if abs(c / 100 - x) > 1e-9:
            raise SystemExit('prix avec plus de deux décimales : %r' % x)
        out.append(int(c))
    return out


def convertir(jeu, chemin):
    d = json.load(open(chemin, encoding='utf-8'))
    cards = d.get('cards') or []
    for c in cards:
        for k, v in c.items():
            if v is None:
                raise SystemExit('%s : champ %s à null (le format suppose les champs absents)' % (chemin, k))
    champs = ordre_des_champs(cards)
    langues = ordre_des_langues(cards)
    noms, pos = [], {}

    def nom(s):
        if s not in pos:
            pos[s] = len(noms); noms.append(s)
        return pos[s]

    cols = {}
    a_part = jeu in IMAGES_A_PART and 'im' in champs
    images = None
    for k in champs:
        if k == 'n':
            cols['n'] = {l: colonne([nom(c['n'][l]) if l in c.get('n', {}) else None for c in cards]) for l in langues}
        elif k == 'p':
            cols['p'] = colonne([centimes(c['p']) if 'p' in c else None for c in cards])
        elif k == 'im' and a_part:
            images = [c.get('im') for c in cards]
            cols['im'] = colonne([1 if 'im' in c else None for c in cards])
        else:
            cols[k] = colonne([c.get(k) for c in cards])
    out = {k: v for k, v in d.items() if k != 'cards'}
    out.update({'format': 2, 'formatSource': d.get('format'), 'source': chemin, 'nCartes': len(cards),
                'champs': champs, 'prixCentimes': True, 'noms': noms, 'cols': cols})
    fichiers = {}
    if images is not None:
        # Magic : « 8/0/80ade554-… » → « 80ade554-… » (les deux premiers dossiers se déduisent de l'identifiant)
        pref = all(isinstance(x, str) and len(x) > 4 and x[0] == x[4] and x[2] == x[5] and x[1] == '/' and x[3] == '/' for x in images if x is not None)
        # Les plus chères d'abord (même prix que l'appli pour les autres jeux : tendance, sinon prix le plus bas)
        def prix(c):
            p = c.get('p') or []
            v = p[1] if len(p) > 1 and p[1] is not None else (p[0] if p else None)
            return v or 0
        avec = [k for k, x in enumerate(images) if x is not None]
        tete = set(sorted(avec, key=lambda k: (-prix(cards[k]), k))[:TETE]) | mouvements(d, cards)
        parties = []
        for nom_partie, ks in (('tete', sorted(tete)), ('reste', [k for k in avec if k not in tete])):
            d_k, prec = [], -1
            for k in ks:
                d_k.append(k - prec); prec = k
            parties.append((nom_partie, {'format': 2, 'source': chemin, 'generated': d.get('generated'), 'nCartes': len(cards),
                                         'partie': nom_partie, 'prefixe': pref, 'k': d_k,
                                         'v': [images[k][4:] if pref else images[k] for k in ks]}))
        textes = [(n, texte_json(c)) for n, c in parties]
        empreinte = hashlib.sha256(''.join(t for _, t in textes).encode()).hexdigest()[:12]
        out['images'] = []
        for n, t in textes:
            nom_img = '%s-images-%s-%s.json' % (jeu, empreinte, n)
            fichiers[nom_img] = t  # écrits avant la base qui les appelle
            out['images'].append(SORTIE + '/' + nom_img)
    fichiers['%s.json' % jeu] = texte_json(out)
    return fichiers


def texte_json(contenu):
    return json.dumps(contenu, ensure_ascii=False, separators=(',', ':'))


def main():
    racine = sys.argv[1] if len(sys.argv) > 1 else '.'
    os.chdir(racine)
    os.makedirs(SORTIE, exist_ok=True)
    for jeu, chemin in SOURCES.items():
        if not os.path.exists(chemin):
            print(chemin, 'absent'); continue
        fichiers = convertir(jeu, chemin)
        for nom, texte in fichiers.items():
            cible = os.path.join(SORTIE, nom)
            with open(cible + '.tmp', 'w', encoding='utf-8') as f:
                f.write(texte)
            os.replace(cible + '.tmp', cible)
            print('%-40s %6d Ko (source %s, %d Ko)' % (cible, len(texte.encode()) // 1024, chemin, os.path.getsize(chemin) // 1024))
        for vieux in glob.glob(os.path.join(SORTIE, jeu + '-images-*.json')):  # images d'une version précédente
            if os.path.basename(vieux) not in fichiers:
                os.remove(vieux)


if __name__ == '__main__':
    main()
