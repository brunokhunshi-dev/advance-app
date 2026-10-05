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
            const results = await Promise.allSettled(uploads);
            const failure = results.find(result => result.status === 'rejected');
            if (failure) throw failure.reason;

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

const IMAGE_TARGET_BYTES = 200 * 1024;
const IMAGE_MAX_OUTPUT_BYTES = 300 * 1024;
const IMAGE_MAX_SOURCE_BYTES = 25 * 1024 * 1024;
const IMAGE_MAX_DIMENSION = 1600;

const IMAGE_TYPES_BY_EXTENSION = Object.freeze({
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    avif: 'image/avif',
    heic: 'image/heic',
    heif: 'image/heif'
});

function imageExtension(name) {
    const match = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
    return match?.[1] || '';
}

function isSupportedImageFile(file) {
    if (!file) return false;
    if (String(file.type || '').toLowerCase().startsWith('image/')) return true;
    return Boolean(IMAGE_TYPES_BY_EXTENSION[imageExtension(file.name)]);
}

function normalizeImageFile(file) {
    if (!isSupportedImageFile(file)) return file;
    const currentType = String(file.type || '').toLowerCase();
    if (currentType.startsWith('image/')) return file;

    const inferredType = IMAGE_TYPES_BY_EXTENSION[imageExtension(file.name)];
    if (!inferredType) return file;

    return new File([file], file.name, {
        type: inferredType,
        lastModified: file.lastModified || Date.now()
    });
}

function webpName(name) {
    const base = String(name || 'imagem').replace(/\.[^.]+$/, '') || 'imagem';
    return base + '.webp';
}

async function imageElementSource(src, revoke) {
    const img = document.createElement('img');
    img.decoding = 'async';

    try {
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = src;
        });

        if (typeof img.decode === 'function') {
            try { await img.decode(); } catch {}
        }

        if (!img.naturalWidth || !img.naturalHeight) {
            throw new Error('Imagem sem dimensões válidas.');
        }

        return {
            width: img.naturalWidth,
            height: img.naturalHeight,
            draw(context, width, height) {
                context.drawImage(img, 0, 0, width, height);
            },
            close() {
                img.removeAttribute('src');
                if (revoke) URL.revokeObjectURL(src);
            }
        };
    } catch (error) {
        img.removeAttribute('src');
        if (revoke) URL.revokeObjectURL(src);
        throw error;
    }
}

function fileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error || new Error('Não foi possível ler a imagem.'));
        reader.readAsDataURL(file);
    });
}

async function decodeImage(file) {
    // 1) Caminho mais rápido em Chromium/Android e navegadores modernos.
    if (typeof createImageBitmap === 'function') {
        try {
            let bitmap;
            try {
                bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
            } catch {
                bitmap = await createImageBitmap(file);
            }

            if (bitmap?.width && bitmap?.height) {
                return {
                    width: bitmap.width,
                    height: bitmap.height,
                    draw(context, width, height) {
                        context.drawImage(bitmap, 0, 0, width, height);
                    },
                    close() { bitmap.close?.(); }
                };
            }
            bitmap?.close?.();
        } catch {}
    }

    // 2) Blob URL funciona melhor em Safari/iOS para vários JPEGs de câmera.
    const objectUrl = URL.createObjectURL(file);
    try {
        return await imageElementSource(objectUrl, true);
    } catch {}

    // 3) Último fallback para browsers/PWAs que falham ao decodificar o Blob URL.
    try {
        const dataUrl = await fileAsDataUrl(file);
        if (!dataUrl) throw new Error();
        return await imageElementSource(dataUrl, false);
    } catch {
        throw new Error('Não foi possível abrir esta imagem. Tente outra foto JPG/PNG ou tire a foto diretamente pelo app.');
    }
}

function canvasBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => {
        canvas.toBlob(blob => {
            if (!blob) return reject(new Error('Não foi possível comprimir a imagem.'));
            resolve(blob);
        }, type, quality);
    });
}

