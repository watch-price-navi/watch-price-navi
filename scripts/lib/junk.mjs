import fs from 'node:fs';
/**
 * 「これは腕時計ではない」を判定する、唯一の場所。
 *
 * ── なぜ一本化するのか ────────────────────────────────
 * 以前は fetch-prices / build-auto-catalog / discover-models が
 * それぞれ別の除外リストを持っていた。指摘を受けるたびに片方だけ語を足したため、
 * 三つのリストが食い違い、常にどこかに穴が残った。
 *
 * 実例（2026-08-17）:
 *   「ハミルトン ベンチュラ用 純正カーフストラップ リザード型押し 17mm」
 *   fetch-prices は 'ストラップ' で弾いたが、
 *   build-auto-catalog は 'ストラップ単品' しか持たず素通り。
 *   結果、ベルトが「ハミルトンのモデル」としてカタログに載った。
 *
 *   「HAMILTON ハミルトン ビジネスバッグ ブリーフケース」
 *   どのリストにも「バッグ」が無く、鞄がモデルとして載った。
 *
 * **語を足すときは必ずここに足すこと。** 各スクリプトに独自の一覧を作らない。
 *
 * ── 日本語には単語の区切りが無い ──────────────────────
 * 部分一致で弾くと、正規の時計まで巻き込む。実際に起きた誤爆:
 *
 *   「カレンダー」→ パーペチュアルカレンダー（永久カレンダー。最高級の複雑機構）
 *   「クロス」  → クロスシー（シチズン xC。53件が該当した）
 *   「バック」  → シースルーバック（裏蓋が透明な仕様）
 *   「ラグ」   → ラグジュアリー、ラグ幅
 *   「コーティング」→ DLCコーティング（正規の表面処理）
 *
 * そこで、短い語の単独一致に頼らず、**語の組み合わせ**で判定する。
 * さらに、誤爆しやすい語には除外規則（ALLOW）を置く。
 *
 * ── 弾く強さを二段に分ける ────────────────────────
 * 出品を1件落としても、同じ型番には他の出品が残る。
 * しかしモデルごと消すと、その型番のページが丸ごと消える。
 * だから
 *   出品の採否（isJunkTitle） … 広めに弾く。混ぜるより落とす方がまし
 *   モデルの削除（isJunkName）… 確実なものだけ。誤って消すと戻せない
 * と強さを変える。
 */

/**
 * 確実に腕時計ではないもの。単独で出れば本体ではない。
 * ここに入れてよいのは「腕時計の説明文に出るはずのない語」だけ。
 */
