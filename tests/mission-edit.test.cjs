const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const nodes=tree=>{const result=[];function walk(n){if(Array.isArray(n))return n.forEach(walk);if(!n||typeof n!=='object')return;result.push(n);walk(n.children);}walk(tree);return result;};
const text=n=>Array.isArray(n)?n.map(text).join(''):n&&typeof n==='object'?text(n.children):n??'';
(async()=>{
for(const file of ['index.html','admin/index.html']){
 const source=fs.readFileSync(path.join(root,file),'utf8'),state=[];let cursor=0,actionResult=null,calls=[];
 const ctx=vm.createContext({React:{createElement:(tag,props,...children)=>({tag,props:props||{},children})},
  useState:value=>{const i=cursor++;if(!(i in state))state[i]=typeof value==='function'?value():value;return [state[i],next=>state[i]=next];},
  useRef:value=>{const i=cursor++;return state[i]||(state[i]={current:value});},styles:{},console});
 vm.runInContext(source.slice(source.indexOf('function MissionEditor('),source.indexOf('const css =')),ctx);
 const props={kind:'normal',mission:{id:'m',text:'元の課題',deadlineDays:3},onAction:async(action,body)=>{calls.push({action,...body});return actionResult;},onDelete:()=>{},children:['元の課題']};
 const render=()=>{cursor=0;return ctx.MissionEditor(props);};
 const button=(tree,label)=>nodes(tree).find(n=>n.tag==='button'&&text(n)===label);
 button(render(),'編集').props.onClick();let tree=render();
 assert.equal(nodes(tree).find(n=>n.tag==='textarea').props.value,'元の課題');
 assert.equal(nodes(tree).find(n=>n.tag==='input').props.value,'1');
 nodes(tree).find(n=>n.tag==='textarea').props.onChange({target:{value:'変更後の課題'}});tree=render();
 nodes(tree).find(n=>n.tag==='input').props.onChange({target:{value:'0'}});tree=render();
 await nodes(tree).find(n=>n.tag==='form').props.onSubmit({preventDefault(){}});assert.equal(calls.length,0);
 tree=render();assert.ok(text(tree).includes('1以上の整数'));
 nodes(tree).find(n=>n.tag==='input').props.onChange({target:{value:'4'}});tree=render();
 props.mission={...props.mission,text:'別端末の変更'};
 assert.equal(nodes(render()).find(n=>n.tag==='textarea').props.value,'変更後の課題','polling must retain draft');
 await nodes(tree).find(n=>n.tag==='form').props.onSubmit({preventDefault(){}});
 assert.equal(calls[0].expected.text,'元の課題');assert.equal(calls[0].stampReward,4);
 tree=render();assert.equal(nodes(tree).find(n=>n.tag==='textarea').props.value,'変更後の課題','failed saves must retain draft');
 button(tree,'キャンセル').props.onClick();assert.equal(nodes(render()).filter(n=>n.tag==='form').length,0);
 button(render(),'編集').props.onClick();tree=render();assert.equal(nodes(tree).find(n=>n.tag==='textarea').props.value,'別端末の変更');
 actionResult={result:{id:'m'}};
 await nodes(tree).find(n=>n.tag==='form').props.onSubmit({preventDefault(){}});
 assert.ok(text(render()).includes('保存しました。'));assert.equal(nodes(render()).filter(n=>n.tag==='form').length,0);
 // Teacher-issued missions must snapshot each mission's configured reward, including old records.
 const issueCtx=vm.createContext({issueMissionId:'m',missions:[{id:'m',text:'課題',deadlineDays:3,stampReward:4}],testMissions:[],issueRecipients:[{id:'s',name:'Test',number:'0'}],draws:[],uid:()=> 'draw',todayStr:()=> '2026-11-11',addDays:()=> '2026-11-14',randomCapsuleColor:()=> '#fff',setDraws:draws=>issueCtx.output=draws,setSelectedStudentIds:()=>{},setIssueMissionId:()=>{}});
 vm.runInContext(source.slice(source.indexOf('  function issueMission()'),source.indexOf('  function updateRankPrize(')),issueCtx);
 issueCtx.issueMission();assert.equal(issueCtx.output[0].value,4);
 delete issueCtx.missions[0].stampReward;issueCtx.issueMission();assert.equal(issueCtx.output[0].value,1);
 issueCtx.missions=[];issueCtx.testMissions=[{id:'m',text:'特別',stampReward:5,deadline:'2026-11-30'}];issueCtx.issueMission();assert.equal(issueCtx.output[0].value,5);
 console.log('PASS:',file,'edit prefill, validation, cancel, draft preservation, conflict baseline, saved state and teacher-issued rewards');
}
})().catch(e=>{console.error(e);process.exitCode=1;});
