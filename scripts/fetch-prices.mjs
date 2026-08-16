#!/usr/bin/env node
/**
 * 価格収集スクリプト
 * 楽天市場・Yahoo!ショッピングの公式APIから各モデルの出品価格を取得し、
 * data/prices/<brandId>/<modelId>.json と data/prices/summary.json に保存する。
 *
 * build-auto-catalog.mjs のブランド一括走査では拾えなかったモデルを、型番キーワードで
 * 個別に検索して補完する役割。人気モデルと価格未取得のモデルを優先し、時間予算内で打ち切る。
 *
 * 使い方:
 *   node scripts/fetch-prices.mjs                 # 全ブランド
 *   node scripts/fetch-prices.mjs --brand rolex   # 1ブランドのみ
 *   node scripts/fetch-prices.mjs --limit 5       # 各ブランド先頭5モデルのみ(テスト用)
 *   node scripts/fetch-prices.mjs --max-minutes 90  # 時間予算(既定120分)
 *   node scripts/fetch-prices.mjs --missing-only  # 価格未取得のモデルだけを対象にする
 *
 * 必要な環境変数(.env でも可): RAKUTEN_APP_ID, YAHOO_APP_ID
 * 任意: RAKUTEN_AFFILIATE_ID, RAKUTEN_GENRE_ID, VC_SID, VC_PID
 */

import fs from 'node:fs';
import path from 'node:path';
import { loadCatalogs } from './lib/catalog.mjs';
import { readJson } from './lib/json.mjs';

const ROOT = process.cwd();

// ---- .env の簡易読み込み(依存パッケージなし) ----
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const RAKUTEN_APP_ID = process.env.RAKUTEN_APP_ID || '';
// 2026年の新API基盤ではapplicationIdに加えてaccessKeyが必須(旧エンドポイントは2026-08-17廃止予定)
const RAKUTEN_ACCESS_KEY = process.env.RAKUTEN_ACCESS_KEY || '';
/** 新システムが要求する Origin。アプリ登録時の「許可サイト」と一致させること */
const RAKUTEN_ORIGIN =
  process.env.RAKUTEN_ORIGIN || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
const RAKUTEN_AFFILIATE_ID = process.env.RAKUTEN_AFFILIATE_ID || '';
// 558929 = 腕時計。'off' で無効化。CIでは未登録Variablesが空文字で渡るため || で既定値に倒す
const RAKUTEN_GENRE_ID = (process.env.RAKUTEN_GENRE_ID ?? '').trim() || '558929';
const YAHOO_APP_ID = process.env.YAHOO_APP_ID || '';
const VC_SID = process.env.VC_SID || '';
const VC_PID = process.env.VC_PID || '';

const args = process.argv.slice(2);
function argValue(name) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : null;
}
const onlyBrand = argValue('--brand');
const limit = Number(argValue('--limit')) || Infinity;
const delayMs = Number(argValue('--delay')) || 1100; // 楽天APIは1リクエスト/秒制限
const maxMinutes = Number(argValue('--max-minutes')) || 120;
const missingOnly = args.includes('--missing-only');
const deadline = Date.now() + maxMinutes * 60_000;

if (!RAKUTEN_APP_ID && !YAHOO_APP_ID) {
  console.log('APIキーが設定されていないため、価格収集をスキップしました。');
  console.log('  RAKUTEN_APP_ID : https://webservice.rakuten.co.jp/ で無料発行');
  console.log('  YAHOO_APP_ID   : https://e.developer.yahoo.co.jp/ で無料発行');
  console.log('.env または GitHub Secrets に設定してください。詳細: docs/セットアップ手順.md');
  process.exit(0);
}

// 楽天公式告知(2026-04-10)により旧エンドポイントは2026-08-17に完全廃止。
// アクセスキーが無いと旧エンドポイントにフォールバックするため、気付かず停止するのを防ぐ。
export function warnRakutenDeadline(appId, accessKey, log = console.warn) {
  if (!appId || accessKey) return false;
  const deadline = Date.parse('2026-08-17T00:00:00+09:00');
  if (Date.now() >= deadline) {
    log('\n[停止] 楽天の旧APIは2026-08-17に廃止されました。RAKUTEN_ACCESS_KEY を設定してください。');
    log('       https://webservice.rakuten.co.jp/app/list でアプリを開くとアクセスキーが表示されます。\n');
  } else {
    const days = Math.ceil((deadline - Date.now()) / 86_400_000);
    log(`\n[警告] RAKUTEN_ACCESS_KEY が未設定です。旧APIはあと${days}日(2026-08-17)で廃止され、価格取得が止まります。`);
    log('       https://webservice.rakuten.co.jp/app/list でアクセスキーを取得して設定してください。\n');
  }
  return true;
}
warnRakutenDeadline(RAKUTEN_APP_ID, RAKUTEN_ACCESS_KEY);