export async function compressImage(inputFile) {
    if (!isSupportedImageFile(inputFile)) throw new Error('Somente imagens compatíveis são permitidas.');
    const file = normalizeImageFile(inputFile);
    if (file.size > IMAGE_MAX_SOURCE_BYTES) throw new Error('A imagem original deve ter no máximo 25 MB.');

    const source = await decodeImage(file);
    try {
        if (!source.width || !source.height) throw new Error('A imagem não possui dimensões válidas.');

        let scale = Math.min(1, IMAGE_MAX_DIMENSION / Math.max(source.width, source.height));
        let width = Math.max(1, Math.round(source.width * scale));
        let height = Math.max(1, Math.round(source.height * scale));
        let best = null;
        let bestWidth = width, bestHeight = height;

        // Primeiro reduz qualidade; se a foto continuar muito detalhada, reduz
        // levemente a resolução até ficar próxima do alvo de ~200 KB.
        for (let resizePass = 0; resizePass < 5; resizePass++) {
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const context = canvas.getContext('2d', { alpha: false });
            if (!context) throw new Error('O navegador não conseguiu processar a imagem.');

            context.fillStyle = '#ffffff';
            context.fillRect(0, 0, width, height);
            source.draw(context, width, height);

            for (const quality of [0.82, 0.76, 0.70, 0.64, 0.58]) {
                const blob = await canvasBlob(canvas, 'image/webp', quality);
                if (!best || blob.size < best.size) {
                    best = blob; bestWidth = width; bestHeight = height;
                }
                if (blob.size <= IMAGE_TARGET_BYTES) {
                    const compressed = new File([blob], webpName(file.name), {
                        type: blob.type || 'image/webp',
                        lastModified: Date.now()
                    });
                    return {
                        file: compressed,
                        originalName: file.name,
                        originalSize: file.size,
                        width,
                        height
                    };
                }
            }

            if (best?.size <= IMAGE_MAX_OUTPUT_BYTES) break;
            width = Math.max(1, Math.round(width * 0.86));
            height = Math.max(1, Math.round(height * 0.86));
        }

        if (!best || best.size > IMAGE_MAX_OUTPUT_BYTES) throw new Error('Não foi possível reduzir a imagem para 300 KB. Tente outra foto.');

        const compressed = new File([best], webpName(file.name), {
            type: best.type || 'image/webp',
            lastModified: Date.now()
        });

        return {
            file: compressed,
            originalName: file.name,
            originalSize: file.size,
            width: bestWidth,
            height: bestHeight
        };
    } finally {
        source.close?.();
    }
}

