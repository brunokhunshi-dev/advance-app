import { initializeApp } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js";
import { getFirestore, collection, query, where, getDocs, doc, updateDoc, getDoc, setDoc, limit } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js";
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
let listaGestores = [];
let nvClienteSelecionadoId = null;
let nvGestorSelecionadoId = null;
let hashCnpjNovoCliente = null;

// === INICIALIZAÇÃO E AUTENTICAÇÃO ===
document.addEventListener('DOMContentLoaded', () => {
    configurarNavegacao();
    configurarBotoesModal();
    configurarEventosGlobais();
    configurarTelaNovaVisita();
    configurarTelaCadastroCliente();

    const formLogin = document.getElementById('form-login');
    if (formLogin) {
        formLogin.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('login-email').value.trim();
            const senha = document.getElementById('login-senha').value;
            const btn = document.getElementById('btn-entrar');
            const erro = document.getElementById('login-erro');

            btn.disabled = true; btn.textContent = "A autenticar..."; erro.style.display = 'none';
            try {
                await signInWithEmailAndPassword(auth, email, senha);
            } catch (err) {
                erro.style.display = 'block';
                btn.disabled = false; btn.textContent = "Entrar";
            }
        });
    }

    const headerPrincipal = document.getElementById('header-principal');
    if (headerPrincipal) {
        headerPrincipal.addEventListener('click', () => {
            if(confirm("Deseja sair do aplicativo?")) signOut(auth);
        });
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
        } catch(e) {
            console.error("Erro ao validar perfil no banco:", e);
        }

        if(perfilEncontrado) {
            document.getElementById('tela-login').style.display = 'none';
            document.getElementById('app-container').style.display = 'flex';
            carregarAtividadesPendentes();
        } else {
            alert("Autenticado com sucesso, mas e-mail não encontrado nas coleções 'assistencia' ou 'promotores'."); 
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

// === FUNÇÕES DE LOCALIZAÇÃO E MATEMÁTICA ===
async function obterEnderecoPorCoords(lat, lng) {
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
        const data = await res.json();
        return data.display_name || "Endereço não encontrado na base de mapas.";
    } catch(e) {
        return "Erro ao traduzir coordenadas para endereço.";
    }
}

