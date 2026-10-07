import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import * as reports from '../src/domain/reports.js';
import { serializarEstavel } from '../src/domain/formatters.js';

const source=readFileSync(new URL('../script.js',import.meta.url),'utf8');
test('real assistance save handler persists an empty draft and links it to the activity', async () => {
    const records=new Map([['atividades/visit',{ptvId:'user',clienteId:'client',status:'Em andamento',tipoVisita:'Assistência técnica'}]]);
    let handler;
    const fields=new Map();
    const context=vm.createContext({...reports, serializarEstavel, TextEncoder, Date,
        db:{},atividadeSelecionadaId:'visit',objetoAtividadeGlobal:records.get('atividades/visit'),objetoRelatorioGlobal:null,operacaoEmCurso:false,nomeUsuarioLogado:'Ana',
        document:{getElementById(id){
            if(!fields.has(id))fields.set(id,{value:'',textContent:'#DRAFT',addEventListener:(_,fn)=>handler=fn});
            return fields.get(id);
        }},
        technicalEditor:{busy:false,setLocked(){},prepareSave:async()=>({blocks:[]}),rollbackSave:async()=>{}},
        lerFormularioAssistencia:()=>({produto:'',queixa:'',constatacoes:'',setor:'Atendimento'}),
        gerarIdRelatorio:()=> 'draft', sessaoAtual:()=>({id:'user'}), exigirSessao(){},sessaoValida:()=>false,
        validarResponsavel:activity=>assert.equal(activity.ptvId,'user'),
        doc:(_,collection,id)=>({id,path:collection+'/'+id,parent:{id:collection}}),
        runTransaction:async(_,callback)=>{
            const writes=[];
            const result=await callback({
                get:async ref=>({exists:()=>records.has(ref.path),data:()=>structuredClone(records.get(ref.path))}),
                set:(ref,data)=>writes.push([ref.path,structuredClone(data)]),
                update:(ref,data)=>writes.push([ref.path,{...records.get(ref.path),...data}])
            });
            for(const [key,value] of writes)records.set(key,value);
            return result;
        },
        window:{mostrarAlerta:()=>assert.fail('Saving incomplete assistance cannot be blocked by required fields')},
        informarErro:(_,error)=>{throw error;}
    });
    const start=source.indexOf("    document.getElementById('btn-salvar-relatorio')?.addEventListener");
    const end=source.indexOf('\n}\n\nconst profileView',start);
    vm.runInContext(source.slice(start,end),context);
    await handler();
    const saved=records.get('relatorios_assistencia_tecnica/draft');
    assert.ok(saved);
    assert.equal(saved.produtoQueixa.produto,'');
    assert.equal(saved.verificacao.constatacoes,'');
    assert.equal(saved.clienteAplicacao.setor,'Atendimento');
    assert.equal(records.get('atividades/visit').relatorioId,'draft');
    assert.equal(records.get('atividades/visit').status,'Em andamento');
    assert.equal(reports.relatorioValidoParaCheckout(saved,'Assistência técnica'),false);
});

test('checkout still requires each mandatory assistance report field, including whitespace-only values', () => {
    const complete={produto:'Produto',queixa:'Queixa',constatacoes:'Constatações'};
    assert.equal(reports.relatorioValidoParaCheckout({assistenciaTecnica:complete},'Assistência técnica'),true);
    for(const [key,label] of [['produto','Produto'],['queixa','Queixa'],['constatacoes','Constatações']]) {
        const report={assistenciaTecnica:{...complete,[key]:'  '}};
        assert.equal(reports.relatorioValidoParaCheckout(report,'Assistência técnica'),false);
        assert.deepEqual(reports.camposAssistenciaPendentes(report),[label]);
    }
});
