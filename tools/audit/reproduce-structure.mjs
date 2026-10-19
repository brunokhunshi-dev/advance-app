// EST-02/04 retired after fixes; see tests/stabilization-state.test.mjs.
// Diagnostic replays for the structural audit, NOT tests that define desired behavior.
// Assertions describe the observed defects on the audited commit. Retire each replay
// when its defect is fixed and replace it with a regression test for correct behavior.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {CommercialReport} from '../../src/ui/commercial-report.js';
import {createMediaUrlCache} from '../../src/services/media-url-cache.js';
import {createCnpjLookup} from '../../src/data/cnpj-lookup.js';
import * as reports from '../../src/domain/reports.js';
const source=readFileSync(new URL('../../script.js',import.meta.url),'utf8');
const observations=[];
const record=(id,observed)=>observations.push({id,observed});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};

// The actual controller's module action does not call its injected persistence.
{
 let persisted=0,rendered=0;
 const controller=Object.assign(Object.create(CommercialReport.prototype),{key:'a',page:'free',data:{text:'rascunho'},reviewCallbacks:{persist:async()=>persisted++},render:()=>rendered++});
 controller.click({target:{closest:()=>({dataset:{action:'module-done'}})}});
 assert.equal(persisted,0);assert.equal(controller.page,'overview');assert.equal(rendered,1);
 record('EST-01',{moduleDonePersists:false,page:controller.page});
}

// Generation checks discard old UI answers but do not deduplicate in-flight reads.
{
 const pending=[],el=()=>({classList:{add(){},remove(){}},setAttribute(){},removeAttribute(){},replaceChildren(){},querySelector:()=>({addEventListener(){}}),innerHTML:'',hidden:false});
 const elements=new Map();let calls=0;
 const ctx=vm.createContext({Promise,Date,idUsuarioLogado:'p1',sequenciaPendentes:0,sessaoAtual:()=>({id:'p1'}),sessaoValida:()=>true,
  document:{getElementById:id=>{if(!elements.has(id))elements.set(id,el());return elements.get(id);}},homeCalendar:{setActivities(){}},homeVisitMap:{clear(){},update(){},ready:Promise.resolve()},
  homeLoadingMarkup:()=>'',loadingMarkup:()=>'',db:{},collection(){},where(){},query(){},tempoData:()=>0,
  getDocs:()=>{calls++;const d=deferred();pending.push(d);return d.promise;},renderizarProximasVisitasInicio:async()=>{},limparEstadoVisita(){},informarErro(){},
 });
 vm.runInContext(source.slice(source.indexOf('async function carregarAtividadesPendentes()'),source.indexOf('async function renderizarProximasVisitasInicio(')),ctx);
 const tasks=Array.from({length:6},()=>ctx.carregarAtividadesPendentes());assert.equal(calls,6);
 pending.forEach(d=>d.resolve({docs:[]}));await Promise.all(tasks);
 record('EST-03',{concurrentNavigationRequests:6,firestoreReadsStarted:calls});
}

// A hung authorization from a previous session prevents the next session's queue from flushing.
{
 const jobs=[],wait=deferred();let requests=0;
 const cache=createMediaUrlCache({schedule:fn=>jobs.push(fn),request:async(_,body)=>{requests++;if(requests===1)return wait.promise;return {items:body.items.map(item=>({...item,url:'https://test.local/new'})),expiresIn:300};}});
 const old=cache.read('a1','m1').catch(()=>null);const flushing=jobs.shift()();await Promise.resolve();
 cache.clear();let done=false;const next=cache.read('a2','m2').then(()=>{done=true;});await jobs.shift()();await Promise.resolve();
 assert.equal(requests,1);assert.equal(done,false);record('EST-05',{newSessionWaitsForOldTransport:true,requestsWhileOldIsPending:requests});
 wait.resolve({items:[],expiresIn:300});await flushing;await next;await old;
}

