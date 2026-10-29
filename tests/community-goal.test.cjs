const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const helper=fs.readFileSync(root+'/supabase/functions/gg-api/helpers.js','utf8');
const eligible=helper.slice(helper.indexOf('function isRankingEligible('),helper.indexOf('function computeRanking('));
const coinsSource=fs.readFileSync(root+'/supabase/functions/gg-api/coins.js','utf8').replace(/^import[^\n]+\n/gm,'').replace(/export \{[^}]+\};/,'');
const api=fs.readFileSync(root+'/supabase/functions/gg-api/index.js','utf8');
const ctx=vm.createContext({structuredClone,Date,todayStr:()=> '2026-10-29',fail:()=>{throw Error('unauthorized');}});
vm.runInContext(eligible+coinsSource+api.slice(api.indexOf('function view('),api.indexOf('export async function handler(')),ctx);
const data={students:[...Array.from({length:26},(_,i)=>({id:'s'+i,name:i===0?'test':'生徒',number:String(i+2)})),{id:'sirxz3gy',name:'renamed verification',number:'999'}],draws:[],prizeSuggestions:[],achievements:[],deliveries:{},
  halloweenCoins:{stampCost:5,loginDays:{s0:{date:'2026-10-29',streak:2}},entries:Array.from({length:24},(_,i)=>({id:'e'+i,studentId:'s'+i,source:i%2?'gacha':'exchange',deliveredAt:i%2?null:'2026-10-29'}))}};
assert.equal(ctx.coinCommunityGoal({students:data.students}).count,0,'legacy state starts at zero');
data.halloweenCoins.entries.push({studentId:'s0',source:'exchange'},{studentId:'s0',source:'gacha'},{studentId:'sirxz3gy',source:'gacha'},{studentId:'deleted',source:'exchange'},{studentId:'s24',source:'unknown'});
let goal=ctx.coinCommunityGoal(data);
assert.equal(goal.count,24,'count people once; exclude verification, deleted accounts and non-coin records');
assert.equal(goal.target,25);
assert.deepEqual(Object.keys(goal).sort(),['count','target'],'only aggregate counts can be shared');
data.halloweenCoins.entries.push({studentId:'s24',source:'exchange'});
assert.equal(ctx.coinCommunityGoal(data).count,25);
data.halloweenCoins.entries.push({studentId:'s25',source:'gacha'});
assert.equal(ctx.coinCommunityGoal(data).count,26,'keep actual count above target');
const original=JSON.stringify(data);
const student=ctx.view({version:1,data},{role:'student',student_id:'s1'}).data.halloweenCoins;
const admin=ctx.view({version:1,data},{role:'admin'}).data.halloweenCoins;
assert.equal(student.communityGoal.count,26);assert.equal(admin.communityGoal.count,26);
assert.equal(student.entries.length,1);assert.equal(student.entries[0].studentId,'s1');
assert.equal(student.loginDays,undefined,'do not expose other students login streaks');
assert.equal(admin.entries.length,data.halloweenCoins.entries.length);
assert.equal(JSON.stringify(data),original,'view and aggregate must not change persisted state');

const nodes=n=>Array.isArray(n)?n.flatMap(nodes):n&&typeof n==='object'?[n,...nodes(n.children)]:[];
const text=n=>Array.isArray(n)?n.map(text).join(''):n&&typeof n==='object'?text(n.children):n==null?'':String(n);
for(const file of ['index.html','admin/index.html']){
  const html=fs.readFileSync(root+'/'+file,'utf8');
  const ui=vm.createContext({React:{createElement:(tag,props,...children)=>({tag,props:props||{},children})}});
  vm.runInContext(eligible+html.slice(html.indexOf('function CoinCommunityGoal('),html.indexOf('function HalloweenCoinPanel(')),ui);
  const render=(count,extra={})=>ui.CoinCommunityGoal({coins:{entries:[],communityGoal:{count,target:25}},studentId:'s1',...extra});
  const almost=render(24);assert.match(text(almost),/あと1人/);assert.doesNotMatch(text(almost),/追加が決定/);
  const zero=render(0);assert.match(text(zero),/あと25人/);
  for(const count of [25,26]){
    const tree=render(count);assert.match(text(tree),/種類追加が決定/);assert.match(text(tree),/先生からのお知らせ/);
    const bar=nodes(tree).find(n=>n.props.role==='progressbar');
    assert.equal(bar.props['aria-valuenow'],25);assert.equal(bar.children[0].props.style.width,'100%');
    assert.match(bar.props['aria-valuetext'],new RegExp(count+'人が獲得'));
    assert.match(text(render(count,{admin:true})),/お菓子の種類を追加し/);
  }
  assert.match(text(render(2,{coins:{communityGoal:{count:2,target:25},entries:[{studentId:'s1',source:'gacha'}]}})),/カウント済み/);
  assert.doesNotMatch(text(render(2,{studentId:'sirxz3gy'})),/確認用アカウント|カウント済み|最初の1コインで/);
  assert.equal(ui.CoinCommunityGoal({coins:{entries:[]},studentId:'s1'}),null,'never substitute a private count for a missing global aggregate');
}
console.log('PASS: unique coin earners, verification exclusion, 24/25/26 threshold, private API histories, read-only derived counts and student/admin displays');
