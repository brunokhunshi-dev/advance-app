// The real content replaces this entire status once the request completes.
export function loadingMarkup(count = 3, compact = false) {
    const card = `<div class="loading-card${compact ? ' loading-card-compact' : ''}"><span class="loading-block loading-kicker"></span><span class="loading-block loading-title"></span><span class="loading-block loading-detail"></span>${compact ? '' : '<span class="loading-block loading-detail loading-short"></span>'}</div>`;
    return `<div class="loading-placeholder" role="status" aria-label="Carregando conteúdo"><div aria-hidden="true">${card.repeat(count)}</div></div>`;
}
