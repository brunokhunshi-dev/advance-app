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
let checkoutPendenteGlobal = null;
let fechamentoManualPendente = null; 



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
let filtrosHistorico = { periodo: 'todos', resultado: 'todos' };



function escaparHtml(valor) {

    return String(valor ?? '').replace(/[&<>"']/g, c => ({

        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'

    }[c]));

}

// === PADRÃO DE IDs DO FIRESTORE ===
// IDs novos são gerados em um único lugar para manter o padrão consistente.
// Registros antigos não são renomeados, preservando todas as referências existentes.

const PARTICULAS_NOME = new Set(['da', 'das', 'de', 'do', 'dos', 'e']);

function obterIniciais(nome) {
    const partes = String(nome || '')
        .normalize('NFD')
        .replace(/[\\u0300-\\u036f]/g, '')
        .replace(/[^a-zA-Z\\s]/g, ' ')
        .trim()
        .split(/\\s+/)
        .filter(Boolean);

    if (!partes.length) return 'XX';

    const uteis = partes.filter((parte, indice) =>
        indice === 0 || indice === partes.length - 1 || !PARTICULAS_NOME.has(parte.toLowerCase())
    );

    if (uteis.length === 1) return uteis[0].slice(0, 2).toUpperCase();

    return (uteis[0][0] + uteis[uteis.length - 1][0]).toUpperCase();
}

function formatarDataId(data) {
    const d = obterData(data);
    if (!d) throw new Error('Não foi possível gerar o ID: data inválida.');

    return [
        d.getFullYear(),
        String(d.getMonth() + 1).padStart(2, '0'),
        String(d.getDate()).padStart(2, '0'),
        String(d.getHours()).padStart(2, '0'),
        String(d.getMinutes()).padStart(2, '0')
    ].join('');
}

