import {milestoneClaimOpen, computeEarnedPrizes, deliveryKey, deriveAdminPassword, ADMIN_PASSWORD_SALT, ADMIN_PASSWORD_HASH, todayStr, addDays, randomCapsuleColor, isMissionEligible, computePeriodKeysMet, currentAcademicYear, promoteStudentGrade} from './helpers.js';

// Bearer-token authentication, no ambient cookies: also supports VS Code Live Server.
const headers = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type, authorization','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};
const fail = (status,message) => { throw Object.assign(new Error(message),{status}); };
async function db(path,method='GET',body) {
  const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const r=await fetch(Deno.env.get('SUPABASE_URL')+'/rest/v1/'+path,{method,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',Prefer:'return=representation'},body:body===undefined?undefined:JSON.stringify(body)});
  if(!r.ok) fail(503,'保存先に接続できません。時間をおいて再試行してください。');
  return r.status===204?null:await r.json();
}
async function hash(s) {return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),b=>b.toString(16).padStart(2,'0')).join('');}
const uid=()=>crypto.randomUUID();
function rewardMonth() {return new Date(Date.now()+9*3600000).toISOString().slice(0,7);}
function closeRankMonths(data,month=rewardMonth()) {
  data.rankPrizeHistory=data.rankPrizeHistory||{};
  data.rankPrizeMonth=data.rankPrizeMonth||month;
  while(data.rankPrizeMonth<month) {
    const old=data.rankPrizeMonth,prizes=structuredClone(data.rankPrizes);
    if(!data.rankPrizeHistory[old])data.rankPrizeHistory[old]={
      prizes,earned:computeEarnedPrizes(data.draws,data.students,prizes,[],old),
      finalizedAt:new Date().toISOString()
    };
    const [y,m]=old.split('-').map(Number);
    data.rankPrizeMonth=m===12?(y+1)+'-01':y+'-'+String(m+1).padStart(2,'0');
    data.rankPrizes={'1':'','2':'','3':''};
  }
  return data;
}
async function settleRankMonths(row) {
  for(let attempt=0;attempt<5;attempt++) {
    if(!row.data||row.data.rankPrizeMonth===rewardMonth())return row;
    const data=closeRankMonths(structuredClone(row.data));
    const saved=await db('gg_state?id=eq.1&version=eq.'+row.version,'PATCH',{version:row.version+1,data});
    if(saved.length)return saved[0];
    row=(await db('gg_state?id=eq.1'))[0];
  }
  fail(409,'月次更新中です。もう一度お試しください。');
}
function validate(data) {
  if(!data || typeof data!=='object') fail(400,'データの形式が違います');
  for(const k of ['students','missions','draws','milestonePrizes','hiddenMissions','testMissions','achievements','prizeSuggestions']) {
    if(!Array.isArray(data[k]) || data[k].length>50000 || data[k].some(x=>!x || typeof x.id!=='string') || new Set(data[k].map(x=>x.id)).size!==data[k].length) fail(400,'データの形式が違います: '+k);
  }
  if(data.students.some(s=>typeof s.name!=='string'||typeof s.number!=='string') || new Set(data.students.map(s=>s.number)).size!==data.students.length) fail(400,'生徒番号を確認してください');
  if(!data.rankPrizes||!data.deliveries||!Number.isFinite(data.dailyPullLimit)||data.dailyPullLimit<0) fail(400,'設定データを確認してください');
}
function derived(data) {
  const year=currentAcademicYear();
  if(!Number.isInteger(data.lastPromotionYear)||data.lastPromotionYear<2000) data.lastPromotionYear=year;
  if(data.lastPromotionYear<year){
    for(let y=data.lastPromotionYear;y<year;y++) data.students=data.students.map(promoteStudentGrade).filter(Boolean);
    data.lastPromotionYear=year;
  }
  for(const s of data.students) for(const hm of data.hiddenMissions) for(const periodKey of computePeriodKeysMet(data.draws,s.id,hm)) {
    if(data.achievements.some(a=>a.studentId===s.id&&a.hiddenMissionId===hm.id&&a.periodKey===periodKey)) continue;
    const reward=hm.stampReward||1;
    data.achievements.push({id:uid(),studentId:s.id,hiddenMissionId:hm.id,periodKey,achievedAt:todayStr(),seen:false,missionName:hm.name,reward});
    data.draws.push({id:uid(),studentId:s.id,missionId:hm.id,missionText:'[隠しミッション] '+hm.name,status:'承認済み',color:'#E8A93B',drawnAt:todayStr(),approvedAt:todayStr(),value:reward,hidden:true});
  }
  return data;
}
function view(row,session) {
  if(!row.data) return {version:row.version,data:null};
  if(session.role==='admin') return {version:row.version,data:row.data};
  const d=structuredClone(row.data),id=session.student_id;
  d.missionSuggestions=(d.missionSuggestions||[]).filter(x=>x.studentId===id);
  if(!d.students.some(s=>s.id===id)) fail(401,'生徒の登録が変更されました。ログインし直してください。');
  d.students=d.students.map(s=>s.id===id?s:{id:s.id,name:s.name,number:'',school:'',grade:''});
  // Ranking needs only other students' approved stamp totals, never their missions or login numbers.
  d.draws=d.draws.filter(x=>x.status==='承認済み'||(x.studentId===id&&!(x.deadline&&x.deadline<todayStr()))).map(x=>x.studentId===id?x:{id:x.id,studentId:x.studentId,status:x.status,approvedAt:x.approvedAt,value:x.value});
  d.prizeSuggestions=d.prizeSuggestions.filter(x=>x.studentId===id && Date.now()-(x.createdAtMs||Date.parse(x.createdAt))<7*86400000).map(({id,studentId,text,createdAt,createdAtMs})=>({id,studentId,text,createdAt,createdAtMs}));
  d.achievements=d.achievements.filter(x=>x.studentId===id);
  d.deliveries=Object.fromEntries(Object.entries(d.deliveries).filter(([key])=>key.startsWith(id+'|')));
  d.prizeClaims=Object.fromEntries(Object.entries(d.prizeClaims||{}).filter(([,claim])=>claim.studentId===id));
  d.hiddenMissions=[]; d.testMissions=[];
  return {version:row.version,data:d};
}
export async function handler(req) {
  if(req.method==='OPTIONS') return new Response('ok',{headers});
  try {
    if(req.method!=='POST') fail(405,'POST required');
    const raw=await req.text(); if(raw.length>5000000) fail(413,'データが大きすぎます');
    const b=JSON.parse(raw);
    let row=(await db('gg_state?id=eq.1'))[0];
    if(b.action==='login') {
      const bucket=await hash((req.headers.get('x-forwarded-for')||'unknown').split(',')[0]);
      if(!await db('rpc/gg_login_attempt','POST',{bucket})) fail(429,'ログイン回数が多いため、5分後にお試しください。');
      let session;
      if(b.role==='admin') {
        if(typeof b.password!=='string'||b.password.length>200||(await deriveAdminPassword(b.password,ADMIN_PASSWORD_SALT))!==ADMIN_PASSWORD_HASH) fail(401,'パスワードが違います');
        session={role:'admin',student_id:null};
      } else {
        if(!row.data) fail(409,'先生がデータ共有を準備中です');
        const s=row.data.students.find(s=>s.number===b.number);
        if(!s) fail(401,'生徒番号を確認してください');
        session={role:'student',student_id:s.id};
      }
      const token=uid()+uid();
      row=await settleRankMonths(row);
      await db('gg_sessions','POST',{...session,token_hash:await hash(token),expires_at:new Date(Date.now()+12*3600000).toISOString()});
      return Response.json({...view(row,session),token,role:session.role,studentId:session.student_id},{headers});
    }
    const token=(req.headers.get('authorization')||'').replace(/^Bearer /,'');
    if(!token) fail(401,'ログインしてください');
    const tokenHash=await hash(token);
    const session=(await db('gg_sessions?token_hash=eq.'+tokenHash+'&expires_at=gt.'+encodeURIComponent(new Date().toISOString())))[0];
    if(!session) fail(401,'ログインの有効期限が切れました。ログインし直してください。');
    if(b.action==='logout'){await db('gg_sessions?token_hash=eq.'+tokenHash,'DELETE');return Response.json({ok:true},{headers});}
    row=await settleRankMonths(row);
    if(b.action==='get') return Response.json(session.role==='admin'&&b.version===row.version?{version:row.version,unchanged:true}:view(row,session),{headers});
    if(typeof b.requestId!=='string'||b.requestId.length>100) fail(400,'requestId required');
    for(let attempt=0;attempt<5;attempt++) {
      if(row.requests.some(x=>x.id===b.requestId)) return Response.json({...view(row,session),result:row.requests.find(x=>x.id===b.requestId).result},{headers});
      let data=structuredClone(row.data),result=null;
      if(b.action==='save'||b.action==='initialize') {
        if(session.role!=='admin') fail(403,'管理者のみ操作できます');
        if(b.action==='initialize'&&data) fail(409,'共有データはすでに作成されています');
        if(b.action==='save'&&(!data||b.version!==row.version)) fail(409,'別の端末で更新されました。最新情報を確認してもう一度操作してください。');
        validate(b.data);
        // This collection is managed by explicit actions; older clients must not erase it.
        data=derived({...b.data,missionSuggestions:data?.missionSuggestions||[],prizeClaims:data?.prizeClaims||{},rankPrizeMonth:data?.rankPrizeMonth||rewardMonth(),rankPrizeHistory:data?.rankPrizeHistory||{}});
      } else if(b.action==='review_mission') {
        if(session.role!=='admin') fail(403,'管理者のみ操作できます');
        const proposal=data?.missionSuggestions?.find(x=>x.id===b.id);
        if(!proposal||proposal.status!=='検討中') fail(409,'この案はすでに処理済みか、見つかりません');
        if(!['accept','reject'].includes(b.decision)) fail(400,'採用または見送りを選んでください');
        if(b.decision==='accept') {
          if(typeof b.text!=='string'||!b.text.trim()||b.text.length>500) fail(400,'ミッションは1〜500文字で入力してください');
          if(!Number.isInteger(b.deadlineDays)||b.deadlineDays<1||b.deadlineDays>365) fail(400,'期限は1〜365日で指定してください');
          if(![null,'elementary','juniorHigh','highSchool'].includes(b.targetGroup)) fail(400,'対象学年を選んでください');
          const mission={id:uid(),text:b.text.trim(),deadlineDays:b.deadlineDays,targetGroup:b.targetGroup,proposalId:proposal.id};
          data.missions.push(mission);proposal.missionId=mission.id;proposal.adoptedText=mission.text;
          const rewardId=uid(),date=todayStr();
          data.draws.push({id:rewardId,studentId:proposal.studentId,missionId:mission.id,
            missionText:'[ミッション案採用] '+proposal.text,status:'承認済み',
            color:'#E8A93B',drawnAt:date,approvedAt:date,value:1,hidden:true,
            proposalReward:true,proposalId:proposal.id});
          proposal.rewardDrawId=rewardId;proposal.stampReward=1;
        }
        proposal.status=b.decision==='accept'?'採用':'見送り';proposal.resolvedAt=todayStr();
      } else {
        if(!data || session.role!=='student') fail(403,'生徒としてログインしてください');
        const id=session.student_id,student=data.students.find(s=>s.id===id);
        if(!student) fail(401,'生徒の登録が変更されました');
        if(b.action==='draw') {
          const missions=data.missions.filter(m=>isMissionEligible(m,student.grade));
          if(!missions.length) fail(400,'対象のミッションがありません');
          if(data.dailyPullLimit>0&&data.draws.filter(d=>d.studentId===id&&d.drawnAt===todayStr()&&!d.issuedByAdmin&&!d.hidden).length>=data.dailyPullLimit) fail(400,'今日のガチャ回数の上限です');
          const m=missions[Math.floor(Math.random()*missions.length)],date=todayStr();
          result={id:uid(),studentId:id,missionId:m.id,missionText:m.text,status:'進行中',color:randomCapsuleColor(),drawnAt:date,deadline:m.deadlineDays?addDays(date,m.deadlineDays):null,approvedAt:null};
          data.draws.push(result);
        } else if(b.action==='report') {
          const d=data.draws.find(d=>d.id===b.id&&d.studentId===id);
          if(!d||d.status!=='進行中') fail(409,'ミッションの状態が変わりました');
          d.status='承認待ち';
        } else if(b.action==='claim_prize') {
          if(typeof b.month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(b.month)||b.month>rewardMonth()) fail(400,'対象月を確認してください');
          if(!['rank','milestone'].includes(b.type)||typeof b.ref!=='string') fail(400,'景品を選んでください');
          if(b.type==='rank'&&b.month>=rewardMonth())fail(403,'ランキング景品は順位が確定した翌月から申請できます');
          const key=deliveryKey(id,b.month,b.type,b.ref);
          data.prizeClaims=data.prizeClaims||{};
          if(data.deliveries[key]) fail(409,'この景品は受け取り済みです');
          if(!data.prizeClaims[key]) {
            if(b.type==='milestone'&&!milestoneClaimOpen(b.month))fail(403,'スタンプ景品の申請期限は翌月10日までです');
            const choices=b.type==='rank'?(data.rankPrizeHistory?.[b.month]?.earned||[]):computeEarnedPrizes(data.draws,data.students,{},data.milestonePrizes,b.month);
            const earned=choices.find(e=>e.studentId===id&&e.type===b.type&&e.ref===b.ref);
            if(!earned) fail(403,'まだこの景品の条件を達成していません');
            data.prizeClaims[key]={...earned,month:b.month,requestedAt:new Date().toISOString()};
          }
        } else if(b.action==='suggest_mission') {
          if(typeof b.text!=='string'||!b.text.trim()||b.text.length>500) fail(400,'ミッション案は1〜500文字で入力してください');
          data.missionSuggestions=data.missionSuggestions||[];
          data.missionSuggestions.push({id:uid(),studentId:id,studentName:student.name,text:b.text.trim(),status:'検討中',createdAt:todayStr(),createdAtMs:Date.now(),resolvedAt:null});
        } else if(b.action==='suggest') {
          if(typeof b.text!=='string'||!b.text.trim()||b.text.length>500) fail(400,'景品名は1〜500文字で入力してください');
          data.prizeSuggestions.push({id:uid(),studentId:id,text:b.text.trim(),status:'検討中',createdAt:todayStr(),createdAtMs:Date.now(),resolvedAt:null});
        } else if(b.action==='seen') {
          const a=data.achievements.find(a=>a.id===b.id&&a.studentId===id);if(a)a.seen=true;
        } else fail(400,'操作が不明です');
        derived(data);
      }
      if(data.rankPrizeMonth!==rewardMonth()) {row=await settleRankMonths((await db('gg_state?id=eq.1'))[0]);continue;}
      const saved=await db('gg_state?id=eq.1&version=eq.'+row.version,'PATCH',{version:row.version+1,data,requests:[...row.requests,{id:b.requestId,result}].slice(-1000)});
      if(saved.length) return Response.json({...view(saved[0],session),result},{headers});
      row=await settleRankMonths((await db('gg_state?id=eq.1'))[0]);
    }
    fail(409,'他の端末が更新中です。もう一度操作してください。');
  } catch(e) {return Response.json({error:e.status?e.message:'処理できませんでした。再試行してください。'},{status:e.status||500,headers});}
}
Deno.serve(handler);
