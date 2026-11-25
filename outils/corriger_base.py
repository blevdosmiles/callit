"""Corrections de la base de cartes : noms des illustrateurs et cartes mal renseignées.

La base reprend TCGdex, où le même illustrateur est parfois écrit de plusieurs façons (« takuyoa » et
« Takuyoa », « Miki Tanaka » et « MikiTanaka »), avec une faute (« Rya Ueda »), ou remplacé par autre chose
qu'un nom (« N/A »). Chaque écriture donnait sa propre fiche d'artiste dans l'appli et sa propre page pour les
moteurs de recherche. Quelques cartes y portent aussi le nom ou l'illustrateur d'une autre.

Ce que fait l'outil, sur data/cards.json :
 1. écritures qui ne diffèrent que par les majuscules, les espaces ou les signes : il garde celle que portent
    le plus de cartes ;
 2. fautes connues, vérifiées une par une : « illustrateurs » dans outils/corrections.json ;
 3. valeurs qui ne sont pas des noms : « pas_des_noms », la carte reste sans illustrateur ;
 4. cartes mal renseignées : « cartes ». Une correction ne s'applique que si la carte porte encore la valeur
    fausse notée dans le fichier ; sinon elle est signalée « à revoir » et rien n'est changé.

Il ne touche à rien d'autre, et relancé sur sa propre sortie il ne change plus rien. Chaque correction du
fichier porte sa preuve : n'y ajouter que ce qui a été vérifié sur une source publique.

Usage : python3 outils/corriger_base.py              bilan seulement, rien n'est écrit
        python3 outils/corriger_base.py --ecrire     enregistre data/cards.json
        python3 outils/corriger_base.py --verifier   échoue s'il reste quelque chose à corriger (pull requests)
outils/preparer_donnees.py applique les mêmes corrections quand la base est refaite.
"""
import argparse, collections, json, os, sys, unicodedata

ICI = os.path.dirname(os.path.abspath(__file__))
REGLES = os.path.join(ICI, 'corrections.json')


def propre(nom):
    """Écriture nettoyée : sans barre oblique inverse, sans guillemet orphelin, espaces simples."""
    s = ' '.join(nom.replace('\\', '').split())
    if s.count('"') % 2:
        s = ''.join(s.rsplit('"', 1))
    return s.strip()


def cle(nom):
    """Mêmes lettres et chiffres = même personne, quels que soient majuscules, accents, espaces et signes."""
    s = unicodedata.normalize('NFKD', nom)
    return ''.join(ch for ch in s.lower() if ch.isalnum())


def cle_carte(d, c):
    s = d['sets'][c['s']]
    return f"{s['reg']}:{s['id']}:{c['num']}"


