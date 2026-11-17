import { useCallback, useEffect, useState } from 'react';
import { HistoryView } from './components/HistoryView';
import { ModelsView } from './components/ModelsView';
import { OpenRouterDrawer } from './components/OpenRouterDrawer';
import { PaidModelsPasswordModal } from './components/PaidModelsPasswordModal';
import { PreferencesView } from './components/PreferencesView';
import { SettingsModal } from './components/SettingsModal';
import { TopBar } from './components/TopBar';
import type { ActiveTab } from './components/TopBar';
import { TranslateWorkspace } from './components/TranslateWorkspace';
import { WriteWorkspace } from './components/WriteWorkspace';
import {
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
import { DEFAULT_STARTER_RULES } from './types';
import type {
  ChangeItem,
  HistoryEntry,
  OpenRouterModel,
  OpenRouterStatus,
  RewriteMode,
  SourceLanguageId,
  TargetLanguageId,
  TranslationTone,
  WritingPreferences,
  WritingStyleId,
} from './types';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('editor');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [workspaceSettingsOpen, setWorkspaceSettingsOpen] = useState(false);
  const [unlockModalOpen, setUnlockModalOpen] = useState(false);
  const [pendingUnlockModel, setPendingUnlockModel] = useState<OpenRouterModel | null>(null);
  const [pendingUnlockSlot, setPendingUnlockSlot] = useState<'primary' | 'secondary'>('primary');
  const [darkMode, setDarkMode] = useState(false);

  const [status, setStatus] = useState<OpenRouterStatus>({
    configured: false,
    source: 'none',
    keyPreview: null,
    model: 'openrouter/free',
    dualReviewEnabled: false,
    secondaryModel: 'openrouter/free',
    paidModelsUnlocked: false,
    paidModelsPasswordConfigured: false,
    keyInfo: null,
  });

  const [models, setModels] = useState<OpenRouterModel[]>([]);
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
  }, [darkMode]);

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

  const fetchModels = useCallback(async () => {
    if (models.length > 0) return;
    setModelsLoading(true);
    try {
      const loaded = await fetchOpenRouterModels();
      setModels(loaded);
    } finally {
      setModelsLoading(false);
    }
  }, [models.length]);

  useEffect(() => {
    fetchStatusAndHistory();
  }, [fetchStatusAndHistory]);

  useEffect(() => {
    if (settingsOpen || activeTab === 'models') {
      fetchModels();
    }
  }, [settingsOpen, activeTab, fetchModels]);

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
          ? { secondaryModel: pendingUnlockModel.id }
          : { model: pendingUnlockModel.id }
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

  async function handleSelectModel(modelId: string) {
    const result = await saveOpenRouterConfig({ model: modelId });
    if (result.ok) {
      setStatus(result.status);
      return;
    }
    if (result.code === 'PAID_MODEL_LOCKED') {
      const target = models.find((m) => m.id === modelId) ?? null;
      handleRequestUnlock(target ?? undefined);
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
    <div className="min-h-screen bg-[#F8F9FA] dark:bg-[#090C12] bg-grid-pattern text-neutral-900 dark:text-neutral-100 transition-colors">
      <TopBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        historyCount={history.length}
        rulesCount={activePreferencesCount}
        status={status}
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode((v) => !v)}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenWorkspaceSettings={() => setWorkspaceSettingsOpen(true)}
      />

      <main>
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
            activeModel={status.model}
            paidModelsUnlocked={status.paidModelsUnlocked}
            onSelectModel={handleSelectModel}
            onRequestUnlock={handleRequestUnlock}
            onLockPaid={handleLockPaid}
          />
        )}
      </main>

      <OpenRouterDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        status={status}
        models={models}
        modelsLoading={modelsLoading}
        onStatusUpdated={setStatus}
        onRequestUnlock={handleRequestUnlock}
        onLockPaid={handleLockPaid}
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
  );
}
