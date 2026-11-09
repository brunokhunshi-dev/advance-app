import { cpSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';

const output = new URL('../dist/', import.meta.url);
const root = new URL('../', import.meta.url);
rmSync(output, { recursive: true, force: true });
mkdirSync(output);

const assets = readdirSync(root).filter(name => /\.(css|html|js)$/.test(name));
for (const path of [...assets, 'manifest.json', 'data', 'midia', 'src']) {
    cpSync(new URL(path, root), new URL(path, output), { recursive: true });
}

const apiKey = process.env.ADVANCE_GEOAPIFY_API_KEY?.trim() || '';
writeFileSync(new URL('geoapify-config.json', output), JSON.stringify({ apiKey }));
