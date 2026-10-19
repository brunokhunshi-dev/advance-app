import {before,after,beforeEach,test} from 'node:test';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,getDocs,collection,query,where,updateDoc,deleteDoc,writeBatch,runTransaction,Timestamp} from 'firebase/firestore';
let env;
const now=()=>Timestamp.now();
const activity=(ptvId='p1',status='Pendente')=>({tipo:'Visita',data:Timestamp.fromMillis(Date.now()+3600000),ptvId,clienteId:'c1',tipoVisita:'Visita comercial',nota:'',status,criadoEm:now(),atualizadoEm:now()});
const report=(activityId='a1',ptvId='p1')=>({id:'r1',atividadeId:activityId,ptvId,clienteId:'c1',tipoVisita:'Visita comercial',criadoEm:now(),atualizadoEm:now(),textoAtual:'Relatório',conteudoRelatorio:{versao:1,blocos:[]}});
const db=(uid='u1',email='one@example.com')=>env.authenticatedContext(uid,{email}).firestore();
async function seed(data){await env.withSecurityRulesDisabled(async c=>{const b=writeBatch(c.firestore());for(const [p,d] of Object.entries(data))b.set(doc(c.firestore(),p),d);await b.commit();});}
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-advance-v011',firestore:{host:'127.0.0.1',port:8080,rules:readFileSync('firestore.rules','utf8')}});});
after(async()=>env?.cleanup());
beforeEach(async()=>{await env.clearFirestore();await seed({
 'vinculos_auth/u1':{profileCollection:'promotores',profileId:'p1'},'vinculos_auth/u2':{profileCollection:'assistencia',profileId:'p2'},
 'vinculos_auth/g1':{profileCollection:'gestores',profileId:'g1'},
 'promotores/p1':{nome:'One',email:'one@example.com',ativo:true,permissoes:{}},
 'assistencia/p2':{nome:'Two',email:'two@example.com',ativo:true,permissoes:{}},'gestores/g1':{ativo:true},
 'clientes/c1':{nome:'Loja',cidade:'Indaiatuba',uf:'SP',status:'Ativo',statusLocalizacao:'incerto'},
 'atividades/a1':activity(),'atividades/a2':activity('p2'),
 'produtos/prod1':{title:'Produto'},'catalogos_produtos/advance':{importedProductCount:102},
 });});
