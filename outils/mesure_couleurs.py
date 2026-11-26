"""Mesure la répartition des couleurs d'une capture d'écran (règle 60-30-10, voir LISEZMOI).

Usage : python3 outils/mesure_couleurs.py capture.png [autre.png ...]
Fond = couleur la plus présente ; vert = teinte verte bien saturée ; encre = noir et gris foncés ;
autre couleur = toute autre couleur vive (images comprises).
"""
import colorsys
import sys
from collections import Counter

from PIL import Image


def mesure(path):
    im = Image.open(path).convert('RGB')
    im = im.resize((max(1, im.width // 2), max(1, im.height // 2)))
    px = list(im.getdata())
    fond = Counter(px).most_common(1)[0][0]
    c = Counter()
    for r, g, b in px:
        h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        if s > .35 and v > .25 and .27 < h < .48:
            c['vert'] += 1
        elif s > .25 and v > .2:
            c['autre couleur'] += 1
        elif v < .35:
            c['encre'] += 1
        elif (r, g, b) == fond:
            c['fond'] += 1
        else:
            c['blocs clairs'] += 1
    return {k: round(100 * c[k] / len(px), 1) for k in ('fond', 'blocs clairs', 'encre', 'vert', 'autre couleur')}


if __name__ == '__main__':
    for p in sys.argv[1:]:
        m = mesure(p)
        alerte = '  <- trop de vert' if m['vert'] > 10 else ''
        print(f"{p} : fond {m['fond']} % · blocs {m['blocs clairs']} % · encre {m['encre']} % · vert {m['vert']} % · autres {m['autre couleur']} %{alerte}")
