import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const editor = readFileSync(new URL('../technical-report-editor.js', import.meta.url), 'utf8');
const commercial = readFileSync(new URL('../src/ui/commercial-report.js', import.meta.url), 'utf8');
const training = readFileSync(new URL('../src/ui/training-report.js', import.meta.url), 'utf8');
const save = readFileSync(new URL('../src/services/commercial-save.js', import.meta.url), 'utf8');

test('report images use click-only original URLs, without automatic thumbnail loading', () => {
  assert.match(editor,/button\.onclick\s*=\s*async/);
  assert.match(editor,/mediaStore\.readUrl\(activityId, id, 'original'\)/);
  assert.doesNotMatch(editor,/readUrl\([^\n]*thumbnail/);
  assert.doesNotMatch(editor,/loadVisiblePreview|IntersectionObserver|createThumbnail/);
  assert.match(editor,/Abrir \$\{block\.type\.startsWith/);
});

test('new photos only upload the compressed original', () => {
  assert.doesNotMatch(editor,/thumbnailUrl|thumbnailKey|thumbnailUploadUrl|createThumbnail/);
  assert.doesNotMatch(commercial,/thumbnail/);
  assert.doesNotMatch(training,/thumbnail/);
  assert.doesNotMatch(save,/thumbnail/);
  assert.match(editor,/uploadSigned\(signed\.original\.uploadUrl, file, file\.type\)/);
});
