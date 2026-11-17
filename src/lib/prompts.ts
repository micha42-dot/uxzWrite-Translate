export interface PromptPreferencesInput {
  terms?: Array<{ term: string; caseSensitive?: boolean; enabled?: boolean }>;
  rules?: Array<{ title?: string; instruction: string; enabled?: boolean }>;
}

export const LANGUAGE_INSTRUCTIONS: Record<string, string> = {
  auto: 'Erkenne die Sprache des Eingabetextes automatisch und verbleibe strikt in genau dieser Sprache. Übersetze den Text niemals in eine andere Sprache.',
  de: 'Der Text ist auf Deutsch. Verbleibe strikt auf Deutsch und beachte die aktuelle deutsche Rechtschreibung, Grammatik und Zeichensetzung.',
  'en-US': 'The text is in American English. Keep the text strictly in American English (US spelling and conventions).',
  'en-GB': 'The text is in British English. Keep the text strictly in British English (UK spelling and conventions).',
  fr: 'Le texte est en français. Reste strictement en français et respecte l’orthographe, la grammaire et la typographie françaises.',
  es: 'El texto está en español. Mantente estrictamente en español y respeta la ortografía y gramática del español.',
  it: 'Il texto è in italiano. Rimani rigorosamente in italiano e rispetta ortografia e grammatica italiane.',
  nl: 'De tekst is in het Nederlands. Blijf strikt in het Nederlands en volg de Nederlandse spelling en grammatica.',
  pt: 'O texto está em português. Mantenha-se estritamente em português e respeite a ortografia e gramática.',
  pl: 'Tekst jest po polsku. Pozostań ściśle przy języku polskim i przestrzegaj zasad polskiej ortografii oraz gramatyki.',
  sv: 'Texten är på svenska. Håll dig strikt till svenska och följ svensk stavning och grammatik.',
  tr: 'Metin Türkçedir. Kesinlikle Türkçe kal ve Türkçe yazım ile dilbilgisi kurallarına uy.',
  uk: 'Текст написаний українською мовою. Залишайся суворо українською мовою та дотримуйся українського правопису.',
  ja: 'テキストは日本語です。日本語のまま自然な表記と文法を維持してください。',
  zh: '文本为中文。请严格保持中文并遵循自然的现代汉语表达与标点规范。',
  ko: '텍스트는 한국어입니다. 한국어를 유지하며 정확한 맞춤법과 자연스러운 문법을 따르세요.',
  tlh: 'Der Text ist auf Klingonisch (tlhIngan Hol). Verbleibe strikt im Klingonischen und beachte die kanonische Okrand-Umschrift inklusive exakter Groß-/Kleinschreibung (z. B. q vs. Q, D, S, H, I, tlh, ng, ch, gh, ’/\') sowie die OVS-Satzstellung und Verbpräfixe/-suffixe.',
};

export const TARGET_LANGUAGE_NAMES: Record<string, string> = {
  de: 'Deutsch (aktuelle deutsche Rechtschreibung und natürliche Idiomatik)',
  'en-US': 'Amerikanisches Englisch (US English, US-Orthografie)',
  'en-GB': 'Britisches Englisch (UK English, UK-Orthografie)',
  fr: 'Französisch (natürliches, idiomatisches Französisch)',
  es: 'Spanisch (natürliches, idiomatisches Spanisch)',
  it: 'Italienisch (natürliches, idiomatisches Italienisch)',
  nl: 'Niederländisch (natürliches, idiomatisches Niederländisch)',
  pt: 'Portugiesisch (natürliches, idiomatisches Portugiesisch)',
  pl: 'Polnisch (natürliches, idiomatisches Polnisch)',
  sv: 'Schwedisch (natürliches, idiomatisches Schwedisch)',
  tr: 'Türkisch (natürliches, idiomatisches Türkisch)',
  uk: 'Ukrainisch (natürliches, idiomatisches Ukrainisch)',
  ja: 'Japanisch (natürliches, idiomatisches Japanisch)',
  zh: 'Chinesisch (natürliches, idiomatisches modernes Chinesisch)',
  ko: 'Koreanisch (natürliches, idiomatisches Koreanisch)',
  tlh: 'Klingonisch (tlhIngan Hol – kanonische Okrand-Umschrift mit exakter Groß-/Kleinschreibung wie q/Q, D, S, H, I, ng, tlh, ch, gh, \' sowie korrekter Grammatik)',
};

