"""Vérifie quelles images de cartes existent vraiment (lancé par GitHub chaque semaine).

Pour chaque carte de data/cards.json :
 - TCGdex : on teste les 6 langues de sa région ; résultat = un chiffre base 36 (un bit par langue).
 - Cartes occidentales sans aucune image TCGdex : on cherche la même carte sur pokemontcg.io (2e source).
   Une image n'est acceptée que si c'est bien la même carte : même espèce (numéro de Pokédex) ou même nom,
   dans une série dont presque toutes les cartes concordent. Le numéro seul ne suffit pas : deux kits de
   démarrage différents ont les mêmes numéros, et on montrait l'image d'une autre carte.
   Si son service ne répond pas, on lit la copie publique de ses fiches (GitHub) ; si elle non plus, on garde les
   images déjà relevées dans les séries connues pour être les mêmes. Les images sont vérifiées une à une.
 - Images connues pour être fausses à la source (liste FAUSSES) : écartées, comme si elles n'existaient pas.
 - Cartes qui restent sans image : celle de la même carte imprimée dans un autre set, quand la règle mesurée plus
   bas dit que le dessin est le même (« alt »). L'appli l'affiche avec une mention sous l'image.
Sortie data/images.json : {"cards": date de data/cards.json, "mask": "…", "ptcg": {"index": "set/numéro"},
                           "alt": {"index de la carte sans image": index de la carte qui prête la sienne}}

Usage :
  python3 outils/verifier_images.py [catalogue]             tout (environ 1 h)
  python3 outils/verifier_images.py --source2 [catalogue]   garde le relevé TCGdex du fichier, refait la 2e source
  python3 outils/verifier_images.py --editions catalogue    garde les deux relevés, refait seulement « alt » (sans réseau)
  python3 outils/verifier_images.py --bilan                 n'écrit rien : ce que les sources annoncent pour les cartes sans image
catalogue = catalogue-cardmarket.json.gz (release « catalogue ») ; sans lui, les liens « alt » du fichier sont gardés.
"""
import collections, gzip, json, os, re, sys, time, unicodedata, urllib.error, urllib.parse, urllib.request
import concurrent.futures as cf

UA = {'User-Agent': 'CallIt-images-check'}
BASE = {'en': ['en', 'fr', 'es', 'it', 'pt', 'de'], 'ja': ['ja', 'zh-tw', 'th', 'id', 'ko', 'zh-cn']}
D36 = '0123456789abcdefghijklmnopqrstuvwxyz'
FICHIER = 'data/images.json'
REPONSES = collections.Counter()  # réponses des serveurs autres que « oui » et « non », essai par essai
MUETTES = [0]                     # adresses restées sans réponse nette après trois essais


# ---------- Réseau ----------
def code(url):
    """Réponse du serveur à une demande d'en-tête : 200, 404… ou le nom de la panne."""
    try:
        return urllib.request.urlopen(urllib.request.Request(url, method='HEAD', headers=UA), timeout=20).status
    except urllib.error.HTTPError as e:
        return e.code
    except Exception as e:
        return type(e).__name__


def reponse(url):
    """L'image existe-t-elle ? True, False pour un refus net (403, 404), None si le serveur ne répond pas nettement.
    Une panne ou un « trop de demandes » est réessayé."""
    for attente in (0, 2, 8):
        if attente:
            if MUETTES[0] > 2000:
                break  # serveur en panne : inutile d'insister, le relevé sera refusé plus bas
            time.sleep(attente)
        r = code(url)
        if r == 200:
            return True
        if r in (403, 404):
            return False
        REPONSES[r] += 1
    MUETTES[0] += 1
    return None


def exists(url):
    return bool(reponse(url))


def lire_json(url, essais=3, pause=5):
    """Une page JSON, ou None si elle n'existe pas ou ne répond pas."""
    for k in range(essais):
        try:
            return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60))
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            REPONSES['api %s' % e.code] += 1
        except Exception as e:
            REPONSES['api ' + type(e).__name__] += 1
        time.sleep(pause * (k + 1))
    return None


# ---------- TCGdex ----------
def tcg(d, c, l):
    s = d['sets'][c['s']]
    return (d['imageBase'].replace('{lang}', l).replace('{serie}', urllib.parse.quote(s['serie']))
            .replace('{set}', urllib.parse.quote(s['id'])).replace('{num}', urllib.parse.quote(c['num'])).replace('high.webp', 'low.webp'))


