import { dadosCancelamento } from '../domain/cancellation.js';

export async function cancelarAgendamento({ transaction, reference, validateSession, usuarioId, motivo, detalhe, agora = new Date() }) {
    validateSession();
    await transaction(async tx => {
        const snapshot = await tx.get(reference);
        validateSession();
        if (!snapshot.exists()) throw new Error('Agendamento não encontrado.');
        const dados = dadosCancelamento(snapshot.data(), { motivo, detalhe, usuarioId, agora });
        tx.update(reference, dados);
    });
}
