import {nomeProduto} from './products.js';
const COLECOES_RELATORIO = Object.freeze({
    'Visita comercial': 'relatorios_comerciais',
    'Treinamento': 'relatorios_treinamentos',
    'Assistência técnica': 'relatorios_assistencia_tecnica'
});
export const ASSISTENCIA_TECNICA_TIPO = 'Assistência técnica';
export function normalizarTipoVisita(atividade) {
    const tipo = String(atividade?.tipoVisita || '').trim().toLowerCase();
    if (tipo === 'treinamento' || atividade?.objetivo === 'Treinamento') return 'Treinamento';
    if (tipo === 'assistência técnica' || tipo === 'assistencia tecnica' || tipo === 'visita de assistência técnica' || tipo === 'visita de assistencia tecnica') return 'Assistência técnica';
    // Compatibilidade com registros antigos: "Visita técnica" passa a ser exibida como comercial.
    if (tipo === 'visita comercial' || tipo === 'visita técnica' || tipo === 'visita tecnica') return 'Visita comercial';
    return 'Visita comercial';
}

export function colecaoRelatorioPorTipo(tipoOuAtividade) {
    const tipo = typeof tipoOuAtividade === 'string' ? normalizarTipoVisita({ tipoVisita: tipoOuAtividade }) : normalizarTipoVisita(tipoOuAtividade || {});
    return COLECOES_RELATORIO[tipo] || 'relatorios_comerciais';
}

export function colecaoRelatorioDaAtividade(atividade, paraNovo = false) {
    const explicita = String(atividade?.relatorioColecao || '').trim();
    if (explicita) return explicita;
    // Registros antigos já vinculados continuam na coleção histórica.
    if (atividade?.relatorioId && !paraNovo) return 'relatorios';
    return colecaoRelatorioPorTipo(atividade);
}

export function blocosPersistidosRelatorio(relatorio) {
    const conteudo = relatorio?.conteudoRelatorio;
    return conteudo?.versao === 1 && Array.isArray(conteudo.blocos)
        ? conteudo.blocos
        : null;
}

export function dadosAssistenciaDoRelatorio(relatorio = {}) {
    const fonte = relatorio && typeof relatorio === 'object' ? relatorio : {};
    if (fonte.assistenciaTecnica) return { ...fonte.assistenciaTecnica };

    return {
        ...(fonte.clienteAplicacao || {}),
        ...(fonte.produtoQueixa || {}),
        ...(fonte.preparoAplicacao || {}),
        ...(fonte.verificacao || {}),
        fotosSelecionadas: Array.isArray(fonte.evidencias?.fotos) ? fonte.evidencias.fotos : [],
        acoesDefinidas: fonte.fechamento?.acoesDefinidas || '',
        conclusaoTecnica: fonte.fechamento?.conclusaoTecnica || '',
        resultado: fonte.fechamento?.resultado || '',
        proximoPasso: fonte.fechamento?.proximoPasso || ''
    };
}

export function secoesAssistenciaParaDocumento(dados = {}) {
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

export function modulosComerciaisPendentes(relatorio) {
    const data = relatorio?.dadosComerciais;
    if (!data || data.versao !== 1) return [];
    const pending = [];
    const roles = ['Proprietário','Gerente','Comprador','Vendedor','Responsável técnico'];
    const goals = ['Relacionamento e levantamento de necessidades','Apoio às vendas ou reposição','Apresentação de produto ou lançamento','Orientação aos vendedores','Acompanhamento de pendência'];
    if (!String(data.name || '').trim() || !roles.includes(data.role) || !goals.includes(data.goal)) pending.push('Contato na loja');
    if (!['low','missing','slow'].every(key => ['Sim','Não'].includes(data[key]) && (data[key] !== 'Sim' || data.products?.[key]?.some(product => nomeProduto(product).trim())))) pending.push('Disponibilidade dos produtos');
    const photos = data.photos || [];
    const organization = data.organization;
    if (!['Organizada e visível','Necessidade de organização','Ausência de exposição','Não foi verificado'].includes(organization) || photos.length > 6 ||
        (organization === 'Não foi verificado' ? photos.length !== 0 : organization !== 'Organizada e visível' && photos.length < 1) ||
        (data.materials?.includes('Outro') && !String(data.other || '').trim())) pending.push('Exposição e materiais');
    return pending;
}

export function relatorioValidoParaCheckout(relatorio, tipo) {
    if (!relatorio) return false;
    if (tipo === 'Visita comercial' && relatorio.dadosComerciais?.versao === 1) return true;
    if (tipo === 'Treinamento' && relatorio.dadosTreinamento?.versao === 1) return true;
    if (tipo === 'Assistência técnica') {
        const dados = dadosAssistenciaDoRelatorio(relatorio);
        return Boolean(String(dados.produto || '').trim() && String(dados.queixa || '').trim() && String(dados.constatacoes || '').trim());
    }
    return Boolean(String(relatorio.textoAtual || '').trim());
}

export function normalizarAssistenciaComparacao(dados = {}) {
    const secoes = secoesAssistenciaParaDocumento(dados && typeof dados === 'object' ? dados : {});
    return {
        clienteAplicacao: secoes.clienteAplicacao,
        produtoQueixa: secoes.produtoQueixa,
        preparoAplicacao: secoes.preparoAplicacao,
        verificacao: secoes.verificacao
    };
}
