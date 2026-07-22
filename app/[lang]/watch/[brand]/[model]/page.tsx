import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import AdSlot from '@/components/AdSlot';
import DealerLinks from '@/components/DealerLinks';
import PriceTable from '@/components/PriceTable';
import { absUrl } from '@/lib/config';
import { getAllBrands, getBrand, getDealers, getModel, getPriceData, getSummary } from '@/lib/data';
import { formatJpy } from '@/lib/format';
import { LANGS, t, type Lang } from '@/lib/i18n';

export const dynamicParams = false;

export function generateStaticParams() {
  return LANGS.flatMap((lang) =>
    getAllBrands().flatMap((b) => b.models.map((m) => ({ lang, brand: b.brand.id, model: m.id })))
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; brand: string; model: string }>;
}): Promise<Metadata> {
  const { lang: langStr, brand: brandId, model: modelId } = await params;
  const lang = langStr as Lang;
  const found = getModel(brandId, modelId);
  if (!found) return {};
  const { brand, model } = found;
  const bName = lang === 'ja' ? brand.name_ja : brand.name_en;
  const mName = lang === 'ja' ? model.name_ja : model.name_en;
  const ref = model.reference ? ` ${model.reference}` : '';
  const lowest = getSummary()[`${brandId}/${modelId}`];
  const priceStr = lowest ? formatJpy(lowest.lowestPrice, lang) : null;
  return {
    title:
      lang === 'ja'
        ? `${bName} ${mName} の最安値${priceStr ? `（${priceStr}〜）` : ''}・価格比較`
        : `${bName} ${mName}${ref} — Lowest Price${priceStr ? ` from ${priceStr}` : ''} & Comparison`,
    description:
      lang === 'ja'
        ? `${bName} ${mName}${ref} の新品・中古価格を楽天市場・Yahoo!ショッピングから毎日自動収集。${model.summary_ja}`
        : `Daily-updated new & pre-owned prices for the ${bName} ${mName}${ref} from Rakuten and Yahoo! Shopping Japan. ${model.summary_en}`,
    alternates: {
      canonical: absUrl(`/${lang}/watch/${brandId}/${modelId}/`),
      languages: {
        ja: absUrl(`/ja/watch/${brandId}/${modelId}/`),
        en: absUrl(`/en/watch/${brandId}/${modelId}/`),
        'x-default': absUrl(`/ja/watch/${brandId}/${modelId}/`),
      },
    },
  };
}

export default async function ModelPage({
  params,
}: {
  params: Promise<{ lang: string; brand: string; model: string }>;
}) {
  const { lang: langStr, brand: brandId, model: modelId } = await params;
  const lang = langStr as Lang;
  const found = getModel(brandId, modelId);
  if (!found) notFound();
  const { brand, model } = found;
  const cat = getBrand(brandId)!;
  const prices = getPriceData(brandId, modelId);
  const dealers = getDealers();
  const bName = lang === 'ja' ? brand.name_ja : brand.name_en;
  const mName = lang === 'ja' ? model.name_ja : model.name_en;
  const offers = prices?.offers ?? [];

  const related = cat.models
    .filter((m) => m.id !== model.id && m.collection_en && m.collection_en === model.collection_en)
    .slice(0, 4);

  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: `${brand.name_en} ${model.name_en}`,
    brand: { '@type': 'Brand', name: brand.name_en },
    description: lang === 'ja' ? model.summary_ja : model.summary_en,
    ...(model.reference ? { model: model.reference, mpn: model.reference } : {}),
    ...(offers.length > 0
      ? {
          offers: {
            '@type': 'AggregateOffer',
            priceCurrency: 'JPY',
            lowPrice: offers[0].price,
            highPrice: offers[offers.length - 1].price,
            offerCount: offers.length,
            availability: 'https://schema.org/InStock',
          },
        }
      : {}),
  };

  return (
    <div className="container">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <nav className="breadcrumb">
        <Link href={`/${lang}/`}>{t(lang, 'breadcrumb_home')}</Link> ›{' '}
        <Link href={`/${lang}/brands/`}>{t(lang, 'nav_brands')}</Link> ›{' '}
        <Link href={`/${lang}/brands/${brandId}/`}>{brand.name_en}</Link> › {mName}
      </nav>
      <div className="page-head">
        <h1>
          {bName} {mName}
          {model.reference ? ` ${model.reference}` : ''}
        </h1>
        <p className="page-sub">{lang === 'ja' ? model.summary_ja : model.summary_en}</p>
      </div>

      <section className="section" style={{ paddingTop: 20 }}>
        <h2 className="section-title">{t(lang, 'spec_title')}</h2>
        <dl className="spec-grid">
          <div className="spec">
            <dt>{t(lang, 'spec_ref')}</dt>
            <dd>{model.reference ?? '–'}</dd>
          </div>
          <div className="spec">
            <dt>{t(lang, 'spec_collection')}</dt>
            <dd>{(lang === 'ja' ? model.collection_ja : model.collection_en) ?? '–'}</dd>
          </div>
          <div className="spec">
            <dt>{t(lang, 'spec_case')}</dt>
            <dd>{model.caseSizeMm ? `${model.caseSizeMm}mm` : '–'}</dd>
          </div>
          <div className="spec">
            <dt>{t(lang, 'spec_movement')}</dt>
            <dd>{model.movementType ? t(lang, `mv_${model.movementType}`) : '–'}</dd>
          </div>
          <div className="spec">
            <dt>{t(lang, 'spec_caliber')}</dt>
            <dd>{model.caliber ?? '–'}</dd>
          </div>
          <div className="spec">
            <dt>{t(lang, 'spec_list_price')}</dt>
            <dd>{model.listPriceJpy ? formatJpy(model.listPriceJpy, lang) : '–'}</dd>
          </div>
        </dl>
      </section>

      <section className="section" style={{ paddingTop: 8 }}>
        <h2 className="section-title">{t(lang, 'offers_title')}</h2>
        {offers.length > 0 && prices ? (
          <PriceTable offers={offers} updatedAt={prices.updatedAt} lang={lang} />
        ) : (
          <div className="notice notice-empty">
            <b>{t(lang, 'no_prices_title')}</b>
            {t(lang, 'no_prices_body')}
          </div>
        )}
      </section>

      <AdSlot />

      <section className="section" style={{ paddingTop: 8 }}>
        <h2 className="section-title">{t(lang, 'dealers_title')}</h2>
        <DealerLinks
          dealers={dealers}
          keyword={model.reference ?? (lang === 'ja' ? model.searchKeywordJa : model.searchKeywordEn)}
          officialUrl={brand.officialUrl}
          brandName={bName}
          lang={lang}
        />
      </section>

      {related.length > 0 && (
        <section className="section" style={{ paddingTop: 8 }}>
          <h2 className="section-title">{t(lang, 'related_models')}</h2>
          <div className="grid grid-models">
            {related.map((m) => (
              <Link key={m.id} href={`/${lang}/watch/${brandId}/${m.id}/`} className="card">
                <div className="card-brand">{bName}</div>
                <div className="card-name">{lang === 'ja' ? m.name_ja : m.name_en}</div>
                {m.reference && <div className="card-ref">Ref. {m.reference}</div>}
                <div className="card-nodata">{t(lang, 'view_model')} →</div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
