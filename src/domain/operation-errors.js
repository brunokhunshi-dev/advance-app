// Mensagens operacionais: explicar a falha sem expor tokens nem URLs assinadas.
export function describeOperationError(error, operation = 'operação') {
    const code = String(error?.code || '').replace(/^.*\//, '').toLowerCase();
    const status = Number(error?.status || 0);
    const raw = String(error?.message || '');
    const quota = code === 'resource-exhausted' || /quota exceeded|resource[-.]exhausted|limite (de consultas|preventivo|de imagens)/i.test(raw);
    const limited = status === 429 || /consultas de imagens temporariamente suspensas|aguarde um minuto/i.test(raw);
    const identifier = [code && 'Firebase: ' + code, status && 'HTTP ' + status].filter(Boolean).join(' | ');
    const suffix = identifier ? '\nIdentificação técnica: ' + identifier + '.' : '';

    if (quota || limited) return (
        'O serviço bloqueou temporariamente novas solicitações para proteger o banco de dados. ' +
        (quota ? 'A cota de uso do Firestore pode ter sido atingida.' : 'O limite preventivo de requisições foi atingido.') +
        '\n\nO que fazer: não pressione repetidamente o botão. Aguarde a recuperação do serviço e avise o administrador. ' +
        'Se você estava preenchendo um relatório, mantenha a tela aberta e preserve as fotos até conseguir salvar. ' +
        'Se era um check-in ou check-out, NÃO considere a operação concluída sem confirmar o status na agenda.' + suffix
    );
    if (code === 'permission-denied' || status === 403) return (
        'O servidor recusou a autorização para esta ' + operation + '. O registro pode pertencer a outro usuário, ' +
        'ou o seu perfil pode não ter a permissão necessária. Verifique se está na conta correta e peça ao administrador ' +
        'para conferir seu acesso. Não continue tentando repetidamente.' + suffix
    );
    if (code === 'unauthenticated' || status === 401) return (
        'Sua autenticação expirou ou não foi aceita. Antes de sair, preserve qualquer relatório não salvo. ' +
        'Depois, entre novamente na sua conta.' + suffix
    );
    if (code === 'unavailable' || /failed to fetch|networkerror|network request failed/i.test(raw)) return (
        'Não foi possível comunicar com o serviço. Pode haver instabilidade na internet ou indisponibilidade do servidor. ' +
        'Verifique a conexão e tente novamente após a estabilização. Não presuma que a ' + operation +
        ' foi salva: confirme o status antes de repetir.' + suffix
    );
    if (code === 'failed-precondition') return (
        'O banco de dados recusou esta ação porque uma condição necessária não foi atendida. ' +
        'Anote em qual tela ocorreu e avise o administrador. Não altere os dados apenas para tentar contornar o erro.' + suffix
    );
    if (code === 'not-found' || status === 404) return (
        'O registro ou serviço solicitado não foi encontrado. O item pode ter sido alterado ou a versão do aplicativo ' +
        'pode estar desatualizada. Confirme a identificação do registro e contate o administrador.' + suffix
    );
    return (
        'Não foi possível concluir esta ' + operation + '. ' +
        'Confira a conexão e o estado da atividade antes de tentar novamente, para evitar registros duplicados. ' +
        'Se o problema persistir, informe ao administrador a tela e o horário do erro.' + suffix +
        (raw && raw.length < 160 && !/https?:\/\/|Bearer |token|password|senha/i.test(raw) ? '\nDetalhe: ' + raw : '')
    );
}
