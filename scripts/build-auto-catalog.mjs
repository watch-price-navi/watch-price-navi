#!/usr/bin/env node
/**
 * 出品データからカタログと価格を同時に生成する（掲載数を数千規模に伸ばすための中核）。
 *
 * 楽天・Yahoo!の腕時計カテゴリをブランドごとに価格帯で分割して網羅的に走査し、
 * 商品タイトルから型番を抽出・名寄せする。1回の走査で
 *   (a) data/brands-auto/<brand>.json … 未収録型番のカタログ
 *   (b) data/prices/<brand>/<model>.json … 人手カタログ分も含む価格データ
 * の両方を作るため、モデル数が増えても実行時間がほとんど伸びない。
 *
 * 実際に売られている品だけが対象になるため、生産終了品・ヴィンテージも中古出品として自然に含まれる。
 * 人手で作った data/brands/ の情報が常に優先され、自動生成分はそれを補完する。
 *
 * 使い方:
 *   node scripts/build-auto-catalog.mjs                     # 全ブランド
 *   node scripts/build-auto-catalog.mjs --brand rolex       # 1ブランド
 *   node scripts/build-auto-catalog.mjs --min-listings 3    # 採用に必要な最低出品数(既定2)
 *   node scripts/build-auto-catalog.mjs --max-per-brand 800 # 1ブランドの上限(既定600)
 *   node scripts/build-auto-catalog.mjs --no-prices         # 価格ファイルを書かない
 */

import fs from 'node:fs';
import path from 'node:path';
import { readJson } from './lib/json.mjs';

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
/** 新システムが要求する Origin。アプリ登録時の「許可サイト」と一致させること */
const RAKUTEN_ORIGIN =
  process.env.RAKUTEN_ORIGIN || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
// CI では未登録の Variables が空文字で渡るため、?? ではなく || で既定値に倒す
const RAKUTEN_GENRE_ID = (process.env.RAKUTEN_GENRE_ID ?? '').trim() || '558929';
const RAKUTEN_AFFILIATE_ID = process.env.RAKUTEN_AFFILIATE_ID || '';
const YAHOO_APP_ID = process.env.YAHOO_APP_ID || '';
const VC_SID = process.env.VC_SID || '';
const VC_PID = process.env.VC_PID || '';

const args = process.argv.slice(2);
const argValue = (n) => (args.indexOf(n) >= 0 ? args[args.indexOf(n) + 1] : null);
const onlyBrand = argValue('--brand');
// 出品1件でも実在する型番なので採用する（掲載網羅を優先）。
// 誤検出はREF_RE/NOISE/NG_WORDSの各フィルタ側で抑える。
const MIN_LISTINGS = Number(argValue('--min-listings')) || 1;
const MAX_PER_BRAND = Number(argValue('--max-per-brand')) || 3000;
const PAGES_PER_BAND = Number(argValue('--pages')) || 4;   // 楽天(1req/秒)
const YAHOO_PAGES = Number(argValue('--yahoo-pages')) || 3; // Yahoo!(30req/分)
const WRITE_PRICES = !args.includes('--no-prices');
// コレクション名でも走査して、ブランド名だけでは埋もれる出品を拾う
const USE_COLLECTIONS = !args.includes('--no-collections');
// 1ブランドあたりの追加キーワード上限。増やすほど網羅率は上がるが実行時間も伸びる
const MAX_KEYWORDS = Number(argValue('--max-keywords')) || 30;
// キーワード検索を何頁辿るか（楽天）
const KEYWORD_PAGES = Number(argValue('--keyword-pages')) || 4;

if (!RAKUTEN_APP_ID && !YAHOO_APP_ID) {
  console.log('APIキーが未設定のため自動カタログ生成をスキップしました。');
  console.log('.env または GitHub Secrets に RAKUTEN_APP_ID / YAHOO_APP_ID を設定してください。');
  process.exit(0);
}

