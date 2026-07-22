# 時計価格ナビ / Watch Price Navi

世界の腕時計ブランドの最安値を横断比較できる、日英2言語対応の価格比較サイト（日本版Chrono24を目指すプロジェクト）。

- **価格収集**: 楽天市場・Yahoo!ショッピングの公式APIから**1日2回**自動取得（アフィリエイトリンク化）
- **時計特化のファセット検索**: ブランド・価格帯・ケース径・素材（チタン/カーボン等12種）・ムーブメント（6種）・機能（ダイバーズ/トゥールビヨン等27種）・防水・性別で絞り込み
- **ブログ全自動**: 毎朝1本の時計記事を自動生成・公開し、記事から購入導線へ誘導
- **新作の自動検出**: カタログ未収録の型番を出品から検出し候補として提示
- **提携外店舗**: 宝石広場・GMT等は価格なしの「取扱店リンク」として掲載
- **完全自動運用**: GitHub Actions が毎朝6時・毎夕18時に更新 → 再ビルド → GitHub Pages へ公開
- **収益源**: 楽天アフィリエイト / バリューコマース(Yahoo!) / Google AdSense（将来: eBay・Amazon）

## フォルダ構成

```
app/            ページ (Next.js App Router, /ja/ と /en/ の2言語)
  [lang]/search/          ファセット検索
  [lang]/blog/            ブログ一覧・記事
  [lang]/watch/…          モデル別の価格比較ページ
components/     UIコンポーネント (SearchExplorer が検索の中核)
lib/            設定・多言語辞書・データ読み込み・タクソノミー
data/brands/    ブランド・モデルのカタログ (JSON, 1ブランド1ファイル)
data/taxonomy.json 検索の区分定義（素材・ムーブメント・機能タグ）
data/blog/      ブログ記事 (毎朝1本自動追加)
data/dealers.json  提携外の取扱店リンク定義
data/pending-models.json  自動検出された新作モデル候補
data/prices/    自動収集された価格データ (gitには保存しない)
scripts/        価格収集・ブログ生成・新作検出・検索インデックス・検証
.github/workflows/update-prices.yml  1日2回の自動更新パイプライン
docs/           セットアップ手順・収益化ロードマップ・運用ガイド
```

## クイックスタート（ローカル確認）

```powershell
npm install
Copy-Item .env.example .env   # APIキーを入力（なくてもサイト表示は可能）
npm run validate              # カタログデータの検証
npm run fetch-prices -- --brand rolex --limit 3   # 価格収集のテスト
npm run dev                   # http://localhost:3000/ja/
```

## 本番運用

**docs/セットアップ手順.md** の手順どおりに GitHub リポジトリと各アフィリエイトの無料アカウントを作成すれば、以後は全自動で運用されます。

- 収益化の考え方と月30万円への道筋: **docs/収益化ロードマップ.md**
- モデル追加・言語追加・トラブル対応: **docs/運用ガイド.md**
