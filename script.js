import { cancelarAgendamento } from './src/services/cancellation.js';
import { atividadePodeSerCancelada } from './src/domain/cancellation.js';
import { camposAssistenciaPendentes } from './src/domain/reports.js';
import { garantirCatalogoAdvance } from './src/data/product-import.js';
import { createProductRepository } from './src/data/product-repository.js';
import { persistCommercialMedia } from './src/services/commercial-save.js';
import { CommercialReport } from './src/ui/commercial-report.js';
import { TrainingReport } from './src/ui/training-report.js';
import { modulosTreinamentoPendentes } from './src/domain/training.js';
import { cardAgenda, proximasVisitas, visitasSecundarias } from './src/ui/agenda-cards.js';
import { ProfileView } from './src/ui/profile.js';
import { HomeVisitMap } from './src/ui/home-map.js';
import { loadingMarkup, homeLoadingMarkup } from './src/ui/loading.js';
import { filtrarClientes, tituloCliente, detalhesCliente, opcaoCliente } from './src/ui/client-options.js';
import { AgendaCalendar, filtrarAgenda } from './src/ui/agenda-calendar.js';
import { limitesAgendamento, validarAgendamento } from './src/domain/scheduling.js';
import { createCnpjLookup } from './src/data/cnpj-lookup.js';
import './src/ui/pwa.js';
import { escaparHtml, tempoData, lerDataHora, formatarDataHoraPT, formatarDataAgenda, formatarDataCheckout, formatarHoraCheckout, formatarDuracaoVisita, serializarEstavel } from './src/domain/formatters.js';
import { obterIniciais, gerarIdAtividade, gerarIdRelatorio, gerarIdClienteCnpj, gerarIdClienteProvisorio, cnpjValido } from './src/domain/identifiers.js';
import { normalizarTipoVisita, colecaoRelatorioPorTipo, colecaoRelatorioDaAtividade, blocosPersistidosRelatorio, dadosAssistenciaDoRelatorio, secoesAssistenciaParaDocumento, relatorioValidoParaCheckout, normalizarAssistenciaComparacao, modulosComerciaisPendentes } from './src/domain/reports.js';
import { ASSISTENCIA_TECNICA_TIPO } from './src/domain/reports.js';
import { obterResultadoHistorico, obterClasseResultadoHistorico, obterDataHistorico, formatarDiaHistorico, formatarHorarioVisitaHistorico, periodoHistorico, aplicarFiltrosHistorico } from './src/domain/history.js';
import { buscarCentroCidade, referenciaLocalizacao, dadosLocalizacaoCadastro, buscarJson, coordenadasValidas, obterPosicao, obterEnderecoPorCoords, obterCoordsPorEndereco, calcularDistancia, validarPrecisaoGps } from './src/services/location.js';
import { radioAssistencia, lerFormularioAssistencia, preencherFormularioAssistencia, renderFichaAssistencia } from './src/ui/assistance.js';
import { preencherCampoVisualizador, prepararImpressaoVisualizador, renderizarVisualizadorVisita, preencherConteudoRelatorio } from './src/ui/visit-view.js';
import { createClientRepository } from './src/data/client-repository.js';
import { readProfilePhotoUrl, TechnicalReportEditor, initializeMediaPreviews, configureMediaApi, mediaStore } from './technical-report-editor.js';
const productRepository = createProductRepository(async () => {
    const sessao = sessaoAtual();
    await garantirCatalogoAdvance({
        validateSession: () => exigirSessao(sessao),
        read: async (colecao, id) => (await getDocFromServer(doc(db, colecao, id))).data(),
        load: async () => {
            const response = await fetch(new URL('./data/produtos-advance.json', import.meta.url));
            if (!response.ok) throw new Error('Não foi possível abrir o catálogo Advance.');
            return response.json();
        },
        commit: async writes => {
            exigirSessao(sessao);
            const batch = writeBatch(db);
            for (const item of writes) batch.set(doc(db, item.collection, item.id), item.data);
            await batch.commit();
        }
    });
    exigirSessao(sessao);
    const snapshot = await getDocs(collection(db, 'produtos'));
    return snapshot.docs.map(document => ({...document.data(), id:document.id}));
});
let technicalEditor;
let commercialReport;
let trainingReport;
function abrirPrototipoComercial(page = 'overview', reviewCheckout = false, navegar = true) {
    const chegada = objetoAtividadeGlobal.checkinDataHora || objetoAtividadeGlobal.data;
    const formato = formatarDataHoraPT(chegada);
    const controller = normalizarTipoVisita(objetoAtividadeGlobal) === 'Treinamento' ? trainingReport : commercialReport;
    controller.open({
        id: atividadeSelecionadaId,
        client: clienteSelecionadoNome || 'Cliente não encontrado',
        code: objetoRelatorioGlobal?.codigo || '#' + atividadeSelecionadaId,
        date: formato.data, time: formato.hora,
        arrival: tempoData(chegada) || null, text: objetoRelatorioGlobal?.textoAtual || ''
    }, page, reviewCheckout);
    if(navegar) navegarParaTela('tela-relatorio', { carregar: false });
}
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js";

import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js";

import { getFirestore, collection, query, where, getDocs, doc, getDoc, getDocFromServer, setDoc, writeBatch, runTransaction, orderBy, limit } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js";

import { firebaseConfig } from './firebase-config.js';

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);

const db = getFirestore(app);

configureMediaApi({
    getIdToken: async () => {
        if (!auth.currentUser) throw new Error('Entre novamente para acessar os arquivos.');
        return auth.currentUser.getIdToken();
    }
});

// Variáveis Globais de Gestão de Estado

let idUsuarioLogado = null;

let nomeUsuarioLogado = null;

let perfilUsuarioLogado = null;
let dadosPerfilLogado = null;

let atividadeSelecionadaId = null;

let clienteSelecionadoId = null;

let clienteSelecionadoNome = "";

let dataCheckinAtual = null;

let objetoAtividadeGlobal = null; 

let objetoRelatorioGlobal = null;
let checkoutPendenteGlobal = null;
let fechamentoManualPendente = null; 

let listaClientes = [];
let clientesAutocompleteCarregados = false;
const clientesRepository = createClientRepository(async clienteId => {
    const snap = await getDoc(doc(db, 'clientes', clienteId));
    return snap.exists() ? { ...snap.data(), id: snap.id } : null;
});
const obterCliente = clientesRepository.get;
let historicoCarregado = null;
let clienteVisualizadorAtual = null;

let listaAtividadesAgenda = []; // Nova lista para edição de visitas
const agendaCalendar = new AgendaCalendar(document.getElementById('agenda-calendar'), () => {
    if (!agendaCarregando) renderizarAgenda();
});
let agendaCarregando = false;

const homeCalendar = new AgendaCalendar(document.getElementById('home-calendar'), () => {
    const dia = homeCalendar.selecionado;
    if (!dia || !filtrarAgenda(homeCalendar.atividades, homeCalendar.mes, dia).length) return;
    agendaCalendar.selectDay(new Date(dia.getTime()), false);
    navegarParaTela('tela-agenda');
}, 'home-calendar-title', false);
const homeVisitMap = new HomeVisitMap(document.getElementById('home-map-canvas'), document.getElementById('home-map-status'), { getPosition: obterPosicao });

let nvClienteSelecionadoId = null;

let cnpjNovoCliente = null;

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
let filtrosHistorico = { periodo: 'todos', resultado: 'todos', tipo: 'todos' };

const APP_HISTORY_KEY = 'advanceCheck';
const HASH_POR_TELA = Object.freeze({
    'tela-inicio': '#inicio',
    'tela-agenda': '#agenda',
    'tela-historico': '#historico',
    'tela-nova-visita': '#nova-visita',
    'tela-cadastro-cliente': '#cadastro-cliente',
    'tela-visita-atual': '#visita',
    'tela-relatorio': '#relatorio',
    'tela-perfil': '#perfil',
    'tela-detalhes-visita': '#detalhes-visita',
    'tela-checkout': '#checkout',
    'tela-visualizador-visita': '#visualizar-visita'
});
let navegacaoHistoricoAtiva = false;
let estadoNavegacaoAtual = null;
let ignorarProtecaoRelatorioUmaVez = false;

// === PADRÃO DE IDs DO FIRESTORE ===
// IDs novos são gerados em um único lugar para manter o padrão consistente.
// Registros antigos não são renomeados, preservando todas as referências existentes.

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

function referenciaRelatorio(atividade, relatorioId = atividade?.relatorioId, paraNovo = false) {
    if (!relatorioId) return null;
    return doc(db, colecaoRelatorioDaAtividade(atividade, paraNovo), relatorioId);
}

async function carregarRelatorioDaAtividade(atividade, forcarServidor = false) {
    if (!atividade?.relatorioId) return null;
    const ref = referenciaRelatorio(atividade);
    const snap = await (forcarServidor ? getDocFromServer(ref) : getDoc(ref));
    if (!snap.exists()) return null;
    return { ...snap.data(), id: snap.id, colecao: ref.parent.id };
}

function limparFormularioCheckout() {
    ['checkout-objetivo','checkout-at-acoes','checkout-at-conclusao','checkout-at-proximo-passo'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    ['checkout-cliente','checkout-chegada-data','checkout-chegada-hora','checkout-saida-data','checkout-saida-hora','checkout-duracao','checkout-relatorio-final'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = ''; });
    document.querySelectorAll('input[name="checkoutOportunidade"], input[name="checkoutAtResultado"]').forEach(radio => { radio.checked = false; });
}

function preencherCheckout(atividade, relatorio, saida) {
    checkoutPendenteGlobal = { atividadeId: atividade.id, posicao: saida };
    limparFormularioCheckout();
    document.getElementById('checkout-cliente').textContent = clienteSelecionadoNome || 'Cliente não encontrado';
    document.getElementById('checkout-chegada-data').textContent = formatarDataCheckout(atividade.checkinDataHora);
    document.getElementById('checkout-chegada-hora').textContent = formatarHoraCheckout(atividade.checkinDataHora);
    document.getElementById('checkout-saida-data').textContent = formatarDataCheckout(saida.dataHora);
    document.getElementById('checkout-saida-hora').textContent = formatarHoraCheckout(saida.dataHora);
    document.getElementById('checkout-duracao').textContent = formatarDuracaoVisita(atividade.checkinDataHora, saida.dataHora);

    const tipo = normalizarTipoVisita(atividade);
    const comercialLocal = tipo === 'Visita comercial' && relatorio?.dadosComerciais?.versao === 1;
    const treinamentoLocal = tipo === 'Treinamento' && relatorio?.dadosTreinamento?.versao === 1;
    document.getElementById('tela-checkout').classList.toggle('commercial-checkout', !!(comercialLocal || treinamentoLocal));
    if (treinamentoLocal) trainingReport.renderCheckout(document.getElementById('checkout-commercial-content'));
    if(comercialLocal) commercialReport.renderCheckout(document.getElementById('checkout-commercial-content'));
    document.getElementById('checkout-tecnico-section').style.display = tipo === 'Visita comercial' ? 'block' : 'none';
    document.getElementById('checkout-assistencia-section').style.display = tipo === 'Assistência técnica' ? 'block' : 'none';
    document.getElementById('checkout-tipo-titulo').textContent = tipo;

    document.getElementById('checkout-objetivo').value = atividade.objetivo || '';
    const oportunidade = atividade.oportunidadeIdentificada;
    if (oportunidade === 'Sim' || oportunidade === 'Não') {
        const radio = document.querySelector('input[name="checkoutOportunidade"][value="' + oportunidade + '"]');
        if (radio) radio.checked = true;
    }


    const assistencia = dadosAssistenciaDoRelatorio(relatorio);
    document.getElementById('checkout-at-acoes').value = assistencia.acoesDefinidas || '';
    document.getElementById('checkout-at-conclusao').value = assistencia.conclusaoTecnica || '';
    document.getElementById('checkout-at-proximo-passo').value = assistencia.proximoPasso || '';
    if (assistencia.resultado) {
        const radio = document.querySelector('input[name="checkoutAtResultado"][value="' + CSS.escape(String(assistencia.resultado)) + '"]');
        if (radio) radio.checked = true;
    }

    const textoSection = document.getElementById('checkout-relatorio-texto-section');
    const assistenciaPreview = document.getElementById('checkout-assistencia-preview');
    if (textoSection) textoSection.style.display = tipo === ASSISTENCIA_TECNICA_TIPO ? 'none' : 'block';
    if (assistenciaPreview) assistenciaPreview.style.display = tipo === ASSISTENCIA_TECNICA_TIPO ? 'block' : 'none';
    preencherConteudoRelatorio('checkout-relatorio-final', relatorio, 'Nenhum relatório salvo.');
    if (tipo === ASSISTENCIA_TECNICA_TIPO) atualizarPreviewCheckoutAssistencia();

    navegarParaTela('tela-checkout', { carregar: false });
    window.scrollTo(0, 0);
}

function fecharCheckout() {
    if (operacaoEmCurso) return;
    checkoutPendenteGlobal = null;
    commercialReport?.deactivate();
    trainingReport?.deactivate();
    commercialReport?.checkoutResizeObserver?.disconnect();
    trainingReport?.checkoutResizeObserver?.disconnect();
    document.getElementById('tela-checkout')?.classList.remove('commercial-checkout');
    const content = document.getElementById('checkout-commercial-content');
    if (content) { content.replaceChildren(); content.onclick = null; content.onchange = null; }
    navegarParaTela('tela-inicio', { substituir: true, carregar: false });
    atualizarInterfaceVisitaAtual();
}

function dadosAssistenciaCheckoutAtual() {
    return {
        ...dadosAssistenciaDoRelatorio(objetoRelatorioGlobal),
        acoesDefinidas: String(document.getElementById('checkout-at-acoes')?.value || '').trim(),
        conclusaoTecnica: String(document.getElementById('checkout-at-conclusao')?.value || '').trim(),
        resultado: document.querySelector('input[name="checkoutAtResultado"]:checked')?.value || '',
        proximoPasso: String(document.getElementById('checkout-at-proximo-passo')?.value || '').trim()
    };
}

function atualizarPreviewCheckoutAssistencia() {
    const container = document.getElementById('checkout-at-preview');
    if (!container) return;
    container.innerHTML = renderFichaAssistencia(dadosAssistenciaCheckoutAtual(), {}, objetoRelatorioGlobal);
}

function mostrarEditorRelatorioPorTipo(tipo) {
    const assistencia = tipo === ASSISTENCIA_TECNICA_TIPO;
    const padrao = document.getElementById('relatorio-editor-padrao');
    const personalizado = document.getElementById('relatorio-assistencia-section');
    if (padrao) padrao.style.display = 'flex';
    document.getElementById('report-section-title').hidden = !assistencia;
    if (personalizado) personalizado.style.display = assistencia ? 'block' : 'none';
}

class ErroCheckoutLocalizacao extends Error {}

