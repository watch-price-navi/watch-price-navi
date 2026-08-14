import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import ModelCard from '@/components/ModelCard';
import { absUrl } from '@/lib/config';
import { getAllBrands, getBrand, getSummary } from '@/lib/data';
import { formatJpy } from '@/lib/format';
import { LANGS, t, type Lang } from '@/lib/i18n';
import { CASE_MATERIALS, MOVEMENTS, taxLabel } from '@/lib/taxonomy';

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

  const popular = cat.models.filter((m) => m.popular).slice(0, 8);

  // 全件を1ページに並べるとロレックスで1.4MBになり、スマホでは開くだけで一苦労になる。
  // 出品数の多い順（＝実際に流通している順）に絞り、残りは検索ページへ送る。
  const listed = [...cat.models]
    .sort((a, b) => {
      const oa = summary[`${cat.brand.id}/${a.id}`]?.offerCount ?? 0;
      const ob = summary[`${cat.brand.id}/${b.id}`]?.offerCount ?? 0;
      return (b.popular ? 1 : 0) - (a.popular ? 1 : 0) || ob - oa;
    })
    .slice(0, 60);
  const priced = cat.models
    .map((m) => summary[`${cat.brand.id}/${m.id}`]?.lowestPrice)
    .filter((p): p is number => typeof p === 'number');
  const rangeLow = priced.length ? Math.min(...priced) : null;
  const rangeHigh = priced.length ? Math.max(...priced) : null;

  return (
    <div className="container">
      <nav className="breadcrumb">
        <Link href={`/${lang}/`}>{t(lang, 'breadcrumb_home')}</Link> ›{' '}
        <Link href={`/${lang}/brands/`}>{t(lang, 'nav_brands')}</Link> › {cat.brand.name_en}
      </nav>
      <div className="page-head">
        <h1>{`${name}${t(lang, 'brand_models_title')}`}</h1>
        <div className="page-sub">
          {cat.brand.country}
          {cat.brand.founded ? ` ・ ${t(lang, 'founded')} ${cat.brand.founded}` : ''} ・ {cat.models.length}{' '}
          {t(lang, 'models_count')}
          {rangeLow != null && rangeHigh != null
            ? ` ・ ${t(lang, 'price_range')} ${formatJpy(rangeLow, lang)}〜${formatJpy(rangeHigh, lang)}`
            : ''}
        </div>
        <p className="brand-desc">{lang === 'ja' ? cat.brand.description_ja : cat.brand.description_en}</p>
        <div className="tag-row">
          <Link href={`/${lang}/search/?brand=${cat.brand.id}`} className="tag-pill">
            {t(lang, 'nav_search')}（{cat.brand.name_en}）→
          </Link>
        </div>
      </div>

      {popular.length > 0 && (
        <section className="section" style={{ paddingTop: 30 }}>
          <h2 className="section-title">{t(lang, 'popular_models')}</h2>
          <div className="grid grid-models">
            {popular.map((m) => (
              <ModelCard
                key={m.id}
                lang={lang}
                brandId={cat.brand.id}
                brand={cat.brand}
                model={m}
                lowest={summary[`${cat.brand.id}/${m.id}`] ?? null}
              />
            ))}
          </div>
        </section>
      )}

      <section className="section" style={{ paddingTop: 8 }}>
        <div className="section-head">
          <h2 className="section-title">
            {lang === 'ja' ? '主要モデル' : 'Key models'}
            <span className="section-count">
              {listed.length} / {cat.models.length}
            </span>
          </h2>
          <Link className="section-more" href={`/${lang}/search/?brand=${cat.brand.id}`}>
            {lang === 'ja' ? `${cat.models.length}件すべてを条件で絞る` : `Filter all ${cat.models.length}`} →
          </Link>
        </div>
        <div className="table-wrap">
          <table className="model-table">
            <thead>
              <tr>
                <th>{lang === 'ja' ? 'モデル' : 'Model'}</th>
                <th>{t(lang, 'spec_ref')}</th>
                <th>{t(lang, 'spec_case')}</th>
                <th>{t(lang, 'spec_material')}</th>
                <th>{t(lang, 'spec_movement')}</th>
                <th>{t(lang, 'lowest_price')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {listed.map((m) => {
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
                    <td>{taxLabel(CASE_MATERIALS, m.caseMaterial, lang)}</td>
                    <td>{taxLabel(MOVEMENTS, m.movementType, lang)}</td>
                    <td className="pt-price">{lowest ? formatJpy(lowest.lowestPrice, lang) : '–'}</td>
                    <td>
                      <Link className="btn btn-outline btn-sm" href={`/${lang}/watch/${cat.brand.id}/${m.id}/`}>
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
