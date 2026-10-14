import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {filterInventory} from '../public/presentation.js';
import {escapeHtml,formatNumber} from '../public/inspection.js';
import {createLatestRequest} from '../public/collection.js';
import {clearDatasetEvidence,historyState} from '../public/dataset-state.js';
import {parseRoute,datasetRoute,datasetSummary,localTime,localZone} from '../public/navigation.js';
const root=new URL('../',import.meta.url),original=JSON.parse(await readFile(new URL('artifacts/rrc-2026-10-09-uic000020838-v1/normalized.json',root)));
async function startUI(){
 const nodes=new Map(),element=id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',innerHTML:'',handlers:{},addEventListener(type,handler){this.handlers[type]=handler;},setAttribute(){},removeAttribute(){},appendChild(){},querySelectorAll(){return [];},replaceChildren(){this.textContent='';this.innerHTML='';},insertAdjacentHTML(position,text){this.innerHTML=position==='afterbegin'?text+this.innerHTML:this.innerHTML+text;}});return nodes.get(id);};
 let resolveVersion,hooks;const pins={artifactId:original.artifactId,path:`/artifacts/${original.artifactId}/`,defaultPinned:true};
 const env={document:{getElementById:element,querySelector:element,querySelectorAll:()=>[]},window:{addEventListener(){},matchMedia:()=>({matches:false})},location:{hash:''},fetch:async path=>({ok:true,json:async()=>path==='/artifact-path.json'?{artifact_id:original.artifactId,path:pins.path}:path==='/artifact-integrity.json'?pins:{versions:[pins,{artifactId:'requested-b',path:'/artifacts/requested-b/'}]}}),loadPinnedArtifact:async()=>original,loadVerifiedVersion:()=>new Promise(resolve=>{resolveVersion=resolve;}),mountCollection:options=>{hooks=options;},createLatestRequest,clearDatasetEvidence,historyState,parseRoute,datasetRoute,datasetSummary,localTime,localZone,chart:()=>'',fmt:formatNumber,escape:escapeHtml,mountWorkflow:async()=>({refresh(){}}),facts:JSON.stringify,filterInventory,dispositionRows:()=>[],sourceUrl:()=>null,countText:String};
 env.createAnalyticsHandoff=()=>({start(){},cancel(){},destroy(){}});
 env.document.querySelector=selector=>selector.startsWith('meta[')?null:element(selector);Object.assign(env,{PORTFOLIO_URL:'',createLegacyCollectionApi:()=>({mode:'local'}),createGuestCollectionApi:()=>({mode:'guest'}),createGuestClient:()=>({})});
 const code=(await readFile(new URL('public/app.js',root),'utf8')).replace(/^import .*;\r?\n/gm,''),AsyncFunction=Object.getPrototypeOf(async()=>{}).constructor;await new AsyncFunction(...Object.keys(env),code)(...Object.values(env));
 return {element,refresh:()=>hooks.onVersions(),resolve:()=>{const next=structuredClone(original);next.artifactId='requested-b';next.manifest.artifact_id='requested-b';resolveVersion(next);}};
}
test('registry refresh during version verification preserves explicit selector and committed dataset identity',async()=>{
 const ui=await startUI();ui.element('version-selection').value='requested-b';const pending=ui.element('version-selection').handlers.change();await ui.refresh();assert.equal(ui.element('version-selection').value,'requested-b','pending requested selection survives collection refresh');ui.resolve();await pending;assert.equal(ui.element('snapshot').textContent,'requested-b');assert.equal(ui.element('version-selection').value,'requested-b');await ui.refresh();assert.equal(ui.element('version-selection').value,'requested-b');
});
