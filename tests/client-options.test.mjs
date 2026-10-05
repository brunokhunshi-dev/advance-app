import test from 'node:test';
import assert from 'node:assert/strict';
import { filtrarClientes, opcaoCliente, tituloCliente, cnpjCliente } from '../src/ui/client-options.js';
const lojas = [
    { id: 'filial1', nome: 'Marquezim Tintas', cidade: 'Barretos', uf: 'SP', enderecoCompleto: 'Via Conselheiro Antônio Prado, 1088', codigoCnpj: '07705871003841' },
    { id: 'filial2', nome: 'Marquezim Tintas', cidade: 'Barretos', uf: 'SP', enderecoCompleto: 'Rua 40, 84 — Jardim Alvorada', codigoCnpj: '07705871004490' },
    { id: 'filial3', nome: 'Marquezim Tintas', cidade: 'São José do Rio Preto', uf: 'SP', enderecoCompleto: 'Av. Lino José de Seixas, 1235', codigoCnpj: '07705871003175' }
];
test('branch search accepts city, street, name and formatted or unformatted CNPJ', () => {
    assert.deepEqual(filtrarClientes(lojas, 'marquezim barretos').map(c => c.id), ['filial1', 'filial2']);
    assert.equal(filtrarClientes(lojas, 'ANTONIO 1088')[0].id, 'filial1');
    assert.equal(filtrarClientes(lojas, '07.705.871/0044-90')[0].id, 'filial2');
    assert.equal(filtrarClientes(lojas, '07705871004490')[0].id, 'filial2');
    assert.equal(filtrarClientes(lojas, 'sao jose')[0].id, 'filial3');
});
test('options show full branch address and formatted real CNPJ without exposing legacy codes', () => {
    assert.equal(tituloCliente(lojas[1]), 'Marquezim Tintas — Barretos/SP');
    assert.match(opcaoCliente(lojas[1]), /Rua 40, 84/);
    assert.match(opcaoCliente(lojas[1]), /07\.705\.871\/0044-90/);
    assert.equal(cnpjCliente({ codigoCnpj: 'legacy-code' }), '');
    assert.doesNotMatch(opcaoCliente({ nome: 'Provisório' }), /CNPJ:/);
});
test('client fields are escaped before rendering options', () => {
    const html = opcaoCliente({ nome: '<img>', cidade: 'A & B', enderecoCompleto: '<script>alert(1)</script>' });
    assert.doesNotMatch(html, /<img>|<script>/);
    assert.match(html, /&lt;img&gt;/);
    assert.match(html, /A &amp; B/);
});
