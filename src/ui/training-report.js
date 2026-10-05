import { CommercialReport } from './commercial-report.js';
import { escaparHtml as escape } from '../domain/formatters.js';
import { nomeProduto, buscarProdutos } from '../domain/products.js';
import { reportMarkup, mediaStore } from '../../technical-report-editor.js';
import { PARTICIPANTES, OBJETIVOS, CONTEUDOS, SUBSTRATOS, RESULTADOS, SATISFACAO, TRAINING_MODULES, blankTraining, trainingModuleComplete, modulosTreinamentoPendentes, resumoTreinamento } from '../domain/training.js';

export function renderTrainingSummary(report) {
    const data = report?.dadosTreinamento;
    if (data?.versao !== 1) return '';
    const section = ([title, fields]) => `<section class="training-summary-section"><h3>${title}</h3>${fields.map(([label, value]) => `<p><strong>${label}:</strong> ${escape(value === '' || value == null ? 'Não informado' : value)}</p>`).join('')}</section>`;
    const [planning, training, feedback] = resumoTreinamento(data);
    const photos = data.practice === 'Sim' ? reportMarkup(data.photos || [], report.atividadeId) : '';
    const free = report.conteudoRelatorio?.blocos?.length ? reportMarkup(report.conteudoRelatorio.blocos, report.atividadeId) : `<p>${escape(report.textoAtual || 'Nenhum relato registrado.')}</p>`;
    return section(planning) + section(training) + (photos ? `<section class="training-summary-section"><h3>Fotos da aplicação</h3>${photos}</section>` : '') + `<section class="training-summary-section"><h3>Relatório livre</h3>${free}</section>` + section(feedback);
}

