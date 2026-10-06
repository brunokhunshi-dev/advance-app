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

// Estimativa pela extensão da rua no mapa; não representa precisão medida de GPS.
export function margemEstimadaRua(result) {
    if (!Array.isArray(result?.boundingbox) || result.boundingbox.length !== 4 || !coordenadasValidas(result.lat,result.lon)) return null;
    if (result.boundingbox.some(value => value === null || value === undefined || value === '' || !Number.isFinite(Number(value)))) return null;
    const [south,north,west,east] = result.boundingbox.map(Number);
    if (!coordenadasValidas(south,west) || !coordenadasValidas(north,east) || south > north || west > east) return null;
    const lat=Number(result.lat),lon=Number(result.lon);
    if (lat < south || lat > north || lon < west || lon > east) return null;
    return Math.ceil(Math.max(...[south,north].flatMap(y=>[west,east].map(x=>calcularDistancia(lat,lon,y,x)))));
}

export function raioPermitidoLoja(cliente) {
    if (cliente?.precisaoCoordenadas !== 'rua' || cliente?.origemCoordenadas !== 'geocodificacao') return 500;
    const margin=Number(cliente.margemErroCoordenadasMetros);
    return 500 + (Number.isFinite(margin) && margin > 0 ? Math.min(500,Math.ceil(margin)) : 0);
}

export async function obterAreaPorEndereco(endereco, {wait = ms => new Promise(resolve=>setTimeout(resolve,ms))} = {}) {
    const base={format:'jsonv2',countrycodes:'br',limit:'3',addressdetails:'1'};
    const normalizar=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/^(avenida|av\.?|rua|r\.?)\s+/,'').replace(/[^a-z0-9]/g,'');
    const queries=[];
    if (endereco.logradouro) queries.push({precision:'rua',zoom:16,params:new URLSearchParams({...base,street:endereco.logradouro,city:endereco.cidade,state:endereco.uf,country:'Brasil'})});
    const cep=String(endereco.cep||'').replace(/\D/g,'');
    if (cep.length===8) queries.push({precision:'cep',zoom:14,params:new URLSearchParams({...base,postalcode:cep,city:endereco.cidade,state:endereco.uf,country:'Brasil'})});
    queries.push({precision:'cidade',zoom:13,params:new URLSearchParams({...base,city:endereco.cidade,state:endereco.uf,country:'Brasil'})});
    for (let i=0;i<queries.length;i++) {
        if (i) await wait(1100);
        const query=queries[i];
        const data=await buscarJson('https://nominatim.openstreetmap.org/search?'+query.params);
        if (!Array.isArray(data)) continue;
        for (const result of data) {
            if (!coordenadasValidas(result.lat,result.lon)) continue;
            const city=result.address?.city||result.address?.town||result.address?.municipality;
            if (city && normalizar(city)!==normalizar(endereco.cidade)) continue;
            const state=result.address?.['ISO3166-2-lvl4'];
            if (state && state!==`BR-${String(endereco.uf).toUpperCase()}`) continue;
            if (query.precision==='rua') {
                if (!['road','street'].includes(result.addresstype)) continue;
                if (normalizar(result.address?.road||result.name)!==normalizar(endereco.logradouro)) continue;
            }
            return {...result,precision:query.precision,zoom:query.zoom,uncertaintyMeters:query.precision==='rua'?margemEstimadaRua(result):null};
        }
    }
    return null;
}

export function validarPrecisaoGps(pos) {
    const accuracy = Number(pos?.coords?.accuracy);
    if (!Number.isFinite(accuracy) || accuracy < 0) throw new Error('O GPS não retornou uma precisão válida.');
    if (accuracy > GPS_ACCURACY_MAX_METERS) throw new Error(`A precisão do GPS está baixa (${Math.round(accuracy)} m). Aguarde alguns segundos em local aberto e tente novamente.`);
    return accuracy;
}
