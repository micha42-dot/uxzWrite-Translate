export type ApiProviderId =
  | 'openrouter'
  | 'requesty'
  | 'huggingface'
  | 'together'
  | 'groq'
  | 'cerebras'
  | 'anthropic'
  | 'openai'
  | 'mistral'
  | 'deepseek'
  | 'gemini'
  | 'xai'
  | 'custom';

export type ProviderCategory = 'router' | 'direct' | 'custom';
export type ProviderProtocol = 'openai' | 'anthropic';

export interface ProviderCatalogModel {
  id: string;
  name: string;
  contextLength: number;
  promptPricePer1M: number;
  completionPricePer1M: number;
}

export interface ApiProviderDefinition {
  id: ApiProviderId;
  name: string;
  shortName: string;
  category: ProviderCategory;
  protocol: ProviderProtocol;
  defaultBaseUrl: string;
  baseUrlPresets?: Array<{ labelDe: string; labelEn: string; url: string }>;
  defaultModel: string;
  keyPlaceholder: string;
  docsUrl: string;
  hasFreeTier: boolean;
  optionalKey?: boolean;
  supportsZdr?: boolean;
  supportsPublicModels?: boolean;
  descriptionDe: string;
  descriptionEn: string;
  fallbackModels: ProviderCatalogModel[];
}

