import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import type { Request, Response } from 'express';

import {
  API_PROVIDERS,
  getProviderDefinition,
  isModelFreeForProvider,
  isValidProviderId,
  normalizeModelsCatalogResponse,
  resolveProviderBaseUrl,
  sanitizeProviderApiKey,
} from './src/lib/providers.ts';
import type { ApiProviderId, ProviderCatalogModel } from './src/lib/providers.ts';
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
  provider?: ApiProviderId;
  customBaseUrl?: string;
  apiKey?: string;
  apiKeys?: Partial<Record<ApiProviderId, string>>;
  model?: string;
  modelsByProvider?: Partial<Record<ApiProviderId, string>>;
  dualReviewEnabled?: boolean;
  secondaryModel?: string;
  secondaryModelsByProvider?: Partial<Record<ApiProviderId, string>>;
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

function getEnvApiKeyForProvider(provider: ApiProviderId): string {
  const envMap: Record<ApiProviderId, string[]> = {
    openrouter: ['OPENROUTER_API_KEY'],
    anthropic: ['ANTHROPIC_API_KEY'],
    openai: ['OPENAI_API_KEY'],
    mistral: ['MISTRAL_API_KEY'],
    deepseek: ['DEEPSEEK_API_KEY'],
    gemini: ['GEMINI_API_KEY'],
    groq: ['GROQ_API_KEY'],
    cerebras: ['CEREBRAS_API_KEY'],
    together: ['TOGETHER_API_KEY'],
    huggingface: ['HF_TOKEN', 'HUGGINGFACE_API_KEY'],
    requesty: ['REQUESTY_API_KEY'],
    xai: ['XAI_API_KEY'],
    custom: ['CUSTOM_API_KEY'],
  };
  const placeholders = new Set(['MY_OPENROUTER_API_KEY', 'MY_GEMINI_API_KEY']);
  for (const varName of envMap[provider] || []) {
    const raw = (process.env[varName] || '').trim();
    if (raw && !placeholders.has(raw) && !raw.startsWith('MY_')) {
      return sanitizeProviderApiKey(raw);
    }
  }
  return '';
}

function getSessionApiKeyForProvider(
  parsed: StoredOpenRouterConfig | null,
  provider: ApiProviderId
): string {
  if (!parsed) return '';
  const fromMap = parsed.apiKeys?.[provider];
  if (fromMap) return sanitizeProviderApiKey(fromMap);
  if (provider === 'openrouter' && parsed.apiKey) {
    return sanitizeProviderApiKey(parsed.apiKey);
  }
  return '';
}

function getConfiguredProvidersList(parsed: StoredOpenRouterConfig | null): ApiProviderId[] {
  const result: ApiProviderId[] = [];
  for (const def of API_PROVIDERS) {
    if (getSessionApiKeyForProvider(parsed, def.id) || getEnvApiKeyForProvider(def.id)) {
      result.push(def.id);
    } else if (def.id === 'custom' && parsed?.customBaseUrl) {
      result.push('custom');
    }
  }
  return result;
}

function maskApiKey(key: string): string {
  const trimmed = key.trim();
  if (trimmed.length <= 12) {
    return '••••' + trimmed.slice(-4);
  }
  return `${trimmed.slice(0, 9)}••••${trimmed.slice(-4)}`;
}

interface ResolvedProviderAuth {
  provider: ApiProviderId;
  customBaseUrl: string;
  configuredProviders: ApiProviderId[];
  apiKey: string | null;
  configured: boolean;
  source: 'session' | 'env' | 'none';
  model: string;
  dualReviewEnabled: boolean;
  secondaryModel: string;
  enforceZdr: boolean;
  paidUnlocked: boolean;
  keyInfo: StoredOpenRouterConfig['keyInfo'];
}

