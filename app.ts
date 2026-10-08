/**
 * LiveIndicTranslator - Frontend TypeScript Application Logic
 * Pure Frontend Implementation (No Backend / No DB / No API keys)
 * Converted to TypeScript with strict type definitions for:
 *  - Translation Sessions
 *  - Utterances
 *  - Application State (historyList, sessionDetail, historyLoading, historyError, preferencesSaveStatus)
 *  - Speech Recognition values & event interfaces
 *  - Live Session UI Alerts
 */

// =========================================================================
// 1. TypeScript Interfaces & Types
// =========================================================================

export type IndicLanguage = 'English' | 'Tamil' | 'Hindi' | 'Telugu' | 'Kannada' | 'Malayalam';

export type LanguageCodeMap = Record<IndicLanguage, string>;

export type SessionStatus = 'Completed' | 'Active' | 'Saved';

export type PreferencesSaveStatus = null | 'saving' | 'success' | 'error';

export type LiveAlertType = 'mic-error' | 'connection-error' | 'translation-error' | 'info';

export type SystemStatus = 'ready' | 'listening' | 'translating';

/**
 * Utterance representation for sequence turns
 */
export interface Utterance {
  id: string;
  speaker: string;
  timestamp: string | null;
  confidence: number | null;
  latency: string | null;
  sourceText: string;
  targetText: string;
}

/**
 * Translation session schema
 */
export interface TranslationSession {
  id: string;
  dateTime: string;
  sourceLanguage: IndicLanguage | string;
  targetLanguage: IndicLanguage | string;
  status: SessionStatus;
  duration: string | null;
  utterances: Utterance[];
}

/**
 * Core Application State Model
 */
export interface AppState {
  historyList: TranslationSession[];
  sessionDetail: TranslationSession | null;
  historyLoading: boolean;
  historyError: string | null;
  preferencesSaveStatus: PreferencesSaveStatus;
}

// -------------------------------------------------------------------------
// Speech Recognition Type Definitions (Web Speech API)
// -------------------------------------------------------------------------

export interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

export interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

export interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

export interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

export interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message?: string;
}

export interface ISpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: ((this: ISpeechRecognition, ev: Event) => void) | null;
  onresult: ((this: ISpeechRecognition, ev: SpeechRecognitionEvent) => void) | null;
  onerror: ((this: ISpeechRecognition, ev: SpeechRecognitionErrorEvent) => void) | null;
  onend: ((this: ISpeechRecognition, ev: Event) => void) | null;
}

export interface ISpeechRecognitionConstructor {
  new (): ISpeechRecognition;
}

export interface WindowLiveIndicTranslator {
  state: AppState;
  loadHistoryList: (simulateError?: boolean) => void;
  openSessionDetails: (sessionId: string) => void;
  showLiveAlert: (
    type: LiveAlertType,
    title: string,
    message: string,
    actionLabel?: string | null,
    actionCallback?: (() => void) | null
  ) => void;
  dismissLiveAlert: () => void;
  setStatus: (status: SystemStatus) => void;
}

// Global augmentation
declare global {
  interface Window {
    LiveIndicTranslator?: WindowLiveIndicTranslator;
    SpeechRecognition?: ISpeechRecognitionConstructor;
    webkitSpeechRecognition?: ISpeechRecognitionConstructor;
  }
}

// =========================================================================
// 2. Mock Data Initialization
// =========================================================================

const INITIAL_MOCK_SESSIONS: TranslationSession[] = [
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
        latency: null,
        sourceText: 'నమస్కారం, మీరు ఎలా ఉన్నారు?',
        targetText: 'வணக்கம், நீங்கள் எப்படி இருக்கிறீர்கள்?'
      },
      {
        id: 'u103-2',
        speaker: 'Speaker 1',
        timestamp: '04:20:45 PM',
        confidence: null,
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
    duration: null,
    utterances: []
  }
];

// Application state holding mock hooks
const state: AppState = {
  historyList: [...INITIAL_MOCK_SESSIONS],
  sessionDetail: null,
  historyLoading: false,
  historyError: null,
  preferencesSaveStatus: null
};

// Language code dictionary for speech recognition
const languageCodes: LanguageCodeMap = {
  English: 'en-US',
  Tamil: 'ta-IN',
  Hindi: 'hi-IN',
  Telugu: 'te-IN',
  Kannada: 'kn-IN',
  Malayalam: 'ml-IN'
};

