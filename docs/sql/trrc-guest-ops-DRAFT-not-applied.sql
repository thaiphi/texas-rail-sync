-- Loads after trrc-guest-journal and trrc-guest-budget drafts. Automatic Free-plan statement,
-- one-hour settled cleanup and the orphan sweep (design 2026-10-14).
begin;
alter table trrc_guest.platform_proofs add column attested_by text;
-- Free plan: Storage 1 GB (org), database 500 MB (project), egress 5 GB/month (org). The
-- ledger sees only guest egress, so 2 GB is reserved for everything else. Fails safe:
-- if this stops running, proofs expire in 600 s and admission refuses.
create function trrc_guest.attest_platform() returns uuid language plpgsql security definer set search_path = '' as $$
declare m record; t timestamptz := clock_timestamp(); db bigint := pg_database_size(current_database()); month_bytes bigint; id uuid;
begin
  select * into m from trrc_guest.storage_measure();
  select coalesce(sum(e.bytes), 0) into month_bytes from trrc_guest.egress e where e.reserved_at >= (date_trunc('month', t at time zone 'UTC') at time zone 'UTC');
  insert into trrc_guest.platform_proofs (source, attested_at, expires_at, storage_limit_bytes, storage_remaining_bytes, project_storage_bytes,
    database_limit_bytes, database_remaining_bytes, project_database_bytes, egress_limit_bytes, egress_remaining_bytes, attested_by)
  values ('operator_attested', t, t + interval '600 seconds', 1000000000, greatest(1000000000 - m.project_bytes, 0), least(m.project_bytes, 1000000000),
    500000000, greatest(500000000 - db, 0), least(db, 500000000), 5000000000, greatest(5000000000 - month_bytes - 2000000000, 0), 'pg_cron:trrc_guest_attest')
  returning proof_id into id;
  delete from trrc_guest.platform_proofs where expires_at < t - interval '1 day';
  return id;
end $$;
revoke all on function trrc_guest.attest_platform() from public, anon, authenticated, service_role;

create or replace function trrc_guest.referenced(p_key text) returns boolean language sql stable set search_path = '' as $$
  select exists (select 1 from trrc_guest.evidence where object_key = p_key) or exists (select 1 from trrc_guest.staged where object_key = p_key)
      or exists (select 1 from trrc_guest.reservations where object_key = p_key) or exists (select 1 from trrc_guest.publications where archive_object_key = p_key)
$$;
revoke execute on function trrc_guest.referenced(text) from public, anon, authenticated;
-- Settled: terminal for at least one hour as well as past retention.
create or replace function trrc_guest.candidates() returns setof text language sql stable set search_path = '' as $$
  with refs as (
    select e.object_key, j from trrc_guest.evidence e join trrc_guest.jobs j using (job_id)
    union all select s.object_key, j from trrc_guest.staged s join trrc_guest.jobs j using (job_id)
    union all select r.object_key, j from trrc_guest.reservations r join trrc_guest.jobs j using (job_id)
    union all select p.archive_object_key, j from trrc_guest.publications p join trrc_guest.jobs j using (job_id))
  select object_key from refs group by object_key
  having bool_and(coalesce((j).terminal_at is not null and (j).terminal_at <= now() - interval '1 hour' and now() >= trrc_guest.expires_at(j), false))
  order by object_key collate "C"
$$;
-- Aged unreferenced guest objects, plus stale tombstones whose object is already gone and
-- which nothing references (a sweep holder died after deleting, before confirming). Only
-- one maintenance lease holder exists, so such a tombstone belongs to no live sweep.
create function public.trrc_guest_orphan_candidates(args jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare k text; selected text[] := '{}';
begin
  perform trrc_guest.maintained(args -> 'lease');
  for k in select c.name from (
      select o.name from storage.objects o where o.bucket_id = 'trrc-guest-evidence' and o.name ~ '^sha256/[a-f0-9]{64}$'
        and o.created_at <= clock_timestamp() - interval '1 hour' and not trrc_guest.referenced(o.name)
      union
      select t.object_key from trrc_guest.tombstones t where not trrc_guest.referenced(t.object_key)
        and not exists (select 1 from storage.objects o where o.bucket_id = 'trrc-guest-evidence' and o.name = t.object_key)) c(name)
      order by c.name collate "C" limit 200 loop
    perform pg_advisory_xact_lock(hashtextextended(k, 0));
    if not trrc_guest.referenced(k) then insert into trrc_guest.tombstones (object_key) values (k) on conflict do nothing; selected := selected || k; end if;
  end loop;
  return to_jsonb(selected);
end $$;
-- Like confirm_cleanup, rechecks the lease clock before writing and releases the
-- maintenance lease so the next sweep can claim it.
create function public.trrc_guest_confirm_orphans(args jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare keys text[]; k text;
begin
  perform trrc_guest.maintained(args -> 'lease');
  if jsonb_typeof(args -> 'keys') is distinct from 'array' then raise exception 'REQUEST_INVALID: Orphan keys required'; end if;
  select coalesce(array_agg(value order by value collate "C"), '{}') into keys from jsonb_array_elements_text(args -> 'keys');
  foreach k in array keys loop
    perform pg_advisory_xact_lock(hashtextextended(k, 0));
    if k !~ '^sha256/[a-f0-9]{64}$' or not exists (select 1 from trrc_guest.tombstones where object_key = k) or trrc_guest.referenced(k) then
      raise exception 'CLEANUP_CONFLICT: Orphan references changed; nothing was released'; end if;
  end loop;
  perform trrc_guest.maintenance_clock();
  delete from trrc_guest.tombstones where object_key = any(keys);
  update trrc_guest.maintenance set lease_owner = null, lease_expires_at = null;
  return jsonb_build_object('removed', cardinality(keys));
end $$;
revoke all on function public.trrc_guest_orphan_candidates(jsonb), public.trrc_guest_confirm_orphans(jsonb) from public, anon, authenticated;
grant execute on function public.trrc_guest_orphan_candidates(jsonb), public.trrc_guest_confirm_orphans(jsonb) to service_role;
-- Scheduling happens only if the pg_cron extension is ENABLED before this migration runs
-- (Supabase: Database > Extensions). Otherwise a warning names the command to run after
-- enabling it. The disposable gate has no pg_cron and calls attest_platform() directly.
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('trrc_guest_attest', '*/5 * * * *', 'select trrc_guest.attest_platform()');
  else
    raise warning 'pg_cron extension absent; trrc_guest_attest NOT scheduled — run: select cron.schedule(''trrc_guest_attest'',''*/5 * * * *'',''select trrc_guest.attest_platform()'')';
  end if;
end $$;
commit;
