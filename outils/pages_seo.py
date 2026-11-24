"""Pages statiques pour le référencement (Google, Bing…).

L'appli CallIt! est une page unique en JavaScript : ses adresses (#/carte/…) ne sont pas lues par les moteurs
de recherche. Ce script fabrique, à partir de data/cards.json, de vraies pages HTML légères, en 5 langues :
  /<langue>/                         accueil (présentation de l'appli)
  /<langue>/set/                     liste des sets, puis une page par set
  /<langue>/<carte>/<set>/<n°>-<nom>.html   une page par carte (nom officiel dans cette langue uniquement)
  /<langue>/pokemon/                 une page par Pokémon (toutes ses cartes)
  /<langue>/<illustrateur>/          une page par illustrateur
et sitemap.xml (index) + sitemaps/<langue>-<n>.xml.

Les pages ne contiennent pas les prix (ils changent chaque jour : on renvoie vers l'appli pour la cote du jour),
pour que le dépôt ne grossisse pas à chaque relevé. Une page n'est réécrite que si son contenu change.
Usage : python3 outils/pages_seo.py   (lancé chaque lundi par .github/workflows/pages_seo.yml)
"""
import html, json, os, re, shutil, sys, unicodedata
from collections import Counter, defaultdict

SITE = 'https://callitcards.com'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LANGS = ['fr', 'en', 'de', 'es', 'it']
LOCALE = {'fr': 'fr_FR', 'en': 'en_GB', 'de': 'de_DE', 'es': 'es_ES', 'it': 'it_IT'}

