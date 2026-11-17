import {
  LANGUAGE_INSTRUCTIONS,
  STYLE_INSTRUCTIONS,
  TARGET_LANGUAGE_NAMES,
  TRANSLATION_TONE_INSTRUCTIONS,
  buildGlossaryAndRulesPromptBlock,
  buildRewritePrompts,
  buildTranslationPrompts,
  buildTranslationVerificationPrompts,
  buildVerificationPrompts,
} from './prompts';
import { DEFAULT_STARTER_RULES, DEFAULT_WORKSPACE_SETTINGS } from '../types';
import type {
  ChangeCategory,
  ChangeItem,
  HistoryEntry,
  OpenRouterModel,
  OpenRouterStatus,
  RewriteMode,
  RewriteTask,
  SourceLanguageId,
  TargetLanguageId,
  TranslationTone,
  WritingPreferences,
  WritingStyleId,
} from '../types';

const DEFAULT_MODEL = 'openrouter/free';

const FEATURED_ORDER = [
  'openrouter/free',
  'openrouter/auto',
  'google/gemini-2.5-flash',
  'google/gemini-2.0-flash-001',
  'openai/gpt-4o-mini',
  'anthropic/claude-3.5-haiku',
  'anthropic/claude-3.5-sonnet',
  'deepseek/deepseek-chat',
  'openai/gpt-4o',
  'meta-llama/llama-3.3-70b-instruct',
];

const BUILD_PAID_PASSWORD_HASH = (import.meta.env.VITE_PAID_MODELS_PASSWORD_HASH || '')
  .trim()
  .toLowerCase();

// Client-side persistence for static hosting (GitHub Pages / Cloudflare Pages)
const STORAGE_KEY_API_KEY = 'openrouter_api_key';
const STORAGE_KEY_MODEL = 'openrouter_model';
const STORAGE_KEY_SECONDARY_MODEL = 'openrouter_secondary_model';
const STORAGE_KEY_DUAL = 'openrouter_dual_review';
const STORAGE_KEY_ZDR = 'openrouter_enforce_zdr';
const STORAGE_KEY_PREFS = 'uxz_writing_preferences';
const STORAGE_KEY_HISTORY = 'uxz_rewrite_history';
const STORAGE_KEY_DARK_MODE = 'uxz_dark_mode';
const STORAGE_KEY_UI_LANG = 'uxz_ui_lang';

function isEnglishUi(): boolean {
  return getStoredString(STORAGE_KEY_UI_LANG) === 'en';
}

