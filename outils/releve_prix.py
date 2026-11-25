"""Relevé quotidien des prix.

Chaque jour, GitHub télécharge le guide de prix public de Cardmarket (fichier mis à disposition
par Cardmarket pour le téléchargement) et lance ce script, qui :

  1. vérifie le guide : complet, daté, cohérent avec le relevé précédent ;
  2. écrit les prix du jour lus par l'appli :
       data/prix.json       les cartes de data/cards.json
       data/prix_plus.json  les cartes de data/cm_extra.json et les produits scellés de data/sealed.json
  3. ajoute la cote « tendance » du jour à l'historique des cartes et des scellés (historique/NN.json) ;
  4. prépare l'archive complète du jour (tous les produits du guide, toutes les mesures). Elle est rangée
     hors du site, dans les « releases » GitHub du dépôt (prix-AAAA-MM), par .github/workflows/prix.yml.

Si une vérification échoue, rien n'est écrit et le script s'arrête en erreur : la tâche GitHub passe au rouge.
Le script indique aussi à la tâche (GITHUB_OUTPUT) le jour relevé, s'il y a du nouveau, et le retard du guide en jours.

Prix du jour : {"jour": "AAAA-MM-JJ", "guide": date du guide, "produits": lignes du guide,
                "champs": [...], "ids": [numéros Cardmarket triés], "v": {champ: [centimes ou null, ...]}}
  Les colonnes de "v" sont alignées sur "ids". 0 = Cardmarket n'a pas de valeur, null = champ absent.

Historique : historique/NN.json, où NN = numéro Cardmarket modulo 100 (la fiche d'une carte ne télécharge
qu'un petit fichier). {"start": "AAAA-MM-JJ", "p": {"<id>": [centimes du jour 0, du jour 1, ...]}}
Une case vaut null quand il n'y avait pas de cote ce jour-là (ou pas de relevé).

Usage : python3 outils/releve_prix.py guide.json [--essai] [--forcer] [--archive DOSSIER] [--maintenant DATE]
  --essai       vérifie et affiche le bilan, sans rien écrire
  --forcer      écrit même si une vérification de cohérence échoue (après contrôle par une personne)
  --archive     dossier où déposer releve-AAAA-MM-JJ.json.gz
  --maintenant  « maintenant » imposé, par exemple 2026-11-26T08:00:00+0000 (essais, reprise d'anciens guides)
"""
import argparse, datetime, gzip, io, json, os, statistics, sys

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Champ lu par l'appli → nom dans le guide Cardmarket (même ordre que priceFields de data/cards.json)
CHAMPS = [('low', 'low'), ('trend', 'trend'), ('avg30', 'avg30'), ('trendHolo', 'trend-holo'), ('avg1', 'avg1'), ('avg7', 'avg7')]
MIN_LIGNES = 10000        # un guide plus court est forcément tronqué
MIN_COUVERTURE = 0.95     # part des produits cotés hier qui doivent l'être encore aujourd'hui
MAX_GRANDS_ECARTS = 0.03  # part maximale des cartes à 1 € et plus dont la cote a doublé ou été divisée par deux
MEDIANE = (0.95, 1.05)    # la variation médiane d'un jour à l'autre reste autour de 1
JOURS_RETARD = 2          # à partir de là, la tâche GitHub signale que le guide n'est plus publié (voir prix.yml)


def lire(chemin, defaut=None):
    try:
        with open(chemin, encoding='utf-8') as f:
            return json.load(f)
    except (OSError, ValueError):
        return defaut


def ecrire(chemin, objet):
    """Écriture en deux temps : un fichier n'est jamais laissé à moitié écrit."""
    tmp = chemin + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(objet, f, separators=(',', ':'))
    os.replace(tmp, chemin)


def centimes(v):
    return None if not isinstance(v, (int, float)) or isinstance(v, bool) else int(round(v * 100))


