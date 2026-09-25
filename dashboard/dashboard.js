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
    query,
    where
} from "https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js";

/*
 * Dashboard independente do aplicativo principal.
 * Este arquivo realiza apenas leituras no Firebase/Firestore.
 */
const firebaseConfig = Object.freeze({
    apiKey: "AIzaSyAMDeRB1ZOOP919gcbcOoFGAsy6dNy7zS8",
    authDomain: "banco-de-dados-monitor.firebaseapp.com",
    projectId: "banco-de-dados-monitor",
    storageBucket: "banco-de-dados-monitor.firebasestorage.app",
    messagingSenderId: "248039911306",
    appId: "1:248039911306:web:188ffff179b3ffb3ace273"
});

const DASHBOARD_CONFIG = Object.freeze({
    locale: "pt-BR",
    timeZone: "America/Sao_Paulo",
    pageSize: 20,
    maximumRecords: 10000,
    autoRefreshMs: 5 * 60 * 1000,
    defaultMapCenter: [-23.0903, -47.2183],
    defaultMapZoom: 7,

    // A lista abaixo libera a interface completa sem alterar a base do app.
    // A segurança real deve continuar sendo aplicada pelas regras do Firestore.
    administratorEmails: ["eric.lima@advancetintas.com.br"],

    managementTerms: [
        "admin",
        "administrador",
        "diretor",
        "diretora",
        "gerente",
        "gestor",
        "gestora",
        "coordenador",
        "coordenadora",
        "supervisor",
        "supervisora"
    ],

    collections: Object.freeze({
        activities: "atividades",
        clients: "clientes",
        reports: "relatorios",
        promoters: "promotores",
        technicalAssistance: "assistencia",
        managers: "gestores",
        administrators: "administradores"
    })
});

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const state = {
    user: null,
    profile: null,
    canSeeAll: false,
    professionals: [],
    professionalMap: new Map(),
    clients: [],
    clientMap: new Map(),
    activities: [],
    filteredActivities: [],
    charts: {},
    map: null,
    mapLayers: [],
    googleRoutePoints: [],
    currentPage: 1,
    loadedRange: null,
    loading: false,
    activitiesLoading: false,
    sessionVersion: 0,
    toastTimer: null,
    autoRefreshTimer: null
};

const $ = id => document.getElementById(id);

function safeString(value, fallback = "") {
    const text = String(value ?? "").trim();
    return text || fallback;
}

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    }[character]));
}

function normalizeText(value) {
    return safeString(value)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
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

function parseInputDate(value, endOfDay = false) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const suffix = endOfDay ? "T23:59:59.999" : "T00:00:00.000";
    const date = new Date(`${value}${suffix}`);
    return Number.isFinite(date.getTime()) ? date : null;
}

function dateInputValue(date) {
    const validDate = toDate(date) || new Date();
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: DASHBOARD_CONFIG.timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).formatToParts(validDate);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
}

function formatDate(value) {
    const date = toDate(value);
    if (!date) return "--/--/----";
    return new Intl.DateTimeFormat(DASHBOARD_CONFIG.locale, {
        timeZone: DASHBOARD_CONFIG.timeZone,
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
    }).format(date);
}

function formatTime(value) {
    const date = toDate(value);
    if (!date) return "--:--";
    return new Intl.DateTimeFormat(DASHBOARD_CONFIG.locale, {
        timeZone: DASHBOARD_CONFIG.timeZone,
        hour: "2-digit",
        minute: "2-digit"
    }).format(date);
}

function formatDateTime(value) {
    const date = toDate(value);
    if (!date) return "Não informado";
    return `${formatDate(date)} às ${formatTime(date)}`;
}

function formatCompactDate(value) {
    const date = toDate(value);
    if (!date) return "--/--";
    return new Intl.DateTimeFormat(DASHBOARD_CONFIG.locale, {
        timeZone: DASHBOARD_CONFIG.timeZone,
        day: "2-digit",
        month: "2-digit"
    }).format(date);
}

function minutesBetween(start, end) {
    const startDate = toDate(start);
    const endDate = toDate(end);
    if (!startDate || !endDate || endDate < startDate) return null;
    return Math.round((endDate.getTime() - startDate.getTime()) / 60000);
}

function formatDuration(minutes) {
    if (!Number.isFinite(minutes) || minutes < 0) return "--";
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return remainder ? `${hours}h ${remainder}min` : `${hours}h`;
}

function formatNumber(value) {
    return new Intl.NumberFormat(DASHBOARD_CONFIG.locale).format(Number(value) || 0);
}

function normalizeStatus(value) {
    const normalized = normalizeText(value);
    if (normalized.includes("conclu")) return "Concluída";
    if (normalized.includes("andamento")) return "Em andamento";
    if (normalized.includes("pendente")) return "Pendente";
    return safeString(value, "Não informado");
}

function statusClass(status) {
    if (status === "Concluída") return "status-concluida";
    if (status === "Em andamento") return "status-andamento";
    if (status === "Pendente") return "status-pendente";
    return "status-outro";
}

function statusColor(status) {
    if (status === "Concluída") return "#0c9b69";
    if (status === "Em andamento") return "#f51e30";
    if (status === "Pendente") return "#dc8c00";
    return "#6f7282";
}

function parseCoordinates(value) {
    if (!value) return null;

    let latitude;
    let longitude;

    if (typeof value === "string") {
        const parts = value.split(/[;,]/).map(part => Number(part.trim()));
        [latitude, longitude] = parts;
    } else if (typeof value === "object") {
        latitude = Number(value.latitude ?? value.lat ?? value._lat);
        longitude = Number(value.longitude ?? value.lng ?? value.lon ?? value._long);
    }

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
    return { lat: latitude, lng: longitude };
}

function initials(name) {
    return safeString(name, "US")
        .split(/\s+/)
        .slice(0, 2)
        .map(part => part[0] || "")
        .join("")
        .toUpperCase();
}

function firstAvailable(source, keys, fallback = "") {
    for (const key of keys) {
        const value = source?.[key];
        if (value !== undefined && value !== null && safeString(value)) return value;
    }
    return fallback;
}

function normalizeProfessional(data, id, sourceCollection) {
    const sourceLabel = sourceCollection === DASHBOARD_CONFIG.collections.promoters
        ? "Promotor Técnico de Vendas"
        : sourceCollection === DASHBOARD_CONFIG.collections.technicalAssistance
            ? "Assistência Técnica"
            : sourceCollection === DASHBOARD_CONFIG.collections.managers
                ? "Gestão"
                : sourceCollection === DASHBOARD_CONFIG.collections.administrators
                    ? "Administrador"
                    : "Profissional";

    const name = safeString(firstAvailable(data, ["nome", "name", "nomeCompleto"], "Profissional"));
    const role = safeString(firstAvailable(data, ["cargo", "funcao", "perfil", "tipo", "role"], sourceLabel));

    return {
        id,
        sourceCollection,
        raw: data || {},
        name,
        email: safeString(firstAvailable(data, ["email", "eMail"])),
        phone: safeString(firstAvailable(data, ["telefone", "celular", "whatsapp", "fone"])),
        region: safeString(firstAvailable(data, ["regiao", "regional", "territorio", "cidade", "uf"])),
        role,
        status: safeString(firstAvailable(data, ["status", "situacao"], "Ativo")),
        photoUrl: safeString(firstAvailable(data, ["fotoUrl", "fotoURL", "photoURL", "imagem", "avatar"])),
        monthlyTarget: Number(firstAvailable(data, ["metaMensal", "meta", "metaVisitas"], 0)) || 0
    };
}

