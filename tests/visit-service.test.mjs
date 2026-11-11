import test from 'node:test';
import assert from 'node:assert/strict';
import { createVisitService } from '../src/services/visit-service.js';

function ambiente({status='Pendente', owner='u', clienteId='CLI-SEM-CNPJ-1', sessaoValida=true}={}) {
    const registros = new Map([['atividades/v',{clienteId,ptvId:owner,status,tipoVisita:'Visita comercial'}], [`clientes_sem_cnpj/${clienteId}`,{lat:1,lng:2,nome:'Loja'}]]);
    const gravacoes=[];
    const service=createVisitService({db:{},doc:(_,col,id)=>`${col}/${id}`,serverTimestamp:()=>new Date(),
        exigirSessao:()=>{if(!sessaoValida) throw Error('Sessão inválida');},
        validarResponsavel:(atv,sessao)=>{if(atv.ptvId!==sessao.id) throw Error('Responsável inválido');},
        listarVisitasAbertas:async()=>({docs:[]}), referenciaRelatorio:()=> 'relatorios/r',
        runTransaction:async(_,fn)=>{const pendentes=[];const resultado=await fn({get:async ref=>({exists:()=>registros.has(ref),data:()=>registros.get(ref)}),update:(ref,data)=>pendentes.push([ref,data])});for(const [ref,data] of pendentes){registros.set(ref,{...registros.get(ref),...data});gravacoes.push(ref);}return resultado;}});
    return {service, registros, gravacoes};
}
const pos={lat:1,lng:2,accuracy:10,endereco:'Loja'};
const args={id:'v',clienteId:'CLI-SEM-CNPJ-1',sessao:{id:'u'},localizacao:pos,nome:'Usuário'};

test('check-in normal e manual usam a coleção de clientes sem CNPJ',async()=>{
    const normal=ambiente(); await normal.service.checkin(args);
    assert.equal(normal.registros.get('atividades/v').status,'Em andamento');
    const manual=ambiente(); await manual.service.checkin({...args,localizacao:{...pos,lat:3},motivo:'GPS impreciso'});
    assert.equal(manual.registros.get('atividades/v').checkinAnaliseStatus,'Pendente de análise');
});
test('checkout no local inicial e na parada, e fechamento manual, registram auditoria',async()=>{
    for (const modo of ['inicial','parada','manual']) {
        const a=ambiente({status:'Em andamento'});
        a.registros.set('atividades/v',{...a.registros.get('atividades/v'),relatorioId:'r',localizacaoInicial:{lat:1,lng:2},paradas:[{lat:3,lng:2}]});
        a.registros.set('relatorios/r',{atividadeId:'v',ptvId:'u',textoAtual:'Relatório'});
        if (modo==='manual') {
            await a.service.checkoutManual({atividadeId:'v',sessao:{id:'u'},localizacao:pos,motivo:'Fora do raio',nome:'Usuário'});
            assert.equal(a.registros.get('atividades/v').fechamentoAnaliseStatus,'Pendente de análise');
        } else {
            const saida=modo==='parada'?{...pos,lat:3}:pos;
            await a.service.checkout({atividadeId:'v',sessao:{id:'u'},saida,tipo:'Visita comercial',modular:false,objetivo:'Visita',oportunidade:'Não',relatorioBase:{},nome:'Usuário'});
            assert.equal(a.registros.get('atividades/v')['auditoriaLocalizacao.checkout'].referencia.tipo,modo==='parada'?'parada':'loja');
        }
        assert.equal(a.registros.get('atividades/v').status,'Concluída');
        assert.equal(a.gravacoes.length,2);
    }
});
test('sessão, responsável e distância inválidos não geram escritas',async()=>{
    for(const opcoes of [{sessaoValida:false},{owner:'outro'},{}]) {
        const a=ambiente(opcoes);
        await assert.rejects(a.service.checkin({...args,localizacao:{...pos,lat:3}}));
        assert.equal(a.gravacoes.length,0);
    }
});
