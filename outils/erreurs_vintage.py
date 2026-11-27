"""Erreurs d'impression et variantes connues des cartes Pokémon vintage (Wizards, 1999-2003).

Source : outils/erreurs-vintage.json (liste lue sur Bulbapedia « Error cards » et Poképédia « Carte avec erreur »,
gardée aussi dans les fichiers du projet, donnees/erreurs-impression/). Ce script la relie aux cartes de
data/cards.json (même set, même nom anglais, ou numéros « 1 à 16/64 ») et écrit data/erreurs.json :
  e      : les erreurs [sorte, tirage, langue, texte]
  cartes : clé de carte → numéros des erreurs qui la concernent
Usage : python3 outils/erreurs_vintage.py
"""
import json, re, sys

SETS = {"Set de Base": "base1", "Jungle": "base2", "Fossile": "base3", "Base Set 2": "base4", "Team Rocket": "base5",
        "Gym Heroes": "gym1", "Gym Challenge": "gym2", "Neo Genesis": "neo1", "Neo Discovery": "neo2",
        "Neo Revelation": "neo3", "Neo Destiny": "neo4", "Promo Wizards": "basep"}
norm = lambda s: re.sub(r'[^a-z0-9]', '', s.lower().replace('♂', 'm').replace('♀', 'f'))

src = json.load(open('outils/erreurs-vintage.json', encoding='utf-8'))
db = json.load(open('data/cards.json', encoding='utf-8'))
sets = {i: s for i, s in enumerate(db['sets']) if s['reg'] == 'en' and s['id'] in SETS.values()}
par_nom, par_num = {}, {}
for c in db['cards']:
    s = sets.get(c['s'])
    if not s: continue
    key = f"en:{s['id']}:{c['num']}"
    par_nom.setdefault((s['id'], norm(c['n'].get('en', ''))), []).append(key)
    par_num[(s['id'], c['num'])] = key

out, cartes, sans = [], {}, []
for x in src['erreurs']:
    sid = SETS[x['set']]
    keys = []
    if x['carte'].startswith('('):          # tout un groupe de cartes : seulement si une plage de numéros est donnée
        m = re.match(r'(\d+) à (\d+)', x['numero'] or '')
        if m: keys = [par_num[(sid, str(n))] for n in range(int(m[1]), int(m[2]) + 1) if (sid, str(n)) in par_num]
    else:
        keys = par_nom.get((sid, norm(x['carte'].split(' (')[0])), [])
    if not keys:
        if not x['carte'].startswith('('): sans.append(x['set'] + ' · ' + x['carte'])
        continue
    out.append([x['type'], x['tirage'], x['langue'], x['description']])
    for k in keys: cartes.setdefault(k, []).append(len(out) - 1)

json.dump({'lu_le': src['lu_le'], 'e': out, 'cartes': cartes}, open('data/erreurs.json', 'w', encoding='utf-8'),
          ensure_ascii=False, separators=(',', ':'))
print(len(out), 'erreurs reliées à', len(cartes), 'cartes')
if sans: print('Sans carte trouvée :', *sans, sep='\n  '); sys.exit(1)
