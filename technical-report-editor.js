const DEFAULT_MEDIA_API = 'https://advance-media-api.brunokhunshi.workers.dev';

let mediaApi = {
    baseUrl: DEFAULT_MEDIA_API,
    getIdToken: null
};

export function configureMediaApi({ baseUrl = DEFAULT_MEDIA_API, getIdToken } = {}) {
    mediaApi.baseUrl = String(baseUrl || DEFAULT_MEDIA_API).replace(/\/$/, '');
    mediaApi.getIdToken = getIdToken;
}

async function mediaApiRequest(path, body) {
    if (typeof mediaApi.getIdToken !== 'function') throw new Error('Serviço de arquivos não configurado.');
    const token = await mediaApi.getIdToken();
    if (!token) throw new Error('Entre novamente para acessar os arquivos.');

    const response = await fetch(mediaApi.baseUrl + path, {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });

    let data = null;
    try { data = await response.json(); } catch {}
    if (!response.ok) throw new Error(data?.error || ('Falha no serviço de arquivos (HTTP ' + response.status + ').'));
    return data || {};
}

async function uploadSigned(url, blob, contentType) {
    const response = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: blob
    });
    if (!response.ok) throw new Error('Falha ao enviar arquivo ao armazenamento (HTTP ' + response.status + ').');
}

const localMedia = new Map();

function clearLocalMedia(id) {
    const local = localMedia.get(id);
    if (local?.thumbnailUrl) URL.revokeObjectURL(local.thumbnailUrl);
    localMedia.delete(id);
}

function clearAllLocalMedia() {
    for (const id of [...localMedia.keys()]) clearLocalMedia(id);
}

export const mediaStore = {
    stage(id, file, thumbnail) {
        clearLocalMedia(id);
        localMedia.set(id, {
            file,
            thumbnail,
            thumbnailUrl: thumbnail ? URL.createObjectURL(thumbnail) : ''
        });
    },
    local(id) {
        return localMedia.get(id) || null;
    },
    clearLocal(id) {
        clearLocalMedia(id);
    },
    async upload(activityId, id, file, thumbnail) {
        const signed = await mediaApiRequest('/v1/media/upload-url', {
            activityId,
            mediaId: id,
            contentType: file.type,
            size: file.size
        });

        try {
            const uploads = [
                uploadSigned(signed.original.uploadUrl, file, file.type)
            ];
            if (thumbnail && signed.thumbnail?.uploadUrl) {
                uploads.push(uploadSigned(signed.thumbnail.uploadUrl, thumbnail, 'image/jpeg'));
            }

            // Original e thumbnail não dependem um do outro. Enviar em paralelo
            // reduz o tempo de salvamento, principalmente em conexões móveis.
            await Promise.all(uploads);

            return {
                key: signed.original.key,
                thumbnailKey: thumbnail ? (signed.thumbnail?.key || null) : null
            };
        } catch (error) {
            // A exclusão é idempotente para o nosso fluxo e limpa qualquer PUT
            // que tenha terminado antes da outra requisição falhar.
            try { await mediaStore.delete(activityId, id); } catch {}
            throw error;
        }
    },
    async readUrl(activityId, id, variant = 'original') {
        const result = await mediaApiRequest('/v1/media/read-url', {
            activityId,
            mediaId: id,
            variant
        });
        return result.url;
    },
    async delete(activityId, id) {
        return mediaApiRequest('/v1/media/delete', {
            activityId,
            mediaId: id
        });
    }
};

const escape = value => String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const textBlock = text => ({ kind: 'text', text: text || '' });
const mediaIcon = type => type.startsWith('audio/') ? '♫' : type.startsWith('video/') ? '▶' : '▧';

function reportText(blocks) {
    return (blocks || [])
        .filter(block => block?.kind === 'text')
        .map(block => String(block.text || ''))
        .join('\n\n')
        .trim();
}

export function reportMarkup(blocks, activityId = '') {
    return (blocks || []).map(block => block.kind === 'text'
        ? (block.text ? `<p class="technical-report-paragraph">${escape(block.text)}</p>` : '')
        : `<button type="button" class="report-media-open" data-report-media="${escape(block.id)}" data-report-activity="${escape(activityId)}" data-media-type="${escape(block.type)}" data-media-name="${escape(block.name)}" aria-label="Abrir ${escape(block.name)}" title="${escape(block.name)}"><span class="report-media-preview" aria-hidden="true">${mediaIcon(block.type)}</span>${block.type.startsWith('video/') ? '<span class="report-media-play" aria-hidden="true">▶</span>' : ''}</button>`).join('');
}

