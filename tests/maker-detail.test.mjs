import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderPages} from '../scripts/site-render.mjs';
const seed=Object.fromEntries(['makers','experiences','events'].map(k=>[k,JSON.parse(readFileSync(new URL('../data/'+k+'.json',import.meta.url),'utf8'))]));
test('all five maker details show the supplied introduction without changing list descriptions',()=>{
 const introductions={
  "yagi-shuzobu": "約190年の歴史を持つ今治市唯一の蔵元。地産原料にこだわり、伝承の技で大切に醸される「山丹正宗」は、数多くの受賞実績を誇る。",
  "imabari-machinaka-bakushu": "レトロな商店街の一角にある地ビール醸造所。造りたてビールを隣のタップルームで味わえるほか、工場見学や飲み比べも体験できる。",
  "omishima-winery": "大三島で耕作放棄地を活用したワイン用葡萄栽培から醸造までを行う、島を愛するワイナリー。ワイン販売所で有料試飲もできる。",
  "omishima-brewery": "ビールを愛するご夫婦が営む、大三島のクラフトビール醸造所。特産の柑橘を使用したビールなど、ここにしかない味わいが楽しめる。",
  "omishima-limone": "レモン農家が栽培・加工・販売を手掛ける、柑橘リキュールとレモン雑貨のお店。島の四季を感じるお酒リモンチェッロが大好評。"
};
 const pages=renderPages(seed.makers,seed.experiences,seed.events);
 for(const [id,body] of Object.entries(introductions)){
  assert.equal(seed.makers.find(m=>m.id===id).body,body,id);
  assert.ok(pages.get('makers/'+id+'/index.html').includes('<p>'+body+'</p>'),id);
  assert.ok(!pages.get('index.html').includes(body),id);
 }
});
test('maker detail separates identity from photos and keeps only confirmed bookable experiences',()=>{
 const maker=seed.makers.find(m=>m.id==='omishima-winery');
 const render=experiences=>renderPages(seed.makers,experiences,seed.events).get('makers/'+maker.id+'/index.html');
 const sample=seed.experiences.find(x=>x.maker_id===maker.id);
 const initial=render(seed.experiences);
 assert.ok(initial.indexOf('<h1>')<initial.indexOf('class="d-logo"'));
 assert.match(initial,/class="d-brand"/);
 assert.doesNotMatch(initial,/ここで参加できる体験|予約サイトへ|ワイナリーの醸造所を見学する/);
 assert.match(initial,/体験情報は、内容が決まり次第ご案内します。/);
 const confirmed={...sample,sample:false,booking_url:'https://booking.example.test/winery'};
 const html=render([sample,confirmed,{...confirmed,id:'no-booking',booking_url:''}]);
 assert.match(html,/ここで参加できる体験/);
 assert.equal((html.match(/href="https:\/\/booking.example.test\/winery"/g)||[]).length,1);
 assert.doesNotMatch(html,/表示例|体験情報は、内容が決まり次第/);
});
test('maker media accepts live JPEG snapshots, filters unsafe photos and omits empty media frames',()=>{
 const makers=structuredClone(seed.makers),m=makers[0];
 m.logo='data:image/jpeg;base64,/9j/4AAA/9k=';
 m.photos=['javascript:alert(1)','photos/winery-tanks.jpg','../private.jpg'];
 let html=renderPages(makers,[],[]).get('makers/'+m.id+'/index.html');
 assert.match(html,/class="d-logo" src="data:image\/jpeg;base64,/);
 assert.match(html,/class="d-hero"/);assert.doesNotMatch(html,/class="gallery"|javascript:|private.jpg/);
 m.photos=[];m.logo='';
 html=renderPages(makers,[],[]).get('makers/'+m.id+'/index.html');
 assert.doesNotMatch(html,/class="d-hero"|class="gallery"|class="d-brand"/);
});
