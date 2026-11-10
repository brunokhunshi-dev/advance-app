import {colecaoCliente, gerarIdClienteSemCnpj} from '../src/domain/identifiers.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {montarAuditoriaLocalizacao} from '../src/services/location-audit.js';
import * as visitLocation from '../src/domain/visit-location.js';
import {coordenadasValidas} from '../src/services/location.js';
import {normalizarTipoVisita} from '../src/domain/reports.js';

const source=readFileSync(new URL('../script.js',import.meta.url),'utf8');
const inicio=source.indexOf('async function processarCheckin(');
const fim=source.indexOf('async function encerrarVisita(',inicio);
if(inicio < 0 || fim < 0) throw Error('Função de check-in não localizada');

function create({localizacao,motivo,clienteId='cliente',status='Pendente',client={lat:-23.1,lng:-47.2,nome:'Loja',cidade:'Itu',uf:'SP'}}={}) {
    const writes=[], reads=[]; let commitCount=0,copyCount=0;
    const atividade={ptvId:'promotor',clienteId,status,tipoVisita:'Visita comercial'};
    const context=vm.createContext({
        document:{getElementById:()=>({textContent:'',style:{display:'flex'}})},
        estadoNavegacaoAtual:null, nomeUsuarioLogado:'Colaborador', db:{}, atividadeSelecionadaId:'visita',
        ...visitLocation,colecaoCliente,coordenadasValidas,montarAuditoriaLocalizacao,normalizarTipoVisita,
        serverTimestamp:()=>new Date('2026-10-23T12:00:00Z'),
        setDoc:async()=>{copyCount++;throw Error('permission-denied: audit collection');},
        console:{warn(){}}, 
        doc:(_,collection,id)=>({collection,id}),collection:()=>{},query:()=>{},where:()=>{},
        getDocs:async()=>({docs:[]}),sessaoValida:()=>true,exigirSessao(){},
        validarResponsavel:()=>{},activityRepository:{invalidate(){}},
        mostrarApenasTela:()=>{},carregarAtividadesPendentes:async()=>{},
        runTransaction:async(_,callback)=>{
            const pending=[];
            const result=await callback({
                get:async ref=>{reads.push(ref);return {exists:()=>true,data:()=>ref.collection==='atividades'?atividade:client};},
                set:(ref,data)=>pending.push({op:'set',ref,data}),
                update:(ref,data)=>pending.push({op:'update',ref,data})
            });
            writes.push(...pending);commitCount++;return result;
        }
    });
    vm.runInContext(source.slice(inicio,fim),context);
    return {run:()=>context.processarCheckin(localizacao || {lat:null,lng:null,accuracy:null,endereco:null,gpsStatus:'indisponivel',gpsErro:'GPS negado'},'visita',clienteId,{id:'promotor',uid:'auth-1'},motivo),writes,reads,commits:()=>commitCount,copies:()=>copyCount};
}

test('check-in without GPS requires the manual request and performs no normal write',async()=>{
    const app=create();
    await assert.rejects(app.run(), /Ative a localização/);
    assert.equal(app.writes.length, 0);
});

test('manual check-in starts the visit immediately and saves its review and audit data together',async()=>{
    const app=create({motivo:'GPS indisponível'});await app.run();
    const saved = app.writes.find(w=>w.ref.collection==='atividades').data;
    assert.equal(saved.checkinAnaliseStatus,'Pendente de análise');
    assert.equal(saved.motivoCheckinManual,'GPS indisponível');
    assert.equal(saved['auditoriaLocalizacao.checkin'].modo,'manual');
    assert.equal(app.commits(),1);
    assert.equal(app.writes.find(w=>w.ref.collection==='atividades').data.status,'Em andamento');
    const audit=app.writes.find(w=>w.ref.collection==='atividades').data['auditoriaLocalizacao.checkin'];
    assert.equal(audit.atividadeId,'visita');assert.equal(audit.gps.lat,null);
    assert.equal(audit.gps.status,'indisponivel');
    assert.equal(audit.distanciaMetros,null);
    assert.equal(app.copies(),1);
    assert.equal(app.writes.some(w=>w.ref.collection==='auditoria_localizacao'),false);
});

test('normal check-in accepts a location within 1 km and rejects locations beyond it', async () => {
    const perto=create({localizacao:{lat:-23.092,lng:-47.2,accuracy:20,gpsStatus:'disponivel',endereco:'Loja'}});
    await perto.run();
    assert.equal(perto.commits(),1);
    const audit=perto.writes[0].data['auditoriaLocalizacao.checkin'];
    assert.equal(audit.foraRaioDeReferencia,false);
    assert.equal(audit.referencia.raioComparacaoMetros,1000);

    const longe=create({localizacao:{lat:-23.09,lng:-47.2,accuracy:20,gpsStatus:'disponivel',endereco:'Rua remota'}});
    await assert.rejects(longe.run(), /até 1 km/);
    assert.equal(longe.writes.length,0);
});

test('visit outside pending state remains blocked and does not write audit',async()=>{
    const app=create({status:'Concluída'});
    await assert.rejects(app.run(),/iniciada ou encerrada/);
    assert.equal(app.commits(),0);assert.equal(app.writes.length,0);
});

test('check-in reads clients without CNPJ from their dedicated collection', async () => {
    const clienteId = gerarIdClienteSemCnpj('novo');
    const app = create({clienteId, localizacao:{lat:-23.1,lng:-47.2,accuracy:20,gpsStatus:'disponivel'}});
    await app.run();
    assert.equal(app.reads[1].collection, 'clientes_sem_cnpj');
    assert.equal(app.reads[1].id, clienteId);
    assert.equal(colecaoCliente('CLI-PROV-LEGADO'), 'clientes');
});