// タイトルにこれらの語が含まれる出品は本体ではないとみなして除外
const NG_WORDS = [
  'ベルト', 'バンド', 'ストラップ', 'ブレスレット単品', 'コマ', '駒', '尾錠', 'バックル',
  '風防', 'ガラス', 'パーツ', '部品', 'ケースのみ', '箱のみ', '空箱', '純正BOX',
  '説明書', '冊子', 'タグのみ', '互換', '社外', '汎用', 'ノベルティ', '非売品',
  '置時計', '置き時計', '掛け時計', '壁掛け', 'クロック', 'ぬいぐるみ', 'キーホルダー',
  '修理', 'オーバーホール', '電池交換', '磨き', 'ラッピング', 'コーティング',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function looksLikeGenuine(title, brand) {
  if (NG_WORDS.some((w) => title.includes(w))) return false;
  const t = title.toLowerCase();
  return t.includes(brand.name_en.toLowerCase()) || title.includes(brand.name_ja);
}

function detectCondition(title) {
  if (/中古|USED|ユーズド|美品/i.test(title)) return 'used';
  if (/未使用|新品/.test(title)) return 'new';
  return 'unknown';
}

async function fetchJson(url, attempt = 0, extraHeaders = {}) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'watch-price-navi/1.0', ...extraHeaders },
  });
  if (res.status === 429 && attempt < 2) {
    // レート制限超過: 指数バックオフで再試行
    await sleep(10_000 * (attempt + 1));
    return fetchJson(url, attempt + 1, extraHeaders);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url.split('?')[0]}`);
  return res.json();
}

async function fetchRakuten(model, brand) {
  if (!RAKUTEN_APP_ID) return [];
  const params = new URLSearchParams({
    format: 'json',
    applicationId: RAKUTEN_APP_ID,
    keyword: model.searchKeywordJa,
    hits: '30',
    sort: '+itemPrice',
    minPrice: String(Math.max(1, Math.floor(model.priceFloorJpy))),
  });
  if (RAKUTEN_AFFILIATE_ID) params.set('affiliateId', RAKUTEN_AFFILIATE_ID);
  if (RAKUTEN_GENRE_ID && RAKUTEN_GENRE_ID !== 'off') params.set('genreId', RAKUTEN_GENRE_ID);
  // accessKey があれば新エンドポイント、なければ旧エンドポイント(2026-08-17廃止予定)を使用
  let endpoint = 'https://app.rakuten.co.jp/services/api/IchibaItem/Search/20220601';
  const headers = {};
  if (RAKUTEN_ACCESS_KEY) {
    endpoint = 'https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701';
    params.set('accessKey', RAKUTEN_ACCESS_KEY);
    // 新システムはアプリ登録時の「許可サイト」と一致する Origin ヘッダを要求する
    headers.Origin = RAKUTEN_ORIGIN;
  }
  const url = `${endpoint}?${params}`;
  const data = await fetchJson(url, 0, headers);
  return (data.Items ?? []).map(({ Item: it }) => ({
    source: 'rakuten',
    title: it.itemName ?? '',
    price: Number(it.itemPrice) || 0,
    url: it.affiliateUrl || it.itemUrl || '',
    shop: it.shopName ?? '',
    image: it.mediumImageUrls?.[0]?.imageUrl?.replace(/\?_ex=\d+x\d+$/, '') ?? null,
    condition: detectCondition(it.itemName ?? ''),
  }));
}

async function fetchYahoo(model, brand) {
  if (!YAHOO_APP_ID) return [];
  const params = new URLSearchParams({
    appid: YAHOO_APP_ID,
    query: model.searchKeywordJa,
    results: '30',
    sort: '+price',
    price_from: String(Math.max(1, Math.floor(model.priceFloorJpy))),
  });
  if (VC_SID && VC_PID) {
    params.set('affiliate_type', 'vc');
    // 公式仕様: referralプレフィックスURLを丸ごとaffiliate_idに渡す(URLSearchParamsがエンコードする)
    params.set('affiliate_id', `http://ck.jp.ap.valuecommerce.com/servlet/referral?sid=${VC_SID}&pid=${VC_PID}&vc_url=`);
  }
  const url = `https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch?${params}`;
  const data = await fetchJson(url);
  return (data.hits ?? []).map((h) => ({
    source: 'yahoo',
    title: h.name ?? '',
    price: Number(h.price) || 0,
    url: h.url ?? '',
    shop: h.seller?.name ?? '',
    // Yahoo!のパス1文字がサイズ。g=146px / j=300px / l=600px。最大の l で保存する
    image: h.image?.medium ? h.image.medium.replace(/\/i\/[a-z]\//, '/i/l/') : null,
    condition: h.condition === 'used' ? 'used' : h.condition === 'new' ? 'new' : detectCondition(h.name ?? ''),
  }));
}