export const TRANSLATION_TONE_INSTRUCTIONS: Record<string, string> = {
  neutral: 'Wähle eine natürliche, präzise und dem Ausgangstext angemessene Tonalität.',
  formal: 'Verwende konsequent eine höfliche, förmliche Anrede- und Stilebene (z. B. Sie / formal register).',
  informal: 'Verwende eine lockere, persönliche und zwanglose Anrede- und Stilebene (z. B. Du / informal register).',
};

export const STYLE_INSTRUCTIONS: Record<string, string> = {
  ausgewogen: 'Formuliere klar, natürlich, flüssig und stilistisch ausgewogen. Verbessere Lesefluss und Ausdruck ohne Künstlichkeit.',
  umgangssprachlich: 'Formuliere locker, ungezwungen, alltagsnah und authentisch umgangssprachlich, wie in einem natürlichen Gespräch unter Bekannten.',
  journalistisch: 'Formuliere präzise, aktiv, sachlich-packend und klar strukturiert wie in hochwertigem Qualitätsjournalismus. Vermeide Füllwörter und Passivkonstruktionen.',
  eloquent: 'Formuliere sprachgewandt, elegant, nuanciert und treffsicher im Ausdruck, mit gehobenem Wortschatz und angenehmem Satzrhythmus.',
  hochgestochen: 'Formuliere ausgesprochen gehoben, bildungssprachlich, kunstvoll, gewählt-förmlich und literarisch-erhaben.',
  geschaeftlich: 'Formuliere professionell, verbindlich, höflich und zielorientiert für geschäftliche Korrespondenz.',
  akademisch: 'Formuliere wissenschaftlich-präzise, objektiv, differenziert und terminologisch sauber.',
  praegnant: 'Verdichte den Text maximal auf das Wesentliche: kurz, direkt, schnörkellos und frei von Redundanz bei vollständigem Erhalt aller Fakten.',
};

export function buildGlossaryAndRulesPromptBlock(preferences?: PromptPreferencesInput): string | null {
  if (!preferences) return null;

  const activeTerms = (preferences.terms ?? []).filter(
    (t) => t && t.enabled !== false && typeof t.term === 'string' && t.term.trim().length > 0
  );
  const activeRules = (preferences.rules ?? []).filter(
    (r) => r && r.enabled !== false && typeof r.instruction === 'string' && r.instruction.trim().length > 0
  );

  if (activeTerms.length === 0 && activeRules.length === 0) {
    return null;
  }

  const sections: string[] = [];

  if (activeTerms.length > 0) {
    const lines = activeTerms.slice(0, 120).map((t) => {
      const exactNote = t.caseSensitive ? ' (exakte Groß-/Kleinschreibung bewahren)' : '';
      return `- „${t.term.trim()}“${exactNote}`;
    });
    sections.push(
      [
        'Geschützte Begriffe (Wörterbuch – UNANTASTBAR):',
        'Die folgenden Begriffe, Eigennamen und Schreibweisen dürfen NIEMALS verändert, übersetzt, korrigiert, gebeugt, in Anführungszeichen gesetzt oder durch Synonyme ersetzt werden. Übernimm sie unverändert, sofern sie im Text vorkommen:',
        ...lines,
      ].join('\n')
    );
  }

  if (activeRules.length > 0) {
    const lines = activeRules.slice(0, 40).map((r, idx) => {
      const label = r.title?.trim() ? `${r.title.trim()}: ` : '';
      return `${idx + 1}. ${label}${r.instruction.trim()}`;
    });
    sections.push(
      [
        'Verbindliche Schreib- und Formatierungsregeln (strikt einhalten):',
        ...lines,
      ].join('\n')
    );
  }

  return sections.join('\n\n');
}

