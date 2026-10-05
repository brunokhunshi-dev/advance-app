export function createProductRepository(read, {ttlMs = 10 * 60 * 1000, now = Date.now} = {}) {
    let cached, expires = 0, pending, generation = 0;
    function list({refresh = false} = {}) {
        if (refresh) cached = undefined;
        if (cached && now() < expires) return Promise.resolve(cached);
        if (pending) return pending;
        const version = generation;
        const request = Promise.resolve().then(read).then(products => {
            if (version === generation) { cached = products; expires = now() + ttlMs; }
            return products;
        }).finally(() => { if (pending === request) pending = undefined; });
        pending = request;
        return request;
    }
    function clear() {generation++; cached=undefined; pending=undefined;}
    return {list, clear};
}
