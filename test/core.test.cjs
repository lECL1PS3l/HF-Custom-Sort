const { test } = require('node:test');
const assert = require('node:assert');
const CORE = require('../lib/core.js');

test('parse: обычная модель', () => {
  assert.deepStrictEqual(CORE.parseModelName('Llama-3.1-8B-Instruct'),
    { paramsB: 8, activeB: null, contextK: null });
});
test('parse: MoE', () => {
  const r = CORE.parseModelName('Qwen3-30B-A3B');
  assert.strictEqual(r.paramsB, 30); assert.strictEqual(r.activeB, 3);
});
test('parse: строчные буквы', () => {
  assert.strictEqual(CORE.parseModelName('gemma-2-9b-it').paramsB, 9);
});
test('parse: контекст в имени', () => {
  assert.strictEqual(CORE.parseModelName('Phi-3-mini-4k-instruct').contextK, 4);
});
test('parse: версия v0.3 не параметр', () => {
  assert.strictEqual(CORE.parseModelName('Mistral-7B-v0.3').paramsB, 7);
  assert.strictEqual(CORE.parseModelName('v0.3-beta').paramsB, null);
});
test('размер Q4 для 8B ≈ 5.28 ГБ', () => {
  assert.ok(Math.abs(CORE.quantSizeGB(8, CORE.BPW.q4) - 5.28) < 0.01);
});
test('вердикт: 8B влезает в 8 ГБ', () => {
  assert.strictEqual(CORE.verdict({ paramsB: 8, isGguf: true, vramGB: 8, ramGB: 32 }).key, 'gpu');
});
test('вердикт: 14B GGUF → CPU/RAM', () => {
  assert.strictEqual(CORE.verdict({ paramsB: 14, isGguf: true, vramGB: 8, ramGB: 32 }).key, 'cpu');
});
test('вердикт: 14B без GGUF → конвертация', () => {
  assert.strictEqual(CORE.verdict({ paramsB: 14, isGguf: false, vramGB: 8, ramGB: 32 }).key, 'convert');
});
test('вердикт: 70B GGUF → не влезает', () => {
  assert.strictEqual(CORE.verdict({ paramsB: 70, isGguf: true, vramGB: 8, ramGB: 32 }).key, 'nofit');
});
test('вердикт: MLX → Apple-only; без данных → неизвестен', () => {
  assert.strictEqual(CORE.verdict({ paramsB: 8, isMlx: true, vramGB: 8, ramGB: 32 }).key, 'mlx');
  assert.strictEqual(CORE.verdict({ paramsB: null, vramGB: 8, ramGB: 32 }).key, 'unknown');
});
test('MoE 3B активных → быстрая на CPU', () => {
  assert.strictEqual(CORE.isFastCpu(3), true); assert.strictEqual(CORE.isFastCpu(null), false);
});
test('форк-эвристика', () => {
  assert.strictEqual(CORE.hasForkWarning('needs a custom llama.cpp build'), true);
  assert.strictEqual(CORE.hasForkWarning('works with llama.cpp'), false);
});

test('назначение: кодовые', () => {
  assert.strictEqual(CORE.purposeOf('Qwen/Qwen2.5-Coder-7B-Instruct'), 'code');
  assert.strictEqual(CORE.purposeOf('bigcode/starcoder2-7b'), 'code');
  assert.strictEqual(CORE.purposeOf('deepseek-ai/deepseek-coder-6.7b-instruct'), 'code');
  assert.strictEqual(CORE.purposeOf('ibm-granite/granite-8b-code-instruct-4k'), 'code');
});
test('назначение: зрение/речь/эмбеддинги/рассуждения/агент', () => {
  assert.strictEqual(CORE.purposeOf('Qwen/Qwen2-VL-7B-Instruct'), 'vision');
  assert.strictEqual(CORE.purposeOf('openai/whisper-large-v3'), 'speech');
  assert.strictEqual(CORE.purposeOf('nvidia/Nemotron-3-Diarization'), 'speech');
  assert.strictEqual(CORE.purposeOf('BAAI/bge-m3'), 'embedding');
  assert.strictEqual(CORE.purposeOf('deepseek-ai/DeepSeek-R1-Distill-Qwen-14B'), 'reasoning');
  assert.strictEqual(CORE.purposeOf('some/Tool-Use-7B'), 'agent');
});
test('назначение: без назначения', () => {
  assert.strictEqual(CORE.purposeOf('meta-llama/Llama-3.1-8B-Instruct'), null);
  assert.strictEqual(CORE.purposeOf('Qwen/Qwen-Image-2.1'), null);
});