function cleanOffers(offers, model, brand) {
  const filtered = offers.filter(
    (o) => o.price >= model.priceFloorJpy && o.url && o.shop && looksLikeGenuine(o.title, brand)
  );
  // 同一ショップは最安の1件のみ残す
  const byShop = new Map();
  for (const o of filtered.sort((a, b) => a.price - b.price)) {
    const key = `${o.source}:${o.shop}`;
    if (!byShop.has(key)) byShop.set(key, o);
  }
  return [...byShop.values()].sort((a, b) => a.price - b.price).slice(0, 8);
}

// ---- メイン処理 ----
const pricesDir = path.join(ROOT, 'data', 'prices');
fs.mkdirSync(pricesDir, { recursive: true });

const summaryFile = path.join(pricesDir, 'summary.json');
let summary = {};
if (fs.existsSync(summaryFile)) {
  try { summary = readJson(summaryFile); } catch { summary = {}; }
}

const catalogs = loadCatalogs(ROOT);

let processed = 0;
let withOffers = 0;
/**
 * 記事本文が参照しているモデルを集める。
 * ここに載るモデルの価格が取れないと、記事から商品写真が消える。
 */
const blogReferenced = (() => {
  const keys = new Set();
  const dir = path.join(ROOT, 'data', 'blog');
  if (!fs.existsSync(dir)) return keys;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    let post;
    try {
      post = readJson(path.join(dir, f));
    } catch {
      continue;
    }
    for (const k of [post.heroModel, ...(post.relatedModels ?? [])]) {
      if (k) keys.add(String(k));
    }
    // 本文に直接埋め込まれたリンクも拾う（relatedModels に無いことがある）
    for (const body of [post.body_ja, post.body_en]) {
      for (const m of String(body ?? '').matchAll(/\/(?:ja|en)\/watch\/([a-z0-9-]+)\/([a-zA-Z0-9.\-]+)\//g)) {
        keys.add(`${m[1]}/${m[2]}`);
      }
    }
  }
  return keys;
})();
console.log(`記事が参照するモデル: ${blogReferenced.size}件（最優先で価格を取得します）`);

let failures = 0;
let skippedForTime = 0;

/**
 * 記事が参照するモデルだけを集めた「1周目」を目録の先頭に足す。
 *
 * ブランドは目録の順に処理されるので、モデルの優先順位を上げるだけでは足りない。
 * 順番が後ろのブランドは時間切れで丸ごと飛ばされ、そこに記事の参照があっても
 * 手が届かなかった（実際、未収集19件のうち8件がIWCだった）。
 * ブランドをまたいで先に押さえる。
 */
const done = new Set();
const blogFirst = catalogs
  .map((c) => ({
    brand: c.brand,
    models: c.models.filter((m) => blogReferenced.has(`${c.brand.id}/${m.id}`)),
    blogPass: true,
  }))
  .filter((c) => c.models.length > 0);