// Only this 96px compressed image is decoded in the report.
export async function createThumbnail(file) {
    if (!file?.type?.startsWith('image/')) return null;
    const source = await decodeImage(file);
    try {
        if (!source.width || !source.height) return null;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 96;
        const context = canvas.getContext('2d');
        if (!context) return null;
        // Central crop directly into 96px: no full-resolution proxy canvases.
        const scale = Math.max(96 / source.width, 96 / source.height);
        const width = source.width * scale, height = source.height * scale;
        context.fillStyle = '#edf0f5';
        context.fillRect(0, 0, 96, 96);
        context.translate((96 - width) / 2, (96 - height) / 2);
        source.draw(context, width, height);
        return await canvasBlob(canvas, 'image/jpeg', 0.32);
    } finally {
        source.close?.();
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
    const observer = new MutationObserver(records => {
        const roots = new Set();
        for (const record of records) {
            for (const node of record.addedNodes) {
                if (node.nodeType !== 1) continue;
                // Include the parent so a newly added media button is hydrated too.
                if (node.matches('[data-report-media]') || node.querySelector('[data-report-media]')) {
                    roots.add(node.parentElement || node);
                }
            }
        }
        for (const root of roots) hydrate(root);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    hydrate(document);
    return () => observer.disconnect();
}

export class TechnicalReportEditor {
    constructor(root, input, button, picker, status, cameraPicker = null) {
        Object.assign(this, { root, input, button, picker, status, cameraPicker });
        this.blocks = [textBlock('')];
        this.activityId = '';
        this.busy = false;
        this.pendingDeletes = new Set();
        this.persistedMediaIds = new Set();

        button.addEventListener('click', () => {
            if (this.locked || this.busy) return;
            this.openSourceChooser();
        });

        root.addEventListener('click', event => {
            if (event.target === root) this.focusText(this.blocks.length - 1);
        });

        picker.addEventListener('change', () => this.insertFiles([...picker.files]));
        cameraPicker?.addEventListener('change', () => this.insertFiles([...cameraPicker.files]));
        this.render();
    }

    openSourceChooser() {
        const mobileLike =
            window.matchMedia?.('(pointer: coarse)').matches ||
            /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

        if (!this.cameraPicker || !mobileLike) {
            this.picker.click();
            return;
        }

        let dialog = document.querySelector('.report-media-source-dialog');
        if (!dialog) {
            dialog = document.createElement('dialog');
            dialog.className = 'report-media-source-dialog';

            const title = document.createElement('strong');
            title.textContent = 'Adicionar imagem';

            const camera = document.createElement('button');
            camera.type = 'button';
            camera.className = 'report-media-source-action';
            camera.innerHTML = '<span aria-hidden="true">📷</span><span>Tirar foto</span>';

            const gallery = document.createElement('button');
            gallery.type = 'button';
            gallery.className = 'report-media-source-action';
            gallery.innerHTML = '<span aria-hidden="true">▧</span><span>Escolher da galeria</span>';

            const cancel = document.createElement('button');
            cancel.type = 'button';
            cancel.className = 'report-media-source-cancel';
            cancel.textContent = 'Cancelar';

            dialog.append(title, camera, gallery, cancel);
            document.body.append(dialog);

            camera.addEventListener('click', () => {
                dialog.close();
                this.cameraPicker?.click();
            });
            gallery.addEventListener('click', () => {
                dialog.close();
                this.picker.click();
            });
            cancel.addEventListener('click', () => dialog.close());
            dialog.addEventListener('click', event => {
                if (event.target === dialog) dialog.close();
            });
        }

        dialog.showModal();
    }

    reset({ activityId, text, blocks, preserveLocal = false } = {}) {
        this.generation = (this.generation || 0) + 1;
        this.status.textContent = '';
        if (!preserveLocal) clearAllLocalMedia();
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
        if (!area || area.classList.contains('report-text-block-media-gap')) return;
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

                const previousBlock = this.blocks[index - 1];
                const nextBlock = this.blocks[index + 1];
                if (
                    !String(block.text || '').trim() &&
                    previousBlock?.kind === 'media' &&
                    nextBlock?.kind === 'media'
                ) {
                    area.classList.add('report-text-block-media-gap');
                    area.setAttribute('aria-hidden', 'true');
                    area.tabIndex = -1;
                }
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
            if (files.some(file => !isSupportedImageFile(file))) {
                throw new Error('Por enquanto, somente imagens JPG, PNG, WebP, HEIC, HEIF ou AVIF são permitidas.');
            }
            if (files.some(file => file.size > IMAGE_MAX_SOURCE_BYTES)) {
                throw new Error('Cada imagem original deve ter no máximo 25 MB.');
            }
            if (this.blocks.filter(block => block.kind === 'media').length + files.length > 20) {
                throw new Error('Adicione até 20 arquivos por relatório.');
            }

            const media = [];
            for (const sourceFile of files) {
                this.status.textContent = 'Comprimindo imagem...';
                const compressed = await compressImage(sourceFile);
                const file = compressed.file;
                const id = crypto.randomUUID();
                const thumbnail = await createThumbnail(file);

                mediaStore.stage(id, file, thumbnail);
                stagedIds.push(id);
                media.push({
                    kind: 'media',
                    id,
                    name: file.name,
                    originalName: compressed.originalName,
                    type: file.type,
                    size: file.size,
                    originalSize: compressed.originalSize,
                    width: compressed.width,
                    height: compressed.height,
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
            if (this.cameraPicker) this.cameraPicker.value = '';
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
