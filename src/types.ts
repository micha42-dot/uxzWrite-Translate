export type RewriteMode = 'correction' | 'style';

export type RewriteTask = 'rewrite' | 'translate';

export type TranslationTone = 'neutral' | 'formal' | 'informal';

export type WritingStyleId =
  | 'ausgewogen'
  | 'umgangssprachlich'
  | 'journalistisch'
  | 'eloquent'
  | 'hochgestochen'
  | 'geschaeftlich'
  | 'akademisch'
  | 'praegnant';

export type SourceLanguageId =
  | 'auto'
  | 'de'
  | 'en-US'
  | 'en-GB'
  | 'fr'
  | 'es'
  | 'it'
  | 'nl'
  | 'pt'
  | 'pl'
  | 'sv'
  | 'tr'
  | 'uk'
  | 'ja'
  | 'zh'
  | 'ko';

export type TargetLanguageId = Exclude<SourceLanguageId, 'auto'>;

export interface LanguageOption {
  id: SourceLanguageId;
  label: string;
  shortLabel: string;
}

export interface StyleOption {
  id: WritingStyleId;
  label: string;
}

export interface OpenRouterStatus {
  configured: boolean;
  source: 'session' | 'env' | 'memory' | 'none';
  keyPreview: string | null;
  model: string;
  dualReviewEnabled: boolean;
  secondaryModel: string;
  backendAvailable?: boolean;
  paidModelsUnlocked: boolean;
  paidModelsPasswordConfigured: boolean;
  keyInfo?: {
    label?: string | null;
    limit?: number | null;
    usage?: number | null;
    isFreeTier?: boolean | null;
  } | null;
}

export interface OpenRouterModel {
  id: string;
  name: string;
  contextLength: number;
  promptPricePer1M: number;
  completionPricePer1M: number;
}

export function isFreeOpenRouterModel(
  model: Pick<OpenRouterModel, 'id' | 'promptPricePer1M' | 'completionPricePer1M'>
): boolean {
  if (model.id === 'openrouter/free') return true;
  return model.promptPricePer1M === 0 && model.completionPricePer1M === 0;
}

export type ChangeCategory =
  | 'rechtschreibung'
  | 'grammatik'
  | 'zeichensetzung'
  | 'stil'
  | 'klarheit';

export interface ChangeItem {
  id: string;
  before: string;
  after: string;
  contextBefore?: string;
  contextAfter?: string;
  refinedStart: number;
  refinedEnd: number;
  category: ChangeCategory | 'pending';
  reason?: string;
}

export interface HistoryEntry {
  id: string;
  sourceText: string;
  refinedText: string;
  sourceLang: SourceLanguageId;
  targetLang?: TargetLanguageId;
  task?: RewriteTask;
  mode: RewriteMode;
  style: WritingStyleId;
  model: string;
  changes?: ChangeItem[];
  createdAt: string;
}

export interface DiffToken {
  type: 'equal' | 'add' | 'remove';
  value: string;
}

export const CHANGE_CATEGORY_LABELS: Record<ChangeCategory, string> = {
  rechtschreibung: 'Rechtschreibung',
  grammatik: 'Grammatik',
  zeichensetzung: 'Zeichensetzung',
  stil: 'Stil',
  klarheit: 'Klarheit',
};

export const SOURCE_LANGUAGES: LanguageOption[] = [
  { id: 'auto', label: 'Sprache erkennen', shortLabel: 'Auto' },
  { id: 'de', label: 'Deutsch', shortLabel: 'DE' },
  { id: 'en-US', label: 'Englisch (US)', shortLabel: 'EN-US' },
  { id: 'en-GB', label: 'Englisch (UK)', shortLabel: 'EN-GB' },
  { id: 'fr', label: 'Französisch', shortLabel: 'FR' },
  { id: 'es', label: 'Spanisch', shortLabel: 'ES' },
  { id: 'it', label: 'Italienisch', shortLabel: 'IT' },
  { id: 'nl', label: 'Niederländisch', shortLabel: 'NL' },
  { id: 'pt', label: 'Portugiesisch', shortLabel: 'PT' },
  { id: 'pl', label: 'Polnisch', shortLabel: 'PL' },
  { id: 'sv', label: 'Schwedisch', shortLabel: 'SV' },
  { id: 'tr', label: 'Türkisch', shortLabel: 'TR' },
  { id: 'uk', label: 'Ukrainisch', shortLabel: 'UK' },
  { id: 'ja', label: 'Japanisch', shortLabel: 'JA' },
  { id: 'zh', label: 'Chinesisch', shortLabel: 'ZH' },
  { id: 'ko', label: 'Koreanisch', shortLabel: 'KO' },
];

export const TRANSLATABLE_LANGUAGES = SOURCE_LANGUAGES.filter(
  (l): l is LanguageOption & { id: TargetLanguageId } => l.id !== 'auto'
);

export const ALL_TARGET_LANGUAGE_IDS: TargetLanguageId[] = TRANSLATABLE_LANGUAGES.map((l) => l.id);

export const WRITING_STYLES: StyleOption[] = [
  { id: 'ausgewogen', label: 'Ausgewogen' },
  { id: 'umgangssprachlich', label: 'Umgangssprachlich' },
  { id: 'journalistisch', label: 'Journalistisch' },
  { id: 'eloquent', label: 'Eloquent' },
  { id: 'hochgestochen', label: 'Hochgestochen' },
  { id: 'geschaeftlich', label: 'Geschäftlich' },
  { id: 'akademisch', label: 'Akademisch' },
  { id: 'praegnant', label: 'Prägnant' },
];

export interface ProtectedTerm {
  id: string;
  term: string;
  caseSensitive: boolean;
  enabled: boolean;
}

export interface WritingRule {
  id: string;
  title: string;
  instruction: string;
  enabled: boolean;
}

export interface WorkspaceSettings {
  defaultSourceLang: SourceLanguageId;
  defaultTargetLang: TargetLanguageId;
  enabledLanguages: TargetLanguageId[];
  defaultWriteMode: RewriteMode;
  defaultWriteStyle: WritingStyleId;
  defaultTranslationTone: TranslationTone;
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

export const DEFAULT_WORKSPACE_SETTINGS: WorkspaceSettings = {
  defaultSourceLang: 'auto',
  defaultTargetLang: 'en-US',
  enabledLanguages: ['de', 'en-US', 'en-GB', 'fr', 'es', 'it', 'nl', 'pt', 'pl'],
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

export interface WritingPreferences {
  terms: ProtectedTerm[];
  rules: WritingRule[];
  settings?: WorkspaceSettings;
}

export const DEFAULT_STARTER_RULES: WritingRule[] = [
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