T = {
    'fr': dict(card='carte', ill='illustrateur', sets='Sets', set='Set', number='Numéro', rarity='Rareté', illustrator='Illustration', type='Type',
               released='Sortie', pokemon='Pokémon', pokemons='Pokémon', illustrators='Illustrateurs', names='Ses noms dans les autres langues',
               open='Voir la cote du jour et l\'ajouter à ma collection', openapp='Ouvrir CallIt!', prev='Précédente', next='Suivante',
               allcards='Toutes les cartes du set', cards='cartes', card1='carte', home='Accueil', recent='Sets récents', popular='Pokémon les plus collectionnés',
               allsets='Tous les sets', allpoke='Tous les Pokémon', allill='Tous les illustrateurs', series='Série',
               t_card='{name} {num} · {set} ({year}) | CallIt!',
               d_card='{name}, carte Pokémon n° {num} du set {set} ({year}){ill}. Rareté, noms dans les autres langues et cote du jour dans ta devise avec CallIt!',
               by=', illustrée par {0}',
               t_set='{set} ({year}) : liste des {n} cartes | CallIt!', d_set='Liste complète des cartes Pokémon du set {set}, sorti en {year} : numéros, raretés, illustrateurs. Cotes du jour et suivi de collection avec CallIt!',
               t_poke='Toutes les cartes Pokémon {name} ({n}) | CallIt!', d_poke='Les {n} cartes {name} : sets, numéros, années et illustrateurs. Cote du jour et collection avec CallIt!',
               t_ill='{name} : les {n} cartes Pokémon illustrées | CallIt!', d_ill='Les {n} cartes Pokémon illustrées par {name}, set par set. Cote du jour et collection avec CallIt!',
               t_sets='Tous les sets de cartes Pokémon, du plus récent au plus ancien | CallIt!', d_sets='Les {n} sets de cartes Pokémon, avec la liste complète de leurs cartes.',
               t_pokes='Cartes Pokémon par Pokémon | CallIt!', d_pokes='Trouve toutes les cartes de ton Pokémon préféré, set par set.',
               t_ills='Illustrateurs des cartes Pokémon | CallIt!', d_ills='Les illustrateurs des cartes Pokémon et toutes leurs cartes.',
               t_home='CallIt! (Call It Cards) · collection de cartes Pokémon, Magic, Yu-Gi-Oh! et One Piece, pensée pour l\'Europe',
               d_home='Recherche tes cartes dans toutes les langues, suis leur cote du jour dans ta devise et gère ta collection et ta liste d\'envies. Gratuit, sans installation.',
               h_home='Tes cartes, leur cote, ta collection.', pitch=['Recherche parmi plus de 40 000 cartes Pokémon, en français, anglais, allemand, espagnol, italien, japonais et plus.',
               'Cote du jour (guide de prix public Cardmarket), affichée dans la devise de ton pays.', 'Collection et liste d\'envies, synchronisées si tu crées un compte.',
               'Aussi pour Magic, Yu-Gi-Oh! et One Piece.'],
               of='{0} cartes', see='Voir', legal='Pokémon et les noms des Pokémon sont des marques de Nintendo, Creatures et GAME FREAK. CallIt! est un site indépendant, non affilié à The Pokémon Company, Nintendo ni Cardmarket. Images : TCGdex.',
               legal_short='Site indépendant, non affilié à The Pokémon Company ni à Nintendo. Images : TCGdex.', privacy='Confidentialité', unknown_ill='Illustrateur inconnu', other='Autres cartes de ce Pokémon'),
    'en': dict(card='card', ill='illustrator', sets='Sets', set='Set', number='Number', rarity='Rarity', illustrator='Illustrator', type='Type',
               released='Released', pokemon='Pokémon', pokemons='Pokémon', illustrators='Illustrators', names='Its names in other languages',
               open='See today\'s price and add it to my collection', openapp='Open CallIt!', prev='Previous', next='Next',
               allcards='All cards in this set', cards='cards', card1='card', home='Home', recent='Recent sets', popular='Most collected Pokémon',
               allsets='All sets', allpoke='All Pokémon', allill='All illustrators', series='Series',
               t_card='{name} {num} · {set} ({year}) | CallIt!',
               d_card='{name}, Pokémon card no. {num} from the {set} set ({year}){ill}. Rarity, names in other languages and today\'s price in your currency with CallIt!',
               by=', illustrated by {0}',
               t_set='{set} ({year}): list of all {n} cards | CallIt!', d_set='Complete list of the Pokémon cards in the {set} set, released in {year}: numbers, rarities, illustrators. Today\'s prices and collection tracking with CallIt!',
               t_poke='All {name} Pokémon cards ({n}) | CallIt!', d_poke='All {n} {name} cards: sets, numbers, years and illustrators. Today\'s price and collection with CallIt!',
               t_ill='{name}: all {n} illustrated Pokémon cards | CallIt!', d_ill='The {n} Pokémon cards illustrated by {name}, set by set. Today\'s price and collection with CallIt!',
               t_sets='All Pokémon card sets, newest first | CallIt!', d_sets='All {n} Pokémon card sets, with the complete list of their cards.',
               t_pokes='Pokémon cards by Pokémon | CallIt!', d_pokes='Find every card of your favourite Pokémon, set by set.',
               t_ills='Pokémon card illustrators | CallIt!', d_ills='The illustrators of Pokémon cards and all their cards.',
               t_home='CallIt! (Call It Cards) · Pokémon, Magic, Yu-Gi-Oh! and One Piece card collection, made for Europe',
               d_home='Search your cards in every language, follow today\'s price in your currency, manage your collection and wishlist. Free, nothing to install.',
               h_home='Your cards, their price, your collection.', pitch=['Search more than 40,000 Pokémon cards in English, French, German, Spanish, Italian, Japanese and more.',
               'Today\'s price (Cardmarket public price guide), shown in your country\'s currency.', 'Collection and wishlist, synced if you create an account.',
               'Also for Magic, Yu-Gi-Oh! and One Piece.'],
               of='{0} cards', see='See', legal='Pokémon and Pokémon character names are trademarks of Nintendo, Creatures and GAME FREAK. CallIt! is an independent website, not affiliated with The Pokémon Company, Nintendo or Cardmarket. Images: TCGdex.',
               legal_short='Independent website, not affiliated with The Pokémon Company or Nintendo. Images: TCGdex.', privacy='Privacy', unknown_ill='Unknown illustrator', other='Other cards of this Pokémon'),
    'de': dict(card='karte', ill='illustrator', sets='Sets', set='Set', number='Nummer', rarity='Seltenheit', illustrator='Illustration', type='Typ',
               released='Erschienen', pokemon='Pokémon', pokemons='Pokémon', illustrators='Illustratoren', names='Ihre Namen in anderen Sprachen',
               open='Tagespreis ansehen und zu meiner Sammlung hinzufügen', openapp='CallIt! öffnen', prev='Vorherige', next='Nächste',
               allcards='Alle Karten des Sets', cards='Karten', card1='Karte', home='Start', recent='Neueste Sets', popular='Beliebteste Pokémon',
               allsets='Alle Sets', allpoke='Alle Pokémon', allill='Alle Illustratoren', series='Serie',
               t_card='{name} {num} · {set} ({year}) | CallIt!',
               d_card='{name}, Pokémon-Karte Nr. {num} aus dem Set {set} ({year}){ill}. Seltenheit, Namen in anderen Sprachen und Tagespreis in deiner Währung mit CallIt!',
               by=', illustriert von {0}',
               t_set='{set} ({year}): Liste aller {n} Karten | CallIt!', d_set='Vollständige Liste der Pokémon-Karten des Sets {set}, erschienen {year}: Nummern, Seltenheiten, Illustratoren. Tagespreise und Sammlung mit CallIt!',
               t_poke='Alle Pokémon-Karten {name} ({n}) | CallIt!', d_poke='Alle {n} Karten {name}: Sets, Nummern, Jahre und Illustratoren. Tagespreis und Sammlung mit CallIt!',
               t_ill='{name}: alle {n} illustrierten Pokémon-Karten | CallIt!', d_ill='Die {n} von {name} illustrierten Pokémon-Karten, Set für Set. Tagespreis und Sammlung mit CallIt!',
               t_sets='Alle Pokémon-Kartensets, neueste zuerst | CallIt!', d_sets='Alle {n} Pokémon-Kartensets mit der vollständigen Liste ihrer Karten.',
               t_pokes='Pokémon-Karten nach Pokémon | CallIt!', d_pokes='Finde alle Karten deines Lieblings-Pokémon, Set für Set.',
               t_ills='Illustratoren der Pokémon-Karten | CallIt!', d_ills='Die Illustratoren der Pokémon-Karten und alle ihre Karten.',
               t_home='CallIt! (Call It Cards) · Sammlung für Pokémon-, Magic-, Yu-Gi-Oh!- und One-Piece-Karten, gemacht für Europa',
               d_home='Suche deine Karten in allen Sprachen, verfolge den Tagespreis in deiner Währung, verwalte Sammlung und Wunschliste. Kostenlos, ohne Installation.',
               h_home='Deine Karten, ihr Preis, deine Sammlung.', pitch=['Suche unter mehr als 40.000 Pokémon-Karten, auf Deutsch, Englisch, Französisch, Spanisch, Italienisch, Japanisch und mehr.',
               'Tagespreis (öffentlicher Cardmarket-Preisführer), angezeigt in der Währung deines Landes.', 'Sammlung und Wunschliste, synchronisiert mit einem Konto.',
               'Auch für Magic, Yu-Gi-Oh! und One Piece.'],
               of='{0} Karten', see='Ansehen', legal='Pokémon und die Namen der Pokémon sind Marken von Nintendo, Creatures und GAME FREAK. CallIt! ist eine unabhängige Website, nicht verbunden mit The Pokémon Company, Nintendo oder Cardmarket. Bilder: TCGdex.',
               legal_short='Unabhängige Website, nicht verbunden mit The Pokémon Company oder Nintendo. Bilder: TCGdex.', privacy='Datenschutz', unknown_ill='Unbekannter Illustrator', other='Weitere Karten dieses Pokémon'),
    'es': dict(card='carta', ill='ilustrador', sets='Sets', set='Set', number='Número', rarity='Rareza', illustrator='Ilustración', type='Tipo',
               released='Salida', pokemon='Pokémon', pokemons='Pokémon', illustrators='Ilustradores', names='Sus nombres en otros idiomas',
               open='Ver el precio de hoy y añadirla a mi colección', openapp='Abrir CallIt!', prev='Anterior', next='Siguiente',
               allcards='Todas las cartas del set', cards='cartas', card1='carta', home='Inicio', recent='Sets recientes', popular='Pokémon más coleccionados',
               allsets='Todos los sets', allpoke='Todos los Pokémon', allill='Todos los ilustradores', series='Serie',
               t_card='{name} {num} · {set} ({year}) | CallIt!',
               d_card='{name}, carta Pokémon n.º {num} del set {set} ({year}){ill}. Rareza, nombres en otros idiomas y precio de hoy en tu moneda con CallIt!',
               by=', ilustrada por {0}',
               t_set='{set} ({year}): lista de las {n} cartas | CallIt!', d_set='Lista completa de las cartas Pokémon del set {set}, salido en {year}: números, rarezas, ilustradores. Precios de hoy y colección con CallIt!',
               t_poke='Todas las cartas Pokémon {name} ({n}) | CallIt!', d_poke='Las {n} cartas {name}: sets, números, años e ilustradores. Precio de hoy y colección con CallIt!',
               t_ill='{name}: las {n} cartas Pokémon ilustradas | CallIt!', d_ill='Las {n} cartas Pokémon ilustradas por {name}, set por set. Precio de hoy y colección con CallIt!',
               t_sets='Todos los sets de cartas Pokémon, del más reciente al más antiguo | CallIt!', d_sets='Los {n} sets de cartas Pokémon, con la lista completa de sus cartas.',
               t_pokes='Cartas Pokémon por Pokémon | CallIt!', d_pokes='Encuentra todas las cartas de tu Pokémon favorito, set por set.',
               t_ills='Ilustradores de las cartas Pokémon | CallIt!', d_ills='Los ilustradores de las cartas Pokémon y todas sus cartas.',
               t_home='CallIt! (Call It Cards) · colección de cartas Pokémon, Magic, Yu-Gi-Oh! y One Piece, pensada para Europa',
               d_home='Busca tus cartas en todos los idiomas, sigue su precio de hoy en tu moneda y gestiona tu colección y tu lista de deseos. Gratis, sin instalación.',
               h_home='Tus cartas, su precio, tu colección.', pitch=['Busca entre más de 40 000 cartas Pokémon, en español, inglés, francés, alemán, italiano, japonés y más.',
               'Precio de hoy (guía pública de precios de Cardmarket), en la moneda de tu país.', 'Colección y lista de deseos, sincronizadas si creas una cuenta.',
               'También para Magic, Yu-Gi-Oh! y One Piece.'],
               of='{0} cartas', see='Ver', legal='Pokémon y los nombres de los Pokémon son marcas de Nintendo, Creatures y GAME FREAK. CallIt! es un sitio independiente, no afiliado a The Pokémon Company, Nintendo ni Cardmarket. Imágenes: TCGdex.',
               legal_short='Sitio independiente, no afiliado a The Pokémon Company ni a Nintendo. Imágenes: TCGdex.', privacy='Privacidad', unknown_ill='Ilustrador desconocido', other='Otras cartas de este Pokémon'),
    'it': dict(card='carta', ill='illustratore', sets='Set', set='Set', number='Numero', rarity='Rarità', illustrator='Illustrazione', type='Tipo',
               released='Uscita', pokemon='Pokémon', pokemons='Pokémon', illustrators='Illustratori', names='I suoi nomi nelle altre lingue',
               open='Vedi il prezzo di oggi e aggiungila alla mia collezione', openapp='Apri CallIt!', prev='Precedente', next='Successiva',
               allcards='Tutte le carte del set', cards='carte', card1='carta', home='Home', recent='Set recenti', popular='Pokémon più collezionati',
               allsets='Tutti i set', allpoke='Tutti i Pokémon', allill='Tutti gli illustratori', series='Serie',
               t_card='{name} {num} · {set} ({year}) | CallIt!',
               d_card='{name}, carta Pokémon n. {num} del set {set} ({year}){ill}. Rarità, nomi nelle altre lingue e prezzo di oggi nella tua valuta con CallIt!',
               by=', illustrata da {0}',
               t_set='{set} ({year}): elenco delle {n} carte | CallIt!', d_set='Elenco completo delle carte Pokémon del set {set}, uscito nel {year}: numeri, rarità, illustratori. Prezzi di oggi e collezione con CallIt!',
               t_poke='Tutte le carte Pokémon {name} ({n}) | CallIt!', d_poke='Le {n} carte {name}: set, numeri, anni e illustratori. Prezzo di oggi e collezione con CallIt!',
               t_ill='{name}: le {n} carte Pokémon illustrate | CallIt!', d_ill='Le {n} carte Pokémon illustrate da {name}, set per set. Prezzo di oggi e collezione con CallIt!',
               t_sets='Tutti i set di carte Pokémon, dal più recente | CallIt!', d_sets='I {n} set di carte Pokémon, con l\'elenco completo delle loro carte.',
               t_pokes='Carte Pokémon per Pokémon | CallIt!', d_pokes='Trova tutte le carte del tuo Pokémon preferito, set per set.',
               t_ills='Illustratori delle carte Pokémon | CallIt!', d_ills='Gli illustratori delle carte Pokémon e tutte le loro carte.',
               t_home='CallIt! (Call It Cards) · collezione di carte Pokémon, Magic, Yu-Gi-Oh! e One Piece, pensata per l\'Europa',
               d_home='Cerca le tue carte in tutte le lingue, segui il loro prezzo di oggi nella tua valuta e gestisci collezione e lista dei desideri. Gratis, senza installazione.',
               h_home='Le tue carte, il loro prezzo, la tua collezione.', pitch=['Cerca tra più di 40.000 carte Pokémon, in italiano, inglese, francese, tedesco, spagnolo, giapponese e altro.',
               'Prezzo di oggi (guida prezzi pubblica di Cardmarket), nella valuta del tuo paese.', 'Collezione e lista dei desideri, sincronizzate se crei un account.',
               'Anche per Magic, Yu-Gi-Oh! e One Piece.'],
               of='{0} carte', see='Vedi', legal='Pokémon e i nomi dei Pokémon sono marchi di Nintendo, Creatures e GAME FREAK. CallIt! è un sito indipendente, non affiliato a The Pokémon Company, Nintendo o Cardmarket. Immagini: TCGdex.',
               legal_short='Sito indipendente, non affiliato a The Pokémon Company o Nintendo. Immagini: TCGdex.', privacy='Privacy', unknown_ill='Illustratore sconosciuto', other='Altre carte di questo Pokémon'),
}
TYPES = {
    'fr': ['Plante', 'Feu', 'Psy', 'Eau', 'Incolore', 'Électrique', 'Combat', 'Métal', 'Dragon', 'Obscurité', 'Fée'],
    'en': ['Grass', 'Fire', 'Psychic', 'Water', 'Colorless', 'Lightning', 'Fighting', 'Metal', 'Dragon', 'Darkness', 'Fairy'],
    'de': ['Pflanze', 'Feuer', 'Psycho', 'Wasser', 'Farblos', 'Elektro', 'Kampf', 'Metall', 'Drache', 'Finsternis', 'Fee'],
    'es': ['Planta', 'Fuego', 'Psíquico', 'Agua', 'Incoloro', 'Rayo', 'Lucha', 'Metálico', 'Dragón', 'Oscuro', 'Hada'],
    'it': ['Erba', 'Fuoco', 'Psico', 'Acqua', 'Incolore', 'Lampo', 'Lotta', 'Metallo', 'Drago', 'Oscurità', 'Folletto'],
}
LANG_NAME = {'fr': 'Français', 'en': 'English', 'de': 'Deutsch', 'es': 'Español', 'it': 'Italiano', 'pt': 'Português'}
IMG_LANGS = ['en', 'fr', 'es', 'it', 'pt', 'de']  # ordre des bits de data/images.json (sets occidentaux)

