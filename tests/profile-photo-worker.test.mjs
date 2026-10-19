import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const source=readFileSync(new URL('../cloudflare/advance-media-api.js',import.meta.url),'utf8');
const fields = data => Object.fromEntries(Object.entries(data).map(([k,v])=>[k,typeof v==='boolean'?{booleanValue:v}:typeof v==='string'?{stringValue:v}:{mapValue:{fields:fields(v)}}]));
function setup(options={}) {
 const state={collection:'promotores',id:'ptv_01',active:true,allowed:true,owner:'ptv_01',userLimit:true,authLimit:true,...options};
 const calls=[],limits=[];
 const env={FIREBASE_API_KEY:'test',FIREBASE_PROJECT_ID:'test',R2_ACCOUNT_ID:'test',R2_BUCKET_NAME:'advance-app-media',R2_ACCESS_KEY_ID:'test-access',R2_SECRET_ACCESS_KEY:'test-secret',
  AUTH_RATE_LIMITER:{limit:async({key})=>{limits.push(key);return{success:state.authLimit};}},
  MEDIA_RATE_LIMITER:{limit:async({key})=>{limits.push(key);return{success:state.userLimit};}}};
 const context=vm.createContext({Response,Request,URL,TextEncoder,Date,crypto:webcrypto,console,fetch:async(url,opts={})=>{
  calls.push({url,opts});
  if(url.includes('identitytoolkit'))return Response.json({users:[{localId:'uid-123',email:state.email||'person@example.com',customAttributes:JSON.stringify(state.claims||{})}]});
  if(state.quota)return Response.json({error:{status:'RESOURCE_EXHAUSTED'}},{status:429});
  if(url.endsWith('/vinculos_auth/uid-123'))return state.missingLink?new Response(null,{status:404}):Response.json({fields:fields({profileCollection:state.collection,profileId:state.id})});
  if(url.includes('/atividades/'))return Response.json({fields:fields({ptvId:url.endsWith('/other_visit')?'other':state.owner,status:state.status||'Concluída'})});
  if(url.endsWith('/'+state.collection+'/'+encodeURIComponent(state.id)))return Response.json({fields:fields({ativo:state.active,permissoes:{acessoApp:state.allowed},cargo:state.role||''})});
  throw Error('Unexpected fetch '+url);
 }});
 vm.runInContext(source.replace('export default {','globalThis.worker = {')+'\nglobalThis.xml=xmlValue;',context);
 const send=(body={},path='/v1/profile/photo-url',token=true)=>context.worker.fetch(new Request('https://worker.test'+path,{method:'POST',headers:{'Content-Type':'application/json','CF-Connecting-IP':'127.0.0.1',...(token?{Authorization:'Bearer test-token'}:{})},body:JSON.stringify(body)}),env);
 return {state,calls,limits,env,send,worker:context.worker,xml:context.xml,reads:()=>calls.filter(c=>c.url.includes('firestore.googleapis.com'))};
}
const items=(n=20,activityId='visit_01')=>Array.from({length:n},(_,i)=>({activityId,mediaId:'photo_'+i,variant:'original'}));
test('profile photo uses only protected UID mapping and signs the same field profile PNG',async()=>{
 const s=setup(),r=await s.send({id:'another',key:'arbitrary'});assert.equal(r.status,200);
 const d=await r.json();assert.equal(d.key,'v1/perfis/promotores/ptv_01.png');assert.equal(s.reads().length,2);
 const u=new URL(d.url);assert.equal(u.searchParams.get('X-Amz-Expires'),'300');assert.match(u.searchParams.get('X-Amz-Date'),/^\d{8}T\d{6}Z$/);assert.match(u.searchParams.get('X-Amz-Signature'),/^[a-f0-9]{64}$/);
 assert.deepEqual(s.limits,['auth:127.0.0.1','media:uid-123']);
});
test('assistant profile uses assistance collection',async()=>{const r=await setup({collection:'assistencia',id:'at_02'}).send();assert.equal((await r.json()).key,'v1/perfis/assistencia/at_02.png');});
test('authentication, mapping and current activation are required',async()=>{
 const s=setup();assert.equal((await s.send({},undefined,false)).status,401);assert.equal(s.calls.length,0);
 for(const opt of [{active:false},{allowed:false},{missingLink:true},{collection:'administradores'},{id:'invalid id'}])assert.equal((await setup(opt).send()).status,403);
});
test('20 originals in one activity cost three explicit Firestore reads and no email queries',async()=>{
 const s=setup(),r=await s.send({items:items()},'/v1/media/read-urls');assert.equal(r.status,200);assert.equal((await r.json()).items.length,20);
 assert.equal(s.reads().length,3);assert.equal(s.calls.filter(c=>c.url.endsWith(':runQuery')).length,0);
});
test('single media read costs three reads and keeps activity scoped path',async()=>{
 const s=setup(),r=await s.send({activityId:'visit_01',mediaId:'photo_01'},'/v1/media/read-url');assert.equal(r.status,200);assert.equal((await r.json()).key,'v1/activities/visit_01/media/photo_01/original');assert.equal(s.reads().length,3);
});
test('batch refuses another owner, more than 30 media or five activities',async()=>{
 assert.equal((await setup().send({items:[...items(1),...items(1,'other_visit')]},'/v1/media/read-urls')).status,403);
 for(const batch of [items(31),Array.from({length:6},(_,i)=>items(1,'visit_'+i)[0])]){
  const s=setup();assert.equal((await s.send({items:batch},'/v1/media/read-urls')).status,400);assert.equal(s.reads().length,0);
 }
});
test('neither job title, legacy privileged email nor claims grant management',async()=>{
 for(const opt of [{role:'Gerente'},{email:'eric.lima@advancetintas.com.br'},{claims:{admin:true}}]){
  const s=setup({...opt,owner:'other'});assert.equal((await s.send({items:items(1)},'/v1/media/read-urls')).status,403);
 }
 const manager=setup({collection:'gestores',id:'g1',owner:'other'});assert.equal((await manager.send({items:items(1)},'/v1/media/read-urls')).status,200);
});
test('profile revocation is checked again on next request, without caching permissions',async()=>{
 const s=setup();assert.equal((await s.send()).status,200);s.state.active=false;assert.equal((await s.send()).status,403);assert.equal(s.reads().length,4);
});
test('server limiter blocks before Firestore across routes; missing binding fails closed',async()=>{
 for(const path of ['/v1/profile/photo-url','/v1/media/read-url','/v1/media/read-urls','/v1/media/upload-url','/v1/media/delete','/v1/media/storage-stats']){
  const s=setup({userLimit:false}),r=await s.send({},path);assert.equal(r.status,429);assert.equal(r.headers.get('Retry-After'),'60');assert.equal(s.reads().length,0);
 }
 const s=setup();delete s.env.AUTH_RATE_LIMITER;assert.equal((await s.send()).status,503);assert.equal(s.calls.length,0);
});
test('pre-auth limiter blocks invalid-token floods without calling Auth or Firestore',async()=>{
 const s=setup({authLimit:false});assert.equal((await s.send()).status,429);assert.equal(s.calls.length,0);
});
test('quota failure aborts on first read and opens circuit for following requests',async()=>{
 const s=setup({quota:true});assert.equal((await s.send()).status,429);assert.equal(s.reads().length,1);
 const calls=s.calls.length;assert.equal((await s.send()).status,429);assert.equal(s.calls.length,calls);
});
test('health has version and XML object listing decoding remains correct',async()=>{
 const s=setup();assert.equal(s.xml('<Key>a&amp;b&lt;c&gt;&quot;d&#39;</Key>','Key'),'a&b<c>"d\'');
 const r=await s.worker.fetch(new Request('https://worker.test/health'),{});assert.equal((await r.json()).version,'0.1.1-rc.1');assert.equal(r.headers.get('Access-Control-Allow-Origin'),'*');
});
