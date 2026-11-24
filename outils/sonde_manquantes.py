"""Sonde : cartes Pokémon vendues sur Cardmarket absentes de data/cards.json (rapport seulement)."""
import json, sys, collections
prods = json.load(open(sys.argv[1]))['products']
guide = {g['idProduct']: g for g in json.load(open(sys.argv[2]))['priceGuides']}
d = json.load(open('data/cards.json', encoding='utf-8'))
have = {c['cm'] for c in d['cards'] if c.get('cm')}
exp_set = collections.defaultdict(collections.Counter)
cm_card = {c['cm']: c for c in d['cards'] if c.get('cm')}
for p in prods:
    c = cm_card.get(p['idProduct'])
    if c: exp_set[p['idExpansion']][d['sets'][c['s']]['id']] += 1
miss = [p for p in prods if p['idProduct'] not in have]
print('produits singles :', len(prods), '· reliés :', len(prods) - len(miss), '· manquants :', len(miss))
priced = [p for p in miss if (guide.get(p['idProduct']) or {}).get('trend')]
print('manquants avec une cote :', len(priced))
by_exp = collections.Counter(p['idExpansion'] for p in priced)
known = sum(n for e, n in by_exp.items() if exp_set.get(e))
print('dont dans une extension déjà connue :', known)
for e, n in by_exp.most_common(40):
    top = exp_set.get(e)
    ex = [p['name'] for p in priced if p['idExpansion'] == e][:5]
    print(f'  exp {e} : {n} manquants · set connu : {top.most_common(1) if top else "-"} · ex : {ex}')
for p in prods:
    if any(k in p['name'] for k in ('Psyduck', 'Ancient Mew')) and p['idProduct'] not in have:
        print('  cible :', p['idProduct'], p['name'], p['idExpansion'], (guide.get(p['idProduct']) or {}).get('trend'))
