#!/usr/bin/env node
/**
 * ゴミ判定の回帰テスト。
 *
 * この判定は「指摘 → 語を足す → 別のところで誤爆」を何度も繰り返してきた。
 * 語を足したり消したりするたびに、ここを通してから送ること。
 *
 * 収録した例はすべて実データから採っている。作り話は入れない。
 *
 *   node scripts/test-junk.mjs
 */
import {
  isJunkTitle,
  isJunkName,
  isJunkRef,
  isManagementRef,
  isOtherBrand,
  otherBrandComesFirst,
  stripColorPrefix,
  stripRefPrefix,
} from './lib/junk.mjs';

/** 消してはいけない本物。実際の出品タイトル（一部は要約） */
const REAL = [
  ['ロレックス デイトナ 116519NG K18WG 金無垢 リザード純正ベルト 純正バックル 自動巻き', '純正ベルトは仕様の説明'],
  ['PATEK PHILIPPE アニュアルカレンダー ムーンフェイズ Dバックル仕様 箱・保証書付き Ref.5396R-014', 'Dバックル仕様は売り文句'],
  ['箱・保証書・替えの純正ベルト・純正バックル付き VACHERON CONSTANTIN オーヴァーシーズ', '替えベルトは付属品'],
  ['箱・保証書・替えの未使用ベルト付き Breguet マリーン2 クロノグラフ 5827BR', '同上'],
  ['カルティエ トーチュ W1580048 パーぺチュアルカレンダー K18WG 純正Dバックル 純正レザーストラップ', '純正Dバックルは仕様'],
  ['セイコー グランドセイコー GS 4522-8010 ハイビート 手巻 YG 金無垢 1971年 新品純正ベルト交換済み OH済', 'ベルト交換済みは整備歴'],
  ['ブライトリング ナビタイマー32 スーパークォーツ アリゲーターレザーストラップ A77320D91K1P1', 'ストラップは素材の説明'],
  ['ブランパン フィフティ ファゾムズ オートマティック 38mm 5007 ラバーストラップ 自動巻き', '同上'],
  ['SEIKO Prospex Reissue First Diver Rubber Band SPB147J1 腕時計', 'Rubber Band は英語でも誤爆する'],
  ['カシオ CASIO MRG-G2000HA-1AJR Gショック MR-G 鉄鐔 非売品プロテカケース付 ソーラー電波', '非売品ケースは付属品'],
  ['CASIO G-SHOCK オリジナルフィギュア付属 ウルトラセブン誕生40周年限定モデル DW-6900', 'フィギュアは付属品'],
  ['シチズン 海外モデル 逆輸入 エコドライブ CITIZEN AW0100-86EE【ベルト調整無料】', 'ベルト調整は無料サービス'],
  ['パテック フィリップ パーペチュアルカレンダー 5327G', 'カレンダーは複雑機構'],
  ['シチズン クロスシー xC ES9430-77A', 'クロスは商品名の一部'],
  ['オメガ シーマスター シースルーバック 300M', 'バックは裏蓋のこと'],
  ['グランドセイコー ラグジュアリー SBGW231', 'ラグは語の一部'],
  ['IWC DLCコーティング パイロット トップガン', 'コーティングは表面処理'],
  ['デッドストック級 オメガ 銀文字盤 手巻き ヴィンテージ レディース腕時計', '安いが本物'],
  ['ロレックス サブマリーナ 126610LN ブレスレット 新品', 'ブレスレットは本体の一部'],
  ['オリエントスター ご購入特典つき メンズ腕時計 M34 F8 デイト 替えベルト付 自動巻 RK-BX0003L', '替えベルト付は付属品'],
  ['シチズンエル CITIZEN L レディース腕時計 替えベルトつき エコドライブ EW5593-64D', '同上。これで本物41件を消した'],
  ['シチズンアテッサ ACTライン 世界限定2200本 結晶チタニウム CC4076-65A', '結晶チタニウムは素材'],
  ['シチズン クロスシー レディース 腕時計 ソーラー電波 エコドライブ 太陽と月 ダイチ', '太陽は文字盤の意匠'],
  ['ハミルトン カーキ フィールド エクスペディション 37mm 自動巻き H-10 NivachronR製ヒゲゼンマイ 10気圧防水', 'ヒゲゼンマイの材質は高級機の仕様'],
  ['ハミルトン HAMILTON イントラマティック オート 40mm ブルー ニヴァクロン製ヒゲゼンマイ Nivachron', '同上 ¥169,400'],
  ['ブランパン バチスカーフ フィフティファゾムス 5000-1110-70B', 'バチスカーフにスカーフが含まれる'],
  ['ブルガリ セルペンティ トゥボガス 102098', 'セルペンティにペンが含まれる'],
];