test('unauthenticated and unlinked accounts cannot read operational data',async()=>{
 for(const d of [env.unauthenticatedContext().firestore(),db('stranger')])for(const p of ['clientes/c1','atividades/a1','produtos/prod1'])await assertFails(getDoc(doc(d,p)));
});
test('own UID mapping and profile are readable; all permission writes and other links are denied',async()=>{
 const d=db();await assertSucceeds(getDoc(doc(d,'vinculos_auth/u1')));await assertSucceeds(getDoc(doc(d,'promotores/p1')));
 for(const p of ['vinculos_auth/u2','assistencia/p2','gestores/g1'])await assertFails(getDoc(doc(d,p)));
 for(const p of ['vinculos_auth/u1','promotores/p1','administradores/u1','gestores/u1'])await assertFails(setDoc(doc(d,p),{ativo:true,role:'admin'}));
});
test('v72 own-email profile lookup works; listing everyone or another email is denied',async()=>{
 const d=db();await assertSucceeds(getDocs(query(collection(d,'promotores'),where('email','==','one@example.com'))));
 await assertSucceeds(getDocs(query(collection(d,'assistencia'),where('email','==','one@example.com'))));
 await assertFails(getDocs(collection(d,'promotores')));await assertFails(getDocs(query(collection(d,'promotores'),where('email','==','two@example.com'))));
});
test('a deactivated profile loses operational access on next request',async()=>{
 const d=db();await assertSucceeds(getDoc(doc(d,'clientes/c1')));await seed({'promotores/p1':{ativo:false}});await assertFails(getDoc(doc(d,'clientes/c1')));
});
test('acessoApp false is enforced server side',async()=>{await seed({'promotores/p1':{ativo:true,permissoes:{acessoApp:false}}});await assertFails(getDoc(doc(db(),'atividades/a1')));});
test('activity queries must be scoped to own profile',async()=>{
 const d=db();await assertSucceeds(getDocs(query(collection(d,'atividades'),where('ptvId','==','p1'))));
 await assertFails(getDocs(collection(d,'atividades')));await assertFails(getDoc(doc(d,'atividades/a2')));
});
test('management is explicit, read only, and never inferred from job title or token claims',async()=>{
 await assertSucceeds(getDocs(collection(db('g1'),'atividades')));
 await assertFails(updateDoc(doc(db('g1'),'atividades/a1'),{status:'Concluída'}));
 await seed({'promotores/p1':{ativo:true,cargo:'Gerente'}});await assertFails(getDoc(doc(db(),'atividades/a2')));
 const d=env.authenticatedContext('u1',{email:'one@example.com',admin:true}).firestore();await assertFails(getDoc(doc(d,'atividades/a2')));
});
test('own activity scheduling is allowed, another owner and direct completion are denied',async()=>{
 const d=db();await assertSucceeds(setDoc(doc(d,'atividades/new'),activity()));
 await assertFails(setDoc(doc(d,'atividades/other'),activity('p2')));await assertFails(setDoc(doc(d,'atividades/completed'),activity('p1','Concluída')));
});
test('schedule permission, client availability and scheduling bounds are enforced',async()=>{
 const d=db();await assertFails(setDoc(doc(d,'atividades/past'),{...activity(),data:Timestamp.fromMillis(Date.now()-3600000)}));
 await seed({'promotores/p1':{ativo:true,permissoes:{agendarVisitas:false}}});await assertFails(setDoc(doc(d,'atividades/new'),activity()));
});
test('check-in updates own pending activity only; IDs and unrelated fields are immutable',async()=>{
 const d=db(),check={status:'Em andamento',checkinDataHora:now(),checkinGps:'-23, -47',checkinGpsAccuracy:20,checkinEndereco:'Rua',atualizadoEm:now()};
 await assertFails(updateDoc(doc(d,'atividades/a2'),check));
 await assertFails(updateDoc(doc(d,'atividades/a1'),{...check,ptvId:'p2'}));
 await assertFails(updateDoc(doc(d,'atividades/a1'),{...check,checkinGpsAccuracy:500}));
 await assertSucceeds(updateDoc(doc(d,'atividades/a1'),check));
 await assertFails(updateDoc(doc(d,'atividades/a1'),{status:'Pendente'}));
});
test('new report and activity link save atomically, with missing-report get allowed',async()=>{
 await seed({'atividades/a1':activity('p1','Em andamento')});const d=db();
 await assertSucceeds(runTransaction(d,async tx=>{await tx.get(doc(d,'atividades/a1'));await tx.get(doc(d,'relatorios_comerciais/r1'));tx.set(doc(d,'relatorios_comerciais/r1'),report());tx.update(doc(d,'atividades/a1'),{relatorioId:'r1',relatorioColecao:'relatorios_comerciais',atualizadoEm:now()});}));
});
test('report cannot be saved against another activity, client, owner, or closed activity',async()=>{
 const d=db();for(const override of [{ptvId:'p2'},{clienteId:'other'},{atividadeId:'a2'},{}]){
 const b=writeBatch(d);b.set(doc(d,'relatorios_comerciais/r1'),{...report(),...override});b.update(doc(d,'atividades/a1'),{relatorioId:'r1',relatorioColecao:'relatorios_comerciais'});await assertFails(b.commit());
 }
});
test('checkout commits report and activity, and completed records cannot be edited or deleted',async()=>{
 const r=report();await seed({'atividades/a1':{...activity('p1','Em andamento'),relatorioId:'r1',relatorioColecao:'relatorios_comerciais'},'relatorios_comerciais/r1':r});
 const d=db(),out={checkoutDataHora:now(),checkoutGps:'-23,-47',checkoutGpsAccuracy:10,checkoutEndereco:'Rua',atualizadoEm:now()};
 const b=writeBatch(d);b.update(doc(d,'atividades/a1'),{...out,status:'Concluída'});b.update(doc(d,'relatorios_comerciais/r1'),out);await assertSucceeds(b.commit());
 await assertFails(updateDoc(doc(d,'relatorios_comerciais/r1'),{textoAtual:'alterado'}));await assertFails(updateDoc(doc(d,'atividades/a1'),{nota:'alterado'}));await assertFails(deleteDoc(doc(d,'atividades/a1')));
});
test('manual checkout cannot approve itself and must retain pending analysis',async()=>{
 await seed({'atividades/a1':{...activity('p1','Em andamento'),relatorioId:'r1',relatorioColecao:'relatorios_comerciais'},'relatorios_comerciais/r1':report()});
 const d=db(),manual={checkoutDataHora:now(),fechamentoTipo:'Manual',fechamentoAnaliseStatus:'Aprovado',resultado:'Aprovado',motivoFechamentoManual:'GPS indisponível',fechamentoSolicitadoPor:'p1',fechamentoSolicitadoEm:now(),atualizadoEm:now()};
 let b=writeBatch(d);b.update(doc(d,'atividades/a1'),{...manual,status:'Concluída'});b.update(doc(d,'relatorios_comerciais/r1'),manual);await assertFails(b.commit());
 manual.fechamentoAnaliseStatus=manual.resultado='Pendente de análise';b=writeBatch(d);b.update(doc(d,'atividades/a1'),{...manual,status:'Concluída'});b.update(doc(d,'relatorios_comerciais/r1'),manual);await assertSucceeds(b.commit());
});
test('finalizarVisitas false blocks checkout',async()=>{
 await seed({'promotores/p1':{ativo:true,permissoes:{finalizarVisitas:false}},'atividades/a1':{...activity('p1','Em andamento'),relatorioId:'r1',relatorioColecao:'relatorios_comerciais'},'relatorios_comerciais/r1':report()});
 await assertFails(updateDoc(doc(db(),'atividades/a1'),{status:'Concluída',checkoutDataHora:now(),checkoutGps:'-23,-47',checkoutGpsAccuracy:20}));
});
test('legacy report collection without explicit activity field remains writable during a visit',async()=>{
 const r=report();await seed({'atividades/a1':{...activity('p1','Em andamento'),relatorioId:'r1'},'relatorios/r1':r});
 await assertSucceeds(updateDoc(doc(db(),'relatorios/r1'),{textoAtual:'Novo texto',atualizadoEm:now()}));
});
test('own cancellation preserves record, reason and actor',async()=>{
 const d=db(),c={status:'Cancelada',resultado:'Cancelada',motivoCancelamento:'Outro',detalheCancelamento:'Loja indisponível',canceladoEm:now(),canceladoPor:'p1',atualizadoEm:now()};
 await assertFails(updateDoc(doc(d,'atividades/a1'),{...c,canceladoPor:'p2'}));await assertSucceeds(updateDoc(doc(d,'atividades/a1'),c));await assertFails(deleteDoc(doc(d,'atividades/a1')));
});
test('client creation requires permission, operational fields only; profile and importance changes denied',async()=>{
 const d=db(),c={nome:'Loja nova',cidade:'Indaiatuba',uf:'SP',status:'Provisorio',criadoPor:'p1',criadoEm:now(),atualizadoEm:now()};
 await assertSucceeds(setDoc(doc(d,'clientes/new'),c));await assertFails(setDoc(doc(d,'clientes/escalated'),{...c,ativo:true}));await assertFails(updateDoc(doc(d,'clientes/c1'),{importancia:'Estratégico'}));
 await seed({'promotores/p1':{ativo:true,permissoes:{cadastrarClientes:false}}});await assertFails(setDoc(doc(d,'clientes/new2'),c));
});
test('uncertain city center can be updated without changing the customer identity',async()=>{
 await assertSucceeds(updateDoc(doc(db(),'clientes/c1'),{centroCidade:{cidade:'Indaiatuba',uf:'SP',lat:-23,lng:-47}}));
 await assertFails(updateDoc(doc(db(),'clientes/c1'),{centroCidade:{cidade:'Outra',uf:'SP',lat:-23,lng:-47}}));
});
test('catalog is read only and deletion requests, archives and unknown paths are closed',async()=>{
 const d=db();await assertSucceeds(getDoc(doc(d,'produtos/prod1')));await assertFails(setDoc(doc(d,'produtos/new'),{title:'malicious'}));
 for(const p of ['exclusoes_usuario/x','usuarios_excluidos/x','atividades_excluidas/x','qualquer/x']){await assertFails(getDoc(doc(d,p)));await assertFails(setDoc(doc(d,p),{x:true}));}
});
test('history permission blocks closed activities and their reports, while pending activity queries keep working',async()=>{
 await seed({'promotores/p1':{ativo:true,permissoes:{verHistorico:false}},'atividades/closed':{...activity('p1','Concluída'),relatorioId:'r1',relatorioColecao:'relatorios_comerciais'},'relatorios_comerciais/r1':report('closed')});
 const d=db();await assertSucceeds(getDocs(query(collection(d,'atividades'),where('ptvId','==','p1'),where('status','in',['Pendente','Em andamento']))));
 await assertFails(getDoc(doc(d,'atividades/closed')));await assertFails(getDoc(doc(d,'relatorios_comerciais/r1')));
});
test('training and assistance transactions retain their separate collections',async()=>{
 const d=db();for(const [i,type,col] of [[1,'Treinamento','relatorios_treinamentos'],[2,'Assistência técnica','relatorios_assistencia_tecnica']]){
  const a='typed'+i;await seed({['atividades/'+a]:{...activity('p1','Em andamento'),tipoVisita:type}});
  const b=writeBatch(d);b.set(doc(d,col+'/r1'),{...report(a),tipoVisita:type});b.update(doc(d,'atividades/'+a),{relatorioId:'r1',relatorioColecao:col});await assertSucceeds(b.commit());
 }
});
test('legacy technical visits normalize to commercial reports on checkout',async()=>{
 const r=report();await seed({'atividades/a1':{...activity('p1','Em andamento'),tipoVisita:'Visita técnica',relatorioId:'r1'},'relatorios/r1':r});
 const d=db(),out={tipoVisita:'Visita comercial',checkoutDataHora:now(),checkoutGps:'-23,-47',checkoutGpsAccuracy:20};
 const b=writeBatch(d);b.update(doc(d,'atividades/a1'),{...out,status:'Concluída'});b.update(doc(d,'relatorios/r1'),out);await assertSucceeds(b.commit());
});
