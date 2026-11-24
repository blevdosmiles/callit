"""Relevé quotidien des prix (historique des cotes).

Chaque jour, GitHub télécharge le guide de prix public de Cardmarket
(fichier mis à disposition par Cardmarket pour le téléchargement) et ajoute
la cote « tendance » du jour de chaque carte de data/cards.json.

Rangement : historique/NN.json, où NN = numéro Cardmarket de la carte modulo 100.
Ainsi la fiche d'une carte ne télécharge qu'un petit fichier.
Contenu : {"start": "AAAA-MM-JJ", "p": {"<id>": [centimes du jour 0, du jour 1, ...]}}
Une case vaut null quand il n'y avait pas de cote ce jour-là.

Usage : python3 outils/releve_prix.py guide.json
"""
import json, sys, os, datetime

URL = 'https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_6.json'
guide = json.load(open(sys.argv[1], encoding='utf-8'))
rows = guide.get('priceGuides') or []
if len(rows) < 1000:
    sys.exit('guide vide ou incomplet, rien enregistré')
day = (guide.get('createdAt') or datetime.date.today().isoformat())[:10]

ids = {c['cm'] for c in json.load(open('data/cards.json', encoding='utf-8'))['cards'] if c.get('cm')}
today = {}
for r in rows:
    i = r.get('idProduct')
    if i in ids:
        v = r.get('trend')
        if v is None or v <= 0: v = r.get('low')
        today[i] = round(v * 100) if v and v > 0 else None

os.makedirs('historique', exist_ok=True)
shards = {}
for i, v in today.items():
    shards.setdefault(i % 100, {})[i] = v

d0 = None
for n in range(100):
    path = f'historique/{n:02d}.json'
    h = json.load(open(path)) if os.path.exists(path) else {'start': day, 'p': {}}
    start = datetime.date.fromisoformat(h['start'])
    k = (datetime.date.fromisoformat(day) - start).days  # case du jour
    if k < 0:
        sys.exit(f'date du guide {day} antérieure au début {h["start"]}')
    vals = shards.get(n, {})
    for i in set(h['p']) | {str(x) for x in vals}:
        s = h['p'].setdefault(i, [])
        s.extend([None] * (k + 1 - len(s)))  # jours manqués = null
        s[k] = vals.get(int(i))
    with open(path, 'w') as f:
        json.dump(h, f, separators=(',', ':'))
    d0 = h['start']
json.dump({'start': d0, 'last': day}, open('historique/info.json', 'w'))
print('relevé du', day, ':', sum(v is not None for v in today.values()), 'cotes sur', len(ids), 'cartes')
