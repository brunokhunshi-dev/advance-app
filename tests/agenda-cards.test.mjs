import test from 'node:test';
import assert from 'node:assert/strict';
import { proximasVisitas, cardAgenda, visitasSecundarias } from '../src/ui/agenda-cards.js';

test('home shows at most five upcoming visits chronologically across months without mutating the source', () => {
    const hoje = new Date(2026, 9, 30, 15);
    const source = [
        ...[5, 4, 3, 2, 1].map(day => ({ id: String(day), data: new Date(2026, 10, day, 9), status: 'Pendente' })),
        { id: 'hoje', data: new Date(2026, 9, 30, 8), status: 'Em andamento' },
        { id: 'antiga', data: new Date(2026, 9, 29), status: 'Pendente' },
        { id: 'concluida', data: new Date(2026, 9, 31), status: 'Concluída' },
        { id: 'sem-data', status: 'Pendente' }
    ];
    assert.deepEqual(proximasVisitas(source, hoje).map(v => v.id), ['hoje', '1', '2', '3', '4']);
    assert.equal(source[0].id, '5');
});

test('home and agenda reuse the same cards; only home includes the day beside time', () => {
    const visit = { nomeCliente: '<Loja>', localidadeAgenda: 'INDAIATUBA - SP', data: new Date(2026, 9, 5, 13, 30), tipoVisita: 'Treinamento' };
    const home = cardAgenda(visit, 2, true), agenda = cardAgenda(visit, 2);
    assert.match(home, /05 - OUT · 13h30/);
    assert.doesNotMatch(agenda, /05 - OUT · 13h30/);
    assert.match(home, /data-ficha-index="2"/);
    assert.match(home, /&lt;Loja&gt;/);
    assert.match(home, /INDAIATUBA - SP/);
    assert.doesNotMatch(home, /<h2|agenda-day-heading/);
});


test('secondary visits exclude current activity and take only four chronological appointments', () => {
    const hoje = new Date(2026, 9, 5);
    const atividades = [6, 5, 4, 3, 2, 1].map(id => ({ id: String(id), status: 'Pendente', data: new Date(2026, 9, 5 + id) }));
    assert.deepEqual(visitasSecundarias(atividades, '2', hoje).map(v => v.id), ['1', '3', '4', '5']);
});
