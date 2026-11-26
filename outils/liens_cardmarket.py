"""Vérifie et corrige le lien de chaque carte de data/cards.json avec son produit Cardmarket.

Pourquoi : la base vient de TCGdex, dont certaines fiches pointent vers le produit d'une autre carte (la version holo
d'une carte non holo, la carte du même nom dans la série, une carte géante, une autre série entière...). Deux cartes
affichaient alors le prix d'un seul produit, ou une carte le prix d'une autre.

Ce que l'outil sait, pour les séries occidentales (les noms des produits Cardmarket sont en anglais) :
  - Un produit convient à une carte s'il porte le même nom et les mêmes attaques (« Nom [Talent | Attaque] »).
  - Chaque série a son extension Cardmarket : celle où le plus de ses cartes se retrouvent.
  - Dans une extension, les produits ajoutés le même jour sont numérotés dans l'ordre des cartes, et chaque suite de
    numéros de carte (cartes normales, H1 à H32, SL1 à SL11...) y forme un bloc.
  - Un produit ajouté bien après la série (pour les plus anciens, sans date : numéroté loin d'elle) est une autre
    version de la carte : carte géante, réédition, version tamponnée.
  - Quand plusieurs produits du même nom se suivent pour une seule carte (la carte et sa version brillante), les liens
    déjà vérifiés de la série disent lequel est la carte : presque toujours le premier.
  - L'ordre a ses exceptions, que l'outil reconnaît aux cartes déjà placées : un lot rangé à rebours (les cartes
    secrètes de Rebel Clash) se lit à l'envers ; un lot rangé sans suivre les numéros (les plus anciennes promos,
    certains kits de démarrage) ne dit rien, et l'ordre n'y départage personne ; un kit de démarrage rangé carte par
    carte (les deux cartes n° 1, puis les deux n° 2...) ou par nom de carte (les cartes du même nom regroupées)
    donne à chaque produit sa carte par sa seule place.
  - Entre deux lots, l'ordre ne compte que s'ils ne se chevauchent pas (promos numérotées au fil des années, série
    mise au catalogue en plusieurs fois). Un produit ajouté des années après peut être une carte oubliée.

Méthode :
  1. Un lien actuel vérifié (même nom, mêmes attaques, aucune autre carte dessus) est gardé. Il n'est quitté que si
     son produit revient à une autre carte, s'il est au milieu d'une autre suite de numéros, s'il est dans une autre
     extension que celle de la série, ou s'il a été ajouté à l'écart de la série.
  2. Les cartes qui n'ont qu'un produit possible, que personne d'autre ne réclame, servent de repères. Un produit
     est « à la place » d'une carte quand son numéro tombe entre ceux des repères qui encadrent la carte.
  3. Les cartes qui se disputent des produits (liens en double, cartes jumelles : même nom et mêmes attaques) sont
     placées ensemble, de la façon qui respecte le mieux ces règles : produit à la place de la carte, au milieu de
     sa suite de numéros, ajouté avec la série, lien actuel gardé, produit voisin de celui de la carte d'à côté,
     ordre des numéros. À égalité entre deux façons, on ne tranche pas : la carte reste sans lien.
     Les cartes ainsi placées et confirmées par leurs voisines deviennent des repères, et on recommence.
  4. Une carte dont le produit est allé à une autre, ou dont le lien pointe vers une autre carte, perd son lien :
     pas de prix plutôt qu'un prix faux.
Les cartes asiatiques ne sont pas touchées (leurs produits portent d'autres noms).

Les fichiers lus viennent de la release « catalogue » du dépôt (voir outils/sources_base.py) :
  tcgdex-extrait.json.gz        noms anglais, attaques et liens de chaque carte
  catalogue-cardmarket.json.gz  liste publique des produits de Cardmarket
et d'une archive quotidienne des prix (release prix-AAAA-MM), pour donner un prix de secours aux cartes dont le lien
change et pour signaler les liens à vérifier.

Usage : python3 outils/liens_cardmarket.py EXTRAIT CATALOGUE [--prix ARCHIVE] [--rapport FICHIER] [--ecrire]
  --prix     archive releve-AAAA-MM-JJ.json.gz (obligatoire avec --ecrire)
  --rapport  écrit le détail de chaque changement et les liens à vérifier (JSON)
  --ecrire   enregistre data/cards.json (sans cette option : bilan seulement, rien n'est écrit)
  --forcer   écrit même si plus de 12 % des liens changent
  --base     autre fichier que data/cards.json (essais)
Seuls « cm » et « p » des cartes dont le lien change sont réécrits. Après une écriture, relancer les tâches
« Cartes Cardmarket absentes de la base » et « Relevé quotidien des prix » (avec « refaire ») du dépôt.

Corrections à la main : outils/liens_manuels.json, {"en:sv03.5:001": 733596, "en:xyp:XY150": 0} (0 = pas de lien).
Elles passent avant tout le reste. Elles servent quand rien ne permet à l'outil de trancher : deux produits du même
nom ajoutés à quelques semaines d'écart, dont un seul est la carte (le rapport les signale quand leurs prix diffèrent),
ou des cartes du même nom dans un lot rangé sans ordre (les trois « Victory Cup » des promos Noir & Blanc).
"""
import argparse, bisect, collections, datetime, difflib, gzip, itertools, json, os, re, sys, unicodedata

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ---------- Noms et attaques : mise en forme commune aux deux sources ----------
SIGNES = {'α': ' alpha ', 'β': ' beta ', 'γ': ' gamma ', 'δ': ' delta ', 'Δ': ' delta ', '☆': ' gold star ', '★': ' gold star ',
          '♀': ' f ', '♂': ' m ', '◇': ' prism star ', '{*}': ' prism star ', '’': "'", '`': "'"}
ENERGIES = {'w': 'water', 'g': 'grass', 'l': 'lightning', 'r': 'fire', 'p': 'psychic', 'f': 'fighting', 'd': 'darkness',
            'm': 'metal', 'y': 'fairy', 'n': 'dragon', 'c': 'colorless'}
# Jetons entre crochets qui ne sont pas des attaques
QUALIFS = {'top', 'bottom', 'left', 'right', 'prime', 'special', 'prism', 'upper', 'lower'}
ATTAQUES = set()   # toutes les attaques et tous les talents connus de TCGdex (rempli par charger)


def plat(s):
    s = s or ''
    for a, b in SIGNES.items():
        s = s.replace(a, b)
    s = unicodedata.normalize('NFD', s)
    return ''.join(ch for ch in s if not unicodedata.combining(ch)).lower()


def compact(s):
    return re.sub(r'[^a-z0-9]+', '', plat(s))


def cle_nom(s):
    """Clé de comparaison d'un nom de carte."""
    s = plat(s)
    s = re.sub(r'\blv\.?\s*x\b', ' lvx ', s)          # « LV.X » fait partie du nom
    s = re.sub(r'\blv\.?\s*\d+\b', ' ', s)            # « Lv.49 » non : TCGdex ne l'écrit pas
    s = s.replace('delta species', ' ').replace('prism star prism star', 'prism star')
    s = s.replace('&', ' and ')
    s = re.sub(r'\be4\b', '4', s)                     # « Mr. Mime E4 » ↔ « Mr. Mime [4] »
    s = re.sub(r'^\s*basic\s+', '', s)                # « Basic Fire Energy » ↔ « Fire Energy »
    return re.sub(r'[^a-z0-9]+', '', s)


def lire_produit(nom):
    """Nom Cardmarket → (clés de nom possibles, attaques, qualificatifs).
    « Mr. Mime [4] Lv.53 [Magic Heal | Barrier Attack] » : le dernier crochet liste les attaques, les autres
    font partie du nom. « Ancient Technical Machine [Ice] » : le crochet fait partie du nom (les deux lectures
    sont gardées, la comparaison dira laquelle est la bonne)."""
    aplati = lambda t: re.sub(r'\[([^\]]*)\]', lambda m: ' ' + m.group(1) + ' ', t)
    cles = {cle_nom(aplati(nom))}
    if re.search(r'\benergy\b', nom, re.I):           # « Wash [W] Energy » ↔ « Wash Water Energy »
        cles.add(cle_nom(re.sub(r'\[([^\]]*)\]', lambda m: ' ' + ENERGIES.get(m.group(1).strip().lower(), m.group(1)) + ' ', nom)))
    sig, qual = frozenset(), frozenset()
    groupes = list(re.finditer(r'\[([^\]]*)\]', nom))
    if groupes and nom.rstrip().endswith(']'):
        g = groupes[-1]
        avant = nom[:g.start()]
        cles.add(cle_nom(aplati(avant)))
        if ' - ' in avant:                            # « Professor's Research - Professor Sada »
            cles.add(cle_nom(aplati(avant.split(' - ')[0])))
        jetons = [compact(x) for x in g.group(1).split('|')]
        jetons = [x for x in jetons if x]
        qual = frozenset(x for x in jetons if x in QUALIFS)
        sig = frozenset(x for x in jetons if x not in QUALIFS)
    elif ' - ' in nom:
        cles.add(cle_nom(aplati(nom.split(' - ')[0])))
    cles.discard('')
    return frozenset(cles), sig, qual


