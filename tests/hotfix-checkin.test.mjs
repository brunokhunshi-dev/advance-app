import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {montarAuditoriaLocalizacao} from '../src/services/location-audit.js';
import {coordenadasValidas,referenciaLocalizacao} from '../src/services/location.js';
import {normalizarTipoVisita} from '../src/domain/reports.js';

const source=readFileSync(new URL('../script.js',import.meta.url),'utf8');
const inicio=source.indexOf('async function processarCheckin(');
const fim=source.indexOf('async function encerrarVisita(',inicio);
if(inicio < 0 || fim < 0) throw Error('Função de check-in não localizada');

function create({localizacao,status='Pendente',client={lat:-23.1,lng:-47.2,nome:'Loja',cidade:'Itu',uf:'SP'}}={}) {
    const writes=[]; let commitCount=0;
    const atividade={ptvId:'promotor',clienteId:'cliente',status,tipoVisita:'Visita comercial'};
    const context=vm.createContext({
        document:{getElementById:()=>({textContent:'',style:{display:'flex'}})},
        estadoNavegacaoAtual:null, nomeUsuarioLogado:'Colaborador', db:{}, atividadeSelecionadaId:'visita',
        coordenadasValidas,referenciaLocalizacao,montarAuditoriaLocalizacao,normalizarTipoVisita,
        serverTimestamp:()=>new Date('2026-10-23T12:00:00Z'),
        doc:(_,collection,id)=>({collection,id}),collection:()=>{},query:()=>{},where:()=>{},
        getDocs:async()=>({docs:[]}),sessaoValida:()=>true,exigirSessao(){},
        obterCliente:async()=>client,centroParaCliente:async()=>null,
        validarResponsavel:()=>{},activityRepository:{invalidate(){}},
        mostrarApenasTela:()=>{},carregarAtividadesPendentes:async()=>{},
        runTransaction:async(_,callback)=>{
            const pending=[];
            await callback({
                get:async ref=>({exists:()=>true,data:()=>ref.collection==='atividades'?atividade:client}),
                set:(ref,data)=>pending.push({op:'set',ref,data}),
                update:(ref,data)=>pending.push({op:'update',ref,data})
            });
            writes.push(...pending);commitCount++;
        }
    });
    vm.runInContext(source.slice(inicio,fim),context);
    return {run:()=>context.processarCheckin(localizacao || {lat:null,lng:null,accuracy:null,endereco:null,gpsStatus:'indisponivel',gpsErro:'GPS negado'},'visita','cliente',{id:'promotor',uid:'auth-1'}),writes,commits:()=>commitCount};
}

test('check-in without GPS commits activity and matching audit event together',async()=>{
    const app=create();await app.run();
    assert.equal(app.commits(),1);
    assert.equal(app.writes.find(w=>w.ref.collection==='atividades').data.status,'Em andamento');
    const audit=app.writes.find(w=>w.ref.collection==='auditoria_localizacao');
    assert.equal(audit.ref.id,'visita_checkin');assert.equal(audit.data.gps.lat,null);
    assert.equal(audit.data.gps.status,'indisponivel');
    assert.equal(audit.data.distanciaMetros,null);
});

test('check-in many kilometres away commits normally and records deviation',async()=>{
    const app=create({localizacao:{lat:-22.8,lng:-47.2,accuracy:950,gpsStatus:'baixa_precisao',endereco:'Rua remota'}});
    await app.run();assert.equal(app.commits(),1);
    const audit=app.writes.find(w=>w.ref.collection==='auditoria_localizacao').data;
    assert.equal(audit.foraRaioDeReferencia,true);assert.ok(audit.distanciaMetros>1500);
    assert.equal(audit.coordenadasCadastro.lat,-23.1);
});

test('visit outside pending state remains blocked and does not write audit',async()=>{
    const app=create({status:'Concluída'});
    await assert.rejects(app.run(),/iniciada ou encerrada/);
    assert.equal(app.commits(),0);assert.equal(app.writes.length,0);
});
