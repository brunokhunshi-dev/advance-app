import test from 'node:test';
import assert from 'node:assert/strict';
import { contactPhone, contactVCard } from '../src/domain/contact.js';
import { contactQrSvg } from '../src/ui/contact-share.js';

test('contact vCard preserves name order, UTF-8 accents, role, normalized phone and current revision', () => {
    const card = contactVCard({nome:'Bruno Santos de Souza',cargo:'Promotor Técnico',telefone:'(19) 99620-3536',email:'bruno@example.com'},new Date('2026-10-06T17:00:00Z'));
    assert.match(card,/FN;CHARSET=UTF-8:Bruno Santos de Souza\r\n/);
    assert.match(card,/N;CHARSET=UTF-8:Santos de Souza;Bruno;;;\r\n/);
    assert.match(card,/TITLE;CHARSET=UTF-8:Promotor Técnico\r\n/);
    assert.match(card,/TEL;TYPE=CELL:\+5519996203536\r\n/);
    assert.match(card,/REV:2026-10-06T17:00:00.000Z\r\nEND:VCARD\r\n$/);
    assert.equal(contactPhone('+55 19 99620-3536'),'+5519996203536');
    assert.equal(contactPhone('0055 19 99620-3536'),'+5519996203536');
});

test('contact escapes property injection, folds by UTF-8 bytes and omits unavailable contact fields', () => {
    const name='João '.repeat(30).trim();
    const card=contactVCard({nome:name,cargo:'Técnico;Vendas, Brasil\r\nTEL:injetado'});
    assert.ok(card.split('\r\n').every(line=>new TextEncoder().encode(line).length<=75));
    const unfolded=card.replace(/\r\n /g,'');
    assert.ok(unfolded.includes('FN;CHARSET=UTF-8:'+name));
    assert.ok(unfolded.includes('Técnico\\;Vendas\\, Brasil\\nTEL:injetado'));
    assert.equal(card.includes('\r\nTEL:'),false);
    assert.equal(card.includes('\r\nEMAIL'),false);
    assert.throws(()=>contactVCard({nome:' '}));
    assert.match(contactVCard({nome:'Jean',tipo:'Assistente'}),/Assistente Técnico/);
});

test('QR renders vCard data locally as an SVG with quiet zone and no remote resources', () => {
    const svg=contactQrSvg(contactVCard({nome:'Jean Felipe de Moraes',telefone:'19999999999',email:'jean@advancetintas.com.br'}));
    assert.match(svg,/viewBox="0 0 \d+ \d+"/);
    assert.match(svg,/shape-rendering="crispEdges"/);
    assert.match(svg,/<path d="M4,4h1v1h-1z/);
    assert.equal(svg.includes('href='),false);
});
