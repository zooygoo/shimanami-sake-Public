import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { browser } from './helpers/browser.mjs';
import vm from 'node:vm';
import { createHmac, createHash, randomUUID } from 'node:crypto';
const code=readFileSync(new URL('../apps-script/Code.gs',import.meta.url),'utf8');
const seed=Object.fromEntries(['makers','experiences','events'].map(k=>[k,JSON.parse(readFileSync(new URL(`../data/${k}.json`,import.meta.url),'utf8'))]));
function backend() {
 const props=new Map([['SPREADSHEET_ID','test-sheet'],['OWNER_EMAIL','owner@example.test'],['PASSWORD_SALT','salt'],['PASSWORD_PEPPER','pepper']]);
 const cache=new Map(),sheets=new Map(),openedSheets=[],imageRequests=[],images=new Map(); let email='owner@example.test',clock=Date.now(),imageFailure=false,imageBranch=false;
 class TestDate extends Date { constructor(...a){super(...(a.length?a:[clock]));} static now(){return clock;} }
 const range=(rows,r,c,n=1,w=1)=>({
  getDisplayValues:()=>Array.from({length:n},(_,i)=>Array.from({length:w},(_,j)=>String(rows[r-1+i]?.[c-1+j]??''))),
  setRichTextValues:values=>{values.forEach((line,i)=>{rows[r-1+i]??=[];line.forEach((v,j)=>{rows[r-1+i][c-1+j]=v.text;});});},
  setValues:values=>{values.forEach((line,i)=>{rows[r-1+i]??=[];line.forEach((v,j)=>{rows[r-1+i][c-1+j]=v;});});}
 });
 const sheet=name=>{if(!sheets.has(name)){const rows=[];sheets.set(name,{rows,getLastRow:()=>rows.length,getLastColumn:()=>rows[0]?.length||0,getRange:(...a)=>range(rows,...a)});}return sheets.get(name);};
 const db={getSheetByName:sheet};
 const ctx=vm.createContext({Date:TestDate,JSON,URL,console,
 UrlFetchApp:{fetch:(url,options)=>{imageRequests.push({url,options});assert.ok(url.startsWith('https://api.github.com/repos/zooygoo/shimanami-sake-Public/'));let status=200,body={};const path=url.split('/contents/')[1]?.split('?')[0];if(imageFailure){status=403;}else if(path){if(options.method==='put'){const payload=JSON.parse(options.payload);assert.equal(payload.branch,'site-images');images.set(path,{content:payload.content,sha:'test-sha'});status=201;}else if(images.has(path)){body=images.get(path);}else status=404;}else if(url.endsWith('/git/ref/heads/site-images')&&!imageBranch)status=404;else if(url.endsWith('/git/refs')&&options.method==='post'){assert.deepEqual(JSON.parse(options.payload),{ref:'refs/heads/site-images',sha:'base-sha'});imageBranch=true;status=201;}else if(url.includes('/git/ref/heads/'))body={object:{sha:'base-sha'}};return {getResponseCode:()=>status,getContentText:()=>JSON.stringify(body)};}},
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k)||null,setProperty:(k,v)=>props.set(k,v)})},
 CacheService:{getScriptCache:()=>({get:k=>{const x=cache.get(k);return x&&x.expires>clock?x.value:null;},put:(k,v,ttl)=>cache.set(k,{value:v,expires:clock+ttl*1000}),remove:k=>cache.delete(k)})},
 LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
 SpreadsheetApp:{openById:id=>{openedSheets.push(id);return db;},newRichTextValue:()=>({setText(text){this.text=text;return this;},build(){return {text:this.text};}})},
 Session:{getActiveUser:()=>({getEmail:()=>email})},
 Utilities:{getUuid:randomUUID,Charset:{UTF_8:'UTF-8'},DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_,v)=>[...createHash('sha256').update(Array.isArray(v)?Buffer.from(v):v).digest()],computeHmacSha256Signature:(v,k)=>[...createHmac('sha256',k).update(v).digest()],base64Encode:v=>Buffer.from(v).toString('base64'),base64Decode:v=>[...Buffer.from(v,'base64')],formatDate:(date,tz,format)=>{const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date).map(x=>[x.type,x.value]));const d=`${parts.year}-${parts.month}-${parts.day}`;return format==='yyyy-MM-dd'?d:`${d} ${parts.hour}:${parts.minute}:${parts.second}`;}},
 ContentService:{MimeType:{JSON:'json',JAVASCRIPT:'js'},createTextOutput:text=>({text,setMimeType(){return this;}})}
 });
 vm.runInContext(code,ctx);
 vm.runInContext(readFileSync(new URL('../apps-script/Photos.gs',import.meta.url),'utf8'),ctx);
 for(const [kind,records] of Object.entries(seed)){
  const def=ctx.definition_(kind);const rows=sheet(def.name).rows;rows.push([...def.fields]);
  records.forEach(x=>rows.push(def.fields.map(k=>Array.isArray(x[k])?JSON.stringify(x[k]):x[k]===null?'':x[k])));
 }
 sheet('閲覧記録').rows.push(['received_at_jst','date_jst','page','event_id']);
 const rpc=p=>JSON.parse(JSON.stringify(ctx.rpc(p)));
 const setup=()=>rpc({action:'setup',verifier:'a'.repeat(64)});
 const login=()=>rpc({action:'login',verifier:'a'.repeat(64)}).token;
 return {ctx,props,sheets,openedSheets,imageRequests,images,rpc,setup,login,clearCache:()=>cache.clear(),setImageFailure:v=>{imageFailure=v;},setEmail:v=>{email=v;},advance:ms=>{clock+=ms;}};
}
test('admin setup is restricted to the Google owner and cannot overwrite an existing password',()=>{
 const b=backend();b.setEmail('');assert.equal(b.setup().ok,false);assert.equal(b.props.has('PASSWORD_HASH'),false);b.setEmail('owner@example.test');assert.equal(b.setup().ok,true);assert.equal(b.setup().ok,false);assert.notEqual(b.props.get('PASSWORD_HASH'),'a'.repeat(64));
});
test('one administrator password creates an expiring session; wrong password and logout are rejected',()=>{
 const b=backend();b.setup();assert.equal(b.rpc({action:'login',verifier:'b'.repeat(64)}).ok,false);const token=b.login();assert.ok(token);assert.equal(b.rpc({action:'load',token}).ok,true);b.rpc({action:'logout',token});assert.equal(b.rpc({action:'load',token}).ok,false);const second=b.login();b.advance(3601000);assert.equal(b.rpc({action:'load',token:second}).ok,false);
});
test('all reads, statistics and writes require a server-validated session',()=>{
 const b=backend();for(const action of ['load','stats','save'])assert.equal(b.rpc({action,token:'forged',collection:'makers',record:seed.makers[0],revision:0}).ok,false);assert.equal(b.props.get('REVISION'),undefined);
});
test('authenticated edits persist in Sheets and are returned by the public snapshot',()=>{
 const b=backend();b.setup();const token=b.login(),record={...seed.makers[0],description:'更新しました <script> & =SUM(A1)'};
 assert.equal(b.rpc({action:'save',token,collection:'makers',record,revision:0}).ok,true);
 const state=b.rpc({action:'load',token});assert.equal(state.data.makers[0].description,record.description);assert.equal(state.revision,1);
 const publicData=b.ctx.publicData_();assert.equal(publicData.makers[0].description,record.description);assert.equal(publicData.token,undefined);assert.equal(publicData.views,undefined);
});
test('maker form requests pass the real server validation and persist description and order',async()=>{
 const server=backend();server.setup();const token=server.login();
 const fixture=await mkdtemp(join(tmpdir(),'sake-maker-save-'));let client;
 try{
  const source=readFileSync(new URL('../apps-script/Admin.html',import.meta.url),'utf8');
  await writeFile(join(fixture,'index.html'),source.replace('__LOGO_DATA__','').replace('__BOOTSTRAP_JSON__',JSON.stringify({connected:true,photosReady:false})));
  client=await browser(fixture);
  await client.send('Runtime.enable');
  await client.send('Runtime.addBinding',{name:'testRpc'});
  const saves=[];
  client.on('Runtime.bindingCalled',async event=>{
   if(event.name!=='testRpc')return;
   const {id,request}=JSON.parse(event.payload),result=server.rpc(request);
   if(request.action==='save')saves.push({request,result});
   await client.evaluate(`window.testReplies.get(${id})(${JSON.stringify(result)});window.testReplies.delete(${id})`);
  });
  await client.send('Page.addScriptToEvaluateOnNewDocument',{source:`
   sessionStorage.setItem('shimanami.admin.session',${JSON.stringify(token)});
   window.testReplies=new Map();let sequence=0;
   window.google={script:{run:{withSuccessHandler(success){return {withFailureHandler(){return {rpc(request){const id=++sequence;window.testReplies.set(id,success);window.testRpc(JSON.stringify({id,request}));}};}};}}}};
  `});
  await client.open(pathToFileURL(join(fixture,'index.html')).href,390,900);
  async function waitFor(expression){for(let i=0;i<200;i++){if(await client.evaluate(expression))return;await delay(20);}throw new Error('Timed out: '+expression);}
  await waitFor("!document.getElementById('workspace').hidden");
  const index=seed.makers.findIndex(x=>x.id==='yagi-shuzobu');
  await client.evaluate(`document.getElementById('record').value=${JSON.stringify(String(index))};document.getElementById('record').dispatchEvent(new Event('change'));document.getElementById('input-description').value='紹介文 <script> & =SUM(A1)';document.getElementById('input-order').value='6';document.getElementById('edit-form').requestSubmit()`);
  await waitFor("!document.getElementById('save').disabled");
  assert.equal(saves.length,1);assert.deepEqual(saves[0].result,{ok:true,revision:1});
  assert.match(await client.evaluate("document.getElementById('status').textContent"),/保存しました/);
  const saved=server.rpc({action:'load',token}).data.makers[index];
  assert.deepEqual(saved,{...seed.makers[index],description:'紹介文 <script> & =SUM(A1)',order:6});
  assert.equal(server.ctx.publicData_().makers[index].description,saved.description);
  await client.evaluate("document.getElementById('input-description').value='';document.getElementById('input-order').value='5';document.getElementById('preview').click();document.getElementById('review-save').click()");
  await waitFor("!document.getElementById('save').disabled");
  assert.equal(saves.length,2);assert.deepEqual(saves[1].result,{ok:true,revision:2});
  assert.deepEqual(server.rpc({action:'load',token}).data.makers[index],seed.makers[index]);
 }finally{if(client)await client.close();await rm(fixture,{recursive:true,force:true});}
});
test('stale concurrent edits and injected or invalid fields cannot overwrite data',()=>{
 const b=backend();b.setup();const token=b.login();assert.equal(b.rpc({action:'save',token,collection:'makers',record:seed.makers[0],revision:0}).ok,true);
 assert.equal(b.rpc({action:'save',token,collection:'makers',record:{...seed.makers[0],name:'stale'},revision:0}).ok,false);
 for(const record of [{...seed.events[0],end_date:'2020-01-01'},{...seed.events[0],url:'javascript:alert(1)'},{...seed.events[0],unknown:'injection'}])assert.equal(b.rpc({action:'save',token,collection:'events',record,revision:1}).ok,false);
 assert.equal(b.rpc({action:'load',token}).data.makers[0].name,seed.makers[0].name);
});
test('page views append server Japan timestamps once per event and exclude admin or arbitrary pages',()=>{
 const b=backend();const event={action:'view',page:'/',event_id:randomUUID()};
 assert.equal(b.ctx.recordView_(event).ok,true);assert.equal(b.ctx.recordView_(event).ok,true);
 assert.equal(b.sheets.get('閲覧記録').rows.length,2);assert.match(b.sheets.get('閲覧記録').rows[1][1],/^\d{4}-\d{2}-\d{2}$/);
 for(const page of ['/admin/','https://evil.test/','/unknown/','/?token=secret'])assert.equal(b.ctx.recordView_({...event,page,event_id:randomUUID()}).ok,false);
 assert.equal(b.ctx.recordView_({...event,event_id:'=IMPORTXML(...)'}).ok,false);
});
test('calendar-month statistics preserve legacy views and separate external clicks at Japan midnight',()=>{
 const b=backend();b.advance(Date.parse('2026-10-31T15:00:00Z')-b.ctx.Date.now());
 const rows=b.sheets.get('閲覧記録').rows;
 rows.push(['2026-10-31 23:59:59','2026-10-31','/',randomUUID()]);
 rows.push(['2026-10-01 00:00:00','2026-10-01','/',randomUUID()]);
 const view={action:'view',page:'/',event_id:randomUUID()};assert.equal(b.ctx.recordView_(view).ok,true);
 const click={action:'click',page:'/',target:'maker:omishima-winery:website',event_id:randomUUID()};assert.equal(b.ctx.recordView_(click).ok,true);
 rows.push(['2026-11-02 00:00:00','2026-11-02','/',randomUUID(),'view','']);
 b.setup();const stats=b.rpc({action:'stats',token:b.login()});
 assert.deepEqual(stats.counts,{today:1,week:2,month:1,total:3});assert.deepEqual(stats.pages,{'/':3});
 assert.deepEqual(stats.clicks,{today:1,month:1,total:1});assert.equal(stats.links[click.target],1);
 assert.deepEqual(rows[0],['received_at_jst','date_jst','page','event_id','action','target']);assert.equal(rows[1].length,4);
 assert.equal(rows[3][1],'2026-11-01');
});
test('events survive cache eviction without duplicates and only registered external targets can be clicked',()=>{
 const b=backend(),view={action:'view',page:'/',event_id:randomUUID()};
 assert.equal(b.ctx.recordView_(view).ok,true);b.clearCache();assert.equal(b.ctx.recordView_(view).ok,true);assert.equal(b.sheets.get('閲覧記録').rows.length,2);
 const make=target=>({action:'click',page:'/',target,event_id:randomUUID()});
 for(const target of ['experience:winery-tour','event:island-tasting','maker:unknown:website','https://evil.test/?private=x','__proto__'])assert.equal(b.ctx.recordView_(make(target)).ok,false);
 const click=make('maker:omishima-winery:website');assert.equal(b.ctx.recordView_(click).ok,true);b.clearCache();assert.equal(b.ctx.recordView_(click).ok,true);assert.equal(b.sheets.get('閲覧記録').rows.length,3);
 assert.equal(b.ctx.recordView_({...make('maker:omishima-winery:website'),page:'/admin/'}).ok,false);
});
test('registered bookings and information links record target IDs without storing their URLs',()=>{
 const b=backend();b.setup();const token=b.login();
 for(const [collection,record] of [['experiences',{...seed.experiences[0],booking_url:'https://booking.example.test/reserve?source=site'}],['events',{...seed.events[0],url:'https://info.example.test/event?source=site'}]]){
  assert.equal(b.rpc({action:'save',token,collection,record,revision:Number(b.props.get('REVISION')||0)}).ok,true);
  const action={action:'click',page:'/',target:(collection==='experiences'?'experience:':'event:')+record.id,event_id:randomUUID()};assert.equal(b.ctx.recordView_(action).ok,true);
 }
 assert.ok(!JSON.stringify(b.sheets.get('閲覧記録').rows).includes('source=site'));
});
test('login throttles repeated guesses and public responses never include secrets',()=>{
 const b=backend();b.setup();for(let i=0;i<8;i++)b.rpc({action:'login',verifier:'wrong'});assert.equal(b.rpc({action:'login',verifier:'a'.repeat(64)}).ok,false);
 const text=JSON.stringify(b.ctx.publicData_());for(const secret of ['pepper','PASSWORD_HASH','PASSWORD_SALT','owner@example.test'])assert.ok(!text.includes(secret));
});