e = lambda s: html.escape(str(s), quote=True)


def slug(s):
    s = unicodedata.normalize('NFKD', str(s)).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-') or 'x'


# ---------- Données ----------
db = json.load(open(os.path.join(ROOT, 'data/cards.json'), encoding='utf-8'))
try:
    imgs = json.load(open(os.path.join(ROOT, 'data/images.json'), encoding='utf-8'))
    mask = imgs['mask'] if imgs.get('cards') == db['generated'] else None
except Exception:
    mask = None
SETS, ILLS, RARS = db['sets'], db['ills'], db['rars']
D36 = '0123456789abcdefghijklmnopqrstuvwxyz'


class Card:
    pass


cards = []
for idx, c in enumerate(db['cards']):
    s = SETS[c['s']]
    if s['reg'] != 'en':
        continue  # cartes asiatiques : pas de nom officiel dans nos 5 langues (à faire plus tard)
    k = Card()
    k.idx, k.raw, k.set, k.si, k.num = idx, c, s, c['s'], c['num']
    k.key = 'en:' + s['id'] + ':' + c['num']
    inf = set(c.get('inf', []))
    k.names = {l: v for l, v in c['n'].items() if l not in inf}      # noms officiels
    k.page_langs = [l for l in LANGS if k.names.get(l)]
    k.ill = ILLS[c['i']] if c.get('i') is not None else ''
    k.rar = RARS[c['r']] if c.get('r') is not None else ''
    k.type = c.get('t')
    k.dex = c.get('dex')
    k.numlabel = c['num'] + ('/' + str(s['count']) if s.get('count') else '')
    m = None
    if mask:
        m = D36.index(mask[idx * 2]) * 36 + D36.index(mask[idx * 2 + 1])
    k.img_ok = IMG_LANGS if m is None else [l for i, l in enumerate(IMG_LANGS) if m & (1 << i)]
    cards.append(k)

