import {renderPages,activateFilters} from './site-render.776fe6f7eb0f.mjs';
export function validEndpoint(url){return /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url);}
export function sendPageView(endpoint,page,services=globalThis){
  return sendEvent(endpoint,page,{action:'view'},services);
}
export function sendLinkClick(endpoint,page,target,services=globalThis){
  if(typeof target!=='string'||!/^(?:(?:experience|event):[a-z][a-z0-9-]{0,79}|maker:[a-z][a-z0-9-]{0,79}:(?:website|directions|sns:\d+))$/.test(target))return false;
  return sendEvent(endpoint,page,{action:'click',target},services);
}
function sendEvent(endpoint,page,event,services){
  if(!validEndpoint(endpoint)||!/^\/(?:makers\/[a-z][a-z0-9-]*\/)?$/.test(page))return false;
  let body;
  try{body=new Blob([JSON.stringify({...event,page,event_id:services.crypto.randomUUID()})],{type:'text/plain;charset=UTF-8'});}catch{return false;}
  try{if(services.navigator?.sendBeacon?.(endpoint,body))return true;}catch{}
  try{
    services.fetch(endpoint,{method:'POST',body,mode:'no-cors',credentials:'omit',keepalive:true}).catch(()=>{});
    return true;
  }catch{return false;}
}
export function loadPublicData(endpoint){
  return new Promise((resolve,reject)=>{
    const name='__sakeData_'+crypto.randomUUID().replaceAll('-','');
    const script=document.createElement('script');
    const clear=()=>{clearTimeout(timer);delete window[name];script.remove();};
    const timer=setTimeout(()=>{clear();reject(new Error('timeout'));},15000);
    window[name]=data=>{clear();if(!['makers','experiences','events'].every(k=>Array.isArray(data?.[k])))reject(new Error('invalid data'));else resolve(data);};
    script.onerror=()=>{clear();reject(new Error('connection failed'));};
    script.src=endpoint+'?action=public&callback='+name;
    document.head.append(script);
  });
}
if(typeof document!=='undefined'){
 const script=document.querySelector('script[data-endpoint][data-page]');
 const endpoint=script?.dataset.endpoint,pagePath=script?.dataset.page;
 if(validEndpoint(endpoint)&&!location.pathname.includes('/admin/')){
   sendPageView(endpoint,pagePath);
   const trackLink=event=>{
     if(event.defaultPrevented||event.type==='click'&&event.button!==0||event.type==='auxclick'&&event.button!==1)return;
     const link=event.target.closest?.('a[data-link-target]');
     if(link?.protocol==='https:')sendLinkClick(endpoint,pagePath,link.dataset.linkTarget);
   };
   document.addEventListener('click',trackLink);document.addEventListener('auxclick',trackLink);
   loadPublicData(endpoint).then(data=>{
     const path=pagePath==='/'?'index.html':pagePath.slice(1)+'index.html';
     const html=renderPages(data.makers,data.experiences,data.events,{apps_script_url:endpoint}).get(path);
     if(!html)throw new Error('page missing');
     const updated=new DOMParser().parseFromString(html,'text/html');
     document.querySelector('main').replaceWith(updated.querySelector('main'));
     document.title=updated.title;activateFilters();
     const target=location.hash&&document.getElementById(location.hash.slice(1));if(target)target.scrollIntoView();
   }).catch(()=>{
     const notice=document.createElement('p');notice.className='wrap note';notice.role='status';notice.textContent='最新情報を取得できませんでした。再読み込みしてください。';const main=document.querySelector('main'),hero=main.querySelector('.hero');if(hero)hero.after(notice);else main.prepend(notice);
   });
 }
}
