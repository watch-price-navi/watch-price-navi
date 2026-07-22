# API調査ファクト集（腕時計価格比較サイト実装用）

調査日: 2026-07-21 / 調査方法: 公式デベロッパードキュメント等の一次情報をWeb調査

---

## 1. 楽天市場商品検索API（Rakuten Ichiba Item Search API）

### 1.1 エンドポイントとバージョン

- **最新エンドポイント（version: 2026-07-01）**:
  `https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701`
  - 出典: https://webservice.rakuten.co.jp/documentation/ichiba-item-search
- **重要（2026年インフラ移行）**: 従来の `https://app.rakuten.co.jp/services/api/IchibaItem/Search/20220601` は新ホスト `openapi.rakuten.co.jp` へ移行中。旧 `/20220601` 系は **2026-08-17 に完全廃止予定**（2026-06-19 以降タグ情報のレスポンス停止）。新規実装は必ず新ホスト・新バージョンを使うこと。
  - 出典: https://webservice.rakuten.co.jp/documentation/ichiba-item-search 、移行実録: https://miscnote.com/blog/20260217-entry-01/
- **認証の変更点**: 新システムでは `applicationId` に加えて **`accessKey` が必須**（クエリパラメータまたはヘッダで送信可）。また Referer ヘッダではなく **`Origin` ヘッダ**（自サイトのドメイン）を要求される（欠落時 `REQUEST_CONTEXT_BODY_HTTP_REFERRER_MISSING` 系エラー）。
  - 出典: https://webservice.rakuten.co.jp/documentation/ichiba-item-search 、https://miscnote.com/blog/20260217-entry-01/

### 1.2 主要リクエストパラメータ

| パラメータ | 型 | 必須 | 内容 |
|---|---|---|---|
| `applicationId` | String | 必須 | アプリID（accessKeyと併用必須） |
| `accessKey` | String | 必須 | 2026年新システムで追加されたAPIキー |
| `affiliateId` | String | 任意 | 楽天アフィリエイトID。指定するとレスポンスに `affiliateUrl` が付与される |
| `keyword` | String | ※ | UTF-8 URLエンコード、最大128バイト、最小2文字。keyword/genreId/itemCode/shopCode のいずれか1つ以上必須 |
| `sort` | String | 任意 | `standard`(既定) / `+itemPrice` / `-itemPrice` / `+reviewAverage` / `-reviewAverage` / `+updateTimestamp` 等。URLエンコード必要（`+`→`%2B`） |
| `hits` | int | 任意 | 1〜30（既定30） |
| `genreId` | long | 任意 | ジャンルID（既定0=全ジャンル） |
| `minPrice` / `maxPrice` | long | 任意 | 1以上999,999,999未満。maxPrice > minPrice |

- 出典: https://webservice.rakuten.co.jp/documentation/ichiba-item-search

### 1.3 腕時計ジャンルの genreId

- **腕時計（トップレベルジャンル）: `genreId=558929`**（楽天市場カテゴリページ https://www.rakuten.co.jp/category/558929/ が「腕時計」であることで確認）
- 主な下位ジャンル: メンズ腕時計 `301981` / レディース腕時計 `302050` / 男女兼用腕時計 `302133` / ペアウォッチ `302123` / キッズ用腕時計 `213891` / 懐中時計 `565251` / 腕時計用アクセサリー `302178`
- ジャンル階層は楽天ジャンル検索API（IchibaGenre/Search）で `genreId=558929` を指定して取得・検証可能。
- 出典: https://www.rakuten.co.jp/category/558929/ 、https://best-item.work/affiliate/rakuten-genreid/ 、https://webservice.rakuten.co.jp/documentation（ジャンル検索API）

### 1.4 レスポンス主要フィールド（Items[].Item 配下）

| フィールド | 内容 |
|---|---|
| `itemName` | 商品名 |
| `itemPrice` | 価格（int, 円） |
| `itemUrl` | 商品URL（HTTPS） |
| `affiliateUrl` | アフィリエイトURL（`affiliateId` 指定時のみ） |
| `shopName` | 店舗名 |
| `mediumImageUrls` | 商品画像128x128px（配列、最大3件） |
| `reviewCount` / `reviewAverage` | レビュー件数 / 平均 |
| `availability` | 在庫（0=なし, 1=あり） |

- 出典: https://webservice.rakuten.co.jp/documentation/ichiba-item-search

### 1.5 レート制限

- **リクエスト間隔は1秒以上空けること（実質 1リクエスト/秒）**。短時間に同一URLへ大量アクセスすると一定期間利用不可になる恐れあり。超過時は HTTP 429。
- 規約上、当社（楽天）はアクセス回数・時刻・頻度等の利用範囲に制限を課すことができる（第7条3項）。
- 出典: https://webservice.rakuten.co.jp/guide/rule 、https://webservice.rakuten.co.jp/documentation/ichiba-item-search

### 1.6 クレジット表記義務

- **表示は義務**。以下のいずれか1つを表示し、**リンク先は `https://webservice.rakuten.co.jp/`** とする:
  1. 小バナー画像（221×21px）
  2. 大バナー画像（311×30px）
  3. テキストリンク **「Supported by Rakuten Developers」**
