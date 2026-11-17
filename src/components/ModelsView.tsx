import { useMemo, useState } from 'react';
import { Check, Loader2, Lock, Search, Unlock } from 'lucide-react';
import { isFreeOpenRouterModel } from '../types';
import type { OpenRouterModel } from '../types';

type PriceFilter = 'all' | 'free' | 'paid';

interface ModelsViewProps {
  models: OpenRouterModel[];
  loading: boolean;
  activeModel: string;
  paidModelsUnlocked: boolean;
  onSelectModel: (modelId: string) => Promise<void>;
  onRequestUnlock: (model?: OpenRouterModel) => void;
  onLockPaid: () => Promise<void>;
}

export function ModelsView({
  models,
  loading,
  activeModel,
  paidModelsUnlocked,
  onSelectModel,
  onRequestUnlock,
  onLockPaid,
}: ModelsViewProps) {
  const [search, setSearch] = useState('');
  const [priceFilter, setPriceFilter] = useState<PriceFilter>('all');
  const [showAll, setShowAll] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [locking, setLocking] = useState(false);

  const counts = useMemo(() => {
    let free = 0;
    let paid = 0;
    for (const m of models) {
      if (isFreeOpenRouterModel(m)) free++;
      else paid++;
    }
    return { all: models.length, free, paid };
  }, [models]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return models.filter((m) => {
      if (priceFilter === 'free' && !isFreeOpenRouterModel(m)) return false;
      if (priceFilter === 'paid' && isFreeOpenRouterModel(m)) return false;
      if (!q) return true;
      return m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q);
    });
  }, [models, search, priceFilter]);

  const visibleModels = showAll ? filtered : filtered.slice(0, 120);

  async function handleChoose(model: OpenRouterModel) {
    if (!isFreeOpenRouterModel(model) && !paidModelsUnlocked) {
      onRequestUnlock(model);
      return;
    }

    setSavingId(model.id);
    try {
      await onSelectModel(model.id);
    } finally {
      setSavingId(null);
    }
  }

  async function handleLockClick() {
    setLocking(true);
    try {
      await onLockPaid();
    } finally {
      setLocking(false);
    }
  }

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[260px]">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setShowAll(false);
              }}
              placeholder="OpenRouter-Modelle filtern…"
              className="w-full h-10 pl-9 pr-3 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-600"
            />
          </div>

          <div
            className="inline-flex items-center p-1 rounded-xl bg-white/90 dark:bg-[#0E131D] border border-slate-200/90 dark:border-slate-800 shadow-2xs"
            role="group"
            aria-label="Preisfilter"
          >
            {(
              [
                { id: 'all', label: 'Alle', count: counts.all },
                { id: 'free', label: 'Kostenlos', count: counts.free },
                { id: 'paid', label: 'Kostenpflichtig', count: counts.paid },
              ] as const
            ).map((item) => {
              const active = priceFilter === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setPriceFilter(item.id);
                    setShowAll(false);
                  }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  {item.label}
                  <span className="ml-1.5 opacity-70 tabular-nums">{item.count}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            Aktiv: <span className="font-mono text-slate-800 dark:text-slate-200">{activeModel}</span>
          </div>

          {paidModelsUnlocked ? (
            <button
              type="button"
              disabled={locking}
              onClick={handleLockClick}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-emerald-200 dark:border-emerald-900/70 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100/80 dark:hover:bg-emerald-950/60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {locking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Unlock className="w-3.5 h-3.5" />}
              Kostenpflichtige entsperrt · Sperren
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onRequestUnlock()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
              Kostenpflichtige entsperren
            </button>
          )}
        </div>
      </div>

      <div className="border border-slate-200/90 dark:border-slate-800 rounded-2xl bg-white dark:bg-[#0E131D] shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_28px_-14px_rgba(15,23,42,0.08)] overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200/90 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0B0F17] text-xs font-medium text-slate-500 dark:text-slate-400">
              <th className="py-3 px-4">Modell</th>
              <th className="py-3 px-4">Kennung</th>
              <th className="py-3 px-4 text-right">Kontext</th>
              <th className="py-3 px-4 text-right">Eingabe / 1M</th>
              <th className="py-3 px-4 text-right">Ausgabe / 1M</th>
              <th className="py-3 px-4 text-right">Aktion</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
            {loading && models.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-10 text-center text-slate-500 dark:text-slate-400">
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Modelle werden geladen…
                  </span>
                </td>
              </tr>
            ) : visibleModels.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-10 text-center text-slate-500 dark:text-slate-400">
                  Keine Modelle gefunden.
                </td>
              </tr>
            ) : (
              visibleModels.map((m) => {
                const isActive = m.id === activeModel;
                const isSaving = savingId === m.id;
                const isFree = isFreeOpenRouterModel(m);
                const needsPassword = !isFree && !paidModelsUnlocked;
                return (
                  <tr
                    key={m.id}
                    className={`transition-colors ${
                      isActive
                        ? 'bg-blue-50/50 dark:bg-blue-950/25'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <td className="py-2.5 px-4 font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      {m.name}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {m.id}
                    </td>
                    <td className="py-2.5 px-4 text-right tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {m.contextLength ? m.contextLength.toLocaleString('de-DE') : '—'}
                    </td>
                    <td className="py-2.5 px-4 text-right tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {m.promptPricePer1M < 0
                        ? 'Variabel'
                        : isFree
                          ? 'Kostenlos'
                          : `$${m.promptPricePer1M.toFixed(2)}`}
                    </td>
                    <td className="py-2.5 px-4 text-right tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {m.completionPricePer1M < 0
                        ? 'Variabel'
                        : isFree
                          ? 'Kostenlos'
                          : `$${m.completionPricePer1M.toFixed(2)}`}
                    </td>
                    <td className="py-2.5 px-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        disabled={isActive || isSaving}
                        onClick={() => handleChoose(m)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                          isActive
                            ? 'text-emerald-700 dark:text-emerald-400 bg-transparent cursor-default'
                            : needsPassword
                              ? 'border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                              : 'border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        {isSaving ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : isActive ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            Aktiv
                          </>
                        ) : needsPassword ? (
                          <>
                            <Lock className="w-3 h-3 text-slate-400 dark:text-slate-500" />
                            Auswählen
                          </>
                        ) : (
                          'Auswählen'
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {!showAll && filtered.length > 120 && (
          <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-center">
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="px-4 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer tabular-nums"
            >
              Alle {filtered.length} Modelle anzeigen
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