export const API_PROVIDERS: ApiProviderDefinition[] = [
  // --- Multi-Model Routers & OpenRouter Alternatives ---
  {
    id: 'openrouter',
    name: 'OpenRouter',
    shortName: 'OPENROUTER',
    category: 'router',
    protocol: 'openai',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openrouter/free',
    keyPlaceholder: 'sk-or-v1-...',
    docsUrl: 'https://openrouter.ai/keys',
    hasFreeTier: true,
    supportsZdr: true,
    supportsPublicModels: true,
    descriptionDe: 'Hunderte Modelle (inkl. :free Router) & Zero-Data-Retention-Filter.',
    descriptionEn: 'Hundreds of models (incl. :free router) & Zero Data Retention routing.',
    fallbackModels: [
      {
        id: 'openrouter/free',
        name: 'Free Models Router',
        contextLength: 200000,
        promptPricePer1M: 0,
        completionPricePer1M: 0,
      },
      {
        id: 'openrouter/auto',
        name: 'Auto Router',
        contextLength: 200000,
        promptPricePer1M: -1,
        completionPricePer1M: -1,
      },
    ],
  },
  {
    id: 'requesty',
    name: 'Requesty',
    shortName: 'REQUESTY',
    category: 'router',
    protocol: 'openai',
    defaultBaseUrl: 'https://router.requesty.ai/v1',
    baseUrlPresets: [
      { labelDe: 'Global (Standard)', labelEn: 'Global (Default)', url: 'https://router.requesty.ai/v1' },
      { labelDe: 'EU-Region (DSGVO)', labelEn: 'EU Region (GDPR)', url: 'https://router.eu.requesty.ai/v1' },
    ],
    defaultModel: 'openai/gpt-4o-mini',
    keyPlaceholder: 'rqsty-...',
    docsUrl: 'https://app.requesty.ai/api-keys',
    hasFreeTier: false,
    supportsPublicModels: true,
    descriptionDe: 'OpenRouter-Alternative mit EU-Endpunkt (router.eu.requesty.ai) & Kostenkontrolle.',
    descriptionEn: 'OpenRouter alternative featuring EU data residency & unified billing.',
    fallbackModels: [
      { id: 'openai/gpt-4o-mini', name: 'OpenAI GPT-4o mini', contextLength: 128000, promptPricePer1M: 0.15, completionPricePer1M: 0.6 },
      { id: 'anthropic/claude-sonnet-4-5', name: 'Claude Sonnet 4.5', contextLength: 200000, promptPricePer1M: 3, completionPricePer1M: 15 },
      { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash', contextLength: 1000000, promptPricePer1M: 0.15, completionPricePer1M: 0.6 },
      { id: 'deepseek/deepseek-chat', name: 'DeepSeek Chat', contextLength: 64000, promptPricePer1M: 0.27, completionPricePer1M: 1.1 },
    ],
  },
  {
    id: 'huggingface',
    name: 'Hugging Face Router',
    shortName: 'HF ROUTER',
    category: 'router',
    protocol: 'openai',
    defaultBaseUrl: 'https://router.huggingface.co/v1',
    defaultModel: 'Qwen/Qwen2.5-72B-Instruct',
    keyPlaceholder: 'hf_...',
    docsUrl: 'https://huggingface.co/settings/tokens',
    hasFreeTier: true,
    supportsPublicModels: true,
    descriptionDe: 'Offener Multi-Provider-Router (Qwen, Llama, DeepSeek) mit gratis Monats-Guthaben.',
    descriptionEn: 'Open-weights multi-provider router (Qwen, Llama, DeepSeek) with free monthly credits.',
    fallbackModels: [
      { id: 'Qwen/Qwen2.5-72B-Instruct', name: 'Qwen 2.5 72B Instruct', contextLength: 32768, promptPricePer1M: 0, completionPricePer1M: 0 },
      { id: 'meta-llama/Llama-3.3-70B-Instruct', name: 'Llama 3.3 70B Instruct', contextLength: 131072, promptPricePer1M: 0, completionPricePer1M: 0 },
      { id: 'deepseek-ai/DeepSeek-V3', name: 'DeepSeek V3', contextLength: 65536, promptPricePer1M: 0, completionPricePer1M: 0 },
      { id: 'mistralai/Mistral-Small-24B-Instruct-2501', name: 'Mistral Small 24B', contextLength: 32768, promptPricePer1M: 0, completionPricePer1M: 0 },
    ],
  },
  {
    id: 'together',
    name: 'Together AI',
    shortName: 'TOGETHER',
    category: 'router',
    protocol: 'openai',
    defaultBaseUrl: 'https://api.together.xyz/v1',
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    keyPlaceholder: 'tgp_v1_...',
    docsUrl: 'https://api.together.xyz/settings/api-keys',
    hasFreeTier: false,
    descriptionDe: 'Schnelle Open-Weight-Modelle (Llama, Qwen, DeepSeek, Mistral) über ein API.',
    descriptionEn: 'Fast open-weight hosting for Llama, Qwen, DeepSeek & Mistral models.',
    fallbackModels: [
      { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', name: 'Llama 3.3 70B Instruct Turbo', contextLength: 131072, promptPricePer1M: 0.88, completionPricePer1M: 0.88 },
      { id: 'Qwen/Qwen2.5-72B-Instruct-Turbo', name: 'Qwen 2.5 72B Instruct Turbo', contextLength: 32768, promptPricePer1M: 1.2, completionPricePer1M: 1.2 },
      { id: 'deepseek-ai/DeepSeek-V3', name: 'DeepSeek V3', contextLength: 65536, promptPricePer1M: 1.25, completionPricePer1M: 1.25 },
      { id: 'mistralai/Mixtral-8x22B-Instruct-v0.1', name: 'Mixtral 8x22B Instruct', contextLength: 65536, promptPricePer1M: 1.2, completionPricePer1M: 1.2 },
    ],
  },
  {
    id: 'groq',
    name: 'Groq',
    shortName: 'GROQ',
    category: 'router',
    protocol: 'openai',
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    keyPlaceholder: 'gsk_...',
    docsUrl: 'https://console.groq.com/keys',
    hasFreeTier: true,
    descriptionDe: 'Extrem niedrige Latenz (LPU) für Llama & Qwen mit kostenlosem Free-Tier.',
    descriptionEn: 'Ultra-low-latency LPU inference for Llama & Qwen with a free tier.',
    fallbackModels: [
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B Versatile', contextLength: 131072, promptPricePer1M: 0, completionPricePer1M: 0 },
      { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant', contextLength: 131072, promptPricePer1M: 0, completionPricePer1M: 0 },
      { id: 'qwen/qwen3-32b', name: 'Qwen 3 32B', contextLength: 131072, promptPricePer1M: 0, completionPricePer1M: 0 },
      { id: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B', contextLength: 131072, promptPricePer1M: 0, completionPricePer1M: 0 },
    ],
  },
  {
    id: 'cerebras',
    name: 'Cerebras',
    shortName: 'CEREBRAS',
    category: 'router',
    protocol: 'openai',
    defaultBaseUrl: 'https://api.cerebras.ai/v1',
    defaultModel: 'llama-3.3-70b',
    keyPlaceholder: 'csk-...',
    docsUrl: 'https://cloud.cerebras.ai/',
    hasFreeTier: true,
    descriptionDe: 'Wafer-Scale-Geschwindigkeit mit kostenlosem Entwickler-Kontingent.',
    descriptionEn: 'Wafer-scale inference speed with a generous free developer tier.',
    fallbackModels: [
      { id: 'llama-3.3-70b', name: 'Llama 3.3 70B', contextLength: 65536, promptPricePer1M: 0, completionPricePer1M: 0 },
      { id: 'llama3.1-8b', name: 'Llama 3.1 8B', contextLength: 32768, promptPricePer1M: 0, completionPricePer1M: 0 },
      { id: 'qwen-3-32b', name: 'Qwen 3 32B', contextLength: 65536, promptPricePer1M: 0, completionPricePer1M: 0 },
      { id: 'gpt-oss-120b', name: 'GPT-OSS 120B', contextLength: 65536, promptPricePer1M: 0, completionPricePer1M: 0 },
    ],
  },

  // --- Direct First-Party Providers ---
  {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    shortName: 'CLAUDE',
    category: 'direct',
    protocol: 'anthropic',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-sonnet-4-6',
    keyPlaceholder: 'sk-ant-...',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    hasFreeTier: false,
    descriptionDe: 'Direkte Anthropic Messages-API für Claude Sonnet, Opus & Haiku (inkl. Browser-CORS).',
    descriptionEn: 'Direct Anthropic Messages API for Claude Sonnet, Opus & Haiku (CORS-enabled).',
    fallbackModels: [
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', contextLength: 200000, promptPricePer1M: 3, completionPricePer1M: 15 },
      { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', contextLength: 200000, promptPricePer1M: 15, completionPricePer1M: 75 },
      { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', contextLength: 200000, promptPricePer1M: 1, completionPricePer1M: 5 },
      { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5', contextLength: 200000, promptPricePer1M: 3, completionPricePer1M: 15 },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    shortName: 'OPENAI',
    category: 'direct',
    protocol: 'openai',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    keyPlaceholder: 'sk-proj-...',
    docsUrl: 'https://platform.openai.com/api-keys',
    hasFreeTier: false,
    descriptionDe: 'Direkte OpenAI-API für GPT-4.1, GPT-4o & GPT-4o mini.',
    descriptionEn: 'Direct OpenAI API for GPT-4.1, GPT-4o & GPT-4o mini.',
    fallbackModels: [
      { id: 'gpt-4o-mini', name: 'GPT-4o mini', contextLength: 128000, promptPricePer1M: 0.15, completionPricePer1M: 0.6 },
      { id: 'gpt-4.1-mini', name: 'GPT-4.1 mini', contextLength: 1000000, promptPricePer1M: 0.4, completionPricePer1M: 1.6 },
      { id: 'gpt-4.1', name: 'GPT-4.1', contextLength: 1000000, promptPricePer1M: 2, completionPricePer1M: 8 },
      { id: 'gpt-4o', name: 'GPT-4o', contextLength: 128000, promptPricePer1M: 2.5, completionPricePer1M: 10 },
      { id: 'gpt-4.1-nano', name: 'GPT-4.1 nano', contextLength: 1000000, promptPricePer1M: 0.1, completionPricePer1M: 0.4 },
    ],
  },
  {
    id: 'mistral',
    name: 'Mistral AI (EU)',
    shortName: 'MISTRAL',
    category: 'direct',
    protocol: 'openai',
    defaultBaseUrl: 'https://api.mistral.ai/v1',
    defaultModel: 'mistral-small-latest',
    keyPlaceholder: '...',
    docsUrl: 'https://console.mistral.ai/api-keys/',
    hasFreeTier: true,
    descriptionDe: 'Europäischer KI-Anbieter (Paris), stark im Deutschen & kostenlose Teststufe verfügbar.',
    descriptionEn: 'European AI provider (Paris), strong multilingual output with free Experiment tier.',
    fallbackModels: [
      { id: 'mistral-small-latest', name: 'Mistral Small (Latest)', contextLength: 128000, promptPricePer1M: 0.1, completionPricePer1M: 0.3 },
      { id: 'mistral-medium-latest', name: 'Mistral Medium (Latest)', contextLength: 128000, promptPricePer1M: 0.4, completionPricePer1M: 2 },
      { id: 'mistral-large-latest', name: 'Mistral Large (Latest)', contextLength: 128000, promptPricePer1M: 2, completionPricePer1M: 6 },
      { id: 'ministral-8b-latest', name: 'Ministral 8B', contextLength: 128000, promptPricePer1M: 0.1, completionPricePer1M: 0.1 },
    ],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    shortName: 'DEEPSEEK',
    category: 'direct',
    protocol: 'openai',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    keyPlaceholder: 'sk-...',
    docsUrl: 'https://platform.deepseek.com/api_keys',
    hasFreeTier: false,
    descriptionDe: 'Direkte DeepSeek-API (DeepSeek-V3 / Reasoner) zu extrem niedrigen Token-Preisen.',
    descriptionEn: 'Direct DeepSeek API (DeepSeek-V3 / Reasoner) with very low token pricing.',
    fallbackModels: [
      { id: 'deepseek-chat', name: 'DeepSeek Chat (V3)', contextLength: 64000, promptPricePer1M: 0.27, completionPricePer1M: 1.1 },
      { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner (R1)', contextLength: 64000, promptPricePer1M: 0.55, completionPricePer1M: 2.19 },
    ],
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    shortName: 'GEMINI',
    category: 'direct',
    protocol: 'openai',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-2.5-flash',
    keyPlaceholder: 'AIza...',
    docsUrl: 'https://aistudio.google.com/apikey',
    hasFreeTier: true,
    descriptionDe: 'Direkte Google AI Studio API über OpenAI-kompatiblen Endpunkt (inkl. Free-Tier).',
    descriptionEn: 'Direct Google AI Studio API via OpenAI-compatible endpoint (free tier available).',
    fallbackModels: [
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', contextLength: 1000000, promptPricePer1M: 0, completionPricePer1M: 0 },
      { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash-Lite', contextLength: 1000000, promptPricePer1M: 0, completionPricePer1M: 0 },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', contextLength: 1000000, promptPricePer1M: 1.25, completionPricePer1M: 10 },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', contextLength: 1000000, promptPricePer1M: 0, completionPricePer1M: 0 },
    ],
  },
  {
    id: 'xai',
    name: 'xAI (Grok)',
    shortName: 'XAI GROK',
    category: 'direct',
    protocol: 'openai',
    defaultBaseUrl: 'https://api.x.ai/v1',
    defaultModel: 'grok-3-mini',
    keyPlaceholder: 'xai-...',
    docsUrl: 'https://console.x.ai/',
    hasFreeTier: false,
    descriptionDe: 'Direkte xAI-API für Grok 3 & Grok 3 mini.',
    descriptionEn: 'Direct xAI API for Grok 3 & Grok 3 mini.',
    fallbackModels: [
      { id: 'grok-3-mini', name: 'Grok 3 Mini', contextLength: 131072, promptPricePer1M: 0.3, completionPricePer1M: 0.5 },
      { id: 'grok-3', name: 'Grok 3', contextLength: 131072, promptPricePer1M: 3, completionPricePer1M: 15 },
      { id: 'grok-2-latest', name: 'Grok 2 (Latest)', contextLength: 131072, promptPricePer1M: 2, completionPricePer1M: 10 },
    ],
  },

  // --- Custom / Local ---
  {
    id: 'custom',
    name: 'Lokal / Custom (Ollama, LM Studio, LiteLLM)',
    shortName: 'CUSTOM',
    category: 'custom',
    protocol: 'openai',
    defaultBaseUrl: 'http://localhost:11434/v1',
    baseUrlPresets: [
      { labelDe: 'Ollama (lokal)', labelEn: 'Ollama (local)', url: 'http://localhost:11434/v1' },
      { labelDe: 'LM Studio (lokal)', labelEn: 'LM Studio (local)', url: 'http://localhost:1234/v1' },
      { labelDe: 'vLLM / LiteLLM Proxy', labelEn: 'vLLM / LiteLLM Proxy', url: 'http://localhost:8000/v1' },
    ],
    defaultModel: 'llama3.2',
    keyPlaceholder: 'optional (z. B. sk-local-...)',
    docsUrl: 'https://github.com/ollama/ollama/blob/main/docs/openai.md',
    hasFreeTier: true,
    optionalKey: true,
    descriptionDe: 'Eigener OpenAI-kompatibler Endpunkt (Ollama, LM Studio, vLLM, LiteLLM). Key optional.',
    descriptionEn: 'Any OpenAI-compatible URL (Ollama, LM Studio, vLLM, LiteLLM). API key optional.',
    fallbackModels: [
      { id: 'llama3.2', name: 'Llama 3.2 (Ollama)', contextLength: 128000, promptPricePer1M: 0, completionPricePer1M: 0 },
      { id: 'qwen2.5:14b', name: 'Qwen 2.5 14B (Ollama)', contextLength: 32768, promptPricePer1M: 0, completionPricePer1M: 0 },
      { id: 'mistral-nemo', name: 'Mistral Nemo (Ollama)', contextLength: 128000, promptPricePer1M: 0, completionPricePer1M: 0 },
      { id: 'gemma3:12b', name: 'Gemma 3 12B (Ollama)', contextLength: 128000, promptPricePer1M: 0, completionPricePer1M: 0 },
    ],
  },
];

const PROVIDER_MAP = new Map<ApiProviderId, ApiProviderDefinition>(
  API_PROVIDERS.map((p) => [p.id, p])
);

export const VALID_PROVIDER_IDS = new Set<ApiProviderId>(API_PROVIDERS.map((p) => p.id));

export function isValidProviderId(val: unknown): val is ApiProviderId {
  return typeof val === 'string' && VALID_PROVIDER_IDS.has(val as ApiProviderId);
}

export function getProviderDefinition(id?: string | null): ApiProviderDefinition {
  if (id && PROVIDER_MAP.has(id as ApiProviderId)) {
    return PROVIDER_MAP.get(id as ApiProviderId)!;
  }
  return PROVIDER_MAP.get('openrouter')!;
}

export function resolveProviderBaseUrl(id: ApiProviderId, customBaseUrl?: string | null): string {
  const def = getProviderDefinition(id);
  const candidate = (customBaseUrl || '').trim().replace(/\/+$/, '');
  if ((id === 'custom' || id === 'requesty') && candidate) {
    if (/^https?:\/\/.+/i.test(candidate)) {
      return candidate;
    }
  }
  return def.defaultBaseUrl;
}

export function sanitizeProviderApiKey(raw: string): string {
  let cleaned = raw.replace(/[\u200B-\u200D\uFEFF\r\n\t]/g, '').trim();
  cleaned = cleaned
    .replace(
      /^(OPENROUTER|ANTHROPIC|OPENAI|MISTRAL|DEEPSEEK|GEMINI|GOOGLE|GROQ|CEREBRAS|TOGETHER|HUGGINGFACE|HF|REQUESTY|XAI)_?(API_KEY|TOKEN)?\s*=\s*/i,
      ''
    )
    .trim();
  cleaned = cleaned.replace(/^Authorization\s*:\s*/i, '').trim();
  cleaned = cleaned.replace(/^x-api-key\s*:\s*/i, '').trim();
  cleaned = cleaned.replace(/^Bearer\s+/i, '').trim();
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'")) ||
    (cleaned.startsWith('`') && cleaned.endsWith('`'))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  cleaned = cleaned.replace(/^Bearer\s+/i, '').trim();
  return cleaned;
}

export function isModelFreeForProvider(
  model: Pick<ProviderCatalogModel, 'id' | 'promptPricePer1M' | 'completionPricePer1M'>,
  providerId: ApiProviderId = 'openrouter'
): boolean {
  if (providerId === 'custom') return true;
  if (providerId === 'openrouter') {
    if (model.id === 'openrouter/free' || model.id.endsWith(':free')) return true;
    return model.promptPricePer1M === 0 && model.completionPricePer1M === 0;
  }
  return model.promptPricePer1M === 0 && model.completionPricePer1M === 0;
}

export function normalizeModelsCatalogResponse(
  providerId: ApiProviderId,
  json: unknown
): ProviderCatalogModel[] {
  const def = getProviderDefinition(providerId);
  const fallbackMap = new Map(def.fallbackModels.map((m) => [m.id, m]));
  const rawList =
    json && typeof json === 'object' && Array.isArray((json as { data?: unknown[] }).data)
      ? ((json as { data: Array<Record<string, unknown>> }).data)
      : json && typeof json === 'object' && Array.isArray((json as { models?: unknown[] }).models)
        ? ((json as { models: Array<Record<string, unknown>> }).models)
        : [];

  const parsed: ProviderCatalogModel[] = [];
  const seen = new Set<string>();

  for (const item of rawList) {
    let rawId = typeof item.id === 'string' ? item.id.trim() : '';
    if (!rawId) continue;
    if (providerId === 'gemini' && rawId.startsWith('models/')) {
      rawId = rawId.slice('models/'.length);
    }

    // Filter out non-chat/embedding/image-only/audio-only models when metadata reveals them
    const lowerId = rawId.toLowerCase();
    if (
      /(embed|embedding|whisper|tts|dall-e|image-generation|moderation|rerank|bge-|e5-|nomic-embed|guard)/i.test(
        lowerId
      )
    ) {
      continue;
    }

    if (providerId === 'openrouter') {
      const arch = item.architecture as { modality?: string } | undefined;
      if (arch?.modality && !arch.modality.includes('text')) continue;
    }
    if (providerId === 'requesty') {
      if (typeof item.api === 'string' && item.api !== 'chat') continue;
    }
    if (providerId === 'huggingface') {
      const arch = item.architecture as { output_modalities?: string[] } | undefined;
      if (Array.isArray(arch?.output_modalities) && !arch.output_modalities.includes('text')) continue;
    }

    if (seen.has(rawId)) continue;
    seen.add(rawId);

    const fb = fallbackMap.get(rawId);
    const displayName =
      typeof item.display_name === 'string' && item.display_name.trim()
        ? item.display_name.trim()
        : typeof item.name === 'string' && item.name.trim()
          ? item.name.trim()
          : fb?.name || rawId;

    let contextLength =
      typeof item.context_length === 'number'
        ? item.context_length
        : typeof item.context_window === 'number'
          ? item.context_window
          : typeof item.max_context_length === 'number'
            ? item.max_context_length
            : fb?.contextLength ?? 0;

    let promptPricePer1M = fb?.promptPricePer1M ?? (def.hasFreeTier ? 0 : -1);
    let completionPricePer1M = fb?.completionPricePer1M ?? (def.hasFreeTier ? 0 : -1);

    if (providerId === 'openrouter' && item.pricing && typeof item.pricing === 'object') {
      const pr = item.pricing as { prompt?: string; completion?: string };
      const pTok = Number(pr.prompt ?? 0);
      const cTok = Number(pr.completion ?? 0);
      promptPricePer1M = pTok < 0 ? -1 : Number.isFinite(pTok) ? Number((pTok * 1_000_000).toFixed(3)) : 0;
      completionPricePer1M = cTok < 0 ? -1 : Number.isFinite(cTok) ? Number((cTok * 1_000_000).toFixed(3)) : 0;
    } else if (providerId === 'requesty' && typeof item.input_price === 'number') {
      const pTok = Number(item.input_price);
      const cTok = Number(item.output_price ?? pTok);
      promptPricePer1M = Number.isFinite(pTok) ? Number((pTok * 1_000_000).toFixed(3)) : -1;
      completionPricePer1M = Number.isFinite(cTok) ? Number((cTok * 1_000_000).toFixed(3)) : -1;
    } else if (providerId === 'huggingface' && Array.isArray(item.providers) && item.providers.length > 0) {
      const liveProvs = (item.providers as Array<Record<string, unknown>>).filter(
        (p) => !p.status || p.status === 'live'
      );
      const firstProv = liveProvs[0] || (item.providers[0] as Record<string, unknown>);
      if (!contextLength && typeof firstProv?.context_length === 'number') {
        contextLength = firstProv.context_length;
      }
      const anyFree = liveProvs.some((p) => p.is_free === true);
      if (anyFree) {
        promptPricePer1M = 0;
        completionPricePer1M = 0;
      } else if (firstProv?.pricing && typeof firstProv.pricing === 'object') {
        const pr = firstProv.pricing as { input?: number; output?: number };
        if (typeof pr.input === 'number') promptPricePer1M = Number(pr.input.toFixed(3));
        if (typeof pr.output === 'number') completionPricePer1M = Number(pr.output.toFixed(3));
      }
    }

    parsed.push({
      id: rawId,
      name: displayName,
      contextLength,
      promptPricePer1M,
      completionPricePer1M,
    });
  }

  // Ensure curated fallbacks appear at top if not missing or prepend missing fallbacks
  for (const fb of def.fallbackModels) {
    if (!seen.has(fb.id)) {
      parsed.push({ ...fb });
      seen.add(fb.id);
    }
  }

  const featuredIds = def.fallbackModels.map((m) => m.id);
  const openRouterOrder = [
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
  const orderList = providerId === 'openrouter' ? openRouterOrder : featuredIds;

  return parsed.sort((a, b) => {
    const idxA = orderList.indexOf(a.id);
    const idxB = orderList.indexOf(b.id);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.name.localeCompare(b.name);
  });
}
