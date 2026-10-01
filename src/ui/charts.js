export function updateChart(charts, name, canvas, config, Chart) {
    const existing = charts[name];
    if (existing && existing.config.type === config.type) {
        existing.data = config.data;
        existing.options = config.options;
        existing.update('none');
        return existing;
    }
    existing?.destroy();
    const chart = new Chart(canvas, config);
    charts[name] = chart;
    return chart;
}
