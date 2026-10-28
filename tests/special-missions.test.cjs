const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const root=path.resolve(__dirname,'..');
for(const file of ['index.html','admin/index.html']){
 const source=fs.readFileSync(path.join(root,file),'utf8');
 const decoded=source.replace(/\\u([0-9a-f]{4})/gi,(_,code)=>String.fromCharCode(parseInt(code,16)));
 assert.ok(!/限定ミッション|期間限定/.test(decoded),'old display names remain in '+file);
 const React={Fragment:'fragment',createElement:(tag,props,...children)=>typeof tag==='function'?tag({...props,children}):({tag,props:props||{},children})};
 const reports=[];
 const ctx=vm.createContext({React,useState:v=>[typeof v==='function'?v():v,()=>{}],useMemo:f=>f(),useRef:v=>({current:v}),useEffect:()=>{},
  IS_ADMIN_PORTAL:file.startsWith('admin/'),MACHINE_IMAGE_DATA_URI:'',GRADE_GROUPS:{},GRADE_LEVELS:[],
  isDrawOverdue:()=>false,shiftMonth:()=>'',formatMonth:v=>v,canCancelIssuedMission:d=>d.status==='進行中',Date,console});
 function include(start,end){vm.runInContext(source.slice(source.indexOf(start),source.indexOf(end)),ctx);}
 include('function GachaReveal(','async function prepareMissionPhoto(');
 include('function PhotoMissionPanel(','function AchievementPopup(');
 include('function IssuedMissionHistory(','function parseStudentCSV(');
 include('function AdminView(','const css =');
 include('const styles =','ReactDOM.createRoot(');
 const nodes=tree=>{const list=[];function visit(n){if(Array.isArray(n))return n.forEach(visit);if(!n||typeof n!=='object')return;list.push(n);n.children?.forEach(visit);}visit(tree);return list;};
 const text=n=>Array.isArray(n)?n.map(text).join(''):n&&typeof n==='object'?text(n.children):typeof n==='string'?n:'';
 const hasClass=(n,c)=>(n.props?.className||'').split(' ').includes(c);
 const draws=[
  {id:'normal',missionText:'通常',status:'進行中'},
  {id:'teacher',missionText:'先生からの通常',issuedByAdmin:true,status:'進行中'},
  {id:'special',missionText:'特別',isTestMission:true,issuedByAdmin:true,status:'進行中'},
  {id:'pending',missionText:'特別承認待ち',isTestMission:true,status:'承認待ち'}
 ];
 const tree=ctx.StudentMissionView({studentName:'表示確認',missionsAvailable:0,gachaPhase:'idle',myActive:draws,reportDone:id=>reports.push(id),
  studentMonth:'2026-10',myStampsThisMonth:0,milestonePrizes:[],myAchievements:[],isMobile:true,dailyPullLimit:3,myTodayPullCount:0});
 const cards=nodes(tree).filter(n=>hasClass(n,'gg-mission-card'));
 assert.equal(cards.length,4);
 assert.equal(cards.filter(n=>hasClass(n,'gg-special-mission')).length,2);
 for(const card of cards){
  const badges=nodes(card).filter(n=>hasClass(n,'gg-special-badge'));
  assert.equal(badges.length,hasClass(card,'gg-special-mission')?1:0);
  if(badges.length)assert.equal(text(badges[0]),'★特別ミッション');
 }
 nodes(cards[2]).find(n=>n.tag==='button').props.onClick();
 assert.deepEqual(reports,['special']);
 assert.equal(nodes(cards[3]).filter(n=>n.tag==='button').length,0);
 for(const admin of [false,true]){
  const photo=ctx.PhotoMissionPanel({admin,api:()=>{throw new Error('unexpected API call');}});
  assert.ok(hasClass(photo,'gg-special-mission'));
  assert.equal(nodes(photo).filter(n=>hasClass(n,'gg-special-badge')).length,1);
 }
 const special={id:'special',text:'特別な学習',deadline:'2026-10-31',stampReward:2};
 const history=[{...draws[2],studentId:'sample',drawnAt:'2026-10-28'}];
 for(const adminTab of ['missions','approve','issue']){
  const admin=ctx.AdminView({adminTab,isMobile:false,pendingApprovals:history,undeliveredCount:0,pendingSuggestions:[],milestonePrizes:[],
   missions:[{id:'normal',text:'通常',deadlineDays:3}],testMissions:[special],hiddenMissions:[],dailyPullLimit:3,
   students:[],filteredSortedStudents:[],selectedStudentIds:[],issuedMissionHistory:history,schoolOptions:[],issueMissionId:'special',studentName:()=> '表示確認'});
  assert.ok(text(admin).includes('特別ミッション'));
  assert.equal(nodes(admin).filter(n=>hasClass(n,'gg-special-mission')).length,1);
  if(adminTab==='issue'){
   assert.equal(nodes(admin).filter(n=>n.tag==='optgroup'&&n.props.label==='特別ミッション').length,1);
   assert.ok(text(nodes(admin).find(n=>n.tag==='option'&&n.props.value==='special')).startsWith('【特別ミッション】'));
  }
 }
 console.log('PASS:',file,'legacy mission flags, normal/special distinction, photo label, reporting, pending state, teacher management/approval/history/selector');
}
