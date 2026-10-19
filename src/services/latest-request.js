// Invalidating navigation/session or starting a newer request makes old results inert.
export function createLatestRequestGuard() {
    let generation = 0;
    return {
        invalidate() { generation++; },
        begin(isCurrent = () => true) {
            const version = ++generation;
            return () => version === generation && isCurrent();
        }
    };
}
