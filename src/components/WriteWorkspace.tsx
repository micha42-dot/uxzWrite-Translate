import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertCircle,
  ArrowLeftRight,
  ArrowRight,
  Bookmark,
  Check,
  CheckCheck,
  ChevronRight,
  ClipboardPaste,
  Copy,
  KeyRound,
  Loader2,
  Moon,
  RotateCcw,
  Sparkles,
  Square,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import {
  analyzeChangesRequest,
  fetchSentenceAlternatives,
  streamRewriteRequest,
} from '../lib/apiClient';
import {
  computeWordDiff,
  countTextStats,
  extractDiffHunks,
  splitIntoParagraphChunks,
  splitIntoSentenceSpans,
} from '../lib/diff';
import {
  CHANGE_CATEGORY_LABELS,
  SOURCE_LANGUAGES,
  WRITING_STYLES,
} from '../types';
import type {
  ChangeCategory,
  ChangeItem,
  OpenRouterStatus,
  RewriteMode,
  SourceLanguageId,
  WritingPreferences,
  WritingStyleId,
} from '../types';

type OutputViewMode = 'diff' | 'clean' | 'changes';
type ChangeFilter = 'all' | ChangeCategory;

interface WriteWorkspaceProps {
  status: OpenRouterStatus;
  preferences: WritingPreferences;
  sourceText: string;
  refinedText: string;
  sourceLang: SourceLanguageId;
  mode: RewriteMode;
  style: WritingStyleId;
  changes: ChangeItem[];
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onChangeSourceText: (val: string) => void;
  onChangeRefinedText: (val: string) => void;
  onChangeSourceLang: (val: SourceLanguageId) => void;
  onChangeMode: (val: RewriteMode) => void;
  onChangeStyle: (val: WritingStyleId) => void;
  onChangeChanges: (val: ChangeItem[]) => void;
  onOpenSettings: () => void;
  onRequestUnlock: () => void;
  onSaveHistory: (entry: {
    sourceText: string;
    refinedText: string;
    sourceLang: SourceLanguageId;
    mode: RewriteMode;
    style: WritingStyleId;
    model: string;
    changes: ChangeItem[];
  }) => Promise<void>;
}

const SAMPLE_TEXT =
  'Sehr geehrte Damen und Herren, ich schreibe Ihnen wegen dem neuen Projekt das wir letzte Woche besprochen hatten. Leider gab es ein paar missverständnisse bei der Zeitplanung und wir müssen das dringend klären damit alles reibungslos läuft. Es wäre super wenn wir uns morgen kurz telefonieren könnten.';

