import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Eye, EyeOff, Loader2, Lock, X } from 'lucide-react';
import { motion } from 'motion/react';
import type { OpenRouterModel } from '../types';

interface PaidModelsPasswordModalProps {
  open: boolean;
  passwordConfigured: boolean;
  pendingModel: OpenRouterModel | null;
  onClose: () => void;
  onUnlock: (password: string) => Promise<{ ok: true } | { ok: false; error: string }>;
}

export function PaidModelsPasswordModal({
  open,
  passwordConfigured,
  pendingModel,
  onClose,
  onUnlock,
}: PaidModelsPasswordModalProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setError(null);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!password) {
      setError('Bitte gib ein Passwort ein.');
      return;
    }

    if (!passwordConfigured) {
      if (password.length < 6) {
        setError('Das Passwort muss mindestens 6 Zeichen lang sein.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Die Passwörter stimmen nicht überein.');
        return;
      }
    }

    setSubmitting(true);
    try {
      const result = await onUnlock(password);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Kostenpflichtige Modelle entsperren"
    >
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 bg-slate-950/45 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1119] shadow-2xl overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <Lock className="w-4 h-4 text-blue-700 dark:text-blue-400 shrink-0" />
            <h2 className="font-display text-sm font-semibold tracking-tight text-slate-950 dark:text-white truncate">
              {passwordConfigured
                ? 'Kostenpflichtige Modelle entsperren'
                : 'Passwort für kostenpflichtige Modelle'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Schließen"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 dark:hover:text-slate-100 dark:hover:bg-slate-800 cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {pendingModel && (
            <div className="flex items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-300 pb-3 border-b border-slate-200/80 dark:border-slate-800">
              <span className="font-medium truncate">{pendingModel.name}</span>
              <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
                {pendingModel.promptPricePer1M < 0
                  ? 'Variabel'
                  : `$${pendingModel.promptPricePer1M.toFixed(2)} / $${pendingModel.completionPricePer1M.toFixed(2)}`}
              </span>
            </div>
          )}

          <div className="space-y-1.5">
            <label
              htmlFor="paid-models-password"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              {passwordConfigured ? 'Passwort' : 'Neues Passwort (mind. 6 Zeichen)'}
            </label>
            <div className="relative">
              <input
                id="paid-models-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                autoComplete={passwordConfigured ? 'current-password' : 'new-password'}
                placeholder="••••••••"
                className="w-full h-10 pl-3 pr-10 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-600"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {!passwordConfigured && (
            <div className="space-y-1.5">
              <label
                htmlFor="paid-models-password-confirm"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Passwort bestätigen
              </label>
              <input
                id="paid-models-password-confirm"
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="••••••••"
                className="w-full h-10 px-3 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-600"
              />
            </div>
          )}

          {error && (
            <div className="p-3 rounded-lg border border-rose-200 dark:border-rose-900/70 bg-rose-50 dark:bg-rose-950/40 text-xs text-rose-800 dark:text-rose-200">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-3.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="h-9 px-4 inline-flex items-center gap-1.5 text-xs font-medium rounded-lg bg-blue-700 dark:bg-blue-600 text-white hover:bg-blue-800 dark:hover:bg-blue-500 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {passwordConfigured ? 'Entsperren' : 'Festlegen & entsperren'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
