#!/usr/bin/env node
/**
 * eBay の出品から「海外の参考価格」を集める。
 *
 * ── なぜ国内価格と混ぜないか ──────────────────────────────
 * eBayの表示価格をそのまま円に換算して国内の最安値と並べると嘘になる。
 * 海外から取り寄せれば国際送料・関税・輸入消費税が乗り、実際の支払いは
 * 1〜2割増える。だから「国内の最安値」とは別枠で、参考値として出す。
 *
 * ── 保存しないもの ────────────────────────────────────
 * eBayには Marketplace Account Deletion（利用者がアカウントを消したとき
 * その人のデータも消す）という決まりがあり、当サイトは
 * 「eBay利用者のデータを保持しない」と申告して免除を受けている。
 * 申告と実装が食い違えば罰則やアカウント停止の対象になる。
 *
 *   保存する : 商品名・価格・通貨・画像・商品ページURL
 *   保存しない: **出品者名・出品者ID・出品者評価**（利用者に紐づくため）
 *
 * 取得結果は data/prices/ に置く（gitignore済み）。リポジトリには残さない。
 *
 * ── 成果報酬 ────────────────────────────────────────
 * X-EBAY-C-ENDUSERCTX に EPN のキャンペーンIDを載せると、応答に
 * itemAffiliateWebUrl（成果が計上されるURL）が入る。これを使う。
 *
 * 必要な環境変数:
 *   EBAY_APP_ID      … App ID (Client ID)
 *   EBAY_CERT_ID     … Cert ID (Client Secret)
 * 任意:
 *   EBAY_CAMPAIGN_ID … EPNのキャンペーンID（無いと成果が付かない）
 *   EBAY_MARKETPLACE … 既定 EBAY_US
 *
 * 使い方:
 *   node scripts/fetch-ebay.mjs                    # 人気モデルと記事参照モデル
 *   node scripts/fetch-ebay.mjs --limit 200        # 件数の上限
 *   node scripts/fetch-ebay.mjs --max-minutes 20   # 時間の上限
 *   node scripts/fetch-ebay.mjs --dry-run          # 1件だけ試して中身を見る
 */
import fs from 'node:fs';
import path from 'node:path';
import { readJson } from './lib/json.mjs';
import { loadCatalogs } from './lib/catalog.mjs';

const ROOT = process.cwd();

// ---- .env 読み込み ----
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const APP_ID = process.env.EBAY_APP_ID || '';
const CERT_ID = process.env.EBAY_CERT_ID || '';
const CAMPAIGN = process.env.EBAY_CAMPAIGN_ID || '';
const MARKET = process.env.EBAY_MARKETPLACE || 'EBAY_US';

const args = process.argv.slice(2);
const argValue = (n) => (args.indexOf(n) >= 0 ? args[args.indexOf(n) + 1] : null);
const DRY = args.includes('--dry-run');
const LIMIT = Number(argValue('--limit')) || (DRY ? 1 : 600);
const MAX_MINUTES = Number(argValue('--max-minutes')) || 25;
const stopAt = Date.now() + MAX_MINUTES * 60_000;

if (!APP_ID || !CERT_ID) {
  console.log('EBAY_APP_ID / EBAY_CERT_ID が未設定のため、海外価格の取得を飛ばしました。');
  process.exit(0);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 認証。client_credentials なので利用者のログインは要らない */
let token = null;
async function auth() {
  if (token) return token;
  const basic = Buffer.from(`${APP_ID}:${CERT_ID}`).toString('base64');
  const res = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      scope: 'https://api.ebay.com/oauth/api_scope',
    }),
  });
  const j = await res.json();
  if (!res.ok || !j.access_token) {
    throw new Error(`認証に失敗しました (${res.status}) ${JSON.stringify(j).slice(0, 200)}`);
  }
  token = j.access_token;
  console.log(`認証しました（有効 ${Math.round((j.expires_in ?? 0) / 60)}分）`);
  return token;
}

/**
 * 型番で1モデル分を引く。
 * 型番はブランドをまたいで衝突しにくいので、そのまま検索語にできる。
 * 名前だけのモデル（型番の無いもの）は取り違えが怖いので対象にしない。
 */
