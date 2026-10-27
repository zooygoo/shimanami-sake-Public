import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,cp,readFile,writeFile,rm} from 'node:fs/promises';
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
  await b.evaluate("document.querySelector('#ex-pair').click()");
  assert.equal(await b.evaluate("[...document.querySelectorAll('#exp-list>li')].filter(x=>getComputedStyle(x).display!=='none').length"),1);
  await delay(50);assert.equal(views.length,1);assert.equal(views[0].page,'/');
  await b.evaluate("document.querySelector('.maker').click()");
  await waitFor("document.querySelector('.d-id h1')?.textContent==='シートで変更した造り手'");
  for(let i=0;i<100&&views.length<2;i++)await delay(20);
  assert.equal(views.length,2);assert.equal(views[1].page,'/makers/yagi-shuzobu/');assert.notEqual(views[0].event_id,views[1].event_id);
 }finally{if(b)await b.close();await rm(fixture,{recursive:true,force:true});}
});