def releve_tcgdex(d):
    cards = d['cards']
    jobs = [(i, b, l) for i, c in enumerate(cards) for b, l in enumerate(BASE[d['sets'][c['s']]['reg']])]
    mask = [0] * len(cards)
    with cf.ThreadPoolExecutor(64) as ex:
        for (i, b, l), ok in zip(jobs, ex.map(lambda j: exists(tcg(d, cards[j[0]], j[2])), jobs)):
            if ok:
                mask[i] |= 1 << b
    return mask


def lire_masque(texte, n):
    if len(texte) != 2 * n:
        sys.exit('ERREUR : le relevé de %s ne va pas avec data/cards.json. Lancer le contrôle complet.' % FICHIER)
    return [D36.index(texte[2 * i]) * 36 + D36.index(texte[2 * i + 1]) for i in range(n)]


# ---------- Images fausses à la source ----------
# L'adresse répond, mais l'image montre une autre carte que la sienne. Relevé par outils/mesure_editions.py : sur toute
# une suite de numéros, l'image ne ressemble pas à sa jumelle occidentale mais à celle d'une autre carte.
# On fait comme si ces images n'existaient pas : la carte montre alors celle de sa jumelle (« image d'un autre set »).
# La mesure continue de les regarder et dit quand la source est corrigée ; on retire alors la ligne.
FAUSSES = [
    # région, set, du n°, au n°, constaté le
    ('ja', 'M1S', 57, 92, '2026-11-26'),   # Mega Symphonia : à partir de la 057, les images sont rangées dans un autre ordre que les cartes
]


def fausse(d, c):
    """L'image TCGdex de cette carte est-elle connue pour être celle d'une autre carte ?"""
    s = d['sets'][c['s']]
    m = re.match(r'\d+', c['num'])
    return bool(m) and any(s['reg'] == r and s['id'] == sid and a <= int(m.group()) <= b for r, sid, a, b, _ in FAUSSES)


def ecarte_fausses(d, mask):
    """Retire du relevé les images fausses à la source. Rend leur nombre."""
    n = 0
    for i, c in enumerate(d['cards']):
        if mask[i] and fausse(d, c):
            mask[i] = 0
            n += 1
    return n


# ---------- 2e source : pokemontcg.io ----------
API = 'https://api.pokemontcg.io/v2/'
# Copie publique des mêmes fiches, tenue par pokemontcg.io pour la compatibilité (son service doit fermer le
# 1er mars 2027). Lue quand le service ne répond pas ; les images restent vérifiées une à une.
COPIE = 'https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master/'
_dernier = [0.0]
SANS_SERVICE = [0]   # demandes restées sans réponse du service ; à 3, on ne lit plus que la copie
COPIE_LUE = [0]      # fichiers lus dans la copie
# Séries de pokemontcg.io qui sont les mêmes que les nôtres sous un autre identifiant (vérifié carte par carte quand
# pokemontcg.io répond). Une série de même identifiant est aussi « de confiance ». Quand pokemontcg.io est en panne,
# seules les images déjà relevées dans ces séries sont gardées.
PISTES = {'exu': ['ex10'], 'cel25cc': ['cel25c'], 'hgssp': ['hsp'], 'bog': ['bp'], 'sm7.5': ['sm75'], 'swsh4.5sv': ['swsh45sv'],
          'swsh12.5gg': ['swsh12pt5gg'], '2011bw': ['mcd11'], '2012bw': ['mcd12'], '2014xy': ['mcd14'], '2015xy': ['mcd15'],
          '2016xy': ['mcd16'], '2017sm': ['mcd17'], '2018sm': ['mcd18'], '2019sm': ['mcd19'], '2021swsh': ['mcd21'],
          '2022swsh': ['mcd22'], '2023sv': ['mcd23'], '2024sv': ['mcd24'], '30th-c': ['30thc', 'cc30'],
          'tk-ex-latia': ['tk1a'], 'tk-ex-latio': ['tk1b'], 'tk-ex-p': ['tk2a'], 'tk-ex-m': ['tk2b']}


def de_confiance(s, sid):
    return sid == s['id'] or sid in PISTES.get(s['id'], [])


def norm(t):
    t = unicodedata.normalize('NFKD', (t or '').replace('&', 'and')).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]', '', t)