/** 消すべきゴミ。実際に掲載されてしまっていたもの */
const JUNK = [
  ['ハミルトン HAMILTON ベンチュラ用 純正カーフストラップ リザード型押し 17mm VENTURA', 'ベルトが本体として載っていた'],
  ['17mm ハミルトン純正 H24411732 カーフリザード型押しベルト ベンチュラ HAMILTON', '同上'],
  ['HAMILTON ハミルトン ビジネスバッグ ブリーフケース メンズ 平野鞄', '鞄が載っていた'],
  ['ベルジョン 【国内正規品】ロレックス対応オープナー BE5537', '工具'],
  ['【送料無料】腕時計 オーデマピゲメインスプリング ＃audemars piguet cal 2124', 'ムーブメント部品が最安値に出ていた'],
  ['AUDEMARS PIGUET AP 42mm 26470 15710 15703に適用にVagenari ラバー ストラップ', '社外ベルト'],
  ['22mm メタル時計バンド ステンレススチール RAZOR ブレスレット for TUDOR ヘリテージ', '社外ブレス'],
  ['ランゲ ヒルシュ 18MM/19MM/20MM/21MM/', 'ベルト専業メーカー'],
  ['ブルガリ サングラス BV7038 メンズ', '時計ブランドの雑貨'],
  ['BVLGARI ブルガリ カードケース 名刺入れ 280299 メンズ', '同上'],
  ['ブルガリ ディーヴァ ドリーム ネックレス 357325 新品 ジュエリー', '同上'],
  ['ロレックス用 コレクションケース 木製 収納ケース', '保管用品'],
  ['オメガ オーバーホール 修理 受付 見積無料', '役務'],
];

let ng = 0;
console.log('── 消してはいけない本物 ──');
for (const [t, why] of REAL) {
  const bad = isJunkTitle(t) || isJunkName(t);
  if (bad) ng++;
  console.log(`  ${bad ? '✗ 誤爆' : '✓ 残る'}  ${t.slice(0, 46)}`);
  if (bad) console.log(`         ← ${why}`);
}
console.log('\n── 消すべきゴミ ──');
for (const [t, why] of JUNK) {
  const bad = isJunkTitle(t);
  if (!bad) ng++;
  console.log(`  ${bad ? '✓ 弾く' : '✗ 素通り'}  ${t.slice(0, 46)}`);
  if (!bad) console.log(`         ← ${why}`);
}
/*
 * 部品の出品。ベルトは対応する時計の型番を並べるので、
 * 本物の型番のモデルが「中身はベルト」で作られてしまっていた。
 */
const PARTS = [
  ['ハミルトン純正 H77616133／H77626153／H77756131／H77636143 ステンレススチール ベルト カーキ X-WIND', true],
  ['ハミルトン　HAMILTON　カーキフィールドマーフ 38mm用 純正メタルブレスレット一式 20mm ステンレス', true],
  ['ハミルトン純正 ステンレススチール 22mm ベルトバンド ブレス シンライン クロノ H38612133', true],
  ['H605.705.107　カーキフィールドオート40mm専用ステンレスベルト /ハミルトン純正', true],
  ['ロンジン ドルチェヴィータ レディース 13mm 専用ステンレスベルト L600145152', true],
  ['ダレスバッグ メンズ 豊岡 製 鞄 日本製 国産 ジェーシーハミルトン 22301 42cm B4', true],
  // 消してはいけないもの。「ブレス」「バックル」は本物が素材として書く
  ['シチズン CITIZEN キー Kii: エコドライブ スクエア メタルブレス EG7040-58A', false],
  ['デッドストック級 保付 カルティエ ディアボロLM トップバックル 18K/750/YG QZ 白文字盤', false],
  ['オーデマピゲ Audemars Piguet 15500ST.OO.1220ST.01 ロイヤルオークSSブルー文字盤腕時計', false],
  ['ブライトリング ナビタイマー32 アリゲーターレザーストラップ A77320', false],
];
console.log('\n── 部品の出品 ──');
for (const [t, want] of PARTS) {
  const got = isJunkTitle(t);
  if (got !== want) ng++;
  console.log(`  ${got === want ? '✓' : '✗'} ${(got ? '部品' : '時計').padEnd(3)} ${t.slice(0, 46)}`);
}

