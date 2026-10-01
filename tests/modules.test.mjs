import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createClientRepository } from '../src/data/client-repository.js';
import { createCnpjLookup } from '../src/data/cnpj-lookup.js';
import { mapSettled } from '../src/data/concurrency.js';
import { codigoCnpjLegado, cnpjValido } from '../src/domain/identifiers.js';
import { dadosAssistenciaDoRelatorio, secoesAssistenciaParaDocumento, colecaoRelatorioDaAtividade, relatorioValidoParaCheckout } from '../src/domain/reports.js';
import { aplicarFiltrosHistorico } from '../src/domain/history.js';
import { calculateTeamStatistics } from '../src/domain/team-statistics.js';
import { renderFichaAssistencia, preencherFormularioAssistencia, lerFormularioAssistencia } from '../src/ui/assistance.js';
import { renderizarVisualizadorVisita, prepararImpressaoVisualizador } from '../src/ui/visit-view.js';
import { updateChart } from '../src/ui/charts.js';
import { ADVANCE_SCHEMA } from '../tools/schema-exporter.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function mockDom(t) {
    const previous = globalThis.document;
    t.after(() => { globalThis.document = previous; });
    const elements = new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => [id, {
        textContent: '', innerHTML: '', value: '', style: {setProperty(name,value){this[name]=value;}}, blur() {}
    }]));
    globalThis.document = {
        getElementById: id => elements.get(id) || null,
        querySelectorAll: () => [], querySelector: () => null
    };
    return elements;
}

test('client cache expires and explicit refresh reads updated data', async () => {
    let time=0,reads=0;
    const repo=createClientRepository(async()=>({version:++reads}),{ttlMs:100,now:()=>time});
    assert.equal((await repo.get('c')).version,1);
    time=99; assert.equal((await repo.get('c')).version,1);
    time=100; assert.equal((await repo.get('c')).version,2);
    assert.equal((await repo.get('c',{refresh:true})).version,3);
});

test('CNPJ lookup preserves the production fix and legacy formats', async () => {
    const cnpj='11222333000181', calls=[];
    const lookup=createCnpjLookup(async (field,value)=>{
        calls.push([field,value]); return {empty:value!==codigoCnpjLegado(cnpj)};
    });
    assert.equal((await lookup(cnpj)).empty,false);
    assert.deepEqual(calls,[['codigoCnpj',cnpj],['cnpj',cnpj],['codigoCnpj',codigoCnpjLegado(cnpj)]]);
    assert.equal(cnpjValido(cnpj),true); assert.equal(cnpjValido('11111111111111'),false);
});

test('CNPJ lookup survives one denied format without hiding total failure', async t => {
    const previous=console.warn; console.warn=()=>{};t.after(()=>{console.warn=previous;});
    const lookup=createCnpjLookup(async field=>{if(field==='codigoCnpj')throw Error('denied');return {empty:false};});
    assert.equal((await lookup('11222333000181')).empty,false);
    await assert.rejects(createCnpjLookup(async()=>{throw Error('offline');})('11222333000181'),/offline/);
});

test('client enrichment has bounded concurrency and does not truncate at 200', async () => {
    let active=0,peak=0;
    const results=await mapSettled(Array.from({length:250},(_,i)=>i),6,async i=>{
        peak=Math.max(peak,++active);await new Promise(r=>setImmediate(r));active--;
        if(i===100)throw Error('missing');return i;
    });
    assert.equal(results.length,250); assert.ok(peak<=6);
    assert.equal(results[100].status,'rejected');assert.equal(results[249].value,249);
});

test('session cancellation stops scheduling new client requests',async()=>{
    let current=true,calls=0;
    await mapSettled([1,2,3,4],1,async()=>{calls++;current=false;},()=>current);
    assert.equal(calls,1);
});

test('legacy report collections and structured assistance data remain compatible', () => {
    assert.equal(colecaoRelatorioDaAtividade({relatorioId:'old',tipoVisita:'Treinamento'}),'relatorios');
    assert.equal(colecaoRelatorioDaAtividade({tipoVisita:'Treinamento'}),'relatorios_treinamentos');
    const data={produto:'Epóxi',queixa:'Falha',constatacoes:'Relato',clienteFinal:'Loja'};
    const report=secoesAssistenciaParaDocumento(data);
    assert.equal(dadosAssistenciaDoRelatorio(report).constatacoes,data.constatacoes);
    assert.equal(dadosAssistenciaDoRelatorio({assistenciaTecnica:data}).produto,'Epóxi');
    assert.equal(relatorioValidoParaCheckout(report,'Assistência técnica'),true);
});

