import { useEffect, useState } from 'react';
import { Check, Gauge, Info, RotateCcw, Settings, X } from 'lucide-react';
import { DEFAULT_WORKSPACE_SETTINGS, TRANSLATABLE_LANGUAGES, WRITING_STYLES } from '../types';
import type {
  RewriteMode,
  SourceLanguageId,
  TargetLanguageId,
  TranslationTone,
  WritingPreferences,
  WritingStyleId,
} from '../types';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  preferences: WritingPreferences;
  onUpdatePreferences: (next: WritingPreferences) => Promise<void>;
}

export function SettingsModal({
  open,
  onClose,
  preferences,
  onUpdatePreferences,
}: SettingsModalProps) {
  const currentSettings = {
    ...DEFAULT_WORKSPACE_SETTINGS,
    ...(preferences.settings || {}),
  };

  const [defaultSourceLang, setDefaultSourceLang] = useState<SourceLanguageId>(currentSettings.defaultSourceLang);
  const [defaultTargetLang, setDefaultTargetLang] = useState<TargetLanguageId>(currentSettings.defaultTargetLang);
  const [defaultWriteMode, setDefaultWriteMode] = useState<RewriteMode>(currentSettings.defaultWriteMode);
  const [defaultWriteStyle, setDefaultWriteStyle] = useState<WritingStyleId>(currentSettings.defaultWriteStyle);
  const [defaultTranslationTone, setDefaultTranslationTone] = useState<TranslationTone>(currentSettings.defaultTranslationTone);
  const [defaultInstantMode, setDefaultInstantMode] = useState<boolean>(currentSettings.defaultInstantMode);
  const [defaultChunkingEnabled, setDefaultChunkingEnabled] = useState<boolean>(currentSettings.defaultChunkingEnabled);

  // RPM & Rate-Limit Protection Settings
  const [typingDebounceMs, setTypingDebounceMs] = useState<number>(currentSettings.typingDebounceMs);
  const [pasteDebounceMs, setPasteDebounceMs] = useState<number>(currentSettings.pasteDebounceMs);
  const [chunkMaxChars, setChunkMaxChars] = useState<number>(currentSettings.chunkMaxChars);
  const [minRequestSpacingMs, setMinRequestSpacingMs] = useState<number>(currentSettings.minRequestSpacingMs);
  const [freeModelConcurrency, setFreeModelConcurrency] = useState<number>(currentSettings.freeModelConcurrency);
  const [paidModelConcurrency, setPaidModelConcurrency] = useState<number>(currentSettings.paidModelConcurrency);
  const [rateLimitRetries, setRateLimitRetries] = useState<number>(currentSettings.rateLimitRetries);
  const [skipAnalyzeOnRateLimit, setSkipAnalyzeOnRateLimit] = useState<boolean>(currentSettings.skipAnalyzeOnRateLimit);

  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!open) return;
    const merged = {
      ...DEFAULT_WORKSPACE_SETTINGS,
      ...(preferences.settings || {}),
    };
    setDefaultSourceLang(merged.defaultSourceLang);
    setDefaultTargetLang(merged.defaultTargetLang);
    setDefaultWriteMode(merged.defaultWriteMode);
    setDefaultWriteStyle(merged.defaultWriteStyle);
    setDefaultTranslationTone(merged.defaultTranslationTone);
    setDefaultInstantMode(merged.defaultInstantMode);
    setDefaultChunkingEnabled(merged.defaultChunkingEnabled);
    setTypingDebounceMs(merged.typingDebounceMs);
    setPasteDebounceMs(merged.pasteDebounceMs);
    setChunkMaxChars(merged.chunkMaxChars);
    setMinRequestSpacingMs(merged.minRequestSpacingMs);
    setFreeModelConcurrency(merged.freeModelConcurrency);
    setPaidModelConcurrency(merged.paidModelConcurrency);
    setRateLimitRetries(merged.rateLimitRetries);
    setSkipAnalyzeOnRateLimit(merged.skipAnalyzeOnRateLimit);
  }, [open, preferences.settings]);

  if (!open) return null;

  function handleResetRpmDefaults() {
    setTypingDebounceMs(DEFAULT_WORKSPACE_SETTINGS.typingDebounceMs);
    setPasteDebounceMs(DEFAULT_WORKSPACE_SETTINGS.pasteDebounceMs);
    setChunkMaxChars(DEFAULT_WORKSPACE_SETTINGS.chunkMaxChars);
    setMinRequestSpacingMs(DEFAULT_WORKSPACE_SETTINGS.minRequestSpacingMs);
    setFreeModelConcurrency(DEFAULT_WORKSPACE_SETTINGS.freeModelConcurrency);
    setPaidModelConcurrency(DEFAULT_WORKSPACE_SETTINGS.paidModelConcurrency);
    setRateLimitRetries(DEFAULT_WORKSPACE_SETTINGS.rateLimitRetries);
    setSkipAnalyzeOnRateLimit(DEFAULT_WORKSPACE_SETTINGS.skipAnalyzeOnRateLimit);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const nextPrefs: WritingPreferences = {
      ...preferences,
      settings: {
        defaultSourceLang,
        defaultTargetLang,
        enabledLanguages: currentSettings.enabledLanguages,
        defaultWriteMode,
        defaultWriteStyle,
        defaultTranslationTone,
        defaultInstantMode,
        defaultChunkingEnabled,
        typingDebounceMs: Math.min(3000, Math.max(250, Math.round(typingDebounceMs))),
        pasteDebounceMs: Math.min(1500, Math.max(50, Math.round(pasteDebounceMs))),
        chunkMaxChars: Math.min(6000, Math.max(600, Math.round(chunkMaxChars))),
        minRequestSpacingMs: Math.min(3000, Math.max(0, Math.round(minRequestSpacingMs))),
        freeModelConcurrency: Math.min(4, Math.max(1, Math.round(freeModelConcurrency))),
        paidModelConcurrency: Math.min(4, Math.max(1, Math.round(paidModelConcurrency))),
        rateLimitRetries: Math.min(4, Math.max(0, Math.round(rateLimitRetries))),
        skipAnalyzeOnRateLimit,
      },
    };
    await onUpdatePreferences(nextPrefs);
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 600);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="fixed inset-0 bg-neutral-950/50 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />

      <div className="relative z-10 w-full max-w-2xl max-h-[90vh] flex flex-col rounded-lg border border-neutral-300 dark:border-neutral-800 bg-white dark:bg-[#0D1119] shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-2.5">
            <Settings className="w-4 h-4 text-neutral-950 dark:text-white" />
            <h2 className="font-display text-base font-semibold text-neutral-950 dark:text-white">
              Optionen &amp; Standardwerte
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Optionen schließen"
            className="p-2 rounded-md text-neutral-500 hover:text-neutral-950 dark:text-neutral-400 dark:hover:text-neutral-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="flex flex-col min-h-0 flex-1">
          <div className="p-6 space-y-6 overflow-y-auto flex-1">
            {/* Section 1: Workspace Defaults */}
            <section className="space-y-4">
              <h3 className="text-xs font-mono uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                Editor &amp; Übersetzung
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    Standardsprache (Ausgangssprache)
                  </label>
                  <select
                    value={defaultSourceLang}
                    onChange={(e) => setDefaultSourceLang(e.target.value as SourceLanguageId)}
                    className="w-full h-9 px-3 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-950 dark:text-neutral-100 focus:outline-none focus:border-neutral-950 dark:focus:border-white"
                  >
                    {TRANSLATABLE_LANGUAGES.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    Standard-Zielsprache (Übersetzung)
                  </label>
                  <select
                    value={defaultTargetLang}
                    onChange={(e) => setDefaultTargetLang(e.target.value as TargetLanguageId)}
                    className="w-full h-9 px-3 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-950 dark:text-neutral-100 focus:outline-none focus:border-neutral-950 dark:focus:border-white"
                  >
                    {TRANSLATABLE_LANGUAGES.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    Standard-Modus
                  </label>
                  <select
                    value={defaultWriteMode}
                    onChange={(e) => setDefaultWriteMode(e.target.value as RewriteMode)}
                    className="w-full h-9 px-3 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-950 dark:text-neutral-100 focus:outline-none focus:border-neutral-950 dark:focus:border-white"
                  >
                    <option value="correction">Nur Korrektur</option>
                    <option value="style">Stil &amp; Korrektur</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    Standard-Stil
                  </label>
                  <select
                    value={defaultWriteStyle}
                    onChange={(e) => setDefaultWriteStyle(e.target.value as WritingStyleId)}
                    className="w-full h-9 px-3 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-950 dark:text-neutral-100 focus:outline-none focus:border-neutral-950 dark:focus:border-white"
                  >
                    {WRITING_STYLES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    Standard-Tonalität (Übersetzung)
                  </label>
                  <select
                    value={defaultTranslationTone}
                    onChange={(e) => setDefaultTranslationTone(e.target.value as TranslationTone)}
                    className="w-full h-9 px-3 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-950 dark:text-neutral-100 focus:outline-none focus:border-neutral-950 dark:focus:border-white"
                  >
                    <option value="neutral">Neutral / Natürlich</option>
                    <option value="formal">Förmlich (Sie / Formal)</option>
                    <option value="informal">Locker (Du / Informal)</option>
                  </select>
                </div>
              </div>

              <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 dark:border-neutral-800">
                <div className="space-y-0.5">
                  <div className="text-xs font-medium text-neutral-950 dark:text-white">Startverhalten</div>
                  <div className="text-[11px] text-neutral-500 dark:text-neutral-400">Standardmäßig beim Öffnen aktiv</div>
                </div>
                <div className="flex items-center gap-4">
                  <label className="inline-flex items-center gap-2 text-xs text-neutral-700 dark:text-neutral-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={defaultInstantMode}
                      onChange={(e) => setDefaultInstantMode(e.target.checked)}
                      className="rounded-sm border-neutral-400 text-neutral-950 focus:ring-neutral-900"
                    />
                    Sofort-Modus
                  </label>
                  <label className="inline-flex items-center gap-2 text-xs text-neutral-700 dark:text-neutral-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={defaultChunkingEnabled}
                      onChange={(e) => setDefaultChunkingEnabled(e.target.checked)}
                      className="rounded-sm border-neutral-400 text-neutral-950 focus:ring-neutral-900"
                    />
                    Absatz-Chunking
                  </label>
                </div>
              </div>
            </section>

            {/* Section 2: RPM & Rate-Limit Protection */}
            <section className="pt-5 border-t border-neutral-200 dark:border-neutral-800 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Gauge className="w-4 h-4 text-neutral-950 dark:text-white" />
                  <h3 className="text-xs font-mono uppercase tracking-wider text-neutral-900 dark:text-neutral-100 font-semibold">
                    Anfrage-Schutz &amp; Requests per Minute (RPM)
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={handleResetRpmDefaults}
                  className="inline-flex items-center gap-1.5 text-[11px] font-mono text-neutral-600 dark:text-neutral-400 hover:text-neutral-950 dark:hover:text-white cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  RPM-Standards wiederherstellen
                </button>
              </div>

              <div className="p-3.5 rounded-md bg-neutral-50 dark:bg-[#080B10] border border-neutral-200 dark:border-neutral-800 flex gap-2.5 text-xs leading-relaxed text-neutral-700 dark:text-neutral-300">
                <Info className="w-4 h-4 shrink-0 mt-0.5 text-neutral-500 dark:text-neutral-400" />
                <div>
                  Kostenlose Modell-Endpunkte (<span className="font-mono">:free</span>) drosseln oft schon ab wenigen Anfragen pro Minute (RPM) oder verbieten parallele Requests komplett. Die Standardwerte unten halten die Anfragezahl bewusst niedrig, ohne das Schreibgefühl spürbar auszubremsen.
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Typing Debounce */}
                <div className="p-3 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#0A0D14] space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor="opt-typing-debounce" className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                      Tipp-Pause (Sofort-Modus)
                    </label>
                    <span className="text-xs font-mono tabular-nums text-neutral-950 dark:text-white">
                      {typingDebounceMs} ms
                    </span>
                  </div>
                  <input
                    id="opt-typing-debounce"
                    type="range"
                    min={250}
                    max={3000}
                    step={50}
                    value={typingDebounceMs}
                    onChange={(e) => setTypingDebounceMs(Number(e.target.value))}
                    className="w-full accent-neutral-950 dark:accent-white cursor-pointer"
                  />
                  <p className="text-[11px] leading-snug text-neutral-500 dark:text-neutral-400">
                    <span className="font-mono text-neutral-700 dark:text-neutral-300">Standard 1100 ms:</span>{' '}
                    Wartet bis zu einer natürlichen Satzpause statt bei jedem Zwischenwort zu feuern – reduziert Tipp-Anfragen deutlich (vorher 420 ms).
                  </p>
                </div>

                {/* Paste Debounce */}
                <div className="p-3 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#0A0D14] space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor="opt-paste-debounce" className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                      Einfüge-Puffer (Paste)
                    </label>
                    <span className="text-xs font-mono tabular-nums text-neutral-950 dark:text-white">
                      {pasteDebounceMs} ms
                    </span>
                  </div>
                  <input
                    id="opt-paste-debounce"
                    type="range"
                    min={50}
                    max={1500}
                    step={50}
                    value={pasteDebounceMs}
                    onChange={(e) => setPasteDebounceMs(Number(e.target.value))}
                    className="w-full accent-neutral-950 dark:accent-white cursor-pointer"
                  />
                  <p className="text-[11px] leading-snug text-neutral-500 dark:text-neutral-400">
                    <span className="font-mono text-neutral-700 dark:text-neutral-300">Standard 250 ms:</span>{' '}
                    Startet nach Strg+V zügig, fängt aber versehentliche Doppel-Einfügungen direkt hintereinander ab (vorher 60 ms).
                  </p>
                </div>

                {/* Chunk Max Chars */}
                <div className="p-3 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#0A0D14] space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor="opt-chunk-chars" className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                      Absatz-Chunk-Größe
                    </label>
                    <span className="text-xs font-mono tabular-nums text-neutral-950 dark:text-white">
                      {chunkMaxChars} Zeichen
                    </span>
                  </div>
                  <input
                    id="opt-chunk-chars"
                    type="range"
                    min={600}
                    max={6000}
                    step={200}
                    value={chunkMaxChars}
                    onChange={(e) => setChunkMaxChars(Number(e.target.value))}
                    className="w-full accent-neutral-950 dark:accent-white cursor-pointer"
                  />
                  <p className="text-[11px] leading-snug text-neutral-500 dark:text-neutral-400">
                    <span className="font-mono text-neutral-700 dark:text-neutral-300">Standard 2400 Zeichen:</span>{' '}
                    Bündelt typische mehrteilige Texte in einer einzigen Anfrage statt sie unnötig in viele RPM-Einzelaufrufe zu zerlegen (vorher 1200).
                  </p>
                </div>

                {/* Min Request Spacing */}
                <div className="p-3 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#0A0D14] space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor="opt-spacing" className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                      Mindestabstand zwischen Requests
                    </label>
                    <span className="text-xs font-mono tabular-nums text-neutral-950 dark:text-white">
                      {minRequestSpacingMs} ms
                    </span>
                  </div>
                  <input
                    id="opt-spacing"
                    type="range"
                    min={0}
                    max={2500}
                    step={50}
                    value={minRequestSpacingMs}
                    onChange={(e) => setMinRequestSpacingMs(Number(e.target.value))}
                    className="w-full accent-neutral-950 dark:accent-white cursor-pointer"
                  />
                  <p className="text-[11px] leading-snug text-neutral-500 dark:text-neutral-400">
                    <span className="font-mono text-neutral-700 dark:text-neutral-300">Standard 450 ms:</span>{' '}
                    Erzwingt eine kurze Taktung zwischen aufeinanderfolgenden OpenRouter-Calls, damit Burst-Limits nicht sofort anschlagen.
                  </p>
                </div>

                {/* Free Model Concurrency */}
                <div className="p-3 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#0A0D14] space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor="opt-free-conc" className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                      Parallelität (<span className="font-mono">:free</span>-Modelle)
                    </label>
                    <span className="text-xs font-mono tabular-nums text-neutral-950 dark:text-white">
                      {freeModelConcurrency}×
                    </span>
                  </div>
                  <select
                    id="opt-free-conc"
                    value={freeModelConcurrency}
                    onChange={(e) => setFreeModelConcurrency(Number(e.target.value))}
                    className="w-full h-8 px-2.5 text-xs rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-950 dark:text-neutral-100"
                  >
                    <option value={1}>1 (Sequenziell – empfohlen)</option>
                    <option value={2}>2 gleichzeitig</option>
                    <option value={3}>3 gleichzeitig</option>
                    <option value={4}>4 gleichzeitig</option>
                  </select>
                  <p className="text-[11px] leading-snug text-neutral-500 dark:text-neutral-400">
                    <span className="font-mono text-neutral-700 dark:text-neutral-300">Standard 1×:</span>{' '}
                    Viele Free-Anbieter blockieren zeitgleiche Requests sofort mit HTTP 429. Sequenzielle Chunks vermeiden diese Spitzen.
                  </p>
                </div>

                {/* Paid Model Concurrency */}
                <div className="p-3 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#0A0D14] space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor="opt-paid-conc" className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                      Parallelität (Bezahl-Modelle)
                    </label>
                    <span className="text-xs font-mono tabular-nums text-neutral-950 dark:text-white">
                      {paidModelConcurrency}×
                    </span>
                  </div>
                  <select
                    id="opt-paid-conc"
                    value={paidModelConcurrency}
                    onChange={(e) => setPaidModelConcurrency(Number(e.target.value))}
                    className="w-full h-8 px-2.5 text-xs rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-950 dark:text-neutral-100"
                  >
                    <option value={1}>1 (Sequenziell)</option>
                    <option value={2}>2 gleichzeitig (empfohlen)</option>
                    <option value={3}>3 gleichzeitig</option>
                    <option value={4}>4 gleichzeitig</option>
                  </select>
                  <p className="text-[11px] leading-snug text-neutral-500 dark:text-neutral-400">
                    <span className="font-mono text-neutral-700 dark:text-neutral-300">Standard 2×:</span>{' '}
                    Halbiert den gleichzeitigen Burst gegenüber früheren 4×-Requests und schont auch knappe Provider-Kontingente.
                  </p>
                </div>

                {/* Auto Retries */}
                <div className="p-3 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#0A0D14] space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor="opt-retries" className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                      Auto-Neuversuche bei 429 / 503
                    </label>
                    <span className="text-xs font-mono tabular-nums text-neutral-950 dark:text-white">
                      {rateLimitRetries}×
                    </span>
                  </div>
                  <select
                    id="opt-retries"
                    value={rateLimitRetries}
                    onChange={(e) => setRateLimitRetries(Number(e.target.value))}
                    className="w-full h-8 px-2.5 text-xs rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-950 dark:text-neutral-100"
                  >
                    <option value={0}>0 (Keine Neuversuche)</option>
                    <option value={1}>1 Neuversuch</option>
                    <option value={2}>2 Neuversuche (empfohlen)</option>
                    <option value={3}>3 Neuversuche</option>
                    <option value={4}>4 Neuversuche</option>
                  </select>
                  <p className="text-[11px] leading-snug text-neutral-500 dark:text-neutral-400">
                    <span className="font-mono text-neutral-700 dark:text-neutral-300">Standard 2×:</span>{' '}
                    Wartet automatisch anhand des <span className="font-mono">Retry-After</span>-Headers (oder Backoff ~3 s / ~6 s), statt sofort abzubrechen.
                  </p>
                </div>

                {/* Analyze Cooldown Toggle */}
                <div className="p-3 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#0A0D14] space-y-2 flex flex-col justify-between">
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor="opt-skip-analyze" className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                      Analyse-Cooldown (25 s)
                    </label>
                    <input
                      id="opt-skip-analyze"
                      type="checkbox"
                      checked={skipAnalyzeOnRateLimit}
                      onChange={(e) => setSkipAnalyzeOnRateLimit(e.target.checked)}
                      className="rounded-sm border-neutral-400 text-neutral-950 focus:ring-neutral-900 cursor-pointer"
                    />
                  </div>
                  <p className="text-[11px] leading-snug text-neutral-500 dark:text-neutral-400">
                    <span className="font-mono text-neutral-700 dark:text-neutral-300">Standard An:</span>{' '}
                    Überspringt nach einem 429-Vorfall die optionale KI-Änderungskategorisierung für 25 s und nutzt die lokale Auswertung, um keine Extra-RPM-Calls zu verbrauchen.
                  </p>
                </div>
              </div>
            </section>
          </div>

          <div className="px-6 py-4 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-end gap-3 shrink-0 bg-neutral-50/70 dark:bg-[#0A0D14]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium rounded-md border border-neutral-300 dark:border-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-md bg-neutral-950 dark:bg-white text-white dark:text-neutral-950 hover:bg-neutral-800 dark:hover:bg-neutral-200 cursor-pointer"
            >
              {saved ? <Check className="w-3.5 h-3.5" /> : null}
              {saved ? 'Gespeichert' : 'Speichern'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
