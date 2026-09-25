import { initializeApp } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js";
import { getFirestore, collection, query, where, getDocs, doc, updateDoc, getDoc, setDoc, deleteDoc, limit, addDoc, orderBy, writeBatch } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js";
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
let listaAtividadesAgenda = []; // Nova lista para edição de visitas
let nvClienteSelecionadoId = null;
let hashCnpjNovoCliente = null;
let callbackExclusaoAtual = null; // Callback para o modal de exclusão

// === INICIALIZAÇÃO E AUTENTICAÇÃO ===
document.addEventListener('DOMContentLoaded', () => {
    configurarNavegacao();
    configurarBotoesModal();
    configurarEventosGlobais();
    configurarTelaNovaVisita();
    configurarTelaCadastroCliente();
    configurarTelaDetalhesVisita();

    const formLogin = document.getElementById('form-login');
    if (formLogin) {
        formLogin.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('login-email').value.trim();
            const senha = document.getElementById('login-senha').value;
            const btn = document.getElementById('btn-entrar');
            const erro = document.getElementById('login-erro');

            btn.disabled = true; btn.textContent = "A autenticar..."; erro.style.display = 'none';
            try { await signInWithEmailAndPassword(auth, email, senha); } 
            catch (err) { erro.style.display = 'block'; btn.disabled = false; btn.textContent = "Entrar"; }
        });
    }

    const headerPrincipal = document.getElementById('header-principal');
    if (headerPrincipal) {
        headerPrincipal.addEventListener('click', () => { if(confirm("Deseja sair do aplicativo?")) signOut(auth); });
    }
});

onAuthStateChanged(auth, async (user) => {
    if (user) {
        let perfilEncontrado = false;
        try {
            let q = query(collection(db, "assistencia"), where("email", "==", user.email));
            let snap = await getDocs(q);
            if (!snap.empty) {
                idUsuarioLogado = snap.docs[0].id; nomeUsuarioLogado = snap.docs[0].data().nome; perfilUsuarioLogado = "Assistente"; perfilEncontrado = true;
            } else {
                q = query(collection(db, "promotores"), where("email", "==", user.email));
                snap = await getDocs(q);
                if (!snap.empty) {
                    idUsuarioLogado = snap.docs[0].id; nomeUsuarioLogado = snap.docs[0].data().nome; perfilUsuarioLogado = "Promotor"; perfilEncontrado = true;
                }
            }
        } catch(e) { console.error("Erro ao validar perfil no banco:", e); }

        if(perfilEncontrado) {
            document.getElementById('tela-login').style.display = 'none';
            document.getElementById('app-container').style.display = 'flex';
            carregarAtividadesPendentes();
        } else {
            window.mostrarAlerta("Erro de Acesso", "E-mail não encontrado nas coleções 'assistencia' ou 'promotores'."); 
            signOut(auth);
        }
    } else {
        document.getElementById('app-container').style.display = 'none'; 
        document.getElementById('tela-login').style.display = 'flex';
        idUsuarioLogado = null; nomeUsuarioLogado = null; perfilUsuarioLogado = null;
        const btnEntrar = document.getElementById('btn-entrar');
        if(btnEntrar) { btnEntrar.disabled = false; btnEntrar.textContent = "Entrar"; }
    }
});

// === FUNÇÕES DE ALERTA NATIVO ===
window.mostrarAlerta = function(titulo, msg) {
    document.getElementById('alerta-titulo').textContent = titulo;
    document.getElementById('alerta-msg').textContent = msg;
    document.getElementById('modal-alerta-generico').style.display = 'flex';
};
window.fecharAlerta = function() { document.getElementById('modal-alerta-generico').style.display = 'none'; };
window.mostrarAvisoAndamento = function() { document.getElementById('modal-aviso-andamento').style.display = 'flex'; };

window.mostrarConfirmacaoExclusao = function(callback) {
    callbackExclusaoAtual = callback;
    document.getElementById('modal-confirmar-exclusao').style.display = 'flex';
};
window.confirmarExclusao = function() {
    document.getElementById('modal-confirmar-exclusao').style.display = 'none';
    if(callbackExclusaoAtual) callbackExclusaoAtual();
};
window.fecharConfirmacaoExclusao = function() {
    document.getElementById('modal-confirmar-exclusao').style.display = 'none';
    callbackExclusaoAtual = null;
};

