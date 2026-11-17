import { ArrowLeft, Database, ExternalLink, Globe, HardDrive, KeyRound, Server, ShieldCheck } from 'lucide-react';

interface PrivacyViewProps {
  onBackToEditor: () => void;
  onOpenSettings: () => void;
}

export function PrivacyView({ onBackToEditor, onOpenSettings }: PrivacyViewProps) {
  return (
    <div className="max-w-[1040px] mx-auto px-4 sm:px-6 py-7 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-neutral-200 dark:border-neutral-800 pb-5">
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={onBackToEditor}
            className="inline-flex items-center gap-1.5 text-xs font-mono text-neutral-500 hover:text-neutral-950 dark:text-neutral-400 dark:hover:text-white transition-colors cursor-pointer mb-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Zurück zum Editor
          </button>
          <h1 className="font-display text-2xl sm:text-[26px] font-semibold tracking-tight text-neutral-950 dark:text-white">
            Datenschutz &amp; Datenflüsse
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 max-w-2xl leading-relaxed">
            Transparente Übersicht darüber, welche Daten lokal in deinem Browser bleiben und welche Daten durch Hosting (GitHub Pages) sowie KI-Routing (OpenRouter &amp; Modellanbieter) technisch erfasst werden.
          </p>
        </div>

        <a
          href="https://michaelfoertsch.de/impressum.html"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border border-neutral-300 dark:border-neutral-800 bg-white dark:bg-[#0A0D14] text-neutral-800 dark:text-neutral-200 hover:border-neutral-950 dark:hover:border-white transition-colors whitespace-nowrap shrink-0"
        >
          <span>Impressum öffnen</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      {/* 1. Betreiber & Lokale Speicherung */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <article className="p-5 rounded-lg border border-neutral-300/90 dark:border-neutral-800 bg-white dark:bg-[#0C1019] space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-md bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-neutral-900 dark:text-neutral-100">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-neutral-950 dark:text-white">
                1. Website-Betreiber
              </h2>
              <p className="text-[11px] font-mono text-neutral-500 dark:text-neutral-400">
                Kein Tracking · Keine eigene Datenbank
              </p>
            </div>
          </div>

          <ul className="space-y-2 text-xs leading-relaxed text-neutral-700 dark:text-neutral-300 list-disc pl-4">
            <li>
              Der Betreiber dieser Seite erhebt, analysiert und speichert selbst <strong>keinerlei personenbezogene Daten, Nutzungsstatistiken oder Texte</strong>.
            </li>
            <li>
              Es kommen <strong>keine Tracking-Tools</strong> (wie Google Analytics oder Matomo), keine Werbe-Pixel und keine Marketing-Cookies zum Einsatz.
            </li>
            <li>
              Im statischen Betrieb („Bring Your Own Key“) existiert kein eigener Anwendungsserver zwischen deinem Browser und OpenRouter: Anfragen gehen direkt von deinem Endgerät an die OpenRouter-API.
            </li>
          </ul>
        </article>

        <article className="p-5 rounded-lg border border-neutral-300/90 dark:border-neutral-800 bg-white dark:bg-[#0C1019] space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-md bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-neutral-900 dark:text-neutral-100">
              <HardDrive className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-neutral-950 dark:text-white">
                2. Lokale Speicherung im Browser
              </h2>
              <p className="text-[11px] font-mono text-neutral-500 dark:text-neutral-400">
                localStorage &amp; sessionStorage
              </p>
            </div>
          </div>

          <p className="text-xs leading-relaxed text-neutral-700 dark:text-neutral-300">
            Damit API-Key und Einstellungen nach dem Neuladen erhalten bleiben, speichert diese Web-App folgende Einträge ausschließlich lokal auf deinem Gerät:
          </p>

          <ul className="space-y-1.5 text-xs leading-relaxed text-neutral-700 dark:text-neutral-300 font-mono bg-neutral-50 dark:bg-[#080B10] p-3 rounded-md border border-neutral-200 dark:border-neutral-800">
            <li>• openrouter_api_key <span className="font-sans text-neutral-500 dark:text-neutral-400">(dein API-Schlüssel)</span></li>
            <li>• openrouter_model / _secondary_model / _dual_review</li>
            <li>• uxz_writing_preferences <span className="font-sans text-neutral-500 dark:text-neutral-400">(Wörterbuch &amp; Regeln)</span></li>
            <li>• uxz_rewrite_history <span className="font-sans text-neutral-500 dark:text-neutral-400">(nur manuell über „Sichern“)</span></li>
          </ul>

          <p className="text-[11.5px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
            Aktuell im Editor eingetippte Entwürfe werden nicht dauerhaft lokal abgelegt. Du kannst deinen Key jederzeit im{' '}
            <button
              type="button"
              onClick={onOpenSettings}
              className="underline underline-offset-2 text-neutral-800 dark:text-neutral-200 hover:text-neutral-950 dark:hover:text-white cursor-pointer"
            >
              API-Dialog
            </button>{' '}
            oder über die Browser-Daten löschen.
          </p>
        </article>
      </section>

      {/* 3. GitHub Pages Hosting */}
      <section className="p-5 rounded-lg border border-neutral-300/90 dark:border-neutral-800 bg-white dark:bg-[#0C1019] space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-md bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-neutral-900 dark:text-neutral-100">
              <Server className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-neutral-950 dark:text-white">
                3. Hosting über GitHub Pages (GitHub, Inc.)
              </h2>
              <p className="text-[11px] font-mono text-neutral-500 dark:text-neutral-400">
                Auslieferung der statischen Website (HTML / JS / CSS)
              </p>
            </div>
          </div>
          <a
            href="https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages#data-collection"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11.5px] font-mono text-neutral-600 dark:text-neutral-400 hover:text-neutral-950 dark:hover:text-white underline underline-offset-4"
          >
            GitHub Pages Docs <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs leading-relaxed text-neutral-700 dark:text-neutral-300">
          <div className="space-y-1.5">
            <h3 className="font-semibold text-neutral-900 dark:text-neutral-100">
              Was GitHub Pages tatsächlich erfasst
            </h3>
            <ul className="space-y-1.5 list-disc pl-4">
              <li>
                <strong>Besucher-IP-Adresse:</strong> Laut offizieller GitHub-Pages-Dokumentation wird die IP-Adresse jedes Besuchers beim Seitenaufruf protokolliert und aus Sicherheitsgründen gespeichert – unabhängig davon, ob ein GitHub-Konto genutzt wird.
              </li>
              <li>
                <strong>Technische Zugriffs-/Verbindungsdaten:</strong> Im Rahmen des allgemeinen <em>GitHub Privacy Statement</em> fallen zusätzlich Zeitstempel, angeforderte Pfade/Dateien, HTTP-Referrer sowie Browser- und Geräteinformationen (User-Agent) an.
              </li>
            </ul>
          </div>
          <div className="space-y-1.5">
            <h3 className="font-semibold text-neutral-900 dark:text-neutral-100">
              Zweck &amp; Zugriff
            </h3>
            <ul className="space-y-1.5 list-disc pl-4">
              <li>
                Aufrechterhaltung der Infrastruktur-Sicherheit, Abwehr von DDoS-Angriffen und Missbrauch sowie Einhaltung gesetzlicher Pflichten durch GitHub, Inc. (USA / Microsoft).
              </li>
              <li>
                Der Betreiber dieser Website hat selbst <strong>keinen Zugriff</strong> auf diese Server-Logdaten von GitHub Pages.
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* 4. OpenRouter */}
      <section className="p-5 rounded-lg border border-neutral-300/90 dark:border-neutral-800 bg-white dark:bg-[#0C1019] space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-md bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-neutral-900 dark:text-neutral-100">
              <KeyRound className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-neutral-950 dark:text-white">
                4. OpenRouter (OpenRouter, Inc.) als API-Router
              </h2>
              <p className="text-[11px] font-mono text-neutral-500 dark:text-neutral-400">
                Verarbeitung über deinen eigenen API-Schlüssel
              </p>
            </div>
          </div>
          <a
            href="https://openrouter.ai/docs/features/privacy-and-logging"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11.5px] font-mono text-neutral-600 dark:text-neutral-400 hover:text-neutral-950 dark:hover:text-white underline underline-offset-4"
          >
            OpenRouter Privacy Docs <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs leading-relaxed text-neutral-700 dark:text-neutral-300">
          <div className="space-y-1.5">
            <h3 className="font-semibold text-neutral-900 dark:text-neutral-100">
              Was OpenRouter standardmäßig sammelt (Metadaten)
            </h3>
            <ul className="space-y-1.5 list-disc pl-4">
              <li>
                <strong>Anfrage-Metadaten (immer):</strong> Auch wenn Prompt-Logging deaktiviert ist, protokolliert OpenRouter zu jeder API-Anfrage automatisch Token-Anzahlen (Input/Output), Antwortzeit (Latenz), gewähltes Modell, gewählten Provider, Kosten, Zeitstempel sowie die Zuordnung zu deinem API-Key.
              </li>
              <li>
                <strong>HTTP-Metadaten dieser App:</strong> Dein Browser übermittelt technisch bedingt deine IP-Adresse sowie die Header <span className="font-mono">HTTP-Referer</span> (Website-URL) und <span className="font-mono">X-Title</span> (<span className="font-mono">ÜxzWrite &amp; Translate</span>).
              </li>
            </ul>
          </div>
          <div className="space-y-1.5">
            <h3 className="font-semibold text-neutral-900 dark:text-neutral-100">
              Was OpenRouter mit Textinhalten (Prompts &amp; Antworten) tut
            </h3>
            <ul className="space-y-1.5 list-disc pl-4">
              <li>
                <strong>Standardmäßig kein Prompt-Logging:</strong> Laut OpenRouter speichert der Dienst selbst standardmäßig <em>keine</em> Textinhalte von Eingaben oder Ausgaben – außer du aktivierst in deinem OpenRouter-Konto optional <em>Input/Output Logging</em> (dann mindestens 3 Monate Speicherung) oder <em>Product Improvement Opt-In</em>.
              </li>
              <li>
                <strong>Sicherheits- &amp; Stichproben-Ausnahmen:</strong> OpenRouter scannt Anfragen automatisiert im Transit auf schwerwiegende Verstöße (u. a. CSAM-Erkennung; Verdachtsfälle können gespeichert und gemeldet werden) und kategorisiert kleine anonyme Stichproben ohne Konto-Zuordnung über ein Zero-Data-Retention-Modell.
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* 5. Upstream-Modellanbieter & Free-Modelle */}
      <section className="p-5 rounded-lg border border-neutral-300/90 dark:border-neutral-800 bg-white dark:bg-[#0C1019] space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-md bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-neutral-900 dark:text-neutral-100">
              <Globe className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-neutral-950 dark:text-white">
                5. Nachgelagerte KI-Modellanbieter &amp; kostenlose Modelle (<span className="font-mono">:free</span>)
              </h2>
              <p className="text-[11px] font-mono text-neutral-500 dark:text-neutral-400">
                Upstream-Inferenz (OpenAI, Google, Anthropic, DeepSeek, Meta-Hoster u. a.)
              </p>
            </div>
          </div>
          <a
            href="https://openrouter.ai/settings/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11.5px] font-mono text-neutral-600 dark:text-neutral-400 hover:text-neutral-950 dark:hover:text-white underline underline-offset-4"
          >
            OpenRouter Privacy-Settings <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        <div className="space-y-3 text-xs leading-relaxed text-neutral-700 dark:text-neutral-300">
          <p>
            OpenRouter leitet deine Texte inklusive aktiver Wörterbuch- und Stilregeln zur Verarbeitung an den jeweiligen Inferenz-Anbieter des gewählten Modells weiter. Wie dieser Anbieter mit deinen Texten umgeht, hängt vom jeweiligen Endpunkt und deinen Kontoeinstellungen ab:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-md bg-neutral-50 dark:bg-[#080B10] border border-neutral-200 dark:border-neutral-800 space-y-1">
              <div className="font-semibold text-neutral-950 dark:text-white">Kostenlose Modelle (:free)</div>
              <p className="text-neutral-600 dark:text-neutral-400">
                Viele kostenlose Endpoints (z. B. über <span className="font-mono">openrouter/free</span> oder <span className="font-mono">*:free</span>) erlauben dem Modellanbieter ausdrücklich, Prompts und Antworten zu protokollieren und zum <strong>Training</strong> zu verwenden.
              </p>
            </div>
            <div className="p-3.5 rounded-md bg-neutral-50 dark:bg-[#080B10] border border-neutral-200 dark:border-neutral-800 space-y-1">
              <div className="font-semibold text-neutral-950 dark:text-white">Safety Retention</div>
              <p className="text-neutral-600 dark:text-neutral-400">
                Einige Anbieter speichern Anfragen vorübergehend ausschließlich zur Missbrauchs- und Sicherheitserkennung, schließen sie aber vom Modelltraining aus.
              </p>
            </div>
            <div className="p-3.5 rounded-md bg-neutral-50 dark:bg-[#080B10] border border-neutral-200 dark:border-neutral-800 space-y-1">
              <div className="font-semibold text-neutral-950 dark:text-white">Zero Data Retention (ZDR)</div>
              <p className="text-neutral-600 dark:text-neutral-400">
                ZDR-Anbieter löschen Prompts direkt nach der Antwortgenerierung. ZDR wird von dieser App nicht automatisch erzwungen, sondern über deine <strong>OpenRouter-Konto-Filter</strong> gesteuert.
              </p>
            </div>
          </div>
          <p className="text-[11.5px] text-neutral-500 dark:text-neutral-400">
            Nutzt du einen API-Key eines anderen Anbieters, gelten ausschließlich dessen Datenschutz- und Aufbewahrungsbedingungen (häufig mit Datenverarbeitung außerhalb des EWR, z. B. in den USA).
          </p>
        </div>
      </section>

      {/* 6. Praxistipps */}
      <section className="p-5 rounded-lg border border-neutral-300 dark:border-neutral-800 bg-neutral-50 dark:bg-[#080B10] space-y-2.5">
        <div className="flex items-center gap-2 text-xs font-semibold text-neutral-950 dark:text-white">
          <Database className="w-4 h-4" />
          <span>Empfehlung für sensible Texte</span>
        </div>
        <ul className="space-y-1.5 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400 list-disc pl-4">
          <li>
            Gib bei kostenlosen <span className="font-mono">:free</span>-Modellen keine vertraulichen Geschäftsgeheimnisse, Passwörter oder sensiblen personenbezogenen Daten ein.
          </li>
          <li>
            Prüfe in deinen{' '}
            <a
              href="https://openrouter.ai/settings/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-neutral-800 dark:text-neutral-200"
            >
              OpenRouter Privacy-Settings
            </a>
            , ob Data-Training-Anbieter blockiert und Zero Data Retention (ZDR) aktiviert sind.
          </li>
          <li>
            Entferne auf gemeinsam genutzten Geräten deinen hinterlegten API-Key vor dem Verlassen im API-Dialog.
          </li>
        </ul>
      </section>
    </div>
  );
}
