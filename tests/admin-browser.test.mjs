import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {pbkdf2Sync} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {browser} from './helpers/browser.mjs';
let b,fixture;
const seed=Object.fromEntries(await Promise.all(['makers','experiences','events'].map(async kind=>[kind,JSON.parse(await readFile(new URL(`../data/${kind}.json`,import.meta.url),'utf8'))])));
const password='1234';
const expected=pbkdf2Sync(password,'test-salt',600000,32,'sha256').toString('hex');
const connectedMock=`{const records=${JSON.stringify(seed).replaceAll('<','\\u003c')};let revision=0;window.__failSave=false;window.__writes=0;window.__uploads=0;window.__failUpload=false;window.__failLoadAfterSave=false;window.__failNextLoad=false;window.__emptyExperiences=false;window.google={script:{run:{withSuccessHandler(success){return {withFailureHandler(failure){return {rpc(request){queueMicrotask(()=>{let result;if(request.action==='login')result=request.verifier===${JSON.stringify(expected)}?{ok:true,token:'test-only-session'}:{ok:false,error:'パスワードが正しくありません。'};else if(request.token!=='test-only-session')result={ok:false,error:'ログインし直してください。'};else if(request.action==='load'){if(window.__failNextLoad){window.__failNextLoad=false;failure(new Error('Readback failed'));return;}const content=structuredClone(records);if(window.__emptyExperiences)content.experiences=[];result={ok:true,data:content,revision};}else if(request.action==='upload'){window.__uploads++;window.__lastPhoto=request.base64;result=window.__failUpload?{ok:false,error:'写真の保存に失敗しました。'}:{ok:true,path:'uploads/'+request.collection+'/'+'a'.repeat(64)+'.jpg'};}else if(request.action==='photo'){if(window.__delayPhoto){setTimeout(()=>success({ok:true,base64:window.__lastPhoto}),120);return;}result={ok:true,base64:window.__lastPhoto};}else if(request.action==='save'){window.__fieldsLockedAtWrite=[...document.querySelectorAll('#fields input,#fields textarea,#fields select,#fields button')].every(x=>x.disabled);if(window.__failSave)result={ok:false,error:'保存に失敗しました。'};else{const list=records[request.collection],index=list.findIndex(x=>x.id===request.record.id);if(index<0)list.push(request.record);else list[index]=request.record;revision++;window.__writes++;if(window.__failLoadAfterSave)window.__failNextLoad=true;result={ok:true,revision};}}else if(request.action==='logout')result={ok:true};success(result);});}};}};}}}};}`;
async function waitFor(expression){for(let i=0;i<200;i++){if(await b.evaluate(expression))return;await delay(20);}throw new Error('Timed out: '+expression);}
before(async()=>{
 fixture=await mkdtemp(join(tmpdir(),'sake-admin-ui-'));
 const source=await readFile(new URL('../apps-script/Admin.html',import.meta.url),'utf8');
 const logo='data:image/png;base64,'+(await readFile(new URL('../assets/brand/shimanami-logo.png',import.meta.url))).toString('base64');
 await writeFile(join(fixture,'offline.html'),source.replace('__LOGO_DATA__',logo).replace('__BOOTSTRAP_JSON__',JSON.stringify({connected:false,previewData:seed})));
 await writeFile(join(fixture,'connected.html'),source.replace('__LOGO_DATA__',logo).replace('__BOOTSTRAP_JSON__',JSON.stringify({connected:true,photosReady:true,salt:'test-salt',needsSetup:false})));
 b=await browser(fixture);
});
after(async()=>{if(b)await b.close();if(fixture)await rm(fixture,{recursive:true,force:true});});
test('admin preview clearly disables login and writes without a backend; both widths have no overflow',async()=>{
 for(const width of [390,1366]){
  await b.open(pathToFileURL(join(fixture,'offline.html')).href,width,900);
  assert.equal(await b.evaluate("document.getElementById('login-button').disabled"),true);
  assert.equal(await b.evaluate("document.getElementById('save').disabled"),true);
  assert.equal(await b.evaluate("document.getElementById('record').options.length"),5);
  assert.equal(await b.evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
  assert.equal(await b.evaluate("document.body.textContent.includes('担当者')"),false);
  assert.equal(await b.evaluate("document.getElementById('status').textContent.includes('まだ利用できません')"),true);
  if(process.env.SCREENSHOT_DIR){await mkdir(process.env.SCREENSHOT_DIR,{recursive:true});await b.screenshot(join(process.env.SCREENSHOT_DIR,`admin-${width}.png`),true);}
 }
});
test('admin form accepts a short numeric password, handles save failure without losing input, saves and logs out',async()=>{

 const init=await b.send('Page.addScriptToEvaluateOnNewDocument',{source:connectedMock});
 await b.open(pathToFileURL(join(fixture,'connected.html')).href,390,900);
 assert.equal(await b.evaluate("document.getElementById('workspace').hidden"),true);
 await b.evaluate("document.getElementById('password').value='incorrect-password';document.getElementById('login').requestSubmit()");
 await waitFor("document.getElementById('status').textContent.includes('正しくありません')");
 assert.equal(await b.evaluate("document.getElementById('workspace').hidden"),true);
 await b.evaluate(`document.getElementById('password').value=${JSON.stringify(password)};document.getElementById('login').requestSubmit()`);
 await waitFor("!document.getElementById('workspace').hidden");
 await b.evaluate("document.getElementById('record').value='3';document.getElementById('record').dispatchEvent(new Event('change'));window.__failSave=true;const input=document.getElementById('input-description');input.value='変更した紹介文 <script> &';input.dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('edit-form').requestSubmit()");
 await waitFor("document.getElementById('status').textContent.includes('保存に失敗')");
 assert.equal(await b.evaluate("document.getElementById('input-description').value"),'変更した紹介文 <script> &');
 assert.equal(await b.evaluate('window.__writes'),0);
 await b.evaluate("window.__failSave=false;document.getElementById('edit-form').requestSubmit()");
 await waitFor("document.getElementById('status').textContent.includes('保存しました')");
 assert.equal(await b.evaluate('window.__writes'),1);
 assert.equal(await b.evaluate('window.__fieldsLockedAtWrite'),true);
 assert.equal(await b.evaluate("document.getElementById('record').value"),'3');
 assert.equal(await b.evaluate("document.getElementById('saved-view').getAttribute('href')"),'https://shimanami-sake-preview.woogie3.chatgpt.site/makers/omishima-winery/');
 await b.evaluate("window.__failLoadAfterSave=true;document.getElementById('input-description').value='読込失敗でも保存された紹介文';document.getElementById('input-description').dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('edit-form').requestSubmit()");
 await waitFor("document.getElementById('status').textContent.includes('保存は完了')");
 assert.equal(await b.evaluate('window.__writes'),2);
 assert.equal(await b.evaluate("document.getElementById('record').value"),'3');
 assert.equal(await b.evaluate("document.getElementById('input-description').value"),'読込失敗でも保存された紹介文');
 await b.evaluate("document.getElementById('logout').click()");
 await waitFor("document.getElementById('workspace').hidden");
 assert.equal(await b.evaluate("sessionStorage.getItem('shimanami.admin.session')"),null);
 await b.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:init.identifier});
});

