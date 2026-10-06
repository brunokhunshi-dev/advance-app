// The real content replaces this entire status once the request completes.
export function loadingMarkup(count = 3, compact = false) {
    const card = `<div class="loading-card${compact ? ' loading-card-compact' : ''}"><span class="loading-block loading-kicker"></span><span class="loading-block loading-title"></span><span class="loading-block loading-detail"></span>${compact ? '' : '<span class="loading-block loading-detail loading-short"></span>'}</div>`;
    return `<div class="loading-placeholder" role="status" aria-label="Carregando conteúdo"><div aria-hidden="true">${card.repeat(count)}</div></div>`;
}

export function homeLoadingMarkup() {
    return `<div role="status" aria-label="Carregando início"><div aria-hidden="true">
        <span class="loading-block loading-title home-loading-heading"></span>
        ${loadingMarkup(1)}
        <span class="loading-block loading-title home-loading-heading"></span>
        <span class="loading-block loading-detail home-loading-address"></span>
        <div class="loading-block home-loading-map"></div>
        <span class="loading-block loading-title home-loading-heading"></span>
        <div class="home-loading-calendar"><span class="loading-block loading-title"></span><div>${'<span class="loading-block"></span>'.repeat(35)}</div></div>
        ${loadingMarkup(3)}
    </div></div>`;
}