function limparEstadoVisita() {

    atividadeSelecionadaId = null; clienteSelecionadoId = null; clienteSelecionadoNome = '';

    dataCheckinAtual = null; objetoAtividadeGlobal = null; objetoRelatorioGlobal = null; visitaEmEdicao = null; checkoutPendenteGlobal = null; fechamentoManualPendente = null;

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

    versaoConsultaCnpj++; cnpjNovoCliente = null; invalidarCoordenadas();

    ['cc-cnpj','cc-nome','cc-cep','cc-endereco','cc-numero','cc-bairro','cc-cidade','cc-uf'].forEach(id => {

        const el = document.getElementById(id); if (el) el.value = '';

    });

    ['cc-status-cnpj','cc-status-cep'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = ''; });

}

// === INICIALIZAÇÃO E AUTENTICAÇÃO ===

function inicializarAplicativo() {
    // Alertas precisam continuar visíveis quando o app-container está oculto.

    ['modal-alerta-generico','modal-aviso-andamento','modal-confirmar-exclusao','modal-fechamento-manual'].forEach(id => {

        const el = document.getElementById(id); if (el) document.body.appendChild(el);

    });

    document.body.appendChild(document.getElementById('modal-cancelar-agendamento'));
    configurarHistoricoNativo();
    configurarNavegacao(); configurarBotoesModal(); configurarEventosGlobais(); configurarFiltroHistorico();

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
        productRepository.clear();
        commercialReport?.clear();
        trainingReport?.clear();

        idUsuarioLogado = null; nomeUsuarioLogado = null; perfilUsuarioLogado = null; dadosPerfilLogado = null;
        profileView.clear();

        limparEstadoVisita(); listaClientes = []; listaAtividadesAgenda = []; nvClienteSelecionadoId = null;
        agendaCalendar.reset();
        homeCalendar.reset();
        homeVisitMap.clear();
        document.getElementById('home-location-address').textContent = '';
        document.getElementById('home-upcoming-visits').replaceChildren();
        document.getElementById('home-agenda-more').hidden = true;

        limparCadastroCliente();

        document.getElementById('rel-texto').value = '';

        document.getElementById('nv-cliente').value = '';
        document.getElementById('nv-cliente-detalhes').innerHTML = '';

        ['area-visitas','area-agenda','area-historico-visitas','nv-cliente-dropdown'].forEach(id => document.getElementById(id).textContent = '');
        clientesAutocompleteCarregados = false;
        clientesRepository.clear();
        historicoCarregado = null;
        clienteVisualizadorAtual = null;
        technicalEditor?.reset();

        document.getElementById('modal-cancelar-agendamento')?.close();
        document.getElementById('tela-confirmacao').style.display = 'none';

        window.fecharConfirmacaoExclusao();

        document.getElementById('app-container').style.display = 'none';

        document.getElementById('tela-login').style.display = 'flex';

        desativarHistoricoNavegacao();
        mostrarApenasTela('tela-inicio');

        const btn = document.getElementById('btn-entrar');

        if (!user) { btn.disabled = false; btn.textContent = 'Entrar'; document.getElementById('login-senha').value = ''; return; }

        btn.disabled = true; btn.textContent = 'Validando acesso...';

        try {

            let perfil = null;

            for (const [colecao, nome] of [['assistencia','Assistente'], ['promotores','Promotor']]) {

                const snap = await getDocs(query(collection(db, colecao), where('email', '==', user.email)));

                if (versao !== versaoSessao) return;

                if (!snap.empty) {
                    const dadosPerfil = snap.docs[0].data() || {};
                    if (dadosPerfil.ativo === false || dadosPerfil.permissoes?.acessoApp === false) {
                        throw new Error('Seu acesso ao Advance Check está desativado. Procure seu gestor.');
                    }
                    perfil = {
                        ...dadosPerfil,
                        id: snap.docs[0].id,
                        nome: dadosPerfil.nome || 'Profissional',
                        tipo: nome,
                        permissoes: dadosPerfil.permissoes || {}
                    };
                    break;
                }

            }

            if (!perfil) throw new Error("E-mail não encontrado nas coleções 'assistencia' ou 'promotores'.");

            if (versao !== versaoSessao) return;

            idUsuarioLogado = perfil.id; nomeUsuarioLogado = perfil.nome; perfilUsuarioLogado = perfil.tipo; dadosPerfilLogado = perfil;

            document.getElementById('tela-login').style.display = 'none';

            document.getElementById('app-container').style.display = 'flex';

            document.getElementById('login-senha').value = '';

            ativarHistoricoNavegacao('tela-inicio');
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

window.mostrarConfirmacaoDescarteRelatorio = function(callback) {
    callbackExclusaoAtual = callback;
    const modal = document.getElementById('modal-confirmar-exclusao');
    modal.querySelector('h3').textContent = 'Sair sem salvar?';
    modal.querySelector('p').textContent = 'As alterações feitas no relatório serão descartadas.';
    modal.querySelector('.alert-btn-red').textContent = 'DESCARTAR';
    modal.style.display = 'flex';
};

// === FUNÇÕES DE LOCALIZAÇÃO ===

// === FUNÇÕES AUXILIARES ===

const buscarClientePorCnpj = createCnpjLookup((campoCnpj, valor) =>
    getDocs(query(collection(db, 'clientes'), where(campoCnpj, '==', valor)))
);

function mostrarApenasTela(idTelaAlvo) {
    if (idTelaAlvo === 'tela-nova-visita') atualizarLimitesAgendamento();

    const telas = ['tela-inicio', 'tela-agenda', 'tela-historico', 'tela-nova-visita', 'tela-cadastro-cliente', 'tela-visita-atual', 'tela-relatorio', 'tela-perfil', 'tela-detalhes-visita', 'tela-checkout', 'tela-visualizador-visita'];

    telas.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = (id === idTelaAlvo) ? 'block' : 'none'; });

    if (idTelaAlvo === 'tela-inicio') homeVisitMap.map?.resize();

    const indice = { 'tela-inicio': 0, 'tela-agenda': 1, 'tela-historico': 2, 'tela-perfil': 3 }[idTelaAlvo];

    document.querySelectorAll('.nav-item').forEach((el, i) => {
        el.classList.toggle('active', i === indice);
        if (i === indice) el.setAttribute('aria-current', 'page');
        else el.removeAttribute('aria-current');
    });

    document.body.classList.toggle('screen-form-mode', idTelaAlvo === 'tela-nova-visita' || idTelaAlvo === 'tela-detalhes-visita');

    if (idTelaAlvo === 'tela-relatorio') {

        document.getElementById('tela-relatorio').style.display = 'flex';


        document.querySelector('.bottom-nav').style.display = 'none';

    } else if (idTelaAlvo === 'tela-checkout') {

        document.getElementById('tela-checkout').style.display = 'block';


        document.querySelector('.bottom-nav').style.display = 'none';

    } else if (idTelaAlvo === 'tela-visualizador-visita') {

        document.getElementById('tela-visualizador-visita').style.display = 'block';


        document.querySelector('.bottom-nav').style.display = 'none';

    } else {


        document.querySelector('.bottom-nav').style.display = 'flex';

    }

}

function urlTela(idTela) {
    return location.pathname + location.search + (HASH_POR_TELA[idTela] || '#inicio');
}

function estadoAppValido(estado) {
    return !!(estado && estado[APP_HISTORY_KEY] === true && HASH_POR_TELA[estado.tela]);
}

function carregarConteudoTela(idTela) {
    if (!idUsuarioLogado) return;
    if (idTela === 'tela-inicio') carregarAtividadesPendentes();
    else if (idTela === 'tela-agenda') carregarAgenda();
    else if (idTela === 'tela-historico') carregarHistoricoVisitas();
    else if (idTela === 'tela-perfil') void profileView.open(dadosPerfilLogado);
    else if (idTela === 'tela-nova-visita') carregarDadosParaAutocomplete();
}

function ativarHistoricoNavegacao(idTelaInicial = 'tela-inicio') {
    navegacaoHistoricoAtiva = true;
    estadoNavegacaoAtual = { [APP_HISTORY_KEY]: true, tela: idTelaInicial, profundidade: 0 };
    history.replaceState(estadoNavegacaoAtual, '', urlTela(idTelaInicial));
    mostrarApenasTela(idTelaInicial);
}

function desativarHistoricoNavegacao() {
    navegacaoHistoricoAtiva = false;
    estadoNavegacaoAtual = null;
    ignorarProtecaoRelatorioUmaVez = false;
    history.replaceState(null, '', location.pathname + location.search);
}

function navegarParaTela(idTela, opcoes = {}) {
    const { substituir = false, carregar = true, forcar = false } = opcoes;
    if (!HASH_POR_TELA[idTela]) return;

    if (!navegacaoHistoricoAtiva) {
        mostrarApenasTela(idTela);
        if (carregar) carregarConteudoTela(idTela);
        return;
    }

    if (!forcar && estadoNavegacaoAtual?.tela === idTela) {
        mostrarApenasTela(idTela);
        if (carregar) carregarConteudoTela(idTela);
        return;
    }

    const profundidadeAtual = Number(estadoNavegacaoAtual?.profundidade || 0);
    const novoEstado = {
        [APP_HISTORY_KEY]: true,
        tela: idTela,
        profundidade: substituir ? profundidadeAtual : profundidadeAtual + 1
    };

    if (substituir) history.replaceState(novoEstado, '', urlTela(idTela));
    else history.pushState(novoEstado, '', urlTela(idTela));

    estadoNavegacaoAtual = novoEstado;
    mostrarApenasTela(idTela);
    if (carregar) carregarConteudoTela(idTela);
}

function abrirCamadaHistorica(nome) {
    if (!navegacaoHistoricoAtiva || !estadoNavegacaoAtual || estadoNavegacaoAtual.overlay === nome) return;

    const novoEstado = {
        ...estadoNavegacaoAtual,
        overlay: nome,
        profundidade: Number(estadoNavegacaoAtual.profundidade || 0) + 1
    };

    history.pushState(novoEstado, '', urlTela(estadoNavegacaoAtual.tela));
    estadoNavegacaoAtual = novoEstado;
}

function relatorioPossuiAlteracoesNaoSalvas() {
    if (!objetoAtividadeGlobal) return false;
    const tipo = normalizarTipoVisita(objetoAtividadeGlobal || {});
    if (tipo === 'Visita comercial' && commercialReport?.active) return commercialReport.dirty;
    if (tipo === 'Treinamento' && trainingReport?.active) return trainingReport.dirty;

    if (tipo === ASSISTENCIA_TECNICA_TIPO) {
        const atual = normalizarAssistenciaComparacao(lerFormularioAssistencia(objetoRelatorioGlobal));
        const salvo = normalizarAssistenciaComparacao(dadosAssistenciaDoRelatorio(objetoRelatorioGlobal));
        return technicalEditor?.dirty || JSON.stringify(atual) !== JSON.stringify(salvo);
    }

    return technicalEditor?.dirty || document.getElementById('rel-texto').value.trim() !== String(objetoRelatorioGlobal?.textoAtual || '').trim();
}

function voltarNavegacao(fallback = 'tela-inicio') {
    if (operacaoEmCurso) return;

    const profundidade = Number(estadoNavegacaoAtual?.profundidade || 0);
    if (navegacaoHistoricoAtiva && profundidade > 0) {
        history.back();
        return;
    }

    if (estadoNavegacaoAtual?.tela === 'tela-relatorio' && relatorioPossuiAlteracoesNaoSalvas()) {
        window.mostrarConfirmacaoDescarteRelatorio(() => navegarParaTela(fallback, { substituir: true }));
        return;
    }

    navegarParaTela(fallback, { substituir: true });
}

function configurarHistoricoNativo() {
    window.addEventListener('popstate', event => {
        if (!navegacaoHistoricoAtiva) return;

        const destino = event.state;
        const telaAtual = estadoNavegacaoAtual?.tela;
        if (telaAtual === 'tela-relatorio' && normalizarTipoVisita(objetoAtividadeGlobal || {}) === 'Treinamento' && trainingReport?.backModule()) {
            history.pushState(estadoNavegacaoAtual, '', urlTela(estadoNavegacaoAtual.tela));
            return;
        }
        if (telaAtual === 'tela-relatorio' && normalizarTipoVisita(objetoAtividadeGlobal || {}) === 'Visita comercial' && commercialReport?.backModule()) {
            history.pushState(estadoNavegacaoAtual, '', urlTela(estadoNavegacaoAtual.tela));
            return;
        }

        if (estadoNavegacaoAtual?.overlay === 'checkin') {
            document.getElementById('tela-confirmacao').style.display = 'none';
            if (estadoAppValido(destino)) {
                estadoNavegacaoAtual = destino;
                mostrarApenasTela(destino.tela);
                carregarConteudoTela(destino.tela);
            }
            return;
        }

        if (
            telaAtual === 'tela-relatorio' &&
            relatorioPossuiAlteracoesNaoSalvas() &&
            !ignorarProtecaoRelatorioUmaVez
        ) {
            const restaurado = estadoNavegacaoAtual || { [APP_HISTORY_KEY]: true, tela: 'tela-relatorio', profundidade: 1 };
            history.pushState(restaurado, '', urlTela('tela-relatorio'));
            window.mostrarConfirmacaoDescarteRelatorio(() => {
                ignorarProtecaoRelatorioUmaVez = true;
                history.back();
            });
            return;
        }

        ignorarProtecaoRelatorioUmaVez = false;

        if (!estadoAppValido(destino)) return;

        if (destino.tela === 'tela-checkout' && !checkoutPendenteGlobal) {
            estadoNavegacaoAtual = destino;
            navegarParaTela('tela-inicio', { substituir: true });
            return;
        }

        if (telaAtual === 'tela-checkout' && destino.tela !== 'tela-checkout') {
            checkoutPendenteGlobal = null;
        }

        estadoNavegacaoAtual = destino;
        mostrarApenasTela(destino.tela);
        carregarConteudoTela(destino.tela);
        window.scrollTo(0, 0);
    });
}

// === TELAS DE LEITURA ===

