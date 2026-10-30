import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { browser } from './helpers/browser.mjs';
import { renderPages } from '../scripts/site-render.mjs';
import vm from 'node:vm';
import { createHmac, createHash, randomUUID, pbkdf2Sync } from 'node:crypto';
const code=readFileSync(new URL('../apps-script/Code.gs',import.meta.url),'utf8');
const seed=Object.fromEntries(['makers','experiences','events'].map(k=>[k,JSON.parse(readFileSync(new URL(`../data/${k}.json`,import.meta.url),'utf8'))]));
function backend() {
 const props=new Map([['SPREADSHEET_ID','test-sheet'],['OWNER_EMAIL','owner@example.test'],['PASSWORD_SALT','salt'],['PASSWORD_PEPPER','pepper']]);
 const cache=new Map(),sheets=new Map(),openedSheets=[],imageRequests=[],images=new Map(); let email='owner@example.test',clock=Date.now(),imageFailure=false,imageBranch=false,lockDepth=0,checkLoginLock=false;
 class TestDate extends Date { constructor(...a){super(...(a.length?a:[clock]));} static now(){return clock;} }
 const range=(rows,r,c,n=1,w=1)=>({
  getValues:()=>Array.from({length:n},(_,i)=>Array.from({length:w},(_,j)=>rows[r-1+i]?.[c-1+j]??'')),
  getDisplayValues:()=>Array.from({length:n},(_,i)=>Array.from({length:w},(_,j)=>String(rows[r-1+i]?.[c-1+j]??''))),
  setRichTextValues:values=>{values.forEach((line,i)=>{rows[r-1+i]??=[];line.forEach((v,j)=>{rows[r-1+i][c-1+j]=v.text;});});},
  setValues:values=>{values.forEach((line,i)=>{rows[r-1+i]??=[];line.forEach((v,j)=>{rows[r-1+i][c-1+j]=v;});});}
 });
 const sheet=name=>{if(!sheets.has(name)){const rows=[];sheets.set(name,{rows,getLastRow:()=>rows.length,getLastColumn:()=>rows[0]?.length||0,getRange:(...a)=>range(rows,...a)});}return sheets.get(name);};
 const db={getSheetByName:sheet};
 const ctx=vm.createContext({Date:TestDate,JSON,URL,console,
 UrlFetchApp:{fetch:(url,options)=>{imageRequests.push({url,options});assert.ok(url.startsWith('https://api.github.com/repos/zooygoo/shimanami-sake-Public/'));let status=200,body={};const path=url.split('/contents/')[1]?.split('?')[0];if(imageFailure){status=403;}else if(path){if(options.method==='put'){const payload=JSON.parse(options.payload);assert.equal(payload.branch,'site-images');images.set(path,{content:payload.content,sha:'test-sha'});status=201;}else if(images.has(path)){body=images.get(path);}else status=404;}else if(url.endsWith('/git/ref/heads/site-images')&&!imageBranch)status=404;else if(url.endsWith('/git/refs')&&options.method==='post'){assert.deepEqual(JSON.parse(options.payload),{ref:'refs/heads/site-images',sha:'base-sha'});imageBranch=true;status=201;}else if(url.includes('/git/ref/heads/'))body={object:{sha:'base-sha'}};return {getResponseCode:()=>status,getContentText:()=>JSON.stringify(body)};}},
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k)||null,setProperty:(k,v)=>props.set(k,v)})},
 CacheService:{getScriptCache:()=>({get:k=>{if(checkLoginLock&&k==='login-failures')assert.ok(lockDepth>0,'login failure count must be read under the shared lock');const x=cache.get(k);return x&&x.expires>clock?x.value:null;},put:(k,v,ttl)=>{if(checkLoginLock&&k==='login-failures')assert.ok(lockDepth>0,'login failure count must be updated under the shared lock');cache.set(k,{value:v,expires:clock+ttl*1000});},remove:k=>cache.delete(k)})},
 LockService:{getScriptLock:()=>({waitLock(){lockDepth++;},releaseLock(){lockDepth--;}})},
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
 return {ctx,props,sheets,requireLoginLock:()=>{checkLoginLock=true;},lockDepth:()=>lockDepth,openedSheets,imageRequests,images,rpc,setup,login,clearCache:()=>cache.clear(),setImageFailure:v=>{imageFailure=v;},setEmail:v=>{email=v;},advance:ms=>{clock+=ms;}};
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