// === FUNÇÕES DE LOCALIZAÇÃO ===
async function obterEnderecoPorCoords(lat, lng) {
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
        const data = await res.json(); return data.display_name || "Endereço não encontrado na base de mapas.";
    } catch(e) { return "Erro ao traduzir coordenadas para endereço."; }
}
async function obterCoordsPorEndereco(endereco) {
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(endereco)}&limit=1`);
        const data = await res.json();
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
    if (!data) return { hora: "--:--", data: "--/--/----", dataInput: "", completo: "--:-- | --/--/----" };
    const d = (data.toDate) ? data.toDate() : new Date(data);
    const horas = String(d.getHours()).padStart(2, '0'); const minutos = String(d.getMinutes()).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0'); const mes = String(d.getMonth() + 1).padStart(2, '0'); const ano = d.getFullYear();
    return { hora: `${horas}:${minutos}`, data: `${dia}/${mes}/${ano}`, dataInput: `${ano}-${mes}-${dia}`, completo: `${horas}:${minutos} | ${dia}/${mes}/${ano}` };
}
function formatarDataAgenda(data) {
    const d = (data.toDate) ? data.toDate() : new Date(data);
    const dia = String(d.getDate()).padStart(2, '0'); const meses = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
    return { diaMes: `${dia} - ${meses[d.getMonth()]}`, hora: `${String(d.getHours()).padStart(2, '0')}h${String(d.getMinutes()).padStart(2, '0')}` };
}
function obterIniciais(nome) { return nome.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 3); }
function ofuscarCNPJ(cnpjPuro) { return "C-" + (BigInt(cnpjPuro) * 999999937n).toString(16).toUpperCase(); }
function escaparHtml(valor) {
    return String(valor ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
const GPS_ACCURACY_MAX_METERS = 150;

async function obterLocalizacaoAtual() {
    if (!navigator.geolocation) throw new Error("GPS não disponível neste dispositivo.");
    return new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
    });
}

async function obterClienteCache(clienteId) {
    if (!clienteId) return null;
    if (cacheClientes.has(clienteId)) return cacheClientes.get(clienteId);
    const clienteSnap = await getDoc(doc(db, "clientes", clienteId));
    const dados = clienteSnap.exists() ? { id: clienteSnap.id, ...clienteSnap.data() } : null;
    cacheClientes.set(clienteId, dados);
    return dados;
}

function mostrarApenasTela(idTelaAlvo) {
    const telas = ['tela-inicio', 'tela-agenda', 'tela-historico', 'tela-nova-visita', 'tela-cadastro-cliente', 'tela-visita-atual', 'tela-relatorio', 'tela-perfil', 'tela-detalhes-visita'];
    telas.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = (id === idTelaAlvo) ? 'block' : 'none'; });
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
    const areaVisitas = document.getElementById('area-visitas');
    try {
        const q = query(collection(db, "atividades"), where("ptvId", "==", idUsuarioLogado), where("status", "in", ["Pendente", "Em andamento"]));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            areaVisitas.innerHTML = `<div style="text-align: center; margin-top: 40px;"><p style="color: #777;">Nenhuma visita pendente.</p></div>`; return;
        }

        let atividadesArray = [];
        querySnapshot.forEach(doc => { let d = doc.data(); d.id = doc.id; atividadesArray.push(d); });
        atividadesArray.sort((a, b) => (a.data.toDate ? a.data.toDate() : new Date(a.data)) - (b.data.toDate ? b.data.toDate() : new Date(b.data)));

        if (atividadesArray.length > 0) {
            const atividade = atividadesArray[0]; 
            let nomeCliente = "Cliente Desconhecido";
            
            if (atividade.clienteId) {
                const clienteSnapData = await obterClienteCache(atividade.clienteId);
            if (clienteSnapData) nomeCliente = clienteSnapData.nome;
            }

            if (atividade.status === "Em andamento") {
                // Em vez de redirecionar para a tela "visita-atual", injetamos a timeline diretamente no ecrã "Início"
                atividadeSelecionadaId = atividade.id;
                clienteSelecionadoNome = nomeCliente;
                clienteSelecionadoId = atividade.clienteId;
                
                objetoAtividadeGlobal = {
                    status: atividade.status,
                    checkinDataHora: atividade.checkinDataHora || new Date(),
                    checkinGps: atividade.checkinGps,
                    relatorioId: atividade.relatorioId,
                    objetivo: atividade.objetivo || "Visita comercial"
                };

                // Verifica se já existe um relatório associado
                if (atividade.relatorioId) {
                    const snapRel = await getDoc(doc(db, "relatorios", atividade.relatorioId));
                    if (snapRel.exists()) objetoRelatorioGlobal = snapRel.data();
                } else {
                    objetoRelatorioGlobal = null;
                }

                const objData = formatarDataHoraPT(objetoAtividadeGlobal.checkinDataHora);
                
                let htmlTimeline = `
                <div class="card-visita-atual" style="margin-top: 10px;">
                    <h2 class="va-titulo">${nomeCliente}</h2>
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
                                <p class="timeline-desc">${nomeUsuarioLogado || 'Técnico'} chegou a ${nomeCliente} às ${objData.hora}.</p>
                            </div>
                        </div>`;
                
                let htmlBotoes = '';

                if (objetoRelatorioGlobal && objetoRelatorioGlobal.historico && objetoRelatorioGlobal.historico.length > 0) {
                    const historico = objetoRelatorioGlobal.historico;
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
                                <p class="timeline-desc" ${isLast ? 'style="margin-bottom: 12px;"' : ''}>${nomeUsuarioLogado || 'Técnico'} ${acaoTxt}</p>
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

                // Reconfigurar eventos dos botões recém-injetados
                const btnEscrever = document.getElementById('btn-escrever-relatorio-inicio'); 
                const btnVerEditar = document.getElementById('btn-ver-relatorio-inicio'); 
                const btnEncerrar = document.getElementById('btn-encerrar-visita-inicio');

                const acaoAbrirRelatorio = () => {
                    mostrarApenasTela('tela-relatorio');
                    const formatoData = formatarDataHoraPT(objetoAtividadeGlobal.checkinDataHora || new Date()); let codigoRelatorio = "";
                    if (objetoRelatorioGlobal && objetoRelatorioGlobal.codigo) { codigoRelatorio = objetoRelatorioGlobal.codigo; document.getElementById('rel-texto').value = objetoRelatorioGlobal.textoAtual || ""; 
                    } else { const dataPura = new Date(); codigoRelatorio = `#${dataPura.getFullYear()}${String(dataPura.getMonth() + 1).padStart(2, '0')}${String(dataPura.getDate()).padStart(2, '0')}${obterIniciais(nomeUsuarioLogado || 'TEC')}`; document.getElementById('rel-texto').value = ""; }
                    
                    document.getElementById('rel-titulo-cliente').textContent = `Relatório - ${clienteSelecionadoNome}`; document.getElementById('rel-opcao-cliente').textContent = clienteSelecionadoNome;
                    document.getElementById('rel-data').value = formatoData.data; document.getElementById('rel-hora').value = formatoData.hora; document.getElementById('rel-codigo-gerado').textContent = codigoRelatorio; window.scrollTo(0, 0);
                };

                if (btnEscrever) btnEscrever.addEventListener('click', acaoAbrirRelatorio); 
                if (btnVerEditar) btnVerEditar.addEventListener('click', acaoAbrirRelatorio);
                
                if (btnEncerrar) { 
                    btnEncerrar.addEventListener('click', async () => { 
                        window.mostrarConfirmacaoExclusao(async () => {
                            btnEncerrar.disabled = true; btnEncerrar.textContent = "A obter GPS de Saída...";
                            navigator.geolocation.getCurrentPosition(async (pos) => {
                                btnEncerrar.textContent = "A gravar encerramento...";
                                const lat = pos.coords.latitude; const lng = pos.coords.longitude; const accuracy = pos.coords.accuracy;
                                if (Number.isFinite(accuracy) && accuracy > GPS_ACCURACY_MAX_METERS) {
                                    window.mostrarAlerta("GPS impreciso", "A precisão atual é de aproximadamente " + Math.round(accuracy) + "m. Tente obter sinal melhor antes do check-out.");
                                    btnEncerrar.disabled = false;
                                    btnEncerrar.textContent = "Encerrar visita";
                                    return;
                                }
                                const coordGpsCheckout = `${lat}, ${lng}`;
                                const enderecoFisicoCheckout = await obterEnderecoPorCoords(lat, lng);

                                await updateDoc(doc(db, "atividades", atividadeSelecionadaId), { status: "Concluída", checkoutDataHora: new Date(), checkoutGps: coordGpsCheckout, checkoutGpsAccuracy: Number.isFinite(accuracy) ? accuracy : null, checkoutEndereco: enderecoFisicoCheckout, atualizadoEm: new Date() }); 
                                window.mostrarAlerta("Sucesso", "Visita encerrada com sucesso!"); setTimeout(() => window.location.reload(), 1500);
                            }, (err) => { window.mostrarAlerta("Erro", "GPS necessário para check-out."); btnEncerrar.disabled = false; btnEncerrar.textContent = "Encerrar visita"; });
                        });
                        document.querySelector('#modal-confirmar-exclusao h3').textContent = "Encerrar visita?";
                        document.querySelector('#modal-confirmar-exclusao p').textContent = "Tem certeza que deseja finalizar esta visita?";
                    }); 
                }

                return;
            }

            // Se for apenas "Pendente", mostra o card normal para clicar em Check-in
            areaVisitas.innerHTML = `
                <div class="card-visita">
                    <div class="card-info">
                        <h3 class="card-titulo">${escaparHtml(nomeCliente)}</h3>
                        <a class="card-link js-ver-detalhes-cliente">Ver informações</a>
                    </div>
                    <button class="btn-checkin js-checkin" style="width: auto;" data-atividade-id="${escaparHtml(atividade.id)}" data-cliente-id="${escaparHtml(atividade.clienteId)}" data-cliente-nome="${encodeURIComponent(nomeCliente)}">Check in</button>
                </div>
            `;
            areaVisitas.querySelector(".js-ver-detalhes-cliente")?.addEventListener("click", () => window.mostrarAlerta("Detalhes", "Acesso aos dados da loja em breve."));
            areaVisitas.querySelector(".js-checkin")?.addEventListener("click", (event) => {
                const botao = event.currentTarget;
                window.abrirConfirmacaoCheckin(botao.dataset.atividadeId, decodeURIComponent(botao.dataset.clienteNome || ""), botao.dataset.clienteId);
            });
        }
    } catch (error) { console.error("Erro ao carregar pendentes:", error); }
}

