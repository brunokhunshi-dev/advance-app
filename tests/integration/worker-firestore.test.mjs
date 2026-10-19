import {before,after,beforeEach,afterEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {once} from 'node:events';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,updateDoc,writeBatch,runTransaction,Timestamp,collection,query,where,getDocs,deleteDoc} from 'firebase/firestore';
import {configureMediaApi,mediaStore} from '../../technical-report-editor.js';
import {persistCommercialMedia} from '../../src/services/commercial-save.js';
import {resolveFieldProfile} from '../../src/data/auth-profile.js';
const PROJECT='demo-advance-v011',AUTH='http://127.0.0.1:9099',FIRESTORE='http://127.0.0.1:8080';
const nativeFetch=globalThis.fetch,workerSource=readFileSync('cloudflare/advance-media-api.js','utf8');
let env,server,r2Origin,objects,calls,state,user,other,client;
const timestamp=()=>Timestamp.now();
async function signup(email){
 const r=await nativeFetch(AUTH+'/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:'local-test-only-123',returnSecureToken:true})});
 const d=await r.json();assert.equal(r.status,200,JSON.stringify(d));
 const claims=JSON.parse(Buffer.from(d.idToken.split('.')[1],'base64url'));
 assert.equal(claims.aud,PROJECT,'Never use tokens from a real project in this test');
 return {uid:d.localId,email,idToken:d.idToken};
}
async function seed(data){await env.withSecurityRulesDisabled(async c=>{const b=writeBatch(c.firestore());for(const[p,d]of Object.entries(data))b.set(doc(c.firestore(),p),d);await b.commit();});}
const activity=()=>({tipo:'Visita',data:Timestamp.fromMillis(Date.now()+3600000),ptvId:'p1',clienteId:'c1',tipoVisita:'Visita comercial',nota:'',status:'Pendente',criadoEm:timestamp(),atualizadoEm:timestamp()});
function workerHarness(){
 const workerEnv={FIREBASE_API_KEY:'fake-key',FIREBASE_PROJECT_ID:PROJECT,R2_ACCOUNT_ID:'local-test',R2_BUCKET_NAME:'test-media',R2_ACCESS_KEY_ID:'fake',R2_SECRET_ACCESS_KEY:'fake-local-secret',
  AUTH_RATE_LIMITER:{limit:async()=>({success:true})},MEDIA_RATE_LIMITER:{limit:async()=>({success:!state.blocked})}};
 const context=vm.createContext({Request,Response,URL,TextEncoder,Date,console,crypto:webcrypto,fetch:async(input,options={})=>{
  const u=new URL(input);calls.push({url:u.href,method:options.method||'GET'});
  if(u.hostname==='identitytoolkit.googleapis.com')return nativeFetch(AUTH+'/identitytoolkit.googleapis.com'+u.pathname+u.search,options);
  if(u.hostname==='firestore.googleapis.com'){
   assert.ok(u.pathname.startsWith('/v1/projects/'+PROJECT+'/'),'Unexpected project');
   return nativeFetch(FIRESTORE+u.pathname+u.search,options);
  }
  if(u.hostname==='local-test.r2.cloudflarestorage.com')return nativeFetch(r2Origin+u.pathname+u.search,options);
  throw Error('External request refused: '+u.origin);
 }});
 vm.runInContext(workerSource.replace('export default {','globalThis.worker = {'),context);
 const request=async(path,body={},who=user)=>context.worker.fetch(new Request('https://worker.test'+path,{method:'POST',headers:{Authorization:'Bearer '+who.idToken,'Content-Type':'application/json','CF-Connecting-IP':'127.0.0.1'},body:JSON.stringify(body)}),workerEnv);
 return {request};
}
let harness;
const reads=()=>calls.filter(c=>c.url.startsWith('https://firestore.googleapis.com')).length;
async function checkin(){await runTransaction(client,async tx=>{const ref=doc(client,'atividades/a1');const s=await tx.get(ref);assert.equal(s.data().status,'Pendente');tx.update(ref,{status:'Em andamento',checkinDataHora:timestamp(),checkinGps:'-23,-47',checkinGpsAccuracy:20,checkinEndereco:'Rua fictícia',atualizadoEm:timestamp()});});}
async function save(prepared,type='Visita comercial',col='relatorios_comerciais'){
 return runTransaction(client,async tx=>{
  const ref=doc(client,'atividades/a1');const snap=await tx.get(ref);const reportRef=doc(client,col+'/r1');await tx.get(reportRef);
  const report={id:'r1',atividadeId:'a1',clienteId:'c1',ptvId:'p1',tipoVisita:type,criadoEm:timestamp(),atualizadoEm:timestamp(),textoAtual:prepared.text||'',conteudoRelatorio:{versao:1,blocos:prepared.blocks||[]},dadosComerciais:prepared};
  assert.equal(snap.data().status,'Em andamento');tx.set(reportRef,report);tx.update(ref,{relatorioId:'r1',relatorioColecao:col,atualizadoEm:timestamp()});return report;
 });
}
const photoData=()=>({text:'Relatório sintético',photos:[{kind:'media',id:'photo_1',type:'image/webp',name:'teste.webp',storage:'pending'}],blocks:[]});
function stagePhoto(){mediaStore.stage('photo_1',new File(['local-image-bytes'],'teste.webp',{type:'image/webp'}));}
before(async()=>{
 env=await initializeTestEnvironment({projectId:PROJECT,firestore:{host:'127.0.0.1',port:8080,rules:readFileSync('firestore.rules','utf8')}});
 server=createServer(async(req,res)=>{
  const u=new URL(req.url,'http://localhost');
  // This only emulates storage transport/cleanup, not AWS signature verification or Cloudflare CORS.
  if(!u.searchParams.has('X-Amz-Signature')){res.writeHead(403);res.end();return;}
  const key=u.pathname;
  if(req.method==='PUT'){
   if(state.failUpload){res.writeHead(503);res.end();return;}
   const chunks=[];for await(const chunk of req)chunks.push(chunk);objects.set(key,Buffer.concat(chunks));res.writeHead(200);res.end();return;
  }
  if(req.method==='DELETE'){objects.delete(key);res.writeHead(204);res.end();return;}
  if(req.method==='GET'&&objects.has(key)){res.writeHead(200,{'Content-Type':'image/webp'});res.end(objects.get(key));return;}
  res.writeHead(404);res.end();
 });server.listen(0,'127.0.0.1');await once(server,'listening');r2Origin='http://127.0.0.1:'+server.address().port;
});
after(async()=>{globalThis.fetch=nativeFetch;await env?.cleanup();if(server)await new Promise(resolve=>server.close(resolve));});
beforeEach(async()=>{
 globalThis.fetch=nativeFetch;await env.clearFirestore();await nativeFetch(AUTH+'/emulator/v1/projects/'+PROJECT+'/accounts',{method:'DELETE'});
 objects=new Map();calls=[];state={blocked:false,failUpload:false};user=await signup('promoter@example.test');other=await signup('other@example.test');
 client=env.authenticatedContext(user.uid,{email:user.email}).firestore();
 await seed({['vinculos_auth/'+user.uid]:{profileCollection:'promotores',profileId:'p1'},['vinculos_auth/'+other.uid]:{profileCollection:'assistencia',profileId:'p2'},'promotores/p1':{email:user.email,ativo:true,permissoes:{}},'assistencia/p2':{email:other.email,ativo:true,permissoes:{}},'clientes/c1':{nome:'Cliente sintético',status:'Ativo'},'atividades/a1':activity()});
 harness=workerHarness();configureMediaApi({baseUrl:'https://worker.test',getIdToken:async()=>user.idToken});
 globalThis.fetch=async(input,options={})=>{
  const u=new URL(typeof input==='string'?input:input.url);
  if(u.origin==='https://worker.test')return harness.request(u.pathname,JSON.parse(options.body||'{}'));
  if(u.hostname==='local-test.r2.cloudflarestorage.com')return nativeFetch(r2Origin+u.pathname+u.search,options);
  if(u.origin===AUTH||u.origin===FIRESTORE)return nativeFetch(input,options);
  throw Error('External frontend request refused: '+u.origin);
 };
});
afterEach(()=>{globalThis.fetch=nativeFetch;mediaStore.clearLocal('photo_1');});
test('real Auth token, UID profile, check-in, photo upload, report, checkout, history and signed read work together',async()=>{
 const profile=await resolveFieldProfile(user.uid,async(c,id)=>{const s=await getDoc(doc(client,c,id));return s.exists()?s.data():null;});assert.equal(profile.id,'p1');
 await checkin();stagePhoto();const saved=await persistCommercialMedia({activityId:'a1',data:photoData(),base:{},media:mediaStore,commit:prepared=>save(prepared)});
 assert.equal(objects.size,1);assert.equal(mediaStore.local('photo_1'),null);assert.equal(saved.result.atividadeId,'a1');
 let start=reads();const url=await mediaStore.readUrl('a1','photo_1');assert.equal(reads()-start,3);assert.equal((await(await globalThis.fetch(url)).text()),'local-image-bytes');
 start=reads();await Promise.all(Array.from({length:20},()=>mediaStore.readUrl('a1','photo_1')));assert.equal(reads(),start,'cached reads must not call Worker/Firestore again');
 const out={checkoutDataHora:timestamp(),checkoutGps:'-23,-47',checkoutGpsAccuracy:20,checkoutEndereco:'Rua fictícia',atualizadoEm:timestamp()};
 const b=writeBatch(client);b.update(doc(client,'atividades/a1'),{...out,status:'Concluída'});b.update(doc(client,'relatorios_comerciais/r1'),out);await b.commit();
 const history=await getDocs(query(collection(client,'atividades'),where('ptvId','==','p1'),where('status','==','Concluída')));assert.equal(history.size,1);
 const signed=await harness.request('/v1/media/read-url',{activityId:'a1',mediaId:'photo_1'});assert.equal(signed.status,200);
 assert.equal((await harness.request('/v1/media/upload-url',{activityId:'a1',mediaId:'new',contentType:'image/webp',size:50})).status,409);
});
test('metadata rejection cleans uploaded object and keeps local photo available for retry',async()=>{
 await checkin();stagePhoto();await assert.rejects(persistCommercialMedia({activityId:'a1',data:photoData(),base:{},media:mediaStore,commit:async()=>{
  await setDoc(doc(client,'relatorios_comerciais/r1'),{id:'r1',atividadeId:'a1',clienteId:'c1',ptvId:'another',tipoVisita:'Visita comercial',criadoEm:timestamp()});
 }}));
 assert.equal(objects.size,0);assert.ok(mediaStore.local('photo_1'));assert.equal((await getDoc(doc(client,'atividades/a1'))).data().relatorioId,undefined);
});
test('upload transport failure keeps local photo and creates no report or R2 object',async()=>{
 await checkin();stagePhoto();state.failUpload=true;await assert.rejects(persistCommercialMedia({activityId:'a1',data:photoData(),base:{},media:mediaStore,commit:prepared=>save(prepared)}));
 assert.equal(objects.size,0);assert.ok(mediaStore.local('photo_1'));assert.equal((await getDoc(doc(client,'atividades/a1'))).data().relatorioId,undefined);
});
test('another signed-in user cannot read activity media or rewrite the UID link',async()=>{
 const r=await harness.request('/v1/media/read-url',{activityId:'a1',mediaId:'photo_1'},other);assert.equal(r.status,403);
 const d=env.authenticatedContext(other.uid,{email:other.email}).firestore();await assertFails(updateDoc(doc(d,'vinculos_auth/'+other.uid),{profileId:'p1',profileCollection:'promotores'}));
});
test('revocation and server limiting stop new authorizations before unsafe access',async()=>{
 assert.equal((await harness.request('/v1/profile/photo-url')).status,200);await seed({'promotores/p1':{email:user.email,ativo:false}});assert.equal((await harness.request('/v1/profile/photo-url')).status,403);
 state.blocked=true;const start=reads(),r=await harness.request('/v1/media/read-urls',{items:[{activityId:'a1',mediaId:'photo_1'}]});assert.equal(r.status,429);assert.equal(reads(),start);
});

test('20 distinct signed images share the real UID/profile/activity authorization',async()=>{
 const start=reads(),r=await harness.request('/v1/media/read-urls',{items:Array.from({length:20},(_,i)=>({activityId:'a1',mediaId:'photo_'+i,variant:'original'}))});
 assert.equal(r.status,200);assert.equal((await r.json()).items.length,20);assert.equal(reads()-start,3);
});
test('migration CLI discovers without writes, provisions using emulators, and is idempotent',async()=>{
 assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8080');
 assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST,'127.0.0.1:9099');
 await env.withSecurityRulesDisabled(async c=>deleteDoc(doc(c.firestore(),'vinculos_auth/'+user.uid)));
 const directory=mkdtempSync(join(tmpdir(),'advance-links-')),plan=join(directory,'plan.json');
 const run=args=>{const r=spawnSync(process.execPath,['tools/auth-links.mjs','--project',PROJECT,...args],{encoding:'utf8',env:process.env,timeout:30000});assert.equal(r.status,0,r.stderr||r.stdout);return JSON.parse(r.stdout.trim());};
 try{
  const discovery=run(['--output',plan]);assert.equal(discovery.mode,'diagnostico-sem-gravacoes');assert.equal(discovery.candidates,2);
  assert.equal((await getDoc(doc(client,'vinculos_auth/'+user.uid))).exists(),false);
  assert.deepEqual(run(['--input',plan,'--apply','--confirm-project',PROJECT]),{projectId:PROJECT,created:1,existing:1});
  assert.deepEqual(run(['--input',plan,'--apply','--confirm-project',PROJECT]),{projectId:PROJECT,created:0,existing:2});
  assert.equal((await harness.request('/v1/profile/photo-url')).status,200);
 }finally{rmSync(directory,{recursive:true,force:true});}
});
