import { readFile,writeFile,mkdir,rm,cp } from 'node:fs/promises';
import { join,dirname } from 'node:path';
import { renderPages } from './site-render.mjs';
import { createHash } from 'node:crypto';
const root=process.cwd();
const read=name=>readFile(join(root,'data',name+'.json'),'utf8').then(JSON.parse);
const [makers,experiences,events,connection]=await Promise.all(['makers','experiences','events','connection'].map(read));
if(connection.apps_script_url&&!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(connection.apps_script_url))throw new Error('Apps Script URL is invalid');
const siteUrl=URL.parse(connection.site_url);
if('site_url' in connection&&(!siteUrl||!['http:','https:'].includes(siteUrl.protocol)||siteUrl.username||siteUrl.password||siteUrl.search||siteUrl.hash))throw new Error('Site URL is invalid');
if(siteUrl&&!siteUrl.pathname.endsWith('/'))siteUrl.pathname+='/';
const dist=join(root,'dist');
await rm(dist,{recursive:true,force:true});await mkdir(dist,{recursive:true});
await writeFile(join(dist,'.nojekyll'),'');
await cp(join(root,'assets'),join(dist,'assets'),{recursive:true});
for(const name of ['site.css','site-render.mjs','site-runtime.mjs'])await cp(join(root,'scripts',name),join(dist,name));
const css=await readFile(join(root,'scripts/site.css'));
const stylesheet='site.'+createHash('sha256').update(css).digest('hex').slice(0,12)+'.css';
await writeFile(join(dist,stylesheet),css);
const renderer=await readFile(join(root,'scripts/site-render.mjs'),'utf8');
const rendererName='site-render.'+createHash('sha256').update(renderer).digest('hex').slice(0,12)+'.mjs';
await writeFile(join(dist,rendererName),renderer);
const runtime=(await readFile(join(root,'scripts/site-runtime.mjs'),'utf8')).replace("'./site-render.mjs'","'./"+rendererName+"'");
const runtimeName='site-runtime.'+createHash('sha256').update(runtime).digest('hex').slice(0,12)+'.mjs';
await writeFile(join(dist,runtimeName),runtime);
const pages=renderPages(makers,experiences,events,{...connection,site_url:siteUrl?.href});
for(const [path,html] of pages){
 const target=join(dist,path);await mkdir(dirname(target),{recursive:true});await writeFile(target,html.replace(/(<link rel="stylesheet" href="[^"<>]*?)site\.css"/,(_,prefix)=>`${prefix}${stylesheet}"`).replace(/src="((?:\.\.\/)*)site-runtime\.mjs"/g,`src="$1${runtimeName}"`));
}
if(siteUrl){
 const publicUrls=[...pages.keys()].filter(path=>path!=='404.html').map(path=>new URL(path.replace(/index\.html$/,''),siteUrl).href.replaceAll('&','&amp;'));
 await writeFile(join(dist,'sitemap.xml'),`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${publicUrls.map(url=>`  <url><loc>${url}</loc></url>`).join('\n')}\n</urlset>\n`);
 await writeFile(join(dist,'robots.txt'),`User-agent: *\nDisallow: ${new URL('admin/',siteUrl).pathname}\nSitemap: ${new URL('sitemap.xml',siteUrl).href}\n`);
}
const logo='data:image/png;base64,'+(await readFile(join(root,'assets/brand/shimanami-logo.png'))).toString('base64');
const adminTemplate=await readFile(join(root,'apps-script/Admin.html'),'utf8');
const boot={connected:!!connection.apps_script_url,transport:'http',needsSetup:false,canSetup:false,endpoint:connection.apps_script_url,...(!connection.apps_script_url?{previewData:{makers,experiences,events}}:{})};
const admin=adminTemplate.replace('<head>','<head><meta name="robots" content="noindex">').replace('__LOGO_DATA__',logo).replace('__BOOTSTRAP_JSON__',JSON.stringify(boot).replaceAll('<','\\u003c'));
await mkdir(join(dist,'admin'),{recursive:true});await writeFile(join(dist,'admin/index.html'),admin);
console.log(`Built home, ${makers.length} maker pages and administrator entry`);
