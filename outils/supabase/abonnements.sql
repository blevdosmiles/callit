-- Abonnement CallIt! Pro (Stripe) et compteur des analyses gratuites
-- PAS ENCORE À LANCER : en attente du code ATECO confirmé par le comptable (27/11/2026).
-- Le jour venu : Supabase → SQL Editor → coller ce fichier → Run. On peut le relancer sans risque.
--
-- Règle (Jérémie, 27/11/2026 20 h 55 UTC) : 3 analyses d'état gratuites par jour, 100 par jour avec Pro
-- (5 €/mois ou 50 €/an). Le plafond Pro limite le coût de l'IA si quelqu'un abuse.
--   abonnements      : une ligne par compte qui a payé un jour. Écrite UNIQUEMENT par la fonction
--                      « stripe-webhook » (clé de service), jamais par l'appli.
--   analyses_usage   : le compteur, une ligne par compte et par jour.
--   pro_reglages     : réglages modifiables sans toucher au code (nombre gratuit et nombre Pro par jour).
-- Aucune table n'est lisible ni modifiable depuis l'appli (RLS sans règle) : seules les fonctions
-- ci-dessous y touchent, toujours pour le compte connecté (auth.uid()).
-- Rien de bancaire n'est gardé ici : seulement les identifiants Stripe (cus_…, sub_…) et l'état.

create table if not exists public.abonnements (
  user_id            uuid primary key references auth.users (id) on delete cascade,
  stripe_client      text unique,             -- cus_…
  stripe_abonnement  text unique,             -- sub_…
  statut             text not null default 'aucun', -- active, trialing, past_due, canceled, unpaid, incomplete…
  fin_periode        timestamptz,             -- date jusqu'à laquelle Pro est payé
  annule_fin_periode boolean not null default false,
  maj_le             timestamptz not null default now()
);
alter table public.abonnements enable row level security;

create table if not exists public.analyses_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  jour    date not null default current_date,
  n       integer not null default 0,
  primary key (user_id, jour)
);
alter table public.analyses_usage enable row level security;

create table if not exists public.pro_reglages (
  id integer primary key default 1 check (id = 1),
  gratuit_par_jour integer not null default 3,
  pro_par_jour     integer not null default 100
);
insert into public.pro_reglages (id) values (1) on conflict (id) do nothing;
alter table public.pro_reglages enable row level security;

-- Pro est actif si Stripe dit « active » ou « trialing », ou « past_due » (paiement en retard :
-- Stripe réessaie quelques jours, on ne coupe pas tout de suite), et que la période payée n'est pas finie.
create or replace function public.pro_actif(uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.abonnements a
    where a.user_id = uid
      and a.statut in ('active', 'trialing', 'past_due')
      and (a.fin_periode is null or a.fin_periode > now() - interval '3 days')
  );
$$;
revoke all on function public.pro_actif(uuid) from public, anon, authenticated;

-- Où en est le compte connecté (sans rien compter)
create or replace function public.pro_statut() returns json
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  a public.abonnements;
  lim integer; n integer; pro boolean;
begin
  if uid is null then return json_build_object('connecte', false); end if;
  pro := public.pro_actif(uid);
  select case when pro then r.pro_par_jour else r.gratuit_par_jour end into lim from public.pro_reglages r where r.id = 1;
  select coalesce(sum(u.n), 0) into n from public.analyses_usage u
    where u.user_id = uid and u.jour = current_date;
  select * into a from public.abonnements where user_id = uid;
  return json_build_object(
    'connecte', true,
    'pro', pro,
    'statut', coalesce(a.statut, 'aucun'),
    'fin_periode', a.fin_periode,
    'annule_fin_periode', coalesce(a.annule_fin_periode, false),
    'par_jour', lim,
    'reste_jour', greatest(0, lim - n)
  );
end;
$$;
revoke all on function public.pro_statut() from public, anon;
grant execute on function public.pro_statut() to authenticated;

-- Compte une analyse pour le compte connecté : ok tant que le jour n'a pas atteint la limite
-- (3 en gratuit, 100 avec Pro, réglables dans pro_reglages).
create or replace function public.analyse_consommer() returns json
language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  lim integer; n integer; pro boolean;
  j date := current_date;
begin
  if uid is null then return json_build_object('ok', false, 'raison', 'connexion'); end if;
  -- un seul passage à la fois par compte (deux analyses lancées ensemble ne dépassent pas la limite)
  perform pg_advisory_xact_lock(hashtext('analyse:' || uid::text));
  pro := public.pro_actif(uid);
  select case when pro then r.pro_par_jour else r.gratuit_par_jour end into lim from public.pro_reglages r where r.id = 1;
  select coalesce(sum(u.n), 0) into n from public.analyses_usage u where u.user_id = uid and u.jour = j;
  if n >= lim then
    return json_build_object('ok', false, 'raison', 'limite', 'reste', 0, 'pro', pro);
  end if;
  insert into public.analyses_usage (user_id, jour, n) values (uid, j, 1)
    on conflict (user_id, jour) do update set n = public.analyses_usage.n + 1;
  return json_build_object('ok', true, 'pro', pro, 'reste', greatest(0, lim - n - 1));
end;
$$;
revoke all on function public.analyse_consommer() from public, anon;
grant execute on function public.analyse_consommer() to authenticated;
