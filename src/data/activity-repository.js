// Reaproveita leituras de atividades entre início e agenda sem listeners persistentes.
export function createActivityRepository(read, { now = Date.now, ttlMs = 5000, cooldownMs = 60000 } = {}) {
    const cache = new Map();
    const pending = new Map();
    let generation = 0;
    let blockedUntil = 0;

    const copy = rows => rows.map(row => ({ ...row }));
    const quotaError = error => {
        const code = String(error?.code || '').toLowerCase();
        const message = String(error?.message || '');
        return code.includes('resource-exhausted') || /quota exceeded|resource[-.]exhausted/i.test(message);
    };

    function listActive(userId) {
        if (!userId) return Promise.resolve([]);
        const cached = cache.get(userId);
        if (cached && cached.expiresAt > now()) return Promise.resolve(copy(cached.rows));
        if (pending.has(userId)) return pending.get(userId).then(copy);
        if (now() < blockedUntil) {
            const error = new Error('Consultas temporariamente suspensas após limite do Firestore.');
            error.code = 'resource-exhausted';
            return Promise.reject(error);
        }
        const version = generation;
        const request = Promise.resolve().then(() => read(userId)).then(rows => {
            if (version === generation) cache.set(userId, { rows: copy(rows), expiresAt: now() + ttlMs });
            return rows;
        }).catch(error => {
            if (quotaError(error)) blockedUntil = Math.max(blockedUntil, now() + cooldownMs);
            throw error;
        }).finally(() => {
            if (pending.get(userId) === request) pending.delete(userId);
        });
        pending.set(userId, request);
        return request.then(copy);
    }

    function invalidate() {
        generation++;
        cache.clear();
        pending.clear();
    }

    function clear() {
        invalidate();
        blockedUntil = 0;
    }

    return { listActive, invalidate, clear };
}