async function carregarAgenda() {
    if (!idUsuarioLogado) return;
    const areaAgenda = document.getElementById('area-agenda');
    areaAgenda.innerHTML = `<p style="text-align: center; color: #777; margin-top: 20px;">A carregar agenda...</p>`;
    try {
        // Inclui "Em andamento" na pesquisa
        const q = query(collection(db, "atividades"), where("ptvId", "==", idUsuarioLogado), where("status", "in", ["Pendente", "Em andamento"]));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) { areaAgenda.innerHTML = `<p style="text-align: center; color: #777; margin-top: 20px;">Nenhuma visita agendada.</p>`; return; }

        listaAtividadesAgenda = [];
        for (const documento of querySnapshot.docs) {
            let dados = documento.data(); dados.id = documento.id;
            if (dados.clienteId) {
                const clienteAgenda = await obterClienteCache(dados.clienteId);
                if (clienteAgenda) {
                    dados.nomeCliente = clienteAgenda.nome;
                    dados.enderecoCompleto = clienteAgenda.enderecoCompleto || ("Rua Principal, 100 - Centro - " + (clienteAgenda.cidade || "Localidade") + " - " + (clienteAgenda.uf || "UF"));
                }
            } else { dados.nomeCliente = "Desconhecido"; dados.enderecoCompleto = "Não disponível"; }
            listaAtividadesAgenda.push(dados);
        }

        listaAtividadesAgenda.sort((a, b) => (a.data.toDate ? a.data.toDate() : new Date(a.data)) - (b.data.toDate ? b.data.toDate() : new Date(b.data)));
        areaAgenda.innerHTML = '';

        listaAtividadesAgenda.forEach((atividade, index) => {
            const fData = formatarDataAgenda(atividade.data);
            const tituloSecao = index === 0 ? "Próxima visita" : (index === 1 ? "Nesse mês" : "");
            if (tituloSecao) areaAgenda.innerHTML += `<h2 class="section-subtitle">${tituloSecao}</h2>`;
            
            let botaoGpsHTML = index === 0 ? `<button class="btn-gps js-agenda-gps" data-endereco="${encodeURIComponent(atividade.enderecoCompleto)}">Abrir no GPS</button>` : "";
            const iconeFicha = `<button class="agenda-btn-ficha js-agenda-detalhes" data-index="${index}" title="Gerenciar Visita"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"></rect><rect x="6" y="8" width="4" height="4" rx="1"></rect><line x1="13" y1="9" x2="18" y2="9"></line><line x1="13" y1="12" x2="18" y2="12"></line><line x1="13" y1="15" x2="18" y2="15"></line></svg></button>`;
            
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
        areaAgenda.querySelectorAll(".js-agenda-gps").forEach((botao) => {
            botao.addEventListener("click", () => {
                const endereco = decodeURIComponent(botao.dataset.endereco || "");
                window.open("https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(endereco), "_blank");
            });
        });
        areaAgenda.querySelectorAll(".js-agenda-detalhes").forEach((botao) => {
            botao.addEventListener("click", () => window.abrirDetalhesVisita(Number(botao.dataset.index)));
        });
    } catch (error) { console.error("Erro na agenda:", error); }
}

async function carregarHistoricoVisitas() {
    if (!idUsuarioLogado) return;
    const areaHistorico = document.getElementById('area-historico-visitas');
    areaHistorico.innerHTML = `<p style="text-align: center; color: #777; margin-top: 20px;">A carregar histórico...</p>`;
    try {
        const q = query(collection(db, "atividades"), where("ptvId", "==", idUsuarioLogado), where("status", "==", "Concluída"), orderBy("data", "desc"), limit(10));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) { areaHistorico.innerHTML = `<p style="text-align: center; color: #777; margin-top: 20px;">Nenhuma visita concluída.</p>`; return; }

        let historicoArray = [];
        for (const documento of querySnapshot.docs) {
            let dados = documento.data(); dados.id = documento.id;
            if (dados.clienteId) {
                const clienteHistorico = await obterClienteCache(dados.clienteId);
            dados.nomeCliente = clienteHistorico?.nome || "Cliente Desconhecido";
            }
            historicoArray.push(dados);
        }

        historicoArray.sort((a, b) => (b.data.toDate ? b.data.toDate() : new Date(b.data)) - (a.data.toDate ? a.data.toDate() : new Date(a.data)));
        historicoArray = historicoArray.slice(0, 10);
        areaHistorico.innerHTML = '';
        
        historicoArray.forEach(visita => {
            const formato = formatarDataHoraPT(visita.data);
            areaHistorico.innerHTML += `
                <div class="card-historico">
                    <div><div class="hist-cliente">${escaparHtml(visita.nomeCliente)}</div><div class="hist-data">${formato.data} às ${formato.hora}</div></div>
                    <div><span class="hist-status">Concluída</span></div>
                </div>
            `;
        });
    } catch (error) { console.error("Erro no histórico:", error); }
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
            const filtrados = listaClientes.filter(item => item.nome.toLowerCase().includes(txt));

            const divNovo = document.createElement('div');
            divNovo.className = 'autocomplete-item autocomplete-item-novo';
            divNovo.textContent = `+ Cadastrar novo cliente`;
            divNovo.addEventListener('click', () => { mostrarApenasTela('tela-cadastro-cliente'); dropCliente.style.display = 'none'; });
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
            if (!nvClienteSelecionadoId) { window.mostrarAlerta("Atenção", "Selecione um cliente válido da lista."); return; }
            
            const dataVal = document.getElementById('nv-data').value; 
            const horaVal = document.getElementById('nv-hora').value;
            if (!dataVal || !horaVal || dataVal === "" || horaVal === "") { window.mostrarAlerta("Atenção", "Escolha a data e o horário."); return; }
            
            const tipoVisitaSelecionado = document.querySelector('input[name="tipoVisita"]:checked').value;
            const notaVal = document.getElementById('nv-nota').value;
            const dataCompleta = new Date(`${dataVal}T${horaVal}:00`);
            
            btnAgendar.disabled = true; btnAgendar.textContent = "A agendar...";

            try {
                const atividadeRefNova = await addDoc(collection(db, "atividades"), {
                    tipo: "Visita", data: dataCompleta, ptvId: idUsuarioLogado, clienteId: nvClienteSelecionadoId,
                    objetivo: tipoVisitaSelecionado, nota: notaVal, status: "Pendente",
                    criadoEm: new Date(), atualizadoEm: new Date()
                });

                inputCliente.value = ""; nvClienteSelecionadoId = null; 
                document.getElementById('nv-data').value = ""; document.getElementById('nv-data').type = 'text';
                document.getElementById('nv-hora').value = ""; document.getElementById('nv-hora').type = 'text';
                document.getElementById('nv-nota').value = ""; countNota.textContent = "0/600";
                document.querySelector('input[name="tipoVisita"][value="Visita comercial"]').checked = true;

                window.mostrarAlerta("Sucesso", "Visita agendada com sucesso!");
                mostrarApenasTela('tela-agenda');
                carregarAgenda();
            } catch (error) { window.mostrarAlerta("Erro", "Falha ao agendar visita."); } finally { btnAgendar.disabled = false; btnAgendar.textContent = "Agendar"; }
        });
    }
}