function httpAdmin(server,request){return JSON.parse(server.ctx.doPost({postData:{contents:JSON.stringify({api:'admin-v1',...request})}}).text);}
test('site admin bootstrap exposes only connection flags and public salt without a Google account',()=>{
 const b=backend();b.setup();b.setEmail('');const before=JSON.stringify([...b.props]);
 const result=JSON.parse(b.ctx.doGet({parameter:{action:'admin-bootstrap'}}).text);
 assert.deepEqual(result,{ok:true,apiVersion:1,connected:true,photosReady:false,salt:'salt',needsSetup:false});
 for(const secret of ['PASSWORD_HASH','PASSWORD_PEPPER','owner@example.test','pepper','test-sheet'])assert.ok(!JSON.stringify(result).includes(secret));
 assert.equal(JSON.stringify([...b.props]),before);
});
test('site admin HTTP retains session checks and existing save, photo and statistics functions',()=>{
 const b=backend();b.setup();b.setEmail('');b.props.set('GITHUB_IMAGE_TOKEN','server-only-token');
 for(const action of ['load','stats','save','upload','photo'])assert.equal(httpAdmin(b,{action,token:'forged'}).ok,false,action);
 assert.equal(httpAdmin(b,{action:'login',verifier:'b'.repeat(64)}).ok,false);
 const {token}=httpAdmin(b,{action:'login',verifier:'a'.repeat(64)});assert.ok(token);
 assert.equal(httpAdmin(b,{action:'load',token}).data.makers.length,5);
 assert.equal(httpAdmin(b,{action:'save',token,collection:'experiences',record:{...seed.experiences[0],title:'サイトから保存'},revision:0}).ok,true);
 assert.equal(httpAdmin(b,{action:'load',token}).data.experiences[0].title,'サイトから保存');
 const base64=Buffer.from([255,216,255,224,...Array(4096).fill(0),255,217]).toString('base64');
 const photo=httpAdmin(b,{action:'upload',token,collection:'experiences',base64});assert.equal(photo.ok,true);
 assert.equal(httpAdmin(b,{action:'photo',token,path:photo.path}).base64,base64);
 assert.ok(httpAdmin(b,{action:'stats',token}).dashboard);
 assert.equal(httpAdmin(b,{action:'logout',token}).ok,true);assert.equal(httpAdmin(b,{action:'load',token}).ok,false);
 const expired=httpAdmin(b,{action:'login',verifier:'a'.repeat(64)}).token;b.advance(3601000);assert.equal(httpAdmin(b,{action:'load',token:expired}).ok,false);
});
test('site admin HTTP cannot initialize credentials, bypass request limits or append visitor records',()=>{
 const b=backend(),rows=b.sheets.get('閲覧記録').rows,before=JSON.stringify(rows);
 assert.equal(httpAdmin(b,{action:'setup',verifier:'a'.repeat(64)}).ok,false);assert.equal(b.props.has('PASSWORD_HASH'),false);
 assert.equal(httpAdmin(b,{action:'view',page:'/',event_id:randomUUID()}).ok,false);
 assert.equal(httpAdmin(b,{action:'__proto__'}).ok,false);
 for(const contents of ['{','null','[]',JSON.stringify({api:'admin-v1',action:'login',padding:'a'.repeat(400000)})])assert.equal(JSON.parse(b.ctx.doPost({postData:{contents}}).text).ok,false);
 assert.equal(JSON.stringify(rows),before);
 const view={action:'view',page:'/',event_id:randomUUID()};assert.equal(JSON.parse(b.ctx.doPost({postData:{contents:JSON.stringify(view)}}).text).ok,true);
 assert.equal(rows.length,2,'ordinary visitor collection still works');
});
test('authenticated edits persist in Sheets and are returned by the public snapshot',()=>{
 const b=backend();b.setup();const token=b.login(),record={...seed.makers[0],description:'更新しました <script> & =SUM(A1)'};
 assert.equal(b.rpc({action:'save',token,collection:'makers',record,revision:0}).ok,true);
 const state=b.rpc({action:'load',token});assert.equal(state.data.makers[0].description,record.description);assert.equal(state.revision,1);
 const publicData=b.ctx.publicData_();assert.equal(publicData.makers[0].description,record.description);assert.equal(publicData.token,undefined);assert.equal(publicData.views,undefined);
});
async function adminPage(server,token){
 const fixture=await mkdtemp(join(tmpdir(),'sake-admin-flow-'));let client;
 try{
  const source=readFileSync(new URL('../apps-script/Admin.html',import.meta.url),'utf8');
  const logo='data:image/png;base64,'+readFileSync(new URL('../assets/brand/shimanami-logo.png',import.meta.url)).toString('base64');
  await writeFile(join(fixture,'index.html'),source.replace('__LOGO_DATA__',logo).replace('__BOOTSTRAP_JSON__',JSON.stringify({connected:true,salt:'salt',photosReady:!!server.props.get('GITHUB_IMAGE_TOKEN')})));
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
  return {client,fixture,saves,waitFor,open:()=>client.open(pathToFileURL(join(fixture,'index.html')).href,390,900),close:async()=>{await client.close();await rm(fixture,{recursive:true,force:true});}};
 }catch(error){if(client)await client.close();await rm(fixture,{recursive:true,force:true});throw error;}
}
test('maker form requests pass the real server validation and persist description and order',async()=>{
 const server=backend();server.setup();const token=server.login();
 const {client,saves,waitFor,close}=await adminPage(server,token);
 try{
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
 }finally{await close();}
});
test('stale concurrent edits and injected or invalid fields cannot overwrite data',()=>{
 const b=backend();b.setup();const token=b.login();assert.equal(b.rpc({action:'save',token,collection:'makers',record:seed.makers[0],revision:0}).ok,true);
 assert.equal(b.rpc({action:'save',token,collection:'makers',record:{...seed.makers[0],name:'stale'},revision:0}).ok,false);
 for(const record of [{...seed.events[0],end_date:'2020-01-01'},{...seed.events[0],url:'javascript:alert(1)'},{...seed.events[0],unknown:'injection'}])assert.equal(b.rpc({action:'save',token,collection:'events',record,revision:1}).ok,false);
 assert.equal(b.rpc({action:'load',token}).data.makers[0].name,seed.makers[0].name);
});
test('adding an experience or event with an existing ID cannot overwrite it',()=>{
 const b=backend();b.setup();const token=b.login();
 for(const collection of ['experiences','events']){
  const record={...seed[collection][0],title:'重複した新規登録'};
  const result=b.rpc({action:'save',token,collection,record,revision:0,create:true});
  assert.equal(result.ok,false,collection);assert.match(result.error,/すでに/);
  assert.deepEqual(b.rpc({action:'load',token}).data[collection],seed[collection]);
  assert.equal(b.props.get('REVISION'),undefined);
 }
});
for(const collection of ['experiences','events'])test(`${collection}: text-only registration, duplicate rejection and relogin preserve every existing row without photo credentials`,async()=>{
 const server=backend();server.setup();
 const password=randomUUID();
 server.props.set('PASSWORD_HASH',server.ctx.hash_(pbkdf2Sync(password,'salt',600000,32,'sha256').toString('hex')));
 const token=server.rpc({action:'login',verifier:pbkdf2Sync(password,'salt',600000,32,'sha256').toString('hex')}).token;
 const before=new Map([...server.sheets].map(([name,sheet])=>[name,JSON.stringify(sheet.rows)]));
 const {client,saves,waitFor,close}=await adminPage(server,token);
 const id='text-only-'+collection,title='登録確認 <>&',description='=SUM(A1) 写真なしの紹介文';
 const submit=async()=>{
  const count=saves.length;
  await client.evaluate("document.getElementById('preview').click();document.getElementById('review-save').click()");
  await waitFor("!document.getElementById('save').disabled");
  assert.equal(saves.length,count+1);return saves.at(-1).result;
 };
 try{
  await client.evaluate(`document.querySelector('[data-section=${collection}]').click();document.getElementById('add').click();document.getElementById('input-id').value=${JSON.stringify(id)};document.getElementById('input-title').value=${JSON.stringify(title)};document.getElementById('input-description').value=${JSON.stringify(description)};document.getElementById('input-sample').checked=true;`+(collection==='events'?"document.getElementById('input-start_date').value='2099-01-01';document.getElementById('input-end_date').value='2099-01-02';":''));
  assert.equal(await client.evaluate("document.getElementById('photo-choose').disabled"),true);
  assert.deepEqual(await submit(),{ok:true,revision:1});
  const loaded=server.rpc({action:'load',token});
  const record=loaded.data[collection].find(x=>x.id===id);
  assert.equal(record.title,title);assert.equal(record.description,description);assert.equal(record.photo,'');
  assert.deepEqual(loaded.data[collection].slice(0,-1),seed[collection]);
  const sheetName=server.ctx.definition_(collection).name;
  for(const [name,rows] of before)assert.equal(JSON.stringify(name===sheetName?server.sheets.get(name).rows.slice(0,-1):server.sheets.get(name).rows),rows);
  const savedRows=new Map([...server.sheets].map(([name,sheet])=>[name,JSON.stringify(sheet.rows)]));
  await client.evaluate(`document.getElementById('add').click();document.getElementById('input-id').value=${JSON.stringify(id)};document.getElementById('input-title').value='重複で変更しない';`+(collection==='events'?"document.getElementById('input-start_date').value='2099-01-01';document.getElementById('input-end_date').value='2099-01-02';":''));
  const duplicate=await submit();assert.equal(duplicate.ok,false);assert.match(duplicate.error,/すでに/);
  assert.equal(server.props.get('REVISION'),'1');
  for(const [name,rows] of savedRows)assert.equal(JSON.stringify(server.sheets.get(name).rows),rows);
  await client.evaluate("document.getElementById('review-back').click();document.getElementById('logout').click()");
  await waitFor("document.getElementById('workspace').hidden");
  assert.equal(server.rpc({action:'save',token,collection,record:{...record,title:'拒否する変更'},revision:1}).ok,false);
  await client.evaluate(`document.getElementById('password').value=${JSON.stringify(password)};document.getElementById('login').requestSubmit()`);
  await waitFor("!document.getElementById('workspace').hidden");
  const fresh=await client.evaluate("sessionStorage.getItem('shimanami.admin.session')");
  assert.ok(fresh);assert.notEqual(fresh,token);
  const index=loaded.data[collection].findIndex(x=>x.id===id);
  await client.evaluate(`document.querySelector('[data-section=${collection}]').click();document.getElementById('record').value=${JSON.stringify(String(index))};document.getElementById('record').dispatchEvent(new Event('change'))`);
  assert.equal(await client.evaluate("document.getElementById('input-title').value"),title);
  assert.equal(await client.evaluate("document.getElementById('input-description').value"),description);
  assert.deepEqual(server.rpc({action:'load',token:fresh}).data,loaded.data);
  const publicData=server.ctx.publicData_(true),home=renderPages(publicData.makers,publicData.experiences,publicData.events).get('index.html');
  assert.ok(home.includes('登録確認 &lt;&gt;&amp;'));assert.ok(home.includes(description));
  assert.equal(server.imageRequests.length,0);assert.equal(server.props.get('GITHUB_IMAGE_TOKEN'),undefined);
  for(const [name,rows] of savedRows)assert.equal(JSON.stringify(server.sheets.get(name).rows),rows);
 }finally{await close();}
});
for(const collection of ['experiences','events'])test(`${collection}: new entry, duplicate rejection and photo lifecycle use the real server`,async()=>{
 const server=backend();server.setup();const token=server.login();server.props.set('GITHUB_IMAGE_TOKEN','test-only-secret');
 const {client,saves,waitFor,open,close}=await adminPage(server,token);
 const id='new-'+collection,title='新しい内容 <>&',description='=SUM(A1) <script>window.injected=true</script>';
 const loaded=()=>server.rpc({action:'load',token}).data[collection];
 const record=()=>loaded().find(x=>x.id===id);
 const publicHome=()=>{const data=server.ctx.publicData_(true);return renderPages(data.makers,data.experiences,data.events).get('index.html');};
 const submit=async(review=false)=>{
  const count=saves.length;
  await client.evaluate(review?"document.getElementById('preview').click();document.getElementById('review-save').click()":"document.getElementById('edit-form').requestSubmit()");
  await waitFor("!document.getElementById('save').disabled");
  assert.equal(saves.length,count+1);return saves.at(-1).result;
 };
 const selectPhoto=async color=>{
  await client.evaluate(`{const canvas=document.createElement('canvas');canvas.width=32;canvas.height=24;const context=canvas.getContext('2d');context.fillStyle=${JSON.stringify(color)};context.fillRect(0,0,32,24);const bytes=Uint8Array.from(atob(canvas.toDataURL('image/png').split(',')[1]),c=>c.charCodeAt(0));const transfer=new DataTransfer();transfer.items.add(new File([bytes],'確認用の長い写真名.png',{type:'image/png'}));const input=document.getElementById('input-photo');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));}`);
  await waitFor("!document.getElementById('save').disabled&&!document.getElementById('photo-preview').hidden");
 };
 try{
  await client.evaluate(`document.querySelector('[data-section=${collection}]').click();document.getElementById('add').click();document.getElementById('input-id').value=${JSON.stringify(seed[collection][0].id)};document.getElementById('input-title').value=${JSON.stringify(title)};document.getElementById('input-description').value=${JSON.stringify(description)};`+(collection==='events'?"document.getElementById('input-start_date').value='2099-01-01';document.getElementById('input-end_date').value='2099-01-02';":''));
  const duplicate=await submit();assert.equal(duplicate.ok,false);assert.match(duplicate.error,/すでに/);
  assert.deepEqual(loaded(),seed[collection]);assert.equal(server.props.get('REVISION'),undefined);
  assert.equal(await client.evaluate("document.getElementById('input-title').value"),title);
  await client.evaluate(`document.getElementById('input-id').value=${JSON.stringify(id)}`);
  await selectPhoto('#00508E');assert.equal(server.images.size,0);
  await client.evaluate("document.getElementById('preview').click()");
  assert.equal(server.images.size,0);assert.equal(await client.evaluate('window.injected'),undefined);
  await client.evaluate("document.getElementById('review-back').click()");
  server.setImageFailure(true);await client.evaluate("document.getElementById('edit-form').requestSubmit()");
  await waitFor("!document.getElementById('save').disabled&&document.getElementById('status').textContent.includes('接続できません')");
  assert.equal(saves.length,1);assert.equal(record(),undefined);
  assert.equal(await client.evaluate("document.getElementById('input-title').value"),title);
  assert.equal(await client.evaluate("document.getElementById('photo-preview').hidden"),false);
  server.setImageFailure(false);assert.equal((await submit(true)).ok,true);
  assert.equal(record().title,title);assert.equal(record().description,description);assert.equal(record().sample,false);
  assert.match(record().photo,new RegExp('^uploads/'+collection+'/[a-f0-9]{64}\\.jpg$'));
  assert.equal(server.images.size,1);assert.deepEqual(loaded().slice(0,-1),seed[collection]);
  const firstPath=record().photo,firstContent=server.images.get(firstPath).content;
  assert.ok(publicHome().includes('data:image/jpeg;base64,'+firstContent));
  assert.ok(publicHome().includes('新しい内容 &lt;&gt;&amp;'));
  await waitFor("document.getElementById('photo-preview').naturalWidth===32");
  for(const width of [390,1366]){
   await client.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
   assert.equal(await client.evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
  }
  await open();await waitFor("!document.getElementById('workspace').hidden");
  const index=loaded().findIndex(x=>x.id===id);
  await client.evaluate(`document.querySelector('[data-section=${collection}]').click();document.getElementById('record').value=${JSON.stringify(String(index))};document.getElementById('record').dispatchEvent(new Event('change'))`);
  await waitFor("document.getElementById('photo-preview').naturalWidth===32");
  assert.equal(await client.evaluate("document.getElementById('input-title').value"),title);
  await selectPhoto('#18958D');assert.equal(server.images.size,1);
  assert.equal((await submit()).ok,true);assert.equal(saves.at(-1).request.create,false);
  assert.notEqual(record().photo,firstPath);assert.equal(server.images.size,2);
  assert.ok(publicHome().includes('data:image/jpeg;base64,'+server.images.get(record().photo).content));
  await client.evaluate("document.getElementById('photo-remove').click()");
  assert.equal((await submit()).ok,true);assert.equal(record().photo,'');assert.equal(server.images.size,2);
  assert.equal(server.images.get(firstPath).content,firstContent);assert.ok(!publicHome().includes('data:image/jpeg;base64,'));
  assert.deepEqual(server.rpc({action:'load',token}).data.makers,seed.makers);
  const before=structuredClone(loaded());await client.evaluate("document.getElementById('logout').click()");
  await waitFor("document.getElementById('workspace').hidden");
  assert.equal(server.rpc({action:'save',token,collection,record:{...before.at(-1),title:'ログアウト後'},revision:3}).ok,false);
  assert.deepEqual(JSON.parse(JSON.stringify(server.ctx.publicData_()[collection])),before);
 }finally{await close();}
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

test('maker media persists in existing columns and resolves publicly without exposing credentials',()=>{
 const b=backend();b.setup();const token=b.login();b.props.set('GITHUB_IMAGE_TOKEN','test-only-secret');
 const before=structuredClone([...b.sheets].map(([name,sheet])=>[name,sheet.rows]));
 const base64=Buffer.from([255,216,255,224,0,0,255,217]).toString('base64');
 assert.equal(b.rpc({action:'upload',collection:'makers',base64}).ok,false);
 const uploaded=b.rpc({action:'upload',collection:'makers',token,base64});
 assert.equal(uploaded.ok,true);assert.match(uploaded.path,/^uploads\/makers\/[a-f0-9]{64}\.jpg$/);
 const record={...seed.makers[0],logo:uploaded.path,photos:[uploaded.path,'photos/winery-tanks.jpg']};
 assert.deepEqual(b.rpc({action:'save',collection:'makers',token,record,revision:0}),{ok:true,revision:1});
 assert.deepEqual(b.rpc({action:'load',token}).data.makers[0],record);
 const snapshot=JSON.parse(JSON.stringify(b.ctx.publicData_(true)));
 assert.equal(snapshot.makers[0].logo,'data:image/jpeg;base64,'+base64);
 assert.deepEqual(snapshot.makers[0].photos,['data:image/jpeg;base64,'+base64,'photos/winery-tanks.jpg']);
 assert.ok(!JSON.stringify(snapshot).includes('test-only-secret'));
 assert.equal(JSON.stringify(b.sheets.get('造り手').rows[0]),JSON.stringify(before[0][1][0]));
 assert.equal(JSON.stringify(b.sheets.get('造り手').rows.slice(2)),JSON.stringify(before[0][1].slice(2)));
 assert.equal(JSON.stringify(b.sheets.get('体験').rows),JSON.stringify(before[1][1]));assert.equal(JSON.stringify(b.sheets.get('イベント').rows),JSON.stringify(before[2][1]));
 b.setImageFailure(true);
 assert.equal(b.rpc({action:'save',collection:'makers',token,record:{...record,description:'障害中の文章変更',photos:[...record.photos].reverse()},revision:1}).ok,true);
 assert.equal(b.rpc({action:'save',collection:'makers',token,record:{...record,logo:'',photos:[]},revision:2}).ok,true);
 assert.equal(b.images.size,1,'removing display never deletes the stored image');
});
test('maker media rejects invalid paths, missing files, excess photos and coordinate changes without writes',()=>{
 const b=backend();b.setup();const token=b.login(),record=seed.makers[0],before=structuredClone(b.sheets.get('造り手').rows);
 const invalid=[{logo:'https://evil.test/logo.jpg'},{logo:'../private.jpg'},{logo:'uploads/events/'+'a'.repeat(64)+'.jpg'},{logo:'uploads/makers/'+'a'.repeat(64)+'.jpg'},{photos:[{}]},{photos:['javascript:alert(1)']},{photos:Array(7).fill('photos/winery-tanks.jpg')},{lat:1}];
 for(const fields of invalid)assert.equal(b.rpc({action:'save',collection:'makers',token,record:{...record,...fields},revision:0}).ok,false,JSON.stringify(fields));
 assert.equal(JSON.stringify(b.sheets.get('造り手').rows),JSON.stringify(before));assert.equal(b.props.get('REVISION'),undefined);
});
test('maker media editor uploads only on save, retains a failed selection and persists order and removals',async()=>{
 const server=backend();server.setup();server.props.set('GITHUB_IMAGE_TOKEN','test-only-secret');const token=server.login();
 const {client,saves,waitFor,close}=await adminPage(server,token);
 try{
  const base64=readFileSync(new URL('../assets/makers/omishima-brewery.png',import.meta.url)).toString('base64');
  async function choose(selector){await client.evaluate(`(()=>{const bytes=Uint8Array.from(atob(${JSON.stringify(base64)}),c=>c.charCodeAt(0)),transfer=new DataTransfer();transfer.items.add(new File([bytes],'test-logo.png',{type:'image/png'}));const input=document.querySelector(${JSON.stringify(selector)});input.files=transfer.files;input.dispatchEvent(new Event('change'));})()`);await waitFor("!document.getElementById('save').disabled");}
  await choose('#input-logo input[type=file]');
  assert.equal(server.imageRequests.length,0,'selecting an image must not upload');
  await client.evaluate("document.getElementById('preview').click()");
  assert.equal(await client.evaluate("document.querySelector('#review-fields .logo-preview').src.startsWith('data:image/jpeg;base64,')"),true);
  await client.evaluate("document.getElementById('review-back').click()");
  server.setImageFailure(true);
  await client.evaluate("document.getElementById('edit-form').requestSubmit()");await waitFor("!document.getElementById('save').disabled");
  assert.equal(saves.length,0);assert.equal(await client.evaluate("document.querySelector('#input-logo img').src.startsWith('data:image/jpeg;base64,')"),true);
  server.setImageFailure(false);
  await client.evaluate("document.getElementById('edit-form').requestSubmit()");await waitFor("!document.getElementById('save').disabled");
  assert.equal(saves.at(-1).result.ok,true);assert.match(server.rpc({action:'load',token}).data.makers[0].logo,/^uploads\/makers\//);
  await client.evaluate("[...document.querySelectorAll('#input-logo button')].find(x=>x.textContent==='元のロゴに戻す').click();document.getElementById('edit-form').requestSubmit()");await waitFor("!document.getElementById('save').disabled");
  assert.equal(server.rpc({action:'load',token}).data.makers[0].logo,seed.makers[0].logo);
  const winery=seed.makers.findIndex(x=>x.id==='omishima-winery');
  await client.evaluate(`document.getElementById('record').value=${JSON.stringify(String(winery))};document.getElementById('record').dispatchEvent(new Event('change'))`);
  await client.evaluate("[...document.querySelectorAll('#input-photos .maker-media-row')][1].querySelectorAll('button')[2].click();document.getElementById('edit-form').requestSubmit()");await waitFor("!document.getElementById('save').disabled");
  const expected=[...seed.makers[winery].photos];[expected[0],expected[1]]=[expected[1],expected[0]];
  assert.deepEqual(server.rpc({action:'load',token}).data.makers[winery].photos,expected);
  await client.evaluate("document.querySelector('#input-photos .maker-media-row button:nth-child(2)').click();document.getElementById('edit-form').requestSubmit()");await waitFor("!document.getElementById('save').disabled");
  assert.deepEqual(server.rpc({action:'load',token}).data.makers[winery].photos,expected.slice(1));
  await choose('#input-photos > input[type=file]');
  await client.evaluate("document.getElementById('preview').click()");
  assert.equal(await client.evaluate("document.querySelectorAll('#review-fields img').length"),5);
  await client.evaluate("document.getElementById('review-save').click()");await waitFor("!document.getElementById('save').disabled");
  const added=server.rpc({action:'load',token}).data.makers[winery].photos;
  assert.equal(added.length,4);assert.deepEqual(added.slice(0,3),expected.slice(1));assert.match(added[3],/^uploads\/makers\//);
  await client.evaluate("document.querySelector('[data-section=experiences]').click()");
  assert.equal(await client.evaluate("document.getElementById('input-maker_id').tagName"),'SELECT');
  assert.equal(await client.evaluate("document.getElementById('input-maker_id').options.length"),6);
 }finally{await close();}
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


test('saving an existing item uses its real sheet row when blank rows precede it',()=>{
 for(const collection of ['makers','experiences','events']){
  const b=backend();b.setup();const token=b.login(),def=b.ctx.definition_(collection),sheet=b.sheets.get(def.name);
  sheet.rows.splice(1,0,Array(def.fields.length).fill(''));
  const before=structuredClone(sheet.rows),record={...seed[collection][1],description:'空行の後の項目を更新'};
  assert.equal(b.rpc({action:'save',token,collection,record,revision:0}).ok,true);
  assert.deepEqual(JSON.parse(JSON.stringify(sheet.rows[1])),before[1]);
  assert.deepEqual(JSON.parse(JSON.stringify(sheet.rows[2])),before[2]);
  assert.equal(sheet.rows[3][0],record.id);
  assert.equal(sheet.rows[3][def.fields.indexOf('description')],record.description);
  assert.deepEqual(JSON.parse(JSON.stringify(sheet.rows.slice(4))),before.slice(4));
  const revision=b.props.get('REVISION');
  assert.equal(b.rpc({action:'save',token,collection,record,revision:Number(revision),create:true}).ok,false);
  assert.equal(b.props.get('REVISION'),revision);
 }
});
test('login attempts keep the shared lock through count checks and release it on success and rejection',()=>{
 const b=backend();b.setup();b.requireLoginLock();
 for(let i=0;i<8;i++){
  const result=b.rpc({action:'login',verifier:'b'.repeat(64)});
  assert.equal(result.ok,false);assert.match(result.error,/パスワードが正しくありません/);assert.equal(b.lockDepth(),0);
 }
 assert.match(b.rpc({action:'login',verifier:'a'.repeat(64)}).error,/しばらく待って/);
 assert.equal(b.lockDepth(),0);b.advance(900001);
 assert.ok(b.login());assert.equal(b.lockDepth(),0);
});

test('text-only edits keep an existing uploaded photo during image storage outages',()=>{
 const b=backend();b.setup();b.props.set('GITHUB_IMAGE_TOKEN','test-only-secret');const token=b.login();
 const base64=Buffer.from([255,216,255,224,0,0,255,217]).toString('base64');
 for(const collection of ['experiences','events']){
  b.setImageFailure(false);
  const path=b.rpc({action:'upload',token,collection,base64}).path;
  const original={...seed[collection][0],photo:path};
  const save=record=>b.rpc({action:'save',token,collection,record,revision:Number(b.props.get('REVISION')||0)});
  assert.equal(save(original).ok,true);b.setImageFailure(true);
  const requests=b.imageRequests.length,edited={...original,description:'写真接続障害中の文章変更'};
  assert.deepEqual(save(edited),{ok:true,revision:Number(b.props.get('REVISION'))});
  assert.equal(b.imageRequests.length,requests,'unchanged photo must not require remote image access');
  assert.deepEqual(b.rpc({action:'load',token}).data[collection][0],edited);
  const revision=b.props.get('REVISION'),rows=JSON.stringify(b.sheets.get(b.ctx.definition_(collection).name).rows);
  for(const record of [{...edited,photo:'uploads/'+collection+'/'+'b'.repeat(64)+'.jpg'},{...edited,id:'new-photo-record'}]){
   assert.equal(save(record).ok,false,'new or changed uploaded photos must still be checked');
   assert.equal(b.props.get('REVISION'),revision);assert.equal(JSON.stringify(b.sheets.get(b.ctx.definition_(collection).name).rows),rows);
  }
  assert.equal(save({...edited,photo:''}).ok,true);assert.equal(b.images.has(path),true);
 }
});

for(const collection of ['experiences','events'])test(`${collection}: browser text save survives a real server image outage`,async()=>{
 const server=backend();server.setup();server.props.set('GITHUB_IMAGE_TOKEN','test-only-secret');const token=server.login();
 const base64=Buffer.from([255,216,255,224,0,0,255,217]).toString('base64');
 const path=server.rpc({action:'upload',token,collection,base64}).path;
 assert.equal(server.rpc({action:'save',token,collection,record:{...seed[collection][0],photo:path},revision:0}).ok,true);
 server.setImageFailure(true);
 const {client,saves,waitFor,close}=await adminPage(server,token);
 try{
  await client.evaluate(`document.querySelector('[data-section=${collection}]').click();const input=document.getElementById('input-description');input.value='写真が読めなくても文章を保存';input.dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('edit-form').requestSubmit()`);
  await waitFor("!document.getElementById('save').disabled");
  assert.equal(saves.length,1);assert.equal(saves[0].result.ok,true);
  assert.match(await client.evaluate("document.getElementById('status').textContent"),/保存しました/);
  assert.equal(await client.evaluate("document.getElementById('input-description').value"),'写真が読めなくても文章を保存');
  const saved=server.rpc({action:'load',token}).data[collection][0];
  assert.equal(saved.photo,path);assert.equal(saved.description,'写真が読めなくても文章を保存');assert.equal(server.images.get(path).content,base64);
 }finally{await close();}
});

test('expired session logout is repeatable without reviving access or ending another session',()=>{
 const b=backend();b.setup();const expired=b.login();b.advance(1800000);const other=b.login();b.advance(1801000);
 assert.equal(b.rpc({action:'load',token:expired}).ok,false);
 for(let i=0;i<2;i++)assert.deepEqual(b.rpc({action:'logout',token:expired}),{ok:true});
 for(const action of ['load','stats','save','upload','photo'])assert.equal(b.rpc({action,token:expired}).ok,false);
 assert.equal(b.rpc({action:'load',token:other}).ok,true);
 for(const token of [undefined,null,'',{},123])assert.equal(b.rpc({action:'logout',token}).ok,false);
 assert.equal(b.rpc({action:'logout',token:other}).ok,true);assert.equal(b.rpc({action:'load',token:other}).ok,false);
 const fresh=b.login();assert.equal(b.rpc({action:'load',token:fresh}).ok,true);
});

test('browser clears an expired session on logout and can log in again',async()=>{
 const server=backend();server.setup();const token=server.login();
 const {client,waitFor,close}=await adminPage(server,token);
 try{
  server.advance(3601000);
  await client.evaluate("document.getElementById('logout').click()");
  await waitFor("document.getElementById('workspace').hidden");
  assert.equal(await client.evaluate("sessionStorage.getItem('shimanami.admin.session')"),null);
  assert.match(await client.evaluate("document.getElementById('status').textContent"),/ログアウトしました/);
  server.props.set('PASSWORD_HASH',server.ctx.hash_(pbkdf2Sync('1234','salt',600000,32,'sha256').toString('hex')));
  await client.evaluate("document.getElementById('password').value='1234';document.getElementById('login').requestSubmit()");
  await waitFor("!document.getElementById('workspace').hidden");
  const fresh=await client.evaluate("sessionStorage.getItem('shimanami.admin.session')");
  assert.ok(fresh);assert.notEqual(fresh,token);assert.equal(server.rpc({action:'load',token:fresh}).ok,true);
  assert.equal(server.rpc({action:'load',token}).ok,false);
 }finally{await close();}
});

test('legacy view-only statistics distinguish unmeasured clicks from measured zero',()=>{
 const b=backend();b.setup();const token=b.login(),rows=b.sheets.get('閲覧記録').rows;
 rows.push(['2026-10-28 12:00:00','2026-10-28','/',randomUUID()]);const before=JSON.stringify(rows);
 const legacy=b.rpc({action:'stats',token});assert.equal(legacy.clicksMeasured,false);assert.equal(legacy.counts.total,1);
 assert.equal(JSON.stringify(rows),before,'reading statistics must preserve the legacy sheet');
 assert.equal(b.ctx.recordView_({action:'view',page:'/',event_id:randomUUID()}).ok,true);
 const measured=b.rpc({action:'stats',token});assert.equal(measured.clicksMeasured,true);assert.equal(measured.clicks.total,0);
 assert.equal(b.ctx.recordView_({action:'click',page:'/',target:'maker:omishima-winery:website',event_id:randomUUID()}).ok,true);
 assert.equal(b.rpc({action:'stats',token}).clicks.total,1);
});

test('dashboard filters every metric by inclusive Japan dates and exclusive end time without writing records',()=>{
 const b=backend();b.advance(Date.parse('2026-11-01T03:00:00Z')-b.ctx.Date.now());b.setup();const token=b.login(),rows=b.sheets.get('閲覧記録').rows;
 rows[0].push('action','target');
 const add=(stamp,page='/',action='view',target='')=>rows.push([stamp,stamp.slice(0,10),page,randomUUID(),action,target]);
 add('2026-10-31 08:59:59');add('2026-10-31 09:00:00');add('2026-10-31 09:30:00','/makers/omishima-winery/');
 add('2026-10-31 09:40:00','/','click','experience:'+seed.experiences[0].id);
 add('2026-10-31 09:50:00','/','click','event:'+seed.events[0].id);
 add('2026-10-31 09:55:00','/','click','maker:omishima-winery:website');
 add('2026-10-31 10:00:00');add('2026-11-01 09:00:00');add('2026-11-02 09:00:00');
 const before=JSON.stringify(rows),stats=b.rpc({action:'stats',token,startDate:'2026-10-31',endDate:'2026-10-31',startTime:'09:00',endTime:'10:00'});
 assert.equal(stats.ok,true);assert.deepEqual(stats.dashboard.totals,{views:2,makers:1,experiences:1,events:1});
 assert.deepEqual(stats.dashboard.daily,[['2026-10-31',2]]);assert.equal(stats.dashboard.hourly[9][1],2);
 assert.equal(stats.dashboard.hourly.reduce((sum,x)=>sum+x[1],0),2);
 assert.deepEqual(stats.dashboard.pages,{'/':1,'/makers/omishima-winery/':1});
 assert.equal(stats.dashboard.links['maker:omishima-winery:website'],1);
 assert.equal(JSON.stringify(rows),before);
 const both=b.rpc({action:'stats',token,startDate:'2026-10-31',endDate:'2026-11-01',startTime:'09:00',endTime:'10:00'});
 assert.equal(both.dashboard.totals.views,3);assert.deepEqual(both.dashboard.popularDays,[['2026-10-31',2],['2026-11-01',1]]);
 const empty=b.rpc({action:'stats',token,startDate:'2026-10-01',endDate:'2026-10-01'});
 assert.deepEqual(empty.dashboard.totals,{views:0,makers:0,experiences:0,events:0});
 const onlyEnd=b.rpc({action:'stats',token,endDate:'2026-10-01'});assert.equal(onlyEnd.dashboard.totals.views,0);assert.equal(onlyEnd.dashboard.range.startDate,'2026-10-01');
 const onlyStart=b.rpc({action:'stats',token,startDate:'2026-11-02'});assert.equal(onlyStart.dashboard.totals.views,0);assert.equal(onlyStart.dashboard.range.endDate,'2026-11-02');
});

test('dashboard accepts Sheets dates and serials, rejects invalid rows and preserves unmeasured clicks',()=>{
 const b=backend();b.advance(Date.parse('2026-11-01T03:00:00Z')-b.ctx.Date.now());b.setup();const token=b.login(),rows=b.sheets.get('閲覧記録').rows;
 const day=(Date.UTC(2026,9,31)-Date.UTC(1899,11,30))/86400000;
 rows.push([new Date('2026-10-31T00:00:00Z'),new Date('2026-10-30T15:00:00Z'),'/',randomUUID()]);
 rows.push([day+9/24,day,'/makers/omishima-winery/',randomUUID()]);
 rows.push(['2026/10/31 09:30:00','2026/10/31','/',randomUUID()]);
 for(const row of [['2026-02-30 09:00:00','2026-02-30'],['2026-10-31 25:00:00','2026-10-31'],['2026-11-01 13:00:00','2026-11-01']])rows.push([...row,'/',randomUUID()]);
 rows.push(['2026-10-31 09:00:00','2026-10-31','/admin/',randomUUID()]);
 const stats=b.rpc({action:'stats',token,startDate:'2026-10-31',endDate:'2026-10-31',startTime:'09:00',endTime:'10:00'});
 assert.equal(stats.ok,true);assert.equal(stats.dashboard.totals.views,3);assert.equal(stats.dashboard.totals.experiences,null);assert.equal(stats.dashboard.totals.events,null);
 assert.equal(stats.dashboard.hourly[9][1],3);assert.equal(stats.dashboard.skipped,4);assert.equal(stats.clicksMeasured,false);
});

test('dashboard rejects invalid and reversed filters on the authenticated server',()=>{
 const b=backend();b.setup();const token=b.login();
 for(const filters of [{startDate:'2026-02-30'},{startDate:'2026-10-31',endDate:'2026-10-01'},{startTime:'10:00',endTime:'09:00'},{startTime:'24:00'},{endTime:'25:00'},{startDate:[]},{endDate:'<script>'}])assert.equal(b.rpc({action:'stats',token,...filters}).ok,false,JSON.stringify(filters));
 assert.equal(b.rpc({action:'stats',token,startDate:'2026-10-31',endDate:'2026-10-31',startTime:'00:00',endTime:'24:00'}).ok,true);
});

test('dashboard browser supports one day, presets, empty ranges, retry and responsive accessible charts',async()=>{
 const server=backend();server.advance(Date.parse('2026-11-01T03:00:00Z')-server.ctx.Date.now());server.setup();
 const rows=server.sheets.get('閲覧記録').rows;rows[0].push('action','target');
 rows.push(['2026-10-31 09:00:00','2026-10-31','/',randomUUID(),'view','']);
 rows.push(['2026-10-31 10:00:00','2026-10-31','/makers/omishima-winery/',randomUUID(),'view','']);
 rows.push(['2026-10-31 10:05:00','2026-10-31','/',randomUUID(),'click','experience:'+seed.experiences[0].id]);
 rows.push(['2026-11-01 09:00:00','2026-11-01','/',randomUUID(),'view','']);
 let fail=false,calls=0;const originalRpc=server.rpc;server.rpc=request=>{if(request.action==='stats'){calls++;if(fail)return {ok:false,error:'統計を読み込めませんでした。'};}return originalRpc(request);};
 const {client,waitFor,close}=await adminPage(server,server.login());
 try{
  await client.evaluate("document.querySelector('[data-section=stats]').click()");
  await waitFor("document.querySelector('[data-metric=views]')?.textContent==='3回'");
  assert.equal(await client.evaluate("document.querySelectorAll('#stats-content svg[role=img]').length"),2);
  await client.evaluate("document.getElementById('stats-start').value='2026-10-31';document.getElementById('stats-end').value='2026-10-31';document.getElementById('stats-filter').requestSubmit()");
  await waitFor("document.querySelector('[data-metric=views]')?.textContent==='2回'");
  assert.equal(await client.evaluate("document.querySelector('[data-metric=makers]').textContent"),'1回');
  assert.equal(await client.evaluate("document.querySelector('[data-metric=experiences]').textContent"),'1回');
  for(const width of [360,390,1366]){
   await client.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
   assert.equal(await client.evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
   assert.equal(await client.evaluate("[...document.querySelectorAll('#stats-filter input,#stats-filter select,#stats-filter button')].every(x=>x.getBoundingClientRect().height>=44)"),true);
   await client.evaluate("document.getElementById('stats-apply').focus()");
   assert.equal(await client.evaluate("document.activeElement.id"),'stats-apply');
   if(width!==360)await client.screenshot('/tmp/admin-analytics-'+width+'.png',true);
  }
  await client.evaluate("document.getElementById('stats-from').value='10:00';document.getElementById('stats-to').value='11:00';document.getElementById('stats-filter').requestSubmit()");
  await waitFor("document.querySelector('[data-metric=views]')?.textContent==='1回'");
  assert.equal(await client.evaluate("document.querySelector('[data-metric=makers]').textContent"),'1回');
  const before=calls;
  await client.evaluate("document.getElementById('stats-start').value='2026-11-01';document.getElementById('stats-end').value='2026-10-31';document.getElementById('stats-filter').requestSubmit()");
  await waitFor("document.getElementById('stats-message').textContent.includes('終了日')");assert.equal(calls,before);
  await client.evaluate("document.querySelector('[data-stats-period=today]').click()");
  await waitFor("document.querySelector('[data-metric=views]')?.textContent==='1回'");
  assert.equal(await client.evaluate("document.getElementById('stats-from').value"),'00:00');
  await client.evaluate("document.querySelector('[data-stats-period=week]').click()");
  await waitFor("document.querySelector('[data-metric=views]')?.textContent==='3回'");
  await client.evaluate("document.querySelector('[data-stats-period=month]').click()");
  await waitFor("document.querySelector('[data-metric=views]')?.textContent==='1回'");
  await client.evaluate("document.querySelector('[data-section=makers]').click();document.querySelector('[data-section=stats]').click()");
  await waitFor("document.querySelector('[data-metric=views]')?.textContent==='1回'");
  await client.evaluate("document.getElementById('stats-start').value='2026-10-01';document.getElementById('stats-end').value='2026-10-01';document.getElementById('stats-filter').requestSubmit()");
  await waitFor("document.querySelector('[data-metric=views]')?.textContent==='0回'");
  fail=true;await client.evaluate("document.getElementById('stats-filter').requestSubmit()");
  await waitFor("document.getElementById('stats-message').textContent.includes('読み込めません')");
  assert.equal(await client.evaluate("document.querySelectorAll('#stats-content [data-metric]').length"),0);
  fail=false;await client.evaluate("document.querySelector('[data-stats-period=all]').click()");
  await waitFor("document.querySelector('[data-metric=views]')?.textContent==='3回'");
  const stats=server.rpc({action:'stats',token:await client.evaluate("sessionStorage.getItem('shimanami.admin.session')")});
  await client.evaluate("window.originalStatsRpc=rpc;window.delayedStats=[];rpc=request=>request.action==='stats'?new Promise(resolve=>window.delayedStats.push(resolve)):window.originalStatsRpc(request);document.getElementById('stats-filter').requestSubmit();document.getElementById('stats-filter').requestSubmit()");
  assert.equal(await client.evaluate('window.delayedStats.length'),1,'repeated submits must not start parallel reads');
  await client.evaluate("document.querySelector('[data-section=makers]').click();document.querySelector('[data-section=stats]').click()");
  await client.evaluate(`window.delayedStats[1](${JSON.stringify(stats)})`);
  await waitFor("document.querySelector('[data-metric=views]')?.textContent==='3回'");
  const stale=structuredClone(stats);stale.dashboard.totals.views=999;
  await client.evaluate(`window.delayedStats[0](${JSON.stringify(stale)})`);
  assert.equal(await client.evaluate("document.querySelector('[data-metric=views]').textContent"),'3回','an older response must not replace the latest range');
  await client.evaluate("document.getElementById('stats-filter').requestSubmit();document.getElementById('logout').click()");
  await waitFor("document.getElementById('workspace').hidden");
  await client.evaluate(`window.delayedStats[2](${JSON.stringify(stats)})`);
  assert.equal(await client.evaluate("document.getElementById('stats-content').childElementCount"),0,'a late response after logout must stay hidden');
 }finally{await close();}
});

test('browser labels legacy click statistics as unmeasured while keeping view totals',async()=>{
 const server=backend();server.setup();const {client,waitFor,close}=await adminPage(server,server.login());
 try{
  await client.evaluate("document.querySelector('[data-section=stats]').click()");
  await waitFor("document.getElementById('stats-content').textContent.includes('未計測')");
  assert.equal(await client.evaluate("document.querySelector('[data-metric=experiences]').textContent"),'未計測');
  assert.equal(await client.evaluate("document.querySelector('[data-metric=events]').textContent"),'未計測');
  assert.equal(await client.evaluate("document.getElementById('stats-content').textContent.includes('今月の閲覧数')"),true);
 }finally{await close();}
});
async function siteAdminPage(server,{initialFailure=false,oldServer=false}={}){
 const fixture=await mkdtemp(join(tmpdir(),'sake-site-admin-'));let client,interceptionError,fail=initialFailure,legacy=oldServer,hold=false;
 const requests=[];
 try{
  const html=readFileSync(new URL('../apps-script/Admin.html',import.meta.url),'utf8'),logo='data:image/png;base64,'+readFileSync(new URL('../assets/brand/shimanami-logo.png',import.meta.url)).toString('base64');
  await writeFile(join(fixture,'index.html'),html.replace('__LOGO_DATA__',logo).replace('__BOOTSTRAP_JSON__',JSON.stringify({transport:'http',connected:true,endpoint:'https://script.google.com/macros/s/test-only/exec',needsSetup:false,canSetup:false})));
  client=await browser(fixture);await client.send('Network.setBlockedURLs',{urls:[]});
  await client.send('Network.setCookie',{name:'SID',value:'fake-google-session',domain:'script.google.com',path:'/',secure:true,sameSite:'None'});
  await client.send('Fetch.enable',{patterns:[{urlPattern:'https://*'}]});
  client.on('Fetch.requestPaused',async event=>{
   try{
    if(!event.request.url.startsWith('https://script.google.com/')){await client.send('Fetch.failRequest',{requestId:event.requestId,errorReason:'BlockedByClient'});return;}
    requests.push(event.request);assert.notEqual(event.request.method,'OPTIONS','simple POST must avoid a preflight');
    assert.equal(Object.keys(event.request.headers).some(x=>x.toLowerCase()==='cookie'),false,'Google account cookies must not be sent');
    if(fail){await client.send('Fetch.failRequest',{requestId:event.requestId,errorReason:'Failed'});return;}
    if(hold&&event.request.method==='POST'&&JSON.parse(event.request.postData).action==='save')return;
    const body=legacy?'<html>old server</html>':event.request.method==='GET'?server.ctx.doGet({parameter:{action:'admin-bootstrap'}}).text:server.ctx.doPost({postData:{contents:event.request.postData}}).text;
    await client.send('Fetch.fulfillRequest',{requestId:event.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:legacy?'text/html':'application/json'},{name:'Access-Control-Allow-Origin',value:'*'}],body:Buffer.from(body).toString('base64')});
   }catch(error){interceptionError=error;await client.send('Fetch.failRequest',{requestId:event.requestId,errorReason:'Failed'}).catch(()=>{});}
  });
  await client.send('Page.addScriptToEvaluateOnNewDocument',{source:"window.transportOptions=[];const originalFetch=window.fetch;window.fetch=(url,options)=>{window.transportOptions.push(options);return originalFetch(url,options);};"});
  const open=()=>client.open(pathToFileURL(join(fixture,'index.html')).href,390,900);
  await open();
  async function waitFor(expression){for(let i=0;i<200;i++){if(interceptionError)throw interceptionError;if(await client.evaluate(expression))return;await delay(20);}throw new Error('Timed out: '+expression);}
  return {client,requests,open,waitFor,setFailure:value=>{fail=value;},setLegacy:value=>{legacy=value;},setHold:value=>{hold=value;},close:async()=>{await client.close();await rm(fixture,{recursive:true,force:true});}};
 }catch(error){if(client)await client.close();await rm(fixture,{recursive:true,force:true});throw error;}
}
test('site admin browser signs in, saves photos, reads statistics and logs out without Google navigation or cookies',async()=>{
 const server=backend();server.rpc({action:'setup',verifier:pbkdf2Sync('1234','salt',600000,32,'sha256').toString('hex')});server.setEmail('');server.props.set('GITHUB_IMAGE_TOKEN','test-only-token');
 const experiences=server.sheets.get('体験').rows;experiences[1][experiences[0].indexOf('photo')]='';
 const page=await siteAdminPage(server),{client,waitFor}=page;
 try{
  await waitFor("!document.getElementById('login-button').disabled");
  assert.equal(await client.evaluate('window.google'),undefined);
  await client.evaluate("document.getElementById('password').value='bad';document.getElementById('login').requestSubmit()");
  await waitFor("document.getElementById('status').textContent.includes('正しくありません')");
  await client.evaluate("document.getElementById('password').value='1234';document.getElementById('login').requestSubmit()");
  await waitFor("!document.getElementById('workspace').hidden");
  assert.equal(await client.evaluate("location.pathname.endsWith('/index.html')"),true);
  await client.evaluate("document.querySelector('[data-section=experiences]').click();document.getElementById('input-title').value='サイト内で変更';document.getElementById('edit-form').requestSubmit()");
  await waitFor("document.getElementById('status').textContent.includes('保存しました')");
  assert.equal(server.ctx.publicData_().experiences[0].title,'サイト内で変更');
  const saves=()=>page.requests.filter(x=>x.method==='POST'&&JSON.parse(x.postData).action==='save').length,before=saves();
  page.setHold(true);
  await client.evaluate("const originalTimer=window.setTimeout;window.setTimeout=(fn,ms,...args)=>originalTimer(fn,ms===25000?50:ms,...args);document.getElementById('input-title').value='応答待ちでも残す入力';document.getElementById('input-title').dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('edit-form').requestSubmit()");
  await waitFor("document.getElementById('status').textContent.includes('保存済みの可能性')");
  assert.equal(await client.evaluate("document.getElementById('input-title').value"),'応答待ちでも残す入力');
  assert.equal(server.ctx.publicData_().experiences[0].title,'サイト内で変更');
  assert.equal(saves(),before+1,'a timed-out save must not be retried automatically');
  page.setHold(false);await client.evaluate("window.setTimeout=originalTimer;document.getElementById('input-title').value='サイト内で変更';document.getElementById('edit-form').requestSubmit()");
  await waitFor("document.getElementById('status').textContent.includes('保存しました')");
  await client.evaluate("(async()=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=32;canvas.getContext('2d').fillRect(0,0,32,32);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));const files=new DataTransfer();files.items.add(new File([blob],'test.png',{type:'image/png'}));document.getElementById('input-photo').files=files.files;document.getElementById('input-photo').dispatchEvent(new Event('change'));})()");
  await waitFor("document.getElementById('photo-note').textContent.includes('まだ保存していません')");
  await client.evaluate("document.getElementById('edit-form').requestSubmit()");
  await waitFor("document.getElementById('status').textContent.includes('保存しました')");
  assert.ok(server.ctx.publicData_().experiences[0].photo.startsWith('uploads/experiences/'));
  await page.open();await waitFor("!document.getElementById('workspace').hidden");
  await client.evaluate("document.querySelector('[data-section=stats]').click()");
  await waitFor("document.querySelectorAll('#stats-content [data-metric]').length===4");
  for(const width of [390,1366]){await client.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});assert.equal(await client.evaluate('document.documentElement.scrollWidth<=innerWidth'),true);await client.screenshot('/tmp/site-admin-http-'+width+'.png',true);}
  assert.equal(await client.evaluate("window.transportOptions.every(x=>x.credentials==='omit'&&x.mode==='cors'&&x.redirect==='follow'&&x.referrerPolicy==='no-referrer')"),true);
  for(const request of page.requests){const url=new URL(request.url);assert.equal([...url.searchParams.keys()].some(key=>key!=='action'),false);if(request.method==='POST')assert.equal(JSON.parse(request.postData).api,'admin-v1');}
  await client.evaluate("document.getElementById('logout').click()");await waitFor("document.getElementById('workspace').hidden");
  assert.equal(await client.evaluate("sessionStorage.getItem('shimanami.admin.session')"),null);
 }finally{await page.close();}
});
test('site admin browser refuses old servers, recovers connection failures and keeps owner setup locked',async()=>{
 const server=backend();server.setup();const page=await siteAdminPage(server,{oldServer:true}),{client,waitFor}=page;
 try{
  await waitFor("!document.getElementById('connection-retry').hidden");assert.equal(await client.evaluate("document.getElementById('login-button').disabled"),true);
  assert.equal(await client.evaluate("document.getElementById('workspace').hidden"),true);
  page.setLegacy(false);page.setFailure(true);await client.evaluate("document.getElementById('connection-retry').click()");
  await waitFor("!document.getElementById('connection-retry').hidden");assert.equal(await client.evaluate("document.getElementById('login-button').disabled"),true);
  page.setFailure(false);await client.evaluate("document.getElementById('connection-retry').click()");
  await waitFor("!document.getElementById('login-button').disabled");
  server.props.delete('PASSWORD_HASH');await page.open();
  await waitFor("document.getElementById('status').textContent.includes('所有者')");
  assert.equal(await client.evaluate("document.getElementById('login-button').disabled"),true);
  assert.equal(await client.evaluate("document.getElementById('confirm-field').hidden"),true,'site must not offer password initialization');
 }finally{await page.close();}
});