def api(chemin):
    """pokemontcg.io sans clé : 30 demandes par minute. On en fait une toutes les 2,2 secondes.
    Après 3 demandes sans réponse, on ne le demande plus de tout le lancement : la copie prend le relais
    (un service qui ne répond que par moments coûtait plusieurs minutes par série)."""
    if SANS_SERVICE[0] >= 3:
        return None
    attente = _dernier[0] + 2.2 - time.time()
    if attente > 0:
        time.sleep(attente)
    j = lire_json(API + chemin, essais=2, pause=10)
    _dernier[0] = time.time()
    if not j:
        SANS_SERVICE[0] += 1
    return j


def copie(chemin):
    """Un fichier de la copie publique, ou None s'il n'existe pas ou ne répond pas."""
    j = lire_json(COPIE + chemin, essais=2, pause=5)
    if j is not None:
        COPIE_LUE[0] += 1
    return j


def series_ptcg():
    j = api('sets?pageSize=250')
    if j and j.get('data'):
        return j['data']
    j = copie('sets/en.json')
    return j if isinstance(j, list) and j else None


def fiche(p):
    """Une carte de pokemontcg.io telle qu'on la compare : numéro, nom, espèces, illustrateur, chemin de l'image."""
    m = re.match(r'https://images\.pokemontcg\.io/([A-Za-z0-9.]+/[A-Za-z0-9_?!%.-]+?)\.png$', (p.get('images') or {}).get('small') or '')
    if m and not m.group(1).endswith('_hires'):
        return {'num': str(p.get('number') or ''), 'name': p.get('name') or '', 'dex': p.get('nationalPokedexNumbers') or [],
                'art': p.get('artist') or '', 'path': m.group(1)}
    return None


def cartes_service(sid):
    """Les cartes d'une série, demandées au service (250 par page). None s'il ne répond pas."""
    out, page = [], 1
    while True:
        j = api('cards?q=set.id:%s&select=id,name,number,artist,nationalPokedexNumbers,images&pageSize=250&page=%d' % (urllib.parse.quote(sid), page))
        if not j or 'data' not in j:
            return None
        if not j['data']:
            return out
        out += [p for p in j['data']]
        if len(j['data']) < 250:
            return out
        page += 1


_cartes = {}


def cartes_ptcg(sid):
    """Les cartes d'une série de pokemontcg.io (le service, sinon sa copie). None si les deux sont en panne : on ne
    retient rien, pour ne pas croire la série vide."""
    if sid in _cartes:
        return _cartes[sid]
    brutes = cartes_service(sid)
    if brutes is None:
        brutes = copie('cards/en/%s.json' % urllib.parse.quote(sid))
        if not isinstance(brutes, list):
            return None
    out = [f for f in map(fiche, brutes) if f]
    _cartes[sid] = out
    return out


def variantes(n):
    """Les écritures possibles d'un numéro : 003 → 3, H03 → H3."""
    a = re.sub(r'^0+(?=\d)', '', n)
    b = re.sub(r'^([A-Za-z]+)0+(?=\d)', r'\1', a)
    out = []
    for x in (n, a, b):
        if x not in out:
            out.append(x)
    return out


def sans_basic(t):
    """« basicgrassenergy » → « grassenergy » : depuis Écarlate et Violet, le mot « Basic » est imprimé sur les Énergies
    de base, et pokemontcg.io l'écrit dans le nom ; notre base, non."""
    return t[5:] if t.startswith('basic') and t.endswith('energy') else t


def meme(c, p):
    """La carte p de pokemontcg.io est-elle notre carte c ? L'espèce pour un Pokémon, sinon le nom anglais."""
    if c.get('dex') and p['dex']:
        return c['dex'] in p['dex']
    en = c['n'].get('en')
    return bool(en) and sans_basic(norm(en)) == sans_basic(norm(p['name']))


def au_numero(c, par_num):
    for v in variantes(c['num']):
        if v in par_num:
            return par_num[v]
    return None


def jours(a, b):
    try:
        ta, tb = (time.mktime(time.strptime(x.replace('/', '-')[:10], '%Y-%m-%d')) for x in (a, b))
        return abs(ta - tb) / 86400
    except Exception:
        return 1e9


