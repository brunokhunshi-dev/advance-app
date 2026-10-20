import {initializeApp,getApps,getApp} from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js';
import {getAuth,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js';
import {getFirestore,collection,query,limit,getDocs} from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js';
import {firebaseConfig} from './firebase-config.js';

const app=getApps().length?getApp():initializeApp(firebaseConfig);
const auth=getAuth(app), db=getFirestore(app);
const $=id=>document.getElementById(id);
const collections=['promotores','assistencia','atividades','clientes','relatorios','relatorios_comerciais','relatorios_treinamentos','relatorios_assistencia_tecnica'];
let result=null, authorized=false;
const log=text=>{$('status').textContent=text;};
function type(v){if(v===null)return 'null';if(v?.toDate)return 'timestamp';if(v?.latitude!==undefined&&v?.longitude!==undefined)return 'geopoint';if(v?.path&&v?.id)return 'reference';if(Array.isArray(v))return 'array';return typeof v;}
function safeKey(key){return key.includes('@')||/^[0-9a-f-]{32,}$/i.test(key)?'[chave_dinamica]':key;}
function summarize(docs){
 const fields=new Map();
 for(const doc of docs){
  const present=new Map();
  function visit(obj,prefix='',depth=0){
   if(depth>6||!obj||typeof obj!=='object'||Array.isArray(obj))return;
   for(const [k,v] of Object.entries(obj)){
    const name=prefix+safeKey(k);
    if(!present.has(name))present.set(name,new Set());
    present.get(name).add(type(v));
    if(type(v)==='object')visit(v,name+'.',depth+1);
   }
  }
  visit(doc.data());
  for(const [field,types] of present){
   const stat=fields.get(field)||{present:0,types:{}};
   stat.present++;
   for(const t of types)stat.types[t]=(stat.types[t]||0)+1;
   fields.set(field,stat);
  }
 }
 return [...fields].sort(([a],[b])=>a.localeCompare(b)).map(([name,stat])=>({field:name,present:stat.present,types:stat.types}));
}
onAuthStateChanged(auth,async user=>{
 authorized=false;$('run').disabled=true;
 if(!user){$('session').textContent='Sem sessão Firebase. Faça login no Advance Check neste navegador e retorne.';return;}
 try{
  const snap=await getDocs(query(collection(db,'assistencia'),limit(100)));
  const profile=snap.docs.find(d=>d.data().email===user.email);
  if(!profile){$('session').textContent='Acesso negado: conta não cadastrada em assistencia.';return;}
  const p=profile.data();
  if(p.ativo===false||p.permissoes?.acessoApp===false){$('session').textContent='Acesso desativado.';return;}
  // A role deve ser explicitamente verificada; contas comuns não podem mapear o banco.
  const role=String(p.perfil||p.cargo||p.funcao||p.tipo||'').toLowerCase();
  if(!['admin','administrador','gestor'].includes(role)&&p.permissoes?.admin!==true&&p.permissoes?.gerenciarUsuarios!==true){
   $('session').textContent='Conta autenticada, mas sem permissão administrativa explícita.';return;
  }
  authorized=true;$('session').textContent='Administrador autenticado: '+user.email;$('run').disabled=false;
 }catch(e){$('session').textContent='Não foi possível validar perfil administrativo: '+e.code;}
});
$('run').addEventListener('click',async()=>{
 if(!authorized||!auth.currentUser)return;
 $('run').disabled=true;$('download').disabled=true;result=null;
 const output={generatedAt:new Date().toISOString(),projectId:firebaseConfig.projectId,sampleLimit:30,note:'Amostras, não totais. Não contém valores ou IDs de documentos.',collections:{}};
 try{
  for(const name of collections){
   log('Consultando '+name+'...');
   const snap=await getDocs(query(collection(db,name),limit(30)));
   output.collections[name]={sampled:snap.size,possiblyPartial:snap.size===30,fields:summarize(snap.docs)};
  }
  result=output;log('Concluído. '+collections.length+' coleções analisadas. Baixe o JSON.');$('download').disabled=false;
 }catch(e){log('Falha ao consultar '+(e.code||'Firestore')+'. Nenhum arquivo parcial será disponibilizado.');}
 finally{$('run').disabled=false;}
});
$('download').addEventListener('click',()=>{
 if(!result)return;
 const blob=new Blob([JSON.stringify(result,null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='intel-campo-matriz-firestore.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});