export function WriteWorkspace({
  status,
  preferences,
  sourceText,
  refinedText,
  sourceLang,
  mode,
  style,
  changes,
  darkMode,
  onToggleDarkMode,
  onChangeSourceText,
  onChangeRefinedText,
  onChangeSourceLang,
  onChangeMode,
  onChangeStyle,
  onChangeChanges,
  onOpenSettings,
  onRequestUnlock,
  onSaveHistory,
}: WriteWorkspaceProps) {
  const [outputView, setOutputView] = useState<OutputViewMode>('diff');
  const [changeFilter, setChangeFilter] = useState<ChangeFilter>('all');
  const [instantMode, setInstantMode] = useState(true);
  const [chunkingEnabled, setChunkingEnabled] = useState(true);
  const [styleRailOpen, setStyleRailOpen] = useState(false);
  const [instantInfoOpen, setInstantInfoOpen] = useState(false);
  const [instantPopoverPos, setInstantPopoverPos] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    width: number;
  }>({ top: 120, left: 12, width: 320 });
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeRunPhase, setActiveRunPhase] = useState<'primary' | 'chunked' | 'review' | 'verify' | null>(null);
  const [activeRunModel, setActiveRunModel] = useState<string | null>(null);
  const [analyzingChanges, setAnalyzingChanges] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [savedFlag, setSavedFlag] = useState(false);

  // Sentence alternatives state
  const [selectedSentence, setSelectedSentence] = useState<{
    start: number;
    end: number;
    text: string;
  } | null>(null);
  const [alternatives, setAlternatives] = useState<string[]>([]);
  const [alternativesLoading, setAlternativesLoading] = useState(false);
  const [alternativesError, setAlternativesError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const analyzeAbortRef = useRef<AbortController | null>(null);
  const lastTriggeredSignatureRef = useRef<string>('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const styleRailRef = useRef<HTMLDivElement | null>(null);
  const instantInfoRef = useRef<HTMLDivElement | null>(null);
  const instantInfoBtnRef = useRef<HTMLButtonElement | null>(null);

  const pasteTriggeredRef = useRef(false);

  const updateInstantPopoverPos = useCallback(() => {
    const btn = instantInfoBtnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const margin = 12;
    const width = Math.min(320, Math.max(220, viewportW - margin * 2));
    const preferredLeft = rect.right - width;
    const left = Math.max(margin, Math.min(preferredLeft, viewportW - width - margin));
    const estimatedHeight = 200;
    const fitsBelow = rect.bottom + 8 + estimatedHeight <= viewportH - margin;
    const fitsAbove = rect.top - 8 - estimatedHeight >= margin;

    if (!fitsBelow && fitsAbove) {
      setInstantPopoverPos({
        bottom: viewportH - rect.top + 8,
        left,
        width,
      });
    } else {
      setInstantPopoverPos({
        top: Math.min(rect.bottom + 8, Math.max(margin, viewportH - estimatedHeight - margin)),
        left,
        width,
      });
    }
  }, []);

  useLayoutEffect(() => {
    if (!instantInfoOpen) return;
    updateInstantPopoverPos();
  }, [instantInfoOpen, updateInstantPopoverPos]);

  useEffect(() => {
    if (!instantInfoOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (instantInfoRef.current && !instantInfoRef.current.contains(e.target as Node)) {
        setInstantInfoOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setInstantInfoOpen(false);
    };
    window.addEventListener('resize', updateInstantPopoverPos);
    window.addEventListener('scroll', updateInstantPopoverPos, true);
    document.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('resize', updateInstantPopoverPos);
      window.removeEventListener('scroll', updateInstantPopoverPos, true);
      document.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [instantInfoOpen, updateInstantPopoverPos]);

  useEffect(() => {
    if (!styleRailOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (styleRailRef.current && !styleRailRef.current.contains(e.target as Node)) {
        setStyleRailOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setStyleRailOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [styleRailOpen]);

  const sourceStats = useMemo(() => countTextStats(sourceText), [sourceText]);
  const refinedStats = useMemo(() => countTextStats(refinedText), [refinedText]);

  const diffResult = useMemo(() => {
    if (!refinedText || isStreaming) {
      return { tokens: [], addedCount: 0, removedCount: 0, changeCount: 0 };
    }
    return computeWordDiff(sourceText, refinedText);
  }, [sourceText, refinedText, isStreaming]);

  const sentenceSpans = useMemo(() => {
    if (!refinedText || isStreaming) return [];
    return splitIntoSentenceSpans(refinedText);
  }, [refinedText, isStreaming]);

  const classifyHunks = useCallback(
    async (orig: string, refined: string) => {
      const extracted = extractDiffHunks(orig, refined);
      onChangeChanges(extracted);

      const pendingHunks = extracted.filter((h) => h.category === 'pending');
      if (pendingHunks.length === 0) {
        setAnalyzingChanges(false);
        return;
      }

      if (analyzeAbortRef.current) {
        analyzeAbortRef.current.abort();
      }
      const controller = new AbortController();
      analyzeAbortRef.current = controller;
      setAnalyzingChanges(true);

      try {
        const classifications = await analyzeChangesRequest({
          sourceText: orig,
          refinedText: refined,
          hunks: pendingHunks.map((h) => ({
            id: h.id,
            before: h.before,
            after: h.after,
          })),
          model: status.model,
          signal: controller.signal,
        });

        const map = new Map(classifications.map((item) => [item.id, item]));

        const updated: ChangeItem[] = extracted.map((h) => {
          if (h.category !== 'pending') return h;
          const match = map.get(h.id);
          if (match) {
            return {
              ...h,
              category: match.category,
              reason: match.reason || undefined,
            };
          }
          return {
            ...h,
            category: mode === 'correction' ? 'grammatik' : 'stil',
          };
        });
        onChangeChanges(updated);
      } catch (err) {
        if ((err as Error)?.name !== 'AbortError') {
          // Keep deterministic hunks without failing the main rewrite
        }
      } finally {
        setAnalyzingChanges(false);
      }
    },
    [mode, status.model, onChangeChanges]
  );

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

  const runRewrite = useCallback(
    async (textToProcess: string, lang: SourceLanguageId, rewriteMode: RewriteMode, rewriteStyle: WritingStyleId) => {
      const trimmed = textToProcess.trim();
      if (!trimmed) {
        onChangeRefinedText('');
        onChangeChanges([]);
        setError(null);
        return;
      }

      if (!status.configured) {
        return;
      }

      if (abortRef.current) {
        abortRef.current.abort();
      }
      const controller = new AbortController();
      abortRef.current = controller;

      const signature = `${lang}|${rewriteMode}|${rewriteStyle}|${status.model}|${preferencesSignature}|${textToProcess}`;
      lastTriggeredSignatureRef.current = signature;

      setIsStreaming(true);
      setActiveRunModel(status.model);
      setError(null);
      setSelectedSentence(null);
      setAlternatives([]);
      onChangeChanges([]);

      try {
        const chunks = chunkingEnabled ? splitIntoParagraphChunks(textToProcess) : [];
        let pass1Text = '';

        if (chunks.length >= 2) {
          setActiveRunPhase('chunked');
          const outputs = new Array<string>(chunks.length).fill('');
          const assembleChunks = () => {
            let combined = '';
            for (let idx = 0; idx < chunks.length; idx++) {
              const part = outputs[idx];
              if (!part) continue;
              combined += part;
              if (idx < chunks.length - 1) {
                combined += chunks[idx].separatorAfter;
              }
            }
            return combined;
          };

          let nextIndex = 0;
          let chunkError: string | null = null;
          const workerCount = Math.min(4, chunks.length);

          const worker = async () => {
            while (nextIndex < chunks.length) {
              if (controller.signal.aborted || chunkError) return;
              const idx = nextIndex++;
              const chunk = chunks[idx];
              const previousContext = idx > 0 ? chunks[idx - 1].text.slice(-300) : undefined;
              const res = await streamRewriteRequest({
                text: chunk.text,
                sourceLang: lang,
                mode: rewriteMode,
                style: rewriteStyle,
                model: status.model,
                previousContext,
                preferences,
                signal: controller.signal,
                onDelta: (acc) => {
                  outputs[idx] = acc;
                  onChangeRefinedText(assembleChunks());
                },
              });
              if (!res.ok) {
                chunkError = res.error;
                controller.abort();
                return;
              }
              outputs[idx] = res.text;
              onChangeRefinedText(assembleChunks());
            }
          };

          await Promise.all(Array.from({ length: workerCount }, () => worker()));

          if (chunkError) {
            setError(chunkError);
            setIsStreaming(false);
            setActiveRunPhase(null);
            setActiveRunModel(null);
            return;
          }
          if (controller.signal.aborted) {
            return;
          }
          pass1Text = assembleChunks();
        } else {
          setActiveRunPhase('primary');
          const result = await streamRewriteRequest({
            text: textToProcess,
            sourceLang: lang,
            mode: rewriteMode,
            style: rewriteStyle,
            model: status.model,
            preferences,
            signal: controller.signal,
            onDelta: (accumulated) => {
              onChangeRefinedText(accumulated);
            },
          });

          if (!result.ok) {
            setError(result.error);
            setIsStreaming(false);
            setActiveRunPhase(null);
            setActiveRunModel(null);
            return;
          }
          pass1Text = result.text;
        }

        let finalText = pass1Text;

        if (!controller.signal.aborted && status.dualReviewEnabled && pass1Text.trim().length > 0) {
          const reviewModel = status.secondaryModel || status.model;
          setActiveRunPhase('review');
          setActiveRunModel(reviewModel);

          const reviewResult = await streamRewriteRequest({
            text: pass1Text,
            originalText: textToProcess,
            verify: true,
            sourceLang: lang,
            mode: rewriteMode,
            style: rewriteStyle,
            model: reviewModel,
            preferences,
            signal: controller.signal,
            onDelta: (accumulated) => {
              if (accumulated) {
                onChangeRefinedText(accumulated);
              }
            },
          });

          if (!reviewResult.ok) {
            setError(reviewResult.error);
            setIsStreaming(false);
            setActiveRunPhase(null);
            setActiveRunModel(null);
            return;
          }

          if (reviewResult.text.trim().length > 0) {
            finalText = reviewResult.text;
            onChangeRefinedText(finalText);
          }
        }

        setIsStreaming(false);
        setActiveRunPhase(null);
        setActiveRunModel(null);

        if (finalText.trim().length > 0) {
          await classifyHunks(textToProcess, finalText);
        }
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') {
          return;
        }
        setError(err instanceof Error ? err.message : 'Verbindungsfehler beim Verfeinern.');
        setIsStreaming(false);
        setActiveRunPhase(null);
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
      onChangeRefinedText,
      onChangeChanges,
      classifyHunks,
    ]
  );

  const handleVerifyCurrent = useCallback(async () => {
    if (!status.configured || !refinedText.trim() || isStreaming) return;

    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    const verifyModel = status.dualReviewEnabled ? (status.secondaryModel || status.model) : status.model;
    setIsStreaming(true);
    setActiveRunPhase('verify');
    setActiveRunModel(verifyModel);
    setError(null);
    setSelectedSentence(null);
    setAlternatives([]);

    try {
      const result = await streamRewriteRequest({
        text: refinedText,
        originalText: sourceText,
        verify: true,
        sourceLang,
        mode,
        style,
        model: verifyModel,
        preferences,
        signal: controller.signal,
        onDelta: (accumulated) => {
          if (accumulated) {
            onChangeRefinedText(accumulated);
          }
        },
      });

      setIsStreaming(false);
      setActiveRunPhase(null);
      setActiveRunModel(null);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      if (result.text.trim().length > 0) {
        onChangeRefinedText(result.text);
        await classifyHunks(sourceText, result.text);
      }
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') {
        return;
      }
      setError(err instanceof Error ? err.message : 'Verbindungsfehler bei der Nachprüfung.');
      setIsStreaming(false);
      setActiveRunPhase(null);
      setActiveRunModel(null);
    }
  }, [
    status.configured,
    status.dualReviewEnabled,
    status.secondaryModel,
    status.model,
    refinedText,
    sourceText,
    sourceLang,
    mode,
    style,
    preferences,
    isStreaming,
    onChangeRefinedText,
    classifyHunks,
  ]);

  // Instant debounced rewrite whenever text, language, mode, style, model, or rules change
  useEffect(() => {
    if (!instantMode || !status.configured) return;
    if (!sourceText.trim()) {
      lastTriggeredSignatureRef.current = '';
      onChangeRefinedText('');
      onChangeChanges([]);
      return;
    }

    const signature = `${sourceLang}|${mode}|${style}|${status.model}|${preferencesSignature}|${sourceText}`;
    if (signature === lastTriggeredSignatureRef.current) return;

    const delay = pasteTriggeredRef.current ? 60 : 420;
    pasteTriggeredRef.current = false;

    const timer = window.setTimeout(() => {
      runRewrite(sourceText, sourceLang, mode, style);
    }, delay);

    return () => window.clearTimeout(timer);
  }, [
    sourceText,
    sourceLang,
    mode,
    style,
    status.configured,
    status.model,
    preferencesSignature,
    instantMode,
    runRewrite,
    onChangeRefinedText,
    onChangeChanges,
  ]);

  function handleStopStreaming() {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setIsStreaming(false);
    setActiveRunPhase(null);
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
    handleStopStreaming();
    onChangeSourceText('');
    onChangeRefinedText('');
    onChangeChanges([]);
    setError(null);
    setSelectedSentence(null);
    setAlternatives([]);
    lastTriggeredSignatureRef.current = '';
    textareaRef.current?.focus();
  }

  function handleCopyRefined() {
    if (!refinedText) return;
    navigator.clipboard.writeText(refinedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  function handleAdoptRefined() {
    if (!refinedText) return;
    lastTriggeredSignatureRef.current = `${sourceLang}|${mode}|${style}|${status.model}|${preferencesSignature}|${refinedText}`;
    onChangeSourceText(refinedText);
    onChangeChanges([]);
    setSelectedSentence(null);
  }

  async function handleSaveCurrent() {
    if (!sourceText.trim() || !refinedText.trim()) return;
    await onSaveHistory({
      sourceText,
      refinedText,
      sourceLang,
      mode,
      style,
      model: status.model,
      changes,
    });
    setSavedFlag(true);
    setTimeout(() => setSavedFlag(false), 1800);
  }

  async function handleSelectSentence(span: { start: number; end: number; text: string }) {
    if (isStreaming || !status.configured) return;
    setSelectedSentence(span);
    setAlternatives([]);
    setAlternativesError(null);
    setAlternativesLoading(true);

    try {
      const result = await fetchSentenceAlternatives({
        fullText: refinedText,
        sentence: span.text,
        sourceLang,
        mode,
        style,
        model: status.model,
        preferences,
      });
      if (!result.ok) {
        setAlternativesError(result.error);
      } else {
        setAlternatives(result.alternatives);
      }
    } catch {
      setAlternativesError('Netzwerkfehler beim Laden von Alternativen.');
    } finally {
      setAlternativesLoading(false);
    }
  }

  function handleApplyAlternative(replacement: string) {
    if (!selectedSentence) return;
    const updated =
      refinedText.slice(0, selectedSentence.start) +
      replacement +
      refinedText.slice(selectedSentence.end);
    onChangeRefinedText(updated);
    setSelectedSentence(null);
    setAlternatives([]);
    classifyHunks(sourceText, updated);
  }

  function handleRevertChange(item: ChangeItem) {
    const updated =
      refinedText.slice(0, item.refinedStart) +
      item.before +
      refinedText.slice(item.refinedEnd);

    onChangeRefinedText(updated);

    // Recompute offsets while preserving existing OpenRouter category labels
    const prevLookup = new Map<string, { category: ChangeItem['category']; reason?: string }>();
    for (const c of changes) {
      if (c.id !== item.id) {
        prevLookup.set(`${c.before}\0${c.after}`, {
          category: c.category,
          reason: c.reason,
        });
      }
    }

    const nextHunks = extractDiffHunks(sourceText, updated).map((h) => {
      const preserved = prevLookup.get(`${h.before}\0${h.after}`);
      if (preserved && preserved.category !== 'pending') {
        return { ...h, category: preserved.category, reason: preserved.reason };
      }
      return h;
    });
    onChangeChanges(nextHunks);
  }

  const categoryCounts = useMemo(() => {
    const counts: Record<ChangeFilter, number> = {
      all: changes.length,
      rechtschreibung: 0,
      grammatik: 0,
      zeichensetzung: 0,
      stil: 0,
      klarheit: 0,
    };
    for (const c of changes) {
      if (c.category !== 'pending' && c.category in counts) {
        counts[c.category as ChangeCategory]++;
      }
    }
    return counts;
  }, [changes]);

  const visibleChanges = useMemo(() => {
    if (changeFilter === 'all') return changes;
    return changes.filter((c) => c.category === changeFilter);
  }, [changes, changeFilter]);

  const categoryColorClass: Record<ChangeCategory | 'pending', string> = {
    rechtschreibung: 'text-rose-700 dark:text-rose-400',
    grammatik: 'text-amber-700 dark:text-amber-400',
    zeichensetzung: 'text-sky-700 dark:text-sky-400',
    stil: 'text-indigo-700 dark:text-indigo-400',
    klarheit: 'text-emerald-700 dark:text-emerald-400',
    pending: 'text-slate-400 dark:text-slate-500',
  };

  const activeStyleObj = useMemo(
    () => WRITING_STYLES.find((s) => s.id === style) ?? WRITING_STYLES[0],
    [style]
  );
  const otherStyles = useMemo(
    () => WRITING_STYLES.filter((s) => s.id !== activeStyleObj.id),
    [activeStyleObj.id]
  );

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-5 space-y-4">
      {/* Control Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Mode Segmented Control */}
          <div
            className="inline-flex items-center p-1 rounded-xl bg-white/90 dark:bg-[#0E131D] border border-slate-200/90 dark:border-slate-800 shadow-2xs"
            role="group"
            aria-label="Bearbeitungsmodus"
          >
            {[
              { id: 'correction', label: 'Nur Korrektur' },
              { id: 'style', label: 'Stil & Korrektur' },
            ].map((item) => {
              const active = mode === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    const nextMode = item.id as RewriteMode;
                    onChangeMode(nextMode);
                    if (nextMode === 'correction') {
                      setStyleRailOpen(false);
                    }
                  }}
                  className={`relative px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'text-slate-950 dark:text-white'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="workspace-mode-pill"
                      transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                      className="absolute inset-0 rounded-lg bg-slate-100 dark:bg-slate-800"
                    />
                  )}
                  <span className="relative z-10">{item.label}</span>
                </button>
              );
            })}
          </div>

          {/* Animated Collapsible Style Rail */}
          <div
            ref={styleRailRef}
            className="inline-flex items-center p-1 rounded-xl bg-white/90 dark:bg-[#0E131D] border border-slate-200/90 dark:border-slate-800 shadow-2xs overflow-x-auto no-scrollbar max-w-full"
            role="group"
            aria-label="Schreibstil"
          >
            <button
              type="button"
              onClick={() => {
                if (mode !== 'style') {
                  onChangeMode('style');
                }
                setStyleRailOpen((v) => !v);
              }}
              aria-expanded={styleRailOpen}
              className={`relative inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                mode === 'style'
                  ? 'bg-blue-700 dark:bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-slate-200'
              }`}
            >
              <span>{activeStyleObj.label}</span>
              <ChevronRight
                className={`w-3.5 h-3.5 transition-transform duration-200 ${
                  styleRailOpen ? 'rotate-180' : 'rotate-0'
                }`}
              />
            </button>

            <AnimatePresence initial={false}>
              {styleRailOpen && (
                <motion.div
                  key="style-fanout"
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                  className="flex items-center overflow-hidden"
                >
                  <div className="flex items-center gap-0.5 pl-1">
                    {otherStyles.map((s, idx) => (
                      <motion.button
                        key={s.id}
                        type="button"
                        initial={{ opacity: 0, x: -16, scale: 0.9 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, x: -10, scale: 0.92 }}
                        transition={{
                          duration: 0.18,
                          delay: idx * 0.025,
                          ease: [0.16, 1, 0.3, 1],
                        }}
                        onClick={() => {
                          onChangeStyle(s.id);
                          if (mode !== 'style') onChangeMode('style');
                          setStyleRailOpen(false);
                        }}
                        className="px-2.5 py-1.5 text-xs font-medium rounded-lg text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        {s.label}
                      </motion.button>
                    ))}
                  </div>
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

          <div ref={instantInfoRef} className="relative inline-flex items-center gap-1">
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
              ref={instantInfoBtnRef}
              type="button"
              onClick={() => {
                if (!instantInfoOpen) {
                  updateInstantPopoverPos();
                }
                setInstantInfoOpen((v) => !v);
              }}
              aria-expanded={instantInfoOpen}
              aria-label="Info zum Sofort-Modus"
              className={`p-2 rounded-xl border transition-colors cursor-pointer ${
                instantInfoOpen
                  ? 'border-blue-600/40 bg-blue-50/80 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400'
                  : 'border-slate-200/90 dark:border-slate-800 bg-white/90 dark:bg-[#0E131D] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 shadow-2xs'
              }`}
            >
              <AlertCircle className="w-4 h-4" />
            </button>

            <AnimatePresence>
              {instantInfoOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.98 }}
                  transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                  role="dialog"
                  aria-label="Erklärung zum Sofort-Modus"
                  style={{
                    top: instantPopoverPos.top,
                    bottom: instantPopoverPos.bottom,
                    left: instantPopoverPos.left,
                    width: instantPopoverPos.width,
                  }}
                  className="fixed z-50 max-w-[calc(100vw-24px)] p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E131D] shadow-xl space-y-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-950 dark:text-white">
                      Sofort-Modus
                    </span>
                    <button
                      type="button"
                      onClick={() => setInstantInfoOpen(false)}
                      aria-label="Info schließen"
                      className="p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="space-y-2.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                    <div>
                      <span className="font-semibold text-slate-900 dark:text-slate-100">An:</span>{' '}
                      Verfeinert automatisch direkt beim Einfügen (<span className="font-mono tabular-nums">60 ms</span>), nach kurzen Tipp-Pausen (<span className="font-mono tabular-nums">420 ms</span>) sowie bei jedem Stil- oder Sprachwechsel.
                    </div>
                    <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800">
                      <span className="font-semibold text-slate-900 dark:text-slate-100">Aus:</span>{' '}
                      Kein automatischer Abruf während des Schreibens. Startet gezielt über <span className="font-medium text-slate-800 dark:text-slate-200">Verfeinern</span> oder <span className="font-mono">Strg/Cmd + Enter</span> – ideal für längere Entwürfe und zum Sparen von API-Anfragen.
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

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
              onClick={handleStopStreaming}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-xl bg-slate-950 dark:bg-white text-white dark:text-slate-950 hover:opacity-90 active:scale-[0.98] transition-all duration-150 whitespace-nowrap shrink-0 cursor-pointer shadow-xs"
            >
              <Square className="w-3 h-3 fill-current" />
              Stoppen
            </button>
          ) : (
            <button
              type="button"
              disabled={!sourceText.trim() || !status.configured}
              onClick={() => runRewrite(sourceText, sourceLang, mode, style)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-xl bg-blue-700 dark:bg-blue-600 text-white hover:bg-blue-800 dark:hover:bg-blue-500 active:scale-[0.98] disabled:opacity-45 disabled:cursor-not-allowed transition-all duration-150 whitespace-nowrap shrink-0 cursor-pointer shadow-xs"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Verfeinern
            </button>
          )}
        </div>
      </div>

      {/* Main Two-Column Editor */}
      <div className="border border-slate-200/90 dark:border-slate-800 rounded-2xl bg-white dark:bg-[#101623] shadow-[0_1px_2px_rgba(15,23,42,0.04),0_18px_42px_-18px_rgba(15,23,42,0.1)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.45),0_22px_50px_-20px_rgba(0,0,0,0.7)] overflow-hidden grid grid-cols-1 lg:grid-cols-2 lg:divide-x lg:divide-slate-200/90 dark:lg:divide-slate-800 min-h-[540px] lg:h-[calc(100vh-188px)]">
        {/* Left Column: Original */}
        <section className="flex flex-col min-h-[320px] lg:min-h-0 bg-[#FAFBFD] dark:bg-[#0B0F17]">
          <div className="h-12 px-5 border-b border-slate-200/80 dark:border-slate-800/90 flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-3">
              <label htmlFor="source-lang" className="sr-only">
                Ausgangssprache
              </label>
              <select
                id="source-lang"
                value={sourceLang}
                onChange={(e) => onChangeSourceLang(e.target.value as SourceLanguageId)}
                className="h-8 pr-2 text-sm font-medium bg-transparent text-slate-900 dark:text-slate-100 focus:outline-none cursor-pointer"
              >
                {SOURCE_LANGUAGES.map((lang) => (
                  <option
                    key={lang.id}
                    value={lang.id}
                    className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                  >
                    {lang.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handlePaste}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <ClipboardPaste className="w-3.5 h-3.5" />
                Einfügen
              </button>
              {sourceText.length > 0 && (
                <button
                  type="button"
                  onClick={handleClear}
                  aria-label="Text löschen"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
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
                  runRewrite(sourceText, sourceLang, mode, style);
                }
              }}
              placeholder="Text einfügen oder schreiben…"
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
                  onChangeSourceText(SAMPLE_TEXT);
                }}
                className="text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
              >
                Beispieltext laden
              </button>
            )}
          </div>
        </section>

        {/* Right Column: Refined */}
        <section className="flex flex-col min-h-[320px] lg:min-h-0 border-t border-slate-200 dark:border-slate-800 lg:border-t-0 bg-white dark:bg-[#101623]">
          <div className="h-12 px-5 border-b border-slate-200/80 dark:border-slate-800/90 flex items-center justify-between gap-3 shrink-0">
            <div
              className="inline-flex items-center p-0.5 rounded-lg bg-slate-100/90 dark:bg-[#0B0F17] border border-slate-200/60 dark:border-slate-800/80"
              role="tablist"
              aria-label="Ausgabeansicht"
            >
              {[
                { id: 'diff', label: 'Änderungen' },
                { id: 'clean', label: 'Reintext' },
                { id: 'changes', label: 'Vorher / Nachher' },
              ].map((tab) => {
                const active = outputView === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setOutputView(tab.id as OutputViewMode)}
                    className={`relative px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      active
                        ? 'text-slate-950 dark:text-white'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="output-view-tab"
                        transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                        className="absolute inset-0 rounded-md bg-white dark:bg-slate-800 shadow-2xs"
                      />
                    )}
                    <span className="relative z-10">
                      {tab.label}
                      {tab.id === 'changes' && changes.length > 0 && (
                        <span className="ml-1.5 text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">
                          {changes.length}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2.5 text-xs text-slate-500 dark:text-slate-400 min-w-0">
              {isStreaming ? (
                <span className="inline-flex items-center gap-1.5 text-blue-700 dark:text-blue-400 font-medium min-w-0">
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  <span className="truncate max-w-[240px] font-mono">
                    {activeRunPhase === 'review'
                      ? `Zweitprüfung · ${activeRunModel || status.secondaryModel}`
                      : activeRunPhase === 'verify'
                        ? `Nachprüfung · ${activeRunModel || status.model}`
                        : activeRunPhase === 'chunked'
                          ? `Absätze · ${activeRunModel || status.model}`
                          : activeRunModel || status.model}
                  </span>
                </span>
              ) : analyzingChanges ? (
                <span className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400 shrink-0">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Kategorisiert…
                </span>
              ) : (
                status.configured && (
                  <button
                    type="button"
                    onClick={onOpenSettings}
                    className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 font-mono truncate max-w-[260px] transition-colors cursor-pointer"
                  >
                    <span className="truncate">{status.model}</span>
                    {status.dualReviewEnabled && (
                      <>
                        <ArrowRight className="w-3 h-3 opacity-60 shrink-0" />
                        <span className="truncate">{status.secondaryModel || status.model}</span>
                      </>
                    )}
                  </button>
                )
              )}
            </div>
          </div>

          <div className="relative flex-1 overflow-y-auto p-6">
            {!status.configured ? (
              <div className="h-full flex flex-col items-center justify-center text-center gap-4 py-8">
                <KeyRound className="w-6 h-6 text-slate-400 dark:text-slate-500" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    OpenRouter API-Schlüssel erforderlich
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="px-4 py-2 text-xs font-medium rounded-lg bg-blue-700 dark:bg-blue-600 text-white hover:bg-blue-800 dark:hover:bg-blue-500 transition-colors cursor-pointer"
                >
                  OpenRouter API hinterlegen
                </button>
              </div>
            ) : error ? (
              <div className="p-4 rounded-lg border border-rose-200 dark:border-rose-900/70 bg-rose-50 dark:bg-rose-950/35 space-y-3">
                <p className="text-sm text-rose-900 dark:text-rose-200">{error}</p>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => runRewrite(sourceText, sourceLang, mode, style)}
                    className="px-3 py-1.5 text-xs font-medium rounded-md bg-rose-700 text-white hover:bg-rose-800 cursor-pointer"
                  >
                    Erneut versuchen
                  </button>
                  {error.includes('Passwort') && (
                    <button
                      type="button"
                      onClick={onRequestUnlock}
                      className="px-3 py-1.5 text-xs font-medium rounded-md border border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200 hover:bg-rose-100 dark:hover:bg-rose-950/60 cursor-pointer"
                    >
                      Passwort eingeben
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onOpenSettings}
                    className="text-xs font-medium text-rose-800 dark:text-rose-300 hover:underline cursor-pointer"
                  >
                    OpenRouter prüfen
                  </button>
                </div>
              </div>
            ) : !refinedText && !isStreaming ? (
              <div className="h-full flex items-center justify-center text-sm text-slate-400 dark:text-slate-600">
                {sourceText.trim() ? 'Bereit zur Verfeinerung' : 'Verfeinerter Text erscheint hier'}
              </div>
            ) : outputView === 'changes' ? (
              /* Vorher / Nachher Liste with Category Filters */
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-1.5 pb-3 border-b border-slate-200 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setChangeFilter('all')}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      changeFilter === 'all'
                        ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    Alle <span className="ml-1 opacity-75 tabular-nums">{categoryCounts.all}</span>
                  </button>
                  {(Object.keys(CHANGE_CATEGORY_LABELS) as ChangeCategory[]).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setChangeFilter(cat)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        changeFilter === cat
                          ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      {CHANGE_CATEGORY_LABELS[cat]}{' '}
                      <span className="ml-1 opacity-75 tabular-nums">{categoryCounts[cat]}</span>
                    </button>
                  ))}
                </div>

                {visibleChanges.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                    {changes.length === 0
                      ? 'Keine Abweichungen zum Ausgangstext.'
                      : 'Keine Änderungen in dieser Kategorie.'}
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                    {visibleChanges.map((item) => {
                      const catLabel =
                        item.category === 'pending'
                          ? 'Wird analysiert…'
                          : CHANGE_CATEGORY_LABELS[item.category];
                      return (
                        <li key={item.id} className="py-3 first:pt-0 space-y-2">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 text-xs">
                              <span className={`font-semibold ${categoryColorClass[item.category]}`}>
                                {catLabel}
                              </span>
                              {item.reason && item.reason !== catLabel && (
                                <>
                                  <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
                                    ·
                                  </span>
                                  <span className="text-slate-500 dark:text-slate-400">{item.reason}</span>
                                </>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={() => handleRevertChange(item)}
                              className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              <RotateCcw className="w-3 h-3" />
                              Rückgängig
                            </button>
                          </div>

                          <div className="text-sm leading-relaxed text-slate-600 dark:text-slate-400 break-words">
                            {item.contextBefore && (
                              <span className="text-slate-400 dark:text-slate-500 mr-1.5">
                                {item.contextBefore}
                              </span>
                            )}
                            <span className="inline-flex flex-wrap items-baseline gap-1.5 align-baseline">
                              <span className="px-1.5 py-0.5 rounded bg-rose-500/12 dark:bg-rose-500/18 text-rose-700 dark:text-rose-300 line-through decoration-rose-500/75">
                                {item.before.trim() || '∅'}
                              </span>
                              <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0 self-center" />
                              <span className="px-1.5 py-0.5 rounded bg-emerald-500/12 dark:bg-emerald-500/18 text-emerald-950 dark:text-emerald-200 font-medium">
                                {item.after.trim() || '∅'}
                              </span>
                            </span>
                            {item.contextAfter && (
                              <span className="text-slate-400 dark:text-slate-500 ml-1.5">
                                {item.contextAfter}
                              </span>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ) : isStreaming ? (
              /* Smooth real-time streaming output without expensive per-token LCS diff */
              <div className="text-[15.5px] sm:text-base leading-[1.75] tracking-[-0.005em] whitespace-pre-wrap text-slate-900 dark:text-slate-100">
                {refinedText || (
                  <span className="text-slate-400 dark:text-slate-500">Antwort wird empfangen…</span>
                )}
                <span className="inline-block w-1.5 h-4 align-middle bg-blue-600 dark:bg-blue-400 ml-0.5 animate-pulse" />
              </div>
            ) : outputView === 'diff' ? (
              /* Inline Word-Level Diff */
              <div
                onCopy={(e) => {
                  const selection = window.getSelection();
                  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;
                  const fragment = selection.getRangeAt(0).cloneContents();
                  fragment.querySelectorAll('del, [data-diff-remove="true"]').forEach((el) => el.remove());
                  const cleanText = fragment.textContent ?? '';
                  e.preventDefault();
                  e.clipboardData.setData('text/plain', cleanText);
                }}
                className="text-[15.5px] sm:text-base leading-[1.75] tracking-[-0.005em] whitespace-pre-wrap text-slate-900 dark:text-slate-100"
              >
                {diffResult.tokens.map((token, idx) => {
                  if (token.type === 'equal') {
                    return <span key={idx}>{token.value}</span>;
                  }
                  if (token.type === 'remove') {
                    return (
                      <del
                        key={idx}
                        data-diff-remove="true"
                        aria-hidden="true"
                        className="select-none bg-rose-500/12 dark:bg-rose-500/18 text-rose-700 dark:text-rose-300 line-through decoration-rose-500/75 decoration-[1.5px] rounded-xs px-0.5"
                      >
                        {token.value}
                      </del>
                    );
                  }
                  return (
                    <ins
                      key={idx}
                      className="no-underline bg-emerald-500/12 dark:bg-emerald-500/18 text-emerald-950 dark:text-emerald-200 border-b-[1.5px] border-emerald-500/55 rounded-xs px-0.5"
                    >
                      {token.value}
                    </ins>
                  );
                })}
              </div>
            ) : (
              /* Clean Text with Clickable Sentences for Alternatives */
              <div className="space-y-4">
                <div className="text-[15.5px] sm:text-base leading-[1.75] tracking-[-0.005em] whitespace-pre-wrap text-slate-900 dark:text-slate-100">
                  {sentenceSpans.map((span, idx) => {
                    if (!span.isSentence) {
                      return <span key={idx}>{span.text}</span>;
                    }
                    const isSelected =
                      selectedSentence?.start === span.start && selectedSentence?.end === span.end;
                    return (
                      <span
                        key={idx}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleSelectSentence(span)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleSelectSentence(span);
                          }
                        }}
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
                    transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                    className="p-4 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-[#FAFBFD] dark:bg-[#0B0F17] space-y-3 shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                        Satz-Alternativen
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedSentence(null)}
                        aria-label="Alternativen schließen"
                        className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {alternativesLoading ? (
                      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 py-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Alternativen werden geladen…
                      </div>
                    ) : alternativesError ? (
                      <p className="text-xs text-rose-700 dark:text-rose-400">{alternativesError}</p>
                    ) : alternatives.length === 0 ? (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Keine Alternativen gefunden.
                      </p>
                    ) : (
                      <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-md bg-white dark:bg-slate-900">
                        {alternatives.map((alt, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => handleApplyAlternative(alt)}
                            className="w-full px-3 py-2.5 text-left text-sm text-slate-800 dark:text-slate-200 hover:bg-blue-50/70 dark:hover:bg-blue-950/30 transition-colors cursor-pointer"
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
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              <span>{refinedStats.words} Wörter</span>
              {refinedText && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{diffResult.changeCount} Änderungen</span>
                </>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              {refinedText && !isStreaming && (
                <>
                  {status.configured && (
                    <button
                      type="button"
                      onClick={handleVerifyCurrent}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                      Nachprüfen
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleSaveCurrent}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {savedFlag ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Bookmark className="w-3.5 h-3.5" />}
                    {savedFlag ? 'Gesichert' : 'Sichern'}
                  </button>

                  <button
                    type="button"
                    onClick={handleAdoptRefined}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <ArrowLeftRight className="w-3.5 h-3.5" />
                    Übernehmen
                  </button>

                  <button
                    type="button"
                    onClick={handleCopyRefined}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:opacity-90 rounded-md transition-opacity whitespace-nowrap shrink-0 cursor-pointer"
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
