import Link from 'next/link';
import type { BrandInfo, SummaryEntry, WatchModel } from '@/lib/data';
import { formatJpy } from '@/lib/format';
import { imageUrl } from '@/lib/image';
import { t, type Lang } from '@/lib/i18n';
import { CASE_MATERIALS, MOVEMENTS, taxLabel } from '@/lib/taxonomy';

/**
 * モデルカード。
 *
 * カード全体をひとつのリンクにはできない。
 * 楽天ウェブサービス規約 第8条4項に
 *   「ウェブサービスを使用した部分において、楽天のサイト以外へのリンクを設けてはならない」
 * とあり、写真と価格は楽天から取得したものだからである。
 * これらを自サイトのページへ向けると規約違反になり、API利用停止＝サイトの中身が
 * 全部消えることになりかねない。
 *
 * そこで領域を分ける。
 *   写真・価格（楽天由来） → 出品ページへ
 *   ブランド名・モデル名・型番・仕様（自前のデータ） → 自サイトのモデルページへ
 * 結果として、買いたい人は写真か価格を、比べたい人は名前を押すことになる。
 */
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

  const modelHref = `/${lang}/watch/${brandId}/${model.id}/`;
  const offerUrl = lowest?.url ?? null;
  const badge = model.popular ? <span className="pc-badge">{t(lang, 'badge_popular')}</span> : null;

  const media = lowest?.image ? (
    <img src={imageUrl(lowest.image, 'card') ?? ''} alt={lang === 'ja' ? model.name_ja : model.name_en} loading="lazy" />
  ) : (
    <div className="pc-noimg">{brand.name_en}</div>
  );

  return (
    <div className="card product-card">
      {/* 写真は楽天・Yahoo!から取得したもの。出品ページ以外へは向けられない */}
      {offerUrl && lowest?.image ? (
        <a className="pc-media" href={offerUrl} target="_blank" rel="sponsored nofollow noopener">
          {media}
          {badge}
        </a>
      ) : (
        <div className="pc-media">
          {media}
          {badge}
        </div>
      )}

      <div className="pc-body">
        {/* ここは自前のカタログ情報なので、自サイトのモデルページへ向けてよい */}
        <Link href={modelHref} className="pc-link" prefetch={false}>
          <span className="card-brand">{lang === 'ja' ? brand.name_ja : brand.name_en}</span>
          <span className="card-name">{lang === 'ja' ? model.name_ja : model.name_en}</span>
          {model.reference && <span className="card-ref">Ref. {model.reference}</span>}
          {meta && <span className="pc-meta">{meta}</span>}
        </Link>

        {lowest ? (
          offerUrl ? (
            <a className="card-price" href={offerUrl} target="_blank" rel="sponsored nofollow noopener">
              {formatJpy(lowest.lowestPrice, lang)}
              <small>
                {t(lang, 'lowest_price')} ・ {lowest.offerCount}
                {t(lang, 'offer_count')}
                <span className="cp-go">{t(lang, `source_${lowest.source}`)} →</span>
              </small>
            </a>
          ) : (
            <div className="card-price">
              {formatJpy(lowest.lowestPrice, lang)}
              <small>
                {t(lang, 'lowest_price')} ・ {lowest.offerCount}
                {t(lang, 'offer_count')}
              </small>
            </div>
          )
        ) : (
          <Link href={modelHref} className="card-nodata" prefetch={false}>
            {t(lang, 'view_model')} →
          </Link>
        )}
      </div>
    </div>
  );
}
