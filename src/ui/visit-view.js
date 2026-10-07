import { resumoTreinamento } from '../domain/training.js';
import { renderTrainingSummary } from './training-report.js';
import {nomeProduto} from '../domain/products.js';
import { formatarDataCheckout, formatarHoraCheckout, formatarDuracaoVisita, formatarDataHoraPT, escaparHtml } from '../domain/formatters.js';
import { obterResultadoHistorico, obterClasseResultadoHistorico } from '../domain/history.js';
import { normalizarTipoVisita, dadosAssistenciaDoRelatorio, ASSISTENCIA_TECNICA_TIPO, blocosPersistidosRelatorio } from '../domain/reports.js';
import { renderFichaAssistencia } from './assistance.js';
import { reportMarkup } from '../../technical-report-editor.js';
import { motivoCancelamentoTexto } from '../domain/cancellation.js';

export function formatarProtocoloVisualizador(valor, fallback) {
    const bruto = String(valor || fallback || '').trim();
    if (!bruto) return '#...';
    return bruto.startsWith('#') ? bruto : '#' + bruto;
}

export function preencherCampoVisualizador(id, valor, fallback = 'Não informado') {
    const el = document.getElementById(id);
    if (el) el.textContent = valor == null || String(valor).trim() === '' ? fallback : String(valor);
}

export function formatarGpsVisualizador(gps, accuracy) {
    const texto = gps ? String(gps) : 'GPS não informado';
    const precisao = Number.isFinite(Number(accuracy)) ? ' • Precisão: ' + Math.round(Number(accuracy)) + ' m' : '';
    return texto + precisao;
}

export function preencherCelulaPdf(id, valor) {
    const el = document.getElementById(id);
    if (el) el.textContent = valor == null || String(valor).trim() === '' ? '—' : String(valor);
}

export function resumoComercial(relatorio) {
    const data = relatorio?.dadosComerciais;
    if (data?.versao !== 1) return [];
    const answers = [['Estoque baixo','low'],['Falta de produto','missing'],['Produto com baixo giro','slow']];
    return [
        ['Nome',data.name],['Cargo',data.role],['Objetivo principal',data.goal],
        ...answers.map(([label,key]) => [label, [data[key], ...(data[key] === 'Sim' ? (data.products?.[key] || []).map(nomeProduto) : [])].filter(Boolean).join(' · ')]),
        ['Exposição e materiais',data.organization],['Materiais',(data.materials || []).join(', ')],['Outro material',data.other],
        ['Feedback',(data.feedback || []).join(', ')],['Pendência',data.pending]
    ];
}

