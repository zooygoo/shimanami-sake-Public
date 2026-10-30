import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,cp,readFile,rm} from 'node:fs/promises';
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
