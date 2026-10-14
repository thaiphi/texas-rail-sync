import {mkdirSync,readFileSync,writeFileSync,readdirSync,copyFileSync,lstatSync,existsSync,rmSync,realpathSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const repositoryRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
// Generate a static UI allowlist; original data, pins and source evidence are
// served through the verified backend, never copied into hosting public output.
export function prepareHosting({root=repositoryRoot}={}){
 root=realpathSync(root);
 const assets=resolve(root,'tmp/hosting/public');
 // The recursive removal target is constant beneath the verified root. Refuse
 // linked parents before recreating this build-owned directory.
 for(const relative of ['tmp','tmp/hosting','tmp/hosting/public']){
  const path=resolve(root,relative);
  if(existsSync(path)&&(lstatSync(path).isSymbolicLink()||!lstatSync(path).isDirectory()))throw Error('Unsafe generated hosting path');
 }
 if(assets!==resolve(root,'tmp','hosting','public'))throw Error('Unsafe generated hosting target');
 rmSync(assets,{recursive:true,force:true});mkdirSync(assets,{recursive:true});
 for(const name of readdirSync(resolve(root,'public')))if(/^[a-z0-9._-]+\.(?:js|css|ico|svg|png)$/i.test(name))copyFileSync(resolve(root,'public',name),resolve(assets,name));
 const html=readFileSync(resolve(root,'public/index.html'),'utf8').replace('<head>','<head><meta name="trrc-mode" content="guest">').replace(/<body([^>]*)>/,'<body$1><p class="notice" role="status">Hosted demo: browse preserved public datasets, or collect a small public dataset as a guest. Guest datasets are private to this browser tab and expire.</p>');
 writeFileSync(resolve(root,'tmp/hosting/shell.html'),html);
 return assets;
}