test('manual spreadsheet edits cannot publish a javascript URL through the public snapshot',()=>{
 const b=backend(),sheet=b.sheets.get('造り手');sheet.rows[1][sheet.rows[0].indexOf('website')]='javascript:alert(1)';assert.throws(()=>b.ctx.publicData_(),/https/);
});

test('anonymous read and view requests cannot select a different spreadsheet or return private statistics',()=>{
 const b=backend();const output=b.ctx.doGet({parameter:{action:'public',callback:'__sakeData_test',spreadsheet_id:'attacker-sheet'}});
 assert.ok(output.text.startsWith('__sakeData_test('));assert.ok(!output.text.includes('PASSWORD_HASH'));assert.ok(!output.text.includes('received_at_jst'));
 assert.equal(b.ctx.recordView_({action:'view',event_id:randomUUID(),page:'/',spreadsheet_id:'attacker-sheet'}).ok,true);
 assert.ok(b.openedSheets.length>0);assert.ok(b.openedSheets.every(id=>id==='test-sheet'));
 assert.equal(b.rpc({action:'save',token:'forged',spreadsheet_id:'attacker-sheet'}).ok,false);
});

test('photo uploads require a session and server credential, stay in the image branch and retry without duplicate writes',()=>{
 const b=backend(),base64=Buffer.from([255,216,255,224,0,0,255,217]).toString('base64');
 assert.equal(b.rpc({action:'upload',collection:'events',base64}).ok,false);assert.equal(b.imageRequests.length,0);
 b.setup();const token=b.login();assert.equal(b.rpc({action:'upload',token,collection:'events',base64}).ok,false);assert.equal(b.imageRequests.length,0);
 b.props.set('GITHUB_IMAGE_TOKEN','test-only-secret');
 const request={action:'upload',token,collection:'events',base64,repository:'attacker/repo',branch:'main'};
 const uploaded=b.rpc(request);assert.equal(uploaded.ok,true);assert.match(uploaded.path,/^uploads\/events\/[a-f0-9]{64}\.jpg$/);
 assert.equal(b.imageRequests.filter(x=>x.options.method==='post').length,1);assert.equal(b.rpc(request).path,uploaded.path);assert.equal(b.imageRequests.filter(x=>x.options.method==='put').length,1);
 const record={...seed.events[0],photo:uploaded.path};assert.equal(b.rpc({action:'save',collection:'events',record,revision:0,token}).ok,true);
 const snapshot=b.ctx.publicData_(true);assert.equal(snapshot.events[0].photo,'data:image/jpeg;base64,'+base64);assert.ok(!JSON.stringify(snapshot).includes('test-only-secret'));
 assert.equal(b.rpc({action:'photo',token,path:uploaded.path}).base64,base64);
 assert.equal(b.rpc({action:'photo',path:uploaded.path}).ok,false);
 for(const value of ['<svg>script</svg>','A'.repeat(350001),'not base64'])assert.equal(b.rpc({...request,base64:value}).ok,false);
 for(const path of ['../secret','https://evil.test/a.jpg','uploads/events/unknown.jpg'])assert.equal(b.rpc({action:'save',collection:'events',record:{...record,photo:path},revision:1,token}).ok,false);
 b.setImageFailure(true);assert.equal(b.rpc({...request,base64:Buffer.from([255,216,255,225,0,0,255,217]).toString('base64')}).ok,false);
 assert.equal(b.rpc({action:'load',token}).data.events[0].photo,uploaded.path);assert.equal(b.ctx.publicData_(true).events[0].photo,'');
});

