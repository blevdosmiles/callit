"""Vérifie quelles images de cartes existent vraiment (lancé par GitHub chaque semaine).

Pour chaque carte de data/cards.json :
 - TCGdex : on teste les 6 langues de sa région ; résultat = un chiffre base 36 (un bit par langue).
 - Cartes anglaises sans aucune image TCGdex : on cherche l'image sur pokemontcg.io (2e source).
Sortie data/images.json : {"cards": date de data/cards.json, "mask": "…", "ptcg": {"index": "set/numéro"}}
Usage : python3 outils/verifier_images.py
"""
import json, re, urllib.request, urllib.parse, urllib.error, concurrent.futures as cf

d = json.load(open('data/cards.json', encoding='utf-8'))
BASE = {'en': ['en', 'fr', 'es', 'it', 'pt', 'de'], 'ja': ['ja', 'zh-tw', 'th', 'id', 'ko', 'zh-cn']}

def exists(url):
    for _ in range(2):
        try:
            r = urllib.request.urlopen(urllib.request.Request(url, method='HEAD', headers={'User-Agent': 'CallIt-images-check'}), timeout=20)
            return r.status == 200
        except urllib.error.HTTPError as e:
            if e.code in (403, 404): return False
        except Exception:
            pass
    return False

def tcg(c, l):
    s = d['sets'][c['s']]
    return d['imageBase'].replace('{lang}', l).replace('{serie}', urllib.parse.quote(s['serie'])).replace('{set}', urllib.parse.quote(s['id'])).replace('{num}', urllib.parse.quote(c['num'])).replace('high.webp', 'low.webp')

jobs = [(i, b, l) for i, c in enumerate(d['cards']) for b, l in enumerate(BASE[d['sets'][c['s']]['reg']])]
mask = [0] * len(d['cards'])
with cf.ThreadPoolExecutor(64) as ex:
    for (i, b, l), ok in zip(jobs, ex.map(lambda j: exists(tcg(d['cards'][j[0]], j[2])), jobs)):
        if ok: mask[i] |= 1 << b
print('cartes sans aucune image TCGdex :', sum(1 for m in mask if not m), 'sur', len(mask))

# 2e source pour les cartes anglaises : pokemontcg.io
norm = lambda t: re.sub(r'[^a-z0-9]', '', (t or '').lower().replace('&', 'and'))
try:
    sets = json.load(urllib.request.urlopen(urllib.request.Request('https://api.pokemontcg.io/v2/sets?pageSize=250', headers={'User-Agent': 'CallIt-images-check'}), timeout=60))['data']
except Exception as e:
    print('pokemontcg.io injoignable :', e); sets = []
by_name = {norm(s['name']): s for s in sets}
by_date = {}
for s in sets: by_date.setdefault(s['releaseDate'].replace('/', '-'), []).append(s)
# Sets dont le nom ou la date ne suffit pas : identifiants pokemontcg.io possibles (testés, une erreur ne coûte rien)
EXTRA = {'exu': ['ex10'], 'cel25cc': ['cel25c'], 'sve': ['sve'], 'svp': ['svp'], 'mep': ['mep'], 'mee': ['mee'],
         'swshp': ['swshp'], 'hgssp': ['hsp'], 'xya': ['xya'], 'miscp': ['np'],
         '2019sm-fr': ['mcd19'], '2018sm-fr': ['mcd18'], '2018sm': ['mcd18'], '2017sm': ['mcd17'], '2015xy': ['mcd15'],
         '2014xy': ['mcd14'], '2013bw': ['mcd12', 'mcd11'], '2023sv': ['mcd23'], '2024sv': ['mcd24'],
         'tk-hs-g': ['tk2a', 'tk2b'], 'tk-hs-r': ['tk2b', 'tk2a'], 'tk-dp-m': ['tk1a', 'tk1b'], 'tk-dp-l': ['tk1b', 'tk1a'],
         'tk-sm-r': ['tk8a', 'tk8b'], '30th-c': ['30thc', 'cc30'], '30th': ['30th']}
def ptcg_sets(s):
    if s['reg'] != 'en': return []
    out = list(EXTRA.get(s['id'], []))
    m = by_name.get(norm(s['name'].get('en')))
    if m and m['id'] not in out: out.append(m['id'])
    c = [x for x in by_date.get(s.get('date') or '', []) if x.get('printedTotal') == s.get('count')]
    if len(c) == 1 and c[0]['id'] not in out: out.append(c[0]['id'])
    return out
def nums(n):
    a = re.sub(r'^0+(?=\d)', '', n); b = re.sub(r'^([A-Za-z]+)0+(?=\d)', r'\1', a)
    out = []
    for x in (a, b, n, a + '_A'):
        if x not in out: out.append(x)
    return out
cand = {}
for i, c in enumerate(d['cards']):
    if mask[i]: continue
    ps = [sid + '/' + x for sid in ptcg_sets(d['sets'][c['s']]) for x in nums(c['num'])]
    if ps: cand[i] = ps
def first(paths):
    for p in paths:
        if exists('https://images.pokemontcg.io/' + p + '.png'): return p
    return None
ptcg = {}
with cf.ThreadPoolExecutor(32) as ex:
    for i, path in zip(cand.keys(), ex.map(first, cand.values())):
        if path: ptcg[str(i)] = path
print('images trouvées sur pokemontcg.io :', len(ptcg), 'sur', len(cand), 'candidates')
D = '0123456789abcdefghijklmnopqrstuvwxyz'
out = {'cards': d['generated'], 'ptcg': ptcg}
out['mask'] = ''.join(D[m // 36] + D[m % 36] for m in mask)
json.dump(out, open('data/images.json', 'w'), separators=(',', ':'))
print('ok')