function gerarSufixoId() {
    if (globalThis.crypto?.getRandomValues) {
        const bytes = new Uint8Array(4);
        crypto.getRandomValues(bytes);
        return Array.from(bytes, byte => byte.toString(36).padStart(2, '0')).join('').slice(0, 6).toUpperCase();
    }

    return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function gerarIdAtividade(tipoVisita, data, nomeTecnico) {
    const prefixo = tipoVisita === 'Treinamento' ? 'TR' : (tipoVisita === 'Assistência técnica' ? 'AT' : 'VC');
    return prefixo + '-' + formatarDataId(data) + '-' + obterIniciais(nomeTecnico) + '-' + gerarSufixoId();
}

function gerarIdRelatorio(data, nomeTecnico) {
    return 'REL-' + formatarDataId(data) + '-' + obterIniciais(nomeTecnico) + '-' + gerarSufixoId();
}

function gerarIdClienteCnpj(codigoCnpj) {
    return 'CLI-CNPJ-' + String(codigoCnpj);
}

function gerarIdClienteProvisorio(dataCriacao, nomeResponsavel) {
    return 'CLI-PROV-' + formatarDataId(dataCriacao) + '-' + obterIniciais(nomeResponsavel) + '-' + gerarSufixoId();
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

function normalizarTipoVisita(atividade) {
    const tipo = String(atividade?.tipoVisita || '').trim().toLowerCase();
    if (tipo === 'treinamento' || atividade?.objetivo === 'Treinamento') return 'Treinamento';
    if (tipo === 'assistência técnica' || tipo === 'assistencia tecnica' || tipo === 'visita de assistência técnica' || tipo === 'visita de assistencia tecnica') return 'Assistência técnica';
    // Compatibilidade com registros antigos: "Visita técnica" passa a ser exibida como comercial.
    if (tipo === 'visita comercial' || tipo === 'visita técnica' || tipo === 'visita tecnica') return 'Visita comercial';
    return 'Visita comercial';
}

const COLECOES_RELATORIO = Object.freeze({
    'Visita comercial': 'relatorios_comerciais',
    'Treinamento': 'relatorios_treinamentos',
    'Assistência técnica': 'relatorios_assistencia_tecnica'
});

function colecaoRelatorioPorTipo(tipoOuAtividade) {
    const tipo = typeof tipoOuAtividade === 'string' ? normalizarTipoVisita({ tipoVisita: tipoOuAtividade }) : normalizarTipoVisita(tipoOuAtividade || {});
    return COLECOES_RELATORIO[tipo] || 'relatorios_comerciais';
}

function colecaoRelatorioDaAtividade(atividade, paraNovo = false) {
    const explicita = String(atividade?.relatorioColecao || '').trim();
    if (explicita) return explicita;
    // Registros antigos já vinculados continuam na coleção histórica.
    if (atividade?.relatorioId && !paraNovo) return 'relatorios';
    return colecaoRelatorioPorTipo(atividade);
}

function referenciaRelatorio(atividade, relatorioId = atividade?.relatorioId, paraNovo = false) {
    if (!relatorioId) return null;
    return doc(db, colecaoRelatorioDaAtividade(atividade, paraNovo), relatorioId);
}

async function carregarRelatorioDaAtividade(atividade) {
    if (!atividade?.relatorioId) return null;
    const ref = referenciaRelatorio(atividade);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return { ...snap.data(), id: snap.id, colecao: ref.parent.id };
}

function dadosAssistenciaDoRelatorio(relatorio = {}) {
    if (relatorio?.assistenciaTecnica) return { ...relatorio.assistenciaTecnica };

    return {
        ...(relatorio.clienteAplicacao || {}),
        ...(relatorio.produtoQueixa || {}),
        ...(relatorio.preparoAplicacao || {}),
        ...(relatorio.verificacao || {}),
        fotosSelecionadas: Array.isArray(relatorio?.evidencias?.fotos) ? relatorio.evidencias.fotos : [],
        acoesDefinidas: relatorio?.fechamento?.acoesDefinidas || '',
        conclusaoTecnica: relatorio?.fechamento?.conclusaoTecnica || '',
        resultado: relatorio?.fechamento?.resultado || '',
        proximoPasso: relatorio?.fechamento?.proximoPasso || ''
    };
}

function secoesAssistenciaParaDocumento(dados = {}) {
    return {
        clienteAplicacao: {
            clienteFinal: dados.clienteFinal || '',
            contato: dados.contato || '',
            setor: dados.setor || '',
            enderecoAplicacao: dados.enderecoAplicacao || '',
            empresaAplicacao: dados.empresaAplicacao || '',
            responsavelEmpresa: dados.responsavelEmpresa || '',
            acompanhadoPor: dados.acompanhadoPor || '',
            superficie: dados.superficie || '',
            dataAplicacao: dados.dataAplicacao || '',
            houveEspecificacao: dados.houveEspecificacao || '',
            numeroEspecificacao: dados.numeroEspecificacao || ''
        },
        produtoQueixa: {
            produto: dados.produto || '',
            lote: dados.lote || '',
            cor: dados.cor || '',
            queixa: dados.queixa || '',
            esquemaPintura: dados.esquemaPintura || ''
        },
        preparoAplicacao: {
            preparoSuperficie: dados.preparoSuperficie || '',
            metodosLimpeza: Array.isArray(dados.metodosLimpeza) ? dados.metodosLimpeza : [],
            impactoClimatico: dados.impactoClimatico || '',
            impactoClimaticoDetalhe: dados.impactoClimaticoDetalhe || '',
            ferramentasAplicacao: Array.isArray(dados.ferramentasAplicacao) ? dados.ferramentasAplicacao : []
        },
        verificacao: {
            itensVerificados: Array.isArray(dados.itensVerificados) ? dados.itensVerificados : [],
            umidade: dados.umidade || '',
            umidadeReferencia: dados.umidadeReferencia || '',
            constatacoes: dados.constatacoes || ''
        },
        evidencias: {
            fotos: Array.isArray(dados.fotosSelecionadas) ? dados.fotosSelecionadas : []
        },
        fechamento: {
            acoesDefinidas: dados.acoesDefinidas || '',
            conclusaoTecnica: dados.conclusaoTecnica || '',
            resultado: dados.resultado || '',
            proximoPasso: dados.proximoPasso || ''
        }
    };
}

function relatorioValidoParaCheckout(relatorio, tipo) {
    if (!relatorio) return false;
    if (tipo === 'Assistência técnica') {
        const dados = dadosAssistenciaDoRelatorio(relatorio);
        return Boolean(String(dados.produto || '').trim() && String(dados.queixa || '').trim() && String(dados.constatacoes || '').trim());
    }
    return Boolean(String(relatorio.textoAtual || '').trim());
}

function formatarDataCheckout(valor) {
    const data = obterData(valor);
    if (!data) return '--/--/----';
    return String(data.getDate()).padStart(2, '0') + '/' + String(data.getMonth() + 1).padStart(2, '0') + '/' + data.getFullYear();
}

function formatarHoraCheckout(valor) {
    const data = obterData(valor);
    if (!data) return '--h--';
    return String(data.getHours()).padStart(2, '0') + 'h' + String(data.getMinutes()).padStart(2, '0');
}

function formatarDuracaoVisita(inicio, fim) {
    const a = obterData(inicio), b = obterData(fim);
    if (!a || !b || b < a) return 'Tempo de visita: --.';
    const minutos = Math.round((b.getTime() - a.getTime()) / 60000);
    const horas = Math.floor(minutos / 60);
    const mins = minutos % 60;
    if (!horas) return 'Tempo de visita: ' + mins + ' minuto' + (mins === 1 ? '' : 's') + '.';
    if (!mins) return 'Tempo de visita: ' + horas + ' hora' + (horas === 1 ? '' : 's') + '.';
    return 'Tempo de visita: ' + horas + ' hora' + (horas === 1 ? '' : 's') + ' e ' + mins + ' minuto' + (mins === 1 ? '' : 's') + '.';
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

    document.getElementById('checkout-relatorio-final').textContent = relatorio?.textoAtual || 'Nenhum relatório salvo.';
    mostrarApenasTela('tela-checkout');
    window.scrollTo(0, 0);
}

const ASSISTENCIA_TECNICA_TIPO = 'Assistência técnica';

function valorCampoAssistencia(id) {
    return String(document.getElementById(id)?.value || '').trim();
}

function valoresMarcadosAssistencia(name) {
    return [...document.querySelectorAll('input[name="' + name + '"]:checked')].map(input => input.value);
}

function radioAssistencia(name) {
    return document.querySelector('input[name="' + name + '"]:checked')?.value || '';
}

function marcarRadioAssistencia(name, value) {
    document.querySelectorAll('input[name="' + name + '"]').forEach(input => {
        input.checked = String(input.value) === String(value || '');
    });
}

function marcarChecksAssistencia(name, values) {
    const set = new Set(Array.isArray(values) ? values.map(String) : []);
    document.querySelectorAll('input[name="' + name + '"]').forEach(input => {
        input.checked = set.has(String(input.value));
    });
}

function limparFormularioAssistencia() {
    [
        'at-cliente-final','at-contato','at-setor','at-endereco-aplicacao','at-empresa-aplicacao',
        'at-responsavel-empresa','at-acompanhado-por','at-superficie','at-data-aplicacao',
        'at-numero-especificacao','at-produto','at-lote','at-cor','at-queixa','at-esquema-pintura',
        'at-preparo-superficie','at-impacto-detalhe','at-umidade','at-umidade-referencia','at-constatacoes'
    ].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    ['atEspecificacao','atImpactoClimatico','atLimpeza','atFerramenta','atVerificado'].forEach(name => {
        document.querySelectorAll('input[name="' + name + '"]').forEach(input => { input.checked = false; });
    });
    const fotos = document.getElementById('at-fotos');
    if (fotos) fotos.value = '';
    const status = document.getElementById('at-fotos-status');
    if (status) status.textContent = 'Use a câmera ou selecione imagens do aparelho';
    document.getElementById('at-especificacao-numero-wrap')?.style?.setProperty('display','none');
    document.getElementById('at-impacto-detalhe-wrap')?.style?.setProperty('display','none');
}

function lerFormularioAssistencia() {
    const novasFotos = [...(document.getElementById('at-fotos')?.files || [])].map(file => ({
        nome: file.name,
        tipo: file.type || '',
        tamanho: Number(file.size || 0),
        alteradoEm: Number(file.lastModified || 0)
    }));
    const fotos = novasFotos.length ? novasFotos : (Array.isArray(objetoRelatorioGlobal?.assistenciaTecnica?.fotosSelecionadas) ? objetoRelatorioGlobal.assistenciaTecnica.fotosSelecionadas : []);

    return {
        clienteFinal: valorCampoAssistencia('at-cliente-final'),
        contato: valorCampoAssistencia('at-contato'),
        setor: valorCampoAssistencia('at-setor'),
        enderecoAplicacao: valorCampoAssistencia('at-endereco-aplicacao'),
        empresaAplicacao: valorCampoAssistencia('at-empresa-aplicacao'),
        responsavelEmpresa: valorCampoAssistencia('at-responsavel-empresa'),
        acompanhadoPor: valorCampoAssistencia('at-acompanhado-por'),
        superficie: valorCampoAssistencia('at-superficie'),
        dataAplicacao: valorCampoAssistencia('at-data-aplicacao'),
        houveEspecificacao: radioAssistencia('atEspecificacao'),
        numeroEspecificacao: valorCampoAssistencia('at-numero-especificacao'),
        produto: valorCampoAssistencia('at-produto'),
        lote: valorCampoAssistencia('at-lote'),
        cor: valorCampoAssistencia('at-cor'),
        queixa: valorCampoAssistencia('at-queixa'),
        esquemaPintura: valorCampoAssistencia('at-esquema-pintura'),
        preparoSuperficie: valorCampoAssistencia('at-preparo-superficie'),
        metodosLimpeza: valoresMarcadosAssistencia('atLimpeza'),
        impactoClimatico: radioAssistencia('atImpactoClimatico'),
        impactoClimaticoDetalhe: valorCampoAssistencia('at-impacto-detalhe'),
        ferramentasAplicacao: valoresMarcadosAssistencia('atFerramenta'),
        itensVerificados: valoresMarcadosAssistencia('atVerificado'),
        umidade: valorCampoAssistencia('at-umidade'),
        umidadeReferencia: valorCampoAssistencia('at-umidade-referencia'),
        constatacoes: valorCampoAssistencia('at-constatacoes'),
        fotosSelecionadas: fotos
    };
}

function preencherFormularioAssistencia(dados = {}) {
    limparFormularioAssistencia();
    const mapa = {
        'at-cliente-final':'clienteFinal','at-contato':'contato','at-setor':'setor',
        'at-endereco-aplicacao':'enderecoAplicacao','at-empresa-aplicacao':'empresaAplicacao',
        'at-responsavel-empresa':'responsavelEmpresa','at-acompanhado-por':'acompanhadoPor',
        'at-superficie':'superficie','at-data-aplicacao':'dataAplicacao',
        'at-numero-especificacao':'numeroEspecificacao','at-produto':'produto','at-lote':'lote',
        'at-cor':'cor','at-queixa':'queixa','at-esquema-pintura':'esquemaPintura',
        'at-preparo-superficie':'preparoSuperficie','at-impacto-detalhe':'impactoClimaticoDetalhe',
        'at-umidade':'umidade','at-umidade-referencia':'umidadeReferencia','at-constatacoes':'constatacoes'
    };
    Object.entries(mapa).forEach(([id,key]) => {
        const el = document.getElementById(id);
        if (el) el.value = dados?.[key] ?? '';
    });
    marcarRadioAssistencia('atEspecificacao', dados?.houveEspecificacao);
    marcarRadioAssistencia('atImpactoClimatico', dados?.impactoClimatico);
    marcarChecksAssistencia('atLimpeza', dados?.metodosLimpeza);
    marcarChecksAssistencia('atFerramenta', dados?.ferramentasAplicacao);
    marcarChecksAssistencia('atVerificado', dados?.itensVerificados);

    document.getElementById('at-especificacao-numero-wrap')?.style?.setProperty('display', dados?.houveEspecificacao === 'Sim' ? 'block' : 'none');
    document.getElementById('at-impacto-detalhe-wrap')?.style?.setProperty('display', dados?.impactoClimatico === 'Sim' ? 'block' : 'none');

    const antigas = Array.isArray(dados?.fotosSelecionadas) ? dados.fotosSelecionadas : [];
    const status = document.getElementById('at-fotos-status');
    if (status && antigas.length) status.textContent = antigas.length + (antigas.length === 1 ? ' foto registrada na última edição' : ' fotos registradas na última edição');
}

function normalizarAssistenciaComparacao(dados = {}) {
    const copia = { ...dados };
    delete copia.fotosSelecionadas;
    delete copia.acoesDefinidas;
    delete copia.conclusaoTecnica;
    delete copia.resultado;
    delete copia.proximoPasso;
    return copia;
}

function gerarResumoAssistenciaTecnica(dados = {}) {
    const linha = (rotulo, valor) => {
        if (valor == null || String(valor).trim() === '') return null;
        return rotulo + ': ' + String(valor).trim();
    };
    const lista = (rotulo, valores) => Array.isArray(valores) && valores.length ? rotulo + ': ' + valores.join(', ') : null;

    return [
        'RELATÓRIO DE ASSISTÊNCIA TÉCNICA',
        linha('Cliente final', dados.clienteFinal),
        linha('Contato / setor', [dados.contato, dados.setor].filter(Boolean).join(' / ')),
        linha('Endereço de aplicação', dados.enderecoAplicacao),
        linha('Empresa de aplicação', dados.empresaAplicacao),
        linha('Responsável da empresa', dados.responsavelEmpresa),
        linha('Acompanhado por', dados.acompanhadoPor),
        linha('Equipamento / superfície', dados.superficie),
        linha('Data da aplicação', dados.dataAplicacao),
        linha('Houve especificação', dados.houveEspecificacao),
        linha('Nº da especificação', dados.numeroEspecificacao),
        '',
        linha('Produto', dados.produto),
        linha('Lote', dados.lote),
        linha('Cor', dados.cor),
        linha('Queixa', dados.queixa),
        linha('Esquema de pintura', dados.esquemaPintura),
        '',
        linha('Preparo da superfície', dados.preparoSuperficie),
        lista('Métodos de limpeza', dados.metodosLimpeza),
        linha('Impacto climático / intempéries', dados.impactoClimatico),
        linha('Detalhes das condições', dados.impactoClimaticoDetalhe),
        lista('Ferramentas de aplicação', dados.ferramentasAplicacao),
        '',
        lista('Itens verificados', dados.itensVerificados),
        linha('Umidade medida', dados.umidade),
        linha('Referência / limite', dados.umidadeReferencia),
        linha('Constatações técnicas', dados.constatacoes),
        '',
        linha('Ações definidas', dados.acoesDefinidas),
        linha('Conclusão técnica', dados.conclusaoTecnica),
        linha('Resultado da assistência', dados.resultado),
        linha('Próximo passo', dados.proximoPasso)
    ].filter(item => item !== null).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function valorVisualAssistencia(valor, fallback = 'Não informado') {
    const texto = String(valor ?? '').trim();
    return texto ? escaparHtml(texto) : fallback;
}

function chipsVisualAssistencia(valores) {
    const lista = Array.isArray(valores) ? valores.filter(Boolean) : [];
    if (!lista.length) return '<span class="assistencia-report-chip">Não informado</span>';
    return lista.map(valor => '<span class="assistencia-report-chip">' + escaparHtml(valor) + '</span>').join('');
}

function renderFichaAssistencia(dados = {}, opcoes = {}) {
    const item = (rotulo, valor, wide = false) =>
        '<div class="assistencia-report-item' + (wide ? ' is-wide' : '') + '"><label>' + escaparHtml(rotulo) + '</label><p>' + valorVisualAssistencia(valor) + '</p></div>';

    const chips = (rotulo, valores) =>
        '<div class="assistencia-report-item is-wide"><label>' + escaparHtml(rotulo) + '</label><div class="assistencia-report-chips">' + chipsVisualAssistencia(valores) + '</div></div>';

    const especificacao = dados.houveEspecificacao === 'Sim'
        ? 'Sim' + (dados.numeroEspecificacao ? ' · ' + escaparHtml(dados.numeroEspecificacao) : '')
        : (dados.houveEspecificacao || 'Não informado');

    const clima = dados.impactoClimatico === 'Sim'
        ? 'Sim' + (dados.impactoClimaticoDetalhe ? ' · ' + escaparHtml(dados.impactoClimaticoDetalhe) : '')
        : (dados.impactoClimatico || 'Não informado');

    let html = '';
    html += '<section class="assistencia-report-card"><div class="assistencia-report-card-title">Cliente e aplicação</div><div class="assistencia-report-grid">';
    html += item('Cliente final', dados.clienteFinal);
    html += item('Contato / setor', [dados.contato, dados.setor].filter(Boolean).join(' / '));
    html += item('Empresa de aplicação', dados.empresaAplicacao);
    html += item('Responsável', dados.responsavelEmpresa);
    html += item('Acompanhado por', dados.acompanhadoPor);
    html += item('Superfície / equipamento', dados.superficie);
    html += item('Data da aplicação', dados.dataAplicacao);
    html += item('Especificação', especificacao);
    html += item('Endereço de aplicação', dados.enderecoAplicacao, true);
    html += '</div></section>';

    html += '<section class="assistencia-report-card assistencia-report-highlight"><div class="assistencia-report-card-title">Produto e ocorrência</div><div class="assistencia-report-grid">';
    html += item('Produto', dados.produto);
    html += item('Lote', dados.lote);
    html += item('Cor', dados.cor);
    html += item('Queixa', dados.queixa, true);
    html += item('Esquema de pintura', dados.esquemaPintura, true);
    html += '</div></section>';

    html += '<section class="assistencia-report-card"><div class="assistencia-report-card-title">Aplicação e condições</div><div class="assistencia-report-grid">';
    html += item('Preparo da superfície', dados.preparoSuperficie, true);
    html += chips('Métodos de limpeza', dados.metodosLimpeza);
    html += item('Impacto climático / intempéries', clima, true);
    html += chips('Ferramentas de aplicação', dados.ferramentasAplicacao);
    html += '</div></section>';

    html += '<section class="assistencia-report-card"><div class="assistencia-report-card-title">Verificação técnica</div><div class="assistencia-report-grid">';
    html += chips('Itens verificados', dados.itensVerificados);
    html += item('Umidade medida', dados.umidade);
    html += item('Referência / limite', dados.umidadeReferencia);
    html += item('Constatações técnicas', dados.constatacoes, true);
    html += '</div></section>';

    if (!opcoes.omitirFechamento) {
        html += '<section class="assistencia-report-card"><div class="assistencia-report-card-title">Ações e conclusão</div><div class="assistencia-report-grid">';
        html += item('Ações definidas', dados.acoesDefinidas, true);
        html += item('Conclusão técnica', dados.conclusaoTecnica, true);
        html += item('Próximo passo', dados.proximoPasso, true);
        html += '</div>';
        html += '<div class="assistencia-report-result"><strong>' + valorVisualAssistencia(dados.resultado, 'Resultado ainda não definido') + '</strong><span>Resultado da assistência</span></div>';
        html += '</section>';
    }

    return html;
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
    container.innerHTML = renderFichaAssistencia(dadosAssistenciaCheckoutAtual());
}

function mostrarEditorRelatorioPorTipo(tipo) {
    const assistencia = tipo === ASSISTENCIA_TECNICA_TIPO;
    const padrao = document.getElementById('relatorio-editor-padrao');
    const personalizado = document.getElementById('relatorio-assistencia-section');
    if (padrao) padrao.style.display = assistencia ? 'none' : 'block';
    if (personalizado) personalizado.style.display = assistencia ? 'block' : 'none';
}

class ErroCheckoutLocalizacao extends Error {}

function validarPrecisaoGps(pos) {
    const accuracy = Number(pos?.coords?.accuracy);
    if (!Number.isFinite(accuracy) || accuracy < 0) throw new Error('O GPS não retornou uma precisão válida.');
    if (accuracy > GPS_ACCURACY_MAX_METERS) throw new Error(`A precisão do GPS está baixa (${Math.round(accuracy)} m). Aguarde alguns segundos em local aberto e tente novamente.`);
    return accuracy;
}

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

    ['modal-alerta-generico','modal-aviso-andamento','modal-confirmar-exclusao','modal-fechamento-manual'].forEach(id => {

        const el = document.getElementById(id); if (el) document.body.appendChild(el);

    });

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

function ofuscarCNPJ(cnpjPuro) { return "C-" + (BigInt(cnpjPuro) * 999999937n).toString(16).toUpperCase(); }



function mostrarApenasTela(idTelaAlvo) {

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

                    <div class="agenda-motivo">${escaparHtml(normalizarTipoVisita(atividade))}</div>

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



function obterResultadoHistorico(visita) {
    if (String(visita.fechamentoAnaliseStatus || '').trim() === 'Pendente de análise') return 'Pendente';
    if (visita.status === 'Em andamento') return 'Em andamento';
    const valor = String(visita.resultado || '').trim().toLowerCase();
    if (valor === 'resolvido') return 'Resolvido';
    if (valor === 'não resolvido' || valor === 'nao resolvido') return 'Não resolvido';
    if (valor === 'cancelada' || visita.status === 'Cancelada') return 'Cancelada';
    return 'Concluída';
}

function obterClasseResultadoHistorico(resultado) {
    if (resultado === 'Resolvido') return 'hist-status-resolvido';
    if (resultado === 'Não resolvido') return 'hist-status-nao-resolvido';
    if (resultado === 'Cancelada') return 'hist-status-cancelada';
    if (resultado === 'Pendente') return 'hist-status-pendente';
    if (resultado === 'Em andamento') return 'hist-status-andamento';
    return 'hist-status-concluida';
}

function obterDataHistorico(visita) {
    return obterData(visita.checkinDataHora) || obterData(visita.data);
}

function formatarDiaHistorico(data) {
    return `${String(data.getDate()).padStart(2, '0')} - ${data.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').toUpperCase()}`;
}

function formatarHoraHistorico(valor) {
    const data = obterData(valor);
    if (!data) return '';
    return `${String(data.getHours()).padStart(2, '0')}h${String(data.getMinutes()).padStart(2, '0')}`;
}

function formatarHorarioVisitaHistorico(visita) {
    const inicio = formatarHoraHistorico(visita.checkinDataHora);
    const fim = formatarHoraHistorico(visita.checkoutDataHora);
    if (inicio && fim) return `${inicio} - ${fim}`;
    return inicio || formatarHoraHistorico(visita.data) || 'Horário não informado';
}

function inicioDaSemanaHistorico(data) {
    const inicio = new Date(data);
    const dia = inicio.getDay();
    const deslocamento = dia === 0 ? 6 : dia - 1;
    inicio.setHours(0, 0, 0, 0);
    inicio.setDate(inicio.getDate() - deslocamento);
    return inicio;
}

function periodoHistorico(visita) {
    const data = obterDataHistorico(visita);
    if (!data) return 'Outras datas';

    const agora = new Date();
    const inicioSemana = inicioDaSemanaHistorico(agora);
    const inicioProximaSemana = new Date(inicioSemana);
    inicioProximaSemana.setDate(inicioProximaSemana.getDate() + 7);

    if (data >= inicioSemana && data < inicioProximaSemana) return 'Nessa semana';
    if (data.getMonth() === agora.getMonth() && data.getFullYear() === agora.getFullYear()) return 'Nesse mês';

    return data.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
        .replace(/^./, c => c.toUpperCase());
}

function aplicarFiltrosHistorico(visitas) {
    const agora = new Date();
    const inicioSemana = inicioDaSemanaHistorico(agora);
    const inicioProximaSemana = new Date(inicioSemana);
    inicioProximaSemana.setDate(inicioProximaSemana.getDate() + 7);

    return visitas.filter(visita => {
        const resultado = obterResultadoHistorico(visita);
        const data = obterDataHistorico(visita);

        if (filtrosHistorico.resultado !== 'todos' && resultado !== filtrosHistorico.resultado) return false;

        if (filtrosHistorico.periodo === 'semana') {
            if (!data || data < inicioSemana || data >= inicioProximaSemana) return false;
        } else if (filtrosHistorico.periodo === 'mes') {
            if (!data || data.getMonth() !== agora.getMonth() || data.getFullYear() !== agora.getFullYear()) return false;
        } else if (filtrosHistorico.periodo === 'anteriores') {
            if (!data || data.getMonth() === agora.getMonth() && data.getFullYear() === agora.getFullYear()) return false;
        }

        return true;
    });
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
            orderBy('data', 'desc'),
            limit(100)
        );

        let documentosHistorico;

        try {
            documentosHistorico = (await getDocs(q)).docs;
        } catch (erro) {
            if (erro.code !== 'failed-precondition') throw erro;
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

        if (!documentosHistorico.length) {
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

        renderizarHistoricoVisitas(aplicarFiltrosHistorico(historicoArray));
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
        carregarHistoricoVisitas();
    });

    resultado?.addEventListener('change', () => {
        filtrosHistorico.resultado = resultado.value;
        carregarHistoricoVisitas();
    });

    limpar?.addEventListener('click', () => {
        filtrosHistorico = { periodo: 'todos', resultado: 'todos' };
        if (periodo) periodo.value = 'todos';
        if (resultado) resultado.value = 'todos';
        carregarHistoricoVisitas();
    });
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

                const tipoVisita = document.querySelector('input[name="tipoVisita"]:checked')?.value;

                if (!tipoVisita) throw new Error('Selecione o tipo de visita.');

                const nota = document.getElementById('nv-nota').value.trim();

                if (nota.length > 600) throw new Error('A nota deve ter até 600 caracteres.');

                operacaoEmCurso = true; btnAgendar.disabled = true; btnAgendar.textContent = 'Agendando...';

                const cliente = await obterCliente(clienteId);

                exigirSessao(sessao);

                if (!cliente || !['Ativo', 'Provisorio'].includes(cliente.status)) throw new Error('O cliente não está disponível para agendamento. Atualize a lista.');

                const agora = new Date();
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

                mostrarApenasTela('tela-agenda'); await carregarAgenda();

            } catch (erro) { informarErro('Não foi possível agendar', erro); }

            finally { operacaoEmCurso = false; btnAgendar.disabled = false; btnAgendar.textContent = 'Agendar'; }

        });

    }

}




