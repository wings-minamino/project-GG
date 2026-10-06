const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const html=fs.readFileSync(require('path').join(__dirname,'../index.html'),'utf8');
const source=html.slice(html.indexOf('  function skipGachaAnimation()'),html.indexOf('  function reportDone'));
(async()=>{
let resolve,calls=0,phase='idle',result=null,reduced=false;const timers=new Map();let n=0;
const ctx={gachaDrawing:{current:false},gachaPhase:'idle',gachaTimeouts:{current:[]},cloud:{current:{generation:1}},setGachaPhase:p=>{phase=p;ctx.gachaPhase=p},setGachaResult:r=>result=r,studentAction:()=>{calls++;return new Promise(r=>resolve=r)},window:{matchMedia:()=>({matches:reduced})},setTimeout:fn=>{timers.set(++n,fn);return n},clearTimeout:id=>timers.delete(id)};
vm.createContext(ctx);vm.runInContext(source,ctx);
const a=ctx.pullGacha();await ctx.pullGacha();assert.equal(calls,1);assert.equal(phase,'waiting');resolve({result:{id:'draw'}});await a;assert.equal(phase,'shaking');assert.equal(result.id,'draw');ctx.skipGachaAnimation();assert.equal(phase,'done');assert.equal(timers.size,0);
reduced=true;const b=ctx.pullGacha();resolve({result:{id:'reduced'}});await b;assert.equal(phase,'done');assert.equal(timers.size,0);
const c=ctx.pullGacha();resolve(null);await c;assert.equal(phase,'idle');assert.equal(ctx.gachaDrawing.current,false);
const d=ctx.pullGacha();ctx.cloud.current.generation++;ctx.setGachaPhase('idle');resolve({result:{id:'old-user'}});await d;assert.equal(phase,'idle');assert.equal(result,null);
console.log('PASS: double-click guard, skip clears timers, reduced motion, failed draw, session change');
})();
