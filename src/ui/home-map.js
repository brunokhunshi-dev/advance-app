import { coordenadasValidas } from '../services/location.js';
import { escaparHtml } from '../domain/formatters.js';

let leafletPending;
export function loadLeaflet() {
    if (window.L) return Promise.resolve(window.L);
    if (!leafletPending) {
        leafletPending = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
            script.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
            script.crossOrigin = '';
            const timer = setTimeout(() => fail(), 15000);
            const fail = () => { clearTimeout(timer); script.remove(); reject(new Error('Mapa indisponível. Confira sua conexão.')); };
            script.onerror = fail;
            script.onload = () => { clearTimeout(timer); window.L ? resolve(window.L) : fail(); };
            document.head.append(script);
        }).catch(error => { leafletPending = null; throw error; });
    }
    return leafletPending;
}

const PERSON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3"/><path d="M6 20v-3a6 6 0 0 1 12 0v3"/></svg>';
const PIN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 23S3 14 3 9a9 9 0 1 1 18 0c0 5-9 14-9 14Z"/><circle cx="12" cy="9" r="3"/></svg>';

export class HomeVisitMap {
    constructor(canvas, status, { getPosition, loadLibrary = loadLeaflet }) {
        this.canvas = canvas;
        this.status = status;
        this.getPosition = getPosition;
        this.loadLibrary = loadLibrary;
        this.version = 0;
    }
    clear(message = '') {
        this.version++;
        this.map?.remove();
        this.map = null;
        this.canvas.replaceChildren();
        this.status.textContent = message;
    }
    async update(cliente) {
        this.clear('Carregando mapa…');
        const version = this.version;
        if (!cliente) { this.status.textContent = 'Nenhuma próxima visita para mostrar no mapa.'; return; }
        if (!coordenadasValidas(cliente.lat, cliente.lng)) {
            this.status.textContent = 'Esta loja ainda não tem localização cadastrada.';
            return;
        }
        try {
            const L = await this.loadLibrary();
            if (version !== this.version) return;
            const destino = [Number(cliente.lat), Number(cliente.lng)];
            this.map = L.map(this.canvas, { zoomControl: false, scrollWheelZoom: false, dragging: false, touchZoom: true, attributionControl: true });
            L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>'
            }).addTo(this.map);
            const icon = (person) => L.divIcon({ className: person ? 'home-map-person' : 'home-map-destination',
                html: person ? PERSON : PIN, iconSize: [32, 36], iconAnchor: person ? [16, 18] : [16, 36] });
            L.marker(destino, { icon: icon(false), title: cliente.nome || 'Próxima visita', alt: 'Local da próxima visita' })
                .addTo(this.map).bindPopup(escaparHtml(cliente.nome || 'Próxima visita'));
            this.map.setView(destino, 15);
            this.status.textContent = 'Localizando você…';
            try {
                const position = await this.getPosition();
                if (version !== this.version) return;
                const lat = position?.coords?.latitude, lng = position?.coords?.longitude;
                if (!coordenadasValidas(lat, lng)) throw new Error('Localização indisponível.');
                const pessoa = [Number(lat), Number(lng)];
                L.marker(pessoa, { icon: icon(true), title: 'Você está aqui', alt: 'Sua localização' }).addTo(this.map).bindPopup('Você está aqui');
                this.map.invalidateSize();
                this.map.fitBounds([destino, pessoa], { padding: [32, 32], maxZoom: 16, animate: false });
                this.status.textContent = '';
            } catch (error) {
                if (version !== this.version) return;
                this.status.textContent = error.message || 'Não foi possível obter sua localização.';
            }
        } catch (error) {
            if (version === this.version) this.status.textContent = error.message || 'Não foi possível carregar o mapa.';
        }
    }
}