const STRONG = [
  // 鞄・革小物
  'ビジネスバッグ', 'ブリーフケース', 'ボストンバッグ', 'トートバッグ', 'ショルダーバッグ',
  'リュック', 'ハンドバッグ', 'セカンドバッグ', '長財布', '二つ折り財布', 'ラウンドファスナー',
  '名刺入れ', 'カードケース', 'キーケース', 'コインケース', 'パスケース',
  // 服飾・装身具
  'サングラス', '老眼鏡', 'メガネフレーム', 'ネクタイ', 'カフスボタン', 'カフリンクス',
  'ネックレス', 'ピアス', 'イヤリング', 'ペンダントトップ',
  'Tシャツ', 'パーカー', 'スウェット', 'キャップ帽', 'マフラー',
  // 文具・雑貨
  'ボールペン', '万年筆', 'シャープペン', 'ライター', '香水', 'オードトワレ',
  // 「ジェーシーハミルトン ダレスバッグ 豊岡製鞄」がハミルトンの棚に入っていた。
  // 時計とは別会社だが、社名にブランド名を含むため検索に掛かる
  'ダレスバッグ', 'ドクターバッグ', 'ドクターズバッグ', '豊岡製鞄', '製鞄',
  'ダレス', 'ジェーシーハミルトン', 'ジェイシーハミルトン', 'J.C HAMILTON',
  /*
   * ブランド名と同じ名前の、時計と全く関係のない商品。
   * 「ハミルトンビーチ」は米国の調理家電、「チューダーブリッジ」は水栓金具、
   * 「アゼニス」はタイヤ、「ジンコ」は太陽光パネル、「モンブランマシン」は厨房機器。
   * どれも高額なので価格では弾けず、語で落とすしかない。
   */
  'ブレンダー', 'ミキサー', 'フードプロセッサー', '炊飯器', '電子レンジ',
  'サマータイヤ', 'スタッドレス', 'ホイールセット',
  'ソーラーパネル', '太陽光発電', '架台',
  '蛇口', '水栓', 'シャワーヘッド',
  'カーテン', '仮眠', 'ラグマット',
  // IWCの棚にアイリスオーヤマのワインセラー（品番 IWC-C321A-B）と
  // レノボのノートパソコン（16IWC11）が並んでいた。
  // カシオの棚には同社の電子ピアノが15件あった。時計の比較サイトなので載せない。
  'ワインセラー', 'ノートパソコン', 'ノートPC', 'デスクトップパソコン',
  '冷蔵庫', '冷凍庫', '食洗機', '電気ケトル', '掃除機', '空気清浄', '扇風機',
  '電子ピアノ', '電子キーボード', 'アイリスオーヤマ', 'Lenovo', 'IdeaPad', 'ThinkPad',
  'ルース', '鑑別書', 'ペンダントヘッド', '宝石研究所',

  // 時計だが腕時計ではない
  '置時計', '置き時計', '掛け時計', '壁掛け時計', '目覚まし時計', '振り子時計',
  // 偽物・非正規
  'コピー品', '偽物', 'パロディ', 
  '部品取り', 'ジャンク品',
  // 役務。物ではない
  'オーバーホール', '電池交換',  '文字盤リダン', 'ケース研磨',
  // 保管・手入れ
  'ワインディングマシーン', 'ワインダー', 'コレクションケース', '収納ケース',
  'ウォッチケース', '時計収納', '保護フィルム', '工具セット', 'オープナー',
  '空箱', '箱のみ', 'ケースのみ', '説明書のみ', '保証書のみ', 'タグのみ'];

/**
 * ベルト専業メーカー。
 * 商品名に「ベルト」と書かず社名だけで売り、対応ブランドを列挙するため、
 * どのブランドで検索しても必ず引っかかる。
 * （「ランゲ ヒルシュ 18MM/19MM/20MM/21MM/」がブレゲのカタログに入っていた）
 */
// 'RUBBER B' は "Rubber Band" に一致してしまうため入れない。
// 英語でも部分一致は危ない（セイコー プロスペックス ¥470,530 を消しかけた）。
const STRAP_MAKERS = [
  'ヒルシュ', 'HIRSCH', 'モレラート', 'MORELLATO', 'カシス', 'CASSIS',
  'バンビ', 'BAMBI', 'Vagenari', 'RIOS1931'];

/**
 * ベルト・部品を指す言い回し。
 * 単語ひとつでは誤爆するので、必ず組み合わせで書く。
 * 「カーフ」「クロコ」だけでは本体（革ベルト付きの時計）を巻き込む。
 */