// =========================================================================
// 3. Application Execution (DOM Setup & Event Wireup)
// =========================================================================

document.addEventListener('DOMContentLoaded', () => {

  // Translation Controls
  const sourceLanguageSelect = document.getElementById('sourceLanguage') as HTMLSelectElement;
  const targetLanguageSelect = document.getElementById('targetLanguage') as HTMLSelectElement;
  const swapLanguagesBtn = document.getElementById('swapLanguagesBtn') as HTMLButtonElement;
  const currentPairHint = document.getElementById('currentPairHint') as HTMLElement;

  const startBtn = document.getElementById('startBtn') as HTMLButtonElement;
  const startBtnText = document.getElementById('startBtnText') as HTMLSpanElement;
  const stopBtn = document.getElementById('stopBtn') as HTMLButtonElement;
  const clearBtn = document.getElementById('clearBtn') as HTMLButtonElement;

  // Status & Metrics
  const statusBadge = document.getElementById('statusBadge') as HTMLElement;
  const statusText = document.getElementById('statusText') as HTMLElement;
  const audioWaves = document.getElementById('audioWaves') as HTMLElement;
  const latencyDisplay = document.getElementById('latencyDisplay') as HTMLElement;
  const latencyTag = document.getElementById('latencyTag') as HTMLElement;

  // Text Panels & Badges
  const sourceTranscript = document.getElementById('sourceTranscript') as HTMLTextAreaElement;
  const targetTranslation = document.getElementById('targetTranslation') as HTMLTextAreaElement;
  const sourceLangBadge = document.getElementById('sourceLangBadge') as HTMLElement;
  const targetLangBadge = document.getElementById('targetLangBadge') as HTMLElement;
  const sourceCharCount = document.getElementById('sourceCharCount') as HTMLElement;
  const targetCharCount = document.getElementById('targetCharCount') as HTMLElement;
  const sourceHint = document.getElementById('sourceHint') as HTMLElement;
  const targetHint = document.getElementById('targetHint') as HTMLElement;
  const copySourceBtn = document.getElementById('copySourceBtn') as HTMLButtonElement;
  const copyTargetBtn = document.getElementById('copyTargetBtn') as HTMLButtonElement;

  // Live Alerts
  const liveAlertBox = document.getElementById('liveAlertBox') as HTMLElement;
  const alertIconWrap = document.getElementById('alertIconWrap') as HTMLElement;
  const alertTitle = document.getElementById('alertTitle') as HTMLElement;
  const alertMessage = document.getElementById('alertMessage') as HTMLElement;
  const alertActionBtn = document.getElementById('alertActionBtn') as HTMLButtonElement;
  const dismissAlertBtn = document.getElementById('dismissAlertBtn') as HTMLButtonElement;

  // Preferences
  const savePreferencesBtn = document.getElementById('savePreferencesBtn') as HTMLButtonElement;
  const preferencesStatusBadge = document.getElementById('preferencesStatusBadge') as HTMLElement;

  // History Drawer & Views
  const historyToggleBtn = document.getElementById('historyToggleBtn') as HTMLButtonElement;
  const historyCountBadge = document.getElementById('historyCountBadge') as HTMLElement;
  const historyDrawer = document.getElementById('historyDrawer') as HTMLElement;
  const historyDrawerOverlay = document.getElementById('historyDrawerOverlay') as HTMLElement;
  const historyCloseBtn = document.getElementById('historyCloseBtn') as HTMLButtonElement;
  const historyBackBtn = document.getElementById('historyBackBtn') as HTMLButtonElement;
  const historyDrawerTitle = document.getElementById('historyDrawerTitle') as HTMLElement;

  const historyListView = document.getElementById('historyListView') as HTMLElement;
  const historyLoadingState = document.getElementById('historyLoadingState') as HTMLElement;
  const historyErrorState = document.getElementById('historyErrorState') as HTMLElement;
  const historyErrorMessage = document.getElementById('historyErrorMessage') as HTMLElement;
  const historyRetryBtn = document.getElementById('historyRetryBtn') as HTMLButtonElement;
  const historyEmptyState = document.getElementById('historyEmptyState') as HTMLElement;
  const historyItemsContainer = document.getElementById('historyItemsContainer') as HTMLElement;

  const btnSimulateEmpty = document.getElementById('btnSimulateEmpty') as HTMLButtonElement;
  const btnSimulateError = document.getElementById('btnSimulateError') as HTMLButtonElement;
  const btnResetHistory = document.getElementById('btnResetHistory') as HTMLButtonElement;

  // Session Detail Elements
  const sessionDetailView = document.getElementById('sessionDetailView') as HTMLElement;
  const sessionOverviewCard = document.getElementById('sessionOverviewCard') as HTMLElement;
  const utteranceCountTag = document.getElementById('utteranceCountTag') as HTMLElement;
  const sessionDetailLoading = document.getElementById('sessionDetailLoading') as HTMLElement;
  const sessionDetailError = document.getElementById('sessionDetailError') as HTMLElement;
  const sessionDetailEmpty = document.getElementById('sessionDetailEmpty') as HTMLElement;
  const utteranceSequenceContainer = document.getElementById('utteranceSequenceContainer') as HTMLElement;
  const sessionDetailBackBtn = document.getElementById('sessionDetailBackBtn') as HTMLButtonElement;

  let recognition: ISpeechRecognition | null = null;
  let isListening = false;
  let prefTimer: ReturnType<typeof setTimeout> | null = null;

  // =========================================================================
  // 4. Language & Preferences Handling
  // =========================================================================

  function updateLanguageBadges(): void {
    if (sourceLangBadge && sourceLanguageSelect) {
      sourceLangBadge.textContent = sourceLanguageSelect.value;
    }
    if (targetLangBadge && targetLanguageSelect) {
      targetLangBadge.textContent = targetLanguageSelect.value;
    }
    if (currentPairHint && sourceLanguageSelect && targetLanguageSelect) {
      currentPairHint.textContent = `${sourceLanguageSelect.value} → ${targetLanguageSelect.value}`;
    }
  }

  if (sourceLanguageSelect) {
    sourceLanguageSelect.addEventListener('change', () => {
      if (sourceLanguageSelect.value === targetLanguageSelect.value) {
        const options = Array.from(targetLanguageSelect.options);
        const fallback = options.find((opt) => opt.value !== sourceLanguageSelect.value);
        if (fallback) targetLanguageSelect.value = fallback.value;
      }
      updateLanguageBadges();

      if (recognition) {
        const selectedLang = sourceLanguageSelect.value as IndicLanguage;
        recognition.lang = languageCodes[selectedLang] || 'en-US';
      }
    });
  }

  if (targetLanguageSelect) {
    targetLanguageSelect.addEventListener('change', () => {
      if (targetLanguageSelect.value === sourceLanguageSelect.value) {
        const options = Array.from(sourceLanguageSelect.options);
        const fallback = options.find((opt) => opt.value !== targetLanguageSelect.value);
        if (fallback) sourceLanguageSelect.value = fallback.value;
      }
      updateLanguageBadges();
    });
  }

  // Swap Languages
  if (swapLanguagesBtn) {
    swapLanguagesBtn.addEventListener('click', () => {
      const tempLang = sourceLanguageSelect.value;
      sourceLanguageSelect.value = targetLanguageSelect.value;
      targetLanguageSelect.value = tempLang;
      updateLanguageBadges();

      if (recognition) {
        const selectedLang = sourceLanguageSelect.value as IndicLanguage;
        recognition.lang = languageCodes[selectedLang] || 'en-US';
      }

      // Swap text content between panels if present
      const tempText = sourceTranscript.value;
      sourceTranscript.value = targetTranslation.value;
      targetTranslation.value = tempText;
      updateCharCounts();
    });
  }

  // Save Preferences Action (Mock only - No database connection)
  if (savePreferencesBtn) {
    savePreferencesBtn.addEventListener('click', () => {
      if (prefTimer) clearTimeout(prefTimer);

      state.preferencesSaveStatus = 'saving';
      preferencesStatusBadge.className = 'pref-status-pill saving';
      preferencesStatusBadge.textContent = 'Saving...';
      preferencesStatusBadge.classList.remove('hidden');

      setTimeout(() => {
        state.preferencesSaveStatus = 'success';
        preferencesStatusBadge.className = 'pref-status-pill success';
        preferencesStatusBadge.innerHTML = `✓ Saved (${sourceLanguageSelect.value} → ${targetLanguageSelect.value})`;

        prefTimer = setTimeout(() => {
          preferencesStatusBadge.classList.add('hidden');
          state.preferencesSaveStatus = null;
        }, 3200);
      }, 450);
    });
  }

  // =========================================================================
  // 5. Live Session Alerts & Feedback
  // =========================================================================

  function showLiveAlert(
    type: LiveAlertType,
    title: string,
    message: string,
    actionLabel: string | null = null,
    actionCallback: (() => void) | null = null
  ): void {
    if (!liveAlertBox) return;

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

  function dismissLiveAlert(): void {
    if (liveAlertBox) {
      liveAlertBox.classList.add('hidden');
    }
  }

  if (dismissAlertBtn) {
    dismissAlertBtn.addEventListener('click', dismissLiveAlert);
  }

  // =========================================================================
  // 6. Status & Speech Recognition Handling
  // =========================================================================

  function setStatus(status: SystemStatus): void {
    if (!statusBadge || !statusText || !audioWaves) return;

    statusBadge.className = 'status-pill';

    if (status === 'listening') {
      statusBadge.classList.add('status-listening');
      statusText.textContent = 'Listening';
      audioWaves.classList.add('listening');

      if (sourceHint) sourceHint.textContent = 'Listening to microphone...';
      if (targetHint) targetHint.textContent = 'Speech will appear here...';

      // Rule: Do not show fake/random latency. Use "—" or "Waiting for connection"
      if (latencyDisplay) latencyDisplay.textContent = 'Waiting for connection';
      if (latencyTag) {
        latencyTag.textContent = 'STREAMING';
        latencyTag.classList.add('active');
      }
    } else if (status === 'translating') {
      statusBadge.classList.add('status-translating');
      statusText.textContent = 'Translating';
      audioWaves.classList.add('listening');

      if (sourceHint) sourceHint.textContent = 'Processing speech input...';
      if (targetHint) targetHint.textContent = 'Awaiting live translation stream...';
    } else {
      statusBadge.classList.add('status-ready');
      statusText.textContent = 'Ready';
      audioWaves.classList.remove('listening');

      if (sourceHint) sourceHint.textContent = 'Mic is currently inactive';
      if (targetHint) targetHint.textContent = 'Awaiting speech input';

      if (latencyDisplay) latencyDisplay.textContent = '—';
      if (latencyTag) {
        latencyTag.textContent = 'IDLE';
        latencyTag.classList.remove('active');
      }
    }
  }

  // Web Speech API Initialization
  const SpeechRecognitionConstructor = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (SpeechRecognitionConstructor) {
    recognition = new SpeechRecognitionConstructor();
    recognition.continuous = true;
    recognition.interimResults = true;
    const initialLang = sourceLanguageSelect ? (sourceLanguageSelect.value as IndicLanguage) : 'English';
    recognition.lang = languageCodes[initialLang] || 'en-US';

    recognition.onstart = () => {
      isListening = true;
      if (startBtn) startBtn.disabled = true;
      if (stopBtn) stopBtn.disabled = false;
      if (startBtnText) startBtnText.textContent = 'Listening...';
      setStatus('listening');
      dismissLiveAlert();
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
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

      if (finalText && sourceTranscript) {
        sourceTranscript.value += finalText + ' ';
      }

      if (interimText && sourceTranscript) {
        sourceTranscript.value = sourceTranscript.value.trimEnd() + ' ' + interimText;
      }

      updateCharCounts();
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
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
        // Normal silence timeout; no intrusive error
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
      if (isListening && recognition) {
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

  if (startBtn) {
    startBtn.addEventListener('click', () => {
      if (!recognition) {
        showLiveAlert(
          'connection-error',
          'Speech Recognition Unavailable',
          'Speech recognition is not available in this browser. Please open in Google Chrome or Microsoft Edge.'
        );
        return;
      }

      const selectedLang = sourceLanguageSelect.value as IndicLanguage;
      recognition.lang = languageCodes[selectedLang] || 'en-US';

      try {
        recognition.start();
      } catch (error) {
        console.warn('Recognition start exception:', error);
      }
    });
  }

  function stopListening(): void {
    isListening = false;
    if (startBtn) startBtn.disabled = false;
    if (stopBtn) stopBtn.disabled = true;
    if (startBtnText) startBtnText.textContent = 'Start Speaking';

    setStatus('ready');

    if (recognition) {
      try {
        recognition.stop();
      } catch (error) {
        console.warn('Recognition stop exception:', error);
      }
    }
  }

  if (stopBtn) {
    stopBtn.addEventListener('click', stopListening);
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (sourceTranscript) sourceTranscript.value = '';
      if (targetTranslation) targetTranslation.value = '';
      updateCharCounts();
    });
  }

  function updateCharCounts(): void {
    if (sourceCharCount && sourceTranscript) {
      sourceCharCount.textContent = String(sourceTranscript.value.length);
    }
    if (targetCharCount && targetTranslation) {
      targetCharCount.textContent = String(targetTranslation.value.length);
    }
  }

  if (sourceTranscript) {
    sourceTranscript.addEventListener('input', updateCharCounts);
  }
  if (targetTranslation) {
    targetTranslation.addEventListener('input', updateCharCounts);
  }

  // Copy Buttons
  function setupCopyButton(button: HTMLButtonElement | null, textarea: HTMLTextAreaElement | null): void {
    if (!button || !textarea) return;

    button.addEventListener('click', async () => {
      const text = textarea.value.trim();
      if (!text) return;

      try {
        await navigator.clipboard.writeText(text);
        const tooltip = button.querySelector<HTMLElement>('.btn-tooltip');
        if (tooltip) {
          const oldText = tooltip.textContent || 'Copy';
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
  // 7. History Drawer & Views (Loading, Empty, Error, List)
  // =========================================================================

  function openHistoryDrawer(): void {
    if (historyDrawerOverlay && historyDrawer) {
      historyDrawerOverlay.classList.add('active');
      historyDrawer.classList.add('open');
      historyDrawerOverlay.setAttribute('aria-hidden', 'false');
      historyDrawer.setAttribute('aria-hidden', 'false');
      loadHistoryList();
    }
  }

  function closeHistoryDrawer(): void {
    if (historyDrawerOverlay && historyDrawer) {
      historyDrawerOverlay.classList.remove('active');
      historyDrawer.classList.remove('open');
      historyDrawerOverlay.setAttribute('aria-hidden', 'true');
      historyDrawer.setAttribute('aria-hidden', 'true');
      showHistoryListView();
    }
  }

  if (historyToggleBtn) historyToggleBtn.addEventListener('click', openHistoryDrawer);
  if (historyCloseBtn) historyCloseBtn.addEventListener('click', closeHistoryDrawer);
  if (historyDrawerOverlay) historyDrawerOverlay.addEventListener('click', closeHistoryDrawer);

  function updateHistoryCountBadge(): void {
    if (historyCountBadge) {
      historyCountBadge.textContent = String(state.historyList.length);
    }
  }

  function loadHistoryList(simulateError = false): void {
    state.historyLoading = true;
    state.historyError = null;

    if (historyLoadingState) historyLoadingState.classList.remove('hidden');
    if (historyErrorState) historyErrorState.classList.add('hidden');
    if (historyEmptyState) historyEmptyState.classList.add('hidden');
    if (historyItemsContainer) historyItemsContainer.classList.add('hidden');

    setTimeout(() => {
      state.historyLoading = false;
      if (historyLoadingState) historyLoadingState.classList.add('hidden');

      if (simulateError) {
        state.historyError = 'Network timeout contacting translation history store.';
        if (historyErrorMessage) historyErrorMessage.textContent = state.historyError;
        if (historyErrorState) historyErrorState.classList.remove('hidden');
        return;
      }

      if (!state.historyList || state.historyList.length === 0) {
        if (historyEmptyState) historyEmptyState.classList.remove('hidden');
        return;
      }

      renderHistoryCards();
      if (historyItemsContainer) historyItemsContainer.classList.remove('hidden');
    }, 380);
  }

  if (historyRetryBtn) {
    historyRetryBtn.addEventListener('click', () => {
      loadHistoryList(false);
    });
  }

  function renderHistoryCards(): void {
    if (!historyItemsContainer) return;
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
      card.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openSessionDetails(session.id);
        }
      });

      historyItemsContainer.appendChild(card);
    });

    updateHistoryCountBadge();
  }

  // Simulation buttons for validating UI states
  if (btnSimulateEmpty) {
    btnSimulateEmpty.addEventListener('click', () => {
      state.historyList = [];
      updateHistoryCountBadge();
      loadHistoryList(false);
    });
  }

  if (btnSimulateError) {
    btnSimulateError.addEventListener('click', () => {
      loadHistoryList(true);
    });
  }

  if (btnResetHistory) {
    btnResetHistory.addEventListener('click', () => {
      state.historyList = [...INITIAL_MOCK_SESSIONS];
      updateHistoryCountBadge();
      loadHistoryList(false);
    });
  }

  // =========================================================================
  // 8. Session Details View
  // =========================================================================

  function showHistoryListView(): void {
    if (historyListView) historyListView.classList.remove('hidden');
    if (sessionDetailView) sessionDetailView.classList.add('hidden');
    if (historyBackBtn) historyBackBtn.classList.add('hidden');
    if (historyDrawerTitle) historyDrawerTitle.textContent = 'Translation History';
    state.sessionDetail = null;
  }

  function openSessionDetails(sessionId: string): void {
    if (historyListView) historyListView.classList.add('hidden');
    if (sessionDetailView) sessionDetailView.classList.remove('hidden');
    if (historyBackBtn) historyBackBtn.classList.remove('hidden');
    if (historyDrawerTitle) historyDrawerTitle.textContent = 'Session Details';

    if (sessionDetailLoading) sessionDetailLoading.classList.remove('hidden');
    if (sessionDetailError) sessionDetailError.classList.add('hidden');
    if (sessionDetailEmpty) sessionDetailEmpty.classList.add('hidden');
    if (sessionOverviewCard) sessionOverviewCard.innerHTML = '';
    if (utteranceSequenceContainer) utteranceSequenceContainer.innerHTML = '';

    setTimeout(() => {
      if (sessionDetailLoading) sessionDetailLoading.classList.add('hidden');

      const foundSession = state.historyList.find((s) => s.id === sessionId);

      if (!foundSession) {
        state.sessionDetail = null;
        if (sessionDetailError) sessionDetailError.classList.remove('hidden');
        return;
      }

      state.sessionDetail = foundSession;
      renderSessionOverview(foundSession);
      renderUtterances(foundSession.utterances);
    }, 280);
  }

  function renderSessionOverview(session: TranslationSession): void {
    if (!sessionOverviewCard) return;

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

  function renderUtterances(utterances: Utterance[]): void {
    if (!utteranceSequenceContainer) return;
    utteranceSequenceContainer.innerHTML = '';

    if (!utterances || utterances.length === 0) {
      if (utteranceCountTag) utteranceCountTag.textContent = '0 utterances';
      if (sessionDetailEmpty) sessionDetailEmpty.classList.remove('hidden');
      return;
    }

    if (sessionDetailEmpty) sessionDetailEmpty.classList.add('hidden');
    if (utteranceCountTag) {
      utteranceCountTag.textContent = `${utterances.length} utterance${utterances.length === 1 ? '' : 's'}`;
    }

    const currentSession = state.sessionDetail;
    const sourceLang = currentSession ? currentSession.sourceLanguage : 'Source';
    const targetLang = currentSession ? currentSession.targetLanguage : 'Target';

    utterances.forEach((item, index) => {
      const card = document.createElement('div');
      card.className = 'utterance-card';

      // Rule: Show timestamps, confidence, and latency ONLY when mock data contains them
      const timestampHtml = item.timestamp
        ? `<span class="metric-pill">${item.timestamp}</span>`
        : '';

      const confidenceHtml = item.confidence !== undefined && item.confidence !== null
        ? `<span class="metric-pill confidence">${Math.round(item.confidence * 100)}% conf</span>`
        : '';

      const latencyHtml = item.latency !== undefined && item.latency !== null
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
          <span class="utterance-box-label">Spoken (${sourceLang})</span>
          <p class="utterance-text-source">${escapeHtml(item.sourceText)}</p>
        </div>
        <div class="utterance-box">
          <span class="utterance-box-label">Translation (${targetLang})</span>
          <p class="utterance-text-target">${escapeHtml(item.targetText)}</p>
        </div>
      `;

      utteranceSequenceContainer.appendChild(card);
    });
  }

  function escapeHtml(string: string): string {
    if (!string) return '';
    return string
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  if (historyBackBtn) historyBackBtn.addEventListener('click', showHistoryListView);
  if (sessionDetailBackBtn) sessionDetailBackBtn.addEventListener('click', showHistoryListView);

  // =========================================================================
  // 9. Expose Testing Utilities on Window
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
