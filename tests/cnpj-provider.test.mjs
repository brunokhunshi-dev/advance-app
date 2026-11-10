import test from 'node:test';
import assert from 'node:assert/strict';
import { consultarDadosCnpj } from '../src/services/cnpj-provider.js';

test('consulta BrasilAPI e normaliza dados', async () => {
    let calls=0;
    const dados=await consultarDadosCnpj('123', async () => { calls++; return {razao_social:'Loja',municipio:'Itu',uf:'SP'}; });
    assert.equal(dados.nome,'Loja'); assert.equal(dados.cidade,'Itu'); assert.equal(calls,1);
});
test('usa CNPJ.ws quando BrasilAPI falha', async () => {
    let calls=0;
    const dados=await consultarDadosCnpj('123', async () => { if (++calls===1) throw Error('offline'); return {razao_social:'Loja',estabelecimento:{cidade:{nome:'Itu'},estado:{sigla:'SP'}}}; });
    assert.equal(dados.cidade,'Itu'); assert.equal(calls,2);
});
test('falha total permite nova tentativa', async () => {
    await assert.rejects(consultarDadosCnpj('123',async()=>{throw Error('offline');}));
    const dados=await consultarDadosCnpj('123',async()=>({razao_social:'Loja'}));
    assert.equal(dados.nome,'Loja');
});
