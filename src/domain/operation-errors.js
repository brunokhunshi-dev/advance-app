export function describeOperationError(error) {
    const code = String(error?.code || '').split('/').pop().toLowerCase();
    const status = Number(error?.status || 0);
    const raw = String(error?.message || '');

    if (code === 'resource-exhausted' || /quota exceeded|resource[-.]exhausted/i.test(raw)) {
        return 'O serviço atingiu o limite de uso. Tente mais tarde.';
    }
    if (status === 429 || /limite (de consultas|preventivo)|consultas de imagens temporariamente suspensas/i.test(raw)) {
        return 'Muitas solicitações em pouco tempo. Aguarde e tente novamente.';
    }
    if (code === 'permission-denied' || status === 403) return 'Você não tem permissão para esta ação.';
    if (code === 'unauthenticated' || status === 401) return 'Entre novamente para continuar.';
    if (code === 'unavailable' || /failed to fetch|networkerror|network request failed/i.test(raw)) {
        return 'Falha na comunicação com o serviço. Confira sua conexão.';
    }
    if (code === 'not-found' || status === 404) return 'O item solicitado não foi encontrado.';
    if (code === 'failed-precondition') return 'O serviço recusou a ação no estado atual. Atualize a tela.';

    // Preserve mensagens curtas do próprio app. Erros técnicos ficam no console.
    const mensagem = raw.replace(/\s+/g, ' ').trim();
    const textoTecnico = /https?:\/\/|\b(?:Bearer|token|password|senha|FirebaseError|Firestore|HTTP|stack)\b|^\w+Error:|(?:api[-_ ]?key|authorization|session[-_ ]?id)\s*[:=]/i;
    if (!code && !status && mensagem && mensagem.length <= 150 && !textoTecnico.test(mensagem)) {
        return mensagem;
    }
    return 'Falha inesperada. Tente novamente.';
}
