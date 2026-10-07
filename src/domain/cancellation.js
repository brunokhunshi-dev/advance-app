export const MOTIVOS_CANCELAMENTO = ['Loja fechada', 'Responsável indisponível', 'Solicitação do cliente', 'Outro'];

export function dadosCancelamento(atividade, { motivo, detalhe = '', usuarioId, agora = new Date() }) {
    if (!usuarioId || atividade.ptvId !== usuarioId) throw new Error('Esta atividade não pertence ao usuário conectado.');
    if (atividade.status !== 'Pendente') throw new Error('Somente agendamentos pendentes podem ser cancelados. Atualize a agenda.');
    if (!MOTIVOS_CANCELAMENTO.includes(motivo)) throw new Error('Selecione o motivo do cancelamento.');
    const texto = String(detalhe).trim();
    if (motivo === 'Outro' && !texto) throw new Error('Descreva o motivo do cancelamento.');
    if (motivo === 'Outro' && texto.length > 600) throw new Error('O motivo deve ter até 600 caracteres.');
    return {
        status: 'Cancelada', resultado: 'Cancelada', motivoCancelamento: motivo,
        detalheCancelamento: motivo === 'Outro' ? texto : '',
        canceladoEm: agora, canceladoPor: usuarioId, atualizadoEm: agora
    };
}

export function motivoCancelamentoTexto(atividade) {
    const motivo = String(atividade.motivoCancelamento || '').trim();
    const detalhe = String(atividade.detalheCancelamento || '').trim();
    return motivo === 'Outro' && detalhe ? `${motivo}: ${detalhe}` : motivo || 'Motivo não informado';
}
