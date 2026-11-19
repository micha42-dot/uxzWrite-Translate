import {
  API_PROVIDERS,
  getProviderDefinition,
  isModelFreeForProvider,
  isValidProviderId,
  normalizeModelsCatalogResponse,
  resolveProviderBaseUrl,
  sanitizeProviderApiKey,
} from './providers';
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
  ApiProviderId,
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

const BUILD_PAID_PASSWORD_HASH = (import.meta.env.VITE_PAID_MODELS_PASSWORD_HASH || '')
  .trim()
  .toLowerCase();

// Client-side persistence for static hosting (GitHub Pages / Cloudflare Pages)
const STORAGE_KEY_API_KEY = 'openrouter_api_key';
const STORAGE_KEY_PROVIDER = 'uxz_provider';
const STORAGE_KEY_PROVIDER_KEYS = 'uxz_provider_keys';
const STORAGE_KEY_MODELS_BY_PROVIDER = 'uxz_models_by_provider';
const STORAGE_KEY_SECONDARY_BY_PROVIDER = 'uxz_secondary_models_by_provider';
const STORAGE_KEY_BASE_URLS_BY_PROVIDER = 'uxz_base_urls_by_provider';
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

function getStoredJsonMap<T extends Record<string, string>>(key: string): T {
  const raw = getStoredString(key);
  if (!raw) return {} as T;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as T) : ({} as T);
  } catch {
    return {} as T;
  }
}

function loadInitialProviderKeys(): Partial<Record<ApiProviderId, string>> {
  const map = getStoredJsonMap<Partial<Record<ApiProviderId, string>>>(STORAGE_KEY_PROVIDER_KEYS);
  const legacyOpenRouter = sanitizeProviderApiKey(getStoredString(STORAGE_KEY_API_KEY));
  if (legacyOpenRouter && !map.openrouter) {
    map.openrouter = legacyOpenRouter;
  }
  const cleaned: Partial<Record<ApiProviderId, string>> = {};
  for (const [k, v] of Object.entries(map)) {
    if (isValidProviderId(k) && typeof v === 'string') {
      const s = sanitizeProviderApiKey(v);
      if (s) cleaned[k] = s;
    }
  }
  return cleaned;
}