function resolveOpenRouterAuth(req: Request, providerOverride?: ApiProviderId): ResolvedProviderAuth {
  const cookies = parseCookies(req);
  const sealed = cookies['ts_or_cfg'];
  const parsed = sealed ? unsealPayload(sealed) : null;

  const headerProviderRaw = req.header('x-provider-id');
  const provider: ApiProviderId = providerOverride
    ? providerOverride
    : isValidProviderId(parsed?.provider)
      ? parsed.provider
      : isValidProviderId(headerProviderRaw)
        ? headerProviderRaw
        : 'openrouter';

  const def = getProviderDefinition(provider);
  const customBaseUrlHeader = (req.header('x-custom-base-url') || '').trim();
  const customBaseUrl = resolveProviderBaseUrl(
    provider,
    parsed?.customBaseUrl || customBaseUrlHeader || process.env.CUSTOM_BASE_URL
  );

  const sessionKey = getSessionApiKeyForProvider(parsed, provider);
  const headerKey = sanitizeProviderApiKey(
    req.header('x-provider-key') || (provider === 'openrouter' ? req.header('x-openrouter-key') || '' : '')
  );
  const envKey = getEnvApiKeyForProvider(provider);

  const model =
    parsed?.modelsByProvider?.[provider]?.trim() ||
    (provider === (parsed?.provider || 'openrouter') ? parsed?.model?.trim() : '') ||
    (provider === 'openrouter' ? DEFAULT_MODEL : def.defaultModel);

  const secondaryModel =
    parsed?.secondaryModelsByProvider?.[provider]?.trim() ||
    (provider === (parsed?.provider || 'openrouter') ? parsed?.secondaryModel?.trim() : '') ||
    model;

  const dualReviewEnabled = Boolean(parsed?.dualReviewEnabled);
  const enforceZdr = Boolean(parsed?.enforceZdr);
  const paidUnlocked = Boolean(parsed?.paidUnlocked);
  const configuredProviders = getConfiguredProvidersList(parsed);

  if (sessionKey) {
    return {
      provider,
      customBaseUrl,
      configuredProviders,
      apiKey: sessionKey,
      configured: true,
      source: 'session',
      model,
      dualReviewEnabled,
      secondaryModel,
      enforceZdr,
      paidUnlocked,
      keyInfo: provider === 'openrouter' ? parsed?.keyInfo ?? null : null,
    };
  }

  if (headerKey) {
    return {
      provider,
      customBaseUrl,
      configuredProviders: configuredProviders.includes(provider)
        ? configuredProviders
        : [...configuredProviders, provider],
      apiKey: headerKey,
      configured: true,
      source: 'session',
      model,
      dualReviewEnabled,
      secondaryModel,
      enforceZdr,
      paidUnlocked,
      keyInfo: null,
    };
  }

  if (envKey) {
    return {
      provider,
      customBaseUrl,
      configuredProviders,
      apiKey: envKey,
      configured: true,
      source: 'env',
      model,
      dualReviewEnabled,
      secondaryModel,
      enforceZdr,
      paidUnlocked,
      keyInfo: null,
    };
  }

  if (provider === 'custom') {
    return {
      provider,
      customBaseUrl,
      configuredProviders: configuredProviders.includes('custom')
        ? configuredProviders
        : [...configuredProviders, 'custom'],
      apiKey: null,
      configured: Boolean(customBaseUrl),
      source: parsed?.customBaseUrl || customBaseUrlHeader ? 'session' : 'none',
      model,
      dualReviewEnabled,
      secondaryModel,
      enforceZdr,
      paidUnlocked,
      keyInfo: null,
    };
  }

  return {
    provider,
    customBaseUrl,
    configuredProviders,
    apiKey: null,
    configured: false,
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

const modelsCacheMap = new Map<string, { fetchedAt: number; data: CatalogModel[] }>();

async function getModelsCatalog(
  providerId: ApiProviderId = 'openrouter',
  apiKey?: string | null,
  customBaseUrl?: string | null
): Promise<CatalogModel[]> {
  const def = getProviderDefinition(providerId);
  const baseUrl = resolveProviderBaseUrl(providerId, customBaseUrl);
  const cacheKey = `${providerId}|${baseUrl}|${apiKey ? 'auth' : 'pub'}`;
  const now = Date.now();
  const cached = modelsCacheMap.get(cacheKey);
  if (cached && now - cached.fetchedAt < 10 * 60 * 1000) {
    return cached.data;
  }

  if (!apiKey && !def.supportsPublicModels && providerId !== 'custom') {
    return def.fallbackModels;
  }

  try {
    const headers: Record<string, string> = {};
    if (providerId === 'anthropic') {
      if (!apiKey) return def.fallbackModels;
      headers['x-api-key'] = apiKey;
      headers['anthropic-version'] = '2023-06-01';
    } else if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const upstream = await fetch(`${baseUrl}/models`, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(8000),
    });

    if (!upstream.ok) {
      return def.fallbackModels;
    }

    const json = await upstream.json();
    const normalized: CatalogModel[] = normalizeModelsCatalogResponse(providerId, json);
    const result = normalized.length > 0 ? normalized : def.fallbackModels;
    modelsCacheMap.set(cacheKey, { fetchedAt: now, data: result });
    return result;
  } catch {
    return def.fallbackModels;
  }
}

async function isModelFreeById(
  modelId: string,
  providerId: ApiProviderId = 'openrouter',
  apiKey?: string | null,
  customBaseUrl?: string | null
): Promise<boolean> {
  const normalized = modelId.trim();
  if (providerId === 'custom') return true;
  if (providerId === 'openrouter' && (normalized === 'openrouter/free' || normalized.endsWith(':free'))) {
    return true;
  }
  try {
    const catalog = await getModelsCatalog(providerId, apiKey, customBaseUrl);
    const match = catalog.find((m) => m.id === normalized);
    if (!match) return false;
    return isModelFreeForProvider(match, providerId);
  } catch {
    return false;
  }
}

function shouldEnforcePaidLockServer(params: {
  provider: ApiProviderId;
  source: 'session' | 'env' | 'none';
  paidUnlocked: boolean;
  modelIsFree: boolean;
}): boolean {
  if (params.paidUnlocked || params.modelIsFree) return false;
  if (params.provider === 'custom') return false;
  if (params.provider === 'openrouter') return true;
  if (params.source === 'env') return true;
  return isPaidPasswordConfigured();
}

async function verifyProviderCredentialsServer(params: {
  provider: ApiProviderId;
  apiKey?: string;
  customBaseUrl?: string;
}): Promise<
  | { ok: true; keyInfo: StoredOpenRouterConfig['keyInfo'] }
  | { ok: false; status: number; error: string }
> {
  const def = getProviderDefinition(params.provider);
  const baseUrl = resolveProviderBaseUrl(params.provider, params.customBaseUrl);
  const key = params.apiKey ? sanitizeProviderApiKey(params.apiKey) : '';

  if (!key && !def.optionalKey) {
    return { ok: false, status: 400, error: `Der ${def.name} API-Schlüssel ist leer oder ungültig formatiert.` };
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
          status: 400,
          error:
            verifyRes.status === 401 || verifyRes.status === 403
              ? 'Der OpenRouter API-Schlüssel wurde abgelehnt oder ist ungültig formatiert (bitte nur den Schlüssel z. B. sk-or-v1-… ohne Anführungszeichen oder „Bearer“ einfügen).'
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
          status: 400,
          error: 'Hugging Face Token wurde abgelehnt (401/403). Bitte prüfe deinen hf_… Token mit Inference-Berechtigung.',
        };
      }
      const who = (await verifyRes.json().catch(() => null)) as { name?: string } | null;
      return {
        ok: true,
        keyInfo: who?.name ? { label: who.name } : null,
      };
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
          status: 400,
          error: `Requesty API-Schlüssel wurde abgelehnt (HTTP ${probeRes.status}).`,
        };
      }
      return { ok: true, keyInfo: null };
    }

    const headers: Record<string, string> = {};
    if (params.provider === 'anthropic') {
      headers['x-api-key'] = key;
      headers['anthropic-version'] = '2023-06-01';
    } else if (key) {
      headers['Authorization'] = `Bearer ${key}`;
    }

    const verifyRes = await fetch(`${baseUrl}/models`, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(8000),
    });

    if (verifyRes.status === 401 || verifyRes.status === 403) {
      return {
        ok: false,
        status: 400,
        error: `${def.name} API-Schlüssel wurde abgelehnt (HTTP ${verifyRes.status}).`,
      };
    }

    if (!verifyRes.ok) {
      const errText = await verifyRes.text().catch(() => '');
      if (params.provider === 'gemini' && /api[_\s]*key|permission/i.test(errText)) {
        return {
          ok: false,
          status: 400,
          error: 'Der Google Gemini API-Schlüssel ist ungültig.',
        };
      }
      if (params.provider === 'custom') {
        if (verifyRes.status === 404) {
          return { ok: true, keyInfo: null };
        }
        return {
          ok: false,
          status: 400,
          error: `Custom-Endpunkt unter ${baseUrl} antwortete mit HTTP ${verifyRes.status}.`,
        };
      }
      return {
        ok: false,
        status: 400,
        error: `${def.name}-Prüfung fehlgeschlagen (HTTP ${verifyRes.status}). ${errText.slice(0, 160)}`.trim(),
      };
    }

    return { ok: true, keyInfo: null };
  } catch (err) {
    return {
      ok: false,
      status: 502,
      error: `Verbindung zu ${def.name} fehlgeschlagen: ${err instanceof Error ? err.message : 'Unbekannter Fehler'}`,
    };
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
  return (attempt === 0 ? 2500 : 5500) + Math.floor(Math.random() * 500);
}

