-- PROPOSED ONLY. Not applied; does not expose private data to browser roles.
-- Apply only with the reviewed hosted authorization/runtime configuration.
begin;
create function public.trrc_archive_snapshot(requested_snapshot_id text)
returns jsonb language sql stable security invoker set search_path = '' as $$
 select jsonb_build_object('snapshot_id',s.snapshot_id,'verified_at',s.verified_at,'manifest',s.manifest)
 from trrc_archive.snapshots s
 where s.snapshot_id=requested_snapshot_id and s.verified_at is not null
$$;
create function public.trrc_archive_chunk(requested_snapshot_id text,requested_hash text)
returns jsonb language sql stable security invoker set search_path = '' as $$
 select jsonb_build_object('sha256',c.sha256,'base64',replace(encode(c.content,'base64'),E'\n',''))
 from trrc_archive.chunks c where c.sha256=requested_hash and exists (
  select 1 from trrc_archive.snapshots s,
  lateral jsonb_array_elements(s.manifest) f,
  lateral jsonb_array_elements_text(f->'chunkHashes') h
  where s.snapshot_id=requested_snapshot_id and s.verified_at is not null and h.value=c.sha256
 )
$$;
revoke execute on function public.trrc_archive_snapshot(text) from public,anon,authenticated;
revoke execute on function public.trrc_archive_chunk(text,text) from public,anon,authenticated;
grant execute on function public.trrc_archive_snapshot(text) to service_role;
grant execute on function public.trrc_archive_chunk(text,text) to service_role;
grant usage on schema trrc_archive to service_role;
grant select on trrc_archive.snapshots,trrc_archive.chunks to service_role;
commit;
