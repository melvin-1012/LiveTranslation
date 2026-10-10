// ws_translation.js - Real-time Voice Recognition & Dravidian Translation with Supabase Integration
(function() {
    function getTranslationSocketUrl() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const configuredBackendUrl = window.LIVE_TRANSLATION_BACKEND_URL;
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

    function getBackendHttpUrl() {
        const configuredBackendUrl = window.LIVE_TRANSLATION_BACKEND_URL;
        const host = window.location.hostname || '127.0.0.1';
        const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
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

    function initTranslator() {
        const startBtn = document.getElementById('startBtn');
        const stopBtn = document.getElementById('stopBtn');
        const clearBtn = document.getElementById('clearBtn');
        const sourceTranscript = document.getElementById('sourceTranscript');
        const targetTranslation = document.getElementById('targetTranslation');
        const sourceLanguageSelect = document.getElementById('sourceLanguage');
        const targetLanguageSelect = document.getElementById('targetLanguage');
        const translationMode = document.getElementById('translationMode');
        const conversationModeHint = document.getElementById('conversationModeHint');
        const conversationPanel = document.getElementById('conversationPanel');
        const conversationTurns = document.getElementById('conversationTurns');
        const conversationPreview = document.getElementById('conversationPreview');
        const conversationTurnStatus = document.getElementById('conversationTurnStatus');
        const sourcePanel = document.querySelector('.source-panel');
        const targetPanel = document.querySelector('.target-panel');
        const sourceLangBadge = document.getElementById('sourceLangBadge');
        const targetLangBadge = document.getElementById('targetLangBadge');
        const startBtnText = document.getElementById('startBtnText');
        const statusText = document.getElementById('statusText');
        const statusBadge = document.getElementById('statusBadge');
        const audioWaves = document.getElementById('audioWaves');
        const swapBtn = document.getElementById('swapLanguagesBtn');
        const translateSourceBtn = document.getElementById('translateSourceBtn');
        const speakTargetBtn = document.getElementById('speakTargetBtn');
        const sourceCharCount = document.getElementById('sourceCharCount');
        const targetCharCount = document.getElementById('targetCharCount');
        const sourceHint = document.getElementById('sourceHint');
        const targetHint = document.getElementById('targetHint');
        const app = window.LiveIndicTranslator;

        if (
            !startBtn || !stopBtn || !sourceTranscript || !targetTranslation ||
            !sourceLanguageSelect || !targetLanguageSelect || !app
        ) {
            setTimeout(initTranslator, 50);
            return;
        }

        // Replace start and stop buttons to remove default webkitSpeechRecognition listeners
        const newStartBtn = startBtn.cloneNode(true);
        startBtn.parentNode.replaceChild(newStartBtn, startBtn);
        const newStopBtn = stopBtn.cloneNode(true);
        stopBtn.parentNode.replaceChild(newStopBtn, stopBtn);

        const languageCodes = {
            Auto: 'auto',
            English: 'en',
            Tamil: 'ta',
            Hindi: 'hi',
            Telugu: 'te',
            Kannada: 'kn',
            Malayalam: 'ml'
        };
        const languageNames = {
            en: 'English',
            ta: 'Tamil',
            hi: 'Hindi',
            te: 'Telugu',
            kn: 'Kannada',
            ml: 'Malayalam'
        };

        let ws = null;
        let audioContext = null;
        let mediaStream = null;
        let processor = null;
        let activeSessionId = null;
        let isStopping = false;
        let starting = false;
        let baseSource = '';
        let baseTarget = '';
        let currentSource = '';
        let detectedSourceLanguage = null;
        let languageChangeTimer = null;
        let languageRestartInProgress = false;
        let languageRestartPending = false;
        let startAttemptId = 0;
        let cancelPendingStart = null;
        const conversationTurnCards = new Map();

        function setStatus(listening) {
            newStartBtn.disabled = listening || starting;
            newStopBtn.disabled = !listening && !starting;
            if (startBtnText) {
                startBtnText.textContent = listening
                    ? (translationMode && translationMode.value === 'conversation' ? 'Conversation Active' : 'Listening...')
                    : (translationMode && translationMode.value === 'conversation' ? 'Start Conversation' : 'Start Speaking');
            }
            if (statusText) statusText.textContent = listening ? 'Live Streaming' : 'Ready';
            if (statusBadge) {
                statusBadge.className = listening
                    ? 'status-pill status-listening'
                    : 'status-pill status-ready';
            }
            if (audioWaves) audioWaves.classList.toggle('listening', listening);
            if (app && app.setStatus) {
                app.setStatus(listening ? 'listening' : 'ready');
            }
        }

        function isConversationMode() {
            return Boolean(translationMode && translationMode.value === 'conversation');
        }

        function updateModeUI() {
            const conversation = isConversationMode();
            const sourceLabel = document.querySelector('label[for="sourceLanguage"]');
            const targetLabel = document.querySelector('label[for="targetLanguage"]');
            if (sourceLabel) sourceLabel.lastChild.textContent = conversation ? ' First Language' : ' Source Language (Speaking)';
            if (targetLabel) targetLabel.lastChild.textContent = conversation ? ' Second Language' : ' Target Language (Translation)';
            if (swapBtn) swapBtn.classList.toggle('hidden', conversation);
            if (conversationModeHint) conversationModeHint.classList.toggle('hidden', !conversation);
            if (conversationPanel) conversationPanel.classList.toggle('hidden', !conversation);
            if (sourcePanel) sourcePanel.classList.toggle('hidden', conversation);
            if (targetPanel) targetPanel.classList.toggle('hidden', conversation);
            if (sourceLanguageSelect) {
                const autoOption = sourceLanguageSelect.querySelector('option[value="Auto"]');
                if (autoOption) autoOption.disabled = conversation;
                if (conversation && sourceLanguageSelect.value === 'Auto') {
                    sourceLanguageSelect.value = 'English';
                    if (targetLanguageSelect.value === 'English') targetLanguageSelect.value = 'Tamil';
                }
            }
            if (conversationTurnStatus) {
                conversationTurnStatus.textContent = ws ? 'Listening for either language' : 'Waiting for speech';
            }
            if (startBtnText && !ws && !starting) {
                startBtnText.textContent = conversation ? 'Start Conversation' : 'Start Speaking';
            }
        }

        function renderConversationTurn(turn) {
            if (!conversationTurns) return;
            const key = turn.turnId == null ? `local-${conversationTurns.children.length}` : String(turn.turnId);
            let card = conversationTurnCards.get(key);
            if (!card) {
                card = document.createElement('article');
                card.className = 'conversation-turn';
                card.dataset.turnId = key;
                const label = document.createElement('div');
                label.className = 'conversation-turn-label';
                const original = document.createElement('div');
                original.className = 'conversation-turn-original';
                const translated = document.createElement('div');
                translated.className = 'conversation-turn-translation';
                card.append(label, original, translated);
                conversationTurns.appendChild(card);
                conversationTurnCards.set(key, card);
            }

            const [label, original, translated] = card.children;
            const sourceName = languageNames[turn.language] || null;
            const targetName = languageNames[turn.targetLanguage] || null;
            label.textContent = sourceName && targetName
                ? `${sourceName} → ${targetName}`
                : 'Language uncertain — choose the language for this turn';
            original.textContent = turn.originalText || '';
            translated.textContent = turn.translatedText
                ? `Translation: ${turn.translatedText}`
                : (turn.message || 'Not translated yet.');
            card.classList.toggle('is-uncertain', Boolean(turn.uncertain));

            const oldCorrection = card.querySelector('.conversation-correction');
            if (oldCorrection) oldCorrection.remove();
            if (turn.uncertain) {
                const correction = document.createElement('div');
                correction.className = 'conversation-correction';
                const select = document.createElement('select');
                select.className = 'custom-select';
                for (const [name, code] of Object.entries(languageCodes)) {
                    if (code === 'auto' || ![languageCodes[sourceLanguageSelect.value], languageCodes[targetLanguageSelect.value]].includes(code)) continue;
                    const option = document.createElement('option');
                    option.value = code;
                    option.textContent = languageNames[code] || name;
                    select.appendChild(option);
                }
                if (turn.language && [...select.options].some((option) => option.value === turn.language)) {
                    select.value = turn.language;
                }
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'btn btn-secondary';
                button.textContent = 'Correct & translate';
                button.addEventListener('click', () => {
                    if (!ws || ws.readyState !== WebSocket.OPEN) {
                        reportError('Conversation is not active', 'Start the conversation again before correcting this turn.');
                        return;
                    }
                    const source = select.value;
                    const first = languageCodes[sourceLanguageSelect.value];
                    const target = source === first
                        ? languageCodes[targetLanguageSelect.value]
                        : first;
                    button.disabled = true;
                    translated.textContent = 'Translation: translating…';
                    ws.send(JSON.stringify({
                        text_to_translate: turn.originalText,
                        source_language: source,
                        target_language: target,
                        conversation_correction: true,
                        turn_id: turn.turnId,
                        include_speech: true
                    }));
                });
                correction.append(select, button);
                card.appendChild(correction);
            }
            conversationTurns.scrollTop = conversationTurns.scrollHeight;
        }

        function reportError(title, message, alertType = 'connection-error') {
            if (app && app.showLiveAlert) {
                app.showLiveAlert(alertType, title, message);
            } else {
                console.error(title, message);
            }
        }

        function describeError(error) {
            if (error instanceof Error) return error.message;
            if (error && typeof error === 'object') {
                const parts = [error.message, error.details, error.hint]
                    .filter((part) => typeof part === 'string' && part.length > 0);
                if (typeof error.code === 'string') parts.push(`Code: ${error.code}`);
                if (parts.length) return parts.join(' ');
            }
            return typeof error === 'string' ? error : 'An unexpected error occurred.';
        }

        function updateCounts() {
            if (sourceCharCount && sourceTranscript) {
                sourceCharCount.textContent = String(sourceTranscript.value.length);
            }
            if (targetCharCount && targetTranslation) {
                targetCharCount.textContent = String(targetTranslation.value.length);
            }
        }

        function updateTextPanels() {
            sourceTranscript.value = (baseSource + currentSource).trimStart();
            sourceTranscript.scrollTop = sourceTranscript.scrollHeight;
            targetTranslation.scrollTop = targetTranslation.scrollHeight;
            updateCounts();
        }

        function releaseAudio() {
            if (processor) {
                try { processor.disconnect(); } catch (e) {}
                processor = null;
            }
            if (mediaStream) {
                try { mediaStream.getTracks().forEach((track) => track.stop()); } catch (e) {}
                mediaStream = null;
            }
            if (audioContext) {
                try { void audioContext.close(); } catch (e) {}
                audioContext = null;
            }
        }

        async function completeSession(sessionId) {
            const idToFinish = sessionId || activeSessionId;
            activeSessionId = null;
            if (idToFinish && app && app.finishTranslationSession) {
                try {
                    await app.finishTranslationSession(idToFinish);
                } catch (error) {
                    console.warn('Could not complete session status:', error);
                }
            }
        }

        async function stopListening() {
            if (isStopping) return;
            isStopping = true;
            starting = false;
            startAttemptId += 1;
            if (cancelPendingStart) {
                cancelPendingStart();
                cancelPendingStart = null;
            }

            // 1. Immediately disconnect audio processor and microphone
            releaseAudio();

            // 2. Tear down active WebSocket after allowing final results to arrive
            const currentWs = ws;

            if (currentWs) {
                if (currentWs.readyState === WebSocket.OPEN) {
                    try {
                        currentWs.send(JSON.stringify({ type: 'end_utterance' }));
                    } catch (e) {}

                    // Allow backend up to 1.2s to deliver translation_final before closing socket
                    await new Promise((resolve) => {
                        const originalOnMessage = currentWs.onmessage;
                        const timer = setTimeout(resolve, 1200);

                        currentWs.onmessage = (event) => {
                            if (originalOnMessage) {
                                originalOnMessage(event);
                            }
                            try {
                                const payload = JSON.parse(event.data);
                                if (payload.type === 'translation_final' || payload.type === 'error' || payload.type === 'language_detection_failed') {
                                    clearTimeout(timer);
                                    resolve();
                                }
                            } catch {}
                        };
                        currentWs.onerror = () => { clearTimeout(timer); resolve(); };
                        currentWs.onclose = () => { clearTimeout(timer); resolve(); };
                    });
                }

                if (ws === currentWs) ws = null;
                currentWs.onopen = null;
                currentWs.onmessage = null;
                currentWs.onerror = null;
                currentWs.onclose = null;

                try {
                    currentWs.close();
                } catch (e) {}
            }

            // 3. Mark session complete in Supabase DB if it was an authenticated session
            const currentSessionId = activeSessionId;
            activeSessionId = null;

            // 4. Reset flags and UI state
            isStopping = false;
            setStatus(false);

            if (currentSessionId && !currentSessionId.startsWith('guest-')) {
                await completeSession(currentSessionId);
            }
            if (sourceLangBadge) {
                sourceLangBadge.textContent = sourceLanguageSelect.value === 'Auto'
                    ? (detectedSourceLanguage || 'Auto-detect')
                    : sourceLanguageSelect.value;
            }
        }

        async function startListening() {
            if (starting) return;

            // If a previous session is lingering, clean it up first
            if (isStopping || ws || activeSessionId) {
                await stopListening();
            }

            const sourceLanguage = sourceLanguageSelect.value;
            const targetLanguage = targetLanguageSelect.value;
            const conversationMode = isConversationMode();

            if (conversationMode && sourceLanguage === 'Auto') {
                reportError('Choose both languages', 'Conversation Mode requires two selected languages.');
                return;
            }
            if (sourceLanguage !== 'Auto' && sourceLanguage === targetLanguage) {
                reportError('Invalid Language Pair', 'Please choose two different languages for translation.');
                return;
            }

            starting = true;
            const attemptId = ++startAttemptId;
            let cancelAttempt;
            const cancelled = new Promise((resolve) => {
                cancelAttempt = () => resolve(null);
            });
            cancelPendingStart = cancelAttempt;
            isStopping = false;
            setStatus(false);

            sourceTranscript.value = '';
            targetTranslation.value = '';
            if (conversationTurns) conversationTurns.replaceChildren();
            conversationTurnCards.clear();
            if (conversationPreview) {
                conversationPreview.textContent = '';
                conversationPreview.classList.add('hidden');
            }
            baseSource = '';
            baseTarget = '';
            currentSource = '';
            detectedSourceLanguage = null;
            if (conversationTurns) conversationTurns.replaceChildren();
            conversationTurnCards.clear();
            if (conversationPreview) {
                conversationPreview.textContent = '';
                conversationPreview.classList.add('hidden');
            }
            updateModeUI();
            if (sourceLangBadge) {
                sourceLangBadge.textContent = sourceLanguage === 'Auto'
                    ? 'Detecting...'
                    : sourceLanguage;
            }

            try {
                const context = new (window.AudioContext || window.webkitAudioContext)({
                    sampleRate: 16000
                });
                audioContext = context;
                const microphoneRequest = navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
                    if (attemptId !== startAttemptId) {
                        stream.getTracks().forEach((track) => track.stop());
                        return null;
                    }
                    mediaStream = stream;
                    return stream;
                });
                const audioReady = Promise.all([context.resume(), microphoneRequest])
                    .then(([, stream]) => stream);
                const stream = await Promise.race([audioReady, cancelled]);
                if (!stream || attemptId !== startAttemptId) return;
                if (context.state !== 'running') {
                    throw new Error('The browser audio context could not be started.');
                }

                let processorNode;
                try {
                    await context.audioWorklet.addModule('/audio_capture_processor.js');
                    if (attemptId !== startAttemptId) return;

                    processorNode = new AudioWorkletNode(context, 'audio-capture-processor', {
                        numberOfInputs: 1,
                        numberOfOutputs: 1,
                        outputChannelCount: [1]
                    });
                    processorNode.port.onmessage = (event) => {
                        if (!ws || ws.readyState !== WebSocket.OPEN || isStopping) return;
                        ws.send(event.data);
                    };
                } catch (workletErr) {
                    console.warn('AudioWorklet unavailable, falling back to ScriptProcessor:', workletErr);
                    processorNode = context.createScriptProcessor(2048, 1, 1);
                    processorNode.onaudioprocess = (e) => {
                        if (!ws || ws.readyState !== WebSocket.OPEN || isStopping) return;
                        const inputChannel = e.inputBuffer.getChannelData(0);
                        const pcm16 = new Int16Array(inputChannel.length);
                        for (let i = 0; i < inputChannel.length; i++) {
                            const sample = Math.max(-1, Math.min(1, inputChannel[i]));
                            pcm16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
                        }
                        ws.send(pcm16.buffer);
                    };
                }

                processor = processorNode;
                const source = context.createMediaStreamSource(mediaStream);
                source.connect(processor);
                processor.connect(context.destination);

                // Create session in Supabase database if logged in, otherwise use a guest session
                let session = null;
                try {
                    const sessionPromise = app.createTranslationSession(sourceLanguage, targetLanguage).then((s) => {
                        if (attemptId !== startAttemptId) {
                            void app.finishTranslationSession(s.sessionId).catch((error) => {
                                console.warn('Could not complete cancelled session:', error);
                            });
                            return null;
                        }
                        return s;
                    });
                    session = await Promise.race([sessionPromise, cancelled]);
                } catch (sessionErr) {
                    console.info('Using guest translation session:', sessionErr && sessionErr.message);
                    session = {
                        sessionId: 'guest-' + Date.now(),
                        accessToken: 'guest',
                        sourceLanguageCode: sourceLanguage === 'Auto' ? 'auto' : (languageCodes[sourceLanguage] || 'en'),
                        targetLanguageCode: languageCodes[targetLanguage] || 'hi',
                        sourceLanguageId: null,
                        targetLanguageId: null
                    };
                }
                if (!session || attemptId !== startAttemptId) return;
                if (!session.sessionId.startsWith('guest-')) {
                    activeSessionId = session.sessionId;
                }

                const newWs = new WebSocket(getTranslationSocketUrl());
                ws = newWs;
                if (cancelPendingStart === cancelAttempt) cancelPendingStart = null;

                newWs.onopen = () => {
                    if (isStopping || ws !== newWs || newWs.readyState !== WebSocket.OPEN) {
                        try { newWs.close(); } catch (e) {}
                        return;
                    }
                    newWs.send(JSON.stringify({
                        session_id: session.sessionId,
                        source_language: conversationMode ? 'auto' : session.sourceLanguageCode,
                        target_language: session.targetLanguageCode,
                        source_language_id: session.sourceLanguageId,
                        target_language_id: session.targetLanguageId,
                        token: session.accessToken,
                        conversation_mode: conversationMode,
                        conversation_languages: conversationMode
                            ? [languageCodes[sourceLanguage], languageCodes[targetLanguage]]
                            : undefined
                    }));
                    starting = false;
                    setStatus(true);
                };

                newWs.onmessage = (event) => {
                    if (ws !== newWs) return;
                    let data;
                    try {
                        data = JSON.parse(event.data);
                    } catch {
                        reportError('Invalid backend response', 'The translation server returned an invalid message.');
                        void stopListening();
                        return;
                    }

                    if (data.type === 'info') {
                        if (app && app.showLiveAlert) {
                            app.showLiveAlert('info', data.title || 'Notice', data.message || '');
                        }
                        return;
                    }

                    if (data.type === 'error') {
                        const message = data.message || 'The translation server reported an error.';
                        const category = data.error_category;
                        const isAutoDetectionError =
                            sourceLanguage === 'Auto' &&
                            (message.includes('Auto-detection requires') ||
                                message.includes('SARVAM_API_KEY'));

                        let title = data.title;
                        let alertType = 'connection-error';

                        if (!title) {
                            if (isAutoDetectionError) {
                                title = 'Auto-detection is not configured';
                            } else if (category === 'authentication_error') {
                                title = 'ASR Authentication Failed';
                                alertType = 'connection-error';
                            } else if (category === 'provider_limits') {
                                title = 'Provider Limit Reached';
                                alertType = 'translation-error';
                            } else if (category === 'network_failure') {
                                title = 'ASR Network Failure';
                                alertType = 'connection-error';
                            } else if (category === 'configuration_error') {
                                title = 'Configuration Error';
                                alertType = 'translation-error';
                            } else {
                                title = 'Translation service error';
                                alertType = 'translation-error';
                            }
                        } else if (category === 'provider_limits' || category === 'configuration_error') {
                            alertType = 'translation-error';
                        }

                        const displayMsg = isAutoDetectionError
                            ? `${message} Configure SARVAM_API_KEY in .env, then restart the backend.`
                            : message;

                        reportError(title, displayMsg, alertType);
                        void stopListening();
                        return;
                    }
                    if (data.type === 'language_detection_failed') {
                        if (conversationMode) {
                            if (conversationTurnStatus) conversationTurnStatus.textContent = 'Language needs confirmation';
                            renderConversationTurn({
                                turnId: data.turn_id,
                                language: data.language,
                                originalText: data.text || currentSource,
                                message: data.message || 'Choose the language for this turn.',
                                uncertain: true
                            });
                            currentSource = '';
                            if (conversationPreview) {
                                conversationPreview.textContent = '';
                                conversationPreview.classList.add('hidden');
                            }
                            return;
                        }
                        reportError('Language not recognized', data.message || 'Please try speaking again.');
                        void stopListening();
                        return;
                    }
                    if (data.type === 'asr_partial' || data.type === 'asr_final') {
                        if (data.language && languageNames[data.language]) {
                            detectedSourceLanguage = languageNames[data.language];
                            if (sourceLangBadge) {
                                sourceLangBadge.textContent = detectedSourceLanguage;
                            }
                        }
                        currentSource = data.text || '';
                        if (conversationMode) {
                            if (conversationPreview) {
                                conversationPreview.textContent = currentSource
                                    ? `Hearing: ${currentSource}`
                                    : '';
                                conversationPreview.classList.toggle('hidden', !currentSource);
                            }
                            return;
                        }
                        updateTextPanels();
                        return;
                    }
                    if (data.type === 'translation_partial') {
                        if (data.language && languageNames[data.language]) {
                            detectedSourceLanguage = languageNames[data.language];
                            if (sourceLangBadge) {
                                sourceLangBadge.textContent = detectedSourceLanguage;
                            }
                        }
                        targetTranslation.value = baseTarget + (data.text || '') + '...';
                        targetTranslation.scrollTop = targetTranslation.scrollHeight;
                        updateCounts();
                        return;
                    }
                    if (data.type === 'translation_final') {
                        if (data.language && languageNames[data.language]) {
                            detectedSourceLanguage = languageNames[data.language];
                            if (sourceLangBadge) {
                                sourceLangBadge.textContent = detectedSourceLanguage;
                            }
                        }
                        if (conversationMode) {
                            renderConversationTurn({
                                turnId: data.turn_id,
                                language: data.language,
                                targetLanguage: data.target_language,
                                originalText: data.original_text || currentSource,
                                translatedText: data.text || data.translated_text || ''
                            });
                            currentSource = '';
                            if (conversationPreview) {
                                conversationPreview.textContent = '';
                                conversationPreview.classList.add('hidden');
                            }
                            if (conversationTurnStatus) conversationTurnStatus.textContent = 'Listening for either language';
                            if (data.audio_base64) {
                                const audio = new Audio("data:audio/wav;base64," + data.audio_base64);
                                audio.play().catch(e => console.warn('Audio playback prevented:', e));
                            }
                            return;
                        }
                        baseSource += `${currentSource} `;
                        baseTarget += `${data.text || ''} `;
                        currentSource = '';
                        sourceTranscript.value = baseSource.trim();
                        targetTranslation.value = baseTarget.trim();
                        sourceTranscript.scrollTop = sourceTranscript.scrollHeight;
                        targetTranslation.scrollTop = targetTranslation.scrollHeight;
                        updateCounts();

                        if (data.audio_base64) {
                            const audio = new Audio("data:audio/wav;base64," + data.audio_base64);
                            audio.play().catch(e => console.warn('Audio playback prevented:', e));
                        }
                    }

                    if (data.type === 'audio_ready' && data.audio_base64) {
                        try {
                            const audio = new Audio("data:audio/wav;base64," + data.audio_base64);
                            audio.play().catch(e => console.warn('Audio playback prevented:', e));
                        } catch (e) {
                            console.warn('Audio init notice:', e);
                        }
                        return;
                    }
                };

                newWs.onerror = () => {
                    if (ws !== newWs) return;
                    reportError('Connection failed', 'Could not connect to the translation server. Check that the backend is running.');
                    void stopListening();
                };

                newWs.onclose = () => {
                    if (ws === newWs) {
                        void stopListening();
                    }
                };
            } catch (error) {
                if (attemptId !== startAttemptId) return;
                console.error('startListening exception:', error);
                starting = false;
                isStopping = false;
                releaseAudio();
                if (ws) {
                    try { ws.close(); } catch (e) {}
                    ws = null;
                }
                const failedSessionId = activeSessionId;
                activeSessionId = null;
                setStatus(false);
                if (failedSessionId) {
                    await completeSession(failedSessionId);
                }
                reportError(
                    'Could not start translation',
                    describeError(error)
                );
            } finally {
                if (cancelPendingStart === cancelAttempt) cancelPendingStart = null;
            }
        }

        newStartBtn.addEventListener('click', () => {
            void startListening();
        });

        newStopBtn.addEventListener('click', () => {
            void stopListening();
        });

        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                if (activeTextAbortController) {
                    activeTextAbortController.abort();
                    activeTextAbortController = null;
                }
                clearTimeout(typingTimer);
                baseSource = '';
                baseTarget = '';
                currentSource = '';
                sourceTranscript.value = '';
                targetTranslation.value = '';
                targetTranslation.dispatchEvent(new Event('input', { bubbles: true }));
                updateCounts();
                if (sourceLanguageSelect.value === 'Auto' && sourceLangBadge) {
                    sourceLangBadge.textContent = 'Auto-detect';
                }
                if (targetHint) {
                    targetHint.textContent = 'Awaiting input';
                }
            });
        }

        // Coalesce paired selector/swap events so they cause only one session restart.
        function handleLanguageChange() {
            if (!ws && !starting && !languageRestartInProgress) {
                if (sourceTranscript.value.trim()) {
                    clearTimeout(typingTimer);
                    void performTextTranslation(true);
                }
                return;
            }
            if (languageChangeTimer) clearTimeout(languageChangeTimer);
            languageChangeTimer = setTimeout(() => {
                languageChangeTimer = null;
                if (languageRestartInProgress) {
                    languageRestartPending = true;
                    return;
                }

                languageRestartInProgress = true;
                void (async () => {
                    do {
                        languageRestartPending = false;
                        await stopListening();
                        await startListening();
                    } while (languageRestartPending);
                })().catch((error) => {
                    reportError('Could not restart translation', describeError(error));
                }).finally(() => {
                    languageRestartInProgress = false;
                });
            }, 120);
        }

        sourceLanguageSelect.addEventListener('change', () => {
            void handleLanguageChange();
        });

        targetLanguageSelect.addEventListener('change', () => {
            void handleLanguageChange();
        });

        if (swapBtn) {
            swapBtn.addEventListener('click', () => {
                setTimeout(() => {
                    void handleLanguageChange();
                }, 50);
            });
        }

        if (translationMode) {
            translationMode.addEventListener('change', () => {
                updateModeUI();
                if (ws || starting) void handleLanguageChange();
            });
        }

        updateModeUI();

        // Dedicated Text-to-Text translation system
        let typingTimer = null;
        let activeTextAbortController = null;
        let activeTextRequestId = 0;
        let lastPlayedAudio = null;

        async function performTextTranslation(immediate = false, speak = false) {
            const text = (sourceTranscript.value || '').trim();
            updateCounts();

            if (!text) {
                if (activeTextAbortController) {
                    activeTextAbortController.abort();
                    activeTextAbortController = null;
                }
                targetTranslation.value = '';
                targetTranslation.dispatchEvent(new Event('input', { bubbles: true }));
                updateCounts();
                if (sourceLanguageSelect.value === 'Auto' && sourceLangBadge) {
                    sourceLangBadge.textContent = 'Auto-detect';
                }
                if (targetHint) {
                    targetHint.textContent = 'Awaiting input';
                }
                return;
            }

            if (sourceLanguageSelect.value === 'Auto' && sourceLangBadge) {
                sourceLangBadge.textContent = 'Detecting...';
            }
            if (targetHint) {
                targetHint.textContent = 'Translating...';
            }

            const currentId = ++activeTextRequestId;
            if (activeTextAbortController) {
                activeTextAbortController.abort();
            }
            activeTextAbortController = new AbortController();

            const srcCode = languageCodes[sourceLanguageSelect.value] || 'auto';
            const tgtCode = languageCodes[targetLanguageSelect.value] || 'hi';

            // 1. Try Fast HTTP REST API
            try {
                const httpUrl = `${getBackendHttpUrl()}/api/translate`;
                const response = await fetch(httpUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        text: text,
                        source_language: srcCode,
                        target_language: tgtCode,
                        include_speech: Boolean(speak)
                    }),
                    signal: activeTextAbortController.signal
                });

                if (response.ok) {
                    const data = await response.json();
                    if (currentId !== activeTextRequestId) return;

                    if (data.status === 'success' && data.translated_text !== undefined) {
                        targetTranslation.value = data.translated_text;
                        targetTranslation.dispatchEvent(new Event('input', { bubbles: true }));
                        updateCounts();
                        if (targetHint) {
                            targetHint.textContent = 'Translation complete';
                        }
                        const detected = data.detected_language || data.language;
                        if (detected && languageNames[detected] && sourceLangBadge) {
                            detectedSourceLanguage = languageNames[detected];
                            sourceLangBadge.textContent = detectedSourceLanguage;
                        }
                        if (data.audio_base64 && speak) {
                            try {
                                if (lastPlayedAudio) lastPlayedAudio.pause();
                                lastPlayedAudio = new Audio("data:audio/wav;base64," + data.audio_base64);
                                lastPlayedAudio.play().catch(e => console.warn('Audio notice:', e));
                            } catch (e) {}
                        }
                        return;
                    }
                }
            } catch (err) {
                if (err.name === 'AbortError') return;
                console.warn('[Text Translate] HTTP API failed, trying WS fallback:', err);
            }

            // 2. WebSocket Fallback if HTTP fails
            try {
                if (currentId !== activeTextRequestId) return;
                const tempWs = new WebSocket(getTranslationSocketUrl());
                let timeoutId = setTimeout(() => {
                    try { tempWs.close(); } catch (e) {}
                }, 8000);

                tempWs.onopen = () => {
                    tempWs.send(JSON.stringify({
                        source_language: srcCode,
                        target_language: tgtCode,
                        text_to_translate: text,
                        include_speech: Boolean(speak)
                    }));
                };

                tempWs.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        if (data.type === 'translation_final' || data.translated_text || data.text) {
                            if (currentId === activeTextRequestId) {
                                targetTranslation.value = data.translated_text || data.text || '';
                                targetTranslation.dispatchEvent(new Event('input', { bubbles: true }));
                                updateCounts();
                                if (targetHint) {
                                    targetHint.textContent = 'Translation complete';
                                }
                                const detected = data.detected_language || data.language;
                                if (detected && languageNames[detected] && sourceLangBadge) {
                                    detectedSourceLanguage = languageNames[detected];
                                    sourceLangBadge.textContent = detectedSourceLanguage;
                                }
                                if (data.audio_base64 && speak) {
                                    try {
                                        if (lastPlayedAudio) lastPlayedAudio.pause();
                                        lastPlayedAudio = new Audio("data:audio/wav;base64," + data.audio_base64);
                                        lastPlayedAudio.play().catch(e => console.warn('Audio notice:', e));
                                    } catch (e) {}
                                }
                            }
                            clearTimeout(timeoutId);
                            tempWs.close();
                        }
                    } catch (e) {
                        console.error('Error parsing WS translation:', e);
                    }
                };

                tempWs.onerror = () => {
                    clearTimeout(timeoutId);
                    try { tempWs.close(); } catch (e) {}
                    if (targetHint && currentId === activeTextRequestId) {
                        targetHint.textContent = 'Translation failed';
                    }
                };
            } catch (wsErr) {
                console.error('[Text Translate] WS fallback failed:', wsErr);
            }
        }

        sourceTranscript.addEventListener('input', () => {
            if (ws || starting || isStopping) return;
            clearTimeout(typingTimer);
            updateCounts();
            const text = sourceTranscript.value.trim();
            if (!text) {
                void performTextTranslation(true);
                return;
            }
            if (sourceLanguageSelect.value === 'Auto' && sourceLangBadge) {
                sourceLangBadge.textContent = 'Detecting...';
            }
            if (targetHint) {
                targetHint.textContent = 'Typing...';
            }
            typingTimer = setTimeout(() => {
                void performTextTranslation();
            }, 350);
        });

        sourceTranscript.addEventListener('keydown', (e) => {
            if (ws || starting || isStopping) return;
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                clearTimeout(typingTimer);
                void performTextTranslation(true);
            }
        });

        if (translateSourceBtn) {
            translateSourceBtn.addEventListener('click', () => {
                clearTimeout(typingTimer);
                void performTextTranslation(true);
            });
        }

        if (speakTargetBtn) {
            speakTargetBtn.addEventListener('click', () => {
                const text = (targetTranslation.value || '').trim();
                if (!text) return;
                void performTextTranslation(true, true);
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTranslator);
    } else {
        initTranslator();
    }
})();
