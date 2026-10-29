const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const students=[{id:'sirxz3gy',name:'test',number:'1',grade:'高3'},
  {id:'a',name:'生徒A',number:'2'},{id:'b',name:'生徒B',number:'3'},
  {id:'c',name:'test',number:'4'},{id:'d',name:'生徒D',number:'5'}];
const draws=students.map((s,i)=>({id:'draw-'+i,studentId:s.id,status:'承認済み',approvedAt:'2026-10-29',value:[99,8,8,3,1][i]}));
draws.push({id:'pending',studentId:'a',status:'承認待ち',approvedAt:'2026-10-29',value:100});
const original=JSON.stringify({students,draws});
for(const file of ['index.html','admin/index.html','supabase/functions/gg-api/helpers.js']){
  const source=fs.readFileSync(path.join(root,file),'utf8');
  const context=vm.createContext({monthKey:s=>s.slice(0,7),useMemo:fn=>fn(),formatMonth:()=> '2026年10月',
    React:{createElement:(tag,props,...children)=>({tag,props:props||{},children})},RankingName:()=>{}});
  function include(start,end){vm.runInContext(source.slice(source.indexOf(start),source.indexOf(end)),context);}
  include('function stampsForStudentMonth(','function daysBetween(');
  if(file.endsWith('helpers.js'))include('function isRankingEligible(','function milestoneClaimOpen(');
  else include('function isRankingEligible(','function GachaMissionApp(');
  const list=context.computeRanking(draws,students,'2026-10');
  assert.deepEqual(Array.from(list,s=>s.id),['a','b','c','d']);
  assert.equal(context.isRankingEligible({...students[0],name:'名前変更',number:'999'}),false);
  assert.equal(context.isRankingEligible(students[3]),true,'same display name must not exclude another account');
  const prizes=context.computeEarnedPrizes(draws,students,{'1':'一等','2':'二等','3':'三等'},[{id:'stamp',threshold:5,name:'スタンプ景品'}],'2026-10');
  assert.deepEqual(Array.from(prizes.filter(p=>p.type==='rank'),p=>p.studentId),['a','b','c']);
  assert.equal(prizes.find(p=>p.type==='rank'&&p.studentId==='a').ref,'1');
  assert.ok(prizes.some(p=>p.studentId==='sirxz3gy'&&p.type==='milestone'),'verification of non-ranking rewards remains available');
  assert.equal(context.stampsForStudentMonth(draws,'sirxz3gy','2026-10'),99);
  assert.equal(JSON.stringify({students,draws}),original,'ranking must not remove accounts or stamp records');
  if(!file.endsWith('helpers.js')){
    include('function studentMonthlyRanking(','function RankingName(');
    include('function StudentRankingView(','function MissionProposalPanel(');
    const ranks=context.studentMonthlyRanking(draws,students,'2026-10');
    assert.deepEqual(Array.from(ranks,s=>s.rank),[1,1,3,4]);
    const publicStudents=students.map(s=>({...s,number:'',grade:''}));
    assert.deepEqual(Array.from(context.studentMonthlyRanking(draws,publicStudents,'2026-10'),s=>s.id),['a','b','c','d']);
    const view=context.StudentRankingView({draws,students,currentStudentId:'sirxz3gy',month:'2026-10',isMobile:true});
    const nodes=n=>Array.isArray(n)?n.flatMap(nodes):n&&typeof n==='object'?[n,...nodes(n.children)]:[];
    const text=n=>Array.isArray(n)?n.map(text).join(''):n&&typeof n==='object'?text(n.children):n??'';
    const rendered=text(view);
    assert.ok(rendered.includes('順位対象外'));assert.ok(rendered.includes('確認用アカウント'));assert.ok(rendered.includes('99スタンプ'));
    assert.ok(!rendered.includes('スタンプ獲得で順位がつきます'));
    assert.equal(nodes(view).filter(n=>n.tag==='li').length,4);
    const ordinary=text(context.StudentRankingView({draws,students,currentStudentId:'a',month:'2026-10',isMobile:false}));
    assert.ok(ordinary.includes('1位／ 4人'));assert.ok(!ordinary.includes('順位対象外'));
  }
  console.log('PASS:',file,'exact verification account exclusion, consecutive ranks, ties, private student fields, reward eligibility and preserved stamps');
}