async function search(brandEn, reference) {
  const t = await auth();
  const q = `${brandEn} ${reference}`.replace(/\s+/g, ' ').trim();
  const url =
    'https://api.ebay.com/buy/browse/v1/item_summary/search?' +
    new URLSearchParams({
      q,
      limit: '10',
      sort: 'price',
      // 腕時計の分類に限る（31387 = Wristwatches）。腕時計以外の雑貨を弾く
      category_ids: '31387',
      filter: 'buyingOptions:{FIXED_PRICE},itemLocationCountry:!JP',
    });

  const headers = {
    Authorization: `Bearer ${t}`,
    'X-EBAY-C-MARKETPLACE-ID': MARKET,
  };
  // 成果報酬のためのキャンペーンID。これがあると itemAffiliateWebUrl が返る
  if (CAMPAIGN) headers['X-EBAY-C-ENDUSERCTX'] = `affiliateCampaignId=${CAMPAIGN}`;

  const res = await fetch(url, { headers });
  if (res.status === 429) throw new Error('回数制限に達しました');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();

  const items = (j.itemSummaries ?? [])
    .map((it) => ({
      title: String(it.title ?? ''),
      price: Number(it.price?.value) || 0,
      currency: String(it.price?.currency ?? ''),
      image: it.image?.imageUrl ?? it.thumbnailImages?.[0]?.imageUrl ?? null,
      // 成果の付くURLがあればそちらを使う
      url: it.itemAffiliateWebUrl || it.itemWebUrl || '',
      country: it.itemLocation?.country ?? null,
      condition: /new/i.test(it.condition ?? '') ? 'new' : 'used',
      // ここで seller は意図的に読まない。免除の申告どおり保持しない
    }))
    .filter((x) => x.price > 0 && x.url);

  return items.sort((a, b) => a.price - b.price);
}

// ---- 対象モデルを決める ----
const catalogs = loadCatalogs(ROOT, { includeAuto: false }); // 人手カタログのみ
const blogReferenced = (() => {
  const keys = new Set();
  const dir = path.join(ROOT, 'data', 'blog');
  if (!fs.existsSync(dir)) return keys;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    let p;
    try {
      p = readJson(path.join(dir, f));
    } catch {
      continue;
    }
    if (p.heroModel) keys.add(String(p.heroModel));
    for (const k of p.relatedModels ?? []) keys.add(String(k));
  }
  return keys;
})();

const targets = [];
for (const c of catalogs) {
  for (const m of c.models ?? []) {
    if (!m.reference) continue; // 型番の無いモデルは取り違えるので対象外
    const key = `${c.brand.id}/${m.id}`;
    targets.push({
      key,
      brandEn: c.brand.name_en,
      reference: m.reference,
      // 記事に出るもの → 人気 → その他 の順に取る
      rank: (blogReferenced.has(key) ? -2 : 0) + (m.popular ? 0 : 1),
    });
  }
}
targets.sort((a, b) => a.rank - b.rank);
const queue = targets.slice(0, LIMIT);
console.log(`型番のあるモデル ${targets.length}件 のうち ${queue.length}件を調べます`);

// ---- 取得 ----
const out = {};
let ok = 0;
let ng = 0;
let skipped = 0;
for (const t of queue) {
  if (Date.now() > stopAt) {
    skipped = queue.length - ok - ng;
    break;
  }
  let items;
  try {
    items = await search(t.brandEn, t.reference);
  } catch (e) {
    ng++;
    console.log(`  NG ${t.key}: ${e.message}`);
    if (/回数制限/.test(e.message)) break; // 叩き続けない
    await sleep(500);
    continue;
  }
  if (items.length === 0) {
    await sleep(120);
    continue;
  }
  const best = items[0];
  out[t.key] = {
    price: best.price,
    currency: best.currency,
    url: best.url,
    image: best.image,
    condition: best.condition,
    country: best.country,
    offerCount: items.length,
    updatedAt: new Date().toISOString(),
  };
  ok++;
  if (DRY) {
    console.log(JSON.stringify({ [t.key]: out[t.key] }, null, 2));
    break;
  }
  await sleep(120); // 1日5,000回まで。急がない
}

if (DRY) process.exit(0);

const outFile = path.join(ROOT, 'data/prices/ebay-summary.json');
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(out, null, 2), 'utf8');
console.log(`\n海外価格: ${ok}モデル / 見つからず ${queue.length - ok - ng - skipped}件 / エラー ${ng}件`);
if (skipped > 0) console.log(`時間の上限(${MAX_MINUTES}分)により ${skipped}件を次回に繰り越しました`);
console.log(`→ ${path.relative(ROOT, outFile)}`);
if (!CAMPAIGN) {
  console.log('::warning::EBAY_CAMPAIGN_ID が未設定です。リンクに成果が計上されません。');
}
