import { escaparHtml } from '../domain/formatters.js';
import { dadosAssistenciaDoRelatorio, blocosPersistidosRelatorio } from '../domain/reports.js';
import { reportMarkup } from '../../technical-report-editor.js';

export function valorCampoAssistencia(id) {
    return String(document.getElementById(id)?.value || '').trim();
}

export function valoresMarcadosAssistencia(name) {
    return [...document.querySelectorAll('input[name="' + name + '"]:checked')].map(input => input.value);
}

export function radioAssistencia(name) {
    return document.querySelector('input[name="' + name + '"]:checked')?.value || '';
}

export function marcarRadioAssistencia(name, value) {
    document.querySelectorAll('input[name="' + name + '"]').forEach(input => {
        input.checked = String(input.value) === String(value || '');
    });
}

export function marcarChecksAssistencia(name, values) {
    const set = new Set(Array.isArray(values) ? values.map(String) : []);
    document.querySelectorAll('input[name="' + name + '"]').forEach(input => {
        input.checked = set.has(String(input.value));
    });
}

export function limparFormularioAssistencia() {
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
    document.getElementById('at-especificacao-numero-wrap')?.style?.setProperty('display','none');
    document.getElementById('at-impacto-detalhe-wrap')?.style?.setProperty('display','none');
}

export function lerFormularioAssistencia(relatorio) {
    const fotos = dadosAssistenciaDoRelatorio(relatorio).fotosSelecionadas || [];

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

export function preencherFormularioAssistencia(dados = {}) {
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

}

export function valorVisualAssistencia(valor, fallback = 'Não informado') {
    const texto = String(valor ?? '').trim();
    return texto ? escaparHtml(texto) : fallback;
}

export function listaVisualAssistencia(valores) {
    const lista = Array.isArray(valores) ? valores.filter(Boolean) : [];
    return lista.length ? lista.map(String).join(', ') : 'Não informado';
}

export function renderFichaAssistencia(dados = {}, opcoes = {}, relatorio = null) {
    const campo = (rotulo, valor) =>
        '<div class="visualizador-info"><label>' + escaparHtml(rotulo) + '</label><div class="visualizador-value">' + valorVisualAssistencia(valor) + '</div></div>';

    const secao = (titulo, conteudo) =>
        '<div class="assistencia-form-view-section"><h3>' + escaparHtml(titulo) + '</h3>' + conteudo + '</div>';

    const especificacao = dados.houveEspecificacao === 'Sim'
        ? 'Sim' + (dados.numeroEspecificacao ? ' · ' + dados.numeroEspecificacao : '')
        : (dados.houveEspecificacao || 'Não informado');

    const clima = dados.impactoClimatico === 'Sim'
        ? 'Sim' + (dados.impactoClimaticoDetalhe ? ' · ' + dados.impactoClimaticoDetalhe : '')
        : (dados.impactoClimatico || 'Não informado');

    let html = '';

    html += secao('Cliente e aplicação',
        campo('Cliente final', dados.clienteFinal) +
        campo('Contato / setor', [dados.contato, dados.setor].filter(Boolean).join(' / ')) +
        campo('Endereço de aplicação', dados.enderecoAplicacao) +
        campo('Empresa de aplicação', dados.empresaAplicacao) +
        campo('Responsável da empresa', dados.responsavelEmpresa) +
        campo('Acompanhado por', dados.acompanhadoPor) +
        campo('Equipamento / superfície', dados.superficie) +
        campo('Data da aplicação', dados.dataAplicacao) +
        campo('Especificação', especificacao)
    );

    html += secao('Produto e queixa',
        campo('Produto', dados.produto) +
        campo('Lote', dados.lote) +
        campo('Cor', dados.cor) +
        campo('Queixa', dados.queixa) +
        campo('Esquema de pintura', dados.esquemaPintura)
    );

    html += secao('Preparo e condições de aplicação',
        campo('Preparo da superfície', dados.preparoSuperficie) +
        campo('Métodos de limpeza', listaVisualAssistencia(dados.metodosLimpeza)) +
        campo('Impacto climático / intempéries', clima) +
        campo('Ferramenta de aplicação', listaVisualAssistencia(dados.ferramentasAplicacao))
    );

    html += secao('O que foi verificado',
        campo('Itens verificados', listaVisualAssistencia(dados.itensVerificados)) +
        campo('Umidade medida', dados.umidade) +
        campo('Referência / limite', dados.umidadeReferencia) +
        campo('Relatório técnico', dados.constatacoes)
    );

    if (!opcoes.omitirFechamento) {
        html += secao('Fechamento',
            campo('Ações definidas', dados.acoesDefinidas) +
            campo('Conclusão técnica', dados.conclusaoTecnica) +
            campo('Resultado da assistência', dados.resultado) +
            campo('Próximo passo', dados.proximoPasso)
        );
    }

    const blocks = blocosPersistidosRelatorio(relatorio);
    if (blocks) {
        html = html.replace(
            campo('Relatório técnico', dados.constatacoes),
            '<div class="report-read-content"><label>Relatório técnico</label>' +
                reportMarkup(blocks, relatorio?.atividadeId || '') +
            '</div>'
        );
    }
    return html;
}
