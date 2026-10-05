import {prepararCatalogo} from '../domain/products.js';
// All product properties are preserved. IDs make repeated imports idempotent.
export async function importarCatalogo(catalog, {commit, read, progress = () => {}}) {
    const prepared = prepararCatalogo(catalog);
    const writes = prepared.products.map(product => ({collection:'produtos', ...product}));
    writes.push({collection:'catalogos_produtos',id:'advance',data:{...prepared.metadata, importedProductCount:prepared.products.length}});
    // The supplied catalog fits one atomic Firestore batch (103 writes).
    for (let offset=0; offset<writes.length; offset+=400) {
        await commit(writes.slice(offset,offset+400));
        progress(Math.min(offset+400,writes.length),writes.length);
    }
    for (const product of prepared.products) {
        const stored = await read('produtos',product.id);
        if (JSON.stringify(sort(stored)) !== JSON.stringify(sort(product.data))) throw new Error('Verificação divergente no produto: ' + product.data.title);
    }
    return prepared.products.length;
}
function sort(value) {
    if (Array.isArray(value)) return value.map(sort);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key=>[key,sort(value[key])]));
    return value;
}
