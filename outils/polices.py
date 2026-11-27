#!/usr/bin/env python3
"""Polices de CallIt! servies par callitcards.com (au lieu de Google Fonts).

Pourquoi : la feuille de Google Fonts bloquait le premier affichage (un serveur de plus à joindre à chaque ouverture),
et chaque visite envoyait l'adresse IP du visiteur à Google (problème RGPD relevé en Europe).

Ce script part des polices officielles (dépôt google/fonts, licence SIL OFL 1.1) et garde seulement ce que l'appli utilise :
- Fraunces (titres) : graisses 500 à 700, taille optique 9 à 144, réglages SOFT 0 et WONK 1 (ceux que servait Google) ;
- Geist (texte) : graisses 400 à 700.
Deux fichiers par police : « latin » (français, anglais, allemand, espagnol, italien…) et « latin-ext » (autres langues
d'Europe), chargé seulement si une page en a besoin (unicode-range dans styles.css).

Usage : python3 outils/polices.py [Fraunces.ttf Geist.ttf]
Sans fichiers, les polices sont téléchargées depuis github.com/google/fonts.
Demande : pip install fonttools brotli
"""
import io, os, sys, urllib.request
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools import subset

RACINE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'polices')
SOURCES = {
    'fraunces': 'https://github.com/google/fonts/raw/main/ofl/fraunces/Fraunces%5BSOFT,WONK,opsz,wght%5D.ttf',
    'geist': 'https://github.com/google/fonts/raw/main/ofl/geist/Geist%5Bwght%5D.ttf',
}
AXES = {
    'fraunces': {'SOFT': 0, 'WONK': 1, 'wght': (500, 700)},
    'geist': {'wght': (400, 700)},
}
# Mêmes découpes que Google Fonts
LATIN = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'
LATIN_EXT = 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF'


def codes(plages):
    out = []
    for p in plages.split(','):
        p = p.strip()[2:]
        a, _, b = p.partition('-')
        out.extend(range(int(a, 16), int(b or a, 16) + 1))
    return out


def charger(nom, chemin):
    if chemin:
        return TTFont(chemin)
    with urllib.request.urlopen(SOURCES[nom]) as r:
        return TTFont(io.BytesIO(r.read()))


def fabriquer(nom, chemin=None):
    for part, plages in (('latin', LATIN), ('latin-ext', LATIN_EXT)):
        f = charger(nom, chemin)
        opts = subset.Options()
        opts.flavor = 'woff2'
        opts.layout_features = ['*']
        opts.name_IDs = ['*']
        opts.name_languages = ['*']
        opts.notdef_outline = True
        s = subset.Subsetter(opts)
        s.populate(unicodes=codes(plages))
        s.subset(f)
        # Découpe d'abord, réglage des axes ensuite (dans l'autre ordre, fontTools perd des glyphes composés)
        f = instancer.instantiateVariableFont(f, AXES[nom])
        sortie = os.path.join(RACINE, f'{nom}-{part}.woff2')
        f.flavor = 'woff2'
        f.save(sortie)
        print(sortie, os.path.getsize(sortie) // 1024, 'Ko')


if __name__ == '__main__':
    os.makedirs(RACINE, exist_ok=True)
    args = sys.argv[1:]
    fabriquer('fraunces', args[0] if len(args) > 0 else None)
    fabriquer('geist', args[1] if len(args) > 1 else None)
