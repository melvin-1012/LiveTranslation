/**
 * LiveIndicTranslator - Frontend Application Logic
 * Pure Frontend Implementation (No Backend / No DB / No API keys)
 * Enhancements:
 *  - Account area notice
 *  - Translation History drawer with states: loading, empty, error, retry
 *  - Session Details view with sequenced utterances, timestamps, confidence, latency
 *  - Language preferences with Save Preferences feedback
 *  - Live Session feedback & alert areas for mic permission, connection, and translation errors
 *  - Preserved Web Speech Recognition functionality
 */

document.addEventListener('DOMContentLoaded', () => {

  // =========================================================================
  // 1. Mock Data & Reactive State
  // =========================================================================
  
  const INITIAL_MOCK_SESSIONS = [
    {
      id: 'sess-101',
      dateTime: 'Oct 8, 2026, 11:42 AM',
      sourceLanguage: 'English',
      targetLanguage: 'Tamil',
      status: 'Completed',
      duration: '1m 32s',
      utterances: [
        {
          id: 'u101-1',
          speaker: 'Speaker 1',
          timestamp: '11:42:04 AM',
          confidence: 0.96,
          latency: '114 ms',
          sourceText: 'Hello, welcome to the live demonstration of our translator.',
          targetText: 'வணக்கம், எங்கள் மொழிபெயர்ப்பாளரின் நேரடி விளக்கக்காட்சிக்கு வரவேற்கிறோம்.'
        },
        {
          id: 'u101-2',
          speaker: 'Speaker 1',
          timestamp: '11:42:18 AM',
          confidence: 0.94,
          latency: '128 ms',
          sourceText: 'We are translating English speech into Indic languages in real time.',
          targetText: 'நாங்கள் ஆங்கில பேச்சை நிகழ்நேரத்தில் இந்திய மொழிகளில் மொழிபெயர்க்கிறோம்.'
        },
        {
          id: 'u101-3',
          speaker: 'Speaker 1',
          timestamp: '11:42:45 AM',
          confidence: 0.98,
          latency: '108 ms',
          sourceText: 'Thank you for testing LiveIndicTranslator.',
          targetText: 'LiveIndicTranslator ஐ பரிசோதித்ததற்கு நன்றி.'
        }
      ]
    },
    {
      id: 'sess-102',
      dateTime: 'Oct 8, 2026, 10:15 AM',
      sourceLanguage: 'Hindi',
      targetLanguage: 'English',
      status: 'Completed',
      duration: '48s',
      utterances: [
        {
          id: 'u102-1',
          speaker: 'Speaker 1',
          timestamp: '10:15:10 AM',
          confidence: 0.93,
          latency: '142 ms',
          sourceText: 'आज हम अपनी नई प्रणाली का परीक्षण कर रहे हैं।',
          targetText: 'Today we are testing our new system.'
        },
        {
          id: 'u102-2',
          speaker: 'Speaker 1',
          timestamp: '10:15:32 AM',
          confidence: 0.95,
          latency: '120 ms',
          sourceText: 'यह बहुत तेज और सटीक अनुवाद प्रदान करता है।',
          targetText: 'It provides very fast and accurate translation.'
        }
      ]
    },
    {
      id: 'sess-103',
      dateTime: 'Oct 7, 2026, 04:20 PM',
      sourceLanguage: 'Telugu',
      targetLanguage: 'Tamil',
      status: 'Completed',
      duration: '2m 10s',
      utterances: [
        {
          id: 'u103-1',
          speaker: 'Speaker 1',
          timestamp: '04:20:15 PM',
          confidence: 0.91,
          latency: null, // Demonstrates conditional rendering when latency is absent
          sourceText: 'నమస్కారం, మీరు ఎలా ఉన్నారు?',
          targetText: 'வணக்கம், நீங்கள் எப்படி இருக்கிறீர்கள்?'
        },
        {
          id: 'u103-2',
          speaker: 'Speaker 1',
          timestamp: '04:20:45 PM',
          confidence: null, // Demonstrates conditional rendering when confidence is absent
          latency: '135 ms',
          sourceText: 'నేను బాగున్నాను, ధన్యవాదాలు.',
          targetText: 'நான் நலமாக இருக்கிறேன், நன்றி.'
        }
      ]
    },
    {
      id: 'sess-104',
      dateTime: 'Oct 7, 2026, 02:05 PM',
      sourceLanguage: 'Kannada',
      targetLanguage: 'Malayalam',
      status: 'Saved',
      duration: null, // Demonstrates duration when available
      utterances: [] // Demonstrates empty session detail state
    }
  ];

  // Required mock UI hooks & state
  const state = {
    historyList: [...INITIAL_MOCK_SESSIONS],
    sessionDetail: null,
    historyLoading: false,
    historyError: null,
    preferencesSaveStatus: null // null | 'saving' | 'success' | 'error'
  };

  // Language codes for Speech Recognition
  const languageCodes = {
    English: 'en-US',
    Tamil: 'ta-IN',
    Hindi: 'hi-IN',
    Telugu: 'te-IN',
    Kannada: 'kn-IN',
    Malayalam: 'ml-IN'
  };

  // =========================================================================
  // 2. DOM Elements
  // =========================================================================
  
  // Translation Controls
  const sourceLanguageSelect = document.getElementById('sourceLanguage');
  const targetLanguageSelect = document.getElementById('targetLanguage');
  const swapLanguagesBtn = document.getElementById('swapLanguagesBtn');
  const currentPairHint = document.getElementById('currentPairHint');

  const startBtn = document.getElementById('startBtn');
  const startBtnText = document.getElementById('startBtnText');
  const stopBtn = document.getElementById('stopBtn');
  const clearBtn = document.getElementById('clearBtn');

  // Status & Metrics
  const statusBadge = document.getElementById('statusBadge');
  const statusText = document.getElementById('statusText');
  const audioWaves = document.getElementById('audioWaves');
  const latencyDisplay = document.getElementById('latencyDisplay');
  const latencyTag = document.getElementById('latencyTag');

  // Text Panels & Badges
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

  // Live Alerts
  const liveAlertBox = document.getElementById('liveAlertBox');
  const alertIconWrap = document.getElementById('alertIconWrap');
  const alertTitle = document.getElementById('alertTitle');
  const alertMessage = document.getElementById('alertMessage');
  const alertActionBtn = document.getElementById('alertActionBtn');
  const dismissAlertBtn = document.getElementById('dismissAlertBtn');

  // Preferences
  const savePreferencesBtn = document.getElementById('savePreferencesBtn');
  const preferencesStatusBadge = document.getElementById('preferencesStatusBadge');

  // History Drawer & Views
  const historyToggleBtn = document.getElementById('historyToggleBtn');
  const historyCountBadge = document.getElementById('historyCountBadge');
  const historyDrawer = document.getElementById('historyDrawer');
  const historyDrawerOverlay = document.getElementById('historyDrawerOverlay');
  const historyCloseBtn = document.getElementById('historyCloseBtn');
  const historyBackBtn = document.getElementById('historyBackBtn');
  const historyDrawerTitle = document.getElementById('historyDrawerTitle');

  const historyListView = document.getElementById('historyListView');
  const historyLoadingState = document.getElementById('historyLoadingState');
  const historyErrorState = document.getElementById('historyErrorState');
  const historyErrorMessage = document.getElementById('historyErrorMessage');
  const historyRetryBtn = document.getElementById('historyRetryBtn');
  const historyEmptyState = document.getElementById('historyEmptyState');
  const historyItemsContainer = document.getElementById('historyItemsContainer');

  const btnSimulateEmpty = document.getElementById('btnSimulateEmpty');
  const btnSimulateError = document.getElementById('btnSimulateError');
  const btnResetHistory = document.getElementById('btnResetHistory');

  // Session Detail Elements
  const sessionDetailView = document.getElementById('sessionDetailView');
  const sessionOverviewCard = document.getElementById('sessionOverviewCard');
  const utteranceCountTag = document.getElementById('utteranceCountTag');
  const sessionDetailLoading = document.getElementById('sessionDetailLoading');
  const sessionDetailError = document.getElementById('sessionDetailError');
  const sessionDetailEmpty = document.getElementById('sessionDetailEmpty');
  const utteranceSequenceContainer = document.getElementById('utteranceSequenceContainer');
  const sessionDetailBackBtn = document.getElementById('sessionDetailBackBtn');

  let recognition = null;
  let isListening = false;
  let alertTimeout = null;

  // =========================================================================
  // 3. Language & Preferences Handling
  // =========================================================================

  function updateLanguageBadges() {
    sourceLangBadge.textContent = sourceLanguageSelect.value;
    targetLangBadge.textContent = targetLanguageSelect.value;
    currentPairHint.textContent = `${sourceLanguageSelect.value} → ${targetLanguageSelect.value}`;
  }

  sourceLanguageSelect.addEventListener('change', () => {
    if (sourceLanguageSelect.value === targetLanguageSelect.value) {
      const options = Array.from(targetLanguageSelect.options);
      const fallback = options.find(opt => opt.value !== sourceLanguageSelect.value);
      if (fallback) targetLanguageSelect.value = fallback.value;
    }
    updateLanguageBadges();

    if (recognition) {
      recognition.lang = languageCodes[sourceLanguageSelect.value] || 'en-US';
    }
  });

  targetLanguageSelect.addEventListener('change', () => {
    if (targetLanguageSelect.value === sourceLanguageSelect.value) {
      const options = Array.from(sourceLanguageSelect.options);
      const fallback = options.find(opt => opt.value !== targetLanguageSelect.value);
      if (fallback) sourceLanguageSelect.value = fallback.value;
    }
    updateLanguageBadges();
  });

  // Swap Languages
  swapLanguagesBtn.addEventListener('click', () => {
    const tempLang = sourceLanguageSelect.value;
    sourceLanguageSelect.value = targetLanguageSelect.value;
    targetLanguageSelect.value = tempLang;
    updateLanguageBadges();

    if (recognition) {
      recognition.lang = languageCodes[sourceLanguageSelect.value] || 'en-US';
    }

    // Swap text content between panels if present
    const tempText = sourceTranscript.value;
    sourceTranscript.value = targetTranslation.value;
    targetTranslation.value = tempText;
    updateCharCounts();
  });

  // Save Preferences Action (Mock only - No database)
  savePreferencesBtn.addEventListener('click', () => {
    state.preferencesSaveStatus = 'saving';
    preferencesStatusBadge.className = 'pref-status-pill saving';
    preferencesStatusBadge.textContent = 'Saving...';
    preferencesStatusBadge.classList.remove('hidden');

    setTimeout(() => {
      state.preferencesSaveStatus = 'success';
      preferencesStatusBadge.className = 'pref-status-pill success';
      preferencesStatusBadge.innerHTML = `✓ Saved (${sourceLanguageSelect.value} → ${targetLanguageSelect.value})`;

      setTimeout(() => {
        preferencesStatusBadge.classList.add('hidden');
        state.preferencesSaveStatus = null;
      }, 3200);
    }, 450);
  });

  // =========================================================================
  // 4. Live Session Alerts & Feedback
  // =========================================================================

  function showLiveAlert(type, title, message, actionLabel = null, actionCallback = null) {
    if (alertTimeout) clearTimeout(alertTimeout);

    liveAlertBox.className = 'live-alert-box';
    if (type === 'mic-error') {
      liveAlertBox.classList.add('alert-mic-error');
      alertIconWrap.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="1" y1="1" x2="23" y2="23"></line>
          <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path>
          <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path>
          <line x1="12" y1="19" x2="12" y2="23"></line>
          <line x1="8" y1="23" x2="16" y2="23"></line>
        </svg>`;
    } else if (type === 'connection-error') {
      liveAlertBox.classList.add('alert-connection-error');
      alertIconWrap.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="1" y1="1" x2="23" y2="23"></line>
          <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"></path>
          <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"></path>
          <path d="M10.71 5.05A16 16 0 0 1 22.58 9"></path>
          <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"></path>
          <path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>
          <line x1="12" y1="20" x2="12.01" y2="20"></line>
        </svg>`;
    } else if (type === 'translation-error') {
      liveAlertBox.classList.add('alert-translation-error');
      alertIconWrap.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>`;
    } else {
      liveAlertBox.classList.add('alert-info');
      alertIconWrap.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="16" x2="12" y2="12"></line>
          <line x1="12" y1="8" x2="12.01" y2="8"></line>
        </svg>`;
    }

    alertTitle.textContent = title;
    alertMessage.textContent = message;

    if (actionLabel && actionCallback) {
      alertActionBtn.textContent = actionLabel;
      alertActionBtn.onclick = actionCallback;
      alertActionBtn.classList.remove('hidden');
    } else {
      alertActionBtn.classList.add('hidden');
    }

    liveAlertBox.classList.remove('hidden');
  }

  function dismissLiveAlert() {
    liveAlertBox.classList.add('hidden');
  }

  dismissAlertBtn.addEventListener('click', dismissLiveAlert);

  // =========================================================================
  // 5. Status & Speech Recognition Handling
  // =========================================================================

  function setStatus(status) {
    statusBadge.className = 'status-pill';

    if (status === 'listening') {
      statusBadge.classList.add('status-listening');
      statusText.textContent = 'Listening';
      audioWaves.classList.add('listening');

      sourceHint.textContent = 'Listening to microphone...';
      targetHint.textContent = 'Speech will appear here...';

      // Rule: Do not show fake/random latency. Use "—" or "Waiting for connection"
      latencyDisplay.textContent = 'Waiting for connection';
      latencyTag.textContent = 'STREAMING';
      latencyTag.classList.add('active');
    } else if (status === 'translating') {
      statusBadge.classList.add('status-translating');
      statusText.textContent = 'Translating';
      audioWaves.classList.add('listening');

      sourceHint.textContent = 'Processing speech input...';
      targetHint.textContent = 'Awaiting live translation stream...';
    } else {
      statusBadge.classList.add('status-ready');
      statusText.textContent = 'Ready';
      audioWaves.classList.remove('listening');

      sourceHint.textContent = 'Mic is currently inactive';
      targetHint.textContent = 'Awaiting speech input';

      latencyDisplay.textContent = '—';
      latencyTag.textContent = 'IDLE';
      latencyTag.classList.remove('active');
    }
  }

  // Web Speech API
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = languageCodes[sourceLanguageSelect.value] || 'en-US';

    recognition.onstart = () => {
      isListening = true;
      startBtn.disabled = true;
      stopBtn.disabled = false;
      startBtnText.textContent = 'Listening...';
      setStatus('listening');
      dismissLiveAlert();
    };

    recognition.onresult = (event) => {
      let finalText = '';
      let interimText = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
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
        sourceTranscript.value = sourceTranscript.value.trimEnd() + ' ' + interimText;
      }

      updateCharCounts();
    };

    recognition.onerror = (event) => {
      console.warn('Speech recognition error:', event.error);

      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        showLiveAlert(
          'mic-error',
          'Microphone Permission Denied',
          'Access to your microphone was blocked. Please permit microphone access in your browser address bar to transcribe speech.'
        );
      } else if (event.error === 'network') {
        showLiveAlert(
          'connection-error',
          'Speech Network Connection Error',
          'Network connection interrupted during speech recognition. Please verify your internet connection.'
        );
      } else if (event.error === 'no-speech') {
        // Normal silence timeout; no intrusive error needed
      } else {
        showLiveAlert(
          'translation-error',
          'Speech Recognition Error',
          `Recognition encountered an issue: ${event.error}. Please try again.`
        );
      }

      stopListening();
    };

    recognition.onend = () => {
      if (isListening) {
        try {
          recognition.start();
        } catch (error) {
          console.warn('Recognition restart error:', error);
        }
      }
    };
  } else {
    showLiveAlert(
      'connection-error',
      'Browser Speech API Not Supported',
      'Speech recognition is not natively supported in this browser. For live speech-to-text, please use Google Chrome or Microsoft Edge.'
    );
  }

  startBtn.addEventListener('click', () => {
    if (!recognition) {
      showLiveAlert(
        'connection-error',
        'Speech Recognition Unavailable',
        'Speech recognition is not available in this browser. Please open in Google Chrome or Microsoft Edge.'
      );
      return;
    }

    recognition.lang = languageCodes[sourceLanguageSelect.value] || 'en-US';

    try {
      recognition.start();
    } catch (error) {
      console.warn('Recognition start exception:', error);
    }
  });

  function stopListening() {
    isListening = false;
    startBtn.disabled = false;
    stopBtn.disabled = true;
    startBtnText.textContent = 'Start Speaking';

    setStatus('ready');

    if (recognition) {
      try {
        recognition.stop();
      } catch (error) {
        console.warn('Recognition stop exception:', error);
      }
    }
  }

  stopBtn.addEventListener('click', stopListening);

  clearBtn.addEventListener('click', () => {
    sourceTranscript.value = '';
    targetTranslation.value = '';
    updateCharCounts();
  });

  function updateCharCounts() {
    sourceCharCount.textContent = sourceTranscript.value.length;
    targetCharCount.textContent = targetTranslation.value.length;
  }

  sourceTranscript.addEventListener('input', updateCharCounts);
  targetTranslation.addEventListener('input', updateCharCounts);

  // Copy Buttons
  function setupCopyButton(button, textarea) {
    button.addEventListener('click', async () => {
      const text = textarea.value.trim();
      if (!text) return;

      try {
        await navigator.clipboard.writeText(text);
        const tooltip = button.querySelector('.btn-tooltip');
        if (tooltip) {
          const oldText = tooltip.textContent;
          tooltip.textContent = 'Copied!';
          button.classList.add('copied');
          setTimeout(() => {
            tooltip.textContent = oldText;
            button.classList.remove('copied');
          }, 1500);
        }
      } catch (error) {
        console.warn('Copy failed:', error);
      }
    });
  }

  setupCopyButton(copySourceBtn, sourceTranscript);
  setupCopyButton(copyTargetBtn, targetTranslation);

  // =========================================================================
  // 6. History Drawer & Views (Loading, Empty, Error, List)
  // =========================================================================

  function openHistoryDrawer() {
    historyDrawerOverlay.classList.add('active');
    historyDrawer.classList.add('open');
    historyDrawerOverlay.setAttribute('aria-hidden', 'false');
    historyDrawer.setAttribute('aria-hidden', 'false');
    loadHistoryList();
  }

  function closeHistoryDrawer() {
    historyDrawerOverlay.classList.remove('active');
    historyDrawer.classList.remove('open');
    historyDrawerOverlay.setAttribute('aria-hidden', 'true');
    historyDrawer.setAttribute('aria-hidden', 'true');
    // Reset to list view if user was viewing detail
    showHistoryListView();
  }

  historyToggleBtn.addEventListener('click', openHistoryDrawer);
  historyCloseBtn.addEventListener('click', closeHistoryDrawer);
  historyDrawerOverlay.addEventListener('click', closeHistoryDrawer);

  function updateHistoryCountBadge() {
    historyCountBadge.textContent = state.historyList.length;
  }

  function loadHistoryList(simulateError = false) {
    state.historyLoading = true;
    state.historyError = null;

    historyLoadingState.classList.remove('hidden');
    historyErrorState.classList.add('hidden');
    historyEmptyState.classList.add('hidden');
    historyItemsContainer.classList.add('hidden');

    setTimeout(() => {
      state.historyLoading = false;
      historyLoadingState.classList.add('hidden');

      if (simulateError) {
        state.historyError = 'Network timeout contacting translation history store.';
        historyErrorMessage.textContent = state.historyError;
        historyErrorState.classList.remove('hidden');
        return;
      }

      if (!state.historyList || state.historyList.length === 0) {
        historyEmptyState.classList.remove('hidden');
        return;
      }

      renderHistoryCards();
      historyItemsContainer.classList.remove('hidden');
    }, 380);
  }

  historyRetryBtn.addEventListener('click', () => {
    loadHistoryList(false);
  });

  function renderHistoryCards() {
    historyItemsContainer.innerHTML = '';

    state.historyList.forEach((session) => {
      const card = document.createElement('article');
      card.className = 'session-card';
      card.setAttribute('tabindex', '0');
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', `Session on ${session.dateTime}, ${session.sourceLanguage} to ${session.targetLanguage}`);

      const statusClass = session.status.toLowerCase();
      const durationHtml = session.duration 
        ? `<span class="session-duration-tag">⏱ ${session.duration}</span>` 
        : '';
      const utteranceCount = session.utterances ? session.utterances.length : 0;

      card.innerHTML = `
        <div class="session-card-header">
          <span class="session-datetime">${session.dateTime}</span>
          <span class="session-status-pill ${statusClass}">${session.status}</span>
        </div>
        <div class="session-card-body">
          <div class="session-lang-flow">
            <span>${session.sourceLanguage}</span>
            <span class="session-arrow">→</span>
            <span>${session.targetLanguage}</span>
          </div>
          ${durationHtml}
        </div>
        <div class="session-card-footer">
          <span>${utteranceCount} utterance${utteranceCount === 1 ? '' : 's'}</span>
          <span class="session-view-link">View details &rarr;</span>
        </div>
      `;

      card.addEventListener('click', () => openSessionDetails(session.id));
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openSessionDetails(session.id);
        }
      });

      historyItemsContainer.appendChild(card);
    });

    updateHistoryCountBadge();
  }

  // Simulation buttons for quick UI validation
  btnSimulateEmpty.addEventListener('click', () => {
    state.historyList = [];
    updateHistoryCountBadge();
    loadHistoryList(false);
  });

  btnSimulateError.addEventListener('click', () => {
    loadHistoryList(true);
  });

  btnResetHistory.addEventListener('click', () => {
    state.historyList = [...INITIAL_MOCK_SESSIONS];
    updateHistoryCountBadge();
    loadHistoryList(false);
  });

  // =========================================================================
  // 7. Session Details View
  // =========================================================================

  function showHistoryListView() {
    historyListView.classList.remove('hidden');
    sessionDetailView.classList.add('hidden');
    historyBackBtn.classList.add('hidden');
    historyDrawerTitle.textContent = 'Translation History';
    state.sessionDetail = null;
  }

  function openSessionDetails(sessionId) {
    historyListView.classList.add('hidden');
    sessionDetailView.classList.remove('hidden');
    historyBackBtn.classList.remove('hidden');
    historyDrawerTitle.textContent = 'Session Details';

    sessionDetailLoading.classList.remove('hidden');
    sessionDetailError.classList.add('hidden');
    sessionDetailEmpty.classList.add('hidden');
    sessionOverviewCard.innerHTML = '';
    utteranceSequenceContainer.innerHTML = '';

    setTimeout(() => {
      sessionDetailLoading.classList.add('hidden');

      const foundSession = state.historyList.find(s => s.id === sessionId);

      if (!foundSession) {
        state.sessionDetail = null;
        sessionDetailError.classList.remove('hidden');
        return;
      }

      state.sessionDetail = foundSession;
      renderSessionOverview(foundSession);
      renderUtterances(foundSession.utterances);
    }, 280);
  }

  function renderSessionOverview(session) {
    const statusClass = session.status.toLowerCase();
    const durationPill = session.duration 
      ? `<span class="meta-pill">Duration: ${session.duration}</span>` 
      : '';

    sessionOverviewCard.innerHTML = `
      <div class="overview-header">
        <span class="overview-id">SESSION: ${session.id}</span>
        <span class="session-status-pill ${statusClass}">${session.status}</span>
      </div>
      <div class="overview-lang-row">
        <span>${session.sourceLanguage}</span>
        <span class="session-arrow">→</span>
        <span>${session.targetLanguage}</span>
      </div>
      <div class="overview-meta-pills">
        <span class="meta-pill">${session.dateTime}</span>
        ${durationPill}
      </div>
    `;
  }

  function renderUtterances(utterances) {
    utteranceSequenceContainer.innerHTML = '';

    if (!utterances || utterances.length === 0) {
      utteranceCountTag.textContent = '0 utterances';
      sessionDetailEmpty.classList.remove('hidden');
      return;
    }

    sessionDetailEmpty.classList.add('hidden');
    utteranceCountTag.textContent = `${utterances.length} utterance${utterances.length === 1 ? '' : 's'}`;

    utterances.forEach((item, index) => {
      const card = document.createElement('div');
      card.className = 'utterance-card';

      // Rule: Show timestamps, confidence, and latency ONLY when mock data contains them
      const timestampHtml = item.timestamp 
        ? `<span class="metric-pill">${item.timestamp}</span>` 
        : '';

      const confidenceHtml = (item.confidence !== undefined && item.confidence !== null) 
        ? `<span class="metric-pill confidence">${Math.round(item.confidence * 100)}% conf</span>` 
        : '';

      const latencyHtml = (item.latency !== undefined && item.latency !== null) 
        ? `<span class="metric-pill latency">${item.latency}</span>` 
        : '';

      card.innerHTML = `
        <div class="utterance-card-header">
          <span class="utterance-speaker-tag">#${index + 1} ${item.speaker || 'Speaker'}</span>
          <div class="utterance-metrics-row">
            ${timestampHtml}
            ${confidenceHtml}
            ${latencyHtml}
          </div>
        </div>
        <div class="utterance-box">
          <span class="utterance-box-label">Spoken (${state.sessionDetail.sourceLanguage})</span>
          <p class="utterance-text-source">${escapeHtml(item.sourceText)}</p>
        </div>
        <div class="utterance-box">
          <span class="utterance-box-label">Translation (${state.sessionDetail.targetLanguage})</span>
          <p class="utterance-text-target">${escapeHtml(item.targetText)}</p>
        </div>
      `;

      utteranceSequenceContainer.appendChild(card);
    });
  }

  function escapeHtml(string) {
    if (!string) return '';
    return string
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  historyBackBtn.addEventListener('click', showHistoryListView);
  sessionDetailBackBtn.addEventListener('click', showHistoryListView);

  // =========================================================================
  // 8. Global State Exposure for Evaluation & Testing
  // =========================================================================
  window.LiveIndicTranslator = {
    state,
    loadHistoryList,
    openSessionDetails,
    showLiveAlert,
    dismissLiveAlert,
    setStatus
  };

  // Initial Sync
  updateLanguageBadges();
  updateCharCounts();
  updateHistoryCountBadge();
  setStatus('ready');

});