import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeftRight,
  Bookmark,
  Check,
  ClipboardPaste,
  Copy,
  Languages,
  Loader2,
  Moon,
  Sparkles,
  Square,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import { fetchSentenceAlternatives, streamRewriteRequest } from '../lib/apiClient';
import { TRANSLATION_TONE_INSTRUCTIONS } from '../lib/prompts';
import { computeWordDiff, countTextStats, splitIntoParagraphChunks, splitIntoSentenceSpans } from '../lib/diff';
import type { SentenceSpan } from '../lib/diff';
import { TRANSLATABLE_LANGUAGES } from '../types';
import type {
  ChangeItem,
  OpenRouterStatus,
  SourceLanguageId,
  TargetLanguageId,
  TranslationTone,
  WritingPreferences,
} from '../types';

type OutputViewMode = 'diff' | 'clean';

interface TranslateWorkspaceProps {
  status: OpenRouterStatus;
  preferences: WritingPreferences;
  sourceText: string;
  translatedText: string;
  sourceLang: SourceLanguageId;
  targetLang: TargetLanguageId;
  tone: TranslationTone;
  changes: ChangeItem[];
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onChangeSourceText: (val: string) => void;
  onChangeTranslatedText: (val: string) => void;
  onChangeSourceLang: (val: SourceLanguageId) => void;
  onChangeTargetLang: (val: TargetLanguageId) => void;
  onChangeTone: (val: TranslationTone) => void;
  onChangeChanges: (val: ChangeItem[]) => void;
  onOpenSettings: () => void;
  onRequestUnlock: () => void;
  onSaveHistory: (entry: {
    sourceText: string;
    refinedText: string;
    sourceLang: SourceLanguageId;
    targetLang: TargetLanguageId;
    task: 'translate';
    mode: 'style';
    style: 'ausgewogen';
    model: string;
    changes: ChangeItem[];
  }) => Promise<void>;
}

const SAMPLE_TRANSLATE_TEXT =
  'Guten Tag, wir freuen uns sehr über Ihr Interesse an unserem neuen Projekt zur automatisierten Textverarbeitung. Bitte lassen Sie uns wissen, wann es Ihnen für ein kurzes Abstimmungsgespräch am besten passt.';

