export async function consultarDadosCnpj(cnpj, buscarJson) {
    const fontes = [
        async () => {
            const d = await buscarJson(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
            return { nome:d.nome_fantasia || d.razao_social, cep:d.cep, logradouro:[d.descricao_tipo_de_logradouro,d.logradouro].filter(Boolean).join(' '), numero:d.numero, bairro:d.bairro, cidade:d.municipio, uf:d.uf };
        },
        async () => {
            const d = await buscarJson(`https://publica.cnpj.ws/cnpj/${cnpj}`);
            const e = d.estabelecimento || {};
            return { nome:e.nome_fantasia || d.razao_social, cep:e.cep, logradouro:[e.tipo_logradouro,e.logradouro].filter(Boolean).join(' '), numero:e.numero, bairro:e.bairro, cidade:e.cidade?.nome, uf:e.estado?.sigla };
        }
    ];
    for (const fonte of fontes) {
        try {
            const d = await fonte();
            if (typeof d.nome !== 'string' || !d.nome.trim()) throw new Error('Resposta sem dados utilizáveis');
            return Object.fromEntries(Object.entries(d).map(([k,v]) => [k, String(v ?? '').trim()]));
        } catch (erro) { console.warn('Consulta de CNPJ indisponível:', erro?.name || 'erro'); }
    }
    throw new Error('Não foi possível consultar o CNPJ. Tente novamente ou preencha os dados.');
}