export function buildRewritePrompts(
  sourceLang: string,
  mode: 'correction' | 'style',
  style: string,
  previousContext?: string,
  preferences?: PromptPreferencesInput
): {
  system: string;
  temperature: number;
} {
  const langRule = LANGUAGE_INSTRUCTIONS[sourceLang] || LANGUAGE_INSTRUCTIONS.auto;
  const customBlock = buildGlossaryAndRulesPromptBlock(preferences);
  const chunkNote = previousContext
    ? [
        'Hinweis zum Textabschnitt: Du bearbeitest einen einzelnen Absatz/Abschnitt aus einem längeren Dokument.',
        'Gib ausschließlich die überarbeitete Fassung genau dieses Eingabeabschnitts zurück – wiederhole niemals den vorausgehenden Kontext.',
        `Vorheriger Kontext (nur zum Verständnis, nicht ausgeben):\n"""${previousContext.slice(-360)}"""`,
      ].join('\n')
    : null;

  if (mode === 'correction') {
    return {
      temperature: 0.1,
      system: [
        'Du bist ein präziser Lektorat- und Korrekturdienst wie DeepL Write im reinen Korrekturmodus.',
        langRule,
        'Aufgabe: Korrigiere AUSSCHLIESSLICH Rechtschreibung, Grammatik, Zeichensetzung, Kasus/Tempus/Kongruenz und eindeutige Tipp- oder Syntaxfehler.',
        'Strenge Einschränkung: Verändere weder Tonfall noch Wortschatz, Satzbau oder Stilebene, solange der ursprüngliche Satz grammatikalisch korrekt ist. Optimiere nichts stilistisch um.',
        'Format: Gib ausschließlich den korrigierten Text zurück. Keine Kommentare, keine Einleitungen, keine Erklärungen, keine Anführungszeichen um den Gesamttext.',
        'Bewahre Absatzumbrüche und grundlegende Textstruktur des Originals.',
        ...(customBlock ? [customBlock] : []),
        ...(chunkNote ? [chunkNote] : []),
      ].join('\n'),
    };
  }

  const styleRule = STYLE_INSTRUCTIONS[style] || STYLE_INSTRUCTIONS.ausgewogen;
  return {
    temperature: 0.45,
    system: [
      'Du bist ein hochklassiger Schreib- und Stilassistent wie DeepL Write.',
      langRule,
      'Aufgabe: Korrigiere alle Rechtschreib-, Grammatik- und Zeichensetzungsfehler UND überarbeite den Text stilistisch entsprechend der gewünschten Tonalität, ohne die Kernaussage oder Fakten zu verfälschen.',
      `Gewünschter Stil: ${styleRule}`,
      'Format: Gib ausschließlich den fertigen, verfeinerten Text zurück. Keine Einleitungen, keine Erklärungen, keine Meta-Kommentare, keine umschließenden Anführungszeichen.',
      'Bewahre Absatzumbrüche und Liste/Struktur des Ausgangstextes sinngemäß.',
      ...(customBlock ? [customBlock] : []),
      ...(chunkNote ? [chunkNote] : []),
    ].join('\n'),
  };
}

export function buildVerificationPrompts(
  sourceLang: string,
  mode: 'correction' | 'style',
  style: string,
  preferences?: PromptPreferencesInput
): {
  system: string;
  temperature: number;
} {
  const langRule = LANGUAGE_INSTRUCTIONS[sourceLang] || LANGUAGE_INSTRUCTIONS.auto;
  const customBlock = buildGlossaryAndRulesPromptBlock(preferences);
  const styleRule =
    mode === 'correction'
      ? 'Reiner Korrekturmodus: Verändere nichts stilistisch, sondern korrigiere ausschließlich übersehene Fehler.'
      : `Stil & Korrektur (${style}): ${STYLE_INSTRUCTIONS[style] || STYLE_INSTRUCTIONS.ausgewogen}`;

  return {
    temperature: 0.1,
    system: [
      'Du führst eine gründliche Zweit- und Endkontrolle (Lektorat) eines bereits überarbeiteten Textes anhand des Originaltextes durch.',
      langRule,
      styleRule,
      'Prüfe den Entwurf akribisch auf noch vorhandene oder neu entstandene Rechtschreibfehler, Grammatik-/Kasus-/Kongruenzfehler, falsche oder fehlende Kommas bzw. Zeichensetzung sowie ungewollte inhaltliche Abweichungen oder ausgelassene Wörter gegenüber dem Original.',
      'Prüfe ebenso, ob geschützte Begriffe oder verbindliche Hausregeln verletzt wurden, und stelle sie strikt gemäß Original und Regeln wieder her.',
      'Wenn ein Satz bereits fehlerfrei ist und dem Zielmodus sowie allen Regeln entspricht, belasse ihn exakt so, wie er im Entwurf steht.',
      'Gib ausschließlich die finale, geprüfte Textfassung zurück – ohne Kommentare, Markierungen oder Erklärungen.',
      ...(customBlock ? [customBlock] : []),
    ].join('\n'),
  };
}

