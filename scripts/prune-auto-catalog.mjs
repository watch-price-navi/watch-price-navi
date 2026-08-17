#!/usr/bin/env node
/**
 * 自動カタログ(data/brands-auto)から、モデルとして成立しない項目を取り除く。
 *
 * build-auto-catalog.mjs の抽出条件を厳しくしても、既に生成済みのファイルは
 * そのままなので、APIを叩き直さずに同じ基準を後掛けで適用するためのもの。
 *
 * 使い方:
 *   node scripts/prune-auto-catalog.mjs           # 何が消えるか表示するだけ
 *   node scripts/prune-auto-catalog.mjs --apply   # 実際に書き込む
 */
import fs from 'node:fs';
import path from 'node:path';
import { readJson } from './lib/json.mjs';
import {
  brandNameStandsAlone,
  isJunkName,
  isJunkOffer,
  isJunkRef,
  isManagementRef,
  junkReason,
  otherBrandComesFirst,
  stripColorPrefix,
  stripRefPrefix,
} from './lib/junk.mjs';

const ROOT = process.cwd();

/** ブランドIDから名前を引く。出品が本当にそのブランドのものか調べるのに使う */
const brandInfo = {};
/** 全ブランドの一覧。出品タイトルに他社名が先に出ていないか調べるのに使う */
const allBrands = [];
const APPLY = process.argv.includes('--apply');
const autoDir = path.join(ROOT, 'data', 'brands-auto');

/** ブランド別の「これより安ければ本体ではない」下限 */
const MIN_PRICE = (() => {
  try {
    const j = readJson(path.join(ROOT, 'data', 'brand-min-price.json'));
    return { def: Number(j.default) || 0, brands: j.brands ?? {} };
  } catch {
    return { def: 0, brands: {} };
  }
})();
const floorOf = (brandId) => Number(MIN_PRICE.brands[brandId] ?? MIN_PRICE.def) || 0;

/**
 * そのモデルの出品が「全部」ゴミなら true。
 * 価格データが無ければ判断材料が無いので false（消さない）。
 *
 * 価格も見るが、下限割れだけでは消さない。
 * 「時計であることを示す語」（自動巻・文字盤など）があれば本体として残す。
 * 下限を下回るだけで消すと、本物のヴィンテージや限定品まで失う。
 * 実際に「デッドストック級 オメガ 手巻き ヴィンテージ ¥40,000」（下限¥60,000）や
 * 「G-SHOCK MR-G 鉄鐔 ¥731,280」を消しかけた。
 * 価格は収集時に安すぎる『出品』を落とすのには使うが、
 * 『モデル』を消す根拠にはしない。消したものは戻らない。
 */
function allOffersAreJunk(brandId, modelId) {
  const b = brandInfo[brandId];
  const f = path.join(ROOT, 'data', 'prices', brandId, `${modelId}.json`);
  if (!fs.existsSync(f)) return false;
  let offers;
  try {
    offers = readJson(f).offers ?? [];
  } catch {
    return false;
  }
  /*
   * 出品ゼロの価格ファイルは、収集側が作ることがない。
   * build-auto-catalog も fetch-prices も offers.length === 0 なら書き込まない
   * （前者は return false、後者は既存を残すか削除する）。
   * つまり中身が空なのは、ゴミ判定で全部落とされた結果でしかない。
   * そのモデルは存在の根拠が無いので消す。
   */
  if (offers.length === 0) return true;
  const floor = floorOf(brandId);
  return offers.every(
    (o) =>
      isJunkOffer(o.title, o.price, floor) ||
      // ブランド名が別のカタカナ語の一部なだけの出品（ロンジン⊃ジン）
      (b && !brandNameStandsAlone(brandId, o.title, b.name_ja, b.name_en)) ||
      // 他ブランドの名前が自ブランドより先に出ている（出品タイトルは自分の商品を先に書く）
      (b && otherBrandComesFirst(o.title, b, allBrands)),
  );
}

if (!fs.existsSync(autoDir)) {
  console.log('data/brands-auto がありません。先に npm run auto-catalog を実行してください。');
  process.exit(0);
}

/**
 * キャリバー番号（CAL.2080 / CAL.K2001 / CAL.HUB4100 / CAL.L.633.1 など）。
 * 区切り記号の無い「CAL7740」「CAL1767」も弾く。25件がすり抜けていた。
 * 「CALATRAVA」（パテックの本物）は数字が続かないので当たらない。
 */
