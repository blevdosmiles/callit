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

-- 25/11/2026 : « Les plus recherchées sur CallIt! » (visage Marché), visible par tous.
-- Ne renvoie que des comptages anonymes : jamais qui, seulement combien de comptes.
-- Une carte n'apparaît que si au moins 3 comptes différents l'ont ajoutée.
create or replace function public.cartes_populaires() returns jsonb
language sql stable security definer set search_path = '' as $$
  with items as (
    select user_id, kind, data->>'key' as key from public.collection_items
    where not deleted and kind in ('wish', 'card') and coalesce(data->>'key', '') <> ''
  )
  select jsonb_build_object(
    'maj', now(),
    'envies', coalesce((
      select jsonb_agg(jsonb_build_object('key', key, 'n', n) order by n desc, key)
      from (select key, count(distinct user_id) as n from items where kind = 'wish'
            group by 1 having count(distinct user_id) >= 3 order by 2 desc, 1 limit 60) t
    ), '[]'::jsonb),
    'collections', coalesce((
      select jsonb_agg(jsonb_build_object('key', key, 'n', n) order by n desc, key)
      from (select key, count(distinct user_id) as n from items where kind = 'card'
            group by 1 having count(distinct user_id) >= 3 order by 2 desc, 1 limit 60) t
    ), '[]'::jsonb)
  );
$$;
revoke all on function public.cartes_populaires() from public;
grant execute on function public.cartes_populaires() to anon, authenticated;