function normalizeClient(data, id) {
    return {
        id,
        raw: data || {},
        name: safeString(firstAvailable(data, ["nome", "nomeFantasia", "razaoSocial"], "Cliente não identificado")),
        city: safeString(firstAvailable(data, ["cidade", "municipio"])),
        state: safeString(firstAvailable(data, ["uf", "estado"])),
        address: safeString(firstAvailable(data, ["enderecoCompleto", "endereco", "logradouro"])),
        coordinates: parseCoordinates(data) || parseCoordinates({ lat: data?.lat, lng: data?.lng })
    };
}

function enrichActivity(data, id) {
    const professional = state.professionalMap.get(data.ptvId) || {
        id: data.ptvId || "sem-profissional",
        name: safeString(data.ptvNome, "Profissional não localizado"),
        role: "Profissional",
        raw: {}
    };
    const client = state.clientMap.get(data.clienteId) || {
        id: data.clienteId || "sem-cliente",
        name: safeString(data.clienteNome, "Cliente não localizado"),
        city: "",
        state: "",
        address: "",
        coordinates: null,
        raw: {}
    };

    const scheduledAt = toDate(data.data ?? data.dataAgendada ?? data.criadoEm);
    const checkinAt = toDate(data.checkinDataHora ?? data.checkinEm);
    const checkoutAt = toDate(data.checkoutDataHora ?? data.checkoutEm);
    const checkinCoordinates = parseCoordinates(data.checkinGps ?? data.checkinCoordenadas);
    const checkoutCoordinates = parseCoordinates(data.checkoutGps ?? data.checkoutCoordenadas);
    const mapCoordinates = checkinCoordinates || client.coordinates || checkoutCoordinates;
    const status = normalizeStatus(data.status);
    const activityType = safeString(data.objetivo ?? data.tipoAtividade ?? data.tipo, "Visita");

    return {
        id,
        raw: data,
        professionalId: data.ptvId || professional.id,
        professional,
        clientId: data.clienteId || client.id,
        client,
        scheduledAt,
        checkinAt,
        checkoutAt,
        status,
        type: activityType,
        note: safeString(data.nota ?? data.observacao ?? data.resumo),
        reportId: safeString(data.relatorioId),
        checkinAddress: safeString(data.checkinEndereco),
        checkoutAddress: safeString(data.checkoutEndereco),
        checkinCoordinates,
        checkoutCoordinates,
        mapCoordinates,
        durationMinutes: minutesBetween(checkinAt, checkoutAt)
    };
}

function setLoading(visible, text = "Carregando dados...") {
    state.loading = visible;
    $("dashboard-loading").hidden = !visible;
    $("dashboard-loading-text").textContent = text;
    $("dashboard-btn-atualizar").disabled = visible;
    $("dashboard-btn-aplicar").disabled = visible;
}

function setSyncStatus(type, message) {
    const dot = $("dashboard-sync-dot");
    dot.className = `sync-dot ${type ? `is-${type}` : ""}`.trim();
    $("dashboard-sync-text").textContent = message;
}

function showToast(message, type = "") {
    const toast = $("dashboard-toast");
    clearTimeout(state.toastTimer);
    toast.textContent = message;
    toast.className = `toast ${type ? `is-${type}` : ""}`.trim();
    toast.hidden = false;
    state.toastTimer = setTimeout(() => {
        toast.hidden = true;
    }, 4300);
}

function errorMessage(error) {
    const code = safeString(error?.code);
    const messages = {
        "auth/invalid-credential": "E-mail ou senha inválidos.",
        "auth/user-not-found": "Usuário não encontrado.",
        "auth/wrong-password": "E-mail ou senha inválidos.",
        "auth/too-many-requests": "Muitas tentativas. Aguarde antes de tentar novamente.",
        "auth/network-request-failed": "Não foi possível conectar ao Firebase.",
        "permission-denied": "Seu usuário não possui permissão de leitura para estes dados no Firestore.",
        "unavailable": "O serviço está indisponível no momento. Confira a conexão.",
        "failed-precondition": "O Firestore solicitou uma configuração adicional para esta consulta."
    };
    return messages[code] || safeString(error?.message, "Não foi possível concluir a operação.");
}

function showLogin() {
    $("dashboard-login").hidden = false;
    $("dashboard-shell").hidden = true;
    $("dashboard-btn-entrar").disabled = false;
    $("dashboard-btn-entrar").textContent = "Entrar";
    setLoading(false);
    clearInterval(state.autoRefreshTimer);
    state.autoRefreshTimer = null;
}

function showDashboard() {
    $("dashboard-login").hidden = true;
    $("dashboard-shell").hidden = false;
}

function resetStateForSession() {
    state.profile = null;
    state.canSeeAll = false;
    state.professionals = [];
    state.professionalMap = new Map();
    state.clients = [];
    state.clientMap = new Map();
    state.activities = [];
    state.filteredActivities = [];
    state.loadedRange = null;
    state.activitiesLoading = false;
    state.currentPage = 1;
    state.googleRoutePoints = [];
    clearCharts();
    clearMapLayers();
}

async function safeGetProfileFromCollection(collectionName, user) {
    try {
        const uidReference = doc(db, collectionName, user.uid);
        const uidSnapshot = await getDoc(uidReference);
        if (uidSnapshot.exists()) {
            return normalizeProfessional(uidSnapshot.data(), uidSnapshot.id, collectionName);
        }
    } catch (error) {
        if (error?.code !== "permission-denied") console.warn(`Falha ao buscar UID em ${collectionName}:`, error);
    }

    try {
        const snapshot = await getDocs(query(
            collection(db, collectionName),
            where("email", "==", user.email || "")
        ));
        if (!snapshot.empty) {
            const documentSnapshot = snapshot.docs[0];
            return normalizeProfessional(documentSnapshot.data(), documentSnapshot.id, collectionName);
        }
    } catch (error) {
        if (error?.code !== "permission-denied") console.warn(`Falha ao buscar e-mail em ${collectionName}:`, error);
    }

    return null;
}

