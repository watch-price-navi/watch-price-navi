#!/usr/bin/env node
/**
 * 拡充ワークフローがステージングへ書き出した <brandId>.verified.json を
 * data/brands の各カタログへ取り込む。
 *
 * エージェントに data/ を直接書かせるとカタログ消失事故が起きたため、
 * 本体への反映は必ずこのスクリプト（決定的な処理）を通す。
 *
 * 取り込む対象:
 *   <brandId>.verified.json  { models: [...] }          … 既存ブランドへのモデル追加
 *   <brandId>.newbrand.json  { brand: {...}, models: [...] } … 新規ブランドの作成
 *
 * 使い方:
 *   node scripts/merge-staged-catalog.mjs --staging <dir>          # 差分を表示するだけ
 *   node scripts/merge-staged-catalog.mjs --staging <dir> --apply  # 実際に書き込む
 */
import fs from 'node:fs';
import path from 'node:path';
import { readJson } from './lib/json.mjs';

const ROOT = process.cwd();
const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const stagingIdx = argv.indexOf('--staging');
if (stagingIdx === -1 || !argv[stagingIdx + 1]) {
  console.error('--staging <dir> を指定してください');
  process.exit(1);
}
const STAGING = argv[stagingIdx + 1];

const taxonomy = readJson(path.join(ROOT, 'data', 'taxonomy.json'));
const MOVEMENTS = new Set(taxonomy.movements.map((m) => m.id));
const MATERIALS = new Set(taxonomy.caseMaterials.map((m) => m.id));
const TAGS = new Set(taxonomy.tags.map((t) => t.id));
const GENDERS = new Set(taxonomy.genders.map((g) => g.id));

const ID_RE = /^[a-z0-9][a-z0-9.-]*$/;
const normRef = (r) => String(r).toUpperCase().replace(/[.\-/\s]/g, '');

/** data.ts の WatchModel と同じキー順に揃える */
const FIELD_ORDER = [
  'id', 'name_en', 'name_ja', 'reference', 'collection_en', 'collection_ja',
  'caseSizeMm', 'movementType', 'caliber', 'listPriceJpy', 'priceFloorJpy',
  'searchKeywordJa', 'searchKeywordEn', 'caseMaterial', 'waterResistanceM',
  'gender', 'releaseYear', 'tags', 'popular', 'summary_ja', 'summary_en',
];

/** 取り込む前に1件ずつ検品する。落とした理由を返す */
function reject(m) {
  if (!m || typeof m !== 'object') return 'オブジェクトでない';
  if (typeof m.id !== 'string' || !ID_RE.test(m.id)) return `id が不正 (${m.id})`;
  for (const k of ['name_en', 'name_ja', 'searchKeywordJa', 'searchKeywordEn', 'summary_ja', 'summary_en']) {
    if (typeof m[k] !== 'string' || m[k].trim() === '') return `${k} が空`;
  }
  if (typeof m.priceFloorJpy !== 'number' || !(m.priceFloorJpy > 0)) return 'priceFloorJpy が不正';
  if (m.movementType != null && !MOVEMENTS.has(m.movementType)) return `movementType が語彙外 (${m.movementType})`;
  if (m.caseMaterial != null && !MATERIALS.has(m.caseMaterial)) return `caseMaterial が語彙外 (${m.caseMaterial})`;
  if (m.gender != null && !GENDERS.has(m.gender)) return `gender が語彙外 (${m.gender})`;
  if (!Array.isArray(m.tags)) return 'tags が配列でない';
  for (const t of m.tags) if (!TAGS.has(t)) return `tag が語彙外 (${t})`;
  // 日本語欄が英語のまま出てくることがあるので最低限のチェック
  if (!/[ぁ-んァ-ヴ一-龥]/.test(m.summary_ja)) return 'summary_ja に日本語がない';
  return null;
}

