import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
const source = await readFile(new URL('../cloudflare/advance-media-api.js',import.meta.url),'utf8');
const env = { FIREBASE_API_KEY:'test', FIREBASE_PROJECT_ID:'test', R2_ACCOUNT_ID:'test',R2_BUCKET_NAME:'advance-app-media',R2_ACCESS_KEY_ID:'test-access',R2_SECRET_ACCESS_KEY:'test-secret' };
function setup({collection='promotores',id='ptv_01',active=true,allowed=true}={}) {
 const fetches=[];
 const context=vm.createContext({Response,Request,URL,TextEncoder,crypto:webcrypto,console,fetch:async(url,options={})=>{
  fetches.push({url,options});
  if(url.includes('identitytoolkit')) return Response.json({users:[{localId:'uid-123',email:'person@example.com'}]});
  if(url.includes('/atividades/')) return Response.json({fields:{ptvId:{stringValue:id},status:{stringValue:'Concluída'}}});
  if(url.endsWith(':runQuery')) {
   const body=JSON.parse(options.body),kind=body.structuredQuery.from[0].collectionId;
   return Response.json(kind===collection ? [{document:{name:'projects/test/databases/(default)/documents/'+collection+'/'+id,fields:{ativo:{booleanValue:active},permissoes:{mapValue:{fields:{acessoApp:{booleanValue:allowed}}}}}}}] : []);
  }
  return new Response(null,{status:404});
 }});
 vm.runInContext(source.replace('export default {','globalThis.worker = {')+'\nglobalThis.xmlValueForTest = xmlValue;',context);
 return {worker:context.worker,fetches,xml:context.xmlValueForTest};
}
const request=(body={},token=true,path='/v1/profile/photo-url')=>new Request('https://worker.test'+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer test-token'}:{})},body:JSON.stringify(body)});
test('profile photo signs only the authenticated promoter PNG, ignoring arbitrary paths from client',async()=> {
 const s=setup(),r=await s.worker.fetch(request({id:'someone-else',key:'v1/activities/private/media/original'}),env);
 assert.equal(r.status,200);const data=await r.json(); assert.equal(data.key,'v1/perfis/promotores/ptv_01.png');
 const url=new URL(data.url);assert.equal(url.pathname,'/advance-app-media/v1/perfis/promotores/ptv_01.png');
 assert.equal(url.searchParams.get('X-Amz-Expires'),'300');assert.match(url.searchParams.get('X-Amz-Date'),/^\d{8}T\d{6}Z$/);assert.match(url.searchParams.get('X-Amz-Signature'),/^[a-f0-9]{64}$/);
});
test('assistant photo uses the assistance collection ID',async()=> {
 const r=await setup({collection:'assistencia',id:'at_02'}).worker.fetch(request(),env);
 assert.equal((await r.json()).key,'v1/perfis/assistencia/at_02.png');
});
test('profile photo requires authentication and an enabled field profile',async()=> {
 const s=setup();assert.equal((await s.worker.fetch(request({},false),env)).status,401);assert.equal(s.fetches.length,0);
 for(const opts of [{active:false},{allowed:false},{collection:'administradores'},{id:'invalid id'}]) assert.equal((await setup(opts).worker.fetch(request(),env)).status,403);
});
test('existing report media endpoint keeps its activity-scoped path and signing',async()=> {
 const r=await setup().worker.fetch(request({activityId:'visit_01',mediaId:'photo_01'},true,'/v1/media/read-url'),env);
 assert.equal(r.status,200);assert.equal((await r.json()).key,'v1/activities/visit_01/media/photo_01/original');
});
test('normalizing uploaded markdown preserves XML entities and existing health/CORS',async()=> {
 const s=setup();assert.equal(s.xml('<Key>a&amp;b&lt;c&gt;&quot;d&#39;</Key>','Key'),'a&b<c>"d\'');
 const r=await s.worker.fetch(new Request('https://worker.test/health'),env);
 assert.equal((await r.json()).ok,true); assert.equal(r.headers.get('Access-Control-Allow-Origin'),'*');
});