// Only this 96px compressed image is decoded in the report; originals are sent to R2 on save.
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

function showViewer(src, type, name, revokeOnClose = false) {
    if (!viewer) {
        viewer = document.createElement('dialog');
        viewer.className = 'report-media-dialog';
        document.body.append(viewer);
    }

    const close = document.createElement('button');
    close.type = 'button'; close.className = 'report-media-close'; close.textContent = 'Fechar';
    const title = document.createElement('h2'); title.textContent = name;
    const media = document.createElement(type.startsWith('image/') ? 'img' : type.startsWith('video/') ? 'video' : 'audio');
    media.src = src; media.alt = name;
    if (media.tagName !== 'IMG') media.controls = true;

    const download = document.createElement('a');
    download.href = src;
    download.target = '_blank';
    download.rel = 'noopener';
    download.download = name;
    download.textContent = 'Abrir / baixar original';

    viewer.replaceChildren(close, title, media, download);
    close.onclick = () => viewer.close();
    viewer.onclose = () => {
        media.pause?.();
        if (revokeOnClose) URL.revokeObjectURL(src);
        viewer.replaceChildren();
    };
    viewer.showModal();
}

function hydrate(root) {
    root.querySelectorAll('[data-report-media]:not([data-ready])').forEach(async button => {
        button.dataset.ready = 'true';
        const id = button.dataset.reportMedia;
        const activityId = button.dataset.reportActivity;
        const name = button.dataset.mediaName;
        const type = button.dataset.mediaType;
        const local = mediaStore.local(id);

        button.onclick = async () => {
            button.disabled = true;
            try {
                const staged = mediaStore.local(id);
                if (staged?.file) {
                    showViewer(URL.createObjectURL(staged.file), type, name, true);
                    return;
                }
                if (!activityId) throw new Error('Atividade do arquivo não identificada.');
                const url = await mediaStore.readUrl(activityId, id, 'original');
                showViewer(url, type, name);
            } catch (error) {
                showMediaError(error.message || 'Não foi possível abrir o arquivo.');
            } finally {
                button.disabled = false;
            }
        };

        if (!/^(image|video)\//.test(type)) return;

        if (local?.thumbnailUrl) {
            const preview = document.createElement('img');
            preview.src = local.thumbnailUrl; preview.alt = '';
            preview.width = preview.height = 96;
            button.querySelector('.report-media-preview')?.replaceChildren(preview);
            return;
        }

        if (!activityId) return;
        try {
            const url = await mediaStore.readUrl(activityId, id, 'thumbnail');
            if (!button.isConnected) return;
            const preview = document.createElement('img');
            preview.alt = '';
            preview.width = preview.height = 96;
            preview.onload = () => {
                if (button.isConnected) button.querySelector('.report-media-preview')?.replaceChildren(preview);
            };
            preview.src = url;
        } catch {
            // Keep the file-type icon when a thumbnail is unavailable.
        }
    });
}

function showMediaError(message) {
    if (window.mostrarAlerta) window.mostrarAlerta('Arquivo', message);
    else window.alert(message);
}

export function initializeMediaPreviews() {
    const observer = new MutationObserver(() => hydrate(document));
    observer.observe(document.body, { childList: true, subtree: true });
    hydrate(document);
}

export class TechnicalReportEditor {
    constructor(root, input, button, picker, status) {
        Object.assign(this, { root, input, button, picker, status });
        this.blocks = [textBlock('')];
        this.activityId = '';
        this.busy = false;
        this.pendingDeletes = new Set();
        this.persistedMediaIds = new Set();

        button.addEventListener('click', () => { if (!this.locked && !this.busy) picker.click(); });
        root.addEventListener('click', event => {
            if (event.target === root) this.focusText(this.blocks.length - 1);
        });
        picker.addEventListener('change', () => this.insertFiles([...picker.files]));
        this.render();
    }

    reset({ activityId, text, blocks } = {}) {
        this.generation = (this.generation || 0) + 1;
        this.status.textContent = '';
        clearAllLocalMedia();
        this.activityId = String(activityId || '');
        this.pendingDeletes.clear();

        const stored = Array.isArray(blocks) ? structuredClone(blocks) : null;
        const storedMatchesText = stored && reportText(stored) === String(text || '').trim();
        this.blocks = storedMatchesText ? stored : [textBlock(text)];

        this.persistedMediaIds = new Set(
            this.blocks
                .filter(block => block?.kind === 'media' && block.storage === 'r2')
                .map(block => block.id)
        );

        this.baseline = JSON.stringify(this.blocks);
        this.active = this.blocks.findIndex(block => block.kind === 'text');
        if (this.active < 0) this.active = 0;
        this.selection = null;
        this.input.value = text || '';
        this.render();
    }

    setLocked(locked) {
        this.locked = locked;
        this.root.inert = locked || this.busy;
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
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
    }

    get dirty() {
        return JSON.stringify(this.blocks) !== this.baseline;
    }

    sync() {
        this.input.value = reportText(this.blocks);
        this.input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    render(focusIndex) {
        this.root.replaceChildren();

        this.blocks.forEach((block, index) => {
            if (block.kind === 'text') {
                const area = document.createElement('div');
                area.contentEditable = 'plaintext-only';
                area.className = 'report-text-block';
                area.textContent = block.text;
                area.dataset.textIndex = index;
                area.dataset.placeholder = this.blocks.length === 1 ? 'Comece a escrever...' : '';
                area.setAttribute('role', 'textbox');
                area.setAttribute('aria-multiline', 'true');
                area.setAttribute('aria-label', 'Texto do relatório');

                const remember = () => {
                    const selection = window.getSelection();
                    if (!selection.rangeCount || !area.contains(selection.anchorNode) || !area.contains(selection.focusNode)) return;
                    const range = selection.getRangeAt(0);
                    const before = range.cloneRange();
                    before.selectNodeContents(area);
                    before.setEnd(range.startContainer, range.startOffset);
                    const after = range.cloneRange();
                    after.selectNodeContents(area);
                    after.setStart(range.endContainer, range.endOffset);
                    this.active = index;
                    this.selection = { index, before, after };
                };

                area.addEventListener('input', () => {
                    block.text = area.innerText.replace(/\r/g, '');
                    if (block.text === '\n') {
                        block.text = '';
                        area.replaceChildren();
                    }
                    remember();
                    this.sync();
                });

                ['focus', 'pointerup', 'keyup', 'blur'].forEach(event => area.addEventListener(event, remember));
                this.root.append(area);
                return;
            }

            const figure = document.createElement('figure');
            figure.className = 'report-media-block';
            figure.innerHTML = reportMarkup([block], this.activityId);

            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'report-media-remove';
            remove.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8"/></svg>';
            remove.title = 'Remover ' + block.name;
            remove.setAttribute('aria-label', 'Remover ' + block.name);

            remove.onclick = () => {
                if (block.storage === 'r2' && this.persistedMediaIds.has(block.id)) {
                    this.pendingDeletes.add(block.id);
                } else {
                    mediaStore.clearLocal(block.id);
                }

                this.blocks.splice(index, 1);
                if (this.blocks[index]?.kind === 'text' && this.blocks[index - 1]?.kind === 'text') {
                    this.blocks[index - 1].text += '\n' + this.blocks[index].text;
                    this.blocks.splice(index, 1);
                }

                this.active = this.blocks.findLastIndex(block => block.kind === 'text');
                this.selection = null;
                this.sync();
                this.render(this.active);
            };

            figure.append(remove);
            this.root.append(figure);
        });

        if (focusIndex !== undefined) this.focusText(focusIndex, 0);
    }

    async insertFiles(files) {
        if (!files.length || this.busy || this.locked) return;
        if (!this.activityId) {
            this.status.textContent = 'Abra uma visita válida antes de adicionar arquivos.';
            return;
        }

        const generation = this.generation;
        const activityId = this.activityId;
        const index = this.active || 0;
        const selection = this.selection;

        const fragmentText = range => {
            const container = document.createElement('div');
            container.style.cssText = 'position:fixed;left:-10000px;white-space:pre-wrap';
            container.append(range.cloneContents());
            document.body.append(container);
            const text = container.innerText;
            container.remove();
            return text;
        };

        const block = this.blocks[index];
        const before = selection?.index === index ? fragmentText(selection.before) : (block?.text || '');
        const after = selection?.index === index ? fragmentText(selection.after) : '';

        this.busy = true;
        this.button.disabled = true;
        this.root.inert = true;

        const stagedIds = [];
        try {
            if (files.some(file => !/^(image\/(jpeg|png|gif|webp|avif|heic|heif)|video\/|audio\/)/i.test(file.type))) {
                throw new Error('Selecione fotos, imagens, vídeos ou áudios compatíveis.');
            }
            if (files.some(file => file.size > 100 * 1024 * 1024)) {
                throw new Error('Cada arquivo deve ter até 100 MB.');
            }
            if (this.blocks.filter(block => block.kind === 'media').length + files.length > 20) {
                throw new Error('Adicione até 20 arquivos por relatório.');
            }

            const media = [];
            for (const file of files) {
                const id = crypto.randomUUID();
                const thumbnail = await createThumbnail(file);
                mediaStore.stage(id, file, thumbnail);
                stagedIds.push(id);
                media.push({
                    kind: 'media',
                    id,
                    name: file.name,
                    type: file.type,
                    size: file.size,
                    storage: 'pending'
                });
            }

            if (activityId !== this.activityId || generation !== this.generation) {
                stagedIds.forEach(id => mediaStore.clearLocal(id));
                return;
            }

            this.blocks.splice(index, 1, textBlock(before), ...media, textBlock(after));
            this.active = index + media.length + 1;
            this.selection = null;
            this.root.inert = false;
            this.sync();
            this.render(this.active);
            this.status.textContent = '';
        } catch (error) {
            stagedIds.forEach(id => mediaStore.clearLocal(id));
            this.status.textContent = error.message;
        } finally {
            this.busy = false;
            this.setLocked(Boolean(this.locked));
            this.picker.value = '';
        }
    }

    async prepareSave() {
        if (!this.activityId) throw new Error('Atividade do relatório não identificada.');
        if (this.busy) throw new Error('Aguarde o processamento dos arquivos.');

        const attempt = { uploaded: [], previous: [] };

        try {
            for (const block of this.blocks) {
                if (block.kind !== 'media' || block.storage === 'r2') continue;

                const local = mediaStore.local(block.id);
                if (!local?.file) throw new Error('Um arquivo adicionado não está mais disponível. Remova-o e adicione novamente.');

                attempt.previous.push({
                    id: block.id,
                    storage: block.storage,
                    key: block.key,
                    thumbnailKey: block.thumbnailKey
                });

                const stored = await mediaStore.upload(
                    this.activityId,
                    block.id,
                    local.file,
                    local.thumbnail
                );

                block.storage = 'r2';
                block.key = stored.key;
                if (stored.thumbnailKey) block.thumbnailKey = stored.thumbnailKey;
                else delete block.thumbnailKey;
                attempt.uploaded.push(block.id);
            }

            return {
                blocks: structuredClone(this.blocks),
                attempt
            };
        } catch (error) {
            await this.rollbackSave({ attempt });
            throw error;
        }
    }

    async rollbackSave(prepared) {
        const attempt = prepared?.attempt;
        if (!attempt) return;

        await Promise.allSettled(
            (attempt.uploaded || []).map(id => mediaStore.delete(this.activityId, id))
        );

        for (const previous of attempt.previous || []) {
            const block = this.blocks.find(item => item.kind === 'media' && item.id === previous.id);
            if (!block) continue;
            block.storage = previous.storage || 'pending';
            if (previous.key) block.key = previous.key; else delete block.key;
            if (previous.thumbnailKey) block.thumbnailKey = previous.thumbnailKey; else delete block.thumbnailKey;
        }
    }

    async commitSave(prepared) {
        const uploadedIds = prepared?.attempt?.uploaded || [];

        this.baseline = JSON.stringify(this.blocks);
        this.persistedMediaIds = new Set(
            this.blocks
                .filter(block => block?.kind === 'media' && block.storage === 'r2')
                .map(block => block.id)
        );

        uploadedIds.forEach(id => mediaStore.clearLocal(id));

        const deleting = [...this.pendingDeletes];
        this.pendingDeletes.clear();
        const results = await Promise.allSettled(
            deleting.map(id => mediaStore.delete(this.activityId, id))
        );

        const failed = results.filter(result => result.status === 'rejected').length;
        if (failed) throw new Error('O relatório foi salvo, mas ' + failed + ' arquivo(s) removido(s) não puderam ser apagados do armazenamento.');
    }

    serialize() {
        return structuredClone(this.blocks);
    }
}
