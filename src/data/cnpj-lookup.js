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
                ultimoErro = erro;
                console.warn('Consulta de CNPJ por ' + campoCnpj + ' indisponível:', erro);
            }
        }
    
        if (ultimoSnap) return ultimoSnap;
        if (ultimoErro) throw ultimoErro;
        throw new Error('Não foi possível consultar a base de clientes.');
    };
}
