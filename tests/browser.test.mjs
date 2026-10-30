import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { browser } from './helpers/browser.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const home = pathToFileURL(join(root, 'dist/index.html')).href;
let b;
before(async () => { execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: root }); b = await browser(); });
after(async () => { if (b) await b.close(); });
for (const width of [360, 390, 1366, 1920]) test(`browser: home and all five details fit width ${width}; maker row scrolls only on mobile`, async () => {
  await b.open(home, width, 900);
  assert.equal(await b.evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
  const row = await b.evaluate(`(() => { const r = document.querySelector('.row5'); return {scroll:r.scrollWidth, width:r.clientWidth, tops:[...r.children].map(x=>x.getBoundingClientRect().top)}; })()`);
  if (width < 600) {
    assert.ok(row.scroll > row.width);
    assert.equal(await b.evaluate(`(() => {const r=document.querySelector('.row5');r.scrollLeft=r.scrollWidth;return r.lastElementChild.getBoundingClientRect().right <= r.getBoundingClientRect().right + 1})()`), true);
  } else assert.ok(row.tops.every(t => t === row.tops[0]));
  const links = await b.evaluate(`[...document.querySelectorAll('.maker')].map(a=>a.href)`);
  for (const link of links) { await b.open(link, width); assert.equal(await b.evaluate('document.documentElement.scrollWidth <= innerWidth'), true, link); await b.evaluate("Promise.all([...document.images].map(img=>{img.loading='eager';return img.decode()})).then(()=>true)"); assert.equal(await b.evaluate('[...document.images].every(x=>x.complete && x.naturalWidth>0)'), true); }
});
test('browser: approved hero content fits the first viewport at 390 and 1366', async () => {
  for (const width of [390, 1366]) {
    await b.open(home, width, width === 390 ? 900 : 768);
    for (const selector of ['.logo-stage img','.hero h1','.intro','.ctas a']) assert.equal(await b.evaluate(`(() => {const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return r.top>=0 && r.bottom<=innerHeight})()`), true, `${width} ${selector}`);
    assert.equal(await b.evaluate("getComputedStyle(document.querySelector('.hero')).backgroundColor"), 'rgb(0, 80, 142)');
  }
});
test('browser: mobile maker logos fit equal compact panels after loading and every swipe',async()=>{
 for(const width of [360,390,402,430]){
  await b.open(home,width,874);
  await b.evaluate("Promise.all([...document.querySelectorAll('.maker img')].map(img=>{img.loading='eager';return img.decode()})).then(()=>true)");
  for(let index=0;index<5;index++){
   const layout=await b.evaluate(`(() => {const row=document.querySelector('.row5'),card=row.children[${index}];row.scrollLeft=card.offsetLeft-row.firstElementChild.offsetLeft;const panel=card.querySelector('.m-vis').getBoundingClientRect(),image=card.querySelector('img').getBoundingClientRect(),body=card.querySelector('.m-body').getBoundingClientRect(),bounds=card.getBoundingClientRect();return {height:panel.height,cardHeight:bounds.height,bodyTop:body.top,panelBottom:panel.bottom,contained:image.left>=panel.left&&image.right<=panel.right&&image.top>=panel.top&&image.bottom<=panel.bottom,allHeights:[...row.children].map(x=>x.querySelector('.m-vis').getBoundingClientRect().height)};})()`);
   assert.equal(layout.height,144,`${width}px card ${index} has a fixed compact logo panel`);
   assert.ok(layout.allHeights.every(height=>Math.abs(height-layout.height)<1),'all logos use the same panel height');
   assert.ok(layout.cardHeight<=360,`${width}px card ${index} is compact: ${layout.cardHeight}`);
   assert.ok(layout.contained,`${width}px card ${index} logo stays inside its own panel`);
   assert.equal(layout.bodyTop,layout.panelBottom,'the blue border begins directly below the logo panel');
  }
  assert.equal(await b.evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
  await b.evaluate("document.querySelector('.mnav a[href$=\"#makers\"]').click()");
  const anchor=await b.evaluate("({title:document.querySelector('#makers h2').getBoundingClientRect().top,header:document.querySelector('.site-head').getBoundingClientRect().bottom})");
  assert.ok(anchor.title>=anchor.header,`${width}px navigation must leave the title visible`);
 }
});
test('browser: a failed Google connection keeps both hero buttons fully visible without changing the approved layout',async()=>{
  for(const width of [390,1366]){
    await b.open(home,width,width===390?900:768);
    for(let i=0;i<100&&!await b.evaluate("Boolean(document.querySelector('main > [role=status]'))");i++)await new Promise(resolve=>setTimeout(resolve,20));
    assert.equal(await b.evaluate("document.querySelector('main').firstElementChild.matches('.hero')"),true);
    assert.equal(await b.evaluate("Boolean(document.querySelector('.hero + [role=status]'))"),true);
    assert.equal(await b.evaluate("[...document.querySelectorAll('.ctas a')].every(a=>{const r=a.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight})"),true);
  }
});
test('browser: all experiences remain visible without category controls after refresh', async () => {
  const {renderPages}=await import('../scripts/site-render.mjs');
  const data=Object.fromEntries(await Promise.all(['makers','experiences','events'].map(async k=>[k,JSON.parse(await readFile(join(root,'data',k+'.json'),'utf8'))])));
  const file=join(root,'dist/experience-visibility-test.html'),url=pathToFileURL(file).href;
  await writeFile(file,renderPages(data.makers,data.experiences.map(x=>({...x,sample:false})),[]).get('index.html'));
  for (let i=0;i<2;i++) {
    await b.open(url);
    assert.equal(await b.evaluate("document.querySelectorAll('#experience .chips').length"),0);
    assert.equal(await b.evaluate("[...document.querySelectorAll('#exp-list > li')].filter(x=>!x.hidden).length"),5);
  }
  await rm(file);
});
test('browser: event status uses Japan today, including yesterday, today, future and date rollover', async () => {
  const {renderPages}=await import('../scripts/site-render.mjs');
  const data=Object.fromEntries(await Promise.all(['makers','experiences','events'].map(async k=>[k,JSON.parse(await readFile(join(root,'data',k+'.json'),'utf8'))])));
  const eventFile=join(root,'dist/event-date-test.html'),eventHome=pathToFileURL(eventFile).href;
  await writeFile(eventFile,renderPages(data.makers,data.experiences,data.events.map(x=>({...x,sample:false}))).get('index.html'));
  // At UTC October 3 15:00 it is October 4 in Japan. The sample ending October 4 must remain upcoming.
  const script = await b.send('Page.addScriptToEvaluateOnNewDocument', { source: "{ const OriginalDate=Date; globalThis.Date=class extends OriginalDate { constructor(...args){super(...(args.length?args:['2026-10-03T15:00:00Z']))} static now(){return new OriginalDate('2026-10-03T15:00:00Z').getTime()} }; }" });
  await b.send('Emulation.setTimezoneOverride', { timezoneId: 'America/Los_Angeles' });
  await b.open(eventHome);
  assert.equal(await b.evaluate("document.querySelector('[data-end-date=\"2026-10-04\"]').dataset.k"), '開催予定');
  await b.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: script.identifier });
  const next = await b.send('Page.addScriptToEvaluateOnNewDocument', { source: "{ const OriginalDate=Date; globalThis.Date=class extends OriginalDate { constructor(...args){super(...(args.length?args:['2026-10-04T15:00:00Z']))} }; }" });
  await b.open(eventHome);
  for (const key of ['終了','終了','all','開催予定']) {
    await b.evaluate(`document.querySelector('#events button[data-k="${key}"]').click()`);
    assert.equal(await b.evaluate("[...document.querySelectorAll('#ev-list > li')].filter(x=>getComputedStyle(x).display!=='none').length"), key==='all'?4:key==='終了'?1:3);
  }
  assert.equal(await b.evaluate("document.querySelector('.ended .status').textContent"), '終了');
  assert.equal(await b.evaluate("getComputedStyle(document.querySelector('.ended h3')).color"), 'rgb(138, 153, 168)');
  await b.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: next.identifier });
  await rm(eventFile);
});
test('browser: keyboard navigation, images and required screenshot widths', async () => {
  await b.open(home, 1366);
  await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  assert.equal(await b.evaluate("document.activeElement.tagName"), 'A');
  assert.equal(await b.evaluate("getComputedStyle(document.activeElement).outlineStyle"), 'solid');
  if (process.env.SCREENSHOT_DIR) {
    await mkdir(process.env.SCREENSHOT_DIR, { recursive: true });
    for (const width of [390,1366]) {
      await b.open(home,width,width===390?900:768);
      await b.screenshot(join(process.env.SCREENSHOT_DIR,`home-${width}.png`));
      await b.screenshot(join(process.env.SCREENSHOT_DIR,`home-${width}-full.png`),true);
      await b.evaluate('window.scrollTo(0,document.documentElement.scrollHeight)');
      await b.screenshot(join(process.env.SCREENSHOT_DIR,`footer-${width}.png`));
      await b.open(pathToFileURL(join(root,'dist/makers/omishima-winery/index.html')).href,width);
      await b.screenshot(join(process.env.SCREENSHOT_DIR,`winery-${width}.png`),true);
    }
  }
});
test('browser: very long names and descriptions with special characters stay inside all four widths', async () => {
  const {mkdtemp,cp,readFile,writeFile,rm} = await import('node:fs/promises');
  const {tmpdir} = await import('node:os');
  const fixture=await mkdtemp(join(tmpdir(),'sake-long-'));
  let longBrowser;
  try {
    for(const path of ['scripts','assets','data','apps-script']) await cp(join(root,path),join(fixture,path),{recursive:true});
    const makers=JSON.parse(await readFile(join(fixture,'data/makers.json'),'utf8'));
    makers[0].name='VeryLongMakerName'.repeat(30)+'<script>"&';
    makers[0].description='長い説明'.repeat(200)+'<script>alert(1)</script>';
    makers[0].body=makers[0].description;
    makers[0].address='VeryLongAddress'.repeat(30);
    await writeFile(join(fixture,'data/makers.json'),JSON.stringify(makers));
    const experiences=JSON.parse(await readFile(join(fixture,'data/experiences.json'),'utf8'));
    experiences[0].title='VeryLongExperience'.repeat(30); experiences[0].description=makers[0].description; experiences[0].place='LongPlace'.repeat(50);
    await writeFile(join(fixture,'data/experiences.json'),JSON.stringify(experiences));
    execFileSync(process.execPath,['scripts/build.mjs'],{cwd:fixture});
    longBrowser=await browser(fixture);
    for(const width of [360,390,1366,1920]) {
      for(const path of ['dist/index.html','dist/makers/yagi-shuzobu/index.html']) {
        await longBrowser.open(pathToFileURL(join(fixture,path)).href,width);
        assert.equal(await longBrowser.evaluate('document.documentElement.scrollWidth <= innerWidth'),true,`${width} ${path}`);
        assert.equal(await longBrowser.evaluate("document.querySelectorAll('script').length"),path==='dist/index.html'?2:1);
      }
    }
  } finally { if(longBrowser) await longBrowser.close(); await rm(fixture,{recursive:true,force:true}); }
});
