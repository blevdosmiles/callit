"""Produits scellés (boosters, displays, ETB, coffrets…) depuis les fichiers publics de Cardmarket.

Entrées : catalogue des produits « non-singles » et guide de prix (téléchargés par GitHub).
Sortie : data/sealed.json
  {"generated": date du guide, "cats": [noms de catégories], "items": [[id, nom, n° catégorie, date d'ajout, low, trend, avg30, avg7]]}
Usage : python3 outils/preparer_scelles.py produits.json guide.json data/sealed.json
"""
import json, sys, collections

prod_p, guide_p, out_p = sys.argv[1:4]
prod = json.load(open(prod_p, encoding='utf-8'))
guide = json.load(open(guide_p, encoding='utf-8'))
P = {r['idProduct']: r for r in guide.get('priceGuides', [])}
rows = prod.get('products') or []
cats = collections.Counter(r.get('categoryName') for r in rows)
print('catégories :', cats.most_common())
# On garde le scellé, pas les accessoires (classeurs, sleeves…) ni les cartes à l'unité
SKIP = ('sleeve', 'binder', 'album', 'playmat', 'deck box', 'storage', 'accessor', 'coin', 'dice', 'marker', 'toploader', 'single')
names, idx, items = [], {}, []
r2 = lambda v: None if v in (None, 0) else round(float(v), 2)
for r in rows:
    cat = r.get('categoryName') or ''
    if any(k in cat.lower() for k in SKIP):
        continue
    if cat not in idx:
        idx[cat] = len(names); names.append(cat)
    g = P.get(r['idProduct'], {})
    items.append([r['idProduct'], r.get('name', ''), idx[cat], (r.get('dateAdded') or '')[:10],
                  r2(g.get('low')), r2(g.get('trend')), r2(g.get('avg30')), r2(g.get('avg7'))])
out = {'generated': guide.get('createdAt', ''), 'cats': names, 'items': items}
s = json.dumps(out, ensure_ascii=False, separators=(',', ':'))
open(out_p, 'w', encoding='utf-8').write(s)
print(len(items), 'produits ·', sum(1 for i in items if i[5]), 'avec une cote ·', len(s) // 1024, 'Ko')
