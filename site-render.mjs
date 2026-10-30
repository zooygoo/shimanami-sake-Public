const headerTemplate = "<header class=\"site-head\">\n  <div class=\"wrap head-row\">\n    <a class=\"brand\" href=\"#top\" aria-label=\"SHIMANAMIの酒 トップへ\"><img src=\"ASSETbrand/shimanami-logo.png\" alt=\"\" width=\"38\" height=\"38\"><span>SHIMANAMIの酒</span></a>\n    <nav class=\"nav\" aria-label=\"メインメニュー\"><a href=\"#makers\">造り手</a><a href=\"#map\">地図</a><a href=\"#experience\">体験</a><a href=\"#events\">イベント</a></nav>\n  </div>\n  <div class=\"wrap\"><nav class=\"mnav\" aria-label=\"メインメニュー\"><a href=\"#makers\">造り手</a><a href=\"#map\">地図</a><a href=\"#experience\">体験</a><a href=\"#events\">イベント</a></nav></div>\n</header>";
const hero = "<section class=\"hero\" aria-labelledby=\"h-hero\">\n    <div class=\"wrap\">\n      <div class=\"hero-text\">\n        <p class=\"kicker\">愛媛県 しまなみ海道・ゆめしま海道</p>\n        <h1 id=\"h-hero\">しまなみの風土から<wbr>生まれた、<br>この土地ならではの<wbr>一杯。</h1>\n        <div class=\"kinds\" aria-label=\"お酒の種類\"><span>日本酒</span><span>ビール</span><span>ワイン</span><span>リキュール</span></div>\n        <p class=\"intro\">SHIMANAMIの酒は、しまなみ地域の風土と造り手の想いから生まれたお酒を紹介する名称です。お酒の味わいとともに、造り手の物語や島の風景、体験を通して、しまなみの魅力をより深く楽しんでいただくことを目指しています。</p>\n        <div class=\"ctas\"><a class=\"btn btn-solid\" href=\"#makers\">造り手を見る</a><a class=\"btn btn-line\" href=\"#map\">地図で見る</a></div>\n      </div>\n      <div class=\"logo-stage\">\n        <svg viewBox=\"-0.4 0 1.8 1\" preserveAspectRatio=\"none\" aria-hidden=\"true\"><line x1=\"0.002\" y1=\"0.797\" x2=\"-0.30\" y2=\"1\" stroke=\"#fff\" stroke-width=\"0.0082\"/><line x1=\"0.998\" y1=\"0.786\" x2=\"1.31\" y2=\"1\" stroke=\"#fff\" stroke-width=\"0.0082\"/></svg>\n        <img src=\"assets/brand/shimanami-logo.png\" alt=\"SHIMANAMIの酒 EHIME\" width=\"600\" height=\"600\">\n      </div>\n    </div>\n  </section>";
const footerTemplate = "<footer class=\"foot\">\n  <div class=\"wrap\">\n    <div class=\"foot-brand\"><img src=\"ASSETbrand/shimanami-logo.png\" alt=\"\" width=\"64\" height=\"64\"><b>SHIMANAMIの酒</b></div>\n    <nav aria-label=\"フッターメニュー\"><a href=\"#makers\">造り手</a><a href=\"#map\">地図</a><a href=\"#experience\">体験</a><a href=\"#events\">イベント</a><a href=\"admin/\">管理</a></nav>\n  </div>\n</footer>";

