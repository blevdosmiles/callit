"""Erreurs d'impression et variantes connues des cartes Pokémon (Wizards 1999-2003, puis jusqu'à aujourd'hui).

Source : outils/erreurs-vintage.json (liste lue sur Bulbapedia « Error cards » et Poképédia « Carte avec erreur »,
gardée aussi dans les fichiers du projet, donnees/erreurs-impression/). Ce script la relie aux cartes de
data/cards.json (même set, même nom anglais, ou numéros « 1 à 16/64 ») et écrit data/erreurs.json :
  e      : les erreurs [sorte, tirage, langue, texte]
  cartes : clé de carte → numéros des erreurs qui la concernent
Usage : python3 outils/erreurs_vintage.py
"""
import json, re, sys

SETS = {"Set de Base": "base1", "Jungle": "base2", "Fossile": "base3", "Base Set 2": "base4", "Team Rocket": "base5",
        "Gym Heroes": "gym1", "Gym Challenge": "gym2", "Neo Genesis": "neo1", "Neo Discovery": "neo2",
        "Neo Revelation": "neo3", "Neo Destiny": "neo4", "Promo Wizards": "basep"}
norm = lambda s: re.sub(r'[^a-z0-9]', '', s.lower().replace('♂', 'm').replace('♀', 'f'))

src = json.load(open('outils/erreurs-vintage.json', encoding='utf-8'))
src['erreurs'] += json.load(open('outils/erreurs-moderne.json', encoding='utf-8'))['erreurs']   # après Wizards (set_id donné)
db = json.load(open('data/cards.json', encoding='utf-8'))
ids = set(SETS.values()) | {x.get('set_id') for x in src['erreurs'] if x.get('set_id')}
sets = {i: s for i, s in enumerate(db['sets']) if s['reg'] == 'en' and s['id'] in ids}
par_nom, par_num = {}, {}
for c in db['cards']:
    s = sets.get(c['s'])
    if not s: continue
    key = f"en:{s['id']}:{c['num']}"
    par_nom.setdefault((s['id'], norm(c['n'].get('en', ''))), []).append(key)
    par_num[(s['id'], c['num'])] = key

out, cartes, sans = [], {}, []
for x in src['erreurs']:
    sid = x['set_id'] if 'set_id' in x else SETS.get(x['set'])
    keys = []
    if not sid: continue                     # hors set ou set absent de la base (japonais…)
    if x['carte'].startswith('('):          # tout un groupe de cartes : seulement si une plage de numéros est donnée
        m = re.match(r'(\d+) à (\d+)', x['numero'] or '')
        if m: keys = [par_num[(sid, str(n))] for n in range(int(m[1]), int(m[2]) + 1) if (sid, str(n)) in par_num]
    elif re.fullmatch(r'\d+(/\d+)?', x['numero'] or '') and 'set_id' in x:   # numéro exact (cartes après Wizards)
        k = par_num.get((sid, x['numero'].split('/')[0])); keys = [k] if k else []
    else:
        keys = par_nom.get((sid, norm(x['carte'].split(' (')[0])), [])
    if not keys:
        if not x['carte'].startswith('('): sans.append(x['set'] + ' · ' + x['carte'])
        continue
    out.append([x['type'], x['tirage'], x['langue'], x['description']])
    for k in keys: cartes.setdefault(k, []).append(len(out) - 1)

# Yu-Gi-Oh! et One Piece : reliés par le code imprimé (« LOB-030 » ou « MRD-F125 » → toutes les impressions LOB-EN030… ;
# « OP13-119 » → OP13-119 et ses versions « p1 »). Les entrées sans code précis restent dans la liste du projet seulement.
def code(n):
    m = re.match(r'([A-Z0-9]+)-[A-Z]{0,2}(\d{2,3})\b', n.split(' ')[0].upper())
    return (m[1], int(m[2])) if m else None
sans_autres = 0
for g, fic in (('ygo', 'erreurs-yugioh.json'), ('op', 'erreurs-onepiece.json')):
    d = json.load(open(f'data/jeux/{g}.json', encoding='utf-8'))
    par_code = {}   # code → {set : clés} ; une réédition (ex. LOB 25e anniversaire, 2023) n'a pas l'erreur de 2002
    for c in d['cards']:
        k = code(c['num'])
        if k: par_code.setdefault(k, {}).setdefault(c['s'], []).append(f"{g}:{d['sets'][c['s']]['id']}:{c['num']}")
    def choix(par_set, nom):
        meme = [i for i in par_set if norm(d['sets'][i]['name']['en']) == norm(nom.split(' (')[0])]
        i = meme[0] if meme else min(par_set, key=lambda i: d['sets'][i]['date'] or '9999')   # sinon : le premier sorti
        return par_set[i]
    for x in json.load(open(f'outils/{fic}', encoding='utf-8'))['erreurs']:
        k = code(x.get('numero') or '')
        keys = choix(par_code[k], x['set']) if k in par_code else []
        if not keys: sans_autres += 1; continue
        out.append([x['type'], x['tirage'], x['langue'], x['description']])
        for kk in keys: cartes.setdefault(kk, []).append(len(out) - 1)
# Magic : set donné par code_set (Scryfall), carte par nom anglais (sinon par numéro). Une entrée « Alpha, Beta et
# Unlimited » peut avoir code_set « lea,leb,2ed » : elle va alors sur chacun de ces sets.
d = json.load(open('data/jeux/mtg.json', encoding='utf-8'))
mt_nom, mt_num = {}, {}
mt_date = {x['id']: x['date'] or '' for x in d['sets']}
for c in d['cards']:
    sid = d['sets'][c['s']]['id']; k = f"mtg:{sid}:{c['num']}"
    mt_nom.setdefault((sid, norm(c['n'].get('en', ''))), []).append(k); mt_num[(sid, c['num'])] = k
for x in json.load(open('outils/erreurs-magic.json', encoding='utf-8'))['erreurs']:
    keys = []
    for sid in re.split(r'[ ,/]+', (x.get('code_set') or '').lower()):
        if not sid: continue
        kk = mt_nom.get((sid, norm(x['carte'].split(' (')[0].split(' / ')[0])), [])
        if not kk and mt_date.get(sid, '') >= '1998':   # avant 1998 : pas de numéro imprimé, le nom seul fait foi
            m = re.search(r'\d+', x.get('numero') or '')
            kk = [mt_num[(sid, m[0])]] if m and (sid, m[0]) in mt_num else []
        keys += kk
    if not keys: sans_autres += 1; continue
    out.append([x['type'], x['tirage'], x['langue'], x['description']])
    for kk in keys: cartes.setdefault(kk, []).append(len(out) - 1)
print('Yu-Gi-Oh!, One Piece et Magic :', sans_autres, 'entrées sans code reconnu (gardées dans la liste du projet)')

json.dump({'lu_le': src['lu_le'], 'e': out, 'cartes': cartes}, open('data/erreurs.json', 'w', encoding='utf-8'),
          ensure_ascii=False, separators=(',', ':'))
print(len(out), 'erreurs reliées à', len(cartes), 'cartes')
if sans: print('Sans carte trouvée :', *sans, sep='\n  '); sys.exit(1)
