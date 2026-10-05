import { obterData } from './formatters.js';
const PARTICULAS_NOME = new Set(['da', 'das', 'de', 'do', 'dos', 'e']);
export function obterIniciais(nome) {
    const partes = String(nome || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z\s]/g, ' ')
        .trim()
        .split(/\s+/)
        .filter(Boolean);

    if (!partes.length) return 'XX';

    const uteis = partes.filter((parte, indice) =>
        indice === 0 || indice === partes.length - 1 || !PARTICULAS_NOME.has(parte.toLowerCase())
    );

    if (uteis.length === 1) return uteis[0].slice(0, 2).toUpperCase();

    return (uteis[0][0] + uteis[uteis.length - 1][0]).toUpperCase();
}

export function formatarDataId(data) {
    const d = obterData(data);
    if (!d) throw new Error('Não foi possível gerar o ID: data inválida.');

    return [
        d.getFullYear(),
        String(d.getMonth() + 1).padStart(2, '0'),
        String(d.getDate()).padStart(2, '0'),
        String(d.getHours()).padStart(2, '0'),
        String(d.getMinutes()).padStart(2, '0')
    ].join('');
}

export function gerarSufixoId() {
    if (globalThis.crypto?.getRandomValues) {
        const bytes = new Uint8Array(4);
        crypto.getRandomValues(bytes);
        return Array.from(bytes, byte => byte.toString(36).padStart(2, '0')).join('').slice(0, 6).toUpperCase();
    }

    return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export function gerarIdAtividade(tipoVisita, data, nomeTecnico) {
    const prefixo = tipoVisita === 'Treinamento' ? 'TR' : (tipoVisita === 'Assistência técnica' ? 'AT' : 'VC');
    return prefixo + '-' + formatarDataId(data) + '-' + obterIniciais(nomeTecnico) + '-' + gerarSufixoId();
}

export function gerarIdRelatorio(data, nomeTecnico) {
    return 'REL-' + formatarDataId(data) + '-' + obterIniciais(nomeTecnico) + '-' + gerarSufixoId();
}

export function gerarIdClienteCnpj(cnpjPuro) {
    return 'CLI-CNPJ-' + String(cnpjPuro);
}

export function gerarIdClienteProvisorio(dataCriacao, nomeResponsavel) {
    return 'CLI-PROV-' + formatarDataId(dataCriacao) + '-' + obterIniciais(nomeResponsavel) + '-' + gerarSufixoId();
}

export function cnpjValido(valor) {

    if (!/^\d{14}$/.test(valor) || /^(\d)\1{13}$/.test(valor)) return false;

    const digito = base => {

        let peso = base.length - 7, soma = 0;

        for (const n of base) { soma += Number(n) * peso--; if (peso < 2) peso = 9; }

        const resto = soma % 11; return resto < 2 ? '0' : String(11 - resto);

    };

    return digito(valor.slice(0,12)) === valor[12] && digito(valor.slice(0,13)) === valor[13];

}

export function codigoCnpjLegado(cnpjPuro) { return "C-" + (BigInt(cnpjPuro) * 999999937n).toString(16).toUpperCase(); }