/*
 * 他社ブランドの混入。
 * 商品名に自社ブランド名が入るため、その棚に並んでしまう。
 * コラボ（ブランパン×スウォッチ等）は本物なので巻き込んではいけない。
 */
const OTHER_BRAND = [
  ['【ARMANI EXCHANGE】 Lady Hamilton アルマーニエクスチェンジ レディース腕時計', true],
  ['NIXON ニクソン THE PLAYER プレイヤー メンズ 腕時計 A140-479', true],
  ['【中古】【輸入品・未使用】Henryロンドンhl39-m-0062 Ladies ホルボーン Burgundy ハミルトンゴールド腕時計', true],
  ['稼働 エルジン 07.7001.0029.50 手巻き ゴールド文字盤 メンズ腕時計', true],
  ['新品同様 ブランパン × スウォッチ スクーバ フィフティファゾムス SO35I100 自動巻き', false],
  ['AUDEMARS PIGUET オーデマ・ピゲ ×スウォッチ ロイヤルポップ バイオセラミック', false],
  ['オメガ スピードマスター プロフェッショナル 311.30.42.30.01.005', false],
  ['カシオ G-SHOCK MR-G 鉄鐔 MRG-B5000B-1JR', false],
];
console.log('\n── 他社ブランドの混入 ──');
for (const [t, want] of OTHER_BRAND) {
  const got = isOtherBrand(t);
  if (got !== want) ng++;
  console.log(`  ${got === want ? '✓' : '✗'} ${(got ? '他社' : '自社').padEnd(3)} ${t.slice(0, 44)}`);
}

/*
 * ベルト・部品の品番。
 * ハミルトンは 時計=H+8桁 / ベルト=H+9桁 で、桁数でしか区別できない。
 * H69529933（カーキ フィールド メカ ¥98,250）を消してはいけない。
 */
const REF_CASES = [
  ['hamilton', 'H695.704.104', true],
  ['hamilton', 'H690.823.104', true],
  ['hamilton', 'H695424102', true],
  ['hamilton', 'H69529933', false],
  ['hamilton', 'H32515555', false],
  ['rolex', '126610LN', false],
  ['omega', '310.30.42.50.01.001', false],
];
console.log('\n── ベルト・部品の品番 ──');
for (const [b, r, want] of REF_CASES) {
  const got = isJunkRef(b, r);
  if (got !== want) ng++;
  console.log(`  ${got === want ? '✓' : '✗'} ${b.padEnd(9)} ${r.padEnd(22)} ${got ? 'ベルト' : '時計'}`);
}

/*
 * 型番の頭に付いた色名。
 * 買取店が「WHT/SLV/H374510」の形で書くため、色ごとに別モデルができていた。
 * 落とした結果が色名そのものになる場合（GRN/GRN）は、型番が残らないので触らない。
 */
const COLOR_CASES = [
  ['BLU/SLV/H374510', 'H374510'],
  ['BLK/H776121', 'H776121'],
  ['BLK/SLV/SS/H433110', 'H433110'],
  ['WHT/BEG/6359/KHAKI', '6359/KHAKI'],
  ['GRN/GRN', 'GRN/GRN'],
  ['126610LN', '126610LN'],
  ['T137.907.97.201.00', 'T137.907.97.201.00'],
  ['15350ST.OO.D002CR.01', '15350ST.OO.D002CR.01'],
];
console.log('\n── 型番の頭に付いた色名 ──');
for (const [inp, want] of COLOR_CASES) {
  const got = stripColorPrefix(inp);
  if (got !== want) ng++;
  console.log(`  ${got === want ? '✓' : '✗'} ${inp.padEnd(24)} → ${got}`);
}


/*
 * 中古店の管理番号。店が扱う全ブランドに同じ体系で振られるので、
 * 同じ形が多数のブランドに散らばる（ABC+5桁は25ブランド331件）。
 * 人手カタログ968件では1件も一致しないことを確認済み。
 */
const MGMT = [
  ['ABC28613', true],
  ['JS1983', true],
  ['BT3195', true],
  ['HK11498', true],
  // 先頭が0の数字だけの番号も同じ店の管理番号（ロレックス44・カルティエ40件）
  ['0565620', true],
  ['002587', true],
  ['0011000', true],
  ['126610LN', false],
  ['H69529933', false],
  ['T137907', false],
  ['5711', false],
  ['SBGW231', false],
  ['6694', false],
  ['1601', false],
];
console.log('\n── 中古店の管理番号 ──');
for (const [r, want] of MGMT) {
  const got = isManagementRef(r);
  if (got !== want) ng++;
  console.log(`  ${got === want ? '✓' : '✗'} ${r.padEnd(12)} ${got ? '管理番号' : '型番'}`);
}