const PART_PHRASES = [
  /*
   * 「レザーストラップ」「ラバーストラップ」単体は入れてはいけない。
   * 本物の時計が付属ベルトの素材として書く（ブライトリング ナビタイマー32 ¥411,100、
   * ブランパン フィフティファゾムズ ¥2,365,800 を消しかけた）。
   * 「純正」「替え」「交換」「◯◯用」のように、
   * **それ自体が商品であることを示す語**と組み合わせて初めて判定できる。
   */
  /*
   * 「純正ベルト」「Dバックル」も入れてはいけない。高級時計の売り文句だった。
   *   「ロレックス デイトナ 116519NG … リザード純正ベルト 純正バックル」¥8,500,000
   *   「パテック アニュアルカレンダー … Dバックル仕様 箱・保証書付き」   ¥8,242,500
   *   「ヴァシュロン オーヴァーシーズ … 替えの純正ベルト・純正バックル付き」¥4,147,500
   *   「セイコー GS 金無垢 1971年 … 新品純正ベルト交換済み OH済」      ¥1,398,000
   * どれも本体である。付属品や仕様の説明を、商品そのものと取り違えてはいけない。
   *
   * 残すのは「それ自体が売り物である」と読める言い回しだけにする。
   * 取りこぼしは収集時の価格判定で拾えるが、8百万円の本物を消すと戻らない。
   */
  // 「用ベルト」は入れない。「未使用ベルト付き」の中に含まれてしまう
  //（ブレゲ マリーン2 ¥3,654,000 を消しかけた）。「専用」「対応」なら安全。
  '専用ベルト', '専用バンド', '専用ストラップ', 'に適用', '対応ベルト', '対応バンド',
  'ベルト単品', 'バンド単品', 'ストラップ単品', 'ブレスレット単品', 'メタルブレス単品',
  /*
   * 「一式」「ベルトバンド」は、それ自体が売り物であることを示す。
   * 「カーキフィールドマーフ 38mm用 純正メタルブレスレット一式」¥21,780
   * 「ステンレススチール 22mm ベルトバンド ブレス シンライン クロノ」¥21,780
   * 「ブレス」単独は入れてはいけない。本物の時計がブレスレットの素材として書く
   * （シチズン キー エコドライブ スクエア メタルブレス ¥29,700 を消しかけた）。
   */
  'ブレスレット一式', 'ベルトバンド', 'バンドセット',
  /*
   * 「替えベルト」「替えバンド」を入れてはいけない。本物の時計の付属品表記だった。
   *   「オリエントスター M34 F8 デイト 替えベルト付 自動巻 RK-BX0003L」¥363,000
   *   「シチズンエル レディース腕時計 替えベルトつき エコドライブ EW5593-64D」¥42,900
   * 実際に入れてしまい、オリエント26件・シチズン15件の本物を消した。
   */
  'ウォッチバンド', '時計バンド', '時計ベルト', '腕時計ベルト', '腕時計バンド',
  'リザード型押し', '型押しベルト', 'クロコベルト', 'クロコダイルベルト',
  // 留め具・小部品（単体で売られている形だけ）
  'バックル単品', '尾錠単品', '美錠',
  'コマ詰め', 'コマ調整', '駒詰め', 'バネ棒', 'ばね棒', '弓カン', '遊環',
  'リューズ単品', 'ベゼル単品', '風防交換', 'パッキン交換', 'ガラス交換',
  '部品単品', 'パーツ単品', '交換用パーツ',
  /*
   * ムーブメントの部品。時計本体ではない。
   * 「オーデマピゲ メインスプリング ＃audemars piguet cal 2124」¥21,980 が
   * オーデマピゲの最安値として先頭に出ていた。
   *
   * 「ゼンマイ」を入れてはいけない。本物の売り文句だった。
   *   「ハミルトン カーキ フィールド エクスペディション … NivachronR製ヒゲゼンマイ」¥182,600
   *   「ハミルトン イントラマティック オート … ニヴァクロン製ヒゲゼンマイ」      ¥169,400
   * ヒゲゼンマイ（テンプの部品）の材質は、高級機が誇る仕様である。
   */
  'メインスプリング', 'ムーブメントパート', 'ムーブメント単体', '機械のみ',
  'パーツ用', '部品用', 'ジャンク扱い'];

/** 誤爆しやすい語を守る。ここに当たれば、弱い判定では弾かない */
const ALLOW = [
  'パーペチュアルカレンダー', 'アニュアルカレンダー', 'トリプルカレンダー', 'カレンダー機能',
  'クロスシー', 'クロスオーバー', 'シースルーバック', 'スケルトンバック', 'バックライト',
  'ラグジュアリー', 'ラグ幅', 'ラグ・スポーツ', 'コーティング加工',
  'DLCコーティング', 'PVDコーティング', 'ダイヤモンドコーティング'];

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const build = (words) => new RegExp(words.map(esc).join('|'), 'i');

const STRONG_RE = build([...STRONG, ...STRAP_MAKERS]);
const PART_RE = build(PART_PHRASES);
const ALLOW_RE = build(ALLOW);

/**
 * 「◯◯専用ベルト」の形。素材名が間に入るので語の一致では拾えない。
 * 「カーキフィールドオート40mm専用ステンレスベルト」「ジャズマスター専用メタルバンド」
 */
const DEDICATED_PART_RE = /専用[^\s　]{0,8}(?:ベルト|バンド|ブレスレット)/;

