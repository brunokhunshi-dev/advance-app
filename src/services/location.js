const GPS_ACCURACY_MAX_METERS = 150;
const normalizarLocal = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim();

export function localizacaoIncerta(cliente) {
    return cliente?.precisaoCoordenadas === 'rua' || (cliente?.statusLocalizacao === 'incerto' && !coordenadasValidas(cliente?.lat,cliente?.lng));
}

export function referenciaLocalizacao(cliente, centroConsultado = null) {
    if (!cliente) return null;
    if (!localizacaoIncerta(cliente) && coordenadasValidas(cliente.lat,cliente.lng)) return {lat:Number(cliente.lat),lng:Number(cliente.lng),raio:500,incerto:false};
    if (!localizacaoIncerta(cliente)) return null;
    for (const centro of [cliente.centroCidade,centroConsultado]) {
        if (!centro || !coordenadasValidas(centro.lat,centro.lng)) continue;
        if (normalizarLocal(centro.cidade)!==normalizarLocal(cliente.cidade) || normalizarLocal(centro.uf)!==normalizarLocal(cliente.uf)) continue;
        return {lat:Number(centro.lat),lng:Number(centro.lng),raio:50000,incerto:true};
    }
    return null;
}

export function dadosLocalizacaoCadastro(coords, centro) {
    if (coords && coordenadasValidas(coords.lat,coords.lng)) return {lat:Number(coords.lat),lng:Number(coords.lng),statusLocalizacao:'confirmado',origemCoordenadas:'geocodificacao'};
    return {lat:null,lng:null,statusLocalizacao:'incerto',origemCoordenadas:null,centroCidade:centro || null};
}

const cepDigitos = value => String(value || '').replace(/\D/g, '');
const ufGeoapify = result => normalizarLocal(result.state_code).replace(/^BR-/, '');
const cidadeGeoapify = result => result.city || result.town || result.municipality || result.village;
const resultadoComCoordenadas = result => coordenadasValidas(result.lat, result.lon);
const coordenadasGeoapify = result => ({ lat: Number(result.lat), lng: Number(result.lon) });

async function buscarGeoapify(operacao, campos) {
    const config = await buscarJson(new URL('../../geoapify-config.json', import.meta.url).href);
    if (!config?.apiKey) throw new Error('Geoapify indisponível neste ambiente.');
    const params = new URLSearchParams({ ...campos, format: 'json', lang: 'pt', apiKey: config.apiKey });
    if (operacao === 'search') params.set('filter', 'countrycode:br');
    const { results } = await buscarJson(`https://api.geoapify.com/v1/geocode/${operacao}?${params}`);
    if (!Array.isArray(results)) throw new Error('O serviço de localização retornou uma resposta inválida.');
    return results;
}

export async function buscarEnderecoPorCep(cep) {
    const puro = cepDigitos(cep);
    if (puro.length !== 8) return null;

    let endereco;
    try {
        const resultados = await buscarGeoapify('search', { postcode: `${puro.slice(0, 5)}-${puro.slice(5)}`, limit: '5' });
        const exatos = resultados.filter(result => cepDigitos(result.postcode) === puro);
        const resultado = exatos.find(result => result.street && cidadeGeoapify(result) && /^[A-Z]{2}$/.test(ufGeoapify(result))) || exatos[0];
        if (resultado) {
            endereco = {
                logradouro: resultado.street,
                bairro: resultado.suburb || resultado.district || resultado.neighbourhood,
                cidade: cidadeGeoapify(resultado),
                uf: ufGeoapify(resultado)
            };
            if (endereco.logradouro && endereco.cidade && /^[A-Z]{2}$/.test(endereco.uf)) return endereco;
        }
    } catch {
        // A consulta complementar também atende ambientes sem chave do Geoapify.
    }

    try {
        const dados = await buscarJson(`https://viacep.com.br/ws/${puro}/json/`);
        if (!dados.erro && dados.localidade && dados.uf) {
            return { logradouro: dados.logradouro, bairro: dados.bairro, cidade: dados.localidade, uf: dados.uf };
        }
    } catch (erro) {
        if (!endereco?.cidade || !/^[A-Z]{2}$/.test(endereco.uf)) throw erro;
    }
    return endereco?.cidade && /^[A-Z]{2}$/.test(endereco.uf) ? endereco : null;
}

