// tools/refresh-benchmarks.mjs — обновление мини-БД из датасета Open LLM Leaderboard (HF datasets-server).
// Запуск: node tools/refresh-benchmarks.mjs [макс.страниц=46]
// Пишет data/benchmarks.next.js (рабочий файл НЕ трогает) и печатает отчёт покрытия.
// ВАЖНО: датасет лидерборда заморожен (отправки 2024) — это снимок, а не «сегодня».

import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { BENCHMARKS } = require('../data/benchmarks.js');

const DS = 'open-llm-leaderboard/contents';
const url = (off) => `https://datasets-server.huggingface.co/rows?dataset=${encodeURIComponent(DS)}&config=default&split=train&offset=${off}&length=100`;
const pick = (row, prefix) => {
  // Берём нормированную колонку: у лидерборда есть пары «X Raw» (0..1) и «X» (0..100)
  const keys = Object.keys(row).filter(k => k.startsWith(prefix) && !/ Raw$/.test(k));
  return keys.length ? row[keys[0]] : null;
};
const round1 = (x) => (x == null ? null : Math.round(x * 10) / 10);

async function page(off, tries = 5) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url(off), { headers: { Origin: 'https://huggingface.co' } });
      if (r.ok) return await r.json();
      if (r.status === 429 || r.status >= 500) { await new Promise(s => setTimeout(s, 2000 * (i + 1))); continue; }
      return null;
    } catch { await new Promise(s => setTimeout(s, 1500 * (i + 1))); }
  }
  return null;
}

const maxPages = Math.max(1, parseInt(process.argv[2] || '46', 10));
const found = new Map();   // fullname → scores
const candidates = [];     // {id, avg, params} для возможного расширения БД
let failed = 0;

for (let p = 0; p < maxPages; p++) {
  const data = await page(p * 100);
  if (!data || !Array.isArray(data.rows)) { failed++; continue; }
  for (const { row } of data.rows) {
    const id = row.fullname;
    if (!id) continue;
    const scores = {
      avg: round1(pick(row, 'Average')), ifeval: round1(pick(row, 'IFEval')),
      bbh: round1(pick(row, 'BBH')), math: round1(pick(row, 'MATH Lvl 5')),
      gpqa: round1(pick(row, 'GPQA')), musr: round1(pick(row, 'MUSR')), mmluPro: round1(pick(row, 'MMLU-PRO'))
    };
    found.set(id, scores);
    const params = pick(row, '#Params');
    const type = String(pick(row, 'Type') || '');
    if (params && params <= 16 && /chat|instruct/i.test(type) && (scores.avg || 0) > 25) candidates.push({ id, avg: scores.avg, params: round1(params) });
  }
  await new Promise(s => setTimeout(s, 350));
}

const snapshot = new Date().toISOString().slice(0, 10);
const entries = [];
let withScores = 0;
const missing = [];
for (const [id, bm] of Object.entries(BENCHMARKS)) {
  const scores = found.get(id) || null;
  if (scores) withScores++; else missing.push(id);
  const parts = [
    `tier: ${JSON.stringify(bm.tier)}`,
    bm.purpose ? `purpose: ${JSON.stringify(bm.purpose)}` : null,
    `note: ${JSON.stringify(bm.note)}`,
    bm.noteEn ? `noteEn: ${JSON.stringify(bm.noteEn)}` : null,
    scores ? `scores: ${JSON.stringify(scores)}` : null,
    `src: ${JSON.stringify(bm.src)}`
  ].filter(Boolean);
  entries.push(`  ${JSON.stringify(id)}: { ${parts.join(', ')}${scores ? `, snapshot: ${JSON.stringify(snapshot)}` : ''} }`);
}

const out = `// Сгенерировано tools/refresh-benchmarks.mjs ${snapshot}. Источник: ${DS} (датасет заморожен, отправки 2024)\n`
  + `const BENCHMARKS = {\n${entries.join(',\n')}\n};\n`
  + `if (typeof module !== 'undefined' && module.exports) module.exports = { BENCHMARKS };\n`;
writeFileSync(new URL('../data/benchmarks.next.js', import.meta.url), out, 'utf8');

console.log(`страниц: ${maxPages}, ошибок: ${failed}, моделей в лидерборде: ${found.size}`);
console.log(`покрытие мини-БД: ${withScores}/${Object.keys(BENCHMARKS).length}`);
if (missing.length) console.log('без оценок: ' + missing.join(', '));
candidates.sort((a, b) => b.avg - a.avg);
console.log('кандидаты на добавление (<=16B, chat/instruct, avg>25), топ-10:');
candidates.slice(0, 10).forEach(c => console.log(`  ${c.avg}\t${c.params}B\t${c.id}`));
console.log('готово: data/benchmarks.next.js');
