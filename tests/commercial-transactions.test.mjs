import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {persistCommercialMedia} from '../src/services/commercial-save.js';
import * as reports from '../src/domain/reports.js';
import {serializarEstavel} from '../src/domain/formatters.js';
const source=readFileSync(new URL('../script.js',import.meta.url),'utf8');
const draft=()=>({name:'Ana',role:'Gerente',goal:'Orientação aos vendedores',low:'Não',missing:'Não',slow:'Não',products:{low:[],missing:[],slow:[]},organization:'Organizada e visível',materials:[],other:'',text:'',blocks:[],photos:[],feedback:[],pending:''});
function setup(activity={ptvId:'user',clienteId:'client',status:'Em andamento',tipoVisita:'Visita comercial'},report=null) {
    const records=new Map([['atividades/visit',activity]]);
    if(report) records.set((activity.relatorioColecao || 'relatorios')+'/'+activity.relatorioId,report);
    const writes=[];
    const context=vm.createContext({...reports,serializarEstavel,persistCommercialMedia,TextEncoder,Date,
        db:{},operacaoEmCurso:false,atividadeSelecionadaId:'visit',nomeUsuarioLogado:'Ana',objetoAtividadeGlobal:{id:'visit',...activity},objetoRelatorioGlobal:report,
        sessaoAtual:()=>({id:'user'}),exigirSessao(){},sessaoValida:()=>false,
        validarResponsavel:atv=>{if(atv.ptvId!=='user')throw new Error('responsável');},
        gerarIdRelatorio:()=> 'report',mediaStore:{},
        doc:(_,collection,id)=>({id,path:collection+'/'+id}),
        runTransaction:async (_,callback)=>{
            const pending=[];
            const result=await callback({get:async ref=>({exists:()=>records.has(ref.path),data:()=>records.get(ref.path)}),
                set:(ref,data)=>pending.push({path:ref.path,data}),update:(ref,data)=>pending.push({path:ref.path,data:{...records.get(ref.path),...data}})});
            for(const write of pending){records.set(write.path,write.data);writes.push(write);}
            return result;
        },window:{mostrarAlerta(){}}
    });
    vm.runInContext(source.slice(source.indexOf('async function salvarRelatorioComercial('),source.indexOf('function configurarEventosGlobais()')),context);
    return {context,records,writes,save:(data=draft(),base=report)=>context.salvarRelatorioComercial('visit',data,base)};
}
test('real save transaction atomically links an empty partial report to its activity',async()=>{
    const app=setup();const data=draft();data.name='';data.goal='';
    const saved=await app.save(data);
    assert.equal(app.records.get('atividades/visit').relatorioId,'report');
    assert.equal(app.records.get('atividades/visit').relatorioColecao,'relatorios_comerciais');
    assert.equal(app.records.get('relatorios_comerciais/report').dadosComerciais.name,'');
    assert.equal(saved.ptvId,'user');assert.equal(app.writes.length,2);
});
test('save transaction rejects another owner and a concluded visit without any write',async()=>{
    for(const override of [{ptvId:'other'},{status:'Concluída'}]){
        const app=setup({ptvId:'user',clienteId:'client',status:'Em andamento',tipoVisita:'Visita comercial',...override});
        await assert.rejects(app.save(), override.ptvId ? /responsável/ : /encerrada/);assert.equal(app.writes.length,0);
    }
});
test('save preserves the legacy collection and rejects concurrent changes to modules',async()=>{
    const original={atividadeId:'visit',ptvId:'user',textoAtual:'Antigo',codigo:'#ABC'};
    const activity={ptvId:'user',clienteId:'client',status:'Em andamento',tipoVisita:'Visita comercial',relatorioId:'legacy'};
    const app=setup(activity,original);
    const saved=await app.save();assert.equal(saved.colecao,'relatorios');assert.equal(saved.codigo,'#ABC');
    const concurrent={...saved,dadosComerciais:{...saved.dadosComerciais,name:'Outro dispositivo'}};
    app.records.set('relatorios/legacy',concurrent);
    const count=app.writes.length;
    await assert.rejects(app.save(draft(),saved),/outra sessão/);
    assert.equal(app.writes.length,count);assert.equal(app.records.get('relatorios/legacy').dadosComerciais.name,'Outro dispositivo');
});
test('checkout transaction revalidates server modules and persists feedback, pending and completion',async()=>{
    const report={atividadeId:'visit',ptvId:'user',textoAtual:'',dadosComerciais:{versao:1,...draft()}};
    const activity={ptvId:'user',clienteId:'client',status:'Em andamento',tipoVisita:'Visita comercial',relatorioId:'report',relatorioColecao:'relatorios_comerciais'};
    const app=setup(activity,report);let handler;
    const fields=new Map();
    const get=id=>{if(!fields.has(id))fields.set(id,{value:'',addEventListener:(_,fn)=>handler=fn});return fields.get(id);};
    Object.assign(app.context,{checkoutPendenteGlobal:{atividadeId:'visit',posicao:{lat:1,lng:2,accuracy:10,endereco:'Loja'}},
        document:{getElementById:get,querySelector:()=>null},
        referenciaRelatorio:()=>({path:'relatorios_comerciais/report'}),
        commercialReport:{drafts:new Map([['visit',{feedback:['Argumentos de venda'],pending:'Sem pendências'}]])},
        coordenadasValidas:()=>true,informarErro:(_,error)=>{throw error;}});
    const start=source.indexOf("    document.getElementById('btn-concluir-checkout')?.addEventListener");
    const end=source.indexOf("    document.querySelectorAll('input[name=\"atEspecificacao\"]')",start);
    vm.runInContext(source.slice(start,end),app.context);
    app.records.set('relatorios_comerciais/report',{...report,dadosComerciais:{...report.dadosComerciais,name:''}});
    await assert.rejects(handler(),/Contato na loja/);assert.equal(app.writes.length,0);
    app.records.set('relatorios_comerciais/report',report);
    await handler();
    assert.equal(app.records.get('atividades/visit').status,'Concluída');
    const saved=app.records.get('relatorios_comerciais/report');
    assert.equal(saved.dadosComerciais.pending,'Sem pendências');assert.equal(saved.dadosComerciais.feedback[0],'Argumentos de venda');
    assert.equal(saved.checkoutGps,'1, 2');
});