def cles_carte(nom, num):
    cles = set()
    if nom:
        sans_crochets = nom.replace('[', ' ').replace(']', ' ')
        cles.add(cle_nom(sans_crochets))
        cles.add(cle_nom(re.sub(r'\([^)]*\)', ' ', sans_crochets)))   # « Thought Wave Machine (Rocket's Secret Machine) »
        if re.fullmatch(r'[A-Za-z!?]{1,2}', num or ''):                # Unown de EX Unseen Forces : le numéro est la lettre
            cles.add(cle_nom(nom + ' ' + num))
        if re.search(r'(?i)\S\s+star$', nom) and not re.search(r'(?i)prism\s+star$', nom):   # « Pikachu Star » ↔ « Pikachu Gold Star »
            cles.add(cle_nom(re.sub(r'(?i)\s+star$', ' gold star', nom)))
    cles.discard('')
    return frozenset(cles)


def sig_carte(x):
    return frozenset(compact(a) for a in (x.get('abilities') or []) + (x.get('attacks') or []) if compact(a))


_sim = {}


def proche(a, b):
    """Deux noms d'attaque désignent-ils la même attaque ? (fautes de frappe, traductions provisoires)"""
    if a == b:
        return True
    k = (a, b) if a < b else (b, a)
    if k not in _sim:
        court, long_ = sorted((a, b), key=len)
        _sim[k] = (len(court) >= 5 and court in long_) or difflib.SequenceMatcher(None, a, b).ratio() >= 0.78
    return _sim[k]


def niveau(cc, cs, pc, ps):
    """À quel point un produit convient à une carte.
    0 : non (autre nom, ou aucune attaque en commun) ; 1 : même nom, attaques non comparables ;
    2 : même nom, une partie des attaques ; 3 : même nom, mêmes attaques à une faute près ; 4 : identiques."""
    if not (cc & pc) and not any(a + 'lvx' == b or b + 'lvx' == a for a in cc for b in pc):
        return 0
    if cs == ps:
        return 4
    if not cs or not ps:
        return 1
    reste = set(ps)
    trouves = 0
    for a in cs:
        b = a if a in reste else next((x for x in reste if proche(a, x)), None)
        if b is not None:
            reste.discard(b)
            trouves += 1
    if not trouves:
        return 0
    # Tout retrouvé côté carte, et ce que le produit a en plus n'est pas une attaque connue : c'est un code de
    # série (« Voltorb [Tackle | Base Set] ») ou un pouvoir que TCGdex ne liste pas. Une vraie attaque en plus
    # (« Sobble [Pound | Water Gun] » pour une carte qui n'a que Water Gun) désigne une autre carte.
    if trouves == len(cs) and not (reste & ATTAQUES):
        return 3
    return 2


def cle_num(num):
    """Numéro de carte → (préfixe, nombre, suffixe) : « XY67a » → ('xy', 67, 'a'). None si illisible."""
    m = re.fullmatch(r'([A-Za-z!?.-]*?)0*(\d+)([A-Za-z]*)', num or '')
    return (m.group(1).lower(), int(m.group(2)), m.group(3).lower()) if m else None


# ---------- Lecture ----------
def ouvrir(chemin):
    with gzip.open(chemin, 'rt', encoding='utf-8') as z:
        return json.load(z)


class Carte:
    """Une carte occidentale de la base. cm : lien actuel ; nouveau : lien décidé ; cand : [(niveau, produit)]."""
    __slots__ = ('k', 'cle', 'set', 'num', 'nom', 'cles', 'sig', 'cm', 'cls', 'n', 'cand', 'etat', 'nouveau', 'motif', 'exp', 'rep')

    def __repr__(self):
        return f'{self.cle} {self.nom!r}'


def jour(date):
    """« 2018-08-22 » → nombre de jours. 0 pour les produits sans date (les plus anciens du catalogue)."""
    try:
        a, m, j = (int(x) for x in (date or '').split('-'))
        return datetime.date(a, m, j).toordinal()
    except ValueError:
        return 0


def charger(base, extrait, catalogue):
    par_cle = {(x['set'], x['num']): x for x in extrait['cards']}
    ATTAQUES.clear()
    for x in extrait['cards']:
        ATTAQUES.update(sig_carte(x))
    cartes = []
    for k, c in enumerate(base['cards']):
        s = base['sets'][c['s']]
        if s['reg'] != 'en':
            continue
        x = par_cle.get((s['reg'] + ':' + s['id'], c['num'])) or {}
        o = Carte()
        o.k, o.set, o.num = k, s['reg'] + ':' + s['id'], c['num']
        o.cle = o.set + ':' + o.num
        o.nom = x.get('name', {}).get('en') or c['n'].get('en') or ''
        o.cles, o.sig = cles_carte(o.nom, o.num), sig_carte(x)
        o.cm = c.get('cm') or 0
        nk = cle_num(o.num)
        o.cls, o.n = ((o.set, nk[0]), (nk[1], nk[2])) if nk else ((o.set, None), None)
        o.cand, o.etat, o.nouveau, o.motif, o.exp, o.rep = [], None, None, '', None, False
        cartes.append(o)
    produits, par_exp = {}, collections.defaultdict(list)
    for i, nom, exp, _meta, date in catalogue['cartes']:
        cles, sig, qual = lire_produit(nom)
        p = {'id': i, 'nom': nom, 'exp': exp, 'date': (date or '')[:10], 'jour': jour((date or '')[:10]), 'cles': cles, 'sig': sig, 'qual': qual}
        produits[i] = p
        par_exp[exp].append(p)
    for l in par_exp.values():
        l.sort(key=lambda p: p['id'])
    return cartes, produits, par_exp


# ---------- 1. Extension de chaque série ----------
def extensions(cartes, produits, par_exp, extrait):
    """{série: extension Cardmarket}, choisie par le contenu : celle où le plus de cartes se retrouvent."""
    par_set = collections.defaultdict(list)
    for c in cartes:
        par_set[c.set].append(c)
    index = {}   # extension → {clé de nom: [produits]}

    def idx(e):
        if e not in index:
            d = collections.defaultdict(list)
            for p in par_exp.get(e, ()):
                for k in p['cles']:
                    d[k].append(p)
            index[e] = d
        return index[e]

    def retrouvees(cs, e):
        d, n = idx(e), 0
        for c in cs:
            vus = {p['id']: p for k in c.cles for p in d.get(k, ())}
            if any(niveau(c.cles, c.sig, p['cles'], p['sig']) >= 3 for p in vus.values()):
                n += 1
        return n

    ou = collections.defaultdict(set)   # clé de nom → extensions qui ont un produit de ce nom
    for e, l in par_exp.items():
        for p in l:
            for k in p['cles']:
                ou[k].add(e)
    principal, detail = {}, {}
    for s, cs in par_set.items():
        essais = collections.Counter(produits[c.cm]['exp'] for c in cs if c.cm in produits)
        e_tcg = (extrait['sets'].get(s) or {}).get('cm')
        if e_tcg in par_exp:
            essais[e_tcg] += 0
        scores = {e: retrouvees(cs, e) for e in essais}
        meilleur = max(scores, key=lambda e: (scores[e], essais[e])) if scores else None
        cherchee = False
        if meilleur is None or scores[meilleur] * 2 < len(cs):
            # Série sans lien, ou dont les liens mènent ailleurs : on cherche dans tout le catalogue
            votes = collections.Counter(e for c in cs for e in {x for k in c.cles for x in ou.get(k, ())})
            for e, _ in votes.most_common(6):
                if e not in scores:
                    scores[e] = retrouvees(cs, e)
            m2 = max(scores, key=lambda e: (scores[e], essais.get(e, 0)))
            if m2 != meilleur and scores[m2] >= 5 and scores[m2] * 2 >= len(cs):
                meilleur, cherchee = m2, True
        if meilleur is None:
            continue
        principal[s] = meilleur
        detail[s] = {'cartes': len(cs), 'liens': dict(essais), 'retrouvees': scores, 'extension': meilleur, 'cherchee': cherchee}
    return principal, detail, idx