def candidates(s, series):
    """Séries de pokemontcg.io à essayer pour notre série : pistes, même nom, sortie à 45 jours près."""
    out, sures = [], set()
    connues = {p['id'] for p in series}
    for sid in [s['id']] + PISTES.get(s['id'], []):
        if sid in connues and sid not in out:
            out.append(sid); sures.add(sid)
    n = norm(s['name'].get('en'))
    for p in series:
        if n and norm(p.get('name')) == n and p['id'] not in out:
            out.append(p['id']); sures.add(p['id'])
    for p in series:
        if p['id'] not in out and jours(s.get('date') or '', p.get('releaseDate') or '') <= 45:
            out.append(p['id'])
    return out, sures


def apparier(notres, pc, sure, ills):
    """Nos cartes (index → carte) retrouvées dans une série de pokemontcg.io, ou {} si la série n'est pas la même.

    1. Au même numéro : il faut au moins 3 cartes comparables (ou toute une série sûre) et 80 % de cartes identiques.
    2. Série sûre (même nom) mais numérotée autrement : chaque carte par son espèce ou son nom, départagée par
       l'illustrateur, si une seule convient ; il faut retrouver 80 % de la série.
    """
    par_num = {}
    for p in pc:
        par_num.setdefault(p['num'], p)
        par_num.setdefault(p['path'].split('/', 1)[1], p)
    comparables = [(i, c, au_numero(c, par_num)) for i, c in notres.items()]
    comparables = [x for x in comparables if x[2]]
    bonnes = {i: p for i, c, p in comparables if meme(c, p)}
    if len(comparables) >= (min(3, len(notres)) if sure else 3) and len(bonnes) >= 0.8 * len(comparables):
        return bonnes, 'numéro : %d sur %d' % (len(bonnes), len(comparables))
    refus = 'numéro : %d sur %d' % (len(bonnes), len(comparables))
    if not sure:
        return {}, refus
    trouvees = {}
    for i, c in notres.items():
        m = [p for p in pc if meme(c, p)]
        ill = norm(ills[c['i']]) if c.get('i') is not None else ''
        if len(m) > 1 and ill:
            m = [p for p in m if norm(p['art']) == ill]
        if len(m) == 1:
            trouvees[i] = m[0]
    if len(trouvees) >= 0.8 * len(notres) and len(set(p['path'] for p in trouvees.values())) == len(trouvees):
        return trouvees, 'identité : %d sur %d' % (len(trouvees), len(notres))
    return {}, refus + ', identité : %d sur %d' % (len(trouvees), len(notres))


def seconde_source(d, mask, ancien):
    cards, sets = d['cards'], d['sets']
    vieux = ancien.get('ptcg') or {}

    def gardee(i, pannes=None):
        """L'image du relevé précédent, si elle vient d'une série de confiance (et, si on le précise, d'une série en panne)."""
        v = vieux.get(str(i))
        sid = v.split('/')[0] if v else None
        return v if v and i < len(mask) and not mask[i] and de_confiance(sets[cards[i]['s']], sid) and (pannes is None or sid in pannes) else None

    series = series_ptcg()
    if not series:
        garde = {str(i): gardee(i) for i in range(len(cards)) if gardee(i)}
        print('pokemontcg.io et sa copie ne répondent pas : %d images gardées du relevé précédent, %d écartées (série pas sûre ou image TCGdex arrivée)' % (len(garde), len(vieux) - len(garde)))
        return garde
    par_serie = collections.defaultdict(dict)
    for i, c in enumerate(cards):
        par_serie[c['s']][i] = c
    ptcg = {}
    for si, notres in par_serie.items():
        s = sets[si]
        sans = [i for i in notres if not mask[i]]
        if s['reg'] != 'en' or not sans:
            continue
        cands, sures = candidates(s, series)
        notes, reste, pannes = [], set(sans), set()
        for sid in cands:
            if not reste:
                break
            pc = cartes_ptcg(sid)
            if pc is None:
                pannes.add(sid); notes.append('%s en panne' % sid)
                continue
            if not pc:
                continue
            paires, note = apparier(notres, pc, sid in sures, d['ills'])
            notes.append('%s %s (%s)' % (sid, 'retenue' if paires else 'écartée', note))
            for i in sorted(reste & set(paires)):
                r = reponse('https://images.pokemontcg.io/' + paires[i]['path'] + '.png')
                # Le serveur d'images ne répond pas nettement : l'image du relevé précédent reste, si c'était la même.
                if r or (r is None and vieux.get(str(i)) == paires[i]['path']):
                    ptcg[str(i)] = paires[i]['path']
                    reste.discard(i)
        for i in sorted(reste):
            if gardee(i, pannes):
                ptcg[str(i)] = gardee(i, pannes)
                reste.discard(i)
        print('%-12s %3d sans image TCGdex, %3d trouvées | %s' % (s['id'], len(sans), len(sans) - len(reste), ' ; '.join(notes) or 'aucune série candidate'))
    return ptcg


