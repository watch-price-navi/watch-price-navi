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
import { wrapYahoo } from './lib/affiliate.mjs';
import {
  brandNameStandsAlone,
  isJunkOffer,
  isJunkRef,
  isManagementRef,
  otherBrandComesFirst,
  stripColorPrefix,
  stripRefPrefix,
} from './lib/junk.mjs';

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

const args = process.argv.slice(2);
const argValue = (n) => (args.indexOf(n) >= 0 ? args[args.indexOf(n) + 1] : null);
const onlyBrand = argValue('--brand');
// 出品1件でも実在する型番なので採用する（掲載網羅を優先）。
// 誤検出は REF_RE / NOISE / scripts/lib/junk.mjs の各フィルタで抑える。
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
/**
 * 時間の上限。0 なら無制限。
 *
 * GitHub Actions の1回の実行は6時間で強制終了される。走査を深くすると
 * そこに当たりかねず、当たれば公開まで到達せずサイトが一日古いままになる。
 * 深さは「上限に当たらない範囲で」上げるものなので、上限そのものを持たせる。
 *
 * 打ち切ると目録の後ろのブランドがその日だけ走査されない。ページが日替わりで
 * 現れたり消えたりするのは検索評価に悪いので、これは非常口であって
 * 常用するものではない。当たったら警告を出し、深さを見直すこと。
 */
const MAX_MINUTES = Number(argValue('--max-minutes')) || 0;
const stopAt = MAX_MINUTES ? Date.now() + MAX_MINUTES * 60_000 : Infinity;
const outOfTime = () => Date.now() > stopAt;

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

// ベルトの取付幅。「18MM」単独は NOISE_RE で弾けるが、ベルトの出品は
// 対応サイズを並べて書くため「18MM/19MM/20MM/21MM/」「19-16MM」の形になり、
// 数字が4桁以上あるので型番として通過してしまっていた。
const SIZE_LIST_RE = /^[0-9]{1,2}(?:MM|CM)?(?:[-/][0-9]{1,2}(?:MM|CM)?)*\/?$/i;
// 型番に寸法単位が入ることはない。25X25CM のような表記もここで落ちる
const HAS_UNIT_RE = /[0-9]\s*(?:MM|CM)\b/i;
// ムーブメントの品番。CAL. の接頭辞が無い書き方（ST1901＝シーガル、NH35＝セイコー等）は
// CALIBER_RE をすり抜けるため、製造元の記号で明示的に弾く
const MOVEMENT_RE = /^(?:(?:ST|TY)[-.]?[0-9]{4}|(?:NH|VK|VD|VH|YM)[-.]?[0-9]{2}[A-Z]?|(?:SW|ETA|MIYOTA|SII)[-.]?[0-9]{3,4}[A-Z]?)+$/i;

function extractRefs(title) {
  const out = new Set();
  for (const raw of title.match(REF_RE) ?? []) {
    // 末尾の区切り記号は落とす。「T137.907.97.201.00/」の / が残っていた
    // 先頭の色名も落とす。買取店の管理番号は「WHT/SLV/H374510」の形で書かれる
    const s = stripColorPrefix(raw.toUpperCase().replace(/[.,\-/]+$/, ''));
    if (NOISE_EXACT.has(s) || NOISE_RE.test(s)) continue;
    // 中古店の管理番号（ABC28613 など）。型番ではない
    if (isManagementRef(s)) continue;
    if (CALIBER_RE.test(s) || PURITY_RE.test(s)) continue;
    if (SIZE_LIST_RE.test(s) || HAS_UNIT_RE.test(s) || MOVEMENT_RE.test(s)) continue;
    if (!/[0-9]/.test(s)) continue;
    // 腕時計の型番は通常4桁以上の数字を含む。3桁以下は価格・寸法・金位である場合が多い
    if (s.replace(/[^0-9]/g, '').length < 4) continue;
    out.add(s);
  }
  return [...out];
}

const normRef = (r) => r.toUpperCase().replace(/[.\-/\s]/g, '');

/**
 * 1つの出品タイトルに型番が複数書かれることがある。
 * ティソの出品は「T137.907.97.201.00」と「T137907」を併記していて、
 * 両方を別モデルとして登録したため、同じ時計・同じ価格・同じリンクのカードが
 * 2枚並んでいた。
 *
 * 短い方が長い方の先頭に一致するなら、同じ時計の略記とみなして詳しい方だけを採る。
 * 先頭一致しない型番どうしは別の時計かもしれないので、両方残す
 * （付属品の型番を併記した出品などがあるため、勝手に1つへ絞らない）。
 * 人手カタログに載っている型番があれば、常にそれを優先する。
 */
function dedupeRefs(refs, curatedByRef) {
  if (refs.length <= 1) return refs;
  const sorted = [...refs].sort((a, b) => normRef(b).length - normRef(a).length);
  const kept = [];
  for (const r of sorted) {
    const n = normRef(r);
    // 人手カタログにある型番は必ず残す
    if (curatedByRef?.has(n)) {
      kept.push(r);
      continue;
    }
    // 既に採った、より詳しい型番の先頭に一致するなら略記とみなす
    const isShortFormOfKept = kept.some((k) => {
      const kn = normRef(k);
      return kn.length > n.length && n.length >= 5 && kn.startsWith(n);
    });
    if (!isShortFormOfKept) kept.push(r);
  }
  return kept;
}

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
  return [...byShop.values()].sort((a, b) => a.price - b.price).slice(0, 8);
}

