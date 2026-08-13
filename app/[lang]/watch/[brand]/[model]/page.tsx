import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import AdSlot from '@/components/AdSlot';
import DealerLinks from '@/components/DealerLinks';
import ModelCard from '@/components/ModelCard';
import PriceTable from '@/components/PriceTable';
import { absUrl } from '@/lib/config';
import { getAllBrands, getBrand, getDealers, getModel, getPriceData, getSummary } from '@/lib/data';
import { formatDate, formatJpy } from '@/lib/format';
import { LANGS, t, type Lang } from '@/lib/i18n';
import { CASE_MATERIALS, GENDERS, MOVEMENTS, TAGS, taxLabel } from '@/lib/taxonomy';

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
        ? `${bName} ${mName}${ref} の最安値${priceStr ? ` ${priceStr}〜` : ''}｜価格比較`
        : `${bName} ${mName}${ref} — Lowest Price${priceStr ? ` from ${priceStr}` : ''}`,
    description:
      lang === 'ja'
        ? `${bName} ${mName}${ref} の新品・中古価格を楽天市場・Yahoo!ショッピングから毎日自動収集し最安値を掲載。${model.summary_ja}`
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
  const summary = getSummary();
  const lowest = summary[`${brandId}/${modelId}`] ?? null;
  const dealers = getDealers();
  const bName = lang === 'ja' ? brand.name_ja : brand.name_en;
  const mName = lang === 'ja' ? model.name_ja : model.name_en;
  const offers = prices?.offers ?? [];
  const bestOffer = offers[0] ?? null;

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
    ...(lowest?.image ? { image: lowest.image } : {}),
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

  // 「似た条件のモデルを探す」用の検索リンク
  const similarQuery = [
    model.tags[0] ? `tag=${model.tags[0]}` : null,
    model.caseMaterial ? `material=${model.caseMaterial}` : null,
    model.movementType ? `movement=${model.movementType}` : null,
  ]
    .filter(Boolean)
    .join('&');

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

      <section className="model-hero">
        <div className="mh-image">
          {lowest?.image ? (
            <img src={lowest.image} alt={`${bName} ${mName}`} />
          ) : (
            <div className="pc-noimg">{brand.name_en}</div>
          )}
        </div>

        <div className="price-panel">
          {lowest && bestOffer ? (
            <>
              <div className="pp-label">{t(lang, 'lowest_price')}</div>
              <div className="pp-main">{formatJpy(lowest.lowestPrice, lang)}</div>
              <div className="pp-sub">
                {bestOffer.shop}（{t(lang, `source_${bestOffer.source}`)}） ・ {lowest.offerCount}
                {t(lang, 'offer_count')} ・ {t(lang, 'updated')} {formatDate(lowest.updatedAt, lang)}
              </div>

              <dl className="pp-split">
                <div>
                  <dt>{t(lang, 'lowest_new')}</dt>
                  {lowest.lowestNew != null ? (
                    <dd>{formatJpy(lowest.lowestNew, lang)}</dd>
                  ) : (
                    <dd className="na">{lang === 'ja' ? '出品なし' : 'No listings'}</dd>
                  )}
                </div>
                <div>
                  <dt>{t(lang, 'lowest_used')}</dt>
                  {lowest.lowestUsed != null ? (
                    <dd>{formatJpy(lowest.lowestUsed, lang)}</dd>
                  ) : (
                    <dd className="na">{lang === 'ja' ? '出品なし' : 'No listings'}</dd>
                  )}
                </div>
              </dl>

              <div className="pp-actions">
                <a className="btn btn-deal" href={bestOffer.url} target="_blank" rel="sponsored nofollow noopener">
                  {t(lang, 'cta_check_price')} →
                </a>
                <a className="btn btn-outline" href="#offers">
                  {t(lang, 'offers_title')}
                </a>
              </div>
              <p className="pp-note">{t(lang, 'price_note')}</p>
            </>
          ) : (
            <div className="pp-empty">
              <b>{t(lang, 'no_prices_title')}</b>
              <p>{t(lang, 'no_prices_body')}</p>
              <div className="pp-actions" style={{ justifyContent: 'center', marginTop: 16 }}>
                <a className="btn btn-outline" href="#dealers">
                  {t(lang, 'dealers_title')}
                </a>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="section" style={{ paddingTop: 34 }}>
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
            <dt>{t(lang, 'spec_material')}</dt>
            <dd>{taxLabel(CASE_MATERIALS, model.caseMaterial, lang)}</dd>
          </div>
          <div className="spec">
            <dt>{t(lang, 'spec_movement')}</dt>
            <dd>{taxLabel(MOVEMENTS, model.movementType, lang)}</dd>
          </div>
          <div className="spec">
            <dt>{t(lang, 'spec_caliber')}</dt>
            <dd>{model.caliber ?? '–'}</dd>
          </div>
          <div className="spec">
            <dt>{t(lang, 'spec_wr')}</dt>
            <dd>{model.waterResistanceM ? `${model.waterResistanceM}m` : '–'}</dd>
          </div>
          <div className="spec">
            <dt>{t(lang, 'spec_gender')}</dt>
            <dd>{taxLabel(GENDERS, model.gender, lang)}</dd>
          </div>
          <div className="spec">
            <dt>{t(lang, 'spec_release')}</dt>
            <dd>{model.releaseYear ?? '–'}</dd>
          </div>
          <div className="spec">
            <dt>{t(lang, 'spec_list_price')}</dt>
            <dd>{model.listPriceJpy ? formatJpy(model.listPriceJpy, lang) : '–'}</dd>
          </div>
        </dl>

        {model.source === 'auto' && (
          <p className="small-note" style={{ marginTop: 14 }}>
            {t(lang, 'auto_sourced')}
          </p>
        )}

        {model.tags.length > 0 && (
          <div className="tag-row">
            {model.tags.map((tag) => (
              <Link key={tag} href={`/${lang}/search/?tag=${tag}`} className="tag-pill">
                {taxLabel(TAGS, tag, lang)}
              </Link>
            ))}
            {similarQuery && (
              <Link href={`/${lang}/search/?${similarQuery}`} className="tag-pill">
                {t(lang, 'find_similar')} →
              </Link>
            )}
          </div>
        )}
      </section>

      <section className="section" id="offers" style={{ paddingTop: 8, scrollMarginTop: 80 }}>
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

      <section className="section" id="dealers" style={{ paddingTop: 8, scrollMarginTop: 80 }}>
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
              <ModelCard
                key={m.id}
                lang={lang}
                brandId={brandId}
                brand={brand}
                model={m}
                lowest={summary[`${brandId}/${m.id}`] ?? null}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
