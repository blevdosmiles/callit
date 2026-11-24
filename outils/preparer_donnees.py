"""Prépare la base de cartes pour l'appli web.

Entrée : donnees/cards.json (base complète construite par build2.py)
Sortie : data/cards.json (même contenu, allégé, avec deux corrections)

Corrections :
 1. Séries asiatiques : l'id de série avait été lu dans le nom indonésien
    (« id: 'Scarlet & Violet' »). On remet le vrai id (SV, S), utilisé
    dans l'adresse des images TCGdex.
 2. Noms déduits du nom du Pokémon : on retire ceux qui ajoutent des mots
    au nom anglais (« Mega Venusaur ex », « Geodude di Alola »), qui viennent
    d'une autre carte.
Usage : python3 outils/preparer_donnees.py chemin/cards.json data/cards.json
"""
import json, sys, collections

src, dst = sys.argv[1:3]
d = json.load(open(src, encoding='utf-8'))

SERIE_FIX = {'Scarlet & Violet': 'SV', 'Pedang & Perisai': 'S'}
for s in d['sets']:
    if s['reg'] == 'ja' and s['serie'] in SERIE_FIX:
        s['serie'] = SERIE_FIX[s['serie']]

removed = 0
for c in d['cards']:
    inf = c.pop('inf', None)
    if not inf:
        continue
    en = c['n'].get('en', '')
    keep = []
    for l in inf:
        v = c['n'].get(l)
        if v and v != en and en and en.lower() in v.lower():
            del c['n'][l]; removed += 1
        else:
            keep.append(l)
    if keep:
        c['inf'] = keep

# Nom français de l'espèce (pour afficher « Pikachu » sous un nom japonais)
cnt = collections.defaultdict(collections.Counter)
for c in d['cards']:
    if c['dex'] and d['sets'][c['s']]['reg'] == 'en' and c['n'].get('fr'):
        cnt[c['dex']][c['n']['fr']] += 1
d['species'] = {str(k): v.most_common(1)[0][0] for k, v in cnt.items()}

# Prix gardés : low, trend, avg30, trendHolo (le guide Cardmarket en a 8)
F = d['priceFields']
keep_idx = [F.index(x) for x in ('low', 'trend', 'avg30', 'trendHolo')]
d['priceFields'] = ['low', 'trend', 'avg30', 'trendHolo']
for c in d['cards']:
    if c['p']:
        c['p'] = [c['p'][i] for i in keep_idx]
    if c['i'] == -1: del c['i']
    if c['r'] == -1: del c['r']
    if c['t'] == -1: del c['t']
    if not c['dex']: del c['dex']
    if not c['f']: del c['f']
    if not c['cm']: del c['cm']
    if not c['p']: del c['p']

s = json.dumps(d, ensure_ascii=False, separators=(',', ':'))
open(dst, 'w', encoding='utf-8').write(s)
print('noms retirés', removed, '· taille', len(s) // 1024, 'Ko')