test('энкодер/декодер — НЕ кодовая модель', () => {
  assert.strictEqual(CORE.purposeOf('potatokao/Qwen-Image-2.1-Text-Encoder-Heretic-GGUF'), null);
  assert.strictEqual(CORE.purposeOf('foo/Bar-Decoder-7B'), null);
  assert.strictEqual(CORE.purposeOf('Qwen/Qwen2.5-Coder-7B-Instruct'), 'code');
  assert.strictEqual(CORE.purposeOf('bigcode/starcoder2-7b'), 'code');
});

test('вердикт: safetensors считается по полным весам (как у HF), а не по Q4', () => {
  const v8 = CORE.verdict({ paramsB: 8, isGguf: false, vramGB: 8, ramGB: 32 });
  assert.strictEqual(v8.key, 'convert');
  assert.ok(v8.fp16 > 15, 'fp16 для 8B должен быть ~17.6 ГБ');
  const v15 = CORE.verdict({ paramsB: 1.5, isGguf: false, vramGB: 8, ramGB: 32 });
  assert.strictEqual(v15.key, 'gpu');
  assert.strictEqual(v15.labelKey, 'v.gpuFull');
});

test('вердикты говорят прямо про GPU ✗ и размер нехватки', () => {
  const g = CORE.verdict({ paramsB: 8, isGguf: true, vramGB: 8, ramGB: 32 });
  assert.strictEqual(g.labelKey, 'v.gpu');
  const c = CORE.verdict({ paramsB: 27, isGguf: true, vramGB: 8, ramGB: 32 });
  assert.strictEqual(c.key, 'cpu');
  assert.strictEqual(c.labelKey, 'v.cpu');
  assert.ok(c.needVram > 17, 'нужно ~19.3 ГБ VRAM');
  const n = CORE.verdict({ paramsB: 70, isGguf: true, vramGB: 8, ramGB: 32 });
  assert.strictEqual(n.key, 'nofit');
  assert.strictEqual(n.labelKey, 'v.nofit');
});

test('KV-кэш: приблизительная оценка', () => {
  assert.ok(Math.abs(CORE.kvCacheGB(8, 8) - 0.69) < 0.05, '8B/8K ≈ 0.69 ГБ');
  assert.ok(Math.abs(CORE.kvCacheGB(1.5, 8) - 0.21) < 0.05);
  assert.ok(CORE.kvCacheGB(8, 64) > 5, '64K контекст для 8B ≈ 5.5 ГБ');
  assert.strictEqual(CORE.kvCacheGB(null, 8), 0);
});
test('контекст влияет на вердикт', () => {
  const small = CORE.verdict({ paramsB: 8, isGguf: true, vramGB: 8, ramGB: 32, contextK: 4 });
  assert.strictEqual(small.key, 'gpu', '8B в Q4 при 4K влезает');
  const big = CORE.verdict({ paramsB: 8, isGguf: true, vramGB: 8, ramGB: 32, contextK: 64 });
  assert.strictEqual(big.key, 'cpu', 'при 64K тот же 8B в VRAM уже не влезает');
  assert.ok(big.needVram > 11);
  assert.ok(big.kv > 5);
});

test('шкала контекста: логарифмическая до 1M', () => {
  assert.strictEqual(CORE.posToContext(0), 1);
  assert.strictEqual(CORE.posToContext(30), 8);
  assert.strictEqual(CORE.posToContext(50), 32);
  assert.strictEqual(CORE.posToContext(80), 256);
  assert.strictEqual(CORE.posToContext(100), 1024);
  assert.strictEqual(CORE.contextToPos(8), 30);
  assert.strictEqual(CORE.contextToPos(1024), 100);
  assert.strictEqual(CORE.formatContext(8), '8K');
  assert.strictEqual(CORE.formatContext(128), '128K');
  assert.strictEqual(CORE.formatContext(1024), '1M');
});
test('гигантский контекст учитывается и в CPU/RAM', () => {
  const v = CORE.verdict({ paramsB: 7, isGguf: true, vramGB: 8, ramGB: 32, contextK: 1024 });
  assert.strictEqual(v.key, 'nofit', '7B при 1M контекста не влезает даже в 32 ГБ RAM');
  const v2 = CORE.verdict({ paramsB: 7, isGguf: true, vramGB: 8, ramGB: 32, contextK: 128 });
  assert.strictEqual(v2.key, 'cpu');
});