export function buildTranslationPrompts(
  sourceLang: string,
  targetLang: string,
  tone: string,
  previousContext?: string,
  preferences?: PromptPreferencesInput
): {
  system: string;
  temperature: number;
} {
  const sourceLabel =
    sourceLang === 'auto'
      ? 'automatisch erkannter Ausgangssprache'
      : TARGET_LANGUAGE_NAMES[sourceLang] || sourceLang;
  const targetLabel = TARGET_LANGUAGE_NAMES[targetLang] || targetLang;
  const toneRule = TRANSLATION_TONE_INSTRUCTIONS[tone] || TRANSLATION_TONE_INSTRUCTIONS.neutral;
  const customBlock = buildGlossaryAndRulesPromptBlock(preferences);
  const chunkNote = previousContext
    ? [
        'Hinweis zum Textabschnitt: Du übersetzt einen einzelnen Absatz/Abschnitt aus einem längeren Dokument.',
        'Gib ausschließlich die Übersetzung genau dieses Eingabeabschnitts zurück – wiederhole niemals den vorausgehenden Kontext.',
        `Vorheriger Kontext (nur zum Verständnis, nicht ausgeben):\n"""${previousContext.slice(-360)}"""`,
      ].join('\n')
    : null;

  return {
    temperature: 0.2,
    system: [
      'Du bist ein präziser, professioneller Fachübersetzer auf höchstem Niveau (wie DeepL Translate).',
      `Ausgangssprache: ${sourceLabel}.`,
      `Zielsprache: ${targetLabel}.`,
      toneRule,
      'Aufgabe: Übersetze den gesamten Eingabetext vollständig, sinngemäß exakt, idiomatisch und sprachlich einwandfrei in die Zielsprache.',
      'Bewahre Fakten, Zahlen, Namen, Absatzumbrüche und Formatierung exakt.',
      'Format: Gib ausschließlich die fertige Übersetzung zurück – keine Einleitungen, keine Erklärungen, keine Anführungszeichen um den Gesamttext.',
      ...(customBlock ? [customBlock] : []),
      ...(chunkNote ? [chunkNote] : []),
    ].join('\n'),
  };
}

export function buildTranslationVerificationPrompts(
  targetLang: string,
  tone: string,
  preferences?: PromptPreferencesInput
): {
  system: string;
  temperature: number;
} {
  const targetLabel = TARGET_LANGUAGE_NAMES[targetLang] || targetLang;
  const toneRule = TRANSLATION_TONE_INSTRUCTIONS[tone] || TRANSLATION_TONE_INSTRUCTIONS.neutral;
  const customBlock = buildGlossaryAndRulesPromptBlock(preferences);

  return {
    temperature: 0.1,
    system: [
      'Du führst eine gründliche Lektorats- und Qualitätskontrolle einer Übersetzung anhand des Originaltextes durch.',
      `Zielsprache: ${targetLabel}.`,
      toneRule,
      'Prüfe den Übersetzungsentwurf auf Bedeutungsfehler, Auslassungen, Hinzufügungen, unnatürliche Wörtlichkeit, Grammatik-, Rechtschreib- und Zeichensetzungsfehler.',
      'Prüfe ebenso, ob geschützte Begriffe aus dem Wörterbuch oder verbindliche Hausregeln eingehalten wurden.',
      'Gib ausschließlich die finale, geprüfte Übersetzung zurück – ohne Kommentare oder Erklärungen.',
      ...(customBlock ? [customBlock] : []),
    ].join('\n'),
  };
}
