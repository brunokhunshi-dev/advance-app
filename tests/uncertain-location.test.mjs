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

test('city lookup accepts municipality only, rejecting a street, another town and another state', async t => {
    t.mock.method(globalThis, 'fetch', async url => {
        const parsed = new URL(url);
        if (parsed.pathname.endsWith('/geoapify-config.json')) return { ok: true, json: async () => ({ apiKey: 'teste' }) };
        const params = parsed.searchParams;
        assert.equal(params.get('city'), 'Itu');
        assert.equal(params.get('state'), 'SP');
        assert.equal(params.get('type'), 'city');
        assert.equal(params.has('street'), false);
        return { ok: true, json: async () => ({ results: [
            { lat: -23, lon: -47, city: 'Itu', result_type: 'street', state_code: 'SP' },
            { lat: -23, lon: -47, city: 'Salto', result_type: 'city', state_code: 'SP' },
            { lat: -23, lon: -47, city: 'Itu', result_type: 'city', state_code: 'RS' },
            { lat: -23.26, lon: -47.3, city: 'Itu', result_type: 'city', state_code: 'BR-SP' }
        ] }) };
    });
    assert.deepEqual(await buscarCentroCidade('Itu', 'SP'), centro);
});
