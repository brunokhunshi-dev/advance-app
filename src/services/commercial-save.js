// Upload first, publish metadata atomically, then remove superseded objects.
export const commercialMedia = data => [...(data?.photos || []), ...(data?.blocks || []).filter(block => block.kind === 'media')];
export async function persistCommercialMedia({activityId, data, base, media, commit, validateSession = () => {}}) {
    const prepared = structuredClone(data);
    const uploaded = [];
    let committed = false;
    try {
        for (const block of commercialMedia(prepared)) {
            validateSession();
            if (block.storage === 'r2') continue;
            const local = media.local(block.id);
            if (!local) throw new Error('Uma imagem não está disponível. Adicione-a novamente antes de salvar.');
            const stored = await media.upload(activityId, block.id, local.file, local.thumbnail);
            uploaded.push(block.id);
            Object.assign(block, stored, {storage:'r2'});
        }
        validateSession();
        const result = await commit(prepared);
        committed = true;
        const kept = new Set(commercialMedia(prepared).map(block => block.id));
        for (const id of uploaded) media.clearLocal(id);
        const removed = commercialMedia(base).filter(block => block.storage === 'r2' && !kept.has(block.id));
        const cleanup = await Promise.allSettled(removed.map(block => media.delete(activityId, block.id)));
        return {result, data:prepared, cleanupFailed:cleanup.some(item => item.status === 'rejected')};
    } catch (error) {
        if (!committed) await Promise.allSettled(uploaded.map(id => media.delete(activityId,id)));
        throw error;
    }
}
