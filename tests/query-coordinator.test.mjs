import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createQueryCoordinator} from '../src/services/query-coordinator.js';
import {createCnpjLookup} from '../src/data/cnpj-lookup.js';
const source=readFileSync(new URL('../script.js',import.meta.url),'utf8');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function excerpt(start,end){const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a);return source.slice(a,b);}

test('concurrent reads share transport; settled reads refresh rather than reuse snapshots',async()=>{
 const queries=createQueryCoordinator(),pending=deferred();let calls=0;
 const tasks=Array.from({length:6},()=>queries.run('session:open',()=>{calls++;return pending.promise;}));
 await tick();assert.equal(calls,1);pending.resolve('snapshot');assert.deepEqual(await Promise.all(tasks),Array(6).fill('snapshot'));
 assert.equal(await queries.run('session:open',()=>++calls),2);
});
test('quota prevents new reads across keys for one minute, then permits recovery',async()=>{
 let time=0,calls=0;const queries=createQueryCoordinator({now:()=>time});const error=Object.assign(Error('Quota exceeded'),{code:'firestore/resource-exhausted'});
 await assert.rejects(queries.run('home',()=>{calls++;throw error;}),e=>e===error);
 await assert.rejects(queries.run('history',()=>{calls++;}),e=>e===error);assert.equal(calls,1);
 time=60000;assert.equal(await queries.run('home',()=>++calls),2);
});
test('old-session failure cannot block new session or remove its in-flight request',async()=>{
 const queries=createQueryCoordinator(),old=deferred(),current=deferred();let calls=0;
 const first=queries.run('same-key',()=>old.promise).catch(()=>null);await tick();queries.clear();
 const next=queries.run('same-key',()=>{calls++;return current.promise;});await tick();
 old.reject(Object.assign(Error('Quota exceeded'),{code:'resource-exhausted'}));await first;
 assert.equal(queries.run('same-key',()=>{throw Error('duplicate');}),next);
 current.resolve('new');assert.equal(await next,'new');assert.equal(calls,1);
});
test('non-quota failures release request without a global cooldown',async()=>{
 const queries=createQueryCoordinator();await assert.rejects(queries.run('x',()=>{throw Error('offline');}),/offline/);
 assert.equal(await queries.run('x',()=>42),42);
});

test('CNPJ quota/permission/network failures stop without querying legacy variants',async()=>{
 for(const code of ['resource-exhausted','firestore/permission-denied','unavailable','unauthenticated']){
  let calls=0;const error=Object.assign(Error(code),{code});const lookup=createCnpjLookup(async()=>{calls++;throw error;});
  await assert.rejects(lookup('44472602000117'),e=>e===error);assert.equal(calls,1);
 }
});
test('partial CNPJ lookup failure cannot become not-found even if other variants are empty',async t=>{
 const previous=console.warn;console.warn=()=>{};t.after(()=>{console.warn=previous;});let calls=0;
 const error=Error('unsupported format');const lookup=createCnpjLookup(async()=>{if(++calls===1)throw error;return {empty:true};});
 await assert.rejects(lookup('44472602000117'),e=>e===error);assert.equal(calls,3);
});

// Execute the real home loader to ensure the coordinator is wired into the controller.
test('six concurrent home entries initiate one Firestore query',async()=>{
 const queries=createQueryCoordinator(),pending=deferred();let calls=0;
 const el=()=>({classList:{add(){},remove(){}},setAttribute(){},removeAttribute(){},replaceChildren(){},querySelector:()=>({addEventListener(){}}),innerHTML:'',hidden:false});const elements=new Map();
 const ctx=vm.createContext({Promise,Date,idUsuarioLogado:'p1',sequenciaPendentes:0,sessaoAtual:()=>({id:'p1',uid:'u1',versao:1}),sessaoValida:()=>true,
  consultarNaSessao:(s,k,load)=>queries.run(k,load),document:{getElementById:id=>{if(!elements.has(id))elements.set(id,el());return elements.get(id);}},homeCalendar:{setActivities(){}},homeVisitMap:{clear(){},update(){},ready:Promise.resolve()},
  homeLoadingMarkup:()=>'',loadingMarkup:()=>'',db:{},collection(){},where(){},query(){},tempoData:()=>0,getDocs:()=>{calls++;return pending.promise;},renderizarProximasVisitasInicio:async()=>{},limparEstadoVisita(){},informarErro:(_,e)=>{throw e;}
 });
 vm.runInContext(excerpt('async function carregarAtividadesPendentes()','async function renderizarProximasVisitasInicio('),ctx);
 const tasks=Array.from({length:6},()=>ctx.carregarAtividadesPendentes());await tick();assert.equal(calls,1);pending.resolve({docs:[]});await Promise.all(tasks);
});
