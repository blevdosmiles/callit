-- Lectures IA offertes à tous les comptes connectés : 30 par mois, en mode Rapide (choix de Jérémie du 27/11/2026)
-- À coller dans Supabase → SQL Editor → Run, APRÈS ia_testeurs.sql. On peut le relancer sans risque.
--
-- Qui a droit à quoi :
--   1. Testeur (liste ia_testeurs, actif) tant qu'il lui reste des lectures : son quota à lui, Rapide ou Précis.
--   2. Sinon, tout compte connecté avec une adresse confirmée : gratuit_mois lectures par mois (30), Rapide seulement.
--   (Pro sans limite viendra avec les abonnements Stripe : rien de payant ici.)
-- Garde-fous : plafond par jour et par compte (gratuit_jour), plafond global du jour (plafond_jour_total, déjà en place),
-- et l'interrupteur gratuit_actif pour couper l'offre gratuite d'un coup.
-- Le compteur reste ia_usage (une ligne par compte et par jour) : le mois se calcule à partir des jours.

alter table public.ia_reglages add column if not exists gratuit_actif boolean not null default true;
alter table public.ia_reglages add column if not exists gratuit_mois  integer not null default 30;
alter table public.ia_reglages add column if not exists gratuit_jour  integer not null default 30;

-- Droits du compte connecté, sans rien compter. Renvoie aussi « testeur » pour les anciennes versions de l'appli.
create or replace function public.ia_droits(uid uuid) returns json
language plpgsql stable security definer set search_path = '' as $$
declare
  mail text;
  t public.ia_testeurs;
  g public.ia_reglages;
  total integer; mois_n integer; jour_n integer;
begin
  if uid is null then return json_build_object('acces', false, 'testeur', false, 'raison', 'connexion'); end if;
  select u.email into mail from auth.users u where u.id = uid and u.email_confirmed_at is not null;
  if mail is null then return json_build_object('acces', false, 'testeur', false, 'raison', 'connexion'); end if;
  select coalesce(sum(n), 0) into jour_n from public.ia_usage where user_id = uid and jour = current_date;
  -- 1. Testeur avec des lectures restantes
  select * into t from public.ia_testeurs where lower(email) = lower(mail) and actif;
  if found then
    select coalesce(sum(n), 0) into total from public.ia_usage where user_id = uid;
    if total < t.quota then
      return json_build_object('acces', true, 'testeur', true, 'offre', 'testeur', 'reste', t.quota - total, 'quota', t.quota,
                               'reste_jour', greatest(0, t.par_jour - jour_n));
    end if;
  end if;
  -- 2. Offre gratuite du mois
  select * into g from public.ia_reglages where id = 1;
  if not coalesce(g.gratuit_actif, false) then return json_build_object('acces', false, 'testeur', false, 'raison', 'ferme'); end if;
  select coalesce(sum(n), 0) into mois_n from public.ia_usage
    where user_id = uid and jour >= date_trunc('month', current_date)::date;
  return json_build_object('acces', true, 'testeur', true, 'offre', 'gratuit',
                           'reste', greatest(0, g.gratuit_mois - mois_n), 'quota', g.gratuit_mois,
                           'reste_jour', greatest(0, g.gratuit_jour - jour_n),
                           'renouvelle', (date_trunc('month', current_date) + interval '1 month')::date);
end;
$$;
revoke all on function public.ia_droits(uuid) from public, anon, authenticated;

create or replace function public.ia_statut() returns json
language sql stable security definer set search_path = '' as $$
  select public.ia_droits((select auth.uid()));
$$;
revoke all on function public.ia_statut() from public, anon;
grant execute on function public.ia_statut() to authenticated;

-- Compte une lecture, si les droits, le plafond du jour et le plafond global le permettent
create or replace function public.ia_consommer() returns json
language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  d json;
begin
  if uid is null then return json_build_object('ok', false, 'raison', 'connexion'); end if;
  -- un seul passage à la fois par compte (deux lectures lancées ensemble ne dépassent pas le quota)
  perform pg_advisory_xact_lock(hashtext(uid::text));
  d := public.ia_droits(uid);
  if not (d->>'acces')::boolean then
    return json_build_object('ok', false, 'raison', case when d->>'raison' = 'connexion' then 'connexion' else 'pas_testeur' end);
  end if;
  if (d->>'reste')::int <= 0 then return json_build_object('ok', false, 'raison', 'quota', 'reste', 0, 'offre', d->>'offre'); end if;
  if (d->>'reste_jour')::int <= 0 then return json_build_object('ok', false, 'raison', 'jour', 'reste', (d->>'reste')::int, 'offre', d->>'offre'); end if;
  -- plafond global du jour, tous comptes confondus
  perform pg_advisory_xact_lock(hashtext('ia_global'));
  if (select coalesce(sum(n), 0) from public.ia_usage where jour = current_date)
     >= (select plafond_jour_total from public.ia_reglages where id = 1) then
    return json_build_object('ok', false, 'raison', 'jour', 'reste', (d->>'reste')::int, 'offre', d->>'offre');
  end if;
  insert into public.ia_usage (user_id, jour, n) values (uid, current_date, 1)
    on conflict (user_id, jour) do update set n = public.ia_usage.n + 1;
  return json_build_object('ok', true, 'reste', (d->>'reste')::int - 1, 'offre', d->>'offre');
end;
$$;
revoke all on function public.ia_consommer() from public, anon;
grant execute on function public.ia_consommer() to authenticated;

-- Réglages utiles :
-- Couper l'offre gratuite tout de suite :      update public.ia_reglages set gratuit_actif = false where id = 1;
-- Changer le nombre de lectures du mois :       update public.ia_reglages set gratuit_mois = 30 where id = 1;
-- Plafond global du jour (tous comptes) :       update public.ia_reglages set plafond_jour_total = 500 where id = 1;
-- Consommation du mois, par compte :
-- select a.email, sum(u.n) as lectures from public.ia_usage u join auth.users a on a.id = u.user_id
--   where u.jour >= date_trunc('month', current_date)::date group by a.email order by lectures desc;
