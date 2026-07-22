# 時計アフィリエイト収益設計ファクト集（2026年7月調査）

調査日: 2026-07-21 / 用途: watch-price-navi 収益設計の前提資料
注: 料率・単価は変動するため、実装前に各管理画面で最新値を必ず再確認すること。

---

## 1. 楽天アフィリエイト

- **腕時計ジャンルの料率: 2%**（ジャンル別料率の下位グループ。2021年4月改定以降の体系が継続）。料率アップキャンペーン対象ショップ/商品は最大20%まで上がる。
  - 出典: [楽天アフィリエイト 料率改定について](https://affiliate.rakuten.co.jp/revision/20210128.html) / [料率アップショップ一覧](https://affiliate.rakuten.co.jp/recommend/uplist/)
- **報酬上限: 「1商品1個あたり1,000円（楽天キャッシュ）」の上限は2026年現在も有効**。同一商品を複数個購入した場合は各個ごとに1,000円上限を適用。異なる商品の合計が1,000円を超える分には適用されない。さらに**同一ユーザーからの成果は月3,000円が上限**（楽天市場のみ対象）。料率アップ対象商品はこれら上限の対象外。
  - 出典: [公式FAQ「報酬額に上限はありますか？」](https://affiliate.faq.rakuten.net/detail/000011571)
  - **含意: 30万円のロレックスが売れても報酬は1,000円**。楽天単体では高額時計の単価メリットが出ない。
- **成果条件（クッキー）**: リンククリック後**24時間以内に買い物かごに追加**し、**クリックから89日以内に購入完了**で成果発生。
  - 出典: [公式FAQ「成果報酬が発生する期間」](https://affiliate.faq.rakuten.net/detail/000009818)
- **支払形態**: 原則**楽天キャッシュ**で支払い。月3,001円以上の受け取りには楽天カードまたは楽天銀行の連携が必要。**3カ月連続で月3,001円以上**の実績がある場合のみ銀行振込を選択可能。
  - 出典: [楽天アフィリエイトについて（公式ガイド）](https://affiliate.rakuten.co.jp/guides/begin/) / [公式note 報酬の受け取り方](https://note.com/rakutenaffiliate/n/n7fbdf72f8f60)

## 2. Yahoo!ショッピング（バリューコマース経由）

- **料率**: 商品カテゴリにより**購入金額の1〜50%**（バリューコマース公式表記）。ベース料率は実質**約1%**（比較記事ではもしもアフィリエイト経由は0.77%とされ、バリューコマース経由の方が高い）。カテゴリ別の正確な料率はログイン後のプログラム詳細ページで確認する仕様。
  - 出典: [バリューコマース公式 Yahoo!ショッピング特集](https://www.valuecommerce.ne.jp/pickup/yahoo_af/) / [ConoHaワプ活 解説記事](https://www.conoha.jp/lets-wp/yahooaffiliate/)
- **報酬上限**: 公式ページ上に楽天のような1商品あたり定額上限の明記なし（プログラム詳細で要確認）。
- **LinkSwitchの仕組み**: サイトに1度JSタグを設置すると、**提携済み広告主への直リンク（普通のURL）をページ読み込み時に自動でアフィリエイトリンクへ変換**する機能。
- **LinkSwitch導入手順**: バリューコマース管理画面ログイン → 上部メニュー**「ツール」>「LinkSwitch」>「LinkSwitch設定」** → 「LinkSwitchを利用開始する」→ 表示されたコードをコピー → サイトの**`<head>`内（または`</body>`直前）**に貼り付け（WordPressならheader.phpの`<head>`〜`</head>`間）。
  - 出典: [LinkSwitch公式ガイド](https://www.valuecommerce.ne.jp/stepup/guide/tool/linkswitch/) / [公式ヘルプ LinkSwitchとは](https://help.valuecommerce.ne.jp/aff/tool/linkswitch/01/) / [WordPress掲載手順](https://www.valuecommerce.ne.jp/stepup/guide/tool/linkswitch/wordpress/)
- **審査要件**: バリューコマースは**登録時審査あり**。サイトにアクセスできること、コンテンツが確認できること、一定の記事数が公開されていること等が基準で、ハードルは高くないとされる。Yahoo!ショッピングプログラム自体との提携も必要。
  - 出典: [ConoHaワプ活 解説記事](https://www.conoha.jp/lets-wp/yahooaffiliate/)

## 3. eBay Partner Network（EPN）

- **料率**: カテゴリ別で概ね**1〜5%**。ファッション（Jewelry & Watches系）は上位帯（3〜5%程度）とされる。正確な数値は公式Rate Card（要ログイン確認）参照。
  - 出典: [EPN公式Rate Card](https://partnernetwork.ebay.com/our-program/rate-card) / [CommissionDex EPNレビュー](https://commissiondex.com/program/ebay-partner/)
- **報酬上限**: **カテゴリごとに1取引あたり$100〜$550のキャップ**が設定されている。
  - 出典: [Geniuslink eBayアフィリエイト解説](https://geniuslink.com/blog/ebay-affiliate-program/)
- **クッキー**: **24時間**（業界最短クラス。Buy It Nowは24時間以内購入、オークションは24時間以内入札→10日以内落札で成果）。
  - 出典: [CommissionDex](https://commissiondex.com/program/ebay-partner/) / [SaleHoo 2026年分析](https://www.salehoo.com/learn/is-the-ebay-affiliate-program-worth-your-time)
- **日本からの参加**: **可能**。eBayアカウントでサインアップでき、ほぼ全GEOのトラフィックを受け付ける。条件は**PayPalまたはDirect Depositでの受取が可能な国に居住**していること（日本はPayPal可）。報酬は$25以上で毎月支払い。
  - 出典: [Partnerkin EPN解説](https://partnerkin.com/en/blog/articles/make_money_with_ebay_network) / [日本語の登録手順解説（eBay夫婦）](https://yushutsu.info/?p=1218)

## 4. Amazonアソシエイト（amazon.co.jp）

- **時計（腕時計）カテゴリの紹介料率: 2.00%**（CD・DVD・ゲーム・カメラ・家電と同グループ）。
  - 出典: [公式 紹介料率表](https://affiliate.amazon.co.jp/help/node/topic/GRXPHT8U84RAYDXZ)
- **上限**: **2024年8月7日に「1商品1個あたり1,000円」の紹介料上限が廃止**され、現在は上限なし。高額時計でも売上×2%がそのまま報酬になる（楽天との最大の違い）。
  - 出典: [公式 紹介料上限の廃止のご案内](https://affiliate.amazon.co.jp/help/node/topic/GJ2QX3RTJ9ELJMPP)
- **審査要件**: 登録後は仮参加状態となり、**サインアップから180日以内に3件以上の適格販売**が発生した時点で本審査（サイト内容の審査）が行われる。自己購入・家族購入は対象外。「Amazonのアソシエイトとして、適格販売により収入を得ています」の表記をサイトに明記する義務あり。目安として記事数10本以上が推奨される。
  - 出典: [公式ヘルプ](https://affiliate.amazon.co.jp/help/node/topic/G8TW5AE9XL2VX9VM) / [審査解説（poyaran.com 2026年版）](https://poyaran.com/entry/amazon-associate-requirements)

## 5. ASPの時計関連・高単価案件の例（A8.net / バリューコマース / もしも等）

物販ECの料率（1〜2%）に対し、**時計買取・査定系はリード単価が高く収益の柱にしやすい**。

- **ロレックスの高価買取（買取系広告主）: 成果1件あたり約8,000円**
- **ブランド品買取: 約4,500円** / **金・貴金属買取: 約5,000円** / **着物・毛皮買取: 約4,000円**
  - 出典: [アフィリエイト高単価案件一覧591選（2026年3月版・hinakira.com）](https://hinakira.com/list-of-affiliate-high-paying-projects/)
- **時計査定の窓口**（最大8社の時計一括査定）: **もしもアフィリエイト等で提携可能**な時計特化案件。
  - 出典: [Affisearch 時計査定の窓口 提携ASP一覧](https://media-analytics.jp/affisearch/promotions/tokei-satei-no-madoguchi) / [公式サイト](https://bep.satei.site/)
- **バイセル（出張買取）**: アクセストレード等でアフィリエイター提携実績のある大手買取広告主。
  - 出典: [アクセストレード バイセルインタビュー](https://www.accesstrade.ne.jp/study/affidai/detail/177)
- 注: 具体的な報酬額・提携可否はASP管理画面で要確認（同一広告主でもASPにより単価が異なる）。A8.netには[1万円以上の高額報酬プログラムランキング](https://support.a8.net/as/HintOfProgram/ranking/highprice.php)がある。

## 6. ステマ規制（景品表示法・2023年10月1日施行）の表示義務

- 事業者（広告主）が表示内容に関与しているのに広告と分からない表示は**「不当表示」として景品表示法違反**（規制対象・措置命令を受けるのは広告主だが、違反するとアフィリエイターは提携解除等の実害を受ける）。
- アフィリエイトサイトに求められる具体的要件:
  - 記事・ページに**「PR」「広告」「アフィリエイト広告」等の表記**を、**一般消費者が認識しやすい位置・サイズで明記**する（ページ冒頭付近が推奨。小さすぎる文字や大量のハッシュタグに埋もれる表記はNG）。
  - **アフィリエイトリンクの有無に関わらず**、提携済み商品の紹介やSNSからの自サイト誘導投稿にもPR表記が必要。
  - Amazonの規約上の文言「Amazonのアソシエイトとして、適格販売により収入を得ています」の掲載もこれと併せて必須。
  - 出典: [A8.net公式 ステマ規制に関するお知らせ](https://a8pr.jp/2023/08/31/fairlabeling/) / [NTT東日本 ステマ規制解説](https://business.ntt-east.co.jp/column/bizdrive/stealth-marketing-rules-2023.html) / [PR表記の具体例解説（effectual）](https://effectual.co.jp/sorila/blog/pr-hyoki-stema-kisei/)

## 7. 月30万円達成に必要なクリック数・成約数の試算

前提CVR: 物販クリック→購入 1〜3%、買取系クリック→申込 1〜2%（一般的な目安）。

| シナリオ | 単価前提 | 必要成約 | 必要クリック(CVR2%想定) |
|---|---|---|---|
| A. 楽天のみ（時計2%・上限1,000円） | 1件平均 500〜1,000円 | **300〜600件/月** | 15,000〜30,000/月 |
| B. Amazonのみ（時計2%・上限なし、平均単価5万円の時計） | 1件 1,000円 | 300件/月 | 15,000/月 |
| C. Amazonで高額帯（平均20万円） | 1件 4,000円 | 75件/月 | 3,750/月 |
| D. 時計買取リード中心（1件 5,000〜8,000円） | 1件 6,500円平均 | **約46件/月** | 2,300〜4,600/月（CVR1〜2%） |
| E. 現実的ミックス（買取20件13万円＋EC170件17万円） | 混合 | 約190件/月 | 8,000〜12,000/月 |

- **結論**: 物販（楽天2%・上限1,000円）だけで月30万円は月間1.5万〜3万クリックが必要で非現実的。**高単価の時計買取・査定リード（1件5,000〜8,000円）を収益の柱**にし、EC物販（Amazonは上限廃止済みで高額時計と相性が良い）を補完に置く設計が現実的。必要トラフィックの目安は**月間3万〜10万PV規模**。
- 試算根拠出典: 上記1〜5の各料率・単価（楽天FAQ、Amazon紹介料率表、hinakira高単価案件一覧）に基づくClaude算出（2026-07-21）。

---

## 収益設計上の要点まとめ

1. 楽天は1,000円上限が現存するため高額時計に不向き。Amazonは2024年8月に上限廃止済みで高額時計向き。
2. 主収益源は時計買取・査定系リード案件（1件5,000〜8,000円）に置く。
3. Yahoo!ショッピングはLinkSwitch導入で直リンク自動変換により運用工数を削減。
4. 全記事にステマ規制対応のPR表記を冒頭配置で必須化。