function normalize(m) {
  const out = {};
  for (const k of FIELD_ORDER) out[k] = m[k] ?? (k === 'tags' ? [] : k === 'popular' ? false : null);
  out.tags = [...new Set(out.tags)];
  out.popular = Boolean(out.popular);
  return out;
}

// brand.id -> カタログファイルの対応表（ファイル名は brand.id と一致しないことがある）
const brandsDir = path.join(ROOT, 'data', 'brands');
const fileByBrandId = new Map();
for (const f of fs.readdirSync(brandsDir).filter((f) => f.endsWith('.json'))) {
  try {
    const cat = readJson(path.join(brandsDir, f));
    if (cat?.brand?.id) fileByBrandId.set(cat.brand.id, f);
  } catch {
    /* 壊れたファイルは validate 側で報告される */
  }
}

const stagedFiles = fs.existsSync(STAGING) ? fs.readdirSync(STAGING) : [];
const staged = stagedFiles.filter((f) => f.endsWith('.verified.json'));
const stagedNew = stagedFiles.filter((f) => f.endsWith('.newbrand.json'));
if (staged.length === 0 && stagedNew.length === 0) {
  console.error(`${STAGING} に *.verified.json / *.newbrand.json がありません`);
  process.exit(1);
}

const BRAND_ID_RE = /^[a-z0-9][a-z0-9-]*$/;

