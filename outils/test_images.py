"""Essais du contrôle des images, sans réseau : une image ne doit jamais être celle d'une autre carte.

1. Le rapprochement avec la 2e source d'images (pokemontcg.io).
2. L'image d'un autre set, pour une carte qui n'en a aucune.

Lancé par GitHub à chaque PR qui touche au contrôle des images (.github/workflows/tests.yml).
Usage : python3 outils/test_images.py
"""
import json, os, sys, time, types

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import verifier_images as V
VRAIES = (V.series_ptcg, V.cartes_ptcg, V.lire_json, V.time)

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
    'sve': [p('1', 'Basic Grass Energy', sid='sve'), p('2', 'Fire Energy', sid='sve'), p('3', 'Water Energy', sid='sve'), p('4', 'Double Turbo Energy', sid='sve'),
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


def lance(mask=None, absentes=(), ancien=None, panne=False, series_en_panne=(), muettes=()):
    V.series_ptcg = lambda: None if panne else PTCG_SETS
    V.cartes_ptcg = lambda sid: None if sid in series_en_panne else PTCG_CARDS.get(sid, [])
    V.exists = lambda url: not any(a in url for a in absentes + muettes)
    V.reponse = lambda url: None if any(a in url for a in muettes) else not any(a in url for a in absentes)
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
verifie('Énergies : « Basic Grass Energy » (pokemontcg.io) est notre « Grass Energy »', r.get(str(I['sve', '001'])) == 'sve/1' and V.sans_basic('basicenergy') == 'energy' and V.sans_basic('basicgrass') == 'basicgrass')
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
# 9 bis. Le serveur d'images ne répond pas nettement (panne passagère) : l'image du relevé précédent reste si c'était
#        la même ; sans relevé précédent, ou s'il disait autre chose, rien n'est retenu
r = lance(muettes=('xy10/3.png', 'xy10/2.png'), ancien={'ptcg': {str(I['xy10', '3']): 'xy10/3', str(I['xy10', '2']): 'xy10/9'}})
verifie('serveur muet : image du relevé précédent gardée', r.get(str(I['xy10', '3'])) == 'xy10/3')
verifie('serveur muet : relevé précédent différent, rien retenu', str(I['xy10', '2']) not in r)
verifie('serveur muet sans relevé précédent : rien retenu', str(I['xy10', '3']) not in lance(muettes=('xy10/3.png',)))
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
# 10 bis. Le service de pokemontcg.io ne répond pas : sa copie publique prend le relais, et après 3 échecs de suite
#         on cesse de demander le service
appels = []


def faux_json(url, essais=3, pause=5, service=None):
    appels.append(url)
    if url.startswith(V.API):
        return service
    if url == V.COPIE + 'sets/en.json':
        return [{'id': 'sve', 'name': 'Scarlet & Violet Energies', 'releaseDate': '2023/03/31'}]
    if url == V.COPIE + 'cards/en/sve.json':
        return [{'id': 'sve-1', 'number': '1', 'name': 'Basic Grass Energy', 'images': {'small': 'https://images.pokemontcg.io/sve/1.png'}},
                {'id': 'sve-2', 'number': '2', 'name': 'Basic Fire Energy', 'images': {'small': 'https://images.pokemontcg.io/sve/2_hires.png'}}]
    return None


V.series_ptcg, V.cartes_ptcg = VRAIES[0], VRAIES[1]
V.time = types.SimpleNamespace(time=lambda: 0.0, sleep=lambda s: None, mktime=time.mktime, strptime=time.strptime)
V.lire_json = faux_json
V._cartes.clear(); V.SANS_SERVICE[0] = 0; V.COPIE_LUE[0] = 0
series, pc, pc2, pc3 = V.series_ptcg(), V.cartes_ptcg('sve'), V.cartes_ptcg('xy10'), V.cartes_ptcg('mcd11')
verifie('service en panne : séries lues dans la copie', bool(series) and series[0]['id'] == 'sve')
verifie('service en panne : cartes lues dans la copie (image _hires écartée)', pc == [{'num': '1', 'name': 'Basic Grass Energy', 'dex': [], 'art': '', 'path': 'sve/1'}])
verifie('service et copie en panne : série non lue', pc2 is None and pc3 is None and 'xy10' not in V._cartes)
verifie('service en panne : plus demandé après 3 échecs de suite', sum(u.startswith(V.API) for u in appels) == 3 and V.COPIE_LUE[0] == 2)
appels.clear(); V._cartes.clear(); V.SANS_SERVICE[0] = 0; V.COPIE_LUE[0] = 0
V.lire_json = lambda url, essais=3, pause=5: faux_json(url, service={'data': [{'id': 'base1', 'name': 'Base'}]} if 'sets?' in url else {'data': []})
verifie('service qui répond : la copie n’est pas lue', V.series_ptcg() == [{'id': 'base1', 'name': 'Base'}] and V.cartes_ptcg('base1') == [] and V.COPIE_LUE[0] == 0 and V.SANS_SERVICE[0] == 0)
V.series_ptcg, V.cartes_ptcg, V.lire_json, V.time = VRAIES
# 11. Écritures d'un numéro
verifie('variantes', V.variantes('003') == ['003', '3'] and V.variantes('H03') == ['H03', 'H3'] and V.variantes('SWSH299') == ['SWSH299'] and V.variantes('54a') == ['54a'])
verifie('masque relu', V.lire_masque('0001zz', 3) == [0, 1, 1295])


# ---------- Image d'un autre set ----------
ESETS = [
    {'id': 'J1', 'reg': 'ja', 'serie': 'SV', 'name': {'ja': 'バイオレットex'}},
    {'id': 'E1', 'reg': 'en', 'serie': 'sv', 'name': {'en': 'Jumeau occidental'}},
    {'id': 'E2', 'reg': 'en', 'serie': 'sv', 'name': {'en': 'Set peu lié'}},
    {'id': 'E3', 'reg': 'en', 'serie': 'sv', 'name': {'en': 'Second jumeau'}},
    {'id': 'PR', 'reg': 'en', 'serie': 'sv', 'name': {'en': 'SV Black Star Promos'}},
    {'id': 'X', 'reg': 'en', 'serie': 'xy', 'name': {'en': 'Évolutions'}},
    {'id': 'M', 'reg': 'ja', 'serie': 'M', 'name': {'ja': 'スタートデッキ'}},
    {'id': 'K', 'reg': 'en', 'serie': 'mc', 'name': {'en': 'Petit set'}},
    {'id': 'KF', 'reg': 'en', 'serie': 'mc', 'name': {'fr': 'Petit set français'}},
    {'id': 'G', 'reg': 'en', 'serie': 'mc', 'name': {'en': 'Grand set'}},
    {'id': 'GF', 'reg': 'en', 'serie': 'mc', 'name': {'fr': 'Grand set français'}},
    {'id': 'JP', 'reg': 'ja', 'serie': 'SV', 'name': {'ja': 'プロモカード'}},
]
ES = {s['id']: i for i, s in enumerate(ESETS)}
ERARS = ['Common', 'Uncommon', 'Secret Rare', 'Promo', 'None']
ECARDS, FICHE, IMAGE = [], {}, []


def ce(serie, fiche, ill=0, rar='Common', dex=None, image=True):
    """Une carte d'essai : sa fiche Cardmarket, son illustrateur, sa rareté, et si elle a une image à elle."""
    c = {'s': ES[serie], 'num': str(len(ECARDS)), 'n': {}, 'cm': 1000 + len(ECARDS)}
    if ill is not None: c['i'] = ill
    if rar is not None: c['r'] = ERARS.index(rar)
    if dex: c['dex'] = dex
    if fiche: FICHE[c['cm']] = fiche
    ECARDS.append(c); IMAGE.append(image)
    return len(ECARDS) - 1


def relie(a, b, n, depart):
    """n fiches qui ont chacune une carte dans le set a et une dans le set b : ce qui fait de deux sets des jumeaux."""
    for k in range(n):
        ce(a, depart + k); ce(b, depart + k)


relie('J1', 'E1', 12, 100)      # J1 et E1 jumeaux (12 liens entre régions : il en faut 10)
relie('J1', 'E3', 10, 200)      # J1 et E3 aussi, un peu moins
relie('J1', 'E2', 3, 300)       # J1 et E2 : 3 liens, pas assez
relie('J1', 'X', 12, 400)       # J1 et X : assez de liens, mais pas la même génération
relie('M', 'E1', 12, 500)       # M (Méga-Évolution) et E1 (Écarlate et Violet) : générations voisines
relie('E1', 'E3', 12, 600)      # E1 et E3, même région : 12 liens ne suffisent pas (il en faut 20)
relie('K', 'KF', 8, 700)        # deux petits sets entièrement jumeaux : 8 liens sur 8 cartes
relie('G', 'GF', 8, 800)        # deux sets plus grands : 8 liens sur 20 cartes, pas assez
relie('JP', 'E1', 12, 1100)     # un set promo japonais très lié à E1 : une promo n'emprunte quand même rien
for k in range(12):
    ce('G', 900 + k); ce('GF', 950 + k)
for k in range(20):
    ce('E3', 1000 + k)          # E3 a bien d'autres cartes : ses liens avec E1 n'en couvrent pas 60 %
T = {}
T['simple'] = ce('J1', 1, image=False); T['simple_d'] = ce('E1', 1)
T['peu'] = ce('J1', 2, image=False); ce('E2', 2)
T['promo'] = ce('J1', 3, image=False); ce('PR', 3)
T['promo_r'] = ce('J1', 4, image=False); ce('E1', 4, rar='Promo')
T['promo_ja'] = ce('JP', 5, image=False); ce('E1', 5)
T['deux'] = ce('J1', 6, image=False); ce('E1', 6); ce('E1', 6)
T['mixte_inconnue'] = ce('J1', 7, rar=None, image=False); ce('E1', 7, rar='Uncommon'); ce('E3', 7, rar='Secret Rare')
T['mixte_meme'] = ce('J1', 8, rar='Uncommon', image=False); T['mixte_meme_d'] = ce('E1', 8, rar='Common'); ce('E3', 8, rar='Secret Rare')
T['mixte_autre'] = ce('J1', 9, rar='Secret Rare', image=False); ce('E1', 9, rar='Uncommon')
T['inconnue'] = ce('J1', 10, rar='None', image=False); T['inconnue_d'] = ce('E1', 10, rar='Secret Rare')
T['espece'] = ce('J1', 11, dex=25, image=False); ce('E1', 11, dex=26)
T['illustrateur'] = ce('J1', 12, ill=0, image=False); ce('E1', 12, ill=1)
T['sans_illustrateur'] = ce('J1', 13, ill=None, image=False); ce('E1', 13, ill=None)
T['sans_fiche'] = ce('J1', None, image=False)
T['generation'] = ce('J1', 14, image=False); ce('X', 14)
T['voisines'] = ce('M', 15, image=False); T['voisines_d'] = ce('E1', 15)
T['meme_region'] = ce('E3', 16, image=False); ce('E1', 16)
T['petit'] = IMAGE.index(True, next(i for i, c in enumerate(ECARDS) if c['s'] == ES['KF'])); IMAGE[T['petit']] = False
T['grand'] = next(i for i, c in enumerate(ECARDS) if c['s'] == ES['GF']); IMAGE[T['grand']] = False
T['plus_lie'] = ce('J1', 17, image=False); T['plus_lie_d'] = ce('E1', 17); ce('E3', 17)
T['sans_image'] = ce('J1', 18, image=False); ce('E1', 18, image=False); T['sans_image_d'] = ce('E3', 18)
T['rarete'] = ce('J1', 19, rar='Uncommon', image=False); ce('E1', 19, rar='Common'); T['rarete_d'] = ce('E1', 20, rar='Uncommon')
FICHE[ECARDS[T['rarete_d']]['cm']] = 19   # même fiche, mais deux cartes dans E1 : groupe écarté
T['avec_image'] = ce('J1', 21); ce('E1', 21)
ED = {'cards': ECARDS, 'sets': ESETS, 'ills': ['Ken Sugimori', 'Mitsuhiro Arita'], 'rars': ERARS, 'generated': 'essai'}
alt = V.editions(ED, IMAGE, FICHE)
a = lambda nom: alt.get(str(T[nom]))
verifie('autre set : carte japonaise ← sa jumelle occidentale', a('simple') == T['simple_d'])
verifie('autre set : sets trop peu liés', a('peu') is None)
verifie('autre set : jamais une promo (set promo, rareté Promo, set promo japonais)', a('promo') is None and a('promo_r') is None and a('promo_ja') is None)
verifie('autre set : deux cartes de la fiche dans le même set', a('deux') is None and a('rarete') is None)
verifie('autre set : fiche à version ordinaire et spéciale, rareté inconnue', a('mixte_inconnue') is None)
verifie('autre set : fiche à deux versions, ordinaire ← ordinaire', a('mixte_meme') == T['mixte_meme_d'])
verifie('autre set : ordinaire et spéciale ne se prêtent rien', a('mixte_autre') is None)
verifie('autre set : rareté inconnue, fiche à une seule version', a('inconnue') == T['inconnue_d'])
verifie('autre set : autre espèce', a('espece') is None)
verifie('autre set : autre illustrateur, pas d’illustrateur, pas de fiche', a('illustrateur') is None and a('sans_illustrateur') is None and a('sans_fiche') is None)
verifie('autre set : autre génération de cartes', a('generation') is None)
verifie('autre set : générations voisines (Écarlate et Violet, Méga-Évolution)', a('voisines') == T['voisines_d'])
verifie('autre set : même région, 17 liens ne suffisent pas', a('meme_region') is None)
verifie('autre set : petits sets entièrement jumeaux', a('petit') is not None and ESETS[ECARDS[a('petit')]['s']]['id'] == 'K')
verifie('autre set : 8 liens sur 20 cartes ne suffisent pas', a('grand') is None)
verifie('autre set : le set le plus lié prête son image', a('plus_lie') == T['plus_lie_d'])
verifie('autre set : la carte qui prête doit avoir une image', a('sans_image') == T['sans_image_d'])
verifie('autre set : une carte qui a son image n’emprunte rien', a('avec_image') is None and all(not IMAGE[int(i)] and IMAGE[j] for i, j in alt.items()))
# Sans catalogue : les liens du relevé précédent qui tiennent encore
V.print = lambda *x, **k: None
vieux = {'cards': 'essai', 'alt': {str(T['simple']): T['simple_d'], str(T['avec_image']): T['simple_d'], str(T['peu']): T['sans_image'], '999999': 0}}
verifie('autre set : sans catalogue, liens encore valables gardés', V.liens_editions(ED, IMAGE, vieux, None) == {str(T['simple']): T['simple_d']})
verifie('autre set : sans catalogue, relevé d’une autre base écarté', V.liens_editions(ED, IMAGE, dict(vieux, cards='autre'), None) == {})
verifie('autre set : catalogue introuvable', V.liens_editions(ED, IMAGE, vieux, '/introuvable.json.gz') == {str(T['simple']): T['simple_d']})
# Images fausses à la source : écartées du relevé, la carte montre alors celle de sa jumelle
V.FAUSSES = [('ja', 'J1', 2, 6, 'essai')]   # les numéros d'essai du set J1 vont de 2 en 2
j1 = [i for i, c in enumerate(ECARDS) if c['s'] == ES['J1']]
verifie('images fausses : seulement le set et les numéros inscrits', [V.fausse(ED, ECARDS[i]) for i in j1[:7]] == [False, True, True, True, False, False, False]
        and not any(V.fausse(ED, c) for c in ECARDS if c['s'] != ES['J1']))
masque = [1 if x else 0 for x in IMAGE]
verifie('images fausses : retirées du relevé', V.ecarte_fausses(ED, masque) == 3 and [masque[i] for i in j1[:5]] == [1, 0, 0, 0, 1] and V.ecarte_fausses(ED, masque) == 0)
alt2 = V.editions(ED, [bool(m) for m in masque], FICHE)
verifie('images fausses : la carte montre l’image de sa jumelle', all(str(i) in alt2 and ESETS[ECARDS[alt2[str(i)]]['s']]['id'] == 'E1' for i in j1[1:4]))
V.FAUSSES = []
verifie('images fausses : liste vide, rien d’écarté', V.ecarte_fausses(ED, [1] * len(ECARDS)) == 0)

# La vraie base : chaque rareté et chaque série japonaise doit être rangée, sinon la règle la traiterait au hasard
racine = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if os.path.exists(os.path.join(racine, 'data', 'cards.json')):
    base = json.load(open(os.path.join(racine, 'data', 'cards.json'), encoding='utf-8'))
    inconnues = set(base['rars']) - V.ORDINAIRES - V.SPECIALES - {'None', 'Promo'}
    verifie('raretés de la base toutes rangées (ordinaire ou spéciale) : %s' % sorted(inconnues), not inconnues)
    series = {s.get('serie') for s in base['sets'] if s['reg'] == 'ja'} - set(V.BLOCS) - {'neo', 'VS', 'web', 'misc'}
    verifie('séries japonaises toutes rattachées à une génération : %s' % sorted(series), not series)
    # Le relevé du dépôt : un lien « alt » part d'une carte sans image et arrive sur une carte qui a la sienne
    try:
        im = json.load(open(os.path.join(racine, 'data', 'images.json')))
    except Exception:
        im = {}
    if im.get('cards') == base['generated']:
        masque = V.lire_masque(im['mask'], len(base['cards']))
        img = [bool(m) or str(i) in im.get('ptcg', {}) for i, m in enumerate(masque)]
        liens = im.get('alt') or {}
        verifie('data/images.json : %d liens « alt », tous d’une carte sans image vers une carte qui a la sienne' % len(liens),
                all(int(i) < len(img) and isinstance(j, int) and 0 <= j < len(img) and not img[int(i)] and img[j] for i, j in liens.items()))

print('%d OK, %d échec%s' % (ok, bad, '' if bad < 2 else 's'))
sys.exit(1 if bad else 0)
