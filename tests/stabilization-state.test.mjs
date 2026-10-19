import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createLatestRequestGuard} from '../src/services/latest-request.js';
import * as reports from '../src/domain/reports.js';
const source=readFileSync(new URL('../script.js',import.meta.url),'utf8');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function excerpt(start,end){const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a);return source.slice(a,b);}

function editorContext(){
 const hydrations=[],errors=[],pending=[];const guard=createLatestRequestGuard();
 const controller={deactivate(){},drafts:new Map(),saved:new Map(),initial:new Map(),hydrate:id=>hydrations.push(id)};
 const ctx=vm.createContext({...reports,Date,operacaoEmCurso:false,atividadeSelecionadaId:'a1',commercialReport:controller,trainingReport:controller,
  leiturasVisita:guard,sessaoAtual:()=>({id:'p1'}),sessaoValida:()=>true,db:{},doc:(_,c,id)=>({id}),
  getDocFromServer:ref=>{const d=deferred();pending.push({id:ref.id,...d});return d.promise;},validarResponsavel(){},
  objetoAtividadeGlobal:null,objetoRelatorioGlobal:null,clienteSelecionadoNome:'',nomeUsuarioLogado:'Pessoa',
  document:{getElementById:()=>({value:''})},formatarDataHoraPT:()=>({data:'',hora:''}),obterIniciais:()=> 'PE',abrirPrototipoComercial(){},informarErro:(title,e)=>errors.push(e)
 });
 vm.runInContext(excerpt('    const acaoAbrirRelatorio = async () =>','    if (btnEscrever)')+'\nglobalThis.openReport=acaoAbrirRelatorio;',ctx);
 const respond=(id,extra={})=>({exists:()=>true,id,data:()=>({ptvId:'p1',status:'Em andamento',tipoVisita:'Visita comercial',...extra})});
 return {ctx,guard,pending,hydrations,errors,respond};
}
for(const phase of ['activity','report','client'])test(`editor ignores obsolete ${phase} response after selection changes`,async()=>{
 const {ctx,pending,hydrations,errors,respond}=editorContext();const secondary=deferred();
 ctx.carregarRelatorioDaAtividade=()=>secondary.promise;ctx.obterCliente=()=>secondary.promise;
 const task=ctx.openReport();
 if(phase!=='activity'){
  pending[0].resolve(respond('a1',phase==='report'?{relatorioId:'r1'}:{clienteId:'c1'}));await tick();
 }
 ctx.atividadeSelecionadaId='a2';
 if(phase==='activity')pending[0].resolve(respond('a1'));else secondary.resolve(phase==='report'?{atividadeId:'a1',ptvId:'p1'}:{nome:'Cliente A'});
 await task;assert.equal(ctx.objetoAtividadeGlobal,null);assert.equal(ctx.objetoRelatorioGlobal,null);assert.deepEqual(hydrations,[]);assert.deepEqual(errors,[]);
});
test('editor accepts latest opening and ignores older error without alert',async()=>{
 const {ctx,pending,hydrations,errors,respond}=editorContext();const old=ctx.openReport();ctx.atividadeSelecionadaId='a2';const next=ctx.openReport();
 pending[1].resolve(respond('a2'));await next;pending[0].reject(Error('old read failed'));await old;
 assert.equal(ctx.objetoAtividadeGlobal.id,'a2');assert.deepEqual(hydrations,['a2']);assert.deepEqual(errors,[]);
});
test('navigating away invalidates an editor response even when selected ID stays unchanged',async()=>{
 const {ctx,guard,pending,hydrations,respond}=editorContext();const task=ctx.openReport();guard.invalidate();pending[0].resolve(respond('a1'));await task;
 assert.equal(ctx.objetoAtividadeGlobal,null);assert.deepEqual(hydrations,[]);
});
test('viewer renders latest visit only and does not redirect on obsolete failure',async()=>{
 const guard=createLatestRequestGuard(),pending=[],rendered=[],navigations=[],errors=[];
 const ctx=vm.createContext({operacaoEmCurso:false,sessaoAtual:()=>({id:'p1'}),sessaoValida:()=>true,leiturasVisita:guard,window:{scrollTo(){}},db:{},
  document:{getElementById:()=>({style:{}})},navegarParaTela:screen=>{guard.invalidate();navigations.push(screen);},preencherCampoVisualizador(){},
  doc:(_,c,id)=>({id}),getDoc:ref=>{const d=deferred();pending.push({id:ref.id,...d});return d.promise;},
  renderizarVisualizadorVisita:a=>rendered.push(a.id),informarErro:(t,e)=>errors.push(e)
 });
 vm.runInContext(excerpt('window.abrirVisualizadorVisita = async function','// === TELA 8'),ctx);
 const a=ctx.window.abrirVisualizadorVisita('a1'),b=ctx.window.abrirVisualizadorVisita('a2');
 pending[1].resolve({exists:()=>true,id:'a2',data:()=>({ptvId:'p1'})});await b;
 pending[0].reject(Error('old'));await a;
 assert.deepEqual(rendered,['a2']);assert.equal(ctx.objetoAtividadeGlobal.id,'a2');assert.deepEqual(errors,[]);assert.equal(navigations.length,2);
});

