import { useState } from 'react';
import { Check, Settings, X } from 'lucide-react';
import { TRANSLATABLE_LANGUAGES, WRITING_STYLES } from '../types';
import type { RewriteMode, SourceLanguageId, TargetLanguageId, TranslationTone, WritingPreferences, WritingStyleId } from '../types';

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
  const currentSettings = preferences.settings || {
    defaultSourceLang: 'auto' as SourceLanguageId,
    defaultTargetLang: 'en-US' as TargetLanguageId,
    enabledLanguages: ['de', 'en-US', 'en-GB', 'fr', 'es', 'it', 'nl', 'pt', 'pl'] as TargetLanguageId[],
    defaultWriteMode: 'style' as RewriteMode,
    defaultWriteStyle: 'ausgewogen' as WritingStyleId,
    defaultTranslationTone: 'neutral' as TranslationTone,
    defaultInstantMode: true,
    defaultChunkingEnabled: true,
  };

  const [defaultSourceLang, setDefaultSourceLang] = useState<SourceLanguageId>(currentSettings.defaultSourceLang);
  const [defaultTargetLang, setDefaultTargetLang] = useState<TargetLanguageId>(currentSettings.defaultTargetLang);
  const [defaultWriteMode, setDefaultWriteMode] = useState<RewriteMode>(currentSettings.defaultWriteMode);
  const [defaultWriteStyle, setDefaultWriteStyle] = useState<WritingStyleId>(currentSettings.defaultWriteStyle);
  const [defaultTranslationTone, setDefaultTranslationTone] = useState<TranslationTone>(currentSettings.defaultTranslationTone);
  const [defaultInstantMode, setDefaultInstantMode] = useState<boolean>(currentSettings.defaultInstantMode);
  const [defaultChunkingEnabled, setDefaultChunkingEnabled] = useState<boolean>(currentSettings.defaultChunkingEnabled);
  const [saved, setSaved] = useState(false);

  if (!open) return null;

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
      <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />

      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1119] shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Settings className="w-4 h-4 text-blue-700 dark:text-blue-400" />
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              Standard-Einstellungen
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-5">
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Standardsprache (Ausgangssprache)
            </label>
            <select
              value={defaultSourceLang}
              onChange={(e) => setDefaultSourceLang(e.target.value as SourceLanguageId)}
              className="w-full h-10 px-3 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-600"
            >
              {TRANSLATABLE_LANGUAGES.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Standard-Zielsprache (für Übersetzung)
            </label>
            <select
              value={defaultTargetLang}
              onChange={(e) => setDefaultTargetLang(e.target.value as TargetLanguageId)}
              className="w-full h-10 px-3 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-600"
            >
              {TRANSLATABLE_LANGUAGES.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Standard-Modus
              </label>
              <select
                value={defaultWriteMode}
                onChange={(e) => setDefaultWriteMode(e.target.value as RewriteMode)}
                className="w-full h-10 px-3 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-600"
              >
                <option value="correction">Nur Korrektur</option>
                <option value="style">Stil & Korrektur</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Standard-Stil
              </label>
              <select
                value={defaultWriteStyle}
                onChange={(e) => setDefaultWriteStyle(e.target.value as WritingStyleId)}
                className="w-full h-10 px-3 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-600"
              >
                {WRITING_STYLES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Standard-Tonalität (Übersetzung)
            </label>
            <select
              value={defaultTranslationTone}
              onChange={(e) => setDefaultTranslationTone(e.target.value as TranslationTone)}
              className="w-full h-10 px-3 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-600"
            >
              <option value="neutral">Neutral / Natürlich</option>
              <option value="formal">Förmlich (Sie / Formal)</option>
              <option value="informal">Locker (Du / Informal)</option>
            </select>
          </div>

          <div className="pt-2 flex items-center justify-between border-t border-slate-200 dark:border-slate-800">
            <div className="space-y-0.5">
              <div className="text-xs font-medium text-slate-900 dark:text-white">Sofort-Modus &amp; Chunking</div>
              <div className="text-[11px] text-slate-500">Standardmäßig aktiv beim Start</div>
            </div>
            <div className="flex items-center gap-2">
              <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={defaultInstantMode}
                  onChange={(e) => setDefaultInstantMode(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                Sofort-Modus
              </label>
              <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={defaultChunkingEnabled}
                  onChange={(e) => setDefaultChunkingEnabled(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                Chunking
              </label>
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-blue-700 text-white hover:bg-blue-800 cursor-pointer"
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
