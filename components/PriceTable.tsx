import type { EbayOffer, Offer } from '@/lib/data';
import { formatDate, formatJpy } from '@/lib/format';
import { t, type Lang } from '@/lib/i18n';

function ConditionBadge({ condition, lang }: { condition: Offer['condition']; lang: Lang }) {
  const cls = condition === 'new' ? 'badge-new' : condition === 'used' ? 'badge-used' : 'badge-unknown';
  return <span className={`badge ${cls}`}>{t(lang, `condition_${condition}`)}</span>;
}

/*
 * 国内の店とeBay（海外）を同じ表に並べる（2026-08-19、運営の指示）。
 * ただし正直さは落とさない:
 *   - eBay行の円価格は概算（≈印）で、元のドル価格も並記する
 *   - 表の下に、取り寄せには送料・関税・輸入消費税が乗る旨を必ず出す
 *   - 「最安値」バッジは国内の行にだけ付ける。サイト全体の「最安値」は
 *     国内の値で数えているので、eBay行に付けると上の価格パネルと食い違う
 *
 * 楽天ウェブサービス規約 第8条4項について:
 * この表は行ごとに完結している（楽天の行は楽天のデータだけを出し楽天へリンクする）。
 * Yahoo!の行を混ぜている従来の解釈と同じで、eBayの行も自分のデータだけを出す。
 */
type Row =
  | { kind: 'domestic'; jpy: number; o: Offer }
  | { kind: 'ebay'; jpy: number; e: EbayOffer };

export default function PriceTable({
  offers,
  ebayOffers = [],
  ebayRate = null,
  updatedAt,
  lang,
}: {
  offers: Offer[];
  ebayOffers?: EbayOffer[];
  ebayRate?: number | null;
  updatedAt: string;
  lang: Lang;
}) {
  const rows: Row[] = [
    ...offers.map((o): Row => ({ kind: 'domestic', jpy: o.price, o })),
    // 円換算できなかった出品は並べようがないので出さない（レート取得失敗時のみ）
    ...ebayOffers
      .filter((e) => e.priceJpy != null)
      .map((e): Row => ({ kind: 'ebay', jpy: e.priceJpy as number, e })),
  ].sort((a, b) => a.jpy - b.jpy);

  const bestDomestic = rows.findIndex((r) => r.kind === 'domestic');
  const hasEbay = rows.some((r) => r.kind === 'ebay');

  return (
    <div>
      <div className="table-wrap">
        <table className="price-table">
          <thead>
            <tr>
              <th>{t(lang, 'offers_col_shop')}</th>
              <th>{t(lang, 'offers_col_item')}</th>
              <th>{t(lang, 'offers_col_cond')}</th>
              <th>{t(lang, 'offers_col_price')}</th>
              <th>{t(lang, 'offers_col_link')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) =>
              r.kind === 'domestic' ? (
                <tr key={`${r.o.source}-${r.o.shop}-${i}`} className={i === bestDomestic ? 'best-row' : undefined}>
                  <td className="pt-shop">
                    {i === bestDomestic && <span className="badge badge-best">{t(lang, 'lowest_price')}</span>}{' '}
                    {r.o.shop}
                    <span className="pt-source">{t(lang, `source_${r.o.source}`)}</span>
                  </td>
                  <td>
                    <div className="pt-title">{r.o.title}</div>
                  </td>
                  <td>
                    <ConditionBadge condition={r.o.condition} lang={lang} />
                  </td>
                  <td className={`pt-price${i === bestDomestic ? ' best' : ''}`}>{formatJpy(r.o.price, lang)}</td>
                  <td>
                    <a
                      className={`btn btn-sm${i === bestDomestic ? ' btn-deal' : ' btn-outline'}`}
                      href={r.o.url}
                      target="_blank"
                      rel="sponsored nofollow noopener"
                    >
                      {t(lang, 'buy_at')}
                    </a>
                  </td>
                </tr>
              ) : (
                <tr key={`ebay-${i}`}>
                  <td className="pt-shop">
                    eBay
                    <span className="pt-source">
                      {t(lang, 'source_ebay_tag')}
                      {r.e.country ? `・${r.e.country}` : ''}
                    </span>
                  </td>
                  <td>
                    <div className="pt-title">{r.e.title}</div>
                  </td>
                  <td>
                    <ConditionBadge condition={r.e.condition} lang={lang} />
                  </td>
                  <td className="pt-price">
                    ≈{formatJpy(r.jpy, lang)}
                    <span className="pt-source">
                      {r.e.currency === 'USD'
                        ? `$${r.e.price.toLocaleString('en-US')}`
                        : `${r.e.currency} ${r.e.price.toLocaleString('en-US')}`}
                    </span>
                  </td>
                  <td>
                    <a className="btn btn-sm btn-outline" href={r.e.url} target="_blank" rel="sponsored nofollow noopener">
                      {t(lang, 'ebay_view')}
                    </a>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
      <p className="small-note">
        {t(lang, 'updated')}: {formatDate(updatedAt, lang)} ／ {t(lang, 'price_note')}
      </p>
      {hasEbay && (
        <p className="small-note">
          {ebayRate
            ? lang === 'ja'
              ? `eBay行の円価格は 1ドル=約${ebayRate}円 での概算です。`
              : `Yen prices on eBay rows are approximate, converted at ≈¥${ebayRate}/USD. `
            : ''}
          {t(lang, 'ebay_note')}
        </p>
      )}
    </div>
  );
}
