const { test } = require('node:test');
const assert = require('node:assert');
const { GPU_PRESETS } = require('../data/gpu.js');

test('пресеты: RTX 3070 = 8 ГБ, имена уникальны, VRAM > 0', () => {
  const g = GPU_PRESETS.find(x => x.name === 'RTX 3070');
  assert.strictEqual(g.vram, 8);
  assert.strictEqual(new Set(GPU_PRESETS.map(x => x.name)).size, GPU_PRESETS.length);
  assert.ok(GPU_PRESETS.every(x => x.vram > 0));
});
