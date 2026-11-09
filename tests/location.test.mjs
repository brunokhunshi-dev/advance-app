import test from 'node:test';
import assert from 'node:assert/strict';
import { buscarEnderecoPorCep, obterCoordsPorEndereco, obterEnderecoPorCoords } from '../src/services/location.js';

const endereco = { logradouro: 'Rua das Flores', numero: '123', cidade: 'Curitiba', uf: 'PR', bairro: 'Centro', cep: '80000-001' };
const loja = { lat: -25.4, lon: -49.2, result_type: 'building', street: 'Rua das Flores', housenumber: '123', city: 'Curitiba', state_code: 'PR', postcode: '80000-001' };
const json = data => ({ ok: true, json: async () => data });

function simularGeoapify(t, consultar, config = { apiKey: 'chave-de-teste' }) {
    t.mock.method(globalThis, 'fetch', async url => {
        const parsed = new URL(url);
        if (parsed.pathname.endsWith('/geoapify-config.json')) return json(config);
        return consultar(parsed);
    });
}

test('geocodificação usa campos estruturados e preserva número e CEP', async t => {
    simularGeoapify(t, url => {
        assert.equal(url.origin, 'https://api.geoapify.com');
        assert.equal(url.pathname, '/v1/geocode/search');
        assert.deepEqual(Object.fromEntries(url.searchParams), {
            street: 'Rua das Flores', housenumber: '123', city: 'Curitiba', state: 'PR',
            postcode: '80000-001', limit: '5', format: 'json', lang: 'pt',
            apiKey: 'chave-de-teste', filter: 'countrycode:br'
        });
        return json({ results: [{ ...loja, housenumber: '321' }, loja] });
    });
    assert.deepEqual(await obterCoordsPorEndereco(endereco), { lat: -25.4, lng: -49.2 });
});

test('somente coordenadas válidas de um imóvel no endereço consultado representam a loja', async t => {
    simularGeoapify(t, () => json({ results: [
        { ...loja, lat: 'bad' },
        { ...loja, result_type: 'street' },
        { ...loja, result_type: 'postcode' },
        { ...loja, result_type: 'city' },
        { ...loja, street: 'Rua das Palmeiras' },
        { ...loja, city: 'Londrina' },
        { ...loja, state_code: 'SP' },
        { ...loja, postcode: '80000-002' }
    ] }));
    assert.equal(await obterCoordsPorEndereco(endereco), null);
    assert.equal(await obterCoordsPorEndereco({}), null);
});

test('indisponibilidade do provedor não é reportada como endereço inexistente', async t => {
    simularGeoapify(t, () => ({ ok: false, status: 429 }));
    await assert.rejects(obterCoordsPorEndereco(endereco), /serviço de localização está indisponível/);
});

test('CEP usa o resultado exato do Geoapify e retorna somente os campos do formulário', async t => {
    simularGeoapify(t, url => {
        assert.equal(url.origin, 'https://api.geoapify.com');
        assert.equal(url.searchParams.get('postcode'), '80000-001');
        assert.equal(url.searchParams.get('filter'), 'countrycode:br');
        return json({ results: [
            { ...loja, postcode: '80000-002' },
            { ...loja, street: undefined },
            { ...loja, suburb: 'Centro', state_code: 'BR-PR' }
        ] });
    });
    assert.deepEqual(await buscarEnderecoPorCep('80000001'), {
        logradouro: 'Rua das Flores', bairro: 'Centro', cidade: 'Curitiba', uf: 'PR'
    });
});

test('CEP incompleto no Geoapify consulta o ViaCEP', async t => {
    simularGeoapify(t, url => {
        if (url.hostname === 'api.geoapify.com') return json({ results: [{ ...loja, street: undefined }] });
        assert.equal(url.href, 'https://viacep.com.br/ws/80000001/json/');
        return json({ logradouro: 'Rua das Flores', bairro: 'Centro', localidade: 'Curitiba', uf: 'PR' });
    });
    assert.deepEqual(await buscarEnderecoPorCep('80000-001'), {
        logradouro: 'Rua das Flores', bairro: 'Centro', cidade: 'Curitiba', uf: 'PR'
    });
});

test('CEP inválido ou inexistente permite preenchimento manual, inclusive sem chave', async t => {
    simularGeoapify(t, url => {
        assert.equal(url.href, 'https://viacep.com.br/ws/80000001/json/');
        return json({ erro: true });
    }, {});
    assert.equal(await buscarEnderecoPorCep('123'), null);
    assert.equal(await buscarEnderecoPorCep('80000-001'), null);
});

test('geocodificação reversa converte GPS para endereço no Geoapify', async t => {
    simularGeoapify(t, url => {
        assert.equal(url.pathname, '/v1/geocode/reverse');
        assert.equal(url.searchParams.get('lat'), '-25.4');
        assert.equal(url.searchParams.get('lon'), '-49.2');
        return json({ results: [{ formatted: 'Rua das Flores, 123, Curitiba' }] });
    });
    assert.equal(await obterEnderecoPorCoords(-25.4, -49.2), 'Rua das Flores, 123, Curitiba');
});
