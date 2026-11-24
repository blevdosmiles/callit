"""Méta Pokémon (visage « Joueur ») : decks les plus joués en tournoi sur 30 jours.

Source : API publique de Limitless TCG (https://play.limitlesstcg.com/api, sans clé pour les tournois).
Pour chaque tournoi Standard récent avec listes publiques, on lit le classement : type de deck (« deck ») et liste.
Sortie data/meta/pkm.json :
  {generated, source, format, from, to, tournaments, players,
   decks: [{id, name, n, share, top8, best: {placing, players, tournament, date}, list: [[nb, nom, set, numéro, clé CallIt! ou null, p|t|e]],
            rec: [victoires, défaites, nuls], mu: {id adverse: [v, d, n]}, cards: [fiches TCGdex des Pokémon principaux]}]}
Les matchs viennent des appariements publics des tournois (ronde par ronde). Les fiches des cartes (attaques, talents,
faiblesse, retraite) viennent de TCGdex en anglais, français, allemand, espagnol et italien.
Le prix de chaque deck est calculé dans l'appli avec les cotes du jour.
Usage : python3 outils/meta_pkm.py
"""
import json, time, urllib.request, urllib.parse, datetime, collections, re, os

API = 'https://play.limitlesstcg.com/api'
UA = {'User-Agent': 'CallIt-meta (callitcards.com)'}
DAYS, MIN_PLAYERS, MAX_T = 30, 32, 120


def get(url):
    for i in range(3):
        try:
            r = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40)
            rem = r.headers.get('X-RateLimit-Remaining')
            data = json.load(r)
            if rem is not None and rem.isdigit() and int(rem) < 5: time.sleep(20)
            return data
        except Exception as e:
            print('  erreur', url, e); time.sleep(60 if '429' in str(e) else 5 * (i + 1))
    return None


games = get(API + '/games') or []
fmt = 'STANDARD'
for g in games if isinstance(games, list) else []:
    if g.get('id') == 'PTCG':
        fs = g.get('formats') or {}
        keys = list(fs.keys()) if isinstance(fs, dict) else [f.get('id') for f in fs]
        print('formats PTCG :', keys)
        fmt = next((k for k in keys if k and k.upper() == 'STANDARD'), next((k for k in keys if k and 'STANDARD' in k.upper()), fmt))
print('format retenu :', fmt)

since = datetime.datetime.utcnow() - datetime.timedelta(days=DAYS)
tours, page = [], 1
while page <= 20 and len(tours) < MAX_T:
    lst = get(f'{API}/tournaments?game=PTCG&format={fmt}&limit=100&page={page}')
    if not lst: break
    stop = False
    for t in lst:
        d = datetime.datetime.fromisoformat(t['date'].replace('Z', '+00:00')).replace(tzinfo=None)
        if d < since: stop = True; continue
        if (t.get('players') or 0) >= MIN_PLAYERS: tours.append(t)
    if stop: break
    page += 1
tours = tours[:MAX_T]
print('tournois retenus :', len(tours))

# Cartes CallIt! : (code officiel du set, numéro) → clé ; et nom anglais → clé la moins chère
d = json.load(open('data/cards.json', encoding='utf-8'))
code_of = {}
recent = [s for s in d['sets'] if s['reg'] == 'en' and (s.get('date') or '') >= '2021-01-01']
for s in recent:
    info = get('https://api.tcgdex.net/v2/en/sets/' + urllib.parse.quote(s['id'])) or {}
    ab = (info.get('abbreviation') or {}).get('official')
    if ab: code_of[ab.upper()] = s['id']
    time.sleep(0.05)
print('codes de sets :', len(code_of))
sid_idx = {s['id']: i for i, s in enumerate(d['sets'])}
by_set_num, cheapest = {}, {}
for c in d['cards']:
    s = d['sets'][c['s']]
    if s['reg'] != 'en': continue
    key = 'en:' + s['id'] + ':' + c['num']
    by_set_num[(s['id'], re.sub(r'^0+(?=\d)', '', c['num']))] = key
    p = (c.get('p') or [0, 0])[1] or 0
    nm = (c['n'].get('en') or '').lower()
    if nm and p > 0 and (nm not in cheapest or p < cheapest[nm][1]): cheapest[nm] = (key, p)

def card_key(name, code, num):
    sid = code_of.get((code or '').upper())
    if sid:
        k = by_set_num.get((sid, re.sub(r'^0+(?=\d)', '', str(num))))
        if k: return k
    ch = cheapest.get((name or '').lower())
    return ch[0] if ch else None