export function activateFilters(){
  const parts = new Intl.DateTimeFormat('en-US', {timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const value = type => parts.find(p=>p.type===type).value;
  const today = value('year')+'-'+value('month')+'-'+value('day');
  document.querySelectorAll('[data-end-date]').forEach(row => {
    const ended = row.dataset.endDate < today;
    row.dataset.k = ended ? '終了' : '開催予定';
    row.classList.toggle('ended', ended);
    row.querySelector('.status').textContent = row.dataset.k;
  });
  document.querySelectorAll('.chips').forEach(group => {
    const target = document.getElementById(group.dataset.target);
    const buttons = group.querySelectorAll('button');
    function apply(button) {
      buttons.forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
      [...target.children].forEach(row=>{row.hidden=!(button.dataset.k==='all'||row.dataset.k===button.dataset.k)});
    }
    buttons.forEach(b=>b.addEventListener('click',()=>apply(b)));
    apply(group.querySelector('[aria-pressed="true"]'));
  });
}

export function photoSource(path,prefix=''){
 if(typeof path!=='string')return '';
 if(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(path)&&path.length<=341359)return path;
 return /^(?:photos|makers|brand)\/[a-zA-Z0-9_-]+\.(?:jpg|jpeg|png|webp)$/.test(path)?prefix+'assets/'+path:'';
}

export function renderPages(makerData, experiences, eventData, connection={apps_script_url:''}){
experiences = experiences.filter(x=>!x.sample);
const makers = makerData.toSorted((a,b) => a.order - b.order);
const events = eventData.filter(x=>!x.sample).toSorted((a,b) => a.start_date.localeCompare(b.start_date));
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const optional = (value, tag, cls = '') => value ? `<${tag}${cls ? ` class="${cls}"` : ''}>${esc(value)}</${tag}>` : '';
const categories = { 見学:'酒蔵・醸造所見学', ペアリング:'ペアリング', ガイド:'文化ガイド', 診断:'お酒診断', 周遊:'スタンプラリー' };
const address = m => `${m.postal ? `〒${m.postal} ` : ''}${m.address}`;
const directions = m => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(m.name+' '+m.address.replace(/^〒?\d{3}-?\d{4}\s*/, ''))}`;
const external = (url, label, cls = '', prefix = '', target = '') => `<a${target && url.startsWith('https://') ? ` data-link-target="${esc(target)}"` : ''}${cls ? ` class="${cls}"` : ''} href="${esc(url.startsWith('#') ? prefix + url : url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`;
const photo = (path, alt, prefix = '', cls = '') => photoSource(path,prefix) ? `<img${cls ? ` class="${cls}"` : ''} src="${esc(photoSource(path,prefix))}" alt="${esc(alt)}" loading="lazy">` : '';
const info = (label, value) => value ? `<dt>${label}</dt><dd>${esc(value)}</dd>` : '';
const booking = (x, prefix = '') => x.booking_label!=='非表示'&&x.booking_url ? external(x.booking_url, '予約サイトへ', 'btn btn-blue btn-sm', prefix, 'experience:'+x.id) : '';
const navShell = (template, prefix) => template.replaceAll('ASSET', `${prefix}assets/`).replaceAll('href="admin/"', `href="${prefix}admin/"`).replaceAll('href="#', `href="${prefix}index.html#`);
function page(title, main, prefix = '', script = '', pagePath = '/') {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>${esc(title)} | SHIMANAMIの酒</title><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700;900&display=swap"><link rel="stylesheet" href="${prefix}site.css"></head><body id="top">${navShell(headerTemplate,prefix)}${main}${navShell(footerTemplate,prefix)}${script ? `<script>${script}</script>` : ''}<script type="module" src="${prefix}site-runtime.mjs" data-endpoint="${esc(connection.apps_script_url)}" data-page="${esc(pagePath)}"></script></body></html>`;
}
function section(id, headingId, title, desc, content, cls = '', style = '') {
  return `<section class="sec ${cls}" id="${id}" aria-labelledby="${headingId}"${style ? ` style="${style}"` : ''}><div class="wrap"><div class="sec-head"><h2 id="${headingId}">${title}</h2><p>${desc}</p></div>${content}</div></section>`;
}
function filters(target, label, entries) {
  return `<div class="chips" role="group" aria-label="${label}" data-target="${target}">${entries.map(([id,key,text],i)=>`<button type="button" id="${id}" data-k="${key}" aria-pressed="${i===0}">${text}</button>`).join('')}</div>`;
}
const makerCards = `<div class="row5">${makers.map(m=>`<a class="maker" href="makers/${m.id}/index.html"><div class="m-vis">${photo(m.logo,`${m.name}のロゴ`)}</div><div class="m-body"><span class="kind">${esc(m.kind)}</span><span class="name">${esc(m.name)}</span>${optional(m.sub,'span','sub')}<span class="area">${esc(m.area)}</span>${optional(m.description,'p','desc')}<span class="more">詳しく見る</span></div></a>`).join('')}</div>`;
const mapPins = {"omishima-brewery": {"number": "01", "x": 314, "y": 135}, "omishima-winery": {"number": "02", "x": 245, "y": 231}, "omishima-limone": {"number": "03", "x": 632, "y": 236}, "imabari-machinaka-bakushu": {"number": "04", "x": 363, "y": 794}, "yagi-shuzobu": {"number": "05", "x": 285, "y": 818}};
const mapPin = m => {
 const pin = mapPins[m.id];
 return pin ? `<svg class="pin" viewBox="0 0 76 100" role="img" aria-label="${pin.number}"><defs><clipPath id="map-pin-${pin.number}"><path d="M38 1C17 1 1 17 1 38C1 60 38 99 38 99C38 99 75 60 75 38C75 17 59 1 38 1Z"/></clipPath></defs><image href="assets/maps/shimanami-area.png" x="-${pin.x}" y="-${pin.y}" width="1459" height="1078" clip-path="url(#map-pin-${pin.number})"/></svg>` : '';
};
const map = `<div class="map-grid"><a class="map-illustration" href="assets/maps/shimanami-area.png" target="_blank" rel="noopener noreferrer"><img src="assets/maps/shimanami-area.png" width="1459" height="1078" alt="しまなみ海道周辺の造り手の位置。01 大三島ブリュワリー、02 大三島みんなのワイナリー、03 大三島リモーネ、04 今治街中麦酒、05 八木酒造部。" loading="lazy"><span>地図を大きく見る</span></a><ol class="places">${makers.map(m=>`<li data-map-maker="${esc(m.id)}">${mapPin(m)}<b>${esc(m.name)}</b><span class="p-kind">${esc(m.kind)}　${esc(m.area)}</span>${m.address ? `<span class="p-addr"><em>住所</em>${esc(address(m))}</span>` : ''}${m.tel ? `<span class="p-addr"><em>電話</em>${esc(m.tel)}</span>` : ''}${m.address ? external(directions(m),'経路を見る','','','maker:'+m.id+':directions') : ''}</li>`).join('')}</ol></div>`;
const experienceRows = `<ul class="exp-list" id="exp-list">${experiences.map(x=>`<li data-k="${esc(x.category)}"><div class="e-photo">${x.photo ? photo(x.photo,x.title) : '写真登録予定'}</div><div class="e-main"><span class="e-kind">${esc(categories[x.category])}</span><h3 class="e-title">${esc(x.title)}</h3>${optional(x.description,'p','e-desc')}${booking(x)}</div></li>`).join('')}</ul>${!experiences.length?'<p class="note">体験情報は、決まり次第ご案内します。</p>':''}`;
const dateText = date => new Intl.DateTimeFormat('ja-JP',{year:'numeric',month:'long',day:'numeric',timeZone:'Asia/Tokyo'}).format(new Date(`${date}T00:00:00+09:00`));
const eventFilters = filters('ev-list','イベントの状態で絞り込む',[['ev-up','開催予定','開催予定'],['ev-end','終了','終了'],['ev-all','all','すべて']]);
const eventRows = `<ul class="events" id="ev-list">${events.map(x=>{
 const [year,month,day]=x.start_date.split('-');
 const weekday = new Intl.DateTimeFormat('ja-JP',{weekday:'long',timeZone:'Asia/Tokyo'}).format(new Date(`${x.start_date}T00:00:00+09:00`));
 return `<li data-end-date="${esc(x.end_date)}"><div class="date"><span class="y">${year}</span><span class="md">${month}.${day}</span><span class="w">${weekday}</span></div><div class="ev"><span class="status"></span><h3>${esc(x.title)}</h3>${x.photo ? photo(x.photo,x.title,'','event-photo') : ''}${optional(x.description,'p')}<span class="when">日程　${dateText(x.start_date)}${x.end_date!==x.start_date?'〜'+dateText(x.end_date):''}${x.time_text?' '+esc(x.time_text):''}</span></div>${x.url ? external(x.url,'詳しく見る','btn btn-blue btn-sm ev-link','','event:'+x.id) : ''}</li>`;
}).join('')}</ul>${!events.length?'<p class="note">イベント情報は、決まり次第ご案内します。</p>':''}`;
const browserScript = '('+activateFilters.toString()+')();';
const home = `<main>${hero}${section('makers','h-makers','造り手','しまなみ地域でお酒をつくる5つの事業者です。造り手を選ぶと、詳しい紹介と公式サイトを見られます。',makerCards)}${section('map','h-map','地図','地図の番号と色を一覧の造り手と照らし合わせてご覧ください。',map,'sea-band')}${section('experience','h-exp','体験','予約は各体験の予約サイトで受け付けます。',experienceRows)}${section('events','h-ev','イベント','開催日が過ぎたイベントには終了と表示します。',eventFilters+eventRows,'','padding-top:0')}</main>`;
const pages=new Map([['index.html',page('トップ',home,'',browserScript)]]);
for (const m of makers) {
  const prefix = '../../';
  const related = experiences.filter(x=>x.maker_id===m.id);
  const photos = (m.photos||[]).filter(path=>photoSource(path,prefix));
  const main = `<main><div class="wrap"><nav class="crumb" aria-label="現在の位置"><a href="${prefix}index.html">トップ</a>　/　<a href="${prefix}index.html#makers">造り手</a>　/　${esc(m.name)}</nav><div class="d-top"><div class="d-id"><h1>${esc(m.name)}</h1><div class="labels"><span>${esc(m.kind)}</span><span>${esc(m.area)}</span></div>${optional(m.sub,'p')}${optional(m.body,'p')}</div>${photoSource(m.logo,prefix)?`<div class="d-brand">${photo(m.logo,`${m.name}のロゴ`,prefix,'d-logo')}</div>`:''}</div>${photos.length ? `<figure class="d-hero" style="margin:0">${photo(photos[0],`${m.name}の醸造所`,prefix)}</figure>` : ''}${photos.length>1 ? `<div class="gallery">${photos.slice(1).map(p=>photo(p,`${m.name}の風景`,prefix)).join('')}</div>` : ''}<div class="d-cols"><section aria-labelledby="h-info"><h2 class="h3" id="h-info">基本情報</h2><dl class="info">${info('住所',m.address?address(m):'')}${m.tel?`<dt>電話</dt><dd><a href="tel:${esc(m.tel)}">${esc(m.tel)}</a></dd>`:''}${info('営業時間',m.hours)}${m.website?`<dt>公式サイト</dt><dd>${external(m.website,new URL(m.website).hostname,'','','maker:'+m.id+':website')}</dd>`:''}${m.sns.length?`<dt>SNS</dt><dd>${m.sns.map((x,i)=>external(x.url,x.name,'','','maker:'+m.id+':sns:'+i)).join(' ')}</dd>`:''}</dl><div class="d-actions">${m.address?external(directions(m),'経路を見る','btn btn-blue','','maker:'+m.id+':directions'):''}${m.website?external(m.website,'公式サイトを開く','btn btn-ghost','','maker:'+m.id+':website'):''}</div></section>${related.length ? `<section aria-labelledby="h-rel"><h2 class="h3" id="h-rel">ここで参加できる体験</h2><ul class="mini">${related.map(x=>`<li><span class="e-kind">${esc(categories[x.category])}</span><b>${esc(x.title)}</b>${booking(x,prefix+'index.html')}</li>`).join('')}</ul></section>` : '<section aria-labelledby="h-rel"><h2 class="h3" id="h-rel">体験について</h2><p class="note">体験情報は、内容が決まり次第ご案内します。</p></section>'}</div></div></main>`;
  pages.set(`makers/${m.id}/index.html`,page(m.name,main,prefix,'',`/makers/${m.id}/`));
}
return pages;
}
