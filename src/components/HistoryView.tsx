import { useMemo, useState } from 'react';
import { ArrowUpRight, Check, Copy, Search, Trash2 } from 'lucide-react';
import { SOURCE_LANGUAGES, WRITING_STYLES } from '../types';
import type { HistoryEntry } from '../types';

interface HistoryViewProps {
  entries: HistoryEntry[];
  loading: boolean;
  onLoadEntry: (entry: HistoryEntry) => void;
  onDeleteEntry: (id: string) => void;
  onClearAll: () => void;
}

export function HistoryView({
  entries,
  loading,
  onLoadEntry,
  onDeleteEntry,
  onClearAll,
}: HistoryViewProps) {
  const [search, setSearch] = useState('');
  const [modeFilter, setModeFilter] = useState<'all' | 'correction' | 'style'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((item) => {
      if (modeFilter !== 'all' && item.mode !== modeFilter) return false;
      if (!q) return true;
      return (
        item.sourceText.toLowerCase().includes(q) ||
        item.refinedText.toLowerCase().includes(q) ||
        item.style.toLowerCase().includes(q) ||
        item.model.toLowerCase().includes(q)
      );
    });
  }, [entries, search, modeFilter]);

  function formatDate(iso: string): string {
    try {
      return new Intl.DateTimeFormat('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  }

  function handleCopy(entry: HistoryEntry) {
    navigator.clipboard.writeText(entry.refinedText);
    setCopiedId(entry.id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[260px]">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Verlauf durchsuchen…"
              className="w-full h-10 pl-9 pr-3 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-600"
            />
          </div>

          <div className="inline-flex items-center p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            {[
              { id: 'all', label: 'Alle' },
              { id: 'correction', label: 'Nur Korrektur' },
              { id: 'style', label: 'Stil & Korrektur' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setModeFilter(tab.id as 'all' | 'correction' | 'style')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  modeFilter === tab.id
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {entries.length > 0 && (
          <button
            type="button"
            onClick={onClearAll}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Verlauf leeren
          </button>
        )}
      </div>

      {loading ? (
        <div className="border border-slate-200/90 dark:border-slate-800 rounded-2xl bg-white dark:bg-[#0E131D] shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_28px_-14px_rgba(15,23,42,0.08)] divide-y divide-slate-200 dark:divide-slate-800">
          {[0, 1, 2].map((i) => (
            <div key={i} className="p-5 space-y-3 animate-pulse">
              <div className="h-3.5 w-48 bg-slate-200 dark:bg-slate-800 rounded" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="h-12 bg-slate-100 dark:bg-slate-800/60 rounded" />
                <div className="h-12 bg-slate-100 dark:bg-slate-800/60 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="border border-slate-200/90 dark:border-slate-800 rounded-2xl bg-white dark:bg-[#0E131D] shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_28px_-14px_rgba(15,23,42,0.08)] p-12 text-center space-y-2">
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
            {entries.length === 0 ? 'Noch keine Einträge gespeichert' : 'Keine Treffer für diese Filterung'}
          </p>
        </div>
      ) : (
        <div className="border border-slate-200/90 dark:border-slate-800 rounded-2xl bg-white dark:bg-[#0E131D] shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_28px_-14px_rgba(15,23,42,0.08)] divide-y divide-slate-200/90 dark:divide-slate-800">
          {filtered.map((entry) => {
            const langLabel =
              SOURCE_LANGUAGES.find((l) => l.id === entry.sourceLang)?.label || entry.sourceLang;
            const styleLabel =
              entry.mode === 'correction'
                ? 'Nur Korrektur'
                : WRITING_STYLES.find((s) => s.id === entry.style)?.label || entry.style;

            return (
              <div key={entry.id} className="p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                    <span>{formatDate(entry.createdAt)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{langLabel}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-medium text-slate-700 dark:text-slate-300">{styleLabel}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono">{entry.model}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleCopy(entry)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {copiedId === entry.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedId === entry.id ? 'Kopiert' : 'Kopieren'}
                    </button>

                    <button
                      type="button"
                      onClick={() => onLoadEntry(entry)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Öffnen
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => onDeleteEntry(entry.id)}
                      aria-label="Eintrag löschen"
                      className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-md transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-sm leading-relaxed">
                  <div className="text-slate-500 dark:text-slate-400 line-clamp-4 whitespace-pre-wrap">
                    {entry.sourceText}
                  </div>
                  <div className="text-slate-900 dark:text-slate-100 line-clamp-4 whitespace-pre-wrap lg:border-l lg:border-slate-200 dark:lg:border-slate-800 lg:pl-4">
                    {entry.refinedText}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
