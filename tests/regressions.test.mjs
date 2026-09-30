import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { configureMediaApi, mediaStore, compressImage, createThumbnail } from '../technical-report-editor.js';

const appSource = readFileSync(new URL('../script.js', import.meta.url), 'utf8');
const dashboardSource = readFileSync(new URL('../dashboard/dashboard.js', import.meta.url), 'utf8');
function functionSource(source, name) {
    const start = source.search(new RegExp(`(?:async )?function ${name}\\(`));
    assert.notEqual(start, -1);
    return source.slice(start, source.indexOf('\n}', start) + 2);
}
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise,resolve,reject}; };
function clientContext(getDoc) {
    const context = vm.createContext({ getDoc, doc: (...args) => args, db: {} });
    vm.runInContext('const cacheClientes = new Map(); const consultasClientes = new Map(); let versaoSessao = 1;', context);
    vm.runInContext(functionSource(appSource, 'obterCliente'), context);
    return context;
}

test('concurrent visits to the same client share one Firestore read', async () => {
    let reads=0; const request=deferred();
    const c=clientContext(() => { reads++; return request.promise; });
    const a=c.obterCliente('c1'), b=c.obterCliente('c1');
    assert.equal(a,b);
    request.resolve({exists:()=>true,id:'c1',data:()=>({nome:'Loja',id:'wrong'})});
    assert.equal((await a).id,'c1');
    await c.obterCliente('c1');
    assert.equal(reads,1);
});

test('stale client response cannot fill a new session cache or remove its pending read', async () => {
    const old=deferred(), current=deferred(); let reads=0;
    const c=clientContext(() => (++reads === 1 ? old : current).promise);
    const first=c.obterCliente('c1');
    vm.runInContext('++versaoSessao; cacheClientes.clear(); consultasClientes.clear();',c);
    const second=c.obterCliente('c1');
    old.resolve({exists:()=>true,id:'c1',data:()=>({nome:'Old'})}); await first;
    assert.equal(vm.runInContext('cacheClientes.size',c),0);
    assert.equal(c.obterCliente('c1'),second);
    current.resolve({exists:()=>true,id:'c1',data:()=>({nome:'New'})});
    assert.equal((await second).nome,'New');
});

test('failed client read can be retried', async () => {
    let reads=0;
    const c=clientContext(async () => { if (++reads===1) throw Error('offline'); return {exists:()=>false}; });
    await assert.rejects(c.obterCliente('c1'));
    assert.equal(await c.obterCliente('c1'),null);
    assert.equal(reads,2);
});

test('initials handle spaces and accents', () => {
    const c=vm.createContext();
    vm.runInContext("const PARTICULAS_NOME = new Set(['da','das','de','do','dos','e']);"+functionSource(appSource,'obterIniciais'),c);
    assert.equal(c.obterIniciais('Bruno Santos de Souza'),'BS');
    assert.equal(c.obterIniciais('Érica de Ávila'),'EA');
    assert.equal(c.obterIniciais(''),'XX');
});

test('dashboard date boundaries follow São Paulo even in a UTC runtime', () => {
    const c=vm.createContext(); vm.runInContext(functionSource(dashboardSource,'parseInputDate'),c);
    assert.equal(c.parseInputDate('2026-09-30').toISOString(),'2026-09-30T03:00:00.000Z');
    assert.equal(c.parseInputDate('2026-09-30',true).toISOString(),'2026-10-01T02:59:59.999Z');
});

