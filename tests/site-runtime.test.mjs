import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {sendPageView,sendLinkClick,validEndpoint} from '../scripts/site-runtime.mjs';
const endpoint='https://script.google.com/macros/s/test-deployment/exec';
test('view sender is disabled without a valid Google endpoint and rejects admin or arbitrary paths',()=>{
 const calls=[];const services={crypto:{randomUUID},navigator:{sendBeacon:(...args)=>calls.push(args)}};
 for(const [url,page] of [['','/'],['https://evil.test/','/'],[endpoint,'/admin/'],[endpoint,'/?email=private']])assert.equal(sendPageView(url,page,services),false);
 assert.equal(calls.length,0);assert.equal(validEndpoint(endpoint),true);
});
test('view beacon sends only event ID and canonical page, without visitor identity or URL query',async()=>{
 let body;assert.equal(sendPageView(endpoint,'/makers/yagi-shuzobu/',{crypto:{randomUUID},navigator:{sendBeacon:(_,value)=>{body=value;return true;}}}),true);
 const event=JSON.parse(await body.text());assert.deepEqual(Object.keys(event).sort(),['action','event_id','page']);assert.equal(event.page,'/makers/yagi-shuzobu/');assert.equal(event.action,'view');assert.match(event.event_id,/^[0-9a-f-]{36}$/);
});
test('beacon queue failure uses a single credential-free keepalive fallback',()=>{
 let request;sendPageView(endpoint,'/',{crypto:{randomUUID},navigator:{sendBeacon:()=>false},fetch:(url,options)=>{request={url,options};return Promise.resolve();}});
 assert.equal(request.url,endpoint);assert.equal(request.options.credentials,'omit');assert.equal(request.options.mode,'no-cors');assert.equal(request.options.keepalive,true);
});
test('external clicks send only the canonical target and page; unknown targets never send',async()=>{
 const calls=[],services={crypto:{randomUUID},navigator:{sendBeacon:(url,body)=>{calls.push({url,body});return true;}}};
 assert.equal(sendLinkClick(endpoint,'/','experience:winery-tour',services),true);
 const payload=JSON.parse(await calls[0].body.text());assert.deepEqual(Object.keys(payload).sort(),['action','event_id','page','target']);assert.equal(payload.action,'click');assert.equal(payload.target,'experience:winery-tour');
 for(const target of ['https://example.test/?private=x','maker:unknown','event:x?query=secret','__proto__'])assert.equal(sendLinkClick(endpoint,'/',target,services),false);
 assert.equal(sendLinkClick(endpoint,'/admin/','event:market',services),false);assert.equal(calls.length,1);
});

test('analytics transport errors never throw into site rendering or link navigation',()=>{
 let fallbacks=0;
 const crypto={randomUUID},navigator={sendBeacon(){throw new Error('Beacon blocked');}};
 assert.equal(sendPageView(endpoint,'/',{crypto,navigator,fetch(){fallbacks++;return Promise.resolve();}}),true);
 assert.equal(fallbacks,1);
 assert.equal(sendLinkClick(endpoint,'/','event:market',{crypto,navigator,fetch(){throw new Error('Network blocked');}}),false);
 assert.equal(sendPageView(endpoint,'/',{crypto:{randomUUID(){throw new Error('Unavailable');}}}),false);
});
