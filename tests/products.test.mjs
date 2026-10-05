import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buscarProdutos, prepararCatalogo} from '../src/domain/products.js';
import {importarCatalogo, garantirCatalogoAdvance} from '../src/data/product-import.js';
import {createProductRepository} from '../src/data/product-repository.js';
import {modulosComerciaisPendentes} from '../src/domain/reports.js';
import {resumoComercial} from '../src/ui/visit-view.js';
const catalog=JSON.parse(readFileSync(new URL('../data/produtos-advance.json',import.meta.url)));
test('attached catalog preserves all 102 products and every nested property',()=>{
    const prepared=prepararCatalogo(catalog);assert.equal(prepared.products.length,102);
    prepared.products.forEach((item,i)=>{assert.equal(item.id,catalog.products[i]._id);assert.deepEqual(item.data,catalog.products[i]);});
    assert.deepEqual(prepared.metadata,catalog.metadata);
});
test('import is atomic for this catalog, idempotent and verifies every product',async()=>{
    const database=new Map();let commits=0,reads=0;
    const adapter={commit:async writes=>{commits++;assert.equal(writes.length,103);for(const item of writes)database.set(item.collection+'/'+item.id,structuredClone(item.data));},read:async (collection,id)=>{reads++;return database.get(collection+'/'+id);}};
    assert.equal(await importarCatalogo(catalog,adapter),102);
    await importarCatalogo(catalog,adapter);
    assert.equal(database.size,103);assert.equal(commits,2);assert.equal(reads,204);
    catalog.products.forEach(product=>assert.deepEqual(database.get('produtos/'+product._id),product));
});
test('invalid or duplicate IDs fail before writing and verification catches lost fields',async()=>{
    const product=catalog.products[0];let writes=0;
    const adapter={commit:async()=>{writes++;},read:async()=>({title:product.title})};
    await assert.rejects(importarCatalogo({products:[product,product]},adapter),/duplicado/);assert.equal(writes,0);
    await assert.rejects(importarCatalogo({products:[{...product,_id:'invalid/id'}]},adapter),/válido/);assert.equal(writes,0);
    await assert.rejects(importarCatalogo({products:[product]},adapter),/divergente/);
});
test('name search ignores accents/case and excludes already selected products',()=>{
    const products=[{id:'a',title:'Epóxi Total'},{id:'b',title:'Primer Epóxi'},{id:'c',title:'Galvolux'}];
    assert.deepEqual(buscarProdutos(products,'EPOXI').map(p=>p.id),['a','b']);
    assert.deepEqual(buscarProdutos(products,'total epoxi').map(p=>p.id),['a']);
    assert.deepEqual(buscarProdutos(products,'epoxi',[{id:'a',title:'Epóxi Total'}]).map(p=>p.id),['b']);
    assert.deepEqual(buscarProdutos(products,'epoxi',['Primer Epóxi']).map(p=>p.id),['a']);
    assert.deepEqual(buscarProdutos(products,''),[]);
});
test('cached catalogue shares a read across modules and retries failures',async()=>{
    let reads=0;const repo=createProductRepository(async()=>{reads++;if(reads===1)throw Error('offline');return catalog.products;});
    await assert.rejects(repo.list(),/offline/);
    const a=repo.list(),b=repo.list();assert.equal(a,b);await a;
    await repo.list();assert.equal(reads,2);repo.clear();await repo.list();assert.equal(reads,3);
});
test('selected Firebase products survive checkout validation and history display',()=>{
    const report={dadosComerciais:{versao:1,name:'Ana',role:'Gerente',goal:'Orientação aos vendedores',low:'Sim',missing:'Não',slow:'Não',products:{low:[{id:'a',title:'Epóxi Total'}]},organization:'Organizada e visível',photos:[],materials:[]}};
    assert.deepEqual(modulosComerciaisPendentes(report),[]);
    assert.equal(resumoComercial(report).find(([label])=>label==='Estoque baixo')[1],'Sim · Epóxi Total');
    report.dadosComerciais.products.low=[{}];assert.deepEqual(modulosComerciaisPendentes(report),['Disponibilidade dos produtos']);
});

test('selector adds the catalog ID and current title, and prevents duplicate selection',async()=>{
    const {CommercialReport}=await import('../src/ui/commercial-report.js');
    const controller=Object.assign(Object.create(CommercialReport.prototype),{page:'availability',data:{products:{low:[]}},productQueries:{low:'epoxi'},productCatalog:[{id:'a',title:'Epóxi Total'}],render(){}});
    const event={target:{closest:()=>({dataset:{selectProduct:'a',productQuestion:'low'}})}};
    controller.click(event);controller.click(event);
    assert.deepEqual(controller.data.products.low,[{id:'a',title:'Epóxi Total'}]);assert.equal(controller.productQueries.low,'');
    controller.reviewCheckout=true;controller.data.products.low=[];controller.click(event);assert.equal(controller.data.products.low.length,0);
});

test('authenticated app seeds all products once and skips writes on subsequent openings',async()=>{
    const database=new Map();let loads=0,commits=0;
    const adapter={load:async()=>{loads++;return catalog;},read:async(collection,id)=>database.get(collection+'/'+id),
        commit:async writes=>{commits++;for(const item of writes)database.set(item.collection+'/'+item.id,structuredClone(item.data));}};
    await garantirCatalogoAdvance(adapter);await garantirCatalogoAdvance(adapter);
    assert.equal(database.size,103);assert.equal(loads,1);assert.equal(commits,1);
    for(const product of catalog.products)assert.deepEqual(database.get('produtos/'+product._id),product);
});
test('failed automatic import keeps version unmarked and can be retried',async()=>{
    const database=new Map();let attempts=0;
    const adapter={load:async()=>catalog,read:async(collection,id)=>database.get(collection+'/'+id),
        commit:async writes=>{if(++attempts===1)throw Error('permission denied');for(const item of writes)database.set(item.collection+'/'+item.id,structuredClone(item.data));}};
    await assert.rejects(garantirCatalogoAdvance(adapter),/permission denied/);
    assert.equal(database.size,0);
    await garantirCatalogoAdvance(adapter);assert.equal(database.size,103);
});