async function resolveUserAccess(user) {
    let tokenClaims = {};
    try {
        const token = await getIdTokenResult(user);
        tokenClaims = token.claims || {};
    } catch (error) {
        console.warn("Não foi possível ler as claims do usuário:", error);
    }

    const collectionOrder = [
        DASHBOARD_CONFIG.collections.administrators,
        DASHBOARD_CONFIG.collections.managers,
        DASHBOARD_CONFIG.collections.technicalAssistance,
        DASHBOARD_CONFIG.collections.promoters
    ];

    let profile = null;
    for (const collectionName of collectionOrder) {
        profile = await safeGetProfileFromCollection(collectionName, user);
        if (profile) break;
    }

    const email = normalizeText(user.email);
    const allowlisted = DASHBOARD_CONFIG.administratorEmails.some(item => normalizeText(item) === email);

    if (!profile && allowlisted) {
        profile = normalizeProfessional({
            nome: user.displayName || "Gestor",
            email: user.email,
            cargo: "Gestão"
        }, user.uid, DASHBOARD_CONFIG.collections.managers);
    }

    if (!profile) {
        throw new Error("O e-mail autenticado não foi localizado nas coleções de usuários do aplicativo.");
    }

    const managementText = normalizeText([
        profile.role,
        profile.raw?.cargo,
        profile.raw?.perfil,
        profile.raw?.tipoAcesso,
        tokenClaims.role,
        tokenClaims.perfil,
        tokenClaims.cargo
    ].filter(Boolean).join(" "));

    const managementRole = DASHBOARD_CONFIG.managementTerms.some(term => managementText.includes(normalizeText(term)));
    const managementCollection = [
        DASHBOARD_CONFIG.collections.administrators,
        DASHBOARD_CONFIG.collections.managers
    ].includes(profile.sourceCollection);
    const claimAccess = tokenClaims.admin === true || tokenClaims.gestor === true || tokenClaims.manager === true;

    return {
        profile,
        canSeeAll: allowlisted || managementRole || managementCollection || claimAccess
    };
}

async function readCollection(collectionName) {
    const snapshot = await getDocs(collection(db, collectionName));
    return snapshot.docs.map(documentSnapshot => ({
        id: documentSnapshot.id,
        data: documentSnapshot.data()
    }));
}

async function readCollectionSafely(collectionName) {
    try {
        return await readCollection(collectionName);
    } catch (error) {
        if (error?.code !== "permission-denied") console.warn(`Não foi possível ler ${collectionName}:`, error);
        return [];
    }
}

async function loadReferenceData(sessionVersion) {
    setLoading(true, "Carregando equipe e clientes...");

    const [promoters, assistance, clients] = await Promise.all([
        readCollectionSafely(DASHBOARD_CONFIG.collections.promoters),
        readCollectionSafely(DASHBOARD_CONFIG.collections.technicalAssistance),
        readCollectionSafely(DASHBOARD_CONFIG.collections.clients)
    ]);

    if (sessionVersion !== state.sessionVersion) return;

    const professionals = [
        ...promoters.map(item => normalizeProfessional(item.data, item.id, DASHBOARD_CONFIG.collections.promoters)),
        ...assistance.map(item => normalizeProfessional(item.data, item.id, DASHBOARD_CONFIG.collections.technicalAssistance))
    ];

    if (!professionals.some(person => person.id === state.profile.id)) {
        professionals.push(state.profile);
    }

    const uniqueProfessionals = Array.from(
        new Map(professionals.map(person => [person.id, person])).values()
    ).sort((first, second) => first.name.localeCompare(second.name, DASHBOARD_CONFIG.locale));

    state.professionals = state.canSeeAll
        ? uniqueProfessionals
        : uniqueProfessionals.filter(person => person.id === state.profile.id);
    state.professionalMap = new Map(uniqueProfessionals.map(person => [person.id, person]));

    state.clients = clients
        .map(item => normalizeClient(item.data, item.id))
        .sort((first, second) => first.name.localeCompare(second.name, DASHBOARD_CONFIG.locale));
    state.clientMap = new Map(state.clients.map(client => [client.id, client]));

    populateProfessionalFilter();
}

function populateProfessionalFilter() {
    const select = $("filtro-profissional");
    const currentValue = select.value;
    select.replaceChildren();

    const allOption = document.createElement("option");
    allOption.value = "";
    allOption.textContent = state.canSeeAll ? "Todos os profissionais" : state.profile.name;
    select.appendChild(allOption);

    if (state.canSeeAll) {
        for (const professional of state.professionals) {
            const option = document.createElement("option");
            option.value = professional.id;
            option.textContent = `${professional.name} — ${professional.role}`;
            select.appendChild(option);
        }
        select.disabled = false;
        if ([...select.options].some(option => option.value === currentValue)) select.value = currentValue;
    } else {
        select.value = "";
        select.disabled = true;
    }
}

async function loadMissingClients(activities, sessionVersion) {
    const missingIds = [...new Set(
        activities
            .map(activity => activity.clienteId)
            .filter(id => id && !state.clientMap.has(id))
    )].slice(0, 200);

    if (!missingIds.length) return;

    const results = await Promise.allSettled(missingIds.map(async id => {
        const snapshot = await getDoc(doc(db, DASHBOARD_CONFIG.collections.clients, id));
        return snapshot.exists() ? normalizeClient(snapshot.data(), snapshot.id) : null;
    }));

    if (sessionVersion !== state.sessionVersion) return;

    for (const result of results) {
        if (result.status === "fulfilled" && result.value) {
            state.clientMap.set(result.value.id, result.value);
        }
    }
}

function selectedDateRange() {
    const startValue = $("filtro-data-inicial").value;
    const endValue = $("filtro-data-final").value;
    const start = parseInputDate(startValue, false);
    const end = parseInputDate(endValue, true);

    if (!start || !end) throw new Error("Informe uma data inicial e uma data final válidas.");
    if (end < start) throw new Error("A data final não pode ser anterior à data inicial.");

    const maximumDays = 730;
    if ((end.getTime() - start.getTime()) / 86400000 > maximumDays) {
        throw new Error(`Selecione um período de até ${maximumDays} dias.`);
    }

    return { start, end, startValue, endValue };
}

async function loadActivities({ silent = false } = {}) {
    if (!state.user || !state.profile || state.activitiesLoading) return;

    const range = selectedDateRange();
    state.activitiesLoading = true;
    const sessionVersion = state.sessionVersion;

    if (!silent) setLoading(true, "Carregando atividades...");
    setSyncStatus("loading", "Atualizando dados...");

    try {
        let activityQuery;
        if (state.canSeeAll) {
            activityQuery = query(
                collection(db, DASHBOARD_CONFIG.collections.activities),
                where("data", ">=", range.start),
                where("data", "<=", range.end)
            );
        } else {
            activityQuery = query(
                collection(db, DASHBOARD_CONFIG.collections.activities),
                where("ptvId", "==", state.profile.id)
            );
        }

        let snapshot;
        try {
            snapshot = await getDocs(activityQuery);
        } catch (error) {
            if (state.canSeeAll && error?.code === "failed-precondition") {
                console.warn("Consulta por período indisponível; utilizando filtro local.", error);
                snapshot = await getDocs(collection(db, DASHBOARD_CONFIG.collections.activities));
            } else {
                throw error;
            }
        }

        if (sessionVersion !== state.sessionVersion) return;

        let rawActivities = snapshot.docs.map(documentSnapshot => ({
            id: documentSnapshot.id,
            ...documentSnapshot.data()
        }));

        rawActivities = rawActivities.filter(activity => {
            const activityDate = toDate(activity.data ?? activity.dataAgendada ?? activity.criadoEm);
            return activityDate && activityDate >= range.start && activityDate <= range.end;
        });

        if (!state.canSeeAll) {
            rawActivities = rawActivities.filter(activity => activity.ptvId === state.profile.id);
        }

        if (rawActivities.length > DASHBOARD_CONFIG.maximumRecords) {
            rawActivities.sort((first, second) => {
                const firstDate = toDate(first.data)?.getTime() || 0;
                const secondDate = toDate(second.data)?.getTime() || 0;
                return secondDate - firstDate;
            });
            rawActivities = rawActivities.slice(0, DASHBOARD_CONFIG.maximumRecords);
            showToast(`Foram exibidos os ${formatNumber(DASHBOARD_CONFIG.maximumRecords)} registros mais recentes.`, "error");
        }

        await loadMissingClients(rawActivities, sessionVersion);
        if (sessionVersion !== state.sessionVersion) return;

        state.activities = rawActivities
            .map(activity => enrichActivity(activity, activity.id))
            .sort((first, second) => (second.scheduledAt?.getTime() || 0) - (first.scheduledAt?.getTime() || 0));
        state.loadedRange = { startValue: range.startValue, endValue: range.endValue };
        state.currentPage = 1;

        applyFilters({ resetPage: true });

        const now = new Date();
        setSyncStatus("ok", `Atualizado às ${formatTime(now)}`);
    } catch (error) {
        console.error("Erro ao carregar o dashboard:", error);
        setSyncStatus("error", "Falha ao atualizar");
        showToast(errorMessage(error), "error");
        if (!silent) throw error;
    } finally {
        if (sessionVersion === state.sessionVersion) {
            state.activitiesLoading = false;
            if (!silent) setLoading(false);
        }
    }
}

