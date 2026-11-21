import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderPages} from '../scripts/site-render.mjs';
const data=Object.fromEntries(['makers','experiences','events'].map(k=>[k,JSON.parse(readFileSync(new URL('../data/'+k+'.json',import.meta.url),'utf8'))]));
test('map and every maker detail search for the named business with its address',()=>{
 const pages=renderPages(data.makers,data.experiences,data.events);
 for(const m of data.makers){const query=encodeURIComponent(m.name+' '+m.address),link='https://www.google.com/maps/search/?api=1&amp;query='+query;assert.ok(pages.get('index.html').includes(link));assert.ok(pages.get('makers/'+m.id+'/index.html').includes(link));}
});
test('every experience booking uses the same label regardless of old saved custom labels',()=>{
 const html=renderPages(data.makers,data.experiences.map(x=>({...x,sample:false})),data.events).get('index.html');
 const labels=[...html.matchAll(/<a[^>]*data-link-target="experience:[^"]+"[^>]*>([^<]+)<\/a>/g)].map(x=>x[1]);
 // Sample anchor URLs have no tracking attribute; inspect the visible experience section as well.
 const section=html.match(/<ul class="exp-list"[\s\S]*?<\/ul>/)[0];
 assert.equal((section.match(/>予約サイトへ<\/a>/g)||[]).length,data.experiences.length);
 assert.doesNotMatch(section,/>診断を始める<|>参加方法を見る</);assert.ok(labels.every(x=>x==='予約サイトへ'));
});
test('public sections hide samples and show the preparation notice only when no entries are public',()=>{
 const notice='<p class="note">現在ご案内できる情報を準備中です</p>';
 for(const [collection,id] of [['experiences','experience'],['events','events']]){
  const sample={...data[collection][0],title:'非公開の表示例',sample:true};
  const published={...data[collection][1],title:'公開中のお知らせ',sample:false};
  for(const [records,visible] of [[[sample,published],true],[[sample],false],[[],false]]){
   const html=renderPages(data.makers,collection==='experiences'?records:[],collection==='events'?records:[]).get('index.html');
   const section=html.split(`id="${id}"`)[1].split('</section>')[0];
   const header=html.split('</header>')[0];
   assert.ok(header.includes(`href="index.html#${id}"`),id);
   assert.ok(!section.includes(sample.title),id);
   assert.equal(section.includes(published.title),visible,id);
   assert.equal(section.split(notice).length-1,visible?0:1,id);
  }
 }
});