- 提供されるHTMLスニペット・画像は**改変禁止**。掲載位置はサイト内どこでも可だが、楽天ウェブサービス利用が分からなくなる表示や、楽天運営サイトと誤認させる配置は不可。違反時は**API利用停止の可能性**。
- 出典: https://webservice.rakuten.co.jp/guide/credit

---

## 2. Yahoo!ショッピング商品検索API（itemSearch V3）

### 2.1 エンドポイント

- `https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch`（GET, レスポンスはJSON）
- 出典: https://developer.yahoo.co.jp/webapi/shopping/v3/itemsearch.html

### 2.2 主要リクエストパラメータ

| パラメータ | 型 | 必須 | 内容 |
|---|---|---|---|
| `appid` | String | 必須 | Client ID（アプリケーションID） |
| `query` | String | ※ | 検索キーワード（UTF-8、URLエンコード必要） |
| `sort` | String | 任意 | `-score`(おすすめ順・既定) / `+price`(安い順) / `-price`(高い順) / `-review_count`。URLエンコード必要（`+`→`%2B`, `-`→`%2D`） |
| `results` | int | 任意 | 取得件数。既定20、最大50。`start + results` の合計は1,000超不可 |
| `condition` | String | 任意 | `new`(既定) / `used` |
| `price_from` / `price_to` | int | 任意 | 価格下限 / 上限 |
| `affiliate_type` | String | 任意 | ValueCommerce利用時は `vc` |
| `affiliate_id` | String | 任意 | 下記2.3の形式 |

- 出典: https://developer.yahoo.co.jp/webapi/shopping/v3/itemsearch.html

### 2.3 ValueCommerceアフィリエイトの指定形式（公式手順）

1. `affiliate_type=vc` を指定。
2. `affiliate_id` には、ValueCommerceのリダイレクトURL:
   `http://ck.jp.ap.valuecommerce.com/servlet/referral?sid=【自分のsid】&pid=【自分のpid】`
   の末尾に **`&vc_url=` を付加**した文字列全体を、**URLエンコードして**指定する。
   - エンコード例: `/`→`%2F`, `=`→`%3D`, `&`→`%26`
   - エンコード後の例（形式）:
     `affiliate_id=http%3A%2F%2Fck.jp.ap.valuecommerce.com%2Fservlet%2Freferral%3Fsid%3DXXXXXXX%26pid%3DYYYYYYYYYY%26vc_url%3D`
3. 成功すると、レスポンス内の商品URL（`hits[].url`）がアフィリエイトURLに**置換されて**返却される（アクセスするとYahoo!ショッピング商品ページへリダイレクト）。
- sid = ValueCommerceのサイトID、pid = Yahoo!ショッピングプログラムのプログラムID（バリューコマース管理画面で取得）。
- 出典: https://developer.yahoo.co.jp/webapi/shopping/affiliate.html （sid/pid取得の参考: https://wp-cocoon.com/valuecommerce-yahoo-sid-pid/）

### 2.4 レスポンス構造（主要フィールド）

トップレベル: `totalResultsAvailable` / `totalResultsReturned` / `firstResultsPosition` / `hits[]`

| フィールド | 内容 |
|---|---|
| `hits[].name` | 商品名 |
| `hits[].price` | 価格（int, 円） |
| `hits[].url` | 商品URL（affiliate指定時はアフィリエイトURLに置換） |
| `hits[].seller.name` | ストア名 |
| `hits[].image.small` / `hits[].image.medium` | 商品画像URL |
| `hits[].condition` | 商品状態（new/used） |

- 出典: https://developer.yahoo.co.jp/webapi/shopping/v3/itemsearch.html

### 2.5 利用制限（レート制限）

- **商品検索（v3）API固有の制限: 1アプリケーションIDあたり 30リクエスト/分**（2022-06-21にそれまでの「1日50,000リクエスト」から変更。従来の制限緩和適用アプリにも適用）。超過時は HTTP 429。アクセス集中時はさらに制限される場合あり。
  - 出典（公式変更告知）: https://developer.yahoo.co.jp/changelog/2022-05-20-shopping294.html
- Yahoo!デベロッパーネットワーク全般の目安として「1アプリ最大5リクエスト/秒」「1日50,000リクエスト超は Client ID 追加で対応」という記載もある（一般APIむけ。v3商品検索は上記30req/分が優先と解釈するのが安全）。
  - 出典: https://developer.yahoo.co.jp/webapi/shopping/faq.html 、https://developer.yahoo.co.jp/appendix/rate.html

### 2.6 クレジット表記義務

- **Yahoo!デベロッパーネットワークのAPIを利用する全サイト・アプリで表示必須**。
- 許可される表記（いずれか）:
  - テキストリンク **「Webサービス by Yahoo! JAPAN」**（日本語）
  - テキストリンク **「Web Services by Yahoo! JAPAN」**（英語）
  - リンク不可媒体では上記文言＋URLのプレーンテキスト