function currentFilters() {
    return {
        professionalId: $("filtro-profissional").value,
        status: $("filtro-status").value,
        type: normalizeText($("filtro-tipo").value),
        clientSearch: normalizeText($("filtro-cliente").value)
    };
}

function applyFilters({ resetPage = false } = {}) {
    const filters = currentFilters();

    state.filteredActivities = state.activities.filter(activity => {
        if (filters.professionalId && activity.professionalId !== filters.professionalId) return false;
        if (filters.status && activity.status !== filters.status) return false;
        if (filters.type && !normalizeText(activity.type).includes(filters.type)) return false;
        if (filters.clientSearch) {
            const clientText = normalizeText([
                activity.client.name,
                activity.client.city,
                activity.client.state,
                activity.client.address
            ].join(" "));
            if (!clientText.includes(filters.clientSearch)) return false;
        }
        return true;
    });

    if (resetPage) state.currentPage = 1;
    renderDashboard();
}

function renderDashboard() {
    renderKpis();
    renderCharts();
    renderMap();
    renderRanking();
    renderTable();
}

function renderKpis() {
    const activities = state.filteredActivities;
    const total = activities.length;
    const completed = activities.filter(activity => activity.status === "Concluída").length;
    const inProgress = activities.filter(activity => activity.status === "Em andamento").length;
    const pending = activities.filter(activity => activity.status === "Pendente").length;
    const trainings = activities.filter(activity => normalizeText(activity.type).includes("treinamento")).length;
    const clients = new Set(activities.map(activity => activity.clientId).filter(Boolean)).size;
    const durations = activities
        .map(activity => activity.durationMinutes)
        .filter(value => Number.isFinite(value));
    const averageDuration = durations.length
        ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
        : null;
    const completionRate = total ? Math.round((completed / total) * 100) : 0;
    const trainingRate = total ? Math.round((trainings / total) * 100) : 0;

    $("kpi-total").textContent = formatNumber(total);
    $("kpi-total-sub").textContent = `${formatNumber(clients)} ${clients === 1 ? "cliente" : "clientes"}`;
    $("kpi-concluidas").textContent = formatNumber(completed);
    $("kpi-concluidas-sub").textContent = `${completionRate}% de conclusão`;
    $("kpi-andamento").textContent = formatNumber(inProgress);
    $("kpi-andamento-sub").textContent = inProgress ? "Acompanhamento em tempo real" : "Nenhuma visita aberta";
    $("kpi-pendentes").textContent = formatNumber(pending);
    $("kpi-pendentes-sub").textContent = pending === 1 ? "Visita agendada" : "Visitas agendadas";
    $("kpi-treinamentos").textContent = formatNumber(trainings);
    $("kpi-treinamentos-sub").textContent = `${trainingRate}% das atividades`;
    $("kpi-duracao").textContent = formatDuration(averageDuration);
    $("kpi-duracao-sub").textContent = durations.length ? `${formatNumber(durations.length)} visitas concluídas` : "Sem duração registrada";
}

function clearCharts() {
    for (const chart of Object.values(state.charts)) {
        try {
            chart?.destroy();
        } catch (error) {
            console.warn("Falha ao destruir gráfico:", error);
        }
    }
    state.charts = {};
}

function destroyChart(name) {
    try {
        state.charts[name]?.destroy();
    } catch (error) {
        console.warn(`Falha ao recriar gráfico ${name}:`, error);
    }
    delete state.charts[name];
}

function chartBaseOptions() {
    return {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 350 },
        interaction: { intersect: false, mode: "index" },
        plugins: {
            legend: {
                position: "bottom",
                labels: {
                    usePointStyle: true,
                    boxWidth: 8,
                    padding: 18,
                    color: "#646779",
                    font: { family: "Outfit", size: 11, weight: "600" }
                }
            },
            tooltip: {
                backgroundColor: "#040438",
                padding: 11,
                titleFont: { family: "Outfit", weight: "700" },
                bodyFont: { family: "Outfit" },
                displayColors: true
            }
        },
        scales: {
            x: {
                grid: { display: false },
                ticks: { color: "#7a7d8d", font: { family: "Outfit", size: 10 } }
            },
            y: {
                beginAtZero: true,
                grid: { color: "rgba(111,114,130,0.10)" },
                ticks: { precision: 0, color: "#7a7d8d", font: { family: "Outfit", size: 10 } }
            }
        }
    };
}

function renderCharts() {
    if (typeof window.Chart !== "function") {
        $("grafico-evolucao-vazio").hidden = false;
        $("grafico-evolucao-vazio").textContent = "A biblioteca de gráficos não foi carregada.";
        $("grafico-status-vazio").hidden = false;
        $("grafico-status-vazio").textContent = "A biblioteca de gráficos não foi carregada.";
        $("grafico-equipe-vazio").hidden = false;
        $("grafico-equipe-vazio").textContent = "A biblioteca de gráficos não foi carregada.";
        return;
    }

    renderEvolutionChart();
    renderStatusChart();
    renderTeamChart();
}