# ---------- Image d'un autre set ----------
# Une carte sans image peut montrer celle de la même carte imprimée dans un autre set : même fiche Cardmarket (même nom,
# mêmes attaques) et même illustrateur. Cela ne suffit pas. Mesuré image contre image sur 38 000 paires de cartes qui
# ont toutes deux leur image (outils/mesure_editions.py, 26/11/2026) : une paire sur quinze n'a pas le même dessin
# (promos, versions dorées ou full art, rééditions redessinées comme Évolutions ou L'Appel des Légendes).
# La règle ne garde que les cas où la mesure trouve le même dessin plus de 999 fois sur 1 000 :
#  - ni promo d'un côté ni de l'autre ;
#  - la fiche n'a, pour cet illustrateur, qu'une carte par set (sinon on ne sait pas laquelle est laquelle) ;
#  - les deux sets sont jumeaux : assez de cartes les relient ainsi une à une (le « soutien ») ;
#  - même génération de cartes, ou deux générations où la mesure trouve les mêmes cartes ;
#  - même espèce ; version ordinaire avec version ordinaire, version spéciale avec version spéciale.
ORDINAIRES = {'Common', 'Uncommon', 'Rare', 'Holo Rare', 'Rare Holo', 'Double rare', 'Triple Rare', 'Holo Rare V', 'Holo Rare VMAX',
              'Holo Rare VSTAR', 'Rare Holo LV.X', 'Rare PRIME', 'LEGEND', 'ACE SPEC Rare', 'Radiant Rare', 'Classic Collection'}
SPECIALES = {'Illustration rare', 'Special illustration rare', 'Character Rare', 'Character Super Rare', 'Full Art Trainer', 'Ultra Rare',
             'Secret Rare', 'Hyper rare', 'Shiny rare', 'Shiny Ultra Rare', 'Shiny rare V', 'Shiny rare VMAX', 'Mega Hyper Rare',
             'Mega Attack Rare', 'Black White Rare', 'RGB Rare', 'Futuristic Rare', 'Pikachu Rare', 'Amazing Rare'}
# Générations de cartes : les séries japonaises et occidentales d'une même époque
BLOCS = {'SV': 'sv', 'S': 'swsh', 'SM': 'sm', 'M': 'me', 'XY': 'xy', 'BW': 'bw', 'PCG': 'ex', 'ADV': 'ex', 'e': 'ecard', 'PMCG': 'base', 'gym': 'base'}
# Deux générations qui se prêtent leurs images : les sets Méga-Évolution reprennent des cartes Écarlate et Violet
# (mesuré : 103 mêmes dessins sur 103). Partout ailleurs la mesure est mauvaise (XY et Set de Base : 12 % d'autres dessins).
VOISINS = [{'sv', 'me'}]
SOUTIEN_REGIONS, SOUTIEN_MEME_REGION = 10, 20   # liens entre deux sets : japonais et occidental (0 erreur sur 455 de 10 à 19), même région
PETIT_SET = (8, 0.6)                            # ou 8 liens qui couvrent 60 % du plus petit des deux sets


def fiches(chemin):
    """Le catalogue Cardmarket : numéro de produit → numéro de fiche (« même nom, mêmes attaques »)."""
    with gzip.open(chemin, 'rt', encoding='utf-8') as f:
        return {p[0]: p[3] for p in json.load(f)['cartes'] if p[3]}


