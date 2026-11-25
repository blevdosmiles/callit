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
