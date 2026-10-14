-- DRAFT ONLY, NOT A MIGRATION. Unexecuted, unreviewed, unapplied. Loads only after
-- docs/sql/trrc-guest-journal-DRAFT-not-applied.sql in an isolated disposable database.
-- No hosted apply, grant, bucket, billing or permission change is authorized.
-- Provisional budgets (design §5): 250,000,000 guest Storage bytes including active job
-- envelopes (100,000,000 collection/replay, 20,000,000 lookup); 50,000,000 guest database
-- bytes; 1,000,000,000 guest egress bytes per UTC month (downloads plus processing);
-- three downloads per session per rolling 24 hours. Platform allowance comes only from a
-- <=600 s operator-attested proof inserted by the database owner; provisional margins
-- (100,000,000 Storage, 500,000,000 egress) do not guarantee headroom. storage.objects
-- metadata is a measurement input, never proof of physical or billed bytes.
begin;
create or replace function trrc_guest.byte_count(v jsonb) returns bigint language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(v) is distinct from 'number' then null
    when (v #>> '{}')::numeric <> trunc((v #>> '{}')::numeric) or (v #>> '{}')::numeric < 0 or (v #>> '{}')::numeric > 9007199254740991 then null
    else ((v #>> '{}')::numeric)::bigint end
$$;
alter table trrc_guest.jobs add column reserved_bytes bigint generated always as (case when kind = 'lookup' then 20000000 else 100000000 end) stored;
create table trrc_guest.platform_proofs (
  proof_id uuid primary key default gen_random_uuid(),
  source text not null check (source = 'operator_attested'),
  attested_at timestamptz not null,
  expires_at timestamptz not null,
  storage_limit_bytes bigint not null check (storage_limit_bytes >= 0),
  storage_remaining_bytes bigint not null check (storage_remaining_bytes >= 0),
  project_storage_bytes bigint not null check (project_storage_bytes >= 0),
  database_limit_bytes bigint not null check (database_limit_bytes >= 0),
  database_remaining_bytes bigint not null check (database_remaining_bytes >= 0),
  project_database_bytes bigint not null check (project_database_bytes >= 0),
  egress_limit_bytes bigint not null check (egress_limit_bytes >= 0),
  egress_remaining_bytes bigint not null check (egress_remaining_bytes >= 0),
  recorded_by name not null default current_user,
  recorded_at timestamptz not null default clock_timestamp(),
  check (expires_at > attested_at and expires_at <= attested_at + interval '600 seconds' and attested_at <= recorded_at),
  -- Platform-reported remaining figures; measured usage may not exceed reported use.
  check (storage_remaining_bytes + project_storage_bytes <= storage_limit_bytes and database_remaining_bytes + project_database_bytes <= database_limit_bytes and egress_remaining_bytes <= egress_limit_bytes)
);
create index platform_proofs_current_idx on trrc_guest.platform_proofs (expires_at, attested_at);
-- Egress accounting has no foreign keys: job/token retention can never erase charges.
create table trrc_guest.egress (
  reservation_id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('download', 'processing')),
  token_hash text check (token_hash ~ '^[a-f0-9]{64}$'),
  job_id uuid,
  bytes bigint not null check (bytes between 0 and 160278528),
  reserved_at timestamptz not null,
  check (kind = 'processing' or (token_hash is not null and job_id is not null and bytes <= 80172032))
);
create index egress_download_idx on trrc_guest.egress (token_hash, reserved_at) where kind = 'download';
create index egress_time_idx on trrc_guest.egress (reserved_at);
alter table trrc_guest.platform_proofs enable row level security;
alter table trrc_guest.egress enable row level security;
revoke all on trrc_guest.platform_proofs, trrc_guest.egress from public, anon, authenticated, service_role;

create function trrc_guest.current_proof(p_now timestamptz) returns trrc_guest.platform_proofs language plpgsql stable set search_path = '' as $$
declare p trrc_guest.platform_proofs;
begin
  select * into p from trrc_guest.platform_proofs where attested_at <= p_now and expires_at > p_now order by attested_at desc, recorded_at desc limit 1;
  if not found then raise exception 'BUDGET_UNVERIFIED: No current attested platform allowance; admission refused'; end if;
  return p;
end $$;
-- All buckets (project growth) and the guest bucket; any unverifiable size fails closed.
create function trrc_guest.storage_measure(out project_bytes bigint, out guest_bytes bigint) language plpgsql stable set search_path = '' as $$
declare bad bigint;
begin
  select count(*) filter (where trrc_guest.byte_count(o.metadata -> 'size') is null), coalesce(sum(trrc_guest.byte_count(o.metadata -> 'size')), 0),
         coalesce(sum(trrc_guest.byte_count(o.metadata -> 'size')) filter (where o.bucket_id = 'trrc-guest-evidence'), 0)
    into bad, project_bytes, guest_bytes from storage.objects o;
  if bad > 0 then raise exception 'BUDGET_UNVERIFIED: Storage size metadata is missing or invalid'; end if;
end $$;
-- Journal-admitted keys not yet visible, plus active job envelopes minus recorded bytes.
create function trrc_guest.storage_unseen() returns bigint language sql stable set search_path = '' as $$
  select (select coalesce(sum(k.bytes), 0) from (
      select refs.object_key, max(refs.bytes) as bytes from (
        select object_key, bytes from trrc_guest.evidence union all select object_key, bytes from trrc_guest.staged
        union all select object_key, bytes from trrc_guest.reservations) refs group by refs.object_key) k
      where not exists (select 1 from storage.objects o where o.bucket_id = 'trrc-guest-evidence' and o.name = k.object_key))
   + (select coalesce(sum(greatest(j.reserved_bytes - j.used_bytes - coalesce(s.bytes, 0) - coalesce(r.bytes, 0), 0)), 0)
      from trrc_guest.jobs j
      left join (select job_id, sum(bytes) as bytes from trrc_guest.staged group by job_id) s using (job_id)
      left join (select job_id, sum(bytes) as bytes from trrc_guest.reservations group by job_id) r using (job_id)
      where j.state in ('queued', 'running', 'retry_wait'))
$$;
create function trrc_guest.database_usage() returns bigint language sql stable set search_path = '' as $$
  select coalesce(sum(pg_catalog.pg_total_relation_size(c.oid)), 0)::bigint from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace where n.nspname = 'trrc_guest' and c.relkind in ('r', 'p', 'm')
$$;
-- The budget lock is always taken last, after enqueue, row and key locks.
create function trrc_guest.require_storage_room() returns void language plpgsql volatile set search_path = '' as $$
declare p trrc_guest.platform_proofs; m record; unseen bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended('trrc_guest.budget', 0));
  p := trrc_guest.current_proof(clock_timestamp());
  select * into m from trrc_guest.storage_measure(); unseen := trrc_guest.storage_unseen();
  if m.guest_bytes + unseen > 250000000 or greatest(m.project_bytes - p.project_storage_bytes, 0) + unseen + 100000000 > p.storage_remaining_bytes then
    raise exception 'STORAGE_QUOTA: Guest storage budget or attested platform room with margin would be exceeded; nothing was evicted'; end if;
end $$;
create function trrc_guest.storage_budget_trigger() returns trigger language plpgsql set search_path = '' as $$
begin perform trrc_guest.require_storage_room(); return null; end $$;
-- New jobs carry their envelope (generated reserved_bytes), so admission reserves the
-- worst case before any fetch or Storage request; per-insert triggers are the backstop.
create function trrc_guest.job_budget_trigger() returns trigger language plpgsql set search_path = '' as $$
declare p trrc_guest.platform_proofs;
begin
  perform pg_advisory_xact_lock(hashtextextended('trrc_guest.budget', 0));
  p := trrc_guest.current_proof(clock_timestamp());
  if trrc_guest.database_usage() > 50000000 or greatest(pg_catalog.pg_database_size(pg_catalog.current_database()) - p.project_database_bytes, 0) > p.database_remaining_bytes then
    raise exception 'DATABASE_QUOTA: Guest database budget or attested platform room would be exceeded'; end if;
  perform trrc_guest.require_storage_room();
  return null;
end $$;
create trigger evidence_storage_budget after insert on trrc_guest.evidence for each statement execute function trrc_guest.storage_budget_trigger();
create trigger staged_storage_budget after insert on trrc_guest.staged for each statement execute function trrc_guest.storage_budget_trigger();
create trigger reservations_storage_budget after insert on trrc_guest.reservations for each statement execute function trrc_guest.storage_budget_trigger();
create trigger jobs_admission_budget after insert on trrc_guest.jobs for each statement execute function trrc_guest.job_budget_trigger();

-- Reserves egress before any Storage request or download read; every call is charged.
create function public.trrc_guest_reserve_egress(args jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare k text := args ->> 'kind'; b bigint := trrc_guest.byte_count(args -> 'bytes'); o text; j trrc_guest.jobs; pub trrc_guest.publications;
  job uuid; t timestamptz; p trrc_guest.platform_proofs; day_count bigint; month_bytes bigint; since_bytes bigint; id uuid;
begin
  if k is null or k not in ('download', 'processing') or b is null or b > 160278528 then raise exception 'REQUEST_INVALID: Egress reservation invalid'; end if;
  if k = 'download' then
    o := trrc_guest.owner(args ->> 'tokenHash');
    select * into j from trrc_guest.jobs where job_id = trrc_guest.as_uuid(args ->> 'jobId') and owner_hash = o;
    if not found then raise exception 'NOT_FOUND: Job unavailable'; end if;
    if j.terminal_at is not null and clock_timestamp() >= trrc_guest.expires_at(j) then raise exception 'EVIDENCE_EXPIRED: Guest evidence has expired and is unavailable'; end if;
    select * into pub from trrc_guest.publications where job_id = j.job_id;
    if not found or j.state <> 'succeeded' then raise exception 'NOT_FOUND: No committed publication'; end if;
    if b <> pub.archive_bytes + 65536 then raise exception 'REQUEST_INVALID: Download reservation must equal the published archive bytes plus request overhead'; end if;
    job := j.job_id;
  elsif nullif(args -> 'jobId', 'null'::jsonb) is not null then
    job := trrc_guest.as_uuid(args ->> 'jobId');
    if job is null or not exists (select 1 from trrc_guest.jobs where job_id = job) then raise exception 'REQUEST_INVALID: Egress reservation invalid'; end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('trrc_guest.egress', 0));
  t := clock_timestamp(); p := trrc_guest.current_proof(t);
  if k = 'download' then
    select count(*) into day_count from trrc_guest.egress where kind = 'download' and token_hash = o and reserved_at > t - interval '1 day';
    if day_count >= 3 then raise exception 'DOWNLOAD_QUOTA: Archive download limit reached for this session'; end if;
  end if;
  select coalesce(sum(bytes), 0) into month_bytes from trrc_guest.egress where reserved_at >= date_trunc('month', t at time zone 'UTC') at time zone 'UTC';
  select coalesce(sum(bytes), 0) into since_bytes from trrc_guest.egress where reserved_at >= p.attested_at;
  if month_bytes + b > 1000000000 or since_bytes + b + 500000000 > p.egress_remaining_bytes then
    raise exception 'EGRESS_QUOTA: Guest egress budget or attested allowance with margin would be exceeded'; end if;
  insert into trrc_guest.egress (kind, token_hash, job_id, bytes, reserved_at) values (k, o, job, b, t) returning reservation_id into id;
  return jsonb_build_object('reservationId', id, 'kind', k, 'bytes', b, 'reservedAt', trrc_guest.iso(t));
end $$;
-- 30-day row retention under the maintenance lease: only terminal jobs whose object rows
-- cleanup already released; tokens only without jobs; egress kept through prior month.
create function public.trrc_guest_purge_retained_rows(args jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare t timestamptz; jobs_removed bigint; tokens_removed bigint; egress_removed bigint;
begin
  perform trrc_guest.maintained(args -> 'lease');
  t := clock_timestamp();
  delete from trrc_guest.jobs j where j.terminal_at < t - interval '30 days'
    and not exists (select 1 from trrc_guest.evidence e where e.job_id = j.job_id) and not exists (select 1 from trrc_guest.staged s where s.job_id = j.job_id)
    and not exists (select 1 from trrc_guest.reservations r where r.job_id = j.job_id) and not exists (select 1 from trrc_guest.publications p where p.job_id = j.job_id);
  get diagnostics jobs_removed = row_count;
  delete from trrc_guest.tokens tk where tk.expires_at < t - interval '30 days' and not exists (select 1 from trrc_guest.jobs j where j.owner_hash = tk.token_hash);
  get diagnostics tokens_removed = row_count;
  delete from trrc_guest.egress where reserved_at < (date_trunc('month', t at time zone 'UTC') - interval '1 month') at time zone 'UTC';
  get diagnostics egress_removed = row_count;
  return jsonb_build_object('jobs', jobs_removed, 'tokens', tokens_removed, 'egress', egress_removed);
end $$;
revoke execute on all functions in schema trrc_guest from public, anon, authenticated;
revoke execute on function public.trrc_guest_reserve_egress(jsonb), public.trrc_guest_purge_retained_rows(jsonb) from public, anon, authenticated;
grant execute on function public.trrc_guest_reserve_egress(jsonb), public.trrc_guest_purge_retained_rows(jsonb) to service_role;
-- Operator attestation (database owner only, from platform-reported remaining figures):
-- insert into trrc_guest.platform_proofs (source, attested_at, expires_at, storage_limit_bytes, storage_remaining_bytes, project_storage_bytes,
--   database_limit_bytes, database_remaining_bytes, project_database_bytes, egress_limit_bytes, egress_remaining_bytes)
-- values ('operator_attested', now(), now() + interval '10 minutes', <limit>, <remaining>, (select project_bytes from trrc_guest.storage_measure()),
--   <limit>, <remaining>, pg_database_size(current_database()), <limit>, <remaining>);
commit;
