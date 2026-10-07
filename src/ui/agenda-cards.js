import { escaparHtml, formatarDataAgenda, obterData } from '../domain/formatters.js';
import { normalizarTipoVisita } from '../domain/reports.js';

export function proximasVisitas(atividades, hoje = new Date()) {
    const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
    return atividades.filter(atividade => {
        const data = obterData(atividade.data);
        return data && data >= inicio && ['Pendente', 'Em andamento'].includes(atividade.status);
    }).sort((a, b) => obterData(a.data) - obterData(b.data)).slice(0, 5);
}

export function visitasSecundarias(atividades, atualId, hoje = new Date()) {
    return proximasVisitas(atividades.filter(atividade => atividade.id !== atualId), hoje).slice(0, 4);
}

export function cardAgenda(atividade, index, mostrarData = false) {
    const data = formatarDataAgenda(atividade.data);
    const horario = mostrarData ? `${data.diaMes} · ${data.hora}` : data.hora;
    const andamento = atividade.status === 'Em andamento'
        ? '<span class="agenda-status-badge">EM ANDAMENTO</span>' : '';
    return `<button type="button" class="card-agenda" data-ficha-index="${index}" aria-label="Ver agendamento de ${escaparHtml(atividade.nomeCliente)} em ${data.diaMes} às ${data.hora}">
        <span class="agenda-motivo">${escaparHtml(normalizarTipoVisita(atividade))}</span>
        <span class="agenda-cliente">${escaparHtml(atividade.nomeCliente)} ${andamento}</span>
        <span class="agenda-info-row"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true" class="heroicon" data-heroicon="clock" width="24" height="24"> <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/> </svg><span>${horario}</span></span>
        <span class="agenda-info-row"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true" class="heroicon" data-heroicon="map-pin" width="24" height="24"> <path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/> <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z"/> </svg><span>${escaparHtml(atividade.localidadeAgenda || 'Cidade não informada')}</span></span>
    </button>`;
}
