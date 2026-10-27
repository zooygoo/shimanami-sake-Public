import {renderPages,activateFilters} from './site-render.mjs';
export function validEndpoint(url){return /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url);}
export function sendPageView(endpoint,page,services=globalThis){
  if(!validEndpoint(endpoint)||!/^\/(?:makers\/[a-z][a-z0-9-]*\/)?$/.test(page))return false;
  const payload=JSON.stringify({action:'view',page,event_id:services.crypto.randomUUID()});
  const body=new Blob([payload],{type:'text/plain;charset=UTF-8'});
  if(services.navigator?.sendBeacon?.(endpoint,body))return true;
  services.fetch(endpoint,{method:'POST',body,mode:'no-cors',credentials:'omit',keepalive:true}).catch(()=>{});
  return true;
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
   loadPublicData(endpoint).then(data=>{
     const path=pagePath==='/'?'index.html':pagePath.slice(1)+'index.html';
     const html=renderPages(data.makers,data.experiences,data.events,{apps_script_url:endpoint}).get(path);
     if(!html)throw new Error('page missing');
     const updated=new DOMParser().parseFromString(html,'text/html');
     document.querySelector('main').replaceWith(updated.querySelector('main'));
     document.title=updated.title;activateFilters();
     const target=location.hash&&document.getElementById(location.hash.slice(1));if(target)target.scrollIntoView();
   }).catch(()=>{
     const notice=document.createElement('p');notice.className='wrap note';notice.role='status';notice.textContent='最新情報を取得できませんでした。再読み込みしてください。';document.querySelector('main').prepend(notice);
   });
 }
}
