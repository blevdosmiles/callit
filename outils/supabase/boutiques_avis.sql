-- 27/11/2026 : En voyage, « Il y a des cartes ? ». Après sa visite, chacun peut dire si la boutique vend des cartes.
-- Un avis par appareil et par boutique (identifiant tiré au hasard sur l'appareil, sans nom ni adresse).
-- La table n'est lisible par personne depuis l'appli : on passe par deux fonctions qui ne rendent que des totaux.
-- À lancer une fois dans Supabase → SQL Editor. Sans ce SQL, l'appli marche quand même : l'avis reste sur l'appareil.
create table if not exists public.boutiques_avis (
  shop_id text not null check (shop_id ~ '^[nwr][0-9]{1,12}$'),
  appareil uuid not null,
  cartes boolean not null,
  user_id uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (shop_id, appareil)
);
create index if not exists boutiques_avis_appareil on public.boutiques_avis (appareil, updated_at);
alter table public.boutiques_avis enable row level security;
revoke all on public.boutiques_avis from anon, authenticated;

-- Donner (ou retirer, avec p_cartes = null) son avis ; rend les nouveaux totaux de la boutique.
-- Garde-fou : 100 avis par appareil et par jour au plus.
create or replace function public.boutique_avis_donner(p_shop text, p_appareil uuid, p_cartes boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if p_shop !~ '^[nwr][0-9]{1,12}$' or p_appareil is null then raise exception 'avis invalide'; end if;
  if p_cartes is null then
    delete from boutiques_avis where shop_id = p_shop and appareil = p_appareil;
  else
    if (select count(*) from boutiques_avis where appareil = p_appareil and updated_at > now() - interval '1 day') >= 100 then
      raise exception 'trop d''avis aujourd''hui';
    end if;
    insert into boutiques_avis (shop_id, appareil, cartes) values (p_shop, p_appareil, p_cartes)
      on conflict (shop_id, appareil) do update set cartes = excluded.cartes, updated_at = now();
  end if;
  return (select jsonb_build_object('oui', count(*) filter (where cartes), 'non', count(*) filter (where not cartes))
          from boutiques_avis where shop_id = p_shop);
end $$;

-- Totaux pour une liste de boutiques (300 au plus)
create or replace function public.boutiques_avis_lire(p_ids text[])
returns table (shop_id text, oui int, non int) language sql stable security definer set search_path = public as $$
  select a.shop_id, (count(*) filter (where a.cartes))::int, (count(*) filter (where not a.cartes))::int
  from boutiques_avis a
  where a.shop_id = any (p_ids[1:300])
  group by a.shop_id;
$$;

revoke all on function public.boutique_avis_donner(text, uuid, boolean) from public;
revoke all on function public.boutiques_avis_lire(text[]) from public;
grant execute on function public.boutique_avis_donner(text, uuid, boolean) to anon, authenticated;
grant execute on function public.boutiques_avis_lire(text[]) to anon, authenticated;
