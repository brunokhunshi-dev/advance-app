import test from 'node:test';
import assert from 'node:assert/strict';
import { describeOperationError } from '../src/domain/operation-errors.js';

test('Firestore exhaustion identifies the service and explains unsaved check-ins', () => {
    const message = describeOperationError({code:'resource-exhausted',message:'Quota exceeded'},'check-in');
    assert.match(message,/Firestore/);
    assert.match(message,/NÃO considere a operação concluída/);
    assert.match(message,/não pressione repetidamente/i);
});
test('HTTP 429 explains preventative limit and cooldown', () => {
    const message=describeOperationError({status:429,message:'Too many requests'},'visualização das imagens');
    assert.match(message,/limite preventivo/);
    assert.match(message,/HTTP 429/);
});
test('permission and network failures give specific instructions',()=>{
    assert.match(describeOperationError({code:'permission-denied'},'check-out'),/permissão necessária/);
    assert.match(describeOperationError({code:'unavailable'},'check-out'),/conexão/);
});
test('secrets in errors are not displayed',()=>{
    const message=describeOperationError({message:'Bearer secret token https://example.test'},'check-in');
    assert.doesNotMatch(message,/secret token/);
});