/**
 * 英語で「◯◯用の部品」と書く出品。海外の部品商が機械翻訳で出している。
 *   「lower bridge for …」「watch hand for tudor」「plexi glass for case reference」
 *   「ベゼル挿入for Omega Seamaster」「STONEWALL for PANERAI キャンバス ストラップ」
 * これらがチューダー・ブライトリング・パネライの最安値として先頭に出ていた。
 *
 * 「NOS」（new old stock）は入れてはいけない。
 * 「mens rare & vintage longines」¥61,980 のような本物のヴィンテージにも付く。
 */
const ENGLISH_PART_RE =
  /\b(?:hands?|screws?|clamps?|crystal|glass|gasket|stem|crown|wheel|bridge|plate|parts?|dial|bezel|case)\s+for\b|\bfor\s+(?:tudor|rolex|omega|breitling|panerai|zenith|longines|seiko|cartier|iwc|hamilton|tissot|rado|oris)\b/i;

/**
 * 型番を「／」で3つ以上並べる出品は、対応機種を列挙した部品である。
 * 「ハミルトン純正 H77616133／H77626153／H77756131／H77636143 ステンレススチール ベルト」
 *
 * 型番の数だけで判定してはいけない。オーデマピゲの型番（15500ST.OO.1220ST.01）は
 * 区切りを含むため、単純に数えると本物が1,554件も該当した。
 * 「5桁以上の数字をスラッシュで区切って3つ以上」かつ部品の語がある場合に限る。
 */
const SLASH_REF_LIST_RE =
  /[A-Z]{0,3}[0-9]{5,}[A-Z0-9]*[／/][A-Z]{0,3}[0-9]{5,}[A-Z0-9]*[／/][A-Z]{0,3}[0-9]{5,}/i;
const PART_WORD_RE = /ベルト|バンド|ブレスレット|ストラップ/;

/**
 * 出品タイトルが腕時計本体のものでないなら true。
 *
 * 出品は落としても他の出品が残るので、広めに弾いてよい。
 * ベルトが1件混ざれば、それが「最安値」として一覧の先頭に出て、
 * 価格比較サイトとしての信用が崩れる。取りこぼしより害が大きい。
 */
export function isJunkTitle(title) {
  const t = String(title ?? '');
  if (!t) return false;
  /*
   * 「ストラップ」だけで弾いてはいけない。
   * 本物の時計も、付属するベルトの種類を説明するために書く。
   *   「ブライトリング ナビタイマー32 … アリゲーターレザーストラップ A77320」¥411,100
   *   「ブランパン フィフティファゾムズ 38mm … ラバーストラップ 自動巻き」  ¥2,365,800
   * どちらも本体である。語だけでは商品そのものか説明かを区別できない。
   * だから語は組み合わせ（PART_PHRASES）だけで見て、
   * 足りない分は価格で判断する（isJunkPrice）。
   */
  if (STRONG_RE.test(t) || PART_RE.test(t)) return true;
  if (DEDICATED_PART_RE.test(t)) return true;
  if (ENGLISH_PART_RE.test(t)) return true;
  return SLASH_REF_LIST_RE.test(t) && PART_WORD_RE.test(t);
}

/**
 * 価格でゴミを見抜く。
 *
 * 語よりも確実な判別材料。ロイヤルオークが2万円、ハミルトンが1万6千円で
 * 出ていれば、それはベルトか小物である。言語に依存しないので取り違えない。
 *
 * 下限は data/brand-min-price.json のブランド別の値を使う。
 * 「これより安ければ本体ではない」という意味の数字なので、そのまま使える。
 */
export function isJunkPrice(price, floor) {
  const p = Number(price) || 0;
  const f = Number(floor) || 0;
  return p > 0 && f > 0 && p < f;
}