by_set = defaultdict(list)
for k in cards:
    by_set[k.si].append(k)


def numkey(k):
    m = re.match(r'([A-Za-z]*)(\d*)(.*)', k.num)
    return (m.group(1), int(m.group(2)) if m.group(2) else 0, m.group(3))


for v in by_set.values():
    v.sort(key=numkey)

# Adresse de chaque carte (unique dans son set)
for si, ks in by_set.items():
    used = set()
    for k in ks:
        base = slug(k.num)
        while base in used:
            base += '-b'
        used.add(base)
        k.file = base  # complété par le nom dans chaque langue


def set_name(s, l):
    n = s['name']
    return n.get(l) or n.get('en') or next(iter(n.values()))


def year(s):
    return (s.get('date') or '')[:4]


def card_path(k, l):
    return f"/{l}/{T[l]['card']}/{slug(k.set['id'])}/{k.file}-{slug(k.names[l])}.html"


def set_path(si, l):
    return f"/{l}/set/{slug(SETS[si]['id'])}.html"


def img_url(k, l, q='low'):
    if (k.set.get('date') or '9') < '2003-07':
        order = ['en']  # cartes anciennes : l'image anglaise est la seule bien scannée
    else:
        order = [l] + [x for x in IMG_LANGS if x != l]
    order = [x for x in order if x in k.img_ok] or ([] if mask else ['en'])
    if not order:
        return None
    return db['imageBase'].replace('{lang}', order[0]).replace('{serie}', k.set['serie']).replace('{set}', k.set['id']).replace('{num}', k.num).replace('high.webp', q + '.webp')


