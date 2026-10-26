const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const source=fs.readFileSync(__dirname+'/../supabase/functions/gg-api/photos.js','utf8').replace(/export \{[^}]+\};/,'');
let entries=[],files=new Map(),uploadCount=0,date='2026-10-26';
const ctx=vm.createContext({Uint8Array,atob,btoa,Response,Deno:{env:{get:k=>k==='SUPABASE_URL'?'https://test':'secret'}},fetch:async(url,o)=>{
 const path=new URL(url).pathname.split('/storage/v1/')[1];
 if(o.method==='POST'){files.set(path.slice('object/gg-teacher-photos/'.length),o.body);uploadCount++;return Response.json({});}
 if(o.method==='DELETE'){for(const p of JSON.parse(o.body).prefixes)files.delete(p);return Response.json({});}
 const bytes=files.get(path.slice('object/authenticated/gg-teacher-photos/'.length));return bytes?new Response(bytes):new Response('',{status:404});
}});
vm.runInContext(source+'\nglobalThis.photo=photoAction;globalThis.clean=cleanPhotoJPEG;',ctx);
async function db(path,method='GET',body){
 if(path==='rpc/gg_reserve_photo'){
   if(entries.filter(e=>e.student_id===body.owner_id).length>=5)return false;
   entries.push({id:body.photo_id,student_id:body.owner_id,teacher_name:body.teacher,event:'halloween-2026',object_path:'halloween-2026/'+body.photo_id+'.jpg',status:'uploading',created_at:'2026-10-26T00:00:00Z'});return true;
 }
 const u=new URL('https://test/'+path),matches=e=>[...u.searchParams].every(([k,v])=>v.startsWith('eq.')?e[k]===decodeURIComponent(v.slice(3)):v.startsWith('in.')?v.slice(4,-1).split(',').includes(e[k]):true);
 const found=entries.filter(matches);
 if(method==='PATCH')found.forEach(e=>Object.assign(e,body));
 if(method==='DELETE')entries=entries.filter(e=>!matches(e));
 return structuredClone(found);
}
const deps={db,limit:async()=>{},todayStr:()=>date},row={data:{students:[{id:'s1',name:'Test A'},{id:'s2',name:'Test B'}]}};
const student={role:'student',student_id:'s1'},other={role:'student',student_id:'s2'},admin={role:'admin'};
// Valid marker structure; APP1 EXIF/GPS and comment must be removed, scan preserved.
const jpeg=Buffer.from([255,216,255,225,0,6,71,80,83,33,255,254,0,4,65,66,255,192,0,11,8,0,1,0,1,1,1,17,0,255,218,0,8,1,1,0,0,63,0,1,2,255,0,3,255,217]);
const upload={action:'photo_upload',id:'00000000-0000-4000-8000-000000000001',teacherName:'Test teacher',consent:true,image:jpeg.toString('base64')};
const call=(b,s=student)=>ctx.photo(b,s,row,deps);
async function denied(b,s,status){await assert.rejects(call(b,s),e=>e.status===status);}
(async()=>{
 const clean=Buffer.from(ctx.clean(upload.image));assert.equal(clean.includes(Buffer.from('GPS!')),false);assert.equal(clean.includes(Buffer.from('AB')),false);assert.ok(clean.includes(Buffer.from([1,2,255,0,3])));
 assert.throws(()=>ctx.clean(Buffer.from('not an image').toString('base64')));
 await denied({...upload,consent:false},student,400);await denied(upload,admin,403);
 await call(upload);assert.equal(files.size,1);assert.equal(uploadCount,1);
 await call(upload);assert.equal(uploadCount,1);assert.equal(entries.length,1);
 await denied(upload,other,403);
 assert.equal((await call({action:'photo_list'},other)).items.length,0);
 const own=await call({action:'photo_list'});assert.equal(own.items.length,1);assert.equal(own.items[0].object_path,undefined);assert.equal(own.items[0].studentName,undefined);
 const list=await call({action:'photo_list'},admin);assert.equal(list.items[0].studentName,'Test A');
 for(const action of ['photo_read','photo_review','photo_delete'])await denied({action,id:upload.id},student,403);
 assert.ok((await call({action:'photo_read',id:upload.id},admin)).image.startsWith('data:image/jpeg;base64,'));
 await call({action:'photo_review',id:upload.id},admin);assert.equal(entries[0].status,'reviewed');
 for(let i=2;i<=5;i++)await call({...upload,id:upload.id.slice(0,-1)+i});
 await denied({...upload,id:upload.id.slice(0,-1)+'6'},student,429);
 date='2026-11-01';await denied({...upload,id:upload.id.slice(0,-1)+'7'},student,400);assert.equal((await call({action:'photo_list'})).open,false);
 await call({action:'photo_delete',id:upload.id},admin);await call({action:'photo_delete',id:upload.id},admin);assert.equal(files.size,4);
 await denied({action:'photo_read',id:upload.id},admin,404);
 await denied({action:'photo_list'},{role:'student',student_id:'removed'},401);
 console.log('PASS: private photo access, ownership, metadata stripping, validation, consent, quota, idempotence, admin review/download/delete, deadline and retained archive');
})().catch(e=>{console.error(e);process.exitCode=1;});
