import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
function setup({cached,network,put=async()=>{}}={}) {
    const handlers={},deleted=[]; let fetches=0,claimed=false;
    const cache={match:async()=>cached,put,addAll:async paths=>{
        for(const path of paths) assert.ok(existsSync(new URL('../'+path,import.meta.url)),path);
    }};
    const c=vm.createContext({URL,Response,self:{location:new URL('https://app.test/sw.js'),
        addEventListener:(name,fn)=>{handlers[name]=fn;},skipWaiting:async()=>{},clients:{claim:async()=>{claimed=true;}}},
        caches:{open:async()=>cache,keys:async()=>['advance-pwa-old','another-app'],delete:async key=>deleted.push(key)},
        fetch:async()=>{fetches++;if(network instanceof Error)throw network;return network;}});
    vm.runInContext(source,c);
    const request=(path,mode='cors')=>{let result;handlers.fetch({request:{url:'https://app.test'+path,method:'GET',mode},respondWith:p=>{result=p;}});return result;};
    const event=async name=>{let p;handlers[name]({waitUntil:value=>{p=value;}});await p;};
    return {request,event,deleted,fetches:()=>fetches,claimed:()=>claimed};
}
test('every precached path exists in the checkout',async()=>{await setup().event('install');});
test('activation deletes only old Advance caches',async()=>{const s=setup();await s.event('activate');assert.deepEqual(s.deleted,['advance-pwa-old']);assert.equal(s.claimed(),true);});
test('versioned static URL uses precached asset without network',async()=>{const s=setup({cached:new Response('cached')});assert.equal(await(await s.request('/script.js?v=v12')).text(),'cached');assert.equal(s.fetches(),0);});
test('offline dashboard keeps its own HTML',async()=>{const s=setup({cached:new Response('dashboard'),network:Error('offline')});assert.equal(await(await s.request('/dashboard/','navigate')).text(),'dashboard');});
test('cache quota failure does not discard a network response',async()=>{const s=setup({network:new Response('fresh'),put:async()=>{throw Error('quota');}});assert.equal(await(await s.request('/index.html','navigate')).text(),'fresh');});
test('offline cache miss returns a Response, not undefined',async()=>{const s=setup({network:Error('offline')});assert.equal((await s.request('/script.js')).status,503);});
test('APIs and uploads are not intercepted or cached',()=>{const s=setup();assert.equal(s.request('/api/private'),undefined);assert.equal(s.request('/uploads/photo.jpg'),undefined);});
