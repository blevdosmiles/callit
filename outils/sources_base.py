"""Sources de la base de cartes, rangées sous une forme compacte pour vérifier ou refaire les liens avec Cardmarket.

Deux commandes, lancées chaque lundi par .github/workflows/sources.yml (les fichiers de Cardmarket ne se téléchargent
que depuis les machines de GitHub). Les sorties vont dans la release « catalogue » du dépôt, hors du site.

  python3 outils/sources_base.py catalogue singles.json nonsingles.json sortie.json.gz
      Liste publique des produits Pokémon de Cardmarket :
      {cree, cartes: [[idProduct, nom, idExpansion, idMetacard, dateAdded]], autres: [[...]]}

  python3 outils/sources_base.py tcgdex DOSSIER sortie.json.gz
      L'essentiel de chaque carte du dépôt public tcgdex/cards-database (DOSSIER = sa copie locale) :
      {sets: {"en:base2": {id, name, date, cm (extension Cardmarket), count, serie, serieId, reg}},
       cards: [{set, num, name, ill, rar, cat, dex, types, attacks, abilities, cm (liens notés sur la carte),
                variants ([{type, stamp, subtype, cm}] ou {normal, reverse, holo, firstEdition})}]}

Les fichiers de TCGdex sont du TypeScript : ils sont lus comme du texte, jamais exécutés.
"""
import gzip, json, os, re, sys


# ---------- Catalogue Cardmarket ----------
def catalogue(singles, nons, sortie):
    out = {}
    for nom, chemin in (('cartes', singles), ('autres', nons)):
        with open(chemin, encoding='utf-8') as f:
            d = json.load(f)
        out['cree'] = d.get('createdAt') or out.get('cree')
        out[nom] = [[p['idProduct'], p['name'], p.get('idExpansion'), p.get('idMetacard'), p.get('dateAdded')] for p in d['products']]
    if len(out['cartes']) < 10000:
        sys.exit(f'ERREUR : catalogue trop court ({len(out["cartes"])} cartes). Rien enregistré.')
    with gzip.open(sortie, 'wt', encoding='utf-8') as z:
        json.dump(out, z, ensure_ascii=False, separators=(',', ':'))
    print(f'Catalogue Cardmarket du {out["cree"]} : {len(out["cartes"])} cartes, {len(out["autres"])} autres produits')


# ---------- Extrait de TCGdex ----------
def sans_commentaires(t):
    t = re.sub(r'/\*.*?\*/', '', t, flags=re.S)
    return re.sub(r'(?m)^\s*//.*$', '', t)


def bloc_a(t, i):
    """Le texte {...} ou [...] qui commence à la position i (accolades et crochets équilibrés, chaînes ignorées)."""
    ouvre = t[i]
    ferme = ']' if ouvre == '[' else '}'
    prof, q, j = 0, None, i
    while j < len(t):
        ch = t[j]
        if q:
            if ch == '\\':
                j += 2
                continue
            if ch == q:
                q = None
        elif ch in '"\'`':
            q = ch
        elif ch == ouvre:
            prof += 1
        elif ch == ferme:
            prof -= 1
            if prof == 0:
                return t[i:j + 1]
        j += 1
    return None


def bloc(t, cle):
    """Le {...} ou [...] qui suit la première « cle: » du texte."""
    m = re.search(r'\b' + cle + r'\s*:\s*([\[{])', t)
    return bloc_a(t, m.end() - 1) if m else None


CHAINE = r'''(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')'''


def _val(m, a=1):
    s = m.group(a) if m.group(a) is not None else m.group(a + 1)
    return s.replace('\\"', '"').replace("\\'", "'")


def chaine(t, cle):
    m = re.search(r'\b' + cle + r'\s*:\s*' + CHAINE, t or '')
    return _val(m) if m else None


def langues(b):
    d = {}
    for m in re.finditer(r'''(?:^|[\s{,])['"]?([a-z]{2}(?:-[a-z]{2})?)['"]?\s*:\s*''' + CHAINE, b or ''):
        d[m.group(1)] = _val(m, 2)
    return d


def chaines(b):
    return [_val(m) for m in re.finditer(CHAINE, b or '')]


def nombres(b, cle):
    return [int(x) for x in re.findall(r'\b' + cle + r'\s*:\s*(\d+)', b or '')]


def objets(b):
    """Les {...} de premier niveau d'un tableau [...]."""
    out, i = [], 1
    while b and i < len(b):
        if b[i] == '{':
            o = bloc_a(b, i)
            if not o:
                break
            out.append(o)
            i += len(o)
        else:
            i += 1
    return out


def noms_en(b):
    """Noms anglais des attaques ou des talents d'un tableau [{name: {en: ...}}, ...]."""
    out = []
    for o in objets(b or ''):
        n = langues(bloc(o, 'name') or '')
        if n.get('en'):
            out.append(n['en'])
    return out


_series = {}


