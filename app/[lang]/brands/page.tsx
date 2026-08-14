import type { Metadata } from 'next';
import Link from 'next/link';
import { absUrl } from '@/lib/config';
import { getAllBrands } from '@/lib/data';
import { t, type Lang } from '@/lib/i18n';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const lang = (await params).lang as Lang;
  return {
    title: lang === 'ja' ? '腕時計ブランド一覧' : 'All Watch Brands',
    description:
      lang === 'ja'
        ? '取扱中の腕時計ブランド一覧。各ブランドのモデル別に最安値を毎日更新しています。'
        : 'All watch brands we track, with daily-updated lowest prices per model.',
    alternates: {
      canonical: absUrl(`/${lang}/brands/`),
      languages: { ja: absUrl('/ja/brands/'), en: absUrl('/en/brands/'), 'x-default': absUrl('/en/brands/') },
    },
  };
}

export default async function BrandsPage({ params }: { params: Promise<{ lang: string }> }) {
  const lang = (await params).lang as Lang;
  const brands = getAllBrands();
  return (
    <div className="container">
      <nav className="breadcrumb">
        <Link href={`/${lang}/`}>{t(lang, 'breadcrumb_home')}</Link> › {t(lang, 'nav_brands')}
      </nav>
      <div className="page-head">
        <h1>{t(lang, 'nav_brands')}</h1>
      </div>
      <section className="section" style={{ paddingTop: 20 }}>
        <div className="grid grid-brands">
          {brands.map((b) => (
            <Link key={b.brand.id} href={`/${lang}/brands/${b.brand.id}/`} className="card brand-card">
              <h3>{b.brand.name_en}</h3>
              <div className="bc-ja">{lang === 'ja' ? b.brand.name_ja : b.brand.country}</div>
              <div className="bc-meta">
                {b.brand.country}
                {b.brand.founded ? ` ・ ${t(lang, 'founded')} ${b.brand.founded}` : ''} ・ {b.models.length}{' '}
                {t(lang, 'models_count')}
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
