import { CommercialReport } from './src/ui/commercial-report.js';
import { limitesAgendamento, validarAgendamento } from './src/domain/scheduling.js';
import { createCnpjLookup } from './src/data/cnpj-lookup.js';
import './src/ui/pwa.js';
import { escaparHtml, tempoData, lerDataHora, formatarDataHoraPT, formatarDataAgenda, formatarDataCheckout, formatarHoraCheckout, formatarDuracaoVisita, serializarEstavel } from './src/domain/formatters.js';
import { obterIniciais, gerarIdAtividade, gerarIdRelatorio, gerarIdClienteCnpj, gerarIdClienteProvisorio, cnpjValido } from './src/domain/identifiers.js';
import { normalizarTipoVisita, colecaoRelatorioPorTipo, colecaoRelatorioDaAtividade, blocosPersistidosRelatorio, dadosAssistenciaDoRelatorio, secoesAssistenciaParaDocumento, relatorioValidoParaCheckout, normalizarAssistenciaComparacao } from './src/domain/reports.js';
import { ASSISTENCIA_TECNICA_TIPO } from './src/domain/reports.js';
import { obterResultadoHistorico, obterClasseResultadoHistorico, obterDataHistorico, formatarDiaHistorico, formatarHorarioVisitaHistorico, periodoHistorico, aplicarFiltrosHistorico } from './src/domain/history.js';
import { buscarJson, coordenadasValidas, obterPosicao, obterEnderecoPorCoords, obterCoordsPorEndereco, calcularDistancia, validarPrecisaoGps } from './src/services/location.js';
import { radioAssistencia, lerFormularioAssistencia, preencherFormularioAssistencia, renderFichaAssistencia } from './src/ui/assistance.js';
import { preencherCampoVisualizador, prepararImpressaoVisualizador, renderizarVisualizadorVisita, preencherConteudoRelatorio } from './src/ui/visit-view.js';
import { createClientRepository } from './src/data/client-repository.js';
import { TechnicalReportEditor, initializeMediaPreviews, configureMediaApi } from './technical-report-editor.js';
let technicalEditor;
let commercialReport;
function abrirPrototipoComercial(page = 'overview') {
    const chegada = objetoAtividadeGlobal.checkinDataHora || objetoAtividadeGlobal.data;
    const formato = formatarDataHoraPT(chegada);
    commercialReport.open({
        id: atividadeSelecionadaId,
        client: clienteSelecionadoNome || 'Cliente não encontrado',
        code: objetoRelatorioGlobal?.codigo || '#' + atividadeSelecionadaId,
        date: formato.data, time: formato.hora,
        arrival: tempoData(chegada) || null, text: objetoRelatorioGlobal?.textoAtual || ''
    }, page);
    navegarParaTela('tela-relatorio', { carregar: false });
}
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js";

import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js";

