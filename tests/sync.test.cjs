const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const helpers=fs.readFileSync(root+'/supabase/functions/gg-api/helpers.js','utf8').replace(/export \{[^}]+\};/,'').replace(/function uid\(prefix\) \{[^}]+\}/,'');
const source=fs.readFileSync(root+'/supabase/functions/gg-api/index.js','utf8').replace(/^import[^\n]+\n/,'').replace('export async function handler','async function handler').replace('Deno.serve(handler);','');
let row={id:1,version:0,data:null,requests:[]},sessions=[],collide=false;
async function dbFetch(url,opts){
  const u=new URL(url),table=u.pathname.split('/').at(-1),b=opts.body?JSON.parse(opts.body):null;
  let result;
  if(table==='gg_login_attempt')result=true;
  else if(table==='gg_sessions'){
    if(opts.method==='POST'){sessions.push(b);result=[b];}
    else if(opts.method==='DELETE'){sessions=sessions.filter(s=>s.token_hash!==u.searchParams.get('token_hash').slice(3));result=[];}
    else result=sessions.filter(s=>s.token_hash===u.searchParams.get('token_hash').slice(3)&&s.expires_at>new Date().toISOString());
  }else if(table==='gg_state'){
    if(opts.method==='PATCH'){
      if(collide){collide=false;row.version++;row.data.rankPrizes['1']='別端末の景品';}
      if(Number(u.searchParams.get('version').slice(3))!==row.version) result=[];
      else{row={...row,...b};result=[row];}
    }else result=[row];
  }else throw Error(table);
  return Response.json(result);
}
const ctx=vm.createContext({crypto:globalThis.crypto,TextEncoder,Response,Request,fetch:dbFetch,Deno:{env:{get:()=> 'https://example.test'}},structuredClone,Date,console});
vm.runInContext(helpers+'\n'+source+'\nglobalThis.handle=handler;',ctx);
async function call(body,token){const r=await ctx.handle(new Request('https://test/',{method:'POST',headers:token?{Authorization:'Bearer '+token}:{},body:JSON.stringify(body)}));return {status:r.status,...await r.json()};}
(async()=>{
  assert.equal((await call({action:'get'})).status,401);
  assert.equal((await call({action:'login',role:'admin',password:'wrong'})).status,401);
  // The password is test input only; public frontend never authenticates writes itself.
  const login=await call({action:'login',role:'admin',password:String.fromCharCode(109,105,110,97,109,105,110,111)});
  assert.equal(login.status,200);const admin=login.token;
  const data={students:[{id:'s1',name:'One',number:'A',grade:'小1'},{id:'s2',name:'Two',number:'B',grade:'小2'}],missions:[{id:'m1',text:'課題',deadlineDays:3}],draws:[],rankPrizes:{'1':'景品'},milestonePrizes:[],deliveries:{},hiddenMissions:[],testMissions:[],achievements:[],prizeSuggestions:[],dailyPullLimit:1,lastPromotionYear:2026};
  assert.equal((await call({action:'initialize',requestId:'init',data},admin)).status,200);
  assert.equal((await call({action:'initialize',requestId:'init2',data},admin)).status,409);
  const student=(await call({action:'login',number:'A'})).token;
  assert.equal((await call({action:'save',requestId:'unauthorized',data,version:1},student)).status,403);
  const draw=await call({action:'draw',requestId:'draw1'},student);
  assert.equal(draw.status,200);assert.equal(draw.data.students[1].number,'');
  assert.equal((await call({action:'draw',requestId:'draw1'},student)).result.id,draw.result.id);
  assert.equal(row.data.draws.length,1);
  assert.equal((await call({action:'draw',requestId:'draw2'},student)).status,400);
  const other=(await call({action:'login',number:'B'})).token;
  assert.equal((await call({action:'report',requestId:'report-other',id:draw.result.id},other)).status,409);
  assert.equal((await call({action:'report',requestId:'report',id:draw.result.id},student)).status,200);
  const staleVersion=row.version,staleData=structuredClone(row.data);
  await call({action:'suggest',requestId:'suggest',text:'新景品'},student);
  assert.equal((await call({action:'save',requestId:'stale',version:staleVersion,data:staleData},admin)).status,409);
  assert.equal(row.data.prizeSuggestions.length,1);
  row.data.prizeSuggestions[0].status='却下';
  const visible=await call({action:'get'},student);
  assert.equal(visible.data.prizeSuggestions[0].status,undefined);
  row.data.prizeSuggestions[0].createdAtMs=Date.now()-8*86400000;
  assert.equal((await call({action:'get'},student)).data.prizeSuggestions.length,0);
  const before=structuredClone(row.data),version=row.version;collide=true;
  assert.equal((await call({action:'save',requestId:'collision',version,data:before},admin)).status,409);
  assert.equal(row.data.rankPrizes['1'],'別端末の景品');
  row.data.hiddenMissions=[{id:'h',name:'達成',conditionType:'monthly_count',conditionValue:1,stampReward:3}];
  row.data.draws[0].status='承認済み';row.data.draws[0].approvedAt=new Date().toISOString().slice(0,10);
  await call({action:'save',requestId:'award',version:row.version,data:structuredClone(row.data)},admin);
  await call({action:'save',requestId:'award2',version:row.version,data:structuredClone(row.data)},admin);
  assert.equal(row.data.achievements.length,1);assert.equal(row.data.draws.filter(d=>d.hidden).length,1);
  await call({action:'logout'},student);
  assert.equal((await call({action:'get'},student)).status,401);
  console.log('PASS: authentication, authorization, initial import, student isolation, request privacy/expiry, idempotency, draw limit, conflict protection, rewards, logout');
})().catch(e=>{console.error(e);process.exitCode=1;});