async function verifyOpenRouterKeyValid(apiKey: string, signal?: AbortSignal): Promise<boolean> {
  try {
    const res = await fetch('https://openrouter.ai/api/v1/auth/key', {
      method: 'GET',
      signal,
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function fetchProviderChatWithRetry(params: {
  provider: ApiProviderId;
  customBaseUrl?: string;
  apiKey: string | null;
  appUrl: string;
  model: string;
  temperature: number;
  system: string;
  userContent: string;
  stream: boolean;
  enforceZdr: boolean;
  signal?: AbortSignal;
  maxRetries?: number;
}): Promise<{ upstream: Awaited<ReturnType<typeof fetch>>; errPreview?: string; protocol: 'openai' | 'anthropic' }> {
  const def = getProviderDefinition(params.provider);
  const baseUrl = resolveProviderBaseUrl(params.provider, params.customBaseUrl);
  const maxRetries = params.maxRetries ?? 2;

  if (def.protocol === 'anthropic') {
    const bodyPayload = {
      model: params.model,
      max_tokens: 8192,
      stream: params.stream,
      temperature: Math.min(1, Math.max(0, params.temperature)),
      system: params.system,
      messages: [{ role: 'user', content: params.userContent }],
    };

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const upstream = await fetch(`${baseUrl}/messages`, {
        method: 'POST',
        signal: params.signal,
        headers: {
          'x-api-key': params.apiKey || '',
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify(bodyPayload),
      });

      if ((upstream.status === 429 || upstream.status === 503 || upstream.status === 529) && attempt < maxRetries) {
        const errText = await upstream.text().catch(() => '');
        const waitMs = parseServerRetryAfterMs(upstream.headers, errText, attempt);
        await sleepWithSignal(waitMs, params.signal);
        continue;
      }

      return { upstream, protocol: 'anthropic' };
    }
    throw new Error(`${def.name}-Anfrage nach Wiederholungen fehlgeschlagen.`);
  }

  // OpenAI-compatible protocol
  const isOpenRouter = params.provider === 'openrouter';
  let includeReasoningNone = isOpenRouter;
  let includeTemperature = true;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const coreBody: Record<string, unknown> = {
      model: params.model,
      stream: params.stream,
      messages: [
        { role: 'system', content: params.system },
        { role: 'user', content: params.userContent },
      ],
    };
    if (includeTemperature) {
      coreBody.temperature = params.temperature;
    }
    if (isOpenRouter) {
      coreBody.provider = params.enforceZdr
        ? { sort: 'latency', zdr: true, data_collection: 'deny' }
        : { sort: 'latency' };
      if (includeReasoningNone) {
        coreBody.reasoning = { effort: 'none' };
      }
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (params.apiKey) {
      headers['Authorization'] = `Bearer ${params.apiKey}`;
    }
    if (isOpenRouter) {
      headers['HTTP-Referer'] = params.appUrl;
      headers['X-Title'] = 'uxz Write & Translate';
    }

    let upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      signal: params.signal,
      headers,
      body: JSON.stringify(coreBody),
    });

    if (upstream.status === 400) {
      const preview = await upstream.text().catch(() => '');
      if (includeReasoningNone && /reasoning|effort/i.test(preview)) {
        includeReasoningNone = false;
        delete coreBody.reasoning;
        upstream = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          signal: params.signal,
          headers,
          body: JSON.stringify(coreBody),
        });
      } else if (includeTemperature && /temperature/i.test(preview)) {
        includeTemperature = false;
        delete coreBody.temperature;
        upstream = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          signal: params.signal,
          headers,
          body: JSON.stringify(coreBody),
        });
      } else {
        return { upstream, errPreview: preview, protocol: 'openai' };
      }
    }

    if (
      isOpenRouter &&
      upstream.status === 401 &&
      attempt < maxRetries &&
      params.model === 'openrouter/free' &&
      params.apiKey
    ) {
      const errPeek = await upstream.clone().text().catch(() => '');
      if (/missing auth|authentication header|no cookie auth/i.test(errPeek)) {
        const keyValid = await verifyOpenRouterKeyValid(params.apiKey, params.signal);
        if (keyValid) {
          await sleepWithSignal(600, params.signal);
          continue;
        }
      }
    }

    if ((upstream.status === 429 || upstream.status === 503) && attempt < maxRetries) {
      const errText = await upstream.text().catch(() => '');
      const waitMs = parseServerRetryAfterMs(upstream.headers, errText, attempt);
      await sleepWithSignal(waitMs, params.signal);
      continue;
    }

    return { upstream, protocol: 'openai' };
  }

  throw new Error(`${def.name}-Anfrage nach Wiederholungen fehlgeschlagen.`);
}