- **リンク先は `https://developer.yahoo.co.jp/sitemap/`**。提供HTMLの改変（スタイル・色・サイズ変更）は禁止。
- 掲載位置: **アプリケーション（ページ）の最下部**。Webサイトを持たないアプリはストアページ最下部。違反時はAPI利用停止のリスク。
- 出典: https://developer.yahoo.co.jp/attribution/

---

## 3. 利用規約上の価格比較サイトでの利用可否・禁止事項

### 3.1 楽天ウェブサービス利用規約（https://webservice.rakuten.co.jp/guide/rule）

- **利用可否**: アフィリエイトサイト（価格比較・商品紹介）での利用は想定された用途であり可。ただし収益化は条件付き（下記）。
- **主な禁止事項**:
  - **楽天アフィリエイト以外の方法でウェブサービスを用いて収入を得ること**（第10条4号）→ 楽天商品の収益化は必ず `affiliateId` / `affiliateUrl` 経由で行うこと。
  - **楽天グループと競合する（おそれのある）サービスの提供**（第10条6号）→ 価格比較サイト設計時に留意（楽天商品データを楽天と競合する形で使わない）。
  - 取得データを当社が別途定める目的以外で利用・複製・改変すること（第10条7号）→ **無制限なデータ保存・再配布は不可**。
  - 不特定多数とのユーザー情報共有目的の保存（第10条9号）、リバースエンジニアリング。
  - リンクはウェブサービスを利用している楽天サイトへのリンクのみ。
- **義務**: 商品情報が楽天グループ提供であることの表示（第13条）＝ 1.6のクレジット表記。アクセス頻度等は楽天側が制限可能（第7条3項）。

### 3.2 Yahoo!（LINEヤフー）側

- **利用可否**: 商品検索APIはアフィリエイト（ValueCommerce）連携パラメータを公式に提供しており（2.3）、**アフィリエイト・価格比較用途での商用利用が公式に想定されている**。
  - 出典: https://developer.yahoo.co.jp/webapi/shopping/affiliate.html
- **義務・禁止事項**:
  - Yahoo!デベロッパーネットワーク ガイドラインへの同意が必須。アプリケーションID（Client ID）を必ず付して利用すること。クレジット表示ガイドライン・掲載ルールの遵守（2.6）。
    - 出典: https://developer.yahoo.co.jp/guideline/
  - LINEヤフーの名義を冒用する行為（LINEヤフー名義のパンフレット等の作成・使用等）の禁止。個人情報を扱う場合はLINEヤフーのプライバシーポリシーに準ずる水準の維持。
    - 出典: https://developer.yahoo.co.jp/guideline/ （LINEヤフー共通利用規約参照）
  - 短時間の大量リクエストは利用制限の対象（2.5）。
    - 出典: https://developer.yahoo.co.jp/webapi/shopping/faq.html

### 3.3 実装上の含意（両API共通）

- 価格データはキャッシュ最小限・定期再取得とし、恒久保存や第三者への再配布はしない（楽天第10条7号に抵触し得るため）。
- 楽天へのリンクは `affiliateUrl`、Yahoo!へのリンクは affiliate 指定済み `hits[].url` を使い、生URLで収益化バイパスしない。
- フッターに両クレジット（「Supported by Rakuten Developers」→ webservice.rakuten.co.jp、「Webサービス by Yahoo! JAPAN」→ developer.yahoo.co.jp/sitemap/）を並記する。
- レートリミッタ実装: 楽天 1req/秒、Yahoo! 30req/分（≒0.5req/秒）を上限に、429時は指数バックオフ。

---

## 出典一覧

- 楽天商品検索API公式ドキュメント: https://webservice.rakuten.co.jp/documentation/ichiba-item-search
- 楽天ウェブサービス利用規約: https://webservice.rakuten.co.jp/guide/rule
- 楽天クレジット表記ガイド: https://webservice.rakuten.co.jp/guide/credit
- 楽天「腕時計」カテゴリ（genreId確認）: https://www.rakuten.co.jp/category/558929/
- 楽天API 2026年移行の実装記録（三次確認用）: https://miscnote.com/blog/20260217-entry-01/
- 楽天ジャンルID一覧（参考）: https://best-item.work/affiliate/rakuten-genreid/
- Yahoo!商品検索（v3）公式ドキュメント: https://developer.yahoo.co.jp/webapi/shopping/v3/itemsearch.html
- Yahoo!アフィリエイトプログラム（VC連携公式手順）: https://developer.yahoo.co.jp/webapi/shopping/affiliate.html
- Yahoo!商品検索（v3）利用制限変更告知（30req/分）: https://developer.yahoo.co.jp/changelog/2022-05-20-shopping294.html
- Yahoo!ショッピングAPI FAQ（5rps/50,000/日の一般目安）: https://developer.yahoo.co.jp/webapi/shopping/faq.html
- Yahoo!クレジット表示ガイドライン: https://developer.yahoo.co.jp/attribution/
- Yahoo!デベロッパーネットワーク ガイドライン: https://developer.yahoo.co.jp/guideline/
