-- Abonnement CallIt! Pro (Stripe) et compteur des analyses gratuites
-- PAS ENCORE À LANCER : en attente du code ATECO confirmé par le comptable (27/11/2026).
-- Le jour venu : Supabase → SQL Editor → coller ce fichier → Run. On peut le relancer sans risque.
--
-- Règle (idée de Jérémie du 27/11/2026) : 5 analyses gratuites par semaine, illimité avec Pro (5 €/mois).
--   abonnements      : une ligne par compte qui a payé un jour. Écrite UNIQUEMENT par la fonction
--                      « stripe-webhook » (clé de service), jamais par l'appli.
--   analyses_usage   : le compteur, une ligne par compte et par semaine (lundi = début de semaine).
--   pro_reglages     : réglages modifiables sans toucher au code (nombre gratuit par semaine).
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
  semaine date not null default date_trunc('week', now())::date,
  n       integer not null default 0,
  primary key (user_id, semaine)
);
alter table public.analyses_usage enable row level security;

create table if not exists public.pro_reglages (
  id integer primary key default 1 check (id = 1),
  gratuit_par_semaine integer not null default 5
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
  lim integer; n integer;
begin
  if uid is null then return json_build_object('connecte', false); end if;
  select gratuit_par_semaine into lim from public.pro_reglages where id = 1;
  select coalesce(sum(u.n), 0) into n from public.analyses_usage u
    where u.user_id = uid and u.semaine = date_trunc('week', now())::date;
  select * into a from public.abonnements where user_id = uid;
  return json_build_object(
    'connecte', true,
    'pro', public.pro_actif(uid),
    'statut', coalesce(a.statut, 'aucun'),
    'fin_periode', a.fin_periode,
    'annule_fin_periode', coalesce(a.annule_fin_periode, false),
    'gratuit_semaine', lim,
    'reste_semaine', greatest(0, lim - n)
  );
end;
$$;
revoke all on function public.pro_statut() from public, anon;
grant execute on function public.pro_statut() to authenticated;

-- Compte une analyse pour le compte connecté. Pro : toujours ok (on compte quand même, pour les stats).
-- Gratuit : ok tant que la semaine n'a pas atteint la limite.
create or replace function public.analyse_consommer() returns json
language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  lim integer; n integer; pro boolean;
  sem date := date_trunc('week', now())::date;
begin
  if uid is null then return json_build_object('ok', false, 'raison', 'connexion'); end if;
  -- un seul passage à la fois par compte (deux analyses lancées ensemble ne dépassent pas la limite)
  perform pg_advisory_xact_lock(hashtext('analyse:' || uid::text));
  pro := public.pro_actif(uid);
  select gratuit_par_semaine into lim from public.pro_reglages where id = 1;
  select coalesce(sum(u.n), 0) into n from public.analyses_usage u where u.user_id = uid and u.semaine = sem;
  if not pro and n >= lim then
    return json_build_object('ok', false, 'raison', 'limite', 'reste', 0, 'pro', false);
  end if;
  insert into public.analyses_usage (user_id, semaine, n) values (uid, sem, 1)
    on conflict (user_id, semaine) do update set n = public.analyses_usage.n + 1;
  return json_build_object('ok', true, 'pro', pro, 'reste', case when pro then null else greatest(0, lim - n - 1) end);
end;
$$;
revoke all on function public.analyse_consommer() from public, anon;
grant execute on function public.analyse_consommer() to authenticated;