async function carregarAtividadesPendentes() {

    if (!idUsuarioLogado) return;

    const sessao = sessaoAtual(), pedido = ++sequenciaPendentes;

    const area = document.getElementById('area-visitas');

    const home = document.getElementById('tela-inicio');
    const placeholder = document.getElementById('home-loading');
    const content = document.getElementById('home-content');
    home.classList.add('home-loading');
    home.setAttribute('aria-busy', 'true');
    content.inert = true;
    placeholder.innerHTML = homeLoadingMarkup();
    placeholder.hidden = false;
    let proximasProntas = Promise.resolve();
    area.innerHTML = loadingMarkup(1);
    homeCalendar.setActivities([]);
    document.getElementById('home-upcoming-visits').innerHTML = loadingMarkup();
    document.getElementById('home-agenda-more').hidden = true;
    homeVisitMap.clear('Carregando mapa…');
    document.getElementById('home-location-address').textContent = '';

    try {

        const snap = await getDocs(query(collection(db, 'atividades'), where('ptvId', '==', sessao.id), where('status', 'in', ['Pendente','Em andamento'])));

        const atividades = snap.docs.map(d => ({ ...d.data(), id: d.id }));

        atividades.sort((a,b) => Number(b.status === 'Em andamento') - Number(a.status === 'Em andamento') || tempoData(a.data) - tempoData(b.data));

        if (!sessaoValida(sessao) || pedido !== sequenciaPendentes) return;

        homeCalendar.setActivities(atividades);
        proximasProntas = renderizarProximasVisitasInicio(atividades, sessao, pedido);
        if (!atividades.length) {
            limparEstadoVisita();
            area.innerHTML = `<div class="card-visita card-visita-empty"><div class="card-info"><h3 class="card-titulo">Nenhuma visita agendada</h3><p class="card-empty-description">Agende sua próxima visita para começar.</p></div><button type="button" class="btn-checkin">Agendar visita</button></div>`;
            area.querySelector('button').addEventListener('click', () => {
                if (operacaoEmCurso) return;
                navegarParaTela('tela-nova-visita');
                window.scrollTo(0, 0);
            });
            void homeVisitMap.update(null);
            return;
        }

        const atividade = atividades[0];

        const cliente = atividade.clienteId ? await obterCliente(atividade.clienteId) : null;

        const nomeCliente = cliente?.nome || 'Cliente não encontrado';

        let relatorio = null;

        if (atividade.status === 'Em andamento' && atividade.relatorioId) {

            relatorio = await carregarRelatorioDaAtividade(atividade);

            if (relatorio && (relatorio.atividadeId !== atividade.id || relatorio.ptvId !== sessao.id)) {
                throw new Error('O relatório associado não corresponde a esta visita.');
            }

        }

        if (!sessaoValida(sessao) || pedido !== sequenciaPendentes) return;

        const resultadosSecundarios = await Promise.allSettled(visitasSecundarias(atividades, atividade.id)
            .map(visita => visita.clienteId ? obterCliente(visita.clienteId) : Promise.resolve(null)));
        if (!sessaoValida(sessao) || pedido !== sequenciaPendentes) return;
        const clientesSecundarios = resultadosSecundarios.map(resultado => resultado.status === 'fulfilled' ? resultado.value : null).filter(Boolean);
        document.getElementById('home-location-address').textContent = cliente?.enderecoCompleto || '';
        void homeVisitMap.update(cliente, clientesSecundarios);

        limparEstadoVisita();

        if (atividade.status === 'Em andamento') {

            atividadeSelecionadaId = atividade.id; clienteSelecionadoId = atividade.clienteId; clienteSelecionadoNome = nomeCliente;

            objetoAtividadeGlobal = atividade; objetoRelatorioGlobal = relatorio;
            if (normalizarTipoVisita(atividade) === 'Visita comercial') commercialReport.hydrate(atividade.id, relatorio);
            if (normalizarTipoVisita(atividade) === 'Treinamento') trainingReport.hydrate(atividade.id, relatorio);

            atualizarInterfaceVisitaAtual(); return;

        }

        area.innerHTML = `<div class="card-visita"><div class="card-info"><h3 class="card-titulo">${escaparHtml(nomeCliente)}</h3></div><button class="btn-checkin" style="width:auto">Check-in</button></div>`;

        const btn = area.querySelector('button');

        btn.disabled = !cliente;

        btn.addEventListener('click', () => window.abrirConfirmacaoCheckin(atividade.id, nomeCliente, atividade.clienteId));

    } catch (erro) {

        if (!sessaoValida(sessao) || pedido !== sequenciaPendentes) return;

        homeVisitMap.clear('Não foi possível carregar a próxima visita.');
        document.getElementById('home-upcoming-visits').textContent = 'Não foi possível carregar os agendamentos.';
        document.getElementById('home-agenda-more').hidden = true;
        area.textContent = 'Não foi possível carregar as visitas.'; informarErro('Erro ao carregar visitas', erro);

    } finally {
        await Promise.allSettled([proximasProntas, homeVisitMap.ready]);
        if (sessaoValida(sessao) && pedido === sequenciaPendentes) {
            home.classList.remove('home-loading');
            home.removeAttribute('aria-busy');
            content.inert = false;
            placeholder.hidden = true;
            placeholder.replaceChildren();
            homeVisitMap.map?.resize();
        }
    }

}

async function renderizarProximasVisitasInicio(atividades, sessao, pedido) {
    const area = document.getElementById('home-upcoming-visits');
    const mais = document.getElementById('home-agenda-more');
    try {
        const visitas = await Promise.all(proximasVisitas(atividades).map(async atividade => {
            const cliente = atividade.clienteId ? await obterCliente(atividade.clienteId) : null;
            return { ...atividade, nomeCliente: cliente?.nome || 'Cliente não encontrado',
                enderecoCompleto: cliente?.enderecoCompleto || '',
                localidadeAgenda: [cliente?.cidade, cliente?.uf].map(valor => String(valor || '').trim()).filter(Boolean).join(' - ').toLocaleUpperCase('pt-BR') };
        }));
        if (!sessaoValida(sessao) || pedido !== sequenciaPendentes) return;
        area.innerHTML = visitas.length ? visitas.map((visita, index) => cardAgenda(visita, index, true)).join('')
            : '<p class="agenda-empty">Nenhuma próxima visita agendada.</p>';
        mais.hidden = !visitas.length;
        area.querySelectorAll('[data-ficha-index]').forEach(button => button.addEventListener('click', () => {
            if (!operacaoEmCurso) window.abrirDetalhesVisita(-1, visitas[Number(button.dataset.fichaIndex)]);
        }));
    } catch (error) {
        if (!sessaoValida(sessao) || pedido !== sequenciaPendentes) return;
        area.textContent = 'Não foi possível carregar os agendamentos.';
        mais.hidden = true;
    }
}

async function carregarAgenda() {

    if (!idUsuarioLogado) return;

    const sessao = sessaoAtual(), pedido = ++sequenciaAgenda;

    const areaAgenda = document.getElementById('area-agenda');
    agendaCarregando = true;
    listaAtividadesAgenda = [];
    agendaCalendar.setActivities([]);

    areaAgenda.innerHTML = loadingMarkup();

    try {

        // Inclui "Em andamento" na pesquisa

        const q = query(collection(db, "atividades"), where("ptvId", "==", idUsuarioLogado), where("status", "in", ["Pendente", "Em andamento"]));

        const querySnapshot = await getDocs(q);

        if (!sessaoValida(sessao) || pedido !== sequenciaAgenda) return;

        listaAtividadesAgenda = [];


        const atividadesCarregadas = await Promise.all(querySnapshot.docs.map(async documento => {

            const dados = documento.data(); dados.id = documento.id;
            dados.nomeCliente = "Cliente não encontrado"; dados.enderecoCompleto = ""; dados.localidadeAgenda = "";

            const cliente = dados.clienteId ? await obterCliente(dados.clienteId) : null;
            if (cliente) {
                dados.nomeCliente = cliente.nome || "Cliente sem nome";
                dados.enderecoCompleto = cliente.enderecoCompleto || '';
                dados.localidadeAgenda = [cliente.cidade, cliente.uf].map(valor => String(valor || '').trim()).filter(Boolean).join(' - ').toLocaleUpperCase('pt-BR');
            } else if (!dados.clienteId) {
                dados.nomeCliente = "Desconhecido";
            }

            return dados;

        }));

        if (!sessaoValida(sessao) || pedido !== sequenciaAgenda) return;

        listaAtividadesAgenda = atividadesCarregadas.sort((a, b) => tempoData(a.data) - tempoData(b.data));
        agendaCalendar.setActivities(listaAtividadesAgenda);

        agendaCarregando = false;
        renderizarAgenda();

    } catch (error) { if (sessaoValida(sessao) && pedido === sequenciaAgenda) { agendaCarregando = false; areaAgenda.textContent = 'Não foi possível carregar a agenda.'; informarErro('Erro na agenda', error); } }

}

function renderizarAgenda() {
    const areaAgenda = document.getElementById('area-agenda');
    const cardsAgenda = [];
    const filtradas = filtrarAgenda(listaAtividadesAgenda, agendaCalendar.mes, agendaCalendar.selecionado);
    let diaAnterior = '';
    if (!filtradas.length) {
        areaAgenda.innerHTML = `<p class="agenda-empty">${agendaCalendar.selecionado ? 'Nenhuma visita agendada para este dia.' : 'Nenhuma visita agendada neste período do mês.'}</p>`;
        return;
    }

    filtradas.forEach(({ atividade, index }) => {

        const fData = formatarDataAgenda(atividade.data);

        if (diaAnterior !== fData.diaMes) {
            cardsAgenda.push(`<h2 class="agenda-day-heading">${fData.diaMes}</h2>`);
            diaAnterior = fData.diaMes;
        }

        cardsAgenda.push(cardAgenda(atividade, index));

    });
    areaAgenda.innerHTML = cardsAgenda.join('');

    areaAgenda.querySelectorAll('[data-ficha-index]').forEach(btn => btn.addEventListener('click', () => {
        if (!operacaoEmCurso) window.abrirDetalhesVisita(Number(btn.dataset.fichaIndex));
    }));


}

function renderizarHistoricoVisitas(visitas) {
    const area = document.getElementById('area-historico-visitas');
    const gruposPeriodo = new Map();

    visitas.forEach(visita => {
        const data = obterDataHistorico(visita);
        if (!data) return;

        const periodo = periodoHistorico(visita);
        const chaveDia = `${periodo}|${data.getFullYear()}-${data.getMonth()}-${data.getDate()}`;

        if (!gruposPeriodo.has(periodo)) gruposPeriodo.set(periodo, new Map());
        const dias = gruposPeriodo.get(periodo);

        if (!dias.has(chaveDia)) dias.set(chaveDia, { data, visitas: [] });
        dias.get(chaveDia).visitas.push(visita);
    });

    area.innerHTML = '';

    if (!visitas.length || !gruposPeriodo.size) {
        area.innerHTML = '<p class="hist-vazio">Nenhuma visita encontrada para os filtros selecionados.</p>';
        return;
    }

    const ordemPeriodos = [...gruposPeriodo.entries()].sort((a, b) => {
        const da = [...a[1].values()][0]?.data?.getTime() || 0;
        const db = [...b[1].values()][0]?.data?.getTime() || 0;
        return db - da;
    });

    ordemPeriodos.forEach(([periodo, dias]) => {
        const blocoPeriodo = document.createElement('section');
        blocoPeriodo.className = 'historico-periodo';

        const tituloPeriodo = document.createElement('h2');
        tituloPeriodo.className = 'historico-periodo-titulo';
        tituloPeriodo.textContent = periodo;
        blocoPeriodo.appendChild(tituloPeriodo);

        [...dias.values()]
            .sort((a, b) => b.data.getTime() - a.data.getTime())
            .forEach(grupo => {
                const blocoDia = document.createElement('div');
                blocoDia.className = 'historico-dia';

                const tituloDia = document.createElement('h3');
                tituloDia.className = 'historico-dia-titulo';
                tituloDia.textContent = formatarDiaHistorico(grupo.data);
                blocoDia.appendChild(tituloDia);

                grupo.visitas
                    .sort((a, b) => (obterDataHistorico(b)?.getTime() || 0) - (obterDataHistorico(a)?.getTime() || 0))
                    .forEach(visita => {
                        const card = document.createElement('article');
                        card.className = 'historico-card';

                        const topo = document.createElement('div');
                        topo.className = 'historico-card-top';

                        const nome = document.createElement('div');
                        nome.className = 'hist-cliente';
                        nome.textContent = visita.nomeCliente || 'Cliente não encontrado';

                        const resultado = obterResultadoHistorico(visita);
                        const status = document.createElement('span');
                        status.className = `hist-status ${obterClasseResultadoHistorico(resultado)}`;
                        status.textContent = resultado;

                        topo.append(nome, status);

                        const horario = document.createElement('div');
                        horario.className = 'hist-info';
                        horario.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true" class="heroicon" data-heroicon="clock" width="24" height="24"> <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/> </svg>';
                        horario.append(document.createTextNode(formatarHorarioVisitaHistorico(visita)));

                        const endereco = document.createElement('div');
                        endereco.className = 'hist-info';
                        endereco.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true" class="heroicon" data-heroicon="map-pin" width="24" height="24"> <path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/> <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z"/> </svg>';
                        endereco.append(document.createTextNode(visita.enderecoCompleto || 'Endereço não informado'));

                        card.classList.add('historico-card-clicavel');
                        card.tabIndex = 0;
                        card.setAttribute('role', 'button');
                        card.setAttribute('aria-label', 'Visualizar visita de ' + (visita.nomeCliente || 'cliente'));
                        card.addEventListener('click', () => window.abrirVisualizadorVisita(visita.id));
                        card.addEventListener('keydown', event => {
                            if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                window.abrirVisualizadorVisita(visita.id);
                            }
                        });

                        card.append(topo, horario, endereco);
                        blocoDia.appendChild(card);
                    });

                blocoPeriodo.appendChild(blocoDia);
            });

        area.appendChild(blocoPeriodo);
    });
}

async function carregarHistoricoVisitas() {
    if (!idUsuarioLogado) return;

    const sessao = sessaoAtual(), pedido = ++sequenciaHistorico;
    const areaHistorico = document.getElementById('area-historico-visitas');

    areaHistorico.innerHTML = loadingMarkup();

    try {
        const q = query(
            collection(db, 'atividades'),
            where('ptvId', '==', sessao.id),
            where('status', 'in', ['Concluída', 'Cancelada']),
            orderBy('data', 'desc'),
            limit(100)
        );

        let documentosHistorico;

        try {
            documentosHistorico = (await getDocs(q)).docs;
        } catch (erro) {
            if (erro.code !== 'failed-precondition') throw erro;
            console.warn('Índice do histórico indisponível; usando consulta de compatibilidade. Consulte firestore.indexes.json.');
            documentosHistorico = (await getDocs(query(
                collection(db, 'atividades'),
                where('ptvId', '==', sessao.id)
            ))).docs;
        }

        documentosHistorico = documentosHistorico.filter(documento => {
            const status = documento.data()?.status;
            return status === 'Concluída' || status === 'Cancelada';
        });
        if (!sessaoValida(sessao) || pedido !== sequenciaHistorico) return;

        documentosHistorico.sort((a, b) => tempoData(b.data().data) - tempoData(a.data().data));
        documentosHistorico = documentosHistorico.slice(0, 100);
        if (!documentosHistorico.length) {
            historicoCarregado = [];
            areaHistorico.innerHTML = '<p class="hist-vazio">Nenhuma visita encontrada.</p>';
            return;
        }

        const historicoArray = await Promise.all(documentosHistorico.map(async documento => {
            const dados = { ...documento.data(), id: documento.id, nomeCliente: "Cliente não encontrado", enderecoCompleto: "" };
            const cliente = dados.clienteId ? await obterCliente(dados.clienteId) : null;

            if (cliente) {
                dados.nomeCliente = cliente.nome || "Cliente sem nome";
                dados.enderecoCompleto = cliente.enderecoCompleto || "";
            }

            return dados;
        }));

        if (!sessaoValida(sessao) || pedido !== sequenciaHistorico) return;

        historicoArray.sort((a, b) => (obterDataHistorico(b)?.getTime() || 0) - (obterDataHistorico(a)?.getTime() || 0));

        historicoCarregado = historicoArray;
        renderizarHistoricoVisitas(aplicarFiltrosHistorico(historicoArray, filtrosHistorico));
    } catch (error) {
        if (sessaoValida(sessao) && pedido === sequenciaHistorico) {
            areaHistorico.textContent = "Não foi possível carregar o histórico.";
            informarErro("Erro no histórico", error);
        }
    }
}

