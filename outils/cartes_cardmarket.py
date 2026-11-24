"""Cartes Pokémon vendues sur Cardmarket mais absentes de data/cards.json (promos japonaises, versions…).

Entrées : catalogue public Cardmarket des cartes (products_singles_6.json), des produits scellés
(products_nonsingles_6.json, pour retrouver le nom des extensions) et le guide des prix (price_guide_6.json).
Sortie data/cm_extra.json :
  {generated, exps: {idExpansion: nom}, items: [[idProduct, nom, attaques, idExpansion, low, trend, avg30, avg7, avg1]]}
Seules les cartes avec une cote sont gardées ; les « Code Card » (codes en ligne) sont ignorées.
Usage : python3 outils/cartes_cardmarket.py singles.json nonsingles.json guide.json
"""
import json, sys, re, collections

singles = json.load(open(sys.argv[1]))['products']
nons = json.load(open(sys.argv[2]))['products']
guide = {g['idProduct']: g for g in json.load(open(sys.argv[3]))['priceGuides']}
d = json.load(open('data/cards.json', encoding='utf-8'))
have = {c['cm'] for c in d['cards'] if c.get('cm')}

# Nom d'une extension : le nom de ses produits scellés, sans le type de produit
TYPES = r'(Booster Box|Booster Display( Box)?|Display|Booster Pack|Booster Bundle|Booster|Elite Trainer Box|Pokémon Center Elite Trainer Box|Build & Battle (Box|Stadium)|Theme Deck|Starter Deck|Deck|Blister|Sleeved Booster|Collection|Box|Tin|Case|Bundle|Set)\b.*$'
exp_names = collections.defaultdict(collections.Counter)
for p in nons:
    nm = re.sub(TYPES, '', p['name'], flags=re.I).strip(' -:·')
    if 2 < len(nm) < 60: exp_names[p['idExpansion']][nm] += 1
exps = {}
for e, cnt in exp_names.items():
    # le nom le plus fréquent ; à égalité le plus court
    exps[e] = sorted(cnt.items(), key=lambda kv: (-kv[1], len(kv[0])))[0][0]
# Extensions déjà connues de la base : nom du set CallIt! le plus fréquent
cm_card = {c['cm']: c for c in d['cards'] if c.get('cm')}
known = collections.defaultdict(collections.Counter)
for p in singles:
    c = cm_card.get(p['idProduct'])
    if c:
        s = d['sets'][c['s']]
        known[p['idExpansion']][s['name'].get('en') or next(iter(s['name'].values()))] += 1
for e, cnt in known.items(): exps[e] = cnt.most_common(1)[0][0]

def f(g, k):
    v = g.get(k)
    return round(v, 2) if isinstance(v, (int, float)) and v > 0 else 0

items = []
for p in singles:
    if p['idProduct'] in have or 'code card' in p['name'].lower(): continue
    g = guide.get(p['idProduct']) or {}
    if not (f(g, 'trend') or f(g, 'low')): continue
    m = re.match(r'^(.*?)\s*\[(.*)\]\s*$', p['name'])
    name, att = (m.group(1), m.group(2)) if m else (p['name'], '')
    items.append([p['idProduct'], name, att, p['idExpansion'], f(g, 'low'), f(g, 'trend'), f(g, 'avg30'), f(g, 'avg7'), f(g, 'avg1')])
used = {x[3] for x in items}
out = {'generated': d.get('generated'), 'exps': {str(e): n for e, n in exps.items() if e in used}, 'items': items}
json.dump(out, open('data/cm_extra.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('cartes ajoutées :', len(items), '· extensions :', len(used), '· dont nommées :', len(out['exps']))
for e in list(used)[:25]: print('  ', e, out['exps'].get(str(e), '(sans nom)'))
