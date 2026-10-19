import { codigoCnpjLegado } from '../domain/identifiers.js';

export function createCnpjLookup(lookup) {
    return async function buscarClientePorCnpj(cnpjPuro) {
        const consultas = [
            ['codigoCnpj', cnpjPuro],
            ['cnpj', cnpjPuro],
            ['codigoCnpj', codigoCnpjLegado(cnpjPuro)]
        ];
    
        let ultimoSnap = null;
        let ultimoErro = null;
    
        for (const [campoCnpj, valor] of consultas) {
            try {
                const snap = await lookup(campoCnpj, valor);
                ultimoSnap = snap;
                if (!snap.empty) return snap;
            } catch (erro) {
                const code = String(erro?.code || '').split('/').at(-1);
                if (['resource-exhausted', 'permission-denied', 'unauthenticated', 'unavailable'].includes(code) ||
                    [401, 403, 429].includes(erro?.status) || /quota exceeded|resource[-.]exhausted/i.test(erro?.message || '')) throw erro;
                ultimoErro = erro;
                console.warn('Consulta de CNPJ por ' + campoCnpj + ' indisponível:', erro);
            }
        }
    
        if (ultimoErro) throw ultimoErro;
        if (ultimoSnap) return ultimoSnap;
        throw new Error('Não foi possível consultar a base de clientes.');
    };
}
