import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, cp, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const source = fileURLToPath(new URL('../', import.meta.url));
let root;
const read = path => readFile(join(root, path), 'utf8');
const json = async path => JSON.parse(await read(path));
let home, makers, experiences, events;
before(async () => {
  root = await mkdtemp(join(tmpdir(),'sake-tests-'));
  for (const p of ['scripts','data','assets','apps-script','package.json']) await cp(join(source,p),join(root,p),{recursive:true});
  execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: root });
  [home, makers, experiences, events] = await Promise.all([read('dist/index.html'), json('data/makers.json'), json('data/experiences.json'), json('data/events.json')]);
});
after(async () => { if(root) await rm(root,{recursive:true,force:true}); });
test('package scripts use Node only and have no dependencies', async () => {
  const pkg = await json('package.json');
  assert.deepEqual(pkg.scripts, { build: 'node scripts/build.mjs', test: 'node --test' });
  assert.deepEqual(pkg.dependencies, {}); assert.deepEqual(pkg.devDependencies, {});
});
test('all five makers exactly match the supplied names, addresses, phones and empty fields', () => {
  assert.deepEqual(makers.map(m => [m.id, m.name, m.kind, m.area, m.sub, m.postal, m.address, m.tel, m.website]), [
    ['omishima-brewery','大三島ブリュワリー','ビール','大三島','しまなみ海道の小さな地ビール醸造所','794-1304','愛媛県今治市大三島町宮浦5589','0897-72-9248',''],
    ['omishima-winery','大三島みんなのワイナリー','ワイン','大三島','','794-1304','愛媛県今治市大三島町宮浦5562','0897-72-9377','https://ohmishimawine.raku-uru.jp/'],
    ['omishima-limone','大三島リモーネ','リキュール','大三島','','794-1404','愛媛県今治市上浦町瀬戸2342','0897-87-2131',''],
    ['imabari-machinaka-bakushu','今治街中麦酒','ビール','今治','商店街ブルワリー','794-0015','愛媛県今治市常盤町3丁目4-13','0898-35-4313',''],
    ['yagi-shuzobu','八木酒造部','日本酒','今治','山丹正宗','794-0042','愛媛県今治市旭町3丁目3-8','0898-22-6700','']
  ]);
  makers.forEach((m, i) => { assert.equal(m.order, i + 1); for (const key of ['description','body','hours']) assert.equal(m[key], ''); assert.deepEqual(m.sns, []); assert.equal(m.lat, null); assert.equal(m.lng, null); });
});
test('data uses only the planned fields and asset paths', async () => {
  const keys = ['id','order','name','kind','area','sub','description','body','logo','photos','postal','address','tel','website','sns','hours','lat','lng'];
  for (const m of makers) { assert.deepEqual(Object.keys(m).sort(), keys.sort()); assert.equal(m.logo, `makers/${m.id}.png`); await read(`assets/${m.logo}`); }
  for (const x of experiences) assert.deepEqual(Object.keys(x).sort(), ['id','category','title','description','photo','price','duration','schedule','place','maker_id','booking_url','booking_label','sample'].sort());
  for (const x of events) assert.deepEqual(Object.keys(x).sort(), ['id','title','description','start_date','end_date','time_text','url','sample','photo'].sort());
});
test('all mockup experiences and events are marked as samples', () => {
  assert.equal(experiences.length, 5); assert.equal(events.length, 4);
  assert.ok([...experiences, ...events].every(x => x.sample === true));
  for (const x of [...experiences, ...events]) { assert.ok(home.includes(x.title)); }
  assert.equal((home.match(/class="sample"/g) || []).length, 9);
});
test('home contains the approved hero, maker cards, supplied map and filters', () => {
  for (const text of ['しまなみの風土から','造り手を見る','酒蔵・醸造所見学','ペアリング','文化ガイド','お酒診断','スタンプラリー','開催予定','終了','すべて','地図を大きく見る']) assert.ok(home.includes(text), text);
  assert.equal((home.match(/class="maker"/g) || []).length, 5);
  assert.equal((home.match(/class="pin"/g) || []).length, 5);
  assert.doesNotMatch(home, /class="desc"|class="switch"|view-maker|data:image|<iframe/);
});
test('all maker details have correct contact information and only populated optional rows', async () => {
  for (const m of makers) {
    const html = await read(`dist/makers/${m.id}/index.html`);
    for (const value of [m.name, m.address, m.tel, '経路を見る']) assert.ok(html.includes(value));
    assert.equal(html.includes('公式サイトを開く'), Boolean(m.website));
    assert.doesNotMatch(html, /<dt>営業時間<\/dt>|<dt>SNS<\/dt>|class="desc"/);
  }
});
test('map and detail directions encode the address without a postal code', async () => {
  for (const m of makers) {
    const expected = `https://www.google.com/maps/search/?api=1&amp;query=${encodeURIComponent(m.address)}`;
    assert.ok(home.includes(expected)); assert.ok((await read(`dist/makers/${m.id}/index.html`)).includes(expected));
  }
});
test('bookings and event links use data URLs and open a safe new tab', () => {
  for (const x of experiences) assert.ok(home.includes(`href="${x.booking_url}" target="_blank" rel="noopener noreferrer"`));
  for (const x of events) assert.ok(home.includes(`href="${x.url}" target="_blank" rel="noopener noreferrer"`));
});
test('winery photos are copied byte-for-byte and empty experience photos have placeholders', async () => {
  const winery = makers.find(m => m.id === 'omishima-winery');
  for (const p of winery.photos) assert.deepEqual(await readFile(join(root, 'dist/assets', p)), await readFile(join(root, 'assets', p)));
  assert.ok(winery.photos.includes('photos/winery-tanks.jpg'));
  assert.equal((home.match(/写真登録予定/g) || []).length, 2);
});
test('all six footers keep brand and navigation and omit the three removed notices', async () => {
  for (const html of [home, ...await Promise.all(makers.map(m => read(`dist/makers/${m.id}/index.html`)))]) {
    const footer = html.match(/<footer[\s\S]*?<\/footer>/)[0];
    assert.ok(footer.includes('SHIMANAMIの酒'));
    assert.ok(footer.includes('フッターメニュー'));
    assert.doesNotMatch(footer, /運営 登録予定|お問い合わせ 登録予定|20歳未満|飲酒運転|Googleアナリティクス|<small>/);
    assert.doesNotMatch(html, /googletagmanager|gtag\(/);
  }
});
test('all local image, stylesheet and page links resolve under a GitHub Pages subdirectory', async () => {
  const pages = ['dist/index.html', ...makers.map(m => `dist/makers/${m.id}/index.html`)];
  for (const path of pages) {
    const html = await read(path);
    for (const [, url] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
      if (/^(https?:|tel:|#)/.test(url)) continue;
      assert.ok(!url.startsWith('/'), url);
      const local = resolve(root, dirname(path), url.split('#')[0]);
      assert.ok(local.startsWith(join(root, 'dist/')));
      await readFile(local.endsWith('/') ? `${local}index.html` : local);
    }
  }
});
test('production CSS preserves the approved CSS except documented fit and overflow fixes', async () => {
  const css = await read('scripts/site.css'); const built = await read('dist/site.css');
  assert.equal(css, built);
  const mockup = await readFile(join(source,'docs/mockups/site-v1.html'),'utf8');
  const approved = mockup.match(/<style>([\s\S]*?)<\/style>/)[1].replace(/\/\* review switcher[\s\S]*?(?=@media)/,'').replace(/^\.foot small\{[^\n]*\}\n/m,'').trim();
  assert.ok(css.startsWith(approved), 'approved CSS stays verbatim before functional additions');
  for (const token of ['--blue:#00508E','--blue-deep:#003F72','--ink:#102A43','--muted:#566B80','--line:#D5E0EA','--sea:#EAF2F8','--ended:#8A99A8','Noto Sans JP','max-width:1240px','repeat(5,minmax(0,1fr))']) assert.ok(css.includes(token), token);
  assert.doesNotMatch(css, /\.switch|box-shadow/);
});
test('build escapes special characters, honors order, hides empty rows and copies changed data', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'sake-data-'));
  try {
    for (const p of ['scripts', 'data', 'assets', 'apps-script']) await cp(join(root, p), join(fixture, p), { recursive: true });
    const copy = structuredClone(makers); const target = copy.find(m => m.id === 'yagi-shuzobu'); target.name = '長い名前'.repeat(50) + '<script>"&'; target.description = '説明'.repeat(200) + '<img src=x onerror=alert(1)>'; target.body = target.description; target.order = 99; target.photos = [];
    await writeFile(join(fixture, 'data/makers.json'), JSON.stringify(copy));
    const ex = structuredClone(experiences); ex[0].photo = ''; ex[0].booking_label = ''; ex[0].price = ''; ex[0].sample = false;
    await writeFile(join(fixture, 'data/experiences.json'), JSON.stringify(ex));
    execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: fixture });
    const html = await readFile(join(fixture, 'dist/index.html'), 'utf8');
    assert.ok(html.includes('&lt;script&gt;&quot;&amp;')); assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
    assert.ok(html.indexOf('makers/imabari-machinaka-bakushu/') < html.indexOf('makers/yagi-shuzobu/'));
    assert.doesNotMatch(html, /<script>"&|<img src=x onerror/);
    const first = html.match(/<li data-k="見学"[\s\S]*?<\/li>/)[0];
    assert.doesNotMatch(first, /<dt>料金<\/dt>|class="sample"/); assert.ok(first.includes('予約サイトへ'));
    const detail = await readFile(join(fixture,'dist/makers/yagi-shuzobu/index.html'),'utf8'); assert.doesNotMatch(detail, /class="gallery"|class="d-hero"/);
  } finally { await rm(fixture, { recursive: true, force: true }); }
});


test('supplied map keeps fixed maker numbers and colors even when display order changes', async () => {
  const { renderPages } = await import('../scripts/site-render.mjs');
  const ids = ['omishima-brewery','omishima-winery','omishima-limone','imabari-machinaka-bakushu','yagi-shuzobu'];
  const colors = ['#18958D','#984362','#C49500','#D47720','#265A70'];
  for (const html of [home, renderPages(makers.map(m=>({...m,order:6-m.order})),experiences,events).get('index.html')]) {
    ids.forEach((id,i)=>assert.ok(html.includes(`data-map-maker="${id}"><span class="pin" style="--pin-color:${colors[i]}${i===0||i===2||i===3?';--pin-ink:var(--ink)':''}"><span>${String(i+1).padStart(2,'0')}</span>`), id));
    assert.ok(html.includes('width="1459" height="1078"'));
    assert.doesNotMatch(html,/ここに地図を表示します|3段階で住所/);
  }
  assert.deepEqual(await readFile(join(root,'dist/assets/maps/shimanami-area.png')),await readFile(join(root,'assets/maps/shimanami-area.png')));
});
