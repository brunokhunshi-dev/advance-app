import test from 'node:test';
import assert from 'node:assert/strict';
import { configureMediaApi, initializeMediaPreviews, clearMediaUrlCache } from '../technical-report-editor.js';

test('saved photos never request previews while reports render', async () => {
    const previous = {document:globalThis.document, MutationObserver:globalThis.MutationObserver, IntersectionObserver:globalThis.IntersectionObserver, fetch:globalThis.fetch};
    const buttons = Array.from({length:20},(_,i)=>({dataset:{reportMedia:'p'+i,reportActivity:'visit',mediaName:'Foto '+i,mediaType:'image/jpeg'},isConnected:true}));
    let requests=0, observed=0;
    globalThis.MutationObserver=class{observe(){} disconnect(){}};
    globalThis.IntersectionObserver=class{observe(){observed++}};
    globalThis.document={body:{},querySelectorAll:()=>buttons};
    globalThis.fetch=async()=>{requests++;throw Error('An image must not be fetched until click');};
    try {
        configureMediaApi({getIdToken:async()=>'test-token'});
        const disconnect=initializeMediaPreviews();
        await new Promise(resolve=>setTimeout(resolve,10));
        assert.equal(requests,0);
        assert.equal(observed,0);
        assert.equal(buttons.filter(button=>typeof button.onclick==='function').length,20);
        disconnect();
    } finally {
        clearMediaUrlCache();
        for(const [name,value] of Object.entries(previous)){
            if(value===undefined)delete globalThis[name];else globalThis[name]=value;
        }
    }
});
