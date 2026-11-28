"""Boutiques d'Overture Maps -> petites tuiles pour « En voyage ».

Entrée : la liste triée par le fil du 28/11/2026 (boutiques-europe-vert-orange.json, dans le dossier du projet,
donnees/boutiques/overture/), tirée du thème « places » d'Overture Maps, version 2026-11-18.0
(licence CDLA-Permissive-2.0). Aucune donnée Google.

Sortie : data/boutiques-o/<lat>_<lon>.json, une tuile par carré de 1° (≈ 110 km), que l'appli charge
seulement autour de la ville cherchée. Chaque boutique : [id, nom, lat, lon, type, sûr, adresse, ville, site].
- id : identifiant Overture sans tirets (32 caractères), précédé de « o » dans l'appli ;
- type : même code que les boutiques OpenStreetMap (games, hobby, comics, toys, video_games) ;
- sûr : 1 si le nom parle de cartes à collectionner (TCG, Pokémon, trading cards…).

Usage : python3 outils/boutiques/overture_tuiles.py chemin/vers/boutiques-europe-vert-orange.json
"""
import json, math, os, re, shutil, sys

SRC = sys.argv[1] if len(sys.argv) > 1 else '/mnt/project-files/donnees/boutiques/overture/boutiques-europe-vert-orange.json'
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'boutiques-o')
KIND = {'hobby_shop': 'hobby', 'comic_books_store': 'comics', 'toy_store': 'toys', 'video_game_store': 'video_games'}

def clean(s, n):
    s = re.sub(r'\s+', ' ', str(s or '')).strip()
    return s[:n]

def site(u):
    u = clean(u, 200)
    if not u: return ''
    if not re.match(r'^https?://', u, re.I): u = 'https://' + u
    # pas de liens vers des réseaux ou des annuaires : seulement le site de la boutique
    if re.search(r'facebook\.|instagram\.|google\.|goo\.gl|yelp\.|tripadvisor\.|linktr\.ee', u, re.I): return ''
    return u

rows = json.load(open(SRC))
tiles = {}
for o in rows:
    if o['niv'] not in ('vert', 'orange'): continue
    nom = clean(o['nom'], 80)
    if not nom: continue
    lat, lon = round(o['lat'], 5), round(o['lon'], 5)
    sure = 1 if o['niv'] == 'vert' else 0
    kind = 'games' if sure else KIND.get(o['cat'], 'games')
    ville = clean(o['ville'], 40)
    ville = ville.title() if ville.isupper() else ville
    adr = clean(o['adresse'], 100)
    adr = ', '.join(x for x in [adr, ville] if x)
    k = f'{math.floor(lat)}_{math.floor(lon)}'
    tiles.setdefault(k, []).append([o['id'].replace('-', ''), nom, lat, lon, kind, sure, adr, ville, site(o['site'])])

shutil.rmtree(OUT, ignore_errors=True)
os.makedirs(OUT)
for k, lst in tiles.items():
    lst.sort(key=lambda r: (-r[5], r[1]))
    with open(os.path.join(OUT, k + '.json'), 'w') as f:
        json.dump(lst, f, ensure_ascii=False, separators=(',', ':'))
with open(os.path.join(OUT, 'index.json'), 'w') as f:
    json.dump({'source': 'Overture Maps Foundation, places 2026-11-18.0', 'licence': 'CDLA-Permissive-2.0',
               'tuiles': sorted(tiles)}, f, separators=(',', ':'))
print(len(tiles), 'tuiles,', sum(len(v) for v in tiles.values()), 'boutiques')