test('draft review is optional, does not write, escapes text, and keeps the selected item',async()=>{
 const init=await b.send('Page.addScriptToEvaluateOnNewDocument',{source:connectedMock});
 await b.open(pathToFileURL(join(fixture,'connected.html')).href,390,900);
 await b.evaluate(`document.getElementById('password').value=${JSON.stringify(password)};document.getElementById('login').requestSubmit()`);
 await waitFor("!document.getElementById('workspace').hidden");
 assert.equal(await b.evaluate("Boolean(document.getElementById('preview'))"),true);
 await b.evaluate("document.getElementById('record').value='2';document.getElementById('record').dispatchEvent(new Event('change'));const input=document.getElementById('input-description');input.value='<script>window.injected=true</script> &';input.dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('preview').click()");
 assert.equal(await b.evaluate("document.getElementById('review').open"),true);
 assert.equal(await b.evaluate("(()=>{const r=document.getElementById('review-title').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight})()"),true);
 assert.equal(await b.evaluate('window.__writes'),0);
 assert.equal(await b.evaluate("document.getElementById('review-fields').textContent.includes('<script>window.injected=true</script> &')"),true);
 assert.equal(await b.evaluate('window.injected'),undefined);
 assert.equal(await b.evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
 if(process.env.SCREENSHOT_DIR){
  await b.screenshot(join(process.env.SCREENSHOT_DIR,'admin-review-test-390.png'));
  await b.send('Emulation.setDeviceMetricsOverride',{width:1366,height:900,deviceScaleFactor:1,mobile:false});
  assert.equal(await b.evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
  await b.screenshot(join(process.env.SCREENSHOT_DIR,'admin-review-test-1366.png'));
  await b.send('Emulation.setDeviceMetricsOverride',{width:390,height:900,deviceScaleFactor:1,mobile:false});
 }
 await b.evaluate("document.getElementById('review-back').click()");
 assert.equal(await b.evaluate("document.getElementById('record').value"),'2');
 assert.equal(await b.evaluate("document.getElementById('input-description').value"),'<script>window.injected=true</script> &');
 await b.evaluate("document.getElementById('preview').click();document.getElementById('review-save').click()");
 await waitFor("document.getElementById('status').textContent.includes('保存しました')");
 assert.equal(await b.evaluate('window.__writes'),1);
 assert.equal(await b.evaluate("document.getElementById('record').value"),'2');
 await b.evaluate("document.getElementById('logout').click()");
 await waitFor("document.getElementById('workspace').hidden");
 await b.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:init.identifier});
});