function formatarProtocoloVisualizador(valor, fallback) {
    const bruto = String(valor || fallback || '').trim();
    if (!bruto) return '#...';
    return bruto.startsWith('#') ? bruto : '#' + bruto;
}

function preencherCampoVisualizador(id, valor, fallback = 'Não informado') {
    const el = document.getElementById(id);
    if (el) el.textContent = valor == null || String(valor).trim() === '' ? fallback : String(valor);
}

function formatarGpsVisualizador(gps, accuracy) {
    const texto = gps ? String(gps) : 'GPS não informado';
    const precisao = Number.isFinite(Number(accuracy)) ? ' • Precisão: ' + Math.round(Number(accuracy)) + ' m' : '';
    return texto + precisao;
}

function preencherCelulaPdf(id, valor) {
    const el = document.getElementById(id);
    if (el) el.textContent = valor == null || String(valor).trim() === '' ? '—' : String(valor);
}

function prepararImpressaoVisualizador(atividade, cliente, relatorio) {
    const resultado = obterResultadoHistorico(atividade);
    const tipo = normalizarTipoVisita(atividade);

    preencherCelulaPdf('pdf-status', resultado.toUpperCase());
    preencherCelulaPdf('pdf-cliente', cliente?.nome);
    preencherCelulaPdf('pdf-protocolo', formatarProtocoloVisualizador(relatorio?.codigo, atividade.id));
    preencherCelulaPdf('pdf-tipo', tipo);
    preencherCelulaPdf('pdf-tecnico', nomeUsuarioLogado);
    preencherCelulaPdf('pdf-endereco', cliente?.enderecoCompleto);

    preencherCelulaPdf('pdf-chegada-data', formatarDataCheckout(atividade.checkinDataHora));
    preencherCelulaPdf('pdf-chegada-hora', formatarHoraCheckout(atividade.checkinDataHora));
    preencherCelulaPdf('pdf-saida-data', formatarDataCheckout(atividade.checkoutDataHora));
    preencherCelulaPdf('pdf-saida-hora', formatarHoraCheckout(atividade.checkoutDataHora));
    preencherCelulaPdf('pdf-duracao', formatarDuracaoVisita(atividade.checkinDataHora, atividade.checkoutDataHora));

    const tecnica = document.getElementById('pdf-tecnica-table');
    const treinamento = document.getElementById('pdf-treinamento-table');
    const assistencia = document.getElementById('pdf-assistencia-table');

    tecnica.style.display = tipo === 'Visita comercial' ? 'table' : 'none';
    treinamento.style.display = tipo === 'Treinamento' ? 'table' : 'none';
    assistencia.style.display = tipo === ASSISTENCIA_TECNICA_TIPO ? 'table' : 'none';

    preencherCelulaPdf('pdf-objetivo', atividade.objetivo);
    preencherCelulaPdf('pdf-oportunidade', atividade.oportunidadeIdentificada);
    preencherCelulaPdf('pdf-categoria', atividade.categoriaTreinamento);
    preencherCelulaPdf('pdf-participantes', atividade.quantidadeParticipantes);
    preencherCelulaPdf('pdf-publico', atividade.publicoAtendido);

    const dadosAssistencia = dadosAssistenciaDoRelatorio(relatorio);
    preencherCelulaPdf('pdf-at-cliente-final', dadosAssistencia.clienteFinal);
    preencherCelulaPdf('pdf-at-produto', dadosAssistencia.produto);
    preencherCelulaPdf('pdf-at-lote', dadosAssistencia.lote);
    preencherCelulaPdf('pdf-at-queixa', dadosAssistencia.queixa);
    preencherCelulaPdf('pdf-at-constatacoes', dadosAssistencia.constatacoes);
    preencherCelulaPdf('pdf-at-conclusao', dadosAssistencia.conclusaoTecnica);
    preencherCelulaPdf('pdf-at-resultado', dadosAssistencia.resultado);

    preencherCelulaPdf('pdf-nota', atividade.nota);
    preencherCelulaPdf('pdf-relatorio', relatorio?.textoAtual);

    const manual = String(atividade.fechamentoAnaliseStatus || '').trim() === 'Pendente de análise';
    const manualTable = document.getElementById('pdf-manual-table');
    manualTable.style.display = manual ? 'table' : 'none';
    preencherCelulaPdf('pdf-manual-status', atividade.fechamentoAnaliseStatus);
    preencherCelulaPdf('pdf-manual-motivo', atividade.motivoFechamentoManual);
    preencherCelulaPdf('pdf-manual-data', atividade.fechamentoSolicitadoEm ? formatarDataHoraPT(atividade.fechamentoSolicitadoEm).completo : null);

    preencherCelulaPdf('pdf-checkin-endereco', atividade.checkinEndereco);
    preencherCelulaPdf('pdf-checkin-precisao', Number.isFinite(Number(atividade.checkinGpsAccuracy)) ? Math.round(Number(atividade.checkinGpsAccuracy)) + ' m' : null);
    preencherCelulaPdf('pdf-checkout-endereco', atividade.checkoutEndereco);
    preencherCelulaPdf('pdf-checkout-precisao', Number.isFinite(Number(atividade.checkoutGpsAccuracy)) ? Math.round(Number(atividade.checkoutGpsAccuracy)) + ' m' : null);
    preencherCelulaPdf('pdf-checkin-gps', atividade.checkinGps);
    preencherCelulaPdf('pdf-checkout-gps', atividade.checkoutGps);
    preencherCelulaPdf('pdf-gerado-em', formatarDataHoraPT(new Date()).completo);
}

