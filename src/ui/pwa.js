// Installation UI is separate from Firebase configuration and runs only in the app.
let deferredPrompt = null;
let installButton = null;
const installed = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    if (installed()) return;
    deferredPrompt = event;
    if (installButton) return;
    installButton = document.createElement('button');
    installButton.id = 'btn-instalar-app';
    installButton.className = 'pwa-install-button';
    installButton.type = 'button';
    installButton.textContent = 'Instalar aplicativo';
    installButton.addEventListener('click', async () => {
        const prompt = deferredPrompt;
        if (!prompt) return;
        deferredPrompt = null;
        installButton.disabled = true;
        try {
            await prompt.prompt();
            await prompt.userChoice;
        } catch (error) {
            console.warn('Não foi possível abrir a instalação:', error);
        } finally {
            // A prompt can be used only once, even when dismissed.
            installButton?.remove();
            installButton = null;
        }
    });
    document.body.appendChild(installButton);
});
window.addEventListener('appinstalled', () => {
    installButton?.remove();
    installButton = null;
    deferredPrompt = null;
});