test('an empty experience list still provides a complete new entry and can save it',async()=>{
 const init=await b.send('Page.addScriptToEvaluateOnNewDocument',{source:connectedMock});
 await b.open(pathToFileURL(join(fixture,'connected.html')).href,390,900);
 await b.evaluate(`window.__emptyExperiences=true;document.getElementById('password').value=${JSON.stringify(password)};document.getElementById('login').requestSubmit()`);
 await waitFor("!document.getElementById('workspace').hidden");
 await b.evaluate("document.querySelector('[data-section=experiences]').click()");
 assert.equal(await b.evaluate("Boolean(document.getElementById('input-id'))"),true);
 await b.evaluate("window.__emptyExperiences=false;document.getElementById('input-id').value='new-experience';document.getElementById('input-title').value='新しい体験';document.getElementById('edit-form').requestSubmit()");
 await waitFor("document.getElementById('status').textContent.includes('保存しました')");
 assert.equal(await b.evaluate('window.__writes'),1);
 assert.equal(await b.evaluate("document.getElementById('input-id').value"),'new-experience');
 await b.evaluate("document.getElementById('logout').click()");
 await waitFor("document.getElementById('workspace').hidden");
 await b.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:init.identifier});
});


test('experience and event photo files preview before upload, survive failures and can be replaced or removed',async()=>{
 const init=await b.send('Page.addScriptToEvaluateOnNewDocument',{source:connectedMock});
 await b.open(pathToFileURL(join(fixture,'connected.html')).href,390,900);
 await b.evaluate(`document.getElementById('password').value=${JSON.stringify(password)};document.getElementById('login').requestSubmit()`);
 await waitFor("!document.getElementById('workspace').hidden");
 const png=(await readFile(new URL('../assets/brand/shimanami-logo.png',import.meta.url))).toString('base64');
 const selectFile=async(type='image/png',name='テスト写真.png',base64=png)=>b.evaluate(`{const bytes=Uint8Array.from(atob(${JSON.stringify(base64)}),c=>c.charCodeAt(0)),transfer=new DataTransfer();transfer.items.add(new File([bytes],${JSON.stringify(name)},{type:${JSON.stringify(type)}}));const input=document.getElementById('input-photo');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));}`);
 for(const section of ['experiences','events']){
  const initialUploads=await b.evaluate('window.__uploads');
  await b.evaluate(`document.querySelector('[data-section=${section}]').click()`);
  assert.equal(await b.evaluate("document.getElementById('input-photo')?.type"),'file');
  assert.equal(await b.evaluate("document.getElementById('photo-choose').textContent"),'写真を選ぶ');
  await selectFile('text/plain','test.txt','aGVsbG8=');
  await waitFor("document.getElementById('photo-note').textContent.includes('JPEG')");
  assert.equal(await b.evaluate('window.__uploads'),initialUploads);
  await selectFile('image/png','broken.png','aGVsbG8=');
  await waitFor("document.getElementById('photo-note').textContent.includes('読み込めません')");
  await selectFile();
  await waitFor("!document.getElementById('photo-preview').hidden&&!document.getElementById('save').disabled");
  assert.match(await b.evaluate("document.getElementById('photo-preview').src"),/^data:image\/jpeg;base64,/);
  assert.equal(await b.evaluate("document.getElementById('photo-preview').naturalWidth<=1600"),true);
  await b.evaluate("document.getElementById('preview').click()");
  assert.equal(await b.evaluate("document.querySelector('#review-fields img')?.complete"),true);
  assert.equal(await b.evaluate('window.__uploads'),initialUploads);
  await b.evaluate("document.getElementById('review-back').click();window.__failUpload=true;document.getElementById('edit-form').requestSubmit()");
  await waitFor("document.getElementById('status').textContent.includes('写真の保存に失敗')");
  assert.equal(await b.evaluate("document.getElementById('photo-preview').hidden"),false);
  await b.evaluate("window.__failUpload=false;window.__failSave=true;document.getElementById('edit-form').requestSubmit()");
  await waitFor("document.getElementById('status').textContent.includes('保存に失敗')");
  assert.equal(await b.evaluate("document.getElementById('photo-preview').hidden"),false);
  await b.evaluate("window.__failSave=false;document.getElementById('edit-form').requestSubmit()");
  await waitFor("document.getElementById('status').textContent.includes('保存しました')");
  await waitFor("document.getElementById('photo-preview').naturalWidth>0");
  for(const width of [390,1366]){
   await b.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
   assert.equal(await b.evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
   if(process.env.SCREENSHOT_DIR){await b.evaluate("document.getElementById('photo-choose').scrollIntoView({block:'center'})");await b.screenshot(join(process.env.SCREENSHOT_DIR,`admin-photo-${section}-test-${width}.png`));}
  }
  await b.evaluate("window.__delayPhoto=true;document.getElementById('record').dispatchEvent(new Event('change'));document.getElementById('photo-remove').click()");
  await delay(180);assert.equal(await b.evaluate("document.getElementById('photo-preview').hidden"),true);
  await selectFile();await waitFor("!document.getElementById('photo-preview').hidden&&!document.getElementById('save').disabled");
  await b.evaluate("window.__delayPhoto=false;document.getElementById('photo-remove').click();document.getElementById('edit-form').requestSubmit()");
  await waitFor("document.getElementById('status').textContent.includes('保存しました')&&!document.getElementById('save').disabled");
  assert.equal(await b.evaluate("document.getElementById('photo-preview').hidden"),true);
 }
 await b.evaluate("document.getElementById('logout').click()");await waitFor("document.getElementById('workspace').hidden");
 await b.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:init.identifier});
});

