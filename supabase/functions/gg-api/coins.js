import {todayStr,addDays,isRankingEligible,coinSeason,coinStampTotal} from './helpers.js';
function coinState(data){return data.halloweenCoins||{stampCost:null,entries:[],loginDays:{}};}
function coinCommunityGoal(data){
  // Only share an aggregate; individual coin histories remain private.
  const eligible=new Set((data.students||[]).filter(isRankingEligible).map(s=>s.id));
  const earners=new Set((coinState(data).entries||[]).filter(e=>eligible.has(e.studentId)&&(e.source==='exchange'||e.source==='gacha')).map(e=>e.studentId));
  return {target:25,count:earners.size};
}
function coinSummary(data,id){
  const c=coinState(data),entries=c.entries.filter(e=>e.studentId===id);
  const total=coinStampTotal(data.draws,id);
  const spent=entries.filter(e=>e.source==='exchange').reduce((n,e)=>n+e.stampCost,0);
  return {total,spent,available:Math.max(0,total-spent),entries};
}
function recordCoinVisit(data,id,date=todayStr()){
  if(!coinSeason(date))return false;
  const c=data.halloweenCoins ||= {stampCost:null,entries:[],loginDays:{}};
  c.loginDays ||= {};
  const old=c.loginDays[id];if(old?.date===date)return false;
  c.loginDays[id]={date,streak:old&&addDays(old.date,1)===date?old.streak+1:1};return true;
}
function coinChance(data,id,date=todayStr()){
  if(!coinSeason(date))return 0;
  const visit=coinState(data).loginDays?.[id];
  const days=visit?.date===date?visit.streak:1;
  return Math.min(.05,.01+Math.max(0,days-1)*.005);
}
export {coinSeason,coinState,coinCommunityGoal,coinSummary,recordCoinVisit,coinChance};

