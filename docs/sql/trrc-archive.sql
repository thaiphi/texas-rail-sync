create schema trrc_archive;
create table trrc_archive.chunks (
 sha256 text primary key check (sha256 ~ '^[a-f0-9]{64}$'),
 content bytea not null,
 check (octet_length(content) between 1 and 32768),
 check (encode(sha256(content),'hex') = sha256)
);
create table trrc_archive.snapshots (
 snapshot_id text primary key,
 manifest jsonb not null check (jsonb_typeof(manifest)='array'),
 created_at timestamptz not null default now(),
 verified_at timestamptz
);
alter table trrc_archive.chunks enable row level security;
alter table trrc_archive.snapshots enable row level security;
comment on schema trrc_archive is 'Private byte-preserving TRRC migration archive; not the application runtime database.';
