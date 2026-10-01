import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import vm from 'node:vm';
const root=pathToFileURL(resolve('.')+'/');
const html=readFileSync(new URL('index.html',root),'utf8');
const elements=new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(([,id])=>[id,{
    value:'',textContent:'',style:{},dataset:{},addEventListener(){},replaceChildren(){},removeAttribute(){}
}]));
const context=vm.createContext({console,URL,Date,Intl,Map,Set,Promise,AbortController,queueMicrotask,
    setInterval,clearInterval,setTimeout,clearTimeout,
    navigator:{},location:{hostname:'localhost'},
    window:{addEventListener(){},matchMedia:()=>({matches:false})},
    document:{readyState:'loading',addEventListener(){},getElementById:id=>elements.get(id),querySelectorAll:()=>[]}
});
const remoteNames=new Set();
for(const file of ['script.js']){
    const text=readFileSync(new URL(file,root),'utf8');
    for(const m of text.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']https:\/\/www.gstatic.com[^"']+/g)){
        m[1].split(',').forEach(n=>remoteNames.add(n.trim()));
    }
}
const remote=[...remoteNames].map(n=>`export function ${n}(){return ${n==='getApps'?'[]':'{}'};}`).join('\n');
const modules=new Map();
function moduleFor(url){
    if(!modules.has(url))modules.set(url,new vm.SourceTextModule(url.startsWith('https:')?remote:readFileSync(new URL(url),'utf8'),{
        context,identifier:url,initializeImportMeta(meta){meta.url=url;}
    }));
    return modules.get(url);
}
const linker=(specifier,ref)=>moduleFor(new URL(specifier,ref.identifier).href);
for(const entry of ['script.js']){
    const mod=moduleFor(new URL(entry,root).href);
    if(mod.status==='unlinked')await mod.link(linker);
    await mod.evaluate();
}
console.log('App entrypoint evaluated with Firebase mocked; no production access.');
