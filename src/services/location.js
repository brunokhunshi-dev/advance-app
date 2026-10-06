const GPS_ACCURACY_MAX_METERS = 150;
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

        navigator.geolocation.getCurrentPosition(resolve, erro => reject(new Error(

            erro.code === 1 ? 'Permita o acesso à localização para continuar.' : 'Não foi possível obter o GPS. Tente novamente em um local com melhor sinal.'

        )), { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });

    });

}

export async function obterEnderecoPorCoords(lat, lng) {

    try {

        const data = await buscarJson(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`); return data.display_name || "Endereço não encontrado na base de mapas.";

    } catch(e) { return "Erro ao traduzir coordenadas para endereço."; }

}

// Tenta consultas estruturadas e livres, sempre mantendo rua e número.
export function formatosBuscaEndereco(endereco) {
    const base = { format: 'jsonv2', countrycodes: 'br', limit: '3', addressdetails: '1' };
    if (typeof endereco === 'string') return [new URLSearchParams({ ...base, q: endereco })];
    const rua = String(endereco?.logradouro || '').trim(), numero = String(endereco?.numero || '').trim();
    const cidade = String(endereco?.cidade || '').trim(), uf = String(endereco?.uf || '').trim();
    if (!rua || !numero || !cidade || !uf) return [];
    const bairro = String(endereco?.bairro || '').trim(), cep = String(endereco?.cep || '').replace(/\D/g, '');
    const nomeRua = rua.replace(/^(?:avenida|av\.?|rua|r\.?|rodovia|rod\.?)\s+/i, '');
    const consultas = [
        new URLSearchParams({ ...base, street: `${numero} ${rua}`, city: cidade, state: uf, country: 'Brasil' }),
        new URLSearchParams({ ...base, q: `${rua}, ${numero}, ${cidade}, ${uf}, Brasil` }),
        new URLSearchParams({ ...base, q: [nomeRua, numero, bairro, cidade, uf, cep, 'Brasil'].filter(Boolean).join(', ') })
    ];
    return [...new Map(consultas.map(params => [params.toString(), params])).values()];
}

export async function obterCoordsPorEndereco(endereco, { wait = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
    const consultas = formatosBuscaEndereco(endereco);
    const normalizar = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    for (let index = 0; index < consultas.length; index++) {
        if (index) await wait(1100);
        let data;
        try { data = await buscarJson(`https://nominatim.openstreetmap.org/search?${consultas[index]}`); }
        catch (erro) { throw new Error('O serviço de localização está indisponível. Marque a entrada da loja no mapa.', { cause: erro }); }
        if (!Array.isArray(data)) throw new Error('O serviço de localização retornou uma resposta inválida.');
        for (const resultado of data) {
            if (!coordenadasValidas(resultado.lat, resultado.lon)) continue;
            // Rua, bairro, CEP e cidade não identificam a entrada da loja.
            if (['road','street','city','town','village','municipality','administrative','suburb','postcode'].includes(resultado.addresstype)) continue;
            if (typeof endereco !== 'string') {
                const address = resultado.address || {};
                const cidade = address.city || address.town || address.municipality;
                if (cidade && normalizar(cidade) !== normalizar(endereco.cidade)) continue;
                if (address.house_number && normalizar(address.house_number) !== normalizar(endereco.numero)) continue;
            }
            return { lat: Number(resultado.lat), lng: Number(resultado.lon) };
        }
    }
    return null;
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
