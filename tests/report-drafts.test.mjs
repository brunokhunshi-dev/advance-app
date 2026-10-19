import test from 'node:test';
import assert from 'node:assert/strict';
import { createReportDraftStore, reportSignature } from '../src/services/report-drafts.js';

function fakeIndexedDB() {
    const rows = new Map();
    return {
        open() {
            const request = {};
            queueMicrotask(() => {
                request.result = {
                    objectStoreNames: { contains: () => false },
                    createObjectStore() {},
                    transaction(_name, _mode) {
                        const tx = {
                            objectStore() {
                                return {
                                    put(record) { return enqueue(() => { rows.set(record.key, record); }); },
                                    get(key) { return enqueue(() => rows.get(key)); },
                                    delete(key) { return enqueue(() => { rows.delete(key); }); }
                                };
                            }
                        };
                        function enqueue(fn) {
                            const op = {};
                            queueMicrotask(() => {
                                op.result = fn();
                                op.onsuccess?.();
                                queueMicrotask(() => tx.oncomplete?.());
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
