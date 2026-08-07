-- =============================================================================
-- SUPA AI — 0015a_phase10_integrations_rpcs.sql
-- Phase 10: RPC functions for atomic counter increments + rating recalc.
--
-- 5 SECURITY DEFINER functions (owner = postgres, search_path = public):
--   1. increment_install_count(app_id)
--   2. increment_integration_errors(int_id)
--   3. increment_webhook_failures(sub_id)
--   4. increment_webhook_received(sub_id)
--   5. recalc_app_rating(target_app_id)
-- =============================================================================

-- =============================================================================
-- 1. increment_install_count
-- =============================================================================
-- Bumps marketplace_apps.install_count by 1 atomically. Returns the new count.
create or replace function public.increment_install_count(app_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  next_count integer;
begin
  update public.marketplace_apps
     set install_count = install_count + 1
   where id = app_id
   returning install_count into next_count;

  if next_count is null then
    raise exception 'marketplace app % not found', app_id
      using errcode = 'P0002';
  end if;

  return next_count;
end;
$$;

-- =============================================================================
-- 2. increment_integration_errors
-- =============================================================================
-- Bumps integrations.error_count by 1 and returns the new count.
create or replace function public.increment_integration_errors(int_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  next_count integer;
begin
  update public.integrations
     set error_count = error_count + 1,
         last_error = 'incremented via rpc',
         status = case
           when error_count + 1 >= 10 then 'error'
           else status
         end
   where id = int_id
   returning error_count into next_count;

  if next_count is null then
    raise exception 'integration % not found', int_id
      using errcode = 'P0002';
  end if;

  return next_count;
end;
$$;

-- =============================================================================
-- 3. increment_webhook_failures
-- =============================================================================
-- Bumps webhook_subscriptions.total_failed by 1 and updates last_received_at.
create or replace function public.increment_webhook_failures(sub_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  next_count integer;
begin
  update public.webhook_subscriptions
     set total_failed = total_failed + 1,
         last_received_at = now()
   where id = sub_id
   returning total_failed into next_count;

  if next_count is null then
    raise exception 'webhook subscription % not found', sub_id
      using errcode = 'P0002';
  end if;

  return next_count;
end;
$$;

-- =============================================================================
-- 4. increment_webhook_received
-- =============================================================================
-- Bumps webhook_subscriptions.total_received by 1 and updates last_received_at.
create or replace function public.increment_webhook_received(sub_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  next_count integer;
begin
  update public.webhook_subscriptions
     set total_received = total_received + 1,
         last_received_at = now()
   where id = sub_id
   returning total_received into next_count;

  if next_count is null then
    raise exception 'webhook subscription % not found', sub_id
      using errcode = 'P0002';
  end if;

  return next_count;
end;
$$;

-- =============================================================================
-- 5. recalc_app_rating
-- =============================================================================
-- Recalculates marketplace_apps.rating_avg + rating_count from app_ratings.
-- Returns the new avg (0 when there are no ratings yet).
create or replace function public.recalc_app_rating(target_app_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  avg_val numeric;
  cnt     integer;
begin
  select coalesce(avg(rating), 0), count(*)
    into avg_val, cnt
    from public.app_ratings
   where app_id = target_app_id;

  update public.marketplace_apps
     set rating_avg = round(coalesce(avg_val, 0)::numeric, 2),
         rating_count = coalesce(cnt, 0)
   where id = target_app_id;

  return coalesce(avg_val, 0);
end;
$$;

-- =============================================================================
-- Grant execute to anon + authenticated roles so the API can call them
-- via the supabase-js `.rpc()` interface.
-- =============================================================================
grant execute on function public.increment_install_count(uuid) to anon, authenticated;
grant execute on function public.increment_integration_errors(uuid) to anon, authenticated;
grant execute on function public.increment_webhook_failures(uuid) to anon, authenticated;
grant execute on function public.increment_webhook_received(uuid) to anon, authenticated;
grant execute on function public.recalc_app_rating(uuid) to anon, authenticated;
