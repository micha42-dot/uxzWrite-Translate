# üxz | Write & Translate

I was recently asked by a friend whether something like DeepL Write or LanguageTool could be built as a free open-source web service — one she could host on her own website for herself and a few friends. Both of those tools are great, she said, but they come with paywalls, limitations, and occasional bugs. ChatGPT, Claude & Co. are fantastic for proofreading and translation, of course, yet a chat window simply isn't the clearest workspace for side-by-side editing.

So I just gave it a try … and the answer is **üxz Write & Translate**.

Of course, it isn't turnkey out of the box — you still need an API key from [OpenRouter](https://openrouter.ai/) or another supported AI provider (or connect a local Ollama / LM Studio server). A free OpenRouter, Groq, Cerebras, Google Gemini, Mistral, or Hugging Face key is completely sufficient, though, and many free models already deliver more than solid results for translations and proofreading.

---

## Features

### Side-by-Side Write Workspace
- **Correction-Only vs. Style & Correction**: Fix only spelling, grammar, and punctuation, or rewrite your draft across 8 writing styles (*Balanced*, *Casual*, *Journalistic*, *Eloquent*, *Ornate*, *Business*, *Academic*, and *Concise*).
- **Word-Level Inline Diff & Clean Text**: Switch seamlessly between color-coded inline diffs, a distraction-free clean text view, and a categorized **Before / After** changelog (*Spelling*, *Grammar*, *Punctuation*, *Style*, *Clarity*) with one-click individual revert.
- **Clickable Sentence Alternatives**: Click any sentence in Clean Text view to generate and swap in alternative phrasings on the fly.
- **Two-Person Review (*Zwei-Augen-Prinzip*)**: Optionally pass every refined text through a second model (or run a manual **Verify** pass) to catch anything the first pass missed.
- **Instant Mode & Paragraph Chunking**: Stream refinements automatically as you type or paste (configurable debounce delays), or switch to manual trigger (`Cmd/Ctrl + Enter`). Long texts can be split automatically along paragraphs and processed in parallel chunks.

### Dedicated Translate Mode
- **16 Languages Including Klingon (`tlh`)**: Auto-detect source language and translate into German, English (US/UK), French, Spanish, Italian, Dutch, Portuguese, Polish, Swedish, Turkish, Ukrainian, Japanese, Chinese, Korean — and Klingon (*tlhIngan Hol*).
- **Tone Control & Sentence Alternatives**: Choose *Neutral / Natural*, *Formal*, or *Informal*, and click sentences in the translation output for alternative renderings.

### Multi-Provider APIs & OpenRouter Alternatives
Switch providers anytime in the API drawer or the **Models** browser — per-provider keys, base URLs, and selected models are remembered independently:
- **Multi-Model Routers**: OpenRouter (incl. `openrouter/free` & Zero Data Retention routing), **Requesty** (Global + EU GDPR endpoint `router.eu.requesty.ai`), **Hugging Face Inference Router**, **Together AI**, **Groq**, and **Cerebras**.
- **Direct First-Party APIs**: **Anthropic (Claude)**, **OpenAI**, **Mistral AI (EU / Paris)**, **DeepSeek**, **Google Gemini**, and **xAI (Grok)**.
- **Local / Custom OpenAI-Compatible Endpoints**: Connect local **Ollama**, **LM Studio**, **vLLM**, or **LiteLLM** servers (API key optional).

### Glossary, Writing Rules & Controls
- **Protected Terms & Custom Rules**: Define brand names, technical terms (optionally case-sensitive), and formatting or style instructions that every rewrite and translation respects — with JSON import/export.
- **Built-in Rate-Limit & RPM Protection**: Customizable defaults for typing/paste debounce, chunk size, parallel workers, minimum request spacing, and automatic HTTP `429` retry backoff — tuned inside **Options** (`Optionen`) with full explanations.
- **Model Browser & Paid-Model Lock**: Browse models per provider, filter by free/paid tier, inspect context window and pricing, enforce **Zero Data Retention (ZDR)** on OpenRouter, and optionally lock paid models behind a password.
- **Bilingual UI (German / English) & Light/Dark Theme**: Toggle between **Deutsch** and **English** right at the top of the **Options** gear menu, plus a crisp light/dark pixel-geometric interface and local revision history with one-click restore or `.txt` / `.md` export.

---

## Quick Start (Local Development)

### Prerequisites
- Node.js 20+
- An API key for [OpenRouter](https://openrouter.ai/keys), another supported provider (e.g. Groq, Mistral, Anthropic, OpenAI, Requesty, Google Gemini), or a local Ollama / LM Studio instance

### Installation

```bash
npm install
npm run dev
```

The development server (Express API + Vite frontend) runs at `http://localhost:3000`.

### Environment Variables

See `.env.example` for all optional configuration values (Node server mode supports optional default keys for all supported providers via env vars such as `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `MISTRAL_API_KEY`, `DEEPSEEK_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `CEREBRAS_API_KEY`, `TOGETHER_API_KEY`, `HF_TOKEN`, `REQUESTY_API_KEY`, `XAI_API_KEY`, and `CUSTOM_BASE_URL`):

| Variable | Description |
| --- | --- |
| `OPENROUTER_API_KEY` | Optional server-side default OpenRouter API key. If omitted, each user can configure their preferred provider & key in the app. |
| `OPENROUTER_DEFAULT_MODEL` | Default OpenRouter model ID (defaults to `openrouter/free`). |
| `SESSION_SECRET` | Secret used for AES-256-GCM encryption of credentials stored in HttpOnly session cookies (Node server mode). |
| `PAID_MODELS_PASSWORD` | Optional password required before users can select or run paid OpenRouter models (works both in Node server mode and hashed at build time for static deployments). |

---

## Architecture & Deployment Modes

üxz runs in two modes depending on how you host it:

1. **Full-Stack Node Mode (`npm run dev` / `npm start`)**  
   Requests go through `server.ts`, and user-supplied provider API keys are encrypted with AES-256-GCM inside an `HttpOnly` cookie.
2. **Static BYOK Mode (`npm run build`)**  
   Builds a pure static SPA (`dist/`) that talks directly from the user's browser to your selected provider API (Bring Your Own Key). Ready-to-use workflows are included for:
   - **GitHub Pages** (`.github/workflows/deploy-github-pages.yml`)
   - **Cloudflare Pages** (`.github/workflows/deploy-cloudflare-pages.yml` and `wrangler.toml`)

```bash
# Production build
npm run build

# Start Node server after building
npm start
```

---

## Privacy & Data Handling

- **No Operator Tracking**: üxz does not include analytics, advertising trackers, or operator telemetry. A dedicated **Privacy & Data Flows** view inside the app explains clearly what is stored locally in your browser (`localStorage` / `sessionStorage`) and what happens when requests are sent.
- **Hosting & Inference Providers**: Static hosting platforms (such as GitHub Pages or Cloudflare Pages) log standard HTTP access metadata, and text submitted for refinement or translation is sent only to the AI provider or local endpoint you select (with EU options via Mistral AI / Requesty EU and OpenRouter **Zero Data Retention** filtering).