async function obterCoordsPorEndereco(endereco) {
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(endereco)}&limit=1`);
        const data = await res.json();
        if(data.length > 0) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
        return null;
    } catch(e) { return null; }
}

function calcularDistancia(lat1, lon1, lat2, lon2) {
    const R = 6371e3; 
    const rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad;
    const dLon = (lon2 - lon1) * rad;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * rad) * Math.cos(lat2 * rad) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; 
}

// === FUNÇÕES AUXILIARES DE DADOS ===
function formatarDataHoraPT(data) {
    if (!data) return { hora: "--:--", data: "--/--/----", completo: "--:-- | --/--/----" };
    const d = (data.toDate) ? data.toDate() : new Date(data);
    const horas = String(d.getHours()).padStart(2, '0'); const minutos = String(d.getMinutes()).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0'); const mes = String(d.getMonth() + 1).padStart(2, '0'); const ano = d.getFullYear();
    return { hora: `${horas}:${minutos}`, data: `${dia}/${mes}/${ano}`, completo: `${horas}:${minutos} | ${dia}/${mes}/${ano}` };
}

function formatarDataAgenda(data) {
    const d = (data.toDate) ? data.toDate() : new Date(data);
    const dia = String(d.getDate()).padStart(2, '0'); const meses = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
    return { diaMes: `${dia} - ${meses[d.getMonth()]}`, hora: `${String(d.getHours()).padStart(2, '0')}h${String(d.getMinutes()).padStart(2, '0')}` };
}

function obterIniciais(nome) { return nome.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 3); }

function ofuscarCNPJ(cnpjPuro) {
    const numero = BigInt(cnpjPuro); const primo = 999999937n;
    return "C-" + (numero * primo).toString(16).toUpperCase();
}

// === CONTROLO BLINDADO DE TROCA DE TELAS ===
function mostrarApenasTela(idTelaAlvo) {
    const telas = [
        'tela-inicio', 
        'tela-agenda', 
        'tela-historico', 
        'tela-nova-visita', 
        'tela-cadastro-cliente', 
        'tela-visita-atual', 
        'tela-relatorio'
    ];
    
    telas.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = (id === idTelaAlvo) ? 'block' : 'none';
    });

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
        const q = query(collection(db, "atividades"), where("ptvId", "==", idUsuarioLogado), where("status", "==", "Pendente"));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            areaVisitas.innerHTML = `<div style="text-align: center; margin-top: 40px;"><p style="color: #777;">Nenhuma visita pendente.</p></div>`; return;
        }

        let atividadesArray = [];
        querySnapshot.forEach(doc => { let d = doc.data(); d.id = doc.id; atividadesArray.push(d); });
        atividadesArray.sort((a, b) => (a.data.toDate ? a.data.toDate() : new Date(a.data)) - (b.data.toDate ? b.data.toDate() : new Date(b.data)));

        if (atividadesArray.length > 0) {
            const atividade = atividadesArray[0]; let nomeCliente = "Cliente Desconhecido";
            if (atividade.clienteId) {
                const clienteSnap = await getDoc(doc(db, "clientes", atividade.clienteId));
                if (clienteSnap.exists()) nomeCliente = clienteSnap.data().nome;
            }

            areaVisitas.innerHTML = `
                <div class="card-visita">
                    <div class="card-info">
                        <h3 class="card-titulo">${nomeCliente}</h3>
                        <a class="card-link" onclick="alert('Funcionalidade: Detalhes da Loja')">Ver informações</a>
                    </div>
                    <button class="btn-checkin" style="width: auto;" onclick="abrirConfirmacaoCheckin('${atividade.id}', '${nomeCliente}', '${atividade.clienteId}')">Check in</button>
                </div>
            `;
        }
    } catch (error) { console.error("Erro ao carregar pendentes:", error); }
}

async function carregarAgenda() {
    if (!idUsuarioLogado) return;
    const areaAgenda = document.getElementById('area-agenda');
    areaAgenda.innerHTML = `<p style="text-align: center; color: #777; margin-top: 20px;">A carregar agenda...</p>`;
    try {
        const q = query(collection(db, "atividades"), where("ptvId", "==", idUsuarioLogado), where("status", "==", "Pendente"));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) { areaAgenda.innerHTML = `<p style="text-align: center; color: #777; margin-top: 20px;">Nenhuma visita agendada.</p>`; return; }

        let atividadesArray = [];
        for (const documento of querySnapshot.docs) {
            let dados = documento.data(); dados.id = documento.id;
            if (dados.clienteId) {
                const clienteSnap = await getDoc(doc(db, "clientes", dados.clienteId));
                if (clienteSnap.exists()) {
                    dados.nomeCliente = clienteSnap.data().nome;
                    dados.enderecoCompleto = clienteSnap.data().enderecoCompleto || `Rua Principal, 100 - Centro - ${clienteSnap.data().cidade || 'Localidade'} - ${clienteSnap.data().uf || 'UF'}`;
                }
            } else { dados.nomeCliente = "Desconhecido"; dados.enderecoCompleto = "Não disponível"; }
            atividadesArray.push(dados);
        }

        atividadesArray.sort((a, b) => (a.data.toDate ? a.data.toDate() : new Date(a.data)) - (b.data.toDate ? b.data.toDate() : new Date(b.data)));
        areaAgenda.innerHTML = '';

        atividadesArray.forEach((atividade, index) => {
            const fData = formatarDataAgenda(atividade.data);
            const tituloSecao = index === 0 ? "Próxima visita" : (index === 1 ? "Nesse mês" : "");
            if (tituloSecao) areaAgenda.innerHTML += `<h2 class="section-subtitle">${tituloSecao}</h2>`;
            let botaoGpsHTML = index === 0 ? `<button class="btn-gps" onclick="window.open('https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(atividade.enderecoCompleto)}', '_blank')">Abrir no GPS</button>` : '';

            areaAgenda.innerHTML += `
                <div class="card-agenda">
                    <div class="agenda-header"><span class="agenda-data">${fData.diaMes}</span><span class="agenda-data-icon"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line><line x1="8" y1="14" x2="16" y2="14"></line><line x1="8" y1="18" x2="12" y2="18"></line></svg></span></div>
                    <div class="agenda-cliente">${atividade.nomeCliente}</div>
                    <div class="agenda-info-row"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>${fData.hora}</div>
                    <div class="agenda-info-row"><svg viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>${atividade.enderecoCompleto}</div>
                    <div class="agenda-motivo">${atividade.objetivo || "Visita de rotina"}</div>
                    ${botaoGpsHTML}
                </div>
            `;
        });
    } catch (error) { console.error("Erro na agenda:", error); }
}

async function carregarHistoricoVisitas() {
    if (!idUsuarioLogado) return;
    const areaHistorico = document.getElementById('area-historico-visitas');
    areaHistorico.innerHTML = `<p style="text-align: center; color: #777; margin-top: 20px;">A carregar histórico...</p>`;
    try {
        const q = query(collection(db, "atividades"), where("ptvId", "==", idUsuarioLogado), where("status", "==", "Concluída"), limit(10));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) { areaHistorico.innerHTML = `<p style="text-align: center; color: #777; margin-top: 20px;">Nenhuma visita concluída.</p>`; return; }

        let historicoArray = [];
        for (const documento of querySnapshot.docs) {
            let dados = documento.data(); dados.id = documento.id;
            if (dados.clienteId) {
                const clienteSnap = await getDoc(doc(db, "clientes", dados.clienteId));
                dados.nomeCliente = clienteSnap.exists() ? clienteSnap.data().nome : "Cliente Desconhecido";
            }
            historicoArray.push(dados);
        }

        historicoArray.sort((a, b) => (b.data.toDate ? b.data.toDate() : new Date(b.data)) - (a.data.toDate ? a.data.toDate() : new Date(a.data)));
        areaHistorico.innerHTML = '';
        
        historicoArray.forEach(visita => {
            const formato = formatarDataHoraPT(visita.data);
            areaHistorico.innerHTML += `
                <div class="card-historico">
                    <div><div class="hist-cliente">${visita.nomeCliente}</div><div class="hist-data">${formato.data} às ${formato.hora}</div></div>
                    <div><span class="hist-status">Concluída</span></div>
                </div>
            `;
        });
    } catch (error) { console.error("Erro no histórico:", error); }
}

// === TELA NOVA VISITA (Autocomplete) ===
function configurarTelaNovaVisita() {
    const inputNota = document.getElementById('nv-nota');
    const countNota = document.getElementById('nv-char-count');
    if(inputNota) {
        inputNota.addEventListener('input', () => { countNota.textContent = `${inputNota.value.length}/600`; });
    }

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
            divNovo.addEventListener('click', () => {
                mostrarApenasTela('tela-cadastro-cliente');
                dropCliente.style.display = 'none';
            });
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

    const inputGestor = document.getElementById('nv-gestor');
    const dropGestor = document.getElementById('nv-gestor-dropdown');
    if (inputGestor) {
        inputGestor.addEventListener('input', (e) => {
            dropGestor.innerHTML = ''; const txt = e.target.value.toLowerCase();
            const filtrados = listaGestores.filter(item => item.nome.toLowerCase().includes(txt));
            if (filtrados.length === 0) { dropGestor.innerHTML = '<div class="autocomplete-item" style="color:#999;">Nenhum resultado</div>'; } 
            else {
                filtrados.forEach(item => {
                    const div = document.createElement('div'); div.className = 'autocomplete-item'; div.textContent = item.nome;
                    div.addEventListener('click', () => { nvGestorSelecionadoId = item.id; inputGestor.value = item.nome; dropGestor.style.display = 'none'; });
                    dropGestor.appendChild(div);
                });
            }
            dropGestor.style.display = 'block';
        });
        inputGestor.addEventListener('focus', () => dropGestor.style.display = 'block');
        document.addEventListener('click', (e) => { if(!e.target.closest('#nv-gestor') && !e.target.closest('#nv-gestor-dropdown')) dropGestor.style.display = 'none'; });
    }

    const btnAgendar = document.getElementById('btn-agendar-visita');
    if (btnAgendar) {
        btnAgendar.addEventListener('click', async () => {
            if (!nvClienteSelecionadoId) { alert('Por favor, selecione um cliente válido da lista.'); return; }
            const dataVal = document.getElementById('nv-data').value; const horaVal = document.getElementById('nv-hora').value;
            if (!dataVal || !horaVal) { alert('Escolha a data e o horário da visita.'); return; }
            
            const motivoVal = document.getElementById('nv-motivo').value || "Visita de rotina";
            const notaVal = document.getElementById('nv-nota').value;
            const dataCompleta = new Date(`${dataVal}T${horaVal}:00`);
            
            btnAgendar.disabled = true; btnAgendar.textContent = "A agendar...";

            try {
                const novoId = "atv_" + Date.now();
                await setDoc(doc(db, "atividades", novoId), {
                    tipo: "Visita", data: dataCompleta, ptvId: idUsuarioLogado, clienteId: nvClienteSelecionadoId,
                    gestorEncarregadoId: nvGestorSelecionadoId || null, objetivo: motivoVal, nota: notaVal, status: "Pendente",
                    criadoEm: new Date(), atualizadoEm: new Date()
                });

                inputCliente.value = ""; nvClienteSelecionadoId = null; document.getElementById('nv-gestor').value = ""; nvGestorSelecionadoId = null;
                document.getElementById('nv-data').value = ""; document.getElementById('nv-hora').value = "";
                document.getElementById('nv-motivo').value = ""; document.getElementById('nv-nota').value = ""; countNota.textContent = "0/600";

                alert("Visita agendada com sucesso!");
                document.getElementById('btn-cancelar-visita').click();
                carregarAgenda();
            } catch (error) { alert("Falha ao agendar visita."); } finally { btnAgendar.disabled = false; btnAgendar.textContent = "Agendar"; }
        });
    }
}

async function carregarDadosParaAutocomplete() {
    try {
        const qCli = query(collection(db, "clientes"), where("status", "==", "Ativo"));
        const snapCli = await getDocs(qCli);
        listaClientes = []; snapCli.forEach(doc => listaClientes.push({ id: doc.id, nome: doc.data().nome }));

        const qProm = query(collection(db, "promotores"));
        const snapProm = await getDocs(qProm);
        listaGestores = []; snapProm.forEach(doc => { listaGestores.push({ id: doc.id, nome: doc.data().nome }); });
        
        const qAst = query(collection(db, "assistencia"));
        const snapAst = await getDocs(qAst);
        snapAst.forEach(doc => { listaGestores.push({ id: doc.id, nome: doc.data().nome }); });

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
                    alert("Esta loja já está na base de dados. Voltando ao agendamento.");
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

                // PRÉ-BUSCA AS COORDENADAS AQUI MESMO PARA SALVAR NO BANCO
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
        btnCancelarCliente.addEventListener('click', () => {
            mostrarApenasTela('tela-nova-visita');
        });
    }

    const btnSalvarCliente = document.getElementById('btn-salvar-cliente');
    if (btnSalvarCliente) {
        btnSalvarCliente.addEventListener('click', async () => {
            const nome = document.getElementById('cc-nome').value.trim(); const cidade = document.getElementById('cc-cidade').value.trim();
            if (!nome || !hashCnpjNovoCliente) { alert("Preencha um CNPJ válido e o nome da Loja."); return; }
            const btn = document.getElementById('btn-salvar-cliente'); btn.disabled = true; btn.textContent = "A salvar...";

            try {
                const enderecoCompleto = `${document.getElementById('cc-endereco').value}, ${document.getElementById('cc-numero').value} - ${document.getElementById('cc-bairro').value} - ${cidade} - ${document.getElementById('cc-uf').value}`;
                
                // Pega as coordenadas pré-carregadas ou tenta decifrar de última hora se estiverem vazias
                let latFinal = document.getElementById('cc-cep').dataset.lat || null;
                let lngFinal = document.getElementById('cc-cep').dataset.lng || null;

                if (!latFinal || !lngFinal) {
                    const coordsFallback = await obterCoordsPorEndereco(enderecoCompleto);
                    if (coordsFallback) {
                        latFinal = coordsFallback.lat;
                        lngFinal = coordsFallback.lng;
                    }
                }

                const novoClienteId = "cli_" + Date.now();
                await setDoc(doc(db, "clientes", novoClienteId), {
                    codigoCnpj: hashCnpjNovoCliente, 
                    nome: nome, 
                    cidade: cidade, 
                    uf: document.getElementById('cc-uf').value,
                    enderecoCompleto: enderecoCompleto, 
                    lat: latFinal ? parseFloat(latFinal) : null, 
                    lng: lngFinal ? parseFloat(lngFinal) : null, 
                    status: "Ativo", 
                    criadoEm: new Date(), 
                    atualizadoEm: new Date()
                });

                listaClientes.push({ id: novoClienteId, nome: nome }); nvClienteSelecionadoId = novoClienteId; document.getElementById('nv-cliente').value = nome;

                ['cc-cnpj','cc-nome','cc-cep','cc-endereco','cc-numero','cc-bairro','cc-cidade','cc-uf'].forEach(id => {
                    const el = document.getElementById(id);
                    if(el) el.value = "";
                });
                document.getElementById('mapa-container').style.display = 'none'; 
                document.getElementById('cc-status-cnpj').textContent = ""; 
                document.getElementById('cc-status-cep').textContent = "";

                alert("Loja salva com sucesso com geolocalização registada!");
                mostrarApenasTela('tela-nova-visita');
            } catch (error) { 
                console.error(error);
                alert("Falha ao salvar loja."); 
            } finally { 
                btn.disabled = false; 
                btn.textContent = "Salvar Loja"; 
            }
        });
    }
}

function configurarNavegacao() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach((item, index) => {
        item.addEventListener('click', function() {
            if (index === 3) { alert('Funcionalidade em desenvolvimento.'); return; }
            navItems.forEach(nav => nav.classList.remove('active')); 
            this.classList.add('active');
            
            if (index === 0) { mostrarApenasTela('tela-inicio'); carregarAtividadesPendentes(); } 
            else if (index === 1) { mostrarApenasTela('tela-agenda'); carregarAgenda(); } 
            else if (index === 2) { mostrarApenasTela('tela-historico'); carregarHistoricoVisitas(); }
        });
    });

    const btnNovaVisita = document.getElementById('btn-nova-visita');
    if (btnNovaVisita) {
        btnNovaVisita.addEventListener('click', () => {
            mostrarApenasTela('tela-nova-visita');
            carregarDadosParaAutocomplete(); 
            window.scrollTo(0, 0);
        });
    }

    const btnCancelarVisita = document.getElementById('btn-cancelar-visita');
    if (btnCancelarVisita) {
        btnCancelarVisita.addEventListener('click', () => {
            mostrarApenasTela('tela-agenda');
        });
    }
}

// === CHECK-IN E VISITA ===
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
    if (btnVoltar) {
        btnVoltar.addEventListener('click', () => { 
            document.getElementById('tela-confirmacao').style.display = 'none'; 
        });
    }
    
    const btnIniciar = document.getElementById('btn-iniciar');
    if (btnIniciar) {
        btnIniciar.addEventListener('click', () => {
            if (!atividadeSelecionadaId) return;
            btnIniciar.disabled = true; btnIniciar.textContent = "A obter localização...";
            
            if (navigator.geolocation) { 
                navigator.geolocation.getCurrentPosition(
                    (pos) => processarCheckin(pos.coords.latitude, pos.coords.longitude), 
                    (err) => { alert("GPS Obrigatório para fazer Check-in!"); btnIniciar.disabled = false; btnIniciar.textContent = "Iniciar"; }
                ); 
            } else { alert("Navegador não suporta GPS."); btnIniciar.disabled = false; btnIniciar.textContent = "Iniciar"; }
        });
    }
}

// LÓGICA MESTRA DE CHECK-IN: Geofencing Estrito de 500 Metros
async function processarCheckin(lat, lng) {
    const btnIniciar = document.getElementById('btn-iniciar');
    btnIniciar.textContent = "A validar distância...";

    try {
        const clienteSnap = await getDoc(doc(db, "clientes", clienteSelecionadoId));
        if(!clienteSnap.exists()) { throw new Error("Cliente não encontrado na base de dados."); }
        
        const dadosCli = clienteSnap.data();

        // Se por algum motivo antigo a loja não tiver lat/lng cadastrados, avisa o admin claramente
        if (!dadosCli.lat || !dadosCli.lng) {
            alert("Erro: Esta loja antiga não possui coordenadas geográficas cadastradas. Peça ao administrador para atualizar o cadastro da loja no painel.");
            btnIniciar.disabled = false; btnIniciar.textContent = "Iniciar";
            return;
        }

        // Validação Estrita da Cerca Virtual (500 Metros)
        const distanciaMetros = calcularDistancia(lat, lng, dadosCli.lat, dadosCli.lng);
        
        if (distanciaMetros > 500) {
            alert(`Acesso Bloqueado: Você está a ${Math.round(distanciaMetros)} metros de distância da loja. É necessário estar num raio máximo de 500 metros para realizar o Check-in.`);
            btnIniciar.disabled = false; btnIniciar.textContent = "Iniciar";
            return; 
        }

        // Se passou pela distância correta, efetua o check-in
        btnIniciar.textContent = "A registar morada...";
        const enderecoFisico = await obterEnderecoPorCoords(lat, lng);
        const coordGps = `${lat}, ${lng}`; 
        
        dataCheckinAtual = new Date(); 
        const atividadeRef = doc(db, "atividades", atividadeSelecionadaId);
        
        objetoAtividadeGlobal = { status: "Em andamento", checkinDataHora: dataCheckinAtual, checkinGps: coordGps, relatorioId: null }; 
        objetoRelatorioGlobal = null; 

        await updateDoc(atividadeRef, { 
            status: "Em andamento", 
            checkinDataHora: dataCheckinAtual, 
            checkinGps: coordGps, 
            checkinEndereco: enderecoFisico, 
            atualizadoEm: dataCheckinAtual 
        });

        document.getElementById('tela-confirmacao').style.display = 'none'; 
        btnIniciar.disabled = false; btnIniciar.textContent = "Iniciar";
        atualizarInterfaceVisitaAtual();
    } catch (error) { 
        console.error("Erro no checkin:", error); 
        alert("Falha ao processar o Check-in."); 
        btnIniciar.disabled = false; btnIniciar.textContent = "Iniciar"; 
    }
}

function atualizarInterfaceVisitaAtual() {
    mostrarApenasTela('tela-visita-atual');
    const objData = formatarDataHoraPT(objetoAtividadeGlobal.checkinDataHora);
    document.getElementById('va-nome-cliente').textContent = clienteSelecionadoNome; 
    document.getElementById('va-data').value = objData.data; 
    document.getElementById('va-hora').value = objData.hora;
    
    const areaTimeline = document.getElementById('va-area-timeline'); 
    const areaBotoes = document.getElementById('va-area-botoes');
    let htmlTimeline = `<div class="timeline-container"><div class="timeline-line"></div><div class="timeline-item"><div class="timeline-dot-gray"></div><div class="timeline-content"><div class="timeline-header"><strong>Check-in</strong><span>${objData.hora}</span></div><p class="timeline-desc">${nomeUsuarioLogado || 'Técnico'} chegou a ${clienteSelecionadoNome} às ${objData.hora}.</p></div></div>`;
    
    if (objetoRelatorioGlobal && objetoRelatorioGlobal.historico && objetoRelatorioGlobal.historico.length > 0) {
        const historico = objetoRelatorioGlobal.historico;
        historico.forEach((registro, index) => {
            const horaReg = formatarDataHoraPT(registro.salvoEm).hora; 
            const isLast = (index === historico.length - 1); 
            const dotClass = isLast ? 'timeline-dot-blue' : 'timeline-dot-gray';
            const titulo = (index === 0) ? 'Relatório adicionado' : 'Relatório atualizado'; 
            const acaoTxt = (index === 0) ? 'escreveu um relatório.' : 'atualizou o relatório.';
            
            htmlTimeline += `<div class="timeline-item"><div class="${dotClass}"></div><div class="timeline-content"><div class="timeline-header"><strong>${titulo}</strong><span>${horaReg}</span></div><p class="timeline-desc" ${isLast ? 'style="margin-bottom: 12px;"' : ''}>${nomeUsuarioLogado || 'Técnico'} ${acaoTxt}</p>${isLast ? '<button class="btn-outline-red" id="btn-ver-relatorio">Ver ou editar relatório</button>' : ''}</div></div>`;
        });
        areaBotoes.innerHTML = `<button class="btn-checkin" id="btn-encerrar-visita">Encerrar visita</button>`;
    } else { 
        areaBotoes.innerHTML = `<button class="btn-checkin" id="btn-escrever-relatorio">Escrever relatório</button>`; 
    }
    
    htmlTimeline += `</div>`; 
    areaTimeline.innerHTML = htmlTimeline; 
    reconfigurarBotoesVisitaAtual();
}

function reconfigurarBotoesVisitaAtual() {
    const btnEscrever = document.getElementById('btn-escrever-relatorio'); 
    const btnVerEditar = document.getElementById('btn-ver-relatorio'); 
    const btnEncerrar = document.getElementById('btn-encerrar-visita');

    const acaoAbrirRelatorio = () => {
        mostrarApenasTela('tela-relatorio');
        const formatoData = formatarDataHoraPT(objetoAtividadeGlobal.checkinDataHora || new Date()); 
        let codigoRelatorio = "";
        if (objetoRelatorioGlobal && objetoRelatorioGlobal.codigo) { 
            codigoRelatorio = objetoRelatorioGlobal.codigo; 
            document.getElementById('rel-texto').value = objetoRelatorioGlobal.textoAtual || ""; 
        } else { 
            const dataPura = new Date(); 
            codigoRelatorio = `#${dataPura.getFullYear()}${String(dataPura.getMonth() + 1).padStart(2, '0')}${String(dataPura.getDate()).padStart(2, '0')}${obterIniciais(nomeUsuarioLogado || 'TEC')}`;
            document.getElementById('rel-texto').value = ""; 
        }
        
        document.getElementById('rel-titulo-cliente').textContent = `Relatório - ${clienteSelecionadoNome}`; 
        document.getElementById('rel-opcao-cliente').textContent = clienteSelecionadoNome;
        document.getElementById('rel-data').value = formatoData.data; 
        document.getElementById('rel-hora').value = formatoData.hora; 
        document.getElementById('rel-codigo-gerado').textContent = codigoRelatorio; 
        window.scrollTo(0, 0);
    };

    if (btnEscrever) btnEscrever.addEventListener('click', acaoAbrirRelatorio); 
    if (btnVerEditar) btnVerEditar.addEventListener('click', acaoAbrirRelatorio);
    
    if (btnEncerrar) { 
        btnEncerrar.addEventListener('click', async () => { 
            if(confirm("Deseja realmente encerrar esta visita?")) { 
                btnEncerrar.disabled = true;
                btnEncerrar.textContent = "A obter GPS de Saída...";

                navigator.geolocation.getCurrentPosition(async (pos) => {
                    btnEncerrar.textContent = "A gravar encerramento...";
                    const lat = pos.coords.latitude;
                    const lng = pos.coords.longitude;
                    const coordGpsCheckout = `${lat}, ${lng}`;
                    const enderecoFisicoCheckout = await obterEnderecoPorCoords(lat, lng);

                    await updateDoc(doc(db, "atividades", atividadeSelecionadaId), { 
                        status: "Concluída", 
                        checkoutDataHora: new Date(),
                        checkoutGps: coordGpsCheckout,
                        checkoutEndereco: enderecoFisicoCheckout,
                        atualizadoEm: new Date() 
                    }); 
                    
                    alert("Visita encerrada com sucesso!"); 
                    window.location.reload(); 
                }, (err) => {
                    alert("É obrigatório permitir o GPS para realizar o Check-out e encerrar a visita.");
                    btnEncerrar.disabled = false; 
                    btnEncerrar.textContent = "Encerrar visita";
                });
            } 
        }); 
    }
}

