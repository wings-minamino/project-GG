import {todayStr,addDays} from './helpers.js';
const COIN_MONTH='2026-10';
function coinSeason(date=todayStr()){return date.slice(0,7)===COIN_MONTH;}
function coinState(data){return data.halloweenCoins||{stampCost:null,entries:[],loginDays:{}};}
function coinSummary(data,id){
  const c=coinState(data),entries=c.entries.filter(e=>e.studentId===id);
  const total=data.draws.filter(d=>d.studentId===id&&d.status==='承認済み'&&d.approvedAt?.slice(0,7)===COIN_MONTH).reduce((n,d)=>n+(d.value||1),0);
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
export {COIN_MONTH,coinSeason,coinState,coinSummary,recordCoinVisit,coinChance};