export async function buscarCentroCidade(cidade, uf) {
    const cidadeConsultada = String(cidade || '').trim();
    const ufConsultada = normalizarLocal(uf);
    if (!cidadeConsultada || !/^[A-Z]{2}$/.test(ufConsultada)) return null;
    const resultados = await buscarGeoapify('search', { city: cidadeConsultada, state: ufConsultada, type: 'city', limit: '5' });
    const resultado = resultados.find(result => result.result_type === 'city' && resultadoComCoordenadas(result) &&
        normalizarLocal(cidadeGeoapify(result) || result.name) === normalizarLocal(cidadeConsultada) &&
        ufGeoapify(result) === ufConsultada);
    return resultado ? { ...coordenadasGeoapify(resultado), cidade: cidadeConsultada, uf: ufConsultada } : null;
}

export async function buscarJson(url) {

    const controller = new AbortController();

    const temporizador = setTimeout(() => controller.abort(), 12000);

    try {

        const resposta = await fetch(url, { signal: controller.signal });

        if (!resposta.ok) throw new Error(`Consulta indisponível (HTTP ${resposta.status}).`);

        return await resposta.json();

    } finally { clearTimeout(temporizador); }

}

export function coordenadasValidas(lat, lng) {

    return lat !== null && lat !== undefined && lat !== '' && lng !== null && lng !== undefined && lng !== '' &&

        Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) && Math.abs(Number(lat)) <= 90 && Math.abs(Number(lng)) <= 180;

}

export function obterPosicao() {

    return new Promise((resolve, reject) => {

        if (!navigator.geolocation) return reject(new Error('Este navegador não disponibiliza geolocalização.'));

        navigator.geolocation.getCurrentPosition(resolve, erro => {
            const mensagem = erro.code === 1 ? 'Ative a localização e permita o acesso ao GPS.'
                : 'Não foi possível obter o GPS. Tente novamente em um local com melhor sinal.';
            reject(Object.assign(new Error(mensagem), { codigoGps: erro.code }));
        }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });

    });

}

export async function obterEnderecoPorCoords(lat, lng) {
    try {
        const resultados = await buscarGeoapify('reverse', { lat, lon: lng, limit: '1' });
        return resultados[0]?.formatted || 'Endereço não encontrado na base de mapas.';
    } catch {
        return 'Erro ao traduzir coordenadas para endereço.';
    }
}

// Usa campos separados para preservar o número e evitar que o bairro seja interpretado como rua.
export async function obterCoordsPorEndereco(endereco) {
    let campos;
    if (typeof endereco === 'string') {
        if (!endereco.trim()) return null;
        campos = { text: endereco.trim() };
    } else {
        const street = String(endereco?.logradouro || '').trim();
        const housenumber = String(endereco?.numero || '').trim();
        const city = String(endereco?.cidade || '').trim();
        const state = normalizarLocal(endereco?.uf);
        if (!street || !housenumber || !city || !state) return null;
        campos = { street, housenumber, city, state };
        const cep = cepDigitos(endereco.cep);
        if (cep.length === 8) campos.postcode = `${cep.slice(0, 5)}-${cep.slice(5)}`;
    }

    let resultados;
    try {
        resultados = await buscarGeoapify('search', { ...campos, limit: '5' });
    } catch (erro) {
        throw new Error('O serviço de localização está indisponível. Tente salvar novamente em alguns instantes.', { cause: erro });
    }
    // Coordenadas aproximadas de rua, bairro, cidade ou CEP não representam a loja.
    const resultado = resultados.find(result => resultadoComCoordenadas(result) &&
        ['building', 'amenity'].includes(result.result_type) && result.housenumber &&
        (!campos.housenumber || (
            normalizarLocal(result.housenumber) === normalizarLocal(campos.housenumber) &&
            normalizarLocal(cidadeGeoapify(result)) === normalizarLocal(campos.city) &&
            ufGeoapify(result) === campos.state &&
            (normalizarLocal(result.street) === normalizarLocal(campos.street) || result.rank?.confidence_street_level === 1) &&
            (!campos.postcode || !result.postcode || cepDigitos(result.postcode) === cepDigitos(campos.postcode))
        )));
    return resultado ? coordenadasGeoapify(resultado) : null;
}

export function calcularDistancia(lat1, lon1, lat2, lon2) {

    const R = 6371e3; const rad = Math.PI / 180;

    const dLat = (lat2 - lat1) * rad; const dLon = (lon2 - lon1) * rad;

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); return R * c; 

}

export function validarPrecisaoGps(pos) {
    const accuracy = Number(pos?.coords?.accuracy);
    if (!Number.isFinite(accuracy) || accuracy < 0) throw new Error('O GPS não retornou uma precisão válida.');
    if (accuracy > GPS_ACCURACY_MAX_METERS) throw new Error(`A precisão do GPS está baixa (${Math.round(accuracy)} m). Aguarde alguns segundos em local aberto e tente novamente.`);
    return accuracy;
}
