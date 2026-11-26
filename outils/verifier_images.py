"""Vérifie quelles images de cartes existent vraiment (lancé par GitHub chaque semaine).

Pour chaque carte de data/cards.json :
 - TCGdex : on teste les 6 langues de sa région ; résultat = un chiffre base 36 (un bit par langue).
 - Cartes occidentales sans aucune image TCGdex : on cherche la même carte sur pokemontcg.io (2e source).
   Une image n'est acceptée que si c'est bien la même carte : même espèce (numéro de Pokédex) ou même nom,
   dans une série dont presque toutes les cartes concordent. Le numéro seul ne suffit pas : deux kits de
   démarrage différents ont les mêmes numéros, et on montrait l'image d'une autre carte.
Sortie data/images.json : {"cards": date de data/cards.json, "mask": "…", "ptcg": {"index": "set/numéro"}, "v": 2}

Usage :
  python3 outils/verifier_images.py             tout (environ 1 h)
  python3 outils/verifier_images.py --source2   garde le relevé TCGdex du fichier, refait seulement la 2e source
  python3 outils/verifier_images.py --bilan     n'écrit rien : ce que les sources annoncent pour les cartes sans image
"""
import collections, json, re, sys, time, unicodedata, urllib.error, urllib.parse, urllib.request
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


def exists(url):
    """L'image existe-t-elle ? Un refus net (403, 404) vaut non ; une panne ou un « trop de demandes » est réessayé."""
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
    return False


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


# ---------- 2e source : pokemontcg.io ----------
API = 'https://api.pokemontcg.io/v2/'
_dernier = [0.0]
# Séries dont ni le nom ni la date ne mènent à la bonne série de pokemontcg.io. Ce ne sont que des pistes :
# chacune est vérifiée carte par carte avant d'être retenue.
PISTES = {'exu': ['ex10'], 'cel25cc': ['cel25c'], 'sve': ['sve'], 'svp': ['svp'], 'mep': ['mep'], 'mee': ['mee'],
          'swshp': ['swshp'], 'hgssp': ['hsp'], 'xya': ['xya'], 'bog': ['bp'], 'sm7.5': ['sm75'], 'swsh4.5sv': ['swsh45sv'],
          'swsh12.5gg': ['swsh12pt5gg'], '2011bw': ['mcd11'], '2012bw': ['mcd12'], '2014xy': ['mcd14'], '2015xy': ['mcd15'],
          '2016xy': ['mcd16'], '2017sm': ['mcd17'], '2018sm': ['mcd18'], '2019sm': ['mcd19'], '2021swsh': ['mcd21'],
          '2022swsh': ['mcd22'], '2023sv': ['mcd23'], '2024sv': ['mcd24'], '30th-c': ['30thc', 'cc30'], '30th': ['30th']}


def norm(t):
    t = unicodedata.normalize('NFKD', (t or '').replace('&', 'and')).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]', '', t)


def api(chemin):
    """pokemontcg.io sans clé : 30 demandes par minute. On en fait une toutes les 2,2 secondes."""
    attente = _dernier[0] + 2.2 - time.time()
    if attente > 0:
        time.sleep(attente)
    j = lire_json(API + chemin, essais=3, pause=20)
    _dernier[0] = time.time()
    return j


def series_ptcg():
    j = api('sets?pageSize=250')
    return j['data'] if j and j.get('data') else None


_cartes = {}


def cartes_ptcg(sid):
    """Les cartes d'une série de pokemontcg.io : numéro, nom, espèces, illustrateur, chemin de l'image."""
    if sid in _cartes:
        return _cartes[sid]
    out, page = [], 1
    while True:
        j = api('cards?q=set.id:%s&select=id,name,number,artist,nationalPokedexNumbers,images&pageSize=250&page=%d' % (urllib.parse.quote(sid), page))
        if not j or not j.get('data'):
            break
        for p in j['data']:
            m = re.match(r'https://images\.pokemontcg\.io/([A-Za-z0-9.]+/[A-Za-z0-9_?!%.-]+?)\.png$', (p.get('images') or {}).get('small') or '')
            if m and not m.group(1).endswith('_hires'):
                out.append({'num': str(p.get('number') or ''), 'name': p.get('name') or '', 'dex': p.get('nationalPokedexNumbers') or [],
                            'art': p.get('artist') or '', 'path': m.group(1)})
        if len(j['data']) < 250:
            break
        page += 1
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


def meme(c, p):
    """La carte p de pokemontcg.io est-elle notre carte c ? L'espèce pour un Pokémon, sinon le nom anglais."""
    if c.get('dex') and p['dex']:
        return c['dex'] in p['dex']
    en = c['n'].get('en')
    return bool(en) and norm(en) == norm(p['name'])


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
    for sid in PISTES.get(s['id'], []) + [s['id']]:
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
    series = series_ptcg()
    if not series:
        garde = {k: v for k, v in (ancien.get('ptcg') or {}).items() if ancien.get('v') == 2 and int(k) < len(mask) and not mask[int(k)]}
        print('pokemontcg.io ne répond pas : %d images gardées du relevé précédent' % len(garde))
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
        notes, reste = [], set(sans)
        for sid in cands:
            if not reste:
                break
            pc = cartes_ptcg(sid)
            if not pc:
                continue
            paires, note = apparier(notres, pc, sid in sures, d['ills'])
            notes.append('%s %s (%s)' % (sid, 'retenue' if paires else 'écartée', note))
            for i in sorted(reste & set(paires)):
                if exists('https://images.pokemontcg.io/' + paires[i]['path'] + '.png'):
                    ptcg[str(i)] = paires[i]['path']
                    reste.discard(i)
        print('%-12s %3d sans image TCGdex, %3d trouvées | %s' % (s['id'], len(sans), len(sans) - len(reste), ' ; '.join(notes) or 'aucune série candidate'))
    return ptcg


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
    mode = sys.argv[1] if len(sys.argv) > 1 else ''
    if mode not in ('', '--source2', '--bilan'):
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
    print('cartes sans aucune image TCGdex :', sum(1 for m in mask if not m), 'sur', len(mask))
    if mode == '--bilan':
        bilan(d, mask, ancien.get('ptcg') or {})
        print('\nréponses inattendues :', dict(REPONSES))
        return
    ptcg = seconde_source(d, mask, ancien)
    print('images retenues sur pokemontcg.io :', len(ptcg), '(relevé précédent : %d)' % len(ancien.get('ptcg') or {}))
    print('réponses inattendues des serveurs :', dict(REPONSES))
    out = {'cards': d['generated'], 'ptcg': ptcg, 'v': 2, 'mask': ''.join(D36[m // 36] + D36[m % 36] for m in mask)}
    json.dump(out, open(FICHIER, 'w'), separators=(',', ':'))
    print('ok')


if __name__ == '__main__':
    main()
