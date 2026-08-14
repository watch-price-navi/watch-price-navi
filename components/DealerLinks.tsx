import type { Dealer } from '@/lib/data';
import { t, type Lang } from '@/lib/i18n';

/** eBay Partner Network のキャンペーンID。未設定なら素のリンクになる（報酬は発生しない） */
const EBAY_CAMPID = process.env.NEXT_PUBLIC_EBAY_CAMPID || '';

export default function DealerLinks({
  dealers,
  keyword,
  officialUrl,
  brandName,
  lang,
}: {
  dealers: Dealer[];
  keyword: string;
  officialUrl: string | null;
  brandName: string;
  lang: Lang;
}) {
  if (dealers.length === 0 && !officialUrl) return null;
  return (
    <div>
      <p className="small-note" style={{ marginBottom: 12 }}>
        {t(lang, 'dealers_note')}
      </p>
      <div className="dealer-grid">
        {dealers.map((d) => {
          let url = d.searchUrlTemplate
            ? d.searchUrlTemplate.replace('{q}', encodeURIComponent(keyword))
            : d.homepage;
          // 成果報酬のある提携先は、トラッキングIDを付けたうえで sponsored を明示する。
          // 提携IDは環境変数で渡す（未設定なら素のリンクとして機能する）
          if (d.affiliate && d.id === 'ebay' && EBAY_CAMPID) {
            url += `${url.includes('?') ? '&' : '?'}mkcid=1&mkrid=711-53200-19255-0&campid=${EBAY_CAMPID}&toolid=10001`;
          }
          return (
            <div className="dealer-card" key={d.id}>
              <b>
                {lang === 'ja' ? d.name_ja : d.name_en}
                {d.affiliate && <span className="dealer-ad">{t(lang, 'ad_label')}</span>}
              </b>
              <div className="dc-note">{lang === 'ja' ? d.note_ja : d.note_en}</div>
              <a
                className="btn btn-outline"
                href={url}
                target="_blank"
                rel={d.affiliate ? 'sponsored nofollow noopener' : 'nofollow noopener'}
              >
                {lang === 'ja' ? '在庫を確認する →' : 'Check availability →'}
              </a>
            </div>
          );
        })}
        {officialUrl && (
          <div className="dealer-card">
            <b>{brandName} {t(lang, 'official_site')}</b>
            <div className="dc-note">
              {lang === 'ja' ? 'メーカー公式サイト・正規販売店情報' : 'Official manufacturer site and authorized dealers'}
            </div>
            <a className="btn btn-outline" href={officialUrl} target="_blank" rel="nofollow noopener">
              {t(lang, 'official_site')} →
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
