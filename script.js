import { initializeApp } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js";

import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js";

import { getFirestore, collection, query, where, getDocs, doc, getDoc, setDoc, runTransaction, orderBy, limit } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js";

import { firebaseConfig } from './firebase-config.js';



const app = initializeApp(firebaseConfig);

const auth = getAuth(app);

const db = getFirestore(app);



// Variáveis Globais de Gestão de Estado

let idUsuarioLogado = null;

let nomeUsuarioLogado = null;

let perfilUsuarioLogado = null;



let atividadeSelecionadaId = null;

let clienteSelecionadoId = null;

let clienteSelecionadoNome = "";

let dataCheckinAtual = null;

let objetoAtividadeGlobal = null; 

let objetoRelatorioGlobal = null; 



let listaClientes = [];
let clientesAutocompleteCarregados = false;
const cacheClientes = new Map();
const GPS_ACCURACY_MAX_METERS = 150;

let listaAtividadesAgenda = []; // Nova lista para edição de visitas

let nvClienteSelecionadoId = null;

let hashCnpjNovoCliente = null;

let callbackExclusaoAtual = null; // Callback para o modal de exclusão



// Operações assíncronas não devem reutilizar IDs de outra sessão/tela.

let versaoSessao = 0;

let operacaoEmCurso = false;

let versaoConsultaCnpj = 0;

let versaoConsultaEndereco = 0;

let consultasCadastro = 0;

let cadastroSalvando = false;

let sequenciaPendentes = 0;

let sequenciaAgenda = 0;

let sequenciaHistorico = 0;



function escaparHtml(valor) {

    return String(valor ?? '').replace(/[&<>"']/g, c => ({

        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'

    }[c]));

}

function sessaoAtual() {

    if (!auth.currentUser || !idUsuarioLogado) throw new Error('Entre novamente para continuar.');

    return { uid: auth.currentUser.uid, id: idUsuarioLogado, versao: versaoSessao };

}

function sessaoValida(sessao) {

    return sessao.versao === versaoSessao && auth.currentUser?.uid === sessao.uid && idUsuarioLogado === sessao.id;

}

function exigirSessao(sessao) {

    if (!sessaoValida(sessao)) throw new Error('Sua sessão mudou. Entre novamente.');

}

function validarResponsavel(dados, sessao) {

    exigirSessao(sessao);

    if (dados.ptvId !== sessao.id) throw new Error('Esta visita não pertence ao usuário conectado.');

}

function informarErro(titulo, erro) {

    console.error(titulo, erro);

    const mensagens = {

        'permission-denied': 'Você não tem permissão para esta operação. Confira as regras do Firestore.',

        'unavailable': 'Serviço indisponível. Confira a conexão e tente novamente.',

        'failed-precondition': 'A operação depende de uma configuração do banco. Consulte o erro no console.',

        'not-found': 'O registro não foi encontrado. Atualize a tela.'

    };

    window.mostrarAlerta(titulo, mensagens[erro?.code] || erro?.message || 'Tente novamente.');

}

function obterData(valor) {

    const data = valor?.toDate ? valor.toDate() : (valor == null ? new Date(NaN) : new Date(valor));

    return Number.isFinite(data.getTime()) ? data : null;

}

function tempoData(valor) { return obterData(valor)?.getTime() ?? 0; }

function lerDataHora(data, hora) {

    if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !/^\d{2}:\d{2}$/.test(hora)) throw new Error('Informe uma data e um horário válidos.');

    const resultado = new Date(`${data}T${hora}:00`);

    if (!obterData(resultado) || formatarDataHoraPT(resultado).dataInput !== data || formatarDataHoraPT(resultado).hora !== hora) throw new Error('Data ou horário inválidos.');

    return resultado;

}

function coordenadasValidas(lat, lng) {

    return lat !== null && lat !== undefined && lat !== '' && lng !== null && lng !== undefined && lng !== '' &&

        Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) && Math.abs(Number(lat)) <= 90 && Math.abs(Number(lng)) <= 180;

}

function obterPosicao() {

    return new Promise((resolve, reject) => {

        if (!navigator.geolocation) return reject(new Error('Este navegador não disponibiliza geolocalização.'));

        navigator.geolocation.getCurrentPosition(resolve, erro => reject(new Error(

            erro.code === 1 ? 'Permita o acesso à localização para continuar.' : 'Não foi possível obter o GPS. Tente novamente em um local com melhor sinal.'

        )), { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });

    });

}

async function buscarJson(url) {

    const controller = new AbortController();

    const temporizador = setTimeout(() => controller.abort(), 12000);

    try {

        const resposta = await fetch(url, { signal: controller.signal });

        if (!resposta.ok) throw new Error(`Consulta indisponível (HTTP ${resposta.status}).`);

        return await resposta.json();

    } finally { clearTimeout(temporizador); }

}

function obterCliente(clienteId) {
    if (!clienteId) return Promise.resolve(null);
    if (cacheClientes.has(clienteId)) return Promise.resolve(cacheClientes.get(clienteId));
    return getDoc(doc(db, 'clientes', clienteId)).then(snap => {
        const cliente = snap.exists() ? { id: snap.id, ...snap.data() } : null;
        cacheClientes.set(clienteId, cliente);
        return cliente;
    });
}

function validarPrecisaoGps(pos) {
    const accuracy = Number(pos?.coords?.accuracy);
    if (!Number.isFinite(accuracy) || accuracy < 0) throw new Error('O GPS não retornou uma precisão válida.');
    if (accuracy > GPS_ACCURACY_MAX_METERS) throw new Error(`A precisão do GPS está baixa (${Math.round(accuracy)} m). Aguarde alguns segundos em local aberto e tente novamente.`);
    return accuracy;
}

function limparEstadoVisita() {

    atividadeSelecionadaId = null; clienteSelecionadoId = null; clienteSelecionadoNome = '';

    dataCheckinAtual = null; objetoAtividadeGlobal = null; objetoRelatorioGlobal = null; visitaEmEdicao = null;

}

function atualizarBotaoCadastro() {

    const btn = document.getElementById('btn-salvar-cliente');

    if (btn) btn.disabled = cadastroSalvando || consultasCadastro > 0;

}

function invalidarCoordenadas() {

    versaoConsultaEndereco++;

    const campo = document.getElementById('cc-cep');

    if (campo) { delete campo.dataset.lat; delete campo.dataset.lng; }

    const mapa = document.getElementById('mapa-container');

    if (mapa) mapa.style.display = 'none';

}

function limparCadastroCliente() {

    versaoConsultaCnpj++; hashCnpjNovoCliente = null; invalidarCoordenadas();

    ['cc-cnpj','cc-nome','cc-cep','cc-endereco','cc-numero','cc-bairro','cc-cidade','cc-uf'].forEach(id => {

        const el = document.getElementById(id); if (el) el.value = '';

    });

    ['cc-status-cnpj','cc-status-cep'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = ''; });

}

function cnpjValido(valor) {

    if (!/^\d{14}$/.test(valor) || /^(\d)\1{13}$/.test(valor)) return false;

    const digito = base => {

        let peso = base.length - 7, soma = 0;

        for (const n of base) { soma += Number(n) * peso--; if (peso < 2) peso = 9; }

        const resto = soma % 11; return resto < 2 ? '0' : String(11 - resto);

    };

    return digito(valor.slice(0,12)) === valor[12] && digito(valor.slice(0,13)) === valor[13];

}



// === INICIALIZAÇÃO E AUTENTICAÇÃO ===

