"""Méta Pokémon (visage « Joueur ») : decks les plus joués en tournoi sur 30 jours.

Source : API publique de Limitless TCG (https://play.limitlesstcg.com/api, sans clé pour les tournois).
Pour chaque tournoi Standard récent avec listes publiques, on lit le classement : type de deck (« deck ») et liste.
Sortie data/meta/pkm.json :
  {generated, source, format, from, to, tournaments, players,
   decks: [{id, name, n, share, top8, best: {placing, players, tournament, date}, list: [[nb, nom, set, numéro, clé CallIt! ou null]]}]}
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
players = 0
done_t = 0
sample_shown = False
for t in tours:
    st = get(f"{API}/tournaments/{t['id']}/standings")
    time.sleep(1.5)
    if not st: continue
    done_t += 1
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
for e in out:
    e.pop('_score', None); e['share'] = round(e['n'] / players, 4) if players else 0
os.makedirs('data/meta', exist_ok=True)
json.dump({'generated': datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%MZ'), 'source': 'Limitless TCG', 'format': fmt,
           'from': since.strftime('%Y-%m-%d'), 'to': datetime.datetime.utcnow().strftime('%Y-%m-%d'),
           'tournaments': done_t, 'players': players, 'decks': out},
          open('data/meta/pkm.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('decks :', len(out), '· joueurs :', players)
for e in out[:10]:
    miss = sum(1 for x in e['list'] or [] if not x[4])
    print(f"  {e['name']} · {e['n']} joueurs · top 8 : {e['top8']} · cartes non reliées : {miss}")
