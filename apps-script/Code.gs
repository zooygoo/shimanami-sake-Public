/* Script Properties: SPREADSHEET_ID, OWNER_EMAIL. Password material is initialized on the owner's first setup. */
function definition_(kind) {
  var definitions = {
    makers:{name:'造り手',fields:['id','order','name','kind','area','sub','description','body','logo','photos','postal','address','tel','website','sns','hours','lat','lng']},
    experiences:{name:'体験',fields:['id','category','title','description','photo','price','duration','schedule','place','maker_id','booking_url','booking_label','sample']},
    events:{name:'イベント',fields:['id','title','description','start_date','end_date','time_text','url','sample']}
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
  if(JSON.stringify(values[0])!==JSON.stringify(def.fields))throw new Error('保存先の列が一致しません。');
  return values.slice(1).filter(function(row){return row[0];}).map(function(row){var record={};def.fields.forEach(function(key,i){var value=row[i];record[key]=['photos','sns'].indexOf(key)>=0?JSON.parse(value||'[]'):key==='sample'?String(value).toLowerCase()==='true':key==='order'?Number(value):['lat','lng'].indexOf(key)>=0?(value===''?null:Number(value)):value;});return record;});
}
function publicData_(){var data={};['makers','experiences','events'].forEach(function(kind){data[kind]=readCollection_(kind).map(function(record){return validate_(kind,record);});});return data;}
function validate_(kind,input){
  var def=definition_(kind);
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(function(k){return def.fields.indexOf(k)<0;})||def.fields.some(function(k){return !Object.prototype.hasOwnProperty.call(input,k);}))throw new Error('入力項目が正しくありません。');
  if(!/^[a-z][a-z0-9-]{0,79}$/.test(input.id))throw new Error('IDは半角英数字とハイフンで入力してください。');
  def.fields.forEach(function(k){var value=input[k];if(['photos','sns'].indexOf(k)>=0){if(!Array.isArray(value))throw new Error('配列の項目が正しくありません。');}else if(k==='sample'){if(typeof value!=='boolean')throw new Error('表示例の指定が正しくありません。');}else if(k==='order'){if(!Number.isSafeInteger(value)||value<1)throw new Error('表示順を確認してください。');}else if(k==='lat'||k==='lng'){if(value!==null&&(typeof value!=='number'||!isFinite(value)))throw new Error('座標を確認してください。');}else if(typeof value!=='string'||value.length>10000)throw new Error('文字数または入力形式を確認してください。');});
  if(!(kind==='makers'?input.name:input.title).trim())throw new Error('名前またはタイトルを入力してください。');
  if(kind==='makers'&&['日本酒','ビール','ワイン','リキュール'].indexOf(input.kind)<0)throw new Error('種類を確認してください。');
  if(kind==='experiences'&&['見学','ペアリング','ガイド','診断','周遊'].indexOf(input.category)<0)throw new Error('種類を確認してください。');
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
    if(request.collection==='makers'){
      if(index<0)throw new Error('登録済みの造り手を選んでください。');
      ['logo','photos','lat','lng'].forEach(function(k){if(JSON.stringify(record[k])!==JSON.stringify(records[index][k]))throw new Error('写真と座標はこの画面では変更できません。');});
    }
    if(request.collection==='experiences'&&record.maker_id&&!readCollection_('makers').some(function(x){return x.id===record.maker_id;}))throw new Error('関連する造り手を確認してください。');
    var sheet=database_().getSheetByName(def.name),row=index<0?sheet.getLastRow()+1:index+2;
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
      var attempts=Number(cache.get('login-failures')||0);
      if(attempts>=8)throw new Error('しばらく待ってからログインしてください。');
      var expected=props.getProperty('PASSWORD_HASH');
      if(!expected||typeof request.verifier!=='string'||!equal_(hash_(request.verifier),expected)){
        cache.put('login-failures',String(attempts+1),900);throw new Error('パスワードが正しくありません。');
      }
      cache.remove('login-failures');var token=uuid_();cache.put('session:'+digest_(token),'1',3600);return {ok:true,token:token};
    }
    session_(request.token);
    if(request.action==='logout'){cache.remove('session:'+digest_(request.token));return {ok:true};}
    if(request.action==='load')return {ok:true,data:publicData_(),revision:Number(props.getProperty('REVISION')||0)};
    if(request.action==='save')return save_(request);
    if(request.action==='stats')return statistics_();
    throw new Error('操作が正しくありません。');
  }catch(error){return {ok:false,error:error.message};}
}
function recordView_(event){
  try{
    if(!event||event.action!=='view'||typeof event.event_id!=='string'||!/^[0-9a-f-]{36}$/.test(event.event_id))throw new Error('記録形式が正しくありません。');
    var pages=['/'].concat(readCollection_('makers').map(function(x){return '/makers/'+x.id+'/';}));
    if(pages.indexOf(event.page)<0)throw new Error('対象ページが正しくありません。');
    var lock=LockService.getScriptLock();lock.waitLock(10000);
    try{
      var cache=CacheService.getScriptCache(),key='view:'+event.event_id;
      if(cache.get(key))return {ok:true};
      var sheet=database_().getSheetByName('閲覧記録');
      if(!sheet)throw new Error('閲覧記録シートがありません。');
      var now=new Date();sheet.getRange(sheet.getLastRow()+1,1,1,4).setValues([[Utilities.formatDate(now,'Asia/Tokyo','yyyy-MM-dd HH:mm:ss'),Utilities.formatDate(now,'Asia/Tokyo','yyyy-MM-dd'),event.page,event.event_id]]);
      cache.put(key,'1',3600);return {ok:true};
    }finally{lock.releaseLock();}
  }catch(error){return {ok:false,error:error.message};}
}
function statistics_(){
  var sheet=database_().getSheetByName('閲覧記録'),rows=sheet&&sheet.getLastRow()>1?sheet.getRange(2,1,sheet.getLastRow()-1,4).getDisplayValues():[];
  var today=Utilities.formatDate(new Date(),'Asia/Tokyo','yyyy-MM-dd'),from7=Utilities.formatDate(new Date(Date.now()-6*86400000),'Asia/Tokyo','yyyy-MM-dd'),from30=Utilities.formatDate(new Date(Date.now()-29*86400000),'Asia/Tokyo','yyyy-MM-dd'),byPage={},counts={today:0,week:0,month:0,total:rows.length};
  rows.forEach(function(row){if(row[1]===today)counts.today++;if(row[1]>=from7&&row[1]<=today)counts.week++;if(row[1]>=from30&&row[1]<=today)counts.month++;byPage[row[2]]=(byPage[row[2]]||0)+1;});return {ok:true,counts:counts,pages:byPage};
}
function doPost(event){var result;try{configure_();if(!event.postData||event.postData.contents.length>2048)throw new Error('Request size');result=recordView_(JSON.parse(event.postData.contents));}catch(error){result={ok:false,error:'リクエストが正しくありません。'};}return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);}
function doGet(event){
  configure_();
  var params=event&&event.parameter||{};
  if(params.action==='public'){
    if(!/^__sakeData_[a-z0-9]+$/.test(params.callback||''))return ContentService.createTextOutput('{}').setMimeType(ContentService.MimeType.JSON);
    return ContentService.createTextOutput(params.callback+'('+JSON.stringify(publicData_()).replace(/</g,'\\u003c')+');').setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  var props=properties_();
  if(!props.getProperty('PASSWORD_SALT'))props.setProperty('PASSWORD_SALT',uuid_());
  var owner=props.getProperty('OWNER_EMAIL'),active=Session.getActiveUser().getEmail();
  var bootstrap={connected:!!props.getProperty('SPREADSHEET_ID'),salt:props.getProperty('PASSWORD_SALT'),needsSetup:!props.getProperty('PASSWORD_HASH'),canSetup:!!owner&&!!active&&owner.toLowerCase()===active.toLowerCase()};
  var html=HtmlService.createHtmlOutputFromFile('Admin').getContent().replace('__BOOTSTRAP_JSON__',JSON.stringify(bootstrap).replace(/</g,'\\u003c'));
  return HtmlService.createHtmlOutput(html).setTitle('SHIMANAMIの酒 管理画面');
}
