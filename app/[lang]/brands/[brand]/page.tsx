import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { absUrl } from '@/lib/config';
import { getAllBrands, getBrand, getSummary } from '@/lib/data';
import { formatJpy } from '@/lib/format';
import { LANGS, t, type Lang } from '@/lib/i18n';

export const dynamicParams = false;

export function generateStaticParams() {
  return LANGS.flatMap((lang) => getAllBrands().map((b) => ({ lang, brand: b.brand.id })));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; brand: string }>;
}): Promise<Metadata> {
  const { lang: langStr, brand: brandId } = await params;
  const lang = langStr as Lang;
  const cat = getBrand(brandId);
  if (!cat) return {};
  const name = lang === 'ja' ? cat.brand.name_ja : cat.brand.name_en;
  return {
    title:
      lang === 'ja'
        ? `${name}（${cat.brand.name_en}）の価格比較・最安値一覧`
        : `${name} Watches — Price Comparison & Lowest Prices`,
    description:
      lang === 'ja'
        ? `${name}の人気モデル${cat.models.length}本の最安値を毎日自動更新。楽天市場・Yahoo!ショッピングの価格を横断比較できます。`
        : `Daily-updated lowest prices for ${cat.models.length} popular ${cat.brand.name_en} models across Rakuten and Yahoo! Shopping Japan.`,
    alternates: {
      canonical: absUrl(`/${lang}/brands/${brandId}/`),
      languages: {
        ja: absUrl(`/ja/brands/${brandId}/`),
        en: absUrl(`/en/brands/${brandId}/`),
        'x-default': absUrl(`/ja/brands/${brandId}/`),
      },
    },
  };
}

export default async function BrandPage({ params }: { params: Promise<{ lang: string; brand: string }> }) {
  const { lang: langStr, brand: brandId } = await params;
  const lang = langStr as Lang;
  const cat = getBrand(brandId);
  if (!cat) notFound();
  const summary = getSummary();
  const name = lang === 'ja' ? cat.brand.name_ja : cat.brand.name_en;

  return (
    <div className="container">
      <nav className="breadcrumb">
        <Link href={`/${lang}/`}>{t(lang, 'breadcrumb_home')}</Link> ›{' '}
        <Link href={`/${lang}/brands/`}>{t(lang, 'nav_brands')}</Link> › {cat.brand.name_en}
      </nav>
      <div className="page-head">
        <h1>
          {lang === 'ja' ? `${name}${t(lang, 'brand_models_title')}` : `${name}${t(lang, 'brand_models_title')}`}
        </h1>
        <div className="page-sub">
          {cat.brand.country}
          {cat.brand.founded ? ` ・ ${t(lang, 'founded')} ${cat.brand.founded}` : ''}
        </div>
        <p className="brand-desc">{lang === 'ja' ? cat.brand.description_ja : cat.brand.description_en}</p>
      </div>

      <section className="section" style={{ paddingTop: 24 }}>
        <div className="table-wrap">
          <table className="model-table">
            <thead>
              <tr>
                <th>{lang === 'ja' ? 'モデル' : 'Model'}</th>
                <th>{t(lang, 'spec_ref')}</th>
                <th>{t(lang, 'spec_case')}</th>
                <th>{t(lang, 'spec_movement')}</th>
                <th>{t(lang, 'lowest_price')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {cat.models.map((m) => {
                const lowest = summary[`${cat.brand.id}/${m.id}`];
                return (
                  <tr key={m.id}>
                    <td>
                      <Link href={`/${lang}/watch/${cat.brand.id}/${m.id}/`} style={{ fontWeight: 600 }}>
                        {lang === 'ja' ? m.name_ja : m.name_en}
                      </Link>
                    </td>
                    <td>{m.reference ?? '–'}</td>
                    <td>{m.caseSizeMm ? `${m.caseSizeMm}mm` : '–'}</td>
                    <td>{m.movementType ? t(lang, `mv_${m.movementType}`) : '–'}</td>
                    <td className="pt-price">{lowest ? formatJpy(lowest.lowestPrice, lang) : '–'}</td>
                    <td>
                      <Link className="btn btn-outline" href={`/${lang}/watch/${cat.brand.id}/${m.id}/`}>
                        {t(lang, 'view_model')}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
