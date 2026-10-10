// test_frontend_ws_url.js - Node test for getTranslationSocketUrl
const assert = require('assert');
const fs = require('fs');
const path = require('path');

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
    if ([
        'liveindic-translator-frontend.onrender.com',
        'liveindic-translator.onrender.com'
    ].includes(locationObj.hostname)) {
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
    hostname: 'liveindic-translator-frontend.onrender.com'
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
assert.strictEqual(
    createUrlResolver(
        { protocol: 'https:', hostname: 'liveindic-translator.onrender.com' },
        getConfiguredBackend({ protocol: 'https:', hostname: 'liveindic-translator.onrender.com' })
    ),
    'wss://livetranslation-iok7.onrender.com/ws/translate'
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

const projectRoot = path.resolve(__dirname, '..', '..');
const sourceHtml = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');
assert.match(sourceHtml, /<script\s+type="module"\s+src="\/ws_translation\.js"><\/script>/);
assert.match(sourceHtml, /liveindic-translator-frontend\.onrender\.com/);
assert.match(sourceHtml, /https:\/\/livetranslation-iok7\.onrender\.com/);

const distDir = path.join(projectRoot, 'dist');
const builtHtml = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
assert.doesNotMatch(builtHtml, /src="\/ws_translation\.js"/);
assert.match(builtHtml, /liveindic-translator-frontend\.onrender\.com/);
assert.match(builtHtml, /https:\/\/livetranslation-iok7\.onrender\.com/);
const bundledScripts = [...builtHtml.matchAll(/<script[^>]+src="([^"]+\.js)"[^>]*><\/script>/g)];
assert.ok(bundledScripts.length > 0, 'Vite build should emit frontend JavaScript bundles');
const builtScriptContents = bundledScripts.map(([, src]) => {
    const assetPath = path.join(distDir, src.replace(/^\//, ''));
    assert.ok(fs.existsSync(assetPath), `Built script is missing: ${src}`);
    return fs.readFileSync(assetPath, 'utf8');
});
assert.ok(
    builtScriptContents.some((contents) => contents.includes('Start Conversation')),
    'The built frontend bundle should include ws_translation.js'
);
const frontendBundle = builtScriptContents.join('\n');
assert.match(frontendBundle, /\/ws\/translate/);
const stylesheet = builtHtml.match(/<link[^>]+href="([^"]+\.css)"[^>]*>/);
assert.ok(stylesheet, 'Vite build should emit a stylesheet');
assert.ok(
    fs.existsSync(path.join(distDir, stylesheet[1].replace(/^\//, ''))),
    `Built stylesheet is missing: ${stylesheet[1]}`
);
const workletAsset = frontendBundle.match(/(?:\.\/)?assets\/audio_capture_processor-[\w-]+\.js/);
assert.ok(workletAsset, 'Built bundle should reference the emitted audio worklet asset');
assert.ok(
    fs.existsSync(path.join(distDir, workletAsset[0].replace(/^\.\//, ''))),
    `Built audio worklet asset is missing: ${workletAsset[0]}`
);

console.log('All frontend WebSocket URL configuration tests passed!');