// === TELA 8: DETALHES DA VISITA ===
let visitaEmEdicao = null;

window.abrirDetalhesVisita = function(index) {
    visitaEmEdicao = listaAtividadesAgenda[index];
    const objData = formatarDataHoraPT(visitaEmEdicao.data);
    
    document.getElementById('det-protocolo').textContent = `#${visitaEmEdicao.id}`;
    document.getElementById('det-nome-cliente').textContent = visitaEmEdicao.nomeCliente;
    
    // Atualiza o iframe do Mapa
    document.getElementById('det-mapa-iframe').src = `https://maps.google.com/maps?q=${encodeURIComponent(visitaEmEdicao.enderecoCompleto)}&output=embed`;

    // Preenche inputs
    document.getElementById('det-data').value = objData.dataInput;
    document.getElementById('det-hora').value = objData.hora;
    document.getElementById('det-nota').value = visitaEmEdicao.nota || "";

    // Preenche radio buttons
    const objValue = visitaEmEdicao.objetivo || "Visita comercial";
    const rad = document.querySelector(`input[name="detTipoVisita"][value="${objValue}"]`);
    if(rad) rad.checked = true;

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
    document.getElementById('btn-voltar-detalhes').addEventListener('click', () => { mostrarApenasTela('tela-agenda'); });

    document.getElementById('btn-excluir-visita').addEventListener('click', () => {
        window.mostrarConfirmacaoExclusao(async () => {
            try {
                // 1. Salva uma cópia exata na Lixeira (nova coleção)
                const batchExclusao = writeBatch(db);
                batchExclusao.set(doc(db, "atividades_excluidas", visitaEmEdicao.id), {
                    ...visitaEmEdicao,
                    excluidoEm: new Date(),
                    excluidoPor: idUsuarioLogado
                });
                batchExclusao.delete(doc(db, "atividades", visitaEmEdicao.id));
                await batchExclusao.commit();
                
                window.mostrarAlerta("Sucesso", "Visita movida para a lixeira com sucesso.");
                mostrarApenasTela('tela-agenda');
                carregarAgenda();
            } catch (err) { window.mostrarAlerta("Erro", "Falha ao excluir visita."); }
        });
    });

    document.getElementById('btn-salvar-detalhes').addEventListener('click', async () => {
        const dataVal = document.getElementById('det-data').value; 
        const horaVal = document.getElementById('det-hora').value;
        const notaVal = document.getElementById('det-nota').value;
        const tipoVisita = document.querySelector('input[name="detTipoVisita"]:checked').value;
        
        if (!dataVal || !horaVal) { window.mostrarAlerta("Atenção", "Preencha a data e a hora."); return; }
        const dataCompleta = new Date(`${dataVal}T${horaVal}:00`);

        const btn = document.getElementById('btn-salvar-detalhes');
        btn.disabled = true; btn.textContent = "A salvar...";

        try {
            await updateDoc(doc(db, "atividades", visitaEmEdicao.id), {
                data: dataCompleta,
                objetivo: tipoVisita,
                nota: notaVal,
                atualizadoEm: new Date()
            });
            window.mostrarAlerta("Sucesso", "Visita atualizada.");
            mostrarApenasTela('tela-agenda');
            carregarAgenda();
        } catch (e) { window.mostrarAlerta("Erro", "Falha ao atualizar."); }
        finally { btn.disabled = false; btn.textContent = "Salvar"; }
    });
}