function renderEvolutionChart() {
    destroyChart("evolution");
    const empty = $("grafico-evolucao-vazio");
    const canvas = $("grafico-evolucao");

    if (!state.filteredActivities.length) {
        canvas.hidden = true;
        empty.hidden = false;
        return;
    }

    canvas.hidden = false;
    empty.hidden = true;

    const buckets = new Map();
    for (const activity of state.filteredActivities) {
        if (!activity.scheduledAt) continue;
        const key = dateInputValue(activity.scheduledAt);
        if (!buckets.has(key)) {
            buckets.set(key, { date: activity.scheduledAt, completed: 0, inProgress: 0, pending: 0, other: 0 });
        }
        const bucket = buckets.get(key);
        if (activity.status === "Concluída") bucket.completed += 1;
        else if (activity.status === "Em andamento") bucket.inProgress += 1;
        else if (activity.status === "Pendente") bucket.pending += 1;
        else bucket.other += 1;
    }

    const ordered = [...buckets.values()].sort((first, second) => first.date - second.date);
    const options = chartBaseOptions();
    options.scales.x.stacked = true;
    options.scales.y.stacked = true;
    options.scales.x.ticks.maxRotation = 0;
    options.scales.x.ticks.autoSkip = true;
    options.scales.x.ticks.maxTicksLimit = 16;

    state.charts.evolution = new window.Chart(canvas, {
        type: "bar",
        data: {
            labels: ordered.map(item => formatCompactDate(item.date)),
            datasets: [
                {
                    label: "Concluídas",
                    data: ordered.map(item => item.completed),
                    backgroundColor: "rgba(12,155,105,0.86)",
                    borderRadius: 4,
                    maxBarThickness: 28
                },
                {
                    label: "Em andamento",
                    data: ordered.map(item => item.inProgress),
                    backgroundColor: "rgba(245,30,48,0.86)",
                    borderRadius: 4,
                    maxBarThickness: 28
                },
                {
                    label: "Pendentes",
                    data: ordered.map(item => item.pending),
                    backgroundColor: "rgba(220,140,0,0.82)",
                    borderRadius: 4,
                    maxBarThickness: 28
                }
            ]
        },
        options
    });
}

function renderStatusChart() {
    destroyChart("status");
    const empty = $("grafico-status-vazio");
    const canvas = $("grafico-status");

    if (!state.filteredActivities.length) {
        canvas.hidden = true;
        empty.hidden = false;
        return;
    }

    canvas.hidden = false;
    empty.hidden = true;

    const statusCounts = new Map();
    for (const activity of state.filteredActivities) {
        statusCounts.set(activity.status, (statusCounts.get(activity.status) || 0) + 1);
    }

    const labels = ["Concluída", "Em andamento", "Pendente"]
        .filter(status => statusCounts.has(status));
    for (const status of statusCounts.keys()) {
        if (!labels.includes(status)) labels.push(status);
    }

    state.charts.status = new window.Chart(canvas, {
        type: "doughnut",
        data: {
            labels,
            datasets: [{
                data: labels.map(label => statusCounts.get(label) || 0),
                backgroundColor: labels.map(statusColor),
                borderColor: "#ffffff",
                borderWidth: 4,
                hoverOffset: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: "67%",
            animation: { duration: 350 },
            plugins: {
                legend: {
                    position: "bottom",
                    labels: {
                        usePointStyle: true,
                        boxWidth: 8,
                        padding: 16,
                        color: "#646779",
                        font: { family: "Outfit", size: 11, weight: "600" }
                    }
                },
                tooltip: {
                    backgroundColor: "#040438",
                    padding: 11,
                    titleFont: { family: "Outfit", weight: "700" },
                    bodyFont: { family: "Outfit" }
                }
            }
        }
    });
}

function teamStatistics() {
    const stats = new Map();

    for (const activity of state.filteredActivities) {
        const id = activity.professionalId || "sem-profissional";
        if (!stats.has(id)) {
            stats.set(id, {
                id,
                professional: activity.professional,
                total: 0,
                completed: 0,
                inProgress: 0,
                pending: 0,
                trainings: 0,
                clients: new Set(),
                durations: [],
                lastActivity: null
            });
        }

        const item = stats.get(id);
        item.total += 1;
        if (activity.status === "Concluída") item.completed += 1;
        else if (activity.status === "Em andamento") item.inProgress += 1;
        else if (activity.status === "Pendente") item.pending += 1;
        if (normalizeText(activity.type).includes("treinamento")) item.trainings += 1;
        if (activity.clientId) item.clients.add(activity.clientId);
        if (Number.isFinite(activity.durationMinutes)) item.durations.push(activity.durationMinutes);
        if (!item.lastActivity || (activity.scheduledAt?.getTime() || 0) > (item.lastActivity.scheduledAt?.getTime() || 0)) {
            item.lastActivity = activity;
        }
    }

    return [...stats.values()]
        .map(item => ({
            ...item,
            clientCount: item.clients.size,
            completionRate: item.total ? Math.round((item.completed / item.total) * 100) : 0,
            averageDuration: item.durations.length
                ? Math.round(item.durations.reduce((sum, value) => sum + value, 0) / item.durations.length)
                : null
        }))
        .sort((first, second) => second.total - first.total || second.completed - first.completed || first.professional.name.localeCompare(second.professional.name));
}

function renderTeamChart() {
    destroyChart("team");
    const empty = $("grafico-equipe-vazio");
    const canvas = $("grafico-equipe");
    const stats = teamStatistics().slice(0, 12);

    if (!stats.length) {
        canvas.hidden = true;
        empty.hidden = false;
        return;
    }

    canvas.hidden = false;
    empty.hidden = true;

    const options = chartBaseOptions();
    options.indexAxis = "y";
    options.scales.x.beginAtZero = true;
    options.scales.x.ticks.precision = 0;
    options.scales.y.grid = { display: false };
    options.scales.y.ticks = {
        color: "#414358",
        font: { family: "Outfit", size: 11, weight: "600" }
    };
    options.plugins.legend.display = false;

    state.charts.team = new window.Chart(canvas, {
        type: "bar",
        data: {
            labels: stats.map(item => item.professional.name),
            datasets: [{
                label: "Atividades",
                data: stats.map(item => item.total),
                backgroundColor: "rgba(4,4,56,0.86)",
                borderRadius: 7,
                maxBarThickness: 25
            }]
        },
        options
    });
}

function initializeMap() {
    if (state.map || typeof window.L !== "object") return;

    state.map = window.L.map("mapa-dashboard", {
        zoomControl: true,
        attributionControl: true
    }).setView(DASHBOARD_CONFIG.defaultMapCenter, DASHBOARD_CONFIG.defaultMapZoom);

    window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap"
    }).addTo(state.map);
}

function clearMapLayers() {
    if (!state.map) {
        state.mapLayers = [];
        return;
    }
    for (const layer of state.mapLayers) {
        try {
            state.map.removeLayer(layer);
        } catch (error) {
            console.warn("Não foi possível remover uma camada do mapa:", error);
        }
    }
    state.mapLayers = [];
}

function mapActivities() {
    return state.filteredActivities.filter(activity => activity.mapCoordinates);
}

function popupHtml(activity) {
    return `
        <div class="map-popup">
            <strong>${escapeHtml(activity.client.name)}</strong>
            <span>${escapeHtml(activity.professional.name)}</span>
            <span>${escapeHtml(formatDateTime(activity.scheduledAt))}</span>
            <span>${escapeHtml(activity.type)} · ${escapeHtml(activity.status)}</span>
        </div>
    `;
}

function addMapLayer(layer) {
    layer.addTo(state.map);
    state.mapLayers.push(layer);
    return layer;
}

