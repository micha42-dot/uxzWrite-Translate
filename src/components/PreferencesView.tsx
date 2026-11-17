import { useRef, useState } from 'react';
import { Check, Download, Pencil, Plus, Trash2, Upload, X } from 'lucide-react';
import { useUiLang } from '../lib/i18n';
import type { ProtectedTerm, WritingPreferences, WritingRule } from '../types';

interface PreferencesViewProps {
  preferences: WritingPreferences;
  loading: boolean;
  onUpdatePreferences: (next: WritingPreferences) => Promise<void>;
}

export function PreferencesView({
  preferences,
  loading,
  onUpdatePreferences,
}: PreferencesViewProps) {
  const { uiLang } = useUiLang();
  const isEn = uiLang === 'en';

  const [termInput, setTermInput] = useState('');
  const [termCaseSensitive, setTermCaseSensitive] = useState(true);

  const [ruleTitle, setRuleTitle] = useState('');
  const [ruleInstruction, setRuleInstruction] = useState('');

  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [editRuleTitle, setEditRuleTitle] = useState('');
  const [editRuleInstruction, setEditRuleInstruction] = useState('');
  const [importError, setImportError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeTermCount = preferences.terms.filter((t) => t.enabled).length;
  const activeRuleCount = preferences.rules.filter((r) => r.enabled).length;

  async function handleAddTerms(e: React.FormEvent) {
    e.preventDefault();
    const parts = termInput
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) return;

    const existingSet = new Set(preferences.terms.map((t) => t.term.toLowerCase()));
    const added: ProtectedTerm[] = [];
    for (const part of parts) {
      if (existingSet.has(part.toLowerCase())) continue;
      existingSet.add(part.toLowerCase());
      added.push({
        id: crypto.randomUUID(),
        term: part,
        caseSensitive: termCaseSensitive,
        enabled: true,
      });
    }

    if (added.length > 0) {
      await onUpdatePreferences({
        ...preferences,
        terms: [...added, ...preferences.terms],
      });
    }
    setTermInput('');
  }

  async function handleToggleTerm(id: string) {
    await onUpdatePreferences({
      ...preferences,
      terms: preferences.terms.map((t) => (t.id === id ? { ...t, enabled: !t.enabled } : t)),
    });
  }

  async function handleToggleTermCase(id: string) {
    await onUpdatePreferences({
      ...preferences,
      terms: preferences.terms.map((t) =>
        t.id === id ? { ...t, caseSensitive: !t.caseSensitive } : t
      ),
    });
  }

  async function handleDeleteTerm(id: string) {
    await onUpdatePreferences({
      ...preferences,
      terms: preferences.terms.filter((t) => t.id !== id),
    });
  }

  async function handleAddRule(e: React.FormEvent) {
    e.preventDefault();
    const instruction = ruleInstruction.trim();
    if (!instruction) return;

    const newRule: WritingRule = {
      id: crypto.randomUUID(),
      title: ruleTitle.trim() || instruction.slice(0, 48),
      instruction,
      enabled: true,
    };

    await onUpdatePreferences({
      ...preferences,
      rules: [newRule, ...preferences.rules],
    });
    setRuleTitle('');
    setRuleInstruction('');
  }

  async function handleToggleRule(id: string) {
    await onUpdatePreferences({
      ...preferences,
      rules: preferences.rules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)),
    });
  }

  function handleStartEditRule(rule: WritingRule) {
    setEditingRuleId(rule.id);
    setEditRuleTitle(rule.title);
    setEditRuleInstruction(rule.instruction);
  }

  async function handleSaveEditRule(id: string) {
    const trimmedInstruction = editRuleInstruction.trim();
    if (!trimmedInstruction) return;
    await onUpdatePreferences({
      ...preferences,
      rules: preferences.rules.map((r) =>
        r.id === id
          ? {
              ...r,
              title: editRuleTitle.trim() || trimmedInstruction.slice(0, 48),
              instruction: trimmedInstruction,
            }
          : r
      ),
    });
    setEditingRuleId(null);
  }

  async function handleDeleteRule(id: string) {
    await onUpdatePreferences({
      ...preferences,
      rules: preferences.rules.filter((r) => r.id !== id),
    });
    if (editingRuleId === id) {
      setEditingRuleId(null);
    }
  }

  function handleExportJson() {
    const blob = new Blob([JSON.stringify(preferences, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = isEn ? 'uxz-write-glossary-rules.json' : 'uxz-write-woerterbuch-regeln.json';
    link.click();
    URL.revokeObjectURL(url);
  }

  async function handleImportJson(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportError(null);

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Partial<WritingPreferences>;
      if (!parsed || typeof parsed !== 'object') {
        setImportError(isEn ? 'Invalid file format.' : 'Ungültiges Dateiformat.');
        return;
      }

      const incomingTerms = Array.isArray(parsed.terms)
        ? parsed.terms
            .filter((t): t is ProtectedTerm => Boolean(t && typeof t.term === 'string' && t.term.trim()))
            .map((t) => ({
              id: typeof t.id === 'string' && t.id ? t.id : crypto.randomUUID(),
              term: t.term.trim(),
              caseSensitive: Boolean(t.caseSensitive),
              enabled: t.enabled !== false,
            }))
        : preferences.terms;

      const incomingRules = Array.isArray(parsed.rules)
        ? parsed.rules
            .filter((r): r is WritingRule => Boolean(r && typeof r.instruction === 'string' && r.instruction.trim()))
            .map((r) => ({
              id: typeof r.id === 'string' && r.id ? r.id : crypto.randomUUID(),
              title: typeof r.title === 'string' && r.title.trim() ? r.title.trim() : r.instruction.trim().slice(0, 48),
              instruction: r.instruction.trim(),
              enabled: r.enabled !== false,
            }))
        : preferences.rules;

      await onUpdatePreferences({
        ...preferences,
        terms: incomingTerms,
        rules: incomingRules,
        settings: preferences.settings,
      });
    } catch {
      setImportError(isEn ? 'Could not read file.' : 'Datei konnte nicht gelesen werden.');
    }
  }

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-lg font-semibold tracking-tight text-neutral-950 dark:text-white">
          {isEn ? 'Glossary & Rules' : 'Wörterbuch & Regeln'}
        </h1>

        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleImportJson}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-neutral-300 dark:border-neutral-800 bg-white dark:bg-[#0A0D14] text-neutral-700 dark:text-neutral-300 hover:border-neutral-900 dark:hover:border-neutral-100 hover:text-neutral-950 dark:hover:text-white transition-colors cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            {isEn ? 'Import' : 'Importieren'}
          </button>
          <button
            type="button"
            onClick={handleExportJson}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-neutral-300 dark:border-neutral-800 bg-white dark:bg-[#0A0D14] text-neutral-700 dark:text-neutral-300 hover:border-neutral-900 dark:hover:border-neutral-100 hover:text-neutral-950 dark:hover:text-white transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            {isEn ? 'Export' : 'Exportieren'}
          </button>
        </div>
      </div>

      {importError && (
        <div className="px-4 py-2.5 rounded-lg border border-rose-200 dark:border-rose-900/70 bg-rose-50 dark:bg-rose-950/35 text-xs text-rose-800 dark:text-rose-200">
          {importError}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Geschützte Begriffe (Wörterbuch) */}
        <section className="border border-neutral-300/90 dark:border-neutral-800 rounded-lg bg-white dark:bg-[#0C1019] shadow-sm overflow-hidden">
          <div className="h-12 px-5 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-3 bg-[#FAFAFA] dark:bg-[#080B10]">
            <h2 className="text-sm font-semibold text-neutral-950 dark:text-neutral-100">
              {isEn ? 'Protected Terms' : 'Geschützte Begriffe'}
            </h2>
            <span className="text-xs font-mono tabular-nums text-neutral-500 dark:text-neutral-400">
              {activeTermCount} / {preferences.terms.length}
            </span>
          </div>

          <div className="p-5 space-y-4">
            <form onSubmit={handleAddTerms} className="flex items-center gap-2">
              <input
                type="text"
                value={termInput}
                onChange={(e) => setTermInput(e.target.value)}
                placeholder={
                  isEn
                    ? 'Enter term(s) (e.g. Üxz Write, OpenRouter)…'
                    : 'Begriff(e) eingeben (z. B. Üxz Write, OpenRouter)…'
                }
                className="flex-1 min-w-0 h-10 px-3 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-950 dark:text-neutral-100 focus:outline-none focus:border-neutral-950 dark:focus:border-white"
              />
              <button
                type="button"
                onClick={() => setTermCaseSensitive((v) => !v)}
                aria-pressed={termCaseSensitive}
                aria-label={isEn ? 'Exact case matching' : 'Exakte Groß- und Kleinschreibung'}
                title={isEn ? 'Exact case matching' : 'Exakte Groß-/Kleinschreibung'}
                className={`h-10 px-3 text-xs font-mono font-semibold rounded-md border transition-colors shrink-0 cursor-pointer ${
                  termCaseSensitive
                    ? 'border-neutral-950 dark:border-white bg-neutral-950 dark:bg-white text-white dark:text-neutral-950'
                    : 'border-neutral-300 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400 hover:border-neutral-600'
                }`}
              >
                Aa
              </button>
              <button
                type="submit"
                disabled={!termInput.trim() || loading}
                className="h-10 px-4 inline-flex items-center gap-1.5 text-xs font-semibold rounded-md bg-neutral-950 dark:bg-white text-white dark:text-neutral-950 hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                {isEn ? 'Add' : 'Hinzufügen'}
              </button>
            </form>

            {preferences.terms.length === 0 ? (
              <div className="py-10 text-center text-sm text-neutral-400 dark:text-neutral-600 border border-dashed border-neutral-300 dark:border-neutral-800 rounded-lg">
                {isEn ? 'No protected terms saved yet' : 'Noch keine geschützten Begriffe hinterlegt'}
              </div>
            ) : (
              <ul className="border border-neutral-200 dark:border-neutral-800 rounded-lg divide-y divide-neutral-200 dark:divide-neutral-800 max-h-[480px] overflow-y-auto">
                {preferences.terms.map((item) => (
                  <li
                    key={item.id}
                    className={`px-4 py-2.5 flex items-center justify-between gap-3 transition-colors ${
                      item.enabled ? '' : 'opacity-55'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <button
                        type="button"
                        onClick={() => handleToggleTerm(item.id)}
                        aria-pressed={item.enabled}
                        className={`px-2 py-0.5 text-[11px] font-medium rounded-sm border transition-colors shrink-0 cursor-pointer ${
                          item.enabled
                            ? 'border-neutral-950 dark:border-white bg-neutral-950 dark:bg-white text-white dark:text-neutral-950 font-semibold'
                            : 'border-neutral-300 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400'
                        }`}
                      >
                        {item.enabled ? (isEn ? 'On' : 'Aktiv') : isEn ? 'Off' : 'Aus'}
                      </button>
                      <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">
                        {item.term}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleToggleTermCase(item.id)}
                        aria-pressed={item.caseSensitive}
                        aria-label={isEn ? 'Toggle exact case matching' : 'Exakte Schreibweise umschalten'}
                        className={`px-2 py-1 text-[11px] font-mono rounded-sm border transition-colors cursor-pointer ${
                          item.caseSensitive
                            ? 'border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-neutral-100 bg-neutral-100 dark:bg-neutral-800'
                            : 'border-transparent text-neutral-400 dark:text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
                        }`}
                      >
                        Aa
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteTerm(item.id)}
                        aria-label={isEn ? 'Remove term' : 'Begriff entfernen'}
                        className="p-1.5 rounded-sm text-neutral-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Verbindliche Schreib- & Formatierungsregeln */}
        <section className="border border-neutral-300/90 dark:border-neutral-800 rounded-lg bg-white dark:bg-[#0C1019] shadow-sm overflow-hidden">
          <div className="h-12 px-5 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-3 bg-[#FAFAFA] dark:bg-[#080B10]">
            <h2 className="text-sm font-semibold text-neutral-950 dark:text-neutral-100">
              {isEn ? 'Writing & Formatting Rules' : 'Schreib- & Formatierungsregeln'}
            </h2>
            <span className="text-xs font-mono tabular-nums text-neutral-500 dark:text-neutral-400">
              {activeRuleCount} / {preferences.rules.length}
            </span>
          </div>

          <div className="p-5 space-y-4">
            <form onSubmit={handleAddRule} className="space-y-2.5">
              <input
                type="text"
                value={ruleTitle}
                onChange={(e) => setRuleTitle(e.target.value)}
                placeholder={
                  isEn
                    ? 'Rule name (e.g. Preserve em-dash parentheticals)'
                    : 'Regelname (z. B. Bindestrich-Komposita)'
                }
                className="w-full h-9 px-3 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-950 dark:text-neutral-100 focus:outline-none focus:border-neutral-950 dark:focus:border-white"
              />
              <div className="flex items-start gap-2">
                <textarea
                  rows={2}
                  value={ruleInstruction}
                  onChange={(e) => setRuleInstruction(e.target.value)}
                  placeholder={
                    isEn
                      ? 'Define exact rule (e.g. Keep phrases between dashes inside dashes)…'
                      : 'Genaue Regel definieren (z. B. Einschübe zwischen – bleiben zwischen –)…'
                  }
                  className="flex-1 min-w-0 p-2.5 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-950 dark:text-neutral-100 focus:outline-none focus:border-neutral-950 dark:focus:border-white resize-y"
                />
                <button
                  type="submit"
                  disabled={!ruleInstruction.trim() || loading}
                  className="h-10 px-4 inline-flex items-center gap-1.5 text-xs font-semibold rounded-md bg-neutral-950 dark:bg-white text-white dark:text-neutral-950 hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {isEn ? 'Save' : 'Speichern'}
                </button>
              </div>
            </form>

            {preferences.rules.length === 0 ? (
              <div className="py-10 text-center text-sm text-neutral-400 dark:text-neutral-600 border border-dashed border-neutral-300 dark:border-neutral-800 rounded-lg">
                {isEn ? 'No rules defined yet' : 'Noch keine Regeln definiert'}
              </div>
            ) : (
              <ul className="border border-neutral-200 dark:border-neutral-800 rounded-lg divide-y divide-neutral-200 dark:divide-neutral-800 max-h-[520px] overflow-y-auto">
                {preferences.rules.map((rule) => {
                  const isEditing = editingRuleId === rule.id;
                  return (
                    <li
                      key={rule.id}
                      className={`p-4 space-y-2 transition-colors ${
                        rule.enabled || isEditing ? '' : 'opacity-60'
                      }`}
                    >
                      {isEditing ? (
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={editRuleTitle}
                            onChange={(e) => setEditRuleTitle(e.target.value)}
                            className="w-full h-9 px-3 text-sm font-medium rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-950 dark:text-neutral-100 focus:outline-none focus:border-neutral-950 dark:focus:border-white"
                          />
                          <textarea
                            rows={3}
                            value={editRuleInstruction}
                            onChange={(e) => setEditRuleInstruction(e.target.value)}
                            className="w-full p-2.5 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-950 dark:text-neutral-100 focus:outline-none focus:border-neutral-950 dark:focus:border-white"
                          />
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingRuleId(null)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-sm cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                              {isEn ? 'Cancel' : 'Abbrechen'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSaveEditRule(rule.id)}
                              className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold bg-neutral-950 dark:bg-white text-white dark:text-neutral-950 rounded-sm hover:bg-neutral-800 dark:hover:bg-neutral-200 cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5" />
                              {isEn ? 'Apply' : 'Übernehmen'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1 min-w-0">
                            <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                              {rule.title}
                            </div>
                            <p className="text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
                              {rule.instruction}
                            </p>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleToggleRule(rule.id)}
                              aria-pressed={rule.enabled}
                              className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors whitespace-nowrap cursor-pointer ${
                                rule.enabled
                                  ? 'border-neutral-950 dark:border-white bg-neutral-950 dark:bg-white text-white dark:text-neutral-950 font-semibold'
                                  : 'border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                              }`}
                            >
                              {rule.enabled ? (isEn ? 'On' : 'Aktiv') : isEn ? 'Off' : 'Aus'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleStartEditRule(rule)}
                              aria-label={isEn ? 'Edit rule' : 'Regel bearbeiten'}
                              className="p-1.5 rounded-sm text-neutral-400 hover:text-neutral-950 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteRule(rule.id)}
                              aria-label={isEn ? 'Remove rule' : 'Regel entfernen'}
                              className="p-1.5 rounded-sm text-neutral-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
