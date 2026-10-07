import { obterData } from './formatters.js';
import { normalizarTipoVisita } from './reports.js';

export function obterResultadoHistorico(visita) {
    if (visita.status === 'Cancelada') return 'Cancelada';
    if (String(visita.fechamentoAnaliseStatus || '').trim() === 'Pendente de análise') return 'Pendente';
    if (visita.status === 'Em andamento') return 'Em andamento';
    const valor = String(visita.resultado || '').trim().toLowerCase();
    if (valor === 'resolvido') return 'Resolvido';
    if (valor === 'não resolvido' || valor === 'nao resolvido') return 'Não resolvido';
    if (valor === 'cancelada' || visita.status === 'Cancelada') return 'Cancelada';
    return 'Concluída';
}

export function obterClasseResultadoHistorico(resultado) {
    if (resultado === 'Resolvido') return 'hist-status-resolvido';
    if (resultado === 'Não resolvido') return 'hist-status-nao-resolvido';
    if (resultado === 'Cancelada') return 'hist-status-cancelada';
    if (resultado === 'Pendente') return 'hist-status-pendente';
    if (resultado === 'Em andamento') return 'hist-status-andamento';
    return 'hist-status-concluida';
}

export function obterDataHistorico(visita) {
    return obterData(visita.checkinDataHora) || obterData(visita.data);
}

export function formatarDiaHistorico(data) {
    return `${String(data.getDate()).padStart(2, '0')} - ${data.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').toUpperCase()}`;
}

export function formatarHoraHistorico(valor) {
    const data = obterData(valor);
    if (!data) return '';
    return `${String(data.getHours()).padStart(2, '0')}h${String(data.getMinutes()).padStart(2, '0')}`;
}

export function formatarHorarioVisitaHistorico(visita) {
    const inicio = formatarHoraHistorico(visita.checkinDataHora);
    const fim = formatarHoraHistorico(visita.checkoutDataHora);
    if (inicio && fim) return `${inicio} - ${fim}`;
    return inicio || formatarHoraHistorico(visita.data) || 'Horário não informado';
}

export function inicioDaSemanaHistorico(data) {
    const inicio = new Date(data);
    const dia = inicio.getDay();
    const deslocamento = dia === 0 ? 6 : dia - 1;
    inicio.setHours(0, 0, 0, 0);
    inicio.setDate(inicio.getDate() - deslocamento);
    return inicio;
}

export function periodoHistorico(visita) {
    const data = obterDataHistorico(visita);
    if (!data) return 'Outras datas';

    const agora = new Date();
    const inicioSemana = inicioDaSemanaHistorico(agora);
    const inicioProximaSemana = new Date(inicioSemana);
    inicioProximaSemana.setDate(inicioProximaSemana.getDate() + 7);

    if (data >= inicioSemana && data < inicioProximaSemana) return 'Nessa semana';
    if (data.getMonth() === agora.getMonth() && data.getFullYear() === agora.getFullYear()) return 'Nesse mês';

    return data.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
        .replace(/^./, c => c.toUpperCase());
}

export function aplicarFiltrosHistorico(visitas, filtrosHistorico = { periodo: 'todos', resultado: 'todos' }) {
    const agora = new Date();
    const inicioSemana = inicioDaSemanaHistorico(agora);
    const inicioProximaSemana = new Date(inicioSemana);
    inicioProximaSemana.setDate(inicioProximaSemana.getDate() + 7);

    return visitas.filter(visita => {
        const resultado = obterResultadoHistorico(visita);
        const data = obterDataHistorico(visita);

        if (filtrosHistorico.tipo && filtrosHistorico.tipo !== 'todos' && normalizarTipoVisita(visita) !== filtrosHistorico.tipo) return false;

        if (filtrosHistorico.resultado !== 'todos' && resultado !== filtrosHistorico.resultado) return false;

        if (filtrosHistorico.periodo === 'semana') {
            if (!data || data < inicioSemana || data >= inicioProximaSemana) return false;
        } else if (filtrosHistorico.periodo === 'mes') {
            if (!data || data.getMonth() !== agora.getMonth() || data.getFullYear() !== agora.getFullYear()) return false;
        } else if (filtrosHistorico.periodo === 'anteriores') {
            if (!data || data.getMonth() === agora.getMonth() && data.getFullYear() === agora.getFullYear()) return false;
        }

        return true;
    });
}
