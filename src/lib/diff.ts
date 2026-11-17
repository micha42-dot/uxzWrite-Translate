import type { DiffToken } from '../types';

/**
 * Tokenizes text into words, punctuation marks, and whitespace segments
 * so word-level diffs preserve exact formatting and line breaks.
 */
function tokenize(text: string): string[] {
  if (!text) return [];
  const matches = text.match(/\s+|[\p{L}\p{N}_-]+|[^\s\p{L}\p{N}_-]+/gu);
  return matches ?? [];
}

/**
 * Computes a word-level Longest Common Subsequence (LCS) diff between original and refined text.
 * Uses prefix/suffix trimming and a flat typed DP table for predictable performance.
 */
export function computeWordDiff(original: string, refined: string): {
  tokens: DiffToken[];
  addedCount: number;
  removedCount: number;
  changeCount: number;
} {
  if (original === refined) {
    return {
      tokens: original ? [{ type: 'equal', value: original }] : [],
      addedCount: 0,
      removedCount: 0,
      changeCount: 0,
    };
  }

  const a = tokenize(original);
  const b = tokenize(refined);

  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) {
    start++;
  }

  let endA = a.length - 1;
  let endB = b.length - 1;
  while (endA >= start && endB >= start && a[endA] === b[endB]) {
    endA--;
    endB--;
  }

  const tokens: DiffToken[] = [];

  if (start > 0) {
    tokens.push({ type: 'equal', value: a.slice(0, start).join('') });
  }

  const midA = a.slice(start, endA + 1);
  const midB = b.slice(start, endB + 1);
  const m = midA.length;
  const n = midB.length;

  // Guard against extreme quadratic blowup on massive documents (> 2500 changed tokens)
  if (m * n > 4_000_000) {
    if (m > 0) tokens.push({ type: 'remove', value: midA.join('') });
    if (n > 0) tokens.push({ type: 'add', value: midB.join('') });
  } else if (m === 0 && n > 0) {
    tokens.push({ type: 'add', value: midB.join('') });
  } else if (n === 0 && m > 0) {
    tokens.push({ type: 'remove', value: midA.join('') });
  } else if (m > 0 && n > 0) {
    const cols = n + 1;
    const dp = new Int32Array((m + 1) * cols);

    for (let i = m - 1; i >= 0; i--) {
      const rowOffset = i * cols;
      const nextRowOffset = (i + 1) * cols;
      for (let j = n - 1; j >= 0; j--) {
        if (midA[i] === midB[j]) {
          dp[rowOffset + j] = dp[nextRowOffset + (j + 1)] + 1;
        } else {
          const down = dp[nextRowOffset + j];
          const right = dp[rowOffset + (j + 1)];
          dp[rowOffset + j] = down >= right ? down : right;
        }
      }
    }

    let i = 0;
    let j = 0;
    while (i < m && j < n) {
      if (midA[i] === midB[j]) {
        tokens.push({ type: 'equal', value: midA[i] });
        i++;
        j++;
      } else if (dp[(i + 1) * cols + j] >= dp[i * cols + (j + 1)]) {
        tokens.push({ type: 'remove', value: midA[i] });
        i++;
      } else {
        tokens.push({ type: 'add', value: midB[j] });
        j++;
      }
    }
    while (i < m) {
      tokens.push({ type: 'remove', value: midA[i] });
      i++;
    }
    while (j < n) {
      tokens.push({ type: 'add', value: midB[j] });
      j++;
    }
  }

  if (endA + 1 < a.length) {
    tokens.push({ type: 'equal', value: a.slice(endA + 1).join('') });
  }

  // Merge consecutive tokens of the same type for clean rendering
  const merged: DiffToken[] = [];
  for (const token of tokens) {
    if (!token.value) continue;
    const prev = merged[merged.length - 1];
    if (prev && prev.type === token.type) {
      prev.value += token.value;
    } else {
      merged.push({ ...token });
    }
  }

  // Reorder consecutive remove+add pairs cleanly and count non-whitespace changes
  let addedCount = 0;
  let removedCount = 0;
  let changeCount = 0;

  for (let idx = 0; idx < merged.length; idx++) {
    const t = merged[idx];
    const hasContent = /\S/.test(t.value);
    if (!hasContent) continue;
    if (t.type === 'add') {
      addedCount++;
      const prev = merged[idx - 1];
      if (!prev || prev.type !== 'remove') {
        changeCount++;
      }
    } else if (t.type === 'remove') {
      removedCount++;
      changeCount++;
    }
  }

  return { tokens: merged, addedCount, removedCount, changeCount };
}