test('dashboard reads the correct report collection and ignores a closed modal response', async () => {
    const pending=deferred(); let reference;
    const elements=new Map();
    const $=id => { if (!elements.has(id)) elements.set(id,{open:false}); return elements.get(id); };
    const activity={id:'a1',client:{name:'Loja'},reportId:'r1',raw:{relatorioColecao:'relatorios_assistencia_tecnica'}};
    const state={activities:[activity],modalVersion:1,sessionVersion:1};
    const c=vm.createContext({state,$,db:{},DASHBOARD_CONFIG:{collections:{reports:'relatorios'}},
        safeString:(v,f='')=>String(v||f),openModal:()=>{$('dashboard-modal').open=true;},
        doc:(_,collection,id)=>(reference=[collection,id]),getDoc:()=>pending.promise});
    vm.runInContext(functionSource(dashboardSource,'openActivityDetails'),c);
    const result=c.openActivityDetails('a1');
    assert.deepEqual(reference,['relatorios_assistencia_tecnica','r1']);
    state.modalVersion++; $('dashboard-modal').open=false;
    pending.resolve({exists:()=>true,data:()=>({verificacao:{constatacoes:'Relato'}})});
    await result;
    assert.equal($('modal-content').innerHTML,undefined);
});

test('failed parallel upload waits for the other PUT before deleting', async t => {
    const originalFetch=globalThis.fetch; t.after(()=>{globalThis.fetch=originalFetch;});
    const slow=deferred(); const order=[];
    configureMediaApi({baseUrl:'https://media.test',getIdToken:async()=> 'test'});
    globalThis.fetch=async (url) => {
        if (url.endsWith('upload-url')) return Response.json({original:{uploadUrl:'https://put/original',key:'o'},thumbnail:{uploadUrl:'https://put/thumb',key:'t'}});
        if (url.endsWith('/original')) return new Response('',{status:500});
        if (url.endsWith('/thumb')) { await slow.promise; order.push('thumbnail finished'); return new Response(''); }
        if (url.endsWith('/delete')) { order.push('delete'); return Response.json({}); }
        throw Error('Unexpected fetch');
    };
    const result=mediaStore.upload('a','m',new Blob(['image'],{type:'image/webp'}),new Blob(['thumb']));
    await new Promise(resolve=>setImmediate(resolve));
    assert.deepEqual(order,[]);
    slow.resolve();
    await assert.rejects(result,/HTTP 500/);
    assert.deepEqual(order,['thumbnail finished','delete']);
});

function mockCanvas(t, sizeFor) {
    const previous={document:globalThis.document,createImageBitmap:globalThis.createImageBitmap};
    t.after(()=>Object.assign(globalThis,previous));
    const canvases=[]; let closed=0;
    globalThis.createImageBitmap=async()=>({width:1600,height:400,close:()=>closed++});
    globalThis.document={createElement:tag=>{
        assert.equal(tag,'canvas');
        const canvas={width:0,height:0,getContext:()=>({fillRect(){},drawImage(){},translate(){}}),
            toBlob(callback,type){callback(new Blob([new Uint8Array(sizeFor(canvas))],{type}));}};
        canvases.push(canvas); return canvas;
    }};
    return {canvases,closed:()=>closed};
}

test('compression preserves panoramic aspect ratio across resize passes', async t => {
    const mock=mockCanvas(t,c=>c.width===1600?400*1024:180*1024);
    const result=await compressImage(new File(['x'],'panorama.jpg',{type:'image/jpeg'}));
    assert.equal(result.width,1376); assert.equal(result.height,344);
    assert.equal(result.width/result.height,4);
    assert.ok(result.file.size<=200*1024); assert.equal(mock.closed(),1);
});

test('compression rejects images that still exceed the output limit', async t => {
    const mock=mockCanvas(t,()=>400*1024);
    await assert.rejects(compressImage(new File(['x'],'test.jpg',{type:'image/jpeg'})),/300 KB/);
    assert.equal(mock.closed(),1);
});

test('thumbnail uses only one 96px canvas', async t => {
    const mock=mockCanvas(t,()=>1000);
    const thumbnail=await createThumbnail(new File(['x'],'test.webp',{type:'image/webp'}));
    assert.equal(thumbnail.type,'image/jpeg'); assert.equal(mock.canvases.length,1);
    assert.equal(mock.canvases[0].width,96); assert.equal(mock.canvases[0].height,96);
    assert.equal(mock.closed(),1);
});
