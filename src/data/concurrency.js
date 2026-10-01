// Preserve all results while limiting simultaneous requests (including failures).
export async function mapSettled(items, concurrency, worker, shouldContinue = () => true) {
    const results = new Array(items.length);
    let next = 0;
    async function run() {
        while (next < items.length && shouldContinue()) {
            const index = next++;
            try { results[index] = { status: 'fulfilled', value: await worker(items[index], index) }; }
            catch (reason) { results[index] = { status: 'rejected', reason }; }
        }
    }
    await Promise.all(Array.from({ length: Math.min(items.length, Math.max(1, concurrency)) }, run));
    return results.filter(Boolean);
}
