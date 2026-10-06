import { escaparHtml } from '../domain/formatters.js';
import { localizacaoIncerta } from '../services/location.js';

const texto = value => String(value ?? '').trim();
const normalizar = value => texto(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function cnpjCliente(cliente) {
    const digits = texto(cliente.cnpj || cliente.codigoCnpj).replace(/\D/g, '');
    return digits.length === 14 ? digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : '';
}

export function tituloCliente(cliente) {
    const cidade = [texto(cliente.cidade), texto(cliente.uf).toUpperCase()].filter(Boolean).join('/');
    return texto(cliente.nome) + (cidade ? ' — ' + cidade : '');
}

export function detalhesCliente(cliente) {
    const endereco = texto(cliente.enderecoCompleto), cnpj = cnpjCliente(cliente);
    return `${endereco ? `<span class="autocomplete-client-detail">${escaparHtml(endereco)}</span>` : ''}${cnpj ? `<span class="autocomplete-client-detail autocomplete-client-cnpj">CNPJ: ${escaparHtml(cnpj)}</span>` : ''}${localizacaoIncerta(cliente) ? '<span class="autocomplete-client-detail">Localização incerta</span>' : ''}`;
}

export function opcaoCliente(cliente) {
    return `<span class="autocomplete-client-title">${escaparHtml(tituloCliente(cliente))}</span>${detalhesCliente(cliente)}`;
}

export function filtrarClientes(clientes, consulta) {
    const termos = normalizar(consulta).split(/\s+/).filter(Boolean);
    return clientes.filter(cliente => {
        const cnpj = cnpjCliente(cliente);
        const busca = normalizar([cliente.nome, cliente.cidade, cliente.uf, cliente.enderecoCompleto, cnpj, cnpj.replace(/\D/g, '')].join(' '));
        return termos.every(termo => busca.includes(termo));
    });
}
