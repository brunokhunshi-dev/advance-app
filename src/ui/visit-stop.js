import { HomeVisitMap } from './home-map.js';
import { coordenadasValidas, obterCoordsPorEndereco, obterEnderecoPorCoords, obterPosicao } from '../services/location.js';

export function configurarParada({ salvar }) {
    const dialog = document.getElementById('modal-adicionar-parada');
    const form = document.getElementById('form-parada');
    const endereco = document.getElementById('parada-endereco');
    const canvas = document.getElementById('parada-mapa');
    const status = document.getElementById('parada-mapa-status');
    const erro = document.getElementById('parada-erro');
    const confirmar = document.getElementById('btn-confirmar-parada');
    const cancelar = document.getElementById('btn-cancelar-parada');
    let atual = null;
    const mapa = new HomeVisitMap(canvas, status, { getPosition: () => Promise.resolve(atual?.posicao) });

    function fechar() {
        atual = null;
        mapa.clear();
    }
    cancelar.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => { if (!dialog.open) fechar(); });
    dialog.addEventListener('cancel', evento => { if (atual?.salvando) evento.preventDefault(); });

    form.addEventListener('submit', async evento => {
        evento.preventDefault();
        const pedido = atual;
        if (!dialog.open || !pedido || confirmar.disabled) return;
        const campos = Object.fromEntries(new FormData(form));
        erro.textContent = '';
        pedido.salvando = true;
        confirmar.disabled = cancelar.disabled = true;
        try {
            let parada;
            if (pedido.posicao) {
                const { latitude: lat, longitude: lng, accuracy } = pedido.posicao.coords;
                const enderecoGps = await obterEnderecoPorCoords(lat, lng);
                parada = { lat, lng, accuracy: Number.isFinite(accuracy) ? accuracy : null, origem: 'gps',
                    endereco: /^(Erro ao|Endereço não encontrado)/.test(enderecoGps) ? null : enderecoGps };
            } else {
                const coords = await obterCoordsPorEndereco(campos);
                if (!coords) throw new Error('Não encontramos esse endereço. Confira a rua, o número, a cidade e a UF.');
                parada = { ...coords, accuracy: null, origem: 'endereco_manual',
                    endereco: `${campos.logradouro.trim()}, ${campos.numero.trim()} · ${campos.cidade.trim()} - ${campos.uf.toUpperCase()}` };
            }
            if (atual !== pedido || !dialog.open) return;
            await salvar(pedido.id, { ...parada, tipo: campos.tipo });
            if (atual === pedido) dialog.close();
        } catch (error) {
            if (atual === pedido) erro.textContent = error.message || 'Não foi possível salvar a parada. Tente novamente.';
        } finally {
            if (atual === pedido) {
                pedido.salvando = false;
                confirmar.disabled = cancelar.disabled = false;
            }
        }
    });

    return async function abrirParada(id) {
        if (dialog.open) return;
        const pedido = { id, posicao: null, salvando: false };
        atual = pedido;
        form.reset();
        endereco.hidden = endereco.disabled = canvas.hidden = confirmar.disabled = true;
        cancelar.disabled = false;
        erro.textContent = '';
        status.textContent = 'Obtendo localização…';
        dialog.showModal();
        try {
            const posicao = await obterPosicao();
            if (atual !== pedido || !dialog.open) return;
            if (!coordenadasValidas(posicao.coords.latitude, posicao.coords.longitude)) throw new Error('GPS indisponível.');
            pedido.posicao = posicao;
            canvas.hidden = false;
            confirmar.disabled = false;
            void mapa.update();
        } catch (error) {
            if (atual !== pedido || !dialog.open) return;
            status.textContent = '';
            if (error.codigoGps === 1) {
                erro.textContent = 'Ative a localização e permita o acesso ao GPS. Depois feche este aviso e tente novamente.';
                return;
            }
            erro.textContent = 'Não foi possível obter o GPS. Informe o endereço da parada.';
            endereco.hidden = endereco.disabled = confirmar.disabled = false;
        }
    };
}
