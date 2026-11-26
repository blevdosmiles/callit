"""Essais du rapprochement avec la 2e source d'images, sans réseau : une image ne doit jamais être celle d'une autre carte.

Lancé par GitHub à chaque PR qui touche au contrôle des images (.github/workflows/tests.yml).
Usage : python3 outils/test_images.py
"""
import os, sys

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import verifier_images as V

# ---------- Une petite base et un petit pokemontcg.io ----------
ILLS = ['Ken Sugimori', 'Mitsuhiro Arita', 'kawayoo']
SETS = [
    {'id': 'tk-hs-g', 'reg': 'en', 'date': '2010-05-01', 'name': {'en': 'HS trainer Kit (Gyarados)'}},
    {'id': '2011bw', 'reg': 'en', 'date': '2011-06-17', 'name': {'en': "McDonald's Collection 2011"}},
    {'id': 'sve', 'reg': 'en', 'date': '2023-03-31', 'name': {'en': 'Scarlet & Violet Energy'}},
    {'id': 'cel25cc', 'reg': 'en', 'date': '2021-10-08', 'name': {'en': 'Celebrations Classic Collection'}},
    {'id': 'miscp', 'reg': 'en', 'date': '1996-01-01', 'name': {'en': 'Miscellaneous Promos'}},
    {'id': 'petite', 'reg': 'en', 'date': '2015-01-10', 'name': {'en': 'Petite série'}},
    {'id': 'SV1', 'reg': 'ja', 'date': '2023-01-20', 'name': {'ja': 'スカーレットex'}},
    {'id': 'xy10', 'reg': 'en', 'date': '2016-05-02', 'name': {'en': 'Fates Collide'}},
]
S = {s['id']: i for i, s in enumerate(SETS)}


def carte(serie, num, en=None, dex=None, ill=None, fr=None):
    c = {'s': S[serie], 'num': num, 'n': {}}
    if en: c['n']['en'] = en
    if fr: c['n']['fr'] = fr
    if dex: c['dex'] = dex
    if ill is not None: c['i'] = ill
    return c


CARDS = [
    # Kit HS (Léviator) : pokemontcg.io n'a que les kits EX, aux mêmes numéros
    carte('tk-hs-g', '1', 'Totodile', 158, 2), carte('tk-hs-g', '2', 'Water Energy'), carte('tk-hs-g', '3', 'Water Energy'),
    carte('tk-hs-g', '12', 'Magikarp', 129, 1),
    # McDonald's 2011 : dans notre base le nom anglais est celui de l'attaque, l'espèce est juste
    carte('2011bw', '1', 'Slam', 495, 0), carte('2011bw', '2', 'Mega Drain', 556), carte('2011bw', '3', 'Ember', 498, 0), carte('2011bw', '4', 'Water Pulse', 501, 0),
    # Énergies : pas d'espèce, le nom fait foi ; la 017 n'existe pas en face, la 004 porte un autre nom
    carte('sve', '001', 'Grass Energy'), carte('sve', '002', 'Fire Energy'), carte('sve', '003', 'Water Energy'), carte('sve', '004', 'Lightning Energy'),
    carte('sve', '005', 'Psychic Energy'), carte('sve', '006', 'Fighting Energy'), carte('sve', '017', 'Grass Energy'),
    # Collection Classique : numérotée CC001… chez nous, 2_A, 4_A… en face
    carte('cel25cc', 'CC001', 'Blastoise', 9, 0), carte('cel25cc', 'CC002', 'Charizard', 6, 1), carte('cel25cc', 'CC003', 'Venusaur', 3, 1),
    carte('cel25cc', 'CC008', "_____'s Pikachu", 25, 0), carte('cel25cc', 'CC009', 'Pikachu', 25, 1),
    # Mew Antique : seule carte de sa série
    carte('miscp', '001', 'Ancient Mew', 151),
    # Série de 2 cartes dont une voisine de calendrier a les mêmes espèces aux mêmes numéros
    carte('petite', '1', 'Pikachu', 25, 0), carte('petite', '2', 'Eevee', 133, 0),
    # Carte asiatique : jamais cherchée dans la 2e source
    carte('SV1', '001', None, 1),
    # Série reliée par son identifiant, noms écrits un peu autrement
    carte('xy10', '1', 'Pokémon Communication'), carte('xy10', '2', 'Professor’s Letter'), carte('xy10', '3', 'Weedle', 13, 0), carte('xy10', 'H03', 'Ariados', 168, 0),
]
D = {'cards': CARDS, 'sets': SETS, 'ills': ILLS, 'generated': 'essai'}
I = {(SETS[c['s']]['id'], c['num']): i for i, c in enumerate(CARDS)}