/**
 * その出品が時計そのものであることを示す語を持つか。
 *
 * 駆動方式や文字盤に触れているのは時計本体だけである。
 * ベルトや留め具の出品は、素材と取付幅は書いても、
 * 「自動巻き」「文字盤」とは書かない。
 *
 * 価格だけで消すと本物のヴィンテージを失うので、この signal で守る。
 *   「デッドストック級 オメガ 銀文字盤 手巻き ヴィンテージ レディース腕時計」¥40,000
 *   （オメガの下限¥60,000 を下回るが本物）
 * 逆にこの語が無ければ、下限割れは本体でない証拠として使える。
 *   「ハミルトン 純正Dバックル 16mm/18mm/20mm プッシュ式」¥10,450
 *
 * 「腕時計」だけでは足りない。ベルトの出品も「腕時計ベルト」と書く。
 * 古い時計は駆動方式を書かないことがあるので、アンティーク・ヴィンテージも signal に含める
 * （ヴァシュロン 6803 ¥278,000、オーデマピゲ D71512 ¥188,000 を消しかけた）。
 */
const WATCH_SIGNAL =
  /自動巻|手巻|クォーツ|クオーツ|ソーラー|電波|エコドライブ|スプリングドライブ|文字盤|ムーブメント|キャリバー|AUTOMATIC|QUARTZ|CHRONOGRAPH|自動巻き|アンティーク|ヴィンテージ|ビンテージ|Antique|Vintage/i;

export function looksLikeWatch(title) {
  return WATCH_SIGNAL.test(String(title ?? ''));
}

/**
 * 出品がゴミなら true。語と価格の両方で見る。
 * 掃除にも収集にも、判断はこの1つに揃える。
 */
export function isJunkOffer(title, price, floor) {
  if (isJunkTitle(title)) return true;
  if (isOtherBrand(title)) return true;
  // 安すぎるうえ、時計であることを示す語も無いなら本体ではない
  return isJunkPrice(price, floor) && !looksLikeWatch(title);
}

/**
 * カタログのモデル名が腕時計でないなら true。
 *
 * モデルごと消す判断なので、確実なものだけにする。
 * 誤って消すと、その型番のページが丸ごと失われ、検索から辿れなくなる。
 */
export function isJunkName(name) {
  const t = String(name ?? '');
  if (!t) return false;
  if (ALLOW_RE.test(t)) return false;
  return STRONG_RE.test(t) || PART_RE.test(t);
}

/**
 * 当サイトが扱わない他社ブランド。
 *
 * 「ARMANI EXCHANGE Lady Hamilton」はアルマーニの時計だが、商品名に
 * ハミルトンが入るためハミルトンの棚に並んでいた。同じ理由で、
 * オメガの棚にカシオ、ロレックスの棚にニクソン、ジンの棚にエルジンが入っていた。
 *
 * **自社の系列名を入れてはいけない。** BABY-G はカシオ、ORIENT STAR はオリエント、
 * ALBA / WIRED はセイコーの系列。入れた結果 casio 165件・orient 92件を誤検出した。
 */
const OUTSIDE_BRANDS = [
  'ARMANI', 'アルマーニ', 'GUCCI', 'グッチ', 'DIESEL', 'ディーゼル', 'FOSSIL', 'フォッシル',
  'MICHAEL KORS', 'マイケルコース', 'TIMEX', 'タイメックス',
  'DANIEL WELLINGTON', 'ダニエルウェリントン', 'ELGIN', 'エルジン', 'WALTHAM', 'ウォルサム',
  'SKAGEN', 'スカーゲン', 'NIXON', 'ニクソン', 'MARC JACOBS', 'KATE SPADE',
  'VERSACE', 'ヴェルサーチ', 'BURBERRY', 'バーバリー', 'CHANEL', 'シャネル',
  'LOUIS VUITTON', 'ルイヴィトン',
];
const OUTSIDE_RE = build(OUTSIDE_BRANDS);
/**
 * 表記が割れる他社ブランドは正規表現で書く。
 * 「Henryロンドンhl39-m-0062 ホルボーン Burgundy ハミルトンゴールド腕時計」は
 * 文字盤の色名が「ハミルトンゴールド」なだけで、ヘンリーロンドンの時計である。
 */
const OUTSIDE_RE2 = /Henry\s*(?:ロンドン|LONDON)/i;
/**
 * コラボは本物の商品。ブランパン×スウォッチ、オーデマピゲ×スウォッチ、
 * モンクレール×オーデマピゲなど。他社名が出ても混入ではない。
 */
const COLLAB_RE = /[×xX✕]\s*(?:スウォッチ|SWATCH|MONCLER|モンクレール)|コラボ|collaboration/i;

