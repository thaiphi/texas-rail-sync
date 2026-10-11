// Browser-only, session-only transfer of an existing complete version. Receiver
// validation and explicit confirmation remain separate from successful delivery.
export const EXPLORER_ORIGIN='http://127.0.0.1:4391';
export const ANALYTICS_ORIGIN='http://127.0.0.1:4290';
export const MAX_PACKAGE_BYTES=80_106_496;
const CHANNEL='swd-explorer-handoff',UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i,HASH=/^[a-f0-9]{64}$/,ID=/^[a-z0-9][a-z0-9._-]{0,127}$/i;
const terminal=new Set(['adopted','rejected','cancelled']);
const error=(code,message)=>Object.assign(Error(message),{code});
function inputScope(artifact,pins){
 if(!pins||pins.classification!=='public_reported'||typeof pins.artifactId!=='string'||!ID.test(pins.artifactId)||![pins.manifestSha256,pins.normalizedSha256].every(value=>typeof value==='string'&&HASH.test(value)))throw error('INVALID_VERSION','A verified public dataset version is required.');
 if(artifact?.artifactId!==pins.artifactId||artifact.manifest?.artifact_id!==pins.artifactId||artifact.manifest.testFixture===true||artifact.manifest.provenance?.classification==='test_fixture'||(!pins.defaultPinned&&artifact.manifest.provenance?.classification!=='public_reported'))throw error('INVALID_VERSION','Dataset identity or public provenance does not match its verified version.');
 if(!Array.isArray(artifact.inventory)||!Array.isArray(artifact.injectionMonthly)||artifact.inventory.length>1000||artifact.injectionMonthly.length>1000)throw error('INVALID_SCOPE','Dataset scope is unavailable or exceeds the supported bounds.');
 const uics=rows=>{const values=[];for(let i=0;i<rows.length;i++){const row=rows[i];if(!Object.hasOwn(rows,i)||!row||typeof row!=='object'||Array.isArray(row)||![Object.prototype,null].includes(Object.getPrototypeOf(row))||!Object.hasOwn(row,'uic_number')||typeof row.uic_number!=='string'||!/^\d{9}$/.test(row.uic_number))throw error('INVALID_SCOPE','Dataset well records or identifiers are unavailable.');values.push(row.uic_number);}return [...new Set(values)].sort();};
 const inventoryUics=uics(artifact.inventory),historyUics=uics(artifact.injectionMonthly),periods=artifact.injectionMonthly.map(row=>row?.period_start);
 if(periods.some(value=>typeof value!=='string'||!/^\d{4}-(0[1-9]|1[0-2])-01$/.test(value)||Number(value.slice(0,4))===0||Number.isNaN(Date.parse(value))))throw error('INVALID_SCOPE','Actual monthly reporting coverage is unavailable.');
 periods.sort();return {kind:'whole-version',inventoryUics,historyUics,periodStart:periods[0]??null,periodEnd:periods.at(-1)??null};
}
function validMessage(data,type){
 const allowed={ready:[], 'request-package':[],status:['state','code','message']};
 if(!Object.hasOwn(allowed,type))return false;
 const keys=new Set(['channel','version','type','transferId','receiverId',...allowed[type]]);
 if(Object.keys(data).some(key=>!keys.has(key)))return false;
 if(type==='status'&&!['receiving','validating','previewed','adopted','rejected','cancelled'].includes(data.state))return false;
 return (data.code===undefined||(typeof data.code==='string'&&/^[A-Z0-9_]{1,64}$/.test(data.code)))&&(data.message===undefined||(typeof data.message==='string'&&data.message.length<=500));
}
export function createAnalyticsHandoff({window,fetchImpl=window.fetch.bind(window),cryptoImpl=window.crypto,onState=()=>{},timers=window}={}){
 let active=null,current={state:'idle'},destroyed=false;
 const emit=(run,state,code,message)=>{current={state,...(run?{artifactId:run.artifactId,transferId:run.transferId}:{}),...(code?{code}:{}),...(message?{message}: {})};try{onState({...current});}catch{/* UI callbacks cannot weaken transport cleanup. */}};
 const clear=(run,key)=>{if(run[key]!==undefined){timers.clearTimeout(run[key]);delete run[key];}};
 const post=(run,type,fields={},transfers)=>run.target.postMessage({channel:CHANNEL,version:1,type,transferId:run.transferId,receiverId:run.receiverId,...fields},ANALYTICS_ORIGIN,transfers);
 function finish(run,state,code,message,notify=true){
  if(active!==run)return;
  if(notify&&run.receiverId&&state!=='adopted'){try{post(run,'cancel',{code:code??'CANCELLED',message:message??'Transfer cancelled.'});}catch{/* The target may already be closed. */}}
  active=null;run.abort.abort();for(const key of ['readyTimer','prepareTimer','requestTimer','deliveryTimer','validationTimer'])clear(run,key);timers.clearInterval(run.closedTimer);window.removeEventListener('message',run.listener);run.bytes=null;emit(run,state,code,message);
 }
 const deadline=(run,key,ms,code,message)=>{clear(run,key);run[key]=timers.setTimeout(()=>finish(run,'rejected',code,message),ms);};
 function offer(run){
  if(active!==run||!run.bytes||!run.receiverId||run.offered)return;
  run.offered=true;try{post(run,'offer',{artifactId:run.artifactId,packageBytes:run.bytes.byteLength,hashes:run.hashes,scope:run.scope});deadline(run,'requestTimer',30_000,'REQUEST_TIMEOUT','Analytics did not request the offered package. Use the file download or start a fresh transfer.');emit(run,'waiting',undefined,'Analytics is ready. Waiting for its package request.');}catch{finish(run,'rejected','TARGET_UNAVAILABLE','Analytics could not receive the transfer.');}
 }
 function receive(run,event){
  if(active!==run||event.origin!==ANALYTICS_ORIGIN||event.source!==run.target)return;
  const data=event.data;
  if(!data||typeof data!=='object'||Array.isArray(data)||data.channel!==CHANNEL||data.version!==1||data.transferId!==run.transferId){finish(run,'rejected','INVALID_MESSAGE','Analytics sent an invalid transfer envelope.');return;}
  if(typeof data.receiverId!=='string'||!UUID.test(data.receiverId)||typeof data.type!=='string'||!validMessage(data,data.type)){finish(run,'rejected','INVALID_MESSAGE','Analytics sent an invalid transfer message.');return;}
  if(run.receiverId&&data.receiverId!==run.receiverId){finish(run,'rejected','RECEIVER_CHANGED','Analytics reloaded or changed. Start a fresh transfer.');return;}
  if(data.type==='ready'){
   if(!run.receiverId){run.receiverId=data.receiverId;clear(run,'readyTimer');}offer(run);return;
  }
  if(!run.receiverId||data.receiverId!==run.receiverId){finish(run,'rejected','INVALID_MESSAGE','Analytics requested data before the handshake.');return;}
  if(data.type==='request-package'){
   if(run.sent)return;
   if(!run.offered||!run.bytes){finish(run,'rejected','INVALID_MESSAGE','Analytics requested an unavailable package.');return;}
   clear(run,'requestTimer');run.sent=true;
   try{const copy=run.bytes.slice(0);post(run,'package',{bytes:copy},[copy]);deadline(run,'deliveryTimer',30_000,'DELIVERY_TIMEOUT','Analytics did not acknowledge the delivered package. Use the file download or try again.');emit(run,'receiving',undefined,'Package sent. Waiting for Analytics validation.');}catch{finish(run,'rejected','TARGET_UNAVAILABLE','Analytics could not receive the package.');}return;
  }
  if(!run.sent){finish(run,'rejected','INVALID_MESSAGE','Analytics reported progress before package delivery.');return;}
  if(data.state==='rejected'||data.state==='cancelled'){finish(run,data.state,data.code,data.message,false);return;}
  const rank={receiving:1,validating:2,previewed:3,adopted:4},next=rank[data.state];
  if(next<=run.progress)return;
  if((data.state==='adopted'&&run.progress!==3)||(data.state==='previewed'&&run.progress<2)){finish(run,'rejected','INVALID_MESSAGE','Analytics reported an invalid confirmation sequence.');return;}
  run.progress=next;clear(run,'deliveryTimer');
  if((data.state==='receiving'||data.state==='validating')&&run.validationTimer===undefined)deadline(run,'validationTimer',60_000,'VALIDATION_TIMEOUT','Analytics validation did not finish. Use the file download or try again.');
  if(data.state==='previewed')clear(run,'validationTimer');
  if(data.state==='adopted')finish(run,'adopted',data.code,data.message,false);else emit(run,data.state,data.code,data.message);
 }
 async function prepare(run){
  try{
   const response=await fetchImpl(`/api/versions/${run.artifactId}/download`,{method:'GET',redirect:'error',credentials:'same-origin',signal:run.abort.signal});
   if(active!==run)return;
   if(!response.ok||response.redirected)throw error('PACKAGE_UNAVAILABLE','The complete dataset package is unavailable. Use the file download after checking this version.');
   const declared=response.headers?.get('content-length');
   if(declared!==null&&declared!==undefined&&(!/^\d+$/.test(declared)||Number(declared)<1024||Number(declared)>MAX_PACKAGE_BYTES))throw error('PACKAGE_SIZE','Dataset package exceeds the supported transport size.');
   let bytes;
   if(response.body?.getReader){
    const reader=response.body.getReader(),chunks=[];let size=0;
    try{while(true){const {done,value}=await reader.read();if(active!==run){await reader.cancel();return;}if(done)break;if(Number.isFinite(value?.byteLength)&&size+value.byteLength>MAX_PACKAGE_BYTES){await reader.cancel();throw error('PACKAGE_SIZE','Dataset package exceeds the supported transport size.');}if(!(value instanceof Uint8Array)){await reader.cancel();throw error('PACKAGE_INVALID','Dataset package stream contains invalid byte chunks.');}size+=value.byteLength;chunks.push(value);}bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}}finally{reader.releaseLock();}
    bytes=bytes.buffer;
   }else bytes=await response.arrayBuffer();
   if(active!==run)return;
   if(!(bytes instanceof ArrayBuffer)||bytes.byteLength<1024||bytes.byteLength>MAX_PACKAGE_BYTES||bytes.byteLength%512!==0||(declared!==null&&declared!==undefined&&Number(declared)!==bytes.byteLength))throw error('PACKAGE_SIZE','Dataset package size or TAR alignment is invalid.');
   const packageSha256=Array.from(new Uint8Array(await cryptoImpl.subtle.digest('SHA-256',bytes)),value=>value.toString(16).padStart(2,'0')).join('');
   if(active!==run)return;
   clear(run,'prepareTimer');run.bytes=bytes;run.hashes.packageSha256=packageSha256;offer(run);
  }catch(cause){if(active===run)finish(run,'rejected',cause.code??'PACKAGE_UNAVAILABLE',cause.code?cause.message:'The complete dataset package could not be loaded. The existing file download remains available.');}
 }
 return {
  get state(){return {...current};},
  start({artifact,pins}={}){
   if(destroyed||active)return false;
   let scope,transferId;
   try{if(window.location?.origin!==EXPLORER_ORIGIN)throw error('UNSUPPORTED_ORIGIN','This transfer is supported only by the configured local Explorer and Analytics apps.');scope=inputScope(artifact,pins);transferId=cryptoImpl.randomUUID();if(!UUID.test(transferId))throw error('INVALID_TRANSFER','A fresh transfer identity is unavailable.');}catch(cause){emit(null,'rejected',cause.code??'INVALID_VERSION',cause.message);return false;}
   let target;try{target=window.open(`${ANALYTICS_ORIGIN}/?rrcHandoff=${transferId}#data/data`,`rrc-analytics-${transferId}`);}catch{/* Popup policy is surfaced below. */}
   if(!target){emit({artifactId:pins.artifactId,transferId},'rejected','POPUP_BLOCKED','Your browser blocked the Analytics window. Allow this popup or use the complete dataset download.');return false;}
   const run={artifactId:pins.artifactId,transferId,target,scope,hashes:{manifestSha256:pins.manifestSha256,normalizedSha256:pins.normalizedSha256},receiverId:null,progress:0,abort:new AbortController()};active=run;run.listener=event=>receive(run,event);window.addEventListener('message',run.listener);
   run.closedTimer=timers.setInterval(()=>{try{if(run.target.closed)finish(run,'cancelled','TARGET_CLOSED','Analytics was closed. Start a fresh transfer when ready.');}catch{finish(run,'rejected','TARGET_UNAVAILABLE','Analytics is unavailable.');}},500);
   deadline(run,'readyTimer',15_000,'READY_TIMEOUT','Analytics did not connect. Open the local Analytics app or use the file download.');deadline(run,'prepareTimer',30_000,'PACKAGE_TIMEOUT','The dataset package did not load in time. Use the file download or try again.');emit(run,'preparing',undefined,'Opening Analytics and loading the complete preserved dataset version.');void prepare(run);return true;
  },
  cancel(){if(active)finish(active,'cancelled','CANCELLED','Pending transfer cancelled. Check Analytics for its current session.');},
  destroy(){if(active)finish(active,'cancelled','CANCELLED','Transfer ended.');destroyed=true;}
 };
}