def p(num, name, dex=None, art='', path=None, sid=''):
    return {'num': num, 'name': name, 'dex': dex or [], 'art': art, 'path': path or sid + '/' + num}


PTCG_SETS = [
    {'id': 'tk2a', 'name': 'EX Trainer Kit 2 Plusle', 'releaseDate': '2010/05/10'},   # date rapprochée exprès
    {'id': 'mcd11', 'name': "McDonald's Collection 2011", 'releaseDate': '2011/06/17'},
    {'id': 'sve', 'name': 'Scarlet & Violet Energies', 'releaseDate': '2023/03/31'},
    {'id': 'cel25c', 'name': 'Celebrations: Classic Collection', 'releaseDate': '2021/10/08'},
    {'id': 'np', 'name': 'Nintendo Black Star Promos', 'releaseDate': '1996/01/15'},
    {'id': 'voisine', 'name': 'Autre série', 'releaseDate': '2015/01/20'},
    {'id': 'xy10', 'name': 'Fates Collide', 'releaseDate': '2016/05/02'},
]
PTCG_CARDS = {
    'tk2a': [p('1', 'Bulbasaur', [1], sid='tk2a'), p('2', 'Water Energy', sid='tk2a'), p('3', 'Water Energy', sid='tk2a'), p('12', 'Plusle', [311], sid='tk2a')],
    'mcd11': [p('1', 'Snivy', [495], 'Ken Sugimori', sid='mcd11'), p('2', 'Maractus', [556], sid='mcd11'), p('3', 'Pansear', [513], sid='mcd11'), p('4', 'Oshawott', [501], sid='mcd11')],
    'sve': [p('1', 'Grass Energy', sid='sve'), p('2', 'Fire Energy', sid='sve'), p('3', 'Water Energy', sid='sve'), p('4', 'Basic Lightning Energy', sid='sve'),
            p('5', 'Psychic Energy', sid='sve'), p('6', 'Fighting Energy', sid='sve')],
    'cel25c': [p('2', 'Blastoise', [9], 'Ken Sugimori', 'cel25c/2_A'), p('4', 'Charizard', [6], 'Mitsuhiro Arita', 'cel25c/4_A'), p('15', 'Venusaur', [3], 'Mitsuhiro Arita', 'cel25c/15_A1'),
               p('24', "_____'s Pikachu", [25], 'Ken Sugimori', 'cel25c/24_A'), p('60', 'Pikachu', [25], 'Mitsuhiro Arita', 'cel25c/60_A')],
    'np': [p('1', 'Kyogre ex', [382], sid='np')],
    'voisine': [p('1', 'Pikachu', [25], sid='voisine'), p('2', 'Eevee', [133], sid='voisine')],
    'xy10': [p('1', 'Pokemon Communication', sid='xy10'), p('2', "Professor's Letter", sid='xy10'), p('3', 'Weedle', [13], sid='xy10'), p('H3', 'Ariados', [168], sid='xy10')],
}

ok = bad = 0


def verifie(quoi, cond):
    global ok, bad
    if cond: ok += 1
    else:
        bad += 1; print('ÉCHEC :', quoi)


def lance(mask=None, absentes=(), ancien=None, panne=False, series_en_panne=()):
    V.series_ptcg = lambda: None if panne else PTCG_SETS
    V.cartes_ptcg = lambda sid: None if sid in series_en_panne else PTCG_CARDS.get(sid, [])
    V.exists = lambda url: not any(a in url for a in absentes)
    V.print = lambda *a, **k: None
    return V.seconde_source(D, mask or [0] * len(CARDS), ancien or {})


r = lance()
# 1. Mêmes numéros, autre série : rien, pas même les Énergies qui portent le même nom
for num in ('1', '2', '3', '12'):
    verifie('kit HS n° %s : pas d’image d’un kit EX' % num, str(I['tk-hs-g', num]) not in r)
