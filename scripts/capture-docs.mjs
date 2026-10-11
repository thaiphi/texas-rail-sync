import {writeFile} from 'node:fs/promises';
for(const [name,url] of [['uic-manual.pdf','https://www.rrc.texas.gov/media/v3onmigl/uic_manual_uia010_3116.pdf'],['rrc-resources.html','https://www.rrc.texas.gov/oil-and-gas/applications-and-permits/injection-storage-permits/resources/'],['uic-query-help.html','https://webapps2.rrc.texas.gov/EWA/help/UICGeneralHowTo.html']]){
 const r=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error(`${name} HTTP ${r.status}`);const body=Buffer.from(await r.arrayBuffer());
 await writeFile(`raw/${name}`,body);await writeFile(`raw/${name.replace(/\.[^.]+$/,'')}.source.json`,JSON.stringify({url,retrieved_at:new Date().toISOString(),http_status:r.status},null,2)+'\n');console.log(name,body.length);
}