# Langues dans lesquelles chaque set a une page (au moins une carte au nom officiel)
set_langs = {si: [l for l in LANGS if any(l in k.page_langs for k in ks)] for si, ks in by_set.items()}

# Pokémon : nom dans chaque langue = nom le plus fréquent parmi ses cartes (souvent le nom simple)
species = {}
for k in cards:
    if k.dex:
        species.setdefault(k.dex, []).append(k)
species_name = {}
for dex, ks in species.items():
    species_name[dex] = {}
    for l in LANGS:
        if l == 'fr' and str(dex) in db['species']:
            species_name[dex][l] = db['species'][str(dex)]
            continue
        cnt = Counter(k.names[l] for k in ks if k.names.get(l))
        if cnt:
            best = max(cnt.items(), key=lambda kv: (kv[1], -len(kv[0])))[0]
            species_name[dex][l] = best


def poke_path(dex, l):
    return f"/{l}/pokemon/{dex}-{slug(species_name[dex][l])}.html"


ill_cards = defaultdict(list)
for k in cards:
    if k.ill:
        ill_cards[k.ill].append(k)


def ill_path(name, l):
    return f"/{l}/{T[l]['ill']}/{slug(name)}.html"


# ---------- Gabarit ----------
written, kept, sitemap = set(), 0, defaultdict(list)


def head_links(alts, l):
    out = [f'<link rel="canonical" href="{SITE}{alts[l]}">']
    for x in LANGS:
        if x in alts:
            out.append(f'<link rel="alternate" hreflang="{x}" href="{SITE}{alts[x]}">')
    xd = alts.get('en') or alts[next(iter(alts))]
    out.append(f'<link rel="alternate" hreflang="x-default" href="{SITE}{xd}">')
    return '\n'.join(out)


def crumbs_ld(items):
    return {'@context': 'https://schema.org', '@type': 'BreadcrumbList', 'itemListElement': [
        {'@type': 'ListItem', 'position': i + 1, 'name': n, 'item': SITE + p} for i, (n, p) in enumerate(items)]}