/*
 * 「Ref.」は型番の目印であって型番の一部ではない。796件が該当した。
 * REF.26393ST.OO のままだと 26393ST.OO を探す人に見つけてもらえない。
 */
const REF_PREFIX = [
  ['REF.5369', '5369'],
  ['REF.26393ST.OO', '26393ST.OO'],
  ['REF31804', '31804'],
  ['REFERENCE', 'REFERENCE'],
  ['126610LN', '126610LN'],
];
console.log('\n── Ref. の接頭辞 ──');
for (const [inp, want] of REF_PREFIX) {
  const got = stripRefPrefix(inp);
  if (got !== want) ng++;
  console.log(`  ${got === want ? '✓' : '✗'} ${inp.padEnd(18)} → ${got}`);
}

/*
 * 出品タイトルは自分が売る商品の名前を先に書く。
 * 後ろに出る他社名は文字盤の様式（ブレゲ数字）や愛称（ベビーパネライ）である。
 * 逆に先に他社名が出るなら、それがその商品の正体。
 */
const BRANDS = [
  { id: 'rolex', name_ja: 'ロレックス', name_en: 'Rolex' },
  { id: 'seiko', name_ja: 'セイコー', name_en: 'Seiko' },
  { id: 'grand-seiko', name_ja: 'グランドセイコー', name_en: 'Grand Seiko' },
  { id: 'casio', name_ja: 'カシオ', name_en: 'Casio' },
  { id: 'tissot', name_ja: 'ティソ', name_en: 'Tissot' },
  { id: 'sinn', name_ja: 'ジン', name_en: 'Sinn' },
  { id: 'rado', name_ja: 'ラドー', name_en: 'Rado' },
  { id: 'cartier', name_ja: 'カルティエ', name_en: 'Cartier' },
  { id: 'orient', name_ja: 'オリエント', name_en: 'Orient' },
  { id: 'breguet', name_ja: 'ブレゲ', name_en: 'Breguet' },
  { id: 'longines', name_ja: 'ロンジン', name_en: 'Longines' },
];
const FIRST_BRAND = [
  ['rolex', '【送料無料】 セイコーSEIKO 腕時計 SUR829P1 QUARTZ クオーツ レディース ロレックス', 'seiko'],
  ['rado', '【保証書付】カルティエ ラドーニャSM W640020H YG シルバー クオーツ レディース', 'cartier'],
  ['casio', 'ティソ 公式 メンズ 腕時計 TISSOT ティー コンプリカシオン スケレッテ メカニカル', 'tissot'],
  ['breguet', '【3年保証】 ロンジン マスターコレクション L2.755.4.78.3 ブレゲ数字 ギヨシェ', 'longines'],
  // 消してはいけないもの
  ['casio', 'G-SHOCK Gショック オリジン DW-5600BB-1後継機種 カシオ CASIO', null],
  ['orient', '新品 正規品 SEIKO EPSON セイコーエプソン ORIENT STAR オリエントスター', null],
  ['grand-seiko', 'セイコー グランドセイコー SBGW231 手巻き メンズ', null],
  ['rolex', 'ロレックス サブマリーナ 126610LN 新品 未使用', null],
];
console.log('\n── 他ブランド名が先に出る出品 ──');
for (const [bid, title, wantId] of FIRST_BRAND) {
  const me = BRANDS.find((b) => b.id === bid);
  const got = otherBrandComesFirst(title, me, BRANDS);
  const gotId = got ? got.id : null;
  if (gotId !== wantId) ng++;
  console.log(`  ${gotId === wantId ? '✓' : '✗'} ${bid.padEnd(12)}${gotId ? `→ ${gotId}` : '自社のまま'}  ${title.slice(0, 38)}`);
}

console.log(
  ng === 0
    ? `\n${REAL.length + JUNK.length + PARTS.length + OTHER_BRAND.length + REF_CASES.length + COLOR_CASES.length + MGMT.length + REF_PREFIX.length + FIRST_BRAND.length}件すべて期待どおり`
    : `\n${ng}件が期待と違う。判定を直してから送ること`,
);
process.exit(ng ? 1 : 0);
