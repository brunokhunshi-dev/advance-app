export const firebaseConfig = {
    apiKey: "AIzaSyAMDeRB1ZOOP919gcbcOoFgAsy6dNy7zS8",
    authDomain: "banco-de-dados-monitor.firebaseapp.com",
    projectId: "banco-de-dados-monitor",
    storageBucket: "banco-de-dados-monitor.firebasestorage.app",
    messagingSenderId: "248039911306",
    appId: "1:248039911306:web:188ffff179b3ffb3ace273"
};

// Registra os recursos PWA no carregamento do app.
// O index.html atual não possuía a tag manifest no head; como este módulo
// é carregado no final da página, a inserção aqui acontece antes da interface
// ser usada e mantém a configuração centralizada.
if (typeof document !== 'undefined') {
    if (!document.querySelector('link[rel="manifest"]')) {
        const manifest = document.createElement('link');
        manifest.rel = 'manifest';
        manifest.href = './manifest.webmanifest';
        document.head.appendChild(manifest);
    }

    const metas = [
        ['theme-color', '#040438'],
        ['mobile-web-app-capable', 'yes'],
        ['apple-mobile-web-app-capable', 'yes'],
        ['apple-mobile-web-app-status-bar-style', 'black-translucent']
    ];
    metas.forEach(([name, content]) => {
        if (!document.querySelector(`meta[name="${name}"]`)) {
            const meta = document.createElement('meta');
            meta.name = name;
            meta.content = content;
            document.head.appendChild(meta);
        }
    });
}

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js', { scope: './' })
            .then(registration => registration.update())
            .catch(error => console.error('Falha ao registrar o PWA:', error));
    });
}
