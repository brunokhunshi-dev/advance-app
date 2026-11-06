import assert from 'node:assert/strict';
import {test} from 'node:test';
import {options,kind,fieldMatrix,reportCollection} from '../tools/map-firestore-schema.mjs';

test('amostragem limitada de 1 a 100',()=>{
  assert.equal(options([]).limit,30);
  assert.equal(options(['--limit','10']).limit,10);
  assert.throws(()=>options(['--limit','101']));
  assert.throws(()=>options(['--limit','0']));
});

test('reconhece tipos e campos aninhados sem exportar valores privados',()=>{
  const documents=[
    {fields:{status:{stringValue:'Pendente'},details:{mapValue:{fields:{
      price:{integerValue:'25'}, email:{stringValue:'alguem@example.com'}
    }}}}},
    {fields:{status:{stringValue:'Concluída'},details:{mapValue:{fields:{
      price:{doubleValue:27.2}
    }}}}}
  ];
  const data=fieldMatrix(documents);
  assert.deepEqual(data.find(x=>x.field==='details.price').types,{integer:1,number:1});
  assert.equal(data.find(x=>x.field==='details.price').present,2);
  assert.equal(data.find(x=>x.field==='details.email').present,1);
  assert.ok(!JSON.stringify(data).includes('alguem@example.com'));
  assert.ok(!JSON.stringify(data).includes('Pendente'));
});

test('coleções de relatórios atuais e legadas',()=>{
  assert.equal(reportCollection({relatorioId:{stringValue:'X'}}),'relatorios');
  assert.equal(reportCollection({relatorioColecao:{stringValue:'relatorios_comerciais'}}),'relatorios_comerciais');
  assert.equal(reportCollection({tipoVisita:{stringValue:'Treinamento'}}),'relatorios_treinamentos');
  assert.equal(reportCollection({tipoVisita:{stringValue:'Assistência técnica'}}),'relatorios_assistencia_tecnica');
});