test('history receives filters explicitly without changing its source records', () => {
    const visits=[{id:'a',status:'Cancelada'},{id:'b',status:'Concluída',resultado:'Resolvido'}];
    assert.deepEqual(aplicarFiltrosHistorico(visits,{periodo:'todos',resultado:'Cancelada'}).map(v=>v.id),['a']);
    assert.equal(aplicarFiltrosHistorico(visits).length,2);assert.equal(visits.length,2);
});

test('assistance markup escapes text once and uses the provided report only', () => {
    const report={atividadeId:'a1',conteudoRelatorio:{versao:1,blocos:[{kind:'text',text:'Relato A'}]}};
    const markup=renderFichaAssistencia({metodosLimpeza:['Água & sabão'],constatacoes:'Texto'}, {}, report);
    assert.match(markup,/Água &amp; sabão/);assert.doesNotMatch(markup,/&amp;amp;/);
    assert.match(markup,/Relato A/);
    assert.doesNotMatch(renderFichaAssistencia({constatacoes:'Texto B'}),/Relato A/);
});

test('assistance form retains entered fields after module extraction', t => {
    mockDom(t);
    const data={produto:'Epóxi',queixa:'Descascamento',constatacoes:'Relato técnico',clienteFinal:'Cliente'};
    preencherFormularioAssistencia(data);
    const saved=lerFormularioAssistencia({evidencias:{fotos:[{id:'legacy'}]}});
    for(const key of Object.keys(data))assert.equal(saved[key],data[key]);
    assert.equal(saved.fotosSelecionadas[0].id,'legacy');
});

test('viewer and print use explicit report/client/professional data', t => {
    const el=mockDom(t);
    const activity={id:'v1',tipoVisita:'Assistência técnica',status:'Concluída'};
    const client={nome:'Loja A',enderecoCompleto:'Rua A'};
    const report=secoesAssistenciaParaDocumento({produto:'Epóxi',queixa:'Queixa',constatacoes:'Relato correto'});
    renderizarVisualizadorVisita(activity,client,report);
    prepararImpressaoVisualizador(activity,client,report,'Técnico A');
    assert.equal(el.get('visu-cliente').textContent,'Loja A');
    assert.match(el.get('visu-at-relatorio-visual').innerHTML,/Relato correto/);
    assert.equal(el.get('pdf-tecnico').textContent,'Técnico A');
    assert.equal(el.get('pdf-at-constatacoes').textContent,'Relato correto');
});

test('dashboard computes team totals without DOM dependencies',()=>{
    const professional={name:'A'};
    const stats=calculateTeamStatistics([
        {professionalId:'p',professional,status:'Concluída',type:'Treinamento',clientId:'c',durationMinutes:30},
        {professionalId:'p',professional,status:'Pendente',type:'Visita comercial',clientId:'c'}
    ]);
    assert.equal(stats[0].total,2);assert.equal(stats[0].clientCount,1);
    assert.equal(stats[0].completionRate,50);assert.equal(stats[0].averageDuration,30);
});

test('charts update in place while changed types are replaced',()=>{
    let created=0,destroyed=0,updated=0;
    class Chart {constructor(canvas,config){this.config=config;created++;}update(mode){assert.equal(mode,'none');updated++;}destroy(){destroyed++;}}
    const charts={};const config={type:'bar',data:{labels:['A']},options:{}};
    const first=updateChart(charts,'team',{},config,Chart);
    assert.equal(updateChart(charts,'team',{},config,Chart),first);
    assert.equal(created,1);assert.equal(updated,1);
    updateChart(charts,'team',{}, {...config,type:'pie'},Chart);
    assert.equal(created,2);assert.equal(destroyed,1);
});

test('schema documents current CNPJ fields and all report block formats',()=>{
    assert.ok(ADVANCE_SCHEMA.collections.clientes.fields.cnpj);
    for(const collection of ['relatorios_comerciais','relatorios_treinamentos','relatorios_assistencia_tecnica']){
        assert.ok(ADVANCE_SCHEMA.collections[collection].fields.conteudoRelatorio);
    }
});
