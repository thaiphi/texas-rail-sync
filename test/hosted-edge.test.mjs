import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHostedEdgeHandler,HOSTED_SNAPSHOT_ID} from '../src/hosted/edge-bootstrap.mjs';
import {archiveSha256,ARCHIVE_CHUNK_BYTES} from '../src/hosted/archive-store.mjs';
const root=new URL('../',import.meta.url),endpoint='https://project.supabase.co',secret='sb_secret_test_private',publishable='sb_publishable_test_public',token='header.payload.signature';
const env={SUPABASE_URL:endpoint,SUPABASE_SECRET_KEYS:JSON.stringify({default:secret}),SUPABASE_PUBLISHABLE_KEYS:JSON.stringify({default:publishable})};
const user={id:'12345678-1234-1234-1234-123456789abc',role:'authenticated',is_anonymous:false};
const request=(path,options={})=>new Request('https://edge.example/functions/v1/trrc-explorer'+path,options);
const post=(path='/api/collect',authorization)=>request(path,{method:'POST',headers:authorization?{authorization}:undefined,body:'{}'});
const json=response=>response.json();
async function fixture(){
 const files=new Map([['public/artifact-integrity.json',await readFile(new URL('public/artifact-integrity.json',root))]]),chunks=new Map(),manifest=[];
 for(const [path,bytes] of files){const chunkHashes=[];for(let offset=0;offset<bytes.length;offset+=ARCHIVE_CHUNK_BYTES){const chunk=bytes.slice(offset,offset+ARCHIVE_CHUNK_BYTES),sha256=await archiveSha256(chunk);chunkHashes.push(sha256);chunks.set(sha256,chunk);}manifest.push({path,sha256:await archiveSha256(bytes),byteCount:bytes.length,chunkCount:chunkHashes.length,chunkHashes});}
 return {snapshot:{snapshotId:HOSTED_SNAPSHOT_ID,verifiedAt:'2026-10-11T05:22:55Z',manifest},readChunk:async hash=>chunks.get(hash),files};
}
function options(overrides={}){return {getEnv:name=>env[name],fetchImpl:async()=>{throw Error('Unexpected network call');},...overrides};}
async function safe(response,status){
 assert.equal(response.status,status);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('x-content-type-options'),'nosniff');
 const text=await response.text();for(const value of [secret,publishable,token,'upstream private detail'])assert.equal(text.includes(value),false);return text?JSON.parse(text):null;
}