function inicializarAplicativo() {

    // Alertas precisam continuar visíveis quando o app-container está oculto.

    ['modal-alerta-generico','modal-aviso-andamento','modal-confirmar-exclusao'].forEach(id => {

        const el = document.getElementById(id); if (el) document.body.appendChild(el);

    });

    configurarNavegacao(); configurarBotoesModal(); configurarEventosGlobais();

    configurarTelaNovaVisita(); configurarTelaCadastroCliente(); configurarTelaDetalhesVisita();

    mostrarApenasTela('tela-inicio');

    document.getElementById('login-erro').style.display = 'none';

    document.getElementById('form-login')?.addEventListener('submit', async e => {

        e.preventDefault();

        const btn = document.getElementById('btn-entrar');

        const erro = document.getElementById('login-erro');

        btn.disabled = true; btn.textContent = 'Autenticando...'; erro.style.display = 'none';

        try {

            await signInWithEmailAndPassword(auth, document.getElementById('login-email').value.trim(), document.getElementById('login-senha').value);

        } catch (falha) {

            erro.textContent = falha.code === 'auth/network-request-failed' ? 'Confira sua conexão e tente novamente.' : 'Não foi possível entrar. Confira e-mail e senha.';

            erro.style.display = 'block'; btn.disabled = false; btn.textContent = 'Entrar';

        }

    });

    document.getElementById('btn-logout')?.addEventListener('click', async () => {

        if (operacaoEmCurso) return window.mostrarAlerta('Aguarde', 'Aguarde o término da operação atual.');

        if (!confirm('Deseja sair do aplicativo? Alterações não salvas serão descartadas.')) return;

        try { await signOut(auth); } catch (erro) { informarErro('Erro ao sair', erro); }

    });

    onAuthStateChanged(auth, async user => {

        const versao = ++versaoSessao;

        idUsuarioLogado = null; nomeUsuarioLogado = null; perfilUsuarioLogado = null;

        limparEstadoVisita(); listaClientes = []; listaAtividadesAgenda = []; nvClienteSelecionadoId = null;

        limparCadastroCliente();

        document.getElementById('rel-texto').value = '';

        document.getElementById('nv-cliente').value = '';

        ['area-visitas','area-agenda','area-historico-visitas','nv-cliente-dropdown'].forEach(id => document.getElementById(id).textContent = '');
        clientesAutocompleteCarregados = false;
        cacheClientes.clear();

        document.getElementById('tela-confirmacao').style.display = 'none';

        window.fecharConfirmacaoExclusao();

        document.getElementById('app-container').style.display = 'none';

        document.getElementById('tela-login').style.display = 'flex';

        mostrarApenasTela('tela-inicio');

        const btn = document.getElementById('btn-entrar');

        if (!user) { btn.disabled = false; btn.textContent = 'Entrar'; document.getElementById('login-senha').value = ''; return; }

        btn.disabled = true; btn.textContent = 'Validando acesso...';

        try {

            let perfil = null;

            for (const [colecao, nome] of [['assistencia','Assistente'], ['promotores','Promotor']]) {

                const snap = await getDocs(query(collection(db, colecao), where('email', '==', user.email)));

                if (versao !== versaoSessao) return;

                if (!snap.empty) { perfil = { id: snap.docs[0].id, nome: snap.docs[0].data().nome || 'Profissional', tipo: nome }; break; }

            }

            if (!perfil) throw new Error("E-mail não encontrado nas coleções 'assistencia' ou 'promotores'.");

            if (versao !== versaoSessao) return;

            idUsuarioLogado = perfil.id; nomeUsuarioLogado = perfil.nome; perfilUsuarioLogado = perfil.tipo;

            document.getElementById('tela-login').style.display = 'none';

            document.getElementById('app-container').style.display = 'flex';

            document.getElementById('login-senha').value = '';

            await carregarAtividadesPendentes();

        } catch (erro) {

            if (versao !== versaoSessao) return;

            informarErro('Erro de acesso', erro);

            try { await signOut(auth); } catch (falha) { console.error(falha); }

            btn.disabled = false; btn.textContent = 'Entrar';

        }

    });

}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inicializarAplicativo, { once: true });

else queueMicrotask(inicializarAplicativo);



// === FUNÇÕES DE ALERTA NATIVO ===

window.mostrarAlerta = function(titulo, msg) {

    document.getElementById('alerta-titulo').textContent = titulo;

    document.getElementById('alerta-msg').textContent = msg;

    document.getElementById('modal-alerta-generico').style.display = 'flex';

};

window.fecharAlerta = function() { document.getElementById('modal-alerta-generico').style.display = 'none'; };

window.mostrarAvisoAndamento = function() { document.getElementById('modal-aviso-andamento').style.display = 'flex'; };



window.mostrarConfirmacaoExclusao = function(callback, encerrar = false) {

    callbackExclusaoAtual = callback;

    const modal = document.getElementById('modal-confirmar-exclusao');

    modal.querySelector('h3').textContent = encerrar ? 'Encerrar visita?' : 'Excluir visita?';

    modal.querySelector('p').textContent = encerrar ? 'Deseja finalizar esta visita?' : 'Deseja mover esta visita para a lixeira?';

    modal.querySelector('.alert-btn-red').textContent = encerrar ? 'ENCERRAR' : 'EXCLUIR';

    modal.style.display = 'flex';

};

window.confirmarExclusao = async function() {

    const callback = callbackExclusaoAtual;

    window.fecharConfirmacaoExclusao();

    if (callback) { try { await callback(); } catch (erro) { informarErro('Não foi possível concluir', erro); } }

};

window.fecharConfirmacaoExclusao = function() {

    document.getElementById('modal-confirmar-exclusao').style.display = 'none';

    callbackExclusaoAtual = null;

};



// === FUNÇÕES DE LOCALIZAÇÃO ===

async function obterEnderecoPorCoords(lat, lng) {

    try {

        const data = await buscarJson(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`); return data.display_name || "Endereço não encontrado na base de mapas.";

    } catch(e) { return "Erro ao traduzir coordenadas para endereço."; }

}

async function obterCoordsPorEndereco(endereco) {

    try {

        const data = await buscarJson(`https://nominatim.openstreetmap.org/search?format=json&countrycodes=br&q=${encodeURIComponent(endereco)}&limit=1`);

        if(data.length > 0) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }; return null;

    } catch(e) { return null; }

}

function calcularDistancia(lat1, lon1, lat2, lon2) {

    const R = 6371e3; const rad = Math.PI / 180;

    const dLat = (lat2 - lat1) * rad; const dLon = (lon2 - lon1) * rad;

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); return R * c; 

}



// === FUNÇÕES AUXILIARES ===

function formatarDataHoraPT(data) {

    if (!obterData(data)) return { hora: "--:--", data: "--/--/----", dataInput: "", completo: "--:-- | --/--/----" };

    const d = obterData(data);

    const horas = String(d.getHours()).padStart(2, '0'); const minutos = String(d.getMinutes()).padStart(2, '0');

    const dia = String(d.getDate()).padStart(2, '0'); const mes = String(d.getMonth() + 1).padStart(2, '0'); const ano = d.getFullYear();

    return { hora: `${horas}:${minutos}`, data: `${dia}/${mes}/${ano}`, dataInput: `${ano}-${mes}-${dia}`, completo: `${horas}:${minutos} | ${dia}/${mes}/${ano}` };

}

function formatarDataAgenda(data) {

    const d = obterData(data);

    if (!d) return { diaMes: "Data não informada", hora: "--:--" };

    const dia = String(d.getDate()).padStart(2, '0'); const meses = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

    return { diaMes: `${dia} - ${meses[d.getMonth()]}`, hora: `${String(d.getHours()).padStart(2, '0')}h${String(d.getMinutes()).padStart(2, '0')}` };

}

function obterIniciais(nome) { return String(nome || 'TEC').trim().split(/\s+/).map(n => n[0] || '').join('').toUpperCase().substring(0, 3); }

function ofuscarCNPJ(cnpjPuro) { return "C-" + (BigInt(cnpjPuro) * 999999937n).toString(16).toUpperCase(); }



