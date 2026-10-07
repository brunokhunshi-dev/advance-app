import { QrCode } from '../vendor/qrcodegen.js';
import { contactVCard } from '../domain/contact.js';
import { loadingMarkup } from './loading.js';

export function contactQrSvg(vcard) {
    const qr = QrCode.encodeText(vcard, QrCode.Ecc.MEDIUM);
    const border = 4, size = qr.size + border * 2, cells = [];
    for (let y = 0; y < qr.size; y++) for (let x = 0; x < qr.size; x++) {
        if (qr.getModule(x, y)) cells.push(`M${x + border},${y + border}h1v1h-1z`);
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="QR Code para adicionar o contato" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="white"/><path d="${cells.join('')}" fill="#040438"/></svg>`;
}

export class ContactShare {
    constructor(loadProfile = async profile => profile) { this.loadProfile = loadProfile; this.version = 0; }
    close() { this.version++; this.dialog?.close(); this.dialog?.remove(); this.dialog = null; }
    async open(profile) {
        this.close();
        const version = ++this.version, dialog = document.createElement('dialog');
        this.dialog = dialog; dialog.className = 'profile-share-dialog';
        dialog.setAttribute('aria-labelledby', 'profile-share-title');
        dialog.innerHTML = `<button type="button" class="profile-share-close" aria-label="Fechar"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true" class="heroicon" data-heroicon="x-mark" width="24" height="24"> <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12"/> </svg></button><h2 id="profile-share-title">Compartilhar contato</h2><p data-name></p><div class="profile-share-qr" aria-busy="true">${loadingMarkup(1)}</div><p data-status role="status">Gerando QR Code…</p><button type="button" class="btn-outline-red" data-retry hidden>Tentar novamente</button>`;
        dialog.querySelector('[data-name]').textContent = profile.nome;
        dialog.querySelector('.profile-share-close').onclick = () => this.close();
        dialog.addEventListener('cancel', event => { event.preventDefault(); this.close(); });
        dialog.addEventListener('click', event => {
            if (event.target !== dialog) return;
            const bounds = dialog.getBoundingClientRect();
            if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) this.close();
        });
        dialog.querySelector('[data-retry]').onclick = () => this.open(profile);
        document.body.append(dialog); dialog.showModal();
        try {
            const currentProfile = await this.loadProfile(profile);
            if (version !== this.version) return;
            const vcard = contactVCard(currentProfile);
            dialog.querySelector('[data-name]').textContent = currentProfile.nome;
            dialog.querySelector('.profile-share-qr').innerHTML = contactQrSvg(vcard);
            dialog.querySelector('[data-status]').textContent = 'Leia o QR Code com a câmera do celular para adicionar o contato.';
        } catch {
            if (version !== this.version) return;
            dialog.querySelector('.profile-share-qr').replaceChildren();
            dialog.querySelector('[data-status]').textContent = 'Não foi possível gerar o contato. Tente novamente.';
            dialog.querySelector('[data-retry]').hidden = false;
        } finally { if (version === this.version) dialog.querySelector('.profile-share-qr').removeAttribute('aria-busy'); }
    }
}
