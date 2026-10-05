import test from 'node:test';
import assert from 'node:assert/strict';
import { HomeVisitMap, mapTheme } from '../src/ui/home-map.js';
import { AgendaCalendar, filtrarAgenda } from '../src/ui/agenda-calendar.js';

function setup(getPosition) {
    const markers = [], bounds = [], removed = [], maps = [];
    const canvas = { replaceChildren() {}, ownerDocument: { createElement: () => ({ setAttribute() {} }) } }, status = { textContent: '' };
    const gl = {
        Map: class {
            constructor(options) { this.options = options; this.handlers = {}; this.paint = []; this.layout = []; this.touchZoomRotate = { disableRotation() {} }; maps.push(this); }
            resize() {}
            addControl() {}
            fitBounds(value) { bounds.push(value.points); }
            remove() { removed.push(true); }
            on(event, handler) { this.handlers[event] = handler; }
            getStyle() { return { layers: [{ id: 'water', type: 'fill', 'source-layer': 'water' }] }; }
            setPaintProperty(...args) { this.paint.push(args); }
            setLayoutProperty(...args) { this.layout.push(args); }
        },
        AttributionControl: class {},
        Popup: class { setText(text) { this.text = text; return this; } },
        LngLatBounds: class { constructor(point) { this.points = [point]; } extend(point) { this.points.push(point); return this; } },
        Marker: class {
            constructor(options) { this.options = options; }
            setLngLat(position) { this.position = position; return this; }
            setPopup(popup) { this.popup = popup.text; return this; }
            addTo() { markers.push(this); return this; }
        }
    };
    const controller = new HomeVisitMap(canvas, status, { getPosition, loadLibrary: async () => gl });
    return { controller, markers, bounds, removed, status, maps };
}

const cliente = { lat: -23.09, lng: -47.21, nome: '<Loja>' };

test('home map shows real person and destination positions and fits both into view', async () => {
    const s = setup(async () => ({ coords: { latitude: -23.1, longitude: -47.2 } }));
    await s.controller.update(cliente);
    assert.equal(s.markers.length, 2);
    assert.equal(s.markers[0].popup, '<Loja>');
    assert.equal(s.maps[0].options.dragPan, true);
    assert.equal(s.maps[0].options.cooperativeGestures, false);
    assert.equal(s.maps[0].options.scrollZoom, false);
    s.maps[0].handlers['style.load']();
    assert.deepEqual(s.maps[0].paint[0], ['water', 'fill-color', '#A3C7F3']);
    s.maps[0].handlers.load();
    assert.deepEqual(s.bounds[0], [[-47.21, -23.09], [-47.2, -23.1]]);
    assert.equal(s.status.textContent, '');
});

test('denied GPS keeps destination and reports the issue without fabricating person position', async () => {
    const s = setup(async () => { throw new Error('Permita o acesso à localização para continuar.'); });
    await s.controller.update(cliente);
    assert.equal(s.markers.length, 1);
    assert.match(s.status.textContent, /Permita/);
    s.maps[0].handlers.load();
    assert.match(s.status.textContent, /Permita/, 'GPS warning survives delayed map load');
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


test('map palette recolors geography without changing geometry, filters or road widths', () => {
    const style = { layers: [
        { id: 'background', type: 'background' },
        { id: 'water', type: 'fill', 'source-layer': 'water' },
        { id: 'park', type: 'fill', 'source-layer': 'park' },
        { id: 'building', type: 'fill', 'source-layer': 'building' },
        { id: 'road_case', type: 'line', 'source-layer': 'transportation', paint: { 'line-width': 3 } },
        { id: 'road', type: 'line', 'source-layer': 'transportation' },
        { id: 'poi', type: 'symbol', 'source-layer': 'poi', layout: { 'text-field': ['get', 'name'] } }
    ] };
    const patches = mapTheme(style);
    assert.equal(patches[0].paint['background-color'], '#F8F9FA');
    assert.equal(patches[1].paint['fill-color'], '#A3C7F3');
    assert.equal(patches[2].paint['fill-color'], '#CFE8CC');
    assert.equal(patches[3].paint['fill-color'], '#E8EAED');
    assert.equal(patches[4].paint['line-color'], '#DADCE0');
    assert.equal(patches[4].paint['line-width'], undefined);
    assert.equal(style.layers[4].paint['line-width'], 3);
    assert.equal(patches[6].layout.visibility, 'none');
});

test('map dependency failure leaves an explicit connection message and no markers', async () => {
    const s = setup(async () => { throw Error('GPS should not run'); });
    s.controller.loadLibrary = async () => { throw Error('offline'); };
    await s.controller.update(cliente);
    assert.equal(s.markers.length, 0);
    assert.match(s.status.textContent, /conexão/);
});
