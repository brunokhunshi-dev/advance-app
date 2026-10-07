export const MOTIVOS_CANCELAMENTO = ['Loja fechada', 'Responsável indisponível', 'Solicitação do cliente', 'Outro'];

export function atividadePodeSerCancelada(atividade) {
    return ['Pendente', 'Em andamento'].includes(atividade?.status);
}

export function dadosCancelamento(atividade, { motivo, detalhe = '', usuarioId, agora = new Date() }) {
    if (!usuarioId || atividade.ptvId !== usuarioId) throw new Error('Esta atividade não pertence ao usuário conectado.');
    if (!atividadePodeSerCancelada(atividade)) throw new Error('Esta atividade já foi finalizada ou cancelada. Atualize a agenda.');
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
