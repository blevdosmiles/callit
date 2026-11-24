"""Outils communs aux bases des autres jeux (Magic, Yu-Gi-Oh!, One Piece).

Chaque jeu a son fichier data/jeux/<code>.json, au même format que
data/cards.json (Pokémon), pour que l'appli les lise de la même façon :
  sets  : [{id, reg, date, count, name:{en:...}}]   reg = code du jeu
  ills, rars, types : listes de textes, les cartes y renvoient par numéro
  cards : [{n:{en:...}, num, s, i, r, t, cm, p, im}]
     cm = numéro du produit Cardmarket, p = prix (voir priceFields),
     im = morceau d'adresse de l'image (voir imageBase)
"""
import json, datetime

FIELDS = ['low', 'trend', 'avg30', 'trendFoil', 'avg1', 'avg7']
CM_KEYS = {'mtg': ['low', 'trend', 'avg30', 'trend-foil', 'avg1', 'avg7'],
           'other': ['low', 'trend', 'avg30', 'trend-holo', 'avg1', 'avg7']}


def cardmarket_prices(path, game='other'):
    """Guide de prix public Cardmarket → {idProduct: [6 prix]}."""
    g = json.load(open(path, encoding='utf-8'))
    out = {}
    for r in g.get('priceGuides') or []:
        vals = []
        for k in CM_KEYS['mtg' if game == 'mtg' else 'other']:
            v = r.get(k)
            if v is None and k == 'trend-foil': v = r.get('trend-holo')
            if v is None and k == 'trend-holo': v = r.get('trend-foil')
            vals.append(round(v, 2) if isinstance(v, (int, float)) and v > 0 else None)
        if any(v is not None for v in vals):
            out[r['idProduct']] = vals
    return out, (g.get('createdAt') or '')


class Index:
    """Liste de textes sans doublon, les cartes y renvoient par numéro."""
    def __init__(self): self.items, self.pos = [], {}
    def __call__(self, v):
        if not v: return None
        if v not in self.pos:
            self.pos[v] = len(self.items); self.items.append(v)
        return self.pos[v]


def write(path, game, cards, sets, ills, rars, types, image_base, price_source, generated, extra=None):
    for c in cards:
        for k in [k for k, v in c.items() if v is None or v == {}]:
            del c[k]
    d = {'game': game, 'generated': generated or datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%S+0000'),
         'priceFields': FIELDS, 'priceSource': price_source, 'imageBase': image_base,
         'sets': sets, 'ills': ills.items, 'rars': rars.items, 'types': types.items, 'cards': cards}
    if extra: d.update(extra)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(d, f, ensure_ascii=False, separators=(',', ':'))
    print(path, len(cards), 'cartes,', len(sets), 'sets,', sum(1 for c in cards if c.get('p')), 'avec prix')
