// Share only in-flight reads. Never retain successful snapshots across writes.
export function createQueryCoordinator({now = Date.now, cooldownMs = 60000} = {}) {
    const pending = new Map();
    let generation = 0, blockedUntil = 0, blockedError;
    function run(key, load) {
        if (blockedUntil > now()) return Promise.reject(blockedError);
        if (pending.has(key)) return pending.get(key);
        const version = generation;
        const promise = Promise.resolve().then(load);
        pending.set(key, promise);
        const release = error => {
            if (version !== generation) return;
            if (pending.get(key) === promise) pending.delete(key);
            const code = String(error?.code || '').split('/').at(-1);
            if (code === 'resource-exhausted' || error?.status === 429 || /quota exceeded|resource[-.]exhausted/i.test(error?.message || '')) {
                blockedUntil = now() + cooldownMs;
                blockedError = error;
            }
        };
        promise.then(() => release(), release);
        return promise;
    }
    function clear() {
        generation++;
        pending.clear();
        blockedUntil = 0;
        blockedError = undefined;
    }
    return {run, clear};
}
