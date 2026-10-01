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

test('edição na agenda bloqueia datas inválidas antes de acessar o banco', async () => {
    const { readFileSync } = await import('node:fs');
    const vm = await import('node:vm');
    const source = readFileSync(new URL('../script.js', import.meta.url), 'utf8');
    const start = source.indexOf("    document.getElementById('btn-salvar-detalhes')?.addEventListener");
    const end = source.indexOf('\n}\n', start);
    let handler, erro;
    const elements = { 'btn-salvar-detalhes': { addEventListener: (_, fn) => { handler = fn; } },
        'det-data': { value: '2000-01-01' }, 'det-hora': { value: '10:00' } };
    const context = vm.createContext({ visitaEmEdicao: { id: 'v1' }, operacaoEmCurso: false,
        document: { getElementById: id => elements[id] }, sessaoAtual: () => ({ id: 'u1' }),
        lerDataHora: (data, hora) => new Date(`${data}T${hora}`), atualizarLimitesAgendamento: () => {},
        validarAgendamento, informarErro: (_, error) => { erro = error; } });
    vm.runInContext(source.slice(start, end), context);
    await handler(); assert.match(erro.message, /passado/);
    elements['det-data'].value = '2099-01-01';
    await handler(); assert.match(erro.message, /seis meses/);
});
