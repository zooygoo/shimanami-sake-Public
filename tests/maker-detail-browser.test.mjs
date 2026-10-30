import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,cp,readFile,writeFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {browser} from './helpers/browser.mjs';
const source=fileURLToPath(new URL('../',import.meta.url));
test('maker identity, compact logos and photo layouts fit mobile and desktop with no empty frames',async()=>{
 const root=await mkdtemp(join(tmpdir(),'sake-maker-layout-'));let b;
 try{
  for(const path of ['scripts','data','assets','apps-script'])await cp(join(source,path),join(root,path),{recursive:true});
  await writeFile(join(root,'data/connection.json'),JSON.stringify({apps_script_url:''}));
  execFileSync(process.execPath,['scripts/build.mjs'],{cwd:root});b=await browser(root);
  for(const width of [360,390,768,1366])for(const id of ['yagi-shuzobu','omishima-brewery','omishima-winery']){
   await b.open(pathToFileURL(join(root,'dist/makers',id,'index.html')).href,width);
   assert.equal(await b.evaluate('document.documentElement.scrollWidth<=innerWidth'),true,`${width} ${id}`);
   const bounds=await b.evaluate(`(()=>{const title=document.querySelector('.d-id h1').getBoundingClientRect(),logo=document.querySelector('.d-brand').getBoundingClientRect();return {titleRight:title.right,logoLeft:logo.left,width:logo.width,height:logo.height,imageHeight:document.querySelector('.d-logo').getBoundingClientRect().height,fit:getComputedStyle(document.querySelector('.d-logo')).objectFit,background:getComputedStyle(document.querySelector('.d-brand')).backgroundColor};})()`);
   assert.ok(bounds.titleRight<=bounds.logoLeft);assert.equal(bounds.fit,'contain');assert.equal(bounds.background,'rgb(255, 255, 255)');
   assert.ok(bounds.height<=(width<=860?88:160));assert.ok(bounds.imageHeight<=(width<=860?88:160));assert.ok(bounds.width<=(width<=860?104:240));
   assert.equal(await b.evaluate("document.querySelectorAll('.mini a').length"),0);
   if(id!=='omishima-winery')assert.equal(await b.evaluate("document.querySelectorAll('.d-hero,.gallery').length"),0);
   if(process.env.SCREENSHOT_DIR&&[390,1366].includes(width)){
    await mkdir(process.env.SCREENSHOT_DIR,{recursive:true});await b.screenshot(join(process.env.SCREENSHOT_DIR,`maker-${id}-${width}.png`),true);
   }
  }
  await b.open(pathToFileURL(join(root,'dist/makers/omishima-brewery/index.html')).href,390);
  await b.evaluate("document.querySelector('.d-id h1').textContent='VeryLongMakerName'.repeat(40);document.querySelector('.d-id p').textContent='長い紹介文'.repeat(100)");
  assert.equal(await b.evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
  await b.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
  assert.equal(await b.evaluate("getComputedStyle(document.activeElement).outlineStyle"),'solid');
 }finally{if(b)await b.close();await rm(root,{recursive:true,force:true});}
});