def candidats(c, e, idx):
    """Produits de l'extension e qui conviennent à la carte, avec leur niveau."""
    d = idx(e)
    vus = {p['id']: p for k in c.cles for p in d.get(k, ())}
    for k in c.cles:                                   # carte LV.X dont TCGdex n'écrit pas le « LV.X »
        for p in d.get(k + 'lvx', ()):
            vus[p['id']] = p
    out = []
    for p in vus.values():
        n = niveau(c.cles, c.sig, p['cles'], p['sig'])
        if n:
            out.append((n, p))
    return out


# ---------- 4. Ordre de l'extension ----------
class Ordre:
    """Les repères d'une extension (cartes sûres), rangés par numéro de produit, pour dire si un produit est à la
    place d'une carte."""

    def __init__(self, produits=(), suites=1):
        self.suites = suites                       # nombre de suites de numéros parmi les cartes de l'extension
        self.par = collections.defaultdict(list)   # (classe de la carte, jour d'ajout du produit) → [(id, n)] triés
        self.tous = collections.defaultdict(list)  # jour d'ajout → [(id, classe)] triés, toutes classes confondues
        self.ids = collections.defaultdict(list)   # jour d'ajout → numéros de tous les produits de l'extension, triés
        self.rang = {}                             # produit → (rang, nombre, numéros) parmi ses voisins du même nom, s'il en a
        noms = collections.defaultdict(list)
        for p in produits:
            self.ids[p['date']].append(p['id'])
            noms[p['date']].append((p['id'], p['nom']))
        for l in self.ids.values():
            l.sort()
        for l in noms.values():
            l.sort()
            i = 0
            while i < len(l):
                j = i
                while j + 1 < len(l) and l[j + 1][1] == l[i][1]:
                    j += 1
                for k in range(i, j + 1):
                    if j > i:
                        self.rang[l[k][0]] = (k - i, j - i + 1, tuple(x[0] for x in l[i:j + 1]))
                i = j + 1
        self.tenus = set()                         # produits tenus par un repère
        self.pris = {}                             # produits tenus par une carte placée, repère ou non (fourni par resoudre)
        self._pas, self._melange = {}, {}

    def ajouter(self, c, p):
        bisect.insort(self.tous[p['date']], (p['id'], c.cls))
        self.tenus.add(p['id'])
        if c.n is not None:
            bisect.insort(self.par[(c.cls, p['date'])], (p['id'], c.n))
            self._pas.pop((c.cls, p['date']), None)
            self._melange.pop((c.cls, p['date']), None)

    def retirer(self, c, p):
        l = self.tous[p['date']]
        i = bisect.bisect_left(l, (p['id'], c.cls))
        if i < len(l) and l[i] == (p['id'], c.cls):
            del l[i]
            self.tenus.discard(p['id'])
        if c.n is not None:
            l = self.par[(c.cls, p['date'])]
            i = bisect.bisect_left(l, (p['id'], c.n))
            if i < len(l) and l[i] == (p['id'], c.n):
                del l[i]
                self._pas.pop((c.cls, p['date']), None)
                self._melange.pop((c.cls, p['date']), None)

    def bloc(self, c, p):
        """Les produits d'une même suite de numéros (cartes normales, H1 à H32, SL1 à SL11...) se suivent dans
        le catalogue. +1 : les repères qui entourent le produit sont tous de la suite de la carte ; -1 : tous d'une
        autre suite ; 0 : mélange, ou pas de repère assez près de chaque côté."""
        l = self.tous.get(p['date'], ())
        i = bisect.bisect_left(l, (p['id'], ('', '')))
        bas = [x for x in l[max(0, i - 2):i] if p['id'] - x[0] <= 10]
        haut = [x for x in l[i:i + 3] if x[0] != p['id'] and x[0] - p['id'] <= 10][:2]
        if self.suites < 2 or not bas or not haut:
            return 0
        memes = [x[1] == c.cls for x in bas + haut]
        return 1 if all(memes) else 0 if any(memes) else -1

    def melange(self, cle):
        """Le lot est-il rangé sans suivre les numéros des cartes ? (les plus anciennes promos, certains kits de
        démarrage) : plus d'un quart des repères qui se suivent y sont à l'envers. L'ordre des numéros n'y dit rien."""
        if cle not in self._melange:
            l = self.par.get(cle, ())
            self._melange[cle] = len(l) >= 6 and sum(1 for a, b in zip(l, l[1:]) if a[1] > b[1]) > 0.25 * (len(l) - 1)
        return self._melange[cle]

    def pas(self, cle):
        """Écart habituel entre les numéros de produit de deux cartes qui se suivent (1, parfois 5)."""
        if cle not in self._pas:
            l = self.par.get(cle, ())
            ecarts = collections.Counter(b[0] - a[0] for a, b in zip(l, l[1:]) if a[1][1] == b[1][1] == '' and b[1][0] - a[1][0] == 1)
            (pas, nb), total = (ecarts.most_common(1)[0] if ecarts else (1, 0)), sum(ecarts.values())
            self._pas[cle] = pas if nb >= 5 and nb >= 0.6 * total else 1
        return self._pas[cle]

    def place(self, c, p):
        """(verdict, exact). Verdict : True (le produit est à la place de la carte), False (il est à la place d'une
        autre), None (rien pour le dire : trop peu de repères autour, ou produits ajoutés dans le désordre).
        exact : nombre de côtés (0, 1 ou 2) où le repère voisin est la carte d'à côté, au numéro de produit d'à côté.

        On regarde jusqu'à trois repères de chaque côté du produit (même série, même jour d'ajout). Cardmarket
        intervertit parfois deux cartes voisines : un seul désaccord est toléré. Quand les deux côtés sont eux-mêmes
        inversés l'un par rapport à l'autre, le produit est à la frontière de deux lots : il suffit d'un côté.
        Et quand aucun produit libre ne reste là où le numéro de la carte la placerait, l'ordre ne dit rien."""
        if c.n is None:
            return None, 0
        l = self.par.get((c.cls, p['date']), ())
        i = bisect.bisect_left(l, (p['id'], (-1, '')))
        bas = list(l[max(0, i - 3):i])
        haut = [x for x in l[i:i + 4] if x[0] != p['id']][:3]
        # Un lot reprend parfois à un autre numéro (après la carte 116, la 29) : de chaque côté, on ne garde que les
        # repères qui se suivent jusqu'au produit.
        while len(bas) > 1 and any(a[1] > b[1] for a, b in zip(bas, bas[1:])):
            bas.pop(0)
        while len(haut) > 1 and any(a[1] > b[1] for a, b in zip(haut, haut[1:])):
            haut.pop()
        if not bas and not haut:
            return None, 0
        n, pas = c.n, self.pas((c.cls, p['date']))
        colle = lambda x: (abs(x[0] - p['id']) == pas and x[1][1] == n[1] == '' and abs(x[1][0] - n[0]) == 1
                           and (x[0] < p['id']) == (x[1] < n))
        exact_b, exact_h = bool(bas) and colle(bas[-1]), bool(haut) and colle(haut[0])
        exact = exact_b + exact_h
        inv = lambda t: sum(1 for a, b in zip(t, t[1:]) if a[1] > b[1])      # voisins qui ne se suivent pas
        # Lot fiable : assez de repères ajoutés ce jour-là, presque tous dans l'ordre. Sinon (cartes dévoilées avant
        # la sortie, promos ajoutées une à une) seule une place exacte compte, et rien ne permet de dire non.
        fiable = len(l) >= 8 and inv(l) <= 0.08 * (len(l) - 1)
        ok_b, ok_h = sum(1 for x in bas if x[1] <= n), sum(1 for x in haut if x[1] >= n)
        contre = len(bas) + len(haut) - ok_b - ok_h
        if bas and haut and bas[-1][1] > haut[0][1] and sum(1 for x in bas for y in haut if x[1] > y[1]) * 2 > len(bas) * len(haut):
            # frontière entre deux lots : la carte suit le lot du bas ou précède celui du haut
            if inv(bas) or inv(haut):
                v = None
            elif ((len(bas) >= 2 or exact_b) and ok_b == len(bas)) or ((len(haut) >= 2 or exact_h) and ok_h == len(haut)):
                v = True
            else:
                v = False if len(bas) >= 2 and len(haut) >= 2 else None
        elif inv(bas + haut) >= 2:
            v = None
        elif contre <= 1 and (ok_b + ok_h >= 2 or (exact and not contre)):
            v = True
        elif contre >= 2 and len(bas) + len(haut) >= 3:
            v = False
        else:
            v = None
        if not fiable and not (v and exact):
            v = None
        if v is False and not self.de_la_place(c, p['date'], l):
            v = None
        if v and self.bloc(c, p) < 0:
            v = None       # au milieu d'une autre suite de numéros : des repères lointains ne prouvent rien
        return v, exact if v else 0

    def de_la_place(self, c, date, l):
        """Entre les repères qui encadrent le numéro de la carte, reste-t-il un produit libre qui pourrait être le
        sien ? Sinon ce lot n'est pas rangé dans l'ordre à cet endroit, et l'ordre ne permet pas de refuser un produit."""
        a = max((x for x in l if x[1] < c.n), key=lambda x: x[1], default=None)
        b = min((x for x in l if x[1] > c.n), key=lambda x: x[1], default=None)
        if a and b:
            lo, hi = sorted((a[0], b[0]))
        elif a:
            lo, hi = a[0], float('inf')
        elif b:
            lo, hi = -1, b[0]
        else:
            return True
        ids = self.ids.get(date, ())
        i = bisect.bisect_right(ids, lo)
        while i < len(ids) and ids[i] < hi:
            if ids[i] not in self.tenus and ids[i] not in self.pris:
                return True
            i += 1
        return False