function mostrarApenasTela(idTelaAlvo) {

    const telas = ['tela-inicio', 'tela-agenda', 'tela-historico', 'tela-nova-visita', 'tela-cadastro-cliente', 'tela-visita-atual', 'tela-relatorio', 'tela-perfil', 'tela-detalhes-visita'];

    telas.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = (id === idTelaAlvo) ? 'block' : 'none'; });

    const indice = { 'tela-inicio': 0, 'tela-agenda': 1, 'tela-historico': 2, 'tela-perfil': 3 }[idTelaAlvo];

    document.querySelectorAll('.nav-item').forEach((el, i) => el.classList.toggle('active', i === indice));

    if (idTelaAlvo === 'tela-relatorio') {

        document.getElementById('tela-relatorio').style.display = 'flex';

        document.getElementById('header-principal').style.display = 'none';

        document.querySelector('.bottom-nav').style.display = 'none';

    } else {

        document.getElementById('header-principal').style.display = 'flex';

        document.querySelector('.bottom-nav').style.display = 'flex';

    }

}



// === TELAS DE LEITURA ===

async function carregarAtividadesPendentes() {

    if (!idUsuarioLogado) return;

    const sessao = sessaoAtual(), pedido = ++sequenciaPendentes;

    const area = document.getElementById('area-visitas');

    area.textContent = 'Carregando visitas...';

    try {

        const snap = await getDocs(query(collection(db, 'atividades'), where('ptvId', '==', sessao.id), where('status', 'in', ['Pendente','Em andamento'])));

        const atividades = snap.docs.map(d => ({ ...d.data(), id: d.id }));

        atividades.sort((a,b) => Number(b.status === 'Em andamento') - Number(a.status === 'Em andamento') || tempoData(a.data) - tempoData(b.data));

        if (!sessaoValida(sessao) || pedido !== sequenciaPendentes) return;

        if (!atividades.length) { limparEstadoVisita(); area.textContent = 'Nenhuma visita pendente.'; return; }

        const atividade = atividades[0];

        const cliente = atividade.clienteId ? await obterCliente(atividade.clienteId) : null;

        const nomeCliente = cliente?.nome || 'Cliente não encontrado';

        let relatorio = null;

        if (atividade.status === 'Em andamento' && atividade.relatorioId) {

            const registro = await getDoc(doc(db,'relatorios',atividade.relatorioId));

            if (registro.exists()) {

                const dados = registro.data();

                if (dados.atividadeId !== atividade.id || dados.ptvId !== sessao.id) throw new Error('O relatório associado não corresponde a esta visita.');

                relatorio = { ...dados, id: registro.id };

            }

        }

        if (!sessaoValida(sessao) || pedido !== sequenciaPendentes) return;

        limparEstadoVisita();

        if (atividade.status === 'Em andamento') {

            atividadeSelecionadaId = atividade.id; clienteSelecionadoId = atividade.clienteId; clienteSelecionadoNome = nomeCliente;

            objetoAtividadeGlobal = atividade; objetoRelatorioGlobal = relatorio;

            atualizarInterfaceVisitaAtual(); return;

        }

        area.innerHTML = `<div class="card-visita"><div class="card-info"><h3 class="card-titulo">${escaparHtml(nomeCliente)}</h3></div><button class="btn-checkin" style="width:auto">Check-in</button></div>`;

        const btn = area.querySelector('button');

        btn.disabled = !cliente;

        btn.addEventListener('click', () => window.abrirConfirmacaoCheckin(atividade.id, nomeCliente, atividade.clienteId));

    } catch (erro) {

        if (!sessaoValida(sessao) || pedido !== sequenciaPendentes) return;

        area.textContent = 'Não foi possível carregar as visitas.'; informarErro('Erro ao carregar visitas', erro);

    }

}



