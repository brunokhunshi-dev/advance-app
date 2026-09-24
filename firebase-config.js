export const firebaseConfig = {
    apiKey: "AIzaSyAMDeRB1ZOOP919gcbcOoFgAsy6dNy7zS8",
    authDomain: "banco-de-dados-monitor.firebaseapp.com",
    projectId: "banco-de-dados-monitor",
    storageBucket: "banco-de-dados-monitor.firebasestorage.app",
    messagingSenderId: "248039911306",
    appId: "1:248039911306:web:188ffff179b3ffb3ace273"
};

// PWA: o arquivo é importado pelo script principal, então a integração funciona
// sem depender de um segundo script no HTML.
if (typeof document !== 'undefined') {
    const manifest = document.createElement('link');
    manifest.rel = 'manifest';
    manifest.href = './manifest.webmanifest';
    document.head.appendChild(manifest);

    const themeColor = document.createElement('meta');
    themeColor.name = 'theme-color';
    themeColor.content = '#040438';
    document.head.appendChild(themeColor);

    const appleCapable = document.createElement('meta');
    appleCapable.name = 'apple-mobile-web-app-capable';
    appleCapable.content = 'yes';
    document.head.appendChild(appleCapable);

    const appleStatusBar = document.createElement('meta');
    appleStatusBar.name = 'apple-mobile-web-app-status-bar-style';
    appleStatusBar.content = 'black-translucent';
    document.head.appendChild(appleStatusBar);

    const mobileStyles = document.createElement('link');
    mobileStyles.rel = 'stylesheet';
    mobileStyles.href = './pwa-mobile.css';
    document.head.appendChild(mobileStyles);
}

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js', { scope: './' })
            .catch(error => console.warn('Não foi possível ativar o modo offline:', error));
    });
}