/** 新規ブランドの brand オブジェクトを検品する */
function rejectBrand(b) {
  if (!b || typeof b !== 'object') return 'brand がオブジェクトでない';
  if (typeof b.id !== 'string' || !BRAND_ID_RE.test(b.id)) return `brand.id が不正 (${b?.id})`;
  for (const k of ['name_en', 'name_ja', 'country', 'description_ja', 'description_en']) {
    if (typeof b[k] !== 'string' || b[k].trim() === '') return `brand.${k} が空`;
  }
  if (b.founded != null && (typeof b.founded !== 'number' || b.founded < 1500 || b.founded > 2030)) {
    return `brand.founded が不正 (${b.founded})`;
  }
  if (b.officialUrl != null && !/^https?:\/\//.test(b.officialUrl)) return 'brand.officialUrl が URL でない';
  if (!/[ぁ-んァ-ヴ一-龥]/.test(b.description_ja)) return 'brand.description_ja に日本語がない';
  return null;
}

const BRAND_FIELD_ORDER = [
  'id', 'name_en', 'name_ja', 'country', 'founded', 'officialUrl', 'description_ja', 'description_en',
];

let totalAdded = 0;
let totalSkipped = 0;
const rows = [];

for (const f of staged.sort()) {
  const brandId = f.replace(/\.verified\.json$/, '');
  const file = fileByBrandId.get(brandId);
  if (!file) {
    console.warn(`  ! ${brandId}: 対応するカタログが見つからない`);
    continue;
  }
  const catFile = path.join(brandsDir, file);
  const cat = readJson(catFile);

  const ids = new Set(cat.models.map((m) => m.id));
  const refs = new Set(cat.models.filter((m) => m.reference).map((m) => normRef(m.reference)));
  const before = cat.models.length;

  let candidates;
  try {
    candidates = readJson(path.join(STAGING, f)).models ?? [];
  } catch (e) {
    console.warn(`  ! ${brandId}: ステージングJSONが壊れている (${e.message})`);
    continue;
  }

  const reasons = new Map();
  let added = 0;
  for (const raw of candidates) {
    const why = reject(raw);
    if (why) {
      reasons.set(why, (reasons.get(why) ?? 0) + 1);
      continue;
    }
    const r = raw.reference ? normRef(raw.reference) : null;
    if (ids.has(raw.id)) {
      reasons.set('id が既存と重複', (reasons.get('id が既存と重複') ?? 0) + 1);
      continue;
    }
    if (r && refs.has(r)) {
      reasons.set('型番が既存と重複', (reasons.get('型番が既存と重複') ?? 0) + 1);
      continue;
    }
    ids.add(raw.id);
    if (r) refs.add(r);
    cat.models.push(normalize(raw));
    added++;
  }

  const skipped = candidates.length - added;
  totalAdded += added;
  totalSkipped += skipped;
  rows.push({ brandId, before, added, after: before + added, skipped, reasons });

  if (APPLY && added > 0) {
    fs.writeFileSync(catFile, JSON.stringify(cat, null, 2) + '\n', 'utf8');
  }
}

// ---- 新規ブランドの作成 ----
for (const f of stagedNew.sort()) {
  const brandId = f.replace(/\.newbrand\.json$/, '');
  if (fileByBrandId.has(brandId)) {
    console.warn(`  ! ${brandId}: 既に存在するブランドなのでスキップ（追加は .verified.json で行う）`);
    continue;
  }
  let data;
  try {
    data = readJson(path.join(STAGING, f));
  } catch (e) {
    console.warn(`  ! ${brandId}: ステージングJSONが壊れている (${e.message})`);
    continue;
  }
  const whyBrand = rejectBrand(data?.brand);
  if (whyBrand) {
    console.warn(`  ! ${brandId}: ${whyBrand}`);
    continue;
  }
  if (data.brand.id !== brandId) {
    console.warn(`  ! ${brandId}: ファイル名と brand.id (${data.brand.id}) が不一致`);
    continue;
  }

  const ids = new Set();
  const refs = new Set();
  const reasons = new Map();
  const models = [];
  for (const raw of data.models ?? []) {
    const why = reject(raw);
    if (why) {
      reasons.set(why, (reasons.get(why) ?? 0) + 1);
      continue;
    }
    const r = raw.reference ? normRef(raw.reference) : null;
    if (ids.has(raw.id) || (r && refs.has(r))) {
      reasons.set('ステージング内で重複', (reasons.get('ステージング内で重複') ?? 0) + 1);
      continue;
    }
    ids.add(raw.id);
    if (r) refs.add(r);
    models.push(normalize(raw));
  }

  if (models.length === 0) {
    console.warn(`  ! ${brandId}: 検品を通ったモデルが0件のため作成しない`);
    continue;
  }

  const brand = {};
  for (const k of BRAND_FIELD_ORDER) brand[k] = data.brand[k] ?? null;

  const skipped = (data.models ?? []).length - models.length;
  totalAdded += models.length;
  totalSkipped += skipped;

  if (APPLY) {
    fs.writeFileSync(
      path.join(brandsDir, `${brandId}.json`),
      JSON.stringify({ brand, models }, null, 2) + '\n',
      'utf8'
    );
  }
  rows.push({ brandId: `${brandId} (新規)`, before: 0, added: models.length, after: models.length, skipped, reasons });
}

const pad = (s, n) => String(s).padEnd(n);
console.log(`\n${APPLY ? '取り込み結果' : '取り込みプレビュー（--apply で実行）'}\n`);
console.log(`${pad('ブランド', 24)}${'既存'.padStart(6)}${'追加'.padStart(6)}${'合計'.padStart(6)}${'除外'.padStart(6)}`);
for (const r of rows.sort((a, b) => b.added - a.added)) {
  console.log(`${pad(r.brandId, 24)}${String(r.before).padStart(6)}${String(r.added).padStart(6)}${String(r.after).padStart(6)}${String(r.skipped).padStart(6)}`);
}
console.log(`\n合計: +${totalAdded}件 追加 / ${totalSkipped}件 除外`);

const allReasons = new Map();
for (const r of rows) for (const [k, v] of r.reasons) allReasons.set(k, (allReasons.get(k) ?? 0) + v);
if (allReasons.size) {
  console.log('\n除外理由:');
  for (const [k, v] of [...allReasons].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(5)}  ${k}`);
}
if (!APPLY) console.log('\n※ まだ何も書き込んでいません。--apply を付けると反映します。');