def regle_editions(d, fiche):
    """Prépare la règle. Rend donneur(i, a_image) : le rang de la carte qui prête son image à la carte i, ou None."""
    cards, sets = d['cards'], d['sets']
    n = len(cards)
    ills = [norm(x) for x in d['ills']]
    S = [c['s'] for c in cards]
    reg = [sets[s]['reg'] for s in S]
    bloc = [BLOCS.get(sets[s].get('serie'), sets[s].get('serie') or sets[s]['id']) for s in S]
    rar = [d['rars'][c['r']] if c.get('r') is not None else None for c in cards]
    set_promo = [bool(re.search('promo|プロモ', ' '.join(str(x) for x in s['name'].values()), re.I)) for s in sets]
    promo = [set_promo[S[i]] or rar[i] == 'Promo' for i in range(n)]
    classe = ['o' if r in ORDINAIRES else 's' if r in SPECIALES else '' for r in rar]   # '' : rareté inconnue
    cle = [(fiche.get(c.get('cm')), ills[c['i']] if c.get('i') is not None else '') for c in cards]
    groupes = collections.defaultdict(list)
    for i in range(n):
        if cle[i][0] and cle[i][1]:
            groupes[cle[i]].append(i)
    liables = collections.Counter(S[i] for g in groupes.values() for i in g)
    for k in [k for k, g in groupes.items() if len({S[i] for i in g}) < len(g)]:
        del groupes[k]
    soutien = collections.Counter((S[a], S[b]) for g in groupes.values() for a in g for b in g if a != b)
    # fiche qui existe en version ordinaire et en version spéciale : il faut connaître la rareté des deux cartes
    mixtes = {k for k, g in groupes.items() if {classe[i] for i in g} >= {'o', 's'}}

    def jumeaux(i, j):
        k = soutien[(S[i], S[j])]
        return k >= (SOUTIEN_REGIONS if reg[i] != reg[j] else SOUTIEN_MEME_REGION) or (
            k >= PETIT_SET[0] and k >= PETIT_SET[1] * min(liables[S[i]], liables[S[j]]))

    def memes_versions(i, j):
        if cle[i] in mixtes:
            return bool(classe[i]) and classe[i] == classe[j]
        return classe[i] == classe[j] or not classe[i] or not classe[j]

    def donneur(i, a_image):
        if promo[i] or cle[i] not in groupes:
            return None
        dex = cards[i].get('dex')
        ok = [j for j in groupes[cle[i]] if j != i and a_image(j) and not promo[j]
              and (bloc[i] == bloc[j] or {bloc[i], bloc[j]} in VOISINS)
              and (not dex or not cards[j].get('dex') or dex == cards[j]['dex'])
              and memes_versions(i, j) and jumeaux(i, j)]
        # le set le plus lié d'abord, puis la même rareté
        return min(ok, key=lambda j: (-soutien[(S[i], S[j])], rar[i] != rar[j], j)) if ok else None
    return donneur


def editions(d, a_image, fiche):
    """{rang d'une carte sans image : rang de la carte qui lui prête la sienne}. a_image : une liste de vrai/faux."""
    donneur = regle_editions(d, fiche)
    out = {}
    for i in range(len(d['cards'])):
        if not a_image[i]:
            j = donneur(i, a_image.__getitem__)
            if j is not None:
                out[str(i)] = j
    return out


def liens_editions(d, a_image, ancien, catalogue):
    """Les liens « alt » à écrire. Sans catalogue lisible, on garde ceux du relevé précédent qui tiennent encore."""
    n = len(d['cards'])
    fiche = None
    if catalogue and os.path.exists(catalogue):
        try:
            fiche = fiches(catalogue)
        except Exception as e:
            print('catalogue Cardmarket illisible (%s)' % type(e).__name__)
    relies = sum(1 for c in d['cards'] if fiche and c.get('cm') in fiche)
    if fiche and relies >= 0.5 * sum(1 for c in d['cards'] if c.get('cm')):
        alt = editions(d, a_image, fiche)
        par = collections.Counter(d['sets'][d['cards'][int(i)]['s']]['id'] + ' ← ' + d['sets'][d['cards'][j]['s']]['id'] for i, j in alt.items())
        print('image d’un autre set : %d cartes | %s' % (len(alt), ', '.join('%s %d' % x for x in par.most_common(12))))
        return alt
    vieux = (ancien.get('alt') or {}) if ancien.get('cards') == d['generated'] else {}
    alt = {i: j for i, j in vieux.items() if int(i) < n and 0 <= j < n and not a_image[int(i)] and a_image[j]}
    print('image d’un autre set : catalogue Cardmarket absent ou incomplet, %d liens gardés du relevé précédent, %d écartés' % (len(alt), len(vieux) - len(alt)))
    return alt