/**
 * ブランド名が別のカタカナ語の一部として一致していないか調べる。
 *
 * 日本語には単語の区切りが無い。「ジン」は「ロンジン」に含まれるので、
 * ジンの棚にロンジンの時計が958件（棚の7割）並んでいた。
 * ソーラーパネルの「ジンコ(JinKO)」、タイヤの「アゼニス(AZENIS)」も同じ理由で入っていた。
 *
 * **全ブランドに掛けてはいけない。** 掛けると
 * 「ザシチズン」「オフィチーネパネライ」「グランドセイコー」まで落ちる。
 * 実測では1,461件が落ち、うち380件が本物だった。
 * だから data/brand-match.json に載せたブランドだけに適用する。
 */
let matchRules = null;
function loadMatchRules() {
  if (matchRules) return matchRules;
  matchRules = {};
  try {
    const j = JSON.parse(fs.readFileSync(new URL('../../data/brand-match.json', import.meta.url), 'utf8'));
    for (const [b, r] of Object.entries(j.brands ?? {})) {
      matchRules[b] = { allowBefore: r.allowBefore ?? [], alsoAfter: r.alsoAfter === true };
    }
  } catch {
    matchRules = {};
  }
  return matchRules;
}
/** カタカナと長音符。半角カナも含める */
const KANA_RE = /[ァ-ヶーｦ-ﾟ]/;

/**
 * その出品タイトルが、本当にそのブランドの商品か。
 * ブランド名が独立して現れる箇所が1つでもあれば true。
 */
export function brandNameStandsAlone(brandId, title, nameJa, nameEn = '') {
  const t = String(title ?? '');
  const n = String(nameJa ?? '');
  /*
   * 英字だけの短いブランド名は、他社の品番の一部として一致する。
   * これは data/brand-match.json の対象かどうかに関係なく起きるので、先に見る。
   *   「アイリスオーヤマ ワインセラー 32本 IWC-C321A-B」   ← IWCの棚に入っていた
   *   「Lenovo IdeaPad Slim 3i Gen 11 83RS0014JP 16IWC11」← 同上（ノートパソコン）
   * 前後が英数字、または直後がハイフン＋英数字なら品番の一部とみなす。
   * IWCの出品1,370件のうち、この規則で落ちるのは上の9件だけだった。
   */
  if (/^[A-Za-z0-9]{2,4}$/.test(n)) {
    return new RegExp(`(?:^|[^A-Za-z0-9])${esc(n)}(?![A-Za-z0-9]|-[A-Za-z0-9])`, 'i').test(t);
  }
  const rule = loadMatchRules()[String(brandId ?? '')];
  if (!rule) return true; // 対象外のブランドは従来どおり
  const allow = rule.allowBefore;
  /*
   * 英語名で書かれていれば、その時点でそのブランドの商品である。
   * 「ZENITH El Primero 36000 VpH」には「ゼニス」が無いので、
   * 日本語名だけを見ると本物を落としてしまう。
   * 英語名はアルファベットなので語の切れ目があり、埋め込み一致の心配が少ない。
   */
  const en = String(nameEn ?? '').trim();
  if (en && new RegExp(`(?:^|[^A-Za-z])${esc(en)}(?![A-Za-z])`, 'i').test(t)) return true;
  if (!n) return true;
  let i = -1;
  while ((i = t.indexOf(n, i + 1)) !== -1) {
    const before = t.slice(0, i);
    /*
     * 直後のカタカナも見るのは、2文字のブランドだけ。
     * 「ジンバル」（タジマのレーザー墨出器）「メモリジン」（別ブランド）が残ってしまうため。
     * 長い名前に掛けると「ブライトリングプレミエ」「オメガスピードマスター」のような
     * ブランド名に商品名が続く本物まで落ちる。
     */
    const afterOk = !rule.alsoAfter || !KANA_RE.test(t[i + n.length] ?? '');
    if (!afterOk) continue;
    if (i === 0) return true;
    if (!KANA_RE.test(before.slice(-1))) return true;
    if (allow.some((a) => before.endsWith(a))) return true;
  }
  return false;
}

