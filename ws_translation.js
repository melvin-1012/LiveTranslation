document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        const startBtn = document.getElementById('startBtn');
        const stopBtn = document.getElementById('stopBtn');
        const sourceTranscript = document.getElementById('sourceTranscript');
        const targetTranslation = document.getElementById('targetTranslation');
        const sourceLanguageSelect = document.getElementById('sourceLanguage');
        const targetLanguageSelect = document.getElementById('targetLanguage');
        const startBtnText = document.getElementById('startBtnText');
        const statusText = document.getElementById('statusText');
        const statusBadge = document.getElementById('statusBadge');
        const audioWaves = document.getElementById('audioWaves');
        const app = window.LiveIndicTranslator;

        if (
            !startBtn || !stopBtn || !sourceTranscript || !targetTranslation ||
            !sourceLanguageSelect || !targetLanguageSelect || !app
        ) return;

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
        }

        function reportError(title, message) {
            app.showLiveAlert('connection-error', title, message);
        }

        function updateTextPanels() {
            sourceTranscript.value = baseSource + currentSource;
            sourceTranscript.scrollTop = sourceTranscript.scrollHeight;
            targetTranslation.scrollTop = targetTranslation.scrollHeight;
            sourceTranscript.dispatchEvent(new Event('input', { bubbles: true }));
            targetTranslation.dispatchEvent(new Event('input', { bubbles: true }));
        }

        function releaseAudio() {
            if (processor) {
                processor.disconnect();
                processor = null;
            }
            if (mediaStream) {
                mediaStream.getTracks().forEach((track) => track.stop());
                mediaStream = null;
            }
            if (audioContext) {
                void audioContext.close();
                audioContext = null;
            }
        }

        async function completeSession() {
            const sessionId = activeSessionId;
            activeSessionId = null;
            if (sessionId) {
                try {
                    await app.finishTranslationSession(sessionId);
                } catch (error) {
                    reportError(
                        'Could not save session status',
                        error instanceof Error ? error.message : String(error)
                    );
                }
            }
        }

        async function startListening() {
            if (starting || ws || activeSessionId) return;
            starting = true;
            setStatus(false);
            sourceTranscript.value = '';
            targetTranslation.value = '';
            baseSource = '';
            baseTarget = '';
            currentSource = '';
            isStopping = false;

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

                const sourceLanguage = sourceLanguageSelect.value;
                const targetLanguage = targetLanguageSelect.value;
                const session = await app.createTranslationSession(sourceLanguage, targetLanguage);
                activeSessionId = session.sessionId;

                const socketProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                ws = new WebSocket(`${socketProtocol}//${window.location.hostname}:8000/ws/translate`);

                ws.onopen = () => {
                    if (isStopping || !ws || ws.readyState !== WebSocket.OPEN) {
                        ws.close();
                        return;
                    }
                    ws.send(JSON.stringify({
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

                ws.onmessage = (event) => {
                    let data;
                    try {
                        data = JSON.parse(event.data);
                    } catch {
                        reportError('Invalid backend response', 'The translation server returned an invalid message.');
                        stopListening();
                        return;
                    }

                    if (data.type === 'error') {
                        reportError('Translation service error', data.message || 'The translation server reported an error.');
                        stopListening();
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
                        targetTranslation.dispatchEvent(new Event('input', { bubbles: true }));
                        return;
                    }
                    if (data.type === 'translation_final') {
                        baseSource += `${currentSource} `;
                        baseTarget += `${data.text || ''} `;
                        currentSource = '';
                        sourceTranscript.value = baseSource.trim();
                        targetTranslation.value = baseTarget.trim();
                        sourceTranscript.dispatchEvent(new Event('input', { bubbles: true }));
                        targetTranslation.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                };

                ws.onerror = () => {
                    reportError('Connection failed', 'Could not connect to the translation server. Check that the backend is running.');
                    stopListening();
                };

                ws.onclose = () => {
                    releaseAudio();
                    ws = null;
                    starting = false;
                    isStopping = false;
                    setStatus(false);
                    void completeSession();
                };
            } catch (error) {
                starting = false;
                setStatus(false);
                releaseAudio();
                if (ws && ws.readyState !== WebSocket.CLOSED) ws.close();
                await completeSession();
                reportError(
                    'Could not start translation',
                    error instanceof Error ? error.message : String(error)
                );
            }
        }

        function stopListening() {
            if (isStopping) return;
            isStopping = true;
            starting = false;
            releaseAudio();

            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'end_utterance' }));
                setStatus(false);
                return;
            }
            if (ws) {
                ws.close();
                return;
            }

            isStopping = false;
            setStatus(false);
            void completeSession();
        }

        newStartBtn.addEventListener('click', () => {
            void startListening();
        });
        newStopBtn.addEventListener('click', stopListening);
    }, 500);
});
