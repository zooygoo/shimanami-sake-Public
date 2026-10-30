import { readFile,writeFile,mkdir,rm,cp } from 'node:fs/promises';
import { join,dirname } from 'node:path';
import { renderPages } from './site-render.mjs';
import { createHash } from 'node:crypto';
const root=process.cwd();
const read=name=>readFile(join(root,'data',name+'.json'),'utf8').then(JSON.parse);
const [makers,experiences,events,connection]=await Promise.all(['makers','experiences','events','connection'].map(read));
if(connection.apps_script_url&&!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(connection.apps_script_url))throw new Error('Apps Script URL is invalid');
const dist=join(root,'dist');
await rm(dist,{recursive:true,force:true});await mkdir(dist,{recursive:true});
await writeFile(join(dist,'.nojekyll'),'');
await cp(join(root,'assets'),join(dist,'assets'),{recursive:true});
for(const name of ['site.css','site-render.mjs','site-runtime.mjs'])await cp(join(root,'scripts',name),join(dist,name));
const css=await readFile(join(root,'scripts/site.css'));
const stylesheet='site.'+createHash('sha256').update(css).digest('hex').slice(0,12)+'.css';
await writeFile(join(dist,stylesheet),css);
for(const [path,html] of renderPages(makers,experiences,events,connection)){
 const target=join(dist,path);await mkdir(dirname(target),{recursive:true});await writeFile(target,html.replace(/href="((?:\.\.\/)*)site\.css"/g,`href="$1${stylesheet}"`));
}
const logo='data:image/png;base64,'+(await readFile(join(root,'assets/brand/shimanami-logo.png'))).toString('base64');
const adminTemplate=await readFile(join(root,'apps-script/Admin.html'),'utf8');
const boot={connected:!!connection.apps_script_url,transport:'http',needsSetup:false,canSetup:false,endpoint:connection.apps_script_url,...(!connection.apps_script_url?{previewData:{makers,experiences,events}}:{})};
let admin=adminTemplate.replace('__LOGO_DATA__',logo).replace('__BOOTSTRAP_JSON__',JSON.stringify(boot).replaceAll('<','\\u003c'));
await mkdir(join(dist,'admin'),{recursive:true});await writeFile(join(dist,'admin/index.html'),admin);
console.log(`Built home, ${makers.length} maker pages and administrator entry`);
