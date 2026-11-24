"""Miniatures des cartes Yu-Gi-Oh! et One Piece, hébergées avec l'appli.

YGOPRODeck demande d'héberger les images soi-même (pas de lien direct).
On télécharge chaque image UNE seule fois (les fichiers déjà présents
sont gardés), lentement, puis on la réduit (WebP, 220 px de large).

Usage : python3 outils/jeux_images.py data/jeux/ygo.json img/ygo 'https://images.ygoprodeck.com/images/cards/{im}.jpg' 0.07
"""
import json, sys, os, time, io, urllib.request
from PIL import Image

db, out, url, delay = sys.argv[1], sys.argv[2], sys.argv[3], float(sys.argv[4])
os.makedirs(out, exist_ok=True)
ims = sorted({str(c['im']) for c in json.load(open(db, encoding='utf-8'))['cards'] if c.get('im')})
have = {f[:-5] for f in os.listdir(out) if f.endswith('.webp')}
todo = [i for i in ims if i not in have]
print(len(ims), 'images,', len(todo), 'à télécharger')
ok = bad = 0
t0 = time.time()
for i in todo:
    if time.time() - t0 > 45 * 60: print('temps écoulé, suite au prochain passage'); break
    try:
        req = urllib.request.Request(url.replace('{im}', i), headers={'User-Agent': 'CallIt/1.0 (appli de collection)'})
        data = urllib.request.urlopen(req, timeout=30).read()
        im = Image.open(io.BytesIO(data)).convert('RGB')
        w = 220; im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
        im.save(os.path.join(out, i + '.webp'), 'WEBP', quality=72, method=6)
        ok += 1
    except Exception as e:
        bad += 1
    time.sleep(delay)
print(ok, 'téléchargées,', bad, 'en échec')
