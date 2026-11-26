"""Mesure, image contre image, si deux cartes de la même fiche Cardmarket ont le même dessin.

La règle « image d'un autre set » (outils/verifier_images.py) prête à une carte sans image celle d'une autre carte :
là, on ne peut rien comparer. On mesure donc la règle là où les deux cartes ont une image, en retirant tour à tour
l'image de chaque carte pour voir laquelle la règle lui prêterait.

Se lance sur GitHub (images.yml, quoi = mesure) : les images ne se lisent que de là. Rien n'est gardé des images,
seulement des nombres. Le journal donne :
 - les témoins (même carte en deux langues, cartes sans rapport, même espèce par deux illustrateurs) ;
 - le résultat de la règle de l'appli : nombre d'essais, nombre d'autres dessins, et les paires fautives ;
 - pour chaque image fautive, la carte du set d'en face à laquelle elle ressemble le plus : une image qui montre
   une autre carte que la sienne se voit ainsi (image fausse à la source).

Le fichier de sortie a une ligne par paire :
  type  P = deux cartes de la même fiche Cardmarket (même nom, mêmes attaques)
        L = la même carte dans deux langues (témoin : même dessin à coup sûr)
        N = deux cartes sans rapport de la même série (témoin : dessins différents)
        D = la même espèce dessinée par deux illustrateurs (témoin difficile : dessins différents)
  i, j  rangs des deux cartes dans data/cards.json
  g     ressemblance des gris de la fenêtre du dessin, au meilleur décalage (1 = identique, 0 = sans rapport)
  c     la plus faible des trois couleurs (rouge, vert, bleu) au même décalage : une version brillante la fait baisser
  k     écart moyen des couleurs, de 0 à 255
  t     ressemblance de la carte entière

Usage : python3 outils/mesure_editions.py catalogue-cardmarket.json.gz [sortie.tsv ou -] [dossier où garder les images]
"""
import collections, gzip, hashlib, io, json, os, random, sys, time, urllib.error, urllib.request
import concurrent.futures as cf

import numpy as np
from PIL import Image

import verifier_images as V

L, H = 240, 336                 # toutes les images sont ramenées à cette taille
ART = (29, 47, 211, 148)        # fenêtre du dessin, commune à toutes les mises en page (12 à 88 % ; 14 à 44 %)
TOUT = (12, 14, 228, 322)       # la carte sans son bord
PANNES = collections.Counter()


def meme_dessin(g, c, k):
    """Le verdict, d'après les témoins du 26/11/2026 : la même carte en deux langues donne g ≥ 0,68 (99 % des cas),
    deux cartes sans rapport g ≤ 0,51 (99 %), la même espèce par deux illustrateurs g ≤ 0,56. Une vieille carte
    numérisée avec une dominante de couleur garde le même dessin (c bas, k bas) ; une version brillante ou dorée non."""
    return (g >= 0.6 and c >= 0.2) or (g >= 0.4 and k < 22)


# ---------- Images ----------
def lire(url, dossier):
    """Les octets d'une image, gardés dans `dossier` d'un lancement à l'autre. None si elle manque."""
    nom = os.path.join(dossier, hashlib.sha1(url.encode()).hexdigest())
    if os.path.exists(nom):
        with open(nom, 'rb') as f:
            return f.read()
    for attente in (0, 2, 8):
        time.sleep(attente)
        try:
            b = urllib.request.urlopen(urllib.request.Request(url, headers=V.UA), timeout=30).read()
            with open(nom + '.tmp', 'wb') as f:
                f.write(b)
            os.replace(nom + '.tmp', nom)
            return b
        except urllib.error.HTTPError as e:
            if e.code in (403, 404):
                PANNES[e.code] += 1
                return None
            PANNES[e.code] += 1
        except Exception as e:
            PANNES[type(e).__name__] += 1
    return None


def empreinte(octets):
    """Deux petites vues d'une image de carte : la fenêtre du dessin (36 × 64) et la carte entière (52 × 36)."""
    try:
        im = Image.open(io.BytesIO(octets)).convert('RGB').resize((L, H), Image.LANCZOS)
    except Exception:
        PANNES['image illisible'] += 1
        return None
    art = np.asarray(im.crop(ART).resize((64, 36), Image.BOX), dtype=np.float32)
    tout = np.asarray(im.crop(TOUT).resize((36, 52), Image.BOX), dtype=np.float32).mean(axis=2)
    return art, tout


