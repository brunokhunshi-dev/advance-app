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
        root.addEventListener('click', event => {
            const button = event.target.closest('[data-calendar-month]');
            if (!button || !root.contains(button)) return;
            this.mes = new Date(this.mes.getFullYear(), this.mes.getMonth() + Number(button.dataset.calendarMonth), 1, 12);
            this.render();
            root.querySelector(`[data-calendar-month="${button.dataset.calendarMonth}"]`)?.focus({ preventScroll: true });
        });
    }
    reset() {
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
            <div class="agenda-calendar-navigation">
                <button type="button" data-calendar-month="-1" aria-label="Mês anterior"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6-6 6 6 6"/></svg></button>
                <button type="button" data-calendar-month="1" aria-label="Próximo mês"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 6 6 6-6 6"/></svg></button>
            </div>
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
