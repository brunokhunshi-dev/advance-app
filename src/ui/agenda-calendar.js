import { obterData, escaparHtml } from '../domain/formatters.js';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const SEMANA = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
const chaveDia = date => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

// Usa as mesmas datas locais da lista da agenda, inclusive timestamps do Firebase.
export function diasCalendario(ano, mes, atividades = [], hoje = new Date()) {
    const primeiro = new Date(ano, mes, 1, 12);
    const quantidade = new Date(ano, mes + 1, 0).getDate();
    const total = Math.ceil((primeiro.getDay() + quantidade) / 7) * 7;
    const visitas = new Map();
    for (const atividade of atividades) {
        const data = obterData(atividade.data);
        if (!data) continue;
        const chave = chaveDia(data);
        visitas.set(chave, (visitas.get(chave) || 0) + 1);
    }
    return Array.from({ length: total }, (_, index) => {
        const data = new Date(ano, mes, index - primeiro.getDay() + 1, 12);
        return { data, dia: data.getDate(), fora: data.getMonth() !== primeiro.getMonth(),
            fimSemana: data.getDay() === 0 || data.getDay() === 6,
            hoje: chaveDia(data) === chaveDia(hoje), visitas: visitas.get(chaveDia(data)) || 0 };
    });
}

export class AgendaCalendar {
    constructor(root) {
        this.root = root;
        this.reset();
        root.addEventListener('pointerdown', event => {
            if (event.isPrimary === false || event.button !== 0) return;
            this.gesto = { id: event.pointerId, x: event.clientX, y: event.clientY };
            root.setPointerCapture?.(event.pointerId);
        });
        root.addEventListener('pointermove', event => {
            const gesto = this.gesto;
            if (!gesto || gesto.id !== event.pointerId) return;
            const dx = Math.abs(event.clientX - gesto.x), dy = Math.abs(event.clientY - gesto.y);
            // Deixa a rolagem vertical da agenda seguir normalmente.
            if (dy > 12 && dy > dx) this.gesto = null;
        });
        root.addEventListener('pointerup', event => {
            const gesto = this.gesto;
            this.gesto = null;
            if (!gesto || gesto.id !== event.pointerId) return;
            const dx = event.clientX - gesto.x, dy = event.clientY - gesto.y;
            if (Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy) * 1.3) this.changeMonth(dx < 0 ? 1 : -1);
        });
        root.addEventListener('pointercancel', () => { this.gesto = null; });
        root.addEventListener('keydown', event => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            event.preventDefault();
            this.changeMonth(event.key === 'ArrowRight' ? 1 : -1);
        });
    }
    changeMonth(direction) {
        this.mes = new Date(this.mes.getFullYear(), this.mes.getMonth() + direction, 1, 12);
        this.render();
    }
    reset() {
        this.gesto = null;
        const hoje = new Date();
        this.mes = new Date(hoje.getFullYear(), hoje.getMonth(), 1, 12);
        this.setActivities([]);
    }
    setActivities(atividades) {
        this.atividades = atividades;
        this.render();
    }
    render() {
        const ano = this.mes.getFullYear(), mes = this.mes.getMonth();
        const titulo = `${MESES[mes]} de ${ano}`;
        const dias = diasCalendario(ano, mes, this.atividades);
        this.root.innerHTML = `<div class="agenda-calendar-header">
            <h2 id="agenda-calendar-title" class="agenda-calendar-title" aria-live="polite"><span>${MESES[mes]}</span><span>${ano}</span></h2>

        </div>
        <div class="agenda-calendar-week" aria-hidden="true">${SEMANA.map(dia => `<span>${dia}</span>`).join('')}</div>
        <ol class="agenda-calendar-days" aria-label="${titulo}">${dias.map(dia => {
            const descricao = `${dia.data.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}, ${dia.visitas ? `${dia.visitas} visita${dia.visitas === 1 ? '' : 's'}` : 'sem visitas'}`;
            return `<li class="agenda-calendar-day${dia.fimSemana ? ' is-weekend' : ''}${dia.fora ? ' is-outside' : ''}${dia.hoje ? ' is-today' : ''}" aria-label="${escaparHtml(descricao)}"${dia.hoje ? ' aria-current="date"' : ''}>
                <span aria-hidden="true">${dia.dia}</span><span class="agenda-calendar-dots" aria-hidden="true">${'<i></i>'.repeat(Math.min(dia.visitas, 3))}</span>
            </li>`;
        }).join('')}</ol>`;
    }
}
