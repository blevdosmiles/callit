"""Base Magic: The Gathering pour l'appli.

Source des fiches et images : Scryfall (fichier « default_cards » publié
chaque jour pour être téléchargé, conditions : scryfall.com/docs/api).
Règles Scryfall respectées : données gratuites pour tous (jamais derrière
un abonnement), images non recadrées (nom de l'illustrateur et copyright
visibles), un seul téléchargement par jour.
Prix : guide de prix public Cardmarket (price_guide_1.json), relié par
le numéro Cardmarket que donne Scryfall.

Usage : python3 outils/jeux_magic.py default_cards.json price_guide_1.json data/jeux/mtg.json
"""
import json, sys
from jeux_commun import Index, cardmarket_prices, write

src, guide, dst = sys.argv[1:4]
prices, gdate = cardmarket_prices(guide, 'mtg')
raw = json.load(open(src, encoding='utf-8'))

SKIP_LAYOUT = {'token', 'double_faced_token', 'emblem', 'art_series', 'vanguard', 'planar', 'scheme'}
ills, rars, types = Index(), Index(), Index()
RAR = {'common': 'Commune', 'uncommon': 'Peu commune', 'rare': 'Rare', 'mythic': 'Mythique', 'special': 'Spéciale', 'bonus': 'Bonus'}
COL = {'W': 'Blanc', 'U': 'Bleu', 'B': 'Noir', 'R': 'Rouge', 'G': 'Vert'}
sets, set_pos, cards = [], {}, []
for c in raw:
    if 'paper' not in (c.get('games') or []) or c.get('layout') in SKIP_LAYOUT or c.get('oversized'):
        continue
    code = c['set']
    if code not in set_pos:
        set_pos[code] = len(sets)
        sets.append({'id': code, 'reg': 'mtg', 'date': c.get('released_at'), 'count': 0,
                     'name': {'en': c.get('set_name')}, 'kind': c.get('set_type')})
    s = sets[set_pos[code]]
    s['count'] += 1
    img = (c.get('image_uris') or ((c.get('card_faces') or [{}])[0].get('image_uris')) or {}).get('normal', '')
    # https://cards.scryfall.io/normal/front/a/b/<id>.jpg?123 → on garde « a/b/<id> »
    im = img.split('/front/')[1].split('.jpg')[0] if '/front/' in img else None
    cols = c.get('colors') if c.get('colors') is not None else ((c.get('card_faces') or [{}])[0].get('colors') or [])
    t = 'Multicolore' if len(cols) > 1 else COL.get(cols[0]) if cols else ('Terrain' if 'Land' in (c.get('type_line') or '') else 'Incolore')
    lang = c.get('lang', 'en')
    n = {'en': c['name']}
    if lang != 'en' and c.get('printed_name'):
        n[lang] = c['printed_name']
    cm = c.get('cardmarket_id')
    p = prices.get(cm) if cm else None
    if not p and (c.get('prices') or {}).get('eur'):  # cote Cardmarket relayée par Scryfall
        e = float(c['prices']['eur']); f = (c['prices'] or {}).get('eur_foil')
        p = [None, e, None, float(f) if f else None, None, None]
    card = {'n': n, 'num': c.get('collector_number'), 's': set_pos[code], 'i': ills(c.get('artist')),
            'r': rars(RAR.get(c.get('rarity'), c.get('rarity'))), 't': types(t), 'cm': cm, 'p': p, 'im': im}
    if lang != 'en': card['lg'] = lang
    if c.get('foil') and not c.get('nonfoil'): card['f'] = 1
    cards.append(card)

write(dst, 'mtg', cards, sets, ills, rars, types,
      'https://cards.scryfall.io/{size}/front/{im}.jpg', 'Cardmarket', gdate,
      {'credits': 'Fiches et images : Scryfall. Magic: The Gathering © Wizards of the Coast.'})