const CALIBER_RE = /^(?:CAL|CALIBER|CALIBRE|MOVEMENT|MVT)(?:[.\-_/]|[0-9])/i;
/** 貴金属の品位表記（750YG = 18金など） */
const PURITY_RE = /^(?:750|585|375|900|950|925|999)(?:YG|PG|RG|WG|SV|PT|GP)?$/i;
/** 付属品・革小物の語。モデル名の先頭に来る場合は本体ではない出品と判断する */
const ACCESSORY_HEAD_RE =
  /^(?:レザー|ラバー|メタル|ナイロン|クロコ|カーフ|ウォッチ)?(?:バンド|ベルト|ストラップ|ブレスレット|バックル|ケース|ボックス|ポーチ|ファスナー|ワインダー)/;

/**
 * ベルトの取付幅。「18MM」単独なら弾けていたが、ベルトの出品は対応サイズを
 * 並べるため「18MM/19MM/20MM/21MM/」「19-16MM」となり、数字が4桁以上あるので
 * 型番として通過していた。
 */
const SIZE_LIST_RE = /^[0-9]{1,2}(?:MM|CM)?(?:[-/][0-9]{1,2}(?:MM|CM)?)*\/?$/i;
/** 型番に寸法の単位が入ることはない（25X25CM のような表記もここで落ちる） */
const HAS_UNIT_RE = /[0-9]\s*(?:MM|CM)\b/i;
/** ムーブメントの品番。ST1901＝シーガル、NH35＝セイコー等。連結表記(ST2901ST1901)も弾く */
const MOVEMENT_RE = /^(?:(?:ST|TY)[-.]?[0-9]{4}|(?:NH|VK|VD|VH|YM)[-.]?[0-9]{2}[A-Z]?|(?:SW|ETA|MIYOTA|SII)[-.]?[0-9]{3,4}[A-Z]?)+$/i;
/** ベルト専業メーカー。社名だけで売られ、対応ブランドを列挙するので各社に紛れ込む */
const STRAP_MAKER_RE = /ヒルシュ|HIRSCH|モレラート|MORELLATO|カシス|CASSIS|バンビ/i;
/** 時計ブランドは時計以外も売る。ブルガリのサングラスが大量に混ざっていた */
const NON_WATCH_RE =
  /サングラス|メガネ|眼鏡|ボールペン|万年筆|シャープペン|財布|キーケース|名刺入れ|カフス|ネクタイ|ライター|香水|ネックレス|ピアス|キーリング|ガスケット|スマホケース|iPhone|アップルウォッチ|イヤホン/i;

/**
 * ブランドごとのキャリバー番号。
 * 出品タイトルには型番とキャリバーが並んで書かれるため、キャリバーを型番として
 * 拾うと「オーデマピゲ 2121」のような存在しないモデルのページができる。
 * ブランドを跨いで適用してはならない（他社ではキャリバー記号に見える本物の型番がある）。
 */
const normRef = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
let commonCalibers = new Set();
const caliberSets = (() => {
  try {
    const j = readJson(path.join(ROOT, 'data/calibers.json'));
    commonCalibers = new Set((j.common ?? []).map(normRef));
    const out = {};
    for (const [b, list] of Object.entries(j.brands ?? {})) out[b] = new Set(list.map(normRef));
    return out;
  } catch {
    return {};
  }
})();

/**
 * 他ブランドの名前がモデル名に入っているものは、そのブランドの時計ではない。
 * 「ロレックス」の棚に「セイコー アンティーク SUR829P1」が並んでいた。
 * 複数ブランドを扱う店の出品タイトルから拾ってしまうために起きる。
 */
const brandNames = [];
/** ブランドIDから英語名を引く。型番に付いたブランド名を落とすのに使う */
const brandEnOf = {};
for (const f of fs.readdirSync(path.join(ROOT, 'data/brands')).filter((x) => x.endsWith('.json'))) {
  try {
    const c = readJson(path.join(ROOT, 'data/brands', f));
    if (c.brand?.id && c.brand?.name_ja) brandNames.push([c.brand.id, c.brand.name_ja]);
    if (c.brand?.id) brandEnOf[c.brand.id] = c.brand.name_en ?? '';
    if (c.brand?.id) brandInfo[c.brand.id] = c.brand;
    if (c.brand?.id) allBrands.push(c.brand);
  } catch {
    /* 読めないものは飛ばす */
  }
}
/** 親子関係にあるブランドは、名前が混ざっていても不自然ではない */
const SAME_FAMILY = [['grand-seiko', 'seiko']];
function isSameFamily(a, b) {
  return SAME_FAMILY.some((pair) => pair.includes(a) && pair.includes(b));
}