# 2. La série concorde à 3 cartes sur 4 (75 %) : pas assez
verifie('McDonald’s 2011 : 3 cartes sur 4 ne suffisent pas', not any(str(I['2011bw', n]) in r for n in '1234'))
PTCG_CARDS['mcd11'][2] = p('3', 'Pansear', [498, 513], sid='mcd11')
r = lance()
verifie('McDonald’s 2011 : reconnue par l’espèce malgré le nom d’attaque', r.get(str(I['2011bw', '1'])) == 'mcd11/1' and r.get(str(I['2011bw', '4'])) == 'mcd11/4')
# 3. Énergies par le nom ; la carte au nom différent et la carte absente restent sans image
verifie('Énergies : même nom, même numéro', r.get(str(I['sve', '001'])) == 'sve/1' and r.get(str(I['sve', '006'])) == 'sve/6')
verifie('Énergies : nom différent refusé', str(I['sve', '004']) not in r)
verifie('Énergies : carte absente en face', str(I['sve', '017']) not in r)
# 4. Numérotation différente dans une série de même nom : par l'espèce, départagée par l'illustrateur
verifie('Collection Classique : Dracaufeu', r.get(str(I['cel25cc', 'CC002'])) == 'cel25c/4_A')
verifie('Collection Classique : les deux Pikachu départagés', r.get(str(I['cel25cc', 'CC008'])) == 'cel25c/24_A' and r.get(str(I['cel25cc', 'CC009'])) == 'cel25c/60_A')
# 5. Mew Antique n'est pas la promo n° 1
verifie('Mew Antique : pas l’image de Kyogre', str(I['miscp', '001']) not in r)
# 6. Deux cartes pareilles dans une série seulement voisine par la date : pas une preuve
verifie('série voisine par la date : 2 cartes ne suffisent pas', str(I['petite', '1']) not in r and str(I['petite', '2']) not in r)
# 7. Carte asiatique jamais cherchée ; noms à accents et apostrophes ; numéro H03 → H3
verifie('carte asiatique laissée de côté', str(I['SV1', '001']) not in r)
verifie('noms écrits autrement', r.get(str(I['xy10', '1'])) == 'xy10/1' and r.get(str(I['xy10', '2'])) == 'xy10/2')
verifie('numéro H03 retrouvé en H3', r.get(str(I['xy10', 'H03'])) == 'xy10/H3')
# 8. Une carte qui a déjà son image TCGdex n'est pas cherchée, mais sert à reconnaître la série
m = [0] * len(CARDS); m[I['xy10', '1']] = 1
r = lance(mask=m)
verifie('carte avec image TCGdex : rien à chercher', str(I['xy10', '1']) not in r and str(I['xy10', '3']) in r)
# 9. L'image annoncée ne répond pas : pas retenue
r = lance(absentes=('xy10/3.png',))
verifie('image qui ne répond pas', str(I['xy10', '3']) not in r and str(I['xy10', '2']) in r)
# 10. pokemontcg.io en panne : on garde le relevé précédent des séries de confiance, sans les cartes qui ont maintenant
#     leur image TCGdex ; les images prises jadis dans une autre série (kit HS dans un kit EX, Mew Antique) partent
vieux = {'ptcg': {str(I['xy10', '2']): 'xy10/2', str(I['xy10', '1']): 'xy10/1', str(I['2011bw', '1']): 'mcd11/1',
                  str(I['tk-hs-g', '12']): 'tk2a/12', str(I['miscp', '001']): 'np/1', str(I['cel25cc', 'CC002']): 'cel25c/4_A'}}
r = lance(panne=True, ancien=vieux, mask=m)
verifie('panne : séries de confiance gardées', r == {str(I['xy10', '2']): 'xy10/2', str(I['2011bw', '1']): 'mcd11/1', str(I['cel25cc', 'CC002']): 'cel25c/4_A'})
verifie('panne sans relevé précédent', lance(panne=True) == {})
# Une seule série en panne : ses images de confiance restent, les autres séries sont refaites
r = lance(ancien=vieux, series_en_panne=('xy10',))
verifie('série en panne : images gardées', r.get(str(I['xy10', '1'])) == 'xy10/1' and r.get(str(I['xy10', '2'])) == 'xy10/2' and str(I['xy10', '3']) not in r)
verifie('série en panne : le reste est refait', r.get(str(I['sve', '001'])) == 'sve/1' and str(I['tk-hs-g', '12']) not in r and str(I['miscp', '001']) not in r)
r = lance(ancien=vieux, series_en_panne=('tk2a', 'np'))
verifie('série pas sûre en panne : rien gardé', str(I['tk-hs-g', '12']) not in r and str(I['miscp', '001']) not in r)
# 11. Écritures d'un numéro
verifie('variantes', V.variantes('003') == ['003', '3'] and V.variantes('H03') == ['H03', 'H3'] and V.variantes('SWSH299') == ['SWSH299'] and V.variantes('54a') == ['54a'])
verifie('masque relu', V.lire_masque('0001zz', 3) == [0, 1, 1295])

print('%d OK, %d échec%s' % (ok, bad, '' if bad < 2 else 's'))
sys.exit(1 if bad else 0)
