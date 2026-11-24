"""Base Yu-Gi-Oh! pour l'appli.

Source : API gratuite YGOPRODeck (db.ygoprodeck.com, conditions :
ygoprodeck.com/api-guide). On télécharge toute la base en un appel par
langue (≤ 5 appels par semaine, limite : 20 appels par seconde).
Images : YGOPRODeck demande de les héberger soi-même → outils/jeux_images.py
les télécharge une seule fois et les range dans img/ygo/.

Une entrée par impression (code de set + rareté), comme les collectionneurs
les distinguent. Prix par impression : TCGplayer (États-Unis, en dollars,
converti en euros au taux BCE du jour). Cote Cardmarket : une seule par carte
(la moins chère de toutes ses impressions), gardée à part (champ « cml »).

Usage : python3 outils/jeux_yugioh.py dossier_api/ data/rates.json data/jeux/ygo.json
  dossier_api/ contient cardinfo.json, cardinfo_fr.json (de, it, pt), cardsets.json
"""
import json, sys, os
from jeux_commun import Index, write

src, rates_path, dst = sys.argv[1:4]
usd = json.load(open(rates_path))['rates'].get('USD') or 1.08
base = json.load(open(os.path.join(src, 'cardinfo.json'), encoding='utf-8'))['data']
names = {}
for l in ('fr', 'de', 'it', 'pt'):
    p = os.path.join(src, f'cardinfo_{l}.json')
    if os.path.exists(p):
        for c in json.load(open(p, encoding='utf-8')).get('data', []):
            names.setdefault(c['id'], {})[l] = c['name']
dates = {s['set_name']: s.get('tcg_date') for s in json.load(open(os.path.join(src, 'cardsets.json'), encoding='utf-8'))}

ills, rars, types = Index(), Index(), Index()
TYPE = lambda t: 'Magie' if 'Spell' in t else 'Piège' if 'Trap' in t else 'Monstre'
sets, set_pos, cards, seen = [], {}, [], set()
for c in base:
    cml = None
    try: cml = float(c['card_prices'][0]['cardmarket_price']) or None
    except Exception: pass
    im = (c.get('card_images') or [{}])[0].get('id')
    n = {'en': c['name']}; n.update(names.get(c['id'], {}))
    for p in c.get('card_sets') or []:
        sname = p['set_name']
        if sname not in set_pos:
            set_pos[sname] = len(sets)
            sets.append({'id': p['set_code'].split('-')[0], 'reg': 'ygo', 'date': dates.get(sname) or '', 'count': 0, 'name': {'en': sname}})
        s = sets[set_pos[sname]]
        num = p['set_code']
        k = (sname, num, p.get('set_rarity'))
        if k in seen: continue
        seen.add(k)
        key = sname + '|' + num
        if key in seen: num = num + ' ' + (p.get('set_rarity_code') or p.get('set_rarity') or '').strip()
        seen.add(sname + '|' + num)
        s['count'] += 1
        try: sp = float(p.get('set_price') or 0)
        except ValueError: sp = 0
        cards.append({'n': n, 'num': num, 's': set_pos[sname], 'r': rars(p.get('set_rarity')), 't': types(TYPE(c.get('type', ''))),
                      'p': [None, round(sp / usd, 2), None, None, None, None] if sp > 0 else None,
                      'cml': cml, 'im': im, 'yid': c['id']})
for s in sets:
    s['id'] = s['id'] + ('' if list(x['id'] for x in sets).count(s['id']) == 1 else '-' + str(set_pos[s['name']['en']]))

write(dst, 'ygo', cards, sets, ills, rars, types, 'img/ygo/{im}.webp', 'TCGplayer', None,
      {'credits': 'Fiches : YGOPRODeck. Yu-Gi-Oh! © Kazuki Takahashi, Konami. Prix par impression : TCGplayer (États-Unis), convertis en euros.'})
