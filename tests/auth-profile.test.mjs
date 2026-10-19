import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveFieldProfile} from '../src/data/auth-profile.js';
import {discoverLinks,applyLinks} from '../tools/auth-links.mjs';
test('field login resolves exactly two documents without email queries',async()=>{
 const reads=[];const p=await resolveFieldProfile('uid',async(c,id)=>{reads.push([c,id]);return c==='vinculos_auth'?{profileCollection:'promotores',profileId:'p1'}:{nome:'Pessoa',ativo:true};});
 assert.equal(p.id,'p1');assert.equal(p.tipo,'Promotor');assert.deepEqual(reads,[['vinculos_auth','uid'],['promotores','p1']]);
});
test('missing mapping, invalid collections, revoked access and changed sessions block login',async()=>{
 for(const link of [null,{profileCollection:'gestores',profileId:'p1'},{profileCollection:'promotores',profileId:'invalid/id'}])await assert.rejects(resolveFieldProfile('u',async()=>link));
 for(const profile of [null,{ativo:false},{permissoes:{acessoApp:false}}])await assert.rejects(resolveFieldProfile('u',async c=>c==='vinculos_auth'?{profileCollection:'assistencia',profileId:'p1'}:profile));
 let count=0;await assert.rejects(resolveFieldProfile('u',async()=>({profileCollection:'promotores',profileId:'p1'}),()=>{if(++count)throw Error('session changed');}),/session changed/);
});
const users=[{uid:'u1',email:'one@example.com'},{uid:'u2',email:'two@example.com'}];
const profiles=[{collection:'promotores',id:'p1',data:{email:'one@example.com',ativo:true,cargo:'Gerente'}},{collection:'assistencia',id:'p2',data:{email:'two@example.com',authUid:'u2'}}];
test('discovery preserves existing IDs, does not infer management or choose ambiguous profiles',()=>{
 const p=discoverLinks(users,profiles);assert.equal(p.entries.length,2);assert.equal(p.entries[0].profileCollection,'promotores');
 const conflict=discoverLinks(users,[...profiles,{collection:'assistencia',id:'other',data:{email:'one@example.com'}}]);assert.equal(conflict.conflicts.length,1);assert.equal(conflict.entries.length,1);
 assert.equal(discoverLinks(users,[{...profiles[0],data:{email:'one@example.com',authUid:'wrong'}}]).entries.length,0);
});
test('management discovery is opt in and requires explicit activation',()=>{
 const p={collection:'gestores',id:'u1',data:{ativo:true}};assert.equal(discoverLinks(users,[p]).entries.length,0);assert.equal(discoverLinks(users,[p],{includeManagement:true}).entries.length,1);
 assert.equal(discoverLinks(users,[{...p,data:{}}],{includeManagement:true}).entries.length,0);
});
function adapter(seed={}){const data=new Map(Object.entries(seed)),writes=[];return{data,writes,getUser:async uid=>users.find(u=>u.uid===uid),transaction:async fn=>{const pending=[];const result=await fn({read:async p=>data.get(p),create:(p,d)=>pending.push([p,d])});for(const [p,d]of pending){data.set(p,d);writes.push(p);}return result;}};}
test('provisioning is idempotent, does not modify profiles, and refuses conflicting existing links atomically',async()=>{
 const plan=discoverLinks(users,profiles).entries,a=adapter(Object.fromEntries(profiles.map(p=>[p.collection+'/'+p.id,p.data])));
 assert.deepEqual(await applyLinks(plan,a),{created:2,existing:0});assert.deepEqual(await applyLinks(plan,a),{created:0,existing:2});assert.equal(a.writes.length,2);
 const b=adapter({'promotores/p1':profiles[0].data,'assistencia/p2':profiles[1].data,'vinculos_auth/u2':{profileCollection:'promotores',profileId:'other'}});
 await assert.rejects(applyLinks(plan,b),/divergente/);assert.equal(b.writes.length,0);
});
test('provisioning refuses duplicate UIDs, disabled accounts and changed profile identities',async()=>{
 const plan=discoverLinks(users,profiles).entries,a=adapter({'promotores/p1':{email:'hijacked@example.com'}});
 await assert.rejects(applyLinks([plan[0],plan[0]],a),/duplicado/);await assert.rejects(applyLinks([plan[0]],a),/identidade/);
 await assert.rejects(applyLinks([plan[0]],{...a,getUser:async()=>({...users[0],disabled:true})}),/desativada/);
});
