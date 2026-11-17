import { useMemo, useState } from 'react';
import { ArrowRight, ArrowUpRight, Check, Copy, Languages, Search, Trash2 } from 'lucide-react';
import { getLanguageLabel, getStyleLabel, useUiLang } from '../lib/i18n';
import type { HistoryEntry } from '../types';

interface HistoryViewProps {
  entries: HistoryEntry[];
  loading: boolean;
  onLoadEntry: (entry: HistoryEntry) => void;
  onDeleteEntry: (id: string) => void;
  onClearAll: () => void;
}

type HistoryFilter = 'all' | 'correction' | 'style' | 'translate';

export function HistoryView({
  entries,
  loading,
  onLoadEntry,
  onDeleteEntry,
  onClearAll,
}: HistoryViewProps) {
  const { uiLang } = useUiLang();
  const isEn = uiLang === 'en';

  const [search, setSearch] = useState('');
  const [modeFilter, setModeFilter] = useState<HistoryFilter>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((item) => {
      const isTranslate = item.task === 'translate';
      if (modeFilter === 'translate' && !isTranslate) return false;
      if (modeFilter === 'correction' && (isTranslate || item.mode !== 'correction')) return false;
      if (modeFilter === 'style' && (isTranslate || item.mode !== 'style')) return false;
      if (!q) return true;
      return (
        item.sourceText.toLowerCase().includes(q) ||
        item.refinedText.toLowerCase().includes(q) ||
        item.style.toLowerCase().includes(q) ||
        item.model.toLowerCase().includes(q) ||
        (item.targetLang ? item.targetLang.toLowerCase().includes(q) : false)
      );
    });
  }, [entries, search, modeFilter]);

  function formatDate(iso: string): string {
    try {
      return new Intl.DateTimeFormat(isEn ? 'en-US' : 'de-DE', {
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
          <div className="relative flex-1 max-w-md min-w-[200px]">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={isEn ? 'Search history…' : 'Verlauf durchsuchen…'}
              className="w-full h-10 pl-9 pr-3 text-sm rounded-md border border-neutral-300 dark:border-neutral-800 bg-white dark:bg-[#0A0D14] text-neutral-950 dark:text-neutral-100 focus:outline-none focus:border-neutral-950 dark:focus:border-white"
            />
          </div>

          <div className="inline-flex items-center p-0.5 rounded-md bg-white dark:bg-[#0A0D14] border border-neutral-300 dark:border-neutral-800 overflow-x-auto no-scrollbar max-w-full">
            {[
              { id: 'all', label: isEn ? 'All' : 'Alle' },
              { id: 'correction', label: isEn ? 'Correction only' : 'Nur Korrektur' },
              { id: 'style', label: isEn ? 'Style & Correction' : 'Stil & Korrektur' },
              { id: 'translate', label: isEn ? 'Translation' : 'Übersetzung' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setModeFilter(tab.id as HistoryFilter)}
                className={`px-3 py-1.5 text-xs font-medium rounded-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  modeFilter === tab.id
                    ? 'bg-neutral-950 dark:bg-white text-white dark:text-neutral-950 font-semibold shadow-2xs'
                    : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-950 dark:hover:text-neutral-200'
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
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-md border border-transparent hover:border-rose-200 dark:hover:border-rose-900/60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {isEn ? 'Clear history' : 'Verlauf leeren'}
          </button>
        )}
      </div>

      {loading ? (
        <div className="border border-neutral-300/90 dark:border-neutral-800 rounded-lg bg-white dark:bg-[#0C1019] shadow-sm divide-y divide-neutral-200 dark:divide-neutral-800">
          {[0, 1, 2].map((i) => (
            <div key={i} className="p-5 space-y-3 animate-pulse">
              <div className="h-3.5 w-48 bg-neutral-200 dark:bg-neutral-800 rounded-sm" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="h-12 bg-neutral-100 dark:bg-neutral-800/60 rounded-sm" />
                <div className="h-12 bg-neutral-100 dark:bg-neutral-800/60 rounded-sm" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="border border-neutral-300/90 dark:border-neutral-800 rounded-lg bg-white dark:bg-[#0C1019] shadow-sm p-12 text-center space-y-2">
          <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
            {entries.length === 0
              ? isEn
                ? 'No saved entries yet'
                : 'Noch keine Einträge gespeichert'
              : isEn
                ? 'No matches for this filter'
                : 'Keine Treffer für diese Filterung'}
          </p>
        </div>
      ) : (
        <div className="border border-neutral-300/90 dark:border-neutral-800 rounded-lg bg-white dark:bg-[#0C1019] shadow-sm divide-y divide-neutral-200 dark:divide-neutral-800">
          {filtered.map((entry) => {
            const langLabel = getLanguageLabel(entry.sourceLang, uiLang);
            const targetLangLabel = entry.targetLang ? getLanguageLabel(entry.targetLang, uiLang) : null;
            const isTranslate = entry.task === 'translate';
            const styleLabel = isTranslate
              ? isEn
                ? 'Translation'
                : 'Übersetzung'
              : entry.mode === 'correction'
                ? isEn
                  ? 'Correction only'
                  : 'Nur Korrektur'
                : getStyleLabel(entry.style, uiLang);

            return (
              <div key={entry.id} className="p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400 tabular-nums">
                    <span>{formatDate(entry.createdAt)}</span>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1">
                      {langLabel}
                      {isTranslate && targetLangLabel && (
                        <>
                          <ArrowRight className="w-3 h-3 opacity-70" />
                          <span className="font-medium text-neutral-800 dark:text-neutral-200">
                            {targetLangLabel}
                          </span>
                        </>
                      )}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1 font-medium text-neutral-800 dark:text-neutral-200">
                      {isTranslate && <Languages className="w-3.5 h-3.5 opacity-75" />}
                      {styleLabel}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono">{entry.model}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleCopy(entry)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {copiedId === entry.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedId === entry.id ? (isEn ? 'Copied' : 'Kopiert') : isEn ? 'Copy' : 'Kopieren'}
                    </button>

                    <button
                      type="button"
                      onClick={() => onLoadEntry(entry)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold border border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 hover:border-neutral-950 dark:hover:border-white hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {isEn ? 'Open' : 'Öffnen'}
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => onDeleteEntry(entry.id)}
                      aria-label={isEn ? 'Delete entry' : 'Eintrag löschen'}
                      className="p-1.5 text-neutral-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-md transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-sm leading-relaxed">
                  <div className="text-neutral-500 dark:text-neutral-400 line-clamp-4 whitespace-pre-wrap">
                    {entry.sourceText}
                  </div>
                  <div className="text-neutral-900 dark:text-neutral-100 line-clamp-4 whitespace-pre-wrap lg:border-l lg:border-neutral-200 dark:lg:border-neutral-800 lg:pl-4">
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
