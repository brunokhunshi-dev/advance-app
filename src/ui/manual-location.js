import { coordenadasValidas } from '../services/location.js';

export function classificarLocalizacao(localizacao) {
    if (coordenadasValidas(localizacao?.lat, localizacao?.lng)) return 'valida';
    return localizacao?.codigoGps === 1 ? 'negada' : 'erro';
}

export async function resolverLocalizacao(localizacao, solicitarEndereco, geocodificar) {
    const tipo = classificarLocalizacao(localizacao);
    if (tipo === 'valida') return localizacao;
    if (tipo === 'negada') throw new Error('Ative a localização e permita o acesso ao GPS para continuar.');
    const endereco = await solicitarEndereco();
    if (!endereco) return null;
    const coords = await geocodificar(endereco);
    if (!coords || !coordenadasValidas(coords.lat, coords.lng)) throw new Error('Endereço não encontrado. Confira os dados e tente novamente.');
    return { ...coords, accuracy:null, endereco:`${endereco.logradouro}, ${endereco.numero} · ${endereco.cidade} - ${endereco.uf}`, origem:'endereco_manual', gpsStatus:'endereco_manual', gpsErro:localizacao.gpsErro, capturadoEm:null };
}

export function solicitarEnderecoManual() {
    return new Promise(resolve => {
        const dialog = document.createElement('dialog');
        dialog.className = 'cancellation-dialog';
        dialog.setAttribute('aria-labelledby', 'endereco-manual-titulo');
        dialog.innerHTML = `<h2 id="endereco-manual-titulo">Informar endereço</h2><p>Não foi possível obter sua localização. Informe o endereço atual.</p><form><label>Rua<input name="logradouro" class="input-box" required maxlength="160"></label><label>Número<input name="numero" class="input-box" required maxlength="20"></label><label>Cidade<input name="cidade" class="input-box" required maxlength="100"></label><label>UF<input name="uf" class="input-box" required pattern="[A-Za-z]{2}" maxlength="2"></label><div class="alert-actions split"><button type="button">Cancelar</button><button type="submit" class="alert-btn-red">Continuar</button></div></form>`;
        document.body.append(dialog);
        let resultado = null;
        dialog.querySelector('button[type="button"]').addEventListener('click', () => dialog.close());
        dialog.querySelector('form').addEventListener('submit', event => {
            event.preventDefault();
            resultado = Object.fromEntries(new FormData(event.currentTarget));
            dialog.close();
        });
        dialog.addEventListener('close', () => { dialog.remove(); resolve(resultado); }, {once:true});
        dialog.showModal();
    });
}
