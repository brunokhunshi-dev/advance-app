import test from 'node:test';
import assert from 'node:assert/strict';
import {dadosLocalizacaoCadastro, referenciaLocalizacao, buscarCentroCidade, calcularDistancia, localizacaoIncerta} from '../src/services/location.js';
import {detalhesCliente} from '../src/ui/client-options.js';
const centro={lat:-23.26,lng:-47.3,cidade:'Itu',uf:'SP'};

test('failed address lookup permits an uncertain registration, keeping city center separate from store coordinates',()=>{
    const data=dadosLocalizacaoCadastro(null,centro);
    assert.equal(data.statusLocalizacao,'incerto');assert.equal(data.lat,null);assert.equal(data.lng,null);assert.deepEqual(data.centroCidade,centro);
    assert.deepEqual(dadosLocalizacaoCadastro(null,null),{lat:null,lng:null,statusLocalizacao:'incerto',origemCoordenadas:null,centroCidade:null});
    assert.ok(detalhesCliente({...data,enderecoCompleto:'Rua Teste',cidade:'Itu',uf:'SP'}).includes('Localização incerta'));
});

test('uncertain location uses 50km from the matching city, precise and corrected coordinates use 500m',()=>{
    const store={...dadosLocalizacaoCadastro(null,centro),cidade:'Itu',uf:'SP'};
    const reference=referenciaLocalizacao(store);
    assert.deepEqual(reference,{lat:-23.26,lng:-47.3,raio:50000,incerto:true});
    assert.ok(calcularDistancia(centro.lat+0.4,centro.lng,reference.lat,reference.lng)<reference.raio);
    assert.ok(calcularDistancia(centro.lat+0.5,centro.lng,reference.lat,reference.lng)>reference.raio);
    const corrected={...store,lat:-23.3,lng:-47.4};
    assert.equal(localizacaoIncerta(corrected),false);
    assert.equal(referenciaLocalizacao(corrected).raio,500);
    assert.equal(referenciaLocalizacao({...dadosLocalizacaoCadastro({lat:-23.3,lng:-47.4},null),cidade:'Itu',uf:'SP'}).raio,500);
});

test('missing city reference blocks distance validation; stale city/UF cannot grant check-in',()=>{
    const store={...dadosLocalizacaoCadastro(null,null),cidade:'Itu',uf:'SP'};
    assert.equal(referenciaLocalizacao(store),null);
    assert.equal(referenciaLocalizacao({...store,centroCidade:{...centro,cidade:'Salto'}}),null);
    assert.equal(referenciaLocalizacao({...store,centroCidade:{...centro,uf:'RS'}}),null);
    assert.equal(referenciaLocalizacao(store,centro).raio,50000);
    assert.equal(referenciaLocalizacao({cidade:'Itu',uf:'SP'}),null);
    // Stores previously saved as an approximate street also use the city reference.
    assert.equal(referenciaLocalizacao({...store,lat:-23.3,lng:-47.4,precisaoCoordenadas:'rua',centroCidade:centro}).raio,50000);
});

test('city lookup accepts municipality only, rejecting a street, another town and another state',async()=>{
    const original=globalThis.fetch;
    try {
        globalThis.fetch=async url=>{
            const p=new URL(url).searchParams;assert.equal(p.get('city'),'Itu');assert.equal(p.get('state'),'SP');assert.equal(p.has('street'),false);
            return {ok:true,json:async()=>[
                {lat:'-23',lon:'-47',name:'Itu',addresstype:'road'},
                {lat:'-23',lon:'-47',name:'Salto',addresstype:'city'},
                {lat:'-23',lon:'-47',name:'Itu',addresstype:'city',address:{'ISO3166-2-lvl4':'BR-RS'}},
                {lat:'-23.26',lon:'-47.3',name:'Itu',addresstype:'city',address:{'ISO3166-2-lvl4':'BR-SP'}}
            ]};
        };
        assert.deepEqual(await buscarCentroCidade('Itu','SP'),centro);
    } finally {globalThis.fetch=original;}
});
