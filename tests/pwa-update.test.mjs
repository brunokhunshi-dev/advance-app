import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const inline=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
if(!inline)throw Error('PWA registration script not found');

function setup({screen='tela-inicio',confirmation=false,controlled=true}={}) {
    const sw={},win={},doc={};
    let reloads=0,activeScreen=screen,modalOpen=confirmation;
    const context=vm.createContext({
        navigator:{serviceWorker:{
            controller:controlled?{}:null,
            addEventListener:(name,fn)=>sw[name]=fn,
            register:async()=>({update:async()=>{}})
        }},
        window:{isSecureContext:true,addEventListener:(name,fn)=>win[name]=fn},
        document:{querySelector:()=>null,
            getElementById:id=>{
                if(id==='tela-confirmacao')return {style:{get display(){return modalOpen?'flex':'none';}}};
                if(id==='modal-fechamento-manual')return {style:{display:'none'}};
                return {getClientRects:()=>id===activeScreen?[{width:1}]:[]};
            },
            addEventListener:(name,fn)=>doc[name]=fn},
        location:{hostname:'advance-app-one.vercel.app',reload:()=>reloads++},
        setTimeout:fn=>fn(),
        console:{error(){}}
    });
    vm.runInContext(inline,context);
    return {change:()=>sw.controllerchange(),popstate:()=>win.popstate(),click:()=>doc.click(),
        screen:value=>activeScreen=value,modal:value=>modalOpen=value,reloads:()=>reloads};
}

test('PWA hotfix activates and reloads from the home screen',()=>{
    const a=setup();a.change();assert.equal(a.reloads(),1);
});
test('PWA does not interrupt report editing; applies update after safe navigation',()=>{
    const a=setup({screen:'tela-relatorio'});a.change();assert.equal(a.reloads(),0);
    a.screen('tela-inicio');a.popstate();assert.equal(a.reloads(),1);
});
test('PWA waits for the check-in confirmation overlay to close',()=>{
    const a=setup({screen:'tela-inicio',confirmation:true});a.change();assert.equal(a.reloads(),0);
    a.modal(false);a.click();assert.equal(a.reloads(),1);
});
test('PWA first install does not force a second page reload',()=>{
    const a=setup({controlled:false});a.change();assert.equal(a.reloads(),0);
});
