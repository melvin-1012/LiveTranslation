/**
 * LiveIndicTranslator - Frontend TypeScript Application Logic
 * Frontend application with Supabase auth/profile/history integration
 * Converted to TypeScript with strict type definitions for:
 *  - Translation Sessions
 *  - Utterances
 *  - Application State (historyList, sessionDetail, historyLoading, historyError, preferencesSaveStatus, authUI)
 *  - Speech Recognition values & event interfaces
 *  - Live Session UI Alerts
 *  - Authentication UI (Login, Signup, Validation, Password Show/Hide)
 */

// =========================================================================
// 1. TypeScript Interfaces & Types
// =========================================================================
import { createClient, type User } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://yisescosbfuwpddywurr.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_GjdQtqDNXkJbuRJaGHi-qw_cEf7I9Z3';

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

export type IndicLanguage = 'English' | 'Tamil' | 'Hindi' | 'Telugu' | 'Kannada' | 'Malayalam';

export type LanguageCodeMap = Record<IndicLanguage, string>;

export type SessionStatus = 'Completed' | 'Active' | 'Saved';

export type PreferencesSaveStatus = null | 'saving' | 'success' | 'error';

export type LiveAlertType = 'mic-error' | 'connection-error' | 'translation-error' | 'info';

export type SystemStatus = 'ready' | 'listening' | 'translating';

/**
 * Authentication Modes & State
 */
export type AuthMode = 'login' | 'signup' | 'closed';

export interface LoginFormState {
  email: string;
  password: string;
  rememberMe: boolean;
}

export interface SignupFormState {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
  preferredSourceLang: IndicLanguage | string;
  preferredTargetLang: IndicLanguage | string;
}

export interface ValidationErrors {
  [field: string]: string | undefined;
}

export interface PasswordVisibilityState {
  loginPassword: boolean;
  signupPassword: boolean;
  signupConfirmPassword: boolean;
}

export interface AuthUIState {
  mode: AuthMode;
  statusMessage: string | null;
  statusType: 'info' | 'warning' | 'error' | null;
  loginForm: LoginFormState;
  signupForm: SignupFormState;
  loginErrors: ValidationErrors;
  signupErrors: ValidationErrors;
  passwordVisibility: PasswordVisibilityState;
}

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
  utteranceCount?: number;
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
  authUI: AuthUIState;
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
  loadHistoryList: (simulateError?: boolean) => Promise<void>;
  createTranslationSession: (
    sourceLanguage: string,
    targetLanguage: string
  ) => Promise<{
    sessionId: string;
    accessToken: string;
    sourceLanguageCode: string;
    targetLanguageCode: string;
    sourceLanguageId: string | null;
    targetLanguageId: string;
  }>;
  finishTranslationSession: (sessionId: string) => Promise<void>;
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
  openAuthModal: (mode?: 'login' | 'signup') => void;
  closeAuthModal: () => void;
  switchAuthMode: (mode: 'login' | 'signup') => void;
}

// Global augmentation
declare global {
  interface Window {
    LiveIndicTranslator?: WindowLiveIndicTranslator;
    SpeechRecognition?: ISpeechRecognitionConstructor;
    webkitSpeechRecognition?: ISpeechRecognitionConstructor;
  }
}