function renderMap() {
    initializeMap();

    if (!state.map) {
        $("mapa-dashboard").hidden = true;
        $("mapa-indisponivel").hidden = false;
        $("map-summary").textContent = "Mapa indisponível.";
        $("dashboard-btn-google-maps").disabled = true;
        return;
    }

    $("mapa-dashboard").hidden = false;
    $("mapa-indisponivel").hidden = true;
    clearMapLayers();

    const activities = mapActivities();
    const mode = $("mapa-modo").value;
    const allCoordinates = activities.map(activity => [activity.mapCoordinates.lat, activity.mapCoordinates.lng]);
    state.googleRoutePoints = [];

    $("map-summary").textContent = activities.length
        ? `${formatNumber(activities.length)} ${activities.length === 1 ? "atividade localizada" : "atividades localizadas"}.`
        : "Nenhuma atividade possui coordenadas para os filtros atuais.";

    if (!activities.length) {
        state.map.setView(DASHBOARD_CONFIG.defaultMapCenter, DASHBOARD_CONFIG.defaultMapZoom);
        $("dashboard-btn-google-maps").disabled = true;
        setTimeout(() => state.map?.invalidateSize(), 30);
        return;
    }

    if (mode === "calor" && typeof window.L.heatLayer === "function") {
        const heatPoints = activities.map(activity => [
            activity.mapCoordinates.lat,
            activity.mapCoordinates.lng,
            activity.status === "Concluída" ? 0.85 : 0.58
        ]);
        addMapLayer(window.L.heatLayer(heatPoints, {
            radius: 27,
            blur: 22,
            maxZoom: 14
        }));
    } else if (mode === "rotas") {
        renderRouteLayers(activities);
    } else {
        for (const activity of activities) {
            const marker = window.L.circleMarker(
                [activity.mapCoordinates.lat, activity.mapCoordinates.lng],
                {
                    radius: 7,
                    color: "#ffffff",
                    weight: 2,
                    fillColor: statusColor(activity.status),
                    fillOpacity: 0.94
                }
            );
            marker.bindPopup(popupHtml(activity));
            addMapLayer(marker);
        }
    }

    if (allCoordinates.length === 1) {
        state.map.setView(allCoordinates[0], 14);
    } else {
        state.map.fitBounds(window.L.latLngBounds(allCoordinates), { padding: [28, 28], maxZoom: 14 });
    }

    prepareGoogleRoute(activities);
    setTimeout(() => state.map?.invalidateSize(), 30);
}

function renderRouteLayers(activities) {
    const palette = ["#040438", "#f51e30", "#2767d8", "#0c9b69", "#7654c7", "#dc8c00", "#287c8e"];
    const groups = new Map();

    for (const activity of activities) {
        if (!groups.has(activity.professionalId)) groups.set(activity.professionalId, []);
        groups.get(activity.professionalId).push(activity);
    }

    let groupIndex = 0;
    for (const group of groups.values()) {
        group.sort((first, second) => (first.scheduledAt?.getTime() || 0) - (second.scheduledAt?.getTime() || 0));
        const color = palette[groupIndex % palette.length];
        groupIndex += 1;
        const coordinates = group.map(activity => [activity.mapCoordinates.lat, activity.mapCoordinates.lng]);

        if (coordinates.length >= 2) {
            const line = window.L.polyline(coordinates, {
                color,
                weight: 4,
                opacity: 0.72,
                dashArray: "9 7"
            });
            addMapLayer(line);
        }

        group.forEach((activity, index) => {
            const marker = window.L.circleMarker(
                [activity.mapCoordinates.lat, activity.mapCoordinates.lng],
                {
                    radius: 8,
                    color: "#ffffff",
                    weight: 2,
                    fillColor: color,
                    fillOpacity: 0.96
                }
            );
            marker.bindTooltip(String(index + 1), {
                permanent: true,
                direction: "center",
                className: "route-number-label"
            });
            marker.bindPopup(popupHtml(activity));
            addMapLayer(marker);
        });
    }
}

function prepareGoogleRoute(activities) {
    const selectedProfessional = $("filtro-profissional").value;
    const grouped = new Map();
    for (const activity of activities) {
        if (!grouped.has(activity.professionalId)) grouped.set(activity.professionalId, []);
        grouped.get(activity.professionalId).push(activity);
    }

    let route = [];
    if (selectedProfessional && grouped.has(selectedProfessional)) {
        route = grouped.get(selectedProfessional);
    } else if (grouped.size === 1) {
        route = [...grouped.values()][0];
    }

    route.sort((first, second) => (first.scheduledAt?.getTime() || 0) - (second.scheduledAt?.getTime() || 0));
    state.googleRoutePoints = route.map(activity => activity.mapCoordinates).filter(Boolean);
    $("dashboard-btn-google-maps").disabled = state.googleRoutePoints.length < 2;
}

function samplePoints(points, maximum) {
    if (points.length <= maximum) return points;
    const sampled = [];
    for (let index = 0; index < maximum; index += 1) {
        const position = Math.round(index * (points.length - 1) / (maximum - 1));
        sampled.push(points[position]);
    }
    return sampled;
}

function openGoogleRoute() {
    if (state.googleRoutePoints.length < 2) {
        showToast("Selecione um profissional com pelo menos duas visitas localizadas.", "error");
        return;
    }

    const points = samplePoints(state.googleRoutePoints, 10);
    const origin = points[0];
    const destination = points[points.length - 1];
    const waypoints = points.slice(1, -1);
    const parameters = new URLSearchParams({
        api: "1",
        origin: `${origin.lat},${origin.lng}`,
        destination: `${destination.lat},${destination.lng}`,
        travelmode: "driving"
    });
    if (waypoints.length) {
        parameters.set("waypoints", waypoints.map(point => `${point.lat},${point.lng}`).join("|"));
    }

    window.open(`https://www.google.com/maps/dir/?${parameters.toString()}`, "_blank", "noopener,noreferrer");
}

function renderRanking() {
    const container = $("ranking-equipe");
    const empty = $("ranking-vazio");
    const stats = teamStatistics();
    container.replaceChildren();

    if (!stats.length) {
        empty.hidden = false;
        return;
    }

    empty.hidden = true;
    stats.slice(0, 12).forEach((item, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "ranking-item";
        button.dataset.professionalId = item.id;
        button.innerHTML = `
            <span class="ranking-position">${index + 1}</span>
            <span class="ranking-main">
                <strong>${escapeHtml(item.professional.name)}</strong>
                <span>${formatNumber(item.completed)} concluídas · ${formatNumber(item.clientCount)} clientes</span>
            </span>
            <span class="ranking-score">
                <strong>${formatNumber(item.total)}</strong>
                <small>atividades</small>
            </span>
        `;
        button.addEventListener("click", () => openProfessionalProfile(item.id));
        container.appendChild(button);
    });
}