function checkoutContext({manual=false,failCommit=false,failUi=false,failHistory=false,validSession=true}={}){
 const activity={ptvId:'p1',clienteId:'c1',status:'Em andamento',tipoVisita:'Visita comercial',relatorioId:'r1'};
 const report={atividadeId:'a1',ptvId:'p1',textoAtual:'Relatório válido legado'};
 let handler,reads=0,commits=0;const errors=[],alerts=[];const button={disabled:false,textContent:'',value:'Motivo válido',addEventListener:(_,fn)=>handler=fn};
 const ctx=vm.createContext({...reports,Date,operacaoEmCurso:false,checkoutPendenteGlobal:{atividadeId:'a1',posicao:{lat:-23,lng:-47,accuracy:20,endereco:'Rua'}},fechamentoManualPendente:{atividadeId:'a1'},objetoAtividadeGlobal:activity,objetoRelatorioGlobal:report,db:{},
  document:{getElementById:id=>id==='btn-concluir-checkout'||id==='btn-enviar-fechamento-manual'?button:{value:'Relacionamento válido'},querySelector:()=>({value:'Sim'})},
  sessaoAtual:()=>({id:'p1'}),sessaoValida:()=>validSession,validarResponsavel(){},coordenadasValidas:()=>true,
  referenciaRelatorio:()=>({collection:'relatorios',id:'r1'}),doc:(_,collection,id)=>({collection,id}),consultasEmCurso:{clear(){}},
  runTransaction:async(_,fn)=>{if(failCommit)throw Error('write denied');const writes=[];await fn({get:async ref=>({exists:()=>true,data:()=>structuredClone(ref.collection==='atividades'?activity:report)}),update:(ref,data)=>writes.push([ref,data])});for(const[ref,data]of writes)Object.assign(ref.collection==='atividades'?activity:report,data);commits++;},
  getDoc:async()=>{reads++;throw Error('Quota exceeded na confirmação');},informarErro:(title,error)=>errors.push({title,error}),window:{mostrarAlerta:(title,message)=>alerts.push({title,message})},
  fecharModalFechamentoManual(){},limparEstadoVisita(){},navegarParaTela(){if(failUi)throw Error('render failed');},carregarHistoricoVisitas:async()=>{if(failHistory)throw Error('Quota exceeded no histórico');}
 });
 if(manual){vm.runInContext(excerpt('async function enviarFechamentoManual()','async function salvarRelatorioComercial'),ctx);handler=ctx.enviarFechamentoManual;}
 else vm.runInContext(excerpt("    document.getElementById('btn-concluir-checkout')?.addEventListener","    document.querySelectorAll('input[name=\"atEspecificacao\"]')"),ctx);
 return {ctx,run:()=>handler(),activity,errors,alerts,button,reads:()=>reads,commits:()=>commits};
}
for(const manual of [false,true]){
 test(`${manual?'manual':'normal'} checkout relies on acknowledged commit, with no confirmation read`,async()=>{
  const c=checkoutContext({manual});await c.run();assert.equal(c.activity.status,'Concluída');assert.equal(c.commits(),1);assert.equal(c.reads(),0);assert.deepEqual(c.errors,[]);assert.equal(c.alerts[0].title,'Sucesso');assert.equal(c.button.disabled,false);
 });
 test(`${manual?'manual':'normal'} checkout distinguishes committed state from a UI failure`,async()=>{
  const c=checkoutContext({manual,failUi:true});await c.run();assert.equal(c.activity.status,'Concluída');assert.deepEqual(c.errors,[]);assert.match(c.alerts[0].message,/não repita/i);assert.equal(c.button.disabled,false);
 });
 test(`${manual?'manual':'normal'} checkout history failure preserves saved acknowledgement`,async()=>{
  const c=checkoutContext({manual,failHistory:true});await c.run();assert.equal(c.activity.status,'Concluída');assert.deepEqual(c.errors,[]);assert.match(c.alerts[0].message,/não repita/i);
 });
 test(`${manual?'manual':'normal'} checkout still reports failed write and releases button`,async()=>{
  const c=checkoutContext({manual,failCommit:true});await c.run();assert.equal(c.activity.status,'Em andamento');assert.equal(c.errors.length,1);assert.deepEqual(c.alerts,[]);assert.equal(c.button.disabled,false);
 });
 test(`${manual?'manual':'normal'} checkout does not update the new session after commit`,async()=>{
  const c=checkoutContext({manual,validSession:false});await c.run();assert.equal(c.activity.status,'Concluída');assert.deepEqual(c.alerts,[]);assert.deepEqual(c.errors,[]);
 });
}


for(const propagarErro of [false,true])test(`history failure ${propagarErro?'propagates after commit':'reports a normal load error'}`,async()=>{
 const errors=[],area={innerHTML:'',textContent:''},error=Object.assign(Error('quota'),{code:'resource-exhausted'});
 const ctx=vm.createContext({idUsuarioLogado:'p1',dadosPerfilLogado:{},sequenciaHistorico:0,sessaoAtual:()=>({id:'p1'}),sessaoValida:()=>true,
  document:{getElementById:()=>area},loadingMarkup:()=>'',db:{},collection(){},query(){},where(){},orderBy(){},limit(){},
  getDocs:async()=>{throw error;},consultarNaSessao:async()=>{throw error;},informarErro:(title,e)=>errors.push(e)
 });
 vm.runInContext(excerpt('async function carregarHistoricoVisitas(','function configurarFiltroHistorico()'),ctx);
 if(propagarErro)await assert.rejects(ctx.carregarHistoricoVisitas({propagarErro}),e=>e===error);else await ctx.carregarHistoricoVisitas();
 assert.equal(errors.length,propagarErro?0:1);assert.match(area.textContent,/Não foi possível/);
});

test('editor handles a session lost before starting the read',async()=>{
 const {ctx,pending,hydrations,errors}=editorContext();ctx.sessaoAtual=()=>{throw Error('Entre novamente');};
 await ctx.openReport();assert.equal(pending.length,0);assert.deepEqual(hydrations,[]);assert.equal(errors.length,1);
});
