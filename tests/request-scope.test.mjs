import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequestScope } from '../src/domain/request-scope.js';

test('abertura de outra visita invalida resultado anterior', () => {
    const scope = createRequestScope();
    const a = scope.begin('visita-a');
    const b = scope.begin('visita-b');
    assert.equal(scope.isCurrent(a, 'visita-a'), false);
    assert.equal(scope.isCurrent(b, 'visita-b'), true);
    assert.equal(scope.isCurrent(b, 'visita-a'), false);
    scope.invalidate();
    assert.equal(scope.isCurrent(b, 'visita-b'), false);
});