function extractTextFromNonStreamingResponse(protocol: 'openai' | 'anthropic', json: unknown): string {
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

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/openrouter/status', async (req: Request, res: Response) => {
    ensureSessionId(req, res);
    const reqProvider = isValidProviderId(req.query.provider) ? req.query.provider : undefined;
    const auth = resolveOpenRouterAuth(req, reqProvider);
    const def = getProviderDefinition(auth.provider);
    const modelIsFree = await isModelFreeById(auth.model, auth.provider, auth.apiKey, auth.customBaseUrl);
    const secondaryIsFree = await isModelFreeById(
      auth.secondaryModel,
      auth.provider,
      auth.apiKey,
      auth.customBaseUrl
    );
    const needsPrimaryLock = shouldEnforcePaidLockServer({
      provider: auth.provider,
      source: auth.source,
      paidUnlocked: auth.paidUnlocked,
      modelIsFree,
    });
    const needsSecondaryLock = shouldEnforcePaidLockServer({
      provider: auth.provider,
      source: auth.source,
      paidUnlocked: auth.paidUnlocked,
      modelIsFree: secondaryIsFree,
    });
    const fallbackModel = auth.provider === 'openrouter' ? DEFAULT_MODEL : def.defaultModel;
    res.json({
      configured: auth.configured,
      provider: auth.provider,
      customBaseUrl: auth.customBaseUrl,
      configuredProviders: auth.configuredProviders,
      source: auth.source,
      keyPreview: auth.apiKey ? maskApiKey(auth.apiKey) : null,
      model: needsPrimaryLock ? fallbackModel : auth.model,
      dualReviewEnabled: auth.dualReviewEnabled,
      secondaryModel: needsSecondaryLock ? fallbackModel : auth.secondaryModel,
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
      ...existing,
      paidUnlocked: true,
      updatedAt: new Date().toISOString(),
    };

    const sealed = sealPayload(payload);
    setSecureCookie(req, res, 'ts_or_cfg', sealed, 60 * 60 * 24 * 30);

    const auth = resolveOpenRouterAuth(req);
    res.json({
      configured: auth.configured,
      provider: auth.provider,
      customBaseUrl: auth.customBaseUrl,
      configuredProviders: auth.configuredProviders,
      source: auth.source,
      keyPreview: auth.apiKey ? maskApiKey(auth.apiKey) : null,
      model: auth.model,
      dualReviewEnabled: auth.dualReviewEnabled,
      secondaryModel: auth.secondaryModel,
      enforceZdr: auth.enforceZdr,
      paidModelsUnlocked: true,
      paidModelsPasswordConfigured: true,
      keyInfo: auth.keyInfo ?? null,
    });
  });

  app.post('/api/openrouter/lock-paid', async (req: Request, res: Response) => {
    ensureSessionId(req, res);
    const cookies = parseCookies(req);
    const existingSealed = cookies['ts_or_cfg'];
    const existing = existingSealed ? unsealPayload(existingSealed) : null;

    const provider: ApiProviderId = isValidProviderId(existing?.provider) ? existing.provider : 'openrouter';
    const def = getProviderDefinition(provider);
    const fallbackModel = provider === 'openrouter' ? DEFAULT_MODEL : def.defaultModel;
    const authPre = resolveOpenRouterAuth(req, provider);

    const keepModel = await isModelFreeById(authPre.model, provider, authPre.apiKey, authPre.customBaseUrl);
    const nextModel = keepModel ? authPre.model : fallbackModel;

    const keepSecondary = await isModelFreeById(
      authPre.secondaryModel,
      provider,
      authPre.apiKey,
      authPre.customBaseUrl
    );
    const nextSecondary = keepSecondary ? authPre.secondaryModel : fallbackModel;

    const modelsByProvider = { ...(existing?.modelsByProvider || {}), [provider]: nextModel };
    const secondaryModelsByProvider = {
      ...(existing?.secondaryModelsByProvider || {}),
      [provider]: nextSecondary,
    };

    const payload: StoredOpenRouterConfig = {
      ...existing,
      provider,
      model: nextModel,
      secondaryModel: nextSecondary,
      modelsByProvider,
      secondaryModelsByProvider,
      paidUnlocked: false,
      updatedAt: new Date().toISOString(),
    };

    const sealed = sealPayload(payload);
    setSecureCookie(req, res, 'ts_or_cfg', sealed, 60 * 60 * 24 * 30);

    res.json({
      configured: authPre.configured,
      provider,
      customBaseUrl: authPre.customBaseUrl,
      configuredProviders: authPre.configuredProviders,
      source: authPre.source,
      keyPreview: authPre.apiKey ? maskApiKey(authPre.apiKey) : null,
      model: nextModel,
      dualReviewEnabled: authPre.dualReviewEnabled,
      secondaryModel: nextSecondary,
      enforceZdr: authPre.enforceZdr,
      paidModelsUnlocked: false,
      paidModelsPasswordConfigured: isPaidPasswordConfigured(),
      keyInfo: authPre.keyInfo ?? null,
    });
  });

  app.post('/api/openrouter/config', async (req: Request, res: Response) => {
    ensureSessionId(req, res);
    const { provider: reqProvider, customBaseUrl, apiKey, model, dualReviewEnabled, secondaryModel, enforceZdr } =
      req.body as {
        provider?: string;
        customBaseUrl?: string;
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

    const activeProvider: ApiProviderId = isValidProviderId(reqProvider)
      ? reqProvider
      : isValidProviderId(existing?.provider)
        ? existing.provider
        : isValidProviderId(req.header('x-provider-id'))
          ? (req.header('x-provider-id') as ApiProviderId)
          : 'openrouter';

    const def = getProviderDefinition(activeProvider);
    const nextCustomBaseUrl =
      typeof customBaseUrl === 'string' && customBaseUrl.trim().length > 0
        ? resolveProviderBaseUrl(activeProvider, customBaseUrl)
        : existing?.customBaseUrl
          ? resolveProviderBaseUrl(activeProvider, existing.customBaseUrl)
          : def.defaultBaseUrl;

    const apiKeysMap: Partial<Record<ApiProviderId, string>> = { ...(existing?.apiKeys || {}) };
    if (existing?.apiKey && !apiKeysMap.openrouter) {
      apiKeysMap.openrouter = existing.apiKey;
    }

    let nextKeyInfo = activeProvider === 'openrouter' ? existing?.keyInfo ?? null : null;

    if (typeof apiKey === 'string' && apiKey.trim().length > 0) {
      const candidateKey = sanitizeProviderApiKey(apiKey);
      const check = await verifyProviderCredentialsServer({
        provider: activeProvider,
        apiKey: candidateKey,
        customBaseUrl: nextCustomBaseUrl,
      });
      if (!check.ok) {
        res.status(check.status).json({ error: check.error });
        return;
      }
      apiKeysMap[activeProvider] = candidateKey;
      if (activeProvider === 'openrouter') {
        nextKeyInfo = check.keyInfo ?? null;
      }
    }

    const activeKeyForProvider =
      apiKeysMap[activeProvider] ||
      sanitizeProviderApiKey(
        req.header('x-provider-key') || (activeProvider === 'openrouter' ? req.header('x-openrouter-key') || '' : '')
      ) ||
      getEnvApiKeyForProvider(activeProvider) ||
      null;

    const keySource: 'session' | 'env' | 'none' = apiKeysMap[activeProvider]
      ? 'session'
      : getEnvApiKeyForProvider(activeProvider)
        ? 'env'
        : activeProvider === 'custom'
          ? 'session'
          : 'none';

    const switchingProvider = Boolean(reqProvider && reqProvider !== (existing?.provider || 'openrouter'));
    const modelsByProvider = { ...(existing?.modelsByProvider || {}) };
    const secondaryModelsByProvider = { ...(existing?.secondaryModelsByProvider || {}) };

    const defaultForProvider = activeProvider === 'openrouter' ? DEFAULT_MODEL : def.defaultModel;
    const prevModelForProvider =
      modelsByProvider[activeProvider] ||
      (!switchingProvider && existing?.model ? existing.model : defaultForProvider);
    const prevSecondaryForProvider =
      secondaryModelsByProvider[activeProvider] ||
      (!switchingProvider && existing?.secondaryModel ? existing.secondaryModel : defaultForProvider);

    const nextModel =
      typeof model === 'string' && model.trim().length > 0 ? model.trim() : prevModelForProvider;
    const nextSecondaryModel =
      typeof secondaryModel === 'string' && secondaryModel.trim().length > 0
        ? secondaryModel.trim()
        : prevSecondaryForProvider;

    if (typeof model === 'string' && model.trim().length > 0) {
      const candidateIsFree = await isModelFreeById(
        nextModel,
        activeProvider,
        activeKeyForProvider,
        nextCustomBaseUrl
      );
      if (
        shouldEnforcePaidLockServer({
          provider: activeProvider,
          source: keySource,
          paidUnlocked,
          modelIsFree: candidateIsFree,
        })
      ) {
        res.status(403).json({
          error: 'Kostenpflichtige Modelle sind gesperrt. Bitte gib zuerst das Passwort ein.',
          code: 'PAID_MODEL_LOCKED',
        });
        return;
      }
    }

    if (typeof secondaryModel === 'string' && secondaryModel.trim().length > 0) {
      const candidateIsFree = await isModelFreeById(
        nextSecondaryModel,
        activeProvider,
        activeKeyForProvider,
        nextCustomBaseUrl
      );
      if (
        shouldEnforcePaidLockServer({
          provider: activeProvider,
          source: keySource,
          paidUnlocked,
          modelIsFree: candidateIsFree,
        })
      ) {
        res.status(403).json({
          error: 'Kostenpflichtige Modelle sind gesperrt. Bitte gib zuerst das Passwort ein.',
          code: 'PAID_MODEL_LOCKED',
        });
        return;
      }
    }

    modelsByProvider[activeProvider] = nextModel;
    secondaryModelsByProvider[activeProvider] = nextSecondaryModel;

    const nextDualReview =
      typeof dualReviewEnabled === 'boolean' ? dualReviewEnabled : Boolean(existing?.dualReviewEnabled);
    const nextEnforceZdr = typeof enforceZdr === 'boolean' ? enforceZdr : Boolean(existing?.enforceZdr);

    const payload: StoredOpenRouterConfig = {
      provider: activeProvider,
      customBaseUrl: nextCustomBaseUrl,
      apiKey: apiKeysMap.openrouter,
      apiKeys: apiKeysMap,
      model: nextModel,
      modelsByProvider,
      dualReviewEnabled: nextDualReview,
      secondaryModel: nextSecondaryModel,
      secondaryModelsByProvider,
      enforceZdr: nextEnforceZdr,
      paidUnlocked,
      keyInfo: nextKeyInfo,
      updatedAt: new Date().toISOString(),
    };

    const sealed = sealPayload(payload);
    setSecureCookie(req, res, 'ts_or_cfg', sealed, 60 * 60 * 24 * 30);

    const configuredProviders = getConfiguredProvidersList(payload);
    if (activeProvider === 'custom' && !configuredProviders.includes('custom')) {
      configuredProviders.push('custom');
    }

    res.json({
      configured: activeProvider === 'custom' ? true : Boolean(activeKeyForProvider),
      provider: activeProvider,
      customBaseUrl: nextCustomBaseUrl,
      configuredProviders,
      source: keySource,
      keyPreview: activeKeyForProvider ? maskApiKey(activeKeyForProvider) : null,
      model: nextModel,
      dualReviewEnabled: nextDualReview,
      secondaryModel: nextSecondaryModel,
      enforceZdr: nextEnforceZdr,
      paidModelsUnlocked: paidUnlocked,
      paidModelsPasswordConfigured: isPaidPasswordConfigured(),
      keyInfo: activeProvider === 'openrouter' && apiKeysMap.openrouter ? nextKeyInfo : null,
    });
  });

  app.delete('/api/openrouter/config', (req: Request, res: Response) => {
    ensureSessionId(req, res);
    if (req.query.all === 'true') {
      clearSecureCookie(req, res, 'ts_or_cfg');
      const envKey = getEnvApiKeyForProvider('openrouter');
      res.json({
        configured: Boolean(envKey),
        provider: 'openrouter',
        customBaseUrl: resolveProviderBaseUrl('openrouter'),
        configuredProviders: envKey ? ['openrouter'] : [],
        source: envKey ? 'env' : 'none',
        keyPreview: envKey ? maskApiKey(envKey) : null,
        model: DEFAULT_MODEL,
        dualReviewEnabled: false,
        secondaryModel: DEFAULT_MODEL,
        enforceZdr: false,
        paidModelsUnlocked: false,
        paidModelsPasswordConfigured: isPaidPasswordConfigured(),
        keyInfo: null,
      });
      return;
    }

    const cookies = parseCookies(req);
    const existingSealed = cookies['ts_or_cfg'];
    const existing = existingSealed ? unsealPayload(existingSealed) : null;
    const paidUnlocked = Boolean(existing?.paidUnlocked);

    const targetProvider: ApiProviderId = isValidProviderId(req.query.provider)
      ? req.query.provider
      : isValidProviderId(existing?.provider)
        ? existing.provider
        : 'openrouter';

    const apiKeysMap: Partial<Record<ApiProviderId, string>> = { ...(existing?.apiKeys || {}) };
    delete apiKeysMap[targetProvider];

    const payload: StoredOpenRouterConfig = {
      ...existing,
      provider: targetProvider,
      apiKey: targetProvider === 'openrouter' ? undefined : existing?.apiKey,
      apiKeys: apiKeysMap,
      keyInfo: targetProvider === 'openrouter' ? null : existing?.keyInfo ?? null,
      paidUnlocked,
      updatedAt: new Date().toISOString(),
    };

    if (
      Object.keys(apiKeysMap).length > 0 ||
      payload.model ||
      paidUnlocked ||
      payload.dualReviewEnabled ||
      payload.secondaryModel ||
      payload.enforceZdr
    ) {
      const sealed = sealPayload(payload);
      setSecureCookie(req, res, 'ts_or_cfg', sealed, 60 * 60 * 24 * 30);
    } else {
      clearSecureCookie(req, res, 'ts_or_cfg');
    }

    const envKey = getEnvApiKeyForProvider(targetProvider);
    const def = getProviderDefinition(targetProvider);
    const fallbackModel = targetProvider === 'openrouter' ? DEFAULT_MODEL : def.defaultModel;

    res.json({
      configured: targetProvider === 'custom' ? true : Boolean(envKey),
      provider: targetProvider,
      customBaseUrl: resolveProviderBaseUrl(targetProvider, payload.customBaseUrl),
      configuredProviders: getConfiguredProvidersList(payload),
      source: envKey ? 'env' : 'none',
      keyPreview: envKey ? maskApiKey(envKey) : null,
      model: payload.modelsByProvider?.[targetProvider] || payload.model || fallbackModel,
      dualReviewEnabled: Boolean(payload.dualReviewEnabled),
      secondaryModel: payload.secondaryModelsByProvider?.[targetProvider] || payload.secondaryModel || fallbackModel,
      enforceZdr: Boolean(payload.enforceZdr),
      paidModelsUnlocked: paidUnlocked,
      paidModelsPasswordConfigured: isPaidPasswordConfigured(),
      keyInfo: null,
    });
  });

  app.get('/api/openrouter/models', async (req: Request, res: Response) => {
    try {
      const reqProvider = isValidProviderId(req.query.provider) ? req.query.provider : undefined;
      const auth = resolveOpenRouterAuth(req, reqProvider);
      const customBase = typeof req.query.baseUrl === 'string' ? req.query.baseUrl : auth.customBaseUrl;
      const models = await getModelsCatalog(auth.provider, auth.apiKey, customBase);
      res.json({ models, provider: auth.provider });
    } catch (err) {
      res.status(502).json({
        error: `Fehler beim Abrufen der Modelle: ${err instanceof Error ? err.message : 'Unbekannter Fehler'}`,
      });
    }
  });

  app.post('/api/rewrite', async (req: Request, res: Response) => {
    const bodyProvider = isValidProviderId((req.body as { provider?: unknown })?.provider)
      ? ((req.body as { provider: ApiProviderId }).provider)
      : undefined;
    const auth = resolveOpenRouterAuth(req, bodyProvider);
    const def = getProviderDefinition(auth.provider);

    if (!auth.apiKey && !def.optionalKey) {
      res.status(401).json({ error: `Kein ${def.name} API-Schlüssel hinterlegt.` });
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

    const modelIsFree = await isModelFreeById(targetModel, auth.provider, auth.apiKey, auth.customBaseUrl);
    if (
      shouldEnforcePaidLockServer({
        provider: auth.provider,
        source: auth.source,
        paidUnlocked: auth.paidUnlocked,
        modelIsFree,
      })
    ) {
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
      const { upstream, errPreview, protocol } = await fetchProviderChatWithRetry({
        provider: auth.provider,
        customBaseUrl: auth.customBaseUrl,
        apiKey: auth.apiKey,
        appUrl,
        model: targetModel,
        temperature: promptConfig.temperature,
        system: promptConfig.system,
        userContent,
        stream: true,
        enforceZdr: auth.enforceZdr,
        signal: abortController.signal,
        maxRetries: 2,
      });

      if (errPreview !== undefined) {
        let message = `${def.name}-Fehler (HTTP 400)`;
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
        let message = `${def.name}-Fehler (HTTP ${upstream.status})`;
        try {
          const parsed = JSON.parse(errBody) as { error?: { message?: string } };
          if (parsed?.error?.message) {
            message = parsed.error.message;
          }
        } catch {
          if (errBody) message = `${message}: ${errBody.slice(0, 240)}`;
        }
        if (upstream.status === 401 || /missing auth|authentication header|no cookie auth/i.test(message)) {
          message = `${def.name} Authentifizierung fehlgeschlagen (${message}). Bitte prüfe deinen ${def.name} API-Schlüssel im API-Menü.`;
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
            if (protocol === 'anthropic') {
              const parsed = JSON.parse(payload) as {
                type?: string;
                delta?: { type?: string; text?: string };
                error?: { message?: string };
              };
              if (parsed.type === 'error' || parsed.error?.message) {
                res.write(`data: ${JSON.stringify({ error: parsed.error?.message || 'Anthropic Stream-Fehler' })}\n\n`);
                break;
              }
              if (
                parsed.type === 'content_block_delta' &&
                parsed.delta?.type === 'text_delta' &&
                typeof parsed.delta.text === 'string' &&
                parsed.delta.text.length > 0
              ) {
                res.write(`data: ${JSON.stringify({ delta: parsed.delta.text })}\n\n`);
              }
            } else {
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
      const message = err instanceof Error ? err.message : `Verbindungsfehler zu ${def.name}.`;
      if (!res.headersSent) {
        res.status(502).json({ error: message });
      } else if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
        res.end();
      }
    }
  });

  app.post('/api/alternatives', async (req: Request, res: Response) => {
    const bodyProvider = isValidProviderId((req.body as { provider?: unknown })?.provider)
      ? ((req.body as { provider: ApiProviderId }).provider)
      : undefined;
    const auth = resolveOpenRouterAuth(req, bodyProvider);
    const def = getProviderDefinition(auth.provider);

    if (!auth.apiKey && !def.optionalKey) {
      res.status(401).json({ error: `Kein ${def.name} API-Schlüssel hinterlegt.` });
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
      model: requestedModel,
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
      model?: string;
      preferences?: PromptPreferencesInput;
    };

    const targetModel =
      typeof requestedModel === 'string' && requestedModel.trim().length > 0
        ? requestedModel.trim()
        : auth.model;

    const modelIsFree = await isModelFreeById(targetModel, auth.provider, auth.apiKey, auth.customBaseUrl);
    if (
      shouldEnforcePaidLockServer({
        provider: auth.provider,
        source: auth.source,
        paidUnlocked: auth.paidUnlocked,
        modelIsFree,
      })
    ) {
      res.status(403).json({
        error: 'Kostenpflichtige Modelle sind gesperrt. Bitte Passwort eingeben.',
        code: 'PAID_MODEL_LOCKED',
      });
      return;
    }

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

    const systemPrompt = [
      task === 'translate'
        ? 'Du lieferst genau 3 alternative Übersetzungsvarianten für einen markierten Satz im Zieltext.'
        : 'Du lieferst genau 3 alternative Formulierungen für einen markierten Satz im Textkontext.',
      langRule,
      `Stilvorgabe: ${styleHint}`,
      ...(customBlock ? [customBlock] : []),
      'Antworte ausschließlich als gültiges JSON-Objekt im Format: {"alternatives": ["...", "...", "..."]}. Keine Markdown-Codeblöcke, kein Begleittext.',
    ].join('\n');

    try {
      const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host') || 'localhost:3000'}`;
      const { upstream, errPreview, protocol } = await fetchProviderChatWithRetry({
        provider: auth.provider,
        customBaseUrl: auth.customBaseUrl,
        apiKey: auth.apiKey,
        appUrl,
        model: targetModel,
        temperature: 0.7,
        system: systemPrompt,
        userContent: `Gesamtkontext:\n${fullText}\n\nZu variierender Satz:\n${sentence}`,
        stream: false,
        enforceZdr: auth.enforceZdr,
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

      const json = await upstream.json();
      const raw = extractTextFromNonStreamingResponse(protocol, json);
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

      res.json({ alternatives });
    } catch (err) {
      res.status(502).json({
        error: `Fehler beim Abrufen von Alternativen: ${err instanceof Error ? err.message : 'Unbekannter Fehler'}`,
      });
    }
  });

  app.post('/api/analyze-changes', async (req: Request, res: Response) => {
    const bodyProvider = isValidProviderId((req.body as { provider?: unknown })?.provider)
      ? ((req.body as { provider: ApiProviderId }).provider)
      : undefined;
    const auth = resolveOpenRouterAuth(req, bodyProvider);
    const def = getProviderDefinition(auth.provider);

    if (!auth.apiKey && !def.optionalKey) {
      res.status(401).json({ error: `Kein ${def.name} API-Schlüssel hinterlegt.` });
      return;
    }

    const { sourceText, refinedText, hunks, model: requestedModel } = req.body as {
      sourceText?: string;
      refinedText?: string;
      hunks?: Array<{ id: string; before: string; after: string }>;
      model?: string;
    };

    const targetModel =
      typeof requestedModel === 'string' && requestedModel.trim().length > 0
        ? requestedModel.trim()
        : auth.model;

    const modelIsFree = await isModelFreeById(targetModel, auth.provider, auth.apiKey, auth.customBaseUrl);
    if (
      shouldEnforcePaidLockServer({
        provider: auth.provider,
        source: auth.source,
        paidUnlocked: auth.paidUnlocked,
        modelIsFree,
      })
    ) {
      res.status(403).json({
        error: 'Kostenpflichtige Modelle sind gesperrt. Bitte Passwort eingeben.',
        code: 'PAID_MODEL_LOCKED',
      });
      return;
    }

    if (!Array.isArray(hunks) || hunks.length === 0) {
      res.json({ classifications: [] });
      return;
    }

    const compactHunks = hunks.slice(0, 60).map((h) => ({
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
      'Gib zu jedem Eintrag außerdem eine knappe deutsche Begründung (max. 5 Wörter).',
      'Antworte ausschließlich als gültiges JSON-Objekt ohne Markdown-Codeblock:',
      '{"classifications":[{"id":"...","category":"rechtschreibung|grammatik|zeichensetzung|stil|klarheit","reason":"..."}]}',
    ].join('\n');

    try {
      const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host') || 'localhost:3000'}`;
      const { upstream, errPreview, protocol } = await fetchProviderChatWithRetry({
        provider: auth.provider,
        customBaseUrl: auth.customBaseUrl,
        apiKey: auth.apiKey,
        appUrl,
        model: targetModel,
        temperature: 0,
        system: systemPrompt,
        userContent: JSON.stringify({
          sourcePreview: (sourceText || '').slice(0, 1500),
          refinedPreview: (refinedText || '').slice(0, 1500),
          changes: compactHunks,
        }),
        stream: false,
        enforceZdr: auth.enforceZdr,
        maxRetries: 1,
      });

      if (errPreview !== undefined) {
        res.status(400).json({ error: `Analyse fehlgeschlagen: ${errPreview.slice(0, 200)}` });
        return;
      }

      if (!upstream.ok) {
        const errBody = await upstream.text().catch(() => '');
        res.status(upstream.status).json({ error: `Analyse fehlgeschlagen: ${errBody.slice(0, 200)}` });
        return;
      }

      const json = await upstream.json();
      const raw = extractTextFromNonStreamingResponse(protocol, json);
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
