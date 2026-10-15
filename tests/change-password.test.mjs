import test from 'node:test';
import assert from 'node:assert/strict';
import { changeAccountPassword } from '../src/ui/change-password.js';

function fixture() {
    const user = { email: 'teste@example.com' }, calls = [];
    const deps = {
        auth: { currentUser: user },
        EmailAuthProvider: { credential(email, password) { calls.push(['credential', email, password]); return 'credential'; } },
        async reauthenticateWithCredential(u, credential) { assert.equal(u, user); calls.push(['reauth', credential]); },
        async updatePassword(u, password) { assert.equal(u, user); calls.push(['update', password]); }
    };
    return { deps, calls };
}
test('validates all passwords before contacting Firebase', async () => {
    for (const values of [['', 'abcdef', 'abcdef'], ['old', 'abcdef', 'different'], ['old', '123', '123'], ['abcdef', 'abcdef', 'abcdef']]) {
        const { deps, calls } = fixture();
        await assert.rejects(changeAccountPassword(deps, ...values));
        assert.deepEqual(calls, []);
    }
});
test('reauthenticates with current password before updating; preserves spaces', async () => {
    const { deps, calls } = fixture();
    await changeAccountPassword(deps, ' current ', ' new password ', ' new password ');
    assert.deepEqual(calls, [['credential', 'teste@example.com', ' current '], ['reauth', 'credential'], ['update', ' new password ']]);
});
test('incorrect current password never updates password', async () => {
    const { deps, calls } = fixture();
    deps.reauthenticateWithCredential = async () => { throw Object.assign(new Error(), { code: 'auth/invalid-credential' }); };
    await assert.rejects(changeAccountPassword(deps, 'wrong', 'abcdef', 'abcdef'), { code: 'auth/invalid-credential' });
    assert.equal(calls.some(call => call[0] === 'update'), false);
});
test('missing or changed session never updates password', async () => {
    const { deps, calls } = fixture();
    deps.auth.currentUser = null;
    await assert.rejects(changeAccountPassword(deps, 'old', 'abcdef', 'abcdef'));
    assert.deepEqual(calls, []);
    deps.auth.currentUser = { email: 'teste@example.com' };
    deps.reauthenticateWithCredential = async () => { deps.auth.currentUser = null; };
    await assert.rejects(changeAccountPassword(deps, 'old', 'abcdef', 'abcdef'));
    assert.equal(calls.some(call => call[0] === 'update'), false);
});
