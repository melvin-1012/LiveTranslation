document.addEventListener('DOMContentLoaded', () => {

  const sourceLanguageSelect = document.getElementById('sourceLanguage');
  const targetLanguageSelect = document.getElementById('targetLanguage');

  const startBtn = document.getElementById('startBtn');
  const startBtnText = document.getElementById('startBtnText');
  const stopBtn = document.getElementById('stopBtn');
  const clearBtn = document.getElementById('clearBtn');

  const statusBadge = document.getElementById('statusBadge');
  const statusText = document.getElementById('statusText');
  const audioWaves = document.getElementById('audioWaves');

  const sourceTranscript = document.getElementById('sourceTranscript');
  const targetTranslation = document.getElementById('targetTranslation');

  const sourceLangBadge = document.getElementById('sourceLangBadge');
  const targetLangBadge = document.getElementById('targetLangBadge');

  const sourceCharCount = document.getElementById('sourceCharCount');
  const targetCharCount = document.getElementById('targetCharCount');

  const sourceHint = document.getElementById('sourceHint');
  const targetHint = document.getElementById('targetHint');

  const copySourceBtn = document.getElementById('copySourceBtn');
  const copyTargetBtn = document.getElementById('copyTargetBtn');

  const latencyDisplay = document.getElementById('latencyDisplay');
  const latencyTag = document.getElementById('latencyTag');

  let recognition = null;
  let isListening = false;

  // -----------------------------
  // Language codes
  // -----------------------------
  const languageCodes = {
    English: 'en-US',
    Tamil: 'ta-IN',
    Hindi: 'hi-IN',
    Telugu: 'te-IN',
    Kannada: 'kn-IN',
    Malayalam: 'ml-IN'
  };

  // -----------------------------
  // Update language badges
  // -----------------------------
  function updateLanguageBadges() {
    sourceLangBadge.textContent = sourceLanguageSelect.value;
    targetLangBadge.textContent = targetLanguageSelect.value;
  }

  sourceLanguageSelect.addEventListener('change', () => {
    updateLanguageBadges();

    if (recognition) {
      recognition.lang = languageCodes[sourceLanguageSelect.value];
    }
  });

  targetLanguageSelect.addEventListener('change', updateLanguageBadges);

  // -----------------------------
  // Character counters
  // -----------------------------
  function updateCharCounts() {
    sourceCharCount.textContent = sourceTranscript.value.length;
    targetCharCount.textContent = targetTranslation.value.length;
  }

  sourceTranscript.addEventListener('input', updateCharCounts);
  targetTranslation.addEventListener('input', updateCharCounts);

  // -----------------------------
  // Status
  // -----------------------------
  function setStatus(status) {

    statusBadge.className = 'status-pill';

    if (status === 'listening') {

      statusBadge.classList.add('status-listening');
      statusText.textContent = 'Listening';

      audioWaves.classList.add('listening');

      sourceHint.textContent = 'Listening to microphone...';
      targetHint.textContent = 'Speech will appear here...';

    } else {

      statusBadge.classList.add('status-ready');
      statusText.textContent = 'Ready';

      audioWaves.classList.remove('listening');

      sourceHint.textContent = 'Mic is currently inactive';
      targetHint.textContent = 'Awaiting speech input';
    }
  }

  // -----------------------------
  // Speech Recognition
  // -----------------------------
  const SpeechRecognition =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

  if (SpeechRecognition) {

    recognition = new SpeechRecognition();

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = languageCodes[sourceLanguageSelect.value];

    recognition.onstart = () => {

      isListening = true;

      startBtn.disabled = true;
      stopBtn.disabled = false;

      startBtnText.textContent = 'Listening...';

      setStatus('listening');

      latencyTag.textContent = 'LIVE';
      latencyTag.classList.add('active');
    };

    recognition.onresult = (event) => {

      let finalText = '';
      let interimText = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {

        const transcript =
          event.results[i][0].transcript;

        if (event.results[i].isFinal) {
          finalText += transcript;
        } else {
          interimText += transcript;
        }
      }

      if (finalText) {
        sourceTranscript.value += finalText + ' ';
      }

      if (interimText) {
        sourceTranscript.value =
          sourceTranscript.value.trimEnd() +
          ' ' +
          interimText;
      }

      updateCharCounts();
    };

    recognition.onerror = (event) => {

      console.log('Speech recognition error:', event.error);

      if (event.error === 'not-allowed') {
        alert('Microphone permission was denied. Please allow microphone access in your browser.');
      }

      stopListening();
    };

    recognition.onend = () => {

      if (isListening) {
        try {
          recognition.start();
        } catch (error) {
          console.log(error);
        }
      }
    };

  } else {

    alert(
      'Speech recognition is not supported in this browser. Please use Google Chrome or Microsoft Edge.'
    );
  }

  // -----------------------------
  // Start Speaking
  // -----------------------------
  startBtn.addEventListener('click', () => {

    if (!recognition) return;

    recognition.lang =
      languageCodes[sourceLanguageSelect.value];

    try {
      recognition.start();
    } catch (error) {
      console.log('Recognition start error:', error);
    }
  });

  // -----------------------------
  // Stop
  // -----------------------------
  function stopListening() {

    isListening = false;

    startBtn.disabled = false;
    stopBtn.disabled = true;

    startBtnText.textContent = 'Start Speaking';

    setStatus('ready');

    latencyDisplay.textContent = '-- ms';

    latencyTag.textContent = 'IDLE';
    latencyTag.classList.remove('active');

    try {
      recognition.stop();
    } catch (error) {
      console.log(error);
    }
  }

  stopBtn.addEventListener('click', stopListening);

  // -----------------------------
  // Clear
  // -----------------------------
  clearBtn.addEventListener('click', () => {

    sourceTranscript.value = '';
    targetTranslation.value = '';

    updateCharCounts();
  });

  // -----------------------------
  // Copy buttons
  // -----------------------------
  function setupCopyButton(button, textarea) {

    button.addEventListener('click', async () => {

      const text = textarea.value.trim();

      if (!text) return;

      try {

        await navigator.clipboard.writeText(text);

        const tooltip =
          button.querySelector('.btn-tooltip');

        if (tooltip) {

          const oldText = tooltip.textContent;

          tooltip.textContent = 'Copied!';

          setTimeout(() => {
            tooltip.textContent = oldText;
          }, 1500);
        }

      } catch (error) {

        console.log('Copy failed:', error);
      }
    });
  }

  setupCopyButton(copySourceBtn, sourceTranscript);
  setupCopyButton(copyTargetBtn, targetTranslation);

  // -----------------------------
  // Initial setup
  // -----------------------------
  updateLanguageBadges();
  updateCharCounts();
  setStatus('ready');

});