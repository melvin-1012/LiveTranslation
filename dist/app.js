/**
 * LiveIndicTranslator - Frontend TypeScript Application Logic
 * Pure Frontend Implementation (No Backend / No DB / No API keys)
 * Converted to TypeScript with strict type definitions for:
 *  - Translation Sessions
 *  - Utterances
 *  - Application State (historyList, sessionDetail, historyLoading, historyError, preferencesSaveStatus, authUI)
 *  - Speech Recognition values & event interfaces
 *  - Live Session UI Alerts
 *  - Authentication UI (Login, Signup, Validation, Password Show/Hide)
 */
// =========================================================================
// 2. Mock Data Initialization
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
const initialAuthUIState = {
    mode: 'login',
    statusMessage: null,
    statusType: null,
    loginForm: {
        email: '',
        password: '',
        rememberMe: false
    },
    signupForm: {
        fullName: '',
        email: '',
        password: '',
        confirmPassword: '',
        preferredSourceLang: '',
        preferredTargetLang: ''
    },
    loginErrors: {},
    signupErrors: {},
    passwordVisibility: {
        loginPassword: false,
        signupPassword: false,
        signupConfirmPassword: false
    }
};
// Application state holding mock hooks
const state = {
    historyList: [...INITIAL_MOCK_SESSIONS],
    sessionDetail: null,
    historyLoading: false,
    historyError: null,
    preferencesSaveStatus: null,
    authUI: initialAuthUIState
};
// Language code dictionary for speech recognition
const languageCodes = {
    English: 'en-US',
    Tamil: 'ta-IN',
    Hindi: 'hi-IN',
    Telugu: 'te-IN',
    Kannada: 'kn-IN',
    Malayalam: 'ml-IN'
};
// Helper: Email format validation regex
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
}
// Eye Icons SVG helpers
const EYE_OPEN_SVG = `
  <svg class="eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
`;
const EYE_OFF_SVG = `
  <svg class="eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/>
    <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/>
    <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/>
    <line x1="2" y1="2" x2="22" y2="22"/>
  </svg>
`;
// =========================================================================
// 3. Application Execution (DOM Setup & Event Wireup)
// =========================================================================
document.addEventListener('DOMContentLoaded', () => {
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
    // =========================================================================
    // Authentication DOM Elements
    // =========================================================================
    const openAuthBtn = document.getElementById('openAuthBtn');
    const drawerSignInBtn = document.getElementById('drawerSignInBtn');
    const authModalOverlay = document.getElementById('authModalOverlay');
    const authModal = document.getElementById('authModal');
    const authCloseBtn = document.getElementById('authCloseBtn');
    const authModalTitle = document.getElementById('authModalTitle');
    const authModalSubtitle = document.getElementById('authModalSubtitle');
    const authStatusBanner = document.getElementById('authStatusBanner');
    const authStatusText = document.getElementById('authStatusText');
    // Login Form Elements
    const loginForm = document.getElementById('loginForm');
    const loginEmail = document.getElementById('loginEmail');
    const loginEmailError = document.getElementById('loginEmailError');
    const loginPassword = document.getElementById('loginPassword');
    const loginPasswordToggle = document.getElementById('loginPasswordToggle');
    const loginPasswordError = document.getElementById('loginPasswordError');
    const loginRememberMe = document.getElementById('loginRememberMe');
    const forgotPasswordLink = document.getElementById('forgotPasswordLink');
    const googleSignInBtn = document.getElementById('googleSignInBtn');
    const switchToSignupBtn = document.getElementById('switchToSignupBtn');
    // Signup Form Elements
    const signupForm = document.getElementById('signupForm');
    const signupName = document.getElementById('signupName');
    const signupNameError = document.getElementById('signupNameError');
    const signupEmail = document.getElementById('signupEmail');
    const signupEmailError = document.getElementById('signupEmailError');
    const signupPassword = document.getElementById('signupPassword');
    const signupPasswordToggle = document.getElementById('signupPasswordToggle');
    const signupPasswordError = document.getElementById('signupPasswordError');
    const signupConfirmPassword = document.getElementById('signupConfirmPassword');
    const signupConfirmPasswordToggle = document.getElementById('signupConfirmPasswordToggle');
    const signupConfirmPasswordError = document.getElementById('signupConfirmPasswordError');
    const signupSourceLang = document.getElementById('signupSourceLang');
    const signupSourceLangError = document.getElementById('signupSourceLangError');
    const signupTargetLang = document.getElementById('signupTargetLang');
    const signupTargetLangError = document.getElementById('signupTargetLangError');
    const signupLangPairError = document.getElementById('signupLangPairError');
    const switchToLoginBtn = document.getElementById('switchToLoginBtn');
    let recognition = null;
    let isListening = false;
    let prefTimer = null;
    // =========================================================================
    // 4. Language & Preferences Handling
    // =========================================================================
    function updateLanguageBadges() {
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
                if (fallback)
                    targetLanguageSelect.value = fallback.value;
            }
            updateLanguageBadges();
            if (recognition) {
                const selectedLang = sourceLanguageSelect.value;
                recognition.lang = languageCodes[selectedLang] || 'en-US';
            }
        });
    }
    if (targetLanguageSelect) {
        targetLanguageSelect.addEventListener('change', () => {
            if (targetLanguageSelect.value === sourceLanguageSelect.value) {
                const options = Array.from(sourceLanguageSelect.options);
                const fallback = options.find((opt) => opt.value !== targetLanguageSelect.value);
                if (fallback)
                    sourceLanguageSelect.value = fallback.value;
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
                const selectedLang = sourceLanguageSelect.value;
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
            if (prefTimer)
                clearTimeout(prefTimer);
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
    function showLiveAlert(type, title, message, actionLabel = null, actionCallback = null) {
        if (!liveAlertBox)
            return;
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
        }
        else if (type === 'connection-error') {
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
        }
        else if (type === 'translation-error') {
            liveAlertBox.classList.add('alert-translation-error');
            alertIconWrap.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>`;
        }
        else {
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
        }
        else {
            alertActionBtn.classList.add('hidden');
        }
        liveAlertBox.classList.remove('hidden');
    }
    function dismissLiveAlert() {
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
    function setStatus(status) {
        if (!statusBadge || !statusText || !audioWaves)
            return;
        statusBadge.className = 'status-pill';
        if (status === 'listening') {
            statusBadge.classList.add('status-listening');
            statusText.textContent = 'Listening';
            audioWaves.classList.add('listening');
            if (sourceHint)
                sourceHint.textContent = 'Listening to microphone...';
            if (targetHint)
                targetHint.textContent = 'Speech will appear here...';
            // Rule: Do not show fake/random latency. Use "—" or "Waiting for connection"
            if (latencyDisplay)
                latencyDisplay.textContent = 'Waiting for connection';
            if (latencyTag) {
                latencyTag.textContent = 'STREAMING';
                latencyTag.classList.add('active');
            }
        }
        else if (status === 'translating') {
            statusBadge.classList.add('status-translating');
            statusText.textContent = 'Translating';
            audioWaves.classList.add('listening');
            if (sourceHint)
                sourceHint.textContent = 'Processing speech input...';
            if (targetHint)
                targetHint.textContent = 'Awaiting live translation stream...';
        }
        else {
            statusBadge.classList.add('status-ready');
            statusText.textContent = 'Ready';
            audioWaves.classList.remove('listening');
            if (sourceHint)
                sourceHint.textContent = 'Mic is currently inactive';
            if (targetHint)
                targetHint.textContent = 'Awaiting speech input';
            if (latencyDisplay)
                latencyDisplay.textContent = '—';
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
        const initialLang = sourceLanguageSelect ? sourceLanguageSelect.value : 'English';
        recognition.lang = languageCodes[initialLang] || 'en-US';
        recognition.onstart = () => {
            isListening = true;
            if (startBtn)
                startBtn.disabled = true;
            if (stopBtn)
                stopBtn.disabled = false;
            if (startBtnText)
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
                }
                else {
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
        recognition.onerror = (event) => {
            console.warn('Speech recognition error:', event.error);
            if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
                showLiveAlert('mic-error', 'Microphone Permission Denied', 'Access to your microphone was blocked. Please permit microphone access in your browser address bar to transcribe speech.');
            }
            else if (event.error === 'network') {
                showLiveAlert('connection-error', 'Speech Network Connection Error', 'Network connection interrupted during speech recognition. Please verify your internet connection.');
            }
            else if (event.error === 'no-speech') {
                // Normal silence timeout; no intrusive error
            }
            else {
                showLiveAlert('translation-error', 'Speech Recognition Error', `Recognition encountered an issue: ${event.error}. Please try again.`);
            }
            stopListening();
        };
        recognition.onend = () => {
            if (isListening && recognition) {
                try {
                    recognition.start();
                }
                catch (error) {
                    console.warn('Recognition restart error:', error);
                }
            }
        };
    }
    else {
        showLiveAlert('connection-error', 'Browser Speech API Not Supported', 'Speech recognition is not natively supported in this browser. For live speech-to-text, please use Google Chrome or Microsoft Edge.');
    }
    if (startBtn) {
        startBtn.addEventListener('click', () => {
            if (!recognition) {
                showLiveAlert('connection-error', 'Speech Recognition Unavailable', 'Speech recognition is not available in this browser. Please open in Google Chrome or Microsoft Edge.');
                return;
            }
            const selectedLang = sourceLanguageSelect.value;
            recognition.lang = languageCodes[selectedLang] || 'en-US';
            try {
                recognition.start();
            }
            catch (error) {
                console.warn('Recognition start exception:', error);
            }
        });
    }
    function stopListening() {
        isListening = false;
        if (startBtn)
            startBtn.disabled = false;
        if (stopBtn)
            stopBtn.disabled = true;
        if (startBtnText)
            startBtnText.textContent = 'Start Speaking';
        setStatus('ready');
        if (recognition) {
            try {
                recognition.stop();
            }
            catch (error) {
                console.warn('Recognition stop exception:', error);
            }
        }
    }
    if (stopBtn) {
        stopBtn.addEventListener('click', stopListening);
    }
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (sourceTranscript)
                sourceTranscript.value = '';
            if (targetTranslation)
                targetTranslation.value = '';
            updateCharCounts();
        });
    }
    function updateCharCounts() {
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
    function setupCopyButton(button, textarea) {
        if (!button || !textarea)
            return;
        button.addEventListener('click', async () => {
            const text = textarea.value.trim();
            if (!text)
                return;
            try {
                await navigator.clipboard.writeText(text);
                const tooltip = button.querySelector('.btn-tooltip');
                if (tooltip) {
                    const oldText = tooltip.textContent || 'Copy';
                    tooltip.textContent = 'Copied!';
                    button.classList.add('copied');
                    setTimeout(() => {
                        tooltip.textContent = oldText;
                        button.classList.remove('copied');
                    }, 1500);
                }
            }
            catch (error) {
                console.warn('Copy failed:', error);
            }
        });
    }
    setupCopyButton(copySourceBtn, sourceTranscript);
    setupCopyButton(copyTargetBtn, targetTranslation);
    // =========================================================================
    // 7. History Drawer & Views (Loading, Empty, Error, List)
    // =========================================================================
    function openHistoryDrawer() {
        if (historyDrawerOverlay && historyDrawer) {
            historyDrawerOverlay.classList.add('active');
            historyDrawer.classList.add('open');
            historyDrawerOverlay.setAttribute('aria-hidden', 'false');
            historyDrawer.setAttribute('aria-hidden', 'false');
            loadHistoryList();
        }
    }
    function closeHistoryDrawer() {
        if (historyDrawerOverlay && historyDrawer) {
            historyDrawerOverlay.classList.remove('active');
            historyDrawer.classList.remove('open');
            historyDrawerOverlay.setAttribute('aria-hidden', 'true');
            historyDrawer.setAttribute('aria-hidden', 'true');
            showHistoryListView();
        }
    }
    if (historyToggleBtn)
        historyToggleBtn.addEventListener('click', openHistoryDrawer);
    if (historyCloseBtn)
        historyCloseBtn.addEventListener('click', closeHistoryDrawer);
    if (historyDrawerOverlay)
        historyDrawerOverlay.addEventListener('click', closeHistoryDrawer);
    function updateHistoryCountBadge() {
        if (historyCountBadge) {
            historyCountBadge.textContent = String(state.historyList.length);
        }
    }
    function loadHistoryList(simulateError = false) {
        state.historyLoading = true;
        state.historyError = null;
        if (historyLoadingState)
            historyLoadingState.classList.remove('hidden');
        if (historyErrorState)
            historyErrorState.classList.add('hidden');
        if (historyEmptyState)
            historyEmptyState.classList.add('hidden');
        if (historyItemsContainer)
            historyItemsContainer.classList.add('hidden');
        setTimeout(() => {
            state.historyLoading = false;
            if (historyLoadingState)
                historyLoadingState.classList.add('hidden');
            if (simulateError) {
                state.historyError = 'Network timeout contacting translation history store.';
                if (historyErrorMessage)
                    historyErrorMessage.textContent = state.historyError;
                if (historyErrorState)
                    historyErrorState.classList.remove('hidden');
                return;
            }
            if (!state.historyList || state.historyList.length === 0) {
                if (historyEmptyState)
                    historyEmptyState.classList.remove('hidden');
                return;
            }
            renderHistoryCards();
            if (historyItemsContainer)
                historyItemsContainer.classList.remove('hidden');
        }, 380);
    }
    if (historyRetryBtn) {
        historyRetryBtn.addEventListener('click', () => {
            loadHistoryList(false);
        });
    }
    function renderHistoryCards() {
        if (!historyItemsContainer)
            return;
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
    function showHistoryListView() {
        if (historyListView)
            historyListView.classList.remove('hidden');
        if (sessionDetailView)
            sessionDetailView.classList.add('hidden');
        if (historyBackBtn)
            historyBackBtn.classList.add('hidden');
        if (historyDrawerTitle)
            historyDrawerTitle.textContent = 'Translation History';
        state.sessionDetail = null;
    }
    function openSessionDetails(sessionId) {
        if (historyListView)
            historyListView.classList.add('hidden');
        if (sessionDetailView)
            sessionDetailView.classList.remove('hidden');
        if (historyBackBtn)
            historyBackBtn.classList.remove('hidden');
        if (historyDrawerTitle)
            historyDrawerTitle.textContent = 'Session Details';
        if (sessionDetailLoading)
            sessionDetailLoading.classList.remove('hidden');
        if (sessionDetailError)
            sessionDetailError.classList.add('hidden');
        if (sessionDetailEmpty)
            sessionDetailEmpty.classList.add('hidden');
        if (sessionOverviewCard)
            sessionOverviewCard.innerHTML = '';
        if (utteranceSequenceContainer)
            utteranceSequenceContainer.innerHTML = '';
        setTimeout(() => {
            if (sessionDetailLoading)
                sessionDetailLoading.classList.add('hidden');
            const foundSession = state.historyList.find((s) => s.id === sessionId);
            if (!foundSession) {
                state.sessionDetail = null;
                if (sessionDetailError)
                    sessionDetailError.classList.remove('hidden');
                return;
            }
            state.sessionDetail = foundSession;
            renderSessionOverview(foundSession);
            renderUtterances(foundSession.utterances);
        }, 280);
    }
    function renderSessionOverview(session) {
        if (!sessionOverviewCard)
            return;
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
        if (!utteranceSequenceContainer)
            return;
        utteranceSequenceContainer.innerHTML = '';
        if (!utterances || utterances.length === 0) {
            if (utteranceCountTag)
                utteranceCountTag.textContent = '0 utterances';
            if (sessionDetailEmpty)
                sessionDetailEmpty.classList.remove('hidden');
            return;
        }
        if (sessionDetailEmpty)
            sessionDetailEmpty.classList.add('hidden');
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
    function escapeHtml(string) {
        if (!string)
            return '';
        return string
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
    if (historyBackBtn)
        historyBackBtn.addEventListener('click', showHistoryListView);
    if (sessionDetailBackBtn)
        sessionDetailBackBtn.addEventListener('click', showHistoryListView);
    // =========================================================================
    // 9. Authentication UI Logic (Login & Signup)
    // =========================================================================
    function showAuthStatus(message, type = 'info') {
        if (!authStatusBanner || !authStatusText)
            return;
        state.authUI.statusMessage = message;
        state.authUI.statusType = type;
        authStatusBanner.className = `auth-status-banner ${type}`;
        authStatusText.textContent = message;
        authStatusBanner.classList.remove('hidden');
    }
    function clearAuthStatus() {
        if (!authStatusBanner || !authStatusText)
            return;
        state.authUI.statusMessage = null;
        state.authUI.statusType = null;
        authStatusBanner.classList.add('hidden');
        authStatusText.textContent = '';
    }
    function setFieldError(inputEl, errorEl, errorMessage) {
        if (!errorEl)
            return;
        if (errorMessage) {
            if (inputEl) {
                inputEl.classList.add('input-invalid');
                inputEl.setAttribute('aria-invalid', 'true');
            }
            errorEl.textContent = errorMessage;
            errorEl.classList.remove('hidden');
        }
        else {
            if (inputEl) {
                inputEl.classList.remove('input-invalid');
                inputEl.removeAttribute('aria-invalid');
            }
            errorEl.textContent = '';
            errorEl.classList.add('hidden');
        }
    }
    function clearLoginErrors() {
        state.authUI.loginErrors = {};
        setFieldError(loginEmail, loginEmailError);
        setFieldError(loginPassword, loginPasswordError);
    }
    function clearSignupErrors() {
        state.authUI.signupErrors = {};
        setFieldError(signupName, signupNameError);
        setFieldError(signupEmail, signupEmailError);
        setFieldError(signupPassword, signupPasswordError);
        setFieldError(signupConfirmPassword, signupConfirmPasswordError);
        setFieldError(signupSourceLang, signupSourceLangError);
        setFieldError(signupTargetLang, signupTargetLangError);
        setFieldError(null, signupLangPairError);
    }
    function openAuthModal(mode = 'login') {
        if (!authModal || !authModalOverlay)
            return;
        state.authUI.mode = mode;
        authModalOverlay.classList.add('active');
        authModal.classList.add('open');
        authModalOverlay.setAttribute('aria-hidden', 'false');
        authModal.setAttribute('aria-hidden', 'false');
        if (openAuthBtn) {
            openAuthBtn.setAttribute('aria-expanded', 'true');
        }
        switchAuthMode(mode);
    }
    function closeAuthModal() {
        if (!authModal || !authModalOverlay)
            return;
        state.authUI.mode = 'closed';
        authModalOverlay.classList.remove('active');
        authModal.classList.remove('open');
        authModalOverlay.setAttribute('aria-hidden', 'true');
        authModal.setAttribute('aria-hidden', 'true');
        if (openAuthBtn) {
            openAuthBtn.setAttribute('aria-expanded', 'false');
        }
        clearAuthStatus();
        clearLoginErrors();
        clearSignupErrors();
    }
    function switchAuthMode(mode) {
        state.authUI.mode = mode;
        clearAuthStatus();
        if (mode === 'login') {
            if (loginForm)
                loginForm.classList.remove('hidden');
            if (signupForm)
                signupForm.classList.add('hidden');
            if (authModalTitle)
                authModalTitle.textContent = 'Welcome Back';
            if (authModalSubtitle)
                authModalSubtitle.textContent = 'Sign in to sync your translation sessions';
            clearSignupErrors();
            setTimeout(() => loginEmail?.focus(), 50);
        }
        else {
            if (loginForm)
                loginForm.classList.add('hidden');
            if (signupForm)
                signupForm.classList.remove('hidden');
            if (authModalTitle)
                authModalTitle.textContent = 'Create Account';
            if (authModalSubtitle)
                authModalSubtitle.textContent = 'Set up your profile and language preferences';
            clearLoginErrors();
            setTimeout(() => signupName?.focus(), 50);
        }
    }
    // Open/Close triggers
    if (openAuthBtn) {
        openAuthBtn.addEventListener('click', () => openAuthModal('login'));
    }
    if (drawerSignInBtn) {
        drawerSignInBtn.addEventListener('click', () => {
            closeHistoryDrawer();
            openAuthModal('login');
        });
    }
    if (authCloseBtn) {
        authCloseBtn.addEventListener('click', closeAuthModal);
    }
    if (authModalOverlay) {
        authModalOverlay.addEventListener('click', closeAuthModal);
    }
    if (authModal) {
        authModal.addEventListener('click', (e) => {
            if (e.target === authModal) {
                closeAuthModal();
            }
        });
    }
    // Escape key closes Auth Modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && state.authUI.mode !== 'closed') {
            closeAuthModal();
        }
    });
    // Switch between Login and Signup
    if (switchToSignupBtn) {
        switchToSignupBtn.addEventListener('click', () => switchAuthMode('signup'));
    }
    if (switchToLoginBtn) {
        switchToLoginBtn.addEventListener('click', () => switchAuthMode('login'));
    }
    // Password Visibility Toggles
    function setupPasswordToggle(button, input, key) {
        if (!button || !input)
            return;
        button.addEventListener('click', () => {
            const isVisible = !state.authUI.passwordVisibility[key];
            state.authUI.passwordVisibility[key] = isVisible;
            input.type = isVisible ? 'text' : 'password';
            button.innerHTML = isVisible ? EYE_OFF_SVG : EYE_OPEN_SVG;
            button.setAttribute('aria-label', isVisible ? 'Hide password' : 'Show password');
        });
    }
    setupPasswordToggle(loginPasswordToggle, loginPassword, 'loginPassword');
    setupPasswordToggle(signupPasswordToggle, signupPassword, 'signupPassword');
    setupPasswordToggle(signupConfirmPasswordToggle, signupConfirmPassword, 'signupConfirmPassword');
    // Forgot password & Google button handlers (Explicit frontend-only notice)
    if (forgotPasswordLink) {
        forgotPasswordLink.addEventListener('click', () => {
            showAuthStatus('Password recovery is not connected yet. This is a frontend demo.', 'warning');
        });
    }
    if (googleSignInBtn) {
        googleSignInBtn.addEventListener('click', () => {
            showAuthStatus('Google OAuth is not connected yet. This is a frontend demo button.', 'info');
        });
    }
    // Real-time input clearing on typing
    if (loginEmail) {
        loginEmail.addEventListener('input', () => {
            if (state.authUI.loginErrors.email) {
                state.authUI.loginErrors.email = undefined;
                setFieldError(loginEmail, loginEmailError);
            }
        });
    }
    if (loginPassword) {
        loginPassword.addEventListener('input', () => {
            if (state.authUI.loginErrors.password) {
                state.authUI.loginErrors.password = undefined;
                setFieldError(loginPassword, loginPasswordError);
            }
        });
    }
    if (signupName) {
        signupName.addEventListener('input', () => {
            if (state.authUI.signupErrors.fullName) {
                state.authUI.signupErrors.fullName = undefined;
                setFieldError(signupName, signupNameError);
            }
        });
    }
    if (signupEmail) {
        signupEmail.addEventListener('input', () => {
            if (state.authUI.signupErrors.email) {
                state.authUI.signupErrors.email = undefined;
                setFieldError(signupEmail, signupEmailError);
            }
        });
    }
    if (signupPassword) {
        signupPassword.addEventListener('input', () => {
            if (state.authUI.signupErrors.password) {
                state.authUI.signupErrors.password = undefined;
                setFieldError(signupPassword, signupPasswordError);
            }
            if (state.authUI.signupErrors.confirmPassword && signupConfirmPassword?.value) {
                if (signupConfirmPassword.value === signupPassword.value) {
                    state.authUI.signupErrors.confirmPassword = undefined;
                    setFieldError(signupConfirmPassword, signupConfirmPasswordError);
                }
            }
        });
    }
    if (signupConfirmPassword) {
        signupConfirmPassword.addEventListener('input', () => {
            if (state.authUI.signupErrors.confirmPassword) {
                state.authUI.signupErrors.confirmPassword = undefined;
                setFieldError(signupConfirmPassword, signupConfirmPasswordError);
            }
        });
    }
    if (signupSourceLang) {
        signupSourceLang.addEventListener('change', () => {
            setFieldError(signupSourceLang, signupSourceLangError);
            setFieldError(null, signupLangPairError);
        });
    }
    if (signupTargetLang) {
        signupTargetLang.addEventListener('change', () => {
            setFieldError(signupTargetLang, signupTargetLangError);
            setFieldError(null, signupLangPairError);
        });
    }
    // -------------------------------------------------------------------------
    // Login Form Validation & Submission
    // -------------------------------------------------------------------------
    function validateLogin() {
        const errors = {};
        const emailVal = loginEmail?.value.trim() || '';
        const passwordVal = loginPassword?.value || '';
        if (!emailVal) {
            errors.email = 'Email address is required.';
        }
        else if (!isValidEmail(emailVal)) {
            errors.email = 'Please enter a valid email address (e.g. name@example.com).';
        }
        if (!passwordVal) {
            errors.password = 'Password cannot be empty.';
        }
        state.authUI.loginErrors = errors;
        setFieldError(loginEmail, loginEmailError, errors.email);
        setFieldError(loginPassword, loginPasswordError, errors.password);
        return Object.keys(errors).length === 0;
    }
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            clearAuthStatus();
            const isValid = validateLogin();
            if (!isValid)
                return;
            // Update state without logging sensitive credentials
            state.authUI.loginForm = {
                email: loginEmail.value.trim(),
                password: '', // Kept empty in state for security
                rememberMe: loginRememberMe ? loginRememberMe.checked : false
            };
            // Rule: Do NOT pretend authentication is real. Show explicit message.
            showAuthStatus('Authentication is not connected yet. This frontend demo validated your inputs without creating an active session.', 'info');
        });
    }
    // -------------------------------------------------------------------------
    // Signup Form Validation & Submission
    // -------------------------------------------------------------------------
    function validateSignup() {
        const errors = {};
        const nameVal = signupName?.value.trim() || '';
        const emailVal = signupEmail?.value.trim() || '';
        const passwordVal = signupPassword?.value || '';
        const confirmPasswordVal = signupConfirmPassword?.value || '';
        const sourceLangVal = signupSourceLang?.value || '';
        const targetLangVal = signupTargetLang?.value || '';
        // Full name validation
        if (!nameVal) {
            errors.fullName = 'Full name cannot be empty.';
        }
        // Email validation
        if (!emailVal) {
            errors.email = 'Email address is required.';
        }
        else if (!isValidEmail(emailVal)) {
            errors.email = 'Please enter a valid email address.';
        }
        // Password validation
        if (!passwordVal) {
            errors.password = 'Password cannot be empty.';
        }
        // Confirm password validation
        if (!confirmPasswordVal) {
            errors.confirmPassword = 'Confirm password cannot be empty.';
        }
        else if (confirmPasswordVal !== passwordVal) {
            errors.confirmPassword = 'Confirm password must match password.';
        }
        // Source language validation
        if (!sourceLangVal) {
            errors.sourceLang = 'Please select a preferred source language.';
        }
        // Target language validation
        if (!targetLangVal) {
            errors.targetLang = 'Please select a preferred target language.';
        }
        // Language pair distinct validation
        if (sourceLangVal && targetLangVal && sourceLangVal === targetLangVal) {
            errors.langPair = 'Source and target languages cannot be the same. Please choose distinct languages.';
        }
        state.authUI.signupErrors = errors;
        setFieldError(signupName, signupNameError, errors.fullName);
        setFieldError(signupEmail, signupEmailError, errors.email);
        setFieldError(signupPassword, signupPasswordError, errors.password);
        setFieldError(signupConfirmPassword, signupConfirmPasswordError, errors.confirmPassword);
        setFieldError(signupSourceLang, signupSourceLangError, errors.sourceLang);
        setFieldError(signupTargetLang, signupTargetLangError, errors.targetLang);
        setFieldError(null, signupLangPairError, errors.langPair);
        return Object.keys(errors).length === 0;
    }
    if (signupForm) {
        signupForm.addEventListener('submit', (e) => {
            e.preventDefault();
            clearAuthStatus();
            const isValid = validateSignup();
            if (!isValid)
                return;
            // Update state without logging sensitive credentials
            state.authUI.signupForm = {
                fullName: signupName.value.trim(),
                email: signupEmail.value.trim(),
                password: '',
                confirmPassword: '',
                preferredSourceLang: signupSourceLang.value,
                preferredTargetLang: signupTargetLang.value
            };
            // Rule: Do NOT pretend authentication is real. Show explicit message.
            showAuthStatus('Authentication is not connected yet. Your registration and language preferences were validated successfully in this frontend demo.', 'info');
        });
    }
    // =========================================================================
    // 10. Expose Testing Utilities on Window
    // =========================================================================
    window.LiveIndicTranslator = {
        state,
        loadHistoryList,
        openSessionDetails,
        showLiveAlert,
        dismissLiveAlert,
        setStatus,
        openAuthModal,
        closeAuthModal,
        switchAuthMode
    };
    // Initial Sync
    updateLanguageBadges();
    updateCharCounts();
    updateHistoryCountBadge();
    setStatus('ready');
    // Automatically open the Login modal on initial page load
    openAuthModal('login');
});
export {};
