import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderPages} from '../scripts/site-render.mjs';
const seed=Object.fromEntries(['makers','experiences','events'].map(k=>[k,JSON.parse(readFileSync(new URL('../data/'+k+'.json',import.meta.url),'utf8'))]));
test('experience page visibility and booking-button visibility are independent on both pages',()=>{
 for(const visible of [false,true])for(const button of [false,true]){
  const experience={...seed.experiences[0],title:'公開設定確認',sample:!visible,booking_url:'https://booking.example.test/',booking_label:button?'予約サイトへ':'非表示'};
  const pages=renderPages(seed.makers,[experience],[]);
  for(const path of ['index.html','makers/'+experience.maker_id+'/index.html']){
   const html=pages.get(path);assert.equal(html.includes(experience.title),visible,path);assert.equal(html.includes('href="https://booking.example.test/"'),visible&&button,path);assert.doesNotMatch(html,/表示例/);
  }
 }
});
test('published experience without a booking URL still appears in the maker detail',()=>{
 const experience={...seed.experiences[0],title:'予約準備中の体験',sample:false,booking_url:''};
 const html=renderPages(seed.makers,[experience],[]).get('makers/'+experience.maker_id+'/index.html');
 assert.ok(html.includes(experience.title));assert.doesNotMatch(html,/>予約サイトへ<\/a>/);
});
