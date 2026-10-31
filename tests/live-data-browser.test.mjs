import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,cp,readFile,writeFile,rm,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {browser} from './helpers/browser.mjs';
const source=fileURLToPath(new URL('../',import.meta.url));
test('browser uses the public Sheets snapshot and sends one view per page; filter clicks do not add views',async()=>{
 const fixture=await mkdtemp(join(tmpdir(),'sake-live-test-'));let b;
 try{
  for(const path of ['scripts','data','assets','apps-script'])await cp(join(source,path),join(fixture,path),{recursive:true});
  await writeFile(join(fixture,'data/connection.json'),JSON.stringify({apps_script_url:'https://script.google.com/macros/s/test-only/exec'}));
  const state=Object.fromEntries(await Promise.all(['makers','experiences','events'].map(async k=>[k,JSON.parse(await readFile(join(fixture,`data/${k}.json`),'utf8'))])));
  state.makers[0].name='シートで変更した造り手';state.makers[0].description='<img src=x onerror="window.injected=true">';
  state.experiences[0].booking_url='https://booking.example.test/reserve?source=site';state.events[0].url='https://info.example.test/event';
  const jpeg='data:image/jpeg;base64,'+(await readFile(join(fixture,'assets/photos/winery-tanks.jpg'))).toString('base64');
  state.experiences[0].photo=jpeg;state.events[1].photo=jpeg;state.events[0].sample=false;state.events[1].sample=false;
  state.makers[0].logo=jpeg;state.makers[0].photos=[jpeg];state.experiences[0].maker_id=state.makers[0].id;state.experiences[0].sample=false;
  execFileSync(process.execPath,['scripts/build.mjs'],{cwd:fixture});b=await browser(fixture);
  await b.send('Network.setBlockedURLs',{urls:['https://fonts.googleapis.com/*','https://fonts.gstatic.com/*']});
  await b.send('Fetch.enable',{patterns:[{urlPattern:'https://script.google.com/*'}]});
  const views=[];let interceptionError;
  b.on('Fetch.requestPaused',async event=>{
   try{
    let body,mime;if(event.request.method==='POST'){views.push(JSON.parse(event.request.postData));body='{"ok":true}';mime='application/json';}
    else{const callback=new URL(event.request.url).searchParams.get('callback');assert.match(callback,/^__sakeData_[a-z0-9]+$/);body=callback+'('+JSON.stringify(state).replaceAll('<','\\u003c')+');';mime='text/javascript';}
    await b.send('Fetch.fulfillRequest',{requestId:event.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:mime}],body:Buffer.from(body).toString('base64')});
   }catch(error){interceptionError=error;}
  });
  const waitFor=async expression=>{for(let i=0;i<200;i++){if(interceptionError)throw interceptionError;if(await b.evaluate(expression))return;await delay(20);}throw new Error('Timed out: '+expression);};
  await b.open(pathToFileURL(join(fixture,'dist/index.html')).href,390,900);
  await waitFor("document.querySelector('.maker .name').textContent==='シートで変更した造り手'");
  assert.equal(await b.evaluate('window.injected'),undefined);
  await b.evaluate("document.querySelectorAll('main img').forEach(image=>image.loading='eager')");
  await waitFor("document.querySelector('#exp-list img')?.naturalWidth>0&&document.querySelector('.event-photo')?.naturalWidth>0");
  for(const width of [390,1366]){
   await b.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
   assert.equal(await b.evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
   if(process.env.SCREENSHOT_DIR){await mkdir(process.env.SCREENSHOT_DIR,{recursive:true});await b.evaluate("document.getElementById('events').scrollIntoView()");await b.screenshot(join(process.env.SCREENSHOT_DIR,`site-photo-events-test-${width}.png`));}
  }
  assert.equal(await b.evaluate("document.querySelectorAll('#experience .chips').length"),0);
  assert.equal(await b.evaluate("[...document.querySelectorAll('#exp-list>li')].filter(x=>getComputedStyle(x).display!=='none').length"),state.experiences.filter(x=>!x.sample).length);
  await delay(50);assert.equal(views.length,1);assert.equal(views[0].page,'/');
  await b.evaluate("document.querySelector('.maker').click()");
  await waitFor("document.querySelector('.d-id h1')?.textContent==='シートで変更した造り手'");
  assert.equal(await b.evaluate("document.querySelector('.d-logo').src.startsWith('data:image/jpeg;base64,')"),true);
  assert.equal(await b.evaluate("document.querySelector('.d-hero img').src.startsWith('data:image/jpeg;base64,')"),true);
  assert.equal(await b.evaluate("document.querySelector('.mini a').href"),state.experiences[0].booking_url);
  for(let i=0;i<100&&views.length<2;i++)await delay(20);
  assert.equal(views.length,2);assert.equal(views[1].page,'/makers/'+state.makers[0].id+'/');assert.notEqual(views[0].event_id,views[1].event_id);
  // Cancel navigation after the tracker observes activation; no external request is made.
  const click=async(selector,type='click',button=0)=>b.evaluate(`document.addEventListener(${JSON.stringify(type)},e=>e.preventDefault(),{once:true});document.querySelector(${JSON.stringify(selector)}).dispatchEvent(new MouseEvent(${JSON.stringify(type)},{bubbles:true,cancelable:true,button:${button}}))`);
  await click('.d-actions [data-link-target]');
  await waitFor('true');for(let i=0;i<100&&views.length<3;i++)await delay(20);
  assert.equal(views[2].action,'click');assert.equal(views[2].target,'maker:'+state.makers[0].id+':directions');assert.equal(views[2].page,views[1].page);
  await b.open(pathToFileURL(join(fixture,'dist/index.html')).href,390,900);
  await waitFor("document.querySelector('.maker .name').textContent==='シートで変更した造り手'");
  await click('#exp-list [data-link-target]');await click('#ev-list [data-link-target]','auxclick',1);
  for(let i=0;i<100&&views.length<6;i++)await delay(20);
  assert.equal(views.filter(x=>x.action==='view').length,3);
  assert.deepEqual(views.filter(x=>x.action==='click').map(x=>x.target),['maker:'+state.makers[0].id+':directions','experience:'+state.experiences[0].id,'event:'+state.events[0].id]);
  assert.equal(new Set(views.map(x=>x.event_id)).size,6);assert.ok(!JSON.stringify(views).includes('source=site'));
  // Analytics may be blocked independently of the public content response.
  await b.send('Page.addScriptToEvaluateOnNewDocument',{source:`navigator.sendBeacon=()=>{throw new Error('Beacon blocked');};const originalFetch=window.fetch;window.fetch=(url,options)=>{if(options?.method==='POST')throw new Error('Tracking blocked');return originalFetch(url,options);};`});
  await b.open(pathToFileURL(join(fixture,'dist/index.html')).href,390,900);
  await waitFor("document.querySelector('.maker .name').textContent==='シートで変更した造り手'");
  await b.evaluate("document.getElementById('ev-all').click()");
  assert.equal(await b.evaluate("[...document.querySelectorAll('#ev-list>li')].every(row=>!row.hidden)"),true);
  await click('#exp-list [data-link-target]');
  assert.equal(views.length,6,'failed analytics must not create a fake successful record');
 }finally{if(b)await b.close();await rm(fixture,{recursive:true,force:true});}
});
