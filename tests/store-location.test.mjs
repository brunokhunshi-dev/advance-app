import test from 'node:test';
import assert from 'node:assert/strict';
import { StoreLocationPicker } from '../src/ui/store-location.js';

function setup() {
    const nodes=new Map(['[data-status]','[data-map]','[data-address]','[data-confirm]','.store-location-close'].map(key=>[key,{disabled:key==='[data-confirm]'}]));
    const dialog={querySelector:key=>nodes.get(key),setAttribute(){},addEventListener(){},showModal(){},close(){},remove(){this.removed=true;}};
    const handlers={},markerHandlers={};let map,marker;
    class FakeMap {
        constructor(){map=this;}
        addControl(){} on(name,callback){handlers[name]=callback;} getStyle(){return {layers:[]};} resize(){} jumpTo(value){this.center=value.center;} remove(){this.removed=true;}
    }
    class Marker {
        constructor(){marker=this;} on(name,callback){markerHandlers[name]=callback;} setLngLat(value){this.position=value;return this;} addTo(){return this;} getLngLat(){return this.position;}
    }
    const picker=new StoreLocationPicker({loadLibrary:async()=>({Map:FakeMap,Marker,NavigationControl:class{}}),wait:async()=>{},findArea:async()=>({lat:'-23.26',lon:'-47.3'})});
    return {picker,dialog,nodes,handlers,markerHandlers,map:()=>map,marker:()=>marker};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const address={logradouro:'Avenida Eugen Wissmann',numero:'1840',cidade:'Itu',uf:'SP'};

test('city center is never confirmed automatically; a map click selects the entrance and returns its coordinates',async()=>{
    const original=globalThis.document,s=setup();
    globalThis.document={createElement:()=>s.dialog,body:{append(){}}};
    try {
        const pending=s.picker.open(address);await flush();s.handlers.load();
        assert.deepEqual(s.map().center,[-47.3,-23.26]);
        assert.equal(s.nodes.get('[data-confirm]').disabled,true);
        s.handlers.click({lngLat:{lat:-23.27,lng:-47.31}});
        assert.equal(s.nodes.get('[data-confirm]').disabled,false);
        s.nodes.get('[data-confirm]').onclick();
        assert.deepEqual(await pending,{lat:-23.27,lng:-47.31,source:'manual'});
        assert.equal(s.map().removed,true);assert.equal(s.dialog.removed,true);
    } finally {s.picker.clear();globalThis.document=original;}
});

test('closing the picker cancels saving; invalid coordinates do not enable confirmation',async()=>{
    const original=globalThis.document,s=setup();
    globalThis.document={createElement:()=>s.dialog,body:{append(){}}};
    try {
        const pending=s.picker.open(address);await flush();s.handlers.load();
        s.handlers.click({lngLat:{lat:100,lng:-47}});
        assert.equal(s.nodes.get('[data-confirm]').disabled,true);
        s.picker.clear();assert.equal(await pending,null);
    } finally {s.picker.clear();globalThis.document=original;}
});