test('the legacy event sheet gains only the trailing photo header when an authenticated save succeeds',()=>{
 const b=backend(),sheet=b.sheets.get('イベント');if(sheet.rows[0].at(-1)==='photo')sheet.rows.forEach(row=>row.pop());
 b.setup();const token=b.login();const loaded=b.rpc({action:'load',token});assert.equal(loaded.ok,true);assert.equal(loaded.data.events[0].photo,'');
 const before=structuredClone(sheet.rows);assert.equal(b.rpc({action:'save',collection:'events',record:{...seed.events[0],photo:''},revision:0,token}).ok,true);
 assert.equal(sheet.rows[0].at(-1),'photo');assert.equal(JSON.stringify(sheet.rows.map(row=>row.slice(0,8).map(String))),JSON.stringify(before.map(row=>row.map(String))));assert.equal(b.rpc({action:'load',token}).ok,true);
});
test('photo replacement and removal persist after reload and keep the original stored images',()=>{
 const b=backend();b.setup();const token=b.login();b.props.set('GITHUB_IMAGE_TOKEN','test-only-secret');
 for(const collection of ['experiences','events']){
  const photos=[224,225].map(marker=>Buffer.from([255,216,255,marker,0,0,255,217]).toString('base64'));
  const paths=[];let record={...seed[collection][0]};
  for(const base64 of photos){
   const upload=b.rpc({action:'upload',token,collection,base64});assert.equal(upload.ok,true);paths.push(upload.path);record.photo=upload.path;
   assert.equal(b.rpc({action:'save',token,collection,record,revision:Number(b.props.get('REVISION')||0)}).ok,true);
   assert.equal(b.rpc({action:'load',token}).data[collection][0].photo,upload.path);assert.equal(b.ctx.publicData_(true)[collection][0].photo,'data:image/jpeg;base64,'+base64);
  }
  assert.notEqual(paths[0],paths[1]);assert.equal(b.images.has(paths[0]),true);
  record.photo='';assert.equal(b.rpc({action:'save',token,collection,record,revision:Number(b.props.get('REVISION'))}).ok,true);assert.equal(b.rpc({action:'load',token}).data[collection][0].photo,'');assert.equal(b.ctx.publicData_(true)[collection][0].photo,'');assert.ok(paths.every(path=>b.images.has(path)));
 }
});
