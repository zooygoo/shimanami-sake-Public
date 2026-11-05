import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,cp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';

test('production rebuild preserves hidden content, in-site administrator and current runtime together',async()=>{
 const source=fileURLToPath(new URL('../',import.meta.url)),root=await mkdtemp(join(tmpdir(),'sake-operating-build-'));
 try{
  for(const path of ['scripts','data','assets','apps-script'])await cp(join(source,path),join(root,path),{recursive:true});
  const seed=JSON.parse(await readFile(join(root,'data/experiences.json'),'utf8'));
  const events=JSON.parse(await readFile(join(root,'data/events.json'),'utf8'));
  const visible={...seed[0],title:'公開中の体験',sample:false,booking_url:'',booking_label:'非表示'};
  await writeFile(join(root,'data/experiences.json'),JSON.stringify([visible,...seed.slice(1)]));
  for(let attempt=0;attempt<2;attempt++){
   execFileSync(process.execPath,['scripts/build.mjs'],{cwd:root});
   const admin=await readFile(join(root,'dist/admin/index.html'),'utf8');
   assert.equal(/location\.replace\(/.test(admin),false,'administrator must keep its own site address');
   const boot=JSON.parse(admin.match(/const boot=(\{[^\n]*\});/)[1]);
   assert.equal(boot.connected,true);assert.equal(boot.transport,'http');
   assert.match(admin,/action=admin-bootstrap/);
   const home=await readFile(join(root,'dist/index.html'),'utf8');
   assert.ok(home.includes(visible.title));
   for(const hidden of [...seed.slice(1),...events])assert.ok(!home.includes(hidden.title),hidden.title);
   const runtimeName=home.match(/src="(site-runtime\.[a-f0-9]{12}\.mjs)"/)[1];
   const runtime=await readFile(join(root,'dist',runtimeName),'utf8');
   const rendererName=runtime.match(/from '\.\/(site-render\.[a-f0-9]{12}\.mjs)'/)[1];
   const {renderPages}=await import(pathToFileURL(join(root,'dist',rendererName)).href);
   const makers=JSON.parse(await readFile(join(root,'data/makers.json'),'utf8'));
   const updated=renderPages(makers,[visible,...seed.slice(1)],events);
   for(const [path,html] of updated){
    for(const hidden of [...seed.slice(1),...events])assert.ok(!html.includes(hidden.title),path+': '+hidden.title);
   }
   await writeFile(join(root,'scripts/site.css'),(await readFile(join(root,'scripts/site.css'),'utf8'))+'\n/* next deployment */\n');
  }
 }finally{await rm(root,{recursive:true,force:true});}
});
