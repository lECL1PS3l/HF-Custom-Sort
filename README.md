# HF Custom Sort

A Chromium extension for [huggingface.co/models](https://huggingface.co/models) that answers the question Hugging Face does not: **will this model fit *my* GPU?**

It estimates VRAM/RAM requirements for your exact hardware, marks which models fit, explains every term in plain language, and lets you filter, sort and compare thousands of models without opening a single model card.

English is the default UI language; Russian is one click away (flag button in the panel and in the popup).

> **Not affiliated with, endorsed by, or sponsored by Hugging Face, Inc.**
> This is an independent, unofficial browser extension that works with the public website `huggingface.co`. Product names and trademarks belong to their respective owners.

## Features

**Fit estimation (the main feature)**
- Verdict badge on every model card: `GPU ✓ fits`, `GPU ✗ · CPU/RAM slow`, `GPU ✗ · convert to GGUF`, `GPU ✗ · does not fit`, `Apple-only` (MLX), `size unknown`.
- Sizes at two quantization levels: `min. ≈ 5 GB (Q4) · ≈ 8.9 GB (Q8)`.
- Honest math in the tooltip: `weights + KV cache + 1 GB system = total of your VRAM`.
- Context-length slider (1K–1M, plus presets 32K…1M): longer context eats VRAM as KV cache, and the verdict is recalculated.
- GPU picker with desktop NVIDIA cards (GTX 16xx → RTX 50xx) and manual VRAM/RAM fields — the math is hardware-agnostic.

**Filters and sorting**
- Task chips (from the model's pipeline tag) and purpose chips guessed from the model name: code, vision, agent, speech, embeddings, reasoning.
- Sorting: fitting first (relevance), by size, by popularity, or the site order.
- Toggles: hide non-GGUF, hide MLX, hide locked (models that require an access request).
- `hidden: N` counter + "show all" reset.

**Per-model information**
- Format (GGUF / MLX / safetensors) and the runner trio: Ollama ✓ llama.cpp ✓ LM Studio ✓.
- License badge with a plain-language explanation, plus a license mini-guide (12 licenses).
- Our curated mini-DB rating (tier S/A/B/C + a short note) for popular local models.
- Real benchmark numbers from the Open LLM Leaderboard v2 where available (dataset is frozen — submissions from 2024).
- MoE hint (fast even on CPU), context size, gated badge.
- Glossary: hovering a known term (GGUF, MLX, MoE, abliterated, Q4_K_M, …) shows a plain-language explanation.
- Links: Artificial Analysis, GGUF versions on HF, Ollama library search.
- "To AI clipboard": copies a compact markdown summary (params, sizes, verdict, license, README head) to paste into any AI chat.
- `⧉ ollama pull …` command copy, GGUF availability check, fork/patch warning scanned from the README.

**Comparing**
- Checkboxes on cards (up to 3) → side-by-side table: params, Q4/Q8 sizes, verdict, format, license, context, downloads, mini-DB, leaderboard.
- "Pick best": top-5 models that fit your hardware, ranked by fit → our rating → popularity, with copyable `ollama pull` commands.

**Export**
- "Export list": copies all visible models as a markdown table.

## Install

1. Download this repository (or the release ZIP) and unpack it to any folder.
2. Open `chrome://extensions` (or `edge://extensions`).
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the folder with `manifest.json`.
5. Open `huggingface.co/models`.

If the Hugging Face tab was already open before installing or updating, reload it: use the extension popup button "⟳ Reload current tab" (or F5).

## Privacy

- No data collection, no telemetry, no analytics.
- Settings are stored locally via `chrome.storage` (sync). Nothing leaves your browser.
- Network requests go only to `huggingface.co` (public API and model READMEs/configs, cached locally for 7 days).
- The public API is used respectfully: responses are cached for 7 days, duplicate requests are de-duplicated, and no mass crawling is performed — one request per model per week at most.
- Permissions: `storage` and `https://huggingface.co/*` only. No remote code, no eval.

## Development

No build step, no dependencies — plain JavaScript (MV3).

```
lib/core.js      pure calculations: parsing, sizes, verdicts (unit-tested)
lib/api.js       Hugging Face API + cache + request dedup
lib/i18n.js      EN/RU string dictionaries
lib/ui.js        DOM layer: panel, badges, comparison, modals
data/            GPU presets, glossary + licenses, curated model DB
content.js       entry point
```

Tests (Node 18+):

```
node --test
```

Refreshing the curated model DB from the Open LLM Leaderboard dataset (agent-side tool):

```
node tools/refresh-benchmarks.mjs 46
```

It writes `data/benchmarks.next.js` with a coverage report; review it before replacing `data/benchmarks.js`.

## Screenshots

See the [Releases](../../releases) page.

## License

MIT — see [LICENSE](LICENSE).

---

## По-русски (кратко)

Расширение для `huggingface.co/models`: показывает, **влезет ли модель в вашу видеокарту** (VRAM/RAM), с учётом квантизации и длины контекста. Плюс фильтры, сортировка, бейджи совместимости с Ollama/llama.cpp/LM Studio, оценки лидерборда, глоссарий терминов, сравнение моделей и подбор топ-5 под ваше железо.

Интерфейс по умолчанию английский, русский включается кликом по флагу.

**Установка:** `chrome://extensions` → включить «Режим разработчика» → «Загрузить распакованное расширение» → выбрать папку с `manifest.json`.

**Приватность:** данные не собираются, настройки хранятся локально, сеть — только к `huggingface.co`.

Не связано с Hugging Face; независимое расширение.
