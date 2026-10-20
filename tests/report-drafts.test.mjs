import test from 'node:test';
import assert from 'node:assert/strict';
import { CommercialReport } from '../src/ui/commercial-report.js';
import { createReportDraftStore, reportSignature } from '../src/services/report-drafts.js';

// Transactional test double: requests added by onsuccess participate in the
// same transaction, and failed archive writes roll back the active draft too.
function fakeIndexedDB() {
    let rows = new Map(), failArchive = false;
    return {
        failNextArchive() { failArchive = true; },
        open() {
            const request = {};
            queueMicrotask(() => {
                request.result = {
                    objectStoreNames: { contains: () => false },
                    createObjectStore() {},
                    transaction() {
                        const working = new Map(rows);
                        let pending = 0, aborted = false;
                        const tx = {
                            objectStore() {
                                return {
                                    put(record) { return enqueue(() => {
                                        if (record.entries && failArchive) {
                                            failArchive = false;
                                            throw new Error('QuotaExceededError');
                                        }
                                        working.set(record.key, structuredClone(record));
                                    }); },
                                    get(key) { return enqueue(() => structuredClone(working.get(key))); },
                                    delete(key) { return enqueue(() => working.delete(key)); }
                                };
                            }
                        };
                        function enqueue(fn) {
                            const op = {};
                            pending++;
                            queueMicrotask(() => {
                                if (aborted) return;
                                try {
                                    op.result = fn();
                                    op.onsuccess?.();
                                } catch (error) {
                                    aborted = true; tx.error = error; tx.onabort?.(); return;
                                }
                                if (--pending === 0) {
                                    rows = working;
                                    tx.oncomplete?.();
                                }
                            });
                            return op;
                        }
                        return tx;
                    }
                };
                request.onupgradeneeded?.();
                request.onsuccess?.();
            });
            return request;
        }
    };
}

test('rascunhos e Blobs são isolados por usuário, visita e tipo', async () => {
    const store = createReportDraftStore(fakeIndexedDB());
    const blob = new Blob(['foto'], {type:'image/webp'});
    await store.save('u1','v1','Treinamento', {name:'primeiro'}, [['foto1',blob]], 'novo');
    const same = await store.load('u1','v1','Treinamento');
    assert.equal(same.data.name, 'primeiro');
    assert.equal(await same.files[0].file.text(), 'foto');
    assert.equal(await store.load('u2','v1','Treinamento'), undefined);
    assert.equal(await store.load('u1','v1','Visita comercial'), undefined);
    await store.remove('u1','v1','Treinamento');
    assert.equal(await store.load('u1','v1','Treinamento'), undefined);
});

test('gravações concorrentes da mesma visita preservam a versão mais recente', async () => {
    const store = createReportDraftStore(fakeIndexedDB());
    const first = store.save('u1','v1','Visita comercial',{text:'a'},[],'novo');
    const second = store.save('u1','v1','Visita comercial',{text:'ab'},[],'novo');
    await Promise.all([first, second]);
    assert.equal((await store.load('u1','v1','Visita comercial')).data.text, 'ab');
});

test('assinatura identifica atualização do relatório sem depender da classe Firestore', () => {
    const date = new Date('2026-10-19T10:00:00Z');
    const firebaseDate = {toMillis:() => date.getTime()};
    assert.equal(reportSignature({id:'r', atualizadoEm:date}), reportSignature({id:'r', atualizadoEm:firebaseDate}));
    assert.notEqual(reportSignature({id:'r', atualizadoEm:date}), reportSignature({id:'r', atualizadoEm:new Date(date.getTime()+1000)}));
});