export class TrainingReport extends CommercialReport {
    constructor(...args) {
        super(...args);
        this.root.addEventListener('keydown', event => {
            if (event.target.hasAttribute('data-surface-search') && event.key === 'ArrowDown') { event.preventDefault(); this.root.querySelector('[data-surface-results] button')?.focus(); }
            if (event.target.dataset.selectSurface && ['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); (event.key === 'ArrowDown' ? event.target.nextElementSibling : event.target.previousElementSibling)?.focus(); }
            if (event.target.dataset.selectSurface && event.key === 'Escape') this.root.querySelector('[data-surface-search]')?.focus();
        });
    }
    get dataField() { return 'dadosTreinamento'; }
    blankData() { return blankTraining(); }
    get productSearchPage() { return ['planning', 'training'].includes(this.page); }
    complete(key, data = this.data) { return trainingModuleComplete(key, data); }
    pendingCheckoutModules(key = this.key) { return modulosTreinamentoPendentes(this.savedReport(key)); }
    checks(key, options) { return `<div class="cr-options">${options.map(option => `<label><input type="checkbox" data-array="${key}" value="${escape(option)}" ${this.data[key].includes(option) ? 'checked' : ''}>${escape(option)}</label>`).join('')}</div>`; }
    number(label, key) { return `<label class="cr-field">${label}<input type="number" data-field="${key}" min="0" max="10000" step="1" inputmode="numeric" value="${escape(this.data[key])}" placeholder="0"></label>`; }
    opinion(label, key) { return `<label class="cr-field">${label} <small class="cr-progress">(Opcional)</small><textarea data-field="${key}" rows="3" maxlength="3000" placeholder="Escreva sua opinião">${escape(this.data[key])}</textarea></label>`; }
    productSearch(key, title) { return `<fieldset><legend>${title}${key === 'planned' ? '<small class="cr-progress">Opcional · você pode continuar sem selecionar produtos.</small>' : ''}</legend><div class="cr-products">${this.data.products[key].map((product, index) => `<button type="button" data-remove-product="${key}:${index}" aria-label="Remover ${escape(nomeProduto(product))}">${escape(nomeProduto(product))} <span>×</span></button>`).join('')}<div class="cr-product-search"><input type="search" data-product-search="${key}" value="${escape(this.productQueries[key] || '')}" aria-label="${title}" placeholder="Buscar produto por nome" role="combobox" aria-autocomplete="list" aria-controls="cr-results-${key}" aria-expanded="false" autocomplete="off"><div id="cr-results-${key}" class="cr-product-results" role="listbox"></div></div></div></fieldset>`; }
    surfaceSearch() { return `<fieldset><legend>Substrato/superfície</legend><div class="cr-products">${this.data.surfaces.map((surface, index) => `<button type="button" data-remove-surface="${index}" aria-label="Remover ${escape(surface)}">${escape(surface)} <span>×</span></button>`).join('')}<div class="cr-product-search"><input type="search" data-surface-search role="combobox" aria-autocomplete="list" aria-controls="tr-surface-results" aria-expanded="false" aria-label="Buscar substrato ou superfície" placeholder="Buscar substrato ou superfície" value="${escape(this.surfaceQuery || '')}" autocomplete="off"><div id="tr-surface-results" class="cr-product-results" data-surface-results role="listbox" aria-label="Superfícies encontradas"></div></div></div></fieldset>`; }
    updateSurfaceResults() {
        const host = this.root.querySelector('[data-surface-results]');
        if (!host) return;
        const query = this.surfaceQuery || '';
        const results = buscarProdutos(SUBSTRATOS.map(value => ({ id: value, title: value })), query, this.data.surfaces);
        host.innerHTML = results.length ? results.map(product => `<button type="button" role="option" aria-selected="false" data-select-surface="${escape(product.title)}">${escape(product.title)}</button>`).join('') : query.trim() ? '<p>Nenhuma superfície encontrada.</p>' : '';
        this.root.querySelector('[data-surface-search]')?.setAttribute('aria-expanded', String(results.length > 0));
    }
    rows(readOnly = false) { return `<div class="cr-modules">${TRAINING_MODULES.filter(([key]) => !readOnly || ['planning', 'training'].includes(key)).map(([key, title, description]) => `<button type="button" class="cr-module" data-page="${key}"><span><strong>${title}<small class="${key === 'free' ? 'cr-progress' : 'cr-required'}">(${key === 'free' ? 'Opcional' : 'Obrigatório'})</small></strong><span>${description}</span>${readOnly ? '' : `<small class="cr-progress">${this.complete(key) ? 'Preenchido' : 'Não preenchido'}</small>`}</span><span class="cr-chevron" aria-hidden="true">›</span></button>`).join('')}</div>`; }
    render() {
        const page = this.page;
        const module = TRAINING_MODULES.find(([key]) => key === page);
        let body = '';
        for (const photo of this.data.photos) { const local = this.staged.get(photo.id); if (local && !mediaStore.local(photo.id)) mediaStore.stage(photo.id, local.file, local.thumbnail); }
        if (page === 'overview') body = `<h1>Treinamento — ${escape(this.context.client)}</h1><p class="cr-code">${escape(this.context.code || '')}</p><label class="cr-field">Chegada<div class="cr-pills"><span>${escape(this.context.date)}</span><span>${escape(this.context.time)}</span></div></label><label class="cr-field">Cliente<div class="cr-pill">${escape(this.context.client)}</div></label>${this.rows()}<div class="cr-footer"><button type="button" class="btn-checkin cr-primary" data-action="save">Salvar relatório</button></div>`;
        if (page === 'planning') body = this.field('Nome do responsável', 'name', 'Quem é o responsável pelo treinamento?') + `<fieldset><legend>Participantes</legend>${this.checks('participants', PARTICIPANTES)}</fieldset><div class="training-counts">${this.number('Quantidade prevista', 'expected')}${this.number('Quantidade presente', 'present')}</div><fieldset><legend>Objetivo principal</legend>${this.radios('goal', OBJETIVOS)}</fieldset>` + this.productSearch('planned', 'Produtos incluídos no treinamento');
        if (page === 'training') body = `<fieldset><legend>Conteúdos e atividades realizadas</legend>${this.checks('contents', CONTEUDOS)}</fieldset><fieldset><legend>Houve aplicação prática?</legend>${this.radios('practice', ['Sim', 'Não'])}</fieldset>` + (this.data.practice === 'Sim' ? this.productSearch('applied', 'Produtos aplicados') + this.surfaceSearch() + `<fieldset><legend>Resultado</legend>${this.radios('result', RESULTADOS)}</fieldset><label class="cr-photo"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M8 5l2-2h4l2 2h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/><circle cx="12" cy="12" r="4"/></svg>Adicionar foto da aplicação<input type="file" accept="image/*" data-upload="photos" multiple hidden></label><small class="cr-progress">Fotografias opcionais · ${this.data.photos.length}/6</small>${this.previews('photos')}` : '');
        if (page === 'free') body = '<section class="relatorio-editor-section cr-shared-editor" aria-label="Conteúdo do relatório"><textarea data-field="text" hidden></textarea><div class="technical-report-editor" role="group" aria-label="Escrever relatório"></div><p class="cr-editor-status" role="status" aria-live="polite"></p></section>';
        if (page === 'feedback') body = `<h2>Promotor</h2><fieldset><legend>O objetivo foi atingido?</legend>${this.radios('achieved', ['Sim', 'Parcialmente', 'Não'])}</fieldset><fieldset><legend>Como foi a participação do grupo?</legend>${this.radios('engagement', ['Alta', 'Moderada', 'Baixa'])}</fieldset>${this.opinion('Opinião', 'promoterOpinion')}<h2>Responsável</h2><fieldset><legend>Satisfação do responsável</legend>${this.radios('satisfaction', SATISFACAO)}</fieldset>${this.opinion('Opinião', 'responsibleOpinion')}`;
        this.root.innerHTML = `<header class="relatorio-header-top cr-header"><button type="button" class="screen-close" data-action="back" aria-label="Fechar"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></header>${module ? `<h1 tabindex="-1">${module[1]}</h1><p class="cr-subtitle">${module[2]}</p>` : ''}<div class="cr-body">${body}</div>${module ? `<div class="${page === 'free' ? 'relatorio-acoes cr-editor-actions' : 'cr-footer'}">${page === 'free' ? '<input class="cr-media-picker" type="file" accept="image/*" multiple hidden><input class="cr-camera-picker" type="file" accept="image/*" capture="environment" hidden><button type="button" class="report-add-media" aria-label="Adicionar imagem"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button>' : ''}<button type="button" class="btn-checkin cr-primary" data-action="module-done">${this.reviewCheckout ? 'Fechar' : page === 'free' ? 'Salvar relato' : 'Salvar módulo'}</button></div>` : ''}<p class="cr-status" role="status" aria-live="polite"></p>`;
        if (this.productSearchPage) { this.updateProductResults(); void this.loadProducts(); }
        this.updateSurfaceResults();
        if (page === 'free') this.mountEditor();
        if (this.reviewCheckout) {
            this.root.querySelectorAll('input,select,textarea,button:not([data-action])').forEach(control => control.disabled = true);
            if (page === 'free') this.editor.setLocked(true);
        }
        window.scrollTo(0, 0);
    }
    renderCheckout(host) {
        const report = this.savedReport(this.key);
        const data = report.dadosTreinamento;
        const photos = [...(data.practice === 'Sim' ? data.photos : []), ...(report.conteudoRelatorio?.blocos || []).filter(block => block.kind === 'media')];
        host.innerHTML = `<section class="checkout-tipo-section"><h2>Treinamento</h2>${this.rows(true)}</section><section class="checkout-relatorio-section"><label>Relatório livre</label><div class="checkout-relatorio-box cr-summary"><div class="cr-summary-text">${escape(data.text) || 'Nenhum relato registrado.'}</div><button type="button" class="cr-text-link" data-review-module="free" hidden>Ver mais</button></div></section>${photos.length ? `<section class="checkout-relatorio-section"><label>Fotos</label><div class="cr-photo-previews">${reportMarkup(photos, this.key)}</div></section>` : ''}`;
        const summary = host.querySelector('.cr-summary-text');
        const more = host.querySelector('[data-review-module="free"]');
        const updateOverflow = () => { more.hidden = !summary.clientHeight || summary.scrollHeight <= summary.clientHeight + 1; };
        this.checkoutResizeObserver?.disconnect();
        if (typeof ResizeObserver !== 'undefined') { this.checkoutResizeObserver = new ResizeObserver(updateOverflow); this.checkoutResizeObserver.observe(summary); }
        updateOverflow();
        window.requestAnimationFrame?.(updateOverflow);
        document.fonts?.ready.then(updateOverflow);
        host.onclick = event => { const button = event.target.closest('[data-page],[data-review-module]'); if (button) this.reviewCallbacks.reviewModule?.(button.dataset.page || button.dataset.reviewModule); };
        host.onchange = null;
    }
    input(event) { if (event.target.hasAttribute('data-surface-search')) { this.surfaceQuery = event.target.value; this.updateSurfaceResults(); } else super.input(event); }
    async change(event) {
        if (event.target.dataset.field === 'practice' && event.target.value === 'Não') {
            for (const photo of this.data.photos) this.releasePhoto(photo);
            this.data.photos = []; this.data.products.applied = []; this.data.surfaces = []; this.data.result = '';
        }
        await super.change(event);
    }
    click(event) {
        const button = event.target.closest('button');
        if (button && !this.saving && !this.photoBusy) {
            if (button.dataset.selectSurface && SUBSTRATOS.includes(button.dataset.selectSurface)) { if (!this.data.surfaces.includes(button.dataset.selectSurface)) this.data.surfaces.push(button.dataset.selectSurface); this.surfaceQuery = ''; this.render(); return; }
            if (button.dataset.removeSurface !== undefined) { this.data.surfaces.splice(Number(button.dataset.removeSurface), 1); this.render(); return; }
        }
        return super.click(event);
    }
    clear() { this.surfaceQuery = ''; super.clear(); }
}
