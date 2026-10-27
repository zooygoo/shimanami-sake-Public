const headerTemplate = "<header class=\"site-head\">\n  <div class=\"wrap head-row\">\n    <a class=\"brand\" href=\"#top\" aria-label=\"SHIMANAMIの酒 トップへ\"><img src=\"ASSETbrand/shimanami-logo.png\" alt=\"\" width=\"38\" height=\"38\"><span>SHIMANAMIの酒</span></a>\n    <nav class=\"nav\" aria-label=\"メインメニュー\"><a href=\"#makers\">造り手</a><a href=\"#map\">地図</a><a href=\"#experience\">体験</a><a href=\"#events\">イベント</a></nav>\n  </div>\n  <div class=\"wrap\"><nav class=\"mnav\" aria-label=\"メインメニュー\"><a href=\"#makers\">造り手</a><a href=\"#map\">地図</a><a href=\"#experience\">体験</a><a href=\"#events\">イベント</a></nav></div>\n</header>";
const hero = "<section class=\"hero\" aria-labelledby=\"h-hero\">\n    <div class=\"wrap\">\n      <div class=\"hero-text\">\n        <p class=\"kicker\">愛媛県 しまなみ海道・ゆめしま海道</p>\n        <h1 id=\"h-hero\">しまなみの風土から<wbr>生まれた、<br>この土地ならではの<wbr>一杯。</h1>\n        <div class=\"kinds\" aria-label=\"お酒の種類\"><span>日本酒</span><span>ビール</span><span>ワイン</span><span>リキュール</span></div>\n        <p class=\"intro\">SHIMANAMIの酒は、しまなみ地域の風土と造り手の想いから生まれたお酒を紹介する名称です。お酒の味わいとともに、造り手の物語や島の風景、体験を通して、しまなみの魅力をより深く楽しんでいただくことを目指しています。</p>\n        <div class=\"ctas\"><a class=\"btn btn-solid\" href=\"#makers\">造り手を見る</a><a class=\"btn btn-line\" href=\"#map\">地図で見る</a></div>\n      </div>\n      <div class=\"logo-stage\">\n        <svg viewBox=\"-0.4 0 1.8 1\" preserveAspectRatio=\"none\" aria-hidden=\"true\"><line x1=\"0.002\" y1=\"0.797\" x2=\"-0.30\" y2=\"1\" stroke=\"#fff\" stroke-width=\"0.0082\"/><line x1=\"0.998\" y1=\"0.786\" x2=\"1.31\" y2=\"1\" stroke=\"#fff\" stroke-width=\"0.0082\"/></svg>\n        <img src=\"assets/brand/shimanami-logo.png\" alt=\"SHIMANAMIの酒 EHIME\" width=\"600\" height=\"600\">\n      </div>\n    </div>\n  </section>";
const footerTemplate = "<footer class=\"foot\">\n  <div class=\"wrap\">\n    <div class=\"foot-brand\"><img src=\"ASSETbrand/shimanami-logo.png\" alt=\"\" width=\"64\" height=\"64\"><b>SHIMANAMIの酒</b></div>\n    <nav aria-label=\"フッターメニュー\"><a href=\"#makers\">造り手</a><a href=\"#map\">地図</a><a href=\"#experience\">体験</a><a href=\"#events\">イベント</a></nav>\n  </div>\n</footer>";

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

