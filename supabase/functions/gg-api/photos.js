const PHOTO_BUCKET='gg-teacher-photos';
const PHOTO_EVENT='halloween-2026';
const PHOTO_END='2026-10-31';
const photoFail=(status,message)=>{throw Object.assign(new Error(message),{status});};

// Keep JPEG image segments, remove ALL application/comment metadata (EXIF/GPS included).
function cleanPhotoJPEG(base64) {
  if(typeof base64!=='string'||base64.length>2796204||!/^\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(base64))photoFail(400,'JPEG写真を選び直してください');
  let a;try{a=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));}catch{photoFail(400,'写真を読み込めません');}
  if(a.length>2097152||a[0]!==255||a[1]!==216)photoFail(413,'写真は2MB以内にしてください');
  const chunks=[a.subarray(0,2)];let p=2,frame=false,scan=false,ended=false;
  while(p<a.length){
    const start=p;
    if(a[p++]!==255)photoFail(400,'JPEG形式を確認してください');
    while(a[p]===255)p++;
    const marker=a[p++];
    if(marker===217){chunks.push(a.subarray(start,p));ended=true;break;}
    if(marker===0||marker===216||marker===undefined)photoFail(400,'JPEG形式を確認してください');
    const len=(a[p]<<8)|a[p+1];
    if(len<2||p+len>a.length)photoFail(400,'写真が途中で切れています');
    if([192,193,194].includes(marker)){
      const height=(a[p+3]<<8)|a[p+4],width=(a[p+5]<<8)|a[p+6];
      if(!width||!height||width>4096||height>4096)photoFail(400,'写真のサイズを小さくしてください');
      frame=true;
    }
    p+=len;
    if(!(marker>=224&&marker<=239)&&marker!==254)chunks.push(a.subarray(start,p));
    if(marker===218){
      scan=true;const begin=p;
      while(p<a.length){
        if(a[p]===255&&a[p+1]!==0&&!(a[p+1]>=208&&a[p+1]<=215))break;
        p+=a[p]===255?2:1;
      }
      chunks.push(a.subarray(begin,p));
    }
  }
  if(!frame||!scan||!ended)photoFail(400,'写真を読み込めません');
  const out=new Uint8Array(chunks.reduce((n,c)=>n+c.length,0));let offset=0;
  for(const c of chunks){out.set(c,offset);offset+=c.length;}return out;
}
async function photoStorage(path,method,body) {
  const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const response=await fetch(Deno.env.get('SUPABASE_URL')+'/storage/v1/'+path,{
    method,headers:{Authorization:'Bearer '+key,apikey:key,'Content-Type':body instanceof Uint8Array?'image/jpeg':'application/json','x-upsert':'true'},
    body:body===undefined?undefined:body instanceof Uint8Array?body:JSON.stringify(body)
  });
  if(!response.ok)photoFail(503,'写真の保存先に接続できません。再試行してください');
  return response;
}
async function photoAction(b,session,row,{db,limit,todayStr}) {
  const admin=session.role==='admin',studentId=session.student_id;
  if(!admin&&!row.data?.students.some(s=>s.id===studentId))photoFail(401,'生徒の登録を確認してください');
  const query='gg_photo_submissions?event=eq.'+PHOTO_EVENT;
  const list=async()=>{
    const items=await db(query+(admin?'':'&student_id=eq.'+encodeURIComponent(studentId)+'&status=in.(submitted,reviewed)')+'&order=created_at.desc&limit=1000');
    return {items:items.map(({object_path,...p})=>({...p,...(admin?{studentName:row.data.students.find(s=>s.id===p.student_id)?.name||'削除済みの生徒'}:{})})),deadline:PHOTO_END,open:todayStr()<=PHOTO_END,today:todayStr(),todayCompleted:!admin&&row.data.draws.some(d=>d.studentId===studentId&&d.photoRewardDay===todayStr())};
  };
  const complete=async()=>{
    if(!await db('rpc/gg_complete_photo','POST',{photo_id:b.id,owner_id:studentId}))photoFail(409,'写真が削除されました。先生に確認してください');
    row=(await db('gg_state?id=eq.1'))[0];
    return list();
  };
  if(b.action==='photo_list')return list();
  if(b.action==='photo_upload'){
    if(admin)photoFail(403,'生徒用画面から提出してください');
    if(todayStr()>PHOTO_END)photoFail(400,'写真ミッションの受付は終了しました');
    if(typeof b.teacherName!=='string'||!b.teacherName.trim()||b.teacherName.length>80)photoFail(400,'先生の名前を入力してください（80文字以内）');
    if(!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(b.id||''))photoFail(400,'送信IDを確認してください');
    await limit('photo:'+studentId);
    const existing=(await db('gg_photo_submissions?id=eq.'+b.id))[0];
    if(existing&&(existing.student_id!==studentId||existing.event!==PHOTO_EVENT||existing.status==='deleting'))photoFail(403,'この写真は操作できません');
    if(existing&&existing.status!=='uploading')return complete();
    const bytes=cleanPhotoJPEG(b.image);
    if(!existing){
      // Reserve the unique upload ID; there is no per-student photo count limit.
      if(!await db('rpc/gg_reserve_photo','POST',{photo_id:b.id,owner_id:studentId,teacher:b.teacherName.trim()}))photoFail(409,'この送信IDは利用できません。写真を選び直してください');
    }
    const path=PHOTO_EVENT+'/'+b.id+'.jpg';
    await photoStorage('object/'+PHOTO_BUCKET+'/'+path,'POST',bytes);
    return complete();
  }
  if(!admin)photoFail(403,'写真の閲覧・管理は管理者のみできます');
  if(!/^[0-9a-f-]{36}$/.test(b.id||''))photoFail(400,'写真を選んでください');
  const photo=(await db(query+'&id=eq.'+b.id))[0];
  if(!photo){if(b.action==='photo_delete')return list();photoFail(404,'写真が見つかりません');}
  if(b.action==='photo_read'){
    if(!['submitted','reviewed'].includes(photo.status))photoFail(409,'写真の処理中です');
    const r=await photoStorage('object/authenticated/'+PHOTO_BUCKET+'/'+photo.object_path,'GET');
    const a=new Uint8Array(await r.arrayBuffer());let text='';
    for(let i=0;i<a.length;i+=8192)text+=String.fromCharCode(...a.subarray(i,i+8192));
    return {image:'data:image/jpeg;base64,'+btoa(text)};
  }
  if(b.action==='photo_review'){
    await db(query+'&id=eq.'+b.id+'&status=in.(submitted,reviewed)','PATCH',{status:'reviewed'});return list();
  }
  if(b.action==='photo_delete'){
    await db(query+'&id=eq.'+b.id,'PATCH',{status:'deleting'});
    await photoStorage('object/'+PHOTO_BUCKET,'DELETE',{prefixes:[photo.object_path]});
    await db(query+'&id=eq.'+b.id,'DELETE');return list();
  }
  photoFail(400,'写真の操作が不明です');
}
export {photoAction,cleanPhotoJPEG};
