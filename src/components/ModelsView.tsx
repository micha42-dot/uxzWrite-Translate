import { useMemo, useState } from 'react';
import { Check, Loader2, Lock, Search, Unlock } from 'lucide-react';
import { useUiLang } from '../lib/i18n';
import { API_PROVIDERS, getProviderDefinition } from '../lib/providers';
import { isFreeOpenRouterModel } from '../types';
import type { ApiProviderId, OpenRouterModel } from '../types';

type PriceFilter = 'all' | 'free' | 'paid';

interface ModelsViewProps {
  models: OpenRouterModel[];
  loading: boolean;
  activeProvider: ApiProviderId;
  activeModel: string;
  browserProvider: ApiProviderId;
  paidModelsUnlocked: boolean;
  showPaidLockControls: boolean;
  onChangeBrowserProvider: (provider: ApiProviderId) => Promise<void>;
  onSelectModel: (modelId: string, providerId?: ApiProviderId) => Promise<void>;
  onRequestUnlock: (model?: OpenRouterModel) => void;
  onLockPaid: () => Promise<void>;
}

export function ModelsView({
  models,
  loading,
  activeProvider,
  activeModel,
  browserProvider,
  paidModelsUnlocked,
  showPaidLockControls,
  onChangeBrowserProvider,
  onSelectModel,
  onRequestUnlock,
  onLockPaid,
}: ModelsViewProps) {
  const { uiLang } = useUiLang();
  const isEn = uiLang === 'en';

  const [search, setSearch] = useState('');
  const [priceFilter, setPriceFilter] = useState<PriceFilter>('all');
  const [showAll, setShowAll] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [locking, setLocking] = useState(false);

  const browserDef = getProviderDefinition(browserProvider);
  const activeDef = getProviderDefinition(activeProvider);
  const routerProviders = useMemo(() => API_PROVIDERS.filter((p) => p.category === 'router'), []);
  const directProviders = useMemo(() => API_PROVIDERS.filter((p) => p.category === 'direct'), []);
  const customProviders = useMemo(() => API_PROVIDERS.filter((p) => p.category === 'custom'), []);

  const counts = useMemo(() => {
    let free = 0;
    let paid = 0;
    for (const m of models) {
      if (isFreeOpenRouterModel(m, browserProvider)) free++;
      else paid++;
    }
    return { all: models.length, free, paid };
  }, [models, browserProvider]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return models.filter((m) => {
      const isFree = isFreeOpenRouterModel(m, browserProvider);
      if (priceFilter === 'free' && !isFree) return false;
      if (priceFilter === 'paid' && isFree) return false;
      if (!q) return true;
      return m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q);
    });
  }, [models, search, priceFilter, browserProvider]);

  const visibleModels = showAll ? filtered : filtered.slice(0, 120);

  async function handleChoose(model: OpenRouterModel) {
    const isFree = isFreeOpenRouterModel(model, browserProvider);
    if (showPaidLockControls && !isFree && !paidModelsUnlocked) {
      onRequestUnlock(model);
      return;
    }

    setSavingId(model.id);
    try {
      await onSelectModel(model.id, browserProvider);
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
          <select
            aria-label={isEn ? 'Select AI provider' : 'KI-Anbieter wählen'}
            value={browserProvider}
            onChange={(e) => {
              setShowAll(false);
              setPriceFilter('all');
              void onChangeBrowserProvider(e.target.value as ApiProviderId);
            }}
            className="h-10 px-3 text-sm font-medium rounded-md border border-neutral-300 dark:border-neutral-800 bg-white dark:bg-[#0A0D14] text-neutral-950 dark:text-neutral-100 focus:outline-none focus:border-neutral-950 dark:focus:border-white cursor-pointer"
          >
            <optgroup label={isEn ? 'Multi-Model Routers' : 'Multi-Modell-Router'}>
              {routerProviders.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </optgroup>
            <optgroup label={isEn ? 'Direct AI APIs' : 'Direkte KI-APIs'}>
              {directProviders.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </optgroup>
            <optgroup label={isEn ? 'Local / Custom' : 'Lokal / Custom'}>
              {customProviders.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          </select>

          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setShowAll(false);
              }}
              placeholder={
                isEn ? `Filter ${browserDef.name} models…` : `${browserDef.name}-Modelle filtern…`
              }
              className="w-full h-10 pl-9 pr-3 text-sm rounded-md border border-neutral-300 dark:border-neutral-800 bg-white dark:bg-[#0A0D14] text-neutral-950 dark:text-neutral-100 focus:outline-none focus:border-neutral-950 dark:focus:border-white"
            />
          </div>

          <div
            className="inline-flex items-center p-0.5 rounded-md bg-white dark:bg-[#0A0D14] border border-neutral-300 dark:border-neutral-800 shadow-2xs"
            role="group"
            aria-label={isEn ? 'Price filter' : 'Preisfilter'}
          >
            {(
              [
                { id: 'all', label: isEn ? 'All' : 'Alle', count: counts.all },
                { id: 'free', label: isEn ? 'Free' : 'Kostenlos', count: counts.free },
                { id: 'paid', label: isEn ? 'Paid' : 'Kostenpflichtig', count: counts.paid },
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
                  className={`px-3 py-1.5 text-xs font-medium rounded-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'bg-neutral-950 dark:bg-white text-white dark:text-neutral-950 font-semibold'
                      : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-950 dark:hover:text-neutral-100'
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
          <div className="text-xs text-neutral-500 dark:text-neutral-400 tabular-nums">
            {isEn ? 'Active:' : 'Aktiv:'}{' '}
            <span className="font-mono text-neutral-900 dark:text-neutral-100">
              {activeDef.shortName} · {activeModel}
            </span>
          </div>

          {showPaidLockControls &&
            (paidModelsUnlocked ? (
              <button
                type="button"
                disabled={locking}
                onClick={handleLockClick}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-emerald-300 dark:border-emerald-900/70 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100/80 dark:hover:bg-emerald-950/60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {locking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Unlock className="w-3.5 h-3.5" />}
                {isEn ? 'Paid unlocked · Lock' : 'Kostenpflichtige entsperrt · Sperren'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onRequestUnlock()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#0A0D14] text-neutral-800 dark:text-neutral-200 hover:border-neutral-950 dark:hover:border-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
                {isEn ? 'Unlock paid models' : 'Kostenpflichtige entsperren'}
              </button>
            ))}
        </div>
      </div>

      <div className="border border-neutral-300/90 dark:border-neutral-800 rounded-lg bg-white dark:bg-[#0C1019] shadow-sm overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-[#FAFAFA] dark:bg-[#080B10] text-xs font-mono uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              <th className="py-3 px-4">{isEn ? 'Model' : 'Modell'}</th>
              <th className="py-3 px-4">{isEn ? 'Identifier' : 'Kennung'}</th>
              <th className="py-3 px-4 text-right">{isEn ? 'Context' : 'Kontext'}</th>
              <th className="py-3 px-4 text-right">{isEn ? 'Input / 1M' : 'Eingabe / 1M'}</th>
              <th className="py-3 px-4 text-right">{isEn ? 'Output / 1M' : 'Ausgabe / 1M'}</th>
              <th className="py-3 px-4 text-right">{isEn ? 'Action' : 'Aktion'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800 text-sm">
            {loading && models.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-10 text-center text-neutral-500 dark:text-neutral-400">
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {isEn ? 'Loading models…' : 'Modelle werden geladen…'}
                  </span>
                </td>
              </tr>
            ) : visibleModels.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-10 text-center text-neutral-500 dark:text-neutral-400">
                  {isEn ? 'No models found.' : 'Keine Modelle gefunden.'}
                </td>
              </tr>
            ) : (
              visibleModels.map((m) => {
                const isActive = m.id === activeModel && browserProvider === activeProvider;
                const isSaving = savingId === m.id;
                const isFree = isFreeOpenRouterModel(m, browserProvider);
                const needsPassword = showPaidLockControls && !isFree && !paidModelsUnlocked;
                return (
                  <tr
                    key={m.id}
                    className={`transition-colors ${
                      isActive
                        ? 'bg-neutral-100/80 dark:bg-neutral-800/40'
                        : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/25'
                    }`}
                  >
                    <td className="py-2.5 px-4 font-medium text-neutral-900 dark:text-neutral-100 whitespace-nowrap">
                      {m.name}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-xs text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
                      {m.id}
                    </td>
                    <td className="py-2.5 px-4 text-right tabular-nums text-neutral-700 dark:text-neutral-300 whitespace-nowrap">
                      {m.contextLength ? m.contextLength.toLocaleString(isEn ? 'en-US' : 'de-DE') : '—'}
                    </td>
                    <td className="py-2.5 px-4 text-right tabular-nums text-neutral-700 dark:text-neutral-300 whitespace-nowrap">
                      {m.promptPricePer1M < 0
                        ? isEn
                          ? 'Per plan'
                          : 'Nach Tarif'
                        : isFree
                          ? isEn
                            ? 'Free'
                            : 'Kostenlos'
                          : `$${m.promptPricePer1M.toFixed(2)}`}
                    </td>
                    <td className="py-2.5 px-4 text-right tabular-nums text-neutral-700 dark:text-neutral-300 whitespace-nowrap">
                      {m.completionPricePer1M < 0
                        ? isEn
                          ? 'Per plan'
                          : 'Nach Tarif'
                        : isFree
                          ? isEn
                            ? 'Free'
                            : 'Kostenlos'
                          : `$${m.completionPricePer1M.toFixed(2)}`}
                    </td>
                    <td className="py-2.5 px-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        disabled={isActive || isSaving}
                        onClick={() => handleChoose(m)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                          isActive
                            ? 'text-emerald-700 dark:text-emerald-400 bg-transparent cursor-default font-semibold'
                            : needsPassword
                              ? 'border border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                              : 'border border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 hover:border-neutral-950 dark:hover:border-white hover:bg-neutral-100 dark:hover:bg-neutral-800'
                        }`}
                      >
                        {isSaving ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : isActive ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            {isEn ? 'Active' : 'Aktiv'}
                          </>
                        ) : needsPassword ? (
                          <>
                            <Lock className="w-3 h-3 text-neutral-400 dark:text-neutral-500" />
                            {isEn ? 'Select' : 'Auswählen'}
                          </>
                        ) : isEn ? (
                          'Select'
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
          <div className="px-4 py-3 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-center">
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="px-4 py-1.5 text-xs font-medium rounded-md border border-neutral-300 dark:border-neutral-700 text-neutral-800 dark:text-neutral-200 hover:border-neutral-950 dark:hover:border-white transition-colors cursor-pointer tabular-nums"
            >
              {isEn ? `Show all ${filtered.length} models` : `Alle ${filtered.length} Modelle anzeigen`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
