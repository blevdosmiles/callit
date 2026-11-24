"""Base One Piece Card Game pour l'appli.

Fiches : jeu de données ouvert « punk-records » (github.com/buhbbl/punk-records),
tiré de la liste officielle des cartes (onepiece-cardgame.com), en anglais
et en français. Images : celles du site officiel ; outils/jeux_images.py en
fait des miniatures (img/op/), la fiche carte affiche l'image officielle.
Prix : guide de prix public Cardmarket (price_guide_18.json). Cardmarket
nomme les cartes « Nom (OP01-001) » ; quand un code a plusieurs versions
(normale, parallèle…), on les relie dans l'ordre (normale = premier produit).

Usage : python3 outils/jeux_onepiece.py dossier/ data/jeux/op.json
  dossier/ contient en_cards.json, fr_cards.json, en_packs.json,
  products_singles_18.json, price_guide_18.json
"""
import json, sys, os, re, collections, html
from jeux_commun import Index, cardmarket_prices, write

src, dst = sys.argv[1:3]
J = lambda f: json.load(open(os.path.join(src, f), encoding='utf-8'))
en = J('en_cards.json'); fr = J('fr_cards.json') if os.path.exists(os.path.join(src, 'fr_cards.json')) else {}
packs = {p['id']: p for p in J('en_packs.json')} if isinstance(J('en_packs.json'), list) else J('en_packs.json')
prices, gdate = cardmarket_prices(os.path.join(src, 'price_guide_18.json'))
cm_by_code = collections.defaultdict(list)
for p in J('products_singles_18.json')['products']:
    m = re.search(r'\(([A-Z0-9]+-\d+)\)', p['name'])
    if m: cm_by_code[m.group(1)].append(p['idProduct'])
for v in cm_by_code.values(): v.sort()

RAR = {'Common': 'Commune', 'Uncommon': 'Peu commune', 'Rare': 'Rare', 'SuperRare': 'Super rare', 'SecretRare': 'Rare secrète',
       'Leader': 'Leader', 'Special': 'Spéciale', 'TreasureRare': 'Trésor rare', 'Promo': 'Promo'}
ills, rars, types = Index(), Index(), Index()
sets, set_pos, cards = [], {}, []
def pack_title(pid):
    p = packs.get(pid) or {}
    t = p.get('title_parts') or {}
    return html.unescape(t.get('title') or p.get('raw_title') or pid).replace('\xa0', ' ').strip()
for cid in sorted(en):
    c = en[cid]
    pid = c.get('pack_id') or '?'
    if pid not in set_pos:
        set_pos[pid] = len(sets)
        label = (packs.get(pid, {}).get('title_parts') or {}).get('label') or ''
        sets.append({'id': label.strip('[]') or pid, 'reg': 'op', 'date': '', 'count': 0, 'name': {'en': pack_title(pid)}})
    sets[set_pos[pid]]['count'] += 1
    code, _, var = cid.partition('_p')
    k = int(var) if var.isdigit() else 0
    ids = cm_by_code.get(code) or []
    cm = ids[k] if k < len(ids) else None
    clean = lambda t: html.unescape(t or '').replace('\xa0', ' ').strip() or None
    n = {'en': clean(c.get('name'))}
    if fr.get(cid, {}).get('name'): n['fr'] = clean(fr[cid]['name'])
    cards.append({'n': n, 'num': cid.replace('_p', ' p'), 's': set_pos[pid], 'r': rars(RAR.get(c.get('rarity'), c.get('rarity'))),
                  't': types(c.get('category')), 'cm': cm, 'p': prices.get(cm) if cm else None, 'im': cid,
                  'url': (c.get('img_url') or '').split('?')[0] or None})
# dates : la plus ancienne date d'ajout Cardmarket des cartes du set
added = {p['idProduct']: p.get('dateAdded', '')[:10] for p in J('products_singles_18.json')['products']}
for i, s in enumerate(sets):
    ds = [added[c['cm']] for c in cards if c['s'] == i and c.get('cm') in added]
    s['date'] = min(ds) if ds else ''
for c in cards:
    if c.get('url') and c['url'].endswith('/' + c['im'] + '.png'): c['url'] = 1  # adresse officielle déduisible
write(dst, 'op', cards, sets, ills, rars, types, 'img/op/{im}.webp', 'Cardmarket', gdate,
      {'credits': 'Fiches : liste officielle des cartes (via punk-records). One Piece © Eiichiro Oda/Shueisha, Toei Animation, Bandai.',
       'fullImage': 'https://en.onepiece-cardgame.com/images/cardlist/card/{im}.png'})
