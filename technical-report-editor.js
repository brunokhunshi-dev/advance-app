// Local media adapter. Replace put/get with authenticated R2 uploads/downloads later.
const dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open('advance-technical-reports', 1);
    request.onupgradeneeded = () => {
        request.result.createObjectStore('files');
        request.result.createObjectStore('documents');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
});
dbPromise.catch(() => {});
async function access(store, mode, key, value) {
    const db = await dbPromise;
    return new Promise((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const request = mode === 'readonly' ? tx.objectStore(store).get(key) : tx.objectStore(store).put(value, key);
        tx.oncomplete = () => resolve(request.result);
        tx.onerror = tx.onabort = () => reject(tx.error || new Error('Não foi possível salvar neste navegador.'));
    });
}
export const mediaStore = {
    put: (id, file) => access('files', 'readwrite', id, file),
    get: id => access('files', 'readonly', id)
};
const documents = new Map();
export async function loadLocalReport(key) {
    try { documents.set(key, await access('documents', 'readonly', key) || null); }
    catch { documents.set(key, null); }
}
export function localReport(key) { return documents.get(key); }
const escape = value => String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const textBlock = text => ({ kind: 'text', text: text || '' });
export function reportMarkup(blocks) {
    return (blocks || []).map(block => block.kind === 'text'
        ? `<p class="technical-report-paragraph">${escape(block.text)}</p>`
        : `<button type="button" class="report-media-open" data-report-media="${escape(block.id)}" data-media-type="${escape(block.type)}" aria-label="Abrir ${escape(block.name)}"><span class="report-media-preview">${block.type.startsWith('audio/') ? '♫' : '▶'}</span><span class="report-media-caption">${escape(block.name)}<small>Clique para abrir o arquivo</small></span></button>`).join('');
}
let viewer;
function openMedia(file, name) {
    if (!viewer) {
        viewer = document.createElement('dialog');
        viewer.className = 'report-media-dialog';
        document.body.append(viewer);
    }
    const url = URL.createObjectURL(file);
    const close = document.createElement('button');
    close.type = 'button'; close.className = 'report-media-close'; close.textContent = 'Fechar';
    const title = document.createElement('h2'); title.textContent = name;
    const media = document.createElement(file.type.startsWith('image/') ? 'img' : file.type.startsWith('video/') ? 'video' : 'audio');
    media.src = url; media.alt = name;
    if (media.tagName !== 'IMG') media.controls = true;
    const download = document.createElement('a'); download.href = url; download.download = name; download.textContent = 'Abrir / baixar original';
    viewer.replaceChildren(close, title, media, download);
    close.onclick = () => viewer.close();
    viewer.onclose = () => { media.pause?.(); URL.revokeObjectURL(url); viewer.replaceChildren(); };
    viewer.showModal();
}
function hydrate(root) {
    root.querySelectorAll('[data-report-media]:not([data-ready])').forEach(async button => {
        button.dataset.ready = 'true';
        try {
            const file = await mediaStore.get(button.dataset.reportMedia);
            if (!file) { button.querySelector('small').textContent = 'Arquivo indisponível neste navegador'; return; }
            if (!button.isConnected) return;
            if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
                const preview = document.createElement(file.type.startsWith('image/') ? 'img' : 'video');
                const url = URL.createObjectURL(file);
                preview.src = url; preview.alt = ''; preview.muted = true; preview.preload = 'metadata';
                button.querySelector('.report-media-preview').replaceChildren(preview);
                preview.dataset.objectUrl = url;
            }
            button.onclick = () => openMedia(file, button.querySelector('.report-media-caption').firstChild.textContent);
        } catch { button.querySelector('small').textContent = 'Não foi possível abrir o arquivo'; }
    });
}
export function initializeMediaPreviews() {
    const observer = new MutationObserver(records => {
        for (const record of records) for (const node of record.removedNodes) {
            if (node.nodeType !== 1) continue;
            const previews = [node, ...node.querySelectorAll('[data-object-url]')];
            previews.forEach(el => { if (!el.isConnected && el.dataset.objectUrl) URL.revokeObjectURL(el.dataset.objectUrl); });
        }
        hydrate(document);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    hydrate(document);
}
export class TechnicalReportEditor {
    constructor(root, input, button, picker, status) {
        Object.assign(this, { root, input, button, picker, status });
        this.blocks = [textBlock('')]; this.key = ''; this.busy = false;
        button.addEventListener('click', () => picker.click());
        picker.addEventListener('change', () => this.insertFiles([...picker.files]));
        this.render();
    }
    reset(key, text) {
        this.generation = (this.generation || 0) + 1;
        this.status.textContent = '';
        this.key = key;
        const saved = localReport(key);
        // The server text remains authoritative if edited on another device.
        this.blocks = saved && saved.text === text ? structuredClone(saved.blocks) : [textBlock(text)];
        this.baseline = JSON.stringify(this.blocks); this.active = 0; this.caret = null;
        this.render();
    }
    get dirty() { return JSON.stringify(this.blocks) !== this.baseline; }
    sync() {
        this.input.value = this.blocks.filter(b => b.kind === 'text').map(b => b.text).join('\n\n').trim();
        this.input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    render(focusIndex) {
        this.root.replaceChildren();
        this.blocks.forEach((block, index) => {
            if (block.kind === 'text') {
                const area = document.createElement('textarea');
                area.className = 'report-text-block'; area.value = block.text;
                area.placeholder = 'Relate os acontecimentos, observações e procedimentos…';
                area.setAttribute('aria-label', 'Texto do relatório técnico');
                const remember = () => { this.active = index; this.caret = [area.selectionStart, area.selectionEnd]; };
                area.addEventListener('input', () => { block.text = area.value; remember(); this.sync(); resize(); });
                ['focus', 'click', 'keyup', 'select', 'blur'].forEach(event => area.addEventListener(event, remember));
                const resize = () => { area.style.height = 'auto'; area.style.height = Math.max(110, area.scrollHeight) + 'px'; };
                this.root.append(area); requestAnimationFrame(resize);
                if (focusIndex === index) requestAnimationFrame(() => area.focus());
            } else {
                const figure = document.createElement('figure'); figure.className = 'report-media-block';
                figure.innerHTML = reportMarkup([block]);
                const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'report-media-remove';
                remove.textContent = 'Remover'; remove.setAttribute('aria-label', 'Remover ' + block.name);
                remove.onclick = () => {
                    this.blocks.splice(index, 1);
                    if (this.blocks[index]?.kind === 'text' && this.blocks[index - 1]?.kind === 'text') {
                        this.blocks[index - 1].text += '\n' + this.blocks[index].text;
                        this.blocks.splice(index, 1);
                    }
                    this.active = Math.max(0, index - 1); this.caret = null; this.sync(); this.render(this.active);
                };
                figure.append(remove); this.root.append(figure);
            }
        });
    }
    async insertFiles(files) {
        if (!files.length || this.busy) return;
        const generation = this.generation, key = this.key, index = this.active || 0, caret = this.caret;
        this.busy = true; this.button.disabled = true;
        this.root.inert = true;
        try {
            if (files.some(file => !/^(image\/(jpeg|png|gif|webp|avif|heic|heif)|video\/|audio\/)/i.test(file.type))) throw new Error('Selecione fotos, imagens, vídeos ou áudios compatíveis.');
            if (files.some(file => file.size > 100 * 1024 * 1024)) throw new Error('Cada arquivo deve ter até 100 MB nesta versão de teste.');
            if (this.blocks.filter(b => b.kind === 'media').length + files.length > 20) throw new Error('Adicione até 20 arquivos por relatório.');
            const media = [];
            for (const file of files) {
                const id = crypto.randomUUID(); await mediaStore.put(id, file);
                media.push({kind: 'media', id, name: file.name, type: file.type, size: file.size, storage: 'local'});
            }
            if (key !== this.key || generation !== this.generation) return;
            const block = this.blocks[index];
            const [start, end] = caret || [block.text.length, block.text.length];
            this.blocks.splice(index, 1, textBlock(block.text.slice(0, start)), ...media, textBlock(block.text.slice(end)));
            this.active = index + media.length + 1; this.caret = null;
            this.sync(); this.render(this.active);
            this.status.textContent = 'Mídia adicionada. Clique na miniatura para abrir.';
        } catch (error) { this.status.textContent = error.message; }
        finally { this.busy = false; this.button.disabled = false; this.root.inert = false; this.picker.value = ''; }
    }
    async save() {
        const value = {blocks: structuredClone(this.blocks), text: this.input.value};
        await access('documents', 'readwrite', this.key, value);
        documents.set(this.key, value); this.baseline = JSON.stringify(this.blocks);
    }
}