function configurarFiltroHistorico() {
    const botao = document.getElementById('btn-filtro-historico');
    const painel = document.getElementById('historico-filtro');
    const periodo = document.getElementById('filtro-historico-periodo');
    const resultado = document.getElementById('filtro-historico-resultado');
    const tipo = document.getElementById('filtro-historico-tipo');
    const limpar = document.getElementById('btn-limpar-filtro-historico');

    if (!botao || !painel) return;

    botao.addEventListener('click', () => {
        const aberto = !painel.hidden;
        painel.hidden = aberto;
        botao.setAttribute('aria-expanded', String(!aberto));
    });

    periodo?.addEventListener('change', () => {
        filtrosHistorico.periodo = periodo.value;
        if (historicoCarregado) renderizarHistoricoVisitas(aplicarFiltrosHistorico(historicoCarregado, filtrosHistorico));
        else carregarHistoricoVisitas();
    });

    resultado?.addEventListener('change', () => {
        filtrosHistorico.resultado = resultado.value;
        if (historicoCarregado) renderizarHistoricoVisitas(aplicarFiltrosHistorico(historicoCarregado, filtrosHistorico));
        else carregarHistoricoVisitas();
    });

    tipo?.addEventListener('change', () => {
        filtrosHistorico.tipo = tipo.value;
        if (historicoCarregado) renderizarHistoricoVisitas(aplicarFiltrosHistorico(historicoCarregado, filtrosHistorico));
        else carregarHistoricoVisitas();
    });

    limpar?.addEventListener('click', () => {
        filtrosHistorico = { periodo: 'todos', resultado: 'todos', tipo: 'todos' };
        if (periodo) periodo.value = 'todos';
        if (resultado) resultado.value = 'todos';
        if (tipo) tipo.value = 'todos';
        if (historicoCarregado) renderizarHistoricoVisitas(aplicarFiltrosHistorico(historicoCarregado, filtrosHistorico));
        else carregarHistoricoVisitas();
    });
}

// === TELA: NOVA VISITA ===

function atualizarLimitesAgendamento(prefixo = 'nv') {
    const campoData = document.getElementById(`${prefixo}-data`);
    const campoHora = document.getElementById(`${prefixo}-hora`);
    const { minimo, minInput, maxInput } = limitesAgendamento();
    campoData.min = minInput;
    campoData.max = maxInput;
    campoHora.min = campoData.value === minInput ? `${String(minimo.getHours()).padStart(2, '0')}:${String(minimo.getMinutes()).padStart(2, '0')}` : '';
}

function selecionarClienteAgendamento(cliente) {
    nvClienteSelecionadoId = cliente.id;
    document.getElementById('nv-cliente').value = tituloCliente(cliente);
    document.getElementById('nv-cliente-detalhes').innerHTML = detalhesCliente(cliente);
}

function configurarTelaNovaVisita() {
    ['nv-data', 'nv-hora'].forEach(id => {
        document.getElementById(id).addEventListener('focus', () => atualizarLimitesAgendamento());
        document.getElementById(id).addEventListener('change', () => atualizarLimitesAgendamento());
    });
    atualizarLimitesAgendamento();

    const inputNota = document.getElementById('nv-nota');

    const countNota = document.getElementById('nv-char-count');

    if(inputNota) { inputNota.addEventListener('input', () => { countNota.textContent = `${inputNota.value.length}/600`; }); }

    const inputCliente = document.getElementById('nv-cliente');

    const dropCliente = document.getElementById('nv-cliente-dropdown');

    if (inputCliente) {

        const mostrarSugestoes = consulta => {
            dropCliente.innerHTML = '';
            const filtrados = filtrarClientes(listaClientes, consulta);

            const divNovo = document.createElement('div');

            divNovo.className = 'autocomplete-item autocomplete-item-novo';

            divNovo.textContent = `+ Cadastrar novo cliente`;

            divNovo.addEventListener('click', () => { if (operacaoEmCurso) return; limparCadastroCliente(); navegarParaTela('tela-cadastro-cliente'); dropCliente.style.display = 'none'; });

            dropCliente.appendChild(divNovo);

            filtrados.forEach(item => {

                const div = document.createElement('button'); div.type = 'button'; div.className = 'autocomplete-item autocomplete-client-option'; div.innerHTML = opcaoCliente(item);

                div.addEventListener('click', () => { selecionarClienteAgendamento(item); dropCliente.style.display = 'none'; });

                dropCliente.appendChild(div);

            });

            dropCliente.style.display = 'block';

        };

        inputCliente.addEventListener('input', () => {
            nvClienteSelecionadoId = null;
            document.getElementById('nv-cliente-detalhes').innerHTML = '';
            mostrarSugestoes(inputCliente.value);
        });

        inputCliente.addEventListener('focus', () => {
            const selecionado = listaClientes.find(cliente => cliente.id === nvClienteSelecionadoId);
            mostrarSugestoes(selecionado?.nome || (nvClienteSelecionadoId ? '' : inputCliente.value));
        });

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
                atualizarLimitesAgendamento();
                validarAgendamento(data);

                const tipoVisita = document.querySelector('input[name="tipoVisita"]:checked')?.value;

                if (!tipoVisita) throw new Error('Selecione o tipo de visita.');

                const nota = document.getElementById('nv-nota').value.trim();

                if (nota.length > 600) throw new Error('A nota deve ter até 600 caracteres.');

                operacaoEmCurso = true; btnAgendar.disabled = true; btnAgendar.textContent = 'Agendando...';

                const cliente = await obterCliente(clienteId);

                exigirSessao(sessao);

                if (!cliente || !['Ativo', 'Provisorio'].includes(cliente.status)) throw new Error('O cliente não está disponível para agendamento. Atualize a lista.');

                const agora = new Date();
                validarAgendamento(data, agora);
                const atividadeId = gerarIdAtividade(tipoVisita, data, nomeUsuarioLogado);

                await setDoc(doc(db, 'atividades', atividadeId), {

                    tipo: 'Visita', data, ptvId: sessao.id, clienteId, tipoVisita, nota,

                    status: 'Pendente', criadoEm: agora, atualizadoEm: agora

                });

                if (!sessaoValida(sessao)) return;

                inputCliente.value = ''; nvClienteSelecionadoId = null;
                document.getElementById('nv-cliente-detalhes').innerHTML = '';

                ['nv-data','nv-hora','nv-nota'].forEach(id => document.getElementById(id).value = '');

                countNota.textContent = '0/600';

                document.querySelector('input[name="tipoVisita"][value="Visita comercial"]').checked = true;

                window.mostrarAlerta('Sucesso', 'Visita agendada.');

                navegarParaTela('tela-agenda', { substituir: true, carregar: false });
                await carregarAgenda();

            } catch (erro) { informarErro('Não foi possível agendar', erro); }

            finally { operacaoEmCurso = false; btnAgendar.disabled = false; btnAgendar.textContent = 'Agendar'; }

        });

    }

}

window.abrirVisualizadorVisita = async function(atividadeId) {
    if (operacaoEmCurso || !atividadeId) return;

    const sessao = sessaoAtual();
    const area = document.getElementById('tela-visualizador-visita');
    const clienteEl = document.getElementById('visu-cliente');

    area.style.display = 'block';
    navegarParaTela('tela-visualizador-visita', { carregar: false });
    preencherCampoVisualizador('visu-cliente', 'Carregando...');
    preencherCampoVisualizador('visu-relatorio', 'Carregando...');
    window.scrollTo(0, 0);

    try {
        const atividadeSnap = await getDoc(doc(db, 'atividades', atividadeId));
        exigirSessao(sessao);

        if (!atividadeSnap.exists()) throw new Error('Visita não encontrada.');
        const atividade = { ...atividadeSnap.data(), id: atividadeSnap.id };
        if (atividade.ptvId !== sessao.id) throw new Error('Esta visita não pertence ao usuário conectado.');

        const [cliente, relatorio] = await Promise.all([
            atividade.clienteId ? obterCliente(atividade.clienteId) : Promise.resolve(null),
            atividade.relatorioId ? carregarRelatorioDaAtividade(atividade) : Promise.resolve(null)
        ]);

        exigirSessao(sessao);

        if (relatorio && (relatorio.atividadeId !== atividade.id || relatorio.ptvId !== sessao.id)) {
            throw new Error('O relatório associado não corresponde a esta visita.');
        }

        // Mantém os dados da visita atual disponíveis para ações do visualizador,
        // como compartilhamento e exportação, sem depender da tela anterior.
        objetoAtividadeGlobal = atividade;
        objetoRelatorioGlobal = relatorio;
        clienteSelecionadoId = atividade.clienteId || null;
        clienteSelecionadoNome = cliente?.nome || '';

        clienteVisualizadorAtual = cliente;
        renderizarVisualizadorVisita(atividade, cliente, relatorio);
    } catch (erro) {
        informarErro('Não foi possível abrir a visita', erro);
        navegarParaTela('tela-historico', { substituir: true });
    }
};

// === TELA 8: DETALHES DA VISITA ===

let visitaEmEdicao = null;
let abrirCancelamentoAtividade = () => {};

window.abrirDetalhesVisita = function(index, atividadeEscolhida = null) {

    if (operacaoEmCurso) return;

    visitaEmEdicao = atividadeEscolhida || listaAtividadesAgenda[index];

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
    atualizarLimitesAgendamento('det');

    document.getElementById('det-nota').value = visitaEmEdicao.nota || "";

    // Preenche radio buttons

    const objValue = normalizarTipoVisita(visitaEmEdicao);

    document.querySelectorAll('input[name="detTipoVisita"]').forEach(rad => { rad.checked = rad.value === objValue; });

    // Bloqueia campos se não for pendente

    const inputs = ['det-data', 'det-hora', 'det-nota', 'btn-salvar-detalhes'];

    const emAndamento = visitaEmEdicao.status !== 'Pendente';
    document.getElementById('btn-cancelar-agendamento').hidden = !atividadePodeSerCancelada(visitaEmEdicao);
    document.getElementById('btn-cancelar-agendamento').textContent = visitaEmEdicao.status === 'Em andamento' ? 'Cancelar atividade' : 'Cancelar agendamento';

    inputs.forEach(id => { document.getElementById(id).disabled = emAndamento; });

    document.querySelectorAll('input[name="detTipoVisita"]').forEach(radio => radio.disabled = emAndamento);

    if (emAndamento) {

        document.getElementById('btn-salvar-detalhes').style.opacity = '0.5';

        window.mostrarAvisoAndamento();

    } else {

        document.getElementById('btn-salvar-detalhes').style.opacity = '1';

    }

    navegarParaTela('tela-detalhes-visita', { carregar: false });

};

