import test from 'node:test';
import assert from 'node:assert/strict';
import { configureMediaApi, initializeMediaPreviews, clearMediaUrlCache } from '../technical-report-editor.js';

test('remote thumbnails wait until visible; visible photos share one batch',async()=>{
 const previous={document:globalThis.document,MutationObserver:globalThis.MutationObserver,IntersectionObserver:globalThis.IntersectionObserver,fetch:globalThis.fetch};
 let observed=[],observerCallback,requests=0;
 const buttons=Array.from({length:4},(_,i)=>({dataset:{reportMedia:'p'+i,reportActivity:'visit',mediaName:'photo',mediaType:'image/jpeg'},isConnected:true,querySelector:()=>({replaceChildren(){}})}));
 globalThis.MutationObserver=class{observe(){}disconnect(){}};
 globalThis.IntersectionObserver=class{constructor(callback){observerCallback=callback;}observe(button){observed.push(button);}unobserve(){}};
 globalThis.document={body:{},querySelectorAll:()=>buttons,createElement:()=>({})};
 globalThis.fetch=async(url,options)=>{requests++;const {items}=JSON.parse(options.body);return Response.json({items:items.map(item=>({...item,url:'https://r2.test/'+item.mediaId})),expiresIn:300});};
 try {
  configureMediaApi({getIdToken:async()=>'test-token'});
  const disconnect=initializeMediaPreviews();assert.equal(observed.length,4);
  await new Promise(resolve=>setTimeout(resolve,5));assert.equal(requests,0);
  observerCallback(observed.slice(0,2).map(target=>({target,isIntersecting:true})));
  await new Promise(resolve=>setTimeout(resolve,15));assert.equal(requests,1);
  disconnect();
 } finally {clearMediaUrlCache();for(const [name,value] of Object.entries(previous)){if(value===undefined)delete globalThis[name];else globalThis[name]=value;}}
});
