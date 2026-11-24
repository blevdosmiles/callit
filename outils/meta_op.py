"""Méta One Piece (visage « Joueur ») : decks les plus joués en tournoi sur 30 jours.

Source : API publique de Limitless TCG (https://play.limitlesstcg.com/api, sans clé), jeu « OP », format Standard.
Pour chaque tournoi récent avec listes publiques : classement (Leader et liste) et appariements (bilans entre decks).
Sortie : data/meta/op.json (voir outils/meta_commun.py).
Usage : python3 outils/meta_op.py
"""
import collections, datetime, re, time
from meta_commun import get, load_game, name_index, norm_name, write

API = 'https://play.limitlesstcg.com/api'
DAYS, MIN_PLAYERS, MAX_T = 30, 16, 150
PARTS = [('leader', 'l'), ('character', 'c'), ('event', 'v'), ('stage', 's')]

since = datetime.datetime.utcnow() - datetime.timedelta(days=DAYS)
tours, page = [], 1
while page <= 20 and len(tours) < MAX_T:
    lst = get(f'{API}/tournaments?game=OP&limit=100&page={page}')
    if not lst: break
    stop = False
    for t in lst:
        d = datetime.datetime.fromisoformat(t['date'].replace('Z', '+00:00')).replace(tzinfo=None)
        if d < since: stop = True; continue
        if (t.get('format') or 'STANDARD').upper() != 'STANDARD': continue   # « EXTRA » = autre format
        if (t.get('players') or 0) >= MIN_PLAYERS: tours.append(t)
    if stop: break
    page += 1
tours = tours[:MAX_T]
print('tournois retenus :', len(tours))

# Cartes CallIt! : numéro officiel (OP15-058) → clé de la version de base ; et nom → clé la moins chère
db = load_game('op')
by_num = {}
for c in db['cards']:
    key = 'op:' + db['sets'][c['s']]['id'] + ':' + c['num']
    base = c['num'].split(' ')[0].upper()
    if base not in by_num or c['num'].upper() == base: by_num[base] = key
by_name = name_index('op', db)


def card_key(name, code, num):
    if code and num:
        k = by_num.get(f'{code}-{str(num).zfill(3)}'.upper())
        if k: return k
    return by_name.get(norm_name(name))


decks = collections.OrderedDict()
rec = collections.defaultdict(lambda: [0, 0, 0])
mu = collections.defaultdict(lambda: collections.defaultdict(lambda: [0, 0, 0]))
matches = players = done_t = 0
for t in tours:
    st = get(f"{API}/tournaments/{t['id']}/standings"); time.sleep(1.5)
    if not st: continue
    done_t += 1
    deck_of = {row.get('player'): (row.get('deck') or {}).get('id') for row in st if row.get('player')}
    pr = get(f"{API}/tournaments/{t['id']}/pairings"); time.sleep(1.5)
    for m in pr or []:
        p1, p2, w = m.get('player1'), m.get('player2'), m.get('winner')
        a, b = deck_of.get(p1), deck_of.get(p2)
        if not (a and b and p2) or a == b: continue
        if w == p1: ra, rb = 0, 1
        elif w == p2: ra, rb = 1, 0
        elif w == 0: ra = rb = 2
        else: continue
        matches += 1
        rec[a][ra] += 1; rec[b][rb] += 1
        mu[a][b][ra] += 1; mu[b][a][rb] += 1
    for row in st:
        dk, dl = row.get('deck') or {}, row.get('decklist')
        if not dk.get('id') or not isinstance(dl, dict): continue
        players += 1
        e = decks.setdefault(dk['id'], {'id': dk['id'], 'name': dk.get('name') or dk['id'], 'n': 0, 'top8': 0, 'best': None, 'list': None})
        e['n'] += 1
        pl = row.get('placing') or 999
        if pl <= 8: e['top8'] += 1
        score = (pl, -(t.get('players') or 0))
        if e['best'] is None or score < e['_score']:
            e['_score'] = score
            e['best'] = {'placing': pl, 'players': t.get('players'), 'tournament': t.get('name'), 'date': t['date'][:10]}
            lst = []
            for part, code in PARTS:
                xs = dl.get(part) or []
                if isinstance(xs, dict): xs = [xs]
                for x in xs:
                    num = str(x.get('number') or '')
                    lst.append([x.get('count') or 1, x.get('name'), x.get('set') or '', num, card_key(x.get('name'), x.get('set'), num), code])
            e['list'] = lst

out = sorted(decks.values(), key=lambda e: (-e['top8'], -e['n']))[:15]
ids = {e['id'] for e in out}
names = collections.Counter(e['name'] for e in out)
for e in out:
    e.pop('_score', None)
    e['share'] = round(e['n'] / players, 4) if players else 0
    e['rec'] = rec[e['id']]
    e['mu'] = {o: v for o, v in mu[e['id']].items() if o in ids and sum(v) >= 10}
    if names[e['name']] > 1: e['name'] = f"{e['name']} ({e['id']})"   # deux Leaders du même nom
write('op', {'source': 'Limitless TCG', 'sourceUrl': 'https://play.limitlesstcg.com', 'online': True, 'format': 'Standard',
             'from': since.strftime('%Y-%m-%d'), 'to': datetime.datetime.utcnow().strftime('%Y-%m-%d'),
             'tournaments': done_t, 'players': players, 'matches': matches}, out)
