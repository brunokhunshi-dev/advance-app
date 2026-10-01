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

export async function obterCoordsPorEndereco(endereco) {

    try {

        const data = await buscarJson(`https://nominatim.openstreetmap.org/search?format=json&countrycodes=br&q=${encodeURIComponent(endereco)}&limit=1`);

        if(data.length > 0) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }; return null;

    } catch(e) { return null; }

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
