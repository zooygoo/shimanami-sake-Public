import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {browser} from './helpers/browser.mjs';
import {renderPages} from '../scripts/site-render.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const makers=JSON.parse(readFileSync(join(root,'data/makers.json'),'utf8'));
let b;
before(async()=>{execFileSync(process.execPath,['scripts/build.mjs'],{cwd:root});b=await browser();});
after(async()=>{if(b)await b.close();});

for(const width of [390,1366])test(`maker photos: original proportions, first photo and no overflow at ${width}px`,async()=>{
  for(const maker of makers){
    await b.open(pathToFileURL(join(root,'dist/makers',maker.id,'index.html')).href,width);
    await b.evaluate("Promise.all([...document.images].map(img=>{img.loading='eager';return img.decode()}))");
    const images=await b.evaluate(`[...document.querySelectorAll('.d-hero img,.gallery img')].map(img=>({src:img.getAttribute('src'),width:img.width,height:img.height,nw:img.naturalWidth,nh:img.naturalHeight}))`);
    assert.equal(images.length,maker.photos.length);
    for(const [i,img] of images.entries()){
      assert.equal(img.src,'../../assets/'+maker.photos[i]);
      assert.ok(Math.abs(img.height-img.width*img.nh/img.nw)<=1,`${maker.id}: ${img.src} must keep original proportions`);
    }
    assert.equal(await b.evaluate('document.documentElement.scrollWidth<=innerWidth'),true,maker.id);
  }
});

test('maker photos: zero through four photos remain ordered and never overlap',async()=>{
  const source=makers.find(m=>m.photos.length===4);
  for(const width of [390,1366])for(let count=0;count<=4;count++){
    await b.open(pathToFileURL(join(root,'dist/makers',source.id,'index.html')).href,width);
    const maker={...source,photos:source.photos.slice(0,count)};
    const html=renderPages([maker],[],[]).get('makers/'+maker.id+'/index.html');
    await b.evaluate(`document.querySelector('main').replaceWith(new DOMParser().parseFromString(${JSON.stringify(html)},'text/html').querySelector('main'))`);
    await b.evaluate("Promise.all([...document.images].map(img=>{img.loading='eager';return img.decode()}))");
    assert.equal(await b.evaluate("document.querySelectorAll('.d-hero img').length"),count?1:0);
    assert.equal(await b.evaluate("document.querySelectorAll('.gallery img').length"),Math.max(0,count-1));
    const boxes=await b.evaluate("[...document.querySelectorAll('.d-hero img,.gallery img')].map(img=>{const r=img.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom}})");
    for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
      const a=boxes[i],c=boxes[j];
      assert.ok(a.right<=c.left+1||c.right<=a.left+1||a.bottom<=c.top+1||c.bottom<=a.top+1,`${width}px, ${count} photos overlap`);
    }
    assert.equal(await b.evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
  }
});