for (const catalog of [...blogFirst, ...catalogs]) {
  const { brand, models, blogPass } = catalog;
  if (onlyBrand && brand.id !== onlyBrand) continue;

  // 記事が参照するモデル → 人気モデル → 価格未取得 → その他 の順に処理し、
  // 時間切れ時の取りこぼしを最小化する。
  //
  // 記事の参照を最優先にする理由:
  // 記事本文の商品写真は、そのモデルの価格データがあって初めて入る。
  // 価格が取れなかった日は記事から写真が消え、読者には「壊れている」ように見える。
  // 実際に7/22の記事で、参照先4件の価格が取れず図版が全部消えていた。
  // 人気印は付いていなくても、記事に出る以上は必ず押さえる。
  const queue = models
    .filter((m) => !done.has(`${brand.id}/${m.id}`)) // 1周目で済んだものは2周目で飛ばす
    .filter((m) => !missingOnly || !summary[`${brand.id}/${m.id}`])
    .map((m) => ({
      m,
      rank:
        (blogReferenced.has(`${brand.id}/${m.id}`) ? -4 : 0) +
        (m.popular ? 0 : 2) +
        (summary[`${brand.id}/${m.id}`] ? 1 : 0) +
        (m.source === 'auto' ? 1 : 0),
    }))
    .sort((a, b) => a.rank - b.rank)
    .map((x) => x.m)
    .slice(0, limit);

  if (queue.length === 0) continue;
  console.log(`\n=== ${brand.name_en} (${queue.length} models)${blogPass ? ' ※記事の参照' : ''} ===`);
  const brandDir = path.join(pricesDir, brand.id);
  fs.mkdirSync(brandDir, { recursive: true });

  let brandProcessed = 0;
  for (const model of queue) {
    if (Date.now() > deadline) {
      skippedForTime += queue.length - brandProcessed;
      break;
    }
    processed++;
    brandProcessed++;
    done.add(`${brand.id}/${model.id}`);
    // 片方のAPIが落ちてももう片方の結果は使う（楽天旧API廃止後にYahoo!まで道連れにしない）
    let rakuten = [];
    let yahoo = [];
    let errors = 0;
    try {
      rakuten = await fetchRakuten(model, brand);
    } catch (e) {
      errors++;
      console.warn(`  NG(楽天) ${model.id}: ${e.message}`);
    }
    await sleep(delayMs); // 楽天のレート制限(1req/秒)対応
    try {
      yahoo = await fetchYahoo(model, brand);
    } catch (e) {
      errors++;
      console.warn(`  NG(Yahoo) ${model.id}: ${e.message}`);
    }
    await sleep(2100); // Yahoo!のレート制限(30req/分)対応
    if (errors > 0) failures++;
    if (rakuten.length === 0 && yahoo.length === 0 && errors > 0) continue;
    const offers = cleanOffers([...rakuten, ...yahoo], model, brand);

    const key = `${brand.id}/${model.id}`;
    const priceFile = path.join(brandDir, `${model.id}.json`);

    // 0件のときは既存データを消さない。ブランド一括走査(build-auto-catalog)が
    // 型番一致で取得した価格の方が信頼できるため、それを上書きしてしまわないようにする。
    if (offers.length === 0) {
      console.log(`  -- ${model.id}: 該当出品なし${summary[key] ? '（既存の価格を維持）' : ''}`);
      if (!summary[key] && fs.existsSync(priceFile)) fs.rmSync(priceFile);
      continue;
    }

    const updatedAt = new Date().toISOString();
    fs.writeFileSync(priceFile, JSON.stringify({ updatedAt, offers }, null, 2), 'utf8');
    withOffers++;
    const lowestNew = offers.find((o) => o.condition === 'new');
    const lowestUsed = offers.find((o) => o.condition === 'used');
    summary[key] = {
      lowestPrice: offers[0].price,
      source: offers[0].source,
      shop: offers[0].shop,
      offerCount: offers.length,
      updatedAt,
      image: offers[0].image ?? null,
      // 楽天ウェブサービス規約 第8条4項: ウェブサービスを使用した部分から
      // 楽天以外へリンクしてはならない。カード上の写真と価格をこのURLへ向ける
      url: offers[0].url ?? null,
      lowestNew: lowestNew ? lowestNew.price : null,
      lowestUsed: lowestUsed ? lowestUsed.price : null,
    };
    console.log(`  OK ${model.id}: ${offers.length}件 / 最安 ¥${offers[0].price.toLocaleString('ja-JP')}`);
  }
}

fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2), 'utf8');
console.log(`\n完了: ${processed}モデル処理 / ${withOffers}モデルで価格取得 / エラー${failures}件`);
if (skippedForTime > 0) {
  console.log(`時間予算(${maxMinutes}分)に達したため${skippedForTime}モデルを次回に繰り越しました`);
}
console.log(`価格データ合計: ${Object.keys(summary).length}モデル`);
