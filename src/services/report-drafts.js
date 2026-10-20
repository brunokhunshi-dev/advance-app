// Rascunhos privados do PWA, identificados por usuário, tipo e atividade.
// Fotos comprimidas ficam no IndexedDB como File/Blob; nunca em localStorage.
export function reportSignature(report) {
    if (!report) return 'novo';
    const at = report.atualizadoEm;
    const millis = typeof at?.toMillis === 'function' ? at.toMillis()
        : at instanceof Date ? at.getTime()
        : typeof at?.seconds === 'number' ? at.seconds * 1000 + Math.floor((at.nanoseconds || 0) / 1e6) : '';
    return String(report.id || '') + ':' + String(millis);
}

export function createReportDraftStore(factory = globalThis.indexedDB) {
    let databasePromise;
    const queues = new Map();
    const keyFor = (uid, activityId, type) => {
        if (!uid || !activityId || !type) throw new Error('Rascunho sem usuário, atividade ou tipo.');
        return [uid, type, activityId].join(':');
    };
    function database() {
        if (!factory) return Promise.reject(new Error('Este navegador não disponibiliza IndexedDB.'));
        if (!databasePromise) databasePromise = new Promise((resolve, reject) => {
            const request = factory.open('advance-check-report-drafts', 1);
            request.onupgradeneeded = () => {
                if (!request.result.objectStoreNames.contains('drafts')) request.result.createObjectStore('drafts', { keyPath: 'key' });
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error('Falha ao abrir rascunhos locais.'));
            request.onblocked = () => reject(new Error('Feche outras abas do Advance Check e tente novamente.'));
        }).catch(error => { databasePromise = null; throw error; });
        return databasePromise;
    }
    async function transact(mode, command) {
        const db = await database();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('drafts', mode);
            const store = tx.objectStore('drafts');
            let result;
            tx.oncomplete = () => resolve(result);
            tx.onabort = () => reject(tx.error || new Error('Não foi possível gravar o rascunho neste dispositivo.'));
            tx.onerror = () => reject(tx.error || new Error('Erro no armazenamento local.'));
            const request = command(store, value => { result = value; });
            if (request) request.onsuccess = () => { result = request.result; };
        });
    }
    const serial = (key, job) => {
        const previous = queues.get(key) || Promise.resolve();
        const current = previous.catch(() => {}).then(job);
        queues.set(key, current);
        void current.finally(() => { if (queues.get(key) === current) queues.delete(key); }).catch(() => {});
        return current;
    };
    // Keep conflicts in the same object store: no database upgrade, and archive +
    // replacement/deletion commit atomically. A failed archive leaves the draft intact.
    const conflictKey = key => JSON.stringify(['conflicts', key]);
    function archive(store, record, done) {
        const key = conflictKey(record.key);
        const request = store.get(key);
        request.onsuccess = () => {
            const entries = [...(request.result?.entries || []), record];
            store.put({ key, entries });
            done();
        };
    }
    function save(uid, activityId, type, data, files, baseSignature) {
        const key = keyFor(uid, activityId, type);
        const record = { key, data: structuredClone(data), files: [...files].map(([id, file]) => ({ id, file })), baseSignature, updatedAt: Date.now() };
        return serial(key, () => transact('readwrite', store => {
            const request = store.get(key);
            request.onsuccess = () => {
                const previous = request.result;
                if (previous && previous.baseSignature !== baseSignature) {
                    archive(store, previous, () => store.put(record));
                } else store.put(record);
            };
        }));
    }
    function load(uid, activityId, type, currentSignature) {
        const key = keyFor(uid, activityId, type);
        return serial(key, () => transact('readwrite', (store, result) => {
            const request = store.get(key);
            request.onsuccess = () => {
                const record = request.result;
                result(record);
                if (record && currentSignature !== undefined && record.baseSignature !== currentSignature) {
                    // Return the original so the caller can show the conflict, but
                    // detach it from the active slot before any post-save cleanup.
                    archive(store, record, () => store.delete(key));
                }
            };
        }));
    }
    function loadConflicts(uid, activityId, type) {
        const key = keyFor(uid, activityId, type);
        return serial(key, () => transact('readonly', store => store.get(conflictKey(key))))
            .then(record => record?.entries || []);
    }
    function remove(uid, activityId, type) {
        const key = keyFor(uid, activityId, type);
        return serial(key, () => transact('readwrite', store => store.delete(key)));
    }
    return { save, load, loadConflicts, remove };
}