/** 潤滑油の粘度表記（75W-140 など）。オメガは工業用オイルの同名企業がある */
const OIL_GRADE_RE = /^\d{1,3}W-?\d{1,3}$/i;

/**
 * 価格による判定。これが最も強い。
 * ロレックスのデイトナが1万7千円で出ていれば、それはベルトか付属品である。
 * 型番は本物なので他の規則では弾けず、価格を見るしかない。
 * 価格データは規約により保存していないので、収集直後（CI）でのみ効く。
 */
const minPrice = (() => {
  try {
    return readJson(path.join(ROOT, 'data/brand-min-price.json'));
  } catch {
    return { default: 0, brands: {} };
  }
})();
const summary = (() => {
  try {
    const f = path.join(ROOT, 'data/prices/summary.json');
    return fs.existsSync(f) ? readJson(f) : null;
  } catch {
    return null;
  }
})();
if (!summary) console.log('（価格データが無いため、価格による判定は行いません）');

/** 型番の先頭に付いたブランド名を落とす。「OMEGA1120」はキャリバー1120である */
function stripBrandPrefix(ref, brandEn) {
  const b = String(brandEn ?? '').replace(/[^A-Za-z]/g, '');
  if (!b) return ref;
  return String(ref).replace(new RegExp(`^${b}[-.\\s]?`, 'i'), '');
}

const rows = [];
let totalBefore = 0;
let totalAfter = 0;
const reasons = new Map();
let renamed = 0;
let mergedDup = 0;

/**
 * 型番の頭に付いた余計なものを落として直す。
 *
 * 色名 …「HAMILTON◆クォーツ腕時計/アナログ/WHT/SLV/H374510【服飾雑貨他】」
 *        買取店が型番の前に色を並べるため、同じ時計が色ごとに別モデルとして並ぶ。
 * Ref. …「Ref.」は型番の目印であって型番の一部ではない。796件が該当した。
 *        そのままだと REF.26393ST.OO というページになり、
 *        26393ST.OO を探している人に見つけてもらえない。
 *
 * **消さずに直す。** 消すと、正しい型番の側が無いものはその型番ごと失われる。
 * 正しい型番が既にあるものは重複なので、こちらを畳む。
 */
function fixRefs(cat, brandId) {
  const models = cat.models ?? [];
  let touched = false;
  const byId = new Map(models.map((m) => [m.id, m]));
  const out = [];
  for (const m of models) {
    const fixed = stripColorPrefix(stripRefPrefix(String(m.reference ?? '')));
    if (fixed === String(m.reference ?? '')) {
      out.push(m);
      continue;
    }
    const newId = `ref-${fixed.toUpperCase().replace(/[^A-Z0-9]/g, '').toLowerCase()}`;
    if (byId.has(newId) && byId.get(newId) !== m) {
      // 正しい型番のモデルが既にある。色付きの方は重複なので畳む
      mergedDup++;
      touched = true;
      continue;
    }
    // 正しい型番が無いので、名前を直して残す
    const oldName = String(m.name_ja ?? '');
    m.name_ja = oldName.includes(m.reference) ? oldName.split(m.reference).join(fixed) : oldName;
    m.name_en = String(m.name_en ?? '').includes(m.reference)
      ? String(m.name_en).split(m.reference).join(fixed)
      : m.name_en;
    if (APPLY) {
      // 価格ファイルも一緒に移す。IDが変わるとページのURLも変わるため
      const from = path.join(ROOT, 'data', 'prices', brandId, `${m.id}.json`);
      const to = path.join(ROOT, 'data', 'prices', brandId, `${newId}.json`);
      if (fs.existsSync(from) && !fs.existsSync(to)) fs.renameSync(from, to);
    }
    m.reference = fixed;
    m.id = newId;
    byId.set(newId, m);
    renamed++;
    touched = true;
    out.push(m);
  }
  cat.models = out;
  return touched;
}

