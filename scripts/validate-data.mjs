#!/usr/bin/env node
/** data/ 配下のJSONを検証する。ビルド前の健全性チェック用 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const brandsDir = path.join(ROOT, 'data', 'brands');
const errors = [];
const warns = [];

const ID_RE = /^[a-z0-9][a-z0-9.-]*$/;
const MOVEMENTS = ['automatic', 'manual', 'quartz', 'solar', 'spring-drive', 'kinetic', null];

if (!fs.existsSync(brandsDir)) {
  console.error('data/brands/ がありません');
  process.exit(1);
}

const seenBrandIds = new Set();
let brandCount = 0;
let modelCount = 0;

for (const f of fs.readdirSync(brandsDir).filter((f) => f.endsWith('.json'))) {
  let cat;
  try {
    cat = JSON.parse(fs.readFileSync(path.join(brandsDir, f), 'utf8'));
  } catch (e) {
    errors.push(`${f}: JSONとして不正 (${e.message})`);
    continue;
  }
  const b = cat.brand;
  if (!b?.id || !b?.name_en || !b?.name_ja) {
    errors.push(`${f}: brand.id / name_en / name_ja が欠落`);
    continue;
  }
  if (!ID_RE.test(b.id)) errors.push(`${f}: brand.id "${b.id}" が不正な形式`);
  if (seenBrandIds.has(b.id)) errors.push(`${f}: brand.id "${b.id}" が重複`);
  seenBrandIds.add(b.id);
  if (f !== `${b.id}.json`) warns.push(`${f}: ファイル名とbrand.id (${b.id}) が不一致`);
  brandCount++;

  if (!Array.isArray(cat.models) || cat.models.length === 0) {
    errors.push(`${f}: models が空`);
    continue;
  }
  const seenModelIds = new Set();
  for (const m of cat.models) {
    modelCount++;
    const where = `${f} > ${m?.id ?? '(no id)'}`;
    if (!m?.id || !ID_RE.test(m.id)) errors.push(`${where}: model.id が欠落または不正`);
    if (m?.id && seenModelIds.has(m.id)) errors.push(`${where}: model.id が重複`);
    if (m?.id) seenModelIds.add(m.id);
    if (!m?.name_en || !m?.name_ja) errors.push(`${where}: name_en / name_ja が欠落`);
    if (!m?.searchKeywordJa) errors.push(`${where}: searchKeywordJa が欠落`);
    if (typeof m?.priceFloorJpy !== 'number' || m.priceFloorJpy <= 0) {
      errors.push(`${where}: priceFloorJpy は正の数値が必須`);
    }
    if (m?.priceFloorJpy > 50_000_000) warns.push(`${where}: priceFloorJpy が高すぎる可能性 (${m.priceFloorJpy})`);
    if (!MOVEMENTS.includes(m?.movementType ?? null)) warns.push(`${where}: movementType "${m.movementType}" は未知の値`);
    if (m?.caseSizeMm != null && (m.caseSizeMm < 15 || m.caseSizeMm > 60)) {
      warns.push(`${where}: caseSizeMm ${m.caseSizeMm} は範囲外の可能性`);
    }
  }
}

console.log(`検証: ${brandCount}ブランド / ${modelCount}モデル`);
if (warns.length) {
  console.log(`\n警告 (${warns.length}):`);
  for (const w of warns) console.log(`  - ${w}`);
}
if (errors.length) {
  console.error(`\nエラー (${errors.length}):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log('エラーなし');
