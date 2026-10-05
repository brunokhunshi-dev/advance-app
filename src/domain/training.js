import { nomeProduto } from './products.js';

export const PARTICIPANTES = ['Vendedores', 'Pintores', 'Equipe técnica', 'Clientes industriais'];
export const OBJETIVOS = ['Capacitar venda', 'Orientar aplicação', 'Corrigir dificuldade', 'Produtos novos/lançamentos'];
export const CONTEUDOS = ['Aplicações e argumentos de venda', 'Preparação da superfície e do produto', 'Aplicação, equipamentos e segurança', 'Secagem, repintura e cura', 'Erros frequentes e prevenção', 'Demonstração prática', 'Verificação do entendimento'];
export const SUBSTRATOS = ['Aço carbono', 'Aço galvanizado', 'Alumínio', 'Concreto', 'Argamassa e alvenaria', 'Madeira', 'Cerâmica', 'Superfície já pintada'];
export const RESULTADOS = ['Satisfatório', 'Parcialmente satisfatório', 'Insatisfatório', 'Ainda não foi possível avaliar'];
export const SATISFACAO = ['1 Muito insatisfeito', '2 Insatisfeito', '3 Neutro', '4 Satisfeito', '5 Muito satisfeito', 'Não respondeu'];
export const TRAINING_MODULES = [['planning', 'Planejamento', 'Responsável, participantes, objetivo e produtos'], ['training', 'Treinamento', 'Conteúdos, aplicação prática e registros'], ['free', 'Relatório livre', 'Relatos, acontecimentos e imagens'], ['feedback', 'Feedbacks', 'Avaliação do promotor e do responsável']];

export const blankTraining = () => ({ name: '', participants: [], expected: '', present: '', goal: '', products: { planned: [], applied: [] }, contents: [], practice: '', surfaces: [], result: '', photos: [], text: '', blocks: null, attachments: [], achieved: '', engagement: '', promoterOpinion: '', satisfaction: '', responsibleOpinion: '' });
const count = value => value !== '' && value != null && Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 10000;
const selected = (values, choices) => Array.isArray(values) && values.length > 0 && values.every(value => choices.includes(value));
const products = values => Array.isArray(values) && values.some(value => nomeProduto(value).trim());
export function trainingModuleComplete(key, data = {}) {
    if (key === 'planning') return !!String(data.name || '').trim() && selected(data.participants, PARTICIPANTES) && count(data.expected) && count(data.present) && OBJETIVOS.includes(data.goal);
    if (key === 'training') return selected(data.contents, CONTEUDOS) && ['Sim', 'Não'].includes(data.practice) && (data.photos || []).length <= 6 && (data.practice === 'Não' || products(data.products?.applied) && selected(data.surfaces, SUBSTRATOS) && RESULTADOS.includes(data.result));
    if (key === 'feedback') return ['Sim', 'Parcialmente', 'Não'].includes(data.achieved) && ['Alta', 'Moderada', 'Baixa'].includes(data.engagement) && SATISFACAO.includes(data.satisfaction);
    return !!(String(data.text || '').trim() || data.blocks?.some(block => block.kind === 'media'));
}
export function modulosTreinamentoPendentes(report) {
    if (report?.dadosTreinamento?.versao !== 1) return ['Relatório de treinamento'];
    return TRAINING_MODULES.filter(([key]) => key !== 'free' && !trainingModuleComplete(key, report.dadosTreinamento)).map(([, title]) => title);
}
export function resumoTreinamento(data = {}) {
    return [
        ['Planejamento', [['Responsável', data.name], ['Participantes', (data.participants || []).join(', ')], ['Previstos', data.expected], ['Presentes', data.present], ['Objetivo principal', data.goal], ['Produtos incluídos', (data.products?.planned || []).map(nomeProduto).join(', ')]]],
        ['Treinamento', [['Conteúdos e atividades', (data.contents || []).join(', ')], ['Houve aplicação prática?', data.practice], ...(data.practice === 'Sim' ? [['Produtos aplicados', (data.products?.applied || []).map(nomeProduto).join(', ')], ['Substrato/superfície', (data.surfaces || []).join(', ')], ['Resultado', data.result]] : [])]],
        ['Feedbacks', [['Objetivo atingido', data.achieved], ['Participação do grupo', data.engagement], ['Opinião do promotor', data.promoterOpinion], ['Satisfação do responsável', data.satisfaction], ['Opinião do responsável', data.responsibleOpinion]]]
    ];
}