def page(l, alts, title, desc, body, crumbs=None, image=None, ld=None, ogtype='website', light=False):
    """light=True : pages des cartes (100 000 pages), en-tête réduit pour rester sous la limite de 1 Go de GitHub Pages."""
    t = T[l]
    lds = ([crumbs_ld(crumbs)] if crumbs and not light else []) + (ld or [])
    ldtxt = ''.join('<script type="application/ld+json">' + json.dumps(x, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/') + '</script>' for x in lds)
    nav = ''
    if crumbs:
        nav = '<nav class="bc">' + ' › '.join(f'<a href="{p}">{e(n)}</a>' if i < len(crumbs) - 1 else f'<span>{e(n)}</span>' for i, (n, p) in enumerate(crumbs)) + '</nav>'
    langsw = ' · '.join(f'<a href="{alts[x]}" hreflang="{x}" lang="{x}">{x.upper()}</a>' if x != l else f'<b>{x.upper()}</b>' for x in LANGS if x in alts)
    img = image or SITE + '/icons/icon-512.png'
    og = f'''<meta property="og:title" content="{e(title)}">
<meta property="og:image" content="{e(img)}">'''
    if not light:
        og = f'''<meta property="og:site_name" content="CallIt!">
<meta property="og:type" content="{ogtype}">
{og}
<meta property="og:description" content="{e(desc)}">
<meta property="og:url" content="{SITE}{alts[l]}">
<meta property="og:locale" content="{LOCALE[l]}">
<meta name="twitter:card" content="summary">'''
    foot = f'''<footer><p><a href="/{l}/set/">{e(t['allsets'])}</a> · <a href="/{l}/pokemon/">{e(t['allpoke'])}</a> · <a href="/{l}/{t['ill']}/">{e(t['allill'])}</a> · <a href="/confidentialite.html">{e(t['privacy'])}</a></p>
<p class="small">{e(t['legal'])}</p></footer>''' if not light else f'<footer><p class="small">{e(t["legal_short"])} <a href="/{l}/">CallIt!</a></p></footer>'
    hdr = f'<span class="lg">{langsw}</span>' if not light else ''
    return f'''<!doctype html>
<html lang="{l}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(title)}</title>
<meta name="description" content="{e(desc)}">
{head_links(alts, l)}
{og}
<link rel="icon" href="/icons/icon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/pages.css">
<script data-goatcounter="https://callit.goatcounter.com/count" async src="/vendor/goatcounter/count.js"></script>
{ldtxt}
</head>
<body>
<header><a class="logo" href="/{l}/"><img src="/icons/icon.svg" width="26" height="26" alt="">Call<span>It!</span></a>{hdr}<a class="cta" href="/">{e(t['openapp'])}</a></header>
<main>
{nav}
{body}
</main>
{foot}
</body>
</html>
'''


def write(path, content, l, sm=True):
    global kept
    full = os.path.join(ROOT, path.lstrip('/'))
    written.add(full)
    if sm:
        sitemap[l].append(SITE + path)
    try:
        if open(full, encoding='utf-8').read() == content:
            kept += 1
            return
    except FileNotFoundError:
        pass
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, 'w', encoding='utf-8') as f:
        f.write(content)


def card_li(k, l):
    """Ligne de liste : nom, n°, set, année, avec lien vers la page de la carte."""
    if l in k.page_langs:
        name, href = k.names[l], card_path(k, l)
    else:
        name = k.names.get('en') or next(iter(k.names.values()), k.num)
        href = card_path(k, 'en') if 'en' in k.page_langs else None
    a = f'<a href="{href}">{e(name)}</a>' if href else e(name)
    return f'<li><span class="n">{e(k.numlabel)}</span> {a}<span class="m">{e(set_name(k.set, l))} · {year(k.set)}{" · " + e(k.rar) if k.rar and k.rar != "None" else ""}</span></li>'


def app_link(k):
    return '/#/carte/' + k.key.replace('%', '%25').replace('?', '%3F').replace('#', '%23')


# ---------- Pages des cartes ----------
for si, ks in by_set.items():
    s = SETS[si]
    for pos, k in enumerate(ks):
        alts = {l: card_path(k, l) for l in k.page_langs}
        for l in k.page_langs:
            t = T[l]
            name, sn = k.names[l], set_name(s, l)
            title = t['t_card'].format(name=name, num=k.numlabel, set=sn, year=year(s))
            desc = t['d_card'].format(name=name, num=k.numlabel, set=sn, year=year(s), ill=t['by'].format(k.ill) if k.ill else '')
            im = img_url(k, l)
            rows = [(t['set'], f'<a href="{set_path(si, l)}">{e(sn)}</a>'), (t['number'], e(k.numlabel))]
            if k.rar and k.rar != 'None':
                rows.append((t['rarity'], e(k.rar)))
            if k.type is not None:
                rows.append((t['type'], e(TYPES[l][k.type])))
            if k.ill:
                rows.append((t['illustrator'], f'<a href="{ill_path(k.ill, l)}">{e(k.ill)}</a>'))
            if s.get('date'):
                rows.append((t['released'], e(s['date'])))
            if k.dex and l in species_name.get(k.dex, {}):
                rows.append((t['pokemon'], f'<a href="{poke_path(k.dex, l)}">{e(species_name[k.dex][l])}</a> (#{k.dex})'))
            others = [(x, k.names[x]) for x in ['fr', 'en', 'de', 'es', 'it', 'pt'] if x != l and k.names.get(x)]
            oth = ''
            if others:
                oth = f'<h2>{e(t["names"])}</h2><ul class="names">' + ''.join(
                    f'<li><span class="n">{LANG_NAME[x]}</span> ' + f'<span lang="{x}">{e(n)}</span>' + '</li>' for x, n in others) + '</ul>'
            nb = ''
            prev_k = ks[pos - 1] if pos > 0 else None
            next_k = ks[pos + 1] if pos + 1 < len(ks) else None
            for kk, lab, cls in ((prev_k, t['prev'], 'prev'), (next_k, t['next'], 'next')):
                if kk and l in kk.page_langs:
                    nb += f'<a class="{cls}" href="{card_path(kk, l)}">{e(lab)} · {e(kk.num)} {e(kk.names[l])}</a>'
            fig = f'<img src="{e(im)}" width="245" height="342" alt="{e(name)} {e(k.numlabel)} {e(sn)}" onerror="this.remove()">' if im else ''
            body = f'''<article class="card">
<div class="pic">{fig}</div>
<div class="info">
<h1>{e(name)} <span class="num">{e(k.numlabel)}</span></h1>
<p class="sub">{e(sn)} · {year(s)}</p>
<table>{''.join(f'<tr><th>{e(a)}</th><td>{b}</td></tr>' for a, b in rows)}</table>
<p><a class="cta big" href="{app_link(k)}" rel="nofollow">{e(t['open'])}</a></p>
{oth}
</div>
</article>
<nav class="pn">{nb}</nav>'''
            crumbs = [('CallIt!', f'/{l}/'), (t['sets'], f'/{l}/set/'), (sn, set_path(si, l)), (f'{name} {k.numlabel}', card_path(k, l))]
            big = img_url(k, l, 'high')
            write(card_path(k, l), page(l, alts, title, desc, body, crumbs, image=big, light=True), l)

# ---------- Pages des sets ----------
order_sets = sorted(by_set, key=lambda si: (SETS[si].get('date') or '', SETS[si]['id']), reverse=True)
for si in order_sets:
    s, ks = SETS[si], by_set[si]
    alts = {l: set_path(si, l) for l in set_langs[si]}
    for l in set_langs[si]:
        t, sn = T[l], set_name(s, l)
        n = len(ks)
        title = t['t_set'].format(set=sn, year=year(s), n=n)
        desc = t['d_set'].format(set=sn, year=year(s))
        thumbs = [k for k in ks if l in k.page_langs and img_url(k, l)][:6]
        gal = '<div class="thumbs">' + ''.join(f'<a href="{card_path(k, l)}"><img loading="lazy" src="{e(img_url(k, l))}" width="120" height="167" alt="{e(k.names[l])}" onerror="this.remove()"></a>' for k in thumbs) + '</div>'
        body = f'<h1>{e(sn)}</h1><p class="sub">{e(t["series"])} {e(s["serie"])} · {e(s.get("date") or "")} · {e(t["of"].format(n))}</p>{gal}<ul class="cards">{"".join(card_li(k, l) for k in ks)}</ul>'
        crumbs = [('CallIt!', f'/{l}/'), (t['sets'], f'/{l}/set/'), (sn, set_path(si, l))]
        write(set_path(si, l), page(l, alts, title, desc, body, crumbs), l)

# ---------- Pages des Pokémon ----------
for dex in sorted(species):
    ks = sorted(species[dex], key=lambda k: (k.set.get('date') or '', numkey(k)))
    langs = [l for l in LANGS if l in species_name[dex] and any(l in k.page_langs for k in ks)]
    alts = {l: poke_path(dex, l) for l in langs}
    for l in langs:
        t, nm = T[l], species_name[dex][l]
        title = t['t_poke'].format(name=nm, n=len(ks))
        desc = t['d_poke'].format(name=nm, n=len(ks))
        body = f'<h1>{e(nm)} <span class="num">#{dex}</span></h1><p class="sub">{e(t["of"].format(len(ks)))}</p><ul class="cards">{"".join(card_li(k, l) for k in ks)}</ul>'
        crumbs = [('CallIt!', f'/{l}/'), (t['pokemons'], f'/{l}/pokemon/'), (nm, poke_path(dex, l))]
        write(poke_path(dex, l), page(l, alts, title, desc, body, crumbs), l)

# ---------- Pages des illustrateurs ----------
ill_list = sorted(ill_cards, key=lambda n: n.lower())
for name in ill_list:
    ks = sorted(ill_cards[name], key=lambda k: (k.set.get('date') or '', numkey(k)), reverse=True)
    alts = {l: ill_path(name, l) for l in LANGS}
    for l in LANGS:
        t = T[l]
        title = t['t_ill'].format(name=name, n=len(ks))
        desc = t['d_ill'].format(name=name, n=len(ks))
        body = f'<h1>{e(name)}</h1><p class="sub">{e(t["of"].format(len(ks)))}</p><ul class="cards">{"".join(card_li(k, l) for k in ks)}</ul>'
        crumbs = [('CallIt!', f'/{l}/'), (t['illustrators'], f'/{l}/{t["ill"]}/'), (name, ill_path(name, l))]
        write(ill_path(name, l), page(l, alts, title, desc, body, crumbs), l)

# ---------- Index et accueil ----------
for l in LANGS:
    t = T[l]
    alts = {x: f'/{x}/set/' for x in LANGS}
    li = []
    for si in order_sets:
        if l in set_langs[si]:
            s = SETS[si]
            li.append(f'<li><span class="n">{e(s.get("date") or "")}</span> <a href="{set_path(si, l)}">{e(set_name(s, l))}</a><span class="m">{e(t["of"].format(len(by_set[si])))}</span></li>')
    write(f'/{l}/set/index.html', page(l, alts, t['t_sets'], t['d_sets'].format(n=len(li)), f'<h1>{e(t["allsets"])}</h1><ul class="cards">{"".join(li)}</ul>',
                                       [('CallIt!', f'/{l}/'), (t['sets'], f'/{l}/set/')]), l)
    sitemap[l][-1] = f'{SITE}/{l}/set/'

    alts = {x: f'/{x}/pokemon/' for x in LANGS}
    li = [f'<li><span class="n">#{dex}</span> <a href="{poke_path(dex, l)}">{e(species_name[dex][l])}</a><span class="m">{e(t["of"].format(len(species[dex])))}</span></li>'
          for dex in sorted(species) if l in species_name[dex] and any(l in k.page_langs for k in species[dex])]
    write(f'/{l}/pokemon/index.html', page(l, alts, t['t_pokes'], t['d_pokes'], f'<h1>{e(t["allpoke"])}</h1><ul class="cards cols">{"".join(li)}</ul>',
                                           [('CallIt!', f'/{l}/'), (t['pokemons'], f'/{l}/pokemon/')]), l)
    sitemap[l][-1] = f'{SITE}/{l}/pokemon/'

    alts = {x: f'/{x}/{T[x]["ill"]}/' for x in LANGS}
    li = [f'<li><a href="{ill_path(n, l)}">{e(n)}</a><span class="m">{e(t["of"].format(len(ill_cards[n])))}</span></li>' for n in ill_list]
    write(f'/{l}/{t["ill"]}/index.html', page(l, alts, t['t_ills'], t['d_ills'], f'<h1>{e(t["allill"])}</h1><ul class="cards cols">{"".join(li)}</ul>',
                                              [('CallIt!', f'/{l}/'), (t['illustrators'], f'/{l}/{t["ill"]}/')]), l)
    sitemap[l][-1] = f'{SITE}/{l}/{t["ill"]}/'

    alts = {x: f'/{x}/' for x in LANGS}
    recent = [si for si in order_sets if l in set_langs[si]][:12]
    pop = sorted((d for d in species if l in species_name[d]), key=lambda d: -len(species[d]))[:24]
    body = f'''<section class="hero"><h1>{e(t['h_home'])}</h1>
<ul class="pitch">{''.join(f'<li>{e(x)}</li>' for x in t['pitch'])}</ul>
<p><a class="cta big" href="/">{e(t['openapp'])}</a></p></section>
<h2>{e(t['recent'])}</h2><ul class="cards">{''.join(f'<li><span class="n">{e(SETS[si].get("date") or "")}</span> <a href="{set_path(si, l)}">{e(set_name(SETS[si], l))}</a><span class="m">{e(t["of"].format(len(by_set[si])))}</span></li>' for si in recent)}</ul>
<p><a href="/{l}/set/">{e(t['allsets'])} ›</a></p>
<h2>{e(t['popular'])}</h2><ul class="cards cols">{''.join(f'<li><a href="{poke_path(d, l)}">{e(species_name[d][l])}</a><span class="m">{e(t["of"].format(len(species[d])))}</span></li>' for d in pop)}</ul>
<p><a href="/{l}/pokemon/">{e(t['allpoke'])} ›</a></p>'''
    ld = [{'@context': 'https://schema.org', '@type': 'WebSite', 'name': 'CallIt!', 'alternateName': ['CallIt Cards', 'Call It Cards', 'callitcards.com'], 'url': SITE + '/', 'inLanguage': l},
          {'@context': 'https://schema.org', '@type': 'Organization', 'name': 'CallIt!', 'url': SITE + '/', 'logo': SITE + '/icons/icon-512.png', 'email': 'request@callitcards.com'}]
    write(f'/{l}/index.html', page(l, alts, t['t_home'], t['d_home'], body, ld=ld), l)
    sitemap[l][-1] = f'{SITE}/{l}/'

# ---------- Ménage : pages qui n'existent plus ----------
removed = 0
for l in LANGS:
    for dp, dn, fn in os.walk(os.path.join(ROOT, l)):
        for f in fn:
            p = os.path.join(dp, f)
            if f.endswith('.html') and p not in written:
                os.remove(p)
                removed += 1

# ---------- Sitemaps ----------
smdir = os.path.join(ROOT, 'sitemaps')
shutil.rmtree(smdir, ignore_errors=True)
os.makedirs(smdir)
files = []
for l in LANGS:
    urls = sorted(set(sitemap[l]), key=lambda u: (u.count('/'), u))
    for i in range(0, len(urls), 40000):
        name = f'{l}-{i // 40000 + 1}.xml'
        with open(os.path.join(smdir, name), 'w', encoding='utf-8') as f:
            f.write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n')
            f.write(''.join(f'<url><loc>{e(u)}</loc></url>\n' for u in urls[i:i + 40000]))
            f.write('</urlset>\n')
        files.append(name)
with open(os.path.join(ROOT, 'sitemap.xml'), 'w', encoding='utf-8') as f:
    f.write('<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n')
    f.write(f'<sitemap><loc>{SITE}/sitemaps/racine.xml</loc></sitemap>\n')
    f.write(''.join(f'<sitemap><loc>{SITE}/sitemaps/{n}</loc></sitemap>\n' for n in files))
    f.write('</sitemapindex>\n')
with open(os.path.join(smdir, 'racine.xml'), 'w', encoding='utf-8') as f:
    f.write(f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<url><loc>{SITE}/</loc></url>\n<url><loc>{SITE}/confidentialite.html</loc></url>\n</urlset>\n')

total = sum(len(v) for v in sitemap.values())
print(f'pages : {total} · inchangées : {kept} · supprimées : {removed}', {l: len(v) for l, v in sitemap.items()})
