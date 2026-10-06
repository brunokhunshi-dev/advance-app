import test from 'node:test';
import assert from 'node:assert/strict';
import { margemEstimadaRua, raioPermitidoLoja, obterAreaPorEndereco } from '../src/services/location.js';

test('street extent estimates a finite margin; missing bounds and invalid centers stay untrusted',()=>{
    const road={lat:-23,lon:-47,boundingbox:['-23.001','-22.999','-47.001','-46.999']};
    const margin=margemEstimadaRua(road);
    assert.ok(margin>100 && margin<200);
    for (const bad of [{...road,boundingbox:null},{...road,boundingbox:[null,0,0,0]},{...road,lat:-25}]) assert.equal(margemEstimadaRua(bad),null);
    assert.ok(margemEstimadaRua({...road,boundingbox:[-23.01,-22.99,-47.01,-46.99]})>500);
});

test('radius uses only the street margin, stays capped and preserves precise/manual/legacy points',()=>{
    const street={origemCoordenadas:'geocodificacao',precisaoCoordenadas:'rua',margemErroCoordenadasMetros:180};
    assert.equal(raioPermitidoLoja(street),680);
    assert.equal(raioPermitidoLoja({...street,margemErroCoordenadasMetros:99999}),1000);
    for (const margin of [-20,NaN,Infinity,'bad',null]) assert.equal(raioPermitidoLoja({...street,margemErroCoordenadasMetros:margin}),500);
    assert.equal(raioPermitidoLoja({...street,origemCoordenadas:'manual'}),500);
    assert.equal(raioPermitidoLoja({...street,precisaoCoordenadas:'cep'}),500);
    assert.equal(raioPermitidoLoja({}),500);
});

test('approximation searches the street without number, then CEP, then city and does not label city as street',async()=>{
    const original=globalThis.fetch,calls=[];
    try {
        globalThis.fetch=async url=>{
            const p=new URL(url).searchParams;calls.push(p);
            return {ok:true,json:async()=>calls.length===3?[{lat:'-28.7',lon:'-51.7',addresstype:'city'}]:[]};
        };
        const area=await obterAreaPorEndereco({logradouro:'Rua Attilio Bilbio',numero:'685',cep:'95340-000',cidade:'Nova Bassano',uf:'RS'},{wait:async()=>{}});
        assert.equal(calls[0].get('street'),'Rua Attilio Bilbio');
        assert.equal(calls[1].get('postalcode'),'95340000');
        assert.equal(calls[2].get('city'),'Nova Bassano');
        assert.equal(area.precision,'cidade');assert.equal(area.uncertaintyMeters,null);
    } finally {globalThis.fetch=original;}
});

test('approximate street must match name, municipality and state before getting a margin',async()=>{
    const original=globalThis.fetch;
    const result={lat:-23,lon:-47,addresstype:'road',name:'Rua das Flores',boundingbox:[-23.001,-22.999,-47.001,-46.999],address:{road:'Rua das Flores',city:'Itu','ISO3166-2-lvl4':'BR-SP'}};
    try {
        let calls=0;
        globalThis.fetch=async()=>({ok:true,json:async()=>++calls===1?[result]:[]});
        const address={logradouro:'Rua das Flores',cidade:'Itu',uf:'SP'};
        const area=await obterAreaPorEndereco(address,{wait:async()=>{}});
        assert.equal(area.precision,'rua');assert.ok(area.uncertaintyMeters>0);
        for(const bad of [{...result,name:'Outra rua',address:{...result.address,road:'Outra rua'}},{...result,address:{...result.address,city:'Outra cidade'}},{...result,address:{...result.address,'ISO3166-2-lvl4':'BR-RS'}}]) {
            calls=0;globalThis.fetch=async()=>({ok:true,json:async()=>++calls===1?[bad]:[]});
            assert.equal(await obterAreaPorEndereco(address,{wait:async()=>{}}),null);
        }
    } finally {globalThis.fetch=original;}
});
