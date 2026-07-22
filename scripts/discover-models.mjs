#!/usr/bin/env node
/**
 * 新作モデルの自動検出。
 *
 * 各ブランド名で楽天・Yahoo!の「新着順」出品を取得し、カタログに無い型番らしき文字列を
 * 抽出して data/pending-models.json に候補として書き出す。
 * 出現回数の多い型番ほど実在の新作である可能性が高い。
 *
 * 使い方:
 *   node scripts/discover-models.mjs
 *   node scripts/discover-models.mjs --brand rolex --min-hits 3
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const RAKUTEN_APP_ID = process.env.RAKUTEN_APP_ID || '';
const RAKUTEN_ACCESS_KEY = process.env.RAKUTEN_ACCESS_KEY || '';
const RAKUTEN_GENRE_ID = process.env.RAKUTEN_GENRE_ID ?? '558929';
const YAHOO_APP_ID = process.env.YAHOO_APP_ID || '';

const args = process.argv.slice(2);
const argValue = (n) => (args.indexOf(n) >= 0 ? args[args.indexOf(n) + 1] : null);
const onlyBrand = argValue('--brand');
const minHits = Number(argValue('--min-hits')) || 2;

if (!RAKUTEN_APP_ID && !YAHOO_APP_ID) {
  console.log('APIキー未設定のため新作検出をスキップしました。');
  process.exit(0);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url, attempt = 0) {
  const res = await fetch(url, { headers: { 'User-Agent': 'watch-price-navi/1.0' } });
  if (res.status === 429 && attempt < 2) {
    await sleep(10_000 * (attempt + 1));
    return fetchJson(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// 型番らしき文字列: 英数字とハイフン・ドットの組み合わせで、数字を2つ以上含む4〜20文字
const REF_RE = /\b(?=[A-Z0-9][A-Z0-9.\-/]{3,19}\b)(?=(?:[^0-9]*[0-9]){2,})[A-Z0-9][A-Z0-9.\-/]{3,19}\b/gi;

// 型番と紛らわしいノイズを除外
const NOISE_RE = /^(20[0-9]{2}|19[0-9]{2}|[0-9]{1,3}MM|[0-9]+[年月日個点セット]|P[0-9]+|NO[0-9]+|[0-9]+[%％]|[0-9]{1,2}[-/][0-9]{1,2})$/i;
const NOISE_WORDS = ['ATM', 'BAR', 'SS', 'YG', 'PG', 'WG', 'GMT', 'USED', 'NEW'];

function extractRefs(title) {
  const found = new Set();
  for (const raw of title.match(REF_RE) ?? []) {
    const s = raw.toUpperCase();
    if (NOISE_RE.test(s) || NOISE_WORDS.includes(s)) continue;
    if (!/[0-9]/.test(s) || !/[A-Z0-9]/.test(s)) continue;
    found.add(s);
  }
  return [...found];
}

async function searchRakuten(keyword) {
  if (!RAKUTEN_APP_ID) return [];
  const params = new URLSearchParams({
    format: 'json',
    applicationId: RAKUTEN_APP_ID,
    keyword,
    hits: '30',
    sort: 'standard',
  });
  if (RAKUTEN_GENRE_ID && RAKUTEN_GENRE_ID !== 'off') params.set('genreId', RAKUTEN_GENRE_ID);
  let endpoint = 'https://app.rakuten.co.jp/services/api/IchibaItem/Search/20220601';
  if (RAKUTEN_ACCESS_KEY) {
    endpoint = 'https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701';
    params.set('accessKey', RAKUTEN_ACCESS_KEY);
  }
  const data = await fetchJson(`${endpoint}?${params}`);
  return (data.Items ?? []).map(({ Item }) => ({ title: Item.itemName ?? '', price: Number(Item.itemPrice) || 0 }));
}

async function searchYahoo(keyword) {
  if (!YAHOO_APP_ID) return [];
  const params = new URLSearchParams({ appid: YAHOO_APP_ID, query: keyword, results: '30' });
  const data = await fetchJson(`https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch?${params}`);
  return (data.hits ?? []).map((h) => ({ title: h.name ?? '', price: Number(h.price) || 0 }));
}

// ---- カタログの既知型番を集める ----
const brandsDir = path.join(ROOT, 'data', 'brands');
const catalogs = fs
  .readdirSync(brandsDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => {
    try { return JSON.parse(fs.readFileSync(path.join(brandsDir, f), 'utf8')); } catch { return null; }
  })
  .filter(Boolean);

const pendingFile = path.join(ROOT, 'data', 'pending-models.json');
let previous = { generatedAt: null, candidates: [] };
if (fs.existsSync(pendingFile)) {
  try { previous = JSON.parse(fs.readFileSync(pendingFile, 'utf8')); } catch { /* 壊れていれば作り直す */ }
}
// 一度確認して不要と判断した型番は再掲しない
const dismissed = new Set((previous.dismissed ?? []).map((s) => s.toUpperCase()));

const candidates = [];

for (const cat of catalogs) {
  const { brand, models } = cat;
  if (onlyBrand && brand.id !== onlyBrand) continue;

  const known = new Set();
  for (const m of models) {
    if (m.reference) {
      const r = m.reference.toUpperCase();
      known.add(r);
      known.add(r.replace(/[.\-/]/g, '')); // 表記ゆれ(126610LN / 126610-LN)を吸収
    }
  }

  let items = [];
  try {
    items = await searchRakuten(brand.name_ja);
    await sleep(1100);
    items = items.concat(await searchYahoo(brand.name_ja));
    await sleep(2100);
  } catch (e) {
    console.warn(`  NG ${brand.id}: ${e.message}`);
    continue;
  }

  const hits = new Map();
  for (const it of items) {
    if (!it.title.includes(brand.name_ja) && !it.title.toUpperCase().includes(brand.name_en.toUpperCase())) continue;
    for (const ref of extractRefs(it.title)) {
      const flat = ref.replace(/[.\-/]/g, '');
      if (known.has(ref) || known.has(flat) || dismissed.has(ref)) continue;
      const cur = hits.get(ref) ?? { ref, count: 0, minPrice: Infinity, sample: it.title };
      cur.count++;
      cur.minPrice = Math.min(cur.minPrice, it.price || Infinity);
      hits.set(ref, cur);
    }
  }

  const brandCandidates = [...hits.values()]
    .filter((h) => h.count >= minHits)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map((h) => ({
      brandId: brand.id,
      brandName: brand.name_ja,
      reference: h.ref,
      listingCount: h.count,
      minPriceJpy: Number.isFinite(h.minPrice) ? h.minPrice : null,
      sampleTitle: h.sample.slice(0, 120),
    }));

  if (brandCandidates.length > 0) {
    console.log(`  ${brand.name_ja}: 未収録の型番候補 ${brandCandidates.length}件`);
    candidates.push(...brandCandidates);
  }
}

candidates.sort((a, b) => b.listingCount - a.listingCount);

fs.writeFileSync(
  pendingFile,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      note: 'カタログ未収録の型番候補。data/brands/<brand>.json に追記すると翌回の更新から価格収集・ページ生成の対象になります。不要な型番は dismissed 配列に追加すると次回から無視されます。',
      dismissed: previous.dismissed ?? [],
      candidates,
    },
    null,
    2
  ),
  'utf8'
);

console.log(`\n新作候補 ${candidates.length}件を data/pending-models.json に書き出しました`);
