// HOTFIX: coleta de localização não bloqueante com trilha para auditoria.
// Não altera regras de negócio de responsável, status ou relatório.
import { coordenadasValidas, calcularDistancia } from './location.js';

export async function capturarLocalizacaoOpcional(obterPosicao, obterEnderecoPorCoords) {
    let pos;
    try {
        pos = await obterPosicao();
    } catch (error) {
        return { lat:null, lng:null, accuracy:null, endereco:null, gpsStatus:'indisponivel',
            gpsErro:String(error?.message || 'Falha ao obter GPS'), capturadoEm:null };
    }
    const lat = pos?.coords?.latitude, lng = pos?.coords?.longitude;
    if (!coordenadasValidas(lat,lng)) {
        return { lat:null, lng:null, accuracy:null, endereco:null, gpsStatus:'invalido',
            gpsErro:'GPS retornou coordenadas inválidas', capturadoEm:null };
    }
    const precisao = Number(pos?.coords?.accuracy);
    const accuracy = Number.isFinite(precisao) && precisao >= 0 ? precisao : null;
    let endereco = null;
    try { endereco = await obterEnderecoPorCoords(Number(lat), Number(lng)); }
    catch { endereco = null; }
    return {lat:Number(lat),lng:Number(lng),accuracy,endereco,
        gpsStatus:accuracy === null ? 'sem_precisao' : accuracy > 150 ? 'baixa_precisao' : 'disponivel',
        gpsErro:null, capturadoEm:Number.isFinite(pos?.timestamp) ? new Date(pos.timestamp) : null};
}

export function montarAuditoriaLocalizacao({evento, atividadeId, atividade, cliente, sessao, localizacao, referencia, agora, modo = 'normal', motivo = null}) {
    if (!['checkin','checkout'].includes(evento)) throw new Error('Evento de auditoria inválido.');
    const lat = localizacao?.lat ?? null, lng = localizacao?.lng ?? null;
    const temGps = coordenadasValidas(lat,lng);
    const temReferencia = referencia && coordenadasValidas(referencia.lat,referencia.lng);
    const distanciaMetros = temGps && temReferencia ? Math.round(calcularDistancia(Number(lat),Number(lng),referencia.lat,referencia.lng)) : null;
    const limiteComparacao = temReferencia ? (referencia.incerto ? 50000 : 1500) : null;
    return {
        esquema:1, politica:'distancia_nao_bloqueante_temporaria', evento, modo, atividadeId,
        clienteId:atividade?.clienteId || null, ptvId:atividade?.ptvId || sessao?.id || null,
        uid:sessao?.uid || null, promotorNome:sessao?.nome || null,
        tipoVisita:atividade?.tipoVisita || null, agendadoPara:atividade?.data || null,
        registradoEm:agora, diaLocal:agora.toLocaleDateString('en-CA'),
        fusoHorario:Intl.DateTimeFormat().resolvedOptions().timeZone || null,
        clienteNome:cliente?.nome || null, clienteEndereco:cliente?.enderecoCompleto || null,
        clienteCidade:cliente?.cidade || null, clienteUf:cliente?.uf || null,
        statusCadastroLocalizacao:cliente?.statusLocalizacao || null,
        precisaoCadastro:cliente?.precisaoCoordenadas || null,
        gps:{lat:temGps ? Number(lat) : null, lng:temGps ? Number(lng) : null,
            precisaoMetros:localizacao?.accuracy ?? null, endereco:localizacao?.endereco || null,
            status:localizacao?.gpsStatus || 'indisponivel', erro:localizacao?.gpsErro || null,
            capturadoEm:localizacao?.capturadoEm || null},
        referencia:{lat:temReferencia ? Number(referencia.lat) : null,
            lng:temReferencia ? Number(referencia.lng) : null,
            tipo:temReferencia ? (referencia.incerto ? 'centro_cidade' : 'loja') : 'ausente',
            raioComparacaoMetros:limiteComparacao},
        distanciaMetros, foraRaioDeReferencia:distanciaMetros === null ? null : distanciaMetros > limiteComparacao,
        localizacaoNaoBloqueante:true, motivoFechamentoManual:motivo
    };
}
