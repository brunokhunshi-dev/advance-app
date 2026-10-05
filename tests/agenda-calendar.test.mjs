import test from 'node:test';
import assert from 'node:assert/strict';
import { diasCalendario, AgendaCalendar } from '../src/ui/agenda-calendar.js';

test('calendar aligns October 2026 to Thursday, with complete Sunday-first weeks', () => {
    const dias = diasCalendario(2026, 9);
    assert.equal(dias.length, 35);
    assert.equal(dias[0].data.getDay(), 0);
    assert.equal(dias[0].dia, 27);
    assert.equal(dias[0].fora, true);
    assert.equal(dias[4].dia, 1);
    assert.equal(dias[4].fora, false);
    assert.equal(dias.at(-1).dia, 31);
});

test('calendar counts visits on local dates including Firebase timestamps and ignores invalid dates', () => {
    const date = new Date(2026, 9, 5, 23, 30);
    const dias = diasCalendario(2026, 9, [{ data: date }, { data: { toDate: () => date } }, { data: date.toISOString() }, { data: null }, { data: 'invalid' }], date);
    const dia = dias.find(d => !d.fora && d.dia === 5);
    assert.equal(dia.visitas, 3);
    assert.equal(dia.hoje, true);
    assert.equal(dia.fimSemana, false);
    assert.equal(dias.filter(d => d.visitas).length, 1);
});

test('calendar handles leap years and six-week months', () => {
    assert.equal(diasCalendario(2024, 1).filter(d => !d.fora).length, 29);
    assert.equal(diasCalendario(2026, 4).length, 42);
});

test('month navigation crosses years, caps dots at three and reset removes visits', () => {
    let handler;
    const root = { innerHTML: '', addEventListener: (_, fn) => { handler = fn; }, contains: () => true, querySelector: () => null };
    const calendar = new AgendaCalendar(root);
    calendar.mes = new Date(2026, 11, 1);
    calendar.setActivities(Array.from({ length: 4 }, () => ({ data: new Date(2026, 11, 5) })));
    assert.equal((root.innerHTML.match(/<i><\/i>/g) || []).length, 3);
    assert.match(root.innerHTML, /4 visitas/);
    handler({ target: { closest: () => ({ dataset: { calendarMonth: '1' } }) } });
    assert.equal(calendar.mes.getFullYear(), 2027);
    assert.equal(calendar.mes.getMonth(), 0);
    calendar.reset();
    assert.equal(calendar.atividades.length, 0);
    assert.equal(calendar.mes.getMonth(), new Date().getMonth());
});
