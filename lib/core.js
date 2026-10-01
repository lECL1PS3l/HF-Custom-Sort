// lib/core.js — чистые функции без DOM и сети; работает в браузере и в node
const CORE = {
  BPW: { q4: 4.8, q8: 8.5 },
  OVERHEAD: 1.1,
  KV_COEF: 0.02,
  SYSTEM_GB: 1.0,
  VRAM_RESERVE_GB: 1.5,
  MOE_FAST_ACTIVE_B: 5,
  verdictRank: { gpu: 0, cpu: 1, convert: 2, unknown: 3, mlx: 4, nofit: 5 },

  // Приблизительная оценка KV-кэша (fp16, без квантования кэша): сверено с реальными моделями
  // 7-8B/8K ≈ 0.6-0.8 ГБ, 27B ≈ 1.6 ГБ, 70B ≈ 3.1 ГБ
  kvCacheGB(paramsB, contextK) {
    if (!paramsB || paramsB <= 0 || !contextK) return 0;
    return CORE.KV_COEF * Math.pow(paramsB, 0.7) * contextK;
  },

  // Логарифмическая шкала ползунка: позиция 0..100 ↔ контекст 1K..1024K (1M)
  posToContext(pos) { return Math.round(Math.pow(2, pos / 10)); },
  contextToPos(contextK) { return Math.max(0, Math.min(100, Math.round(10 * Math.log2(Math.max(1, contextK))))); },
  formatContext(contextK) { return contextK >= 1024 ? Math.round(contextK / 1024 * 10) / 10 + 'M' : contextK + 'K'; },

  parseModelName(name) {
    const r = { paramsB: null, activeB: null, contextK: null };
    if (typeof name !== 'string' || !name) return r;
    const total = name.match(/(?:^|[^A-Za-z0-9])(\d+(?:\.\d+)?)[bB](?![A-Za-z0-9])/);
    if (total) r.paramsB = parseFloat(total[1]);
    const act = name.match(/[Aa](\d+(?:\.\d+)?)[bB](?![A-Za-z0-9])/);
    if (act) r.activeB = parseFloat(act[1]);
    const ctx = name.match(/(?:^|-)(\d+(?:\.\d+)?)[kK](?:$|-)/);
    if (ctx) r.contextK = parseFloat(ctx[1]);
    return r;
  },

  quantSizeGB(paramsB, bpw) { return paramsB * bpw / 8 * CORE.OVERHEAD; },

  verdict({ paramsB, isGguf = false, isMlx = false, vramGB, ramGB, contextK = 8 }) {
    if (isMlx) return { key: 'mlx', tone: 'gray', labelKey: 'v.mlx' };
    if (!paramsB || paramsB <= 0) return { key: 'unknown', tone: 'neutral', labelKey: 'v.unknown' };
    const q4 = CORE.quantSizeGB(paramsB, CORE.BPW.q4);
    const q8 = CORE.quantSizeGB(paramsB, CORE.BPW.q8);
    const fp16 = CORE.quantSizeGB(paramsB, 16);
    const kv = CORE.kvCacheGB(paramsB, contextK);
    const needVram = q4 + kv + CORE.SYSTEM_GB;
    // safetensors оцениваем по полным весам (fp16) — так же, как это делает сам HF
    if (isGguf && vramGB && needVram <= vramGB)
      return { key: 'gpu', tone: 'green', labelKey: 'v.gpu', q4, q8, fp16, kv, needVram };
    if (!isGguf && vramGB && fp16 + kv + CORE.SYSTEM_GB <= vramGB)
      return { key: 'gpu', tone: 'green', labelKey: 'v.gpuFull', q4, q8, fp16, kv, needVram };
    if (isGguf && ramGB && q4 + kv + 2 <= ramGB)
      return { key: 'cpu', tone: 'yellow', labelKey: 'v.cpu', q4, q8, fp16, kv, needVram };
    if (!isGguf)
      return { key: 'convert', tone: 'orange', labelKey: 'v.convert', q4, q8, fp16, kv, needVram };
    return { key: 'nofit', tone: 'red', labelKey: 'v.nofit', q4, q8, fp16, kv, needVram };
  },

  isFastCpu(activeB) { return activeB != null && activeB <= CORE.MOE_FAST_ACTIVE_B; },
  purposeOf(id) {
    if (typeof id !== 'string' || !id) return null;
    const s = id.toLowerCase();
    if (/(?<!en)(?<!de)coder|code[._-]|starcoder|codellama|codegemma|codeqwen|codeparrot|granite-\d+b-code/.test(s)) return 'code';
    if (/(^|[._-])vl([._-]|$)|vision|llava|moondream|minicpm-v|internvl|paligemma|idefics|florence/.test(s)) return 'vision';
    if (/agent|tool[-_]?use|function[-_]?call/.test(s)) return 'agent';
    if (/whisper|tts|speech|voice|audio|diariz/.test(s)) return 'speech';
    if (/embed|bge|gte[-_]|e5[-_]|arctic-embed|nomic-embed/.test(s)) return 'embedding';
    if (/(^|[-_])r1([-_]|$)|reason|thinking|thought/.test(s)) return 'reasoning';
    return null;
  },
  PURPOSES: [
    { key: 'code' }, { key: 'vision' }, { key: 'agent' },
    { key: 'embedding' }, { key: 'speech' }, { key: 'reasoning' }
  ],
  hasForkWarning(text) {
    return typeof text === 'string' && /fork|custom\s+(?:build|patch|llama\.?cpp)|not\s+yet\s+supported|requires\s+(?:custom|modified|patched)/i.test(text);
  },
  GB_UNIT: 'GB',
  formatGB(x) {
    if (x == null || !isFinite(x)) return '—';
    return (x >= 10 ? Math.round(x) : Math.round(x * 10) / 10) + ' ' + CORE.GB_UNIT;
  }
};
if (typeof module !== 'undefined' && module.exports) module.exports = CORE;
