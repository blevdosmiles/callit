-- Lecture IA offerte aux testeurs (relais « ia-relais »)
-- À coller une fois dans Supabase → SQL Editor → Run. On peut le relancer sans risque.
--
-- ia_testeurs : les adresses e-mail autorisées (celles des testeurs du test fermé Android).
--   quota    = nombre total de lectures IA offertes à ce testeur
--   par_jour = plafond par jour (garde-fou si quelqu'un abuse)
-- ia_usage : le compteur, une ligne par compte et par jour.
-- Aucune de ces tables n'est lisible ni modifiable depuis l'appli (RLS sans règle) :
-- seules les fonctions ci-dessous y touchent, toujours pour le compte connecté (auth.uid()).

create table if not exists public.ia_testeurs (
  email     text primary key,
  quota     integer not null default 100,
  par_jour  integer not null default 30,
  actif     boolean not null default true,
  note      text,
  ajoute_le timestamptz not null default now()
);
alter table public.ia_testeurs enable row level security;

create table if not exists public.ia_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  jour    date not null default current_date,
  n       integer not null default 0,
  primary key (user_id, jour)
);
alter table public.ia_usage enable row level security;

-- Où en est le compte connecté : testeur ou non, lectures restantes (sans rien compter)
create or replace function public.ia_statut() returns json
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  mail text;
  t public.ia_testeurs;
  total integer; jour_n integer;
begin
  if uid is null then return json_build_object('testeur', false); end if;
  select u.email into mail from auth.users u where u.id = uid and u.email_confirmed_at is not null;
  if mail is null then return json_build_object('testeur', false); end if;
  select * into t from public.ia_testeurs where lower(email) = lower(mail) and actif;
  if not found then return json_build_object('testeur', false); end if;
  select coalesce(sum(n), 0) into total from public.ia_usage where user_id = uid;
  select coalesce(sum(n), 0) into jour_n from public.ia_usage where user_id = uid and jour = current_date;
  return json_build_object('testeur', true, 'reste', greatest(0, t.quota - total), 'quota', t.quota,
                           'reste_jour', greatest(0, t.par_jour - jour_n));
end;
$$;
revoke all on function public.ia_statut() from public, anon;
grant execute on function public.ia_statut() to authenticated;

-- Compte une lecture pour le compte connecté, si le quota et le plafond du jour le permettent
create or replace function public.ia_consommer() returns json
language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  mail text;
  t public.ia_testeurs;
  total integer; jour_n integer;
begin
  if uid is null then return json_build_object('ok', false, 'raison', 'connexion'); end if;
  select u.email into mail from auth.users u where u.id = uid and u.email_confirmed_at is not null;
  if mail is null then return json_build_object('ok', false, 'raison', 'pas_testeur'); end if;
  select * into t from public.ia_testeurs where lower(email) = lower(mail) and actif;
  if not found then return json_build_object('ok', false, 'raison', 'pas_testeur'); end if;
  -- un seul passage à la fois par compte (deux lectures lancées ensemble ne dépassent pas le quota)
  perform pg_advisory_xact_lock(hashtext(uid::text));
  select coalesce(sum(n), 0) into total from public.ia_usage where user_id = uid;
  if total >= t.quota then return json_build_object('ok', false, 'raison', 'quota', 'reste', 0); end if;
  select coalesce(sum(n), 0) into jour_n from public.ia_usage where user_id = uid and jour = current_date;
  if jour_n >= t.par_jour then return json_build_object('ok', false, 'raison', 'jour', 'reste', t.quota - total); end if;
  insert into public.ia_usage (user_id, jour, n) values (uid, current_date, 1)
    on conflict (user_id, jour) do update set n = public.ia_usage.n + 1;
  return json_build_object('ok', true, 'reste', t.quota - total - 1);
end;
$$;
revoke all on function public.ia_consommer() from public, anon;
grant execute on function public.ia_consommer() to authenticated;

-- Ajouter un testeur (exemple, à adapter) :
-- insert into public.ia_testeurs (email) values ('adresse@exemple.com') on conflict (email) do update set actif = true;
-- Voir la consommation :
-- select t.email, coalesce(sum(u.n), 0) as lectures from public.ia_testeurs t
--   left join auth.users a on lower(a.email) = lower(t.email)
--   left join public.ia_usage u on u.user_id = a.id group by t.email order by lectures desc;
