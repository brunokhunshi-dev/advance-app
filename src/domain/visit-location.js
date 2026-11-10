import { calcularDistancia, coordenadasValidas, referenciaLocalizacao } from '../services/location.js';

export const RAIO_VISITA_METROS = 1000;
export const LIMITE_PARADAS = 3;

// Retorna a referência válida mais próxima, preservando a distância para auditoria.
export function localizacaoPermitida(localizacao, referencias) {
    if (!coordenadasValidas(localizacao?.lat, localizacao?.lng)) return null;
    let maisProxima = null;
    for (const referencia of referencias) {
        if (!coordenadasValidas(referencia?.lat, referencia?.lng)) continue;
        const distancia = calcularDistancia(Number(localizacao.lat), Number(localizacao.lng),
            Number(referencia.lat), Number(referencia.lng));
        if (distancia <= RAIO_VISITA_METROS && (!maisProxima || distancia < maisProxima.distanciaMetros)) {
            maisProxima = { ...referencia, distanciaMetros: distancia };
        }
    }
    return maisProxima;
}

export class ErroLocalizacaoVisita extends Error {}

export function paradasDaVisita(atividade) {
    return Array.isArray(atividade?.paradas) ? atividade.paradas : [];
}

export function referenciaInicialVisita(cliente) {
    const referencia = referenciaLocalizacao(cliente);
    return referencia && !referencia.incerto ? { ...referencia, tipo: 'loja', raio: RAIO_VISITA_METROS } : null;
}

export function referenciaCheckout(atividade, cliente, localizacao) {
    const inicial = atividade.localizacaoInicial === undefined
        ? referenciaInicialVisita(cliente) : atividade.localizacaoInicial;
    const paradas = paradasDaVisita(atividade).map((parada, indice) => ({
        lat: parada.lat, lng: parada.lng, tipo: 'parada', paradaNumero: indice + 1
    }));
    return exigirLocalizacaoVisita(localizacao, [inicial, ...paradas],
        'Faça o check-out a até 1 km do local inicial ou de uma parada registrada.');
}

export function exigirLocalizacaoVisita(localizacao, referencias, mensagem) {
    if (!coordenadasValidas(localizacao?.lat, localizacao?.lng)) {
        throw new ErroLocalizacaoVisita('Ative a localização e permita o acesso ao GPS para tentar novamente.');
    }
    if (!referencias.some(ref => coordenadasValidas(ref?.lat, ref?.lng))) {
        throw new ErroLocalizacaoVisita('A visita não tem um endereço com coordenadas confirmadas.');
    }
    const referencia = localizacaoPermitida(localizacao, referencias);
    if (!referencia) throw new ErroLocalizacaoVisita(mensagem);
    return referencia;
}
