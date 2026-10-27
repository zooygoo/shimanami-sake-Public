// Only the server reads GITHUB_IMAGE_TOKEN. Images never write to the source branch.
function photoPath_(path){return typeof path==='string'&&/^uploads\/(experiences|events)\/[a-f0-9]{64}\.jpg$/.test(path);}
function photoRequest_(route,method,payload){
  var token=properties_().getProperty('GITHUB_IMAGE_TOKEN');
  if(!token)throw new Error('写真の保存先がまだ接続されていません。');
  var options={method:method||'get',muteHttpExceptions:true,headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}};
  if(payload){options.contentType='application/json';options.payload=JSON.stringify(payload);}
  var response=UrlFetchApp.fetch('https://api.github.com/repos/zooygoo/shimanami-sake-Public/'+route,options),status=response.getResponseCode();
  if(status!==404&&(status<200||status>=300))throw new Error('写真の保存先に接続できません。権限と利用上限を確認してください。');
  return {status:status,body:JSON.parse(response.getContentText()||'{}')};
}
function photoContent_(path){
  if(!photoPath_(path))throw new Error('写真の指定が正しくありません。');
  var result=photoRequest_('contents/'+path+'?ref=site-images');
  if(result.status===404)throw new Error('写真が見つかりません。');
  var base64=String(result.body.content||'').replace(/\s/g,'');
  photoBytes_(base64);
  return base64;
}
function photoBytes_(base64){
  if(typeof base64!=='string'||!base64||base64.length>341336||base64.length%4||!/^[A-Za-z0-9+/]+={0,2}$/.test(base64))throw new Error('写真は256KB以下のJPEGで送信してください。');
  var bytes=Utilities.base64Decode(base64),n=bytes.length;
  if(n>256000||n<8||(bytes[0]&255)!==255||(bytes[1]&255)!==216||(bytes[2]&255)!==255||(bytes[n-2]&255)!==255||(bytes[n-1]&255)!==217||Utilities.base64Encode(bytes)!==base64)throw new Error('写真の形式が正しくありません。');
  return bytes;
}
function uploadPhoto_(request){
  session_(request.token);
  if(['experiences','events'].indexOf(request.collection)<0)throw new Error('写真を登録する項目を確認してください。');
  var bytes=photoBytes_(request.base64),hash=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,bytes).map(function(x){return ('0'+((x+256)%256).toString(16)).slice(-2);}).join('');
  var path='uploads/'+request.collection+'/'+hash+'.jpg',lock=LockService.getScriptLock();lock.waitLock(10000);
  try{
    var branch=photoRequest_('git/ref/heads/site-images');
    if(branch.status===404){
      var base=photoRequest_('git/ref/heads/main');
      if(base.status===404)throw new Error('写真の保存先を確認してください。');
      var created=photoRequest_('git/refs','post',{ref:'refs/heads/site-images',sha:base.body.object.sha});
      if(created.status===404)throw new Error('写真の保存先を作成できませんでした。');
    }
    var existing=photoRequest_('contents/'+path+'?ref=site-images');
    if(existing.status===404){
      var saved=photoRequest_('contents/'+path,'put',{message:'写真を登録',content:request.base64,branch:'site-images'});
      if(saved.status===404)throw new Error('写真を保存できませんでした。');
    }else if(String(existing.body.content||'').replace(/\s/g,'')!==request.base64)throw new Error('保存先の写真が一致しません。');
    return {ok:true,path:path};
  }finally{lock.releaseLock();}
}
