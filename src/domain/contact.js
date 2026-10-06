const escapeValue = value => String(value || '').replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');

export function contactPhone(value) {
    let digits = String(value || '').replace(/\D/g, '');
    if (digits.startsWith('0055')) digits = digits.slice(2);
    if (digits.length === 10 || digits.length === 11) digits = '55' + digits;
    return digits ? '+' + digits : '';
}

export function contactVCard(profile, now = new Date()) {
    const encoder = new TextEncoder();
    const name = String(profile.nome || '').trim();
    if (!name) throw new Error('Nome do colaborador não informado.');
    const parts = name.split(/\s+/), given = parts.shift(), family = parts.join(' ');
    const title = profile.cargo || (profile.tipo === 'Assistente' ? 'Assistente Técnico' : 'Promotor Técnico de Vendas');
    const phone = contactPhone(profile.telefone || profile.celular);
    const lines = ['BEGIN:VCARD', 'VERSION:3.0', 'FN;CHARSET=UTF-8:' + escapeValue(name),
        'N;CHARSET=UTF-8:' + escapeValue(family) + ';' + escapeValue(given) + ';;;',
        'TITLE;CHARSET=UTF-8:' + escapeValue(title)];
    if (phone) lines.push('TEL;TYPE=CELL:' + phone);
    if (profile.email) lines.push('EMAIL;TYPE=WORK:' + escapeValue(profile.email));
    lines.push('REV:' + now.toISOString(), 'END:VCARD');
    return lines.map(line => {
        let output = '', bytes = 0;
        for (const character of line) {
            const size = encoder.encode(character).length;
            if (bytes + size > 75) { output += '\r\n '; bytes = 1; }
            output += character; bytes += size;
        }
        return output;
    }).join('\r\n') + '\r\n';
}
