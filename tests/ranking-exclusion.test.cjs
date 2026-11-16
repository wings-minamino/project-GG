// Use a regular-reward month to keep this check independent of the coin campaign.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const students=[{id:'sirxz3gy',name:'test',number:'1',grade:'高3'},
  {id:'a',name:'生徒A',number:'2'},{id:'b',name:'生徒B',number:'3'},
  {id:'c',name:'test',number:'4'},{id:'d',name:'生徒D',number:'5'}];
const draws=students.map((s,i)=>({id:'draw-'+i,studentId:s.id,status:'承認済み',approvedAt:'2026-09-29',value:[99,8,8,3,1][i]}));
draws.push({id:'pending',studentId:'a',status:'承認待ち',approvedAt:'2026-09-29',value:100});
const original=JSON.stringify({students,draws});
for(const file of ['index.html','admin/index.html','supabase/functions/gg-api/helpers.js']){
  const source=fs.readFileSync(path.join(root,file),'utf8');
  const context=vm.createContext({monthKey:s=>s.slice(0,7),useMemo:fn=>fn(),formatMonth:()=> '2026年9月',
    React:{createElement:(tag,props,...children)=>({tag,props:props||{},children})},RankingName:()=>{}});
  function include(start,end){vm.runInContext(source.slice(source.indexOf(start),source.indexOf(end)),context);}
  include('function stampsForStudentMonth(','function daysBetween(');
  if(file.endsWith('helpers.js'))include('function isRankingEligible(','function milestoneClaimOpen(');
  else include('function isRankingEligible(','function GachaMissionApp(');
  const list=context.computeRanking(draws,students,'2026-09');
  assert.deepEqual(Array.from(list,s=>s.id),['a','b','c','d']);
  assert.equal(context.isRankingEligible({...students[0],name:'名前変更',number:'999'}),false);
  assert.equal(context.isRankingEligible(students[3]),true,'same display name must not exclude another account');
  const prizes=context.computeEarnedPrizes(draws,students,{'1':'一等','2':'二等','3':'三等'},[{id:'stamp',threshold:5,name:'スタンプ景品'}],'2026-09');
  assert.deepEqual(Array.from(prizes.filter(p=>p.type==='rank'),p=>p.studentId),['a','b','c']);
  assert.deepEqual(Array.from(prizes.filter(p=>p.type==='rank'),p=>p.ref),['1','1','3']);
  // The fourth student can share third prize, regardless of registration order.
  const cutoffDraws=draws.map(d=>d.studentId==='d'?{...d,value:3}:d);
  const withZero=[...students,{id:'z',name:'未参加'}].reverse();
  const ranked=context.computeRanking(cutoffDraws,withZero,'2026-09');
  assert.deepEqual(Array.from(ranked,s=>s.rank),[1,1,3,3,null]);
  const rankPrizes={'1':'一等','2':'二等','3':'三等'};
  const cutoffPrizes=context.computeEarnedPrizes(cutoffDraws,withZero,rankPrizes,[],'2026-09');
  assert.deepEqual(Array.from(cutoffPrizes,p=>[p.studentId,p.ref]),[['b','1'],['a','1'],['d','3'],['c','3']]);
  assert.ok(prizes.some(p=>p.studentId==='sirxz3gy'&&p.type==='milestone'),'verification of non-ranking rewards remains available');
  const month='2026-11';
  const group=Array.from({length:21},(_,i)=>({id:'participant-'+i,name:'生徒'+i}));
  const stamp=(id,value,date='2026-11-16',status='承認済み')=>({studentId:id,approvedAt:date,status,value});
  const records=group.slice(0,19).map((student,i)=>stamp(student.id,[8,8,6,6][i]||1));
  records.push(stamp(group[0].id,1),stamp(group[1].id,1),stamp(group[19].id,9,'2026-10-31'),
    stamp(group[19].id,9,'2026-11-16','承認待ち'),stamp('sirxz3gy',99));
  const registered=[...group,students[0]];
  const currentRanking=()=>context.computeRanking(records,registered,month);
  const currentAwards=()=>context.computeEarnedPrizes(records,registered,rankPrizes,[{id:'stamp',threshold:1,name:'別景品'}],month);
  assert.equal(context.rankPrizeEligibility(currentRanking(),month).participants,19);
  assert.equal(currentAwards().filter(p=>p.type==='rank').length,0);
  records.push(stamp(group[19].id,1));
  assert.equal(context.rankPrizeEligibility(currentRanking(),month).participants,20);
  assert.deepEqual(Array.from(currentAwards().filter(p=>p.type==='rank'),p=>p.ref),['1','1','3','3']);
  records.push(stamp(group[20].id,1));
  assert.equal(currentAwards().filter(p=>p.type==='rank').length,4);
  assert.equal(context.stampsForStudentMonth(draws,'sirxz3gy','2026-09'),99);
  assert.equal(JSON.stringify({students,draws}),original,'ranking must not remove accounts or stamp records');
  if(!file.endsWith('helpers.js')){
    include('function StudentRankingView(','function MissionProposalPanel(');
    const ranks=context.computeRanking(draws,students,'2026-09');
    assert.deepEqual(Array.from(ranks,s=>s.rank),[1,1,3,4]);
    const publicStudents=students.map(s=>({...s,number:'',grade:''}));
    assert.deepEqual(Array.from(context.computeRanking(draws,publicStudents,'2026-09'),s=>s.id),['a','b','c','d']);
    const view=context.StudentRankingView({draws,students,currentStudentId:'sirxz3gy',month:'2026-09',isMobile:true});
    const nodes=n=>Array.isArray(n)?n.flatMap(nodes):n&&typeof n==='object'?[n,...nodes(n.children)]:[];
    const text=n=>Array.isArray(n)?n.map(text).join(''):n&&typeof n==='object'?text(n.children):n??'';
    include('function AdminView(','function MissionEditor(');
    context.styles={rankRow:{}};
    const admin=context.AdminView({adminTab:'ranking',rankMonth:'2026-09',ranking:ranked,rankPrizes,rankingPrizeNames:rankPrizes,
      milestonePrizes:[],pendingApprovals:[],pendingSuggestions:[]});
    const rows=nodes(admin).filter(el=>el.props.style===context.styles.rankRow);
    assert.deepEqual(rows.map(row=>text(row.children[0])),['1','1','3','3','—']);
    assert.deepEqual(rows.map(row=>row.children[4]?text(row.children[4]):''),['一等','一等','三等','三等','']);
    const rendered=text(view);
    assert.ok(rendered.includes('順位対象外'));assert.ok(rendered.includes('確認用アカウント'));assert.ok(rendered.includes('99スタンプ'));
    assert.ok(!rendered.includes('スタンプ獲得で順位がつきます'));
    assert.equal(nodes(view).filter(n=>n.tag==='li').length,4);
    const ordinary=text(context.StudentRankingView({draws,students,currentStudentId:'a',month:'2026-09',isMobile:false}));
    assert.ok(ordinary.includes('1位／ 4人'));assert.ok(!ordinary.includes('順位対象外'));
  }
  console.log('PASS:',file,'exact verification account exclusion, consecutive ranks, ties, private student fields, reward eligibility and preserved stamps');
}

