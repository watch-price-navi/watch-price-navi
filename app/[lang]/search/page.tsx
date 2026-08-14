import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import SearchExplorer from '@/components/SearchExplorer';
import { absUrl } from '@/lib/config';
import { getAllBrands } from '@/lib/data';
import { t, type Lang } from '@/lib/i18n';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const lang = (await params).lang as Lang;
  return {
    title: lang === 'ja' ? '条件から腕時計を探す｜ブランド・価格・ケース径・素材・機能で絞り込み' : 'Find Your Watch — Filter by Brand, Price, Size, Material',
    description:
      lang === 'ja'
        ? 'ブランド・価格帯・ケース径・素材（チタン/カーボン/ステンレス等）・ムーブメント（自動巻き/手巻き/クォーツ/スプリングドライブ）・機能（ダイバーズ/クロノグラフ/GMT等）から腕時計を絞り込み検索。最安値は毎日自動更新。'
        : 'Filter watches by brand, price, case size, material, movement and complication. Lowest prices updated daily from Rakuten and Yahoo! Shopping Japan.',
    alternates: {
      canonical: absUrl(`/${lang}/search/`),
      languages: { ja: absUrl('/ja/search/'), en: absUrl('/en/search/'), 'x-default': absUrl('/en/search/') },
    },
  };
}

const QUICK_PICKS: { q: string; ja: string; en: string }[] = [
  { q: 'tag=diver', ja: 'ダイバーズ', en: 'Divers' },
  { q: 'tag=chronograph', ja: 'クロノグラフ', en: 'Chronographs' },
  { q: 'material=titanium&tag=lightweight', ja: 'チタンの軽量モデル', en: 'Lightweight titanium' },
  { q: 'material=carbon', ja: 'カーボンケース', en: 'Carbon cases' },
  { q: 'movement=spring-drive', ja: 'スプリングドライブ', en: 'Spring Drive' },
  { q: 'tag=tourbillon', ja: 'トゥールビヨン', en: 'Tourbillons' },
  { q: 'tag=gmt', ja: 'GMT・2タイムゾーン', en: 'GMT watches' },
  { q: 'price=u5&price=5-10', ja: '10万円以下', en: 'Under ¥100k' },
  { q: 'case=u34&case=34-38', ja: '38mm以下の小ぶり', en: 'Under 38mm' },
  { q: 'tag=dress', ja: 'ドレスウォッチ', en: 'Dress watches' },
];

export default async function SearchPage({ params }: { params: Promise<{ lang: string }> }) {
  const lang = (await params).lang as Lang;
  const brands = getAllBrands().map((b) => ({ id: b.brand.id, ja: b.brand.name_ja, en: b.brand.name_en }));

  return (
    <div className="container">
      <nav className="breadcrumb">
        <Link href={`/${lang}/`}>{t(lang, 'breadcrumb_home')}</Link> › {t(lang, 'nav_search')}
      </nav>
      <div className="page-head">
        <h1>{t(lang, 'search_page_title')}</h1>
        <p className="page-sub">{t(lang, 'search_page_lead')}</p>
      </div>

      <div className="quick-picks">
        <span className="qp-label">{t(lang, 'quick_picks')}</span>
        {QUICK_PICKS.map((p) => (
          <Link key={p.q} href={`/${lang}/search/?${p.q}`} className="qp">
            {lang === 'ja' ? p.ja : p.en}
          </Link>
        ))}
      </div>

      {/* SearchExplorer は useSearchParams を使う。静的エクスポートでは
          Suspense 境界が無いとビルドが通らない */}
      <Suspense fallback={<p className="small-note">{t(lang, 'loading')}</p>}>
        <SearchExplorer lang={lang} brands={brands} />
      </Suspense>
    </div>
  );
}
