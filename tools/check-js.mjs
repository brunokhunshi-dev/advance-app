import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';

function files(directory) {
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        if (entry.name.startsWith('.') || ['node_modules', 'exports'].includes(entry.name)) return [];
        const path = resolve(directory, entry.name);
        return entry.isDirectory() ? files(path) : /\.(m?js)$/.test(path) ? [path] : [];
    });
}
const scripts = files('.');
let errors = 0;
for (const path of scripts) {
    const result = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
    if (result.status !== 0) { console.error(result.stderr); errors++; }
    const source = readFileSync(path, 'utf8');
    for (const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)["'](\.[^"']+)["']/g)) {
        const target = resolve(dirname(path), match[1].split('?')[0]);
        if (!existsSync(target)) { console.error(`Missing import in ${path}: ${match[1]}`); errors++; }
    }
}
if (errors) process.exitCode = 1;
else console.log(`Syntax and local imports checked: ${scripts.length} files.`);