export function TranslateWorkspace({
  status,
  preferences,
  sourceText,
  translatedText,
  sourceLang,
  targetLang,
  tone,
  darkMode,
  onToggleDarkMode,
  onChangeSourceText,
  onChangeTranslatedText,
  onChangeSourceLang,
  onChangeTargetLang,
  onChangeTone,
  onChangeChanges,
  onOpenSettings,
  onSaveHistory,
}: TranslateWorkspaceProps) {
  const [outputView, setOutputView] = useState<OutputViewMode>('clean');
  const [instantMode, setInstantMode] = useState(preferences.settings?.defaultInstantMode ?? true);
  const [chunkingEnabled, setChunkingEnabled] = useState(preferences.settings?.defaultChunkingEnabled ?? true);
  const [toneMenuOpen, setToneMenuOpen] = useState(false);

  const [isStreaming, setIsStreaming] = useState(false);
  const [activeRunModel, setActiveRunModel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [savedFlag, setSavedFlag] = useState(false);

  const [selectedSentence, setSelectedSentence] = useState<{ start: number; end: number; text: string } | null>(null);
  const [alternatives, setAlternatives] = useState<string[]>([]);
  const [alternativesLoading, setAlternativesLoading] = useState(false);
  const [alternativesError, setAlternativesError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const lastSignatureRef = useRef<string>('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const toneMenuRef = useRef<HTMLDivElement | null>(null);
  const pasteTriggeredRef = useRef(false);

  useEffect(() => {
    if (!toneMenuOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (toneMenuRef.current && !toneMenuRef.current.contains(e.target as Node)) {
        setToneMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setToneMenuOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [toneMenuOpen]);

  const preferencesSignature = useMemo(() => {
    const termsSig = preferences.terms
      .filter((t) => t.enabled)
      .map((t) => `${t.term}:${t.caseSensitive ? 1 : 0}`)
      .join(',');
    const rulesSig = preferences.rules
      .filter((r) => r.enabled)
      .map((r) => `${r.id}:${r.instruction}`)
      .join('|');
    return `${termsSig}#${rulesSig}`;
  }, [preferences]);

  const sourceStats = useMemo(() => countTextStats(sourceText), [sourceText]);
  const translatedStats = useMemo(() => countTextStats(translatedText), [translatedText]);

  const diffResult = useMemo(() => {
    if (!translatedText || isStreaming) return { tokens: [], addedCount: 0, removedCount: 0, changeCount: 0 };
    return computeWordDiff(sourceText, translatedText);
  }, [sourceText, translatedText, isStreaming]);

  const sentenceSpans = useMemo(() => {
    if (!translatedText || isStreaming) return [];
    return splitIntoSentenceSpans(translatedText);
  }, [translatedText, isStreaming]);

  const runTranslate = useCallback(
    async (textToProcess: string, sLang: SourceLanguageId, tLang: TargetLanguageId, tTone: TranslationTone) => {
      const trimmed = textToProcess.trim();
      if (!trimmed) {
        onChangeTranslatedText('');
        onChangeChanges([]);
        setError(null);
        return;
      }

      if (!status.configured) return;

      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const signature = `${sLang}|${tLang}|${tTone}|${status.model}|${preferencesSignature}|${textToProcess}`;
      lastSignatureRef.current = signature;

      setIsStreaming(true);
      setActiveRunModel(status.model);
      setError(null);
      setSelectedSentence(null);
      setAlternatives([]);
      onChangeChanges([]);

      try {
        const chunks = chunkingEnabled ? splitIntoParagraphChunks(textToProcess) : [];
        let finalTranslation = '';

        if (chunks.length >= 2) {
          const outputs = new Array<string>(chunks.length).fill('');
          const assemble = () => {
            let combined = '';
            for (let i = 0; i < chunks.length; i++) {
              const part = outputs[i];
              if (!part) continue;
              combined += part;
              if (i < chunks.length - 1) combined += chunks[i].separatorAfter;
            }
            return combined;
          };

          let nextIdx = 0;
          let chunkErr: string | null = null;
          const workers = Math.min(4, chunks.length);

          const worker = async () => {
            while (nextIdx < chunks.length) {
              if (controller.signal.aborted || chunkErr) return;
              const idx = nextIdx++;
              const chunk = chunks[idx];
              const previousContext = idx > 0 ? chunks[idx - 1].text.slice(-300) : undefined;

              const res = await streamRewriteRequest({
                text: chunk.text,
                sourceLang: sLang,
                targetLang: tLang,
                tone: tTone,
                task: 'translate',
                mode: 'style',
                style: 'ausgewogen',
                model: status.model,
                previousContext,
                preferences,
                signal: controller.signal,
                onDelta: (acc) => {
                  outputs[idx] = acc;
                  onChangeTranslatedText(assemble());
                },
              });
              if (!res.ok) {
                chunkErr = res.error;
                controller.abort();
                return;
              }
              outputs[idx] = res.text;
              onChangeTranslatedText(assemble());
            }
          };

          await Promise.all(Array.from({ length: workers }, () => worker()));

          if (chunkErr) {
            setError(chunkErr);
            setIsStreaming(false);
            setActiveRunModel(null);
            return;
          }
          if (controller.signal.aborted) return;
          finalTranslation = assemble();
        } else {
          const res = await streamRewriteRequest({
            text: textToProcess,
            sourceLang: sLang,
            targetLang: tLang,
            tone: tTone,
            task: 'translate',
            mode: 'style',
            style: 'ausgewogen',
            model: status.model,
            preferences,
            signal: controller.signal,
            onDelta: (acc) => onChangeTranslatedText(acc),
          });

          if (!res.ok) {
            setError(res.error);
            setIsStreaming(false);
            setActiveRunModel(null);
            return;
          }
          finalTranslation = res.text;
        }

        if (!controller.signal.aborted && status.dualReviewEnabled && finalTranslation.trim().length > 0) {
          const reviewModel = status.secondaryModel || status.model;
          setActiveRunModel(reviewModel);

          const reviewRes = await streamRewriteRequest({
            text: finalTranslation,
            originalText: textToProcess,
            verify: true,
            sourceLang: sLang,
            targetLang: tLang,
            tone: tTone,
            task: 'translate',
            mode: 'style',
            style: 'ausgewogen',
            model: reviewModel,
            preferences,
            signal: controller.signal,
            onDelta: (acc) => {
              if (acc) onChangeTranslatedText(acc);
            },
          });

          if (reviewRes.ok && reviewRes.text.trim().length > 0) {
            finalTranslation = reviewRes.text;
            onChangeTranslatedText(finalTranslation);
          }
        }

        setIsStreaming(false);
        setActiveRunModel(null);
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Übersetzungsfehler.');
        setIsStreaming(false);
        setActiveRunModel(null);
      }
    },
    [
      status.configured,
      status.model,
      status.dualReviewEnabled,
      status.secondaryModel,
      chunkingEnabled,
      preferences,
      preferencesSignature,
      onChangeTranslatedText,
      onChangeChanges,
    ]
  );

  useEffect(() => {
    if (!instantMode || !status.configured) return;
    if (!sourceText.trim()) {
      lastSignatureRef.current = '';
      onChangeTranslatedText('');
      return;
    }

    const signature = `${sourceLang}|${targetLang}|${tone}|${status.model}|${preferencesSignature}|${sourceText}`;
    if (signature === lastSignatureRef.current) return;

    const delay = pasteTriggeredRef.current ? 60 : 420;
    pasteTriggeredRef.current = false;

    const timer = window.setTimeout(() => {
      runTranslate(sourceText, sourceLang, targetLang, tone);
    }, delay);

    return () => window.clearTimeout(timer);
  }, [
    sourceText,
    sourceLang,
    targetLang,
    tone,
    status.configured,
    status.model,
    preferencesSignature,
    instantMode,
    runTranslate,
    onChangeTranslatedText,
  ]);

  function handleStop() {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setIsStreaming(false);
    setActiveRunModel(null);
  }

  async function handlePaste() {
    try {
      const clip = await navigator.clipboard.readText();
      if (clip) {
        pasteTriggeredRef.current = true;
        onChangeSourceText(clip);
        textareaRef.current?.focus();
      }
    } catch {
      textareaRef.current?.focus();
    }
  }

  function handleClear() {
    handleStop();
    onChangeSourceText('');
    onChangeTranslatedText('');
    setError(null);
    setSelectedSentence(null);
    setAlternatives([]);
    lastSignatureRef.current = '';
    textareaRef.current?.focus();
  }

  function handleCopy() {
    if (!translatedText) return;
    navigator.clipboard.writeText(translatedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  function handleAdopt() {
    if (!translatedText) return;
    lastSignatureRef.current = `${targetLang}|${sourceLang}|${tone}|${status.model}|${preferencesSignature}|${translatedText}`;
    onChangeSourceText(translatedText);
  }

  async function handleSave() {
    if (!sourceText.trim() || !translatedText.trim()) return;
    await onSaveHistory({
      sourceText,
      refinedText: translatedText,
      sourceLang,
      targetLang,
      task: 'translate',
      mode: 'style',
      style: 'ausgewogen',
      model: status.model,
      changes: [],
    });
    setSavedFlag(true);
    setTimeout(() => setSavedFlag(false), 1800);
  }

  async function handleSelectSentence(span: SentenceSpan) {
    if (isStreaming || !status.configured) return;
    setSelectedSentence(span);
    setAlternatives([]);
    setAlternativesError(null);
    setAlternativesLoading(true);

    try {
      const res = await fetchSentenceAlternatives({
        fullText: translatedText,
        sentence: span.text,
        sourceLang: targetLang,
        mode: 'style',
        style: 'ausgewogen',
        model: status.model,
        task: 'translate',
        targetLang,
        preferences,
      });
      if (!res.ok) setAlternativesError(res.error);
      else setAlternatives(res.alternatives);
    } catch {
      setAlternativesError('Netzwerkfehler beim Laden von Alternativen.');
    } finally {
      setAlternativesLoading(false);
    }
  }

  function handleApplyAlternative(replacement: string) {
    if (!selectedSentence) return;
    const updated =
      translatedText.slice(0, selectedSentence.start) + replacement + translatedText.slice(selectedSentence.end);
    onChangeTranslatedText(updated);
    setSelectedSentence(null);
    setAlternatives([]);
  }

  const toneLabels: Record<TranslationTone, string> = {
    neutral: 'Neutral / Natürlich',
    formal: 'Förmlich (Sie / Formal)',
    informal: 'Locker (Du / Informal)',
  };

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-5 space-y-4">
      {/* Control Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Target Language Bar */}
          <div
            className="inline-flex items-center p-1 rounded-xl bg-white/90 dark:bg-[#0E131D] border border-slate-200/90 dark:border-slate-800 shadow-2xs overflow-x-auto no-scrollbar max-w-full"
            role="group"
            aria-label="Zielsprache"
          >
            {TRANSLATABLE_LANGUAGES.map((lang) => {
              const active = targetLang === lang.id;
              return (
                <button
                  key={lang.id}
                  type="button"
                  onClick={() => onChangeTargetLang(lang.id)}
                  className={`relative px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active ? 'text-white' : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-slate-100'
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="translate-lang-pill"
                      transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                      className="absolute inset-0 rounded-lg bg-blue-700 dark:bg-blue-600 shadow-xs"
                    />
                  )}
                  <span className="relative z-10">{lang.label}</span>
                </button>
              );
            })}
          </div>

          {/* Tone Selector */}
          <div ref={toneMenuRef} className="relative inline-flex">
            <button
              type="button"
              onClick={() => setToneMenuOpen((v) => !v)}
              aria-expanded={toneMenuOpen}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl bg-white/90 dark:bg-[#0E131D] border border-slate-200/90 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:text-slate-950 shadow-2xs cursor-pointer"
            >
              <span>Ton: {toneLabels[tone]}</span>
            </button>

            <AnimatePresence>
              {toneMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                  className="absolute left-0 top-full mt-1.5 z-50 w-52 p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E131D] shadow-xl space-y-1"
                >
                  {(['neutral', 'formal', 'informal'] as TranslationTone[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        onChangeTone(t);
                        setToneMenuOpen(false);
                      }}
                      className={`w-full px-3 py-2 text-left text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                        tone === t
                          ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      {toneLabels[t]}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setChunkingEnabled((v) => !v)}
            aria-pressed={chunkingEnabled}
            className={`px-3 py-2 text-xs font-medium rounded-xl border transition-all duration-150 whitespace-nowrap shrink-0 cursor-pointer ${
              chunkingEnabled
                ? 'border-slate-200/90 dark:border-slate-800 bg-white/90 dark:bg-[#0E131D] text-slate-900 dark:text-slate-100 shadow-2xs'
                : 'border-slate-200/70 dark:border-slate-800/70 bg-transparent text-slate-500 dark:text-slate-400'
            }`}
          >
            Absatz-Chunking {chunkingEnabled ? 'an' : 'aus'}
          </button>

          <button
            type="button"
            onClick={() => setInstantMode((v) => !v)}
            aria-pressed={instantMode}
            className={`px-3 py-2 text-xs font-medium rounded-xl border transition-all duration-150 whitespace-nowrap shrink-0 cursor-pointer ${
              instantMode
                ? 'border-slate-200/90 dark:border-slate-800 bg-white/90 dark:bg-[#0E131D] text-slate-900 dark:text-slate-100 shadow-2xs'
                : 'border-slate-200/70 dark:border-slate-800/70 bg-transparent text-slate-500 dark:text-slate-400'
            }`}
          >
            Sofort-Modus {instantMode ? 'an' : 'aus'}
          </button>

          <button
            type="button"
            onClick={onToggleDarkMode}
            aria-label={darkMode ? 'Helles Design' : 'Dunkles Design'}
            className="p-2 rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white/90 dark:bg-[#0E131D] text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white shadow-2xs transition-colors cursor-pointer"
          >
            {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {isStreaming ? (
            <button
              type="button"
              onClick={handleStop}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-xl bg-slate-950 dark:bg-white text-white dark:text-slate-950 hover:opacity-90 active:scale-[0.98] transition-all duration-150 whitespace-nowrap shrink-0 cursor-pointer shadow-xs"
            >
              <Square className="w-3 h-3 fill-current" />
              Stoppen
            </button>
          ) : (
            <button
              type="button"
              disabled={!sourceText.trim() || !status.configured}
              onClick={() => runTranslate(sourceText, sourceLang, targetLang, tone)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-xl bg-blue-700 dark:bg-blue-600 text-white hover:bg-blue-800 dark:hover:bg-blue-500 active:scale-[0.98] disabled:opacity-45 disabled:cursor-not-allowed transition-all duration-150 whitespace-nowrap shrink-0 cursor-pointer shadow-xs"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Übersetzen
            </button>
          )}
        </div>
      </div>

      {/* Main Two-Column Editor */}
      <div className="border border-slate-200/90 dark:border-slate-800 rounded-2xl bg-white dark:bg-[#101623] shadow-[0_1px_2px_rgba(15,23,42,0.04),0_18px_42px_-18px_rgba(15,23,42,0.1)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.45),0_22px_50px_-20px_rgba(0,0,0,0.7)] overflow-hidden grid grid-cols-1 lg:grid-cols-2 lg:divide-x lg:divide-slate-200/90 dark:lg:divide-slate-800 min-h-[540px] lg:h-[calc(100vh-188px)]">
        {/* Left Column: Source */}
        <section className="flex flex-col min-h-[320px] lg:min-h-0 bg-[#FAFBFD] dark:bg-[#0B0F17]">
          <div className="h-12 px-5 border-b border-slate-200/80 dark:border-slate-800/90 flex items-center justify-between gap-3 shrink-0">
            <select
              value={sourceLang}
              onChange={(e) => onChangeSourceLang(e.target.value as SourceLanguageId)}
              className="h-8 pr-2 text-sm font-medium bg-transparent text-slate-900 dark:text-slate-100 focus:outline-none cursor-pointer"
            >
              {TRANSLATABLE_LANGUAGES.map((lang) => (
                <option key={lang.id} value={lang.id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
                  {lang.label}
                </option>
              ))}
            </select>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handlePaste}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors cursor-pointer"
              >
                <ClipboardPaste className="w-3.5 h-3.5" />
                Einfügen
              </button>
              {sourceText.length > 0 && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Leeren
                </button>
              )}
            </div>
          </div>

          <div className="relative flex-1 flex flex-col">
            <textarea
              ref={textareaRef}
              value={sourceText}
              onPaste={() => {
                pasteTriggeredRef.current = true;
              }}
              onChange={(e) => onChangeSourceText(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  runTranslate(sourceText, sourceLang, targetLang, tone);
                }
              }}
              placeholder="Text zum Übersetzen eingeben…"
              spellCheck={false}
              className="w-full flex-1 p-6 resize-none bg-transparent text-[15.5px] sm:text-base leading-[1.75] tracking-[-0.005em] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none"
            />
          </div>

          <div className="h-11 px-5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400 shrink-0">
            <div className="flex items-center gap-2 tabular-nums">
              <span>{sourceStats.words} Wörter</span>
              <span aria-hidden="true">·</span>
              <span>{sourceStats.chars} Zeichen</span>
            </div>

            {!sourceText && (
              <button
                type="button"
                onClick={() => {
                  pasteTriggeredRef.current = true;
                  onChangeSourceText(SAMPLE_TRANSLATE_TEXT);
                }}
                className="text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
              >
                Beispieltext laden
              </button>
            )}
          </div>
        </section>

        {/* Right Column: Translated */}
        <section className="flex flex-col min-h-[320px] lg:min-h-0 border-t border-slate-200 dark:border-slate-800 lg:border-t-0 bg-white dark:bg-[#101623]">
          <div className="h-12 px-5 border-b border-slate-200/80 dark:border-slate-800/90 flex items-center justify-between gap-3 shrink-0">
            <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-100/90 dark:bg-[#0B0F17] border border-slate-200/60 dark:border-slate-800/80">
              {[
                { id: 'clean', label: 'Übersetzung' },
                { id: 'diff', label: 'Vergleich' },
              ].map((tab) => {
                const active = outputView === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setOutputView(tab.id as OutputViewMode)}
                    className={`relative px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                      active ? 'text-slate-950 dark:text-white' : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="translate-tab"
                        transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                        className="absolute inset-0 rounded-md bg-white dark:bg-slate-800 shadow-2xs"
                      />
                    )}
                    <span className="relative z-10">{tab.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2.5 text-xs text-slate-500 dark:text-slate-400 min-w-0">
              {isStreaming ? (
                <span className="inline-flex items-center gap-1.5 text-blue-700 dark:text-blue-400 font-medium">
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  <span className="truncate font-mono">{activeRunModel || status.model}</span>
                </span>
              ) : (
                status.configured && (
                  <span className="font-mono truncate">{status.model}</span>
                )
              )}
            </div>
          </div>

          <div className="relative flex-1 overflow-y-auto p-6">
            {!status.configured ? (
              <div className="h-full flex flex-col items-center justify-center text-center gap-4 py-8">
                <Languages className="w-6 h-6 text-slate-400" />
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  OpenRouter API-Schlüssel erforderlich
                </p>
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="px-4 py-2 text-xs font-medium rounded-lg bg-blue-700 text-white cursor-pointer"
                >
                  OpenRouter API hinterlegen
                </button>
              </div>
            ) : error ? (
              <div className="p-4 rounded-lg border border-rose-200 bg-rose-50 text-xs text-rose-900 space-y-2">
                <p>{error}</p>
                <button
                  type="button"
                  onClick={() => runTranslate(sourceText, sourceLang, targetLang, tone)}
                  className="px-3 py-1.5 text-xs font-medium rounded-md bg-rose-700 text-white cursor-pointer"
                >
                  Erneut versuchen
                </button>
              </div>
            ) : !translatedText && !isStreaming ? (
              <div className="h-full flex items-center justify-center text-sm text-slate-400">
                {sourceText.trim() ? 'Bereit zur Übersetzung' : 'Übersetzung erscheint hier'}
              </div>
            ) : outputView === 'diff' ? (
              <div className="text-[15.5px] sm:text-base leading-[1.75] tracking-[-0.005em] whitespace-pre-wrap text-slate-900 dark:text-slate-100">
                {diffResult.tokens.map((token: { type: string; value: string }, idx: number) => {
                  if (token.type === 'equal') return <span key={idx}>{token.value}</span>;
                  if (token.type === 'remove') {
                    return (
                      <del
                        key={idx}
                        className="bg-rose-500/12 text-rose-700 line-through decoration-rose-500/75 rounded-xs px-0.5"
                      >
                        {token.value}
                      </del>
                    );
                  }
                  return (
                    <ins
                      key={idx}
                      className="no-underline bg-emerald-500/12 text-emerald-950 dark:text-emerald-200 border-b-[1.5px] border-emerald-500/55 rounded-xs px-0.5"
                    >
                      {token.value}
                    </ins>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-[15.5px] sm:text-base leading-[1.75] tracking-[-0.005em] whitespace-pre-wrap text-slate-900 dark:text-slate-100">
                  {sentenceSpans.map((span: SentenceSpan, idx: number) => {
                    if (!span.isSentence) return <span key={idx}>{span.text}</span>;
                    const isSelected = selectedSentence?.start === span.start && selectedSentence?.end === span.end;
                    return (
                      <span
                        key={idx}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleSelectSentence(span)}
                        className={`rounded-xs transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-blue-500/14 dark:bg-blue-500/22 text-blue-950 dark:text-blue-100'
                            : 'hover:bg-slate-100 dark:hover:bg-slate-800/70'
                        }`}
                      >
                        {span.text}
                      </span>
                    );
                  })}
                  {isStreaming && (
                    <span className="inline-block w-1.5 h-4 align-middle bg-blue-600 dark:bg-blue-400 ml-0.5 animate-pulse" />
                  )}
                </div>

                {selectedSentence && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#FAFBFD] dark:bg-[#0B0F17] space-y-3 shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                        Satz-Alternativen (Übersetzung)
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedSentence(null)}
                        className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {alternativesLoading ? (
                      <div className="flex items-center gap-2 text-xs text-slate-500 py-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Alternativen werden geladen…
                      </div>
                    ) : alternativesError ? (
                      <p className="text-xs text-rose-700">{alternativesError}</p>
                    ) : alternatives.length === 0 ? (
                      <p className="text-xs text-slate-500">Keine Alternativen gefunden.</p>
                    ) : (
                      <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-md bg-white dark:bg-slate-900">
                        {alternatives.map((alt, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => handleApplyAlternative(alt)}
                            className="w-full px-3 py-2.5 text-left text-sm text-slate-800 dark:text-slate-200 hover:bg-blue-50/70 transition-colors cursor-pointer"
                          >
                            {alt}
                          </button>
                        ))}
                      </div>
                    )}
                  </motion.div>
                )}
              </div>
            )}
          </div>

          <div className="h-11 px-5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2 text-xs text-slate-500 tabular-nums">
              <span>{translatedStats.words} Wörter</span>
            </div>

            <div className="flex items-center gap-1.5">
              {translatedText && !isStreaming && (
                <>
                  <button
                    type="button"
                    onClick={handleSave}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors cursor-pointer"
                  >
                    {savedFlag ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Bookmark className="w-3.5 h-3.5" />}
                    {savedFlag ? 'Gesichert' : 'Sichern'}
                  </button>

                  <button
                    type="button"
                    onClick={handleAdopt}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors cursor-pointer"
                  >
                    <ArrowLeftRight className="w-3.5 h-3.5" />
                    Übernehmen
                  </button>

                  <button
                    type="button"
                    onClick={handleCopy}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:opacity-90 rounded-md transition-opacity cursor-pointer"
                  >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'Kopiert' : 'Kopieren'}
                  </button>
                </>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