decks = collections.OrderedDict()
rec = collections.defaultdict(lambda: [0, 0, 0])
mu = collections.defaultdict(lambda: collections.defaultdict(lambda: [0, 0, 0]))
matches = 0
players = 0
done_t = 0
sample_shown = False
for t in tours:
    st = get(f"{API}/tournaments/{t['id']}/standings")
    time.sleep(1.5)
    if not st: continue
    done_t += 1
    deck_of = {row.get('player'): (row.get('deck') or {}).get('id') for row in st if row.get('player')}
    pr = get(f"{API}/tournaments/{t['id']}/pairings")
    time.sleep(1.5)
    if done_t == 1 and pr: print('exemple d’appariement :', json.dumps(pr[:2])[:400])
    for m in pr or []:
        p1, p2, w = m.get('player1'), m.get('player2'), m.get('winner')
        a, b = deck_of.get(p1), deck_of.get(p2)
        if not (a and b and p2) or a == b: continue
        matches += 1
        if w == p1: res_a, res_b = 0, 1
        elif w == p2: res_a, res_b = 1, 0
        elif w == 0: res_a = res_b = 2
        else: continue   # double défaite ou résultat inconnu
        rec[a][res_a] += 1; rec[b][res_b] += 1
        mu[a][b][res_a] += 1; mu[b][a][res_b] += 1
    for row in st:
        dk, dl = row.get('deck') or {}, row.get('decklist')
        if not dk.get('id') or not dl: continue
        if not sample_shown: print('exemple de liste :', json.dumps(dl)[:600]); sample_shown = True
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
            for part in ('pokemon', 'trainer', 'energy'):
                for x in (dl.get(part) or []) if isinstance(dl, dict) else []:
                    lst.append([x.get('count') or 1, x.get('name'), x.get('set'), str(x.get('number') or ''), card_key(x.get('name'), x.get('set'), x.get('number')), part[0]])
            e['list'] = lst

out = sorted(decks.values(), key=lambda e: (-e['top8'], -e['n']))[:15]
ids = {e['id'] for e in out}
for e in out:
    e.pop('_score', None); e['share'] = round(e['n'] / players, 4) if players else 0
    e['rec'] = rec[e['id']]
    e['mu'] = {o: v for o, v in mu[e['id']].items() if o in ids and sum(v) >= 10}

# Fiches des Pokémon principaux (ceux dont le nom figure dans le nom du deck, sinon les ex les plus joués)
LANGS = ['en', 'fr', 'de', 'es', 'it']
GENERIC = {'mega', 'basic', 'box', 'ex', 'control', 'toolbox'}
def tcgdex_card(key):
    _, sid, num = key.split(':')
    res = {}
    for lg in LANGS:
        c = get(f'https://api.tcgdex.net/v2/{lg}/sets/{urllib.parse.quote(sid)}/{urllib.parse.quote(num)}')
        time.sleep(0.05)
        if not c: continue
        res[lg] = c
    return res
for e in out:
    toks = [w for w in re.findall(r"[a-zà-ÿ']+", e['name'].lower()) if len(w) > 3 and w not in GENERIC]
    pk = [x for x in e['list'] or [] if x[5] == 'p' and x[4]]
    main = [x for x in pk if any(t in (x[1] or '').lower() for t in toks)]
    if not main: main = sorted([x for x in pk if (x[1] or '').endswith(' ex')], key=lambda x: -x[0])[:3]
    seen, cards = set(), []
    for x in main:
        if x[1] in seen or len(cards) >= 4: continue
        seen.add(x[1])
        info = tcgdex_card(x[4])
        en = info.get('en')
        if not en: continue
        name_en = en.get('name') or x[1]
        mega = name_en.lower().startswith('mega ') and name_en.lower().endswith(' ex')
        cards.append({
            'key': x[4], 'count': x[0], 'stage': en.get('stage'), 'hp': en.get('hp'), 'types': en.get('types') or [],
            'weak': [w.get('type') for w in en.get('weaknesses') or []], 'resist': [w.get('type') for w in en.get('resistances') or []],
            'retreat': en.get('retreat'), 'prizes': 3 if mega else (2 if name_en.lower().endswith(' ex') else 1),
            't': {lg: {'name': c.get('name'),
                       'ab': [[a.get('name'), a.get('effect')] for a in c.get('abilities') or []],
                       'at': [[a.get('name'), a.get('damage'), a.get('effect'), len(a.get('cost') or [])] for a in c.get('attacks') or []]}
                  for lg, c in info.items()}})
    e['cards'] = cards
os.makedirs('data/meta', exist_ok=True)
json.dump({'generated': datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%MZ'), 'source': 'Limitless TCG', 'format': fmt,
           'from': since.strftime('%Y-%m-%d'), 'to': datetime.datetime.utcnow().strftime('%Y-%m-%d'),
           'tournaments': done_t, 'players': players, 'matches': matches, 'decks': out},
          open('data/meta/pkm.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('decks :', len(out), '· joueurs :', players)
for e in out[:10]:
    miss = sum(1 for x in e['list'] or [] if not x[4])
    r = e['rec']
    print(f"  {e['name']} · {e['n']} joueurs · top 8 : {e['top8']} · bilan {r} · adversaires suivis : {len(e['mu'])} · fiches : {[c['t']['en']['name'] for c in e['cards']]} · non reliées : {miss}")
