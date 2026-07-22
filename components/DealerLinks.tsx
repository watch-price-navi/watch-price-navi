import type { Dealer } from '@/lib/data';
import { t, type Lang } from '@/lib/i18n';

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
          const url = d.searchUrlTemplate
            ? d.searchUrlTemplate.replace('{q}', encodeURIComponent(keyword))
            : d.homepage;
          return (
            <div className="dealer-card" key={d.id}>
              <b>{lang === 'ja' ? d.name_ja : d.name_en}</b>
              <div className="dc-note">{lang === 'ja' ? d.note_ja : d.note_en}</div>
              <a className="btn btn-outline" href={url} target="_blank" rel="nofollow noopener">
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
