import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js";
import {
    getAuth,
    getIdTokenResult,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signOut
} from "https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js";
import {
    collection,
    doc,
    getDoc,
    getDocs,
    getFirestore,
    getAggregateFromServer,
    count,
    sum,
    limit as queryLimit,
    orderBy,
    query,
    runTransaction,
    startAfter,
    where,
    writeBatch
} from "https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js";
import { firebaseConfig } from "../firebase-config.js";

const MEDIA_API = "https://advance-media-api.brunokhunshi.workers.dev";
const PAGE_SIZE = 48;
const STORAGE_REFERENCE_BYTES = 10 * 1024 * 1024 * 1024;
const REPORT_COLLECTIONS = [
    "relatorios",
    "relatorios_comerciais",
    "relatorios_treinamentos",
    "relatorios_assistencia_tecnica"
];

const CONFIG = Object.freeze({
    administratorEmails: ["eric.lima@advancetintas.com.br"],
    managementTerms: [
        "admin", "administrador", "diretor", "diretora", "gerente",
        "gestor", "gestora", "coordenador", "coordenadora",
        "supervisor", "supervisora"
    ],
    collections: Object.freeze({
        promoters: "promotores",
        technicalAssistance: "assistencia",
        managers: "gestores",
        administrators: "administradores"
    })
});

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const $ = id => document.getElementById(id);

const state = {
    profile: null,
    canSeeAll: false,
    items: [],
    cursor: null,
    hasMore: true,
    loading: false,
    viewerItem: null,
    thumbQueue: new Map(),
    thumbTimer: null,
    observer: null,
    toastTimer: null,
    storageStats: null
};

function safeString(value, fallback = "") {
    const text = String(value ?? "").trim();
    return text || fallback;
}

function normalizeText(value) {
    return safeString(value)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
}

function firstAvailable(source, keys, fallback = "") {
    for (const key of keys) {
        const value = source?.[key];
        if (value !== undefined && value !== null && safeString(value)) return value;
    }
    return fallback;
}

function normalizeProfessional(data, id, sourceCollection) {
    const fallbackRole =
        sourceCollection === CONFIG.collections.administrators ? "Administrador" :
        sourceCollection === CONFIG.collections.managers ? "Gestão" :
        sourceCollection === CONFIG.collections.technicalAssistance ? "Assistência Técnica" :
        "Promotor Técnico de Vendas";

    return {
        id,
        sourceCollection,
        raw: data || {},
        name: safeString(firstAvailable(data, ["nome", "name", "nomeCompleto"], "Profissional")),
        email: safeString(firstAvailable(data, ["email", "eMail"])),
        role: safeString(firstAvailable(data, ["cargo", "funcao", "perfil", "tipo", "role"], fallbackRole))
    };
}

function toDate(value) {
    if (!value) return null;
    if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
    if (typeof value.toDate === "function") {
        const date = value.toDate();
        return Number.isFinite(date.getTime()) ? date : null;
    }
    if (typeof value.seconds === "number") {
        const date = new Date(value.seconds * 1000);
        return Number.isFinite(date.getTime()) ? date : null;
    }
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
}

function formatDateTime(value) {
    const date = toDate(value);
    if (!date) return "Data não informada";
    return new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "America/Sao_Paulo"
    }).format(date);
}

