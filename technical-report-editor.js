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
    get: id => access('files', 'readonly', id),
    putThumbnail: (id, blob) => access('files', 'readwrite', id + ':thumbnail', blob),
    getThumbnail: id => access('files', 'readonly', id + ':thumbnail')
};
const documents = new Map();
export async function loadLocalReport(key) {
    try { documents.set(key, await access('documents', 'readonly', key) || null); }
    catch { documents.set(key, null); }
}
export function localReport(key) { return documents.get(key); }
const escape = value => String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const textBlock = text => ({ kind: 'text', text: text || '' });
const mediaIcon = type => type.startsWith('audio/') ? '♫' : type.startsWith('video/') ? '▶' : '▧';
export function reportMarkup(blocks) {
    return (blocks || []).map(block => block.kind === 'text'
        ? (block.text ? `<p class="technical-report-paragraph">${escape(block.text)}</p>` : '')
        : `<button type="button" class="report-media-open" data-report-media="${escape(block.id)}" data-media-type="${escape(block.type)}" data-media-name="${escape(block.name)}" aria-label="Abrir ${escape(block.name)}" title="${escape(block.name)}"><span class="report-media-preview" aria-hidden="true">${mediaIcon(block.type)}</span>${block.type.startsWith('video/') ? '<span class="report-media-play" aria-hidden="true">▶</span>' : ''}</button>`).join('');
}
// Only this 96px compressed image is decoded in the report; original files open on demand.
export async function createThumbnail(file) {
    if (!/^(image|video)\//.test(file.type)) return null;
    const video = file.type.startsWith('video/');
    const source = document.createElement(video ? 'video' : 'img');
    const url = URL.createObjectURL(file);
    let timeout;
    try {
        await new Promise((resolve, reject) => {
            timeout = setTimeout(() => reject(new Error('Prévia indisponível')), 6000);
            source.onerror = () => reject(new Error('Prévia indisponível'));
            if (video) {
                source.muted = true; source.playsInline = true; source.preload = 'auto';
                source.onloadeddata = () => {
                    if (source.duration > 0.1) source.currentTime = Math.min(0.1, source.duration / 2);
                    else resolve();
                };
                source.onseeked = resolve;
            } else source.onload = resolve;
            source.src = url;
        });
        const width = video ? source.videoWidth : source.naturalWidth;
        const height = video ? source.videoHeight : source.naturalHeight;
        if (!width || !height) return null;
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 96;
        const context = canvas.getContext('2d');
        const side = Math.min(width, height);
        context.fillStyle = '#edf0f5'; context.fillRect(0, 0, 96, 96);
        context.drawImage(source, (width - side) / 2, (height - side) / 2, side, side, 0, 0, 96, 96);
        return await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.25));
    } catch { return null; }
    finally {
        clearTimeout(timeout);
        source.onload = source.onerror = source.onloadeddata = source.onseeked = null;
        if (video) { source.pause(); source.removeAttribute('src'); source.load(); }
        URL.revokeObjectURL(url);
    }
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
        const id = button.dataset.reportMedia;
        const name = button.dataset.mediaName;
        button.onclick = async () => {
            button.disabled = true;
            try {
                const file = await mediaStore.get(id);
                if (file) openMedia(file, name);
                else showMediaError('Arquivo indisponível neste navegador.');
            } catch { showMediaError('Não foi possível abrir o arquivo.'); }
            finally { button.disabled = false; }
        };
        if (!/^(image|video)\//.test(button.dataset.mediaType)) return;
        try {
            let thumbnail = await mediaStore.getThumbnail(id);
            // Migrate previews for files created by the first front-end version.
            if (thumbnail === undefined) {
                const file = await mediaStore.get(id);
                thumbnail = file ? await createThumbnail(file) : null;
                await mediaStore.putThumbnail(id, thumbnail);
            }
            if (!thumbnail || !button.isConnected) return;
            const preview = document.createElement('img');
            preview.src = URL.createObjectURL(thumbnail); preview.alt = '';
            preview.width = preview.height = 96;
            preview.dataset.objectUrl = preview.src;
            button.querySelector('.report-media-preview').replaceChildren(preview);
        } catch { /* Keep the file-type icon when a thumbnail cannot be decoded. */ }
    });
}
function showMediaError(message) {
    if (window.mostrarAlerta) window.mostrarAlerta('Arquivo', message);
    else window.alert(message);
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
        button.addEventListener('click', () => { if (!this.locked && !this.busy) picker.click(); });
        root.addEventListener('click', event => {
            if (event.target === root) this.focusText(this.blocks.length - 1);
        });
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
        this.baseline = JSON.stringify(this.blocks); this.active = 0; this.selection = null;
        this.input.value = text || '';
        this.render();
    }
    setLocked(locked) {
        this.locked = locked; this.root.inert = locked || this.busy;
        this.button.disabled = locked || this.busy;
    }
    focusText(index, offset) {
        const area = this.root.querySelector(`[data-text-index="${index}"]`);
        if (!area) return;
        area.focus();
        const range = document.createRange();
        range.selectNodeContents(area);
        if (offset === 0) range.collapse(true);
        else range.collapse(false);
        const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
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
                const area = document.createElement('div');
                area.contentEditable = 'plaintext-only';
                area.className = 'report-text-block'; area.textContent = block.text;
                area.dataset.textIndex = index;
                area.dataset.placeholder = this.blocks.length === 1 ? 'Comece a escrever...' : '';
                area.setAttribute('role', 'textbox'); area.setAttribute('aria-multiline', 'true');
                area.setAttribute('aria-label', 'Texto do relatório');
                const remember = () => {
                    const selection = window.getSelection();
                    if (!selection.rangeCount || !area.contains(selection.anchorNode) || !area.contains(selection.focusNode)) return;
                    const range = selection.getRangeAt(0);
                    const before = range.cloneRange(); before.selectNodeContents(area); before.setEnd(range.startContainer, range.startOffset);
                    const after = range.cloneRange(); after.selectNodeContents(area); after.setStart(range.endContainer, range.endOffset);
                    this.active = index;
                    // Keep DOM ranges until the file picker returns, preserving multiline selection.
                    this.selection = { index, before, after };
                };
                area.addEventListener('input', () => {
                    block.text = area.innerText.replace(/\r/g, '');
                    if (block.text === '\n') { block.text = ''; area.replaceChildren(); }
                    remember(); this.sync();
                });
                ['focus', 'pointerup', 'keyup', 'blur'].forEach(event => area.addEventListener(event, remember));
                this.root.append(area);
            } else {
                const figure = document.createElement('figure'); figure.className = 'report-media-block';
                figure.innerHTML = reportMarkup([block]);
                const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'report-media-remove';
                remove.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8"/></svg>'; remove.title = 'Remover ' + block.name; remove.setAttribute('aria-label', 'Remover ' + block.name);
                remove.onclick = () => {
                    this.blocks.splice(index, 1);
                    if (this.blocks[index]?.kind === 'text' && this.blocks[index - 1]?.kind === 'text') {
                        this.blocks[index - 1].text += '\n' + this.blocks[index].text;
                        this.blocks.splice(index, 1);
                    }
                    this.active = this.blocks.findLastIndex(b => b.kind === 'text'); this.selection = null; this.sync(); this.render(this.active);
                };
                figure.append(remove); this.root.append(figure);
            }
        });
        if (focusIndex !== undefined) this.focusText(focusIndex, 0);
    }
    async insertFiles(files) {
        if (!files.length || this.busy || this.locked) return;
        const generation = this.generation, key = this.key, index = this.active || 0;
        const selection = this.selection;
        const fragmentText = range => {
            const container = document.createElement('div');
            container.style.cssText = 'position:fixed;left:-10000px;white-space:pre-wrap';
            container.append(range.cloneContents()); document.body.append(container);
            const text = container.innerText; container.remove(); return text;
        };
        const block = this.blocks[index];
        const before = selection?.index === index ? fragmentText(selection.before) : block.text;
        const after = selection?.index === index ? fragmentText(selection.after) : '';
        this.busy = true; this.button.disabled = true;
        this.root.inert = true;
        try {
            if (files.some(file => !/^(image\/(jpeg|png|gif|webp|avif|heic|heif)|video\/|audio\/)/i.test(file.type))) throw new Error('Selecione fotos, imagens, vídeos ou áudios compatíveis.');
            if (files.some(file => file.size > 100 * 1024 * 1024)) throw new Error('Cada arquivo deve ter até 100 MB nesta versão de teste.');
            if (this.blocks.filter(b => b.kind === 'media').length + files.length > 20) throw new Error('Adicione até 20 arquivos por relatório.');
            const media = [];
            for (const file of files) {
                const id = crypto.randomUUID(); await mediaStore.put(id, file);
                await mediaStore.putThumbnail(id, await createThumbnail(file));
                media.push({kind: 'media', id, name: file.name, type: file.type, size: file.size, storage: 'local'});
            }
            if (key !== this.key || generation !== this.generation) return;
            this.blocks.splice(index, 1, textBlock(before), ...media, textBlock(after));
            this.active = index + media.length + 1; this.selection = null;
            this.root.inert = false;
            this.sync(); this.render(this.active);
            this.status.textContent = '';
        } catch (error) { this.status.textContent = error.message; }
        finally { this.busy = false; this.setLocked(Boolean(this.locked)); this.picker.value = ''; }
    }
    async save() {
        const value = {blocks: structuredClone(this.blocks), text: this.input.value};
        await access('documents', 'readwrite', this.key, value);
        documents.set(this.key, value); this.baseline = JSON.stringify(this.blocks);
    }
}