export interface SentenceSpan {
  index: number;
  text: string;
  start: number;
  end: number;
  isSentence: boolean;
}

/**
 * Splits text into clickable sentence spans while preserving exact whitespace/newlines.
 */
export function splitIntoSentenceSpans(text: string): SentenceSpan[] {
  if (!text) return [];
  const spans: SentenceSpan[] = [];
  const regex = /([^\n.!?]+(?:[.!?]+["'»”)]*|\n|$))|(\n+)/g;
  let match: RegExpExecArray | null;
  let lastIndex = 0;
  let sentenceCounter = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      spans.push({
        index: -1,
        text: text.slice(lastIndex, match.index),
        start: lastIndex,
        end: match.index,
        isSentence: false,
      });
    }

    const segment = match[0];
    const trimmed = segment.trim();
    const isRealSentence = trimmed.length >= 4 && /\p{L}/u.test(trimmed);

    if (isRealSentence) {
      // Separate leading whitespace so hover highlight wraps only the sentence text
      const leadingMatch = segment.match(/^(\s*)/);
      const trailingMatch = segment.match(/(\s*)$/);
      const leadLen = leadingMatch ? leadingMatch[1].length : 0;
      const trailLen = trailingMatch ? trailingMatch[1].length : 0;

      if (leadLen > 0) {
        spans.push({
          index: -1,
          text: segment.slice(0, leadLen),
          start: match.index,
          end: match.index + leadLen,
          isSentence: false,
        });
      }

      const coreStart = match.index + leadLen;
      const coreEnd = match.index + segment.length - trailLen;
      if (coreEnd > coreStart) {
        spans.push({
          index: sentenceCounter++,
          text: text.slice(coreStart, coreEnd),
          start: coreStart,
          end: coreEnd,
          isSentence: true,
        });
      }

      if (trailLen > 0) {
        spans.push({
          index: -1,
          text: segment.slice(segment.length - trailLen),
          start: coreEnd,
          end: match.index + segment.length,
          isSentence: false,
        });
      }
    } else {
      spans.push({
        index: -1,
        text: segment,
        start: match.index,
        end: match.index + segment.length,
        isSentence: false,
      });
    }

    lastIndex = match.index + segment.length;
    if (match[0].length === 0) break;
  }

  if (lastIndex < text.length) {
    spans.push({
      index: -1,
      text: text.slice(lastIndex),
      start: lastIndex,
      end: text.length,
      isSentence: false,
    });
  }

  return spans;
}

export function countTextStats(text: string): { words: number; chars: number } {
  const trimmed = text.trim();
  const words = trimmed ? trimmed.split(/\s+/).length : 0;
  return { words, chars: text.length };
}

function stripPunctuationAndSpace(value: string): string {
  return value.replace(/[\s\p{P}]/gu, '');
}

function isOnlyPunctuationDiff(before: string, after: string): boolean {
  const bCore = stripPunctuationAndSpace(before);
  const aCore = stripPunctuationAndSpace(after);
  return bCore.length > 0 && bCore === aCore && before !== after;
}

function isPurePunctuationToken(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && /^[\p{P}]+$/u.test(trimmed);
}

function buildSurroundingContextBefore(equalText: string, maxChars = 34): string {
  if (!equalText) return '';
  const lineBreakIdx = equalText.lastIndexOf('\n');
  const sliceFromLine = lineBreakIdx >= 0 ? equalText.slice(lineBreakIdx + 1) : equalText;
  if (!sliceFromLine) return '';

  const trimmedStart = sliceFromLine.replace(/^\s+/, '');
  if (trimmedStart.length <= maxChars) {
    return trimmedStart;
  }

  const tail = trimmedStart.slice(-maxChars);
  const firstSpace = tail.search(/\s/);
  const cleanTail = firstSpace > 0 ? tail.slice(firstSpace + 1) : tail;
  return cleanTail ? `…${cleanTail}` : '';
}

function buildSurroundingContextAfter(equalText: string, maxChars = 34): string {
  if (!equalText) return '';
  const lineBreakIdx = equalText.indexOf('\n');
  const sliceToLine = lineBreakIdx >= 0 ? equalText.slice(0, lineBreakIdx) : equalText;
  if (!sliceToLine) return '';

  const trimmedEnd = sliceToLine.replace(/\s+$/, '');
  if (trimmedEnd.length <= maxChars) {
    return trimmedEnd;
  }

  const head = trimmedEnd.slice(0, maxChars);
  const lastSpace = head.lastIndexOf(' ');
  const cleanHead = lastSpace > 0 ? head.slice(0, lastSpace) : head;
  return cleanHead ? `${cleanHead}…` : '';
}

/**
 * Extracts structured Before -> After hunks with exact offsets in refinedText
 * plus surrounding before/after prose context so each edit is understandable on its own.
 */
export function extractDiffHunks(original: string, refined: string): Array<{
  id: string;
  before: string;
  after: string;
  contextBefore: string;
  contextAfter: string;
  refinedStart: number;
  refinedEnd: number;
  category: 'zeichensetzung' | 'rechtschreibung' | 'pending';
  reason?: string;
}> {
  const { tokens } = computeWordDiff(original, refined);
  const hunks: Array<{
    id: string;
    before: string;
    after: string;
    contextBefore: string;
    contextAfter: string;
    refinedStart: number;
    refinedEnd: number;
    category: 'zeichensetzung' | 'rechtschreibung' | 'pending';
    reason?: string;
  }> = [];

  let refinedCursor = 0;
  let i = 0;
  let seq = 0;

  while (i < tokens.length) {
    const token = tokens[i];
    if (token.type === 'equal') {
      refinedCursor += token.value.length;
      i++;
      continue;
    }

    const prevToken = i > 0 ? tokens[i - 1] : null;
    const prevEqualText = prevToken && prevToken.type === 'equal' ? prevToken.value : '';

    let removed = '';
    let added = '';
    const startOffset = refinedCursor;

    while (i < tokens.length && tokens[i].type !== 'equal') {
      if (tokens[i].type === 'remove') {
        removed += tokens[i].value;
      } else if (tokens[i].type === 'add') {
        added += tokens[i].value;
        refinedCursor += tokens[i].value.length;
      }
      i++;
    }

    const nextToken = i < tokens.length ? tokens[i] : null;
    const nextEqualText = nextToken && nextToken.type === 'equal' ? nextToken.value : '';

    const endOffset = refinedCursor;
    const beforeTrimmed = removed.trim();
    const afterTrimmed = added.trim();

    if (!beforeTrimmed && !afterTrimmed) {
      continue;
    }

    let category: 'zeichensetzung' | 'rechtschreibung' | 'pending' = 'pending';
    let reason: string | undefined;

    if (
      (isPurePunctuationToken(beforeTrimmed) && !afterTrimmed) ||
      (!beforeTrimmed && isPurePunctuationToken(afterTrimmed)) ||
      (isPurePunctuationToken(beforeTrimmed) && isPurePunctuationToken(afterTrimmed)) ||
      isOnlyPunctuationDiff(beforeTrimmed, afterTrimmed)
    ) {
      category = 'zeichensetzung';
      reason = 'Zeichensetzung';
    } else if (
      beforeTrimmed.length > 0 &&
      afterTrimmed.length > 0 &&
      beforeTrimmed.toLowerCase() === afterTrimmed.toLowerCase()
    ) {
      category = 'rechtschreibung';
      reason = 'Groß-/Kleinschreibung';
    }

    hunks.push({
      id: `chg-${seq++}`,
      before: removed,
      after: added,
      contextBefore: buildSurroundingContextBefore(prevEqualText),
      contextAfter: buildSurroundingContextAfter(nextEqualText),
      refinedStart: startOffset,
      refinedEnd: endOffset,
      category,
      reason,
    });
  }

  return hunks;
}

export interface ParagraphChunk {
  text: string;
  separatorAfter: string;
}

/**
 * Splits multi-paragraph text along blank lines into balanced chunks
 * while preserving exact inter-paragraph separators.
 */
export function splitIntoParagraphChunks(text: string, maxChunkChars = 1200): ParagraphChunk[] {
  if (!text.trim()) return [];
  const parts = text.split(/(\r?\n\s*\r?\n+)/);
  const paragraphs: ParagraphChunk[] = [];

  for (let i = 0; i < parts.length; i += 2) {
    const body = parts[i] ?? '';
    const sep = parts[i + 1] ?? '';
    if (body.length === 0 && paragraphs.length > 0) {
      paragraphs[paragraphs.length - 1].separatorAfter += sep;
      continue;
    }
    paragraphs.push({ text: body, separatorAfter: sep });
  }

  if (paragraphs.length <= 1) {
    return [{ text, separatorAfter: '' }];
  }

  const chunks: ParagraphChunk[] = [];
  for (const para of paragraphs) {
    const prev = chunks[chunks.length - 1];
    if (
      prev &&
      prev.text.length + prev.separatorAfter.length + para.text.length <= maxChunkChars
    ) {
      prev.text = prev.text + prev.separatorAfter + para.text;
      prev.separatorAfter = para.separatorAfter;
    } else {
      chunks.push({ text: para.text, separatorAfter: para.separatorAfter });
    }
  }

  return chunks;
}

