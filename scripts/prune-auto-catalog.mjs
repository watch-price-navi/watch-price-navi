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

const ROOT = process.cwd();
const APPLY = process.argv.includes('--apply');
const autoDir = path.join(ROOT, 'data', 'brands-auto');

if (!fs.existsSync(autoDir)) {
  console.log('data/brands-auto がありません。先に npm run auto-catalog を実行してください。');
  process.exit(0);
}

/** キャリバー番号（CAL.2080 / CAL.K2001 / CAL.HUB4100 / CAL.L.633.1 など） */
const CALIBER_RE = /^(?:CAL|CALIBER|CALIBRE|MOVEMENT|MVT)[.\-_/]/i;
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
    else if (ref.replace(/[^0-9]/g, '').length < 4) why = '数字が3桁以下';
    else if (ACCESSORY_HEAD_RE.test(name)) why = '付属品の出品';
    else if (STRAP_MAKER_RE.test(both)) why = 'ベルト専業メーカー';
    else if (NON_WATCH_RE.test(both)) why = '時計以外の商品';
    if (why) {
      reasons.set(why, (reasons.get(why) ?? 0) + 1);
      continue;
    }
    kept.push(m);
  }

  totalAfter += kept.length;
  if (kept.length !== before) {
    rows.push({ brand: cat.brandId ?? f.replace(/\.json$/, ''), before, after: kept.length });
    if (APPLY) {
      cat.models = kept;
      fs.writeFileSync(path.join(autoDir, f), JSON.stringify(cat, null, 2), 'utf8');
    }
  }
}

console.log(`\n${APPLY ? '除去しました' : '除去プレビュー（--apply で実行）'}\n`);
for (const r of rows.sort((a, b) => b.before - b.after - (a.before - a.after))) {
  console.log(`  ${r.brand.padEnd(22)} ${String(r.before).padStart(5)} → ${String(r.after).padStart(5)}  (-${r.before - r.after})`);
}
console.log(`\n合計: ${totalBefore} → ${totalAfter} モデル（-${totalBefore - totalAfter}件）`);
if (reasons.size) {
  console.log('\n除去した理由:');
  for (const [k, v] of [...reasons].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(5)}  ${k}`);
}
if (!APPLY) console.log('\n※ まだ書き込んでいません。--apply を付けると反映します。');
