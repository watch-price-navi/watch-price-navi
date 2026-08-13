#!/usr/bin/env node
/** data/ 配下のJSONを検証する。ビルド前の健全性チェック用 */
import fs from 'node:fs';
import path from 'node:path';
import { loadCatalogs } from './lib/catalog.mjs';
import { readJson } from './lib/json.mjs';

const ROOT = process.cwd();
const brandsDir = path.join(ROOT, 'data', 'brands');
const blogDir = path.join(ROOT, 'data', 'blog');
const errors = [];
const warns = [];

const ID_RE = /^[a-z0-9][a-z0-9.-]*$/;
const taxonomy = readJson(path.join(ROOT, 'data', 'taxonomy.json'));
const MOVEMENTS = taxonomy.movements.map((m) => m.id);
const MATERIALS = taxonomy.caseMaterials.map((m) => m.id);
const TAGS = taxonomy.tags.map((t) => t.id);
const GENDERS = taxonomy.genders.map((g) => g.id);

if (!fs.existsSync(brandsDir)) {
  console.error('data/brands/ がありません');
  process.exit(1);
}

const seenBrandIds = new Set();
const modelKeys = new Set();
let brandCount = 0;
let modelCount = 0;
let enrichedCount = 0;

for (const f of fs.readdirSync(brandsDir).filter((f) => f.endsWith('.json'))) {
  let cat;
  try {
    cat = readJson(path.join(brandsDir, f));
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
    if (m?.id) {
      seenModelIds.add(m.id);
      modelKeys.add(`${b.id}/${m.id}`);
    }
    if (!m?.name_en || !m?.name_ja) errors.push(`${where}: name_en / name_ja が欠落`);
    if (!m?.searchKeywordJa) errors.push(`${where}: searchKeywordJa が欠落`);
    if (typeof m?.priceFloorJpy !== 'number' || m.priceFloorJpy <= 0) {
      errors.push(`${where}: priceFloorJpy は正の数値が必須`);
    }
    if (m?.priceFloorJpy > 50_000_000) warns.push(`${where}: priceFloorJpy が高すぎる可能性 (${m.priceFloorJpy})`);
    if (m?.movementType && !MOVEMENTS.includes(m.movementType)) warns.push(`${where}: movementType "${m.movementType}" は未知の値`);
    if (m?.caseMaterial && !MATERIALS.includes(m.caseMaterial)) warns.push(`${where}: caseMaterial "${m.caseMaterial}" は未知の値`);
    if (m?.gender && !GENDERS.includes(m.gender)) warns.push(`${where}: gender "${m.gender}" は未知の値`);
    for (const tag of m?.tags ?? []) {
      if (!TAGS.includes(tag)) warns.push(`${where}: tag "${tag}" はタクソノミー外`);
    }
    if (m?.caseSizeMm != null && (m.caseSizeMm < 15 || m.caseSizeMm > 60)) {
      warns.push(`${where}: caseSizeMm ${m.caseSizeMm} は範囲外の可能性`);
    }
    if (m?.releaseYear != null && (m.releaseYear < 1900 || m.releaseYear > new Date().getFullYear() + 1)) {
      warns.push(`${where}: releaseYear ${m.releaseYear} が不自然`);
    }
    if (m?.caseMaterial || m?.gender || m?.waterResistanceM != null) enrichedCount++;
  }
}

// ---- ブログ記事の検証 ----
let postCount = 0;
if (fs.existsSync(blogDir)) {
  const seenSlugs = new Set();
  for (const f of fs.readdirSync(blogDir).filter((f) => f.endsWith('.json'))) {
    let p;
    try {
      p = readJson(path.join(blogDir, f));
    } catch (e) {
      errors.push(`blog/${f}: JSONとして不正 (${e.message})`);
      continue;
    }
    postCount++;
    const where = `blog/${f}`;
    for (const k of ['slug', 'date', 'title_ja', 'title_en', 'body_ja', 'body_en']) {
      if (!p?.[k]) errors.push(`${where}: ${k} が欠落`);
    }
    if (p?.slug && seenSlugs.has(p.slug)) errors.push(`${where}: slug が重複`);
    if (p?.slug) seenSlugs.add(p.slug);
    if (p?.date && !/^\d{4}-\d{2}-\d{2}$/.test(p.date)) errors.push(`${where}: date は YYYY-MM-DD 形式が必須`);
    if (p?.heroModel && !modelKeys.has(p.heroModel)) {
      warns.push(`${where}: heroModel "${p.heroModel}" がカタログに存在しない`);
    }
    for (const r of p?.relatedModels ?? []) {
      if (!modelKeys.has(r)) warns.push(`${where}: relatedModels "${r}" がカタログに存在しない`);
    }
    // 本文中の内部リンクが実在するモデルを指しているか
    for (const [, brandId, modelId] of (p?.body_ja ?? '').matchAll(/\/ja\/watch\/([a-z0-9.-]+)\/([a-z0-9.-]+)\//g)) {
      if (!modelKeys.has(`${brandId}/${modelId}`)) warns.push(`${where}: 本文の内部リンク /${brandId}/${modelId}/ が存在しない`);
    }
  }
}

// ---- 自動カタログを含めた最終的な掲載数 ----
const merged = loadCatalogs(ROOT);
const mergedTotal = merged.reduce((s, c) => s + c.models.length, 0);
const autoTotal = merged.reduce((s, c) => s + c.models.filter((m) => m.source === 'auto').length, 0);

console.log(`検証: ${brandCount}ブランド / 人手カタログ ${modelCount}モデル（属性付与済み ${enrichedCount}）/ ブログ${postCount}本`);
if (autoTotal > 0) {
  console.log(`掲載合計: ${mergedTotal}モデル（うち出品データからの自動収録 ${autoTotal}件）`);
}
if (warns.length) {
  console.log(`\n警告 (${warns.length}):`);
  for (const w of warns.slice(0, 40)) console.log(`  - ${w}`);
  if (warns.length > 40) console.log(`  … 他 ${warns.length - 40}件`);
}
if (errors.length) {
  console.error(`\nエラー (${errors.length}):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log('エラーなし');