/**
 * 資本や系列でつながっていて、名前が並んでも不自然でない組み合わせ。
 * セイコーエプソンはオリエントの親会社なので
 * 「SEIKO EPSON セイコーエプソン ORIENT STAR オリエントスター」は本物である。
 */
const SAME_FAMILY = [
  ['grand-seiko', 'seiko'],
  ['orient', 'seiko'],
];
const isSameFamily = (a, b) => a === b || SAME_FAMILY.some((p) => p.includes(a) && p.includes(b));

/**
 * 出品タイトルの中で、他ブランドの名前が自ブランドより先に出ていないか。
 *
 * 出品は自分が売る商品の名前を先に書く。後ろに出る他社名は、
 * 文字盤の様式（ブレゲ数字）、愛称（ベビーパネライ）、店の扱い品目の羅列である。
 * 逆に**先に**他社名が出るなら、それがその商品の正体である。
 *
 *   「セイコーSEIKO 腕時計 SUR829P1」          ← ロレックスの棚にあった
 *   「カルティエ ラドーニャSM W640020H」        ← ラドーの棚（ラドーニャ ⊃ ラドー）
 *   「TISSOT ティー コンプリカシオン スケレッテ」 ← カシオの棚（コンプリカシオン ⊃ カシオ）
 *   「ロンジン マスターコレクション ブレゲ数字」    ← ブレゲの棚
 *
 * ブランド名の一致には brandNameStandsAlone を通す。通さないと
 * 「オリジン」の中の「ジン」を拾い、本物のG-SHOCKをカシオの棚から消す。
 *
 * @param {string} title 出品タイトル
 * @param {{id:string,name_ja:string,name_en:string}} me その棚のブランド
 * @param {Array} others 他の全ブランド
 * @returns {object|null} 先に出ていた他ブランド。無ければ null
 */
export function otherBrandComesFirst(title, me, others) {
  const t = String(title ?? '');
  const pos = (b) => {
    if (!brandNameStandsAlone(b.id, t, b.name_ja, b.name_en)) return -1;
    const ja = b.name_ja ? t.indexOf(b.name_ja) : -1;
    const en = b.name_en ? t.toUpperCase().indexOf(String(b.name_en).toUpperCase()) : -1;
    if (ja < 0) return en;
    if (en < 0) return ja;
    return Math.min(ja, en);
  };
  const mine = pos(me);
  if (mine < 0) return null;
  let best = null;
  for (const b of others) {
    if (isSameFamily(b.id, me.id)) continue;
    const p = pos(b);
    if (p >= 0 && p < mine && (!best || p < best.p)) best = { brand: b, p };
  }
  return best ? best.brand : null;
}

/** その出品が他社ブランドの商品なら true */
export function isOtherBrand(title) {
  const t = String(title ?? '');
  if (COLLAB_RE.test(t)) return false;
  return OUTSIDE_RE.test(t) || OUTSIDE_RE2.test(t);
}


/**
 * ブランド別の「時計ではない型番」。data/junk-refs.json から読む。
 *
 * ベルトや部品には本体と別の品番体系があり、商品名だけでは見分けられない。
 * ハミルトンは 時計=H+8桁 / ベルト=H+9桁 で、桁数でしか区別できなかった。
 * コードに埋めず data に置くのは、増やすのが調査の結果だからである。
 */
let junkRefRules = null;
function loadJunkRefs() {
  if (junkRefRules) return junkRefRules;
  junkRefRules = {};
  try {
    const url = new URL('../../data/junk-refs.json', import.meta.url);
    const j = JSON.parse(fs.readFileSync(url, 'utf8'));
    for (const [b, list] of Object.entries(j.brands ?? {})) {
      junkRefRules[b] = (list ?? []).map((r) => new RegExp(r.pattern, 'i'));
    }
  } catch {
    junkRefRules = {};
  }
  return junkRefRules;
}

/** その型番がベルトや部品のものなら true */
export function isJunkRef(brandId, reference) {
  const rules = loadJunkRefs()[String(brandId ?? '')];
  if (!rules?.length) return false;
  const n = String(reference ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!n) return false;
  return rules.some((re) => re.test(n));
}