# ---------- Rééditions : une carte réimprimée avec le dessin d'une carte d'origine ----------
# Collection Classique du 30e anniversaire (30th-c, sortie le 16/09/2026) : TCGdex n'a aucune image (vérifié le
# 28/11/2026 : 0 sur 30 en anglais, français, allemand, italien, espagnol et portugais) et pokemontcg.io (set me55c)
# ne renvoie que vers les images de Scrydex, service payant que nous n'utilisons pas. Chaque carte reprend le dessin
# d'une carte d'origine, au numéro d'origine (numéros relevés dans la copie publique de pokemontcg.io) : on montre
# l'image de celle-ci, avec la mention « image d'un autre set ». Un lien n'est gardé que si, dans notre base, la carte
# d'origine a le même illustrateur et la même espèce (ou le même nom anglais) ; sinon le contrôle l'écrit.
REEDITIONS = {
    '30th-c': {'001': ('base1', '4'), '002': ('ex1', '5'), '003': ('ex11', '11'), '004': ('bw10', '11'), '005': ('gym1', '18'),
               '006': ('ex7', '19'), '007': ('neo1', '25'), '008': ('sm9', '33'), '009': ('xy9', '41'), '010': ('dp6', '43'),
               '011': ('pl1', '47'), '012': ('swsh4', '50'), '013': ('sm4', '57'), '014': ('base1', '58'), '015': ('gym2', '69'),
               '016': ('bw6', '85'), '017': ('sm1', '89'), '018': ('hgss4', '94'), '019': ('hgss4', '99'), '020': ('hgss4', '100'),
               '021': ('bw3', '101'), '022': ('dp4', '106'), '023': ('xy5', '106'), '024': ('neo4', '106'), '025': ('ex10', '108'),
               '026': ('swsh8', '114'), '027': ('swsh9', '123'), '028': ('swsh1', '138'), '029': ('ecard2', '149'), '030': ('sv02', '203')},
}


def liens_reeditions(d, a_image):
    """{rang d'une réédition sans image : rang de la carte d'origine}, seulement si l'origine est bien la même carte."""
    cards, sets = d['cards'], d['sets']
    rang = {(sets[c['s']]['reg'], sets[c['s']]['id'], c['num']): i for i, c in enumerate(cards)}
    out, refus = {}, []
    for i, c in enumerate(cards):
        s = sets[c['s']]
        o = REEDITIONS.get(s['id'], {}).get(c['num']) if s['reg'] == 'en' else None
        if not o or a_image[i]:
            continue
        j = rang.get(('en',) + o)
        oc = cards[j] if j is not None else None
        meme_carte = oc is not None and c.get('i') is not None and oc.get('i') == c.get('i') and (
            (c.get('dex') and c['dex'] == oc.get('dex')) or norm(c['n'].get('en')) == norm(oc['n'].get('en')))
        if meme_carte and a_image[j]:
            out[str(i)] = j
        else:
            refus.append('%s %s' % (s['id'], c['num']))
    print('rééditions : %d cartes montrent l’image de leur carte d’origine%s' % (len(out), ' ; refusées : ' + ', '.join(refus) if refus else ''))
    return out


