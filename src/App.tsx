import { useCallback, useEffect, useState } from 'react';
import { HistoryView } from './components/HistoryView';
import { ModelsView } from './components/ModelsView';
import { OpenRouterDrawer } from './components/OpenRouterDrawer';
import { PaidModelsPasswordModal } from './components/PaidModelsPasswordModal';
import { PreferencesView } from './components/PreferencesView';
import { PrivacyView } from './components/PrivacyView';
import { SettingsModal } from './components/SettingsModal';
import { TopBar } from './components/TopBar';
import type { ActiveTab } from './components/TopBar';
import { TranslateWorkspace } from './components/TranslateWorkspace';
import { WriteWorkspace } from './components/WriteWorkspace';
import {
  clearAllLocalData,
  clearHistoryEntries,
  deleteHistoryEntry,
  fetchHistoryEntries,
  fetchOpenRouterModels,
  fetchOpenRouterStatus,
  fetchWritingPreferences,
  lockPaidModels,
  saveHistoryEntry,
  saveOpenRouterConfig,
  saveWritingPreferences,
  unlockPaidModels,
} from './lib/apiClient';
import { UiLanguageContext } from './lib/i18n';
import { DEFAULT_STARTER_RULES } from './types';
import type {
  ApiProviderId,
  ChangeItem,
  HistoryEntry,
  OpenRouterModel,
  OpenRouterStatus,
  RewriteMode,
  SourceLanguageId,
  TargetLanguageId,
  TranslationTone,
  UiLanguage,
  WritingPreferences,
  WritingStyleId,
} from './types';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    if (typeof window !== 'undefined' && window.location.hash === '#datenschutz') {
      return 'privacy';
    }
    return 'editor';
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [workspaceSettingsOpen, setWorkspaceSettingsOpen] = useState(false);
  const [unlockModalOpen, setUnlockModalOpen] = useState(false);
  const [pendingUnlockModel, setPendingUnlockModel] = useState<OpenRouterModel | null>(null);
  const [pendingUnlockSlot, setPendingUnlockSlot] = useState<'primary' | 'secondary'>('primary');
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      const stored = window.localStorage.getItem('uxz_dark_mode');
      if (stored === 'true') return true;
      if (stored === 'false') return false;
      return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
    } catch {
      return false;
    }
  });
  const [uiLang, setUiLang] = useState<UiLanguage>(() => {
    if (typeof window === 'undefined') return 'de';
    try {
      const stored =
        window.localStorage.getItem('uxz_ui_lang') ||
        window.sessionStorage.getItem('uxz_ui_lang');
      if (stored === 'en' || stored === 'de') return stored;
      return 'de';
    } catch {
      return 'de';
    }
  });

  const [status, setStatus] = useState<OpenRouterStatus>({
    configured: false,
    provider: 'openrouter',
    customBaseUrl: 'https://openrouter.ai/api/v1',
    configuredProviders: [],
    source: 'none',
    keyPreview: null,
    model: 'openrouter/free',
    dualReviewEnabled: false,
    secondaryModel: 'openrouter/free',
    enforceZdr: false,
    paidModelsUnlocked: false,
    paidModelsPasswordConfigured: false,
    keyInfo: null,
  });

  const [models, setModels] = useState<OpenRouterModel[]>([]);
  const [modelsProvider, setModelsProvider] = useState<ApiProviderId>('openrouter');
  const [modelsLoading, setModelsLoading] = useState(false);

  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const [preferences, setPreferences] = useState<WritingPreferences>({
    terms: [],
    rules: DEFAULT_STARTER_RULES.map((r) => ({ ...r })),
  });
  const [preferencesLoading, setPreferencesLoading] = useState(true);

  // Editor state (never persisted in localStorage)
  const [sourceText, setSourceText] = useState('');
  const [refinedText, setRefinedText] = useState('');
  const [sourceLang, setSourceLang] = useState<SourceLanguageId>('auto');
  const [mode, setMode] = useState<RewriteMode>('style');
  const [style, setStyle] = useState<WritingStyleId>('ausgewogen');
  const [changes, setChanges] = useState<ChangeItem[]>([]);

  // Translate state
  const [translateSourceText, setTranslateSourceText] = useState('');
  const [translateTargetText, setTranslateTargetText] = useState('');
  const [translateSourceLang, setTranslateSourceLang] = useState<SourceLanguageId>('auto');
  const [translateTargetLang, setTranslateTargetLang] = useState<TargetLanguageId>('en-US');
  const [translateTone, setTranslateTone] = useState<TranslationTone>('neutral');
  const [translateChanges, setTranslateChanges] = useState<ChangeItem[]>([]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    try {
      window.localStorage.setItem('uxz_dark_mode', darkMode ? 'true' : 'false');
    } catch {
      // ignore storage errors
    }
  }, [darkMode]);

  useEffect(() => {
    document.documentElement.lang = uiLang;
    try {
      window.localStorage.setItem('uxz_ui_lang', uiLang);
      window.sessionStorage.setItem('uxz_ui_lang', uiLang);
    } catch {
      // ignore storage errors
    }
  }, [uiLang]);

  useEffect(() => {
    const onHashChange = () => {
      if (window.location.hash === '#datenschutz') {
        setActiveTab('privacy');
      } else if (activeTab === 'privacy' && window.location.hash !== '#datenschutz') {
        setActiveTab('editor');
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [activeTab]);

  function handleSelectTab(tab: ActiveTab) {
    setActiveTab(tab);
    if (typeof window !== 'undefined') {
      if (tab === 'privacy') {
        if (window.location.hash !== '#datenschutz') {
          window.history.pushState(null, '', '#datenschutz');
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else if (window.location.hash === '#datenschutz') {
        window.history.pushState(null, '', window.location.pathname + window.location.search);
      }
    }
  }

  const fetchStatusAndHistory = useCallback(async () => {
    try {
      const [s, h, p] = await Promise.all([
        fetchOpenRouterStatus(),
        fetchHistoryEntries(),
        fetchWritingPreferences(),
      ]);
      setStatus(s);
      setHistory(h);
      setPreferences(p);
      if (p.settings) {
        setSourceLang(p.settings.defaultSourceLang);
        setTranslateSourceLang(p.settings.defaultSourceLang);
        setTranslateTargetLang(p.settings.defaultTargetLang);
        setMode(p.settings.defaultWriteMode);
        setStyle(p.settings.defaultWriteStyle);
        setTranslateTone(p.settings.defaultTranslationTone);
      }
    } finally {
      setHistoryLoading(false);
      setPreferencesLoading(false);
    }
  }, []);

  const refreshModels = useCallback(
    async (providerOverride?: ApiProviderId, customBaseUrlOverride?: string) => {
      const targetProvider = providerOverride || status.provider || 'openrouter';
      setModelsProvider(targetProvider);
      setModelsLoading(true);
      try {
        const loaded = await fetchOpenRouterModels(targetProvider, customBaseUrlOverride);
        setModels(loaded);
      } finally {
        setModelsLoading(false);
      }
    },
    [status.provider]
  );

  useEffect(() => {
    fetchStatusAndHistory();
  }, [fetchStatusAndHistory]);

  useEffect(() => {
    if (settingsOpen) {
      if (models.length === 0 || modelsProvider !== status.provider) {
        void refreshModels(status.provider, status.customBaseUrl);
      }
    } else if (activeTab === 'models') {
      if (models.length === 0) {
        void refreshModels(status.provider, status.customBaseUrl);
      }
    }
  }, [settingsOpen, activeTab, models.length, modelsProvider, status.provider, status.customBaseUrl, refreshModels]);

  async function handleSaveHistory(payload: {
    sourceText: string;
    refinedText: string;
    sourceLang: SourceLanguageId;
    targetLang?: TargetLanguageId;
    task?: 'rewrite' | 'translate';
    mode: RewriteMode;
    style: WritingStyleId;
    model: string;
    changes: ChangeItem[];
  }) {
    const entries = await saveHistoryEntry(payload);
    setHistory(entries);
  }

  async function handleDeleteHistoryEntry(id: string) {
    const entries = await deleteHistoryEntry(id);
    setHistory(entries);
  }

  async function handleClearHistory() {
    const entries = await clearHistoryEntries();
    setHistory(entries);
  }

  async function handleUpdatePreferences(next: WritingPreferences) {
    setPreferences(next);
    const saved = await saveWritingPreferences(next);
    setPreferences(saved);
  }

  async function handleClearAllLocalData() {
    const reset = await clearAllLocalData();
    setStatus(reset.status);
    setPreferences(reset.preferences);
    setHistory([]);
    setSourceText('');
    setRefinedText('');
    setChanges([]);
    setTranslateSourceText('');
    setTranslateTargetText('');
    setTranslateChanges([]);
    const prefersDark =
      typeof window !== 'undefined' && (window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false);
    setDarkMode(prefersDark);
    setUiLang('de');
  }

  function handleRequestUnlock(model?: OpenRouterModel, slot: 'primary' | 'secondary' = 'primary') {
    setPendingUnlockModel(model ?? null);
    setPendingUnlockSlot(slot);
    setUnlockModalOpen(true);
  }

  async function handleUnlockPaid(password: string): Promise<{ ok: true } | { ok: false; error: string }> {
    const unlockRes = await unlockPaidModels(password);
    if (!unlockRes.ok) {
      return { ok: false, error: unlockRes.error };
    }
    let nextStatus = unlockRes.status;
    if (pendingUnlockModel) {
      const saveRes = await saveOpenRouterConfig(
        pendingUnlockSlot === 'secondary'
          ? { provider: status.provider, secondaryModel: pendingUnlockModel.id }
          : { provider: modelsProvider || status.provider, model: pendingUnlockModel.id }
      );
      if (saveRes.ok) {
        nextStatus = saveRes.status;
      }
    }
    setStatus(nextStatus);
    setPendingUnlockModel(null);
    setPendingUnlockSlot('primary');
    return { ok: true };
  }

  async function handleLockPaid() {
    const res = await lockPaidModels();
    if (res.ok) {
      setStatus(res.status);
    }
  }

  async function handleSelectModel(modelId: string, providerOverride?: ApiProviderId) {
    const targetProvider = providerOverride || status.provider || 'openrouter';
    const result = await saveOpenRouterConfig({ provider: targetProvider, model: modelId });
    if (result.ok) {
      setStatus(result.status);
      if (!result.status.configured) {
        setSettingsOpen(true);
      }
      return;
    }
    if (result.code === 'PAID_MODEL_LOCKED') {
      const target = models.find((m) => m.id === modelId) ?? null;
      handleRequestUnlock(target ?? undefined);
    }
  }

  function handleStatusUpdated(next: OpenRouterStatus) {
    setStatus(next);
    if (next.provider !== modelsProvider) {
      void refreshModels(next.provider, next.customBaseUrl);
    }
  }

  function handleLoadHistoryEntry(entry: HistoryEntry) {
    if (entry.task === 'translate' && entry.targetLang) {
      setTranslateSourceText(entry.sourceText);
      setTranslateTargetText(entry.refinedText);
      setTranslateSourceLang(entry.sourceLang);
      setTranslateTargetLang(entry.targetLang);
      setActiveTab('translate');
    } else {
      setSourceText(entry.sourceText);
      setRefinedText(entry.refinedText);
      setSourceLang(entry.sourceLang);
      setMode(entry.mode);
      setStyle(entry.style);
      setChanges(entry.changes ?? []);
      setActiveTab('editor');
    }
  }

  const activePreferencesCount =
    preferences.terms.filter((t) => t.enabled).length +
    preferences.rules.filter((r) => r.enabled).length;

  return (
    <UiLanguageContext.Provider value={{ uiLang, setUiLang }}>
    <div className="min-h-screen flex flex-col bg-[#F8F9FA] dark:bg-[#090C12] bg-grid-pattern text-neutral-900 dark:text-neutral-100 transition-colors">
      <TopBar
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        historyCount={history.length}
        rulesCount={activePreferencesCount}
        status={status}
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode((v) => !v)}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenWorkspaceSettings={() => setWorkspaceSettingsOpen(true)}
      />

      <main className="flex-1">
        {activeTab === 'editor' && (
          <WriteWorkspace
            status={status}
            preferences={preferences}
            sourceText={sourceText}
            refinedText={refinedText}
            sourceLang={sourceLang}
            mode={mode}
            style={style}
            changes={changes}
            darkMode={darkMode}
            onToggleDarkMode={() => setDarkMode((v) => !v)}
            onChangeSourceText={setSourceText}
            onChangeRefinedText={setRefinedText}
            onChangeSourceLang={setSourceLang}
            onChangeMode={setMode}
            onChangeStyle={setStyle}
            onChangeChanges={setChanges}
            onOpenSettings={() => setSettingsOpen(true)}
            onRequestUnlock={() => handleRequestUnlock()}
            onSelectModel={handleSelectModel}
            onSaveHistory={handleSaveHistory}
          />
        )}

        {activeTab === 'translate' && (
          <TranslateWorkspace
            status={status}
            preferences={preferences}
            sourceText={translateSourceText}
            translatedText={translateTargetText}
            sourceLang={translateSourceLang}
            targetLang={translateTargetLang}
            tone={translateTone}
            changes={translateChanges}
            darkMode={darkMode}
            onToggleDarkMode={() => setDarkMode((v) => !v)}
            onChangeSourceText={setTranslateSourceText}
            onChangeTranslatedText={setTranslateTargetText}
            onChangeSourceLang={setTranslateSourceLang}
            onChangeTargetLang={setTranslateTargetLang}
            onChangeTone={setTranslateTone}
            onChangeChanges={setTranslateChanges}
            onOpenSettings={() => setSettingsOpen(true)}
            onRequestUnlock={() => handleRequestUnlock()}
            onSelectModel={handleSelectModel}
            onSaveHistory={handleSaveHistory}
          />
        )}

        {activeTab === 'rules' && (
          <PreferencesView
            preferences={preferences}
            loading={preferencesLoading}
            onUpdatePreferences={handleUpdatePreferences}
          />
        )}

        {activeTab === 'history' && (
          <HistoryView
            entries={history}
            loading={historyLoading}
            onLoadEntry={handleLoadHistoryEntry}
            onDeleteEntry={handleDeleteHistoryEntry}
            onClearAll={handleClearHistory}
          />
        )}

        {activeTab === 'models' && (
          <ModelsView
            models={models}
            loading={modelsLoading}
            activeProvider={status.provider}
            activeModel={status.model}
            browserProvider={modelsProvider}
            paidModelsUnlocked={status.paidModelsUnlocked}
            showPaidLockControls={
              status.provider === 'openrouter' ||
              status.source === 'env' ||
              status.paidModelsPasswordConfigured
            }
            onChangeBrowserProvider={async (p) => {
              await refreshModels(p);
            }}
            onSelectModel={handleSelectModel}
            onRequestUnlock={handleRequestUnlock}
            onLockPaid={handleLockPaid}
          />
        )}

        {activeTab === 'privacy' && (
          <PrivacyView
            onBackToEditor={() => handleSelectTab('editor')}
            onOpenSettings={() => setSettingsOpen(true)}
            onClearAllData={handleClearAllLocalData}
          />
        )}
      </main>

      <footer className="border-t border-neutral-200/80 dark:border-neutral-800/80 bg-white/80 dark:bg-[#0A0D14]/80 backdrop-blur-sm">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 text-[11.5px] leading-snug text-neutral-500 dark:text-neutral-400">
          <span>
            {uiLang === 'en'
              ? 'No self-hosted tracking — all settings & keys stay local in your browser.'
              : 'Kein eigenes Tracking – alle Einstellungen & Keys bleiben lokal im Browser.'}
          </span>
          <div className="flex items-center gap-4 shrink-0">
            <button
              type="button"
              onClick={() => handleSelectTab('privacy')}
              className={`font-medium underline underline-offset-4 transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'privacy'
                  ? 'text-neutral-950 dark:text-white'
                  : 'text-neutral-700 dark:text-neutral-300 hover:text-neutral-950 dark:hover:text-white'
              }`}
            >
              {uiLang === 'en' ? 'Privacy & Data Flows' : 'Datenschutz & Datenflüsse'}
            </button>
            <a
              href="https://michaelfoertsch.de/impressum.html"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-neutral-700 dark:text-neutral-300 hover:text-neutral-950 dark:hover:text-white underline underline-offset-4 transition-colors whitespace-nowrap"
            >
              {uiLang === 'en' ? 'Imprint' : 'Impressum'}
            </a>
          </div>
        </div>
      </footer>

      <OpenRouterDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        status={status}
        models={models}
        modelsLoading={modelsLoading}
        onStatusUpdated={handleStatusUpdated}
        onRefreshModels={refreshModels}
        onRequestUnlock={handleRequestUnlock}
        onLockPaid={handleLockPaid}
        onClearAllData={handleClearAllLocalData}
      />

      <SettingsModal
        open={workspaceSettingsOpen}
        onClose={() => setWorkspaceSettingsOpen(false)}
        preferences={preferences}
        onUpdatePreferences={handleUpdatePreferences}
      />

      <PaidModelsPasswordModal
        open={unlockModalOpen}
        passwordConfigured={status.paidModelsPasswordConfigured}
        pendingModel={pendingUnlockModel}
        onClose={() => {
          setUnlockModalOpen(false);
          setPendingUnlockModel(null);
        }}
        onUnlock={handleUnlockPaid}
      />
    </div>
    </UiLanguageContext.Provider>
  );
}