function renderTable() {
    const body = $("dashboard-table-body");
    const empty = $("table-empty");
    const count = state.filteredActivities.length;
    const totalPages = Math.max(1, Math.ceil(count / DASHBOARD_CONFIG.pageSize));
    state.currentPage = Math.min(Math.max(1, state.currentPage), totalPages);

    const start = (state.currentPage - 1) * DASHBOARD_CONFIG.pageSize;
    const pageItems = state.filteredActivities.slice(start, start + DASHBOARD_CONFIG.pageSize);
    body.replaceChildren();

    $("table-count").textContent = `${formatNumber(count)} ${count === 1 ? "registro" : "registros"}`;
    $("pagina-info").textContent = `Página ${state.currentPage} de ${totalPages}`;
    $("pagina-anterior").disabled = state.currentPage <= 1;
    $("pagina-proxima").disabled = state.currentPage >= totalPages;

    if (!pageItems.length) {
        empty.hidden = false;
        return;
    }

    empty.hidden = true;

    for (const activity of pageItems) {
        const row = document.createElement("tr");
        const location = [activity.client.city, activity.client.state].filter(Boolean).join("/");
        row.innerHTML = `
            <td>
                <span class="cell-primary">${escapeHtml(formatDate(activity.scheduledAt))}</span>
                <span class="cell-secondary">${escapeHtml(formatTime(activity.scheduledAt))}</span>
            </td>
            <td>
                <span class="cell-primary">${escapeHtml(activity.professional.name)}</span>
                <span class="cell-secondary">${escapeHtml(activity.professional.role)}</span>
            </td>
            <td>
                <span class="cell-primary" title="${escapeHtml(activity.client.name)}">${escapeHtml(activity.client.name)}</span>
                <span class="cell-secondary">${escapeHtml(location || activity.client.address || "Local não informado")}</span>
            </td>
            <td>${escapeHtml(activity.type)}</td>
            <td><span class="status-badge ${statusClass(activity.status)}">${escapeHtml(activity.status)}</span></td>
            <td>${escapeHtml(formatDuration(activity.durationMinutes))}</td>
            <td>
                <button class="table-action" type="button" aria-label="Abrir detalhes da atividade" title="Ver detalhes">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M1.5 12s3.5-6 10.5-6 10.5 6 10.5 6-3.5 6-10.5 6S1.5 12 1.5 12Z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                </button>
            </td>
        `;
        row.querySelector(".table-action").addEventListener("click", () => openActivityDetails(activity.id));
        body.appendChild(row);
    }
}

function openModal({ eyebrow, title, content }) {
    $("modal-eyebrow").textContent = eyebrow;
    $("modal-title").textContent = title;
    $("modal-content").innerHTML = content;
    const modal = $("dashboard-modal");
    if (typeof modal.showModal === "function") modal.showModal();
    else modal.setAttribute("open", "");
}

function closeModal() {
    const modal = $("dashboard-modal");
    if (typeof modal.close === "function" && modal.open) modal.close();
    else modal.removeAttribute("open");
}

function detailBox(label, value, wide = false, paragraph = false) {
    const content = paragraph
        ? `<p>${escapeHtml(value || "Não informado")}</p>`
        : `<strong>${escapeHtml(value || "Não informado")}</strong>`;
    return `
        <div class="detail-box ${wide ? "detail-wide" : ""}">
            <span>${escapeHtml(label)}</span>
            ${content}
        </div>
    `;
}

async function openActivityDetails(activityId) {
    const activity = state.activities.find(item => item.id === activityId);
    if (!activity) {
        showToast("A atividade não está mais disponível na lista atual.", "error");
        return;
    }

    openModal({
        eyebrow: "Carregando",
        title: activity.client.name,
        content: `<p class="empty-state">Buscando detalhes do relatório...</p>`
    });

    let reportText = "Não há relatório vinculado a esta atividade.";
    let reportCode = "";

    if (activity.reportId) {
        try {
            const reportSnapshot = await getDoc(doc(db, DASHBOARD_CONFIG.collections.reports, activity.reportId));
            if (reportSnapshot.exists()) {
                const report = reportSnapshot.data();
                reportText = safeString(report.textoAtual ?? report.texto ?? report.relato, "Relatório sem conteúdo.");
                reportCode = safeString(report.codigo, activity.reportId);
            } else {
                reportText = "O identificador do relatório existe, mas o documento não foi localizado.";
            }
        } catch (error) {
            reportText = `Não foi possível carregar o relatório: ${errorMessage(error)}`;
        }
    }

    const checkinGps = activity.checkinCoordinates
        ? `${activity.checkinCoordinates.lat.toFixed(6)}, ${activity.checkinCoordinates.lng.toFixed(6)}`
        : "Não informado";
    const checkoutGps = activity.checkoutCoordinates
        ? `${activity.checkoutCoordinates.lat.toFixed(6)}, ${activity.checkoutCoordinates.lng.toFixed(6)}`
        : "Não informado";

    const content = `
        <div class="modal-grid">
            ${detailBox("Protocolo", `#${activity.id}`)}
            ${detailBox("Status", activity.status)}
            ${detailBox("Profissional", activity.professional.name)}
            ${detailBox("Tipo", activity.type)}
            ${detailBox("Agendamento", formatDateTime(activity.scheduledAt))}
            ${detailBox("Duração", formatDuration(activity.durationMinutes))}
            ${detailBox("Cliente", activity.client.name, true)}
            ${detailBox("Endereço cadastrado", activity.client.address || [activity.client.city, activity.client.state].filter(Boolean).join("/"), true)}
            ${detailBox("Check-in", formatDateTime(activity.checkinAt))}
            ${detailBox("GPS do check-in", checkinGps)}
            ${detailBox("Endereço do check-in", activity.checkinAddress, true)}
            ${detailBox("Check-out", formatDateTime(activity.checkoutAt))}
            ${detailBox("GPS do check-out", checkoutGps)}
            ${detailBox("Endereço do check-out", activity.checkoutAddress, true)}
            ${detailBox("Nota da agenda", activity.note || "Sem observação.", true, true)}
            ${detailBox(reportCode ? `Relatório ${reportCode}` : "Relatório", reportText, true, true)}
        </div>
    `;

    $("modal-eyebrow").textContent = "Detalhes da atividade";
    $("modal-title").textContent = activity.client.name;
    $("modal-content").innerHTML = content;
}

function openProfessionalProfile(professionalId) {
    const professional = state.professionalMap.get(professionalId) || state.profile;
    const stats = teamStatistics().find(item => item.id === professionalId) || {
        total: 0,
        completed: 0,
        trainings: 0,
        clientCount: 0,
        completionRate: 0,
        averageDuration: null,
        lastActivity: null
    };

    const photo = professional.photoUrl
        ? `<img src="${escapeHtml(professional.photoUrl)}" alt="Foto de ${escapeHtml(professional.name)}">`
        : escapeHtml(initials(professional.name));

    const content = `
        <div class="profile-hero">
            <div class="profile-avatar">${photo}</div>
            <div>
                <h3>${escapeHtml(professional.name)}</h3>
                <p>${escapeHtml(professional.role)}${professional.region ? ` · ${escapeHtml(professional.region)}` : ""}</p>
            </div>
        </div>

        <div class="profile-stat-grid">
            <div class="profile-stat"><strong>${formatNumber(stats.total)}</strong><span>Atividades</span></div>
            <div class="profile-stat"><strong>${formatNumber(stats.completed)}</strong><span>Concluídas</span></div>
            <div class="profile-stat"><strong>${formatNumber(stats.trainings)}</strong><span>Treinamentos</span></div>
            <div class="profile-stat"><strong>${stats.completionRate}%</strong><span>Conclusão</span></div>
        </div>

        <div class="modal-grid">
            ${detailBox("E-mail", professional.email)}
            ${detailBox("Telefone", professional.phone)}
            ${detailBox("Região", professional.region)}
            ${detailBox("Situação", professional.status)}
            ${detailBox("Clientes atendidos", formatNumber(stats.clientCount))}
            ${detailBox("Duração média", formatDuration(stats.averageDuration))}
            ${detailBox("Meta mensal cadastrada", professional.monthlyTarget ? formatNumber(professional.monthlyTarget) : "Não informada")}
            ${detailBox("Última atividade", stats.lastActivity ? formatDateTime(stats.lastActivity.scheduledAt) : "Sem atividade no período")}
        </div>
    `;

    openModal({
        eyebrow: "Perfil do profissional",
        title: professional.name,
        content
    });
}

function csvCell(value) {
    let text = String(value ?? "").replace(/\r?\n/g, " ").trim();
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
}

function exportCsv() {
    if (!state.filteredActivities.length) {
        showToast("Não há registros para exportar.", "error");
        return;
    }

    const headers = [
        "ID",
        "Data agendada",
        "Hora agendada",
        "Profissional",
        "Cargo/Perfil",
        "Cliente",
        "Cidade",
        "UF",
        "Tipo",
        "Status",
        "Check-in",
        "Check-out",
        "Duração em minutos",
        "Endereço do check-in",
        "Endereço do check-out",
        "Nota"
    ];

    const rows = state.filteredActivities.map(activity => [
        activity.id,
        formatDate(activity.scheduledAt),
        formatTime(activity.scheduledAt),
        activity.professional.name,
        activity.professional.role,
        activity.client.name,
        activity.client.city,
        activity.client.state,
        activity.type,
        activity.status,
        formatDateTime(activity.checkinAt),
        formatDateTime(activity.checkoutAt),
        Number.isFinite(activity.durationMinutes) ? activity.durationMinutes : "",
        activity.checkinAddress,
        activity.checkoutAddress,
        activity.note
    ]);

    const content = [headers, ...rows]
        .map(row => row.map(csvCell).join(";"))
        .join("\r\n");

    const blob = new Blob(["\ufeff", content], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `dashboard_visitas_${dateInputValue(new Date())}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    showToast(`${formatNumber(rows.length)} registros exportados.`, "success");
}

