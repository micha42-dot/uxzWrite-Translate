import { useRef, useState } from 'react';
import { Check, Download, Pencil, Plus, Trash2, Upload, X } from 'lucide-react';
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
    link.download = 'highl-write-woerterbuch-regeln.json';
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
        setImportError('Ungültiges Dateiformat.');
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
        terms: incomingTerms,
        rules: incomingRules,
      });
    } catch {
      setImportError('Datei konnte nicht gelesen werden.');
    }
  }

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-lg font-semibold tracking-tight text-slate-950 dark:text-white">
          Wörterbuch &amp; Regeln
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
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#101623] text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            Importieren
          </button>
          <button
            type="button"
            onClick={handleExportJson}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#101623] text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Exportieren
          </button>
        </div>
      </div>

      {importError && (
        <div className="px-4 py-2.5 rounded-xl border border-rose-200 dark:border-rose-900/70 bg-rose-50 dark:bg-rose-950/35 text-xs text-rose-800 dark:text-rose-200">
          {importError}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Geschützte Begriffe (Wörterbuch) */}
        <section className="border border-slate-200/90 dark:border-slate-800 rounded-2xl bg-white dark:bg-[#101623] shadow-2xs overflow-hidden">
          <div className="h-12 px-5 border-b border-slate-200/80 dark:border-slate-800/90 flex items-center justify-between gap-3 bg-[#FAFBFD] dark:bg-[#0B0F17]">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Geschützte Begriffe
            </h2>
            <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
              {activeTermCount} / {preferences.terms.length}
            </span>
          </div>

          <div className="p-5 space-y-4">
            <form onSubmit={handleAddTerms} className="flex items-center gap-2">
              <input
                type="text"
                value={termInput}
                onChange={(e) => setTermInput(e.target.value)}
                placeholder="Begriff(e) eingeben (z. B. HighL Write, OpenRouter)…"
                className="flex-1 min-w-0 h-10 px-3 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-600"
              />
              <button
                type="button"
                onClick={() => setTermCaseSensitive((v) => !v)}
                aria-pressed={termCaseSensitive}
                aria-label="Exakte Groß- und Kleinschreibung"
                title="Exakte Groß-/Kleinschreibung"
                className={`h-10 px-3 text-xs font-mono font-semibold rounded-lg border transition-colors shrink-0 cursor-pointer ${
                  termCaseSensitive
                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400'
                    : 'border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400'
                }`}
              >
                Aa
              </button>
              <button
                type="submit"
                disabled={!termInput.trim() || loading}
                className="h-10 px-4 inline-flex items-center gap-1.5 text-xs font-medium rounded-lg bg-blue-700 dark:bg-blue-600 text-white hover:bg-blue-800 dark:hover:bg-blue-500 disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Hinzufügen
              </button>
            </form>

            {preferences.terms.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-400 dark:text-slate-600 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                Noch keine geschützten Begriffe hinterlegt
              </div>
            ) : (
              <ul className="border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-200 dark:divide-slate-800 max-h-[480px] overflow-y-auto">
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
                        className={`px-2 py-0.5 text-[11px] font-medium rounded-md border transition-colors shrink-0 cursor-pointer ${
                          item.enabled
                            ? 'border-blue-600/30 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400'
                            : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {item.enabled ? 'Aktiv' : 'Aus'}
                      </button>
                      <span className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                        {item.term}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleToggleTermCase(item.id)}
                        aria-pressed={item.caseSensitive}
                        aria-label="Exakte Schreibweise umschalten"
                        className={`px-2 py-1 text-[11px] font-mono rounded-md border transition-colors cursor-pointer ${
                          item.caseSensitive
                            ? 'border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800'
                            : 'border-transparent text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                        }`}
                      >
                        Aa
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteTerm(item.id)}
                        aria-label="Begriff entfernen"
                        className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
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
        <section className="border border-slate-200/90 dark:border-slate-800 rounded-2xl bg-white dark:bg-[#101623] shadow-2xs overflow-hidden">
          <div className="h-12 px-5 border-b border-slate-200/80 dark:border-slate-800/90 flex items-center justify-between gap-3 bg-[#FAFBFD] dark:bg-[#0B0F17]">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Schreib- &amp; Formatierungsregeln
            </h2>
            <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
              {activeRuleCount} / {preferences.rules.length}
            </span>
          </div>

          <div className="p-5 space-y-4">
            <form onSubmit={handleAddRule} className="space-y-2.5">
              <input
                type="text"
                value={ruleTitle}
                onChange={(e) => setRuleTitle(e.target.value)}
                placeholder="Regelname (z. B. Bindestrich-Komposita)"
                className="w-full h-9 px-3 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-600"
              />
              <div className="flex items-start gap-2">
                <textarea
                  rows={2}
                  value={ruleInstruction}
                  onChange={(e) => setRuleInstruction(e.target.value)}
                  placeholder="Genaue Regel definieren (z. B. Einschübe zwischen – bleiben zwischen –)…"
                  className="flex-1 min-w-0 p-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-600 resize-y"
                />
                <button
                  type="submit"
                  disabled={!ruleInstruction.trim() || loading}
                  className="h-10 px-4 inline-flex items-center gap-1.5 text-xs font-medium rounded-lg bg-blue-700 dark:bg-blue-600 text-white hover:bg-blue-800 dark:hover:bg-blue-500 disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Speichern
                </button>
              </div>
            </form>

            {preferences.rules.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-400 dark:text-slate-600 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                Noch keine Regeln definiert
              </div>
            ) : (
              <ul className="border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-200 dark:divide-slate-800 max-h-[520px] overflow-y-auto">
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
                            className="w-full h-9 px-3 text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-600"
                          />
                          <textarea
                            rows={3}
                            value={editRuleInstruction}
                            onChange={(e) => setEditRuleInstruction(e.target.value)}
                            className="w-full p-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-600"
                          />
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingRuleId(null)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                              Abbrechen
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSaveEditRule(rule.id)}
                              className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium bg-blue-700 text-white rounded-md hover:bg-blue-800 cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5" />
                              Übernehmen
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1 min-w-0">
                            <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                              {rule.title}
                            </div>
                            <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                              {rule.instruction}
                            </p>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleToggleRule(rule.id)}
                              aria-pressed={rule.enabled}
                              className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap cursor-pointer ${
                                rule.enabled
                                  ? 'border-blue-600 bg-blue-700 dark:bg-blue-600 text-white'
                                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                              }`}
                            >
                              {rule.enabled ? 'Aktiv' : 'Aus'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleStartEditRule(rule)}
                              aria-label="Regel bearbeiten"
                              className="p-1.5 rounded-md text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteRule(rule.id)}
                              aria-label="Regel entfernen"
                              className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
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
