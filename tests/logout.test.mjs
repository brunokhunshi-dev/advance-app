import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('logout no perfil respeita operação em curso e confirmação e chama Firebase', async () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    assert.equal([...html.matchAll(/id="btn-logout"/g)].length, 1);
    assert.match(html, /<button[^>]*id="btn-logout"[^>]*>Sair da conta<\/button>/);
    const source = readFileSync(new URL('../script.js', import.meta.url), 'utf8');
    const start = source.indexOf("    document.getElementById('btn-logout')");
    const end = source.indexOf('    onAuthStateChanged', start);
    let handler, calls = 0, alerts = 0, accepted = false;
    const auth = {};
    const context = vm.createContext({ operacaoEmCurso: true, auth,
        document: { getElementById: () => ({ addEventListener: (_, fn) => { handler = fn; } }) },
        window: { mostrarAlerta: () => { alerts++; } }, confirm: () => accepted,
        signOut: async value => { assert.equal(value, auth); calls++; },
        informarErro: () => assert.fail('unexpected error') });
    vm.runInContext(source.slice(start, end), context);
    await handler(); assert.equal(alerts, 1); assert.equal(calls, 0);
    context.operacaoEmCurso = false;
    await handler(); assert.equal(calls, 0);
    accepted = true;
    await handler(); assert.equal(calls, 1);
});
