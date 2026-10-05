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