function renderizarVisualizadorVisita(atividade, cliente, relatorio) {
    window._clienteVisualizadorAtual = cliente || null;
    const resultado = obterResultadoHistorico(atividade);
    const resultadoEl = document.getElementById('visu-resultado');
    resultadoEl.textContent = resultado;
    resultadoEl.className = 'visualizador-resultado ' + obterClasseResultadoHistorico(resultado).replace('hist-status-', 'visualizador-');

    preencherCampoVisualizador('visu-cliente', cliente?.nome || 'Cliente não encontrado');
    preencherCampoVisualizador('visu-protocolo', formatarProtocoloVisualizador(relatorio?.codigo, atividade.id), '');
    preencherCampoVisualizador('visu-chegada-data', formatarDataCheckout(atividade.checkinDataHora), '--/--/----');
    preencherCampoVisualizador('visu-chegada-hora', formatarHoraCheckout(atividade.checkinDataHora), '--h--');
    preencherCampoVisualizador('visu-saida-data', formatarDataCheckout(atividade.checkoutDataHora), '--/--/----');
    preencherCampoVisualizador('visu-saida-hora', formatarHoraCheckout(atividade.checkoutDataHora), '--h--');
    preencherCampoVisualizador('visu-duracao', formatarDuracaoVisita(atividade.checkinDataHora, atividade.checkoutDataHora), 'Tempo de visita: --.');
    document.getElementById('visu-duracao').textContent = formatarDuracaoVisita(atividade.checkinDataHora, atividade.checkoutDataHora);

    const enderecoCliente = document.getElementById('visu-endereco-cliente');
    if (enderecoCliente) enderecoCliente.textContent = cliente?.enderecoCompleto || 'Endereço não informado';

    const tipo = normalizarTipoVisita(atividade);
    document.getElementById('visu-tecnica').style.display = tipo === 'Visita comercial' ? 'block' : 'none';
    document.getElementById('visu-treinamento').style.display = tipo === 'Treinamento' ? 'block' : 'none';
    document.getElementById('visu-assistencia').style.display = tipo === ASSISTENCIA_TECNICA_TIPO ? 'block' : 'none';

    preencherCampoVisualizador('visu-objetivo', atividade.objetivo);
    preencherCampoVisualizador('visu-oportunidade', atividade.oportunidadeIdentificada);
    preencherCampoVisualizador('visu-categoria', atividade.categoriaTreinamento);
    preencherCampoVisualizador('visu-participantes', atividade.quantidadeParticipantes);
    preencherCampoVisualizador('visu-publico', atividade.publicoAtendido);

    const dadosAssistencia = dadosAssistenciaDoRelatorio(relatorio);
    preencherCampoVisualizador('visu-at-cliente-final', dadosAssistencia.clienteFinal);
    preencherCampoVisualizador('visu-at-produto', dadosAssistencia.produto);
    preencherCampoVisualizador('visu-at-queixa', dadosAssistencia.queixa);
    preencherCampoVisualizador('visu-at-conclusao', dadosAssistencia.conclusaoTecnica);
    preencherCampoVisualizador('visu-at-resultado', dadosAssistencia.resultado);
    preencherCampoVisualizador('visu-nota', atividade.nota, 'Nenhuma nota registrada.');
    preencherCampoVisualizador('visu-relatorio', relatorio?.textoAtual, 'Nenhum relatório registrado.');

    const manual = String(atividade.fechamentoAnaliseStatus || '').trim() === 'Pendente de análise';
    document.getElementById('visu-manual').style.display = manual ? 'block' : 'none';
    preencherCampoVisualizador('visu-motivo-manual', atividade.motivoFechamentoManual);
    preencherCampoVisualizador('visu-manual-data', atividade.fechamentoSolicitadoEm ? formatarDataHoraPT(atividade.fechamentoSolicitadoEm).completo : null);

    preencherCampoVisualizador('visu-checkin-endereco', atividade.checkinEndereco);
    preencherCampoVisualizador('visu-checkout-endereco', atividade.checkoutEndereco);
    preencherCampoVisualizador('visu-checkin-gps', formatarGpsVisualizador(atividade.checkinGps, atividade.checkinGpsAccuracy));
    preencherCampoVisualizador('visu-checkout-gps', formatarGpsVisualizador(atividade.checkoutGps, atividade.checkoutGpsAccuracy));

    document.getElementById('btn-fechar-visualizador')?.blur();
}

