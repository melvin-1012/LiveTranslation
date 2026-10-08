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

        function setStatus(listening) {
            newStartBtn.disabled = listening || starting;
            newStopBtn.disabled = !listening;
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
        }

        async function startListening() {
            if (starting) return;

            // If a previous session is lingering, clean it up first
            if (isStopping || ws || activeSessionId) {
                await stopListening();
            }

            const sourceLanguage = sourceLanguageSelect.value;
            const targetLanguage = targetLanguageSelect.value;

            if (sourceLanguage === targetLanguage) {
                reportError('Invalid Language Pair', 'Please choose two different languages for translation.');
                return;
            }

            starting = true;
            isStopping = false;
            setStatus(false);

            sourceTranscript.value = '';
            targetTranslation.value = '';
            baseSource = '';
            baseTarget = '';
            currentSource = '';

            try {
                const context = new (window.AudioContext || window.webkitAudioContext)({
                    sampleRate: 16000
                });
                audioContext = context;
                const microphoneRequest = navigator.mediaDevices.getUserMedia({ audio: true });
                await Promise.all([context.resume(), microphoneRequest.then((stream) => {
                    mediaStream = stream;
                })]);
                if (context.state !== 'running' || !mediaStream) {
                    throw new Error('The browser audio context could not be started.');
                }

                const source = context.createMediaStreamSource(mediaStream);
                processor = context.createScriptProcessor(4096, 1, 1);
                processor.onaudioprocess = (event) => {
                    if (!ws || ws.readyState !== WebSocket.OPEN || isStopping) return;
                    const inputData = event.inputBuffer.getChannelData(0);
                    const pcm16 = new Int16Array(inputData.length);
                    for (let index = 0; index < inputData.length; index++) {
                        const sample = Math.max(-1, Math.min(1, inputData[index]));
                        pcm16[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
                    }
                    ws.send(pcm16.buffer);
                };
                source.connect(processor);
                processor.connect(context.destination);

                // Create session in Supabase database
                const session = await app.createTranslationSession(sourceLanguage, targetLanguage);
                activeSessionId = session.sessionId;

                const socketProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                const newWs = new WebSocket(`${socketProtocol}//${window.location.hostname}:8000/ws/translate`);
                ws = newWs;

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
                        reportError('Translation service error', data.message || 'The translation server reported an error.');
                        void stopListening();
                        return;
                    }
                    if (data.type === 'asr_partial' || data.type === 'asr_final') {
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

        // Dynamic language switching & swap handling
        async function handleLanguageChange() {
            if (ws && ws.readyState === WebSocket.OPEN) {
                console.log('[Lang] Language changed while speaking - restarting session for new pair');
                await stopListening();
                await startListening();
            }
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
