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
    if (CALIBER_RE.test(ref)) why = 'キャリバー番号';
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
