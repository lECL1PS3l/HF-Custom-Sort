const { test } = require('node:test');
const assert = require('node:assert');
const I18N = require('../lib/i18n.js');
const { GLOSSARY, LICENSES } = require('../data/glossary.js');

test('словари EN и RU совпадают по ключам', () => {
  const en = Object.keys(I18N.L.en).sort();
  const ru = Object.keys(I18N.L.ru).sort();
  assert.deepStrictEqual(ru, en, 'наборы ключей должны совпадать');
  assert.ok(en.length > 50, 'в словаре должно быть больше 50 строк, сейчас ' + en.length);
});

test('t() подставляет аргументы и меняет язык', () => {
  I18N.set('en');
  assert.strictEqual(I18N.t('b.score', 42), 'leaderboard: Avg 42');
  I18N.set('ru');
  assert.strictEqual(I18N.t('b.score', 42), 'лидерборд: Avg 42');
  assert.strictEqual(I18N.t('v.gpu'), 'GPU ✓ влезает');
  assert.strictEqual(I18N.t('этого.нет'), 'этого.нет');
  I18N.set('en');
  assert.strictEqual(I18N.t('v.gpu'), 'GPU ✓ fits');
});

test('pick() отдаёт строку по текущему языку', () => {
  const o = { en: 'a', ru: 'б' };
  I18N.set('ru'); assert.strictEqual(I18N.pick(o), 'б');
  I18N.set('en'); assert.strictEqual(I18N.pick(o), 'a');
});

test('глоссарий и лицензии двуязычны целиком', () => {
  for (const [term, v] of Object.entries(GLOSSARY)) {
    assert.ok(v.en && v.ru, 'термин ' + term + ' должен иметь EN и RU');
  }
  for (const [id, v] of Object.entries(LICENSES)) {
    assert.ok(v.label && v.en && v.ru, 'лицензия ' + id + ' должна иметь label, EN и RU');
  }
});

test('мини-БД: у каждой модели есть EN-заметка, purpose — латинский ключ', () => {
  const { BENCHMARKS } = require('../data/benchmarks.js');
  const CORE = require('../lib/core.js');
  const keys = new Set(CORE.PURPOSES.map(p => p.key));
  for (const [id, bm] of Object.entries(BENCHMARKS)) {
    assert.ok(bm.note, id + ': нет заметки');
    assert.ok(bm.noteEn, id + ': нет английской заметки (noteEn)');
    if (bm.purpose) assert.ok(keys.has(bm.purpose), id + ': purpose должен быть латинским ключом, а не «' + bm.purpose + '»');
    if (bm.tier) assert.ok(/^[SABC]$/.test(bm.tier), id + ': тир должен быть S/A/B/C');
    if (bm.scores) assert.ok(typeof bm.scores.avg === 'number' && bm.scores.avg > 0, id + ': странная оценка Average');
  }
});
