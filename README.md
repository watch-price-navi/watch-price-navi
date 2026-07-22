# 時計価格ナビ / Watch Price Navi

世界の腕時計ブランドの最安値を横断比較できる、日英2言語対応の価格比較サイト（日本版Chrono24を目指すプロジェクト）。

- **価格収集**: 楽天市場・Yahoo!ショッピングの公式APIから毎日自動取得（アフィリエイトリンク化）
- **提携外店舗**: 宝石広場・GMT等は価格なしの「取扱店リンク」として掲載
- **完全自動運用**: GitHub Actions が毎日 JST 3:00 に価格更新 → 再ビルド → GitHub Pages へ公開
- **収益源**: 楽天アフィリエイト / バリューコマース(Yahoo!) / Google AdSense（将来: eBay・Amazon）

## フォルダ構成

```
app/            ページ (Next.js App Router, /ja/ と /en/ の2言語)
components/     UIコンポーネント
lib/            設定・多言語辞書・データ読み込み
data/brands/    ブランド・モデルのカタログ (JSON, 1ブランド1ファイル)
data/dealers.json  提携外の取扱店リンク定義
data/prices/    自動収集された価格データ (JSON)
scripts/        価格収集・検索インデックス・データ検証スクリプト
.github/workflows/update-prices.yml  毎日の自動更新パイプライン
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
