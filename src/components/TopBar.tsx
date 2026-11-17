import { KeyRound } from 'lucide-react';
import { motion } from 'motion/react';
import type { OpenRouterStatus } from '../types';

export type ActiveTab = 'editor' | 'rules' | 'history' | 'models';

interface TopBarProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  historyCount: number;
  rulesCount: number;
  status: OpenRouterStatus;
  onOpenSettings: () => void;
}

export function TopBar({
  activeTab,
  onSelectTab,
  historyCount,
  rulesCount,
  status,
  onOpenSettings,
}: TopBarProps) {
  const navItems: Array<{ id: ActiveTab; label: string; count?: number }> = [
    { id: 'editor', label: 'Editor' },
    { id: 'rules', label: 'Wörterbuch & Regeln', count: rulesCount > 0 ? rulesCount : undefined },
    { id: 'history', label: 'Verlauf', count: historyCount > 0 ? historyCount : undefined },
    { id: 'models', label: 'Modelle' },
  ];

  return (
    <header className="sticky top-0 z-30 h-14 border-b border-slate-200/85 dark:border-slate-800/85 bg-white/85 dark:bg-[#0C1018]/85 backdrop-blur-md">
      <div className="max-w-[1440px] mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-8">
        <button
          type="button"
          onClick={() => onSelectTab('editor')}
          className="font-display font-semibold text-[21px] tracking-[-0.03em] text-slate-950 dark:text-white whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600 cursor-pointer"
        >
          HighL Write
        </button>

        <nav className="flex items-center gap-7 overflow-x-auto no-scrollbar" aria-label="Hauptnavigation">
          {navItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`relative py-4 text-[13.5px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-blue-600 ${
                  active
                    ? 'text-slate-950 dark:text-white'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                {item.label}
                {typeof item.count === 'number' && (
                  <span className="ml-1.5 text-xs text-slate-400 dark:text-slate-500 tabular-nums">
                    {item.count}
                  </span>
                )}
                {active && (
                  <motion.span
                    layoutId="topbar-nav-underline"
                    transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                    className="absolute inset-x-0 bottom-0 h-[2px] bg-blue-700 dark:bg-blue-500"
                  />
                )}
              </button>
            );
          })}
        </nav>

        <div className="shrink-0">
          <button
            type="button"
            onClick={onOpenSettings}
            className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg border transition-all duration-150 active:scale-[0.98] whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
              status.configured
                ? 'border-slate-200/90 dark:border-slate-800 bg-slate-50/90 dark:bg-[#131924] text-slate-800 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-white dark:hover:bg-[#18202E]'
                : 'border-blue-700 bg-blue-700 text-white hover:bg-blue-800 dark:border-blue-600 dark:bg-blue-600 dark:hover:bg-blue-500 shadow-xs'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5 shrink-0 opacity-85" />
            <span className="max-w-[180px] truncate">
              {status.configured
                ? status.model === 'openrouter/free'
                  ? 'Free Models Router'
                  : status.model.split('/').pop() || 'OpenRouter'
                : 'OpenRouter API'}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}
