document.addEventListener('DOMContentLoaded', () => {
    // We delay slightly to let app.js initialize its DOM listeners first
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
        
        // 1. Clone buttons to strip the dummy Web Speech API listeners from app.js
        const newStartBtn = startBtn.cloneNode(true);
        startBtn.parentNode.replaceChild(newStartBtn, startBtn);
        
        const newStopBtn = stopBtn.cloneNode(true);
        stopBtn.parentNode.replaceChild(newStopBtn, stopBtn);

        let ws = null;
        let audioContext = null;
        let mediaStream = null;
        let processor = null;

        // Map frontend dropdown values to Google Translate language codes
        const languageCodes = {
            'English': 'en',
            'Tamil': 'ta',
            'Hindi': 'hi',
            'Telugu': 'te',
            'Kannada': 'kn',
            'Malayalam': 'ml'
        };

        function setStatus(status) {
            if (status === 'listening') {
                newStartBtn.disabled = true;
                newStopBtn.disabled = false;
                if(startBtnText) startBtnText.textContent = 'Listening...';
                if(statusText) statusText.textContent = 'Live Streaming';
                if(statusBadge) statusBadge.className = 'status-pill status-listening';
                if(audioWaves) audioWaves.classList.add('listening');
            } else {
                newStartBtn.disabled = false;
                newStopBtn.disabled = true;
                if(startBtnText) startBtnText.textContent = 'Start Speaking';
                if(statusText) statusText.textContent = 'Ready';
                if(statusBadge) statusBadge.className = 'status-pill status-ready';
                if(audioWaves) audioWaves.classList.remove('listening');
            }
        }

        async function startListening() {
            sourceTranscript.value = "";
            targetTranslation.value = "";
            
            // Connect to our FastAPI WebSocket Backend
            ws = new WebSocket('ws://localhost:8000/ws/translate');
            
            ws.onopen = async () => {
                console.log("✅ WebSocket connected to Gen-AI backend.");
                setStatus('listening');
                
                // Immediately send BOTH the requested target and source languages
                const targetLang = languageCodes[targetLanguageSelect.value] || 'hi';
                const sourceLang = languageCodes[sourceLanguageSelect.value] || 'en';
                ws.send(JSON.stringify({ language: targetLang, source_language: sourceLang }));

                // 🎙️ Capture Raw PCM Audio from Laptop Microphone
                try {
                    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    // Deepgram requires exactly 16000 Hz sample rate
                    audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
                    const source = audioContext.createMediaStreamSource(mediaStream);
                    
                    processor = audioContext.createScriptProcessor(4096, 1, 1);
                    
                    processor.onaudioprocess = (e) => {
                        const inputData = e.inputBuffer.getChannelData(0);
                        // Convert Float32 audio to Int16 PCM (Required by Deepgram)
                        const pcm16 = new Int16Array(inputData.length);
                        for (let i = 0; i < inputData.length; i++) {
                            let s = Math.max(-1, Math.min(1, inputData[i]));
                            pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                        }
                        if (ws && ws.readyState === WebSocket.OPEN) {
                            ws.send(pcm16.buffer); // Stream raw binary audio chunks
                        }
                    };
                    
                    source.connect(processor);
                    processor.connect(audioContext.destination);
                    
                } catch (err) {
                    console.error("Audio capture failed:", err);
                    alert("Microphone permission denied or not available.");
                    stopListening();
                }
            };

            // 🌐 Receive Translations from Backend
            let currentPartialSource = "";
            let currentPartialTarget = "";
            let baseSource = "";
            let baseTarget = "";

            ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                
                if (data.status === 'success') {
                    if (data.is_final) {
                        // Sentence finished! Lock it in.
                        baseSource += data.original_text + " ";
                        baseTarget += data.translated_text + " ";
                        
                        sourceTranscript.value = baseSource;
                        targetTranslation.value = baseTarget;
                    } else {
                        // Sentence is still forming. Show partials fast.
                        sourceTranscript.value = baseSource + data.original_text + "...";
                        targetTranslation.value = baseTarget + "..."; // Wait for final to show translation to prevent flickering
                    }
                    
                    // Auto-scroll to bottom
                    sourceTranscript.scrollTop = sourceTranscript.scrollHeight;
                    targetTranslation.scrollTop = targetTranslation.scrollHeight;
                }
            };

            ws.onerror = (error) => {
                console.error("WebSocket Error:", error);
                alert("Connection failed. Make sure server.py is running!");
                stopListening();
            };

            ws.onclose = () => {
                console.log("WebSocket connection closed.");
                stopListening();
            };
        }

        function stopListening() {
            if (processor) { processor.disconnect(); processor = null; }
            if (mediaStream) { mediaStream.getTracks().forEach(t => t.stop()); mediaStream = null; }
            if (audioContext) { audioContext.close(); audioContext = null; }
            if (ws) { ws.close(); ws = null; }
            setStatus('ready');
        }

        newStartBtn.addEventListener('click', startListening);
        newStopBtn.addEventListener('click', stopListening);
        
        // 🔄 Dynamic Language Switching over WebSocket
        targetLanguageSelect.addEventListener('change', () => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                const targetLang = languageCodes[targetLanguageSelect.value] || 'hi';
                ws.send(JSON.stringify({ language: targetLang }));
                console.log(`Sent target switch: ${targetLang}`);
            }
        });

        sourceLanguageSelect.addEventListener('change', () => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                const sourceLang = languageCodes[sourceLanguageSelect.value] || 'en';
                ws.send(JSON.stringify({ source_language: sourceLang }));
                console.log(`Sent source switch: ${sourceLang}`);
            }
        });
        
        const swapBtn = document.getElementById('swapLanguagesBtn');
        if (swapBtn) {
            swapBtn.addEventListener('click', () => {
                setTimeout(() => { 
                    if (ws && ws.readyState === WebSocket.OPEN) {
                        const targetLang = languageCodes[targetLanguageSelect.value] || 'hi';
                        const sourceLang = languageCodes[sourceLanguageSelect.value] || 'en';
                        ws.send(JSON.stringify({ language: targetLang, source_language: sourceLang }));
                        console.log(`Sent swap: ${sourceLang} -> ${targetLang}`);
                    }
                }, 100); // 100ms delay to allow app.js to update the DOM select values first
            });
        }
        
        // ✍️ Text-to-Text translation (Debounced)
        let typingTimer;
        sourceTranscript.addEventListener('input', () => {
            // Only do text-to-text if we are NOT currently recording audio
            if (newStartBtn.disabled) return; 

            clearTimeout(typingTimer);
            typingTimer = setTimeout(() => {
                const text = sourceTranscript.value.trim();
                if (text && (!ws || ws.readyState !== WebSocket.OPEN)) {
                    // Open a temporary socket just for text if not connected
                    ws = new WebSocket('ws://localhost:8000/ws/translate');
                    ws.onopen = () => {
                        const targetLang = languageCodes[targetLanguageSelect.value] || 'hi';
                        ws.send(JSON.stringify({ language: targetLang }));
                        ws.send(JSON.stringify({ text_to_translate: text }));
                    };
                    ws.onmessage = (event) => {
                        const data = JSON.parse(event.data);
                        if (data.status === 'success' && data.is_text_to_text) {
                            targetTranslation.value = data.translated_text;
                        }
                    };
                } else if (text && ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ text_to_translate: text }));
                } else if (!text) {
                    targetTranslation.value = "";
                }
            }, 800); // wait 800ms after user stops typing
        });

    }, 500); // 500ms delay to let the UI render first
});
