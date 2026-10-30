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
test('draft and trial events stay off the public site while real events have no sample badge',()=>{
 const events=[{...data.events[0],title:'公開する催し',sample:false},{...data.events[1],title:'非公開の試験',sample:true}];
 let html=renderPages(data.makers,[],events).get('index.html');
 assert.ok(html.includes('公開する催し'));assert.ok(!html.includes('非公開の試験'));assert.ok(!html.includes('表示例'));
 html=renderPages(data.makers,[],data.events).get('index.html');
 assert.ok(html.includes('イベント情報は、決まり次第ご案内します。'));assert.ok(!html.includes(data.events[0].title));
});
