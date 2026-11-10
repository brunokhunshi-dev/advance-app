import test from 'node:test';
import assert from 'node:assert/strict';
import { resolverLocalizacao } from '../src/ui/manual-location.js';
import { exigirLocalizacaoVisita } from '../src/domain/visit-location.js';
import { capturarLocalizacaoOpcional, montarAuditoriaLocalizacao } from '../src/services/location-audit.js';

test('permissão negada não solicita endereço', async () => {
    await assert.rejects(resolverLocalizacao({codigoGps:1},()=>assert.fail('não deve abrir'),()=>{}), /Ative a localização/);
});
test('captura preserva código de permissão e auditoria identifica endereço manual', async () => {
    const negada=await capturarLocalizacaoOpcional(async()=>{ throw Object.assign(new Error('negado'),{codigoGps:1}); }, async()=>null);
    assert.equal(negada.codigoGps,1);
    const localizacao={lat:1,lng:2,origem:'endereco_manual',endereco:'Rua A, 1'};
    const log=montarAuditoriaLocalizacao({evento:'checkin',localizacao,referencia:{lat:1,lng:2},agora:new Date(),raioMetros:1000});
    assert.equal(log.gps.lat,null); assert.equal(log.enderecoManual.lat,1);
});
test('erro técnico solicita endereço e valida distância', async () => {
    const local=await resolverLocalizacao({codigoGps:3,gpsErro:'timeout'},async()=>({logradouro:'Rua A',numero:'1',cidade:'Itu',uf:'SP'}),async()=>({lat:1,lng:2}));
    assert.equal(local.origem,'endereco_manual');
    assert.ok(exigirLocalizacaoVisita(local,[{lat:1,lng:2}],'fora'));
    assert.throws(()=>exigirLocalizacaoVisita(local,[{lat:3,lng:2}],'fora'),/fora/);
});
