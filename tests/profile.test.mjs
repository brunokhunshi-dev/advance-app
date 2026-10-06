import test from 'node:test';
import assert from 'node:assert/strict';
import { profileStats, profileDuration, rankClients } from '../src/domain/profile.js';
const now = new Date(2026,9,6,12);
const at = (day,hour=12) => new Date(2026,9,day,hour);
const visit = (overrides={}) => ({ status:'Concluída', tipoVisita:'Visita comercial', data:at(5), checkinDataHora:at(5,10), checkoutDataHora:at(5,12), clienteId:'a', nomeCliente:'Loja A',cliente:{lat:-23,lng:-47},...overrides });
test('profile counts completed activities by normalized type and sums actual duration',()=> {
 const stats = profileStats([visit(),visit({tipoVisita:'Treinamento',clienteId:'b'}),visit({tipoVisita:'Assistencia tecnica',clienteId:'c'}),visit({status:'Cancelada'}),visit({status:'Em andamento'})],30,now);
 assert.equal(stats.total,3); assert.deepEqual(stats.counts,[1,1,1]); assert.deepEqual(stats.durations,[7200000,7200000,7200000]);
 assert.equal(stats.buckets.reduce((sum,b)=>sum+b.counts.reduce((a,b)=>a+b,0),0),3);
 assert.equal(stats.clients.length,3);
});
test('profile interval includes the first whole day and excludes future and older completions',()=> {
 const start = new Date(2026,8,7,0);
 const stats=profileStats([visit({checkoutDataHora:start}),visit({checkoutDataHora:new Date(start-1)}),visit({checkoutDataHora:at(7)})],30,now);
 assert.equal(stats.start.getTime(),start.getTime()); assert.equal(stats.total,1); assert.equal(stats.buckets.length,30);
});
test('missing or inverted times never fabricate time in field, while visit remains counted',()=> {
 const stats=profileStats([visit({checkinDataHora:null}),visit({checkoutDataHora:at(5,9)}),visit({checkinDataHora:null,checkoutDataHora:null})],30,now);
 assert.equal(stats.total,3); assert.equal(stats.durations[0],0); assert.equal(profileDuration(0),'0h00m'); assert.equal(profileDuration(77400000),'21h30m');
});
test('weekly and monthly buckets include empty periods and preserve totals',()=> {
 for(const days of [90,365]) {
  const stats=profileStats([visit(),visit({tipoVisita:'Treinamento'})],days,now);
  assert.equal(stats.buckets.reduce((sum,b)=>sum+b.counts.reduce((a,b)=>a+b,0),0),2);
  assert.equal(stats.buckets.length,13);
 }
});
test('rankings aggregate distinct clients, sort by visits with stable alphabetical ties and do not mutate source',()=> {
 const stats=profileStats([visit(),visit(),visit({clienteId:'b',nomeCliente:'B'}),visit({clienteId:'c',nomeCliente:'C'})],30,now);
 assert.equal(rankClients(stats.clients)[0].count,2); assert.equal(rankClients(stats.clients,false)[0].name,'B');
 assert.equal(stats.clients[0].id,'a'); assert.equal(stats.clients[0].lat,-23);
});

test('logout discards a delayed profile response and clears the loading state',async()=> {
 const { ProfileView } = await import('../src/ui/profile.js');
 let release; const attributes=new Map();
 const root={innerHTML:'',setAttribute:(k,v)=>attributes.set(k,v),removeAttribute:k=>attributes.delete(k),replaceChildren(){this.innerHTML='';}};
 const view=new ProfileView(root,{load:()=>new Promise(resolve=>{release=resolve;}),onError:()=>assert.fail('stale error should not be shown')});
 const pending=view.open({nome:'A'}); assert.equal(attributes.get('aria-busy'),'true');
 view.clear(); release([visit()]); await pending;
 assert.equal(view.data,null); assert.equal(root.innerHTML,''); assert.equal(attributes.has('aria-busy'),false);
});