// A failed first CNPJ lookup followed by empty responses is converted into 'not found'.
{
 let calls=0;const warn=console.warn;console.warn=()=>{};
 try{const lookup=createCnpjLookup(async()=>{if(++calls===1)throw Object.assign(Error('Quota exceeded'),{code:'resource-exhausted'});return {empty:true,docs:[]};});
 const result=await lookup('44472602000117');assert.equal(result.empty,true);assert.equal(calls,3);record('EST-06',{firstReadFailed:true,returnedAsNotFound:result.empty,queries:calls});
 }finally{console.warn=warn;}
}

if(process.argv.includes('--firestore')){
 assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8080','Only the local emulator is allowed');
 const {initializeTestEnvironment}=await import('@firebase/rules-unit-testing');
 const {doc,getDoc,getDocs,setDoc,query,where,collection,runTransaction,Timestamp,writeBatch}=await import('firebase/firestore');
 const env=await initializeTestEnvironment({projectId:'demo-advance-v011',firestore:{host:'127.0.0.1',port:8080,rules:readFileSync(new URL('../../firestore.rules',import.meta.url),'utf8')}});
 try{
  await env.clearFirestore();const stamp=()=>Timestamp.now();const base={ptvId:'p1',clienteId:'c1',tipo:'Visita',tipoVisita:'Visita comercial',status:'Pendente',nota:'',data:stamp(),criadoEm:stamp(),atualizadoEm:stamp()};
  await env.withSecurityRulesDisabled(async c=>{const d=c.firestore(),b=writeBatch(d);for(const[p,data]of Object.entries({'vinculos_auth/u1':{profileCollection:'promotores',profileId:'p1'},'promotores/p1':{ativo:true,email:'one@example.test'},'clientes/c1':{status:'Ativo'},'atividades/a1':base,'atividades/a2':base}))b.set(doc(d,p),data);await b.commit();});
  const a=env.authenticatedContext('u1',{email:'one@example.test'}).firestore(),b=env.authenticatedContext('u1',{email:'one@example.test'}).firestore();
  const open=d=>getDocs(query(collection(d,'atividades'),where('ptvId','==','p1'),where('status','==','Em andamento')));
  assert.equal((await open(a)).size,0);assert.equal((await open(b)).size,0);
  await Promise.all([[a,'a1'],[b,'a2']].map(([d,id])=>runTransaction(d,async tx=>{const r=doc(d,'atividades',id);await tx.get(r);tx.update(r,{status:'Em andamento',checkinDataHora:stamp(),checkinGps:'-23,-47',checkinGpsAccuracy:20,checkinEndereco:'Rua',atualizadoEm:stamp()});})));
  const active=(await open(a)).size;assert.equal(active,2);record('EST-07',{sameAccountActiveVisits:active});
  const data={versao:1,...CommercialReport.prototype.blankData()};
  const report={id:'r1',atividadeId:'a1',ptvId:'p1',clienteId:'c1',tipoVisita:'Visita comercial',criadoEm:stamp(),textoAtual:'',dadosComerciais:data};
  await env.withSecurityRulesDisabled(async c=>{const d=c.firestore();await setDoc(doc(d,'relatorios_comerciais/r1'),report);await setDoc(doc(d,'atividades/a1'),{...base,status:'Em andamento',relatorioId:'r1',relatorioColecao:'relatorios_comerciais'});});
  const missing=reports.modulosComerciaisPendentes(report);assert.ok(missing.length>0);
  const batch=writeBatch(a),out={checkoutDataHora:stamp(),checkoutGps:'-23,-47',checkoutGpsAccuracy:20};batch.update(doc(a,'atividades/a1'),{...out,status:'Concluída'});batch.update(doc(a,'relatorios_comerciais/r1'),out);await batch.commit();
  assert.equal((await getDoc(doc(a,'atividades/a1'))).data().status,'Concluída');record('EST-08',{missingRequiredModules:missing,databaseAllowedCheckout:true});
 }finally{await env.cleanup();}
}
console.log(JSON.stringify({purpose:'Observed structural audit defects; not release acceptance tests',observations},null,2));