// === CADASTRO DE NOVO CLIENTE ===
async function carregarDadosParaAutocomplete() {
    if (clientesAutocompleteCarregados) return;
    try {
        const qCli = query(collection(db, "clientes"), where("status", "==", "Ativo"));
        const snapCli = await getDocs(qCli);
        listaClientes = []; snapCli.forEach(doc => listaClientes.push({ id: doc.id, nome: doc.data().nome }));
        clientesAutocompleteCarregados = true;
    } catch(e) { console.error("Erro dicionários:", e); }
}

function configurarTelaCadastroCliente() {
    const iptCnpj = document.getElementById('cc-cnpj');
    const iptCep = document.getElementById('cc-cep');
    const iptNumero = document.getElementById('cc-numero');

    if (iptCnpj) {
        iptCnpj.addEventListener('blur', async () => {
            const cnpjPuro = iptCnpj.value.replace(/\D/g, '');
            const lblStatus = document.getElementById('cc-status-cnpj');
            if (cnpjPuro.length === 14) {
                lblStatus.style.color = "var(--color-blue)"; lblStatus.textContent = " (Procurando...)";
                hashCnpjNovoCliente = ofuscarCNPJ(cnpjPuro);

                const q = query(collection(db, "clientes"), where("codigoCnpj", "==", hashCnpjNovoCliente));
                const querySnapshot = await getDocs(q);

                if (!querySnapshot.empty) {
                    lblStatus.style.color = "var(--color-red)"; lblStatus.textContent = " (Loja já registada!)";
                    window.mostrarAlerta("Atenção", "Esta loja já está na base de dados. Voltando ao agendamento.");
                    const clienteExistente = querySnapshot.docs[0];
                    nvClienteSelecionadoId = clienteExistente.id; document.getElementById('nv-cliente').value = clienteExistente.data().nome;
                    mostrarApenasTela('tela-nova-visita');
                    return;
                }

                try {
                    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpjPuro}`);
                    if (res.ok) {
                        const dados = await res.json();
                        document.getElementById('cc-nome').value = dados.nome_fantasia || dados.razao_social;
                        document.getElementById('cc-cep').value = (dados.cep || "").replace(/\D/g, '');
                        document.getElementById('cc-endereco').value = dados.logradouro || "";
                        document.getElementById('cc-numero').value = dados.numero || "";
                        document.getElementById('cc-bairro').value = dados.bairro || "";
                        document.getElementById('cc-cidade').value = dados.municipio || "";
                        document.getElementById('cc-uf').value = dados.uf || "";
                        lblStatus.style.color = "green"; lblStatus.textContent = " (Encontrado!)";

                        if (dados.logradouro && dados.municipio && dados.numero) {
                            const queryMap = `${dados.logradouro}, ${dados.numero} - ${dados.municipio} - ${dados.uf}`;
                            document.getElementById('mapa-iframe').src = `https://maps.google.com/maps?q=${encodeURIComponent(queryMap)}&output=embed`;
                            document.getElementById('mapa-container').style.display = 'block';
                        }
                    } else { throw new Error("CNPJ Inválido"); }
                } catch (error) { lblStatus.style.color = "var(--color-red)"; lblStatus.textContent = " (Não encontrado)"; }
            }
        });
    }

    if (iptCep) {
        iptCep.addEventListener('blur', async () => {
            const cepPuro = iptCep.value.replace(/\D/g, '');
            const lblStatus = document.getElementById('cc-status-cep');
            if (cepPuro.length === 8) {
                lblStatus.style.color = "var(--color-blue)"; lblStatus.textContent = " (Procurando...)";
                try {
                    const res = await fetch(`https://brasilapi.com.br/api/cep/v2/${cepPuro}`);
                    if (res.ok) {
                        const dados = await res.json();
                        document.getElementById('cc-endereco').value = dados.street || ""; 
                        document.getElementById('cc-bairro').value = dados.neighborhood || "";
                        document.getElementById('cc-cidade').value = dados.city || ""; 
                        document.getElementById('cc-uf').value = dados.state || "";
                        
                        if(dados.location && dados.location.coordinates) {
                            document.getElementById('cc-cep').dataset.lat = dados.location.coordinates.latitude;
                            document.getElementById('cc-cep').dataset.lng = dados.location.coordinates.longitude;
                        }
                        lblStatus.style.color = "green"; lblStatus.textContent = " (Encontrado!)";
                        document.getElementById('cc-numero').focus(); 
                    } else { throw new Error("CEP Inválido"); }
                } catch (error) { lblStatus.style.color = "var(--color-red)"; lblStatus.textContent = " (Não encontrado)"; }
            }
        });
    }

    if (iptNumero) {
        iptNumero.addEventListener('blur', async () => {
            const endereco = document.getElementById('cc-endereco').value; const num = iptNumero.value;
            const cidade = document.getElementById('cc-cidade').value; const uf = document.getElementById('cc-uf').value;
            if (endereco && num && cidade) {
                const queryMap = `${endereco}, ${num} - ${cidade} - ${uf}`;
                document.getElementById('mapa-iframe').src = `https://maps.google.com/maps?q=${encodeURIComponent(queryMap)}&output=embed`;
                document.getElementById('mapa-container').style.display = 'block';

                const coordsGeradas = await obterCoordsPorEndereco(queryMap);
                if (coordsGeradas) {
                    document.getElementById('cc-cep').dataset.lat = coordsGeradas.lat;
                    document.getElementById('cc-cep').dataset.lng = coordsGeradas.lng;
                }
            }
        });
    }

    const btnCancelarCliente = document.getElementById('btn-cancelar-cliente');
    if (btnCancelarCliente) {
        btnCancelarCliente.addEventListener('click', () => { mostrarApenasTela('tela-nova-visita'); });
    }

    const btnSalvarCliente = document.getElementById('btn-salvar-cliente');
    if (btnSalvarCliente) {
        btnSalvarCliente.addEventListener('click', async () => {
            const nome = document.getElementById('cc-nome').value.trim(); const cidade = document.getElementById('cc-cidade').value.trim();
            if (!nome || !hashCnpjNovoCliente) { window.mostrarAlerta("Atenção", "Preencha um CNPJ válido e o nome da Loja."); return; }
            const btn = document.getElementById('btn-salvar-cliente'); btn.disabled = true; btn.textContent = "A salvar...";

            try {
                const enderecoCompleto = `${document.getElementById('cc-endereco').value}, ${document.getElementById('cc-numero').value} - ${document.getElementById('cc-bairro').value} - ${cidade} - ${document.getElementById('cc-uf').value}`;
                let latFinal = document.getElementById('cc-cep').dataset.lat || null; let lngFinal = document.getElementById('cc-cep').dataset.lng || null;

                if (!latFinal || !lngFinal) {
                    const coordsFallback = await obterCoordsPorEndereco(enderecoCompleto);
                    if (coordsFallback) { latFinal = coordsFallback.lat; lngFinal = coordsFallback.lng; }
                }

                const novoClienteRef = await addDoc(collection(db, "clientes"), {
                    codigoCnpj: hashCnpjNovoCliente, nome: nome, cidade: cidade, uf: document.getElementById('cc-uf').value,
                    enderecoCompleto: enderecoCompleto, lat: latFinal ? parseFloat(latFinal) : null, lng: lngFinal ? parseFloat(lngFinal) : null, 
                    status: "Ativo", criadoEm: new Date(), atualizadoEm: new Date()
                });

                const novoClienteId = novoClienteRef.id;
                listaClientes.push({ id: novoClienteId, nome: nome });
                cacheClientes.set(novoClienteId, { id: novoClienteId, nome, cidade, uf: document.getElementById("cc-uf").value, enderecoCompleto });
                nvClienteSelecionadoId = novoClienteId; document.getElementById('nv-cliente').value = nome;

                ['cc-cnpj','cc-nome','cc-cep','cc-endereco','cc-numero','cc-bairro','cc-cidade','cc-uf'].forEach(id => { const el = document.getElementById(id); if(el) el.value = ""; });
                document.getElementById('mapa-container').style.display = 'none'; 
                document.getElementById('cc-status-cnpj').textContent = ""; document.getElementById('cc-status-cep').textContent = "";

                window.mostrarAlerta("Sucesso", "Loja salva com geolocalização registada!");
                mostrarApenasTela('tela-nova-visita');
            } catch (error) { window.mostrarAlerta("Erro", "Falha ao salvar loja."); } finally { btn.disabled = false; btn.textContent = "Salvar Loja"; }
        });
    }
}

