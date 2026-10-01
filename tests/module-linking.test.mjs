import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('app and dashboard module graphs link and evaluate without missing imports', () => {
    const result = spawnSync(process.execPath, ['--experimental-vm-modules', 'tests/support/link-modules.mjs'], {encoding:'utf8'});
    assert.equal(result.status,0,result.stderr || result.stdout);
});
