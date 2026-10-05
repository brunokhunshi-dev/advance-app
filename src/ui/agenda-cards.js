import { escaparHtml, formatarDataAgenda, obterData } from '../domain/formatters.js';
import { normalizarTipoVisita } from '../domain/reports.js';

export function proximasVisitas(atividades, hoje = new Date()) {
    const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
    return atividades.filter(atividade => {
        const data = obterData(atividade.data);
        return data && data >= inicio && ['Pendente', 'Em andamento'].includes(atividade.status);
    }).sort((a, b) => obterData(a.data) - obterData(b.data)).slice(0, 5);
}

export function cardAgenda(atividade, index, mostrarData = false) {
    const data = formatarDataAgenda(atividade.data);
    const horario = mostrarData ? `${data.diaMes} · ${data.hora}` : data.hora;
    const andamento = atividade.status === 'Em andamento'
        ? '<span class="agenda-status-badge">EM ANDAMENTO</span>' : '';
    return `<button type="button" class="card-agenda" data-ficha-index="${index}" aria-label="Ver agendamento de ${escaparHtml(atividade.nomeCliente)} em ${data.diaMes} às ${data.hora}">
        <span class="agenda-motivo">${escaparHtml(normalizarTipoVisita(atividade))}</span>
        <span class="agenda-cliente">${escaparHtml(atividade.nomeCliente)} ${andamento}</span>
        <span class="agenda-info-row"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg><span>${horario}</span></span>
        <span class="agenda-info-row"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 17v-5m0-9a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm-7 13c-2 1-3 2-3 3 0 2 4 3 10 3s10-1 10-3c0-1-1-2-3-3"/></svg><span>${escaparHtml(atividade.localidadeAgenda || 'Cidade não informada')}</span></span>
    </button>`;
}
