import test from 'node:test';
import assert from 'node:assert/strict';
import { describeOperationError } from '../src/domain/operation-errors.js';

test('service limits give short guidance without technical identifiers', () => {
    const quota = describeOperationError({code:'resource-exhausted',message:'Quota exceeded'});
    assert.equal(quota, 'O serviço atingiu o limite de uso. Tente mais tarde.');
    const rateLimit = describeOperationError({status:429,message:'Too many requests'});
    assert.equal(rateLimit, 'Muitas solicitações em pouco tempo. Aguarde e tente novamente.');
});

test('permission and network failures give specific reasons', () => {
    assert.match(describeOperationError({code:'firestore/permission-denied'}), /não tem permissão/);
    assert.match(describeOperationError({code:'unavailable'}), /conexão/);
});

test('short application messages remain actionable', () => {
    assert.equal(describeOperationError(new Error('Selecione um cliente da lista.')), 'Selecione um cliente da lista.');
});

test('technical details and long messages fall back to a brief error', () => {
    for (const error of [
        {message:'Bearer secret token https://example.test'},
        {code:'internal',message:'Sensitive diagnostics'},
        {message:'a'.repeat(151)}
    ]) {
        assert.equal(describeOperationError(error), 'Falha inesperada. Tente novamente.');
    }
});