export function prepararImpressaoVisualizador(atividade, cliente, relatorio, nomeUsuarioLogado) {
    const resultado = obterResultadoHistorico(atividade);
    const tipo = normalizarTipoVisita(atividade);

    preencherCelulaPdf('pdf-status', resultado.toUpperCase());
    preencherCelulaPdf('pdf-cliente', cliente?.nome);
    preencherCelulaPdf('pdf-protocolo', formatarProtocoloVisualizador(relatorio?.codigo, atividade.id));
    preencherCelulaPdf('pdf-tipo', tipo);
    preencherCelulaPdf('pdf-tecnico', nomeUsuarioLogado);
    preencherCelulaPdf('pdf-endereco', cliente?.enderecoCompleto);
    const cancelamentoPdf = document.getElementById('pdf-cancelamento-table');
    if (cancelamentoPdf) cancelamentoPdf.style.display = atividade.status === 'Cancelada' ? 'table' : 'none';
    preencherCelulaPdf('pdf-motivo-cancelamento', motivoCancelamentoTexto(atividade));
    preencherCelulaPdf('pdf-cancelamento-data', atividade.canceladoEm ? formatarDataHoraPT(atividade.canceladoEm).completo : null);

    preencherCelulaPdf('pdf-chegada-data', formatarDataCheckout(atividade.checkinDataHora));
    preencherCelulaPdf('pdf-chegada-hora', formatarHoraCheckout(atividade.checkinDataHora));
    preencherCelulaPdf('pdf-saida-data', formatarDataCheckout(atividade.checkoutDataHora));
    preencherCelulaPdf('pdf-saida-hora', formatarHoraCheckout(atividade.checkoutDataHora));
    preencherCelulaPdf('pdf-duracao', formatarDuracaoVisita(atividade.checkinDataHora, atividade.checkoutDataHora));

    const tecnica = document.getElementById('pdf-tecnica-table');
    const treinamento = document.getElementById('pdf-treinamento-table');
    const assistencia = document.getElementById('pdf-assistencia-table');

    tecnica.style.display = tipo === 'Visita comercial' ? 'table' : 'none';
    treinamento.style.display = tipo === 'Treinamento' && !relatorio?.dadosTreinamento ? 'table' : 'none';
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
    const comercial = resumoComercial(relatorio);
    preencherCelulaPdf('pdf-relatorio', comercial.length ? [...comercial.map(([label,value]) => label + ': ' + (value || 'Não informado')), 'Relatório livre: ' + (relatorio.textoAtual || 'Nenhum relato registrado.')].join('\n') : relatorio?.textoAtual);
    if (relatorio?.dadosTreinamento?.versao === 1) preencherCelulaPdf('pdf-relatorio', resumoTreinamento(relatorio.dadosTreinamento).map(([title, fields]) => title + '\n' + fields.map(([label, value]) => label + ': ' + (value === '' || value == null ? 'Não informado' : value)).join('\n')).join('\n\n') + '\n\nRelatório livre: ' + (relatorio.textoAtual || 'Nenhum relato registrado.'));
    const relatorioTextoTable = document.getElementById('pdf-relatorio-texto-table');
    if (relatorioTextoTable) relatorioTextoTable.style.display = tipo === ASSISTENCIA_TECNICA_TIPO ? 'none' : 'table';

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

export function renderizarVisualizadorVisita(atividade, cliente, relatorio) {
    const cancelada = atividade.status === 'Cancelada';
    const semVisita = cancelada && !atividade.checkinDataHora;
    const mostrarRelatorio = !cancelada || Boolean(relatorio);
    preencherCampoVisualizador('visu-titulo', cancelada ? semVisita ? 'Agendamento cancelado' : 'Atividade cancelada' : 'Sua visita');
    const cancelamento = document.getElementById('visu-cancelamento');
    if (cancelamento) cancelamento.hidden = !cancelada;
    preencherCampoVisualizador('visu-motivo-cancelamento', motivoCancelamentoTexto(atividade));
    preencherCampoVisualizador('visu-cancelamento-agendado', atividade.data ? formatarDataHoraPT(atividade.data).completo : null);
    preencherCampoVisualizador('visu-cancelamento-data', atividade.canceladoEm ? formatarDataHoraPT(atividade.canceladoEm).completo : null);
    for (const id of ['visu-horarios', 'visu-localizacao']) {
        const section = document.getElementById(id);
        if (section) section.hidden = semVisita;
    }
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

    const enderecoCliente = document.getElementById('visu-endereco-cliente');
    if (enderecoCliente) enderecoCliente.textContent = cliente?.enderecoCompleto || 'Endereço não informado';

    const tipo = normalizarTipoVisita(atividade);
    document.getElementById('visu-tecnica').style.display = mostrarRelatorio && tipo === 'Visita comercial' ? 'block' : 'none';
    document.getElementById('visu-treinamento').style.display = mostrarRelatorio && tipo === 'Treinamento' && !relatorio?.dadosTreinamento ? 'block' : 'none';
    document.getElementById('visu-assistencia').style.display = mostrarRelatorio && tipo === ASSISTENCIA_TECNICA_TIPO ? 'block' : 'none';

    preencherCampoVisualizador('visu-objetivo', atividade.objetivo);
    preencherCampoVisualizador('visu-oportunidade', atividade.oportunidadeIdentificada);
    preencherCampoVisualizador('visu-categoria', atividade.categoriaTreinamento);
    preencherCampoVisualizador('visu-participantes', atividade.quantidadeParticipantes);
    preencherCampoVisualizador('visu-publico', atividade.publicoAtendido);

    const dadosAssistencia = dadosAssistenciaDoRelatorio(relatorio);
    const relatorioTextoSection = document.getElementById('visu-relatorio-section');
    if (relatorioTextoSection) relatorioTextoSection.style.display = !mostrarRelatorio || tipo === ASSISTENCIA_TECNICA_TIPO ? 'none' : 'block';

    if (tipo === ASSISTENCIA_TECNICA_TIPO) {
        const visual = document.getElementById('visu-at-relatorio-visual');
        if (visual) visual.innerHTML = renderFichaAssistencia(dadosAssistencia, {}, relatorio);

    }

    preencherCampoVisualizador('visu-nota', atividade.nota, 'Nenhuma nota registrada.');
    preencherConteudoRelatorio('visu-relatorio', relatorio, 'Nenhum relatório registrado.');
    const comercial = resumoComercial(relatorio);
    if (comercial.length) {
        const element = document.getElementById('visu-relatorio');
        if (element) element.innerHTML = comercial.map(([label,value]) => `<p><strong>${escaparHtml(label)}:</strong> ${escaparHtml(value || 'Não informado')}</p>`).join('') +
            reportMarkup(relatorio.dadosComerciais.photos || [], atividade.id) + '<p><strong>Relatório livre</strong></p>' + element.innerHTML;
    }

    if (relatorio?.dadosTreinamento?.versao === 1) {
        const element = document.getElementById('visu-relatorio');
        if (element) element.innerHTML = renderTrainingSummary(relatorio);
    }

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

export function preencherConteudoRelatorio(id, relatorio, fallback) {
    const element = document.getElementById(id);
    if (!element) return;
    const blocks = blocosPersistidosRelatorio(relatorio);
    if (blocks) {
        element.innerHTML = reportMarkup(blocks, relatorio?.atividadeId || '');
    } else {
        element.textContent = relatorio?.textoAtual || fallback;
    }
}
