import type { Offer } from '@/lib/data';
import { formatDate, formatJpy } from '@/lib/format';
import { t, type Lang } from '@/lib/i18n';

function ConditionBadge({ condition, lang }: { condition: Offer['condition']; lang: Lang }) {
  const cls = condition === 'new' ? 'badge-new' : condition === 'used' ? 'badge-used' : 'badge-unknown';
  return <span className={`badge ${cls}`}>{t(lang, `condition_${condition}`)}</span>;
}

export default function PriceTable({
  offers,
  updatedAt,
  lang,
}: {
  offers: Offer[];
  updatedAt: string;
  lang: Lang;
}) {
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
            {offers.map((o, i) => (
              <tr key={`${o.source}-${o.shop}-${i}`} className={i === 0 ? 'best-row' : undefined}>
                <td className="pt-shop">
                  {i === 0 && <span className="badge badge-best">{t(lang, 'lowest_price')}</span>}{' '}
                  {o.shop}
                  <span className="pt-source">{t(lang, `source_${o.source}`)}</span>
                </td>
                <td>
                  <div className="pt-title">{o.title}</div>
                </td>
                <td>
                  <ConditionBadge condition={o.condition} lang={lang} />
                </td>
                <td className={`pt-price${i === 0 ? ' best' : ''}`}>{formatJpy(o.price, lang)}</td>
                <td>
                  <a
                    className={`btn btn-sm${i === 0 ? ' btn-deal' : ' btn-outline'}`}
                    href={o.url}
                    target="_blank"
                    rel="sponsored nofollow noopener"
                  >
                    {t(lang, 'buy_at')}
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small-note">
        {t(lang, 'updated')}: {formatDate(updatedAt, lang)} ／ {t(lang, 'price_note')}
      </p>
    </div>
  );
}
