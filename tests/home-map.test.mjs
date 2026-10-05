import test from 'node:test';
import assert from 'node:assert/strict';
import { HomeVisitMap } from '../src/ui/home-map.js';
import { AgendaCalendar, filtrarAgenda } from '../src/ui/agenda-calendar.js';

function setup(getPosition) {
    const markers = [], bounds = [], removed = [];
    const canvas = { replaceChildren() {} }, status = { textContent: '' };
    const L = {
        map: () => ({ setView() {}, invalidateSize() {}, fitBounds: b => bounds.push(b), remove: () => removed.push(true) }),
        tileLayer: () => ({ addTo() {} }), divIcon: options => options,
        marker: (position, options) => {
            const marker = { position, options, addTo() { markers.push(this); return this; }, bindPopup(text) { this.popup = text; return this; } };
            return marker;
        }
    };
    const controller = new HomeVisitMap(canvas, status, { getPosition, loadLibrary: async () => L });
    return { controller, markers, bounds, removed, status };
}
const cliente = { lat: -23.09, lng: -47.21, nome: '<Loja>' };

test('home map shows real person and destination positions and fits both into view', async () => {
    const s = setup(async () => ({ coords: { latitude: -23.1, longitude: -47.2 } }));
    await s.controller.update(cliente);
    assert.equal(s.markers.length, 2);
    assert.equal(s.markers[0].popup, '&lt;Loja&gt;');
    assert.deepEqual(s.bounds[0], [[-23.09, -47.21], [-23.1, -47.2]]);
    assert.equal(s.status.textContent, '');
});

test('denied GPS keeps destination and reports the issue without fabricating person position', async () => {
    const s = setup(async () => { throw new Error('Permita o acesso à localização para continuar.'); });
    await s.controller.update(cliente);
    assert.equal(s.markers.length, 1);
    assert.match(s.status.textContent, /Permita/);
});

test('logout invalidates delayed GPS and removes map and markers', async () => {
    let resolve;
    const s = setup(() => new Promise(r => { resolve = r; }));
    const pending = s.controller.update(cliente);
    await Promise.resolve();
    s.controller.clear();
    resolve({ coords: { latitude: -23, longitude: -47 } });
    await pending;
    assert.equal(s.markers.length, 1);
    assert.equal(s.removed.length, 1);
    assert.equal(s.controller.map, null);
    assert.equal(s.status.textContent, '');
});

test('missing destination coordinates do not request GPS or load a fictitious map', async () => {
    let requests = 0;
    const s = setup(async () => { requests++; });
    await s.controller.update({ nome: 'Loja' });
    assert.equal(requests, 0);
    assert.equal(s.markers.length, 0);
    assert.match(s.status.textContent, /localização cadastrada/);
    await s.controller.update(null);
    assert.match(s.status.textContent, /Nenhuma próxima visita/);
});

test('home calendar selects empty days, opens populated days and preserves exact date on repeat', () => {
    const root = () => ({ innerHTML: '', addEventListener() {} });
    const agenda = new AgendaCalendar(root());
    const routes = [];
    const home = new AgendaCalendar(root(), () => {
        if (home.selecionado && filtrarAgenda(home.atividades, home.mes, home.selecionado).length) {
            agenda.selectDay(new Date(home.selecionado.getTime()), false);
            routes.push('agenda');
        }
    }, 'home-calendar-title', false);
    const dia = new Date(2026, 9, 5, 12);
    home.setActivities([{ data: dia }]);
    home.selectDay(new Date(2026, 9, 6, 12));
    assert.equal(home.selecionado.getDate(), 6);
    assert.equal(routes.length, 0);
    home.selectDay(dia);
    home.selectDay(dia);
    assert.equal(routes.length, 2);
    assert.equal(agenda.selecionado.getTime(), dia.getTime());
    assert.match(home.root.innerHTML, /id="home-calendar-title"/);
    assert.doesNotMatch(home.root.innerHTML, /id="agenda-calendar-title"/);
    home.changeMonth(1);
    assert.equal(routes.length, 2);
});