/**
 * 中古店の管理番号。型番ではない。
 *
 * 店は自分が扱う全ブランドに同じ体系の番号を振るので、
 * **同じ形の番号が多数のブランドに散らばる**。本物の型番は1ブランドにしか出ない。
 * これを手掛かりに、実データで散らばりを数えて洗い出した（2026-08-17）。
 *
 *   ABC+5桁 … 25ブランド 331件   HK+5桁 … 19ブランド    DH+5桁 … 19ブランド
 *   JS+4桁  … 19ブランド          BT+4桁 … 15ブランド    JP+5桁 … 12ブランド
 *
 * 出品の787件が該当し、うち700件は同じ出品タイトルに本物の型番も載っていた
 * （＝そのモデルのページは別に存在するので、消しても時計が消えるわけではない）。
 *
 * 人手カタログ968件では1件も一致しないことを確認済み。
 * 増やすときは必ず data/brands/ で誤爆しないことを確かめること。
 */
const MGMT_REF_RE = /^(?:ABC|HK|DH|JS|BT|JP|YI|MW|AC|OW|FT|WA)[0-9]{4,6}$/;
/**
 * 先頭が0の数字だけの番号も、同じ中古店の管理番号である。
 * 「デッドストック級 稼働 ロレックス オイスターデイト 6694 1017326 手巻 … 0565620」
 * のように、本物の型番（6694）と並べて末尾に振られる。237件が該当し、
 * ロレックス44・カルティエ40・オメガ30と全ブランドに散っていた。
 * 人手カタログ968件では1件も一致しない。
 */
const ZERO_LEAD_RE = /^0[0-9]{5,7}$/;

/** その型番が中古店の管理番号なら true */
export function isManagementRef(reference) {
  const n = String(reference ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return MGMT_REF_RE.test(n) || ZERO_LEAD_RE.test(n);
}

/**
 * 型番の頭に付いた「Ref.」を落とす。
 *
 * 「Ref.」は "reference"（型番）を意味する目印であって、型番の一部ではない。
 * そのまま拾うと REF.26393ST.OO というモデルができ、
 * 26393ST.OO を探している人に見つけてもらえない。796件が該当した。
 */
export function stripRefPrefix(ref) {
  const s = String(ref ?? '');
  const m = s.match(/^(?:REF|Ref|ref)[.\-_\s]*(.+)$/);
  if (!m) return s;
  const rest = m[1];
  // 落とした結果に数字が残らないなら、型番として意味を成さないので触らない
  return /[0-9]/.test(rest) ? rest : s;
}

/**
 * 型番の先頭に付いた色名を落とす。
 *
 * リユース店の出品は「HAMILTON◆クォーツ腕時計/アナログ/WHT/SLV/H374510【服飾雑貨他】」
 * のように、色や素材をスラッシュで並べてから型番を書く。
 * これをそのまま型番として拾うと「WHT/SLV/H374510」という存在しない型番のページができ、
 * 本来の H374510 とは別物として二重に載る。
 *
 * 消すのではなく直す。型番自体は本物なので、消せばその時計のページが失われる。
 */
const COLOR_TOKEN =
  /^(?:WHT|BLK|SLV|GRY|GRN|NVY|BRW|BRN|RED|BLU|PNK|YEL|YLW|ORG|BGE|BEG|KHK|GLD|PPL|PUP|CRM|IVR|CAM|MLT|LBL|DBL|WIN|MOK|SS|YG|PG|WG)$/i;

export function stripColorPrefix(ref) {
  const s = String(ref ?? '');
  if (!s.includes('/')) return s;
  const parts = s.split('/');
  let i = 0;
  while (i < parts.length - 1 && COLOR_TOKEN.test(parts[i])) i++;
  if (i === 0) return s;
  const rest = parts.slice(i).join('/');
  // 全部が色名なら型番ではない。元のまま返して、他の規則（数字4桁など）に任せる
  return COLOR_TOKEN.test(rest) ? s : rest;
}

/** どの語で弾いたかを返す。掃除の結果を人が確かめられるようにする */
export function junkReason(text) {
  const t = String(text ?? '');
  if (ALLOW_RE.test(t)) return null;
  return (STRONG_RE.exec(t) ?? PART_RE.exec(t))?.[0] ?? null;
}
