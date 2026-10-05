const dataInput = data => `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;

export function limitesAgendamento(agora = new Date()) {
    const minimo = new Date(agora);
    minimo.setSeconds(0, 0);
    const maximo = new Date(agora);
    const dia = maximo.getDate();
    maximo.setDate(1);
    maximo.setMonth(maximo.getMonth() + 6);
    const ultimoDia = new Date(maximo.getFullYear(), maximo.getMonth() + 1, 0).getDate();
    maximo.setDate(Math.min(dia, ultimoDia));
    maximo.setHours(23, 59, 59, 999);
    return { minimo, maximo, minInput: dataInput(minimo), maxInput: dataInput(maximo) };
}

export function validarAgendamento(data, agora = new Date()) {
    if (!(data instanceof Date) || !Number.isFinite(data.getTime())) throw new Error('Informe uma data e horário válidos.');
    const { minimo, maximo } = limitesAgendamento(agora);
    if (data < minimo) throw new Error('Não é possível agendar uma visita no passado. Escolha hoje ou uma data futura, com horário a partir de agora.');
    if (data > maximo) throw new Error('As visitas podem ser agendadas com no máximo seis meses de antecedência.');
}
