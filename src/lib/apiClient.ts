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

// Session state with sessionStorage persistence for the current browser tab/session (never localStorage)
let backendAvailable: boolean | null = null;
let memoryApiKey = '';
if (typeof window !== 'undefined') {
  try {
    memoryApiKey = sessionStorage.getItem('openrouter_api_key') || '';
  } catch {
    // ignore
  }
}
let memoryModel = DEFAULT_MODEL;
let memoryDualReviewEnabled = false;
let memorySecondaryModel = DEFAULT_MODEL;
let memoryKeyInfo: OpenRouterStatus['keyInfo'] = null;
let memoryPaidUnlocked = false;
let memoryPaidPasswordHash = '';
let memoryHistory: HistoryEntry[] = [];
let memoryPreferences: WritingPreferences = {
  terms: [],
  rules: DEFAULT_STARTER_RULES.map((r) => ({ ...r })),
  settings: {
    ...DEFAULT_WORKSPACE_SETTINGS,
    enabledLanguages: [...DEFAULT_WORKSPACE_SETTINGS.enabledLanguages],
  },
};
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
  return 'https://highl-write.pages.dev';
}

export async function fetchOpenRouterStatus(): Promise<OpenRouterStatus> {
  const hasBackend = await detectBackend();
  if (hasBackend) {
    const res = await fetch('./api/openrouter/status');
    const data = (await res.json()) as OpenRouterStatus;
    return { ...data, backendAvailable: true };
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
        return { ok: false, error: data.error || 'Entsperrung fehlgeschlagen.' };
      }
      return { ok: true, status: { ...data, backendAvailable: true } };
    } catch {
      return { ok: false, error: 'Netzwerkfehler bei der Passwortprüfung.' };
    }
  }

  if (!password) {
    return { ok: false, error: 'Bitte gib ein Passwort ein.' };
  }

  const candidateHash = await sha256Hex(password);
  const activeHash = BUILD_PAID_PASSWORD_HASH || memoryPaidPasswordHash;

  if (activeHash) {
    if (!constantTimeEqual(candidateHash, activeHash)) {
      return { ok: false, error: 'Falsches Passwort.' };
    }
    memoryPaidUnlocked = true;
    return { ok: true, status: getStaticStatus() };
  }

  if (password.length < 6) {
    return { ok: false, error: 'Das Passwort muss mindestens 6 Zeichen lang sein.' };
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
}): Promise<{ ok: true; status: OpenRouterStatus } | { ok: false; error: string; code?: string }> {
  if (typeof params.apiKey === 'string' && params.apiKey.trim().length > 0) {
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.setItem('openrouter_api_key', params.apiKey.trim());
      } catch {
        // ignore
      }
    }
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
        error: 'Kostenpflichtige Modelle sind gesperrt. Bitte gib zuerst das Passwort ein.',
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
        error: 'Kostenpflichtige Modelle sind gesperrt. Bitte gib zuerst das Passwort ein.',
        code: 'PAID_MODEL_LOCKED',
      };
    }
  }

  // Static Cloudflare Pages BYOK mode: verify directly against OpenRouter API
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
              ? 'Der OpenRouter API-Schlüssel wurde abgelehnt. Bitte prüfe den Schlüssel.'
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
      if (typeof window !== 'undefined') {
        try {
          sessionStorage.setItem('openrouter_api_key', candidate);
        } catch {
          // ignore
        }
      }
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
        error: `Verbindung zu OpenRouter fehlgeschlagen: ${err instanceof Error ? err.message : 'Unbekannter Fehler'}`,
      };
    }
  }

  if (typeof params.model === 'string' && params.model.trim().length > 0) {
    memoryModel = params.model.trim();
  }
  if (typeof params.dualReviewEnabled === 'boolean') {
    memoryDualReviewEnabled = params.dualReviewEnabled;
  }
  if (typeof params.secondaryModel === 'string' && params.secondaryModel.trim().length > 0) {
    memorySecondaryModel = params.secondaryModel.trim();
  }

  return { ok: true, status: getStaticStatus() };
}

export async function removeOpenRouterKey(): Promise<
  { ok: true; status: OpenRouterStatus } | { ok: false; error: string }