# ---------- Bilan : pourquoi ces cartes n'ont-elles pas d'image ? ----------
def bilan(d, mask, ptcg):
    cards, sets = d['cards'], d['sets']
    sans = [i for i in range(len(cards)) if not mask[i] and str(i) not in ptcg]
    par = collections.defaultdict(list)
    for i in sans:
        par[cards[i]['s']].append(i)
    print('cartes sans image : %d dans %d séries' % (len(sans), len(par)))

    # A. Ce que l'API de TCGdex annonce, série par série et langue par langue
    def lire(job):
        si, l = job
        j = lire_json('https://api.tcgdex.net/v2/%s/sets/%s' % (l, urllib.parse.quote(sets[si]['id'])), essais=2, pause=3)
        return {str(c.get('localId')): c.get('image') for c in j['cards']} if j and isinstance(j.get('cards'), list) else None
    jobs = [(si, l) for si in par for l in BASE[sets[si]['reg']]]
    vues = {}
    with cf.ThreadPoolExecutor(6) as ex:
        for job, r in zip(jobs, ex.map(lire, jobs)):
            vues[job] = r
    annoncees = []
    print('\nA. API de TCGdex (langue : cartes listées / avec image) ; « annoncées » = sans image chez nous mais avec image selon TCGdex')
    for si in sorted(par, key=lambda k: -len(par[k])):
        s = sets[si]
        bouts, ann = [], []
        for l in BASE[s['reg']]:
            v = vues.get((si, l))
            if v is None:
                continue
            bouts.append('%s %d/%d' % (l, len(v), sum(1 for x in v.values() if x)))
            for i in par[si]:
                img = v.get(cards[i]['num'])
                if img:
                    ann.append((i, l, img))
        annoncees += ann
        print('%-3s %-12s %4d sans image sur %4d | %s%s' % (s['reg'], s['id'], len(par[si]), sum(1 for c in cards if c['s'] == si),
                                                           ' ; '.join(bouts) or 'série inconnue de l’API',
                                                           ' | ANNONCÉES : %d, ex. %s' % (len(ann), ann[0][2]) if ann else ''))
    print('images annoncées par TCGdex pour des cartes que nous donnons sans image : %d' % len(annoncees))
    for i, l, img in annoncees[:40]:
        notre = tcg(d, cards[i], l)
        print('   %s | la nôtre : %s | TCGdex : %s → %s | la nôtre → %s' % (cards[i]['num'], notre, img, code(img + '/low.webp'), code(notre)))

    # B. Réponses des serveurs d'images pour les cartes sans image, dans leur première langue
    def premiere(i):
        c = cards[i]
        ls = BASE[sets[c['s']]['reg']]
        return tcg(d, c, next((l for l in ls if l in c['n']), ls[0]))
    rep = collections.Counter()
    with cf.ThreadPoolExecutor(32) as ex:
        for r in ex.map(lambda i: code(premiere(i)), sans):
            rep[r] += 1
    print('\nB. Réponses de assets.tcgdex.net pour ces %d cartes : %s' % (len(sans), dict(rep)))

    # C. pokemontcg.io : les séries qu'il connaît
    series = series_ptcg()
    print('\nC. pokemontcg.io : %s séries' % (len(series) if series else 'pas de réponse, 0'))
    for p in sorted(series or [], key=lambda p: p.get('releaseDate') or ''):
        print('   %-12s %-10s %4s cartes | %s' % (p['id'], p.get('releaseDate'), p.get('total'), p.get('name')))


# ---------- Programme ----------
def main():
    args = sys.argv[1:]
    mode = args[0] if args and args[0].startswith('--') else ''
    catalogue = next((a for a in args if not a.startswith('--')), None)
    if mode not in ('', '--source2', '--bilan', '--editions') or (mode == '--editions' and not catalogue):
        sys.exit(__doc__)
    d = json.load(open('data/cards.json', encoding='utf-8'))
    try:
        ancien = json.load(open(FICHIER))
    except Exception:
        ancien = {}
    if mode:
        if ancien.get('cards') != d['generated']:
            sys.exit('ERREUR : %s ne correspond pas à data/cards.json. Lancer le contrôle complet.' % FICHIER)
        mask = lire_masque(ancien['mask'], len(d['cards']))
    else:
        mask = releve_tcgdex(d)
        if MUETTES[0] > 0.01 * 6 * len(mask):
            sys.exit('ERREUR : %d adresses de TCGdex sans réponse nette (%s). Rien enregistré.' % (MUETTES[0], dict(REPONSES)))
    ecartees = ecarte_fausses(d, mask)
    print('cartes sans aucune image TCGdex :', sum(1 for m in mask if not m), 'sur', len(mask), '(dont %d images écartées car fausses à la source)' % ecartees)
    if mode == '--bilan':
        bilan(d, mask, ancien.get('ptcg') or {})
        print('\nréponses inattendues :', dict(REPONSES))
        return
    if mode == '--editions':
        ptcg = ancien.get('ptcg') or {}
    else:
        ptcg = seconde_source(d, mask, ancien)
        print('images retenues sur pokemontcg.io :', len(ptcg), '(relevé précédent : %d)' % len(ancien.get('ptcg') or {}),
              '; fichiers lus dans sa copie publique : %d' % COPIE_LUE[0] if COPIE_LUE[0] else '')
        print('réponses inattendues des serveurs :', dict(REPONSES))
    a_image = [bool(mask[i]) or str(i) in ptcg for i in range(len(mask))]
    alt = liens_editions(d, a_image, ancien, catalogue)
    alt.update({k: v for k, v in liens_reeditions(d, a_image).items() if k not in alt})
    print('cartes sans aucune image : %d ; avec l’image d’un autre set : %d ; restent sans image : %d' % (a_image.count(False), len(alt), a_image.count(False) - len(alt)))
    out = {'cards': d['generated'], 'ptcg': ptcg, 'alt': alt, 'mask': ''.join(D36[m // 36] + D36[m % 36] for m in mask)}
    json.dump(out, open(FICHIER, 'w'), separators=(',', ':'))
    print('ok')


if __name__ == '__main__':
    main()
