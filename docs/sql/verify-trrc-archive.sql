with files as (
 select item->>'path' path,item->>'sha256' expected_hash,(item->>'byteCount')::bigint expected_bytes,item->'chunkHashes' parts
 from trrc_archive.snapshots s cross join lateral jsonb_array_elements(s.manifest) item where snapshot_id='trrc-d6678bd4e24e4d4cd0e224c39c98aa8af9ce543dbd61545c6fa155eeefef6186'
), restored as (
 select f.path,f.expected_hash,f.expected_bytes,jsonb_array_length(f.parts) expected_chunks,
 count(c.sha256) actual_chunks,
 decode(coalesce(string_agg(encode(c.content,'hex'),'' order by p.ordinality),''),'hex') content
 from files f left join lateral jsonb_array_elements_text(f.parts) with ordinality p(hash,ordinality) on true
 left join trrc_archive.chunks c on c.sha256=p.hash
 group by f.path,f.expected_hash,f.expected_bytes,f.parts
), checked as (
 select *,encode(sha256(content),'hex')=expected_hash and octet_length(content)=expected_bytes and expected_chunks=actual_chunks valid from restored
) select path,expected_hash,expected_bytes,actual_chunks,valid from checked order by path;