window.abrirVisualizadorVisita = async function(atividadeId) {
    if (operacaoEmCurso || !atividadeId) return;

    const sessao = sessaoAtual();
    const area = document.getElementById('tela-visualizador-visita');
    const clienteEl = document.getElementById('visu-cliente');

    area.style.display = 'block';
    mostrarApenasTela('tela-visualizador-visita');
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

        renderizarVisualizadorVisita(atividade, cliente, relatorio);
    } catch (erro) {
        informarErro('Não foi possível abrir a visita', erro);
        mostrarApenasTela('tela-historico');
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

                tx.update(ref, { data, tipoVisita, nota, atualizadoEm: new Date() });

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
        const snap = await getDocs(query(collection(db,'clientes'), where('status','in',['Ativo','Provisorio'])));
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

        const puro = cnpj.value.replace(/\D/g, '');

        // CNPJ é opcional. Sem CNPJ, o cadastro segue como provisório e não dispara consulta externa.
        if (!puro) {
            hashCnpjNovoCliente = null;
            campo('cc-status-cnpj').textContent = ' (Opcional)';
            return;
        }

        const pedido = ++versaoConsultaCnpj, sessao = sessaoAtual();

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

            if (puro && !cnpjValido(puro)) throw new Error('Informe um CNPJ válido, incluindo os dígitos verificadores.');

            const codigo = puro ? ofuscarCNPJ(puro) : null;
            const nome = campo('cc-nome').value.trim();

            const cidade = campo('cc-cidade').value.trim(), uf = campo('cc-uf').value.trim().toUpperCase();

            const ufs = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

            if (!nome || !cidade || !ufs.includes(uf) || !campo('cc-endereco').value.trim() || !campo('cc-numero').value.trim()) throw new Error('Preencha nome, endereço, número, cidade e UF válidos.');

            const enderecoCompleto = valoresEndereco();

            cadastroSalvando = true; operacaoEmCurso = true; atualizarBotaoCadastro(); btn.textContent = 'Salvando...';

            let clienteId, nomeFinal = nome, localizado = false;

            if (codigo) {
                // Fluxo atual de CNPJ: o código determinístico continua sendo a chave de unicidade.
                const anteriores = await getDocs(query(collection(db,'clientes'), where('codigoCnpj','==',codigo)));

                exigirSessao(sessao);

                if (!anteriores.empty) {

                    const existente = anteriores.docs[0];

                    if (existente.data().status !== 'Ativo') throw new Error('Este CNPJ já existe, mas está inativo. Solicite a reativação.');

                    clienteId = existente.id; nomeFinal = existente.data().nome || nome; localizado = true;

                } else {

                    const coords = await obterCoordsPorEndereco(enderecoCompleto);

                    exigirSessao(sessao);

                    if (!coords || !coordenadasValidas(coords.lat, coords.lng)) throw new Error('Não foi possível localizar este endereço. Confira os dados e tente novamente; a loja precisa de coordenadas para o check-in.');

                    clienteId = gerarIdClienteCnpj(codigo);
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
            } else {
                // Sem CNPJ: ID aleatório e cadastro provisório, sem tentativa de detectar duplicidade.
                const coords = await obterCoordsPorEndereco(enderecoCompleto);
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

            const clienteAtual = await obterCliente(clienteId);
            if (clienteAtual) cacheClientes.set(clienteId, clienteAtual);
            if (!listaClientes.some(c => c.id === clienteId)) listaClientes.push({ id: clienteId, nome: nomeFinal });

            nvClienteSelecionadoId = clienteId; campo('nv-cliente').value = nomeFinal;

            limparCadastroCliente(); mostrarApenasTela('tela-nova-visita');

            window.mostrarAlerta('Sucesso', codigo
                ? (localizado ? 'Cliente existente selecionado.' : 'Loja salva com coordenadas do endereço informado.')
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
    const temRelatorio = !!(objetoRelatorioGlobal && String(objetoRelatorioGlobal.textoAtual || '').trim());

    const etapas = [{
        titulo: 'Check-in',
        hora: objData.hora,
        descricao: escaparHtml(nomeUsuarioLogado || 'Técnico') + ' chegou a ' + escaparHtml(clienteSelecionadoNome) + ' às ' + objData.hora + '.'
    }];

    if (temRelatorio) {
        const historico = Array.isArray(objetoRelatorioGlobal.historico) && objetoRelatorioGlobal.historico.length
            ? objetoRelatorioGlobal.historico
            : [{ salvoEm: objetoRelatorioGlobal.atualizadoEm }];

        historico.forEach((registro, index) => {
            const horaReg = formatarDataHoraPT(registro.salvoEm).hora;
            etapas.push({
                titulo: index === 0 ? 'Relatório adicionado' : 'Relatório atualizado',
                hora: horaReg,
                descricao: escaparHtml(nomeUsuarioLogado || 'Técnico') + ' ' + (index === 0 ? 'escreveu um relatório.' : 'atualizou o relatório.'),
                relatorioAtual: index === historico.length - 1
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

    const acaoAbrirRelatorio = () => {
        if (operacaoEmCurso) return;
        mostrarApenasTela('tela-relatorio');
        const formatoData = formatarDataHoraPT(objetoAtividadeGlobal.checkinDataHora);
        const tipo = normalizarTipoVisita(objetoAtividadeGlobal);
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

        document.getElementById('rel-titulo-cliente').textContent = (tipo === ASSISTENCIA_TECNICA_TIPO ? 'Assistência técnica - ' : 'Relatório - ') + clienteSelecionadoNome;
        document.getElementById('rel-opcao-cliente').textContent = clienteSelecionadoNome;
        document.getElementById('rel-data').value = formatoData.data;
        document.getElementById('rel-hora').value = formatoData.hora;
        document.getElementById('rel-codigo-gerado').textContent = codigoRelatorio;
        document.getElementById('rel-texto')?.blur();
        window.scrollTo(0, 0);
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
        mostrarApenasTela('tela-historico');
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
    document.getElementById('btn-fechar-visualizador')?.addEventListener('click', () => {
        if (operacaoEmCurso) return;
        mostrarApenasTela('tela-historico');
    });


    document.addEventListener('click', (event) => {
        const botao = event.target.closest('#btn-exportar-visualizador');
        if (!botao) return;

        if (!objetoAtividadeGlobal) {
            window.mostrarAlerta('Exportar PDF', 'Não foi possível carregar os dados desta visita. Feche e abra a visita novamente.');
            return;
        }

        prepararImpressaoVisualizador(
            objetoAtividadeGlobal,
            window._clienteVisualizadorAtual,
            objetoRelatorioGlobal
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
        mostrarApenasTela('tela-inicio');
        atualizarInterfaceVisitaAtual();
    });

    document.getElementById('btn-concluir-checkout')?.addEventListener('click', async () => {
        if (operacaoEmCurso || !checkoutPendenteGlobal?.atividadeId) return;

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
                    const assistenciaTecnica = {
                        ...(dadosAssistenciaDoRelatorio(relatorioAtual)),
                        acoesDefinidas: atAcoes,
                        conclusaoTecnica: atConclusao,
                        resultado: atResultado,
                        proximoPasso: atProximoPasso
                    };
                    const textoFinal = gerarResumoAssistenciaTecnica(assistenciaTecnica);
                    const historico = Array.isArray(relatorioAtual.historico) ? [...relatorioAtual.historico] : [];

                    if (relatorioAtual.textoAtual !== textoFinal) {
                        historico.push({
                            texto: textoFinal,
                            assistenciaTecnica,
                            etapa: 'checkout',
                            salvoEm: agora
                        });
                    }

                    dadosCheckout.resultado = atResultado;
                    dadosCheckout.resultadoAssistencia = atResultado;
                    dadosCheckout.acoesDefinidas = atAcoes;
                    dadosCheckout.conclusaoTecnica = atConclusao;
                    dadosCheckout.proximoPasso = atProximoPasso;
                    dadosCheckout.proximoPassoAssistencia = atProximoPasso;
                    atualizacaoRelatorio = {
                        ...dadosCheckout,
                        assistenciaTecnica,
                        textoAtual: textoFinal,
                        historico,
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
            mostrarApenasTela('tela-historico');
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
    document.getElementById('at-fotos')?.addEventListener('change', event => {
        const total = event.target.files?.length || 0;
        document.getElementById('at-fotos-status').textContent = total ? total + (total === 1 ? ' foto selecionada' : ' fotos selecionadas') : 'Use a câmera ou selecione imagens do aparelho';
    });

    document.getElementById('btn-voltar-relatorio')?.addEventListener('click', () => {
        if (operacaoEmCurso) return;

        const tipo = normalizarTipoVisita(objetoAtividadeGlobal || {});
        let alterado = false;
        if (tipo === ASSISTENCIA_TECNICA_TIPO) {
            const atual = normalizarAssistenciaComparacao(lerFormularioAssistencia());
            const salvo = normalizarAssistenciaComparacao(dadosAssistenciaDoRelatorio(objetoRelatorioGlobal));
            alterado = JSON.stringify(atual) !== JSON.stringify(salvo);
        } else {
            alterado = document.getElementById('rel-texto').value.trim() !== String(objetoRelatorioGlobal?.textoAtual || '').trim();
        }

        if (alterado) {
            window.mostrarConfirmacaoDescarteRelatorio(() => mostrarApenasTela('tela-inicio'));
            return;
        }
        mostrarApenasTela('tela-inicio');
    });

    document.getElementById('btn-salvar-relatorio')?.addEventListener('click', async () => {
        if (operacaoEmCurso) return;
        const btn = document.getElementById('btn-salvar-relatorio');

        try {
            const sessao = sessaoAtual(), atividadeId = atividadeSelecionadaId;
            if (!atividadeId || !objetoAtividadeGlobal) throw new Error('Abra uma visita em andamento antes de escrever o relatório.');

            const tipo = normalizarTipoVisita(objetoAtividadeGlobal);
            let assistenciaTecnica = null;
            let texto = '';

            if (tipo === ASSISTENCIA_TECNICA_TIPO) {
                assistenciaTecnica = lerFormularioAssistencia();
                if (!assistenciaTecnica.produto) throw new Error('Informe o produto verificado.');
                if (!assistenciaTecnica.queixa) throw new Error('Informe a queixa da assistência técnica.');
                if (!assistenciaTecnica.constatacoes) throw new Error('Registre as constatações técnicas.');
                texto = gerarResumoAssistenciaTecnica(assistenciaTecnica);
            } else {
                texto = document.getElementById('rel-texto').value.trim();
                if (!texto) throw new Error('Escreva um resumo antes de salvar.');
            }

            if (texto.length > 30000) throw new Error('O relatório deve ter até 30.000 caracteres.');

            const codigo = document.getElementById('rel-codigo-gerado').textContent;
            const textoBase = objetoRelatorioGlobal?.textoAtual ?? null;
            const novoIdRelatorio = gerarIdRelatorio(new Date(), nomeUsuarioLogado);

            operacaoEmCurso = true;
            btn.disabled = true;
            btn.textContent = 'Salvando...';

            const salvo = await runTransaction(db, async tx => {
                const atvRef = doc(db,'atividades',atividadeId), snap = await tx.get(atvRef);
                if (!snap.exists()) throw new Error('Visita não encontrada.');

                const atv = snap.data();
                validarResponsavel(atv,sessao);
                if (atv.status !== 'Em andamento') throw new Error('Só é possível salvar relatório de visita em andamento.');
                if (normalizarTipoVisita(atv) !== tipo) throw new Error('O tipo da visita foi alterado. Reabra o relatório.');

                const colecaoRelatorio = atv.relatorioId ? colecaoRelatorioDaAtividade(atv) : colecaoRelatorioPorTipo(tipo);
                const ref = doc(db, colecaoRelatorio, atv.relatorioId || novoIdRelatorio);
                const anterior = await tx.get(ref);
                const dados = anterior.exists() ? anterior.data() : null;

                if (dados && (dados.atividadeId !== atividadeId || dados.ptvId !== sessao.id)) throw new Error('O relatório não corresponde a esta visita.');
                if (dados && dados.textoAtual !== textoBase && dados.textoAtual !== texto) throw new Error('O relatório foi alterado em outra sessão. Volte ao Início e reabra o relatório antes de salvar.');

                const agora = new Date();
                const historico = Array.isArray(dados?.historico) ? [...dados.historico] : [];

                const mudouTexto = !dados || dados.textoAtual !== texto;
                const mudouEstrutura = tipo === ASSISTENCIA_TECNICA_TIPO &&
                    JSON.stringify(normalizarAssistenciaComparacao(dados?.assistenciaTecnica || {})) !== JSON.stringify(normalizarAssistenciaComparacao(assistenciaTecnica));

                if (mudouTexto || mudouEstrutura) {
                    historico.push({
                        texto,
                        ...(tipo === ASSISTENCIA_TECNICA_TIPO ? { assistenciaTecnica } : {}),
                        salvoEm: agora
                    });
                }

                const resultado = {
                    ...dados,
                    id:ref.id,
                    atividadeId,
                    clienteId:atv.clienteId,
                    ptvId:sessao.id,
                    tipoVisita:tipo,
                    codigo:dados?.codigo || codigo || '#' + atividadeId,
                    textoAtual:texto,
                    historico,
                    ...(tipo === ASSISTENCIA_TECNICA_TIPO ? { assistenciaTecnica } : {}),
                    criadoEm:dados?.criadoEm || agora,
                    atualizadoEm:agora
                };

                if (new TextEncoder().encode(JSON.stringify(resultado)).length > 800000) throw new Error('O histórico deste relatório está muito grande. Solicite o arquivamento das revisões antes de continuar.');

                tx.set(ref, resultado);
                tx.update(atvRef, { relatorioId:ref.id, relatorioColecao:ref.parent.id, atualizadoEm:agora });
                return { ...resultado, colecao: ref.parent.id };
            });

            if (!sessaoValida(sessao)) return;

            objetoRelatorioGlobal = salvo;
            objetoAtividadeGlobal.relatorioId = salvo.id;
            objetoAtividadeGlobal.relatorioColecao = salvo.colecao || colecaoRelatorioPorTipo(tipo);
            mostrarApenasTela('tela-inicio');
            atualizarInterfaceVisitaAtual();
        } catch (erro) {
            informarErro('Erro ao salvar relatório', erro);
        } finally {
            operacaoEmCurso = false;
            btn.disabled = false;
            btn.textContent = 'Salvar relatório';
        }
    });
}