def cote(ligne):
    """Cote suivie dans l'historique : la tendance, sinon le prix le plus bas."""
    for cle in ('trend', 'low'):
        v = ligne.get(cle)
        if isinstance(v, (int, float)) and v > 0:
            return int(round(v * 100))
    return None


def instantane(ids, guide_par_id, jour, cree, nb_lignes):
    ids = sorted(i for i in ids if i in guide_par_id)
    return {'jour': jour, 'guide': cree, 'produits': nb_lignes, 'champs': [c for c, _ in CHAMPS], 'ids': ids,
            'v': {c: [centimes(guide_par_id[i].get(src)) for i in ids] for c, src in CHAMPS}}


def cotes_de(inst):
    """{id: cote en centimes} d'un fichier de prix du jour (tendance, sinon prix bas)."""
    if not inst or not isinstance(inst.get('ids'), list):
        return {}
    v = inst.get('v') or {}
    tr, lo = v.get('trend') or [], v.get('low') or []
    out = {}
    for k, i in enumerate(inst['ids']):
        x = tr[k] if k < len(tr) and tr[k] else (lo[k] if k < len(lo) and lo[k] else None)
        if x:
            out[i] = x
    return out


def sortie_github(**valeurs):
    chemin = os.environ.get('GITHUB_OUTPUT')
    if chemin:
        with open(chemin, 'a', encoding='utf-8') as f:
            for k, v in valeurs.items():
                f.write(f'{k}={v}\n')


def resume(texte):
    print(texte)
    chemin = os.environ.get('GITHUB_STEP_SUMMARY')
    if chemin:
        with open(chemin, 'a', encoding='utf-8') as f:
            f.write(texte + '\n\n')


def archiver(dossier, guide, par_id, cles, cree, jour):
    """Archive complète du jour : tous les produits du guide, toutes ses mesures, dans un fichier compressé."""
    os.makedirs(dossier, exist_ok=True)
    champs = sorted(k for k in cles if k != 'idProduct')
    contenu = {'guide': cree, 'version': guide.get('version'), 'champs': champs,
               'lignes': [[i] + [par_id[i].get(k) for k in champs] for i in sorted(par_id)]}
    brut = json.dumps(contenu, separators=(',', ':')).encode('utf-8')
    tampon = io.BytesIO()
    with gzip.GzipFile(fileobj=tampon, mode='wb', compresslevel=9, mtime=0) as z:  # mtime=0 : même guide, même fichier
        z.write(brut)
    with open(os.path.join(dossier, f'releve-{jour}.json.gz'), 'wb') as f:
        f.write(tampon.getvalue())
    print(f'Archive : releve-{jour}.json.gz, {len(tampon.getvalue()) // 1024} Ko ({len(par_id)} produits, {len(champs)} mesures)')