// 本体ではない出品の判定は scripts/lib/junk.mjs に一本化した。
// ここに一覧を復活させないこと。3箇所に分裂して食い違ったため、
// 指摘のたびに片方だけ直しては穴が残る、を繰り返していた。

/**
 * ベルトや工具の出品は、対応する時計ブランドを何社も列挙する。
 * 逆に時計そのものの出品が3社以上を並べることはまずないので、
 * ブランド名が多く出てくる時点で本体ではないと判断できる。
 */
function mentionsTooManyBrands(title, allBrandNames) {
  let n = 0;
  for (const name of allBrandNames) {
    if (name.length >= 3 && title.includes(name)) n++;
    if (n >= 3) return true;
  }
  return false;
}

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
        // 在庫切れは載せない。リンク先が「売り切れ」だと価格比較として成立しない
        if (Number(Item.availability) === 0) continue;
        const title = Item.itemName ?? '';
        // 楽天は1商品につき最大3枚返す。1枚目だけ使うと写真が3分の1になる。
        // 店によっては裏蓋や留め金を撮っており、角度違いとして使える。
        const images = [...new Set(
          (Item.mediumImageUrls ?? [])
            .map((x) => (typeof x === 'string' ? x : x?.imageUrl))
            .filter(Boolean)
            .map((u) => String(u).replace(/\?_ex=\d+x\d+$/, '')),
        )];
        out.push({
          source: 'rakuten',
          title,
          price: Number(Item.itemPrice) || 0,
          url: Item.affiliateUrl || Item.itemUrl || '',
          shop: Item.shopName ?? '',
          image: images[0] ?? null,
          ...(images.length > 1 ? { images } : {}),
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
      // 成果は「どこでもリンク」で出品URLを包む方式（もしも経由・1.54%）。
      // Yahoo!のAPIに渡すアフィリエイト指定（バリューコマース）は使わない。
      let data;
      try {
        data = await fetchJson(`https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch?${params}`);
      } catch {
        break;
      }
      const hits = data.hits ?? [];
      for (const h of hits) {
        // 在庫切れは載せない
        if (h.inStock === false) continue;
        const title = h.name ?? '';
        out.push({
          source: 'yahoo',
          title,
          price: Number(h.price) || 0,
          url: wrapYahoo(h.url ?? ''),
          shop: h.seller?.name ?? '',
          // Yahoo!のパス1文字がサイズ。g=146px / j=300px / l=600px。最大の l で保存する
          image: h.image?.medium ? h.image.medium.replace(/\/i\/[a-z]\//, '/i/l/') : null,
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
    // 楽天ウェブサービス規約 第8条4項: ウェブサービスを使用した部分から
    // 楽天以外へリンクしてはならない。カード上の写真と価格をこのURLへ向ける
    url: offers[0].url ?? null,
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

// ベルト等の付属品判定に使う。全ブランドの日本語名を1度だけ作る
/**
 * ブランドごとの「これより安ければ本体ではない」下限。
 * ロレックスのデイトナが1万7千円なら、それはベルトか部品である。型番は本物なので
 * 名前や記号では弾けず、値段で見るしかない。
 * モデルごと消してはいけない（型番自体は実在する）。安い**出品**だけを落とす。
 */
const MIN_PRICE_BY_BRAND = (() => {
  try {
    const j = readJson(path.join(ROOT, 'data/brand-min-price.json'));
    return { def: j.default ?? 0, brands: j.brands ?? {} };
  } catch {
    return { def: 0, brands: {} };
  }
})();
const priceFloor = (brandId) => MIN_PRICE_BY_BRAND.brands[brandId] ?? MIN_PRICE_BY_BRAND.def;

const ALL_BRAND_NAMES = catalogs.map((c) => c.brand?.name_ja).filter(Boolean);
/** 全ブランドの情報。出品タイトルに他社名が先に出ていないか調べるのに使う */
const allBrandsForCheck = catalogs.map((c) => c.brand).filter(Boolean);

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

let skippedForTime = 0;

for (const cat of catalogs) {
  const brand = cat.brand;
  if (onlyBrand && brand.id !== onlyBrand) continue;
  if (outOfTime()) {
    skippedForTime++;
    continue;
  }

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
        // 打ち切りはブランドの切れ目だけでなくここでも見る。
        // 1ブランドのキーワード走査だけで数分かかるため、粒度が粗いと大きく超過する。
        if (outOfTime()) {
          process.stdout.write('(時間切れ) ');
          break;
        }
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
    // ゴミの判定は scripts/lib/junk.mjs に一本化してある。ここに独自の一覧を作らない。
    // 語だけでは足りない（本物も付属ベルトの種類を書く）ので、価格でも見る。
    // ロイヤルオークが2万円で出ていれば、それはベルトか小物である。
    if (isJunkOffer(title, it.price, priceFloor(brand.id))) continue;
    if (mentionsTooManyBrands(title, ALL_BRAND_NAMES)) continue;
    if (!title.includes(brand.name_ja) && !title.toUpperCase().includes(brand.name_en.toUpperCase())) continue;
    // ブランド名がより長いカタカナ語の一部なだけなら、そのブランドの商品ではない。
    // 「ジン」の棚にロンジンの時計が958件（棚の7割）並んでいた
    if (!brandNameStandsAlone(brand.id, title, brand.name_ja, brand.name_en)) continue;
    // 他ブランドの名前が先に出ていれば、それがこの商品の正体である
    // 「セイコーSEIKO 腕時計 SUR829P1」がロレックスの棚に並んでいた
    if (otherBrandComesFirst(title, brand, allBrandsForCheck)) continue;

    for (const ref of dedupeRefs(extractRefs(title), curatedByRef)) {
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
    // ベルトや部品の品番。商品名では見分けられないので型番の形で弾く
    // （ハミルトンは 時計=H+8桁 / ベルト=H+9桁 の違いしかない）
    if (isJunkRef(brand.id, groupKey)) continue;

    const sorted = [...g.prices].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const min = sorted[0];
    // 極端に安い出品（付属品等）を除くため、中央値の3割と実測最安の高い方を下限にする
    /*
     * 下限を出品自体から計算していたため、ベルトばかりが並ぶ型番では中央値が下がり、
     * 下限も一緒に下がって、ベルトが本体として通っていた。
     * （デイトナ116523が¥17,000で「最安値」になっていた）
     * ブランドとしてありえない安値は、出品の分布に関係なく弾く。
     */
    const floor = Math.max(
      Math.floor(median * 0.3),
      Math.floor(min * 0.85),
      3000,
      priceFloor(brand.id),
    );

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

  // ---- 既存カタログへの積み上げ ----
  // 毎回まるごと上書きすると、その日たまたま出品が無かった型番のページが消える。
  // 一度実在が確認できた型番は実在し続けるし、消すとGoogleに登録済みのURLが404になる。
  // 走査の深さは実行環境（CIは時間制限があるので浅い）で変わるため、
  // 浅い走査が深い走査の成果を削らないよう、必ず「足す」方向で書き込む。
  const autoFile = path.join(autoDir, `${brand.id}.json`);
  const today = new Date().toISOString().slice(0, 10);
  let merged = models.map((m) => ({ ...m, lastSeen: today }));

  if (fs.existsSync(autoFile)) {
    let prev = [];
    try {
      prev = readJson(autoFile).models ?? [];
    } catch {
      /* 壊れていれば今回の結果で作り直す */
    }
    const foundNow = new Map(merged.map((m) => [normRef(m.reference ?? m.id), m]));
    const kept = [];
    for (const old of prev) {
      const key = normRef(old.reference ?? old.id);
      if (foundNow.has(key)) continue; // 今回も見つかった分は新しい情報で置き換わる
      // 今回は出品が見つからなかったが、過去に実在を確認した型番なので残す
      kept.push({ ...old, listingCount: 0 });
    }
    merged = [...merged, ...kept];
  }

  // 上限を超えたら、今回見つかったもの・出品数の多いものを優先して残す
  merged.sort((a, b) => {
    const seen = (x) => (x.lastSeen === today ? 0 : 1);
    return seen(a) - seen(b) || (b.listingCount ?? 0) - (a.listingCount ?? 0);
  });
  if (merged.length > MAX_PER_BRAND) merged = merged.slice(0, MAX_PER_BRAND);

  fs.writeFileSync(
    autoFile,
    JSON.stringify(
      {
        brandId: brand.id,
        generatedAt: new Date().toISOString(),
        note: '出品データから自動生成されたモデル。data/brands/ の人手カタログを補完します。過去に確認した型番は出品が途切れても残します。',
        models: merged,
      },
      null,
      2
    ),
    'utf8'
  );
  console.log(`今回${models.length}モデル / 累計${merged.length}モデル`);

  grandTotal += merged.length;
}

if (WRITE_PRICES) {
  fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2), 'utf8');
}

console.log(`\n自動カタログ: ${grandTotal}モデル（data/brands-auto/）`);
console.log(`人手カタログのうち価格が付いたモデル: ${curatedPriced}件`);
console.log(`価格データ合計: ${Object.keys(summary).length}モデル`);
if (skippedForTime > 0) {
  // 常態化させない。当たったら深さを下げるか上限を上げるかを判断する必要がある
  console.log(`::warning::時間の上限(${MAX_MINUTES}分)に達し、${skippedForTime}ブランドを走査できませんでした。`);
  console.log('::warning::そのブランドのページは今日だけ価格が出ません。走査の深さを見直してください。');
} else if (MAX_MINUTES) {
  console.log(`時間の上限(${MAX_MINUTES}分)には達していません。全ブランドを走査しました。`);
}
