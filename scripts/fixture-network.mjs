// ZC-05: canned, no-network RRC responses for the local /api/collect fixture path (tests and
// scripts/collect-fixture.mjs). Every response is a preserved repository file: raw/ for the
// inventory/monthly/document sources and the test-report/wellbore fixture data files for the v5
// relation targets (read as data, never imported). Routed by exact host + path, like the Phase 3
// fixture network; nothing here is a public observation and no network is used.
import {readFile} from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const raw=name=>readFile(new URL('raw/'+name,root));
const tests=name=>readFile(new URL('test/fixtures/test-reports/'+name,root));
const wellbore=name=>readFile(new URL('test/fixtures/wellbore/'+name,root));

// The fixture lookup selects inventory row 0 of raw/candidate-inventory.json by its API number.
export const FIXTURE_LOOKUP=Object.freeze({kind:'api',value:'38910201'});
export const FIXTURE_MONTHS=Object.freeze({startMonth:'2024-01',endMonth:'2026-04'});

const ROUTES={
 'data.texas.gov/resource/qq2j-f2zm.json':()=>raw('candidate-monthly.json'),
 'data.texas.gov/resource/qxfy-wcfs.json':()=>tests('candidate-bhp.json'),
 'data.texas.gov/resource/h54t-xnbi.json':()=>tests('candidate-srt.json'),
 'data.texas.gov/resource/u9m4-xnh6.json':()=>wellbore('candidate-casing.json'),
 'data.texas.gov/resource/wfzn-9fje.json':()=>wellbore('synthetic-plugging.json'),
 'data.texas.gov/api/views/givw-z9t4.json':()=>raw('inventory-metadata.json'),
 'data.texas.gov/api/views/qq2j-f2zm.json':()=>raw('monthly-metadata.json'),
 'data.texas.gov/api/views/qxfy-wcfs.json':()=>tests('bhp-metadata.json'),
 'data.texas.gov/api/views/h54t-xnbi.json':()=>tests('srt-metadata.json'),
 'data.texas.gov/api/views/u9m4-xnh6.json':()=>wellbore('casing-metadata.json'),
 'data.texas.gov/api/views/wfzn-9fje.json':()=>wellbore('plugging-metadata.json'),
 'www.rrc.texas.gov/media/v3onmigl/uic_manual_uia010_3116.pdf':()=>raw('uic-manual.pdf'),
 'www.rrc.texas.gov/oil-and-gas/applications-and-permits/injection-storage-permits/resources/':()=>raw('rrc-resources.html'),
 'webapps2.rrc.texas.gov/EWA/help/UICGeneralHowTo.html':()=>raw('uic-query-help.html'),
 'www.rrc.texas.gov/oil-and-gas/applications-and-permits/injection-storage-permits/oil-and-gas-waste-disposal/injection-disposal-permit-procedures/technical-review/step-rate-test-guidelines/':()=>tests('srt-guidelines.html'),
 'www.rrc.texas.gov/media/sm5bzzpg/nto-disposal-well-monitoring-reporting-requirements-in-the-permian-basin-12-19-2023.pdf':()=>tests('bhp-permian-nto.pdf'),
 'www.rrc.texas.gov/media/cx2i4xrm/wba091_well-bore-database.pdf':()=>wellbore('wellbore-wba091.pdf'),
 'www.rrc.texas.gov/media/sdbph42m/w-2-0114.pdf':()=>wellbore('form-w2.pdf'),
 'www.rrc.texas.gov/media/lw0bmny4/w-3p.pdf':()=>wellbore('form-w3.pdf'),
};

// fail: a pathname substring (e.g. 'qq2j-f2zm') whose requests answer HTTP 503, which fails the
// collection's load stage with HTTP_ERROR.
export function fixtureNetwork({fail=null}={}){
 return async url=>{
  const u=new URL(url),path=u.hostname+u.pathname;
  if(fail&&u.pathname.includes(fail))return new Response('failed',{status:503});
  // The inventory resource answers both the lookup (api_no=…) and the fresh identity query with row 0.
  if(path==='data.texas.gov/resource/givw-z9t4.json'){
   const inventory=JSON.parse(await raw('candidate-inventory.json'));
   return new Response(JSON.stringify([inventory[0]]));
  }
  const route=ROUTES[path];
  if(!route)return new Response('unknown fixture route',{status:404});
  return new Response(await route());
 };
}
