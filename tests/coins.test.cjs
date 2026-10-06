const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const path=require('node:path');
const Date=class extends globalThis.Date {constructor(...args){super(...(args.length?args:['2026-09-06T12:00:00Z']));}static now(){return globalThis.Date.parse('2026-09-06T12:00:00Z');}};
const root=path.resolve(__dirname,'..');
const helpers=fs.readFileSync(root+'/supabase/functions/gg-api/helpers.js','utf8').replace(/export \{[^}]+\};/,'').replace(/function uid\(prefix\) \{[^}]+\}/,'');
const source=fs.readFileSync(root+'/supabase/functions/gg-api/index.js','utf8').replace(/^import[^\n]+\n/gm,'').replace('export async function handler','async function handler').replace('Deno.serve(handler);','');
const testPassword='Test-only-password-987654!';
const testSalt=Array(16).fill(12);
const testHash=require('node:crypto').pbkdf2Sync(testPassword,Buffer.from(testSalt),600000,32,'sha256').toString('hex');
let credentials=['admin','student'].map(role=>({role,salt:testSalt,password_hash:testHash,version:'test-version'}));
let row={id:1,version:0,data:null,requests:[]},sessions=[],collide=false;
async function dbFetch(url,opts){
  const u=new URL(url),table=u.pathname.split('/').at(-1),b=opts.body?JSON.parse(opts.body):null;
  let result;
  if(table==='gg_credentials'){const c=credentials.find(c=>c.role===u.searchParams.get('role').slice(3));if(opts.method==='PATCH'){if(u.searchParams.get('version').slice(3)!==c.version)result=[];else{Object.assign(c,b);result=[c];}}else result=c?[c]:[];}
  else if(table==='gg_login_attempt')result=true;
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
const ctx=vm.createContext({crypto:{subtle:globalThis.crypto.subtle,randomUUID:()=>globalThis.crypto.randomUUID(),getRandomValues:a=>a instanceof Uint32Array&&a.length===1?a.fill(4294967295):globalThis.crypto.getRandomValues(a)},Uint32Array,TextEncoder,Response,Request,fetch:dbFetch,Deno:{env:{get:()=> 'https://example.test'}},structuredClone,Date,console});
const coins=fs.readFileSync(root+'/supabase/functions/gg-api/coins.js','utf8').replace(/^import[^\n]+\n/gm,'').replace(/export \{[^}]+\};/,'');
vm.runInContext(helpers+'\n'+coins+'\n'+source+'\nglobalThis.handle=handler;',ctx);
async function rawCall(body,token){const r=await ctx.handle(new Request('https://test/',{method:'POST',headers:token?{Authorization:'Bearer '+token}:{},body:JSON.stringify(body)}));return {status:r.status,...await r.json()};}
async function call(body,token){if(body.action==='login'&&body.number!==undefined)body={role:'student',...body};return rawCall(body,token);}
(async()=>{
 let clock=globalThis.Date.parse('2026-10-01T00:00:00+09:00'),roll=0xffffffff;
 ctx.Date=class extends globalThis.Date {constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}};
 ctx.crypto.getRandomValues=a=>a instanceof Uint32Array&&a.length===1?a.fill(roll):globalThis.crypto.getRandomValues(a);
 row.data={students:[{id:'s1',name:'生徒A',number:'001',grade:'中1'},{id:'s2',name:'生徒B',number:'002',grade:'中1'}],missions:[{id:'m',text:'勉強',deadlineDays:3}],draws:[{id:'stamps',studentId:'s1',status:'承認済み',approvedAt:'2026-10-01',value:12}],milestonePrizes:[{id:'old',threshold:1,name:'旧景品'}],hiddenMissions:[],testMissions:[],achievements:[],prizeSuggestions:[],rankPrizes:{},deliveries:{},dailyPullLimit:3,rankPrizeMonth:'2026-10',lastPromotionYear:2026};
 const admin=(await call({action:'login',role:'admin',password:testPassword})).token;
 const student=(await call({action:'login',number:'001'})).token;
 const other=(await call({action:'login',number:'002'})).token;
 assert.equal(row.data.halloweenCoins.loginDays.s1.streak,1);
 await call({action:'get'},student);assert.equal(row.data.halloweenCoins.loginDays.s1.streak,1);
 assert.equal((await call({action:'exchange_coin',requestId:'unset',expectedCost:null,expectedSpent:0},student)).status,400);
 assert.equal((await call({action:'set_coin_cost',requestId:'student-setting',expectedCost:null,stampCost:5},student)).status,403);
 assert.equal((await call({action:'set_coin_cost',requestId:'invalid',expectedCost:null,stampCost:0},admin)).status,400);
 assert.equal((await call({action:'set_coin_cost',requestId:'setting',expectedCost:null,stampCost:5},admin)).status,200);
 const exchange={action:'exchange_coin',requestId:'one',expectedCost:5,expectedSpent:0};
 assert.equal((await call(exchange,student)).status,200);assert.equal((await call(exchange,student)).status,200);
 assert.equal(row.data.halloweenCoins.entries.length,1);
 assert.equal((await call({...exchange,requestId:'double'},student)).status,409);
 assert.equal((await call({...exchange,requestId:'two',expectedSpent:5},student)).status,200);
 assert.equal((await call({...exchange,requestId:'three',expectedSpent:10},student)).status,403);
 assert.equal(row.data.draws[0].value,12);
 const privateView=await call({action:'get'},other);assert.equal(privateView.data.halloweenCoins.entries.length,0);assert.equal(privateView.data.halloweenCoins.loginDays,undefined);
 const entryId=row.data.halloweenCoins.entries[0].id;
 assert.equal((await call({action:'deliver_coin',requestId:'bad-deliver',id:entryId},student)).status,403);
 assert.equal((await call({action:'deliver_coin',requestId:'deliver',id:entryId},admin)).status,200);
 assert.equal((await call({action:'deliver_coin',requestId:'deliver-again',id:entryId},admin)).status,200);
 assert.equal(row.data.halloweenCoins.entries.filter(e=>e.deliveredAt).length,1);
 assert.equal((await call({action:'set_coin_cost',requestId:'cost3',expectedCost:5,stampCost:3},admin)).status,200);
 assert.equal(row.data.halloweenCoins.entries.reduce((n,e)=>n+e.stampCost,0),10);
 assert.equal((await call({action:'claim_prize',requestId:'retired',month:'2026-10',type:'milestone',ref:'old'},student)).status,403);
 roll=Math.floor(.014*4294967296);assert.equal((await call({action:'draw',requestId:'base-miss'},student)).result.coinReward,undefined);
 for(let day=2;day<=10;day++){clock=globalThis.Date.parse(`2026-10-${String(day).padStart(2,'0')}T00:00:00+09:00`);await call({action:'get'},student);assert.equal(row.data.halloweenCoins.loginDays.s1.streak,day);}
 ctx.sample=row.data;assert.equal(vm.runInContext("coinChance(sample,'s1')",ctx),.05);
 clock=globalThis.Date.parse('2026-10-12T00:00:00+09:00');await call({action:'get'},student);ctx.sample=row.data;assert.equal(vm.runInContext("coinChance(sample,'s1')",ctx),.01);
 clock=globalThis.Date.parse('2026-10-13T00:00:00+09:00');await call({action:'get'},student);ctx.sample=row.data;assert.equal(vm.runInContext("coinChance(sample,'s1')",ctx),.015);
 roll=Math.floor(.014*4294967296);collide=true;
 const win=await call({action:'draw',requestId:'win'},student);assert.equal(win.status,200);assert.equal(win.result.coinReward,true);assert.equal(win.result.status,'コイン当選');
 const coinsCount=row.data.halloweenCoins.entries.length;
 assert.equal((await call({action:'draw',requestId:'win'},student)).result.id,win.result.id);assert.equal(row.data.halloweenCoins.entries.length,coinsCount);row.requests=[];assert.equal((await call({action:'draw',requestId:'win'},student)).result.id,win.result.id);assert.equal(row.data.halloweenCoins.entries.length,coinsCount);
 assert.equal((await call({action:'report',requestId:'report-coin',id:win.result.id},student)).status,409);
 assert.equal((await call({action:'get'},other)).data.draws.some(d=>d.id===win.result.id),false);
 ctx.sample=row.data;assert.equal(vm.runInContext("coinSummary(sample,'s1').total",ctx),12);
 await call({action:'draw',requestId:'win2'},student);await call({action:'draw',requestId:'win3'},student);
 assert.equal((await call({action:'draw',requestId:'limit'},student)).status,400);
 const oldSave=structuredClone(row.data);delete oldSave.halloweenCoins;oldSave.draws=oldSave.draws.filter(d=>!d.coinReward);
 assert.equal((await call({action:'save',requestId:'old-save',version:row.version,data:oldSave},admin)).status,200);
 assert.equal(row.data.halloweenCoins.entries.length,coinsCount+2);assert.equal(row.data.draws.filter(d=>d.coinReward).length,3);
 clock=globalThis.Date.parse('2026-10-31T23:59:59+09:00');await call({action:'get'},student);ctx.sample=row.data;assert.equal(vm.runInContext("coinChance(sample,'s1')",ctx),.01);
 clock+=1000;
 assert.equal((await call({action:'exchange_coin',requestId:'closed',expectedCost:3,expectedSpent:10},student)).status,403);
 const november=await call({action:'draw',requestId:'november'},student);assert.equal(november.status,200);assert.equal(november.result.coinReward,undefined);
 assert.equal((await call({action:'deliver_coin',requestId:'november-delivery',id:row.data.halloweenCoins.entries.at(-1).id},admin)).status,200);
 console.log('PASS: coin setup, cost changes, balances, ownership, duplicate exchange, delivery, legacy-save preservation, login streaks, probability cap/reset, private wins, retry collision, daily limit, no extra stamps, JST October expiry');
})().catch(e=>{console.error(e);process.exitCode=1;});
