/* Script Properties: SPREADSHEET_ID, OWNER_EMAIL. Password material is initialized on the owner's first setup. */
function definition_(kind) {
  var definitions = {
    makers:{name:'造り手',fields:['id','order','name','kind','area','sub','description','body','logo','photos','postal','address','tel','website','sns','hours','lat','lng']},
    experiences:{name:'体験',fields:['id','category','title','description','photo','price','duration','schedule','place','maker_id','booking_url','booking_label','sample']},
    events:{name:'イベント',fields:['id','title','description','start_date','end_date','time_text','url','sample','photo']}
  };
  if (!Object.prototype.hasOwnProperty.call(definitions,kind)) throw new Error('項目が正しくありません。');
  return definitions[kind];
}
function properties_(){return PropertiesService.getScriptProperties();}
function configure_(){var props=properties_();if(!props.getProperty('SPREADSHEET_ID')||!props.getProperty('OWNER_EMAIL')){var defaults=connectionDefaults_();if(!props.getProperty('SPREADSHEET_ID'))props.setProperty('SPREADSHEET_ID',defaults.spreadsheetId);if(!props.getProperty('OWNER_EMAIL'))props.setProperty('OWNER_EMAIL',defaults.ownerEmail);}return props;}
function database_(){var id=properties_().getProperty('SPREADSHEET_ID');if(!id)throw new Error('保存先が接続されていません。');return SpreadsheetApp.openById(id);}
function uuid_(){return Utilities.getUuid()+Utilities.getUuid();}
function digest_(text){return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,text,Utilities.Charset.UTF_8));}
function equal_(a,b){var difference=a.length^b.length;for(var i=0;i<Math.max(a.length,b.length);i++)difference|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return difference===0;}
function hash_(verifier){return Utilities.base64Encode(Utilities.computeHmacSha256Signature(verifier,properties_().getProperty('PASSWORD_PEPPER'),Utilities.Charset.UTF_8));}
function session_(token){if(typeof token!=='string'||!token||!CacheService.getScriptCache().get('session:'+digest_(token)))throw new Error('ログインし直してください。');}
function readCollection_(kind){
  var def=definition_(kind),sheet=database_().getSheetByName(def.name);
  if(!sheet)throw new Error('保存先のシートが見つかりません。');
  if(sheet.getLastRow()<2)return [];
  var values=sheet.getRange(1,1,sheet.getLastRow(),def.fields.length).getDisplayValues();
  var expected=def.fields.slice();if(kind==='events'&&values[0][8]==='')expected[8]='';
  if(JSON.stringify(values[0])!==JSON.stringify(expected))throw new Error('保存先の列が一致しません。');
  return values.slice(1).filter(function(row){return row[0];}).map(function(row){var record={};def.fields.forEach(function(key,i){var value=row[i];record[key]=['photos','sns'].indexOf(key)>=0?JSON.parse(value||'[]'):key==='sample'?String(value).toLowerCase()==='true':key==='order'?Number(value):['lat','lng'].indexOf(key)>=0?(value===''?null:Number(value)):value;});return record;});
}
function publicData_(withImages){var data={};['makers','experiences','events'].forEach(function(kind){data[kind]=readCollection_(kind).map(function(record){validate_(kind,record);if(withImages&&photoPath_(record.photo)){try{record.photo='data:image/jpeg;base64,'+photoContent_(record.photo);}catch(error){record.photo='';}}return record;});});return data;}
function validate_(kind,input){
  var def=definition_(kind);
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(function(k){return def.fields.indexOf(k)<0;})||def.fields.some(function(k){return !Object.prototype.hasOwnProperty.call(input,k);}))throw new Error('入力項目が正しくありません。');
  if(!/^[a-z][a-z0-9-]{0,79}$/.test(input.id))throw new Error('IDは半角英数字とハイフンで入力してください。');
  def.fields.forEach(function(k){var value=input[k];if(['photos','sns'].indexOf(k)>=0){if(!Array.isArray(value))throw new Error('配列の項目が正しくありません。');}else if(k==='sample'){if(typeof value!=='boolean')throw new Error('表示例の指定が正しくありません。');}else if(k==='order'){if(!Number.isSafeInteger(value)||value<1)throw new Error('表示順を確認してください。');}else if(k==='lat'||k==='lng'){if(value!==null&&(typeof value!=='number'||!isFinite(value)))throw new Error('座標を確認してください。');}else if(typeof value!=='string'||value.length>10000)throw new Error('文字数または入力形式を確認してください。');});
  if(!(kind==='makers'?input.name:input.title).trim())throw new Error('名前またはタイトルを入力してください。');
  if(kind==='makers'&&['日本酒','ビール','ワイン','リキュール'].indexOf(input.kind)<0)throw new Error('種類を確認してください。');
  if(kind==='experiences'&&['見学','ペアリング','ガイド','診断','周遊'].indexOf(input.category)<0)throw new Error('種類を確認してください。');
  if(input.photo&&!/^(?:photos|makers)\/[a-zA-Z0-9_-]+\.(?:jpg|jpeg|png|webp)$/.test(input.photo)&&!(photoPath_(input.photo)&&input.photo.indexOf('uploads/'+kind+'/')===0))throw new Error('写真の指定が正しくありません。');
  if(kind==='events'){
    [input.start_date,input.end_date].forEach(function(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||isNaN(Date.parse(value))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)throw new Error('日付を確認してください。');});
    if(input.end_date<input.start_date)throw new Error('終了日は開始日以降にしてください。');
  }
  ['website','booking_url','url'].forEach(function(k){if(input[k]&&!/^https:\/\/[^\s<>"']+$/.test(input[k])&&!(input.sample&&/^#(?:experience|events)$/.test(input[k])))throw new Error('リンクはhttpsのURLを入力してください。');});
  if(input.sns)input.sns.forEach(function(x){if(!x||typeof x.name!=='string'||typeof x.url!=='string'||!/^https:\/\/[^\s<>"']+$/.test(x.url))throw new Error('SNSの名前とURLを確認してください。');});
  return input;
}
function save_(request){
  session_(request.token);
  var lock=LockService.getScriptLock();lock.waitLock(10000);
  try{
    var revision=Number(properties_().getProperty('REVISION')||0);
    if(request.revision!==revision)throw new Error('別の画面で更新されました。再読み込みしてから編集してください。');
    var record=validate_(request.collection,request.record),def=definition_(request.collection),records=readCollection_(request.collection),index=records.findIndex(function(x){return x.id===record.id;});
    if(request.create===true&&index>=0)throw new Error('このIDはすでに使われています。別のIDを入力してください。');
    if(request.collection==='makers'){
      if(index<0)throw new Error('登録済みの造り手を選んでください。');
      ['logo','photos','lat','lng'].forEach(function(k){if(JSON.stringify(record[k])!==JSON.stringify(records[index][k]))throw new Error('写真と座標はこの画面では変更できません。');});
    }
    if(request.collection==='experiences'&&record.maker_id&&!readCollection_('makers').some(function(x){return x.id===record.maker_id;}))throw new Error('関連する造り手を確認してください。');
    var sheet=database_().getSheetByName(def.name),lastRow=sheet.getLastRow();
    var row=index<0?lastRow+1:sheet.getRange(2,1,lastRow-1,1).getDisplayValues().findIndex(function(value){return value[0]===record.id;})+2;
    if(photoPath_(record.photo)&&(index<0||records[index].photo!==record.photo))photoContent_(record.photo);
    if(request.collection==='events'&&sheet.getRange(1,9).getDisplayValues()[0][0]==='')sheet.getRange(1,9).setRichTextValues([[SpreadsheetApp.newRichTextValue().setText('photo').build()]]);
    // Rich text writes preserve strings beginning with '=' as text, never as a spreadsheet formula.
    sheet.getRange(row,1,1,def.fields.length).setRichTextValues([def.fields.map(function(k){var value=record[k];return SpreadsheetApp.newRichTextValue().setText(value===null?'':typeof value==='object'?JSON.stringify(value):String(value)).build();})]);
    properties_().setProperty('REVISION',String(revision+1));
    return {ok:true,revision:revision+1};
  }finally{lock.releaseLock();}
}
function rpc(request){
  try{
    if(!request||typeof request!=='object')throw new Error('リクエストが正しくありません。');
    var props=properties_(),cache=CacheService.getScriptCache();
    if(request.action==='setup'){
      var setupLock=LockService.getScriptLock();setupLock.waitLock(10000);
      try{
        if(props.getProperty('PASSWORD_HASH'))throw new Error('初期設定は完了しています。');
        var owner=props.getProperty('OWNER_EMAIL'),active=Session.getActiveUser().getEmail();
        if(!owner||!active||active.toLowerCase()!==owner.toLowerCase())throw new Error('所有者のGoogleアカウントで初期設定してください。');
        if(!/^[0-9a-f]{64}$/.test(request.verifier||''))throw new Error('パスワードの形式を確認してください。');
        if(!props.getProperty('PASSWORD_PEPPER'))props.setProperty('PASSWORD_PEPPER',uuid_());
        props.setProperty('PASSWORD_HASH',hash_(request.verifier));return {ok:true};
      }finally{setupLock.releaseLock();}
    }
    if(request.action==='login'){
      var loginLock=LockService.getScriptLock();loginLock.waitLock(10000);
      try{
        var attempts=Number(cache.get('login-failures')||0);
        if(attempts>=8)throw new Error('しばらく待ってからログインしてください。');
        var expected=props.getProperty('PASSWORD_HASH');
        if(!expected||typeof request.verifier!=='string'||!equal_(hash_(request.verifier),expected)){
          cache.put('login-failures',String(attempts+1),900);throw new Error('パスワードが正しくありません。');
        }
        cache.remove('login-failures');var token=uuid_();cache.put('session:'+digest_(token),'1',3600);return {ok:true,token:token};
      }finally{loginLock.releaseLock();}
    }
    if(request.action==='logout'){
      if(typeof request.token!=='string'||!request.token)throw new Error('ログインし直してください。');
      cache.remove('session:'+digest_(request.token));return {ok:true};
    }
    session_(request.token);
    if(request.action==='load')return {ok:true,data:publicData_(),revision:Number(props.getProperty('REVISION')||0)};
    if(request.action==='save')return save_(request);
    if(request.action==='upload')return uploadPhoto_(request);
    if(request.action==='photo')return {ok:true,base64:photoContent_(request.path)};
    if(request.action==='stats')return statistics_(request);
    throw new Error('操作が正しくありません。');
  }catch(error){return {ok:false,error:error.message};}
}
function recordView_(event){
  try{
    if(!event||['view','click'].indexOf(event.action)<0||typeof event.event_id!=='string'||!/^[0-9a-f-]{36}$/.test(event.event_id))throw new Error('記録形式が正しくありません。');
    var pages=['/'].concat(readCollection_('makers').map(function(x){return '/makers/'+x.id+'/';}));
    if(pages.indexOf(event.page)<0)throw new Error('対象ページが正しくありません。');
    if(event.action==='click'&&externalTargets_().indexOf(event.target)<0)throw new Error('対象リンクが正しくありません。');
    var lock=LockService.getScriptLock();lock.waitLock(10000);
    try{
      var cache=CacheService.getScriptCache(),key='view:'+event.event_id;
      if(cache.get(key))return {ok:true};
      var sheet=database_().getSheetByName('閲覧記録');
      if(!sheet)throw new Error('閲覧記録シートがありません。');
      // Cache entries can expire early; the stored event ID is the durable duplicate guard.
      var last=sheet.getLastRow();
      if(last>1&&sheet.getRange(2,4,last-1,1).getDisplayValues().some(function(row){return row[0]===event.event_id;}))return {ok:true};
      var headers=sheet.getRange(1,1,1,6).getDisplayValues()[0];
      if(JSON.stringify(headers.slice(0,4))!==JSON.stringify(['received_at_jst','date_jst','page','event_id'])||headers[4]&&headers[4]!=='action'||headers[5]&&headers[5]!=='target')throw new Error('閲覧記録の列を確認してください。');
      if(!headers[4]||!headers[5])sheet.getRange(1,5,1,2).setValues([['action','target']]);
      var now=new Date();sheet.getRange(last+1,1,1,6).setValues([[Utilities.formatDate(now,'Asia/Tokyo','yyyy-MM-dd HH:mm:ss'),Utilities.formatDate(now,'Asia/Tokyo','yyyy-MM-dd'),event.page,event.event_id,event.action,event.action==='click'?event.target:'']]);
      cache.put(key,'1',3600);return {ok:true};
    }finally{lock.releaseLock();}
  }catch(error){return {ok:false,error:error.message};}
}
function externalTargets_(){
  var targets=[],https=function(url){return typeof url==='string'&&/^https:\/\//.test(url);};
  readCollection_('makers').forEach(function(m){if(m.address)targets.push('maker:'+m.id+':directions');if(https(m.website))targets.push('maker:'+m.id+':website');m.sns.forEach(function(x,i){if(https(x.url))targets.push('maker:'+m.id+':sns:'+i);});});
  readCollection_('experiences').forEach(function(x){if(https(x.booking_url))targets.push('experience:'+x.id);});
  readCollection_('events').forEach(function(x){if(https(x.url))targets.push('event:'+x.id);});return targets;
}
function statisticsDate_(value){
  var text=String(value),match=/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/.exec(text);
  if(!match)return '';
  var day=match[1]+'-'+('0'+match[2]).slice(-2)+'-'+('0'+match[3]).slice(-2),date=new Date(day+'T00:00:00Z');
  return !isNaN(date.getTime())&&date.toISOString().slice(0,10)===day?day:'';
}
function statisticsCell_(value,timestamp){
  if(Object.prototype.toString.call(value)==='[object Date]')return isNaN(value.getTime())?'':Utilities.formatDate(value,'Asia/Tokyo',timestamp?'yyyy-MM-dd HH:mm:ss':'yyyy-MM-dd');
  if(typeof value==='number'){
    // Sheets serials are local wall time. Round once to seconds before extracting boundaries.
    var local=new Date(Date.UTC(1899,11,30)+Math.round(value*86400)*1000);
    if(isNaN(local.getTime()))return '';
    return local.toISOString().slice(0,timestamp?19:10).replace('T',' ');
  }
  return String(value||'').trim();
}
function statisticsTime_(value,end){
  if(typeof value!=='string'||!/^\d{2}:\d{2}$/.test(value))throw new Error('時刻は00:00〜24:00で入力してください。');
  var parts=value.split(':'),hour=Number(parts[0]),minute=Number(parts[1]);
  if(minute>59||hour>23&&!(end&&hour===24&&minute===0))throw new Error('時刻は00:00〜24:00で入力してください。');
  return hour*3600+minute*60;
}
function statistics_(request){
  request=request||{};
  var startDate=request.startDate===undefined?'':request.startDate,endDate=request.endDate===undefined?'':request.endDate,startTime=request.startTime===undefined?'00:00':request.startTime,endTime=request.endTime===undefined?'24:00':request.endTime;
  [startDate,endDate].forEach(function(day){if(typeof day!=='string'||day&&(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!statisticsDate_(day)))throw new Error('日付を正しく入力してください。');});
  if(startDate&&endDate&&startDate>endDate)throw new Error('終了日は開始日以降にしてください。');
  var startSeconds=statisticsTime_(startTime,false),endSeconds=statisticsTime_(endTime,true);
  if(startSeconds>=endSeconds)throw new Error('終了時刻は開始時刻より後にしてください。');
  var sheet=database_().getSheetByName('閲覧記録');if(!sheet)throw new Error('閲覧記録シートがありません。');
  var headers=sheet.getRange(1,1,1,6).getDisplayValues()[0],clicksMeasured=headers[4]==='action'&&headers[5]==='target';
  var rows=sheet.getLastRow()>1?sheet.getRange(2,1,sheet.getLastRow()-1,6).getValues():[];
  var now=new Date(),today=Utilities.formatDate(now,'Asia/Tokyo','yyyy-MM-dd'),from7=Utilities.formatDate(new Date(Date.now()-6*86400000),'Asia/Tokyo','yyyy-MM-dd'),fromMonth=today.slice(0,7)+'-01',byPage=Object.create(null),byLink=Object.create(null),counts={today:0,week:0,month:0,total:0},clicks={today:0,month:0,total:0};
  var pages=Object.create(null),links=Object.create(null),daily=Object.create(null),hourly=Array.apply(null,Array(24)).map(function(_,hour){return [('0'+hour).slice(-2)+':00',0];}),totals={views:0,makers:0,experiences:clicksMeasured?0:null,events:clicksMeasured?0:null},earliest=today,skipped=0;
  var allowedPages=['/'].concat(readCollection_('makers').map(function(x){return '/makers/'+x.id+'/';}));
  rows.forEach(function(row){
    var day=statisticsDate_(statisticsCell_(row[1],false)),stamp=statisticsCell_(row[0],true),time=/^(\d{4}[-\/]\d{1,2}[-\/]\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(stamp);
    if(!day||day>today||!time||statisticsDate_(time[1])!==day||Number(time[2])>23||Number(time[3])>59||Number(time[4]||0)>59||row[4]&&row[4]!=='view'&&row[4]!=='click'||allowedPages.indexOf(row[2])<0){skipped++;return;}
    var seconds=Number(time[2])*3600+Number(time[3])*60+Number(time[4]||0),instant=new Date(day+'T'+('0'+time[2]).slice(-2)+':'+time[3]+':'+(time[4]||'00')+'+09:00');
    if(instant.getTime()>now.getTime()){skipped++;return;}
    if(day<earliest)earliest=day;
    var click=row[4]==='click',group=click?clicks:counts;group.total++;
    if(day===today)group.today++;if(day>=fromMonth)group.month++;
    if(click)byLink[row[5]]=(byLink[row[5]]||0)+1;
    else{if(day>=from7)counts.week++;byPage[row[2]]=(byPage[row[2]]||0)+1;}
    if(startDate&&day<startDate||endDate&&day>endDate||seconds<startSeconds||seconds>=endSeconds)return;
    if(click){
      links[row[5]]=(links[row[5]]||0)+1;
      if(clicksMeasured&&/^experience:/.test(row[5]))totals.experiences++;
      if(clicksMeasured&&/^event:/.test(row[5]))totals.events++;
    }else{
      totals.views++;if(row[2]!=='/')totals.makers++;
      pages[row[2]]=(pages[row[2]]||0)+1;daily[day]=(daily[day]||0)+1;hourly[Math.floor(seconds/3600)][1]++;
    }
  });
  var days=Object.keys(daily).sort().map(function(day){return [day,daily[day]];});
  return {ok:true,counts:counts,pages:byPage,clicks:clicks,links:byLink,clicksMeasured:clicksMeasured,dashboard:{today:today,earliest:earliest,range:{startDate:startDate||(endDate&&endDate<earliest?endDate:earliest),endDate:endDate||(startDate&&startDate>today?startDate:today),startTime:startTime,endTime:endTime},totals:totals,pages:pages,links:links,daily:days,hourly:hourly,popularDays:days.slice().sort(function(a,b){return b[1]-a[1]||a[0].localeCompare(b[0]);}),skipped:skipped}};
}
function doPost(event){
  var result;
  try{
    configure_();
    if(!event||!event.postData||typeof event.postData.contents!=='string'||event.postData.contents.length>400000)throw new Error('Request size');
    var request=JSON.parse(event.postData.contents);
    if(!request||typeof request!=='object'||Array.isArray(request))throw new Error('Request format');
    if(Object.prototype.hasOwnProperty.call(request,'api')){
      if(request.api!=='admin-v1'||['login','logout','load','save','upload','photo','stats'].indexOf(request.action)<0)throw new Error('Admin operation');
      // Initial password setup remains restricted to the owner's Google-hosted screen.
      result=rpc(request);
    }else{
      if(event.postData.contents.length>2048)throw new Error('Request size');
      result=recordView_(request);
    }
  }catch(error){result={ok:false,error:'リクエストが正しくありません。'};}
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}
function doGet(event){
  configure_();
  var params=event&&event.parameter||{};
  if(params.action==='admin-bootstrap'){
    var settings=properties_();
    return ContentService.createTextOutput(JSON.stringify({ok:true,apiVersion:1,connected:!!settings.getProperty('SPREADSHEET_ID'),photosReady:!!settings.getProperty('GITHUB_IMAGE_TOKEN'),salt:settings.getProperty('PASSWORD_SALT')||'',needsSetup:!settings.getProperty('PASSWORD_HASH')})).setMimeType(ContentService.MimeType.JSON);
  }
  if(params.action==='public'){
    if(!/^__sakeData_[a-z0-9]+$/.test(params.callback||''))return ContentService.createTextOutput('{}').setMimeType(ContentService.MimeType.JSON);
    return ContentService.createTextOutput(params.callback+'('+JSON.stringify(publicData_(true)).replace(/</g,'\\u003c')+');').setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  var props=properties_();
  if(!props.getProperty('PASSWORD_SALT'))props.setProperty('PASSWORD_SALT',uuid_());
  var owner=props.getProperty('OWNER_EMAIL'),active=Session.getActiveUser().getEmail();
  var bootstrap={connected:!!props.getProperty('SPREADSHEET_ID'),photosReady:!!props.getProperty('GITHUB_IMAGE_TOKEN'),salt:props.getProperty('PASSWORD_SALT'),needsSetup:!props.getProperty('PASSWORD_HASH'),canSetup:!!owner&&!!active&&owner.toLowerCase()===active.toLowerCase()};
  var html=HtmlService.createHtmlOutputFromFile('Admin').getContent().replace('__BOOTSTRAP_JSON__',JSON.stringify(bootstrap).replace(/</g,'\\u003c'));
  return HtmlService.createHtmlOutput(html).setTitle('SHIMANAMIの酒 管理画面');
}
