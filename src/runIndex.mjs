// ZC-02: optional Postgres index of collection runs and dataset versions.
// The files under runs/ and artifacts/ stay the source of truth; the index is rebuilt from them at startup and after every
// collection, so it can be dropped at any time. Without DATABASE_URL nothing here runs and `pg` is never imported.
export const RUN_INDEX_SCHEMA=`
create table if not exists explorer_runs(
 run_id uuid primary key,
 mode text not null,
 status text not null,
 started_at timestamptz not null,
 ended_at timestamptz,
 artifact_id text,
 indexed_at timestamptz not null default now()
);
create table if not exists explorer_versions(
 artifact_id text primary key,
 run_id uuid,
 classification text not null,
 default_pinned boolean not null,
 publication_pins_sha256 text,
 collected_at timestamptz,
 indexed_at timestamptz not null default now()
);`;

const UPSERT_RUN=`insert into explorer_runs(run_id,mode,status,started_at,ended_at,artifact_id,indexed_at) values($1,$2,$3,$4,$5,$6,now())
 on conflict(run_id) do update set mode=excluded.mode,status=excluded.status,started_at=excluded.started_at,ended_at=excluded.ended_at,artifact_id=excluded.artifact_id,indexed_at=now()`;
const UPSERT_VERSION=`insert into explorer_versions(artifact_id,run_id,classification,default_pinned,publication_pins_sha256,collected_at,indexed_at) values($1,$2,$3,$4,$5,$6,now())
 on conflict(artifact_id) do update set run_id=excluded.run_id,classification=excluded.classification,default_pinned=excluded.default_pinned,publication_pins_sha256=excluded.publication_pins_sha256,collected_at=excluded.collected_at,indexed_at=now()`;

// pool: anything with query(text, values) and connect() returning a client with query()/release() (a pg.Pool, or a fake in tests).
export function createRunIndex({pool}){
 let ready=null,lastError=null;
 const migrate=()=>ready??=pool.query(RUN_INDEX_SCHEMA).catch(error=>{ready=null;throw error;});
 return {
  async sync({runs,versions}){
   await migrate();
   const client=await pool.connect();
   try{
    await client.query('begin');
    for(const run of runs)await client.query(UPSERT_RUN,[run.runId,run.mode,run.status,run.startedAt,run.endedAt??null,run.artifactId??null]);
    for(const version of versions)await client.query(UPSERT_VERSION,[version.artifactId,version.runId??null,version.classification,Boolean(version.defaultPinned),version.publicationPinsSha256??null,version.startedAt??null]);
    await client.query('commit');lastError=null;
   }catch(error){await client.query('rollback').catch(()=>{});lastError=error.code??'SYNC_FAILED';throw error;}
   finally{client.release();}
  },
  // Counts only; no row content leaves the database through the health route.
  async status(){
   try{
    await migrate();
    const {rows:[row]}=await pool.query('select (select count(*) from explorer_runs)::int as runs,(select count(*) from explorer_versions)::int as versions,greatest((select max(indexed_at) from explorer_runs),(select max(indexed_at) from explorer_versions)) as indexed_at');
    return {status:lastError?'degraded':'ok',runs:row.runs,versions:row.versions,indexedAt:row.indexed_at?new Date(row.indexed_at).toISOString():null,...(lastError?{lastError}:{})};
   }catch(error){return {status:'error',code:error.code??'UNAVAILABLE'};}
  },
  close:()=>pool.end?.(),
 };
}

export async function connectRunIndex({connectionString}){
 const {default:pg}=await import('pg');
 return createRunIndex({pool:new pg.Pool({connectionString,max:4,connectionTimeoutMillis:5000})});
}
