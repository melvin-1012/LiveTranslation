// ws_translation.js - Real-time Voice Recognition & Dravidian Translation with Supabase Integration
(function() {
    function initTranslator() {
        const startBtn = document.getElementById('startBtn');
        const stopBtn = document.getElementById('stopBtn');
        const clearBtn = document.getElementById('clearBtn');
        const sourceTranscript = document.getElementById('sourceTranscript');
        const targetTranslation = document.getElementById('targetTranslation');
        const sourceLanguageSelect = document.getElementById('sourceLanguage');
        const targetLanguageSelect = document.getElementById('targetLanguage');
        const sourceLangBadge = document.getElementById('sourceLangBadge');
        const startBtnText = document.getElementById('startBtnText');
        const statusText = document.getElementById('statusText');
        const statusBadge = document.getElementById('statusBadge');
        const audioWaves = document.getElementById('audioWaves');
        const swapBtn = document.getElementById('swapLanguagesBtn');
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

        function setStatus(listening) {
            newStartBtn.disabled = listening || starting;
            newStopBtn.disabled = !listening && !starting;
            if (startBtnText) startBtnText.textContent = listening ? 'Listening...' : 'Start Speaking';
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

        function reportError(title, message) {
            if (app && app.showLiveAlert) {
                app.showLiveAlert('connection-error', title, message);
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

        function updateTextPanels() {
            sourceTranscript.value = (baseSource + currentSource).trimStart();
            sourceTranscript.scrollTop = sourceTranscript.scrollHeight;
            targetTranslation.scrollTop = targetTranslation.scrollHeight;
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

            // 2. Tear down active WebSocket
            const currentWs = ws;
            ws = null;

            if (currentWs) {
                currentWs.onopen = null;
                currentWs.onmessage = null;
                currentWs.onerror = null;
                currentWs.onclose = null;

                try {
                    if (currentWs.readyState === WebSocket.OPEN) {
                        currentWs.send(JSON.stringify({ type: 'end_utterance' }));
                    }
                } catch (e) {}

                try {
                    currentWs.close();
                } catch (e) {}
            }

            // 3. Mark session complete in Supabase DB
            const currentSessionId = activeSessionId;
            activeSessionId = null;

            // 4. Reset flags and UI state
            isStopping = false;
            setStatus(false);

            if (currentSessionId) {
                await completeSession(currentSessionId);
            }
            if (sourceLangBadge) {
                sourceLangBadge.textContent = sourceLanguageSelect.value === 'Auto'
                    ? 'Auto-detect'
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
            baseSource = '';
            baseTarget = '';
            currentSource = '';
            detectedSourceLanguage = null;
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

                await context.audioWorklet.addModule('/audio_capture_processor.js');
                if (attemptId !== startAttemptId) return;

                const source = context.createMediaStreamSource(mediaStream);
                processor = new AudioWorkletNode(context, 'audio-capture-processor', {
                    numberOfInputs: 1,
                    numberOfOutputs: 1,
                    outputChannelCount: [1]
                });
                processor.port.onmessage = (event) => {
                    if (!ws || ws.readyState !== WebSocket.OPEN || isStopping) return;
                    ws.send(event.data);
                };
                source.connect(processor);
                processor.connect(context.destination);

                // Create session in Supabase database
                const sessionRequest = app.createTranslationSession(sourceLanguage, targetLanguage).then((session) => {
                    if (attemptId !== startAttemptId) {
                        void app.finishTranslationSession(session.sessionId).catch((error) => {
                            console.warn('Could not complete cancelled session:', error);
                        });
                        return null;
                    }
                    return session;
                });
                const session = await Promise.race([sessionRequest, cancelled]);
                if (!session || attemptId !== startAttemptId) return;
                activeSessionId = session.sessionId;

                const socketProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                const newWs = new WebSocket(`${socketProtocol}//${window.location.hostname}:8000/ws/translate`);
                ws = newWs;
                if (cancelPendingStart === cancelAttempt) cancelPendingStart = null;

                newWs.onopen = () => {
                    if (isStopping || ws !== newWs || newWs.readyState !== WebSocket.OPEN) {
                        try { newWs.close(); } catch (e) {}
                        return;
                    }
                    newWs.send(JSON.stringify({
                        session_id: session.sessionId,
                        source_language: session.sourceLanguageCode,
                        target_language: session.targetLanguageCode,
                        source_language_id: session.sourceLanguageId,
                        target_language_id: session.targetLanguageId,
                        token: session.accessToken
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

                    if (data.type === 'error') {
                        const message = data.message || 'The translation server reported an error.';
                        const isAutoDetectionError =
                            sourceLanguage === 'Auto' &&
                            (message.includes('Auto-detection requires') ||
                                message.includes('SARVAM_API_KEY'));
                        reportError(
                            isAutoDetectionError ? 'Auto-detection is not configured' : 'Translation service error',
                            isAutoDetectionError
                                ? `${message} Set TRANSLATION_PROVIDER=sarvam and configure SARVAM_API_KEY in backend/.env, then restart the backend.`
                                : message
                        );
                        void stopListening();
                        return;
                    }
                    if (data.type === 'language_detection_failed') {
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
                        updateTextPanels();
                        return;
                    }
                    if (data.type === 'translation_partial') {
                        targetTranslation.value = baseTarget + (data.text || '') + '...';
                        targetTranslation.scrollTop = targetTranslation.scrollHeight;
                        return;
                    }
                    if (data.type === 'translation_final') {
                        baseSource += `${currentSource} `;
                        baseTarget += `${data.text || ''} `;
                        currentSource = '';
                        sourceTranscript.value = baseSource.trim();
                        targetTranslation.value = baseTarget.trim();
                        sourceTranscript.scrollTop = sourceTranscript.scrollHeight;
                        targetTranslation.scrollTop = targetTranslation.scrollHeight;

                        if (data.audio_base64) {
                            const audio = new Audio("data:audio/wav;base64," + data.audio_base64);
                            audio.play().catch(e => console.warn('Audio playback prevented:', e));
                        }
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
                baseSource = '';
                baseTarget = '';
                currentSource = '';
                sourceTranscript.value = '';
                targetTranslation.value = '';
            });
        }

        // Coalesce paired selector/swap events so they cause only one session restart.
        function handleLanguageChange() {
            if (!ws && !starting && !languageRestartInProgress) return;
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

        // Debounced Text-to-Text translation when not speaking
        let typingTimer = null;
        sourceTranscript.addEventListener('input', () => {
            if (ws || starting || isStopping || newStartBtn.disabled) return;
            clearTimeout(typingTimer);
            const text = sourceTranscript.value.trim();
            if (!text) {
                targetTranslation.value = '';
                return;
            }
            typingTimer = setTimeout(() => {
                const socketProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                const tempWs = new WebSocket(`${socketProtocol}//${window.location.hostname}:8000/ws/translate`);
                tempWs.onopen = () => {
                    const srcCode = languageCodes[sourceLanguageSelect.value] || 'en';
                    const tgtCode = languageCodes[targetLanguageSelect.value] || 'hi';
                    tempWs.send(JSON.stringify({
                        source_language: srcCode,
                        target_language: tgtCode,
                        text_to_translate: text
                    }));
                };
                tempWs.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        if (data.translated_text || data.text) {
                            targetTranslation.value = data.translated_text || data.text;
                        }
                        if (data.audio_base64) {
                            const audio = new Audio("data:audio/wav;base64," + data.audio_base64);
                            audio.play().catch(e => console.warn('Audio playback prevented:', e));
                        }
                    } catch {}
                    tempWs.close();
                };
            }, 600);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTranslator);
    } else {
        initTranslator();
    }
})();
