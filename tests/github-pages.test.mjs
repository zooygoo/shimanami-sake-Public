import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,cp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {browser} from './helpers/browser.mjs';
test('GitHub Pages administrator keeps site links inside the repository subdirectory',async()=>{
 const source=fileURLToPath(new URL('../',import.meta.url)),root=await mkdtemp(join(tmpdir(),'sake-pages-'));let b;
 try{
  for(const path of ['scripts','data','assets','apps-script'])await cp(join(source,path),join(root,path),{recursive:true});
  execFileSync(process.execPath,['scripts/build.mjs'],{cwd:root});b=await browser(root);
  await b.open(pathToFileURL(join(root,'dist/admin/index.html')).href,390);
  const expected=await b.evaluate("new URL('../',location.href).href");
  assert.equal(await b.evaluate("document.querySelector('.back').href"),expected);
  assert.equal(await b.evaluate("siteBase+'assets/makers/yagi-shuzobu.png'"),expected+'assets/makers/yagi-shuzobu.png');
  assert.equal(await readFile(join(root,'dist/.nojekyll'),'utf8'),'');
 }finally{if(b)await b.close();await rm(root,{recursive:true,force:true});}
});

test('GitHub Pages styles use a new file address when CSS changes and keep matching content',async()=>{
 const source=fileURLToPath(new URL('../',import.meta.url)),root=await mkdtemp(join(tmpdir(),'sake-css-'));
 try{
  for(const path of ['scripts','data','assets','apps-script'])await cp(join(source,path),join(root,path),{recursive:true});
  const build=()=>execFileSync(process.execPath,['scripts/build.mjs'],{cwd:root});
  const styleName=async()=>{
   const html=await readFile(join(root,'dist/index.html'),'utf8');
   return html.match(/href="(site\.[a-f0-9]{12}\.css)"/)[1];
  };
  build();const first=await styleName();build();assert.equal(await styleName(),first,'identical CSS keeps a stable address');
  const css=(await readFile(join(root,'scripts/site.css'),'utf8'))+'\n.m-vis{background:#fff}\n';
  await writeFile(join(root,'scripts/site.css'),css);build();const next=await styleName();
  assert.notEqual(next,first,'new CSS is never requested at the cached old address');
  assert.equal(await readFile(join(root,'dist',next),'utf8'),css);
  const makers=JSON.parse(await readFile(join(root,'data/makers.json'),'utf8'));
  for(const maker of makers){
   const detail=await readFile(join(root,'dist/makers',maker.id,'index.html'),'utf8');
   assert.ok(detail.includes('href="../../'+next+'"'),'details request the same current stylesheet');
  }
 }finally{await rm(root,{recursive:true,force:true});}
});