function loadInitialModelsMap(
  mapKey: string,
  legacyKey: string
): Partial<Record<ApiProviderId, string>> {
  const map = getStoredJsonMap<Partial<Record<ApiProviderId, string>>>(mapKey);
  const legacy = getStoredString(legacyKey).trim();
  if (legacy && !map.openrouter) {
    map.openrouter = legacy;
  }
  return map;
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
const initialProviderRaw = getStoredString(STORAGE_KEY_PROVIDER);
let memoryProvider: ApiProviderId = isValidProviderId(initialProviderRaw) ? initialProviderRaw : 'openrouter';
let memoryProviderKeys: Partial<Record<ApiProviderId, string>> = loadInitialProviderKeys();
let memoryModelsByProvider: Partial<Record<ApiProviderId, string>> = loadInitialModelsMap(
  STORAGE_KEY_MODELS_BY_PROVIDER,
  STORAGE_KEY_MODEL
);
let memorySecondaryByProvider: Partial<Record<ApiProviderId, string>> = loadInitialModelsMap(
  STORAGE_KEY_SECONDARY_BY_PROVIDER,
  STORAGE_KEY_SECONDARY_MODEL
);
let memoryBaseUrlsByProvider: Partial<Record<ApiProviderId, string>> = getStoredJsonMap(
  STORAGE_KEY_BASE_URLS_BY_PROVIDER
);
let memoryDualReviewEnabled = getStoredString(STORAGE_KEY_DUAL) === 'true';
let memoryEnforceZdr = getStoredString(STORAGE_KEY_ZDR) === 'true';
let memoryKeyInfo: OpenRouterStatus['keyInfo'] = null;
let memoryPaidUnlocked = false;
let memoryPaidPasswordHash = '';
let memoryHistory: HistoryEntry[] = loadInitialHistory();
let memoryPreferences: WritingPreferences = loadInitialPreferences();
const cachedStaticModelsByProvider = new Map<string, { fetchedAt: number; models: OpenRouterModel[] }>();

function getActiveApiKey(providerId: ApiProviderId = memoryProvider): string {
  return memoryProviderKeys[providerId] || '';
}

function getActiveBaseUrl(providerId: ApiProviderId = memoryProvider): string {
  return resolveProviderBaseUrl(providerId, memoryBaseUrlsByProvider[providerId]);
}

function getActiveModelForProvider(providerId: ApiProviderId = memoryProvider): string {
  const def = getProviderDefinition(providerId);
  return memoryModelsByProvider[providerId] || (providerId === 'openrouter' ? DEFAULT_MODEL : def.defaultModel);
}

function getActiveSecondaryForProvider(providerId: ApiProviderId = memoryProvider): string {
  const def = getProviderDefinition(providerId);
  return (
    memorySecondaryByProvider[providerId] ||
    memoryModelsByProvider[providerId] ||
    (providerId === 'openrouter' ? DEFAULT_MODEL : def.defaultModel)
  );
}

function persistProviderMaps() {
  setStoredString(STORAGE_KEY_PROVIDER, memoryProvider);
  setStoredString(STORAGE_KEY_PROVIDER_KEYS, JSON.stringify(memoryProviderKeys));
  setStoredString(STORAGE_KEY_MODELS_BY_PROVIDER, JSON.stringify(memoryModelsByProvider));
  setStoredString(STORAGE_KEY_SECONDARY_BY_PROVIDER, JSON.stringify(memorySecondaryByProvider));
  setStoredString(STORAGE_KEY_BASE_URLS_BY_PROVIDER, JSON.stringify(memoryBaseUrlsByProvider));
  if (memoryProviderKeys.openrouter) {
    setStoredString(STORAGE_KEY_API_KEY, memoryProviderKeys.openrouter);
  } else {
    removeStoredString(STORAGE_KEY_API_KEY);
  }
  setStoredString(STORAGE_KEY_MODEL, getActiveModelForProvider('openrouter'));
  setStoredString(STORAGE_KEY_SECONDARY_MODEL, getActiveSecondaryForProvider('openrouter'));
}

function getBackendFallbackHeaders(providerOverride?: ApiProviderId): Record<string, string> {
  const p = providerOverride || memoryProvider;
  const key = getActiveApiKey(p);
  const baseUrl = getActiveBaseUrl(p);
  const headers: Record<string, string> = {
    'X-Provider-Id': p,
  };
  if (key) {
    headers['X-Provider-Key'] = key;
    if (p === 'openrouter') {
      headers['X-OpenRouter-Key'] = key;
    }
  }
  if (p === 'custom' || p === 'requesty') {
    headers['X-Custom-Base-Url'] = baseUrl;
  }
  return headers;
}

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

function shouldEnforceStaticPaidLock(modelIsFree: boolean, providerId: ApiProviderId = memoryProvider): boolean {
  if (memoryPaidUnlocked || modelIsFree) return false;
  if (providerId === 'custom') return false;
  if (providerId === 'openrouter') return true;
  return Boolean(BUILD_PAID_PASSWORD_HASH || memoryPaidPasswordHash);
}

async function isStaticModelFree(
  modelId: string,
  providerId: ApiProviderId = memoryProvider
): Promise<boolean> {
  const normalized = modelId.trim();
  if (providerId === 'custom') return true;
  if (providerId === 'openrouter' && (normalized === 'openrouter/free' || normalized.endsWith(':free'))) {
    return true;
  }
  const baseUrl = getActiveBaseUrl(providerId);
  const cacheKey = `${providerId}|${baseUrl}|${getActiveApiKey(providerId) ? 'auth' : 'pub'}`;
  const cached = cachedStaticModelsByProvider.get(cacheKey);
  if (cached) {
    const match = cached.models.find((m) => m.id === normalized);
    if (match) return isModelFreeForProvider(match, providerId);
  }
  const models = await fetchOpenRouterModels(providerId, baseUrl).catch(() => []);
  const match = models.find((m) => m.id === normalized);
  return Boolean(match && isModelFreeForProvider(match, providerId));
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

function getConfiguredProvidersStatic(): ApiProviderId[] {
  const list: ApiProviderId[] = [];
  for (const def of API_PROVIDERS) {
    if (memoryProviderKeys[def.id]) {
      list.push(def.id);
    } else if (def.id === 'custom' && memoryBaseUrlsByProvider.custom) {
      list.push('custom');
    }
  }
  return list;
}

function getStaticStatus(): OpenRouterStatus {
  const activeKey = getActiveApiKey(memoryProvider);
  const def = getProviderDefinition(memoryProvider);
  const activeModel = getActiveModelForProvider(memoryProvider);
  const activeSecondary = getActiveSecondaryForProvider(memoryProvider);
  const customBaseUrl = getActiveBaseUrl(memoryProvider);
  const configured = def.optionalKey ? Boolean(customBaseUrl) : Boolean(activeKey);

  return {
    configured,
    provider: memoryProvider,
    customBaseUrl,
    configuredProviders: getConfiguredProvidersStatic(),
    source: activeKey ? 'memory' : memoryProvider === 'custom' && memoryBaseUrlsByProvider.custom ? 'memory' : 'none',
    keyPreview: activeKey ? maskApiKey(activeKey) : null,
    model: activeModel,
    dualReviewEnabled: memoryDualReviewEnabled,
    secondaryModel: activeSecondary,
    enforceZdr: memoryEnforceZdr,
    backendAvailable: false,
    paidModelsUnlocked: memoryPaidUnlocked,
    paidModelsPasswordConfigured: Boolean(BUILD_PAID_PASSWORD_HASH || memoryPaidPasswordHash),
    keyInfo: memoryProvider === 'openrouter' && activeKey ? memoryKeyInfo : null,
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
    const res = await fetch('./api/openrouter/status', {
      headers: getBackendFallbackHeaders(),
    });
    const data = (await res.json()) as OpenRouterStatus;
    if (data.provider && isValidProviderId(data.provider)) {
      memoryProvider = data.provider;
    }
    return { ...data, backendAvailable: true };
  }

  // In static client mode: verify OpenRouter key metadata silently on initial boot
  const activeKey = getActiveApiKey(memoryProvider);
  if (memoryProvider === 'openrouter' && activeKey && !memoryKeyInfo) {
    try {
      const verifyRes = await fetch('https://openrouter.ai/api/v1/auth/key', {
        headers: { Authorization: `Bearer ${activeKey}` },
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
      } else if (verifyRes.status === 401 || verifyRes.status === 403) {
        delete memoryProviderKeys.openrouter;
        memoryKeyInfo = null;
        persistProviderMaps();
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
        headers: { 'Content-Type': 'application/json', ...getBackendFallbackHeaders() },
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
      const res = await fetch('./api/openrouter/lock-paid', {
        method: 'POST',
        headers: getBackendFallbackHeaders(),
      });
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
  const def = getProviderDefinition(memoryProvider);
  const fallbackModel = memoryProvider === 'openrouter' ? DEFAULT_MODEL : def.defaultModel;
  if (!(await isStaticModelFree(getActiveModelForProvider(memoryProvider), memoryProvider))) {
    memoryModelsByProvider[memoryProvider] = fallbackModel;
  }
  if (!(await isStaticModelFree(getActiveSecondaryForProvider(memoryProvider), memoryProvider))) {
    memorySecondaryByProvider[memoryProvider] = fallbackModel;
  }
  persistProviderMaps();
  return { ok: true, status: getStaticStatus() };
}

async function verifyProviderKeyStatic(params: {
  provider: ApiProviderId;
  apiKey?: string;
  customBaseUrl?: string;
}): Promise<
  | { ok: true; keyInfo: OpenRouterStatus['keyInfo'] }
  | { ok: false; error: string }
> {
  const def = getProviderDefinition(params.provider);
  const baseUrl = resolveProviderBaseUrl(params.provider, params.customBaseUrl);
  const key = params.apiKey ? sanitizeProviderApiKey(params.apiKey) : '';

  if (!key && !def.optionalKey) {
    return {
      ok: false,
      error: isEnglishUi()
        ? `The ${def.name} API key is empty or improperly formatted.`
        : `Der ${def.name} API-Schlüssel ist leer oder ungültig formatiert.`,
    };
  }

  try {
    if (params.provider === 'openrouter') {
      const verifyRes = await fetch('https://openrouter.ai/api/v1/auth/key', {
        method: 'GET',
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!verifyRes.ok) {
        const errText = await verifyRes.text().catch(() => '');
        return {
          ok: false,
          error:
            verifyRes.status === 401 || verifyRes.status === 403
              ? isEnglishUi()
                ? 'The OpenRouter API key was rejected or is improperly formatted. Paste only the key (starting with sk-or-v1-…, without quotes or "Bearer").'
                : 'Der OpenRouter API-Schlüssel wurde abgelehnt oder ist ungültig formatiert (bitte nur den Schlüssel z. B. sk-or-v1-… ohne Anführungszeichen oder „Bearer“ einfügen).'
              : isEnglishUi()
                ? `OpenRouter check failed (HTTP ${verifyRes.status}). ${errText}`.trim()
                : `OpenRouter-Prüfung fehlgeschlagen (HTTP ${verifyRes.status}). ${errText}`.trim(),
        };
      }
      const verifyJson = (await verifyRes.json().catch(() => null)) as {
        data?: { label?: string | null; limit?: number | null; usage?: number | null; is_free_tier?: boolean | null };
      } | null;
      return {
        ok: true,
        keyInfo: verifyJson?.data
          ? {
              label: verifyJson.data.label ?? null,
              limit: verifyJson.data.limit ?? null,
              usage: verifyJson.data.usage ?? null,
              isFreeTier: verifyJson.data.is_free_tier ?? null,
            }
          : null,
      };
    }

    if (params.provider === 'huggingface') {
      const verifyRes = await fetch('https://huggingface.co/api/whoami-v2', {
        method: 'GET',
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!verifyRes.ok) {
        return {
          ok: false,
          error: isEnglishUi()
            ? 'Hugging Face token rejected (401/403). Make sure your hf_… token has Inference Providers permission.'
            : 'Hugging Face Token wurde abgelehnt (401/403). Bitte prüfe deinen hf_… Token mit Inference-Berechtigung.',
        };
      }
      const who = (await verifyRes.json().catch(() => null)) as { name?: string } | null;
      return { ok: true, keyInfo: who?.name ? { label: who.name } : null };
    }

    if (params.provider === 'requesty') {
      const probeRes = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: def.defaultModel,
          messages: [{ role: 'user', content: 'ok' }],
          max_tokens: 1,
        }),
      });
      if (probeRes.status === 401 || probeRes.status === 403) {
        return {
          ok: false,
          error: isEnglishUi()
            ? `Requesty API key was rejected (HTTP ${probeRes.status}).`
            : `Requesty API-Schlüssel wurde abgelehnt (HTTP ${probeRes.status}).`,
        };
      }
      return { ok: true, keyInfo: null };
    }

    const headers: Record<string, string> = {};
    if (params.provider === 'anthropic') {
      headers['x-api-key'] = key;
      headers['anthropic-version'] = '2023-06-01';
      headers['anthropic-dangerous-direct-browser-access'] = 'true';
    } else if (key) {
      headers['Authorization'] = `Bearer ${key}`;
    }

    const verifyRes = await fetch(`${baseUrl}/models`, { method: 'GET', headers });

    if (verifyRes.status === 401 || verifyRes.status === 403) {
      return {
        ok: false,
        error: isEnglishUi()
          ? `${def.name} API key was rejected (HTTP ${verifyRes.status}).`
          : `${def.name} API-Schlüssel wurde abgelehnt (HTTP ${verifyRes.status}).`,
      };
    }

    if (!verifyRes.ok) {
      const errText = await verifyRes.text().catch(() => '');
      if (params.provider === 'gemini' && /api[_\s]*key|permission/i.test(errText)) {
        return {
          ok: false,
          error: isEnglishUi()
            ? 'The Google Gemini API key is invalid.'
            : 'Der Google Gemini API-Schlüssel ist ungültig.',
        };
      }
      if (params.provider === 'custom') {
        if (verifyRes.status === 404) {
          return { ok: true, keyInfo: null };
        }
        return {
          ok: false,
          error: isEnglishUi()
            ? `Custom endpoint at ${baseUrl} returned HTTP ${verifyRes.status}.`
            : `Custom-Endpunkt unter ${baseUrl} antwortete mit HTTP ${verifyRes.status}.`,
        };
      }
      return {
        ok: false,
        error: isEnglishUi()
          ? `${def.name} check failed (HTTP ${verifyRes.status}). ${errText.slice(0, 160)}`.trim()
          : `${def.name}-Prüfung fehlgeschlagen (HTTP ${verifyRes.status}). ${errText.slice(0, 160)}`.trim(),
      };
    }

    return { ok: true, keyInfo: null };
  } catch (err) {
    return {
      ok: false,
      error: isEnglishUi()
        ? `Failed to connect to ${def.name}: ${err instanceof Error ? err.message : 'Unknown error'}`
        : `Verbindung zu ${def.name} fehlgeschlagen: ${err instanceof Error ? err.message : 'Unbekannter Fehler'}`,
    };
  }
}

export async function saveOpenRouterConfig(params: {
  provider?: ApiProviderId;
  customBaseUrl?: string;
  apiKey?: string;
  model?: string;
  dualReviewEnabled?: boolean;
  secondaryModel?: string;
  enforceZdr?: boolean;
}): Promise<{ ok: true; status: OpenRouterStatus } | { ok: false; error: string; code?: string }> {
  const sanitizedKey =
    typeof params.apiKey === 'string' && params.apiKey.trim().length > 0
      ? sanitizeProviderApiKey(params.apiKey)
      : undefined;

  if (typeof params.apiKey === 'string' && params.apiKey.trim().length > 0 && !sanitizedKey) {
    return {
      ok: false,
      error: isEnglishUi()
        ? 'The API key is empty or improperly formatted.'
        : 'Der API-Schlüssel ist leer oder ungültig formatiert.',
    };
  }

  const targetProvider: ApiProviderId = params.provider && isValidProviderId(params.provider)
    ? params.provider
    : memoryProvider;

  const hasBackend = await detectBackend();
  if (hasBackend) {
    try {
      const res = await fetch('./api/openrouter/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getBackendFallbackHeaders(targetProvider),
        },
        body: JSON.stringify({ ...params, provider: targetProvider, apiKey: sanitizedKey }),
      });
      const data = (await res.json()) as OpenRouterStatus & { error?: string; code?: string };
      if (!res.ok) {
        return {
          ok: false,
          error: data.error || 'Konfiguration konnte nicht gespeichert werden.',
          code: data.code,
        };
      }
      memoryProvider = targetProvider;
      if (params.customBaseUrl) {
        memoryBaseUrlsByProvider[targetProvider] = resolveProviderBaseUrl(targetProvider, params.customBaseUrl);
      }
      if (sanitizedKey) {
        memoryProviderKeys[targetProvider] = sanitizedKey;
      }
      if (data.model) memoryModelsByProvider[targetProvider] = data.model;
      if (data.secondaryModel) memorySecondaryByProvider[targetProvider] = data.secondaryModel;
      persistProviderMaps();
      return { ok: true, status: { ...(data as OpenRouterStatus), backendAvailable: true } };
    } catch {
      return { ok: false, error: 'Netzwerkfehler beim Speichern der API-Konfiguration.' };
    }
  }

  const nextBaseUrl =
    typeof params.customBaseUrl === 'string' && params.customBaseUrl.trim().length > 0
      ? resolveProviderBaseUrl(targetProvider, params.customBaseUrl)
      : getActiveBaseUrl(targetProvider);

  if (typeof params.model === 'string' && params.model.trim().length > 0) {
    const free = await isStaticModelFree(params.model.trim(), targetProvider);
    if (shouldEnforceStaticPaidLock(free, targetProvider)) {
      return {
        ok: false,
        error: isEnglishUi()
          ? 'Paid models are locked. Please enter the password first.'
          : 'Kostenpflichtige Modelle sind gesperrt. Bitte gib zuerst das Passwort ein.',
        code: 'PAID_MODEL_LOCKED',
      };
    }
  }

  if (typeof params.secondaryModel === 'string' && params.secondaryModel.trim().length > 0) {
    const free = await isStaticModelFree(params.secondaryModel.trim(), targetProvider);
    if (shouldEnforceStaticPaidLock(free, targetProvider)) {
      return {
        ok: false,
        error: isEnglishUi()
          ? 'Paid models are locked. Please enter the password first.'
          : 'Kostenpflichtige Modelle sind gesperrt. Bitte gib zuerst das Passwort ein.',
        code: 'PAID_MODEL_LOCKED',
      };
    }
  }

  if (sanitizedKey) {
    const verify = await verifyProviderKeyStatic({
      provider: targetProvider,
      apiKey: sanitizedKey,
      customBaseUrl: nextBaseUrl,
    });
    if (!verify.ok) {
      return { ok: false, error: verify.error };
    }
    memoryProviderKeys[targetProvider] = sanitizedKey;
    if (targetProvider === 'openrouter') {
      memoryKeyInfo = verify.keyInfo;
    }
  } else if (targetProvider === 'custom' && typeof params.customBaseUrl === 'string' && params.customBaseUrl.trim()) {
    const verify = await verifyProviderKeyStatic({
      provider: 'custom',
      apiKey: memoryProviderKeys.custom,
      customBaseUrl: nextBaseUrl,
    });
    if (!verify.ok) {
      return { ok: false, error: verify.error };
    }
  }

  memoryProvider = targetProvider;
  if (typeof params.customBaseUrl === 'string' && params.customBaseUrl.trim().length > 0) {
    memoryBaseUrlsByProvider[targetProvider] = nextBaseUrl;
  }

  if (typeof params.model === 'string' && params.model.trim().length > 0) {
    memoryModelsByProvider[targetProvider] = params.model.trim();
  }
  if (typeof params.dualReviewEnabled === 'boolean') {
    memoryDualReviewEnabled = params.dualReviewEnabled;
    setStoredString(STORAGE_KEY_DUAL, String(memoryDualReviewEnabled));
  }
  if (typeof params.secondaryModel === 'string' && params.secondaryModel.trim().length > 0) {
    memorySecondaryByProvider[targetProvider] = params.secondaryModel.trim();
  }
  if (typeof params.enforceZdr === 'boolean') {
    memoryEnforceZdr = params.enforceZdr;
    setStoredString(STORAGE_KEY_ZDR, String(memoryEnforceZdr));
  }

  persistProviderMaps();
  return { ok: true, status: getStaticStatus() };
}

export async function removeOpenRouterKey(providerId?: ApiProviderId): Promise<
  { ok: true; status: OpenRouterStatus } | { ok: false; error: string }
> {
  const target = providerId || memoryProvider;
  delete memoryProviderKeys[target];
  if (target === 'openrouter') {
    memoryKeyInfo = null;
  }
  persistProviderMaps();

  const hasBackend = await detectBackend();
  if (hasBackend) {
    try {
      const res = await fetch(`./api/openrouter/config?provider=${encodeURIComponent(target)}`, {
        method: 'DELETE',
        headers: getBackendFallbackHeaders(target),
      });
      const data = await res.json();
      if (!res.ok) {
        return { ok: false, error: data.error || 'Schlüssel konnte nicht entfernt werden.' };
      }
      return { ok: true, status: { ...(data as OpenRouterStatus), backendAvailable: true } };
    } catch {
      return { ok: false, error: 'Netzwerkfehler beim Entfernen des Schlüssels.' };
    }
  }

  return { ok: true, status: getStaticStatus() };
}

export async function fetchOpenRouterModels(
  providerOverride?: ApiProviderId,
  baseUrlOverride?: string
): Promise<OpenRouterModel[]> {
  const targetProvider = providerOverride || memoryProvider;
  const def = getProviderDefinition(targetProvider);
  const baseUrl = resolveProviderBaseUrl(
    targetProvider,
    baseUrlOverride ?? memoryBaseUrlsByProvider[targetProvider]
  );

  const hasBackend = await detectBackend();
  if (hasBackend) {
    const query = new URLSearchParams({ provider: targetProvider });
    if (baseUrl) query.set('baseUrl', baseUrl);
    const res = await fetch(`./api/openrouter/models?${query.toString()}`, {
      headers: getBackendFallbackHeaders(targetProvider),
    });
    if (!res.ok) return def.fallbackModels;
    const data = (await res.json()) as { models?: OpenRouterModel[] };
    return data.models && data.models.length > 0 ? data.models : def.fallbackModels;
  }

  const activeKey = getActiveApiKey(targetProvider);
  const cacheKey = `${targetProvider}|${baseUrl}|${activeKey ? 'auth' : 'pub'}`;
  const now = Date.now();
  const cached = cachedStaticModelsByProvider.get(cacheKey);
  if (cached && now - cached.fetchedAt < 10 * 60 * 1000) {
    return cached.models;
  }

  if (!activeKey && !def.supportsPublicModels && targetProvider !== 'custom') {
    return def.fallbackModels;
  }

  try {
    const headers: Record<string, string> = {};
    if (targetProvider === 'anthropic') {
      if (!activeKey) return def.fallbackModels;
      headers['x-api-key'] = activeKey;
      headers['anthropic-version'] = '2023-06-01';
      headers['anthropic-dangerous-direct-browser-access'] = 'true';
    } else if (activeKey) {
      headers['Authorization'] = `Bearer ${activeKey}`;
    }

    const upstream = await fetch(`${baseUrl}/models`, { headers });
    if (!upstream.ok) return def.fallbackModels;
    const json = await upstream.json();
    const models = normalizeModelsCatalogResponse(targetProvider, json);
    const finalList = models.length > 0 ? models : def.fallbackModels;
    cachedStaticModelsByProvider.set(cacheKey, { fetchedAt: now, models: finalList });
    return finalList;
  } catch {
    return def.fallbackModels;
  }
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

function formatFriendlyRateLimitMessage(rawMessage: string, providerId: ApiProviderId = memoryProvider): string {
  if (isEnglishUi()) {
    return providerId === 'openrouter'
      ? `Rate limit (requests per minute) reached: ${rawMessage} — Tip: Use the "Free Models Router" (rotates automatically across free providers) or pause Instant mode.`
      : `Rate limit (requests per minute) reached: ${rawMessage} — Tip: Pause Instant mode or adjust request spacing in Options.`;
  }
  return providerId === 'openrouter'
    ? `Anfrage-Limit (Requests pro Minute) erreicht: ${rawMessage} — Tipp: Nutze den „Free Models Router“ (wechselt automatisch zwischen freien Anbietern) oder pausiere den Sofort-Modus.`
    : `Anfrage-Limit (Requests pro Minute) erreicht: ${rawMessage} — Tipp: Pausiere den Sofort-Modus oder erhöhe die Anfrage-Taktung in den Optionen.`;
}

function extractTextFromStaticJson(protocol: 'openai' | 'anthropic', json: unknown): string {
  if (!json || typeof json !== 'object') return '';
  if (protocol === 'anthropic') {
    const blocks = (json as { content?: Array<{ type?: string; text?: string }> }).content;
    if (!Array.isArray(blocks)) return '';
    return blocks
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text)
      .join('')
      .trim();
  }
  const choices = (json as { choices?: Array<{ message?: { content?: string } }> }).choices;
  return choices?.[0]?.message?.content?.trim() || '';
}

function createDeltaBatcher(onDelta: (acc: string) => void, signal: AbortSignal) {
  let pending: string | null = null;
  let rafId: number | null = null;

  const flush = () => {
    rafId = null;
    if (signal.aborted || pending === null) return;
    const value = pending;
    pending = null;
    onDelta(value);
  };

  return {
    push(accumulated: string) {
      if (signal.aborted) return;
      pending = accumulated;
      if (rafId === null) {
        if (typeof requestAnimationFrame === 'function') {
          rafId = requestAnimationFrame(flush);
        } else {
          flush();
        }
      }
    },
    finish(finalAccumulated: string) {
      if (rafId !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      pending = null;
      if (!signal.aborted && finalAccumulated) {
        onDelta(finalAccumulated);
      }
    },
    cancel() {
      if (rafId !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      pending = null;
    },
  };
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
  const activeProvider = memoryProvider;
  const def = getProviderDefinition(activeProvider);

  if (hasBackend) {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      await paceOpenRouterCall(params.signal);
      const res = await fetch('./api/rewrite', {
        method: 'POST',
        signal: params.signal,
        headers: {
          'Content-Type': 'application/json',
          ...getBackendFallbackHeaders(activeProvider),
        },
        body: JSON.stringify({
          provider: activeProvider,
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
          return { ok: false, error: formatFriendlyRateLimitMessage(rawErr, activeProvider), isRateLimit: true };
        }
        return { ok: false, error: rawErr };
      }
      if (!res.body) {
        return { ok: false, error: 'Keine Antwort vom Server erhalten.' };
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      const deltaBatcher = createDeltaBatcher(params.onDelta, params.signal);
      let buffer = '';
      let accumulated = '';
      let streamRateLimitError: string | null = null;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split('\n\n');
          buffer = frames.pop() ?? '';

          let chunkUpdated = false;
          for (const frame of frames) {
            const line = frame.trim();
            if (!line.startsWith('data:')) continue;
            const raw = line.slice(5).trim();
            if (!raw) continue;
            try {
              const parsed = JSON.parse(raw) as { delta?: string; error?: string };
              if (parsed.error) {
                deltaBatcher.cancel();
                if (!accumulated && isRateLimitErrorPayload(0, parsed.error)) {
                  streamRateLimitError = parsed.error;
                  break;
                }
                return {
                  ok: false,
                  error: isRateLimitErrorPayload(0, parsed.error)
                    ? formatFriendlyRateLimitMessage(parsed.error, activeProvider)
                    : parsed.error,
                  isRateLimit: isRateLimitErrorPayload(0, parsed.error),
                };
              }
              if (typeof parsed.delta === 'string') {
                accumulated += parsed.delta;
                chunkUpdated = true;
              }
            } catch {
              // Ignore malformed SSE frames
            }
          }
          if (chunkUpdated) {
            deltaBatcher.push(accumulated);
          }
          if (streamRateLimitError) break;
        }
      } catch (err) {
        deltaBatcher.cancel();
        throw err;
      }

      if (streamRateLimitError) {
        deltaBatcher.cancel();
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
          error: formatFriendlyRateLimitMessage(streamRateLimitError, activeProvider),
          isRateLimit: true,
        };
      }

      deltaBatcher.finish(accumulated);
      return { ok: true, text: accumulated };
    }
  }

  // Static Cloudflare / GitHub Pages direct multi-provider streaming
  const activeKey = getActiveApiKey(activeProvider);
  if (!activeKey && !def.optionalKey) {
    return {
      ok: false,
      error: isEnglishUi()
        ? `No ${def.name} API key configured.`
        : `Kein ${def.name} API-Schlüssel hinterlegt.`,
    };
  }

  const targetModel = params.model || getActiveModelForProvider(activeProvider);
  const modelFree = await isStaticModelFree(targetModel, activeProvider);
  if (shouldEnforceStaticPaidLock(modelFree, activeProvider)) {
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

  const baseUrl = getActiveBaseUrl(activeProvider);
  const isOpenRouter = activeProvider === 'openrouter';
  let includeReasoningNone = isOpenRouter;
  let includeTemperature = true;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await paceOpenRouterCall(params.signal);

    let upstream: Response;
    if (def.protocol === 'anthropic') {
      upstream = await fetch(`${baseUrl}/messages`, {
        method: 'POST',
        signal: params.signal,
        headers: {
          'x-api-key': activeKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: targetModel,
          max_tokens: 8192,
          stream: true,
          temperature: Math.min(1, Math.max(0, promptConfig.temperature)),
          system: promptConfig.system,
          messages: [{ role: 'user', content: userContent }],
        }),
      });
    } else {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (activeKey) headers['Authorization'] = `Bearer ${activeKey}`;
      if (isOpenRouter) {
        headers['HTTP-Referer'] = getReferer();
        headers['X-Title'] = 'uxz Write & Translate';
      }

      const buildBody = () => {
        const body: Record<string, unknown> = {
          model: targetModel,
          stream: true,
          messages: [
            { role: 'system', content: promptConfig.system },
            { role: 'user', content: userContent },
          ],
        };
        if (includeTemperature) body.temperature = promptConfig.temperature;
        if (isOpenRouter) {
          body.provider = memoryEnforceZdr
            ? { sort: 'latency', zdr: true, data_collection: 'deny' }
            : { sort: 'latency' };
          if (includeReasoningNone) body.reasoning = { effort: 'none' };
        }
        return body;
      };

      upstream = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        signal: params.signal,
        headers,
        body: JSON.stringify(buildBody()),
      });

      if (upstream.status === 400) {
        const preview = await upstream.text().catch(() => '');
        if (includeReasoningNone && /reasoning|effort/i.test(preview)) {
          includeReasoningNone = false;
          upstream = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            signal: params.signal,
            headers,
            body: JSON.stringify(buildBody()),
          });
        } else if (includeTemperature && /temperature/i.test(preview)) {
          includeTemperature = false;
          upstream = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            signal: params.signal,
            headers,
            body: JSON.stringify(buildBody()),
          });
        } else {
          let message = `${def.name} (HTTP 400)`;
          try {
            const parsed = JSON.parse(preview) as { error?: { message?: string } };
            if (parsed?.error?.message) message = parsed.error.message;
          } catch {
            if (preview) message = `${message}: ${preview.slice(0, 240)}`;
          }
          return { ok: false, error: message };
        }
      }
    }

    if (!upstream.ok || !upstream.body) {
      const errBody = await upstream.text().catch(() => '');
      let message = `${def.name} (HTTP ${upstream.status})`;
      try {
        const parsed = JSON.parse(errBody) as { error?: { message?: string } };
        if (parsed?.error?.message) message = parsed.error.message;
      } catch {
        if (errBody) message = `${message}: ${errBody.slice(0, 240)}`;
      }
      if (upstream.status === 401 || /missing auth|authentication header|no cookie auth/i.test(message)) {
        if (isOpenRouter && targetModel === 'openrouter/free' && attempt < MAX_RETRIES && activeKey) {
          const keyOk = await fetch('https://openrouter.ai/api/v1/auth/key', {
            signal: params.signal,
            headers: { Authorization: `Bearer ${activeKey}` },
          })
            .then((r) => r.ok)
            .catch(() => false);
          if (keyOk) {
            await abortableSleep(600, params.signal);
            continue;
          }
        }
        return {
          ok: false,
          error: isEnglishUi()
            ? `${def.name} authentication failed (${message}). Please re-check your ${def.name} API key in the API drawer.`
            : `${def.name} Authentifizierung fehlgeschlagen (${message}). Bitte prüfe deinen ${def.name} API-Schlüssel im API-Menü.`,
        };
      }
      const isRl =
        isRateLimitErrorPayload(upstream.status, message) ||
        upstream.status === 503 ||
        upstream.status === 529;
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
          error: formatFriendlyRateLimitMessage(message, activeProvider),
          isRateLimit: true,
        };
      }
      return { ok: false, error: message };
    }

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder('utf-8');
    const deltaBatcher = createDeltaBatcher(params.onDelta, params.signal);
    let buffer = '';
    let accumulated = '';
    let streamRateLimitError: string | null = null;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        let chunkUpdated = false;
        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line || !line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (payload === '[DONE]') continue;
          try {
            if (def.protocol === 'anthropic') {
              const parsed = JSON.parse(payload) as {
                type?: string;
                delta?: { type?: string; text?: string };
                error?: { message?: string };
              };
              if (parsed.type === 'error' || parsed.error?.message) {
                deltaBatcher.cancel();
                const msg = parsed.error?.message || 'Anthropic Stream Error';
                const isRl = isRateLimitErrorPayload(0, msg);
                if (!accumulated && isRl) {
                  streamRateLimitError = msg;
                  break;
                }
                return {
                  ok: false,
                  error: isRl ? formatFriendlyRateLimitMessage(msg, activeProvider) : msg,
                  isRateLimit: isRl,
                };
              }
              if (
                parsed.type === 'content_block_delta' &&
                parsed.delta?.type === 'text_delta' &&
                typeof parsed.delta.text === 'string' &&
                parsed.delta.text.length > 0
              ) {
                accumulated += parsed.delta.text;
                chunkUpdated = true;
              }
            } else {
              const parsed = JSON.parse(payload) as {
                choices?: Array<{ delta?: { content?: string } }>;
                error?: { message?: string };
              };
              if (parsed.error?.message) {
                deltaBatcher.cancel();
                const isRl = isRateLimitErrorPayload(0, parsed.error.message);
                if (!accumulated && isRl) {
                  streamRateLimitError = parsed.error.message;
                  break;
                }
                return {
                  ok: false,
                  error: isRl ? formatFriendlyRateLimitMessage(parsed.error.message, activeProvider) : parsed.error.message,
                  isRateLimit: isRl,
                };
              }
              const delta = parsed.choices?.[0]?.delta?.content;
              if (typeof delta === 'string' && delta.length > 0) {
                accumulated += delta;
                chunkUpdated = true;
              }
            }
          } catch {
            // Ignore partial keepalive frames
          }
        }
        if (chunkUpdated) {
          deltaBatcher.push(accumulated);
        }
        if (streamRateLimitError) break;
      }
    } catch (err) {
      deltaBatcher.cancel();
      throw err;
    }

    if (streamRateLimitError) {
      deltaBatcher.cancel();
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
        error: formatFriendlyRateLimitMessage(streamRateLimitError, activeProvider),
        isRateLimit: true,
      };
    }

    deltaBatcher.finish(accumulated);
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
  const activeProvider = memoryProvider;
  const def = getProviderDefinition(activeProvider);

  if (hasBackend) {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      await paceOpenRouterCall(undefined);
      const res = await fetch('./api/alternatives', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getBackendFallbackHeaders(activeProvider),
        },
        body: JSON.stringify({ ...params, provider: activeProvider }),
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
            error: formatFriendlyRateLimitMessage(rawErr, activeProvider),
            isRateLimit: true,
          };
        }
        return { ok: false, error: rawErr };
      }
      return { ok: true, alternatives: data.alternatives ?? [] };
    }
    return { ok: false, error: formatFriendlyRateLimitMessage('HTTP 429', activeProvider), isRateLimit: true };
  }

  const activeKey = getActiveApiKey(activeProvider);
  if (!activeKey && !def.optionalKey) {
    return {
      ok: false,
      error: isEnglishUi()
        ? `No ${def.name} API key configured.`
        : `Kein ${def.name} API-Schlüssel hinterlegt.`,
    };
  }

  const targetModel = params.model || getActiveModelForProvider(activeProvider);
  const modelFree = await isStaticModelFree(targetModel, activeProvider);
  if (shouldEnforceStaticPaidLock(modelFree, activeProvider)) {
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

  const systemPrompt = [
    task === 'translate'
      ? 'Du lieferst genau 3 alternative Übersetzungsvarianten für einen markierten Satz im Zieltext.'
      : 'Du lieferst genau 3 alternative Formulierungen für einen markierten Satz im Textkontext.',
    langRule,
    `Stilvorgabe: ${styleHint}`,
    ...(customBlock ? [customBlock] : []),
    'Antworte ausschließlich als gültiges JSON-Objekt im Format: {"alternatives": ["...", "...", "..."]}. Keine Markdown-Codeblöcke, kein Begleittext.',
  ].join('\n');
  const userContent = `Gesamtkontext:\n${params.fullText}\n\nZu variierender Satz:\n${params.sentence}`;

  const baseUrl = getActiveBaseUrl(activeProvider);
  const isOpenRouter = activeProvider === 'openrouter';
  let includeReasoningNone = isOpenRouter;
  let includeTemperature = true;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await paceOpenRouterCall(undefined);

    let upstream: Response;
    if (def.protocol === 'anthropic') {
      upstream = await fetch(`${baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'x-api-key': activeKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: targetModel,
          max_tokens: 1024,
          stream: false,
          temperature: 0.7,
          system: systemPrompt,
          messages: [{ role: 'user', content: userContent }],
        }),
      });
    } else {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (activeKey) headers['Authorization'] = `Bearer ${activeKey}`;
      if (isOpenRouter) {
        headers['HTTP-Referer'] = getReferer();
        headers['X-Title'] = 'uxz Write & Translate';
      }

      const buildBody = () => {
        const body: Record<string, unknown> = {
          model: targetModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent },
          ],
        };
        if (includeTemperature) body.temperature = 0.7;
        if (isOpenRouter) {
          body.provider = memoryEnforceZdr
            ? { sort: 'latency', zdr: true, data_collection: 'deny' }
            : { sort: 'latency' };
          if (includeReasoningNone) body.reasoning = { effort: 'none' };
        }
        return body;
      };

      upstream = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(buildBody()),
      });

      if (upstream.status === 400) {
        const preview = await upstream.text().catch(() => '');
        if (includeReasoningNone && /reasoning|effort/i.test(preview)) {
          includeReasoningNone = false;
          upstream = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers,
            body: JSON.stringify(buildBody()),
          });
        } else if (includeTemperature && /temperature/i.test(preview)) {
          includeTemperature = false;
          upstream = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers,
            body: JSON.stringify(buildBody()),
          });
        } else {
          return { ok: false, error: `Alternativen fehlgeschlagen (HTTP 400).` };
        }
      }
    }

    if (!upstream.ok) {
      const errBody = await upstream.text().catch(() => '');
      let message = `${def.name} (HTTP ${upstream.status})`;
      try {
        const parsed = JSON.parse(errBody) as { error?: { message?: string } };
        if (parsed?.error?.message) message = parsed.error.message;
      } catch {
        if (errBody) message = `${message}: ${errBody.slice(0, 200)}`;
      }
      const isRl =
        isRateLimitErrorPayload(upstream.status, message) ||
        upstream.status === 503 ||
        upstream.status === 529;
      if (isRl) {
        rateLimitCooldownUntilMs = Date.now() + 25000;
        if (attempt < MAX_RETRIES) {
          const waitMs = parseRetryAfterMs(upstream.headers, message, attempt);
          await abortableSleep(waitMs);
          continue;
        }
        return {
          ok: false,
          error: formatFriendlyRateLimitMessage(message, activeProvider),
          isRateLimit: true,
        };
      }
      return { ok: false, error: `Alternativen fehlgeschlagen (HTTP ${upstream.status}).` };
    }

    const json = await upstream.json();
    const raw = extractTextFromStaticJson(def.protocol, json);
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

  return { ok: false, error: formatFriendlyRateLimitMessage('HTTP 429', activeProvider), isRateLimit: true };
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
  const activeProvider = memoryProvider;
  const def = getProviderDefinition(activeProvider);

  if (hasBackend) {
    await paceOpenRouterCall(params.signal, analyzeSpacing);
    const res = await fetch('./api/analyze-changes', {
      method: 'POST',
      signal: params.signal,
      headers: {
        'Content-Type': 'application/json',
        ...getBackendFallbackHeaders(activeProvider),
      },
      body: JSON.stringify({
        provider: activeProvider,
        model: params.model,
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

  const activeKey = getActiveApiKey(activeProvider);
  if (!activeKey && !def.optionalKey) return [];
  const targetModel = params.model || getActiveModelForProvider(activeProvider);
  const modelFree = await isStaticModelFree(targetModel, activeProvider);
  if (shouldEnforceStaticPaidLock(modelFree, activeProvider)) return [];

  await paceOpenRouterCall(params.signal, analyzeSpacing);

  const compactHunks = params.hunks.slice(0, 60).map((h) => ({
    id: h.id,
    before: h.before.trim(),
    after: h.after.trim(),
  }));

  const systemPrompt = [
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
  ].join('\n');

  const userContent = JSON.stringify({
    sourcePreview: params.sourceText.slice(0, 1500),
    refinedPreview: params.refinedText.slice(0, 1500),
    changes: compactHunks,
  });

  const baseUrl = getActiveBaseUrl(activeProvider);
  const isOpenRouter = activeProvider === 'openrouter';
  let upstream: Response;

  if (def.protocol === 'anthropic') {
    upstream = await fetch(`${baseUrl}/messages`, {
      method: 'POST',
      signal: params.signal,
      headers: {
        'x-api-key': activeKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: targetModel,
        max_tokens: 2048,
        stream: false,
        temperature: 0,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      }),
    });
  } else {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (activeKey) headers['Authorization'] = `Bearer ${activeKey}`;
    if (isOpenRouter) {
      headers['HTTP-Referer'] = getReferer();
      headers['X-Title'] = 'uxz Write & Translate';
    }

    const baseBody: Record<string, unknown> = {
      model: targetModel,
      temperature: 0,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
    };
    if (isOpenRouter) {
      baseBody.provider = memoryEnforceZdr
        ? { sort: 'latency', zdr: true, data_collection: 'deny' }
        : { sort: 'latency' };
    }

    upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      signal: params.signal,
      headers,
      body: JSON.stringify(isOpenRouter ? { ...baseBody, reasoning: { effort: 'none' } } : baseBody),
    });

    if (upstream.status === 400) {
      const preview = await upstream.text().catch(() => '');
      if (/reasoning|effort/i.test(preview)) {
        upstream = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          signal: params.signal,
          headers,
          body: JSON.stringify(baseBody),
        });
      } else if (/temperature/i.test(preview)) {
        delete baseBody.temperature;
        upstream = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          signal: params.signal,
          headers,
          body: JSON.stringify(baseBody),
        });
      } else {
        return [];
      }
    }
  }

  if (upstream.status === 429 || upstream.status === 503 || upstream.status === 529) {
    rateLimitCooldownUntilMs = Date.now() + 25000;
    return [];
  }

  if (!upstream.ok) return [];
  const json = await upstream.json();
  const raw = extractTextFromStaticJson(def.protocol, json);
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
    STORAGE_KEY_PROVIDER,
    STORAGE_KEY_PROVIDER_KEYS,
    STORAGE_KEY_MODELS_BY_PROVIDER,
    STORAGE_KEY_SECONDARY_BY_PROVIDER,
    STORAGE_KEY_BASE_URLS_BY_PROVIDER,
    STORAGE_KEY_MODEL,
    STORAGE_KEY_SECONDARY_MODEL,
    STORAGE_KEY_DUAL,
    STORAGE_KEY_ZDR,
    STORAGE_KEY_PREFS,
    STORAGE_KEY_HISTORY,
    STORAGE_KEY_DARK_MODE,
    STORAGE_KEY_UI_LANG,
  ].forEach(removeStoredString);

  memoryProvider = 'openrouter';
  memoryProviderKeys = {};
  memoryModelsByProvider = {};
  memorySecondaryByProvider = {};
  memoryBaseUrlsByProvider = {};
  memoryDualReviewEnabled = false;
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
      fetch('./api/openrouter/config?all=true', { method: 'DELETE' }),
      fetch('./api/openrouter/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'openrouter',
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
