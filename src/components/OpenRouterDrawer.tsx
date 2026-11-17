import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  Search,
  ShieldCheck,
  Trash2,
  Unlock,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { clearAllLocalData, removeOpenRouterKey, saveOpenRouterConfig } from '../lib/apiClient';
import { useUiLang } from '../lib/i18n';
import { isFreeOpenRouterModel } from '../types';
import type { OpenRouterModel, OpenRouterStatus } from '../types';

type DrawerPriceFilter = 'all' | 'free' | 'paid';

interface OpenRouterDrawerProps {
  open: boolean;
  onClose: () => void;
  status: OpenRouterStatus;
  models: OpenRouterModel[];
  modelsLoading: boolean;
  onStatusUpdated: (next: OpenRouterStatus) => void;
  onRequestUnlock: (model?: OpenRouterModel, slot?: 'primary' | 'secondary') => void;
  onLockPaid: () => Promise<void>;
  onClearAllData?: () => Promise<void>;
}

export function OpenRouterDrawer({
  open,
  onClose,
  status,
  models,
  modelsLoading,
  onStatusUpdated,
  onRequestUnlock,
  onLockPaid,
  onClearAllData,
}: OpenRouterDrawerProps) {
  const { uiLang } = useUiLang();
  const isEn = uiLang === 'en';

  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [selectedModel, setSelectedModel] = useState(status.model);
  const [modelSearch, setModelSearch] = useState('');
  const [priceFilter, setPriceFilter] = useState<DrawerPriceFilter>('all');
  const [showAllModels, setShowAllModels] = useState(false);

  const [dualInfoOpen, setDualInfoOpen] = useState(false);
  const [dualPopoverPos, setDualPopoverPos] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    width: number;
  }>({ top: 120, left: 12, width: 320 });
  const dualInfoRef = useRef<HTMLDivElement | null>(null);
  const dualInfoBtnRef = useRef<HTMLButtonElement | null>(null);
  const [secondarySearch, setSecondarySearch] = useState('');
  const [savingDual, setSavingDual] = useState(false);
  const [savingZdr, setSavingZdr] = useState(false);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);

  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [lockingPaid, setLockingPaid] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  useEffect(() => {
    setSelectedModel(status.model);
  }, [status.model]);

  const updateDualPopoverPos = useCallback(() => {
    const btn = dualInfoBtnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const margin = 12;
    const width = Math.min(320, Math.max(220, viewportW - margin * 2));
    const preferredLeft = rect.right - width;
    const left = Math.max(margin, Math.min(preferredLeft, viewportW - width - margin));
    const estimatedHeight = 190;
    const fitsBelow = rect.bottom + 8 + estimatedHeight <= viewportH - margin;
    const fitsAbove = rect.top - 8 - estimatedHeight >= margin;

    if (!fitsBelow && fitsAbove) {
      setDualPopoverPos({
        bottom: viewportH - rect.top + 8,
        left,
        width,
      });
    } else {
      setDualPopoverPos({
        top: Math.min(rect.bottom + 8, Math.max(margin, viewportH - estimatedHeight - margin)),
        left,
        width,
      });
    }
  }, []);

  useLayoutEffect(() => {
    if (!dualInfoOpen) return;
    updateDualPopoverPos();
  }, [dualInfoOpen, updateDualPopoverPos]);

  useEffect(() => {
    if (!dualInfoOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (dualInfoRef.current && !dualInfoRef.current.contains(e.target as Node)) {
        setDualInfoOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setDualInfoOpen(false);
      }
    };
    window.addEventListener('resize', updateDualPopoverPos);
    window.addEventListener('scroll', updateDualPopoverPos, true);
    document.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('resize', updateDualPopoverPos);
      window.removeEventListener('scroll', updateDualPopoverPos, true);
      document.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [dualInfoOpen, updateDualPopoverPos]);

  useEffect(() => {
    if (!open) {
      setDualInfoOpen(false);
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !dualInfoOpen) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, dualInfoOpen, onClose]);

  const filteredModels = useMemo(() => {
    const q = modelSearch.trim().toLowerCase();
    return models.filter((m) => {
      if (priceFilter === 'free' && !isFreeOpenRouterModel(m)) return false;
      if (priceFilter === 'paid' && isFreeOpenRouterModel(m)) return false;
      if (!q) return true;
      return m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q);
    });
  }, [models, modelSearch, priceFilter]);

  const filteredSecondaryModels = useMemo(() => {
    const q = secondarySearch.trim().toLowerCase();
    return models
      .filter((m) => {
        if (!q) return true;
        return m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q);
      })
      .slice(0, 60);
  }, [models, secondarySearch]);

  const visibleModels = showAllModels ? filteredModels : filteredModels.slice(0, 80);

  if (!open) return null;

  async function handleSave(nextModel?: string) {
    setSaving(true);
    setError(null);
    setSavedNotice(null);

    try {
      const result = await saveOpenRouterConfig({
        apiKey: apiKeyInput.trim() || undefined,
        model: nextModel ?? selectedModel,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onStatusUpdated(result.status);
      setApiKeyInput('');
      setSavedNotice(isEn ? 'Saved' : 'Gespeichert');
      setTimeout(() => setSavedNotice(null), 2500);
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateDualReview(next: { dualReviewEnabled?: boolean; secondaryModel?: string }) {
    setSavingDual(true);
    setError(null);
    try {
      const result = await saveOpenRouterConfig(next);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onStatusUpdated(result.status);
    } finally {
      setSavingDual(false);
    }
  }

  async function handleRemoveKey() {
    setRemoving(true);
    setError(null);
    setSavedNotice(null);
    try {
      const result = await removeOpenRouterKey();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onStatusUpdated(result.status);
      setSavedNotice(isEn ? 'Key removed' : 'Schlüssel entfernt');
      setTimeout(() => setSavedNotice(null), 2500);
    } finally {
      setRemoving(false);
    }
  }

  async function handleToggleZdr() {
    setSavingZdr(true);
    setError(null);
    try {
      const result = await saveOpenRouterConfig({ enforceZdr: !status.enforceZdr });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onStatusUpdated(result.status);
    } finally {
      setSavingZdr(false);
    }
  }

  async function handleClearEverything() {
    setClearingAll(true);
    setError(null);
    try {
      if (onClearAllData) {
        await onClearAllData();
      } else {
        const reset = await clearAllLocalData();
        onStatusUpdated(reset.status);
      }
      setApiKeyInput('');
      setConfirmClearAll(false);
      setSavedNotice(isEn ? 'All local data deleted' : 'Alle lokalen Daten gelöscht');
      setTimeout(() => setSavedNotice(null), 2500);
    } finally {
      setClearingAll(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={isEn ? 'OpenRouter Configuration' : 'OpenRouter Konfiguration'}
    >
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.16 }}
        className="fixed inset-0 bg-neutral-950/45 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />

      <motion.aside
        initial={{ x: 32, opacity: 0.8 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-lg h-full bg-white dark:bg-[#0B0F17] border-l border-neutral-300 dark:border-neutral-800 flex flex-col shadow-2xl"
      >
        <div className="px-6 py-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <KeyRound className="w-4 h-4 text-neutral-900 dark:text-neutral-100" />
            <h2 className="font-display text-base font-semibold tracking-tight text-neutral-950 dark:text-white">
              {isEn ? 'OpenRouter Configuration' : 'OpenRouter-Konfiguration'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={isEn ? 'Close' : 'Schließen'}
            className="p-2 rounded-md text-neutral-500 hover:text-neutral-950 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:text-white dark:hover:bg-neutral-900 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          <section className="pb-6 border-b border-neutral-200 dark:border-neutral-800 space-y-4">
            <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
              <span className="flex items-center gap-1.5 font-medium text-neutral-700 dark:text-neutral-300">
                <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                {status.source === 'session'
                  ? isEn
                    ? 'Encrypted session'
                    : 'Verschlüsselte Sitzung'
                  : status.source === 'env'
                    ? isEn
                      ? 'Server environment active'
                      : 'Server-Umgebung aktiv'
                    : status.source === 'memory'
                      ? isEn
                        ? 'Direct mode (stored in browser)'
                        : 'Direktmodus (im Browser gespeichert)'
                      : isEn
                        ? 'Not connected'
                        : 'Nicht verbunden'}
              </span>
              {status.keyPreview && (
                <span className="font-mono tabular-nums text-slate-600 dark:text-slate-300">
                  {status.keyPreview}
                </span>
              )}
            </div>

            {status.keyInfo && (
              <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {status.keyInfo.label && <span>{status.keyInfo.label}</span>}
                {typeof status.keyInfo.usage === 'number' && (
                  <>
                    {status.keyInfo.label && <span aria-hidden="true">·</span>}
                    <span>
                      {isEn ? 'Usage' : 'Verbrauch'}: ${status.keyInfo.usage.toFixed(4)}
                    </span>
                  </>
                )}
                {typeof status.keyInfo.limit === 'number' && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>Limit: ${status.keyInfo.limit.toFixed(2)}</span>
                  </>
                )}
              </div>
            )}

            <div className="space-y-2">
              <label
                htmlFor="openrouter-api-key"
                className="block text-sm font-medium text-slate-800 dark:text-slate-200"
              >
                {isEn ? 'OpenRouter API Key' : 'OpenRouter API-Schlüssel'}
              </label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    id="openrouter-api-key"
                    type={showKey ? 'text' : 'password'}
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder={
                      status.configured
                        ? isEn
                          ? 'Enter a new key to replace'
                          : 'Neuen Schlüssel zum Überschreiben eingeben'
                        : 'sk-or-v1-...'
                    }
                    autoComplete="off"
                    className="w-full h-10 pl-3 pr-10 text-sm font-mono rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#080B10] text-neutral-950 dark:text-white focus:outline-none focus:border-neutral-950 dark:focus:border-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((v) => !v)}
                    aria-label={
                      showKey
                        ? isEn
                          ? 'Hide key'
                          : 'Schlüssel verbergen'
                        : isEn
                          ? 'Show key'
                          : 'Schlüssel anzeigen'
                    }
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 cursor-pointer"
                  >
                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                <button
                  type="button"
                  disabled={saving || !apiKeyInput.trim()}
                  onClick={() => handleSave()}
                  className="h-10 px-4 text-xs font-semibold rounded-md bg-neutral-950 dark:bg-white text-white dark:text-neutral-950 hover:bg-neutral-800 dark:hover:bg-neutral-100 disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : isEn ? (
                    'Verify & save'
                  ) : (
                    'Prüfen & speichern'
                  )}
                </button>
              </div>

              {(status.source === 'session' || status.source === 'memory') && (
                <div className="pt-1">
                  <button
                    type="button"
                    disabled={removing}
                    onClick={handleRemoveKey}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-700 dark:text-rose-400 hover:underline cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {isEn ? 'Remove stored key' : 'Hinterlegten Schlüssel entfernen'}
                  </button>
                </div>
              )}
            </div>

            {error && (
              <div className="p-3 rounded-lg border border-rose-200 dark:border-rose-900/70 bg-rose-50 dark:bg-rose-950/40 text-xs text-rose-800 dark:text-rose-200">
                {error}
              </div>
            )}

            {savedNotice && (
              <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                <Check className="w-3.5 h-3.5" />
                <span>{savedNotice}</span>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-medium text-slate-800 dark:text-slate-200">
                {isEn ? 'Active language model' : 'Aktives Sprachmodell'}
              </h3>
              <span className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate max-w-[240px]">
                {selectedModel}
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div
                className="inline-flex items-center p-0.5 rounded-md bg-neutral-100 dark:bg-[#080B10] border border-neutral-200 dark:border-neutral-800"
                role="group"
                aria-label={isEn ? 'Model filter' : 'Modellfilter'}
              >
                {(
                  [
                    { id: 'all', label: isEn ? 'All' : 'Alle' },
                    { id: 'free', label: isEn ? 'Free' : 'Kostenlos' },
                    { id: 'paid', label: isEn ? 'Paid' : 'Kostenpflichtig' },
                  ] as const
                ).map((item) => {
                  const active = priceFilter === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setPriceFilter(item.id);
                        setShowAllModels(false);
                      }}
                      className={`px-2.5 py-1 text-xs font-medium rounded-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        active
                          ? 'bg-neutral-950 dark:bg-white text-white dark:text-neutral-950 font-semibold shadow-2xs'
                          : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-950 dark:hover:text-neutral-200'
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>

              {status.paidModelsUnlocked ? (
                <button
                  type="button"
                  disabled={lockingPaid}
                  onClick={async () => {
                    setLockingPaid(true);
                    try {
                      await onLockPaid();
                    } finally {
                      setLockingPaid(false);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border border-emerald-200 dark:border-emerald-900/70 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100/80 dark:hover:bg-emerald-950/60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {lockingPaid ? <Loader2 className="w-3 h-3 animate-spin" /> : <Unlock className="w-3 h-3" />}
                  {isEn ? 'Lock' : 'Sperren'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onRequestUnlock()}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Lock className="w-3 h-3 text-neutral-400" />
                  {isEn ? 'Unlock' : 'Entsperren'}
                </button>
              )}
            </div>

            <div className="relative">
              <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={modelSearch}
                onChange={(e) => {
                  setModelSearch(e.target.value);
                  setShowAllModels(false);
                }}
                placeholder={
                  isEn
                    ? 'Search model (e.g. claude, gpt-4o, gemini, deepseek)…'
                    : 'Modell suchen (z. B. claude, gpt-4o, gemini, deepseek)…'
                }
                className="w-full h-10 pl-9 pr-3 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#080B10] text-neutral-950 dark:text-white focus:outline-none focus:border-neutral-950 dark:focus:border-white"
              />
            </div>

            <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg divide-y divide-neutral-200 dark:divide-neutral-800 max-h-[340px] overflow-y-auto">
              {modelsLoading && models.length === 0 ? (
                <div className="p-6 text-center text-sm text-neutral-500 dark:text-neutral-400 flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{isEn ? 'Loading OpenRouter models…' : 'OpenRouter-Modelle werden geladen…'}</span>
                </div>
              ) : visibleModels.length === 0 ? (
                <div className="p-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
                  {isEn ? 'No matching models found.' : 'Keine passenden Modelle gefunden.'}
                </div>
              ) : (
                <>
                  {visibleModels.map((m) => {
                    const isActive = selectedModel === m.id;
                    const isFree = isFreeOpenRouterModel(m);
                    const needsPassword = !isFree && !status.paidModelsUnlocked;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          if (needsPassword) {
                            onRequestUnlock(m);
                            return;
                          }
                          setSelectedModel(m.id);
                          handleSave(m.id);
                        }}
                        className={`w-full px-3.5 py-2.5 text-left flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-neutral-100 dark:bg-neutral-800/80'
                            : 'hover:bg-neutral-50 dark:hover:bg-neutral-900/60'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {needsPassword && (
                              <Lock className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
                            )}
                            <span className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                              {m.name}
                            </span>
                          </div>
                          <div className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate">
                            {m.id}
                          </div>
                        </div>
                        <div className="shrink-0 text-right tabular-nums">
                          <div className="text-xs text-slate-600 dark:text-slate-300">
                            {m.promptPricePer1M < 0
                              ? isEn
                                ? 'Variable'
                                : 'Variabel'
                              : isFree
                                ? isEn
                                  ? 'Free'
                                  : 'Kostenlos'
                                : `$${m.promptPricePer1M.toFixed(2)} / $${m.completionPricePer1M.toFixed(2)}`}
                          </div>
                          <div className="text-[11px] text-slate-400 dark:text-slate-500">
                            {m.contextLength
                              ? `${Math.round(m.contextLength / 1000)}k ${isEn ? 'context' : 'Kontext'}`
                              : ''}
                          </div>
                        </div>
                      </button>
                    );
                  })}

                  {!showAllModels && filteredModels.length > 80 && (
                    <div className="p-2.5 text-center">
                      <button
                        type="button"
                        onClick={() => setShowAllModels(true)}
                        className="text-xs font-medium text-neutral-900 dark:text-neutral-100 hover:underline cursor-pointer tabular-nums"
                      >
                        {isEn
                          ? `Show all ${filteredModels.length} models`
                          : `Alle ${filteredModels.length} Modelle anzeigen`}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </section>

          {/* Zero Data Retention (ZDR) */}
          <section className="pt-6 border-t border-neutral-200 dark:border-neutral-800 space-y-2.5">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-0.5">
                <h3 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                  {isEn ? 'Enforce Zero Data Retention (ZDR)' : 'Zero Data Retention (ZDR) erzwingen'}
                </h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
                  {isEn ? (
                    <>
                      Routes OpenRouter requests only to providers without prompt logging or training (
                      <span className="font-mono">zdr: true</span>, <span className="font-mono">data_collection: deny</span>).
                    </>
                  ) : (
                    <>
                      Routet Anfragen über OpenRouter nur an Provider ohne Prompt-Speicherung und Training (
                      <span className="font-mono">zdr: true</span>, <span className="font-mono">data_collection: deny</span>).
                    </>
                  )}
                </p>
              </div>
              <button
                type="button"
                disabled={savingZdr}
                aria-pressed={Boolean(status.enforceZdr)}
                onClick={handleToggleZdr}
                className={`px-3 py-1 text-xs font-semibold rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  status.enforceZdr
                    ? 'border-neutral-950 dark:border-white bg-neutral-950 dark:bg-white text-white dark:text-neutral-950'
                    : 'border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                }`}
              >
                {status.enforceZdr ? (isEn ? 'On' : 'Aktiv') : isEn ? 'Off' : 'Aus'}
              </button>
            </div>
            {status.enforceZdr && (status.model === 'openrouter/free' || status.model.endsWith(':free')) && (
              <div className="p-2.5 rounded-md border border-amber-300/80 dark:border-amber-800/70 bg-amber-50/70 dark:bg-amber-950/30 text-[11.5px] text-amber-900 dark:text-amber-200 leading-relaxed">
                {isEn ? (
                  <>
                    Note: Many free <span className="font-mono">:free</span> models do not support ZDR. If no matching endpoints are found, pick a paid ZDR-compatible model or disable ZDR.
                  </>
                ) : (
                  <>
                    Hinweis: Viele kostenlose <span className="font-mono">:free</span>-Modelle unterstützen kein ZDR. Falls keine passenden Endpoints gefunden werden, wähle ein bezahltes ZDR-fähiges Modell oder schalte ZDR aus.
                  </>
                )}
              </div>
            )}
          </section>

          <section className="pt-6 border-t border-neutral-200 dark:border-neutral-800 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div ref={dualInfoRef} className="inline-flex items-center gap-1.5">
                <h3 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                  {isEn ? 'Two-Person Review' : 'Zwei-Augen-Prinzip'}
                </h3>
                <button
                  ref={dualInfoBtnRef}
                  type="button"
                  onClick={() => {
                    if (!dualInfoOpen) {
                      updateDualPopoverPos();
                    }
                    setDualInfoOpen((v) => !v);
                  }}
                  aria-expanded={dualInfoOpen}
                  aria-label={isEn ? 'Info about Two-Person Review' : 'Info zum Zwei-Augen-Prinzip'}
                  className={`p-1 rounded-md border transition-colors cursor-pointer ${
                    dualInfoOpen
                      ? 'border-neutral-950 dark:border-white bg-neutral-950 dark:bg-white text-white dark:text-neutral-950'
                      : 'border-neutral-300 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400 hover:text-neutral-950 dark:hover:text-white'
                  }`}
                >
                  <AlertCircle className="w-3.5 h-3.5" />
                </button>

                <AnimatePresence>
                  {dualInfoOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 6, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 4, scale: 0.98 }}
                      transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                      role="dialog"
                      aria-label={isEn ? 'Two-Person Review explanation' : 'Erklärung zum Zwei-Augen-Prinzip'}
                      style={{
                        top: dualPopoverPos.top,
                        bottom: dualPopoverPos.bottom,
                        left: dualPopoverPos.left,
                        width: dualPopoverPos.width,
                      }}
                      className="fixed z-60 max-w-[calc(100vw-24px)] p-4 rounded-lg border border-neutral-300 dark:border-neutral-800 bg-white dark:bg-[#0B0F17] shadow-xl space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-neutral-950 dark:text-white">
                          {isEn ? 'Two-Person Review' : 'Zwei-Augen-Prinzip'}
                        </span>
                        <button
                          type="button"
                          onClick={() => setDualInfoOpen(false)}
                          aria-label={isEn ? 'Close info' : 'Info schließen'}
                          className="p-0.5 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="space-y-2 text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
                        <div>
                          <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                            {isEn ? 'On:' : 'An:'}
                          </span>{' '}
                          {isEn
                            ? 'After the initial pass by the primary model, a second review model independently checks the draft against the original text for overlooked mistakes.'
                            : 'Nach dem Erstlauf durch das Hauptmodell prüft ein zweites Prüfmodell den Entwurf unabhängig anhand des Originals auf übersehene Fehler.'}
                        </div>
                        <div className="pt-2 border-t border-neutral-200/80 dark:border-neutral-800">
                          <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                            {isEn ? 'Off:' : 'Aus:'}
                          </span>{' '}
                          {isEn ? (
                            <>
                              Single pass by the primary model. You can still trigger a manual check anytime via{' '}
                              <span className="font-medium text-neutral-800 dark:text-neutral-200">Verify</span>.
                            </>
                          ) : (
                            <>
                              Nur ein Durchgang durch das Hauptmodell. Bei Bedarf jederzeit manuell über{' '}
                              <span className="font-medium text-neutral-800 dark:text-neutral-200">Nachprüfen</span> auslösbar.
                            </>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <button
                type="button"
                disabled={savingDual}
                aria-pressed={status.dualReviewEnabled}
                onClick={() => handleUpdateDualReview({ dualReviewEnabled: !status.dualReviewEnabled })}
                className={`px-3 py-1 text-xs font-semibold rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  status.dualReviewEnabled
                    ? 'border-neutral-950 dark:border-white bg-neutral-950 dark:bg-white text-white dark:text-neutral-950'
                    : 'border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                }`}
              >
                {status.dualReviewEnabled ? (isEn ? 'On' : 'Aktiv') : isEn ? 'Off' : 'Aus'}
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 text-xs text-neutral-500 dark:text-neutral-400">
              <span>{isEn ? 'Review model' : 'Prüfmodell'}</span>
              <span className="font-mono truncate max-w-[240px] text-neutral-700 dark:text-neutral-300">
                {status.secondaryModel}
              </span>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={secondarySearch}
                onChange={(e) => setSecondarySearch(e.target.value)}
                placeholder={isEn ? 'Search review model…' : 'Prüfmodell suchen…'}
                className="w-full h-9 pl-8 pr-3 text-xs rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#080B10] text-neutral-950 dark:text-white focus:outline-none focus:border-neutral-950 dark:focus:border-white"
              />
            </div>

            <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg divide-y divide-neutral-200 dark:divide-neutral-800 max-h-[210px] overflow-y-auto">
              {filteredSecondaryModels.map((m) => {
                const isActive = status.secondaryModel === m.id;
                const isFree = isFreeOpenRouterModel(m);
                const needsPassword = !isFree && !status.paidModelsUnlocked;
                return (
                  <button
                    key={m.id}
                    type="button"
                    disabled={savingDual}
                    onClick={() => {
                      if (needsPassword) {
                        onRequestUnlock(m, 'secondary');
                        return;
                      }
                      handleUpdateDualReview({ secondaryModel: m.id });
                    }}
                    className={`w-full px-3 py-2 text-left flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-neutral-100 dark:bg-neutral-800/80'
                        : 'hover:bg-neutral-50 dark:hover:bg-neutral-900/60'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {needsPassword && (
                          <Lock className="w-3 h-3 text-neutral-400 dark:text-neutral-500 shrink-0" />
                        )}
                        <span className="text-xs font-medium text-neutral-900 dark:text-neutral-100 truncate">
                          {m.name}
                        </span>
                      </div>
                      <div className="text-[11px] font-mono text-neutral-500 dark:text-neutral-400 truncate">
                        {m.id}
                      </div>
                    </div>
                    <div className="shrink-0 text-right tabular-nums text-[11px] text-neutral-500 dark:text-neutral-400">
                      {m.promptPricePer1M < 0
                        ? isEn
                          ? 'Variable'
                          : 'Variabel'
                        : isFree
                          ? isEn
                            ? 'Free'
                            : 'Kostenlos'
                          : `$${m.promptPricePer1M.toFixed(2)}`}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Alle lokalen Daten löschen */}
          <section className="pt-6 border-t border-neutral-200 dark:border-neutral-800 space-y-2.5">
            <div className="space-y-0.5">
              <h3 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                {isEn ? 'Reset local storage' : 'Lokalen Speicher zurücksetzen'}
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
                {isEn
                  ? 'Completely removes your API key, model selection, glossary, rules, options, history, and UI preferences from this browser.'
                  : 'Entfernt API-Key, Modellwahl, Wörterbuch, Regeln, Optionen, Verlauf sowie Design-Präferenz vollständig aus diesem Browser.'}
              </p>
            </div>
            {confirmClearAll ? (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  disabled={clearingAll}
                  onClick={handleClearEverything}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {clearingAll
                    ? isEn
                      ? 'Deleting…'
                      : 'Löscht…'
                    : isEn
                      ? 'Really delete everything'
                      : 'Wirklich alles löschen'}
                </button>
                <button
                  type="button"
                  disabled={clearingAll}
                  onClick={() => setConfirmClearAll(false)}
                  className="px-3 py-1.5 text-xs font-medium rounded-md border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
                >
                  {isEn ? 'Cancel' : 'Abbrechen'}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmClearAll(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-rose-300 dark:border-rose-900/70 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {isEn ? 'Delete all data' : 'Alle Daten löschen'}
              </button>
            )}
          </section>
        </div>
      </motion.aside>
    </div>
  );
}
