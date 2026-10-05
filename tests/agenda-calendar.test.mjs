import test from 'node:test';
import assert from 'node:assert/strict';
import { diasCalendario, AgendaCalendar, filtrarAgenda } from '../src/ui/agenda-calendar.js';

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
    const handlers = {};
    const root = { innerHTML: '', setAttribute() {}, addEventListener: (name, fn) => { handlers[name] = fn; } };
    const calendar = new AgendaCalendar(root);
    calendar.mes = new Date(2026, 11, 1);
    calendar.setActivities(Array.from({ length: 4 }, () => ({ data: new Date(2026, 11, 5) })));
    assert.equal((root.innerHTML.match(/<i><\/i>/g) || []).length, 3);
    assert.match(root.innerHTML, /4 visitas/);
    handlers.pointerdown({ pointerId: 1, button: 0, clientX: 200, clientY: 100 });
    handlers.pointerup({ pointerId: 1, clientX: 100, clientY: 105 });
    assert.equal(calendar.mes.getFullYear(), 2027);
    assert.equal(calendar.mes.getMonth(), 0);
    calendar.reset();
    assert.equal(calendar.atividades.length, 0);
    assert.equal(calendar.mes.getMonth(), new Date().getMonth());
});

test('swipe ignores taps, vertical scroll and cancelled gestures; supports right swipe and keyboard', () => {
    const handlers = {};
    const root = { innerHTML: '', setAttribute() {}, addEventListener: (name, fn) => { handlers[name] = fn; } };
    const calendar = new AgendaCalendar(root);
    calendar.mes = new Date(2026, 0, 1);
    const start = () => handlers.pointerdown({ pointerId: 1, button: 0, clientX: 100, clientY: 100 });
    start();
    handlers.pointerup({ pointerId: 1, clientX: 110, clientY: 102 });
    assert.equal(calendar.mes.getMonth(), 0);
    start();
    handlers.pointermove({ pointerId: 1, clientX: 110, clientY: 140 });
    handlers.pointerup({ pointerId: 1, clientX: 200, clientY: 150 });
    assert.equal(calendar.mes.getMonth(), 0);
    start();
    handlers.pointercancel();
    handlers.pointerup({ pointerId: 1, clientX: 200, clientY: 100 });
    assert.equal(calendar.mes.getMonth(), 0);
    start();
    handlers.pointerup({ pointerId: 1, clientX: 200, clientY: 100 });
    assert.equal(calendar.mes.getMonth(), 11);
    assert.equal(calendar.mes.getFullYear(), 2025);
    handlers.keydown({ key: 'ArrowRight', preventDefault() {} });
    assert.equal(calendar.mes.getMonth(), 0);
    assert.equal(calendar.mes.getFullYear(), 2026);
    assert.doesNotMatch(root.innerHTML, /data-calendar-month/);
});

test('monthly agenda starts today, sorts chronologically and retains original card indices', () => {
    const hoje = new Date(2026, 9, 5, 15);
    const atividades = [
        { data: new Date(2026, 9, 6, 10) }, { data: new Date(2026, 9, 4, 10) },
        { data: new Date(2026, 9, 5, 9) }, { data: new Date(2026, 9, 5, 8) },
        { data: new Date(2026, 10, 1, 10) }, { data: null }
    ];
    assert.deepEqual(filtrarAgenda(atividades, hoje, null, hoje).map(item => item.index), [3, 2, 0]);
    assert.deepEqual(filtrarAgenda(atividades, hoje, new Date(2026, 9, 4), hoje).map(item => item.index), [1]);
    assert.deepEqual(filtrarAgenda(atividades, new Date(2026, 10, 1), null, hoje).map(item => item.index), [4]);
    assert.equal(filtrarAgenda(atividades, hoje, new Date(2026, 9, 7), hoje).length, 0);
});

test('selecting a day updates the list, toggles back to month and clears on swipe', () => {
    const handlers = {};
    const root = { innerHTML: '', addEventListener: (name, fn) => { handlers[name] = fn; } };
    let changes = 0;
    const calendar = new AgendaCalendar(root, () => changes++);
    const date = new Date(2026, 9, 5, 12);
    const target = { closest: () => ({ dataset: { calendarDay: String(date.getTime()) } }) };
    handlers.pointerdown({ pointerId: 1, button: 0, clientX: 100, clientY: 100, target });
    handlers.pointerup({ pointerId: 1, clientX: 102, clientY: 101 });
    assert.equal(calendar.selecionado.getTime(), date.getTime());
    assert.equal(changes, 1);
    assert.match(root.innerHTML, /aria-pressed="true"/);
    handlers.click({ target, detail: 1 });
    assert.equal(changes, 1, 'browser click after tap must not toggle selection twice');
    handlers.click({ target, detail: 0 });
    assert.equal(calendar.selecionado, null);
    calendar.selectDay(new Date(2026, 8, 30, 12));
    assert.equal(calendar.mes.getMonth(), 8);
    calendar.changeMonth(1);
    assert.equal(calendar.selecionado, null);
});
