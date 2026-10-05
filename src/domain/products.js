export const nomeProduto = product => typeof product === 'string' ? product : product?.title || '';
export const idProduto = product => typeof product === 'string' ? product : product?.id || product?._id || product?.title || '';
export const normalizarNomeProduto = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
export function buscarProdutos(products, query, selected = [], limit = 12) {
    const normalized = normalizarNomeProduto(query);
    if (!normalized) return [];
    const words = normalized.split(/\s+/);
    const excluded = new Set(selected.map(idProduto));
    const names = new Set(selected.map(product => normalizarNomeProduto(nomeProduto(product))));
    return products.filter(product => !excluded.has(idProduto(product)) && !names.has(normalizarNomeProduto(nomeProduto(product))) && words.every(word => normalizarNomeProduto(nomeProduto(product)).includes(word)))
        .sort((a,b) => Number(normalizarNomeProduto(nomeProduto(b)).startsWith(normalized)) - Number(normalizarNomeProduto(nomeProduto(a)).startsWith(normalized)) || nomeProduto(a).localeCompare(nomeProduto(b),'pt-BR'))
        .slice(0,limit);
}
export function prepararCatalogo(catalog) {
    if (!catalog || !Array.isArray(catalog.products) || !catalog.products.length) throw new Error('O catálogo não contém produtos.');
    const ids = new Set();
    const products = catalog.products.map(product => {
        if (!product || typeof product._id !== 'string' || !product._id || product._id.includes('/') || !String(product.title || '').trim()) throw new Error('Produto sem ID ou nome válido.');
        if (ids.has(product._id)) throw new Error('ID duplicado no catálogo: ' + product._id);
        ids.add(product._id);
        if (new TextEncoder().encode(JSON.stringify(product)).length > 800000) throw new Error('Produto excede o tamanho permitido: ' + product.title);
        return {id:product._id, data:structuredClone(product)};
    });
    return {products, metadata:structuredClone(catalog.metadata || {})};
}