function getStoredString(key: string): string {
  if (typeof window === 'undefined') return '';
  try {
    return localStorage.getItem(key) || sessionStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function setStoredString(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, value);
    sessionStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

function removeStoredString(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function loadInitialPreferences(): WritingPreferences {
  const fallback: WritingPreferences = {
    terms: [],
    rules: DEFAULT_STARTER_RULES.map((r) => ({ ...r })),
    settings: {
      ...DEFAULT_WORKSPACE_SETTINGS,
      enabledLanguages: [...DEFAULT_WORKSPACE_SETTINGS.enabledLanguages],
    },
  };
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PREFS) || sessionStorage.getItem(STORAGE_KEY_PREFS);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return {
      terms: Array.isArray(parsed.terms) ? parsed.terms : fallback.terms,
      rules: Array.isArray(parsed.rules) ? parsed.rules : fallback.rules,
      settings: parsed.settings
        ? { ...DEFAULT_WORKSPACE_SETTINGS, ...parsed.settings }
        : fallback.settings,
    };
  } catch {
    return fallback;
  }
}

function loadInitialHistory(): HistoryEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_HISTORY) || sessionStorage.getItem(STORAGE_KEY_HISTORY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

let backendAvailable: boolean | null = null;
let memoryApiKey = getStoredString(STORAGE_KEY_API_KEY);
let memoryModel = getStoredString(STORAGE_KEY_MODEL) || DEFAULT_MODEL;
let memoryDualReviewEnabled = getStoredString(STORAGE_KEY_DUAL) === 'true';
let memorySecondaryModel = getStoredString(STORAGE_KEY_SECONDARY_MODEL) || DEFAULT_MODEL;
let memoryEnforceZdr = getStoredString(STORAGE_KEY_ZDR) === 'true';
let memoryKeyInfo: OpenRouterStatus['keyInfo'] = null;
let memoryPaidUnlocked = false;
let memoryPaidPasswordHash = '';
let memoryHistory: HistoryEntry[] = loadInitialHistory();
let memoryPreferences: WritingPreferences = loadInitialPreferences();
let cachedStaticModels: { fetchedAt: number; models: OpenRouterModel[] } | null = null;

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function isStaticModelFree(modelId: string): Promise<boolean> {
  const normalized = modelId.trim();
  if (normalized === 'openrouter/free' || normalized.endsWith(':free')) return true;
  if (cachedStaticModels) {
    const match = cachedStaticModels.models.find((m) => m.id === normalized);
    if (match) return match.promptPricePer1M === 0 && match.completionPricePer1M === 0;
  }
  const models = await fetchOpenRouterModels().catch(() => []);
  const match = models.find((m) => m.id === normalized);
  return Boolean(match && match.promptPricePer1M === 0 && match.completionPricePer1M === 0);
}

function maskApiKey(key: string): string {
  const trimmed = key.trim();
  if (trimmed.length <= 12) {
    return '••••' + trimmed.slice(-4);
  }
  return `${trimmed.slice(0, 9)}••••${trimmed.slice(-4)}`;
}

async function detectBackend(): Promise<boolean> {
  if (backendAvailable !== null) return backendAvailable;
  try {
    const res = await fetch('./api/openrouter/status', { method: 'GET' });
    const ct = res.headers.get('content-type') || '';
    if (res.ok && ct.includes('application/json')) {
      backendAvailable = true;
      return true;
    }
  } catch {
    // Fall through to static direct mode
  }
  backendAvailable = false;
  return false;
}

function getStaticStatus(): OpenRouterStatus {
  return {
    configured: Boolean(memoryApiKey),
    source: memoryApiKey ? 'memory' : 'none',
    keyPreview: memoryApiKey ? maskApiKey(memoryApiKey) : null,
    model: memoryModel,
    dualReviewEnabled: memoryDualReviewEnabled,
    secondaryModel: memorySecondaryModel,
    enforceZdr: memoryEnforceZdr,
    backendAvailable: false,
    paidModelsUnlocked: memoryPaidUnlocked,
    paidModelsPasswordConfigured: Boolean(BUILD_PAID_PASSWORD_HASH || memoryPaidPasswordHash),
    keyInfo: memoryApiKey ? memoryKeyInfo : null,
  };
}

function getReferer(): string {
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return 'https://uxz-write.pages.dev';
}

export async function fetchOpenRouterStatus(): Promise<OpenRouterStatus> {
  const hasBackend = await detectBackend();
  if (hasBackend) {
    const res = await fetch('./api/openrouter/status');
    const data = (await res.json()) as OpenRouterStatus;
    return { ...data, backendAvailable: true };
  }

  // In static client mode: if we restored an API key from storage but haven't fetched keyInfo yet, query OpenRouter
  if (memoryApiKey && !memoryKeyInfo) {
    try {
      const verifyRes = await fetch('https://openrouter.ai/api/v1/auth/key', {
        headers: { Authorization: `Bearer ${memoryApiKey}` },
      });
      if (verifyRes.ok) {
        const verifyJson = (await verifyRes.json().catch(() => null)) as {
          data?: {
            label?: string | null;
            limit?: number | null;
            usage?: number | null;
            is_free_tier?: boolean | null;
          };
        } | null;
        if (verifyJson?.data) {
          memoryKeyInfo = {
            label: verifyJson.data.label ?? null,
            limit: verifyJson.data.limit ?? null,
            usage: verifyJson.data.usage ?? null,
            isFreeTier: verifyJson.data.is_free_tier ?? null,
          };
        }
      }
    } catch {
      // ignore network issues during initial status check
    }
  }

  return getStaticStatus();
}

export async function unlockPaidModels(
  password: string
): Promise<{ ok: true; status: OpenRouterStatus } | { ok: false; error: string }> {
  const hasBackend = await detectBackend();
  if (hasBackend) {
    try {
      const res = await fetch('./api/openrouter/unlock-paid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = (await res.json()) as OpenRouterStatus & { error?: string };
      if (!res.ok) {
        return {
          ok: false,
          error: data.error || (isEnglishUi() ? 'Unlock failed.' : 'Entsperrung fehlgeschlagen.'),
        };
      }
      return { ok: true, status: { ...data, backendAvailable: true } };
    } catch {
      return {
        ok: false,
        error: isEnglishUi()
          ? 'Network error while verifying password.'
          : 'Netzwerkfehler bei der Passwortprüfung.',
      };
    }
  }

  if (!password) {
    return { ok: false, error: isEnglishUi() ? 'Please enter a password.' : 'Bitte gib ein Passwort ein.' };
  }

  const candidateHash = await sha256Hex(password);
  const activeHash = BUILD_PAID_PASSWORD_HASH || memoryPaidPasswordHash;

  if (activeHash) {
    if (!constantTimeEqual(candidateHash, activeHash)) {
      return { ok: false, error: isEnglishUi() ? 'Incorrect password.' : 'Falsches Passwort.' };
    }
    memoryPaidUnlocked = true;
    return { ok: true, status: getStaticStatus() };
  }

  if (password.length < 6) {
    return {
      ok: false,
      error: isEnglishUi()
        ? 'Password must be at least 6 characters long.'
        : 'Das Passwort muss mindestens 6 Zeichen lang sein.',
    };
  }

  memoryPaidPasswordHash = candidateHash;
  memoryPaidUnlocked = true;
  return { ok: true, status: getStaticStatus() };
}

export async function lockPaidModels(): Promise<
  { ok: true; status: OpenRouterStatus } | { ok: false; error: string }
> {
  const hasBackend = await detectBackend();
  if (hasBackend) {
    try {
      const res = await fetch('./api/openrouter/lock-paid', { method: 'POST' });
      const data = (await res.json()) as OpenRouterStatus & { error?: string };
      if (!res.ok) {
        return { ok: false, error: data.error || 'Sperren fehlgeschlagen.' };
      }
      return { ok: true, status: { ...data, backendAvailable: true } };
    } catch {
      return { ok: false, error: 'Netzwerkfehler beim Sperren.' };
    }
  }

  memoryPaidUnlocked = false;
  if (!(await isStaticModelFree(memoryModel))) {
    memoryModel = DEFAULT_MODEL;
  }
  if (!(await isStaticModelFree(memorySecondaryModel))) {
    memorySecondaryModel = DEFAULT_MODEL;
  }
  return { ok: true, status: getStaticStatus() };
}

export async function saveOpenRouterConfig(params: {
  apiKey?: string;
  model?: string;
  dualReviewEnabled?: boolean;
  secondaryModel?: string;
  enforceZdr?: boolean;
}): Promise<{ ok: true; status: OpenRouterStatus } | { ok: false; error: string; code?: string }> {
  if (typeof params.apiKey === 'string' && params.apiKey.trim().length > 0) {
    setStoredString(STORAGE_KEY_API_KEY, params.apiKey.trim());
  }

  const hasBackend = await detectBackend();
  if (hasBackend) {
    try {
      const res = await fetch('./api/openrouter/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const data = (await res.json()) as OpenRouterStatus & { error?: string; code?: string };
      if (!res.ok) {
        return {
          ok: false,
          error: data.error || 'Konfiguration konnte nicht gespeichert werden.',
          code: data.code,
        };
      }
      return { ok: true, status: { ...(data as OpenRouterStatus), backendAvailable: true } };
    } catch {
      return { ok: false, error: 'Netzwerkfehler beim Speichern der OpenRouter-Konfiguration.' };
    }
  }

  if (typeof params.model === 'string' && params.model.trim().length > 0 && !memoryPaidUnlocked) {
    const free = await isStaticModelFree(params.model.trim());
    if (!free) {
      return {
        ok: false,
        error: isEnglishUi()
          ? 'Paid models are locked. Please enter the password first.'
          : 'Kostenpflichtige Modelle sind gesperrt. Bitte gib zuerst das Passwort ein.',
        code: 'PAID_MODEL_LOCKED',
      };
    }
  }

  if (
    typeof params.secondaryModel === 'string' &&
    params.secondaryModel.trim().length > 0 &&
    !memoryPaidUnlocked
  ) {
    const free = await isStaticModelFree(params.secondaryModel.trim());
    if (!free) {
      return {
        ok: false,
        error: isEnglishUi()
          ? 'Paid models are locked. Please enter the password first.'
          : 'Kostenpflichtige Modelle sind gesperrt. Bitte gib zuerst das Passwort ein.',
        code: 'PAID_MODEL_LOCKED',
      };
    }
  }

  // Static Cloudflare/GitHub Pages BYOK mode: verify directly against OpenRouter API
  if (typeof params.apiKey === 'string' && params.apiKey.trim().length > 0) {
    const candidate = params.apiKey.trim();
    try {
      const verifyRes = await fetch('https://openrouter.ai/api/v1/auth/key', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${candidate}`,
        },
      });
      if (!verifyRes.ok) {
        const errText = await verifyRes.text().catch(() => '');
        return {
          ok: false,
          error:
            verifyRes.status === 401 || verifyRes.status === 403
              ? isEnglishUi()
                ? 'The OpenRouter API key was rejected. Please check your key.'
                : 'Der OpenRouter API-Schlüssel wurde abgelehnt. Bitte prüfe den Schlüssel.'
              : isEnglishUi()
                ? `OpenRouter check failed (HTTP ${verifyRes.status}). ${errText}`.trim()
                : `OpenRouter-Prüfung fehlgeschlagen (HTTP ${verifyRes.status}). ${errText}`.trim(),
        };
      }
      const verifyJson = (await verifyRes.json().catch(() => null)) as {
        data?: {
          label?: string | null;
          limit?: number | null;
          usage?: number | null;
          is_free_tier?: boolean | null;
        };
      } | null;

      memoryApiKey = candidate;
      setStoredString(STORAGE_KEY_API_KEY, candidate);
      memoryKeyInfo = verifyJson?.data
        ? {
            label: verifyJson.data.label ?? null,
            limit: verifyJson.data.limit ?? null,
            usage: verifyJson.data.usage ?? null,
            isFreeTier: verifyJson.data.is_free_tier ?? null,
          }
        : null;
    } catch (err) {
      return {
        ok: false,
        error: isEnglishUi()
          ? `Failed to connect to OpenRouter: ${err instanceof Error ? err.message : 'Unknown error'}`
          : `Verbindung zu OpenRouter fehlgeschlagen: ${err instanceof Error ? err.message : 'Unbekannter Fehler'}`,
      };
    }
  }

  if (typeof params.model === 'string' && params.model.trim().length > 0) {
    memoryModel = params.model.trim();
    setStoredString(STORAGE_KEY_MODEL, memoryModel);
  }
  if (typeof params.dualReviewEnabled === 'boolean') {
    memoryDualReviewEnabled = params.dualReviewEnabled;
    setStoredString(STORAGE_KEY_DUAL, String(memoryDualReviewEnabled));
  }
  if (typeof params.secondaryModel === 'string' && params.secondaryModel.trim().length > 0) {
    memorySecondaryModel = params.secondaryModel.trim();
    setStoredString(STORAGE_KEY_SECONDARY_MODEL, memorySecondaryModel);
  }
  if (typeof params.enforceZdr === 'boolean') {
    memoryEnforceZdr = params.enforceZdr;
    setStoredString(STORAGE_KEY_ZDR, String(memoryEnforceZdr));
  }

  return { ok: true, status: getStaticStatus() };
}

export async function removeOpenRouterKey(): Promise<
  { ok: true; status: OpenRouterStatus } | { ok: false; error: string }
> {
  removeStoredString(STORAGE_KEY_API_KEY);

  const hasBackend = await detectBackend();
  if (hasBackend) {
    try {
      const res = await fetch('./api/openrouter/config', { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        return { ok: false, error: data.error || 'Schlüssel konnte nicht entfernt werden.' };
      }
      return { ok: true, status: { ...(data as OpenRouterStatus), backendAvailable: true } };
    } catch {
      return { ok: false, error: 'Netzwerkfehler beim Entfernen des Schlüssels.' };
    }
  }

  memoryApiKey = '';
  memoryKeyInfo = null;
  return { ok: true, status: getStaticStatus() };
}

export async function fetchOpenRouterModels(): Promise<OpenRouterModel[]> {
  const hasBackend = await detectBackend();
  if (hasBackend) {
    const res = await fetch('./api/openrouter/models');
    if (!res.ok) return [];
    const data = (await res.json()) as { models?: OpenRouterModel[] };
    return data.models ?? [];
  }

  const now = Date.now();
  if (cachedStaticModels && now - cachedStaticModels.fetchedAt < 10 * 60 * 1000) {
    return cachedStaticModels.models;
  }

  const upstream = await fetch('https://openrouter.ai/api/v1/models');
  if (!upstream.ok) return [];
  const json = (await upstream.json()) as {
    data?: Array<{
      id: string;
      name?: string;
      context_length?: number;
      pricing?: { prompt?: string; completion?: string };
      architecture?: { modality?: string };
    }>;
  };

  const models: OpenRouterModel[] = (json.data ?? [])
    .filter((m) => m.id && (!m.architecture?.modality || m.architecture.modality.includes('text')))
    .map((m) => {
      const promptPerToken = Number(m.pricing?.prompt ?? 0);
      const completionPerToken = Number(m.pricing?.completion ?? 0);
      return {
        id: m.id,
        name: m.name || m.id,
        contextLength: m.context_length ?? 0,
        promptPricePer1M:
          promptPerToken < 0
            ? -1
            : Number.isFinite(promptPerToken)
              ? Number((promptPerToken * 1_000_000).toFixed(3))
              : 0,
        completionPricePer1M:
          completionPerToken < 0
            ? -1
            : Number.isFinite(completionPerToken)
              ? Number((completionPerToken * 1_000_000).toFixed(3))
              : 0,
      };
    })
    .sort((a, b) => {
      const idxA = FEATURED_ORDER.indexOf(a.id);
      const idxB = FEATURED_ORDER.indexOf(b.id);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.name.localeCompare(b.name);
    });

  cachedStaticModels = { fetchedAt: now, models };
  return models;
}

let lastRequestStartMs = 0;
let rateLimitCooldownUntilMs = 0;

function isRateLimitErrorPayload(status: number, text: string): boolean {
  if (status === 429) return true;
  return /rate[\s_-]*limit|requests?\s+per\s+min|too many requests|quota exceeded|rpm/i.test(text);
}

function parseRetryAfterMs(headers: Headers, bodyText: string, attempt: number): number {
  const retryAfter = headers.get('retry-after');
  if (retryAfter) {
    const sec = Number(retryAfter);
    if (Number.isFinite(sec) && sec > 0) {
      return Math.min(20000, Math.max(1000, Math.round(sec * 1000)));
    }
    const dateMs = Date.parse(retryAfter);
    if (Number.isFinite(dateMs)) {
      const diff = dateMs - Date.now();
      if (diff > 0) return Math.min(20000, Math.max(1000, diff));
    }
  }
  const match = bodyText.match(/try again in\s+(\d+(?:\.\d+)?)\s*(s|sec|seconds|ms)?/i);
  if (match) {
    const val = Number(match[1]);
    if (Number.isFinite(val) && val > 0) {
      const ms = match[2]?.toLowerCase() === 'ms' ? val : val * 1000;
      return Math.min(20000, Math.max(1000, Math.round(ms)));
    }
  }
  const base = attempt === 0 ? 2800 : 5500;
  const jitter = Math.floor(Math.random() * 600);
  return base + jitter;
}

function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function paceOpenRouterCall(signal?: AbortSignal, minSpacingOverrideMs?: number): Promise<void> {
  const configuredSpacing = memoryPreferences.settings?.minRequestSpacingMs ?? 450;
  const minSpacingMs = minSpacingOverrideMs ?? configuredSpacing;
  const now = Date.now();
  const waitSpacing = Math.max(0, lastRequestStartMs + minSpacingMs - now);
  if (waitSpacing > 0) {
    await abortableSleep(waitSpacing, signal);
  }
  lastRequestStartMs = Date.now();
}

function formatFriendlyRateLimitMessage(rawMessage: string): string {
  if (isEnglishUi()) {
    return `Rate limit (requests per minute) reached: ${rawMessage} — Tip: Use the "Free Models Router" (rotates automatically across free providers) or pause Instant mode.`;
  }
  return `Anfrage-Limit (Requests pro Minute) erreicht: ${rawMessage} — Tipp: Nutze den „Free Models Router“ (wechselt automatisch zwischen freien Anbietern) oder pausiere den Sofort-Modus.`;
}

export async function streamRewriteRequest(params: {
  text: string;
  task?: RewriteTask;
  sourceLang: SourceLanguageId;
  targetLang?: TargetLanguageId;
  tone?: TranslationTone;
  mode: RewriteMode;
  style: WritingStyleId;
  model: string;
  verify?: boolean;
  originalText?: string;
  previousContext?: string;
  preferences?: WritingPreferences;
  signal: AbortSignal;
  onDelta: (accumulated: string) => void;
  onRetryNotice?: (info: { attempt: number; waitSeconds: number } | null) => void;
}): Promise<{ ok: true; text: string } | { ok: false; error: string; isRateLimit?: boolean }> {
  const hasBackend = await detectBackend();
  const activeSettings = params.preferences?.settings ?? memoryPreferences.settings;
  const MAX_RETRIES = Math.min(4, Math.max(0, activeSettings?.rateLimitRetries ?? 2));

  if (hasBackend) {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      await paceOpenRouterCall(params.signal);
      const res = await fetch('./api/rewrite', {
        method: 'POST',
        signal: params.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: params.text,
          task: params.task ?? 'rewrite',
          sourceLang: params.sourceLang,
          targetLang: params.targetLang,
          tone: params.tone,
          mode: params.mode,
          style: params.style,
          model: params.model,
          verify: Boolean(params.verify),
          originalText: params.originalText,
          previousContext: params.previousContext,
          preferences: params.preferences,
        }),
      });

      if (!res.ok) {
        const errJson = (await res.json().catch(() => null)) as { error?: string } | null;
        const rawErr = errJson?.error || `Anfrage fehlgeschlagen (HTTP ${res.status}).`;
        const isRl = isRateLimitErrorPayload(res.status, rawErr);
        if (isRl) {
          rateLimitCooldownUntilMs = Date.now() + 25000;
          if (attempt < MAX_RETRIES) {
            const waitMs = parseRetryAfterMs(res.headers, rawErr, attempt);
            params.onRetryNotice?.({ attempt: attempt + 1, waitSeconds: Math.ceil(waitMs / 1000) });
            await abortableSleep(waitMs, params.signal);
            params.onRetryNotice?.(null);
            continue;
          }
          return { ok: false, error: formatFriendlyRateLimitMessage(rawErr), isRateLimit: true };
        }
        return { ok: false, error: rawErr };
      }
      if (!res.body) {
        return { ok: false, error: 'Keine Antwort vom Server erhalten.' };
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let accumulated = '';
      let streamRateLimitError: string | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split('\n\n');
        buffer = frames.pop() ?? '';

        for (const frame of frames) {
          const line = frame.trim();
          if (!line.startsWith('data:')) continue;
          const raw = line.slice(5).trim();
          if (!raw) continue;
          try {
            const parsed = JSON.parse(raw) as { delta?: string; error?: string };
            if (parsed.error) {
              if (!accumulated && isRateLimitErrorPayload(0, parsed.error)) {
                streamRateLimitError = parsed.error;
                break;
              }
              return {
                ok: false,
                error: isRateLimitErrorPayload(0, parsed.error)
                  ? formatFriendlyRateLimitMessage(parsed.error)
                  : parsed.error,
                isRateLimit: isRateLimitErrorPayload(0, parsed.error),
              };
            }
            if (typeof parsed.delta === 'string') {
              accumulated += parsed.delta;
              params.onDelta(accumulated);
            }
          } catch {
            // Ignore malformed SSE frames
          }
        }
        if (streamRateLimitError) break;
      }

      if (streamRateLimitError) {
        rateLimitCooldownUntilMs = Date.now() + 25000;
        if (attempt < MAX_RETRIES) {
          const waitMs = parseRetryAfterMs(res.headers, streamRateLimitError, attempt);
          params.onRetryNotice?.({ attempt: attempt + 1, waitSeconds: Math.ceil(waitMs / 1000) });
          await abortableSleep(waitMs, params.signal);
          params.onRetryNotice?.(null);
          continue;
        }
        return {
          ok: false,
          error: formatFriendlyRateLimitMessage(streamRateLimitError),
          isRateLimit: true,
        };
      }

      return { ok: true, text: accumulated };
    }
  }

  // Static Cloudflare / GitHub Pages direct OpenRouter streaming
  if (!memoryApiKey) {
    return {
      ok: false,
      error: isEnglishUi()
        ? 'No OpenRouter API key configured.'
        : 'Kein OpenRouter API-Schlüssel hinterlegt.',
    };
  }

  const targetModel = params.model || memoryModel;
  if (!memoryPaidUnlocked && !(await isStaticModelFree(targetModel))) {
    return {
      ok: false,
      error: isEnglishUi()
        ? 'Paid models are locked. Please enter the password.'
        : 'Kostenpflichtige Modelle sind gesperrt. Bitte Passwort eingeben.',
    };
  }

  const activePreferences = params.preferences ?? memoryPreferences;
  const task = params.task ?? 'rewrite';
  const promptConfig =
    task === 'translate'
      ? params.verify
        ? buildTranslationVerificationPrompts(
            params.targetLang || 'en-US',
            params.tone || 'neutral',
            activePreferences
          )
        : buildTranslationPrompts(
            params.sourceLang,
            params.targetLang || 'en-US',
            params.tone || 'neutral',
            params.previousContext,
            activePreferences
          )
      : params.verify
        ? buildVerificationPrompts(params.sourceLang, params.mode, params.style, activePreferences)
        : buildRewritePrompts(
            params.sourceLang,
            params.mode,
            params.style,
            params.previousContext,
            activePreferences
          );

  const userContent = params.verify
    ? `Originaltext:\n"""\n${(params.originalText || params.text).slice(0, 40000)}\n"""\n\n${
        task === 'translate' ? 'Zu prüfender Übersetzungsentwurf' : 'Zu prüfender Entwurf'
      }:\n"""\n${params.text}\n"""`
    : params.text;

  const baseBody = {
    model: targetModel,
    stream: true,
    temperature: promptConfig.temperature,
    provider: memoryEnforceZdr
      ? { sort: 'latency', zdr: true, data_collection: 'deny' }
      : { sort: 'latency' },
    messages: [
      { role: 'system', content: promptConfig.system },
      { role: 'user', content: userContent },
    ],
  };

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await paceOpenRouterCall(params.signal);

    let upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: params.signal,
      headers: {
        Authorization: `Bearer ${memoryApiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': getReferer(),
        'X-Title': 'ÜxzWrite & Translate',
      },
      body: JSON.stringify({ ...baseBody, reasoning: { effort: 'none' } }),
    });

    if (upstream.status === 400) {
      const preview = await upstream.text().catch(() => '');
      if (/reasoning|effort/i.test(preview)) {
        upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          signal: params.signal,
          headers: {
            Authorization: `Bearer ${memoryApiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': getReferer(),
            'X-Title': 'ÜxzWrite & Translate',
          },
          body: JSON.stringify(baseBody),
        });
      } else {
        let message = 'OpenRouter-Fehler (HTTP 400)';
        try {
          const parsed = JSON.parse(preview) as { error?: { message?: string } };
          if (parsed?.error?.message) message = parsed.error.message;
        } catch {
          if (preview) message = `${message}: ${preview.slice(0, 240)}`;
        }
        return { ok: false, error: message };
      }
    }

    if (!upstream.ok || !upstream.body) {
      const errBody = await upstream.text().catch(() => '');
      let message = `OpenRouter-Fehler (HTTP ${upstream.status})`;
      try {
        const parsed = JSON.parse(errBody) as { error?: { message?: string } };
        if (parsed?.error?.message) message = parsed.error.message;
      } catch {
        if (errBody) message = `${message}: ${errBody.slice(0, 240)}`;
      }
      const isRl = isRateLimitErrorPayload(upstream.status, message) || upstream.status === 503;
      if (isRl) {
        rateLimitCooldownUntilMs = Date.now() + 25000;
        if (attempt < MAX_RETRIES) {
          const waitMs = parseRetryAfterMs(upstream.headers, message, attempt);
          params.onRetryNotice?.({ attempt: attempt + 1, waitSeconds: Math.ceil(waitMs / 1000) });
          await abortableSleep(waitMs, params.signal);
          params.onRetryNotice?.(null);
          continue;
        }
        return {
          ok: false,
          error: formatFriendlyRateLimitMessage(message),
          isRateLimit: true,
        };
      }
      return { ok: false, error: message };
    }

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let accumulated = '';
    let streamRateLimitError: string | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || !line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') continue;
        try {
          const parsed = JSON.parse(payload) as {
            choices?: Array<{ delta?: { content?: string } }>;
            error?: { message?: string };
          };
          if (parsed.error?.message) {
            const isRl = isRateLimitErrorPayload(0, parsed.error.message);
            if (!accumulated && isRl) {
              streamRateLimitError = parsed.error.message;
              break;
            }
            return {
              ok: false,
              error: isRl ? formatFriendlyRateLimitMessage(parsed.error.message) : parsed.error.message,
              isRateLimit: isRl,
            };
          }
          const delta = parsed.choices?.[0]?.delta?.content;
          if (typeof delta === 'string' && delta.length > 0) {
            accumulated += delta;
            params.onDelta(accumulated);
          }
        } catch {
          // Ignore partial keepalive frames
        }
      }
      if (streamRateLimitError) break;
    }

    if (streamRateLimitError) {
      rateLimitCooldownUntilMs = Date.now() + 25000;
      if (attempt < MAX_RETRIES) {
        const waitMs = parseRetryAfterMs(upstream.headers, streamRateLimitError, attempt);
        params.onRetryNotice?.({ attempt: attempt + 1, waitSeconds: Math.ceil(waitMs / 1000) });
        await abortableSleep(waitMs, params.signal);
        params.onRetryNotice?.(null);
        continue;
      }
      return {
        ok: false,
        error: formatFriendlyRateLimitMessage(streamRateLimitError),
        isRateLimit: true,
      };
    }

    return { ok: true, text: accumulated };
  }

  return { ok: false, error: 'Anfrage-Limit überschritten. Bitte kurz warten.', isRateLimit: true };
}

export async function fetchSentenceAlternatives(params: {
  fullText: string;
  sentence: string;
  task?: RewriteTask;
  sourceLang: SourceLanguageId;
  targetLang?: TargetLanguageId;
  tone?: TranslationTone;
  mode: RewriteMode;
  style: WritingStyleId;
  model: string;
  preferences?: WritingPreferences;
}): Promise<{ ok: true; alternatives: string[] } | { ok: false; error: string; isRateLimit?: boolean }> {
  const hasBackend = await detectBackend();
  const MAX_RETRIES = 1;

  if (hasBackend) {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      await paceOpenRouterCall(undefined);
      const res = await fetch('./api/alternatives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const data = (await res.json().catch(() => ({}))) as { alternatives?: string[]; error?: string };
      if (!res.ok) {
        const rawErr = data.error || `Alternativen konnten nicht geladen werden (HTTP ${res.status}).`;
        const isRl = isRateLimitErrorPayload(res.status, rawErr) || res.status === 503;
        if (isRl) {
          rateLimitCooldownUntilMs = Date.now() + 25000;
          if (attempt < MAX_RETRIES) {
            const waitMs = parseRetryAfterMs(res.headers, rawErr, attempt);
            await abortableSleep(waitMs);
            continue;
          }
          return {
            ok: false,
            error: formatFriendlyRateLimitMessage(rawErr),
            isRateLimit: true,
          };
        }
        return { ok: false, error: rawErr };
      }
      return { ok: true, alternatives: data.alternatives ?? [] };
    }
    return { ok: false, error: formatFriendlyRateLimitMessage('HTTP 429'), isRateLimit: true };
  }

  if (!memoryApiKey) {
    return {
      ok: false,
      error: isEnglishUi()
        ? 'No OpenRouter API key configured.'
        : 'Kein OpenRouter API-Schlüssel hinterlegt.',
    };
  }

  const targetModel = params.model || memoryModel;
  if (!memoryPaidUnlocked && !(await isStaticModelFree(targetModel))) {
    return {
      ok: false,
      error: isEnglishUi()
        ? 'Paid models are locked. Please enter the password.'
        : 'Kostenpflichtige Modelle sind gesperrt. Bitte Passwort eingeben.',
    };
  }

  const task = params.task ?? 'rewrite';
  const langRule =
    task === 'translate'
      ? `Zielsprache: ${TARGET_LANGUAGE_NAMES[params.targetLang || 'en-US'] || params.targetLang}`
      : LANGUAGE_INSTRUCTIONS[params.sourceLang] || LANGUAGE_INSTRUCTIONS.auto;
  const customBlock = buildGlossaryAndRulesPromptBlock(params.preferences ?? memoryPreferences);
  const styleHint =
    task === 'translate'
      ? TRANSLATION_TONE_INSTRUCTIONS[params.tone || 'neutral'] || TRANSLATION_TONE_INSTRUCTIONS.neutral
      : params.mode === 'correction'
        ? 'Variiere nur minimal und bleibe eng am ursprünglichen Tonfall.'
        : STYLE_INSTRUCTIONS[params.style] || STYLE_INSTRUCTIONS.ausgewogen;

  const payload = {
    model: params.model || memoryModel,
    temperature: 0.7,
    provider: memoryEnforceZdr
      ? { sort: 'latency', zdr: true, data_collection: 'deny' }
      : { sort: 'latency' },
    messages: [
      {
        role: 'system',
        content: [
          task === 'translate'
            ? 'Du lieferst genau 3 alternative Übersetzungsvarianten für einen markierten Satz im Zieltext.'
            : 'Du lieferst genau 3 alternative Formulierungen für einen markierten Satz im Textkontext.',
          langRule,
          `Stilvorgabe: ${styleHint}`,
          ...(customBlock ? [customBlock] : []),
          'Antworte ausschließlich als gültiges JSON-Objekt im Format: {"alternatives": ["...", "...", "..."]}. Keine Markdown-Codeblöcke, kein Begleittext.',
        ].join('\n'),
      },
      {
        role: 'user',
        content: `Gesamtkontext:\n${params.fullText}\n\nZu variierender Satz:\n${params.sentence}`,
      },
    ],
  };

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await paceOpenRouterCall(undefined);

    let upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${memoryApiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': getReferer(),
        'X-Title': 'ÜxzWrite & Translate',
      },
      body: JSON.stringify({ ...payload, reasoning: { effort: 'none' } }),
    });

    if (upstream.status === 400) {
      const preview = await upstream.text().catch(() => '');
      if (/reasoning|effort/i.test(preview)) {
        upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${memoryApiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': getReferer(),
            'X-Title': 'ÜxzWrite & Translate',
          },
          body: JSON.stringify(payload),
        });
      } else {
        return { ok: false, error: `Alternativen fehlgeschlagen (HTTP 400).` };
      }
    }

    if (!upstream.ok) {
      const errBody = await upstream.text().catch(() => '');
      let message = `OpenRouter-Fehler (HTTP ${upstream.status})`;
      try {
        const parsed = JSON.parse(errBody) as { error?: { message?: string } };
        if (parsed?.error?.message) message = parsed.error.message;
      } catch {
        if (errBody) message = `${message}: ${errBody.slice(0, 200)}`;
      }
      const isRl = isRateLimitErrorPayload(upstream.status, message) || upstream.status === 503;
      if (isRl) {
        rateLimitCooldownUntilMs = Date.now() + 25000;
        if (attempt < MAX_RETRIES) {
          const waitMs = parseRetryAfterMs(upstream.headers, message, attempt);
          await abortableSleep(waitMs);
          continue;
        }
        return {
          ok: false,
          error: formatFriendlyRateLimitMessage(message),
          isRateLimit: true,
        };
      }
      return { ok: false, error: `Alternativen fehlgeschlagen (HTTP ${upstream.status}).` };
    }

    const json = (await upstream.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = json.choices?.[0]?.message?.content?.trim() || '';
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();

    let alternatives: string[] = [];
    try {
      const parsed = JSON.parse(cleaned) as { alternatives?: unknown };
      if (Array.isArray(parsed.alternatives)) {
        alternatives = parsed.alternatives
          .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
          .slice(0, 3);
      }
    } catch {
      alternatives = cleaned
        .split('\n')
        .map((l) => l.replace(/^\d+[.)]\s*/, '').replace(/^["']|["']$/g, '').trim())
        .filter(Boolean)
        .slice(0, 3);
    }

    return { ok: true, alternatives };
  }

  return { ok: false, error: formatFriendlyRateLimitMessage('HTTP 429'), isRateLimit: true };
}

export async function analyzeChangesRequest(params: {
  sourceText: string;
  refinedText: string;
  hunks: Array<{ id: string; before: string; after: string }>;
  model: string;
  signal: AbortSignal;
}): Promise<Array<{ id: string; category: ChangeCategory; reason?: string }>> {
  if (params.hunks.length === 0) return [];
  const skipOnRateLimit = memoryPreferences.settings?.skipAnalyzeOnRateLimit ?? true;
  if (skipOnRateLimit && Date.now() < rateLimitCooldownUntilMs) return [];

  const hasBackend = await detectBackend();
  const analyzeSpacing = Math.max(500, memoryPreferences.settings?.minRequestSpacingMs ?? 450);

  if (hasBackend) {
    await paceOpenRouterCall(params.signal, analyzeSpacing);
    const res = await fetch('./api/analyze-changes', {
      method: 'POST',
      signal: params.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceText: params.sourceText,
        refinedText: params.refinedText,
        hunks: params.hunks,
      }),
    });
    if (res.status === 429 || res.status === 503) {
      rateLimitCooldownUntilMs = Date.now() + 25000;
      return [];
    }
    if (!res.ok) return [];
    const data = (await res.json()) as {
      classifications?: Array<{ id: string; category: ChangeCategory; reason?: string }>;
    };
    return data.classifications ?? [];
  }

  if (!memoryApiKey) return [];
  const targetModel = params.model || memoryModel;
  if (!memoryPaidUnlocked && !(await isStaticModelFree(targetModel))) return [];

  await paceOpenRouterCall(params.signal, analyzeSpacing);

  const compactHunks = params.hunks.slice(0, 60).map((h) => ({
    id: h.id,
    before: h.before.trim(),
    after: h.after.trim(),
  }));

  const payload = {
    model: params.model || memoryModel,
    temperature: 0,
    provider: memoryEnforceZdr
      ? { sort: 'latency', zdr: true, data_collection: 'deny' }
      : { sort: 'latency' },
    messages: [
      {
        role: 'system',
        content: [
          'Klassifiziere linguistische Textänderungen präzise in genau eine der folgenden Kategorien:',
          '- "rechtschreibung": Tippfehler, Buchstabendreher, Getrennt-/Zusammenschreibung, Groß-/Kleinschreibung, orthografische Fehler.',
          '- "grammatik": Kasus, Tempus, Genus, Numerus, Verbkonjugation, Kongruenz, Satzstellung/Syntaxfehler, fehlende/falsche Artikel oder Präpositionen.',
          '- "zeichensetzung": Kommas, Punkte, Anführungszeichen, Bindestriche, Satzzeichen.',
          '- "stil": Stilistische Umformulierung, Wortwahl, Tonalität, Registerwechsel, eleganterer oder umgangssprachlicher Ausdruck.',
          '- "klarheit": Verdichtung, Streichung von Füllwörtern/Redundanz, verbesserte Verständlichkeit.',
          isEnglishUi()
            ? 'For each entry, provide a concise English reason (max. 5 words).'
            : 'Gib zu jedem Eintrag außerdem eine knappe deutsche Begründung (max. 5 Wörter).',
          'Antworte ausschließlich als gültiges JSON-Objekt ohne Markdown-Codeblock:',
          '{"classifications":[{"id":"...","category":"rechtschreibung|grammatik|zeichensetzung|stil|klarheit","reason":"..."}]}',
        ].join('\n'),
      },
      {
        role: 'user',
        content: JSON.stringify({
          sourcePreview: params.sourceText.slice(0, 1500),
          refinedPreview: params.refinedText.slice(0, 1500),
          changes: compactHunks,
        }),
      },
    ],
  };

  let upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    signal: params.signal,
    headers: {
      Authorization: `Bearer ${memoryApiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': getReferer(),
      'X-Title': 'ÜxzWrite & Translate',
    },
    body: JSON.stringify({ ...payload, reasoning: { effort: 'none' } }),
  });

  if (upstream.status === 400) {
    const preview = await upstream.text().catch(() => '');
    if (/reasoning|effort/i.test(preview)) {
      upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        signal: params.signal,
        headers: {
          Authorization: `Bearer ${memoryApiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': getReferer(),
          'X-Title': 'ÜxzWrite & Translate',
        },
        body: JSON.stringify(payload),
      });
    } else {
      return [];
    }
  }

  if (upstream.status === 429 || upstream.status === 503) {
    rateLimitCooldownUntilMs = Date.now() + 25000;
    return [];
  }

  if (!upstream.ok) return [];
  const json = (await upstream.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = json.choices?.[0]?.message?.content?.trim() || '';
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  const allowed = new Set(['rechtschreibung', 'grammatik', 'zeichensetzung', 'stil', 'klarheit']);

  try {
    const parsed = JSON.parse(cleaned) as {
      classifications?: Array<{ id?: unknown; category?: unknown; reason?: unknown }>;
    };
    if (!Array.isArray(parsed.classifications)) return [];
    return parsed.classifications
      .filter(
        (item): item is { id: string; category: ChangeCategory; reason?: string } =>
          typeof item.id === 'string' &&
          typeof item.category === 'string' &&
          allowed.has(item.category.toLowerCase())
      )
      .map((item) => ({
        id: item.id,
        category: item.category.toLowerCase() as ChangeCategory,
        reason: typeof item.reason === 'string' ? item.reason.slice(0, 80) : undefined,
      }));
  } catch {
    return [];
  }
}

export async function fetchHistoryEntries(): Promise<HistoryEntry[]> {
  const hasBackend = await detectBackend();
  if (hasBackend) {
    const res = await fetch('./api/history');
    if (!res.ok) return [];
    const data = (await res.json()) as { entries?: HistoryEntry[] };
    return data.entries ?? [];
  }
  return memoryHistory;
}

export async function saveHistoryEntry(payload: {
  sourceText: string;
  refinedText: string;
  sourceLang: SourceLanguageId;
  targetLang?: TargetLanguageId;
  task?: RewriteTask;
  mode: RewriteMode;
  style: WritingStyleId;
  model: string;
  changes: ChangeItem[];
}): Promise<HistoryEntry[]> {
  const hasBackend = await detectBackend();
  if (hasBackend) {
    const res = await fetch('./api/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { entries?: HistoryEntry[] };
    return data.entries ?? [];
  }

  if (
    memoryHistory.length > 0 &&
    memoryHistory[0].sourceText === payload.sourceText &&
    memoryHistory[0].refinedText === payload.refinedText &&
    memoryHistory[0].style === payload.style &&
    memoryHistory[0].mode === payload.mode &&
    memoryHistory[0].task === payload.task &&
    memoryHistory[0].targetLang === payload.targetLang
  ) {
    return memoryHistory;
  }

  const entry: HistoryEntry = {
    id: crypto.randomUUID(),
    ...payload,
    createdAt: new Date().toISOString(),
  };
  memoryHistory = [entry, ...memoryHistory].slice(0, 50);
  setStoredString(STORAGE_KEY_HISTORY, JSON.stringify(memoryHistory));
  return memoryHistory;
}

export async function deleteHistoryEntry(id: string): Promise<HistoryEntry[]> {
  const hasBackend = await detectBackend();
  if (hasBackend) {
    const res = await fetch(`./api/history/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!res.ok) return [];
    const data = (await res.json()) as { entries?: HistoryEntry[] };
    return data.entries ?? [];
  }
  memoryHistory = memoryHistory.filter((e) => e.id !== id);
  setStoredString(STORAGE_KEY_HISTORY, JSON.stringify(memoryHistory));
  return memoryHistory;
}

export async function clearHistoryEntries(): Promise<HistoryEntry[]> {
  const hasBackend = await detectBackend();
  if (hasBackend) {
    await fetch('./api/history', { method: 'DELETE' });
    return [];
  }
  memoryHistory = [];
  removeStoredString(STORAGE_KEY_HISTORY);
  return [];
}

export async function fetchWritingPreferences(): Promise<WritingPreferences> {
  const hasBackend = await detectBackend();
  if (hasBackend) {
    const res = await fetch('./api/preferences');
    if (res.ok) {
      const loaded = (await res.json()) as WritingPreferences;
      const merged: WritingPreferences = {
        ...loaded,
        settings: { ...DEFAULT_WORKSPACE_SETTINGS, ...(loaded.settings || {}) },
      };
      memoryPreferences = merged;
      return merged;
    }
  }
  return memoryPreferences;
}

export async function saveWritingPreferences(prefs: WritingPreferences): Promise<WritingPreferences> {
  memoryPreferences = prefs;
  setStoredString(STORAGE_KEY_PREFS, JSON.stringify(prefs));
  const hasBackend = await detectBackend();
  if (hasBackend) {
    const res = await fetch('./api/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prefs),
    });
    if (res.ok) {
      const saved = (await res.json()) as WritingPreferences;
      memoryPreferences = saved;
      return saved;
    }
  }
  return memoryPreferences;
}

export async function clearAllLocalData(): Promise<{
  status: OpenRouterStatus;
  preferences: WritingPreferences;
}> {
  [
    STORAGE_KEY_API_KEY,
    STORAGE_KEY_MODEL,
    STORAGE_KEY_SECONDARY_MODEL,
    STORAGE_KEY_DUAL,
    STORAGE_KEY_ZDR,
    STORAGE_KEY_PREFS,
    STORAGE_KEY_HISTORY,
    STORAGE_KEY_DARK_MODE,
    STORAGE_KEY_UI_LANG,
  ].forEach(removeStoredString);

  memoryApiKey = '';
  memoryModel = DEFAULT_MODEL;
  memoryDualReviewEnabled = false;
  memorySecondaryModel = DEFAULT_MODEL;
  memoryEnforceZdr = false;
  memoryKeyInfo = null;
  memoryPaidUnlocked = false;
  memoryPaidPasswordHash = '';
  memoryHistory = [];

  const defaultPrefs: WritingPreferences = {
    terms: [],
    rules: DEFAULT_STARTER_RULES.map((r) => ({ ...r })),
    settings: {
      ...DEFAULT_WORKSPACE_SETTINGS,
      enabledLanguages: [...DEFAULT_WORKSPACE_SETTINGS.enabledLanguages],
    },
  };
  memoryPreferences = defaultPrefs;

  const hasBackend = await detectBackend();
  if (hasBackend) {
    await Promise.allSettled([
      fetch('./api/openrouter/config', { method: 'DELETE' }),
      fetch('./api/openrouter/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: DEFAULT_MODEL,
          dualReviewEnabled: false,
          secondaryModel: DEFAULT_MODEL,
          enforceZdr: false,
        }),
      }),
      fetch('./api/openrouter/lock-paid', { method: 'POST' }),
      fetch('./api/history', { method: 'DELETE' }),
      fetch('./api/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(defaultPrefs),
      }),
    ]);
    const latestStatus = await fetchOpenRouterStatus().catch(() => getStaticStatus());
    return { status: latestStatus, preferences: defaultPrefs };
  }

  return { status: getStaticStatus(), preferences: defaultPrefs };
}
