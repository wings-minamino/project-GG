const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),crypto=require('crypto'),path=require('path');
const root=path.resolve(__dirname,'..');
for(const [file,isAdmin] of [['index.html',false],['admin/index.html',true]]){
 const html=fs.readFileSync(path.join(root,file),'utf8');
 assert.ok(html.includes('const IS_ADMIN_PORTAL = '+isAdmin+';'));
 assert.ok(html.includes("const sessionKey = 'gacha-mission:session:'+PORTAL_ROLE"));
 assert.ok(html.includes('saved.role!==PORTAL_ROLE'));
 const policy=html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
 for(const [,s] of html.matchAll(/<script>([\s\S]*?)<\/script>/g))assert.ok(policy.includes(crypto.createHash('sha256').update(s).digest('base64')));
 const ctx=vm.createContext({IS_ADMIN_PORTAL:isAdmin,React:{createElement:(tag,props,...children)=>({tag,props:props||{},children})},styles:{},LOGO_DATA_URI:''});
 vm.runInContext(html.slice(html.indexOf('function LoginScreen('),html.indexOf('function StudentMissionView(')),ctx);
 const tree=vm.runInContext('LoginScreen({loginNumber:"",showAdminLogin:false,isMobile:false})',ctx);
 const nodes=[];function visit(n){if(!n||typeof n!=='object')return;nodes.push(n);n.children.flat().forEach(visit);}visit(tree);
 assert.equal(nodes.filter(n=>n.tag==='button').length,1);
 assert.equal(nodes.filter(n=>n.tag==='input'&&n.props.type==='password').length,isAdmin?1:0);
 if(isAdmin){assert.ok(html.includes('../icons/project-gg.png'));assert.ok(html.includes('../templates/student-import-template.xlsx'));}
 console.log('PASS:',file,'dedicated login, independent session, correct CSP and assets');
}
