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
const password='test-password-only-123';
const expected=pbkdf2Sync(password,'test-salt',600000,32,'sha256').toString('hex');
async function waitFor(expression){for(let i=0;i<200;i++){if(await b.evaluate(expression))return;await delay(20);}throw new Error('Timed out: '+expression);}
before(async()=>{
 fixture=await mkdtemp(join(tmpdir(),'sake-admin-ui-'));
 const source=await readFile(new URL('../apps-script/Admin.html',import.meta.url),'utf8');
 const logo='data:image/png;base64,'+(await readFile(new URL('../assets/brand/shimanami-logo.png',import.meta.url))).toString('base64');
 await writeFile(join(fixture,'offline.html'),source.replace('__LOGO_DATA__',logo).replace('__BOOTSTRAP_JSON__',JSON.stringify({connected:false,previewData:seed})));
 await writeFile(join(fixture,'connected.html'),source.replace('__LOGO_DATA__',logo).replace('__BOOTSTRAP_JSON__',JSON.stringify({connected:true,salt:'test-salt',needsSetup:false})));
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
test('admin form uses real password derivation, handles save failure without losing input, saves and logs out',async()=>{
 const mock=`{const records=${JSON.stringify(seed).replaceAll('<','\\u003c')};let revision=0;window.__failSave=false;window.__writes=0;window.google={script:{run:{withSuccessHandler(success){return {withFailureHandler(failure){return {rpc(request){queueMicrotask(()=>{let result;if(request.action==='login')result=request.verifier===${JSON.stringify(expected)}?{ok:true,token:'test-only-session'}:{ok:false,error:'パスワードが正しくありません。'};else if(request.token!=='test-only-session')result={ok:false,error:'ログインし直してください。'};else if(request.action==='load')result={ok:true,data:structuredClone(records),revision};else if(request.action==='save'){if(window.__failSave)result={ok:false,error:'保存に失敗しました。'};else{const list=records[request.collection],index=list.findIndex(x=>x.id===request.record.id);list[index]=request.record;revision++;window.__writes++;result={ok:true,revision};}}else if(request.action==='logout')result={ok:true};success(result);});}};}};}}}};}`;
 const init=await b.send('Page.addScriptToEvaluateOnNewDocument',{source:mock});
 await b.open(pathToFileURL(join(fixture,'connected.html')).href,390,900);
 assert.equal(await b.evaluate("document.getElementById('workspace').hidden"),true);
 await b.evaluate("document.getElementById('password').value='incorrect-password';document.getElementById('login').requestSubmit()");
 await waitFor("document.getElementById('status').textContent.includes('正しくありません')");
 assert.equal(await b.evaluate("document.getElementById('workspace').hidden"),true);
 await b.evaluate(`document.getElementById('password').value=${JSON.stringify(password)};document.getElementById('login').requestSubmit()`);
 await waitFor("!document.getElementById('workspace').hidden");
 await b.evaluate("window.__failSave=true;const input=document.getElementById('input-description');input.value='変更した紹介文 <script> &';input.dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('edit-form').requestSubmit()");
 await waitFor("document.getElementById('status').textContent.includes('保存に失敗')");
 assert.equal(await b.evaluate("document.getElementById('input-description').value"),'変更した紹介文 <script> &');
 assert.equal(await b.evaluate('window.__writes'),0);
 await b.evaluate("window.__failSave=false;document.getElementById('edit-form').requestSubmit()");
 await waitFor("document.getElementById('status').textContent.includes('保存しました')");
 assert.equal(await b.evaluate('window.__writes'),1);
 assert.equal(await b.evaluate("document.getElementById('input-description').value"),'変更した紹介文 <script> &');
 await b.evaluate("document.getElementById('logout').click()");
 await waitFor("document.getElementById('workspace').hidden");
 assert.equal(await b.evaluate("sessionStorage.getItem('shimanami.admin.session')"),null);
 await b.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:init.identifier});
});
