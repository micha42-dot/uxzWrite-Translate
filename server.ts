import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import type { Request, Response } from 'express';

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
} from './src/lib/prompts.ts';
import type { PromptPreferencesInput } from './src/lib/prompts.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';
const DEFAULT_MODEL = process.env.OPENROUTER_DEFAULT_MODEL || 'openrouter/free';

const DATA_DIR = path.join(__dirname, '.data');
const HISTORY_DIR = path.join(DATA_DIR, 'history');
const PREFS_DIR = path.join(DATA_DIR, 'preferences');
const VAULT_KEY_PATH = path.join(DATA_DIR, '.vault-key');
const PAID_MODELS_AUTH_PATH = path.join(DATA_DIR, '.paid-models-auth.json');

fs.mkdirSync(HISTORY_DIR, { recursive: true });
fs.mkdirSync(PREFS_DIR, { recursive: true });

function getEncryptionKey(): Buffer {
  const envSecret = process.env.SESSION_SECRET || process.env.APP_URL;
  if (envSecret && envSecret.trim().length > 0) {
    return crypto.scryptSync(envSecret, 'textschliff-openrouter-vault-v1', 32);
  }
  if (fs.existsSync(VAULT_KEY_PATH)) {
    const raw = fs.readFileSync(VAULT_KEY_PATH, 'utf8').trim();
    if (/^[a-f0-9]{64}$/i.test(raw)) {
      return Buffer.from(raw, 'hex');
    }
  }
  const generated = crypto.randomBytes(32);
  fs.writeFileSync(VAULT_KEY_PATH, generated.toString('hex'), { mode: 0o600 });
  return generated;
}

const ENCRYPTION_KEY = getEncryptionKey();

interface StoredOpenRouterConfig {
  apiKey?: string;
  model?: string;
  dualReviewEnabled?: boolean;
  secondaryModel?: string;
  enforceZdr?: boolean;
  paidUnlocked?: boolean;
  keyInfo?: {
    label?: string | null;
    limit?: number | null;
    usage?: number | null;
    isFreeTier?: boolean | null;
  } | null;
  updatedAt?: string;
}

interface CatalogModel {
  id: string;
  name: string;
  contextLength: number;
  promptPricePer1M: number;
  completionPricePer1M: number;
}

interface StoredPaidPasswordFile {
  salt: string;
  hash: string;
  createdAt: string;
}

function readStoredPaidPasswordFile(): StoredPaidPasswordFile | null {
  if (!fs.existsSync(PAID_MODELS_AUTH_PATH)) return null;
  try {
    const raw = fs.readFileSync(PAID_MODELS_AUTH_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<StoredPaidPasswordFile>;
    if (typeof parsed.salt === 'string' && typeof parsed.hash === 'string' && parsed.salt && parsed.hash) {
      return {
        salt: parsed.salt,
        hash: parsed.hash,
        createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : new Date().toISOString(),
      };
    }
    return null;
  } catch {
    return null;
  }
}

function isPaidPasswordConfigured(): boolean {
  const envPass = (process.env.PAID_MODELS_PASSWORD || '').trim();
  const envHash = (process.env.PAID_MODELS_PASSWORD_HASH || '').trim();
  if (envPass.length > 0 || /^[a-f0-9]{64}$/i.test(envHash)) {
    return true;
  }
  return readStoredPaidPasswordFile() !== null;
}

function verifyPaidPassword(candidate: string): boolean {
  const envPass = (process.env.PAID_MODELS_PASSWORD || '').trim();
  if (envPass.length > 0) {
    const expected = crypto.createHash('sha256').update(envPass, 'utf8').digest();
    const actual = crypto.createHash('sha256').update(candidate, 'utf8').digest();
    return crypto.timingSafeEqual(expected, actual);
  }

  const envHash = (process.env.PAID_MODELS_PASSWORD_HASH || '').trim();
  if (/^[a-f0-9]{64}$/i.test(envHash)) {
    const expected = Buffer.from(envHash.toLowerCase(), 'hex');
    const actual = crypto.createHash('sha256').update(candidate, 'utf8').digest();
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  }

  const stored = readStoredPaidPasswordFile();
  if (!stored) return false;
  const expectedBuf = Buffer.from(stored.hash, 'hex');
  const actualBuf = crypto.scryptSync(candidate, stored.salt, expectedBuf.length);
  return expectedBuf.length === actualBuf.length && crypto.timingSafeEqual(expectedBuf, actualBuf);
}

function initializePaidPassword(password: string) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  const payload: StoredPaidPasswordFile = {
    salt,
    hash,
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(PAID_MODELS_AUTH_PATH, JSON.stringify(payload, null, 2), { mode: 0o600, encoding: 'utf8' });
}

interface HistoryEntry {
  id: string;
  sourceText: string;
  refinedText: string;
  sourceLang: string;
  targetLang?: string;
  task?: 'rewrite' | 'translate';
  mode: 'correction' | 'style';
  style: string;
  model: string;
  changes?: Array<{
    id: string;
    before: string;
    after: string;
    refinedStart: number;
    refinedEnd: number;
    category: string;
    reason?: string;
  }>;
  createdAt: string;
}

function sealPayload(payload: StoredOpenRouterConfig): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  const json = JSON.stringify(payload);
  const encrypted = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

function unsealPayload(token: string): StoredOpenRouterConfig | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const iv = Buffer.from(parts[0], 'base64url');
    const tag = Buffer.from(parts[1], 'base64url');
    const data = Buffer.from(parts[2], 'base64url');
    const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8')) as StoredOpenRouterConfig;
  } catch {
    return null;
  }
}

function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.cookie;
  if (!header) return {};
  const result: Record<string, string> = {};
  for (const part of header.split(';')) {
    const eqIndex = part.indexOf('=');
    if (eqIndex <= 0) continue;
    const key = part.slice(0, eqIndex).trim();
    const val = part.slice(eqIndex + 1).trim();
    try {
      result[key] = decodeURIComponent(val);
    } catch {
      result[key] = val;
    }
  }
  return result;
}

function isHttpsRequest(req: Request): boolean {
  if (req.secure) return true;
  const proto = req.headers['x-forwarded-proto'];
  if (typeof proto === 'string') {
    return proto.split(',')[0].trim().toLowerCase() === 'https';
  }
  return false;
}