const initialAuthUIState: AuthUIState = {
  mode: 'closed',
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

const state: AppState = {
  historyList: [],
  sessionDetail: null,
  historyLoading: false,
  historyError: null,
  preferencesSaveStatus: null,
  authUI: initialAuthUIState
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

const languageDatabaseCodes: Record<IndicLanguage, string> = {
  English: 'en',
  Tamil: 'ta',
  Hindi: 'hi',
  Telugu: 'te',
  Kannada: 'kn',
  Malayalam: 'ml'
};

// Helper: Email format validation regex
function isValidEmail(email: string): boolean {
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
  const sessionDetailErrorMessage = sessionDetailError?.querySelector('.state-subtitle') as HTMLElement | null;
  const sessionDetailEmpty = document.getElementById('sessionDetailEmpty') as HTMLElement;
  const utteranceSequenceContainer = document.getElementById('utteranceSequenceContainer') as HTMLElement;
  const sessionDetailBackBtn = document.getElementById('sessionDetailBackBtn') as HTMLButtonElement;

  // =========================================================================
  // Authentication DOM Elements
  // =========================================================================
  const accountArea = document.getElementById('accountArea') as HTMLElement;
  const openAuthBtn = document.getElementById('openAuthBtn') as HTMLButtonElement;
  const accountSignInText = openAuthBtn?.querySelector('.account-signin-text') as HTMLElement | null;
  const drawerSignInBtn = document.getElementById('drawerSignInBtn') as HTMLButtonElement;
  const drawerAccountBanner = document.querySelector('.drawer-account-banner') as HTMLElement | null;

  const authModalOverlay = document.getElementById('authModalOverlay') as HTMLElement;
  const authModal = document.getElementById('authModal') as HTMLElement;
  const authCloseBtn = document.getElementById('authCloseBtn') as HTMLButtonElement;
  const authModalTitle = document.getElementById('authModalTitle') as HTMLElement;
  const authModalSubtitle = document.getElementById('authModalSubtitle') as HTMLElement;
  const authStatusBanner = document.getElementById('authStatusBanner') as HTMLElement;
  const authStatusText = document.getElementById('authStatusText') as HTMLElement;

  // Login Form Elements
  const loginForm = document.getElementById('loginForm') as HTMLFormElement;
  const loginEmail = document.getElementById('loginEmail') as HTMLInputElement;
  const loginEmailError = document.getElementById('loginEmailError') as HTMLElement;
  const loginPassword = document.getElementById('loginPassword') as HTMLInputElement;
  const loginPasswordToggle = document.getElementById('loginPasswordToggle') as HTMLButtonElement;
  const loginPasswordError = document.getElementById('loginPasswordError') as HTMLElement;
  const loginRememberMe = document.getElementById('loginRememberMe') as HTMLInputElement;
  const forgotPasswordLink = document.getElementById('forgotPasswordLink') as HTMLButtonElement;
  const googleSignInBtn = document.getElementById('googleSignInBtn') as HTMLButtonElement;
  const switchToSignupBtn = document.getElementById('switchToSignupBtn') as HTMLButtonElement;

  // Signup Form Elements
  const signupForm = document.getElementById('signupForm') as HTMLFormElement;
  const signupName = document.getElementById('signupName') as HTMLInputElement;
  const signupNameError = document.getElementById('signupNameError') as HTMLElement;
  const signupEmail = document.getElementById('signupEmail') as HTMLInputElement;
  const signupEmailError = document.getElementById('signupEmailError') as HTMLElement;
  const signupPassword = document.getElementById('signupPassword') as HTMLInputElement;
  const signupPasswordToggle = document.getElementById('signupPasswordToggle') as HTMLButtonElement;
  const signupPasswordError = document.getElementById('signupPasswordError') as HTMLElement;
  const signupConfirmPassword = document.getElementById('signupConfirmPassword') as HTMLInputElement;
  const signupConfirmPasswordToggle = document.getElementById('signupConfirmPasswordToggle') as HTMLButtonElement;
  const signupConfirmPasswordError = document.getElementById('signupConfirmPasswordError') as HTMLElement;
  const signupSourceLang = document.getElementById('signupSourceLang') as HTMLSelectElement;
  const signupSourceLangError = document.getElementById('signupSourceLangError') as HTMLElement;
  const signupTargetLang = document.getElementById('signupTargetLang') as HTMLSelectElement;
  const signupTargetLangError = document.getElementById('signupTargetLangError') as HTMLElement;
  const signupLangPairError = document.getElementById('signupLangPairError') as HTMLElement;
  const switchToLoginBtn = document.getElementById('switchToLoginBtn') as HTMLButtonElement;

  let recognition: ISpeechRecognition | null = null;
  let isListening = false;
  let prefTimer: ReturnType<typeof setTimeout> | null = null;
  let historyLoadRequest = 0;
  let historyLoadedForUserId: string | null = null;

  // =========================================================================
  // 4. Language & Preferences Handling
  // =========================================================================
  let currentUser: User | null = null;

  function databaseLanguageCode(language: string): string {
    const code = languageDatabaseCodes[language as IndicLanguage];
    if (!code) throw new Error(`Unsupported language: ${language}`);
    return code;
  }

  async function resolveLanguageIds(
    sourceLanguage: string,
    targetLanguage: string
  ): Promise<{ sourceLanguageId: string; targetLanguageId: string }> {
    const codes = [
      databaseLanguageCode(sourceLanguage),
      databaseLanguageCode(targetLanguage)
    ];
    const { data, error } = await supabase
      .from('supported_languages')
      .select('id, code')
      .in('code', codes);
    if (error) throw error;

    const source = data?.find((language) => language.code === codes[0]);
    const target = data?.find((language) => language.code === codes[1]);
    if (!source || !target) {
      throw new Error('One or more selected languages are not available.');
    }
    return {
      sourceLanguageId: source.id,
      targetLanguageId: target.id
    };
  }

  async function resolveLanguageId(language: string): Promise<string> {
    const code = databaseLanguageCode(language);
    const { data, error } = await supabase
      .from('supported_languages')
      .select('id')
      .eq('code', code)
      .single();
    if (error) throw error;
    return data.id;
  }

  async function saveProfilePreferences(
    userId: string,
    sourceLanguage: string,
    targetLanguage: string,
    displayName?: string
  ): Promise<void> {
    const languageIds = sourceLanguage === 'Auto'
      ? {
          sourceLanguageId: null,
          targetLanguageId: await resolveLanguageId(targetLanguage)
        }
      : await resolveLanguageIds(sourceLanguage, targetLanguage);
    const profile: {
      id: string;
      preferred_source_language_id: string | null;
      preferred_target_language_id: string;
      display_name?: string;
    } = {
      id: userId,
      preferred_source_language_id: languageIds.sourceLanguageId,
      preferred_target_language_id: languageIds.targetLanguageId
    };
    if (displayName) profile.display_name = displayName;

    const { error } = await supabase
      .from('profiles')
      .upsert(profile, { onConflict: 'id' });
    if (error) throw error;
  }

  async function createTranslationSession(
    sourceLanguage: string,
    targetLanguage: string
  ): Promise<{
    sessionId: string;
    accessToken: string;
    sourceLanguageCode: string;
    targetLanguageCode: string;
    sourceLanguageId: string | null;
    targetLanguageId: string;
  }> {
    if (!currentUser) {
      openAuthModal('login');
      throw new Error('Sign in to save translation sessions.');
    }
    if (sourceLanguage !== 'Auto' && sourceLanguage === targetLanguage) {
      throw new Error('Choose two different languages for translation.');
    }
    const { data: authData, error: authError } = await supabase.auth.getSession();
    if (authError) throw authError;
    if (!authData.session?.access_token || authData.session.user.id !== currentUser.id) {
      throw new Error('Your sign-in session has expired. Please sign in again.');
    }

    const languageIds = sourceLanguage === 'Auto'
      ? { sourceLanguageId: null, targetLanguageId: await resolveLanguageId(targetLanguage) }
      : await resolveLanguageIds(sourceLanguage, targetLanguage);
    const { data, error } = await supabase
      .from('translation_sessions')
      .insert({
        user_id: currentUser.id,
        source_language_id: languageIds.sourceLanguageId,
        target_language_id: languageIds.targetLanguageId,
        mode: 'one_way',
        status: 'active'
      })
      .select('id')
      .single();
    if (error) throw error;

    return {
      sessionId: data.id,
      accessToken: authData.session.access_token,
      sourceLanguageCode: sourceLanguage === 'Auto' ? 'auto' : databaseLanguageCode(sourceLanguage),
      targetLanguageCode: databaseLanguageCode(targetLanguage),
      sourceLanguageId: languageIds.sourceLanguageId,
      targetLanguageId: languageIds.targetLanguageId
    };
  }

  async function finishTranslationSession(sessionId: string): Promise<void> {
    if (!currentUser) return;
    const userId = currentUser.id;
    const { data: session, error: sessionError } = await supabase
      .from('translation_sessions')
      .select('started_at')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .maybeSingle();
    if (sessionError) throw sessionError;
    if (!session?.started_at) {
      throw new Error('Translation session was not found for the signed-in user.');
    }

    const startedAt = Date.parse(session.started_at);
    if (!Number.isFinite(startedAt)) {
      throw new Error('The translation session has an invalid start time.');
    }
    const endedAt = new Date(Math.max(Date.now(), startedAt + 1000)).toISOString();
    const { error } = await supabase
      .from('translation_sessions')
      .update({ status: 'completed', ended_at: endedAt })
      .eq('id', sessionId)
      .eq('user_id', userId);
    if (error) throw error;
    if (historyDrawer?.classList.contains('open')) await loadHistoryList();
  }

  function setPreferencesStatus(status: PreferencesSaveStatus, message?: string): void {
    state.preferencesSaveStatus = status;
    if (!preferencesStatusBadge) return;
    preferencesStatusBadge.className = `pref-status-pill ${status || ''}`;
    preferencesStatusBadge.textContent = message || '';
    preferencesStatusBadge.classList.toggle('hidden', !message);
  }

  function updateLanguageBadges(): void {
    if (sourceLangBadge && sourceLanguageSelect) {
      sourceLangBadge.textContent = sourceLanguageSelect.value === 'Auto'
        ? 'Auto-detect'
        : sourceLanguageSelect.value;
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
      if (sourceLanguageSelect.value !== 'Auto' && sourceLanguageSelect.value === targetLanguageSelect.value) {
        const options = Array.from(targetLanguageSelect.options);
        const fallback = options.find((opt) => opt.value !== sourceLanguageSelect.value);
        if (fallback) targetLanguageSelect.value = fallback.value;
      }
      updateLanguageBadges();

      if (recognition) {
        const selectedLang = sourceLanguageSelect.value as IndicLanguage;
        recognition.lang = sourceLanguageSelect.value === 'Auto'
          ? 'en-IN'
          : languageCodes[selectedLang] || 'en-US';
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
      if (sourceLanguageSelect.value === 'Auto') return;
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

  // Save the selected language pair to the signed-in user's profile.
  if (savePreferencesBtn) {
    savePreferencesBtn.addEventListener('click', async () => {
      if (prefTimer) clearTimeout(prefTimer);

      if (!currentUser) {
        setPreferencesStatus('error', 'Sign in to save preferences.');
        openAuthModal('login');
        return;
      }

      setPreferencesStatus('saving', 'Saving...');
      try {
        await saveProfilePreferences(
          currentUser.id,
          sourceLanguageSelect.value,
          targetLanguageSelect.value
        );
        setPreferencesStatus(
          'success',
          `✓ Saved (${sourceLanguageSelect.value} → ${targetLanguageSelect.value})`
        );
        prefTimer = setTimeout(() => setPreferencesStatus(null), 3200);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setPreferencesStatus('error', `Could not save preferences: ${message}`);
      }
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

  function describeError(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    if (error && typeof error === 'object') {
      const errorData = error as Record<string, unknown>;
      const parts = [errorData.message, errorData.details, errorData.hint]
        .filter((part): part is string => typeof part === 'string' && part.length > 0);
      if (typeof errorData.code === 'string') parts.push(`Code: ${errorData.code}`);
      if (parts.length) return parts.join(' ');
    }
    return 'An unexpected error occurred.';
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
      const isAuthenticated = currentUser !== null
        && historyLoadedForUserId === currentUser.id;
      historyCountBadge.textContent = String(state.historyList.length);
      historyCountBadge.classList.toggle('hidden', !isAuthenticated);
    }
  }

  function loadHistoryList(simulateError = false): Promise<void> {
    const requestId = ++historyLoadRequest;
    const requestedUserId = currentUser?.id || null;
    state.historyLoading = true;
    state.historyError = null;

    if (historyLoadingState) historyLoadingState.classList.remove('hidden');
    if (historyErrorState) historyErrorState.classList.add('hidden');
    if (historyEmptyState) historyEmptyState.classList.add('hidden');
    if (historyItemsContainer) historyItemsContainer.classList.add('hidden');

    return (async () => {
      try {
        if (simulateError) {
          throw new Error('Network timeout contacting translation history store.');
        }

        if (requestedUserId) {
          const { data, error } = await supabase
            .from('session_history_view')
            .select('*')
            .eq('user_id', requestedUserId)
            .order('started_at', { ascending: false });
          if (error) throw error;

          if (requestId !== historyLoadRequest || currentUser?.id !== requestedUserId) return;
          state.historyList = (data || []).map((row) => {
            const startedAt = new Date(row.started_at);
            const endedAt = row.ended_at ? new Date(row.ended_at) : null;
            const durationMs = endedAt ? endedAt.getTime() - startedAt.getTime() : null;
            const duration = durationMs !== null && durationMs >= 0
              ? `${Math.floor(durationMs / 60000)}m ${Math.floor((durationMs % 60000) / 1000)}s`
              : null;
            const status: SessionStatus = row.status === 'completed'
              ? 'Completed'
              : row.status === 'active'
                ? 'Active'
                : 'Saved';

            return {
              id: row.session_id,
              dateTime: startedAt.toLocaleString(),
              sourceLanguage: row.source_language || row.source_language_code || 'Unknown',
              targetLanguage: row.target_language || row.target_language_code || 'Unknown',
              status,
              duration,
              utterances: [],
              utteranceCount: Number(row.total_utterances || 0)
            };
          });
          historyLoadedForUserId = requestedUserId;
        } else {
          state.historyList = [];
          historyLoadedForUserId = null;
        }
      } catch (error) {
        if (requestId !== historyLoadRequest || currentUser?.id !== requestedUserId) return;
        state.historyError = error instanceof Error ? error.message : String(error);
      } finally {
        if (requestId === historyLoadRequest) {
          state.historyLoading = false;
          if (historyLoadingState) historyLoadingState.classList.add('hidden');
        }
      }

      if (requestId !== historyLoadRequest || currentUser?.id !== requestedUserId) return;
      updateHistoryCountBadge();
      if (state.historyError) {
        if (historyErrorMessage) historyErrorMessage.textContent = state.historyError;
        if (historyErrorState) historyErrorState.classList.remove('hidden');
        return;
      }
      if (!currentUser) return;
      if (!state.historyList || state.historyList.length === 0) {
        if (historyEmptyState) historyEmptyState.classList.remove('hidden');
        return;
      }

      renderHistoryCards();
      if (historyItemsContainer) historyItemsContainer.classList.remove('hidden');
    })();
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
      const utteranceCount = session.utteranceCount ?? session.utterances.length;

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
      void loadHistoryList();
    });
  }

  if (btnSimulateError) {
    btnSimulateError.addEventListener('click', () => {
      loadHistoryList(true);
    });
  }

  if (btnResetHistory) {
    btnResetHistory.addEventListener('click', () => {
      void loadHistoryList();
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

  async function openSessionDetails(sessionId: string): Promise<void> {
    if (historyListView) historyListView.classList.add('hidden');
    if (sessionDetailView) sessionDetailView.classList.remove('hidden');
    if (historyBackBtn) historyBackBtn.classList.remove('hidden');
    if (historyDrawerTitle) historyDrawerTitle.textContent = 'Session Details';

    if (sessionDetailLoading) sessionDetailLoading.classList.remove('hidden');
    if (sessionDetailError) sessionDetailError.classList.add('hidden');
    if (sessionDetailEmpty) sessionDetailEmpty.classList.add('hidden');
    if (sessionOverviewCard) sessionOverviewCard.innerHTML = '';
    if (utteranceSequenceContainer) utteranceSequenceContainer.innerHTML = '';

    try {
      let foundSession = state.historyList.find((session) => session.id === sessionId);
      if (currentUser && foundSession) {
        const { data, error } = await supabase
          .from('translation_performance_view')
          .select('*')
          .eq('session_id', sessionId)
          .order('sequence_number', { ascending: true });
        if (error) throw error;

        const utterances: Utterance[] = (data || []).map((row) => ({
          id: row.utterance_id,
          speaker: 'Speaker 1',
          timestamp: null,
          confidence: row.translation_confidence === null
            ? null
            : Number(row.translation_confidence),
          latency: row.end_to_end_latency_ms === null
            ? null
            : `${row.end_to_end_latency_ms} ms`,
          sourceText: row.source_text || '',
          targetText: row.translated_text || ''
        }));
        foundSession = { ...foundSession, utterances, utteranceCount: utterances.length };
      }
      if (!foundSession) {
        state.sessionDetail = null;
        if (sessionDetailError) sessionDetailError.classList.remove('hidden');
        return;
      }

      state.sessionDetail = foundSession;
      renderSessionOverview(foundSession);
      renderUtterances(foundSession.utterances);
    } catch (error) {
      state.sessionDetail = null;
      if (sessionDetailErrorMessage) {
        sessionDetailErrorMessage.textContent = error instanceof Error
          ? error.message
          : String(error);
      }
      if (sessionDetailError) {
        sessionDetailError.classList.remove('hidden');
      }
    } finally {
      if (sessionDetailLoading) sessionDetailLoading.classList.add('hidden');
    }
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
  // 9. Authentication UI Logic (Login & Signup)
  // =========================================================================

  function showAuthStatus(message: string, type: 'info' | 'warning' | 'error' = 'info'): void {
    if (!authStatusBanner || !authStatusText) return;
    state.authUI.statusMessage = message;
    state.authUI.statusType = type;

    authStatusBanner.className = `auth-status-banner ${type}`;
    authStatusText.textContent = message;
    authStatusBanner.classList.remove('hidden');
  }

  function clearAuthStatus(): void {
    if (!authStatusBanner || !authStatusText) return;
    state.authUI.statusMessage = null;
    state.authUI.statusType = null;
    authStatusBanner.classList.add('hidden');
    authStatusText.textContent = '';
  }

  function setFieldError(
    inputEl: HTMLElement | null,
    errorEl: HTMLElement | null,
    errorMessage?: string
  ): void {
    if (!errorEl) return;
    if (errorMessage) {
      if (inputEl) {
        inputEl.classList.add('input-invalid');
        inputEl.setAttribute('aria-invalid', 'true');
      }
      errorEl.textContent = errorMessage;
      errorEl.classList.remove('hidden');
    } else {
      if (inputEl) {
        inputEl.classList.remove('input-invalid');
        inputEl.removeAttribute('aria-invalid');
      }
      errorEl.textContent = '';
      errorEl.classList.add('hidden');
    }
  }

  function clearLoginErrors(): void {
    state.authUI.loginErrors = {};
    setFieldError(loginEmail, loginEmailError);
    setFieldError(loginPassword, loginPasswordError);
  }

  function clearSignupErrors(): void {
    state.authUI.signupErrors = {};
    setFieldError(signupName, signupNameError);
    setFieldError(signupEmail, signupEmailError);
    setFieldError(signupPassword, signupPasswordError);
    setFieldError(signupConfirmPassword, signupConfirmPasswordError);
    setFieldError(signupSourceLang, signupSourceLangError);
    setFieldError(signupTargetLang, signupTargetLangError);
    setFieldError(null, signupLangPairError);
  }

  function updateAccountUI(user: User | null): void {
    const signedIn = Boolean(user);
    const displayName = user?.user_metadata?.full_name as string | undefined;
    if (accountSignInText) {
      accountSignInText.textContent = user
        ? `${displayName || user.email || 'Signed in'} · Sign out`
        : 'Sign in to view your history';
    }
    if (openAuthBtn) {
      openAuthBtn.title = signedIn ? 'Sign out' : 'Sign in to view your history';
      openAuthBtn.setAttribute('aria-expanded', 'false');
    }
    if (accountArea) {
      accountArea.setAttribute('aria-label', signedIn ? 'Signed-in account' : 'Account');
    }
    if (drawerAccountBanner) {
      drawerAccountBanner.classList.toggle('hidden', signedIn);
    }
  }

  async function hydrateUserProfile(user: User): Promise<void> {
    const { data: existingProfile, error: profileError } = await supabase
      .from('profiles')
      .select('display_name, preferred_source_language_id, preferred_target_language_id')
      .eq('id', user.id)
      .maybeSingle();
    if (profileError) throw profileError;

    const metadata = user.user_metadata || {};
    const profileUpdate: {
      id: string;
      display_name?: string;
      preferred_source_language_id?: string;
      preferred_target_language_id?: string;
    } = { id: user.id };
    if (typeof metadata.full_name === 'string' && metadata.full_name.trim()) {
      profileUpdate.display_name = metadata.full_name.trim();
    }

    const sourceCode = metadata.preferred_source_language as string | undefined;
    const targetCode = metadata.preferred_target_language as string | undefined;
    const sourceLanguage = (Object.keys(languageDatabaseCodes) as IndicLanguage[])
      .find((language) => languageDatabaseCodes[language] === sourceCode);
    const targetLanguage = (Object.keys(languageDatabaseCodes) as IndicLanguage[])
      .find((language) => languageDatabaseCodes[language] === targetCode);
    if (sourceLanguage && targetLanguage) {
      const languageIds = await resolveLanguageIds(sourceLanguage, targetLanguage);
      if (!existingProfile?.preferred_source_language_id) {
        profileUpdate.preferred_source_language_id = languageIds.sourceLanguageId;
      }
      if (!existingProfile?.preferred_target_language_id) {
        profileUpdate.preferred_target_language_id = languageIds.targetLanguageId;
      }
    }

    if (Object.keys(profileUpdate).length > 1 || !existingProfile) {
      const { error } = await supabase
        .from('profiles')
        .upsert(profileUpdate, { onConflict: 'id' });
      if (error) throw error;
    }

    const { data: profile, error: refreshedProfileError } = await supabase
      .from('profiles')
      .select('preferred_source_language_id, preferred_target_language_id')
      .eq('id', user.id)
      .maybeSingle();
    if (refreshedProfileError) throw refreshedProfileError;

    const languageIds = [
      profile?.preferred_source_language_id,
      profile?.preferred_target_language_id
    ].filter((id): id is string => Boolean(id));
    if (!languageIds.length) return;

    const { data: languages, error: languagesError } = await supabase
      .from('supported_languages')
      .select('id, code')
      .in('id', languageIds);
    if (languagesError) throw languagesError;

    const languageNameById = new Map(
      (languages || []).map((language) => [
        language.id,
        (Object.keys(languageDatabaseCodes) as IndicLanguage[])
          .find((name) => languageDatabaseCodes[name] === language.code)
      ])
    );
    const preferredSource = profile?.preferred_source_language_id
      ? languageNameById.get(profile.preferred_source_language_id)
      : undefined;
    const preferredTarget = profile?.preferred_target_language_id
      ? languageNameById.get(profile.preferred_target_language_id)
      : undefined;
    if (preferredSource && sourceLanguageSelect) sourceLanguageSelect.value = preferredSource;
    if (preferredTarget && targetLanguageSelect) targetLanguageSelect.value = preferredTarget;
    updateLanguageBadges();
  }

  function openAuthModal(mode: 'login' | 'signup' = 'login'): void {
    if (!authModal || !authModalOverlay) return;

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

  function closeAuthModal(): void {
    if (!authModal || !authModalOverlay) return;

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

  function switchAuthMode(mode: 'login' | 'signup'): void {
    state.authUI.mode = mode;
    clearAuthStatus();

    if (mode === 'login') {
      if (loginForm) loginForm.classList.remove('hidden');
      if (signupForm) signupForm.classList.add('hidden');
      if (authModalTitle) authModalTitle.textContent = 'Welcome Back';
      if (authModalSubtitle) authModalSubtitle.textContent = 'Sign in to sync your translation sessions';
      clearSignupErrors();
      setTimeout(() => loginEmail?.focus(), 50);
    } else {
      if (loginForm) loginForm.classList.add('hidden');
      if (signupForm) signupForm.classList.remove('hidden');
      if (authModalTitle) authModalTitle.textContent = 'Create Account';
      if (authModalSubtitle) authModalSubtitle.textContent = 'Set up your profile and language preferences';
      clearLoginErrors();
      setTimeout(() => signupName?.focus(), 50);
    }
  }

  // Open/Close triggers
  if (openAuthBtn) {
    openAuthBtn.addEventListener('click', async () => {
      if (!currentUser) {
        openAuthModal('login');
        return;
      }
      try {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
      } catch (error) {
        showLiveAlert(
          'info',
          'Sign out failed',
          error instanceof Error ? error.message : String(error)
        );
      }
    });
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
    authModal.addEventListener('click', (e: MouseEvent) => {
      if (e.target === authModal) {
        closeAuthModal();
      }
    });
  }

  // Escape key closes Auth Modal
  document.addEventListener('keydown', (e: KeyboardEvent) => {
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
  function setupPasswordToggle(
    button: HTMLButtonElement | null,
    input: HTMLInputElement | null,
    key: keyof PasswordVisibilityState
  ): void {
    if (!button || !input) return;

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
  function validateLogin(): boolean {
    const errors: ValidationErrors = {};
    const emailVal = loginEmail?.value.trim() || '';
    const passwordVal = loginPassword?.value || '';

    if (!emailVal) {
      errors.email = 'Email address is required.';
    } else if (!isValidEmail(emailVal)) {
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
    loginForm.addEventListener('submit', async (e: Event) => {
      e.preventDefault();
      clearAuthStatus();

      const isValid = validateLogin();
      if (!isValid) return;

      const email = loginEmail.value.trim();
      const password = loginPassword.value;
      state.authUI.loginForm = {
        email,
        password: '',
        rememberMe: loginRememberMe ? loginRememberMe.checked : false
      };

      try {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        closeAuthModal();
      } catch (error) {
        showAuthStatus(
          describeError(error),
          'error'
        );
      } finally {
        loginPassword.value = '';
        state.authUI.loginForm.password = '';
      }
    });
  }

  // -------------------------------------------------------------------------
  // Signup Form Validation & Submission
  // -------------------------------------------------------------------------
  function validateSignup(): boolean {
    const errors: ValidationErrors = {};
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
    } else if (!isValidEmail(emailVal)) {
      errors.email = 'Please enter a valid email address.';
    }

    // Password validation
    if (!passwordVal) {
      errors.password = 'Password cannot be empty.';
    }

    // Confirm password validation
    if (!confirmPasswordVal) {
      errors.confirmPassword = 'Confirm password cannot be empty.';
    } else if (confirmPasswordVal !== passwordVal) {
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
    signupForm.addEventListener('submit', async (e: Event) => {
      e.preventDefault();
      clearAuthStatus();

      const isValid = validateSignup();
      if (!isValid) return;

      const fullName = signupName.value.trim();
      const email = signupEmail.value.trim();
      const password = signupPassword.value;
      const preferredSourceLang = signupSourceLang.value;
      const preferredTargetLang = signupTargetLang.value;
      state.authUI.signupForm = {
        fullName,
        email,
        password: '',
        confirmPassword: '',
        preferredSourceLang,
        preferredTargetLang
      };

      try {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
              preferred_source_language: databaseLanguageCode(preferredSourceLang),
              preferred_target_language: databaseLanguageCode(preferredTargetLang)
            }
          }
        });
        if (error) throw error;
        if (data.session && data.user) {
          await saveProfilePreferences(
            data.user.id,
            preferredSourceLang,
            preferredTargetLang,
            fullName
          );
          closeAuthModal();
        } else {
          showAuthStatus(
            'Account created. Check your email to confirm your address before signing in.',
            'info'
          );
        }
      } catch (error) {
        showAuthStatus(
          describeError(error),
          'error'
        );
      } finally {
        signupPassword.value = '';
        signupConfirmPassword.value = '';
        state.authUI.signupForm.password = '';
        state.authUI.signupForm.confirmPassword = '';
      }
    });
  }

  // =========================================================================
  // 10. Expose Testing Utilities on Window
  // =========================================================================

  window.LiveIndicTranslator = {
    state,
    loadHistoryList,
    createTranslationSession,
    finishTranslationSession,
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

  supabase.auth.onAuthStateChange((event, session) => {
    const previousUserId = currentUser?.id || null;
    currentUser = session?.user || null;
    if (previousUserId !== (currentUser?.id || null)) {
      state.historyList = [];
      state.sessionDetail = null;
      historyLoadedForUserId = null;
      if (historyItemsContainer) historyItemsContainer.innerHTML = '';
      showHistoryListView();
    }
    updateAccountUI(currentUser);

    if (currentUser) {
      closeAuthModal();
      const changedUser = currentUser;
      window.setTimeout(() => {
        if (currentUser?.id !== changedUser.id) return;
        const shouldHydrateProfile = event === 'SIGNED_IN' || event === 'INITIAL_SESSION';
        const refreshHistory = async () => {
          if (shouldHydrateProfile) {
            try {
              await hydrateUserProfile(changedUser);
            } catch (error) {
              showLiveAlert('info', 'Profile sync failed', describeError(error));
            }
          }
          await loadHistoryList();
        };
        void refreshHistory().catch((error: unknown) => {
          showLiveAlert('info', 'History sync failed', describeError(error));
        });
      }, 0);
    } else {
      state.historyList = [];
      state.sessionDetail = null;
      historyLoadedForUserId = null;
      if (historyItemsContainer) historyItemsContainer.innerHTML = '';
      showHistoryListView();
      updateHistoryCountBadge();
      void loadHistoryList();
    }
  });

  void (async () => {
    let sessionUser: User | null = null;
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      sessionUser = data.session?.user || null;
    } catch (error) {
      currentUser = null;
      updateAccountUI(null);
      showLiveAlert(
        'info',
        'Authentication status unavailable',
        describeError(error)
      );
      return;
    }

    currentUser = sessionUser;
    updateAccountUI(currentUser);
    if (!currentUser) return;

    closeAuthModal();
    try {
      await hydrateUserProfile(currentUser);
    } catch (error) {
      showLiveAlert('info', 'Profile sync failed', describeError(error));
    }
    await loadHistoryList();
  })();

});