function configurarTelaDetalhesVisita() {
    ['det-data', 'det-hora'].forEach(id => {
        ['focus', 'change'].forEach(evento => document.getElementById(id).addEventListener(evento, () => atualizarLimitesAgendamento('det')));
    });

    document.getElementById('btn-voltar-detalhes')?.addEventListener('click', () => voltarNavegacao('tela-agenda'));

    const cancelDialog = document.getElementById('modal-cancelar-agendamento');
    const cancelForm = document.getElementById('form-cancelamento');
    const motivo = document.getElementById('cancelamento-motivo');
    const detalhe = document.getElementById('cancelamento-detalhe');
    const confirm = document.getElementById('btn-confirmar-cancelamento');
    const close = document.getElementById('btn-fechar-cancelamento');
    const error = document.getElementById('cancelamento-erro');
    let cancelRequest = null;
    abrirCancelamentoAtividade = atividade => {
        if (!atividade?.id || operacaoEmCurso || !atividadePodeSerCancelada(atividade)) return;
        cancelRequest = { id: atividade.id, sessao: sessaoAtual() };
        document.getElementById('cancelamento-titulo').textContent = atividade.status === 'Em andamento' ? 'Cancelar atividade' : 'Cancelar agendamento';
        cancelForm.reset();
        detalhe.required = false;
        document.getElementById('cancelamento-outro').hidden = true;
        error.textContent = '';
        cancelDialog.showModal();
    };
    document.getElementById('btn-cancelar-agendamento').addEventListener('click', () => abrirCancelamentoAtividade(visitaEmEdicao));
    motivo.addEventListener('change', () => {
        const outro = motivo.value === 'Outro';
        document.getElementById('cancelamento-outro').hidden = !outro;
        detalhe.required = outro;
        error.textContent = '';
    });
    close.addEventListener('click', () => { if (!operacaoEmCurso) cancelDialog.close(); });
    cancelDialog.addEventListener('cancel', event => { if (operacaoEmCurso) event.preventDefault(); });
    cancelDialog.addEventListener('close', () => { cancelRequest = null; });
    cancelForm.addEventListener('submit', async event => {
        event.preventDefault();
        if (!cancelRequest || operacaoEmCurso) return;
        const { id, sessao } = cancelRequest;
        operacaoEmCurso = true;
        confirm.disabled = close.disabled = motivo.disabled = detalhe.disabled = true;
        confirm.textContent = 'Cancelando…';
        error.textContent = '';
        try {
            await cancelarAgendamento({
                transaction: callback => runTransaction(db, callback), reference: doc(db, 'atividades', id),
                validateSession: () => exigirSessao(sessao), usuarioId: sessao.id,
                motivo: motivo.value, detalhe: detalhe.value
            });
            if (!sessaoValida(sessao)) return;
            cancelDialog.close();
            if (atividadeSelecionadaId === id) limparEstadoVisita();
            visitaEmEdicao = null;
            historicoCarregado = null;
            navegarParaTela('tela-agenda', { substituir: true, carregar: false });
            void Promise.allSettled([carregarAgenda(), carregarAtividadesPendentes()]);
            if (sessaoValida(sessao)) window.mostrarAlerta('Atividade cancelada', 'A atividade foi mantida no histórico com o motivo do cancelamento.');
        } catch (erro) {
            if (sessaoValida(sessao)) error.textContent = erro.message || 'Não foi possível cancelar. Tente novamente.';
        } finally {
            operacaoEmCurso = false;
            confirm.disabled = close.disabled = motivo.disabled = detalhe.disabled = false;
            confirm.textContent = 'Confirmar cancelamento';
        }
    });

    document.getElementById('btn-salvar-detalhes')?.addEventListener('click', async () => {

        if (!visitaEmEdicao || operacaoEmCurso) return;

        const btn = document.getElementById('btn-salvar-detalhes');

        try {

            const sessao = sessaoAtual(), id = visitaEmEdicao.id;

            const data = lerDataHora(document.getElementById('det-data').value, document.getElementById('det-hora').value);
            atualizarLimitesAgendamento('det');
            validarAgendamento(data);

            const tipoVisita = document.querySelector('input[name="detTipoVisita"]:checked')?.value;

            if (!tipoVisita) throw new Error('Selecione um tipo de visita disponível.');

            const nota = document.getElementById('det-nota').value.trim();

            if (nota.length > 600) throw new Error('A nota deve ter até 600 caracteres.');

            operacaoEmCurso = true; btn.disabled = true; btn.textContent = 'Salvando...';

            await runTransaction(db, async tx => {

                const ref = doc(db,'atividades',id), snap = await tx.get(ref);

                if (!snap.exists()) throw new Error('Visita não encontrada.');

                validarResponsavel(snap.data(), sessao);

                if (snap.data().status !== 'Pendente') throw new Error('Somente visitas pendentes podem ser editadas.');

                validarAgendamento(data);
                tx.update(ref, { data, tipoVisita, nota, atualizadoEm: new Date() });

            });

            if (!sessaoValida(sessao)) return;

            window.mostrarAlerta('Sucesso', 'Visita atualizada.');
            navegarParaTela('tela-agenda', { substituir: true, carregar: false });
            await carregarAgenda();

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
        const snap = await getDocs(query(collection(db,'clientes'), where('status','in',['Ativo','Provisorio'])));
        if (!sessaoValida(sessao)) return;

        listaClientes = snap.docs.map(d => {
            const dados = d.data();
            const cliente = { id: d.id, ...dados, nome: String(dados.nome || 'Cliente sem nome') };
            clientesRepository.set(d.id, cliente);
            return cliente;
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

    const enderecoParaCoordenadas = () => ({ logradouro: campo('cc-endereco').value.trim(), numero: campo('cc-numero').value.trim(), cidade: campo('cc-cidade').value.trim(), uf: campo('cc-uf').value.trim().toUpperCase(), bairro: campo('cc-bairro').value.trim(), cep: campo('cc-cep').value.trim() });

    const localizarLoja = async sessao => {
        const endereco = enderecoParaCoordenadas();
        let coords = null, centro = null;
        campo('btn-salvar-cliente').textContent = 'Localizando endereço...';
        try { coords = await obterCoordsPorEndereco(endereco); }
        catch (error) { console.warn('Endereço sem coordenadas; será cadastrado como incerto.', error); }
        exigirSessao(sessao);
        if (!coords) {
            try {
                await new Promise(resolve => setTimeout(resolve, 1100));
                centro = await buscarCentroCidade(endereco.cidade, endereco.uf);
            } catch (error) { console.warn('Centro da cidade indisponível; poderá ser consultado no check-in.', error); }
            exigirSessao(sessao);
        }
        return dadosLocalizacaoCadastro(coords, centro);
    };

    const mostrarMapa = endereco => {

        campo('mapa-iframe').src = `https://maps.google.com/maps?q=${encodeURIComponent(endereco)}&output=embed`;

        campo('mapa-container').style.display = 'block';

    };

    // Permite cadastro manual caso os serviços de consulta estejam indisponíveis.

    campo('cc-cidade').readOnly = false; campo('cc-uf').readOnly = false; campo('cc-uf').maxLength = 2;

    cnpj.addEventListener('input', () => {

        cnpjNovoCliente = null; versaoConsultaCnpj++; invalidarCoordenadas(); campo('cc-status-cnpj').textContent = '';

    });

    ['cc-cep','cc-endereco','cc-numero','cc-bairro','cc-cidade','cc-uf'].forEach(id => campo(id).addEventListener('input', invalidarCoordenadas));

    cnpj.addEventListener('blur', async () => {

        if (!idUsuarioLogado || cadastroSalvando) return;

        const puro = cnpj.value.replace(/\D/g, '');

        // CNPJ é opcional. Sem CNPJ, o cadastro segue como provisório e não dispara consulta externa.
        if (!puro) {
            cnpjNovoCliente = null;
            campo('cc-status-cnpj').textContent = ' (Opcional)';
            return;
        }

        const pedido = ++versaoConsultaCnpj, sessao = sessaoAtual();

        const lbl = campo('cc-status-cnpj');

        if (!cnpjValido(puro)) { cnpjNovoCliente = null; lbl.textContent = ' (CNPJ inválido)'; return; }

        cnpjNovoCliente = puro;

        const enderecoVersao = versaoConsultaEndereco;

        const valoresAntes = ['cc-nome','cc-cep','cc-endereco','cc-numero','cc-bairro','cc-cidade','cc-uf'].map(id => campo(id).value);

        consultasCadastro++; atualizarBotaoCadastro(); lbl.textContent = ' (Consultando...)';

        try {

            const snap = await buscarClientePorCnpj(puro);

            if (!sessaoValida(sessao) || pedido !== versaoConsultaCnpj) return;

            if (!snap.empty) {

                const existente = snap.docs[0];

                if (existente.data().status !== 'Ativo') throw new Error('Este CNPJ já existe, mas está inativo. Solicite a reativação do cadastro.');

                selecionarClienteAgendamento({ ...existente.data(), id: existente.id });

                limparCadastroCliente(); voltarNavegacao('tela-nova-visita'); window.mostrarAlerta('Cliente localizado', 'Esta loja já está cadastrada e foi selecionada.'); return;

            }

            const dados = await buscarJson(`https://brasilapi.com.br/api/cnpj/v1/${puro}`);

            if (!sessaoValida(sessao) || pedido !== versaoConsultaCnpj) return;

            // Uma resposta atrasada não deve substituir o que o usuário acabou de digitar.

            const ids = ['cc-nome','cc-cep','cc-endereco','cc-numero','cc-bairro','cc-cidade','cc-uf'];

            const valores = [dados.nome_fantasia || dados.razao_social || '', String(dados.cep || '').replace(/\D/g,''), [dados.descricao_tipo_de_logradouro, dados.logradouro].filter(Boolean).join(' ').trim(), dados.numero || '', dados.bairro || '', dados.municipio || '', dados.uf || ''];

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

        limparCadastroCliente(); voltarNavegacao('tela-nova-visita');

    });

    campo('btn-salvar-cliente').addEventListener('click', async () => {

        if (operacaoEmCurso || consultasCadastro > 0) return;

        const btn = campo('btn-salvar-cliente');

        try {

            const sessao = sessaoAtual(), puro = cnpj.value.replace(/\D/g,'');

            if (puro && !cnpjValido(puro)) throw new Error('Informe um CNPJ válido, incluindo os dígitos verificadores.');

            const cnpjReal = puro || null;
            const nome = campo('cc-nome').value.trim();

            const cidade = campo('cc-cidade').value.trim(), uf = campo('cc-uf').value.trim().toUpperCase();

            const ufs = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

            if (!nome || !cidade || !ufs.includes(uf) || !campo('cc-endereco').value.trim() || !campo('cc-numero').value.trim()) throw new Error('Preencha nome, endereço, número, cidade e UF válidos.');

            const enderecoCompleto = valoresEndereco();

            cadastroSalvando = true; operacaoEmCurso = true; atualizarBotaoCadastro(); btn.textContent = 'Salvando...';

            let clienteId, nomeFinal = nome, localizado = false, localizacaoSalva = null;

            if (cnpjReal) {
                // O CNPJ real é a chave de unicidade; códigos antigos continuam aceitos apenas para compatibilidade.
                const anteriores = await buscarClientePorCnpj(cnpjReal);

                exigirSessao(sessao);

                if (!anteriores.empty) {

                    const existente = anteriores.docs[0];

                    if (existente.data().status !== 'Ativo') throw new Error('Este CNPJ já existe, mas está inativo. Solicite a reativação.');

                    clienteId = existente.id; nomeFinal = existente.data().nome || nome; localizado = true;

                } else {

                    const coords = await localizarLoja(sessao);

                    exigirSessao(sessao);

                    localizacaoSalva = coords;

                    clienteId = gerarIdClienteCnpj(cnpjReal);
                    const ref = doc(db,'clientes',clienteId);

                    const resultado = await runTransaction(db, async tx => {
                        const atual = await tx.get(ref); exigirSessao(sessao);
                        if (atual.exists()) {
                            if (atual.data().status !== 'Ativo') throw new Error('Este CNPJ está inativo. Solicite a reativação.');
                            return { nome: atual.data().nome || nome, localizado: true };
                        }
                        const agora = new Date();
                        tx.set(ref, { codigoCnpj: cnpjReal, nome, cidade, uf, enderecoCompleto,
                            ...coords, status: 'Ativo', criadoEm: agora, atualizadoEm: agora });
                        return { nome, localizado: false };
                    });
                    nomeFinal = resultado.nome; localizado = resultado.localizado;
                }
            } else {
                // Sem CNPJ: ID aleatório e cadastro provisório, sem tentativa de detectar duplicidade.
                const coords = await localizarLoja(sessao);
                exigirSessao(sessao);
                localizacaoSalva = coords;

                const agora = new Date();
                const clienteProvisorioId = gerarIdClienteProvisorio(agora, nomeUsuarioLogado);
                const ref = doc(db, 'clientes', clienteProvisorioId);
                await runTransaction(db, async tx => {
                    tx.set(ref, { nome, cidade, uf, enderecoCompleto,
                        ...coords, status: 'Provisorio',
                        criadoEm: agora, atualizadoEm: agora, criadoPor: sessao.id });
                });
                clienteId = ref.id;
            }

            if (!sessaoValida(sessao)) return;

            const clienteAtual = await obterCliente(clienteId, { refresh: true });
            if (clienteAtual) clientesRepository.set(clienteId, clienteAtual);
            const itemCliente = { ...(clienteAtual || { nome: nomeFinal, cidade, uf, enderecoCompleto, codigoCnpj: cnpjReal }), id: clienteId };
            const indiceCliente = listaClientes.findIndex(c => c.id === clienteId);
            if (indiceCliente < 0) listaClientes.push(itemCliente); else listaClientes[indiceCliente] = itemCliente;
            selecionarClienteAgendamento(itemCliente);

            limparCadastroCliente(); voltarNavegacao('tela-nova-visita');

            if (!localizado && localizacaoSalva?.statusLocalizacao === 'incerto') {
                window.mostrarAlerta('Loja salva', 'Endereço cadastrado com localização incerta. O check-in será permitido até 50 km do centro da cidade. As coordenadas da loja poderão ser corrigidas no painel admin.');
                return;
            }
            window.mostrarAlerta('Sucesso', cnpjReal
                ? (localizado ? 'Cliente existente selecionado.' : 'Loja salva com CNPJ e coordenadas do endereço informado.')
                : 'Loja provisória salva. Ela poderá ser revisada posteriormente.');

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

            if (index === 0) navegarParaTela('tela-inicio');

            else if (index === 1) navegarParaTela('tela-agenda');

            else if (index === 2) navegarParaTela('tela-historico');

            else if (index === 3) navegarParaTela('tela-perfil'); 

        });

    });

    const btnNovaVisita = document.getElementById('btn-nova-visita');

    if (btnNovaVisita) {

        btnNovaVisita.addEventListener('click', () => {

            if (operacaoEmCurso) return;

            navegarParaTela('tela-nova-visita');
            window.scrollTo(0, 0);

        });

    }

    const btnCancelarVisita = document.getElementById('btn-cancelar-visita');

    if (btnCancelarVisita) {

        btnCancelarVisita.addEventListener('click', () => voltarNavegacao('tela-agenda'));

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
    abrirCamadaHistorica('checkin');

}

function configurarBotoesModal() {
    document.getElementById('btn-fechar-alerta')?.addEventListener('click', () => window.fecharAlerta());
    document.getElementById('btn-fechar-aviso-andamento')?.addEventListener('click', () => { document.getElementById('modal-aviso-andamento').style.display = 'none'; });
    document.getElementById('btn-cancelar-exclusao')?.addEventListener('click', () => window.fecharConfirmacaoExclusao());
    document.getElementById('btn-confirmar-exclusao')?.addEventListener('click', () => window.confirmarExclusao());

    document.getElementById('btn-voltar')?.addEventListener('click', () => {
        if (operacaoEmCurso) return;
        if (estadoNavegacaoAtual?.overlay === 'checkin') history.back();
        else document.getElementById('tela-confirmacao').style.display = 'none';
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

async function centroParaCliente(cliente) {
    if (!cliente || referenciaLocalizacao(cliente)) return null;
    if (cliente.statusLocalizacao !== 'incerto' && cliente.precisaoCoordenadas !== 'rua') return null;
    try { return await buscarCentroCidade(cliente.cidade, cliente.uf); }
    catch (error) { console.warn('Não foi possível consultar o centro da cidade.', error); return null; }
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

    const clienteLocalizacao = await obterCliente(clienteId, { refresh: true });
    const centroConsultado = await centroParaCliente(clienteLocalizacao);
    exigirSessao(sessao);

    await runTransaction(db, async tx => {

        const ref = doc(db,'atividades',id), snap = await tx.get(ref);

        const cliente = await tx.get(doc(db,'clientes',clienteId));

        if (!snap.exists() || !cliente.exists()) throw new Error('Visita ou cliente não encontrado.');

        const atividade = snap.data(), dados = cliente.data(); validarResponsavel(atividade,sessao);

        if (atividade.clienteId !== clienteId) throw new Error('O cliente da visita foi alterado. Atualize a tela.');

        if (atividade.status !== 'Pendente') throw new Error('Esta visita já foi iniciada ou encerrada. Atualize a tela.');

        const referencia = referenciaLocalizacao(dados, centroConsultado);
        if (!referencia) throw new Error('Não foi possível localizar o centro da cidade. Tente novamente ou solicite a correção das coordenadas no painel admin.');
        const distancia = calcularDistancia(Number(lat), Number(lng), referencia.lat, referencia.lng);
        if (!Number.isFinite(distancia) || distancia > referencia.raio) throw new Error(referencia.incerto
            ? `Você está a ${(distancia / 1000).toFixed(1)} km do centro de ${dados.cidade}. O limite para localização incerta é 50 km.`
            : `Você está a ${Math.round(distancia)} m da loja. A distância máxima é 500 m.`);

        const agora = new Date();

        if (referencia.incerto && centroConsultado) tx.update(doc(db,'clientes',clienteId), { centroCidade: centroConsultado });
        tx.update(ref, { status:'Em andamento', checkinDataHora:agora, checkinGps:`${lat}, ${lng}`, checkinGpsAccuracy:Number(accuracy), checkinEndereco:endereco, atualizadoEm:agora });

    });

    if (!sessaoValida(sessao)) return;

    document.getElementById('tela-confirmacao').style.display = 'none';

    if (estadoNavegacaoAtual?.overlay === 'checkin') history.back();
    else {
        mostrarApenasTela('tela-inicio');
        await carregarAtividadesPendentes();
    }

}

async function encerrarVisita(id, btn) {
    if (operacaoEmCurso) return;
    operacaoEmCurso = true;
    btn.disabled = true;
    btn.textContent = 'Obtendo GPS de saída...';

    try {
        const sessao = sessaoAtual();
        let pos;
        try { pos = await obterPosicao(); }
        catch (erro) { throw new ErroCheckoutLocalizacao(erro.message); }
        exigirSessao(sessao);

        let accuracy;
        try { accuracy = validarPrecisaoGps(pos); }
        catch (erro) { throw new ErroCheckoutLocalizacao(erro.message); }

        const lat = pos.coords.latitude, lng = pos.coords.longitude;
        if (!coordenadasValidas(lat, lng)) throw new ErroCheckoutLocalizacao('O GPS retornou coordenadas inválidas.');

        const ref = doc(db, 'atividades', id);
        const snap = await getDoc(ref);
        if (!snap.exists()) throw new Error('Visita não encontrada.');
        const atividade = { ...snap.data(), id };
        validarResponsavel(atividade, sessao);
        if (atividade.status !== 'Em andamento') throw new Error('A visita não está mais em andamento.');
        if (!atividade.relatorioId) throw new Error('Salve o relatório antes de iniciar o check-out.');

        const cliente = atividade.clienteId ? await obterCliente(atividade.clienteId) : null;
        const centroConsultado = await centroParaCliente(cliente);
        exigirSessao(sessao);
        const referencia = referenciaLocalizacao(cliente, centroConsultado);
        if (!referencia) throw new ErroCheckoutLocalizacao('Não foi possível localizar o centro da cidade. Tente novamente ou solicite a correção das coordenadas no painel admin.');
        const distancia = calcularDistancia(Number(lat), Number(lng), referencia.lat, referencia.lng);
        if (!Number.isFinite(distancia) || distancia > referencia.raio) throw new ErroCheckoutLocalizacao(referencia.incerto
            ? `Você está a ${(distancia / 1000).toFixed(1)} km do centro de ${cliente.cidade}. O limite para localização incerta é 50 km.`
            : `Você está a ${Math.round(distancia)} m da loja. A distância máxima para o check-out é 500 m.`);

        const endereco = await obterEnderecoPorCoords(lat, lng);
        exigirSessao(sessao);
        const relatorio = await carregarRelatorioDaAtividade(atividade);
        const tipo = normalizarTipoVisita(atividade);
        if (!relatorio || relatorio.atividadeId !== id || relatorio.ptvId !== sessao.id || (tipo !== ASSISTENCIA_TECNICA_TIPO && !relatorioValidoParaCheckout(relatorio, tipo))) {
            throw new Error('O relatório não está válido. Abra e salve o relatório antes de iniciar o check-out.');
        }
        const saida = { dataHora: new Date(), lat, lng, accuracy, endereco };
        objetoAtividadeGlobal = atividade;
        objetoRelatorioGlobal = relatorio;
        if (tipo === 'Visita comercial' && relatorio.dadosComerciais?.versao === 1) {
            commercialReport.hydrate(id, relatorio, true);
            abrirPrototipoComercial('overview', false, false);
            commercialReport.deactivate();
        }
        if (tipo === 'Treinamento') {
            trainingReport.hydrate(id, relatorio, true);
            abrirPrototipoComercial('overview', false, false);
            trainingReport.deactivate();
        }
        preencherCheckout(atividade, relatorio, saida);
    } catch (erro) {
        if (erro instanceof ErroCheckoutLocalizacao) abrirModalFechamentoManual(id, erro.message);
        else informarErro('Erro no check-out', erro);
    } finally {
        operacaoEmCurso = false;
        btn.disabled = false;
        btn.textContent = 'Encerrar visita';
    }
}
function atualizarInterfaceVisitaAtual() {
    if (!objetoAtividadeGlobal) return;

    const objData = formatarDataHoraPT(objetoAtividadeGlobal.checkinDataHora);
    const areaVisitas = document.getElementById('area-visitas');
    const tipoAtual = normalizarTipoVisita(objetoAtividadeGlobal);
    const relatorioInterface = tipoAtual === 'Treinamento' ? trainingReport?.savedReport(atividadeSelecionadaId) || objetoRelatorioGlobal : tipoAtual === 'Visita comercial' ? commercialReport?.savedReport(atividadeSelecionadaId) || objetoRelatorioGlobal : objetoRelatorioGlobal;
    const temRelatorio = !!(tipoAtual === 'Treinamento' && trainingReport?.hasSaved(atividadeSelecionadaId)) || !!(tipoAtual === 'Visita comercial' && commercialReport?.hasSaved(atividadeSelecionadaId)) || (tipoAtual === ASSISTENCIA_TECNICA_TIPO ? Boolean(relatorioInterface) : relatorioValidoParaCheckout(relatorioInterface, tipoAtual));

    const etapas = [{
        titulo: 'Check-in',
        hora: objData.hora,
        descricao: escaparHtml(nomeUsuarioLogado || 'Técnico') + ' chegou a ' + escaparHtml(clienteSelecionadoNome) + ' às ' + objData.hora + '.'
    }];

    if (temRelatorio) {
        const revisoesFonte = tipoAtual === ASSISTENCIA_TECNICA_TIPO
            ? relatorioInterface.revisoes
            : relatorioInterface.historico;
        const revisoes = Array.isArray(revisoesFonte) && revisoesFonte.length
            ? revisoesFonte
            : [{ salvoEm: relatorioInterface.atualizadoEm }];

        revisoes.forEach((registro, index) => {
            const horaReg = formatarDataHoraPT(registro.salvoEm).hora;
            etapas.push({
                titulo: index === 0 ? 'Relatório adicionado' : 'Relatório atualizado',
                hora: horaReg,
                descricao: escaparHtml(nomeUsuarioLogado || 'Técnico') + ' ' +
                    (tipoAtual === ASSISTENCIA_TECNICA_TIPO
                        ? (index === 0 ? 'preencheu o relatório técnico.' : 'atualizou o relatório técnico.')
                        : (index === 0 ? 'escreveu um relatório.' : 'atualizou o relatório.')),
                relatorioAtual: index === revisoes.length - 1
            });
        });
    }

    const currentIndex = etapas.length - 1;

    let htmlTimeline = '';
    htmlTimeline += '<div class="card-visita-atual" style="margin-top: 10px;">';
    htmlTimeline += '<h2 class="va-titulo">' + escaparHtml(clienteSelecionadoNome) + '</h2>';
    htmlTimeline += '<div class="va-status">EM ANDAMENTO</div>';
    htmlTimeline += '<hr class="va-divider" style="margin: 15px 0;">';
    htmlTimeline += '<div class="timeline-container">';

    etapas.forEach((etapa, index) => {
        const isComplete = index <= currentIndex;
        const isLinkComplete = index < currentIndex;
        const classes = 'timeline-step' + (isComplete ? ' timeline-step-complete' : '') + (isLinkComplete ? ' timeline-link-complete' : '');

        htmlTimeline += '<div class="' + classes + '">';
        htmlTimeline += '<div class="timeline-marker"><span class="timeline-dot"></span></div>';
        htmlTimeline += '<div class="timeline-content">';
        htmlTimeline += '<div class="timeline-header"><strong>' + etapa.titulo + '</strong><span>' + etapa.hora + '</span></div>';
        htmlTimeline += '<p class="timeline-desc"' + (etapa.relatorioAtual ? ' style="margin-bottom: 12px;"' : '') + '>' + etapa.descricao + '</p>';
        if (etapa.relatorioAtual) htmlTimeline += '<button class="btn-outline-red" id="btn-ver-relatorio-inicio">Ver ou editar relatório</button>';
        htmlTimeline += '</div></div>';
    });

    const htmlBotoes = temRelatorio
        ? '<button class="btn-checkin" id="btn-encerrar-visita-inicio" style="margin-top: 15px;">Encerrar visita</button>'
        : '<button class="btn-checkin" id="btn-escrever-relatorio-inicio" style="margin-top: 15px;">Escrever relatório</button>';

    htmlTimeline += '</div>' + htmlBotoes + '<button type="button" class="btn-outline-red" id="btn-cancelar-atividade-inicio" style="margin-top: 10px;">Cancelar atividade</button></div>';
    areaVisitas.innerHTML = htmlTimeline;
    document.getElementById('btn-cancelar-atividade-inicio')?.addEventListener('click', () => abrirCancelamentoAtividade(objetoAtividadeGlobal));

    const btnEscrever = document.getElementById('btn-escrever-relatorio-inicio');
    const btnVerEditar = document.getElementById('btn-ver-relatorio-inicio');
    const btnEncerrar = document.getElementById('btn-encerrar-visita-inicio');

    const acaoAbrirRelatorio = async () => {
        if (operacaoEmCurso || !atividadeSelecionadaId) return;
        commercialReport.deactivate();
        trainingReport.deactivate();

        try {
            const sessao = sessaoAtual();
            const atividadeSnap = await getDocFromServer(doc(db, 'atividades', atividadeSelecionadaId));
            exigirSessao(sessao);
            if (!atividadeSnap.exists()) throw new Error('Visita não encontrada.');

            objetoAtividadeGlobal = { ...atividadeSnap.data(), id: atividadeSnap.id };
            validarResponsavel(objetoAtividadeGlobal, sessao);

            // O estado da tela inicial pode ter sido carregado minutos antes ou em
            // outro dispositivo. Recarrega o relatório do servidor imediatamente
            // antes de editar para evitar conflito falso com uma cópia antiga.
            objetoRelatorioGlobal = objetoAtividadeGlobal.relatorioId
                ? await carregarRelatorioDaAtividade(objetoAtividadeGlobal, true)
                : null;
            exigirSessao(sessao);

            if (objetoRelatorioGlobal &&
                (objetoRelatorioGlobal.atividadeId !== atividadeSelecionadaId ||
                 objetoRelatorioGlobal.ptvId !== sessao.id)) {
                throw new Error('O relatório associado não corresponde a esta visita.');
            }

            if (objetoAtividadeGlobal.clienteId) {
                const cliente = await obterCliente(objetoAtividadeGlobal.clienteId);
                if (cliente?.nome) {
                    clienteSelecionadoId = objetoAtividadeGlobal.clienteId;
                    clienteSelecionadoNome = cliente.nome;
                }
            }

            const chegada = objetoAtividadeGlobal.checkinDataHora || objetoAtividadeGlobal.data;
            const formatoData = formatarDataHoraPT(chegada);
            const tipo = normalizarTipoVisita(objetoAtividadeGlobal);
            const nomeCliente = clienteSelecionadoNome || 'Cliente não encontrado';
            let codigoRelatorio = '';

            if (objetoRelatorioGlobal) {
                codigoRelatorio = objetoRelatorioGlobal.codigo || '#' + atividadeSelecionadaId;
                document.getElementById('rel-texto').value = objetoRelatorioGlobal.textoAtual || '';
            } else {
                const dataPura = new Date();
                codigoRelatorio = '#' + dataPura.getFullYear() + String(dataPura.getMonth() + 1).padStart(2, '0') + String(dataPura.getDate()).padStart(2, '0') + obterIniciais(nomeUsuarioLogado || 'TEC') + '-' + atividadeSelecionadaId;
                document.getElementById('rel-texto').value = '';
            }

            if (tipo === 'Visita comercial') {
                const existing = commercialReport.drafts.get(atividadeSelecionadaId);
                const unsaved = existing && JSON.stringify(existing) !== (commercialReport.saved.get(atividadeSelecionadaId) || commercialReport.initial.get(atividadeSelecionadaId));
                commercialReport.hydrate(atividadeSelecionadaId, objetoRelatorioGlobal, !unsaved);
                abrirPrototipoComercial();
                return;
            }

            if (tipo === 'Treinamento') {
                const existing = trainingReport.drafts.get(atividadeSelecionadaId);
                const unsaved = existing && JSON.stringify(existing) !== (trainingReport.saved.get(atividadeSelecionadaId) || trainingReport.initial.get(atividadeSelecionadaId));
                trainingReport.hydrate(atividadeSelecionadaId, objetoRelatorioGlobal, !unsaved);
                abrirPrototipoComercial();
                return;
            }

            mostrarEditorRelatorioPorTipo(tipo);
            if (tipo === ASSISTENCIA_TECNICA_TIPO) {
                preencherFormularioAssistencia(dadosAssistenciaDoRelatorio(objetoRelatorioGlobal));
            }
            technicalEditor.input = document.getElementById(tipo === ASSISTENCIA_TECNICA_TIPO ? 'at-constatacoes' : 'rel-texto');
            technicalEditor.reset({
                activityId: atividadeSelecionadaId,
                text: technicalEditor.input.value,
                blocks: blocosPersistidosRelatorio(objetoRelatorioGlobal)
            });

            document.getElementById('rel-titulo-cliente').textContent = (tipo === ASSISTENCIA_TECNICA_TIPO ? 'Assistência técnica - ' : 'Relatório - ') + nomeCliente;
            document.getElementById('rel-opcao-cliente').textContent = nomeCliente;
            document.getElementById('rel-data').value = formatoData.data;
            document.getElementById('rel-hora').value = formatoData.hora;
            document.getElementById('rel-codigo-gerado').textContent = codigoRelatorio;

            navegarParaTela('tela-relatorio', { carregar: false });
            document.getElementById('rel-texto')?.blur();
            window.scrollTo(0, 0);
        } catch (erro) {
            informarErro('Não foi possível abrir o relatório', erro);
        }
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

function abrirModalFechamentoManual(atividadeId, mensagem) {
    fechamentoManualPendente = { atividadeId };
    const modal = document.getElementById('modal-fechamento-manual');
    document.getElementById('fechamento-manual-mensagem').textContent = mensagem || 'A localização de saída não pôde ser validada.';
    document.getElementById('fechamento-manual-pergunta').style.display = 'block';
    document.getElementById('fechamento-manual-form').style.display = 'none';
    document.getElementById('fechamento-manual-motivo').value = '';
    document.getElementById('fechamento-manual-contador').textContent = '0';
    modal.style.display = 'flex';
}

function fecharModalFechamentoManual() {
    document.getElementById('modal-fechamento-manual')?.style?.setProperty('display', 'none');
    fechamentoManualPendente = null;
}

async function enviarFechamentoManual() {
    if (operacaoEmCurso || !fechamentoManualPendente?.atividadeId) return;
    const motivoEl = document.getElementById('fechamento-manual-motivo');
    const motivo = motivoEl.value.trim();
    if (motivo.length < 5) return window.mostrarAlerta('Atenção', 'Informe o motivo do fechamento manual.');

    const btn = document.getElementById('btn-enviar-fechamento-manual');
    const atividadeId = fechamentoManualPendente.atividadeId;
    operacaoEmCurso = true;
    btn.disabled = true;
    btn.textContent = 'ENVIANDO...';
    try {
        const sessao = sessaoAtual();
        await runTransaction(db, async tx => {
            const atvRef = doc(db, 'atividades', atividadeId);
            const atvSnap = await tx.get(atvRef);
            if (!atvSnap.exists()) throw new Error('Visita não encontrada.');
            const atividade = atvSnap.data();
            validarResponsavel(atividade, sessao);
            if (atividade.status !== 'Em andamento') throw new Error('A visita não está mais em andamento.');
            if (!atividade.relatorioId) throw new Error('O relatório precisa estar salvo antes do fechamento manual.');

            const relRef = referenciaRelatorio(atividade);
            const relSnap = await tx.get(relRef);
            if (!relSnap.exists()) throw new Error('Relatório não encontrado.');
            const relatorio = relSnap.data();
            if (relatorio.atividadeId !== atividadeId || relatorio.ptvId !== sessao.id || !relatorioValidoParaCheckout(relatorio, normalizarTipoVisita(atividade))) throw new Error('O relatório não está válido.');

            const pendentes = modulosComerciaisPendentes(relatorio);
            if (pendentes.length) throw new Error('Conclua os módulos obrigatórios antes do fechamento: ' + pendentes.join(', ') + '.');

            const agora = new Date();
            const manual = {
                resultado: 'Pendente de análise',
                fechamentoTipo: 'Manual',
                fechamentoAnaliseStatus: 'Pendente de análise',
                motivoFechamentoManual: motivo,
                fechamentoSolicitadoEm: agora,
                fechamentoSolicitadoPor: sessao.id,
                checkoutDataHora: agora,
                atualizadoEm: agora
            };
            tx.update(atvRef, { ...manual, status: 'Concluída' });
            tx.update(relRef, { ...manual });
        });

        if (!sessaoValida(sessao)) return;
        const confirmacao = await getDoc(doc(db, 'atividades', atividadeId));
        if (!confirmacao.exists() || confirmacao.data().status !== 'Concluída') throw new Error('O fechamento não foi confirmado no banco. Tente novamente.');
        fecharModalFechamentoManual();
        limparEstadoVisita();
        navegarParaTela('tela-historico', { substituir: true, carregar: false });
        await carregarHistoricoVisitas();
        window.mostrarAlerta('Sucesso', 'Fechamento manual enviado para análise do gestor.');
    } catch (erro) {
        informarErro('Não foi possível solicitar o fechamento manual', erro);
    } finally {
        operacaoEmCurso = false;
        btn.disabled = false;
        btn.textContent = 'ENVIAR';
    }
}
async function salvarRelatorioComercial(atividadeId, data, base, tipo = 'Visita comercial') {
    const dataField = tipo === 'Treinamento' ? 'dadosTreinamento' : 'dadosComerciais';
    if (operacaoEmCurso) throw new Error('Aguarde a operação atual antes de salvar.');
    const sessao = sessaoAtual();
    if (!atividadeId || atividadeId !== atividadeSelecionadaId) throw new Error('Reabra a visita antes de salvar.');
    if (data.text.length > 30000) throw new Error('O relatório deve ter até 30.000 caracteres.');
    if (data.photos.length > 6 || (data.blocks || []).filter(block => block.kind === 'media').length > 20) throw new Error('O limite de imagens foi excedido.');
    const novoId = gerarIdRelatorio(new Date(), nomeUsuarioLogado);
    operacaoEmCurso = true;
    try {
        const saved = await persistCommercialMedia({activityId:atividadeId, data, base:base?.[dataField] || {blocks:base?.conteudoRelatorio?.blocos || []}, media:mediaStore,
            validateSession:() => exigirSessao(sessao),
            commit:prepared => runTransaction(db, async tx => {
                exigirSessao(sessao);
                const atvRef = doc(db, 'atividades', atividadeId);
                const atvSnap = await tx.get(atvRef);
                if (!atvSnap.exists()) throw new Error('Visita não encontrada.');
                const atividade = atvSnap.data();
                validarResponsavel(atividade, sessao);
                if (atividade.status !== 'Em andamento' || normalizarTipoVisita(atividade) !== tipo) throw new Error('A visita foi alterada ou encerrada. Reabra o relatório.');
                const colecao = atividade.relatorioId ? colecaoRelatorioDaAtividade(atividade) : colecaoRelatorioPorTipo(tipo);
                const relRef = doc(db, colecao, atividade.relatorioId || novoId);
                const relSnap = await tx.get(relRef);
                const anterior = relSnap.exists() ? relSnap.data() : null;
                if (anterior && (anterior.atividadeId !== atividadeId || anterior.ptvId !== sessao.id)) throw new Error('O relatório não corresponde a esta visita.');
                const compare = report => serializarEstavel({dados:report?.[dataField] || null, texto:report?.textoAtual ?? null, conteudo:report?.conteudoRelatorio || null});
                if (compare(anterior) !== compare(base)) throw new Error('O relatório foi alterado em outra sessão. Volte ao início e reabra o relatório antes de salvar.');
                const agora = new Date();
                const historico = [...(anterior?.historico || []), {texto:prepared.text, salvoEm:agora}];
                const resultado = {...anterior, id:relRef.id, atividadeId, clienteId:atividade.clienteId, ptvId:sessao.id, tipoVisita:tipo,
                    codigo:anterior?.codigo || '#' + atividadeId, criadoEm:anterior?.criadoEm || agora, atualizadoEm:agora,
                    textoAtual:prepared.text, historico, [dataField]:{versao:1,...prepared}, conteudoRelatorio:{versao:1,blocos:prepared.blocks || []}};
                if (new TextEncoder().encode(JSON.stringify(resultado)).length > 800000) throw new Error('O relatório está muito grande. Solicite o arquivamento do histórico.');
                tx.set(relRef, resultado);
                tx.update(atvRef, {relatorioId:relRef.id, relatorioColecao:colecao, atualizadoEm:agora});
                return {...resultado, colecao};
            })
        });
        exigirSessao(sessao);
        objetoRelatorioGlobal = saved.result;
        objetoAtividadeGlobal.relatorioId = saved.result.id;
        objetoAtividadeGlobal.relatorioColecao = saved.result.colecao;
        if (saved.cleanupFailed) window.mostrarAlerta('Relatório salvo', 'Alguns arquivos removidos não puderam ser excluídos. Os dados foram salvos.');
        return saved.result;
    } finally {
        operacaoEmCurso = false;
    }
}

function configurarEventosGlobais() {
    document.getElementById('home-agenda-more').addEventListener('click', () => {
        if (operacaoEmCurso) return;
        const primeira = proximasVisitas(homeCalendar.atividades)[0];
        if (primeira) {
            const data = new Date(tempoData(primeira.data));
            agendaCalendar.mes = new Date(data.getFullYear(), data.getMonth(), 1, 12);
        }
        agendaCalendar.selecionado = null;
        agendaCalendar.render();
        navegarParaTela('tela-agenda');
    });

    commercialReport = new CommercialReport(document.getElementById('tela-relatorio'), () => voltarNavegacao('tela-inicio'), () => {
        commercialReport.deactivate();
        navegarParaTela('tela-inicio', { substituir: true, carregar: false });
        atualizarInterfaceVisitaAtual();
    }, {
        persist: salvarRelatorioComercial,
        loadProducts: options => productRepository.list(options),
        reviewModule: page => abrirPrototipoComercial(page, true),
        returnCheckout: () => {
            if (!checkoutPendenteGlobal || checkoutPendenteGlobal.atividadeId !== commercialReport.key || normalizarTipoVisita(objetoAtividadeGlobal || {}) !== 'Visita comercial') return;
            commercialReport.deactivate();
            navegarParaTela('tela-checkout', { substituir: true, carregar: false });
        }
    });
    trainingReport = new TrainingReport(document.getElementById('tela-relatorio'), () => voltarNavegacao('tela-inicio'), () => {
        trainingReport.deactivate();
        navegarParaTela('tela-inicio', { substituir: true, carregar: false });
        atualizarInterfaceVisitaAtual();
    }, {
        persist: (id, data, base) => salvarRelatorioComercial(id, data, base, 'Treinamento'),
        loadProducts: options => productRepository.list(options),
        reviewModule: page => abrirPrototipoComercial(page, true),
        returnCheckout: () => {
            if (!checkoutPendenteGlobal || checkoutPendenteGlobal.atividadeId !== trainingReport.key || normalizarTipoVisita(objetoAtividadeGlobal || {}) !== 'Treinamento') return;
            trainingReport.deactivate();
            navegarParaTela('tela-checkout', { substituir: true, carregar: false });
        }
    });
    document.getElementById('btn-fechar-visualizador')?.addEventListener('click', () => voltarNavegacao('tela-historico'));

    document.addEventListener('click', (event) => {
        const botao = event.target.closest('#btn-exportar-visualizador');
        if (!botao) return;

        if (!objetoAtividadeGlobal) {
            window.mostrarAlerta('Exportar PDF', 'Não foi possível carregar os dados desta visita. Feche e abra a visita novamente.');
            return;
        }

        prepararImpressaoVisualizador(
            objetoAtividadeGlobal,
            clienteVisualizadorAtual,
            objetoRelatorioGlobal,
            nomeUsuarioLogado
        );

        setTimeout(() => window.print(), 50);
    });

    document.getElementById('btn-fechamento-manual-nao')?.addEventListener('click', fecharModalFechamentoManual);
    document.getElementById('btn-fechamento-manual-sim')?.addEventListener('click', () => {
        document.getElementById('fechamento-manual-pergunta').style.display = 'none';
        document.getElementById('fechamento-manual-form').style.display = 'block';
        document.getElementById('fechamento-manual-motivo')?.focus();
    });
    document.getElementById('btn-fechamento-manual-cancelar')?.addEventListener('click', () => {
        document.getElementById('fechamento-manual-pergunta').style.display = 'block';
        document.getElementById('fechamento-manual-form').style.display = 'none';
    });
    document.getElementById('fechamento-manual-motivo')?.addEventListener('input', event => {
        document.getElementById('fechamento-manual-contador').textContent = String(event.target.value.length);
    });
    document.getElementById('btn-enviar-fechamento-manual')?.addEventListener('click', enviarFechamentoManual);

    document.getElementById('btn-voltar-checkout')?.addEventListener('click', fecharCheckout);

    document.getElementById('btn-concluir-checkout')?.addEventListener('click', async () => {
        if (operacaoEmCurso || !checkoutPendenteGlobal?.atividadeId) return;
        const btn = document.getElementById('btn-concluir-checkout');
        const atividadeId = checkoutPendenteGlobal.atividadeId;
        const tipo = normalizarTipoVisita(objetoAtividadeGlobal || {});

        const modular = tipo === 'Visita comercial' && objetoRelatorioGlobal?.dadosComerciais?.versao === 1;
        const objetivo = modular ? objetoRelatorioGlobal.dadosComerciais.goal : document.getElementById('checkout-objetivo').value.trim();
        const oportunidade = document.querySelector('input[name="checkoutOportunidade"]:checked')?.value || '';

        const atAcoes = document.getElementById('checkout-at-acoes').value.trim();
        const atConclusao = document.getElementById('checkout-at-conclusao').value.trim();
        const atResultado = document.querySelector('input[name="checkoutAtResultado"]:checked')?.value || '';
        const atProximoPasso = document.getElementById('checkout-at-proximo-passo').value.trim();

        if (tipo === 'Treinamento') {
            const pendentes = modulosTreinamentoPendentes(objetoRelatorioGlobal);
            if (pendentes.length) return window.mostrarAlerta('Módulos pendentes', 'Conclua os módulos antes de finalizar: ' + pendentes.join(', ') + '. Volte ao relatório para continuar o preenchimento.');
        } else if (tipo === ASSISTENCIA_TECNICA_TIPO) {
            const pendentes = camposAssistenciaPendentes(objetoRelatorioGlobal);
            if (pendentes.length) return window.mostrarAlerta('Relatório incompleto', 'Preencha antes de concluir o check-out: ' + pendentes.join(', ') + '. Volte ao relatório para continuar.');
            if (!atAcoes) return window.mostrarAlerta('Atenção', 'Informe as ações definidas.');
            if (!atConclusao) return window.mostrarAlerta('Atenção', 'Informe a conclusão técnica.');
            if (!atResultado) return window.mostrarAlerta('Atenção', 'Selecione o resultado da assistência.');
        } else if (modular) {
            const pendentes = modulosComerciaisPendentes(objetoRelatorioGlobal);
            if (pendentes.length) return window.mostrarAlerta('Módulos pendentes', 'Conclua os módulos obrigatórios antes de finalizar o check-out: ' + pendentes.join(', ') + '. Volte ao relatório para continuar o preenchimento.');
        } else {
            if (!objetivo) return window.mostrarAlerta('Atenção', 'Selecione o objetivo da visita comercial.');
            if (!oportunidade) return window.mostrarAlerta('Atenção', 'Informe se houve oportunidade identificada.');
        }

        operacaoEmCurso = true;
        btn.disabled = true;
        btn.textContent = 'Concluindo...';

        try {
            const sessao = sessaoAtual();
            const saida = checkoutPendenteGlobal.posicao;
            if (!saida || !coordenadasValidas(saida.lat, saida.lng)) throw new Error('A localização de saída não está mais disponível.');

            await runTransaction(db, async tx => {
                const atvRef = doc(db, 'atividades', atividadeId);
                const atvSnap = await tx.get(atvRef);
                if (!atvSnap.exists()) throw new Error('Visita não encontrada.');

                const atividade = atvSnap.data();
                validarResponsavel(atividade, sessao);
                if (atividade.status !== 'Em andamento') throw new Error('A visita não está mais em andamento.');
                if (normalizarTipoVisita(atividade) !== tipo) throw new Error('A visita foi alterada. Volte e abra o check-out novamente.');
                if (!atividade.relatorioId) throw new Error('O relatório não está vinculado à visita.');

                const relRef = referenciaRelatorio(atividade);
                const relSnap = await tx.get(relRef);
                if (!relSnap.exists()) throw new Error('Relatório não encontrado.');

                const relatorioAtual = relSnap.data();
                if (relatorioAtual.atividadeId !== atividadeId || relatorioAtual.ptvId !== sessao.id || !relatorioValidoParaCheckout(relatorioAtual, tipo)) {
                    throw new Error('O relatório não está válido.');
                }

                if (tipo === 'Visita comercial' && (relatorioAtual.dadosComerciais?.versao === 1) !== modular) throw new Error('O relatório foi alterado. Reabra o check-out.');
                const pendentes = modulosComerciaisPendentes(relatorioAtual);
                if (pendentes.length) throw new Error('Conclua os módulos obrigatórios: ' + pendentes.join(', ') + '.');
                if (tipo === 'Treinamento') {
                    const pendentesTreinamento = modulosTreinamentoPendentes(relatorioAtual);
                    if (pendentesTreinamento.length) throw new Error('Conclua os módulos: ' + pendentesTreinamento.join(', ') + '.');
                    if (serializarEstavel(relatorioAtual.dadosTreinamento) !== serializarEstavel(objetoRelatorioGlobal.dadosTreinamento)) throw new Error('O relatório foi alterado em outra sessão. Reabra o check-out.');
                }
                if (modular && serializarEstavel(relatorioAtual.dadosComerciais) !== serializarEstavel(objetoRelatorioGlobal.dadosComerciais)) throw new Error('O relatório foi alterado em outra sessão. Reabra o check-out.');

                const agora = new Date();
                const dadosCheckout = {
                    tipoVisita: tipo,
                    checkoutDataHora: agora,
                    checkoutGps: String(saida.lat) + ', ' + String(saida.lng),
                    checkoutGpsAccuracy: Number(saida.accuracy),
                    checkoutEndereco: saida.endereco
                };

                let atualizacaoRelatorio = { ...dadosCheckout, atualizadoEm: agora };

                if (tipo === 'Treinamento') {
                    const dados = relatorioAtual.dadosTreinamento;
                    dadosCheckout.objetivo = dados.goal;
                    dadosCheckout.quantidadeParticipantes = Number(dados.present);
                    dadosCheckout.publicoAtendido = dados.participants.join(', ');
                    atualizacaoRelatorio = { ...dadosCheckout, atualizadoEm: agora };
                } else if (tipo === ASSISTENCIA_TECNICA_TIPO) {
                    const dadosAssistencia = {
                        ...dadosAssistenciaDoRelatorio(relatorioAtual),
                        acoesDefinidas: atAcoes,
                        conclusaoTecnica: atConclusao,
                        resultado: atResultado,
                        proximoPasso: atProximoPasso
                    };
                    const secoes = secoesAssistenciaParaDocumento(dadosAssistencia);
                    const revisoes = Array.isArray(relatorioAtual.revisoes) ? [...relatorioAtual.revisoes] : [];
                    revisoes.push({
                        fechamento: secoes.fechamento,
                        etapa: 'checkout',
                        salvoEm: agora
                    });

                    dadosCheckout.resultado = atResultado;
                    dadosCheckout.resultadoAssistencia = atResultado;
                    dadosCheckout.acoesDefinidas = atAcoes;
                    dadosCheckout.conclusaoTecnica = atConclusao;
                    dadosCheckout.proximoPasso = atProximoPasso;
                    dadosCheckout.proximoPassoAssistencia = atProximoPasso;
                    atualizacaoRelatorio = {
                        ...dadosCheckout,
                        fechamento: secoes.fechamento,
                        revisoes,
                        atualizadoEm: agora
                    };
                } else if (modular) {
                    const draft = commercialReport.drafts.get(atividadeId);
                    dadosCheckout.objetivo = relatorioAtual.dadosComerciais.goal;
                    dadosCheckout.feedback = draft?.feedback || [];
                    dadosCheckout.pendencia = draft?.pending || '';
                    atualizacaoRelatorio = {...dadosCheckout, atualizadoEm:agora, dadosComerciais:{...relatorioAtual.dadosComerciais, feedback:dadosCheckout.feedback, pending:dadosCheckout.pendencia}};
                } else {
                    dadosCheckout.objetivo = objetivo;
                    dadosCheckout.oportunidadeIdentificada = oportunidade;
                    atualizacaoRelatorio = { ...dadosCheckout, atualizadoEm: agora };
                }

                tx.update(atvRef, { ...dadosCheckout, status: 'Concluída', atualizadoEm: agora });
                tx.update(relRef, atualizacaoRelatorio);
            });

            if (!sessaoValida(sessao)) return;

            const confirmacao = await getDoc(doc(db, 'atividades', atividadeId));
            if (!confirmacao.exists() || confirmacao.data().status !== 'Concluída') {
                throw new Error('A visita não foi confirmada como concluída no banco. Tente novamente.');
            }

            limparEstadoVisita();
            navegarParaTela('tela-historico', { substituir: true, carregar: false });
            await carregarHistoricoVisitas();
            window.mostrarAlerta('Sucesso', tipo === ASSISTENCIA_TECNICA_TIPO ? 'Assistência técnica concluída.' : 'Visita concluída.');
        } catch (erro) {
            informarErro('Erro ao concluir visita', erro);
        } finally {
            operacaoEmCurso = false;
            btn.disabled = false;
            btn.textContent = 'Concluir';
        }
    });

    document.querySelectorAll('input[name="atEspecificacao"]').forEach(input => input.addEventListener('change', () => {
        document.getElementById('at-especificacao-numero-wrap').style.display = radioAssistencia('atEspecificacao') === 'Sim' ? 'block' : 'none';
    }));
    document.querySelectorAll('input[name="atImpactoClimatico"]').forEach(input => input.addEventListener('change', () => {
        document.getElementById('at-impacto-detalhe-wrap').style.display = radioAssistencia('atImpactoClimatico') === 'Sim' ? 'block' : 'none';
    }));

    ['checkout-at-acoes','checkout-at-conclusao','checkout-at-proximo-passo'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', atualizarPreviewCheckoutAssistencia);
    });
    document.querySelectorAll('input[name="checkoutAtResultado"]').forEach(input => {
        input.addEventListener('change', atualizarPreviewCheckoutAssistencia);
    });

    initializeMediaPreviews();
    technicalEditor = new TechnicalReportEditor(
        document.getElementById('at-relatorio-editor'),
        document.getElementById('at-constatacoes'),
        document.getElementById('btn-adicionar-midia'),
        document.getElementById('at-media-picker'),
        document.getElementById('at-media-status'),
        document.getElementById('at-camera-picker')
    );

    document.getElementById('btn-voltar-relatorio')?.addEventListener('click', () => voltarNavegacao('tela-inicio'));

    document.getElementById('btn-salvar-relatorio')?.addEventListener('click', async () => {
        if (normalizarTipoVisita(objetoAtividadeGlobal || {}) === 'Visita comercial') return;
        if (operacaoEmCurso) return;
        const btn = document.getElementById('btn-salvar-relatorio');
        let mediaSave = null;
        let firestoreSaved = false;

        try {
            const sessao = sessaoAtual(), atividadeId = atividadeSelecionadaId;
            if (!atividadeId || !objetoAtividadeGlobal) throw new Error('Abra uma visita em andamento antes de preencher o relatório.');

            const tipo = normalizarTipoVisita(objetoAtividadeGlobal);
            const ehAssistencia = tipo === ASSISTENCIA_TECNICA_TIPO;
            let assistenciaTecnica = null;
            let texto = '';

            if (technicalEditor.busy) throw new Error('Aguarde a adição dos arquivos antes de salvar.');
            if (ehAssistencia) {
                if (document.getElementById('at-constatacoes').value.length > 30000) throw new Error('O relatório deve ter até 30.000 caracteres.');
                assistenciaTecnica = lerFormularioAssistencia(objetoRelatorioGlobal);
            } else {
                texto = document.getElementById('rel-texto').value.trim();
                if (!texto) {
                    window.mostrarAlerta('Atenção', 'Há informações obrigatórias não preenchidas.');
                    return;
                }
                if (texto.length > 30000) throw new Error('O relatório deve ter até 30.000 caracteres.');
            }

            const codigo = document.getElementById('rel-codigo-gerado').textContent;
            const textoBase = objetoRelatorioGlobal?.textoAtual ?? null;
            const estruturaBase = ehAssistencia
                ? normalizarAssistenciaComparacao(dadosAssistenciaDoRelatorio(objetoRelatorioGlobal))
                : null;
            const novoIdRelatorio = gerarIdRelatorio(new Date(), nomeUsuarioLogado);

            operacaoEmCurso = true;
            btn.disabled = true;
            btn.textContent = 'Salvando...';
            technicalEditor.setLocked(true);

            mediaSave = await technicalEditor.prepareSave();
            const conteudoRelatorio = {
                versao: 1,
                blocos: mediaSave.blocks
            };
            const conteudoBase = objetoRelatorioGlobal?.conteudoRelatorio || null;

            const salvo = await runTransaction(db, async tx => {
                const atvRef = doc(db,'atividades',atividadeId);
                const snap = await tx.get(atvRef);
                if (!snap.exists()) throw new Error('Visita não encontrada.');

                const atv = snap.data();
                validarResponsavel(atv,sessao);
                if (atv.status !== 'Em andamento') throw new Error('Só é possível salvar relatório de visita em andamento.');
                if (normalizarTipoVisita(atv) !== tipo) throw new Error('O tipo da visita foi alterado. Reabra o relatório.');

                const colecaoRelatorio = atv.relatorioId ? colecaoRelatorioDaAtividade(atv) : colecaoRelatorioPorTipo(tipo);
                const ref = doc(db, colecaoRelatorio, atv.relatorioId || novoIdRelatorio);
                const anterior = await tx.get(ref);
                const dados = anterior.exists() ? anterior.data() : null;

                if (dados && (dados.atividadeId !== atividadeId || dados.ptvId !== sessao.id)) {
                    throw new Error('O relatório não corresponde a esta visita.');
                }

                const conteudoBanco = dados?.conteudoRelatorio || null;
                if (
                    dados &&
                    serializarEstavel(conteudoBanco) !== serializarEstavel(conteudoBase) &&
                    serializarEstavel(conteudoBanco) !== serializarEstavel(conteudoRelatorio)
                ) {
                    throw new Error('As mídias deste relatório foram alteradas depois que você abriu esta tela. Reabra o relatório antes de salvar.');
                }

                const agora = new Date();
                const baseComum = {
                    id: ref.id,
                    atividadeId,
                    clienteId: atv.clienteId,
                    ptvId: sessao.id,
                    tipoVisita: tipo,
                    codigo: dados?.codigo || codigo || '#' + atividadeId,
                    criadoEm: dados?.criadoEm || agora,
                    atualizadoEm: agora
                };

                let resultado;

                if (ehAssistencia) {
                    const estruturaBanco = normalizarAssistenciaComparacao(dadosAssistenciaDoRelatorio(dados));
                    const estruturaNova = normalizarAssistenciaComparacao(assistenciaTecnica);

                    if (dados &&
                        JSON.stringify(estruturaBanco) !== JSON.stringify(estruturaBase) &&
                        JSON.stringify(estruturaBanco) !== JSON.stringify(estruturaNova)) {
                        throw new Error('O relatório foi alterado em outra sessão. Volte ao Início e reabra o relatório antes de salvar.');
                    }

                    const secoes = secoesAssistenciaParaDocumento(assistenciaTecnica);
                    const revisoes = Array.isArray(dados?.revisoes) ? [...dados.revisoes] : [];
                    if (!dados || JSON.stringify(estruturaBanco) !== JSON.stringify(estruturaNova)) {
                        revisoes.push({
                            clienteAplicacao: secoes.clienteAplicacao,
                            produtoQueixa: secoes.produtoQueixa,
                            preparoAplicacao: secoes.preparoAplicacao,
                            verificacao: secoes.verificacao,
                            evidencias: secoes.evidencias,
                            salvoEm: agora
                        });
                    }

                    resultado = {
                        ...dados,
                        ...baseComum,
                        ...secoes,
                        revisoes,
                        conteudoRelatorio
                    };
                    delete resultado.assistenciaTecnica;
                    delete resultado.textoAtual;
                    delete resultado.historico;
                } else {
                    if (dados && dados.textoAtual !== textoBase && dados.textoAtual !== texto) {
                        throw new Error('O relatório foi alterado em outra sessão. Volte ao Início e reabra o relatório antes de salvar.');
                    }

                    const historico = Array.isArray(dados?.historico) ? [...dados.historico] : [];
                    if (!dados || dados.textoAtual !== texto) historico.push({ texto, salvoEm: agora });

                    resultado = {
                        ...dados,
                        ...baseComum,
                        textoAtual: texto,
                        historico,
                        conteudoRelatorio
                    };
                }

                if (new TextEncoder().encode(JSON.stringify(resultado)).length > 800000) {
                    throw new Error('O histórico deste relatório está muito grande. Solicite o arquivamento das revisões antes de continuar.');
                }

                tx.set(ref, resultado);
                tx.update(atvRef, {
                    relatorioId: ref.id,
                    relatorioColecao: ref.parent.id,
                    atualizadoEm: agora
                });

                return { ...resultado, colecao: ref.parent.id };
            });

            firestoreSaved = true;
            if (!sessaoValida(sessao)) return;

            objetoRelatorioGlobal = salvo;
            objetoAtividadeGlobal.relatorioId = salvo.id;
            objetoAtividadeGlobal.relatorioColecao = salvo.colecao || colecaoRelatorioPorTipo(tipo);
            try {
                await technicalEditor.commitSave(mediaSave);
            } catch (error) {
                window.mostrarAlerta('Relatório salvo', error.message || 'O relatório foi salvo, mas houve uma falha ao limpar arquivos removidos.');
            }
            navegarParaTela('tela-inicio', { substituir: true, carregar: false });
            atualizarInterfaceVisitaAtual();
        } catch (erro) {
            if (mediaSave && !firestoreSaved) {
                try { await technicalEditor.rollbackSave(mediaSave); }
                catch (cleanupError) { console.error('Falha ao limpar upload não confirmado:', cleanupError); }
            }
            informarErro('Erro ao salvar relatório', erro);
        } finally {
            operacaoEmCurso = false;
            btn.disabled = false;
            btn.textContent = 'Salvar relatório';
            technicalEditor.setLocked(false);
        }
    });
}

const profileView = new ProfileView(document.getElementById('profile-content'), {
    loadPhoto: readProfilePhotoUrl,
    shareContact: async profile => {
        const sessionId = idUsuarioLogado;
        if (!sessionId || profile.id !== sessionId) throw new Error('Entre novamente para compartilhar o contato.');
        const collection = profile.tipo === 'Assistente' ? 'assistencia' : 'promotores';
        const snapshot = await getDoc(doc(db, collection, sessionId));
        if (sessionId !== idUsuarioLogado || !snapshot.exists()) throw new Error('Perfil indisponível.');
        return { ...profile, ...snapshot.data() };
    },
    load: async () => {
        const sessao = sessaoAtual();
        const snap = await getDocs(query(collection(db, 'atividades'), where('ptvId', '==', sessao.id)));
        if (!sessaoValida(sessao)) return [];
        const inicio = new Date(); inicio.setHours(0, 0, 0, 0); inicio.setDate(inicio.getDate() - 364);
        const visits = snap.docs.map(d => ({ ...d.data(), id: d.id })).filter(a => a.status === 'Concluída' && tempoData(a.checkoutDataHora || a.data) >= inicio.getTime());
        const ids = [...new Set(visits.map(v => v.clienteId).filter(Boolean))];
        const clients = new Map(await Promise.all(ids.map(async id => [id, await obterCliente(id)])));
        if (!sessaoValida(sessao)) return [];
        return visits.map(visit => ({ ...visit, cliente: clients.get(visit.clienteId), nomeCliente: clients.get(visit.clienteId)?.nome || 'Cliente não encontrado' }));
    },
    onError: error => informarErro('Erro ao carregar perfil', error),
    openClient: id => {
        const client = profileView.data?.find(visit => visit.clienteId === id)?.cliente;
        if (client) window.mostrarAlerta(client.nome || 'Cliente', [client.enderecoCompleto, client.cnpj ? 'CNPJ: ' + client.cnpj : ''].filter(Boolean).join('\n'));
    }
});
