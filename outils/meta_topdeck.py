"""Méta Magic et Yu-Gi-Oh! (visage « Joueur ») : decks les plus joués en tournoi sur 30 jours.

Source : API gratuite de TopDeck.gg (https://topdeck.gg/docs/tournaments-v2). Une clé est nécessaire :
elle est rangée dans les secrets GitHub du dépôt (TOPDECK_KEY) et n'apparaît jamais dans le code public.
Conditions : citer « TopDeck.gg » avec un lien là où les données s'affichent (fait dans l'appli),
ne pas revendre les données. On ne garde aucun nom de joueur : seulement les listes et les bilans par deck.
Un seul appel par format et par jour (POST /v2/tournaments, tournois terminés des 30 derniers jours).
Sortie : data/meta/mtg.json et data/meta/ygo.json (voir outils/meta_commun.py).
Usage : TOPDECK_KEY=... python3 outils/meta_topdeck.py [mtg] [ygo]
"""
import collections, datetime, os, re, sys, time
from meta_commun import get, load_game, name_index, norm_name, write

API = 'https://topdeck.gg/api/v2/tournaments'
DAYS, MIN_PLAYERS = 30, 16
GAMES = {
    'mtg': {'game': 'Magic: The Gathering', 'formats': ['Standard'], 'label': 'Standard'},
    'ygo': {'game': 'Yu-Gi-Oh!', 'formats': ['Advanced', 'TCG'], 'label': 'Avancé (TCG)'},
}
SECTION = {'mainboard': 'm', 'main': 'm', 'main deck': 'm', 'maindeck': 'm', 'deck': 'm', 'monsters': 'm', 'spells': 'm', 'traps': 'm',
           'extra': 'x', 'extra deck': 'x', 'extradeck': 'x', 'sideboard': 'r', 'side': 'r', 'side deck': 'r', 'sidedeck': 'r',
           'companion': 'r', 'commanders': 'm', 'commander': 'm'}
KEY = os.environ.get('TOPDECK_KEY', '').strip()


def parse_text(txt):
    """Liste en texte (« ~~Mainboard~~ » puis « 4 Nom de la carte ») → [(nb, nom, partie)]."""
    out, part = [], 'm'
    for line in str(txt or '').splitlines():
        line = line.strip()
        if not line: continue
        h = re.match(r'^~*\s*([A-Za-z ]+?)\s*~*\s*:?\s*(\(\d+\))?$', line)
        if h and h.group(1).strip().lower() in SECTION: part = SECTION[h.group(1).strip().lower()]; continue
        m = re.match(r'^(\d+)\s*x?\s+(.+?)\s*(\([A-Z0-9]+\)\s*[\w-]+)?$', line)
        if m: out.append((int(m.group(1)), m.group(2).strip(), part))
    return out


def parse_obj(obj):
    """deckObj (structure TopDeck) → [(nb, nom, partie)] ; accepte {Section: {Nom: {count}}} ou {Section: [{name, count}]}."""
    out = []
    if not isinstance(obj, dict): return out
    for sec, cards in obj.items():
        part = SECTION.get(str(sec).strip().lower())
        if part is None: continue
        items = cards.items() if isinstance(cards, dict) else ((None, c) for c in cards or [])
        for nm, v in items:
            if isinstance(v, dict):
                n = v.get('count') or v.get('quantity') or v.get('qty') or 1
                nm = v.get('name') or nm
            else: n = v if isinstance(v, int) else 1
            if nm: out.append((int(n), str(nm), part))
    return out


def run(code):
    cfg = GAMES[code]
    db = load_game(code)
    by_name = name_index(code, db)
    start = datetime.datetime.utcnow() - datetime.timedelta(days=DAYS)
    tours, fmt = [], None
    for f in cfg['formats']:
        res = get(API, headers={'Authorization': KEY}, body={'game': cfg['game'], 'format': f, 'last': DAYS, 'participantMin': MIN_PLAYERS,
                                                            'columns': ['decklist', 'wins', 'draws', 'losses']})
        time.sleep(15)   # 5 appels par minute au plus
        if isinstance(res, list) and res:
            tours, fmt = res, f; break
        print(code, 'format', f, ': aucun tournoi')
    print(code, 'format retenu :', fmt, '· tournois :', len(tours))
    decks, players, done_t, matches = collections.OrderedDict(), 0, 0, 0
    for t in tours:
        st = t.get('standings') or []
        if not st: continue
        done_t += 1
        n_players = len(st)
        for i, row in enumerate(st):
            arch = (row.get('archetype') or '').strip()
            lst = parse_obj(row.get('deckObj')) or parse_text(row.get('decklist') if not str(row.get('decklist') or '').startswith('http') else '')
            if not arch or not lst: continue
            players += 1
            did = re.sub(r'[^a-z0-9]+', '-', arch.lower()).strip('-')[:60]
            e = decks.setdefault(did, {'id': did, 'name': arch, 'n': 0, 'top8': 0, 'best': None, 'list': None, 'rec': [0, 0, 0]})
            e['n'] += 1
            w, l, d = int(row.get('wins') or 0), int(row.get('losses') or 0), int(row.get('draws') or 0)
            e['rec'][0] += w; e['rec'][1] += l; e['rec'][2] += d; matches += w + l + d
            pl = row.get('standing') or i + 1
            if pl <= 8: e['top8'] += 1
            score = (pl, -n_players)
            if e['best'] is None or score < e['_score']:
                e['_score'] = score
                e['best'] = {'placing': pl, 'players': n_players, 'tournament': t.get('tournamentName'),
                             'date': datetime.datetime.utcfromtimestamp(t.get('startDate') or 0).strftime('%Y-%m-%d')}
                e['list'] = [[n, nm, '', '', by_name.get(norm_name(nm)), part] for n, nm, part in lst]
    out = sorted(decks.values(), key=lambda e: (-e['top8'], -e['n']))[:15]
    for e in out:
        e.pop('_score', None)
        e['share'] = round(e['n'] / players, 4) if players else 0
        e['mu'] = {}
    write(code, {'source': 'TopDeck.gg', 'sourceUrl': 'https://topdeck.gg', 'online': False, 'format': cfg['label'],
                 'from': start.strftime('%Y-%m-%d'), 'to': datetime.datetime.utcnow().strftime('%Y-%m-%d'),
                 'tournaments': done_t, 'players': players, 'matches': matches // 2}, out)


if __name__ == '__main__':
    if not KEY:
        print('Pas de clé TOPDECK_KEY : decks Magic et Yu-Gi-Oh! non mis à jour.'); sys.exit(0)
    for code in (sys.argv[1:] or list(GAMES)):
        run(code)