function setDefaultDateRange() {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    $("filtro-data-inicial").value = dateInputValue(firstDay);
    $("filtro-data-final").value = dateInputValue(today);
}

function clearFilters() {
    setDefaultDateRange();
    $("filtro-profissional").value = "";
    $("filtro-status").value = "";
    $("filtro-tipo").value = "";
    $("filtro-cliente").value = "";
    state.currentPage = 1;
    loadActivities().catch(() => {});
}

async function applyRequestedFilters() {
    try {
        const range = selectedDateRange();
        const rangeChanged = !state.loadedRange
            || state.loadedRange.startValue !== range.startValue
            || state.loadedRange.endValue !== range.endValue;

        if (rangeChanged) await loadActivities();
        else applyFilters({ resetPage: true });
    } catch (error) {
        showToast(errorMessage(error), "error");
    }
}

function configureAutoRefresh() {
    clearInterval(state.autoRefreshTimer);
    state.autoRefreshTimer = setInterval(() => {
        if (!document.hidden && state.user && !state.loading) {
            loadActivities({ silent: true }).catch(() => {});
        }
    }, DASHBOARD_CONFIG.autoRefreshMs);
}

async function handleAuthenticatedUser(user) {
    const sessionVersion = ++state.sessionVersion;
    resetStateForSession();
    state.user = user;
    showDashboard();
    setLoading(true, "Validando acesso...");
    setSyncStatus("loading", "Validando acesso...");

    try {
        const access = await resolveUserAccess(user);
        if (sessionVersion !== state.sessionVersion) return;

        state.profile = access.profile;
        state.canSeeAll = access.canSeeAll;

        $("dashboard-user-name").textContent = state.profile.name;
        $("dashboard-user-role").textContent = state.canSeeAll ? "Visão de gestão" : "Visão individual";

        await loadReferenceData(sessionVersion);
        if (sessionVersion !== state.sessionVersion) return;

        await loadActivities();
        configureAutoRefresh();
    } catch (error) {
        console.error("Falha ao abrir o dashboard:", error);
        setSyncStatus("error", "Acesso não liberado");
        showToast(errorMessage(error), "error");
        try {
            await signOut(auth);
        } catch (signOutError) {
            console.error("Falha ao encerrar sessão:", signOutError);
        }
    } finally {
        if (sessionVersion === state.sessionVersion) setLoading(false);
        $("dashboard-btn-entrar").disabled = false;
        $("dashboard-btn-entrar").textContent = "Entrar";
    }
}

function bindEvents() {
    setDefaultDateRange();

    $("dashboard-login-form").addEventListener("submit", async event => {
        event.preventDefault();
        const email = $("dashboard-email").value.trim();
        const password = $("dashboard-senha").value;
        const errorElement = $("dashboard-login-erro");
        errorElement.hidden = true;
        errorElement.textContent = "";

        if (!email || !password) {
            errorElement.textContent = "Informe o e-mail e a senha.";
            errorElement.hidden = false;
            return;
        }

        const button = $("dashboard-btn-entrar");
        button.disabled = true;
        button.textContent = "Entrando...";

        try {
            await signInWithEmailAndPassword(auth, email, password);
        } catch (error) {
            errorElement.textContent = errorMessage(error);
            errorElement.hidden = false;
            button.disabled = false;
            button.textContent = "Entrar";
        }
    });

    $("dashboard-btn-sair").addEventListener("click", async () => {
        if (state.loading) return;
        try {
            await signOut(auth);
        } catch (error) {
            showToast(errorMessage(error), "error");
        }
    });

    $("dashboard-btn-atualizar").addEventListener("click", () => {
        loadActivities().catch(() => {});
    });
    $("dashboard-btn-aplicar").addEventListener("click", applyRequestedFilters);
    $("dashboard-btn-limpar").addEventListener("click", clearFilters);
    $("dashboard-btn-exportar").addEventListener("click", exportCsv);
    $("mapa-modo").addEventListener("change", renderMap);
    $("dashboard-btn-google-maps").addEventListener("click", openGoogleRoute);

    $("filtro-cliente").addEventListener("keydown", event => {
        if (event.key === "Enter") applyRequestedFilters();
    });

    $("pagina-anterior").addEventListener("click", () => {
        if (state.currentPage > 1) {
            state.currentPage -= 1;
            renderTable();
        }
    });
    $("pagina-proxima").addEventListener("click", () => {
        const totalPages = Math.max(1, Math.ceil(state.filteredActivities.length / DASHBOARD_CONFIG.pageSize));
        if (state.currentPage < totalPages) {
            state.currentPage += 1;
            renderTable();
        }
    });

    $("modal-fechar").addEventListener("click", closeModal);
    $("dashboard-modal").addEventListener("click", event => {
        if (event.target === $("dashboard-modal")) closeModal();
    });

    window.addEventListener("resize", () => {
        state.map?.invalidateSize();
    });
}

bindEvents();

onAuthStateChanged(auth, user => {
    if (!user) {
        ++state.sessionVersion;
        state.user = null;
        resetStateForSession();
        showLogin();
        setSyncStatus("", "Aguardando login");
        return;
    }

    handleAuthenticatedUser(user).catch(error => {
        console.error("Erro inesperado de autenticação:", error);
        showToast(errorMessage(error), "error");
    });
});