# ---------- 5. Placement ----------
def _groupes(cartes, choix):
    """Groupes de cartes qui se disputent les mêmes produits."""
    parent = {}

    def racine(x):
        while parent.setdefault(x, x) != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x
    for c in cartes:
        for p in choix[c.cle]:
            parent[racine(('c', c.cle))] = racine(('p', p['id']))
    groupes = collections.defaultdict(list)
    for c in cartes:
        if choix[c.cle]:
            groupes[racine(('c', c.cle))].append(c)
    return list(groupes.values())


MAX_PAS = 60000


def _par_paires(cs, produits):
    """Kit de démarrage : deux decks numérotés chacun de 1 à 30, dans une seule extension. Cardmarket range certains
    kits carte par carte (les deux cartes n° 1, puis les deux n° 2..., dans un ordre ou dans l'autre) : la place d'un
    produit dit alors sa carte, même parmi trente énergies du même nom. Rend {clé de carte: produit} pour les cartes
    ainsi désignées ; {} si l'extension n'est pas rangée de cette façon (moins de neuf produits sur dix à la place
    d'une carte de leur nom)."""
    if not produits or any(c.n is None or c.cls[1] or c.n[1] for c in cs):
        return {}
    date = collections.Counter(p['date'] for p in produits).most_common(1)[0][0]
    ps = [p for p in produits if p['date'] == date]
    par_num = collections.defaultdict(list)
    for c in cs:
        par_num[c.n[0]].append(c)
    if not 16 <= len(ps) <= len(cs) or any(len(l) > 2 for l in par_num.values()):
        return {}
    va = lambda c, p: niveau(c.cles, c.sig, p['cles'], p['sig'])
    if sum(1 for i, p in enumerate(ps) if any(va(c, p) for c in par_num[i // 2 + 1])) < 0.9 * len(ps):
        return {}
    out = {}
    for k in range(0, len(ps), 2):
        paire, deux = ps[k:k + 2], par_num[k // 2 + 1]
        # Les façons de donner aux cartes de ce numéro les produits de la paire qui portent leur nom : on retient ce
        # sur quoi s'accordent toutes celles qui placent le plus de cartes.
        facons = [f for f in itertools.permutations(paire + [None, None], len(deux))
                  if all(p is None or va(c, p) for c, p in zip(deux, f))]
        plein = max(sum(p is not None for p in f) for f in facons)
        facons = [f for f in facons if sum(p is not None for p in f) == plein]
        for n, c in enumerate(deux):
            if facons[0][n] is not None and all(f[n] is facons[0][n] for f in facons):
                out[c.cle] = facons[0][n]
    return out


def _par_noms(cs, produits):
    """Autre rangement de kit de démarrage : un deck après l'autre, les cartes du même nom regroupées à la place de la
    première (les neuf Énergies Électrique n° 1, 2, 3, 5..., puis la carte n° 4, la n° 6...). Rend {clé de carte:
    produit} pour chaque deck complet dont toutes les cartes retrouvent ainsi, à la suite et à un seul endroit de
    l'extension, un produit de leur nom."""
    out = {}
    if not produits:
        return out
    date = collections.Counter(p['date'] for p in produits).most_common(1)[0][0]
    ps = [p for p in produits if p['date'] == date]
    decks = collections.defaultdict(list)
    for c in cs:
        decks[c.set].append(c)
    for deck in decks.values():
        if any(c.n is None or c.cls[1] or c.n[1] for c in deck):
            continue
        deck.sort(key=lambda c: c.n)
        if len(deck) < 16 or [c.n[0] for c in deck] != list(range(1, len(deck) + 1)):
            continue
        premier = {}                               # (nom, attaques) → numéro de la première carte de ce nom
        for c in deck:
            premier.setdefault((c.cles, c.sig), c.n[0])
        suite = sorted(deck, key=lambda c: (premier[(c.cles, c.sig)], c.n))
        if suite == deck:                          # aucun regroupement : c'est l'ordre des numéros, traité plus loin
            continue
        places = [k for k in range(len(ps) - len(suite) + 1)
                  if all(niveau(c.cles, c.sig, p['cles'], p['sig']) for c, p in zip(suite, ps[k:]))]
        if len(places) == 1:
            out.update({c.cle: p for c, p in zip(suite, ps[places[0]:])})
    return out


def _rangees(cs, choix):
    """Groupe trop grand pour tout essayer. Si ses cartes sont de la même suite, veulent toutes les mêmes produits
    et qu'il y en a autant que de cartes (les huit « Gym Badge » des promos XY), une seule façon est retenue :
    cartes et produits dans le même ordre."""
    ids = sorted({p['id'] for c in cs for p in choix[c.cle]})
    par_id = {p['id']: p for c in cs for p in choix[c.cle]}
    if (len(ids) != len(cs) or len({c.cls for c in cs}) != 1 or any(c.n is None for c in cs)
            or len({c.n for c in cs}) != len(cs) or any(sorted(p['id'] for p in choix[c.cle]) != ids for c in cs)
            or len({par_id[i]['date'] for i in ids}) != 1):
        return []
    return [[(c, par_id[i]) for c, i in zip(sorted(cs, key=lambda c: c.n), ids)]]


def _solutions(cs, choix, sans):
    """Toutes les façons de donner un produit différent à chaque carte, en laissant exactement `sans` cartes sans
    produit. Rend (solutions, coupé) ; une solution est une liste de (carte, produit ou None)."""
    cs = sorted(cs, key=lambda c: (len(choix[c.cle]), c.cle))
    sols, pris, cur, pas = [], set(), [], [0]

    def aller(i, reste):
        if pas[0] > MAX_PAS:
            return
        if i == len(cs):
            if reste == 0:
                sols.append(list(cur))
            return
        c = cs[i]
        for p in choix[c.cle]:
            pas[0] += 1
            if p['id'] in pris:
                continue
            pris.add(p['id'])
            cur.append((c, p))
            aller(i + 1, reste)
            cur.pop()
            pris.discard(p['id'])
        if reste:
            pas[0] += 1
            cur.append((c, None))
            aller(i + 1, reste - 1)
            cur.pop()
    aller(0, sans)
    return sols, pas[0] > MAX_PAS


DELAI_LOT = 120    # jours : au-delà, un produit n'a pas été ajouté « avec » la série
ECART_LOT = 500    # les plus anciens produits n'ont pas de date : au-delà de cet écart de numéros, ils sont à l'écart


def resoudre(cartes, produits, par_exp, extrait, manuels=None):
    manuels = manuels or {}
    principal, detail, idx = extensions(cartes, produits, par_exp, extrait)
    # Kits de démarrage au rangement reconnu : la place de chaque produit dit sa carte (voir _par_paires, _par_noms)
    par_ext = collections.defaultdict(list)
    for c in cartes:
        if principal.get(c.set) is not None:
            par_ext[principal[c.set]].append(c)
    paires, figees = {}, set()   # clé de carte → produit donné par ce rangement ; cartes ainsi placées pour de bon
    for e, cs in par_ext.items():
        if len({c.set for c in cs}) == 2:
            paires.update(_par_paires(cs, par_exp.get(e, ())) or _par_noms(cs, par_exp.get(e, ())))
    usage = collections.Counter(c.cm for c in cartes if c.cm)
    suites = collections.defaultdict(set)
    for c in cartes:
        suites[principal.get(c.set)].add(c.cls)
    ordres = {e: Ordre(par_exp.get(e, ()), len(suites[e])) for e in set(principal.values())}
    pris = {}                    # id produit → carte qui le tient
    for o in ordres.values():
        o.pris = pris
    # Toutes les cartes placées, repères ou non, par lot (produits ajoutés le même jour) :
    places = collections.defaultdict(list)   # (suite de numéros, jour d'ajout) → [(numéro de produit, numéro de carte)] triés
    bornes = {}                              # (suite, jour) → (plus petit, plus grand numéro de carte du lot)

    def ranger(c, p, pose):
        if c.n is not None and p['exp'] == c.exp:
            k = (c.cls, p['date'])
            l = places[k]
            if pose:
                bisect.insort(l, (p['id'], c.n))
            else:
                i = bisect.bisect_left(l, (p['id'], c.n))
                if i < len(l) and l[i] == (p['id'], c.n):
                    del l[i]
            bornes.pop(k, None)

    def etendue(k):
        if k not in bornes:
            l = places.get(k)
            bornes[k] = (min(x[1] for x in l), max(x[1] for x in l)) if l else None
        return bornes[k]

    def sens(c, p):
        """Sens du rangement autour du produit, d'après les deux cartes placées de chaque côté : +1 les numéros de
        carte montent avec ceux des produits, -1 ils descendent (Cardmarket range parfois un lot à rebours : les
        cartes secrètes de Rebel Clash), 0 on ne sait pas."""
        l = places.get((c.cls, p['date']), ())
        i = bisect.bisect_left(l, (p['id'], (-1, '')))
        autour = [x[1] for x in l[max(0, i - 2):i]] + [x[1] for x in l[i:i + 3] if x[0] != p['id']][:2]
        if len(autour) < 3:
            return 0
        monte = [a < b for a, b in zip(autour, autour[1:])]
        return 1 if all(monte) else -1 if not any(monte) else 0

    def proches(c, p):
        """Nombre de côtés (0 à 2) où le produit voisin dans l'extension est tenu par la carte d'à côté : numéro
        juste avant ou juste après, dans un sens ou dans l'autre. Toutes les cartes placées comptent, repères ou non."""
        if c.n is None or c.n[1] or p['exp'] != c.exp:
            return 0
        ids, nb = ordres[c.exp].ids.get(p['date'], ()), 0
        i = bisect.bisect_left(ids, p['id'])
        for j in (i - 1, i + 1):
            if 0 <= j < len(ids) and abs(ids[j] - p['id']) <= 10:
                v = pris.get(ids[j])
                if (v is not None and v is not c and v.cls == c.cls and v.n is not None and not v.n[1]
                        and abs(v.n[0] - c.n[0]) == 1):
                    nb += 1
        return nb

    def poser(c, p, etat, motif, rep):
        """Donne le produit à la carte. rep : la carte sert de repère pour placer les autres."""
        c.etat, c.nouveau, c.motif, c.rep = etat, p['id'], motif, rep
        pris[p['id']] = c
        ranger(c, p, True)
        if rep:
            ordres[c.exp].ajouter(c, p)

    def lever(c):
        p = produits[c.nouveau]
        del pris[p['id']]
        ranger(c, p, False)
        if c.rep:
            ordres[c.exp].retirer(c, p)
        c.etat, c.nouveau, c.motif, c.rep = None, None, '', False

    def niv(c, p):
        return next(n for n, q in c.cand if q is p)

    def permis(c, large):
        """Produits qui conviennent à la carte : mêmes attaques s'il en existe, sinon ce qu'il y a de mieux.
        large : aussi les produits du même nom aux attaques non comparables (« Ho-Oh LEGEND [Top] »)."""
        if not c.cand:
            return []
        seuil = min(3, c.cand[0][0])
        return [p for n, p in c.cand if n >= seuil or (large and n == 1)]

    # --- 2 et 3. Candidats, et liens actuels gardés d'emblée ---
    for c in cartes:
        c.exp = principal.get(c.set)
        if c.cle in manuels:
            c.etat, c.nouveau, c.motif = 'manuel', manuels[c.cle] or 0, 'correction à la main'
            if c.nouveau:
                pris[c.nouveau] = c
                ranger(c, produits[c.nouveau], True)
        elif c.exp is None:
            c.etat, c.nouveau, c.motif = ('garde', c.cm, 'série sans extension connue') if c.cm else ('sans', 0, '')
        else:
            c.cand = candidats(c, c.exp, idx)
            p = produits.get(c.cm)
            if p and p['exp'] != c.exp:
                # Lien actuel vers une autre extension (les énergies de base ont la leur) : il reste en lice s'il
                # porte le même nom et les mêmes attaques.
                n = niveau(c.cles, c.sig, p['cles'], p['sig'])
                if n >= 3:
                    c.cand.append((n, p))
            c.cand.sort(key=lambda x: (-x[0], x[1]['id']))
    for c in cartes:
        p = paires.get(c.cle)
        if p is not None and c.etat is None and p['id'] not in pris:
            poser(c, p, 'garde' if p['id'] == c.cm else 'resolu', 'place dans le kit de démarrage', False)
            figees.add(c.cle)
    # Une carte est sûre quand un seul produit lui convient et qu'il ne convient à aucune autre : elle seule sert
    # de repère au départ. Les cartes jumelles gardent leur lien pour l'instant, sans servir de repère : TCGdex
    # les intervertit parfois par séries entières (holos et non holos d'Aquapolis).
    demande = collections.Counter(p['id'] for c in cartes for p in permis(c, False))

    def sure(c):
        seul = permis(c, False)
        return len(seul) == 1 and demande[seul[0]['id']] == 1
    verifies = set()             # cartes dont le lien actuel est vérifié (nom et attaques) et n'est partagé avec aucune autre
    for c in cartes:
        if c.etat is not None or not c.cand:
            continue
        mieux = c.cand[0][0]
        actuel = next((n for n, p in c.cand if p['id'] == c.cm), 0)
        if c.cm and usage[c.cm] == 1 and actuel and actuel == mieux and c.cm not in pris:
            if actuel >= 3:
                verifies.add(c.cle)
            poser(c, produits[c.cm], 'garde', 'nom et attaques vérifiés' if actuel >= 3 else 'même nom', sure(c))
    jours, voisines, ecarts, attendus, fil = collections.defaultdict(list), collections.defaultdict(list), {}, {}, {}
    premier = min((p['jour'] for p in produits.values() if p['jour']), default=0)   # premier jour daté du catalogue

    def dater():
        """Produits des repères (jour d'ajout, numéro) : par série, et par suite de numéros."""
        jours.clear()
        voisines.clear()
        ecarts.clear()
        fil.clear()
        for c in cartes:
            if c.rep:
                p = produits[c.nouveau]
                jours[c.set].append((p['jour'], p['id']))
                if c.n is not None:
                    voisines[c.cls].append((c.n, p['jour'], p['id']))
        for l in list(jours.values()) + list(voisines.values()):
            l.sort()
        # Rang habituel de la carte quand Cardmarket range plusieurs produits du même nom côte à côte
        comptes = collections.defaultdict(collections.Counter)
        for c in cartes:
            if c.cle in verifies and c.nouveau == c.cm and c.exp is not None:
                r = ordres[c.exp].rang.get(c.cm)
                if r:
                    comptes[(c.exp, produits[c.cm]['date'], r[1])][r[0]] += 1
                    comptes[(c.exp, None, r[1])][r[0]] += 1
        attendus.clear()
        for k, n in comptes.items():
            (rang, nb), total = n.most_common(1)[0], sum(n.values())
            if total >= 3 and nb >= 0.75 * total:
                attendus[k] = rang

    def conforme(c, p, donnes=()):
        """Cardmarket range parfois côte à côte plusieurs produits du même nom pour une seule carte (la carte et sa
        version brillante ou tamponnée). Les liens vérifiés de la série disent lequel est la carte : presque toujours
        le premier. +1 si le produit est à ce rang ; -1 s'il est à un autre alors que celui de ce rang reste libre
        (donnes : produits attribués en même temps) ; 0 si rien ne le dit."""
        r = ordres[c.exp].rang.get(p['id']) if p['exp'] == c.exp else None
        if not r:
            return 0
        a = attendus.get((c.exp, p['date'], r[1]), attendus.get((c.exp, None, r[1])))
        if a is None:
            return 0
        if a == r[0]:
            return 1
        return -1 if r[2][a] not in donnes and r[2][a] not in pris else 0

    def loin(p, j, i):
        """Le produit p a-t-il été ajouté à l'écart du produit numéro i, ajouté le jour j ?"""
        if not p['jour'] and not j:
            return abs(p['id'] - i) > ECART_LOT
        return abs((p['jour'] or premier) - (j or premier)) > DELAI_LOT

    def hors_lot(c, p):
        """Le produit a-t-il été ajouté à l'écart des cartes voisines (faute de voisines : de toute la série) ?
        Carte géante offerte dans les boîtes, version tamponnée, réédition : même nom et mêmes attaques, mais ce
        n'est pas la carte. Dans les promos, numérotées au fil des années, c'est aussi la carte d'une autre année."""
        k = (c.cle, p['id'])
        if k not in ecarts:
            l, pres = voisines.get(c.cls, ()), []
            if c.n is not None and len(l) >= 4:
                i = bisect.bisect_left(l, (c.n, -1, -1))
                pres = [x[1:] for x in l[max(0, i - 2):i + 2] if x[2] != p['id']]
            if len(pres) < 2:
                pres = [x for x in jours.get(c.set, ()) if x[1] != p['id']]
                if len(pres) < 8:
                    pres = []
            ecarts[k] = bool(pres) and all(loin(p, j, i) for j, i in pres)
        return ecarts[k]

    def au_fil(cls):
        """Les numéros de cette suite suivent-ils les jours d'ajout ? (promos, numérotées au fil des années) :
        d'un repère au suivant, quand le jour change, c'est presque toujours pour un jour plus tardif."""
        if cls not in fil:
            l = voisines.get(cls, ())
            sauts = [y[1] > x[1] for x, y in zip(l, l[1:]) if x[1] != y[1]]
            fil[cls] = len(sauts) >= 4 and sum(sauts) >= 0.75 * len(sauts)
        return fil[cls]

    def a_l_envers(a, p, b, q):
        """Deux cartes de la même suite reçoivent-elles leurs produits à l'envers de leurs numéros ? Dans un lot
        (produits ajoutés le même jour), les numéros de produit suivent ceux des cartes, sauf là où le lot est rangé
        à rebours. Entre deux lots, cela ne vaut que s'ils ne se chevauchent pas (les promos, numérotées au fil des
        années) : c'est alors l'ordre des lots qui compte. Quand un lot complète l'autre (cartes oubliées, ajoutées
        le lendemain), rien à comparer."""
        if a.cls != b.cls or a.n is None or b.n is None or a.n == b.n:
            return False
        if p['date'] != q['date']:
            la, lb = etendue((a.cls, p['date'])), etendue((b.cls, q['date']))
            if la and lb:
                if la[1] < lb[0] or lb[1] < la[0]:
                    return (a.n < b.n) != (la[1] < lb[0])
                return False
            # Un des deux lots n'a encore aucune carte placée. L'ordre des produits ne vaut alors que pour des lots
            # ajoutés à la suite (série mise au catalogue en plusieurs fois), pour les variantes d'un même numéro
            # (98a, 98b) ou dans une suite numérotée au fil des années. Un produit ajouté bien après la série peut
            # être une carte oubliée, n'importe où dans la série.
            if a.n[0] != b.n[0] and loin(p, q['jour'], q['id']) and not au_fil(a.cls):
                return False
        else:
            sa, sb = sens(a, p), sens(b, q)
            if sa == sb == -1:           # lot rangé à rebours à ces deux endroits
                return (a.n < b.n) != (p['id'] > q['id'])
            if sa == -1 or sb == -1:     # à rebours d'un côté seulement : rien à comparer
                return False
            if not sa == sb == 1 and p['exp'] == a.exp and ordres[a.exp].melange((a.cls, p['date'])):
                return False             # lot rangé sans suivre les numéros : rien à comparer non plus
        return (a.n < b.n) != (p['id'] < q['id'])

    def note(sol, verdicts):
        """Qualité d'une façon de placer un groupe : produits au rang habituel parmi leurs jumeaux, places exactes,
        places confirmées, produits au milieu de leur suite de numéros, produits ajoutés avec la série, liens actuels
        gardés, produits à côté de celui de la carte d'à côté, puis respect de l'ordre des numéros entre les cartes
        du groupe."""
        poses = [(c, p) for c, p in sol if p is not None]
        donnes = {p['id'] for _, p in poses}
        rang = sum(conforme(c, p, donnes) for c, p in poses)
        exact = sum(verdicts[(c.cle, p['id'])][1] for c, p in poses)
        vrais = sum(1 for c, p in poses if verdicts[(c.cle, p['id'])][0])
        suite = sum(ordres[c.exp].bloc(c, p) for c, p in poses if p['exp'] == c.exp)
        ecart = sum(1 for c, p in poses if hors_lot(c, p))
        gardes = sum(1 for c, p in poses if p['id'] == c.cm)
        cote = sum(proches(c, p) for c, p in poses)
        ordre = not any(a_l_envers(a, p, b, q) for k, (a, p) in enumerate(poses) for b, q in poses[k + 1:])
        return rang, exact, vrais, suite, -ecart, gardes, cote, int(ordre)

    def passe(large):
        """Reprend chaque groupe de cartes qui se disputent des produits : cartes à décider, et cartes déjà placées
        qui ont une jumelle. Rend le nombre de cartes dont le lien ou le rôle de repère a changé."""
        dater()
        en_jeu = [c for c in cartes if c.exp is not None and c.etat != 'manuel' and c.cle not in figees and c.cand
                  and (c.etat is None or len(permis(c, large)) >= 2)]
        tous = {c.cle: permis(c, large) for c in en_jeu}
        bouge = 0
        for groupe in _groupes(en_jeu, tous):
            avant = {c.cle: (c.nouveau, c.etat, c.motif, c.rep) for c in groupe}
            for c in groupe:
                if c.etat is not None:
                    lever(c)
            o = ordres[groupe[0].exp]
            verdicts, choix, refuses, tenus = {}, {}, {}, {}
            for c in groupe:
                libres = [p for p in tous[c.cle] if p['id'] not in pris]   # les autres sont tenus hors du groupe
                for p in libres:
                    verdicts[(c.cle, p['id'])] = o.place(c, p) if p['exp'] == c.exp else (None, 0)
                refuses[c.cle] = {p['id'] for p in libres if verdicts[(c.cle, p['id'])][0] is False}
                tous_refuses = bool(libres) and all(verdicts[(c.cle, p['id'])][0] is False for p in libres)
                if (c.cle in verifies and produits[c.cm]['exp'] == c.exp and any(p['id'] == c.cm for p in libres)
                        and o.bloc(c, produits[c.cm]) >= 0):
                    # Lien vérifié, dans l'extension de la série, resté libre, et pas au milieu d'une autre suite de
                    # numéros : l'ordre seul ne suffit pas à l'écarter
                    tenus[c.cle] = c.cm
                    if verdicts[(c.cle, c.cm)][0] is False:
                        verdicts[(c.cle, c.cm)] = (None, 0)
                if sure(c):
                    # Un seul produit de ce nom et de ces attaques, pour une seule carte : c'est le sien, même si le
                    # catalogue l'a rangé ailleurs.
                    for p in libres:
                        if verdicts[(c.cle, p['id'])][0] is False:
                            verdicts[(c.cle, p['id'])] = (None, 0)
                elif tous_refuses:
                    # Tout est refusé par l'ordre (les deux Cochignon de Skyridge sont intervertis dans le catalogue) :
                    # ce qui est au milieu de la bonne suite de numéros reste en lice.
                    for p in libres:
                        if o.bloc(c, p) > 0:
                            verdicts[(c.cle, p['id'])] = (None, 0)
                choix[c.cle] = [p for p in libres if verdicts[(c.cle, p['id'])][0] is not False]

            def admise(sol):
                """Un lien vérifié ne se quitte pas sans raison. TCGdex pointe parfois vers le bon produit là où
                Cardmarket en a deux pour la même carte (la carte et sa version tamponnée, rangées côte à côte) :
                l'ordre des numéros ne dit pas lequel est la carte. On ne quitte donc un tel lien que si son produit
                va à une autre carte du groupe, ou s'il a été ajouté bien après la série (carte géante, réédition)."""
                donnes = {p['id'] for _, p in sol if p is not None}
                return all(tenus.get(c.cle) is None or (p is not None and p['id'] == c.cm) or c.cm in donnes
                           or hors_lot(c, produits[c.cm]) for c, p in sol)

            def chercher(ch):
                """Façons de placer le groupe en laissant le moins de cartes possible sans produit. None : trop."""
                for sans in range(0, min(len(groupe), 3) + 1):
                    trouvees, coupe = _solutions(groupe, ch, sans)
                    if coupe:
                        return None
                    trouvees = [sol for sol in trouvees if admise(sol)]
                    if trouvees:
                        return trouvees
                return []
            sols = chercher(choix)
            if sols is None:
                # Trop de façons : pour chaque carte, on s'en tient aux produits que ses voisines confirment
                surs = {c.cle: [p for p in choix[c.cle] if verdicts[(c.cle, p['id'])][0] or tenus.get(c.cle) == p['id']]
                        or choix[c.cle] for c in groupe}
                sols = chercher(surs)
                if sols is None:
                    sols = [sol for sol in _rangees(groupe, surs) if admise(sol)
                            and not o.melange((groupe[0].cls, sol[0][1]['date']))]
            poses = {}                                       # carte → produit décidé
            if sols:
                notes = sorted(((note(sol, verdicts), k) for k, sol in enumerate(sols)), reverse=True)
                gagne = notes[0][0]
                second = next((nt for nt, _ in notes if nt != gagne), None)
                en_tete = [{c.cle: p for c, p in sols[k]} for nt, k in notes if nt == gagne]
                # Les façons que seuls départagent les liens actuels : une carte n'est repère que si toutes
                # lui donnent le même produit, et que ses voisines le confirment.
                sommet = [{c.cle: p for c, p in sols[k]} for nt, k in notes if nt[:3] == gagne[:3]]
                # Plusieurs façons à égalité : on ne retient que ce sur quoi elles s'accordent toutes
                for c in groupe:
                    p = en_tete[0][c.cle]
                    if p is not None and all(sol[c.cle] is p for sol in en_tete):
                        poses[c.cle] = p
            donnes = {p['id'] for p in poses.values()}
            for c in groupe:
                p = poses.get(c.cle)
                if p is None:
                    # Rien de net pour cette carte : elle retrouve son produit s'il est resté libre
                    a = avant[c.cle]
                    if a[0] and a[0] not in donnes:
                        poser(c, produits[a[0]], a[1], a[2], a[3])
                else:
                    v = verdicts[(c.cle, p['id'])]
                    net = bool(v[0]) and all(sol[c.cle] is p for sol in sommet)
                    net = net or (sure(c) and p['exp'] == c.exp and p['id'] not in refuses[c.cle])
                    if p['id'] == c.cm and usage[c.cm] == 1:
                        poser(c, p, 'garde', 'nom et attaques vérifiés' if niv(c, p) >= 3 else 'même nom', net)
                    else:
                        if v[0]:
                            motif = 'place confirmée par les cartes voisines'
                        elif len(sols) == 1 or len(choix[c.cle]) == 1:
                            motif = 'seul produit possible'
                        elif second is not None and gagne[0] > second[0]:
                            motif = 'rangé comme les autres cartes de la série'
                        elif second is not None and gagne[:3] == second[:3] and gagne[3] > second[3]:
                            motif = 'au milieu de sa suite de numéros'
                        elif second is not None and gagne[:4] == second[:4] and gagne[4] > second[4]:
                            motif = 'produit ajouté avec la série'
                        elif second is not None and gagne[:6] == second[:6] and gagne[6] > second[6]:
                            motif = 'à la suite des cartes voisines'
                        elif second is not None and gagne[:7] == second[:7]:
                            motif = 'ordre des numéros'
                        else:
                            motif = 'seule façon de placer le groupe'
                        poser(c, p, 'resolu', motif, net)
                if (c.nouveau, c.rep) != (avant[c.cle][0], avant[c.cle][3]):
                    bouge += 1
        return bouge

    for large in (False, True):
        for _ in range(12):
            if not passe(large):
                break
    # --- Les cartes encore sans décision, dans la continuité de leurs voisines ---
    # Toutes les cartes placées servent maintenant de repère. Une carte prend le produit qui suit exactement celui
    # de la carte d'avant (ou précède celui de la carte d'après), s'il n'y en a qu'un.
    for c in cartes:
        p = produits.get(c.nouveau)
        if p and not c.rep and c.etat != 'manuel' and c.exp is not None and p['exp'] == c.exp:
            c.rep = True
            ordres[c.exp].ajouter(c, p)
    encore = True
    while encore:
        encore = False
        for c in cartes:
            if c.etat is None and c.exp is not None and c.cand:
                suivent = [p for p in permis(c, True) if p['id'] not in pris and p['exp'] == c.exp and conforme(c, p) >= 0
                           and ordres[c.exp].place(c, p)[1]]
                if len(suivent) == 1:
                    poser(c, suivent[0], 'resolu', 'à la suite des cartes voisines', True)
                    encore = True
    # --- Les cartes restées sans produit, dans l'extension annexe de leur série ---
    # Cardmarket range les énergies de base à part, un lot par série. Quand plusieurs cartes d'une série ont un lien
    # vérifié dans un tel lot, les autres y prennent le produit de leur nom, s'il n'y en a qu'un de libre.
    annexes = collections.defaultdict(collections.Counter)
    for c in cartes:
        p = produits.get(c.nouveau or 0)
        if p and c.exp is not None and p['exp'] != c.exp and c.nouveau == c.cm and c.etat == 'garde':
            annexes[c.set][(p['exp'], p['date'])] += 1
    for c in cartes:
        if c.etat is None and c.exp is not None and c.set in annexes:
            libres = [p for (e, date), nb in annexes[c.set].items() if nb >= 3
                      for n, p in candidats(c, e, idx) if n >= 3 and p['date'] == date and p['id'] not in pris]
            if len(libres) == 1:
                poser(c, libres[0], 'resolu', 'dans le lot d\'énergies de la série', False)
    # --- 6. Ce qui reste ---
    for c in cartes:
        if c.etat is not None:
            continue
        actuel = next((n for n, p in c.cand if p['id'] == c.cm), 0)
        p = produits.get(c.cm)
        if not c.cm:
            libres = [q for q in permis(c, True) if q['id'] not in pris]
            c.etat, c.nouveau = 'sans', 0
            c.motif = 'plusieurs cartes pour ces produits, rien pour trancher' if libres else 'produit non retrouvé' if c.cand else ''
        elif pris.get(c.cm) not in (None, c):
            c.etat, c.nouveau, c.motif = 'retire', 0, 'ce produit est celui de ' + pris[c.cm].cle
        elif actuel:
            c.etat, c.nouveau = 'garde', c.cm
            c.motif = 'indiscernable d\'une autre carte' if usage[c.cm] > 1 else 'même nom, place non vérifiée'
        elif p and p['exp'] == c.exp and usage[c.cm] == 1 and c.cles & p['cles']:
            # Même nom, attaques différentes, et aucune autre carte ne réclame ce produit : c'est la liste des
            # attaques qui est fausse d'un côté ou de l'autre (Dracaufeu-EX XY121).
            c.etat, c.nouveau, c.motif = 'garde', c.cm, 'même nom, attaques différentes'
        elif c.cand or usage[c.cm] > 1 or not p or p['exp'] != c.exp:
            c.etat, c.nouveau, c.motif = 'retire', 0, 'le produit lié est une autre carte'
        else:
            c.etat, c.nouveau, c.motif = 'garde', c.cm, 'nom différent, rien de mieux dans l\'extension'
    return {'principal': principal, 'detail': detail, 'usage': usage, 'ordres': ordres, 'pris': pris}


# ---------- Bilan, rapport, écriture ----------
GUIDE = {'low': 'low', 'trend': 'trend', 'avg30': 'avg30', 'trendHolo': 'trend-holo', 'avg1': 'avg1', 'avg7': 'avg7'}
CLES_CARTE = ('n', 'num', 's', 'i', 'r', 'dex', 't', 'cm', 'p', 'f', 'inf')   # ordre des clés d'une carte dans la base
MAX_CHANGEMENTS = 0.12


def lire_prix(chemin, champs):
    """Archive quotidienne → ({produit: [valeurs dans l'ordre de priceFields, en euros]}, jour du guide)."""
    d = ouvrir(chemin)
    inconnus = [c for c in champs if GUIDE.get(c) not in d['champs']]
    if inconnus or len(d['lignes']) < 10000:
        sys.exit(f'ERREUR : archive de prix incomplète ({len(d["lignes"])} lignes, champs absents : {inconnus}). Rien enregistré.')
    pos = [d['champs'].index(GUIDE[c]) + 1 for c in champs]
    nombre = lambda v: round(float(v), 2) if isinstance(v, (int, float)) and not isinstance(v, bool) else None
    return {l[0]: [nombre(l[i]) for i in pos] for l in d['lignes']}, str(d.get('guide'))[:10]


def valeur(ligne, champs):
    """Prix de référence d'un produit pour le rapport : ventes sur 30 jours, sinon tendance."""
    m = dict(zip(champs, ligne or ()))
    return m.get('avg30') or m.get('trend') or None


def changements(cartes):
    return [c for c in cartes if (c.nouveau or 0) != (c.cm or 0)]


def bilan(cartes):
    """Le bilan en quelques lignes."""
    avant = collections.Counter(c.cm for c in cartes if c.cm)
    apres = collections.Counter(c.nouveau for c in cartes if c.nouveau)
    doubles = lambda n: (sum(1 for v in n.values() if v > 1), sum(v for v in n.values() if v > 1))
    ch = changements(cartes)
    sorte = collections.Counter('ajoutés' if not c.cm else 'retirés' if not c.nouveau else 'remplacés' for c in ch)
    motifs = collections.Counter((c.etat, re.sub(r' de en:\S+$', ' d\'une autre carte', c.motif)) for c in cartes)
    series = collections.Counter(c.set.split(':', 1)[1] for c in ch)
    lignes = [f'{len(cartes)} cartes occidentales, {sum(1 for c in cartes if c.cm)} liens avant, {sum(1 for c in cartes if c.nouveau)} après.',
              'Liens partagés par plusieurs cartes : %d (%d cartes) avant, %d (%d cartes) après.' % (doubles(avant) + doubles(apres)),
              f'Liens changés : {len(ch)} ({", ".join(f"{n} {k}" for k, n in sorte.most_common())}).' if ch else 'Aucun lien à changer.']
    if ch:
        lignes.append('Séries les plus touchées : ' + ', '.join(f'{s} ({n})' for s, n in series.most_common(12)) + '.')
    lignes += [f'  {n:6d}  {etat:7s} {motif}' for (etat, motif), n in motifs.most_common()]
    return '\n'.join(lignes)


def a_verifier(cartes, produits, ctx, prix, champs):
    """Liens gardés qui méritent un coup d'œil : un autre produit du même nom et des mêmes attaques, libre, est
    exactement à la place de la carte, et il vaut au moins cinq fois moins cher. La carte normale étant presque
    toujours la moins chère de ses versions, le lien gardé est peut-être celui d'une version spéciale."""
    out = []
    for c in cartes:
        if c.etat != 'garde' or not c.nouveau or c.exp is None:
            continue
        a = valeur(prix.get(c.nouveau), champs)
        for n, p in c.cand:
            if n < 3 or p['id'] == c.nouveau or p['id'] in ctx['pris'] or p['exp'] != c.exp:
                continue
            b = valeur(prix.get(p['id']), champs)
            if a and b and a >= 5 * b and a >= 2 and ctx['ordres'][c.exp].place(c, p)[1]:
                out.append({'carte': c.cle, 'nom': c.nom, 'lien': c.nouveau, 'prix': a, 'autre': p['id'], 'prix_autre': b,
                            'ajoute': [produits[c.nouveau]['date'], p['date']]})
    return out


def rapport(cartes, produits, ctx, prix, champs):
    nom = lambda i: produits[i]['nom'] if i in produits else None
    return {'changements': [{'carte': c.cle, 'nom': c.nom, 'avant': c.cm or 0, 'apres': c.nouveau or 0, 'motif': c.motif,
                             'produit_avant': nom(c.cm), 'produit_apres': nom(c.nouveau),
                             'prix_avant': valeur(prix.get(c.cm), champs), 'prix_apres': valeur(prix.get(c.nouveau), champs)}
                            for c in changements(cartes)],
            'sans_lien': [{'carte': c.cle, 'nom': c.nom, 'motif': c.motif} for c in cartes if not c.nouveau],
            'a_verifier': a_verifier(cartes, produits, ctx, prix, champs) if prix else [],
            'extensions': {s: d['extension'] for s, d in ctx['detail'].items()}}


def appliquer(base, cartes, prix):
    """Écrit les liens décidés dans la base (en mémoire) : « cm » et « p » des cartes dont le lien change, rien d'autre."""
    rang = {k: i for i, k in enumerate(CLES_CARTE)}
    for c in changements(cartes):
        d = dict(base['cards'][c.k])
        d.pop('cm', None)
        d.pop('p', None)
        if c.nouveau:
            d['cm'] = c.nouveau
            if prix.get(c.nouveau) is not None:
                d['p'] = prix[c.nouveau]      # prix de secours : l'appli le remplace par celui du relevé du jour
        base['cards'][c.k] = dict(sorted(d.items(), key=lambda kv: rang.get(kv[0], len(CLES_CARTE))))


def main():
    ap = argparse.ArgumentParser(description='Vérifie et corrige les liens Cardmarket de data/cards.json')
    ap.add_argument('extrait')
    ap.add_argument('catalogue')
    ap.add_argument('--prix')
    ap.add_argument('--rapport')
    ap.add_argument('--ecrire', action='store_true')
    ap.add_argument('--forcer', action='store_true')
    ap.add_argument('--base', default=os.path.join(RACINE, 'data', 'cards.json'))
    a = ap.parse_args()
    if a.ecrire and not a.prix:
        ap.error('--ecrire demande --prix : les cartes dont le lien change reçoivent le prix de leur nouveau produit')
    with open(a.base, encoding='utf-8') as f:
        brut = f.read()
    base = json.loads(brut)
    ecrit = lambda: json.dumps(base, ensure_ascii=False, separators=(',', ':'))
    if a.ecrire and ecrit() != brut:
        sys.exit('ERREUR : la base n\'est pas écrite comme cet outil l\'écrirait (le fichier entier serait réécrit). Rien enregistré.')
    extrait, catalogue = ouvrir(a.extrait), ouvrir(a.catalogue)
    if len(extrait.get('cards') or []) < 20000 or len(catalogue.get('cartes') or []) < 10000:
        sys.exit('ERREUR : extrait de TCGdex ou catalogue Cardmarket incomplet. Rien enregistré.')
    champs = base.get('priceFields') or []
    prix, jour = lire_prix(a.prix, champs) if a.prix else ({}, None)
    manuels = {}
    chemin_manuels = os.path.join(RACINE, 'outils', 'liens_manuels.json')
    if os.path.exists(chemin_manuels):
        with open(chemin_manuels, encoding='utf-8') as f:
            manuels = json.load(f)
    cartes, produits, par_exp = charger(base, extrait, catalogue)
    connues = {c.cle for c in cartes}
    faux = [k for k, v in manuels.items() if k not in connues or (v and v not in produits)]
    if faux or len({v for v in manuels.values() if v}) != sum(1 for v in manuels.values() if v):
        sys.exit(f'ERREUR : outils/liens_manuels.json cite une carte ou un produit inconnu, ou deux fois le même produit ({faux}). Rien enregistré.')
    ctx = resoudre(cartes, produits, par_exp, extrait, manuels)
    print(f'Catalogue Cardmarket du {catalogue.get("cree")}, TCGdex {str(extrait.get("commit"))[:10]}'
          + (f', prix du {jour}' if jour else '') + '.')
    print(bilan(cartes))
    # Garde-fous : aucun produit pour deux cartes, y compris une carte asiatique
    ailleurs = {c['cm'] for k, c in enumerate(base['cards']) if c.get('cm')} - {c.cm for c in cartes if c.cm}
    pris = collections.Counter(c.nouveau for c in cartes if c.nouveau)
    doubles = [i for i, n in pris.items() if n > 1 or i in ailleurs]
    if doubles:
        print(f'ATTENTION : {len(doubles)} produits restent liés à plusieurs cartes (indiscernables) : {doubles[:20]}')
    if a.rapport:
        with open(a.rapport, 'w', encoding='utf-8') as f:
            json.dump(rapport(cartes, produits, ctx, prix, champs), f, ensure_ascii=False, indent=1)
        print('Rapport :', a.rapport)
    if prix:
        for x in a_verifier(cartes, produits, ctx, prix, champs):
            print(f'À vérifier : {x["carte"]} {x["nom"]} est lié au produit {x["lien"]} ({x["prix"]} €) alors que {x["autre"]} '
                  f'({x["prix_autre"]} €) est à sa place. Si c\'est la carte, l\'ajouter à outils/liens_manuels.json.')
    ch = changements(cartes)
    if not a.ecrire:
        print('Rien n\'est écrit (ajouter --ecrire).')
        return
    if not ch:
        print('Base déjà à jour : rien à écrire.')
        return
    liees = sum(1 for c in cartes if c.cm)
    if len(ch) > MAX_CHANGEMENTS * max(1, liees) and not a.forcer:
        sys.exit(f'ERREUR : {len(ch)} liens changeraient sur {liees}, plus de {MAX_CHANGEMENTS:.0%}. Vérifier les sources, ou --forcer. Rien enregistré.')
    appliquer(base, cartes, prix)
    with open(a.base + '.tmp', 'w', encoding='utf-8') as f:
        f.write(ecrit())
    os.replace(a.base + '.tmp', a.base)
    sans_prix = sum(1 for c in ch if c.nouveau and prix.get(c.nouveau) is None)
    print(f'{os.path.relpath(a.base, RACINE)} enregistré : {len(ch)} liens changés'
          + (f', dont {sans_prix} sans prix dans l\'archive du {jour}' if sans_prix else '') + '.')


if __name__ == '__main__':
    main()
