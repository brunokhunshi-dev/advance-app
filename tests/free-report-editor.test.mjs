import test from 'node:test';
import assert from 'node:assert/strict';
import { TechnicalReportEditor } from '../technical-report-editor.js';

const editor = () => Object.assign(Object.create(TechnicalReportEditor.prototype), {
    status: {}, input: {}, pendingDeletes: new Set(), render() {}
});

test('reopening an empty saved free report restores an editable text block', () => {
    const instance = editor();
    instance.reset({ activityId: 'commercial', text: '', blocks: [], preserveLocal: true });
    assert.deepEqual(instance.blocks, [{ kind: 'text', text: '' }]);
    assert.equal(instance.active, 0);
});

test('saved photo-only and legacy reports keep photos and allow text before and after them', () => {
    const photo = { kind: 'media', id: 'photo', storage: 'r2' };
    for (const text of ['', 'Texto atualizado']) {
        const instance = editor();
        instance.reset({ activityId: 'commercial', text, blocks: [photo], preserveLocal: true });
        assert.deepEqual(instance.blocks, [{ kind: 'text', text }, photo, { kind: 'text', text: '' }]);
        assert.ok(instance.persistedMediaIds.has('photo'));
    }
});

test('mobile photo chooser targets the current editor after switching activities and reopening modules', () => {
    const originals = Object.fromEntries(['window', 'navigator', 'document'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    let dialog;
    const element = () => ({ listeners: {}, children: [], addEventListener(type, fn) { this.listeners[type] = fn; }, append(...children) { this.children.push(...children); }, close() {}, showModal() {} });
    try {
        Object.defineProperty(globalThis, 'window', { configurable: true, value: { matchMedia: () => ({ matches: true }) } });
        Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: 'Android' } });
        Object.defineProperty(globalThis, 'document', { configurable: true, value: {
            querySelector: () => dialog,
            createElement: element,
            body: { append(node) { dialog = node; } }
        } });
        const calls = [];
        const make = name => Object.assign(editor(), { picker: { click: () => calls.push(name + '-gallery') }, cameraPicker: { click: () => calls.push(name + '-camera') } });
        const commercial = make('commercial');
        const training = make('training');
        commercial.openSourceChooser();
        dialog.children[2].listeners.click();
        training.openSourceChooser();
        dialog.children[2].listeners.click();
        dialog.children[1].listeners.click();
        const reopened = make('reopened');
        reopened.openSourceChooser();
        dialog.children[2].listeners.click();
        assert.deepEqual(calls, ['commercial-gallery', 'training-gallery', 'training-camera', 'reopened-gallery']);
    } finally {
        for (const [key, descriptor] of Object.entries(originals)) {
            if (descriptor) Object.defineProperty(globalThis, key, descriptor);
            else delete globalThis[key];
        }
    }
});
