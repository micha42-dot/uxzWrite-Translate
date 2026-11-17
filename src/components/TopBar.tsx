import { KeyRound, Moon, Settings, Sun } from 'lucide-react';
import { motion } from 'motion/react';
import logoDark from '../assets/logo-dark.png';
import logoLight from '../assets/logo-light.png';
import type { OpenRouterStatus } from '../types';

export type ActiveTab = 'editor' | 'translate' | 'rules' | 'history' | 'models';

interface TopBarProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  historyCount: number;
  rulesCount: number;
  status: OpenRouterStatus;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onOpenSettings: () => void;
  onOpenWorkspaceSettings: () => void;
}

export function TopBar({
  activeTab,
  onSelectTab,
  historyCount,
  rulesCount,
  status,
  darkMode,
  onToggleDarkMode,
  onOpenSettings,
  onOpenWorkspaceSettings,
}: TopBarProps) {
  const navItems: Array<{ id: ActiveTab; label: string; count?: number }> = [
    { id: 'editor', label: 'Editor' },
    { id: 'translate', label: 'Übersetzen' },
    { id: 'rules', label: 'Wörterbuch & Regeln', count: rulesCount > 0 ? rulesCount : undefined },
    { id: 'history', label: 'Verlauf', count: historyCount > 0 ? historyCount : undefined },
    { id: 'models', label: 'Modelle' },
  ];

  return (
    <header className="sticky top-0 z-30 h-14 border-b border-neutral-200 dark:border-neutral-800 bg-white/90 dark:bg-[#0A0D14]/90 backdrop-blur-md">
      <div className="max-w-[1440px] mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-6">
        <button
          type="button"
          onClick={() => onSelectTab('editor')}
          className="flex items-center gap-2.5 font-display font-semibold text-[17px] sm:text-[19px] tracking-tight text-neutral-950 dark:text-white whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-900 dark:focus-visible:outline-white cursor-pointer group"
          aria-label="Üxz | Write & Translate"
        >
          <img
            src={darkMode ? logoDark : logoLight}
            alt="Üxz Logo"
            className="h-7 w-auto object-contain [image-rendering:pixelated] transition-transform duration-150 group-hover:scale-105"
          />
          <span className="text-neutral-300 dark:text-neutral-700 font-light select-none text-[18px]" aria-hidden="true">
            |
          </span>
          <span className="font-semibold text-neutral-900 dark:text-neutral-100">
            Write &amp; Translate
          </span>
        </button>

        <nav className="flex items-center gap-6 overflow-x-auto no-scrollbar" aria-label="Hauptnavigation">
          {navItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`relative py-4 text-[13.5px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-neutral-900 dark:focus-visible:outline-white ${
                  active
                    ? 'text-neutral-950 dark:text-white font-semibold'
                    : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100'
                }`}
              >
                {item.label}
                {typeof item.count === 'number' && (
                  <span className="ml-1.5 font-mono text-[11px] text-neutral-400 dark:text-neutral-500 tabular-nums">
                    [{item.count}]
                  </span>
                )}
                {active && (
                  <motion.span
                    layoutId="topbar-nav-underline"
                    transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                    className="absolute inset-x-0 bottom-0 h-[2px] bg-neutral-950 dark:bg-white"
                  />
                )}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onToggleDarkMode}
            aria-label={darkMode ? 'Helles Design' : 'Dunkles Design'}
            className="p-2 rounded-md border border-neutral-300 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300 hover:text-neutral-950 dark:hover:text-white hover:border-neutral-900 dark:hover:border-neutral-100 transition-colors cursor-pointer"
          >
            {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={onOpenWorkspaceSettings}
            aria-label="Standard-Einstellungen"
            className="p-2 rounded-md border border-neutral-300 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300 hover:text-neutral-950 dark:hover:text-white hover:border-neutral-900 dark:hover:border-neutral-100 transition-colors cursor-pointer"
          >
            <Settings className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs font-mono font-medium rounded-md border transition-all duration-150 active:scale-[0.98] whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 ${
              status.configured
                ? 'border-neutral-300 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 text-neutral-800 dark:text-neutral-200 hover:border-neutral-900 dark:hover:border-neutral-100'
                : 'border-neutral-950 bg-neutral-950 text-white hover:bg-neutral-800 dark:border-white dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200 shadow-xs'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5 shrink-0 opacity-85" />
            <span className="max-w-[140px] truncate tracking-tight">
              {status.configured
                ? status.model === 'openrouter/free'
                  ? 'FREE ROUTER'
                  : status.model.split('/').pop()?.toUpperCase() || 'OPENROUTER'
                : 'BYOK API'}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}
