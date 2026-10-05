import test from 'node:test';
import assert from 'node:assert/strict';
import { CommercialReport } from '../src/ui/commercial-report.js';
const draft = () => ({name:'',role:'',goal:'',low:'',missing:'',slow:'',products:{low:[],missing:[],slow:[]},organization:'',materials:[],other:'',text:'',photos:[],blocks:null});
const complete = () => ({...draft(),name:'Ana',role:'Gerente',goal:'Orientação aos vendedores',low:'Não',missing:'Não',slow:'Não',organization:'Organizada e visível'});
const controller = data => Object.assign(Object.create(CommercialReport.prototype), {key:'visit',data,saved:new Map([['visit',JSON.stringify(data)]])});
test('partial saved report remains blocked only at checkout', () => {
    const report=controller({...draft(),name:'Ana'});
    assert.deepEqual(report.pendingCheckoutModules(),['Contato na loja','Disponibilidade dos produtos','Exposição e materiais']);
    report.data=complete();
    assert.equal(report.pendingCheckoutModules().length,3, 'unsaved changes cannot complete the checkout');
    report.saved.set('visit',JSON.stringify(report.data));
    assert.deepEqual(report.pendingCheckoutModules(),[], 'free report is optional');
});
test('checkout retains conditional product and photo requirements', () => {
    const data=complete(); data.low='Sim'; data.organization='Ausência de exposição';
    const report=controller(data);
    assert.deepEqual(report.pendingCheckoutModules(),['Disponibilidade dos produtos','Exposição e materiais']);
    data.products.low=['Produto de exemplo']; data.photos=[{}];
    report.saved.set('visit',JSON.stringify(data));
    assert.deepEqual(report.pendingCheckoutModules(),[]);
    data.photos=Array(7).fill({}); report.saved.set('visit',JSON.stringify(data));
    assert.deepEqual(report.pendingCheckoutModules(),['Exposição e materiais']);
});
test('save and module navigation accept incomplete fields', () => {
    let saved=0, rendered=0;
    const report=Object.assign(Object.create(CommercialReport.prototype), {
        key:'visit',data:{...draft(),name:'Ana'},saved:new Map(),revisions:new Map(),
        onSave:()=>saved++,render:()=>rendered++
    });
    report.click({target:{closest:()=>({dataset:{action:'save'}})}});
    assert.equal(saved,1);
    assert.equal(JSON.parse(report.saved.get('visit')).name,'Ana');
    assert.equal(report.pendingCheckoutModules().length,3);
    report.page='contact';
    report.click({target:{closest:()=>({dataset:{action:'module-done'}})}});
    assert.equal(report.page,'overview');
    assert.equal(rendered,1);
});
