// URLs are temporary bearer links: keep them only in memory, scoped to the current session.
export function createMediaUrlCache({ request, now = Date.now, schedule = callback => setTimeout(callback, 0), maxEntries = 300 }) {
    const cache = new Map(), pending = new Map();
    let queue = [], scheduled = false, generation = 0, batchSupported = true, blockedUntil = 0;
    const keyFor = ({activityId, mediaId, variant}) => JSON.stringify([activityId, mediaId, variant]);
    const validateUrl = value => {
        if (typeof value !== 'string' || !value.startsWith('https://')) throw new Error('URL da imagem inválida.');
        return value;
    };
    function finish(entry, value, error, ttl = 300) {
        if (entry.generation !== generation || pending.get(entry.key) !== entry) return;
        pending.delete(entry.key);
        if (error) {
            if (/quota exceeded|resource.exhausted|limite de consultas do banco/i.test(error.message || '')) blockedUntil = now() + 60000;
            entry.reject(error); return;
        }
        try {
            const url = validateUrl(value);
            cache.delete(entry.key);
            cache.set(entry.key, {url, expiresAt: now() + Math.max(0, Math.min(Number(ttl) || 0, 300) - 30) * 1000});
            while (cache.size > maxEntries) cache.delete(cache.keys().next().value);
            entry.resolve(url);
        } catch (failure) { entry.reject(failure); }
    }
    async function singles(entries) {
        let cursor = 0;
        await Promise.all(Array.from({length:Math.min(3, entries.length)}, async () => {
            while (cursor < entries.length) {
                const entry = entries[cursor++];
                if (entry.generation !== generation) continue;
                if (blockedUntil > now()) { finish(entry, null, new Error('Limite de consultas atingido. Aguarde um minuto antes de tentar novamente.')); continue; }
                try {
                    const result = await request('/v1/media/read-url', entry.item);
                    finish(entry, result.url, null, result.expiresIn);
                } catch (error) { finish(entry, null, error); }
            }
        }));
    }
    async function flush() {
        scheduled = false;
        const entries = queue; queue = [];
        for (let offset = 0; offset < entries.length; offset += 30) {
            const group = entries.slice(offset, offset + 30);
            if (group[0].generation !== generation) continue;
            if (blockedUntil > now()) {
                for (const entry of group) finish(entry, null, new Error('Limite de consultas atingido. Aguarde um minuto antes de tentar novamente.'));
                continue;
            }
            if (!batchSupported) { await singles(group); continue; }
            try {
                const result = await request('/v1/media/read-urls', {items:group.map(entry => entry.item)});
                for (const entry of group) {
                    const match = result.items?.find(item => keyFor(item) === entry.key);
                    finish(entry, match?.url, match ? null : new Error('O serviço não retornou esta imagem.'), result.expiresIn);
                }
            } catch (error) {
                // Compatibility with the existing Worker: probe only once per session.
                if ([403,404].includes(error.status) && /restrita aos perfis de gest|Endpoint não encontrado/i.test(error.message || '')) {
                    batchSupported = false; await singles(group);
                } else for (const entry of group) finish(entry, null, error);
            }
        }
    }
    function read(activityId, mediaId, variant = 'original') {
        const item = {activityId, mediaId, variant}, key = keyFor(item), hit = cache.get(key);
        if (hit?.expiresAt > now()) return Promise.resolve(hit.url);
        cache.delete(key);
        if (pending.has(key)) return pending.get(key).promise;
        if (blockedUntil > now()) return Promise.reject(new Error('Limite de consultas atingido. Aguarde um minuto antes de tentar novamente.'));
        const entry = {key, item, generation};
        entry.promise = new Promise((resolve, reject) => Object.assign(entry, {resolve, reject}));
        pending.set(key, entry); queue.push(entry);
        if (!scheduled) { scheduled = true; schedule(flush); }
        return entry.promise;
    }
    function clear() {
        generation++; cache.clear(); queue = []; blockedUntil = 0; batchSupported = true;
        for (const entry of pending.values()) entry.reject(new Error('A sessão foi alterada. Abra a imagem novamente.'));
        pending.clear();
    }
    return {read, clear};
}
