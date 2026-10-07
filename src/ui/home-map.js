import { coordenadasValidas } from '../services/location.js';

let mapLibraryPending;
export function loadMapLibrary() {
    if (!mapLibraryPending) {
        mapLibraryPending = import('https://unpkg.com/maplibre-gl@6.12.0/dist/maplibre-gl.mjs')
            .catch(error => { mapLibraryPending = null; throw error; });
    }
    return mapLibraryPending;
}

// Paleta familiar: água azul, parques verdes, ruas claras e edificações cinza.
// Preserva filtros, geometria e espessuras da base cartográfica OpenFreeMap.
export function mapTheme(style) {
    return style.layers.map(layer => {
        const source = layer['source-layer'], id = layer.id.toLowerCase();
        const paint = {}, layout = {};
        if (layer.type === 'background') paint['background-color'] = '#F8F9FA';
        if (layer.type === 'fill') {
            if (source === 'water') paint['fill-color'] = '#A3C7F3';
            else if (source === 'building') paint['fill-color'] = '#E8EAED';
            else if (source === 'park' || source === 'landcover') paint['fill-color'] = '#CFE8CC';
            else if (source === 'landuse') paint['fill-color'] = ['match', ['get', 'class'],
                ['park', 'cemetery', 'grass', 'recreation_ground', 'garden'], '#CFE8CC',
                ['hospital', 'school', 'university'], '#F1F3F4', '#F8F9FA'];
        }
        if (layer.type === 'line') {
            if (source === 'waterway') paint['line-color'] = '#A3C7F3';
            else if (source === 'transportation' && !/rail|ferry|aerialway/.test(id)) {
                paint['line-color'] = /case|casing/.test(id) ? '#DADCE0'
                    : ['match', ['get', 'class'], ['motorway', 'trunk'], '#C6D0DE', '#FFFFFF'];
            }
        }
        if (layer.type === 'symbol' && layer.layout?.['text-field']) {
            paint['text-color'] = source === 'water_name' ? '#5079A3' : '#5F6368';
            paint['text-halo-color'] = '#FFFFFF';
            paint['text-halo-width'] = 1.5;
        }
        if (source === 'poi' || source === 'housenumber' || layer.type === 'fill-extrusion') layout.visibility = 'none';
        return { id: layer.id, paint, layout };
    });
}

const PIN = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true" class="heroicon" data-heroicon="map-pin" width="24" height="24"> <path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/> <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z"/> </svg>';

