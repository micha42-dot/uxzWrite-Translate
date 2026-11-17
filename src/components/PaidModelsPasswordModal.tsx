import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Eye, EyeOff, Loader2, Lock, X } from 'lucide-react';
import { motion } from 'motion/react';
import { useUiLang } from '../lib/i18n';
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
  const { uiLang } = useUiLang();
  const isEn = uiLang === 'en';

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
      setError(isEn ? 'Please enter a password.' : 'Bitte gib ein Passwort ein.');
      return;
    }

    if (!passwordConfigured) {
      if (password.length < 6) {
        setError(
          isEn
            ? 'Password must be at least 6 characters long.'
            : 'Das Passwort muss mindestens 6 Zeichen lang sein.'
        );
        return;
      }
      if (password !== confirmPassword) {
        setError(isEn ? 'Passwords do not match.' : 'Die Passwörter stimmen nicht überein.');
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
      aria-label={isEn ? 'Unlock paid models' : 'Kostenpflichtige Modelle entsperren'}
    >
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 bg-neutral-950/50 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-md rounded-lg border border-neutral-300 dark:border-neutral-800 bg-white dark:bg-[#0D1119] shadow-2xl overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <Lock className="w-4 h-4 text-neutral-950 dark:text-white shrink-0" />
            <h2 className="font-display text-sm font-semibold tracking-tight text-neutral-950 dark:text-white truncate">
              {passwordConfigured
                ? isEn
                  ? 'Unlock paid models'
                  : 'Kostenpflichtige Modelle entsperren'
                : isEn
                  ? 'Password for paid models'
                  : 'Passwort für kostenpflichtige Modelle'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={isEn ? 'Close' : 'Schließen'}
            className="p-1.5 rounded-md text-neutral-500 hover:text-neutral-950 hover:bg-neutral-100 dark:hover:text-neutral-100 dark:hover:bg-neutral-800 cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {pendingModel && (
            <div className="flex items-center justify-between gap-3 text-xs text-neutral-600 dark:text-neutral-300 pb-3 border-b border-neutral-200 dark:border-neutral-800">
              <span className="font-medium truncate">{pendingModel.name}</span>
              <span className="font-mono tabular-nums text-neutral-500 dark:text-neutral-400 shrink-0">
                {pendingModel.promptPricePer1M < 0
                  ? isEn
                    ? 'Variable'
                    : 'Variabel'
                  : `$${pendingModel.promptPricePer1M.toFixed(2)} / $${pendingModel.completionPricePer1M.toFixed(2)}`}
              </span>
            </div>
          )}

          <div className="space-y-1.5">
            <label
              htmlFor="paid-models-password"
              className="block text-xs font-medium text-neutral-700 dark:text-neutral-300"
            >
              {passwordConfigured
                ? isEn
                  ? 'Password'
                  : 'Passwort'
                : isEn
                  ? 'New password (min. 6 characters)'
                  : 'Neues Passwort (mind. 6 Zeichen)'}
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
                className="w-full h-10 pl-3 pr-10 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-950 dark:text-neutral-100 focus:outline-none focus:border-neutral-950 dark:focus:border-white"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={
                  showPassword
                    ? isEn
                      ? 'Hide password'
                      : 'Passwort verbergen'
                    : isEn
                      ? 'Show password'
                      : 'Passwort anzeigen'
                }
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {!passwordConfigured && (
            <div className="space-y-1.5">
              <label
                htmlFor="paid-models-password-confirm"
                className="block text-xs font-medium text-neutral-700 dark:text-neutral-300"
              >
                {isEn ? 'Confirm password' : 'Passwort bestätigen'}
              </label>
              <input
                id="paid-models-password-confirm"
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="••••••••"
                className="w-full h-10 px-3 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-950 dark:text-neutral-100 focus:outline-none focus:border-neutral-950 dark:focus:border-white"
              />
            </div>
          )}

          {error && (
            <div className="p-3 rounded-md border border-rose-200 dark:border-rose-900/70 bg-rose-50 dark:bg-rose-950/40 text-xs text-rose-800 dark:text-rose-200">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-3.5 text-xs font-medium rounded-md border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isEn ? 'Cancel' : 'Abbrechen'}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="h-9 px-4 inline-flex items-center gap-1.5 text-xs font-semibold rounded-md bg-neutral-950 dark:bg-white text-white dark:text-neutral-950 hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {passwordConfigured
                ? isEn
                  ? 'Unlock'
                  : 'Entsperren'
                : isEn
                  ? 'Set & unlock'
                  : 'Festlegen & entsperren'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
