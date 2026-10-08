/**
 * LiveIndicTranslator - Frontend Application Logic
 * Pure frontend interaction handling (No API / No backend)
 */

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements - Selectors & Controls
  const sourceLanguageSelect = document.getElementById('sourceLanguage');
  const targetLanguageSelect = document.getElementById('targetLanguage');
  const swapLanguagesBtn = document.getElementById('swapLanguagesBtn');
  
  const startBtn = document.getElementById('startBtn');
  const startBtnText = document.getElementById('startBtnText');
  const stopBtn = document.getElementById('stopBtn');
  const clearBtn = document.getElementById('clearBtn');

  // DOM Elements - Status & Indicators
  const statusBadge = document.getElementById('statusBadge');
  const statusText = document.getElementById('statusText');
  const audioWaves = document.getElementById('audioWaves');
  const latencyDisplay = document.getElementById('latencyDisplay');
  const latencyTag = document.getElementById('latencyTag');

  // DOM Elements - Text Areas & Badges
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

  // Internal state
  let isListening = false;
  let latencyInterval = null;

  // -------------------------------------------------------------
  // 1. Language Selection & Badges
  // -------------------------------------------------------------
  function updateLanguageBadges() {
    sourceLangBadge.textContent = sourceLanguageSelect.value;
    targetLangBadge.textContent = targetLanguageSelect.value;
  }

  sourceLanguageSelect.addEventListener('change', () => {
    // If user picks the same language as target, automatically switch target to a different valid language
    if (sourceLanguageSelect.value === targetLanguageSelect.value) {
      const options = Array.from(targetLanguageSelect.options);
      const fallback = options.find(opt => opt.value !== sourceLanguageSelect.value);
      if (fallback) {
        targetLanguageSelect.value = fallback.value;
      }
    }
    updateLanguageBadges();
  });

  targetLanguageSelect.addEventListener('change', () => {
    // If user picks the same language as source, automatically switch source
    if (targetLanguageSelect.value === sourceLanguageSelect.value) {
      const options = Array.from(sourceLanguageSelect.options);
      const fallback = options.find(opt => opt.value !== targetLanguageSelect.value);
      if (fallback) {
        sourceLanguageSelect.value = fallback.value;
      }
    }
    updateLanguageBadges();
  });

  // -------------------------------------------------------------
  // 2. Swap Languages Button
  // -------------------------------------------------------------
  swapLanguagesBtn.addEventListener('click', () => {
    // Swap dropdown values
    const tempLang = sourceLanguageSelect.value;
    sourceLanguageSelect.value = targetLanguageSelect.value;
    targetLanguageSelect.value = tempLang;
    updateLanguageBadges();

    // Swap text content between panels if present
    const tempText = sourceTranscript.value;
    sourceTranscript.value = targetTranslation.value;
    targetTranslation.value = tempText;

    updateCharCounts();
  });

  // -------------------------------------------------------------
  // 3. Status Management (Ready, Listening, Translating)
  // -------------------------------------------------------------
  function setStatus(status) {
    statusBadge.className = 'status-pill';

    if (status === 'listening') {
      statusBadge.classList.add('status-listening');
      statusText.textContent = 'Listening';
      audioWaves.classList.add('listening');
      sourceHint.textContent = 'Recording live audio stream...';
      targetHint.textContent = 'Streaming translation in real time...';
    } else if (status === 'translating') {
      statusBadge.classList.add('status-translating');
      statusText.textContent = 'Translating';
      audioWaves.classList.add('listening');
      sourceHint.textContent = 'Processing speech input...';
      targetHint.textContent = 'Synthesizing translation...';
    } else {
      // Default to 'ready'
      statusBadge.classList.add('status-ready');
      statusText.textContent = 'Ready';
      audioWaves.classList.remove('listening');
      sourceHint.textContent = 'Mic is currently inactive';
      targetHint.textContent = 'Awaiting speech input';
    }
  }

  // -------------------------------------------------------------
  // 4. Latency Indicator Simulation (UI State Demo)
  // -------------------------------------------------------------
  function startLatencyDisplay() {
    latencyTag.textContent = 'LIVE';
    latencyTag.classList.add('active');
    
    // Simulate realistic low-latency streaming benchmarks (110ms - 135ms)
    const updateLatency = () => {
      const benchmarkLatency = Math.floor(105 + Math.random() * 25);
      latencyDisplay.textContent = `${benchmarkLatency} ms`;
    };

    updateLatency();
    latencyInterval = setInterval(updateLatency, 2400);
  }

  function stopLatencyDisplay() {
    if (latencyInterval) {
      clearInterval(latencyInterval);
      latencyInterval = null;
    }
    latencyDisplay.textContent = '-- ms';
    latencyTag.textContent = 'IDLE';
    latencyTag.classList.remove('active');
  }

  // -------------------------------------------------------------
  // 5. Microphone Controls (Start & Stop)
  // -------------------------------------------------------------
  startBtn.addEventListener('click', () => {
    isListening = true;
    startBtn.disabled = true;
    startBtn.classList.add('is-active');
    startBtnText.textContent = 'Listening...';
    stopBtn.disabled = false;

    setStatus('listening');
    startLatencyDisplay();
  });

  stopBtn.addEventListener('click', () => {
    isListening = false;
    startBtn.disabled = false;
    startBtn.classList.remove('is-active');
    startBtnText.textContent = 'Start Speaking';
    stopBtn.disabled = true;

    setStatus('ready');
    stopLatencyDisplay();
  });

  // -------------------------------------------------------------
  // 6. Clear Button
  // -------------------------------------------------------------
  clearBtn.addEventListener('click', () => {
    sourceTranscript.value = '';
    targetTranslation.value = '';
    updateCharCounts();
  });

  // -------------------------------------------------------------
  // 7. Textarea Inputs & Character Counters
  // -------------------------------------------------------------
  function updateCharCounts() {
    sourceCharCount.textContent = sourceTranscript.value.length;
    targetCharCount.textContent = targetTranslation.value.length;
  }

  sourceTranscript.addEventListener('input', updateCharCounts);
  targetTranslation.addEventListener('input', updateCharCounts);

  // -------------------------------------------------------------
  // 8. Copy to Clipboard Functionality
  // -------------------------------------------------------------
  function setupCopyButton(button, textarea) {
    button.addEventListener('click', async () => {
      const textToCopy = textarea.value.trim();
      if (!textToCopy) return;

      try {
        await navigator.clipboard.writeText(textToCopy);
        const tooltip = button.querySelector('.btn-tooltip');
        const originalText = tooltip ? tooltip.textContent : 'Copy';

        button.classList.add('copied');
        if (tooltip) tooltip.textContent = 'Copied!';

        setTimeout(() => {
          button.classList.remove('copied');
          if (tooltip) tooltip.textContent = originalText;
        }, 1800);
      } catch (err) {
        console.warn('Clipboard write failed:', err);
      }
    });
  }

  setupCopyButton(copySourceBtn, sourceTranscript);
  setupCopyButton(copyTargetBtn, targetTranslation);

  // Initial Sync
  updateLanguageBadges();
  updateCharCounts();
  setStatus('ready');
});
