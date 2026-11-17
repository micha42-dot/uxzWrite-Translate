import { createContext, useContext } from 'react';
import {
  CHANGE_CATEGORY_LABELS,
  SOURCE_LANGUAGES,
  WRITING_STYLES,
} from '../types';
import type {
  ChangeCategory,
  SourceLanguageId,
  TranslationTone,
  UiLanguage,
  WritingStyleId,
} from '../types';

export interface UiLanguageContextValue {
  uiLang: UiLanguage;
  setUiLang: (lang: UiLanguage) => void;
}

export const UiLanguageContext = createContext<UiLanguageContextValue>({
  uiLang: 'de',
  setUiLang: () => {},
});

export function useUiLang(): UiLanguageContextValue {
  return useContext(UiLanguageContext);
}

const LANGUAGE_LABELS_EN: Record<SourceLanguageId, string> = {
  auto: 'Detect language',
  de: 'German',
  'en-US': 'English (US)',
  'en-GB': 'English (UK)',
  fr: 'French',
  es: 'Spanish',
  it: 'Italian',
  nl: 'Dutch',
  pt: 'Portuguese',
  pl: 'Polish',
  sv: 'Swedish',
  tr: 'Turkish',
  uk: 'Ukrainian',
  ja: 'Japanese',
  zh: 'Chinese',
  ko: 'Korean',
  tlh: 'Klingon',
};

const STYLE_LABELS_EN: Record<WritingStyleId, string> = {
  ausgewogen: 'Balanced',
  umgangssprachlich: 'Casual',
  journalistisch: 'Journalistic',
  eloquent: 'Eloquent',
  hochgestochen: 'Ornate',
  geschaeftlich: 'Business',
  akademisch: 'Academic',
  praegnant: 'Concise',
};

const CATEGORY_LABELS_EN: Record<ChangeCategory, string> = {
  rechtschreibung: 'Spelling',
  grammatik: 'Grammar',
  zeichensetzung: 'Punctuation',
  stil: 'Style',
  klarheit: 'Clarity',
};

const TONE_LABELS_DE: Record<TranslationTone, string> = {
  neutral: 'Neutral / Natürlich',
  formal: 'Förmlich (Sie / Formal)',
  informal: 'Locker (Du / Informal)',
};

const TONE_LABELS_EN: Record<TranslationTone, string> = {
  neutral: 'Neutral / Natural',
  formal: 'Formal',
  informal: 'Informal',
};

export function getLanguageLabel(id: SourceLanguageId | string, uiLang: UiLanguage): string {
  if (uiLang === 'en' && id in LANGUAGE_LABELS_EN) {
    return LANGUAGE_LABELS_EN[id as SourceLanguageId];
  }
  return SOURCE_LANGUAGES.find((l) => l.id === id)?.label || id;
}

export function getStyleLabel(id: WritingStyleId | string, uiLang: UiLanguage): string {
  if (uiLang === 'en' && id in STYLE_LABELS_EN) {
    return STYLE_LABELS_EN[id as WritingStyleId];
  }
  return WRITING_STYLES.find((s) => s.id === id)?.label || id;
}

export function getCategoryLabel(cat: ChangeCategory, uiLang: UiLanguage): string {
  if (uiLang === 'en') {
    return CATEGORY_LABELS_EN[cat] || cat;
  }
  return CHANGE_CATEGORY_LABELS[cat] || cat;
}

export function getToneLabel(tone: TranslationTone, uiLang: UiLanguage): string {
  return uiLang === 'en' ? TONE_LABELS_EN[tone] : TONE_LABELS_DE[tone];
}
