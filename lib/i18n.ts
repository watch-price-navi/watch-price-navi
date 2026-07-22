export const LANGS = ['ja', 'en'] as const;
export type Lang = (typeof LANGS)[number];

export function isLang(v: string): v is Lang {
  return (LANGS as readonly string[]).includes(v);
}

type Dict = Record<string, { ja: string; en: string }>;

const dict: Dict = {
  nav_brands: { ja: 'ブランド一覧', en: 'Brands' },
  nav_about: { ja: 'このサイトについて', en: 'About' },
  search_placeholder: { ja: 'ブランド名・モデル名・型番で検索（例: サブマリーナー 126610LN）', en: 'Search brand, model or reference (e.g. Submariner 126610LN)' },
  search_no_results: { ja: '該当するモデルが見つかりません', en: 'No matching models found' },
  pr_badge: { ja: '本サイトはアフィリエイト広告（PR）を利用しています', en: 'This site contains affiliate links (PR)' },
  hero_title: { ja: '世界の腕時計の最安値を、ここで一度に。', en: 'Compare watch prices across stores, in one place.' },
  hero_sub: { ja: '楽天市場・Yahoo!ショッピングの価格を毎日自動収集。高級ブランドから国産まで、欲しいモデルの最安値がすぐ見つかります。', en: 'Prices from Rakuten and Yahoo! Shopping Japan, updated daily. From luxury Swiss brands to Japanese icons, find the best price for the model you want.' },
  stats_brands: { ja: 'ブランド', en: 'brands' },
  stats_models: { ja: 'モデル', en: 'models' },
  stats_daily: { ja: '毎日自動更新', en: 'updated daily' },
  popular_models: { ja: '人気モデル', en: 'Popular models' },
  all_brands: { ja: 'ブランドから探す', en: 'Browse by brand' },
  how_title: { ja: 'このサイトの仕組み', en: 'How it works' },
  how_1_t: { ja: '毎日自動で価格収集', en: 'Daily automatic price collection' },
  how_1_b: { ja: '楽天市場・Yahoo!ショッピングの公式APIから、各モデルの出品価格を毎日自動で取得しています。', en: 'We fetch listings for each model daily via the official Rakuten and Yahoo! Shopping APIs.' },
  how_2_t: { ja: '最安値順に表示', en: 'Sorted by lowest price' },
  how_2_b: { ja: '部品・ベルト等を除外したうえで、本体の出品を安い順に一覧表示。新品・中古の別も分かります。', en: 'Straps and parts are filtered out; genuine listings are ranked from cheapest, with new/used condition shown.' },
  how_3_t: { ja: '提携外の名店もリンク', en: 'Links to specialist dealers' },
  how_3_b: { ja: '宝石広場・GMTなどアフィリエイト提携のない専門店は、価格なしの「取扱店リンク」として掲載しています。', en: 'Specialist dealers without affiliate programs are listed as store links without prices.' },
  models_count: { ja: 'モデル', en: 'models' },
  view_model: { ja: '価格を見る', en: 'See prices' },
  lowest_price: { ja: '最安値', en: 'Lowest price' },
  offers_title: { ja: '販売店別 価格一覧', en: 'Prices by store' },
  offers_col_shop: { ja: '販売店', en: 'Store' },
  offers_col_item: { ja: '商品', en: 'Listing' },
  offers_col_cond: { ja: '状態', en: 'Condition' },
  offers_col_price: { ja: '価格', en: 'Price' },
  offers_col_link: { ja: 'リンク', en: 'Link' },
  buy_at: { ja: '店舗で見る', en: 'View' },
  condition_new: { ja: '新品', en: 'New' },
  condition_used: { ja: '中古', en: 'Used' },
  condition_unknown: { ja: '－', en: '–' },
  source_rakuten: { ja: '楽天市場', en: 'Rakuten' },
  source_yahoo: { ja: 'Yahoo!ショッピング', en: 'Yahoo! Shopping' },
  updated: { ja: '価格更新日', en: 'Prices updated' },
  price_note: { ja: '価格は取得時点のものです。送料・ポイント・在庫は各販売店のページでご確認ください。リンクには広告（アフィリエイト）を含みます。', en: 'Prices are as of the last update. Check shipping, points and stock on the store page. Links may be affiliate links.' },
  no_prices_title: { ja: '価格データ準備中', en: 'Price data coming soon' },
  no_prices_body: { ja: 'このモデルの価格は次回の自動更新で収集されます。下の取扱店リンクからも在庫・価格を確認できます。', en: 'Prices for this model will be collected in the next automatic update. You can also check availability via the dealer links below.' },
  dealers_title: { ja: '取扱店リンク（価格は各店でご確認ください）', en: 'Dealer links (check prices in store)' },
  dealers_note: { ja: '以下はアフィリエイト提携のない販売店・公式サイトへの参考リンクです。当サイトに報酬は発生しません。', en: 'The links below go to dealers and official sites with no affiliate relationship. We earn nothing from them.' },
  official_site: { ja: '公式サイト', en: 'Official site' },
  spec_title: { ja: '基本仕様', en: 'Specifications' },
  spec_ref: { ja: '型番（リファレンス）', en: 'Reference' },
  spec_collection: { ja: 'コレクション', en: 'Collection' },
  spec_case: { ja: 'ケース径', en: 'Case size' },
  spec_movement: { ja: '駆動方式', en: 'Movement' },
  spec_caliber: { ja: 'キャリバー', en: 'Caliber' },
  spec_list_price: { ja: '参考定価', en: 'List price (ref.)' },
  mv_automatic: { ja: '自動巻き', en: 'Automatic' },
  mv_manual: { ja: '手巻き', en: 'Hand-wound' },
  mv_quartz: { ja: 'クォーツ', en: 'Quartz' },
  mv_solar: { ja: 'ソーラー', en: 'Solar' },
  'mv_spring-drive': { ja: 'スプリングドライブ', en: 'Spring Drive' },
  mv_kinetic: { ja: 'キネティック', en: 'Kinetic' },
  related_models: { ja: '同コレクションのモデル', en: 'More from this collection' },
  breadcrumb_home: { ja: 'ホーム', en: 'Home' },
  footer_about: { ja: 'このサイトについて', en: 'About' },
  footer_privacy: { ja: 'プライバシーポリシー', en: 'Privacy Policy' },
  footer_disclaimer: { ja: '免責事項', en: 'Disclaimer' },
  footer_note: { ja: '掲載価格は楽天市場・Yahoo!ショッピングの公式APIから自動取得したものです。当サイトは商品を販売していません。', en: 'Prices are fetched automatically from the official Rakuten and Yahoo! Shopping APIs. This site does not sell products.' },
  brand_models_title: { ja: 'のモデル一覧と最安値', en: ' models & lowest prices' },
  view_all_brands: { ja: 'すべてのブランドを見る', en: 'View all brands' },
  country: { ja: '国', en: 'Country' },
  founded: { ja: '創業', en: 'Founded' },
};

export function t(lang: Lang, key: string): string {
  const e = dict[key];
  if (!e) return key;
  return e[lang];
}

export function localeName(lang: Lang): string {
  return lang === 'ja' ? '日本語' : 'English';
}
