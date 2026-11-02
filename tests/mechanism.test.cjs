const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const html=fs.readFileSync(require('path').join(__dirname,'../index.html'),'utf8');
let effect,refs=[],reduced=false,nextId=0;const frames=new Map();
const ctx=vm.createContext({Math,isNovemberSeason:()=>true,React:{createElement:(tag,props,...children)=>({tag,props:props||{},children})},
  useRef:()=>({current:refs.shift()}),useEffect:fn=>effect=fn,
  window:{matchMedia:()=>({matches:reduced})},requestAnimationFrame:fn=>{frames.set(++nextId,fn);return nextId},cancelAnimationFrame:id=>frames.delete(id)});
vm.runInContext(html.slice(html.indexOf('function NovemberHero('),html.indexOf('function LoginScreen(')),ctx);
const nodes=n=>Array.isArray(n)?n.flatMap(nodes):n&&typeof n==='object'?[n,...nodes(n.children)]:[];
for(const phase of ['idle','waiting','shaking','dropping','cracking','done']){
  const tree=ctx.NovemberHero({phase,onSkip:()=>{}});
  const dispensed=nodes(tree).filter(n=>n.props.className==='gg-november-capsule');
  assert.equal(dispensed.length,['dropping','cracking'].includes(phase)?1:0,'only one capsule is dispensed, after mixing');
}
const paths=[{},{ }].map(p=>({setAttribute:(k,v)=>p[k]=v,state:p}));const knob={style:{}};
refs=[{children:paths},knob];const mechanism=ctx.NovemberMechanism({phase:'shaking'});
assert.equal(nodes(mechanism).filter(n=>n.props.className?.includes('gg-selected-ball')).length,1,'exactly one capsule feeds into the outlet');
assert.ok(nodes(mechanism).filter(n=>n.props.className?.startsWith('gg-mix-ball')).length>1);
const cancel=effect();
function tick(time){const [id,fn]=frames.entries().next().value;frames.delete(id);fn(time);}
tick(0);const restPath=paths[0].state.d,restX=parseFloat(knob.style.left),restY=parseFloat(knob.style.top);
tick(450);assert.notEqual(paths[0].state.d,restPath);assert.ok(parseFloat(knob.style.left)>restX);
tick(900);assert.ok(parseFloat(knob.style.top)>restY,'the grip reaches the bottom half of its turn');
tick(1350);assert.ok(parseFloat(knob.style.left)<restX);
tick(1800);assert.ok(Math.abs(parseFloat(knob.style.left)-restX)<1e-8);assert.ok(Math.abs(parseFloat(knob.style.top)-restY)<1e-8);assert.equal(frames.size,0,'one turn finishes without another loop');cancel();
refs=[{children:paths},knob];ctx.NovemberMechanism({phase:'shaking'});const skip=effect();tick(0);assert.equal(frames.size,1);skip();assert.equal(frames.size,0,'skip/unmount cancels the handle loop');
reduced=true;refs=[{children:paths},knob];ctx.NovemberMechanism({phase:'shaking'});effect();assert.equal(frames.size,0,'reduced motion leaves the handle still');
console.log('PASS: exactly one outlet capsule, one feeder, full crank rotation and rest position, frame cleanup and reduced motion');
