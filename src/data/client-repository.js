// Inject the transport so cache/session behavior is independent of Firebase and DOM.
export function createClientRepository(read, { ttlMs = 5 * 60 * 1000, now = Date.now } = {}) {
    const cache = new Map();
    const pending = new Map();
    let generation = 0;
    function set(id, value) {
        cache.set(id, { value, expiresAt: now() + ttlMs });
    }
    function get(id, { refresh = false } = {}) {
        if (!id) return Promise.resolve(null);
        if (refresh) cache.delete(id);
        const entry = cache.get(id);
        if (entry && entry.expiresAt > now()) return Promise.resolve(entry.value);
        if (pending.has(id)) return pending.get(id);
        const version = generation;
        const request = Promise.resolve().then(() => read(id)).then(value => {
            if (version === generation) set(id, value);
            return value;
        }).finally(() => {
            if (pending.get(id) === request) pending.delete(id);
        });
        pending.set(id, request);
        return request;
    }
    function clear() {
        generation++;
        cache.clear();
        pending.clear();
    }
    return { get, set, clear };
}
