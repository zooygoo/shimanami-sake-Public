import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderPages} from '../scripts/site-render.mjs';
const seed=Object.fromEntries(['makers','experiences','events'].map(k=>[k,JSON.parse(readFileSync(new URL('../data/'+k+'.json',import.meta.url),'utf8'))]));
test('experience and event photos render safely and empty event photos add no image',()=>{
 const experiences=structuredClone(seed.experiences),events=structuredClone(seed.events);
 experiences[0].photo='data:image/jpeg;base64,/9j/4AAA/9k=';
 events[0].photo='photos/winery-tanks.jpg';
 let home=renderPages(seed.makers,experiences,events).get('index.html');
 assert.ok(home.includes('src="data:image/jpeg;base64,/9j/4AAA/9k="'));
 assert.ok(home.includes('class="event-photo" src="assets/photos/winery-tanks.jpg"'));
 assert.equal((home.match(/class="event-photo"/g)||[]).length,1);
 for(const photo of ['javascript:alert(1)','data:image/svg+xml,<svg onload=alert(1)>','../secret.jpg','https://evil.test/track.jpg']){
  experiences[0].photo=photo;events[0].photo=photo;
  home=renderPages(seed.makers,experiences,events).get('index.html');
  assert.ok(!home.includes('src="'+photo));assert.ok(!home.includes('src="assets/'+photo));
 }
});
test('real and mixed content is not described as entirely made of display samples',()=>{
 for(const mode of ['real','mixed','empty']){
  const experiences=mode==='empty'?[]:seed.experiences.map((x,i)=>({...x,sample:mode==='mixed'&&i>0}));
  const events=mode==='empty'?[]:seed.events.map((x,i)=>({...x,sample:mode==='mixed'&&i>0}));
  const home=renderPages(seed.makers,experiences,events).get('index.html');
  assert.ok(!home.includes('体験名、説明、写真は表示例です。'),mode);
  assert.ok(!home.includes('イベント名、日程、内容は表示例です。'),mode);
  assert.equal((home.match(/class="sample"/g)||[]).length,mode==='mixed'?7:0);
 }
});

test('three maker galleries use the nine supplied images and preserve other makers',()=>{
 const expected={
  "omishima-brewery": [
    "omishima-brewery-exterior.jpg",
    "omishima-brewery-equipment.jpg",
    "omishima-brewery-tasting.jpg"
  ],
  "omishima-limone": [
    "omishima-limone-exterior.jpg",
    "omishima-limone-citrus.jpg",
    "omishima-limone-products.jpg"
  ],
  "imabari-machinaka-bakushu": [
    "imabari-machinaka-bakushu-entrance.jpg",
    "imabari-machinaka-bakushu-taps.jpg",
    "imabari-machinaka-bakushu-pouring.jpg"
  ]
};
 const listed=new Set();
 for(const maker of seed.makers){
   const names=expected[maker.id];
   if(!names)continue;
   assert.deepEqual(maker.photos,names.map(name=>'photos/'+name));
   const html=renderPages(seed.makers,seed.experiences,seed.events).get('makers/'+maker.id+'/index.html');
   for(const filename of names){
     assert.ok(html.includes('../../assets/photos/'+filename),filename);
     assert.ok(readFileSync(new URL('../assets/photos/'+filename,import.meta.url)).length>0,filename);
     listed.add(filename);
   }
 }
 assert.equal(listed.size,9);
 assert.equal(seed.makers.find(m=>m.id==='yagi-shuzobu').photos.length,0);
 assert.equal(seed.makers.find(m=>m.id==='omishima-winery').photos.length,4);
});
