// Photos are kept in a hidden sheet of the same spreadsheet, so no external credential is needed.
function photoPath_(path){return typeof path==='string'&&/^uploads\/(makers|experiences|events)\/[a-f0-9]{64}\.jpg$/.test(path);}
function photoSheet_(create){
  var db=database_();
  try{
    var sheet=db.getSheetByName('写真データ');
    if(!sheet&&create){sheet=db.insertSheet('写真データ');sheet.hideSheet();}
    return sheet;
  }catch(error){throw new Error('写真の保存先で問題が発生しました。しばらく待ってから保存し直してください。');}
}
// One row per photo: the path, then the base64 text split below the 50,000-character cell limit.
function photoRead_(sheet,path){
  try{
    var last=sheet?sheet.getLastRow():0;
    if(!last)return '';
    var index=sheet.getRange(1,1,last,1).getDisplayValues().findIndex(function(row){return row[0]===path;});
    return index<0?'':sheet.getRange(index+1,2,1,7).getDisplayValues()[0].join('');
  }catch(error){throw new Error('写真の保存先で問題が発生しました。しばらく待ってから保存し直してください。');}
}
function photoContent_(path){
  if(!photoPath_(path))throw new Error('写真の指定が正しくありません。');
  var base64=photoRead_(photoSheet_(false),path);
  if(!base64)throw new Error('写真が見つかりません。');
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
  if(['makers','experiences','events'].indexOf(request.collection)<0)throw new Error('写真を登録する項目を確認してください。');
  var bytes=photoBytes_(request.base64),hash=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,bytes).map(function(x){return ('0'+((x+256)%256).toString(16)).slice(-2);}).join('');
  var path='uploads/'+request.collection+'/'+hash+'.jpg',lock=LockService.getScriptLock();lock.waitLock(10000);
  try{
    var sheet=photoSheet_(true),existing=photoRead_(sheet,path);
    if(!existing){
      var cells=[path];
      for(var i=0;i<7;i++)cells.push(request.base64.slice(i*49000,(i+1)*49000));
      // Rich text writes keep every piece as text, never as a spreadsheet formula.
      try{sheet.getRange(sheet.getLastRow()+1,1,1,8).setRichTextValues([cells.map(function(text){return SpreadsheetApp.newRichTextValue().setText(text).build();})]);}
      catch(error){throw new Error('写真の保存先で問題が発生しました。しばらく待ってから保存し直してください。');}
    }else if(existing!==request.base64)throw new Error('保存先の写真が一致しません。');
    return {ok:true,path:path};
  }finally{lock.releaseLock();}
}
