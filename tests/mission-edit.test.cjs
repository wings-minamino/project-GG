const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const nodes=tree=>{const result=[];function walk(n){if(Array.isArray(n))return n.forEach(walk);if(!n||typeof n!=='object')return;result.push(n);walk(n.children);}walk(tree);return result;};
const text=n=>Array.isArray(n)?n.map(text).join(''):n&&typeof n==='object'?text(n.children):n??'';
(async()=>{
for(const file of ['index.html','admin/index.html']){
 const source=fs.readFileSync(path.join(root,file),'utf8'),state=[];let cursor=0,actionResult=null,calls=[];
 const ctx=vm.createContext({React:{createElement:(tag,props,...children)=>tag?.name==="MissionSettingsFields"?tag(props):({tag,props:props||{},children})},
  useState:value=>{const i=cursor++;if(!(i in state))state[i]=typeof value==='function'?value():value;return [state[i],next=>state[i]=next];},
  useRef:value=>{const i=cursor++;return state[i]||(state[i]={current:value});},styles:{},console});
 vm.runInContext(source.slice(source.indexOf('function MissionEditor('),source.indexOf('const css =')),ctx);
 const props={kind:'normal',mission:{id:'m',text:'元の課題',deadlineDays:3},onAction:async(action,body)=>{calls.push({action,...body});return actionResult;},onDelete:()=>{},children:['元の課題']};
 const render=()=>{cursor=0;return ctx.MissionEditor(props);};
 const button=(tree,label)=>nodes(tree).find(n=>n.tag==='button'&&text(n)===label);
 const field=(tree,label)=>nodes(nodes(tree).find(n=>n.tag==='label'&&text(n).includes(label))).find(n=>n.tag==='input');
 button(render(),'編集').props.onClick();let tree=render();
 assert.equal(nodes(tree).find(n=>n.tag==='textarea').props.value,'元の課題');
 assert.equal(field(tree,'達成でもらえるシール').props.value,'1');
 assert.equal(field(tree,'達成期限').props.value,'3');
 assert.equal(field(tree,'達成期限').props.required,undefined);
 assert.ok(text(tree).includes('空欄なら期限なし'));
 field(tree,'達成期限').props.onChange({target:{value:''}});tree=render();
 nodes(tree).find(n=>n.tag==='textarea').props.onChange({target:{value:'変更後の課題'}});tree=render();
 field(tree,'達成でもらえるシール').props.onChange({target:{value:'0'}});tree=render();
 await nodes(tree).find(n=>n.tag==='form').props.onSubmit({preventDefault(){}});assert.equal(calls.length,0);
 tree=render();assert.ok(text(tree).includes('1以上の整数'));
 field(tree,'達成でもらえるシール').props.onChange({target:{value:'4'}});tree=render();
 props.mission={...props.mission,text:'別端末の変更'};
 assert.equal(nodes(render()).find(n=>n.tag==='textarea').props.value,'変更後の課題','polling must retain draft');
 await nodes(tree).find(n=>n.tag==='form').props.onSubmit({preventDefault(){}});
 assert.equal(calls[0].expected.text,'元の課題');assert.equal(calls[0].stampReward,4);assert.equal(calls[0].deadlineDays,null);assert.equal(calls[0].expected.deadline,3);
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
 // Restricting a mission starts with no recipients. Searching must preserve earlier selections.
 ctx.GRADE_GROUPS={elementary:{label:'小学生限定'}};
 const audienceProps={students:[{id:'a',name:'青木',number:'101',grade:'中1'},{id:'b',name:'井上',number:'102',grade:'中1'}],
   audience:{targetGroup:null,targetStudentIds:null},onChange:value=>{audienceProps.audience=value;}};
 state.length=0;
 const renderPicker=()=>{cursor=0;return ctx.MissionAudiencePicker(audienceProps);};
 const inputOf=(type)=>nodes(renderPicker()).find(n=>n.props.type===type);
 nodes(renderPicker()).find(n=>n.tag==='select').props.onChange({target:{value:'students'}});
 assert.ok(text(renderPicker()).includes('1人以上'));
 inputOf('search').props.onChange({target:{value:'青木'}});
 inputOf('checkbox').props.onChange({target:{checked:true}});
 inputOf('search').props.onChange({target:{value:'102'}});
 inputOf('checkbox').props.onChange({target:{checked:true}});
 assert.deepEqual(Array.from(audienceProps.audience.targetStudentIds),['a','b']);
 assert.ok(text(renderPicker()).includes('2人選択中'));
 const createCtx=vm.createContext({newMissionText:'  対象別の復習  ',newMissionDeadline:'',newMissionReward:'5',isMissionQuantity:ctx.isMissionQuantity,newMissionAudience:audienceProps.audience,
   studentAction:async(action,body)=>{calls.push({action,...body});return actionResult;},
   setNewMissionReward:v=>createCtx.newMissionReward=v,setNewMissionText:v=>createCtx.newMissionText=v,setNewMissionDeadline:v=>createCtx.newMissionDeadline=v,
   setNewMissionAudience:v=>createCtx.newMissionAudience=v});
 vm.runInContext(source.slice(source.indexOf('  async function addMission()'),source.indexOf('  function removeMission(')),createCtx);
 calls=[];actionResult=null;await createCtx.addMission();
 assert.equal(createCtx.newMissionText,'  対象別の復習  ');
 assert.deepEqual(Array.from(calls[0].audience.targetStudentIds),['a','b']);
 assert.equal(calls[0].action,'create_gacha_mission');assert.equal(calls[0].deadlineDays,null);assert.equal(calls[0].stampReward,5);
 actionResult={result:{id:'added'}};await createCtx.addMission();assert.equal(createCtx.newMissionText,'');
 assert.equal(createCtx.newMissionAudience.targetStudentIds,null);
 assert.equal(createCtx.newMissionDeadline,'');assert.equal(createCtx.newMissionReward,'1');
 const specialCtx=vm.createContext({newTestMissionText:'特別課題',newTestMissionDeadline:'',newTestMissionReward:'2',testMissions:[],
   uid:()=> 'sp',isMissionQuantity:ctx.isMissionQuantity,setTestMissions:v=>specialCtx.testMissions=v,
   setNewTestMissionText:()=>{},setNewTestMissionDeadline:()=>{},setNewTestMissionReward:()=>{}});
 vm.runInContext(source.slice(source.indexOf('  function addTestMission()'),source.indexOf('  function removeTestMission(')),specialCtx);
 specialCtx.addTestMission();
 assert.equal(specialCtx.testMissions[0].deadline,null);assert.equal(specialCtx.testMissions[0].stampReward,2);

 console.log('PASS:',file,'edit prefill, validation, cancel, draft preservation, conflict baseline, saved state and teacher-issued rewards');
}
})().catch(e=>{console.error(e);process.exitCode=1;});