async function carregarAgenda() {

    if (!idUsuarioLogado) return;

    const sessao = sessaoAtual(), pedido = ++sequenciaAgenda;

    const areaAgenda = document.getElementById('area-agenda');

    areaAgenda.innerHTML = `<p style="text-align: center; color: #777; margin-top: 20px;">A carregar agenda...</p>`;

    try {

        // Inclui "Em andamento" na pesquisa

        const q = query(collection(db, "atividades"), where("ptvId", "==", idUsuarioLogado), where("status", "in", ["Pendente", "Em andamento"]));

        const querySnapshot = await getDocs(q);



        if (!sessaoValida(sessao) || pedido !== sequenciaAgenda) return;

        listaAtividadesAgenda = [];

        if (querySnapshot.empty) { areaAgenda.innerHTML = `<p style="text-align: center; color: #777; margin-top: 20px;">Nenhuma visita agendada.</p>`; return; }



        const atividadesCarregadas = await Promise.all(querySnapshot.docs.map(async documento => {

            const dados = documento.data(); dados.id = documento.id;
            dados.nomeCliente = "Cliente não encontrado"; dados.enderecoCompleto = "";

            const cliente = dados.clienteId ? await obterCliente(dados.clienteId) : null;
            if (cliente) {
                dados.nomeCliente = cliente.nome || "Cliente sem nome";
                dados.enderecoCompleto = cliente.enderecoCompleto || '';
            } else if (!dados.clienteId) {
                dados.nomeCliente = "Desconhecido";
            }

            return dados;

        }));



        if (!sessaoValida(sessao) || pedido !== sequenciaAgenda) return;

        listaAtividadesAgenda = atividadesCarregadas.sort((a, b) => tempoData(a.data) - tempoData(b.data));

        areaAgenda.innerHTML = '';



        listaAtividadesAgenda.forEach((atividade, index) => {

            const fData = formatarDataAgenda(atividade.data);

            const tituloSecao = index === 0 ? "Visitas agendadas" : "";

            if (tituloSecao) areaAgenda.innerHTML += `<h2 class="section-subtitle">${tituloSecao}</h2>`;

            const botaoGpsHTML = atividade.enderecoCompleto ? `<button class="btn-gps" data-gps-index="${index}">Abrir no GPS</button>` : '<p>Endereço não cadastrado.</p>';

            const iconeFicha = `<button class="agenda-btn-ficha" data-ficha-index="${index}" title="Gerenciar Visita"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"></rect><rect x="6" y="8" width="4" height="4" rx="1"></rect><line x1="13" y1="9" x2="18" y2="9"></line><line x1="13" y1="12" x2="18" y2="12"></line><line x1="13" y1="15" x2="18" y2="15"></line></svg></button>`;

            // Badge para mostrar que está em andamento

            const badgeAndamento = atividade.status === "Em andamento" ? `<span style="font-size: 0.65rem; background: var(--color-red); color: white; padding: 2px 6px; border-radius: 10px; margin-left: 8px; vertical-align: middle;">EM ANDAMENTO</span>` : "";



            areaAgenda.innerHTML += `

                <div class="card-agenda">

                    <div class="agenda-header"><span class="agenda-data">${fData.diaMes}</span>${iconeFicha}</div>

                    <div class="agenda-cliente">${escaparHtml(atividade.nomeCliente)} ${badgeAndamento}</div>

                    <div class="agenda-info-row"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>${fData.hora}</div>

                    <div class="agenda-info-row"><svg viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>${escaparHtml(atividade.enderecoCompleto)}</div>

                    <div class="agenda-motivo">${escaparHtml(atividade.objetivo || "Visita comercial")}</div>

                    ${botaoGpsHTML}

                </div>

            `;

        });

        areaAgenda.querySelectorAll('[data-ficha-index]').forEach(btn => btn.addEventListener('click', () => {
            if (!operacaoEmCurso) window.abrirDetalhesVisita(Number(btn.dataset.fichaIndex));
        }));

        areaAgenda.querySelectorAll('[data-gps-index]').forEach(btn => btn.addEventListener('click', () => {

            const atividade = listaAtividadesAgenda[Number(btn.dataset.gpsIndex)];

            if (atividade?.enderecoCompleto) window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(atividade.enderecoCompleto)}`, '_blank', 'noopener,noreferrer');

        }));

    } catch (error) { if (sessaoValida(sessao) && pedido === sequenciaAgenda) { areaAgenda.textContent = 'Não foi possível carregar a agenda.'; informarErro('Erro na agenda', error); } }

}



async function carregarHistoricoVisitas() {

    if (!idUsuarioLogado) return;

    const sessao = sessaoAtual(), pedido = ++sequenciaHistorico;

    const areaHistorico = document.getElementById('area-historico-visitas');

    areaHistorico.innerHTML = `<p style="text-align: center; color: #777; margin-top: 20px;">A carregar histórico...</p>`;

    try {

        const q = query(collection(db, "atividades"), where("ptvId", "==", idUsuarioLogado), where("status", "==", "Concluída"), orderBy("data", "desc"), limit(10));

        let querySnapshot;

        try { querySnapshot = await getDocs(q); }

        catch (erro) {

            if (erro.code !== 'failed-precondition') throw erro;

            // Compatibilidade até a criação do índice composto no Firestore.

            querySnapshot = await getDocs(query(collection(db, 'atividades'), where('ptvId', '==', sessao.id), where('status', '==', 'Concluída')));

        }

        if (!sessaoValida(sessao) || pedido !== sequenciaHistorico) return;



        if (querySnapshot.empty) { areaHistorico.innerHTML = `<p style="text-align: center; color: #777; margin-top: 20px;">Nenhuma visita concluída.</p>`; return; }



        const historicoArray = await Promise.all(querySnapshot.docs.map(async documento => {

            const dados = documento.data(); dados.id = documento.id; dados.nomeCliente = "Cliente não encontrado";
            const cliente = dados.clienteId ? await obterCliente(dados.clienteId) : null;
            dados.nomeCliente = cliente?.nome || (dados.clienteId ? "Cliente Desconhecido" : "Desconhecido");
            return dados;

        }));



        if (!sessaoValida(sessao) || pedido !== sequenciaHistorico) return;

        historicoArray.sort((a, b) => tempoData(b.data) - tempoData(a.data));

        areaHistorico.innerHTML = '';

        historicoArray.slice(0, 10).forEach(visita => {

            const formato = formatarDataHoraPT(visita.data);

            areaHistorico.innerHTML += `

                <div class="card-historico">

                    <div><div class="hist-cliente">${escaparHtml(visita.nomeCliente)}</div><div class="hist-data">${formato.data} às ${formato.hora}</div></div>

                    <div><span class="hist-status">Concluída</span></div>

                </div>

            `;

        });

    } catch (error) { if (sessaoValida(sessao) && pedido === sequenciaHistorico) { areaHistorico.textContent = "Não foi possível carregar o histórico."; informarErro("Erro no histórico", error); } }

}



// === TELA: NOVA VISITA ===

function configurarTelaNovaVisita() {

    const inputNota = document.getElementById('nv-nota');

    const countNota = document.getElementById('nv-char-count');

    if(inputNota) { inputNota.addEventListener('input', () => { countNota.textContent = `${inputNota.value.length}/600`; }); }



    const inputCliente = document.getElementById('nv-cliente');

    const dropCliente = document.getElementById('nv-cliente-dropdown');

    if (inputCliente) {

        inputCliente.addEventListener('input', (e) => {

            nvClienteSelecionadoId = null; dropCliente.innerHTML = '';

            const txt = e.target.value.toLowerCase();

            const filtrados = listaClientes.filter(item => String(item.nome || '').toLowerCase().includes(txt));



            const divNovo = document.createElement('div');

            divNovo.className = 'autocomplete-item autocomplete-item-novo';

            divNovo.textContent = `+ Cadastrar novo cliente`;

            divNovo.addEventListener('click', () => { if (operacaoEmCurso) return; limparCadastroCliente(); mostrarApenasTela('tela-cadastro-cliente'); dropCliente.style.display = 'none'; });

            dropCliente.appendChild(divNovo);



            filtrados.forEach(item => {

                const div = document.createElement('div'); div.className = 'autocomplete-item'; div.textContent = item.nome;

                div.addEventListener('click', () => { nvClienteSelecionadoId = item.id; inputCliente.value = item.nome; dropCliente.style.display = 'none'; });

                dropCliente.appendChild(div);

            });

            dropCliente.style.display = 'block';

        });

        inputCliente.addEventListener('focus', () => dropCliente.style.display = 'block');

        document.addEventListener('click', (e) => { if(!e.target.closest('#nv-cliente') && !e.target.closest('#nv-cliente-dropdown')) dropCliente.style.display = 'none'; });

    }



    const btnAgendar = document.getElementById('btn-agendar-visita');

    if (btnAgendar) {

        btnAgendar.addEventListener('click', async () => {

            if (operacaoEmCurso) return;

            try {

                const sessao = sessaoAtual();

                if (!nvClienteSelecionadoId) throw new Error('Selecione um cliente da lista.');

                const clienteId = nvClienteSelecionadoId;

                const data = lerDataHora(document.getElementById('nv-data').value, document.getElementById('nv-hora').value);

                const objetivo = document.querySelector('input[name="tipoVisita"]:checked')?.value;

                if (!objetivo) throw new Error('Selecione o tipo de visita.');

                const nota = document.getElementById('nv-nota').value.trim();

                if (nota.length > 600) throw new Error('A nota deve ter até 600 caracteres.');

                operacaoEmCurso = true; btnAgendar.disabled = true; btnAgendar.textContent = 'Agendando...';

                const cliente = await obterCliente(clienteId);

                exigirSessao(sessao);

                if (!cliente || cliente.status !== 'Ativo') throw new Error('O cliente não está ativo. Atualize a lista.');

                const agora = new Date();

                await setDoc(doc(collection(db, 'atividades')), {

                    tipo: 'Visita', data, ptvId: sessao.id, clienteId, objetivo, nota,

                    status: 'Pendente', criadoEm: agora, atualizadoEm: agora

                });

                if (!sessaoValida(sessao)) return;

                inputCliente.value = ''; nvClienteSelecionadoId = null;

                ['nv-data','nv-hora','nv-nota'].forEach(id => document.getElementById(id).value = '');

                countNota.textContent = '0/600';

                document.querySelector('input[name="tipoVisita"][value="Visita comercial"]').checked = true;

                window.mostrarAlerta('Sucesso', 'Visita agendada.');

                mostrarApenasTela('tela-agenda'); await carregarAgenda();

            } catch (erro) { informarErro('Não foi possível agendar', erro); }

            finally { operacaoEmCurso = false; btnAgendar.disabled = false; btnAgendar.textContent = 'Agendar'; }

        });

    }

}



// === TELA 8: DETALHES DA VISITA ===

let visitaEmEdicao = null;



window.abrirDetalhesVisita = function(index) {

    if (operacaoEmCurso) return;

    visitaEmEdicao = listaAtividadesAgenda[index];

    if (!visitaEmEdicao) return window.mostrarAlerta("Aviso", "Atualize a agenda e tente novamente.");

    const objData = formatarDataHoraPT(visitaEmEdicao.data);

    document.getElementById('det-protocolo').textContent = `#${visitaEmEdicao.id}`;

    document.getElementById('det-nome-cliente').textContent = visitaEmEdicao.nomeCliente;

    // Atualiza o iframe do Mapa

    document.getElementById('det-mapa-container').style.display = visitaEmEdicao.enderecoCompleto ? 'block' : 'none';

    document.getElementById('det-mapa-iframe').src = `https://maps.google.com/maps?q=${encodeURIComponent(visitaEmEdicao.enderecoCompleto)}&output=embed`;



    // Preenche inputs

    document.getElementById('det-data').value = objData.dataInput;

    document.getElementById('det-hora').value = objData.hora;

    document.getElementById('det-nota').value = visitaEmEdicao.nota || "";



    // Preenche radio buttons

    const objValue = visitaEmEdicao.objetivo || "Visita comercial";

    document.querySelectorAll('input[name="detTipoVisita"]').forEach(rad => { rad.checked = rad.value === objValue; });



    // Bloqueia campos se não for pendente

    const inputs = ['det-data', 'det-hora', 'det-nota', 'btn-salvar-detalhes'];

    const emAndamento = (visitaEmEdicao.status === 'Em andamento' || visitaEmEdicao.status === 'Concluída');

    inputs.forEach(id => { document.getElementById(id).disabled = emAndamento; });

    document.querySelectorAll('input[name="detTipoVisita"]').forEach(radio => radio.disabled = emAndamento);



    if (emAndamento) {

        document.getElementById('btn-salvar-detalhes').style.opacity = '0.5';

        window.mostrarAvisoAndamento();

    } else {

        document.getElementById('btn-salvar-detalhes').style.opacity = '1';

    }



    mostrarApenasTela('tela-detalhes-visita');

};



function configurarTelaDetalhesVisita() {

    document.getElementById('btn-voltar-detalhes')?.addEventListener('click', () => { if (!operacaoEmCurso) mostrarApenasTela('tela-agenda'); });

    document.getElementById('btn-excluir-visita')?.addEventListener('click', () => {

        if (!visitaEmEdicao || operacaoEmCurso) return;

        const id = visitaEmEdicao.id;

        window.mostrarConfirmacaoExclusao(async () => {

            if (operacaoEmCurso) return;

            const sessao = sessaoAtual();

            operacaoEmCurso = true;

            try {

                await runTransaction(db, async tx => {

                    const ref = doc(db, 'atividades', id), snap = await tx.get(ref);

                    if (!snap.exists()) throw new Error('A visita já foi excluída.');

                    validarResponsavel(snap.data(), sessao);

                    tx.set(doc(db, 'atividades_excluidas', id), { ...snap.data(), id, excluidoEm: new Date(), excluidoPor: sessao.id });

                    tx.delete(ref);

                });

                if (!sessaoValida(sessao)) return;

                if (atividadeSelecionadaId === id) limparEstadoVisita();

                window.mostrarAlerta('Sucesso', 'Visita movida para a lixeira.');

                mostrarApenasTela('tela-agenda'); await carregarAgenda();

            } finally { operacaoEmCurso = false; }

        });

    });

    document.getElementById('btn-salvar-detalhes')?.addEventListener('click', async () => {

        if (!visitaEmEdicao || operacaoEmCurso) return;

        const btn = document.getElementById('btn-salvar-detalhes');

        try {

            const sessao = sessaoAtual(), id = visitaEmEdicao.id;

            const data = lerDataHora(document.getElementById('det-data').value, document.getElementById('det-hora').value);

            const objetivo = document.querySelector('input[name="detTipoVisita"]:checked')?.value;

            if (!objetivo) throw new Error('Selecione um tipo de visita disponível.');

            const nota = document.getElementById('det-nota').value.trim();

            if (nota.length > 600) throw new Error('A nota deve ter até 600 caracteres.');

            operacaoEmCurso = true; btn.disabled = true; btn.textContent = 'Salvando...';

            await runTransaction(db, async tx => {

                const ref = doc(db,'atividades',id), snap = await tx.get(ref);

                if (!snap.exists()) throw new Error('Visita não encontrada.');

                validarResponsavel(snap.data(), sessao);

                if (snap.data().status !== 'Pendente') throw new Error('Somente visitas pendentes podem ser editadas.');

                tx.update(ref, { data, objetivo, nota, atualizadoEm: new Date() });

            });

            if (!sessaoValida(sessao)) return;

            window.mostrarAlerta('Sucesso', 'Visita atualizada.'); mostrarApenasTela('tela-agenda'); await carregarAgenda();

        } catch (erro) { informarErro('Erro ao atualizar', erro); }

        finally { operacaoEmCurso = false; btn.disabled = false; btn.textContent = 'Salvar'; }

    });

}



// === CADASTRO DE NOVO CLIENTE ===

async function carregarDadosParaAutocomplete() {

    const sessao = sessaoAtual();

    if (clientesAutocompleteCarregados) {
        const campo = document.getElementById('nv-cliente');
        if (document.activeElement === campo && !nvClienteSelecionadoId) campo.dispatchEvent(new Event('input'));
        return;
    }

    try {
        const snap = await getDocs(query(collection(db,'clientes'), where('status','==','Ativo')));
        if (!sessaoValida(sessao)) return;

        listaClientes = snap.docs.map(d => {
            const dados = d.data();
            const cliente = { id: d.id, ...dados, nome: String(dados.nome || 'Cliente sem nome') };
            cacheClientes.set(d.id, cliente);
            return { id: d.id, nome: cliente.nome };
        });

        clientesAutocompleteCarregados = true;
        const campo = document.getElementById('nv-cliente');
        if (document.activeElement === campo && !nvClienteSelecionadoId) campo.dispatchEvent(new Event('input'));
    } catch (erro) {
        if (sessaoValida(sessao)) informarErro('Erro ao carregar clientes', erro);
    }
}

function configurarTelaCadastroCliente() {

    const campo = id => document.getElementById(id);

    const cnpj = campo('cc-cnpj'), cep = campo('cc-cep');

    const valoresEndereco = () => ['cc-endereco','cc-numero','cc-bairro','cc-cidade','cc-uf'].map(id => campo(id).value.trim()).join(', ');

    const mostrarMapa = endereco => {

        campo('mapa-iframe').src = `https://maps.google.com/maps?q=${encodeURIComponent(endereco)}&output=embed`;

        campo('mapa-container').style.display = 'block';

    };

    // Permite cadastro manual caso os serviços de consulta estejam indisponíveis.

    campo('cc-cidade').readOnly = false; campo('cc-uf').readOnly = false; campo('cc-uf').maxLength = 2;

    cnpj.addEventListener('input', () => {

        hashCnpjNovoCliente = null; versaoConsultaCnpj++; invalidarCoordenadas(); campo('cc-status-cnpj').textContent = '';

    });

    ['cc-cep','cc-endereco','cc-numero','cc-bairro','cc-cidade','cc-uf'].forEach(id => campo(id).addEventListener('input', invalidarCoordenadas));

    cnpj.addEventListener('blur', async () => {

        if (!idUsuarioLogado || cadastroSalvando) return;

        const puro = cnpj.value.replace(/\D/g, ''), pedido = ++versaoConsultaCnpj, sessao = sessaoAtual();

        const lbl = campo('cc-status-cnpj');

        if (!cnpjValido(puro)) { hashCnpjNovoCliente = null; lbl.textContent = ' (CNPJ inválido)'; return; }

        const codigo = ofuscarCNPJ(puro);

        hashCnpjNovoCliente = codigo;

        const enderecoVersao = versaoConsultaEndereco;

        const valoresAntes = ['cc-nome','cc-cep','cc-endereco','cc-numero','cc-bairro','cc-cidade','cc-uf'].map(id => campo(id).value);

        consultasCadastro++; atualizarBotaoCadastro(); lbl.textContent = ' (Consultando...)';

        try {

            const snap = await getDocs(query(collection(db,'clientes'), where('codigoCnpj','==',codigo)));

            if (!sessaoValida(sessao) || pedido !== versaoConsultaCnpj) return;

            if (!snap.empty) {

                const existente = snap.docs[0];

                if (existente.data().status !== 'Ativo') throw new Error('Este CNPJ já existe, mas está inativo. Solicite a reativação do cadastro.');

                nvClienteSelecionadoId = existente.id; campo('nv-cliente').value = existente.data().nome || '';

                limparCadastroCliente(); mostrarApenasTela('tela-nova-visita'); window.mostrarAlerta('Cliente localizado', 'Esta loja já está cadastrada e foi selecionada.'); return;

            }

            const dados = await buscarJson(`https://brasilapi.com.br/api/cnpj/v1/${puro}`);

            if (!sessaoValida(sessao) || pedido !== versaoConsultaCnpj) return;

            // Uma resposta atrasada não deve substituir o que o usuário acabou de digitar.

            const ids = ['cc-nome','cc-cep','cc-endereco','cc-numero','cc-bairro','cc-cidade','cc-uf'];

            const valores = [dados.nome_fantasia || dados.razao_social || '', String(dados.cep || '').replace(/\D/g,''), dados.logradouro || '', dados.numero || '', dados.bairro || '', dados.municipio || '', dados.uf || ''];

            if (enderecoVersao === versaoConsultaEndereco && ids.every((id,i) => campo(id).value === valoresAntes[i])) {

                invalidarCoordenadas(); ids.forEach((id,i) => campo(id).value = valores[i]);

                if (dados.logradouro && dados.municipio) mostrarMapa(valoresEndereco());

            }

            lbl.textContent = ' (Consulta concluída)';

        } catch (erro) {

            if (sessaoValida(sessao) && pedido === versaoConsultaCnpj) {

                lbl.textContent = ' (Confira/preencha os dados manualmente)'; console.error('Consulta de CNPJ:', erro);

            }

        } finally { consultasCadastro--; atualizarBotaoCadastro(); }

    });

    cep.addEventListener('blur', async () => {

        if (!idUsuarioLogado || cadastroSalvando) return;

        const puro = cep.value.replace(/\D/g,''), sessao = sessaoAtual();

        if (!/^\d{8}$/.test(puro)) { campo('cc-status-cep').textContent = ' (CEP inválido)'; return; }

        invalidarCoordenadas(); const pedido = versaoConsultaEndereco;

        consultasCadastro++; atualizarBotaoCadastro(); campo('cc-status-cep').textContent = ' (Consultando...)';

        try {

            const dados = await buscarJson(`https://brasilapi.com.br/api/cep/v2/${puro}`);

            if (!sessaoValida(sessao) || pedido !== versaoConsultaEndereco) return;

            campo('cc-endereco').value = dados.street || ''; campo('cc-bairro').value = dados.neighborhood || '';

            campo('cc-cidade').value = dados.city || ''; campo('cc-uf').value = dados.state || '';

            // Coordenadas de CEP não representam necessariamente a porta da loja.

            campo('cc-status-cep').textContent = ' (Encontrado)';

        } catch (erro) {

            if (sessaoValida(sessao) && pedido === versaoConsultaEndereco) campo('cc-status-cep').textContent = ' (Preencha o endereço manualmente)';

        } finally { consultasCadastro--; atualizarBotaoCadastro(); }

    });

    campo('cc-numero').addEventListener('blur', () => {

        if (campo('cc-endereco').value && campo('cc-cidade').value) mostrarMapa(valoresEndereco());

    });

    campo('btn-cancelar-cliente').addEventListener('click', () => {

        if (cadastroSalvando) return;

        limparCadastroCliente(); mostrarApenasTela('tela-nova-visita');

    });

    campo('btn-salvar-cliente').addEventListener('click', async () => {

        if (operacaoEmCurso || consultasCadastro > 0) return;

        const btn = campo('btn-salvar-cliente');

        try {

            const sessao = sessaoAtual(), puro = cnpj.value.replace(/\D/g,'');

            if (!cnpjValido(puro)) throw new Error('Informe um CNPJ válido, incluindo os dígitos verificadores.');

            const codigo = ofuscarCNPJ(puro), nome = campo('cc-nome').value.trim();

            const cidade = campo('cc-cidade').value.trim(), uf = campo('cc-uf').value.trim().toUpperCase();

            const ufs = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

            if (!nome || !cidade || !ufs.includes(uf) || !campo('cc-endereco').value.trim() || !campo('cc-numero').value.trim()) throw new Error('Preencha nome, endereço, número, cidade e UF válidos.');

            const enderecoCompleto = valoresEndereco();

            cadastroSalvando = true; operacaoEmCurso = true; atualizarBotaoCadastro(); btn.textContent = 'Salvando...';

            // Compatibilidade com os clientes antigos que usam IDs aleatórios.

            const anteriores = await getDocs(query(collection(db,'clientes'), where('codigoCnpj','==',codigo)));

            exigirSessao(sessao);

            let clienteId, nomeFinal = nome, localizado = false;

            if (!anteriores.empty) {

                const existente = anteriores.docs[0];

                if (existente.data().status !== 'Ativo') throw new Error('Este CNPJ já existe, mas está inativo. Solicite a reativação.');

                clienteId = existente.id; nomeFinal = existente.data().nome || nome; localizado = true;

            } else {

                // Sempre geocodifica o endereço atual, nunca reutiliza o dataset de outro cliente.

                const coords = await obterCoordsPorEndereco(enderecoCompleto);

                exigirSessao(sessao);

                if (!coords || !coordenadasValidas(coords.lat, coords.lng)) throw new Error('Não foi possível localizar este endereço. Confira os dados e tente novamente; a loja precisa de coordenadas para o check-in.');

                clienteId = 'cli_' + codigo;

                const ref = doc(db,'clientes',clienteId);

                const resultado = await runTransaction(db, async tx => {

                    const atual = await tx.get(ref); exigirSessao(sessao);

                    if (atual.exists()) {

                        if (atual.data().status !== 'Ativo') throw new Error('Este CNPJ está inativo. Solicite a reativação.');

                        return { nome: atual.data().nome || nome, localizado: true };

                    }

                    const agora = new Date();

                    tx.set(ref, { codigoCnpj: codigo, nome, cidade, uf, enderecoCompleto,

                        lat: Number(coords.lat), lng: Number(coords.lng), status: 'Ativo', criadoEm: agora, atualizadoEm: agora });

                    return { nome, localizado: false };

                });

                nomeFinal = resultado.nome; localizado = resultado.localizado;

            }

            if (!sessaoValida(sessao)) return;

            const clienteAtual = await obterCliente(clienteId);
            if (clienteAtual) cacheClientes.set(clienteId, clienteAtual);
            if (!listaClientes.some(c => c.id === clienteId)) listaClientes.push({ id: clienteId, nome: nomeFinal });

            nvClienteSelecionadoId = clienteId; campo('nv-cliente').value = nomeFinal;

            limparCadastroCliente(); mostrarApenasTela('tela-nova-visita');

            window.mostrarAlerta('Sucesso', localizado ? 'Cliente existente selecionado.' : 'Loja salva com coordenadas do endereço informado.');

        } catch (erro) { informarErro('Não foi possível salvar a loja', erro); }

        finally { operacaoEmCurso = false; cadastroSalvando = false; atualizarBotaoCadastro(); btn.textContent = 'Salvar Loja'; }

    });

}



// === NAVEGAÇÃO PRINCIPAL ===

function configurarNavegacao() {

    const navItems = document.querySelectorAll('.nav-item');

    navItems.forEach((item, index) => {

        item.addEventListener('click', function() {

            if (operacaoEmCurso) return;

            navItems.forEach(nav => nav.classList.remove('active')); 

            this.classList.add('active');

            if (index === 0) { mostrarApenasTela('tela-inicio'); carregarAtividadesPendentes(); } 

            else if (index === 1) { mostrarApenasTela('tela-agenda'); carregarAgenda(); } 

            else if (index === 2) { mostrarApenasTela('tela-historico'); carregarHistoricoVisitas(); }

            else if (index === 3) { mostrarApenasTela('tela-perfil'); } 

        });

    });



    const btnNovaVisita = document.getElementById('btn-nova-visita');

    if (btnNovaVisita) {

        btnNovaVisita.addEventListener('click', () => {

            if (operacaoEmCurso) return;

            mostrarApenasTela('tela-nova-visita');

            carregarDadosParaAutocomplete(); window.scrollTo(0, 0);

        });

    }



    const btnCancelarVisita = document.getElementById('btn-cancelar-visita');

    if (btnCancelarVisita) {

        btnCancelarVisita.addEventListener('click', () => { if (operacaoEmCurso) return; mostrarApenasTela('tela-agenda'); });

    }

}



// === CHECK-IN ===

window.abrirConfirmacaoCheckin = function(atividadeId, clienteNome, clienteId) {

    if (operacaoEmCurso) return;

    atividadeSelecionadaId = atividadeId; clienteSelecionadoNome = clienteNome; clienteSelecionadoId = clienteId;

    const telaConfirmacao = document.getElementById('tela-confirmacao');

    document.getElementById('conf-nome-cliente').textContent = clienteNome;

    document.getElementById('conf-img-cliente').src = `https://ui-avatars.com/api/?name=${encodeURIComponent(clienteNome)}&background=e2e8f0&color=333`;

    document.getElementById('conf-nome-tecnico').textContent = nomeUsuarioLogado || "Técnico";

    document.getElementById('conf-img-tecnico').src = `https://ui-avatars.com/api/?name=${encodeURIComponent(nomeUsuarioLogado || 'Tecnico')}&background=e2e8f0&color=333`;

    document.getElementById('data-hora-atual').textContent = formatarDataHoraPT(new Date()).completo; 

    telaConfirmacao.style.display = 'flex';

}



function configurarBotoesModal() {
    document.getElementById('btn-configuracoes')?.addEventListener('click', () => window.mostrarAlerta('Aviso', 'Tela de Perfil em construção!'));
    document.getElementById('btn-fechar-alerta')?.addEventListener('click', () => window.fecharAlerta());
    document.getElementById('btn-fechar-aviso-andamento')?.addEventListener('click', () => { document.getElementById('modal-aviso-andamento').style.display = 'none'; });
    document.getElementById('btn-cancelar-exclusao')?.addEventListener('click', () => window.fecharConfirmacaoExclusao());
    document.getElementById('btn-confirmar-exclusao')?.addEventListener('click', () => window.confirmarExclusao());



    document.getElementById('btn-voltar')?.addEventListener('click', () => {

        if (!operacaoEmCurso) document.getElementById('tela-confirmacao').style.display = 'none';

    });

    document.getElementById('btn-iniciar')?.addEventListener('click', async () => {

        if (!atividadeSelecionadaId || operacaoEmCurso) return;

        const btn = document.getElementById('btn-iniciar');

        const id = atividadeSelecionadaId, clienteId = clienteSelecionadoId;

        operacaoEmCurso = true; btn.disabled = true; btn.textContent = 'Obtendo localização...';

        try {

            const sessao = sessaoAtual(), pos = await obterPosicao();
            const accuracy = validarPrecisaoGps(pos);

            exigirSessao(sessao);

            await processarCheckin(pos.coords.latitude, pos.coords.longitude, id, clienteId, sessao, accuracy);

        } catch (erro) { informarErro('Erro no check-in', erro); }

        finally { operacaoEmCurso = false; btn.disabled = false; btn.textContent = 'Iniciar'; }

    });

}



async function processarCheckin(lat, lng, id, clienteId, sessao, accuracy = null) {

    if (!coordenadasValidas(lat,lng)) throw new Error('O GPS retornou coordenadas inválidas.');

    const btn = document.getElementById('btn-iniciar'); btn.textContent = 'Validando visita...';

    // Esta consulta impede o segundo check-in no fluxo normal. A exclusividade

    // entre dispositivos exige também uma trava validada no servidor/regras.

    const abertas = await getDocs(query(collection(db,'atividades'), where('ptvId','==',sessao.id), where('status','==','Em andamento')));

    exigirSessao(sessao);

    if (abertas.docs.some(d => d.id !== id)) throw new Error('Encerre a visita em andamento antes de iniciar outra.');

    const endereco = await obterEnderecoPorCoords(lat,lng);

    exigirSessao(sessao);

    await runTransaction(db, async tx => {

        const ref = doc(db,'atividades',id), snap = await tx.get(ref);

        const cliente = await tx.get(doc(db,'clientes',clienteId));

        if (!snap.exists() || !cliente.exists()) throw new Error('Visita ou cliente não encontrado.');

        const atividade = snap.data(), dados = cliente.data(); validarResponsavel(atividade,sessao);

        if (atividade.clienteId !== clienteId) throw new Error('O cliente da visita foi alterado. Atualize a tela.');

        if (atividade.status !== 'Pendente') throw new Error('Esta visita já foi iniciada ou encerrada. Atualize a tela.');

        if (!coordenadasValidas(dados.lat,dados.lng)) throw new Error('A loja não possui coordenadas válidas. Corrija o cadastro.');

        const distancia = calcularDistancia(Number(lat),Number(lng),Number(dados.lat),Number(dados.lng));

        if (!Number.isFinite(distancia) || distancia > 500) throw new Error(`Você está a ${Math.round(distancia)} m da loja. A distância máxima é 500 m.`);

        const agora = new Date();

        tx.update(ref, { status:'Em andamento', checkinDataHora:agora, checkinGps:`${lat}, ${lng}`, checkinGpsAccuracy:Number(accuracy), checkinEndereco:endereco, atualizadoEm:agora });

    });

    if (!sessaoValida(sessao)) return;

    document.getElementById('tela-confirmacao').style.display = 'none';

    mostrarApenasTela('tela-inicio'); await carregarAtividadesPendentes();

}



async function encerrarVisita(id, btn) {

    if (operacaoEmCurso) return;

    operacaoEmCurso = true; btn.disabled = true; btn.textContent = 'Obtendo GPS de saída...';

    try {

        const sessao = sessaoAtual(), pos = await obterPosicao(); exigirSessao(sessao);
        const accuracy = validarPrecisaoGps(pos);

        const { latitude:lat, longitude:lng } = pos.coords;

        if (!coordenadasValidas(lat,lng)) throw new Error('Coordenadas de saída inválidas.');

        const endereco = await obterEnderecoPorCoords(lat,lng); exigirSessao(sessao);

        btn.textContent = 'Encerrando...';

        await runTransaction(db, async tx => {

            const ref = doc(db,'atividades',id), snap = await tx.get(ref);

            if (!snap.exists()) throw new Error('Visita não encontrada.');

            const atividade = snap.data(); validarResponsavel(atividade,sessao);

            if (atividade.status !== 'Em andamento') throw new Error('A visita não está mais em andamento.');

            if (!atividade.relatorioId) throw new Error('Salve o relatório antes de encerrar.');

            const relatorio = await tx.get(doc(db,'relatorios',atividade.relatorioId));

            if (!relatorio.exists() || relatorio.data().atividadeId !== id || relatorio.data().ptvId !== sessao.id || !String(relatorio.data().textoAtual || '').trim()) throw new Error('O relatório não está válido. Abra e salve o relatório antes de encerrar.');

            const agora = new Date();

            tx.update(ref, { status:'Concluída', checkoutDataHora:agora, checkoutGps:`${lat}, ${lng}`, checkoutGpsAccuracy:Number(accuracy), checkoutEndereco:endereco, atualizadoEm:agora });

        });

        if (!sessaoValida(sessao)) return;

        limparEstadoVisita(); mostrarApenasTela('tela-inicio'); await carregarAtividadesPendentes();

        window.mostrarAlerta('Sucesso','Visita encerrada.');

    } finally { operacaoEmCurso = false; btn.disabled = false; btn.textContent = 'Encerrar visita'; }

}



function atualizarInterfaceVisitaAtual() {

    if (!objetoAtividadeGlobal) return;

    const objData = formatarDataHoraPT(objetoAtividadeGlobal.checkinDataHora);

    const areaVisitas = document.getElementById('area-visitas');

    let htmlTimeline = `

    <div class="card-visita-atual" style="margin-top: 10px;">

        <h2 class="va-titulo">${escaparHtml(clienteSelecionadoNome)}</h2>

        <div class="va-status">EM ANDAMENTO</div>

        <hr class="va-divider" style="margin: 15px 0;">

        <div class="timeline-container">

            <div class="timeline-line"></div>

            <div class="timeline-item">

                <div class="timeline-dot-gray"></div>

                <div class="timeline-content">

                    <div class="timeline-header">

                        <strong>Check-in</strong>

                        <span>${objData.hora}</span>

                    </div>

                    <p class="timeline-desc">${escaparHtml(nomeUsuarioLogado || 'Técnico')} chegou a ${escaparHtml(clienteSelecionadoNome)} às ${objData.hora}.</p>

                </div>

            </div>`;

    let htmlBotoes = '';



    if (objetoRelatorioGlobal && objetoRelatorioGlobal.textoAtual) {

        const historico = Array.isArray(objetoRelatorioGlobal.historico) && objetoRelatorioGlobal.historico.length ? objetoRelatorioGlobal.historico : [{ salvoEm: objetoRelatorioGlobal.atualizadoEm }];

        historico.forEach((registro, index) => {

            const horaReg = formatarDataHoraPT(registro.salvoEm).hora; 

            const isLast = (index === historico.length - 1); 

            const dotClass = isLast ? 'timeline-dot-blue' : 'timeline-dot-gray';

            const titulo = (index === 0) ? 'Relatório adicionado' : 'Relatório atualizado'; 

            const acaoTxt = (index === 0) ? 'escreveu um relatório.' : 'atualizou o relatório.';

            htmlTimeline += `

            <div class="timeline-item">

                <div class="${dotClass}"></div>

                <div class="timeline-content">

                    <div class="timeline-header">

                        <strong>${titulo}</strong>

                        <span>${horaReg}</span>

                    </div>

                    <p class="timeline-desc" ${isLast ? 'style="margin-bottom: 12px;"' : ''}>${escaparHtml(nomeUsuarioLogado || 'Técnico')} ${acaoTxt}</p>

                    ${isLast ? '<button class="btn-outline-red" id="btn-ver-relatorio-inicio">Ver ou editar relatório</button>' : ''}

                </div>

            </div>`;

        });

        htmlBotoes = `<button class="btn-checkin" id="btn-encerrar-visita-inicio" style="margin-top: 15px;">Encerrar visita</button>`;

    } else { 

        htmlBotoes = `<button class="btn-checkin" id="btn-escrever-relatorio-inicio" style="margin-top: 15px;">Escrever relatório</button>`; 

    }

    htmlTimeline += `</div>${htmlBotoes}</div>`;

    areaVisitas.innerHTML = htmlTimeline;



    // Reconfigurar eventos

    const btnEscrever = document.getElementById('btn-escrever-relatorio-inicio'); 

    const btnVerEditar = document.getElementById('btn-ver-relatorio-inicio'); 

    const btnEncerrar = document.getElementById('btn-encerrar-visita-inicio');



    const acaoAbrirRelatorio = () => {

        if (operacaoEmCurso) return;

        mostrarApenasTela('tela-relatorio');

        const formatoData = formatarDataHoraPT(objetoAtividadeGlobal.checkinDataHora); let codigoRelatorio = "";

        if (objetoRelatorioGlobal) { codigoRelatorio = objetoRelatorioGlobal.codigo || `#${atividadeSelecionadaId}`; document.getElementById('rel-texto').value = objetoRelatorioGlobal.textoAtual || ""; 

        } else { const dataPura = new Date(); codigoRelatorio = `#${dataPura.getFullYear()}${String(dataPura.getMonth() + 1).padStart(2, '0')}${String(dataPura.getDate()).padStart(2, '0')}${obterIniciais(nomeUsuarioLogado || 'TEC')}-${atividadeSelecionadaId}`; document.getElementById('rel-texto').value = ""; }

        document.getElementById('rel-titulo-cliente').textContent = `Relatório - ${clienteSelecionadoNome}`; document.getElementById('rel-opcao-cliente').textContent = clienteSelecionadoNome;

        document.getElementById('rel-data').value = formatoData.data; document.getElementById('rel-hora').value = formatoData.hora; document.getElementById('rel-codigo-gerado').textContent = codigoRelatorio; window.scrollTo(0, 0);

    };



    if (btnEscrever) btnEscrever.addEventListener('click', acaoAbrirRelatorio); 

    if (btnVerEditar) btnVerEditar.addEventListener('click', acaoAbrirRelatorio);

    if (btnEncerrar) {

        const id = atividadeSelecionadaId;

        btnEncerrar.addEventListener('click', () => {

            if (!operacaoEmCurso) window.mostrarConfirmacaoExclusao(() => encerrarVisita(id, btnEncerrar), true);

        });

    }

}



function configurarEventosGlobais() {

    document.getElementById('btn-voltar-relatorio')?.addEventListener('click', () => {

        if (operacaoEmCurso) return;

        const atual = document.getElementById('rel-texto').value.trim();

        if (atual !== String(objetoRelatorioGlobal?.textoAtual || '').trim() && !confirm('Voltar sem salvar as alterações do relatório?')) return;

        mostrarApenasTela('tela-inicio');

    });

    document.getElementById('btn-salvar-relatorio')?.addEventListener('click', async () => {

        if (operacaoEmCurso) return;

        const btn = document.getElementById('btn-salvar-relatorio');

        try {

            const sessao = sessaoAtual(), atividadeId = atividadeSelecionadaId;

            const texto = document.getElementById('rel-texto').value.trim();

            if (!texto) throw new Error('Escreva um resumo antes de salvar.');

            if (!atividadeId || !objetoAtividadeGlobal) throw new Error('Abra uma visita em andamento antes de escrever o relatório.');

            // Mantém o documento abaixo do limite mesmo com histórico. Para históricos

            // extensos, migrar as revisões para uma subcoleção.

            if (texto.length > 30000) throw new Error('O relatório deve ter até 30.000 caracteres.');

            const codigo = document.getElementById('rel-codigo-gerado').textContent;

            const textoBase = objetoRelatorioGlobal?.textoAtual ?? null;

            const novoRef = doc(collection(db,'relatorios'));

            operacaoEmCurso = true; btn.disabled = true; btn.textContent = 'Salvando...';

            const salvo = await runTransaction(db, async tx => {

                const atvRef = doc(db,'atividades',atividadeId), snap = await tx.get(atvRef);

                if (!snap.exists()) throw new Error('Visita não encontrada.');

                const atv = snap.data(); validarResponsavel(atv,sessao);

                if (atv.status !== 'Em andamento') throw new Error('Só é possível salvar relatório de visita em andamento.');

                const ref = atv.relatorioId ? doc(db,'relatorios',atv.relatorioId) : novoRef;

                const anterior = await tx.get(ref);

                const dados = anterior.exists() ? anterior.data() : null;

                if (dados && (dados.atividadeId !== atividadeId || dados.ptvId !== sessao.id)) throw new Error('O relatório não corresponde a esta visita.');

                if (dados && dados.textoAtual !== textoBase && dados.textoAtual !== texto) throw new Error('O relatório foi alterado em outra sessão. Copie seu texto, volte ao Início e reabra o relatório antes de salvar.');

                const agora = new Date();

                const historico = Array.isArray(dados?.historico) ? [...dados.historico] : [];

                if (!dados || dados.textoAtual !== texto) historico.push({ texto, salvoEm: agora });

                const resultado = { ...dados, id:ref.id, atividadeId, clienteId:atv.clienteId, ptvId:sessao.id,

                    codigo:dados?.codigo || codigo || `#${atividadeId}`, textoAtual:texto, historico,

                    criadoEm:dados?.criadoEm || agora, atualizadoEm:agora };

                if (new TextEncoder().encode(JSON.stringify(resultado)).length > 800000) throw new Error('O histórico deste relatório está muito grande. Solicite o arquivamento das revisões antes de continuar.');

                tx.set(ref, resultado);

                tx.update(atvRef, { relatorioId:ref.id, atualizadoEm:agora });

                return resultado;

            });

            if (!sessaoValida(sessao)) return;

            // Só altera a memória após a confirmação de ambas as gravações.

            objetoRelatorioGlobal = salvo; objetoAtividadeGlobal.relatorioId = salvo.id;

            mostrarApenasTela('tela-inicio'); atualizarInterfaceVisitaAtual();

        } catch (erro) { informarErro('Erro ao salvar relatório', erro); }

        finally { operacaoEmCurso = false; btn.disabled = false; btn.textContent = 'Salvar relatório'; }

    });

}