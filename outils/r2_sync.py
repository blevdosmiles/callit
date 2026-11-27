#!/usr/bin/env python3
"""Envoie dans R2 (stockage Cloudflare) les pages des langues et les images du site.

Pourquoi : un site Cloudflare accepte 100 000 fichiers au plus ; nos pages de cartes
(fr, en, de, es, it) et nos images (img/) dépassent ce nombre. Le Worker
(cloudflare/worker.js) les lit donc dans R2.

Fonctionnement :
- R2 garde dans « .deploye » le numéro du dernier commit envoyé ;
- on n'envoie que les fichiers changés depuis ce commit (git diff), et on efface
  ceux qui ont été supprimés ;
- la première fois (ou si ce commit n'existe plus), on envoie tout.

Variables attendues : R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
R2_BUCKET (par défaut callit-site). Option --tout pour tout renvoyer.
"""
import mimetypes, os, subprocess, sys
from concurrent.futures import ThreadPoolExecutor

import boto3
from botocore.config import Config

DOSSIERS = ('img', 'fr', 'en', 'de', 'es', 'it')
MARQUEUR = '.deploye'
TYPES = {'.html': 'text/html; charset=utf-8', '.webp': 'image/webp', '.xml': 'application/xml; charset=utf-8',
         '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8'}


def git(*args):
    return subprocess.run(['git', *args], check=True, capture_output=True, text=True).stdout


def tous_les_fichiers():
    return [l for l in git('ls-files', '-z', '--', *DOSSIERS).split('\0') if l]


def main():
    bucket = os.environ.get('R2_BUCKET', 'callit-site')
    s3 = boto3.client(
        's3', endpoint_url=f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ['R2_ACCESS_KEY_ID'],
        aws_secret_access_key=os.environ['R2_SECRET_ACCESS_KEY'],
        region_name='auto', config=Config(retries={'max_attempts': 8, 'mode': 'adaptive'},
                                          max_pool_connections=32))
    tete = git('rev-parse', 'HEAD').strip()

    avant = None
    if '--tout' not in sys.argv:
        try:
            avant = s3.get_object(Bucket=bucket, Key=MARQUEUR)['Body'].read().decode().strip()
            git('cat-file', '-e', avant + '^{commit}')
        except Exception:
            avant = None

    a_envoyer, a_effacer = [], []
    if avant is None:
        print('Envoi complet (les fichiers déjà présents avec la même taille sont sautés)')
        deja = {}
        for page in s3.get_paginator('list_objects_v2').paginate(Bucket=bucket):
            for o in page.get('Contents', []):
                deja[o['Key']] = o['Size']
        a_envoyer = [f for f in tous_les_fichiers() if deja.get(f) != os.path.getsize(f)]
        print(f'  {len(deja)} déjà présents, {len(a_envoyer)} à envoyer')
    elif avant == tete:
        print('Déjà à jour')
        return
    else:
        morceaux = [m for m in git('diff', '--name-status', '--no-renames', '-z', avant, tete, '--', *DOSSIERS).split('\0') if m]
        for etat, chemin in zip(morceaux[0::2], morceaux[1::2]):
            (a_effacer if etat == 'D' else a_envoyer).append(chemin)

    def envoyer(chemin):
        ext = os.path.splitext(chemin)[1].lower()
        ctype = TYPES.get(ext) or mimetypes.guess_type(chemin)[0] or 'application/octet-stream'
        s3.upload_file(chemin, bucket, chemin, ExtraArgs={'ContentType': ctype})

    with ThreadPoolExecutor(32) as pool:
        for i, _ in enumerate(pool.map(envoyer, a_envoyer), 1):
            if i % 5000 == 0:
                print(f'  {i}/{len(a_envoyer)}', flush=True)
    for i in range(0, len(a_effacer), 1000):
        lot = a_effacer[i:i + 1000]
        s3.delete_objects(Bucket=bucket, Delete={'Objects': [{'Key': k} for k in lot], 'Quiet': True})
    s3.put_object(Bucket=bucket, Key=MARQUEUR, Body=tete.encode())
    print(f'{len(a_envoyer)} fichiers envoyés, {len(a_effacer)} effacés, commit {tete[:9]}')


if __name__ == '__main__':
    main()