def serie_id(chemin_set):
    f = os.path.dirname(chemin_set) + '.ts'
    if f not in _series:
        try:
            with open(f, encoding='utf-8') as h:
                _series[f] = chaine(sans_commentaires(h.read()), 'id')
        except OSError:
            _series[f] = None
    return _series[f]


def lire_set(chemin):
    with open(chemin, encoding='utf-8') as f:
        t = sans_commentaires(f.read())
    return {'id': chaine(t, 'id'), 'name': langues(bloc(t, 'name')), 'date': chaine(t, 'releaseDate') or '',
            'cm': (nombres(bloc(t, 'thirdParty'), 'cardmarket') or [None])[0],
            'count': (nombres(bloc(t, 'cardCount'), 'official') or [None])[0],
            'serie': os.path.basename(os.path.dirname(chemin)), 'serieId': serie_id(chemin)}


def lire_carte(t):
    t = sans_commentaires(t)
    vb = bloc(t, 'variants') or ''
    reste = t.replace(vb, '') if vb else t      # pour lire le thirdParty de la carte, pas celui d'une version
    if vb.startswith('['):
        variants = []
        for o in objets(vb):
            v = {'type': chaine(o, 'type') or ''}
            if bloc(o, 'stamp'):
                v['stamp'] = chaines(bloc(o, 'stamp'))
            for cle in ('subtype', 'size', 'foil'):
                if chaine(o, cle):
                    v[cle] = chaine(o, cle)
            ids = nombres(bloc(o, 'thirdParty'), 'cardmarket')
            if ids:
                v['cm'] = ids[0]
            variants.append(v)
    else:
        variants = {k: x == 'true' for k, x in re.findall(r'\b(normal|reverse|holo|firstEdition|wPromo)\s*:\s*(true|false)', vb)}
    return {'name': langues(bloc(t, 'name')), 'ill': chaine(t, 'illustrator') or '', 'rar': chaine(t, 'rarity') or '',
            'cat': chaine(t, 'category') or '', 'dex': [int(x) for x in re.findall(r'\d+', bloc(t, 'dexId') or '')],
            'types': chaines(bloc(t, 'types')), 'attacks': noms_en(bloc(t, 'attacks')), 'abilities': noms_en(bloc(t, 'abilities')),
            'cm': nombres(bloc(reste, 'thirdParty'), 'cardmarket'), 'variants': variants}


def tcgdex(racine, sortie):
    sets, cartes, rates = {}, [], 0
    for reg, base in (('en', 'data'), ('ja', 'data-asia')):
        bdir = os.path.join(racine, base)
        for serie in sorted(os.listdir(bdir)):
            sdir = os.path.join(bdir, serie)
            if not os.path.isdir(sdir):
                continue
            for fichier in sorted(os.listdir(sdir)):
                chemin = os.path.join(sdir, fichier)
                cdir = chemin[:-3]
                if not fichier.endswith('.ts') or not os.path.isdir(cdir):
                    continue
                try:
                    s = lire_set(chemin)
                except (OSError, ValueError, AttributeError):
                    rates += 1
                    continue
                cle = reg + ':' + (s['id'] or fichier[:-3])
                s['reg'] = reg
                sets[cle] = s
                for cf in sorted(os.listdir(cdir)):
                    if not cf.endswith('.ts'):
                        continue
                    try:
                        with open(os.path.join(cdir, cf), encoding='utf-8') as f:
                            c = lire_carte(f.read())
                    except (OSError, ValueError, AttributeError):
                        rates += 1
                        continue
                    c['num'], c['set'] = cf[:-3], cle
                    cartes.append(c)
    if len(cartes) < 20000:
        sys.exit(f'ERREUR : extrait trop court ({len(cartes)} cartes). Rien enregistré.')
    commit = ''
    try:
        with open(os.path.join(racine, '.git', 'HEAD'), encoding='utf-8') as f:
            ref = f.read().strip()
        if ref.startswith('ref: '):
            with open(os.path.join(racine, '.git', ref[5:]), encoding='utf-8') as f:
                commit = f.read().strip()
        else:
            commit = ref
    except OSError:
        pass
    with gzip.open(sortie, 'wt', encoding='utf-8') as z:
        json.dump({'commit': commit, 'sets': sets, 'cards': cartes}, z, ensure_ascii=False, separators=(',', ':'))
    avec = sum(1 for c in cartes if c['cm'] or (isinstance(c['variants'], list) and any(v.get('cm') for v in c['variants'])))
    print(f'TCGdex ({commit[:10] or "version inconnue"}) : {len(sets)} sets, {len(cartes)} cartes dont {avec} avec un lien Cardmarket, {rates} fichiers illisibles')


if __name__ == '__main__':
    a = sys.argv[1:]
    if len(a) == 4 and a[0] == 'catalogue':
        catalogue(a[1], a[2], a[3])
    elif len(a) == 3 and a[0] == 'tcgdex':
        tcgdex(a[1], a[2])
    else:
        sys.exit(__doc__)
