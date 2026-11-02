const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const html=fs.readFileSync(require('path').join(__dirname,'../index.html'),'utf8');
const source=html.slice(html.indexOf('  function skipGachaAnimation()'),html.indexOf('  function reportDone'));
(async()=>{
let resolve,calls=0,phase='idle',result=null,reduced=false,november=true;const timers=new Map();let n=0;
const ctx={gachaDrawing:{current:false},gachaPhase:'idle',gachaTimeouts:{current:[]},cloud:{current:{generation:1}},setGachaPhase:p=>{phase=p;ctx.gachaPhase=p},setGachaResult:r=>result=r,studentAction:()=>{calls++;return new Promise(r=>resolve=r)},isNovemberSeason:()=>november,window:{matchMedia:()=>({matches:reduced})},setTimeout:(fn,ms)=>{timers.set(++n,{fn,ms});return n},clearTimeout:id=>timers.delete(id)};
vm.createContext(ctx);vm.runInContext(source,ctx);
const a=ctx.pullGacha();await ctx.pullGacha();assert.equal(calls,1);assert.equal(phase,'waiting');resolve({result:{id:'draw',missionText:'Actual mission'}});await a;assert.equal(phase,'shaking');assert.equal(result.id,'draw');
assert.deepEqual([...timers.values()].map(t=>t.ms),[1200,2500,3400]);
await ctx.pullGacha();assert.equal(calls,1,'animation cannot cause a second draw');
for(const [id,t] of [...timers]){timers.delete(id);t.fn();}
assert.equal(phase,'done');assert.equal(result.missionText,'Actual mission');
const skip=ctx.pullGacha();resolve({result:{id:'skip'}});await skip;ctx.skipGachaAnimation();assert.equal(phase,'done');assert.equal(result.id,'skip');assert.equal(timers.size,0);
november=false;const regular=ctx.pullGacha();resolve({result:{id:'regular'}});await regular;
assert.deepEqual([...timers.values()].map(t=>t.ms),[900,1700,2400]);ctx.skipGachaAnimation();
reduced=true;const b=ctx.pullGacha();resolve({result:{id:'reduced'}});await b;assert.equal(phase,'done');assert.equal(timers.size,0);
const c=ctx.pullGacha();resolve(null);await c;assert.equal(phase,'idle');assert.equal(ctx.gachaDrawing.current,false);
const d=ctx.pullGacha();ctx.cloud.current.generation++;ctx.setGachaPhase('idle');resolve({result:{id:'old-user'}});await d;assert.equal(phase,'idle');assert.equal(result,null);
console.log('PASS: November and regular timing, real draw result, duplicate guard, skip, reduced motion, failed draw, session change');
})();
