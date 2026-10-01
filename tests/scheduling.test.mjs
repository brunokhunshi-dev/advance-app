import test from 'node:test';
import assert from 'node:assert/strict';
import { limitesAgendamento, validarAgendamento } from '../src/domain/scheduling.js';

test('agendamento rejeita passado e aceita hoje e o limite de seis meses', () => {
    const agora = new Date(2026, 9, 1, 15, 10, 30);
    assert.throws(() => validarAgendamento(new Date(2026, 8, 30, 16), agora), /passado/);
    assert.throws(() => validarAgendamento(new Date(2026, 9, 1, 15, 9), agora), /passado/);
    assert.doesNotThrow(() => validarAgendamento(new Date(2026, 9, 1, 15, 10), agora));
    assert.doesNotThrow(() => validarAgendamento(new Date(2027, 3, 1, 23, 59), agora));
    assert.throws(() => validarAgendamento(new Date(2027, 3, 2), agora), /seis meses/);
    assert.throws(() => validarAgendamento(new Date(NaN), agora), /válidos/);
});

test('seis meses respeitam fim do mês, ano bissexto e mudança de dia', () => {
    assert.equal(limitesAgendamento(new Date(2026, 7, 31)).maxInput, '2027-02-28');
    assert.equal(limitesAgendamento(new Date(2023, 7, 31)).maxInput, '2024-02-29');
    assert.equal(limitesAgendamento(new Date(2026, 9, 2)).minInput, '2026-10-02');
});
