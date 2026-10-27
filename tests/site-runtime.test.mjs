import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {sendPageView,validEndpoint} from '../scripts/site-runtime.mjs';
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
