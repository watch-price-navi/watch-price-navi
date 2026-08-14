import Link from 'next/link';
import type { BrandInfo, SummaryEntry, WatchModel } from '@/lib/data';
import { formatJpy } from '@/lib/format';
import { imageUrl } from '@/lib/image';
import { t, type Lang } from '@/lib/i18n';
import { CASE_MATERIALS, MOVEMENTS, taxLabel } from '@/lib/taxonomy';

export default function ModelCard({
  lang,
  brandId,
  brand,
  model,
  lowest,
}: {
  lang: Lang;
  brandId: string;
  brand: BrandInfo;
  model: WatchModel;
  lowest: SummaryEntry | null;
}) {
  const meta = [
    model.caseSizeMm ? `${model.caseSizeMm}mm` : null,
    model.caseMaterial ? taxLabel(CASE_MATERIALS, model.caseMaterial, lang) : null,
    model.movementType ? taxLabel(MOVEMENTS, model.movementType, lang) : null,
  ]
    .filter(Boolean)
    .join(' ・ ');

  return (
    <Link href={`/${lang}/watch/${brandId}/${model.id}/`} className="card product-card" prefetch={false}>
      <div className="pc-media">
        {lowest?.image ? (
          <img
            src={imageUrl(lowest.image, 'card') ?? ''}
            alt={lang === 'ja' ? model.name_ja : model.name_en}
            loading="lazy"
          />
        ) : (
          <div className="pc-noimg">{brand.name_en}</div>
        )}
        {model.popular && <span className="pc-badge">{t(lang, 'badge_popular')}</span>}
      </div>
      <div className="pc-body">
        <div className="card-brand">{lang === 'ja' ? brand.name_ja : brand.name_en}</div>
        <div className="card-name">{lang === 'ja' ? model.name_ja : model.name_en}</div>
        {model.reference && <div className="card-ref">Ref. {model.reference}</div>}
        {meta && <div className="pc-meta">{meta}</div>}
        {lowest ? (
          <div className="card-price">
            {formatJpy(lowest.lowestPrice, lang)}
            <small>
              {t(lang, 'lowest_price')} ・ {lowest.offerCount}
              {t(lang, 'offer_count')}
            </small>
          </div>
        ) : (
          <div className="card-nodata">{t(lang, 'view_model')} →</div>
        )}
      </div>
    </Link>
  );
}
