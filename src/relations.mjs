// RRC-15 (Phase 3b; ADR 004 §3): the typed relation catalogue evidence_relations.json.
// Pure: no imports, no I/O. Relations are derived only from the canonical records buildArtifact
// already holds after its projection checks and from the loaded snapshot's sources list; nothing
// is re-joined, re-read, sorted, merged or filtered. Keys are copied verbatim and are resolved
// only against the table their kind names. Wellbore attribution to a UIC is copied from the
// casing/plugging link objects; candidate objects are copied whole, never read field by field.
export const catalogueVersion='rrc-relations-v1';
export const relationTypes=Object.freeze(['inventory_to_h10','inventory_to_test_report','inventory_to_wellbore','wellbore_to_casing','wellbore_to_plugging','record_to_source_snapshot']);
export const relationKeys=Object.freeze(['relation','from_kind','from_key','to_kind','to_key','dataset','basis','status','reason','candidates','evidence']);
export const topLevelKeys=Object.freeze(['schemaVersion','artifactId','catalogue_version','scope','relation_types','not_permitted','status_policy','counts','relations']);
// BEGIN not_permitted: fixed strings listed verbatim (spec §3); the static code scans skip this block.
export const notPermitted=Object.freeze([
 'API → H-10',
 'Wellbore/API → BHP or SRT',
 'Casing or plugging → UIC directly',
 'permit -> document',
 'Spatial / "nearby"',
 'Bottom location uumf-5r4y → anything',
 'Operator, lease or well-name similarity'
]);
// END not_permitted
export const statusPolicy=Object.freeze({
 inventory_to_h10:'parent_join_status reused as is (matched / unmatched / ambiguous)',
 inventory_to_test_report:'parent_join_status of the BHP or SRT row reused as is (matched / unmatched / ambiguous)',
 inventory_to_wellbore:'ADR 004 §2 link status of one wellbore dataset (matched / none / ambiguous); matched asserts string equality only and cannot distinguish sidetracks or recompletions',
 wellbore_to_casing:'matched for every published casing row: the exact-API query string equals the wellbore source_api_id; attribution to a UIC is carried only by inventory_to_wellbore',
 wellbore_to_plugging:'matched for every published plugging row: the exact-API query string equals the wellbore source_api_id; attribution to a UIC is carried only by inventory_to_wellbore',
 record_to_source_snapshot:'null; the record was parsed from the one evidence file named with its full SHA-256',
 needs_review:'reserved; not emitted by catalogue rrc-relations-v1'
});
const invalid=message=>Object.assign(Error(message),{code:'SOURCE_INVALID'});
const edge=(relation,from_kind,from_key,to_kind,to_key,dataset,basis,status,reason,candidates,evidence)=>({relation,from_kind,from_key,to_kind,to_key,dataset,basis,status,reason,candidates,evidence});
// inventory: canonical inventory rows; monthly: canonical H-10 rows; testRows: normalizeTests output
// ({bhp,srt}); wellboreRows: normalizeWellbore output ({casing,plugging} each {link,rows});
// sources: the snapshot's manifest sources list (raw_file, sha256, snapshot_id per loaded file).
export function buildRelations({artifactId,scope,inventory,monthly,testRows,wellboreRows,sources}){
 if(!Array.isArray(inventory)||!Array.isArray(monthly)||!Array.isArray(sources))throw invalid('Relation catalogue inputs are incomplete');
 // Evidence is resolved by source name (one loaded file each), never by snapshot ID: identical
 // bytes in two files share one snapshot ID (candidate-inventory and wellbore-inventory).
 const evidence=name=>{
  const found=sources.filter(source=>source?.name===name);
  if(found.length!==1)throw invalid(`Relation evidence ${name} is not exactly one loaded source`);
  const {raw_file:file,sha256}=found[0];
  if(typeof file!=='string'||!file.startsWith('sources/')||typeof sha256!=='string'||!/^[a-f0-9]{64}$/.test(sha256))throw invalid(`Relation evidence ${name} has no sources/ file and full SHA-256`);
  return {file,sha256,snapshotId:found[0].snapshot_id};
 };
 const ref=item=>({file:item.file,sha256:item.sha256});
 const inventoryFile=evidence('candidate-inventory');
 const tests=testRows?{bhp:testRows.bhp,srt:testRows.srt}:{bhp:[],srt:[]};
 const wellbore=wellboreRows?{casing:wellboreRows.casing,plugging:wellboreRows.plugging}:null;
 const relations=[];
 const parentEdge=(relation,toKind,dataset,row,file)=>{
  const status=row.parent_join_status;
  if(!['matched','unmatched','ambiguous'].includes(status))throw invalid('Unknown parent_join_status');
  const candidates=status==='ambiguous'?inventory.filter(parent=>parent.uic_number===row.uic_number).map(parent=>parent.source_record_key):[];
  relations.push(edge(relation,'inventory_record',status==='matched'?row.parent_key:null,toKind,row.source_row_key,dataset,'exact_uic_string',status,null,candidates,[ref(inventoryFile),ref(file)]));
 };
 // 1. inventory_to_h10: one per normalized monthly row, source order.
 if(monthly.length){const file=evidence('candidate-monthly');for(const row of monthly)parentEdge('inventory_to_h10','h10_row','h10',row,file);}
 // 2. inventory_to_test_report: BHP rows then SRT rows, each in source order.
 for(const kind of ['bhp','srt'])if(tests[kind].length){const file=evidence('candidate-'+kind);for(const row of tests[kind])parentEdge('inventory_to_test_report',kind+'_row',kind,row,file);}
 // 3. inventory_to_wellbore: one per wellbore dataset (casing, plugging), link copied verbatim.
 if(wellbore)for(const dataset of ['casing','plugging']){
  const link=wellbore[dataset].link,queried=link.source_api_id!==null;
  relations.push(edge('inventory_to_wellbore','inventory_record',link.inventory_source_record_key,'wellbore',link.source_api_id,dataset,link.basis,link.status,link.reason,structuredClone(link.candidates),[ref(inventoryFile),...(queried?[ref(evidence('wellbore-inventory')),ref(evidence('candidate-'+dataset))]:[])]));
 }
 // 4. wellbore_to_casing / wellbore_to_plugging: every published row, whatever the link status.
 if(wellbore)for(const dataset of ['casing','plugging'])if(wellbore[dataset].rows.length){
  const file=evidence('candidate-'+dataset);
  for(const row of wellbore[dataset].rows)relations.push(edge('wellbore_to_'+dataset,'wellbore',row.source_api_id,dataset+'_row',row.source_row_key,dataset,'exact_api_string','matched',null,[],[ref(inventoryFile),ref(file)]));
 }
 // 5. record_to_source_snapshot: inventory, H-10, BHP, SRT, casing, plugging records in that order.
 const snapshotEdges=(kind,dataset,name,rows,key)=>{
  if(!rows.length)return;
  const file=evidence(name);
  for(const row of rows){
   if(row.source_snapshot_id!==file.snapshotId)throw invalid(`Record ${row[key]} does not carry the snapshot ID of ${file.file}`);
   relations.push(edge('record_to_source_snapshot',kind,row[key],'source_snapshot',row.source_snapshot_id,dataset,'source_file_hash',null,null,[],[ref(file)]));
  }
 };
 snapshotEdges('inventory_record','inventory','candidate-inventory',inventory,'source_record_key');
 snapshotEdges('h10_row','h10','candidate-monthly',monthly,'source_row_key');
 snapshotEdges('bhp_row','bhp','candidate-bhp',tests.bhp,'source_row_key');
 snapshotEdges('srt_row','srt','candidate-srt',tests.srt,'source_row_key');
 if(wellbore){snapshotEdges('casing_row','casing','candidate-casing',wellbore.casing.rows,'source_row_key');snapshotEdges('plugging_row','plugging','candidate-plugging',wellbore.plugging.rows,'source_row_key');}
 // Counts follow relation_types; statuses in first-seen order. A null status is counted under the
 // JSON key "null" so that total always equals the sum of by_status.
 const counts={};
 for(const type of relationTypes){const by={};let total=0;for(const item of relations)if(item.relation===type){total++;const key=String(item.status);by[key]=(by[key]??0)+1;}counts[type]={total,by_status:by};}
 const subject=wellbore?wellbore.casing.link.inventory_source_record_key:inventory.length===1?inventory[0].source_record_key:null;
 return {schemaVersion:1,artifactId,catalogue_version:catalogueVersion,
  scope:{query_version:scope?.queryVersion??null,inventory_source_record_key:subject,source_api_id:scope?.sourceApiId??null},
  relation_types:[...relationTypes],not_permitted:[...notPermitted],status_policy:{...statusPolicy},counts,relations};
}
