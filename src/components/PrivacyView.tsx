import { useState } from 'react';
import {
  ArrowLeft,
  Check,
  Database,
  ExternalLink,
  Globe,
  HardDrive,
  KeyRound,
  Lock,
  Server,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { useUiLang } from '../lib/i18n';

interface PrivacyViewProps {
  onBackToEditor: () => void;
  onOpenSettings: () => void;
  onClearAllData: () => Promise<void>;
}

export function PrivacyView({
  onBackToEditor,
  onOpenSettings,
  onClearAllData,
}: PrivacyViewProps) {
  const { uiLang } = useUiLang();
  const isEn = uiLang === 'en';

  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [cleared, setCleared] = useState(false);

  async function handleConfirmClear() {
    setClearing(true);
    try {
      await onClearAllData();
      setConfirmClear(false);
      setCleared(true);
      setTimeout(() => setCleared(false), 2600);
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="max-w-[980px] mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>{isEn ? 'Transparency & Privacy' : 'Transparenz & Datenschutz'}</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-neutral-950 dark:text-white">
            {isEn ? 'Privacy & Data Flows' : 'Datenschutz & Datenflüsse'}
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 max-w-2xl">
            {isEn
              ? 'Overview of what happens with your texts, API keys, and browser storage — who receives which technical data and which safeguards you can toggle yourself.'
              : 'Überblick darüber, was mit deinen Texten, API-Schlüsseln und Browser-Daten passiert – welche Dienste welche technischen Daten erhalten und welche Schutzmaßnahmen du selbst aktivieren kannst.'}
          </p>
        </div>

        <button
          type="button"
          onClick={onBackToEditor}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border border-neutral-300 dark:border-neutral-800 bg-white dark:bg-[#0A0D14] text-neutral-800 dark:text-neutral-200 hover:border-neutral-950 dark:hover:border-white transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          {isEn ? 'Back to Editor' : 'Zurück zum Editor'}
        </button>
      </div>

      {/* 1. Website Operator */}
      <section className="rounded-lg border border-neutral-300/90 dark:border-neutral-800 bg-white dark:bg-[#0C1019] p-5 sm:p-6 space-y-3 shadow-2xs">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <h2 className="text-sm font-semibold text-neutral-950 dark:text-white">
            {isEn
              ? '1. Website Operator — No Self-Hosted Tracking'
              : '1. Betreiber dieser Website – Keine eigene Datenerhebung'}
          </h2>
        </div>
        {isEn ? (
          <div className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300 space-y-2.5">
            <p>
              As the operator of <strong>üxz</strong>, I do not collect, store, or analyze any personal data,
              entered texts, API keys, or usage statistics on my own servers. There are no analytics tools,
              tracking pixels, ad networks, or user accounts.
            </p>
            <p className="text-xs text-neutral-600 dark:text-neutral-400">
              In full-stack Node server mode (when self-hosted via Express), user-entered OpenRouter API keys are
              only kept encrypted inside an <span className="font-mono">HttpOnly</span> cookie (AES-256-GCM) and
              are never logged or stored in a database.
            </p>
          </div>
        ) : (
          <div className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300 space-y-2.5">
            <p>
              Als Betreiber von <strong>üxz</strong> erhebe, speichere oder werte ich selbst keine personenbezogenen
              Daten, keine eingegebenen Texte, keine API-Schlüssel und keine Nutzungsstatistiken aus. Es gibt weder
              Analytics-Skripte noch Werbenetzwerke, Tracking-Pixel oder Benutzerkonten.
            </p>
            <p className="text-xs text-neutral-600 dark:text-neutral-400">
              Wird die Anwendung im Node-Server-Modus selbst betrieben, verbleiben manuell hinterlegte
              OpenRouter-API-Keys lediglich AES-256-GCM-verschlüsselt in einem{' '}
              <span className="font-mono">HttpOnly</span>-Cookie und werden nicht protokolliert oder in einer
              Datenbank abgelegt.
            </p>
          </div>
        )}
      </section>

      {/* 2. Local Browser Storage */}
      <section className="rounded-lg border border-neutral-300/90 dark:border-neutral-800 bg-white dark:bg-[#0C1019] p-5 sm:p-6 space-y-4 shadow-2xs">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <HardDrive className="w-4 h-4 text-neutral-700 dark:text-neutral-300 shrink-0" />
            <h2 className="text-sm font-semibold text-neutral-950 dark:text-white">
              {isEn
                ? '2. Local Storage in Your Browser'
                : '2. Lokale Speicherung in deinem Browser'}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            {cleared && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                <Check className="w-3.5 h-3.5" />
                {isEn ? 'Local data cleared' : 'Lokale Daten gelöscht'}
              </span>
            )}
            {!confirmClear ? (
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-rose-300 dark:border-rose-900/70 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {isEn ? 'Clear all local browser data' : 'Alle lokalen Browser-Daten löschen'}
              </button>
            ) : (
              <div className="inline-flex items-center gap-2">
                <button
                  type="button"
                  disabled={clearing}
                  onClick={handleConfirmClear}
                  className="px-3 py-1.5 text-xs font-semibold rounded-md bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50 cursor-pointer"
                >
                  {clearing
                    ? isEn
                      ? 'Clearing…'
                      : 'Löscht…'
                    : isEn
                      ? 'Confirm deletion'
                      : 'Löschen bestätigen'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="px-2.5 py-1.5 text-xs font-medium rounded-md border border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 cursor-pointer"
                >
                  {isEn ? 'Cancel' : 'Abbrechen'}
                </button>
              </div>
            )}
          </div>
        </div>

        <p className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
          {isEn
            ? 'In static web mode (e.g. GitHub Pages or Cloudflare Pages), your configuration and saved entries are stored exclusively in your own browser storage (localStorage / sessionStorage) and never leave your device unless you trigger an API request:'
            : 'Im statischen Web-Betrieb (z. B. über GitHub Pages oder Cloudflare Pages) werden deine Konfiguration und manuell gesicherten Einträge ausschließlich lokal im Speicher deines Browsers (localStorage / sessionStorage) abgelegt:'}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
          {[
            {
              key: 'uxz_openrouter_key',
              desc: isEn
                ? 'Your personal OpenRouter API key (optional, stored only if entered).'
                : 'Dein persönlicher OpenRouter-API-Key (optional, nur bei Eingabe).',
            },
            {
              key: 'uxz_model / uxz_secondary_model / uxz_dual_review / uxz_enforce_zdr',
              desc: isEn
                ? 'Selected primary & review models, Two-Person Review toggle, and Zero Data Retention setting.'
                : 'Gewählte Primär- und Prüfmodelle, Zwei-Augen-Prinzip sowie ZDR-Schalter.',
            },
            {
              key: 'uxz_writing_preferences',
              desc: isEn
                ? 'Your protected glossary terms, custom writing rules, and workspace / RPM options.'
                : 'Deine geschützten Begriffe, Schreibregeln sowie Optionen & Rate-Limit-Werte.',
            },
            {
              key: 'uxz_history',
              desc: isEn
                ? 'Manually saved editor & translation entries (up to 60 entries, only when you click Save).'
                : 'Manuell über „Sichern“ gespeicherte Verlaufeinträge (max. 60 Einträge).',
            },
            {
              key: 'uxz_dark_mode / uxz_ui_lang',
              desc: isEn
                ? 'Light/Dark theme preference and selected interface language (de / en).'
                : 'Gewähltes Design (Hell/Dunkel) und Oberflächensprache (Deutsch/Englisch).',
            },
            {
              key: 'uxz_paid_unlocked',
              desc: isEn
                ? 'Temporary session unlock state if paid-model password protection is configured.'
                : 'Temporärer Entsperrstatus für kostenpflichtige Modelle (bei aktiviertem Passwortschutz).',
            },
          ].map((item) => (
            <div
              key={item.key}
              className="p-3 rounded-md border border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-[#080B10] space-y-1"
            >
              <div className="font-mono text-[11px] font-semibold text-neutral-900 dark:text-neutral-100 break-all">
                {item.key}
              </div>
              <p className="text-neutral-600 dark:text-neutral-400 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>

        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          {isEn
            ? 'Active draft text typed into the Editor or Translate workspace is kept strictly in memory (RAM) and is never written automatically to localStorage.'
            : 'Laufende Entwürfe im Editor oder Übersetzer werden grundsätzlich nicht automatisch im localStorage gespeichert, sondern nur im Arbeitsspeicher gehalten.'}
        </p>
      </section>

      {/* 3. Hosting Provider */}
      <section className="rounded-lg border border-neutral-300/90 dark:border-neutral-800 bg-white dark:bg-[#0C1019] p-5 sm:p-6 space-y-3 shadow-2xs">
        <div className="flex items-center gap-2.5">
          <Server className="w-4 h-4 text-neutral-700 dark:text-neutral-300 shrink-0" />
          <h2 className="text-sm font-semibold text-neutral-950 dark:text-white">
            {isEn
              ? '3. Hosting & Static Delivery (GitHub Pages / Cloudflare Pages)'
              : '3. Hosting & Auslieferung (GitHub Pages / Cloudflare Pages)'}
          </h2>
        </div>
        {isEn ? (
          <div className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300 space-y-2">
            <p>
              When you open a statically hosted instance (for example via <strong>GitHub Pages</strong> or{' '}
              <strong>Cloudflare Pages</strong>), your browser fetches HTML, CSS, JavaScript, and icon assets directly
              from that hosting provider&apos;s CDN servers.
            </p>
            <ul className="list-disc pl-5 space-y-1 text-xs text-neutral-600 dark:text-neutral-400">
              <li>
                <strong>Technical Server Logs:</strong> Hosting providers automatically record standard HTTP connection
                metadata such as your IP address, date and time of request, requested file path, HTTP status code,
                referrer URL, and browser user agent for DDoS protection, abuse prevention, and operational stability.
              </li>
              <li>
                <strong>No Access by App Operator:</strong> The operator of this site cannot see raw visitor IP logs from
                GitHub Pages. Further details can be found in the{' '}
                <a
                  href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-4 text-neutral-900 dark:text-neutral-100"
                >
                  GitHub Privacy Statement
                </a>
                .
              </li>
            </ul>
          </div>
        ) : (
          <div className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300 space-y-2">
            <p>
              Beim Aufruf einer statisch bereitgestellten Instanz (z. B. über <strong>GitHub Pages</strong> oder{' '}
              <strong>Cloudflare Pages</strong>) lädt dein Browser die statischen Dateien (HTML, CSS, JavaScript,
              Grafiken) direkt von den CDN-Servern des jeweiligen Hosting-Anbieters.
            </p>
            <ul className="list-disc pl-5 space-y-1 text-xs text-neutral-600 dark:text-neutral-400">
              <li>
                <strong>Technische Zugriffslogs:</strong> Der Hosting-Dienst erfasst technisch bedingt Verbindungsdaten
                wie deine IP-Adresse, Zeitstempel, abgerufene URL, HTTP-Statuscode, Referrer und Browser-User-Agent zur
                Missbrauchs- und DDoS-Abwehr sowie zur Auslieferung der Seite.
              </li>
              <li>
                <strong>Kein Zugriff durch den Betreiber:</strong> Auf detaillierte Besucher-IP-Logs von GitHub Pages hat
                der Betreiber dieser App keinen Zugriff. Weitere Informationen findest du in der{' '}
                <a
                  href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-4 text-neutral-900 dark:text-neutral-100"
                >
                  GitHub Privacy Statement
                </a>
                .
              </li>
            </ul>
          </div>
        )}
      </section>

      {/* 4. OpenRouter */}
      <section className="rounded-lg border border-neutral-300/90 dark:border-neutral-800 bg-white dark:bg-[#0C1019] p-5 sm:p-6 space-y-3 shadow-2xs">
        <div className="flex items-center gap-2.5">
          <Globe className="w-4 h-4 text-neutral-700 dark:text-neutral-300 shrink-0" />
          <h2 className="text-sm font-semibold text-neutral-950 dark:text-white">
            {isEn
              ? '4. API Gateway: OpenRouter (openrouter.ai)'
              : '4. API-Router: OpenRouter (openrouter.ai)'}
          </h2>
        </div>
        {isEn ? (
          <div className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300 space-y-2">
            <p>
              Whenever you refine, verify, analyze, or translate text (or load available models), your browser — or the
              Node backend — connects to <span className="font-mono text-xs">https://openrouter.ai/api/v1</span> using
              your configured OpenRouter API key.
            </p>
            <ul className="list-disc pl-5 space-y-1 text-xs text-neutral-600 dark:text-neutral-400">
              <li>
                <strong>Transmitted Content:</strong> Your submitted text, selected language/style/tone, active glossary
                terms and custom rules, plus your API key (in the{' '}
                <span className="font-mono">Authorization</span> header).
              </li>
              <li>
                <strong>Metadata &amp; Billing Logs:</strong> OpenRouter logs request metadata (timestamps, selected model,
                token counts, costs, latency) to handle billing and rate limits for your account.
              </li>
              <li>
                <strong>Prompt Logging &amp; Privacy Settings:</strong> By default, OpenRouter states that it does not
                store prompt/completion bodies unless you explicitly enable prompt logging in your OpenRouter account
                settings. See the{' '}
                <a
                  href="https://openrouter.ai/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-4 text-neutral-900 dark:text-neutral-100"
                >
                  OpenRouter Privacy Policy
                </a>
                .
              </li>
            </ul>
          </div>
        ) : (
          <div className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300 space-y-2">
            <p>
              Sobald du Text verfeinerst, nachprüfst, übersetzt oder die Modellliste abrufst, verbindet sich dein Browser
              (bzw. im Server-Modus das Backend) mit <span className="font-mono text-xs">https://openrouter.ai/api/v1</span>.
            </p>
            <ul className="list-disc pl-5 space-y-1 text-xs text-neutral-600 dark:text-neutral-400">
              <li>
                <strong>Übertragene Inhalte:</strong> Dein eingegebener Text, die gewählte Sprache/Stil/Ton-Einstellung,
                deine aktiven Wörterbuch-Begriffe und Schreibregeln sowie dein API-Schlüssel im{' '}
                <span className="font-mono">Authorization</span>-Header.
              </li>
              <li>
                <strong>Metadaten &amp; Abrechnung:</strong> OpenRouter protokolliert technische Metadaten wie
                Zeitstempel, Modell-ID, Token-Verbrauch, Kosten und Latenz zur Abrechnung und Rate-Limit-Steuerung in
                deinem Konto.
              </li>
              <li>
                <strong>Prompt-Speicherung:</strong> Laut OpenRouter werden Prompt- und Antwortinhalte standardmäßig nicht
                dauerhaft gespeichert, sofern Prompt-Logging im OpenRouter-Konto nicht aktiv eingeschaltet wurde. Details
                regelt die{' '}
                <a
                  href="https://openrouter.ai/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-4 text-neutral-900 dark:text-neutral-100"
                >
                  OpenRouter Privacy Policy
                </a>
                .
              </li>
            </ul>
          </div>
        )}
      </section>

      {/* 5. Downstream AI Providers & :free models */}
      <section className="rounded-lg border border-neutral-300/90 dark:border-neutral-800 bg-white dark:bg-[#0C1019] p-5 sm:p-6 space-y-3 shadow-2xs">
        <div className="flex items-center gap-2.5">
          <Database className="w-4 h-4 text-neutral-700 dark:text-neutral-300 shrink-0" />
          <h2 className="text-sm font-semibold text-neutral-950 dark:text-white">
            {isEn
              ? '5. Downstream AI Model Providers & Free (:free) Models'
              : '5. Nachgelagerte KI-Modellanbieter & Gratis-Modelle (:free)'}
          </h2>
        </div>
        {isEn ? (
          <div className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300 space-y-2">
            <p>
              OpenRouter forwards your prompt to the upstream provider hosting the selected model (e.g. Google,
              Anthropic, OpenAI, Mistral, Meta/Llama hosters, Qwen, DeepSeek, or third-party inference clouds). Each
              provider operates under its own retention and training policies.
            </p>
            <p className="text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 rounded-md p-3">
              <strong>Important note on free models (<span className="font-mono">:free</span> / <span className="font-mono">openrouter/free</span>):</strong>{' '}
              Many free inference endpoints reserve the right to log prompts or use inputs for model improvement and
              evaluation. Do not send confidential, personal, or NDA-protected texts to unverified free endpoints.
            </p>
          </div>
        ) : (
          <div className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300 space-y-2">
            <p>
              OpenRouter leitet deine Anfrage an den jeweiligen Infrastruktur-Anbieter des gewählten Modells weiter
              (z. B. Google, Anthropic, OpenAI, Mistral oder spezialisierte Hosting-Partner). Für die Verarbeitung durch
              den Endanbieter gelten dessen eigene Datenschutz- und Aufbewahrungsrichtlinien.
            </p>
            <p className="text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 rounded-md p-3">
              <strong>Hinweis zu Gratis-Modellen (<span className="font-mono">:free</span> / <span className="font-mono">openrouter/free</span>):</strong>{' '}
              Viele kostenlose Endpunkte behalten sich in ihren Nutzungsbedingungen vor, übermittelte Prompts zur
              Qualitätssicherung oder für Modelltraining heranzuziehen. Vertrauliche, personenbezogene oder geschützte
              Texte solltest du daher nicht über unbeschränkte Gratis-Endpunkte verarbeiten.
            </p>
          </div>
        )}
      </section>

      {/* 6. Practical Recommendations + Quick Actions */}
      <section className="rounded-lg border border-neutral-300/90 dark:border-neutral-800 bg-white dark:bg-[#0C1019] p-5 sm:p-6 space-y-4 shadow-2xs">
        <div className="flex items-center gap-2.5">
          <Lock className="w-4 h-4 text-neutral-700 dark:text-neutral-300 shrink-0" />
          <h2 className="text-sm font-semibold text-neutral-950 dark:text-white">
            {isEn ? '6. Recommendations for Sensitive Texts' : '6. Empfehlungen für sensible Texte'}
          </h2>
        </div>

        <ul className="list-disc pl-5 space-y-1.5 text-sm text-neutral-700 dark:text-neutral-300">
          {isEn ? (
            <>
              <li>
                Enable <strong>Zero Data Retention (ZDR)</strong> in the OpenRouter drawer so OpenRouter only routes
                requests to endpoints that contractually do not retain prompts or completions.
              </li>
              <li>
                Verify your account-level privacy switches in your{' '}
                <a
                  href="https://openrouter.ai/settings/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-4 text-neutral-950 dark:text-white"
                >
                  OpenRouter Privacy Settings
                </a>
                .
              </li>
              <li>
                On shared or public computers, clear your API key and local browser storage after finishing your work.
              </li>
            </>
          ) : (
            <>
              <li>
                Aktiviere im OpenRouter-Menü <strong>Zero Data Retention (ZDR)</strong>, damit Anfragen nur an
                Anbieter-Endpunkte geroutet werden, die Prompts und Antworten vertraglich nicht speichern.
              </li>
              <li>
                Prüfe die globalen Datenschutzeinstellungen direkt in deinem Konto unter{' '}
                <a
                  href="https://openrouter.ai/settings/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-4 text-neutral-950 dark:text-white"
                >
                  OpenRouter Privacy Settings
                </a>
                .
              </li>
              <li>
                Lösche auf gemeinsam genutzten Rechnern nach Abschluss deiner Arbeit deinen API-Key und den lokalen
                Browser-Speicher.
              </li>
            </>
          )}
        </ul>

        <div className="pt-2 flex flex-wrap items-center gap-3 border-t border-neutral-200 dark:border-neutral-800">
          <button
            type="button"
            onClick={onOpenSettings}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md bg-neutral-950 dark:bg-white text-white dark:text-neutral-950 hover:opacity-90 transition-opacity cursor-pointer"
          >
            <KeyRound className="w-3.5 h-3.5" />
            {isEn ? 'Open OpenRouter & ZDR Settings' : 'OpenRouter & ZDR-Einstellungen öffnen'}
          </button>

          <a
            href="https://michaelfoertsch.de/impressum.html"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:text-neutral-950 dark:hover:text-white hover:border-neutral-900 dark:hover:border-neutral-100 transition-colors"
          >
            <span>{isEn ? 'Legal Notice / Imprint' : 'Zum Impressum'}</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </section>
    </div>
  );
}
