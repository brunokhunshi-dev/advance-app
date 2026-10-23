import test from 'node:test';
import assert from 'node:assert/strict';
import {capturarLocalizacaoOpcional,montarAuditoriaLocalizacao} from '../src/services/location-audit.js';

const atividade={clienteId:'loja-1',ptvId:'ptv-1',data:new Date('2026-10-23T13:00:00Z'),tipoVisita:'Visita comercial'};
const cliente={nome:'Loja teste',enderecoCompleto:'Rua Exemplo, 10',cidade:'Indaiatuba',uf:'SP',statusLocalizacao:'confirmado'};
const base={atividadeId:'visita-1',atividade,cliente,sessao:{id:'ptv-1',uid:'auth-1'},agora:new Date('2026-10-23T14:00:00Z')};
const ref={lat:-23.1,lng:-47.2,incerto:false};

test('GPS indisponível não impede a coleta e o evento registra o motivo',async()=>{
    const localizacao=await capturarLocalizacaoOpcional(async()=>{throw Error('Permissão negada');},async()=>assert.fail('No reverse lookup without GPS'));
    assert.equal(localizacao.gpsStatus,'indisponivel');
    const log=montarAuditoriaLocalizacao({...base,evento:'checkin',localizacao,referencia:null});
    assert.equal(log.gps.lat,null);assert.match(log.gps.erro,/Permissão negada/);
    assert.equal(log.distanciaMetros,null);assert.equal(log.referencia.tipo,'ausente');
    assert.equal(log.localizacaoNaoBloqueante,true);assert.equal(log.registradoEm,base.agora);
});

test('GPS de baixa precisão e fora do raio gera auditoria sem rejeitar',async()=>{
    const localizacao=await capturarLocalizacaoOpcional(async()=>({coords:{latitude:-23.12,longitude:-47.2,accuracy:950},timestamp:Date.now()}),async()=> 'Rua observada');
    assert.equal(localizacao.gpsStatus,'baixa_precisao');
    const log=montarAuditoriaLocalizacao({...base,evento:'checkout',localizacao,referencia:ref});
    assert.ok(log.distanciaMetros>1500);
    assert.equal(log.foraRaioDeReferencia,true);
    assert.equal(log.gps.precisaoMetros,950);
    assert.equal(log.gps.endereco,'Rua observada');
    assert.equal(log.referencia.raioComparacaoMetros,1500);
});

test('Referência incerta preserva raio comparativo de 50 km sem bloquear',()=>{
    const localizacao={lat:-23.1,lng:-47.2,accuracy:80,gpsStatus:'disponivel'};
    const log=montarAuditoriaLocalizacao({...base,evento:'checkin',localizacao,referencia:{...ref,incerto:true}});
    assert.equal(log.referencia.tipo,'centro_cidade');assert.equal(log.referencia.raioComparacaoMetros,50000);
    assert.equal(log.foraRaioDeReferencia,false);
});

test('Endereço reverso fora do ar não impede geolocalização',async()=>{
    const localizacao=await capturarLocalizacaoOpcional(async()=>({coords:{latitude:1,longitude:2,accuracy:22}}),async()=>{throw Error('Offline');});
    assert.equal(localizacao.gpsStatus,'disponivel');assert.equal(localizacao.endereco,null);
});

test('GPS inválido fica indisponível e não é convertido em (0,0)',async()=>{
    const localizacao=await capturarLocalizacaoOpcional(async()=>({coords:{latitude:NaN,longitude:null,accuracy:10}}),async()=>assert.fail('No reverse lookup'));
    assert.equal(localizacao.gpsStatus,'invalido');
    const log=montarAuditoriaLocalizacao({...base,evento:'checkout',localizacao,referencia:ref});
    assert.equal(log.gps.lat,null);assert.equal(log.distanciaMetros,null);
});

test('Evento só aceita check-in e check-out',()=>{
    assert.throws(()=>montarAuditoriaLocalizacao({...base,evento:'exclusao',localizacao:null,referencia:ref}),/inválido/);
});