import { getFirestore, collection, query, where, getDocs, doc, getDoc, getDocFromServer, setDoc, runTransaction, orderBy, limit } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js";

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
let filtrosHistorico = { periodo: 'todos', resultado: 'todos' };

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
    ['checkout-objetivo','checkout-categoria','checkout-participantes','checkout-publico','checkout-at-acoes','checkout-at-conclusao','checkout-at-proximo-passo'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
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
    document.getElementById('checkout-tecnico-section').style.display = tipo === 'Visita comercial' ? 'block' : 'none';
    document.getElementById('checkout-treinamento-section').style.display = tipo === 'Treinamento' ? 'block' : 'none';
    document.getElementById('checkout-assistencia-section').style.display = tipo === 'Assistência técnica' ? 'block' : 'none';
    document.getElementById('checkout-tipo-titulo').textContent = tipo;

    document.getElementById('checkout-objetivo').value = atividade.objetivo || '';
    const oportunidade = atividade.oportunidadeIdentificada;
    if (oportunidade === 'Sim' || oportunidade === 'Não') {
        const radio = document.querySelector('input[name="checkoutOportunidade"][value="' + oportunidade + '"]');
        if (radio) radio.checked = true;
    }

    document.getElementById('checkout-categoria').value = atividade.categoriaTreinamento || '';
    document.getElementById('checkout-participantes').value = atividade.quantidadeParticipantes ?? '';
    document.getElementById('checkout-publico').value = atividade.publicoAtendido || '';

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
        commercialReport?.clear();

        idUsuarioLogado = null; nomeUsuarioLogado = null; perfilUsuarioLogado = null;

        limparEstadoVisita(); listaClientes = []; listaAtividadesAgenda = []; nvClienteSelecionadoId = null;

        limparCadastroCliente();

        document.getElementById('rel-texto').value = '';

        document.getElementById('nv-cliente').value = '';

        ['area-visitas','area-agenda','area-historico-visitas','nv-cliente-dropdown'].forEach(id => document.getElementById(id).textContent = '');
        clientesAutocompleteCarregados = false;
        clientesRepository.clear();
        historicoCarregado = null;
        clienteVisualizadorAtual = null;
        technicalEditor?.reset();

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

            idUsuarioLogado = perfil.id; nomeUsuarioLogado = perfil.nome; perfilUsuarioLogado = perfil.tipo;

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

    const indice = { 'tela-inicio': 0, 'tela-agenda': 1, 'tela-historico': 2, 'tela-perfil': 3 }[idTelaAlvo];

    document.querySelectorAll('.nav-item').forEach((el, i) => el.classList.toggle('active', i === indice));

    document.body.classList.toggle('screen-form-mode', idTelaAlvo === 'tela-nova-visita' || idTelaAlvo === 'tela-detalhes-visita');

    if (idTelaAlvo === 'tela-relatorio') {

        document.getElementById('tela-relatorio').style.display = 'flex';

        document.getElementById('header-principal').style.display = 'none';

        document.querySelector('.bottom-nav').style.display = 'none';

    } else if (idTelaAlvo === 'tela-checkout') {

        document.getElementById('tela-checkout').style.display = 'block';

        document.getElementById('header-principal').style.display = 'none';

        document.querySelector('.bottom-nav').style.display = 'none';

    } else if (idTelaAlvo === 'tela-visualizador-visita') {

        document.getElementById('tela-visualizador-visita').style.display = 'block';

        document.getElementById('header-principal').style.display = 'none';

        document.querySelector('.bottom-nav').style.display = 'none';

    } else {

        document.getElementById('header-principal').style.display = 'flex';

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
        if (telaAtual === 'tela-relatorio' && commercialReport?.backModule()) {
            history.pushState(estadoNavegacaoAtual, '', urlTela('tela-relatorio'));
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

            relatorio = await carregarRelatorioDaAtividade(atividade);

            if (relatorio && (relatorio.atividadeId !== atividade.id || relatorio.ptvId !== sessao.id)) {
                throw new Error('O relatório associado não corresponde a esta visita.');
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

        const cardsAgenda = [];

        listaAtividadesAgenda.forEach((atividade, index) => {

            const fData = formatarDataAgenda(atividade.data);

            const tituloSecao = index === 0 ? "Visitas agendadas" : "";

            if (tituloSecao) cardsAgenda.push(`<h2 class="section-subtitle">${tituloSecao}</h2>`);

            const botaoGpsHTML = atividade.enderecoCompleto ? `<button class="btn-gps" data-gps-index="${index}">Abrir no GPS</button>` : '<p>Endereço não cadastrado.</p>';

            const iconeFicha = `<button class="agenda-btn-ficha" data-ficha-index="${index}" title="Gerenciar Visita"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"></rect><rect x="6" y="8" width="4" height="4" rx="1"></rect><line x1="13" y1="9" x2="18" y2="9"></line><line x1="13" y1="12" x2="18" y2="12"></line><line x1="13" y1="15" x2="18" y2="15"></line></svg></button>`;

            // Badge para mostrar que está em andamento

            const badgeAndamento = atividade.status === "Em andamento" ? `<span style="font-size: 0.65rem; background: var(--color-red); color: white; padding: 2px 6px; border-radius: 10px; margin-left: 8px; vertical-align: middle;">EM ANDAMENTO</span>` : "";

            cardsAgenda.push(`

                <div class="card-agenda">

                    <div class="agenda-header"><span class="agenda-data">${fData.diaMes}</span>${iconeFicha}</div>

                    <div class="agenda-cliente">${escaparHtml(atividade.nomeCliente)} ${badgeAndamento}</div>

                    <div class="agenda-info-row"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>${fData.hora}</div>

                    <div class="agenda-info-row"><svg viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>${escaparHtml(atividade.enderecoCompleto)}</div>

                    <div class="agenda-motivo">${escaparHtml(normalizarTipoVisita(atividade))}</div>

                    ${botaoGpsHTML}

                </div>

            `);

        });
        areaAgenda.innerHTML = cardsAgenda.join('');

        areaAgenda.querySelectorAll('[data-ficha-index]').forEach(btn => btn.addEventListener('click', () => {
            if (!operacaoEmCurso) window.abrirDetalhesVisita(Number(btn.dataset.fichaIndex));
        }));

        areaAgenda.querySelectorAll('[data-gps-index]').forEach(btn => btn.addEventListener('click', () => {

            const atividade = listaAtividadesAgenda[Number(btn.dataset.gpsIndex)];

            if (atividade?.enderecoCompleto) window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(atividade.enderecoCompleto)}`, '_blank', 'noopener,noreferrer');

        }));

    } catch (error) { if (sessaoValida(sessao) && pedido === sequenciaAgenda) { areaAgenda.textContent = 'Não foi possível carregar a agenda.'; informarErro('Erro na agenda', error); } }

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
                        horario.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><polyline points="12 7 12 12 15 14"></polyline></svg>';
                        horario.append(document.createTextNode(formatarHorarioVisitaHistorico(visita)));

                        const endereco = document.createElement('div');
                        endereco.className = 'hist-info';
                        endereco.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10c0 6.5-8 12-8 12s-8-5.5-8-12a8 8 0 1 1 16 0Z"></path><circle cx="12" cy="10" r="2.5"></circle></svg>';
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

    areaHistorico.innerHTML = '<p class="hist-vazio">Carregando histórico...</p>';

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

    limpar?.addEventListener('click', () => {
        filtrosHistorico = { periodo: 'todos', resultado: 'todos' };
        if (periodo) periodo.value = 'todos';
        if (resultado) resultado.value = 'todos';
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

        inputCliente.addEventListener('input', (e) => {

            nvClienteSelecionadoId = null; dropCliente.innerHTML = '';

            const txt = e.target.value.toLowerCase();

            const filtrados = listaClientes.filter(item => String(item.nome || '').toLowerCase().includes(txt));

            const divNovo = document.createElement('div');

            divNovo.className = 'autocomplete-item autocomplete-item-novo';

            divNovo.textContent = `+ Cadastrar novo cliente`;

            divNovo.addEventListener('click', () => { if (operacaoEmCurso) return; limparCadastroCliente(); navegarParaTela('tela-cadastro-cliente'); dropCliente.style.display = 'none'; });

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
    atualizarLimitesAgendamento('det');

    document.getElementById('det-nota').value = visitaEmEdicao.nota || "";

    // Preenche radio buttons

    const objValue = normalizarTipoVisita(visitaEmEdicao);

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

    navegarParaTela('tela-detalhes-visita', { carregar: false });

};

function configurarTelaDetalhesVisita() {
    ['det-data', 'det-hora'].forEach(id => {
        ['focus', 'change'].forEach(evento => document.getElementById(id).addEventListener(evento, () => atualizarLimitesAgendamento('det')));
    });

    document.getElementById('btn-voltar-detalhes')?.addEventListener('click', () => voltarNavegacao('tela-agenda'));

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

                navegarParaTela('tela-agenda', { substituir: true, carregar: false });
                await carregarAgenda();

            } finally { operacaoEmCurso = false; }

        });

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

    const enderecoParaCoordenadas = () => ({ logradouro: campo('cc-endereco').value.trim(), numero: campo('cc-numero').value.trim(), cidade: campo('cc-cidade').value.trim(), uf: campo('cc-uf').value.trim().toUpperCase() });

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

                nvClienteSelecionadoId = existente.id; campo('nv-cliente').value = existente.data().nome || '';

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

            let clienteId, nomeFinal = nome, localizado = false;

            if (cnpjReal) {
                // O CNPJ real é a chave de unicidade; códigos antigos continuam aceitos apenas para compatibilidade.
                const anteriores = await buscarClientePorCnpj(cnpjReal);

                exigirSessao(sessao);

                if (!anteriores.empty) {

                    const existente = anteriores.docs[0];

                    if (existente.data().status !== 'Ativo') throw new Error('Este CNPJ já existe, mas está inativo. Solicite a reativação.');

                    clienteId = existente.id; nomeFinal = existente.data().nome || nome; localizado = true;

                } else {

                    const coords = await obterCoordsPorEndereco(enderecoParaCoordenadas());

                    exigirSessao(sessao);

                    if (!coords || !coordenadasValidas(coords.lat, coords.lng)) throw new Error('Não foi possível localizar este endereço. Confira os dados e tente novamente; a loja precisa de coordenadas para o check-in.');

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
                            lat: Number(coords.lat), lng: Number(coords.lng), status: 'Ativo', criadoEm: agora, atualizadoEm: agora });
                        return { nome, localizado: false };
                    });
                    nomeFinal = resultado.nome; localizado = resultado.localizado;
                }
            } else {
                // Sem CNPJ: ID aleatório e cadastro provisório, sem tentativa de detectar duplicidade.
                const coords = await obterCoordsPorEndereco(enderecoParaCoordenadas());
                exigirSessao(sessao);
                if (!coords || !coordenadasValidas(coords.lat, coords.lng)) throw new Error('Não foi possível localizar este endereço. Confira os dados e tente novamente; a loja precisa de coordenadas para o check-in.');

                const agora = new Date();
                const clienteProvisorioId = gerarIdClienteProvisorio(agora, nomeUsuarioLogado);
                const ref = doc(db, 'clientes', clienteProvisorioId);
                await runTransaction(db, async tx => {
                    tx.set(ref, { nome, cidade, uf, enderecoCompleto,
                        lat: Number(coords.lat), lng: Number(coords.lng), status: 'Provisorio',
                        criadoEm: agora, atualizadoEm: agora, criadoPor: sessao.id });
                });
                clienteId = ref.id;
            }

            if (!sessaoValida(sessao)) return;

            const clienteAtual = await obterCliente(clienteId, { refresh: true });
            if (clienteAtual) clientesRepository.set(clienteId, clienteAtual);
            if (!listaClientes.some(c => c.id === clienteId)) listaClientes.push({ id: clienteId, nome: nomeFinal });

            nvClienteSelecionadoId = clienteId; campo('nv-cliente').value = nomeFinal;

            limparCadastroCliente(); voltarNavegacao('tela-nova-visita');

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
    document.getElementById('btn-configuracoes')?.addEventListener('click', () => window.mostrarAlerta('Aviso', 'Tela de Perfil em construção!'));
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

    if (estadoNavegacaoAtual?.overlay === 'checkin') history.back();
    else {
        mostrarApenasTela('tela-inicio');
        await carregarAtividadesPendentes();
    }

}

async function encerrarVisita(id, btn) {
    if (operacaoEmCurso) return;
    if (normalizarTipoVisita(objetoAtividadeGlobal || {}) === 'Visita comercial') {
        const local = commercialReport.savedReport(id);
        if (!local) { window.mostrarAlerta('Atenção', 'Salve o relatório antes de iniciar o check-out.'); return; }
        commercialReport.deactivate();
        preencherCheckout(objetoAtividadeGlobal, local, {dataHora:new Date()});
        document.getElementById('checkout-objetivo').value = commercialReport.drafts.get(id)?.goal || '';
        checkoutPendenteGlobal.frontendComercial = true;
        return;
    }
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
        if (!cliente || !coordenadasValidas(cliente.lat, cliente.lng)) throw new ErroCheckoutLocalizacao('Não foi possível validar a localização da loja.');

        const distancia = calcularDistancia(Number(lat), Number(lng), Number(cliente.lat), Number(cliente.lng));
        if (!Number.isFinite(distancia) || distancia > 500) throw new ErroCheckoutLocalizacao('Você está a ' + Math.round(distancia) + ' m da loja. A distância máxima para o check-out é 500 m.');

        const endereco = await obterEnderecoPorCoords(lat, lng);
        exigirSessao(sessao);
        const relatorio = await carregarRelatorioDaAtividade(atividade);
        const tipo = normalizarTipoVisita(atividade);
        if (!relatorio || relatorio.atividadeId !== id || relatorio.ptvId !== sessao.id || !relatorioValidoParaCheckout(relatorio, tipo)) {
            throw new Error('O relatório não está válido. Abra e salve o relatório antes de iniciar o check-out.');
        }
        const saida = { dataHora: new Date(), lat, lng, accuracy, endereco };
        objetoAtividadeGlobal = atividade;
        objetoRelatorioGlobal = relatorio;
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
    const relatorioInterface = tipoAtual === 'Visita comercial' ? commercialReport?.savedReport(atividadeSelecionadaId) || objetoRelatorioGlobal : objetoRelatorioGlobal;
    const temRelatorio = !!(tipoAtual === 'Visita comercial' && commercialReport?.hasSaved(atividadeSelecionadaId)) || relatorioValidoParaCheckout(relatorioInterface, tipoAtual);

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

    htmlTimeline += '</div>' + htmlBotoes + '</div>';
    areaVisitas.innerHTML = htmlTimeline;

    const btnEscrever = document.getElementById('btn-escrever-relatorio-inicio');
    const btnVerEditar = document.getElementById('btn-ver-relatorio-inicio');
    const btnEncerrar = document.getElementById('btn-encerrar-visita-inicio');

    const acaoAbrirRelatorio = async () => {
        if (operacaoEmCurso || !atividadeSelecionadaId) return;
        if (normalizarTipoVisita(objetoAtividadeGlobal || {}) === 'Visita comercial') {
            abrirPrototipoComercial();
            return;
        }
        commercialReport.deactivate();

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
function configurarEventosGlobais() {
    commercialReport = new CommercialReport(document.getElementById('tela-relatorio'), () => voltarNavegacao('tela-inicio'), () => {
        commercialReport.deactivate();
        navegarParaTela('tela-inicio', { substituir: true, carregar: false });
        atualizarInterfaceVisitaAtual();
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

    document.getElementById('btn-voltar-checkout')?.addEventListener('click', () => {
        if (operacaoEmCurso) return;
        checkoutPendenteGlobal = null;
        voltarNavegacao('tela-inicio');
    });

    document.getElementById('btn-concluir-checkout')?.addEventListener('click', async () => {
        if (operacaoEmCurso || !checkoutPendenteGlobal?.atividadeId) return;
        if (checkoutPendenteGlobal.frontendComercial) {
            window.mostrarAlerta('Check-out', 'O relatório está salvo nesta sessão. O encerramento será conectado na etapa de integração.');
            return;
        }

        const btn = document.getElementById('btn-concluir-checkout');
        const atividadeId = checkoutPendenteGlobal.atividadeId;
        const tipo = normalizarTipoVisita(objetoAtividadeGlobal || {});

        const objetivo = document.getElementById('checkout-objetivo').value.trim();
        const oportunidade = document.querySelector('input[name="checkoutOportunidade"]:checked')?.value || '';
        const categoria = document.getElementById('checkout-categoria').value.trim();
        const participantesTexto = document.getElementById('checkout-participantes').value.trim();
        const publico = document.getElementById('checkout-publico').value.trim();

        const atAcoes = document.getElementById('checkout-at-acoes').value.trim();
        const atConclusao = document.getElementById('checkout-at-conclusao').value.trim();
        const atResultado = document.querySelector('input[name="checkoutAtResultado"]:checked')?.value || '';
        const atProximoPasso = document.getElementById('checkout-at-proximo-passo').value.trim();

        if (tipo === 'Treinamento') {
            if (!categoria) return window.mostrarAlerta('Atenção', 'Selecione a categoria do treinamento.');
            const participantes = Number(participantesTexto);
            if (!Number.isInteger(participantes) || participantes < 1 || participantes > 10000) return window.mostrarAlerta('Atenção', 'Informe uma quantidade válida de participantes.');
            if (!publico) return window.mostrarAlerta('Atenção', 'Selecione o público atendido.');
        } else if (tipo === ASSISTENCIA_TECNICA_TIPO) {
            if (!atAcoes) return window.mostrarAlerta('Atenção', 'Informe as ações definidas.');
            if (!atConclusao) return window.mostrarAlerta('Atenção', 'Informe a conclusão técnica.');
            if (!atResultado) return window.mostrarAlerta('Atenção', 'Selecione o resultado da assistência.');
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
                    dadosCheckout.categoriaTreinamento = categoria;
                    dadosCheckout.quantidadeParticipantes = Number(participantesTexto);
                    dadosCheckout.publicoAtendido = publico;
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
                const obrigatoriosPreenchidos =
                    assistenciaTecnica.produto &&
                    assistenciaTecnica.queixa &&
                    assistenciaTecnica.constatacoes;

                if (!obrigatoriosPreenchidos) {
                    window.mostrarAlerta('Atenção', 'Há informações obrigatórias não preenchidas.');
                    return;
                }
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