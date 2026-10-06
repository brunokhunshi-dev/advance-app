import test from 'node:test';
import assert from 'node:assert/strict';
import { obterCoordsPorEndereco, formatosBuscaEndereco } from '../src/services/location.js';

const endereco = { logradouro: 'Rua das Flores', numero: '123', cidade: 'Curitiba', uf: 'PR', bairro: 'Centro' };

test('geocodificação usa campos estruturados e preserva número', async () => {
    const original = globalThis.fetch;
    try {
        globalThis.fetch = async url => {
            const params = new URL(url).searchParams;
            assert.equal(params.get('street'), '123 Rua das Flores');
            assert.equal(params.get('city'), 'Curitiba');
            assert.equal(params.get('state'), 'PR');
            assert.equal(params.has('q'), false);
            return { ok: true, json: async () => [{ lat: '-25.4', lon: '-49.2', addresstype: 'building' }] };
        };
        assert.deepEqual(await obterCoordsPorEndereco(endereco), { lat: -25.4, lng: -49.2 });
    } finally { globalThis.fetch = original; }
});

test('endereço ausente, coordenadas inválidas e centro de cidade não são salvos', async () => {
    const original = globalThis.fetch;
    try {
        for (const resposta of [[], [{ lat: 'bad', lon: '-49' }], [{ lat: '-25', lon: '-49', addresstype: 'city' }]]) {
            globalThis.fetch = async () => ({ ok: true, json: async () => resposta });
            assert.equal(await obterCoordsPorEndereco(endereco, { wait: async () => {} }), null);
        }
    } finally { globalThis.fetch = original; }
});

test('fallback tries free address formats with street number and CEP before returning no match', async () => {
    const original = globalThis.fetch, calls = [], waits = [];
    try {
        globalThis.fetch = async url => {
            const params = new URL(url).searchParams; calls.push(params);
            return {ok:true,json:async()=> calls.length === 3 ? [{lat:'-23.26',lon:'-47.3',addresstype:'building',address:{house_number:'1840',city:'Itu'}}] : []};
        };
        const coords = await obterCoordsPorEndereco({logradouro:'AVENIDA EUGEN WISSMANN',numero:'1840',cidade:'Itu',uf:'SP',bairro:'São Luiz',cep:'13304-270'}, {wait:async ms=>waits.push(ms)});
        assert.deepEqual(coords,{lat:-23.26,lng:-47.3});
        assert.equal(calls[0].get('street'),'1840 AVENIDA EUGEN WISSMANN');
        assert.match(calls[1].get('q'),/AVENIDA EUGEN WISSMANN, 1840, Itu, SP/);
        assert.match(calls[2].get('q'),/EUGEN WISSMANN, 1840, São Luiz, Itu, SP, 13304270/);
        assert.deepEqual(waits,[1100,1100]);
    } finally { globalThis.fetch=original; }
});

test('automatic location rejects a whole street, wrong house number and another city', async () => {
    const original = globalThis.fetch;
    try {
        for (const result of [
            {addresstype:'road'},
            {addresstype:'building',address:{house_number:'99',city:'Curitiba'}},
            {addresstype:'building',address:{house_number:'123',city:'Outra cidade'}}
        ]) {
            globalThis.fetch=async()=>({ok:true,json:async()=>[{lat:'-25.4',lon:'-49.2',...result}]});
            assert.equal(await obterCoordsPorEndereco(endereco,{wait:async()=>{}}),null);
        }
        assert.equal(formatosBuscaEndereco({logradouro:'Rua'}).length,0);
    } finally { globalThis.fetch=original; }
});

test('indisponibilidade do provedor não é reportada como endereço inexistente', async () => {
    const original = globalThis.fetch;
    try {
        globalThis.fetch = async () => ({ ok: false, status: 429 });
        await assert.rejects(obterCoordsPorEndereco(endereco), /serviço de localização está indisponível/);
    } finally { globalThis.fetch = original; }
});
