import { escaparHtml as esc } from '../domain/formatters.js';
import { PROFILE_TYPES, profileStats, profileDuration, rankClients } from '../domain/profile.js';
import { coordenadasValidas } from '../services/location.js';
import { loadMapLibrary, mapTheme } from './home-map.js';
import { loadingMarkup } from './loading.js';
const icon = name => `<img src="midia/perfil/${name}.svg" alt="" aria-hidden="true">`;
export class ProfileView {
    constructor(root, { load, onError, openClient }) {
        this.root = root; this.load = load; this.onError = onError; this.openClient = openClient;
        this.days = 30; this.type = 'Todas'; this.mode = 'Pontos'; this.version = 0;
    }
    clear() { this.version++; this.map?.remove(); this.map = null; this.data = null; this.root.replaceChildren(); this.root.removeAttribute('aria-busy'); }
    async open(profile) {
        const version = ++this.version;
        this.map?.remove(); this.map = null;
        this.root.innerHTML = loadingMarkup(4); this.root.setAttribute('aria-busy', 'true');
        try {
            const data = await this.load();
            if (version !== this.version) return;
            this.data = data; this.profile = profile; this.root.removeAttribute('aria-busy'); this.render();
        } catch (error) {
            if (version !== this.version) return;
            this.root.innerHTML = '<p class="profile-empty">Não foi possível carregar o perfil.</p><button type="button" class="btn-outline-red" data-retry>Tentar novamente</button>';
            this.root.querySelector('[data-retry]').onclick = () => this.open(profile);
            this.onError(error);
        } finally { if (version === this.version) this.root.removeAttribute('aria-busy'); }
    }
    render() {
        this.map?.remove(); this.map = null;
        const version = ++this.version;
        const stats = profileStats(this.data, this.days), p = this.profile;
        const initials = String(p.nome || '').trim().split(/\s+/).slice(0,2).map(w => w[0]).join('');
        const photo = p.fotoUrl || p.foto || p.photoURL;
        const safePhoto = typeof photo === 'string' && /^https:\/\//.test(photo) ? photo : null;
        this.root.innerHTML = `<header class="profile-header"><div class="profile-photo">${safePhoto ? `<img src="${esc(safePhoto)}" alt="Foto de ${esc(p.nome)}">` : `<span class="profile-initials" aria-label="Sem foto de perfil">${esc(initials)}</span>`}</div>
            <div class="profile-identity"><button type="button" class="profile-export" aria-label="Exportar perfil para PDF" title="Exportar PDF">${icon('exportar')}</button>
            <p class="profile-role">${esc(p.cargo || (p.tipo === 'Assistente' ? 'Assistente Técnico' : 'Promotor Técnico de Vendas'))}</p><h1>${esc(p.nome)}</h1>
            <p class="profile-contact">${icon('telefone')}<span>${esc(p.telefone || p.celular || 'Telefone não informado')}</span></p>
            <p class="profile-contact">${icon('email')}<span>${esc(p.email || 'E-mail não informado')}</span></p>
            <fieldset class="profile-period"><legend>Escolha o intervalo de tempo dos dados</legend><div>${[30,90,365].map(days => `<button type="button" data-period="${days}" aria-pressed="${days === this.days}">${days === 365 ? '1 ano' : days + ' dias'}</button>`).join('')}</div></fieldset>
            </div></header>
            <div class="profile-panels"><div class="profile-grid">
                <section class="profile-card"><h2>Atividades</h2><strong class="profile-value">${stats.total}</strong><div class="profile-breakdown">${PROFILE_TYPES.map((t,i) => `<p><b>${stats.counts[i]}</b> - ${esc(t)}</p>`).join('')}</div></section>
                <section class="profile-card"><h2>Tempo em campo</h2><strong class="profile-value">${profileDuration(stats.durations.reduce((a,b)=>a+b,0))}</strong><div class="profile-breakdown">${PROFILE_TYPES.map((t,i) => `<p><b>${profileDuration(stats.durations[i])}</b> - ${esc(t)}</p>`).join('')}</div></section>
            </div><section class="profile-card profile-chart"><div class="profile-card-heading"><h2>Gráfico de visitas</h2><label class="profile-type"><span class="sr-only">Tipo de atividade</span><select aria-label="Tipo de atividade">${['Todas',...PROFILE_TYPES].map(t=>`<option${t === this.type ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>${icon('seta')}</label></div><div data-chart></div></section>
            <section class="profile-card"><div class="profile-card-heading"><h2>Mapa</h2><div class="profile-map-tabs" role="group" aria-label="Visualização do mapa">${['Pontos','Calor'].map(mode=>`<button type="button" data-mode="${mode}" aria-pressed="${mode === this.mode}">${mode}</button>`).join('')}</div></div><div class="profile-map"><div data-map></div><p data-map-status role="status"></p></div></section>
            <div class="profile-grid profile-rankings">${[true,false].map(desc => `<section class="profile-card"><h2>Clientes ${desc ? 'mais' : 'menos'} visitados</h2><ol class="${desc ? 'profile-most' : 'profile-least'}">${rankClients(stats.clients,desc).map((client,i)=>`<li><button type="button" data-client="${esc(client.id)}" title="${esc(client.name)} — ${client.count} visita(s)"><b>${i+1}º</b><span>${esc(client.name)}</span></button></li>`).join('')}</ol>${stats.clients.length ? '' : '<p class="profile-empty">Nenhuma visita no período.</p>'}</section>`).join('')}</div>
            <p class="profile-note">${stats.start.toLocaleDateString('pt-BR')} a ${stats.end.toLocaleDateString('pt-BR')} · Atividades concluídas. Tempo entre check-in e checkout. Clientes com visitas registradas no período.</p></div>`;
        if (safePhoto) this.root.querySelector('.profile-photo img').onerror = () => { this.root.querySelector('.profile-photo').innerHTML = `<span class="profile-initials">${esc(initials)}</span>`; };
        this.root.querySelector('.profile-export').onclick = () => {
            document.body.classList.add('printing-profile');
            window.addEventListener('afterprint', () => document.body.classList.remove('printing-profile'), { once: true });
            window.print();
        };
        this.root.querySelectorAll('[data-period]').forEach(b => b.onclick = () => { this.days = Number(b.dataset.period); this.render(); });
        this.root.querySelector('select').onchange = e => { this.type = e.target.value; this.renderChart(stats); };
        this.root.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => {
            this.mode = b.dataset.mode;
            this.root.querySelectorAll('[data-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.mode === this.mode)));
            this.applyMapMode();
        });
        this.root.querySelectorAll('[data-client]').forEach(b => b.onclick = () => this.openClient(b.dataset.client));
        this.renderChart(stats); void this.renderMap(stats, version);
    }
    renderChart(stats) {
        const index = PROFILE_TYPES.indexOf(this.type), buckets = stats.buckets;
        const values = buckets.map(b => index < 0 ? b.counts.reduce((a,b)=>a+b,0) : b.counts[index]);
        const max = Math.max(1,...values), step = Math.max(1,Math.ceil(buckets.length / 6));
        this.root.querySelector('[data-chart]').innerHTML = `<div class="profile-bars" role="img" aria-label="Visitas por ${this.days === 365 ? 'mês' : this.days === 90 ? 'semana' : 'dia'}: ${esc(buckets.map((b,i)=>b.date.toLocaleDateString('pt-BR')+': '+values[i]).join('; '))}"><div class="profile-y"><span>${max}</span><span>0</span></div><div class="profile-bar-grid">${buckets.map((b,i)=>`<div class="profile-bar-col" title="${b.date.toLocaleDateString('pt-BR')}: ${values[i]} visita(s)"><div class="profile-bar-track">${values[i] ? `<span class="profile-bar" style="height:${values[i]/max*100}%"><span>${values[i]}</span></span>` : ''}</div><small>${i % step === 0 ? esc(b.date.toLocaleDateString('pt-BR',this.days === 365 ? {month:'short'} : {day:'2-digit',month:'short'})) : ''}</small></div>`).join('')}</div></div>`;
    }
    applyMapMode() {
        if (!this.map?.getLayer('profile-points')) return;
        this.map.setLayoutProperty('profile-points','visibility',this.mode === 'Pontos' ? 'visible' : 'none');
        this.map.setLayoutProperty('profile-heat','visibility',this.mode === 'Calor' ? 'visible' : 'none');
    }
    async renderMap(stats, version) {
        const status = this.root.querySelector('[data-map-status]'), container = this.root.querySelector('[data-map]');
        const clients = stats.clients.filter(c=>coordenadasValidas(c.lat,c.lng));
        if (!clients.length) { status.textContent = 'Nenhuma visita com localização registrada no período.'; return; }
        status.textContent = 'Carregando mapa…';
        try {
            const gl = await loadMapLibrary();
            if (version !== this.version) return;
            const map = new gl.Map({container,style:'https://tiles.openfreemap.org/styles/liberty',center:[Number(clients[0].lng),Number(clients[0].lat)],zoom:13,dragPan:true,scrollZoom:false,cooperativeGestures:false,attributionControl:false});
            this.map = map; map.addControl(new gl.AttributionControl({compact:false}),'bottom-right');
            const bounds = new gl.LngLatBounds(); clients.forEach(c=>bounds.extend([Number(c.lng),Number(c.lat)]));
            map.fitBounds(bounds,{padding:35,maxZoom:15,duration:0});
            map.on('style.load',()=> {
                if (version !== this.version) return;
                for (const layer of mapTheme(map.getStyle())) {
                    for (const [key,value] of Object.entries(layer.paint)) map.setPaintProperty(layer.id,key,value);
                    for (const [key,value] of Object.entries(layer.layout)) map.setLayoutProperty(layer.id,key,value);
                }
                map.addSource('profile-visits',{type:'geojson',data:{type:'FeatureCollection',features:clients.map(c=>({type:'Feature',geometry:{type:'Point',coordinates:[Number(c.lng),Number(c.lat)]},properties:{name:c.name,count:c.count,address:c.address}}))}});
                map.addLayer({id:'profile-heat',type:'heatmap',source:'profile-visits',paint:{'heatmap-weight':['get','count'],'heatmap-radius':35,'heatmap-opacity':.7,'heatmap-color':['interpolate',['linear'],['heatmap-density'],0,'rgba(245,30,48,0)',.3,'#ffcc80',.6,'#ff8d28',1,'#f51e30']}});
                map.addLayer({id:'profile-points',type:'circle',source:'profile-visits',paint:{'circle-color':'#f51e30','circle-radius':5,'circle-stroke-color':'#fff','circle-stroke-width':2}});
                this.applyMapMode();
                map.on('click','profile-points',e=> {
                    const feature=e.features?.[0]; if (!feature) return;
                    new gl.Popup().setLngLat(feature.geometry.coordinates).setText(`${feature.properties.name} · ${feature.properties.count} visita(s)`).addTo(map);
                });
            });
            map.on('load',()=> { if (version === this.version) status.textContent=''; });
            map.on('error',()=> { if (version === this.version) status.textContent='Não foi possível carregar a base do mapa.'; });
        } catch { if (version === this.version) status.textContent='Não foi possível carregar o mapa. Confira sua conexão.'; }
    }
}