def corriger(d, regles=None):
    """Corrige la base « d » sur place. Rend (lignes du bilan, nombre de cartes changées)."""
    if regles is None:
        regles = json.load(open(REGLES, encoding='utf-8'))
    ills, cartes = d['ills'], d['cards']
    bilan, avant = [], [(c.get('i'), dict(c['n']), c.get('dex')) for c in cartes]

    # Nom de l'illustrateur de chaque carte, écrit au propre
    bruts = [ills[c['i']] if c.get('i') is not None else None for c in cartes]
    noms = [propre(x) if x is not None else None for x in bruts]
    dits = set()                                # cartes dont le changement d'illustrateur est déjà dans le bilan

    # Ce qui n'est pas un nom
    faux_noms = {propre(x).lower() for x in regles.get('pas_des_noms', [])}
    retires = collections.Counter(n for n in noms if n is not None and (n.lower() in faux_noms or not cle(n)))
    noms = [None if n in retires else n for n in noms]
    for n, k in sorted(retires.items()):
        bilan.append(f'pas un nom, retiré : « {n} » ({k} carte{"s" if k > 1 else ""})')

    # Fautes connues
    fautes = {cle(r['faux']): r['vrai'] for r in regles.get('illustrateurs', [])}
    corriges = collections.Counter((n, fautes[cle(n)]) for n in noms if n is not None and cle(n) in fautes)
    dits |= {k for k, n in enumerate(noms) if n is not None and cle(n) in fautes}
    noms = [fautes.get(cle(n), n) if n is not None else None for n in noms]
    for (faux, vrai), k in sorted(corriges.items()):
        bilan.append(f'faute corrigée : « {faux} » → « {vrai} » ({k} carte{"s" if k > 1 else ""})')

    # Cartes mal renseignées
    par_cle = {cle_carte(d, c): n for n, c in enumerate(cartes)}
    egal = lambda a, b: (a is None and b is None) or (a is not None and b is not None and cle(a) == cle(b))

    def porte(n, etat, ill):
        """La carte n porte-t-elle cet état (nom, numéro de Pokédex, illustrateur) ?"""
        c = cartes[n]
        return (('illustrateur' not in etat or egal(noms[n], ill))
                and all(c['n'].get(l) == v for l, v in etat.get('nom', {}).items())
                and ('dex' not in etat or c.get('dex') == etat['dex']))
    for r in regles.get('cartes', []):
        n = par_cle.get(r['carte'])
        if n is None:
            bilan.append(f"à revoir : {r['carte']} n'est pas dans la base")
            continue
        c, faux, vrai = cartes[n], r['faux'], r['vrai']
        ill_faux = faux.get('illustrateur')
        if ill_faux:                            # l'illustrateur noté comme faux a pu être une faute corrigée juste au-dessus
            ill_faux = fautes.get(cle(ill_faux), ill_faux)
        if porte(n, vrai, vrai.get('illustrateur')):
            continue
        if not porte(n, faux, ill_faux):
            bilan.append(f"à revoir : {r['carte']} ne porte plus la valeur notée comme fausse, rien n'est changé")
            continue
        if 'illustrateur' in vrai:
            noms[n] = vrai['illustrateur']
            dits.add(n)
        c['n'].update(vrai.get('nom', {}))
        if 'dex' in vrai:
            c['dex'] = vrai['dex']
        bilan.append(f"carte corrigée : {r['carte']} · " + ' · '.join(
            f'{k} : {json.dumps(faux.get(k), ensure_ascii=False)} → {json.dumps(v, ensure_ascii=False)}' for k, v in vrai.items()))

    # Une seule écriture par personne : celle que portent le plus de cartes (à égalité, la première de la liste)
    rang = {}
    for i, x in enumerate(ills):
        rang.setdefault(propre(x), i)
    compte = collections.Counter(n for n in noms if n is not None)
    groupes = collections.defaultdict(list)
    for n in compte:
        groupes[cle(n)].append(n)
    choisi = {}
    for k, l in groupes.items():
        l.sort(key=lambda n: (-compte[n], rang.get(n, len(ills))))
        for n in l:
            choisi[n] = l[0]
    noms = [choisi[n] if n is not None else None for n in noms]
    autres = collections.defaultdict(collections.Counter)
    for k, (brut, n) in enumerate(zip(bruts, noms)):
        if n is not None and brut != n and k not in dits:
            autres[n][brut] += 1
    for n, l in sorted(autres.items()):
        bilan.append('même illustrateur : ' + ', '.join(f'« {x} » ({k})' for x, k in sorted(l.items()))
                     + f' → « {n} » ({sum(1 for x in noms if x == n)} cartes)')

    # Nouvelle liste : l'ordre d'avant, sans les écritures abandonnées ; un nom nouveau va à la fin
    gardes = set(noms) - {None}
    liste = []
    for x in ills:
        p = propre(x)
        if p in gardes and p not in liste:
            liste.append(p)
    liste += sorted(gardes - set(liste))
    pos = {n: i for i, n in enumerate(liste)}
    for c, n in zip(cartes, noms):
        if n is None:
            c.pop('i', None)
        elif 'i' in c:
            c['i'] = pos[n]
        else:                                   # la clé « i » se range après « s », comme dans le reste de la base
            apres = list(c.items())
            c.clear()
            for k, v in apres:
                c[k] = v
                if k == 's':
                    c['i'] = pos[n]
    changees = sum(1 for c, (i, n, dex), nom in zip(cartes, avant, noms)
                   if (ills[i] if i is not None else None) != nom or n != c['n'] or dex != c.get('dex'))
    d['ills'] = liste
    return bilan, changees


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description='Corrige les noms des illustrateurs et les cartes mal renseignées de la base.')
    ap.add_argument('--base', default=os.path.join(ICI, '..', 'data', 'cards.json'))
    ap.add_argument('--ecrire', action='store_true', help='enregistrer la base corrigée')
    ap.add_argument('--verifier', action='store_true', help="échouer s'il reste quelque chose à corriger")
    a = ap.parse_args()
    texte = open(a.base, encoding='utf-8').read()
    d = json.loads(texte)
    n_avant = len(d['ills'])
    bilan, changees = corriger(d)
    for ligne in bilan:
        print(ligne)
    sortie = json.dumps(d, ensure_ascii=False, separators=(',', ':'))
    print(f"{changees} carte{'s' if changees > 1 else ''} changée{'s' if changees > 1 else ''} · illustrateurs : {n_avant} → {len(d['ills'])}")
    if sortie == texte:
        print('Rien à corriger.')
    elif a.ecrire:
        open(a.base, 'w', encoding='utf-8').write(sortie)
        print('Base enregistrée.')
    else:
        print('Bilan seulement : relancer avec --ecrire pour enregistrer.')
    sys.exit(1 if any(l.startswith('à revoir') for l in bilan) or (a.verifier and sortie != texte) else 0)