// === NAVEGAÇÃO PRINCIPAL ===
function configurarNavegacao() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach((item, index) => {
        item.addEventListener('click', function() {
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
            mostrarApenasTela('tela-nova-visita');
            carregarDadosParaAutocomplete(); window.scrollTo(0, 0);
        });
    }

    const btnCancelarVisita = document.getElementById('btn-cancelar-visita');
    if (btnCancelarVisita) {
        btnCancelarVisita.addEventListener('click', () => { mostrarApenasTela('tela-agenda'); });
    }
}

// === CHECK-IN ===
window.abrirConfirmacaoCheckin = function(atividadeId, clienteNome, clienteId) {
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
    const btnVoltar = document.getElementById('btn-voltar');
    if (btnVoltar) { btnVoltar.addEventListener('click', () => { document.getElementById('tela-confirmacao').style.display = 'none'; }); }
    
    const btnIniciar = document.getElementById('btn-iniciar');
    if (btnIniciar) {
        btnIniciar.addEventListener('click', () => {
            if (!atividadeSelecionadaId) return;
            btnIniciar.disabled = true; btnIniciar.textContent = "A obter localização...";
            
            obterLocalizacaoAtual()
                .then((pos) => processarCheckin(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy))
                .catch(() => {
                    window.mostrarAlerta("Erro", "GPS obrigatório para fazer Check-in.");
                    btnIniciar.disabled = false;
                    btnIniciar.textContent = "Iniciar";
                });
        });
    }
}