export class HomeVisitMap {
    constructor(canvas, status, { getPosition, loadLibrary = loadMapLibrary }) {
        this.canvas = canvas;
        this.status = status;
        this.getPosition = getPosition;
        this.loadLibrary = loadLibrary;
        this.version = 0;
        this.ready = Promise.resolve();
    }
    clear(message = '') {
        this.version++;
        this.finishLoading?.();
        clearTimeout(this.loadingTimer);
        this.map?.remove();
        this.map = null;
        this.canvas.replaceChildren();
        this.status.textContent = message;
    }
    async update(cliente, clientesSecundarios = []) {
        this.clear('Carregando mapa…');
        const version = this.version;
        this.ready = new Promise(resolve => { this.finishLoading = resolve; });
        this.loadingTimer = setTimeout(() => {
            if (version !== this.version) return;
            this.status.textContent = 'O mapa está demorando para carregar. Confira sua conexão.';
            this.finishLoading();
        }, 25000);
        const finish = () => { clearTimeout(this.loadingTimer); this.finishLoading(); };
        const destino = cliente && coordenadasValidas(cliente.lat, cliente.lng)
            ? [Number(cliente.lng), Number(cliente.lat)] : null;
        let position = null;
        try {
            const gl = await this.loadLibrary();
            if (version !== this.version) return;
            if (!destino) {
                this.status.textContent = 'Localizando você…';
                position = await this.getPosition();
                if (version !== this.version) return;
                if (!coordenadasValidas(position?.coords?.latitude, position?.coords?.longitude)) throw new Error('Localização indisponível.');
            }
            const center = destino || [Number(position.coords.longitude), Number(position.coords.latitude)];
            const map = new gl.Map({ container: this.canvas, style: 'https://tiles.openfreemap.org/styles/liberty',
                center, zoom: 15, dragPan: true, scrollZoom: false, cooperativeGestures: false,
                dragRotate: false, pitchWithRotate: false, touchZoomRotate: true, attributionControl: false });
            this.map = map;
            map.touchZoomRotate.disableRotation();
            map.addControl(new gl.AttributionControl({ compact: false }), 'bottom-right');
            let loaded = false, failed = false, locating = true, gpsMessage = '';
            const updateStatus = () => {
                if (version !== this.version) return;
                if (failed || (loaded && !locating)) finish();
                this.status.textContent = failed ? 'Não foi possível carregar a base do mapa. Confira sua conexão.'
                    : gpsMessage || (!loaded ? 'Carregando mapa…' : locating ? 'Localizando você…' : '');
            };
            map.on('style.load', () => {
                if (version !== this.version) return;
                for (const layer of mapTheme(map.getStyle())) {
                    for (const [key, value] of Object.entries(layer.paint)) map.setPaintProperty(layer.id, key, value);
                    for (const [key, value] of Object.entries(layer.layout)) map.setLayoutProperty(layer.id, key, value);
                }
            });
            map.on('load', () => { loaded = true; failed = false; updateStatus(); });
            map.on('error', () => { failed = true; updateStatus(); });
            const marker = (person, position, label, secondary = false, store = null) => {
                const element = this.canvas.ownerDocument.createElement('div');
                element.className = person ? 'home-map-person' : secondary ? 'home-map-destination home-map-secondary' : 'home-map-destination';
                element.setAttribute('role', 'img');
                element.setAttribute('aria-label', label);
                element.title = label;
                element.innerHTML = person ? "<svg xmlns=\"http://www.w3.org/2000/svg\" fill=\"none\" viewBox=\"0 0 24 24\" stroke-width=\"1.5\" stroke=\"currentColor\" aria-hidden=\"true\" class=\"heroicon\" data-heroicon=\"user\" width=\"24\" height=\"24\"> <path stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z\"/> </svg>" : PIN;
                const popup = new gl.Popup({ offset: 20, ...(person ? {} : { className: 'home-store-popup', maxWidth: '280px' }) });
                if (person) popup.setText(label);
                else {
                    const address = store?.enderecoCompleto?.trim() || `${position[1]},${position[0]}`;
                    const link = this.canvas.ownerDocument.createElement('a');
                    link.className = 'home-store-address';
                    link.textContent = address;
                    link.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
                    link.target = '_blank';
                    link.rel = 'noopener noreferrer';
                    link.setAttribute('aria-label', address + ' — abrir no Google Maps');
                    popup.setDOMContent(link);
                }
                return new gl.Marker({ element, anchor: person ? 'center' : 'bottom' })
                    .setLngLat(position).setPopup(popup).addTo(map);
            };
            for (const secundario of clientesSecundarios.slice(0, 4)) {
                if (!coordenadasValidas(secundario?.lat, secundario?.lng)) continue;
                marker(false, [Number(secundario.lng), Number(secundario.lat)], 'Visita seguinte: ' + (secundario.nome || 'Loja'), true, secundario);
            }
            if (destino) marker(false, destino, cliente.nome || 'Próxima visita', false, cliente);
            try {
                position = position || await this.getPosition();
                if (version !== this.version) return;
                const lat = position?.coords?.latitude, lng = position?.coords?.longitude;
                if (!coordenadasValidas(lat, lng)) throw new Error('Localização indisponível.');
                const pessoa = [Number(lng), Number(lat)];
                marker(true, pessoa, 'Você está aqui');
                map.resize();
                if (destino) map.fitBounds(new gl.LngLatBounds(destino, destino).extend(pessoa), { padding: 36, maxZoom: 16, duration: 0 });
                locating = false;
                updateStatus();
            } catch (error) {
                if (version !== this.version) return;
                locating = false;
                gpsMessage = error.message || 'Não foi possível obter sua localização.';
                updateStatus();
            }
        } catch (error) {
            if (version === this.version) {
                this.status.textContent = !destino && position === null
                    ? error.message || 'Não foi possível obter sua localização.' : 'Não foi possível carregar o mapa. Confira sua conexão.';
                finish();
            }
        }
    }
}
