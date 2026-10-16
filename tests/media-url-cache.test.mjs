import test from 'node:test';
import assert from 'node:assert/strict';
import { createMediaUrlCache } from '../src/services/media-url-cache.js';
const signed = items => ({items:items.map(item=>({...item,url:'https://r2.test/'+item.mediaId})),expiresIn:300});
function fixture(request) {
    const calls=[],tasks=[];let time=0;
    const cache=createMediaUrlCache({now:()=>time,schedule:fn=>tasks.push(fn),request:async(path,body)=>{calls.push({path,body});return request?request(path,body):signed(body.items);}});
    return {cache,calls,flush:async()=>{while(tasks.length)await tasks.shift()();},setTime:value=>time=value};
}
test('20 thumbnails + duplicated render produce one request; cached render produces zero',async()=>{
    const f=fixture();const first=Array.from({length:20},(_,i)=>f.cache.read('visit','p'+i,'thumbnail'));
    const duplicated=Array.from({length:20},(_,i)=>f.cache.read('visit','p'+i,'thumbnail'));
    await f.flush();await Promise.all([...first,...duplicated]);assert.equal(f.calls.length,1);assert.equal(f.calls[0].body.items.length,20);
    await Promise.all(Array.from({length:20},(_,i)=>f.cache.read('visit','p'+i,'thumbnail')));assert.equal(f.calls.length,1);
});
test('expires before signed URL and isolates variants and activities',async()=>{
    const f=fixture();let p=f.cache.read('visit','photo','thumbnail');await f.flush();await p;
    f.setTime(270001);p=f.cache.read('visit','photo','thumbnail');await f.flush();await p;assert.equal(f.calls.length,2);
    const p2=f.cache.read('other','photo','thumbnail'),p3=f.cache.read('visit','photo','original');await f.flush();await Promise.all([p2,p3]);assert.equal(f.calls.length,3);assert.equal(f.calls[2].body.items.length,2);
});
test('old Worker probes once then bounded singles are cached',async()=>{
    const f=fixture((path,body)=>{if(path.endsWith('read-urls'))throw Object.assign(new Error('Esta operação é restrita aos perfis de gestão.'),{status:403});return {url:'https://r2.test/'+body.mediaId,expiresIn:300};});
    let tasks=[f.cache.read('v','a'),f.cache.read('v','b')];await f.flush();await Promise.all(tasks);
    tasks=[f.cache.read('v','c')];await f.flush();await Promise.all(tasks);
    assert.equal(f.calls.filter(c=>c.path.endsWith('read-urls')).length,1);assert.equal(f.calls.length,4);
});
test('permission errors never trigger a fallback or leak cached results between sessions',async()=>{
    const f=fixture(()=>{throw Object.assign(new Error('Esta atividade não pertence ao usuário conectado.'),{status:403});});
    const p=assert.rejects(f.cache.read('v','a'));await f.flush();await p;assert.equal(f.calls.length,1);
    const g=fixture();const queued=assert.rejects(g.cache.read('v','a'));g.cache.clear();await g.flush();await queued;assert.equal(g.calls.length,0);
    const next=g.cache.read('v','a');await g.flush();await next;assert.equal(g.calls.length,1);g.cache.clear();const again=g.cache.read('v','a');await g.flush();await again;assert.equal(g.calls.length,2);
});
test('batch limit and quota failures avoid request storms',async()=>{
    const f=fixture();const p=Array.from({length:65},(_,i)=>f.cache.read('v','p'+i));await f.flush();await Promise.all(p);assert.deepEqual(f.calls.map(c=>c.body.items.length),[30,30,5]);
    const g=fixture(()=>{throw new Error('Quota exceeded.');});const failed=assert.rejects(g.cache.read('v','a'));await g.flush();await failed;await assert.rejects(g.cache.read('v','b'));assert.equal(g.calls.length,1);
});
test('quota error stops remaining batches already queued in the same flush',async()=>{
    const f=fixture(()=>{throw new Error('Quota exceeded.');});
    const p=Array.from({length:65},(_,i)=>assert.rejects(f.cache.read('v','p'+i)));
    await f.flush();await Promise.all(p);assert.equal(f.calls.length,1);
});
test('clearing a session while a request is in flight discards its result',async()=>{
    let release;const f=fixture(()=>new Promise(resolve=>release=resolve));
    const old=assert.rejects(f.cache.read('v','a'));
    const flushing=f.flush();await Promise.resolve();f.cache.clear();release(signed([{activityId:'v',mediaId:'a',variant:'original'}]));await flushing;await old;
    // The old signed URL was not retained.
    const next=assert.rejects(f.cache.read('v','a'));f.cache.clear();await f.flush();await next;assert.equal(f.calls.length,1);
});
