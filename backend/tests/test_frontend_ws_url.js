// test_frontend_ws_url.js - Node test for getTranslationSocketUrl
const assert = require('assert');

function createUrlResolver(locationObj, configuredBackendUrl) {
    global.window = {
        location: locationObj,
        LIVE_TRANSLATION_BACKEND_URL: configuredBackendUrl
    };

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname || '127.0.0.1';
    const backendUrl = configuredBackendUrl
        ? new URL(configuredBackendUrl)
        : new URL(`${protocol}//${host}:8000`);

    if (backendUrl.protocol === 'https:') {
        backendUrl.protocol = 'wss:';
    } else if (backendUrl.protocol === 'http:') {
        backendUrl.protocol = 'ws:';
    } else if (backendUrl.protocol !== 'ws:' && backendUrl.protocol !== 'wss:') {
        throw new Error('LIVE_TRANSLATION_BACKEND_URL must use http(s) or ws(s).');
    }
    if (window.location.protocol === 'https:' && backendUrl.protocol !== 'wss:') {
        throw new Error('Secure pages require a backend URL using https:// or wss://.');
    }

    backendUrl.pathname = `${backendUrl.pathname.replace(/\/+$/, '')}/ws/translate`;
    backendUrl.search = '';
    backendUrl.hash = '';
    return backendUrl.toString();
}

function getHttpBaseUrl(locationObj, configuredBackendUrl) {
    const host = locationObj.hostname || '127.0.0.1';
    const protocol = locationObj.protocol === 'https:' ? 'https:' : 'http:';
    let backendUrl;
    if (configuredBackendUrl) {
        backendUrl = new URL(configuredBackendUrl);
        if (backendUrl.protocol === 'wss:') backendUrl.protocol = 'https:';
        else if (backendUrl.protocol === 'ws:') backendUrl.protocol = 'http:';
    } else {
        backendUrl = new URL(`${protocol}//${host}:8000`);
    }
    return `${backendUrl.protocol}//${backendUrl.host}`;
}

function getConfiguredBackend(locationObj, existingBackendUrl) {
    if (existingBackendUrl) return existingBackendUrl;
    if (locationObj.hostname === 'liveindic-translator.onrender.com') {
        return 'https://livetranslation-iok7.onrender.com';
    }
    return undefined;
}

// 1. Default local dev
assert.strictEqual(
    createUrlResolver({ protocol: 'http:', hostname: 'localhost' }),
    'ws://localhost:8000/ws/translate'
);

// 2. Local dev with 127.0.0.1
assert.strictEqual(
    createUrlResolver({ protocol: 'http:', hostname: '127.0.0.1' }),
    'ws://127.0.0.1:8000/ws/translate'
);

// 3. Empty hostname fallback
assert.strictEqual(
    createUrlResolver({ protocol: 'http:', hostname: '' }),
    'ws://127.0.0.1:8000/ws/translate'
);

// 4. The hosted frontend uses the deployed backend by default.
const productionLocation = {
    protocol: 'https:',
    hostname: 'liveindic-translator.onrender.com'
};
const productionBackend = getConfiguredBackend(productionLocation);
assert.strictEqual(
    createUrlResolver(productionLocation, productionBackend),
    'wss://livetranslation-iok7.onrender.com/ws/translate'
);
assert.strictEqual(
    getHttpBaseUrl(productionLocation, productionBackend),
    'https://livetranslation-iok7.onrender.com'
);

// 5. An explicit backend configuration still takes precedence.
assert.strictEqual(
    createUrlResolver(
        { protocol: 'https:', hostname: 'app.example.com' },
        getConfiguredBackend({ protocol: 'https:', hostname: 'app.example.com' }, 'https://api.example.com')
    ),
    'wss://api.example.com/ws/translate'
);

// 6. Local development uses the local backend over HTTP.
assert.strictEqual(
    getHttpBaseUrl({ protocol: 'http:', hostname: 'localhost' }),
    'http://localhost:8000'
);

// 7. Insecure backend rejected on secure page.
assert.throws(() => {
    createUrlResolver({ protocol: 'https:', hostname: 'app.example.com' }, 'http://api.example.com');
}, /Secure pages require a backend URL/);

console.log('All frontend WebSocket URL configuration tests passed!');
