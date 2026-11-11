import { LIMITE_PARADAS, RAIO_VISITA_METROS, paradasDaVisita, referenciaInicialVisita, referenciaCheckout, exigirLocalizacaoVisita } from '../domain/visit-location.js';
import { colecaoCliente } from '../domain/identifiers.js';
import { normalizarTipoVisita, relatorioValidoParaCheckout, modulosComerciaisPendentes, camposAssistenciaPendentes, ASSISTENCIA_TECNICA_TIPO, dadosAssistenciaDoRelatorio, secoesAssistenciaParaDocumento } from '../domain/reports.js';
import { modulosTreinamentoPendentes } from '../domain/training.js';
import { serializarEstavel } from '../domain/formatters.js';
import { coordenadasValidas } from './location.js';
import { montarAuditoriaLocalizacao } from './location-audit.js';

export function createVisitService({ db, doc, runTransaction, serverTimestamp, exigirSessao, validarResponsavel, listarVisitasAbertas, referenciaRelatorio }) {
    async function checkin({ localizacao, id, clienteId, sessao, motivo = null, nome }) {
        const { lat, lng, accuracy, endereco } = localizacao;
        const abertas = await listarVisitasAbertas(sessao);
        exigirSessao(sessao);
        if (abertas.docs.some(d => d.id !== id)) throw new Error('Encerre a visita em andamento antes de iniciar outra.');
        return runTransaction(db, async tx => {
            const ref = doc(db, 'atividades', id), snap = await tx.get(ref);
            const cliente = await tx.get(doc(db, colecaoCliente(clienteId), clienteId));
            if (!snap.exists() || !cliente.exists()) throw new Error('Visita ou cliente não encontrado.');
            const atividade = snap.data(), dados = cliente.data();
            validarResponsavel(atividade, sessao);
            if (atividade.clienteId !== clienteId) throw new Error('O cliente da visita foi alterado. Atualize a tela.');
            if (atividade.status !== 'Pendente') throw new Error('Esta visita já foi iniciada ou encerrada. Atualize a tela.');
            const referencia = referenciaInicialVisita(dados);
            if (!motivo) {
                try { exigirLocalizacaoVisita(localizacao, [referencia], 'Faça o check-in a até 1 km do endereço da visita.'); }
                catch (erro) { erro.localizacao = localizacao; throw erro; }
            }
            const agora = new Date();
            const auditoria = montarAuditoriaLocalizacao({evento:'checkin', atividadeId:id, atividade:{...atividade, tipoVisita:normalizarTipoVisita(atividade)}, cliente:dados, sessao:{...sessao, nome}, localizacao, referencia, agora, modo:motivo ? 'manual' : 'normal', motivo, raioMetros:RAIO_VISITA_METROS});
            tx.update(ref, {status:'Em andamento', checkinDataHora:agora, localizacaoInicial:referencia,
                ...(motivo ? {checkinAnaliseStatus:'Pendente de análise', motivoCheckinManual:motivo, checkinSolicitadoEm:serverTimestamp(), checkinSolicitadoPor:sessao.id} : {}),
                checkinGps:localizacao.origem !== 'endereco_manual' && coordenadasValidas(lat,lng) ? `${lat}, ${lng}` : null,
                checkinGpsAccuracy:accuracy, checkinEndereco:endereco, atualizadoEm:agora,
                'auditoriaLocalizacao.checkin':{...auditoria, registradoServidorEm:serverTimestamp()}});
            return auditoria;
        });
    }
    async function salvarParada({ id, parada, sessao, registradoEm = new Date() }) {
        const ref = doc(db, 'atividades', id);
        return runTransaction(db, async tx => {
            exigirSessao(sessao);
            const snap = await tx.get(ref);
            if (!snap.exists()) throw new Error('Visita não encontrada.');
            const atividade = snap.data();
            exigirSessao(sessao);
            validarResponsavel(atividade, sessao);
            if (atividade.status !== 'Em andamento') throw new Error('A visita não está mais em andamento.');
            const existentes = paradasDaVisita(atividade);
            if (existentes.length >= LIMITE_PARADAS) throw new Error('Esta visita já tem três paradas registradas.');
            const novas = [...existentes, { ...parada, registradoEm }];
            tx.update(ref, { paradas: novas, atualizadoEm: serverTimestamp() });
            return novas;
        });
    }
    async function checkoutManual({atividadeId, sessao, localizacao, motivo, nome}) {
        return runTransaction(db, async tx => {
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
            const clienteSnap = atividade.clienteId ? await tx.get(doc(db, colecaoCliente(atividade.clienteId), atividade.clienteId)) : null;
            const clienteAtual = clienteSnap?.exists() ? clienteSnap.data() : null;
            const relatorio = relSnap.data();
            if (relatorio.atividadeId !== atividadeId || relatorio.ptvId !== sessao.id || !relatorioValidoParaCheckout(relatorio, normalizarTipoVisita(atividade))) throw new Error('O relatório não está válido.');

            const pendentes = modulosComerciaisPendentes(relatorio);
            if (pendentes.length) throw new Error('Conclua os módulos obrigatórios antes do fechamento: ' + pendentes.join(', ') + '.');
            if (normalizarTipoVisita(atividade) === 'Treinamento') {
                const treinoPendente = modulosTreinamentoPendentes(relatorio);
                if (treinoPendente.length) throw new Error('Conclua os módulos de treinamento antes do fechamento: ' + treinoPendente.join(', ') + '.');
            }
            if (normalizarTipoVisita(atividade) === ASSISTENCIA_TECNICA_TIPO) {
                const camposPendentes = camposAssistenciaPendentes(relatorio);
                if (camposPendentes.length) throw new Error('Conclua o relatório de assistência técnica: ' + camposPendentes.join(', ') + '.');
            }

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
            const auditoria = montarAuditoriaLocalizacao({
                evento:'checkout', modo:'manual', atividadeId,
                atividade:{...atividade, tipoVisita:normalizarTipoVisita(atividade)},
                cliente:clienteAtual, sessao:{...sessao,nome:nome},
                localizacao, referencia:atividade.localizacaoInicial ?? referenciaInicialVisita(clienteAtual),
                agora, motivo, raioMetros: RAIO_VISITA_METROS
            });
            tx.update(atvRef, { ...manual, status: 'Concluída',
                'auditoriaLocalizacao.checkout':{...auditoria, registradoServidorEm:serverTimestamp()} });
            tx.update(relRef, { ...manual });
            return auditoria;
        });
    }
    async function checkout({atividadeId, sessao, saida, tipo, modular, objetivo, oportunidade, atAcoes, atConclusao, atResultado, atProximoPasso, relatorioBase, draft, nome}) {
        return runTransaction(db, async tx => {
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
                // Releitura no commit garante coordenadas cadastradas atuais na auditoria.
                const clienteSnap = atividade.clienteId ? await tx.get(doc(db, colecaoCliente(atividade.clienteId), atividade.clienteId)) : null;
                const clienteAtual = clienteSnap?.exists() ? clienteSnap.data() : null;

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
                    if (serializarEstavel(relatorioAtual.dadosTreinamento) !== serializarEstavel(relatorioBase.dadosTreinamento)) throw new Error('O relatório foi alterado em outra sessão. Reabra o check-out.');
                }
                if (modular && serializarEstavel(relatorioAtual.dadosComerciais) !== serializarEstavel(relatorioBase.dadosComerciais)) throw new Error('O relatório foi alterado em outra sessão. Reabra o check-out.');

                const agora = new Date();
                const dadosCheckout = {
                    tipoVisita: tipo,
                    checkoutDataHora: agora,
                    checkoutGps: saida.origem !== 'endereco_manual' && coordenadasValidas(saida.lat,saida.lng) ? String(saida.lat) + ', ' + String(saida.lng) : null,
                    checkoutGpsAccuracy: saida.accuracy,
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
                    dadosCheckout.objetivo = relatorioAtual.dadosComerciais.goal;
                    dadosCheckout.feedback = draft?.feedback || [];
                    dadosCheckout.pendencia = draft?.pending || '';
                    atualizacaoRelatorio = {...dadosCheckout, atualizadoEm:agora, dadosComerciais:{...relatorioAtual.dadosComerciais, feedback:dadosCheckout.feedback, pending:dadosCheckout.pendencia}};
                } else {
                    dadosCheckout.objetivo = objetivo;
                    dadosCheckout.oportunidadeIdentificada = oportunidade;
                    atualizacaoRelatorio = { ...dadosCheckout, atualizadoEm: agora };
                }

                const auditoria = montarAuditoriaLocalizacao({
                    evento:'checkout', atividadeId, atividade:{...atividade, tipoVisita:tipo},
                    cliente:clienteAtual, sessao:{...sessao, nome:nome},
                    localizacao:saida, referencia:referenciaCheckout(atividade, clienteAtual, saida),
                    agora, raioMetros: RAIO_VISITA_METROS
                });
                tx.update(atvRef, { ...dadosCheckout, status: 'Concluída', atualizadoEm: agora,
                    'auditoriaLocalizacao.checkout':{...auditoria, registradoServidorEm:serverTimestamp()} });
                tx.update(relRef, atualizacaoRelatorio);
                return auditoria;
        });
    }
    return { checkin, salvarParada, checkout, checkoutManual };
}
