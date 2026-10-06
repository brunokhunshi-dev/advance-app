import { tempoData } from './formatters.js';
import { normalizarTipoVisita } from './reports.js';
export const PROFILE_TYPES = ['Visita comercial', 'Treinamento', 'Assistência técnica'];
export function profileStats(activities, days = 30, now = new Date()) {
    const start = new Date(now); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - days + 1);
    const end = now.getTime(), counts = PROFILE_TYPES.map(() => 0), durations = PROFILE_TYPES.map(() => 0);
    const visits = activities.filter(a => a.status === 'Concluída' && tempoData(a.checkoutDataHora || a.data) >= start.getTime() && tempoData(a.checkoutDataHora || a.data) <= end);
    const clients = new Map(), buckets = new Map();
    const key = date => days === 365 ? `${date.getFullYear()}-${date.getMonth()}` : String(Math.floor((new Date(date.getFullYear(), date.getMonth(), date.getDate()) - start) / 86400000 / (days === 90 ? 7 : 1)));
    for (let date = new Date(start); date <= now; date.setDate(date.getDate() + 1)) {
        const id = key(date);
        if (!buckets.has(id)) buckets.set(id, { date: new Date(date), counts: PROFILE_TYPES.map(() => 0) });
    }
    for (const visit of visits) {
        const type = normalizarTipoVisita(visit), index = PROFILE_TYPES.indexOf(type);
        if (index >= 0) {
            counts[index]++;
            const arrival = tempoData(visit.checkinDataHora), departure = tempoData(visit.checkoutDataHora);
            if (arrival && departure >= arrival) durations[index] += departure - arrival;
            const bucket = buckets.get(key(new Date(tempoData(visit.checkoutDataHora || visit.data))));
            if (bucket) bucket.counts[index]++;
        }
        if (visit.clienteId) {
            const client = clients.get(visit.clienteId) || { id: visit.clienteId, name: visit.nomeCliente || 'Cliente não encontrado', count: 0, lat: visit.cliente?.lat, lng: visit.cliente?.lng, address: visit.cliente?.enderecoCompleto || '' };
            client.count++; clients.set(client.id, client);
        }
    }
    return { start, end: now, visits, counts, durations, total: visits.length, clients: [...clients.values()], buckets: [...buckets.values()] };
}
export function profileDuration(ms) {
    const minutes = Math.floor(ms / 60000);
    return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}m`;
}
export function rankClients(clients, descending = true) {
    return [...clients].sort((a, b) => (descending ? b.count - a.count : a.count - b.count) || a.name.localeCompare(b.name, 'pt-BR')).slice(0, 8);
}
