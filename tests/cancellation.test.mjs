import test from 'node:test';
import assert from 'node:assert/strict';
import { cancelarAgendamento } from '../src/services/cancellation.js';
import { dadosCancelamento, motivoCancelamentoTexto, MOTIVOS_CANCELAMENTO } from '../src/domain/cancellation.js';
import { aplicarFiltrosHistorico, obterResultadoHistorico } from '../src/domain/history.js';
import { renderizarVisualizadorVisita } from '../src/ui/visit-view.js';

const original = { ptvId:'p1', status:'Pendente', tipoVisita:'Treinamento', data:new Date(2026,9,20), nota:'Manter nota', clienteId:'loja' };
function setup(record = original, validateSession = () => {}) {
    let writes = 0;
    let current = structuredClone(record);
    return {
        options:{ usuarioId:'p1', motivo:'Loja fechada', reference:'atividades/a1', validateSession,
            transaction: async callback => callback({
                get:async ref => { assert.equal(ref,'atividades/a1'); return {exists:()=>Boolean(current),data:()=>current}; },
                update:(ref,data)=>{ assert.equal(ref,'atividades/a1'); writes++; current={...current,...data}; },
                delete:()=>assert.fail('Cancelamento não pode excluir a atividade'),
                set:()=>assert.fail('Cancelamento não pode mover a atividade para a lixeira')
            })
        }, get record(){return current;}, get writes(){return writes;}
    };
}

test('cancellation persists reason, author and date in the same record, preserving scheduling and notes', async () => {
    const s=setup(), agora=new Date('2026-10-07T16:00:00Z');
    await cancelarAgendamento({...s.options,agora});
    assert.equal(s.writes,1);
    assert.equal(s.record.status,'Cancelada');
    assert.equal(s.record.motivoCancelamento,'Loja fechada');
    assert.equal(s.record.canceladoPor,'p1');
    assert.equal(s.record.canceladoEm,agora);
    assert.equal(s.record.nota,original.nota);
    assert.deepEqual(s.record.data,original.data);
    assert.equal(s.record.tipoVisita,'Treinamento');
});

test('fresh transaction state rejects concluded, cancelled, missing and other-owner activities', async () => {
    for(const record of [null,{...original,ptvId:'p2'},...['Concluída','Cancelada'].map(status=>({...original,status}))]) {
        const s=setup(record);
        await assert.rejects(cancelarAgendamento(s.options));
        assert.equal(s.writes,0);
    }
});

test('in-progress activity can be cancelled while preserving check-in and linked report', async () => {
    const checkinDataHora=new Date('2026-10-07T16:00:00Z');
    const s=setup({...original,status:'Em andamento',checkinDataHora,checkinGps:'-23,-47',relatorioId:'r1'});
    await cancelarAgendamento(s.options);
    assert.equal(s.record.status,'Cancelada');
    assert.equal(s.record.relatorioId,'r1');
    assert.equal(s.record.checkinGps,'-23,-47');
    assert.deepEqual(s.record.checkinDataHora,checkinDataHora);
    assert.equal(s.writes,1);
});

test('invalid reason and empty or oversized Other description cannot write; standard reasons discard stale detail', async () => {
    for(const [motivo,detalhe] of [['',''],['Desconhecido',''],['Outro','  '],['Outro','a'.repeat(601)]]) {
        const s=setup(); await assert.rejects(cancelarAgendamento({...s.options,motivo,detalhe})); assert.equal(s.writes,0);
    }
    const s=setup(); await cancelarAgendamento({...s.options,motivo:'Outro',detalhe:'  Imprevisto no deslocamento  '});
    assert.equal(motivoCancelamentoTexto(s.record),'Outro: Imprevisto no deslocamento');
    for(const motivo of MOTIVOS_CANCELAMENTO.filter(m=>m!=='Outro')) assert.equal(dadosCancelamento(original,{motivo,detalhe:'anterior',usuarioId:'p1'}).detalheCancelamento,'');
});

test('session change while reading fresh state prevents cancellation', async () => {
    let calls=0; const s=setup(original,()=>{if(++calls===2)throw Error('Sessão mudou');});
    await assert.rejects(cancelarAgendamento(s.options),/Sessão mudou/);
    assert.equal(s.writes,0);
});

test('type filter combines with result and handles legacy commercial and assistance types', () => {
    const records=[
        {id:'commercial',tipoVisita:'Visita técnica',status:'Cancelada',resultado:'Resolvido'},
        {id:'training',tipoVisita:'Treinamento',status:'Concluída'},
        {id:'assistance',tipoVisita:'assistencia tecnica',status:'Cancelada'}
    ];
    assert.equal(obterResultadoHistorico(records[0]),'Cancelada');
    for(const [tipo,id] of [['Visita comercial','commercial'],['Treinamento','training'],['Assistência técnica','assistance']]) {
        assert.deepEqual(aplicarFiltrosHistorico(records,{periodo:'todos',resultado:'todos',tipo}).map(r=>r.id),[id]);
    }
    assert.deepEqual(aplicarFiltrosHistorico(records,{periodo:'todos',resultado:'Cancelada',tipo:'Treinamento'}),[]);
    assert.equal(aplicarFiltrosHistorico(records).length,3);
    assert.equal(records[0].resultado,'Resolvido');
});

test('history viewer shows cancellation text safely and clears its section when opening another visit', t => {
    const elements=new Map();
    const previous=globalThis.document;
    globalThis.document={getElementById(id){
        if(!elements.has(id))elements.set(id,{style:{},hidden:false,textContent:'',innerHTML:'',blur(){}});
        return elements.get(id);
    }};
    t.after(()=>{ if(previous===undefined)delete globalThis.document; else globalThis.document=previous; });
    renderizarVisualizadorVisita({...original,id:'a1',status:'Cancelada',motivoCancelamento:'Outro',detalheCancelamento:'<img src=x onerror=alert(1)>',canceladoEm:new Date()}, {nome:'Loja'}, null);
    assert.equal(elements.get('visu-cancelamento').hidden,false);
    assert.equal(elements.get('visu-motivo-cancelamento').textContent,'Outro: <img src=x onerror=alert(1)>');
    assert.equal(elements.get('visu-motivo-cancelamento').innerHTML,'');
    assert.equal(elements.get('visu-horarios').hidden,true);
    assert.equal(elements.get('visu-titulo').textContent,'Agendamento cancelado');
    renderizarVisualizadorVisita({...original,id:'a2',status:'Concluída'}, {nome:'Outra loja'}, null);
    assert.equal(elements.get('visu-cancelamento').hidden,true);
    assert.equal(elements.get('visu-horarios').hidden,false);
    assert.equal(elements.get('visu-titulo').textContent,'Sua visita');
});