def ncc(a, b):
    """Ressemblance de deux vues, sans tenir compte de la luminosité ni du contraste."""
    a = a - a.mean()
    b = b - b.mean()
    n = float(np.sqrt((a * a).sum() * (b * b).sum()))
    return float((a * b).sum() / n) if n > 1e-3 else 0.0


def decale(a, b, dy, dx):
    """Les parties de a et de b qui se recouvrent quand b est décalée de (dy, dx)."""
    h, w = a.shape[:2]
    return (a[max(0, dy):h + min(0, dy), max(0, dx):w + min(0, dx)],
            b[max(0, -dy):h + min(0, -dy), max(0, -dx):w + min(0, -dx)])


def meilleur(a, b, r):
    return max((ncc(*decale(a, b, dy, dx)), dy, dx) for dy in range(-r, r + 1) for dx in range(-r, r + 1))


def compare(x, y):
    """g, c, k, t pour deux empreintes."""
    (ax, tx), (ay, ty) = x, y
    g, dy, dx = meilleur(ax.mean(axis=2), ay.mean(axis=2), 4)
    a, b = decale(ax, ay, dy, dx)
    c = min(ncc(a[:, :, n], b[:, :, n]) for n in range(3))
    h, w = a.shape[:2]
    blocs = lambda v: v[:h - h % 4, :w - w % 8].reshape(4, (h - h % 4) // 4, 8, (w - w % 8) // 8, 3).mean(axis=(1, 3))
    k = float(np.abs(blocs(a) - blocs(b)).mean())
    return g, c, k, meilleur(tx, ty, 1)[0]


# ---------- Paires ----------
def adresses(d, im, mask, i):
    """Les adresses des images de la carte i, première langue d'abord, avec leur langue."""
    c = d['cards'][i]
    out = [(V.tcg(d, c, l), l) for b, l in enumerate(V.BASE[d['sets'][c['s']]['reg']]) if mask[i] >> b & 1]
    if not out and str(i) in im.get('ptcg', {}):
        out = [('https://images.pokemontcg.io/' + im['ptcg'][str(i)] + '.png', 'ptcg')]
    return out


def paires(d, im, mask, meta, hasard):
    """Les paires à mesurer : (type, i, j). Pour L, i = j et l'on compare ses deux premières langues."""
    cards = d['cards']
    a_image = [bool(mask[i]) or str(i) in im.get('ptcg', {}) for i in range(len(cards))]
    fiches = collections.defaultdict(list)
    for i, c in enumerate(cards):
        if a_image[i] and meta.get(c.get('cm')):
            fiches[meta[c['cm']]].append(i)
    out = [('P', i, j) for g in fiches.values() for n, i in enumerate(g) for j in g[n + 1:]]
    # L : la même carte dans deux langues
    deux = [i for i in range(len(cards)) if bin(mask[i]).count('1') >= 2]
    out += [('L', i, i) for i in hasard.sample(deux, min(1000, len(deux)))]
    # N : deux cartes de la même série, sans rapport
    par_serie = collections.defaultdict(list)
    for i, c in enumerate(cards):
        if a_image[i]:
            par_serie[c['s']].append(i)
    series = [g for g in par_serie.values() if len(g) >= 2]
    vus, essais = set(), 0
    while len(vus) < 1000 and essais < 100000:
        essais += 1
        i, j = sorted(hasard.sample(hasard.choice(series), 2))
        a, b = cards[i], cards[j]
        if (i, j) in vus or a['n'].get('en', a['n']) == b['n'].get('en', b['n']) or (a.get('dex') and a.get('dex') == b.get('dex')):
            continue
        if meta.get(a.get('cm')) and meta.get(a.get('cm')) == meta.get(b.get('cm')):
            continue
        vus.add((i, j))
    out += [('N', i, j) for i, j in sorted(vus)]
    # D : la même espèce, deux illustrateurs, deux fiches Cardmarket
    par_dex = collections.defaultdict(list)
    for i, c in enumerate(cards):
        if a_image[i] and c.get('dex') and c.get('i') is not None and meta.get(c.get('cm')):
            par_dex[c['dex']].append(i)
    especes = [g for g in par_dex.values() if len(g) >= 2]
    vus, essais = set(), 0
    while len(vus) < 1000 and essais < 100000:
        essais += 1
        i, j = sorted(hasard.sample(hasard.choice(especes), 2))
        if (i, j) not in vus and cards[i]['i'] != cards[j]['i'] and meta[cards[i]['cm']] != meta[cards[j]['cm']]:
            vus.add((i, j))
    out += [('D', i, j) for i, j in sorted(vus)]
    return out


def centiles(v):
    v = sorted(v)
    return ' '.join('%s %.2f' % (n, v[min(len(v) - 1, int(p * len(v)))]) for n, p in
                    (('min', 0), ('1 %', .01), ('5 %', .05), ('25 %', .25), ('médiane', .5), ('75 %', .75), ('95 %', .95), ('99 %', .99), ('max', 1))) if v else 'rien'


# ---------- Programme ----------
def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    sortie = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] != '-' else None
    dossier = sys.argv[3] if len(sys.argv) > 3 else 'images-mesure'
    os.makedirs(dossier, exist_ok=True)
    d = json.load(open('data/cards.json', encoding='utf-8'))
    im = json.load(open(V.FICHIER))
    if im.get('cards') != d['generated']:
        sys.exit('ERREUR : %s ne correspond pas à data/cards.json.' % V.FICHIER)
    mask = V.lire_masque(im['mask'], len(d['cards']))
    meta = {p[0]: p[3] for p in json.load(gzip.open(sys.argv[1], 'rt', encoding='utf-8'))['cartes']}
    liste = paires(d, im, mask, meta, random.Random(7))
    print('paires à mesurer :', dict(collections.Counter(t for t, i, j in liste)))

    # les images à lire : (carte, rang de la langue)
    besoin = set()
    for t, i, j in liste:
        besoin |= {(i, 0), (i, 1)} if t == 'L' else {(i, 0), (j, 0)}
    besoin = sorted(besoin)
    url = {(i, r): adresses(d, im, mask, i)[r][0] for i, r in besoin}
    print('images à lire :', len(besoin))

    def une(cle):
        b = lire(url[cle], dossier)
        return empreinte(b) if b else None
    emp = {}
    with cf.ThreadPoolExecutor(8) as ex:
        for n, (cle, e) in enumerate(zip(besoin, ex.map(une, besoin))):
            emp[cle] = e
            if n % 2000 == 1999:
                print('  %d images lues' % (n + 1), flush=True)
    print('images manquantes ou illisibles : %d | %s' % (sum(1 for e in emp.values() if e is None), dict(PANNES)))

    lignes, par_type = [], collections.defaultdict(list)
    for t, i, j in liste:
        x, y = emp[(i, 0)], emp[(i, 1) if t == 'L' else (j, 0)]
        if x is None or y is None:
            continue
        g, c, k, tt = compare(x, y)
        lignes.append('%s\t%d\t%d\t%.3f\t%.3f\t%.1f\t%.3f' % (t, i, j, g, c, k, tt))
        par_type[t].append((g, c, k, tt, i, j))
    if sortie:
        with open(sortie, 'w') as f:
            f.write('type\ti\tj\tg\tc\tk\tt\n' + '\n'.join(lignes) + '\n')
    print('paires mesurées :', len(lignes))
    for t, nom in (('L', 'même carte, deux langues'), ('N', 'cartes sans rapport'), ('D', 'même espèce, deux illustrateurs'), ('P', 'même fiche Cardmarket')):
        print('\n%s (%s) : %d paires' % (t, nom, len(par_type[t])))
        for n, lib in enumerate(('g', 'c', 'k', 't')):
            print('   %s : %s' % (lib, centiles([v[n] for v in par_type[t]])))
    # quelques paires de la zone incertaine, pour les regarder
    cards, sets = d['cards'], d['sets']
    doute = [v for v in par_type['P'] if 0.45 <= v[0] <= 0.8]
    print('\nfiches Cardmarket, zone incertaine (g de 0,45 à 0,8) : %d paires. Exemples :' % len(doute))
    for g, c, k, tt, i, j in random.Random(3).sample(doute, min(60, len(doute))):
        print('   g %.2f c %.2f k %4.1f t %.2f | %s | %s' % (g, c, k, tt, url[(i, 0)], url[(j, 0)]))
    print('\nfiches Cardmarket, par tranche de g :')
    tr = collections.Counter(min(9, max(0, int(v[0] * 10))) for v in par_type['P'])
    for n in range(10):
        print('   %.1f à %.1f : %5d' % (n / 10, (n + 1) / 10, tr[n]))

    # ----- La règle de l'appli, essayée sur les cartes qui ont leur image -----
    nom = lambda i: '%s:%s/%s' % (sets[cards[i]['s']]['reg'], sets[cards[i]['s']]['id'], cards[i]['num'])
    a_image = [bool(mask[i]) or str(i) in im.get('ptcg', {}) for i in range(len(cards))]
    donneur = V.regle_editions(d, V.fiches(sys.argv[1]))
    mes = {(i, j): (g, c, k) for g, c, k, tt, i, j in par_type['P']}
    essais, fautes = 0, []
    for i in range(len(cards)):
        if not a_image[i]:
            continue
        j = donneur(i, lambda x: a_image[x] and x != i)
        v = mes.get((min(i, j), max(i, j))) if j is not None else None
        if v is None:
            continue
        essais += 1
        if not meme_dessin(*v):
            fautes.append((i, j) + v)
    print("\nRÈGLE DE L'APPLI (image d'un autre set), essayée sur les cartes qui ont leur image : %d essais, %d autres dessins (%.2f %%)"
          % (essais, len(fautes), 100 * len(fautes) / max(1, essais)))
    par = collections.Counter((sets[cards[i]['s']]['id'], sets[cards[j]['s']]['id']) for i, j, *v in fautes)
    for (x, y), n in par.most_common(30):
        print('   %s ← %s : %d' % (x, y, n))
    for i, j, g, c, k in fautes[:150]:
        print('   %-16s ← %-16s g %.2f c %.2f k %5.1f' % (nom(i), nom(j), g, c, k))

    # ----- Images fautives : à quelle carte du set d'en face ressemblent-elles ? -----
    suspects = sorted({(x, y) for i, j, *v in fautes for x, y in ((i, j), (j, i))})
    if not suspects:
        return
    en_face = {cards[y]['s'] for x, y in suspects}
    plus = [(i, 0) for i in range(len(cards)) if a_image[i] and cards[i]['s'] in en_face and (i, 0) not in emp]
    url.update({cle: adresses(d, im, mask, cle[0])[0][0] for cle in plus})
    with cf.ThreadPoolExecutor(8) as ex:
        for cle, e in zip(plus, ex.map(une, plus)):
            emp[cle] = e
    gris = {i: e[0].mean(axis=2) for (i, r), e in emp.items() if r == 0 and e is not None}
    par_set = collections.defaultdict(list)
    for i in gris:
        par_set[cards[i]['s']].append(i)
    par_fiche = collections.defaultdict(list)
    for i, c in enumerate(cards):
        if meta.get(c.get('cm')):
            par_fiche[meta[c['cm']]].append(i)
    print("\nImages fautives : la carte du set d'en face à laquelle chacune ressemble le plus (%d images de plus lues)" % len(plus))
    for x, y in suspects[:200]:
        if x not in gris:
            continue
        g, z = max((meilleur(gris[x], gris[z], 4)[0], z) for z in par_set[cards[y]['s']] if z != x)
        attendu = meilleur(gris[x], gris[y], 4)[0] if y in gris else 0
        jumelles = [nom(w) for w in par_fiche.get(meta.get(cards[z].get('cm')), []) if w != z and sets[cards[w]['s']]['reg'] == sets[cards[x]['s']]['reg']]
        print('   %-16s attendue %-16s g %.2f | ressemble le plus à %-16s g %.2f%s' % (
            nom(x), nom(y), attendu, nom(z), g, ' | cette carte, dans la région de la première : ' + ', '.join(jumelles[:4]) if g >= 0.6 and jumelles else ''))


if __name__ == '__main__':
    main()
