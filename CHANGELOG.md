# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] — 2026-09-30

Initial release.

### Added

- **Fit estimation** for the user's hardware: verdict badges (`GPU ✓ fits`, `GPU ✗ · CPU/RAM slow`, `GPU ✗ · convert to GGUF`, `GPU ✗ · does not fit`, `Apple-only`, `size unknown`) with transparent math in the tooltip (weights + KV cache + system RAM).
- Sizes at `Q4_K_M` and `Q8_0`; safetensors models are estimated by full fp16 weights (same as Hugging Face does) with the GGUF Q4 alternative explained.
- **Context-length slider** (1K–1M, logarithmic) with presets (32K/64K/128K/256K/512K/1M); KV cache is taken into account in both the GPU and the CPU/RAM verdicts.
- **GPU picker**: desktop NVIDIA presets (GTX 16xx → RTX 50xx) plus manual VRAM/RAM fields.
- **Filters**: task chips (pipeline tag) and purpose chips (code/vision/agent/speech/embeddings/reasoning guessed from the model name); toggles to hide non-GGUF, MLX and access-gated models; `hidden: N` counter with reset.
- **Sorting**: fitting first (relevance), by size, by popularity, or the site order (implemented via CSS `order`, so the site's own list keeps working).
- **Per-model badges**: format (GGUF/MLX/safetensors) and runner compatibility (Ollama ✓ llama.cpp ✓ LM Studio ✓), license + plain-language explanation, curated mini-DB tier and note, benchmark numbers from Open LLM Leaderboard v2 (where available), MoE hint, context size, gated badge.
- **Glossary**: plain-language explanations for GGUF, MLX, MoE, abliterated, uncensored, heretic, Q4_K_M, Q8_0, safetensors, ONNX, KV cache and more; terms are highlighted in model names.
- **Comparison**: up to three models side by side (10 metrics).
- **Pick best**: top-5 models that fit the hardware, ranked by fit → rating → popularity, with copyable `ollama pull` commands.
- **Export list**: visible models as a markdown table in the clipboard.
- **To AI clipboard**: compact markdown summary of a model (parameters, sizes, verdict, license, README head).
- **Model card helpers**: `ollama pull` command copy, GGUF availability check, fork/patch warning scanned from the README, precise context length from `config.json`, links to Artificial Analysis / GGUF versions / Ollama library.
- **Bilingual UI**: English by default, Russian via the flag button (panel and popup).
- **Popup**: enable/disable switch, "reload current tab" button, language switch.
- **Extension icons** (16/32/48/128).

### Notes

- Fit estimates are approximations: quantized file size is computed as `params × bits/8 × 1.1`, and the KV cache uses a coefficient calibrated against real 7B–70B models. The tooltip always shows the arithmetic.
- Benchmark numbers come from the `open-llm-leaderboard/contents` dataset, which is frozen (submissions from 2024); the snapshot date is shown in the tooltip.
- The curated model DB can be refreshed with `node tools/refresh-benchmarks.mjs` (agent-side tool; the extension itself never downloads it).
