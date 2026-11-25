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
