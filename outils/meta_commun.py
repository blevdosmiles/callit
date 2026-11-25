"""Outils communs aux scripts « decks du moment » (visage Joueur) des autres jeux.

Chaque script écrit data/meta/<jeu>.json au même format que data/meta/pkm.json :
  {generated, source, sourceUrl, online, format, from, to, tournaments, players, matches,
   decks: [{id, name, n, share, top8, best: {placing, players, tournament, date},
            list: [[nb, nom, code set, numéro, clé CallIt! ou null, partie]], rec: [v, d, n], mu: {...}}]}
La partie dépend du jeu : l (Leader), c (Personnages), v (Événements), s (Lieux) pour One Piece ;
m (deck principal), x (Extra Deck), r (réserve / Side Deck) pour Magic et Yu-Gi-Oh!.
Le prix de chaque deck est calculé dans l'appli avec les cotes du jour.
"""
import json, os, re, time, datetime, urllib.request

UA = {'User-Agent': 'CallIt-meta (callitcards.com)'}


def get(url, headers=None, body=None):
    """Lit une adresse JSON (avec 3 essais et une pause en cas de limite de débit)."""
    h = dict(UA, **(headers or {}))
    data = None
    if body is not None:
        data = json.dumps(body).encode(); h['Content-Type'] = 'application/json'
    for i in range(3):
        try:
            r = urllib.request.urlopen(urllib.request.Request(url, data=data, headers=h), timeout=90)
            rem = r.headers.get('X-RateLimit-Remaining')
            out = json.load(r)
            if rem is not None and rem.isdigit() and int(rem) < 5: time.sleep(20)
            return out
        except Exception as e:
            print('  erreur', url, e); time.sleep(65 if '429' in str(e) else 5 * (i + 1))
    return None


def load_game(game):
    return json.load(open(f'data/jeux/{game}.json', encoding='utf-8'))


def _price(c):
    p = c.get('p') or []
    v = (p[1] if len(p) > 1 and p[1] else None) or (p[0] if p else None)
    return v if isinstance(v, (int, float)) and v > 0 else None


def name_index(game, d):
    """Nom anglais (en minuscules) → clé CallIt! de l'impression la moins chère qui a une cote (sinon une image)."""
    best = {}
    for c in d['cards']:
        nm = (c['n'].get('en') or '').strip().lower()
        if not nm: continue
        key = game + ':' + d['sets'][c['s']]['id'] + ':' + c['num']
        p = _price(c)
        score = (0 if p else 1, p or 0, 0 if c.get('im') else 1)
        names = {nm}
        if ' // ' in nm: names.add(nm.split(' // ')[0])   # Magic : carte à deux faces
        for n in names:
            if n not in best or score < best[n][0]: best[n] = (score, key)
    return {n: v[1] for n, v in best.items()}


def norm_name(s):
    s = str(s or '').strip().lower().replace('’', "'")
    return re.sub(r'\s+', ' ', s)


def write(game, payload, decks):
    os.makedirs('data/meta', exist_ok=True)
    payload = dict(payload, generated=datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%MZ'), decks=decks)
    json.dump(payload, open(f'data/meta/{game}.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print('decks :', len(decks), '· joueurs :', payload.get('players'))
    for e in decks[:10]:
        miss = sum(1 for x in e['list'] or [] if not x[4])
        print(f"  {e['name']} · {e['n']} joueurs · top 8 : {e['top8']} · bilan {e.get('rec')} · non reliées : {miss}/{len(e['list'] or [])}")
