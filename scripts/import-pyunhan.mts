/**
 * 편한가계부 엑셀 내보내기를 spendback 백업 파일로 바꾼다(PRD 4.8). 결과 파일을 폰으로 옮겨 백업 화면의 가져오기로
 * 넣는다. 가져오기는 전체 교체라 spendback에 적은 기록이 없을 때 쓴다. Windows와 macOS 모두 돈다.
 *
 *   pnpm import:pyunhan <엑셀> <규칙.json> <출력.json>
 *
 * 규칙 파일은 개인 기록이라 저장소에 넣지 않는다(.local/에 두면 git이 무시한다). 모양(scripts/pyunhan/convert.ts Rules):
 *
 *   {
 *     "payment": { "카드": "card", "현금": "cash", "은행": "transfer" },
 *     "fixed": [
 *       { "category": "월세", "until": "2026-01-31" },
 *       { "category": "통신비", "except": ["유심"],
 *         "item": { "name": "통신비", "amount": 30000, "dayOfMonth": 1, "paymentMethod": "card" } }
 *     ]
 *   }
 */
import { readFileSync, writeFileSync } from 'node:fs';

import { exportBackup, parseBackup } from '../src/db/backup';
import { nodeDb } from '../src/db/node';
import { formatWon } from '../src/domain/format';
import { importPyunhan, readRows } from './pyunhan/convert';
import { readSheet } from './pyunhan/xlsx';

const [input, rulesPath, output] = process.argv.slice(2);
if (!input || !rulesPath || !output) {
  console.error('사용법: pnpm import:pyunhan <엑셀> <규칙.json> <출력.json>');
  process.exit(1);
}

/** 앱 번들은 babel이 마이그레이션 SQL을 넣는다(migrations.js). 여기서는 journal 순서대로 파일을 읽는다 */
function migrations() {
  const dir = new URL('../src/db/migrations/', import.meta.url);
  const journal = JSON.parse(readFileSync(new URL('meta/_journal.json', dir), 'utf8')) as {
    entries: { tag: string }[];
  };
  return journal.entries.map(e => readFileSync(new URL(`${e.tag}.sql`, dir), 'utf8'));
}

const rows = readRows(readSheet(readFileSync(input)));
const rules = JSON.parse(readFileSync(rulesPath, 'utf8'));
const db = nodeDb(migrations());
const result = await importPyunhan(db, rows, rules);
const json = JSON.stringify(await exportBackup(db));
// 앱의 가져오기와 같은 검증을 거친다
const backup = parseBackup(json);
writeFileSync(output, json);

const txs = backup.transactions;
const dates = txs.map(t => t.date).sort();
console.log(
  `거래 ${txs.length}건(이체 ${result.skippedTransfers}건 제외), ${dates[0]} ~ ${dates.at(-1)}`,
);
for (const category of backup.categories.filter(c => !c.hidden)) {
  const mine = txs.filter(t => t.categoryId === category.id);
  if (mine.length === 0) continue;
  const total = mine.reduce((sum, t) => sum + t.amount, 0);
  console.log(`  ${category.name}: ${mine.length}건 ${formatWon(total)}`);
}
const fixed = txs.filter(t => t.isFixed);
console.log(
  `고정비 표시 ${fixed.length}건, 고정비 항목 ${backup.fixedCosts.map(f => f.name).join(', ') || '없음'}`,
);
const unmapped = [...new Set(rows.map(r => r.asset))].filter(
  a => a && !(a in (rules.payment ?? {})),
);
if (unmapped.length) console.log(`결제 수단을 비운 자산: ${unmapped.join(', ')}`);
const months = new Map<string, number>();
for (const t of txs) {
  if (t.type === 'expense')
    months.set(t.date.slice(0, 7), (months.get(t.date.slice(0, 7)) ?? 0) + t.amount);
}
console.log('달별 지출');
for (const [month, total] of [...months].sort()) console.log(`  ${month}: ${formatWon(total)}`);
console.log(`저장: ${output}`);