for (const f of fs.readdirSync(autoDir).filter((f) => f.endsWith('.json'))) {
  let cat;
  try {
    cat = readJson(path.join(autoDir, f));
  } catch (e) {
    console.warn(`  ! ${f}: 読めません (${e.message})`);
    continue;
  }
  const before = (cat.models ?? []).length;
  totalBefore += before;

  // 型番の色名を直してから判定する。順番を逆にすると、直った型番が判定を通らない
  const refsFixed = fixRefs(cat, cat.brandId ?? f.replace(/\.json$/, ''));

  const kept = [];
  for (const m of cat.models ?? []) {
    const ref = String(m.reference ?? '');
    const name = String(m.name_ja ?? '');
    let why = null;
    const both = `${name} ${String(m.name_en ?? '')}`;
    const brandId = cat.brandId ?? '';
    const brandCalibers = caliberSets[brandId];
    const foreign = brandNames.find(
      ([id, nm]) => id !== brandId && !isSameFamily(id, brandId) && nm.length >= 3 && name.includes(nm),
    );
    // 「OMEGA1120」のようにブランド名が付いた形でもキャリバーとして判定する
    const bare = normRef(stripBrandPrefix(ref, brandEnOf[brandId]));

    if (CALIBER_RE.test(ref)) why = 'キャリバー番号';
    else if (brandCalibers?.has(normRef(ref)) || brandCalibers?.has(bare)) why = 'キャリバー番号（銘柄別一覧）';
    else if (commonCalibers.has(normRef(ref)) || commonCalibers.has(bare)) why = '汎用ムーブメント番号';
    // 価格でモデルごと消してはいけない。
    // 「ヘリテージ ブラックベイ 79220 ¥18,700」は型番が本物で、安いのは
    // その出品がベルトか部品だからである。モデルを消すと本物のページが失われる。
    // 正しくは収集時に安すぎる『出品』を弾くこと（build-auto-catalog / fetch-prices）。
    else if (OIL_GRADE_RE.test(ref)) why = '潤滑油の粘度表記';
    else if (foreign) why = `他ブランドの商品（${foreign[1]}）`;
    else if (PURITY_RE.test(ref)) why = '貴金属の品位表記';
    else if (SIZE_LIST_RE.test(ref)) why = 'ベルトの取付幅';
    else if (HAS_UNIT_RE.test(ref)) why = '型番に寸法単位';
    else if (MOVEMENT_RE.test(ref)) why = 'ムーブメント品番';
    else if (isJunkRef(brandId, ref)) why = 'ベルト・部品の品番';
    else if (isManagementRef(ref)) why = '中古店の管理番号';
    else if (ref.replace(/[^0-9]/g, '').length < 4) why = '数字が3桁以下';
    else if (ACCESSORY_HEAD_RE.test(name)) why = '付属品の出品';
    else if (isJunkName(both)) why = `時計ではない（${junkReason(both)}）`;
    /*
     * 出品が「全部」ゴミなら、そのモデルは存在の根拠が無い。
     *
     * 1件でもゴミがあれば消す、にしてはいけない。本物の時計も付属ベルトの
     * 種類を書くので、「アリゲーターレザーストラップ ¥411,100」のような
     * 本物のナビタイマーまで消してしまう（実際に消えかけた）。
     *
     * 語だけでは足りない。ロイヤルオークが2万円で出ていればベルトか小物なので、
     * ブランド別の下限も併せて見る。価格は言語に依存しないぶん確実である。
     */
    else if (allOffersAreJunk(brandId, m.id)) why = '出品が全部ゴミ';
    if (why) {
      reasons.set(why, (reasons.get(why) ?? 0) + 1);
      continue;
    }
    kept.push(m);
  }

  totalAfter += kept.length;
  // 件数が変わらなくても、型番を直していれば書き戻す必要がある
  const changed = kept.length !== before || refsFixed;
  if (kept.length !== before) {
    rows.push({ brand: cat.brandId ?? f.replace(/\.json$/, ''), before, after: kept.length });
  }
  if (APPLY && changed) {
    cat.models = kept;
    fs.writeFileSync(path.join(autoDir, f), JSON.stringify(cat, null, 2), 'utf8');
  }
}

console.log(`\n${APPLY ? '除去しました' : '除去プレビュー（--apply で実行）'}\n`);
for (const r of rows.sort((a, b) => b.before - b.after - (a.before - a.after))) {
  console.log(`  ${r.brand.padEnd(22)} ${String(r.before).padStart(5)} → ${String(r.after).padStart(5)}  (-${r.before - r.after})`);
}
if (renamed || mergedDup) {
  console.log(`\n  色名を落として型番を直したもの: ${renamed}件`);
  console.log(`  正しい型番が既にあり重複として畳んだもの: ${mergedDup}件`);
}
console.log(`\n合計: ${totalBefore} → ${totalAfter} モデル（-${totalBefore - totalAfter}件）`);
if (reasons.size) {
  console.log('\n除去した理由:');
  for (const [k, v] of [...reasons].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(5)}  ${k}`);
}
if (!APPLY) console.log('\n※ まだ書き込んでいません。--apply を付けると反映します。');