function configurarEventosGlobais() {
    const btnVoltarRelatorio = document.getElementById('btn-voltar-relatorio');
    if (btnVoltarRelatorio) {
        btnVoltarRelatorio.addEventListener('click', () => { 
            mostrarApenasTela('tela-visita-atual');
        });
    }

    const btnSalvarRelatorio = document.getElementById('btn-salvar-relatorio');
    if (btnSalvarRelatorio) {
        btnSalvarRelatorio.addEventListener('click', async () => {
            const textoRelatorio = document.getElementById('rel-texto').value.trim(); 
            if(!textoRelatorio) { alert("Escreva algum resumo antes de salvar."); return; }
            
            const btnSalvar = document.getElementById('btn-salvar-relatorio'); 
            btnSalvar.disabled = true; 
            btnSalvar.textContent = "A salvar...";
            
            try {
                const dataAgora = new Date(); 
                const codigoGerado = document.getElementById('rel-codigo-gerado').textContent;

                if (!objetoRelatorioGlobal) {
                    const novoRelatorioId = "rel_" + Date.now();
                    objetoRelatorioGlobal = { 
                        id: novoRelatorioId, atividadeId: atividadeSelecionadaId, clienteId: clienteSelecionadoId, 
                        ptvId: idUsuarioLogado, codigo: codigoGerado, textoAtual: textoRelatorio, 
                        historico: [{ texto: textoRelatorio, salvoEm: dataAgora }], 
                        criadoEm: dataAgora, atualizadoEm: dataAgora 
                    };
                    await setDoc(doc(db, "relatorios", novoRelatorioId), objetoRelatorioGlobal); 
                    await updateDoc(doc(db, "atividades", atividadeSelecionadaId), { relatorioId: novoRelatorioId, atualizadoEm: dataAgora }); 
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

                mostrarApenasTela('tela-visita-atual');
                atualizarInterfaceVisitaAtual();
            } catch (error) { 
                console.error("Erro ao salvar relatório:", error);
                alert("Erro ao salvar."); 
            } finally { 
                btnSalvar.disabled = false; 
                btnSalvar.textContent = "Salvar relatório"; 
            }
        });
    }
}
