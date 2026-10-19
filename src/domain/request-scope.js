// Um pedido assíncrono só pode atualizar a interface que o iniciou.
export function createRequestScope() {
    let version = 0;
    return {
        begin(id) { return { version: ++version, id }; },
        isCurrent(token, id = token?.id) {
            return !!token && token.version === version && token.id === id;
        },
        invalidate() { version++; }
    };
}
