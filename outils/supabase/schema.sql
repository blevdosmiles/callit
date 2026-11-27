-- CallIt! : tables des comptes (à coller dans Supabase → SQL Editor → Run)
-- Chaque utilisateur ne voit et ne modifie que ses propres lignes (Row Level Security).
create table if not exists public.collection_items (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,
  kind text not null default 'card' check (kind in ('card', 'sealed', 'wish', 'folder', 'deck')),
  data jsonb not null,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
alter table public.collection_items enable row level security;
grant select, insert, update, delete on public.collection_items to authenticated;
drop policy if exists "mes lignes" on public.collection_items;
create policy "mes lignes" on public.collection_items for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Supprimer son compte soi-même (RGPD) : efface l'utilisateur et, en cascade, sa collection
create or replace function public.supprimer_mon_compte() returns void
language sql security definer set search_path = '' as $$
  delete from auth.users where id = auth.uid();
$$;
revoke all on function public.supprimer_mon_compte() from public, anon;
grant execute on function public.supprimer_mon_compte() to authenticated;

-- 24/11/2026 : les decks du mode Joueur sont sauvegardés dans la même table (kind = 'deck')
alter table public.collection_items drop constraint if exists collection_items_kind_check;
alter table public.collection_items add constraint collection_items_kind_check check (kind in ('card', 'sealed', 'wish', 'folder', 'deck'));

-- 24/11/2026 : page de stats réservée au propriétaire de CallIt! (#/stats)
-- Seuls des chiffres globaux et anonymes sortent : jamais d'e-mail, d'identifiant ni « qui possède quoi ».
-- La liste des comptes autorisés est dans une table que personne ne peut lire depuis l'appli
-- (RLS activée, aucune règle). Pour s'y ajouter (dans le SQL Editor, pas dans le code public) :
--   insert into public.stats_admins (user_id) select id from auth.users where email = '…';
create table if not exists public.stats_admins (
  user_id uuid primary key references auth.users on delete cascade
);
alter table public.stats_admins enable row level security;
revoke all on public.stats_admins from public, anon, authenticated;

-- Est-ce que je peux voir la page de stats ? (ne révèle rien d'autre que oui / non pour soi-même)
create or replace function public.stats_suis_je_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.stats_admins where user_id = (select auth.uid()));
$$;
revoke all on function public.stats_suis_je_admin() from public, anon;
grant execute on function public.stats_suis_je_admin() to authenticated;

-- Lecture prudente d'une date écrite par l'appli (« 2026-11-24 ») : une valeur abîmée compte pour rien
create or replace function public.stats_date(t text) returns date
language plpgsql immutable set search_path = '' as $$
begin
  if t is null or t !~ '^\d{4}-\d{2}-\d{2}$' then return null; end if;
  return t::date;
exception when others then return null;
end;
$$;
revoke all on function public.stats_date(text) from public, anon, authenticated;

-- Les chiffres : refusés à tout autre compte (vérifié ici, côté serveur)
create or replace function public.stats_globales() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  res jsonb;
  debut date := (date_trunc('week', now()) - interval '11 weeks')::date;
begin
  if not exists (select 1 from public.stats_admins where user_id = (select auth.uid())) then
    raise exception 'acces refuse' using errcode = '42501';
  end if;

  with items as (
    select user_id, kind, data from public.collection_items where not deleted
  ),
  semaines as (
    select generate_series(debut, date_trunc('week', now())::date, interval '1 week')::date as s
  ),
  inscrits as (
    select date_trunc('week', created_at)::date as s, count(*) as n
    from auth.users where created_at >= debut group by 1
  ),
  envies as (
    select date_trunc('week', public.stats_date(data->>'added'))::date as s, count(*) as n
    from items where kind = 'wish' and public.stats_date(data->>'added') >= debut group by 1
  ),
  decks as (
    select date_trunc('week', public.stats_date(data->>'created'))::date as s, count(*) as n
    from items where kind = 'deck' and public.stats_date(data->>'created') >= debut group by 1
  )
  select jsonb_build_object(
    'maj', now(),
    'utilisateurs', (select count(*) from auth.users),
    'actifs_30j', (select count(*) from auth.users where last_sign_in_at >= now() - interval '30 days'),
    'avec_collection', (select count(distinct user_id) from items where kind = 'card'),
    'avec_envies', (select count(distinct user_id) from items where kind = 'wish'),
    'avec_decks', (select count(distinct user_id) from items where kind = 'deck'),
    'cartes_lignes', (select count(*) from items where kind = 'card'),
    'cartes_total', (select coalesce(sum(coalesce(case when data->>'qty' ~ '^\d{1,6}$' then (data->>'qty')::int end, 1)), 0) from items where kind = 'card'),
    'scelles', (select count(*) from items where kind = 'sealed'),
    'envies', (select count(*) from items where kind = 'wish'),
    'dossiers', (select count(*) from items where kind = 'folder'),
    'decks', (select count(*) from items where kind = 'deck'),
    'top_envies', coalesce((
      select jsonb_agg(jsonb_build_object('key', key, 'n', n) order by n desc, key)
      from (select data->>'key' as key, count(distinct user_id) as n from items
            where kind = 'wish' and coalesce(data->>'key', '') <> '' group by 1 order by 2 desc, 1 limit 30) t
    ), '[]'::jsonb),
    'top_collection', coalesce((
      select jsonb_agg(jsonb_build_object('key', key, 'n', n) order by n desc, key)
      from (select data->>'key' as key, count(distinct user_id) as n from items
            where kind = 'card' and coalesce(data->>'key', '') <> '' group by 1 order by 2 desc, 1 limit 15) t
    ), '[]'::jsonb),
    'semaines', (
      select jsonb_agg(jsonb_build_object('s', w.s, 'inscrits', coalesce(i.n, 0), 'envies', coalesce(e.n, 0), 'decks', coalesce(d.n, 0)) order by w.s)
      from semaines w left join inscrits i using (s) left join envies e using (s) left join decks d using (s)
    )
  ) into res;
  return res;
end;
$$;
revoke all on function public.stats_globales() from public, anon;
grant execute on function public.stats_globales() to authenticated;

-- 25/11/2026 : « Signaler un bug ou proposer une idée » (réglages et menu).
-- Tout le monde peut envoyer, personne ne peut relire depuis l'appli : on lit les retours dans Supabase → Table Editor.
create table if not exists public.retours (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid default auth.uid() references auth.users on delete set null,
  kind text not null check (kind in ('bug', 'idee')),
  texte text not null check (length(texte) between 1 and 3000),
  capture text check (capture is null or (capture like 'data:image/jpeg;base64,%' and length(capture) < 600000)),
  page text check (length(page) <= 200),
  langue text check (length(langue) <= 10),
  appareil text check (length(appareil) <= 300),
  traite boolean not null default false
);
alter table public.retours enable row level security;
revoke all on public.retours from anon, authenticated;
grant insert (kind, texte, capture, page, langue, appareil) on public.retours to anon, authenticated;
drop policy if exists "envoyer un retour" on public.retours;
create policy "envoyer un retour" on public.retours for insert to anon, authenticated
  with check (user_id is null or user_id = (select auth.uid()));

-- 27/11/2026 : « Devenir testeur » (écran #/testeur, adresse courte callitcards.com/testeur).
-- Tout le monde peut s'inscrire, personne ne peut relire depuis l'appli : on lit la liste dans Supabase → Table Editor,
-- puis on ajoute les adresses Android à la liste de testeurs Google Play (et à ia_testeurs pour la lecture IA offerte).
-- Une même adresse ne s'inscrit qu'une fois par téléphone (l'appli traite le doublon comme un succès).
create table if not exists public.testeurs (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  email text not null check (length(email) between 6 and 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  plateforme text not null default 'android' check (plateforme in ('android', 'ios')),
  langue text check (length(langue) <= 10),
  ajoute boolean not null default false
);
create unique index if not exists testeurs_email_plateforme on public.testeurs (lower(email), plateforme);
alter table public.testeurs enable row level security;
revoke all on public.testeurs from anon, authenticated;
grant insert (email, plateforme, langue) on public.testeurs to anon, authenticated;
drop policy if exists "devenir testeur" on public.testeurs;
create policy "devenir testeur" on public.testeurs for insert to anon, authenticated with check (true);

-- 26/11/2026 : notifications sur le téléphone (Firebase Cloud Messaging).
-- Un appareil = le jeton que Firebase donne au téléphone. Chacun ne voit que ses appareils.
-- L'envoi se fait par la fonction « notifier » (supabase/functions/notifier), jamais depuis l'appli.
create table if not exists public.appareils (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  jeton text not null,
  plateforme text not null default 'android' check (plateforme in ('android', 'ios', 'web')),
  langue text not null default 'fr',
  maj timestamptz not null default now(),
  primary key (user_id, jeton)
);
alter table public.appareils enable row level security;
grant select, insert, update, delete on public.appareils to authenticated;
drop policy if exists "mes appareils" on public.appareils;
create policy "mes appareils" on public.appareils for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- 27/11/2026 : relevé du matin pour le Tableau CallIt! (appelé chaque matin sans connexion, avec l'en-tête x-releve-cle).
-- Seulement des nombres globaux et anonymes : jamais d'e-mail, d'identifiant ni « qui possède quoi ».
-- La clé n'est jamais gardée : seule son empreinte (sha256) est dans public.releve_cle (illisible depuis l'appli).
create table if not exists public.releve_cle (
  id int primary key default 1 check (id = 1),
  empreinte text not null
);
alter table public.releve_cle enable row level security;
revoke all on public.releve_cle from public, anon, authenticated;

create or replace function public.releve_matin() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  cle text := nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-releve-cle';
  jour date := (now() at time zone 'Europe/Paris')::date - 1;
  debut timestamptz := jour::timestamp at time zone 'Europe/Paris';
  fin timestamptz := (jour + 1)::timestamp at time zone 'Europe/Paris';
begin
  if cle is null or not exists (
    select 1 from public.releve_cle where empreinte = encode(sha256(convert_to(cle, 'UTF8')), 'hex')
  ) then
    raise exception 'acces refuse' using errcode = '42501';
  end if;
  return (
    with items as (select user_id, kind, data from public.collection_items where not deleted)
    select jsonb_build_object(
      'jour', jour,
      'nouveaux_comptes', (select count(*) from auth.users where created_at >= debut and created_at < fin),
      'comptes_total', (select count(*) from auth.users),
      'actifs_30j', (select count(*) from auth.users where last_sign_in_at >= now() - interval '30 days'),
      'retours', (select count(*) from public.retours where created_at >= debut and created_at < fin),
      'avec_collection', (select count(distinct user_id) from items where kind = 'card'),
      'cartes_total', (select coalesce(sum(coalesce(case when data->>'qty' ~ '^\d{1,6}$' then (data->>'qty')::int end, 1)), 0) from items where kind = 'card'),
      'scelles', (select count(*) from items where kind = 'sealed'),
      'envies', (select count(*) from items where kind = 'wish'),
      'avec_envies', (select count(distinct user_id) from items where kind = 'wish'),
      'decks', (select count(*) from items where kind = 'deck'),
      'top_envies', coalesce((
        select jsonb_agg(jsonb_build_object('key', key, 'n', n) order by n desc, key)
        from (select data->>'key' as key, count(distinct user_id) as n from items
              where kind = 'wish' and coalesce(data->>'key', '') <> '' group by 1 order by 2 desc, 1 limit 10) t
      ), '[]'::jsonb)
    )
  );
end;
$$;
revoke all on function public.releve_matin() from public, authenticated;
grant execute on function public.releve_matin() to anon;
-- Clé du relevé (dans le SQL Editor, jamais dans le code) : insert into public.releve_cle (id, empreinte) values (1, encode(sha256(convert_to('<clé>', 'UTF8')), 'hex')) on conflict (id) do update set empreinte = excluded.empreinte;
