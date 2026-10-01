import test from 'node:test';
import assert from 'node:assert/strict';
import { obterCoordsPorEndereco } from '../src/services/location.js';

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
            assert.equal(await obterCoordsPorEndereco(endereco), null);
        }
    } finally { globalThis.fetch = original; }
});

test('indisponibilidade do provedor não é reportada como endereço inexistente', async () => {
    const original = globalThis.fetch;
    try {
        globalThis.fetch = async () => ({ ok: false, status: 429 });
        await assert.rejects(obterCoordsPorEndereco(endereco), /serviço de localização está indisponível/);
    } finally { globalThis.fetch = original; }
});