// 楽天公式告知(2026-04-10)により旧エンドポイントは2026-08-17に完全廃止
if (RAKUTEN_APP_ID && !RAKUTEN_ACCESS_KEY) {
  const deadline = Date.parse('2026-08-17T00:00:00+09:00');
  console.warn(
    Date.now() >= deadline
      ? '\n[停止] 楽天の旧APIは2026-08-17に廃止されました。RAKUTEN_ACCESS_KEY を設定してください。\n'
      : `\n[警告] RAKUTEN_ACCESS_KEY が未設定です。旧APIはあと${Math.ceil((deadline - Date.now()) / 86_400_000)}日で廃止されます。\n`
  );
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url, attempt = 0, extraHeaders = {}) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'watch-price-navi/1.0', ...extraHeaders },
  });
  if (res.status === 429 && attempt < 3) {
    await sleep(8000 * (attempt + 1));
    return fetchJson(url, attempt + 1, extraHeaders);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ---------- タイトル解析 ----------

// 型番候補: 数字を2つ以上含む英数字列（ハイフン・ドット・スラッシュ可）
const REF_RE = /\b(?=[A-Z0-9][A-Z0-9.\-/]{3,19}\b)(?=(?:[^0-9]*[0-9]){2,})[A-Z0-9][A-Z0-9.\-/]{3,19}\b/gi;

// 型番と紛らわしいもの
const NOISE_EXACT = new Set([
  'ATM', 'BAR', 'GMT', 'USED', 'NEW', 'SS', 'YG', 'PG', 'WG', 'PT', 'AT', 'QZ',
  'P10', 'P20', 'P5', 'A4', 'B5', 'CM', 'MM', 'ML', 'KG', 'JAN', 'ISBN', 'EMS',
  // 素材・貴金属の品位表記（型番と紛らわしく出品タイトルに頻出する）
  '316L', '904L', 'PT950', 'PT900', 'PT850', 'AU750', 'AG925', '925', '750', '585',
]);
const NOISE_RE = /^(?:(?:1[89][0-9]{2}|20[0-4][0-9])(?:SS|AW|FW)?|[0-9]{1,4}(?:MM|CM|G|KG|ML|M|%|％|周年|気圧|万円|円|点|個|本|枚|年|月|日|時間|色)|[0-9]{1,2}[-/][0-9]{1,2}|NO[0-9]+|P[0-9]{1,3}|[0-9]+ATM|[0-9]+BAR|[0-9]{8,})$/i;

// キャリバー(ムーブメント)番号は型番ではない。
// CAL.2080 だけでなく CAL.K2001 / CAL.HUB4100 / CAL.L.633.1 のように
// 接頭辞のあとに英字が来る表記も弾く
const CALIBER_RE = /^(?:CAL|CALIBER|CALIBRE|MOVEMENT|MVT)[.\-_/]/i;
// 貴金属の品位表記。750YG(18金) や 925SV など、型番と紛らわしい
const PURITY_RE = /^(?:750|585|375|900|950|925|999)(?:YG|PG|RG|WG|SV|PT|GP)?$/i;

function extractRefs(title) {
  const out = new Set();
  for (const raw of title.match(REF_RE) ?? []) {
    const s = raw.toUpperCase().replace(/[.,]$/, '');
    if (NOISE_EXACT.has(s) || NOISE_RE.test(s)) continue;
    if (CALIBER_RE.test(s) || PURITY_RE.test(s)) continue;
    if (!/[0-9]/.test(s)) continue;
    // 腕時計の型番は通常4桁以上の数字を含む。3桁以下は価格・寸法・金位である場合が多い
    if (s.replace(/[^0-9]/g, '').length < 4) continue;
    out.add(s);
  }
  return [...out];
}

const normRef = (r) => r.toUpperCase().replace(/[.\-/\s]/g, '');

// タイトルからモデル名らしいカタカナ列を拾う
const NAME_STOP = new Set([
  'メンズ', 'レディース', 'ユニセックス', 'ウォッチ', 'ウオッチ', 'モデル', 'ブランド',
  'プレゼント', 'ギフト', 'ラッピング', 'クーポン', 'ポイント', 'セール', 'アウトレット',
  'ケース', 'ベルト', 'バンド', 'ブレス', 'ブレスレット', 'ストラップ', 'バックル',
  'シルバー', 'ゴールド', 'ブラック', 'ホワイト', 'ブルー', 'グリーン', 'ピンク', 'シャンパン',
  'ステンレス', 'チタン', 'セラミック', 'カーボン', 'サファイア', 'クリスタル', 'ガラス',
  'オートマチック', 'クオーツ', 'クォーツ', 'ソーラー', 'ムーブメント', 'キャリバー',
  'ダイヤル', 'ダイアル', 'インデックス', 'ベゼル', 'リューズ', 'カレンダー',
  'コピー', 'レプリカ', 'タイプ', 'サイズ', 'カラー', 'デザイン', 'ショップ', 'ストア',
  'ランキング', 'キャンペーン', 'スーパー', 'ネット', 'オンライン', 'ロング', 'ショート',
]);

// 「ラバーウォッチバンド」のような連結語は完全一致では弾けないので部分一致でも見る
const NAME_STOP_PART = /バンド|ベルト|ストラップ|ブレスレット|バックル|尾錠|ケース|ボックス|カバー|フィルム|工具|クリーナー|スタンド|ワインダー/;

function extractNameTokens(title, brandJa, brandEn) {
  const cleaned = title
    .replace(new RegExp(brandJa, 'gi'), ' ')
    .replace(new RegExp(brandEn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), ' ')
    .replace(/[【】\[\]（）()｜|/／・,、。!！?？"'’”“]/g, ' ');
  const tokens = [];
  for (const kata of cleaned.match(/[ァ-ヴー]{3,12}/g) ?? []) {
    if (NAME_STOP.has(kata) || NAME_STOP_PART.test(kata)) continue;
    tokens.push(kata);
  }
  return tokens;
}

function inferCaseSize(title) {
  const m = title.match(/(\d{2}(?:\.\d)?)\s*(?:mm|ミリ|ｍｍ)/i);
  if (!m) return null;
  const v = Number(m[1]);
  return v >= 20 && v <= 55 ? v : null;
}

function inferWr(title) {
  const atm = title.match(/(\d{1,2})\s*(?:気圧|ATM|BAR)/i);
  if (atm) return Number(atm[1]) * 10;
  const m = title.match(/(\d{2,4})\s*m\s*防水/i);
  if (m) {
    const v = Number(m[1]);
    return v >= 30 && v <= 2000 ? v : null;
  }
  return null;
}

function inferMovement(title) {
  if (/スプリングドライブ|SPRING\s*DRIVE/i.test(title)) return 'spring-drive';
  if (/ソーラー|エコドライブ|ECO-?DRIVE|光発電|タフソーラー/i.test(title)) return 'solar';
  if (/自動巻|オートマチック|AUTOMATIC/i.test(title)) return 'automatic';
  if (/手巻き|手巻|マニュアル|HAND[- ]?WIND/i.test(title)) return 'manual';
  if (/クオーツ|クォーツ|QUARTZ|電池式/i.test(title)) return 'quartz';
  if (/キネティック|KINETIC/i.test(title)) return 'kinetic';
  return null;
}

function inferMaterial(title) {
  if (/カーボン|CARBON|フォージド/i.test(title)) return 'carbon';
  if (/チタン|チタニウム|TITANIUM/i.test(title)) return 'titanium';
  if (/セラミック|セラミカ|CERAMIC/i.test(title)) return 'ceramic';
  if (/ブロンズ|BRONZE/i.test(title)) return 'bronze';
  if (/プラチナ|PLATINUM|PT9[05]0/i.test(title)) return 'platinum';
  if (/コンビ|two-?tone|SS[×xX]YG|SS[×xX]PG/i.test(title)) return 'two-tone';
  if (/イエローゴールド|YG無垢|K18YG/i.test(title)) return 'yellow-gold';
  if (/ローズゴールド|ピンクゴールド|PG無垢|K18PG/i.test(title)) return 'rose-gold';
  if (/ホワイトゴールド|WG無垢|K18WG/i.test(title)) return 'white-gold';
  if (/樹脂|レジン|RESIN|ウレタン/i.test(title)) return 'resin';
  if (/ステンレス|STAINLESS|SS製/i.test(title)) return 'stainless-steel';
  return null;
}

function inferGender(title) {
  const l = /レディース|LADIES|WOMEN|ウィメンズ|婦人/i.test(title);
  const m = /メンズ|MENS|MEN'?S|紳士/i.test(title);
  if (l && !m) return 'ladies';
  if (m && !l) return 'mens';
  return 'unisex';
}

function inferTags(title, movement, material) {
  const tags = new Set();
  if (/ダイバー|DIVER|潜水|200m|300m|600m/i.test(title)) tags.add('diver');
  if (/クロノグラフ|CHRONOGRAPH|クロノ/i.test(title)) tags.add('chronograph');
  if (/GMT|デュアルタイム|2タイム/i.test(title)) tags.add('gmt');
  if (/ワールドタイム|WORLD\s*TIME/i.test(title)) tags.add('world-timer');
  if (/パイロット|フリーガー|アビエ|PILOT|AVIAT/i.test(title)) tags.add('pilot');
  if (/ムーンフェイズ|MOON\s*PHASE|月齢/i.test(title)) tags.add('moonphase');
  if (/トゥールビヨン|TOURBILLON/i.test(title)) tags.add('tourbillon');
  if (/パーペチュアルカレンダー|永久カレンダー|PERPETUAL\s*CALENDAR/i.test(title)) tags.add('perpetual-calendar');
  if (/スケルトン|SKELETON|オープンハート/i.test(title)) tags.add('skeleton');
  if (/電波|RADIO|マルチバンド/i.test(title)) tags.add('radio-controlled');
  if (/GPS|衛星|SATELLITE/i.test(title)) tags.add('gps');
  if (/デジタル|DIGITAL|液晶/i.test(title)) tags.add('digital');
  if (/ミリタリー|MILITARY|軍用/i.test(title)) tags.add('military');
  if (/レーシング|RACING|モータースポーツ/i.test(title)) tags.add('racing');
  if (/限定|LIMITED|本限定/i.test(title)) tags.add('limited-edition');
  if (/復刻|REISSUE|ヘリテージ|HERITAGE/i.test(title)) tags.add('vintage-reissue');
  if (/パワーリザーブ|POWER\s*RESERVE/i.test(title)) tags.add('power-reserve');
  if (/スモールセコンド|スモセコ|SMALL\s*SECOND/i.test(title)) tags.add('small-seconds');
  if (material === 'titanium' || material === 'carbon' || material === 'resin') tags.add('lightweight');
  // ソーラーはタグではなくムーブメント区分(taxonomy.movements)で表現する
  if (tags.size === 0) tags.add('sport');
  return [...tags];
}

function detectCondition(title) {
  if (/中古|USED|ユーズド|美品/i.test(title)) return 'used';
  if (/未使用|新品/.test(title)) return 'new';
  return 'unknown';
}

// 出品群から掲載用のオファー一覧を作る（同一ショップは最安1件、安い順に最大12件）
function buildOffers(items, floor) {
  const byShop = new Map();
  for (const o of items.filter((o) => o.price >= floor && o.url && o.shop).sort((a, b) => a.price - b.price)) {
    const key = `${o.source}:${o.shop}`;
    if (!byShop.has(key)) {
      byShop.set(key, {
        source: o.source,
        title: o.title,
        price: o.price,
        url: o.url,
        shop: o.shop,
        image: o.image,
        condition: o.condition,
      });
    }
  }
  return [...byShop.values()].sort((a, b) => a.price - b.price).slice(0, 12);
}

// 本体ではない出品を弾く
const NG_WORDS = [
  'ベルト単品', 'バンド単品', 'ストラップ単品', 'コマ', '尾錠', 'バックル単品',
  '風防', 'パーツ', '部品', 'ケースのみ', '箱のみ', '空箱', '説明書', '冊子',
  '互換', '社外', '汎用', 'ノベルティ', '置時計', '掛け時計', 'クロック',
  '修理', 'オーバーホール', '電池交換', '磨き', '保護フィルム', 'カバー',
  'ジャンク', '部品取り', 'コピー品', 'レプリカ',
  // 交換用の部材。本体と誤認すると「デイトナ ¥14,960」のような表示になる
  'ウォッチバンド', 'ラバーバンド', 'レザーバンド', 'ラバーベルト', 'レザーベルト',
  'メタルバンド', '交換用', '交換ベルト', '替えベルト', 'ウォッチケース',
  'コレクションケース', '収納ケース', 'ワインディングマシーン', 'ワインダー',
];

// ---------- API 走査 ----------

// 価格帯を分割して走査し、1クエリあたりの取得上限を回避する。
// 帯を細かくするほど「同じ検索の続き」を深く辿れるので取りこぼしが減るが、
// レート制限がそのまま実行時間になる。楽天は1req/秒、Yahoo!は30req/分（=2秒）と
// 倍近く違うため、深さを揃えず**楽天を厚く・Yahoo!を薄く**配分する。
// 楽天はアフィリエイト収益の主戦場でもあるので、こちらを優先するのが合理的。
const RAKUTEN_BANDS = [
  [10000, 20000], [20000, 30000], [30000, 45000], [45000, 60000],
  [60000, 80000], [80000, 100000], [100000, 140000], [140000, 200000],
  [200000, 280000], [280000, 400000], [400000, 550000], [550000, 700000],
  [700000, 900000], [900000, 1200000], [1200000, 1700000], [1700000, 2500000],
  [2500000, 4000000], [4000000, 6000000], [6000000, 12000000], [12000000, 100000000],
];
const YAHOO_BANDS = [
  [10000, 30000], [30000, 60000], [60000, 100000], [100000, 200000],
  [200000, 400000], [400000, 700000], [700000, 1200000],
  [1200000, 2500000], [2500000, 6000000], [6000000, 100000000],
];

// コレクション名での検索は母数が小さいので価格帯で割らず、ページを辿るだけでよい
const NO_BANDS = [[10000, 100000000]];

async function sweepRakuten(brand, out, keyword = brand.name_ja, bands = RAKUTEN_BANDS, pages = PAGES_PER_BAND) {
  if (!RAKUTEN_APP_ID) return;
  let endpoint = 'https://app.rakuten.co.jp/services/api/IchibaItem/Search/20220601';
  for (const [min, max] of bands) {
    for (let page = 1; page <= pages; page++) {
      const params = new URLSearchParams({
        format: 'json',
        applicationId: RAKUTEN_APP_ID,
        keyword,
        hits: '30',
        page: String(page),
        minPrice: String(min),
        maxPrice: String(max),
        sort: 'standard',
      });
      if (RAKUTEN_GENRE_ID && RAKUTEN_GENRE_ID !== 'off') params.set('genreId', RAKUTEN_GENRE_ID);
      if (RAKUTEN_AFFILIATE_ID) params.set('affiliateId', RAKUTEN_AFFILIATE_ID);
      const headers = {};
      if (RAKUTEN_ACCESS_KEY) {
        endpoint = 'https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701';
        params.set('accessKey', RAKUTEN_ACCESS_KEY);
        // 新システムはアプリ登録時の「許可サイト」と一致する Origin ヘッダを要求する
        headers.Origin = RAKUTEN_ORIGIN;
      }
      let data;
      try {
        data = await fetchJson(`${endpoint}?${params}`, 0, headers);
      } catch {
        break;
      }
      const items = data.Items ?? [];
      for (const { Item } of items) {
        const title = Item.itemName ?? '';
        out.push({
          source: 'rakuten',
          title,
          price: Number(Item.itemPrice) || 0,
          url: Item.affiliateUrl || Item.itemUrl || '',
          shop: Item.shopName ?? '',
          image: Item.mediumImageUrls?.[0]?.imageUrl?.replace(/\?_ex=\d+x\d+$/, '') ?? null,
          condition: detectCondition(title),
        });
      }
      await sleep(1100); // 楽天: 1req/秒
      if (items.length < 30) break; // この価格帯は取り切った
    }
  }
}

async function sweepYahoo(brand, out, keyword = brand.name_ja, bands = YAHOO_BANDS, pages = YAHOO_PAGES) {
  if (!YAHOO_APP_ID) return;
  const lastStart = 1 + (pages - 1) * 30;
  for (const [min, max] of bands) {
    for (let start = 1; start <= lastStart; start += 30) {
      const params = new URLSearchParams({
        appid: YAHOO_APP_ID,
        query: keyword,
        results: '30',
        start: String(start),
        price_from: String(min),
        price_to: String(max),
      });
      if (VC_SID && VC_PID) {
        params.set('affiliate_type', 'vc');
        params.set('affiliate_id', `http://ck.jp.ap.valuecommerce.com/servlet/referral?sid=${VC_SID}&pid=${VC_PID}&vc_url=`);
      }
      let data;
      try {
        data = await fetchJson(`https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch?${params}`);
      } catch {
        break;
      }
      const hits = data.hits ?? [];
      for (const h of hits) {
        const title = h.name ?? '';
        out.push({
          source: 'yahoo',
          title,
          price: Number(h.price) || 0,
          url: h.url ?? '',
          shop: h.seller?.name ?? '',
          image: h.image?.medium ?? null,
          condition: h.condition === 'used' ? 'used' : h.condition === 'new' ? 'new' : detectCondition(title),
        });
      }
      await sleep(2100); // Yahoo!: 30req/分
      if (hits.length < 30) break;
    }
  }
}

// ---------- メイン ----------

const brandsDir = path.join(ROOT, 'data', 'brands');
const autoDir = path.join(ROOT, 'data', 'brands-auto');
const pricesDir = path.join(ROOT, 'data', 'prices');
fs.mkdirSync(autoDir, { recursive: true });
if (WRITE_PRICES) fs.mkdirSync(pricesDir, { recursive: true });

const summaryFile = path.join(pricesDir, 'summary.json');
let summary = {};
if (fs.existsSync(summaryFile)) {
  try { summary = readJson(summaryFile); } catch { summary = {}; }
}

function writePrices(brandId, modelId, offers) {
  if (!WRITE_PRICES) return false;
  const key = `${brandId}/${modelId}`;
  const updatedAt = new Date().toISOString();
  if (offers.length === 0) return false;
  const dir = path.join(pricesDir, brandId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${modelId}.json`), JSON.stringify({ updatedAt, offers }, null, 2), 'utf8');
  const lowestNew = offers.find((o) => o.condition === 'new');
  const lowestUsed = offers.find((o) => o.condition === 'used');
  summary[key] = {
    lowestPrice: offers[0].price,
    source: offers[0].source,
    shop: offers[0].shop,
    offerCount: offers.length,
    updatedAt,
    image: offers[0].image ?? null,
    lowestNew: lowestNew ? lowestNew.price : null,
    lowestUsed: lowestUsed ? lowestUsed.price : null,
  };
  return true;
}

const catalogs = fs
  .readdirSync(brandsDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => {
    try { return readJson(path.join(brandsDir, f)); } catch { return null; }
  })
  .filter(Boolean);

/**
 * data/sweep-keywords/<brandId>.json があれば、その keywords を追加の検索語として使う。
 * 別途生成しておくファイルなので、無くても動く。
 */
const keywordsDir = path.join(ROOT, 'data', 'sweep-keywords');
function loadExtraKeywords(brandId) {
  const file = path.join(keywordsDir, `${brandId}.json`);
  if (!fs.existsSync(file)) return { keywords: [], prefixes: [] };
  try {
    const d = readJson(file);
    return {
      keywords: (d.keywords ?? []).filter((k) => typeof k === 'string' && k.trim()),
      prefixes: (d.refPrefixes ?? []).filter((k) => typeof k === 'string' && k.trim()),
    };
  } catch {
    return { keywords: [], prefixes: [] };
  }
}

/**
 * 走査に使うキーワードを、収穫の多い順に並べて返す。
 *
 * 型番の接頭辞（「オメガ 233.」など）が最も効く。実測で 233.系は313件に絞り込まれ、
 * その2頁目に目的の型番があった。一方ブランド名やコレクション名だけの検索では
 * 人気商品に埋もれて到達できない。上限で打ち切られても接頭辞が残るよう先頭に置く。
 */
function buildKeywords(cat) {
  const brandJa = cat.brand.name_ja;
  const { keywords: extra, prefixes } = loadExtraKeywords(cat.brand.id);
  const isPrefixLike = (k) => /[0-9]\.$/.test(k) || /\s[A-Z]{2,4}$/.test(k) || prefixes.some((p) => k.endsWith(p));

  const ordered = [];
  const seen = new Set();
  const push = (k) => {
    const s = k.trim();
    if (s && !seen.has(s)) { seen.add(s); ordered.push(s); }
  };

  for (const p of prefixes) push(`${brandJa} ${p}`);   // 型番接頭辞（最優先）
  for (const k of extra) if (isPrefixLike(k)) push(k);
  for (const m of cat.models) if (m.collection_ja) push(`${brandJa} ${m.collection_ja}`);
  for (const k of extra) push(k);                       // 残り（別表記・英語名など）
  return ordered.slice(0, MAX_KEYWORDS);
}

let grandTotal = 0;
let curatedPriced = 0;

for (const cat of catalogs) {
  const brand = cat.brand;
  if (onlyBrand && brand.id !== onlyBrand) continue;

  // 人手カタログの型番 → モデル の対応表（走査結果から価格を割り当てるのに使う）
  const curatedByRef = new Map();
  for (const m of cat.models) if (m.reference) curatedByRef.set(normRef(m.reference), m);

  process.stdout.write(`\n${brand.name_ja} を走査中… `);
  const listings = [];
  await sweepRakuten(brand, listings);
  await sweepYahoo(brand, listings);
  const afterBrand = listings.length;

  // ブランド名だけの検索は人気商品に埋もれて裾野を取りこぼす。
  // コレクション名（+外部で用意したキーワード）でも引き、掲載網羅率を上げる。
  if (USE_COLLECTIONS) {
    const list = buildKeywords(cat);
    if (list.length) {
      process.stdout.write(`出品${afterBrand}件 → ${list.length}語で追加走査… `);
      for (const kw of list) {
        // キーワード検索は母数が絞れているので楽天を深く辿る（実測で2頁目に目的の型番があった）。
        // Yahoo!は同じ検索での件数が少なく、かつ1件2秒かかるので1頁に留める。
        await sweepRakuten(brand, listings, kw, NO_BANDS, KEYWORD_PAGES);
        await sweepYahoo(brand, listings, kw, NO_BANDS, 1);
      }
    }
  }
  process.stdout.write(`出品${listings.length}件 → `);

  // 型番ごとに集約
  const groups = new Map();
  const curatedHits = new Map(); // 人手カタログのモデルに対応する出品
  for (const it of listings) {
    const title = it.title;
    if (!title) continue;
    if (NG_WORDS.some((w) => title.includes(w))) continue;
    if (!title.includes(brand.name_ja) && !title.toUpperCase().includes(brand.name_en.toUpperCase())) continue;

    for (const ref of extractRefs(title)) {
      const key = normRef(ref);

      // 人手カタログに載っている型番なら、そのモデルの価格として記録する
      const curatedModel = curatedByRef.get(key);
      if (curatedModel) {
        if (!curatedHits.has(curatedModel.id)) curatedHits.set(curatedModel.id, []);
        curatedHits.get(curatedModel.id).push(it);
        continue;
      }

      let g = groups.get(key);
      if (!g) {
        g = { ref, count: 0, prices: [], titles: [], items: [], image: null, nameTokens: new Map() };
        groups.set(key, g);
      }
      g.count++;
      if (it.price > 0) g.prices.push(it.price);
      if (g.titles.length < 12) g.titles.push(title);
      g.items.push(it);
      if (!g.image && it.image) g.image = it.image;
      for (const tk of extractNameTokens(title, brand.name_ja, brand.name_en)) {
        g.nameTokens.set(tk, (g.nameTokens.get(tk) ?? 0) + 1);
      }
      // 表記が最も一般的な形を型番の正式表記として採用
      if (ref.length > g.ref.length) g.ref = ref;
    }
  }

  // 人手カタログのモデルに価格を書き込む
  for (const [modelId, items] of curatedHits) {
    const model = cat.models.find((m) => m.id === modelId);
    if (!model) continue;
    if (writePrices(brand.id, modelId, buildOffers(items, model.priceFloorJpy))) curatedPriced++;
  }

  const models = [];
  const usedIds = new Set(cat.models.map((m) => m.id));

  for (const [groupKey, g] of [...groups.entries()].sort((a, b) => b[1].count - a[1].count)) {
    if (g.count < MIN_LISTINGS) continue;
    if (models.length >= MAX_PER_BRAND) break;
    if (g.prices.length === 0) continue;

    const sorted = [...g.prices].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const min = sorted[0];
    // 極端に安い出品（付属品等）を除くため、中央値の3割と実測最安の高い方を下限にする
    const floor = Math.max(Math.floor(median * 0.3), Math.floor(min * 0.85), 3000);

    const joined = g.titles.join(' ');
    const movement = inferMovement(joined);
    const material = inferMaterial(joined);

    // 出現頻度の高いカタカナ語をモデル名にする
    const nameParts = [...g.nameTokens.entries()]
      .filter(([, n]) => n >= Math.max(2, Math.ceil(g.count * 0.3)))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([tk]) => tk);
    const nameJa = nameParts.length ? nameParts.join(' ') : g.ref;

    // IDは正規化した型番(グループのキー)から決定的に生成する。
    // その日の出品タイトルに左右されないため、毎日の再走査でページURLが変わらない。
    let id = `ref-${groupKey.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    if (usedIds.has(id)) id = `${id}-x`;
    usedIds.add(id);

    models.push({
      id,
      name_en: nameParts.length ? `${g.ref}` : g.ref,
      name_ja: nameJa === g.ref ? g.ref : `${nameJa} ${g.ref}`,
      reference: g.ref,
      collection_en: null,
      collection_ja: null,
      caseSizeMm: inferCaseSize(joined),
      movementType: movement,
      caliber: null,
      listPriceJpy: null,
      priceFloorJpy: floor,
      searchKeywordJa: `${brand.name_ja} ${g.ref}`,
      searchKeywordEn: `${brand.name_en} ${g.ref}`,
      caseMaterial: material,
      waterResistanceM: inferWr(joined),
      gender: inferGender(joined),
      releaseYear: null,
      tags: inferTags(joined, movement, material),
      popular: false,
      summary_ja: `${brand.name_ja}の型番${g.ref}。市場で${g.count}件の出品が確認された、実際に流通しているモデルです。`,
      summary_en: `${brand.name_en} reference ${g.ref}, currently offered by multiple sellers in Japan.`,
      source: 'auto',
      listingCount: g.count,
      // 出品タイトル原文は保存しない（楽天API規約の「取得データの恒久保存・再配布禁止」対応）
    });

    // 同じ走査結果からこのモデルの価格も書き出す（追加のAPI呼び出しは不要）
    writePrices(brand.id, id, buildOffers(g.items, floor));
  }

  const autoFile = path.join(autoDir, `${brand.id}.json`);
  if (models.length === 0 && fs.existsSync(autoFile)) {
    // API障害等で走査が空振りした日は上書きしない（公開済みの自動モデルページを消さないため）
    console.log('走査結果が空のため既存の自動カタログを維持');
  } else {
    fs.writeFileSync(
      autoFile,
      JSON.stringify(
        {
          brandId: brand.id,
          generatedAt: new Date().toISOString(),
          note: '出品データから自動生成されたモデル。data/brands/ の人手カタログを補完します。',
          models,
        },
        null,
        2
      ),
      'utf8'
    );
    console.log(`${models.length}モデルを自動生成`);
  }

  grandTotal += models.length;
}

if (WRITE_PRICES) {
  fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2), 'utf8');
}

console.log(`\n自動カタログ: ${grandTotal}モデル（data/brands-auto/）`);
console.log(`人手カタログのうち価格が付いたモデル: ${curatedPriced}件`);
console.log(`価格データ合計: ${Object.keys(summary).length}モデル`);