test('public GET/HEAD composes pinned archive transport and strips only exact function prefix',async()=>{
 const data=await fixture(),seen=[];let chunks=0;
 const handler=createHostedEdgeHandler(options({createTransport:config=>{seen.push(config);return {loadSnapshot:async()=>data.snapshot,readChunk:async hash=>{chunks++;return data.readChunk(hash);}};}}));
 const result=await handler(request('/artifact-integrity.json?download=1'));
 assert.equal(result.status,200);assert.deepEqual(await result.json(),JSON.parse(data.files.get('public/artifact-integrity.json')));
 const head=await handler(request('/artifact-integrity.json',{method:'HEAD'}));assert.equal(head.status,200);assert.equal(await head.text(),'');assert.ok(Number(head.headers.get('content-length'))>0);
 assert.equal(seen.length,1);assert.equal(seen[0].snapshotId,HOSTED_SNAPSHOT_ID);assert.equal(seen[0].url,endpoint);assert.equal(seen[0].secretKey,secret);assert.equal(chunks,2,'chunks are read per request, not memoized');
 assert.equal((await handler(new Request('https://edge.example/functions/v1/trrc-explorer-extra/artifact-integrity.json'))).status,404);
 assert.equal((await handler(new Request('https://edge.example/trrc-explorer-extra/artifact-integrity.json'))).status,404);
 assert.equal((await handler(new Request('https://edge.example/artifact-integrity.json'))).status,200);
});
test('simultaneous public requests share one pending initialization',async()=>{
 const data=await fixture();let release,initializations=0,loads=0;
 const pending=new Promise(resolve=>{release=resolve;});
 const handler=createHostedEdgeHandler(options({createTransport:()=>{initializations++;return {loadSnapshot:async()=>{loads++;await pending;return data.snapshot;},readChunk:data.readChunk};}}));
 const responses=Array.from({length:5},()=>handler(request('/artifact-integrity.json')));
 await new Promise(setImmediate);assert.equal(initializations,1);assert.equal(loads,1);release();
 assert.ok((await Promise.all(responses)).every(response=>response.status===200));
});
test('rejected initialization is secret-safe and resets for a later retry',async()=>{
 const data=await fixture();let attempts=0;
 const handler=createHostedEdgeHandler(options({createTransport:()=>({loadSnapshot:async()=>{if(++attempts===1)throw Error(secret+' upstream private detail');return data.snapshot;},readChunk:data.readChunk})}));
 const failures=await Promise.all([handler(request('/artifact-integrity.json')),handler(request('/artifact-integrity.json'))]);
 for(const result of failures)await safe(result,503);assert.equal(attempts,1);
 assert.equal((await handler(request('/artifact-integrity.json'))).status,200);assert.equal(attempts,2);
});
test('missing/malformed environment fails closed with no legacy secret fallback and supports retry',async()=>{
 const data=await fixture();let config={...env},constructs=0;
 const handler=createHostedEdgeHandler(options({getEnv:name=>config[name],createTransport:()=>{constructs++;return {loadSnapshot:async()=>data.snapshot,readChunk:data.readChunk};}}));
 for(const edit of [{SUPABASE_URL:undefined},{SUPABASE_URL:'http://project.supabase.co'},{SUPABASE_URL:endpoint+'/secret-path'},{SUPABASE_SECRET_KEYS:undefined,SUPABASE_SERVICE_ROLE_KEY:secret},{SUPABASE_SECRET_KEYS:secret},{SUPABASE_SECRET_KEYS:'[]'},{SUPABASE_SECRET_KEYS:JSON.stringify({default:'legacy.jwt.key'})}]){
  config={...env,...edit};assert.equal((await safe(await handler(request('/artifact-integrity.json')),503)).error.code,'EVIDENCE_UNAVAILABLE');
 }
 assert.equal(constructs,0);config={...env};assert.equal((await handler(request('/artifact-integrity.json'))).status,200);assert.equal(constructs,1);
});
test('snapshot identity mismatch never exposes evidence or transport errors',async()=>{
 const data=await fixture();let reads=0;
 const handler=createHostedEdgeHandler(options({createTransport:()=>({loadSnapshot:async()=>({...data.snapshot,snapshotId:'trrc-'+'0'.repeat(64)}),readChunk:async()=>{reads++;}})}));
 await safe(await handler(request('/artifact-integrity.json')),503);assert.equal(reads,0);
 const upstream=createHostedEdgeHandler(options({fetchImpl:async()=>new Response(secret+' upstream private detail',{status:500})}));
 await safe(await upstream(request('/artifact-integrity.json')),503);
});
test('unauthenticated or malformed collection requests reject before environment or archive initialization',async()=>{
 let calls=0;
 const handler=createHostedEdgeHandler({getEnv:()=>{calls++;throw Error(secret);},fetchImpl:async()=>{calls++;throw Error(secret);},createTransport:()=>{calls++;throw Error(secret);}});
 for(const path of ['/api/lookup','/api/collect'])for(const auth of [undefined,'Bearer '+secret,'Bearer '+publishable,'Basic '+token,'Bearer malformed','Bearer '+('a'.repeat(8193))]){
  assert.equal((await safe(await handler(post(path,auth)),401)).error.code,'AUTH_REQUIRED');
 }
 assert.equal(calls,0);
 for(const method of ['PUT','DELETE','PATCH','OPTIONS'])assert.equal((await handler(request('/api/collect',{method}))).status,405);assert.equal(calls,0);
});
test('gateway short prefix sends collection requests through auth before archive initialization',async()=>{
 let calls=0;
 const handler=createHostedEdgeHandler({getEnv:()=>{calls++;throw Error(secret);},fetchImpl:async()=>{calls++;throw Error(secret);},createTransport:()=>{calls++;throw Error(secret);}});
 for(const prefix of ['/functions/v1/trrc-explorer','/trrc-explorer',''])for(const path of ['/api/lookup','/api/collect']){
  const response=await handler(new Request('https://edge.example'+prefix+path,{method:'POST',body:'{}'}));
  assert.equal((await safe(response,401)).error.code,'AUTH_REQUIRED');
 }
 assert.equal(calls,0);
});
test('user validation uses only publishable key plus user Bearer token, then reports collection unavailable',async()=>{
 const seen=[];let initialized=0;
 const handler=createHostedEdgeHandler(options({fetchImpl:async(url,init)=>{seen.push({url,init});return Response.json(user);},createTransport:()=>{initialized++;throw Error('Archive must not initialize for collection');}}));
 for(const path of ['/api/lookup','/api/collect'])assert.equal((await safe(await handler(post(path,'Bearer '+token)),503)).error.code,'HOSTED_COLLECTION_UNAVAILABLE');
 assert.equal(initialized,0);assert.equal(seen.length,2);
 for(const {url,init} of seen){assert.equal(url,endpoint+'/auth/v1/user');assert.equal(init.method,'GET');assert.equal(init.redirect,'error');assert.equal(init.headers.apikey,publishable);assert.equal(init.headers.authorization,'Bearer '+token);assert.equal(JSON.stringify(init).includes(secret),false);assert.ok(init.signal instanceof AbortSignal);}
});
test('auth rejects anonymous/service/non-user/error responses and missing auth configuration',async()=>{
 const replies=[()=>new Response(secret,{status:401}),()=>Response.json({...user,is_anonymous:true}),()=>Response.json({...user,is_anonymous:undefined}),()=>Response.json({...user,role:'service_role'}),()=>Response.json({...user,id:'invalid'}),()=>Response.json({user}),()=>new Response('{'),()=>{throw Error(secret+' upstream private detail');}];
 for(const reply of replies){const handler=createHostedEdgeHandler(options({fetchImpl:async()=>reply()}));assert.equal((await safe(await handler(post('/api/collect','Bearer '+token)),401)).error.code,'AUTH_REQUIRED');}
 for(const edit of [{SUPABASE_PUBLISHABLE_KEYS:undefined},{SUPABASE_PUBLISHABLE_KEYS:JSON.stringify({default:secret})},{SUPABASE_URL:'http://project.supabase.co'}]){let calls=0;const handler=createHostedEdgeHandler(options({getEnv:name=>({...env,...edit})[name],fetchImpl:async()=>{calls++;return Response.json(user);}}));await safe(await handler(post('/api/collect','Bearer '+token)),401);assert.equal(calls,0);}
});
test('oversized auth response, including streaming without a length header, is refused',async()=>{
 for(const fetchImpl of [async()=>new Response('{}',{headers:{'content-length':'65537'}}),async()=>new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array(40000));controller.enqueue(new Uint8Array(40000));controller.close();}}))]){
  const handler=createHostedEdgeHandler(options({fetchImpl}));await safe(await handler(post('/api/collect','Bearer '+token)),401);
 }
});
test('real module composition preserves all archived public versions and 29 actual run summaries',async()=>{
 const paths=['public/artifact-path.json','public/artifact-integrity.json'];
 for(const entry of await readdir(new URL('artifacts/',root),{withFileTypes:true}))if(entry.isDirectory())for(const name of ['manifest.json','normalized.json','version-pins.json']){try{await readFile(new URL(`artifacts/${entry.name}/${name}`,root));paths.push(`artifacts/${entry.name}/${name}`);}catch(error){if(error.code!=='ENOENT')throw error;}}
 for(const entry of await readdir(new URL('runs/',root),{withFileTypes:true}))if(entry.isDirectory())paths.push(`runs/${entry.name}/record.json`);
 const manifest=[],chunks=new Map();
 for(const path of paths){const bytes=await readFile(new URL(path,root)),chunkHashes=[];for(let offset=0;offset<bytes.length;offset+=ARCHIVE_CHUNK_BYTES){const chunk=bytes.slice(offset,offset+ARCHIVE_CHUNK_BYTES),hash=await archiveSha256(chunk);chunkHashes.push(hash);chunks.set(hash,chunk);}manifest.push({path,sha256:await archiveSha256(bytes),byteCount:bytes.length,chunkCount:chunkHashes.length,chunkHashes});}
 const handler=createHostedEdgeHandler(options({createTransport:()=>({loadSnapshot:async()=>({snapshotId:HOSTED_SNAPSHOT_ID,verifiedAt:'2026-10-11T05:22:55Z',manifest}),readChunk:async hash=>chunks.get(hash)})}));
 for(const prefix of ['/functions/v1/trrc-explorer','/trrc-explorer','']){
  const versionResponse=await handler(new Request('https://edge.example'+prefix+'/api/versions'));
  assert.equal(versionResponse.status,200,prefix||'canonical route');
  const versions=await json(versionResponse),runs=await json(await handler(new Request('https://edge.example'+prefix+'/api/runs')));
  assert.equal(versions.versions.length,3);assert.equal(versions.versions.filter(version=>version.defaultPinned).length,1);assert.equal(runs.runs.length,29);assert.equal(runs.unavailableRecords,0);
 }
});