function formatBytes(bytes) {
    const value = Number(bytes) || 0;
    if (value < 1024) return `${value} B`;
    if (value < 1024 ** 2) return `${(value / 1024).toFixed(value < 100 * 1024 ? 1 : 0)} KB`;
    if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(value < 100 * 1024 ** 2 ? 1 : 0)} MB`;
    return `${(value / 1024 ** 3).toFixed(2)} GB`;
}

function percent(value) {
    return `${Math.max(0, Math.min(100, Number(value) || 0)).toFixed(1).replace(".0", "")}%`;
}

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[character]));
}

function setLoading(visible, text = "Carregando mídias...") {
    state.loading = visible;
    $("media-loading").hidden = !visible;
    $("media-loading-text").textContent = text;
    $("media-btn-atualizar").disabled = visible;
    $("media-btn-indexar").disabled = visible;
    $("media-btn-mais").disabled = visible;
}

function setSync(type, message) {
    $("media-sync-dot").className = `sync-dot ${type ? `is-${type}` : ""}`.trim();
    $("media-sync-text").textContent = message;
}

function showToast(message, type = "") {
    clearTimeout(state.toastTimer);
    const toast = $("media-toast");
    toast.textContent = message;
    toast.className = `toast ${type ? `is-${type}` : ""}`.trim();
    toast.hidden = false;
    state.toastTimer = setTimeout(() => { toast.hidden = true; }, 4500);
}

function showLoginError(message) {
    const box = $("media-login-erro");
    box.textContent = message;
    box.hidden = false;
}

function clearLoginError() {
    $("media-login-erro").hidden = true;
}

async function safeGetProfileFromCollection(collectionName, user) {
    try {
        const byUid = await getDoc(doc(db, collectionName, user.uid));
        if (byUid.exists()) return normalizeProfessional(byUid.data(), byUid.id, collectionName);
    } catch (error) {
        if (error?.code !== "permission-denied") console.warn(error);
    }

    try {
        const byEmail = await getDocs(query(
            collection(db, collectionName),
            where("email", "==", user.email || "")
        ));
        if (!byEmail.empty) {
            const snap = byEmail.docs[0];
            return normalizeProfessional(snap.data(), snap.id, collectionName);
        }
    } catch (error) {
        if (error?.code !== "permission-denied") console.warn(error);
    }

    return null;
}

async function resolveUserAccess(user) {
    let claims = {};
    try {
        claims = (await getIdTokenResult(user)).claims || {};
    } catch (error) {
        console.warn("Claims indisponíveis:", error);
    }

    const order = [
        CONFIG.collections.administrators,
        CONFIG.collections.managers,
        CONFIG.collections.technicalAssistance,
        CONFIG.collections.promoters
    ];

    let profile = null;
    for (const collectionName of order) {
        profile = await safeGetProfileFromCollection(collectionName, user);
        if (profile) break;
    }

    const email = normalizeText(user.email);
    const allowlisted = CONFIG.administratorEmails.some(item => normalizeText(item) === email);

    if (!profile && allowlisted) {
        profile = normalizeProfessional({
            nome: user.displayName || "Gestor",
            email: user.email,
            cargo: "Gestão"
        }, user.uid, CONFIG.collections.managers);
    }

    if (!profile) throw new Error("O usuário autenticado não foi localizado nas coleções do Advance.");

    const managementText = normalizeText([
        profile.role,
        profile.raw?.cargo,
        profile.raw?.perfil,
        profile.raw?.tipoAcesso,
        claims.role,
        claims.perfil,
        claims.cargo
    ].filter(Boolean).join(" "));

    const managementRole = CONFIG.managementTerms.some(term => managementText.includes(normalizeText(term)));
    const managementCollection = [
        CONFIG.collections.administrators,
        CONFIG.collections.managers
    ].includes(profile.sourceCollection);
    const claimAccess = claims.admin === true || claims.gestor === true || claims.manager === true;

    return {
        profile,
        canSeeAll: allowlisted || managementRole || managementCollection || claimAccess
    };
}

async function mediaApi(path, body = {}) {
    if (!auth.currentUser) throw new Error("Entre novamente para acessar as mídias.");
    const token = await auth.currentUser.getIdToken();
    const response = await fetch(MEDIA_API + path, {
        method: "POST",
        headers: {
            "Authorization": "Bearer " + token,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
    });

    let data = null;
    try { data = await response.json(); } catch {}
    if (!response.ok) throw new Error(data?.error || `Falha no serviço de mídias (HTTP ${response.status}).`);
    return data || {};
}

function normalizeMediaDocument(snapshot) {
    const data = snapshot.data() || {};
    return {
        id: snapshot.id,
        mediaId: data.mediaId || snapshot.id,
        activityId: safeString(data.activityId),
        reportId: safeString(data.reportId),
        reportCollection: safeString(data.reportCollection),
        reportCode: safeString(data.reportCode),
        clienteId: safeString(data.clienteId),
        clienteNome: safeString(data.clienteNome),
        ptvId: safeString(data.ptvId),
        ptvNome: safeString(data.ptvNome),
        tipoVisita: safeString(data.tipoVisita),
        name: safeString(data.name, "imagem.webp"),
        originalName: safeString(data.originalName, data.name || "imagem"),
        type: safeString(data.type, "image/webp"),
        size: Number(data.size) || 0,
        originalSize: Number(data.originalSize) || 0,
        thumbnailSize: Number(data.thumbnailSize) || 0,
        width: Number(data.width) || 0,
        height: Number(data.height) || 0,
        key: safeString(data.key),
        thumbnailKey: safeString(data.thumbnailKey),
        criadoEm: data.criadoEm || data.atualizadoEm || null,
        ativo: data.ativo !== false
    };
}

function itemSearchText(item) {
    return normalizeText([
        item.clienteNome,
        item.clienteId,
        item.ptvNome,
        item.ptvId,
        item.originalName,
        item.name,
        item.reportCode,
        item.tipoVisita
    ].join(" "));
}

function currentVisibleItems() {
    const term = normalizeText($("media-search").value);
    return state.items.filter(item => item.ativo && (!term || itemSearchText(item).includes(term)));
}

function updateCatalogSummary(items) {
    const active = state.items.filter(item => item.ativo);
    if (!state.storageStats) $("media-count").textContent = new Intl.NumberFormat("pt-BR").format(active.length);

    const withSize = active.filter(item => item.size > 0);
    const average = withSize.length
        ? withSize.reduce((sum, item) => sum + item.size, 0) / withSize.length
        : 0;
    $("media-average").textContent = average ? formatBytes(average) : "--";

    const withOriginal = active.filter(item => item.originalSize > 0 && item.size > 0);
    if (!withOriginal.length) {
        $("media-savings").textContent = "--";
    } else {
        const source = withOriginal.reduce((sum, item) => sum + item.originalSize, 0);
        const compressed = withOriginal.reduce((sum, item) => sum + item.size, 0);
        $("media-savings").textContent = percent(source ? ((source - compressed) / source) * 100 : 0);
    }
}

function cardMarkup(item) {
    const client = item.clienteNome || item.clienteId || "Cliente não informado";
    const professional = item.ptvNome || item.ptvId || "Profissional não informado";
    return `
        <article class="media-card" data-media-card="${escapeHtml(item.mediaId)}">
            <button class="media-card-preview" type="button" data-open-media="${escapeHtml(item.mediaId)}" aria-label="Abrir ${escapeHtml(item.originalName)}">
                <span class="media-card-placeholder">Carregando prévia...</span>
                <img alt="" loading="lazy" hidden>
            </button>
            <div class="media-card-info">
                <strong title="${escapeHtml(client)}">${escapeHtml(client)}</strong>
                <span title="${escapeHtml(professional)}">${escapeHtml(professional)}</span>
                <small>${escapeHtml(formatBytes(item.size))} · ${escapeHtml(formatDateTime(item.criadoEm))}</small>
            </div>
        </article>
    `;
}

function renderGrid() {
    const items = currentVisibleItems();
    $("media-grid").innerHTML = items.map(cardMarkup).join("");
    $("media-empty").hidden = items.length > 0 || state.hasMore;
    $("media-btn-mais").hidden = !state.hasMore;

    $("media-grid").querySelectorAll("[data-open-media]").forEach(button => {
        const item = state.items.find(entry => entry.mediaId === button.dataset.openMedia);
        if (!item) return;
        button.addEventListener("click", () => openViewer(item));

        const card = button.closest(".media-card");
        queueThumbnail(card, item);
    });

    updateCatalogSummary(items);
}

function ensureThumbObserver() {
    if (state.observer || !("IntersectionObserver" in window)) return;
    state.observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            state.observer.unobserve(entry.target);
            const item = state.items.find(candidate => candidate.mediaId === entry.target.dataset.thumbMedia);
            if (item) enqueueThumbnail(entry.target, item);
        });
    }, { rootMargin: "320px 0px" });
}

function queueThumbnail(card, item) {
    if (!card) return;
    ensureThumbObserver();
    card.dataset.thumbMedia = item.mediaId;
    if (state.observer) state.observer.observe(card);
    else enqueueThumbnail(card, item);
}

function enqueueThumbnail(card, item) {
    state.thumbQueue.set(item.mediaId, { card, item });
    clearTimeout(state.thumbTimer);
    state.thumbTimer = setTimeout(flushThumbnailQueue, 70);
}

async function flushThumbnailQueue() {
    const entries = [...state.thumbQueue.values()].slice(0, 24);
    entries.forEach(entry => state.thumbQueue.delete(entry.item.mediaId));
    if (!entries.length) return;

    const valid = entries.filter(entry => entry.item.activityId);
    if (!valid.length) return;

    try {
        const result = await mediaApi("/v1/media/read-urls", {
            items: valid.map(entry => ({
                activityId: entry.item.activityId,
                mediaId: entry.item.mediaId,
                variant: "thumbnail"
            }))
        });
        const urls = new Map((result.items || []).map(item => [item.mediaId, item.url]));
        valid.forEach(entry => applyThumbnail(entry.card, urls.get(entry.item.mediaId)));
    } catch (batchError) {
        const fallback = await Promise.allSettled(valid.map(async entry => {
            const result = await mediaApi("/v1/media/read-url", {
                activityId: entry.item.activityId,
                mediaId: entry.item.mediaId,
                variant: "thumbnail"
            });
            return { entry, url: result.url };
        }));

        fallback.forEach((result, index) => {
            if (result.status === "fulfilled") {
                applyThumbnail(result.value.entry.card, result.value.url);
            } else {
                const card = valid[index]?.card;
                const placeholder = card?.querySelector(".media-card-placeholder");
                if (placeholder) placeholder.textContent = "Prévia indisponível";
            }
        });
    }

    if (state.thumbQueue.size) {
        clearTimeout(state.thumbTimer);
        state.thumbTimer = setTimeout(flushThumbnailQueue, 70);
    }
}

function applyThumbnail(card, url) {
    if (!card || !url) return;
    const button = card.querySelector(".media-card-preview");
    const img = card.querySelector("img");
    if (!button || !img) return;

    img.onload = () => {
        img.hidden = false;
        button.classList.add("is-ready");
    };
    img.onerror = () => {
        button.querySelector(".media-card-placeholder").textContent = "Prévia indisponível";
    };
    img.src = url;
}

async function loadStorageStats() {
    try {
        const mediaCollection = collection(db, "media_index");

        // Cada agregação usa apenas um campo. Isso aproveita os índices simples
        // automáticos do Firestore e evita exigir um índice composto apenas
        // para montar o resumo de armazenamento.
        const [
            countSnapshot,
            sizeSnapshot,
            thumbnailSnapshot,
            originalSnapshot
        ] = await Promise.all([
            getAggregateFromServer(mediaCollection, {
                imageCount: count()
            }),
            getAggregateFromServer(mediaCollection, {
                imageBytes: sum("size")
            }),
            getAggregateFromServer(mediaCollection, {
                thumbnailBytes: sum("thumbnailSize")
            }),
            getAggregateFromServer(mediaCollection, {
                originalBytes: sum("originalSize")
            })
        ]);

        const imageCount = Number(countSnapshot.data()?.imageCount) || 0;
        const imageBytes = Number(sizeSnapshot.data()?.imageBytes) || 0;
        const thumbnailBytes = Number(thumbnailSnapshot.data()?.thumbnailBytes) || 0;
        const originalBytes = Number(originalSnapshot.data()?.originalBytes) || 0;
        const totalBytes = imageBytes + thumbnailBytes;
        const pct = STORAGE_REFERENCE_BYTES
            ? (totalBytes / STORAGE_REFERENCE_BYTES) * 100
            : 0;

        state.storageStats = {
            totalBytes,
            imageCount,
            imageBytes,
            thumbnailBytes,
            originalBytes
        };

        $("media-storage-used").textContent = formatBytes(totalBytes);
        $("media-storage-percent").textContent = percent(pct);
        $("media-storage-bar").style.width = `${Math.min(100, Math.max(0, pct))}%`;
        $("media-storage-originals").textContent =
            `${new Intl.NumberFormat("pt-BR").format(imageCount)} imagens`;
        $("media-storage-objects").textContent =
            `${new Intl.NumberFormat("pt-BR").format(imageCount * 2)} arquivos catalogados`;
        $("media-storage-cache").textContent = "Calculado pelo índice do Firestore";
        $("media-count").textContent =
            new Intl.NumberFormat("pt-BR").format(imageCount);

        if (imageCount > 0) {
            $("media-average").textContent = formatBytes(imageBytes / imageCount);
        } else {
            $("media-average").textContent = "--";
        }

        if (originalBytes > 0) {
            const savings = ((originalBytes - imageBytes) / originalBytes) * 100;
            $("media-savings").textContent = percent(savings);
        } else {
            $("media-savings").textContent = "--";
        }

        return true;
    } catch (error) {
        console.warn("Estatísticas de armazenamento indisponíveis:", error);
        $("media-storage-cache").textContent = "Resumo temporariamente indisponível";
        $("media-storage-used").textContent = "--";
        $("media-storage-percent").textContent = "--%";
        $("media-storage-bar").style.width = "0%";
        // Estatísticas são complementares: nunca devem impedir a entrada
        // no gerenciador nem encerrar a sessão do usuário.
        return false;
    }
}

async function loadCatalog({ reset = false } = {}) {
    if (state.loading || (!reset && !state.hasMore)) return;
    setLoading(true, reset ? "Carregando biblioteca..." : "Carregando mais imagens...");

    try {
        let mediaQuery = query(
            collection(db, "media_index"),
            orderBy("criadoEm", "desc"),
            queryLimit(PAGE_SIZE)
        );
        if (!reset && state.cursor) {
            mediaQuery = query(
                collection(db, "media_index"),
                orderBy("criadoEm", "desc"),
                startAfter(state.cursor),
                queryLimit(PAGE_SIZE)
            );
        }

        const snapshot = await getDocs(mediaQuery);
        const page = snapshot.docs.map(normalizeMediaDocument);
        if (reset) state.items = page;
        else {
            const map = new Map(state.items.map(item => [item.mediaId, item]));
            page.forEach(item => map.set(item.mediaId, item));
            state.items = [...map.values()];
        }

        state.cursor = snapshot.docs.at(-1) || null;
        state.hasMore = snapshot.docs.length === PAGE_SIZE;
        renderGrid();
        setSync("success", `Biblioteca atualizada · ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`);
    } catch (error) {
        console.error(error);
        setSync("error", "Falha ao carregar biblioteca");
        showToast(error?.code === "permission-denied"
            ? "Sem permissão para ler media_index no Firestore."
            : "Não foi possível carregar o catálogo de mídias.", "error");
    } finally {
        setLoading(false);
    }
}

function viewerMetaMarkup(item) {
    const rows = [
        ["Cliente", item.clienteNome || item.clienteId || "Não informado"],
        ["Profissional", item.ptvNome || item.ptvId || "Não informado"],
        ["Visita", item.tipoVisita || "Não informado"],
        ["Relatório", item.reportCode || item.reportId || "Não informado"],
        ["Arquivo original", item.originalName || item.name],
        ["Comprimido", formatBytes(item.size)],
        ["Antes da compressão", item.originalSize ? formatBytes(item.originalSize) : "Não informado"],
        ["Dimensões", item.width && item.height ? `${item.width} × ${item.height}px` : "Não informado"],
        ["Criado em", formatDateTime(item.criadoEm)]
    ];

    return rows.map(([label, value]) => `
        <div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>
    `).join("");
}

async function openViewer(item) {
    state.viewerItem = item;
    $("media-viewer-title").textContent = item.originalName || item.name;
    $("media-viewer-meta").innerHTML = viewerMetaMarkup(item);
    $("media-viewer-image").hidden = true;
    $("media-viewer-image").removeAttribute("src");
    $("media-viewer-loading").hidden = false;
    $("media-viewer-download").href = "#";
    $("media-viewer").showModal();

    try {
        const result = await mediaApi("/v1/media/read-url", {
            activityId: item.activityId,
            mediaId: item.mediaId,
            variant: "original"
        });
        if (state.viewerItem?.mediaId !== item.mediaId) return;
        const img = $("media-viewer-image");
        img.onload = () => {
            $("media-viewer-loading").hidden = true;
            img.hidden = false;
        };
        img.onerror = () => {
            $("media-viewer-loading").textContent = "Não foi possível exibir esta imagem.";
        };
        img.alt = item.originalName || "Imagem do relatório";
        img.src = result.url;
        $("media-viewer-download").href = result.url;
    } catch (error) {
        $("media-viewer-loading").textContent = error.message || "Não foi possível abrir a imagem.";
    }
}

async function deleteCurrentMedia() {
    const item = state.viewerItem;
    if (!item) return;

    $("media-confirm").close();
    setLoading(true, "Excluindo mídia...");

    let firestoreUpdated = false;
    try {
        await runTransaction(db, async tx => {
            const indexRef = doc(db, "media_index", item.mediaId);
            let reportRef = null;
            let reportSnap = null;

            if (item.reportCollection && item.reportId) {
                reportRef = doc(db, item.reportCollection, item.reportId);
                reportSnap = await tx.get(reportRef);
            }

            if (reportSnap?.exists()) {
                const report = reportSnap.data() || {};
                const content = report.conteudoRelatorio || {};
                const blocks = Array.isArray(content.blocos) ? content.blocos : [];
                const filtered = blocks.filter(block => !(block?.kind === "media" && block.id === item.mediaId));

                tx.update(reportRef, {
                    conteudoRelatorio: {
                        ...content,
                        versao: Number(content.versao) || 1,
                        blocos: filtered
                    },
                    atualizadoEm: new Date()
                });
            }

            tx.delete(indexRef);
        });

        firestoreUpdated = true;

        await mediaApi("/v1/media/delete", {
            activityId: item.activityId,
            mediaId: item.mediaId
        });

        item.ativo = false;
        $("media-viewer").close();
        state.viewerItem = null;
        renderGrid();
        await loadStorageStats();
        showToast("Imagem excluída do relatório e do R2.", "success");
    } catch (error) {
        console.error(error);
        if (firestoreUpdated) {
            item.ativo = false;
            renderGrid();
            $("media-viewer").close();
            showToast("A imagem saiu do relatório, mas o R2 não confirmou a exclusão. Faça uma auditoria do bucket.", "error");
        } else {
            showToast(error?.code === "permission-denied"
                ? "Seu usuário não possui permissão para excluir esta mídia."
                : (error.message || "Não foi possível excluir a mídia."), "error");
        }
    } finally {
        setLoading(false);
    }
}

async function commitBatches(operations) {
    for (let offset = 0; offset < operations.length; offset += 400) {
        const batch = writeBatch(db);
        operations.slice(offset, offset + 400).forEach(operation => {
            batch.set(operation.ref, operation.data, { merge: true });
        });
        await batch.commit();
    }
}

async function backfillExistingMedia() {
    if (!confirm("Esta ação fará uma leitura única das coleções de relatórios para catalogar mídias antigas. Continuar?")) return;

    setLoading(true, "Indexando mídias já existentes...");
    try {
        const snapshots = await Promise.all(
            REPORT_COLLECTIONS.map(name => getDocs(collection(db, name)))
        );

        const operations = [];
        snapshots.forEach((snapshot, collectionIndex) => {
            const reportCollection = REPORT_COLLECTIONS[collectionIndex];
            snapshot.docs.forEach(reportSnap => {
                const report = reportSnap.data() || {};
                const content = report.conteudoRelatorio || {};
                const blocks = Array.isArray(content.blocos) ? content.blocos : [];

                blocks
                    .filter(block => block?.kind === "media" && block.id && block.storage === "r2")
                    .forEach(block => {
                        const created = toDate(block.createdAt) || toDate(report.atualizadoEm) || toDate(report.criadoEm) || new Date();
                        operations.push({
                            ref: doc(db, "media_index", block.id),
                            data: {
                                mediaId: block.id,
                                activityId: safeString(report.atividadeId),
                                reportId: reportSnap.id,
                                reportCollection,
                                reportCode: safeString(report.codigo),
                                clienteId: safeString(report.clienteId),
                                clienteNome: safeString(report.clienteNome),
                                ptvId: safeString(report.ptvId),
                                ptvNome: safeString(report.ptvNome),
                                tipoVisita: safeString(report.tipoVisita),
                                name: safeString(block.name, "imagem.webp"),
                                originalName: safeString(block.originalName, block.name || "imagem"),
                                type: safeString(block.type, "image/webp"),
                                size: Number(block.size) || 0,
                                originalSize: Number(block.originalSize) || 0,
                                width: Number(block.width) || 0,
                                height: Number(block.height) || 0,
                                key: safeString(block.key),
                                thumbnailKey: safeString(block.thumbnailKey),
                                thumbnailSize: Number(block.thumbnailSize) || 0,
                                criadoEm: created,
                                atualizadoEm: new Date(),
                                ativo: true,
                                catalogVersion: 1
                            }
                        });
                    });
            });
        });

        if (!operations.length) {
            showToast("Nenhuma mídia antiga foi encontrada nos relatórios.");
            return;
        }

        await commitBatches(operations);
        state.cursor = null;
        state.hasMore = true;
        setLoading(false);
        await loadCatalog({ reset: true });
        showToast(`${operations.length} mídia(s) catalogada(s).`, "success");
    } catch (error) {
        console.error(error);
        showToast(error?.code === "permission-denied"
            ? "Sem permissão para criar o índice de mídias no Firestore."
            : "Não foi possível indexar as mídias existentes.", "error");
    } finally {
        setLoading(false);
    }
}

function showLogin() {
    $("media-login").hidden = false;
    $("media-shell").hidden = true;
    $("media-btn-entrar").disabled = false;
    $("media-btn-entrar").textContent = "Entrar";
}

function showManager() {
    $("media-login").hidden = true;
    $("media-shell").hidden = false;
}

$("media-login-form").addEventListener("submit", async event => {
    event.preventDefault();
    clearLoginError();
    const email = $("media-email").value.trim();
    const password = $("media-senha").value;
    if (!email || !password) return showLoginError("Informe e-mail e senha.");

    $("media-btn-entrar").disabled = true;
    $("media-btn-entrar").textContent = "Entrando...";
    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        showLoginError(error?.code === "auth/invalid-credential" ? "E-mail ou senha inválidos." : (error.message || "Não foi possível entrar."));
        $("media-btn-entrar").disabled = false;
        $("media-btn-entrar").textContent = "Entrar";
    }
});

$("media-btn-sair").addEventListener("click", () => signOut(auth));
$("media-btn-atualizar").addEventListener("click", async () => {
    state.cursor = null;
    state.hasMore = true;
    await Promise.all([loadCatalog({ reset: true }), loadStorageStats()]);
});
$("media-btn-mais").addEventListener("click", () => loadCatalog());
$("media-btn-indexar").addEventListener("click", backfillExistingMedia);
$("media-search").addEventListener("input", renderGrid);
$("media-viewer-close").addEventListener("click", () => $("media-viewer").close());
$("media-viewer-delete").addEventListener("click", () => $("media-confirm").showModal());
$("media-confirm-cancel").addEventListener("click", () => $("media-confirm").close());
$("media-confirm-delete").addEventListener("click", deleteCurrentMedia);

$("media-viewer").addEventListener("click", event => {
    if (event.target === $("media-viewer")) $("media-viewer").close();
});
$("media-confirm").addEventListener("click", event => {
    if (event.target === $("media-confirm")) $("media-confirm").close();
});

onAuthStateChanged(auth, async user => {
    if (!user) {
        state.profile = null;
        state.canSeeAll = false;
        state.items = [];
        state.cursor = null;
        state.hasMore = true;
        showLogin();
        return;
    }

    setSync("loading", "Validando acesso...");
    try {
        const access = await resolveUserAccess(user);
        if (!access.canSeeAll) {
            await signOut(auth);
            showLoginError("O gerenciador de mídias é restrito aos perfis de gestão.");
            return;
        }

        state.profile = access.profile;
        state.canSeeAll = true;
        $("media-user-name").textContent = access.profile.name;
        $("media-user-role").textContent = access.profile.role || "Gestão";
        showManager();

        state.cursor = null;
        state.hasMore = true;
        await Promise.all([
            loadCatalog({ reset: true }),
            loadStorageStats()
        ]);
    } catch (error) {
        console.error(error);
        await signOut(auth);
        showLoginError(error.message || "Não foi possível validar o acesso.");
    }
});