async function processarCheckin(lat, lng, accuracy = null) {
    if (Number.isFinite(accuracy) && accuracy > GPS_ACCURACY_MAX_METERS) {
        window.mostrarAlerta("GPS impreciso", "A precisão atual é de aproximadamente " + Math.round(accuracy) + "m. Tente obter sinal de GPS melhor antes de iniciar a visita.");
        const btn = document.getElementById("btn-iniciar");
        btn.disabled = false; btn.textContent = "Iniciar";
        return;
    }
    const btnIniciar = document.getElementById('btn-iniciar');
    btnIniciar.textContent = "A validar distância...";

    try {
        const clienteSnap = await getDoc(doc(db, "clientes", clienteSelecionadoId));
        if(!clienteSnap.exists()) { throw new Error("Cliente não encontrado."); }
        const dadosCli = clienteSnap.data();

        if (!dadosCli.lat || !dadosCli.lng) {
            window.mostrarAlerta("Erro", "Esta loja não possui coordenadas geográficas cadastradas. Atualize o cadastro.");
            btnIniciar.disabled = false; btnIniciar.textContent = "Iniciar"; return;
        }

        const distanciaMetros = calcularDistancia(lat, lng, dadosCli.lat, dadosCli.lng);
        if (distanciaMetros > 500) {
            window.mostrarAlerta("Acesso Bloqueado", `Você está a ${Math.round(distanciaMetros)}m da loja. É necessário estar a 500m.`);
            btnIniciar.disabled = false; btnIniciar.textContent = "Iniciar"; return; 
        }

        btnIniciar.textContent = "A registar morada...";
        const enderecoFisico = await obterEnderecoPorCoords(lat, lng);
        const coordGps = `${lat}, ${lng}`; 
        
        dataCheckinAtual = new Date(); 
        const atividadeRef = doc(db, "atividades", atividadeSelecionadaId);
        
        const snapAtv = await getDoc(atividadeRef);
        let tipoAssistCadastrado = "Visita comercial";
        if (snapAtv.exists()) { tipoAssistCadastrado = snapAtv.data().objetivo || "Visita comercial"; }

        objetoAtividadeGlobal = { status: "Em andamento", checkinDataHora: dataCheckinAtual, checkinGps: coordGps, relatorioId: null, objetivo: tipoAssistCadastrado }; 
        objetoRelatorioGlobal = null; 

        await updateDoc(atividadeRef, { status: "Em andamento", checkinDataHora: dataCheckinAtual, checkinGps: coordGps, checkinGpsAccuracy: Number.isFinite(accuracy) ? accuracy : null, checkinEndereco: enderecoFisico, atualizadoEm: dataCheckinAtual });

        document.getElementById('tela-confirmacao').style.display = 'none'; 
        btnIniciar.disabled = false; btnIniciar.textContent = "Iniciar";
        atualizarInterfaceVisitaAtual();
    } catch (error) { 
        console.error("Erro no checkin:", error); window.mostrarAlerta("Erro", "Falha ao processar o Check-in."); 
        btnIniciar.disabled = false; btnIniciar.textContent = "Iniciar"; 
    }
}