> {
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.removeItem('openrouter_api_key');
    } catch {
      // ignore
    }
  }

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
}): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const hasBackend = await detectBackend();

  if (hasBackend) {
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
      return { ok: false, error: errJson?.error || `Anfrage fehlgeschlagen (HTTP ${res.status}).` };
    }
    if (!res.body) {
      return { ok: false, error: 'Keine Antwort vom Server erhalten.' };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let accumulated = '';

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
            return { ok: false, error: parsed.error };
          }
          if (typeof parsed.delta === 'string') {
            accumulated += parsed.delta;
            params.onDelta(accumulated);
          }
        } catch {
          // Ignore malformed SSE frames
        }
      }
    }

    return { ok: true, text: accumulated };
  }

  // Static Cloudflare Pages direct OpenRouter streaming
  if (!memoryApiKey) {
    return { ok: false, error: 'Kein OpenRouter API-Schlüssel hinterlegt.' };
  }

  const targetModel = params.model || memoryModel;
  if (!memoryPaidUnlocked && !(await isStaticModelFree(targetModel))) {
    return {
      ok: false,
      error: 'Kostenpflichtige Modelle sind gesperrt. Bitte Passwort eingeben.',
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
    provider: { sort: 'latency' },
    messages: [
      { role: 'system', content: promptConfig.system },
      { role: 'user', content: userContent },
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
    return { ok: false, error: message };
  }

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let accumulated = '';

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
          return { ok: false, error: parsed.error.message };
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
  }

  return { ok: true, text: accumulated };
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
}): Promise<{ ok: true; alternatives: string[] } | { ok: false; error: string }> {
  const hasBackend = await detectBackend();
  if (hasBackend) {
    const res = await fetch('./api/alternatives', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = (await res.json()) as { alternatives?: string[]; error?: string };
    if (!res.ok) {
      return { ok: false, error: data.error || 'Alternativen konnten nicht geladen werden.' };
    }
    return { ok: true, alternatives: data.alternatives ?? [] };
  }

  if (!memoryApiKey) {
    return { ok: false, error: 'Kein OpenRouter API-Schlüssel hinterlegt.' };
  }

  const targetModel = params.model || memoryModel;
  if (!memoryPaidUnlocked && !(await isStaticModelFree(targetModel))) {
    return {
      ok: false,
      error: 'Kostenpflichtige Modelle sind gesperrt. Bitte Passwort eingeben.',
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
    provider: { sort: 'latency' },
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
    }
  }

  if (!upstream.ok) {
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

export async function analyzeChangesRequest(params: {
  sourceText: string;
  refinedText: string;
  hunks: Array<{ id: string; before: string; after: string }>;
  model: string;
  signal: AbortSignal;
}): Promise<Array<{ id: string; category: ChangeCategory; reason?: string }>> {
  if (params.hunks.length === 0) return [];
  const hasBackend = await detectBackend();

  if (hasBackend) {
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
    if (!res.ok) return [];
    const data = (await res.json()) as {
      classifications?: Array<{ id: string; category: ChangeCategory; reason?: string }>;
    };
    return data.classifications ?? [];
  }

  if (!memoryApiKey) return [];
  const targetModel = params.model || memoryModel;
  if (!memoryPaidUnlocked && !(await isStaticModelFree(targetModel))) return [];

  const compactHunks = params.hunks.slice(0, 60).map((h) => ({
    id: h.id,
    before: h.before.trim(),
    after: h.after.trim(),
  }));

  const payload = {
    model: params.model || memoryModel,
    temperature: 0,
    provider: { sort: 'latency' },
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
          'Gib zu jedem Eintrag außerdem eine knappe deutsche Begründung (max. 5 Wörter).',
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
    }
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
    memoryHistory[0].mode === payload.mode
  ) {
    return memoryHistory;
  }

  const entry: HistoryEntry = {
    id: crypto.randomUUID(),
    ...payload,
    createdAt: new Date().toISOString(),
  };
  memoryHistory = [entry, ...memoryHistory].slice(0, 50);
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
  return memoryHistory;
}

export async function clearHistoryEntries(): Promise<HistoryEntry[]> {
  const hasBackend = await detectBackend();
  if (hasBackend) {
    await fetch('./api/history', { method: 'DELETE' });
    return [];
  }
  memoryHistory = [];
  return [];
}

export async function fetchWritingPreferences(): Promise<WritingPreferences> {
  const hasBackend = await detectBackend();
  if (hasBackend) {
    const res = await fetch('./api/preferences');
    if (res.ok) {
      return (await res.json()) as WritingPreferences;
    }
  }
  return memoryPreferences;
}

export async function saveWritingPreferences(prefs: WritingPreferences): Promise<WritingPreferences> {
  memoryPreferences = prefs;
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
