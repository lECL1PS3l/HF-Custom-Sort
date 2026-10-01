const { test } = require('node:test');
const assert = require('node:assert');
const API = require('../lib/api.js');

test('сеть недоступна → null, без исключений', async () => {
  global.fetch = async () => { throw new Error('offline'); };
  global.chrome = undefined;
  assert.strictEqual(await API.getModelInfo('x/y'), null);
  assert.strictEqual(await API.getText('http://x'), null);
});
test('API отдаёт JSON → объект', async () => {
  global.fetch = async () => ({ ok: true, json: async () => ({ id: 'x/y', tags: ['gguf'] }) });
  const r = await API.getModelInfo('x/y');
  assert.strictEqual(r.tags[0], 'gguf');
});