function atualizarInterfaceVisitaAtual() {
    const objData = formatarDataHoraPT(objetoAtividadeGlobal.checkinDataHora);
    
    const areaVisitas = document.getElementById('area-visitas');
    
    let htmlTimeline = `
    <div class="card-visita-atual" style="margin-top: 10px;">
        <h2 class="va-titulo">${clienteSelecionadoNome}</h2>
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
                    <p class="timeline-desc">${nomeUsuarioLogado || 'Técnico'} chegou a ${clienteSelecionadoNome} às ${objData.hora}.</p>
                </div>
            </div>`;
    
    let htmlBotoes = '';

    if (objetoRelatorioGlobal && objetoRelatorioGlobal.historico && objetoRelatorioGlobal.historico.length > 0) {
        const historico = objetoRelatorioGlobal.historico;
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
                    <p class="timeline-desc" ${isLast ? 'style="margin-bottom: 12px;"' : ''}>${nomeUsuarioLogado || 'Técnico'} ${acaoTxt}</p>
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
        mostrarApenasTela('tela-relatorio');
        const formatoData = formatarDataHoraPT(objetoAtividadeGlobal.checkinDataHora || new Date()); let codigoRelatorio = "";
        if (objetoRelatorioGlobal && objetoRelatorioGlobal.codigo) { codigoRelatorio = objetoRelatorioGlobal.codigo; document.getElementById('rel-texto').value = objetoRelatorioGlobal.textoAtual || ""; 
        } else { const dataPura = new Date(); codigoRelatorio = `#${dataPura.getFullYear()}${String(dataPura.getMonth() + 1).padStart(2, '0')}${String(dataPura.getDate()).padStart(2, '0')}${obterIniciais(nomeUsuarioLogado || 'TEC')}`; document.getElementById('rel-texto').value = ""; }
        
        document.getElementById('rel-titulo-cliente').textContent = `Relatório - ${clienteSelecionadoNome}`; document.getElementById('rel-opcao-cliente').textContent = clienteSelecionadoNome;
        document.getElementById('rel-data').value = formatoData.data; document.getElementById('rel-hora').value = formatoData.hora; document.getElementById('rel-codigo-gerado').textContent = codigoRelatorio; window.scrollTo(0, 0);
    };

    if (btnEscrever) btnEscrever.addEventListener('click', acaoAbrirRelatorio); 
    if (btnVerEditar) btnVerEditar.addEventListener('click', acaoAbrirRelatorio);
    
    if (btnEncerrar) { 
        btnEncerrar.addEventListener('click', async () => { 
            window.mostrarConfirmacaoExclusao(async () => {
                btnEncerrar.disabled = true; btnEncerrar.textContent = "A obter GPS de Saída...";
                navigator.geolocation.getCurrentPosition(async (pos) => {
                    btnEncerrar.textContent = "A gravar encerramento...";
                    const lat = pos.coords.latitude; const lng = pos.coords.longitude; const accuracy = pos.coords.accuracy;
                                if (Number.isFinite(accuracy) && accuracy > GPS_ACCURACY_MAX_METERS) {
                                    window.mostrarAlerta("GPS impreciso", "A precisão atual é de aproximadamente " + Math.round(accuracy) + "m. Tente obter sinal melhor antes do check-out.");
                                    btnEncerrar.disabled = false;
                                    btnEncerrar.textContent = "Encerrar visita";
                                    return;
                                }
                    const coordGpsCheckout = `${lat}, ${lng}`;
                    const enderecoFisicoCheckout = await obterEnderecoPorCoords(lat, lng);

                    await updateDoc(doc(db, "atividades", atividadeSelecionadaId), { status: "Concluída", checkoutDataHora: new Date(), checkoutGps: coordGpsCheckout, checkoutGpsAccuracy: Number.isFinite(accuracy) ? accuracy : null, checkoutEndereco: enderecoFisicoCheckout, atualizadoEm: new Date() }); 
                    window.mostrarAlerta("Sucesso", "Visita encerrada com sucesso!"); setTimeout(() => window.location.reload(), 1500);
                }, (err) => { window.mostrarAlerta("Erro", "GPS necessário para check-out."); btnEncerrar.disabled = false; btnEncerrar.textContent = "Encerrar visita"; });
            });
            document.querySelector('#modal-confirmar-exclusao h3').textContent = "Encerrar visita?";
            document.querySelector('#modal-confirmar-exclusao p').textContent = "Tem certeza que deseja finalizar esta visita?";
        }); 
    }
}

function configurarEventosGlobais() {
    const btnVoltarRelatorio = document.getElementById('btn-voltar-relatorio');
    if (btnVoltarRelatorio) {
        btnVoltarRelatorio.addEventListener('click', () => { 
            mostrarApenasTela('tela-inicio');
        });
    }

    const btnSalvarRelatorio = document.getElementById('btn-salvar-relatorio');
    if (btnSalvarRelatorio) {
        btnSalvarRelatorio.addEventListener('click', async () => {
            const textoRelatorio = document.getElementById('rel-texto').value.trim(); 
            if(!textoRelatorio) { window.mostrarAlerta("Atenção", "Escreva um resumo antes de salvar."); return; }
            
            const btnSalvar = document.getElementById('btn-salvar-relatorio'); 
            btnSalvar.disabled = true; btnSalvar.textContent = "A salvar...";
            
            try {
                const dataAgora = new Date(); const codigoGerado = document.getElementById('rel-codigo-gerado').textContent;

                if (!objetoRelatorioGlobal) {
                    const novoRelatorioId = "rel_" + crypto.randomUUID();
                    objetoRelatorioGlobal = { 
                        id: novoRelatorioId, atividadeId: atividadeSelecionadaId, clienteId: clienteSelecionadoId, 
                        ptvId: idUsuarioLogado, codigo: codigoGerado, textoAtual: textoRelatorio, 
                        historico: [{ texto: textoRelatorio, salvoEm: dataAgora }], 
                        criadoEm: dataAgora, atualizadoEm: dataAgora 
                    };
                    const batchRelatorio = writeBatch(db);
                    batchRelatorio.set(doc(db, "relatorios", novoRelatorioId), objetoRelatorioGlobal);
                    batchRelatorio.update(doc(db, "atividades", atividadeSelecionadaId), { relatorioId: novoRelatorioId, atualizadoEm: dataAgora });
                    await batchRelatorio.commit(); 
                    objetoAtividadeGlobal.relatorioId = novoRelatorioId;
                } else {
                    const novoRegistro = { texto: textoRelatorio, salvoEm: dataAgora };
                    objetoRelatorioGlobal.historico.push(novoRegistro); 
                    objetoRelatorioGlobal.textoAtual = textoRelatorio; 
                    objetoRelatorioGlobal.atualizadoEm = dataAgora;
                    await updateDoc(doc(db, "relatorios", objetoRelatorioGlobal.id), { 
                        textoAtual: textoRelatorio, historico: objetoRelatorioGlobal.historico, atualizadoEm: dataAgora 
                    });
                }

                mostrarApenasTela('tela-inicio');
                atualizarInterfaceVisitaAtual();
            } catch (error) { 
                console.error("Erro ao salvar relatório:", error);
                window.mostrarAlerta("Erro", "Erro ao salvar."); 
            } finally { 
                btnSalvar.disabled = false; 
                btnSalvar.textContent = "Salvar relatório"; 
            }
        });
    }
}