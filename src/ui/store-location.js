import { loadMapLibrary, mapTheme } from './home-map.js';
import { obterAreaPorEndereco, coordenadasValidas } from '../services/location.js';

export class StoreLocationPicker {
    constructor({loadLibrary = loadMapLibrary, wait = ms => new Promise(resolve => setTimeout(resolve,ms)), findArea = obterAreaPorEndereco} = {}) { this.loadLibrary = loadLibrary; this.wait = wait; this.findArea = findArea; }
    clear() {
        this.version = (this.version || 0) + 1;
        this.map?.remove(); this.map = null;
        this.dialog?.close(); this.dialog?.remove(); this.dialog = null;
        this.resolve?.(null); this.resolve = null;
    }
    open(address, initialArea) {
        this.clear();
        const version = this.version;
        const result = new Promise(resolve => { this.resolve = resolve; });
        const dialog = document.createElement('dialog'); this.dialog = dialog;
        dialog.className = 'store-location-dialog'; dialog.setAttribute('aria-labelledby', 'store-location-title');
        dialog.innerHTML = `<button type="button" class="store-location-close" aria-label="Fechar"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button><h2 id="store-location-title">Marque a entrada da loja</h2><p data-address></p><p>Toque no mapa ou arraste o alfinete até a entrada da loja.</p><div class="store-location-map" data-map></div><p data-status role="status">Carregando mapa…</p><button type="button" class="btn-checkin" data-confirm disabled>Confirmar localização e salvar</button>`;
        dialog.querySelector('[data-address]').textContent = [address.logradouro, address.numero, address.bairro, address.cidade, address.uf].filter(Boolean).join(', ');
        dialog.querySelector('.store-location-close').onclick = () => this.clear();
        dialog.addEventListener('cancel', event => { event.preventDefault(); this.clear(); });
        document.body.append(dialog); dialog.showModal();
        void this.initialize(address, version, initialArea);
        return result;
    }
    async initialize(address, version, initialArea) {
        const dialog = this.dialog, status = dialog.querySelector('[data-status]');
        try {
            const gl = await this.loadLibrary();
            if (version !== this.version) return;
            // Este centro é só para navegar no mapa. Nunca é salvo como posição da loja.
            const map = new gl.Map({container:dialog.querySelector('[data-map]'),style:'https://tiles.openfreemap.org/styles/liberty',center:[-51,-15],zoom:3,dragPan:true,cooperativeGestures:false,scrollZoom:true});
            this.map = map; map.addControl(new gl.NavigationControl({showCompass:false}), 'bottom-right');
            let selected = null, touched = false, ready = false;
            const marker = new gl.Marker({color:'#EA4335',draggable:true});
            const select = lngLat => {
                if (!ready || !coordenadasValidas(lngLat.lat,lngLat.lng)) return;
                touched = true; selected = {lat:lngLat.lat,lng:lngLat.lng,source:'manual',precision:'entrada',uncertaintyMeters:0};
                marker.setLngLat(lngLat).addTo(map);
                status.textContent = 'Entrada marcada. Confira o alfinete antes de confirmar.';
                dialog.querySelector('[data-confirm]').disabled = false;
            };
            map.on('click', event => select(event.lngLat));
            marker.on('dragend', () => select(marker.getLngLat()));
            dialog.querySelector('[data-confirm]').onclick = () => {
                if (!selected || version !== this.version) return;
                const resolve = this.resolve; this.resolve = null; this.clear(); resolve?.(selected);
            };
            map.on('load', () => {
                if (version !== this.version) return;
                ready = true;
                for (const layer of mapTheme(map.getStyle())) {
                    for (const [key,value] of Object.entries(layer.paint)) map.setPaintProperty(layer.id,key,value);
                }
                if (!touched) status.textContent = 'Localize a loja e marque a entrada no mapa.';
                map.resize();
            });
            map.on('error', () => { if (version === this.version && !touched) status.textContent = 'O mapa está indisponível. Feche e tente salvar novamente.'; });
            // Respeita o intervalo após a última busca de endereço no Nominatim.
            await this.wait(1100);
            if (version !== this.version || touched) return;
            try {
                const area = initialArea === undefined ? await this.findArea(address) : initialArea;
                if (version !== this.version || touched) return;
                if (area && coordenadasValidas(area.lat,area.lon)) {
                    map.jumpTo({center:[Number(area.lon),Number(area.lat)],zoom:area.zoom||13});
                    marker.setLngLat([Number(area.lon),Number(area.lat)]).addTo(map);
                }
            } catch { /* O usuário ainda pode navegar e marcar no mapa. */ }
        } catch {
            if (version === this.version) status.textContent = 'Não foi possível carregar o mapa. Feche e tente novamente.';
        }
    }
}
