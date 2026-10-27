import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createHmac, createHash, randomUUID } from 'node:crypto';
const code=readFileSync(new URL('../apps-script/Code.gs',import.meta.url),'utf8');
const seed=Object.fromEntries(['makers','experiences','events'].map(k=>[k,JSON.parse(readFileSync(new URL(`../data/${k}.json`,import.meta.url),'utf8'))]));
function backend() {
 const props=new Map([['SPREADSHEET_ID','test-sheet'],['OWNER_EMAIL','owner@example.test'],['PASSWORD_SALT','salt'],['PASSWORD_PEPPER','pepper']]);
 const cache=new Map(),sheets=new Map(); let email='owner@example.test',clock=Date.now();
 class TestDate extends Date { constructor(...a){super(...(a.length?a:[clock]));} static now(){return clock;} }
 const range=(rows,r,c,n=1,w=1)=>({
  getDisplayValues:()=>Array.from({length:n},(_,i)=>Array.from({length:w},(_,j)=>String(rows[r-1+i]?.[c-1+j]??''))),
  setRichTextValues:values=>{values.forEach((line,i)=>{rows[r-1+i]??=[];line.forEach((v,j)=>{rows[r-1+i][c-1+j]=v.text;});});},
  setValues:values=>{values.forEach((line,i)=>{rows[r-1+i]??=[];line.forEach((v,j)=>{rows[r-1+i][c-1+j]=v;});});}
 });
 const sheet=name=>{if(!sheets.has(name)){const rows=[];sheets.set(name,{rows,getLastRow:()=>rows.length,getLastColumn:()=>rows[0]?.length||0,getRange:(...a)=>range(rows,...a)});}return sheets.get(name);};
 const db={getSheetByName:sheet};
 const ctx=vm.createContext({Date:TestDate,JSON,URL,console,
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k)||null,setProperty:(k,v)=>props.set(k,v)})},
 CacheService:{getScriptCache:()=>({get:k=>{const x=cache.get(k);return x&&x.expires>clock?x.value:null;},put:(k,v,ttl)=>cache.set(k,{value:v,expires:clock+ttl*1000}),remove:k=>cache.delete(k)})},
 LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
 SpreadsheetApp:{openById:()=>db,newRichTextValue:()=>({setText(text){this.text=text;return this;},build(){return {text:this.text};}})},
 Session:{getActiveUser:()=>({getEmail:()=>email})},
 Utilities:{getUuid:randomUUID,Charset:{UTF_8:'UTF-8'},DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_,v)=>[...createHash('sha256').update(v).digest()],computeHmacSha256Signature:(v,k)=>[...createHmac('sha256',k).update(v).digest()],base64Encode:v=>Buffer.from(v).toString('base64'),formatDate:(date,tz,format)=>{const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date).map(x=>[x.type,x.value]));const d=`${parts.year}-${parts.month}-${parts.day}`;return format==='yyyy-MM-dd'?d:`${d} ${parts.hour}:${parts.minute}:${parts.second}`;}},
 ContentService:{MimeType:{JSON:'json',JAVASCRIPT:'js'},createTextOutput:text=>({text,setMimeType(){return this;}})}
 });
 vm.runInContext(code,ctx);
 for(const [kind,records] of Object.entries(seed)){
  const def=ctx.definition_(kind);const rows=sheet(def.name).rows;rows.push([...def.fields]);
  records.forEach(x=>rows.push(def.fields.map(k=>Array.isArray(x[k])?JSON.stringify(x[k]):x[k]===null?'':x[k])));
 }
 sheet('閲覧記録').rows.push(['received_at_jst','date_jst','page','event_id']);
 const rpc=p=>JSON.parse(JSON.stringify(ctx.rpc(p)));
 const setup=()=>rpc({action:'setup',verifier:'a'.repeat(64)});
 const login=()=>rpc({action:'login',verifier:'a'.repeat(64)}).token;
 return {ctx,props,sheets,rpc,setup,login,setEmail:v=>{email=v;},advance:ms=>{clock+=ms;}};
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
test('login throttles repeated guesses and public responses never include secrets',()=>{
 const b=backend();b.setup();for(let i=0;i<8;i++)b.rpc({action:'login',verifier:'wrong'});assert.equal(b.rpc({action:'login',verifier:'a'.repeat(64)}).ok,false);
 const text=JSON.stringify(b.ctx.publicData_());for(const secret of ['pepper','PASSWORD_HASH','PASSWORD_SALT','owner@example.test'])assert.ok(!text.includes(secret));
});

test('manual spreadsheet edits cannot publish a javascript URL through the public snapshot',()=>{
 const b=backend(),sheet=b.sheets.get('造り手');sheet.rows[1][sheet.rows[0].indexOf('website')]='javascript:alert(1)';assert.throws(()=>b.ctx.publicData_(),/https/);
});
