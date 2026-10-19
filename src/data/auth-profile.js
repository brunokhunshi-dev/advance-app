const FIELD_COLLECTIONS = new Set(['assistencia', 'promotores']);
const validId = value => typeof value === 'string' && /^[A-Za-z0-9._-]{1,180}$/.test(value);

// Both documents are protected from browser writes. No email query or role inference.
export async function resolveFieldProfile(uid, read, validateSession = () => {}) {
    const link = await read('vinculos_auth', uid);
    validateSession();
    if (!link || !FIELD_COLLECTIONS.has(link.profileCollection) || !validId(link.profileId)) {
        throw new Error('Seu acesso ainda não foi vinculado. Procure o responsável pelo aplicativo.');
    }
    const profile = await read(link.profileCollection, link.profileId);
    validateSession();
    if (!profile || profile.ativo === false || profile.permissoes?.acessoApp === false) {
        throw new Error('Seu acesso ao Advance Check está desativado. Procure seu gestor.');
    }
    return {...profile, nome:profile.nome || 'Profissional', permissoes:profile.permissoes || {}, id:link.profileId, tipo:link.profileCollection === 'assistencia' ? 'Assistente' : 'Promotor'};
}
