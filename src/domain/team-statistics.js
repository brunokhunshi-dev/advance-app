const normalizeText = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function calculateTeamStatistics(activities, locale = "pt-BR") {
    const stats = new Map();

    for (const activity of activities) {
        const id = activity.professionalId || "sem-profissional";
        if (!stats.has(id)) {
            stats.set(id, {
                id,
                professional: activity.professional,
                total: 0,
                completed: 0,
                inProgress: 0,
                pending: 0,
                trainings: 0,
                clients: new Set(),
                durations: [],
                lastActivity: null
            });
        }

        const item = stats.get(id);
        item.total += 1;
        if (activity.status === "Concluída") item.completed += 1;
        else if (activity.status === "Em andamento") item.inProgress += 1;
        else if (activity.status === "Pendente") item.pending += 1;
        if (normalizeText(activity.type).includes("treinamento")) item.trainings += 1;
        if (activity.clientId) item.clients.add(activity.clientId);
        if (Number.isFinite(activity.durationMinutes)) item.durations.push(activity.durationMinutes);
        if (!item.lastActivity || (activity.scheduledAt?.getTime() || 0) > (item.lastActivity.scheduledAt?.getTime() || 0)) {
            item.lastActivity = activity;
        }
    }

    return [...stats.values()]
        .map(item => ({
            ...item,
            clientCount: item.clients.size,
            completionRate: item.total ? Math.round((item.completed / item.total) * 100) : 0,
            averageDuration: item.durations.length
                ? Math.round(item.durations.reduce((sum, value) => sum + value, 0) / item.durations.length)
                : null
        }))
        .sort((first, second) => second.total - first.total || second.completed - first.completed || first.professional.name.localeCompare(second.professional.name));
}