export function renderPages(makerData, experiences, eventData, connection={apps_script_url:''}){
const makers = makerData.toSorted((a,b) => a.order - b.order);
const events = eventData.toSorted((a,b) => a.start_date.localeCompare(b.start_date));
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const optional = (value, tag, cls = '') => value ? `<${tag}${cls ? ` class="${cls}"` : ''}>${esc(value)}</${tag}>` : '';
const sample = value => value.sample ? '<span class="sample">表示例</span>' : '';
const categories = { 見学:'酒蔵・醸造所見学', ペアリング:'ペアリング', ガイド:'文化ガイド', 診断:'お酒診断', 周遊:'スタンプラリー' };
const address = m => `${m.postal ? `〒${m.postal} ` : ''}${m.address}`;
const directions = m => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(m.address.replace(/^〒?\d{3}-?\d{4}\s*/, ''))}`;
const external = (url, label, cls = '', prefix = '') => `<a${cls ? ` class="${cls}"` : ''} href="${esc(url.startsWith('#') ? prefix + url : url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`;
const photo = (path, alt, prefix = '', cls = '') => `<img${cls ? ` class="${cls}"` : ''} src="${prefix}assets/${esc(path)}" alt="${esc(alt)}" loading="lazy">`;
const info = (label, value) => value ? `<dt>${label}</dt><dd>${esc(value)}</dd>` : '';
const booking = (x, prefix = '') => x.booking_url ? external(x.booking_url, x.booking_label || '予約サイトへ', 'btn btn-blue btn-sm', prefix) : '';
const navShell = (template, prefix) => template.replaceAll('ASSET', `${prefix}assets/`).replaceAll('href="#', `href="${prefix}index.html#`);
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
const map = `<div class="map-grid"><div class="gmap" role="img" aria-label="地図の表示位置"><div><b>ここに地図を表示します</b><span>3段階で住所をもとに番号付きのピンを表示します。</span></div></div><ol class="places">${makers.map((m,i)=>`<li><span class="pin"><span>${i+1}</span></span><b>${esc(m.name)}</b><span class="p-kind">${esc(m.kind)}　${esc(m.area)}</span>${m.address ? `<span class="p-addr"><em>住所</em>${esc(address(m))}</span>` : ''}${m.tel ? `<span class="p-addr"><em>電話</em>${esc(m.tel)}</span>` : ''}${m.address ? external(directions(m),'経路を見る') : ''}</li>`).join('')}</ol></div>`;
const experienceFilters = filters('exp-list','体験の種類で絞り込む',[['ex-all','all','すべて'], ...Object.entries(categories).map(([key,label],i)=>[['ex-tour','ex-pair','ex-guide','ex-diag','ex-stamp'][i],key,label])]);
const experienceRows = `<ul class="exp-list" id="exp-list">${experiences.map(x=>`<li data-k="${esc(x.category)}"><div class="e-photo">${x.photo ? photo(x.photo,x.title) : '写真登録予定'}</div><div class="e-main"><span class="e-kind">${esc(categories[x.category])} ${sample(x)}</span><h3 class="e-title">${esc(x.title)}</h3>${optional(x.description,'p','e-desc')}</div><div class="e-side"><dl>${info(x.category==='周遊'?'参加費':'料金',x.price)}${info('所要時間',x.duration)}${info(x.category==='周遊'?'期間':'開催',x.schedule)}${info('場所',x.place)}</dl>${booking(x)}</div></li>`).join('')}</ul><p class="note">体験名、説明、写真は表示例です。予約先は登録予定です。</p>`;
const dateText = date => new Intl.DateTimeFormat('ja-JP',{year:'numeric',month:'long',day:'numeric',timeZone:'Asia/Tokyo'}).format(new Date(`${date}T00:00:00+09:00`));
const eventFilters = filters('ev-list','イベントの状態で絞り込む',[['ev-up','開催予定','開催予定'],['ev-end','終了','終了'],['ev-all','all','すべて']]);
const eventRows = `<ul class="events" id="ev-list">${events.map(x=>{
 const [year,month,day]=x.start_date.split('-');
 const weekday = new Intl.DateTimeFormat('ja-JP',{weekday:'long',timeZone:'Asia/Tokyo'}).format(new Date(`${x.start_date}T00:00:00+09:00`));
 return `<li data-end-date="${esc(x.end_date)}"><div class="date"><span class="y">${year}</span><span class="md">${month}.${day}</span><span class="w">${weekday}</span></div><div class="ev"><span class="status"></span><h3>${esc(x.title)} ${sample(x)}</h3>${optional(x.description,'p')}<span class="when">日程　${dateText(x.start_date)}${x.end_date!==x.start_date?'〜'+dateText(x.end_date):''}${x.time_text?' '+esc(x.time_text):''}</span></div>${x.url ? external(x.url,'詳しく見る','btn btn-blue btn-sm ev-link') : ''}</li>`;
}).join('')}</ul><p class="note">イベント名、日程、内容は表示例です。</p>`;
const browserScript = '('+activateFilters.toString()+')();';
const home = `<main>${hero}${section('makers','h-makers','造り手','しまなみ地域でお酒をつくる5つの事業者です。造り手を選ぶと、詳しい紹介と公式サイトを見られます。',makerCards)}${section('map','h-map','地図','登録した住所をもとに、造り手、取り扱い飲食店、体験の場所を地図に表示します。',map,'sea-band')}${section('experience','h-exp','体験','種類から探せます。予約は各体験の予約サイトで受け付けます。',experienceFilters+experienceRows)}${section('events','h-ev','イベント','開催日が過ぎたイベントには終了と表示します。',eventFilters+eventRows,'','padding-top:0')}</main>`;
const pages=new Map([['index.html',page('トップ',home,'',browserScript)]]);
for (const m of makers) {
  const prefix = '../../';
  const related = experiences.filter(x=>x.maker_id===m.id);
  const main = `<main><div class="wrap"><nav class="crumb" aria-label="現在の位置"><a href="${prefix}index.html">トップ</a>　/　<a href="${prefix}index.html#makers">造り手</a>　/　${esc(m.name)}</nav><div class="d-top"><div class="d-id">${photo(m.logo,`${m.name}のロゴ`,prefix,'d-logo')}<h1>${esc(m.name)}</h1><div class="labels"><span>${esc(m.kind)}</span><span>${esc(m.area)}</span></div>${optional(m.sub,'p')}${optional(m.body,'p')}</div>${m.photos.length ? `<figure class="d-hero" style="margin:0">${photo(m.photos[0],`${m.name}の醸造所`,prefix)}</figure>` : ''}</div>${m.photos.length>1 ? `<div class="gallery">${m.photos.slice(1).map((p,i)=>photo(p,`${m.name}の風景`,prefix,i===0?'g1':'')).join('')}</div>` : ''}<div class="d-cols"><section aria-labelledby="h-info"><h2 class="h3" id="h-info">基本情報</h2><dl class="info">${info('住所',m.address?address(m):'')}${m.tel?`<dt>電話</dt><dd><a href="tel:${esc(m.tel)}">${esc(m.tel)}</a></dd>`:''}${info('営業時間',m.hours)}${m.website?`<dt>公式サイト</dt><dd>${external(m.website,new URL(m.website).hostname)}</dd>`:''}${m.sns.length?`<dt>SNS</dt><dd>${m.sns.map(x=>external(x.url,x.name)).join(' ')}</dd>`:''}</dl><div class="d-actions">${m.address?external(directions(m),'経路を見る','btn btn-blue'):''}${m.website?external(m.website,'公式サイトを開く','btn btn-ghost'):''}</div></section>${related.length ? `<section aria-labelledby="h-rel"><h2 class="h3" id="h-rel">ここで参加できる体験</h2><ul class="mini">${related.map(x=>`<li><span class="e-kind">${esc(categories[x.category])} ${sample(x)}</span><b>${esc(x.title)}</b>${booking(x,prefix+'index.html')}</li>`).join('')}</ul></section>` : ''}</div></div></main>`;
  pages.set(`makers/${m.id}/index.html`,page(m.name,main,prefix,'',`/makers/${m.id}/`));
}
return pages;
}