for (const type of ['Visita comercial', 'Treinamento', 'Assistência técnica']) {
    test(type + ': conflito sobrevive a novo backup, limpeza pós-save e reabertura', async () => {
        const factory = fakeIndexedDB();
        const store = createReportDraftStore(factory);
        await store.save('u','v',type,{text:'texto local não enviado'},[['foto',new Blob(['foto original'])]],'r:1');
        const conflict = await store.load('u','v',type,'r:2');
        assert.equal(conflict.data.text, 'texto local não enviado');
        // Mesmo caminho de persistência usado pelo debounce e visibilitychange.
        await store.save('u','v',type,{text:'versão atual'},[],'r:2');
        await store.remove('u','v',type);
        const reopened = createReportDraftStore(factory);
        assert.equal(await reopened.load('u','v',type), undefined);
        const preserved = await reopened.loadConflicts('u','v',type);
        assert.equal(preserved.length, 1);
        assert.equal(preserved[0].baseSignature, 'r:1');
        assert.equal(preserved[0].data.text, 'texto local não enviado');
        assert.equal(await preserved[0].files[0].file.text(), 'foto original');
        assert.deepEqual(await reopened.loadConflicts('outro','v',type), []);
        assert.deepEqual(await reopened.loadConflicts('u','outra',type), []);
        assert.deepEqual(await reopened.loadConflicts('u','v','outro tipo'), []);
    });
}
test('salvar imediatamente após detectar conflito não remove o arquivo preservado', async () => {
    const store = createReportDraftStore(fakeIndexedDB());
    await store.save('u','v','Treinamento',{text:'local'},[],'r:1');
    await store.load('u','v','Treinamento','r:2');
    await store.remove('u','v','Treinamento');
    assert.equal((await store.loadConflicts('u','v','Treinamento'))[0].data.text, 'local');
});
test('backup com baseline diferente arquiva anterior mesmo sem load intermediário', async () => {
    const store = createReportDraftStore(fakeIndexedDB());
    await store.save('u','v','Treinamento',{text:'primeiro'},[],'r:1');
    await store.save('u','v','Treinamento',{text:'segundo'},[],'r:2');
    await store.save('u','v','Treinamento',{text:'terceiro'},[],'r:3');
    assert.equal((await store.load('u','v','Treinamento')).data.text, 'terceiro');
    assert.deepEqual((await store.loadConflicts('u','v','Treinamento')).map(x => x.data.text), ['primeiro','segundo']);
});
test('baseline compatível continua recuperando e limpando backup normalmente', async () => {
    const store = createReportDraftStore(fakeIndexedDB());
    await store.save('u','v','Treinamento',{text:'local'},[],'r:1');
    assert.equal((await store.load('u','v','Treinamento','r:1')).data.text, 'local');
    await store.remove('u','v','Treinamento');
    assert.deepEqual(await store.loadConflicts('u','v','Treinamento'), []);
    assert.equal(await store.load('u','v','Treinamento'), undefined);
});
for (const operation of ['load', 'save']) {
    test('falha ao arquivar em ' + operation + ' mantém texto e Blob originais', async () => {
        const factory = fakeIndexedDB(), store = createReportDraftStore(factory);
        await store.save('u','v','Treinamento',{text:'original'},[['foto',new Blob(['original'])]],'r:1');
        factory.failNextArchive();
        await assert.rejects(operation === 'load'
            ? store.load('u','v','Treinamento','r:2')
            : store.save('u','v','Treinamento',{text:'novo'},[],'r:2'), /Quota/);
        const original = await store.load('u','v','Treinamento');
        assert.equal(original.data.text, 'original');
        assert.equal(await original.files[0].file.text(), 'original');
        assert.deepEqual(await store.loadConflicts('u','v','Treinamento'), []);
    });
}

test('REV-01: restoreBackup conflict seguido de flushBackup preserva o conteúdo antigo', async () => {
    const store = createReportDraftStore(fakeIndexedDB());
    await store.save('u','v','Visita comercial',{text:'local não enviado',photos:[],blocks:[]},[['foto',new Blob(['imagem'])]],'r:1');
    const remote = {id:'r',atualizadoEm:new Date(2)};
    const backup = await store.load('u','v','Visita comercial',reportSignature(remote));
    const controller = Object.assign(Object.create(CommercialReport.prototype), {
        key:'v', active:true, saving:false, reviewCheckout:false,
        data:{text:'versão remota',photos:[],blocks:[]},
        baseReports:new Map([['v',remote]]), staged:new Map(),
        reviewCallbacks:{backupDraft:(id,data,files,signature) => store.save('u',id,'Visita comercial',data,files,signature)}
    });
    assert.equal(controller.restoreBackup('v',backup),'conflict');
    await controller.flushBackup();
    await store.remove('u','v','Visita comercial');
    const archived = await store.loadConflicts('u','v','Visita comercial');
    assert.equal(archived[0].data.text,'local não enviado');
    assert.equal(await archived[0].files[0].file.text(),'imagem');
});