def main():
    ap = argparse.ArgumentParser(description='Relevé quotidien des prix')
    ap.add_argument('guide')
    ap.add_argument('--essai', action='store_true')
    ap.add_argument('--forcer', action='store_true')
    ap.add_argument('--archive')
    ap.add_argument('--maintenant', help='date et heure à considérer comme « maintenant » (essais, reprise d\'anciens guides)')
    a = ap.parse_args()
    guide_chemin = os.path.abspath(a.guide)
    archive_dir = os.path.abspath(a.archive) if a.archive else None
    os.chdir(RACINE)

    # ---------- 1. Le guide ----------
    try:
        with open(guide_chemin, encoding='utf-8') as f:
            guide = json.load(f)
    except (OSError, ValueError) as e:
        sys.exit(f'ERREUR : guide illisible ({e}). Rien enregistré.')
    lignes = guide.get('priceGuides') if isinstance(guide, dict) else None
    if not isinstance(lignes, list) or len(lignes) < MIN_LIGNES:
        sys.exit(f'ERREUR : guide vide ou tronqué ({len(lignes) if isinstance(lignes, list) else 0} lignes). Rien enregistré.')
    cree = guide.get('createdAt') or ''
    try:
        quand = datetime.datetime.strptime(cree, '%Y-%m-%dT%H:%M:%S%z')
    except ValueError:
        sys.exit(f'ERREUR : date du guide illisible ({cree!r}). Rien enregistré.')
    jour = cree[:10]
    maintenant = datetime.datetime.strptime(a.maintenant, '%Y-%m-%dT%H:%M:%S%z') if a.maintenant else datetime.datetime.now(datetime.timezone.utc)
    if quand > maintenant + datetime.timedelta(hours=6):
        sys.exit(f'ERREUR : le guide est daté du futur ({cree}). Rien enregistré.')
    retard = (maintenant.date() - datetime.date.fromisoformat(jour)).days
    par_id = {r['idProduct']: r for r in lignes if isinstance(r, dict) and isinstance(r.get('idProduct'), int)}
    cles = set()
    for r in par_id.values():
        cles.update(r)
    manquants = [src for _, src in CHAMPS if src not in cles]
    print(f'Guide du {cree} : {len(lignes)} produits, champs {sorted(cles)}')
    if manquants:
        sys.exit(f'ERREUR : le guide n\'a plus les champs {manquants}. Rien enregistré.')

    # ---------- 2. Ce qu'on suit ----------
    base = lire('data/cards.json') or {}
    cartes = base.get('cards') or []
    ids_base = {c['cm'] for c in cartes if c.get('cm')}
    if len(ids_base) < 1000:
        sys.exit('ERREUR : data/cards.json illisible ou vide. Rien enregistré.')
    ids_scelles = {x[0] for x in (lire('data/sealed.json') or {}).get('items', [])}
    ids_extra = {x[0] for x in (lire('data/cm_extra.json') or {}).get('items', [])}
    ids_plus = (ids_scelles | ids_extra) - ids_base

    # ---------- 3. Déjà fait ? ----------
    avant = lire('data/prix.json')
    avant_plus = lire('data/prix_plus.json')
    info = lire('historique/info.json') or {}
    if avant and avant.get('guide') == cree and avant_plus and avant_plus.get('guide') == cree and info.get('last') == jour and not a.forcer:
        if archive_dir and not a.essai:  # si l'archive n'a pas pu être rangée au passage précédent, la tâche la range maintenant
            archiver(archive_dir, guide, par_id, cles, cree, jour)
        sortie_github(nouveau='non', jour=jour, retard=retard)
        resume(f'Relevé du {jour} déjà enregistré : rien à faire.')
        if retard >= JOURS_RETARD:
            resume(f'ATTENTION : Cardmarket n\'a pas publié de nouveau guide depuis {retard} jours (dernier : {cree}).')
        return
    if avant and avant.get('guide', '') > cree and not a.forcer:
        sys.exit(f'ERREUR : ce guide ({cree}) est plus ancien que le dernier relevé ({avant.get("guide")}). Rien enregistré.')

    # ---------- 4. Cohérence avec le relevé précédent ----------
    prix = instantane(ids_base, par_id, jour, cree, len(lignes))
    plus = instantane(ids_plus, par_id, jour, cree, len(lignes))
    auj = cotes_de(prix)
    if avant:
        hier, ref = cotes_de(avant), f'au relevé du {avant.get("jour")}'
    else:  # tout premier relevé : on compare à la base
        hier, ref = {}, 'à la base de cartes'
        for c in cartes:
            p = c.get('p')
            if c.get('cm') and p:
                x = p[1] if p[1] else p[0]
                if x:
                    hier[c['cm']] = int(round(x * 100))
    soucis = []
    if avant and avant.get('produits') and len(lignes) < 0.9 * avant['produits']:
        soucis.append(f'le guide a {len(lignes)} produits contre {avant["produits"]} {ref}')
    communs = [i for i in hier if i in auj]
    couverture = len(communs) / len(hier) if hier else 1
    if couverture < MIN_COUVERTURE:
        soucis.append(f'seulement {couverture:.1%} des produits cotés {ref} le sont encore')
    rapports = [auj[i] / hier[i] for i in communs if hier[i] >= 100]
    mediane = statistics.median(rapports) if rapports else 1
    grands = sum(1 for r in rapports if r < 0.5 or r > 2) / len(rapports) if rapports else 0
    if not MEDIANE[0] <= mediane <= MEDIANE[1]:
        soucis.append(f'la variation médiane des cotes est de {mediane:.3f} (attendu : proche de 1)')
    if grands > MAX_GRANDS_ECARTS:
        soucis.append(f'{grands:.1%} des cartes à 1 € et plus ont doublé ou perdu la moitié de leur cote')
    changes = sum(1 for i in communs if auj[i] != hier[i])
    bilan = (f'Relevé du {jour} (guide du {cree}) : {len(auj)} cartes cotées sur {len(ids_base)} suivies, '
             f'{len(cotes_de(plus))} autres produits cotés sur {len(ids_plus)}. '
             f'Par rapport {ref} : {couverture:.2%} des cotes retrouvées, {changes} cotes changées, '
             f'variation médiane {mediane:.3f}, grands écarts {grands:.2%}.')
    if soucis:
        print(bilan)
        msg = 'Vérification en échec : ' + ' ; '.join(soucis) + '.'
        if not a.forcer:
            sys.exit('ERREUR : ' + msg + ' Rien enregistré.')
        print('ATTENTION (forcé) :', msg)

    # ---------- 5. Historique (préparé en entier avant d'écrire quoi que ce soit) ----------
    ids_histo = ids_base | ids_scelles
    du_jour = {}
    for i in ids_histo:
        if i in par_id:
            du_jour.setdefault(i % 100, {})[i] = cote(par_id[i])
    fichiers, debut = {}, None
    for n in range(100):
        chemin = f'historique/{n:02d}.json'
        h = lire(chemin) or {'start': jour, 'p': {}}
        k = (datetime.date.fromisoformat(jour) - datetime.date.fromisoformat(h['start'])).days
        if k < 0:
            sys.exit(f'ERREUR : le guide du {jour} est antérieur au début de l\'historique ({h["start"]}). Rien enregistré.')
        vals = du_jour.get(n, {})
        for i in set(h['p']) | {str(x) for x in vals}:
            s = h['p'].setdefault(i, [])
            s.extend([None] * (k + 1 - len(s)))  # jours sans relevé = null
            s[k] = vals.get(int(i))
        fichiers[chemin] = h
        debut = h['start'] if debut is None else min(debut, h['start'])

    # ---------- 6. Écriture ----------
    if a.essai:
        resume('ESSAI, rien n\'est écrit. ' + bilan)
        t1, t2 = len(json.dumps(prix, separators=(',', ':'))), len(json.dumps(plus, separators=(',', ':')))
        print(f'data/prix.json ferait {t1 // 1024} Ko ({len(prix["ids"])} produits), data/prix_plus.json {t2 // 1024} Ko ({len(plus["ids"])} produits)')
        print('Exemple de ligne du guide :', json.dumps(lignes[0]))
        sortie_github(nouveau='non', jour=jour, retard=retard)
        return
    if archive_dir:
        archiver(archive_dir, guide, par_id, cles, cree, jour)
    os.makedirs('historique', exist_ok=True)
    for chemin, h in fichiers.items():
        ecrire(chemin, h)
    ecrire('historique/info.json', {'start': debut, 'last': jour})
    ecrire('data/prix_plus.json', plus)
    ecrire('data/prix.json', prix)  # en dernier : c'est lui qui dit que le relevé du jour est complet
    sortie_github(nouveau='oui', jour=jour, retard=retard)
    resume(bilan)
    if retard >= JOURS_RETARD:
        resume(f'ATTENTION : le dernier guide de Cardmarket date de {retard} jours ({cree}).')


if __name__ == '__main__':
    main()
