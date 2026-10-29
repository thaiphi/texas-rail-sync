export function clearDatasetEvidence(document){
 for(const id of ['analytics-scope','analytics-status']){const node=document.getElementById(id);if(node)node.textContent='';}
 const analyticsButton=document.getElementById('analytics-start');if(analyticsButton)analyticsButton.disabled=true;
 for(const id of ['inventory-count','monthly-count','join-count','inventory-table','well-details','history','record-provenance','downloads','sources','version-details','version-provenance','quarantine','identity','history-label','dataset-scope','filter-count','quality-summary','quality','dictionary','snapshot','well-name','inventory-table-caption','workspace-identity','workspace-period','workspace-version','overview-content','overview-metrics','overview-warning','quality-metrics','quality-checks','source-lineage','quality-download','overview-actions','workspace-run-association','tests-content']){const node=document.getElementById(id);if(node){node.textContent='';if(node.tagName==='A')node.removeAttribute('href');}}
}
export function historyState(artifact,record){
 const count=artifact.injectionMonthly.filter(row=>row.parent_key===record.source_record_key).length;
 return count?`${count} linked reports`:record.uic_number===artifact.manifest.scope.uic_number?'No reports returned':'History not acquired';
}
