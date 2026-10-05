import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {CommercialReport} from '../src/ui/commercial-report.js';
import {normalizarTipoVisita} from '../src/domain/reports.js';
const source=readFileSync(new URL('../script.js',import.meta.url),'utf8');
test('inactive commercial review cannot intercept navigation from technical assistance',()=>{
    const controller=Object.assign(Object.create(CommercialReport.prototype),{active:false,reviewCheckout:true,reviewCallbacks:{returnCheckout:()=>assert.fail('stale commercial checkout')}});
    assert.equal(controller.backModule(),false);
});
test('deactivating a commercial report clears checkout review mode',()=>{
    const controller=Object.assign(Object.create(CommercialReport.prototype),{active:true,reviewCheckout:true,host:{classList:{remove(){}}},root:{}});
    controller.deactivate();assert.equal(controller.active,false);assert.equal(controller.reviewCheckout,false);
});
test('checkout X navigates directly to home, preserves assistance activity and clears stale commercial UI',()=>{
    const activity={id:'assistance',tipoVisita:'Assistência técnica'};const navigation=[];let cleared=0,deactivated=0,refreshed=0;
    const content={replaceChildren:()=>cleared++,onclick:()=>{},onchange:()=>{}};
    const context=vm.createContext({operacaoEmCurso:false,checkoutPendenteGlobal:{atividadeId:'assistance'},objetoAtividadeGlobal:activity,
        commercialReport:{deactivate:()=>deactivated++},
        document:{getElementById:id=>id==='tela-checkout'?{classList:{remove:()=>{}}}:content},
        history:{back:()=>assert.fail('X must not replay an old checkout')},
        navegarParaTela:(screen,options)=>navigation.push({screen,options}),atualizarInterfaceVisitaAtual:()=>refreshed++});
    const start=source.indexOf('function fecharCheckout()');const end=source.indexOf('function dadosAssistenciaCheckoutAtual()',start);
    vm.runInContext(source.slice(start,end),context);context.fecharCheckout();
    assert.equal(navigation[0].screen,'tela-inicio');assert.equal(navigation[0].options.substituir,true);
    assert.equal(context.checkoutPendenteGlobal,null);assert.equal(context.objetoAtividadeGlobal,activity);
    assert.equal(cleared,1);assert.equal(deactivated,1);assert.equal(refreshed,1);
    assert.equal(content.onclick,null);assert.equal(content.onchange,null);
    context.operacaoEmCurso=true;context.fecharCheckout();assert.equal(navigation.length,1);
});
test('native assistance navigation ignores commercial modules and expired checkout history returns home',()=>{
    let handler;const shown=[],navigated=[];
    const context=vm.createContext({navegacaoHistoricoAtiva:true,estadoNavegacaoAtual:{tela:'tela-relatorio'},objetoAtividadeGlobal:{tipoVisita:'Assistência técnica'},
        commercialReport:{backModule:()=>assert.fail('commercial controller cannot intercept assistance')},
        window:{addEventListener:(_,fn)=>handler=fn,scrollTo(){}},normalizarTipoVisita,
        relatorioPossuiAlteracoesNaoSalvas:()=>false,ignorarProtecaoRelatorioUmaVez:false,
        estadoAppValido:()=>true,checkoutPendenteGlobal:null,
        navegarParaTela:screen=>navigated.push(screen),mostrarApenasTela:screen=>shown.push(screen),carregarConteudoTela(){}});
    const start=source.indexOf('function configurarHistoricoNativo()');const end=source.indexOf('// === TELAS DE LEITURA ===',start);
    vm.runInContext(source.slice(start,end),context);context.configurarHistoricoNativo();
    handler({state:{tela:'tela-inicio'}});assert.deepEqual(shown,['tela-inicio']);
    handler({state:{tela:'tela-checkout'}});assert.deepEqual(navigated,['tela-inicio']);assert.deepEqual(shown,['tela-inicio']);
});
