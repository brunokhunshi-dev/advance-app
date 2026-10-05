import test from 'node:test';
import assert from 'node:assert/strict';
import { blankTraining, modulosTreinamentoPendentes, trainingModuleComplete, SUBSTRATOS } from '../src/domain/training.js';
import { TrainingReport, renderTrainingSummary } from '../src/ui/training-report.js';
import { relatorioValidoParaCheckout } from '../src/domain/reports.js';
const completed = () => ({...blankTraining(), name:'Ana',participants:['Vendedores','Pintores'],expected:'12',present:'10',goal:'Orientar aplicação',products:{planned:[{id:'p',title:'Epóxi Total'}],applied:[]},contents:['Demonstração prática'],practice:'Não',achieved:'Parcialmente',engagement:'Moderada',satisfaction:'Não respondeu'});
test('partial saved training counts as a report but checkout requires its three required modules', () => {
    const report={dadosTreinamento:{versao:1,...blankTraining()}};
    assert.equal(relatorioValidoParaCheckout(report,'Treinamento'),true);
    assert.deepEqual(modulosTreinamentoPendentes(report),['Planejamento','Treinamento','Feedbacks']);
    report.dadosTreinamento={versao:1,...completed()};
    assert.deepEqual(modulosTreinamentoPendentes(report),[]);
});
test('practice requires applied products, valid surfaces and one result; photos and opinions remain optional', () => {
    const data=completed();data.practice='Sim';
    assert.equal(trainingModuleComplete('training',data),false);
    data.products.applied=[{id:'p',title:'Epóxi Total'}];data.surfaces=['Concreto'];data.result='Ainda não foi possível avaliar';
    assert.equal(trainingModuleComplete('training',data),true);
    data.surfaces=['Unknown'];assert.equal(trainingModuleComplete('training',data),false);
    assert.equal(SUBSTRATOS.length,8);
});
test('participant numbers must be integers within limits and empty inputs never become zero', () => {
    const data=completed();
    for(const value of ['', '-1','1.5','10001']) {data.present=value;assert.equal(trainingModuleComplete('planning',data),false);}
    data.present='0';assert.equal(trainingModuleComplete('planning',data),true);
});
test('training hydration retains legacy narrative and saved drafts survive refresh without sharing arrays', () => {
    const controller=Object.assign(Object.create(TrainingReport.prototype), {drafts:new Map(),saved:new Map(),initial:new Map(),revisions:new Map(),baseReports:new Map()});
    controller.hydrate('visit',{textoAtual:'Relato antigo',historico:[]});
    assert.equal(controller.drafts.get('visit').text,'Relato antigo');
    const report={dadosTreinamento:{versao:1,...completed()},textoAtual:'Relato',conteudoRelatorio:{versao:1,blocos:[{kind:'text',text:'Relato'}]}};
    controller.hydrate('visit',report,true);
    controller.drafts.get('visit').products.planned.push({id:'other',title:'PU Total'});
    assert.equal(report.dadosTreinamento.products.planned.length,1);
    const fresh=Object.assign(Object.create(TrainingReport.prototype), {drafts:new Map(),saved:new Map(),initial:new Map(),revisions:new Map(),baseReports:new Map()});
    fresh.hydrate('visit',JSON.parse(JSON.stringify(report)));
    assert.equal(fresh.hasSaved('visit'),true);
    assert.equal(fresh.drafts.get('visit').text,'Relato');
});
test('summary safely includes products, attendance and both feedbacks without stale practical answers', () => {
    const report={dadosTreinamento:{versao:1,...completed(),name:'<script>',responsibleOpinion:'Ótimo'},textoAtual:'Texto livre'};
    const markup=renderTrainingSummary(report);
    assert.match(markup,/Epóxi Total/);assert.match(markup,/Ótimo/);assert.match(markup,/Não respondeu/);assert.match(markup,/Texto livre/);
    assert.doesNotMatch(markup,/<script>|Produtos aplicados/);
});

test('planning and checkout accept training with no mentioned products', () => {
    const data=completed();data.products.planned=[];
    assert.equal(trainingModuleComplete('planning',data),true);
    assert.deepEqual(modulosTreinamentoPendentes({dadosTreinamento:{versao:1,...data}}),[]);
});

test('checkout uses review rows and narrative with overflow link, without feedback or pending fields', () => {
    const previousWindow=globalThis.window, previousDocument=globalThis.document;
    globalThis.window={};globalThis.document={};
    try {
        const report={dadosTreinamento:{versao:1,...completed()},textoAtual:''};
        const summary={clientHeight:100,scrollHeight:100}, more={hidden:false};
        const host={querySelector:selector=>selector==='.cr-summary-text'?summary:more};
        const reviewed=[];
        const controller=Object.assign(Object.create(TrainingReport.prototype),{key:'visit',data:report.dadosTreinamento,savedReport:()=>report,reviewCallbacks:{reviewModule:key=>reviewed.push(key)}});
        controller.renderCheckout(host);
        assert.match(host.innerHTML,/data-page="planning"/);
        assert.match(host.innerHTML,/data-page="training"/);
        assert.doesNotMatch(host.innerHTML,/Feedback|Pendências|Resumo do treinamento|data-page="feedback"/);
        assert.equal(more.hidden,true);
        host.onclick({target:{closest:()=>({dataset:{page:'planning'}})}});
        assert.deepEqual(reviewed,['planning']);
        summary.scrollHeight=200;controller.renderCheckout(host);assert.equal(more.hidden,false);
    } finally {globalThis.window=previousWindow;globalThis.document=previousDocument;}
});

test('surface search stays empty until typing, matches accents and terms like products, and excludes selections', () => {
    const results={innerHTML:''}, input={setAttribute(name,value){this[name]=value;}};
    const controller=Object.assign(Object.create(TrainingReport.prototype),{data:{surfaces:[]},surfaceQuery:'',root:{querySelector:selector=>selector==='[data-surface-results]'?results:input}});
    controller.updateSurfaceResults();assert.equal(results.innerHTML,'');assert.equal(input['aria-expanded'],'false');
    controller.surfaceQuery='galvanizado aco';controller.updateSurfaceResults();assert.match(results.innerHTML,/Aço galvanizado/);assert.equal(input['aria-expanded'],'true');
    controller.data.surfaces=['Aço galvanizado'];controller.updateSurfaceResults();assert.doesNotMatch(results.innerHTML,/data-select-surface/);
    controller.surfaceQuery='';controller.updateSurfaceResults();assert.equal(results.innerHTML,'');
});
