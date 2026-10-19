import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const collections=['assistencia','promotores'];
const management=['administradores','gestores'];
const validId=value=>typeof value==='string'&&/^[A-Za-z0-9._-]{1,180}$/.test(value);
const email=value=>String(value||'').trim().toLowerCase();
const sameLink=(a,b)=>a?.profileCollection===b?.profileCollection&&a?.profileId===b?.profileId;
export function validateEntries(entries) {
 if(!Array.isArray(entries)||entries.length===0||entries.length>100)throw Error('O plano precisa conter de 1 a 100 vínculos revisados.');
 const uids=new Set(),profiles=new Set();
 for(const item of entries){
  if(!validId(item.uid)||!validId(item.profileId)||![...collections,...management].includes(item.profileCollection))throw Error('Identificador ou coleção inválida no plano.');
  const key=item.profileCollection+'/'+item.profileId;
  if(uids.has(item.uid)||profiles.has(key))throw Error('UID ou perfil duplicado no plano.');
  uids.add(item.uid);profiles.add(key);
 }
 return entries.map(({uid,profileCollection,profileId})=>({uid,profileCollection,profileId}));
}
function matches(user,profile) {
 const data=profile.data;
 // An explicit conflicting UID must never be silently replaced by an email match.
 if(data.authUid&&data.authUid!==user.uid)return false;
 const identity=data.authUid===user.uid||profile.id===user.uid||(!data.authUid&&email(data.email)&&email(data.email)===email(user.email));
 return Boolean(identity&&(!data.email||email(data.email)===email(user.email)));
}
export function discoverLinks(users,profiles,{includeManagement=false}={}) {
 const entries=[],conflicts=[],unmatched=[];
 for(const user of users.filter(u=>!u.disabled)){
  const candidates=profiles.filter(p=>(collections.includes(p.collection)||(includeManagement&&management.includes(p.collection)))
   && p.data.ativo!==false && p.data.permissoes?.acessoApp!==false
   && (!management.includes(p.collection)||p.data.ativo===true)&&matches(user,p));
  if(candidates.length>1){conflicts.push({uid:user.uid,profiles:candidates.map(p=>p.collection+'/'+p.id)});continue;}
  if(!candidates.length){unmatched.push(user.uid);continue;}
  entries.push({uid:user.uid,profileCollection:candidates[0].collection,profileId:candidates[0].id});
 }
 const claimed=new Map();for(const e of entries){const key=e.profileCollection+'/'+e.profileId;if(claimed.has(key))conflicts.push({profile:key,uids:[claimed.get(key),e.uid]});claimed.set(key,e.uid);}
 return {entries,conflicts,unmatched};
}
export async function applyLinks(entries,{getUser,transaction}) {
 const plan=validateEntries(entries);
 const users=new Map();for(const item of plan){const user=await getUser(item.uid);if(user.disabled)throw Error('Conta desativada: '+item.uid);users.set(item.uid,user);}
 return transaction(async tx=>{
  const pending=[];let existing=0;
  // Read every document before writing, so a conflict cannot partially apply the plan.
  for(const item of plan){
   const current=await tx.read('vinculos_auth/'+item.uid);
   const data=await tx.read(item.profileCollection+'/'+item.profileId);
   if(!data||!matches(users.get(item.uid),{id:item.profileId,data})||data.ativo===false||data.permissoes?.acessoApp===false
    ||(management.includes(item.profileCollection)&&data.ativo!==true))throw Error('Perfil inexistente, inativo ou identidade divergente: '+item.uid);
   if(current){if(!sameLink(current,item))throw Error('Vínculo existente divergente: '+item.uid);existing++;}
   else pending.push(item);
  }
  for(const item of pending)tx.create('vinculos_auth/'+item.uid,{profileCollection:item.profileCollection,profileId:item.profileId,version:1});
  return {created:pending.length,existing};
 });
}
async function main(){
 const args=process.argv.slice(2),option=name=>args.includes(name)?args[args.indexOf(name)+1]:undefined;
 const project=option('--project');if(!project)throw Error('Informe --project explicitamente. Nenhum projeto padrão é usado.');
 const applying=args.includes('--apply');
 if(applying&&option('--confirm-project')!==project)throw Error('Para gravar, repita o projeto em --confirm-project.');
 if(applying&&!option('--input'))throw Error('Use --input com o plano revisado; descoberta nunca grava vínculos automaticamente.');
 const {initializeApp,applicationDefault}=await import('firebase-admin/app');
 const {getAuth}=await import('firebase-admin/auth');const {getFirestore}=await import('firebase-admin/firestore');
 const app=initializeApp({credential:applicationDefault(),projectId:project}),auth=getAuth(app),db=getFirestore(app);
 if(applying){
  const input=JSON.parse(await readFile(option('--input'),'utf8'));if(input.projectId!==project||input.conflicts?.length)throw Error('Projeto divergente ou conflitos não resolvidos no plano.');
  const result=await applyLinks(input.entries,{getUser:uid=>auth.getUser(uid),transaction:fn=>db.runTransaction(tx=>fn({read:async path=>{const s=await tx.get(db.doc(path));return s.exists?s.data():null;},create:(path,data)=>tx.create(db.doc(path),data)}))});
  console.log(JSON.stringify({projectId:project,...result}));return;
 }
 const users=[];let nextPageToken;do{const page=await auth.listUsers(1000,nextPageToken);users.push(...page.users);nextPageToken=page.pageToken;}while(nextPageToken);
 const names=args.includes('--include-management')?[...collections,...management]:collections,profiles=[];
 for(const name of names){const snapshot=await db.collection(name).get();snapshot.forEach(s=>profiles.push({collection:name,id:s.id,data:s.data()}));}
 const plan={projectId:project,...discoverLinks(users,profiles,{includeManagement:args.includes('--include-management')})};
 if(option('--output'))await writeFile(option('--output'),JSON.stringify(plan,null,2)+'\n');
 console.log(JSON.stringify({projectId:project,mode:'diagnostico-sem-gravacoes',candidates:plan.entries.length,conflicts:plan.conflicts.length,unmatched:plan.unmatched.length}));
 if(plan.conflicts.length)process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});
