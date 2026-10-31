import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderPages} from '../scripts/site-render.mjs';
const seed=Object.fromEntries(['makers','experiences','events'].map(k=>[k,JSON.parse(readFileSync(new URL('../data/'+k+'.json',import.meta.url),'utf8'))]));
test('experience and event photos render safely and empty event photos add no image',()=>{
 const experiences=structuredClone(seed.experiences),events=structuredClone(seed.events);
 experiences[0].photo='data:image/jpeg;base64,/9j/4AAA/9k=';experiences[0].sample=false;
 events[0].photo='photos/winery-tanks.jpg';events[0].sample=false;
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
  assert.equal((home.match(/class="sample"/g)||[]).length,0);
 }
});
