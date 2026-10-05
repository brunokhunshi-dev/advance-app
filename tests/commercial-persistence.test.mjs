import test from 'node:test';
import assert from 'node:assert/strict';
import {persistCommercialMedia} from '../src/services/commercial-save.js';
import {CommercialReport} from '../src/ui/commercial-report.js';
import {modulosComerciaisPendentes, relatorioValidoParaCheckout} from '../src/domain/reports.js';
const draft = () => ({name:'Ana', role:'', goal:'', products:{low:[],missing:[],slow:[]}, low:'',missing:'',slow:'', organization:'', materials:[], other:'', text:'', photos:[],blocks:[],feedback:[],pending:''});
const media = () => {
    const calls=[];
    return {calls, local:id => ({file:id,thumbnail:id+'-thumb'}),
        upload:async (activity,id) => {calls.push('upload:'+id);return {key:activity+'/'+id,thumbnailKey:activity+'/'+id+'/thumb'};},
        clearLocal:id => calls.push('clear:'+id), delete:async (activity,id) => calls.push('delete:'+id)};
};
const controller = () => Object.assign(Object.create(CommercialReport.prototype), {
    drafts:new Map(), saved:new Map(),initial:new Map(),revisions:new Map(),baseReports:new Map(),staged:new Map(),photoGeneration:0
});
test('saved partial modules and photos can be restored in a fresh controller after refresh', async () => {
    const data=draft();data.photos=[{kind:'media',id:'exposure',storage:'pending'}];data.blocks=[{kind:'text',text:'Relato'},{kind:'media',id:'free',storage:'pending'}];
    const store=media();let database;
    await persistCommercialMedia({activityId:'visit',data,media:store,commit:async prepared => {
        database={atividadeId:'visit',textoAtual:prepared.text,dadosComerciais:{versao:1,...prepared},conteudoRelatorio:{versao:1,blocos:prepared.blocks}};
        return database;
    }});
    const afterRefresh=controller();afterRefresh.hydrate('visit',JSON.parse(JSON.stringify(database)));
    assert.equal(afterRefresh.hasSaved('visit'),true);
    const restored=afterRefresh.drafts.get('visit');
    assert.equal(restored.name,'Ana');
    assert.equal(restored.photos[0].storage,'r2');assert.equal(restored.photos[0].key,'visit/exposure');
    assert.equal(restored.blocks[1].key,'visit/free');
    assert.equal(relatorioValidoParaCheckout(database,'Visita comercial'),true,'partial saves count as reports');
    assert.equal(modulosComerciaisPendentes(database).length,3,'partial reports cannot complete checkout');
    assert.equal(data.photos[0].storage,'pending','input draft is not mutated');
});
test('failed database write rolls back uploads and preserves files for retry', async () => {
    const data=draft();data.photos=[{kind:'media',id:'new',storage:'pending'}];
    const store=media();
    await assert.rejects(persistCommercialMedia({activityId:'visit',data,base:{photos:[{kind:'media',id:'old',storage:'r2'}]},media:store,commit:async()=>{throw new Error('conflict');}}),/conflict/);
    assert.deepEqual(store.calls,['upload:new','delete:new']);
    assert.equal(data.photos[0].storage,'pending');
});
test('removed photos are deleted only after commit, persisted files are not uploaded again', async () => {
    const data=draft();data.photos=[{kind:'media',id:'kept',storage:'r2'}];
    const store=media();
    await persistCommercialMedia({activityId:'visit',data,base:{photos:[{id:'removed',storage:'r2'},{id:'kept',storage:'r2'}]},media:store,commit:async()=>{store.calls.push('commit');return {};}});
    assert.deepEqual(store.calls,['commit','delete:removed']);
});
test('upload failure rolls back previous files without publishing metadata', async () => {
    const data=draft();data.photos=[{kind:'media',id:'first',storage:'pending'},{kind:'media',id:'second',storage:'pending'}];
    const store=media();const upload=store.upload;store.upload=async (...args)=>{if(args[1]==='second')throw new Error('network');return upload(...args);};
    let committed=false;
    await assert.rejects(persistCommercialMedia({activityId:'visit',data,media:store,commit:async()=>{committed=true;}}),/network/);
    assert.equal(committed,false);assert.deepEqual(store.calls,['upload:first','delete:first']);
});
test('failure to persist never marks the controller draft as saved', async () => {
    const report=controller();report.key='visit';report.data=draft();report.reviewCallbacks={persist:async()=>{throw new Error('permission denied');}};
    report.root={querySelectorAll:()=>[]};let error;report.status=text=>{error=text;};report.onSave=()=>assert.fail('cannot navigate on failure');
    await report.savePersisted();
    assert.equal(report.hasSaved('visit'),false);assert.equal(error,'permission denied');assert.equal(report.saving,false);
});
test('server checkout validation applies conditional products/photos and keeps free report optional', () => {
    const data={...draft(),role:'Gerente',goal:'Orientação aos vendedores',low:'Não',missing:'Não',slow:'Não',organization:'Organizada e visível'};
    const report={dadosComerciais:{versao:1,...data}};
    assert.deepEqual(modulosComerciaisPendentes(report),[]);
    report.dadosComerciais.low='Sim';report.dadosComerciais.organization='Ausência de exposição';
    assert.deepEqual(modulosComerciaisPendentes(report),['Disponibilidade dos produtos','Exposição e materiais']);
    report.dadosComerciais.products.low=['Exemplo'];report.dadosComerciais.photos=[{id:'p',storage:'r2'}];
    assert.deepEqual(modulosComerciaisPendentes(report),[]);
    report.dadosComerciais.organization='Não foi verificado';
    assert.deepEqual(modulosComerciaisPendentes(report),['Exposição e materiais']);
});

test('editable nested module data never mutates the saved conflict baseline',()=>{
    const data=draft();data.photos=[{kind:'media',id:'photo',storage:'r2'}];data.products.low=[{id:'p1',title:'Epóxi Total'}];data.materials=['Catálogo'];
    const persisted={dadosComerciais:{versao:1,...data},conteudoRelatorio:{versao:1,blocos:[{kind:'text',text:'Original'}]},textoAtual:'Original'};
    const before=JSON.stringify(persisted);const report=controller();report.hydrate('visit',persisted,true);
    const editable=report.drafts.get('visit');
    editable.products.low[0].title='Alterado';editable.products.low.push({id:'p2',title:'PU Total'});
    editable.photos.splice(0,1);editable.materials.push('Outro');editable.blocks[0].text='Editado';
    assert.equal(JSON.stringify(report.baseReports.get('visit')),before);
    assert.equal(JSON.stringify(persisted),before);
});
