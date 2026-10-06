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
test('navigation keeps HTML in the installed shell version instead of mixing it with new network HTML',async()=>{
    const s=setup({cached:new Response('installed HTML'),network:new Response('new incompatible HTML')});
    assert.equal(await(await s.request('/index.html','navigate')).text(),'installed HTML');
    assert.equal(s.fetches(),0);
});
test('cache quota failure does not discard a network response',async()=>{const s=setup({network:new Response('fresh'),put:async()=>{throw Error('quota');}});assert.equal(await(await s.request('/index.html','navigate')).text(),'fresh');});
test('offline cache miss returns a Response, not undefined',async()=>{const s=setup({network:Error('offline')});assert.equal((await s.request('/script.js')).status,503);});
test('APIs and uploads are not intercepted or cached',()=>{const s=setup();assert.equal(s.request('/api/private'),undefined);assert.equal(s.request('/uploads/photo.jpg'),undefined);});

test('all app local module dependencies are precached', async () => {
    const paths = new Set([...source.matchAll(/['"]\.\/([^'"]+)['"]/g)].map(([,path])=>path));
    const visited = new Set();
    function walk(relative) {
        if(visited.has(relative))return;
        visited.add(relative);
        assert.ok(paths.has(relative),`Not precached: ${relative}`);
        const url = new URL('../'+relative,import.meta.url);
        const code=readFileSync(url,'utf8');
        for(const match of code.matchAll(/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)["'](\.[^"']+)["']/g)) {
            const target=new URL(match[1],url);
            const root=new URL('../',import.meta.url);
            walk(target.pathname.slice(root.pathname.length));
        }
    }
    walk('script.js');
});