function setSecureCookie(req: Request, res: Response, name: string, value: string, maxAgeSeconds: number) {
  const https = isHttpsRequest(req);
  const attrs = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${maxAgeSeconds}`,
    https ? 'SameSite=None' : 'SameSite=Lax',
  ];
  if (https) {
    attrs.push('Secure');
  }
  res.append('Set-Cookie', attrs.join('; '));
}

function clearSecureCookie(req: Request, res: Response, name: string) {
  const https = isHttpsRequest(req);
  const attrs = [
    `${name}=`,
    'Path=/',
    'HttpOnly',
    'Max-Age=0',
    https ? 'SameSite=None' : 'SameSite=Lax',
  ];
  if (https) {
    attrs.push('Secure');
  }
  res.append('Set-Cookie', attrs.join('; '));
}

function ensureSessionId(req: Request, res: Response): string {
  const cookies = parseCookies(req);
  const existing = cookies['ts_sid'];
  if (existing && /^[a-f0-9]{32}$/.test(existing)) {
    return existing;
  }
  const sid = crypto.randomBytes(16).toString('hex');
  setSecureCookie(req, res, 'ts_sid', sid, 60 * 60 * 24 * 30);
  return sid;
}

function maskApiKey(key: string): string {
  const trimmed = key.trim();
  if (trimmed.length <= 12) {
    return '••••' + trimmed.slice(-4);
  }
  return `${trimmed.slice(0, 9)}••••${trimmed.slice(-4)}`;
}

function resolveOpenRouterAuth(req: Request): {
  apiKey: string | null;
  source: 'session' | 'env' | 'none';
  model: string;
  dualReviewEnabled: boolean;
  secondaryModel: string;
  enforceZdr: boolean;
  paidUnlocked: boolean;
  keyInfo: StoredOpenRouterConfig['keyInfo'];
} {
  const cookies = parseCookies(req);
  const sealed = cookies['ts_or_cfg'];
  const parsed = sealed ? unsealPayload(sealed) : null;

  const sessionKey = parsed?.apiKey?.trim() || '';
  const envKey = (process.env.OPENROUTER_API_KEY || '').trim();
  const validEnvKey = envKey && envKey !== 'MY_OPENROUTER_API_KEY' ? envKey : '';

  const model = parsed?.model?.trim() || DEFAULT_MODEL;
  const dualReviewEnabled = Boolean(parsed?.dualReviewEnabled);
  const secondaryModel = parsed?.secondaryModel?.trim() || DEFAULT_MODEL;
  const enforceZdr = Boolean(parsed?.enforceZdr);
  const paidUnlocked = Boolean(parsed?.paidUnlocked);

  if (sessionKey) {
    return {
      apiKey: sessionKey,
      source: 'session',
      model,
      dualReviewEnabled,
      secondaryModel,
      enforceZdr,
      paidUnlocked,
      keyInfo: parsed?.keyInfo ?? null,
    };
  }

  if (validEnvKey) {
    return {
      apiKey: validEnvKey,
      source: 'env',
      model,
      dualReviewEnabled,
      secondaryModel,
      enforceZdr,
      paidUnlocked,
      keyInfo: null,
    };
  }

  return {
    apiKey: null,
    source: 'none',
    model,
    dualReviewEnabled,
    secondaryModel,
    enforceZdr,
    paidUnlocked,
    keyInfo: null,
  };
}

function getHistoryFilePath(sid: string): string {
  if (!/^[a-f0-9]{32}$/.test(sid)) {
    throw new Error('Invalid session identifier');
  }
  return path.join(HISTORY_DIR, `${sid}.json`);
}

function readHistory(sid: string): HistoryEntry[] {
  const filePath = getHistoryFilePath(sid);
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

function writeHistory(sid: string, entries: HistoryEntry[]) {
  const filePath = getHistoryFilePath(sid);
  fs.writeFileSync(filePath, JSON.stringify(entries.slice(0, 50), null, 2), 'utf8');
}

interface StoredProtectedTerm {
  id: string;
  term: string;
  caseSensitive: boolean;
  enabled: boolean;
}

interface StoredWritingRule {
  id: string;
  title: string;
  instruction: string;
  enabled: boolean;
}

interface StoredWorkspaceSettings {
  defaultSourceLang: string;
  defaultTargetLang: string;
  enabledLanguages: string[];
  defaultWriteMode: 'correction' | 'style';
  defaultWriteStyle: string;
  defaultTranslationTone: 'neutral' | 'formal' | 'informal';
  defaultInstantMode: boolean;
  defaultChunkingEnabled: boolean;
  typingDebounceMs: number;
  pasteDebounceMs: number;
  chunkMaxChars: number;
  minRequestSpacingMs: number;
  freeModelConcurrency: number;
  paidModelConcurrency: number;
  rateLimitRetries: number;
  skipAnalyzeOnRateLimit: boolean;
}

interface StoredWritingPreferences {
  terms: StoredProtectedTerm[];
  rules: StoredWritingRule[];
  settings: StoredWorkspaceSettings;
}

const DEFAULT_SETTINGS_SERVER: StoredWorkspaceSettings = {
  defaultSourceLang: 'auto',
  defaultTargetLang: 'en-US',
  enabledLanguages: ['de', 'en-US', 'en-GB', 'fr', 'es', 'it', 'nl', 'pt', 'pl', 'tlh'],
  defaultWriteMode: 'style',
  defaultWriteStyle: 'ausgewogen',
  defaultTranslationTone: 'neutral',
  defaultInstantMode: true,
  defaultChunkingEnabled: true,
  typingDebounceMs: 1100,
  pasteDebounceMs: 250,
  chunkMaxChars: 2400,
  minRequestSpacingMs: 450,
  freeModelConcurrency: 1,
  paidModelConcurrency: 2,
  rateLimitRetries: 2,
  skipAnalyzeOnRateLimit: true,
};

const VALID_TARGET_LANGS = new Set(Object.keys(TARGET_LANGUAGE_NAMES));

const DEFAULT_STARTER_RULES_SERVER: StoredWritingRule[] = [
  {
    id: 'rule-dashes',
    title: 'Gedankenstrich-Einschübe erhalten',
    instruction:
      'Textpassagen, die zwischen Gedankenstrichen („– … –“ oder „— … —“) stehen, müssen exakt zwischen Gedankenstrichen bleiben und dürfen niemals in Klammern „(…)“ umgewandelt werden.',
    enabled: false,
  },
  {
    id: 'rule-no-quotes-names',
    title: 'Eigen- & Mediennamen ohne Anführungszeichen',
    instruction:
      'Eigennamen, Produktnamen, Markennamen, Mediennamen, Titel und feststehende Eigenwörter dürfen nicht zusätzlich in Anführungszeichen („…“ / "…") gesetzt werden.',
    enabled: false,
  },
];

function getPreferencesFilePath(sid: string): string {
  if (!/^[a-f0-9]{32}$/.test(sid)) {
    throw new Error('Invalid session identifier');
  }
  return path.join(PREFS_DIR, `${sid}.json`);
}

function clampInt(val: unknown, fallback: number, min: number, max: number): number {
  const num = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.round(num)));
}

function sanitizeSettings(raw: unknown): StoredWorkspaceSettings {
  const s = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const enabledLanguages = Array.isArray(s.enabledLanguages)
    ? Array.from(
        new Set(
          s.enabledLanguages.filter(
            (lang): lang is string => typeof lang === 'string' && VALID_TARGET_LANGS.has(lang)
          )
        )
      )
    : [...DEFAULT_SETTINGS_SERVER.enabledLanguages];

  const finalEnabled =
    enabledLanguages.length >= 2 ? enabledLanguages : [...DEFAULT_SETTINGS_SERVER.enabledLanguages];

  const defaultSourceLang =
    typeof s.defaultSourceLang === 'string' &&
    (s.defaultSourceLang === 'auto' || VALID_TARGET_LANGS.has(s.defaultSourceLang))
      ? s.defaultSourceLang
      : DEFAULT_SETTINGS_SERVER.defaultSourceLang;

  const defaultTargetLang =
    typeof s.defaultTargetLang === 'string' && VALID_TARGET_LANGS.has(s.defaultTargetLang)
      ? s.defaultTargetLang
      : finalEnabled[0] || DEFAULT_SETTINGS_SERVER.defaultTargetLang;

  const defaultWriteMode = s.defaultWriteMode === 'correction' ? 'correction' : 'style';
  const defaultWriteStyle =
    typeof s.defaultWriteStyle === 'string' && s.defaultWriteStyle in STYLE_INSTRUCTIONS
      ? s.defaultWriteStyle
      : DEFAULT_SETTINGS_SERVER.defaultWriteStyle;

  const defaultTranslationTone =
    s.defaultTranslationTone === 'formal' || s.defaultTranslationTone === 'informal'
      ? s.defaultTranslationTone
      : 'neutral';

  return {
    defaultSourceLang,
    defaultTargetLang,
    enabledLanguages: finalEnabled,
    defaultWriteMode,
    defaultWriteStyle,
    defaultTranslationTone,
    defaultInstantMode: s.defaultInstantMode !== false,
    defaultChunkingEnabled: s.defaultChunkingEnabled !== false,
    typingDebounceMs: clampInt(s.typingDebounceMs, DEFAULT_SETTINGS_SERVER.typingDebounceMs, 250, 3000),
    pasteDebounceMs: clampInt(s.pasteDebounceMs, DEFAULT_SETTINGS_SERVER.pasteDebounceMs, 50, 1500),
    chunkMaxChars: clampInt(s.chunkMaxChars, DEFAULT_SETTINGS_SERVER.chunkMaxChars, 600, 6000),
    minRequestSpacingMs: clampInt(s.minRequestSpacingMs, DEFAULT_SETTINGS_SERVER.minRequestSpacingMs, 0, 3000),
    freeModelConcurrency: clampInt(s.freeModelConcurrency, DEFAULT_SETTINGS_SERVER.freeModelConcurrency, 1, 4),
    paidModelConcurrency: clampInt(s.paidModelConcurrency, DEFAULT_SETTINGS_SERVER.paidModelConcurrency, 1, 4),
    rateLimitRetries: clampInt(s.rateLimitRetries, DEFAULT_SETTINGS_SERVER.rateLimitRetries, 0, 4),
    skipAnalyzeOnRateLimit: s.skipAnalyzeOnRateLimit !== false,
  };
}

function sanitizePreferences(raw: unknown): StoredWritingPreferences {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const terms: StoredProtectedTerm[] = Array.isArray(obj.terms)
    ? obj.terms
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
        .map((item) => ({
          id: typeof item.id === 'string' && item.id.trim() ? item.id.slice(0, 80) : crypto.randomUUID(),
          term: typeof item.term === 'string' ? item.term.trim().slice(0, 120) : '',
          caseSensitive: Boolean(item.caseSensitive),
          enabled: item.enabled !== false,
        }))
        .filter((item) => item.term.length > 0)
        .slice(0, 200)
    : [];

  const rules: StoredWritingRule[] = Array.isArray(obj.rules)
    ? obj.rules
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
        .map((item) => ({
          id: typeof item.id === 'string' && item.id.trim() ? item.id.slice(0, 80) : crypto.randomUUID(),
          title: typeof item.title === 'string' ? item.title.trim().slice(0, 120) : '',
          instruction: typeof item.instruction === 'string' ? item.instruction.trim().slice(0, 1000) : '',
          enabled: item.enabled !== false,
        }))
        .filter((item) => item.instruction.length > 0)
        .slice(0, 60)
    : DEFAULT_STARTER_RULES_SERVER.map((r) => ({ ...r }));

  return {
    terms,
    rules,
    settings: sanitizeSettings(obj.settings),
  };
}

function readPreferences(sid: string): StoredWritingPreferences {
  const filePath = getPreferencesFilePath(sid);
  if (!fs.existsSync(filePath)) {
    return {
      terms: [],
      rules: DEFAULT_STARTER_RULES_SERVER.map((r) => ({ ...r })),
      settings: { ...DEFAULT_SETTINGS_SERVER, enabledLanguages: [...DEFAULT_SETTINGS_SERVER.enabledLanguages] },
    };
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return sanitizePreferences(JSON.parse(raw));
  } catch {
    return {
      terms: [],
      rules: DEFAULT_STARTER_RULES_SERVER.map((r) => ({ ...r })),
      settings: { ...DEFAULT_SETTINGS_SERVER, enabledLanguages: [...DEFAULT_SETTINGS_SERVER.enabledLanguages] },
    };
  }
}

function writePreferences(sid: string, prefs: StoredWritingPreferences): StoredWritingPreferences {
  const sanitized = sanitizePreferences(prefs);
  const filePath = getPreferencesFilePath(sid);
  fs.writeFileSync(filePath, JSON.stringify(sanitized, null, 2), 'utf8');
  return sanitized;
}

let cachedModels: { fetchedAt: number; data: CatalogModel[] } | null = null;

async function getModelsCatalog(): Promise<CatalogModel[]> {
  const now = Date.now();
  if (cachedModels && now - cachedModels.fetchedAt < 10 * 60 * 1000) {
    return cachedModels.data;
  }

  const upstream = await fetch('https://openrouter.ai/api/v1/models');
  if (!upstream.ok) {
    throw new Error(`OpenRouter-Modelle konnten nicht geladen werden (HTTP ${upstream.status}).`);
  }

  const json = (await upstream.json()) as {
    data?: Array<{
      id: string;
      name?: string;
      context_length?: number;
      pricing?: { prompt?: string; completion?: string };
      architecture?: { modality?: string };
    }>;
  };

  const featuredOrder = [
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

  const models: CatalogModel[] = (json.data ?? [])
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
      const idxA = featuredOrder.indexOf(a.id);
      const idxB = featuredOrder.indexOf(b.id);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.name.localeCompare(b.name);
    });

  cachedModels = { fetchedAt: now, data: models };
  return models;
}

async function isModelFreeById(modelId: string): Promise<boolean> {
  const normalized = modelId.trim();
  if (normalized === 'openrouter/free' || normalized.endsWith(':free')) {
    return true;
  }
  try {
    const catalog = await getModelsCatalog();
    const match = catalog.find((m) => m.id === normalized);
    if (!match) return false;
    return match.promptPricePer1M === 0 && match.completionPricePer1M === 0;
  } catch {
    return false;
  }
}

async function sleepWithSignal(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return;
  await new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Aborted'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error('Aborted'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function parseServerRetryAfterMs(headers: Headers, bodyText: string, attempt: number): number {
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
  return (attempt === 0 ? 2500 : 5000) + Math.floor(Math.random() * 500);
}

async function fetchOpenRouterChatWithRetry(params: {
  apiKey: string;
  appUrl: string;
  baseBody: Record<string, unknown>;
  signal?: AbortSignal;
  maxRetries?: number;
}): Promise<{ upstream: Awaited<ReturnType<typeof fetch>>; errPreview?: string }> {
  const maxRetries = params.maxRetries ?? 2;
  let includeReasoningNone = true;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const bodyPayload = includeReasoningNone
      ? { ...params.baseBody, reasoning: { effort: 'none' } }
      : params.baseBody;

    let upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: params.signal,
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': params.appUrl,
        'X-Title': 'ÜxzWrite & Translate',
      },
      body: JSON.stringify(bodyPayload),
    });

    if (upstream.status === 400 && includeReasoningNone) {
      const preview = await upstream.text().catch(() => '');
      if (/reasoning|effort/i.test(preview)) {
        includeReasoningNone = false;
        upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          signal: params.signal,
          headers: {
            Authorization: `Bearer ${params.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': params.appUrl,
            'X-Title': 'ÜxzWrite & Translate',
          },
          body: JSON.stringify(params.baseBody),
        });
      } else {
        return { upstream, errPreview: preview };
      }
    }

    if ((upstream.status === 429 || upstream.status === 503) && attempt < maxRetries) {
      const errText = await upstream.text().catch(() => '');
      const waitMs = parseServerRetryAfterMs(upstream.headers, errText, attempt);
      await sleepWithSignal(waitMs, params.signal);
      continue;
    }

    return { upstream };
  }

  throw new Error('OpenRouter-Anfrage nach Wiederholungen fehlgeschlagen.');
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/openrouter/status', async (req: Request, res: Response) => {
    ensureSessionId(req, res);
    const auth = resolveOpenRouterAuth(req);
    const modelIsFree = await isModelFreeById(auth.model);
    const secondaryIsFree = await isModelFreeById(auth.secondaryModel);
    const effectiveModel = auth.paidUnlocked || modelIsFree ? auth.model : DEFAULT_MODEL;
    const effectiveSecondary = auth.paidUnlocked || secondaryIsFree ? auth.secondaryModel : DEFAULT_MODEL;
    res.json({
      configured: Boolean(auth.apiKey),
      source: auth.source,
      keyPreview: auth.apiKey ? maskApiKey(auth.apiKey) : null,
      model: effectiveModel,
      dualReviewEnabled: auth.dualReviewEnabled,
      secondaryModel: effectiveSecondary,
      enforceZdr: auth.enforceZdr,
      paidModelsUnlocked: auth.paidUnlocked,
      paidModelsPasswordConfigured: isPaidPasswordConfigured(),
      keyInfo: auth.keyInfo ?? null,
    });
  });

  app.post('/api/openrouter/unlock-paid', (req: Request, res: Response) => {
    ensureSessionId(req, res);
    const { password } = req.body as { password?: string };

    if (typeof password !== 'string' || password.length === 0) {
      res.status(400).json({ error: 'Bitte gib ein Passwort ein.' });
      return;
    }

    if (!isPaidPasswordConfigured()) {
      if (password.length < 6) {
        res.status(400).json({ error: 'Das Passwort muss mindestens 6 Zeichen lang sein.' });
        return;
      }
      initializePaidPassword(password);
    } else if (!verifyPaidPassword(password)) {
      res.status(401).json({ error: 'Falsches Passwort.' });
      return;
    }

    const cookies = parseCookies(req);
    const existingSealed = cookies['ts_or_cfg'];
    const existing = existingSealed ? unsealPayload(existingSealed) : null;

    const payload: StoredOpenRouterConfig = {
      apiKey: existing?.apiKey,
      model: existing?.model || DEFAULT_MODEL,
      dualReviewEnabled: Boolean(existing?.dualReviewEnabled),
      secondaryModel: existing?.secondaryModel || DEFAULT_MODEL,
      enforceZdr: Boolean(existing?.enforceZdr),
      paidUnlocked: true,
      keyInfo: existing?.keyInfo ?? null,
      updatedAt: new Date().toISOString(),
    };

    const sealed = sealPayload(payload);
    setSecureCookie(req, res, 'ts_or_cfg', sealed, 60 * 60 * 24 * 30);

    const auth = resolveOpenRouterAuth(req);
    const activeKey = existing?.apiKey || auth.apiKey;
    res.json({
      configured: Boolean(activeKey),
      source: existing?.apiKey ? 'session' : auth.source,
      keyPreview: activeKey ? maskApiKey(activeKey) : null,
      model: payload.model,
      dualReviewEnabled: Boolean(payload.dualReviewEnabled),
      secondaryModel: payload.secondaryModel || DEFAULT_MODEL,
      enforceZdr: Boolean(payload.enforceZdr),
      paidModelsUnlocked: true,
      paidModelsPasswordConfigured: true,
      keyInfo: existing?.apiKey ? existing.keyInfo ?? null : auth.keyInfo ?? null,
    });
  });

  app.post('/api/openrouter/lock-paid', async (req: Request, res: Response) => {
    ensureSessionId(req, res);
    const cookies = parseCookies(req);
    const existingSealed = cookies['ts_or_cfg'];
    const existing = existingSealed ? unsealPayload(existingSealed) : null;

    const currentModel = existing?.model || DEFAULT_MODEL;
    const keepModel = await isModelFreeById(currentModel);
    const nextModel = keepModel ? currentModel : DEFAULT_MODEL;

    const currentSecondary = existing?.secondaryModel || DEFAULT_MODEL;
    const keepSecondary = await isModelFreeById(currentSecondary);
    const nextSecondary = keepSecondary ? currentSecondary : DEFAULT_MODEL;

    const payload: StoredOpenRouterConfig = {
      apiKey: existing?.apiKey,
      model: nextModel,
      dualReviewEnabled: Boolean(existing?.dualReviewEnabled),
      secondaryModel: nextSecondary,
      enforceZdr: Boolean(existing?.enforceZdr),
      paidUnlocked: false,
      keyInfo: existing?.keyInfo ?? null,
      updatedAt: new Date().toISOString(),
    };

    const sealed = sealPayload(payload);
    setSecureCookie(req, res, 'ts_or_cfg', sealed, 60 * 60 * 24 * 30);

    const envKey = (process.env.OPENROUTER_API_KEY || '').trim();
    const hasEnvKey = Boolean(envKey && envKey !== 'MY_OPENROUTER_API_KEY');
    const activeKey = existing?.apiKey || (hasEnvKey ? envKey : null);

    res.json({
      configured: Boolean(activeKey),
      source: existing?.apiKey ? 'session' : hasEnvKey ? 'env' : 'none',
      keyPreview: activeKey ? maskApiKey(activeKey) : null,
      model: nextModel,
      dualReviewEnabled: Boolean(payload.dualReviewEnabled),
      secondaryModel: nextSecondary,
      enforceZdr: Boolean(payload.enforceZdr),
      paidModelsUnlocked: false,
      paidModelsPasswordConfigured: isPaidPasswordConfigured(),
      keyInfo: existing?.apiKey ? existing.keyInfo ?? null : null,
    });
  });

  app.post('/api/openrouter/config', async (req: Request, res: Response) => {
    ensureSessionId(req, res);
    const { apiKey, model, dualReviewEnabled, secondaryModel, enforceZdr } = req.body as {
      apiKey?: string;
      model?: string;
      dualReviewEnabled?: boolean;
      secondaryModel?: string;
      enforceZdr?: boolean;
    };

    const cookies = parseCookies(req);
    const existingSealed = cookies['ts_or_cfg'];
    const existing = existingSealed ? unsealPayload(existingSealed) : null;
    const paidUnlocked = Boolean(existing?.paidUnlocked);

    if (typeof model === 'string' && model.trim().length > 0 && !paidUnlocked) {
      const candidateIsFree = await isModelFreeById(model.trim());
      if (!candidateIsFree) {
        res.status(403).json({
          error: 'Kostenpflichtige Modelle sind gesperrt. Bitte gib zuerst das Passwort ein.',
          code: 'PAID_MODEL_LOCKED',
        });
        return;
      }
    }

    if (typeof secondaryModel === 'string' && secondaryModel.trim().length > 0 && !paidUnlocked) {
      const candidateIsFree = await isModelFreeById(secondaryModel.trim());
      if (!candidateIsFree) {
        res.status(403).json({
          error: 'Kostenpflichtige Modelle sind gesperrt. Bitte gib zuerst das Passwort ein.',
          code: 'PAID_MODEL_LOCKED',
        });
        return;
      }
    }

    let nextApiKey = existing?.apiKey;
    let nextKeyInfo = existing?.keyInfo ?? null;

    if (typeof apiKey === 'string' && apiKey.trim().length > 0) {
      const candidateKey = apiKey.trim();
      try {
        const verifyRes = await fetch('https://openrouter.ai/api/v1/auth/key', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${candidateKey}`,
          },
        });

        if (!verifyRes.ok) {
          const errText = await verifyRes.text().catch(() => '');
          res.status(400).json({
            error:
              verifyRes.status === 401 || verifyRes.status === 403
                ? 'Der OpenRouter API-Schlüssel wurde abgelehnt. Bitte prüfe den Schlüssel.'
                : `OpenRouter-Prüfung fehlgeschlagen (HTTP ${verifyRes.status}). ${errText}`.trim(),
          });
          return;
        }

        const verifyJson = (await verifyRes.json().catch(() => null)) as {
          data?: {
            label?: string | null;
            limit?: number | null;
            usage?: number | null;
            is_free_tier?: boolean | null;
          };
        } | null;

        nextApiKey = candidateKey;
        nextKeyInfo = verifyJson?.data
          ? {
              label: verifyJson.data.label ?? null,
              limit: verifyJson.data.limit ?? null,
              usage: verifyJson.data.usage ?? null,
              isFreeTier: verifyJson.data.is_free_tier ?? null,
            }
          : null;
      } catch (err) {
        res.status(502).json({
          error: `Verbindung zu OpenRouter fehlgeschlagen: ${err instanceof Error ? err.message : 'Unbekannter Fehler'}`,
        });
        return;
      }
    }

    const nextModel =
      typeof model === 'string' && model.trim().length > 0
        ? model.trim()
        : existing?.model || DEFAULT_MODEL;

    const nextDualReview =
      typeof dualReviewEnabled === 'boolean'
        ? dualReviewEnabled
        : Boolean(existing?.dualReviewEnabled);

    const nextSecondaryModel =
      typeof secondaryModel === 'string' && secondaryModel.trim().length > 0
        ? secondaryModel.trim()
        : existing?.secondaryModel || DEFAULT_MODEL;

    const nextEnforceZdr =
      typeof enforceZdr === 'boolean'
        ? enforceZdr
        : Boolean(existing?.enforceZdr);

    const payload: StoredOpenRouterConfig = {
      apiKey: nextApiKey,
      model: nextModel,
      dualReviewEnabled: nextDualReview,
      secondaryModel: nextSecondaryModel,
      enforceZdr: nextEnforceZdr,
      paidUnlocked,
      keyInfo: nextKeyInfo,
      updatedAt: new Date().toISOString(),
    };

    const sealed = sealPayload(payload);
    setSecureCookie(req, res, 'ts_or_cfg', sealed, 60 * 60 * 24 * 30);

    const envKey = (process.env.OPENROUTER_API_KEY || '').trim();
    const hasEnvKey = Boolean(envKey && envKey !== 'MY_OPENROUTER_API_KEY');
    const activeKey = nextApiKey || (hasEnvKey ? envKey : null);

    res.json({
      configured: Boolean(activeKey),
      source: nextApiKey ? 'session' : hasEnvKey ? 'env' : 'none',
      keyPreview: activeKey ? maskApiKey(activeKey) : null,
      model: nextModel,
      dualReviewEnabled: nextDualReview,
      secondaryModel: nextSecondaryModel,
      enforceZdr: nextEnforceZdr,
      paidModelsUnlocked: paidUnlocked,
      paidModelsPasswordConfigured: isPaidPasswordConfigured(),
      keyInfo: nextApiKey ? nextKeyInfo : null,
    });
  });

  app.delete('/api/openrouter/config', (req: Request, res: Response) => {
    ensureSessionId(req, res);
    const cookies = parseCookies(req);
    const existingSealed = cookies['ts_or_cfg'];
    const existing = existingSealed ? unsealPayload(existingSealed) : null;
    const paidUnlocked = Boolean(existing?.paidUnlocked);

    if (
      existing?.model ||
      paidUnlocked ||
      existing?.dualReviewEnabled ||
      existing?.secondaryModel ||
      existing?.enforceZdr
    ) {
      const sealed = sealPayload({
        model: existing?.model || DEFAULT_MODEL,
        dualReviewEnabled: Boolean(existing?.dualReviewEnabled),
        secondaryModel: existing?.secondaryModel || DEFAULT_MODEL,
        enforceZdr: Boolean(existing?.enforceZdr),
        paidUnlocked,
        updatedAt: new Date().toISOString(),
      });
      setSecureCookie(req, res, 'ts_or_cfg', sealed, 60 * 60 * 24 * 30);
    } else {
      clearSecureCookie(req, res, 'ts_or_cfg');
    }

    const envKey = (process.env.OPENROUTER_API_KEY || '').trim();
    const hasEnvKey = Boolean(envKey && envKey !== 'MY_OPENROUTER_API_KEY');

    res.json({
      configured: hasEnvKey,
      source: hasEnvKey ? 'env' : 'none',
      keyPreview: hasEnvKey ? maskApiKey(envKey) : null,
      model: existing?.model || DEFAULT_MODEL,
      dualReviewEnabled: Boolean(existing?.dualReviewEnabled),
      secondaryModel: existing?.secondaryModel || DEFAULT_MODEL,
      enforceZdr: Boolean(existing?.enforceZdr),
      paidModelsUnlocked: paidUnlocked,
      paidModelsPasswordConfigured: isPaidPasswordConfigured(),
      keyInfo: null,
    });
  });

  app.get('/api/openrouter/models', async (_req: Request, res: Response) => {
    try {
      const models = await getModelsCatalog();
      res.json({ models });
    } catch (err) {
      res.status(502).json({
        error: `Fehler beim Abrufen der OpenRouter-Modelle: ${err instanceof Error ? err.message : 'Unbekannter Fehler'}`,
      });
    }
  });

  app.post('/api/rewrite', async (req: Request, res: Response) => {
    const auth = resolveOpenRouterAuth(req);
    if (!auth.apiKey) {
      res.status(401).json({ error: 'Kein OpenRouter API-Schlüssel hinterlegt.' });
      return;
    }

    const {
      text,
      task = 'rewrite',
      sourceLang = 'auto',
      targetLang = 'en-US',
      tone = 'neutral',
      mode = 'style',
      style = 'ausgewogen',
      model: requestedModel,
      verify = false,
      originalText,
      previousContext,
      preferences: bodyPreferences,
    } = req.body as {
      text?: string;
      task?: 'rewrite' | 'translate';
      sourceLang?: string;
      targetLang?: string;
      tone?: 'neutral' | 'formal' | 'informal';
      mode?: 'correction' | 'style';
      style?: string;
      model?: string;
      verify?: boolean;
      originalText?: string;
      previousContext?: string;
      preferences?: PromptPreferencesInput;
    };

    const targetModel =
      typeof requestedModel === 'string' && requestedModel.trim().length > 0
        ? requestedModel.trim()
        : auth.model;

    if (!auth.paidUnlocked && !(await isModelFreeById(targetModel))) {
      res.status(403).json({
        error: 'Kostenpflichtige Modelle sind gesperrt. Bitte Passwort eingeben.',
        code: 'PAID_MODEL_LOCKED',
      });
      return;
    }

    if (typeof text !== 'string' || text.trim().length === 0) {
      res.status(400).json({ error: 'Bitte gib einen Text zur Bearbeitung ein.' });
      return;
    }

    if (text.length > 40000) {
      res.status(400).json({ error: 'Der Text überschreitet das Limit von 40.000 Zeichen.' });
      return;
    }

    const sid = ensureSessionId(req, res);
    const activePreferences = bodyPreferences ? sanitizePreferences(bodyPreferences) : readPreferences(sid);

    const normalizedMode = mode === 'correction' ? 'correction' : 'style';
    const promptConfig =
      task === 'translate'
        ? verify
          ? buildTranslationVerificationPrompts(targetLang, tone, activePreferences)
          : buildTranslationPrompts(sourceLang, targetLang, tone, previousContext, activePreferences)
        : verify
          ? buildVerificationPrompts(sourceLang, normalizedMode, style, activePreferences)
          : buildRewritePrompts(sourceLang, normalizedMode, style, previousContext, activePreferences);

    const userContent = verify
      ? `Originaltext:\n"""\n${(originalText || text).slice(0, 40000)}\n"""\n\n${
          task === 'translate' ? 'Zu prüfender Übersetzungsentwurf' : 'Zu prüfender Entwurf'
        }:\n"""\n${text}\n"""`
      : text;

    const abortController = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) {
        abortController.abort();
      }
    });

    try {
      const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host') || 'localhost:3000'}`;
      const baseBody = {
        model: targetModel,
        stream: true,
        temperature: promptConfig.temperature,
        provider: auth.enforceZdr
          ? { sort: 'latency', zdr: true, data_collection: 'deny' }
          : { sort: 'latency' },
        messages: [
          { role: 'system', content: promptConfig.system },
          { role: 'user', content: userContent },
        ],
      };

      const { upstream, errPreview } = await fetchOpenRouterChatWithRetry({
        apiKey: auth.apiKey,
        appUrl,
        baseBody,
        signal: abortController.signal,
        maxRetries: 2,
      });

      if (errPreview !== undefined) {
        let message = `OpenRouter-Fehler (HTTP 400)`;
        try {
          const parsed = JSON.parse(errPreview) as { error?: { message?: string } };
          if (parsed?.error?.message) message = parsed.error.message;
        } catch {
          if (errPreview) message = `${message}: ${errPreview.slice(0, 240)}`;
        }
        res.status(400).json({ error: message });
        return;
      }

      if (!upstream.ok || !upstream.body) {
        const errBody = await upstream.text().catch(() => '');
        let message = `OpenRouter-Fehler (HTTP ${upstream.status})`;
        try {
          const parsed = JSON.parse(errBody) as { error?: { message?: string } };
          if (parsed?.error?.message) {
            message = parsed.error.message;
          }
        } catch {
          if (errBody) message = `${message}: ${errBody.slice(0, 240)}`;
        }
        res.status(upstream.status >= 400 ? upstream.status : 502).json({ error: message });
        return;
      }

      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders?.();

      const reader = upstream.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

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
          if (payload === '[DONE]') {
            res.write(`data: ${JSON.stringify({ done: true, model: targetModel })}\n\n`);
            continue;
          }

          try {
            const parsed = JSON.parse(payload) as {
              choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }>;
              error?: { message?: string };
            };
            if (parsed.error?.message) {
              res.write(`data: ${JSON.stringify({ error: parsed.error.message })}\n\n`);
              break;
            }
            const delta = parsed.choices?.[0]?.delta?.content;
            if (typeof delta === 'string' && delta.length > 0) {
              res.write(`data: ${JSON.stringify({ delta })}\n\n`);
            }
          } catch {
            // Ignore malformed SSE comment/keepalive frames
          }
        }
      }

      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ done: true, model: targetModel })}\n\n`);
        res.end();
      }
    } catch (err) {
      if (abortController.signal.aborted) {
        if (!res.writableEnded) {
          res.end();
        }
        return;
      }
      const message = err instanceof Error ? err.message : 'Verbindungsfehler zu OpenRouter.';
      if (!res.headersSent) {
        res.status(502).json({ error: message });
      } else if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
        res.end();
      }
    }
  });

  app.post('/api/alternatives', async (req: Request, res: Response) => {
    const auth = resolveOpenRouterAuth(req);
    if (!auth.apiKey) {
      res.status(401).json({ error: 'Kein OpenRouter API-Schlüssel hinterlegt.' });
      return;
    }

    if (!auth.paidUnlocked && !(await isModelFreeById(auth.model))) {
      res.status(403).json({
        error: 'Kostenpflichtige Modelle sind gesperrt. Bitte Passwort eingeben.',
        code: 'PAID_MODEL_LOCKED',
      });
      return;
    }

    const {
      fullText,
      sentence,
      task = 'rewrite',
      sourceLang = 'auto',
      targetLang = 'en-US',
      tone = 'neutral',
      mode = 'style',
      style = 'ausgewogen',
      preferences: bodyPreferences,
    } = req.body as {
      fullText?: string;
      sentence?: string;
      task?: 'rewrite' | 'translate';
      sourceLang?: string;
      targetLang?: string;
      tone?: 'neutral' | 'formal' | 'informal';
      mode?: 'correction' | 'style';
      style?: string;
      preferences?: PromptPreferencesInput;
    };

    if (!sentence || !fullText) {
      res.status(400).json({ error: 'Satz und Kontext sind erforderlich.' });
      return;
    }

    const sid = ensureSessionId(req, res);
    const activePreferences = bodyPreferences ? sanitizePreferences(bodyPreferences) : readPreferences(sid);
    const customBlock = buildGlossaryAndRulesPromptBlock(activePreferences);

    const langRule =
      task === 'translate'
        ? `Zielsprache: ${TARGET_LANGUAGE_NAMES[targetLang] || targetLang}`
        : LANGUAGE_INSTRUCTIONS[sourceLang] || LANGUAGE_INSTRUCTIONS.auto;
    const styleHint =
      task === 'translate'
        ? TRANSLATION_TONE_INSTRUCTIONS[tone] || TRANSLATION_TONE_INSTRUCTIONS.neutral
        : mode === 'correction'
          ? 'Variiere nur minimal und bleibe eng am ursprünglichen Tonfall.'
          : STYLE_INSTRUCTIONS[style] || STYLE_INSTRUCTIONS.ausgewogen;

    try {
      const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host') || 'localhost:3000'}`;
      const payload = {
        model: auth.model,
        temperature: 0.7,
        provider: auth.enforceZdr
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
            content: `Gesamtkontext:\n${fullText}\n\nZu variierender Satz:\n${sentence}`,
          },
        ],
      };

      const { upstream, errPreview } = await fetchOpenRouterChatWithRetry({
        apiKey: auth.apiKey,
        appUrl,
        baseBody: payload,
        maxRetries: 1,
      });

      if (errPreview !== undefined) {
        res.status(400).json({ error: `Alternativen fehlgeschlagen: ${errPreview.slice(0, 200)}` });
        return;
      }

      if (!upstream.ok) {
        const errBody = await upstream.text().catch(() => '');
        res.status(upstream.status).json({ error: `Alternativen fehlgeschlagen: ${errBody.slice(0, 200)}` });
        return;
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
        // Fallback line parse if model returned numbered lines
        alternatives = cleaned
          .split('\n')
          .map((l) => l.replace(/^\d+[.)]\s*/, '').replace(/^["']|["']$/g, '').trim())
          .filter(Boolean)
          .slice(0, 3);
      }

      res.json({ alternatives });
    } catch (err) {
      res.status(502).json({
        error: `Fehler beim Abrufen von Alternativen: ${err instanceof Error ? err.message : 'Unbekannter Fehler'}`,
      });
    }
  });

  app.post('/api/analyze-changes', async (req: Request, res: Response) => {
    const auth = resolveOpenRouterAuth(req);
    if (!auth.apiKey) {
      res.status(401).json({ error: 'Kein OpenRouter API-Schlüssel hinterlegt.' });
      return;
    }

    if (!auth.paidUnlocked && !(await isModelFreeById(auth.model))) {
      res.status(403).json({
        error: 'Kostenpflichtige Modelle sind gesperrt. Bitte Passwort eingeben.',
        code: 'PAID_MODEL_LOCKED',
      });
      return;
    }

    const { sourceText, refinedText, hunks } = req.body as {
      sourceText?: string;
      refinedText?: string;
      hunks?: Array<{ id: string; before: string; after: string }>;
    };

    if (!Array.isArray(hunks) || hunks.length === 0) {
      res.json({ classifications: [] });
      return;
    }

    const compactHunks = hunks.slice(0, 60).map((h) => ({
      id: h.id,
      before: h.before.trim(),
      after: h.after.trim(),
    }));

    try {
      const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host') || 'localhost:3000'}`;
      const payload = {
        model: auth.model,
        temperature: 0,
        provider: auth.enforceZdr
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
              'Gib zu jedem Eintrag außerdem eine knappe deutsche Begründung (max. 5 Wörter).',
              'Antworte ausschließlich als gültiges JSON-Objekt ohne Markdown-Codeblock:',
              '{"classifications":[{"id":"...","category":"rechtschreibung|grammatik|zeichensetzung|stil|klarheit","reason":"..."}]}',
            ].join('\n'),
          },
          {
            role: 'user',
            content: JSON.stringify({
              sourcePreview: (sourceText || '').slice(0, 1500),
              refinedPreview: (refinedText || '').slice(0, 1500),
              changes: compactHunks,
            }),
          },
        ],
      };

      let upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${auth.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': appUrl,
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
              Authorization: `Bearer ${auth.apiKey}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': appUrl,
              'X-Title': 'ÜxzWrite & Translate',
            },
            body: JSON.stringify(payload),
          });
        } else {
          res.status(400).json({ error: `Analyse fehlgeschlagen: ${preview.slice(0, 200)}` });
          return;
        }
      }

      if (!upstream.ok) {
        const errBody = await upstream.text().catch(() => '');
        res.status(upstream.status).json({ error: `Analyse fehlgeschlagen: ${errBody.slice(0, 200)}` });
        return;
      }

      const json = (await upstream.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const raw = json.choices?.[0]?.message?.content?.trim() || '';
      const cleaned = raw.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();

      const allowedCategories = new Set([
        'rechtschreibung',
        'grammatik',
        'zeichensetzung',
        'stil',
        'klarheit',
      ]);

      let classifications: Array<{ id: string; category: string; reason: string }> = [];
      try {
        const parsed = JSON.parse(cleaned) as {
          classifications?: Array<{ id?: unknown; category?: unknown; reason?: unknown }>;
        };
        if (Array.isArray(parsed.classifications)) {
          classifications = parsed.classifications
            .filter(
              (item): item is { id: string; category: string; reason?: string } =>
                typeof item.id === 'string' &&
                typeof item.category === 'string' &&
                allowedCategories.has(item.category.toLowerCase())
            )
            .map((item) => ({
              id: item.id,
              category: item.category.toLowerCase(),
              reason: typeof item.reason === 'string' ? item.reason.slice(0, 80) : '',
            }));
        }
      } catch {
        classifications = [];
      }

      res.json({ classifications });
    } catch (err) {
      res.status(502).json({
        error: `Fehler bei der Änderungsanalyse: ${err instanceof Error ? err.message : 'Unbekannter Fehler'}`,
      });
    }
  });

  app.get('/api/history', (req: Request, res: Response) => {
    const sid = ensureSessionId(req, res);
    res.json({ entries: readHistory(sid) });
  });

  app.post('/api/history', (req: Request, res: Response) => {
    const sid = ensureSessionId(req, res);
    const { sourceText, refinedText, sourceLang, targetLang, task, mode, style, model, changes } =
      req.body as Partial<HistoryEntry>;

    if (!sourceText || !refinedText) {
      res.status(400).json({ error: 'Quell- und Zieltext sind erforderlich.' });
      return;
    }

    const existing = readHistory(sid);
    // Avoid saving exact consecutive duplicate
    if (
      existing.length > 0 &&
      existing[0].sourceText === sourceText &&
      existing[0].refinedText === refinedText &&
      existing[0].style === style &&
      existing[0].mode === mode &&
      existing[0].task === task &&
      existing[0].targetLang === targetLang
    ) {
      res.json({ entry: existing[0], entries: existing });
      return;
    }

    const entry: HistoryEntry = {
      id: crypto.randomUUID(),
      sourceText: sourceText.slice(0, 40000),
      refinedText: refinedText.slice(0, 40000),
      sourceLang: sourceLang || 'auto',
      targetLang: typeof targetLang === 'string' && VALID_TARGET_LANGS.has(targetLang) ? targetLang : undefined,
      task: task === 'translate' ? 'translate' : 'rewrite',
      mode: mode === 'correction' ? 'correction' : 'style',
      style: style || 'ausgewogen',
      model: model || DEFAULT_MODEL,
      changes: Array.isArray(changes) ? changes.slice(0, 100) : undefined,
      createdAt: new Date().toISOString(),
    };

    const next = [entry, ...existing].slice(0, 50);
    writeHistory(sid, next);
    res.status(201).json({ entry, entries: next });
  });

  app.delete('/api/history/:id', (req: Request, res: Response) => {
    const sid = ensureSessionId(req, res);
    const { id } = req.params;
    const existing = readHistory(sid);
    const next = existing.filter((item) => item.id !== id);
    writeHistory(sid, next);
    res.json({ entries: next });
  });

  app.delete('/api/history', (req: Request, res: Response) => {
    const sid = ensureSessionId(req, res);
    writeHistory(sid, []);
    res.json({ entries: [] });
  });

  app.get('/api/preferences', (req: Request, res: Response) => {
    const sid = ensureSessionId(req, res);
    res.json(readPreferences(sid));
  });

  app.put('/api/preferences', (req: Request, res: Response) => {
    const sid = ensureSessionId(req, res);
    const saved = writePreferences(sid, req.body);
    res.json(saved);
  });

  if (IS_PROD) {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ÜxzWrite & Translate server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start ÜxzWrite & Translate server:', err);
  process.exit(1);
});
