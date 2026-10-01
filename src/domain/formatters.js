export function escaparHtml(valor) {

    return String(valor ?? '').replace(/[&<>"']/g, c => ({

        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'

    }[c]));

}

export function obterData(valor) {

    const data = valor?.toDate ? valor.toDate() : (valor == null ? new Date(NaN) : new Date(valor));

    return Number.isFinite(data.getTime()) ? data : null;

}

export function tempoData(valor) { return obterData(valor)?.getTime() ?? 0; }

export function lerDataHora(data, hora) {

    if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !/^\d{2}:\d{2}$/.test(hora)) throw new Error('Informe uma data e um horário válidos.');

    const resultado = new Date(`${data}T${hora}:00`);

    if (!obterData(resultado) || formatarDataHoraPT(resultado).dataInput !== data || formatarDataHoraPT(resultado).hora !== hora) throw new Error('Data ou horário inválidos.');

    return resultado;

}

export function formatarDataHoraPT(data) {

    if (!obterData(data)) return { hora: "--:--", data: "--/--/----", dataInput: "", completo: "--:-- | --/--/----" };

    const d = obterData(data);

    const horas = String(d.getHours()).padStart(2, '0'); const minutos = String(d.getMinutes()).padStart(2, '0');

    const dia = String(d.getDate()).padStart(2, '0'); const mes = String(d.getMonth() + 1).padStart(2, '0'); const ano = d.getFullYear();

    return { hora: `${horas}:${minutos}`, data: `${dia}/${mes}/${ano}`, dataInput: `${ano}-${mes}-${dia}`, completo: `${horas}:${minutos} | ${dia}/${mes}/${ano}` };

}

export function formatarDataAgenda(data) {

    const d = obterData(data);

    if (!d) return { diaMes: "Data não informada", hora: "--:--" };

    const dia = String(d.getDate()).padStart(2, '0'); const meses = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

    return { diaMes: `${dia} - ${meses[d.getMonth()]}`, hora: `${String(d.getHours()).padStart(2, '0')}h${String(d.getMinutes()).padStart(2, '0')}` };

}

export function formatarDataCheckout(valor) {
    const data = obterData(valor);
    if (!data) return '--/--/----';
    return String(data.getDate()).padStart(2, '0') + '/' + String(data.getMonth() + 1).padStart(2, '0') + '/' + data.getFullYear();
}

export function formatarHoraCheckout(valor) {
    const data = obterData(valor);
    if (!data) return '--h--';
    return String(data.getHours()).padStart(2, '0') + 'h' + String(data.getMinutes()).padStart(2, '0');
}

export function formatarDuracaoVisita(inicio, fim) {
    const a = obterData(inicio), b = obterData(fim);
    if (!a || !b || b < a) return 'Tempo de visita: --.';
    const minutos = Math.round((b.getTime() - a.getTime()) / 60000);
    const horas = Math.floor(minutos / 60);
    const mins = minutos % 60;
    if (!horas) return 'Tempo de visita: ' + mins + ' minuto' + (mins === 1 ? '' : 's') + '.';
    if (!mins) return 'Tempo de visita: ' + horas + ' hora' + (horas === 1 ? '' : 's') + '.';
    return 'Tempo de visita: ' + horas + ' hora' + (horas === 1 ? '' : 's') + ' e ' + mins + ' minuto' + (mins === 1 ? '' : 's') + '.';
}

export function serializarEstavel(valor) {
    if (Array.isArray(valor)) return '[' + valor.map(serializarEstavel).join(',') + ']';
    if (valor && typeof valor === 'object') {
        return '{' + Object.keys(valor).sort().map(chave =>
            JSON.stringify(chave) + ':' + serializarEstavel(valor[chave])
        ).join(',') + '}';
    }
    return JSON.stringify(valor);
}
