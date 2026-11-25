import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,cp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';

test('public release files and all generated site URLs move together after a rebuild',async()=>{
 const root=await mkdtemp(join(tmpdir(),'sake-public-release-'));
 try{
  for(const dir of ['scripts','data','assets','apps-script'])await cp(new URL(`../${dir}`,import.meta.url),join(root,dir),{recursive:true});
  const connectionPath=join(root,'data/connection.json');
  const connection=JSON.parse(await readFile(connectionPath,'utf8'));
  const makers=JSON.parse(await readFile(join(root,'data/makers.json'),'utf8'));
  const pages=[['','トップ'],...makers.map(m=>[`makers/${m.id}/`,m.name])];
  const read=path=>readFile(join(root,'dist',path),'utf8');
  const image='assets/brand/share-preview.png';
  const favicon='assets/brand/favicon.ico';
  const appleIcon='assets/brand/apple-touch-icon.png';
  const configuredBase=new URL(connection.site_url);
  if(!configuredBase.pathname.endsWith('/'))configuredBase.pathname+='/';

  for(const [configured,base] of [
   [connection.site_url,configuredBase.href],
   ['https://new-owner.example/new/pages','https://new-owner.example/new/pages/'],
   ['https://new-owner.example/','https://new-owner.example/'],
  ]){
   await writeFile(connectionPath,JSON.stringify({...connection,site_url:configured}));
   execFileSync(process.execPath,['scripts/build.mjs'],{cwd:root});
   for(const [path,title] of [...pages,['404.html','ページが見つかりません']]){
    const is404=path==='404.html';
    const html=await read(is404?path:`${path}index.html`);
    const head=html.split('</head>')[0];
    const pageTitle=`${title} | SHIMANAMIの酒`;
    assert.ok(head.includes('<html lang="ja">'),path);
    assert.ok(head.includes(`<title>${pageTitle}</title>`),path);
    const description=head.match(/<meta name="description" content="([^"]+)"/)?.[1];
    assert.ok(description,`${path}: description`);
    assert.match(description,/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u);
    for(const [property,content] of [
     ['og:title',pageTitle],['og:description',description],['og:image',base+image],['og:url',base+path],
    ])assert.ok(head.includes(`<meta property="${property}" content="${content}">`),`${path}: ${property}`);
    assert.match(head,/<meta name="twitter:card" content="summary_large_image">/);
    if(is404){
     assert.match(head,/<meta name="robots" content="noindex">/);
     const stylesheet=head.match(/<link rel="stylesheet" href="([^"]+\/site\.[a-f0-9]{12}\.css)">/)?.[1];
     assert.ok(stylesheet?.startsWith(base));
     await read(stylesheet.slice(base.length));
     for(const src of [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map(match=>match[1])){
      if(!src.startsWith('https://fonts.'))assert.ok(src.startsWith(base),src);
     }
     assert.ok(html.includes(`href="${base}">トップへ戻る</a>`));
     assert.doesNotMatch(html,/site-runtime/);
    }else{
     assert.ok(head.includes(`<link rel="canonical" href="${base+path}">`),path);
     assert.doesNotMatch(head,/noindex/);
    }
    for(const [rel,asset] of [['icon',favicon],['apple-touch-icon',appleIcon]]){
     const prefix=is404?base:path?'../../':'';
     assert.ok(head.includes(`<link rel="${rel}" href="${prefix+asset}">`),`${path}: ${rel}`);
    }
   }
   const admin=await read('admin/index.html');
   assert.match(admin.split('</head>')[0],/<meta name="robots" content="noindex">/);
   assert.equal(await read('robots.txt'),`User-agent: *\nDisallow: ${new URL('admin/',base).pathname}\nSitemap: ${base}sitemap.xml\n`);
   const sitemap=await read('sitemap.xml');
   assert.match(sitemap,/<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
   assert.deepEqual([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match=>match[1]),pages.map(([path])=>base+path));
  }

  for(const [path,width,height] of [[image,1200,630],[appleIcon,180,180]]){
   const png=await readFile(join(root,'dist',path));
   assert.equal(png.subarray(1,4).toString(),'PNG');
   assert.equal(png.readUInt32BE(16),width);
   assert.equal(png.readUInt32BE(20),height);
  }
  assert.equal((await readFile(join(root,'dist',favicon))).readUInt32LE(0),0x00010000);
 }finally{await rm(root,{recursive:true,force:true});}
});
