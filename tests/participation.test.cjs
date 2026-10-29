const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
let month='2026-10',focused=null,scrolled=null;
const ctx=vm.createContext({Date,currentMonthKey:()=>month,monthKey:s=>s.slice(0,7),
  document:{getElementById:id=>({scrollIntoView:options=>scrolled={id,...options},focus:()=>focused=id})},
  window:{matchMedia:()=>({matches:true})},React:{createElement:(tag,props,...children)=>({tag,props:props||{},children})}});
function include(start,end){vm.runInContext(html.slice(html.indexOf(start),html.indexOf(end)),ctx);}
include('function stampsForStudentMonth(','function daysBetween(');
include('function studentCoinProgress(','function HalloweenCoinPanel(');
include('function missionDeadlineLabel(','function StudentMissionView(');
const draws=[{studentId:'me',status:'承認済み',approvedAt:'2026-10-29',value:8},
  {studentId:'me',status:'承認待ち',approvedAt:'2026-10-29',value:20},
  {studentId:'other',status:'承認済み',approvedAt:'2026-10-29',value:100},
  {studentId:'me',status:'承認済み',approvedAt:'2026-09-29',value:100}];
const entries=[{studentId:'me',source:'exchange',stampCost:3,deliveredAt:'2026-10-28'},
  {studentId:'other',source:'exchange',stampCost:5}];
let progress=ctx.studentCoinProgress({stampCost:5,entries},draws,'me');
assert.equal(progress.available,5);assert.equal(progress.ready,true);assert.equal(progress.exchangeable,1);assert.equal(progress.waiting,0);
const base={coinProgress:progress,myActive:[],canPull:true,limitReached:false,isAnimating:false};
assert.equal(ctx.participationNextStep(base).target,'gg-student-coins');
entries.push({studentId:'me',source:'exchange',stampCost:5});
progress=ctx.studentCoinProgress({stampCost:5,entries},draws,'me');
assert.equal(progress.available,0);assert.equal(progress.remaining,5);assert.equal(progress.waiting,1);
assert.match(ctx.participationNextStep({...base,coinProgress:progress}).title,/受け取ろう/);
entries.at(-1).deliveredAt='2026-10-29';
progress=ctx.studentCoinProgress({stampCost:5,entries},draws,'me');
assert.equal(progress.waiting,0);assert.equal(progress.ready,false);
assert.equal(ctx.participationNextStep({...base,coinProgress:progress}).target,'gg-mission-draw');
const active=[{id:'later',status:'進行中',missionText:'後日の課題',deadline:'2026-10-31'},
  {id:'pending',status:'承認待ち',missionText:'報告済み',deadline:'2026-10-28'},
  {id:'today',status:'進行中',missionText:'今日の課題',deadline:'2026-10-29'},
  {id:'none',status:'進行中',missionText:'期限なし'}];
assert.deepEqual(Array.from(ctx.orderStudentMissions(active),d=>d.id),['today','later','none','pending']);
assert.equal(active[0].id,'later','sorting must not mutate the source data');
const step=ctx.participationNextStep({...base,coinProgress:progress,myActive:active});
assert.equal(step.target,'gg-mission-today');assert.equal(step.description,'今日の課題');
assert.equal(ctx.missionDeadlineLabel('2026-10-29','2026-10-29'),'今日まで');
assert.equal(ctx.missionDeadlineLabel('2026-10-30','2026-10-29'),'明日まで');
assert.equal(ctx.missionDeadlineLabel('2026-11-01','2026-10-31'),'明日まで');
assert.equal(ctx.missionDeadlineLabel(null),'');
assert.match(ctx.participationNextStep({...base,coinProgress:progress,myActive:[active[1]],canPull:false}).title,/先生の確認/);
assert.equal(ctx.participationNextStep({...base,coinProgress:progress,myActive:[active[1]],canPull:false}).target,'gg-student-missions');
assert.match(ctx.participationNextStep({...base,coinProgress:progress,canPull:false,limitReached:true}).title,/今日の抽選は完了/);
assert.match(ctx.participationNextStep({...base,coinProgress:progress,canPull:false,isAnimating:true}).title,/抽選中/);
assert.match(ctx.participationNextStep({...base,coinProgress:progress,canPull:false}).title,/準備中/);
const nodes=n=>Array.isArray(n)?n.flatMap(nodes):n&&typeof n==='object'?[n,...nodes(n.children)]:[];
const tree=ctx.StudentParticipationGuide({...base,coinProgress:progress,myActive:active});
nodes(tree).find(n=>n.tag==='button').props.onClick();
assert.equal(focused,'gg-mission-today');assert.equal(scrolled.behavior,'auto');
assert.equal(nodes(tree).find(n=>n.props.role==='progressbar').props['aria-valuenow'],0);
assert.equal(nodes(tree).filter(n=>n.tag==='li').length,3);
const unset=ctx.studentCoinProgress({stampCost:null,entries:[]},draws,'me');
assert.equal(nodes(ctx.StudentParticipationGuide({...base,coinProgress:unset})).filter(n=>n.props.role==='progressbar').length,0);
month='2026-11';
const closed=ctx.studentCoinProgress({stampCost:5,entries:[]},draws,'me');
assert.equal(closed.active,false);
assert.equal(ctx.participationNextStep({...base,coinProgress:closed}).target,'gg-mission-draw');
const closedTree=ctx.StudentParticipationGuide({...base,coinProgress:closed});
assert.equal(nodes(closedTree).filter(n=>n.props.role==='progressbar').length,0);
assert.ok(JSON.stringify(closedTree).includes('景品を確認'));
const waitingAfterClose=ctx.studentCoinProgress({stampCost:5,entries:[{studentId:'me',source:'gacha'}]},draws,'me');
assert.equal(ctx.participationNextStep({...base,coinProgress:waitingAfterClose}).target,'gg-student-coins');
console.log('PASS: participation guidance, personal approved balances, pending/delivered coins, missing rates, expired exchange period, mission priority, deadlines, no source mutation, navigation and reduced motion');
