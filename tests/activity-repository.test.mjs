import test from 'node:test';
import assert from 'node:assert/strict';
import { createActivityRepository } from '../src/data/activity-repository.js';

test('reusa a mesma consulta pendente em telas diferentes e isola mutações', async () => {
    let calls = 0;
    let resolve;
    const repo = createActivityRepository(() => { calls++; return new Promise(r => { resolve = r; }); });
    const first = repo.listActive('p1');
    const second = repo.listActive('p1');
    await Promise.resolve();
    assert.equal(calls, 1);
    resolve([{id:'v1', status:'Pendente'}]);
    const [a,b] = await Promise.all([first,second]);
    a[0].status = 'Alterado';
    assert.equal(b[0].status, 'Pendente');
    assert.equal((await repo.listActive('p1'))[0].status, 'Pendente');
});

test('invalidação após mutação força nova consulta', async () => {
    let calls = 0;
    const repo = createActivityRepository(async () => [{id:String(++calls)}]);
    assert.equal((await repo.listActive('p1'))[0].id, '1');
    assert.equal((await repo.listActive('p1'))[0].id, '1');
    repo.invalidate();
    assert.equal((await repo.listActive('p1'))[0].id, '2');
});

test('ao estourar quota, novas consultas falham localmente sem tentar o servidor', async () => {
    let calls = 0;
    let clock = 1000;
    const repo = createActivityRepository(async () => {
        calls++;
        if (calls === 1) throw Object.assign(new Error('Quota exceeded'), {code:'resource-exhausted'});
        return [{id:'ok'}];
    }, {now:() => clock, cooldownMs:60000});
    await assert.rejects(repo.listActive('p1'), /Quota exceeded/);
    await assert.rejects(repo.listActive('p1'), /temporariamente suspensas/);
    assert.equal(calls, 1);
    clock += 60001;
    assert.equal((await repo.listActive('p1'))[0].id, 'ok');
    assert.equal(calls, 2);
});

test('resposta antiga não repopula cache após invalidar', async () => {
    let resolves = [];
    let calls = 0;
    const repo = createActivityRepository(() => {calls++; return new Promise(r => resolves.push(r));});
    const old = repo.listActive('p1');
    await Promise.resolve();
    repo.invalidate();
    const fresh = repo.listActive('p1');
    await Promise.resolve();
    resolves[0]([{id:'antiga'}]);
    await old;
    resolves[1]([{id:'nova'}]);
    await fresh;
    assert.equal((await repo.listActive('p1'))[0].id, 'nova');
    assert.equal(calls,2);
});
