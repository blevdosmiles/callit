"""Construit les dictionnaires de traduction i18n/<langue>.json à partir des tableaux i18n/textes-*.tsv.

Chaque ligne des tableaux : texte français (clé) puis sa traduction en, de, es, it, séparés par des tabulations.
Dans les clés, {#} remplace un nombre (il est remis à sa place à l'affichage) et {0}, {1}… sont les morceaux
variables des phrases construites avec F() dans app.js.
Usage : python3 outils/i18n_build.py
"""
import csv, glob, json, sys

LANGS = ['en', 'de', 'es', 'it']
out = {lg: {} for lg in LANGS}
problems = 0
for path in sorted(glob.glob('i18n/textes-*.tsv')):
    with open(path, encoding='utf-8') as f:
        rows = list(csv.reader(f, delimiter='\t', quoting=csv.QUOTE_NONE))
    for n, row in enumerate(rows[1:], 2):
        if not row or not row[0].strip():
            continue
        if len(row) != 5:
            print(f'{path}:{n} : {len(row)} colonnes au lieu de 5'); problems += 1; continue
        key = row[0].strip()
        for lg, val in zip(LANGS, row[1:]):
            val = val.strip()
            if key.count('{0}') and '{0}' not in val:
                print(f'{path}:{n} : {lg} oublie {{0}}'); problems += 1
            out[lg][key] = val
for lg in LANGS:
    json.dump(out[lg], open(f'i18n/{lg}.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=0, sort_keys=True)
print('textes :', len(out['en']), '· problèmes :', problems)
sys.exit(1 if problems else 0)
