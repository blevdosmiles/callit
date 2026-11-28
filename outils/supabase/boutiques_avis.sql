-- 27/11/2026 : En voyage, avis partagés sur les boutiques.
-- Après sa visite, chacun peut dire si la boutique vend des cartes (oui / non), cocher des étiquettes
-- (Prix du marché, Bonnes affaires, Rachète des cartes…) et laisser un avis écrit court.
-- Un avis par appareil et par boutique (identifiant tiré au hasard sur l'appareil, sans nom ni position).
-- Les tables ne sont lisibles par personne depuis l'appli : on passe par des fonctions qui ne rendent que des totaux
-- et les avis écrits non masqués. Les avis écrits se modèrent dans Supabase → Table Editor → boutiques_commentaires (colonne masque).
-- À lancer une fois dans Supabase → SQL Editor. Sans ce SQL, l'appli marche quand même : tout reste sur l'appareil.

create table if not exists public.boutiques_avis (
  shop_id text not null check (shop_id ~ '^([nwr][0-9]{1,12}|o[0-9a-f]{32})$'),
  appareil uuid not null,
  cartes boolean,
  etiquettes text[] not null default '{}' check (cardinality(etiquettes) <= 20),
  user_id uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (shop_id, appareil)
);
create index if not exists boutiques_avis_appareil on public.boutiques_avis (appareil, updated_at);
alter table public.boutiques_avis enable row level security;
revoke all on public.boutiques_avis from anon, authenticated;

create table if not exists public.boutiques_commentaires (
  id bigint generated always as identity primary key,
  shop_id text not null check (shop_id ~ '^([nwr][0-9]{1,12}|o[0-9a-f]{32})$'),
  appareil uuid not null,
  texte text not null check (length(texte) between 3 and 400),
  langue text check (length(langue) <= 10),
  user_id uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now(),
  signalements int not null default 0,
  masque boolean not null default false,
  unique (shop_id, appareil)
);
alter table public.boutiques_commentaires enable row level security;
revoke all on public.boutiques_commentaires from anon, authenticated;

create table if not exists public.boutiques_signalements (
  commentaire bigint not null references public.boutiques_commentaires on delete cascade,
  appareil uuid not null,
  primary key (commentaire, appareil)
);
alter table public.boutiques_signalements enable row level security;
revoke all on public.boutiques_signalements from anon, authenticated;

-- Garde-fou commun : 100 actions par appareil et par jour au plus
create or replace function public.boutique_garde(p_appareil uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if p_appareil is null then raise exception 'appareil manquant'; end if;
  if (select count(*) from boutiques_avis where appareil = p_appareil and updated_at > now() - interval '1 day')
     + (select count(*) from boutiques_commentaires where appareil = p_appareil and created_at > now() - interval '1 day') >= 100 then
    raise exception 'trop d''avis aujourd''hui';
  end if;
end $$;
revoke all on function public.boutique_garde(uuid) from public, anon, authenticated;

-- Totaux d'une boutique : { oui, non, etiquettes: { id: nombre } }
create or replace function public.boutique_totaux(p_shop text) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'oui', (select count(*) from boutiques_avis where shop_id = p_shop and cartes),
    'non', (select count(*) from boutiques_avis where shop_id = p_shop and not cartes),
    'etiquettes', coalesce((select jsonb_object_agg(e, n) from (select e, count(*) n from boutiques_avis, unnest(etiquettes) e where shop_id = p_shop group by e) x), '{}'::jsonb));
$$;
revoke all on function public.boutique_totaux(text) from public, anon, authenticated;

-- « Il y a des cartes ? » (p_cartes = null : retirer sa réponse)
create or replace function public.boutique_avis_donner(p_shop text, p_appareil uuid, p_cartes boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if p_shop !~ '^([nwr][0-9]{1,12}|o[0-9a-f]{32})$' then raise exception 'avis invalide'; end if;
  perform boutique_garde(p_appareil);
  insert into boutiques_avis (shop_id, appareil, cartes) values (p_shop, p_appareil, p_cartes)
    on conflict (shop_id, appareil) do update set cartes = excluded.cartes, updated_at = now();
  delete from boutiques_avis where shop_id = p_shop and appareil = p_appareil and cartes is null and etiquettes = '{}';
  return boutique_totaux(p_shop);
end $$;

-- Étiquettes cochées (liste complète, remplace la précédente)
create or replace function public.boutique_etiquettes_donner(p_shop text, p_appareil uuid, p_etiquettes text[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare ok text[] := array['vraie','unite','scelle','vintage','gradees','japonais','rachat','echange','tournois','prixok','affaire','prixhaut','horaires'];
begin
  if p_shop !~ '^([nwr][0-9]{1,12}|o[0-9a-f]{32})$' or not (coalesce(p_etiquettes, '{}') <@ ok) then raise exception 'avis invalide'; end if;
  perform boutique_garde(p_appareil);
  insert into boutiques_avis (shop_id, appareil, etiquettes) values (p_shop, p_appareil, coalesce(p_etiquettes, '{}'))
    on conflict (shop_id, appareil) do update set etiquettes = excluded.etiquettes, updated_at = now();
  delete from boutiques_avis where shop_id = p_shop and appareil = p_appareil and cartes is null and etiquettes = '{}';
  return boutique_totaux(p_shop);
end $$;

-- Totaux pour une liste de boutiques (300 au plus)
drop function if exists public.boutiques_avis_lire(text[]);
create or replace function public.boutiques_avis_lire(p_ids text[])
returns table (shop_id text, oui int, non int, etiquettes jsonb) language sql stable security definer set search_path = public as $$
  select a.shop_id, (count(*) filter (where a.cartes))::int, (count(*) filter (where not a.cartes))::int,
    coalesce((select jsonb_object_agg(e, n) from (select e, count(*) n from boutiques_avis b, unnest(b.etiquettes) e where b.shop_id = a.shop_id group by e) x), '{}'::jsonb)
  from boutiques_avis a
  where a.shop_id = any (p_ids[1:300])
  group by a.shop_id;
$$;

-- Avis écrit : un par appareil et par boutique (le republier le remplace ; texte vide = le retirer).
-- Refusé s'il contient une adresse e-mail, un lien ou un numéro de téléphone.
create or replace function public.boutique_commentaire_donner(p_shop text, p_appareil uuid, p_texte text, p_langue text)
returns void language plpgsql security definer set search_path = public as $$
declare t text := btrim(coalesce(p_texte, ''));
begin
  if p_shop !~ '^([nwr][0-9]{1,12}|o[0-9a-f]{32})$' then raise exception 'avis invalide'; end if;
  if t = '' then delete from boutiques_commentaires where shop_id = p_shop and appareil = p_appareil; return; end if;
  if length(t) < 3 or length(t) > 400 or t ~* '[^[:space:]@]+@[^[:space:]@]+\.[a-z]{2,}' or t ~* '(https?://|www\.)' or t ~ '\d[\d .-]{7,}\d' then
    raise exception 'texte refusé';
  end if;
  perform boutique_garde(p_appareil);
  insert into boutiques_commentaires (shop_id, appareil, texte, langue) values (p_shop, p_appareil, t, left(p_langue, 10))
    on conflict (shop_id, appareil) do update set texte = excluded.texte, langue = excluded.langue, created_at = now(), signalements = 0, masque = false;
  delete from boutiques_signalements s using boutiques_commentaires c where s.commentaire = c.id and c.shop_id = p_shop and c.appareil = p_appareil;
end $$;

-- Les 30 derniers avis écrits non masqués d'une boutique ; « mien » indique celui de l'appareil qui demande
create or replace function public.boutique_commentaires_lire(p_shop text, p_appareil uuid)
returns table (id bigint, texte text, langue text, jour date, mien boolean) language sql stable security definer set search_path = public as $$
  select c.id, c.texte, c.langue, c.created_at::date, c.appareil = p_appareil
  from boutiques_commentaires c
  where c.shop_id = p_shop and not c.masque
  order by c.created_at desc limit 30;
$$;

-- Signaler un avis écrit : masqué d'office à 3 signalements (à revoir dans le Table Editor)
create or replace function public.boutique_commentaire_signaler(p_id bigint, p_appareil uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_appareil is null then return; end if;
  insert into boutiques_signalements (commentaire, appareil) values (p_id, p_appareil) on conflict do nothing;
  update boutiques_commentaires set signalements = (select count(*) from boutiques_signalements where commentaire = p_id),
    masque = masque or (select count(*) from boutiques_signalements where commentaire = p_id) >= 3
  where id = p_id;
end $$;

revoke all on function public.boutique_avis_donner(text, uuid, boolean) from public;
revoke all on function public.boutique_etiquettes_donner(text, uuid, text[]) from public;
revoke all on function public.boutiques_avis_lire(text[]) from public;
revoke all on function public.boutique_commentaire_donner(text, uuid, text, text) from public;
revoke all on function public.boutique_commentaires_lire(text, uuid) from public;
revoke all on function public.boutique_commentaire_signaler(bigint, uuid) from public;
grant execute on function public.boutique_avis_donner(text, uuid, boolean) to anon, authenticated;
grant execute on function public.boutique_etiquettes_donner(text, uuid, text[]) to anon, authenticated;
grant execute on function public.boutiques_avis_lire(text[]) to anon, authenticated;
grant execute on function public.boutique_commentaire_donner(text, uuid, text, text) to anon, authenticated;
grant execute on function public.boutique_commentaires_lire(text, uuid) to anon, authenticated;
grant execute on function public.boutique_commentaire_signaler(bigint, uuid) to anon, authenticated;
